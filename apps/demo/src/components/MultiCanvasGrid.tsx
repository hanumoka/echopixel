/**
 * MultiCanvasGrid 컴포넌트 (Multiple Canvas 방식)
 *
 * 학습 포인트:
 * - 각 뷰포트가 독립적인 Canvas/WebGL 컨텍스트를 가짐
 * - React 컴포넌트 모델과 자연스럽게 통합
 * - hover, 클릭 등 DOM 이벤트 처리 용이
 * - useImperativeHandle을 통한 외부 제어
 *
 * 장점 (vs Single Canvas):
 * - 개별 뷰포트 제어 용이 (hover, 클릭, 개별 컨트롤)
 * - React 상태 관리와 자연스럽게 통합
 * - 코드 재사용 (기존 DicomViewport 활용)
 *
 * 단점:
 * - WebGL 컨텍스트 여러 개 (브라우저 제한 8-16개)
 * - 메모리 사용량 증가
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  WadoRsDataSource,
  type LayoutType,
  type DicomMetadata,
} from '@echopixel/core';
import { DicomViewport, type DicomViewportHandle } from './DicomViewport';

/**
 * 뷰포트 슬롯 정보
 */
interface ViewportSlot {
  id: string;
  instanceUid: string;
  metadata?: DicomMetadata;
  isLoaded: boolean;
  error?: string;
}

/**
 * MultiCanvasGrid Props
 */
export interface MultiCanvasGridProps {
  /** 레이아웃 타입 */
  layout: LayoutType;
  /** WADO-RS DataSource */
  dataSource: WadoRsDataSource;
  /** Study Instance UID */
  studyUid: string;
  /** Series Instance UID */
  seriesUid: string;
  /** 로드할 Instance UID 목록 */
  instanceUids: string[];
  /** 개별 뷰포트 크기 */
  viewportSize?: number;
  /** 뷰포트 간 간격 */
  gap?: number;
}

/**
 * 동기화 모드
 */
type SyncMode = 'none' | 'frame-ratio' | 'absolute';

export function MultiCanvasGrid({
  layout,
  dataSource,
  studyUid,
  seriesUid,
  instanceUids,
  viewportSize = 256,
  gap = 4,
}: MultiCanvasGridProps) {
  // 그리드 크기 계산 - instanceUids 개수 기반으로 동적 계산
  // 1-2개: 2열, 3-4개: 2열, 5-6개: 3열, 7-9개: 3열, 10+개: 4열
  const viewportCount = instanceUids.length;
  const gridCols = viewportCount <= 2 ? 2 : viewportCount <= 4 ? 2 : viewportCount <= 6 ? 3 : viewportCount <= 9 ? 3 : 4;
  const maxSlots = viewportCount; // instanceUids 개수만큼 슬롯 생성

  // 뷰포트 슬롯 상태 - 초기화 시에만 설정 (key prop으로 컴포넌트가 재마운트됨)
  const [slots, setSlots] = useState<ViewportSlot[]>(() => {
    console.log(`[MultiCanvasGrid] Initial mount with ${instanceUids.length} slots`);
    return instanceUids.map((uid, idx) => ({
      id: `slot-${idx}`,
      instanceUid: uid,
      isLoaded: false,
    }));
  });
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [hoveredSlotId, setHoveredSlotId] = useState<string | null>(null);

  // 전체 제어 상태
  const [globalFps, setGlobalFps] = useState(30);
  const [isAllPlaying, setIsAllPlaying] = useState(false);
  const [syncMode, setSyncMode] = useState<SyncMode>('none');
  const [masterSlotId, setMasterSlotId] = useState<string | null>(null);

  // 뷰포트 refs (외부 제어용)
  const viewportRefs = useRef<Map<string, DicomViewportHandle | null>>(new Map());

  // ref 설정 콜백 - null이면 삭제하지 않고 유지 (언마운트 시 덮어쓰기 방지)
  const setViewportRef = useCallback((slotId: string, handle: DicomViewportHandle | null) => {
    if (handle) {
      viewportRefs.current.set(slotId, handle);
      console.log(`[MultiCanvasGrid] Ref set for ${slotId}, total refs: ${viewportRefs.current.size}`);
    }
    // null인 경우 삭제하지 않음 (언마운트 시 다른 뷰포트의 ref를 유지하기 위해)
  }, []);

  // 메타데이터 로드 콜백
  const handleMetadataLoaded = useCallback((slotId: string, metadata: DicomMetadata) => {
    setSlots(prev => prev.map(slot =>
      slot.id === slotId ? { ...slot, metadata, isLoaded: true } : slot
    ));
  }, []);

  // 에러 콜백
  const handleError = useCallback((slotId: string, error: Error) => {
    setSlots(prev => prev.map(slot =>
      slot.id === slotId ? { ...slot, error: error.message, isLoaded: false } : slot
    ));
  }, []);

  // === 전체 제어 함수 ===

  // 전체 재생
  const playAll = useCallback(() => {
    console.log(`[MultiCanvasGrid] playAll called, refs count: ${viewportRefs.current.size}`);
    let playedCount = 0;
    let skippedCount = 0;

    viewportRefs.current.forEach((handle, slotId) => {
      if (handle) {
        const state = handle.getState();
        console.log(`[MultiCanvasGrid] ${slotId}: totalFrames=${state.totalFrames}, currentFrame=${state.currentFrame}`);
        if (state.totalFrames > 1) {
          handle.play();
          playedCount++;
        } else {
          skippedCount++;
        }
      } else {
        console.warn(`[MultiCanvasGrid] ${slotId}: handle is null`);
      }
    });

    console.log(`[MultiCanvasGrid] Played: ${playedCount}, Skipped: ${skippedCount}`);
    setIsAllPlaying(true);
  }, []);

  // 전체 정지
  const pauseAll = useCallback(() => {
    viewportRefs.current.forEach((handle) => {
      if (handle) {
        handle.pause();
      }
    });
    setIsAllPlaying(false);
  }, []);

  // 전체 재생/정지 토글
  const toggleAllPlay = useCallback(() => {
    if (isAllPlaying) {
      pauseAll();
    } else {
      playAll();
    }
  }, [isAllPlaying, playAll, pauseAll]);

  // 전체 FPS 설정
  const setAllFps = useCallback((fps: number) => {
    const newFps = Math.max(1, Math.min(60, fps));
    setGlobalFps(newFps);
    viewportRefs.current.forEach((handle) => {
      if (handle) {
        handle.setFps(newFps);
      }
    });
  }, []);

  // === 동기화 함수 ===

  // 강제 동기화 (모든 뷰포트를 마스터 기준으로 동기화)
  const syncAllToMaster = useCallback(() => {
    const masterId = masterSlotId || slots.find(s => s.metadata && s.metadata.frameCount > 1)?.id;
    if (!masterId) return;

    const masterHandle = viewportRefs.current.get(masterId);
    if (!masterHandle) return;

    const masterState = masterHandle.getState();
    if (masterState.totalFrames <= 1) return;

    const masterRatio = masterState.currentFrame / (masterState.totalFrames - 1);

    viewportRefs.current.forEach((handle, slotId) => {
      if (handle && slotId !== masterId) {
        const state = handle.getState();
        if (state.totalFrames > 1) {
          if (syncMode === 'frame-ratio') {
            // 프레임 비율 기반 동기화
            const targetFrame = Math.round(masterRatio * (state.totalFrames - 1));
            handle.goToFrame(targetFrame);
          } else if (syncMode === 'absolute') {
            // 절대 프레임 동기화 (동일 프레임 번호)
            const targetFrame = Math.min(masterState.currentFrame, state.totalFrames - 1);
            handle.goToFrame(targetFrame);
          }
        }
      }
    });
  }, [masterSlotId, slots, syncMode]);

  // 모든 뷰포트를 첫 프레임으로
  const resetAllToFirstFrame = useCallback(() => {
    viewportRefs.current.forEach((handle) => {
      if (handle) {
        handle.pause();
        handle.goToFrame(0);
      }
    });
    setIsAllPlaying(false);
  }, []);

  // 통계 계산 (useEffect보다 먼저 선언되어야 함)
  const loadedCount = slots.filter(s => s.isLoaded).length;
  const playableSlots = slots.filter(s => s.metadata && s.metadata.frameCount > 1);

  // === 연속 동기화 (재생 중 자동 동기화) ===
  // syncMode가 'none'이 아니고 재생 중일 때 주기적으로 동기화 실행
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // 동기화 조건: syncMode가 활성화되어 있고, 재생 중이고, 영상이 2개 이상
    const shouldSync = syncMode !== 'none' && isAllPlaying && playableSlots.length >= 2;

    if (shouldSync) {
      // 동기화 간격: FPS에 맞춰 동기화 (프레임마다 동기화)
      const syncInterval = Math.max(16, Math.floor(1000 / globalFps)); // 최소 16ms (60fps)

      syncIntervalRef.current = setInterval(() => {
        const masterId = masterSlotId || playableSlots[0]?.id;
        if (!masterId) return;

        const masterHandle = viewportRefs.current.get(masterId);
        if (!masterHandle) return;

        const masterState = masterHandle.getState();
        if (masterState.totalFrames <= 1) return;

        // 마스터 프레임 비율 계산
        const masterRatio = masterState.currentFrame / Math.max(1, masterState.totalFrames - 1);

        viewportRefs.current.forEach((handle, slotId) => {
          if (handle && slotId !== masterId) {
            const state = handle.getState();
            if (state.totalFrames > 1) {
              let targetFrame: number;

              if (syncMode === 'frame-ratio') {
                // 비율 동기화
                targetFrame = Math.round(masterRatio * (state.totalFrames - 1));
              } else {
                // 절대 동기화
                targetFrame = Math.min(masterState.currentFrame, state.totalFrames - 1);
              }

              // 현재 프레임과 다를 때만 이동 (불필요한 렌더링 방지)
              if (state.currentFrame !== targetFrame) {
                handle.goToFrame(targetFrame);
              }
            }
          }
        });
      }, syncInterval);

      console.log(`[Sync] Started continuous sync (interval: ${syncInterval}ms, mode: ${syncMode})`);
    }

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
        console.log('[Sync] Stopped continuous sync');
      }
    };
  }, [syncMode, isAllPlaying, globalFps, masterSlotId, playableSlots]);
  const playableCount = playableSlots.length;
  const stillCount = slots.filter(s => s.isLoaded && (!s.metadata || s.metadata.frameCount <= 1)).length;
  const errorCount = slots.filter(s => s.error).length;

  // WebGL 컨텍스트 제한 경고 (보통 8-16개)
  const webglContextWarning = viewportCount > 8;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* WebGL 컨텍스트 제한 경고 */}
      {webglContextWarning && (
        <div style={{
          padding: '10px 12px',
          background: '#4a3a1a',
          border: '1px solid #a84',
          borderRadius: '4px',
          color: '#fa8',
          fontSize: '12px',
        }}>
          ⚠️ <strong>WebGL 컨텍스트 제한 경고:</strong> 브라우저는 보통 8-16개의 WebGL 컨텍스트만 지원합니다.
          현재 {viewportCount}개 뷰포트를 사용 중이며, 일부 뷰포트가 정상 동작하지 않을 수 있습니다.
          더 많은 뷰포트가 필요하면 <strong>Multi (Single Canvas)</strong> 모드를 사용하세요.
        </div>
      )}

      {/* 상태 표시 */}
      <div style={{
        padding: '8px 12px',
        background: '#2a2a2a',
        color: '#fff',
        borderRadius: '4px',
        fontSize: '13px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>
          Multi-Canvas Grid ({viewportCount}개, {gridCols}열) | {loadedCount}/{slots.length} loaded
        </span>
        <div style={{ display: 'flex', gap: '15px', fontSize: '12px' }}>
          <span style={{ color: '#8f8' }}>영상: {playableCount}개</span>
          {stillCount > 0 && <span style={{ color: '#fa8' }}>정지: {stillCount}개</span>}
          {errorCount > 0 && <span style={{ color: '#f66' }}>오류: {errorCount}개</span>}
        </div>
        {activeSlotId && (
          <span style={{ color: '#8cf' }}>
            Active: {activeSlotId}
          </span>
        )}
      </div>

      {/* === 전체 제어 패널 === */}
      <div style={{
        padding: '12px',
        background: '#1a2a1a',
        border: '1px solid #4a7',
        borderRadius: '4px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          {/* 전체 재생/정지 */}
          <button
            onClick={toggleAllPlay}
            disabled={playableCount === 0}
            style={{
              padding: '8px 20px',
              fontSize: '14px',
              background: playableCount === 0 ? '#555' : (isAllPlaying ? '#c44' : '#4c4'),
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: playableCount === 0 ? 'not-allowed' : 'pointer',
              minWidth: '120px',
              fontWeight: 'bold',
            }}
          >
            {isAllPlaying ? '⏸ 전체 정지' : '▶ 전체 재생'}
          </button>

          {/* 전체 FPS */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ color: '#8f8', fontSize: '13px' }}>전체 FPS:</label>
            <input
              type="number"
              min={1}
              max={60}
              value={globalFps}
              onChange={(e) => setAllFps(Number(e.target.value))}
              style={{ width: '50px', padding: '4px', fontSize: '13px' }}
            />
            <input
              type="range"
              min={1}
              max={60}
              value={globalFps}
              onChange={(e) => setAllFps(Number(e.target.value))}
              style={{ width: '100px' }}
            />
          </div>

          {/* 첫 프레임으로 */}
          <button
            onClick={resetAllToFirstFrame}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              background: '#444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            ⏮ 처음으로
          </button>
        </div>

        {/* 동기화 설정 */}
        <div style={{
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: '1px solid #3a5a3a',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          <span style={{ color: '#8cf', fontSize: '13px', fontWeight: 'bold' }}>동기화:</span>

          {/* 동기화 모드 선택 */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['none', 'frame-ratio', 'absolute'] as SyncMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setSyncMode(mode)}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  background: syncMode === mode ? '#47a' : '#333',
                  color: '#fff',
                  border: syncMode === mode ? '1px solid #8cf' : '1px solid #555',
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
              >
                {mode === 'none' ? '끔' : mode === 'frame-ratio' ? '비율 동기화' : '절대 동기화'}
              </button>
            ))}
          </div>

          {/* 마스터 뷰포트 선택 */}
          {syncMode !== 'none' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ color: '#888', fontSize: '12px' }}>마스터:</label>
              <select
                value={masterSlotId || ''}
                onChange={(e) => setMasterSlotId(e.target.value || null)}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  background: '#2a2a3a',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                }}
              >
                <option value="">자동 (첫 번째 영상)</option>
                {playableSlots.map((slot, idx) => (
                  <option key={slot.id} value={slot.id}>
                    #{slots.indexOf(slot) + 1} ({slot.metadata?.frameCount}f)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 강제 동기화 버튼 */}
          {syncMode !== 'none' && (
            <button
              onClick={syncAllToMaster}
              disabled={playableCount < 2}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                background: playableCount < 2 ? '#555' : '#a47',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: playableCount < 2 ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
              }}
            >
              🔄 지금 동기화
            </button>
          )}
        </div>

        {/* 동기화 설명 */}
        {syncMode !== 'none' && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#888' }}>
            {syncMode === 'frame-ratio'
              ? '비율 동기화: 마스터의 프레임 비율에 맞춰 다른 뷰포트의 프레임을 조정합니다. (예: 마스터 50% → 다른 뷰포트도 50%)'
              : '절대 동기화: 마스터와 동일한 프레임 번호로 이동합니다. (프레임 수가 다르면 마지막 프레임에서 멈춤)'}
          </div>
        )}
      </div>

      {/* 그리드 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gap: `${gap}px`,
        background: '#111',
        padding: `${gap}px`,
        borderRadius: '4px',
      }}>
        {slots.map((slot, index) => {
          const isActive = activeSlotId === slot.id;
          const isHovered = hoveredSlotId === slot.id;
          const isMaster = syncMode !== 'none' && (masterSlotId === slot.id || (!masterSlotId && playableSlots[0]?.id === slot.id));

          return (
            <div
              key={slot.id}
              onMouseEnter={() => setHoveredSlotId(slot.id)}
              onMouseLeave={() => setHoveredSlotId(null)}
              onClick={() => setActiveSlotId(slot.id)}
              style={{
                position: 'relative',
                cursor: 'pointer',
                border: isMaster
                  ? '3px solid #fa8'
                  : isActive
                  ? '3px solid #4cf'
                  : isHovered
                  ? '2px solid rgba(100, 200, 255, 0.7)'
                  : '1px solid #333',
                borderRadius: '4px',
                overflow: 'hidden',
                background: isHovered ? 'rgba(100, 200, 255, 0.05)' : '#000',
                transition: 'border 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
                boxSizing: 'border-box',
                boxShadow: isHovered ? '0 0 10px rgba(100, 200, 255, 0.3)' : 'none',
              }}
            >
              {/* DicomViewport - ref로 외부 제어 가능 */}
              {/* viewportId: Tool System에서 각 뷰포트를 구분하기 위한 고유 ID */}
              <DicomViewport
                ref={(handle) => setViewportRef(slot.id, handle)}
                viewportId={slot.id}
                dataSource={dataSource}
                instanceId={{
                  studyInstanceUid: studyUid,
                  seriesInstanceUid: seriesUid,
                  sopInstanceUid: slot.instanceUid,
                }}
                width={viewportSize}
                height={viewportSize}
                onMetadataLoaded={(metadata) => handleMetadataLoaded(slot.id, metadata)}
                onError={(err) => handleError(slot.id, err)}
              />

              {/* 뷰포트 번호 오버레이 */}
              <div style={{
                position: 'absolute',
                top: '4px',
                left: '4px',
                padding: '2px 6px',
                background: 'rgba(0, 0, 0, 0.7)',
                color: isMaster ? '#fa8' : isActive ? '#4cf' : '#fff',
                fontSize: '11px',
                borderRadius: '3px',
                fontWeight: (isActive || isMaster) ? 'bold' : 'normal',
              }}>
                #{index + 1} {isMaster && '(M)'}
              </div>

              {/* 호버 시 UID 표시 */}
              {isHovered && (
                <div style={{
                  position: 'absolute',
                  bottom: '4px',
                  left: '4px',
                  right: '4px',
                  padding: '4px 6px',
                  background: 'rgba(0, 0, 0, 0.85)',
                  color: '#8cf',
                  fontSize: '9px',
                  fontFamily: 'monospace',
                  borderRadius: '3px',
                  wordBreak: 'break-all',
                }}>
                  UID: ...{slot.instanceUid.slice(-25)}
                </div>
              )}

              {/* 타입 배지 */}
              {slot.metadata && (
                <div style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  padding: '2px 6px',
                  background: slot.metadata.frameCount > 1
                    ? 'rgba(100, 255, 100, 0.2)'
                    : 'rgba(255, 170, 100, 0.2)',
                  color: slot.metadata.frameCount > 1 ? '#8f8' : '#fa8',
                  fontSize: '9px',
                  borderRadius: '3px',
                }}>
                  {slot.metadata.frameCount > 1
                    ? `${slot.metadata.frameCount}f`
                    : '정지'}
                </div>
              )}

              {/* 에러 표시 */}
              {slot.error && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  padding: '8px 12px',
                  background: 'rgba(150, 50, 50, 0.9)',
                  color: '#fff',
                  fontSize: '11px',
                  borderRadius: '4px',
                  textAlign: 'center',
                  maxWidth: '80%',
                }}>
                  Error
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 선택된 뷰포트 상세 정보 */}
      {activeSlotId && (() => {
        const activeSlot = slots.find(s => s.id === activeSlotId);
        if (!activeSlot) return null;

        return (
          <div style={{
            padding: '12px',
            background: '#1a2a3a',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '12px',
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#8cf' }}>
              Selected: Viewport #{slots.findIndex(s => s.id === activeSlotId) + 1}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              <div>
                <span style={{ color: '#888' }}>Instance UID: </span>
                <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                  ...{activeSlot.instanceUid.slice(-30)}
                </span>
              </div>
              {activeSlot.metadata && (
                <>
                  <div>
                    <span style={{ color: '#888' }}>Size: </span>
                    {activeSlot.metadata.imageInfo.columns} x {activeSlot.metadata.imageInfo.rows}
                  </div>
                  <div>
                    <span style={{ color: '#888' }}>Frames: </span>
                    {activeSlot.metadata.frameCount}
                  </div>
                  <div>
                    <span style={{ color: '#888' }}>Type: </span>
                    {activeSlot.metadata.frameCount > 1 ? '영상 (Cine)' : '정지 영상'}
                  </div>
                </>
              )}
              {activeSlot.error && (
                <div style={{ gridColumn: '1 / -1', color: '#f88' }}>
                  <span style={{ color: '#888' }}>Error: </span>
                  {activeSlot.error}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 안내 */}
      <div style={{
        padding: '8px 12px',
        background: '#1a1a2a',
        borderRadius: '4px',
        fontSize: '11px',
        color: '#888',
      }}>
        <strong>개별 제어:</strong> 각 뷰포트를 클릭하여 선택하고, 개별적으로 재생/정지 및 W/L 조정이 가능합니다.
        <br />
        <strong>전체 제어:</strong> 위 패널에서 모든 뷰포트를 한번에 재생/정지하고, FPS를 설정할 수 있습니다.
        <br />
        <strong>동기화:</strong> 비율 동기화는 프레임 비율 기준, 절대 동기화는 프레임 번호 기준으로 맞춥니다.
      </div>
    </div>
  );
}
