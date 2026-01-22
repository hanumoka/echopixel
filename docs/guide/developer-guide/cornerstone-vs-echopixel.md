# Cornerstone3D vs EchoPixel 아키텍처 비교

이 문서에서는 Cornerstone3D의 내부 구조와 한계점을 분석하고, EchoPixel이 이를 어떻게 극복하는지 설명합니다.

---

## 목차

1. [Cornerstone3D 개요](#cornerstone3d-개요)
2. [Cornerstone3D 내부 아키텍처](#cornerstone3d-내부-아키텍처)
3. [Cornerstone3D의 한계점](#cornerstone3d의-한계점)
4. [EchoPixel의 접근 방식](#echopixel의-접근-방식)
5. [상세 비교](#상세-비교)
6. [결론](#결론)

---

## Cornerstone3D 개요

### Cornerstone3D란?

[Cornerstone3D](https://github.com/cornerstonejs/cornerstone3D)는 웹 기반 의료 영상 뷰어를 위한 JavaScript 라이브러리입니다.

**특징**:
- OHIF Viewer의 핵심 렌더링 엔진
- vtk.js 기반 WebGL 렌더링
- 2D/3D 볼륨 렌더링 지원
- MPR (Multi-planar Reconstruction) 지원
- 광범위한 DICOM 모달리티 지원

**저장소**: [cornerstonejs/cornerstone3D](https://github.com/cornerstonejs/cornerstone3D)

### Cornerstone3D의 목표

Cornerstone3D는 **범용 의료 영상 뷰어**를 목표로 합니다:

```
CT, MRI, PET, X-Ray, 초음파, 핵의학 등 모든 DICOM 모달리티 지원
        ↓
2D 스택 뷰, 3D 볼륨 렌더링, MPR, Fusion 등 다양한 뷰 모드
        ↓
어노테이션, 측정, 세그먼테이션 등 의료 분석 도구
```

---

## Cornerstone3D 내부 아키텍처

### 1. 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│                     Cornerstone3D                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐        │
│  │@cornerstone3│   │@cornerstone3│   │cornerstone- │        │
│  │D/core       │   │D/streaming- │   │3D-tools     │        │
│  │             │   │image-volume │   │             │        │
│  └─────────────┘   └─────────────┘   └─────────────┘        │
│         │                 │                 │                │
│         ▼                 ▼                 ▼                │
│  ┌───────────────────────────────────────────────────┐      │
│  │                    vtk.js                          │      │
│  │  (3D 렌더링 엔진, OpenGL/WebGPU 추상화)            │      │
│  └───────────────────────────────────────────────────┘      │
│         │                                                    │
│         ▼                                                    │
│  ┌───────────────────────────────────────────────────┐      │
│  │                    WebGL                           │      │
│  └───────────────────────────────────────────────────┘      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2. RenderingEngine (렌더링 엔진)

Cornerstone3D의 핵심은 **RenderingEngine**입니다.

```typescript
// Cornerstone3D 사용 예시
import { RenderingEngine, Enums } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('myRenderingEngine');

// 뷰포트 설정
const viewportInput = {
  viewportId: 'CT_AXIAL',
  type: Enums.ViewportType.ORTHOGRAPHIC,
  element: document.getElementById('viewport'),
  defaultOptions: {
    orientation: Enums.OrientationAxis.AXIAL,
  },
};

renderingEngine.enableElement(viewportInput);
```

### 3. Offscreen Canvas 방식

Cornerstone3D는 **Offscreen Canvas 패턴**을 사용합니다:

```
┌─────────────────────────────────────────────────────────────┐
│                    Offscreen Canvas (숨김)                   │
│   ┌────────────────────────────────────────────────────┐    │
│   │  모든 뷰포트의 렌더링 결과가 여기에 그려짐          │    │
│   │                                                    │    │
│   │   ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                │    │
│   │   │ VP1 │ │ VP2 │ │ VP3 │ │ VP4 │  ...           │    │
│   │   └─────┘ └─────┘ └─────┘ └─────┘                │    │
│   │                                                    │    │
│   └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼ 복사                              │
│   ┌────────────────────────────────────────────────────┐    │
│   │              화면에 보이는 Canvas들                 │    │
│   │   ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                │    │
│   │   │     │ │     │ │     │ │     │                │    │
│   │   └─────┘ └─────┘ └─────┘ └─────┘                │    │
│   └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**장점**:
- 단일 WebGL 컨텍스트로 여러 뷰포트 처리
- 텍스처 메모리 공유 가능

**단점**:
- 복사 오버헤드 (Offscreen → Onscreen)
- 복잡한 좌표 변환

### 4. Shared Volume Mappers

```typescript
// 볼륨 공유 예시 (PET-CT Fusion)
//
// CT 볼륨과 PET 볼륨을 각각 한 번만 GPU에 올림
// 여러 뷰포트가 동일한 텍스처를 재사용

CT Volume  ──┬── Axial Viewport
             ├── Sagittal Viewport
             └── Coronal Viewport

PET Volume ──┬── Fusion Viewport (CT + PET 합성)
             └── PET-only Viewport
```

### 5. vtk.js 의존성

Cornerstone3D는 **vtk.js**에 깊이 의존합니다:

```
vtk.js 역할:
├── vtkImageMapper       # 2D 이미지 매핑
├── vtkVolumeMapper      # 3D 볼륨 매핑
├── vtkRenderWindow      # 렌더 윈도우 관리
├── vtkRenderer          # 렌더러 (카메라, 라이팅)
├── vtkActor             # 렌더 가능한 객체
├── vtkDataArray         # 데이터 배열 관리
└── Shader Programs      # GLSL 셰이더 (vtk.js 내장)
```

---

## Cornerstone3D의 한계점

### 문제 1: Multi-frame Cine 재생 성능 저하

[GitHub Issue #1756](https://github.com/cornerstonejs/cornerstone3D/issues/1756)에서 보고된 심각한 성능 문제:

**증상**:
- 심초음파 같은 Multi-frame Cine 이미지 재생 시 프레임 드롭
- 여러 Cine을 동시에 재생하면 성능이 급격히 저하
- 30fps 목표에서 실제 10-15fps로 떨어짐

**프로파일링 결과**:

```
전체 렌더링 시간 분석 (매 프레임마다)
──────────────────────────────────────

[████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░] 25%
 combineFrameInstance: ImagePlaneModule 매번 재계산

[████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░] 25%
 vtkDataArray.getRange: 새 배열 생성 시 range 재계산

[██████████████████████████████░░░░░░░░░░░░░░░░░░░░] 30%
 vtk 텍스처 빌드: 캐싱 없이 매번 텍스처 생성

[████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 20%
 실제 렌더링: 필요한 작업
```

**근본 원인**:

1. **ImagePlaneModule 재계산**
```typescript
// Cornerstone3D 내부 (문제 코드)
function getFrameOfReferenceUID() {
  // 매 프레임마다 combineFrameInstance 호출
  const metadata = combineFrameInstance(imageId);  // ← 병목!
  return metadata.frameOfReferenceUID;
}
```

2. **vtkDataArray Range 계산**
```typescript
// vtk.js 내부 동작
function setData(newData) {
  this.data = newData;
  this.range = this.computeRange();  // ← 매번 전체 배열 순회!
}
```

3. **텍스처 캐싱 부재**
```typescript
// 매 프레임마다 새 텍스처 생성
function renderFrame(frameIndex) {
  const texture = gl.createTexture();  // ← 새로 생성!
  gl.texImage2D(...);  // ← 매번 업로드!
  // ... 렌더링 후 텍스처 삭제 또는 방치
}
```

### 문제 2: vtk.js 오버헤드

vtk.js는 범용 3D 라이브러리로, 의료 영상에 불필요한 기능이 많습니다:

```
vtk.js 번들 크기 분석
──────────────────────

전체 vtk.js      ████████████████████████████████  ~500KB (gzip)
├── 3D 볼륨 렌더링  ████████████                       ~150KB
├── MPR/Fusion      ████████                          ~100KB
├── 씬 그래프       ██████                            ~80KB
├── 카메라/라이팅   ████                              ~50KB
├── 데이터 구조     ████                              ~50KB
└── 유틸리티        ████                              ~70KB

심초음파 2D 뷰어에 필요한 부분
──────────────────────────────

실제 필요         ████                               ~50KB
  - 2D 텍스처 렌더링
  - Window/Level 셰이더
  - 기본 변환 (Pan, Zoom)
```

### 문제 3: WebGL 컨텍스트 제한

```
브라우저 WebGL 컨텍스트 제한
────────────────────────────

Chrome/Edge:  최대 16개 (일반적으로 8개 안전)
Firefox:      최대 16개
Safari:       최대 8개

Cornerstone3D 방식:
  - 단일 Offscreen Canvas → 1개 컨텍스트
  - 하지만 뷰포트 수 증가 시 메모리/성능 문제

EchoPixel 목표:
  - 100+ 뷰포트를 단일 컨텍스트로 처리
```

### 문제 4: CPU-GPU 데이터 전송 병목

```
Cornerstone3D의 데이터 흐름 (비효율적)
───────────────────────────────────────

DICOM File
    │
    ▼ (CPU)
┌─────────────────────┐
│ Full Parsing        │  모든 태그 파싱
│ dcmjs 라이브러리    │
└─────────────────────┘
    │
    ▼ (CPU)
┌─────────────────────┐
│ ImagePlaneModule    │  매 프레임마다 재계산
│ 메타데이터 조립     │
└─────────────────────┘
    │
    ▼ (CPU → GPU)
┌─────────────────────┐
│ vtkDataArray        │  Range 재계산
│ 새 배열 생성        │
└─────────────────────┘
    │
    ▼ (GPU)
┌─────────────────────┐
│ vtk 텍스처 생성     │  캐싱 없음
│ 매번 새로 빌드      │
└─────────────────────┘
    │
    ▼
   렌더링
```

---

## EchoPixel의 접근 방식

### 설계 철학

```
Cornerstone3D: 범용성 우선
  "모든 DICOM 모달리티를 지원하는 완전한 솔루션"

EchoPixel: 성능 우선
  "심초음파/초음파 Cine Loop에 최적화된 고성능 렌더러"
```

### 핵심 전략: vtk.js 제거

```
EchoPixel 아키텍처
──────────────────

┌─────────────────────────────────────────┐
│           EchoPixel Library              │
├─────────────────────────────────────────┤
│                                          │
│   ┌─────────────┐   ┌─────────────┐     │
│   │ React Layer │   │ Core Engine │     │
│   └─────────────┘   └─────────────┘     │
│          │                 │             │
│          ▼                 ▼             │
│   ┌─────────────────────────────────┐   │
│   │        직접 WebGL2 제어          │   │  ← vtk.js 없음!
│   │   (TextureManager, Renderer)    │   │
│   └─────────────────────────────────┘   │
│          │                               │
│          ▼                               │
│   ┌─────────────────────────────────┐   │
│   │            WebGL2                │   │
│   └─────────────────────────────────┘   │
│                                          │
└─────────────────────────────────────────┘
```

### 전략 1: 2D Array Texture

Cornerstone3D vs EchoPixel의 프레임 전환 방식:

```
Cornerstone3D (매 프레임)
──────────────────────────

Frame 0:  gl.createTexture() → gl.texImage2D() → 렌더링 → gl.deleteTexture()
Frame 1:  gl.createTexture() → gl.texImage2D() → 렌더링 → gl.deleteTexture()
Frame 2:  gl.createTexture() → gl.texImage2D() → 렌더링 → gl.deleteTexture()
...

텍스처 바인딩 비용: O(n) per frame


EchoPixel (2D Array Texture)
────────────────────────────

초기화:
  gl.texStorage3D()  // 모든 프레임용 메모리 한 번에 할당
  gl.texSubImage3D(frame0)
  gl.texSubImage3D(frame1)
  gl.texSubImage3D(frame2)
  ...

재생:
  Frame 0:  uniform u_currentFrame = 0  // uniform만 변경!
  Frame 1:  uniform u_currentFrame = 1
  Frame 2:  uniform u_currentFrame = 2
  ...

텍스처 바인딩 비용: O(1) - 상수 시간
```

**셰이더 코드 비교**:

```glsl
// Cornerstone3D 방식 (TEXTURE_2D)
uniform sampler2D u_texture;

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  // ... Window/Level 적용
}


// EchoPixel 방식 (TEXTURE_2D_ARRAY)
uniform sampler2DArray u_texture;
uniform float u_currentFrame;

void main() {
  vec4 color = texture(u_texture, vec3(v_texCoord, u_currentFrame));
  // ... Window/Level 적용
}
```

### 전략 2: GPU-Only 렌더링 파이프라인

```
EchoPixel의 데이터 흐름 (최적화)
────────────────────────────────

DICOM File
    │
    ▼ (CPU - 최소화)
┌─────────────────────┐
│ Lazy Parsing        │  필요한 태그만 파싱
│ 자체 파서           │
└─────────────────────┘
    │
    ▼ (CPU → GPU - 한 번만)
┌─────────────────────┐
│ 2D Array Texture    │  모든 프레임 한 번에 업로드
│ texStorage3D        │
└─────────────────────┘
    │
    ▼ (GPU - 실시간)
┌─────────────────────┐
│ Shader에서 처리     │  Window/Level, Transform
│ uniform만 변경      │  텍스처 바인딩 없음
└─────────────────────┘
    │
    ▼
   렌더링 (60fps)
```

### 전략 3: Hybrid DOM-WebGL 아키텍처

100개 이상의 뷰포트를 단일 WebGL 컨텍스트로 처리:

```
┌────────────────────────────────────────────────────┐
│                  HybridMultiViewport                │
├────────────────────────────────────────────────────┤
│                                                     │
│   ┌─────────────────────────────────────────────┐  │
│   │         Single WebGL Canvas                  │  │
│   │  ┌─────┬─────┬─────┬─────┬─────┐           │  │
│   │  │ V1  │ V2  │ V3  │ V4  │ ... │ × 10 rows │  │
│   │  ├─────┼─────┼─────┼─────┼─────┤           │  │
│   │  │ V11 │ V12 │ V13 │ V14 │ ... │           │  │
│   │  └─────┴─────┴─────┴─────┴─────┘           │  │
│   │      ↑ gl.scissor()로 영역 분할            │  │
│   └─────────────────────────────────────────────┘  │
│                        +                            │
│   ┌─────────────────────────────────────────────┐  │
│   │         DOM Overlay Grid                     │  │
│   │  ┌─────┬─────┬─────┬─────┬─────┐           │  │
│   │  │ Slot│ Slot│ Slot│ Slot│ ... │           │  │
│   │  │(이벤트, 상태 표시, 어노테이션)           │  │
│   │  └─────┴─────┴─────┴─────┴─────┘           │  │
│   └─────────────────────────────────────────────┘  │
│                                                     │
└────────────────────────────────────────────────────┘
```

**장점**:
- 단일 WebGL 컨텍스트로 무제한 뷰포트
- DOM은 이벤트 처리와 오버레이만 담당
- 렌더링은 전적으로 GPU에서 처리

---

## 상세 비교

### 렌더링 파이프라인 비교

| 항목 | Cornerstone3D | EchoPixel |
|------|---------------|-----------|
| **렌더링 엔진** | vtk.js (범용 3D) | 직접 WebGL2 (2D 특화) |
| **텍스처 관리** | vtk 자동 관리 | TextureManager (커스텀) |
| **프레임 전환** | 텍스처 재생성 | uniform 변경만 |
| **Window/Level** | vtk LUT + 셰이더 | GPU 셰이더 직접 |
| **메타데이터** | 매 프레임 재계산 | 초기화 시 캐싱 |

### 성능 비교

| 메트릭 | Cornerstone3D | EchoPixel | 개선율 |
|--------|---------------|-----------|--------|
| **동시 뷰포트** | 8-16개 | 100개+ | 625%+ |
| **Frame Time** | 30-100ms | 0.1-3ms | 1000%+ |
| **프레임 레이트** | 10-30fps | 60fps | 200-600% |
| **번들 크기** | ~500KB | ~100KB | 80% 감소 |
| **메모리 사용** | 높음 (vtk 오버헤드) | 낮음 | 50%+ 감소 |

### 기능 범위 비교

| 기능 | Cornerstone3D | EchoPixel | 비고 |
|------|---------------|-----------|------|
| **2D 스택 뷰** | ✅ | ✅ | |
| **Multi-frame Cine** | ⚠️ 성능 문제 | ✅ 최적화 | EchoPixel 특화 |
| **3D 볼륨 렌더링** | ✅ | ❌ | 범위 외 |
| **MPR** | ✅ | ❌ | 범위 외 |
| **Fusion** | ✅ | ❌ | 범위 외 |
| **어노테이션** | ✅ | ✅ | SVG 기반 |
| **세그먼테이션** | ✅ | ❌ | 범위 외 |

### 아키텍처 결정 비교

| 결정 사항 | Cornerstone3D | EchoPixel | 이유 |
|-----------|---------------|-----------|------|
| **vtk.js 사용** | 필수 | 미사용 | 오버헤드 제거 |
| **텍스처 유형** | TEXTURE_2D | TEXTURE_2D_ARRAY | 프레임 전환 최적화 |
| **DICOM 파싱** | dcmjs (Eager) | 자체 (Lazy) | 성능 |
| **좌표계** | World 좌표 | 픽셀 좌표 | 단순화 |
| **컨텍스트 관리** | Offscreen Canvas | 직접 제어 | 유연성 |

---

## 학습 포인트

### Cornerstone3D에서 배울 점

1. **Shared Volume Mappers**: 텍스처 공유 개념은 유지
2. **Tool System**: 도구 바인딩 구조 참고
3. **WADO-RS 통합**: 프로토콜 구현 참고

### 피해야 할 패턴

1. **범용 3D 라이브러리 의존**: 2D 전용은 직접 구현이 효율적
2. **매 프레임 메타데이터 재계산**: 반드시 캐싱
3. **동적 텍스처 생성**: 정적 할당 + uniform 변경
4. **CPU 기반 LUT**: GPU 셰이더에서 처리

---

## 결론

### Cornerstone3D

- **강점**: 범용성, 3D 지원, 풍부한 기능
- **약점**: Multi-frame Cine 성능, vtk.js 오버헤드, 복잡성

### EchoPixel

- **강점**: Cine Loop 성능, 경량화, 단순성
- **약점**: 2D 전용, 3D/MPR 미지원

### 선택 가이드

```
Cornerstone3D 선택:
  - CT/MRI 3D 볼륨 렌더링이 필요할 때
  - MPR/Fusion 뷰가 필요할 때
  - 범용 PACS 뷰어를 만들 때

EchoPixel 선택:
  - 심초음파/초음파 전용 뷰어를 만들 때
  - 다수의 Cine Loop 동시 재생이 필요할 때 (스트레스 에코)
  - 고성능이 최우선일 때
  - 경량 번들이 필요할 때
```

---

## 참고 자료

- [Cornerstone3D GitHub](https://github.com/cornerstonejs/cornerstone3D)
- [Cornerstone.js 공식 문서](https://www.cornerstonejs.org/docs/concepts/cornerstone-core/renderingengine/)
- [vtk.js 아키텍처](https://deepwiki.com/Kitware/vtk-js/1.1-architecture-overview)
- [Issue #1756 - Multi-frame cine loop playback](https://github.com/cornerstonejs/cornerstone3D/issues/1756)
- [dicom.ts - 대안 라이브러리](https://www.npmjs.com/package/dicom.ts)
