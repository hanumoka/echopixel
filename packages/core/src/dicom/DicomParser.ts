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
 * 바이트 배열을 문자열로 변환 (Stack Overflow 방지)
 *
 * 학습 포인트:
 * - String.fromCharCode(...bytes)는 65536+ 바이트에서 Stack Overflow 발생
 * - TextDecoder는 대용량 데이터도 안전하게 처리
 * - DICOM 기본 인코딩은 ISO-8859-1 (Latin-1)
 */
const textDecoder = new TextDecoder('iso-8859-1');

function bytesToString(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
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
      transferSyntax = bytesToString(bytes)
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
  return bytesToString(bytes)
    .replace(/\0/g, '')
    .trim();
}

/**
 * Pixel Spacing (0028,0030) 파싱
 *
 * 형식: "row_spacing\column_spacing" (예: "0.5\0.5")
 * 단위: mm (DICOM 표준)
 *
 * @returns PixelSpacing 또는 undefined (태그 없거나 파싱 실패)
 */
export function getPixelSpacing(
  buffer: ArrayBuffer,
  dataset: DicomDataset,
): PixelSpacing | undefined {
  // Pixel Spacing 태그: (0028,0030)
  const pixelSpacingStr = getStringValue(buffer, dataset, '00280030');
  if (!pixelSpacingStr) {
    return undefined;
  }

  // 백슬래시로 분리
  const parts = pixelSpacingStr.split('\\');
  if (parts.length < 2) {
    return undefined;
  }

  const rowSpacing = parseFloat(parts[0]);
  const columnSpacing = parseFloat(parts[1]);

  // 유효한 숫자인지 확인
  if (isNaN(rowSpacing) || isNaN(columnSpacing) || rowSpacing <= 0 || columnSpacing <= 0) {
    return undefined;
  }

  return {
    rowSpacing,
    columnSpacing,
  };
}

/**
 * Pixel Spacing 정보
 *
 * DICOM 태그 (0028,0030)에서 추출
 * 단위: mm (DICOM 표준)
 */
export interface PixelSpacing {
  /** 행 간격 (mm) - 인접한 행 사이의 물리적 거리 */
  rowSpacing: number;
  /** 열 간격 (mm) - 인접한 열 사이의 물리적 거리 */
  columnSpacing: number;
}

/**
 * Ultrasound Region Calibration 정보
 *
 * DICOM Sequence of Ultrasound Regions (0018,6011) 내부 태그에서 추출
 * - Physical Delta X (0018,602C)
 * - Physical Delta Y (0018,602E)
 * - Physical Units X Direction (0018,6024)
 * - Physical Units Y Direction (0018,6026)
 *
 * 단위: Physical Units에 따라 다름 (cm, seconds, cm/s 등)
 */
export interface UltrasoundCalibration {
  /** X축 물리 간격 (단위/pixel) */
  physicalDeltaX: number;
  /** Y축 물리 간격 (단위/pixel) */
  physicalDeltaY: number;
  /** X축 물리 단위 (3=cm, 4=seconds, 5=cm/s 등) */
  physicalUnitsX: number;
  /** Y축 물리 단위 (3=cm, 4=seconds, 5=cm/s 등) */
  physicalUnitsY: number;
}

/**
 * Ultrasound Physical Units 코드
 * DICOM PS3.3 C.8.5.5.1.4
 */
export const ULTRASOUND_PHYSICAL_UNITS = {
  NONE: 0,
  PERCENT: 1,
  DB: 2,
  CM: 3,
  SECONDS: 4,
  CM_PER_SEC: 5,
  HZ: 6,
  DB_PER_SEC: 7,
  DB_PER_HZ: 8,
} as const;

/**
 * Ultrasound Region Calibration 추출
 *
 * Sequence of Ultrasound Regions (0018,6011) 내부에서
 * Physical Delta X/Y 및 Physical Units를 추출
 *
 * 시퀀스 구조가 복잡하므로 태그 패턴을 직접 검색
 * VR 검증을 통해 잘못된 매칭 방지
 *
 * @param buffer - DICOM 버퍼
 * @returns UltrasoundCalibration 또는 undefined
 */
export function getUltrasoundCalibration(
  buffer: ArrayBuffer
): UltrasoundCalibration | undefined {
  const view = new DataView(buffer);
  const bufferLength = buffer.byteLength;

  // 필요한 값들
  let physicalDeltaX: number | undefined;
  let physicalDeltaY: number | undefined;
  let physicalUnitsX: number | undefined;
  let physicalUnitsY: number | undefined;

  // DICM 헤더 이후부터 검색 (offset 132)
  // 짝수 바이트에서만 검색 (DICOM 태그는 항상 짝수 오프셋)
  for (let i = 132; i < bufferLength - 20; i += 2) {
    const group = view.getUint16(i, true);

    // 0018 그룹이 아니면 건너뛰기 (성능 최적화)
    if (group !== 0x0018) continue;

    const element = view.getUint16(i + 2, true);

    // VR 읽기
    const vrChar1 = view.getUint8(i + 4);
    const vrChar2 = view.getUint8(i + 5);

    // VR 문자 유효성 검사 (A-Z만 허용)
    if (vrChar1 < 65 || vrChar1 > 90 || vrChar2 < 65 || vrChar2 > 90) {
      continue;
    }

    const vr = String.fromCharCode(vrChar1, vrChar2);

    // (0018,6024) Physical Units X Direction - US (2 bytes)
    if (element === 0x6024 && vr === 'US') {
      const length = view.getUint16(i + 6, true);
      if (length === 2) {
        const valueOffset = i + 8;
        if (valueOffset + 2 <= bufferLength) {
          const value = view.getUint16(valueOffset, true);
          // 유효한 Physical Units 범위 (0-8)
          if (value <= 8) {
            physicalUnitsX = value;
          }
        }
      }
    }

    // (0018,6026) Physical Units Y Direction - US (2 bytes)
    if (element === 0x6026 && vr === 'US') {
      const length = view.getUint16(i + 6, true);
      if (length === 2) {
        const valueOffset = i + 8;
        if (valueOffset + 2 <= bufferLength) {
          const value = view.getUint16(valueOffset, true);
          if (value <= 8) {
            physicalUnitsY = value;
          }
        }
      }
    }

    // (0018,602C) Physical Delta X - FD (8 bytes double)
    if (element === 0x602c && vr === 'FD') {
      // 시퀀스 내부에서는 short form일 수 있음: VR(2) + Length(2) + Value(8)
      // 먼저 short form 시도 (length는 2바이트)
      const shortLength = view.getUint16(i + 6, true);

      if (shortLength === 8) {
        // Short form: 값은 i + 8에서 시작
        const valueOffset = i + 8;
        if (valueOffset + 8 <= bufferLength) {
          const value = view.getFloat64(valueOffset, true);
          if (Number.isFinite(value) && value !== 0) {
            physicalDeltaX = value;
          }
        }
      } else {
        // Long form 시도: VR(2) + Reserved(2) + Length(4) + Value(8)
        const longLength = view.getUint32(i + 8, true);
        if (longLength === 8) {
          const valueOffset = i + 12;
          if (valueOffset + 8 <= bufferLength) {
            const value = view.getFloat64(valueOffset, true);
            if (Number.isFinite(value) && value !== 0) {
              physicalDeltaX = value;
            }
          }
        }
      }
    }

    // (0018,602E) Physical Delta Y - FD (8 bytes double)
    if (element === 0x602e && vr === 'FD') {
      // Short form 먼저 시도
      const shortLength = view.getUint16(i + 6, true);

      if (shortLength === 8) {
        const valueOffset = i + 8;
        if (valueOffset + 8 <= bufferLength) {
          const value = view.getFloat64(valueOffset, true);
          if (Number.isFinite(value) && value !== 0) {
            physicalDeltaY = value;
          }
        }
      } else {
        // Long form 시도
        const longLength = view.getUint32(i + 8, true);
        if (longLength === 8) {
          const valueOffset = i + 12;
          if (valueOffset + 8 <= bufferLength) {
            const value = view.getFloat64(valueOffset, true);
            if (Number.isFinite(value) && value !== 0) {
              physicalDeltaY = value;
            }
          }
        }
      }
    }

    // 모든 값을 찾으면 종료
    if (
      physicalDeltaX !== undefined &&
      physicalDeltaY !== undefined &&
      physicalUnitsX !== undefined &&
      physicalUnitsY !== undefined
    ) {
      break;
    }
  }

  // Physical Delta 값이 있어야 유효한 캘리브레이션
  if (physicalDeltaX === undefined || physicalDeltaY === undefined) {
    return undefined;
  }

  return {
    physicalDeltaX,
    physicalDeltaY,
    physicalUnitsX: physicalUnitsX ?? ULTRASOUND_PHYSICAL_UNITS.CM,
    physicalUnitsY: physicalUnitsY ?? ULTRASOUND_PHYSICAL_UNITS.CM,
  };
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
  /** Pixel Spacing (mm) - calibration에 사용 */
  pixelSpacing?: PixelSpacing;
  /** Ultrasound Region Calibration (cm/pixel) - 초음파 이미지용 */
  ultrasoundCalibration?: UltrasoundCalibration;
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

  // Pixel Spacing 먼저 시도, 없으면 Ultrasound Calibration 시도
  const pixelSpacing = getPixelSpacing(buffer, dataset);
  const ultrasoundCalibration = pixelSpacing ? undefined : getUltrasoundCalibration(buffer);

  return {
    rows,
    columns,
    bitsAllocated,
    bitsStored: getUint16Value(buffer, dataset, '00280101') ?? bitsAllocated,
    highBit: getUint16Value(buffer, dataset, '00280102') ?? bitsAllocated - 1,
    pixelRepresentation: getUint16Value(buffer, dataset, '00280103') ?? 0,
    photometricInterpretation: getStringValue(buffer, dataset, '00280004') ?? 'MONOCHROME2',
    samplesPerPixel: getUint16Value(buffer, dataset, '00280002') ?? 1,
    pixelSpacing,
    ultrasoundCalibration,
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
