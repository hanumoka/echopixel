# EchoPixel 구현 로드맵

## 전체 개요

| Phase | 목표 | 상태 |
|-------|------|------|
| 1 | Foundation (단일 뷰포트 cine 재생) | ✅ 완료 |
| 2 | Multi-Viewport & Quality | ✅ 완료 |
| 2.5 | Robustness (안정성 강화) | ✅ 완료 |
| 2.6 | @echopixel/react 멀티 뷰어 | ✅ 완료 |
| 2.7 | Multi Viewport Rotation/Flip | ⏳ 대기 |
| 3 | Annotations | ⏳ 대기 |
| 4 | Plugin System & Extensions | ⏳ 대기 |
| 5 | Release | ⏳ 대기 |

### 성능 목표

| 메트릭 | 목표 |
|--------|------|
| 동시 뷰포트 | **16개** |
| 프레임 레이트 | **30fps+** |
| GPU 메모리 | **<1.5GB** |
| 동기화 지연 | **<16ms** |
| 프레임 드롭 | **<1%** |

---

## Phase 1: Foundation ✅ 완료

### 작업 항목

#### 프로젝트 설정 ✅
- [x] 모노레포 구조 초기화 (pnpm workspace)
- [x] Vite + TypeScript 설정
- [x] ESLint + Prettier 설정
- [ ] Vitest 테스트 환경 (보류)

#### DICOM 파서 ✅
- [x] DICOM Part 10 기본 파싱
- [x] 심초음파 메타데이터 추출 (Frame Time, Number of Frames)
- [x] 멀티프레임 픽셀 데이터 분리

#### 픽셀 디코더 ✅
- [x] WebCodecs ImageDecoder (하드웨어 가속)
- [x] createImageBitmap 폴백 (Safari)
- [x] Uncompressed (Native) 지원
- [ ] Web Worker 기반 디코딩 (Phase 2로 이동)

#### WebGL 렌더러 ✅
- [x] WebGL2 컨텍스트 초기화
- [x] 텍스처 업로드 (TextureManager)
- [x] VOI LUT Fragment shader
- [x] 기본 렌더 루프 (QuadRenderer)

#### React 컴포넌트 ✅
- [x] `<DicomViewport>` 기본 컴포넌트
- [x] Window/Level 마우스 인터랙션
- [x] 키보드 단축키 (Space, 방향키, R)

#### Cine 재생 ✅
- [x] requestAnimationFrame 기반 타이머
- [x] Play/Pause/Stop 제어
- [x] 가변 FPS 지원 (1-60)

#### DataSource ✅
- [x] DataSource 인터페이스 정의
- [x] LocalFileDataSource
- [x] WadoRsDataSource (캐싱, 재시도, 중복 방지)

#### 반응형 기초 ✅
- [x] ResizeObserver 기반 크기 감지
- [x] DPI/devicePixelRatio 감지
- [x] 캔버스 해상도 자동 조정

#### 네트워크 기초 ✅
- [x] LRU 메모리 캐시
- [x] 기본 재시도 로직 (지수 백오프)

#### 에러 처리 기초 ✅
- [x] 로딩/에러 상태 UI 컴포넌트
- [x] 디코딩 폴백 (WebCodecs → createImageBitmap)
- [x] 네트워크 에러 재시도

---

## Phase 2: Multi-Viewport & Quality ✅ 완료

### 작업 항목

#### Single Canvas 아키텍처 ✅
- [x] 전체 화면 캔버스 생성
- [x] Scissor/Viewport 영역 분할
- [x] DOM 요소와 렌더링 영역 매핑

#### 2D Array Texture ✅
- [x] GL_TEXTURE_2D_ARRAY 생성
- [x] 프레임 시퀀스 업로드
- [x] Layer 인덱스로 프레임 선택
- [x] texSubImage3D (레이어 단위 업데이트)

#### ViewportManager ✅
- [x] 뷰포트 인스턴스 관리
- [x] 레이아웃 시스템 (1x1, 2x2, 3x3, 4x4)
- [x] 뷰포트 추가/제거

#### FrameSyncEngine ✅
- [x] SyncGroup 뷰포트 그룹화
- [x] Frame Ratio 동기화 (기본)
- [ ] R-wave 동기화 (계획)
- [ ] Time 동기화 (계획)

#### RenderScheduler ✅
- [x] 단일 requestAnimationFrame 루프
- [x] FPS 기반 프레임 업데이트
- [x] 렌더링 통계

#### React 통합 ✅
- [x] MultiViewport 컴포넌트
- [x] MultiCanvasGrid 컴포넌트 (비교용)

#### @echopixel/react 패키지 ✅ 완료
- [x] Building Blocks 컴포넌트 ✅
  - DicomCanvas (WebGL 렌더링 + Rotation)
  - DicomControls (재생/정지, FPS, 프레임 슬라이더)
  - DicomStatusBar (상태 표시 + Rotation)
  - DicomToolInfo (도구 안내)
  - DicomToolbar (도구 선택 + 90° 회전/플립 버튼)
  - DicomMiniOverlay (간소화 오버레이)
  - HybridViewportGrid (Canvas + DOM Grid 레이어링)
  - HybridViewportSlot (DOM 슬롯)
- [x] SingleDicomViewer (Building Blocks 조합) ✅
- [x] SingleDicomViewerGroup (다중 SingleDicomViewer 그리드) ✅
- [x] HybridMultiViewport (demo → react 패키지 이동) ✅
- [x] Tool System 통합 (useToolGroup) ✅
- [x] OHIF 스타일 뷰포트 스타일링 ✅

**컴포넌트 구조 설계 (확정)**:
```
SingleDicomViewer        → 단일 뷰어, 풀 UI
SingleDicomViewerGroup   → 다중 SingleDicomViewer 그리드 (각자 캔버스)
HybridMultiViewport      → 대규모 뷰포트 (Single Canvas + DOM Overlay)
                           └─ disableOverlay 옵션으로 순수 렌더링 모드 지원
```

#### Hybrid DOM-WebGL 아키텍처 ✅
- [x] HybridViewportManager (DOM-WebGL 좌표 동기화)
- [x] ViewportSlot 컴포넌트 (DOM 오버레이)
- [x] HybridMultiViewport 컴포넌트
- [x] ResizeObserver 기반 좌표 동기화
- [x] DOM 이벤트와 WebGL 렌더링 분리

> 참고: `docs/architecture/multi-viewport-strategy-analysis.md`

#### Tool System ✅
- [x] BaseTool 추상 클래스 및 타입 시스템
- [x] ToolRegistry (전역 도구 등록)
- [x] ToolGroup (뷰포트별 도구 그룹)
- [x] ToolGroupManager (도구 그룹 관리)
- [x] 이벤트 정규화 (eventNormalizer)
- [x] 마우스 바인딩 시스템 (Primary, Secondary, Auxiliary, Wheel)
- [x] 키보드 수정자 지원 (Shift, Ctrl, Alt)

**기본 도구 (manipulation/)**:
- [x] WindowLevelTool (우클릭 드래그)
- [x] PanTool (중클릭 드래그)
- [x] ZoomTool (Shift+좌클릭 드래그, 휠)
- [x] StackScrollTool (휠 스크롤)

**React 통합**:
- [x] useToolGroup 훅 (도구 시스템 통합)
- [x] isStaticImage 옵션 (정지 이미지 모드)

#### 남은 작업 ⏳
- [x] 실제 DICOM 데이터 테스트 ✅
- [x] 16개 뷰포트 30fps 성능 검증 ✅ (60fps 달성)
- [ ] Progressive Quality Enhancement (PQE)
- [ ] QIDO-RS (검색)
- [ ] 디바이스 성능 감지
- [ ] OffscreenCanvas 렌더링 옵션
- [ ] H.264 스트림 옵션 (WebCodecs VideoDecoder)
- [ ] LOD 알고리즘
- [ ] 반응형 레이아웃 (브레이크포인트, 터치 제스처)
- [ ] 네트워크 고급 (프리페칭, 대역폭 감지, SW 캐싱)
  - [ ] WadoRsDataSource.pendingFrames 중복 요청 방지 (선언만 됨, 미구현)

---

## Phase 2.5: Robustness (안정성 강화) ✅ 완료

> **목표**: 프로덕션 환경에서의 안정성 확보
> - WebGL 컨텍스트 손실 복구
> - GPU 메모리 관리 최적화
> - 에러 복구 및 graceful degradation

### 작업 항목

#### WebGL Context Loss Recovery ✅
WebGL 컨텍스트가 손실될 때 (탭 전환, GPU 리셋 등) 자동 복구:

- [x] webglcontextlost / webglcontextrestored 이벤트 핸들러
- [x] seriesMap ref 기반 시리즈 재로드 (context 복구 시)
- [ ] CompressedFrameCache (LZ4/Brotli 압축 캐시) - 선택적, 미구현
- [ ] IndexedDB 백업 캐시 (선택적, 대용량/오프라인용) - 선택적, 미구현

**복구 방식 (현재 구현)**:
- DicomViewport: 현재 프레임 유지 후 자동 복구
- HybridMultiViewport: clearWithoutDispose() + 시리즈 재업로드

> 참고: `docs/architecture/memory-architecture-analysis.md`

#### LRU Texture Cache ✅
16개 뷰포트 동시 운영 시 GPU VRAM 관리:

- [x] TextureLRUCache (VRAM 기반 LRU 캐시)
- [x] VRAM 사용량 추적 (바이트 단위)
- [x] UI에 VRAM 사용량 표시
- [x] clearWithoutDispose() - Context Loss 복구용

**현재 설계**:
- Eviction 비활성화 (`Number.MAX_SAFE_INTEGER`)
- 이유: 모든 뷰포트가 화면에 표시되므로 eviction 시 검은 화면 발생

**Phase 3+ 선택적 확장**:
- [ ] IntersectionObserver 기반 가시성 감지
- [ ] "visible viewport" 인식으로 선택적 eviction
- [ ] 썸네일 텍스처 폴백 (VRAM 부족 시)

#### 대형 레이아웃 지원 ✅
- [x] 5x5, 6x6, 7x7, 8x8 레이아웃 추가
- [x] VRAM 스트레스 테스트 가능

#### 메모리 모니터링 ⏳ (선택적)
- [ ] GPU 메모리 사용량 대시보드 (개발자용)
- [ ] 메모리 경고 시스템
- [ ] 자동 GC 트리거

---

## Phase 2.7: Multi Viewport Rotation/Flip ⏳ 대기

> **목표**: Multi 모드에서 각 뷰포트별 Rotation/Flip 지원
> - SingleDicomViewer와 동일한 도구 지원
> - 각 DICOM마다 독립적인 회전/플립 제어

### 배경

현재 SingleDicomViewer에만 Rotation(90°)/Flip(H/V) 기능이 구현됨.
Multi 모드(HybridMultiViewport, MultiCanvasGrid)에서는 미지원.
의료 영상에서 각 뷰포트별 회전/플립은 필수 기능.

### 작업 항목

#### HybridMultiViewport Rotation/Flip
- [ ] Viewport 상태에 rotation, flipH, flipV 추가
- [ ] ArrayTextureRenderer에 rotation/flip 셰이더 지원
- [ ] DicomMiniOverlay 또는 컨텍스트 메뉴에 회전/플립 UI 추가
- [ ] 키보드 단축키 지원 (R: 회전, H: 가로플립, V: 세로플립)
- [ ] resetViewport에 rotation/flip 초기화 포함

#### MultiCanvasGrid Rotation/Flip
- [ ] DicomViewport에 rotation/flip 상태 추가
- [ ] compact 모드에서 미니 도구 UI 또는 키보드 지원

#### 구현 방식 옵션

**Option A**: CSS Transform 방식 (SingleDicomViewer 방식)
- 장점: 구현 간단, GPU 가속
- 단점: Single Canvas에서 각 뷰포트별 적용 어려움

**Option B**: Shader 방식 (권장)
- 장점: Single Canvas에서 각 뷰포트별 독립 적용 가능
- 구현: Vertex Shader에서 UV 좌표 변환

```glsl
// rotation/flip을 위한 UV 변환
vec2 transformUV(vec2 uv, float rotation, bool flipH, bool flipV) {
  vec2 center = vec2(0.5);
  vec2 centered = uv - center;

  // Flip
  if (flipH) centered.x = -centered.x;
  if (flipV) centered.y = -centered.y;

  // Rotation (90° 단위)
  float rad = radians(rotation);
  float c = cos(rad);
  float s = sin(rad);
  centered = vec2(c * centered.x - s * centered.y, s * centered.x + c * centered.y);

  return centered + center;
}
```

---

## Phase 3: Annotations ⏳ 대기

> **아키텍처**: DOM Overlay 기반 (Hybrid DOM-WebGL 활용)
> - SVG 오버레이는 WebGL Canvas 위의 DOM 레이어에 렌더링
> - Cornerstone3D SVGDrawingHelper 패턴 참고

### 작업 항목

#### 좌표 변환 시스템 (선행 작업)
어노테이션 구현 전 필수 인프라:

- [ ] CoordinateTransformer 클래스
  - Screen → Canvas 변환
  - Canvas → Viewport (정규화 좌표)
  - Viewport → DICOM Pixel (이미지 좌표)
  - DICOM Pixel → World (mm 단위)
- [ ] Pan/Zoom 상태 반영
- [ ] 역변환 지원 (World → Screen)

#### DicomMetadataCache ⏳
DICOM 메타데이터 캐싱 (좌표 변환, 측정에 필요):

- [ ] Pixel Spacing 추출 및 캐싱
- [ ] Image Position/Orientation
- [ ] Calibration 정보

#### 어노테이션 엔진
- [ ] DOM Overlay 기반 SVG 레이어
- [ ] 핸들/그립 인터랙션 (DOM 이벤트 활용)
- [ ] 상태 머신 (생성/편집/선택)

#### 측정 도구
- [ ] 거리 측정 (2점 라인)
- [ ] 영역 측정 (타원, 다각형)
- [ ] Doppler Trace (속도 엔벨로프)
- [ ] 각도 측정 (3점)

#### 캘리브레이션
- [ ] Pixel Spacing 태그 활용
- [ ] 수동 캘리브레이션 도구

#### 직렬화
- [ ] JSON 내보내기/가져오기
- [ ] DICOM SR 생성
- [ ] STOW-RS 업로드

---

## Phase 4: Plugin System & Extensions ⏳ 대기

### 작업 항목

#### Plugin API
- [ ] 플러그인 인터페이스 정의
- [ ] 라이프사이클 훅 (onInstall, onActivate 등)
- [ ] PluginContext API 노출
- [ ] 이벤트 버스

#### 기본 플러그인
- [ ] MeasurementPlugin
- [ ] AIOverlayPlugin
- [ ] StrainVisualizationPlugin

#### React 통합
- [ ] usePlugin 훅
- [ ] 플러그인 설정 UI
- [ ] 동적 플러그인 로딩

#### 16-bit 텍스처 지원 (미래 확장)
> **참고**: 심초음파의 99%+ 임상 데이터는 8-bit JPEG.
> 16-bit는 연구용/특수 케이스에만 필요.

**구현 작업**:
- [ ] R16UI 텍스처 포맷 지원
- [ ] R16F 텍스처 포맷 지원 (HDR용)
- [ ] 16-bit 전용 Fragment Shader
- [ ] RawPixelDecoder 16-bit 처리

**인터페이스 설계** (선행 가능):
```typescript
interface TextureFormat {
  type: 'R8' | 'R16UI' | 'R16F' | 'RGBA8';
  bitsPerSample: 8 | 16;
  internalFormat: GLenum;
}
```

> 상세: `docs/architecture/memory-architecture-analysis.md` 섹션 10

---

## Phase 5: Release ⏳ 대기

### 작업 항목

#### 멀티 벤더 테스트
- [ ] GE 장비 DICOM 테스트
- [ ] Philips 장비 DICOM 테스트
- [ ] Siemens 장비 DICOM 테스트
- [ ] Canon 장비 DICOM 테스트

#### 추가 코덱
- [ ] JPEG-LS (CharLS WASM)
- [ ] JPEG2000 (OpenJPEG WASM)
- [ ] RLE

#### 접근성
- [ ] 키보드 네비게이션
- [ ] ARIA 레이블

#### 문서화
- [ ] Storybook 컴포넌트 데모
- [ ] TypeDoc API 문서
- [ ] Getting Started 가이드

#### 배포
- [ ] npm 패키지 구성
- [ ] ESM + CJS 듀얼 빌드
- [ ] GitHub Actions CI/CD
- [ ] npm v1.0.0 배포

---

## 아키텍처 원칙

### Tiered Rendering 전략

복잡한 UI에서 WebGL과 DOM의 역할을 명확히 분리:

| Tier | 영역 | 기술 | 이유 |
|------|------|------|------|
| **Tier 1** | 메인 뷰포트 (고정) | Single Canvas + Scissor | 16개 30fps 보장 |
| **Tier 2** | 썸네일 (스크롤) | `<img>` 또는 Canvas 2D | 스크롤 드리프트 방지 |
| **Tier 3** | 차트/그래프 | SVG, Canvas 2D | 비 DICOM 데이터 |

### 핵심 원칙

1. **스크롤 영역에는 WebGL Single Canvas 사용 안 함**
   - 스크롤 즉시 발생 vs WebGL은 다음 rAF 대기 → 드리프트 발생
   - 썸네일 패널은 `<img>` 또는 Canvas 2D 사용

2. **메인 뷰포트는 고정 영역에 배치**
   - Single Canvas + Scissor 방식 유지
   - DOM Overlay로 이벤트/어노테이션 처리

> 상세 분석: `docs/architecture/multi-viewport-strategy-analysis.md`

---

## 의존성 차트

```
Phase 1 (Foundation) ✅
    │
    ├── DICOM Parser ✅ ──┬── Pixel Decoder ✅
    │                     │
    └── WebGL Renderer ✅ ┴── React Viewport ✅
                                    │
                                    v
Phase 2 (Multi-Viewport) ✅ ─────────────────────
    │
    ├── Single Canvas ✅ ──┬── 2D Array Texture ✅
    │                      │
    ├── ViewportManager ✅ ┼── FrameSyncEngine ✅
    │                      │
    ├── Hybrid DOM-WebGL ✅ ┼── Tool System ✅
    │                      │
    └── useToolGroup ✅ ───┴── DOM Overlay Layer ✅
                                    │
                                    v
Phase 2.5 (Robustness) ✅ ───────────────────────
    │
    ├── Context Loss Recovery ✅
    │   └── seriesMap ref 기반 재로드
    │
    ├── LRU Texture Cache ✅
    │   └── VRAM 추적 (eviction 비활성화)
    │
    └── @echopixel/react 🔄
        ├── Building Blocks ✅ (Canvas, Controls, StatusBar, ToolInfo, Toolbar)
        ├── SingleDicomViewer ✅ (조합형 뷰어)
        ├── DicomMiniOverlay ⏳ (간소화 오버레이)
        ├── SingleDicomViewerGroup ⏳ (다중 뷰어 그리드)
        └── HybridMultiViewport ⏳ (demo → react 이동)
                                    │
                                    v
Phase 3 (Annotations) ⏳ ────────────────────────
    │
    ├── CoordinateTransformer (선행)
    ├── DicomMetadataCache
    └── SVG Overlay Layer
                                    │
                                    v
Phase 4 (Plugin & Extensions) ⏳ ────────────────
    │
    ├── Plugin API
    └── 16-bit Texture 지원 (미래)
                                    │
                                    v
Phase 5 (Release) ⏳ ────────────────────────────
```

---

## 위험 요소

| 위험 | 영향 | 완화 방안 | 상태 |
|------|------|-----------|------|
| WebGL 컨텍스트 제한 (8-16개) | 멀티뷰포트 제한 | Single Canvas 방식 | ✅ 해결 |
| Safari WebCodecs 미지원 | 일부 성능 저하 | createImageBitmap 폴백 | ✅ 구현 |
| GPU 메모리 부족 | 성능 저하 | LRU 캐시 | ✅ 구현 |
| 스크롤 영역 WebGL 드리프트 | UI 불일치 | Tiered Rendering 전략 | ✅ 설계 완료 |
| WebGL 컨텍스트 손실 | 화면 블랙아웃 | 시리즈 재로드 복구 | ✅ 구현 |
| VRAM 초과 (16 뷰포트) | 렌더링 실패/지연 | TextureLRUCache (추적) | ✅ 구현 |
| gl.readPixels 8-bit 제한 | 16-bit 데이터 손실 | 8-bit 유지 (임상 99%+) | ✅ 설계 확정 |
| 벤더별 DICOM 차이 | 호환성 이슈 | 다양한 샘플 테스트 | ⏳ Phase 5 |

### 위험 완화 상세

#### WebGL 컨텍스트 손실 ✅ 구현 완료
- **발생 원인**: 탭 전환, GPU 드라이버 리셋, 메모리 부족
- **현재 구현**:
  - DicomViewport: 현재 프레임 유지 후 자동 복구
  - HybridMultiViewport: clearWithoutDispose() + seriesMap 재로드
- **향후 확장** (선택적):
  - 압축 캐시 (LZ4/Brotli)
  - IndexedDB 백업 캐시
- **참고**: `docs/architecture/memory-architecture-analysis.md`

#### VRAM 관리 ✅ 구현 완료
- **추정 VRAM**: 16개 뷰포트 × 100프레임 × 512×512 ≈ 400MB
- **현재 구현**: TextureLRUCache로 VRAM 사용량 추적 및 표시
- **설계 결정**: Eviction 비활성화 (모든 뷰포트가 visible하므로)
- **확장 계획**: Phase 3+에서 가시성 기반 선택적 eviction 추가
