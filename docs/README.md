# EchoPixel Documentation

고성능 심초음파 DICOM 뷰어 라이브러리 문서

## 문서 구조

```
docs/
├── README.md                     # 이 파일 (문서 인덱스)
├── architecture/                 # 아키텍처 설계
│   ├── overview.md               # 전체 아키텍처 개요
│   ├── memory-architecture-analysis.md  # 메모리 아키텍처
│   └── multi-viewport-strategy-analysis.md  # 멀티뷰포트 전략
├── design/                       # 상세 설계
│   ├── technical-stack.md        # 기술 스택 결정
│   ├── performance-strategy.md   # 성능 최적화 전략
│   └── phase3-annotations-plan.md # Phase 3 어노테이션 설계
├── research/                     # 기술 조사
│   ├── cornerstone3d-analysis.md # Cornerstone3D 분석
│   ├── sonix-viviane-analysis.md # 실제 프로젝트 요구사항
│   └── sado-poc-analysis.md      # SADO POC 분석
├── roadmap/                      # 로드맵
│   └── implementation-phases.md  # 구현 단계별 계획
├── progress/                     # 진행 상황 ⭐
│   ├── status.md                 # 현재 진행 상태 (필수 확인)
│   ├── session-log.md            # 최근 세션 기록
│   └── archive/                  # 이전 세션 기록
├── troubleshooting/              # 트러블슈팅
│   └── README.md                 # 문제 해결 인덱스
├── learning/                     # 기술 학습
│   ├── webgl2/                   # WebGL2 학습 노트
│   ├── dicom/                    # DICOM 학습 노트
│   └── typescript/               # TypeScript 학습 노트
└── archive/                      # 아카이브 (이전 문서)
```

## 빠른 링크

### 필수 확인 (새 세션 시작 시)

| 문서 | 설명 |
|------|------|
| [진행 상황](./progress/status.md) | 현재 Phase, 완료/진행중/예정 작업 |
| [세션 기록](./progress/session-log.md) | 최근 세션별 작업 기록 |

### 아키텍처 & 설계

| 문서 | 설명 |
|------|------|
| [아키텍처 개요](./architecture/overview.md) | 시스템 구조, 모듈 구성 |
| [메모리 아키텍처](./architecture/memory-architecture-analysis.md) | GPU 메모리, Context Loss |
| [멀티뷰포트 전략](./architecture/multi-viewport-strategy-analysis.md) | Hybrid DOM-WebGL |
| [Phase 3 설계](./design/phase3-annotations-plan.md) | 어노테이션 시스템 설계 |
| [기술 스택](./design/technical-stack.md) | 사용 기술 및 선정 이유 |
| [성능 전략](./design/performance-strategy.md) | 16개 뷰포트 최적화 |

### 로드맵 & 연구

| 문서 | 설명 |
|------|------|
| [구현 로드맵](./roadmap/implementation-phases.md) | 단계별 구현 계획 |
| [Cornerstone3D 분석](./research/cornerstone3d-analysis.md) | 기존 라이브러리 분석 |
| [트러블슈팅](./troubleshooting/README.md) | 문제 해결 기록 |

---

## 프로젝트 개요

### 목표
- 웹 브라우저에서 **16개 이상**의 DICOM 심초음파 영상을 **60fps**로 동시 재생 ✅
- Cornerstone3D 대비 성능 개선 및 뷰포트 제한 극복 ✅
- React 호환 npm 패키지로 오픈소스 배포

### 핵심 성능 달성

| 메트릭 | 목표 | 달성 |
|--------|------|------|
| 동시 뷰포트 | 16개 | **100개** |
| 프레임 레이트 | 30fps | **60fps** |
| Frame Time | <33ms | **0.1~3ms** |

### 핵심 기능
- Multi-frame DICOM (Cine Loop) 고속 재생
- 뷰포트 간 프레임 동기화
- 측정 도구 (Length, Angle, Point)
- SVG 어노테이션 오버레이
- Calibration 지원 (Pixel Spacing, Ultrasound Region)
