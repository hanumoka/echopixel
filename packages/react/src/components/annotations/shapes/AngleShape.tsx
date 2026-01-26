/**
 * AngleShape - Angle Annotation SVG Shape
 *
 * 세 점으로 각도를 표시하는 도형
 *
 * 렌더링:
 * - P1 → P2 → P3를 연결하는 두 선
 * - 꼭짓점(P2)에 각도 아크
 * - 세 점에 작은 원
 * - 측정값 라벨
 * - 선택 시 드래그 핸들 표시
 */

import { useCallback, useMemo } from 'react';
import type { ShapeProps, Point } from '@echopixel/core';
import { MeasurementLabel } from '../MeasurementLabel';
import { DragHandle } from '../DragHandle';

/**
 * 각도 아크 경로 생성
 */
function createArcPath(
  vertex: Point,
  p1: Point,
  p3: Point,
  radius: number
): string {
  // 벡터 계산
  const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
  const v2 = { x: p3.x - vertex.x, y: p3.y - vertex.y };

  // 벡터 정규화
  const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

  if (len1 === 0 || len2 === 0) {
    return '';
  }

  const n1 = { x: v1.x / len1, y: v1.y / len1 };
  const n2 = { x: v2.x / len2, y: v2.y / len2 };

  // 아크 시작/끝점
  const start = {
    x: vertex.x + n1.x * radius,
    y: vertex.y + n1.y * radius,
  };
  const end = {
    x: vertex.x + n2.x * radius,
    y: vertex.y + n2.y * radius,
  };

  // 각도 계산 (라디안)
  const angle1 = Math.atan2(n1.y, n1.x);
  const angle2 = Math.atan2(n2.y, n2.x);
  let angleDiff = angle2 - angle1;

  // 각도 정규화 (-π ~ π)
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

  // 큰 아크 플래그
  const largeArcFlag = Math.abs(angleDiff) > Math.PI ? 1 : 0;
  // 스윕 플래그 (시계 방향)
  const sweepFlag = angleDiff > 0 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
}

/**
 * AngleShape
 */
export function AngleShape({
  data,
  config,
  onSelect,
  onHover,
  showHandles = false,
  onPointDragStart,
}: ShapeProps) {
  const { id, points, labelPosition, displayValue, color, isSelected, isHovered } = data;

  // 안전한 포인트 추출 (Hooks 호출 전에 기본값 설정)
  const p1 = points[0] ?? { x: 0, y: 0 };
  const p2 = points[1] ?? { x: 0, y: 0 };
  const p3 = points[2] ?? { x: 0, y: 0 };

  // 아크 경로 계산 (Hooks는 early return 전에 호출해야 함)
  const arcPath = useMemo(
    () => points.length >= 3 ? createArcPath(p2, p1, p3, 20) : '',
    [p1, p2, p3, points.length]
  );

  // 이벤트 핸들러 (Hooks는 early return 전에 호출해야 함)
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

  // 점이 3개 미만이면 렌더링 안함
  if (points.length < 3) {
    return null;
  }

  // 색상 결정
  const strokeColor = isSelected
    ? config.selectedStrokeColor
    : isHovered
      ? config.hoveredStrokeColor
      : color;

  const strokeWidth = isSelected ? config.selectedStrokeWidth : config.strokeWidth;

  return (
    <g
      className="annotation-shape angle-shape"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: 'pointer' }}
    >
      {/* 히트 영역 - 첫 번째 선 */}
      <line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke="transparent"
        strokeWidth={config.hitTolerance * 2}
        style={{ pointerEvents: 'stroke' }}
      />

      {/* 히트 영역 - 두 번째 선 */}
      <line
        x1={p2.x}
        y1={p2.y}
        x2={p3.x}
        y2={p3.y}
        stroke="transparent"
        strokeWidth={config.hitTolerance * 2}
        style={{ pointerEvents: 'stroke' }}
      />

      {/* 첫 번째 선 (P1 → P2) */}
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

      {/* 두 번째 선 (P2 → P3) */}
      <line
        x1={p2.x}
        y1={p2.y}
        x2={p3.x}
        y2={p3.y}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={config.strokeDasharray}
        style={{ pointerEvents: 'none' }}
      />

      {/* 각도 아크 */}
      {arcPath && (
        <path
          d={arcPath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth * 0.7}
          strokeLinecap="round"
          strokeDasharray={config.strokeDasharray}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* 시작점 (P1) */}
      <circle
        cx={p1.x}
        cy={p1.y}
        r={config.pointRadius}
        fill={strokeColor}
        style={{ pointerEvents: 'none' }}
      />

      {/* 꼭짓점 (P2) */}
      <circle
        cx={p2.x}
        cy={p2.y}
        r={config.pointRadius}
        fill={strokeColor}
        style={{ pointerEvents: 'none' }}
      />

      {/* 끝점 (P3) */}
      <circle
        cx={p3.x}
        cy={p3.y}
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

      {/* 드래그 핸들 (선택 시만 표시) */}
      {showHandles && (
        <>
          <DragHandle
            position={p1}
            radius={config.handleRadius}
            isActive={true}
            onDragStart={(e) => onPointDragStart?.(0, e)}
          />
          <DragHandle
            position={p2}
            radius={config.handleRadius}
            isActive={true}
            onDragStart={(e) => onPointDragStart?.(1, e)}
          />
          <DragHandle
            position={p3}
            radius={config.handleRadius}
            isActive={true}
            onDragStart={(e) => onPointDragStart?.(2, e)}
          />
        </>
      )}
    </g>
  );
}
