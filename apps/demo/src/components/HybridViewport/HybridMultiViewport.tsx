/**
 * HybridMultiViewport - 하이브리드 DOM-WebGL 멀티 뷰포트
 *
 * 학습 포인트:
 * - Single Canvas + DOM Slots 하이브리드 아키텍처
 * - HybridViewportManager로 DOM ↔ WebGL 좌표 동기화
 * - HybridRenderScheduler로 통합 렌더 루프
 *
 * 장점:
 * - WebGL 컨텍스트 1개로 16+ 뷰포트 지원
 * - DOM 기반 이벤트 처리 (자연스러운 클릭, 호버)
 * - CSS Grid로 유연한 레이아웃
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  HybridViewportManager,
  HybridRenderScheduler,
  FrameSyncEngine,
  TextureManager,
  ArrayTextureRenderer,
  decodeJpeg,
  decodeNative,
  closeDecodedFrame,
  useToolGroup,
  type LayoutType,
  type Viewport,
  type ViewportSeriesInfo,
  type DicomImageInfo,
  type WindowLevelOptions,
  type SyncMode,
} from '@echopixel/core';

import { ViewportGrid, type ViewportGridRef } from './ViewportGrid';
import { ViewportSlot } from './ViewportSlot';
import { ViewportOverlay } from './ViewportOverlay';

/**
 * 시리즈 데이터
 */
export interface SeriesData {
  info: ViewportSeriesInfo;
  frames: Uint8Array[];
  imageInfo: DicomImageInfo;
  isEncapsulated: boolean;
}

/**
 * HybridMultiViewport Props
 */
export interface HybridMultiViewportProps {
  /** 레이아웃 타입 */
  layout?: LayoutType;
  /** 컨테이너 너비 (CSS 픽셀) - 미지정 시 부모 크기 자동 감지 */
  width?: number;
  /** 컨테이너 높이 (CSS 픽셀) - 미지정 시 부모 크기 자동 감지 */
  height?: number;
  /** 뷰포트 클릭 콜백 */
  onViewportClick?: (viewportId: string) => void;
  /** 동기화 모드 */
  syncMode?: SyncMode;
  /** 시리즈 데이터 맵 */
  seriesMap?: Map<string, SeriesData>;
}

/**
 * 레이아웃 타입에서 행/열 추출
 */
function getLayoutDimensions(layout: LayoutType): { rows: number; cols: number } {
  switch (layout) {
    case 'grid-1x1':
      return { rows: 1, cols: 1 };
    case 'grid-2x2':
      return { rows: 2, cols: 2 };
    case 'grid-3x3':
      return { rows: 3, cols: 3 };
    case 'grid-4x4':
      return { rows: 4, cols: 4 };
    default:
      return { rows: 2, cols: 2 };
  }
}

export function HybridMultiViewport({
  layout = 'grid-2x2',
  width,
  height,
  onViewportClick,
  syncMode = 'frame-ratio',
  seriesMap,
}: HybridMultiViewportProps) {
  // Refs
  const wrapperRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<ViewportGridRef>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);

  // 컨테이너 크기 상태 (ResizeObserver로 자동 감지)
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: width ?? 800,
    height: height ?? 600,
  });

  // Manager refs
  const hybridManagerRef = useRef<HybridViewportManager | null>(null);
  const renderSchedulerRef = useRef<HybridRenderScheduler | null>(null);
  const syncEngineRef = useRef<FrameSyncEngine | null>(null);
  const textureManagersRef = useRef<Map<string, TextureManager>>(new Map());
  const arrayRendererRef = useRef<ArrayTextureRenderer | null>(null);

  // State
  const [viewportIds, setViewportIds] = useState<string[]>([]);
  const [viewports, setViewports] = useState<Viewport[]>([]);
  const [activeViewportId, setActiveViewportId] = useState<string | null>(null);
  const [hoveredViewportId, setHoveredViewportId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(30);
  const [stats, setStats] = useState({ fps: 0, frameTime: 0 });
  const [isInitialized, setIsInitialized] = useState(false);

  // Tool System용 뷰포트 요소 맵
  const [viewportElements] = useState(() => new Map<string, HTMLElement>());
  // viewportElements Map 변경 감지용 카운터
  const [viewportElementsVersion, setViewportElementsVersion] = useState(0);

  // DPR
  const [dpr] = useState(() => Math.min(window.devicePixelRatio || 1, 2));

  // 레이아웃 차원
  const { rows, cols } = getLayoutDimensions(layout);
  const slotCount = rows * cols;

  // 실제 사용할 크기 (props 우선, 없으면 측정된 크기)
  const effectiveWidth = width ?? containerSize.width;
  const effectiveHeight = height ?? containerSize.height;

  // 정지 이미지 여부 판단: 모든 뷰포트가 frameCount <= 1이면 정지 이미지 모드
  // - 정지 이미지: 휠 → Zoom
  // - 동영상: 휠 → StackScroll (프레임 전환)
  const isStaticImage = viewports.length > 0 && viewports.every((v) =>
    !v.series || v.series.frameCount <= 1
  );

  // Tool System 통합
  // - 기본 도구: WindowLevel(우클릭), Pan(중클릭), Zoom(Shift+좌클릭), StackScroll/Zoom(휠)
  const { resetAllViewports } = useToolGroup({
    toolGroupId: 'hybrid-main',
    viewportManager: hybridManagerRef.current,
    viewportElements,
    viewportElementsKey: viewportElementsVersion, // Map 변경 시 재등록 트리거
    disabled: !isInitialized,
    isStaticImage, // 정지/동영상 모드에 따라 휠 동작 변경
  });

  // ResizeObserver로 컨테이너 크기 자동 감지
  useEffect(() => {
    // props로 고정 크기가 지정되면 ResizeObserver 불필요
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

    // 초기 크기 설정
    const rect = wrapper.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setContainerSize({ width: rect.width, height: rect.height });
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [width, height]);

  // 컨테이너 크기 변경 시 HybridViewportManager 동기화 트리거
  useEffect(() => {
    if (hybridManagerRef.current) {
      hybridManagerRef.current.markNeedsSync();
    }
  }, [containerSize.width, containerSize.height]);

  // Canvas ref 콜백
  const handleCanvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) {
      // Cleanup
      renderSchedulerRef.current?.dispose();
      arrayRendererRef.current?.dispose();
      textureManagersRef.current.forEach((tm) => tm.dispose());
      textureManagersRef.current.clear();
      hybridManagerRef.current?.dispose();

      glRef.current = null;
      hybridManagerRef.current = null;
      renderSchedulerRef.current = null;
      syncEngineRef.current = null;
      arrayRendererRef.current = null;

      setViewportIds([]);
      setViewports([]);
      setIsInitialized(false);
      return;
    }

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
    const hybridManager = new HybridViewportManager({
      canvas,
      dpr,
    });
    hybridManagerRef.current = hybridManager;

    // 빈 슬롯 생성
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

    // 렌더링 콜백 설정
    renderScheduler.setRenderCallback((viewportId, frameIndex, bounds) => {
      const viewport = hybridManager.getViewport(viewportId);
      const textureManager = textureManagersRef.current.get(viewportId);

      if (!viewport || !textureManager || !textureManager.hasArrayTexture()) {
        return;
      }

      // Window/Level 옵션 변환
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

      // 텍스처 바인딩 및 렌더링
      textureManager.bindArrayTexture(viewport.textureUnit);
      arrayRenderer.renderFrame(viewport.textureUnit, frameIndex, wl);
    });

    // 프레임 업데이트 콜백
    renderScheduler.setFrameUpdateCallback((viewportId, frameIndex) => {
      setViewports((prev) =>
        prev.map((v) =>
          v.id === viewportId
            ? { ...v, playback: { ...v.playback, currentFrame: frameIndex } }
            : v
        )
      );
    });

    // 초기 뷰포트 상태
    setViewports(hybridManager.getAllViewports());
    setIsInitialized(true);

    console.log('[HybridMultiViewport] Initialized with', ids.length, 'slots');
  }, [dpr, slotCount]);

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

        // 뷰포트에 시리즈 정보 설정
        hybridManager.setViewportSeries(viewportId, seriesData.info);

        // 기존 TextureManager 정리 (메모리 누수 방지)
        const existingTextureManager = textureManagersRef.current.get(viewportId);
        if (existingTextureManager) {
          existingTextureManager.dispose();
        }

        // 새 TextureManager 생성
        const textureManager = new TextureManager(gl);
        textureManagersRef.current.set(viewportId, textureManager);

        // 프레임 디코딩 및 텍스처 업로드
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

          console.log(`[HybridMultiViewport] Uploaded ${decodedFrames.length} frames to viewport ${viewportId}`);
        } catch (err) {
          console.error(`[HybridMultiViewport] Failed to load series:`, err);
        }

        index++;
      }

      // 상태 업데이트
      setViewports(hybridManager.getAllViewports());

      // 초기 렌더링
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
    const interval = setInterval(() => {
      if (renderSchedulerRef.current) {
        const s = renderSchedulerRef.current.getStats();
        setStats({ fps: s.fps, frameTime: s.frameTime });
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // 재생/정지 토글
  const togglePlay = useCallback(() => {
    const hybridManager = hybridManagerRef.current;
    const renderScheduler = renderSchedulerRef.current;
    if (!hybridManager || !renderScheduler) return;

    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);

    for (const id of hybridManager.getAllViewportIds()) {
      hybridManager.setViewportPlaying(id, newIsPlaying);
      hybridManager.setViewportFps(id, fps);
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
    const hybridManager = hybridManagerRef.current;
    if (!hybridManager) return;

    for (const id of hybridManager.getAllViewportIds()) {
      hybridManager.setViewportFps(id, newFps);
    }
  }, []);

  // 뷰포트 클릭 핸들러
  const handleViewportClick = useCallback((viewportId: string) => {
    setActiveViewportId(viewportId);
    onViewportClick?.(viewportId);
  }, [onViewportClick]);

  // 뷰포트 호버 핸들러
  const handleViewportMouseEnter = useCallback((viewportId: string) => {
    setHoveredViewportId(viewportId);
  }, []);

  const handleViewportMouseLeave = useCallback(() => {
    setHoveredViewportId(null);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
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
          flexShrink: 0,
        }}
      >
        <span>
          Hybrid Multi-Viewport ({layout}) | {viewportIds.length} viewports
        </span>
        <span style={{ color: '#8f8' }}>
          FPS: {stats.fps} | Frame Time: {stats.frameTime.toFixed(1)}ms
        </span>
        {activeViewportId && (
          <span style={{ color: '#8cf' }}>Active: {activeViewportId.slice(-8)}</span>
        )}
      </div>

      {/* ViewportGrid 래퍼 - ResizeObserver 대상 */}
      <div
        ref={wrapperRef}
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
        }}
      >
        <ViewportGrid
          ref={gridRef}
          rows={rows}
          cols={cols}
          width={effectiveWidth}
          height={effectiveHeight}
          gap={2}
          dpr={dpr}
          onCanvasRef={handleCanvasRef}
        >
        {viewportIds.map((id, index) => {
          const viewport = viewports.find((v) => v.id === id) ?? null;
          const manager = hybridManagerRef.current;

          // manager가 아직 초기화되지 않았으면 빈 placeholder 렌더링
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
            <ViewportSlot
              key={id}
              viewportId={id}
              manager={manager}
              viewport={viewport}
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
              <ViewportOverlay
                viewport={viewport}
                index={index}
                showFrameInfo={true}
                showViewportId={false}
              />
            </ViewportSlot>
          );
        })}
        </ViewportGrid>
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
          flexShrink: 0,
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
          </div>
        ))}
      </div>
    </div>
  );
}
