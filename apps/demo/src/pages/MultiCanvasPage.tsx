/**
 * Multi Canvas 페이지 (Multiple Canvas)
 * - 각 뷰포트마다 별도 Canvas 및 WebGL Context
 * - SingleDicomViewerGroup 사용
 * - 최대 8~16개 Context 제한
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { type Annotation } from '@echopixel/core';
import {
  SingleDicomViewerGroup,
  DEFAULT_TOOLS,
  cn,
  type SingleDicomViewerGroupHandle,
  type ViewerData,
} from '@echopixel/react';
import { InstanceSelector, PlaybackControlBar } from '../components';
import { useWadoLoader, useInstanceScanner } from '../hooks';
import type { WadoConfig } from '../types/demo';
import { calculateGridDimensions } from '../types/demo';

interface MultiCanvasPageProps {
  wadoConfig: WadoConfig;
  onWadoConfigChange: (config: WadoConfig) => void;
}

export function MultiCanvasPage({ wadoConfig, onWadoConfigChange }: MultiCanvasPageProps) {
  // 뷰포트 개수 (최대 16개)
  const [viewportCount, setViewportCount] = useState(4);

  // 뷰어 데이터
  const [viewers, setViewers] = useState<ViewerData[]>([]);
  const [loading, setLoading] = useState(false);
  const groupRef = useRef<SingleDicomViewerGroupHandle>(null);

  // 재생 상태
  const [fps, setFps] = useState(30);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);

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
  const { loadMultipleAsViewerData, error: loadError } = useWadoLoader();

  const error = scanError || loadError;
  const gridDimensions = calculateGridDimensions(viewportCount);

  // 영상/정지 통계
  const stats = useMemo(() => {
    const playableCount = viewers.filter((v) => v.imageInfo && v.frames.length > 1).length;
    const stillCount = viewers.length - playableCount;
    return { playableCount, stillCount, allStillImages: playableCount === 0 };
  }, [viewers]);

  // Instance 스캔
  const handleScan = async () => {
    await scanInstances(wadoConfig, viewportCount);
  };

  // 데이터 로드
  const handleLoad = async () => {
    setLoading(true);
    setViewers([]);

    const instanceUids = Array.from(selectedUids).slice(0, viewportCount);
    const loadedViewers = await loadMultipleAsViewerData(wadoConfig, instanceUids);

    setViewers(loadedViewers);
    setLoading(false);
  };

  // 재생 토글
  const togglePlay = useCallback(() => {
    if (groupRef.current) {
      groupRef.current.togglePlayAll();
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  // FPS 변경
  const handleFpsChange = useCallback((newFps: number) => {
    setFps(newFps);
    if (groupRef.current) {
      groupRef.current.setFpsAll(newFps);
    }
  }, []);

  // 어노테이션 핸들러
  const handleAnnotationUpdate = useCallback((viewerId: string, annotation: Annotation) => {
    setViewers((prev) =>
      prev.map((viewer) => {
        if (viewer.id !== viewerId) return viewer;

        const existingAnnotations = viewer.annotations || [];
        const existingIndex = existingAnnotations.findIndex((a) => a.id === annotation.id);

        if (existingIndex >= 0) {
          const updated = [...existingAnnotations];
          updated[existingIndex] = annotation;
          return { ...viewer, annotations: updated };
        } else {
          return { ...viewer, annotations: [...existingAnnotations, annotation] };
        }
      })
    );
  }, []);

  const handleAnnotationDelete = useCallback((viewerId: string, annotationId: string) => {
    setViewers((prev) =>
      prev.map((viewer) => {
        if (viewer.id !== viewerId) return viewer;
        return {
          ...viewer,
          annotations: (viewer.annotations || []).filter((a) => a.id !== annotationId),
        };
      })
    );
  }, []);

  return (
    <div>
      {/* 모드 설명 패널 */}
      <div className="p-4 mb-4 bg-[#1f2d3d] border border-[#47a] rounded-md">
        <h3 className="m-0 mb-2.5 text-[#b4d8f8] text-lg">
          🔲 Multi (Multi Canvas)
        </h3>
        <p className="m-0 text-[#a8b8c8] text-base leading-relaxed">
          각 뷰포트마다 <strong>별도의 Canvas와 WebGL Context</strong>를 생성합니다.
          구현이 단순하지만 브라우저 제한으로 <strong>최대 8~16개</strong> Context만 동시 사용 가능합니다.
          16개 이상 뷰포트가 필요한 경우 Multi (Single Canvas) 모드를 사용하세요.
        </p>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="p-4 mb-4 bg-[#3a1a1a] border border-[#a44] rounded-md text-[#f88]">
          Error: {error}
        </div>
      )}

      {/* 설정 패널 */}
      <div className="p-4 mb-4 bg-[#1a1a2a] border border-[#47a] rounded-md">
        <h3 className="m-0 mb-4 text-accent-info text-lg">WADO-RS 설정</h3>

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
              max="16"
              value={Math.min(viewportCount, 16)}
              onChange={(e) => setViewportCount(Number(e.target.value))}
              className="w-full cursor-pointer"
            />
            <div className="flex justify-between text-xs text-text-muted mt-0.5">
              <span>1</span>
              <span>8</span>
              <span>16</span>
            </div>
          </div>
        </div>

        {/* 액션 버튼들 */}
        <div className="mt-4 flex gap-2.5 flex-wrap">
          <button
            onClick={handleScan}
            disabled={!!scanningStatus}
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
            disabled={selectedUids.size === 0 || !!scanningStatus || loading}
            className={cn(
              'px-5 py-2.5 text-white border-none rounded-md text-lg font-bold',
              selectedUids.size === 0 || loading
                ? 'bg-text-disabled cursor-not-allowed'
                : 'bg-[#4a7] cursor-pointer hover:bg-[#5b8]'
            )}
          >
            {loading ? '로딩 중...' : `로드 (${Math.min(selectedUids.size, viewportCount)}개)`}
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
            maxHeight="200px"
            className="mt-4"
          />
        )}
      </div>

      {/* SingleDicomViewerGroup 렌더링 */}
      {viewers.length > 0 && (
        <div className="mt-4">
          {/* 상태 표시 바 */}
          <div className="px-3 py-2 mb-2.5 bg-[#2a2a2a] text-white rounded-md text-base flex justify-between items-center">
            <span>
              Multi-Canvas ({viewportCount}개, {gridDimensions.cols}×{gridDimensions.rows}) |{' '}
              {viewers.length} loaded
            </span>
            <span className="text-accent-success">FPS: {fps}</span>
          </div>

          {/* SingleDicomViewerGroup */}
          <SingleDicomViewerGroup
            ref={groupRef}
            viewers={viewers}
            viewportCount={viewportCount}
            width={1320}
            minViewerHeight={510}
            gap={8}
            fps={fps}
            selectable={true}
            enableDoubleClickExpand={true}
            toolbarTools={DEFAULT_TOOLS}
            viewerOptions={{
              showToolbar: true,
              showStatusBar: true,
              showControls: true,
              toolbarCompact: true,
              showAnnotations,
            }}
            onAnnotationUpdate={handleAnnotationUpdate}
            onAnnotationDelete={handleAnnotationDelete}
          />

          {/* 컨트롤 패널 */}
          <PlaybackControlBar
            isPlaying={isPlaying}
            fps={fps}
            onTogglePlay={togglePlay}
            onFpsChange={handleFpsChange}
            disabled={stats.allStillImages}
            disabledMessage="모든 뷰포트가 정지 영상입니다"
            showResetButtons={true}
            onReset={() => groupRef.current?.resetFrameAll()}
            onResetViewport={() => groupRef.current?.resetViewportAll()}
            showAnnotationsToggle={true}
            showAnnotations={showAnnotations}
            onAnnotationsVisibilityChange={setShowAnnotations}
            playableCount={stats.playableCount}
            stillCount={stats.stillCount}
            className="mt-2.5"
          />

          {/* 뷰포트 정보 그리드 */}
          <div className="mt-2.5 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {viewers.map((viewer, idx) => (
              <div
                key={viewer.id}
                className="p-2.5 bg-viewer-surface-alt rounded-md text-xs text-text-secondary border border-[#333]"
              >
                <div className="font-bold text-white mb-1.5 flex justify-between items-center">
                  <span>Viewport {idx + 1}</span>
                  {viewer.frames.length <= 1 ? (
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
                {viewer.label && (
                  <div className="font-mono text-[9px] text-[#6af] mb-1 break-all">
                    UID: ...{viewer.label.slice(-25)}
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Frames: {viewer.frames.length}</span>
                  <span>
                    Size: {viewer.imageInfo.columns}x{viewer.imageInfo.rows}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 로딩 상태 표시 */}
      {loading && (
        <div className="p-10 bg-[#1a1a2a] rounded-md text-center text-accent-info">
          <div className="text-xl mb-2.5">⏳</div>
          DICOM 데이터를 로딩 중입니다...
        </div>
      )}

      {/* 스캔 전 안내 */}
      {scannedInstances.length === 0 && !scanningStatus && viewers.length === 0 && (
        <div className="p-5 bg-[#1a1a2a] rounded-md text-center text-text-muted">
          'Instance 스캔' 버튼을 클릭하여 Series 내 Instance를 조회하세요.
          <br />
          스캔 후 로드할 Instance를 선택하면 자동으로 뷰포트가 생성됩니다.
        </div>
      )}
    </div>
  );
}
