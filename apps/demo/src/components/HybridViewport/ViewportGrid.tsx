/**
 * ViewportGrid - CSS Grid 기반 뷰포트 그리드
 *
 * 학습 포인트:
 * - CSS Grid로 뷰포트 레이아웃 관리
 * - WebGL Canvas와 DOM 슬롯의 레이어링
 * - Canvas: z-index 0, pointerEvents: none
 * - DOM Grid: z-index 1, 이벤트 처리
 *
 * 구조:
 * ┌─────────────────────────────────────┐
 * │  position: relative (container)     │
 * │  ┌───────────────────────────────┐  │
 * │  │ Canvas (z-index: 0, absolute) │  │
 * │  └───────────────────────────────┘  │
 * │  ┌───────────────────────────────┐  │
 * │  │ DOM Grid (z-index: 1)         │  │
 * │  │  ┌─────┐ ┌─────┐ ┌─────┐     │  │
 * │  │  │Slot │ │Slot │ │Slot │ ... │  │
 * │  │  └─────┘ └─────┘ └─────┘     │  │
 * │  └───────────────────────────────┘  │
 * └─────────────────────────────────────┘
 */

import { useRef, useEffect, useImperativeHandle, forwardRef, type RefObject } from 'react';

export interface ViewportGridProps {
  /** 행 수 */
  rows: number;
  /** 열 수 */
  cols: number;
  /** 컨테이너 너비 (CSS 픽셀) */
  width: number;
  /** 컨테이너 높이 (CSS 픽셀) */
  height: number;
  /** 그리드 셀 간격 (CSS 픽셀) */
  gap?: number;
  /** Device Pixel Ratio */
  dpr?: number;
  /** 자식 요소 (ViewportSlot[]) */
  children?: React.ReactNode;
  /** Canvas ref 콜백 */
  onCanvasRef?: (canvas: HTMLCanvasElement | null) => void;
}

export interface ViewportGridRef {
  /** Canvas 요소 */
  canvas: HTMLCanvasElement | null;
  /** 컨테이너 요소 */
  container: HTMLDivElement | null;
}

/**
 * ViewportGrid 컴포넌트
 *
 * Canvas와 DOM Grid를 겹쳐 배치하여 하이브리드 렌더링을 구현합니다.
 */
export const ViewportGrid = forwardRef<ViewportGridRef, ViewportGridProps>(
  function ViewportGrid(
    {
      rows,
      cols,
      width,
      height,
      gap = 2,
      dpr = Math.min(window.devicePixelRatio || 1, 2),
      children,
      onCanvasRef,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // ref 노출
    useImperativeHandle(ref, () => ({
      canvas: canvasRef.current,
      container: containerRef.current,
    }));

    // Canvas ref 콜백
    useEffect(() => {
      onCanvasRef?.(canvasRef.current);
      return () => {
        onCanvasRef?.(null);
      };
    }, [onCanvasRef]);

    // Canvas 크기 설정 (DPR 적용)
    const canvasWidth = Math.floor(width * dpr);
    const canvasHeight = Math.floor(height * dpr);

    return (
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: `${width}px`,
          height: `${height}px`,
          background: '#000',
          overflow: 'hidden',
        }}
      >
        {/* WebGL Canvas (z-index: 0) */}
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 0,
            // 이벤트는 DOM Grid에서 처리
            pointerEvents: 'none',
          }}
        />

        {/* DOM Grid (z-index: 1) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 1,
            // CSS Grid 레이아웃
            display: 'grid',
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: `${gap}px`,
            padding: `${gap}px`,
            boxSizing: 'border-box',
          }}
        >
          {children}
        </div>
      </div>
    );
  }
);
