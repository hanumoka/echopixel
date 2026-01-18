/**
 * FrameSyncEngine (Phase 2c)
 *
 * 학습 포인트:
 * - 심초음파 스트레스 에코에서 여러 뷰포트 동기화
 * - 시리즈마다 프레임 수가 다를 수 있음
 * - Frame Ratio: 프레임 비율 기반 동기화
 *   예) 마스터 47프레임, 슬레이브 94프레임
 *   마스터 10번째 → 슬레이브 20번째 (10/47 * 94 ≈ 20)
 *
 * 사용 예시:
 * ```ts
 * const sync = new FrameSyncEngine();
 *
 * // 동기화 그룹 생성
 * const groupId = sync.createSyncGroup({
 *   masterId: 'viewport-1',
 *   slaveIds: ['viewport-2', 'viewport-3'],
 *   mode: 'frame-ratio',
 * });
 *
 * // 마스터 프레임 변경 시 슬레이브 동기화
 * const updates = sync.syncFromMaster(
 *   groupId,
 *   10, // 마스터 프레임
 *   47, // 마스터 총 프레임
 *   [94, 62], // 슬레이브 총 프레임
 * );
 * // updates: [20, 13] (각 슬레이브의 동기화된 프레임)
 * ```
 */

import type { SyncGroup, CreateSyncGroupOptions, SyncMode } from './types';

/**
 * 고유 ID 생성
 */
function generateGroupId(): string {
  return `sync-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 프레임 동기화 엔진
 */
export class FrameSyncEngine {
  private groups: Map<string, SyncGroup> = new Map();

  /**
   * 동기화 그룹 생성
   *
   * @param options - 그룹 생성 옵션
   * @returns 생성된 그룹 ID
   */
  createSyncGroup(options: CreateSyncGroupOptions): string {
    const id = generateGroupId();

    const group: SyncGroup = {
      id,
      masterId: options.masterId,
      slaveIds: [...options.slaveIds],
      mode: options.mode ?? 'frame-ratio',
      active: true,
    };

    this.groups.set(id, group);
    return id;
  }

  /**
   * 동기화 그룹 제거
   */
  removeSyncGroup(groupId: string): boolean {
    return this.groups.delete(groupId);
  }

  /**
   * 동기화 그룹 조회
   */
  getSyncGroup(groupId: string): SyncGroup | null {
    return this.groups.get(groupId) ?? null;
  }

  /**
   * 모든 동기화 그룹 조회
   */
  getAllSyncGroups(): SyncGroup[] {
    return Array.from(this.groups.values());
  }

  /**
   * 뷰포트가 속한 그룹 찾기
   *
   * @param viewportId - 뷰포트 ID
   * @returns 그룹 ID와 역할 (master/slave) 또는 null
   */
  findGroupByViewport(viewportId: string): { groupId: string; role: 'master' | 'slave' } | null {
    for (const group of this.groups.values()) {
      if (group.masterId === viewportId) {
        return { groupId: group.id, role: 'master' };
      }
      if (group.slaveIds.includes(viewportId)) {
        return { groupId: group.id, role: 'slave' };
      }
    }
    return null;
  }

  /**
   * 동기화 그룹 활성화/비활성화
   */
  setGroupActive(groupId: string, active: boolean): void {
    const group = this.groups.get(groupId);
    if (group) {
      group.active = active;
    }
  }

  /**
   * 동기화 모드 변경
   */
  setGroupMode(groupId: string, mode: SyncMode): void {
    const group = this.groups.get(groupId);
    if (group) {
      group.mode = mode;
    }
  }

  /**
   * 그룹에 슬레이브 추가
   */
  addSlaveToGroup(groupId: string, slaveId: string): void {
    const group = this.groups.get(groupId);
    if (group && !group.slaveIds.includes(slaveId)) {
      group.slaveIds.push(slaveId);
    }
  }

  /**
   * 그룹에서 슬레이브 제거
   */
  removeSlaveFromGroup(groupId: string, slaveId: string): void {
    const group = this.groups.get(groupId);
    if (group) {
      group.slaveIds = group.slaveIds.filter((id) => id !== slaveId);
    }
  }

  /**
   * 프레임 비율 기반 동기화 계산
   *
   * 학습 포인트:
   * - 마스터와 슬레이브의 프레임 비율로 인덱스 계산
   * - 예) 마스터 47프레임의 10번째 → 슬레이브 94프레임의 20번째
   * - Math.floor로 정수 인덱스 보장
   * - 범위 체크로 안전한 인덱스 반환
   *
   * @param masterFrame - 마스터의 현재 프레임 인덱스
   * @param masterTotal - 마스터의 총 프레임 수
   * @param slaveTotal - 슬레이브의 총 프레임 수
   * @returns 슬레이브의 동기화된 프레임 인덱스
   */
  calculateSyncedFrame(masterFrame: number, masterTotal: number, slaveTotal: number): number {
    if (masterTotal <= 0 || slaveTotal <= 0) {
      return 0;
    }

    // 비율 계산: masterFrame / masterTotal = slaveFrame / slaveTotal
    // slaveFrame = (masterFrame / masterTotal) * slaveTotal
    const ratio = masterFrame / masterTotal;
    const slaveFrame = Math.floor(ratio * slaveTotal);

    // 범위 제한 (0 ~ slaveTotal-1)
    return Math.max(0, Math.min(slaveFrame, slaveTotal - 1));
  }

  /**
   * 마스터 프레임 변경 시 슬레이브들 동기화
   *
   * @param groupId - 동기화 그룹 ID
   * @param masterFrame - 마스터의 현재 프레임 인덱스
   * @param masterTotal - 마스터의 총 프레임 수
   * @param slaveTotals - 각 슬레이브의 총 프레임 수 배열
   * @returns 각 슬레이브의 동기화된 프레임 인덱스 배열
   */
  syncFromMaster(
    groupId: string,
    masterFrame: number,
    masterTotal: number,
    slaveTotals: number[],
  ): number[] {
    const group = this.groups.get(groupId);

    if (!group || !group.active) {
      return slaveTotals.map(() => 0);
    }

    if (group.mode === 'manual') {
      // 수동 모드: 동기화 없음
      return slaveTotals.map(() => -1); // -1 = 변경 없음
    }

    if (group.mode === 'frame-ratio') {
      // 프레임 비율 기반 동기화
      return slaveTotals.map((slaveTotal) =>
        this.calculateSyncedFrame(masterFrame, masterTotal, slaveTotal),
      );
    }

    // time 모드는 추후 구현 (RenderScheduler에서 timestamp 기반)
    return slaveTotals.map(() => 0);
  }

  /**
   * 모든 뷰포트를 동기화 (마스터 기준)
   *
   * ViewportManager와 함께 사용:
   * ```ts
   * const result = syncEngine.syncAllViewports(
   *   groupId,
   *   viewportManager.getViewport(masterId)!.playback.currentFrame,
   *   viewportManager,
   * );
   * // result.updates를 사용해 각 슬레이브의 프레임 업데이트
   * ```
   */
  syncAllViewportsInGroup(
    groupId: string,
    masterFrame: number,
    masterTotal: number,
    viewportFrameCounts: Map<string, number>,
  ): Map<string, number> {
    const group = this.groups.get(groupId);
    const result = new Map<string, number>();

    if (!group || !group.active) {
      return result;
    }

    // 각 슬레이브에 대해 동기화된 프레임 계산
    for (const slaveId of group.slaveIds) {
      const slaveTotal = viewportFrameCounts.get(slaveId);
      if (slaveTotal !== undefined && slaveTotal > 0) {
        const syncedFrame = this.calculateSyncedFrame(masterFrame, masterTotal, slaveTotal);
        result.set(slaveId, syncedFrame);
      }
    }

    return result;
  }

  /**
   * 모든 그룹 제거
   */
  clearAllGroups(): void {
    this.groups.clear();
  }

  /**
   * 그룹 수 조회
   */
  getGroupCount(): number {
    return this.groups.size;
  }
}
