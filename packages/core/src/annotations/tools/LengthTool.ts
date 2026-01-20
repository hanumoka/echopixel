/**
 * LengthTool - Distance Measurement
 *
 * 두 점 사이의 거리를 측정하는 도구
 *
 * 지원 모드:
 * - B-mode: 2D 유클리드 거리 (mm 또는 cm)
 * - M-mode: Y축 거리 (시간과 무관하게 거리만 측정)
 *
 * 사용 예시:
 * - B-mode: 심장 구조물 크기 측정
 * - M-mode: 좌심실 내경, 심근 두께 측정
 */

import type { Point, DicomMode, AnnotationType, MeasurementResult } from '../types';
import type { ToolConfig, ToolContext } from './MeasurementTool';
import { MeasurementTool } from './MeasurementTool';

// =============================================================================
// LengthTool
// =============================================================================

/**
 * 거리 측정 도구
 *
 * 두 점을 클릭하여 거리를 측정
 */
export class LengthTool extends MeasurementTool {
  // ---------------------------------------------------------------------------
  // Static Properties
  // ---------------------------------------------------------------------------

  static readonly toolId = 'length';
  static readonly toolName = 'Length';
  static readonly supportedModes: DicomMode[] = ['B', 'M'];
  static readonly annotationType: AnnotationType = 'length';
  static readonly requiredPoints = 2;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor(config?: ToolConfig) {
    super({
      color: '#00ff00', // 기본 녹색
      lineWidth: 2,
      ...config,
    });
  }

  // ---------------------------------------------------------------------------
  // Abstract Method Implementations
  // ---------------------------------------------------------------------------

  getToolId(): string {
    return LengthTool.toolId;
  }

  getToolName(): string {
    return LengthTool.toolName;
  }

  getSupportedModes(): DicomMode[] {
    return LengthTool.supportedModes;
  }

  getAnnotationType(): AnnotationType {
    return LengthTool.annotationType;
  }

  getRequiredPoints(): number {
    return LengthTool.requiredPoints;
  }

  /**
   * 거리 측정 결과 계산
   *
   * @param points - 두 점 (DICOM 픽셀 좌표)
   * @param context - 도구 컨텍스트
   * @returns 측정 결과
   */
  calculateMeasurement(points: Point[], context: ToolContext): MeasurementResult {
    if (points.length < 2) {
      return { value: 0, unit: '', displayText: '...' };
    }

    const [p1, p2] = points;
    const { calibration, mode, transformContext } = context;

    // 캘리브레이션 없으면 픽셀 거리만 반환
    if (!calibration) {
      const pixelDistance = this.calculateDistance(p1, p2);
      return {
        value: pixelDistance,
        unit: 'px',
        displayText: `${pixelDistance.toFixed(1)} px`,
      };
    }

    // 모드별 거리 계산
    const result = this.transformer.calculateDistance(p1, p2, transformContext);

    if (result.physical !== undefined && result.unit) {
      // 단위 변환 (cm → mm for small values)
      let displayValue = result.physical;
      let displayUnit = result.unit;

      if (displayUnit === 'cm' && displayValue < 1) {
        displayValue *= 10;
        displayUnit = 'mm';
      }

      return {
        value: result.physical,
        unit: result.unit,
        displayText: this.formatDistanceDisplay(displayValue, displayUnit, mode),
      };
    }

    // 물리 거리 계산 실패 시 픽셀 거리
    return {
      value: result.pixels,
      unit: 'px',
      displayText: `${result.pixels.toFixed(1)} px`,
    };
  }

  /**
   * 라벨 위치 계산 (선분의 중점 약간 위)
   */
  getDefaultLabelPosition(points: Point[]): Point {
    if (points.length < 2) {
      return points[0] ?? { x: 0, y: 0 };
    }

    const [p1, p2] = points;
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    // 라벨을 선분 위쪽에 배치 (오프셋 15픽셀)
    return {
      x: midX,
      y: midY - 15,
    };
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * 거리 표시 포맷팅
   */
  private formatDistanceDisplay(
    value: number,
    unit: string,
    _mode: DicomMode
  ): string {
    let decimals = 1;

    // 단위별 소수점 자릿수
    if (unit === 'mm') {
      decimals = value >= 10 ? 1 : 2;
    } else if (unit === 'cm') {
      decimals = 2;
    }

    return `${value.toFixed(decimals)} ${unit}`;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * LengthTool 인스턴스 생성
 */
export function createLengthTool(config?: ToolConfig): LengthTool {
  return new LengthTool(config);
}
