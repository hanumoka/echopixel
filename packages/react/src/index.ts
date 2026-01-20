/**
 * @echopixel/react
 *
 * React components for EchoPixel DICOM viewer
 *
 * 컴포넌트 구조:
 * - SingleDicomViewer: 단일 DICOM 뷰어 (풀 UI)
 * - SingleDicomViewerGroup: 다중 SingleDicomViewer 그리드 (각자 캔버스)
 * - HybridMultiViewport: 대규모 멀티 뷰포트 (Single Canvas, DOM-WebGL 하이브리드)
 *
 * 빌딩 블록:
 * - DicomCanvas: 순수 캔버스 (WebGL 렌더링)
 * - DicomControls: 재생/정지, FPS, 프레임 슬라이더
 * - DicomStatusBar: 이미지 정보, DPR, Canvas 크기
 * - DicomToolInfo: 마우스/키보드 도구 설명
 * - DicomToolbar: 도구 선택 툴바 (W/L, Pan, Zoom, 회전)
 * - DicomMiniOverlay: 간소화 오버레이 (멀티 뷰포트용)
 * - HybridViewportGrid: Canvas + DOM Grid 레이어링
 * - HybridViewportSlot: DOM 슬롯 (이벤트 처리)
 */

export const VERSION = '0.0.1';

// Types
export type {
  WindowLevelInfo,
  TransformInfo,
  ImageStatus,
  CanvasInfo,
  PlaybackState,
  ToolMode,
} from './types';

// Building Blocks
export { DicomStatusBar, type DicomStatusBarProps } from './components/building-blocks/DicomStatusBar';
export {
  DicomToolInfo,
  type DicomToolInfoProps,
  type ToolBinding,
  type KeyboardShortcut,
} from './components/building-blocks/DicomToolInfo';
export { DicomControls, type DicomControlsProps } from './components/building-blocks/DicomControls';
export {
  DicomCanvas,
  type DicomCanvasHandle,
  type DicomCanvasProps,
} from './components/building-blocks/DicomCanvas';
export {
  DicomToolbar,
  type DicomToolbarProps,
  type ToolDefinition,
  DEFAULT_TOOLS,
} from './components/building-blocks/DicomToolbar';
export {
  DicomMiniOverlay,
  type DicomMiniOverlayProps,
} from './components/building-blocks/DicomMiniOverlay';
export {
  HybridViewportGrid,
  type HybridViewportGridHandle,
  type HybridViewportGridProps,
} from './components/building-blocks/HybridViewportGrid';
export {
  HybridViewportSlot,
  type HybridViewportSlotProps,
} from './components/building-blocks/HybridViewportSlot';

// Composed Components
export {
  SingleDicomViewer,
  type SingleDicomViewerHandle,
  type SingleDicomViewerProps,
} from './components/SingleDicomViewer';
export {
  SingleDicomViewerGroup,
  type SingleDicomViewerGroupHandle,
  type SingleDicomViewerGroupProps,
  type ViewerData,
  type ViewerGroupLayout,
} from './components/SingleDicomViewerGroup';
export {
  HybridMultiViewport,
  type HybridMultiViewportHandle,
  type HybridMultiViewportProps,
  type HybridSeriesData,
  type HybridViewportStats,
  type PerformanceOptions,
} from './components/HybridMultiViewport';

// Annotation Components (Phase 3c)
export {
  SVGOverlay,
  type SVGOverlayProps,
  LengthShape,
  AngleShape,
  PointShape,
  MeasurementLabel,
  type MeasurementLabelProps,
  DragHandle,
  type DragHandleProps,
} from './components/annotations';

// Hooks (추후 구현)
// export { useDicomViewport } from './hooks/useDicomViewport';
