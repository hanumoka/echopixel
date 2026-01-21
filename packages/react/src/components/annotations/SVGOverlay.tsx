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

import { useMemo, useCallback, useState, useRef, useEffect, type CSSProperties } from 'react';
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
// Drag State Type
// =============================================================================

/**
 * 포인트 드래그 상태
 */
interface PointDragState {
  /** 드래그 중인 어노테이션 ID */
  annotationId: string;
  /** 드래그 중인 포인트 인덱스 */
  pointIndex: number;
  /** 드래그 시작 시 Canvas 좌표 */
  startCanvasPoint: Point;
  /** 드래그 시작 시 DICOM 좌표 */
  startDicomPoint: Point;
  /** 원본 어노테이션 (드래그 취소용) */
  originalAnnotation: Annotation;
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

  // 드래그 상태 관리
  const [dragState, setDragState] = useState<PointDragState | null>(null);
  // 드래그 중 임시 포인트 업데이트 (실시간 피드백)
  const [draggedPoints, setDraggedPoints] = useState<Map<string, Point[]>>(new Map());
  // SVG ref (좌표 계산용)
  const svgRef = useRef<SVGSVGElement>(null);

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
      // 드래그 중인 경우 임시 포인트 사용
      const dicomPoints = draggedPoints.get(annotation.id) || annotation.points;

      const canvasPoints = dicomPoints.map((p: Point) =>
        coordinateTransformer.dicomToCanvas(p, transformContext)
      );

      // 라벨 위치도 드래그 중이면 재계산
      const labelPosition = draggedPoints.has(annotation.id)
        ? { x: dicomPoints[dicomPoints.length - 1].x + 10, y: dicomPoints[dicomPoints.length - 1].y - 10 }
        : annotation.labelPosition;

      const canvasLabelPosition = coordinateTransformer.dicomToCanvas(
        labelPosition,
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
  }, [annotations, currentFrame, transformContext, selectedId, hoveredId, config.strokeColor, draggedPoints]);

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

  // 포인트 드래그 시작 핸들러
  const handlePointDragStart = useCallback(
    (annotationId: string, pointIndex: number, e: React.MouseEvent) => {
      if (readOnly) return;

      const annotation = annotations.find((a) => a.id === annotationId);
      if (!annotation) return;

      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;

      setDragState({
        annotationId,
        pointIndex,
        startCanvasPoint: { x: canvasX, y: canvasY },
        startDicomPoint: annotation.points[pointIndex],
        originalAnnotation: { ...annotation, points: [...annotation.points] },
      });

      // 초기 드래그 포인트 설정
      setDraggedPoints(new Map([[annotationId, [...annotation.points]]]));
    },
    [annotations, readOnly]
  );

  // 드래그 이벤트용 ref 관리 (useEffect 의존성 최소화)
  // 드래그 중에 transformContext나 handlers가 변경되어도 이벤트 리스너가 재등록되지 않도록 함
  const dragStateRef = useRef(dragState);
  const draggedPointsRef = useRef(draggedPoints);
  const transformContextRef = useRef(transformContext);
  const handlersRef = useRef(handlers);

  // 매 렌더링마다 최신 값으로 업데이트
  dragStateRef.current = dragState;
  draggedPointsRef.current = draggedPoints;
  transformContextRef.current = transformContext;
  handlersRef.current = handlers;

  // Document 레벨 드래그 이벤트 핸들링
  // 의존성을 dragState만으로 최소화하여 드래그 중 안정성 확보
  useEffect(() => {
    if (!dragState) return;

    const handleDocumentMouseMove = (e: MouseEvent) => {
      const currentDragState = dragStateRef.current;
      if (!currentDragState) return;

      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;

      // Canvas → DICOM 좌표 변환 (최신 transformContext 사용)
      const newDicomPoint = coordinateTransformer.canvasToDicom(
        { x: canvasX, y: canvasY },
        transformContextRef.current
      );

      // 임시 포인트 업데이트 (실시간 피드백)
      const { annotationId, pointIndex, originalAnnotation } = currentDragState;
      const newPoints = [...originalAnnotation.points];
      newPoints[pointIndex] = newDicomPoint;

      setDraggedPoints(new Map([[annotationId, newPoints]]));
    };

    const handleDocumentMouseUp = () => {
      const currentDragState = dragStateRef.current;
      if (!currentDragState) return;

      const { annotationId, originalAnnotation } = currentDragState;
      const finalPoints = draggedPointsRef.current.get(annotationId);
      const currentHandlers = handlersRef.current;
      const currentTransformContext = transformContextRef.current;

      if (finalPoints && currentHandlers?.onUpdate) {
        // 새 측정값 계산
        const annotationType = originalAnnotation.type;
        let value = originalAnnotation.value;
        let unit = originalAnnotation.unit;
        let displayValue = originalAnnotation.displayValue;

        // 타입별 측정값 재계산
        if (annotationType === 'length' && finalPoints.length >= 2) {
          const distResult = coordinateTransformer.calculateDistance(
            finalPoints[0],
            finalPoints[1],
            currentTransformContext
          );
          if (distResult.physical !== undefined && distResult.unit) {
            value = distResult.physical;
            unit = distResult.unit;
            displayValue = `${value.toFixed(2)} ${unit}`;
          } else {
            value = distResult.pixels;
            unit = 'px';
            displayValue = `${value.toFixed(1)} px`;
          }
        } else if (annotationType === 'angle' && finalPoints.length >= 3) {
          value = coordinateTransformer.calculateAngle(
            finalPoints[0],
            finalPoints[1],
            finalPoints[2]
          );
          unit = '°';
          displayValue = `${value.toFixed(1)}°`;
        } else if (annotationType === 'point' && finalPoints.length >= 1) {
          // Point 어노테이션은 좌표값만 표시
          const pt = finalPoints[0];
          displayValue = `(${pt.x}, ${pt.y})`;
        }

        // 라벨 위치 업데이트 (마지막 포인트 기준)
        const lastPoint = finalPoints[finalPoints.length - 1];
        const labelPosition = { x: lastPoint.x + 10, y: lastPoint.y - 10 };

        // 업데이트된 어노테이션 생성
        const updatedAnnotation: Annotation = {
          ...originalAnnotation,
          points: finalPoints,
          labelPosition,
          value,
          unit,
          displayValue,
          updatedAt: Date.now(),
        };

        currentHandlers.onUpdate(updatedAnnotation);
      }

      // 드래그 상태 초기화
      setDragState(null);
      setDraggedPoints(new Map());
    };

    // Document 레벨 이벤트 등록 (SVG 영역 밖에서도 드래그 가능)
    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, [dragState]); // 의존성을 dragState만으로 최소화

  // 도형 렌더링
  const renderShape = useCallback(
    (data: ShapeRenderData) => {
      const showHandles = !readOnly && data.id === selectedId;

      const commonProps = {
        data,
        config,
        onSelect: handleSelect,
        onHover: handleHover,
        showHandles,
        onPointDragStart: showHandles
          ? (pointIndex: number, e: React.MouseEvent) =>
              handlePointDragStart(data.id, pointIndex, e)
          : undefined,
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
    [config, handleSelect, handleHover, handlePointDragStart, selectedId, readOnly]
  );

  // 임시 어노테이션 도형 렌더링 (점선 스타일, 상호작용 없음)
  // Shape 컴포넌트 대신 단순 SVG 요소 사용 (히트 영역 없음, 이벤트 통과)
  const renderTempShape = useCallback(
    (data: ShapeRenderData) => {
      const strokeColor = config.strokeColor;
      const strokeWidth = config.strokeWidth;
      const pointRadius = config.pointRadius;
      const strokeDasharray = '5,5'; // 점선 패턴

      const pointCount = data.points.length;

      switch (data.type) {
        case 'length': {
          if (pointCount < 1) return null;
          if (pointCount < 2) {
            // 1개 포인트: 점만 표시
            const p = data.points[0];
            return (
              <circle
                key="temp-length-point"
                cx={p.x}
                cy={p.y}
                r={pointRadius}
                fill={strokeColor}
              />
            );
          }
          // 2개 포인트: 선과 양 끝점
          const [p1, p2] = data.points;
          return (
            <g key="temp-length">
              <line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeLinecap="round"
              />
              <circle cx={p1.x} cy={p1.y} r={pointRadius} fill={strokeColor} />
              <circle cx={p2.x} cy={p2.y} r={pointRadius} fill={strokeColor} />
              {/* 라벨 */}
              {data.displayValue && (
                <text
                  x={data.labelPosition.x}
                  y={data.labelPosition.y}
                  fill={config.labelColor}
                  fontSize={config.labelFontSize}
                  textAnchor="start"
                  dominantBaseline="middle"
                  style={{ pointerEvents: 'none' }}
                >
                  {data.displayValue}
                </text>
              )}
            </g>
          );
        }
        case 'angle': {
          if (pointCount < 1) return null;
          if (pointCount < 2) {
            // 1개 포인트: 점만 표시
            const p = data.points[0];
            return (
              <circle
                key="temp-angle-point"
                cx={p.x}
                cy={p.y}
                r={pointRadius}
                fill={strokeColor}
              />
            );
          }
          if (pointCount < 3) {
            // 2개 포인트: 선과 점
            const [p1, p2] = data.points;
            return (
              <g key="temp-angle-line">
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeLinecap="round"
                />
                <circle cx={p1.x} cy={p1.y} r={pointRadius} fill={strokeColor} />
                <circle cx={p2.x} cy={p2.y} r={pointRadius} fill={strokeColor} />
              </g>
            );
          }
          // 3개 포인트: 두 선과 세 점
          const [p1, p2, p3] = data.points;
          return (
            <g key="temp-angle">
              <line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeLinecap="round"
              />
              <line
                x1={p2.x}
                y1={p2.y}
                x2={p3.x}
                y2={p3.y}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeLinecap="round"
              />
              <circle cx={p1.x} cy={p1.y} r={pointRadius} fill={strokeColor} />
              <circle cx={p2.x} cy={p2.y} r={pointRadius} fill={strokeColor} />
              <circle cx={p3.x} cy={p3.y} r={pointRadius} fill={strokeColor} />
              {/* 라벨 */}
              {data.displayValue && (
                <text
                  x={data.labelPosition.x}
                  y={data.labelPosition.y}
                  fill={config.labelColor}
                  fontSize={config.labelFontSize}
                  textAnchor="start"
                  dominantBaseline="middle"
                  style={{ pointerEvents: 'none' }}
                >
                  {data.displayValue}
                </text>
              )}
            </g>
          );
        }
        case 'point': {
          if (pointCount < 1) return null;
          const p = data.points[0];
          const crossSize = 10;
          return (
            <g key="temp-point">
              {/* 십자선 */}
              <line
                x1={p.x - crossSize}
                y1={p.y}
                x2={p.x + crossSize}
                y2={p.y}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeLinecap="round"
              />
              <line
                x1={p.x}
                y1={p.y - crossSize}
                x2={p.x}
                y2={p.y + crossSize}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeLinecap="round"
              />
              <circle cx={p.x} cy={p.y} r={pointRadius * 0.8} fill={strokeColor} />
              {/* 라벨 */}
              {data.displayValue && (
                <text
                  x={data.labelPosition.x}
                  y={data.labelPosition.y}
                  fill={config.labelColor}
                  fontSize={config.labelFontSize}
                  textAnchor="start"
                  dominantBaseline="middle"
                  style={{ pointerEvents: 'none' }}
                >
                  {data.displayValue}
                </text>
              )}
            </g>
          );
        }
        default:
          return null;
      }
    },
    [config]
  );

  return (
    <svg
      ref={svgRef}
      className={className}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: readOnly ? 'none' : 'auto',
        overflow: 'visible',
        cursor: dragState ? 'move' : undefined,
        ...style,
      }}
      // 드래그 이벤트는 document 레벨에서 처리 (SVG 영역 밖에서도 드래그 가능)
    >
      {/* 어노테이션 도형들 */}
      <g className="annotation-shapes">
        {renderDataList.map(renderShape)}
      </g>

      {/* 임시 어노테이션 (드로잉 중 미리보기, 점선 스타일) */}
      {/* pointerEvents: 'none'으로 클릭이 통과하여 MeasurementTool이 처리 */}
      {tempRenderData && (
        <g className="temp-annotation" style={{ opacity: 0.8, pointerEvents: 'none' }}>
          {renderTempShape(tempRenderData)}
        </g>
      )}
    </svg>
  );
}
