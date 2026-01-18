/**
 * MultiViewport 컴포넌트 (Phase 2d)
 *
 * 학습 포인트:
 * - 단일 Canvas에서 여러 뷰포트 렌더링
 * - ViewportManager로 뷰포트 레이아웃 관리
 * - RenderScheduler로 통합 렌더 루프
 * - FrameSyncEngine으로 프레임 동기화
 *
 * 사용 예시:
 * ```tsx
 * <MultiViewport
 *   layout="grid-2x2"
 *   width={1024}
 *   height={768}
 *   onViewportClick={(id) => console.log('Clicked:', id)}
 * />
 * ```
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ViewportManager,
  RenderScheduler,
  FrameSyncEngine,
  TextureManager,
  ArrayTextureRenderer,
  decodeJpeg,
  decodeNative,
  closeDecodedFrame,
  type LayoutType,
  type Viewport,
  type ViewportSeriesInfo,
  type DicomImageInfo,
  type WindowLevelOptions,
  type SyncMode,
} from '@echopixel/core';

/**
 * 시리즈 데이터 (로드된 DICOM 데이터)
 */
export interface SeriesData {
  /** 시리즈 정보 */
  info: ViewportSeriesInfo;
  /** 프레임 데이터 (Uint8Array 배열) */
  frames: Uint8Array[];
  /** 이미지 정보 */
  imageInfo: DicomImageInfo;
  /** 압축 여부 */
  isEncapsulated: boolean;
}

/**
 * MultiViewport Props
 */
export interface MultiViewportProps {
  /** 레이아웃 타입 */
  layout?: LayoutType;
  /** Canvas 너비 */
  width?: number;
  /** Canvas 높이 */
  height?: number;
  /** 뷰포트 클릭 콜백 */
  onViewportClick?: (viewportId: string) => void;
  /** 동기화 모드 */
  syncMode?: SyncMode;
  /** 시리즈 데이터 맵 (viewportId → SeriesData) */
  seriesMap?: Map<string, SeriesData>;
}

export function MultiViewport({
  layout = 'grid-2x2',
  width = 1024,
  height = 768,
  onViewportClick,
  syncMode = 'frame-ratio',
  seriesMap,
}: MultiViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);

  // 관리자 및 렌더러 refs
  const viewportManagerRef = useRef<ViewportManager | null>(null);
  const renderSchedulerRef = useRef<RenderScheduler | null>(null);
  const syncEngineRef = useRef<FrameSyncEngine | null>(null);
  const textureManagersRef = useRef<Map<string, TextureManager>>(new Map());
  const arrayRendererRef = useRef<ArrayTextureRenderer | null>(null);

  // 상태
  const [viewports, setViewports] = useState<Viewport[]>([]);
  const [activeViewportId, setActiveViewportId] = useState<string | null>(null);
  const [hoveredViewportId, setHoveredViewportId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(30);
  const [stats, setStats] = useState({ fps: 0, frameTime: 0 });

  // DPR
  const [dpr] = useState(() => Math.min(window.devicePixelRatio || 1, 2));

  // WebGL 초기화
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      console.error('WebGL2 not supported');
      return;
    }

    glRef.current = gl;

    // 관리자 초기화
    const viewportManager = new ViewportManager(canvas.width, canvas.height);
    viewportManager.setLayout(layout);
    viewportManagerRef.current = viewportManager;

    const syncEngine = new FrameSyncEngine();
    syncEngineRef.current = syncEngine;

    const renderScheduler = new RenderScheduler(gl, viewportManager, syncEngine);
    renderSchedulerRef.current = renderScheduler;

    // ArrayTextureRenderer 생성
    const arrayRenderer = new ArrayTextureRenderer(gl);
    arrayRendererRef.current = arrayRenderer;

    // 초기 뷰포트 목록 설정
    setViewports(viewportManager.getAllViewports());

    // 렌더링 콜백 설정
    renderScheduler.setRenderCallback((viewportId, frameIndex, bounds) => {
      const viewport = viewportManager.getViewport(viewportId);
      const textureManager = textureManagersRef.current.get(viewportId);

      if (!viewport || !textureManager || !textureManager.hasArrayTexture()) {
        return;
      }

      // Window/Level 옵션 변환
      let wl: WindowLevelOptions | undefined;
      if (viewport.windowLevel && viewport.series) {
        // JPEG (8비트)는 255로 정규화, Native는 bitsStored 기준
        const maxValue = viewport.series.isEncapsulated
          ? 255
          : Math.pow(2, viewport.series.bitsStored ?? 8);
        wl = {
          windowCenter: viewport.windowLevel.center / maxValue,
          windowWidth: viewport.windowLevel.width / maxValue,
        };
      }

      // 텍스처 바인딩 및 렌더링
      textureManager.bindArrayTexture(viewport.textureUnit);
      arrayRenderer.renderFrame(viewport.textureUnit, frameIndex, wl);
    });

    // 프레임 업데이트 콜백 (UI 상태 동기화)
    renderScheduler.setFrameUpdateCallback((viewportId, frameIndex) => {
      // 상태 업데이트 (React 리렌더링 최소화)
      setViewports((prev) =>
        prev.map((v) =>
          v.id === viewportId ? { ...v, playback: { ...v.playback, currentFrame: frameIndex } } : v,
        ),
      );
    });

    // 통계 업데이트 인터벌
    const statsInterval = setInterval(() => {
      if (renderSchedulerRef.current) {
        const s = renderSchedulerRef.current.getStats();
        setStats({ fps: s.fps, frameTime: s.frameTime });
      }
    }, 500);

    // Cleanup
    return () => {
      clearInterval(statsInterval);
      renderScheduler.dispose();
      arrayRenderer.dispose();
      textureManagersRef.current.forEach((tm) => tm.dispose());
      textureManagersRef.current.clear();
    };
  }, [layout]);

  // 시리즈 데이터 로드 및 텍스처 업로드
  useEffect(() => {
    if (!seriesMap || !glRef.current || !viewportManagerRef.current) return;

    const gl = glRef.current;
    const viewportManager = viewportManagerRef.current;
    const viewportIds = viewportManager.getAllViewportIds();

    // 시리즈 데이터를 뷰포트에 할당
    const loadSeries = async () => {
      let index = 0;
      for (const [_key, seriesData] of seriesMap) {
        if (index >= viewportIds.length) break;

        const viewportId = viewportIds[index];
        const viewport = viewportManager.getViewport(viewportId);
        if (!viewport) continue;

        // 뷰포트에 시리즈 정보 설정
        viewportManager.setViewportSeries(viewportId, seriesData.info);

        // TextureManager 생성 (뷰포트별)
        let textureManager = textureManagersRef.current.get(viewportId);
        if (!textureManager) {
          textureManager = new TextureManager(gl);
          textureManagersRef.current.set(viewportId, textureManager);
        }

        // 모든 프레임 디코딩 및 텍스처 업로드
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

            // ImageBitmap으로 변환 (VideoFrame인 경우)
            if (decoded.image instanceof VideoFrame) {
              const bitmap = await createImageBitmap(decoded.image);
              closeDecodedFrame(decoded);
              decodedFrames.push(bitmap);
            } else {
              decodedFrames.push(decoded.image as ImageBitmap);
            }
          }

          // 배열 텍스처에 업로드
          textureManager.uploadAllFrames(decodedFrames);

          // ImageBitmap 정리
          decodedFrames.forEach((bmp) => bmp.close());

          console.log(`[MultiViewport] Uploaded ${decodedFrames.length} frames to viewport ${viewportId}`);
        } catch (err) {
          console.error(`[MultiViewport] Failed to load series for viewport ${viewportId}:`, err);
        }

        index++;
      }

      // 상태 업데이트
      setViewports(viewportManager.getAllViewports());

      // 초기 렌더링
      if (renderSchedulerRef.current) {
        renderSchedulerRef.current.renderSingleFrame();
      }
    };

    loadSeries();
  }, [seriesMap]);

  // 동기화 그룹 설정
  useEffect(() => {
    if (!syncEngineRef.current || !viewportManagerRef.current) return;

    const syncEngine = syncEngineRef.current;
    const viewportIds = viewportManagerRef.current.getAllViewportIds();

    // 기존 그룹 제거
    syncEngine.clearAllGroups();

    // 2개 이상 뷰포트가 있으면 동기화 그룹 생성
    if (viewportIds.length >= 2 && syncMode !== 'manual') {
      const masterId = viewportIds[0];
      const slaveIds = viewportIds.slice(1);

      syncEngine.createSyncGroup({
        masterId,
        slaveIds,
        mode: syncMode,
      });
    }
  }, [viewports.length, syncMode]);

  // 재생/정지 토글
  const togglePlay = useCallback(() => {
    const viewportManager = viewportManagerRef.current;
    const renderScheduler = renderSchedulerRef.current;
    if (!viewportManager || !renderScheduler) return;

    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);

    // 모든 뷰포트의 재생 상태 설정
    for (const id of viewportManager.getAllViewportIds()) {
      viewportManager.setViewportPlaying(id, newIsPlaying);
      viewportManager.setViewportFps(id, fps);
    }

    if (newIsPlaying) {
      renderScheduler.start();
    } else {
      renderScheduler.stop();
    }
  }, [isPlaying, fps]);

  // FPS 변경
  const handleFpsChange = useCallback((newFps: number) => {
    setFps(newFps);
    const viewportManager = viewportManagerRef.current;
    if (!viewportManager) return;

    for (const id of viewportManager.getAllViewportIds()) {
      viewportManager.setViewportFps(id, newFps);
    }
  }, []);

  // Canvas 클릭 핸들러
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const viewportManager = viewportManagerRef.current;
      if (!canvas || !viewportManager) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      // Canvas 좌표 계산 (WebGL 좌표계: 좌하단 원점)
      const canvasX = (e.clientX - rect.left) * scaleX;
      const canvasY = canvas.height - (e.clientY - rect.top) * scaleY;

      // 해당 위치의 뷰포트 찾기
      const viewport = viewportManager.getViewportAtPosition(canvasX, canvasY);
      if (viewport) {
        setActiveViewportId(viewport.id);
        onViewportClick?.(viewport.id);
      }
    },
    [onViewportClick],
  );

  // Canvas 마우스 이동 핸들러 (Hover 감지)
  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const viewportManager = viewportManagerRef.current;
      if (!canvas || !viewportManager) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      // Canvas 좌표 계산 (WebGL 좌표계: 좌하단 원점)
      const canvasX = (e.clientX - rect.left) * scaleX;
      const canvasY = canvas.height - (e.clientY - rect.top) * scaleY;

      // 해당 위치의 뷰포트 찾기
      const viewport = viewportManager.getViewportAtPosition(canvasX, canvasY);
      setHoveredViewportId(viewport?.id ?? null);
    },
    [],
  );

  // Canvas 마우스 나감 핸들러
  const handleCanvasMouseLeave = useCallback(() => {
    setHoveredViewportId(null);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* 상태 표시 */}
      <div
        style={{
          padding: '8px 12px',
          background: '#2a2a2a',
          color: '#fff',
          borderRadius: '4px',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          Multi-Viewport ({layout}) | {viewports.length} viewports
        </span>
        <span style={{ color: '#8f8' }}>
          FPS: {stats.fps} | Frame Time: {stats.frameTime.toFixed(1)}ms
        </span>
        {activeViewportId && (
          <span style={{ color: '#8cf' }}>Active: {activeViewportId.slice(-8)}</span>
        )}
      </div>

      {/* Canvas Container */}
      <div
        style={{
          position: 'relative',
          width: `${width}px`,
          height: `${height}px`,
          border: '1px solid #444',
          background: '#000',
        }}
      >
        <canvas
          ref={canvasRef}
          width={Math.floor(width * dpr)}
          height={Math.floor(height * dpr)}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            cursor: 'pointer',
          }}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
        />

        {/* Viewport Hover Overlay */}
        {viewports.map((vp, index) => {
          // WebGL 좌표 → CSS 좌표 변환 (Y축 반전)
          // vp.bounds는 canvas의 물리적 픽셀 기준 (canvas.width, canvas.height)
          // CSS는 논리적 픽셀 기준 (width, height props)
          const canvasPixelHeight = height * dpr;
          const cssX = vp.bounds.x / dpr;
          const cssY = (canvasPixelHeight - vp.bounds.y - vp.bounds.height) / dpr;
          const cssWidth = vp.bounds.width / dpr;
          const cssHeight = vp.bounds.height / dpr;

          const isHovered = hoveredViewportId === vp.id;
          const isActive = activeViewportId === vp.id;

          // 디버그: 첫 렌더링 시 좌표 확인
          if (index === 0) {
            console.log('[Overlay] bounds:', vp.bounds, 'dpr:', dpr, 'css:', { cssX, cssY, cssWidth, cssHeight });
          }

          return (
            <div
              key={vp.id}
              style={{
                position: 'absolute',
                left: `${cssX}px`,
                top: `${cssY}px`,
                width: `${cssWidth}px`,
                height: `${cssHeight}px`,
                border: isActive
                  ? '3px solid #4cf'
                  : isHovered
                  ? '2px solid rgba(100, 200, 255, 0.7)'
                  : '1px solid rgba(255, 255, 255, 0.15)',
                background: isHovered ? 'rgba(100, 200, 255, 0.1)' : 'transparent',
                boxSizing: 'border-box',
                pointerEvents: 'none',
                transition: 'border 0.1s ease, background 0.1s ease',
                borderRadius: '2px',
              }}
            />
          );
        })}
      </div>

      {/* 컨트롤 */}
      <div
        style={{
          padding: '12px',
          background: '#1a1a2e',
          borderRadius: '4px',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={togglePlay}
          style={{
            padding: '8px 20px',
            fontSize: '14px',
            background: isPlaying ? '#c44' : '#4c4',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            minWidth: '80px',
          }}
        >
          {isPlaying ? '⏸ Stop' : '▶ Play'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label>FPS:</label>
          <input
            type="number"
            min={1}
            max={60}
            value={fps}
            onChange={(e) => handleFpsChange(Math.max(1, Math.min(60, Number(e.target.value))))}
            style={{ width: '50px', padding: '4px' }}
          />
          <input
            type="range"
            min={1}
            max={60}
            value={fps}
            onChange={(e) => handleFpsChange(Number(e.target.value))}
            style={{ width: '100px' }}
          />
        </div>

        <div style={{ fontSize: '12px', color: '#888' }}>
          Sync Mode: {syncMode} | Click viewport to select
        </div>
      </div>

      {/* 뷰포트 정보 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '8px',
        }}
      >
        {viewports.map((vp) => (
          <div
            key={vp.id}
            style={{
              padding: '8px',
              background: activeViewportId === vp.id ? '#2a3a4a' : '#1a1a1a',
              borderRadius: '4px',
              fontSize: '11px',
              color: '#aaa',
              border: activeViewportId === vp.id ? '1px solid #4cf' : '1px solid #333',
            }}
          >
            <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>
              {vp.id.slice(-8)}
            </div>
            <div>
              Frame: {vp.playback.currentFrame + 1} / {vp.series?.frameCount ?? 0}
            </div>
            <div>
              Size: {vp.series?.imageWidth ?? 0}x{vp.series?.imageHeight ?? 0}
            </div>
            <div>
              Bounds: ({vp.bounds.x}, {vp.bounds.y}) {vp.bounds.width}x{vp.bounds.height}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
