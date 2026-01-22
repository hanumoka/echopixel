/**
 * useViewportTransform - 뷰포트 변환 핸들러 훅
 *
 * HybridMultiViewport에서 분리된 회전/플립/리셋 핸들러
 *
 * 학습 포인트:
 * - 관심사 분리: 변환(회전/플립) 관련 로직만 담당
 * - 콜백 주입: 상태 업데이트는 외부에서 주입받은 콜백으로 처리
 */

import { useCallback } from 'react';
import type { HybridViewportManager, HybridRenderScheduler, Viewport } from '@echopixel/core';

/**
 * useViewportTransform 옵션
 */
export interface UseViewportTransformOptions {
  /** HybridViewportManager ref */
  hybridManagerRef: React.MutableRefObject<HybridViewportManager | null>;
  /** HybridRenderScheduler ref */
  renderSchedulerRef: React.MutableRefObject<HybridRenderScheduler | null>;
  /** 뷰포트 상태 업데이트 콜백 */
  onViewportsChange: (viewports: Viewport[]) => void;
}

/**
 * useViewportTransform 반환 타입
 */
export interface UseViewportTransformReturn {
  /** 좌로 90도 회전 */
  handleRotateLeft: (viewportId: string) => void;
  /** 우로 90도 회전 */
  handleRotateRight: (viewportId: string) => void;
  /** 좌우 플립 (수평 반전) */
  handleFlipH: (viewportId: string) => void;
  /** 상하 플립 (수직 반전) */
  handleFlipV: (viewportId: string) => void;
  /** 뷰포트 리셋 (회전/플립/줌/팬 초기화) */
  handleResetViewport: (viewportId: string) => void;
}

/**
 * 뷰포트 변환 훅
 *
 * @example
 * ```tsx
 * const {
 *   handleRotateLeft,
 *   handleRotateRight,
 *   handleFlipH,
 *   handleFlipV,
 *   handleResetViewport,
 * } = useViewportTransform({
 *   hybridManagerRef,
 *   renderSchedulerRef,
 *   onViewportsChange: (viewports) => setViewports(viewports),
 * });
 * ```
 */
export function useViewportTransform({
  hybridManagerRef,
  renderSchedulerRef,
  onViewportsChange,
}: UseViewportTransformOptions): UseViewportTransformReturn {

  const handleRotateLeft = useCallback((viewportId: string) => {
    const hybridManager = hybridManagerRef.current;
    const viewport = hybridManager?.getViewport(viewportId);
    if (!hybridManager || !viewport) return;

    const newRotation = (viewport.transform.rotation - 90 + 360) % 360;
    hybridManager.setViewportRotation(viewportId, newRotation);
    onViewportsChange(hybridManager.getAllViewports());
    renderSchedulerRef.current?.renderSingleFrame();
  }, [hybridManagerRef, renderSchedulerRef, onViewportsChange]);

  const handleRotateRight = useCallback((viewportId: string) => {
    const hybridManager = hybridManagerRef.current;
    const viewport = hybridManager?.getViewport(viewportId);
    if (!hybridManager || !viewport) return;

    const newRotation = (viewport.transform.rotation + 90) % 360;
    hybridManager.setViewportRotation(viewportId, newRotation);
    onViewportsChange(hybridManager.getAllViewports());
    renderSchedulerRef.current?.renderSingleFrame();
  }, [hybridManagerRef, renderSchedulerRef, onViewportsChange]);

  const handleFlipH = useCallback((viewportId: string) => {
    const hybridManager = hybridManagerRef.current;
    const viewport = hybridManager?.getViewport(viewportId);
    if (!hybridManager || !viewport) return;

    hybridManager.setViewportFlipH(viewportId, !viewport.transform.flipH);
    onViewportsChange(hybridManager.getAllViewports());
    renderSchedulerRef.current?.renderSingleFrame();
  }, [hybridManagerRef, renderSchedulerRef, onViewportsChange]);

  const handleFlipV = useCallback((viewportId: string) => {
    const hybridManager = hybridManagerRef.current;
    const viewport = hybridManager?.getViewport(viewportId);
    if (!hybridManager || !viewport) return;

    hybridManager.setViewportFlipV(viewportId, !viewport.transform.flipV);
    onViewportsChange(hybridManager.getAllViewports());
    renderSchedulerRef.current?.renderSingleFrame();
  }, [hybridManagerRef, renderSchedulerRef, onViewportsChange]);

  const handleResetViewport = useCallback((viewportId: string) => {
    const hybridManager = hybridManagerRef.current;
    if (!hybridManager) return;

    hybridManager.resetViewport(viewportId);
    onViewportsChange(hybridManager.getAllViewports());
    renderSchedulerRef.current?.renderSingleFrame();
  }, [hybridManagerRef, renderSchedulerRef, onViewportsChange]);

  return {
    handleRotateLeft,
    handleRotateRight,
    handleFlipH,
    handleFlipV,
    handleResetViewport,
  };
}
