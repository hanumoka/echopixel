/**
 * usePlaybackControl - 재생 제어 훅
 *
 * HybridMultiViewport에서 분리된 재생/정지/FPS 제어 로직
 *
 * 학습 포인트:
 * - 관심사 분리: 재생 관련 로직만 담당
 * - 외부 의존성 최소화: refs로 매니저 접근
 * - 콜백 안정성: useCallback으로 참조 안정화
 */

import { useState, useCallback } from 'react';
import type { HybridViewportManager, HybridRenderScheduler } from '@echopixel/core';

/**
 * usePlaybackControl 옵션
 */
export interface UsePlaybackControlOptions {
  /** 초기 FPS (기본 30) */
  initialFps?: number;
  /** HybridViewportManager ref */
  hybridManagerRef: React.MutableRefObject<HybridViewportManager | null>;
  /** HybridRenderScheduler ref */
  renderSchedulerRef: React.MutableRefObject<HybridRenderScheduler | null>;
  /** 재생 상태 변경 콜백 */
  onPlayingChange?: (isPlaying: boolean) => void;
}

/**
 * usePlaybackControl 반환 타입
 */
export interface UsePlaybackControlReturn {
  /** 재생 중 여부 */
  isPlaying: boolean;
  /** 현재 FPS */
  fps: number;
  /** 모든 뷰포트 재생 */
  playAll: () => void;
  /** 모든 뷰포트 정지 */
  pauseAll: () => void;
  /** 재생/정지 토글 */
  togglePlayAll: () => void;
  /** FPS 설정 */
  setFps: (fps: number) => void;
  /**
   * 강제 정지 (Context Loss 등 외부 이벤트에서 사용)
   * pauseAll()과 달리 매니저 호출 없이 상태만 업데이트
   */
  forceStop: () => void;
}

/**
 * 재생 제어 훅
 *
 * @example
 * ```tsx
 * const {
 *   isPlaying,
 *   fps,
 *   playAll,
 *   pauseAll,
 *   togglePlayAll,
 *   setFps,
 * } = usePlaybackControl({
 *   initialFps: 30,
 *   hybridManagerRef,
 *   renderSchedulerRef,
 *   onPlayingChange: (playing) => console.log('Playing:', playing),
 * });
 * ```
 */
export function usePlaybackControl({
  initialFps = 30,
  hybridManagerRef,
  renderSchedulerRef,
  onPlayingChange,
}: UsePlaybackControlOptions): UsePlaybackControlReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFpsState] = useState(initialFps);

  const playAll = useCallback(() => {
    const hybridManager = hybridManagerRef.current;
    const renderScheduler = renderSchedulerRef.current;
    if (!hybridManager || !renderScheduler) return;

    setIsPlaying(true);
    onPlayingChange?.(true);

    for (const id of hybridManager.getAllViewportIds()) {
      hybridManager.setViewportPlaying(id, true);
      hybridManager.setViewportFps(id, fps);
    }

    renderScheduler.start();
  }, [hybridManagerRef, renderSchedulerRef, fps, onPlayingChange]);

  const pauseAll = useCallback(() => {
    const hybridManager = hybridManagerRef.current;
    const renderScheduler = renderSchedulerRef.current;
    if (!hybridManager || !renderScheduler) return;

    setIsPlaying(false);
    onPlayingChange?.(false);

    for (const id of hybridManager.getAllViewportIds()) {
      hybridManager.setViewportPlaying(id, false);
    }

    renderScheduler.stop();
  }, [hybridManagerRef, renderSchedulerRef, onPlayingChange]);

  const togglePlayAll = useCallback(() => {
    if (isPlaying) {
      pauseAll();
    } else {
      playAll();
    }
  }, [isPlaying, playAll, pauseAll]);

  const setFps = useCallback((newFps: number) => {
    setFpsState(newFps);
    const hybridManager = hybridManagerRef.current;
    if (!hybridManager) return;

    for (const id of hybridManager.getAllViewportIds()) {
      hybridManager.setViewportFps(id, newFps);
    }
  }, [hybridManagerRef]);

  /**
   * 강제 정지 - Context Loss 등 외부 이벤트에서 사용
   * 매니저 호출 없이 상태만 업데이트
   */
  const forceStop = useCallback(() => {
    setIsPlaying(false);
    onPlayingChange?.(false);
  }, [onPlayingChange]);

  return {
    isPlaying,
    fps,
    playAll,
    pauseAll,
    togglePlayAll,
    setFps,
    forceStop,
  };
}
