/**
 * PointTool - Single Point Marker / Velocity Measurement
 *
 * 단일 점 마커 또는 속도 측정 도구
 *
 * 지원 모드:
 * - B-mode: 단순 마커 (위치 표시용)
 * - M-mode: 단순 마커 (위치 표시용)
 * - D-mode: Doppler 속도 측정 (cm/s)
 *
 * D-mode 작동 방식:
 * - 클릭한 점의 Y 좌표를 baseLine 기준으로 속도 계산
 * - baseLine 위: 양수 속도 (심장에서 멀어지는 방향)
 * - baseLine 아래: 음수 속도 (심장으로 향하는 방향)
 *
 * 사용 예시:
 * - B-mode: 관심 영역 마커, 랜드마크 표시
 * - D-mode: E파, A파 최대 속도 측정
 */

import type { Point, DicomMode, AnnotationType, MeasurementResult } from '../types';
import type { ToolConfig, ToolContext } from './MeasurementTool';
import { MeasurementTool } from './MeasurementTool';

// =============================================================================
// PointTool
// =============================================================================

/**
 * 단일 점 마커 / 속도 측정 도구
 *
 * B/M-mode: 단순 마커로 동작
 * D-mode: 속도 측정으로 동작
 */
export class PointTool extends MeasurementTool {
  // ---------------------------------------------------------------------------
  // Static Properties
  // ---------------------------------------------------------------------------

  static readonly toolId = 'point';
  static readonly toolName = 'Point Marker';
  static readonly supportedModes: DicomMode[] = ['B', 'M', 'D'];
  static readonly annotationType: AnnotationType = 'point';
  static readonly requiredPoints = 1;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor(config?: ToolConfig) {
    super({
      color: '#ff00ff', // 기본 마젠타
      lineWidth: 2,
      ...config,
    });
  }

  // ---------------------------------------------------------------------------
  // Abstract Method Implementations
  // ---------------------------------------------------------------------------

  getToolId(): string {
    return PointTool.toolId;
  }

  getToolName(): string {
    return PointTool.toolName;
  }

  getSupportedModes(): DicomMode[] {
    return PointTool.supportedModes;
  }

  getAnnotationType(): AnnotationType {
    return PointTool.annotationType;
  }

  getRequiredPoints(): number {
    return PointTool.requiredPoints;
  }

  /**
   * 측정 결과 계산
   *
   * B/M-mode: 좌표만 표시 (마커 용도)
   * D-mode: 속도 계산
   *
   * @param points - 단일 점 [P1]
   * @param context - 도구 컨텍스트
   * @returns 측정 결과
   */
  calculateMeasurement(points: Point[], context: ToolContext): MeasurementResult {
    if (points.length < 1) {
      return { value: 0, unit: '', displayText: '...' };
    }

    const point = points[0];
    const { calibration, transformContext, mode } = context;

    // B-mode / M-mode: 단순 마커 (좌표 표시)
    if (mode === 'B' || mode === 'M') {
      return {
        value: 0,
        unit: '',
        displayText: `(${point.x.toFixed(0)}, ${point.y.toFixed(0)})`,
      };
    }

    // D-mode: 속도 측정
    // 캘리브레이션 없으면 픽셀 Y 좌표만 반환
    if (!calibration) {
      return {
        value: point.y,
        unit: 'px',
        displayText: `${point.y.toFixed(0)} px`,
      };
    }

    // baseLine이 없으면 경고
    const baseLine = calibration.baseLine ?? calibration.regionLocationY0;
    if (baseLine === undefined) {
      console.warn('PointTool: baseLine not defined in calibration');
      return {
        value: point.y,
        unit: 'px',
        displayText: `${point.y.toFixed(0)} px (no baseline)`,
      };
    }

    // 물리 좌표로 변환
    const physicalPoint = this.transformer.dicomToPhysical(point, transformContext);

    if (physicalPoint) {
      // D-mode에서는 Y가 속도 (baseLine 기준 계산됨)
      const velocity = physicalPoint.y;
      const unit = physicalPoint.unitY || 'cm/s';

      return {
        value: velocity,
        unit,
        displayText: this.formatVelocityDisplay(velocity, unit),
      };
    }

    // 물리 변환 실패 시 수동 계산
    const velocity = (baseLine - point.y) * calibration.physicalDeltaY;

    return {
      value: velocity,
      unit: 'cm/s',
      displayText: this.formatVelocityDisplay(velocity, 'cm/s'),
    };
  }

  /**
   * 라벨 위치 계산 (점 오른쪽 약간 위)
   */
  getDefaultLabelPosition(points: Point[]): Point {
    if (points.length < 1) {
      return { x: 0, y: 0 };
    }

    const point = points[0];

    // 점 오른쪽 위에 라벨 배치
    return {
      x: point.x + 20,
      y: point.y - 15,
    };
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * 속도 표시 포맷팅
   *
   * 속도 부호:
   * - 양수: baseLine 위 (away from transducer)
   * - 음수: baseLine 아래 (toward transducer)
   * - toFixed()가 음수에 자동으로 '-' 붙임
   */
  private formatVelocityDisplay(velocity: number, unit: string): string {
    const absVelocity = Math.abs(velocity);

    // 소수점 자릿수 (값 크기에 따라 조정)
    let decimals = 1;
    if (absVelocity >= 100) {
      decimals = 0;
    } else if (absVelocity >= 10) {
      decimals = 1;
    } else {
      decimals = 2;
    }

    return `${velocity.toFixed(decimals)} ${unit}`;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * PointTool 인스턴스 생성
 */
export function createPointTool(config?: ToolConfig): PointTool {
  return new PointTool(config);
}
