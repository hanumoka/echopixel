import type { DicomImageInfo } from '../dicom';
// PixelDataInfo import removed - not currently used

/**
 * DICOM 인스턴스 식별자
 *
 * WADO-RS에서는 Study/Series/Instance UID가 모두 필요하지만,
 * 로컬 파일에서는 파일 경로나 고유 ID만 필요함
 */
export interface DicomInstanceId {
  /** Study Instance UID */
  studyInstanceUid?: string;
  /** Series Instance UID */
  seriesInstanceUid?: string;
  /** SOP Instance UID */
  sopInstanceUid: string;
}

/**
 * DICOM 메타데이터
 *
 * 렌더링에 필요한 정보를 포함
 */
export interface DicomMetadata {
  /** 이미지 렌더링 정보 */
  imageInfo: DicomImageInfo;
  /** 총 프레임 수 */
  frameCount: number;
  /** 압축 여부 */
  isEncapsulated: boolean;
  /** Transfer Syntax UID */
  transferSyntax?: string;
  /** 추가 메타데이터 (선택적) */
  additionalTags?: Record<string, unknown>;
}

/**
 * 프레임 로드 옵션
 */
export interface LoadFrameOptions {
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** 캐시 사용 여부 (기본: true) */
  useCache?: boolean;
}

/**
 * DataSource 인터페이스
 *
 * 왜 DataSource 추상화가 필요한가?
 * - 로컬 파일, WADO-RS, WADO-URI 등 다양한 소스를 동일하게 처리
 * - 캐싱, 재시도 등의 로직을 소스별로 다르게 구현 가능
 * - DicomViewport가 특정 소스에 의존하지 않음
 *
 * 구현체:
 * - LocalFileDataSource: 로컬 파일/ArrayBuffer 처리
 * - WadoRsDataSource: WADO-RS 서버 통신
 */
export interface DataSource {
  /** DataSource 타입 식별자 */
  readonly type: string;

  /**
   * DICOM 인스턴스의 메타데이터를 로드
   *
   * @param instanceId DICOM 인스턴스 식별자
   * @param options 로드 옵션
   * @returns 메타데이터 (이미지 정보, 프레임 수 등)
   */
  loadMetadata(
    instanceId: DicomInstanceId,
    options?: LoadFrameOptions,
  ): Promise<DicomMetadata>;

  /**
   * 특정 프레임의 픽셀 데이터를 로드
   *
   * @param instanceId DICOM 인스턴스 식별자
   * @param frameNumber 프레임 번호 (1-based, DICOM 표준)
   * @param options 로드 옵션
   * @returns 프레임 픽셀 데이터 (압축 또는 비압축)
   */
  loadFrame(
    instanceId: DicomInstanceId,
    frameNumber: number,
    options?: LoadFrameOptions,
  ): Promise<Uint8Array>;

  /**
   * 여러 프레임을 동시에 로드 (선택적 최적화)
   *
   * 기본 구현은 loadFrame을 순차 호출하지만,
   * WADO-RS는 bulk 요청으로 최적화 가능
   */
  loadFrames?(
    instanceId: DicomInstanceId,
    frameNumbers: number[],
    options?: LoadFrameOptions,
  ): Promise<Uint8Array[]>;

  /**
   * 모든 프레임을 로드
   * 메타데이터와 함께 전체 픽셀 데이터 반환
   */
  loadAllFrames(
    instanceId: DicomInstanceId,
    options?: LoadFrameOptions,
  ): Promise<{
    metadata: DicomMetadata;
    frames: Uint8Array[];
  }>;

  /**
   * 캐시 초기화
   */
  clearCache?(): void;

  /**
   * 리소스 정리
   */
  dispose?(): void;
}

/**
 * WADO-RS 설정
 */
export interface WadoRsConfig {
  /** DICOM Web 기본 URL (예: 'http://localhost:8080/dicomweb') */
  baseUrl: string;
  /** 테넌트 ID (멀티테넌트 서버용) */
  tenantId?: string;
  /** 요청 타임아웃 (ms) (기본: 30000) */
  timeout?: number;
  /** 최대 재시도 횟수 (기본: 3) */
  maxRetries?: number;
  /** 추가 HTTP 헤더 */
  headers?: Record<string, string>;
  /** 인증 토큰 */
  authToken?: string;
  /** 프레임 캐시 크기 (기본: 100) */
  frameCacheSize?: number;
  /** 메타데이터 캐시 크기 (기본: 50) */
  metadataCacheSize?: number;
}

/**
 * LocalFile DataSource 설정
 */
export interface LocalFileConfig {
  /** 프레임 캐시 크기 (기본: 100) */
  frameCacheSize?: number;
}
