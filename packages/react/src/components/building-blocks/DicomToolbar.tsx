/**
 * DicomToolbar - 커스터마이징 가능한 도구 선택 툴바
 *
 * 선택한 도구가 좌클릭에 바인딩됩니다.
 * 우클릭(W/L), 중클릭(Pan), 휠(Scroll/Zoom)은 고정입니다.
 */

import { cn } from '../../utils';

/**
 * 도구 정의
 */
export interface ToolDefinition {
  /** 도구 고유 ID (Tool System의 toolName과 일치해야 함) */
  id: string;
  /** 표시 이름 */
  name: string;
  /** 아이콘 (이모지 또는 문자열) */
  icon?: string;
  /** 단축키 표시용 */
  shortcut?: string;
  /** 도구 설명 (툴팁용) */
  description?: string;
}

/**
 * 기본 제공 도구 정의
 */
export const DEFAULT_TOOLS: ToolDefinition[] = [
  // 조작 도구
  {
    id: 'WindowLevel',
    name: 'W/L',
    icon: '☀️',
    description: '밝기/대비 조정',
  },
  {
    id: 'Pan',
    name: '이동',
    icon: '✋',
    description: '이미지 이동',
  },
  {
    id: 'Zoom',
    name: '확대',
    icon: '🔍',
    description: '확대/축소',
  },
  // 어노테이션 도구 (Phase 3f)
  {
    id: 'Length',
    name: '거리',
    icon: '📏',
    description: '두 점 거리 측정',
  },
  {
    id: 'Angle',
    name: '각도',
    icon: '∠',
    description: '세 점 각도 측정',
  },
  {
    id: 'Point',
    name: '점',
    icon: '●',
    description: '단일 점 마커',
  },
];

/**
 * 어노테이션 도구 ID 목록
 *
 * SingleDicomViewer에서 MeasurementTool 활성화 판단에 사용
 */
export const ANNOTATION_TOOL_IDS = ['Length', 'Angle', 'Point'] as const;

/**
 * DicomToolbar Props
 */
export interface DicomToolbarProps {
  /** 표시할 도구 목록 (기본: DEFAULT_TOOLS) */
  tools?: ToolDefinition[];
  /** 현재 선택된 도구 ID */
  activeTool: string;
  /** 도구 선택 콜백 */
  onToolChange: (toolId: string) => void;
  /** 비활성화된 도구 ID 목록 (예: 정지 이미지에서 StackScroll) */
  disabledTools?: string[];
  /** 리셋 버튼 표시 여부 */
  showResetButton?: boolean;
  /** 리셋 버튼 클릭 콜백 */
  onReset?: () => void;
  /** 회전 버튼 표시 여부 */
  showRotateButtons?: boolean;
  /** 좌 90° 회전 콜백 */
  onRotateLeft?: () => void;
  /** 우 90° 회전 콜백 */
  onRotateRight?: () => void;
  /** 플립 버튼 표시 여부 */
  showFlipButtons?: boolean;
  /** 가로 플립 콜백 */
  onFlipHorizontal?: () => void;
  /** 세로 플립 콜백 */
  onFlipVertical?: () => void;
  /** 현재 가로 플립 상태 */
  flipH?: boolean;
  /** 현재 세로 플립 상태 */
  flipV?: boolean;
  /** 어노테이션 토글 버튼 표시 여부 */
  showAnnotationToggle?: boolean;
  /** 어노테이션 표시 상태 */
  annotationsVisible?: boolean;
  /** 어노테이션 표시 토글 콜백 */
  onAnnotationsVisibilityChange?: (visible: boolean) => void;
  /** 툴바 방향 */
  orientation?: 'horizontal' | 'vertical';
  /** 컴팩트 모드 (아이콘만 표시) */
  compact?: boolean;
  /** 커스텀 스타일 */
  style?: React.CSSProperties;
  /** 커스텀 클래스명 */
  className?: string;
}

/**
 * DicomToolbar
 *
 * DICOM 뷰어 도구 선택 툴바
 * - 선택한 도구가 좌클릭에 바인딩됨
 * - 커스터마이징 가능 (도구 목록, 방향, 컴팩트 모드)
 *
 * @example
 * ```tsx
 * // 기본 사용
 * <DicomToolbar
 *   activeTool="Pan"
 *   onToolChange={(toolId) => setActiveTool(toolId)}
 * />
 *
 * // 커스텀 도구 목록
 * <DicomToolbar
 *   tools={[
 *     { id: 'WindowLevel', name: 'W/L', icon: '☀️' },
 *     { id: 'Pan', name: '이동', icon: '✋' },
 *   ]}
 *   activeTool={activeTool}
 *   onToolChange={setActiveTool}
 *   disabledTools={isStaticImage ? ['StackScroll'] : []}
 * />
 *
 * // 컴팩트 + 세로 방향
 * <DicomToolbar
 *   activeTool="Zoom"
 *   onToolChange={setActiveTool}
 *   orientation="vertical"
 *   compact
 * />
 * ```
 */
export function DicomToolbar({
  tools = DEFAULT_TOOLS,
  activeTool,
  onToolChange,
  disabledTools = [],
  showResetButton = true,
  onReset,
  showRotateButtons = false,
  onRotateLeft,
  onRotateRight,
  showFlipButtons = false,
  onFlipHorizontal,
  onFlipVertical,
  flipH = false,
  flipV = false,
  showAnnotationToggle = false,
  annotationsVisible = true,
  onAnnotationsVisibilityChange,
  orientation = 'horizontal',
  compact = false,
  style,
  className,
}: DicomToolbarProps) {
  const isHorizontal = orientation === 'horizontal';
  const disabledSet = new Set(disabledTools);

  return (
    <div
      className={cn(
        'flex flex-wrap gap-1 p-2 bg-viewer-surface rounded-md items-center',
        isHorizontal ? 'flex-row' : 'flex-col',
        className
      )}
      style={style}
    >
      {tools.map((tool) => {
        const isActive = tool.id === activeTool;
        const isDisabled = disabledSet.has(tool.id);

        return (
          <button
            key={tool.id}
            onClick={() => !isDisabled && onToolChange(tool.id)}
            disabled={isDisabled}
            title={tool.description || tool.name}
            className={cn(
              'flex items-center justify-center gap-1 rounded-md border-2 transition-all duration-150',
              compact ? 'p-2 min-w-[36px] text-[16px]' : 'py-2 px-3 min-w-[60px] text-base',
              isActive
                ? 'bg-[#3a5a8a] text-text-primary border-border-active font-bold'
                : isDisabled
                  ? 'bg-[#2a2a2a] text-text-disabled border-transparent cursor-not-allowed opacity-50'
                  : 'bg-viewer-panel text-text-secondary border-transparent cursor-pointer'
            )}
          >
            {tool.icon && <span>{tool.icon}</span>}
            {!compact && <span>{tool.name}</span>}
          </button>
        );
      })}

      {/* 구분선 (회전, 플립, 어노테이션 토글, 또는 리셋 버튼이 있을 때) */}
      {(showRotateButtons || showFlipButtons || showAnnotationToggle || showResetButton) && (
        <div
          className={cn(
            'bg-[#444]',
            isHorizontal ? 'w-px h-6 mx-1' : 'w-4/5 h-px my-1'
          )}
        />
      )}

      {/* 회전 버튼 */}
      {showRotateButtons && (
        <>
          <button
            onClick={onRotateLeft}
            title="좌 90° 회전"
            className={cn(
              'flex items-center justify-center gap-1 bg-[#2a4a3a] text-[#afa] border-2 border-transparent rounded-md cursor-pointer transition-all duration-150',
              compact ? 'p-2 min-w-[36px] text-[16px]' : 'py-2 px-3 min-w-[50px] text-base'
            )}
          >
            <span>↺</span>
            {!compact && <span>좌</span>}
          </button>
          <button
            onClick={onRotateRight}
            title="우 90° 회전"
            className={cn(
              'flex items-center justify-center gap-1 bg-[#2a4a3a] text-[#afa] border-2 border-transparent rounded-md cursor-pointer transition-all duration-150',
              compact ? 'p-2 min-w-[36px] text-[16px]' : 'py-2 px-3 min-w-[50px] text-base'
            )}
          >
            <span>↻</span>
            {!compact && <span>우</span>}
          </button>
        </>
      )}

      {/* 플립 버튼 */}
      {showFlipButtons && (
        <>
          <button
            onClick={onFlipHorizontal}
            title="가로 플립 (좌우 반전)"
            className={cn(
              'flex items-center justify-center gap-1 rounded-md border-2 cursor-pointer transition-all duration-150',
              compact ? 'p-2 min-w-[36px] text-[16px]' : 'py-2 px-3 min-w-[50px] text-base',
              flipH
                ? 'bg-[#4a4a2a] text-[#ff8] border-[#aa8]'
                : 'bg-[#2a3a4a] text-accent-info border-transparent'
            )}
          >
            <span>⇆</span>
            {!compact && <span>가로</span>}
          </button>
          <button
            onClick={onFlipVertical}
            title="세로 플립 (상하 반전)"
            className={cn(
              'flex items-center justify-center gap-1 rounded-md border-2 cursor-pointer transition-all duration-150',
              compact ? 'p-2 min-w-[36px] text-[16px]' : 'py-2 px-3 min-w-[50px] text-base',
              flipV
                ? 'bg-[#4a4a2a] text-[#ff8] border-[#aa8]'
                : 'bg-[#2a3a4a] text-accent-info border-transparent'
            )}
          >
            <span>⇅</span>
            {!compact && <span>세로</span>}
          </button>
        </>
      )}

      {/* 어노테이션 토글 버튼 */}
      {showAnnotationToggle && (
        <button
          onClick={() => onAnnotationsVisibilityChange?.(!annotationsVisible)}
          title={annotationsVisible ? '어노테이션 숨기기' : '어노테이션 표시'}
          className={cn(
            'flex items-center justify-center gap-1 rounded-md border-2 cursor-pointer transition-all duration-150',
            compact ? 'p-2 min-w-[36px] text-[16px]' : 'py-2 px-3 min-w-[70px] text-base',
            annotationsVisible
              ? 'bg-[#2a4a4a] text-[#8ff] border-[#5aa]'
              : 'bg-[#3a3a3a] text-text-muted border-transparent'
          )}
        >
          <span>{annotationsVisible ? '👁' : '👁‍🗨'}</span>
          {!compact && <span>{annotationsVisible ? '표시' : '숨김'}</span>}
        </button>
      )}

      {/* 리셋 버튼 */}
      {showResetButton && (
        <button
          onClick={onReset}
          title="뷰포트 리셋 (R)"
          className={cn(
            'flex items-center justify-center gap-1 bg-[#4a2a2a] text-[#faa] border-2 border-transparent rounded-md cursor-pointer transition-all duration-150',
            compact ? 'p-2 min-w-[36px] text-[16px]' : 'py-2 px-3 min-w-[60px] text-base'
          )}
        >
          <span>🔄</span>
          {!compact && <span>리셋</span>}
        </button>
      )}
    </div>
  );
}
