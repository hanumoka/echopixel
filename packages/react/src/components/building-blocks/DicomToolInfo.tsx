import type { ToolMode } from '../../types';
import { cn } from '../../utils';

/**
 * 도구 바인딩 정보
 */
export interface ToolBinding {
  /** 마우스/키보드 바인딩 설명 (예: "우클릭 드래그") */
  binding: string;
  /** 도구 이름 (예: "Window/Level") */
  tool: string;
  /** 추가 설명 (선택적) */
  description?: string;
  /** 강조 색상 (선택적) */
  highlightColor?: string;
}

/**
 * 키보드 단축키 정보
 */
export interface KeyboardShortcut {
  /** 키 조합 (예: "Space", "← →") */
  key: string;
  /** 동작 설명 (예: "재생/정지") */
  action: string;
}

/**
 * DicomToolInfo Props
 */
export interface DicomToolInfoProps {
  /** 도구 모드 (static: 정지 이미지, video: 동영상) */
  mode?: ToolMode;
  /** 마우스 도구 바인딩 (커스텀 설정 시 사용) */
  mouseTools?: ToolBinding[];
  /** 키보드 단축키 (커스텀 설정 시 사용) */
  keyboardShortcuts?: KeyboardShortcut[];
  /** Context Loss 테스트 버튼 표시 여부 (개발용) */
  showContextLossTest?: boolean;
  /** Context Loss 테스트 콜백 */
  onTestContextLoss?: () => void;
  /** 커스텀 스타일 */
  style?: React.CSSProperties;
  /** 커스텀 클래스명 */
  className?: string;
}

/**
 * 기본 마우스 도구 바인딩 (모드별)
 */
const getDefaultMouseTools = (mode: ToolMode): ToolBinding[] => {
  const common: ToolBinding[] = [
    { binding: '우클릭 드래그', tool: 'Window/Level (밝기/대비)' },
    { binding: '중클릭 드래그', tool: 'Pan (이미지 이동)' },
    { binding: 'Shift + 좌클릭', tool: 'Zoom (확대/축소)' },
  ];

  if (mode === 'static') {
    return [
      ...common,
      { binding: '휠 스크롤', tool: 'Zoom (확대/축소)', highlightColor: '#cf8' },
    ];
  } else {
    return [
      ...common,
      { binding: '휠 스크롤', tool: '프레임 전환' },
    ];
  }
};

/**
 * 기본 키보드 단축키 (모드별)
 */
const getDefaultKeyboardShortcuts = (mode: ToolMode): KeyboardShortcut[] => {
  if (mode === 'static') {
    return [
      { key: 'R', action: '전체 리셋' },
    ];
  } else {
    return [
      { key: 'Space', action: '재생/정지' },
      { key: '← →', action: '프레임 이동' },
      { key: '↑ ↓', action: 'FPS 조절' },
      { key: 'R', action: '전체 리셋' },
    ];
  }
};

/**
 * DicomToolInfo
 *
 * DICOM 뷰어의 마우스 도구 및 키보드 단축키 안내 컴포넌트
 *
 * @example
 * ```tsx
 * // 기본 사용 (동영상 모드)
 * <DicomToolInfo mode="video" />
 *
 * // 정지 이미지 모드
 * <DicomToolInfo mode="static" />
 *
 * // 커스텀 도구 바인딩
 * <DicomToolInfo
 *   mouseTools={[
 *     { binding: '좌클릭', tool: 'Probe' },
 *   ]}
 *   keyboardShortcuts={[
 *     { key: 'Esc', action: '도구 해제' },
 *   ]}
 * />
 * ```
 */
export function DicomToolInfo({
  mode = 'video',
  mouseTools,
  keyboardShortcuts,
  showContextLossTest = false,
  onTestContextLoss,
  style,
  className,
}: DicomToolInfoProps) {
  const effectiveMouseTools = mouseTools ?? getDefaultMouseTools(mode);
  const effectiveKeyboardShortcuts = keyboardShortcuts ?? getDefaultKeyboardShortcuts(mode);

  return (
    <div
      className={cn(
        'mt-3 p-2.5 bg-viewer-surface rounded-md text-sm text-text-secondary',
        className
      )}
      style={style}
    >
      {/* 마우스 도구 섹션 */}
      <div className="mb-2 text-accent-info font-bold flex items-center gap-2">
        🖱️ 마우스 도구
        <span
          className={cn(
            'text-xxs py-0.5 px-1.5 rounded',
            mode === 'static'
              ? 'bg-[#2a4a2a] text-[#8f8]'
              : 'bg-viewer-panel text-[#88f]'
          )}
        >
          {mode === 'static' ? '정지 이미지' : '동영상'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-y-1.5 gap-x-4">
        {effectiveMouseTools.map((tool, index) => (
          <div key={index}>
            <span className="text-text-primary">{tool.binding}</span>
            {' → '}
            <span style={tool.highlightColor ? { color: tool.highlightColor } : undefined}>
              {tool.tool}
            </span>
            {tool.description && (
              <span className="text-[#666] ml-1">
                ({tool.description})
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 키보드 단축키 섹션 */}
      {effectiveKeyboardShortcuts.length > 0 && (
        <>
          <div className="mt-2.5 mb-1.5 text-[#cf8] font-bold">
            ⌨️ 키보드 단축키
          </div>
          <div className="flex flex-wrap gap-y-2 gap-x-4">
            {effectiveKeyboardShortcuts.map((shortcut, index) => (
              <span key={index}>
                <span className="text-text-primary">{shortcut.key}</span>
                {' '}
                {shortcut.action}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Context Loss 테스트 버튼 (개발용) */}
      {showContextLossTest && onTestContextLoss && (
        <div className="mt-3 pt-2.5 border-t border-[#333]">
          <button
            onClick={onTestContextLoss}
            className="py-1.5 px-3 text-sm bg-accent-error text-text-primary border-none rounded-md cursor-pointer"
          >
            🧪 Test Context Loss (2초 후 복구)
          </button>
          <span className="ml-2.5 text-xs text-text-muted">
            현재 프레임이 유지되는지 확인
          </span>
        </div>
      )}
    </div>
  );
}
