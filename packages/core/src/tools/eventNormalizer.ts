/**
 * Event Normalizer - 브라우저 이벤트 정규화
 *
 * 학습 포인트:
 * - 브라우저 간 이벤트 차이 추상화
 * - 마우스 버튼 번호 → MouseBindings 변환
 * - 수정자 키 상태 → KeyboardModifiers 변환
 * - 델타 계산을 위한 이전 이벤트 추적
 */

import { MouseBindings, KeyboardModifiers, type NormalizedMouseEvent } from './types';

/**
 * 이벤트 정규화 컨텍스트
 *
 * 뷰포트별로 이전 마우스 위치를 추적하여 델타 계산
 */
interface NormalizerContext {
  /** 이전 마우스 X 좌표 */
  lastX: number;
  /** 이전 마우스 Y 좌표 */
  lastY: number;
}

// 뷰포트별 컨텍스트 저장
const contexts: Map<string, NormalizerContext> = new Map();

/**
 * 브라우저 마우스 버튼 번호를 MouseBindings로 변환
 *
 * 브라우저 button 값:
 * - 0: 좌클릭 (Primary)
 * - 1: 중클릭 (Auxiliary)
 * - 2: 우클릭 (Secondary)
 *
 * @param button - 브라우저 마우스 버튼 번호
 * @returns MouseBindings 값
 */
export function mouseButtonToBinding(button: number): MouseBindings {
  switch (button) {
    case 0:
      return MouseBindings.Primary;
    case 1:
      return MouseBindings.Auxiliary;
    case 2:
      return MouseBindings.Secondary;
    default:
      return MouseBindings.Primary;
  }
}

/**
 * 현재 눌린 수정자 키 상태를 KeyboardModifiers로 변환
 *
 * @param evt - 마우스 이벤트 또는 키보드 이벤트
 * @returns KeyboardModifiers 비트 플래그
 */
export function getModifiers(evt: MouseEvent | WheelEvent | KeyboardEvent): KeyboardModifiers {
  let modifiers = KeyboardModifiers.None;

  if (evt.shiftKey) {
    modifiers |= KeyboardModifiers.Shift;
  }
  if (evt.ctrlKey || evt.metaKey) {
    // Mac에서는 metaKey(Cmd)를 Ctrl처럼 처리
    modifiers |= KeyboardModifiers.Ctrl;
  }
  if (evt.altKey) {
    modifiers |= KeyboardModifiers.Alt;
  }

  return modifiers;
}

/**
 * Canvas 내 좌표 계산
 *
 * 클라이언트 좌표를 Canvas 내 좌표로 변환
 *
 * @param element - 대상 DOM 요소
 * @param clientX - 클라이언트 X 좌표
 * @param clientY - 클라이언트 Y 좌표
 * @returns Canvas 내 좌표 { x, y }
 */
export function getCanvasCoordinates(
  element: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

/**
 * 마우스 이벤트 정규화
 *
 * 브라우저 원시 이벤트를 도구 시스템용 NormalizedMouseEvent로 변환
 *
 * @param evt - 브라우저 마우스 이벤트
 * @param element - 이벤트 대상 DOM 요소
 * @param viewportId - 뷰포트 ID
 * @returns 정규화된 마우스 이벤트
 */
export function normalizeMouseEvent(
  evt: MouseEvent,
  element: HTMLElement,
  viewportId: string,
): NormalizedMouseEvent {
  // 컨텍스트 가져오기 또는 생성
  let context = contexts.get(viewportId);
  if (!context) {
    context = { lastX: evt.clientX, lastY: evt.clientY };
    contexts.set(viewportId, context);
  }

  // 델타 계산
  const deltaX = evt.clientX - context.lastX;
  const deltaY = evt.clientY - context.lastY;

  // 컨텍스트 업데이트
  context.lastX = evt.clientX;
  context.lastY = evt.clientY;

  // Canvas 좌표 계산
  const canvasCoords = getCanvasCoordinates(element, evt.clientX, evt.clientY);

  return {
    element,
    viewportId,
    clientX: evt.clientX,
    clientY: evt.clientY,
    canvasX: canvasCoords.x,
    canvasY: canvasCoords.y,
    button: mouseButtonToBinding(evt.button),
    modifiers: getModifiers(evt),
    deltaX,
    deltaY,
    originalEvent: evt,
  };
}

/**
 * 휠 이벤트 정규화
 *
 * @param evt - 브라우저 휠 이벤트
 * @param element - 이벤트 대상 DOM 요소
 * @param viewportId - 뷰포트 ID
 * @returns 정규화된 마우스 이벤트 (wheelDelta 포함)
 */
export function normalizeWheelEvent(
  evt: WheelEvent,
  element: HTMLElement,
  viewportId: string,
): NormalizedMouseEvent {
  // Canvas 좌표 계산
  const canvasCoords = getCanvasCoordinates(element, evt.clientX, evt.clientY);

  // 휠 델타 정규화
  // deltaY: 아래로 스크롤하면 양수, 위로 스크롤하면 음수
  // deltaMode에 따라 값 정규화 (0: pixels, 1: lines, 2: pages)
  let wheelDelta = evt.deltaY;
  if (evt.deltaMode === 1) {
    // 라인 단위 → 픽셀 단위로 변환 (대략 16px per line)
    wheelDelta *= 16;
  } else if (evt.deltaMode === 2) {
    // 페이지 단위 → 픽셀 단위로 변환 (대략 800px per page)
    wheelDelta *= 800;
  }

  return {
    element,
    viewportId,
    clientX: evt.clientX,
    clientY: evt.clientY,
    canvasX: canvasCoords.x,
    canvasY: canvasCoords.y,
    button: MouseBindings.Wheel,
    modifiers: getModifiers(evt),
    deltaX: 0,
    deltaY: 0,
    wheelDelta,
    originalEvent: evt,
  };
}

/**
 * 뷰포트의 정규화 컨텍스트 리셋
 *
 * 마우스가 뷰포트를 벗어났다가 다시 들어올 때 호출
 *
 * @param viewportId - 뷰포트 ID
 */
export function resetContext(viewportId: string): void {
  contexts.delete(viewportId);
}

/**
 * 뷰포트의 정규화 컨텍스트 초기화
 *
 * 마우스 다운 시 델타 계산 기준점 설정
 *
 * @param viewportId - 뷰포트 ID
 * @param x - 초기 X 좌표
 * @param y - 초기 Y 좌표
 */
export function initContext(viewportId: string, x: number, y: number): void {
  contexts.set(viewportId, { lastX: x, lastY: y });
}

/**
 * 모든 정규화 컨텍스트 정리
 *
 * 테스트 또는 전체 리셋 시 사용
 */
export function clearAllContexts(): void {
  contexts.clear();
}

/**
 * 바인딩 매칭 확인
 *
 * 현재 이벤트가 도구 바인딩과 일치하는지 확인
 *
 * @param evt - 정규화된 마우스 이벤트
 * @param button - 기대하는 마우스 버튼
 * @param modifierKey - 기대하는 수정자 키 (선택적)
 * @returns 매칭 여부
 */
export function matchesBinding(
  evt: NormalizedMouseEvent,
  button: MouseBindings,
  modifierKey?: KeyboardModifiers,
): boolean {
  // 버튼 체크
  if (evt.button !== button) {
    return false;
  }

  // 수정자 키 체크
  const expectedModifier = modifierKey ?? KeyboardModifiers.None;
  return evt.modifiers === expectedModifier;
}
