/**
 * Annotation System Type Definitions
 *
 * Phase 3a: 기본 인프라 타입 정의
 */

// =============================================================================
// Basic Types
// =============================================================================

/**
 * 2D 좌표점
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * DICOM 이미지 모드
 *
 * - B: 2D 이미지 (거리 측정)
 * - M: M-mode (시간-거리)
 * - D: Doppler (시간-속도)
 */
export type DicomMode = 'B' | 'M' | 'D';

/**
 * 측정 도구 타입
 */
export type AnnotationType =
  | 'length'    // 두 점 거리
  | 'angle'     // 세 점 각도
  | 'point'     // 단일 점 (속도)
  | 'ellipse'   // 타원 면적
  | 'trace'     // 자유 경로 면적
  | 'vti'       // 속도 시간 적분
  | 'caliper'   // M-mode 캘리퍼
  | 'custom';   // 커스텀 도구

/**
 * 어노테이션 출처
 */
export type AnnotationSource = 'ai' | 'user' | 'server' | string;

// =============================================================================
// Permission System
// =============================================================================

/**
 * 권한 설정
 */
export interface PermissionSet {
  /** 삭제 가능 여부 */
  deletable: boolean;
  /** 수정 가능 여부 */
  editable: boolean;
  /** 개수 제한에 포함 여부 */
  countable: boolean;
  /** 숨김 가능 여부 */
  hideable: boolean;
}

/**
 * 권한 설정 구성
 */
export interface PermissionConfig {
  /**
   * 출처별 기본 권한
   * key: 출처 (ai, user, server, ...)
   */
  sourcePermissions: Record<string, PermissionSet>;

  /**
   * 개별 어노테이션 권한 오버라이드 (선택적)
   * 동적 권한 결정이 필요할 때 사용
   */
  getPermission?: (annotation: Annotation) => PermissionSet;
}

/**
 * 기본 권한 설정
 */
export const DEFAULT_PERMISSIONS: PermissionConfig = {
  sourcePermissions: {
    ai: { deletable: false, editable: true, countable: false, hideable: true },
    user: { deletable: true, editable: true, countable: true, hideable: true },
    server: { deletable: true, editable: true, countable: false, hideable: true },
  },
};

// =============================================================================
// Limit System
// =============================================================================

/**
 * 개수 제한 설정
 */
export interface LimitConfig {
  /**
   * 전역 제한
   */
  global?: {
    /** DICOM당 최대 개수 (모든 출처 합계) */
    maxPerDicom?: number;
  };

  /**
   * 도구별 제한
   * key: 도구 타입 (length, angle, ...)
   */
  perTool?: Record<string, {
    maxPerDicom?: number;
  }>;

  /**
   * 출처별 제한 (countable=true인 것만 적용)
   * key: 출처 (ai, user, server, ...)
   */
  perSource?: Record<string, {
    maxPerDicom?: number;
  }>;
}

/**
 * 기본 제한 설정
 */
export const DEFAULT_LIMITS: LimitConfig = {
  perSource: {
    user: { maxPerDicom: 15 },
  },
};

// =============================================================================
// Calibration Data
// =============================================================================

/**
 * DICOM 캘리브레이션 데이터
 *
 * Viviane 방식 적용:
 * - physicalDeltaX/Y: 픽셀당 물리값
 * - unitX/Y: DICOM 단위 코드 (0-9)
 */
export interface CalibrationData {
  /** 픽셀당 물리값 (X축) */
  physicalDeltaX: number;
  /** 픽셀당 물리값 (Y축) */
  physicalDeltaY: number;
  /** DICOM 단위 코드 X (0-9) */
  unitX: number;
  /** DICOM 단위 코드 Y (0-9) */
  unitY: number;
  /** D-mode 기준선 (Y 픽셀 위치) */
  baseLine?: number;
  /** 영역 Y 오프셋 */
  regionLocationY0?: number;
}

/**
 * DICOM 단위 코드
 *
 * DICOM 표준 (0-9):
 * 0: none, 1: %, 2: dB, 3: cm, 4: s, 5: Hz, 6: dB/s, 7: cm/s, 8: cm², 9: cm²/s
 */
export const DICOM_UNIT_CODES = {
  NONE: 0,
  PERCENT: 1,
  DECIBEL: 2,
  CENTIMETER: 3,
  SECONDS: 4,
  HERTZ: 5,
  DB_PER_SEC: 6,
  CM_PER_SEC: 7,
  CM_SQUARED: 8,
  CM_SQUARED_PER_SEC: 9,
} as const;

// =============================================================================
// Measurement Result
// =============================================================================

/**
 * 측정 결과
 */
export interface MeasurementResult {
  /** 계산된 값 */
  value: number;
  /** 단위 (mm, cm/s, ms, deg 등) */
  unit: string;
  /** 표시 문자열 (예: "45.2 mm") */
  displayText: string;
}

// =============================================================================
// Annotation (Core Data Structure)
// =============================================================================

/**
 * 어노테이션 데이터 구조
 *
 * 내부 저장용 - DICOM 픽셀 좌표 기준
 */
export interface Annotation {
  /** 고유 식별자 */
  id: string;
  /** DICOM 파일 ID */
  dicomId: string;
  /** 프레임 인덱스 (멀티프레임 DICOM) */
  frameIndex: number;

  // 도구 정보
  /** 측정 도구 타입 */
  type: AnnotationType;
  /** DICOM 모드 */
  mode: DicomMode;

  // 좌표 (DICOM 픽셀 좌표, 정수)
  /** 측정 포인트들 */
  points: Point[];

  // 계산 결과
  /** 측정값 */
  value: number;
  /** 단위 */
  unit: string;
  /** 표시 문자열 */
  displayValue: string;

  // 표시 설정
  /** 라벨 위치 (드래그 가능) */
  labelPosition: Point;
  /** 색상 (선택적) */
  color?: string;
  /** 표시 여부 */
  visible: boolean;

  // 권한 (source 기반 자동 결정 또는 오버라이드)
  /** 출처 */
  source: AnnotationSource;
  /** 삭제 가능 여부 */
  deletable: boolean;
  /** 수정 가능 여부 */
  editable: boolean;

  // 메타데이터
  /** 생성 시간 (timestamp) */
  createdAt: number;
  /** 수정 시간 (timestamp) */
  updatedAt: number;
  /** 생성자 ID (선택적) */
  createdBy?: string;
  /** 커스텀 데이터 (확장용) */
  customData?: Record<string, unknown>;
}

// =============================================================================
// Export/Import Format (v1.0)
// =============================================================================

/**
 * 내보내기 포맷 버전
 */
export const EXPORT_FORMAT_VERSION = '1.0' as const;

/**
 * 내보내기된 어노테이션 데이터
 *
 * 서버 저장 및 외부 시스템 연동용 JSON 포맷
 */
export interface ExportedAnnotationData {
  /** 포맷 버전 */
  version: typeof EXPORT_FORMAT_VERSION;

  /** DICOM 파일 ID */
  dicomId: string;
  /** Study Instance UID (선택적) */
  studyInstanceUID?: string;
  /** Series Instance UID (선택적) */
  seriesInstanceUID?: string;
  /** SOP Instance UID (선택적) */
  sopInstanceUID?: string;

  /** 어노테이션 목록 */
  annotations: ExportedAnnotation[];

  /** 내보내기 시간 (ISO 8601) */
  exportedAt: string;
}

/**
 * 내보내기된 개별 어노테이션
 */
export interface ExportedAnnotation {
  /** 고유 식별자 */
  id: string;
  /** 프레임 인덱스 */
  frameIndex: number;

  /** 측정 도구 타입 */
  type: string;
  /** DICOM 모드 */
  mode: DicomMode;

  /** DICOM 픽셀 좌표 (원본 이미지 기준) */
  points: Array<{ x: number; y: number }>;

  /** 측정 결과 */
  measurement: {
    value: number;
    unit: string;
    displayText: string;
  };

  /** 캘리브레이션 정보 (재계산용) */
  calibration: {
    physicalDeltaX: number;
    physicalDeltaY: number;
    unitX: number;
    unitY: number;
    baseLine?: number;
  };

  /** 표시 설정 */
  display: {
    labelPosition: { x: number; y: number };
    color?: string;
    visible: boolean;
  };

  /** 메타데이터 */
  metadata: {
    source: string;
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
    customData?: Record<string, unknown>;
  };
}

// =============================================================================
// Import Options
// =============================================================================

/**
 * 가져오기 옵션
 */
export interface ImportOptions {
  /**
   * 기존 어노테이션 충돌 시 처리 방법
   * - replace: 기존 데이터 교체
   * - skip: 새 데이터 무시
   * - merge: 병합 (ID가 다르면 추가)
   */
  conflictStrategy: 'replace' | 'skip' | 'merge';

  /** 가져온 데이터의 출처 오버라이드 */
  sourceOverride?: AnnotationSource;

  /** 권한 오버라이드 (선택적) */
  permissionOverride?: Partial<PermissionSet>;
}

// =============================================================================
// Annotation Manager Configuration
// =============================================================================

/**
 * AnnotationManager 설정
 */
export interface AnnotationManagerConfig {
  /** 권한 설정 */
  permissions?: PermissionConfig;
  /** 제한 설정 */
  limits?: LimitConfig;
  /** 렌더러 타입 */
  renderer?: 'svg' | 'canvas';
  /** 히스토리 스택 최대 크기 */
  maxHistorySize?: number;
}

/**
 * 기본 AnnotationManager 설정
 */
export const DEFAULT_ANNOTATION_CONFIG: Required<AnnotationManagerConfig> = {
  permissions: DEFAULT_PERMISSIONS,
  limits: DEFAULT_LIMITS,
  renderer: 'svg',
  maxHistorySize: 50,
};

// =============================================================================
// History Manager Types
// =============================================================================

/**
 * 어노테이션 명령 (Undo/Redo용)
 */
export interface AnnotationCommand {
  /** 명령 타입 */
  type: 'create' | 'update' | 'delete';
  /** 어노테이션 ID */
  annotationId: string;
  /** DICOM ID */
  dicomId: string;
  /** 프레임 인덱스 */
  frameIndex: number;
  /** 이전 상태 (undo용) */
  previousState: Annotation | null;
  /** 새 상태 (redo용) */
  newState: Annotation | null;
  /** 타임스탬프 */
  timestamp: number;
}

// =============================================================================
// Validation Types
// =============================================================================

/**
 * 유효성 검증 결과
 */
export interface ValidationResult {
  /** 유효 여부 */
  valid: boolean;
  /** 에러 메시지 목록 */
  errors: string[];
  /** 경고 메시지 목록 */
  warnings?: string[];
}

/**
 * 제한 검증 결과
 */
export interface LimitValidationResult {
  /** 추가 가능 여부 */
  allowed: boolean;
  /** 현재 개수 */
  currentCount: number;
  /** 최대 개수 */
  maxCount: number;
  /** 메시지 */
  message?: string;
}
