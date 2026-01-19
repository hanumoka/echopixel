/**
 * ToolRegistry - 전역 도구 등록 관리
 *
 * 학습 포인트:
 * - Singleton 패턴: 전역에서 하나의 레지스트리만 존재
 * - Factory 패턴: 등록된 클래스로부터 인스턴스 생성
 * - 도구는 한 번 등록하면 어디서든 사용 가능
 */

import type { ToolConstructor, ToolConfiguration, ITool } from './types';

/**
 * 전역 도구 레지스트리
 *
 * 앱 시작 시 사용할 도구들을 한 번 등록하면,
 * ToolGroup에서 도구 이름으로 인스턴스를 생성할 수 있습니다.
 *
 * @example
 * ```typescript
 * // 앱 시작 시 (한 번만)
 * addTool(WindowLevelTool);
 * addTool(PanTool);
 * addTool(ZoomTool);
 *
 * // 나중에 ToolGroup에서
 * toolGroup.addTool('WindowLevel');
 * ```
 */
class ToolRegistryClass {
  /** 등록된 도구 클래스들 */
  private tools: Map<string, ToolConstructor> = new Map();

  /**
   * 도구 클래스 등록
   *
   * @param toolClass - 등록할 도구 클래스 (static toolName 필수)
   */
  addTool(toolClass: ToolConstructor): void {
    const toolName = toolClass.toolName;

    if (!toolName) {
      throw new Error('Tool class must have a static toolName property');
    }

    if (this.tools.has(toolName)) {
      console.warn(`Tool "${toolName}" is already registered. Overwriting...`);
    }

    this.tools.set(toolName, toolClass);
  }

  /**
   * 도구 클래스 제거
   *
   * @param toolName - 제거할 도구 이름
   */
  removeTool(toolName: string): boolean {
    return this.tools.delete(toolName);
  }

  /**
   * 도구 클래스 조회
   *
   * @param toolName - 조회할 도구 이름
   * @returns 도구 클래스 또는 undefined
   */
  getTool(toolName: string): ToolConstructor | undefined {
    return this.tools.get(toolName);
  }

  /**
   * 도구 인스턴스 생성
   *
   * @param toolName - 생성할 도구 이름
   * @param config - 도구 설정 (선택적)
   * @returns 도구 인스턴스
   * @throws 등록되지 않은 도구 이름인 경우
   */
  createToolInstance(toolName: string, config?: ToolConfiguration): ITool {
    const ToolClass = this.tools.get(toolName);

    if (!ToolClass) {
      throw new Error(`Tool "${toolName}" is not registered. Available tools: ${this.getRegisteredToolNames().join(', ')}`);
    }

    return new ToolClass(config);
  }

  /**
   * 도구 등록 여부 확인
   *
   * @param toolName - 확인할 도구 이름
   */
  hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * 등록된 모든 도구 이름 조회
   */
  getRegisteredToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 모든 도구 등록 해제
   *
   * 주로 테스트 정리용
   */
  clearAll(): void {
    this.tools.clear();
  }

  /**
   * 등록된 도구 수 조회
   */
  getToolCount(): number {
    return this.tools.size;
  }
}

// Singleton 인스턴스
export const ToolRegistry = new ToolRegistryClass();

// 편의 함수들 (전역 레지스트리에 위임)

/**
 * 도구 클래스 등록 (전역)
 *
 * @param toolClass - 등록할 도구 클래스
 */
export function addTool(toolClass: ToolConstructor): void {
  ToolRegistry.addTool(toolClass);
}

/**
 * 도구 클래스 제거 (전역)
 *
 * @param toolName - 제거할 도구 이름
 */
export function removeTool(toolName: string): boolean {
  return ToolRegistry.removeTool(toolName);
}

/**
 * 도구 등록 여부 확인 (전역)
 *
 * @param toolName - 확인할 도구 이름
 */
export function hasTool(toolName: string): boolean {
  return ToolRegistry.hasTool(toolName);
}

/**
 * 등록된 모든 도구 이름 조회 (전역)
 */
export function getRegisteredToolNames(): string[] {
  return ToolRegistry.getRegisteredToolNames();
}
