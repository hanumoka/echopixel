# EchoPixel 개발자 가이드

> **대상**: EchoPixel 프로젝트를 유지보수하거나 기여하려는 개발자

이 가이드는 EchoPixel 프로젝트의 내부 구조, 개발 환경 설정, 코딩 컨벤션, 기여 방법 등을 설명합니다.

---

## 목차

### 시작하기
1. [개발 환경 설정](./setup.md) - 로컬 개발 환경 구성
2. [프로젝트 구조](./project-structure.md) - 디렉토리 및 패키지 구조

### 핵심 개념 이해 ⭐
3. [DICOM 기본 이해](./dicom-fundamentals.md) - DICOM 파일 포맷 근본 원리
4. [Cornerstone vs EchoPixel](./cornerstone-vs-echopixel.md) - 아키텍처 비교 분석
5. [Core 기반 기술](./core-technologies.md) - WebGL2, 디코딩, 캐싱 등
6. [DICOM 렌더링 파이프라인](./rendering-pipeline.md) - 파일 입력부터 화면 출력까지 전체 흐름 ⭐

### 심화 아키텍처 ⭐
7. [멀티 뷰포트 아키텍처](./multi-viewport-architecture.md) - Tiered Rendering, Hybrid DOM-WebGL
8. [메모리 관리](./memory-management.md) - Context Loss 복구, LRU 캐시, VRAM 관리
9. [성능 최적화](./performance-optimization.md) - 7가지 최적화 전략 및 구현

### 개발 가이드
10. [아키텍처 이해](./architecture.md) - 핵심 설계 및 데이터 흐름
11. [코딩 가이드](./coding-guide.md) - 컨벤션 및 베스트 프랙티스
12. [테스트 가이드](./testing.md) - 테스트 작성 및 실행
13. [기여 가이드](./contributing.md) - PR 작성 및 코드 리뷰

### 트러블슈팅
14. [트러블슈팅 가이드](./troubleshooting-guide.md) - 주요 문제 해결 (React Strict Mode, WebGL 등)

---

## 프로젝트 개요

### EchoPixel이란?

EchoPixel은 **고성능 DICOM 의료 영상 뷰어 라이브러리**입니다.

| 특징 | 설명 |
|------|------|
| **목표** | 16개 이상의 심초음파 영상을 30fps+ 동시 재생 |
| **기술** | WebGL2, React 18, TypeScript |
| **배포** | npm 패키지 (@echopixel/core, @echopixel/react) |

### 핵심 목표

```
웹 브라우저에서 100개 이상의 DICOM 뷰포트를
60fps로 동시 렌더링하는 고성능 뷰어
```

### 왜 새로 만들었나?

기존 라이브러리(Cornerstone3D 등)의 한계:
- WebGL Context 수 제한 (8~16개)으로 다중 뷰포트 한계
- vtk.js 의존성으로 인한 번들 크기와 오버헤드
- 매 프레임 메타데이터 재계산으로 성능 저하
- 심초음파(멀티프레임 Cine) 최적화 부족

**해결 전략**:
- vtk.js 제거, 직접 WebGL2 제어
- 2D Array Texture로 프레임 전환 최적화
- Hybrid DOM-WebGL로 100+ 뷰포트 지원
- Lazy DICOM 파싱

> 자세한 분석: [Cornerstone vs EchoPixel](./cornerstone-vs-echopixel.md)

---

## 패키지 구조

```
echopixel/
├── packages/
│   ├── core/           # @echopixel/core - 핵심 엔진
│   │   ├── dicom/      # DICOM 파싱, 디코딩
│   │   ├── webgl/      # WebGL2 렌더링
│   │   ├── viewport/   # 뷰포트 관리
│   │   ├── sync/       # 프레임 동기화
│   │   ├── tools/      # 도구 시스템
│   │   ├── annotations/# 어노테이션
│   │   ├── cache/      # LRU 캐시
│   │   └── hybrid/     # DOM-WebGL 하이브리드
│   │
│   └── react/          # @echopixel/react - React 컴포넌트
│       ├── components/
│       │   ├── SingleDicomViewer.tsx
│       │   ├── SingleDicomViewerGroup.tsx
│       │   ├── HybridMultiViewport.tsx
│       │   ├── building-blocks/
│       │   └── annotations/
│       └── utils/
│
├── apps/
│   └── demo/           # 데모 애플리케이션
│
└── docs/               # 문서
```

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **렌더링** | WebGL2 (2D Array Texture) |
| **UI** | React 18 |
| **언어** | TypeScript (strict mode) |
| **빌드** | Vite, tsup |
| **패키지 관리** | pnpm (workspace) |
| **스타일** | Tailwind CSS |
| **테스트** | Vitest (예정) |

---

## 빠른 시작

### 1. 저장소 클론

```bash
git clone https://github.com/hanumoka/echopixel.git
cd echopixel
```

### 2. 의존성 설치

```bash
pnpm install
```

### 3. 개발 서버 실행

```bash
pnpm dev
```

브라우저에서 `http://localhost:3000` 열기

### 4. 빌드

```bash
pnpm build
```

---

## 주요 명령어

| 명령어 | 설명 |
|--------|------|
| `pnpm dev` | 데모 앱 개발 서버 실행 |
| `pnpm build` | 모든 패키지 빌드 |
| `pnpm lint` | ESLint 실행 |
| `pnpm test` | 테스트 실행 (예정) |
| `pnpm clean` | 빌드 결과물 삭제 |

---

## 개발 원칙

### 1. 성능 우선

- GPU 렌더링 최적화
- 메모리 사용량 최소화
- 불필요한 리렌더링 방지

### 2. 타입 안전성

- TypeScript strict mode
- 명시적 타입 정의
- any 타입 지양

### 3. 단일 책임

- 모듈별 명확한 역할
- 작은 함수, 작은 컴포넌트
- 테스트 용이성

### 4. 점진적 복잡성

- 간단한 API부터 제공
- 고급 기능은 선택적
- Building Blocks 패턴

---

## 다음 단계

1. [개발 환경 설정](./setup.md)으로 시작하여 로컬 환경을 구성하세요.
2. [프로젝트 구조](./project-structure.md)를 파악하세요.
3. [아키텍처 이해](./architecture.md)로 전체 그림을 이해하세요.

---

## 문서 참조

- [아키텍처 설계](/docs/architecture/overview.md)
- [기술 스택 결정](/docs/design/technical-stack.md)
- [구현 로드맵](/docs/roadmap/implementation-phases.md)
- [진행 상황](/docs/progress/status.md)
