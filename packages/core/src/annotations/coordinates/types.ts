/**
 * Coordinate System Type Definitions
 *
 * 좌표 변환 시스템 타입
 *
 * 좌표 체계:
 * 1. DICOM 픽셀 좌표 (저장용) - 원본 이미지 기준 정수 좌표
 * 2. Canvas 좌표 (렌더링용) - 화면 표시 기준 좌표
 * 3. 물리 좌표 (측정용) - mm, cm/s, ms 등 실제 단위
 */

import type { Point, CalibrationData, DicomMode } from '../types';

// =============================================================================
// Coordinate Types
// =============================================================================

/**
 * DICOM 픽셀 좌표
 *
 * 원본 이미지 기준의 정수 좌표
 * - 저장, Export, Import에 사용
 * - zoom/pan 영향 받지 않음
 */
export interface DicomPixelPoint extends Point {
  /** 좌표 타입 식별자 */
  readonly _type: 'dicom';
}

/**
 * Canvas 좌표
 *
 * 화면에 표시된 좌표
 * - 마우스 이벤트, 렌더링에 사용
 * - zoom/pan 영향 받음
 */
export interface CanvasPoint extends Point {
  /** 좌표 타입 식별자 */
  readonly _type: 'canvas';
}

/**
 * 물리 좌표
 *
 * 실제 물리 단위 좌표
 * - 측정 결과 표시에 사용
 */
export interface PhysicalPoint {
  /** X축 물리값 */
  x: number;
  /** Y축 물리값 */
  y: number;
  /** X축 단위 */
  unitX: string;
  /** Y축 단위 */
  unitY: string;
}

// =============================================================================
// Transform Context
// =============================================================================

/**
 * 뷰포트 변환 정보
 *
 * 좌표 변환에 필요한 뷰포트 상태
 */
export interface ViewportTransform {
  /** 원본 이미지 너비 (픽셀) */
  imageWidth: number;
  /** 원본 이미지 높이 (픽셀) */
  imageHeight: number;

  /** Canvas 너비 (픽셀) */
  canvasWidth: number;
  /** Canvas 높이 (픽셀) */
  canvasHeight: number;

  /** 확대/축소 배율 (기본 1.0) */
  zoom: number;
  /** 이동 오프셋 (Canvas 좌표 기준) */
  pan: Point;

  /** 회전 각도 (도, 미래 확장용) */
  rotation?: number;
  /** 수평 뒤집기 */
  flipH?: boolean;
  /** 수직 뒤집기 */
  flipV?: boolean;
}

/**
 * 변환 컨텍스트
 *
 * 좌표 변환에 필요한 전체 정보
 */
export interface TransformContext {
  /** 뷰포트 변환 정보 */
  viewport: ViewportTransform;
  /** 캘리브레이션 데이터 (물리 단위 변환용) */
  calibration?: CalibrationData;
  /** DICOM 모드 */
  mode?: DicomMode;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * 거리 계산 결과
 */
export interface DistanceResult {
  /** 픽셀 거리 */
  pixels: number;
  /** 물리 거리 */
  physical?: number;
  /** 물리 단위 */
  unit?: string;
}

/**
 * 좌표 변환기 인터페이스
 */
export interface ICoordinateTransformer {
  /**
   * Canvas 좌표 → DICOM 픽셀 좌표
   */
  canvasToDicom(point: Point, context: TransformContext): Point;

  /**
   * DICOM 픽셀 좌표 → Canvas 좌표
   */
  dicomToCanvas(point: Point, context: TransformContext): Point;

  /**
   * DICOM 픽셀 좌표 → 물리 좌표
   */
  dicomToPhysical(point: Point, context: TransformContext): PhysicalPoint | null;

  /**
   * 두 점 사이의 물리 거리 계산
   */
  calculateDistance(
    p1: Point,
    p2: Point,
    context: TransformContext
  ): DistanceResult;
}
