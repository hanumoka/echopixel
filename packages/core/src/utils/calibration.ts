/**
 * Calibration 유틸리티
 *
 * DICOM 이미지 정보에서 CalibrationData를 생성하는 유틸리티
 *
 * 학습 포인트:
 * - Pixel Spacing (mm/pixel) → cm 변환 필요 (/10)
 * - Ultrasound Calibration은 이미 단위/pixel로 제공됨
 * - Physical Units 코드 변환 필요 (ULTRASOUND → DICOM)
 */

import type { DicomImageInfo } from '../dicom';
import { ULTRASOUND_PHYSICAL_UNITS } from '../dicom';
import type { CalibrationData } from '../annotations';
import { DICOM_UNIT_CODES } from '../annotations';

/**
 * Ultrasound Physical Units를 DICOM Unit Codes로 변환
 *
 * @param usUnit - Ultrasound Physical Units 코드
 * @returns DICOM Unit Code
 *
 * 변환 매핑:
 * - ULTRASOUND_PHYSICAL_UNITS.CM (3) → DICOM_UNIT_CODES.CENTIMETER (3)
 * - ULTRASOUND_PHYSICAL_UNITS.SECONDS (4) → DICOM_UNIT_CODES.SECONDS (4)
 * - ULTRASOUND_PHYSICAL_UNITS.CM_PER_SEC (5) → DICOM_UNIT_CODES.CM_PER_SEC (7)
 */
function convertUltrasoundUnitToDicomUnit(usUnit: number): number {
  switch (usUnit) {
    case ULTRASOUND_PHYSICAL_UNITS.CM:
      return DICOM_UNIT_CODES.CENTIMETER;
    case ULTRASOUND_PHYSICAL_UNITS.SECONDS:
      return DICOM_UNIT_CODES.SECONDS;
    case ULTRASOUND_PHYSICAL_UNITS.CM_PER_SEC:
      return DICOM_UNIT_CODES.CM_PER_SEC;
    default:
      return DICOM_UNIT_CODES.CENTIMETER; // 기본값
  }
}

/**
 * DicomImageInfo에서 CalibrationData 생성
 *
 * @param imageInfo - DICOM 이미지 정보
 * @returns CalibrationData 또는 undefined (calibration 정보가 없는 경우)
 *
 * @example
 * ```typescript
 * const calibration = createCalibrationFromImageInfo(imageInfo);
 * if (calibration) {
 *   // calibration 사용 가능
 *   console.log('X축 물리값/pixel:', calibration.physicalDeltaX);
 * }
 * ```
 *
 * 우선순위:
 * 1. Pixel Spacing (mm/pixel) → cm/pixel 변환 (/10)
 * 2. Ultrasound Calibration (이미 단위/pixel)
 *
 * 왜 이 순서인가:
 * - Pixel Spacing은 일반 영상에서 더 정확함
 * - Ultrasound Calibration은 초음파 전용
 * - 둘 다 있으면 Pixel Spacing 우선 (더 표준적)
 */
export function createCalibrationFromImageInfo(
  imageInfo: DicomImageInfo | undefined | null
): CalibrationData | undefined {
  if (!imageInfo) {
    return undefined;
  }

  // 1. Pixel Spacing (mm/pixel) → cm/pixel 변환
  if (imageInfo.pixelSpacing) {
    return {
      physicalDeltaX: imageInfo.pixelSpacing.columnSpacing / 10,
      physicalDeltaY: imageInfo.pixelSpacing.rowSpacing / 10,
      unitX: DICOM_UNIT_CODES.CENTIMETER,
      unitY: DICOM_UNIT_CODES.CENTIMETER,
    };
  }

  // 2. Ultrasound Calibration (이미 단위/pixel)
  if (imageInfo.ultrasoundCalibration) {
    const usCal = imageInfo.ultrasoundCalibration;
    return {
      physicalDeltaX: Math.abs(usCal.physicalDeltaX), // 음수 가능하므로 절대값
      physicalDeltaY: Math.abs(usCal.physicalDeltaY),
      unitX: convertUltrasoundUnitToDicomUnit(usCal.physicalUnitsX),
      unitY: convertUltrasoundUnitToDicomUnit(usCal.physicalUnitsY),
    };
  }

  // calibration 정보 없음
  return undefined;
}
