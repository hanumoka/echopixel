import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from 'react';
import {
  useToolGroup,
  MouseBindings,
  KeyboardModifiers,
  coordinateTransformer,
  LengthTool,
  AngleTool,
  PointTool,
  DICOM_UNIT_CODES,
  ULTRASOUND_PHYSICAL_UNITS,
  type DicomImageInfo,
  type ViewportManagerLike,
  type Viewport,
  type ToolBinding,
  type Annotation,
  type SVGRenderConfig,
  type TransformContext,
  type MeasurementTool,
  type ToolContext,
  type TempAnnotation,
  type ToolMouseEvent,
  type CalibrationData,
} from '@echopixel/core';
import { SVGOverlay } from './annotations/SVGOverlay';
import { DicomCanvas, type DicomCanvasHandle } from './building-blocks/DicomCanvas';
import { DicomStatusBar } from './building-blocks/DicomStatusBar';
import { DicomControls } from './building-blocks/DicomControls';
import { DicomToolInfo } from './building-blocks/DicomToolInfo';
import {
  DicomToolbar,
  DEFAULT_TOOLS,
  ANNOTATION_TOOL_IDS,
  type ToolDefinition,
} from './building-blocks/DicomToolbar';
import type {
  ImageStatus,
  CanvasInfo,
  WindowLevelInfo,
  TransformInfo,
  PlaybackState,
  ToolMode,
} from '../types';

/**
 * 조작 도구 ID 목록 (ToolGroup에 등록된 도구들)
 * 어노테이션 도구 선택 시 이 도구들의 Primary 바인딩을 해제합니다.
 */
const MANIPULATION_TOOL_IDS = ['WindowLevel', 'Pan', 'Zoom', 'StackScroll'] as const;

/**
 * SingleDicomViewer 외부 제어용 핸들
 */
export interface SingleDicomViewerHandle {
  /** 재생 시작 */
  play: () => void;
  /** 재생 정지 */
  pause: () => void;
  /** 재생/정지 토글 */
  togglePlay: () => void;
  /** FPS 설정 */
  setFps: (fps: number) => void;
  /** 특정 프레임으로 이동 */
  goToFrame: (frame: number) => void;
  /** 뷰포트 리셋 (W/L, Pan, Zoom) */
  resetViewport: () => void;
  /** 현재 상태 조회 */
  getState: () => {
    isPlaying: boolean;
    currentFrame: number;
    fps: number;
    totalFrames: number;
  };
}

/**
 * SingleDicomViewer Props
 */
export interface SingleDicomViewerProps {
  /** 프레임 데이터 배열 */
  frames: Uint8Array[];
  /** 이미지 정보 */
  imageInfo: DicomImageInfo;
  /** 압축 여부 */
  isEncapsulated: boolean;
  /** 뷰포트 ID (멀티 뷰포트 환경에서 구분용) */
  viewportId?: string;
  /** 캔버스 너비 */
  width?: number;
  /** 캔버스 높이 */
  height?: number;
  /** 초기 FPS */
  initialFps?: number;
  /** 상태바 표시 여부 */
  showStatusBar?: boolean;
  /** 컨트롤 표시 여부 */
  showControls?: boolean;
  /** 도구 정보 표시 여부 */
  showToolInfo?: boolean;
  /** 툴바 표시 여부 */
  showToolbar?: boolean;
  /** 툴바에 표시할 도구 목록 */
  toolbarTools?: ToolDefinition[];
  /** 툴바 방향 */
  toolbarOrientation?: 'horizontal' | 'vertical';
  /** 툴바 컴팩트 모드 */
  toolbarCompact?: boolean;
  /** Context Loss 테스트 버튼 표시 (개발용) */
  showContextLossTest?: boolean;
  /** 커스텀 스타일 */
  style?: React.CSSProperties;
  /** 커스텀 클래스명 */
  className?: string;

  // ============================================================
  // Annotation Props (Phase 3e)
  // ============================================================

  /** 어노테이션 목록 */
  annotations?: Annotation[];
  /** 선택된 어노테이션 ID */
  selectedAnnotationId?: string | null;
  /** 어노테이션 선택 핸들러 */
  onAnnotationSelect?: (annotationId: string | null) => void;
  /** 어노테이션 업데이트 핸들러 */
  onAnnotationUpdate?: (annotation: Annotation) => void;
  /** 어노테이션 삭제 핸들러 */
  onAnnotationDelete?: (annotationId: string) => void;
  /** 어노테이션 렌더링 설정 */
  annotationConfig?: Partial<SVGRenderConfig>;
  /** 읽기 전용 모드 (드래그 비활성화) */
  readOnlyAnnotations?: boolean;
}

/**
 * SingleDicomViewer
 *
 * 단일 DICOM 뷰어 컴포넌트 (풀 UI)
 * - DicomCanvas: WebGL 렌더링
 * - DicomStatusBar: 상태 표시
 * - DicomControls: 재생 컨트롤
 * - DicomToolInfo: 도구 안내
 * - Tool System: 마우스 조작 (W/L, Pan, Zoom)
 *
 * @example
 * ```tsx
 * <SingleDicomViewer
 *   frames={frames}
 *   imageInfo={imageInfo}
 *   isEncapsulated={true}
 *   width={512}
 *   height={512}
 * />
 * ```
 */
export const SingleDicomViewer = forwardRef<
  SingleDicomViewerHandle,
  SingleDicomViewerProps
>(function SingleDicomViewer(
  {
    frames,
    imageInfo,
    isEncapsulated,
    viewportId: propViewportId,
    width = 512,
    height = 512,
    initialFps = 30,
    showStatusBar = true,
    showControls = true,
    showToolInfo = true,
    showToolbar = false,
    toolbarTools = DEFAULT_TOOLS,
    toolbarOrientation = 'horizontal',
    toolbarCompact = false,
    showContextLossTest = false,
    style,
    className,
    // Annotation props
    annotations = [],
    selectedAnnotationId = null,
    onAnnotationSelect,
    onAnnotationUpdate,
    onAnnotationDelete,
    annotationConfig,
    readOnlyAnnotations = false,
  },
  ref
) {
  const canvasRef = useRef<DicomCanvasHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const currentFrameRef = useRef(0);

  // W/L ref (렌더링 함수에서 최신 값 사용)
  const windowCenterRef = useRef<number | undefined>(undefined);
  const windowWidthRef = useRef<number | undefined>(undefined);

  // 상태
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(initialFps);
  const [webglReady, setWebglReady] = useState(false);

  // Window/Level (상태)
  const [windowCenter, setWindowCenter] = useState<number | undefined>(undefined);
  const [windowWidth, setWindowWidth] = useState<number | undefined>(undefined);

  // Transform (Pan/Zoom/Rotation/Flip)
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.0);
  const [rotation, setRotation] = useState(0); // 각도 (degrees)
  const [flipH, setFlipH] = useState(false); // 가로 플립
  const [flipV, setFlipV] = useState(false); // 세로 플립

  // Tool System용 상태
  const [viewportElements] = useState(() => new Map<string, HTMLElement>());
  const [viewportElementsVersion, setViewportElementsVersion] = useState(0);

  // 툴바 활성 도구 (좌클릭 바인딩)
  const [activeTool, setActiveTool] = useState('WindowLevel');

  // 어노테이션 도구 상태 (Phase 3f)
  // null이면 조작 도구 사용 중, 값이 있으면 MeasurementTool 활성
  const [activeMeasurementToolId, setActiveMeasurementToolId] = useState<string | null>(null);
  // 임시 어노테이션 (드로잉 중 미리보기)
  const [tempAnnotation, setTempAnnotation] = useState<TempAnnotation | null>(null);

  // MeasurementTool 인스턴스 (렌더링마다 재생성 방지)
  const measurementToolsRef = useRef<Record<string, MeasurementTool>>({
    Length: new LengthTool(),
    Angle: new AngleTool(),
    Point: new PointTool(),
  });

  // 컴포넌트 언마운트 시 MeasurementTool cleanup (Phase 3f)
  useEffect(() => {
    return () => {
      // 모든 도구 비활성화 (메모리 누수 방지)
      Object.values(measurementToolsRef.current).forEach(tool => {
        if (tool.isActive()) {
          tool.deactivate();
        }
      });
    };
  }, []);

  // DPR
  const [dpr, setDpr] = useState(() =>
    Math.min(window.devicePixelRatio || 1, 2)
  );

  // 뷰포트/툴그룹 ID
  const viewportId = propViewportId ?? 'single-viewport';
  const toolGroupId = `${viewportId}-tools`;

  // 정지 이미지 여부
  const isStaticImage = frames.length <= 1;
  const toolMode: ToolMode = isStaticImage ? 'static' : 'video';
  const totalFrames = frames.length;

  // currentFrame ref 동기화
  useEffect(() => {
    currentFrameRef.current = currentFrame;

    // MeasurementTool context 업데이트 (프레임 변경 시)
    if (activeMeasurementToolId) {
      const tool = measurementToolsRef.current[activeMeasurementToolId];
      tool?.updateContext({ frameIndex: currentFrame });
    }
  }, [currentFrame, activeMeasurementToolId]);

  // W/L ref 동기화
  useEffect(() => {
    windowCenterRef.current = windowCenter;
    windowWidthRef.current = windowWidth;
  }, [windowCenter, windowWidth]);

  // DPR 변경 감지 (브라우저 줌 변경 대응)
  // MDN 권장 패턴: 매번 새로운 devicePixelRatio 값으로 미디어 쿼리 재생성
  // https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio
  useEffect(() => {
    let removeListener: (() => void) | null = null;

    const updatePixelRatio = () => {
      // 이전 리스너 제거
      removeListener?.();

      const newDpr = Math.min(window.devicePixelRatio || 1, 2);
      setDpr(newDpr);

      // 새 devicePixelRatio 값으로 미디어 쿼리 생성
      const mqString = `(resolution: ${window.devicePixelRatio}dppx)`;
      const media = window.matchMedia(mqString);
      media.addEventListener('change', updatePixelRatio);
      removeListener = () => {
        media.removeEventListener('change', updatePixelRatio);
      };
    };

    updatePixelRatio();

    return () => {
      removeListener?.();
    };
  }, []);

  // ViewportManagerLike 어댑터 (Tool System 연결)
  const viewportManager = useMemo<ViewportManagerLike>(() => ({
    getViewport: (id: string): Viewport | null => {
      if (id !== viewportId) return null;

      // W/L 기본값 계산
      let wl: { center: number; width: number } | null = null;
      if (windowCenter !== undefined && windowWidth !== undefined) {
        wl = { center: windowCenter, width: windowWidth };
      } else if (imageInfo) {
        const bits = isEncapsulated ? 8 : (imageInfo.bitsStored ?? 8);
        wl = { center: Math.pow(2, bits - 1), width: Math.pow(2, bits) };
      }

      return {
        id: viewportId,
        textureUnit: 0,
        windowLevel: wl,
        transform: { pan, zoom, rotation, flipH: false, flipV: false },
        playback: {
          isPlaying,
          currentFrame,
          fps,
          lastFrameTime: 0,
        },
        series: imageInfo ? {
          seriesId: viewportId,
          frameCount: frames.length,
          imageWidth: imageInfo.columns,
          imageHeight: imageInfo.rows,
          isEncapsulated,
          bitsStored: imageInfo.bitsStored,
        } : null,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        active: true,
      };
    },
    setViewportWindowLevel: (id: string, wl: { center: number; width: number } | null) => {
      if (id !== viewportId) return;
      if (wl) {
        windowCenterRef.current = wl.center;
        windowWidthRef.current = wl.width;
        setWindowCenter(wl.center);
        setWindowWidth(wl.width);
      } else {
        windowCenterRef.current = undefined;
        windowWidthRef.current = undefined;
        setWindowCenter(undefined);
        setWindowWidth(undefined);
      }
    },
    setViewportPan: (id: string, newPan: { x: number; y: number }) => {
      if (id !== viewportId) return;
      setPan(newPan);
    },
    setViewportZoom: (id: string, newZoom: number) => {
      if (id !== viewportId) return;
      setZoom(Math.max(0.1, Math.min(10, newZoom)));
    },
    setViewportFrame: (id: string, frameIndex: number) => {
      if (id !== viewportId) return;
      const clampedFrame = Math.max(0, Math.min(frames.length - 1, frameIndex));
      setCurrentFrame(clampedFrame);
    },
  }), [viewportId, windowCenter, windowWidth, pan, zoom, rotation, isPlaying, currentFrame, fps, imageInfo, frames.length, isEncapsulated]);

  // ============================================================
  // Annotation System (Phase 3e)
  // ============================================================

  // TransformContext 생성 (DICOM 좌표 → Canvas 좌표 변환용)
  const transformContext = useMemo<TransformContext | null>(() => {
    // 이미지 정보가 없거나 캔버스 크기가 유효하지 않으면 null
    if (!imageInfo || width <= 0 || height <= 0) return null;

    // Calibration 생성
    // 우선순위: 1) Pixel Spacing (mm/pixel) → cm 변환
    //          2) Ultrasound Calibration (이미 cm/pixel)
    let calibration: CalibrationData | undefined;

    if (imageInfo.pixelSpacing) {
      // Pixel Spacing: mm/pixel → cm/pixel 변환 (/10)
      calibration = {
        physicalDeltaX: imageInfo.pixelSpacing.columnSpacing / 10,
        physicalDeltaY: imageInfo.pixelSpacing.rowSpacing / 10,
        unitX: DICOM_UNIT_CODES.CENTIMETER,
        unitY: DICOM_UNIT_CODES.CENTIMETER,
      };
    } else if (imageInfo.ultrasoundCalibration) {
      // Ultrasound Calibration: 이미 단위/pixel (보통 cm/pixel)
      const usCal = imageInfo.ultrasoundCalibration;

      // Physical Units를 DICOM_UNIT_CODES로 변환
      const convertUnit = (usUnit: number): number => {
        switch (usUnit) {
          case ULTRASOUND_PHYSICAL_UNITS.CM:
            return DICOM_UNIT_CODES.CENTIMETER;
          case ULTRASOUND_PHYSICAL_UNITS.SECONDS:
            return DICOM_UNIT_CODES.SECONDS;
          case ULTRASOUND_PHYSICAL_UNITS.CM_PER_SEC:
            return DICOM_UNIT_CODES.CM_PER_SEC;
          default:
            return DICOM_UNIT_CODES.CENTIMETER; // 기본값
        }
      };

      calibration = {
        physicalDeltaX: Math.abs(usCal.physicalDeltaX), // 음수 가능하므로 절대값
        physicalDeltaY: Math.abs(usCal.physicalDeltaY),
        unitX: convertUnit(usCal.physicalUnitsX),
        unitY: convertUnit(usCal.physicalUnitsY),
      };
    }

    return {
      viewport: {
        imageWidth: imageInfo.columns,
        imageHeight: imageInfo.rows,
        canvasWidth: width,
        canvasHeight: height,
        zoom,
        pan,
        rotation,
        flipH,
        flipV,
      },
      calibration,
      mode: 'B' as const, // 기본값: B-mode (TODO: imageInfo에서 mode 가져오기)
    };
  }, [imageInfo, width, height, zoom, pan, rotation, flipH, flipV]);

  // Annotation event handlers
  const annotationHandlers = useMemo(() => {
    if (readOnlyAnnotations) return undefined;

    return {
      onSelect: onAnnotationSelect,
      onUpdate: onAnnotationUpdate,
      onDelete: onAnnotationDelete,
    };
  }, [readOnlyAnnotations, onAnnotationSelect, onAnnotationUpdate, onAnnotationDelete]);

  // ============================================================
  // MeasurementTool Canvas 이벤트 처리 (Phase 3f)
  // ============================================================

  useEffect(() => {
    const element = canvasContainerRef.current;
    if (!element || !activeMeasurementToolId || !transformContext) return;

    const tool = measurementToolsRef.current[activeMeasurementToolId];
    if (!tool) return;

    // 이미지 경계 (DICOM 좌표 기준)
    const imageWidth = imageInfo.columns;
    const imageHeight = imageInfo.rows;

    // DICOM 좌표가 이미지 영역 내인지 검증
    const isWithinImageBounds = (dicomX: number, dicomY: number): boolean => {
      return dicomX >= 0 && dicomX <= imageWidth && dicomY >= 0 && dicomY <= imageHeight;
    };

    // 마우스 이벤트 → ToolMouseEvent 변환
    const createToolEvent = (evt: MouseEvent): ToolMouseEvent | null => {
      const rect = element.getBoundingClientRect();
      const canvasX = evt.clientX - rect.left;
      const canvasY = evt.clientY - rect.top;

      // Canvas 좌표 → DICOM 좌표 변환
      const dicomPoint = coordinateTransformer.canvasToDicom(
        { x: canvasX, y: canvasY },
        transformContext
      );

      // ★ 이미지 영역 밖이면 null 반환 (이벤트 차단)
      if (!isWithinImageBounds(dicomPoint.x, dicomPoint.y)) {
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
      // 어노테이션 Shape 또는 DragHandle 내부 클릭이면 무시
      // (SVGOverlay에서 선택/드래그 처리)
      // .annotation-shape: 모든 어노테이션 도형의 공통 클래스 (확장성)
      const target = evt.target as Element;
      if (target.closest('.annotation-shape, .drag-handle')) {
        return;
      }

      // 좌클릭만 처리 (우클릭은 취소)
      if (evt.button === 0) {
        const toolEvent = createToolEvent(evt);
        // ★ 이미지 영역 밖이면 무시
        if (!toolEvent) return;

        evt.preventDefault(); // 텍스트 선택 방지
        tool.handleMouseDown(toolEvent);
      } else if (evt.button === 2) {
        // 우클릭: 드로잉 취소
        tool.cancelDrawing();
        setTempAnnotation(null);
      }
    };

    const handleMouseMove = (evt: MouseEvent) => {
      const toolEvent = createToolEvent(evt);
      // ★ 이미지 영역 밖이면 무시 (미리보기도 차단)
      if (!toolEvent) return;

      tool.handleMouseMove(toolEvent);
    };

    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMove);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('mousemove', handleMouseMove);
    };
  }, [activeMeasurementToolId, transformContext]);

  // Tool System 통합
  const { setToolActive: setToolGroupToolActive } = useToolGroup({
    toolGroupId,
    viewportManager,
    viewportElements,
    viewportElementsKey: viewportElementsVersion,
    disabled: !webglReady || frames.length === 0,
    isStaticImage,
  });

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

  // 어노테이션 생성 완료 콜백 (Phase 3f + 3g-2 Figma 방식)
  const handleAnnotationCreated = useCallback((annotation: Annotation) => {
    // 외부 핸들러 호출 (어노테이션 저장)
    onAnnotationUpdate?.(annotation);

    // Figma 방식: 생성 후 자동으로 해당 어노테이션 선택
    // → DragHandle이 바로 표시되어 미세 조정 가능
    onAnnotationSelect?.(annotation.id);

    // 도구 상태 초기화 (계속 그릴 수 있도록 ready 상태 유지)
    setTempAnnotation(null);
  }, [onAnnotationUpdate, onAnnotationSelect]);

  // 임시 어노테이션 업데이트 콜백 (미리보기)
  const handleTempUpdate = useCallback((temp: TempAnnotation | null) => {
    setTempAnnotation(temp);
  }, []);

  // 툴바에서 도구 선택 시 좌클릭 바인딩 변경
  const handleToolbarToolChange = useCallback((toolId: string) => {
    const isAnnotationTool = (ANNOTATION_TOOL_IDS as readonly string[]).includes(toolId);
    const prevTool = activeTool;
    const isPrevAnnotationTool = (ANNOTATION_TOOL_IDS as readonly string[]).includes(prevTool);

    // 이전 어노테이션 도구 비활성화
    if (activeMeasurementToolId && activeMeasurementToolId !== toolId) {
      measurementToolsRef.current[activeMeasurementToolId]?.deactivate();
      setTempAnnotation(null);
    }

    if (isAnnotationTool) {
      // ========================================
      // 어노테이션 도구 선택
      // ========================================
      const tool = measurementToolsRef.current[toolId];
      if (tool && transformContext) {
        // ToolContext 생성
        // calibration은 transformContext에 이미 포함되어 있음
        const context: ToolContext = {
          dicomId: viewportId,
          frameIndex: currentFrame,
          mode: transformContext.mode ?? 'B',
          calibration: transformContext.calibration,
          transformContext,
        };

        // MeasurementTool 활성화
        tool.activate(context, handleAnnotationCreated, handleTempUpdate);

        setActiveMeasurementToolId(toolId);
        setActiveTool(toolId);

        // ★ 모든 조작 도구의 Primary 바인딩 해제 (기본 바인딩으로 복원)
        // 이렇게 하면 좌클릭(Primary)은 어노테이션 도구만 사용하게 됨
        // - WindowLevel: Secondary (우클릭)만
        // - Pan: Auxiliary (중클릭)만
        // - Zoom: Shift+Primary만 (Wheel은 정지 이미지에서만)
        // - StackScroll: Wheel만 (동영상에서만)
        for (const manipToolId of MANIPULATION_TOOL_IDS) {
          const defaultBindings = getDefaultBindings(manipToolId);
          setToolGroupToolActive(manipToolId, defaultBindings);
        }
      }
    } else {
      // ========================================
      // 조작 도구 선택
      // ========================================
      if (activeMeasurementToolId) {
        measurementToolsRef.current[activeMeasurementToolId]?.deactivate();
        setActiveMeasurementToolId(null);
        setTempAnnotation(null);
      }

      setActiveTool(toolId);

      // 이전 도구: 기본 바인딩으로 복원 (좌클릭 제거)
      if (prevTool !== toolId) {
        const prevBindings = getDefaultBindings(prevTool);
        setToolGroupToolActive(prevTool, prevBindings);
      }

      // 새 도구: 기본 바인딩 + 좌클릭 추가
      const newBindings = getDefaultBindings(toolId);
      const primaryBinding: ToolBinding = { mouseButton: MouseBindings.Primary };

      // 이미 Primary가 있으면 추가하지 않음
      const hasPrimary = newBindings.some(
        b => b.mouseButton === MouseBindings.Primary && !b.modifierKey
      );

      if (!hasPrimary) {
        setToolGroupToolActive(toolId, [...newBindings, primaryBinding]);
      } else {
        setToolGroupToolActive(toolId, newBindings);
      }
    }
  }, [activeTool, activeMeasurementToolId, getDefaultBindings, setToolGroupToolActive, transformContext, viewportId, currentFrame, handleAnnotationCreated, handleTempUpdate, imageInfo]);

  // 비활성화된 도구 목록 (정지 이미지에서 StackScroll)
  const disabledToolbarTools = useMemo(() => {
    return isStaticImage ? ['StackScroll'] : [];
  }, [isStaticImage]);

  // 캔버스 컨테이너를 Tool System에 등록
  useEffect(() => {
    const element = canvasContainerRef.current;
    if (element && webglReady) {
      viewportElements.set(viewportId, element);
      setViewportElementsVersion((v) => v + 1);
      return () => {
        viewportElements.delete(viewportId);
        setViewportElementsVersion((v) => v + 1);
      };
    }
  }, [viewportId, viewportElements, webglReady]);

  // W/L, 프레임, 캔버스 크기, 또는 DPR 변경 시 재렌더링
  useEffect(() => {
    if (webglReady && frames.length > 0) {
      canvasRef.current?.renderFrame(currentFrame);
    }
  }, [windowCenter, windowWidth, currentFrame, webglReady, frames.length, width, height, dpr]);

  // 파생 상태 (UI용)
  const windowLevel: WindowLevelInfo | null =
    windowCenter !== undefined && windowWidth !== undefined
      ? { center: windowCenter, width: windowWidth }
      : null;

  const transform: TransformInfo = { pan, zoom, rotation, flipH, flipV };

  const imageStatus: ImageStatus = {
    columns: imageInfo.columns,
    rows: imageInfo.rows,
    frameCount: totalFrames,
  };

  const canvasInfo: CanvasInfo = {
    width,
    height,
    dpr,
  };

  const playbackState: PlaybackState = {
    currentFrame,
    totalFrames,
    isPlaying,
    fps,
  };

  // WebGL 준비 완료 시 초기 프레임 렌더링
  const handleCanvasReady = useCallback(() => {
    setWebglReady(true);
    setTimeout(() => {
      canvasRef.current?.renderFrame(0);
    }, 50);
  }, []);

  // 프레임 변경 핸들러
  const handleFrameChange = useCallback((newFrame: number) => {
    setCurrentFrame(newFrame);
    canvasRef.current?.renderFrame(newFrame);
  }, []);

  // 재생/정지 토글
  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
    lastFrameTimeRef.current = 0;
  }, []);

  // 이전/다음 프레임
  const prevFrame = useCallback(() => {
    if (totalFrames === 0 || isPlaying) return;
    const newFrame = (currentFrame - 1 + totalFrames) % totalFrames;
    handleFrameChange(newFrame);
  }, [currentFrame, totalFrames, isPlaying, handleFrameChange]);

  const nextFrame = useCallback(() => {
    if (totalFrames === 0 || isPlaying) return;
    const newFrame = (currentFrame + 1) % totalFrames;
    handleFrameChange(newFrame);
  }, [currentFrame, totalFrames, isPlaying, handleFrameChange]);

  // 회전 (90° 단위)
  const rotateLeft = useCallback(() => {
    setRotation((prev) => (prev - 90 + 360) % 360);
  }, []);

  const rotateRight = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  // 플립 (토글)
  const toggleFlipH = useCallback(() => {
    setFlipH((prev) => !prev);
  }, []);

  const toggleFlipV = useCallback(() => {
    setFlipV((prev) => !prev);
  }, []);

  // 뷰포트 리셋
  const resetViewport = useCallback(() => {
    windowCenterRef.current = undefined;
    windowWidthRef.current = undefined;
    setWindowCenter(undefined);
    setWindowWidth(undefined);
    setPan({ x: 0, y: 0 });
    setZoom(1.0);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    canvasRef.current?.renderFrame(currentFrameRef.current);
  }, []);

  // Cine 재생 루프
  useEffect(() => {
    if (!webglReady || !isPlaying || totalFrames === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const frameInterval = 1000 / fps;

    const animate = (timestamp: number) => {
      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastFrameTimeRef.current;

      if (elapsed >= frameInterval) {
        lastFrameTimeRef.current = timestamp - (elapsed % frameInterval);

        setCurrentFrame((prev) => {
          const nextFrame = (prev + 1) % totalFrames;
          canvasRef.current?.renderFrame(nextFrame);
          return nextFrame;
        });
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [webglReady, isPlaying, totalFrames, fps]);

  // 키보드 이벤트
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prevFrame();
          break;
        case 'ArrowRight':
          e.preventDefault();
          nextFrame();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFps((prev) => Math.min(60, prev + 5));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFps((prev) => Math.max(1, prev - 5));
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          resetViewport();
          break;
        case 'Delete':
        case 'Backspace':
          // 선택된 어노테이션 삭제
          if (selectedAnnotationId && onAnnotationDelete) {
            e.preventDefault();
            onAnnotationDelete(selectedAnnotationId);
          }
          break;
      }
    },
    [togglePlay, prevFrame, nextFrame, resetViewport, selectedAnnotationId, onAnnotationDelete]
  );

  // Context Loss 테스트
  const handleTestContextLoss = useCallback(() => {
    canvasRef.current?.testContextLoss();
  }, []);

  // 우클릭 메뉴 방지
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // 외부 제어 핸들 노출
  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        setIsPlaying(true);
        lastFrameTimeRef.current = 0;
      },
      pause: () => {
        setIsPlaying(false);
      },
      togglePlay: () => {
        setIsPlaying((prev) => !prev);
        lastFrameTimeRef.current = 0;
      },
      setFps: (newFps: number) => {
        setFps(Math.max(1, Math.min(60, newFps)));
      },
      goToFrame: (frame: number) => {
        if (totalFrames === 0) return;
        const targetFrame = Math.max(0, Math.min(totalFrames - 1, frame));
        setCurrentFrame(targetFrame);
        canvasRef.current?.renderFrame(targetFrame);
      },
      resetViewport,
      getState: () => ({
        isPlaying,
        currentFrame,
        fps,
        totalFrames,
      }),
    }),
    [isPlaying, currentFrame, fps, totalFrames, resetViewport]
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        // 뷰어 컨테이너 배경 (OHIF 스타일 - 어두운 인디고)
        display: 'inline-block', // 내용물 크기에 맞게 조정
        background: '#0b1a42',
        padding: '12px',
        borderRadius: '4px',
        outline: 'none',
        ...style,
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* 상태바 */}
      {showStatusBar && (
        <DicomStatusBar
          imageStatus={imageStatus}
          canvasInfo={canvasInfo}
          windowLevel={windowLevel}
          transform={transform}
        />
      )}

      {/* 툴바 */}
      {showToolbar && (
        <DicomToolbar
          tools={toolbarTools}
          activeTool={activeTool}
          onToolChange={handleToolbarToolChange}
          disabledTools={disabledToolbarTools}
          showResetButton={true}
          onReset={resetViewport}
          showRotateButtons={true}
          onRotateLeft={rotateLeft}
          onRotateRight={rotateRight}
          showFlipButtons={true}
          onFlipHorizontal={toggleFlipH}
          onFlipVertical={toggleFlipV}
          flipH={flipH}
          flipV={flipV}
          orientation={toolbarOrientation}
          compact={toolbarCompact}
          style={{ marginBottom: '10px' }}
        />
      )}

      {/* 캔버스 컨테이너 (Tool System 이벤트 대상) */}
      <div
        ref={canvasContainerRef}
        style={{
          position: 'relative',
          width,
          height,
          marginBottom: '10px',
          overflow: 'hidden',
          // 뷰포트 영역 스타일링 (OHIF 스타일)
          background: '#000',
          border: '1px solid #333',
          borderRadius: '2px',
          boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.5), inset 0 0 20px rgba(0, 0, 0, 0.3)',
        }}
        onContextMenu={handleContextMenu}
      >
        <DicomCanvas
          ref={canvasRef}
          frames={frames}
          imageInfo={imageInfo}
          isEncapsulated={isEncapsulated}
          width={width}
          height={height}
          windowCenter={windowCenter}
          windowWidth={windowWidth}
          pan={pan}
          zoom={zoom}
          rotation={rotation}
          flipH={flipH}
          flipV={flipV}
          onReady={handleCanvasReady}
        />

        {/* SVG Annotation Overlay (Phase 3e + 3f) */}
        {(annotations.length > 0 || tempAnnotation) && transformContext && (
          <SVGOverlay
            annotations={annotations}
            currentFrame={currentFrame}
            transformContext={transformContext}
            selectedId={selectedAnnotationId}
            config={annotationConfig}
            handlers={annotationHandlers}
            readOnly={readOnlyAnnotations}
            tempAnnotation={tempAnnotation}
            tempAnnotationType={
              activeMeasurementToolId === 'Length' ? 'length' :
              activeMeasurementToolId === 'Angle' ? 'angle' :
              activeMeasurementToolId === 'Point' ? 'point' :
              undefined
            }
          />
        )}
      </div>

      {/* 재생 컨트롤 */}
      {showControls && (
        <DicomControls
          playbackState={playbackState}
          onTogglePlay={togglePlay}
          onPrevFrame={prevFrame}
          onNextFrame={nextFrame}
          onFrameChange={handleFrameChange}
          onFpsChange={setFps}
        />
      )}

      {/* 도구 정보 */}
      {showToolInfo && (
        <DicomToolInfo
          mode={toolMode}
          showContextLossTest={showContextLossTest}
          onTestContextLoss={handleTestContextLoss}
        />
      )}
    </div>
  );
});
