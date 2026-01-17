# EchoPixel 성능 최적화 전략

## 목표
- 10개 이상 뷰포트에서 30fps 이상 동시 cine 재생
- 프레임 드롭 없는 부드러운 재생 경험
- 1GB 이하 GPU 메모리 사용

---

## 1. 기존 문제점 분석

### Cornerstone3D 성능 병목 (Issue #1756)

[Cornerstone3D Issue #1756](https://github.com/cornerstonejs/cornerstone3D/issues/1756)에서 확인된 문제:

| 문제 | 원인 | 오버헤드 |
|------|------|----------|
| `combineFrameInstance` 반복 호출 | 매 프레임마다 ImagePlaneModule 조회 | ~25% |
| vtkDataArray 범위 재계산 | vtk.js가 새 배열 생성 시 range 계산 | ~25% |
| vtk.js 텍스처 재생성 | 캐싱 없이 매번 텍스처 빌드 | ~30% |

**결론**: 50% 이상의 시간이 불필요한 재계산에 소비됨

---

## 2. 핵심 최적화 전략

### Strategy 1: Single WebGL Context

**문제**: 브라우저는 WebGL 컨텍스트를 ~8개로 제한

**해결**: 단일 캔버스 + Scissor/Viewport 렌더링

```typescript
class SingleCanvasRenderer {
  private gl: WebGL2RenderingContext

  renderAll(viewports: ViewportState[]): void {
    for (const vp of viewports) {
      const rect = vp.element.getBoundingClientRect()

      // 뷰포트 영역만 렌더링
      this.gl.viewport(rect.x, rect.y, rect.width, rect.height)
      this.gl.scissor(rect.x, rect.y, rect.width, rect.height)
      this.gl.enable(this.gl.SCISSOR_TEST)

      this.renderFrame(vp.currentTexture, vp.frameIndex)
    }
  }
}
```

**효과**: 무제한 뷰포트 지원

참고: [WebGL Multiple Views](https://webglfundamentals.org/webgl/lessons/webgl-multiple-views.html)

---

### Strategy 2: 2D Array Texture

**문제**: 프레임마다 텍스처 바인딩 교체는 비용이 큼

**해결**: 전체 cine loop를 단일 2D Array Texture에 저장

```glsl
// Fragment shader - 즉시 프레임 접근
uniform sampler2DArray uFrameSequence;
uniform int uCurrentFrame;

void main() {
  // layer 인덱스로 프레임 선택 (GPU에서 즉시)
  vec4 pixel = texture(uFrameSequence,
                       vec3(vTexCoord, float(uCurrentFrame)));

  // VOI LUT 적용
  float intensity = applyWindowLevel(pixel.r);
  gl_FragColor = vec4(intensity, intensity, intensity, 1.0);
}
```

**효과**: 프레임 전환 시 텍스처 바인딩 불필요

---

### Strategy 3: Pre-calculated Statistics

**문제**: 매 프레임마다 픽셀 범위(min/max) 재계산

**해결**: 초기 로딩 시 1회 계산 후 캐싱

```typescript
class PixelDataStats {
  private static cache = new Map<string, { min: number; max: number }>()

  static calculate(seriesId: string, pixels: TypedArray): PixelStats {
    if (this.cache.has(seriesId)) {
      return this.cache.get(seriesId)!
    }

    let min = Infinity, max = -Infinity
    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i] < min) min = pixels[i]
      if (pixels[i] > max) max = pixels[i]
    }

    const stats = { min, max }
    this.cache.set(seriesId, stats)
    return stats
  }
}
```

**효과**: vtk.js의 25% 오버헤드 제거

---

### Strategy 4: GPU-based VOI LUT

**문제**: CPU에서 16비트 데이터 윈도우/레벨 처리는 느림

**해결**: Fragment shader에서 실시간 처리

```glsl
uniform float uWindowCenter;
uniform float uWindowWidth;
uniform float uRescaleSlope;
uniform float uRescaleIntercept;

float applyVOI(float storedValue) {
  // Modality LUT
  float hounsfield = storedValue * uRescaleSlope + uRescaleIntercept;

  // VOI LUT (선형)
  float lower = uWindowCenter - uWindowWidth * 0.5;
  float upper = uWindowCenter + uWindowWidth * 0.5;

  return clamp((hounsfield - lower) / uWindowWidth, 0.0, 1.0);
}
```

**효과**: CPU 바운드 연산 제거, 실시간 조정 가능

---

### Strategy 5: Frame Prefetching

**문제**: JIT 디코딩은 재생 중 끊김 유발

**해결**: 재생 위치 기반 선제적 프리페칭

```typescript
class FramePrefetcher {
  private workerPool: WorkerPool

  prefetchWindow(
    series: DicomSeries,
    currentFrame: number,
    windowSize: number = 10
  ): void {
    for (let i = 1; i <= windowSize; i++) {
      const nextFrame = (currentFrame + i) % series.totalFrames

      if (!this.cache.has(series.id, nextFrame)) {
        this.workerPool.enqueue({
          type: 'decode',
          seriesId: series.id,
          frameIndex: nextFrame,
          priority: i  // 가까운 프레임 우선
        })
      }
    }
  }
}
```

**효과**: 버퍼링 없는 연속 재생

---

### Strategy 6: IntersectionObserver

**문제**: 화면 밖 뷰포트도 렌더링하면 리소스 낭비

**해결**: 가시성 기반 렌더링 스킵

```typescript
class ViewportVisibilityManager {
  private observer: IntersectionObserver
  private visibleViewports = new Set<string>()

  constructor() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const viewportId = entry.target.dataset.viewportId!

          if (entry.isIntersecting) {
            this.visibleViewports.add(viewportId)
          } else {
            this.visibleViewports.delete(viewportId)
          }
        })
      },
      { threshold: 0.1 }  // 10% 이상 보이면 렌더링
    )
  }

  shouldRender(viewportId: string): boolean {
    return this.visibleViewports.has(viewportId)
  }
}
```

**효과**: 오프스크린 렌더링 비용 0

---

### Strategy 7: Web Workers for Decoding

**문제**: 메인 스레드 디코딩은 UI 차단

**해결**: Worker Pool에서 병렬 디코딩

```typescript
// main.ts
const decoderPool = new WorkerPool('decoder.worker.js', 4)

async function loadFrame(series: string, frame: number): Promise<TypedArray> {
  return decoderPool.execute({
    type: 'decode',
    seriesId: series,
    frameIndex: frame
  })
}

// decoder.worker.ts
self.onmessage = async (e) => {
  const { type, seriesId, frameIndex } = e.data

  const frameData = await fetchFrame(seriesId, frameIndex)
  const decoded = await decoder.decode(frameData)

  // Transferable로 메모리 복사 방지
  self.postMessage({ decoded }, [decoded.buffer])
}
```

**효과**: UI 프리징 방지, CPU 코어 활용

---

## 3. 메모리 예산 관리

### GPU 메모리 계산

| 항목 | 계산 | 결과 |
|------|------|------|
| 프레임 크기 | 640 × 480 × 2 bytes | 614 KB |
| 시리즈당 프레임 | 100 frames | 61.4 MB |
| 10개 뷰포트 | 10 × 61.4 MB | **614 MB** |

**결론**: 일반적인 GPU 메모리(1-2GB) 내 안전

### LRU 캐시 전략

```typescript
class CacheManager {
  private cpuCache: LRUCache<string, TypedArray>  // 512MB
  private gpuCache: LRUCache<string, TextureHandle>  // 256MB

  constructor() {
    this.cpuCache = new LRUCache({ maxSize: 512 * 1024 * 1024 })
    this.gpuCache = new LRUCache({
      maxSize: 256 * 1024 * 1024,
      dispose: (texture) => texture.destroy()  // GPU 해제
    })
  }

  // 메모리 압박 시 자동 정리
  onMemoryPressure(level: 'moderate' | 'critical'): void {
    if (level === 'critical') {
      this.cpuCache.clear()
      this.gpuCache.resize(128 * 1024 * 1024)
    }
  }
}
```

---

## 4. 성능 측정 기준

### 벤치마크 시나리오

| 시나리오 | 설정 | 목표 |
|----------|------|------|
| 기본 | 6 viewports, 640×480, 30fps | 30fps 유지 |
| 스트레스 | 10 viewports, 640×480, 30fps | 30fps 유지 |
| 고해상도 | 4 viewports, 1280×1024, 30fps | 30fps 유지 |
| 초다중 | 16 viewports, 320×240, 30fps | 25fps 이상 |

### 측정 지표

```typescript
interface PerformanceMetrics {
  fps: number                    // 실제 프레임레이트
  frameTime: number              // 평균 프레임 시간 (ms)
  gpuMemory: number              // GPU 메모리 사용량 (MB)
  cpuMemory: number              // CPU 메모리 사용량 (MB)
  decodeLatency: number          // 디코딩 지연 (ms)
  renderLatency: number          // 렌더링 지연 (ms)
  droppedFrames: number          // 드롭된 프레임 수
}
```

### Chrome DevTools 활용

```javascript
// Performance 탭 프로파일링
performance.mark('frame-start')
renderFrame()
performance.mark('frame-end')
performance.measure('frame', 'frame-start', 'frame-end')

// GPU 메모리 모니터링 (Chrome 전용)
const info = gl.getExtension('WEBGL_debug_renderer_info')
console.log(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
```

---

## 5. 최적화 우선순위

| 순위 | 전략 | 예상 효과 | 구현 복잡도 |
|------|------|-----------|-------------|
| 1 | Single WebGL Context | 필수 | 높음 |
| 2 | 2D Array Texture | 50% 성능 향상 | 중간 |
| 3 | Pre-calculated Stats | 25% 오버헤드 제거 | 낮음 |
| 4 | GPU VOI LUT | CPU 부하 감소 | 중간 |
| 5 | Frame Prefetching | 끊김 방지 | 중간 |
| 6 | IntersectionObserver | 리소스 절약 | 낮음 |
| 7 | Web Workers | UI 응답성 | 중간 |

---

## 참고 자료

- [Cornerstone3D Issue #1756](https://github.com/cornerstonejs/cornerstone3D/issues/1756)
- [WebGL Multiple Views](https://webglfundamentals.org/webgl/lessons/webgl-multiple-views.html)
- [WebGL2 What's New](https://webgl2fundamentals.org/webgl/lessons/webgl2-whats-new.html)
- [DECODE-3DViz - 98% rendering time reduction](https://link.springer.com/article/10.1007/s10278-025-01430-9)
