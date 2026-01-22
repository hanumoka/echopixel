/**
 * 도구 바인딩 유틸리티
 *
 * 학습 포인트:
 * - 도구별 기본 마우스 바인딩 정책을 중앙에서 관리
 * - isStaticImage 여부에 따라 바인딩이 달라짐 (Zoom, StackScroll)
 * - HybridMultiViewport, SingleDicomViewer에서 동일한 정책 공유
 */

import { MouseBindings, KeyboardModifiers, type ToolBinding } from './types';

/**
 * 조작 도구 ID 목록
 *
 * 이 도구들은 마우스 바인딩으로 활성화되는 도구
 */
export const MANIPULATION_TOOL_IDS = ['WindowLevel', 'Pan', 'Zoom', 'StackScroll'] as const;

export type ManipulationToolId = (typeof MANIPULATION_TOOL_IDS)[number];

/**
 * 도구별 기본 바인딩 반환
 *
 * @param toolId - 도구 ID
 * @param isStaticImage - 정지 이미지 여부 (단일 프레임)
 * @returns 도구에 대한 기본 바인딩 목록
 *
 * @example
 * ```typescript
 * // 동영상 (멀티 프레임)
 * getToolDefaultBindings('Zoom', false);
 * // → [{ mouseButton: Primary, modifierKey: Shift }]
 *
 * // 정지 이미지 (단일 프레임)
 * getToolDefaultBindings('Zoom', true);
 * // → [{ mouseButton: Primary, modifierKey: Shift }, { mouseButton: Wheel }]
 * ```
 *
 * 바인딩 정책:
 * | 도구 | 동영상 | 정지 이미지 |
 * |------|--------|-------------|
 * | WindowLevel | 우클릭 | 우클릭 |
 * | Pan | 중클릭 | 중클릭 |
 * | Zoom | Shift+좌클릭 | Shift+좌클릭, 휠 |
 * | StackScroll | 휠 | (없음) |
 */
export function getToolDefaultBindings(
  toolId: string,
  isStaticImage: boolean
): ToolBinding[] {
  switch (toolId) {
    case 'WindowLevel':
      return [{ mouseButton: MouseBindings.Secondary }];

    case 'Pan':
      return [{ mouseButton: MouseBindings.Auxiliary }];

    case 'Zoom':
      if (isStaticImage) {
        // 정지 이미지: Shift+좌클릭 + 휠 (StackScroll이 없으므로)
        return [
          { mouseButton: MouseBindings.Primary, modifierKey: KeyboardModifiers.Shift },
          { mouseButton: MouseBindings.Wheel },
        ];
      }
      // 동영상: Shift+좌클릭만 (휠은 StackScroll용)
      return [{ mouseButton: MouseBindings.Primary, modifierKey: KeyboardModifiers.Shift }];

    case 'StackScroll':
      // 정지 이미지에서는 스크롤 불필요
      return isStaticImage ? [] : [{ mouseButton: MouseBindings.Wheel }];

    default:
      return [];
  }
}
