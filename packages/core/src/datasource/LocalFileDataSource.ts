import type {
  DataSource,
  DicomInstanceId,
  DicomMetadata,
  LoadFrameOptions,
  LocalFileConfig,
} from './types';
import {
  parseDicom,
  getImageInfo,
  extractPixelData,
  isEncapsulated,
} from '../dicom/DicomParser';
import { LRUCache } from '../cache/LRUCache';

/**
 * 로컬 파일 DataSource
 *
 * 왜 필요한가?
 * - 기존 로컬 파일 처리 로직을 DataSource 인터페이스로 통합
 * - WADO-RS와 동일한 인터페이스로 로컬 파일 접근
 * - 캐싱을 통해 반복 접근 시 재파싱 방지
 *
 * 작동 방식:
 * 1. addFile()로 ArrayBuffer를 등록 (sopInstanceUid를 키로)
 * 2. loadMetadata()로 메타데이터 조회
 * 3. loadFrame()으로 특정 프레임 조회
 */
export class LocalFileDataSource implements DataSource {
  readonly type = 'local-file';

  // 등록된 파일 버퍼
  private files: Map<string, ArrayBuffer> = new Map();

  // 파싱된 메타데이터 캐시
  private metadataCache: LRUCache<string, DicomMetadata>;

  // 추출된 프레임 캐시 (키: `${instanceId}:${frameNumber}`)
  private frameCache: LRUCache<string, Uint8Array>;

  constructor(config?: LocalFileConfig) {
    const frameCacheSize = config?.frameCacheSize ?? 100;
    this.metadataCache = new LRUCache(50);
    this.frameCache = new LRUCache(frameCacheSize);
  }

  /**
   * DICOM 파일을 DataSource에 등록
   *
   * @param sopInstanceUid 고유 식별자 (없으면 자동 생성)
   * @param buffer DICOM 파일 ArrayBuffer
   * @returns 등록된 sopInstanceUid
   */
  addFile(buffer: ArrayBuffer, sopInstanceUid?: string): string {
    const uid = sopInstanceUid ?? generateUid();
    this.files.set(uid, buffer);
    return uid;
  }

  /**
   * 등록된 파일 제거
   */
  removeFile(sopInstanceUid: string): boolean {
    // 관련 캐시도 정리
    this.metadataCache.delete(sopInstanceUid);

    // 프레임 캐시에서 해당 인스턴스 관련 항목 제거
    for (const key of this.frameCache.keys()) {
      if (key.startsWith(`${sopInstanceUid}:`)) {
        this.frameCache.delete(key);
      }
    }

    return this.files.delete(sopInstanceUid);
  }

  /**
   * 메타데이터 로드
   */
  async loadMetadata(
    instanceId: DicomInstanceId,
    options?: LoadFrameOptions,
  ): Promise<DicomMetadata> {
    const { sopInstanceUid } = instanceId;

    // 캐시 확인
    const useCache = options?.useCache !== false;
    if (useCache) {
      const cached = this.metadataCache.get(sopInstanceUid);
      if (cached) {
        return cached;
      }
    }

    // 파일 버퍼 조회
    const buffer = this.files.get(sopInstanceUid);
    if (!buffer) {
      throw new Error(`File not found: ${sopInstanceUid}`);
    }

    // 파싱
    const dataset = parseDicom(buffer);
    const imageInfo = getImageInfo(buffer, dataset);

    if (!imageInfo) {
      throw new Error('Failed to extract image info');
    }

    const pixelDataInfo = extractPixelData(buffer, dataset);
    if (!pixelDataInfo) {
      throw new Error('Failed to extract pixel data');
    }

    const metadata: DicomMetadata = {
      imageInfo,
      frameCount: pixelDataInfo.frameCount,
      isEncapsulated: isEncapsulated(dataset.transferSyntax),
      transferSyntax: dataset.transferSyntax,
    };

    // 캐시 저장
    if (useCache) {
      this.metadataCache.set(sopInstanceUid, metadata);
    }

    return metadata;
  }

  /**
   * 특정 프레임 로드
   *
   * @param frameNumber 1-based 프레임 번호 (DICOM 표준)
   */
  async loadFrame(
    instanceId: DicomInstanceId,
    frameNumber: number,
    options?: LoadFrameOptions,
  ): Promise<Uint8Array> {
    const { sopInstanceUid } = instanceId;

    // 캐시 키
    const cacheKey = `${sopInstanceUid}:${frameNumber}`;

    // 캐시 확인
    const useCache = options?.useCache !== false;
    if (useCache) {
      const cached = this.frameCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // 파일 버퍼 조회
    const buffer = this.files.get(sopInstanceUid);
    if (!buffer) {
      throw new Error(`File not found: ${sopInstanceUid}`);
    }

    // 파싱 및 프레임 추출
    const dataset = parseDicom(buffer);
    const pixelDataInfo = extractPixelData(buffer, dataset);

    if (!pixelDataInfo) {
      throw new Error('Failed to extract pixel data');
    }

    // 프레임 번호 검증 (1-based to 0-based)
    const frameIndex = frameNumber - 1;
    if (frameIndex < 0 || frameIndex >= pixelDataInfo.frames.length) {
      throw new Error(
        `Frame ${frameNumber} out of range (1-${pixelDataInfo.frames.length})`,
      );
    }

    const frameData = pixelDataInfo.frames[frameIndex];

    // 캐시 저장
    if (useCache) {
      this.frameCache.set(cacheKey, frameData);
    }

    return frameData;
  }

  /**
   * 여러 프레임 동시 로드
   */
  async loadFrames(
    instanceId: DicomInstanceId,
    frameNumbers: number[],
    options?: LoadFrameOptions,
  ): Promise<Uint8Array[]> {
    // 로컬 파일은 이미 메모리에 있으므로 병렬 처리 불필요
    // 순차적으로 로드하되, 파싱은 한 번만 수행
    const { sopInstanceUid } = instanceId;

    const buffer = this.files.get(sopInstanceUid);
    if (!buffer) {
      throw new Error(`File not found: ${sopInstanceUid}`);
    }

    const dataset = parseDicom(buffer);
    const pixelDataInfo = extractPixelData(buffer, dataset);

    if (!pixelDataInfo) {
      throw new Error('Failed to extract pixel data');
    }

    const useCache = options?.useCache !== false;
    const results: Uint8Array[] = [];

    for (const frameNumber of frameNumbers) {
      const frameIndex = frameNumber - 1;

      if (frameIndex < 0 || frameIndex >= pixelDataInfo.frames.length) {
        throw new Error(
          `Frame ${frameNumber} out of range (1-${pixelDataInfo.frames.length})`,
        );
      }

      const frameData = pixelDataInfo.frames[frameIndex];

      // 캐시 저장
      if (useCache) {
        const cacheKey = `${sopInstanceUid}:${frameNumber}`;
        this.frameCache.set(cacheKey, frameData);
      }

      results.push(frameData);
    }

    return results;
  }

  /**
   * 모든 프레임 로드
   */
  async loadAllFrames(
    instanceId: DicomInstanceId,
    options?: LoadFrameOptions,
  ): Promise<{ metadata: DicomMetadata; frames: Uint8Array[] }> {
    const { sopInstanceUid } = instanceId;

    const buffer = this.files.get(sopInstanceUid);
    if (!buffer) {
      throw new Error(`File not found: ${sopInstanceUid}`);
    }

    const dataset = parseDicom(buffer);
    const imageInfo = getImageInfo(buffer, dataset);

    if (!imageInfo) {
      throw new Error('Failed to extract image info');
    }

    const pixelDataInfo = extractPixelData(buffer, dataset);
    if (!pixelDataInfo) {
      throw new Error('Failed to extract pixel data');
    }

    const metadata: DicomMetadata = {
      imageInfo,
      frameCount: pixelDataInfo.frameCount,
      isEncapsulated: isEncapsulated(dataset.transferSyntax),
      transferSyntax: dataset.transferSyntax,
    };

    // 캐시 저장
    const useCache = options?.useCache !== false;
    if (useCache) {
      this.metadataCache.set(sopInstanceUid, metadata);

      for (let i = 0; i < pixelDataInfo.frames.length; i++) {
        const cacheKey = `${sopInstanceUid}:${i + 1}`;
        this.frameCache.set(cacheKey, pixelDataInfo.frames[i]);
      }
    }

    return {
      metadata,
      frames: pixelDataInfo.frames,
    };
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
    this.files.clear();
    this.clearCache();
  }
}

/**
 * 간단한 UID 생성 (진짜 DICOM UID는 아님, 로컬용)
 */
function generateUid(): string {
  return `local.${Date.now()}.${Math.random().toString(36).slice(2, 11)}`;
}
