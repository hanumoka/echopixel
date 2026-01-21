/**
 * PointShape - Point Annotation SVG Shape
 *
 * 단일 점을 표시하는 도형 (D-mode 속도 측정용)
 *
 * 렌더링:
 * - 점 위치에 십자선 또는 마커
 * - 측정값 라벨
 * - 선택 시 드래그 핸들 표시
 */

import { useCallback } from 'react';
import type { ShapeProps } from '@echopixel/core';
import { MeasurementLabel } from '../MeasurementLabel';
import { DragHandle } from '../DragHandle';

/**
 * PointShape
 */
export function PointShape({
  data,
  config,
  onSelect,
  onHover,
  showHandles = false,
  onPointDragStart,
}: ShapeProps) {
  const { id, points, labelPosition, displayValue, color, isSelected, isHovered } = data;

  // 점이 1개 미만이면 렌더링 안함
  if (points.length < 1) {
    return null;
  }

  const point = points[0];

  // 색상 결정
  const strokeColor = isSelected
    ? config.selectedStrokeColor
    : isHovered
      ? config.hoveredStrokeColor
      : color;

  const strokeWidth = isSelected ? config.selectedStrokeWidth : config.strokeWidth;

  // 십자선 크기
  const crossSize = isSelected ? 12 : 10;

  // 이벤트 핸들러
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.(id);
    },
    [id, onSelect]
  );

  // mousedown에서도 전파 중단 (MeasurementTool이 새 어노테이션 생성하는 것 방지)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
    },
    []
  );

  const handleMouseEnter = useCallback(() => {
    onHover?.(id);
  }, [id, onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover?.(null);
  }, [onHover]);

  return (
    <g
      className="annotation-shape point-shape"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: 'pointer' }}
    >
      {/* 히트 영역 (투명한 큰 원) */}
      <circle
        cx={point.x}
        cy={point.y}
        r={config.hitTolerance * 2}
        fill="transparent"
        style={{ pointerEvents: 'fill' }}
      />

      {/* 십자선 - 수평 */}
      <line
        x1={point.x - crossSize}
        y1={point.y}
        x2={point.x + crossSize}
        y2={point.y}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={config.strokeDasharray}
        style={{ pointerEvents: 'none' }}
      />

      {/* 십자선 - 수직 */}
      <line
        x1={point.x}
        y1={point.y - crossSize}
        x2={point.x}
        y2={point.y + crossSize}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={config.strokeDasharray}
        style={{ pointerEvents: 'none' }}
      />

      {/* 중심점 */}
      <circle
        cx={point.x}
        cy={point.y}
        r={config.pointRadius * 0.8}
        fill={strokeColor}
        style={{ pointerEvents: 'none' }}
      />

      {/* 측정값 라벨 */}
      <MeasurementLabel
        position={labelPosition}
        text={displayValue}
        color={config.labelColor}
        background={config.labelBackground}
        fontSize={config.labelFontSize}
        isSelected={isSelected}
      />

      {/* 드래그 핸들 (선택 시만 표시) */}
      {showHandles && (
        <DragHandle
          position={point}
          radius={config.handleRadius}
          isActive={true}
          onDragStart={(e) => onPointDragStart?.(0, e)}
        />
      )}
    </g>
  );
}
