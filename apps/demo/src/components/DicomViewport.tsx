import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
import {
  decodeJpeg,
  decodeNative,
  closeDecodedFrame,
  TextureManager,
  QuadRenderer,
  useToolGroup,
  type DicomImageInfo,
  type WindowLevelOptions,
  type DataSource,
  type DicomInstanceId,
  type DicomMetadata,
  type ViewportManagerLike,
  type Viewport,
} from '@echopixel/core';

/**
 * DicomViewport 외부 제어용 핸들 타입
 * useImperativeHandle로 노출되는 메서드들
 */
export interface DicomViewportHandle {
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
  /** 현재 상태 조회 */
  getState: () => {
    isPlaying: boolean;
    currentFrame: number;
    fps: number;
    totalFrames: number;
  };
}

/**
 * DicomViewport Props
 *
 * 두 가지 사용 방식을 지원:
 * 1. 직접 데이터 전달: frames, imageInfo, isEncapsulated
 * 2. DataSource 사용: dataSource, instanceId
 */
export interface DicomViewportProps {
  // === 직접 데이터 전달 방식 (기존) ===
  /** 프레임 데이터 배열 */
  frames?: Uint8Array[];
  /** 이미지 정보 */
  imageInfo?: DicomImageInfo;
  /** 압축 여부 */
  isEncapsulated?: boolean;

  // === DataSource 방식 (신규) ===
  /** DICOM 데이터 소스 */
  dataSource?: DataSource;
  /** DICOM 인스턴스 식별자 */
  instanceId?: DicomInstanceId;

  // === 공통 ===
  /** 뷰포트 고유 ID (Multi Canvas 모드에서 각 뷰포트를 구분하기 위해 필요) */
  viewportId?: string;
  /** 캔버스 너비 (responsive=false일 때 사용) */
  width?: number;
  /** 캔버스 높이 (responsive=false일 때 사용) */
  height?: number;
  /** 컨테이너에 맞춰 자동 크기 조정 (기본값: false) */
  responsive?: boolean;
  /** 종횡비 유지 여부 (responsive=true일 때만 적용, 기본값: true) */
  maintainAspectRatio?: boolean;
  /** 로딩 상태 콜백 */
  onLoadingChange?: (loading: boolean) => void;
  /** 메타데이터 로드 완료 콜백 */
  onMetadataLoaded?: (metadata: DicomMetadata) => void;
  /** 에러 콜백 */
  onError?: (error: Error) => void;
}

export const DicomViewport = forwardRef<DicomViewportHandle, DicomViewportProps>(function DicomViewport({
  frames: propFrames,
  imageInfo: propImageInfo,
  isEncapsulated: propIsEncapsulated,
  dataSource,
  instanceId,
  viewportId: propViewportId,
  width: propWidth = 512,
  height: propHeight = 512,
  responsive = false,
  maintainAspectRatio = true,
  onLoadingChange,
  onMetadataLoaded,
  onError,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const textureManagerRef = useRef<TextureManager | null>(null);
  const quadRendererRef = useRef<QuadRenderer | null>(null);

  // Cine 재생 관련
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  // Tool System용 캔버스 컨테이너 ref
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // W/L 값을 ref로도 관리 (렌더링 함수에서 최신 값 사용)
  const windowCenterRef = useRef<number | undefined>(undefined);
  const windowWidthRef = useRef<number | undefined>(undefined);

  // Context 복구 시 현재 프레임을 유지하기 위한 ref
  // useEffect 클로저 캡처 문제를 해결하기 위해 ref 사용
  const currentFrameRef = useRef(0);

  // 초기 렌더링 완료 여부 (첫 데이터 로드 vs Context 복구 구분)
  const initialRenderDoneRef = useRef(false);

  // 이전 frames/imageInfo 참조 (새 시리즈 로드 감지용)
  // Context 복구 vs 새 시리즈 로드를 구분하기 위해 필요
  const prevFramesRef = useRef<Uint8Array[] | null>(null);
  const prevImageInfoRef = useRef<DicomImageInfo | null>(null);

  // DataSource에서 로드한 데이터 (내부 상태)
  const [loadedFrames, setLoadedFrames] = useState<Uint8Array[]>([]);
  const [loadedImageInfo, setLoadedImageInfo] = useState<DicomImageInfo | null>(null);
  const [loadedIsEncapsulated, setLoadedIsEncapsulated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);

  // 최종 사용할 데이터 (props 또는 로드된 데이터)
  const frames = propFrames ?? loadedFrames;
  const imageInfo = propImageInfo ?? loadedImageInfo;
  const isEncapsulated = propIsEncapsulated ?? loadedIsEncapsulated;

  // 상태
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(30);

  // currentFrame ref 동기화 (Context 복구 시 최신 값 사용)
  useEffect(() => {
    currentFrameRef.current = currentFrame;
  }, [currentFrame]);
  const [windowCenter, setWindowCenter] = useState<number | undefined>(undefined);
  const [windowWidth, setWindowWidth] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState('');
  const [webglReady, setWebglReady] = useState(false); // WebGL 준비 상태
  const [renderError, setRenderError] = useState<string | null>(null); // 렌더링 에러 상태
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, 2)); // DPI 배율 (최대 2로 제한)

  // Tool System용 상태
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.0);
  const [viewportElements] = useState(() => new Map<string, HTMLElement>());
  // viewportElements Map 변경 시 re-render를 트리거하기 위한 카운터
  const [viewportElementsVersion, setViewportElementsVersion] = useState(0);

  // 반응형 모드를 위한 계산된 크기
  const [computedSize, setComputedSize] = useState({ width: propWidth, height: propHeight });

  // Tool System용 뷰포트 ID
  // Multi Canvas 모드에서는 각 뷰포트마다 고유한 ID가 필요함
  // 기본값 'single-viewport'는 Single Viewport 모드 호환성을 위해 유지
  const viewportId = propViewportId ?? 'single-viewport';
  const toolGroupId = `${viewportId}-tools`;

  // W/L 기본값 계산용 ref (imageInfo 변경 시 업데이트)
  const defaultBitsRef = useRef(8);
  useEffect(() => {
    if (imageInfo) {
      defaultBitsRef.current = isEncapsulated ? 8 : (imageInfo.bitsStored ?? 8);
    }
  }, [imageInfo, isEncapsulated]);

  // ViewportManagerLike 어댑터 생성
  // Tool System이 호출하는 메서드들을 DicomViewport 상태에 연결
  const viewportManager = useMemo<ViewportManagerLike>(() => ({
    getViewport: (id: string): Viewport | null => {
      if (id !== viewportId) return null;

      // W/L 기본값 계산: W/L이 설정되지 않았으면 bitsStored 기반 기본값 사용
      let wl: { center: number; width: number } | null = null;
      if (windowCenter !== undefined && windowWidth !== undefined) {
        wl = { center: windowCenter, width: windowWidth };
      } else if (imageInfo) {
        // 기본값: center = 2^(bits-1), width = 2^bits
        const bits = isEncapsulated ? 8 : (imageInfo.bitsStored ?? 8);
        wl = { center: Math.pow(2, bits - 1), width: Math.pow(2, bits) };
      }

      return {
        id: viewportId,
        textureUnit: 0,
        windowLevel: wl,
        transform: { pan, zoom, rotation: 0 },
        playback: {
          isPlaying,
          currentFrame,
          fps,
        },
        series: imageInfo ? {
          frameCount: frames.length,
          imageWidth: imageInfo.columns,
          imageHeight: imageInfo.rows,
          isEncapsulated,
          bitsStored: imageInfo.bitsStored,
        } : null,
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
  }), [viewportId, windowCenter, windowWidth, pan, zoom, isPlaying, currentFrame, fps, imageInfo, frames.length, isEncapsulated]);

  // 정지 이미지 여부 (프레임이 1개면 정지 이미지)
  const isStaticImage = frames.length <= 1;

  // Tool System 통합
  // 정지 이미지: 휠 → Zoom
  // 동영상: 휠 → StackScroll (프레임 전환)
  const { resetAllViewports } = useToolGroup({
    toolGroupId,  // 뷰포트별 고유 ID 사용
    viewportManager,
    viewportElements,
    viewportElementsKey: viewportElementsVersion, // Map 변경 시 재등록 트리거
    disabled: !webglReady || frames.length === 0,
    isStaticImage, // 정지/동영상 모드에 따라 도구 바인딩 변경
  });

  // Tool System에 캔버스 컨테이너 요소 등록
  // 주의: Map을 mutate해도 React가 변경을 감지하지 못하므로
  // viewportElementsVersion을 증가시켜 re-render 트리거
  useEffect(() => {
    const element = canvasContainerRef.current;
    if (element && webglReady) {
      viewportElements.set(viewportId, element);
      // Map 변경 후 re-render 트리거 → useToolGroup이 새 요소 감지
      setViewportElementsVersion((v) => v + 1);
      return () => {
        viewportElements.delete(viewportId);
        setViewportElementsVersion((v) => v + 1);
      };
    }
  }, [viewportId, viewportElements, webglReady]);

  // W/L 또는 프레임 변경 시 재렌더링 (Tool System에서 변경 시)
  useEffect(() => {
    if (webglReady && frames.length > 0) {
      renderFrame(currentFrame);
    }
  }, [windowCenter, windowWidth, currentFrame]); // eslint-disable-line react-hooks/exhaustive-deps

  // 최종 사용할 Canvas 크기 (반응형이면 계산된 크기, 아니면 prop 크기)
  const width = responsive ? computedSize.width : propWidth;
  const height = responsive ? computedSize.height : propHeight;

  const totalFrames = frames.length;

  // DPR 변경 감지 (모니터 간 창 이동 시)
  useEffect(() => {
    const updateDpr = () => {
      const newDpr = Math.min(window.devicePixelRatio || 1, 2);
      setDpr(newDpr);
    };

    // matchMedia를 사용한 DPR 변경 감지
    const mediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mediaQuery.addEventListener('change', updateDpr);

    return () => {
      mediaQuery.removeEventListener('change', updateDpr);
    };
  }, []);

  // 반응형 모드: 컨테이너 크기에 맞춰 Canvas 크기 계산
  useEffect(() => {
    if (!responsive || !containerRef.current) {
      // 반응형이 아니면 prop 크기 사용
      setComputedSize({ width: propWidth, height: propHeight });
      return;
    }

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const calculateSize = (containerWidth: number, containerHeight: number) => {
      if (containerWidth <= 0 || containerHeight <= 0) return;

      if (!maintainAspectRatio || !imageInfo) {
        // 종횡비 유지 안함: 컨테이너 크기 그대로 사용
        setComputedSize({ width: containerWidth, height: containerHeight });
      } else {
        // 종횡비 유지: 이미지 비율에 맞춰 계산
        const imageAspectRatio = imageInfo.columns / imageInfo.rows;
        const containerAspectRatio = containerWidth / containerHeight;

        let newWidth: number;
        let newHeight: number;

        if (containerAspectRatio > imageAspectRatio) {
          // 컨테이너가 더 넓음 → 높이에 맞춤
          newHeight = containerHeight;
          newWidth = Math.floor(containerHeight * imageAspectRatio);
        } else {
          // 컨테이너가 더 좁음 → 너비에 맞춤
          newWidth = containerWidth;
          newHeight = Math.floor(containerWidth / imageAspectRatio);
        }

        setComputedSize({ width: newWidth, height: newHeight });
      }
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: containerWidth, height: containerHeight } = entry.contentRect;

        // 디바운싱: 빈번한 리사이즈 이벤트 최적화
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }

        resizeTimeout = setTimeout(() => {
          calculateSize(containerWidth, containerHeight);
        }, 16); // ~60fps
      }
    });

    resizeObserver.observe(containerRef.current);

    // 초기 크기 계산
    const rect = containerRef.current.getBoundingClientRect();
    calculateSize(rect.width, rect.height);

    return () => {
      resizeObserver.disconnect();
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, [responsive, maintainAspectRatio, imageInfo, propWidth, propHeight]);

  // DataSource에서 데이터 로드
  // 의존성: instanceId를 값으로 비교 (객체 참조가 아닌 개별 UID 값 사용)
  // 이유: 부모 컴포넌트에서 instanceId 객체를 인라인으로 생성하면 매 렌더링마다
  //       새 참조가 생성되어 무한 루프 발생 가능
  const studyUid = instanceId?.studyInstanceUid;
  const seriesUid = instanceId?.seriesInstanceUid;
  const sopUid = instanceId?.sopInstanceUid;

  useEffect(() => {
    if (!dataSource || !studyUid || !seriesUid || !sopUid) {
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      setIsLoading(true);
      setLoadError(null);
      onLoadingChange?.(true);

      try {
        const instanceIdToLoad: DicomInstanceId = {
          studyInstanceUid: studyUid,
          seriesInstanceUid: seriesUid,
          sopInstanceUid: sopUid,
        };
        const { metadata, frames: loadedData } = await dataSource.loadAllFrames(instanceIdToLoad);

        if (cancelled) return;

        setLoadedFrames(loadedData);
        setLoadedImageInfo(metadata.imageInfo);
        setLoadedIsEncapsulated(metadata.isEncapsulated);

        // 메타데이터 콜백 호출
        onMetadataLoaded?.(metadata);
      } catch (err) {
        if (cancelled) return;

        const error = err instanceof Error ? err : new Error(String(err));
        console.error('[DicomViewport] Load error:', error);
        setLoadError(error);
        onError?.(error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          onLoadingChange?.(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource, studyUid, seriesUid, sopUid]); // 개별 UID 값으로 의존성 설정 (무한 루프 방지)

  // WebGL 초기화 및 이벤트 리스너
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // WebGL 리소스 초기화 여부 (ResizeObserver와 공유)
    let webglInitialized = false;

    // WebGL 초기화 함수 (로컬)
    const initializeWebGL = () => {
      // cleanup에서 모든 리소스를 정리하므로 여기서는 항상 새로 생성
      // (React Strict Mode에서 cleanup → 새 Canvas → 새 초기화 보장)
      try {
        const gl = canvas.getContext('webgl2', {
          alpha: false,
          antialias: false,
          powerPreference: 'high-performance',
        });

        if (!gl) {
          throw new Error('WebGL2 is not supported');
        }

        // 컨텍스트가 lost 상태면 초기화 스킵
        if (gl.isContextLost()) {
          return false;
        }

        glRef.current = gl;
        textureManagerRef.current = new TextureManager(gl);
        quadRendererRef.current = new QuadRenderer(gl);

        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        return true;
      } catch (err) {
        console.error('WebGL initialization error:', err);
        return false;
      }
    };

    // Context lost 이벤트 핸들러
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setWebglReady(false);
      webglInitialized = false;
      // context lost 시에만 리소스 정리
      textureManagerRef.current?.dispose();
      quadRendererRef.current?.dispose();
      glRef.current = null;
      textureManagerRef.current = null;
      quadRendererRef.current = null;
    };

    // Context restored 이벤트 핸들러
    const handleContextRestored = () => {
      if (initializeWebGL()) {
        webglInitialized = true;
        // Canvas가 레이아웃 완료 상태인지 확인
        if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
          setWebglReady(true);
        }
      }
    };

    // 이벤트 리스너 등록
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    // ResizeObserver: Canvas가 레이아웃 완료되면 (clientWidth > 0) webglReady 설정
    // Canvas가 DOM에 추가되어도 레이아웃 전에는 clientWidth가 0
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Canvas가 실제 크기를 가지고 WebGL이 초기화되었으면 ready
        if (width > 0 && height > 0 && webglInitialized) {
          setWebglReady(true);
        }
      }
    });

    resizeObserver.observe(canvas);

    // 초기 WebGL 설정
    if (initializeWebGL()) {
      webglInitialized = true;
      // Canvas가 이미 레이아웃 완료 상태면 즉시 ready
      // (HMR이나 리마운트 시 이미 레이아웃이 완료된 상태일 수 있음)
      if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        setWebglReady(true);
      }
    }

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      resizeObserver.disconnect();

      // React Strict Mode에서 cleanup 후 새 Canvas가 생성될 수 있으므로
      // WebGL 리소스를 완전히 정리하여 다음 마운트에서 새로 초기화하도록 함
      textureManagerRef.current?.dispose();
      quadRendererRef.current?.dispose();

      // 주의: loseContext()를 호출하면 안 됨!
      // loseContext()는 비동기적으로 복구되므로, React Strict Mode의 빠른
      // mount-unmount-mount 사이클에서 두 번째 마운트 시 컨텍스트가 아직 lost 상태일 수 있음.
      // 대신 ref만 정리하고, 새 Canvas에서 새 컨텍스트를 요청하도록 함.

      glRef.current = null;
      textureManagerRef.current = null;
      quadRendererRef.current = null;
      setWebglReady(false);

      // 애니메이션 정리
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 프레임 렌더링 (ref에서 W/L 값을 읽어 최신 값 사용)
  const renderFrame = useCallback(async (frameIndex: number) => {
    const textureManager = textureManagerRef.current;
    const quadRenderer = quadRendererRef.current;
    let gl = glRef.current;
    const currentCanvas = canvasRef.current;

    // Canvas가 변경되었으면 WebGL 재초기화 필요
    // (백업 로직 - cleanup에서 리소스를 정리했으면 이 경우는 발생하지 않아야 함)
    if (gl && currentCanvas && gl.canvas !== currentCanvas) {
      console.warn('[DicomViewport] Canvas mismatch detected, reinitializing WebGL');
      // 기존 리소스 정리
      textureManagerRef.current?.dispose();
      quadRendererRef.current?.dispose();

      // 새 Canvas에 WebGL 컨텍스트 생성
      const newGl = currentCanvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance',
      });

      if (newGl && !newGl.isContextLost()) {
        glRef.current = newGl;
        textureManagerRef.current = new TextureManager(newGl);
        quadRendererRef.current = new QuadRenderer(newGl);
        gl = newGl;
      } else {
        console.error('[DicomViewport] Failed to reinitialize WebGL');
        return;
      }
    }

    if (!frames.length || !imageInfo || !textureManager || !quadRenderer || !gl) {
      return;
    }

    // WebGL 리소스 유효성 확인 (dispose 후 무효화된 경우 대비)
    if (!quadRenderer.isValid()) {
      return;
    }

    if (frameIndex < 0 || frameIndex >= frames.length) {
      return;
    }

    try {
      // 에러 상태 초기화 (성공적인 렌더링 시도 시)
      setRenderError(null);

      const frameData = frames[frameIndex];
      let decodedFrame;
      let shaderWL: WindowLevelOptions | undefined;

      if (isEncapsulated) {
        // JPEG 압축: 디코딩만 하고, W/L은 셰이더에서 적용
        decodedFrame = await decodeJpeg(frameData);

        // W/L 값이 있으면 셰이더에 전달 (0~1 범위로 정규화)
        // JPEG은 8비트 (0-255)로 디코딩되므로 255로 나눔
        if (windowCenterRef.current !== undefined && windowWidthRef.current !== undefined) {
          shaderWL = {
            windowCenter: windowCenterRef.current / 255,
            windowWidth: windowWidthRef.current / 255,
          };
        }
      } else {
        // Native (비압축): CPU에서 W/L 적용
        decodedFrame = await decodeNative(frameData, {
          imageInfo,
          windowCenter: windowCenterRef.current,
          windowWidth: windowWidthRef.current,
        });
      }

      // WebGL 렌더링
      textureManager.upload(decodedFrame.image);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      textureManager.bind(0);
      quadRenderer.render(0, shaderWL);

      closeDecodedFrame(decodedFrame);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Render failed';
      setRenderError(message);
      console.error('Frame render error:', err);
    }
  }, [frames, imageInfo, isEncapsulated]);

  // 초기/복구 프레임 렌더링 (WebGL 준비 완료 후에만 실행)
  // - 첫 데이터 로드 또는 새 시리즈: 프레임 0부터 시작
  // - Context 복구 (동일 시리즈): 현재 프레임 유지하고 렌더링
  useEffect(() => {
    if (webglReady && frames.length > 0 && imageInfo) {
      // 새 시리즈 로드 여부 감지 (frames 또는 imageInfo 변경)
      const isNewSeries = frames !== prevFramesRef.current || imageInfo !== prevImageInfoRef.current;

      // 첫 로드 또는 새 시리즈: 프레임 0부터 시작
      if (!initialRenderDoneRef.current || isNewSeries) {
        renderFrame(0);
        setCurrentFrame(0);
        currentFrameRef.current = 0; // ref도 동기화
        setStatus(`${imageInfo.columns}x${imageInfo.rows}, ${frames.length} 프레임`);
        initialRenderDoneRef.current = true;

        // 이전 값 업데이트
        prevFramesRef.current = frames;
        prevImageInfoRef.current = imageInfo;

        // 안전을 위해 약간의 지연 후 다시 렌더링 (캔버스 레이아웃 완료 보장)
        const timer = setTimeout(() => {
          renderFrame(0);
        }, 50);

        return () => clearTimeout(timer);
      } else {
        // Context 복구: 현재 프레임 유지하고 렌더링
        // currentFrameRef를 사용하여 최신 프레임 값 사용 (stale closure 방지)
        const frameToRender = currentFrameRef.current;
        console.log('[DicomViewport] Context restored, re-rendering frame:', frameToRender);
        renderFrame(frameToRender);

        // 안전을 위해 약간의 지연 후 다시 렌더링
        const timer = setTimeout(() => {
          renderFrame(frameToRender);
        }, 50);

        return () => clearTimeout(timer);
      }
    }
  }, [webglReady, frames, imageInfo, renderFrame]);

  // DPR 변경 시 현재 프레임 다시 렌더링 (모니터 이동 시)
  useEffect(() => {
    if (webglReady && frames.length > 0) {
      renderFrame(currentFrame);
    }
  }, [dpr]); // eslint-disable-line react-hooks/exhaustive-deps

  // 프레임 변경 핸들러
  const handleFrameChange = useCallback((newFrame: number) => {
    setCurrentFrame(newFrame);
    renderFrame(newFrame);
  }, [renderFrame]);

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
          renderFrame(nextFrame);
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
  }, [webglReady, isPlaying, totalFrames, fps, renderFrame]);

  // 재생/정지 토글
  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
    lastFrameTimeRef.current = 0;
  }, []);

  // 외부 제어용 핸들 노출 (useImperativeHandle)
  useImperativeHandle(ref, () => ({
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
      renderFrame(targetFrame);
    },
    getState: () => ({
      isPlaying,
      currentFrame,
      fps,
      totalFrames,
    }),
  }), [isPlaying, currentFrame, fps, totalFrames, renderFrame]);

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

  // 전체 리셋 (W/L + Pan + Zoom)
  const resetViewport = useCallback(() => {
    // W/L 리셋
    windowCenterRef.current = undefined;
    windowWidthRef.current = undefined;
    setWindowCenter(undefined);
    setWindowWidth(undefined);
    // Pan/Zoom 리셋
    setPan({ x: 0, y: 0 });
    setZoom(1.0);
    renderFrame(currentFrame);
  }, [currentFrame, renderFrame]);

  // Context Loss 테스트 (개발용)
  const testContextLoss = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.warn('[DicomViewport] Canvas not available');
      return;
    }

    const gl = canvas.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (ext) {
      console.log('🔴 [DicomViewport] Triggering context loss... (current frame:', currentFrameRef.current, ')');
      ext.loseContext();
      setTimeout(() => {
        console.log('🟢 [DicomViewport] Restoring context...');
        ext.restoreContext();
      }, 2000);
    } else {
      console.warn('[DicomViewport] WEBGL_lose_context extension not available');
    }
  }, []);

  // 우클릭 메뉴 방지 (Tool System이 우클릭 사용)
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // 키보드 이벤트 핸들러
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case ' ': // Space: 재생/정지
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft': // 이전 프레임
        e.preventDefault();
        prevFrame();
        break;
      case 'ArrowRight': // 다음 프레임
        e.preventDefault();
        nextFrame();
        break;
      case 'ArrowUp': // FPS 증가
        e.preventDefault();
        setFps((prev) => Math.min(60, prev + 5));
        break;
      case 'ArrowDown': // FPS 감소
        e.preventDefault();
        setFps((prev) => Math.max(1, prev - 5));
        break;
      case 'r': // 전체 리셋 (W/L + Pan + Zoom)
      case 'R':
        e.preventDefault();
        resetViewport();
        break;
    }
  }, [togglePlay, prevFrame, nextFrame, resetViewport]);

  // 로딩/에러 상태에서도 캔버스 컨테이너는 항상 렌더링 (Tool System 이벤트 리스너 유지)
  // 조건부 렌더링하면 DOM 요소가 재생성되어 이벤트 리스너가 끊어짐
  const showLoadingOverlay = isLoading;
  const showErrorOverlay = !isLoading && loadError;

  return (
    <div
      ref={containerRef}
      style={{
        outline: 'none',
        // 반응형 모드일 때 부모 요소 채우기
        ...(responsive && {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }),
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* 상태 표시 */}
      <div style={{
        padding: '8px 12px',
        marginBottom: '10px',
        background: '#2a2a2a',
        color: '#fff',
        borderRadius: '4px',
        fontSize: '13px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
      }}>
        <span>{status}</span>
        <span style={{ color: '#8f8', fontSize: '11px' }}>
          DPR: {dpr} | Canvas: {Math.floor(width * dpr)}x{Math.floor(height * dpr)}
        </span>
        {windowCenter !== undefined && windowWidth !== undefined && (
          <span style={{ color: '#8cf' }}>
            W/L: {Math.round(windowWidth)} / {Math.round(windowCenter)}
          </span>
        )}
        {(zoom !== 1.0 || pan.x !== 0 || pan.y !== 0) && (
          <span style={{ color: '#cf8' }}>
            Zoom: {zoom.toFixed(1)}x | Pan: ({Math.round(pan.x)}, {Math.round(pan.y)})
          </span>
        )}
      </div>

      {/* 캔버스 컨테이너 (Tool System + 렌더 에러 오버레이 포함) */}
      <div
        ref={canvasContainerRef}
        style={{
          position: 'relative',
          width,
          height,
          marginBottom: '10px',
          overflow: 'hidden', // Pan/Zoom 시 캔버스가 컨테이너를 벗어나지 않도록
          // 반응형 모드일 때 남은 공간 채우기
          ...(responsive && {
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }),
        }}
        onContextMenu={handleContextMenu}
      >
        <canvas
          ref={canvasRef}
          // 드로잉 버퍼 크기: DPR 배율 적용 (Retina에서 선명한 렌더링)
          width={Math.floor(width * dpr)}
          height={Math.floor(height * dpr)}
          style={{
            border: '1px solid #444',
            background: '#000',
            display: 'block',
            // CSS 크기: 원래 크기 유지 (화면 표시 크기)
            width: `${width}px`,
            height: `${height}px`,
            // Pan/Zoom 적용 (CSS Transform)
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            cursor: 'crosshair',
          }}
        />

        {/* 렌더링 에러 오버레이 */}
        {renderError && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(40, 20, 20, 0.9)',
            color: '#f88',
            fontSize: '14px',
            padding: '20px',
            textAlign: 'center',
            gap: '12px',
          }}>
            <div style={{ fontWeight: 'bold' }}>Render Error</div>
            <div style={{ color: '#faa', fontSize: '12px' }}>{renderError}</div>
            <button
              onClick={() => renderFrame(currentFrame)}
              style={{
                padding: '8px 16px',
                background: '#c44',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* 로딩 오버레이 - 캔버스 컨테이너 위에 표시하여 DOM 요소 유지 */}
        {showLoadingOverlay && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(26, 26, 46, 0.95)',
            color: '#8cf',
            fontSize: '14px',
            zIndex: 10,
          }}>
            Loading DICOM data...
          </div>
        )}

        {/* 에러 오버레이 - 캔버스 컨테이너 위에 표시하여 DOM 요소 유지 */}
        {showErrorOverlay && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(42, 26, 26, 0.95)',
            color: '#f88',
            fontSize: '14px',
            padding: '20px',
            textAlign: 'center',
            zIndex: 10,
          }}>
            Error: {loadError?.message}
          </div>
        )}
      </div>

      {/* 프레임 컨트롤 */}
      {totalFrames > 1 && (
        <div style={{
          padding: '12px',
          background: '#1a1a2e',
          borderRadius: '4px',
          color: '#fff',
        }}>
          {/* 프레임 슬라이더 */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}>
              프레임: {currentFrame + 1} / {totalFrames}
            </label>
            <input
              type="range"
              min={0}
              max={totalFrames - 1}
              value={currentFrame}
              onChange={(e) => handleFrameChange(Number(e.target.value))}
              disabled={isPlaying}
              style={{ width: '100%', cursor: isPlaying ? 'not-allowed' : 'pointer' }}
            />
          </div>

          {/* 재생 컨트롤 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={prevFrame}
              disabled={isPlaying}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                cursor: isPlaying ? 'not-allowed' : 'pointer',
              }}
            >
              ◀
            </button>

            <button
              onClick={togglePlay}
              style={{
                padding: '6px 16px',
                fontSize: '14px',
                background: isPlaying ? '#c44' : '#4c4',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                minWidth: '70px',
              }}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            <button
              onClick={nextFrame}
              disabled={isPlaying}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                cursor: isPlaying ? 'not-allowed' : 'pointer',
              }}
            >
              ▶
            </button>

            {/* FPS 조절 */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
              <label>FPS:</label>
              <input
                type="number"
                min={1}
                max={60}
                value={fps}
                onChange={(e) => setFps(Math.max(1, Math.min(60, Number(e.target.value))))}
                style={{ width: '45px', padding: '3px' }}
              />
              <input
                type="range"
                min={1}
                max={60}
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                style={{ width: '80px' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 도구 설명 - 항상 표시, 정지/동영상 모드에 따라 다르게 표시 */}
      <div style={{
        marginTop: '12px',
        padding: '10px',
        background: '#1a1a2e',
        borderRadius: '4px',
        fontSize: '12px',
        color: '#aaa',
      }}>
        <div style={{ marginBottom: '8px', color: '#8cf', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          🖱️ 마우스 도구
          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '3px',
            background: isStaticImage ? '#2a4a2a' : '#2a2a4a',
            color: isStaticImage ? '#8f8' : '#88f',
          }}>
            {isStaticImage ? '정지 이미지' : '동영상'}
          </span>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '6px 16px',
        }}>
          <div><span style={{ color: '#fff' }}>우클릭 드래그</span> → Window/Level (밝기/대비)</div>
          <div><span style={{ color: '#fff' }}>중클릭 드래그</span> → Pan (이미지 이동)</div>
          <div><span style={{ color: '#fff' }}>Shift + 좌클릭</span> → Zoom (확대/축소)</div>
          {/* 휠 동작: 정지 이미지=줌, 동영상=프레임 전환 */}
          <div>
            <span style={{ color: '#fff' }}>휠 스크롤</span> →{' '}
            {isStaticImage ? (
              <span style={{ color: '#cf8' }}>Zoom (확대/축소)</span>
            ) : (
              <span>프레임 전환</span>
            )}
          </div>
        </div>
        {/* 키보드 단축키 - 동영상 모드에서만 표시 */}
        {!isStaticImage && (
          <>
            <div style={{ marginTop: '10px', marginBottom: '6px', color: '#cf8', fontWeight: 'bold' }}>
              ⌨️ 키보드 단축키
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
              <span><span style={{ color: '#fff' }}>Space</span> 재생/정지</span>
              <span><span style={{ color: '#fff' }}>← →</span> 프레임 이동</span>
              <span><span style={{ color: '#fff' }}>↑ ↓</span> FPS 조절</span>
              <span><span style={{ color: '#fff' }}>R</span> 전체 리셋</span>
            </div>
          </>
        )}
        {/* 정지 이미지 모드 - R 키 설명만 표시 */}
        {isStaticImage && (
          <>
            <div style={{ marginTop: '10px', marginBottom: '6px', color: '#cf8', fontWeight: 'bold' }}>
              ⌨️ 키보드 단축키
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
              <span><span style={{ color: '#fff' }}>R</span> 전체 리셋</span>
            </div>
          </>
        )}

        {/* Context Loss 테스트 버튼 (개발용) */}
        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #333' }}>
          <button
            onClick={testContextLoss}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              background: '#c44',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            🧪 Test Context Loss (2초 후 복구)
          </button>
          <span style={{ marginLeft: '10px', fontSize: '11px', color: '#888' }}>
            현재 프레임이 유지되는지 확인
          </span>
        </div>
      </div>
    </div>
  );
});
