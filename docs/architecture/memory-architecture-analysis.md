# EchoPixel 메모리 아키텍처 분석

> **작성일**: 2026-01-19
> **목적**: Cornerstone3D vs EchoPixel 메모리 전략 비교 및 측정/AI 기능 지원 방안

---

## 배경

EchoPixel은 GPU-only 메모리 전략(Upload & Release)을 사용하여 Cornerstone3D 대비 **90%+ 메모리 절약**을 달성했습니다. 그러나 다음 기능들에 대한 지원 가능성 검토가 필요했습니다:

- 측정 도구 (거리, 각도, 면적)
- AI 측정 결과 오버레이 (좌표 기반)
- 일시정지 상태에서 DICOM 프레임과의 인터랙션

---

## Cornerstone3D vs EchoPixel 메모리 구조

### Cornerstone3D (3중 저장)

```
┌─────────────────────────────────────────────────────────────┐
│                    Cornerstone3D 메모리 구조                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ CPU Image Cache │  │ vtk.js 복사본   │  │ GPU Texture │ │
│  │                 │  │                 │  │             │ │
│  │ 원본 픽셀 보관   │→│ 렌더링용 복사   │→│ 최종 렌더링  │ │
│  │                 │  │                 │  │             │ │
│  │ ~300MB          │  │ ~300MB          │  │ ~300MB      │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│                                                             │
│  총 메모리: ~900MB (4개 DICOM 파일, 20MB 원본 기준)          │
└─────────────────────────────────────────────────────────────┘
```

**CPU 캐시 유지 이유:**
1. GPU VRAM 제한 (256MB~2GB)
2. WebGL 컨텍스트 손실 복구
3. 네트워크 재요청 비용 절감
4. 16-bit 원본 데이터 보존 (CT/MRI W/L 재계산)

### EchoPixel (GPU-only)

```
┌─────────────────────────────────────────────────────────────┐
│                    EchoPixel 메모리 구조                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   GPU VRAM                           │   │
│  │                                                      │   │
│  │  2D Array Texture (TEXTURE_2D_ARRAY)                │   │
│  │  - 모든 프레임을 레이어로 저장                        │   │
│  │  - uniform으로 프레임 전환 (바인딩 불필요)            │   │
│  │                                                      │   │
│  │  ~100-200MB (4개 DICOM 파일 기준)                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  CPU 메모리: 디코딩 직후 ImageBitmap.close() 호출           │
│  총 메모리: ~100-200MB (Cornerstone 대비 ~90% 절약)         │
└─────────────────────────────────────────────────────────────┘
```

**Upload & Release 패턴:**
```typescript
// MultiViewport.tsx
textureManager.uploadAllFrames(decodedFrames);
decodedFrames.forEach((bmp) => bmp.close()); // 즉시 해제!
```

---

## sonix-viviane 분석: 측정 도구가 실제로 필요로 하는 데이터

### 분석 대상 파일

| 파일 | 라인 수 | 역할 |
|------|--------|------|
| `LineTool.tsx` | ~2,233 | 거리/라인 측정 도구 |
| `AnnotationManager.tsx` | ~2,535 | 어노테이션 관리 |
| `DicomEchoViewer.tsx` | ~730 | Strain 뷰어 |

### 핵심 발견: 픽셀 데이터 vs 메타데이터

**측정 도구가 접근하는 데이터:**

```typescript
// LineTool.tsx - 캘리브레이션 데이터 접근
const imageData = viewport.getImageData();
const ultrasoundRegions = imageData?.metadata?.UltrasoundRegion;
const physicalDeltaX = region.physicalDeltaX;
const physicalDeltaY = region.physicalDeltaY;
```

이 코드는 **픽셀 값**이 아닌 **DICOM 메타데이터**를 읽습니다.

### 데이터 유형별 분석

| 필요 데이터 | 출처 | CPU 픽셀 캐시 필요? |
|------------|------|-------------------|
| 좌표 변환 (World ↔ Canvas ↔ Pixel) | WebGL viewport 계산 | ❌ 불필요 |
| UltrasoundRegion 캘리브레이션 | DICOM 태그 (0018,6011) | ❌ 불필요 |
| physicalDeltaX/Y (물리적 거리) | DICOM 메타데이터 | ❌ 불필요 |
| 이미지 dimensions | DICOM 헤더 | ❌ 불필요 |
| B/M/D 모드 판별 | DICOM 태그 | ❌ 불필요 |
| **실제 픽셀 값 읽기** | 픽셀 데이터 | ⚠️ 특수 케이스만 |

### 기능별 픽셀 값 필요 여부

| 기능 | 픽셀 값 필요? | 대안 |
|------|-------------|------|
| 거리 측정 | ❌ | 좌표 변환 + UltrasoundRegion 캘리브레이션 |
| 각도 측정 | ❌ | 좌표 변환만 필요 |
| AI 결과 오버레이 | ❌ | 좌표만 필요 (서버에서 계산 완료) |
| Strain Contour | ❌ | 좌표 배열만 필요 |
| ROI 통계 (Mean, StdDev) | ⚠️ 필요 | GPU readPixels 또는 서버 계산 |
| 히스토그램 | ⚠️ 필요 | GPU compute shader 또는 서버 |

> **참고**: 심초음파 특성상 ROI 통계/히스토그램은 거의 사용하지 않음

---

## 결론: GPU-only 전략 유효성

### 기존 주장 수정

| 기존 주장 | 수정된 분석 |
|----------|------------|
| "Cine 재생은 원본 픽셀 불필요" | **대부분의 측정/AI 기능도 메타데이터만 필요** |

### EchoPixel 권장 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│              EchoPixel 메모리 아키텍처 (권장안)              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐    ┌───────────────────────────┐  │
│  │ GPU VRAM            │    │ CPU 메모리 (경량)          │  │
│  │                     │    │                           │  │
│  │ 2D Array Texture    │    │ DicomMetadataCache:       │  │
│  │ (픽셀 데이터)        │    │ ├─ UltrasoundRegion[]     │  │
│  │                     │    │ ├─ physicalDeltaX/Y       │  │
│  │ ~100-200MB          │    │ ├─ ImageDimensions        │  │
│  │                     │    │ ├─ FrameTime              │  │
│  └─────────────────────┘    │ └─ PixelSpacing           │  │
│                             │                           │  │
│                             │ ~1-5MB (태그만)           │  │
│                             └───────────────────────────┘  │
│                                                             │
│  총 메모리: ~105-205MB (Cornerstone 대비 ~90% 절약 유지)    │
└─────────────────────────────────────────────────────────────┘
```

---

## 구현 권장사항

### 1. DicomMetadataCache 구현 (Phase 3 준비)

```typescript
interface DicomMetadataCache {
  // 이미지 기본 정보
  dimensions: { width: number; height: number };
  frameCount: number;
  frameTime: number;

  // 캘리브레이션 정보
  ultrasoundRegions?: UltrasoundRegion[];
  pixelSpacing?: [number, number];

  // 모드 정보
  imageType?: string[]; // B-mode, M-mode, Doppler 등
}

interface UltrasoundRegion {
  regionSpatialFormat: number;
  regionDataType: number;
  regionLocationMinX0: number;
  regionLocationMinY0: number;
  regionLocationMaxX1: number;
  regionLocationMaxY1: number;
  physicalDeltaX: number;
  physicalDeltaY: number;
  physicalUnitsXDirection: number;
  physicalUnitsYDirection: number;
}
```

### 2. CoordinateTransformer 구현 (Phase 3)

```typescript
interface CoordinateTransformer {
  // 좌표 변환
  canvasToPixel(canvasPoint: Point2D): Point2D;
  pixelToCanvas(pixelPoint: Point2D): Point2D;
  pixelToPhysical(pixelPoint: Point2D, region?: UltrasoundRegion): Point2D;

  // 거리 계산
  calculatePhysicalDistance(p1: Point2D, p2: Point2D): number;
}
```

### 3. 극히 드문 픽셀 값 접근 대응

```typescript
// 필요시 GPU에서 픽셀 읽기 (ROI 통계 등)
function readPixelsFromGPU(
  gl: WebGL2RenderingContext,
  x: number, y: number,
  width: number, height: number
): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}
```

---

## 요약

| 항목 | Cornerstone3D | EchoPixel (권장) |
|------|--------------|------------------|
| 픽셀 데이터 저장 | CPU + vtk.js + GPU (3중) | GPU only |
| 메타데이터 저장 | CPU (픽셀과 함께) | CPU (별도 캐시) |
| 메모리 사용량 | ~900MB | ~105-205MB |
| 측정 도구 지원 | ✅ | ✅ (메타데이터 캐시로) |
| AI 오버레이 지원 | ✅ | ✅ (좌표만 필요) |
| ROI 통계 | ✅ | ⚠️ gl.readPixels 필요 |

**최종 결론**: EchoPixel의 GPU-only 전략은 **측정 도구 및 AI 기능을 지원하면서도 90%+ 메모리 절약을 유지**할 수 있습니다. 핵심은 **픽셀 데이터와 메타데이터를 분리**하여 메타데이터만 CPU에 캐싱하는 것입니다.

---

## 심초음파 비트 깊이 분석

### 일반적인 경우: 8-bit

| 모드 | 일반적 비트 깊이 | 이유 |
|------|----------------|------|
| B-mode (2D) | 8-bit | 디스플레이용 grayscale |
| M-mode | 8-bit | 동일 |
| Color Doppler | 8-bit RGB | 컬러 오버레이 |
| Cine Loop | 8-bit JPEG | 용량 최적화 (수십~수백 프레임) |

**대부분의 임상 DICOM은 8-bit JPEG 압축**으로 저장됩니다.

### 예외: 8-bit 초과 케이스

| 케이스 | 비트 깊이 | 용도 |
|--------|----------|------|
| **Raw/RF 데이터** | 12-16 bit | 연구용, Speckle Tracking 원본 |
| **IQ 데이터** | 16+ bit | 신호 처리 연구 |
| **고급 장비 내보내기** | 10-12 bit | 일부 GE, Philips 고급 옵션 |
| **Lossless 압축** | 10-16 bit | 연구/아카이브 목적 |

### 실무적 결론

```
임상 환경 (99%+):
├── JPEG 압축 (Transfer Syntax: 1.2.840.10008.1.2.4.50)
├── Bits Stored: 8
└── EchoPixel GPU-only 전략에 문제 없음

연구/특수 환경 (1% 미만):
├── Raw RF / IQ 데이터
├── Bits Stored: 12-16
└── gl.readPixels 8-bit 한계가 문제될 수 있음
```

---

## 미래 확장: 16-bit 지원 계획

> **목적**: 연구용/고급 장비 지원 및 CT/MRI 확장 가능성 확보

### WebGL2 16-bit 텍스처 지원

WebGL2는 16-bit 텍스처를 네이티브로 지원합니다:

```typescript
// 현재 (8-bit)
gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, ...);

// 16-bit 지원 (미래)
gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R16UI, ...);  // 16-bit unsigned int
gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R16F, ...);   // 16-bit float
```

### 아키텍처 비교

```
현재 (8-bit 경로):
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ DICOM 16-bit│ →  │ CPU W/L 적용  │ →  │ GPU 8-bit   │
│ 원본        │    │ 8-bit 변환   │    │ 텍스처      │
└─────────────┘    └──────────────┘    └─────────────┘
                         ↑
                   W/L 변경 시 재디코딩 필요

미래 (16-bit 경로):
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ DICOM 16-bit│ →  │ GPU 16-bit   │ →  │ Shader W/L  │
│ 원본        │    │ 텍스처       │    │ 실시간 적용  │
└─────────────┘    └──────────────┘    └─────────────┘
                                             ↑
                                    W/L 변경이 즉시 반영!
```

### 16-bit 전환 시 장점

| 항목 | 현재 (8-bit) | 미래 (16-bit) |
|------|-------------|---------------|
| W/L 변경 | CPU 재디코딩 필요 | **GPU에서 즉시** |
| 동적 W/L 범위 | 제한적 | **전체 범위 가능** |
| CT/MRI 지원 | ❌ | ✅ |
| 메모리 사용 | 기준 | 2배 (픽셀당) |

### 구현 계획 (호환성 유지)

```typescript
// TextureManager 확장 인터페이스
interface TextureUploadOptions {
  bitDepth: 8 | 16;  // 기본값 8
  format: 'grayscale' | 'rgb';
}

class TextureManager {
  upload(image: ImageBitmap | Uint16Array, options?: TextureUploadOptions) {
    if (options?.bitDepth === 16) {
      // R16UI 포맷 사용
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R16UI, ...);
    } else {
      // 기존 RGBA8 경로 (하위 호환)
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, ...);
    }
  }
}
```

```glsl
// Fragment Shader (16-bit W/L 적용)
uniform highp usampler2DArray u_texture;  // 16-bit unsigned
uniform float u_windowCenter;
uniform float u_windowWidth;

void main() {
  uint rawValue = texture(u_texture, vec3(v_texCoord, u_layer)).r;
  float normalized = (float(rawValue) - u_windowCenter) / u_windowWidth + 0.5;
  fragColor = vec4(vec3(clamp(normalized, 0.0, 1.0)), 1.0);
}
```

### 구현 우선순위

| 질문 | 답변 |
|------|------|
| 16-bit 지원 가능? | ✅ WebGL2에서 가능 |
| 현재 구조 유지? | ✅ 확장 형태로 추가 |
| 구현 시점 | Phase 3+ (측정 도구 이후) |
| 우선순위 | 낮음 (심초음파 99%가 8-bit) |

**권장**: 현재 아키텍처를 16-bit 확장 가능하게 **인터페이스만 설계**해두고, 실제 구현은 필요 시점에 진행

---

## 보완 필요 사항

### 1. WebGL Context Loss 복구 전략

현재 EchoPixel은 CPU 메모리를 해제하므로, GPU 컨텍스트 손실 시 복구 방안 필요:

```
문제 시나리오:
1. DICOM 로드 → GPU 업로드 → CPU 해제
2. 사용자가 다른 탭으로 이동 (GPU 메모리 회수)
3. 다시 돌아옴 → WebGL context lost!
4. 복구하려면 픽셀 데이터 필요 → CPU에 없음!
```

**복구 전략 옵션:**
```typescript
interface RecoveryStrategy {
  // 옵션 1: 서버 재요청 (네트워크 비용)
  refetchFromServer?: boolean;

  // 옵션 2: 압축 데이터 유지 (원본 Uint8Array 보관, ~50% 절약)
  keepCompressedData?: boolean;

  // 옵션 3: IndexedDB 캐싱 (디스크 기반)
  useIndexedDB?: boolean;
}
```

### 2. GPU VRAM 한계 대응

16개 뷰포트 시나리오 (스트레스 에코)에서:

```
16 viewports × 60 frames × 800×600 × 4 bytes = ~1.8GB VRAM
```

일부 GPU에서 VRAM 초과 가능.

**대응 전략:**
- LRU 캐시로 오래된 텍스처 해제
- 화면에 보이는 뷰포트만 텍스처 유지
- 저해상도 썸네일 + On-demand 고해상도 로딩

### 3. gl.readPixels 한계

```typescript
// gl.readPixels는 렌더링된 8-bit 결과를 읽음
gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
// → 원본 16-bit 픽셀 값 복원 불가!
```

> **주의**: ROI 통계 등에서 16-bit 원본 값이 필요한 경우,
> 16-bit 텍스처 경로 구현 후 별도 readPixels 로직 필요

---

## 관련 문서

- [아키텍처 개요](./overview.md)
- [성능 전략](../design/performance-strategy.md)
- [구현 로드맵](../roadmap/implementation-phases.md)
