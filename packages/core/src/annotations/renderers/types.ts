/**
 * Annotation Renderer Types
 *
 * 어노테이션 렌더링 시스템 타입 정의
 *
 * 렌더링 방식:
 * - SVG: 기본, React 컴포넌트 기반
 * - Canvas: 선택적, 성능 최적화용
 * - WebGL: 향후 확장, 대량 렌더링용
 */

import type { Point, Annotation, DicomMode } from '../types';
import type { TransformContext } from '../coordinates/types';

// =============================================================================
// Render Context
// =============================================================================

/**
 * 렌더링 컨텍스트
 *
 * 어노테이션 렌더링에 필요한 정보
 */
export interface RenderContext {
  /** 뷰포트 ID */
  viewportId: string;
  /** DICOM 파일 ID */
  dicomId: string;
  /** 현재 프레임 인덱스 */
  frameIndex: number;
  /** DICOM 모드 */
  mode: DicomMode;
  /** 좌표 변환 컨텍스트 */
  transformContext: TransformContext;
  /** Canvas 너비 */
  canvasWidth: number;
  /** Canvas 높이 */
  canvasHeight: number;
}

// =============================================================================
// Shape Render Data
// =============================================================================

/**
 * 도형 렌더링 데이터 (Canvas 좌표 기반)
 *
 * DICOM 좌표를 Canvas 좌표로 변환한 후의 데이터
 */
export interface ShapeRenderData {
  /** 어노테이션 ID */
  id: string;
  /** 어노테이션 타입 */
  type: string;
  /** Canvas 좌표 포인트들 */
  points: Point[];
  /** 라벨 위치 (Canvas 좌표) */
  labelPosition: Point;
  /** 표시 텍스트 */
  displayValue: string;
  /** 색상 */
  color: string;
  /** 선택됨 여부 */
  isSelected: boolean;
  /** 호버됨 여부 */
  isHovered: boolean;
  /** 원본 어노테이션 참조 */
  annotation: Annotation;
}

// =============================================================================
// Interaction Types
// =============================================================================

/**
 * 히트 테스트 결과
 */
export interface HitTestResult {
  /** 히트된 어노테이션 ID */
  annotationId: string;
  /** 히트된 부분 */
  part: 'shape' | 'label' | 'handle';
  /** 히트된 포인트 인덱스 (handle인 경우) */
  pointIndex?: number;
  /** 히트 거리 (픽셀) */
  distance: number;
}

/**
 * 드래그 상태
 */
export interface DragState {
  /** 드래그 중인 어노테이션 ID */
  annotationId: string;
  /** 드래그 중인 부분 */
  part: 'shape' | 'label' | 'handle';
  /** 드래그 중인 포인트 인덱스 */
  pointIndex?: number;
  /** 드래그 시작 위치 (Canvas 좌표) */
  startPosition: Point;
  /** 현재 위치 (Canvas 좌표) */
  currentPosition: Point;
  /** 드래그 시작 시 어노테이션 상태 */
  initialAnnotation: Annotation;
}

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * 어노테이션 이벤트 핸들러
 */
export interface AnnotationEventHandlers {
  /** 어노테이션 선택 */
  onSelect?: (annotationId: string | null) => void;
  /** 어노테이션 호버 */
  onHover?: (annotationId: string | null) => void;
  /** 어노테이션 업데이트 (드래그 완료) */
  onUpdate?: (annotation: Annotation) => void;
  /** 어노테이션 삭제 */
  onDelete?: (annotationId: string) => void;
}

// =============================================================================
// Renderer Interface
// =============================================================================

/**
 * 어노테이션 렌더러 인터페이스
 *
 * SVG, Canvas, WebGL 등 다양한 구현 가능
 */
export interface AnnotationRenderer {
  /** 렌더러 타입 */
  readonly type: 'svg' | 'canvas' | 'webgl';

  /**
   * 어노테이션 렌더링
   *
   * @param annotations - 렌더링할 어노테이션 목록
   * @param context - 렌더링 컨텍스트
   */
  render(annotations: Annotation[], context: RenderContext): void;

  /**
   * 히트 테스트
   *
   * @param point - 테스트 위치 (Canvas 좌표)
   * @param annotations - 테스트할 어노테이션 목록
   * @param context - 렌더링 컨텍스트
   * @returns 히트 결과 또는 null
   */
  hitTest(
    point: Point,
    annotations: Annotation[],
    context: RenderContext
  ): HitTestResult | null;

  /**
   * 리소스 정리
   */
  dispose(): void;
}

// =============================================================================
// SVG Specific Types
// =============================================================================

/**
 * SVG 렌더링 설정
 */
export interface SVGRenderConfig {
  /** 기본 선 색상 */
  strokeColor: string;
  /** 선택됨 선 색상 */
  selectedStrokeColor: string;
  /** 호버됨 선 색상 */
  hoveredStrokeColor: string;
  /** 선 두께 */
  strokeWidth: number;
  /** 선택됨 선 두께 */
  selectedStrokeWidth: number;
  /** 포인트 반지름 */
  pointRadius: number;
  /** 핸들 반지름 */
  handleRadius: number;
  /** 라벨 폰트 크기 */
  labelFontSize: number;
  /** 라벨 배경 색상 */
  labelBackground: string;
  /** 라벨 텍스트 색상 */
  labelColor: string;
  /** 히트 허용 오차 (픽셀) */
  hitTolerance: number;
}

/**
 * 기본 SVG 렌더링 설정
 */
export const DEFAULT_SVG_RENDER_CONFIG: SVGRenderConfig = {
  strokeColor: '#00ff00',
  selectedStrokeColor: '#ffff00',
  hoveredStrokeColor: '#88ff88',
  strokeWidth: 2,
  selectedStrokeWidth: 3,
  pointRadius: 4,
  handleRadius: 6,
  labelFontSize: 12,
  labelBackground: 'rgba(0, 0, 0, 0.7)',
  labelColor: '#ffffff',
  hitTolerance: 8,
};

// =============================================================================
// Shape Component Props (React)
// =============================================================================

/**
 * 도형 컴포넌트 공통 Props
 */
export interface ShapeProps {
  /** 렌더링 데이터 */
  data: ShapeRenderData;
  /** 렌더링 설정 */
  config: SVGRenderConfig;
  /** 선택 핸들러 */
  onSelect?: (id: string) => void;
  /** 호버 핸들러 */
  onHover?: (id: string | null) => void;
  /** 드래그 시작 핸들러 */
  onDragStart?: (id: string, part: DragState['part'], pointIndex?: number) => void;
}

/**
 * 라벨 컴포넌트 Props
 */
export interface LabelProps {
  /** 위치 (Canvas 좌표) */
  position: Point;
  /** 표시 텍스트 */
  text: string;
  /** 색상 */
  color?: string;
  /** 배경 색상 */
  background?: string;
  /** 폰트 크기 */
  fontSize?: number;
  /** 선택됨 여부 */
  isSelected?: boolean;
  /** 드래그 핸들러 */
  onDragStart?: () => void;
}

/**
 * 드래그 핸들 컴포넌트 Props
 */
export interface HandleProps {
  /** 위치 (Canvas 좌표) */
  position: Point;
  /** 반지름 */
  radius?: number;
  /** 색상 */
  color?: string;
  /** 활성화 색상 */
  activeColor?: string;
  /** 활성화 여부 */
  isActive?: boolean;
  /** 드래그 핸들러 */
  onDragStart?: () => void;
}
