# EchoPixel Documentation

고성능 심초음파 DICOM 뷰어 라이브러리 문서

## 문서 구조

```
docs/
├── README.md                     # 이 파일 (문서 인덱스)
├── architecture/                 # 아키텍처 설계
│   ├── overview.md               # 전체 아키텍처 개요
│   └── multi-viewport-strategy-analysis.md  # 멀티뷰포트 전략
├── design/                       # 상세 설계
│   ├── technical-stack.md        # 기술 스택 결정
│   └── performance-strategy.md   # 성능 최적화 전략
├── research/                     # 기술 조사
│   ├── cornerstone3d-analysis.md # Cornerstone3D 분석
│   ├── sonix-viviane-analysis.md # 실제 프로젝트 요구사항
│   └── sado-poc-analysis.md      # SADO POC 분석
├── roadmap/                      # 로드맵
│   └── implementation-phases.md  # 구현 단계별 계획
├── progress/                     # 진행 상황
│   ├── status.md                 # 현재 진행 상태
│   └── session-log.md            # 세션별 작업 기록
├── troubleshooting/              # 트러블슈팅
│   └── README.md                 # 문제 해결 인덱스
└── archive/                      # 아카이브 (이전 문서)
```

## 빠른 링크

| 문서 | 설명 |
|------|------|
| [아키텍처 개요](./architecture/overview.md) | 시스템 구조, 모듈 구성 |
| [멀티뷰포트 전략](./architecture/multi-viewport-strategy-analysis.md) | Hybrid DOM-WebGL, Tiered Rendering |
| [기술 스택](./design/technical-stack.md) | 사용 기술 및 선정 이유 |
| [성능 전략](./design/performance-strategy.md) | 16개 뷰포트 최적화 방법 |
| [구현 로드맵](./roadmap/implementation-phases.md) | 단계별 구현 계획 |
| [진행 상황](./progress/status.md) | 현재 개발 상태 |
| [Cornerstone3D 분석](./research/cornerstone3d-analysis.md) | 기존 라이브러리 분석 |
| [트러블슈팅](./troubleshooting/README.md) | 문제 해결 기록 |

## 프로젝트 개요

### 목표
- 웹 브라우저에서 **16개 이상**의 DICOM 심초음파 영상을 **30fps+**로 동시 재생
- Cornerstone3D 대비 성능 개선 및 뷰포트 제한 극복
- React 호환 npm 패키지로 오픈소스 배포

### 핵심 기능
- Multi-frame DICOM (Cine Loop) 고속 재생
- 뷰포트 간 프레임 동기화
- EchoPAC 수준의 측정 도구
- AI 결과 오버레이 및 커스텀 플러그인
