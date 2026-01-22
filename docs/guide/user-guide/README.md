# EchoPixel 사용자 가이드

> **대상**: React 애플리케이션에서 EchoPixel을 사용하여 DICOM 의료 영상을 표시하려는 개발자

이 가이드는 EchoPixel 라이브러리를 사용하여 웹 애플리케이션에 DICOM 뷰어를 통합하는 방법을 설명합니다.

---

## 목차

1. [시작하기](./getting-started.md) - 설치 및 기본 설정
2. [컴포넌트 가이드](./components.md) - 주요 컴포넌트 사용법
3. [도구 시스템](./tools.md) - Window/Level, Pan, Zoom 등 도구 사용
4. [어노테이션](./annotations.md) - 측정 및 마커 도구
5. [데이터 소스](./datasources.md) - 로컬 파일 및 WADO-RS 연동
6. [고급 사용법](./advanced.md) - 성능 최적화 및 커스터마이징
7. [문제 해결](./troubleshooting.md) - 자주 발생하는 문제와 해결 방법

---

## EchoPixel이란?

EchoPixel은 **고성능 DICOM 의료 영상 뷰어 라이브러리**입니다.

### 주요 특징

| 특징 | 설명 |
|------|------|
| **고성능** | WebGL2 기반으로 100개 이상의 뷰포트를 60fps로 동시 재생 |
| **React 친화적** | React 컴포넌트로 쉽게 통합 가능 |
| **심초음파 특화** | 멀티 프레임 DICOM, 초음파 캘리브레이션 지원 |
| **측정 도구** | 길이, 각도 측정 및 마커 어노테이션 |
| **다양한 데이터 소스** | 로컬 파일 및 WADO-RS 서버 지원 |

### 패키지 구조

```
@echopixel/core   - 핵심 엔진 (DICOM 파싱, WebGL 렌더링)
@echopixel/react  - React 컴포넌트
```

---

## 빠른 시작

### 1. 설치

```bash
npm install @echopixel/core @echopixel/react
# 또는
pnpm add @echopixel/core @echopixel/react
# 또는
yarn add @echopixel/core @echopixel/react
```

### 2. 기본 사용법

```tsx
import { SingleDicomViewer } from '@echopixel/react';
import { parseDicom, getImageInfo, extractPixelData } from '@echopixel/core';

function MyDicomViewer() {
  const [viewportData, setViewportData] = useState(null);

  const handleFileLoad = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const dataset = parseDicom(buffer);
    const imageInfo = getImageInfo(buffer, dataset);
    const pixelData = extractPixelData(buffer, dataset);

    setViewportData({
      frames: pixelData.frames,
      imageInfo,
      isEncapsulated: pixelData.isEncapsulated,
    });
  };

  return (
    <div>
      <input type="file" onChange={(e) => handleFileLoad(e.target.files[0])} />

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

---

## 사전 지식

이 가이드를 따라가기 위해 필요한 기본 지식:

### 필수
- **React 기초**: 컴포넌트, props, state, hooks (useState, useEffect, useRef)
- **TypeScript 기초**: 타입 정의, 인터페이스
- **ES6+ 문법**: async/await, 구조분해 할당, 스프레드 연산자

### 권장 (없어도 됨)
- DICOM 파일 형식에 대한 기본 이해
- WebGL 개념 (내부 동작 이해에 도움)

---

## 용어 설명

| 용어 | 설명 |
|------|------|
| **DICOM** | Digital Imaging and Communications in Medicine. 의료 영상 표준 포맷 |
| **Frame** | DICOM 파일 내의 개별 이미지. 심초음파는 보통 30~120개 프레임 포함 |
| **Window/Level** | 영상의 밝기(Window Center)와 대비(Window Width) 조절 |
| **Viewport** | 영상을 표시하는 화면 영역 |
| **Annotation** | 영상 위에 표시되는 측정선, 마커 등 |
| **WADO-RS** | Web Access to DICOM Objects - RESTful Services. DICOM 서버 접근 표준 |

---

## 다음 단계

[시작하기](./getting-started.md)로 이동하여 설치 및 기본 설정을 진행하세요.

---

## 도움이 필요하신가요?

- **문제 해결**: [troubleshooting.md](./troubleshooting.md)
- **이슈 리포트**: [GitHub Issues](https://github.com/hanumoka/echopixel/issues)
