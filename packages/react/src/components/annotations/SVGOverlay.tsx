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
  TempAnnotation,
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
  /** 임시 어노테이션 (드로잉 중 미리보기, Phase 3f) */
  tempAnnotation?: TempAnnotation | null;
  /** 임시 어노테이션 타입 (Length, Angle, Point) */
  tempAnnotationType?: 'length' | 'angle' | 'point';
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
  tempAnnotation = null,
  tempAnnotationType,
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

  // 임시 어노테이션 렌더링 데이터 (Phase 3f)
  const tempRenderData = useMemo((): ShapeRenderData | null => {
    if (!tempAnnotation || !tempAnnotationType) return null;

    // 확정된 포인트들 + 현재 마우스 위치
    const allPoints = tempAnnotation.currentPoint
      ? [...tempAnnotation.points, tempAnnotation.currentPoint]
      : tempAnnotation.points;

    if (allPoints.length === 0) return null;

    // DICOM → Canvas 좌표 변환
    const canvasPoints = allPoints.map((p: Point) =>
      coordinateTransformer.dicomToCanvas(p, transformContext)
    );

    // 라벨 위치 (마지막 포인트 근처)
    const lastPoint = canvasPoints[canvasPoints.length - 1];
    const labelPosition = { x: lastPoint.x + 10, y: lastPoint.y - 10 };

    return {
      id: 'temp-annotation',
      type: tempAnnotationType,
      points: canvasPoints,
      labelPosition,
      displayValue: tempAnnotation.measurement?.displayText || '...',
      color: config.strokeColor,
      isSelected: false,
      isHovered: false,
      annotation: null as unknown as Annotation, // 임시 어노테이션은 Annotation 객체 없음
    };
  }, [tempAnnotation, tempAnnotationType, transformContext, config.strokeColor]);

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

  // 임시 어노테이션 도형 렌더링 (점선 스타일)
  const renderTempShape = useCallback(
    (data: ShapeRenderData) => {
      // 점선 스타일 설정 적용
      const tempConfig = {
        ...config,
        strokeDasharray: '5,5', // 점선 패턴
      };

      const commonProps = {
        data,
        config: tempConfig,
        onSelect: () => {}, // 임시 어노테이션은 선택 불가
        onHover: () => {},  // 임시 어노테이션은 호버 불가
      };

      // 포인트 수에 따른 렌더링 결정
      const pointCount = data.points.length;

      switch (data.type) {
        case 'length':
          // Length: 2개 포인트 필요, 1개면 점만 표시
          if (pointCount < 2) {
            return (
              <g key="temp-length-partial">
                {data.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={tempConfig.pointRadius}
                    fill={tempConfig.strokeColor}
                  />
                ))}
              </g>
            );
          }
          return <LengthShape key="temp-length" {...commonProps} />;
        case 'angle':
          // Angle: 3개 포인트 필요, 2개면 선만, 1개면 점만 표시
          if (pointCount < 2) {
            return (
              <g key="temp-angle-partial">
                {data.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={tempConfig.pointRadius}
                    fill={tempConfig.strokeColor}
                  />
                ))}
              </g>
            );
          }
          if (pointCount < 3) {
            // 2개 포인트: 선과 점 표시
            const [p1, p2] = data.points;
            return (
              <g key="temp-angle-partial">
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={tempConfig.strokeColor}
                  strokeWidth={tempConfig.strokeWidth}
                  strokeDasharray={tempConfig.strokeDasharray}
                  strokeLinecap="round"
                />
                <circle cx={p1.x} cy={p1.y} r={tempConfig.pointRadius} fill={tempConfig.strokeColor} />
                <circle cx={p2.x} cy={p2.y} r={tempConfig.pointRadius} fill={tempConfig.strokeColor} />
              </g>
            );
          }
          return <AngleShape key="temp-angle" {...commonProps} />;
        case 'point':
          return <PointShape key="temp-point" {...commonProps} />;
        default:
          return null;
      }
    },
    [config]
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

      {/* 임시 어노테이션 (드로잉 중 미리보기, 점선 스타일) */}
      {tempRenderData && (
        <g className="temp-annotation" style={{ opacity: 0.8 }}>
          {renderTempShape(tempRenderData)}
        </g>
      )}
    </svg>
  );
}
