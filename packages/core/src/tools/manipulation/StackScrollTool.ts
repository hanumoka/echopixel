/**
 * StackScrollTool - 프레임 스크롤 도구
 *
 * 학습 포인트:
 * - 마우스 휠로 DICOM 스택의 프레임을 탐색
 * - 다중 프레임 이미지(멀티프레임, 시리즈)에서 사용
 * - 프레임 인덱스는 0부터 시작
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
 * StackScroll 도구 설정
 */
export interface StackScrollToolConfiguration extends ToolConfiguration {
  /** 반전 (기본값: false, true면 휠 방향 반전) */
  invert?: boolean;
  /** 루프 (기본값: false, true면 마지막 프레임에서 첫 프레임으로) */
  loop?: boolean;
  /** 프레임 정보 가져오기 함수 */
  getFrameInfo?: (viewportId: string) => { currentFrame: number; frameCount: number } | null;
  /** 프레임 설정 함수 */
  setFrame?: (viewportId: string, frameIndex: number) => void;
}

/**
 * 프레임 스크롤 도구
 *
 * 마우스 휠로 이미지 스택의 프레임을 탐색합니다.
 *
 * @example
 * ```typescript
 * // 도구 등록
 * addTool(StackScrollTool);
 *
 * // 도구 그룹에 추가
 * toolGroup.addTool('StackScroll', {
 *   loop: false,
 *   getFrameInfo: (id) => {
 *     const vp = viewportManager.getViewport(id);
 *     if (!vp?.series) return null;
 *     return {
 *       currentFrame: vp.playback.currentFrame,
 *       frameCount: vp.series.frameCount,
 *     };
 *   },
 *   setFrame: (id, frame) => viewportManager.setViewportFrame(id, frame),
 * });
 *
 * // 활성화 (휠에 바인딩)
 * toolGroup.setToolActive('StackScroll', {
 *   bindings: [{ mouseButton: MouseBindings.Wheel }],
 * });
 * ```
 */
export class StackScrollTool extends BaseTool {
  static toolName = 'StackScroll';

  protected declare configuration: StackScrollToolConfiguration;

  constructor(config?: StackScrollToolConfiguration) {
    super(config);
    this.configuration = {
      invert: false,
      loop: false,
      ...config,
    };
  }

  /**
   * 마우스 휠: 프레임 이동
   */
  onMouseWheel(evt: NormalizedMouseEvent): void {
    const { invert, loop, getFrameInfo, setFrame } = this.configuration;

    // 콜백이 없으면 동작하지 않음
    if (!getFrameInfo || !setFrame) {
      console.warn('[StackScrollTool] getFrameInfo and setFrame must be provided');
      return;
    }

    // 현재 프레임 정보 가져오기
    const frameInfo = getFrameInfo(evt.viewportId);
    if (!frameInfo || frameInfo.frameCount <= 1) {
      return; // 단일 프레임이면 스크롤 불필요
    }

    const { currentFrame, frameCount } = frameInfo;

    // 휠 방향 계산 (wheelDelta > 0 = 위로 스크롤 = 이전 프레임)
    const wheelDelta = evt.wheelDelta ?? 0;
    const direction = invert ? -1 : 1;
    const step = wheelDelta > 0 ? -direction : direction;

    let newFrame = currentFrame + step;

    // 루프 처리
    if (loop) {
      if (newFrame < 0) {
        newFrame = frameCount - 1;
      } else if (newFrame >= frameCount) {
        newFrame = 0;
      }
    } else {
      newFrame = clamp(newFrame, 0, frameCount - 1);
    }

    setFrame(evt.viewportId, newFrame);
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
