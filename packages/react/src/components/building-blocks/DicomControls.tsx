import type { PlaybackState } from '../../types';
import { cn } from '../../utils';

/**
 * DicomControls Props
 */
export interface DicomControlsProps {
  /** 현재 재생 상태 */
  playbackState: PlaybackState;
  /** 재생/정지 토글 콜백 */
  onTogglePlay?: () => void;
  /** 이전 프레임 이동 콜백 */
  onPrevFrame?: () => void;
  /** 다음 프레임 이동 콜백 */
  onNextFrame?: () => void;
  /** 특정 프레임으로 이동 콜백 */
  onFrameChange?: (frame: number) => void;
  /** FPS 변경 콜백 */
  onFpsChange?: (fps: number) => void;
  /** 최소 FPS (기본값: 1) */
  minFps?: number;
  /** 최대 FPS (기본값: 60) */
  maxFps?: number;
  /** 프레임 슬라이더 비활성화 (재생 중) */
  disableSliderOnPlay?: boolean;
  /** 커스텀 스타일 */
  style?: React.CSSProperties;
  /** 커스텀 클래스명 */
  className?: string;
}

/**
 * DicomControls
 *
 * DICOM 뷰어의 재생 컨트롤 컴포넌트
 * - 재생/정지 버튼
 * - 이전/다음 프레임 버튼
 * - 프레임 슬라이더
 * - FPS 조절
 *
 * @example
 * ```tsx
 * <DicomControls
 *   playbackState={{
 *     currentFrame: 10,
 *     totalFrames: 30,
 *     isPlaying: false,
 *     fps: 30
 *   }}
 *   onTogglePlay={() => setIsPlaying(p => !p)}
 *   onFrameChange={(frame) => setCurrentFrame(frame)}
 *   onFpsChange={(fps) => setFps(fps)}
 * />
 * ```
 */
export function DicomControls({
  playbackState,
  onTogglePlay,
  onPrevFrame,
  onNextFrame,
  onFrameChange,
  onFpsChange,
  minFps = 1,
  maxFps = 60,
  disableSliderOnPlay = true,
  style,
  className,
}: DicomControlsProps) {
  const { currentFrame, totalFrames, isPlaying, fps } = playbackState;
  const sliderDisabled = disableSliderOnPlay && isPlaying;

  // 프레임이 1개 이하면 표시하지 않음
  if (totalFrames <= 1) {
    return null;
  }

  return (
    <div
      className={cn('p-3 bg-viewer-surface rounded-md text-text-primary', className)}
      style={style}
    >
      {/* 프레임 슬라이더 */}
      <div className="mb-2.5">
        <label className="block mb-1 text-base">
          프레임: {currentFrame + 1} / {totalFrames}
        </label>
        <input
          type="range"
          min={0}
          max={totalFrames - 1}
          value={currentFrame}
          onChange={(e) => onFrameChange?.(Number(e.target.value))}
          disabled={sliderDisabled}
          className={cn('w-full', sliderDisabled ? 'cursor-not-allowed' : 'cursor-pointer')}
        />
      </div>

      {/* 재생 컨트롤 */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* 이전 프레임 버튼 */}
        <button
          onClick={onPrevFrame}
          disabled={isPlaying}
          className={cn(
            'py-1.5 px-3 text-lg',
            isPlaying ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          )}
        >
          ◀
        </button>

        {/* 재생/정지 버튼 */}
        <button
          onClick={onTogglePlay}
          className={cn(
            'py-1.5 px-4 text-lg text-text-primary border-none rounded-md cursor-pointer min-w-[70px]',
            isPlaying ? 'bg-accent-error' : 'bg-accent-success'
          )}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* 다음 프레임 버튼 */}
        <button
          onClick={onNextFrame}
          disabled={isPlaying}
          className={cn(
            'py-1.5 px-3 text-lg',
            isPlaying ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          )}
        >
          ▶
        </button>

        {/* FPS 조절 - 공간 부족 시 줄바꿈 */}
        <div className="ml-auto flex items-center gap-1 text-sm shrink-0 min-w-fit">
          <label className="whitespace-nowrap">FPS:</label>
          <input
            type="number"
            min={minFps}
            max={maxFps}
            value={fps}
            onChange={(e) => {
              const newFps = Math.max(minFps, Math.min(maxFps, Number(e.target.value)));
              onFpsChange?.(newFps);
            }}
            className="w-10 p-0.5"
          />
          <input
            type="range"
            min={minFps}
            max={maxFps}
            value={fps}
            onChange={(e) => onFpsChange?.(Number(e.target.value))}
            className="w-[60px]"
          />
        </div>
      </div>
    </div>
  );
}
