import {
  useState,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
  useMemo,
  useEffect,
  type CSSProperties,
} from 'react';
import type {
  DicomImageInfo,
  Annotation,
} from '@echopixel/core';
import {
  SingleDicomViewer,
  type SingleDicomViewerHandle,
  type SingleDicomViewerProps,
} from './SingleDicomViewer';
import type { ToolDefinition } from './building-blocks/DicomToolbar';

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
  /** 해당 뷰어의 어노테이션 목록 */
  annotations?: Annotation[];
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
  /** 레이아웃 (기본: 데이터 수에 따라 자동) - viewportCount가 지정되면 무시됨 */
  layout?: ViewerGroupLayout;
  /** 뷰포트 개수 (1~50, 자동 그리드 계산) - layout보다 우선 */
  viewportCount?: number;
  /** 컨테이너 너비 (픽셀) */
  width?: number;
  /** 컨테이너 높이 (픽셀) - 스크롤 가능한 최대 높이 */
  height?: number;
  /** 개별 뷰어 최소 높이 (픽셀, 기본: 300) - 이 높이보다 작아지면 스크롤 활성화 */
  minViewerHeight?: number;
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
    | 'annotationConfig'
    | 'readOnlyAnnotations'
    | 'showAnnotations'
  >>;
  /** 툴바에 표시할 도구 목록 (viewerOptions.toolbarTools 대신 사용 가능) */
  toolbarTools?: ToolDefinition[];
  /** 뷰어 선택 가능 여부 */
  selectable?: boolean;
  /** 더블클릭 시 확대 뷰 활성화 */
  enableDoubleClickExpand?: boolean;

  // ============================================================
  // Annotation Props
  // ============================================================

  /** 어노테이션 선택 핸들러 (viewerId, annotationId) */
  onAnnotationSelect?: (viewerId: string, annotationId: string | null) => void;
  /** 어노테이션 업데이트 핸들러 (viewerId, annotation) */
  onAnnotationUpdate?: (viewerId: string, annotation: Annotation) => void;
  /** 어노테이션 삭제 핸들러 (viewerId, annotationId) */
  onAnnotationDelete?: (viewerId: string, annotationId: string) => void;
  /** 어노테이션 생성 핸들러 (viewerId, annotation) */
  onAnnotationCreate?: (viewerId: string, annotation: Annotation) => void;
  /** 어노테이션 표시 토글 핸들러 (viewerId, visible) */
  onAnnotationsVisibilityChange?: (viewerId: string, visible: boolean) => void;
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
 * 뷰포트 개수로부터 최적의 그리드 차원 계산
 * - 4개 이하: 정사각형에 가깝게 배치
 * - 5개 이상: 가로(열) 최대 4개로 제한
 * - 예: 2 → 2×1, 4 → 2×2, 8 → 4×2, 16 → 4×4, 20 → 4×5
 */
function calculateGridFromCount(count: number): { rows: number; cols: number } {
  if (count <= 0) return { rows: 1, cols: 1 };
  if (count === 1) return { rows: 1, cols: 1 };
  if (count === 2) return { rows: 1, cols: 2 };
  if (count <= 4) return { rows: 2, cols: 2 };

  // 5개 이상: 가로 4개 제한
  const cols = 4;
  const rows = Math.ceil(count / cols);

  return { rows, cols };
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
    viewportCount,
    width = 800,
    height = 600,
    minViewerHeight = 300,
    gap = 4,
    fps = 30,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    syncPlayback = false, // 향후 프레임 동기화 기능 예정 (현재 미사용)
    viewerOptions = {},
    toolbarTools,
    selectable = false,
    enableDoubleClickExpand = false,
    selectedId: controlledSelectedId,
    onSelectChange,
    onAnnotationSelect,
    onAnnotationUpdate,
    onAnnotationDelete,
    onAnnotationCreate: _onAnnotationCreate,
    onAnnotationsVisibilityChange,
    style,
    className,
  },
  ref
) {
  // 내부 선택 상태 (uncontrolled 모드용)
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);

  // 확대 뷰 상태
  const [expandedViewerId, setExpandedViewerId] = useState<string | null>(null);

  // 각 뷰어별 어노테이션 표시 상태 (개별 컨트롤용)
  const [viewerAnnotationsVisibility, setViewerAnnotationsVisibility] = useState<Record<string, boolean>>({});

  // 선택된 ID (controlled vs uncontrolled)
  const selectedId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;

  // 뷰어 핸들 refs
  const viewerRefs = useRef<Map<string, SingleDicomViewerHandle>>(new Map());

  // 레이아웃 계산 (viewportCount 우선, 없으면 layout 또는 자동)
  const { rows, cols } = viewportCount !== undefined
    ? calculateGridFromCount(Math.min(Math.max(viewportCount, 1), 50))
    : getLayoutDimensions(propLayout ?? getAutoLayout(viewers.length));

  // UI 요소 높이 계산 (SingleDicomViewer 내부 구조 기반)
  // 주의: SingleDicomViewer에 style={{ padding: '4px' }}를 전달하므로 padding은 8px
  const uiElementsHeight = useMemo(() => {
    const padding = 8; // 4px top + 4px bottom (style prop으로 전달)

    // DicomStatusBar: padding 16px (8*2) + fontSize 13px + marginBottom 10px ≈ 44px
    const statusBarHeight = viewerOptions.showStatusBar !== false ? 44 : 0;

    // DicomToolbar (compact): padding 8px + buttons ~40px + marginBottom 10px ≈ 58px
    // DicomToolbar (normal): padding 8px + buttons ~48px + marginBottom 10px ≈ 66px
    const toolbarHeight = viewerOptions.showToolbar !== false
      ? (viewerOptions.toolbarCompact ? 58 : 66)
      : 0;

    // 캔버스 컨테이너 marginBottom
    const canvasMargin = 10;

    // DicomControls: padding 24px (12*2) + 프레임 슬라이더 ~53px + 버튼 ~36px ≈ 113px
    // 참고: totalFrames <= 1이면 DicomControls가 렌더링되지 않음
    const controlsHeight = viewerOptions.showControls !== false ? 113 : 0;

    return padding + statusBarHeight + toolbarHeight + canvasMargin + controlsHeight;
  }, [viewerOptions]);

  // 개별 뷰어 크기 계산 (최소 높이 보장)
  const viewerSize = useMemo(() => {
    const totalGapX = gap * (cols - 1);
    const viewerWidth = Math.floor((width - totalGapX) / cols);
    const padding = 24;

    // 캔버스 높이: minViewerHeight에서 UI 요소 높이를 뺀 값
    const canvasHeight = Math.max(minViewerHeight - uiElementsHeight, 150);

    return { width: viewerWidth - padding, height: canvasHeight };
  }, [width, gap, cols, minViewerHeight, uiElementsHeight]);

  // 실제 그리드 높이 계산
  // minViewerHeight 기반으로 높이 계산 (브라우저 스크롤 처리)
  const actualGridHeight = useMemo(() => {
    const totalGapY = gap * (rows - 1);
    return rows * minViewerHeight + totalGapY;
  }, [rows, minViewerHeight, gap]);

  // 뷰어 선택 핸들러
  const handleSelect = useCallback((id: string) => {
    if (!selectable) return;

    const newId = selectedId === id ? null : id;

    // 기존 선택된 뷰어의 활성 도구를 리셋 (선택 해제 또는 다른 뷰어 선택 시)
    if (selectedId && selectedId !== newId) {
      const prevHandle = viewerRefs.current.get(selectedId);
      prevHandle?.resetActiveTool();
    }

    if (controlledSelectedId === undefined) {
      setInternalSelectedId(newId);
    }
    onSelectChange?.(newId);
  }, [selectable, selectedId, controlledSelectedId, onSelectChange]);

  // 컨테이너 ref (Click Outside 감지용)
  const containerRef = useRef<HTMLDivElement>(null);

  // =========================================================================
  // Click Outside 패턴: 컴포넌트 바깥 클릭 시 뷰어 선택 해제 (툴바 숨김)
  // =========================================================================
  useEffect(() => {
    if (!selectable) return;

    const handleClickOutside = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container || !selectedId) return;

      // 어노테이션 도구가 활성화된 상태에서는 외부 클릭 감지 건너뛰기
      const selectedHandle = viewerRefs.current.get(selectedId);
      const activeMeasurementToolId = selectedHandle?.getActiveMeasurementToolId?.();
      if (activeMeasurementToolId) {
        return;
      }

      // 클릭이 컴포넌트 바깥에서 발생했는지 확인
      if (!container.contains(e.target as Node)) {
        // 선택된 뷰어의 활성 도구 리셋
        const prevHandle = viewerRefs.current.get(selectedId);
        prevHandle?.resetActiveTool();

        if (controlledSelectedId === undefined) {
          setInternalSelectedId(null);
        }
        onSelectChange?.(null);
      }
    };

    // document 레벨에서 클릭 이벤트 감지
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectable, selectedId, controlledSelectedId, onSelectChange]);

  // 컴포넌트 내부 빈 영역 (gap, 빈 슬롯) 클릭 시 선택 해제
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // 클릭 타겟이 뷰어 내부인지 확인 (data-viewer-id 또는 SingleDicomViewer 클래스)
    const target = e.target as HTMLElement;
    const isViewerArea = target.closest('[data-viewer-id]') || target.closest('.single-dicom-viewer');

    // 뷰어 내부 클릭이면 무시 (뷰어 자체의 onClick에서 처리)
    if (isViewerArea) {
      return;
    }

    // 빈 영역 (빈 슬롯 또는 갭 영역) 클릭 시 선택 해제
    if (selectedId) {
      const prevHandle = viewerRefs.current.get(selectedId);
      prevHandle?.resetActiveTool();

      if (controlledSelectedId === undefined) {
        setInternalSelectedId(null);
      }
      onSelectChange?.(null);
    }
  }, [selectedId, controlledSelectedId, onSelectChange]);

  // 뷰어 클릭 핸들러 (이벤트 전파 방지 포함)
  const handleViewerClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // 컨테이너 클릭 핸들러로 전파 방지

    // 어노테이션 도구가 활성화된 상태에서는 선택 로직 건너뛰기
    const viewerHandle = viewerRefs.current.get(id);
    const activeMeasurementToolId = viewerHandle?.getActiveMeasurementToolId?.();
    if (activeMeasurementToolId) {
      return;
    }

    handleSelect(id);
  }, [handleSelect]);

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

  // 더블클릭 확대 핸들러
  const handleDoubleClick = useCallback((viewerId: string) => {
    if (!enableDoubleClickExpand) return;
    setExpandedViewerId((prev) => (prev === viewerId ? null : viewerId));
  }, [enableDoubleClickExpand]);

  // 확대 뷰 닫기
  const closeExpandedView = useCallback(() => {
    setExpandedViewerId(null);
  }, []);

  // ESC 키로 확대 뷰 닫기
  useEffect(() => {
    if (!expandedViewerId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpandedViewerId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedViewerId]);

  // 기본 뷰어 옵션 (간소화된 UI)
  // showControls는 viewerOptions로 사용자가 직접 제어
  // 그룹 컨트롤(ref)은 항상 사용 가능, 개별 컨트롤 표시 여부는 독립적
  const defaultViewerOptions: Partial<SingleDicomViewerProps> = {
    showStatusBar: false,
    showControls: true, // 기본: 개별 컨트롤 표시
    showToolInfo: false,
    showToolbar: false,
    toolbarTools, // 툴바 도구 목록 (어노테이션 포함)
    ...viewerOptions, // 사용자 설정으로 덮어쓰기 가능
  };

  // 확대 뷰어 데이터
  const expandedViewer = expandedViewerId
    ? viewers.find((v) => v.id === expandedViewerId)
    : null;

  return (
    <div
      ref={containerRef}
      className={className}
      onClick={handleContainerClick}
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, ${minViewerHeight}px)`,
        gap: `${gap}px`,
        width: `${width}px`,
        height: `${actualGridHeight}px`,
        background: '#0a0a0a',
        borderRadius: '4px',
        ...style,
      }}
    >
        {viewers.slice(0, rows * cols).map((viewer, index) => (
          <div
            key={viewer.id}
            data-viewer-id={viewer.id}
            onClick={(e) => handleViewerClick(e, viewer.id)}
            onDoubleClick={() => handleDoubleClick(viewer.id)}
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
            annotations={viewer.annotations}
            onAnnotationSelect={(annotationId) => onAnnotationSelect?.(viewer.id, annotationId)}
            onAnnotationUpdate={(annotation) => onAnnotationUpdate?.(viewer.id, annotation)}
            onAnnotationDelete={(annotationId) => onAnnotationDelete?.(viewer.id, annotationId)}
            {...defaultViewerOptions}
            showAnnotations={viewerAnnotationsVisibility[viewer.id] ?? viewerOptions.showAnnotations ?? true}
            onAnnotationsVisibilityChange={(visible) => {
              setViewerAnnotationsVisibility(prev => ({ ...prev, [viewer.id]: visible }));
              onAnnotationsVisibilityChange?.(viewer.id, visible);
            }}
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

      {/* 확대 뷰 오버레이 */}
      {expandedViewer && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={closeExpandedView}
        >
          {/* 닫기 버튼 */}
          <button
            onClick={closeExpandedView}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: '14px',
              zIndex: 101,
            }}
          >
            ✕ 닫기 (ESC / 더블클릭)
          </button>

          {/* 확대 뷰어 */}
          <div
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={closeExpandedView}
            style={{
              maxWidth: '90%',
              maxHeight: '90%',
            }}
          >
            <SingleDicomViewer
              frames={expandedViewer.frames}
              imageInfo={expandedViewer.imageInfo}
              isEncapsulated={expandedViewer.isEncapsulated}
              viewportId={`${expandedViewer.id}-expanded`}
              width={Math.min(width * 0.9, 1200)}
              height={Math.min(height * 0.85, 900)}
              initialFps={fps}
              annotations={expandedViewer.annotations}
              onAnnotationSelect={(annotationId) => onAnnotationSelect?.(expandedViewer.id, annotationId)}
              onAnnotationUpdate={(annotation) => onAnnotationUpdate?.(expandedViewer.id, annotation)}
              onAnnotationDelete={(annotationId) => onAnnotationDelete?.(expandedViewer.id, annotationId)}
              showStatusBar={true}
              showControls={true}
              showToolInfo={false}
              showToolbar={true}
              toolbarTools={toolbarTools}
              toolbarCompact={false}
              showAnnotations={viewerAnnotationsVisibility[expandedViewer.id] ?? viewerOptions.showAnnotations ?? true}
              onAnnotationsVisibilityChange={(visible) => {
                setViewerAnnotationsVisibility(prev => ({ ...prev, [expandedViewer.id]: visible }));
                onAnnotationsVisibilityChange?.(expandedViewer.id, visible);
              }}
            />
          </div>

          {/* 뷰어 라벨 */}
          {expandedViewer.label && (
            <div
              style={{
                marginTop: '10px',
                color: '#fff',
                fontSize: '14px',
                fontFamily: 'monospace',
              }}
            >
              {expandedViewer.label}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
