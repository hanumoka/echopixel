/**
 * BaseTool - 모든 도구의 추상 기본 클래스
 *
 * 학습 포인트:
 * - Template Method 패턴: 기본 동작은 여기서 정의, 세부 동작은 서브클래스에서 오버라이드
 * - 상태 관리: isDragging, startPoint 등 공통 상태를 기본 클래스에서 관리
 * - 라이프사이클: activate → 사용 → deactivate 순서로 관리
 */

import { ToolModes } from './types';
import type {
  ToolConfiguration,
  ToolState,
  NormalizedMouseEvent,
  ITool,
} from './types';

/**
 * 추상 기본 도구 클래스
 *
 * 모든 도구는 이 클래스를 상속받아 구현합니다.
 *
 * @example
 * ```typescript
 * class WindowLevelTool extends BaseTool {
 *   static toolName = 'WindowLevel';
 *
 *   onMouseDown(evt: NormalizedMouseEvent): void {
 *     super.onMouseDown(evt);
 *     // 커스텀 로직...
 *   }
 *
 *   onMouseMove(evt: NormalizedMouseEvent): void {
 *     if (!this.state.isDragging) return;
 *     // Window/Level 조정 로직...
 *   }
 * }
 * ```
 */
export abstract class BaseTool implements ITool {
  /**
   * 도구 이름 (정적 속성)
   *
   * 서브클래스에서 반드시 오버라이드해야 함
   */
  static toolName: string = 'BaseTool';

  /** 현재 도구 모드 */
  protected mode: ToolModes = ToolModes.Disabled;

  /** 도구 설정 */
  protected configuration: ToolConfiguration;

  /** 도구 내부 상태 */
  protected state: ToolState;

  /**
   * @param config - 도구 설정 (선택적)
   */
  constructor(config?: ToolConfiguration) {
    this.configuration = config ?? {};
    this.state = {
      isActive: false,
      isDragging: false,
      startPoint: null,
      currentPoint: null,
    };
  }

  // ===== 라이프사이클 메서드 =====

  /**
   * 도구 활성화 시 호출
   *
   * 서브클래스에서 초기화 로직 구현
   */
  onActivate(): void {
    this.state.isActive = true;
  }

  /**
   * 도구 비활성화 시 호출
   *
   * 서브클래스에서 정리 로직 구현
   */
  onDeactivate(): void {
    this.state.isActive = false;
    this.state.isDragging = false;
    this.state.startPoint = null;
    this.state.currentPoint = null;
  }

  // ===== 마우스 이벤트 핸들러 =====

  /**
   * 마우스 다운 이벤트
   *
   * 기본 구현: 드래그 시작점 설정
   */
  onMouseDown(evt: NormalizedMouseEvent): void {
    this.state.isDragging = true;
    this.state.startPoint = { x: evt.clientX, y: evt.clientY };
    this.state.currentPoint = { x: evt.clientX, y: evt.clientY };
  }

  /**
   * 마우스 이동 이벤트
   *
   * 기본 구현: 현재 위치 업데이트
   */
  onMouseMove(evt: NormalizedMouseEvent): void {
    if (this.state.isDragging) {
      this.state.currentPoint = { x: evt.clientX, y: evt.clientY };
    }
  }

  /**
   * 마우스 업 이벤트
   *
   * 기본 구현: 드래그 종료
   */
  onMouseUp(_evt: NormalizedMouseEvent): void {
    this.state.isDragging = false;
    this.state.startPoint = null;
    this.state.currentPoint = null;
  }

  /**
   * 마우스 휠 이벤트
   *
   * 기본 구현: 아무것도 하지 않음 (서브클래스에서 필요시 오버라이드)
   */
  onMouseWheel(_evt: NormalizedMouseEvent): void {
    // 서브클래스에서 구현
  }

  // ===== 키보드 이벤트 핸들러 =====

  /**
   * 키 다운 이벤트
   *
   * 기본 구현: 아무것도 하지 않음
   */
  onKeyDown(_evt: KeyboardEvent): void {
    // 서브클래스에서 구현
  }

  /**
   * 키 업 이벤트
   *
   * 기본 구현: 아무것도 하지 않음
   */
  onKeyUp(_evt: KeyboardEvent): void {
    // 서브클래스에서 구현
  }

  // ===== 모드 제어 =====

  /**
   * 도구 모드 설정
   */
  setMode(mode: ToolModes): void {
    this.mode = mode;
  }

  /**
   * 현재 도구 모드 조회
   */
  getMode(): ToolModes {
    return this.mode;
  }

  // ===== 상태 접근 =====

  /**
   * 도구 내부 상태 조회
   */
  getState(): ToolState {
    return { ...this.state };
  }

  /**
   * 도구 설정 조회
   */
  getConfiguration(): ToolConfiguration {
    return { ...this.configuration };
  }

  /**
   * 도구 설정 업데이트
   */
  setConfiguration(config: Partial<ToolConfiguration>): void {
    this.configuration = { ...this.configuration, ...config };
  }
}
