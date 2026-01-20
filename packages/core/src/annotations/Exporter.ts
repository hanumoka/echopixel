/**
 * Annotation Exporter
 *
 * 어노테이션 데이터 내보내기
 *
 * 책임:
 * - Annotation → ExportedAnnotationData 변환
 * - JSON 직렬화
 * - 버전 관리
 */

import type {
  Annotation,
  ExportedAnnotationData,
  ExportedAnnotation,
  CalibrationData,
} from './types';
import { EXPORT_FORMAT_VERSION } from './types';

// =============================================================================
// Export Options
// =============================================================================

/**
 * 내보내기 옵션
 */
export interface ExportOptions {
  /** Study Instance UID (선택적) */
  studyInstanceUID?: string;
  /** Series Instance UID (선택적) */
  seriesInstanceUID?: string;
  /** SOP Instance UID (선택적) */
  sopInstanceUID?: string;
  /** 캘리브레이션 데이터 (재계산용) */
  calibration?: CalibrationData;
  /** 숨겨진 어노테이션 포함 여부 (기본: true) */
  includeHidden?: boolean;
  /** 특정 출처만 내보내기 (선택적) */
  filterSource?: string[];
  /** 특정 타입만 내보내기 (선택적) */
  filterType?: string[];
}

// =============================================================================
// Exporter Class
// =============================================================================

/**
 * 어노테이션 내보내기 클래스
 */
export class Exporter {
  /**
   * 어노테이션 배열을 내보내기 형식으로 변환
   *
   * @param dicomId - DICOM 파일 ID
   * @param annotations - 내보낼 어노테이션들
   * @param options - 내보내기 옵션
   * @returns 내보내기 데이터
   */
  export(
    dicomId: string,
    annotations: Annotation[],
    options: ExportOptions = {}
  ): ExportedAnnotationData {
    const {
      studyInstanceUID,
      seriesInstanceUID,
      sopInstanceUID,
      calibration,
      includeHidden = true,
      filterSource,
      filterType,
    } = options;

    // 필터링
    let filtered = annotations;

    if (!includeHidden) {
      filtered = filtered.filter((a) => a.visible);
    }

    if (filterSource && filterSource.length > 0) {
      filtered = filtered.filter((a) => filterSource.includes(a.source));
    }

    if (filterType && filterType.length > 0) {
      filtered = filtered.filter((a) => filterType.includes(a.type));
    }

    // 변환
    const exportedAnnotations: ExportedAnnotation[] = filtered.map((a) =>
      this.convertAnnotation(a, calibration)
    );

    return {
      version: EXPORT_FORMAT_VERSION,
      dicomId,
      studyInstanceUID,
      seriesInstanceUID,
      sopInstanceUID,
      annotations: exportedAnnotations,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * JSON 문자열로 변환
   *
   * @param data - 내보내기 데이터
   * @param pretty - 들여쓰기 여부 (기본: false)
   * @returns JSON 문자열
   */
  toJSON(data: ExportedAnnotationData, pretty = false): string {
    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  }

  /**
   * 단일 어노테이션 변환 (내부용)
   */
  private convertAnnotation(
    annotation: Annotation,
    calibration?: CalibrationData
  ): ExportedAnnotation {
    return {
      id: annotation.id,
      frameIndex: annotation.frameIndex,
      type: annotation.type,
      mode: annotation.mode,
      points: annotation.points.map((p) => ({ x: p.x, y: p.y })),
      measurement: {
        value: annotation.value,
        unit: annotation.unit,
        displayText: annotation.displayValue,
      },
      calibration: calibration
        ? {
            physicalDeltaX: calibration.physicalDeltaX,
            physicalDeltaY: calibration.physicalDeltaY,
            unitX: calibration.unitX,
            unitY: calibration.unitY,
            baseLine: calibration.baseLine,
          }
        : {
            // 기본값 (캘리브레이션 없는 경우)
            physicalDeltaX: 1,
            physicalDeltaY: 1,
            unitX: 0,
            unitY: 0,
          },
      display: {
        labelPosition: {
          x: annotation.labelPosition.x,
          y: annotation.labelPosition.y,
        },
        color: annotation.color,
        visible: annotation.visible,
      },
      metadata: {
        source: annotation.source,
        createdAt: new Date(annotation.createdAt).toISOString(),
        updatedAt: new Date(annotation.updatedAt).toISOString(),
        createdBy: annotation.createdBy,
        customData: annotation.customData,
      },
    };
  }
}

/**
 * 기본 내보내기 인스턴스
 */
export const exporter = new Exporter();
