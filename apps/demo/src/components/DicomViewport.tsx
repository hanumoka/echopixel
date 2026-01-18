import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  decodeJpeg,
  decodeNative,
  closeDecodedFrame,
  TextureManager,
  QuadRenderer,
  type DicomImageInfo,
  type WindowLevelOptions,
  type DataSource,
  type DicomInstanceId,
  type DicomMetadata,
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

  // Window/Level 드래그 관련
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // W/L 값을 ref로도 관리 (렌더링 함수에서 최신 값 사용)
  const windowCenterRef = useRef<number | undefined>(undefined);
  const windowWidthRef = useRef<number | undefined>(undefined);

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
  const [windowCenter, setWindowCenter] = useState<number | undefined>(undefined);
  const [windowWidth, setWindowWidth] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState('');
  const [webglReady, setWebglReady] = useState(false); // WebGL 준비 상태
  const [renderError, setRenderError] = useState<string | null>(null); // 렌더링 에러 상태
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, 2)); // DPI 배율 (최대 2로 제한)

  // 반응형 모드를 위한 계산된 크기
  const [computedSize, setComputedSize] = useState({ width: propWidth, height: propHeight });

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

  // 초기 프레임 렌더링 (WebGL 준비 완료 후에만 실행)
  // 로드 완료 후 첫 프레임을 확실히 표시하기 위해 약간의 지연 추가
  useEffect(() => {
    if (webglReady && frames.length > 0 && imageInfo) {
      // 첫 프레임 렌더링 (즉시 + 지연 후 한번 더)
      // 지연 렌더링은 캔버스가 완전히 준비되지 않았을 경우를 대비
      renderFrame(0);
      setCurrentFrame(0);
      setStatus(`${imageInfo.columns}x${imageInfo.rows}, ${frames.length} 프레임`);

      // 안전을 위해 약간의 지연 후 다시 렌더링 (캔버스 레이아웃 완료 보장)
      const timer = setTimeout(() => {
        renderFrame(0);
      }, 50);

      return () => clearTimeout(timer);
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

  // Window/Level 리셋
  const resetWindowLevel = useCallback(() => {
    windowCenterRef.current = undefined;
    windowWidthRef.current = undefined;
    setWindowCenter(undefined);
    setWindowWidth(undefined);
    renderFrame(currentFrame);
  }, [currentFrame, renderFrame]);

  // 마우스 이벤트 핸들러 (Window/Level 조정)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 우클릭 또는 Ctrl+클릭으로 Window/Level 조정
    if (e.button === 2 || e.ctrlKey) {
      e.preventDefault();
      isDraggingRef.current = true;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current || !imageInfo) return;

    const deltaX = e.clientX - lastMousePosRef.current.x;
    const deltaY = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    // 현재 Window/Level 값 (없으면 기본값 계산)
    // JPEG (Encapsulated)는 8비트 기준, Native는 원본 bitsStored 기준
    const defaultBits = isEncapsulated ? 8 : (imageInfo.bitsStored ?? 8);
    const currentWC = windowCenterRef.current ?? Math.pow(2, defaultBits - 1);
    const currentWW = windowWidthRef.current ?? Math.pow(2, defaultBits);

    // 드래그 감도 (이미지 크기에 비례)
    const sensitivity = Math.max(1, currentWW / 256);

    // 수평 드래그: Window Width 조정
    // 수직 드래그: Window Center 조정
    const newWW = Math.max(1, currentWW + deltaX * sensitivity);
    const newWC = currentWC - deltaY * sensitivity;

    // ref 먼저 업데이트 (renderFrame에서 사용)
    windowWidthRef.current = newWW;
    windowCenterRef.current = newWC;

    // 상태 업데이트 (UI 표시용)
    setWindowWidth(newWW);
    setWindowCenter(newWC);

    // 즉시 재렌더링
    renderFrame(currentFrame);
  }, [imageInfo, currentFrame, renderFrame, isEncapsulated]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // 우클릭 메뉴 방지
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
      case 'r': // Window/Level 리셋
      case 'R':
        e.preventDefault();
        resetWindowLevel();
        break;
    }
  }, [togglePlay, prevFrame, nextFrame, resetWindowLevel]);

  // 로딩 상태 UI
  if (isLoading) {
    return (
      <div style={{
        // 반응형 모드면 부모 채우기, 아니면 고정 크기
        ...(responsive ? { width: '100%', height: '100%' } : { width, height }),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1a2e',
        border: '1px solid #444',
        borderRadius: '4px',
        color: '#8cf',
        fontSize: '14px',
      }}>
        Loading DICOM data...
      </div>
    );
  }

  // 에러 상태 UI
  if (loadError) {
    return (
      <div style={{
        // 반응형 모드면 부모 채우기, 아니면 고정 크기
        ...(responsive ? { width: '100%', height: '100%' } : { width, height }),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#2a1a1a',
        border: '1px solid #a44',
        borderRadius: '4px',
        color: '#f88',
        fontSize: '14px',
        padding: '20px',
        textAlign: 'center',
      }}>
        Error: {loadError.message}
      </div>
    );
  }

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
      </div>

      {/* 캔버스 컨테이너 (렌더 에러 오버레이 포함) */}
      <div style={{
        position: 'relative',
        width,
        height,
        marginBottom: '10px',
        // 반응형 모드일 때 남은 공간 채우기
        ...(responsive && {
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }),
      }}>
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
            cursor: isDraggingRef.current ? 'crosshair' : 'default',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu}
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

          {/* 도움말 */}
          <div style={{ marginTop: '10px', fontSize: '11px', color: '#888' }}>
            Space: 재생/정지 | ← →: 프레임 이동 | ↑ ↓: FPS 조절 | 우클릭 드래그: W/L 조정 | R: W/L 리셋
          </div>
        </div>
      )}
    </div>
  );
});
