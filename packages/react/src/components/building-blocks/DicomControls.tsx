import type { PlaybackState } from '../../types';

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
      className={className}
      style={{
        padding: '12px',
        background: '#1a1a2e',
        borderRadius: '4px',
        color: '#fff',
        ...style,
      }}
    >
      {/* 프레임 슬라이더 */}
      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}>
          프레임: {currentFrame + 1} / {totalFrames}
        </label>
        <input
          type="range"
          min={0}
          max={totalFrames - 1}
          value={currentFrame}
          onChange={(e) => onFrameChange?.(Number(e.target.value))}
          disabled={sliderDisabled}
          style={{
            width: '100%',
            cursor: sliderDisabled ? 'not-allowed' : 'pointer',
          }}
        />
      </div>

      {/* 재생 컨트롤 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      }}>
        {/* 이전 프레임 버튼 */}
        <button
          onClick={onPrevFrame}
          disabled={isPlaying}
          style={{
            padding: '6px 12px',
            fontSize: '14px',
            cursor: isPlaying ? 'not-allowed' : 'pointer',
            opacity: isPlaying ? 0.5 : 1,
          }}
        >
          ◀
        </button>

        {/* 재생/정지 버튼 */}
        <button
          onClick={onTogglePlay}
          style={{
            padding: '6px 16px',
            fontSize: '14px',
            background: isPlaying ? '#c44' : '#4c4',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            minWidth: '70px',
          }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* 다음 프레임 버튼 */}
        <button
          onClick={onNextFrame}
          disabled={isPlaying}
          style={{
            padding: '6px 12px',
            fontSize: '14px',
            cursor: isPlaying ? 'not-allowed' : 'pointer',
            opacity: isPlaying ? 0.5 : 1,
          }}
        >
          ▶
        </button>

        {/* FPS 조절 - 공간 부족 시 줄바꿈 */}
        <div style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '12px',
          flexShrink: 0,
          minWidth: 'fit-content',
        }}>
          <label style={{ whiteSpace: 'nowrap' }}>FPS:</label>
          <input
            type="number"
            min={minFps}
            max={maxFps}
            value={fps}
            onChange={(e) => {
              const newFps = Math.max(minFps, Math.min(maxFps, Number(e.target.value)));
              onFpsChange?.(newFps);
            }}
            style={{ width: '40px', padding: '2px' }}
          />
          <input
            type="range"
            min={minFps}
            max={maxFps}
            value={fps}
            onChange={(e) => onFpsChange?.(Number(e.target.value))}
            style={{ width: '60px' }}
          />
        </div>
      </div>
    </div>
  );
}
