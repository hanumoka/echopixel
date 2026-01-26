/**
 * HybridRenderScheduler
 *
 * 학습 포인트:
 * - 기존 RenderScheduler 로직 재사용 (컴포지션)
 * - 렌더 루프 시작 전 DOM 슬롯 좌표 동기화
 * - HybridViewportManager와 연동
 *
 * 렌더링 흐름:
 * 1. requestAnimationFrame 콜백
 * 2. hybridManager.syncAllSlots() - DOM 좌표 → WebGL 좌표 변환
 * 3. 각 뷰포트에 대해 렌더링 (기존 로직)
 */

import type { RenderSchedulerOptions, RenderStats, ViewportRenderCallback, FrameUpdateCallback } from '../sync/types';
import type { Viewport } from '../viewport/types';
import { FrameSyncEngine } from '../sync/FrameSyncEngine';
import { HybridViewportManager } from './HybridViewportManager';

/**
 * 하이브리드 렌더링 스케줄러
 *
 * HybridViewportManager와 연동하여 DOM 기반 좌표 동기화 지원
 */
export class HybridRenderScheduler {
  private gl: WebGL2RenderingContext;
  private hybridManager: HybridViewportManager;
  private syncEngine: FrameSyncEngine;

  private animationId: number | null = null;
  private isRunning = false;

  // 옵션
  private maxFps: number;

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
   * @param hybridManager - 하이브리드 뷰포트 관리자
   * @param syncEngine - 프레임 동기화 엔진
   * @param options - 스케줄러 옵션
   */
  constructor(
    gl: WebGL2RenderingContext,
    hybridManager: HybridViewportManager,
    syncEngine: FrameSyncEngine,
    options?: RenderSchedulerOptions
  ) {
    this.gl = gl;
    this.hybridManager = hybridManager;
    this.syncEngine = syncEngine;

    this.maxFps = options?.maxFps ?? 60;
  }

  /**
   * 렌더링 콜백 설정
   */
  setRenderCallback(callback: ViewportRenderCallback): void {
    this.onRenderViewport = callback;
  }

  /**
   * 프레임 업데이트 콜백 설정
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

      const _deltaTime = timestamp - this.lastTickTime;
      this.lastTickTime = timestamp;

      // FPS 계산
      this.fpsCounter++;
      if (timestamp - this.fpsLastUpdate >= 1000) {
        this.stats.fps = this.fpsCounter;
        this.fpsCounter = 0;
        this.fpsLastUpdate = timestamp;
      }

      const frameStart = performance.now();

      // ★ 핵심: DOM 슬롯 좌표 동기화
      this.hybridManager.syncAllSlots();

      // 모든 뷰포트 업데이트 및 렌더링
      this.updateAndRenderViewports(timestamp);

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
   * 모든 뷰포트 업데이트 및 렌더링
   */
  private updateAndRenderViewports(timestamp: number): void {
    const gl = this.gl;

    // 등록된 슬롯이 있는 뷰포트만 렌더링
    const registeredIds = this.hybridManager.getRegisteredSlotIds();
    const viewports = registeredIds
      .map((id) => this.hybridManager.getViewport(id))
      .filter((v): v is Viewport => v !== null && v.active);

    // 전체 Canvas 클리어 (어두운 회색 - DICOM 이미지와 구분)
    gl.clearColor(0.1, 0.1, 0.1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Scissor 테스트 활성화
    gl.enable(gl.SCISSOR_TEST);

    let renderedCount = 0;

    for (const viewport of viewports) {
      // 슬롯 bounds 조회
      const bounds = this.hybridManager.getSlotBounds(viewport.id);
      if (!bounds) {
        this.renderEmptyViewport(viewport);
        continue;
      }

      // 시리즈가 없으면 빈 뷰포트
      if (!viewport.series) {
        this.renderEmptyViewportWithBounds(bounds);
        continue;
      }

      // 재생 중이면 프레임 업데이트
      if (viewport.playback.isPlaying) {
        this.updateViewportFrame(viewport, timestamp);
      }

      // 렌더링 영역 설정 (슬롯 기반 bounds 사용)
      gl.scissor(bounds.x, bounds.y, bounds.width, bounds.height);
      gl.viewport(bounds.x, bounds.y, bounds.width, bounds.height);

      // 렌더링 콜백 호출
      if (this.onRenderViewport) {
        this.onRenderViewport(viewport.id, viewport.playback.currentFrame, {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        });
        renderedCount++;
      }
    }

    // Scissor 테스트 비활성화
    gl.disable(gl.SCISSOR_TEST);

    this.stats.renderedViewports = renderedCount;
  }

  /**
   * 뷰포트 프레임 업데이트 (재생 중일 때)
   *
   * 학습 포인트:
   * - 첫 프레임에서는 lastFrameTime 초기화만 수행
   * - 이후 프레임에서 elapsed 기반으로 프레임 전환
   */
  private updateViewportFrame(viewport: Viewport, timestamp: number): void {
    const { playback, series } = viewport;
    if (!series) return;

    // 첫 프레임: 현재 시간으로 초기화만 (프레임 이동 없이)
    if (playback.lastFrameTime === 0) {
      playback.lastFrameTime = timestamp;
      return;
    }

    const frameInterval = 1000 / playback.fps;
    const elapsed = timestamp - playback.lastFrameTime;

    if (elapsed >= frameInterval) {
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
      const slave = this.hybridManager.getViewport(slaveId);
      if (slave?.series) {
        viewportFrameCounts.set(slaveId, slave.series.frameCount);
      }
    }

    // 동기화된 프레임 계산
    const syncedFrames = this.syncEngine.syncAllViewportsInGroup(
      groupInfo.groupId,
      masterViewport.playback.currentFrame,
      masterViewport.series.frameCount,
      viewportFrameCounts
    );

    // 슬레이브 프레임 업데이트
    for (const [slaveId, syncedFrame] of syncedFrames) {
      const slave = this.hybridManager.getViewport(slaveId);
      // Optional chaining으로 playback 존재 여부 확인
      if (slave?.playback) {
        slave.playback.currentFrame = syncedFrame;

        // 프레임 업데이트 콜백
        if (this.onFrameUpdate) {
          this.onFrameUpdate(slaveId, syncedFrame);
        }
      }
    }
  }

  /**
   * 빈 뷰포트 렌더링 (bounds 없음)
   */
  private renderEmptyViewport(viewport: Viewport): void {
    const gl = this.gl;
    const { x, y, width, height } = viewport.bounds;

    gl.scissor(x, y, width, height);
    gl.viewport(x, y, width, height);

    gl.clearColor(0.1, 0.1, 0.15, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * 빈 뷰포트 렌더링 (bounds 있음)
   */
  private renderEmptyViewportWithBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    const gl = this.gl;

    gl.scissor(bounds.x, bounds.y, bounds.width, bounds.height);
    gl.viewport(bounds.x, bounds.y, bounds.width, bounds.height);

    gl.clearColor(0.1, 0.1, 0.15, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * 단일 프레임 렌더링 (루프 없이)
   */
  renderSingleFrame(): void {
    console.log('[DEBUG] renderSingleFrame() - start', {
      isRunning: this.isRunning,
      canvasWidth: this.gl.canvas.width,
      canvasHeight: this.gl.canvas.height,
      drawingBufferWidth: this.gl.drawingBufferWidth,
      drawingBufferHeight: this.gl.drawingBufferHeight,
    });

    // 동기화 수행
    this.hybridManager.syncAllSlots();

    const timestamp = performance.now();
    this.updateAndRenderViewports(timestamp);

    console.log('[DEBUG] renderSingleFrame() - end');
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
