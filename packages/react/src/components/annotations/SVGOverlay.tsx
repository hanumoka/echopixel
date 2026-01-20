/**
 * SVGOverlay - Annotation SVG Overlay Component
 *
 * 어노테이션을 SVG로 렌더링하는 오버레이 컴포넌트
 *
 * 책임:
 * - DICOM 좌표 → Canvas 좌표 변환
 * - 현재 프레임 어노테이션만 필터링
 * - 도형, 라벨, 핸들 렌더링
 * - 히트 테스트 및 선택/호버 처리
 *
 * 사용 위치:
 * - HybridViewportSlot의 children으로 전달
 * - DicomMiniOverlay와 함께 사용
 *
 * @example
 * ```tsx
 * <HybridViewportSlot viewportId={id} manager={manager}>
 *   <SVGOverlay
 *     annotations={annotations}
 *     currentFrame={frame}
 *     transformContext={context}
 *     onSelect={handleSelect}
 *     onUpdate={handleUpdate}
 *   />
 *   <DicomMiniOverlay ... />
 * </HybridViewportSlot>
 * ```
 */

import { useMemo, useCallback, useState, type CSSProperties } from 'react';
import type {
  Annotation,
  Point,
  SVGRenderConfig,
  ShapeRenderData,
  TransformContext,
  AnnotationEventHandlers,
} from '@echopixel/core';
import { coordinateTransformer } from '@echopixel/core';
import { LengthShape } from './shapes/LengthShape';
import { AngleShape } from './shapes/AngleShape';
import { PointShape } from './shapes/PointShape';

// =============================================================================
// Types
// =============================================================================

/**
 * SVGOverlay Props
 */
export interface SVGOverlayProps {
  /** 어노테이션 목록 */
  annotations: Annotation[];
  /** 현재 프레임 인덱스 */
  currentFrame: number;
  /** 좌표 변환 컨텍스트 */
  transformContext: TransformContext;
  /** 선택된 어노테이션 ID */
  selectedId?: string | null;
  /** 렌더링 설정 */
  config?: Partial<SVGRenderConfig>;
  /** 이벤트 핸들러 */
  handlers?: AnnotationEventHandlers;
  /** 읽기 전용 (편집 불가) */
  readOnly?: boolean;
  /** 커스텀 스타일 */
  style?: CSSProperties;
  /** 커스텀 클래스명 */
  className?: string;
}

// =============================================================================
// Default Config
// =============================================================================

const defaultConfig: SVGRenderConfig = {
  strokeColor: '#00ff00',
  selectedStrokeColor: '#ffff00',
  hoveredStrokeColor: '#88ff88',
  strokeWidth: 2,
  selectedStrokeWidth: 3,
  pointRadius: 4,
  handleRadius: 6,
  labelFontSize: 12,
  labelBackground: 'rgba(0, 0, 0, 0.7)',
  labelColor: '#ffffff',
  hitTolerance: 8,
};

// =============================================================================
// SVGOverlay Component
// =============================================================================

/**
 * SVGOverlay
 *
 * 어노테이션을 SVG로 렌더링하는 오버레이 컴포넌트
 */
export function SVGOverlay({
  annotations,
  currentFrame,
  transformContext,
  selectedId = null,
  config: customConfig,
  handlers,
  readOnly = false,
  style,
  className,
}: SVGOverlayProps) {
  // 호버 상태 관리
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 렌더링 설정
  const config = useMemo(
    () => ({ ...defaultConfig, ...customConfig }),
    [customConfig]
  );

  // 현재 프레임 어노테이션 필터링 및 Canvas 좌표 변환
  const renderDataList = useMemo(() => {
    // 현재 프레임의 visible 어노테이션만 필터
    const frameAnnotations = annotations.filter(
      (a) => a.frameIndex === currentFrame && a.visible
    );

    // DICOM → Canvas 좌표 변환
    return frameAnnotations.map((annotation): ShapeRenderData => {
      const canvasPoints = annotation.points.map((p: Point) =>
        coordinateTransformer.dicomToCanvas(p, transformContext)
      );

      const canvasLabelPosition = coordinateTransformer.dicomToCanvas(
        annotation.labelPosition,
        transformContext
      );

      return {
        id: annotation.id,
        type: annotation.type,
        points: canvasPoints,
        labelPosition: canvasLabelPosition,
        displayValue: annotation.displayValue,
        color: annotation.color || config.strokeColor,
        isSelected: annotation.id === selectedId,
        isHovered: annotation.id === hoveredId,
        annotation,
      };
    });
  }, [annotations, currentFrame, transformContext, selectedId, hoveredId, config.strokeColor]);

  // 선택 핸들러
  const handleSelect = useCallback(
    (id: string) => {
      if (readOnly) return;
      handlers?.onSelect?.(id);
    },
    [handlers, readOnly]
  );

  // 호버 핸들러
  const handleHover = useCallback(
    (id: string | null) => {
      setHoveredId(id);
      handlers?.onHover?.(id);
    },
    [handlers]
  );

  // 도형 렌더링
  const renderShape = useCallback(
    (data: ShapeRenderData) => {
      const commonProps = {
        data,
        config,
        onSelect: handleSelect,
        onHover: handleHover,
      };

      switch (data.type) {
        case 'length':
          return <LengthShape key={data.id} {...commonProps} />;
        case 'angle':
          return <AngleShape key={data.id} {...commonProps} />;
        case 'point':
          return <PointShape key={data.id} {...commonProps} />;
        default:
          // 미지원 타입은 기본 도형으로 렌더링
          console.warn(`Unknown annotation type: ${data.type}`);
          return null;
      }
    },
    [config, handleSelect, handleHover]
  );

  return (
    <svg
      className={className}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: readOnly ? 'none' : 'auto',
        overflow: 'visible',
        ...style,
      }}
    >
      {/* 어노테이션 도형들 */}
      <g className="annotation-shapes">
        {renderDataList.map(renderShape)}
      </g>
    </svg>
  );
}
