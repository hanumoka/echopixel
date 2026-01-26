/**
 * Hybrid DOM-WebGL 아키텍처 타입 정의
 *
 * 학습 포인트:
 * - DOM 요소와 WebGL 뷰포트 영역의 매핑
 * - 좌표 시스템 변환 (DOM: top-left 원점, WebGL: bottom-left 원점)
 * - DPR(Device Pixel Ratio) 처리
 */

import type { Viewport } from '../viewport/types';

/**
 * WebGL 뷰포트 경계 (gl.viewport/scissor 파라미터)
 *
 * 좌표 시스템:
 * - WebGL: 좌하단이 원점 (0, 0)
 * - x, y, width, height는 device pixel 단위
 */
export interface WebGLViewportBounds {
  /** X 좌표 (좌하단 기준, device pixels) */
  x: number;
  /** Y 좌표 (좌하단 기준, device pixels) */
  y: number;
  /** 너비 (device pixels) */
  width: number;
  /** 높이 (device pixels) */
  height: number;
}

/**
 * DOM 슬롯 정보
 *
 * ViewportSlot React 컴포넌트가 등록할 때 제공하는 정보
 */
export interface ViewportSlotInfo {
  /** 뷰포트 ID (ViewportManager와 연동) */
  viewportId: string;
  /** DOM 요소 참조 */
  element: HTMLElement;
  /** 마지막으로 측정된 DOMRect */
  lastRect: DOMRect | null;
  /** 계산된 WebGL 뷰포트 경계 */
  webglBounds: WebGLViewportBounds | null;
}

/**
 * 하이브리드 뷰포트
 *
 * 기존 Viewport 타입을 확장하여 DOM 슬롯 정보 포함
 */
export interface HybridViewport extends Viewport {
  /** 연결된 DOM 슬롯 정보 */
  slotInfo: ViewportSlotInfo | null;
}

/**
 * 좌표 변환 컨텍스트
 *
 * DOM ↔ WebGL 좌표 변환에 필요한 정보
 */
export interface CoordinateContext {
  /** Canvas 요소 */
  canvas: HTMLCanvasElement;
  /** Canvas의 CSS 크기 대비 물리적 픽셀 크기 비율 */
  dpr: number;
  /** Canvas의 BoundingClientRect */
  canvasRect: DOMRect;
}

/**
 * 동기화 옵션
 */
export interface SyncOptions {
  /** ResizeObserver로 자동 동기화 여부 */
  autoSync: boolean;
  /** 동기화 쓰로틀링 간격 (ms) */
  throttleMs: number;
}
