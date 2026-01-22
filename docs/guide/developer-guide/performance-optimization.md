# 성능 최적화 가이드

> **목적**: EchoPixel의 7가지 핵심 성능 최적화 전략과 구현 방법을 설명합니다.

---

## 목차

1. [성능 목표](#1-성능-목표)
2. [7가지 최적화 전략](#2-7가지-최적화-전략)
3. [React 최적화](#3-react-최적화)
4. [네트워크 최적화](#4-네트워크-최적화)
5. [성능 측정](#5-성능-측정)
6. [병목 진단](#6-병목-진단)

---

## 1. 성능 목표

### 1.1 핵심 메트릭

| 메트릭 | 목표 | 측정 방법 |
|--------|------|----------|
| **동시 뷰포트** | 16개+ | 렌더링 성공 여부 |
| **프레임 레이트** | 30fps+ | requestAnimationFrame 간격 |
| **Frame Time** | <33ms | 단일 렌더 사이클 시간 |
| **초기 표시** | <0.5초 | 첫 프레임 표시 시간 |
| **GPU 메모리** | <1.5GB | Chrome DevTools Memory |
| **프레임 드롭** | <1% | 실제 vs 예상 프레임 비교 |

### 1.2 Cornerstone3D 대비 개선

| 영역 | Cornerstone3D | EchoPixel | 개선 |
|------|---------------|-----------|------|
| 최대 뷰포트 | ~8개 | **16개+** | 2배+ |
| 프레임당 처리 | 20-50ms | **5-10ms** | 2-5배 |
| 메모리 사용 | 2-3GB | **<1.5GB** | 30-50%↓ |

---

## 2. 7가지 최적화 전략

### 전략 1: Single WebGL Context + Scissor/Viewport

**문제**: 브라우저는 WebGL Context를 8-16개로 제한

**해결**: 단일 Canvas에서 Scissor/Viewport로 영역 분할

```typescript
/**
 * 단일 Canvas에서 다중 뷰포트 렌더링
 *
 * 원리:
 * - gl.scissor(): 렌더링 영역 클리핑
 * - gl.viewport(): 좌표계 변환
 * - 각 뷰포트를 순차적으로 렌더링
 */
function renderMultipleViewports(
  gl: WebGL2RenderingContext,
  viewports: ViewportBounds[]
): void {
  gl.enable(gl.SCISSOR_TEST);

  for (const vp of viewports) {
    // 1. Scissor: 이 영역 밖은 렌더링 안 됨
    gl.scissor(vp.x, vp.y, vp.width, vp.height);

    // 2. Viewport: NDC → 픽셀 좌표 변환
    gl.viewport(vp.x, vp.y, vp.width, vp.height);

    // 3. 해당 뷰포트의 프레임 렌더링
    renderViewport(vp);
  }

  gl.disable(gl.SCISSOR_TEST);
}
```

**좌표 변환**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DOM → WebGL 좌표 변환                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  DOM 좌표계:           WebGL 좌표계:                                │
│  ┌──────────────┐      ┌──────────────┐                            │
│  │(0,0)         │      │              │                            │
│  │   ┌─────┐    │  →   │   ┌─────┐    │                            │
│  │   │ VP  │    │      │   │ VP  │    │                            │
│  │   └─────┘    │      │   └─────┘    │                            │
│  │         (w,h)│      │(0,0)         │                            │
│  └──────────────┘      └──────────────┘                            │
│                                                                     │
│  Y축 반전: webglY = canvasHeight - domY - vpHeight                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

function domRectToWebGLViewport(
  domRect: DOMRect,
  canvasHeight: number
): ViewportBounds {
  return {
    x: domRect.x,
    y: canvasHeight - domRect.y - domRect.height,  // Y축 반전
    width: domRect.width,
    height: domRect.height,
  };
}
```

---

### 전략 2: 2D Array Texture

**문제**: 프레임 전환마다 텍스처 바인딩 오버헤드

**해결**: 모든 프레임을 배열 텍스처의 레이어로 저장, uniform만 변경

```typescript
/**
 * 2D Array Texture 업로드
 *
 * 장점:
 * - 프레임 전환 시 텍스처 바인딩 불필요
 * - GPU 메모리 연속 배치로 캐시 효율 향상
 * - 단일 draw call로 모든 프레임 접근 가능
 */
function uploadFramesToArrayTexture(
  gl: WebGL2RenderingContext,
  frames: ImageBitmap[],
  width: number,
  height: number
): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);

  // 스토리지 할당 (불변 크기)
  gl.texStorage3D(
    gl.TEXTURE_2D_ARRAY,
    1,                    // mipmap levels
    gl.RGBA8,            // internal format
    width,
    height,
    frames.length        // layer count = 프레임 수
  );

  // 각 프레임을 레이어로 업로드
  for (let i = 0; i < frames.length; i++) {
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,                  // mipmap level
      0, 0, i,           // offset: x, y, layer
      width, height, 1,  // size: width, height, depth
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      frames[i]
    );
  }

  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return texture;
}
```

**Fragment Shader**:

```glsl
#version 300 es
precision highp float;
precision highp sampler2DArray;

uniform sampler2DArray u_frames;
uniform int u_currentFrame;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  // 레이어(프레임) 인덱스로 직접 샘플링
  fragColor = texture(u_frames, vec3(v_texCoord, float(u_currentFrame)));
}
```

**성능 비교**:

| 방식 | 프레임 전환 | 바인딩 | 메모리 레이아웃 |
|------|-------------|--------|-----------------|
| 개별 텍스처 | texImage2D 또는 bindTexture | O(N) | 분산 |
| 배열 텍스처 | uniform 변경만 | O(1) | 연속 |

---

### 전략 3: Pre-calculated Statistics

**문제**: Cornerstone3D는 매 프레임 통계 재계산 (~25% 오버헤드)

**해결**: 로드 시 한 번만 계산하여 캐싱

```typescript
interface FrameStatistics {
  min: number;
  max: number;
  mean: number;
  windowCenter: number;
  windowWidth: number;
}

/**
 * 프레임 통계 사전 계산
 *
 * 계산 시점: DICOM 로드 시 1회
 * 사용 시점: 렌더링 시 매번 참조
 */
function calculateFrameStatistics(
  pixelData: Uint16Array,
  bitsStored: number
): FrameStatistics {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (let i = 0; i < pixelData.length; i++) {
    const value = pixelData[i];
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }

  const mean = sum / pixelData.length;
  const range = max - min;

  return {
    min,
    max,
    mean,
    // 기본 W/L 값 계산
    windowCenter: min + range / 2,
    windowWidth: range,
  };
}

// 캐시 구조
const statisticsCache = new Map<string, FrameStatistics>();

function getFrameStatistics(frameId: string, pixelData: Uint16Array): FrameStatistics {
  if (!statisticsCache.has(frameId)) {
    statisticsCache.set(frameId, calculateFrameStatistics(pixelData, 16));
  }
  return statisticsCache.get(frameId)!;
}
```

---

### 전략 4: GPU VOI LUT (Window/Level)

**문제**: CPU에서 W/L 변환 시 매 픽셀 연산 필요

**해결**: Fragment Shader에서 GPU 병렬 처리

```glsl
#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform float u_windowCenter;  // 정규화된 값 (0-1)
uniform float u_windowWidth;   // 정규화된 값 (0-1)
uniform float u_applyWL;       // 1.0 = 적용, 0.0 = 원본

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec4 texColor = texture(u_texture, v_texCoord);

  // Luminance 계산 (ITU-R BT.601)
  float luminance = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));

  // Window/Level 변환
  float safeWidth = max(u_windowWidth, 0.001);  // 0 나눗셈 방지
  float lower = u_windowCenter - safeWidth / 2.0;
  float wlOutput = clamp((luminance - lower) / safeWidth, 0.0, 1.0);

  // W/L 적용 여부에 따라 선택
  vec3 finalColor = mix(texColor.rgb, vec3(wlOutput), u_applyWL);

  fragColor = vec4(finalColor, texColor.a);
}
```

**CPU vs GPU 비교**:

| 항목 | CPU (JavaScript) | GPU (Shader) |
|------|------------------|--------------|
| 처리 방식 | 순차 (픽셀당 1회) | 병렬 (모든 픽셀 동시) |
| 800x600 이미지 | ~480,000 연산 | 1 draw call |
| W/L 변경 시 | 전체 재계산 | uniform만 변경 |

---

### 전략 5: Frame Prefetching

**문제**: 다음 프레임 로드 대기 시간으로 프레임 드롭

**해결**: 재생 방향 예측하여 미리 로드

```typescript
interface PrefetchConfig {
  lookAhead: number;      // 앞으로 몇 프레임 미리 로드
  lookBehind: number;     // 뒤로 몇 프레임 유지
  priority: 'visible' | 'sequential';
}

class FramePrefetcher {
  private config: PrefetchConfig;
  private cache: Map<number, Promise<DecodedFrame>> = new Map();
  private currentFrame: number = 0;
  private playDirection: 1 | -1 = 1;

  /**
   * 현재 프레임 기준으로 프리페칭
   */
  updatePrefetch(currentFrame: number): void {
    this.currentFrame = currentFrame;

    // 재생 방향 예측
    const start = currentFrame + this.playDirection;
    const end = currentFrame + this.playDirection * this.config.lookAhead;

    // 범위 내 프레임 프리페치
    for (let i = start; i !== end; i += this.playDirection) {
      const frameIndex = this.normalizeFrameIndex(i);
      if (!this.cache.has(frameIndex)) {
        this.cache.set(frameIndex, this.loadFrame(frameIndex));
      }
    }

    // 범위 밖 프레임 정리
    this.cleanupCache();
  }

  /**
   * 프레임 가져오기 (캐시 히트 시 즉시 반환)
   */
  async getFrame(frameIndex: number): Promise<DecodedFrame> {
    if (this.cache.has(frameIndex)) {
      return this.cache.get(frameIndex)!;
    }

    // 캐시 미스: 즉시 로드
    const promise = this.loadFrame(frameIndex);
    this.cache.set(frameIndex, promise);
    return promise;
  }

  private cleanupCache(): void {
    const keepStart = this.currentFrame - this.config.lookBehind;
    const keepEnd = this.currentFrame + this.config.lookAhead;

    for (const frameIndex of this.cache.keys()) {
      if (frameIndex < keepStart || frameIndex > keepEnd) {
        this.cache.delete(frameIndex);
      }
    }
  }
}
```

**2단계 프리페칭 (네트워크 + 디코딩)**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    2단계 프리페칭                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Phase 1: 네트워크 프리페치 (0-50%)                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  - 배치 API: /frames/1,2,3,4,5/rendered                     │    │
│  │  - 압축 데이터를 메모리 캐시에 저장                          │    │
│  │  - 병렬 요청 (동시 최대 4-6개)                               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│                              ▼                                      │
│  Phase 2: 디코딩 + GPU 업로드 (50-100%)                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  - 캐시된 데이터 디코딩                                      │    │
│  │  - GPU 텍스처 업로드                                         │    │
│  │  - 프로그레시브: 임계값 도달 시 재생 시작                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 전략 6: IntersectionObserver

**문제**: 화면 밖 뷰포트도 계속 렌더링하면 리소스 낭비

**해결**: 가시성 기반 렌더링 제어

```typescript
type VisibilityState = 'visible' | 'partial' | 'hidden';

interface ViewportVisibility {
  state: VisibilityState;
  ratio: number;  // 0.0 - 1.0
}

class VisibilityManager {
  private observer: IntersectionObserver;
  private visibilityMap: Map<string, ViewportVisibility> = new Map();

  constructor() {
    this.observer = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      {
        threshold: [0, 0.1, 0.5, 1.0],
        rootMargin: '50px',  // 약간의 여유
      }
    );
  }

  /**
   * 뷰포트 관찰 시작
   */
  observe(viewportId: string, element: HTMLElement): void {
    this.observer.observe(element);
    element.dataset.viewportId = viewportId;
  }

  /**
   * 가시성 변경 처리
   */
  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const viewportId = (entry.target as HTMLElement).dataset.viewportId!;
      const ratio = entry.intersectionRatio;

      let state: VisibilityState;
      if (ratio >= 0.5) {
        state = 'visible';
      } else if (ratio > 0) {
        state = 'partial';
      } else {
        state = 'hidden';
      }

      this.visibilityMap.set(viewportId, { state, ratio });
      this.applyVisibilityPolicy(viewportId, state);
    }
  }

  /**
   * 가시성 정책 적용
   */
  private applyVisibilityPolicy(viewportId: string, state: VisibilityState): void {
    switch (state) {
      case 'visible':
        // 고품질 렌더링, 적극적 프리페칭
        this.setRenderQuality(viewportId, 'high');
        this.enablePrefetch(viewportId, true);
        break;

      case 'partial':
        // 중품질 렌더링, 보통 프리페칭
        this.setRenderQuality(viewportId, 'medium');
        this.enablePrefetch(viewportId, true);
        break;

      case 'hidden':
        // 렌더링 일시 중지, 30초 후 텍스처 해제
        this.pauseRendering(viewportId);
        this.scheduleTextureUnload(viewportId, 30000);
        break;
    }
  }
}
```

**가시성별 정책**:

| 가시성 | 렌더링 | 품질 | 프리페칭 | 메모리 |
|--------|--------|------|----------|--------|
| visible (100%) | 활성 | 고품질 | 적극적 | 유지 |
| partial (10-99%) | 활성 | 중품질 | 보통 | 유지 |
| hidden (0%) | 일시 중지 | - | 최소 | 30초 후 해제 |

---

### 전략 7: Web Workers for Decoding

**문제**: 메인 스레드에서 디코딩 시 UI 블로킹

**해결**: Web Worker에서 병렬 디코딩

```typescript
// worker.ts
self.onmessage = async (e: MessageEvent) => {
  const { frameId, jpegData } = e.data;

  try {
    // Worker에서 디코딩
    const blob = new Blob([jpegData], { type: 'image/jpeg' });
    const bitmap = await createImageBitmap(blob);

    // ImageBitmap은 transferable
    self.postMessage(
      { frameId, bitmap, error: null },
      [bitmap]  // transfer ownership
    );
  } catch (error) {
    self.postMessage({ frameId, bitmap: null, error: error.message });
  }
};

// main.ts
class WorkerDecodePool {
  private workers: Worker[] = [];
  private queue: DecodeTask[] = [];
  private pending: Map<string, { resolve: Function; reject: Function }> = new Map();

  constructor(workerCount: number = navigator.hardwareConcurrency || 4) {
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(new URL('./worker.ts', import.meta.url));
      worker.onmessage = (e) => this.handleResult(e.data);
      this.workers.push(worker);
    }
  }

  /**
   * 디코딩 요청 (비동기)
   */
  decode(frameId: string, jpegData: Uint8Array): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      this.pending.set(frameId, { resolve, reject });
      this.queue.push({ frameId, jpegData });
      this.processQueue();
    });
  }

  private processQueue(): void {
    // 유휴 워커에 작업 할당
    const idleWorker = this.workers.find(w => !w.busy);
    if (idleWorker && this.queue.length > 0) {
      const task = this.queue.shift()!;
      idleWorker.busy = true;
      idleWorker.postMessage(task, [task.jpegData.buffer]);
    }
  }

  private handleResult(data: { frameId: string; bitmap: ImageBitmap | null; error: string | null }): void {
    const pending = this.pending.get(data.frameId);
    if (pending) {
      if (data.bitmap) {
        pending.resolve(data.bitmap);
      } else {
        pending.reject(new Error(data.error || 'Decode failed'));
      }
      this.pending.delete(data.frameId);
    }
    this.processQueue();
  }
}
```

**Worker Pool 설정**:

| 설정 | 권장값 | 이유 |
|------|--------|------|
| Worker 수 | `navigator.hardwareConcurrency` | CPU 코어 수에 맞춤 |
| 최대 | 8 | 너무 많으면 오버헤드 |
| 최소 | 2 | 싱글 코어에서도 병렬화 |

---

## 3. React 최적화

### 3.1 Zustand 셀렉터 최적화

```typescript
// ❌ 나쁜 예: 전체 객체 구독 → 모든 변경에 리렌더
const slot = useViewerStore((s) => s.slots[slotId]);

// ✅ 좋은 예: 필요한 필드만 구독
const currentFrame = useViewerStore((s) => s.slots[slotId]?.currentFrame);
const isPlaying = useViewerStore((s) => s.slots[slotId]?.isPlaying);
const windowLevel = useViewerStore((s) => s.slots[slotId]?.windowLevel);

// ✅ 더 좋은 예: 얕은 비교로 객체 구독
import { shallow } from 'zustand/shallow';

const { currentFrame, isPlaying } = useViewerStore(
  (s) => ({
    currentFrame: s.slots[slotId]?.currentFrame,
    isPlaying: s.slots[slotId]?.isPlaying,
  }),
  shallow
);
```

### 3.2 React 우회 렌더링

Cine 재생 시 React 상태 업데이트 없이 직접 렌더링:

```typescript
class CineAnimationManager {
  private canvasRef: DicomCanvasHandle;
  private currentFrame: number = 0;
  private isPlaying: boolean = false;

  /**
   * 재생 루프 (React 우회)
   */
  private tick = (timestamp: number): void => {
    if (!this.isPlaying) return;

    if (this.shouldAdvanceFrame(timestamp)) {
      this.currentFrame = (this.currentFrame + 1) % this.totalFrames;

      // React setState 없이 직접 렌더링
      this.canvasRef.renderFrame(this.currentFrame);
    }

    this.animationId = requestAnimationFrame(this.tick);
  };

  /**
   * 재생 시작 (React 상태는 시작/종료 시에만 동기화)
   */
  play(): void {
    this.isPlaying = true;
    this.animationId = requestAnimationFrame(this.tick);

    // UI 상태 동기화 (1회)
    this.onPlayStateChange?.(true);
  }

  /**
   * 재생 종료
   */
  stop(): void {
    this.isPlaying = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    // UI 상태 동기화 (1회)
    this.onPlayStateChange?.(false);
    this.onFrameChange?.(this.currentFrame);
  }
}
```

### 3.3 메모이제이션

```typescript
// 무거운 계산 메모이제이션
const statistics = useMemo(() => {
  return calculateFrameStatistics(pixelData, bitsStored);
}, [pixelData, bitsStored]);

// 콜백 메모이제이션
const handleWindowLevelChange = useCallback((wl: WindowLevel) => {
  setWindowLevel(wl);
}, []);

// 컴포넌트 메모이제이션
const MemoizedViewport = memo(DicomViewport, (prev, next) => {
  return prev.frameData === next.frameData &&
         prev.windowLevel.center === next.windowLevel.center &&
         prev.windowLevel.width === next.windowLevel.width;
});
```

---

## 4. 네트워크 최적화

### 4.1 점진적 품질 향상 (PQE)

```
┌─────────────────────────────────────────────────────────────────────┐
│                Progressive Quality Enhancement                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  시간 →                                                             │
│  ──────────────────────────────────────────────────────────────────│
│                                                                     │
│  0ms        200ms       500ms       2000ms                          │
│   │           │           │           │                             │
│   ▼           ▼           ▼           ▼                             │
│  ┌───┐      ┌───┐       ┌───┐       ┌───┐                          │
│  │64 │  →   │256│   →   │512│   →   │원본│                          │
│  │px │      │px │       │px │       │   │                          │
│  └───┘      └───┘       └───┘       └───┘                          │
│  ~2KB       ~10KB       ~25KB       ~50KB                          │
│                                                                     │
│  사용자 체감: 즉시 미리보기 → 점진적으로 선명해짐                   │
│  네트워크 효과: 초기 로드 80MB → 3MB (96% 감소)                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Fetch 인터셉터

```typescript
class WadoFetchInterceptor {
  private cache: Map<string, ArrayBuffer> = new Map();
  private originalFetch: typeof fetch;

  constructor() {
    this.originalFetch = window.fetch;
    window.fetch = this.interceptedFetch.bind(this);
  }

  private async interceptedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input.toString();

    // WADO-RS 패턴 매칭
    const match = url.match(/\/instances\/([^/]+)\/frames\/(\d+)\/rendered$/);
    if (match) {
      const cacheKey = `${match[1]}:${match[2]}`;

      // 캐시 히트
      if (this.cache.has(cacheKey)) {
        return new Response(this.cache.get(cacheKey), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }

      // 캐시 미스: 원본 요청 후 캐싱
      const response = await this.originalFetch(input, init);
      const buffer = await response.clone().arrayBuffer();
      this.cache.set(cacheKey, buffer);
      return response;
    }

    // WADO-RS 외 요청은 그대로 통과
    return this.originalFetch(input, init);
  }
}
```

---

## 5. 성능 측정

### 5.1 FPS 측정

```typescript
class FPSMonitor {
  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 0;
  private fpsHistory: number[] = [];

  tick(): void {
    this.frameCount++;

    const now = performance.now();
    const elapsed = now - this.lastTime;

    if (elapsed >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.fpsHistory.push(this.fps);

      // 최근 10초 평균
      if (this.fpsHistory.length > 10) {
        this.fpsHistory.shift();
      }

      this.frameCount = 0;
      this.lastTime = now;
    }
  }

  getStats(): { current: number; average: number; drops: number } {
    const average = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
    const drops = this.fpsHistory.filter(fps => fps < 25).length;

    return {
      current: this.fps,
      average: Math.round(average),
      drops,
    };
  }
}
```

### 5.2 Frame Time 측정

```typescript
class FrameTimeProfiler {
  private measurements: Map<string, number[]> = new Map();

  /**
   * 단계별 시간 측정
   */
  async profileRenderCycle(
    frameIndex: number,
    frames: Uint8Array[],
    textureManager: TextureManager,
    quadRenderer: QuadRenderer
  ): Promise<Record<string, number>> {
    const metrics: Record<string, number> = {};

    // 디코딩
    let start = performance.now();
    const decoded = await decodeFrame(frames[frameIndex]);
    metrics.decode = performance.now() - start;

    // 텍스처 업로드
    start = performance.now();
    textureManager.upload(decoded.image);
    metrics.upload = performance.now() - start;

    // 렌더링
    start = performance.now();
    quadRenderer.render(0);
    metrics.render = performance.now() - start;

    // 메모리 해제
    start = performance.now();
    closeDecodedFrame(decoded);
    metrics.cleanup = performance.now() - start;

    metrics.total = metrics.decode + metrics.upload + metrics.render + metrics.cleanup;

    return metrics;
  }
}
```

---

## 6. 병목 진단

### 6.1 병목 식별 체크리스트

| 증상 | 가능한 원인 | 진단 방법 | 해결 |
|------|-------------|----------|------|
| FPS < 30 | 디코딩 병목 | profileRenderCycle | Web Workers |
| FPS < 30 | 텍스처 업로드 병목 | profileRenderCycle | 배열 텍스처, 프리페칭 |
| UI 버벅임 | React 리렌더링 | React DevTools | 셀렉터 최적화 |
| 메모리 증가 | VideoFrame 누수 | 트래커 | close() 호출 확인 |
| 프레임 드롭 | 네트워크 지연 | Network 탭 | 프리페칭, PQE |

### 6.2 Chrome DevTools 활용

**Performance 탭**:
- 녹화 후 Frame 시간 분석
- Long Tasks (50ms+) 식별
- GPU 활용도 확인

**Memory 탭**:
- Heap Snapshot 비교
- Allocation Timeline
- Detached DOM 노드 확인

**Rendering 탭**:
- FPS meter 활성화
- Paint flashing
- Layer borders

---

## 관련 문서

- [렌더링 파이프라인](./rendering-pipeline.md)
- [메모리 관리](./memory-management.md)
- [트러블슈팅 가이드](./troubleshooting-guide.md)
- [성능 전략 분석](/docs/design/performance-strategy.md)
