/**
 * Performance Test 페이지 (Pure WebGL)
 * - DOM Overlay 없이 순수 WebGL 렌더링
 * - 성능 비교용
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  WadoRsDataSource,
  QuadRenderer,
  decodeJpeg,
  closeDecodedFrame,
  type DicomInstanceId,
} from '@echopixel/core';
import { cn } from '@echopixel/react';
import { InstanceSelector } from '../components';
import { useInstanceScanner } from '../hooks';
import type { WadoConfig } from '../types/demo';

interface PerfTestPageProps {
  wadoConfig: WadoConfig;
  onWadoConfigChange: (config: WadoConfig) => void;
}

interface ViewportRenderData {
  id: string;
  textures: WebGLTexture[];
  width: number;
  height: number;
  currentFrame: number;
  totalFrames: number;
}

interface PerfTestData {
  viewports: ViewportRenderData[];
  cols: number;
  rows: number;
  animationId: number | null;
  lastTime: number;
  fpsCounter: number;
  fpsLastUpdate: number;
  vramBytes: number;
}

export function PerfTestPage({ wadoConfig, onWadoConfigChange }: PerfTestPageProps) {
  // 뷰포트 개수
  const [viewportCount, setViewportCount] = useState(16);

  // 상태
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(30);
  const [stats, setStats] = useState({ fps: 0, frameTime: 0, vramMB: 0 });
  const [error, setError] = useState<string | null>(null);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const rendererRef = useRef<QuadRenderer | null>(null);
  const dataRef = useRef<PerfTestData | null>(null);

  // Instance 스캐너 훅
  const {
    scanInstances,
    scannedInstances,
    selectedUids,
    toggleSelection,
    selectAllPlayable,
    clearSelection,
    setSelectedUids,
    scanningStatus,
    error: scanError,
  } = useInstanceScanner();

  // viewportCount 변경 시 선택 조정
  useEffect(() => {
    if (scannedInstances.length > 0) {
      const validUids = scannedInstances
        .filter((r) => !r.error)
        .slice(0, viewportCount)
        .map((r) => r.uid);
      setSelectedUids(new Set(validUids));
    }
  }, [viewportCount, scannedInstances, setSelectedUids]);

  // 렌더링 함수
  const renderFrame = useCallback(
    (
      gl: WebGL2RenderingContext,
      renderer: QuadRenderer,
      viewports: ViewportRenderData[],
      cols: number,
      rows: number,
      canvasWidth: number,
      canvasHeight: number
    ) => {
      const vpWidth = canvasWidth / cols;
      const vpHeight = canvasHeight / rows;

      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      viewports.forEach((vp, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = col * vpWidth;
        const y = canvasHeight - (row + 1) * vpHeight;

        gl.scissor(x, y, vpWidth, vpHeight);
        gl.viewport(x, y, vpWidth, vpHeight);
        gl.enable(gl.SCISSOR_TEST);

        const texture = vp.textures[vp.currentFrame];
        if (texture) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          renderer.render(0);
        }
      });

      gl.disable(gl.SCISSOR_TEST);
    },
    []
  );

  // Instance 스캔
  const handleScan = async () => {
    await scanInstances(wadoConfig, viewportCount);
  };

  // 데이터 로드
  const handleLoad = async () => {
    if (selectedUids.size === 0) return;

    if (!wadoConfig.baseUrl || wadoConfig.baseUrl.trim() === '') {
      setError('WADO-RS Base URL이 필요합니다.');
      return;
    }

    if (!wadoConfig.studyUid || !wadoConfig.seriesUid) {
      setError('Study UID와 Series UID가 필요합니다.');
      return;
    }

    setIsLoading(true);
    setIsReady(false);
    setError(null);

    try {
      const dataSource = new WadoRsDataSource({ baseUrl: wadoConfig.baseUrl.trim() });
      const instanceUidsToLoad = Array.from(selectedUids).slice(0, viewportCount);

      console.log('[PerfTest] Loading', instanceUidsToLoad.length, 'instances');

      // Canvas 및 WebGL 초기화
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas not found');

      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance',
      });
      if (!gl) throw new Error('WebGL2 not supported');

      glRef.current = gl;

      // 그리드 계산
      const cols = Math.ceil(Math.sqrt(instanceUidsToLoad.length));
      const rows = Math.ceil(instanceUidsToLoad.length / cols);

      // 뷰포트 데이터 저장
      const viewportsData: ViewportRenderData[] = [];
      let totalVramBytes = 0;

      // 각 Instance 로드 및 텍스처 생성
      for (let i = 0; i < instanceUidsToLoad.length; i++) {
        const uid = instanceUidsToLoad[i];
        const viewportId = `perf-vp-${i}`;

        const instanceId: DicomInstanceId = {
          studyInstanceUid: wadoConfig.studyUid,
          seriesInstanceUid: wadoConfig.seriesUid,
          sopInstanceUid: uid,
        };

        // scannedInstances에서 frameCount 가져오기
        const scannedInstance = scannedInstances.find((inst) => inst.uid === uid);
        const metadata = await dataSource.loadMetadata(instanceId);
        const frameCount = scannedInstance?.frameCount || metadata.frameCount || 1;

        // 프레임별 텍스처 생성
        const textures: WebGLTexture[] = [];
        for (let f = 0; f < frameCount; f++) {
          const pixelData = await dataSource.loadFrame(instanceId, f + 1);
          const decoded = await decodeJpeg(pixelData);
          const image = decoded.image;

          const texture = gl.createTexture();
          if (!texture) throw new Error('Failed to create texture');

          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

          textures.push(texture);
          totalVramBytes += decoded.width * decoded.height * 4;
          closeDecodedFrame(decoded);
        }

        viewportsData.push({
          id: viewportId,
          textures,
          width: metadata.imageInfo.columns,
          height: metadata.imageInfo.rows,
          currentFrame: 0,
          totalFrames: frameCount,
        });

        console.log(
          `[PerfTest] Loaded viewport ${i + 1}/${instanceUidsToLoad.length}: ${frameCount} frames`
        );
      }

      // 렌더 데이터 저장
      dataRef.current = {
        viewports: viewportsData,
        cols,
        rows,
        animationId: null,
        lastTime: performance.now(),
        fpsCounter: 0,
        fpsLastUpdate: performance.now(),
        vramBytes: totalVramBytes,
      };

      // 렌더러 초기화
      const renderer = new QuadRenderer(gl);
      rendererRef.current = renderer;

      // 초기 렌더링
      renderFrame(gl, renderer, viewportsData, cols, rows, canvas.width, canvas.height);

      setIsReady(true);
      setStats({
        fps: 0,
        frameTime: 0,
        vramMB: totalVramBytes / (1024 * 1024),
      });

      console.log('[PerfTest] Ready with', instanceUidsToLoad.length, 'viewports');
    } catch (err) {
      console.error('[PerfTest] Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  // 재생 토글
  const togglePlay = useCallback(() => {
    const data = dataRef.current;
    const gl = glRef.current;
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;

    if (!data || !gl || !renderer || !canvas) return;

    if (isPlaying) {
      // 정지
      if (data.animationId !== null) {
        cancelAnimationFrame(data.animationId);
        data.animationId = null;
      }
      setIsPlaying(false);
    } else {
      // 재생 시작
      const frameInterval = 1000 / fps;
      let lastFrameTime = performance.now();

      const tick = (timestamp: number) => {
        if (!dataRef.current) return;

        const deltaTime = timestamp - lastFrameTime;

        // FPS 계산
        data.fpsCounter++;
        if (timestamp - data.fpsLastUpdate >= 1000) {
          setStats((prev) => ({
            ...prev,
            fps: data.fpsCounter,
          }));
          data.fpsCounter = 0;
          data.fpsLastUpdate = timestamp;
        }

        // 프레임 업데이트
        if (deltaTime >= frameInterval) {
          lastFrameTime = timestamp - (deltaTime % frameInterval);

          data.viewports.forEach((vp) => {
            if (vp.totalFrames > 1) {
              vp.currentFrame = (vp.currentFrame + 1) % vp.totalFrames;
            }
          });
        }

        // 렌더링
        const frameStart = performance.now();
        renderFrame(gl, renderer, data.viewports, data.cols, data.rows, canvas.width, canvas.height);
        const frameTime = performance.now() - frameStart;

        setStats((prev) => ({
          ...prev,
          frameTime,
        }));

        data.animationId = requestAnimationFrame(tick);
      };

      data.animationId = requestAnimationFrame(tick);
      setIsPlaying(true);
    }
  }, [isPlaying, fps, renderFrame]);

  // FPS 변경
  const handleFpsChange = useCallback((newFps: number) => {
    setFps(newFps);
  }, []);

  // 리셋
  const handleReset = useCallback(() => {
    const data = dataRef.current;
    const gl = glRef.current;
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;

    if (!data || !gl || !renderer || !canvas) return;

    data.viewports.forEach((vp) => {
      vp.currentFrame = 0;
    });

    renderFrame(gl, renderer, data.viewports, data.cols, data.rows, canvas.width, canvas.height);
  }, [renderFrame]);

  // 정리
  const handleCleanup = useCallback(() => {
    const data = dataRef.current;
    const gl = glRef.current;

    if (data && data.animationId !== null) {
      cancelAnimationFrame(data.animationId);
    }

    if (data && gl) {
      data.viewports.forEach((vp) => {
        vp.textures.forEach((tex) => gl.deleteTexture(tex));
      });
    }

    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current = null;
    }

    dataRef.current = null;
    glRef.current = null;

    setIsReady(false);
    setIsPlaying(false);
    setStats({ fps: 0, frameTime: 0, vramMB: 0 });
  }, []);

  const displayError = error || scanError;

  return (
    <div className="p-5">
      {/* 모드 설명 패널 */}
      <div className="p-4 mb-4 bg-[#3d2d1f] border border-[#a74] rounded-md">
        <h3 className="m-0 mb-2.5 text-[#f8d8b4] text-lg">
          🚀 Performance Test (Pure WebGL)
        </h3>
        <p className="m-0 text-[#d8c8b8] text-base leading-relaxed">
          DOM Overlay 없이 순수 WebGL로만 렌더링합니다. Hybrid DOM-WebGL 방식과 성능을 비교할 수
          있습니다.
        </p>
        <div className="mt-3 p-2.5 bg-black/30 rounded-md text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-accent-success font-bold mb-1.5">
                Pure WebGL (이 모드)
              </div>
              <ul className="m-0 pl-5 text-text-secondary">
                <li>Frame Time: ~0.1ms</li>
                <li>GPU 작업만 (CPU 최소)</li>
                <li>DOM 조작 없음</li>
                <li>React 리렌더링 없음</li>
              </ul>
            </div>
            <div>
              <div className="text-accent-info font-bold mb-1.5">
                Hybrid DOM-WebGL (Multi 모드)
              </div>
              <ul className="m-0 pl-5 text-text-secondary">
                <li>Frame Time: ~1-3ms</li>
                <li>React 컴포넌트 사용 가능</li>
                <li>DOM 이벤트 활용</li>
                <li>SVG 어노테이션 지원</li>
              </ul>
            </div>
          </div>
          <div className="mt-2.5 text-accent-warning text-xs">
            ※ 둘 다 60fps(16.6ms) 충족. 기능 vs 성능 트레이드오프.
          </div>
        </div>
        <div className="mt-2 text-xs text-[#a74]">
          Using: @echopixel/core ViewportManager, RenderScheduler, ArrayTextureRenderer
        </div>
      </div>

      {/* 에러 표시 */}
      {displayError && (
        <div className="p-4 mb-4 bg-[#3a1a1a] border border-[#a44] rounded-md text-[#f88]">
          Error: {displayError}
        </div>
      )}

      {/* WADO-RS 설정 */}
      <div className="p-4 mb-4 bg-[#2a2a3a] rounded-md">
        <h4 className="m-0 mb-2.5 text-text-secondary text-lg">📡 WADO-RS 설정</h4>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label className="w-[100px] text-text-muted">Base URL:</label>
            <input
              type="text"
              value={wadoConfig.baseUrl}
              onChange={(e) => onWadoConfigChange({ ...wadoConfig, baseUrl: e.target.value })}
              className="flex-1 px-2.5 py-1.5 bg-[#1a1a2a] border border-[#444] rounded-md text-white font-mono text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="w-[100px] text-text-muted">Study UID:</label>
            <input
              type="text"
              value={wadoConfig.studyUid}
              onChange={(e) => onWadoConfigChange({ ...wadoConfig, studyUid: e.target.value })}
              className="flex-1 px-2.5 py-1.5 bg-[#1a1a2a] border border-[#444] rounded-md text-white font-mono text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="w-[100px] text-text-muted">Series UID:</label>
            <input
              type="text"
              value={wadoConfig.seriesUid}
              onChange={(e) => onWadoConfigChange({ ...wadoConfig, seriesUid: e.target.value })}
              className="flex-1 px-2.5 py-1.5 bg-[#1a1a2a] border border-[#444] rounded-md text-white font-mono text-sm"
            />
          </div>
        </div>
      </div>

      {/* 뷰포트 개수 설정 */}
      <div className="p-4 mb-4 bg-[#2a2a3a] rounded-md">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-text-secondary">뷰포트 개수:</label>
            <input
              type="range"
              min="1"
              max="100"
              value={viewportCount}
              onChange={(e) => setViewportCount(Number(e.target.value))}
              className="w-[200px]"
            />
            <span className="text-[#f8d8b4] font-bold min-w-[40px]">
              {viewportCount}
            </span>
          </div>
          <div className="flex gap-2">
            {[4, 9, 16, 25, 36, 64, 100].map((n) => (
              <button
                key={n}
                onClick={() => setViewportCount(n)}
                className={cn(
                  'px-2 py-1 text-xs text-white border-none rounded-sm cursor-pointer',
                  viewportCount === n ? 'bg-[#a74]' : 'bg-[#444] hover:bg-[#555]'
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 스캔 및 로드 버튼 */}
      <div className="flex gap-2.5 mb-4">
        <button
          onClick={handleScan}
          disabled={!!scanningStatus}
          className={cn(
            'px-5 py-2.5 text-lg text-white border-none rounded-md',
            scanningStatus
              ? 'bg-[#4a4a6a] cursor-not-allowed opacity-70'
              : 'bg-[#4a4a6a] cursor-pointer hover:bg-[#5a5a7a]'
          )}
        >
          {scanningStatus || '🔍 Instance 스캔'}
        </button>

        <button
          onClick={handleLoad}
          disabled={selectedUids.size === 0 || isLoading}
          className={cn(
            'px-5 py-2.5 text-lg text-white border-none rounded-md',
            selectedUids.size === 0
              ? 'bg-[#333] cursor-not-allowed opacity-50'
              : 'bg-[#a74] cursor-pointer hover:bg-[#b85]'
          )}
        >
          {isLoading
            ? '로딩 중...'
            : `🚀 Pure WebGL 로드 (${Math.min(selectedUids.size, viewportCount)}개)`}
        </button>
      </div>

      {/* Instance 선택 목록 */}
      {scannedInstances.length > 0 && (
        <InstanceSelector
          instances={scannedInstances}
          selectedUids={selectedUids}
          maxSelect={viewportCount}
          onToggle={(uid) => toggleSelection(uid, viewportCount)}
          onSelectAllPlayable={() => selectAllPlayable(viewportCount)}
          onClearSelection={clearSelection}
          className="mb-4"
        />
      )}

      {/* Pure WebGL 캔버스 영역 */}
      <div className={cn('mb-4', (selectedUids.size > 0 || isReady) ? 'block' : 'hidden')}>
        {/* 성능 통계 */}
        {isReady && (
          <div className="px-4 py-2.5 mb-2.5 bg-[#1a2a1a] border border-[#4a6] rounded-md flex items-center gap-8">
            <div>
              <span className="text-text-muted mr-2">FPS:</span>
              <span className="text-accent-success font-bold text-xl">
                {stats.fps.toFixed(1)}
              </span>
            </div>
            <div>
              <span className="text-text-muted mr-2">Frame Time:</span>
              <span className="text-[#f8f] font-bold text-xl">
                {stats.frameTime.toFixed(2)} ms
              </span>
            </div>
            <div>
              <span className="text-text-muted mr-2">VRAM:</span>
              <span className="text-[#ff8] font-bold text-xl">
                {stats.vramMB.toFixed(0)} MB
              </span>
            </div>
            <div>
              <span className="text-text-muted mr-2">Viewports:</span>
              <span className="text-accent-info font-bold text-xl">
                {viewportCount}
              </span>
            </div>
          </div>
        )}

        {/* 캔버스 */}
        <div className="border-2 border-[#a74] rounded-md overflow-hidden">
          <canvas
            ref={canvasRef}
            width={1280}
            height={960}
            className="block w-full max-w-[1280px] bg-black"
          />
        </div>

        {/* 컨트롤 */}
        {isReady && (
          <div className="p-3 mt-2.5 bg-viewer-surface rounded-md flex items-center gap-4">
            <button
              onClick={togglePlay}
              className={cn(
                'px-5 py-2 text-lg text-white border-none rounded-md cursor-pointer min-w-[100px]',
                isPlaying ? 'bg-accent-error' : 'bg-accent-success'
              )}
            >
              {isPlaying ? '⏸ Stop' : '▶ Play All'}
            </button>

            <div className="flex items-center gap-2">
              <label className="text-text-secondary">FPS:</label>
              <input
                type="number"
                min={1}
                max={120}
                value={fps}
                onChange={(e) => handleFpsChange(Math.max(1, Math.min(120, Number(e.target.value))))}
                className="w-[50px] p-1"
              />
              <input
                type="range"
                min={1}
                max={120}
                value={fps}
                onChange={(e) => handleFpsChange(Number(e.target.value))}
                className="w-[100px]"
              />
            </div>

            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-sm bg-[#444] text-white border-none rounded-md cursor-pointer hover:bg-[#555]"
            >
              🔄 리셋
            </button>

            <button
              onClick={handleCleanup}
              className="px-3 py-1.5 text-sm bg-[#644] text-white border-none rounded-md cursor-pointer hover:bg-[#755]"
            >
              🗑 정리
            </button>
          </div>
        )}
      </div>

      {/* 로딩 상태 */}
      {isLoading && (
        <div className="p-10 bg-[#1a1a2a] rounded-md text-center text-[#f8d8b4]">
          <div className="text-xl mb-2.5">⏳</div>
          Pure WebGL 모드로 DICOM 데이터를 로딩 중입니다...
        </div>
      )}

      {/* 초기 안내 */}
      {!isReady && !isLoading && scannedInstances.length === 0 && (
        <div className="p-5 bg-[#1a1a2a] rounded-md text-center text-text-muted">
          'Instance 스캔' 버튼을 클릭하여 Series 내 Instance를 조회하세요.
          <br />
          스캔 후 Instance를 선택하고 'Pure WebGL 로드' 버튼을 클릭하세요.
        </div>
      )}
    </div>
  );
}
