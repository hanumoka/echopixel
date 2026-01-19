/**
 * ViewportSlot - DOM 기반 뷰포트 슬롯
 *
 * 학습 포인트:
 * - DOM 요소로 이벤트 수신 (클릭, 호버, 드래그 등)
 * - HybridViewportManager에 등록하여 WebGL 좌표 동기화
 * - 실제 렌더링은 하위의 WebGL Canvas에서 수행
 *
 * 구조:
 * - 투명한 DOM 요소가 WebGL Canvas 위에 오버레이
 * - pointerEvents: 'auto'로 이벤트 캡처
 * - children으로 ViewportOverlay 전달
 */

import { useRef, useEffect, useCallback } from 'react';
import type { HybridViewportManager, Viewport } from '@echopixel/core';

export interface ViewportSlotProps {
  /** 뷰포트 ID */
  viewportId: string;
  /** HybridViewportManager 인스턴스 */
  manager: HybridViewportManager;
  /** 뷰포트 데이터 (선택적) */
  viewport?: Viewport | null;
  /** 선택됨 여부 */
  isSelected?: boolean;
  /** 호버됨 여부 */
  isHovered?: boolean;
  /** 클릭 핸들러 */
  onClick?: (viewportId: string) => void;
  /** 마우스 진입 핸들러 */
  onMouseEnter?: (viewportId: string) => void;
  /** 마우스 이탈 핸들러 */
  onMouseLeave?: (viewportId: string) => void;
  /** DOM 요소 참조 콜백 (Tool System용) */
  onElementRef?: (element: HTMLDivElement | null) => void;
  /** 자식 요소 (ViewportOverlay) */
  children?: React.ReactNode;
}

/**
 * ViewportSlot 컴포넌트
 *
 * CSS Grid 셀로 배치되며, HybridViewportManager에 자신의 DOM 요소를 등록합니다.
 * 마운트 시 registerSlot, 언마운트 시 unregisterSlot 호출.
 */
export function ViewportSlot({
  viewportId,
  manager,
  viewport,
  isSelected = false,
  isHovered = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onElementRef,
  children,
}: ViewportSlotProps) {
  const slotRef = useRef<HTMLDivElement>(null);

  // manager를 ref로 저장하여 cleanup 시에도 최신 참조 사용
  const managerRef = useRef(manager);
  managerRef.current = manager;

  // 마운트 시 슬롯 등록
  useEffect(() => {
    const element = slotRef.current;
    if (!element) return;

    const currentManager = managerRef.current;

    // HybridViewportManager에 슬롯 등록
    currentManager.registerSlot(viewportId, element);

    // 언마운트 시 해제 (등록했던 manager에서 해제)
    return () => {
      currentManager.unregisterSlot(viewportId);
    };
  }, [viewportId]); // manager는 ref로 관리하므로 의존성에서 제외

  // Tool System용 DOM 요소 참조 콜백
  useEffect(() => {
    onElementRef?.(slotRef.current);
    return () => onElementRef?.(null);
  }, [onElementRef]);

  // 클릭 핸들러
  const handleClick = useCallback(() => {
    onClick?.(viewportId);
  }, [onClick, viewportId]);

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
      ref={slotRef}
      data-viewport-id={viewportId}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        // 이벤트 수신을 위해 투명 배경 필요
        background: 'transparent',
        cursor: 'pointer',
        // 테두리 스타일
        boxSizing: 'border-box',
        border: isSelected
          ? '3px solid #4cf'
          : isHovered
            ? '2px solid rgba(100, 200, 255, 0.7)'
            : '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '2px',
        transition: 'border 0.1s ease',
        // 포인터 이벤트 활성화
        pointerEvents: 'auto',
        // flexbox로 자식 중앙 정렬
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 오버레이 자식 요소 (ViewportOverlay) */}
      {children}
    </div>
  );
}
