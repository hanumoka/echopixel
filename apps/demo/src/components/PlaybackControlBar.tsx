/**
 * 재생/정지 버튼 + FPS 슬라이더 컴포넌트
 */

import { cn } from '@echopixel/react';

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
  className?: string;
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
  className,
}: PlaybackControlBarProps) {
  return (
    <div
      className={cn(
        'p-3 bg-viewer-surface rounded-md text-white flex items-center gap-4 flex-wrap',
        className
      )}
    >
      {/* 재생/정지 버튼 */}
      <button
        onClick={onTogglePlay}
        disabled={disabled}
        className={cn(
          'px-5 py-2 text-lg border-none rounded-md cursor-pointer min-w-[100px] text-white transition-all',
          disabled && 'bg-text-disabled cursor-not-allowed opacity-60',
          !disabled && isPlaying && 'bg-accent-error',
          !disabled && !isPlaying && 'bg-accent-success'
        )}
        title={disabled ? disabledMessage : ''}
      >
        {isPlaying ? '⏸ Stop' : '▶ Play All'}
      </button>

      {/* FPS 컨트롤 */}
      {!disabled && (
        <div className="flex items-center gap-2">
          <label>FPS:</label>
          <input
            type="number"
            min={1}
            max={maxFps}
            value={fps}
            onChange={(e) => onFpsChange(Math.max(1, Math.min(maxFps, Number(e.target.value))))}
            className="w-[50px] p-1 bg-viewer-panel border border-border rounded text-white"
          />
          <input
            type="range"
            min={1}
            max={maxFps}
            value={fps}
            onChange={(e) => onFpsChange(Number(e.target.value))}
            className="w-[100px]"
          />
        </div>
      )}

      {/* 리셋 버튼들 */}
      {showResetButtons && (
        <>
          {onReset && (
            <button
              onClick={onReset}
              className="px-3 py-1.5 text-sm bg-[#444] text-white border-none rounded-md cursor-pointer hover:bg-[#555]"
            >
              ⏮ 처음으로
            </button>
          )}
          {onResetViewport && (
            <button
              onClick={onResetViewport}
              className="px-3 py-1.5 text-sm bg-[#444] text-white border-none rounded-md cursor-pointer hover:bg-[#555]"
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
          className={cn(
            'px-4 py-2 text-lg rounded-md cursor-pointer border-2 transition-all',
            showAnnotations
              ? 'bg-[#2a4a4a] text-[#8ff] border-[#5aa]'
              : 'bg-[#3a3a3a] text-text-muted border-transparent'
          )}
          title={showAnnotations ? '어노테이션 숨기기' : '어노테이션 표시'}
        >
          {showAnnotations ? '👁 어노테이션 표시' : '👁‍🗨 어노테이션 숨김'}
        </button>
      )}

      {/* 영상/정지 통계 */}
      {(playableCount !== undefined || stillCount !== undefined) && (
        <div className="text-sm text-text-muted ml-auto">
          {disabled ? (
            <span className="text-accent-warning">{disabledMessage}</span>
          ) : (
            <>
              {playableCount !== undefined && (
                <span className="text-accent-success">영상: {playableCount}개</span>
              )}
              {stillCount !== undefined && stillCount > 0 && (
                <span className="text-accent-warning ml-2.5">정지: {stillCount}개</span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
