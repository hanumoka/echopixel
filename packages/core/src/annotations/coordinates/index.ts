/**
 * Coordinate System
 *
 * 좌표 변환 시스템
 *
 * 좌표 체계:
 * - DICOM 픽셀 좌표: 원본 이미지 기준, 저장/Export용
 * - Canvas 좌표: 화면 표시 기준, 렌더링/이벤트용
 * - 물리 좌표: 실제 측정값, mm/cm/s 등
 *
 * 모드별 좌표 의미:
 * - B-mode: X=거리(mm), Y=거리(mm) - 등방성
 * - M-mode: X=시간(ms), Y=거리(mm) - 비등방성
 * - D-mode: X=시간(ms), Y=속도(cm/s) - 비등방성 + baseline
 *
 * 변환 흐름:
 * Mouse Event → Canvas 좌표 → DICOM 픽셀 좌표 (저장)
 * DICOM 픽셀 좌표 (로드) → Canvas 좌표 (렌더링)
 * DICOM 픽셀 좌표 + Calibration → 물리 값 (측정 결과)
 */

export * from './types';
export {
  CoordinateTransformer,
  coordinateTransformer,
  getUnitString,
} from './CoordinateTransformer';
