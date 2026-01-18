import { useEffect, useRef, useState, useCallback } from 'react';
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
  /** 캔버스 너비 */
  width?: number;
  /** 캔버스 높이 */
  height?: number;
  /** 로딩 상태 콜백 */
  onLoadingChange?: (loading: boolean) => void;
  /** 메타데이터 로드 완료 콜백 */
  onMetadataLoaded?: (metadata: DicomMetadata) => void;
  /** 에러 콜백 */
  onError?: (error: Error) => void;
}

export function DicomViewport({
  frames: propFrames,
  imageInfo: propImageInfo,
  isEncapsulated: propIsEncapsulated,
  dataSource,
  instanceId,
  width = 512,
  height = 512,
  onLoadingChange,
  onMetadataLoaded,
  onError,
}: DicomViewportProps) {
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

  const totalFrames = frames.length;

  // DataSource에서 데이터 로드
  useEffect(() => {
    if (!dataSource || !instanceId) {
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      setIsLoading(true);
      setLoadError(null);
      onLoadingChange?.(true);

      try {
        console.log('[DicomViewport] Loading from DataSource:', instanceId);
        const { metadata, frames: loadedData } = await dataSource.loadAllFrames(instanceId);

        if (cancelled) return;

        // 디버깅: 메타데이터와 프레임 정보 출력
        console.log('[DicomViewport] Metadata:', metadata);
        console.log('[DicomViewport] Frame count:', loadedData.length);
        if (loadedData.length > 0) {
          console.log('[DicomViewport] First frame size:', loadedData[0].length, 'bytes');
          console.log('[DicomViewport] First frame header (first 20 bytes):',
            Array.from(loadedData[0].slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        }

        setLoadedFrames(loadedData);
        setLoadedImageInfo(metadata.imageInfo);
        setLoadedIsEncapsulated(metadata.isEncapsulated);

        // 메타데이터 콜백 호출
        onMetadataLoaded?.(metadata);

        console.log(`[DicomViewport] Loaded ${loadedData.length} frames, isEncapsulated: ${metadata.isEncapsulated}`);
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
  }, [dataSource, instanceId]); // 콜백은 의도적으로 제외 (무한 루프 방지)

  // WebGL 초기화 및 이벤트 리스너
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // WebGL 리소스 초기화 여부 (ResizeObserver와 공유)
    let webglInitialized = false;

    // WebGL 초기화 함수 (로컬)
    const initializeWebGL = () => {
      console.log('[DicomViewport] Initializing WebGL...', {
        canvasId: canvas.id || '(no id)',
        hasExistingGl: !!glRef.current,
      });

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
          console.log('[DicomViewport] Context is lost, waiting for restore event...');
          return false;
        }

        glRef.current = gl;
        textureManagerRef.current = new TextureManager(gl);
        quadRendererRef.current = new QuadRenderer(gl);

        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        console.log('[DicomViewport] WebGL initialized successfully on canvas:', {
          canvasInDOM: document.body.contains(canvas),
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
        });
        return true;
      } catch (err) {
        console.error('WebGL initialization error:', err);
        return false;
      }
    };

    // Context lost 이벤트 핸들러
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.log('[DicomViewport] WebGL context lost');
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
      console.log('[DicomViewport] WebGL context restored');
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
    // 이것이 핵심! Canvas가 DOM에 추가되어도 레이아웃 전에는 clientWidth가 0
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        console.log('[DicomViewport] ResizeObserver:', { width, height, webglInitialized });

        // Canvas가 실제 크기를 가지고 WebGL이 초기화되었으면 ready
        if (width > 0 && height > 0 && webglInitialized) {
          console.log('[DicomViewport] Canvas layout complete, setting webglReady=true');
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
        console.log('[DicomViewport] Canvas already has size, setting webglReady=true');
        setWebglReady(true);
      } else {
        console.log('[DicomViewport] Waiting for canvas layout...', {
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
        });
      }
    }

    return () => {
      console.log('[DicomViewport] useEffect cleanup (React Strict Mode may re-mount)');
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
      console.warn('[DicomViewport] Canvas mismatch detected in renderFrame! This should not happen if cleanup worked correctly.');
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
        console.log('[DicomViewport] WebGL reinitialized for new canvas');
      } else {
        console.error('[DicomViewport] Failed to reinitialize WebGL');
        return;
      }
    }

    // 디버깅: refs 상태 확인
    console.log('[DicomViewport] renderFrame called:', {
      frameIndex,
      framesLength: frames.length,
      hasImageInfo: !!imageInfo,
      hasTextureManager: !!textureManager,
      hasQuadRenderer: !!quadRenderer,
      hasGl: !!gl,
      // WebGL 리소스 유효성 확인
      textureManagerHasTexture: textureManager?.hasTexture?.() ?? 'N/A',
      quadRendererValid: quadRenderer?.isValid?.() ?? 'N/A',
    });

    if (!frames.length || !imageInfo || !textureManager || !quadRenderer || !gl) {
      console.warn('[DicomViewport] renderFrame early return - missing refs');
      return;
    }

    // WebGL 리소스 유효성 확인 (dispose 후 무효화된 경우 대비)
    if (!quadRenderer.isValid()) {
      console.warn('[DicomViewport] renderFrame early return - WebGL resources disposed');
      return;
    }

    if (frameIndex < 0 || frameIndex >= frames.length) {
      return;
    }

    try {
      const frameData = frames[frameIndex];
      console.log('[DicomViewport] Decoding frame:', { frameIndex, frameDataSize: frameData.length, isEncapsulated });

      let decodedFrame;
      let shaderWL: WindowLevelOptions | undefined;

      if (isEncapsulated) {
        // JPEG 압축: 디코딩만 하고, W/L은 셰이더에서 적용
        decodedFrame = await decodeJpeg(frameData);
        console.log('[DicomViewport] JPEG decoded:', { width: decodedFrame.width, height: decodedFrame.height });

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

      // ============ 상세 WebGL 디버깅 ============
      // 0. Canvas 참조 일치 확인 (핵심 디버깅!)
      const glCanvas = gl.canvas as HTMLCanvasElement;
      const refCanvas = canvasRef.current;
      const isSameCanvas = glCanvas === refCanvas;
      console.log('[WebGL DEBUG] Canvas reference check:', {
        isSameCanvas,
        glCanvasInDOM: document.body.contains(glCanvas),
        refCanvasInDOM: refCanvas ? document.body.contains(refCanvas) : 'null',
        glCanvasClientWidth: glCanvas.clientWidth,
        refCanvasClientWidth: refCanvas?.clientWidth ?? 'null',
      });

      // 1. 렌더링 전 에러 체크
      let glError = gl.getError();
      if (glError !== gl.NO_ERROR) {
        console.error('[WebGL DEBUG] Pre-render error:', glError);
      }

      // 2. Canvas 및 DrawingBuffer 크기 확인
      const canvas = glCanvas;
      console.log('[WebGL DEBUG] Canvas state:', {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        drawingBufferWidth: gl.drawingBufferWidth,
        drawingBufferHeight: gl.drawingBufferHeight,
        isCanvasInDOM: document.body.contains(canvas),
        canvasOffsetParent: canvas.offsetParent?.tagName || 'null',
      });

      // 3. ImageBitmap/VideoFrame 상태 확인
      const img = decodedFrame.image;
      console.log('[WebGL DEBUG] Image source:', {
        type: img.constructor.name,
        width: 'width' in img ? img.width : 'N/A',
        height: 'height' in img ? img.height : 'N/A',
        // ImageBitmap은 close되면 width/height가 0이 됨
      });

      // 4. 텍스처 업로드
      console.log('[DicomViewport] Uploading texture...');
      textureManager.upload(decodedFrame.image);

      glError = gl.getError();
      if (glError !== gl.NO_ERROR) {
        console.error('[WebGL DEBUG] After texture upload error:', glError, 'Error code meaning:', {
          [gl.INVALID_ENUM]: 'INVALID_ENUM',
          [gl.INVALID_VALUE]: 'INVALID_VALUE',
          [gl.INVALID_OPERATION]: 'INVALID_OPERATION',
          [gl.INVALID_FRAMEBUFFER_OPERATION]: 'INVALID_FRAMEBUFFER_OPERATION',
          [gl.OUT_OF_MEMORY]: 'OUT_OF_MEMORY',
        }[glError] || 'UNKNOWN');
      }

      // 5. Viewport 설정 (drawingBufferWidth/Height 사용)
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      console.log('[WebGL DEBUG] Viewport set to:', {
        x: 0, y: 0,
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight
      });

      // 6. 텍스처 바인딩
      textureManager.bind(0);

      // 7. 렌더링
      console.log('[DicomViewport] Rendering with shaderWL:', shaderWL);
      quadRenderer.render(0, shaderWL);

      // 8. 렌더링 후 에러 체크
      glError = gl.getError();
      if (glError !== gl.NO_ERROR) {
        console.error('[WebGL DEBUG] After render error:', glError);
      }

      // 9. Framebuffer 상태 확인
      const fbStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      console.log('[WebGL DEBUG] Framebuffer status:', {
        status: fbStatus,
        isComplete: fbStatus === gl.FRAMEBUFFER_COMPLETE,
      });

      // 10. 픽셀 읽기 테스트 (중앙 픽셀)
      const pixels = new Uint8Array(4);
      gl.readPixels(
        Math.floor(gl.drawingBufferWidth / 2),
        Math.floor(gl.drawingBufferHeight / 2),
        1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels
      );
      console.log('[WebGL DEBUG] Center pixel RGBA:', {
        r: pixels[0], g: pixels[1], b: pixels[2], a: pixels[3],
        isBlack: pixels[0] === 0 && pixels[1] === 0 && pixels[2] === 0,
      });

      console.log('[DicomViewport] Render complete');
      // ============ 디버깅 끝 ============

      closeDecodedFrame(decodedFrame);
    } catch (err) {
      console.error('Frame render error:', err);
    }
  }, [frames, imageInfo, isEncapsulated]);

  // 초기 프레임 렌더링 (WebGL 준비 완료 후에만 실행)
  useEffect(() => {
    console.log('[DicomViewport] Initial render check:', {
      webglReady,
      framesLength: frames.length,
      hasImageInfo: !!imageInfo,
    });

    if (webglReady && frames.length > 0 && imageInfo) {
      console.log('[DicomViewport] Starting initial render');
      renderFrame(0);
      setCurrentFrame(0);
      setStatus(`${imageInfo.columns}x${imageInfo.rows}, ${frames.length} 프레임`);
    }
  }, [webglReady, frames, imageInfo, renderFrame]);

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
        width,
        height,
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
        width,
        height,
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
      style={{ outline: 'none' }}
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
      }}>
        <span>{status}</span>
        {windowCenter !== undefined && windowWidth !== undefined && (
          <span style={{ color: '#8cf' }}>
            W/L: {Math.round(windowWidth)} / {Math.round(windowCenter)}
          </span>
        )}
      </div>

      {/* 캔버스 */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          border: '1px solid #444',
          background: '#000',
          display: 'block',
          marginBottom: '10px',
          cursor: isDraggingRef.current ? 'crosshair' : 'default',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
      />

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
}
