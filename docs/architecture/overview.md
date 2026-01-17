# EchoPixel 아키텍처 개요

## 시스템 구조

```
+------------------------------------------------------------------+
|                        EchoPixel Library                          |
+------------------------------------------------------------------+
|  React Layer          Core Engine           Plugin System         |
|  +--------------+     +---------------+     +------------------+  |
|  | <EchoProvider>|<-->| ViewportMgr   |<-->| MeasurementPlugin|  |
|  | <Viewport>   |     | FrameSyncEngine|    | AIOverlayPlugin  |  |
|  | <Toolbar>    |     | RenderScheduler|    | StrainPlugin     |  |
|  +--------------+     +---------------+     +------------------+  |
|         |                    |                                    |
|         v                    v                                    |
|  +---------------+    +----------------+    +------------------+  |
|  | Annotation    |    | WebGL Renderer |    | DICOM Services   |  |
|  | Engine (SVG)  |    +----------------+    +------------------+  |
|  +---------------+    | TextureManager |    | DicomParser      |  |
|                       | ShaderPrograms |    | PixelDataDecoder |  |
|                       | LUT Pipeline   |    | MultiVendorAdapter|  |
|                       +----------------+    +------------------+  |
|                              |                      |             |
|                              v                      v             |
|                    +-------------------------------------+        |
|                    | GPU Memory / Web Workers            |        |
|                    | - 2D Array Textures (frame seq)     |        |
|                    | - Single WebGL Context (10+ viewports)|      |
|                    | - Worker Pool (codec decoding)       |       |
|                    +-------------------------------------+        |
+------------------------------------------------------------------+
```

---

## 패키지 구조

```
echopixel/
├── packages/
│   ├── core/                 # 핵심 렌더링 엔진
│   │   ├── dicom/            # DICOM 파싱
│   │   ├── renderer/         # WebGL 렌더링
│   │   ├── viewport/         # 뷰포트 관리
│   │   ├── cache/            # 메모리 관리
│   │   └── sync/             # 프레임 동기화
│   │
│   ├── react/                # React 컴포넌트
│   │   ├── components/       # Viewport, Toolbar, Provider
│   │   └── hooks/            # useViewport, useCine
│   │
│   ├── annotations/          # 측정 도구
│   │   └── tools/            # Distance, Area, DopplerTrace
│   │
│   ├── plugins/              # 공식 플러그인
│   │   ├── ai-overlay/
│   │   └── strain-visualization/
│   │
│   └── codecs/               # WASM 디코더
│       ├── jpeg-ls/
│       └── jpeg2000/
│
├── apps/
│   ├── demo/                 # 데모 앱
│   └── docs/                 # Storybook
│
└── pnpm-workspace.yaml
```

---

## 핵심 모듈 설명

### 1. Core Engine

#### ViewportManager
- 멀티 뷰포트 인스턴스 관리
- 레이아웃 시스템 (그리드, 커스텀 배치)
- 동기화 그룹 관리

#### FrameSyncEngine
- `requestAnimationFrame` 기반 마스터 클럭
- 가변 프레임 레이트 지원 (DICOM Frame Time Vector)
- R-wave 트리거 동기화

#### RenderScheduler
- 렌더링 우선순위 관리
- 화면 밖 뷰포트 스킵 (IntersectionObserver)
- 프레임 드롭 보상

---

### 2. WebGL Renderer

#### TextureManager
- WebGL2 2D Array Texture 관리
- 프레임 시퀀스 GPU 저장
- LRU 기반 메모리 관리

#### ShaderPrograms
- `grayscale`: 8/16비트 그레이스케일 + VOI LUT
- `colorDoppler`: YCbCr → RGB 변환
- `mMode`: M-mode 트레이스 렌더링
- `strainMap`: Strain 컬러맵 오버레이

---

### 3. DICOM Services

#### DicomParser
- Lazy 파싱 (태그 접근 시점에 해석)
- 심초음파 특화 메타데이터 추출
  - Frame Time (0018,1063)
  - Frame Time Vector (0018,1065)
  - Recommended Display Frame Rate (0008,2144)

#### PixelDataDecoder
- Web Workers 기반 비동기 디코딩
- 지원 Transfer Syntax:
  - Native (Uncompressed)
  - JPEG Baseline
  - JPEG-LS (CharLS WASM)
  - JPEG2000 (OpenJPEG WASM)
  - RLE

#### MultiVendorAdapter
- 벤더별 태그 정규화
- GE, Philips, Siemens, Canon 지원

---

### 4. Annotation Engine

#### SVG Layer
- 벡터 기반 정밀 렌더링
- 핸들/그립 인터랙션
- 줌/팬 시 좌표 변환

#### Coordinate Transform
- DICOM Pixel ↔ Canvas ↔ World 좌표계
- 회전/플립 지원

---

### 5. Plugin System

#### Plugin Interface
```typescript
interface EchoPixelPlugin {
  readonly id: string
  readonly version: string

  onInstall(context: PluginContext): void
  onActivate(viewport: Viewport): void
  onDeactivate(): void
  onUninstall(): void
}
```

#### 기본 제공 플러그인
- `MeasurementPlugin`: 거리, 영역, Doppler 측정
- `AIOverlayPlugin`: Heatmap, Bounding Box, Segmentation
- `StrainVisualizationPlugin`: Bull's eye plot, Polar map

---

## 핵심 구현 파일

| 파일 | 역할 | 우선순위 |
|------|------|----------|
| `core/renderer/TextureManager.ts` | WebGL2 텍스처, 2D Array Texture | 1 |
| `core/viewport/ViewportManager.ts` | 멀티 뷰포트, 레이아웃 | 1 |
| `core/sync/FrameClock.ts` | rAF 기반 동기화 | 1 |
| `core/dicom/DicomParser.ts` | Lazy DICOM 파싱 | 1 |
| `react/components/Viewport.tsx` | 메인 React 컴포넌트 | 2 |

---

## React API 예시

```tsx
import { EchoProvider, Viewport, Toolbar } from 'echopixel'

function App() {
  return (
    <EchoProvider>
      <Toolbar tools={['pan', 'zoom', 'windowLevel', 'measure']} />
      <div className="viewport-grid">
        <Viewport seriesId="echo-4ch" syncGroup="main" />
        <Viewport seriesId="echo-2ch" syncGroup="main" />
        <Viewport seriesId="doppler-mv" />
      </div>
    </EchoProvider>
  )
}
```

### Viewport Props

```typescript
interface ViewportProps {
  seriesId: string
  syncGroup?: string           // 프레임 동기화 그룹
  initialFrame?: number
  initialWindowCenter?: number
  initialWindowWidth?: number
  showOverlayInfo?: boolean    // 환자 정보 오버레이
  tools?: ToolDefinition[]     // 활성 인터랙션 도구
  plugins?: PluginConfig[]     // 뷰포트별 플러그인

  // 콜백
  onFrameChange?: (frame: number) => void
  onWindowLevelChange?: (center: number, width: number) => void
  onMeasurementComplete?: (measurement: MeasurementResult) => void
}
```
