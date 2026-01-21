/**
 * DragHandle - Draggable Handle Component
 *
 * 어노테이션 포인트/라벨을 드래그하기 위한 핸들
 *
 * 특징:
 * - 호버 시 강조 표시
 * - 드래그 이벤트 처리
 * - 커스텀 스타일 지원
 */

import { useCallback, useState } from 'react';
import type { Point } from '@echopixel/core';

/**
 * DragHandle Props
 */
export interface DragHandleProps {
  /** 위치 (Canvas 좌표) */
  position: Point;
  /** 반지름 */
  radius?: number;
  /** 기본 색상 */
  color?: string;
  /** 활성화 색상 (호버/드래그) */
  activeColor?: string;
  /** 활성화 여부 (선택된 어노테이션) */
  isActive?: boolean;
  /** 드래그 시작 핸들러 */
  onDragStart?: (e: React.MouseEvent) => void;
}

/**
 * DragHandle
 *
 * 드래그 가능한 원형 핸들
 */
export function DragHandle({
  position,
  radius = 6,
  color = '#ffffff',
  activeColor = '#ffff00',
  isActive = false,
  onDragStart,
}: DragHandleProps) {
  const [isHovered, setIsHovered] = useState(false);

  // 현재 색상 결정
  const currentColor = isHovered || isActive ? activeColor : color;
  const currentRadius = isHovered ? radius * 1.2 : radius;

  // 이벤트 핸들러
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // React SyntheticEvent 전파 중지
      e.stopPropagation();
      e.preventDefault();

      // ★ Native DOM 이벤트 전파도 중지
      // ToolGroup 등 native addEventListener로 등록된 리스너가
      // 이 이벤트를 처리하지 않도록 함
      e.nativeEvent.stopImmediatePropagation();

      onDragStart?.(e);
    },
    [onDragStart]
  );

  return (
    <g className="drag-handle">
      {/* 히트 영역 (더 큰 투명 원) */}
      <circle
        cx={position.x}
        cy={position.y}
        r={radius * 2}
        fill="transparent"
        style={{ cursor: 'move', pointerEvents: 'fill' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
      />

      {/* 외곽선 */}
      <circle
        cx={position.x}
        cy={position.y}
        r={currentRadius}
        fill="none"
        stroke={currentColor}
        strokeWidth={2}
        style={{ pointerEvents: 'none', transition: 'r 0.1s ease' }}
      />

      {/* 내부 채움 */}
      <circle
        cx={position.x}
        cy={position.y}
        r={currentRadius * 0.5}
        fill={currentColor}
        style={{ pointerEvents: 'none', transition: 'r 0.1s ease' }}
      />
    </g>
  );
}
