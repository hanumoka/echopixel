/**
 * TextureLRUCache - VRAM 기반 LRU 텍스처 캐시
 *
 * 학습 포인트:
 * - 일반 LRU는 개수 기반, 텍스처는 **바이트 기반** eviction 필요
 * - GPU 메모리(VRAM)는 브라우저에서 직접 측정 불가 → 계산으로 추정
 * - RGBA8 포맷: width × height × frameCount × 4 bytes
 *
 * 사용 시나리오:
 * - 16개 뷰포트: 모든 텍스처 유지 (VRAM 한계 내)
 * - 50개 시리즈 로드, 16개 표시: LRU eviction으로 VRAM 관리
 *
 * 설계 원칙:
 * - TextureManager는 외부에서 생성, 캐시는 관리만
 * - Eviction 시 자동 dispose() 호출
 * - Map 순서 기반 LRU (O(1) 시간 복잡도)
 */

import type { TextureManager } from '../webgl/TextureManager';

/**
 * 캐시 엔트리 - 텍스처와 메타데이터
 */
export interface TextureCacheEntry {
  /** TextureManager 인스턴스 */
  textureManager: TextureManager;
  /** 추정 VRAM 사용량 (bytes) */
  sizeBytes: number;
  /** 시리즈 식별자 (재사용 판단용) */
  seriesId: string;
  /** 프레임 수 */
  frameCount: number;
  /** 텍스처 너비 */
  width: number;
  /** 텍스처 높이 */
  height: number;
}

/**
 * 캐시 옵션
 */
export interface TextureLRUCacheOptions {
  /**
   * 최대 VRAM 사용량 (bytes)
   * 기본값: 512MB (536,870,912 bytes)
   */
  maxVRAMBytes?: number;

  /**
   * Eviction 콜백 (텍스처 해제 전 호출)
   * 로깅, UI 업데이트 등에 활용
   */
  onEvict?: (viewportId: string, entry: TextureCacheEntry) => void;

  /**
   * 디버그 로깅 활성화
   */
  debug?: boolean;
}

/** 기본 최대 VRAM: 512MB */
const DEFAULT_MAX_VRAM_BYTES = 512 * 1024 * 1024;

/**
 * VRAM 기반 LRU 텍스처 캐시
 *
 * @example
 * ```typescript
 * const cache = new TextureLRUCache({ maxVRAMBytes: 256 * 1024 * 1024 });
 *
 * // 텍스처 저장
 * cache.set('viewport-1', {
 *   textureManager,
 *   sizeBytes: 512 * 512 * 30 * 4, // ~30MB
 *   seriesId: 'series-abc',
 *   frameCount: 30,
 *   width: 512,
 *   height: 512,
 * });
 *
 * // 텍스처 조회 (LRU 순서 갱신)
 * const entry = cache.get('viewport-1');
 *
 * // VRAM 사용량 확인
 * console.log(`VRAM: ${cache.vramUsageMB}MB / ${cache.maxVRAMMB}MB`);
 * ```
 */
export class TextureLRUCache {
  /** 내부 캐시 (Map 순서 = LRU 순서) */
  private cache: Map<string, TextureCacheEntry> = new Map();

  /** 최대 VRAM 한계 (bytes) */
  private readonly maxVRAMBytes: number;

  /** 현재 VRAM 사용량 (bytes) */
  private currentVRAMBytes: number = 0;

  /** Eviction 콜백 */
  private readonly onEvict?: (viewportId: string, entry: TextureCacheEntry) => void;

  /** 디버그 모드 */
  private readonly debug: boolean;

  constructor(options: TextureLRUCacheOptions = {}) {
    this.maxVRAMBytes = options.maxVRAMBytes ?? DEFAULT_MAX_VRAM_BYTES;
    this.onEvict = options.onEvict;
    this.debug = options.debug ?? false;

    if (this.maxVRAMBytes <= 0) {
      throw new Error('maxVRAMBytes must be greater than 0');
    }

    this.log(`TextureLRUCache initialized: maxVRAM=${this.maxVRAMMB}MB`);
  }

  /**
   * 텍스처 조회 (LRU 순서 갱신)
   *
   * @param viewportId 뷰포트 ID
   * @returns 캐시 엔트리 또는 undefined
   */
  get(viewportId: string): TextureCacheEntry | undefined {
    const entry = this.cache.get(viewportId);
    if (!entry) {
      return undefined;
    }

    // Map에서 삭제 후 재삽입 → 가장 최근 사용 위치로 이동
    this.cache.delete(viewportId);
    this.cache.set(viewportId, entry);

    this.log(`Cache hit: ${viewportId}`);
    return entry;
  }

  /**
   * 텍스처 저장
   *
   * VRAM 한계 초과 시 가장 오래된 텍스처부터 자동 eviction
   *
   * @param viewportId 뷰포트 ID
   * @param entry 캐시 엔트리
   */
  set(viewportId: string, entry: TextureCacheEntry): void {
    // 기존 엔트리 존재 시 먼저 제거
    if (this.cache.has(viewportId)) {
      this.delete(viewportId);
    }

    // VRAM 한계 초과 시 eviction
    while (
      this.currentVRAMBytes + entry.sizeBytes > this.maxVRAMBytes &&
      this.cache.size > 0
    ) {
      this.evictOldest();
    }

    // 단일 엔트리가 최대 VRAM 초과하는 경우 경고 (그래도 저장)
    if (entry.sizeBytes > this.maxVRAMBytes) {
      console.warn(
        `[TextureLRUCache] Single entry exceeds maxVRAM: ` +
        `${this.bytesToMB(entry.sizeBytes)}MB > ${this.maxVRAMMB}MB`
      );
    }

    // 캐시에 저장
    this.cache.set(viewportId, entry);
    this.currentVRAMBytes += entry.sizeBytes;

    this.log(
      `Cache set: ${viewportId} (${this.bytesToMB(entry.sizeBytes)}MB), ` +
      `total=${this.vramUsageMB}MB/${this.maxVRAMMB}MB`
    );
  }

  /**
   * 텍스처 명시적 제거
   *
   * TextureManager.dispose()는 호출하지 않음 (호출자 책임)
   * 캐시에서만 제거하고 VRAM 추적 업데이트
   *
   * @param viewportId 뷰포트 ID
   * @returns 제거 성공 여부
   */
  delete(viewportId: string): boolean {
    const entry = this.cache.get(viewportId);
    if (!entry) {
      return false;
    }

    this.currentVRAMBytes -= entry.sizeBytes;
    this.cache.delete(viewportId);

    this.log(`Cache delete: ${viewportId}, total=${this.vramUsageMB}MB`);
    return true;
  }

  /**
   * 텍스처 제거 및 dispose 호출
   *
   * @param viewportId 뷰포트 ID
   * @returns 제거 성공 여부
   */
  deleteAndDispose(viewportId: string): boolean {
    const entry = this.cache.get(viewportId);
    if (!entry) {
      return false;
    }

    this.onEvict?.(viewportId, entry);
    entry.textureManager.dispose();
    return this.delete(viewportId);
  }

  /**
   * 키 존재 여부 확인 (LRU 순서 갱신 없음)
   */
  has(viewportId: string): boolean {
    return this.cache.has(viewportId);
  }

  /**
   * 특정 seriesId의 텍스처 검색
   *
   * 시리즈 재사용 시 활용 (같은 시리즈를 다른 뷰포트에서 이미 로드한 경우)
   *
   * @param seriesId 시리즈 ID
   * @returns [viewportId, entry] 또는 undefined
   */
  findBySeriesId(seriesId: string): [string, TextureCacheEntry] | undefined {
    for (const [viewportId, entry] of this.cache.entries()) {
      if (entry.seriesId === seriesId) {
        return [viewportId, entry];
      }
    }
    return undefined;
  }

  /**
   * 모든 텍스처 제거 (dispose 호출 포함)
   */
  clear(): void {
    for (const [viewportId, entry] of this.cache.entries()) {
      this.onEvict?.(viewportId, entry);
      entry.textureManager.dispose();
    }
    this.cache.clear();
    this.currentVRAMBytes = 0;

    this.log('Cache cleared');
  }

  /**
   * 캐시만 정리 (dispose 호출 없음)
   *
   * WebGL Context Loss 후 복구 시 사용:
   * - 이전 context의 텍스처는 이미 무효화됨
   * - dispose() 호출 시 "object does not belong to this context" 경고 발생
   * - 캐시 추적만 초기화하고 GPU 리소스 정리는 스킵
   */
  clearWithoutDispose(): void {
    this.cache.clear();
    this.currentVRAMBytes = 0;

    this.log('Cache cleared without dispose (context loss recovery)');
  }

  /**
   * 가장 오래된 텍스처 eviction (내부용)
   */
  private evictOldest(): void {
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey === undefined) {
      return;
    }

    const entry = this.cache.get(oldestKey);
    if (!entry) {
      return;
    }

    this.log(`Evicting LRU: ${oldestKey} (${this.bytesToMB(entry.sizeBytes)}MB)`);

    // Eviction 콜백 호출
    this.onEvict?.(oldestKey, entry);

    // TextureManager dispose
    entry.textureManager.dispose();

    // 캐시에서 제거
    this.currentVRAMBytes -= entry.sizeBytes;
    this.cache.delete(oldestKey);
  }

  // ─────────────────────────────────────────────────────────────
  // Getters (통계 및 상태)
  // ─────────────────────────────────────────────────────────────

  /** 현재 캐시 크기 (텍스처 개수) */
  get size(): number {
    return this.cache.size;
  }

  /** 현재 VRAM 사용량 (bytes) */
  get vramUsage(): number {
    return this.currentVRAMBytes;
  }

  /** 현재 VRAM 사용량 (MB) */
  get vramUsageMB(): number {
    const mb = this.bytesToMB(this.currentVRAMBytes);
    return Number.isNaN(mb) ? 0 : mb;
  }

  /** 최대 VRAM 한계 (bytes) */
  get maxVRAM(): number {
    return this.maxVRAMBytes;
  }

  /** 최대 VRAM 한계 (MB) */
  get maxVRAMMB(): number {
    return this.bytesToMB(this.maxVRAMBytes);
  }

  /** VRAM 사용률 (0-1) */
  get vramUtilization(): number {
    return this.currentVRAMBytes / this.maxVRAMBytes;
  }

  /** 모든 뷰포트 ID */
  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  /** 모든 엔트리 */
  entries(): IterableIterator<[string, TextureCacheEntry]> {
    return this.cache.entries();
  }

  // ─────────────────────────────────────────────────────────────
  // Utility
  // ─────────────────────────────────────────────────────────────

  /**
   * VRAM 크기 계산 유틸리티
   *
   * @param width 텍스처 너비
   * @param height 텍스처 높이
   * @param frameCount 프레임 수
   * @param bytesPerPixel 픽셀당 바이트 (기본: 4 for RGBA8)
   * @returns 추정 VRAM 크기 (bytes)
   */
  static calculateVRAMSize(
    width: number,
    height: number,
    frameCount: number,
    bytesPerPixel: number = 4
  ): number {
    // 방어적 체크: undefined/NaN 값 처리
    const w = width || 0;
    const h = height || 0;
    const fc = frameCount || 0;
    const bpp = bytesPerPixel || 4;
    return w * h * fc * bpp;
  }

  /** bytes → MB 변환 (소수점 2자리) */
  private bytesToMB(bytes: number): number {
    return Math.round((bytes / (1024 * 1024)) * 100) / 100;
  }

  /** 디버그 로그 */
  private log(message: string): void {
    if (this.debug) {
      console.log(`[TextureLRUCache] ${message}`);
    }
  }
}
