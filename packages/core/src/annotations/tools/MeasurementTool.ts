/**
 * MeasurementTool - Abstract Base Class
 *
 * 측정 도구의 추상 기본 클래스
 *
 * 책임:
 * - 도구 상태 관리 (inactive, ready, drawing)
 * - 마우스 이벤트 처리 흐름 정의
 * - 좌표 변환 유틸리티 제공
 * - 어노테이션 생성/업데이트 헬퍼
 *
 * 구현 도구:
 * - LengthTool: 두 점 거리 측정
 * - AngleTool: 세 점 각도 측정
 * - PointTool: 단일 점 속도 측정
 * - EllipseTool: 타원 면적 측정
 * - TraceTool: 자유 경로 면적 측정
 */

import type {
  Point,
  Annotation,
  AnnotationType,
  DicomMode,
  MeasurementResult,
  CalibrationData,
  AnnotationSource,
} from '../types';
import type { TransformContext } from '../coordinates/types';
import { coordinateTransformer, CoordinateTransformer } from '../coordinates';

// =============================================================================
// Tool State Types
// =============================================================================

/**
 * 도구 상태
 */
export type ToolState = 'inactive' | 'ready' | 'drawing';

/**
 * 마우스 이벤트 데이터
 */
export interface ToolMouseEvent {
  /** Canvas 좌표 */
  canvasX: number;
  canvasY: number;
  /** DICOM 픽셀 좌표 (자동 변환됨) */
  dicomX: number;
  dicomY: number;
  /** 마우스 버튼 (0: left, 1: middle, 2: right) */
  button: number;
  /** Shift 키 눌림 */
  shiftKey: boolean;
  /** Ctrl 키 눌림 */
  ctrlKey: boolean;
  /** 원본 이벤트 */
  originalEvent: MouseEvent;
}

/**
 * 도구 설정
 */
export interface ToolConfig {
  /** 기본 색상 */
  color?: string;
  /** 선 두께 */
  lineWidth?: number;
  /** 폰트 크기 */
  fontSize?: number;
  /** 커스텀 데이터 */
  customData?: Record<string, unknown>;
}

/**
 * 도구 컨텍스트 (도구 사용에 필요한 정보)
 */
export interface ToolContext {
  /** DICOM 파일 ID */
  dicomId: string;
  /** 현재 프레임 인덱스 */
  frameIndex: number;
  /** DICOM 모드 */
  mode: DicomMode;
  /** 캘리브레이션 데이터 */
  calibration?: CalibrationData;
  /** 뷰포트 변환 컨텍스트 */
  transformContext: TransformContext;
}

/**
 * 임시 어노테이션 (드로잉 중)
 */
export interface TempAnnotation {
  /** 현재까지 찍힌 포인트들 */
  points: Point[];
  /** 현재 마우스 위치 (미리보기용) */
  currentPoint?: Point;
  /** 측정 결과 (미리보기) */
  measurement?: MeasurementResult;
}

/**
 * 어노테이션 생성 콜백
 */
export type OnAnnotationCreated = (annotation: Annotation) => void;

/**
 * 임시 어노테이션 업데이트 콜백 (미리보기 렌더링용)
 */
export type OnTempAnnotationUpdate = (temp: TempAnnotation | null) => void;

// =============================================================================
// MeasurementTool Abstract Class
// =============================================================================

/**
 * 측정 도구 추상 기본 클래스
 *
 * 모든 측정 도구는 이 클래스를 상속받아 구현
 */
export abstract class MeasurementTool {
  // ---------------------------------------------------------------------------
  // Static Properties (도구 메타데이터)
  // ---------------------------------------------------------------------------

  /** 도구 고유 ID */
  static readonly toolId: string;
  /** 도구 표시 이름 */
  static readonly toolName: string;
  /** 지원하는 DICOM 모드 */
  static readonly supportedModes: DicomMode[];
  /** 어노테이션 타입 */
  static readonly annotationType: AnnotationType;
  /** 필요한 포인트 수 (0 = 무제한, TraceTool 등) */
  static readonly requiredPoints: number;

  // ---------------------------------------------------------------------------
  // Instance Properties
  // ---------------------------------------------------------------------------

  /** 현재 도구 상태 */
  protected _state: ToolState = 'inactive';

  /** 도구 설정 */
  protected config: ToolConfig;

  /** 현재 컨텍스트 */
  protected context: ToolContext | null = null;

  /** 드로잉 중인 포인트들 */
  protected drawingPoints: Point[] = [];

  /** 좌표 변환기 */
  protected transformer: CoordinateTransformer = coordinateTransformer;

  /** 어노테이션 생성 콜백 */
  protected onCreated: OnAnnotationCreated | null = null;

  /** 임시 어노테이션 업데이트 콜백 */
  protected onTempUpdate: OnTempAnnotationUpdate | null = null;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor(config?: ToolConfig) {
    this.config = {
      color: '#00ff00',
      lineWidth: 2,
      fontSize: 12,
      ...config,
    };
  }

  // ---------------------------------------------------------------------------
  // Abstract Methods (하위 클래스에서 구현)
  // ---------------------------------------------------------------------------

  /**
   * 도구 ID 반환
   */
  abstract getToolId(): string;

  /**
   * 도구 이름 반환
   */
  abstract getToolName(): string;

  /**
   * 지원하는 DICOM 모드 반환
   */
  abstract getSupportedModes(): DicomMode[];

  /**
   * 어노테이션 타입 반환
   */
  abstract getAnnotationType(): AnnotationType;

  /**
   * 필요한 포인트 수 반환
   */
  abstract getRequiredPoints(): number;

  /**
   * 측정 결과 계산
   *
   * @param points - 측정 포인트들 (DICOM 좌표)
   * @param context - 도구 컨텍스트
   * @returns 측정 결과
   */
  abstract calculateMeasurement(
    points: Point[],
    context: ToolContext
  ): MeasurementResult;

  /**
   * 기본 라벨 위치 계산
   *
   * @param points - 측정 포인트들
   * @returns 라벨 위치 (DICOM 좌표)
   */
  abstract getDefaultLabelPosition(points: Point[]): Point;

  // ---------------------------------------------------------------------------
  // Public Methods
  // ---------------------------------------------------------------------------

  /**
   * 현재 도구 상태 반환
   */
  get state(): ToolState {
    return this._state;
  }

  /**
   * 도구가 활성화되어 있는지 확인
   */
  isActive(): boolean {
    return this._state !== 'inactive';
  }

  /**
   * 도구가 드로잉 중인지 확인
   */
  isDrawing(): boolean {
    return this._state === 'drawing';
  }

  /**
   * 도구 활성화
   *
   * @param context - 도구 컨텍스트
   * @param onCreated - 어노테이션 생성 콜백
   * @param onTempUpdate - 임시 어노테이션 업데이트 콜백
   */
  activate(
    context: ToolContext,
    onCreated?: OnAnnotationCreated,
    onTempUpdate?: OnTempAnnotationUpdate
  ): void {
    // 지원하는 모드 확인
    if (!this.getSupportedModes().includes(context.mode)) {
      console.warn(
        `Tool ${this.getToolId()} does not support mode ${context.mode}`
      );
      return;
    }

    this.context = context;
    this.onCreated = onCreated ?? null;
    this.onTempUpdate = onTempUpdate ?? null;
    this._state = 'ready';
    this.drawingPoints = [];

    this.onActivate();
  }

  /**
   * 도구 비활성화
   */
  deactivate(): void {
    this.cancelDrawing();
    this._state = 'inactive';
    this.context = null;
    this.onCreated = null;
    this.onTempUpdate = null;

    this.onDeactivate();
  }

  /**
   * 드로잉 취소
   */
  cancelDrawing(): void {
    this.drawingPoints = [];
    this._state = this.context ? 'ready' : 'inactive';
    this.notifyTempUpdate(null);
  }

  /**
   * 컨텍스트 업데이트 (프레임 변경 등)
   */
  updateContext(context: Partial<ToolContext>): void {
    if (this.context) {
      this.context = { ...this.context, ...context };
    }
  }

  // ---------------------------------------------------------------------------
  // Mouse Event Handlers
  // ---------------------------------------------------------------------------

  /**
   * 마우스 다운 이벤트 처리
   */
  handleMouseDown(event: ToolMouseEvent): void {
    if (this._state === 'inactive' || !this.context) {
      return;
    }

    // 우클릭: 취소
    if (event.button === 2) {
      this.cancelDrawing();
      return;
    }

    // 좌클릭: 포인트 추가
    if (event.button === 0) {
      this.addPoint({ x: event.dicomX, y: event.dicomY });
    }
  }

  /**
   * 마우스 무브 이벤트 처리
   */
  handleMouseMove(event: ToolMouseEvent): void {
    if (this._state !== 'drawing' || !this.context) {
      return;
    }

    // 미리보기 업데이트
    const currentPoint = { x: event.dicomX, y: event.dicomY };
    this.updatePreview(currentPoint);
  }

  /**
   * 마우스 업 이벤트 처리
   */
  handleMouseUp(_event: ToolMouseEvent): void {
    // 기본 구현은 비어있음
    // 필요시 하위 클래스에서 오버라이드
  }

  /**
   * 더블 클릭 이벤트 처리
   */
  handleDoubleClick(_event: ToolMouseEvent): void {
    // TraceTool 등에서 사용 (드로잉 완료)
  }

  // ---------------------------------------------------------------------------
  // Protected Methods
  // ---------------------------------------------------------------------------

  /**
   * 도구 활성화 시 호출 (오버라이드 가능)
   */
  protected onActivate(): void {
    // 하위 클래스에서 오버라이드 가능
  }

  /**
   * 도구 비활성화 시 호출 (오버라이드 가능)
   */
  protected onDeactivate(): void {
    // 하위 클래스에서 오버라이드 가능
  }

  /**
   * 포인트 추가
   */
  protected addPoint(point: Point): void {
    if (!this.context) return;

    // 첫 번째 포인트: 드로잉 시작
    if (this._state === 'ready') {
      this._state = 'drawing';
    }

    this.drawingPoints.push(point);

    const requiredPoints = this.getRequiredPoints();

    // 필요한 포인트 수 충족 시 완료
    if (requiredPoints > 0 && this.drawingPoints.length >= requiredPoints) {
      this.completeDrawing();
    } else {
      // 미리보기 업데이트
      this.updatePreview(point);
    }
  }

  /**
   * 미리보기 업데이트
   */
  protected updatePreview(currentPoint: Point): void {
    if (!this.context || this.drawingPoints.length === 0) {
      return;
    }

    const previewPoints = [...this.drawingPoints, currentPoint];
    let measurement: MeasurementResult | undefined;

    // 측정 미리보기 계산 (충분한 포인트가 있을 때)
    const minPointsForPreview = Math.min(2, this.getRequiredPoints());
    if (previewPoints.length >= minPointsForPreview) {
      try {
        measurement = this.calculateMeasurement(previewPoints, this.context);
      } catch {
        // 계산 실패 시 무시
      }
    }

    this.notifyTempUpdate({
      points: this.drawingPoints,
      currentPoint,
      measurement,
    });
  }

  /**
   * 드로잉 완료 및 어노테이션 생성
   */
  protected completeDrawing(): void {
    if (!this.context || this.drawingPoints.length === 0) {
      this.cancelDrawing();
      return;
    }

    try {
      // 측정 결과 계산
      const measurement = this.calculateMeasurement(
        this.drawingPoints,
        this.context
      );

      // 어노테이션 생성
      const annotation = this.createAnnotation(
        this.drawingPoints,
        measurement,
        this.context
      );

      // 콜백 호출
      this.onCreated?.(annotation);

      // 임시 어노테이션 클리어
      this.notifyTempUpdate(null);
    } catch (error) {
      console.error('Failed to create annotation:', error);
    }

    // 드로잉 초기화
    this.drawingPoints = [];
    this._state = 'ready';
  }

  /**
   * 어노테이션 객체 생성
   */
  protected createAnnotation(
    points: Point[],
    measurement: MeasurementResult,
    context: ToolContext
  ): Annotation {
    const now = Date.now();
    const labelPosition = this.getDefaultLabelPosition(points);

    return {
      id: this.generateId(),
      dicomId: context.dicomId,
      frameIndex: context.frameIndex,
      type: this.getAnnotationType(),
      mode: context.mode,
      points: points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
      value: measurement.value,
      unit: measurement.unit,
      displayValue: measurement.displayText,
      labelPosition: {
        x: Math.round(labelPosition.x),
        y: Math.round(labelPosition.y),
      },
      color: this.config.color,
      visible: true,
      source: 'user' as AnnotationSource,
      deletable: true,
      editable: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * 고유 ID 생성
   */
  protected generateId(): string {
    return `${this.getToolId()}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 임시 어노테이션 업데이트 알림
   */
  protected notifyTempUpdate(temp: TempAnnotation | null): void {
    this.onTempUpdate?.(temp);
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Canvas 좌표 → DICOM 좌표 변환
   */
  protected canvasToDicom(canvasPoint: Point): Point {
    if (!this.context) {
      return canvasPoint;
    }
    return this.transformer.canvasToDicom(
      canvasPoint,
      this.context.transformContext
    );
  }

  /**
   * DICOM 좌표 → Canvas 좌표 변환
   */
  protected dicomToCanvas(dicomPoint: Point): Point {
    if (!this.context) {
      return dicomPoint;
    }
    return this.transformer.dicomToCanvas(
      dicomPoint,
      this.context.transformContext
    );
  }

  /**
   * 두 점 사이의 거리 계산
   */
  protected calculateDistance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * 표시 텍스트 포맷팅
   */
  protected formatDisplayText(value: number, unit: string): string {
    // 소수점 이하 자릿수 결정
    let decimals = 1;
    if (unit === 'deg' || unit === '°') {
      decimals = 1;
    } else if (unit === 'ms' || unit === 's') {
      decimals = 0;
    } else if (unit === 'cm/s') {
      decimals = 1;
    }

    return `${value.toFixed(decimals)} ${unit}`;
  }
}
