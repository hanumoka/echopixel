import { useEffect, useRef, useState, useCallback } from 'react';
import {
  decodeJpeg,
  decodeNative,
  closeDecodedFrame,
  TextureManager,
  QuadRenderer,
  type DicomImageInfo,
  type WindowLevelOptions,
} from '@echopixel/core';

export interface DicomViewportProps {
  /** 프레임 데이터 배열 */
  frames: Uint8Array[];
  /** 이미지 정보 */
  imageInfo: DicomImageInfo;
  /** 압축 여부 */
  isEncapsulated: boolean;
  /** 캔버스 너비 */
  width?: number;
  /** 캔버스 높이 */
  height?: number;
}

export function DicomViewport({
  frames,
  imageInfo,
  isEncapsulated,
  width = 512,
  height = 512,
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

  // 상태
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(30);
  const [windowCenter, setWindowCenter] = useState<number | undefined>(undefined);
  const [windowWidth, setWindowWidth] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState('');


  const totalFrames = frames.length;

  // WebGL 초기화
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance',
      });

      if (!gl) {
        throw new Error('WebGL2 is not supported');
      }

      glRef.current = gl;
      textureManagerRef.current = new TextureManager(gl);
      quadRendererRef.current = new QuadRenderer(gl);

      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    } catch (err) {
      console.error('WebGL initialization error:', err);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      textureManagerRef.current?.dispose();
      quadRendererRef.current?.dispose();
    };
  }, []);

  // 프레임 렌더링 (ref에서 W/L 값을 읽어 최신 값 사용)
  const renderFrame = useCallback(async (frameIndex: number) => {
    const textureManager = textureManagerRef.current;
    const quadRenderer = quadRendererRef.current;
    const gl = glRef.current;

    if (!frames.length || !textureManager || !quadRenderer || !gl) {
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

      textureManager.upload(decodedFrame.image);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      textureManager.bind(0);
      quadRenderer.render(0, shaderWL);

      closeDecodedFrame(decodedFrame);
    } catch (err) {
      console.error('Frame render error:', err);
    }
  }, [frames, imageInfo, isEncapsulated]);

  // 초기 프레임 렌더링
  useEffect(() => {
    if (frames.length > 0) {
      renderFrame(0);
      setCurrentFrame(0);
      setStatus(`${imageInfo.columns}x${imageInfo.rows}, ${frames.length} 프레임`);
    }
  }, [frames, imageInfo, renderFrame]);

  // 프레임 변경 핸들러
  const handleFrameChange = useCallback((newFrame: number) => {
    setCurrentFrame(newFrame);
    renderFrame(newFrame);
  }, [renderFrame]);

  // Cine 재생 루프
  useEffect(() => {
    if (!isPlaying || totalFrames === 0) {
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
  }, [isPlaying, totalFrames, fps, renderFrame]);

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
    if (!isDraggingRef.current) return;

    const deltaX = e.clientX - lastMousePosRef.current.x;
    const deltaY = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    // 현재 Window/Level 값 (없으면 기본값 계산)
    // JPEG (Encapsulated)는 8비트 기준, Native는 원본 bitsStored 기준
    const defaultBits = isEncapsulated ? 8 : (imageInfo.bitsStored || 8);
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
  }, [imageInfo.bitsStored, currentFrame, renderFrame, isEncapsulated]);

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
