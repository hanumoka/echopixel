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
  type SingleDicomViewerGroupHandle,
  type ViewerData,
} from '@echopixel/react';
import { WadoConfigPanel, InstanceSelector, PlaybackControlBar } from '../components';
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
    await scanInstances(wadoConfig);
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
      <div
        style={{
          padding: '15px',
          marginBottom: '15px',
          background: '#1f2d3d',
          border: '1px solid #47a',
          borderRadius: '4px',
        }}
      >
        <h3 style={{ margin: '0 0 10px 0', color: '#b4d8f8', fontSize: '16px' }}>
          🔲 Multi (Multi Canvas)
        </h3>
        <p style={{ margin: 0, color: '#a8b8c8', fontSize: '13px', lineHeight: '1.5' }}>
          각 뷰포트마다 <strong>별도의 Canvas와 WebGL Context</strong>를 생성합니다.
          구현이 단순하지만 브라우저 제한으로 <strong>최대 8~16개</strong> Context만 동시 사용 가능합니다.
          16개 이상 뷰포트가 필요한 경우 Multi (Single Canvas) 모드를 사용하세요.
        </p>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div
          style={{
            padding: '15px',
            marginBottom: '15px',
            background: '#3a1a1a',
            border: '1px solid #a44',
            borderRadius: '4px',
            color: '#f88',
          }}
        >
          Error: {error}
        </div>
      )}

      {/* 설정 패널 */}
      <div
        style={{
          padding: '15px',
          marginBottom: '15px',
          background: '#1a1a2a',
          border: '1px solid #47a',
          borderRadius: '4px',
        }}
      >
        <h3 style={{ margin: '0 0 15px 0', color: '#8cf', fontSize: '16px' }}>WADO-RS 설정</h3>

        <div
          style={{
            display: 'grid',
            gap: '10px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          }}
        >
          <div>
            <label style={{ display: 'block', color: '#8cf', marginBottom: '5px', fontSize: '13px' }}>
              DICOM Web Base URL
            </label>
            <input
              type="text"
              value={wadoConfig.baseUrl}
              onChange={(e) => onWadoConfigChange({ ...wadoConfig, baseUrl: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '13px',
                background: '#2a2a3a',
                border: '1px solid #555',
                borderRadius: '4px',
                color: '#fff',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', color: '#8cf', marginBottom: '5px', fontSize: '13px' }}>
              Study Instance UID
            </label>
            <input
              type="text"
              value={wadoConfig.studyUid}
              onChange={(e) => onWadoConfigChange({ ...wadoConfig, studyUid: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '13px',
                background: '#2a2a3a',
                border: '1px solid #555',
                borderRadius: '4px',
                color: '#fff',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', color: '#8cf', marginBottom: '5px', fontSize: '13px' }}>
              Series Instance UID
            </label>
            <input
              type="text"
              value={wadoConfig.seriesUid}
              onChange={(e) => onWadoConfigChange({ ...wadoConfig, seriesUid: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '13px',
                background: '#2a2a3a',
                border: '1px solid #555',
                borderRadius: '4px',
                color: '#fff',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', color: '#8cf', marginBottom: '5px', fontSize: '13px' }}>
              뷰포트 개수: {viewportCount}개 ({gridDimensions.cols}×{gridDimensions.rows})
            </label>
            <input
              type="range"
              min="1"
              max="16"
              value={Math.min(viewportCount, 16)}
              onChange={(e) => setViewportCount(Number(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: '#888',
                marginTop: '2px',
              }}
            >
              <span>1</span>
              <span>8</span>
              <span>16</span>
            </div>
          </div>
        </div>

        {/* 액션 버튼들 */}
        <div style={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleScan}
            disabled={!!scanningStatus}
            style={{
              padding: '10px 20px',
              background: scanningStatus ? '#555' : '#47a',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: scanningStatus ? 'not-allowed' : 'pointer',
              fontSize: '14px',
            }}
          >
            {scanningStatus || 'Instance 스캔'}
          </button>

          <button
            onClick={handleLoad}
            disabled={selectedUids.size === 0 || !!scanningStatus || loading}
            style={{
              padding: '10px 20px',
              background: selectedUids.size === 0 || loading ? '#555' : '#4a7',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: selectedUids.size === 0 || loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
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
            onToggle={toggleSelection}
            onSelectAllPlayable={() => selectAllPlayable(viewportCount)}
            onClearSelection={clearSelection}
            maxHeight="200px"
            style={{ marginTop: '15px' }}
          />
        )}
      </div>

      {/* SingleDicomViewerGroup 렌더링 */}
      {viewers.length > 0 && (
        <div style={{ marginTop: '15px' }}>
          {/* 상태 표시 바 */}
          <div
            style={{
              padding: '8px 12px',
              marginBottom: '10px',
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
              Multi-Canvas ({viewportCount}개, {gridDimensions.cols}×{gridDimensions.rows}) |{' '}
              {viewers.length} loaded
            </span>
            <span style={{ color: '#8f8' }}>FPS: {fps}</span>
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
            style={{ marginTop: '10px' }}
          />

          {/* 뷰포트 정보 그리드 */}
          <div
            style={{
              marginTop: '10px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '8px',
            }}
          >
            {viewers.map((viewer, idx) => (
              <div
                key={viewer.id}
                style={{
                  padding: '10px',
                  background: '#1a1a1a',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: '#aaa',
                  border: '1px solid #333',
                }}
              >
                <div
                  style={{
                    fontWeight: 'bold',
                    color: '#fff',
                    marginBottom: '6px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>Viewport {idx + 1}</span>
                  {viewer.frames.length <= 1 ? (
                    <span
                      style={{
                        fontSize: '10px',
                        color: '#fa8',
                        background: '#3a2a1a',
                        padding: '2px 6px',
                        borderRadius: '3px',
                      }}
                    >
                      정지 영상
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '10px',
                        color: isPlaying ? '#8f8' : '#888',
                        background: isPlaying ? '#1a3a1a' : '#2a2a2a',
                        padding: '2px 6px',
                        borderRadius: '3px',
                      }}
                    >
                      {isPlaying ? 'Playing' : 'Stopped'}
                    </span>
                  )}
                </div>
                {viewer.label && (
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '9px',
                      color: '#6af',
                      marginBottom: '4px',
                      wordBreak: 'break-all',
                    }}
                  >
                    UID: ...{viewer.label.slice(-25)}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
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
        <div
          style={{
            padding: '40px',
            background: '#1a1a2a',
            borderRadius: '4px',
            textAlign: 'center',
            color: '#8cf',
          }}
        >
          <div style={{ fontSize: '20px', marginBottom: '10px' }}>⏳</div>
          DICOM 데이터를 로딩 중입니다...
        </div>
      )}

      {/* 스캔 전 안내 */}
      {scannedInstances.length === 0 && !scanningStatus && viewers.length === 0 && (
        <div
          style={{
            padding: '20px',
            background: '#1a1a2a',
            borderRadius: '4px',
            textAlign: 'center',
            color: '#888',
          }}
        >
          'Instance 스캔' 버튼을 클릭하여 Series 내 Instance를 조회하세요.
          <br />
          스캔 후 로드할 Instance를 선택하면 자동으로 뷰포트가 생성됩니다.
        </div>
      )}
    </div>
  );
}
