/**
 * Annotation Importer
 *
 * 어노테이션 데이터 가져오기
 *
 * 책임:
 * - JSON 파싱
 * - ExportedAnnotationData → Annotation 변환
 * - 버전 마이그레이션 (향후)
 * - 유효성 검증
 */

import type {
  Annotation,
  AnnotationType,
  AnnotationSource,
  DicomMode,
  ExportedAnnotationData,
  ExportedAnnotation,
  ImportOptions,
  PermissionSet,
  ValidationResult,
} from './types';
import { EXPORT_FORMAT_VERSION, DEFAULT_PERMISSIONS } from './types';

// =============================================================================
// Import Result
// =============================================================================

/**
 * 가져오기 결과
 */
export interface ImportResult {
  /** 성공 여부 */
  success: boolean;
  /** 가져온 어노테이션들 */
  annotations: Annotation[];
  /** 에러 목록 */
  errors: string[];
  /** 경고 목록 */
  warnings: string[];
  /** 원본 DICOM ID */
  dicomId: string;
  /** 스킵된 개수 */
  skippedCount: number;
}

// =============================================================================
// Importer Class
// =============================================================================

/**
 * 어노테이션 가져오기 클래스
 */
export class Importer {
  /**
   * JSON 문자열에서 가져오기
   *
   * @param jsonString - JSON 문자열
   * @param options - 가져오기 옵션
   * @returns 가져오기 결과
   */
  fromJSON(jsonString: string, options: ImportOptions): ImportResult {
    const result: ImportResult = {
      success: false,
      annotations: [],
      errors: [],
      warnings: [],
      dicomId: '',
      skippedCount: 0,
    };

    // 1. JSON 파싱
    let data: ExportedAnnotationData;
    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      result.errors.push(`JSON parse error: ${(e as Error).message}`);
      return result;
    }

    // 2. 데이터 가져오기
    return this.import(data, options);
  }

  /**
   * ExportedAnnotationData에서 가져오기
   *
   * @param data - 내보내기 데이터
   * @param options - 가져오기 옵션
   * @returns 가져오기 결과
   */
  import(data: ExportedAnnotationData, options: ImportOptions): ImportResult {
    const result: ImportResult = {
      success: false,
      annotations: [],
      errors: [],
      warnings: [],
      dicomId: data.dicomId || '',
      skippedCount: 0,
    };

    // 1. 구조 검증
    const validation = this.validateStructure(data);
    if (!validation.valid) {
      result.errors.push(...validation.errors);
      return result;
    }

    if (validation.warnings) {
      result.warnings.push(...validation.warnings);
    }

    // 2. 버전 확인 및 마이그레이션
    if (data.version !== EXPORT_FORMAT_VERSION) {
      result.warnings.push(
        `Version mismatch: expected ${EXPORT_FORMAT_VERSION}, got ${data.version}`
      );
      // 향후: 버전별 마이그레이션 로직 추가
    }

    // 3. 어노테이션 변환
    for (const exported of data.annotations) {
      try {
        const annotation = this.convertAnnotation(
          exported,
          data.dicomId,
          options
        );
        result.annotations.push(annotation);
      } catch (e) {
        result.warnings.push(
          `Failed to import annotation ${exported.id}: ${(e as Error).message}`
        );
        result.skippedCount++;
      }
    }

    result.success = result.errors.length === 0;
    result.dicomId = data.dicomId;

    return result;
  }

  /**
   * 구조 유효성 검증
   */
  private validateStructure(data: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data || typeof data !== 'object') {
      errors.push('Invalid data: expected object');
      return { valid: false, errors, warnings };
    }

    const obj = data as Record<string, unknown>;

    // 필수 필드 검증
    if (!obj.version) {
      errors.push('Missing required field: version');
    }

    if (!obj.dicomId) {
      errors.push('Missing required field: dicomId');
    }

    if (!Array.isArray(obj.annotations)) {
      errors.push('Missing or invalid field: annotations (expected array)');
    }

    // 경고
    if (!obj.exportedAt) {
      warnings.push('Missing field: exportedAt');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 단일 어노테이션 변환
   */
  private convertAnnotation(
    exported: ExportedAnnotation,
    dicomId: string,
    options: ImportOptions
  ): Annotation {
    const { sourceOverride, permissionOverride } = options;

    // 출처 결정
    const source: AnnotationSource = sourceOverride || exported.metadata.source;

    // 권한 결정
    const basePermission = this.getPermissionForSource(source);
    const permission: PermissionSet = permissionOverride
      ? { ...basePermission, ...permissionOverride }
      : basePermission;

    // 타임스탬프 변환
    const createdAt = exported.metadata.createdAt
      ? new Date(exported.metadata.createdAt).getTime()
      : Date.now();

    const updatedAt = exported.metadata.updatedAt
      ? new Date(exported.metadata.updatedAt).getTime()
      : Date.now();

    return {
      id: exported.id,
      dicomId,
      frameIndex: exported.frameIndex,
      type: exported.type as AnnotationType,
      mode: exported.mode as DicomMode,
      points: exported.points.map((p) => ({ x: p.x, y: p.y })),
      value: exported.measurement.value,
      unit: exported.measurement.unit,
      displayValue: exported.measurement.displayText,
      labelPosition: {
        x: exported.display.labelPosition.x,
        y: exported.display.labelPosition.y,
      },
      color: exported.display.color,
      visible: exported.display.visible,
      source,
      deletable: permission.deletable,
      editable: permission.editable,
      createdAt,
      updatedAt,
      createdBy: exported.metadata.createdBy,
      customData: exported.metadata.customData,
    };
  }

  /**
   * 출처별 권한 조회
   */
  private getPermissionForSource(source: AnnotationSource): PermissionSet {
    const sourcePermission = DEFAULT_PERMISSIONS.sourcePermissions[source];
    if (sourcePermission) {
      return sourcePermission;
    }

    // 기본값
    return {
      deletable: true,
      editable: true,
      countable: true,
      hideable: true,
    };
  }
}

/**
 * 기본 가져오기 인스턴스
 */
export const importer = new Importer();
