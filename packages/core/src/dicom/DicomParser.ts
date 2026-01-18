import type { DicomDataset, DicomElement, DicomTag } from './types';

// 긴 형식을 사용하는 VR 목록
const LONG_VRS = ['OB', 'OD', 'OF', 'OL', 'OW', 'SQ', 'UC', 'UN', 'UR', 'UT'];

/**
 * 태그를 문자열로 변환 (예: "00280010")
 */
function tagToString(tag: DicomTag): string {
  const group = tag.group.toString(16).padStart(4, '0');
  const element = tag.element.toString(16).padStart(4, '0');
  return `${group}${element}`.toUpperCase();
}

/**
 * DICOM 파일인지 확인
 */
export function isDicomFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 132) {
    return false;
  }

  const view = new DataView(buffer);

  const d = view.getUint8(128);
  const i = view.getUint8(129);
  const c = view.getUint8(130);
  const m = view.getUint8(131);

  if (d === 68 && i === 73 && c === 67 && m === 77) {
    return true;
  }

  const firstGroup = view.getUint16(0, true);
  if (firstGroup === 0x0002 || firstGroup === 0x0008) {
    return true;
  }

  return false;
}

/**
 * DICOM 파일 파싱
 */
export function parseDicom(buffer: ArrayBuffer): DicomDataset {
  if (!isDicomFile(buffer)) {
    throw new Error('Not a valid DICOM file');
  }

  const view = new DataView(buffer);
  const elements = new Map<string, DicomElement>();

  // DICM prefix 이후부터 시작 (offset 132)
  let offset = 132;

  // Transfer Syntax와 Pixel Data 위치 저장용
  let transferSyntax: string | undefined;
  let pixelDataOffset: number | undefined;

  // 파일 끝까지 태그 파싱
  while (offset < buffer.byteLength - 8) {
    // 태그 읽기 (4 bytes)
    const group = view.getUint16(offset, true);
    const element = view.getUint16(offset + 2, true);
    const tag: DicomTag = { group, element };
    const tagStr = tagToString(tag);

    offset += 4;

    // Pixel Data 태그 발견 시 위치만 저장하고 종료
    if (group === 0x7fe0 && element === 0x0010) {
      pixelDataOffset = offset;
      break;
    }

    // VR 읽기 (2 bytes)
    const vr = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1));
    offset += 2;

    // 길이 읽기 (VR에 따라 다름)
    let length: number;

    if (LONG_VRS.includes(vr)) {
      // 긴 형식: 2바이트 예약 + 4바이트 길이
      offset += 2; // 예약 필드 건너뛰기
      length = view.getUint32(offset, true);
      offset += 4;
    } else {
      // 짧은 형식: 2바이트 길이
      length = view.getUint16(offset, true);
      offset += 2;
    }

    // 요소 저장
    const elem: DicomElement = {
      tag,
      vr,
      length,
      offset,
    };

    elements.set(tagStr, elem);

    // Transfer Syntax UID 추출 (0002,0010)
    if (group === 0x0002 && element === 0x0010 && length > 0) {
      const bytes = new Uint8Array(buffer, offset, length);
      transferSyntax = String.fromCharCode(...bytes)
        .replace(/\0/g, '')
        .trim();
    }

    // 다음 요소로 이동
    if (length === 0xffffffff) {
      // Undefined length - 시퀀스 등에서 사용, 여기서는 중단
      break;
    }

    offset += length;
  }

  return {
    elements,
    transferSyntax,
    pixelDataOffset,
  };
}

/**
 * 태그에서 Unsigned Short (US) 값 추출
 */
export function getUint16Value(
  buffer: ArrayBuffer,
  dataset: DicomDataset,
  tagStr: string,
): number | undefined {
  const elem = dataset.elements.get(tagStr);
  if (!elem || elem.length < 2) {
    return undefined;
  }
  const view = new DataView(buffer);
  return view.getUint16(elem.offset, true);
}

/**
 * 태그에서 문자열 값 추출
 */
export function getStringValue(
  buffer: ArrayBuffer,
  dataset: DicomDataset,
  tagStr: string,
): string | undefined {
  const elem = dataset.elements.get(tagStr);
  if (!elem || elem.length === 0) {
    return undefined;
  }
  const bytes = new Uint8Array(buffer, elem.offset, elem.length);
  return String.fromCharCode(...bytes)
    .replace(/\0/g, '')
    .trim();
}

/**
 * 이미지 렌더링에 필요한 기본 정보 추출
 */
export interface DicomImageInfo {
  rows: number;
  columns: number;
  bitsAllocated: number;
  bitsStored: number;
  highBit: number;
  pixelRepresentation: number;
  photometricInterpretation: string;
  samplesPerPixel: number;
}

export function getImageInfo(
  buffer: ArrayBuffer,
  dataset: DicomDataset,
): DicomImageInfo | undefined {
  const rows = getUint16Value(buffer, dataset, '00280010');
  const columns = getUint16Value(buffer, dataset, '00280011');
  const bitsAllocated = getUint16Value(buffer, dataset, '00280100');

  if (rows === undefined || columns === undefined || bitsAllocated === undefined) {
    return undefined;
  }

  return {
    rows,
    columns,
    bitsAllocated,
    bitsStored: getUint16Value(buffer, dataset, '00280101') ?? bitsAllocated,
    highBit: getUint16Value(buffer, dataset, '00280102') ?? bitsAllocated - 1,
    pixelRepresentation: getUint16Value(buffer, dataset, '00280103') ?? 0,
    photometricInterpretation: getStringValue(buffer, dataset, '00280004') ?? 'MONOCHROME2',
    samplesPerPixel: getUint16Value(buffer, dataset, '00280002') ?? 1,
  };
}
