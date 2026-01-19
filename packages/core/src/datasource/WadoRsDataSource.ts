import type {
  DataSource,
  DicomInstanceId,
  DicomMetadata,
  LoadFrameOptions,
  WadoRsConfig,
} from './types';
import type { DicomImageInfo } from '../dicom/types';
import { LRUCache } from '../cache/LRUCache';
import { retryFetch, type RetryOptions } from '../network/retry';
import { NetworkError } from '../network/errors';

/**
 * WADO-RS DataSource
 *
 * WADO-RS (Web Access to DICOM Objects - RESTful Services) 표준을 구현
 *
 * 주요 기능:
 * - 메타데이터 조회: GET .../instances/{uid}/metadata
 * - 프레임 조회: GET .../instances/{uid}/frames/{frameNumber}
 * - 2계층 캐싱: 메타데이터 + 프레임 데이터
 * - pendingLoads로 중복 요청 방지
 * - 지수 백오프 재시도
 *
 * DICOM Web 표준:
 * - 메타데이터 응답: application/dicom+json
 * - 프레임 응답: multipart/related 또는 application/octet-stream
 */
export class WadoRsDataSource implements DataSource {
  readonly type = 'wado-rs';

  private readonly config: Required<
    Pick<
      WadoRsConfig,
      'baseUrl' | 'timeout' | 'maxRetries' | 'frameCacheSize' | 'metadataCacheSize'
    >
  > &
    Pick<WadoRsConfig, 'tenantId' | 'headers' | 'authToken'>;

  // 메타데이터 캐시
  private metadataCache: LRUCache<string, DicomMetadata>;

  // 프레임 데이터 캐시
  private frameCache: LRUCache<string, Uint8Array>;

  // 진행 중인 요청 (중복 방지)
  private pendingMetadata: Map<string, Promise<DicomMetadata>> = new Map();
  // TODO: pendingFrames 중복 요청 방지 로직 미구현
  // - 현재: 선언만 되어 있고 실제 사용되지 않음
  // - 필요 시점: 프리페칭 기능 구현 시 (Phase 2 네트워크 고급)
  // - 구현 방법: pendingMetadata와 동일한 패턴으로 loadFrameWithFormat()에 적용
  private pendingFrames: Map<string, Promise<Uint8Array>> = new Map();

  constructor(config: WadoRsConfig) {
    // 필수 설정 검증
    if (!config.baseUrl) {
      throw new Error('baseUrl is required');
    }

    // 기본값 적용
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''), // 끝 슬래시 제거
      tenantId: config.tenantId,
      timeout: config.timeout ?? 30000,
      maxRetries: config.maxRetries ?? 3,
      headers: config.headers,
      authToken: config.authToken,
      frameCacheSize: config.frameCacheSize ?? 100,
      metadataCacheSize: config.metadataCacheSize ?? 50,
    };

    this.metadataCache = new LRUCache(this.config.metadataCacheSize);
    this.frameCache = new LRUCache(this.config.frameCacheSize);
  }

  /**
   * 메타데이터 로드
   *
   * WADO-RS 메타데이터 엔드포인트:
   * GET /studies/{studyUid}/series/{seriesUid}/instances/{sopInstanceUid}/metadata
   */
  async loadMetadata(
    instanceId: DicomInstanceId,
    options?: LoadFrameOptions,
  ): Promise<DicomMetadata> {
    const cacheKey = this.getInstanceKey(instanceId);
    const useCache = options?.useCache !== false;

    // 캐시 확인
    if (useCache) {
      const cached = this.metadataCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // 진행 중인 요청 확인 (중복 방지)
    const pending = this.pendingMetadata.get(cacheKey);
    if (pending) {
      return pending;
    }
    const promise = this.fetchMetadata(instanceId, options);
    this.pendingMetadata.set(cacheKey, promise);

    try {
      const metadata = await promise;

      // 캐시 저장
      if (useCache) {
        this.metadataCache.set(cacheKey, metadata);
      }

      return metadata;
    } finally {
      this.pendingMetadata.delete(cacheKey);
    }
  }

  /**
   * 특정 프레임 로드
   *
   * WADO-RS 프레임 엔드포인트:
   * GET /studies/{studyUid}/series/{seriesUid}/instances/{sopInstanceUid}/frames/{frameNumber}
   */
  async loadFrame(
    instanceId: DicomInstanceId,
    frameNumber: number,
    options?: LoadFrameOptions,
  ): Promise<Uint8Array> {
    const result = await this.loadFrameWithFormat(instanceId, frameNumber, options);
    return result.data;
  }

  /**
   * 프레임 로드 (형식 정보 포함)
   */
  private async loadFrameWithFormat(
    instanceId: DicomInstanceId,
    frameNumber: number,
    options?: LoadFrameOptions,
  ): Promise<{ data: Uint8Array; isJpeg: boolean }> {
    const instanceKey = this.getInstanceKey(instanceId);
    const cacheKey = `${instanceKey}:${frameNumber}`;
    const useCache = options?.useCache !== false;

    // 캐시 확인 (캐시에는 데이터만 저장, 형식은 다시 감지)
    if (useCache) {
      const cached = this.frameCache.get(cacheKey);
      if (cached) {
        const isJpeg = cached.length >= 2 && cached[0] === 0xFF && cached[1] === 0xD8;
        return { data: cached, isJpeg };
      }
    }
    const result = await this.fetchFrame(instanceId, frameNumber, options);

    // 캐시 저장
    if (useCache) {
      this.frameCache.set(cacheKey, result.data);
    }

    return result;
  }

  /**
   * 여러 프레임 동시 로드
   *
   * 병렬로 요청하되, 중복 요청은 pendingFrames로 방지
   */
  async loadFrames(
    instanceId: DicomInstanceId,
    frameNumbers: number[],
    options?: LoadFrameOptions,
  ): Promise<Uint8Array[]> {
    const promises = frameNumbers.map((fn) =>
      this.loadFrame(instanceId, fn, options),
    );
    return Promise.all(promises);
  }

  /**
   * 모든 프레임 로드
   *
   * 중요: 실제 프레임 데이터의 형식(JPEG/raw)을 감지하여
   * metadata.isEncapsulated를 업데이트합니다.
   */
  async loadAllFrames(
    instanceId: DicomInstanceId,
    options?: LoadFrameOptions,
  ): Promise<{ metadata: DicomMetadata; frames: Uint8Array[] }> {
    // 먼저 메타데이터 로드
    const metadata = await this.loadMetadata(instanceId, options);

    // 모든 프레임 번호 생성 (1-based)
    const frameNumbers = Array.from(
      { length: metadata.frameCount },
      (_, i) => i + 1,
    );

    // 프레임 로드 (형식 정보 포함)
    const results = await Promise.all(
      frameNumbers.map((fn) => this.loadFrameWithFormat(instanceId, fn, options)),
    );

    const frames = results.map((r) => r.data);

    // 첫 번째 프레임의 실제 형식으로 isEncapsulated 결정
    // (WADO-RS는 모든 프레임을 동일한 형식으로 반환)
    const actualIsEncapsulated = results.length > 0 ? results[0].isJpeg : false;

    // 메타데이터의 isEncapsulated를 실제 값으로 업데이트
    const updatedMetadata: DicomMetadata = {
      ...metadata,
      isEncapsulated: actualIsEncapsulated,
    };

    return { metadata: updatedMetadata, frames };
  }

  /**
   * Series 내 모든 Instance UID 목록 조회
   *
   * WADO-RS 인스턴스 검색 엔드포인트:
   * GET /studies/{studyUid}/series/{seriesUid}/instances
   *
   * @returns SOP Instance UID 배열
   */
  async listInstances(
    studyInstanceUid: string,
    seriesInstanceUid: string,
    options?: LoadFrameOptions,
  ): Promise<string[]> {
    const url = `${this.config.baseUrl}/studies/${studyInstanceUid}/series/${seriesInstanceUid}/instances`;
    const headers = {
      ...this.getHeaders(),
      Accept: 'application/dicom+json',
    };

    const response = await retryFetch(
      url,
      { headers, signal: options?.signal },
      this.getRetryOptions(options),
    );

    const jsonArray = await response.json();

    if (!Array.isArray(jsonArray)) {
      throw new NetworkError('Invalid instances response', 'BAD_REQUEST');
    }

    // 각 인스턴스에서 SOP Instance UID 추출 (00080018)
    const instanceUids: string[] = [];
    for (const item of jsonArray) {
      const sopElement = item['00080018'] as { Value?: string[] } | undefined;
      const sopInstanceUid = sopElement?.Value?.[0];
      if (sopInstanceUid) {
        instanceUids.push(sopInstanceUid);
      }
    }

    return instanceUids;
  }

  /**
   * 캐시 초기화
   */
  clearCache(): void {
    this.metadataCache.clear();
    this.frameCache.clear();
  }

  /**
   * 리소스 정리
   */
  dispose(): void {
    this.clearCache();
    this.pendingMetadata.clear();
    this.pendingFrames.clear();
  }

  // ============ Private Methods ============

  /**
   * 인스턴스 키 생성
   */
  private getInstanceKey(instanceId: DicomInstanceId): string {
    const { studyInstanceUid, seriesInstanceUid, sopInstanceUid } = instanceId;
    return [studyInstanceUid, seriesInstanceUid, sopInstanceUid]
      .filter(Boolean)
      .join('/');
  }

  /**
   * 메타데이터 URL 생성
   */
  private getMetadataUrl(instanceId: DicomInstanceId): string {
    const { studyInstanceUid, seriesInstanceUid, sopInstanceUid } = instanceId;

    if (!studyInstanceUid || !seriesInstanceUid) {
      throw new NetworkError(
        'studyInstanceUid and seriesInstanceUid are required for WADO-RS',
        'BAD_REQUEST',
      );
    }

    return `${this.config.baseUrl}/studies/${studyInstanceUid}/series/${seriesInstanceUid}/instances/${sopInstanceUid}/metadata`;
  }

  /**
   * 프레임 URL 생성
   */
  private getFrameUrl(instanceId: DicomInstanceId, frameNumber: number): string {
    const { studyInstanceUid, seriesInstanceUid, sopInstanceUid } = instanceId;

    if (!studyInstanceUid || !seriesInstanceUid) {
      throw new NetworkError(
        'studyInstanceUid and seriesInstanceUid are required for WADO-RS',
        'BAD_REQUEST',
      );
    }

    return `${this.config.baseUrl}/studies/${studyInstanceUid}/series/${seriesInstanceUid}/instances/${sopInstanceUid}/frames/${frameNumber}`;
  }

  /**
   * HTTP 요청 헤더 생성
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.config.headers,
    };

    if (this.config.tenantId) {
      headers['X-Tenant-Id'] = this.config.tenantId;
    }

    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    return headers;
  }

  /**
   * 재시도 옵션 생성
   */
  private getRetryOptions(options?: LoadFrameOptions): RetryOptions {
    return {
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout,
      onRetry: (attempt, error, delay) => {
        console.warn(
          `[WadoRsDataSource] Retry ${attempt}: ${error.message}, waiting ${Math.round(delay)}ms`,
        );
      },
    };
  }

  /**
   * 메타데이터 fetch
   */
  private async fetchMetadata(
    instanceId: DicomInstanceId,
    options?: LoadFrameOptions,
  ): Promise<DicomMetadata> {
    const url = this.getMetadataUrl(instanceId);
    const headers = {
      ...this.getHeaders(),
      Accept: 'application/dicom+json',
    };

    const response = await retryFetch(
      url,
      { headers, signal: options?.signal },
      this.getRetryOptions(options),
    );

    // DICOM JSON 파싱
    const jsonArray = await response.json();

    // DICOM JSON은 배열 형태
    if (!Array.isArray(jsonArray) || jsonArray.length === 0) {
      throw new NetworkError('Invalid DICOM JSON response', 'BAD_REQUEST');
    }

    const dicomJson = jsonArray[0];

    // 메타데이터 추출
    const metadata = this.parseDicomJson(dicomJson);
    return metadata;
  }

  /**
   * 프레임 fetch 결과 (데이터 + 형식 정보)
   */
  private async fetchFrame(
    instanceId: DicomInstanceId,
    frameNumber: number,
    options?: LoadFrameOptions,
  ): Promise<{ data: Uint8Array; isJpeg: boolean }> {
    const url = this.getFrameUrl(instanceId, frameNumber);
    const headers = {
      ...this.getHeaders(),
      // JPEG 또는 octet-stream 모두 수용
      Accept: 'image/jpeg, application/octet-stream, multipart/related',
    };

    const response = await retryFetch(
      url,
      { headers, signal: options?.signal },
      this.getRetryOptions(options),
    );

    const contentType = response.headers.get('content-type') || '';

    // Content-Type으로 형식 판단
    const isJpeg = contentType.includes('image/jpeg') || contentType.includes('image/jp2');

    // multipart 응답 처리
    if (contentType.includes('multipart/related')) {
      const data = await this.parseMultipartResponse(response);
      // multipart 내부 형식 감지 (JPEG 시그니처: FFD8)
      const isJpegData = data.length >= 2 && data[0] === 0xFF && data[1] === 0xD8;
      return { data, isJpeg: isJpegData };
    }

    // 단일 프레임 응답
    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);

    // 데이터 시그니처로도 확인 (JPEG: FFD8)
    const isJpegBySignature = data.length >= 2 && data[0] === 0xFF && data[1] === 0xD8;

    return { data, isJpeg: isJpeg || isJpegBySignature };
  }

  /**
   * DICOM JSON을 DicomMetadata로 변환
   */
  private parseDicomJson(json: Record<string, unknown>): DicomMetadata {
    // DICOM JSON 태그 형식: "00280010" -> { vr: "US", Value: [512] }
    const getValue = (tag: string): unknown => {
      const element = json[tag] as { Value?: unknown[] } | undefined;
      return element?.Value?.[0];
    };

    const getStringValue = (tag: string): string | undefined => {
      const value = getValue(tag);
      return typeof value === 'string' ? value : undefined;
    };

    const getNumberValue = (tag: string): number | undefined => {
      const value = getValue(tag);
      return typeof value === 'number' ? value : undefined;
    };

    // 이미지 정보 추출
    const rows = getNumberValue('00280010');
    const columns = getNumberValue('00280011');
    const bitsAllocated = getNumberValue('00280100');

    if (rows === undefined || columns === undefined || bitsAllocated === undefined) {
      throw new NetworkError('Missing required image dimensions', 'BAD_REQUEST');
    }

    const imageInfo: DicomImageInfo = {
      rows,
      columns,
      bitsAllocated,
      bitsStored: getNumberValue('00280101') ?? bitsAllocated,
      highBit: getNumberValue('00280102') ?? bitsAllocated - 1,
      pixelRepresentation: getNumberValue('00280103') ?? 0,
      photometricInterpretation: getStringValue('00280004') ?? 'MONOCHROME2',
      samplesPerPixel: getNumberValue('00280002') ?? 1,
    };

    // 프레임 수 (00280008 - Number of Frames)
    const numberOfFramesStr = getStringValue('00280008');
    const frameCount = numberOfFramesStr ? parseInt(numberOfFramesStr, 10) : 1;

    // Transfer Syntax (00020010)
    const transferSyntax = getStringValue('00020010');

    // 압축 여부 결정
    const isEncapsulated = this.isTransferSyntaxEncapsulated(transferSyntax);

    return {
      imageInfo,
      frameCount,
      isEncapsulated,
      transferSyntax,
    };
  }

  /**
   * Transfer Syntax가 압축인지 확인
   */
  private isTransferSyntaxEncapsulated(transferSyntax?: string): boolean {
    if (!transferSyntax) return false;

    // JPEG, RLE 등 압축 Transfer Syntax
    const encapsulatedPrefixes = [
      '1.2.840.10008.1.2.4', // JPEG 계열
      '1.2.840.10008.1.2.5', // RLE
    ];

    return encapsulatedPrefixes.some((prefix) =>
      transferSyntax.startsWith(prefix),
    );
  }

  /**
   * multipart/related 응답 파싱
   *
   * WADO-RS 프레임 응답은 multipart/related 형식일 수 있음
   * 단순화를 위해 첫 번째 파트만 추출
   */
  private async parseMultipartResponse(response: Response): Promise<Uint8Array> {
    const contentType = response.headers.get('content-type') || '';

    // boundary 추출
    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/i);
    if (!boundaryMatch) {
      // boundary가 없으면 전체를 하나의 파트로 처리
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    }

    const boundary = boundaryMatch[1].replace(/"/g, '');
    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);

    // boundary 패턴으로 파트 분리
    const boundaryBytes = new TextEncoder().encode(`--${boundary}`);

    // 첫 번째 데이터 파트 찾기
    let start = this.findPattern(data, boundaryBytes, 0);
    if (start === -1) {
      // boundary를 못 찾으면 전체 반환
      return data;
    }

    // 헤더 끝 찾기 (\r\n\r\n)
    start = this.findPattern(data, new Uint8Array([13, 10, 13, 10]), start);
    if (start === -1) {
      return data;
    }
    start += 4; // 헤더 끝 건너뛰기

    // 다음 boundary 찾기
    let end = this.findPattern(data, boundaryBytes, start);
    if (end === -1) {
      end = data.length;
    } else {
      // \r\n 건너뛰기
      end -= 2;
    }

    return data.slice(start, end);
  }

  /**
   * 바이트 패턴 찾기
   */
  private findPattern(
    data: Uint8Array,
    pattern: Uint8Array,
    start: number,
  ): number {
    outer: for (let i = start; i <= data.length - pattern.length; i++) {
      for (let j = 0; j < pattern.length; j++) {
        if (data[i + j] !== pattern[j]) {
          continue outer;
        }
      }
      return i;
    }
    return -1;
  }
}
