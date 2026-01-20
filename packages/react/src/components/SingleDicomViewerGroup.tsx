import {
  useState,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
  useMemo,
  type CSSProperties,
} from 'react';
import type { DicomImageInfo } from '@echopixel/core';
import {
  SingleDicomViewer,
  type SingleDicomViewerHandle,
  type SingleDicomViewerProps,
} from './SingleDicomViewer';

/**
 * 뷰어 데이터 (각 뷰포트에 표시할 DICOM 데이터)
 */
export interface ViewerData {
  /** 고유 ID */
  id: string;
  /** 프레임 데이터 배열 */
  frames: Uint8Array[];
  /** 이미지 정보 */
  imageInfo: DicomImageInfo;
  /** 압축 여부 */
  isEncapsulated: boolean;
  /** 라벨 (선택적, 뷰포트에 표시) */
  label?: string;
}

/**
 * 레이아웃 타입
 */
export type ViewerGroupLayout = '1x1' | '2x2' | '3x3' | '4x4' | '1x2' | '2x1';

/**
 * SingleDicomViewerGroup 외부 제어용 핸들
 */
export interface SingleDicomViewerGroupHandle {
  /** 모든 뷰어 재생 */
  playAll: () => void;
  /** 모든 뷰어 정지 */
  pauseAll: () => void;
  /** 모든 뷰어 재생/정지 토글 */
  togglePlayAll: () => void;
  /** 모든 뷰어 FPS 설정 */
  setFpsAll: (fps: number) => void;
  /** 모든 뷰어 첫 프레임으로 이동 */
  resetFrameAll: () => void;
  /** 모든 뷰어 뷰포트 리셋 (W/L, Pan, Zoom) */
  resetViewportAll: () => void;
  /** 특정 뷰어 핸들 가져오기 */
  getViewerHandle: (id: string) => SingleDicomViewerHandle | null;
  /** 선택된 뷰어 ID */
  getSelectedId: () => string | null;
  /** 뷰어 선택 */
  selectViewer: (id: string | null) => void;
}

/**
 * SingleDicomViewerGroup Props
 */
export interface SingleDicomViewerGroupProps {
  /** 뷰어 데이터 배열 */
  viewers: ViewerData[];
  /** 레이아웃 (기본: 데이터 수에 따라 자동) */
  layout?: ViewerGroupLayout;
  /** 컨테이너 너비 (픽셀) */
  width?: number;
  /** 컨테이너 높이 (픽셀) */
  height?: number;
  /** 뷰어 간 간격 (픽셀) */
  gap?: number;
  /** 공통 FPS */
  fps?: number;
  /**
   * 동기 재생 의도 표시 (현재 힌트용, 향후 프레임 동기화 기능 예정)
   *
   * 참고: 개별 컨트롤 표시 여부는 viewerOptions.showControls로 제어
   * 그룹 컨트롤(playAll, pauseAll 등)은 ref를 통해 항상 사용 가능
   *
   * @example 개별 + 그룹 모두 사용
   * ```tsx
   * <SingleDicomViewerGroup ref={groupRef} viewers={viewers} />
   * // 개별: 각 뷰어 UI로 제어, 그룹: ref.playAll() 등
   * ```
   *
   * @example 그룹만 사용 (개별 컨트롤 숨김)
   * ```tsx
   * <SingleDicomViewerGroup
   *   ref={groupRef}
   *   viewers={viewers}
   *   viewerOptions={{ showControls: false }}
   * />
   * ```
   */
  syncPlayback?: boolean;
  /** 개별 뷰어 옵션 (SingleDicomViewerProps 중 일부) */
  viewerOptions?: Partial<Pick<
    SingleDicomViewerProps,
    | 'showStatusBar'
    | 'showControls'
    | 'showToolInfo'
    | 'showToolbar'
    | 'toolbarTools'
    | 'toolbarOrientation'
    | 'toolbarCompact'
  >>;
  /** 뷰어 선택 가능 여부 */
  selectable?: boolean;
  /** 선택된 뷰어 ID (controlled) */
  selectedId?: string | null;
  /** 뷰어 선택 변경 콜백 */
  onSelectChange?: (id: string | null) => void;
  /** 커스텀 스타일 */
  style?: CSSProperties;
  /** 커스텀 클래스명 */
  className?: string;
}

/**
 * 레이아웃에서 행/열 수 계산
 */
function getLayoutDimensions(layout: ViewerGroupLayout): { rows: number; cols: number } {
  switch (layout) {
    case '1x1': return { rows: 1, cols: 1 };
    case '1x2': return { rows: 1, cols: 2 };
    case '2x1': return { rows: 2, cols: 1 };
    case '2x2': return { rows: 2, cols: 2 };
    case '3x3': return { rows: 3, cols: 3 };
    case '4x4': return { rows: 4, cols: 4 };
    default: return { rows: 2, cols: 2 };
  }
}

/**
 * 뷰어 수에 따라 자동 레이아웃 결정
 */
function getAutoLayout(count: number): ViewerGroupLayout {
  if (count <= 1) return '1x1';
  if (count <= 2) return '1x2';
  if (count <= 4) return '2x2';
  if (count <= 9) return '3x3';
  return '4x4';
}

/**
 * SingleDicomViewerGroup
 *
 * 다중 SingleDicomViewer를 그리드로 배치하는 컴포넌트.
 * 각 뷰어는 독립적인 WebGL 캔버스와 컨트롤을 가집니다.
 *
 * 특징:
 * - 각 뷰어별 독립 캔버스 (WebGL 컨텍스트 제한 주의: ~8개)
 * - 개별 컨트롤 + 그룹 컨트롤 유연하게 선택 가능
 * - 뷰어 선택 기능
 * - 그룹 레벨 제어 (전체 재생/정지/리셋)
 *
 * 컨트롤 옵션:
 * - 개별 컨트롤: viewerOptions.showControls (기본 true)
 * - 그룹 컨트롤: ref를 통해 항상 사용 가능 (playAll, pauseAll 등)
 *
 * @example 개별 + 그룹 모두 사용 (기본)
 * ```tsx
 * const groupRef = useRef<SingleDicomViewerGroupHandle>(null);
 *
 * <SingleDicomViewerGroup
 *   ref={groupRef}
 *   viewers={viewers}
 *   layout="2x2"
 * />
 * // 개별: 각 뷰어 UI 컨트롤 사용
 * // 그룹: groupRef.current?.playAll() 등
 * ```
 *
 * @example 그룹 컨트롤만 사용
 * ```tsx
 * <SingleDicomViewerGroup
 *   ref={groupRef}
 *   viewers={viewers}
 *   viewerOptions={{ showControls: false }}  // 개별 컨트롤 숨김
 * />
 * <button onClick={() => groupRef.current?.playAll()}>Play All</button>
 * ```
 */
export const SingleDicomViewerGroup = forwardRef<
  SingleDicomViewerGroupHandle,
  SingleDicomViewerGroupProps
>(function SingleDicomViewerGroup(
  {
    viewers,
    layout: propLayout,
    width = 800,
    height = 600,
    gap = 4,
    fps = 30,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    syncPlayback = false, // 향후 프레임 동기화 기능 예정 (현재 미사용)
    viewerOptions = {},
    selectable = false,
    selectedId: controlledSelectedId,
    onSelectChange,
    style,
    className,
  },
  ref
) {
  // 내부 선택 상태 (uncontrolled 모드용)
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);

  // 선택된 ID (controlled vs uncontrolled)
  const selectedId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;

  // 뷰어 핸들 refs
  const viewerRefs = useRef<Map<string, SingleDicomViewerHandle>>(new Map());

  // 레이아웃 계산
  const layout = propLayout ?? getAutoLayout(viewers.length);
  const { rows, cols } = getLayoutDimensions(layout);

  // 개별 뷰어 크기 계산
  const viewerSize = useMemo(() => {
    const totalGapX = gap * (cols - 1);
    const totalGapY = gap * (rows - 1);
    const viewerWidth = Math.floor((width - totalGapX) / cols);
    const viewerHeight = Math.floor((height - totalGapY) / rows);
    return { width: viewerWidth, height: viewerHeight };
  }, [width, height, gap, rows, cols]);

  // 뷰어 선택 핸들러
  const handleSelect = useCallback((id: string) => {
    if (!selectable) return;

    const newId = selectedId === id ? null : id;
    if (controlledSelectedId === undefined) {
      setInternalSelectedId(newId);
    }
    onSelectChange?.(newId);
  }, [selectable, selectedId, controlledSelectedId, onSelectChange]);

  // ref 등록 콜백
  const registerRef = useCallback((id: string, handle: SingleDicomViewerHandle | null) => {
    if (handle) {
      viewerRefs.current.set(id, handle);
    } else {
      viewerRefs.current.delete(id);
    }
  }, []);

  // 그룹 제어 함수들
  const playAll = useCallback(() => {
    viewerRefs.current.forEach((handle) => handle.play());
  }, []);

  const pauseAll = useCallback(() => {
    viewerRefs.current.forEach((handle) => handle.pause());
  }, []);

  const togglePlayAll = useCallback(() => {
    viewerRefs.current.forEach((handle) => handle.togglePlay());
  }, []);

  const setFpsAll = useCallback((newFps: number) => {
    viewerRefs.current.forEach((handle) => handle.setFps(newFps));
  }, []);

  const resetFrameAll = useCallback(() => {
    viewerRefs.current.forEach((handle) => handle.goToFrame(0));
  }, []);

  const resetViewportAll = useCallback(() => {
    viewerRefs.current.forEach((handle) => handle.resetViewport());
  }, []);

  const getViewerHandle = useCallback((id: string) => {
    return viewerRefs.current.get(id) ?? null;
  }, []);

  const getSelectedId = useCallback(() => selectedId, [selectedId]);

  const selectViewer = useCallback((id: string | null) => {
    if (controlledSelectedId === undefined) {
      setInternalSelectedId(id);
    }
    onSelectChange?.(id);
  }, [controlledSelectedId, onSelectChange]);

  // 외부 제어 핸들 노출
  useImperativeHandle(
    ref,
    () => ({
      playAll,
      pauseAll,
      togglePlayAll,
      setFpsAll,
      resetFrameAll,
      resetViewportAll,
      getViewerHandle,
      getSelectedId,
      selectViewer,
    }),
    [playAll, pauseAll, togglePlayAll, setFpsAll, resetFrameAll, resetViewportAll, getViewerHandle, getSelectedId, selectViewer]
  );

  // 기본 뷰어 옵션 (간소화된 UI)
  // showControls는 viewerOptions로 사용자가 직접 제어
  // 그룹 컨트롤(ref)은 항상 사용 가능, 개별 컨트롤 표시 여부는 독립적
  const defaultViewerOptions: Partial<SingleDicomViewerProps> = {
    showStatusBar: false,
    showControls: true, // 기본: 개별 컨트롤 표시
    showToolInfo: false,
    showToolbar: false,
    ...viewerOptions, // 사용자 설정으로 덮어쓰기 가능
  };

  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: `${gap}px`,
        width: `${width}px`,
        height: `${height}px`,
        background: '#0a0a0a',
        borderRadius: '4px',
        overflow: 'hidden',
        ...style,
      }}
    >
      {viewers.slice(0, rows * cols).map((viewer, index) => (
        <div
          key={viewer.id}
          onClick={() => handleSelect(viewer.id)}
          style={{
            position: 'relative',
            cursor: selectable ? 'pointer' : 'default',
            outline: selectedId === viewer.id ? '2px solid #4a9eff' : 'none',
            outlineOffset: '-2px',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <SingleDicomViewer
            ref={(handle) => registerRef(viewer.id, handle)}
            frames={viewer.frames}
            imageInfo={viewer.imageInfo}
            isEncapsulated={viewer.isEncapsulated}
            viewportId={viewer.id}
            width={viewerSize.width}
            height={viewerSize.height}
            initialFps={fps}
            {...defaultViewerOptions}
            style={{
              padding: '4px',
            }}
          />

          {/* 뷰어 라벨 (선택적) */}
          {viewer.label && (
            <div
              style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                background: 'rgba(0, 0, 0, 0.6)',
                color: '#fff',
                padding: '2px 8px',
                borderRadius: '3px',
                fontSize: '11px',
                fontFamily: 'monospace',
                pointerEvents: 'none',
              }}
            >
              {viewer.label}
            </div>
          )}

          {/* 인덱스 표시 */}
          <div
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              background: selectedId === viewer.id
                ? 'rgba(74, 158, 255, 0.8)'
                : 'rgba(0, 0, 0, 0.6)',
              color: '#fff',
              padding: '2px 8px',
              borderRadius: '3px',
              fontSize: '11px',
              fontFamily: 'monospace',
              pointerEvents: 'none',
            }}
          >
            #{index + 1}
          </div>
        </div>
      ))}

      {/* 빈 슬롯 (데이터가 레이아웃보다 적을 때) */}
      {Array.from({ length: Math.max(0, rows * cols - viewers.length) }).map((_, i) => (
        <div
          key={`empty-${i}`}
          style={{
            background: '#1a1a1a',
            borderRadius: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#444',
            fontSize: '12px',
          }}
        >
          Empty
        </div>
      ))}
    </div>
  );
});
