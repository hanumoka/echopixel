/**
 * ToolGroup - 뷰포트별 도구 그룹 관리
 *
 * 학습 포인트:
 * - 여러 뷰포트에 동일한 도구 설정을 공유
 * - 도구-바인딩 매핑으로 마우스 이벤트 라우팅
 * - 이벤트 리스너 자동 관리 (등록/해제)
 */

import { MouseBindings, KeyboardModifiers, ToolModes } from './types';
import type {
  ITool,
  ToolBinding,
  ToolActivationOptions,
  NormalizedMouseEvent,
  ToolConfiguration,
} from './types';
import { ToolRegistry } from './ToolRegistry';
import {
  normalizeMouseEvent,
  normalizeWheelEvent,
  matchesBinding,
  initContext,
} from './eventNormalizer';

/**
 * 뷰포트 정보
 */
interface ViewportInfo {
  /** 뷰포트 ID */
  viewportId: string;
  /** DOM 요소 */
  element: HTMLElement;
  /** 이벤트 리스너 해제 함수 */
  removeListeners: () => void;
}

/**
 * 도구 인스턴스 정보
 */
interface ToolInstance {
  /** 도구 인스턴스 */
  tool: ITool;
  /** 도구 이름 */
  toolName: string;
  /** 바인딩 목록 */
  bindings: ToolBinding[];
}

/**
 * 도구 그룹
 *
 * 하나 이상의 뷰포트에 동일한 도구 설정을 적용합니다.
 * 각 뷰포트에서 발생하는 이벤트는 활성화된 도구로 라우팅됩니다.
 *
 * @example
 * ```typescript
 * const toolGroup = new ToolGroup('main');
 *
 * // 도구 추가
 * toolGroup.addTool('WindowLevel');
 * toolGroup.addTool('Pan');
 *
 * // 뷰포트 연결
 * toolGroup.addViewport('viewport1', element1);
 * toolGroup.addViewport('viewport2', element2);
 *
 * // 도구 활성화
 * toolGroup.setToolActive('WindowLevel', {
 *   bindings: [{ mouseButton: MouseBindings.Secondary }],
 * });
 * ```
 */
export class ToolGroup {
  /** 그룹 ID */
  readonly id: string;

  /** 연결된 뷰포트들 */
  private viewports: Map<string, ViewportInfo> = new Map();

  /** 도구 인스턴스들 */
  private tools: Map<string, ToolInstance> = new Map();

  /** 현재 드래그 중인 도구 */
  private activeDragTool: ITool | null = null;

  /** 현재 드래그 중인 뷰포트 ID */
  private activeDragViewportId: string | null = null;

  /**
   * @param id - 그룹 고유 ID
   */
  constructor(id: string) {
    this.id = id;

    // 전역 마우스 업 핸들러 (드래그가 뷰포트 밖에서 끝날 때)
    this.handleGlobalMouseUp = this.handleGlobalMouseUp.bind(this);
    window.addEventListener('mouseup', this.handleGlobalMouseUp);
  }

  // ===== 도구 관리 =====

  /**
   * 도구 추가
   *
   * ToolRegistry에서 도구 클래스를 찾아 인스턴스 생성
   *
   * @param toolName - 도구 이름
   * @param config - 도구 설정 (선택적)
   */
  addTool(toolName: string, config?: ToolConfiguration): void {
    if (this.tools.has(toolName)) {
      console.warn(`[ToolGroup ${this.id}] Tool "${toolName}" already exists`);
      return;
    }

    const tool = ToolRegistry.createToolInstance(toolName, config);

    this.tools.set(toolName, {
      tool,
      toolName,
      bindings: [],
    });
  }

  /**
   * 도구 제거
   *
   * @param toolName - 도구 이름
   */
  removeTool(toolName: string): void {
    const toolInstance = this.tools.get(toolName);
    if (toolInstance) {
      toolInstance.tool.onDeactivate();
      this.tools.delete(toolName);
    }
  }

  /**
   * 도구 인스턴스 조회
   *
   * @param toolName - 도구 이름
   * @returns 도구 인스턴스 또는 undefined
   */
  getTool(toolName: string): ITool | undefined {
    return this.tools.get(toolName)?.tool;
  }

  /**
   * 모든 도구 이름 조회
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  // ===== 도구 모드 제어 =====

  /**
   * 도구를 Active 모드로 설정하고 바인딩 적용
   *
   * @param toolName - 도구 이름
   * @param options - 활성화 옵션 (바인딩 포함)
   */
  setToolActive(toolName: string, options: ToolActivationOptions): void {
    const toolInstance = this.tools.get(toolName);
    if (!toolInstance) {
      console.warn(`[ToolGroup ${this.id}] Tool "${toolName}" not found`);
      return;
    }

    // 이전 바인딩과 충돌하는 도구들 비활성화
    for (const binding of options.bindings) {
      this.clearConflictingBindings(toolName, binding);
    }

    // 바인딩 설정
    toolInstance.bindings = options.bindings;

    // 모드 변경 및 활성화
    toolInstance.tool.setMode(ToolModes.Active);
    toolInstance.tool.onActivate();
  }

  /**
   * 도구를 Passive 모드로 설정
   *
   * @param toolName - 도구 이름
   */
  setToolPassive(toolName: string): void {
    const toolInstance = this.tools.get(toolName);
    if (!toolInstance) return;

    toolInstance.bindings = [];
    toolInstance.tool.setMode(ToolModes.Passive);
  }

  /**
   * 도구를 Enabled 모드로 설정
   *
   * @param toolName - 도구 이름
   */
  setToolEnabled(toolName: string): void {
    const toolInstance = this.tools.get(toolName);
    if (!toolInstance) return;

    toolInstance.bindings = [];
    toolInstance.tool.setMode(ToolModes.Enabled);
  }

  /**
   * 도구를 Disabled 모드로 설정
   *
   * @param toolName - 도구 이름
   */
  setToolDisabled(toolName: string): void {
    const toolInstance = this.tools.get(toolName);
    if (!toolInstance) return;

    toolInstance.bindings = [];
    toolInstance.tool.setMode(ToolModes.Disabled);
    toolInstance.tool.onDeactivate();
  }

  /**
   * 도구 모드 조회
   *
   * @param toolName - 도구 이름
   */
  getToolMode(toolName: string): ToolModes | undefined {
    return this.tools.get(toolName)?.tool.getMode();
  }

  // ===== 뷰포트 관리 =====

  /**
   * 뷰포트 연결
   *
   * 뷰포트에 이벤트 리스너를 등록합니다.
   *
   * @param viewportId - 뷰포트 ID
   * @param element - DOM 요소
   */
  addViewport(viewportId: string, element: HTMLElement): void {
    if (this.viewports.has(viewportId)) {
      console.warn(`[ToolGroup ${this.id}] Viewport "${viewportId}" already exists`);
      return;
    }

    // 이벤트 핸들러 바인딩
    const handleMouseDown = (evt: MouseEvent) => this.onMouseDown(evt, viewportId, element);
    const handleMouseMove = (evt: MouseEvent) => this.onMouseMove(evt, viewportId, element);
    const handleMouseUp = (evt: MouseEvent) => this.onMouseUp(evt, viewportId, element);
    const handleWheel = (evt: WheelEvent) => this.onWheel(evt, viewportId, element);
    const handleContextMenu = (evt: MouseEvent) => evt.preventDefault();

    // 이벤트 리스너 등록
    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseup', handleMouseUp);
    element.addEventListener('wheel', handleWheel, { passive: false });
    element.addEventListener('contextmenu', handleContextMenu);

    // 해제 함수 생성
    const removeListeners = () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseup', handleMouseUp);
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('contextmenu', handleContextMenu);
    };

    this.viewports.set(viewportId, {
      viewportId,
      element,
      removeListeners,
    });
  }

  /**
   * 뷰포트 연결 해제
   *
   * @param viewportId - 뷰포트 ID
   */
  removeViewport(viewportId: string): void {
    const viewportInfo = this.viewports.get(viewportId);
    if (viewportInfo) {
      viewportInfo.removeListeners();
      this.viewports.delete(viewportId);
    }
  }

  /**
   * 연결된 뷰포트 ID 목록 조회
   */
  getViewportIds(): string[] {
    return Array.from(this.viewports.keys());
  }

  // ===== 이벤트 핸들링 =====

  /**
   * 마우스 다운 이벤트 처리
   */
  private onMouseDown(evt: MouseEvent, viewportId: string, element: HTMLElement): void {
    // ★ 어노테이션 관련 요소 클릭이면 무시 (어노테이션 편집/선택 우선)
    // - .drag-handle: 어노테이션 포인트 드래그 핸들
    // - .annotation-shape: 어노테이션 도형 (선택용)
    const target = evt.target as Element;
    if (target.closest('.drag-handle, .annotation-shape')) {
      return;
    }

    const normalizedEvt = normalizeMouseEvent(evt, element, viewportId);

    // 델타 계산을 위한 컨텍스트 초기화
    initContext(viewportId, evt.clientX, evt.clientY);

    // 매칭되는 도구 찾기
    const matchedTool = this.findMatchingTool(normalizedEvt);
    if (matchedTool) {
      this.activeDragTool = matchedTool;
      this.activeDragViewportId = viewportId;
      matchedTool.onMouseDown(normalizedEvt);
    }
  }

  /**
   * 마우스 이동 이벤트 처리
   *
   * 학습 포인트:
   * - 드래그가 시작된 뷰포트를 벗어나도 이벤트를 계속 전달
   * - activeDragViewportId로 원래 뷰포트 컨텍스트 유지
   */
  private onMouseMove(evt: MouseEvent, _viewportId: string, _element: HTMLElement): void {
    // 드래그 중인 도구가 있으면 해당 도구로 이벤트 전달
    // 드래그 시작 뷰포트가 아닌 다른 뷰포트에서도 이벤트를 받음
    if (this.activeDragTool && this.activeDragViewportId) {
      // 원래 드래그를 시작한 뷰포트의 정보로 이벤트 정규화
      const originalViewport = this.viewports.get(this.activeDragViewportId);
      if (originalViewport) {
        const normalizedEvt = normalizeMouseEvent(
          evt,
          originalViewport.element,
          this.activeDragViewportId,
        );
        this.activeDragTool.onMouseMove(normalizedEvt);
      }
    }
  }

  /**
   * 마우스 업 이벤트 처리
   */
  private onMouseUp(evt: MouseEvent, _viewportId: string, _element: HTMLElement): void {
    // 드래그 중인 도구가 있으면 (어떤 뷰포트에서든) 이벤트 전달
    if (this.activeDragTool && this.activeDragViewportId) {
      const originalViewport = this.viewports.get(this.activeDragViewportId);
      if (originalViewport) {
        const normalizedEvt = normalizeMouseEvent(
          evt,
          originalViewport.element,
          this.activeDragViewportId,
        );
        this.activeDragTool.onMouseUp(normalizedEvt);
      }
      this.activeDragTool = null;
      this.activeDragViewportId = null;
    }
  }

  /**
   * 휠 이벤트 처리
   */
  private onWheel(evt: WheelEvent, viewportId: string, element: HTMLElement): void {
    const normalizedEvt = normalizeWheelEvent(evt, element, viewportId);

    // 휠에 바인딩된 도구 찾기
    const wheelTool = this.findWheelTool();
    if (wheelTool) {
      evt.preventDefault();
      wheelTool.onMouseWheel(normalizedEvt);
    }
  }

  /**
   * 전역 마우스 업 이벤트 처리 (드래그가 뷰포트 밖에서 끝날 때)
   */
  private handleGlobalMouseUp(evt: MouseEvent): void {
    if (this.activeDragTool) {
      // 임의의 뷰포트 정보로 이벤트 생성
      const viewportInfo = this.viewports.get(this.activeDragViewportId ?? '');
      if (viewportInfo) {
        const normalizedEvt = normalizeMouseEvent(
          evt,
          viewportInfo.element,
          viewportInfo.viewportId,
        );
        this.activeDragTool.onMouseUp(normalizedEvt);
      }
      this.activeDragTool = null;
      this.activeDragViewportId = null;
    }
  }

  // ===== 유틸리티 =====

  /**
   * 이벤트와 매칭되는 도구 찾기
   */
  private findMatchingTool(evt: NormalizedMouseEvent): ITool | null {
    for (const { tool, bindings } of this.tools.values()) {
      if (tool.getMode() !== ToolModes.Active) continue;

      for (const binding of bindings) {
        if (matchesBinding(evt, binding.mouseButton, binding.modifierKey)) {
          return tool;
        }
      }
    }
    return null;
  }

  /**
   * 휠에 바인딩된 도구 찾기
   */
  private findWheelTool(): ITool | null {
    for (const { tool, bindings } of this.tools.values()) {
      if (tool.getMode() !== ToolModes.Active) continue;

      for (const binding of bindings) {
        if (binding.mouseButton === MouseBindings.Wheel) {
          return tool;
        }
      }
    }
    return null;
  }

  /**
   * 충돌하는 바인딩 제거
   *
   * 같은 바인딩을 가진 다른 도구의 해당 바인딩을 제거
   */
  private clearConflictingBindings(excludeToolName: string, binding: ToolBinding): void {
    for (const [toolName, instance] of this.tools.entries()) {
      if (toolName === excludeToolName) continue;

      instance.bindings = instance.bindings.filter(
        (b) =>
          !(
            b.mouseButton === binding.mouseButton &&
            (b.modifierKey ?? KeyboardModifiers.None) ===
              (binding.modifierKey ?? KeyboardModifiers.None)
          ),
      );
    }
  }

  /**
   * 리소스 정리
   *
   * 모든 이벤트 리스너 해제 및 도구 비활성화
   */
  dispose(): void {
    // 전역 이벤트 리스너 해제
    window.removeEventListener('mouseup', this.handleGlobalMouseUp);

    // 모든 뷰포트 이벤트 리스너 해제
    for (const viewportInfo of this.viewports.values()) {
      viewportInfo.removeListeners();
    }
    this.viewports.clear();

    // 모든 도구 비활성화
    for (const { tool } of this.tools.values()) {
      tool.onDeactivate();
    }
    this.tools.clear();

    this.activeDragTool = null;
    this.activeDragViewportId = null;
  }
}
