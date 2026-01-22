/**
 * 재생/정지 버튼 + FPS 슬라이더 컴포넌트
 */

interface PlaybackControlBarProps {
  isPlaying: boolean;
  fps: number;
  onTogglePlay: () => void;
  onFpsChange: (fps: number) => void;
  disabled?: boolean;
  disabledMessage?: string;
  showResetButtons?: boolean;
  onReset?: () => void;
  onResetViewport?: () => void;
  showAnnotationsToggle?: boolean;
  showAnnotations?: boolean;
  onAnnotationsVisibilityChange?: (show: boolean) => void;
  playableCount?: number;
  stillCount?: number;
  maxFps?: number;
  style?: React.CSSProperties;
}

export function PlaybackControlBar({
  isPlaying,
  fps,
  onTogglePlay,
  onFpsChange,
  disabled = false,
  disabledMessage,
  showResetButtons = false,
  onReset,
  onResetViewport,
  showAnnotationsToggle = false,
  showAnnotations = true,
  onAnnotationsVisibilityChange,
  playableCount,
  stillCount,
  maxFps = 60,
  style,
}: PlaybackControlBarProps) {
  return (
    <div
      style={{
        padding: '12px',
        background: '#1a1a2e',
        borderRadius: '4px',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap',
        ...style,
      }}
    >
      {/* 재생/정지 버튼 */}
      <button
        onClick={onTogglePlay}
        disabled={disabled}
        style={{
          padding: '8px 20px',
          fontSize: '14px',
          background: disabled ? '#555' : isPlaying ? '#c44' : '#4c4',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          minWidth: '100px',
          opacity: disabled ? 0.6 : 1,
        }}
        title={disabled ? disabledMessage : ''}
      >
        {isPlaying ? '⏸ Stop' : '▶ Play All'}
      </button>

      {/* FPS 컨트롤 */}
      {!disabled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label>FPS:</label>
          <input
            type="number"
            min={1}
            max={maxFps}
            value={fps}
            onChange={(e) => onFpsChange(Math.max(1, Math.min(maxFps, Number(e.target.value))))}
            style={{ width: '50px', padding: '4px' }}
          />
          <input
            type="range"
            min={1}
            max={maxFps}
            value={fps}
            onChange={(e) => onFpsChange(Number(e.target.value))}
            style={{ width: '100px' }}
          />
        </div>
      )}

      {/* 리셋 버튼들 */}
      {showResetButtons && (
        <>
          {onReset && (
            <button
              onClick={onReset}
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
          )}
          {onResetViewport && (
            <button
              onClick={onResetViewport}
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
              🔄 뷰포트 리셋
            </button>
          )}
        </>
      )}

      {/* 어노테이션 표시 토글 */}
      {showAnnotationsToggle && onAnnotationsVisibilityChange && (
        <button
          onClick={() => onAnnotationsVisibilityChange(!showAnnotations)}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            background: showAnnotations ? '#2a4a4a' : '#3a3a3a',
            color: showAnnotations ? '#8ff' : '#888',
            border: showAnnotations ? '2px solid #5aa' : '2px solid transparent',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
          title={showAnnotations ? '어노테이션 숨기기' : '어노테이션 표시'}
        >
          {showAnnotations ? '👁 어노테이션 표시' : '👁‍🗨 어노테이션 숨김'}
        </button>
      )}

      {/* 영상/정지 통계 */}
      {(playableCount !== undefined || stillCount !== undefined) && (
        <div style={{ fontSize: '12px', color: '#888', marginLeft: 'auto' }}>
          {disabled ? (
            <span style={{ color: '#fa8' }}>{disabledMessage}</span>
          ) : (
            <>
              {playableCount !== undefined && (
                <span style={{ color: '#8f8' }}>영상: {playableCount}개</span>
              )}
              {stillCount !== undefined && stillCount > 0 && (
                <span style={{ color: '#fa8', marginLeft: '10px' }}>정지: {stillCount}개</span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
