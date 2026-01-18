# EchoPixel

고성능 심초음파 DICOM 뷰어 라이브러리

> **상태**: Phase 1 개발 중 (Foundation)

## 특징

- **16개 뷰포트** 동시 재생 (스트레스 에코 지원)
- **30fps 이상** 부드러운 cine 재생
- **WebGL2** 기반 고성능 GPU 렌더링
- **WebCodecs** 하드웨어 가속 디코딩
- **React 18+** 지원

## 기술 스택

| 영역 | 기술 |
|------|------|
| 렌더링 | WebGL2 (2D Array Texture) |
| 디코딩 | WebCodecs ImageDecoder |
| UI | React 18+ |
| 언어 | TypeScript (strict) |
| 빌드 | Vite, pnpm workspace |

## 성능 목표

| 메트릭 | 목표 |
|--------|------|
| 동시 뷰포트 | 16개 |
| 프레임 레이트 | 30fps+ |
| GPU 메모리 | 1.5GB 미만 |
| 동기화 지연 | < 16ms |
| 프레임 드롭 | < 1% |

## 패키지 구조

```
@echopixel/core      # 핵심 렌더링 엔진
@echopixel/react     # React 컴포넌트 (예정)
@echopixel/annotations  # 측정 도구 (예정)
```

## 개발 환경

```bash
# 의존성 설치
pnpm install

# Core 빌드
pnpm --filter @echopixel/core build

# Demo 실행
pnpm --filter @echopixel/demo dev
```

## 문서

- [아키텍처 개요](docs/architecture/overview.md)
- [구현 로드맵](docs/roadmap/implementation-phases.md)
- [진행 상황](docs/progress/status.md)

## 로드맵

| Phase | 목표 | 상태 |
|-------|------|------|
| 1 | Foundation (단일 뷰포트 + DICOM) | 진행중 |
| 2 | Multi-Viewport (16개 + PQE) | 예정 |
| 3 | Annotations (측정 도구) | 예정 |
| 4 | Plugin System | 예정 |
| 5 | Release (npm v1.0.0) | 예정 |

## 라이선스

MIT
