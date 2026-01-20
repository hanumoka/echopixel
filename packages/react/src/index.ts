/**
 * @echopixel/react
 *
 * React components for EchoPixel DICOM viewer
 *
 * 컴포넌트 구조:
 * - SingleDicomViewer: 단일 DICOM 뷰어 (풀 UI)
 * - MultiDicomViewer: 멀티 DICOM 뷰어 (그리드, 간소화 UI)
 * - SingleDicomViewerGroup: 싱글 뷰어 그룹 (각자 풀 UI)
 *
 * 빌딩 블록:
 * - DicomCanvas: 순수 캔버스 (WebGL 렌더링)
 * - DicomControls: 재생/정지, FPS, 프레임 슬라이더
 * - DicomStatusBar: 이미지 정보, DPR, Canvas 크기
 * - DicomToolInfo: 마우스/키보드 도구 설명
 * - DicomMiniOverlay: 프레임 번호만 표시 (간소화용)
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
// export { DicomMiniOverlay } from './components/building-blocks/DicomMiniOverlay';

// Composed Components
export {
  SingleDicomViewer,
  type SingleDicomViewerHandle,
  type SingleDicomViewerProps,
} from './components/SingleDicomViewer';
// export { MultiDicomViewer } from './components/MultiDicomViewer';
// export { SingleDicomViewerGroup } from './components/SingleDicomViewerGroup';

// Hooks (추후 구현)
// export { useDicomViewport } from './hooks/useDicomViewport';
