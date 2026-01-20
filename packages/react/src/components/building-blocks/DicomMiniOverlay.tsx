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
  /** 도구 버튼 표시 여부 (회전, 플립) */
  showTools?: boolean;
  /** 현재 회전 각도 (degree) */
  rotation?: number;
  /** 현재 가로 플립 상태 */
  flipH?: boolean;
  /** 현재 세로 플립 상태 */
  flipV?: boolean;
  /** 좌 90° 회전 콜백 */
  onRotateLeft?: () => void;
  /** 우 90° 회전 콜백 */
  onRotateRight?: () => void;
  /** 가로 플립 토글 콜백 */
  onFlipH?: () => void;
  /** 세로 플립 토글 콜백 */
  onFlipV?: () => void;
  /** 리셋 콜백 */
  onReset?: () => void;
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
  showTools = false,
  rotation = 0,
  flipH = false,
  flipV = false,
  onRotateLeft,
  onRotateRight,
  onFlipH,
  onFlipV,
  onReset,
  style,
  className,
}: DicomMiniOverlayProps) {
  // 도구 버튼 스타일
  const toolButtonStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    background: 'rgba(0, 0, 0, 0.6)',
    color: '#aaa',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '12px',
    padding: 0,
    transition: 'all 0.15s ease',
    pointerEvents: 'auto', // 버튼만 클릭 가능
  };

  const activeToolButtonStyle: CSSProperties = {
    ...toolButtonStyle,
    background: 'rgba(74, 158, 255, 0.6)',
    color: '#fff',
  };
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

        {/* 우하단: W/L 값 또는 도구 버튼 */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
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

          {/* 도구 버튼 (선택됨 상태에서만 표시) */}
          {showTools && isSelected && (
            <div style={{ display: 'flex', gap: '2px', marginLeft: '4px' }}>
              {/* 회전 버튼 */}
              <button
                onClick={onRotateLeft}
                title="좌 90° 회전"
                style={toolButtonStyle}
              >
                ↺
              </button>
              <button
                onClick={onRotateRight}
                title="우 90° 회전"
                style={toolButtonStyle}
              >
                ↻
              </button>

              {/* 플립 버튼 */}
              <button
                onClick={onFlipH}
                title="가로 플립 (좌우 반전)"
                style={flipH ? activeToolButtonStyle : toolButtonStyle}
              >
                ⇆
              </button>
              <button
                onClick={onFlipV}
                title="세로 플립 (상하 반전)"
                style={flipV ? activeToolButtonStyle : toolButtonStyle}
              >
                ⇅
              </button>

              {/* 리셋 버튼 */}
              <button
                onClick={onReset}
                title="리셋"
                style={{
                  ...toolButtonStyle,
                  color: '#f88',
                }}
              >
                ⟲
              </button>

              {/* 현재 상태 표시 */}
              {(rotation !== 0 || flipH || flipV) && (
                <span
                  style={{
                    background: 'rgba(74, 158, 255, 0.5)',
                    padding: '2px 4px',
                    borderRadius: '3px',
                    fontSize: '9px',
                    color: '#fff',
                    marginLeft: '2px',
                  }}
                >
                  {rotation !== 0 && `${rotation}°`}
                  {flipH && ' H'}
                  {flipV && ' V'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
