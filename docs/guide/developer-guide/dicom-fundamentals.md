# DICOM 파일 근본적 이해

이 문서에서는 DICOM 파일 포맷의 구조와 원리를 근본적으로 설명합니다. EchoPixel Core 개발에 필요한 DICOM 지식을 다룹니다.

---

## 목차

1. [DICOM이란?](#dicom이란)
2. [DICOM 파일 구조](#dicom-파일-구조)
3. [데이터 요소 (Data Element)](#데이터-요소-data-element)
4. [픽셀 데이터](#픽셀-데이터)
5. [Multi-frame DICOM](#multi-frame-dicom)
6. [Transfer Syntax](#transfer-syntax)
7. [EchoPixel에서의 DICOM 파싱](#echopixel에서의-dicom-파싱)

---

## DICOM이란?

### 정의

**DICOM** (Digital Imaging and Communications in Medicine)은 의료 영상 저장 및 전송을 위한 국제 표준입니다.

```
DICOM의 역할
──────────────

1. 파일 포맷: 의료 영상 + 환자 정보를 하나의 파일에 저장
2. 통신 프로토콜: 의료 기기 간 영상 전송 표준
3. 워크플로우: PACS, 모달리티 간 연동 표준
```

### DICOM 표준 구성

[DICOM 표준](https://www.dicomstandard.org/)은 여러 Part로 구성됩니다:

| Part | 내용 | EchoPixel 관련성 |
|------|------|------------------|
| **Part 3** | 정보 객체 정의 (IOD) | 중간 |
| **Part 5** | 데이터 구조 및 인코딩 | **높음** |
| **Part 6** | 데이터 딕셔너리 | **높음** |
| **Part 10** | 파일 포맷 | **높음** |
| **Part 18** | Web Services (WADO) | 중간 |

---

## DICOM 파일 구조

### 전체 레이아웃

```
DICOM 파일 구조
────────────────

Offset 0
┌────────────────────────────────────────────────┐
│                  Preamble                       │
│                  (128 bytes)                    │
│     모두 0x00 또는 애플리케이션 정의 데이터      │
├────────────────────────────────────────────────┤
│                  DICM Prefix                    │  Offset 128
│                  (4 bytes)                      │
│              "DICM" 문자열 (ASCII)              │
├────────────────────────────────────────────────┤
│                                                 │  Offset 132
│              File Meta Information              │
│                                                 │
│   Group 0002 태그들:                            │
│   - (0002,0000) File Meta Info Length          │
│   - (0002,0001) File Meta Info Version         │
│   - (0002,0010) Transfer Syntax UID  ← 중요!   │
│   - (0002,0012) Implementation Class UID       │
│                                                 │
├────────────────────────────────────────────────┤
│                                                 │
│                   Data Set                      │
│                                                 │
│   실제 DICOM 데이터 요소들:                     │
│   - (0008,xxxx) Study Information              │
│   - (0010,xxxx) Patient Information            │
│   - (0028,xxxx) Image Pixel Description        │
│   - (7FE0,0010) Pixel Data  ← 이미지 데이터!   │
│                                                 │
└────────────────────────────────────────────────┘
```

### 바이너리 레벨 분석

```javascript
// DICOM 파일 시작 부분 분석 예시

const buffer = await file.arrayBuffer();
const view = new DataView(buffer);

// 1. Preamble 확인 (128 bytes, 보통 모두 0)
const preamble = new Uint8Array(buffer, 0, 128);
console.log('Preamble (first 16):', preamble.slice(0, 16));
// 출력: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

// 2. DICM 매직 넘버 확인 (offset 128-131)
const magic = String.fromCharCode(
  view.getUint8(128),
  view.getUint8(129),
  view.getUint8(130),
  view.getUint8(131)
);
console.log('Magic:', magic);  // 출력: "DICM"

// 3. File Meta Information 시작 (offset 132)
// 첫 번째 태그: (0002,0000) File Meta Info Length
const group = view.getUint16(132, true);   // 0x0002
const element = view.getUint16(134, true); // 0x0000
console.log(`First Tag: (${group.toString(16)},${element.toString(16)})`);
// 출력: "First Tag: (2,0)"
```

### EchoPixel의 DICOM 검증

```typescript
// packages/core/src/dicom/parser.ts

export function isDicomFile(buffer: ArrayBuffer): boolean {
  // 최소 크기 확인 (132 bytes: preamble + "DICM")
  if (buffer.byteLength < 132) {
    return false;
  }

  // "DICM" 매직 넘버 확인 (offset 128-131)
  const view = new DataView(buffer);
  const d = view.getUint8(128);
  const i = view.getUint8(129);
  const c = view.getUint8(130);
  const m = view.getUint8(131);

  return d === 0x44 && i === 0x49 && c === 0x43 && m === 0x4D;
  // 'D' = 0x44, 'I' = 0x49, 'C' = 0x43, 'M' = 0x4D
}
```

---

## 데이터 요소 (Data Element)

### 데이터 요소 구조

DICOM의 모든 정보는 **Data Element**로 구성됩니다.

```
Data Element 구조 (Explicit VR)
────────────────────────────────

일반 VR (OB, OW, OF, SQ, UT, UN 제외):
┌────────┬────────┬────┬────────┬──────────────────┐
│ Group  │Element │ VR │ Length │      Value       │
│ 2 bytes│2 bytes │2 b │ 2 bytes│ Length bytes     │
└────────┴────────┴────┴────────┴──────────────────┘

긴 VR (OB, OW, OF, SQ, UT, UN):
┌────────┬────────┬────┬────────┬────────┬──────────────────┐
│ Group  │Element │ VR │Reserved│ Length │      Value       │
│ 2 bytes│2 bytes │2 b │ 2 bytes│ 4 bytes│ Length bytes     │
└────────┴────────┴────┴────────┴────────┴──────────────────┘
```

### 태그 (Tag) 이해하기

DICOM 태그는 **(Group, Element)** 형식의 4바이트 식별자입니다.

```
주요 DICOM 태그
──────────────────

Patient Information (0010,xxxx):
├── (0010,0010) Patient Name        "홍길동"
├── (0010,0020) Patient ID          "12345"
└── (0010,0030) Patient Birth Date  "19800101"

Study Information (0008,xxxx):
├── (0008,0020) Study Date          "20240115"
├── (0008,0060) Modality            "US" (초음파)
└── (0008,1030) Study Description   "심초음파"

Image Information (0028,xxxx):
├── (0028,0010) Rows                512
├── (0028,0011) Columns             512
├── (0028,0100) Bits Allocated      8
├── (0028,0101) Bits Stored         8
├── (0028,1050) Window Center       128
└── (0028,1051) Window Width        256

Pixel Data (7FE0,xxxx):
└── (7FE0,0010) Pixel Data          [바이너리 이미지 데이터]
```

### VR (Value Representation)

VR은 데이터의 타입을 나타냅니다.

| VR | 이름 | 설명 | 예시 |
|----|------|------|------|
| **US** | Unsigned Short | 부호 없는 16비트 정수 | Rows, Columns |
| **SS** | Signed Short | 부호 있는 16비트 정수 | |
| **UL** | Unsigned Long | 부호 없는 32비트 정수 | Length 필드 |
| **DS** | Decimal String | 소수점 문자열 | "3.14159" |
| **IS** | Integer String | 정수 문자열 | "512" |
| **LO** | Long String | 긴 문자열 (64자) | Patient Name |
| **PN** | Person Name | 환자 이름 | "홍길동" |
| **DA** | Date | 날짜 (YYYYMMDD) | "20240115" |
| **TM** | Time | 시간 (HHMMSS) | "143022" |
| **UI** | Unique Identifier | UID | "1.2.840.10008..." |
| **OB** | Other Byte | 바이트 배열 | Pixel Data |
| **OW** | Other Word | 워드 배열 | Pixel Data |
| **SQ** | Sequence | 중첩 데이터셋 | |

### 바이트 순서와 파싱

```javascript
// Data Element 파싱 예시

function parseDataElement(buffer, offset) {
  const view = new DataView(buffer);

  // 1. 태그 읽기 (Little Endian)
  const group = view.getUint16(offset, true);      // true = Little Endian
  const element = view.getUint16(offset + 2, true);
  const tag = `(${group.toString(16).padStart(4, '0')},${element.toString(16).padStart(4, '0')})`;

  // 2. VR 읽기 (Explicit VR인 경우)
  const vr = String.fromCharCode(
    view.getUint8(offset + 4),
    view.getUint8(offset + 5)
  );

  // 3. Length 읽기 (VR에 따라 다름)
  let length, valueOffset;

  if (['OB', 'OW', 'OF', 'SQ', 'UT', 'UN'].includes(vr)) {
    // 긴 VR: 2 bytes reserved + 4 bytes length
    length = view.getUint32(offset + 8, true);
    valueOffset = offset + 12;
  } else {
    // 일반 VR: 2 bytes length
    length = view.getUint16(offset + 6, true);
    valueOffset = offset + 8;
  }

  return { tag, vr, length, valueOffset };
}
```

---

## 픽셀 데이터

### Pixel Data 태그 (7FE0,0010)

이미지 픽셀 데이터는 **(7FE0,0010)** 태그에 저장됩니다.

```
Pixel Data 구조
────────────────

비압축 (Native):
┌──────────────────────────────────────────────────────┐
│ (7FE0,0010) | OW | Length | Raw Pixel Bytes         │
│                           │                          │
│                           │ ┌──────────────────────┐│
│                           │ │ Frame 0 pixels       ││
│                           │ │ [r,c] 순서로 저장    ││
│                           │ ├──────────────────────┤│
│                           │ │ Frame 1 pixels       ││
│                           │ ├──────────────────────┤│
│                           │ │ ...                  ││
│                           │ └──────────────────────┘│
└──────────────────────────────────────────────────────┘

압축 (Encapsulated - JPEG, JPEG2000 등):
┌──────────────────────────────────────────────────────┐
│ (7FE0,0010) | OB | FFFFFFFF (Undefined Length)       │
│                           │                          │
│  ┌─────────────────────────────────────────────────┐ │
│  │ (FFFE,E000) Basic Offset Table (선택)           │ │
│  ├─────────────────────────────────────────────────┤ │
│  │ (FFFE,E000) Item - Frame 0 (JPEG 데이터)        │ │
│  ├─────────────────────────────────────────────────┤ │
│  │ (FFFE,E000) Item - Frame 1 (JPEG 데이터)        │ │
│  ├─────────────────────────────────────────────────┤ │
│  │ ...                                             │ │
│  ├─────────────────────────────────────────────────┤ │
│  │ (FFFE,E00D) Sequence Delimitation Item          │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Photometric Interpretation

이미지의 픽셀 포맷을 정의합니다.

```
Photometric Interpretation 값
─────────────────────────────

MONOCHROME1:
  - Grayscale, 낮은 값 = 밝음
  - 주로 X-Ray 필름 시뮬레이션
  - 반전 필요: displayValue = maxValue - pixelValue

MONOCHROME2:
  - Grayscale, 낮은 값 = 어두움 (일반적)
  - CT, MRI, 초음파의 기본
  - displayValue = pixelValue

RGB:
  - 컬러 이미지
  - 3 채널: Red, Green, Blue
  - Planar Configuration에 따라 저장 순서 다름

YBR_FULL:
  - JPEG 압축에 사용
  - Y (밝기) + Cb, Cr (색차)
  - RGB로 변환 필요

YBR_FULL_422:
  - 색차 서브샘플링
  - JPEG 압축에 자주 사용
```

### Bits Allocated vs Bits Stored

```
8-bit 이미지 예시
─────────────────

Bits Allocated: 8   (실제 저장 공간)
Bits Stored: 8      (사용되는 비트)
High Bit: 7         (최상위 비트 위치)

픽셀 값 범위: 0 ~ 255

저장: [ 0x00 | 0x80 | 0xFF | 0x40 | ... ]
         0     128    255    64


12-bit 이미지 예시 (CT)
──────────────────────

Bits Allocated: 16  (2 bytes per pixel)
Bits Stored: 12     (실제 12 bits만 사용)
High Bit: 11        (bit 0~11 사용)

픽셀 값 범위: 0 ~ 4095

저장 (Little Endian):
[ 0x00 0x08 ]  = 0x0800 = 2048
[ 0xFF 0x0F ]  = 0x0FFF = 4095


16-bit 이미지 예시
──────────────────

Bits Allocated: 16
Bits Stored: 16
High Bit: 15

픽셀 값 범위: 0 ~ 65535 (unsigned) 또는 -32768 ~ 32767 (signed)
```

### Rescale Slope/Intercept (CT 하운스필드)

CT 이미지에서 픽셀 값을 하운스필드 유닛(HU)으로 변환:

```
HU = pixel_value * RescaleSlope + RescaleIntercept

예시:
  RescaleSlope = 1.0
  RescaleIntercept = -1024.0

  pixel_value = 1024 → HU = 1024 * 1 + (-1024) = 0 (물)
  pixel_value = 0    → HU = 0 * 1 + (-1024) = -1024 (공기)
  pixel_value = 2048 → HU = 2048 * 1 + (-1024) = 1024 (뼈)
```

---

## Multi-frame DICOM

### Number of Frames

```
Multi-frame 구조
────────────────

(0028,0008) Number of Frames = "120"  ← 120 프레임 cine

Pixel Data 레이아웃 (비압축):
┌─────────────────────────────────────────────────────────┐
│ Frame 0   │ Frame 1   │ Frame 2   │ ... │ Frame 119   │
│ 512×512   │ 512×512   │ 512×512   │     │ 512×512     │
│ = 262144  │ = 262144  │ = 262144  │     │ = 262144    │
│  bytes    │  bytes    │  bytes    │     │  bytes      │
└─────────────────────────────────────────────────────────┘

총 크기 = 512 × 512 × 1 byte × 120 frames = 31,457,280 bytes (30MB)
```

### Frame Extraction

```typescript
// 비압축 multi-frame에서 특정 프레임 추출

function extractFrame(
  pixelData: Uint8Array,
  frameIndex: number,
  rows: number,
  columns: number,
  bytesPerPixel: number
): Uint8Array {
  const frameSize = rows * columns * bytesPerPixel;
  const startOffset = frameIndex * frameSize;

  return pixelData.slice(startOffset, startOffset + frameSize);
}

// 사용 예시
const frame5 = extractFrame(pixelData, 5, 512, 512, 1);
// frame5는 512×512 = 262,144 bytes
```

### Encapsulated Multi-frame (압축)

```
압축된 Multi-frame
──────────────────

Basic Offset Table (선택적):
┌─────────────────────────────────────────┐
│ (FFFE,E000) Item Tag                    │
│ Length = 4 × numberOfFrames             │
│ Values = [offset0, offset1, offset2, ...]│
└─────────────────────────────────────────┘

Frame Data:
┌─────────────────────────────────────────┐
│ (FFFE,E000) Item Tag                    │
│ Length = frame0 JPEG 크기               │
│ Data = JPEG 바이트 스트림               │
├─────────────────────────────────────────┤
│ (FFFE,E000) Item Tag                    │
│ Length = frame1 JPEG 크기               │
│ Data = JPEG 바이트 스트림               │
├─────────────────────────────────────────┤
│ ...                                     │
├─────────────────────────────────────────┤
│ (FFFE,E00D) Sequence Delimitation       │
└─────────────────────────────────────────┘
```

---

## Transfer Syntax

### Transfer Syntax란?

Transfer Syntax는 DICOM 데이터의 **인코딩 방식**을 정의합니다.

```
Transfer Syntax 구성 요소
────────────────────────

1. 바이트 순서 (Byte Order)
   - Little Endian: Intel x86, ARM
   - Big Endian: 일부 레거시 시스템

2. VR 인코딩 (VR Encoding)
   - Explicit VR: VR이 데이터에 명시
   - Implicit VR: VR이 데이터 딕셔너리에서 조회

3. 압축 방식 (Encapsulation)
   - Native: 비압축
   - JPEG Baseline: 손실 압축
   - JPEG Lossless: 무손실 압축
   - JPEG 2000: 웨이블릿 압축
   - RLE: Run-Length Encoding
```

### 주요 Transfer Syntax UID

| UID | 이름 | 바이트순서 | VR | 압축 |
|-----|------|------------|-----|------|
| 1.2.840.10008.1.2 | Implicit VR Little Endian | LE | Implicit | 없음 |
| **1.2.840.10008.1.2.1** | **Explicit VR Little Endian** | LE | Explicit | 없음 |
| 1.2.840.10008.1.2.2 | Explicit VR Big Endian | BE | Explicit | 없음 |
| **1.2.840.10008.1.2.4.50** | **JPEG Baseline (8-bit)** | LE | Explicit | JPEG |
| 1.2.840.10008.1.2.4.51 | JPEG Extended (12-bit) | LE | Explicit | JPEG |
| 1.2.840.10008.1.2.4.70 | JPEG Lossless | LE | Explicit | JPEG |
| **1.2.840.10008.1.2.4.90** | **JPEG 2000 Lossless** | LE | Explicit | J2K |
| 1.2.840.10008.1.2.4.91 | JPEG 2000 Lossy | LE | Explicit | J2K |
| 1.2.840.10008.1.2.5 | RLE Lossless | LE | Explicit | RLE |

> **굵은 글씨**: EchoPixel에서 자주 접하는 Transfer Syntax

### EchoPixel에서 Transfer Syntax 처리

```typescript
// Transfer Syntax 확인
const transferSyntaxUID = dataset.getString('00020010');

// 압축 여부 판단
const isEncapsulated =
  transferSyntaxUID.startsWith('1.2.840.10008.1.2.4') || // JPEG 계열
  transferSyntaxUID === '1.2.840.10008.1.2.5';            // RLE

if (isEncapsulated) {
  // JPEG/JPEG2000/RLE 디코딩 필요
  frames = await decodeJpeg(pixelData);
} else {
  // Native 픽셀 데이터 직접 사용
  frames = extractNativeFrames(pixelData, imageInfo);
}
```

---

## EchoPixel에서의 DICOM 파싱

### 파싱 전략: Lazy vs Eager

```
Cornerstone/dcmjs (Eager 파싱)
──────────────────────────────
모든 태그를 처음에 전부 파싱
  ↓
필요 없는 태그도 메모리에 보관
  ↓
파싱 시간 오래 걸림


EchoPixel (Lazy 파싱)
──────────────────────
필요한 태그만 찾아서 파싱
  ↓
메타데이터 최소화
  ↓
빠른 초기 로딩
```

### 필수 태그 목록

EchoPixel에서 렌더링에 필요한 최소 태그:

```typescript
// 필수 이미지 정보
const REQUIRED_TAGS = {
  // Image Pixel Module
  '00280010': 'Rows',
  '00280011': 'Columns',
  '00280100': 'BitsAllocated',
  '00280101': 'BitsStored',
  '00280102': 'HighBit',
  '00280103': 'PixelRepresentation',  // 0=unsigned, 1=signed
  '00280004': 'PhotometricInterpretation',

  // Multi-frame (선택)
  '00280008': 'NumberOfFrames',

  // Window/Level (선택)
  '00281050': 'WindowCenter',
  '00281051': 'WindowWidth',

  // Pixel Data
  '7FE00010': 'PixelData',

  // Transfer Syntax (File Meta)
  '00020010': 'TransferSyntaxUID',
};
```

### 파서 구현 흐름

```typescript
// packages/core/src/dicom/parser.ts 구조

export function parseDicom(buffer: ArrayBuffer): DicomDataset {
  // 1. DICOM 검증
  if (!isDicomFile(buffer)) {
    throw new DicomParseError('Not a valid DICOM file');
  }

  // 2. File Meta Information 파싱 (offset 132~)
  const metaInfo = parseMetaInfo(buffer);
  const transferSyntax = metaInfo.transferSyntaxUID;

  // 3. Dataset 파싱 (File Meta 이후)
  const dataset = parseDataset(buffer, metaInfo.endOffset, transferSyntax);

  return {
    metaInfo,
    dataset,
    transferSyntax,
  };
}

export function getImageInfo(buffer: ArrayBuffer, dataset: DicomDataset): DicomImageInfo {
  return {
    rows: dataset.getUint16('00280010'),
    columns: dataset.getUint16('00280011'),
    bitsAllocated: dataset.getUint16('00280100'),
    bitsStored: dataset.getUint16('00280101'),
    highBit: dataset.getUint16('00280102'),
    pixelRepresentation: dataset.getUint16('00280103'),
    photometricInterpretation: dataset.getString('00280004'),
    numberOfFrames: dataset.getUint16('00280008') || 1,
    windowCenter: dataset.getNumber('00281050'),
    windowWidth: dataset.getNumber('00281051'),
  };
}

export function extractPixelData(
  buffer: ArrayBuffer,
  dataset: DicomDataset
): PixelDataInfo {
  const pixelDataElement = dataset.getElement('7FE00010');

  if (pixelDataElement.vr === 'OW' || pixelDataElement.vr === 'OB') {
    // Encapsulated 여부 확인
    if (isEncapsulatedPixelData(pixelDataElement)) {
      return parseEncapsulatedPixelData(buffer, pixelDataElement);
    } else {
      return parseNativePixelData(buffer, pixelDataElement);
    }
  }

  throw new DicomParseError('Invalid Pixel Data element');
}
```

---

## 학습 포인트

### DICOM 파싱 시 주의사항

1. **바이트 순서**: 거의 모든 DICOM은 Little Endian
2. **VR 확인**: Explicit VR인지 Implicit VR인지 Transfer Syntax로 판단
3. **Undefined Length**: SQ나 Encapsulated 데이터는 길이가 0xFFFFFFFF
4. **Private 태그**: 홀수 그룹 번호는 벤더 전용 태그

### 디버깅 팁

```javascript
// 태그 값 확인하기
function debugTag(buffer, offset) {
  const view = new DataView(buffer);
  const group = view.getUint16(offset, true).toString(16).padStart(4, '0');
  const element = view.getUint16(offset + 2, true).toString(16).padStart(4, '0');
  const vr = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5));

  console.log(`Tag: (${group},${element}), VR: ${vr}`);
}

// Hex dump
function hexDump(buffer, offset, length) {
  const bytes = new Uint8Array(buffer, offset, length);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');
}
```

---

## 참고 자료

- [DICOM Standard - Part 10](https://dicom.nema.org/medical/dicom/current/output/chtml/part10/chapter_7.html)
- [DICOM Standard - Data Structures](https://www.dicomstandard.org/standards/view/data-structures-and-encoding)
- [pydicom Tutorial](https://pydicom.github.io/pydicom/stable/tutorials/dataset_basics.html)
- [DICOM Key Concepts](https://www.dicomstandard.org/concepts)
