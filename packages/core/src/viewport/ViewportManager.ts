/**
 * ViewportManager (Phase 2b)
 *
 * 학습 포인트:
 * - 단일 Canvas에서 여러 뷰포트를 관리
 * - 각 뷰포트는 Canvas의 특정 영역에 렌더링
 * - 텍스처 유닛 자동 할당 (WebGL2: 최대 32개 텍스처 유닛)
 *
 * 렌더링 흐름:
 * 1. ViewportManager가 뷰포트 목록 관리
 * 2. RenderScheduler가 각 뷰포트에 대해:
 *    - gl.scissor(x, y, width, height) 설정
 *    - gl.viewport(x, y, width, height) 설정
 *    - ArrayTextureRenderer.renderFrame() 호출
 */

import type {
  Viewport,
  ViewportSeriesInfo,
  Rect,
  CreateViewportOptions,
  LayoutType,
  LayoutConfig,
  WindowLevel,
} from './types';

/**
 * 고유 ID 생성 함수
 */
function generateId(): string {
  return `viewport-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 뷰포트 관리자
 *
 * 사용 예시:
 * ```ts
 * const manager = new ViewportManager(canvas.width, canvas.height);
 * manager.setLayout('grid-2x2');
 *
 * const viewport1 = manager.getViewport(manager.getAllViewportIds()[0]);
 * manager.setViewportSeries(viewport1.id, seriesInfo);
 * ```
 */
export class ViewportManager {
  private viewports: Map<string, Viewport> = new Map();
  private canvasWidth: number;
  private canvasHeight: number;
  private nextTextureUnit = 0;
  private currentLayout: LayoutConfig = { type: 'grid-1x1' };

  /**
   * @param canvasWidth - Canvas 너비 (픽셀)
   * @param canvasHeight - Canvas 높이 (픽셀)
   */
  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  /**
   * Canvas 크기 업데이트 (리사이즈 시 호출)
   */
  updateCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;

    // 현재 레이아웃 재적용하여 뷰포트 bounds 재계산
    this.applyLayout(this.currentLayout);
  }

  /**
   * 새 뷰포트 생성
   *
   * @param options - 뷰포트 생성 옵션
   * @returns 생성된 뷰포트
   */
  createViewport(options: CreateViewportOptions): Viewport {
    const id = generateId();
    const textureUnit = options.textureUnit ?? this.nextTextureUnit++;

    // WebGL2 텍스처 유닛 제한 체크 (최대 32개)
    if (textureUnit >= 32) {
      console.warn(`Texture unit ${textureUnit} exceeds WebGL2 limit (32). May cause issues.`);
    }

    const viewport: Viewport = {
      id,
      bounds: options.bounds,
      series: null,
      playback: {
        currentFrame: 0,
        isPlaying: false,
        fps: options.fps ?? 30,
        lastFrameTime: 0,
      },
      windowLevel: null,
      textureUnit,
      active: true,
    };

    this.viewports.set(id, viewport);
    return viewport;
  }

  /**
   * 뷰포트 제거
   */
  removeViewport(id: string): boolean {
    return this.viewports.delete(id);
  }

  /**
   * 모든 뷰포트 제거
   */
  clearViewports(): void {
    this.viewports.clear();
    this.nextTextureUnit = 0;
  }

  /**
   * ID로 뷰포트 조회
   */
  getViewport(id: string): Viewport | null {
    return this.viewports.get(id) ?? null;
  }

  /**
   * 모든 뷰포트 조회
   */
  getAllViewports(): Viewport[] {
    return Array.from(this.viewports.values());
  }

  /**
   * 활성화된 뷰포트만 조회
   */
  getActiveViewports(): Viewport[] {
    return this.getAllViewports().filter((v) => v.active);
  }

  /**
   * 모든 뷰포트 ID 조회
   */
  getAllViewportIds(): string[] {
    return Array.from(this.viewports.keys());
  }

  /**
   * 뷰포트에 시리즈 연결
   */
  setViewportSeries(viewportId: string, series: ViewportSeriesInfo): void {
    const viewport = this.viewports.get(viewportId);
    if (!viewport) {
      throw new Error(`Viewport not found: ${viewportId}`);
    }

    viewport.series = series;
    // 프레임 인덱스 초기화
    viewport.playback.currentFrame = 0;
  }

  /**
   * 뷰포트 Window/Level 설정
   */
  setViewportWindowLevel(viewportId: string, windowLevel: WindowLevel | null): void {
    const viewport = this.viewports.get(viewportId);
    if (!viewport) {
      throw new Error(`Viewport not found: ${viewportId}`);
    }

    viewport.windowLevel = windowLevel;
  }

  /**
   * 뷰포트 프레임 설정
   */
  setViewportFrame(viewportId: string, frameIndex: number): void {
    const viewport = this.viewports.get(viewportId);
    if (!viewport) {
      throw new Error(`Viewport not found: ${viewportId}`);
    }

    if (viewport.series) {
      // 프레임 인덱스 범위 제한
      viewport.playback.currentFrame = Math.max(
        0,
        Math.min(frameIndex, viewport.series.frameCount - 1),
      );
    }
  }

  /**
   * 뷰포트 재생 상태 설정
   */
  setViewportPlaying(viewportId: string, isPlaying: boolean): void {
    const viewport = this.viewports.get(viewportId);
    if (!viewport) {
      throw new Error(`Viewport not found: ${viewportId}`);
    }

    viewport.playback.isPlaying = isPlaying;
    if (isPlaying) {
      viewport.playback.lastFrameTime = 0; // 재생 시작 시 리셋
    }
  }

  /**
   * 뷰포트 FPS 설정
   */
  setViewportFps(viewportId: string, fps: number): void {
    const viewport = this.viewports.get(viewportId);
    if (!viewport) {
      throw new Error(`Viewport not found: ${viewportId}`);
    }

    viewport.playback.fps = Math.max(1, Math.min(60, fps));
  }

  /**
   * 뷰포트 활성화 상태 설정
   */
  setViewportActive(viewportId: string, active: boolean): void {
    const viewport = this.viewports.get(viewportId);
    if (!viewport) {
      throw new Error(`Viewport not found: ${viewportId}`);
    }

    viewport.active = active;
  }

  /**
   * 그리드 레이아웃 설정
   *
   * 학습 포인트:
   * - 레이아웃에 따라 Canvas를 균등하게 분할
   * - 각 뷰포트의 bounds를 자동 계산
   * - gap 옵션으로 뷰포트 간 간격 설정 가능
   *
   * @param layout - 레이아웃 타입 또는 설정
   */
  setLayout(layout: LayoutType | LayoutConfig): void {
    const config: LayoutConfig = typeof layout === 'string' ? { type: layout } : layout;
    this.currentLayout = config;
    this.applyLayout(config);
  }

  /**
   * 현재 레이아웃 조회
   */
  getCurrentLayout(): LayoutConfig {
    return this.currentLayout;
  }

  /**
   * 레이아웃 적용 (내부 메서드)
   */
  private applyLayout(config: LayoutConfig): void {
    // 기존 뷰포트 제거
    this.clearViewports();

    const gap = config.gap ?? 2;
    let rows: number;
    let cols: number;

    // 레이아웃 타입에 따른 행/열 결정
    switch (config.type) {
      case 'grid-1x1':
        rows = 1;
        cols = 1;
        break;
      case 'grid-2x2':
        rows = 2;
        cols = 2;
        break;
      case 'grid-3x3':
        rows = 3;
        cols = 3;
        break;
      case 'grid-4x4':
        rows = 4;
        cols = 4;
        break;
      case 'custom':
        rows = config.rows ?? 1;
        cols = config.cols ?? 1;
        break;
      default:
        rows = 1;
        cols = 1;
    }

    // 각 셀의 크기 계산
    const totalGapWidth = gap * (cols - 1);
    const totalGapHeight = gap * (rows - 1);
    const cellWidth = Math.floor((this.canvasWidth - totalGapWidth) / cols);
    const cellHeight = Math.floor((this.canvasHeight - totalGapHeight) / rows);

    // 뷰포트 생성 (좌상단부터)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // WebGL 좌표계: 좌하단이 원점
        // 따라서 y 좌표를 뒤집어야 함
        const x = col * (cellWidth + gap);
        const y = (rows - 1 - row) * (cellHeight + gap);

        const bounds: Rect = {
          x,
          y,
          width: cellWidth,
          height: cellHeight,
        };

        this.createViewport({ bounds });
      }
    }
  }

  /**
   * Canvas 내 위치로 뷰포트 찾기 (클릭 이벤트 등에 사용)
   *
   * @param canvasX - Canvas 내 X 좌표
   * @param canvasY - Canvas 내 Y 좌표 (WebGL 좌표계: 좌하단이 원점)
   * @returns 해당 위치의 뷰포트 또는 null
   */
  getViewportAtPosition(canvasX: number, canvasY: number): Viewport | null {
    for (const viewport of this.viewports.values()) {
      const { x, y, width, height } = viewport.bounds;
      if (canvasX >= x && canvasX < x + width && canvasY >= y && canvasY < y + height) {
        return viewport;
      }
    }
    return null;
  }

  /**
   * 뷰포트 수 조회
   */
  getViewportCount(): number {
    return this.viewports.size;
  }
}
