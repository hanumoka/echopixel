/**
 * Annotation Components
 *
 * 어노테이션 렌더링 React 컴포넌트
 *
 * 구조:
 * - SVGOverlay: 메인 오버레이 컴포넌트
 * - shapes/: 도형 컴포넌트 (LengthShape, AngleShape, PointShape)
 * - MeasurementLabel: 측정값 라벨
 * - DragHandle: 드래그 핸들
 */

// Main overlay
export { SVGOverlay } from './SVGOverlay';
export type { SVGOverlayProps } from './SVGOverlay';

// Shapes
export { LengthShape } from './shapes/LengthShape';
export { AngleShape } from './shapes/AngleShape';
export { PointShape } from './shapes/PointShape';

// UI components
export { MeasurementLabel } from './MeasurementLabel';
export type { MeasurementLabelProps } from './MeasurementLabel';

export { DragHandle } from './DragHandle';
export type { DragHandleProps } from './DragHandle';
