/**
 * Hybrid DOM-WebGL 아키텍처 모듈
 *
 * Single WebGL Canvas + DOM Slots 조합으로 유연한 이벤트 처리와 고성능 렌더링 달성
 */

// Types
export type {
  WebGLViewportBounds,
  ViewportSlotInfo,
  HybridViewport,
  CoordinateContext,
  SyncOptions,
} from './types';

// Coordinate utilities
export {
  domRectToWebGLViewport,
  webglViewportToCssRect,
  clientToWebGL,
  createCoordinateContext,
  updateCoordinateContext,
} from './coordinateUtils';

// HybridViewportManager
export { HybridViewportManager } from './HybridViewportManager';
export type { HybridViewportManagerOptions } from './HybridViewportManager';

// HybridRenderScheduler
export { HybridRenderScheduler } from './HybridRenderScheduler';
