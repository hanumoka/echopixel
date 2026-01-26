/**
 * HybridViewportSlot - DOM 기반 뷰포트 슬롯
 *
 * DOM 요소로 이벤트를 수신하고, HybridViewportManager에 등록하여
 * WebGL Canvas와 좌표를 동기화합니다.
 *
 * 구조:
 * - 투명한 DOM 요소가 WebGL Canvas 위에 오버레이
 * - pointerEvents: 'auto'로 이벤트 캡처
 * - children으로 오버레이 UI 전달 (DicomMiniOverlay 등)
 *
 * @example
 * ```tsx
 * <HybridViewportSlot
 *   viewportId={id}
 *   manager={hybridManager}
 *   isSelected={activeId === id}
 *   onClick={handleClick}
 * >
 *   <DicomMiniOverlay index={index} ... />
 * </HybridViewportSlot>
 * ```
 */

import {
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from 'react';
import type { HybridViewportManager } from '@echopixel/core';
import { cn } from '../../utils';

/**
 * HybridViewportSlot Props
 */
export interface HybridViewportSlotProps {
  /** 뷰포트 ID */
  viewportId: string;
  /** HybridViewportManager 인스턴스 */
  manager: HybridViewportManager;
  /** 선택됨 여부 */
  isSelected?: boolean;
  /** 호버됨 여부 */
  isHovered?: boolean;
  /** 클릭 핸들러 */
  onClick?: (viewportId: string) => void;
  /** 더블클릭 핸들러 */
  onDoubleClick?: (viewportId: string) => void;
  /** 마우스 진입 핸들러 */
  onMouseEnter?: (viewportId: string) => void;
  /** 마우스 이탈 핸들러 */
  onMouseLeave?: (viewportId: string) => void;
  /** DOM 요소 참조 콜백 (Tool System용) */
  onElementRef?: (element: HTMLDivElement | null) => void;
  /** 자식 요소 (DicomMiniOverlay 등) */
  children?: ReactNode;
  /** 상단 도구바 영역 (이미지 밖 별도 영역) */
  topToolbar?: ReactNode;
  /** 상단 도구바 높이 (기본 0, 도구바가 있을 때 설정) */
  topToolbarHeight?: number;
  /** 하단 도구바 영역 (이미지 밖 별도 영역) */
  bottomToolbar?: ReactNode;
  /** 하단 도구바 높이 (기본 0, 도구바가 있을 때 설정) */
  bottomToolbarHeight?: number;
  /** 커스텀 스타일 */
  style?: CSSProperties;
  /** 커스텀 클래스명 */
  className?: string;
}

/**
 * HybridViewportSlot
 *
 * CSS Grid 셀로 배치되며, HybridViewportManager에 자신의 DOM 요소를 등록합니다.
 * - 마운트 시 registerSlot 호출
 * - 언마운트 시 unregisterSlot 호출
 */
export function HybridViewportSlot({
  viewportId,
  manager,
  isSelected = false,
  isHovered = false,
  onClick,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
  onElementRef,
  children,
  topToolbar,
  topToolbarHeight = 0,
  bottomToolbar,
  bottomToolbarHeight = 0,
  style,
  className,
}: HybridViewportSlotProps) {
  // 이미지 영역 ref (WebGL 렌더링 영역)
  const contentRef = useRef<HTMLDivElement>(null);

  // manager를 ref로 저장하여 cleanup 시에도 최신 참조 사용
  const managerRef = useRef(manager);

  // onElementRef를 ref로 저장 (무한 루프 방지)
  const onElementRefRef = useRef(onElementRef);

  // refs를 동기적으로 업데이트 (렌더링 후 즉시)
  useLayoutEffect(() => {
    managerRef.current = manager;
    onElementRefRef.current = onElementRef;
  });

  // 마운트 시 이미지 영역만 슬롯으로 등록 (도구바 제외)
  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const currentManager = managerRef.current;

    // HybridViewportManager에 이미지 영역만 등록
    currentManager.registerSlot(viewportId, element);

    // 언마운트 시 해제
    return () => {
      currentManager.unregisterSlot(viewportId);
    };
  }, [viewportId]);

  // Tool System용 DOM 요소 참조 콜백 (이미지 영역)
  useEffect(() => {
    onElementRefRef.current?.(contentRef.current);
    return () => onElementRefRef.current?.(null);
  }, []);  

  // 클릭 핸들러
  const handleClick = useCallback((e: React.MouseEvent) => {
    console.log('[HybridViewportSlot] handleClick - viewportId:', viewportId, 'stopping propagation');
    e.stopPropagation(); // 배경 클릭 핸들러로 전파 방지
    onClick?.(viewportId);
  }, [onClick, viewportId]);

  // 더블클릭 핸들러
  const handleDoubleClick = useCallback(() => {
    onDoubleClick?.(viewportId);
  }, [onDoubleClick, viewportId]);

  // 마우스 진입 핸들러
  const handleMouseEnter = useCallback(() => {
    onMouseEnter?.(viewportId);
  }, [onMouseEnter, viewportId]);

  // 마우스 이탈 핸들러
  const handleMouseLeave = useCallback(() => {
    onMouseLeave?.(viewportId);
  }, [onMouseLeave, viewportId]);

  return (
    <div
      data-viewport-id={viewportId}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'relative w-full h-full bg-transparent cursor-pointer box-border',
        'rounded-sm transition-[border] duration-100 pointer-events-auto',
        'flex flex-col overflow-hidden',
        isSelected
          ? 'border-[3px] border-border-selected'
          : isHovered
            ? 'border-2 border-border-hover'
            : 'border border-border',
        className
      )}
      style={style}
    >
      {/* 상단 도구바 영역 (이미지 밖) */}
      {topToolbar && (
        <div
          className="shrink-0"
          style={{ minHeight: topToolbarHeight > 0 ? `${topToolbarHeight}px` : 'auto' }}
        >
          {topToolbar}
        </div>
      )}

      {/* 이미지 영역 (WebGL 렌더링 대상) */}
      <div
        ref={contentRef}
        className="flex-1 relative min-h-0"
      >
        {children}
      </div>

      {/* 하단 도구바 영역 (이미지 밖) */}
      {bottomToolbar && (
        <div
          className="shrink-0"
          style={{ minHeight: bottomToolbarHeight > 0 ? `${bottomToolbarHeight}px` : 'auto' }}
        >
          {bottomToolbar}
        </div>
      )}
    </div>
  );
}
