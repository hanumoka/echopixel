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
