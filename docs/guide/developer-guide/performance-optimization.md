# 성능 최적화 가이드

> **대상 독자**: 웹 성능 최적화에 익숙하지 않은 주니어 개발자
> **목표**: EchoPixel이 16개 뷰포트에서 30fps를 달성하는 7가지 핵심 전략 이해

---

## 목차

1. [성능 목표와 현실](#1-성능-목표와-현실)
2. [Cornerstone3D의 성능 문제](#2-cornerstone3d의-성능-문제)
3. [전략 1: Single WebGL Context](#3-전략-1-single-webgl-context)
4. [전략 2: 2D Array Texture](#4-전략-2-2d-array-texture)
5. [전략 3: Pre-calculated Statistics](#5-전략-3-pre-calculated-statistics)
6. [전략 4: GPU VOI LUT](#6-전략-4-gpu-voi-lut)
7. [전략 5: Frame Prefetching](#7-전략-5-frame-prefetching)
8. [전략 6: IntersectionObserver](#8-전략-6-intersectionobserver)
9. [전략 7: Web Workers](#9-전략-7-web-workers)
10. [React 최적화](#10-react-최적화)
11. [성능 측정 방법](#11-성능-측정-방법)
12. [학습 포인트 정리](#12-학습-포인트-정리)

---

## 1. 성능 목표와 현실

### EchoPixel 성능 목표

```
┌─────────────────────────────────────────────────────────────┐
│                    성능 목표 (스트레스 에코)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  동시 뷰포트: 16개 (4×4 그리드)                             │
│  프레임 레이트: 30fps 이상 (이상적으로 60fps)                │
│  Frame Time: < 33ms (30fps), 이상적으로 < 16ms (60fps)     │
│  GPU 메모리: < 1.5GB                                        │
│  프레임 드롭: < 1%                                          │
│  동기화 지연: < 16ms                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 왜 30fps가 중요한가?

```
프레임 레이트별 사용자 경험:

10fps: ████░░░░░░ 끊김 심함, 진단 불가
20fps: ██████░░░░ 약간 끊김, 어색함
30fps: ████████░░ 부드러움, 진단 가능 ← 최소 목표
60fps: ██████████ 매우 부드러움 ← 이상적

심초음파 영상 특성:
- 심장은 1초에 1~2회 박동
- 30fps = 박동당 30~60 프레임
- 미세한 벽 운동 관찰에 충분한 해상도
```

### 실제 달성 결과

| 메트릭 | 목표 | 달성 | 달성률 |
|--------|------|------|--------|
| 동시 뷰포트 | 16개 | 100개 | 625% |
| 프레임 레이트 | 30fps | 60fps | 200% |
| Frame Time | < 33ms | 0.1~3ms | 1000%+ |
| GPU 메모리 | < 1.5GB | 측정 가능 | 달성 |
| 프레임 드롭 | < 1% | 관찰 안됨 | 달성 |

---

## 2. Cornerstone3D의 성능 문제

### 문제 분석

[Cornerstone3D Issue #1756](https://github.com/cornerstonejs/cornerstone3D/issues/1756)에서 발견된 문제:

```
┌─────────────────────────────────────────────────────────────┐
│           Cornerstone3D 렌더링 시간 분석                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  전체 프레임 렌더링 시간: 100ms (예시)                       │
│                                                             │
│  ├─ combineFrameInstance 호출: ~25ms (25%)                  │
│  │   └─ 매 프레임마다 메타데이터 조합                        │
│  │                                                          │
│  ├─ vtkDataArray 범위 계산: ~25ms (25%)                     │
│  │   └─ vtk.js가 새 배열 생성 시 min/max 재계산              │
│  │                                                          │
│  ├─ vtk.js 텍스처 재생성: ~30ms (30%)                       │
│  │   └─ 캐싱 없이 매번 텍스처 빌드                          │
│  │                                                          │
│  └─ 실제 렌더링: ~20ms (20%)                                │
│      └─ GPU 작업                                            │
│                                                             │
│  결론: 80%의 시간이 불필요한 재계산에 낭비됨!                │
└─────────────────────────────────────────────────────────────┘
```

### 문제의 근본 원인

```typescript
// Cornerstone3D의 문제 패턴 (예시)

// ❌ 문제 1: 매 프레임마다 메타데이터 재조합
function renderFrame(frameIndex) {
  // 이미 한 번 조합한 정보를 매번 다시 조합
  const metadata = combineFrameInstance(imageId);  // 매번 호출!
  // ...
}

// ❌ 문제 2: 매 프레임마다 통계 재계산
function processPixelData(pixelData) {
  // vtk.js가 내부적으로 min/max 계산
  const range = calculateRange(pixelData);  // O(n) 연산, 매번!
  // ...
}

// ❌ 문제 3: 텍스처 캐싱 없음
function updateTexture(pixelData) {
  // 같은 프레임이라도 매번 새 텍스처 생성
  const texture = createNewTexture(pixelData);  // 매번 생성!
  // ...
}
```

---

## 3. 전략 1: Single WebGL Context

### 문제

```
브라우저 WebGL Context 제한:
┌─────────────────────────────────────────────────────────────┐
│  Chrome: 16개                                               │
│  Firefox: 16개                                              │
│  Safari: 8-16개                                             │
│  모바일: 4-8개                                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  16개 뷰포트 × 각각 1개 Context = 16개 Context              │
│                                                             │
│  → 모바일에서 불가능                                         │
│  → Context 전환 오버헤드 발생                                │
└─────────────────────────────────────────────────────────────┘
```

### 해결책: Scissor/Viewport 렌더링

하나의 Canvas에서 여러 영역을 나누어 렌더링합니다:

```typescript
/**
 * Single Canvas로 모든 뷰포트 렌더링
 *
 * 왜 이렇게 하나?
 * - WebGL Context 제한 우회 (1개면 충분)
 * - Context 전환 오버헤드 제거
 * - 텍스처/버퍼 공유로 메모리 절약
 */
class SingleCanvasRenderer {
  private gl: WebGL2RenderingContext;

  renderAll(viewports: ViewportState[]): void {
    // Scissor Test 활성화
    this.gl.enable(this.gl.SCISSOR_TEST);

    for (const vp of viewports) {
      // DOM 위치를 WebGL 좌표로 변환
      const bounds = this.domToWebGL(vp.element.getBoundingClientRect());

      // 1. Viewport 설정: "이 영역에 그리기"
      this.gl.viewport(bounds.x, bounds.y, bounds.width, bounds.height);

      // 2. Scissor 설정: "이 영역만 자르기"
      this.gl.scissor(bounds.x, bounds.y, bounds.width, bounds.height);

      // 3. 해당 영역에 프레임 렌더링
      this.renderFrame(vp.textureId, vp.currentFrame);
    }

    this.gl.disable(this.gl.SCISSOR_TEST);
  }
}
```

### 성능 효과

```
기존 방식 (16개 Context):
├─ Context 메모리: 16 × 4MB = 64MB 오버헤드
├─ Context 전환: 16 × 0.5ms = 8ms/프레임
└─ 드라이버 부하: 높음

EchoPixel 방식 (1개 Context):
├─ Context 메모리: 1 × 4MB = 4MB 오버헤드 (93% 절약)
├─ Context 전환: 0ms (전환 없음)
└─ 드라이버 부하: 최소

결과: 16개 뷰포트 기준 ~8ms 이상 절약
```

---

## 4. 전략 2: 2D Array Texture

### 문제

```
일반적인 프레임 전환:

프레임 1 표시: [Texture A 바인딩] → 렌더링
프레임 2 표시: [Texture B 바인딩] → 렌더링 ← 바인딩 변경!
프레임 3 표시: [Texture C 바인딩] → 렌더링 ← 바인딩 변경!
...

100프레임 cine loop = 초당 3000번 바인딩 변경 (30fps × 100)

텍스처 바인딩 = GPU 드라이버 호출 = 오버헤드!
```

### 해결책: 2D Array Texture

모든 프레임을 **하나의 텍스처 배열**에 저장합니다:

```
일반 2D Texture (여러 개):          2D Array Texture (하나):

┌────────┐ ┌────────┐ ┌────────┐    ┌────────────────────────┐
│Frame 0 │ │Frame 1 │ │Frame 2 │    │ ┌────────┐ Layer 0    │
│        │ │        │ │        │    │ │Frame 0 │            │
└────────┘ └────────┘ └────────┘    │ ├────────┤ Layer 1    │
    ↑           ↑          ↑        │ │Frame 1 │            │
 바인딩     바인딩     바인딩       │ ├────────┤ Layer 2    │
                                    │ │Frame 2 │            │
                                    │ └────────┘            │
                                    └────────────────────────┘
                                           ↑
                                      한 번만 바인딩!
                                      레이어 인덱스로 전환
```

### 코드 구현

```typescript
/**
 * 2D Array Texture 생성 및 사용
 */
function createArrayTexture(
  gl: WebGL2RenderingContext,
  frames: VideoFrame[]
): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);

  // 텍스처 공간 할당 (한 번만)
  gl.texStorage3D(
    gl.TEXTURE_2D_ARRAY,
    1,                            // 밉맵 레벨
    gl.RGBA8,                     // 내부 포맷
    frames[0].displayWidth,       // 너비
    frames[0].displayHeight,      // 높이
    frames.length                 // 레이어 수 = 프레임 수
  );

  // 각 프레임을 레이어로 업로드
  for (let i = 0; i < frames.length; i++) {
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,                          // 밉맵 레벨
      0, 0, i,                    // x, y, layer
      frames[i].displayWidth,
      frames[i].displayHeight,
      1,                          // depth
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      frames[i]
    );
    frames[i].close();  // CPU 메모리 해제
  }

  return texture;
}
```

### Fragment Shader에서 프레임 접근

```glsl
// Fragment Shader

uniform sampler2DArray u_frames;   // 2D Array Texture
uniform int u_currentFrame;        // 현재 프레임 인덱스 (uniform)

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  // vec3의 z 성분이 레이어(프레임) 인덱스
  fragColor = texture(u_frames, vec3(v_texCoord, float(u_currentFrame)));
}
```

### 프레임 전환

```typescript
// 프레임 전환: uniform 값만 변경! (텍스처 바인딩 변경 없음)
function setFrame(frameIndex: number): void {
  gl.uniform1i(u_currentFrameLocation, frameIndex);
  // 끝! 텍스처 바인딩 불필요
}
```

### 성능 효과

```
기존 방식 (텍스처 바인딩 전환):
├─ 바인딩 호출: 30fps × 100프레임 = 3000회/초
├─ 바인딩당 시간: ~0.1ms
└─ 총 오버헤드: ~300ms/초

2D Array Texture:
├─ 바인딩 호출: 초기 1회
├─ uniform 변경: 3000회/초
├─ uniform당 시간: ~0.001ms
└─ 총 오버헤드: ~3ms/초 (99% 절약)
```

---

## 5. 전략 3: Pre-calculated Statistics

### 문제

```
vtk.js의 반복 계산:

매 프레임 렌더링 시:
1. 픽셀 데이터 배열 생성
2. min/max 값 계산 (전체 픽셀 순회) ← O(n) 연산!
3. 범위 정규화
4. 텍스처 생성

800×600 픽셀 = 480,000 픽셀
매 프레임 480,000번 비교 연산!
30fps × 480,000 = 초당 14,400,000번 연산!
```

### 해결책: 초기 로딩 시 한 번만 계산

```typescript
/**
 * 픽셀 통계 캐시
 *
 * 왜 이렇게 하나?
 * - 동일 시리즈의 통계는 변하지 않음
 * - 로딩 시 1번 계산 vs 매 프레임 계산
 * - ~25% 렌더링 시간 절약
 */
class PixelDataStats {
  private static cache = new Map<string, { min: number; max: number }>();

  static calculate(seriesId: string, frames: PixelData[]): PixelStats {
    // 캐시에 있으면 즉시 반환
    if (this.cache.has(seriesId)) {
      return this.cache.get(seriesId)!;
    }

    // 모든 프레임의 min/max 계산 (1회)
    let min = Infinity;
    let max = -Infinity;

    for (const frame of frames) {
      for (let i = 0; i < frame.length; i++) {
        const value = frame[i];
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }

    // 캐시에 저장
    const stats = { min, max };
    this.cache.set(seriesId, stats);

    return stats;
  }

  // 시리즈 언로드 시 캐시 정리
  static clear(seriesId: string): void {
    this.cache.delete(seriesId);
  }
}

// 사용 예시
const stats = PixelDataStats.calculate('series-001', allFrames);
console.log(`Range: ${stats.min} ~ ${stats.max}`);
```

### 성능 효과

```
기존 방식 (매 프레임 계산):
├─ 계산 횟수: 30fps × 60초 = 1800회/분
├─ 계산당 시간: ~5ms
└─ 총 시간: 9000ms/분

캐싱 방식:
├─ 계산 횟수: 1회 (로딩 시)
├─ 계산 시간: ~50ms (전체 프레임)
└─ 총 시간: 50ms (초기 1회만)

절약: 분당 ~9초 → ~0.05초 (99.4% 절약)
```

---

## 6. 전략 4: GPU VOI LUT

### 문제

VOI (Value of Interest) LUT는 Window/Level 조정을 말합니다:

```
CPU에서 Window/Level 처리:

원본 픽셀값 → [CPU에서 W/L 계산] → 결과 픽셀값 → GPU 업로드

800×600 = 480,000 픽셀
매 픽셀마다:
  1. 값 읽기
  2. W/L 공식 적용
  3. 클램핑
  4. 결과 저장

W/L 변경할 때마다 480,000 픽셀 재계산!
```

### 해결책: Fragment Shader에서 실시간 처리

```glsl
// Fragment Shader - GPU에서 W/L 처리

uniform float u_windowCenter;   // Window Center (W/L의 L)
uniform float u_windowWidth;    // Window Width (W/L의 W)
uniform float u_rescaleSlope;   // DICOM Rescale Slope
uniform float u_rescaleIntercept; // DICOM Rescale Intercept

/**
 * GPU에서 VOI LUT 적용
 *
 * 왜 GPU에서?
 * - 480,000 픽셀을 병렬 처리
 * - CPU: 순차 처리 (느림)
 * - GPU: 병렬 처리 (빠름)
 */
float applyVOI(float storedValue) {
  // 1. Modality LUT (Stored Value → Real Value)
  float realValue = storedValue * u_rescaleSlope + u_rescaleIntercept;

  // 2. VOI LUT (Real Value → Display Value)
  float lower = u_windowCenter - u_windowWidth * 0.5;
  float upper = u_windowCenter + u_windowWidth * 0.5;

  // 선형 보간으로 0~1 범위에 매핑
  return clamp((realValue - lower) / u_windowWidth, 0.0, 1.0);
}

void main() {
  // 텍스처에서 저장된 값 읽기
  float storedValue = texture(u_frames, vec3(v_texCoord, float(u_currentFrame))).r;

  // VOI LUT 적용 (GPU에서 실시간!)
  float displayValue = applyVOI(storedValue);

  // 그레이스케일 출력
  fragColor = vec4(vec3(displayValue), 1.0);
}
```

### W/L 변경 시

```typescript
// W/L 변경: uniform만 업데이트 (즉시!)
function setWindowLevel(center: number, width: number): void {
  gl.uniform1f(u_windowCenterLocation, center);
  gl.uniform1f(u_windowWidthLocation, width);
  // 끝! 텍스처 재생성 불필요
}

// 사용자가 드래그하면서 W/L 조정
canvas.addEventListener('mousemove', (e) => {
  if (isDragging) {
    const newCenter = currentCenter + e.movementY;
    const newWidth = currentWidth + e.movementX;
    setWindowLevel(newCenter, newWidth);  // 실시간 반영!
  }
});
```

### 성능 효과

```
CPU 방식:
├─ W/L 변경당 시간: ~10ms (픽셀 재계산)
├─ 드래그 중 60fps 불가
└─ 텍스처 재업로드 필요

GPU 방식:
├─ W/L 변경당 시간: ~0.01ms (uniform 변경)
├─ 드래그 중에도 60fps 유지
└─ 텍스처 그대로 사용

체감: 드래그 시 부드러움 vs 끊김
```

---

## 7. 전략 5: Frame Prefetching

### 문제

```
JIT (Just-In-Time) 디코딩:

시간 →
[프레임 10 표시] → [프레임 11 디코딩 시작] → [대기...] → [프레임 11 표시]
                         ↑
                    디코딩 시간 (10-50ms)
                    = 프레임 드롭!
```

### 해결책: 재생 방향 예측 프리페칭

```typescript
/**
 * 프레임 프리페칭
 *
 * 왜 필요한가?
 * - JPEG 디코딩: 10-50ms
 * - 33ms 프레임 예산 (30fps)
 * - 디코딩 시간 > 예산 → 프레임 드롭!
 *
 * 해결: 미리 디코딩해두기
 */
class FramePrefetcher {
  private cache = new Map<string, WebGLTexture>();
  private workerPool: WorkerPool;

  /**
   * 현재 프레임 주변 프레임 미리 로드
   */
  prefetchWindow(
    seriesId: string,
    currentFrame: number,
    totalFrames: number,
    windowSize: number = 10  // 앞뒤 10프레임
  ): void {
    // 재생 방향 기반으로 우선순위 결정
    const direction = this.detectPlayDirection();  // 1: 정방향, -1: 역방향

    for (let i = 1; i <= windowSize; i++) {
      // 정방향 우선
      const nextFrame = (currentFrame + i * direction + totalFrames) % totalFrames;

      // 이미 캐시에 있으면 스킵
      const cacheKey = `${seriesId}-${nextFrame}`;
      if (this.cache.has(cacheKey)) continue;

      // Worker에서 디코딩 예약
      this.workerPool.enqueue({
        type: 'decode',
        seriesId,
        frameIndex: nextFrame,
        priority: i  // 가까운 프레임 = 높은 우선순위
      });
    }
  }

  /**
   * 프레임 가져오기 (캐시 우선)
   */
  async getFrame(seriesId: string, frameIndex: number): Promise<WebGLTexture> {
    const cacheKey = `${seriesId}-${frameIndex}`;

    // 캐시에 있으면 즉시 반환
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // 없으면 즉시 디코딩 (블로킹)
    return await this.decodeFrame(seriesId, frameIndex);
  }
}
```

### 프리페치 시각화

```
현재 프레임: 50 (100프레임 중)
재생 방향: 정방향 →

프리페치 상태:
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  [캐시됨] ← 이전    [현재]    이후 → [프리페칭]             │
│  45 46 47 48 49 ▶ 50 ◀ 51 52 53 54 55 56 57 58 59 60      │
│  ██ ██ ██ ██ ██    ★    ░░ ░░ ░░ ░░ ██ ██ ██ ██ ██ ██      │
│                         ↑                                   │
│                    디코딩 진행 중                            │
│                                                            │
│  ██ = 캐시됨 (즉시 표시 가능)                               │
│  ░░ = 디코딩 중 (곧 완료)                                   │
│  ★ = 현재 표시 중                                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 성능 효과

```
프리페칭 없음:
├─ 프레임 전환 시: 디코딩 대기 (10-50ms)
├─ 30fps 유지 어려움
└─ 재생 끊김 발생

프리페칭 적용:
├─ 프레임 전환 시: 캐시에서 즉시 (<1ms)
├─ 60fps 가능
└─ 끊김 없는 재생

핵심: 백그라운드에서 미리 준비
```

---

## 8. 전략 6: IntersectionObserver

### 문제

```
화면 밖 뷰포트도 렌더링:

[화면에 보이는 영역]              [화면 밖]
┌──────────────────────┐    ┌──────────────────────┐
│ VP1  VP2  VP3  VP4   │    │ VP17 VP18 VP19 VP20  │
│                      │    │                      │
│ VP5  VP6  VP7  VP8   │    │ VP21 VP22 VP23 VP24  │
└──────────────────────┘    └──────────────────────┘
  ↑                            ↑
  렌더링 필요                   렌더링 불필요! (리소스 낭비)
```

### 해결책: 가시성 기반 렌더링

```typescript
/**
 * IntersectionObserver로 가시성 추적
 *
 * 왜 사용하나?
 * - 화면 밖 뷰포트 렌더링 = 리소스 낭비
 * - 10% 이상 보일 때만 렌더링
 * - 가려진 뷰포트는 메모리도 절약 가능
 */
class ViewportVisibilityManager {
  private observer: IntersectionObserver;
  private visibleViewports = new Set<string>();

  constructor() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const viewportId = entry.target.dataset.viewportId!;

          if (entry.isIntersecting) {
            // 화면에 나타남
            this.visibleViewports.add(viewportId);
            this.onViewportVisible(viewportId);
          } else {
            // 화면에서 사라짐
            this.visibleViewports.delete(viewportId);
            this.onViewportHidden(viewportId);
          }
        });
      },
      {
        threshold: 0.1  // 10% 이상 보일 때 감지
      }
    );
  }

  // 뷰포트 등록
  observe(element: HTMLElement): void {
    this.observer.observe(element);
  }

  // 렌더링 여부 확인
  shouldRender(viewportId: string): boolean {
    return this.visibleViewports.has(viewportId);
  }

  // 화면에 나타났을 때
  private onViewportVisible(viewportId: string): void {
    console.log(`Viewport ${viewportId} visible, start rendering`);
    // 텍스처 로드, 렌더링 시작
  }

  // 화면에서 사라졌을 때
  private onViewportHidden(viewportId: string): void {
    console.log(`Viewport ${viewportId} hidden, pause rendering`);
    // 렌더링 일시 중지
    // 30초 후 텍스처 해제 고려
  }
}
```

### 렌더 루프에 적용

```typescript
// 렌더 루프
function renderLoop(): void {
  for (const viewport of allViewports) {
    // 보이는 뷰포트만 렌더링
    if (visibilityManager.shouldRender(viewport.id)) {
      renderViewport(viewport);
    }
  }

  requestAnimationFrame(renderLoop);
}
```

### 성능 효과

```
100개 뷰포트, 8개만 화면에 보임:

가시성 체크 없음:
├─ 렌더링 횟수: 100개 × 30fps = 3000회/초
├─ GPU 부하: 100%
└─ 프레임 드롭 발생 가능

가시성 체크 적용:
├─ 렌더링 횟수: 8개 × 30fps = 240회/초 (92% 감소)
├─ GPU 부하: 8%
└─ 여유 있는 성능

절약: 92% 렌더링 연산 감소
```

---

## 9. 전략 7: Web Workers

### 문제

```
메인 스레드에서 디코딩:

[메인 스레드]
├─ 사용자 입력 처리
├─ React 렌더링
├─ JPEG 디코딩 (10-50ms 블로킹!) ← 여기서 UI 멈춤!
└─ WebGL 렌더링

JPEG 디코딩 중:
- 마우스 클릭 반응 없음
- 애니메이션 끊김
- 사용자 경험 저하
```

### 해결책: Worker Pool에서 병렬 디코딩

```typescript
/**
 * Web Worker Pool
 *
 * 왜 Workers?
 * - 메인 스레드 블로킹 방지
 * - CPU 코어 병렬 활용
 * - UI 응답성 유지
 */
class WorkerPool {
  private workers: Worker[];
  private taskQueue: Task[] = [];
  private busyWorkers = new Set<number>();

  constructor(scriptUrl: string, poolSize: number = 4) {
    // Worker 생성 (CPU 코어 수만큼)
    this.workers = Array.from({ length: poolSize }, () =>
      new Worker(scriptUrl)
    );

    // 결과 수신 설정
    this.workers.forEach((worker, index) => {
      worker.onmessage = (e) => {
        this.busyWorkers.delete(index);
        this.processResult(e.data);
        this.processNextTask(index);
      };
    });
  }

  // 작업 추가
  enqueue(task: Task): Promise<Result> {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ ...task, resolve, reject });
      this.dispatchTasks();
    });
  }

  private dispatchTasks(): void {
    // 사용 가능한 Worker 찾기
    for (let i = 0; i < this.workers.length; i++) {
      if (!this.busyWorkers.has(i) && this.taskQueue.length > 0) {
        const task = this.taskQueue.shift()!;
        this.busyWorkers.add(i);
        this.workers[i].postMessage(task);
      }
    }
  }
}

// Worker 스크립트 (decoder.worker.ts)
self.onmessage = async (e) => {
  const { type, seriesId, frameIndex, data } = e.data;

  if (type === 'decode') {
    // JPEG 디코딩 (Worker에서 실행 - 메인 스레드 블로킹 없음)
    const decoder = new ImageDecoder({
      type: 'image/jpeg',
      data: new Uint8Array(data)
    });

    const result = await decoder.decode();
    const frame = result.image;

    // 결과 전송 (Transferable로 복사 방지)
    self.postMessage(
      { seriesId, frameIndex, frame },
      [frame]  // Transferable objects
    );
  }
};
```

### 메인 스레드에서 사용

```typescript
// 메인 스레드
const decoderPool = new WorkerPool('decoder.worker.js', 4);

async function loadFrame(seriesId: string, frameIndex: number): Promise<void> {
  const rawData = await fetchFrameData(seriesId, frameIndex);

  // Worker에서 디코딩 (메인 스레드 블로킹 없음!)
  const result = await decoderPool.enqueue({
    type: 'decode',
    seriesId,
    frameIndex,
    data: rawData
  });

  // GPU 업로드 (메인 스레드, 빠름)
  uploadToGPU(result.frame);
}
```

### 성능 효과

```
메인 스레드에서 디코딩:
├─ 디코딩 중 UI 프리징
├─ 단일 스레드 사용
└─ 16개 프레임 순차 처리: 16 × 30ms = 480ms

Worker Pool에서 디코딩 (4 Workers):
├─ UI 프리징 없음
├─ 4개 코어 병렬 사용
└─ 16개 프레임 병렬 처리: 16 / 4 × 30ms = 120ms (75% 단축)
```

---

## 10. React 최적화

### 문제 1: Zustand 셀렉터

```typescript
// ❌ 나쁜 예: 전체 객체 구독
function ViewportComponent({ slotId }) {
  // slots 객체 전체가 변경되면 리렌더링
  const slot = useViewerStore((state) => state.slots[slotId]);

  return <div>Frame: {slot?.currentFrame}</div>;
}

// slots 객체 내 다른 슬롯이 변경되어도 리렌더링 발생!
// 16개 뷰포트 × 30fps = 480회/초 불필요한 리렌더링!
```

```typescript
// ✅ 좋은 예: 필요한 필드만 구독
function ViewportComponent({ slotId }) {
  // currentFrame만 구독, 다른 필드 변경 시 리렌더링 없음
  const currentFrame = useViewerStore(
    (state) => state.slots[slotId]?.currentFrame
  );

  return <div>Frame: {currentFrame}</div>;
}

// 해당 슬롯의 currentFrame이 변경될 때만 리렌더링
```

### 문제 2: 렌더링 중 ref 업데이트

```tsx
// ❌ 나쁜 예: 렌더링 중 ref 변경
function BadComponent() {
  const countRef = useRef(0);
  countRef.current++; // ⚠️ 렌더링 중 side effect!
  return <div>{countRef.current}</div>;
}

// ✅ 좋은 예: useLayoutEffect에서 ref 변경
function GoodComponent() {
  const countRef = useRef(0);

  useLayoutEffect(() => {
    countRef.current++;
  });

  return <div>{countRef.current}</div>;
}
```

### Cine 재생 최적화: React 우회

```typescript
/**
 * Cine 재생 시 React 상태 업데이트 우회
 *
 * 왜?
 * - 30fps = 33ms마다 상태 업데이트
 * - React 렌더링: ~5-10ms
 * - 예산 초과 → 프레임 드롭
 *
 * 해결: 재생 중에는 React 우회, WebGL 직접 렌더링
 */
class CinePlayer {
  private frameRef = { current: 0 };  // React 외부 참조
  private isPlaying = false;

  play(): void {
    this.isPlaying = true;
    this.renderLoop();
  }

  private renderLoop = (): void => {
    if (!this.isPlaying) return;

    // React 상태 업데이트 없이 프레임 증가
    this.frameRef.current = (this.frameRef.current + 1) % this.totalFrames;

    // WebGL 직접 렌더링
    this.renderer.setFrame(this.frameRef.current);
    this.renderer.render();

    requestAnimationFrame(this.renderLoop);
  };

  stop(): void {
    this.isPlaying = false;

    // 정지 시에만 React 상태 동기화
    this.setCurrentFrame(this.frameRef.current);
  }
}
```

---

## 11. 성능 측정 방법

### Chrome DevTools 활용

```
1. Performance 탭:
   - 녹화 시작 → 작업 수행 → 녹화 종료
   - Frame rate 그래프 확인
   - Main 스레드 작업 분석

2. Rendering 탭:
   - Frame Rendering Stats 활성화
   - FPS meter 실시간 확인

3. Memory 탭:
   - Heap snapshot
   - Allocation timeline

4. 콘솔에서 측정:
   performance.mark('frame-start');
   renderFrame();
   performance.mark('frame-end');
   performance.measure('frame', 'frame-start', 'frame-end');
```

### 코드에서 FPS 측정

```typescript
/**
 * FPS 측정기
 */
class FPSMeter {
  private frames = 0;
  private lastTime = performance.now();
  private fps = 0;

  tick(): void {
    this.frames++;
    const now = performance.now();
    const elapsed = now - this.lastTime;

    if (elapsed >= 1000) {  // 1초마다 계산
      this.fps = Math.round((this.frames * 1000) / elapsed);
      this.frames = 0;
      this.lastTime = now;
      console.log(`FPS: ${this.fps}`);
    }
  }

  getFPS(): number {
    return this.fps;
  }
}

// 사용
const fpsMeter = new FPSMeter();

function renderLoop() {
  render();
  fpsMeter.tick();
  requestAnimationFrame(renderLoop);
}
```

### 병목 진단 체크리스트

| 증상 | 가능한 원인 | 해결책 |
|------|------------|--------|
| FPS < 30 | 디코딩 병목 | Web Workers 사용 |
| UI 버벅임 | React 과도한 리렌더링 | 셀렉터 최적화, memo 사용 |
| 메모리 증가 | VideoFrame 누수 | close() 호출 확인 |
| 첫 프레임 느림 | 프리페칭 없음 | Frame Prefetching 적용 |
| W/L 조정 느림 | CPU에서 W/L 처리 | GPU VOI LUT 사용 |
| 화면 밖 렌더링 | IntersectionObserver 없음 | 가시성 기반 렌더링 |

---

## 12. 학습 포인트 정리

### 7가지 최적화 전략 요약

| # | 전략 | 핵심 아이디어 | 효과 |
|---|------|-------------|------|
| 1 | Single WebGL Context | 1개 Canvas로 모든 뷰포트 | Context 제한 우회 |
| 2 | 2D Array Texture | 모든 프레임을 레이어로 | 바인딩 오버헤드 제거 |
| 3 | Pre-calculated Stats | 로딩 시 1회 계산 | 25% 연산 절약 |
| 4 | GPU VOI LUT | Shader에서 W/L 처리 | 실시간 W/L 조정 |
| 5 | Frame Prefetching | 미리 디코딩 | 프레임 드롭 방지 |
| 6 | IntersectionObserver | 보이는 것만 렌더링 | 92% 연산 절약 |
| 7 | Web Workers | 병렬 디코딩 | UI 프리징 방지 |

### 성능 최적화 우선순위

1. **Single Canvas + Scissor** - 필수 (Context 제한)
2. **2D Array Texture** - 필수 (프레임 전환 성능)
3. **Web Workers** - 중요 (UI 응답성)
4. **GPU VOI LUT** - 중요 (W/L 조정 성능)
5. **Frame Prefetching** - 권장 (끊김 방지)
6. **IntersectionObserver** - 권장 (리소스 절약)
7. **Pre-calculated Stats** - 선택 (추가 최적화)

### 더 배우기

- **WebGL Fundamentals**: https://webglfundamentals.org/
- **Web Workers API**: https://developer.mozilla.org/ko/docs/Web/API/Web_Workers_API
- **IntersectionObserver**: https://developer.mozilla.org/ko/docs/Web/API/Intersection_Observer_API
- **Chrome DevTools Performance**: https://developer.chrome.com/docs/devtools/performance/

### 프로젝트 내부 문서

- **[성능 전략 분석](/docs/design/performance-strategy.md)** - 설계 결정의 상세 근거
- [렌더링 파이프라인](./rendering-pipeline.md) - 전체 데이터 흐름
- [메모리 관리](./memory-management.md) - GPU 메모리 전략
- [멀티 뷰포트 아키텍처](./multi-viewport-architecture.md) - Hybrid DOM-WebGL 구조
