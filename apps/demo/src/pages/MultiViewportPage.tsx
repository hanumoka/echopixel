/**
 * Multi Viewport 페이지 (Single Canvas)
 * - 단일 WebGL Canvas에서 여러 뷰포트 렌더링
 * - HybridMultiViewport 사용
 * - 100개까지 뷰포트 지원
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { type Annotation } from '@echopixel/core';
import {
  HybridMultiViewport as ReactHybridMultiViewport,
  cn,
  type HybridMultiViewportHandle,
  type HybridSeriesData,
  type HybridViewportStats,
  type PerformanceOptions,
} from '@echopixel/react';
import { InstanceSelector, PlaybackControlBar, ExpandedViewModal } from '../components';
import { PerformanceOptionsPanel } from '../components/PerformanceOptions';
import { useWadoLoader, useInstanceScanner, useMultiAnnotations } from '../hooks';
import type { WadoConfig } from '../types/demo';
import { calculateGridDimensions } from '../types/demo';

interface MultiViewportPageProps {
  wadoConfig: WadoConfig;
  onWadoConfigChange: (config: WadoConfig) => void;
}

export function MultiViewportPage({ wadoConfig, onWadoConfigChange }: MultiViewportPageProps) {
  // 뷰포트 개수 (최대 100개)
  const [viewportCount, setViewportCount] = useState(4);

  // 시리즈 맵
  const [seriesMap, setSeriesMap] = useState<Map<string, HybridSeriesData>>(new Map());
  const multiViewportRef = useRef<HybridMultiViewportHandle>(null);

  // 재생 상태
  const [fps, setFps] = useState(30);
  const [isPlaying, setIsPlaying] = useState(false);
  const [stats, setStats] = useState({ fps: 0, frameTime: 0, vramMB: 0 });

  // 확대 보기
  const [expandedViewportId, setExpandedViewportId] = useState<string | null>(null);
  const [viewportIdToSeriesKeyMap, setViewportIdToSeriesKeyMap] = useState<Map<string, string>>(new Map());

  // 역매핑: seriesKey → internalViewportId
  const seriesKeyToViewportIdMap = useMemo(() => {
    const reverseMap = new Map<string, string>();
    for (const [internalId, seriesKey] of viewportIdToSeriesKeyMap) {
      reverseMap.set(seriesKey, internalId);
    }
    return reverseMap;
  }, [viewportIdToSeriesKeyMap]);

  // 성능 옵션
  const [performanceOptions, setPerformanceOptions] = useState<PerformanceOptions>({
    maxVramMB: Infinity,
    dprOverride: undefined,
    debugMode: false,
  });
  const performanceKey = `${performanceOptions.maxVramMB}-${performanceOptions.dprOverride}-${performanceOptions.debugMode}`;

  // 활성 도구
  const [activeTool, setActiveTool] = useState('WindowLevel');

  // Instance 스캐너 훅
  const {
    scanInstances,
    scannedInstances,
    selectedUids,
    toggleSelection,
    selectAllPlayable,
    clearSelection,
    scanningStatus,
    error: scanError,
  } = useInstanceScanner();

  // WADO 로더 훅
  const { loadMultipleInstances, loadingStatus, error: loadError } = useWadoLoader();

  // 어노테이션 훅
  const {
    annotations: multiAnnotations,
    updateAnnotation,
    deleteAnnotation,
    selectedId: selectedAnnotationId,
    selectAnnotation,
    showAnnotations,
    setShowAnnotations,
  } = useMultiAnnotations();

  // 내부 ID 기반 어노테이션 맵 변환
  const annotationsForHybrid = useMemo(() => {
    const convertedMap = new Map<string, Annotation[]>();
    for (const [seriesKey, annotations] of multiAnnotations) {
      const internalId = seriesKeyToViewportIdMap.get(seriesKey);
      if (internalId) {
        convertedMap.set(internalId, annotations);
      } else {
        convertedMap.set(seriesKey, annotations);
      }
    }
    return convertedMap;
  }, [multiAnnotations, seriesKeyToViewportIdMap]);

  const error = scanError || loadError;
  const gridDimensions = calculateGridDimensions(viewportCount);

  // 영상/정지 통계
  const viewportStats = useMemo(() => {
    const seriesArray = Array.from(seriesMap.values());
    const playableCount = seriesArray.filter((s) => s.info.frameCount > 1).length;
    const stillCount = seriesArray.length - playableCount;
    return { playableCount, stillCount, allStillImages: playableCount === 0 };
  }, [seriesMap]);

  // Instance 스캔
  const handleScan = async () => {
    await scanInstances(wadoConfig);
  };

  // 데이터 로드
  const handleLoad = async () => {
    setSeriesMap(new Map());
    setIsPlaying(false);

    const instanceUids = Array.from(selectedUids).slice(0, viewportCount);
    const loadedSeriesMap = await loadMultipleInstances(wadoConfig, instanceUids);

    setSeriesMap(loadedSeriesMap);
  };

  // ID 매핑 콜백
  const handleViewportIdsReady = useCallback((internalIds: string[], seriesKeys: string[]) => {
    const mapping = new Map<string, string>();
    for (let i = 0; i < internalIds.length && i < seriesKeys.length; i++) {
      mapping.set(internalIds[i], seriesKeys[i]);
    }
    console.log('[MultiViewportPage] Built viewport ID mapping:', Object.fromEntries(mapping));
    setViewportIdToSeriesKeyMap(mapping);
  }, []);

  // 재생 토글
  const togglePlay = useCallback(() => {
    if (multiViewportRef.current) {
      multiViewportRef.current.togglePlayAll();
      setIsPlaying(multiViewportRef.current.isPlaying());
    }
  }, []);

  // FPS 변경
  const handleFpsChange = useCallback((newFps: number) => {
    setFps(newFps);
    if (multiViewportRef.current) {
      multiViewportRef.current.setFps(newFps);
    }
  }, []);

  // 통계 업데이트
  const handleStatsUpdate = useCallback((newStats: HybridViewportStats) => {
    setStats({ fps: newStats.fps, frameTime: newStats.frameTime, vramMB: newStats.vramMB });
  }, []);

  // 재생 상태 변경
  const handlePlayingChange = useCallback((playing: boolean) => {
    setIsPlaying(playing);
  }, []);

  // 어노테이션 업데이트 (내부 ID → seriesKey 변환)
  const handleAnnotationUpdate = useCallback(
    (viewportId: string, annotation: Annotation) => {
      const seriesKey = viewportIdToSeriesKeyMap.get(viewportId) || viewportId;
      updateAnnotation(seriesKey, annotation);
    },
    [viewportIdToSeriesKeyMap, updateAnnotation]
  );

  // 어노테이션 선택
  const handleAnnotationSelect = useCallback(
    (viewportId: string, annotationId: string | null) => {
      const seriesKey = viewportIdToSeriesKeyMap.get(viewportId) || viewportId;
      selectAnnotation(seriesKey, annotationId);
    },
    [viewportIdToSeriesKeyMap, selectAnnotation]
  );

  // 어노테이션 삭제
  const handleAnnotationDelete = useCallback(
    (viewportId: string, annotationId: string) => {
      const seriesKey = viewportIdToSeriesKeyMap.get(viewportId) || viewportId;
      deleteAnnotation(seriesKey, annotationId);
    },
    [viewportIdToSeriesKeyMap, deleteAnnotation]
  );

  // 확대 보기 데이터 가져오기
  const getExpandedSeriesData = () => {
    if (!expandedViewportId) return null;
    const seriesKey = viewportIdToSeriesKeyMap.get(expandedViewportId) || expandedViewportId;
    return seriesMap.get(seriesKey);
  };

  const expandedData = getExpandedSeriesData();

  return (
    <div>
      {/* 모드 설명 패널 */}
      <div className="p-4 mb-4 bg-[#1f3d2d] border border-[#7a4] rounded-md">
        <h3 className="m-0 mb-2.5 text-[#b4f8c8] text-lg">
          🎯 Multi (Single Canvas)
        </h3>
        <p className="m-0 text-[#a8c8b8] text-base leading-relaxed">
          <strong>단일 WebGL Canvas</strong>에서 여러 뷰포트를 렌더링합니다.
          gl.scissor()와 gl.viewport()로 영역을 분할하여 각 뷰포트를 그립니다.
          텍스처 공유가 가능하여 메모리 효율적이지만, 16개 이상 뷰포트에서 성능 테스트가 필요합니다.
        </p>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="p-4 mb-4 bg-[#3a1a1a] border border-[#a44] rounded-md text-[#f88]">
          Error: {error}
        </div>
      )}

      {/* 설정 패널 */}
      <div className="p-4 mb-4 bg-[#1a2a1a] border border-[#4a7] rounded-md">
        <h3 className="m-0 mb-4 text-accent-success text-lg">WADO-RS 설정</h3>

        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <label className="block text-accent-info mb-1.5 text-base">
              DICOM Web Base URL
            </label>
            <input
              type="text"
              value={wadoConfig.baseUrl}
              onChange={(e) => onWadoConfigChange({ ...wadoConfig, baseUrl: e.target.value })}
              className="w-full p-2 text-base bg-[#2a2a3a] border border-[#555] rounded-md text-white"
            />
          </div>
          <div>
            <label className="block text-accent-info mb-1.5 text-base">
              Study Instance UID
            </label>
            <input
              type="text"
              value={wadoConfig.studyUid}
              onChange={(e) => onWadoConfigChange({ ...wadoConfig, studyUid: e.target.value })}
              className="w-full p-2 text-base bg-[#2a2a3a] border border-[#555] rounded-md text-white"
            />
          </div>
          <div>
            <label className="block text-accent-info mb-1.5 text-base">
              Series Instance UID
            </label>
            <input
              type="text"
              value={wadoConfig.seriesUid}
              onChange={(e) => onWadoConfigChange({ ...wadoConfig, seriesUid: e.target.value })}
              className="w-full p-2 text-base bg-[#2a2a3a] border border-[#555] rounded-md text-white"
            />
          </div>
          <div>
            <label className="block text-accent-info mb-1.5 text-base">
              뷰포트 개수: {viewportCount}개 ({gridDimensions.cols}×{gridDimensions.rows})
            </label>
            <input
              type="range"
              min="1"
              max="100"
              value={viewportCount}
              onChange={(e) => setViewportCount(Number(e.target.value))}
              className="w-full cursor-pointer"
            />
            <div className="flex justify-between text-xs text-text-muted mt-0.5">
              <span>1</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>
        </div>

        {/* 액션 버튼들 */}
        <div className="mt-4 flex gap-2.5 flex-wrap">
          <button
            onClick={handleScan}
            disabled={!!scanningStatus || !!loadingStatus}
            className={cn(
              'px-5 py-2.5 text-white border-none rounded-md text-lg',
              scanningStatus
                ? 'bg-text-disabled cursor-not-allowed'
                : 'bg-[#47a] cursor-pointer hover:bg-[#58b]'
            )}
          >
            {scanningStatus || 'Instance 스캔'}
          </button>

          <button
            onClick={handleLoad}
            disabled={
              !!loadingStatus ||
              !!scanningStatus ||
              (scannedInstances.length > 0 && selectedUids.size === 0)
            }
            className={cn(
              'px-5 py-2.5 text-white border-none rounded-md text-lg font-bold',
              loadingStatus || (scannedInstances.length > 0 && selectedUids.size === 0)
                ? 'bg-text-disabled cursor-not-allowed'
                : 'bg-[#4a7] cursor-pointer hover:bg-[#5b8]'
            )}
          >
            {loadingStatus || `로드 (${selectedUids.size > 0 ? selectedUids.size : viewportCount}개)`}
          </button>
        </div>

        {/* Instance 선택 목록 */}
        {scannedInstances.length > 0 && (
          <InstanceSelector
            instances={scannedInstances}
            selectedUids={selectedUids}
            maxSelect={viewportCount}
            onToggle={toggleSelection}
            onSelectAllPlayable={() => selectAllPlayable(viewportCount)}
            onClearSelection={clearSelection}
            className="mt-4"
          />
        )}

        {/* 스캔 전 안내 */}
        {scannedInstances.length === 0 && !scanningStatus && (
          <div className="mt-4 text-sm text-text-muted">
            'Instance 스캔' 버튼을 클릭하여 Series 내 모든 Instance를 조회하세요.
            <br />
            스캔 후 로드할 Instance를 선택할 수 있습니다.
          </div>
        )}
      </div>

      {/* 성능 옵션 패널 */}
      <PerformanceOptionsPanel
        options={performanceOptions}
        onChange={setPerformanceOptions}
        currentVramMB={stats.vramMB}
        className="mb-4"
      />

      {/* 상태 표시 */}
      {seriesMap.size > 0 && (
        <div className="px-3 py-2 mb-2.5 bg-[#2a2a2a] text-white rounded-md text-base flex justify-between items-center">
          <span>
            Multi-Viewport ({viewportCount}개, {gridDimensions.cols}×{gridDimensions.rows}) |{' '}
            {seriesMap.size} loaded
          </span>
          <span className="text-accent-success">
            FPS: {stats.fps} | Frame Time: {stats.frameTime.toFixed(1)}ms | VRAM:{' '}
            {stats.vramMB.toFixed(1)}MB
          </span>
        </div>
      )}

      {/* HybridMultiViewport */}
      {seriesMap.size > 0 && (
        <ReactHybridMultiViewport
          key={performanceKey}
          ref={multiViewportRef}
          viewportCount={viewportCount}
          width={1320}
          height={900}
          minViewportHeight={250}
          seriesMap={seriesMap}
          syncMode="frame-ratio"
          initialFps={fps}
          showDefaultOverlay={true}
          performanceOptions={performanceOptions}
          onPlayingChange={handlePlayingChange}
          onStatsUpdate={handleStatsUpdate}
          onViewportDoubleClick={(viewportId) => {
            console.log('[MultiViewportPage] onViewportDoubleClick:', viewportId);
            setExpandedViewportId(viewportId);
          }}
          annotations={annotationsForHybrid}
          selectedAnnotationId={selectedAnnotationId}
          onAnnotationSelect={handleAnnotationSelect}
          onAnnotationUpdate={handleAnnotationUpdate}
          onAnnotationDelete={handleAnnotationDelete}
          showAnnotationTools={true}
          activeTool={activeTool}
          onToolChange={setActiveTool}
          showAnnotations={showAnnotations}
          onAnnotationsVisibilityChange={setShowAnnotations}
          onViewportIdsReady={handleViewportIdsReady}
          style={{
            border: '1px solid #444',
            marginBottom: '10px',
          }}
        />
      )}

      {/* 확대 뷰 버튼 패널 */}
      {seriesMap.size > 0 && (
        <div className="p-2.5 mb-2.5 bg-[#1a2a3a] rounded-md flex gap-2.5 flex-wrap items-center">
          <span className="text-accent-info text-base">🔍 확대 보기:</span>
          {Array.from(seriesMap.keys()).map((viewportId) => (
            <button
              key={viewportId}
              onClick={() => setExpandedViewportId(viewportId)}
              className="px-3 py-1.5 text-sm bg-[#2a3a4a] text-white border border-[#4a6a8a] rounded-md cursor-pointer hover:bg-[#3a4a5a]"
            >
              {viewportId}
            </button>
          ))}
          <span className="text-xs text-text-muted ml-2.5">
            (또는 뷰포트 더블클릭)
          </span>
        </div>
      )}

      {/* 확대 보기 모달 */}
      {expandedData && (
        <ExpandedViewModal
          isOpen={!!expandedViewportId}
          onClose={() => setExpandedViewportId(null)}
          title={viewportIdToSeriesKeyMap.get(expandedViewportId!) || expandedViewportId!}
          frames={expandedData.frames}
          imageInfo={expandedData.imageInfo}
          isEncapsulated={expandedData.isEncapsulated}
          annotations={
            multiAnnotations.get(
              viewportIdToSeriesKeyMap.get(expandedViewportId!) || expandedViewportId!
            ) || []
          }
          selectedAnnotationId={selectedAnnotationId}
          onAnnotationSelect={(id) =>
            handleAnnotationSelect(
              viewportIdToSeriesKeyMap.get(expandedViewportId!) || expandedViewportId!,
              id
            )
          }
          onAnnotationUpdate={(annotation) =>
            handleAnnotationUpdate(
              viewportIdToSeriesKeyMap.get(expandedViewportId!) || expandedViewportId!,
              annotation
            )
          }
          onAnnotationDelete={(id) =>
            handleAnnotationDelete(
              viewportIdToSeriesKeyMap.get(expandedViewportId!) || expandedViewportId!,
              id
            )
          }
          showAnnotations={showAnnotations}
        />
      )}

      {/* 컨트롤 */}
      {seriesMap.size > 0 && (
        <PlaybackControlBar
          isPlaying={isPlaying}
          fps={fps}
          onTogglePlay={togglePlay}
          onFpsChange={handleFpsChange}
          disabled={viewportStats.allStillImages}
          disabledMessage="모든 뷰포트가 정지 영상입니다"
          showAnnotationsToggle={true}
          showAnnotations={showAnnotations}
          onAnnotationsVisibilityChange={setShowAnnotations}
          playableCount={viewportStats.playableCount}
          stillCount={viewportStats.stillCount}
        />
      )}

      {/* 뷰포트 정보 */}
      {seriesMap.size > 0 && (
        <div className="mt-2.5 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {Array.from(seriesMap.entries()).map(([viewportId, series], idx) => (
            <div
              key={viewportId}
              className="p-2.5 bg-viewer-surface-alt rounded-md text-xs text-text-secondary border border-[#333]"
            >
              <div className="font-bold text-white mb-1.5 flex justify-between items-center">
                <span>Viewport {idx + 1}</span>
                {series.info.frameCount <= 1 ? (
                  <span className="text-xxs text-accent-warning bg-[#3a2a1a] px-1.5 py-0.5 rounded-sm">
                    정지 영상
                  </span>
                ) : (
                  <span
                    className={cn(
                      'text-xxs px-1.5 py-0.5 rounded-sm',
                      isPlaying
                        ? 'text-accent-success bg-[#1a3a1a]'
                        : 'text-text-muted bg-[#2a2a2a]'
                    )}
                  >
                    {isPlaying ? 'Playing' : 'Stopped'}
                  </span>
                )}
              </div>
              {series.info.seriesId && (
                <div className="font-mono text-[9px] text-[#6af] mb-1 break-all">
                  UID: ...{series.info.seriesId.slice(-25)}
                </div>
              )}
              <div className="flex justify-between">
                <span>Frames: {series.info.frameCount}</span>
                <span>
                  Size: {series.info.imageWidth}x{series.info.imageHeight}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
