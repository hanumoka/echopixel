# EchoPixel 메모리 아키텍처 분석

> **작성일**: 2026-01-19
> **최종 수정**: 2026-01-19
> **상태**: 전략 확정, 구현 예정
> **목적**: Cornerstone3D vs EchoPixel 메모리 전략 비교 및 복구/확장 전략 수립

---

## 1. 개요

### 1.1 배경

EchoPixel은 GPU-only 메모리 전략(Upload & Release)을 사용하여 Cornerstone3D 대비 **90%+ 메모리 절약**을 달성했습니다.

### 1.2 검토 필요 기능

- 측정 도구 (거리, 각도, 면적)
- AI 측정 결과 오버레이 (좌표 기반)
- 일시정지 상태에서 DICOM 프레임과의 인터랙션
- WebGL 컨텍스트 손실 복구
- GPU VRAM 한계 대응

---

## 2. Cornerstone3D vs EchoPixel 메모리 구조

### 2.1 Cornerstone3D (3중 저장)

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

### 2.2 EchoPixel (GPU-only)

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

## 3. 측정 도구 분석 (sonix-viviane 기반)

### 3.1 핵심 발견: 픽셀 데이터 vs 메타데이터

**측정 도구가 접근하는 데이터:**

```typescript
// LineTool.tsx - 캘리브레이션 데이터 접근
const imageData = viewport.getImageData();
const ultrasoundRegions = imageData?.metadata?.UltrasoundRegion;
const physicalDeltaX = region.physicalDeltaX;
const physicalDeltaY = region.physicalDeltaY;
```

이 코드는 **픽셀 값**이 아닌 **DICOM 메타데이터**를 읽습니다.

### 3.2 데이터 유형별 분석

| 필요 데이터 | 출처 | CPU 픽셀 캐시 필요? |
|------------|------|-------------------|
| 좌표 변환 (World ↔ Canvas ↔ Pixel) | WebGL viewport 계산 | ❌ 불필요 |
| UltrasoundRegion 캘리브레이션 | DICOM 태그 (0018,6011) | ❌ 불필요 |
| physicalDeltaX/Y (물리적 거리) | DICOM 메타데이터 | ❌ 불필요 |
| 이미지 dimensions | DICOM 헤더 | ❌ 불필요 |
| B/M/D 모드 판별 | DICOM 태그 | ❌ 불필요 |
| **실제 픽셀 값 읽기** | 픽셀 데이터 | ⚠️ 특수 케이스만 |

### 3.3 기능별 픽셀 값 필요 여부

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

## 4. 심초음파 비트 깊이 분석

### 4.1 일반적인 경우: 8-bit

| 모드 | 일반적 비트 깊이 | 이유 |
|------|----------------|------|
| B-mode (2D) | 8-bit | 디스플레이용 grayscale |
| M-mode | 8-bit | 동일 |
| Color Doppler | 8-bit RGB | 컬러 오버레이 |
| Cine Loop | 8-bit JPEG | 용량 최적화 (수십~수백 프레임) |

**대부분의 임상 DICOM은 8-bit JPEG 압축** (Transfer Syntax: 1.2.840.10008.1.2.4.50)

### 4.2 예외: 8-bit 초과 케이스

| 케이스 | 비트 깊이 | 용도 | 비율 |
|--------|----------|------|------|
| **Raw/RF 데이터** | 12-16 bit | 연구용, Speckle Tracking 원본 | <1% |
| **IQ 데이터** | 16+ bit | 신호 처리 연구 | <0.1% |
| **고급 장비 내보내기** | 10-12 bit | 일부 GE, Philips 고급 옵션 | <1% |
| **Lossless 압축** | 10-16 bit | 연구/아카이브 목적 | <1% |

### 4.3 실무적 결론

```
임상 환경 (99%+):
├── JPEG 압축 (Transfer Syntax: 1.2.840.10008.1.2.4.50)
├── Bits Stored: 8
└── EchoPixel GPU-only 전략에 문제 없음

연구/특수 환경 (1% 미만):
├── Raw RF / IQ 데이터
├── Bits Stored: 12-16
└── 16-bit 경로 필요 (미래 확장)
```

---

## 5. 권장 아키텍처

### 5.1 최종 권장안

```
┌─────────────────────────────────────────────────────────────┐
│              EchoPixel 메모리 아키텍처 (최종안)              │
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
│                             │ CompressedCache (선택적): │  │
│                             │ └─ 압축된 원본 (복구용)    │  │
│                             │                           │  │
│                             │ ~20-50MB (압축 데이터)    │  │
│                             └───────────────────────────┘  │
│                                                             │
│  총 메모리: ~120-250MB (Cornerstone 대비 ~75-85% 절약)      │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 비교 요약

| 항목 | Cornerstone3D | EchoPixel (권장) |
|------|--------------|------------------|
| 픽셀 데이터 저장 | CPU + vtk.js + GPU (3중) | GPU only |
| 메타데이터 저장 | CPU (픽셀과 함께) | CPU (별도 캐시) |
| 복구용 데이터 | CPU (전체 픽셀) | CPU (압축, 선택적) |
| 메모리 사용량 | ~900MB | ~120-250MB |
| 측정 도구 지원 | ✅ | ✅ (메타데이터 캐시로) |
| AI 오버레이 지원 | ✅ | ✅ (좌표만 필요) |
| Context Loss 복구 | ✅ (즉시) | ✅ (압축→디코딩) |
| ROI 통계 | ✅ | ⚠️ gl.readPixels 또는 서버 |

---

## 6. WebGL Context Loss 복구 전략 (확정)

### 6.1 문제 상황

```
┌─────────────────────────────────────────────────────────────────┐
│                    Context Loss 시나리오                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 정상 상태                                                    │
│     GPU Texture: ✅ 존재  |  CPU: (비어있음)                     │
│                                                                 │
│  2. Context Lost 발생                                           │
│     - 탭 전환 후 복귀                                           │
│     - GPU 드라이버 리셋                                          │
│     - 시스템 절전 모드                                           │
│     GPU Texture: ❌ 손실  |  CPU: (비어있음)                     │
│                                                                 │
│  3. 복구 필요 → 데이터 어디서?                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Context Loss 처리 (MDN 권장 패턴)

> 참고: [HandlingContextLost - WebGL Public Wiki](https://www.khronos.org/webgl/wiki/HandlingContextLost)

```typescript
// 필수: preventDefault() 호출로 자동 복구 활성화
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  // 모든 WebGL 리소스가 무효화됨
  // 렌더링 루프 중지
}, false);

canvas.addEventListener("webglcontextrestored", () => {
  // 모든 리소스 재생성 필요:
  // - 텍스처, 버퍼, 프레임버퍼
  // - 셰이더, 프로그램
  // - GL 상태 (clearColor, blendFunc 등)
  initWebGL();
  reloadTextures();
  startRenderLoop();
}, false);
```

### 6.3 복구 전략 비교 (확정)

| 전략 | CPU 메모리 | 복구 시간 | 오프라인 | 구현 난이도 | 결정 |
|------|----------|----------|---------|------------|------|
| 서버 재요청 | 0 | 2-10초 | ❌ | 쉬움 | 3순위 |
| 압축 캐시 | +20-50MB | 100-300ms | ✅ | 중간 | **1순위** |
| IndexedDB | +5MB | 100-500ms | ✅ | 어려움 | 2순위 |

### 6.4 하이브리드 복구 전략 (최종 확정)

```typescript
interface RecoveryStrategy {
  // 1순위: 압축 데이터 캐시 (메모리)
  compressedCache: Map<string, Uint8Array[]>;

  // 2순위: IndexedDB (대용량/오프라인)
  indexedDB?: IDBDatabase;

  // 3순위: 서버 재요청 (최후 수단)
  dataSource: DataSource;
}

async function recoverFromContextLoss(viewportId: string): Promise<void> {
  // 1. 압축 캐시 확인 (가장 빠름)
  if (compressedCache.has(viewportId)) {
    const compressed = compressedCache.get(viewportId)!;
    const frames = await decodeFrames(compressed);
    textureManager.uploadAllFrames(frames);
    return;
  }

  // 2. IndexedDB 확인 (디스크)
  const cached = await indexedDB?.get(viewportId);
  if (cached) {
    const frames = await decodeFrames(cached);
    textureManager.uploadAllFrames(frames);
    return;
  }

  // 3. 서버 재요청 (최후 수단)
  showRecoveryUI(); // 사용자에게 로딩 표시
  const frames = await dataSource.loadAllFrames(instanceId);
  textureManager.uploadAllFrames(frames);
}
```

### 6.5 IndexedDB 사용 시 주의사항

> 참고: [Solving IndexedDB Slowness | RxDB](https://rxdb.info/slow-indexeddb.html)

- **바이너리 데이터를 인덱싱하지 말 것** - 성능 급락 원인
- **트랜잭션 최소화** - 벌크 작업 사용
- **압축 적용** - Compression Streams API 활용
- **용량 제한 확인** - 브라우저별 상이 (Chrome ~60% 디스크)

---

## 7. GPU VRAM 한계 대응 (확정)

### 7.1 문제 상황

```
스트레스 에코 시나리오:
16 viewports × 60 frames × 800×600 × 4 bytes = ~1.84GB VRAM

┌──────────────────────────────────────────────────────────────┐
│  GPU VRAM 용량 (일반적)                                       │
├──────────────────────────────────────────────────────────────┤
│  통합 그래픽 (Intel/AMD APU): 128MB ~ 512MB  ← ❌ 부족!       │
│  저가형 외장 GPU: 1GB ~ 2GB                  ← ⚠️ 빠듯함      │
│  중급 외장 GPU: 4GB ~ 8GB                    ← ✅ 충분        │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 LRU 텍스처 캐시 (1순위 구현)

```typescript
class LRUTextureCache {
  private maxSize: number; // 예: 1GB
  private cache: Map<string, TextureEntry>;

  upload(viewportId: string, frames: ImageBitmap[]): void {
    const size = this.calculateSize(frames);

    // 용량 초과 시 LRU 정책으로 제거
    while (this.currentSize + size > this.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    this.cache.set(viewportId, {
      texture: this.createTexture(frames),
      size,
      lastUsed: Date.now()
    });
  }

  touch(viewportId: string): void {
    const entry = this.cache.get(viewportId);
    if (entry) entry.lastUsed = Date.now();
  }
}
```

### 7.3 가시성 기반 로딩 (선택적)

```typescript
// IntersectionObserver로 화면에 보이는 뷰포트만 텍스처 유지
class VisibilityManager {
  private observer: IntersectionObserver;
  private visible = new Set<string>();

  constructor() {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const id = entry.target.dataset.viewportId!;
        if (entry.isIntersecting) {
          this.visible.add(id);
          this.loadTexture(id);
        } else {
          this.visible.delete(id);
          // 필요시 텍스처 해제
        }
      });
    }, { threshold: 0.1 });
  }
}
```

### 7.4 VRAM 전략 비교

| 전략 | VRAM 사용 | 복잡도 | 사용자 경험 | 결정 |
|------|----------|--------|------------|------|
| 전체 로드 | 1.84GB | 낮음 | ✅ 즉시 | 고사양만 |
| **LRU 캐시** | 설정값 | 중간 | ⚠️ 캐시 미스 | **Phase 3** |
| 가시성 기반 | ~25% | 중간 | ⚠️ 스크롤 지연 | 선택적 |
| 썸네일 | ~10% | 높음 | ✅ 미리보기 | 선택적 |

---

## 8. 미래 확장: 16-bit 지원 계획

### 8.1 현재 vs 미래 아키텍처

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

### 8.2 WebGL2 16-bit 텍스처 지원

```typescript
// 현재 (8-bit)
gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, ...);

// 미래 (16-bit)
gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R16UI, ...);  // unsigned int
gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R16F, ...);   // float
```

### 8.3 16-bit Shader W/L

```glsl
// Fragment Shader (16-bit)
uniform highp usampler2DArray u_texture;  // 16-bit unsigned
uniform float u_windowCenter;
uniform float u_windowWidth;

void main() {
  uint rawValue = texture(u_texture, vec3(v_texCoord, u_layer)).r;
  float normalized = (float(rawValue) - u_windowCenter) / u_windowWidth + 0.5;
  fragColor = vec4(vec3(clamp(normalized, 0.0, 1.0)), 1.0);
}
```

### 8.4 구현 우선순위

| 항목 | 답변 |
|------|------|
| 16-bit 지원 가능? | ✅ WebGL2에서 가능 |
| 현재 구조 유지? | ✅ 확장 형태로 추가 |
| 구현 시점 | **Phase 4+** (Plugin 이후) |
| 우선순위 | 낮음 (심초음파 99%가 8-bit) |

---

## 9. gl.readPixels 한계

### 9.1 문제

```typescript
// gl.readPixels는 렌더링된 8-bit 결과만 읽음
gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
// → W/L 적용 후 8-bit 값
// → 원본 16-bit 픽셀 값 복원 불가!
```

### 9.2 영향

| 기능 | 영향 | 심초음파 사용 빈도 |
|------|------|------------------|
| ROI 평균값 | ⚠️ 8-bit 값만 | 거의 없음 |
| 히스토그램 | ⚠️ 8-bit 범위 | 거의 없음 |
| 픽셀 프로브 | ⚠️ 8-bit 값만 | 드물게 사용 |

### 9.3 대응 방안

1. **심초음파 8-bit 유지** (99% 케이스)
2. **서버 사이드 계산** (ROI 통계 필요시)
3. **16-bit 텍스처 경로** (미래 확장)

---

## 10. 구현 로드맵

### 10.1 Phase 2.5: 복구 전략 (예정)

| 항목 | 내용 | 우선순위 |
|------|------|---------|
| Context Loss 핸들링 | 이벤트 리스너 + 복구 로직 | P0 |
| 압축 캐시 | 원본 Uint8Array 보관 (선택적) | P1 |
| IndexedDB 캐시 | 대용량/오프라인 지원 | P2 |

### 10.2 Phase 3: 측정 도구 + 메모리 관리

| 항목 | 내용 | 우선순위 |
|------|------|---------|
| DicomMetadataCache | 측정용 메타데이터 | P0 |
| CoordinateTransformer | 좌표 변환 시스템 | P0 |
| LRU 텍스처 캐시 | VRAM 관리 | P1 |

### 10.3 Phase 4+: 확장

| 항목 | 내용 | 우선순위 |
|------|------|---------|
| 16-bit 텍스처 | 연구용/CT/MRI | P2 |
| GPU readPixels 16-bit | ROI 통계 | P3 |

---

## 11. 참고 자료

### 외부 문서
- [HandlingContextLost - WebGL Public Wiki](https://www.khronos.org/webgl/wiki/HandlingContextLost)
- [WebGL best practices - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- [Solving IndexedDB Slowness | RxDB](https://rxdb.info/slow-indexeddb.html)
- [IndexedDB Max Storage Limit | RxDB](https://rxdb.info/articles/indexeddb-max-storage-limit.html)

### 프로젝트 내부 문서
- [아키텍처 개요](./overview.md)
- [성능 전략](../design/performance-strategy.md)
- [구현 로드맵](../roadmap/implementation-phases.md)
