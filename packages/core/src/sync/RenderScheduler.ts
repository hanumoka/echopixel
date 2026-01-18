/**
 * RenderScheduler (Phase 2c)
 *
 * 학습 포인트:
 * - 단일 requestAnimationFrame 루프로 모든 뷰포트 렌더링
 * - 뷰포트별 개별 rAF 대신 통합 루프 → 드라이버 오버헤드 감소
 * - 각 뷰포트의 FPS에 따라 프레임 업데이트 시점 결정
 * - gl.scissor() + gl.viewport()로 Canvas 내 렌더링 영역 제한
 *
 * 렌더링 흐름:
 * 1. requestAnimationFrame 콜백 시작
 * 2. 각 뷰포트에 대해:
 *    a. FPS에 따라 프레임 업데이트 필요 여부 판단
 *    b. gl.scissor(x, y, width, height) 설정
 *    c. gl.viewport(x, y, width, height) 설정
 *    d. onRenderViewport 콜백 호출 (실제 렌더링)
 * 3. 다음 프레임 예약
 */

import type { Viewport } from '../viewport/types';
import type { RenderSchedulerOptions, RenderStats, ViewportRenderCallback, FrameUpdateCallback } from './types';
import { ViewportManager } from '../viewport/ViewportManager';
import { FrameSyncEngine } from './FrameSyncEngine';

/**
 * 렌더링 스케줄러
 */
export class RenderScheduler {
  private gl: WebGL2RenderingContext;
  private viewportManager: ViewportManager;
  private syncEngine: FrameSyncEngine;

  private animationId: number | null = null;
  private isRunning = false;

  // 옵션
  private maxFps: number;
  private frameBudget: number;

  // 콜백
  private onRenderViewport: ViewportRenderCallback | null = null;
  private onFrameUpdate: FrameUpdateCallback | null = null;

  // 통계
  private stats: RenderStats = {
    frameTime: 0,
    fps: 0,
    renderedViewports: 0,
    totalFrames: 0,
    droppedFrames: 0,
  };

  private lastTickTime = 0;
  private fpsCounter = 0;
  private fpsLastUpdate = 0;

  /**
   * @param gl - WebGL2 컨텍스트
   * @param viewportManager - 뷰포트 관리자
   * @param syncEngine - 프레임 동기화 엔진
   * @param options - 스케줄러 옵션
   */
  constructor(
    gl: WebGL2RenderingContext,
    viewportManager: ViewportManager,
    syncEngine: FrameSyncEngine,
    options?: RenderSchedulerOptions,
  ) {
    this.gl = gl;
    this.viewportManager = viewportManager;
    this.syncEngine = syncEngine;

    this.maxFps = options?.maxFps ?? 60;
    this.frameBudget = options?.frameBudget ?? 1000 / this.maxFps;
  }

  /**
   * 렌더링 콜백 설정
   *
   * 이 콜백에서 실제 WebGL 렌더링 수행
   */
  setRenderCallback(callback: ViewportRenderCallback): void {
    this.onRenderViewport = callback;
  }

  /**
   * 프레임 업데이트 콜백 설정
   *
   * 프레임이 변경될 때 호출 (UI 상태 업데이트용)
   */
  setFrameUpdateCallback(callback: FrameUpdateCallback): void {
    this.onFrameUpdate = callback;
  }

  /**
   * 렌더링 루프 시작
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTickTime = performance.now();
    this.fpsLastUpdate = this.lastTickTime;

    const tick = (timestamp: number): void => {
      if (!this.isRunning) return;

      const deltaTime = timestamp - this.lastTickTime;
      this.lastTickTime = timestamp;

      // FPS 계산
      this.fpsCounter++;
      if (timestamp - this.fpsLastUpdate >= 1000) {
        this.stats.fps = this.fpsCounter;
        this.fpsCounter = 0;
        this.fpsLastUpdate = timestamp;
      }

      const frameStart = performance.now();

      // 모든 뷰포트 업데이트 및 렌더링
      this.updateAndRenderViewports(timestamp, deltaTime);

      // 프레임 시간 측정
      this.stats.frameTime = performance.now() - frameStart;
      this.stats.totalFrames++;

      // 다음 프레임 예약
      this.animationId = requestAnimationFrame(tick);
    };

    this.animationId = requestAnimationFrame(tick);
  }

  /**
   * 렌더링 루프 정지
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * 렌더링 루프 실행 중 여부
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * 모든 뷰포트 업데이트 및 렌더링 (내부)
   */
  private updateAndRenderViewports(timestamp: number, deltaTime: number): void {
    const gl = this.gl;
    const viewports = this.viewportManager.getActiveViewports();

    // 전체 Canvas 클리어
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Scissor 테스트 활성화
    gl.enable(gl.SCISSOR_TEST);

    let renderedCount = 0;

    for (const viewport of viewports) {
      // 시리즈가 없으면 빈 뷰포트 렌더링 스킵
      if (!viewport.series) {
        this.renderEmptyViewport(viewport);
        continue;
      }

      // 재생 중이면 프레임 업데이트
      if (viewport.playback.isPlaying) {
        this.updateViewportFrame(viewport, timestamp);
      }

      // 렌더링 영역 설정
      const { x, y, width, height } = viewport.bounds;
      gl.scissor(x, y, width, height);
      gl.viewport(x, y, width, height);

      // 렌더링 콜백 호출
      if (this.onRenderViewport) {
        this.onRenderViewport(viewport.id, viewport.playback.currentFrame, viewport.bounds);
        renderedCount++;
      }
    }

    // Scissor 테스트 비활성화
    gl.disable(gl.SCISSOR_TEST);

    this.stats.renderedViewports = renderedCount;
  }

  /**
   * 뷰포트 프레임 업데이트 (재생 중일 때)
   */
  private updateViewportFrame(viewport: Viewport, timestamp: number): void {
    const { playback, series } = viewport;
    if (!series) return;

    const frameInterval = 1000 / playback.fps;
    const elapsed = timestamp - playback.lastFrameTime;

    if (playback.lastFrameTime === 0 || elapsed >= frameInterval) {
      // 다음 프레임으로 이동
      const nextFrame = (playback.currentFrame + 1) % series.frameCount;
      playback.currentFrame = nextFrame;
      playback.lastFrameTime = timestamp - (elapsed % frameInterval);

      // 프레임 업데이트 콜백
      if (this.onFrameUpdate) {
        this.onFrameUpdate(viewport.id, nextFrame);
      }

      // 동기화 그룹 확인 및 슬레이브 동기화
      this.syncSlaveViewports(viewport);
    }
  }

  /**
   * 마스터 뷰포트의 슬레이브들 동기화
   */
  private syncSlaveViewports(masterViewport: Viewport): void {
    const groupInfo = this.syncEngine.findGroupByViewport(masterViewport.id);

    if (!groupInfo || groupInfo.role !== 'master') {
      return;
    }

    const group = this.syncEngine.getSyncGroup(groupInfo.groupId);
    if (!group || !group.active || !masterViewport.series) {
      return;
    }

    // 각 슬레이브의 프레임 수 수집
    const viewportFrameCounts = new Map<string, number>();
    for (const slaveId of group.slaveIds) {
      const slave = this.viewportManager.getViewport(slaveId);
      if (slave?.series) {
        viewportFrameCounts.set(slaveId, slave.series.frameCount);
      }
    }

    // 동기화된 프레임 계산
    const syncedFrames = this.syncEngine.syncAllViewportsInGroup(
      groupInfo.groupId,
      masterViewport.playback.currentFrame,
      masterViewport.series.frameCount,
      viewportFrameCounts,
    );

    // 슬레이브 프레임 업데이트
    for (const [slaveId, syncedFrame] of syncedFrames) {
      const slave = this.viewportManager.getViewport(slaveId);
      if (slave) {
        slave.playback.currentFrame = syncedFrame;

        // 프레임 업데이트 콜백
        if (this.onFrameUpdate) {
          this.onFrameUpdate(slaveId, syncedFrame);
        }
      }
    }
  }

  /**
   * 빈 뷰포트 렌더링 (시리즈 없음)
   */
  private renderEmptyViewport(viewport: Viewport): void {
    const gl = this.gl;
    const { x, y, width, height } = viewport.bounds;

    gl.scissor(x, y, width, height);
    gl.viewport(x, y, width, height);

    // 어두운 배경색으로 클리어
    gl.clearColor(0.1, 0.1, 0.15, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * 단일 프레임 렌더링 (루프 없이)
   *
   * 정지 상태에서 특정 프레임만 렌더링할 때 사용
   */
  renderSingleFrame(): void {
    const timestamp = performance.now();
    this.updateAndRenderViewports(timestamp, 0);
  }

  /**
   * 렌더링 통계 조회
   */
  getStats(): RenderStats {
    return { ...this.stats };
  }

  /**
   * 통계 리셋
   */
  resetStats(): void {
    this.stats = {
      frameTime: 0,
      fps: 0,
      renderedViewports: 0,
      totalFrames: 0,
      droppedFrames: 0,
    };
    this.fpsCounter = 0;
  }

  /**
   * 리소스 정리
   */
  dispose(): void {
    this.stop();
    this.onRenderViewport = null;
    this.onFrameUpdate = null;
  }
}
