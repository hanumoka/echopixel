# EchoPixel 아키텍처 개요

## 시스템 구조

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EchoPixel Library                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐            │
│   │  React Layer │   │  Core Engine │   │  Data Layer  │            │
│   ├──────────────┤   ├──────────────┤   ├──────────────┤            │
│   │DicomViewport │◄─►│ViewportMgr   │◄─►│LocalFile DS  │            │
│   │MultiViewport │   │HybridVPMgr   │   │WadoRs DS     │            │
│   │HybridViewport│   │FrameSync     │   │LRU Cache     │            │
│   └──────────────┘   │RenderSched   │   └──────────────┘            │
│          │           └──────────────┘          │                     │
│          │                  │                  │                     │
│          ▼                  ▼                  ▼                     │
│   ┌─────────────────────────────────────────────────────────┐       │
│   │                     Tool System                          │       │
│   ├─────────────────────────────────────────────────────────┤       │
│   │ ToolRegistry │ ToolGroup │ BaseTool │ useToolGroup Hook │       │
│   │ WindowLevel  │ Pan       │ Zoom     │ StackScroll       │       │
│   └─────────────────────────────────────────────────────────┘       │
│          │                  │                  │                     │
│          ▼                  ▼                  ▼                     │
│   ┌─────────────────────────────────────────────────────────┐       │
│   │                  WebGL Renderer                          │       │
│   ├─────────────────────────────────────────────────────────┤       │
│   │ TextureManager │ QuadRenderer │ ArrayTextureRenderer    │       │
│   │ (2D / 2D Array)│ (single tex) │ (multi-frame)           │       │
│   └─────────────────────────────────────────────────────────┘       │
│                            │                                         │
│                            ▼                                         │
│   ┌─────────────────────────────────────────────────────────┐       │
│   │                  DICOM Services                          │       │
│   ├─────────────────────────────────────────────────────────┤       │
│   │  DicomParser  │  ImageDecoder  │  NativeDecoder         │       │
│   │  (tag parsing)│  (WebCodecs)   │  (raw pixels)          │       │
│   └─────────────────────────────────────────────────────────┘       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 패키지 구조 (현재 구현)

```
echopixel/
├── packages/
│   └── core/src/                 # 핵심 엔진 (@echopixel/core)
│       ├── index.ts              # 공개 API
│       ├── cache/
│       │   └── LRUCache.ts       # LRU 캐시
│       ├── datasource/
│       │   ├── types.ts          # DataSource 인터페이스
│       │   ├── LocalFileDataSource.ts
│       │   └── WadoRsDataSource.ts
│       ├── dicom/
│       │   ├── types.ts          # DICOM 타입 정의
│       │   ├── DicomParser.ts    # DICOM 파싱
│       │   ├── ImageDecoder.ts   # JPEG 디코딩 (WebCodecs)
│       │   └── NativeDecoder.ts  # 비압축 디코딩
│       ├── network/
│       │   ├── errors.ts         # NetworkError
│       │   └── retry.ts          # 재시도 로직
│       ├── sync/
│       │   ├── types.ts          # 동기화 타입
│       │   ├── FrameSyncEngine.ts # 프레임 동기화
│       │   └── RenderScheduler.ts # 렌더 스케줄러
│       ├── tools/                # Tool System
│       │   ├── types.ts          # 도구 타입 정의
│       │   ├── BaseTool.ts       # 추상 기본 클래스
│       │   ├── ToolRegistry.ts   # 전역 도구 등록
│       │   ├── ToolGroup.ts      # 뷰포트별 도구 그룹
│       │   ├── ToolManager.ts    # 도구 그룹 관리
│       │   ├── useToolGroup.ts   # React 훅
│       │   ├── eventNormalizer.ts # 이벤트 정규화
│       │   └── manipulation/     # 기본 도구
│       │       ├── WindowLevelTool.ts
│       │       ├── PanTool.ts
│       │       ├── ZoomTool.ts
│       │       └── StackScrollTool.ts
│       ├── viewport/
│       │   ├── types.ts          # 뷰포트 타입
│       │   ├── ViewportManager.ts # 뷰포트 관리
│       │   └── HybridViewportManager.ts # DOM-WebGL 좌표 동기화
│       └── webgl/
│           ├── shaders.ts        # GLSL 셰이더
│           ├── TextureManager.ts # 텍스처 관리
│           ├── QuadRenderer.ts   # 단일 텍스처 렌더러
│           └── ArrayTextureRenderer.ts # 배열 텍스처 렌더러
│
├── apps/
│   └── demo/src/                 # 데모 앱
│       ├── App.tsx               # 메인 앱
│       └── components/
│           ├── DicomViewport.tsx # 단일 뷰포트
│           ├── MultiViewport.tsx # 멀티뷰포트 (Phase 2)
│           ├── MultiCanvasGrid.tsx
│           └── HybridViewport/   # Hybrid DOM-WebGL
│               ├── HybridMultiViewport.tsx
│               ├── ViewportSlot.tsx
│               └── ViewportOverlay.tsx
│
└── docs/                         # 문서
```

---

## 핵심 모듈 설명

### 1. DICOM Services

#### DicomParser
- Explicit VR 바이너리 파싱 (DataView API)
- 태그 추출: Rows, Columns, Bits Allocated, Transfer Syntax
- 픽셀 데이터 추출 (Native + Encapsulated)
- 멀티프레임 분리 (Number of Frames 태그)

#### ImageDecoder
- **WebCodecs ImageDecoder** (하드웨어 가속, Chrome/Edge)
- **createImageBitmap** 폴백 (Safari 등)
- VideoFrame → ImageBitmap 변환

#### NativeDecoder
- 비압축 픽셀 데이터 디코딩
- Window/Level 변환
- 8-bit/16-bit grayscale, RGB, YBR_FULL 지원

---

### 2. WebGL Renderer

#### TextureManager
```typescript
// 단일 텍스처 (TEXTURE_2D)
uploadTexture(source: TexImageSource): void
bindTexture(unit: number): void

// 배열 텍스처 (TEXTURE_2D_ARRAY) - Phase 2
initializeArrayTexture(width, height, frameCount): void
uploadFrame(frameIndex, source): void
uploadAllFrames(frames): void
bindArrayTexture(unit): void
```

#### QuadRenderer
- 전체 화면 쿼드 렌더링
- Window/Level 셰이더 적용
- 단일 텍스처 모드

#### ArrayTextureRenderer
- `sampler2DArray` 셰이더 사용
- `u_currentFrame` uniform으로 프레임 선택
- 텍스처 바인딩 없이 프레임 전환 (uniform만 변경)

---

### 3. Multi-Viewport (Phase 2)

#### ViewportManager
- 그리드 레이아웃: 1x1, 2x2, 3x3, 4x4
- WebGL 좌표계 변환 (좌하단 원점)
- 텍스처 유닛 자동 할당 (최대 32개)
- 뷰포트 추가/제거, 상태 관리

#### RenderScheduler
- 단일 `requestAnimationFrame` 루프
- FPS 기반 프레임 업데이트
- `gl.scissor()` + `gl.viewport()` 영역 분할
- 렌더링 통계 (FPS, frameTime)

#### FrameSyncEngine
- **동기화 모드**:
  - `frame-ratio`: 프레임 비율 기반 (기본)
  - `time`: 절대 시간 기준 (계획)
  - `manual`: 사용자 정의
- 마스터-슬레이브 그룹 관리
- 계산: `slaveFrame = (masterFrame / masterTotal) * slaveTotal`

---

### 4. DataSource Layer

#### DataSource Interface
```typescript
interface DataSource {
  loadDicomFile(source: string): Promise<ArrayBuffer>
}
```

#### 구현체

| DataSource | 설명 |
|------------|------|
| LocalFileDataSource | 로컬 파일 (blob: URL) |
| WadoRsDataSource | WADO-RS 서버 통신, LRU 캐시, 재시도, 중복 요청 방지 |

---

### 5. Tool System

#### ToolRegistry
- 전역 도구 클래스 등록
- `addTool(ToolClass)`, `getTool(name)`, `hasTool(name)`

#### ToolGroup
- 뷰포트별 도구 그룹 관리
- 마우스 바인딩 설정 (Primary, Secondary, Auxiliary, Wheel)
- 키보드 수정자 지원 (Shift, Ctrl, Alt)
- 도구 모드: Active, Passive, Enabled, Disabled

#### 기본 도구 (manipulation/)
| 도구 | 기본 바인딩 | 설명 |
|------|-------------|------|
| WindowLevelTool | 우클릭 드래그 | Window/Level 조정 |
| PanTool | 중클릭 드래그 | 이미지 이동 |
| ZoomTool | Shift+좌클릭, 휠 | 확대/축소 |
| StackScrollTool | 휠 스크롤 | 프레임 전환 |

#### useToolGroup 훅
```typescript
const { toolGroup, setToolActive, resetAllViewports } = useToolGroup({
  toolGroupId: 'main',
  viewportManager,
  viewportElements,
  isStaticImage: false,  // 정지 이미지: 휠 → Zoom
});
```

---

### 6. React Components

#### DicomViewport
- 단일 DICOM 뷰포트
- Props: `frames`, `imageInfo`, `isEncapsulated`, `width`, `height`
- Window/Level 마우스 조정
- 키보드 단축키 (Space, 방향키)
- 반응형 옵션 (`responsive`, `maintainAspectRatio`)
- DPI 대응 (devicePixelRatio)

#### MultiViewport (Phase 2)
- 그리드 기반 멀티뷰포트
- ViewportManager + RenderScheduler + FrameSyncEngine 통합
- 동기화 재생, FPS 제어
- 뷰포트 선택, 통계 표시

#### HybridMultiViewport (Phase 2)
- **Hybrid DOM-WebGL 아키텍처**
- DOM 오버레이로 이벤트 처리 (ViewportSlot)
- WebGL로 고성능 렌더링 (Single Canvas)
- Tool System 통합 (useToolGroup)
- ResizeObserver 기반 좌표 동기화

---

## 데이터 흐름

```
User uploads DICOM file
        │
        ▼
isDicomFile() → parseDicom() → DicomDataset
        │
        ▼
extractPixelData() → PixelDataInfo (프레임별 Uint8Array)
        │
        ▼
isEncapsulated() ?
    ├─ Yes → decodeJpeg() → ImageBitmap
    └─ No  → decodeNative() → ImageBitmap
        │
        ▼
TextureManager.uploadAllFrames() → GPU 텍스처
        │
        ▼
ViewportManager.setLayout('grid-4x4') → 16개 뷰포트
        │
        ▼
RenderScheduler.start() → requestAnimationFrame 루프
        │
        ▼
For each viewport:
  - gl.scissor() + gl.viewport()
  - ArrayTextureRenderer.renderFrame(frameIndex)
        │
        ▼
Display 16 frames at 30fps, synchronized
```

---

## 성능 최적화 기법

| 기법 | 설명 |
|------|------|
| **2D Array Texture** | 프레임마다 텍스처 바인딩 불필요, uniform만 변경 |
| **단일 rAF 루프** | 여러 뷰포트를 하나의 루프에서 렌더링 |
| **Scissor Test** | 뷰포트 영역만 렌더링 (오버드로우 방지) |
| **Immutable Storage** | `texStorage3D`로 GPU 메모리 최적 할당 |
| **W/L in Shader** | GPU에서 Window/Level 계산 (실시간) |
| **LRU Cache** | 자주 사용하는 프레임 메모리 캐싱 |
| **중복 요청 방지** | 동일 URL 동시 요청 시 Promise 공유 |

---

## 브라우저 지원

| 기능 | Chrome | Firefox | Safari | Edge |
|------|--------|---------|--------|------|
| WebGL2 | ✅ | ✅ | ✅ | ✅ |
| WebCodecs ImageDecoder | ✅ | ✅ (118+) | ❌ | ✅ |
| createImageBitmap | ✅ | ✅ | ✅ | ✅ |
| TEXTURE_2D_ARRAY | ✅ | ✅ | ✅ | ✅ |

> Safari는 WebCodecs 미지원으로 `createImageBitmap` 폴백 사용

---

## 향후 계획 (Phase 2.5~5)

| Phase | 내용 |
|-------|------|
| **Phase 2.5** | Robustness (WebGL 컨텍스트 복구, LRU Texture Cache) |
| **Phase 3** | Annotations (좌표 변환, SVG 오버레이, 측정 도구) |
| **Phase 4** | Plugin System, 16-bit 텍스처 지원 |
| **Phase 5** | npm v1.0.0 배포, 멀티 벤더 테스트 |

### 메모리 아키텍처 결정 사항

| 항목 | 전략 | 상태 |
|------|------|------|
| GPU-only 메모리 | Upload & Release 패턴 | ✅ 확정 |
| Context Loss 복구 | 하이브리드 (압축캐시 → IndexedDB → 서버) | ⏳ Phase 2.5 |
| VRAM 관리 | LRU Texture Cache | ⏳ Phase 2.5 |
| 16-bit 지원 | R16UI, R16F 인터페이스 설계 | ⏳ Phase 4+ |

> 상세: [memory-architecture-analysis.md](./memory-architecture-analysis.md)
