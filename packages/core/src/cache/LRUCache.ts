/**
 * 제네릭 LRU (Least Recently Used) 캐시
 *
 * 왜 LRU를 사용하는가?
 * - DICOM 뷰어에서는 현재 보고 있는 프레임 근처를 자주 접근함
 * - 최근에 사용한 프레임은 다시 사용될 확률이 높음
 * - 메모리 제한 내에서 가장 효율적으로 캐시를 유지
 *
 * 구현 방식:
 * - Map은 삽입 순서를 유지하므로 별도의 연결 리스트 불필요
 * - get() 시 해당 항목을 삭제 후 재삽입하여 "가장 최근" 위치로 이동
 * - 이 방식은 O(1) 시간 복잡도를 보장
 */
export class LRUCache<K, V> {
  private cache: Map<K, V>;
  private readonly maxSize: number;

  /**
   * @param maxSize 캐시 최대 크기 (기본값: 100)
   */
  constructor(maxSize: number = 100) {
    if (maxSize <= 0) {
      throw new Error('maxSize must be greater than 0');
    }
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * 캐시에서 값을 가져옴
   * 접근 시 해당 항목이 "가장 최근 사용"으로 갱신됨
   */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }

    // Map에서 삭제 후 재삽입하여 순서를 맨 뒤로 이동 (최근 사용)
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);

    return value;
  }

  /**
   * 캐시에 값을 저장
   * 캐시가 가득 찬 경우 가장 오래된 항목을 제거
   */
  set(key: K, value: V): void {
    // 이미 존재하면 삭제 (순서 갱신을 위해)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 캐시가 가득 찼으면 가장 오래된 항목(첫 번째) 제거
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, value);
  }

  /**
   * 키가 캐시에 존재하는지 확인
   * 주의: has()는 LRU 순서를 갱신하지 않음
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * 캐시에서 특정 항목 제거
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * 캐시 전체 초기화
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 현재 캐시 크기
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 캐시의 모든 키를 반환 (가장 오래된 것부터)
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * 캐시의 모든 값을 반환 (가장 오래된 것부터)
   */
  values(): IterableIterator<V> {
    return this.cache.values();
  }

  /**
   * 캐시의 모든 엔트리를 반환 (가장 오래된 것부터)
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }
}
