/**
 * AngleTool - Angle Measurement
 *
 * 세 점으로 각도를 측정하는 도구
 *
 * 지원 모드:
 * - B-mode: 2D 각도 측정
 *
 * 포인트 순서:
 * - P1: 첫 번째 선의 끝점
 * - P2: 꼭짓점 (각도의 중심)
 * - P3: 두 번째 선의 끝점
 *
 * 각도: P1-P2-P3 사이의 각도 (0° ~ 180°)
 *
 * 사용 예시:
 * - 관절 각도 측정
 * - 혈관 분지 각도
 * - 심장 구조물 각도
 */

import type { Point, DicomMode, AnnotationType, MeasurementResult } from '../types';
import type { ToolConfig, ToolContext } from './MeasurementTool';
import { MeasurementTool } from './MeasurementTool';

// =============================================================================
// AngleTool
// =============================================================================

/**
 * 각도 측정 도구
 *
 * 세 점을 클릭하여 각도를 측정
 * - 첫 번째 점: 선 1의 끝점
 * - 두 번째 점: 꼭짓점 (각도의 중심)
 * - 세 번째 점: 선 2의 끝점
 */
export class AngleTool extends MeasurementTool {
  // ---------------------------------------------------------------------------
  // Static Properties
  // ---------------------------------------------------------------------------

  static readonly toolId = 'angle';
  static readonly toolName = 'Angle';
  static readonly supportedModes: DicomMode[] = ['B'];
  static readonly annotationType: AnnotationType = 'angle';
  static readonly requiredPoints = 3;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor(config?: ToolConfig) {
    super({
      color: '#ffff00', // 기본 노란색
      lineWidth: 2,
      ...config,
    });
  }

  // ---------------------------------------------------------------------------
  // Abstract Method Implementations
  // ---------------------------------------------------------------------------

  getToolId(): string {
    return AngleTool.toolId;
  }

  getToolName(): string {
    return AngleTool.toolName;
  }

  getSupportedModes(): DicomMode[] {
    return AngleTool.supportedModes;
  }

  getAnnotationType(): AnnotationType {
    return AngleTool.annotationType;
  }

  getRequiredPoints(): number {
    return AngleTool.requiredPoints;
  }

  /**
   * 각도 측정 결과 계산
   *
   * @param points - 세 점 [P1, P2(꼭짓점), P3]
   * @param _context - 도구 컨텍스트 (각도는 캘리브레이션 불필요)
   * @returns 측정 결과
   */
  calculateMeasurement(points: Point[], _context: ToolContext): MeasurementResult {
    // 3점 미만: 미리보기 상태
    if (points.length < 3) {
      return { value: 0, unit: '°', displayText: '...' };
    }

    const [p1, p2, p3] = points;

    // 각도 계산 (CoordinateTransformer 사용)
    const angle = this.transformer.calculateAngle(p1, p2, p3);

    return {
      value: angle,
      unit: '°',
      displayText: this.formatAngleDisplay(angle),
    };
  }

  /**
   * 라벨 위치 계산 (꼭짓점 근처)
   */
  getDefaultLabelPosition(points: Point[]): Point {
    if (points.length < 2) {
      return points[0] ?? { x: 0, y: 0 };
    }

    // 꼭짓점 (P2) 근처에 라벨 배치
    const vertex = points[1];

    if (points.length === 2) {
      // 2점만 있을 때: 두 번째 점 기준
      return {
        x: vertex.x + 20,
        y: vertex.y - 20,
      };
    }

    // 3점 있을 때: 각도의 이등분선 방향으로 오프셋
    const [p1, p2, p3] = points;

    // 두 벡터의 단위 벡터
    const v1 = this.normalize({ x: p1.x - p2.x, y: p1.y - p2.y });
    const v2 = this.normalize({ x: p3.x - p2.x, y: p3.y - p2.y });

    // 이등분선 방향 (두 단위 벡터의 합)
    const bisector = {
      x: v1.x + v2.x,
      y: v1.y + v2.y,
    };

    // 이등분선 방향으로 오프셋 (25픽셀)
    const bisectorLength = Math.sqrt(bisector.x * bisector.x + bisector.y * bisector.y);
    if (bisectorLength > 0) {
      const offset = 25;
      return {
        x: p2.x + (bisector.x / bisectorLength) * offset,
        y: p2.y + (bisector.y / bisectorLength) * offset,
      };
    }

    // 이등분선 계산 실패 시 꼭짓점 오른쪽 위
    return {
      x: p2.x + 20,
      y: p2.y - 20,
    };
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * 벡터 정규화 (단위 벡터)
   */
  private normalize(v: Point): Point {
    const length = Math.sqrt(v.x * v.x + v.y * v.y);
    if (length === 0) {
      return { x: 0, y: 0 };
    }
    return {
      x: v.x / length,
      y: v.y / length,
    };
  }

  /**
   * 각도 표시 포맷팅
   */
  private formatAngleDisplay(angle: number): string {
    // 소수점 1자리
    return `${angle.toFixed(1)}°`;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * AngleTool 인스턴스 생성
 */
export function createAngleTool(config?: ToolConfig): AngleTool {
  return new AngleTool(config);
}
