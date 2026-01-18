/*
 * DICOM 태그 (Group, Element)
 */
export interface DicomTag {
  group: number;
  element: number;
}

/*
 * DICOM 데이터 요소
 */
export interface DicomElement {
  tag: DicomTag;
  vr: string; // Value Representation (예: 'US', 'OB', 'SQ')
  length: number; // 값의 길이(bytes)
  offset: number; // 파일 내 값의 시작 위치
  value?: unknown; // 파싱된 값 (선택적)
}

/**
 * 파싱된 DICOM 데이터셋
 */
export interface DicomDataset {
  elements: Map<string, DicomElement>; // 태그 문자열 → 요소
  pixelDataOffset?: number; // 픽셀 데이터 시작 위치
  transferSyntax?: string; // Transfer Syntax UID
}

/**
 * 추출된 픽셀 데이터
 */
export interface PixelDataInfo {
  /** 압축 여부 */
  isEncapsulated: boolean;
  /** 프레임 데이터 배열 (각 프레임의 바이트 배열) */
  frames: Uint8Array[];
  /** 총 프레임 수 */
  frameCount: number;
}

/**
 * 디코딩된 이미지 프레임
 */
export interface DecodedFrame {
  /** 디코딩된 이미지 (WebGL 텍스처 업로드용) */
  image: ImageBitmap | VideoFrame;
  /** 이미지 너비 */
  width: number;
  /** 이미지 높이 */
  height: number;
  /** VideoFrame인 경우 true (close() 호출 필요) */
  needsClose: boolean;
}
