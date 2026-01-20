/**
 * HybridViewportManager
 *
 * 학습 포인트:
 * - DOM 요소와 WebGL 뷰포트의 매핑 관리
 * - 기존 ViewportManager 확장 (상속 대신 컴포지션)
 * - ResizeObserver를 통한 자동 동기화
 *
 * 아키텍처:
 * - DOM Slot → getBoundingClientRect() → WebGL bounds 변환
 * - 렌더 루프 시작 전 syncAllSlots() 호출로 최신 좌표 반영
 */

import { ViewportManager } from '../viewport/ViewportManager';
import type { LayoutType, LayoutConfig, Viewport } from '../viewport/types';
import type { ViewportSlotInfo, WebGLViewportBounds, CoordinateContext } from './types';
import { domRectToWebGLViewport, createCoordinateContext, updateCoordinateContext } from './coordinateUtils';

/**
 * HybridViewportManager 생성 옵션
 */
export interface HybridViewportManagerOptions {
  /** Canvas 요소 */
  canvas: HTMLCanvasElement;
  /** Device Pixel Ratio (기본값: window.devicePixelRatio, 최대 2) */
  dpr?: number;
  /** 초기 레이아웃 */
  layout?: LayoutType | LayoutConfig;
}

/**
 * 하이브리드 뷰포트 관리자
 *
 * DOM 슬롯 요소와 WebGL 뷰포트 영역을 동기화하여 관리합니다.
 *
 * 사용 흐름:
 * 1. createSlots(count)로 빈 뷰포트 슬롯 생성
 * 2. React에서 ViewportSlot 컴포넌트로 registerSlot() 호출
 * 3. 렌더 루프에서 syncAllSlots() 호출
 * 4. getSlotBounds(viewportId)로 WebGL 좌표 획득
 */
export class HybridViewportManager {
  private canvas: HTMLCanvasElement;
  private dpr: number;
  private coordinateContext: CoordinateContext;

  /** 내부 ViewportManager (기존 로직 재사용) */
  private viewportManager: ViewportManager;

  /** DOM 슬롯 정보 저장 */
  private slots: Map<string, ViewportSlotInfo> = new Map();

  /** ResizeObserver 인스턴스 */
  private resizeObserver: ResizeObserver | null = null;

  /** 동기화 필요 플래그 */
  private needsSync = true;

  constructor(options: HybridViewportManagerOptions) {
    this.canvas = options.canvas;
    this.dpr = options.dpr ?? Math.min(window.devicePixelRatio || 1, 2);
    this.coordinateContext = createCoordinateContext(this.canvas, this.dpr);

    // 내부 ViewportManager 생성
    // Canvas 크기는 실제로 사용하지 않음 (DOM 기반으로 bounds 계산)
    this.viewportManager = new ViewportManager(
      this.canvas.width,
      this.canvas.height
    );

    if (options.layout) {
      this.viewportManager.setLayout(options.layout);
    }

    // ResizeObserver 설정
    this.setupResizeObserver();
  }

  /**
   * ResizeObserver 설정
   *
   * Canvas 및 슬롯 요소의 크기 변경 감지
   */
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.needsSync = true;
    });

    // Canvas 관찰
    this.resizeObserver.observe(this.canvas);
  }

  /**
   * 빈 뷰포트 슬롯 생성
   *
   * @param count - 생성할 슬롯 수
   * @returns 생성된 뷰포트 ID 배열
   */
  createSlots(count: number): string[] {
    const ids: string[] = [];

    for (let i = 0; i < count; i++) {
      // 임시 bounds (DOM 등록 시 업데이트됨)
      const viewport = this.viewportManager.createViewport({
        bounds: { x: 0, y: 0, width: 1, height: 1 },
      });
      ids.push(viewport.id);
    }

    return ids;
  }

  /**
   * DOM 슬롯 등록
   *
   * ViewportSlot 컴포넌트에서 마운트 시 호출
   *
   * @param viewportId - 뷰포트 ID
   * @param element - DOM 요소
   */
  registerSlot(viewportId: string, element: HTMLElement): void {
    const viewport = this.viewportManager.getViewport(viewportId);
    if (!viewport) {
      console.warn(`[HybridViewportManager] Viewport not found: ${viewportId}`);
      return;
    }

    const slotInfo: ViewportSlotInfo = {
      viewportId,
      element,
      lastRect: null,
      webglBounds: null,
    };

    this.slots.set(viewportId, slotInfo);

    // ResizeObserver에 요소 추가
    this.resizeObserver?.observe(element);

    // 즉시 동기화
    this.syncSlot(viewportId);
    this.needsSync = true;
  }

  /**
   * DOM 슬롯 해제
   *
   * ViewportSlot 컴포넌트에서 언마운트 시 호출
   *
   * @param viewportId - 뷰포트 ID
   */
  unregisterSlot(viewportId: string): void {
    const slotInfo = this.slots.get(viewportId);
    if (slotInfo) {
      // ResizeObserver에서 요소 제거
      this.resizeObserver?.unobserve(slotInfo.element);
      this.slots.delete(viewportId);
    }
  }

  /**
   * 단일 슬롯 동기화
   *
   * @param viewportId - 뷰포트 ID
   */
  private syncSlot(viewportId: string): void {
    const slotInfo = this.slots.get(viewportId);
    const viewport = this.viewportManager.getViewport(viewportId);

    if (!slotInfo || !viewport) return;

    // DOM rect 측정
    const rect = slotInfo.element.getBoundingClientRect();
    slotInfo.lastRect = rect;

    // WebGL bounds 계산
    const webglBounds = domRectToWebGLViewport(rect, this.coordinateContext);
    slotInfo.webglBounds = webglBounds;

    // 내부 ViewportManager의 bounds도 업데이트
    viewport.bounds = {
      x: webglBounds.x,
      y: webglBounds.y,
      width: webglBounds.width,
      height: webglBounds.height,
    };
  }

  /**
   * 모든 슬롯 동기화
   *
   * 렌더 루프 시작 전 호출하여 최신 좌표 반영
   * needsSync 플래그 체크로 불필요한 재계산 방지
   */
  syncAllSlots(): void {
    if (!this.needsSync) return;

    // 좌표 컨텍스트 업데이트
    this.coordinateContext = updateCoordinateContext(this.coordinateContext);

    // 모든 슬롯 동기화
    for (const viewportId of this.slots.keys()) {
      this.syncSlot(viewportId);
    }

    this.needsSync = false;
  }

  /**
   * 강제 동기화 플래그 설정
   *
   * 외부에서 리사이즈/레이아웃 변경 시 호출
   */
  markNeedsSync(): void {
    this.needsSync = true;
  }

  /**
   * 슬롯의 WebGL bounds 조회
   *
   * @param viewportId - 뷰포트 ID
   * @returns WebGL viewport bounds 또는 null
   */
  getSlotBounds(viewportId: string): WebGLViewportBounds | null {
    return this.slots.get(viewportId)?.webglBounds ?? null;
  }

  /**
   * 슬롯 정보 조회
   *
   * @param viewportId - 뷰포트 ID
   */
  getSlotInfo(viewportId: string): ViewportSlotInfo | null {
    return this.slots.get(viewportId) ?? null;
  }

  /**
   * 모든 등록된 슬롯 ID 조회
   */
  getRegisteredSlotIds(): string[] {
    return Array.from(this.slots.keys());
  }

  // ===== ViewportManager 위임 메서드 =====

  /**
   * 뷰포트 조회
   */
  getViewport(id: string): Viewport | null {
    return this.viewportManager.getViewport(id);
  }

  /**
   * 모든 뷰포트 조회
   */
  getAllViewports(): Viewport[] {
    return this.viewportManager.getAllViewports();
  }

  /**
   * 활성 뷰포트 조회
   */
  getActiveViewports(): Viewport[] {
    return this.viewportManager.getActiveViewports();
  }

  /**
   * 모든 뷰포트 ID 조회
   */
  getAllViewportIds(): string[] {
    return this.viewportManager.getAllViewportIds();
  }

  /**
   * 뷰포트에 시리즈 연결
   */
  setViewportSeries(viewportId: string, series: Parameters<ViewportManager['setViewportSeries']>[1]): void {
    this.viewportManager.setViewportSeries(viewportId, series);
  }

  /**
   * 뷰포트 Window/Level 설정
   */
  setViewportWindowLevel(viewportId: string, windowLevel: Parameters<ViewportManager['setViewportWindowLevel']>[1]): void {
    this.viewportManager.setViewportWindowLevel(viewportId, windowLevel);
  }

  /**
   * 뷰포트 프레임 설정
   */
  setViewportFrame(viewportId: string, frameIndex: number): void {
    this.viewportManager.setViewportFrame(viewportId, frameIndex);
  }

  /**
   * 뷰포트 재생 상태 설정
   */
  setViewportPlaying(viewportId: string, isPlaying: boolean): void {
    this.viewportManager.setViewportPlaying(viewportId, isPlaying);
  }

  /**
   * 뷰포트 FPS 설정
   */
  setViewportFps(viewportId: string, fps: number): void {
    this.viewportManager.setViewportFps(viewportId, fps);
  }

  /**
   * 뷰포트 활성화 상태 설정
   */
  setViewportActive(viewportId: string, active: boolean): void {
    this.viewportManager.setViewportActive(viewportId, active);
  }

  /**
   * 뷰포트 수 조회
   */
  getViewportCount(): number {
    return this.viewportManager.getViewportCount();
  }

  // ===== Transform 관련 메서드 (Tool System용) =====

  /**
   * 뷰포트 Pan 설정
   */
  setViewportPan(viewportId: string, pan: { x: number; y: number }): void {
    this.viewportManager.setViewportPan(viewportId, pan);
  }

  /**
   * 뷰포트 Zoom 설정
   */
  setViewportZoom(viewportId: string, zoom: number): void {
    this.viewportManager.setViewportZoom(viewportId, zoom);
  }

  /**
   * 뷰포트 Rotation 설정
   */
  setViewportRotation(viewportId: string, rotation: number): void {
    this.viewportManager.setViewportRotation(viewportId, rotation);
  }

  /**
   * 뷰포트 가로 플립 설정
   */
  setViewportFlipH(viewportId: string, flipH: boolean): void {
    this.viewportManager.setViewportFlipH(viewportId, flipH);
  }

  /**
   * 뷰포트 세로 플립 설정
   */
  setViewportFlipV(viewportId: string, flipV: boolean): void {
    this.viewportManager.setViewportFlipV(viewportId, flipV);
  }

  /**
   * 뷰포트 Transform 초기화
   */
  resetViewportTransform(viewportId: string): void {
    this.viewportManager.resetViewportTransform(viewportId);
  }

  /**
   * 뷰포트 전체 리셋 (Transform + Window/Level)
   */
  resetViewport(viewportId: string): void {
    this.viewportManager.resetViewport(viewportId);
  }

  /**
   * 내부 ViewportManager 접근 (고급 사용)
   */
  getInternalManager(): ViewportManager {
    return this.viewportManager;
  }

  /**
   * 좌표 컨텍스트 조회
   */
  getCoordinateContext(): CoordinateContext {
    return this.coordinateContext;
  }

  /**
   * 리소스 정리
   *
   * 학습 포인트:
   * - 리소스 정리 순서: 하위 → 상위 (역순)
   * - ResizeObserver: 개별 요소 unobserve 후 disconnect
   */
  dispose(): void {
    // 1. 각 슬롯 unregister (ResizeObserver.unobserve 호출)
    const slotIds = Array.from(this.slots.keys());
    for (const id of slotIds) {
      this.unregisterSlot(id);
    }

    // 2. ResizeObserver 정리 (이미 unobserve 되었지만 명시적으로 disconnect)
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // 3. 남은 슬롯 정리 (이미 비어있지만 명시적으로)
    this.slots.clear();

    // 4. ViewportManager 정리
    this.viewportManager.clearViewports();
  }
}
