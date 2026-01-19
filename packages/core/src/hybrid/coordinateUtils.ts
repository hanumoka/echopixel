/**
 * DOM ↔ WebGL 좌표 변환 유틸리티
 *
 * 학습 포인트:
 * - DOM 좌표계: 좌상단이 원점, Y축 아래로 증가
 * - WebGL 좌표계: 좌하단이 원점, Y축 위로 증가
 * - CSS 픽셀 vs Device 픽셀 (DPR 적용)
 *
 * 변환 공식:
 * webgl_y = canvas_height - dom_bottom
 * (canvas_height는 CSS 픽셀 기준)
 */

import type { WebGLViewportBounds, CoordinateContext } from './types';

/**
 * DOM 요소의 BoundingClientRect를 WebGL viewport 좌표로 변환
 *
 * 핵심 로직:
 * 1. DOM rect는 canvas 기준 상대 좌표로 변환
 * 2. Y축 반전 (DOM top-left → WebGL bottom-left)
 * 3. DPR 적용 (CSS pixels → device pixels)
 *
 * @param elementRect - 변환할 DOM 요소의 BoundingClientRect
 * @param context - 좌표 변환 컨텍스트 (canvas, dpr, canvasRect)
 * @returns WebGL viewport 좌표 (device pixels)
 *
 * @example
 * ```ts
 * const bounds = domRectToWebGLViewport(
 *   element.getBoundingClientRect(),
 *   { canvas, dpr: 2, canvasRect: canvas.getBoundingClientRect() }
 * );
 * gl.viewport(bounds.x, bounds.y, bounds.width, bounds.height);
 * gl.scissor(bounds.x, bounds.y, bounds.width, bounds.height);
 * ```
 */
export function domRectToWebGLViewport(
  elementRect: DOMRect,
  context: CoordinateContext
): WebGLViewportBounds {
  const { dpr, canvasRect } = context;

  // 1. Canvas 기준 상대 좌표 계산 (CSS pixels)
  const relativeLeft = elementRect.left - canvasRect.left;
  const relativeTop = elementRect.top - canvasRect.top;
  const relativeBottom = elementRect.bottom - canvasRect.top;

  // 2. Canvas CSS 높이 (CSS pixels)
  const canvasCssHeight = canvasRect.height;

  // 3. Y축 반전: DOM top → WebGL bottom
  // WebGL y = canvas_css_height - dom_relative_bottom
  const webglY = canvasCssHeight - relativeBottom;

  // 4. DPR 적용 (CSS pixels → device pixels)
  // Math.round로 반올림하여 서브픽셀 렌더링 방지
  return {
    x: Math.round(relativeLeft * dpr),
    y: Math.round(webglY * dpr),
    width: Math.round(elementRect.width * dpr),
    height: Math.round(elementRect.height * dpr),
  };
}

/**
 * WebGL viewport 좌표를 CSS 좌표로 변환 (역변환)
 *
 * 디버깅 또는 overlay 위치 계산에 사용
 *
 * @param webglBounds - WebGL viewport 좌표 (device pixels)
 * @param context - 좌표 변환 컨텍스트
 * @returns CSS 좌표 (canvas 기준 상대 좌표)
 */
export function webglViewportToCssRect(
  webglBounds: WebGLViewportBounds,
  context: CoordinateContext
): { left: number; top: number; width: number; height: number } {
  const { dpr, canvasRect } = context;
  const canvasCssHeight = canvasRect.height;

  // Device pixels → CSS pixels
  const cssX = webglBounds.x / dpr;
  const cssY = webglBounds.y / dpr;
  const cssWidth = webglBounds.width / dpr;
  const cssHeight = webglBounds.height / dpr;

  // Y축 역반전: WebGL bottom → CSS top
  // css_top = canvas_css_height - webgl_y - css_height
  const cssTop = canvasCssHeight - cssY - cssHeight;

  return {
    left: cssX,
    top: cssTop,
    width: cssWidth,
    height: cssHeight,
  };
}

/**
 * 마우스 이벤트 좌표를 WebGL 좌표로 변환
 *
 * 클릭/드래그 이벤트 처리에 사용
 *
 * @param clientX - 마우스 이벤트의 clientX
 * @param clientY - 마우스 이벤트의 clientY
 * @param context - 좌표 변환 컨텍스트
 * @returns WebGL 좌표 (device pixels, canvas 좌하단 기준)
 */
export function clientToWebGL(
  clientX: number,
  clientY: number,
  context: CoordinateContext
): { x: number; y: number } {
  const { dpr, canvasRect } = context;

  // Canvas 기준 상대 좌표
  const relativeX = clientX - canvasRect.left;
  const relativeY = clientY - canvasRect.top;

  // Y축 반전
  const webglY = canvasRect.height - relativeY;

  // DPR 적용
  return {
    x: Math.round(relativeX * dpr),
    y: Math.round(webglY * dpr),
  };
}

/**
 * 좌표 변환 컨텍스트 생성 헬퍼
 *
 * @param canvas - Canvas 요소
 * @param dpr - Device Pixel Ratio (기본값: window.devicePixelRatio)
 * @returns CoordinateContext
 */
export function createCoordinateContext(
  canvas: HTMLCanvasElement,
  dpr: number = Math.min(window.devicePixelRatio || 1, 2)
): CoordinateContext {
  return {
    canvas,
    dpr,
    canvasRect: canvas.getBoundingClientRect(),
  };
}

/**
 * 좌표 컨텍스트 업데이트 (리사이즈 시)
 *
 * @param context - 기존 컨텍스트
 * @returns 업데이트된 컨텍스트
 */
export function updateCoordinateContext(context: CoordinateContext): CoordinateContext {
  return {
    ...context,
    canvasRect: context.canvas.getBoundingClientRect(),
  };
}
