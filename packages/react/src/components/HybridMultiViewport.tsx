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
  useMemo,
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
  coordinateTransformer,
  LengthTool,
  AngleTool,
  PointTool,
  type LayoutType,
  type Viewport,
  type ViewportSeriesInfo,
  type DicomImageInfo,
  type WindowLevelOptions,
  type TransformOptions,
  type SyncMode,
  type TextureCacheEntry,
  type Annotation,
  type SVGRenderConfig,
  type TransformContext,
  type MeasurementTool,
  type ToolContext,
  type TempAnnotation,
  type ToolMouseEvent,
  type CalibrationData,
  type ToolBinding,
  type ViewportManagerLike,
  MouseBindings,
  KeyboardModifiers,
} from '@echopixel/core';

import { HybridViewportGrid } from './building-blocks/HybridViewportGrid';
import { HybridViewportSlot } from './building-blocks/HybridViewportSlot';
import { DicomMiniOverlay } from './building-blocks/DicomMiniOverlay';
import { SVGOverlay } from './annotations/SVGOverlay';

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

  // =========================================================================
  // Annotation Props (Phase 3d)
  // =========================================================================

  /** 뷰포트별 어노테이션 맵 (viewportId → Annotation[]) */
  annotations?: Map<string, Annotation[]>;
  /** 선택된 어노테이션 ID */
  selectedAnnotationId?: string | null;
  /** 어노테이션 선택 콜백 */
  onAnnotationSelect?: (viewportId: string, annotationId: string | null) => void;
  /** 어노테이션 업데이트 콜백 */
  onAnnotationUpdate?: (viewportId: string, annotation: Annotation) => void;
  /** 어노테이션 삭제 콜백 */
  onAnnotationDelete?: (viewportId: string, annotationId: string) => void;
  /** 어노테이션 렌더링 설정 */
  annotationConfig?: Partial<SVGRenderConfig>;
  /** 읽기 전용 어노테이션 (편집 불가) */
  readOnlyAnnotations?: boolean;

  // =========================================================================
  // Annotation Tool Props (Phase 3g: 어노테이션 생성 기능)
  // =========================================================================

  /** 활성 도구 ID (예: 'WindowLevel', 'Pan', 'Length', 'Angle', 'Point') */
  activeTool?: string;
  /** 도구 변경 콜백 */
  onToolChange?: (toolId: string) => void;
  /** 어노테이션 생성 콜백 (기존 onAnnotationUpdate와 별도로 신규 생성용) */
  onAnnotationCreate?: (viewportId: string, annotation: Annotation) => void;
  /** 어노테이션 도구 표시 여부 (기본 false) */
  showAnnotationTools?: boolean;
  /** 어노테이션 표시 여부 (전역 토글) */
  showAnnotations?: boolean;
  /** 어노테이션 표시 토글 핸들러 */
  onAnnotationsVisibilityChange?: (visible: boolean) => void;

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
 * TransformContext 생성 헬퍼
 */
function createTransformContext(
  viewport: Viewport | null,
  slotWidth: number,
  slotHeight: number
): TransformContext | null {
  // viewport.series가 없거나 슬롯 크기가 유효하지 않으면 null 반환
  if (!viewport?.series) return null;
  if (slotWidth <= 0 || slotHeight <= 0) return null;

  return {
    viewport: {
      imageWidth: viewport.series.imageWidth,
      imageHeight: viewport.series.imageHeight,
      canvasWidth: slotWidth,
      canvasHeight: slotHeight,
      zoom: viewport.transform.zoom,
      pan: viewport.transform.pan,
      rotation: viewport.transform.rotation,
      flipH: viewport.transform.flipH,
      flipV: viewport.transform.flipV,
    },
    // calibration과 mode는 seriesData에서 가져와야 하지만
    // 현재는 기본값 사용 (추후 확장)
  };
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
    // Annotation props (Phase 3d)
    annotations,
    selectedAnnotationId,
    onAnnotationSelect,
    onAnnotationUpdate,
    onAnnotationDelete,
    annotationConfig,
    readOnlyAnnotations = false,
    // Annotation Tool props (Phase 3g)
    activeTool: propActiveTool,
    onToolChange,
    onAnnotationCreate,
    showAnnotationTools = false,
    showAnnotations = true,
    onAnnotationsVisibilityChange,
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

  // =========================================================================
  // MeasurementTool 상태 (Phase 3g: 어노테이션 생성)
  // =========================================================================

  // 활성 도구 상태 (외부 제어 또는 내부 상태)
  const [internalActiveTool, setInternalActiveTool] = useState('WindowLevel');
  const activeTool = propActiveTool ?? internalActiveTool;

  // 활성 MeasurementTool ID (어노테이션 도구 선택 시)
  const [activeMeasurementToolId, setActiveMeasurementToolId] = useState<string | null>(null);

  // 콜백 ref (의존성 배열 문제 해결용)
  const getActiveViewportTransformContextRef = useRef<() => TransformContext | null>(() => null);
  const viewportsRef = useRef<Viewport[]>([]);

  // 임시 어노테이션 (드로잉 중 미리보기)
  const [tempAnnotation, setTempAnnotation] = useState<TempAnnotation | null>(null);

  // MeasurementTool 인스턴스 (렌더링마다 재생성 방지)
  const measurementToolsRef = useRef<Record<string, MeasurementTool>>({
    Length: new LengthTool(),
    Angle: new AngleTool(),
    Point: new PointTool(),
  });

  // 어노테이션 도구 ID 목록
  const ANNOTATION_TOOL_IDS = ['Length', 'Angle', 'Point'] as const;

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

  // ViewportManagerLike 어댑터 (Tool System 연결)
  // hybridManager의 메서드를 호출하고, React 상태를 업데이트하여 렌더링 트리거
  const viewportManagerAdapter = useMemo<ViewportManagerLike | null>(() => {
    const hybridManager = hybridManagerRef.current;
    if (!hybridManager) return null;

    return {
      getViewport: (id: string) => hybridManager.getViewport(id),

      setViewportWindowLevel: (id: string, wl: { center: number; width: number } | null) => {
        hybridManager.setViewportWindowLevel(id, wl);
        setViewports(hybridManager.getAllViewports());
        renderSchedulerRef.current?.renderSingleFrame();
      },

      setViewportPan: (id: string, pan: { x: number; y: number }) => {
        hybridManager.setViewportPan(id, pan);
        setViewports(hybridManager.getAllViewports());
        renderSchedulerRef.current?.renderSingleFrame();
      },

      setViewportZoom: (id: string, zoom: number) => {
        hybridManager.setViewportZoom(id, zoom);
        setViewports(hybridManager.getAllViewports());
        renderSchedulerRef.current?.renderSingleFrame();
      },

      setViewportFrame: (id: string, frameIndex: number) => {
        hybridManager.setViewportFrame(id, frameIndex);
        setViewports(hybridManager.getAllViewports());
        renderSchedulerRef.current?.renderSingleFrame();
      },
    };
  }, [isInitialized]); // hybridManager 초기화 후에만 생성

  // Tool System 통합
  const { setToolActive, toolGroup } = useToolGroup({
    toolGroupId: 'hybrid-viewport',
    viewportManager: viewportManagerAdapter,
    viewportElements,
    viewportElementsKey: viewportElementsVersion,
    disabled: !isInitialized || !viewportManagerAdapter,
    isStaticImage,
  });

  // 조작 도구 ID 목록
  const MANIPULATION_TOOL_IDS = ['WindowLevel', 'Pan', 'Zoom', 'StackScroll'] as const;

  // 도구별 기본 바인딩 (isStaticImage에 따라 다름)
  const getDefaultBindings = useCallback((toolId: string): ToolBinding[] => {
    switch (toolId) {
      case 'WindowLevel':
        return [{ mouseButton: MouseBindings.Secondary }];
      case 'Pan':
        return [{ mouseButton: MouseBindings.Auxiliary }];
      case 'Zoom':
        if (isStaticImage) {
          return [
            { mouseButton: MouseBindings.Primary, modifierKey: KeyboardModifiers.Shift },
            { mouseButton: MouseBindings.Wheel },
          ];
        }
        return [{ mouseButton: MouseBindings.Primary, modifierKey: KeyboardModifiers.Shift }];
      case 'StackScroll':
        return isStaticImage ? [] : [{ mouseButton: MouseBindings.Wheel }];
      default:
        return [];
    }
  }, [isStaticImage]);

  // 초기 도구 설정: toolGroup 생성 후 activeTool에 좌클릭 바인딩 추가
  useEffect(() => {
    if (!isInitialized || !toolGroup) return;

    // 조작 도구인 경우에만 좌클릭 바인딩 추가
    if ((MANIPULATION_TOOL_IDS as readonly string[]).includes(activeTool)) {
      const bindings = getDefaultBindings(activeTool);
      const primaryBinding: ToolBinding = { mouseButton: MouseBindings.Primary };
      const hasPrimary = bindings.some(
        b => b.mouseButton === MouseBindings.Primary && !b.modifierKey
      );

      if (!hasPrimary) {
        setToolActive(activeTool, [...bindings, primaryBinding]);
      }
    }
  }, [isInitialized, toolGroup]); // toolGroup이 생성된 후 실행

  // MeasurementTool cleanup (컴포넌트 언마운트 시)
  useEffect(() => {
    return () => {
      Object.values(measurementToolsRef.current).forEach(tool => {
        if (tool.isActive()) {
          tool.deactivate();
        }
      });
    };
  }, []);

  // 활성 뷰포트의 TransformContext 생성 (어노테이션 도구용)
  const getActiveViewportTransformContext = useCallback((): TransformContext | null => {
    if (!activeViewportId) return null;

    const viewport = viewports.find(v => v.id === activeViewportId);
    const element = viewportElements.get(activeViewportId);
    if (!viewport?.series || !element) return null;

    const slotWidth = element.clientWidth;
    const slotHeight = element.clientHeight;
    if (slotWidth <= 0 || slotHeight <= 0) return null;

    // seriesMap에서 calibration 정보 가져오기
    let calibration: CalibrationData | undefined;
    if (seriesMap) {
      // seriesMap 순회하여 activeViewportId에 해당하는 시리즈 찾기
      const viewportIndex = viewportIds.indexOf(activeViewportId);
      if (viewportIndex >= 0) {
        const seriesArray = Array.from(seriesMap.values());
        const seriesData = seriesArray[viewportIndex];
        if (seriesData?.imageInfo.pixelSpacing) {
          calibration = {
            physicalDeltaX: seriesData.imageInfo.pixelSpacing.columnSpacing / 10,
            physicalDeltaY: seriesData.imageInfo.pixelSpacing.rowSpacing / 10,
            unitX: 1, // DICOM_UNIT_CODES.CENTIMETER
            unitY: 1,
          };
        }
      }
    }

    return {
      viewport: {
        imageWidth: viewport.series.imageWidth,
        imageHeight: viewport.series.imageHeight,
        canvasWidth: slotWidth,
        canvasHeight: slotHeight,
        zoom: viewport.transform.zoom,
        pan: viewport.transform.pan,
        rotation: viewport.transform.rotation,
        flipH: viewport.transform.flipH,
        flipV: viewport.transform.flipV,
      },
      calibration,
    };
  }, [activeViewportId, viewports, viewportElements, seriesMap, viewportIds]);

  // ref 업데이트 (마우스 이벤트 핸들러에서 최신 값 참조용)
  getActiveViewportTransformContextRef.current = getActiveViewportTransformContext;
  viewportsRef.current = viewports;

  // 어노테이션 생성 완료 콜백
  const handleAnnotationCreated = useCallback((annotation: Annotation) => {
    if (!activeViewportId) return;

    // 외부 핸들러 호출
    if (onAnnotationCreate) {
      onAnnotationCreate(activeViewportId, annotation);
    } else if (onAnnotationUpdate) {
      // onAnnotationCreate가 없으면 onAnnotationUpdate 사용
      onAnnotationUpdate(activeViewportId, annotation);
    }

    // 생성 후 자동 선택
    onAnnotationSelect?.(activeViewportId, annotation.id);

    // 임시 어노테이션 초기화
    setTempAnnotation(null);
  }, [activeViewportId, onAnnotationCreate, onAnnotationUpdate, onAnnotationSelect]);

  // 임시 어노테이션 업데이트 콜백 (미리보기)
  const handleTempUpdate = useCallback((temp: TempAnnotation | null) => {
    setTempAnnotation(temp);
  }, []);

  // 도구 변경 핸들러
  const handleToolChange = useCallback((toolId: string) => {
    const isAnnotationTool = (ANNOTATION_TOOL_IDS as readonly string[]).includes(toolId);
    const prevTool = activeTool;

    // 이전 어노테이션 도구 비활성화
    if (activeMeasurementToolId && activeMeasurementToolId !== toolId) {
      measurementToolsRef.current[activeMeasurementToolId]?.deactivate();
      setTempAnnotation(null);
    }

    if (isAnnotationTool) {
      // ========================================
      // 어노테이션 도구 선택
      // ========================================
      setActiveMeasurementToolId(toolId);

      // 활성 뷰포트가 있으면 바로 활성화
      const tool = measurementToolsRef.current[toolId];
      const transformContext = getActiveViewportTransformContext();

      if (tool && transformContext && activeViewportId) {
        const viewport = viewports.find(v => v.id === activeViewportId);
        const context: ToolContext = {
          dicomId: activeViewportId,
          frameIndex: viewport?.playback.currentFrame ?? 0,
          mode: 'B',
          calibration: transformContext.calibration,
          transformContext,
        };

        tool.activate(context, handleAnnotationCreated, handleTempUpdate);
      }

      // 모든 조작 도구의 Primary 바인딩 해제 (기본 바인딩으로 복원)
      // → 좌클릭(Primary)은 어노테이션 도구만 사용하게 됨
      for (const manipToolId of MANIPULATION_TOOL_IDS) {
        const defaultBindings = getDefaultBindings(manipToolId);
        setToolActive(manipToolId, defaultBindings);
      }
    } else {
      // ========================================
      // 조작 도구 선택 (W/L, Pan, Zoom 등)
      // ========================================
      if (activeMeasurementToolId) {
        measurementToolsRef.current[activeMeasurementToolId]?.deactivate();
        setActiveMeasurementToolId(null);
        setTempAnnotation(null);
      }

      // 이전 도구: 기본 바인딩으로 복원 (좌클릭 제거)
      if (prevTool !== toolId && (MANIPULATION_TOOL_IDS as readonly string[]).includes(prevTool)) {
        const prevBindings = getDefaultBindings(prevTool);
        setToolActive(prevTool, prevBindings);
      }

      // 새 도구: 기본 바인딩 + 좌클릭 추가
      const newBindings = getDefaultBindings(toolId);
      const primaryBinding: ToolBinding = { mouseButton: MouseBindings.Primary };

      // 이미 Primary가 있으면 추가하지 않음
      const hasPrimary = newBindings.some(
        b => b.mouseButton === MouseBindings.Primary && !b.modifierKey
      );

      if (!hasPrimary) {
        setToolActive(toolId, [...newBindings, primaryBinding]);
      } else {
        setToolActive(toolId, newBindings);
      }
    }

    // 외부 또는 내부 상태 업데이트
    if (onToolChange) {
      onToolChange(toolId);
    } else {
      setInternalActiveTool(toolId);
    }
  }, [activeTool, activeMeasurementToolId, activeViewportId, viewports, getActiveViewportTransformContext,
      handleAnnotationCreated, handleTempUpdate, onToolChange, getDefaultBindings, setToolActive]);

  // activeViewportId 변경 시 MeasurementTool 재활성화 (뷰포트 선택 후 도구 활성화)
  useEffect(() => {
    if (!activeMeasurementToolId || !activeViewportId) return;

    const tool = measurementToolsRef.current[activeMeasurementToolId];
    const transformContext = getActiveViewportTransformContext();

    if (tool && transformContext) {
      // 이미 활성화된 상태라면 context만 업데이트
      if (tool.isActive()) {
        const viewport = viewports.find(v => v.id === activeViewportId);
        tool.updateContext({
          dicomId: activeViewportId,
          frameIndex: viewport?.playback.currentFrame ?? 0,
          transformContext,
        });
      } else {
        // 비활성 상태라면 새로 활성화
        const viewport = viewports.find(v => v.id === activeViewportId);
        const context: ToolContext = {
          dicomId: activeViewportId,
          frameIndex: viewport?.playback.currentFrame ?? 0,
          mode: 'B',
          calibration: transformContext.calibration,
          transformContext,
        };

        tool.activate(context, handleAnnotationCreated, handleTempUpdate);
      }
    }
  }, [activeViewportId, activeMeasurementToolId, viewports, getActiveViewportTransformContext,
      handleAnnotationCreated, handleTempUpdate]);

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

  // 컨테이너 크기 변경 시 동기화 및 재렌더링
  // 브라우저 줌 변경, 창 리사이즈 등에서 정지 상태일 때도 화면 갱신 필요
  useEffect(() => {
    console.log('[DEBUG] containerSize changed:', {
      width: containerSize.width,
      height: containerSize.height,
      dpr: window.devicePixelRatio,
      isPlaying: isPlayingState,
      hasHybridManager: !!hybridManagerRef.current,
      hasRenderScheduler: !!renderSchedulerRef.current,
    });

    if (hybridManagerRef.current) {
      hybridManagerRef.current.markNeedsSync();
      console.log('[DEBUG] markNeedsSync() called');
    }
    // requestAnimationFrame으로 브라우저 layout 완료 후 렌더링
    // 즉시 호출하면 getBoundingClientRect()가 이전 값을 반환할 수 있음
    const rafId = requestAnimationFrame(() => {
      console.log('[DEBUG] requestAnimationFrame callback executing');
      if (renderSchedulerRef.current) {
        console.log('[DEBUG] calling renderSingleFrame()');
        renderSchedulerRef.current.renderSingleFrame();
        console.log('[DEBUG] renderSingleFrame() completed');
      } else {
        console.log('[DEBUG] renderSchedulerRef.current is null!');
      }
    });
    return () => cancelAnimationFrame(rafId);
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
            seriesId: seriesData.info.seriesId,
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

  // =========================================================================
  // MeasurementTool Canvas 이벤트 처리 (Phase 3g)
  // =========================================================================

  useEffect(() => {
    if (!activeMeasurementToolId || !activeViewportId) return;

    const element = viewportElements.get(activeViewportId);
    if (!element) return;

    const tool = measurementToolsRef.current[activeMeasurementToolId];
    if (!tool) return;

    // 마우스 이벤트 → ToolMouseEvent 변환 (ref를 통해 최신 값 사용)
    const createToolEvent = (evt: MouseEvent): ToolMouseEvent | null => {
      // ref를 통해 최신 transformContext와 viewports 가져오기
      const transformContext = getActiveViewportTransformContextRef.current();
      if (!transformContext) return null;

      const currentViewports = viewportsRef.current;
      const viewport = currentViewports.find(v => v.id === activeViewportId);
      const imageWidth = viewport?.series?.imageWidth ?? 0;
      const imageHeight = viewport?.series?.imageHeight ?? 0;

      const rect = element.getBoundingClientRect();
      const canvasX = evt.clientX - rect.left;
      const canvasY = evt.clientY - rect.top;

      // Canvas 좌표 → DICOM 좌표 변환
      const dicomPoint = coordinateTransformer.canvasToDicom(
        { x: canvasX, y: canvasY },
        transformContext
      );

      // 이미지 영역 밖이면 null 반환
      if (dicomPoint.x < 0 || dicomPoint.x > imageWidth ||
          dicomPoint.y < 0 || dicomPoint.y > imageHeight) {
        return null;
      }

      return {
        canvasX,
        canvasY,
        dicomX: dicomPoint.x,
        dicomY: dicomPoint.y,
        button: evt.button,
        shiftKey: evt.shiftKey,
        ctrlKey: evt.ctrlKey,
        originalEvent: evt,
      };
    };

    const handleMouseDown = (evt: MouseEvent) => {
      // 어노테이션 Shape 또는 DragHandle 클릭 시 무시
      const target = evt.target as Element;
      if (target.closest('.annotation-shape, .drag-handle')) {
        return;
      }

      if (evt.button === 0) {
        const toolEvent = createToolEvent(evt);
        if (!toolEvent) return;

        evt.preventDefault();
        evt.stopPropagation(); // Tool System과 이벤트 충돌 방지
        tool.handleMouseDown(toolEvent);
      } else if (evt.button === 2) {
        // 우클릭: 드로잉 취소
        tool.cancelDrawing();
        setTempAnnotation(null);
      }
    };

    const handleMouseMove = (evt: MouseEvent) => {
      const toolEvent = createToolEvent(evt);
      if (!toolEvent) return;

      tool.handleMouseMove(toolEvent);
    };

    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMove);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('mousemove', handleMouseMove);
    };
    // viewports, getActiveViewportTransformContext는 ref를 통해 참조하므로 의존성에서 제외
  }, [activeMeasurementToolId, activeViewportId, viewportElements]);

  // =========================================================================
  // 키보드 이벤트 핸들러 (Phase 3g)
  // =========================================================================

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        // 선택된 어노테이션 삭제
        if (selectedAnnotationId && activeViewportId && onAnnotationDelete) {
          e.preventDefault();
          onAnnotationDelete(activeViewportId, selectedAnnotationId);
        }
        break;
      case 'Escape':
        // 드로잉 취소
        if (activeMeasurementToolId) {
          measurementToolsRef.current[activeMeasurementToolId]?.cancelDrawing();
          setTempAnnotation(null);
        }
        break;
    }
  }, [selectedAnnotationId, activeViewportId, onAnnotationDelete, activeMeasurementToolId]);

  return (
    <div
      ref={wrapperRef}
      className={className}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        width: width !== undefined ? `${width}px` : '100%',
        height: height !== undefined ? `${height}px` : '100%',
        minHeight: 0,
        position: 'relative',
        outline: 'none', // 포커스 시 outline 제거
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

          // Annotation 관련 데이터 준비
          const viewportAnnotations = annotations?.get(id) ?? [];
          const slotElement = viewportElements.get(id);
          const slotWidth = slotElement?.clientWidth ?? 0;
          const slotHeight = slotElement?.clientHeight ?? 0;
          const transformContext = createTransformContext(viewport, slotWidth, slotHeight);

          // 어노테이션 이벤트 핸들러
          const annotationHandlers = {
            onSelect: (annotationId: string | null) => onAnnotationSelect?.(id, annotationId),
            onHover: () => {}, // 향후 구현
            onUpdate: (annotation: Annotation) => onAnnotationUpdate?.(id, annotation),
            onDelete: (annotationId: string) => onAnnotationDelete?.(id, annotationId),
          };

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
              {/* SVGOverlay - 어노테이션 표시 */}
              {/* showAnnotations: 저장된 어노테이션 표시 여부 */}
              {/* tempAnnotation: 도구 사용 중에는 showAnnotations와 관계없이 표시 */}
              {transformContext && (
                (
                  (showAnnotations && viewportAnnotations.length > 0) ||
                  (activeViewportId === id && tempAnnotation)
                ) && (
                  <SVGOverlay
                    annotations={showAnnotations ? viewportAnnotations : []}
                    tempAnnotation={activeViewportId === id ? tempAnnotation : null}
                    tempAnnotationType={
                      activeMeasurementToolId === 'Length' ? 'length' :
                      activeMeasurementToolId === 'Angle' ? 'angle' :
                      activeMeasurementToolId === 'Point' ? 'point' :
                      undefined
                    }
                    currentFrame={viewport?.playback.currentFrame ?? 0}
                    transformContext={transformContext}
                    selectedId={showAnnotations ? selectedAnnotationId : null}
                    config={annotationConfig}
                    handlers={showAnnotations ? annotationHandlers : undefined}
                    readOnly={readOnlyAnnotations}
                  />
                )
              )}

              {/* 기존 오버레이 렌더링 */}
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
                  // Phase 3g: 어노테이션 도구
                  showAnnotationTools={showAnnotationTools}
                  activeTool={activeTool}
                  onToolChange={handleToolChange}
                />
              ) : null}
            </HybridViewportSlot>
          );
        })}
      </HybridViewportGrid>
    </div>
  );
});
