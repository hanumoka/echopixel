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
|  | Annotation    |    | WebGL Renderer |    | DataSource Layer |  |
|  | Engine (SVG)  |    +----------------+    +------------------+  |
|  +---------------+    | TextureManager |    | LocalFile        |  |
|                       | TextureUploader|    | WADO-RS/URI      |  |
|                       | ShaderPrograms |    | MJPEG Cine       |  |
|                       | LUT Pipeline   |    | Hybrid           |  |
|                       +----------------+    +------------------+  |
|                              |                      |             |
|                              v                      v             |
|  +---------------+    +----------------+    +------------------+  |
|  | Cache Manager |    | DICOM Services |    | Quality Manager  |  |
|  +---------------+    +------------------+  +------------------+  |
|  | LRU CPU Cache |    | DicomParser      |  | PQE Controller   |  |
|  | LRU GPU Cache |    | DecoderManager   |  | Double Buffer    |  |
|  | Memory Budget |    | MultiVendorAdapter|  | Preloader        |  |
|  +---------------+    +------------------+  +------------------+  |
|                              |                                    |
|                              v                                    |
|                    +-------------------------------------+        |
|                    | Decoder Abstraction Layer ⭐         |        |
|                    +-------------------------------------+        |
|                    | DecoderManager                      |        |
|                    |   └─ select(transferSyntax)         |        |
|                    +-------------------------------------+        |
|                              |                                    |
|          +------------------+-------------------+                 |
|          |                  |                   |                 |
|          v                  v                   v                 |
|  +-------------+    +---------------+    +---------------+        |
|  | WebCodecs   |    | Browser API   |    | WASM Decoders |        |
|  | (Phase 1)   |    | (Phase 1)     |    | (Phase 5)     |        |
|  +-------------+    +---------------+    +---------------+        |
|  | ImageDecoder|    | createImage   |    | JpegLsDecoder |        |
|  | VideoDecoder|    |   Bitmap      |    | Jpeg2kDecoder |        |
|  | → VideoFrame|    | → ImageBitmap |    | RleDecoder    |        |
|  +-------------+    +---------------+    | → TypedArray  |        |
|          |                  |            +---------------+        |
|          +------------------+-------------------+                 |
|                             |                                     |
|                             v                                     |
|                    +-------------------------------------+        |
|                    | TextureUploader                     |        |
|                    +-------------------------------------+        |
|                    | upload(decodedFrame)                |        |
|                    | - VideoFrame  → texImage2D (0-copy) |        |
|                    | - ImageBitmap → texImage2D          |        |
|                    | - TypedArray  → texImage2D          |        |
|                    +-------------------------------------+        |
|                              |                                    |
|                              v                                    |
|                    +-------------------------------------+        |
|                    | GPU Memory / Web Workers            |        |
|                    | - 2D Array Textures (frame seq)     |        |
|                    | - Single WebGL Context (16+ viewports)|      |
|                    | - Worker Pool (WASM decoding)        |       |
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
│   │   ├── decoder/          # 픽셀 디코딩 ⭐
│   │   │   ├── types.ts              # Decoder 인터페이스 정의
│   │   │   ├── DecoderManager.ts     # Transfer Syntax → Decoder 매핑
│   │   │   ├── WebCodecsDecoder.ts   # ImageDecoder 래퍼 (Phase 1)
│   │   │   ├── WebCodecsVideoDecoder.ts  # VideoDecoder (Phase 2, H.264)
│   │   │   ├── BrowserDecoder.ts     # createImageBitmap 폴백 (Phase 1)
│   │   │   ├── JpegLsDecoder.ts      # CharLS WASM (Phase 5)
│   │   │   ├── Jpeg2000Decoder.ts    # OpenJPEG WASM (Phase 5)
│   │   │   └── RleDecoder.ts         # RLE 직접 구현 (Phase 5)
│   │   ├── renderer/         # WebGL 렌더링
│   │   │   ├── TextureManager.ts     # 2D Array Texture 관리
│   │   │   ├── TextureUploader.ts    # 다중 입력 타입 지원 ⭐
│   │   │   └── ShaderPrograms.ts     # VOI LUT 등
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
│   └── codecs/               # WASM 디코더 바이너리 (Phase 5)
│       ├── jpeg-ls/          # CharLS WASM
│       └── jpeg2000/         # OpenJPEG WASM
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
- **동기화 방식**:
  - Frame Ratio: 프레임 비율 기반 (기본)
  - R-wave: 심박 주기 기준
  - Time: 절대 시간 기준
  - Manual: 사용자 정의 동기점
- FPS 정규화 (다른 프레임 수 자동 조정)
- SyncGroup 뷰포트 그룹화

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

#### MultiVendorAdapter
- 벤더별 태그 정규화
- GE, Philips, Siemens, Canon, Samsung 지원

---

### 4. Decoder Abstraction Layer ⭐

Phase 1에서 설계, Phase 5까지 확장 가능한 구조

#### Decoder Interface

```typescript
// 디코딩 결과 타입
type DecodedFrameType = 'videoframe' | 'imagebitmap' | 'typedarray'

interface DecodedFrame {
  type: DecodedFrameType
  data: VideoFrame | ImageBitmap | TypedArray
  width: number
  height: number
  bitsAllocated: 8 | 16
  samplesPerPixel: 1 | 3  // Grayscale | RGB
  close(): void  // 리소스 해제 (VideoFrame, ImageBitmap)
}

// 디코더 인터페이스
interface Decoder {
  readonly name: string
  readonly supportedTransferSyntaxes: string[]

  isSupported(): boolean  // 브라우저 지원 여부
  decode(encodedData: ArrayBuffer, frameInfo: FrameInfo): Promise<DecodedFrame>
  dispose(): void
}
```

#### DecoderManager

Transfer Syntax에 따라 적절한 Decoder를 선택합니다.

```typescript
class DecoderManager {
  private decoders: Map<string, Decoder>

  // Transfer Syntax UID → Decoder 매핑
  select(transferSyntaxUID: string): Decoder

  // 우선순위: WebCodecs > Browser API > WASM
  // 폴백 체인 자동 적용
}
```

#### Transfer Syntax → Decoder 매핑

| Transfer Syntax | Phase | Primary Decoder | Fallback |
|-----------------|-------|-----------------|----------|
| Implicit/Explicit VR | 1 | Native (직접) | - |
| JPEG Baseline | 1 | WebCodecsDecoder | BrowserDecoder |
| JPEG Extended | 1 | WebCodecsDecoder | BrowserDecoder |
| MPEG-4 (H.264) | 2 | WebCodecsVideoDecoder | - |
| JPEG Lossless | 5 | JpegLosslessDecoder (WASM) | - |
| JPEG-LS | 5 | JpegLsDecoder (WASM) | - |
| JPEG 2000 | 5 | Jpeg2000Decoder (WASM) | - |
| RLE | 5 | RleDecoder (직접) | - |

#### 개별 Decoder 구현

| Decoder | 출력 타입 | Phase | 비고 |
|---------|----------|-------|------|
| **WebCodecsDecoder** | VideoFrame | 1 | HW 가속, 제로카피 |
| **BrowserDecoder** | ImageBitmap | 1 | Safari 폴백 |
| **WebCodecsVideoDecoder** | VideoFrame | 2 | H.264/HEVC |
| **JpegLsDecoder** | TypedArray | 5 | CharLS WASM |
| **Jpeg2000Decoder** | TypedArray | 5 | OpenJPEG WASM |
| **RleDecoder** | TypedArray | 5 | 직접 구현 |

---

### 5. TextureUploader ⭐

다양한 Decoder 출력을 WebGL 텍스처로 업로드합니다.

```typescript
class TextureUploader {
  upload(gl: WebGL2RenderingContext, frame: DecodedFrame, texture: WebGLTexture): void {
    switch (frame.type) {
      case 'videoframe':
        // 제로카피 (GPU → GPU)
        this.uploadVideoFrame(gl, frame.data as VideoFrame, texture)
        break
      case 'imagebitmap':
        // 1번 복사
        this.uploadImageBitmap(gl, frame.data as ImageBitmap, texture)
        break
      case 'typedarray':
        // 1번 복사 (WASM 출력)
        this.uploadTypedArray(gl, frame.data as TypedArray, texture, frame)
        break
    }
  }

  private uploadVideoFrame(gl, videoFrame, texture) {
    // 1차: 제로카피 시도
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoFrame)
      if (gl.getError() === gl.NO_ERROR) return
    } catch (e) { /* 폴백 */ }

    // 2차: ImageBitmap 경유
    const bitmap = await createImageBitmap(videoFrame)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    bitmap.close()
  }
}
```

#### 성능 특성

| 입력 타입 | 복사 횟수 | 성능 | 사용 시점 |
|----------|----------|------|----------|
| VideoFrame | 0 (제로카피) | 최상 | WebCodecs 성공 시 |
| ImageBitmap | 1 | 좋음 | Safari, 폴백 |
| TypedArray | 1 | 보통 | WASM 디코더 |

---

### 6. DataSource Layer

#### DataSource Interface
```typescript
interface DataSource {
  readonly type: 'local' | 'wado-rs' | 'wado-uri' | 'mjpeg' | 'hybrid'

  getStudyMetadata(studyId: string): Promise<StudyMetadata>
  getSeriesMetadata(seriesId: string): Promise<SeriesMetadata>
  getInstanceMetadata(instanceId: string): Promise<InstanceMetadata>

  getFrameData(instanceId: string, frameIndex: number): Promise<FrameData>
  getFrameDataStream(instanceId: string): AsyncGenerator<FrameData>
}
```

#### DataSource 구현체

| DataSource | 설명 | Phase |
|------------|------|-------|
| **LocalFileSource** | 로컬 파일 로드 (개발/테스트) | 1 |
| **WadoRsSource** | DICOMweb WADO-RS | 1 |
| **WadoUriSource** | 레거시 WADO-URI | 1 |
| **MjpegCineSource** | MJPEG 스트리밍 (미리보기) | 1 |
| **HybridSource** | MJPEG → WADO-RS 전환 | 1 |
| **QidoRsSource** | Study/Series 검색 | 2 |
| **StowRsSource** | DICOM SR 저장 | 3 |

---

### 7. Quality Manager (PQE)

#### Progressive Quality Enhancement
저품질에서 시작해 점진적으로 고품질로 전환

| Level | 이름 | 해상도 | 소스 | 용도 |
|-------|------|--------|------|------|
| 1 | Thumbnail | 64px | MJPEG | 초기 표시 |
| 2 | Preview | 256px | MJPEG | 빠른 미리보기 |
| 3 | Standard | 512px | WADO-RS Rendered | 일반 사용 |
| 4 | Original | 원본 | WADO-RS BulkData | 진단/측정 |

#### 구성 요소
- **PQEController**: 품질 레벨 관리, 전환 트리거
- **DoubleBuffer**: 끊김 없는 텍스처 교체
- **Preloader**: 재생 위치 예측, 선제적 로딩

---

### 8. Annotation Engine

#### SVG Layer
- 벡터 기반 정밀 렌더링
- 핸들/그립 인터랙션
- 줌/팬 시 좌표 변환

#### Coordinate Transform
- DICOM Pixel ↔ Canvas ↔ World 좌표계
- 회전/플립 지원

---

### 9. Plugin System

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

| 파일 | 역할 | Phase |
|------|------|-------|
| `core/dicom/DicomParser.ts` | Lazy DICOM 파싱 | 1 |
| `core/decoder/types.ts` | Decoder/DecodedFrame 인터페이스 ⭐ | 1 |
| `core/decoder/DecoderManager.ts` | Transfer Syntax → Decoder 매핑 ⭐ | 1 |
| `core/decoder/WebCodecsDecoder.ts` | ImageDecoder 래퍼 (HW 가속) | 1 |
| `core/decoder/BrowserDecoder.ts` | createImageBitmap 폴백 | 1 |
| `core/decoder/WebCodecsVideoDecoder.ts` | H.264 VideoDecoder | 2 |
| `core/decoder/JpegLsDecoder.ts` | CharLS WASM 래퍼 | 5 |
| `core/decoder/Jpeg2000Decoder.ts` | OpenJPEG WASM 래퍼 | 5 |
| `core/decoder/RleDecoder.ts` | RLE 직접 구현 | 5 |
| `core/datasource/DataSource.ts` | DataSource 인터페이스 | 1 |
| `core/datasource/WadoRsSource.ts` | WADO-RS 구현 | 1 |
| `core/renderer/TextureManager.ts` | WebGL2 텍스처, 2D Array Texture | 1 |
| `core/renderer/TextureUploader.ts` | 다중 입력 타입 텍스처 업로드 ⭐ | 1 |
| `core/viewport/ViewportManager.ts` | 멀티 뷰포트, 레이아웃 | 2 |
| `core/sync/FrameSyncEngine.ts` | rAF 기반 동기화 | 2 |
| `core/quality/PQEController.ts` | Progressive Quality Enhancement | 2 |
| `react/components/Viewport.tsx` | 메인 React 컴포넌트 | 1 |

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
