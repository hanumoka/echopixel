/**
 * ViewportOverlay - 뷰포트 위 오버레이 UI
 *
 * 학습 포인트:
 * - DOM 기반 UI 요소 (프레임 카운터, 뷰포트 정보 등)
 * - WebGL 렌더링과 분리된 UI 레이어
 * - 미래에 어노테이션, 측정 도구 UI 확장 가능
 *
 * 구조:
 * - position: absolute로 ViewportSlot 내에 오버레이
 * - pointerEvents: none으로 이벤트 통과 (슬롯이 처리)
 */

import type { Viewport } from '@echopixel/core';

export interface ViewportOverlayProps {
  /** 뷰포트 데이터 */
  viewport: Viewport | null;
  /** 뷰포트 인덱스 (0-based) */
  index: number;
  /** 프레임 정보 표시 여부 */
  showFrameInfo?: boolean;
  /** 뷰포트 ID 표시 여부 */
  showViewportId?: boolean;
}

/**
 * ViewportOverlay 컴포넌트
 *
 * 뷰포트 위에 프레임 카운터, 뷰포트 정보 등을 표시합니다.
 * DOM 기반이므로 CSS 스타일링이 자유롭습니다.
 */
export function ViewportOverlay({
  viewport,
  index,
  showFrameInfo = true,
  showViewportId = false,
}: ViewportOverlayProps) {
  const frameCount = viewport?.series?.frameCount ?? 0;
  const currentFrame = viewport?.playback.currentFrame ?? 0;
  const isPlaying = viewport?.playback.isPlaying ?? false;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none', // 이벤트는 ViewportSlot에서 처리
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '4px',
        color: '#fff',
        fontSize: '11px',
        fontFamily: 'monospace',
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
      }}
    >
      {/* 상단 좌측: 뷰포트 인덱스 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <span
          style={{
            background: 'rgba(0, 0, 0, 0.5)',
            padding: '2px 6px',
            borderRadius: '3px',
          }}
        >
          #{index + 1}
        </span>

        {/* 상단 우측: 재생 상태 */}
        {isPlaying && (
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

      {/* 하단: 프레임 정보 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        {/* 하단 좌측: 프레임 카운터 */}
        {showFrameInfo && frameCount > 0 && (
          <span
            style={{
              background: 'rgba(0, 0, 0, 0.5)',
              padding: '2px 6px',
              borderRadius: '3px',
            }}
          >
            {currentFrame + 1} / {frameCount}
          </span>
        )}

        {/* 하단 우측: 뷰포트 ID (디버그용) */}
        {showViewportId && viewport && (
          <span
            style={{
              background: 'rgba(0, 0, 0, 0.5)',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '10px',
              color: '#888',
            }}
          >
            {viewport.id.slice(-8)}
          </span>
        )}
      </div>
    </div>
  );
}
