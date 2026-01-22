# 문제 해결

이 문서에서는 EchoPixel 사용 중 발생할 수 있는 일반적인 문제와 해결 방법을 설명합니다.

---

## 목차

1. [설치 문제](#설치-문제)
2. [렌더링 문제](#렌더링-문제)
3. [데이터 로딩 문제](#데이터-로딩-문제)
4. [성능 문제](#성능-문제)
5. [어노테이션 문제](#어노테이션-문제)
6. [브라우저 호환성](#브라우저-호환성)

---

## 설치 문제

### "Module not found: @echopixel/core"

**원인**: 패키지가 설치되지 않았거나 잘못된 경로를 참조

**해결**:
```bash
# 패키지 재설치
npm install @echopixel/core @echopixel/react

# node_modules 삭제 후 재설치
rm -rf node_modules package-lock.json
npm install
```

### TypeScript 타입 에러

**원인**: TypeScript 버전 불일치 또는 설정 문제

**해결**:
```bash
# TypeScript 버전 확인 (4.7.0 이상 필요)
npx tsc --version

# 타입 정의 확인
npm ls @types/react
```

`tsconfig.json` 확인:
```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

### peer dependency 경고

**원인**: React 버전 불일치

**해결**:
```bash
# React 버전 확인
npm ls react

# React 18로 업그레이드
npm install react@18 react-dom@18
```

---

## 렌더링 문제

### "WebGL2 is not supported"

**원인**: 브라우저가 WebGL2를 지원하지 않음

**해결**:
1. 최신 브라우저 사용 (Chrome, Firefox, Edge, Safari 15+)
2. 하드웨어 가속 활성화 확인
3. 그래픽 드라이버 업데이트

**Chrome에서 WebGL 상태 확인**:
```
chrome://gpu
```

### 검은 화면 / 빈 캔버스

**원인**: 다양한 원인 가능

**확인 사항**:

1. **콘솔 에러 확인**
```javascript
// 브라우저 콘솔에서 에러 메시지 확인
```

2. **프레임 데이터 확인**
```tsx
console.log('frames:', viewportData.frames.length);
console.log('imageInfo:', viewportData.imageInfo);
```

3. **캔버스 크기 확인**
```tsx
// width, height가 0이 아닌지 확인
<SingleDicomViewer
  {...viewportData}
  width={768}   // 0이 아닌 값
  height={576}  // 0이 아닌 값
/>
```

### 이미지가 깨져 보임

**원인**: Window/Level 값 문제 또는 디코딩 실패

**해결**:

1. **Window/Level 초기화**
```tsx
const viewerRef = useRef<SingleDicomViewerHandle>(null);

// 리셋 버튼
<button onClick={() => viewerRef.current?.resetViewport()}>리셋</button>
```

2. **imageInfo 확인**
```tsx
console.log('Window Center:', imageInfo.windowCenter);
console.log('Window Width:', imageInfo.windowWidth);
console.log('Bits Stored:', imageInfo.bitsStored);
```

### 이미지가 늘어나거나 찌그러짐

**원인**: 종횡비(Aspect Ratio) 문제

**해결**:
```tsx
// 이미지 비율에 맞게 뷰포트 크기 조정
const aspectRatio = imageInfo.columns / imageInfo.rows;
const height = 576;
const width = Math.round(height * aspectRatio);

<SingleDicomViewer
  {...viewportData}
  width={width}
  height={height}
/>
```

---

## 데이터 로딩 문제

### "유효한 DICOM 파일이 아닙니다"

**원인**: 파일이 DICOM 형식이 아니거나 손상됨

**확인 사항**:
1. 파일 확장자가 `.dcm` 또는 `.dicom`인지 확인
2. 파일 시작 부분에 DICOM 헤더가 있는지 확인

```javascript
// DICOM 파일은 128바이트 프리앰블 후 "DICM" 문자열로 시작
const buffer = await file.arrayBuffer();
const view = new DataView(buffer);
const dicm = String.fromCharCode(
  view.getUint8(128),
  view.getUint8(129),
  view.getUint8(130),
  view.getUint8(131)
);
console.log('DICM header:', dicm === 'DICM');
```

### "픽셀 데이터를 찾을 수 없습니다"

**원인**: DICOM 파일에 픽셀 데이터가 없음 (구조화 보고서 등)

**해결**:
```tsx
const pixelData = extractPixelData(buffer, dataset);

if (!pixelData || pixelData.frameCount === 0) {
  // 이미지가 없는 DICOM (SR, KOS 등)
  console.log('이 DICOM 파일은 이미지를 포함하지 않습니다');
  return;
}
```

### WADO-RS 연결 실패

**원인**: 네트워크, 인증, CORS 문제

**확인 사항**:

1. **URL 확인**
```javascript
// 올바른 형식인지 확인
const url = `${baseUrl}/studies/${studyUID}/series/${seriesUID}/instances/${sopInstanceUID}`;
console.log('Request URL:', url);
```

2. **CORS 에러**
```
Access to fetch at 'https://...' from origin 'http://localhost:3000'
has been blocked by CORS policy
```

서버에 CORS 헤더 설정 필요:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Accept, Authorization
```

3. **인증 에러 (401)**
```tsx
const response = await fetch(url, {
  headers: {
    'Authorization': 'Bearer your-token',
    'Accept': 'application/dicom',
  },
});
```

### 압축된 DICOM 디코딩 실패

**원인**: 지원되지 않는 Transfer Syntax

**확인**:
```tsx
import { getTransferSyntaxName, isImageDecoderSupported } from '@echopixel/core';

console.log('Transfer Syntax:', getTransferSyntaxName(dataset.transferSyntax));
console.log('ImageDecoder 지원:', isImageDecoderSupported());
```

**지원되는 Transfer Syntax**:
| Transfer Syntax | 지원 |
|-----------------|------|
| Implicit VR Little Endian | ✅ |
| Explicit VR Little Endian | ✅ |
| JPEG Baseline | ✅ |
| JPEG Lossless | ✅ |
| JPEG 2000 | ⚠️ (브라우저 의존) |
| RLE | ✅ |

---

## 성능 문제

### 낮은 FPS / 버벅임

**원인**: GPU 과부하, 메모리 부족, 비효율적인 렌더링

**해결**:

1. **FPS 낮추기**
```tsx
<SingleDicomViewer
  {...viewportData}
  width={768}
  height={576}
  initialFps={15}  // 30에서 15로 낮춤
/>
```

2. **뷰포트 크기 줄이기**
```tsx
// 큰 뷰포트 대신 작은 뷰포트 사용
<SingleDicomViewer
  {...viewportData}
  width={512}   // 768에서 512로
  height={384}  // 576에서 384로
/>
```

3. **성능 옵션 활성화**
```tsx
<HybridMultiViewport
  {...props}
  performanceOptions={{
    skipInvisible: true,
    reducedQuality: true,
    maxConcurrentDecodes: 2,
  }}
/>
```

### 메모리 사용량 증가

**원인**: 텍스처/프레임 누적, 메모리 누수

**해결**:

1. **사용하지 않는 뷰어 정리**
```tsx
// 컴포넌트 언마운트 시 자동 정리됨
// 필요시 수동 정리
viewerRef.current?.dispose?.();
```

2. **프레임 수 제한**
```tsx
// 모든 프레임 대신 필요한 프레임만 로드
const limitedFrames = frames.slice(0, 30);  // 처음 30프레임만
```

### 많은 뷰포트에서 성능 저하

**원인**: WebGL Context 제한 초과

**해결**:
```tsx
// 16개 이상 뷰포트는 HybridMultiViewport 사용
function AdaptiveViewer({ viewerCount, viewers }) {
  if (viewerCount > 16) {
    return <HybridMultiViewport {...} />;  // 단일 WebGL Context
  }
  return <SingleDicomViewerGroup {...} />; // 다중 WebGL Context
}
```

---

## 어노테이션 문제

### 어노테이션이 표시되지 않음

**확인 사항**:

1. **showAnnotations 확인**
```tsx
<SingleDicomViewer
  {...viewportData}
  annotations={annotations}
  showAnnotations={true}  // true인지 확인
/>
```

2. **어노테이션 데이터 확인**
```tsx
console.log('Annotations:', annotations);
// visible: true인지 확인
// frameIndex가 현재 프레임과 일치하는지 확인
```

3. **좌표 범위 확인**
```tsx
// 좌표가 이미지 범위 내에 있는지 확인
const isValid = annotation.points.every(p =>
  p.x >= 0 && p.x < imageInfo.columns &&
  p.y >= 0 && p.y < imageInfo.rows
);
```

### 측정값이 px로 표시됨

**원인**: 캘리브레이션 정보 없음

**해결**:
```tsx
// imageInfo에 pixelSpacing 또는 ultrasoundCalibration 필요
console.log('Pixel Spacing:', imageInfo.pixelSpacing);
console.log('US Calibration:', imageInfo.ultrasoundCalibration);

// WADO-RS에서 전체 인스턴스 로드하여 캘리브레이션 추출
const buffer = await fetch(instanceUrl, {
  headers: { 'Accept': 'application/dicom' }
}).then(r => r.arrayBuffer());

const calibration = getUltrasoundCalibration(buffer);
```

### 어노테이션 수정/삭제 불가

**확인**:
```tsx
// editable, deletable 속성 확인
console.log('Editable:', annotation.editable);
console.log('Deletable:', annotation.deletable);

// 필요시 속성 변경
const editableAnnotation = {
  ...annotation,
  editable: true,
  deletable: true,
};
```

---

## 브라우저 호환성

### Safari에서 문제

**알려진 이슈**:
- Safari 15 미만: WebGL2 미지원
- ImageDecoder API 미지원

**해결**:
```tsx
// Safari 버전 확인
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// ImageDecoder 대신 폴백 디코더 사용
if (!isImageDecoderSupported()) {
  console.log('Using fallback decoder');
}
```

### 모바일 브라우저

**알려진 제한**:
- 터치 이벤트 처리 차이
- GPU 메모리 제한
- 화면 크기 제한

**권장 사항**:
```tsx
// 모바일에서는 작은 뷰포트 사용
const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);

<SingleDicomViewer
  {...viewportData}
  width={isMobile ? 320 : 768}
  height={isMobile ? 240 : 576}
/>
```

---

## 도움 요청

위 해결 방법으로 문제가 해결되지 않으면:

1. **콘솔 에러 메시지** 복사
2. **재현 단계** 정리
3. **브라우저/OS 정보** 포함
4. [GitHub Issues](https://github.com/hanumoka/echopixel/issues)에 리포트

### 디버그 정보 수집

```tsx
// 디버그 정보 출력
console.log('=== EchoPixel Debug Info ===');
console.log('User Agent:', navigator.userAgent);
console.log('WebGL2:', !!document.createElement('canvas').getContext('webgl2'));
console.log('ImageDecoder:', 'ImageDecoder' in window);
console.log('Frames:', viewportData?.frames?.length);
console.log('ImageInfo:', JSON.stringify(viewportData?.imageInfo, null, 2));
```
