/**
 * MeasurementLabel - Measurement Value Label Component
 *
 * 측정값을 표시하는 라벨 컴포넌트
 *
 * 특징:
 * - SVG foreignObject로 HTML 텍스트 렌더링
 * - 배경 박스와 함께 표시
 * - 드래그 가능 (향후 구현)
 */

import type { Point } from '@echopixel/core';

/**
 * MeasurementLabel Props
 */
export interface MeasurementLabelProps {
  /** 위치 (Canvas 좌표) */
  position: Point;
  /** 표시 텍스트 */
  text: string;
  /** 텍스트 색상 */
  color?: string;
  /** 배경 색상 */
  background?: string;
  /** 폰트 크기 */
  fontSize?: number;
  /** 선택됨 여부 */
  isSelected?: boolean;
  /** 드래그 시작 핸들러 */
  onDragStart?: () => void;
}

/**
 * MeasurementLabel
 *
 * SVG foreignObject를 사용하여 HTML 텍스트 렌더링
 */
export function MeasurementLabel({
  position,
  text,
  color = '#ffffff',
  background = 'rgba(0, 0, 0, 0.7)',
  fontSize = 12,
  isSelected = false,
}: MeasurementLabelProps) {
  // 라벨 크기 추정 (대략적)
  const estimatedWidth = text.length * fontSize * 0.6 + 12;
  const estimatedHeight = fontSize + 8;

  // 선택 상태에 따른 스타일
  const selectedBorder = isSelected ? '1px solid #ffff00' : 'none';

  return (
    <g className="measurement-label">
      {/* foreignObject로 HTML 렌더링 */}
      <foreignObject
        x={position.x - estimatedWidth / 2}
        y={position.y - estimatedHeight / 2}
        width={estimatedWidth}
        height={estimatedHeight}
        style={{ overflow: 'visible' }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2px 6px',
            background,
            color,
            fontSize: `${fontSize}px`,
            fontFamily: 'monospace',
            fontWeight: isSelected ? 'bold' : 'normal',
            borderRadius: '3px',
            border: selectedBorder,
            whiteSpace: 'nowrap',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
            pointerEvents: 'none',
          }}
        >
          {text}
        </div>
      </foreignObject>
    </g>
  );
}
