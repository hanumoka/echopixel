import type { DicomDataset, DicomElement, DicomTag, PixelDataInfo } from './types';

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
/**
 * Transfer Syntax가 압축(Encapsulated)인지 확인
 */
export function isEncapsulated(transferSyntax: string | undefined): boolean {
  if (!transferSyntax) return false;

  // 압축 Transfer Syntax들 (JPEG, JPEG2000, JPEG-LS, RLE 등)
  const encapsulatedPrefixes = [
    '1.2.840.10008.1.2.4', // JPEG 계열
    '1.2.840.10008.1.2.5', // RLE
  ];

  return encapsulatedPrefixes.some((prefix) => transferSyntax.startsWith(prefix));
}

/**
 * Transfer Syntax UID를 읽기 쉬운 문자열로 변환
 */
export function getTransferSyntaxName(transferSyntax: string | undefined): string {
  if (!transferSyntax) return 'Unknown';

  const transferSyntaxMap: Record<string, string> = {
    // 비압축 (Native)
    '1.2.840.10008.1.2': 'Implicit VR Little Endian',
    '1.2.840.10008.1.2.1': 'Explicit VR Little Endian',
    '1.2.840.10008.1.2.1.99': 'Deflated Explicit VR Little Endian',
    '1.2.840.10008.1.2.2': 'Explicit VR Big Endian',

    // JPEG Lossy
    '1.2.840.10008.1.2.4.50': 'JPEG Baseline (Lossy)',
    '1.2.840.10008.1.2.4.51': 'JPEG Extended (Lossy)',
    '1.2.840.10008.1.2.4.57': 'JPEG Lossless',
    '1.2.840.10008.1.2.4.70': 'JPEG Lossless SV1',

    // JPEG-LS
    '1.2.840.10008.1.2.4.80': 'JPEG-LS Lossless',
    '1.2.840.10008.1.2.4.81': 'JPEG-LS Near-Lossless',

    // JPEG 2000
    '1.2.840.10008.1.2.4.90': 'JPEG 2000 Lossless',
    '1.2.840.10008.1.2.4.91': 'JPEG 2000 Lossy',

    // MPEG / H.264
    '1.2.840.10008.1.2.4.100': 'MPEG2 Main Profile',
    '1.2.840.10008.1.2.4.101': 'MPEG2 High Profile',
    '1.2.840.10008.1.2.4.102': 'MPEG-4 AVC/H.264',
    '1.2.840.10008.1.2.4.103': 'MPEG-4 AVC/H.264 BD',
    '1.2.840.10008.1.2.4.104': 'MPEG-4 AVC/H.264 High',
    '1.2.840.10008.1.2.4.105': 'MPEG-4 AVC/H.264 High BD',
    '1.2.840.10008.1.2.4.106': 'MPEG-4 AVC/H.264 Stereo',

    // HEVC / H.265
    '1.2.840.10008.1.2.4.107': 'HEVC/H.265 Main',
    '1.2.840.10008.1.2.4.108': 'HEVC/H.265 Main 10',

    // RLE
    '1.2.840.10008.1.2.5': 'RLE Lossless',

    // HTJ2K (High-Throughput JPEG 2000)
    '1.2.840.10008.1.2.4.201': 'HTJ2K Lossless',
    '1.2.840.10008.1.2.4.202': 'HTJ2K Lossless RPCL',
    '1.2.840.10008.1.2.4.203': 'HTJ2K Lossy',
  };

  return transferSyntaxMap[transferSyntax] || `Unknown (${transferSyntax})`;
}

/**
 * 픽셀 데이터 추출
 */
export function extractPixelData(
  buffer: ArrayBuffer,
  dataset: DicomDataset,
): PixelDataInfo | undefined {
  if (dataset.pixelDataOffset === undefined) {
    return undefined;
  }

  const view = new DataView(buffer);
  let offset = dataset.pixelDataOffset;

  // VR 읽기 (OB 또는 OW)
  const vr = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1));
  offset += 2;

  // 길이 읽기
  let length: number;
  if (vr === 'OB' || vr === 'OW') {
    offset += 2; // 예약 필드
    length = view.getUint32(offset, true);
    offset += 4;
  } else {
    // Implicit VR인 경우 (VR 없이 바로 길이)
    offset = dataset.pixelDataOffset;
    length = view.getUint32(offset, true);
    offset += 4;
  }

  const encapsulated = isEncapsulated(dataset.transferSyntax);

  if (!encapsulated) {
    // Native (비압축) - 멀티프레임 지원
    const pixelData = new Uint8Array(buffer, offset, length);

    // 이미지 정보로 프레임 크기 계산
    // 주의: 태그 형식은 콤마 없이 '00280010' 형태 사용 (tagToString과 일치)
    const rows = getUint16Value(buffer, dataset, '00280010') || 0;
    const columns = getUint16Value(buffer, dataset, '00280011') || 0;
    const bitsAllocated = getUint16Value(buffer, dataset, '00280100') || 8;
    const samplesPerPixel = getUint16Value(buffer, dataset, '00280002') || 1;

    // Number of Frames 태그 (00280008) - 문자열로 저장됨
    const numberOfFramesStr = getStringValue(buffer, dataset, '00280008');
    const numberOfFrames = numberOfFramesStr ? parseInt(numberOfFramesStr, 10) : 1;

    // 프레임당 바이트 크기
    const bytesPerSample = bitsAllocated / 8;
    const frameSize = rows * columns * samplesPerPixel * bytesPerSample;

    if (numberOfFrames <= 1 || frameSize === 0) {
      // 단일 프레임
      return {
        isEncapsulated: false,
        frames: [pixelData],
        frameCount: 1,
      };
    }

    // 멀티프레임 분리
    const frames: Uint8Array[] = [];
    for (let i = 0; i < numberOfFrames; i++) {
      const frameOffset = i * frameSize;
      if (frameOffset + frameSize <= pixelData.length) {
        frames.push(new Uint8Array(pixelData.buffer, pixelData.byteOffset + frameOffset, frameSize));
      }
    }

    return {
      isEncapsulated: false,
      frames,
      frameCount: frames.length,
    };
  }

  // Encapsulated (압축) - Fragment 파싱
  // DICOM 표준: 첫 번째 Item은 항상 BOT(Basic Offset Table)
  // BOT는 비어있거나 오프셋 목록을 포함할 수 있음 (프레임 데이터가 아님)
  const frames: Uint8Array[] = [];
  let isFirstItem = true;

  // 무한 길이 (0xFFFFFFFF)인 경우 Fragment 파싱
  while (offset < buffer.byteLength - 8) {
    // Item 태그 읽기
    const itemGroup = view.getUint16(offset, true);
    const itemElement = view.getUint16(offset + 2, true);
    offset += 4;

    // Sequence Delimitation Item (FFFE,E0DD) - 끝
    if (itemGroup === 0xfffe && itemElement === 0xe0dd) {
      break;
    }

    // Item (FFFE,E000)
    if (itemGroup === 0xfffe && itemElement === 0xe000) {
      const itemLength = view.getUint32(offset, true);
      offset += 4;

      if (isFirstItem) {
        // 첫 번째 Item은 BOT - 건너뛰기 (프레임 데이터 아님)
        isFirstItem = false;
      } else if (itemLength > 0) {
        // 실제 프레임 데이터
        const frameData = new Uint8Array(buffer, offset, itemLength);
        frames.push(frameData);
      }

      offset += itemLength;
    }
  }

  return {
    isEncapsulated: true,
    frames,
    frameCount: frames.length,
  };
}
