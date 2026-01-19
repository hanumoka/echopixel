/**
 * WindowLevelTool - Window/Level 조정 도구
 *
 * 학습 포인트:
 * - 마우스 드래그로 이미지 밝기(Center)와 대비(Width) 조정
 * - deltaX → Width 변경, deltaY → Center 변경
 * - 정규화된 값(0~1) 사용으로 일관된 동작 보장
 */

import { BaseTool } from '../BaseTool';
import type { NormalizedMouseEvent, ToolConfiguration } from '../types';

/**
 * WindowLevel 도구 설정
 */
export interface WindowLevelToolConfiguration extends ToolConfiguration {
  /** 감도 (기본값: 1.0) */
  sensitivity?: number;
  /** X축 반전 (기본값: false) */
  invertX?: boolean;
  /** Y축 반전 (기본값: false) */
  invertY?: boolean;
  /** Window/Level 가져오기 함수 */
  getWindowLevel?: (viewportId: string) => { center: number; width: number } | null;
  /** Window/Level 설정 함수 */
  setWindowLevel?: (viewportId: string, wl: { center: number; width: number }) => void;
}

/**
 * 값을 범위 내로 제한
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Window/Level 조정 도구
 *
 * 마우스 드래그로 이미지의 밝기와 대비를 조정합니다.
 * - 좌우 드래그: Window Width (대비) 조정
 * - 상하 드래그: Window Center (밝기) 조정
 *
 * @example
 * ```typescript
 * // 도구 등록
 * addTool(WindowLevelTool);
 *
 * // 도구 그룹에 추가 (설정과 함께)
 * toolGroup.addTool('WindowLevel', {
 *   sensitivity: 1.0,
 *   getWindowLevel: (id) => viewportManager.getViewport(id)?.windowLevel,
 *   setWindowLevel: (id, wl) => viewportManager.setViewportWindowLevel(id, wl),
 * });
 *
 * // 활성화 (우클릭에 바인딩)
 * toolGroup.setToolActive('WindowLevel', {
 *   bindings: [{ mouseButton: MouseBindings.Secondary }],
 * });
 * ```
 */
export class WindowLevelTool extends BaseTool {
  static toolName = 'WindowLevel';

  protected declare configuration: WindowLevelToolConfiguration;

  constructor(config?: WindowLevelToolConfiguration) {
    super(config);
    // 기본값 설정
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
   * 마우스 이동: W/L 조정
   */
  onMouseMove(evt: NormalizedMouseEvent): void {
    if (!this.state.isDragging) return;

    const { sensitivity = 1.0, invertX, invertY, getWindowLevel, setWindowLevel } =
      this.configuration;

    // 콜백이 없으면 동작하지 않음
    if (!getWindowLevel || !setWindowLevel) {
      console.warn('[WindowLevelTool] getWindowLevel and setWindowLevel must be provided');
      return;
    }

    // 현재 W/L 가져오기
    const currentWL = getWindowLevel(evt.viewportId);
    if (!currentWL) {
      // 기본값으로 시작
      const defaultWL = { center: 0.5, width: 1.0 };
      setWindowLevel(evt.viewportId, defaultWL);
      return;
    }

    // 델타 계산 (감도 및 반전 적용)
    const deltaFactor = 0.002 * sensitivity;
    const deltaX = invertX ? -evt.deltaX : evt.deltaX;
    const deltaY = invertY ? -evt.deltaY : evt.deltaY;

    // Window Width: 가로 드래그로 조정 (오른쪽 = 증가)
    // Window Center: 세로 드래그로 조정 (아래 = 밝아짐)
    const newWidth = clamp(currentWL.width + deltaX * deltaFactor, 0.01, 2.0);
    const newCenter = clamp(currentWL.center - deltaY * deltaFactor, 0, 1);

    setWindowLevel(evt.viewportId, {
      center: newCenter,
      width: newWidth,
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
