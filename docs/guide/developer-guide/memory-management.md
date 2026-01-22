# 메모리 관리

> **목적**: EchoPixel의 GPU 메모리 관리, Context Loss 복구, 캐시 전략을 상세히 설명합니다.

---

## 목차

1. [메모리 아키텍처 개요](#1-메모리-아키텍처-개요)
2. [GPU 메모리 관리](#2-gpu-메모리-관리)
3. [Context Loss 복구](#3-context-loss-복구)
4. [LRU 캐시 시스템](#4-lru-캐시-시스템)
5. [VideoFrame 메모리 관리](#5-videoframe-메모리-관리)
6. [메모리 예산 계획](#6-메모리-예산-계획)

---

## 1. 메모리 아키텍처 개요

### 1.1 EchoPixel vs Cornerstone3D

| 항목 | Cornerstone3D | EchoPixel |
|------|---------------|-----------|
| **메모리 구조** | 3계층 (CPU Cache → Cornerstone Cache → GPU) | 1계층 (GPU Only) |
| **중복 저장** | 있음 (동일 데이터 3곳에 존재) | 없음 |
| **메모리 효율** | ~3x 오버헤드 | 최소화 |
| **Context Loss 대응** | CPU 캐시에서 복구 | Hybrid 전략 |

### 1.2 Upload & Release 패턴

EchoPixel의 핵심 전략: **디코딩 → GPU 업로드 → 즉시 CPU 메모리 해제**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Upload & Release 패턴                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [압축 데이터]      [디코딩]        [GPU 업로드]      [해제]         │
│                                                                     │
│  Uint8Array ──▶ VideoFrame ──▶ WebGL Texture ──▶ frame.close()     │
│  (~50KB)         (~3MB)         (GPU VRAM)        (CPU 메모리 해제) │
│                                                                     │
│  ✅ 장점: CPU 메모리 최소화, GPU 직접 관리                          │
│  ⚠️ 주의: Context Loss 시 복구 전략 필요                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 메모리 계층 구조

```
┌─────────────────────────────────────────────────────────────────────┐
│                       EchoPixel 메모리 계층                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  [Primary] GPU VRAM                                          │    │
│  │  - WebGL Textures (활성 프레임)                              │    │
│  │  - LRU Texture Cache (16+ 뷰포트용)                          │    │
│  │  - 용량: ~1.5GB (16 뷰포트 × 100프레임 기준)                 │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│                              ▼ Context Loss 시                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  [Fallback 1] Compressed Cache (메모리)                      │    │
│  │  - 원본 압축 데이터 (JPEG)                                   │    │
│  │  - 용량: 100-200MB (선택적)                                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│                              ▼ 캐시 미스 시                         │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  [Fallback 2] IndexedDB                                      │    │
│  │  - 브라우저 영구 저장소                                      │    │
│  │  - 새로고침 후에도 유지                                      │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│                              ▼ 캐시 미스 시                         │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  [Fallback 3] Network (WADO-RS)                              │    │
│  │  - 서버에서 재요청                                           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. GPU 메모리 관리

### 2.1 텍스처 메모리 계산

```typescript
/**
 * 단일 프레임 텍스처 메모리 계산
 *
 * @param width - 이미지 너비
 * @param height - 이미지 높이
 * @param channels - 채널 수 (RGBA = 4)
 * @param bytesPerChannel - 채널당 바이트 (8-bit = 1, 16-bit = 2)
 */
function calculateTextureMemory(
  width: number,
  height: number,
  channels: number = 4,
  bytesPerChannel: number = 1
): number {
  return width * height * channels * bytesPerChannel;
}

// 예시: 800x600 RGBA 8-bit
// 800 × 600 × 4 × 1 = 1,920,000 bytes ≈ 1.83 MB/프레임
```

### 2.2 뷰포트별 메모리 예산

| 시나리오 | 뷰포트 수 | 프레임/뷰포트 | 프레임 크기 | 총 VRAM |
|----------|-----------|---------------|-------------|---------|
| 단일 | 1 | 100 | 1.83MB | ~183MB |
| Stress Echo | 16 | 100 | 1.83MB | ~2.9GB |
| 최적화 적용 | 16 | 30 (캐시) | 1.83MB | ~880MB |

### 2.3 TextureManager 구현

```typescript
export class TextureManager {
  private gl: WebGL2RenderingContext;
  private texture: WebGLTexture | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /**
   * 이미지를 GPU 텍스처로 업로드
   */
  upload(source: ImageBitmap | VideoFrame): void {
    const gl = this.gl;

    // 텍스처 생성 (최초 1회)
    if (!this.texture) {
      this.texture = gl.createTexture();
      if (!this.texture) {
        throw new Error('Failed to create texture');
      }
    }

    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    // GPU로 업로드
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,                      // mipmap level
      gl.RGBA,               // internal format
      gl.RGBA,               // format
      gl.UNSIGNED_BYTE,      // type
      source
    );

    // 텍스처 파라미터
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /**
   * 텍스처 유닛에 바인딩
   */
  bind(unit: number = 0): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
  }

  /**
   * 리소스 해제
   */
  dispose(): void {
    if (this.texture) {
      this.gl.deleteTexture(this.texture);
      this.texture = null;
    }
  }

  /**
   * 유효성 검사
   */
  isValid(): boolean {
    return this.texture !== null && !this.gl.isContextLost();
  }
}
```

### 2.4 배열 텍스처 (Phase 2)

멀티프레임 최적화를 위한 2D Array Texture:

```typescript
/**
 * ArrayTextureManager - 프레임 시퀀스를 단일 배열 텍스처로 관리
 *
 * 장점:
 * - 프레임 전환 시 텍스처 바인딩 불필요
 * - uniform 변경만으로 레이어(프레임) 선택
 * - GPU 메모리 연속 배치로 캐시 효율 향상
 */
export class ArrayTextureManager {
  private gl: WebGL2RenderingContext;
  private texture: WebGLTexture | null = null;
  private frameCount: number = 0;

  /**
   * 모든 프레임을 배열 텍스처로 업로드
   */
  uploadAllFrames(
    frames: ImageBitmap[],
    width: number,
    height: number
  ): void {
    const gl = this.gl;

    if (!this.texture) {
      this.texture = gl.createTexture();
    }

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);

    // 배열 텍스처 스토리지 할당
    gl.texStorage3D(
      gl.TEXTURE_2D_ARRAY,
      1,                      // mipmap levels
      gl.RGBA8,              // internal format
      width,
      height,
      frames.length          // layer count (프레임 수)
    );

    // 각 프레임을 레이어로 업로드
    for (let i = 0; i < frames.length; i++) {
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,                    // mipmap level
        0, 0, i,             // x, y, layer offset
        width, height, 1,    // width, height, depth
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        frames[i]
      );
    }

    this.frameCount = frames.length;

    // 텍스처 파라미터
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }
}
```

**Fragment Shader (배열 텍스처)**:

```glsl
#version 300 es
precision highp float;
precision highp sampler2DArray;

uniform sampler2DArray u_textureArray;
uniform int u_frameIndex;  // 현재 프레임 (레이어 인덱스)

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  // 배열 텍스처에서 특정 레이어(프레임) 샘플링
  fragColor = texture(u_textureArray, vec3(v_texCoord, float(u_frameIndex)));
}
```

---

## 3. Context Loss 복구

### 3.1 Context Loss 원인

| 원인 | 빈도 | 설명 |
|------|------|------|
| GPU 드라이버 리셋 | 드물음 | 드라이버 업데이트, 충돌 |
| GPU 메모리 부족 | 중간 | 많은 뷰포트, 대용량 텍스처 |
| 백그라운드 탭 | 드물음 | 브라우저 메모리 회수 |
| 시스템 절전 모드 | 드물음 | 노트북 덮개 닫기 |

### 3.2 Hybrid 복구 전략

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Context Loss 복구 전략                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  webglcontextlost 이벤트                                            │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  1. e.preventDefault() 호출                                  │    │
│  │  2. 렌더링 일시 중지                                         │    │
│  │  3. "복구 중..." UI 표시                                     │    │
│  │  4. 리소스 참조 정리 (texture = null 등)                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│       │                                                             │
│       ▼                                                             │
│  webglcontextrestored 이벤트 대기                                   │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  복구 시작                                                   │    │
│  │                                                              │    │
│  │  1. WebGL 리소스 재초기화                                    │    │
│  │     - Shader 재컴파일                                        │    │
│  │     - VAO 재생성                                             │    │
│  │     - Texture 재생성                                         │    │
│  │                                                              │    │
│  │  2. 텍스처 데이터 복구                                       │    │
│  │     ┌─────────────────────────────────────────────────────┐  │    │
│  │     │ [1순위] Compressed Cache (메모리)                   │  │    │
│  │     │         - 가장 빠름, 재디코딩 필요                   │  │    │
│  │     │                   ↓ 미스                            │  │    │
│  │     │ [2순위] IndexedDB                                   │  │    │
│  │     │         - 비동기, 중간 속도                         │  │    │
│  │     │                   ↓ 미스                            │  │    │
│  │     │ [3순위] Server (WADO-RS)                            │  │    │
│  │     │         - 네트워크 지연, 최후 수단                   │  │    │
│  │     └─────────────────────────────────────────────────────┘  │    │
│  │                                                              │    │
│  │  3. 렌더링 재개                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 구현 예시

```typescript
class ContextLossRecovery {
  private compressedCache: Map<string, Uint8Array> = new Map();
  private pendingRecovery: Set<string> = new Set();

  /**
   * Context Lost 핸들러
   */
  handleContextLost(event: Event): void {
    event.preventDefault();  // 자동 복구 활성화

    // 상태 업데이트
    this.isContextLost = true;
    this.setRecoveryStatus('recovering');

    // 리소스 참조 정리 (실제 메모리는 이미 해제됨)
    this.textureManager = null;
    this.quadRenderer = null;

    console.log('[Recovery] Context lost, waiting for restore...');
  }

  /**
   * Context Restored 핸들러
   */
  async handleContextRestored(): Promise<void> {
    console.log('[Recovery] Context restored, starting recovery...');

    // 1. WebGL 리소스 재초기화
    this.initializeWebGL();

    // 2. 활성 뷰포트의 텍스처 복구
    for (const viewportId of this.activeViewports) {
      await this.recoverViewportTextures(viewportId);
    }

    // 3. 상태 업데이트
    this.isContextLost = false;
    this.setRecoveryStatus('ready');

    console.log('[Recovery] Recovery complete');
  }

  /**
   * 뷰포트 텍스처 복구
   */
  private async recoverViewportTextures(viewportId: string): Promise<void> {
    const viewport = this.viewports.get(viewportId);
    if (!viewport) return;

    const frames: Uint8Array[] = [];

    for (let i = 0; i < viewport.frameCount; i++) {
      const cacheKey = `${viewportId}:${i}`;
      let frameData: Uint8Array | null = null;

      // 1순위: Compressed Cache
      frameData = this.compressedCache.get(cacheKey) ?? null;

      // 2순위: IndexedDB
      if (!frameData) {
        frameData = await this.loadFromIndexedDB(cacheKey);
      }

      // 3순위: Server
      if (!frameData) {
        frameData = await this.fetchFromServer(viewport.instanceId, i);
      }

      if (frameData) {
        frames.push(frameData);
      }
    }

    // 텍스처 재업로드
    await this.uploadFramesToGPU(viewportId, frames);
  }
}
```

### 3.4 Compressed Cache 전략

```typescript
interface CompressedCacheConfig {
  enabled: boolean;
  maxSize: number;  // bytes
  priority: 'visible' | 'recent' | 'all';
}

class CompressedCache {
  private cache: Map<string, Uint8Array> = new Map();
  private accessOrder: string[] = [];
  private totalSize: number = 0;
  private config: CompressedCacheConfig;

  /**
   * 압축된 프레임 데이터 저장
   */
  store(key: string, data: Uint8Array): void {
    if (!this.config.enabled) return;

    // 용량 초과 시 LRU 제거
    while (this.totalSize + data.length > this.config.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, data);
    this.totalSize += data.length;
    this.updateAccessOrder(key);
  }

  /**
   * 데이터 조회
   */
  get(key: string): Uint8Array | null {
    const data = this.cache.get(key);
    if (data) {
      this.updateAccessOrder(key);
    }
    return data ?? null;
  }

  private evictOldest(): void {
    const oldest = this.accessOrder.shift();
    if (oldest) {
      const data = this.cache.get(oldest);
      if (data) {
        this.totalSize -= data.length;
        this.cache.delete(oldest);
      }
    }
  }
}
```

---

## 4. LRU 캐시 시스템

### 4.1 LRU Texture Cache

멀티 뷰포트 환경에서 GPU 메모리 효율적 관리:

```typescript
/**
 * LRU Texture Cache
 *
 * 사용 사례:
 * - 16+ 뷰포트에서 제한된 VRAM으로 프레임 관리
 * - 자주 사용되는 프레임은 GPU에 유지
 * - 오래 사용 안 된 프레임은 자동 제거
 */
class LRUTextureCache {
  private cache: Map<string, WebGLTexture> = new Map();
  private accessOrder: string[] = [];
  private maxEntries: number;
  private gl: WebGL2RenderingContext;

  constructor(gl: WebGL2RenderingContext, maxEntries: number = 100) {
    this.gl = gl;
    this.maxEntries = maxEntries;
  }

  /**
   * 텍스처 가져오기 (캐시 히트 시 접근 순서 업데이트)
   */
  get(key: string): WebGLTexture | null {
    const texture = this.cache.get(key);
    if (texture) {
      // 접근 순서 업데이트 (가장 최근으로)
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      this.accessOrder.push(key);
      return texture;
    }
    return null;
  }

  /**
   * 텍스처 저장
   */
  set(key: string, texture: WebGLTexture): void {
    // 이미 존재하면 업데이트
    if (this.cache.has(key)) {
      this.gl.deleteTexture(this.cache.get(key)!);
    }

    // 용량 초과 시 가장 오래된 항목 제거
    while (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }

    this.cache.set(key, texture);
    this.accessOrder.push(key);
  }

  /**
   * 가장 오래된 텍스처 제거
   */
  private evictOldest(): void {
    const oldest = this.accessOrder.shift();
    if (oldest) {
      const texture = this.cache.get(oldest);
      if (texture) {
        this.gl.deleteTexture(texture);
        this.cache.delete(oldest);
      }
    }
  }

  /**
   * 특정 뷰포트의 모든 텍스처 제거
   */
  clearViewport(viewportId: string): void {
    const keysToRemove = Array.from(this.cache.keys())
      .filter(key => key.startsWith(viewportId));

    for (const key of keysToRemove) {
      const texture = this.cache.get(key);
      if (texture) {
        this.gl.deleteTexture(texture);
        this.cache.delete(key);
      }
      this.accessOrder = this.accessOrder.filter(k => k !== key);
    }
  }

  /**
   * 전체 캐시 정리
   */
  dispose(): void {
    for (const texture of this.cache.values()) {
      this.gl.deleteTexture(texture);
    }
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * 캐시 통계
   */
  getStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxEntries,
      hitRate: this.hitRate,
    };
  }
}
```

### 4.2 O(log N) MinHeap 기반 LRU

대용량 캐시를 위한 최적화된 구현:

```typescript
interface HeapEntry<T> {
  key: string;
  value: T;
  priority: number;  // timestamp (낮을수록 오래됨)
}

class MinHeapLRUCache<T> {
  private heap: HeapEntry<T>[] = [];
  private keyToIndex: Map<string, number> = new Map();
  private maxSize: number;
  private timestamp: number = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /**
   * 항목 가져오기 - O(log N)
   */
  get(key: string): T | null {
    const index = this.keyToIndex.get(key);
    if (index === undefined) return null;

    // 우선순위 업데이트 (최신 timestamp)
    this.heap[index].priority = ++this.timestamp;
    this.bubbleDown(index);

    return this.heap[index].value;
  }

  /**
   * 항목 저장 - O(log N)
   */
  set(key: string, value: T, onEvict?: (evicted: T) => void): void {
    // 기존 항목 업데이트
    if (this.keyToIndex.has(key)) {
      const index = this.keyToIndex.get(key)!;
      this.heap[index].value = value;
      this.heap[index].priority = ++this.timestamp;
      this.bubbleDown(index);
      return;
    }

    // 용량 초과 시 제거
    while (this.heap.length >= this.maxSize) {
      const evicted = this.extractMin();
      if (evicted && onEvict) {
        onEvict(evicted.value);
      }
    }

    // 새 항목 추가
    const entry: HeapEntry<T> = {
      key,
      value,
      priority: ++this.timestamp,
    };

    this.heap.push(entry);
    this.keyToIndex.set(key, this.heap.length - 1);
    this.bubbleUp(this.heap.length - 1);
  }

  /**
   * 최소값(가장 오래된) 추출 - O(log N)
   */
  private extractMin(): HeapEntry<T> | null {
    if (this.heap.length === 0) return null;

    const min = this.heap[0];
    const last = this.heap.pop()!;

    this.keyToIndex.delete(min.key);

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.keyToIndex.set(last.key, 0);
      this.bubbleDown(0);
    }

    return min;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent].priority <= this.heap[index].priority) break;
      this.swap(parent, index);
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;

      if (left < this.heap.length &&
          this.heap[left].priority < this.heap[smallest].priority) {
        smallest = left;
      }
      if (right < this.heap.length &&
          this.heap[right].priority < this.heap[smallest].priority) {
        smallest = right;
      }

      if (smallest === index) break;
      this.swap(smallest, index);
      index = smallest;
    }
  }

  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    this.keyToIndex.set(this.heap[i].key, i);
    this.keyToIndex.set(this.heap[j].key, j);
  }
}
```

---

## 5. VideoFrame 메모리 관리

### 5.1 VideoFrame 생명주기

```
┌─────────────────────────────────────────────────────────────────────┐
│                    VideoFrame 생명주기                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  WebCodecs ImageDecoder                                             │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  VideoFrame 생성                                             │    │
│  │  - GPU 메모리 점유                                           │    │
│  │  - 참조 카운트 = 1                                           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  텍스처 업로드                                               │    │
│  │  gl.texImage2D(..., videoFrame)                              │    │
│  │  - GPU 텍스처로 복사 (또는 공유)                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  🔴 frame.close() 필수!                                      │    │
│  │  - GPU 메모리 해제                                           │    │
│  │  - 호출 안 하면 메모리 누수                                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 안전한 사용 패턴

```typescript
// ✅ 권장 패턴: try-finally
async function processFrame(jpegData: Uint8Array): Promise<void> {
  let videoFrame: VideoFrame | null = null;

  try {
    const decoder = new ImageDecoder({
      data: jpegData,
      type: 'image/jpeg',
    });

    const result = await decoder.decode();
    videoFrame = result.image;

    // 텍스처 업로드
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoFrame);

  } finally {
    // 항상 해제
    videoFrame?.close();
  }
}
```

### 5.3 메모리 누수 감지 (개발 모드)

```typescript
class VideoFrameTracker {
  private openFrames = new Map<VideoFrame, { createdAt: number; stack: string }>();
  private leakCheckInterval: number | null = null;

  constructor() {
    if (process.env.NODE_ENV === 'development') {
      this.leakCheckInterval = window.setInterval(() => this.checkLeaks(), 5000);
    }
  }

  /**
   * VideoFrame 생성 추적
   */
  track(frame: VideoFrame): void {
    this.openFrames.set(frame, {
      createdAt: Date.now(),
      stack: new Error().stack || '',
    });
  }

  /**
   * VideoFrame 해제 추적
   */
  untrack(frame: VideoFrame): void {
    this.openFrames.delete(frame);
  }

  /**
   * 누수 검사 (5초 이상 열린 프레임)
   */
  private checkLeaks(): void {
    const now = Date.now();
    const leaks: Array<{ age: number; stack: string }> = [];

    for (const [frame, info] of this.openFrames) {
      const age = now - info.createdAt;
      if (age > 5000) {
        leaks.push({ age, stack: info.stack });
      }
    }

    if (leaks.length > 0) {
      console.warn(`[VideoFrameTracker] ${leaks.length} potential leaks detected:`);
      leaks.forEach(leak => {
        console.warn(`  - Age: ${leak.age}ms\n  - Stack: ${leak.stack}`);
      });
    }
  }

  dispose(): void {
    if (this.leakCheckInterval) {
      clearInterval(this.leakCheckInterval);
    }
  }
}

// 전역 트래커 (개발 모드)
export const videoFrameTracker = new VideoFrameTracker();
```

---

## 6. 메모리 예산 계획

### 6.1 시나리오별 메모리 계획

| 시나리오 | 뷰포트 | 프레임 | GPU 텍스처 | Compressed Cache | 총 예상 |
|----------|--------|--------|------------|------------------|---------|
| **단일 뷰포트** | 1 | 100 | 183MB | 5MB | ~200MB |
| **4x4 Stress Echo** | 16 | 100 | 880MB (캐시 30) | 80MB | ~1GB |
| **대용량** | 32 | 50 | 1.1GB | 160MB | ~1.3GB |

### 6.2 메모리 한계 대응

```typescript
interface MemoryConfig {
  maxTextureCache: number;      // 텍스처 캐시 최대 개수
  maxCompressedCache: number;   // 압축 캐시 최대 바이트
  lowMemoryThreshold: number;   // 저메모리 임계값 (%)
  criticalMemoryThreshold: number;  // 위험 임계값 (%)
}

const defaultConfig: MemoryConfig = {
  maxTextureCache: 100,
  maxCompressedCache: 200 * 1024 * 1024,  // 200MB
  lowMemoryThreshold: 70,
  criticalMemoryThreshold: 90,
};

class MemoryManager {
  /**
   * 메모리 상태 확인 (Chrome only)
   */
  getMemoryStatus(): 'normal' | 'low' | 'critical' {
    if (!performance.memory) return 'normal';

    const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
    const usage = (usedJSHeapSize / jsHeapSizeLimit) * 100;

    if (usage >= this.config.criticalMemoryThreshold) return 'critical';
    if (usage >= this.config.lowMemoryThreshold) return 'low';
    return 'normal';
  }

  /**
   * 메모리 압박 시 대응
   */
  handleMemoryPressure(): void {
    const status = this.getMemoryStatus();

    switch (status) {
      case 'low':
        // 화면 밖 뷰포트 텍스처 해제
        this.unloadOffscreenViewports();
        break;

      case 'critical':
        // 텍스처 캐시 절반 해제
        this.textureCache.evictHalf();
        // 압축 캐시 정리
        this.compressedCache.clear();
        break;
    }
  }
}
```

---

## 관련 문서

- [렌더링 파이프라인](./rendering-pipeline.md)
- [Core 기반 기술](./core-technologies.md)
- [성능 최적화](./performance-optimization.md)
- [트러블슈팅 가이드](./troubleshooting-guide.md)
- [메모리 아키텍처 분석](/docs/architecture/memory-architecture-analysis.md)
