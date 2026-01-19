/**
 * ToolGroupManager - 도구 그룹 관리자
 *
 * 학습 포인트:
 * - 여러 도구 그룹을 중앙에서 관리
 * - 도구 그룹 생성/삭제/조회 API 제공
 * - 전역 싱글톤 패턴
 */

import { ToolGroup } from './ToolGroup';

/**
 * 도구 그룹 관리자 클래스
 *
 * 여러 도구 그룹을 생성하고 관리합니다.
 * 각 도구 그룹은 독립적인 뷰포트 집합에 도구를 제공합니다.
 *
 * @example
 * ```typescript
 * // 도구 그룹 생성
 * const toolGroup = ToolGroupManager.createToolGroup('main');
 *
 * // 도구 그룹 조회
 * const existingGroup = ToolGroupManager.getToolGroup('main');
 *
 * // 도구 그룹 삭제
 * ToolGroupManager.destroyToolGroup('main');
 * ```
 */
class ToolGroupManagerClass {
  /** 생성된 도구 그룹들 */
  private toolGroups: Map<string, ToolGroup> = new Map();

  /**
   * 도구 그룹 생성
   *
   * @param toolGroupId - 그룹 고유 ID
   * @returns 생성된 도구 그룹
   * @throws 이미 존재하는 ID인 경우
   */
  createToolGroup(toolGroupId: string): ToolGroup {
    if (this.toolGroups.has(toolGroupId)) {
      throw new Error(`ToolGroup "${toolGroupId}" already exists`);
    }

    const toolGroup = new ToolGroup(toolGroupId);
    this.toolGroups.set(toolGroupId, toolGroup);

    return toolGroup;
  }

  /**
   * 도구 그룹 조회
   *
   * @param toolGroupId - 그룹 ID
   * @returns 도구 그룹 또는 undefined
   */
  getToolGroup(toolGroupId: string): ToolGroup | undefined {
    return this.toolGroups.get(toolGroupId);
  }

  /**
   * 도구 그룹이 존재하는지 확인
   *
   * @param toolGroupId - 그룹 ID
   */
  hasToolGroup(toolGroupId: string): boolean {
    return this.toolGroups.has(toolGroupId);
  }

  /**
   * 도구 그룹 삭제
   *
   * 연결된 모든 리소스를 정리합니다.
   *
   * @param toolGroupId - 그룹 ID
   * @returns 삭제 성공 여부
   */
  destroyToolGroup(toolGroupId: string): boolean {
    const toolGroup = this.toolGroups.get(toolGroupId);
    if (!toolGroup) {
      return false;
    }

    toolGroup.dispose();
    this.toolGroups.delete(toolGroupId);

    return true;
  }

  /**
   * 모든 도구 그룹 ID 조회
   */
  getAllToolGroupIds(): string[] {
    return Array.from(this.toolGroups.keys());
  }

  /**
   * 도구 그룹 수 조회
   */
  getToolGroupCount(): number {
    return this.toolGroups.size;
  }

  /**
   * 도구 그룹 가져오기 또는 생성
   *
   * 존재하면 반환, 없으면 새로 생성
   *
   * @param toolGroupId - 그룹 ID
   * @returns 도구 그룹
   */
  getOrCreateToolGroup(toolGroupId: string): ToolGroup {
    const existing = this.toolGroups.get(toolGroupId);
    if (existing) {
      return existing;
    }
    return this.createToolGroup(toolGroupId);
  }

  /**
   * 모든 도구 그룹 삭제
   *
   * 모든 그룹의 리소스를 정리합니다.
   */
  destroyAllToolGroups(): void {
    for (const toolGroup of this.toolGroups.values()) {
      toolGroup.dispose();
    }
    this.toolGroups.clear();
  }
}

// 싱글톤 인스턴스
export const ToolGroupManager = new ToolGroupManagerClass();
