/**
 * ZoomTool - 확대/축소 도구
 *
 * 학습 포인트:
 * - 마우스 드래그 또는 휠로 이미지 확대/축소
 * - zoom 값은 배율 (1.0 = 원본 크기)
 * - 마우스 위치를 기준으로 확대/축소하면 자연스러운 UX
 */

import { BaseTool } from '../BaseTool';
import type { NormalizedMouseEvent, ToolConfiguration } from '../types';

/**
 * 값을 범위 내로 제한
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Zoom 도구 설정
 */
export interface ZoomToolConfiguration extends ToolConfiguration {
  /** 드래그 감도 (기본값: 1.0) */
  sensitivity?: number;
  /** 휠 감도 (기본값: 1.0) */
  wheelSensitivity?: number;
  /** 최소 줌 (기본값: 0.1) */
  minZoom?: number;
  /** 최대 줌 (기본값: 10.0) */
  maxZoom?: number;
  /** 반전 (기본값: false) */
  invert?: boolean;
  /** Zoom 값 가져오기 함수 */
  getZoom?: (viewportId: string) => number | null;
  /** Zoom 값 설정 함수 */
  setZoom?: (viewportId: string, zoom: number) => void;
}

/**
 * 확대/축소 도구
 *
 * 마우스 드래그(상하) 또는 휠로 이미지를 확대/축소합니다.
 *
 * @example
 * ```typescript
 * // 도구 등록
 * addTool(ZoomTool);
 *
 * // 도구 그룹에 추가
 * toolGroup.addTool('Zoom', {
 *   minZoom: 0.1,
 *   maxZoom: 10.0,
 *   getZoom: (id) => viewportManager.getViewport(id)?.zoom,
 *   setZoom: (id, zoom) => viewportManager.setViewportZoom(id, zoom),
 * });
 *
 * // 활성화 (Shift+좌클릭에 바인딩)
 * toolGroup.setToolActive('Zoom', {
 *   bindings: [
 *     { mouseButton: MouseBindings.Primary, modifierKey: KeyboardModifiers.Shift },
 *   ],
 * });
 * ```
 */
export class ZoomTool extends BaseTool {
  static toolName = 'Zoom';

  protected declare configuration: ZoomToolConfiguration;

  constructor(config?: ZoomToolConfiguration) {
    super(config);
    this.configuration = {
      sensitivity: 1.0,
      wheelSensitivity: 1.0,
      minZoom: 0.1,
      maxZoom: 10.0,
      invert: false,
      ...config,
    };
  }

  /**
   * 마우스 다운: 드래그 시작
   */
  onMouseDown(evt: NormalizedMouseEvent): void {
    super.onMouseDown(evt);
  }

  /**
   * 마우스 이동: 확대/축소 (상하 드래그)
   */
  onMouseMove(evt: NormalizedMouseEvent): void {
    if (!this.state.isDragging) return;

    const { sensitivity = 1.0, minZoom = 0.1, maxZoom = 10.0, invert, getZoom, setZoom } =
      this.configuration;

    // 콜백이 없으면 동작하지 않음
    if (!getZoom || !setZoom) {
      console.warn('[ZoomTool] getZoom and setZoom must be provided');
      return;
    }

    // 현재 zoom 값 가져오기
    const currentZoom = getZoom(evt.viewportId) ?? 1.0;

    // 상하 드래그로 확대/축소 (위로 = 확대, 아래로 = 축소)
    const deltaY = invert ? evt.deltaY : -evt.deltaY;
    const zoomFactor = 1 + deltaY * 0.01 * sensitivity;
    const newZoom = clamp(currentZoom * zoomFactor, minZoom, maxZoom);

    setZoom(evt.viewportId, newZoom);

    // 상태 업데이트
    super.onMouseMove(evt);
  }

  /**
   * 마우스 업: 드래그 종료
   */
  onMouseUp(evt: NormalizedMouseEvent): void {
    super.onMouseUp(evt);
  }

  /**
   * 마우스 휠: 확대/축소
   */
  onMouseWheel(evt: NormalizedMouseEvent): void {
    const {
      wheelSensitivity = 1.0,
      minZoom = 0.1,
      maxZoom = 10.0,
      invert,
      getZoom,
      setZoom,
    } = this.configuration;

    // 콜백이 없으면 동작하지 않음
    if (!getZoom || !setZoom) {
      console.warn('[ZoomTool] getZoom and setZoom must be provided');
      return;
    }

    // 현재 zoom 값 가져오기
    const currentZoom = getZoom(evt.viewportId) ?? 1.0;

    // 휠 델타로 확대/축소
    const wheelDelta = evt.wheelDelta ?? 0;
    const direction = invert ? 1 : -1;
    const zoomFactor = 1 + wheelDelta * direction * 0.001 * wheelSensitivity;
    const newZoom = clamp(currentZoom * zoomFactor, minZoom, maxZoom);

    setZoom(evt.viewportId, newZoom);
  }

  /**
   * 도구 활성화
   */
  onActivate(): void {
    super.onActivate();
  }

  /**
   * 도구 비활성화
   */
  onDeactivate(): void {
    super.onDeactivate();
  }
}
