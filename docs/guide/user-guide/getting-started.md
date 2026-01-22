# 시작하기

이 문서에서는 EchoPixel을 설치하고 첫 번째 DICOM 뷰어를 만드는 방법을 단계별로 설명합니다.

---

## 목차

1. [요구 사항](#요구-사항)
2. [설치](#설치)
3. [프로젝트 설정](#프로젝트-설정)
4. [첫 번째 뷰어 만들기](#첫-번째-뷰어-만들기)
5. [기본 기능 확인](#기본-기능-확인)

---

## 요구 사항

### 브라우저 지원

EchoPixel은 **WebGL2**를 사용합니다. 다음 브라우저에서 지원됩니다:

| 브라우저 | 최소 버전 | 권장 버전 |
|----------|-----------|-----------|
| Chrome | 56+ | 최신 |
| Firefox | 51+ | 최신 |
| Safari | 15+ | 최신 |
| Edge | 79+ | 최신 |

> ⚠️ **Internet Explorer는 지원하지 않습니다.**

### 개발 환경

- **Node.js**: 18.0.0 이상
- **React**: 18.0.0 이상
- **TypeScript**: 4.7.0 이상 (권장)

### WebGL2 지원 확인

브라우저에서 WebGL2 지원 여부를 확인하려면:

```javascript
const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl2');

if (gl) {
  console.log('WebGL2 지원됨');
} else {
  console.log('WebGL2 미지원');
}
```

---

## 설치

### npm/yarn/pnpm으로 설치

```bash
# npm
npm install @echopixel/core @echopixel/react

# yarn
yarn add @echopixel/core @echopixel/react

# pnpm
pnpm add @echopixel/core @echopixel/react
```

### 패키지 설명

| 패키지 | 설명 | 필수 여부 |
|--------|------|-----------|
| `@echopixel/core` | 핵심 엔진 (DICOM 파싱, WebGL 렌더링, 도구 시스템) | ✅ 필수 |
| `@echopixel/react` | React 컴포넌트 (SingleDicomViewer 등) | ✅ 필수 |

### peer dependencies

`@echopixel/react`는 다음 패키지를 peer dependency로 요구합니다:

```json
{
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

이미 React 18을 사용 중이라면 추가 설치가 필요 없습니다.

---

## 프로젝트 설정

### Vite + React + TypeScript 프로젝트 생성

새 프로젝트를 시작하는 경우:

```bash
# Vite로 React + TypeScript 프로젝트 생성
npm create vite@latest my-dicom-app -- --template react-ts

# 프로젝트 폴더로 이동
cd my-dicom-app

# 의존성 설치
npm install

# EchoPixel 설치
npm install @echopixel/core @echopixel/react
```

### 기존 프로젝트에 추가

기존 React 프로젝트에 EchoPixel을 추가하는 경우:

```bash
npm install @echopixel/core @echopixel/react
```

### TypeScript 설정 (권장)

`tsconfig.json`에 다음 설정을 권장합니다:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx"
  }
}
```

---

## 첫 번째 뷰어 만들기

### Step 1: 기본 컴포넌트 생성

`src/components/MyDicomViewer.tsx` 파일을 생성합니다:

```tsx
import { useState } from 'react';
import {
  isDicomFile,
  parseDicom,
  getImageInfo,
  extractPixelData,
} from '@echopixel/core';
import { SingleDicomViewer } from '@echopixel/react';

// 뷰포트 데이터 타입 정의
interface ViewportData {
  frames: Uint8Array[];
  imageInfo: {
    rows: number;
    columns: number;
    bitsAllocated: number;
    bitsStored: number;
    windowCenter?: number;
    windowWidth?: number;
    // ... 기타 속성
  };
  isEncapsulated: boolean;
}

export function MyDicomViewer() {
  // 상태 관리
  const [viewportData, setViewportData] = useState<ViewportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 파일 선택 핸들러
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setViewportData(null);

    try {
      // 1. 파일을 ArrayBuffer로 읽기
      const buffer = await file.arrayBuffer();

      // 2. DICOM 파일인지 확인
      if (!isDicomFile(buffer)) {
        throw new Error('유효한 DICOM 파일이 아닙니다.');
      }

      // 3. DICOM 파싱
      const dataset = parseDicom(buffer);

      // 4. 이미지 정보 추출
      const imageInfo = getImageInfo(buffer, dataset);

      // 5. 픽셀 데이터 추출
      const pixelData = extractPixelData(buffer, dataset);

      if (!pixelData || pixelData.frameCount === 0) {
        throw new Error('픽셀 데이터를 찾을 수 없습니다.');
      }

      // 6. 뷰포트 데이터 설정
      setViewportData({
        frames: pixelData.frames,
        imageInfo,
        isEncapsulated: pixelData.isEncapsulated,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>DICOM 뷰어</h1>

      {/* 파일 선택 */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="file"
          accept=".dcm,.dicom,application/dicom"
          onChange={handleFileChange}
        />
      </div>

      {/* 로딩 상태 */}
      {loading && <p>로딩 중...</p>}

      {/* 에러 표시 */}
      {error && (
        <p style={{ color: 'red' }}>오류: {error}</p>
      )}

      {/* DICOM 뷰어 */}
      {viewportData && (
        <SingleDicomViewer
          frames={viewportData.frames}
          imageInfo={viewportData.imageInfo}
          isEncapsulated={viewportData.isEncapsulated}
          width={768}
          height={576}
        />
      )}
    </div>
  );
}
```

### Step 2: App에서 컴포넌트 사용

`src/App.tsx`를 수정합니다:

```tsx
import { MyDicomViewer } from './components/MyDicomViewer';

function App() {
  return (
    <div>
      <MyDicomViewer />
    </div>
  );
}

export default App;
```

### Step 3: 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:5173`을 열고 DICOM 파일을 선택해보세요.

---

## 기본 기능 확인

### 뷰어에서 사용 가능한 기본 기능

| 기능 | 마우스/키보드 | 설명 |
|------|---------------|------|
| **Window/Level** | 좌클릭 드래그 | 영상 밝기/대비 조절 |
| **Pan** | 우클릭 드래그 또는 Ctrl + 좌클릭 | 영상 이동 |
| **Zoom** | 휠 스크롤 | 영상 확대/축소 |
| **프레임 탐색** | Shift + 휠 | 멀티 프레임 영상에서 프레임 전환 |

### 코드 설명

위 코드에서 핵심적인 부분을 설명합니다:

#### 1. DICOM 파싱 과정

```tsx
// DICOM 파일 유효성 검사
if (!isDicomFile(buffer)) {
  throw new Error('유효한 DICOM 파일이 아닙니다.');
}

// DICOM 데이터셋 파싱 (태그 정보 추출)
const dataset = parseDicom(buffer);

// 이미지 관련 정보 추출 (크기, 비트, Window/Level 등)
const imageInfo = getImageInfo(buffer, dataset);

// 픽셀 데이터 추출 (실제 이미지 바이트)
const pixelData = extractPixelData(buffer, dataset);
```

#### 2. SingleDicomViewer Props

| Prop | 타입 | 필수 | 설명 |
|------|------|------|------|
| `frames` | `Uint8Array[]` | ✅ | 프레임 데이터 배열 |
| `imageInfo` | `DicomImageInfo` | ✅ | 이미지 메타데이터 |
| `isEncapsulated` | `boolean` | ✅ | 압축 여부 (JPEG 등) |
| `width` | `number` | - | 뷰포트 너비 (선택, 자동 계산) |
| `height` | `number` | - | 뷰포트 높이 (선택, 자동 계산) |

---

## 다음 단계

기본 뷰어가 작동한다면, 다음 주제로 넘어가세요:

- [컴포넌트 가이드](./components.md) - 다양한 컴포넌트와 옵션
- [도구 시스템](./tools.md) - 도구 바인딩 커스터마이징
- [데이터 소스](./datasources.md) - WADO-RS 서버 연동

---

## 문제가 발생했나요?

### 자주 발생하는 문제

1. **"WebGL2 is not supported"**
   - 브라우저가 WebGL2를 지원하지 않습니다
   - Chrome, Firefox, Edge 최신 버전을 사용하세요

2. **"유효한 DICOM 파일이 아닙니다"**
   - 파일이 DICOM 형식이 아닐 수 있습니다
   - DICOM 파일은 보통 `.dcm` 확장자를 가집니다

3. **이미지가 표시되지 않음**
   - 콘솔에서 에러 메시지를 확인하세요
   - `pixelData.frameCount`가 0인지 확인하세요

더 많은 문제 해결 방법은 [문제 해결](./troubleshooting.md)을 참조하세요.
