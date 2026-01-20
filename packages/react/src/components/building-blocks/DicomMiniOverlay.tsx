import type { CSSProperties } from 'react';

/**
 * DicomMiniOverlay - 간소화된 뷰포트 오버레이
 *
 * 멀티 뷰포트 환경에서 최소한의 정보만 표시하는 오버레이.
 * DOM 기반으로 WebGL 렌더링과 분리됩니다.
 *
 * @example
 * ```tsx
 * <DicomMiniOverlay
 *   index={0}
 *   currentFrame={5}
 *   totalFrames={30}
 *   isPlaying={true}
 * />
 * ```
 */

/**
 * DicomMiniOverlay Props
 */
export interface DicomMiniOverlayProps {
  /** 뷰포트 인덱스 (0-based, 표시 시 +1) */
  index?: number;
  /** 현재 프레임 (0-based) */
  currentFrame?: number;
  /** 총 프레임 수 */
  totalFrames?: number;
  /** 재생 중 여부 */
  isPlaying?: boolean;
  /** Window/Level 값 (선택적) */
  windowLevel?: { center: number; width: number } | null;
  /** 인덱스 표시 여부 */
  showIndex?: boolean;
  /** 프레임 정보 표시 여부 */
  showFrameInfo?: boolean;
  /** 재생 상태 표시 여부 */
  showPlayState?: boolean;
  /** W/L 표시 여부 */
  showWindowLevel?: boolean;
  /** 커스텀 라벨 (인덱스 대신 표시) */
  label?: string;
  /** 선택됨 상태 */
  isSelected?: boolean;
  /** 커스텀 스타일 */
  style?: CSSProperties;
  /** 커스텀 클래스명 */
  className?: string;
}

/**
 * DicomMiniOverlay
 *
 * 멀티 뷰포트에서 사용하는 간소화된 오버레이 컴포넌트.
 * - 좌상단: 뷰포트 인덱스 또는 라벨
 * - 우상단: 재생 상태
 * - 좌하단: 프레임 카운터
 * - 우하단: W/L 값 (선택적)
 *
 * pointerEvents: none으로 설정되어 이벤트가 하위 요소로 통과됩니다.
 */
export function DicomMiniOverlay({
  index,
  currentFrame = 0,
  totalFrames = 0,
  isPlaying = false,
  windowLevel,
  showIndex = true,
  showFrameInfo = true,
  showPlayState = true,
  showWindowLevel = false,
  label,
  isSelected = false,
  style,
  className,
}: DicomMiniOverlayProps) {
  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '4px',
        color: '#fff',
        fontSize: '11px',
        fontFamily: 'monospace',
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
        // 선택됨 상태 표시
        border: isSelected ? '2px solid #4a9eff' : '2px solid transparent',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {/* 상단 영역 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        {/* 좌상단: 인덱스 또는 라벨 */}
        {(showIndex || label) && (
          <span
            style={{
              background: isSelected
                ? 'rgba(74, 158, 255, 0.7)'
                : 'rgba(0, 0, 0, 0.5)',
              padding: '2px 6px',
              borderRadius: '3px',
            }}
          >
            {label ?? `#${(index ?? 0) + 1}`}
          </span>
        )}

        {/* 우상단: 재생 상태 */}
        {showPlayState && isPlaying && (
          <span
            style={{
              background: 'rgba(76, 175, 80, 0.7)',
              padding: '2px 6px',
              borderRadius: '3px',
            }}
          >
            ▶
          </span>
        )}
      </div>

      {/* 하단 영역 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        {/* 좌하단: 프레임 카운터 */}
        {showFrameInfo && totalFrames > 0 && (
          <span
            style={{
              background: 'rgba(0, 0, 0, 0.5)',
              padding: '2px 6px',
              borderRadius: '3px',
            }}
          >
            {currentFrame + 1} / {totalFrames}
          </span>
        )}

        {/* 우하단: W/L 값 */}
        {showWindowLevel && windowLevel && (
          <span
            style={{
              background: 'rgba(0, 0, 0, 0.5)',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '10px',
              color: '#8cf',
            }}
          >
            W:{Math.round(windowLevel.width)} L:{Math.round(windowLevel.center)}
          </span>
        )}
      </div>
    </div>
  );
}
