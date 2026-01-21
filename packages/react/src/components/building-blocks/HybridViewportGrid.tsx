/**
 * HybridViewportGrid - CSS Grid 기반 뷰포트 그리드
 *
 * Canvas와 DOM Grid를 레이어링하여 하이브리드 렌더링을 구현합니다.
 *
 * 구조:
 * ┌─────────────────────────────────────┐
 * │  position: relative (container)     │
 * │  ┌───────────────────────────────┐  │
 * │  │ Canvas (z-index: 0, absolute) │  │ ← WebGL 렌더링
 * │  └───────────────────────────────┘  │
 * │  ┌───────────────────────────────┐  │
 * │  │ DOM Grid (z-index: 1)         │  │ ← 이벤트 처리
 * │  │  ┌─────┐ ┌─────┐ ┌─────┐     │  │
 * │  │  │Slot │ │Slot │ │Slot │ ... │  │
 * │  │  └─────┘ └─────┘ └─────┘     │  │
 * │  └───────────────────────────────┘  │
 * └─────────────────────────────────────┘
 *
 * @example
 * ```tsx
 * <HybridViewportGrid
 *   rows={2}
 *   cols={2}
 *   width={800}
 *   height={600}
 *   onCanvasRef={handleCanvasRef}
 * >
 *   {viewportIds.map((id) => (
 *     <HybridViewportSlot key={id} viewportId={id} ... />
 *   ))}
 * </HybridViewportGrid>
 * ```
 */

import {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  type ReactNode,
  type CSSProperties,
} from 'react';

/**
 * HybridViewportGrid Props
 */
export interface HybridViewportGridProps {
  /** 행 수 */
  rows: number;
  /** 열 수 */
  cols: number;
  /** 컨테이너 너비 (CSS 픽셀) */
  width: number;
  /** 컨테이너 높이 (CSS 픽셀) */
  height: number;
  /** 그리드 셀 간격 (CSS 픽셀, 기본 2) */
  gap?: number;
  /** Device Pixel Ratio (기본 자동 감지, 최대 2) */
  dpr?: number;
  /** Canvas ref 콜백 */
  onCanvasRef?: (canvas: HTMLCanvasElement | null) => void;
  /** 자식 요소 (HybridViewportSlot[]) */
  children?: ReactNode;
  /** 커스텀 스타일 */
  style?: CSSProperties;
  /** 커스텀 클래스명 */
  className?: string;
}

/**
 * HybridViewportGrid 외부 제어용 핸들
 */
export interface HybridViewportGridHandle {
  /** Canvas 요소 */
  getCanvas: () => HTMLCanvasElement | null;
  /** 컨테이너 요소 */
  getContainer: () => HTMLDivElement | null;
}

/**
 * HybridViewportGrid
 *
 * Canvas와 DOM Grid를 겹쳐 배치하여 하이브리드 렌더링을 구현합니다.
 * - Canvas: WebGL 렌더링 (z-index: 0, pointerEvents: none)
 * - DOM Grid: 이벤트 처리 (z-index: 1)
 */
export const HybridViewportGrid = forwardRef<
  HybridViewportGridHandle,
  HybridViewportGridProps
>(function HybridViewportGrid(
  {
    rows,
    cols,
    width,
    height,
    gap = 2,
    dpr,
    onCanvasRef,
    children,
    style,
    className,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // DPR 계산 (props 우선, 없으면 자동 감지)
  const effectiveDpr = dpr ?? Math.min(window.devicePixelRatio || 1, 2);

  // ref 노출
  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    getContainer: () => containerRef.current,
  }));

  // Canvas ref 콜백
  useEffect(() => {
    onCanvasRef?.(canvasRef.current);
    return () => {
      onCanvasRef?.(null);
    };
  }, [onCanvasRef]);

  // Canvas 크기 설정 (DPR 적용)
  const canvasWidth = Math.floor(width * effectiveDpr);
  const canvasHeight = Math.floor(height * effectiveDpr);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: `${width}px`,
        height: `${height}px`,
        background: '#1a1a1a', // 어두운 회색 - DICOM 이미지와 구분
        overflow: 'hidden',
        ...style,
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
});
