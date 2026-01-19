/**
 * Tool System 타입 정의
 *
 * 학습 포인트:
 * - Cornerstone3D 스타일의 플러그인 가능한 도구 시스템
 * - 마우스 바인딩과 키보드 수정자 조합으로 도구 활성화
 * - 도구 모드(Active, Passive, Enabled, Disabled)에 따른 동작 제어
 */

/**
 * 마우스 버튼 바인딩
 *
 * 비트 플래그 형식으로 조합 가능
 * 예: Primary | Secondary = 3 (좌클릭 또는 우클릭)
 */
export enum MouseBindings {
  /** 좌클릭 */
  Primary = 1,
  /** 우클릭 */
  Secondary = 2,
  /** 중클릭 (휠 클릭) */
  Auxiliary = 4,
  /** 마우스 휠 */
  Wheel = 8,
}

/**
 * 키보드 수정자
 *
 * 비트 플래그 형식으로 조합 가능
 * 예: Shift | Ctrl = 3 (Shift+Ctrl 조합)
 */
export enum KeyboardModifiers {
  None = 0,
  Shift = 1,
  Ctrl = 2,
  Alt = 4,
}

/**
 * 도구 모드
 *
 * | 모드     | 설명                      | 동작                         |
 * |----------|---------------------------|------------------------------|
 * | Active   | 마우스 바인딩에 응답       | 이벤트 처리 O, 렌더링 O      |
 * | Passive  | 기존 어노테이션만 조작 가능 | 핸들 선택 시만 응답          |
 * | Enabled  | 렌더링만 수행              | 이벤트 처리 X, 렌더링 O      |
 * | Disabled | 완전 비활성                | 이벤트 X, 렌더링 X           |
 */
export enum ToolModes {
  Active = 'Active',
  Passive = 'Passive',
  Enabled = 'Enabled',
  Disabled = 'Disabled',
}

/**
 * 도구 바인딩 설정
 *
 * 어떤 마우스 버튼과 키보드 수정자 조합으로 도구를 활성화할지 정의
 */
export interface ToolBinding {
  /** 마우스 버튼 */
  mouseButton: MouseBindings;
  /** 키보드 수정자 (선택적, 기본값: None) */
  modifierKey?: KeyboardModifiers;
}

/**
 * 정규화된 마우스 이벤트
 *
 * 브라우저의 원시 이벤트를 도구 시스템에서 사용하기 편한 형태로 변환
 */
export interface NormalizedMouseEvent {
  /** 이벤트가 발생한 DOM 요소 */
  element: HTMLElement;
  /** 뷰포트 ID */
  viewportId: string;

  // 좌표
  /** 클라이언트 X 좌표 (브라우저 뷰포트 기준) */
  clientX: number;
  /** 클라이언트 Y 좌표 (브라우저 뷰포트 기준) */
  clientY: number;
  /** Canvas 내 X 좌표 */
  canvasX: number;
  /** Canvas 내 Y 좌표 */
  canvasY: number;

  // 버튼/수정자
  /** 마우스 버튼 */
  button: MouseBindings;
  /** 현재 활성화된 키보드 수정자 */
  modifiers: KeyboardModifiers;

  // 델타 (드래그용)
  /** X 방향 이동량 (이전 이벤트 대비) */
  deltaX: number;
  /** Y 방향 이동량 (이전 이벤트 대비) */
  deltaY: number;

  // 휠
  /** 휠 델타 (휠 이벤트 시에만 유효) */
  wheelDelta?: number;

  // 원본 이벤트
  /** 원본 브라우저 이벤트 */
  originalEvent: MouseEvent | WheelEvent;
}

/**
 * 도구 설정
 *
 * 각 도구별 커스텀 설정 (예: 감도, 반전 여부 등)
 */
export interface ToolConfiguration {
  [key: string]: unknown;
}

/**
 * 도구 내부 상태
 *
 * 드래그 등 도구 동작 중 상태 추적
 */
export interface ToolState {
  /** 활성화 여부 */
  isActive: boolean;
  /** 드래그 중 여부 */
  isDragging: boolean;
  /** 드래그 시작점 */
  startPoint: { x: number; y: number } | null;
  /** 현재 마우스 위치 */
  currentPoint: { x: number; y: number } | null;
}

/**
 * 도구 활성화 옵션
 *
 * setToolActive() 호출 시 전달
 */
export interface ToolActivationOptions {
  /** 마우스 바인딩 목록 */
  bindings: ToolBinding[];
}

/**
 * 도구 클래스 생성자 타입
 *
 * ToolRegistry에서 도구를 등록할 때 사용
 */
export interface ToolConstructor {
  /** 도구 이름 (정적 속성) */
  toolName: string;
  /** 생성자 */
  new (config?: ToolConfiguration): ITool;
}

/**
 * 도구 인터페이스
 *
 * 모든 도구가 구현해야 하는 메서드
 */
export interface ITool {
  // 라이프사이클
  onActivate(): void;
  onDeactivate(): void;

  // 마우스 이벤트
  onMouseDown(evt: NormalizedMouseEvent): void;
  onMouseMove(evt: NormalizedMouseEvent): void;
  onMouseUp(evt: NormalizedMouseEvent): void;
  onMouseWheel(evt: NormalizedMouseEvent): void;

  // 키보드 이벤트
  onKeyDown(evt: KeyboardEvent): void;
  onKeyUp(evt: KeyboardEvent): void;

  // 모드 제어
  setMode(mode: ToolModes): void;
  getMode(): ToolModes;

  // 상태 접근
  getState(): ToolState;

  // 설정 관리
  getConfiguration(): ToolConfiguration;
  setConfiguration(config: Partial<ToolConfiguration>): void;
}
