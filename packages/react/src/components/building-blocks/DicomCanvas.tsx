import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  TextureManager,
  QuadRenderer,
  decodeJpeg,
  decodeNative,
  closeDecodedFrame,
  type DicomImageInfo,
  type WindowLevelOptions,
} from '@echopixel/core';

/**
 * DicomCanvas 외부 제어용 핸들
 */
export interface DicomCanvasHandle {
  /** 특정 프레임 렌더링 */
  renderFrame: (frameIndex: number) => Promise<void>;
  /** WebGL 준비 상태 */
  isReady: () => boolean;
  /** Canvas 요소 참조 */
  getCanvas: () => HTMLCanvasElement | null;
  /** WebGL Context Loss 테스트 (개발용) */
  testContextLoss: () => void;
}

/**
 * DicomCanvas Props
 */
export interface DicomCanvasProps {
  /** 프레임 데이터 배열 */
  frames: Uint8Array[];
  /** 이미지 정보 */
  imageInfo: DicomImageInfo;
  /** 압축 여부 (JPEG 등) */
  isEncapsulated: boolean;
  /** CSS 너비 (픽셀) */
  width?: number;
  /** CSS 높이 (픽셀) */
  height?: number;
  /** Window Center (밝기) */
  windowCenter?: number;
  /** Window Width (대비) */
  windowWidth?: number;
  /** Pan offset */
  pan?: { x: number; y: number };
  /** Zoom level */
  zoom?: number;
  /** Rotation angle (degrees) */
  rotation?: number;
  /** WebGL 준비 완료 콜백 */
  onReady?: () => void;
  /** 렌더링 에러 콜백 */
  onError?: (error: Error) => void;
  /** Context Lost 콜백 */
  onContextLost?: () => void;
  /** Context Restored 콜백 */
  onContextRestored?: () => void;
  /** 커스텀 스타일 */
  style?: React.CSSProperties;
  /** 커스텀 클래스명 */
  className?: string;
}

/**
 * DicomCanvas
 *
 * WebGL2 기반 DICOM 프레임 렌더링 컴포넌트
 * - TextureManager로 텍스처 관리
 * - QuadRenderer로 쿼드 렌더링
 * - Context Loss/Restore 자동 처리
 * - DPR 대응 (Retina 디스플레이)
 *
 * @example
 * ```tsx
 * const canvasRef = useRef<DicomCanvasHandle>(null);
 *
 * // 프레임 렌더링
 * canvasRef.current?.renderFrame(0);
 *
 * <DicomCanvas
 *   ref={canvasRef}
 *   frames={frames}
 *   imageInfo={imageInfo}
 *   isEncapsulated={true}
 *   width={512}
 *   height={512}
 *   windowCenter={128}
 *   windowWidth={256}
 *   onReady={() => console.log('WebGL ready')}
 * />
 * ```
 */
export const DicomCanvas = forwardRef<DicomCanvasHandle, DicomCanvasProps>(
  function DicomCanvas(
    {
      frames,
      imageInfo,
      isEncapsulated,
      width = 512,
      height = 512,
      windowCenter,
      windowWidth,
      pan = { x: 0, y: 0 },
      zoom = 1,
      rotation = 0,
      onReady,
      onError,
      onContextLost,
      onContextRestored,
      style,
      className,
    },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glRef = useRef<WebGL2RenderingContext | null>(null);
    const textureManagerRef = useRef<TextureManager | null>(null);
    const quadRendererRef = useRef<QuadRenderer | null>(null);

    const [webglReady, setWebglReady] = useState(false);
    const [dpr, setDpr] = useState(() =>
      Math.min(window.devicePixelRatio || 1, 2)
    );

    // W/L 값을 ref로 관리 (렌더링 함수에서 최신 값 사용)
    const windowCenterRef = useRef<number | undefined>(windowCenter);
    const windowWidthRef = useRef<number | undefined>(windowWidth);

    // Props 변경 시 ref 동기화
    useEffect(() => {
      windowCenterRef.current = windowCenter;
      windowWidthRef.current = windowWidth;
    }, [windowCenter, windowWidth]);

    // DPR 변경 감지
    useEffect(() => {
      const updateDpr = () => {
        const newDpr = Math.min(window.devicePixelRatio || 1, 2);
        setDpr(newDpr);
      };

      const mediaQuery = window.matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`
      );
      mediaQuery.addEventListener('change', updateDpr);

      return () => {
        mediaQuery.removeEventListener('change', updateDpr);
      };
    }, []);

    // WebGL 초기화
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      let webglInitialized = false;

      const initializeWebGL = () => {
        try {
          const gl = canvas.getContext('webgl2', {
            alpha: false,
            antialias: false,
            powerPreference: 'high-performance',
          });

          if (!gl) {
            throw new Error('WebGL2 is not supported');
          }

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
          console.error('[DicomCanvas] WebGL initialization error:', err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
          return false;
        }
      };

      const handleContextLost = (event: Event) => {
        event.preventDefault();
        setWebglReady(false);
        webglInitialized = false;

        textureManagerRef.current?.dispose();
        quadRendererRef.current?.dispose();
        glRef.current = null;
        textureManagerRef.current = null;
        quadRendererRef.current = null;

        onContextLost?.();
      };

      const handleContextRestored = () => {
        if (initializeWebGL()) {
          webglInitialized = true;
          if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
            setWebglReady(true);
            onContextRestored?.();
          }
        }
      };

      canvas.addEventListener('webglcontextlost', handleContextLost);
      canvas.addEventListener('webglcontextrestored', handleContextRestored);

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0 && webglInitialized) {
            setWebglReady(true);
          }
        }
      });

      resizeObserver.observe(canvas);

      if (initializeWebGL()) {
        webglInitialized = true;
        if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
          setWebglReady(true);
        }
      }

      return () => {
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        canvas.removeEventListener('webglcontextrestored', handleContextRestored);
        resizeObserver.disconnect();

        textureManagerRef.current?.dispose();
        quadRendererRef.current?.dispose();

        glRef.current = null;
        textureManagerRef.current = null;
        quadRendererRef.current = null;
        setWebglReady(false);
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // WebGL 준비 완료 시 콜백
    useEffect(() => {
      if (webglReady) {
        onReady?.();
      }
    }, [webglReady, onReady]);

    // 프레임 렌더링 함수
    const renderFrame = useCallback(
      async (frameIndex: number) => {
        const textureManager = textureManagerRef.current;
        const quadRenderer = quadRendererRef.current;
        const gl = glRef.current;

        if (!frames.length || !imageInfo || !textureManager || !quadRenderer || !gl) {
          return;
        }

        if (!quadRenderer.isValid()) {
          return;
        }

        if (frameIndex < 0 || frameIndex >= frames.length) {
          return;
        }

        try {
          const frameData = frames[frameIndex];
          let decodedFrame;
          let shaderWL: WindowLevelOptions | undefined;

          if (isEncapsulated) {
            decodedFrame = await decodeJpeg(frameData);

            if (
              windowCenterRef.current !== undefined &&
              windowWidthRef.current !== undefined
            ) {
              shaderWL = {
                windowCenter: windowCenterRef.current / 255,
                windowWidth: windowWidthRef.current / 255,
              };
            }
          } else {
            decodedFrame = await decodeNative(frameData, {
              imageInfo,
              windowCenter: windowCenterRef.current,
              windowWidth: windowWidthRef.current,
            });
          }

          textureManager.upload(decodedFrame.image);
          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
          textureManager.bind(0);
          quadRenderer.render(0, shaderWL);

          closeDecodedFrame(decodedFrame);
        } catch (err) {
          console.error('[DicomCanvas] Frame render error:', err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      },
      [frames, imageInfo, isEncapsulated, onError]
    );

    // Context Loss 테스트
    const testContextLoss = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const gl = canvas.getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_lose_context');
      if (ext) {
        console.log('[DicomCanvas] Triggering context loss...');
        ext.loseContext();
        setTimeout(() => {
          console.log('[DicomCanvas] Restoring context...');
          ext.restoreContext();
        }, 2000);
      }
    }, []);

    // 외부 제어 핸들 노출
    useImperativeHandle(
      ref,
      () => ({
        renderFrame,
        isReady: () => webglReady,
        getCanvas: () => canvasRef.current,
        testContextLoss,
      }),
      [renderFrame, webglReady, testContextLoss]
    );

    // 우클릭 메뉴 방지
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
    }, []);

    return (
      <canvas
        ref={canvasRef}
        className={className}
        width={Math.floor(width * dpr)}
        height={Math.floor(height * dpr)}
        onContextMenu={handleContextMenu}
        style={{
          display: 'block',
          width: `${width}px`,
          height: `${height}px`,
          background: '#000',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
          transformOrigin: 'center center',
          cursor: 'crosshair',
          ...style,
        }}
      />
    );
  }
);
