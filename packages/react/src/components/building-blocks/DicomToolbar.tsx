/**
 * DicomToolbar - 커스터마이징 가능한 도구 선택 툴바
 *
 * 선택한 도구가 좌클릭에 바인딩됩니다.
 * 우클릭(W/L), 중클릭(Pan), 휠(Scroll/Zoom)은 고정입니다.
 */

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
];

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
  orientation = 'horizontal',
  compact = false,
  style,
  className,
}: DicomToolbarProps) {
  const isHorizontal = orientation === 'horizontal';
  const disabledSet = new Set(disabledTools);

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        gap: '4px',
        padding: '8px',
        background: '#1a1a2e',
        borderRadius: '4px',
        alignItems: 'center',
        ...style,
      }}
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
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: compact ? '8px' : '8px 12px',
              minWidth: compact ? '36px' : '60px',
              background: isActive ? '#3a5a8a' : isDisabled ? '#2a2a2a' : '#2a2a4a',
              color: isActive ? '#fff' : isDisabled ? '#555' : '#aaa',
              border: isActive ? '2px solid #5a8aba' : '2px solid transparent',
              borderRadius: '4px',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              fontSize: compact ? '16px' : '13px',
              fontWeight: isActive ? 'bold' : 'normal',
              transition: 'all 0.15s ease',
              opacity: isDisabled ? 0.5 : 1,
            }}
          >
            {tool.icon && <span>{tool.icon}</span>}
            {!compact && <span>{tool.name}</span>}
          </button>
        );
      })}

      {/* 구분선 (회전 또는 리셋 버튼이 있을 때) */}
      {(showRotateButtons || showResetButton) && (
        <div
          style={{
            width: isHorizontal ? '1px' : '80%',
            height: isHorizontal ? '24px' : '1px',
            background: '#444',
            margin: isHorizontal ? '0 4px' : '4px 0',
          }}
        />
      )}

      {/* 회전 버튼 */}
      {showRotateButtons && (
        <>
          <button
            onClick={onRotateLeft}
            title="좌 90° 회전"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: compact ? '8px' : '8px 12px',
              minWidth: compact ? '36px' : '50px',
              background: '#2a4a3a',
              color: '#afa',
              border: '2px solid transparent',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: compact ? '16px' : '13px',
              transition: 'all 0.15s ease',
            }}
          >
            <span>↺</span>
            {!compact && <span>좌</span>}
          </button>
          <button
            onClick={onRotateRight}
            title="우 90° 회전"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: compact ? '8px' : '8px 12px',
              minWidth: compact ? '36px' : '50px',
              background: '#2a4a3a',
              color: '#afa',
              border: '2px solid transparent',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: compact ? '16px' : '13px',
              transition: 'all 0.15s ease',
            }}
          >
            <span>↻</span>
            {!compact && <span>우</span>}
          </button>
        </>
      )}

      {/* 리셋 버튼 */}
      {showResetButton && (
        <button
          onClick={onReset}
          title="뷰포트 리셋 (R)"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: compact ? '8px' : '8px 12px',
            minWidth: compact ? '36px' : '60px',
            background: '#4a2a2a',
            color: '#faa',
            border: '2px solid transparent',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: compact ? '16px' : '13px',
            transition: 'all 0.15s ease',
          }}
        >
          <span>🔄</span>
          {!compact && <span>리셋</span>}
        </button>
      )}
    </div>
  );
}
