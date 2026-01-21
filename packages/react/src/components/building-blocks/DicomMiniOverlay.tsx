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

  // =========================================================================
  // Annotation Tool Props (Phase 3g)
  // =========================================================================

  /** 어노테이션 도구 버튼 표시 여부 */
  showAnnotationTools?: boolean;
  /** 현재 활성 도구 ID */
  activeTool?: string;
  /** 도구 선택 콜백 */
  onToolChange?: (toolId: string) => void;

  /** 도구바 위치: 'overlay' (이미지 위), 'top' (이미지 위 별도 영역) */
  toolbarPosition?: 'overlay' | 'top';
  /** 도구바 높이 (toolbarPosition='top' 일 때 사용, 기본 40px) */
  toolbarHeight?: number;

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
  // Annotation Tool props (Phase 3g)
  showAnnotationTools = false,
  activeTool,
  onToolChange,
  toolbarPosition = 'top',
  toolbarHeight = 40,
  style,
  className,
}: DicomMiniOverlayProps) {
  // 도구바가 상단 별도 영역에 표시되는지 여부
  const showTopToolbar = toolbarPosition === 'top' && showAnnotationTools && isSelected;
  // 도구 버튼 스타일 (32x32px로 증가, 가시성 개선)
  const toolButtonStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    background: 'rgba(0, 0, 0, 0.7)',
    color: '#ccc',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    padding: 0,
    transition: 'all 0.15s ease',
    pointerEvents: 'auto', // 버튼만 클릭 가능
  };

  const activeToolButtonStyle: CSSProperties = {
    ...toolButtonStyle,
    background: 'rgba(74, 158, 255, 0.6)',
    color: '#fff',
  };

  // 도구바 렌더링 함수
  const renderToolbar = () => (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {/* 조작 도구 */}
      <button
        onClick={() => onToolChange?.('WindowLevel')}
        title="밝기/대비 조정 (W/L)"
        style={activeTool === 'WindowLevel' ? activeToolButtonStyle : toolButtonStyle}
      >
        ☀️
      </button>
      <button
        onClick={() => onToolChange?.('Pan')}
        title="이미지 이동"
        style={activeTool === 'Pan' ? activeToolButtonStyle : toolButtonStyle}
      >
        ✋
      </button>
      <button
        onClick={() => onToolChange?.('Zoom')}
        title="확대/축소"
        style={activeTool === 'Zoom' ? activeToolButtonStyle : toolButtonStyle}
      >
        🔍
      </button>

      {/* 구분선 */}
      <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.3)', margin: '0 2px' }} />

      {/* 어노테이션 도구 */}
      <button
        onClick={() => onToolChange?.('Length')}
        title="거리 측정"
        style={activeTool === 'Length' ? activeToolButtonStyle : toolButtonStyle}
      >
        📏
      </button>
      <button
        onClick={() => onToolChange?.('Angle')}
        title="각도 측정"
        style={activeTool === 'Angle' ? activeToolButtonStyle : toolButtonStyle}
      >
        ∠
      </button>
      <button
        onClick={() => onToolChange?.('Point')}
        title="점 마커"
        style={activeTool === 'Point' ? activeToolButtonStyle : toolButtonStyle}
      >
        ●
      </button>
    </div>
  );

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
      {/* 상단 도구바 영역 (이미지 밖) */}
      {showTopToolbar && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: `${toolbarHeight}px`,
            padding: '8px 12px',
            background: 'rgba(20, 25, 40, 0.95)',
            borderBottom: '2px solid rgba(74, 158, 255, 0.5)',
            pointerEvents: 'auto',
            flexShrink: 0,
            gap: '8px',
          }}
        >
          {renderToolbar()}
        </div>
      )}

      {/* 메인 이미지 영역 오버레이 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '4px',
        }}
      >
        {/* 상단 정보 영역 */}
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

          {/* 우상단: 도구 버튼 (overlay 모드) 및 재생 상태 */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {/* 도구 버튼 (overlay 모드, 선택됨 상태에서만) */}
            {toolbarPosition === 'overlay' && showAnnotationTools && isSelected && renderToolbar()}

            {/* 재생 상태 */}
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
        </div>

        {/* 하단 정보 영역 */}
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
              <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
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
                      padding: '4px 6px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#fff',
                      marginLeft: '4px',
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
    </div>
  );
}
