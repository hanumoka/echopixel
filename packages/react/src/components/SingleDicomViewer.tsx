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
  type DicomImageInfo,
  type ViewportManagerLike,
  type Viewport,
  type ToolBinding,
  type Annotation,
  type SVGRenderConfig,
  type TransformContext,
} from '@echopixel/core';
import { SVGOverlay } from './annotations/SVGOverlay';
import { DicomCanvas, type DicomCanvasHandle } from './building-blocks/DicomCanvas';
import { DicomStatusBar } from './building-blocks/DicomStatusBar';
import { DicomControls } from './building-blocks/DicomControls';
import { DicomToolInfo } from './building-blocks/DicomToolInfo';
import {
  DicomToolbar,
  DEFAULT_TOOLS,
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
  }, [currentFrame]);

  // W/L ref 동기화
  useEffect(() => {
    windowCenterRef.current = windowCenter;
    windowWidthRef.current = windowWidth;
  }, [windowCenter, windowWidth]);

  // DPR 변경 감지
  useEffect(() => {
    const updateDpr = () => {
      setDpr(Math.min(window.devicePixelRatio || 1, 2));
    };

    const mediaQuery = window.matchMedia(
      `(resolution: ${window.devicePixelRatio}dppx)`
    );
    mediaQuery.addEventListener('change', updateDpr);

    return () => {
      mediaQuery.removeEventListener('change', updateDpr);
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

  // 툴바에서 도구 선택 시 좌클릭 바인딩 변경
  const handleToolbarToolChange = useCallback((toolId: string) => {
    const prevTool = activeTool;
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
  }, [activeTool, getDefaultBindings, setToolGroupToolActive]);

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

  // W/L, 프레임, 또는 캔버스 크기 변경 시 재렌더링
  useEffect(() => {
    if (webglReady && frames.length > 0) {
      canvasRef.current?.renderFrame(currentFrame);
    }
  }, [windowCenter, windowWidth, currentFrame, webglReady, frames.length, width, height]);

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
      }
    },
    [togglePlay, prevFrame, nextFrame, resetViewport]
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

        {/* SVG Annotation Overlay (Phase 3e) */}
        {annotations.length > 0 && transformContext && (
          <SVGOverlay
            annotations={annotations}
            currentFrame={currentFrame}
            transformContext={transformContext}
            selectedId={selectedAnnotationId}
            config={annotationConfig}
            handlers={annotationHandlers}
            readOnly={readOnlyAnnotations}
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
