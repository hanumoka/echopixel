/**
 * LengthShape - Length Annotation SVG Shape
 *
 * 두 점 사이의 거리를 표시하는 도형
 *
 * 렌더링:
 * - 두 점을 연결하는 선
 * - 양 끝점에 작은 원
 * - 측정값 라벨
 */

import { useCallback } from 'react';
import type { ShapeProps } from '@echopixel/core';
import { MeasurementLabel } from '../MeasurementLabel';

/**
 * LengthShape
 */
export function LengthShape({
  data,
  config,
  onSelect,
  onHover,
}: ShapeProps) {
  const { id, points, labelPosition, displayValue, color, isSelected, isHovered } = data;

  // 점이 2개 미만이면 렌더링 안함
  if (points.length < 2) {
    return null;
  }

  const [p1, p2] = points;

  // 색상 결정
  const strokeColor = isSelected
    ? config.selectedStrokeColor
    : isHovered
      ? config.hoveredStrokeColor
      : color;

  const strokeWidth = isSelected ? config.selectedStrokeWidth : config.strokeWidth;

  // 이벤트 핸들러
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.(id);
    },
    [id, onSelect]
  );

  const handleMouseEnter = useCallback(() => {
    onHover?.(id);
  }, [id, onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover?.(null);
  }, [onHover]);

  return (
    <g
      className="length-shape"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: 'pointer' }}
    >
      {/* 히트 영역 (투명, 더 넓은 영역) */}
      <line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke="transparent"
        strokeWidth={config.hitTolerance * 2}
        style={{ pointerEvents: 'stroke' }}
      />

      {/* 메인 라인 */}
      <line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={config.strokeDasharray}
        style={{ pointerEvents: 'none' }}
      />

      {/* 시작점 */}
      <circle
        cx={p1.x}
        cy={p1.y}
        r={config.pointRadius}
        fill={strokeColor}
        style={{ pointerEvents: 'none' }}
      />

      {/* 끝점 */}
      <circle
        cx={p2.x}
        cy={p2.y}
        r={config.pointRadius}
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
    </g>
  );
}
