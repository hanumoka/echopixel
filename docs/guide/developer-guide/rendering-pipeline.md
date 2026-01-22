# DICOM 렌더링 파이프라인

> **목적**: 실제 DICOM 파일이 EchoPixel 시스템에 들어와서 화면에 렌더링되고 재생되기까지의 전체 과정을 상세히 설명합니다.

---

## 목차

1. [파이프라인 개요](#1-파이프라인-개요)
2. [데이터 입력 단계](#2-데이터-입력-단계)
3. [DICOM 파싱 단계](#3-dicom-파싱-단계)
4. [이미지 디코딩 단계](#4-이미지-디코딩-단계)
5. [텍스처 업로드 단계](#5-텍스처-업로드-단계)
6. [렌더링 단계](#6-렌더링-단계)
7. [재생 및 프레임 동기화](#7-재생-및-프레임-동기화)
8. [이벤트 처리 흐름](#8-이벤트-처리-흐름)
9. [전체 데이터 흐름도](#9-전체-데이터-흐름도)

---

## 1. 파이프라인 개요

### 1.1 전체 흐름 요약

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EchoPixel 렌더링 파이프라인                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [입력]              [파싱]           [디코딩]         [업로드]    [렌더링]   │
│                                                                             │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌────────┐  ┌────────┐ │
│  │Local File│     │  DICOM   │     │  Image   │     │Texture │  │  Quad  │ │
│  │    or    │ ──▶ │  Parser  │ ──▶ │ Decoder  │ ──▶ │Manager │─▶│Renderer│ │
│  │ WADO-RS  │     │          │     │          │     │        │  │        │ │
│  └──────────┘     └──────────┘     └──────────┘     └────────┘  └────────┘ │
│       │                │                │               │            │      │
│       ▼                ▼                ▼               ▼            ▼      │
│  ArrayBuffer      DicomDataset    ImageBitmap      WebGL         Canvas    │
│  Uint8Array[]     DicomImageInfo  or VideoFrame   Texture                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 파이프라인 참여 모듈

| 단계 | 모듈 | 위치 | 역할 |
|------|------|------|------|
| 입력 | WadoRsDataSource | `core/datasource/` | WADO-RS 프로토콜로 PACS 서버에서 데이터 로드 |
| 파싱 | DicomParser | `core/dicom/` | DICOM 바이너리 파싱, 메타데이터 추출 |
| 디코딩 | ImageDecoder | `core/dicom/` | JPEG/Native 픽셀 데이터를 ImageBitmap으로 변환 |
| 업로드 | TextureManager | `core/webgl/` | 디코딩된 이미지를 GPU 텍스처로 업로드 |
| 렌더링 | QuadRenderer | `core/webgl/` | WebGL Shader로 화면에 렌더링 |
| 동기화 | RenderScheduler | `core/sync/` | 멀티 뷰포트 렌더링 루프 관리 |
| UI 통합 | SingleDicomViewer | `react/components/` | React 컴포넌트로 전체 오케스트레이션 |

---

## 2. 데이터 입력 단계

### 2.1 로컬 파일 입력

**진입점**: `SingleViewportPage.tsx`의 `handleFileChange()`

```
┌─────────────────────────────────────────────────────────────────────┐
│                      로컬 파일 로드 프로세스                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [사용자]                    [브라우저]                  [React]     │
│                                                                     │
│  파일 선택                                                          │
│     │                                                               │
│     ▼                                                               │
│  <input type="file">  ────────▶  FileReader  ─────▶  ArrayBuffer   │
│                        (비동기)                       (바이너리)     │
│                                                           │         │
│                                                           ▼         │
│                                              ┌────────────────────┐ │
│                                              │ isDicomFile()      │ │
│                                              │ - DICM 매직넘버 검증│ │
│                                              └────────────────────┘ │
│                                                           │         │
│                                                    Valid? │         │
│                                              ┌────────────┴──────┐  │
│                                              ▼                   ▼  │
│                                           parseDicom()      Error   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**코드 흐름** (`SingleViewportPage.tsx:162-208`):

```typescript
const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];

  // 1. 파일을 ArrayBuffer로 읽기
  const buffer = await file.arrayBuffer();

  // 2. DICOM 유효성 검증
  if (!isDicomFile(buffer)) {
    setParseResult({ isValid: false, error: 'Not a valid DICOM file' });
    return;
  }

  // 3. DICOM 파싱
  const dataset = parseDicom(buffer);
  const imageInfo = getImageInfo(buffer, dataset);
  const pixelData = extractPixelData(buffer, dataset);

  // 4. 뷰포트 데이터 설정
  setViewportData({
    frames: pixelData.frames,      // Uint8Array[] - 각 프레임의 압축된 데이터
    imageInfo,                     // DicomImageInfo - 메타데이터
    isEncapsulated: pixelData.isEncapsulated,  // 압축 여부
  });
};
```

### 2.2 WADO-RS 서버 입력

**진입점**: `useWadoLoader.ts`의 `loadInstance()`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      WADO-RS 데이터 로드 프로세스                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [React Hook]          [WadoRsDataSource]           [PACS Server]       │
│                                                                         │
│  loadInstance()                                                         │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────┐                                                        │
│  │ DataSource  │                                                        │
│  │  생성       │                                                        │
│  └─────────────┘                                                        │
│       │                                                                 │
│       ▼                                                                 │
│  loadAllFrames(instanceId)                                              │
│       │                                                                 │
│       ├─────────────▶ loadMetadata() ──────▶ GET /instances/{uid}/metadata
│       │                     │                        │                  │
│       │                     ▼                        ▼                  │
│       │               DicomMetadata ◀──────── application/dicom+json   │
│       │                                                                 │
│       │                                                                 │
│       └─────────────▶ loadFrame(1...N) ────▶ GET /instances/{uid}/frames/N
│                             │                        │                  │
│                             ▼                        ▼                  │
│                        Uint8Array[] ◀─────── multipart/related         │
│                                              (JPEG or raw)              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**WADO-RS 엔드포인트**:

| 요청 | URL 패턴 | 응답 타입 |
|------|----------|-----------|
| 메타데이터 | `GET /studies/{study}/series/{series}/instances/{sop}/metadata` | `application/dicom+json` |
| 프레임 | `GET /studies/{study}/series/{series}/instances/{sop}/frames/{n}` | `multipart/related` |
| 인스턴스 목록 | `GET /studies/{study}/series/{series}/instances` | `application/dicom+json` |

**코드 흐름** (`WadoRsDataSource.ts:186-217`):

```typescript
async loadAllFrames(instanceId: DicomInstanceId): Promise<{ metadata: DicomMetadata; frames: Uint8Array[] }> {
  // 1. 메타데이터 로드 (JSON 형태)
  const metadata = await this.loadMetadata(instanceId);

  // 2. 프레임 번호 배열 생성 (1-based)
  const frameNumbers = Array.from({ length: metadata.frameCount }, (_, i) => i + 1);

  // 3. 모든 프레임 병렬 로드
  const results = await Promise.all(
    frameNumbers.map((fn) => this.loadFrameWithFormat(instanceId, fn))
  );

  // 4. 실제 압축 형식 감지 (JPEG 시그니처: 0xFF 0xD8)
  const actualIsEncapsulated = results[0]?.isJpeg ?? false;

  return { metadata: { ...metadata, isEncapsulated: actualIsEncapsulated }, frames };
}
```

### 2.3 데이터 캐싱

`WadoRsDataSource`는 2계층 LRU 캐시를 사용:

```
┌─────────────────────────────────────────────┐
│              2계층 캐싱 구조                 │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │     Metadata Cache (LRU, 50개)      │    │
│  │  Key: "studyUid/seriesUid/sopUid"   │    │
│  │  Value: DicomMetadata               │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │      Frame Cache (LRU, 100개)       │    │
│  │  Key: "studyUid/seriesUid/sopUid:N" │    │
│  │  Value: Uint8Array (압축된 프레임)   │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │    Pending Requests (중복 방지)      │    │
│  │  진행 중인 요청은 Promise 공유       │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 3. DICOM 파싱 단계

### 3.1 파싱 프로세스

**모듈**: `DicomParser.ts`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       DICOM 파싱 프로세스                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ArrayBuffer (DICOM 파일)                                               │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────┐                                                    │
│  │ isDicomFile()   │  128바이트 Preamble + "DICM" 매직넘버 검증         │
│  └─────────────────┘                                                    │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────┐                                                    │
│  │ parseDicom()    │  File Meta Information 파싱                        │
│  │                 │  - Transfer Syntax UID 추출                        │
│  │                 │  - VR 결정 (Explicit/Implicit)                     │
│  └─────────────────┘                                                    │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────┐                                                    │
│  │ parseElements() │  Data Element 순회                                 │
│  │                 │  - Tag (4바이트)                                   │
│  │                 │  - VR (2바이트, Explicit)                          │
│  │                 │  - Length (2/4바이트)                              │
│  │                 │  - Value (가변)                                    │
│  └─────────────────┘                                                    │
│       │                                                                 │
│       ▼                                                                 │
│  DicomDataset                                                           │
│  {                                                                      │
│    elements: Map<string, DicomElement>                                  │
│    transferSyntax: string                                               │
│    isExplicitVR: boolean                                                │
│  }                                                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 메타데이터 추출

**함수**: `getImageInfo(buffer, dataset)`

```typescript
interface DicomImageInfo {
  // 이미지 차원
  rows: number;           // (0028,0010) - 이미지 높이
  columns: number;        // (0028,0011) - 이미지 너비

  // 픽셀 인코딩
  bitsAllocated: number;  // (0028,0100) - 픽셀당 할당 비트 (8, 16)
  bitsStored: number;     // (0028,0101) - 실제 사용 비트
  highBit: number;        // (0028,0102) - 최상위 비트

  // 색상 정보
  samplesPerPixel: number;         // (0028,0002) - 채널 수 (1=그레이, 3=컬러)
  photometricInterpretation: string; // (0028,0004) - MONOCHROME2, RGB 등
  pixelRepresentation: number;     // (0028,0103) - 0=unsigned, 1=signed

  // 캘리브레이션 (측정용)
  pixelSpacing?: PixelSpacing;         // (0028,0030) - mm/pixel
  ultrasoundCalibration?: UltrasoundCalibration;  // (0018,6011) - 초음파 영역
}
```

### 3.3 픽셀 데이터 추출

**함수**: `extractPixelData(buffer, dataset)`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       픽셀 데이터 추출                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  DICOM 파일 내 Pixel Data 위치:                                         │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ Preamble │ DICM │ File Meta │ Dataset │ (7FE0,0010) Pixel Data │     │
│  │ 128 bytes│ 4    │ Variable  │Variable │ Variable              │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  압축 여부에 따른 처리:                                                  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Native (비압축)                                                   │   │
│  │ - Transfer Syntax: 1.2.840.10008.1.2 (Implicit VR Little Endian) │   │
│  │ - 픽셀 데이터가 연속된 바이트 스트림                               │   │
│  │ - frameSize = rows × columns × bytesPerPixel × samplesPerPixel   │   │
│  │ - frames[i] = pixelData.slice(i * frameSize, (i+1) * frameSize)  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Encapsulated (압축)                                               │   │
│  │ - Transfer Syntax: 1.2.840.10008.1.2.4.* (JPEG 계열)             │   │
│  │ - Basic Offset Table + Fragment Sequence                         │   │
│  │                                                                   │   │
│  │  ┌─────────────────────────────────────────────────────────────┐ │   │
│  │  │ (FFFE,E000) │ Offset Table │ (FFFE,E000) │ Fragment 1 │ ... │ │   │
│  │  │ Item Tag    │ (optional)   │ Item Tag    │ JPEG Data  │     │ │   │
│  │  └─────────────────────────────────────────────────────────────┘ │   │
│  │                                                                   │   │
│  │ - 각 Fragment = 하나의 JPEG 압축 프레임                          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**코드 흐름** (`DicomParser.ts:336-447`):

```typescript
export function extractPixelData(buffer: ArrayBuffer, dataset: DicomDataset): PixelDataResult | null {
  const pixelDataElement = dataset.elements.get('7FE00010');  // Pixel Data Tag

  if (isEncapsulated(dataset.transferSyntax)) {
    // 압축된 경우: Fragment 단위로 분리
    return extractEncapsulatedPixelData(buffer, pixelDataElement, imageInfo);
  } else {
    // 비압축: 프레임 크기로 슬라이스
    return extractNativePixelData(buffer, pixelDataElement, imageInfo);
  }
}
```

---

## 4. 이미지 디코딩 단계

### 4.1 디코딩 전략

**모듈**: `ImageDecoder.ts`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       이미지 디코딩 전략                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Uint8Array (프레임 데이터)                                              │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    isEncapsulated?                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                           │                                     │
│       ▼ Yes                       ▼ No                                  │
│  ┌───────────────────┐      ┌───────────────────┐                       │
│  │   decodeJpeg()    │      │   decodeNative()  │                       │
│  │                   │      │                   │                       │
│  │ 1. WebCodecs      │      │ 1. W/L 변환       │                       │
│  │    ImageDecoder   │      │    (8bit → 8bit)  │                       │
│  │    (우선)         │      │                   │                       │
│  │                   │      │ 2. ImageData 생성 │                       │
│  │ 2. createImage    │      │                   │                       │
│  │    Bitmap         │      │ 3. createImage    │                       │
│  │    (폴백)         │      │    Bitmap         │                       │
│  └───────────────────┘      └───────────────────┘                       │
│       │                           │                                     │
│       ▼                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   DecodedFrame                                   │    │
│  │  {                                                               │    │
│  │    image: ImageBitmap | VideoFrame,                              │    │
│  │    type: 'imageBitmap' | 'videoFrame'                            │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 JPEG 디코딩 (압축)

**우선순위**: WebCodecs ImageDecoder → createImageBitmap

```typescript
// ImageDecoder.ts:25-54
export async function decodeJpeg(jpegData: Uint8Array): Promise<DecodedFrame> {
  // 1. WebCodecs ImageDecoder 시도 (하드웨어 가속)
  if (isImageDecoderSupported()) {
    try {
      const decoder = new ImageDecoder({
        data: jpegData,
        type: 'image/jpeg',
      });

      await decoder.decode();
      const result = await decoder.completed;
      const frame = result.image;  // VideoFrame

      return { image: frame, type: 'videoFrame' };
    } catch {
      // 폴백
    }
  }

  // 2. createImageBitmap 폴백
  const blob = new Blob([jpegData], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);

  return { image: bitmap, type: 'imageBitmap' };
}
```

**WebCodecs vs createImageBitmap**:

| 항목 | WebCodecs ImageDecoder | createImageBitmap |
|------|------------------------|-------------------|
| 지원 브라우저 | Chrome 94+, Edge 94+ | 모든 주요 브라우저 |
| 하드웨어 가속 | GPU 가속 가능 | CPU 기반 |
| 반환 타입 | VideoFrame | ImageBitmap |
| 메모리 해제 | `frame.close()` 필수 | GC 자동 해제 |
| 성능 | 빠름 | 보통 |

### 4.3 Native 디코딩 (비압축)

**Window/Level 변환 포함**:

```typescript
// ImageDecoder.ts (decodeNative 구현)
export async function decodeNative(
  rawData: Uint8Array,
  options: { imageInfo: DicomImageInfo; windowCenter?: number; windowWidth?: number }
): Promise<DecodedFrame> {
  const { imageInfo, windowCenter, windowWidth } = options;
  const { rows, columns, bitsStored, pixelRepresentation } = imageInfo;

  // 1. Window/Level 파라미터 계산
  const wc = windowCenter ?? Math.pow(2, bitsStored - 1);
  const ww = windowWidth ?? Math.pow(2, bitsStored);
  const lower = wc - ww / 2;
  const upper = wc + ww / 2;

  // 2. 픽셀 값을 0-255로 매핑
  const rgba = new Uint8ClampedArray(rows * columns * 4);
  const dataView = new DataView(rawData.buffer);

  for (let i = 0; i < rows * columns; i++) {
    // 16비트 픽셀 읽기
    const pixelValue = dataView.getInt16(i * 2, true);  // Little Endian

    // W/L 변환
    let normalized = (pixelValue - lower) / (upper - lower);
    normalized = Math.max(0, Math.min(1, normalized));
    const gray = Math.round(normalized * 255);

    // RGBA로 변환 (그레이스케일)
    rgba[i * 4 + 0] = gray;  // R
    rgba[i * 4 + 1] = gray;  // G
    rgba[i * 4 + 2] = gray;  // B
    rgba[i * 4 + 3] = 255;   // A (불투명)
  }

  // 3. ImageBitmap 생성
  const imageData = new ImageData(rgba, columns, rows);
  const bitmap = await createImageBitmap(imageData);

  return { image: bitmap, type: 'imageBitmap' };
}
```

### 4.4 메모리 해제

**중요**: VideoFrame은 명시적 해제 필요

```typescript
// 디코딩 후 반드시 호출
export function closeDecodedFrame(frame: DecodedFrame): void {
  if (frame.type === 'videoFrame') {
    (frame.image as VideoFrame).close();  // GPU 메모리 해제
  }
  // ImageBitmap은 GC가 자동 처리
}
```

---

## 5. 텍스처 업로드 단계

### 5.1 TextureManager

**모듈**: `TextureManager.ts`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      텍스처 업로드 프로세스                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  DecodedFrame (ImageBitmap / VideoFrame)                                │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    TextureManager.upload()                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  1. 텍스처 객체 생성 (최초 1회)                                   │    │
│  │     gl.createTexture()                                           │    │
│  │                                                                   │    │
│  │  2. 텍스처 바인딩                                                 │    │
│  │     gl.bindTexture(gl.TEXTURE_2D, texture)                       │    │
│  │                                                                   │    │
│  │  3. 이미지 데이터 업로드                                          │    │
│  │     gl.texImage2D(                                               │    │
│  │       gl.TEXTURE_2D,                                             │    │
│  │       0,                    // mipmap level                      │    │
│  │       gl.RGBA,              // internal format                   │    │
│  │       gl.RGBA,              // format                            │    │
│  │       gl.UNSIGNED_BYTE,     // type                              │    │
│  │       source                // ImageBitmap or VideoFrame         │    │
│  │     )                                                            │    │
│  │                                                                   │    │
│  │  4. 텍스처 파라미터 설정                                          │    │
│  │     - TEXTURE_MIN_FILTER: LINEAR                                 │    │
│  │     - TEXTURE_MAG_FILTER: LINEAR                                 │    │
│  │     - TEXTURE_WRAP_S/T: CLAMP_TO_EDGE                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                 │
│       ▼                                                                 │
│  WebGLTexture (GPU 메모리)                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**코드** (`TextureManager.ts:45-82`):

```typescript
upload(source: ImageBitmap | VideoFrame): void {
  const gl = this.gl;

  // 텍스처가 없으면 생성
  if (!this.texture) {
    this.texture = gl.createTexture();
    if (!this.texture) {
      throw new Error('Failed to create texture');
    }
  }

  gl.bindTexture(gl.TEXTURE_2D, this.texture);

  // 이미지를 GPU로 업로드
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,                      // mipmap level
    gl.RGBA,               // internal format
    gl.RGBA,               // format
    gl.UNSIGNED_BYTE,      // type
    source                 // ImageBitmap or VideoFrame
  );

  // 텍스처 필터링 설정
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
```

### 5.2 배열 텍스처 (멀티프레임 최적화)

**Phase 2**: `TEXTURE_2D_ARRAY`를 사용한 배치 업로드

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    배열 텍스처 vs 단일 텍스처                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ 단일 텍스처 (TEXTURE_2D)                                         │    │
│  │                                                                   │    │
│  │  Frame 0 → upload → render                                       │    │
│  │  Frame 1 → upload → render   (매 프레임 텍스처 업로드 필요)       │    │
│  │  Frame 2 → upload → render                                       │    │
│  │  ...                                                              │    │
│  │                                                                   │    │
│  │  단점: 프레임 전환마다 CPU→GPU 전송 발생                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ 배열 텍스처 (TEXTURE_2D_ARRAY)                                   │    │
│  │                                                                   │    │
│  │  ┌─────────────────────────────────────────────────┐             │    │
│  │  │ Layer 0 │ Layer 1 │ Layer 2 │ ... │ Layer N-1  │  (GPU 메모리) │    │
│  │  │ Frame 0 │ Frame 1 │ Frame 2 │ ... │ Frame N-1  │              │    │
│  │  └─────────────────────────────────────────────────┘             │    │
│  │                                                                   │    │
│  │  로딩 시: 모든 프레임 한번에 업로드                               │    │
│  │  재생 시: uniform 변경만으로 프레임 전환                          │    │
│  │                                                                   │    │
│  │  장점: 프레임 전환 시 텍스처 바인딩 변경 없음                     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. 렌더링 단계

### 6.1 QuadRenderer

**모듈**: `QuadRenderer.ts`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       WebGL 렌더링 프로세스                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    QuadRenderer.render()                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  1. Shader Program 활성화                                        │    │
│  │     gl.useProgram(program)                                       │    │
│  │                                                                   │    │
│  │  2. Uniform 설정                                                  │    │
│  │     - u_texture: 텍스처 유닛 번호                                 │    │
│  │     - u_windowCenter, u_windowWidth: W/L 값 (정규화)             │    │
│  │     - u_pan: 이동 (NDC 좌표)                                     │    │
│  │     - u_zoom: 확대 배율                                          │    │
│  │     - u_rotation: 회전 각도 (라디안)                             │    │
│  │     - u_flipH, u_flipV: 플립 플래그                              │    │
│  │     - u_aspectScale: 종횡비 보정                                 │    │
│  │                                                                   │    │
│  │  3. VAO 바인딩 (정점 데이터)                                      │    │
│  │     gl.bindVertexArray(vao)                                      │    │
│  │                                                                   │    │
│  │  4. 드로우 콜                                                     │    │
│  │     gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Shader 파이프라인

**Vertex Shader** (`shaders.ts:9-62`):

```glsl
#version 300 es

// 입력
layout(location = 0) in vec2 a_position;  // 정점 위치 (-1 ~ 1)
layout(location = 1) in vec2 a_texCoord;  // 텍스처 좌표 (0 ~ 1)

// Uniforms
uniform vec2 u_pan;
uniform float u_zoom;
uniform float u_rotation;
uniform float u_flipH;
uniform float u_flipV;
uniform vec2 u_aspectScale;

// 출력
out vec2 v_texCoord;

void main() {
  // 1. 종횡비 보정 (fit-to-viewport)
  vec2 aspectPos = a_position * u_aspectScale;

  // 2. Zoom 적용
  vec2 scaledPos = aspectPos * u_zoom;

  // 3. Flip 적용
  vec2 flippedPos = vec2(
    u_flipH > 0.5 ? -scaledPos.x : scaledPos.x,
    u_flipV > 0.5 ? -scaledPos.y : scaledPos.y
  );

  // 4. Rotation 적용
  float cosR = cos(u_rotation);
  float sinR = sin(u_rotation);
  vec2 rotatedPos = vec2(
    flippedPos.x * cosR - flippedPos.y * sinR,
    flippedPos.x * sinR + flippedPos.y * cosR
  );

  // 5. Pan 적용
  vec2 finalPos = rotatedPos + u_pan;

  gl_Position = vec4(finalPos, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
```

**Fragment Shader** (`shaders.ts:73-110`):

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_windowCenter;
uniform float u_windowWidth;
uniform float u_applyWL;

void main() {
  // 텍스처 샘플링
  vec4 texColor = texture(u_texture, v_texCoord);

  // Luminance 계산 (ITU-R BT.601)
  float luminance = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));

  // Window/Level 변환
  float safeWidth = max(u_windowWidth, 0.001);
  float lower = u_windowCenter - safeWidth / 2.0;
  float wlOutput = clamp((luminance - lower) / safeWidth, 0.0, 1.0);

  // W/L 적용 여부에 따라 결과 선택
  vec3 wlColor = vec3(wlOutput);
  vec3 finalColor = mix(texColor.rgb, wlColor, u_applyWL);

  fragColor = vec4(finalColor, texColor.a);
}
```

### 6.3 종횡비 보정

**함수**: `calculateAspectScale()`

```typescript
// QuadRenderer.ts:60-82
export function calculateAspectScale(
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number
): AspectScaleOptions {
  const imageAspect = imageWidth / imageHeight;
  const viewportAspect = viewportWidth / viewportHeight;

  let scaleX = 1.0;
  let scaleY = 1.0;

  if (imageAspect > viewportAspect) {
    // 이미지가 더 넓음 → 가로에 맞추고 세로 축소 (letterbox)
    scaleY = viewportAspect / imageAspect;
  } else {
    // 이미지가 더 높음 → 세로에 맞추고 가로 축소 (pillarbox)
    scaleX = imageAspect / viewportAspect;
  }

  return { scaleX, scaleY };
}
```

---

## 7. 재생 및 프레임 동기화

### 7.1 단일 뷰포트 Cine 재생

**컴포넌트**: `SingleDicomViewer.tsx`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Cine 재생 루프                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [isPlaying = true]                                                     │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              requestAnimationFrame 루프                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  1. 경과 시간 계산                                               │    │
│  │     elapsed = timestamp - lastFrameTime                          │    │
│  │                                                                   │    │
│  │  2. 프레임 간격 확인                                              │    │
│  │     frameInterval = 1000 / fps                                   │    │
│  │                                                                   │    │
│  │  3. 프레임 업데이트 필요?                                         │    │
│  │     if (elapsed >= frameInterval) {                              │    │
│  │       currentFrame = (currentFrame + 1) % totalFrames            │    │
│  │       renderFrame(currentFrame)                                  │    │
│  │       lastFrameTime = timestamp - (elapsed % frameInterval)      │    │
│  │     }                                                             │    │
│  │                                                                   │    │
│  │  4. 다음 프레임 예약                                              │    │
│  │     requestAnimationFrame(animate)                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**코드** (`SingleDicomViewer.tsx:733-772`):

```typescript
useEffect(() => {
  if (!webglReady || !isPlaying || totalFrames === 0) {
    return;
  }

  const frameInterval = 1000 / fps;

  const animate = (timestamp: number) => {
    if (!lastFrameTimeRef.current) {
      lastFrameTimeRef.current = timestamp;
    }

    const elapsed = timestamp - lastFrameTimeRef.current;

    if (elapsed >= frameInterval) {
      // 정확한 타이밍을 위해 나머지 시간 보정
      lastFrameTimeRef.current = timestamp - (elapsed % frameInterval);

      setCurrentFrame((prev) => {
        const nextFrame = (prev + 1) % totalFrames;
        canvasRef.current?.renderFrame(nextFrame);
        return nextFrame;
      });
    }

    animationRef.current = requestAnimationFrame(animate);
  };

  animationRef.current = requestAnimationFrame(animate);

  return () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };
}, [webglReady, isPlaying, totalFrames, fps]);
```

### 7.2 멀티 뷰포트 동기화

**모듈**: `FrameSyncEngine.ts`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    프레임 동기화 (Stress Echo)                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  문제: 시리즈마다 프레임 수가 다름                                       │
│  예) Master: 47프레임, Slave1: 94프레임, Slave2: 62프레임               │
│                                                                         │
│  해결: Frame Ratio 방식                                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    동기화 그룹 구조                              │    │
│  │                                                                   │    │
│  │  ┌─────────────┐                                                 │    │
│  │  │   Master    │ ──────────────────────────────────────┐         │    │
│  │  │ (Viewport 1)│  currentFrame: 10                     │         │    │
│  │  │  47 frames  │  ──────────────────────┐              │         │    │
│  │  └─────────────┘                        │              │         │    │
│  │                                         ▼              ▼         │    │
│  │                              ┌─────────────┐  ┌─────────────┐    │    │
│  │                              │   Slave 1   │  │   Slave 2   │    │    │
│  │                              │ (Viewport 2)│  │ (Viewport 3)│    │    │
│  │                              │  94 frames  │  │  62 frames  │    │    │
│  │                              └─────────────┘  └─────────────┘    │    │
│  │                                                                   │    │
│  │  동기화 계산:                                                     │    │
│  │  - Slave1 frame = (10/47) × 94 ≈ 20                              │    │
│  │  - Slave2 frame = (10/47) × 62 ≈ 13                              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**코드** (`FrameSyncEngine.ts:162-174`):

```typescript
calculateSyncedFrame(
  masterFrame: number,
  masterTotal: number,
  slaveTotal: number
): number {
  if (masterTotal <= 0 || slaveTotal <= 0) {
    return 0;
  }

  // 비율 계산: masterFrame / masterTotal = slaveFrame / slaveTotal
  const ratio = masterFrame / masterTotal;
  const slaveFrame = Math.floor(ratio * slaveTotal);

  // 범위 제한 (0 ~ slaveTotal-1)
  return Math.max(0, Math.min(slaveFrame, slaveTotal - 1));
}
```

### 7.3 RenderScheduler (멀티 뷰포트 루프)

**모듈**: `RenderScheduler.ts`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    RenderScheduler 동작                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  단일 requestAnimationFrame 루프로 모든 뷰포트 렌더링                    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    tick(timestamp)                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  1. 전체 Canvas 클리어                                           │    │
│  │     gl.clearColor(0.1, 0.1, 0.1, 1)                              │    │
│  │     gl.clear(gl.COLOR_BUFFER_BIT)                                │    │
│  │                                                                   │    │
│  │  2. Scissor Test 활성화                                          │    │
│  │     gl.enable(gl.SCISSOR_TEST)                                   │    │
│  │                                                                   │    │
│  │  3. 각 뷰포트에 대해:                                            │    │
│  │     ┌───────────────────────────────────────────────────────┐    │    │
│  │     │ a. 재생 중이면 프레임 업데이트                         │    │    │
│  │     │    updateViewportFrame(viewport, timestamp)           │    │    │
│  │     │                                                        │    │    │
│  │     │ b. 렌더링 영역 설정                                    │    │    │
│  │     │    gl.scissor(x, y, width, height)                    │    │    │
│  │     │    gl.viewport(x, y, width, height)                   │    │    │
│  │     │                                                        │    │    │
│  │     │ c. 렌더링 콜백 호출                                    │    │    │
│  │     │    onRenderViewport(viewportId, currentFrame, bounds) │    │    │
│  │     └───────────────────────────────────────────────────────┘    │    │
│  │                                                                   │    │
│  │  4. Scissor Test 비활성화                                        │    │
│  │     gl.disable(gl.SCISSOR_TEST)                                  │    │
│  │                                                                   │    │
│  │  5. 다음 프레임 예약                                              │    │
│  │     requestAnimationFrame(tick)                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. 이벤트 처리 흐름

### 8.1 Tool System 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Tool System 구조                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      ToolManager                                 │    │
│  │  - 전역 도구 등록 및 관리                                        │    │
│  │  - WindowLevel, Pan, Zoom, StackScroll 등 기본 도구              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                       ToolGroup                                  │    │
│  │  - 뷰포트별 도구 바인딩 관리                                     │    │
│  │  - 마우스 버튼 + 모디파이어 키 → 도구 매핑                       │    │
│  │                                                                   │    │
│  │  바인딩 예시:                                                    │    │
│  │  - Primary (좌클릭) → WindowLevel                                │    │
│  │  - Secondary (우클릭) → Zoom                                     │    │
│  │  - Middle (휠클릭) → Pan                                         │    │
│  │  - Wheel → StackScroll                                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    useToolGroup (React Hook)                     │    │
│  │  - DOM 이벤트 → 정규화된 ToolEvent 변환                          │    │
│  │  - 바인딩된 도구의 핸들러 호출                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 마우스 이벤트 흐름

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       마우스 이벤트 처리 흐름                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [DOM Event]                                                            │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    eventNormalizer                               │    │
│  │  - 브라우저간 이벤트 차이 정규화                                 │    │
│  │  - 버튼 코드 표준화                                              │    │
│  │  - 좌표 계산 (client → canvas)                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    ToolEvent 생성                                │    │
│  │  {                                                               │    │
│  │    type: 'pointerdown' | 'pointermove' | 'pointerup'            │    │
│  │    viewportId: string                                           │    │
│  │    button: Primary | Secondary | Middle                         │    │
│  │    modifierKey: Shift | Ctrl | Alt | None                       │    │
│  │    points: { current, previous, start }                         │    │
│  │    delta: { x, y }                                              │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    ToolGroup.handleEvent()                       │    │
│  │  - 바인딩에서 활성 도구 찾기                                     │    │
│  │  - 도구의 해당 핸들러 호출                                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    BaseTool.onDrag()                             │    │
│  │  - 각 도구별 로직 실행                                           │    │
│  │  - ViewportManager를 통해 상태 업데이트                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    React State Update                            │    │
│  │  - setWindowCenter(), setZoom(), setPan() 등                    │    │
│  │  - 재렌더링 트리거                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Window/Level 도구 예시

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Window/Level 도구 동작                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [마우스 드래그]                                                        │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  WindowLevelTool.onDrag(event)                                   │    │
│  │                                                                   │    │
│  │  // 드래그 방향에 따른 W/L 계산                                   │    │
│  │  const deltaX = event.delta.x;  // 수평 → Window Width           │    │
│  │  const deltaY = event.delta.y;  // 수직 → Window Center          │    │
│  │                                                                   │    │
│  │  const viewport = viewportManager.getViewport(event.viewportId); │    │
│  │  const currentWL = viewport.windowLevel;                         │    │
│  │                                                                   │    │
│  │  // 민감도 조정                                                   │    │
│  │  const sensitivity = viewport.series.bitsStored > 8 ? 2 : 0.5;  │    │
│  │                                                                   │    │
│  │  const newCenter = currentWL.center + deltaY * sensitivity;     │    │
│  │  const newWidth = Math.max(1, currentWL.width + deltaX * sensitivity);│
│  │                                                                   │    │
│  │  viewportManager.setViewportWindowLevel(viewportId, {           │    │
│  │    center: newCenter,                                            │    │
│  │    width: newWidth                                               │    │
│  │  });                                                             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                 │
│       ▼                                                                 │
│  [React State Update]                                                   │
│       │                                                                 │
│       ▼                                                                 │
│  [useEffect: W/L 변경 감지]                                             │
│       │                                                                 │
│       ▼                                                                 │
│  canvasRef.current.renderFrame(currentFrame)                           │
│       │                                                                 │
│       ▼                                                                 │
│  [화면 업데이트]                                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.4 어노테이션 도구 (MeasurementTool)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    어노테이션 그리기 흐름                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [마우스 클릭]                                                          │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Canvas → DICOM 좌표 변환                                        │    │
│  │  coordinateTransformer.canvasToDicom(canvasPoint, transformContext)│   │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  LengthTool.handleMouseDown(event)                               │    │
│  │                                                                   │    │
│  │  if (state === 'ready') {                                        │    │
│  │    // 첫 번째 점 기록                                            │    │
│  │    points[0] = { x: event.dicomX, y: event.dicomY }             │    │
│  │    state = 'drawing'                                             │    │
│  │  } else if (state === 'drawing') {                               │    │
│  │    // 두 번째 점 기록 → 어노테이션 완료                          │    │
│  │    points[1] = { x: event.dicomX, y: event.dicomY }             │    │
│  │    createAnnotation()                                            │    │
│  │    state = 'ready'                                               │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                 │
│       ▼                                                                 │
│  [마우스 이동 시: 미리보기]                                             │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  LengthTool.handleMouseMove(event)                               │    │
│  │                                                                   │    │
│  │  if (state === 'drawing') {                                      │    │
│  │    onTempUpdate({                                                │    │
│  │      type: 'length',                                             │    │
│  │      points: [points[0], { x: event.dicomX, y: event.dicomY }]  │    │
│  │    })                                                            │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                 │
│       ▼                                                                 │
│  [SVGOverlay: 임시 어노테이션 렌더링]                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. 전체 데이터 흐름도

### 9.1 로컬 파일 전체 흐름

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         로컬 파일 → 화면 렌더링 전체 흐름                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  사용자 ──▶ <input type="file"> ──▶ FileReader ──▶ ArrayBuffer                 │
│                                                           │                     │
│                                                           ▼                     │
│                                   ┌───────────────────────────────────────┐     │
│                                   │         DicomParser                    │     │
│                                   │                                        │     │
│                                   │  isDicomFile() ──▶ 유효성 검증        │     │
│                                   │         │                              │     │
│                                   │         ▼                              │     │
│                                   │  parseDicom() ──▶ DicomDataset        │     │
│                                   │         │                              │     │
│                                   │         ▼                              │     │
│                                   │  getImageInfo() ──▶ DicomImageInfo    │     │
│                                   │         │                              │     │
│                                   │         ▼                              │     │
│                                   │  extractPixelData() ──▶ Uint8Array[]  │     │
│                                   └───────────────────────────────────────┘     │
│                                                           │                     │
│                                                           ▼                     │
│                                   ┌───────────────────────────────────────┐     │
│                                   │     React State (SingleDicomViewer)   │     │
│                                   │                                        │     │
│                                   │  frames: Uint8Array[]                 │     │
│                                   │  imageInfo: DicomImageInfo            │     │
│                                   │  isEncapsulated: boolean              │     │
│                                   └───────────────────────────────────────┘     │
│                                                           │                     │
│                                                           ▼                     │
│                         ┌────────────────────────────────────────────────┐      │
│                         │              DicomCanvas                        │      │
│                         │                                                 │      │
│                         │    useEffect (WebGL 초기화)                     │      │
│                         │         │                                       │      │
│                         │         ▼                                       │      │
│                         │    WebGL2RenderingContext                      │      │
│                         │    TextureManager                               │      │
│                         │    QuadRenderer                                 │      │
│                         │         │                                       │      │
│                         │         ▼                                       │      │
│                         │    renderFrame(0) 호출                         │      │
│                         └────────────────────────────────────────────────┘      │
│                                                           │                     │
│                                                           ▼                     │
│           ┌──────────────────────────────────────────────────────────────┐      │
│           │                    renderFrame(frameIndex)                    │      │
│           │                                                               │      │
│           │    1. frames[frameIndex] 가져오기                            │      │
│           │                   │                                           │      │
│           │                   ▼                                           │      │
│           │    2. ┌─────────────────────┐                                │      │
│           │       │ isEncapsulated?     │                                │      │
│           │       └─────────────────────┘                                │      │
│           │           │ Yes         │ No                                 │      │
│           │           ▼             ▼                                    │      │
│           │       decodeJpeg()  decodeNative()                          │      │
│           │           │             │                                    │      │
│           │           └──────┬──────┘                                    │      │
│           │                  ▼                                           │      │
│           │    3. DecodedFrame (ImageBitmap)                            │      │
│           │                  │                                           │      │
│           │                  ▼                                           │      │
│           │    4. textureManager.upload(decodedFrame.image)             │      │
│           │                  │                                           │      │
│           │                  ▼                                           │      │
│           │    5. textureManager.bind(0)                                │      │
│           │                  │                                           │      │
│           │                  ▼                                           │      │
│           │    6. quadRenderer.render(0, windowLevel, transform, aspectScale)│   │
│           │                  │                                           │      │
│           │                  ▼                                           │      │
│           │    7. closeDecodedFrame(decodedFrame)                       │      │
│           └──────────────────────────────────────────────────────────────┘      │
│                                                           │                     │
│                                                           ▼                     │
│                                                  [Canvas에 이미지 표시]         │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 WADO-RS 전체 흐름

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         WADO-RS → 화면 렌더링 전체 흐름                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  사용자 ──▶ WadoConfigPanel (UID 입력) ──▶ "Load" 버튼 클릭                    │
│                                                   │                             │
│                                                   ▼                             │
│                              ┌────────────────────────────────────────┐         │
│                              │          useWadoLoader                 │         │
│                              │                                        │         │
│                              │  loadInstance(config)                  │         │
│                              │         │                              │         │
│                              │         ▼                              │         │
│                              │  WadoRsDataSource 생성                 │         │
│                              └────────────────────────────────────────┘         │
│                                                   │                             │
│                                                   ▼                             │
│             ┌──────────────────────────────────────────────────────────────┐    │
│             │                   WadoRsDataSource                            │    │
│             │                                                               │    │
│             │  loadAllFrames(instanceId)                                   │    │
│             │         │                                                     │    │
│             │         ├──▶ loadMetadata() ──────┬──────▶ HTTP GET          │    │
│             │         │         │               │    /instances/{uid}/metadata│   │
│             │         │         ▼               ▼                           │    │
│             │         │    parseDicomJson()   PACS Server                   │    │
│             │         │         │               │                           │    │
│             │         │         ▼               │                           │    │
│             │         │    DicomMetadata ◀──────┘                          │    │
│             │         │                                                     │    │
│             │         └──▶ loadFrame(1..N) ─────┬──────▶ HTTP GET          │    │
│             │                   │               │    /instances/{uid}/frames/N │  │
│             │                   ▼               ▼                           │    │
│             │              Uint8Array[] ◀───────┘                          │    │
│             │              (JPEG or raw)                                    │    │
│             └──────────────────────────────────────────────────────────────┘    │
│                                                   │                             │
│                                                   ▼                             │
│                              ┌────────────────────────────────────────┐         │
│                              │     React State (SingleViewportPage)   │         │
│                              │                                        │         │
│                              │  viewportData = {                      │         │
│                              │    frames,                             │         │
│                              │    imageInfo,                          │         │
│                              │    isEncapsulated                      │         │
│                              │  }                                     │         │
│                              └────────────────────────────────────────┘         │
│                                                   │                             │
│                                                   ▼                             │
│                              [SingleDicomViewer로 전달]                         │
│                                                   │                             │
│                                                   ▼                             │
│                              [이후 로컬 파일과 동일한 렌더링 흐름]               │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Cine 재생 흐름

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Cine 재생 흐름                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  사용자 ──▶ "Play" 버튼 클릭 ──▶ setIsPlaying(true)                            │
│                                          │                                      │
│                                          ▼                                      │
│                 ┌────────────────────────────────────────────────────┐          │
│                 │          useEffect (재생 루프 시작)                 │          │
│                 │                                                     │          │
│                 │  requestAnimationFrame(animate)                    │          │
│                 └────────────────────────────────────────────────────┘          │
│                                          │                                      │
│                                          ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                        animate(timestamp)                                  │  │
│  │                                                                            │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐  │  │
│  │  │  elapsed = timestamp - lastFrameTime                                 │  │  │
│  │  │                                                                      │  │  │
│  │  │  if (elapsed >= frameInterval) {                                     │  │  │
│  │  │    // 프레임 업데이트                                                │  │  │
│  │  │    currentFrame = (currentFrame + 1) % totalFrames                  │  │  │
│  │  │                                                                      │  │  │
│  │  │    // 렌더링                                                         │  │  │
│  │  │    canvasRef.current.renderFrame(currentFrame)                      │  │  │
│  │  │                                                                      │  │  │
│  │  │    // 타이밍 보정                                                    │  │  │
│  │  │    lastFrameTime = timestamp - (elapsed % frameInterval)            │  │  │
│  │  │  }                                                                   │  │  │
│  │  └─────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                            │  │
│  │  // 다음 프레임 예약                                                       │  │
│  │  animationId = requestAnimationFrame(animate)                             │  │
│  │                                                                            │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                          │                                      │
│                                          ▼                                      │
│                           [30fps = 33.3ms 간격으로 반복]                        │
│                                                                                 │
│  정지:                                                                          │
│  사용자 ──▶ "Pause" 버튼 클릭 ──▶ setIsPlaying(false)                          │
│                                          │                                      │
│                                          ▼                                      │
│                 ┌────────────────────────────────────────────────────┐          │
│                 │  useEffect cleanup                                  │          │
│                 │  cancelAnimationFrame(animationId)                  │          │
│                 └────────────────────────────────────────────────────┘          │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 부록: 핵심 타입 정의

### DicomImageInfo

```typescript
interface DicomImageInfo {
  rows: number;                     // 이미지 높이
  columns: number;                  // 이미지 너비
  bitsAllocated: number;           // 픽셀당 할당 비트 (8, 16)
  bitsStored: number;              // 실제 사용 비트
  highBit: number;                 // 최상위 비트
  samplesPerPixel: number;         // 채널 수 (1=그레이, 3=RGB)
  photometricInterpretation: string; // MONOCHROME2, RGB 등
  pixelRepresentation: number;     // 0=unsigned, 1=signed
  pixelSpacing?: PixelSpacing;     // mm/pixel (캘리브레이션)
  ultrasoundCalibration?: UltrasoundCalibration;  // 초음파 영역 캘리브레이션
}
```

### DecodedFrame

```typescript
interface DecodedFrame {
  image: ImageBitmap | VideoFrame;  // GPU 업로드 가능한 이미지
  type: 'imageBitmap' | 'videoFrame';
}
```

### ViewportData

```typescript
interface ViewportData {
  frames: Uint8Array[];        // 각 프레임의 압축/비압축 데이터
  imageInfo: DicomImageInfo;   // DICOM 메타데이터
  isEncapsulated: boolean;     // true=JPEG, false=Native
}
```

---

## 관련 문서

- [DICOM 파일 기본 이해](./dicom-fundamentals.md)
- [Core 기반 기술](./core-technologies.md) (WebGL, 디코딩, 캐싱)
- [Cornerstone vs EchoPixel](./cornerstone-vs-echopixel.md)
- [프로젝트 구조](./project-structure.md)
