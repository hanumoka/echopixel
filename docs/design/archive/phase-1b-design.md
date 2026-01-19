# Phase 1b 설계: DICOM 파싱 + 디코딩

## 목표

```
로컬 DICOM 파일 → 브라우저 화면에 이미지 표시
```

---

## 데이터 흐름

```
1. 사용자가 DICOM 파일 선택
         │
         ▼
2. 파일 → ArrayBuffer (바이너리 데이터)
         │
         ▼
3. DICOM 파서: 메타데이터 + 픽셀 데이터 분리
         │
         ├── 메타데이터: 이미지 크기, 프레임 수 등
         │
         └── 픽셀 데이터: JPEG 압축된 이미지들
                  │
                  ▼
4. WebCodecs ImageDecoder: JPEG → 픽셀 배열
         │
         ▼
5. WebGL 텍스처 업로드
         │
         ▼
6. 화면에 렌더링
```

---

## 핵심 설계 결정

### 1. DICOM 파일 식별 전략

**확장자가 아닌 파일 내용으로 판단**

| 확장자 유형 | 예시 | 대응 |
|------------|------|------|
| `.dcm` | `CT001.dcm` | 지원 |
| `.dicom` | `MR_001.dicom` | 지원 |
| `.dic` | `US001.dic` | 지원 |
| 없음 | `IM00001` | 지원 |
| UID 형태 | `1.2.840.113619...` | 지원 |

```typescript
function isDicomFile(buffer: ArrayBuffer): boolean {
  const view = new DataView(buffer)

  // 방법 1: DICM prefix 확인 (offset 128~131)
  const prefix = String.fromCharCode(
    view.getUint8(128),
    view.getUint8(129),
    view.getUint8(130),
    view.getUint8(131)
  )

  if (prefix === 'DICM') {
    return true
  }

  // 방법 2: DICM 없는 레거시 DICOM
  // 첫 번째 태그가 유효한 DICOM 태그인지 확인
  return isValidDicomTag(view, 0)
}
```

### 2. Modality 검증 전략: 범용 DICOM 뷰어

**결정: 심장초음파 전용 필터링 하지 않음**

이유:
- DICOM 메타데이터는 신뢰할 수 없음 (누락, 오류 흔함)
- 뷰어의 역할은 "이미지를 잘 보여주는 것"
- 사용자가 파일을 선택했다면 보여줘야 함

```typescript
// 간단한 검증만 수행
interface LoadResult {
  success: boolean
  error?: string
  dataset?: DicomDataset
}

function loadDicom(buffer: ArrayBuffer): LoadResult {
  // 1. DICOM 파일인지만 확인
  if (!isDicomFile(buffer)) {
    return { success: false, error: 'DICOM 파일이 아닙니다' }
  }

  // 2. 파싱
  const dataset = parser.parse(buffer)

  // 3. 픽셀 데이터 존재 확인
  if (!dataset.hasPixelData()) {
    return { success: false, error: '이미지 데이터가 없습니다' }
  }

  // 4. 성공 - Modality가 뭐든 상관없음
  return { success: true, dataset }
}
```

### 3. 단일 프레임 → 멀티프레임 단계적 진행

**Phase 1b-1: 단일 프레임 먼저**
- DICOM 파서 기본 구현
- 단일 프레임 픽셀 데이터 추출
- WebCodecs 디코딩
- 화면에 1장 표시

**Phase 1b-2: 멀티프레임 확장**
- Basic Offset Table 파싱
- 특정 프레임 추출
- 프레임 선택 UI
- 선택한 프레임 표시

---

## DICOM 파일 구조

```
┌────────────────────────────────┐
│  Preamble (128 bytes)          │  ← 보통 비어있음
├────────────────────────────────┤
│  Prefix "DICM" (4 bytes)       │  ← DICOM 파일 식별자
├────────────────────────────────┤
│  Meta Information Header       │  ← 파일 정보
├────────────────────────────────┤
│  Data Elements (Tags)          │  ← 메타데이터
│  ┌──────────────────────────┐  │
│  │ (0028,0010) Rows         │  │
│  │ (0028,0011) Columns      │  │
│  │ (0028,0008) Num Frames   │  │
│  │ ...                      │  │
│  └──────────────────────────┘  │
├────────────────────────────────┤
│  Pixel Data (7FE0,0010)        │  ← 실제 이미지 데이터
│  ┌──────────────────────────┐  │
│  │ Frame 1 (JPEG)           │  │
│  │ Frame 2 (JPEG)           │  │
│  │ ...                      │  │
│  └──────────────────────────┘  │
└────────────────────────────────┘
```

---

## 핵심 추출 태그

| 태그 | 이름 | 용도 |
|------|------|------|
| (0028,0010) | Rows | 이미지 높이 |
| (0028,0011) | Columns | 이미지 너비 |
| (0028,0008) | Number of Frames | 프레임 수 |
| (0028,0100) | Bits Allocated | 픽셀당 비트 수 |
| (0028,0004) | Photometric Interpretation | 색상 모델 |
| (0018,1063) | Frame Time | 프레임 간격 (ms) |
| (0002,0010) | Transfer Syntax UID | 압축 방식 |
| (7FE0,0010) | Pixel Data | 실제 이미지 데이터 |

---

## Transfer Syntax (압축 방식)

### Phase 1에서 지원

| Transfer Syntax UID | 이름 | 디코더 |
|---------------------|------|--------|
| 1.2.840.10008.1.2 | Implicit VR Little Endian | Native |
| 1.2.840.10008.1.2.1 | Explicit VR Little Endian | Native |
| 1.2.840.10008.1.2.4.50 | JPEG Baseline | WebCodecs |
| 1.2.840.10008.1.2.4.51 | JPEG Extended | WebCodecs |

### Phase 5에서 지원 (WASM)

| Transfer Syntax UID | 이름 | 디코더 |
|---------------------|------|--------|
| 1.2.840.10008.1.2.4.70 | JPEG Lossless | WASM |
| 1.2.840.10008.1.2.4.80 | JPEG-LS Lossless | WASM |
| 1.2.840.10008.1.2.4.90 | JPEG 2000 Lossless | WASM |
| 1.2.840.10008.1.2.5 | RLE Lossless | WASM |

---

## 구현할 인터페이스

```typescript
// DICOM 파서
interface DicomParser {
  static isDicom(buffer: ArrayBuffer): boolean
  parse(buffer: ArrayBuffer): DicomDataset
}

// DICOM 데이터셋
interface DicomDataset {
  getString(tag: string): string | undefined
  getNumber(tag: string): number | undefined
  hasPixelData(): boolean
  getPixelData(): ArrayBuffer
  getNumberOfFrames(): number
  getFrame(index: number): ArrayBuffer
}

// 디코더
interface FrameDecoder {
  decode(frameData: ArrayBuffer): Promise<VideoFrame | ImageBitmap>
  dispose(): void
}
```

---

## 테스트 파일

```
python/output/
├── echo_multiframe_30frames.dcm     ← 멀티프레임 (30장)
└── single_frames/
    ├── echo_frame_001.dcm           ← 단일 프레임
    ├── echo_frame_002.dcm
    └── ...
```

진행 순서:
1. `echo_frame_001.dcm` (단일) → 동작 확인
2. `echo_multiframe_30frames.dcm` (멀티) → 확장

---

## Phase 1b 완료 기준

| 기능 | 상태 |
|------|------|
| 단일 프레임 DICOM 로드 | 필수 |
| 멀티프레임 DICOM 로드 | 필수 |
| 특정 프레임 선택 표시 | 필수 |
| 파일 유효성 검증 | 필수 |
| Cine 재생 (자동) | Phase 1c |

---

## 예상 결과 화면

```
┌─────────────────────────────────┐
│  EchoPixel Demo                 │
│                                 │
│  [파일 선택] sample.dcm         │
│                                 │
│  ┌───────────────────────────┐  │
│  │                           │  │
│  │    DICOM 이미지 표시       │  │
│  │                           │  │
│  └───────────────────────────┘  │
│                                 │
│  Frame: [1] / 30  [<] [>]       │
│                                 │
└─────────────────────────────────┘
```
