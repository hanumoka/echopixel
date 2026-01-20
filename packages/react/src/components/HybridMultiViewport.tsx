/**
 * HybridMultiViewport - 하이브리드 DOM-WebGL 멀티 뷰포트
 *
 * Single Canvas + DOM Slots 하이브리드 아키텍처로 대규모 뷰포트를 지원합니다.
 *
 * 특징:
 * - WebGL 컨텍스트 1개로 16+ 뷰포트 지원
 * - DOM 기반 이벤트 처리 (자연스러운 클릭, 호버)
 * - CSS Grid로 유연한 레이아웃
 * - ref를 통한 외부 제어 (play/pause, fps 등)
 * - Context Loss 자동 복구
 *
 * @example 기본 사용
 * ```tsx
 * const viewportRef = useRef<HybridMultiViewportHandle>(null);
 *
 * <HybridMultiViewport
 *   ref={viewportRef}
 *   layout="grid-2x2"
 *   seriesMap={seriesMap}
 *   width={800}
 *   height={600}
 * />
 *
 * // 외부 제어
 * <button onClick={() => viewportRef.current?.playAll()}>Play</button>
 * ```
 *
 * @example 커스텀 오버레이
 * ```tsx
 * <HybridMultiViewport
 *   seriesMap={seriesMap}
 *   renderOverlay={(viewport, index) => (
 *     <DicomMiniOverlay
 *       index={index}
 *       currentFrame={viewport?.playback.currentFrame}
 *       totalFrames={viewport?.series?.frameCount}
 *     />
 *   )}
 * />
 * ```
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
  type ReactNode,
  type CSSProperties,
} from 'react';
import {
  HybridViewportManager,
  HybridRenderScheduler,
  FrameSyncEngine,
  TextureManager,
  ArrayTextureRenderer,
  TextureLRUCache,
  decodeJpeg,
  decodeNative,
  closeDecodedFrame,
  useToolGroup,
  type LayoutType,
  type Viewport,
  type ViewportSeriesInfo,
  type DicomImageInfo,
  type WindowLevelOptions,
  type TransformOptions,
  type SyncMode,
  type TextureCacheEntry,
} from '@echopixel/core';

import { HybridViewportGrid } from './building-blocks/HybridViewportGrid';
import { HybridViewportSlot } from './building-blocks/HybridViewportSlot';
import { DicomMiniOverlay } from './building-blocks/DicomMiniOverlay';

/**
 * 시리즈 데이터
 */
export interface HybridSeriesData {
  /** 시리즈 정보 */
  info: ViewportSeriesInfo;
  /** 프레임 데이터 배열 */
  frames: Uint8Array[];
  /** 이미지 정보 */
  imageInfo: DicomImageInfo;
  /** 압축 여부 */
  isEncapsulated: boolean;
}

/**
 * 렌더링 통계
 */
export interface HybridViewportStats {
  /** FPS */
  fps: number;
  /** 프레임 시간 (ms) */
  frameTime: number;
  /** VRAM 사용량 (MB) */
  vramMB: number;
}

/**
 * HybridMultiViewport 외부 제어용 핸들
 */
export interface HybridMultiViewportHandle {
  /** 모든 뷰포트 재생 */
  playAll: () => void;
  /** 모든 뷰포트 정지 */
  pauseAll: () => void;
  /** 재생/정지 토글 */
  togglePlayAll: () => void;
  /** FPS 설정 */
  setFps: (fps: number) => void;
  /** 현재 FPS */
  getFps: () => number;
  /** 재생 중 여부 */
  isPlaying: () => boolean;
  /** 모든 뷰포트 리셋 (W/L, Pan, Zoom) */
  resetAllViewports: () => void;
  /** 특정 뷰포트 정보 가져오기 */
  getViewport: (viewportId: string) => Viewport | null;
  /** 모든 뷰포트 정보 가져오기 */
  getAllViewports: () => Viewport[];
  /** 통계 가져오기 */
  getStats: () => HybridViewportStats;
  /** 단일 프레임 렌더링 (정지 상태에서) */
  renderSingleFrame: () => void;
  /** Context Loss 테스트 (개발용) */
  testContextLoss: () => void;
}

/**
 * 성능 옵션 (테스트/튜닝용)
 */
export interface PerformanceOptions {
  /**
   * 최대 VRAM 사용량 (MB)
   * - 256, 512, 1024, 1536, 2048, 3072, 4096 등
   * - Infinity: 무제한 (eviction 비활성화)
   * 기본값: Infinity
   */
  maxVramMB?: number;

  /**
   * Device Pixel Ratio 오버라이드
   * - 1.0: 저해상도 (빠름)
   * - 2.0: 고해상도 (Retina)
   * - undefined: 자동 (window.devicePixelRatio, 최대 2)
   * 기본값: undefined (자동)
   */
  dprOverride?: number;

  /**
   * TextureLRUCache 디버그 로깅
   * 기본값: false
   */
  debugMode?: boolean;
}

/**
 * HybridMultiViewport Props
 */
export interface HybridMultiViewportProps {
  /** 레이아웃 타입 (기본 'grid-2x2') */
  layout?: LayoutType;
  /** 컨테이너 너비 (CSS 픽셀) - 미지정 시 부모 크기 자동 감지 */
  width?: number;
  /** 컨테이너 높이 (CSS 픽셀) - 미지정 시 부모 크기 자동 감지 */
  height?: number;
  /** 그리드 간격 (기본 2) */
  gap?: number;
  /** 시리즈 데이터 맵 */
  seriesMap?: Map<string, HybridSeriesData>;
  /** 동기화 모드 (기본 'frame-ratio') */
  syncMode?: SyncMode;
  /** 초기 FPS (기본 30) */
  initialFps?: number;
  /** 뷰포트 클릭 콜백 */
  onViewportClick?: (viewportId: string) => void;
  /** 선택된 뷰포트 변경 콜백 */
  onActiveViewportChange?: (viewportId: string | null) => void;
  /** 재생 상태 변경 콜백 */
  onPlayingChange?: (isPlaying: boolean) => void;
  /** 통계 업데이트 콜백 (500ms 간격) */
  onStatsUpdate?: (stats: HybridViewportStats) => void;
  /** 커스텀 오버레이 렌더링 */
  renderOverlay?: (viewport: Viewport | null, index: number) => ReactNode;
  /** 기본 오버레이 표시 여부 (renderOverlay 미지정 시, 기본 true) */
  showDefaultOverlay?: boolean;
  /** 성능 옵션 (VRAM 제한, DPR 등) - 변경 시 컴포넌트 리마운트 권장 */
  performanceOptions?: PerformanceOptions;
  /** 커스텀 스타일 */
  style?: CSSProperties;
  /** 커스텀 클래스명 */
  className?: string;
}

/**
 * 레이아웃 타입에서 행/열 추출
 */
function getLayoutDimensions(layout: LayoutType): { rows: number; cols: number } {
  switch (layout) {
    case 'grid-1x1': return { rows: 1, cols: 1 };
    case 'grid-2x2': return { rows: 2, cols: 2 };
    case 'grid-3x3': return { rows: 3, cols: 3 };
    case 'grid-4x4': return { rows: 4, cols: 4 };
    case 'grid-5x5': return { rows: 5, cols: 5 };
    case 'grid-6x6': return { rows: 6, cols: 6 };
    case 'grid-7x7': return { rows: 7, cols: 7 };
    case 'grid-8x8': return { rows: 8, cols: 8 };
    default: return { rows: 2, cols: 2 };
  }
}

/**
 * HybridMultiViewport
 */
export const HybridMultiViewport = forwardRef<
  HybridMultiViewportHandle,
  HybridMultiViewportProps
>(function HybridMultiViewport(
  {
    layout = 'grid-2x2',
    width,
    height,
    gap = 2,
    seriesMap,
    syncMode = 'frame-ratio',
    initialFps = 30,
    onViewportClick,
    onActiveViewportChange,
    onPlayingChange,
    onStatsUpdate,
    renderOverlay,
    showDefaultOverlay = true,
    performanceOptions,
    style,
    className,
  },
  ref
) {
  // 성능 옵션 추출
  const maxVramMB = performanceOptions?.maxVramMB ?? Infinity;
  const dprOverride = performanceOptions?.dprOverride;
  const debugMode = performanceOptions?.debugMode ?? false;

  // Refs
  const wrapperRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Manager refs
  const hybridManagerRef = useRef<HybridViewportManager | null>(null);
  const renderSchedulerRef = useRef<HybridRenderScheduler | null>(null);
  const syncEngineRef = useRef<FrameSyncEngine | null>(null);
  // TextureLRUCache 생성 (성능 옵션 반영)
  // 참고: performanceOptions 변경 시 컴포넌트를 key로 리마운트해야 새 설정이 적용됨
  const textureCacheRef = useRef<TextureLRUCache>(
    (() => {
      const maxVRAMBytes = maxVramMB === Infinity
        ? Number.MAX_SAFE_INTEGER
        : maxVramMB * 1024 * 1024;
      return new TextureLRUCache({
        maxVRAMBytes,
        onEvict: (viewportId: string, entry: TextureCacheEntry) => {
          if (debugMode) {
            console.log(`[TextureLRUCache] Evicted: ${viewportId} (${entry.sizeBytes} bytes)`);
          }
        },
        debug: debugMode,
      });
    })()
  );
  const arrayRendererRef = useRef<ArrayTextureRenderer | null>(null);

  // Context loss 복구용 ref
  const contextLostHandlerRef = useRef<((event: Event) => void) | null>(null);
  const contextRestoredHandlerRef = useRef<(() => void) | null>(null);

  // 컨테이너 크기 상태
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: width ?? 800,
    height: height ?? 600,
  });

  // State
  const [viewportIds, setViewportIds] = useState<string[]>([]);
  const [viewports, setViewports] = useState<Viewport[]>([]);
  const [activeViewportId, setActiveViewportId] = useState<string | null>(null);
  const [hoveredViewportId, setHoveredViewportId] = useState<string | null>(null);
  const [isPlayingState, setIsPlayingState] = useState(false);
  const [fpsState, setFpsState] = useState(initialFps);
  const [isInitialized, setIsInitialized] = useState(false);

  // Tool System용 뷰포트 요소 맵
  const [viewportElements] = useState(() => new Map<string, HTMLElement>());
  const [viewportElementsVersion, setViewportElementsVersion] = useState(0);

  // DPR (성능 옵션 또는 자동)
  const dpr = dprOverride ?? Math.min(window.devicePixelRatio || 1, 2);

  // 레이아웃 차원
  const { rows, cols } = getLayoutDimensions(layout);
  const slotCount = rows * cols;

  // 실제 사용할 크기
  const effectiveWidth = width ?? containerSize.width;
  const effectiveHeight = height ?? containerSize.height;

  // 정지 이미지 여부
  const isStaticImage = viewports.length > 0 && viewports.every((v) =>
    !v.series || v.series.frameCount <= 1
  );

  // Tool System 통합
  useToolGroup({
    toolGroupId: 'hybrid-viewport',
    viewportManager: hybridManagerRef.current,
    viewportElements,
    viewportElementsKey: viewportElementsVersion,
    disabled: !isInitialized,
    isStaticImage,
  });

  // ResizeObserver로 컨테이너 크기 자동 감지
  useEffect(() => {
    if (width !== undefined && height !== undefined) return;

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          setContainerSize({ width: w, height: h });
        }
      }
    });

    resizeObserver.observe(wrapper);

    const rect = wrapper.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setContainerSize({ width: rect.width, height: rect.height });
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [width, height]);

  // 컨테이너 크기 변경 시 동기화
  useEffect(() => {
    if (hybridManagerRef.current) {
      hybridManagerRef.current.markNeedsSync();
    }
  }, [containerSize.width, containerSize.height]);

  // 렌더링 콜백 설정 헬퍼
  const setupRenderCallbacks = useCallback((
    renderScheduler: HybridRenderScheduler,
    hybridManager: HybridViewportManager,
    arrayRenderer: ArrayTextureRenderer
  ) => {
    renderScheduler.setRenderCallback((viewportId: string, frameIndex: number, bounds: { x: number; y: number; width: number; height: number }) => {
      const viewport = hybridManager.getViewport(viewportId);
      const cacheEntry = textureCacheRef.current.get(viewportId);
      const textureManager = cacheEntry?.textureManager;

      if (!viewport || !textureManager || !textureManager.hasArrayTexture()) {
        return;
      }

      let wl: WindowLevelOptions | undefined;
      if (viewport.windowLevel && viewport.series) {
        const maxValue = viewport.series.isEncapsulated
          ? 255
          : Math.pow(2, viewport.series.bitsStored ?? 8);
        wl = {
          windowCenter: viewport.windowLevel.center / maxValue,
          windowWidth: viewport.windowLevel.width / maxValue,
        };
      }

      let transform: TransformOptions | undefined;
      const t = viewport.transform;
      // transform이 기본값이 아닌 경우에만 적용
      const hasTransform = t && (
        t.pan.x !== 0 || t.pan.y !== 0 ||
        t.zoom !== 1.0 ||
        t.rotation !== 0 ||
        t.flipH || t.flipV
      );
      if (hasTransform) {
        const viewportWidth = bounds.width || 1;
        const viewportHeight = bounds.height || 1;
        transform = {
          panX: t.pan.x * (2 / viewportWidth),
          panY: -t.pan.y * (2 / viewportHeight),
          zoom: t.zoom,
          rotation: (t.rotation * Math.PI) / 180, // degree → radian
          flipH: t.flipH,
          flipV: t.flipV,
        };
      }

      textureManager.bindArrayTexture(viewport.textureUnit);
      arrayRenderer.renderFrame(viewport.textureUnit, frameIndex, wl, transform);
    });

    renderScheduler.setFrameUpdateCallback((viewportId: string, frameIndex: number) => {
      setViewports((prev) =>
        prev.map((v) =>
          v.id === viewportId
            ? { ...v, playback: { ...v.playback, currentFrame: frameIndex } }
            : v
        )
      );
    });
  }, []);

  // Canvas ref 콜백
  const handleCanvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    const prevCanvas = canvasRef.current;
    if (prevCanvas) {
      if (contextLostHandlerRef.current) {
        prevCanvas.removeEventListener('webglcontextlost', contextLostHandlerRef.current);
      }
      if (contextRestoredHandlerRef.current) {
        prevCanvas.removeEventListener('webglcontextrestored', contextRestoredHandlerRef.current);
      }
    }

    canvasRef.current = canvas;

    if (!canvas) {
      // Cleanup
      renderSchedulerRef.current?.dispose();
      arrayRendererRef.current?.dispose();
      textureCacheRef.current.clear();
      hybridManagerRef.current?.dispose();

      glRef.current = null;
      hybridManagerRef.current = null;
      renderSchedulerRef.current = null;
      syncEngineRef.current = null;
      arrayRendererRef.current = null;
      contextLostHandlerRef.current = null;
      contextRestoredHandlerRef.current = null;

      setViewportIds([]);
      setViewports([]);
      setIsInitialized(false);
      return;
    }

    // Context Loss 핸들러
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn('[HybridMultiViewport] WebGL context lost');
      renderSchedulerRef.current?.stop();
      setIsPlayingState(false);
      onPlayingChange?.(false);
      setIsInitialized(false);
    };

    const handleContextRestored = () => {
      console.log('[HybridMultiViewport] WebGL context restored');

      const newGl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance',
      });

      if (!newGl) {
        console.error('[HybridMultiViewport] Failed to restore WebGL context');
        return;
      }

      glRef.current = newGl;
      textureCacheRef.current.clearWithoutDispose();

      arrayRendererRef.current?.dispose();
      const newArrayRenderer = new ArrayTextureRenderer(newGl);
      arrayRendererRef.current = newArrayRenderer;

      renderSchedulerRef.current?.dispose();
      const hybridManager = hybridManagerRef.current;
      const syncEngine = syncEngineRef.current;

      if (hybridManager && syncEngine) {
        const newRenderScheduler = new HybridRenderScheduler(newGl, hybridManager, syncEngine);
        renderSchedulerRef.current = newRenderScheduler;
        setupRenderCallbacks(newRenderScheduler, hybridManager, newArrayRenderer);
      }

      setIsInitialized(true);
    };

    contextLostHandlerRef.current = handleContextLost;
    contextRestoredHandlerRef.current = handleContextRestored;

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    // WebGL 컨텍스트 생성
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      console.error('[HybridMultiViewport] WebGL2 not supported');
      return;
    }

    glRef.current = gl;

    // HybridViewportManager 생성
    const hybridManager = new HybridViewportManager({ canvas, dpr });
    hybridManagerRef.current = hybridManager;

    const ids = hybridManager.createSlots(slotCount);
    setViewportIds(ids);

    // FrameSyncEngine 생성
    const syncEngine = new FrameSyncEngine();
    syncEngineRef.current = syncEngine;

    // HybridRenderScheduler 생성
    const renderScheduler = new HybridRenderScheduler(gl, hybridManager, syncEngine);
    renderSchedulerRef.current = renderScheduler;

    // ArrayTextureRenderer 생성
    const arrayRenderer = new ArrayTextureRenderer(gl);
    arrayRendererRef.current = arrayRenderer;

    // 콜백 설정
    setupRenderCallbacks(renderScheduler, hybridManager, arrayRenderer);

    setViewports(hybridManager.getAllViewports());
    setIsInitialized(true);
  }, [dpr, slotCount, setupRenderCallbacks, onPlayingChange]);

  // 시리즈 데이터 로드
  useEffect(() => {
    if (!seriesMap || !isInitialized || !glRef.current || !hybridManagerRef.current) return;

    const gl = glRef.current;
    const hybridManager = hybridManagerRef.current;
    const ids = hybridManager.getAllViewportIds();

    const loadSeries = async () => {
      let index = 0;
      for (const [_key, seriesData] of seriesMap) {
        if (index >= ids.length) break;

        const viewportId = ids[index];
        const viewport = hybridManager.getViewport(viewportId);
        if (!viewport) continue;

        hybridManager.setViewportSeries(viewportId, seriesData.info);
        textureCacheRef.current.deleteAndDispose(viewportId);

        const textureManager = new TextureManager(gl);

        try {
          const decodedFrames: ImageBitmap[] = [];

          for (const frameData of seriesData.frames) {
            let decoded;
            if (seriesData.isEncapsulated) {
              decoded = await decodeJpeg(frameData);
            } else {
              decoded = await decodeNative(frameData, {
                imageInfo: seriesData.imageInfo,
              });
            }

            if (decoded.image instanceof VideoFrame) {
              const bitmap = await createImageBitmap(decoded.image);
              closeDecodedFrame(decoded);
              decodedFrames.push(bitmap);
            } else {
              decodedFrames.push(decoded.image as ImageBitmap);
            }
          }

          textureManager.uploadAllFrames(decodedFrames);
          decodedFrames.forEach((bmp) => bmp.close());

          const frameWidth = seriesData.imageInfo.columns;
          const frameHeight = seriesData.imageInfo.rows;
          const frameCount = decodedFrames.length;
          const sizeBytes = TextureLRUCache.calculateVRAMSize(frameWidth, frameHeight, frameCount);

          const cacheEntry: TextureCacheEntry = {
            textureManager,
            sizeBytes,
            seriesId: seriesData.info.seriesInstanceUID,
            frameCount,
            width: frameWidth,
            height: frameHeight,
          };

          textureCacheRef.current.set(viewportId, cacheEntry);
        } catch (err) {
          console.error(`[HybridMultiViewport] Failed to load series:`, err);
          textureManager.dispose();
        }

        index++;
      }

      setViewports(hybridManager.getAllViewports());

      if (renderSchedulerRef.current) {
        renderSchedulerRef.current.renderSingleFrame();
      }
    };

    loadSeries();
  }, [seriesMap, isInitialized]);

  // 동기화 그룹 설정
  useEffect(() => {
    if (!syncEngineRef.current || !hybridManagerRef.current || !isInitialized) return;

    const syncEngine = syncEngineRef.current;
    const ids = hybridManagerRef.current.getAllViewportIds();

    syncEngine.clearAllGroups();

    if (ids.length >= 2 && syncMode !== 'manual') {
      syncEngine.createSyncGroup({
        masterId: ids[0],
        slaveIds: ids.slice(1),
        mode: syncMode,
      });
    }
  }, [viewports.length, syncMode, isInitialized]);

  // 통계 업데이트
  useEffect(() => {
    if (!onStatsUpdate) return;

    const interval = setInterval(() => {
      if (renderSchedulerRef.current) {
        const s = renderSchedulerRef.current.getStats();
        const vramMB = textureCacheRef.current.vramUsageMB;
        onStatsUpdate({ fps: s.fps, frameTime: s.frameTime, vramMB });
      }
    }, 500);

    return () => clearInterval(interval);
  }, [onStatsUpdate]);

  // 재생/정지 함수
  const playAll = useCallback(() => {
    const hybridManager = hybridManagerRef.current;
    const renderScheduler = renderSchedulerRef.current;
    if (!hybridManager || !renderScheduler) return;

    setIsPlayingState(true);
    onPlayingChange?.(true);

    for (const id of hybridManager.getAllViewportIds()) {
      hybridManager.setViewportPlaying(id, true);
      hybridManager.setViewportFps(id, fpsState);
    }

    renderScheduler.start();
  }, [fpsState, onPlayingChange]);

  const pauseAll = useCallback(() => {
    const hybridManager = hybridManagerRef.current;
    const renderScheduler = renderSchedulerRef.current;
    if (!hybridManager || !renderScheduler) return;

    setIsPlayingState(false);
    onPlayingChange?.(false);

    for (const id of hybridManager.getAllViewportIds()) {
      hybridManager.setViewportPlaying(id, false);
    }

    renderScheduler.stop();
  }, [onPlayingChange]);

  const togglePlayAll = useCallback(() => {
    if (isPlayingState) {
      pauseAll();
    } else {
      playAll();
    }
  }, [isPlayingState, playAll, pauseAll]);

  const setFps = useCallback((newFps: number) => {
    setFpsState(newFps);
    const hybridManager = hybridManagerRef.current;
    if (!hybridManager) return;

    for (const id of hybridManager.getAllViewportIds()) {
      hybridManager.setViewportFps(id, newFps);
    }
  }, []);

  const resetAllViewports = useCallback(() => {
    const hybridManager = hybridManagerRef.current;
    if (!hybridManager) return;

    for (const id of hybridManager.getAllViewportIds()) {
      hybridManager.resetViewport(id);
    }

    if (renderSchedulerRef.current) {
      renderSchedulerRef.current.renderSingleFrame();
    }
  }, []);

  const getStats = useCallback((): HybridViewportStats => {
    if (renderSchedulerRef.current) {
      const s = renderSchedulerRef.current.getStats();
      return { fps: s.fps, frameTime: s.frameTime, vramMB: textureCacheRef.current.vramUsageMB };
    }
    return { fps: 0, frameTime: 0, vramMB: 0 };
  }, []);

  const testContextLoss = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (ext) {
      ext.loseContext();
      setTimeout(() => {
        ext.restoreContext();
      }, 2000);
    }
  }, []);

  // 외부 제어 핸들 노출
  useImperativeHandle(ref, () => ({
    playAll,
    pauseAll,
    togglePlayAll,
    setFps,
    getFps: () => fpsState,
    isPlaying: () => isPlayingState,
    resetAllViewports,
    getViewport: (viewportId: string) => hybridManagerRef.current?.getViewport(viewportId) ?? null,
    getAllViewports: () => viewports,
    getStats,
    renderSingleFrame: () => renderSchedulerRef.current?.renderSingleFrame(),
    testContextLoss,
  }), [playAll, pauseAll, togglePlayAll, setFps, fpsState, isPlayingState, resetAllViewports, viewports, getStats, testContextLoss]);

  // 뷰포트 이벤트 핸들러
  const handleViewportClick = useCallback((viewportId: string) => {
    setActiveViewportId(viewportId);
    onActiveViewportChange?.(viewportId);
    onViewportClick?.(viewportId);
  }, [onViewportClick, onActiveViewportChange]);

  const handleViewportMouseEnter = useCallback((viewportId: string) => {
    setHoveredViewportId(viewportId);
  }, []);

  const handleViewportMouseLeave = useCallback(() => {
    setHoveredViewportId(null);
  }, []);

  // Rotation/Flip 핸들러
  const handleRotateLeft = useCallback((viewportId: string) => {
    const hybridManager = hybridManagerRef.current;
    const viewport = hybridManager?.getViewport(viewportId);
    if (!hybridManager || !viewport) return;

    const newRotation = (viewport.transform.rotation - 90 + 360) % 360;
    hybridManager.setViewportRotation(viewportId, newRotation);
    setViewports(hybridManager.getAllViewports());
    renderSchedulerRef.current?.renderSingleFrame();
  }, []);

  const handleRotateRight = useCallback((viewportId: string) => {
    const hybridManager = hybridManagerRef.current;
    const viewport = hybridManager?.getViewport(viewportId);
    if (!hybridManager || !viewport) return;

    const newRotation = (viewport.transform.rotation + 90) % 360;
    hybridManager.setViewportRotation(viewportId, newRotation);
    setViewports(hybridManager.getAllViewports());
    renderSchedulerRef.current?.renderSingleFrame();
  }, []);

  const handleFlipH = useCallback((viewportId: string) => {
    const hybridManager = hybridManagerRef.current;
    const viewport = hybridManager?.getViewport(viewportId);
    if (!hybridManager || !viewport) return;

    hybridManager.setViewportFlipH(viewportId, !viewport.transform.flipH);
    setViewports(hybridManager.getAllViewports());
    renderSchedulerRef.current?.renderSingleFrame();
  }, []);

  const handleFlipV = useCallback((viewportId: string) => {
    const hybridManager = hybridManagerRef.current;
    const viewport = hybridManager?.getViewport(viewportId);
    if (!hybridManager || !viewport) return;

    hybridManager.setViewportFlipV(viewportId, !viewport.transform.flipV);
    setViewports(hybridManager.getAllViewports());
    renderSchedulerRef.current?.renderSingleFrame();
  }, []);

  const handleResetViewport = useCallback((viewportId: string) => {
    const hybridManager = hybridManagerRef.current;
    if (!hybridManager) return;

    hybridManager.resetViewport(viewportId);
    setViewports(hybridManager.getAllViewports());
    renderSchedulerRef.current?.renderSingleFrame();
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{
        width: width !== undefined ? `${width}px` : '100%',
        height: height !== undefined ? `${height}px` : '100%',
        minHeight: 0,
        position: 'relative',
        ...style,
      }}
    >
      <HybridViewportGrid
        rows={rows}
        cols={cols}
        width={effectiveWidth}
        height={effectiveHeight}
        gap={gap}
        dpr={dpr}
        onCanvasRef={handleCanvasRef}
      >
        {viewportIds.map((id, index) => {
          const viewport = viewports.find((v) => v.id === id) ?? null;
          const manager = hybridManagerRef.current;

          if (!manager) {
            return (
              <div
                key={id}
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#666',
                  fontSize: '12px',
                }}
              >
                Loading...
              </div>
            );
          }

          return (
            <HybridViewportSlot
              key={id}
              viewportId={id}
              manager={manager}
              isSelected={activeViewportId === id}
              isHovered={hoveredViewportId === id}
              onClick={handleViewportClick}
              onMouseEnter={handleViewportMouseEnter}
              onMouseLeave={handleViewportMouseLeave}
              onElementRef={(element) => {
                if (element) {
                  viewportElements.set(id, element);
                  setViewportElementsVersion((v) => v + 1);
                } else {
                  viewportElements.delete(id);
                  setViewportElementsVersion((v) => v + 1);
                }
              }}
            >
              {renderOverlay ? (
                renderOverlay(viewport, index)
              ) : showDefaultOverlay ? (
                <DicomMiniOverlay
                  index={index}
                  currentFrame={viewport?.playback.currentFrame}
                  totalFrames={viewport?.series?.frameCount}
                  isPlaying={viewport?.playback.isPlaying}
                  isSelected={activeViewportId === id}
                  showTools={true}
                  rotation={viewport?.transform.rotation}
                  flipH={viewport?.transform.flipH}
                  flipV={viewport?.transform.flipV}
                  onRotateLeft={() => handleRotateLeft(id)}
                  onRotateRight={() => handleRotateRight(id)}
                  onFlipH={() => handleFlipH(id)}
                  onFlipV={() => handleFlipV(id)}
                  onReset={() => handleResetViewport(id)}
                />
              ) : null}
            </HybridViewportSlot>
          );
        })}
      </HybridViewportGrid>
    </div>
  );
});
