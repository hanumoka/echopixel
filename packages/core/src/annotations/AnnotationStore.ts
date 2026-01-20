/**
 * Annotation Store
 *
 * 어노테이션 데이터 저장소
 *
 * 책임:
 * - CRUD 작업 (Create, Read, Update, Delete)
 * - DICOM별 그룹화
 * - 권한 검증
 * - 개수 제한 검증
 */

import type {
  Annotation,
  AnnotationType,
  AnnotationSource,
  DicomMode,
  Point,
  PermissionConfig,
  PermissionSet,
  LimitConfig,
  LimitValidationResult,
  ValidationResult,
} from './types';
import { DEFAULT_PERMISSIONS, DEFAULT_LIMITS } from './types';

// =============================================================================
// ID Generator
// =============================================================================

/**
 * 고유 ID 생성
 *
 * 형식: anno_<timestamp>_<random>
 */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `anno_${timestamp}_${random}`;
}

// =============================================================================
// Annotation Store Options
// =============================================================================

/**
 * AnnotationStore 옵션
 */
export interface AnnotationStoreOptions {
  /** 권한 설정 */
  permissions?: PermissionConfig;
  /** 제한 설정 */
  limits?: LimitConfig;
  /** 변경 콜백 */
  onChange?: (annotations: Annotation[], dicomId: string) => void;
}

// =============================================================================
// Create Annotation Input
// =============================================================================

/**
 * 어노테이션 생성 입력
 */
export interface CreateAnnotationInput {
  /** DICOM 파일 ID */
  dicomId: string;
  /** 프레임 인덱스 */
  frameIndex: number;
  /** 측정 도구 타입 */
  type: AnnotationType;
  /** DICOM 모드 */
  mode: DicomMode;
  /** 측정 포인트들 (DICOM 픽셀 좌표) */
  points: Point[];
  /** 측정값 */
  value: number;
  /** 단위 */
  unit: string;
  /** 표시 문자열 */
  displayValue: string;
  /** 라벨 위치 */
  labelPosition: Point;
  /** 색상 (선택적) */
  color?: string;
  /** 출처 */
  source: AnnotationSource;
  /** 생성자 ID (선택적) */
  createdBy?: string;
  /** 커스텀 데이터 (선택적) */
  customData?: Record<string, unknown>;
}

// =============================================================================
// Update Annotation Input
// =============================================================================

/**
 * 어노테이션 수정 입력
 */
export interface UpdateAnnotationInput {
  /** 측정 포인트들 */
  points?: Point[];
  /** 측정값 */
  value?: number;
  /** 단위 */
  unit?: string;
  /** 표시 문자열 */
  displayValue?: string;
  /** 라벨 위치 */
  labelPosition?: Point;
  /** 색상 */
  color?: string;
  /** 표시 여부 */
  visible?: boolean;
  /** 커스텀 데이터 */
  customData?: Record<string, unknown>;
}

// =============================================================================
// Query Options
// =============================================================================

/**
 * 어노테이션 조회 옵션
 */
export interface QueryOptions {
  /** 프레임 인덱스 필터 */
  frameIndex?: number;
  /** 타입 필터 */
  type?: AnnotationType;
  /** 출처 필터 */
  source?: AnnotationSource;
  /** 표시 여부 필터 */
  visible?: boolean;
}

// =============================================================================
// Annotation Store
// =============================================================================

/**
 * 어노테이션 저장소
 *
 * DICOM별 어노테이션 관리
 */
export class AnnotationStore {
  /** DICOM ID → 어노테이션 맵 */
  private store: Map<string, Map<string, Annotation>> = new Map();

  /** 권한 설정 */
  private permissions: PermissionConfig;

  /** 제한 설정 */
  private limits: LimitConfig;

  /** 변경 콜백 */
  private onChange?: (annotations: Annotation[], dicomId: string) => void;

  constructor(options: AnnotationStoreOptions = {}) {
    this.permissions = options.permissions || DEFAULT_PERMISSIONS;
    this.limits = options.limits || DEFAULT_LIMITS;
    this.onChange = options.onChange;
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  /**
   * 어노테이션 생성
   *
   * @param input - 생성 입력
   * @returns 생성된 어노테이션 또는 null (제한 초과)
   */
  create(input: CreateAnnotationInput): Annotation | null {
    // 1. 제한 검증
    const limitCheck = this.checkLimit(input.dicomId, input.type, input.source);
    if (!limitCheck.allowed) {
      console.warn(`[AnnotationStore] Limit exceeded: ${limitCheck.message}`);
      return null;
    }

    // 2. 권한 결정
    const permission = this.getPermissionForSource(input.source);

    // 3. 어노테이션 생성
    const now = Date.now();
    const annotation: Annotation = {
      id: generateId(),
      dicomId: input.dicomId,
      frameIndex: input.frameIndex,
      type: input.type,
      mode: input.mode,
      points: [...input.points],
      value: input.value,
      unit: input.unit,
      displayValue: input.displayValue,
      labelPosition: { ...input.labelPosition },
      color: input.color,
      visible: true,
      source: input.source,
      deletable: permission.deletable,
      editable: permission.editable,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
      customData: input.customData,
    };

    // 4. 저장
    this.setAnnotation(annotation);

    // 5. 콜백 호출
    this.notifyChange(input.dicomId);

    return annotation;
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /**
   * 어노테이션 조회 (ID로)
   *
   * @param dicomId - DICOM 파일 ID
   * @param annotationId - 어노테이션 ID
   * @returns 어노테이션 또는 undefined
   */
  get(dicomId: string, annotationId: string): Annotation | undefined {
    const dicomStore = this.store.get(dicomId);
    return dicomStore?.get(annotationId);
  }

  /**
   * DICOM의 모든 어노테이션 조회
   *
   * @param dicomId - DICOM 파일 ID
   * @param options - 필터 옵션
   * @returns 어노테이션 배열
   */
  getByDicom(dicomId: string, options?: QueryOptions): Annotation[] {
    const dicomStore = this.store.get(dicomId);
    if (!dicomStore) {
      return [];
    }

    let annotations = Array.from(dicomStore.values());

    // 필터 적용
    if (options) {
      if (options.frameIndex !== undefined) {
        annotations = annotations.filter(
          (a) => a.frameIndex === options.frameIndex
        );
      }
      if (options.type !== undefined) {
        annotations = annotations.filter((a) => a.type === options.type);
      }
      if (options.source !== undefined) {
        annotations = annotations.filter((a) => a.source === options.source);
      }
      if (options.visible !== undefined) {
        annotations = annotations.filter((a) => a.visible === options.visible);
      }
    }

    // 생성 시간 순 정렬
    return annotations.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * 특정 프레임의 어노테이션 조회
   *
   * @param dicomId - DICOM 파일 ID
   * @param frameIndex - 프레임 인덱스
   * @returns 어노테이션 배열
   */
  getByFrame(dicomId: string, frameIndex: number): Annotation[] {
    return this.getByDicom(dicomId, { frameIndex });
  }

  /**
   * 모든 DICOM ID 목록
   */
  getDicomIds(): string[] {
    return Array.from(this.store.keys());
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  /**
   * 어노테이션 수정
   *
   * @param dicomId - DICOM 파일 ID
   * @param annotationId - 어노테이션 ID
   * @param input - 수정 입력
   * @returns 수정된 어노테이션 또는 null (실패)
   */
  update(
    dicomId: string,
    annotationId: string,
    input: UpdateAnnotationInput
  ): Annotation | null {
    const annotation = this.get(dicomId, annotationId);

    if (!annotation) {
      console.warn(`[AnnotationStore] Annotation not found: ${annotationId}`);
      return null;
    }

    // 수정 권한 확인
    if (!annotation.editable) {
      console.warn(
        `[AnnotationStore] Annotation not editable: ${annotationId}`
      );
      return null;
    }

    // 업데이트
    const updated: Annotation = {
      ...annotation,
      points: input.points ? [...input.points] : annotation.points,
      value: input.value ?? annotation.value,
      unit: input.unit ?? annotation.unit,
      displayValue: input.displayValue ?? annotation.displayValue,
      labelPosition: input.labelPosition
        ? { ...input.labelPosition }
        : annotation.labelPosition,
      color: input.color !== undefined ? input.color : annotation.color,
      visible: input.visible ?? annotation.visible,
      customData:
        input.customData !== undefined
          ? input.customData
          : annotation.customData,
      updatedAt: Date.now(),
    };

    // 저장
    this.setAnnotation(updated);

    // 콜백 호출
    this.notifyChange(dicomId);

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  /**
   * 어노테이션 삭제
   *
   * @param dicomId - DICOM 파일 ID
   * @param annotationId - 어노테이션 ID
   * @returns 삭제된 어노테이션 또는 null (실패)
   */
  delete(dicomId: string, annotationId: string): Annotation | null {
    const annotation = this.get(dicomId, annotationId);

    if (!annotation) {
      console.warn(`[AnnotationStore] Annotation not found: ${annotationId}`);
      return null;
    }

    // 삭제 권한 확인
    if (!annotation.deletable) {
      console.warn(
        `[AnnotationStore] Annotation not deletable: ${annotationId}`
      );
      return null;
    }

    // 삭제
    const dicomStore = this.store.get(dicomId);
    if (dicomStore) {
      dicomStore.delete(annotationId);

      // 빈 DICOM 저장소 정리
      if (dicomStore.size === 0) {
        this.store.delete(dicomId);
      }
    }

    // 콜백 호출
    this.notifyChange(dicomId);

    return annotation;
  }

  /**
   * DICOM의 모든 어노테이션 삭제
   *
   * @param dicomId - DICOM 파일 ID
   * @param options - 필터 옵션 (deletable만 삭제됨)
   * @returns 삭제된 개수
   */
  deleteByDicom(dicomId: string, options?: QueryOptions): number {
    const annotations = this.getByDicom(dicomId, options);
    let deletedCount = 0;

    for (const annotation of annotations) {
      if (annotation.deletable) {
        const result = this.delete(dicomId, annotation.id);
        if (result) {
          deletedCount++;
        }
      }
    }

    return deletedCount;
  }

  // ---------------------------------------------------------------------------
  // Bulk Operations
  // ---------------------------------------------------------------------------

  /**
   * 여러 어노테이션 일괄 추가 (Import용)
   *
   * @param annotations - 추가할 어노테이션들
   * @returns 추가된 어노테이션들
   */
  addBulk(annotations: Annotation[]): Annotation[] {
    const added: Annotation[] = [];
    const affectedDicomIds = new Set<string>();

    for (const annotation of annotations) {
      // 이미 존재하면 스킵
      if (this.get(annotation.dicomId, annotation.id)) {
        continue;
      }

      this.setAnnotation(annotation);
      added.push(annotation);
      affectedDicomIds.add(annotation.dicomId);
    }

    // 콜백 호출
    for (const dicomId of affectedDicomIds) {
      this.notifyChange(dicomId);
    }

    return added;
  }

  /**
   * 모든 데이터 초기화
   */
  clear(): void {
    const dicomIds = this.getDicomIds();
    this.store.clear();

    // 콜백 호출
    for (const dicomId of dicomIds) {
      this.notifyChange(dicomId);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal Methods (for HistoryManager)
  // ---------------------------------------------------------------------------

  /**
   * 강제 삭제 (권한 무시) - HistoryManager용
   *
   * @internal
   * @param dicomId - DICOM 파일 ID
   * @param annotationId - 어노테이션 ID
   * @returns 삭제된 어노테이션 또는 null
   */
  _forceDelete(dicomId: string, annotationId: string): Annotation | null {
    const annotation = this.get(dicomId, annotationId);

    if (!annotation) {
      return null;
    }

    // 권한 검사 없이 삭제
    const dicomStore = this.store.get(dicomId);
    if (dicomStore) {
      dicomStore.delete(annotationId);

      if (dicomStore.size === 0) {
        this.store.delete(dicomId);
      }
    }

    this.notifyChange(dicomId);
    return annotation;
  }

  /**
   * 강제 복원/덮어쓰기 (제한 무시) - HistoryManager용
   *
   * @internal
   * @param annotation - 복원할 어노테이션
   */
  _forceRestore(annotation: Annotation): void {
    // 기존 데이터 덮어쓰기 허용
    this.setAnnotation(annotation);
    this.notifyChange(annotation.dicomId);
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  /**
   * 제한 검증
   *
   * @param dicomId - DICOM 파일 ID
   * @param type - 어노테이션 타입
   * @param source - 출처
   * @returns 제한 검증 결과
   */
  checkLimit(
    dicomId: string,
    type: AnnotationType,
    source: AnnotationSource
  ): LimitValidationResult {
    const permission = this.getPermissionForSource(source);

    // countable이 아니면 제한 없음
    if (!permission.countable) {
      return {
        allowed: true,
        currentCount: 0,
        maxCount: Infinity,
      };
    }

    // 현재 개수 계산 (countable한 것만)
    const currentCount = this.getCountableCount(dicomId);

    // 1. 전역 제한 확인
    const globalMax = this.limits.global?.maxPerDicom;
    if (globalMax !== undefined && currentCount >= globalMax) {
      return {
        allowed: false,
        currentCount,
        maxCount: globalMax,
        message: `Maximum annotations per DICOM reached (${globalMax})`,
      };
    }

    // 2. 도구별 제한 확인
    const toolMax = this.limits.perTool?.[type]?.maxPerDicom;
    if (toolMax !== undefined) {
      const toolCount = this.getByDicom(dicomId, { type }).filter((a) => {
        const p = this.getPermissionForSource(a.source);
        return p.countable;
      }).length;

      if (toolCount >= toolMax) {
        return {
          allowed: false,
          currentCount: toolCount,
          maxCount: toolMax,
          message: `Maximum ${type} annotations per DICOM reached (${toolMax})`,
        };
      }
    }

    // 3. 출처별 제한 확인
    const sourceMax = this.limits.perSource?.[source]?.maxPerDicom;
    if (sourceMax !== undefined && currentCount >= sourceMax) {
      return {
        allowed: false,
        currentCount,
        maxCount: sourceMax,
        message: `Maximum annotations from ${source} per DICOM reached (${sourceMax})`,
      };
    }

    return {
      allowed: true,
      currentCount,
      maxCount: sourceMax ?? globalMax ?? Infinity,
    };
  }

  /**
   * 어노테이션 유효성 검증
   *
   * @param annotation - 검증할 어노테이션
   * @returns 검증 결과
   */
  validate(annotation: Partial<Annotation>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 필수 필드 검증
    if (!annotation.dicomId) {
      errors.push('dicomId is required');
    }
    if (annotation.frameIndex === undefined || annotation.frameIndex < 0) {
      errors.push('frameIndex must be a non-negative integer');
    }
    if (!annotation.type) {
      errors.push('type is required');
    }
    if (!annotation.mode) {
      errors.push('mode is required');
    }
    if (!annotation.points || annotation.points.length === 0) {
      errors.push('points array is required and must not be empty');
    }
    if (!annotation.source) {
      errors.push('source is required');
    }

    // 포인트 검증
    if (annotation.points) {
      for (let i = 0; i < annotation.points.length; i++) {
        const point = annotation.points[i];
        if (typeof point.x !== 'number' || typeof point.y !== 'number') {
          errors.push(`points[${i}] must have numeric x and y`);
        }
      }
    }

    // 경고
    if (annotation.value === undefined) {
      warnings.push('value is not set');
    }
    if (!annotation.unit) {
      warnings.push('unit is not set');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  /**
   * DICOM별 어노테이션 개수
   *
   * @param dicomId - DICOM 파일 ID
   * @returns 개수
   */
  getCount(dicomId: string): number {
    const dicomStore = this.store.get(dicomId);
    return dicomStore?.size ?? 0;
  }

  /**
   * Countable 어노테이션 개수
   *
   * @param dicomId - DICOM 파일 ID
   * @returns 개수
   */
  getCountableCount(dicomId: string): number {
    const annotations = this.getByDicom(dicomId);
    return annotations.filter((a) => {
      const permission = this.getPermissionForSource(a.source);
      return permission.countable;
    }).length;
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * 어노테이션 저장
   */
  private setAnnotation(annotation: Annotation): void {
    let dicomStore = this.store.get(annotation.dicomId);

    if (!dicomStore) {
      dicomStore = new Map();
      this.store.set(annotation.dicomId, dicomStore);
    }

    dicomStore.set(annotation.id, annotation);
  }

  /**
   * 출처별 권한 조회
   */
  private getPermissionForSource(source: AnnotationSource): PermissionSet {
    // 커스텀 권한 함수가 있으면 사용
    // (Annotation 전체가 필요하지만, source만으로 기본 권한 조회 가능)

    // 출처별 기본 권한 조회
    const sourcePermission = this.permissions.sourcePermissions[source];
    if (sourcePermission) {
      return sourcePermission;
    }

    // 기본값 (user 권한 사용)
    return (
      this.permissions.sourcePermissions['user'] || {
        deletable: true,
        editable: true,
        countable: true,
        hideable: true,
      }
    );
  }

  /**
   * 변경 알림
   */
  private notifyChange(dicomId: string): void {
    if (this.onChange) {
      const annotations = this.getByDicom(dicomId);
      this.onChange(annotations, dicomId);
    }
  }
}
