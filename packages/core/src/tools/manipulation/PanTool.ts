/**
 * PanTool - 이미지 이동 도구
 *
 * 학습 포인트:
 * - 마우스 드래그로 이미지 위치 이동
 * - pan 값은 픽셀 단위 오프셋
 * - 렌더링 시 pan 값을 vertex shader나 uniform으로 적용
 */

import { BaseTool } from '../BaseTool';
import type { NormalizedMouseEvent, ToolConfiguration } from '../types';

/**
 * Pan 도구 설정
 */
export interface PanToolConfiguration extends ToolConfiguration {
  /** 감도 (기본값: 1.0) */
  sensitivity?: number;
  /** X축 반전 (기본값: false) */
  invertX?: boolean;
  /** Y축 반전 (기본값: false) */
  invertY?: boolean;
  /** Pan 값 가져오기 함수 */
  getPan?: (viewportId: string) => { x: number; y: number } | null;
  /** Pan 값 설정 함수 */
  setPan?: (viewportId: string, pan: { x: number; y: number }) => void;
}

/**
 * 이미지 이동 도구
 *
 * 마우스 드래그로 이미지를 이동시킵니다.
 *
 * @example
 * ```typescript
 * // 도구 등록
 * addTool(PanTool);
 *
 * // 도구 그룹에 추가
 * toolGroup.addTool('Pan', {
 *   getPan: (id) => viewportManager.getViewport(id)?.pan,
 *   setPan: (id, pan) => viewportManager.setViewportPan(id, pan),
 * });
 *
 * // 활성화 (중클릭에 바인딩)
 * toolGroup.setToolActive('Pan', {
 *   bindings: [{ mouseButton: MouseBindings.Auxiliary }],
 * });
 * ```
 */
export class PanTool extends BaseTool {
  static toolName = 'Pan';

  protected declare configuration: PanToolConfiguration;

  constructor(config?: PanToolConfiguration) {
    super(config);
    this.configuration = {
      sensitivity: 1.0,
      invertX: false,
      invertY: false,
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
   * 마우스 이동: 이미지 이동
   */
  onMouseMove(evt: NormalizedMouseEvent): void {
    if (!this.state.isDragging) return;

    const { sensitivity = 1.0, invertX, invertY, getPan, setPan } = this.configuration;

    // 콜백이 없으면 동작하지 않음
    if (!getPan || !setPan) {
      console.warn('[PanTool] getPan and setPan must be provided');
      return;
    }

    // 현재 pan 값 가져오기
    const currentPan = getPan(evt.viewportId) ?? { x: 0, y: 0 };

    // 델타 적용
    const deltaX = (invertX ? -evt.deltaX : evt.deltaX) * sensitivity;
    const deltaY = (invertY ? -evt.deltaY : evt.deltaY) * sensitivity;

    setPan(evt.viewportId, {
      x: currentPan.x + deltaX,
      y: currentPan.y + deltaY,
    });

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
