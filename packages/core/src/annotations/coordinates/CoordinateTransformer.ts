/**
 * Coordinate Transformer
 *
 * 좌표 변환 유틸리티
 *
 * 책임:
 * - Canvas ↔ DICOM 픽셀 좌표 변환
 * - DICOM 픽셀 → 물리 좌표 변환
 * - 거리/각도 계산
 */

import type { Point, CalibrationData, DicomMode } from '../types';
import { DICOM_UNIT_CODES } from '../types';
import type {
  TransformContext,
  ViewportTransform,
  PhysicalPoint,
  DistanceResult,
  ICoordinateTransformer,
} from './types';

// =============================================================================
// DICOM Unit Code to String Mapping
// =============================================================================

/**
 * DICOM 단위 코드를 문자열로 변환
 */
export function getUnitString(unitCode: number): string {
  switch (unitCode) {
    case DICOM_UNIT_CODES.NONE:
      return '';
    case DICOM_UNIT_CODES.PERCENT:
      return '%';
    case DICOM_UNIT_CODES.DECIBEL:
      return 'dB';
    case DICOM_UNIT_CODES.CENTIMETER:
      return 'cm';
    case DICOM_UNIT_CODES.SECONDS:
      return 's';
    case DICOM_UNIT_CODES.HERTZ:
      return 'Hz';
    case DICOM_UNIT_CODES.DB_PER_SEC:
      return 'dB/s';
    case DICOM_UNIT_CODES.CM_PER_SEC:
      return 'cm/s';
    case DICOM_UNIT_CODES.CM_SQUARED:
      return 'cm²';
    case DICOM_UNIT_CODES.CM_SQUARED_PER_SEC:
      return 'cm²/s';
    default:
      return '';
  }
}

// =============================================================================
// Coordinate Transformer
// =============================================================================

/**
 * 좌표 변환기
 *
 * Canvas ↔ DICOM 픽셀 ↔ 물리 좌표 변환
 */
export class CoordinateTransformer implements ICoordinateTransformer {
  // ---------------------------------------------------------------------------
  // Canvas ↔ DICOM 변환
  // ---------------------------------------------------------------------------

  /**
   * Canvas 좌표 → DICOM 픽셀 좌표
   *
   * 마우스 이벤트 좌표를 원본 이미지 좌표로 변환
   * rotation, flipH, flipV 역변환 포함
   *
   * @param point - Canvas 좌표
   * @param context - 변환 컨텍스트
   * @returns DICOM 픽셀 좌표 (정수)
   */
  canvasToDicom(point: Point, context: TransformContext): Point {
    const { viewport } = context;
    const {
      imageWidth,
      imageHeight,
      canvasWidth,
      canvasHeight,
      zoom,
      pan,
      rotation = 0,
      flipH = false,
      flipV = false,
    } = viewport;

    // 1. 기본 스케일 계산 (Fit to canvas)
    const baseScale = this.calculateFitScale(viewport);

    // 2. 최종 스케일 (기본 스케일 * 줌)
    const finalScale = baseScale * zoom;

    // 3. Canvas 중앙 좌표
    const canvasCenterX = canvasWidth / 2;
    const canvasCenterY = canvasHeight / 2;

    // 4. Canvas 좌표에서 Pan 제거 후 중앙 기준으로 변환
    let x = point.x - pan.x - canvasCenterX;
    let y = point.y - pan.y - canvasCenterY;

    // 5. Rotation 역변환 (반시계 방향으로 회전)
    if (rotation !== 0) {
      const rad = (-rotation * Math.PI) / 180; // 역방향
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const newX = x * cos - y * sin;
      const newY = x * sin + y * cos;
      x = newX;
      y = newY;
    }

    // 6. Scale 역변환
    x = x / finalScale;
    y = y / finalScale;

    // 7. Flip 역변환 (flip은 자기 자신이 역변환)
    if (flipH) {
      x = -x;
    }
    if (flipV) {
      y = -y;
    }

    // 8. 이미지 중앙 기준에서 원점 기준으로 복원
    const dicomX = x + imageWidth / 2;
    const dicomY = y + imageHeight / 2;

    // 9. 정수로 반올림 (DICOM 픽셀은 정수)
    return {
      x: Math.round(dicomX),
      y: Math.round(dicomY),
    };
  }

  /**
   * DICOM 픽셀 좌표 → Canvas 좌표
   *
   * 저장된 좌표를 화면 좌표로 변환
   * rotation, flipH, flipV 적용 포함
   *
   * @param point - DICOM 픽셀 좌표
   * @param context - 변환 컨텍스트
   * @returns Canvas 좌표
   */
  dicomToCanvas(point: Point, context: TransformContext): Point {
    const { viewport } = context;
    const {
      imageWidth,
      imageHeight,
      canvasWidth,
      canvasHeight,
      zoom,
      pan,
      rotation = 0,
      flipH = false,
      flipV = false,
    } = viewport;

    // 1. 기본 스케일 계산
    const baseScale = this.calculateFitScale(viewport);

    // 2. 최종 스케일
    const finalScale = baseScale * zoom;

    // 3. DICOM 좌표를 이미지 중앙 기준으로 변환
    let x = point.x - imageWidth / 2;
    let y = point.y - imageHeight / 2;

    // 4. Flip 적용
    if (flipH) {
      x = -x;
    }
    if (flipV) {
      y = -y;
    }

    // 5. Scale 적용
    x = x * finalScale;
    y = y * finalScale;

    // 6. Rotation 적용 (시계 방향)
    if (rotation !== 0) {
      const rad = (rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const newX = x * cos - y * sin;
      const newY = x * sin + y * cos;
      x = newX;
      y = newY;
    }

    // 7. Canvas 중앙 + Pan 적용
    const canvasCenterX = canvasWidth / 2;
    const canvasCenterY = canvasHeight / 2;

    return {
      x: x + canvasCenterX + pan.x,
      y: y + canvasCenterY + pan.y,
    };
  }

  // ---------------------------------------------------------------------------
  // DICOM → Physical 변환
  // ---------------------------------------------------------------------------

  /**
   * DICOM 픽셀 좌표 → 물리 좌표
   *
   * 캘리브레이션 데이터를 사용해 물리 단위로 변환
   *
   * @param point - DICOM 픽셀 좌표
   * @param context - 변환 컨텍스트 (calibration 필수)
   * @returns 물리 좌표 또는 null (캘리브레이션 없음)
   */
  dicomToPhysical(
    point: Point,
    context: TransformContext
  ): PhysicalPoint | null {
    const { calibration, mode } = context;

    if (!calibration) {
      return null;
    }

    const { physicalDeltaX, physicalDeltaY, unitX, unitY, baseLine } =
      calibration;

    // D-mode (Doppler)의 경우 baseLine 기준으로 Y 계산
    let physicalY: number;
    if (mode === 'D' && baseLine !== undefined) {
      // baseLine 위: 양수 속도, baseLine 아래: 음수 속도
      physicalY = (baseLine - point.y) * physicalDeltaY;
    } else {
      physicalY = point.y * physicalDeltaY;
    }

    return {
      x: point.x * physicalDeltaX,
      y: physicalY,
      unitX: getUnitString(unitX),
      unitY: getUnitString(unitY),
    };
  }

  // ---------------------------------------------------------------------------
  // 측정 계산
  // ---------------------------------------------------------------------------

  /**
   * 두 점 사이의 거리 계산
   *
   * @param p1 - 첫 번째 점 (DICOM 픽셀 좌표)
   * @param p2 - 두 번째 점 (DICOM 픽셀 좌표)
   * @param context - 변환 컨텍스트
   * @returns 거리 결과
   */
  calculateDistance(
    p1: Point,
    p2: Point,
    context: TransformContext
  ): DistanceResult {
    // 픽셀 거리
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);

    const result: DistanceResult = {
      pixels: pixelDistance,
    };

    // 물리 거리 계산 (캘리브레이션 있을 때)
    const { calibration, mode } = context;
    if (calibration) {
      const physicalResult = this.calculatePhysicalDistance(
        p1,
        p2,
        calibration,
        mode
      );
      if (physicalResult) {
        result.physical = physicalResult.value;
        result.unit = physicalResult.unit;
      }
    }

    return result;
  }

  /**
   * 세 점으로 각도 계산
   *
   * @param p1 - 첫 번째 점 (시작)
   * @param p2 - 두 번째 점 (꼭짓점)
   * @param p3 - 세 번째 점 (끝)
   * @returns 각도 (도, degree)
   */
  calculateAngle(p1: Point, p2: Point, p3: Point): number {
    // 벡터 계산
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

    // 벡터 크기
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

    if (mag1 === 0 || mag2 === 0) {
      return 0;
    }

    // 내적
    const dot = v1.x * v2.x + v1.y * v2.y;

    // 각도 (라디안 → 도)
    const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    const angle = Math.acos(cosAngle) * (180 / Math.PI);

    return angle;
  }

  /**
   * 다각형 면적 계산 (Shoelace formula)
   *
   * @param points - 다각형 꼭짓점들 (DICOM 픽셀 좌표)
   * @param context - 변환 컨텍스트
   * @returns 면적 결과
   */
  calculateArea(
    points: Point[],
    context: TransformContext
  ): { pixels: number; physical?: number; unit?: string } {
    if (points.length < 3) {
      return { pixels: 0 };
    }

    // Shoelace formula
    let pixelArea = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      pixelArea += points[i].x * points[j].y;
      pixelArea -= points[j].x * points[i].y;
    }
    pixelArea = Math.abs(pixelArea) / 2;

    const result: { pixels: number; physical?: number; unit?: string } = {
      pixels: pixelArea,
    };

    // 물리 면적 계산
    const { calibration } = context;
    if (calibration) {
      const { physicalDeltaX, physicalDeltaY } = calibration;
      // 면적 = 픽셀 면적 * deltaX * deltaY
      result.physical = pixelArea * physicalDeltaX * physicalDeltaY;
      result.unit = 'cm²';
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Fit 스케일 계산 (이미지를 Canvas에 맞추는 배율)
   */
  private calculateFitScale(viewport: ViewportTransform): number {
    const { imageWidth, imageHeight, canvasWidth, canvasHeight } = viewport;

    if (imageWidth === 0 || imageHeight === 0) {
      return 1;
    }

    const scaleX = canvasWidth / imageWidth;
    const scaleY = canvasHeight / imageHeight;

    // 더 작은 스케일 선택 (전체 이미지가 보이도록)
    return Math.min(scaleX, scaleY);
  }

  /**
   * 물리 거리 계산 (모드별 처리)
   */
  private calculatePhysicalDistance(
    p1: Point,
    p2: Point,
    calibration: CalibrationData,
    mode?: DicomMode
  ): { value: number; unit: string } | null {
    const { physicalDeltaX, physicalDeltaY, unitX, unitY, baseLine } =
      calibration;

    switch (mode) {
      case 'B': {
        // B-mode: 유클리드 거리 (mm 또는 cm)
        const dx = (p2.x - p1.x) * physicalDeltaX;
        const dy = (p2.y - p1.y) * physicalDeltaY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return {
          value: distance,
          unit: getUnitString(unitX) || 'cm',
        };
      }

      case 'M': {
        // M-mode: X는 시간, Y는 거리
        // 일반적으로 Y축 거리만 측정
        const dy = Math.abs(p2.y - p1.y) * physicalDeltaY;
        return {
          value: dy,
          unit: getUnitString(unitY) || 'cm',
        };
      }

      case 'D': {
        // D-mode: X는 시간, Y는 속도
        // baseLine 기준 속도 측정
        if (baseLine !== undefined) {
          const v1 = (baseLine - p1.y) * physicalDeltaY;
          const v2 = (baseLine - p2.y) * physicalDeltaY;
          return {
            value: Math.abs(v2 - v1),
            unit: getUnitString(unitY) || 'cm/s',
          };
        }
        // baseLine 없으면 절대값 차이
        const dv = Math.abs(p2.y - p1.y) * physicalDeltaY;
        return {
          value: dv,
          unit: getUnitString(unitY) || 'cm/s',
        };
      }

      default: {
        // 기본: 유클리드 거리
        const dx = (p2.x - p1.x) * physicalDeltaX;
        const dy = (p2.y - p1.y) * physicalDeltaY;
        return {
          value: Math.sqrt(dx * dx + dy * dy),
          unit: getUnitString(unitX) || '',
        };
      }
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * 기본 좌표 변환기 인스턴스
 */
export const coordinateTransformer = new CoordinateTransformer();
