# EchoPixel Project

고성능 심초음파 DICOM 뷰어 라이브러리 (npm 패키지)

---

## 새 세션 시작 시 필수 확인

> **Claude에게**: 새 세션 시작 시 아래 파일들을 순서대로 읽어 프로젝트 컨텍스트를 파악하세요.

### 1. 현재 진행상황 (필수)
```
docs/progress/status.md          # 현재 Phase, 완료/진행중/예정 작업
docs/progress/session-log.md     # 세션별 작업 기록
```

### 2. 프로젝트 개요 (필요시)
```
docs/architecture/overview.md    # 전체 아키텍처
docs/roadmap/implementation-phases.md  # 5단계 구현 계획
```

### 3. 트러블슈팅 & 학습 (필요시)
```
docs/troubleshooting/            # 문제 해결 기록
docs/learning/                   # 기술 학습 노트
```

---

## 프로젝트 목표

- 웹 브라우저에서 **16개** DICOM 심초음파 영상을 동시에 30fps 이상으로 재생 (스트레스 에코)
- Cornerstone3D 대비 성능 개선 및 뷰포트 제한 극복
- npm 패키지로 오픈소스 배포

## 사용자 프로필

### 기술 배경
- **주 언어**: Java (Spring 개발자)
- **프론트엔드**: React, Next.js (초중급)
- **학습 중**: TypeScript, WebGL2, DICOM

### 학습 목적 프로젝트
이 프로젝트는 학습을 위한 것입니다:
- 핵심 코드는 사용자가 직접 구현
- 에이전트는 분석, 리뷰, 보조 코드, 문서화 담당
- 상세한 설명과 학습 포인트 제공 필요

---

## 가이드 원칙 ⭐

> **Claude에게**: 이 섹션은 사용자를 가이드할 때 반드시 따라야 하는 원칙입니다.

### 1. 작업 주체
- **실제 코드 작성**: 사용자가 직접 수행
- **코드 요청 시**: 사용자가 명시적으로 요청하면 코드 작성 가능
- **Claude 역할**: 가이드, 설명, 리뷰, 문서화

### 2. 가이드 방식
작업을 **작은 단위로 분해**하여 단계별로 가이드:

```
❌ 잘못된 예시:
"pnpm workspace를 설정하고, TypeScript를 구성하고, ESLint를 추가하세요"

✅ 올바른 예시:
"Step 1: pnpm-workspace.yaml 파일 생성
 - 이 파일의 역할: 모노레포의 패키지 위치를 정의
 - 왜 필요한가: pnpm이 워크스페이스를 인식하려면..."
```

### 3. 학습 중심 설명
각 단계마다 **설계적/기술적 지식**을 포함:

| 설명 유형 | 예시 |
|----------|------|
| **Why (왜)** | "왜 2D Array Texture를 사용하는가? → 텍스처 바인딩 없이 레이어 인덱스만으로 프레임 전환 가능" |
| **How (어떻게)** | "WebGL2에서 2D Array Texture는 `gl.TEXTURE_2D_ARRAY` 타겟으로..." |
| **Trade-off** | "ImageBitmap vs VideoFrame: 호환성 vs 성능의 트레이드오프" |
| **Best Practice** | "VideoFrame은 반드시 close()를 호출해야 GPU 메모리 누수 방지" |
| **Common Mistake** | "흔한 실수: texImage3D 대신 texImage2D 사용 → 레이어 인덱스 무시됨" |

### 4. 가이드 템플릿

```markdown
## Step N: [작업 제목]

### 목표
이 단계에서 달성할 것

### 배경 지식 (왜 이렇게 하는가)
- 설계적 이유
- 기술적 배경
- 대안과 트레이드오프

### 작업 내용
1. 구체적인 작업 1
2. 구체적인 작업 2

### 예상 결과
작업 완료 후 확인할 것

### 학습 포인트
- 이 단계에서 배울 핵심 개념
```

### 5. 코드 요청 처리
사용자가 코드 작성을 요청할 경우:
1. 코드 작성 전에 **설계 의도** 설명
2. 코드 작성 후 **핵심 부분 해설**
3. **학습 포인트** 정리

## 기술 스택

- **렌더링**: WebGL2 (2D Array Texture)
- **UI**: React 18+
- **언어**: TypeScript (strict mode)
- **빌드**: Vite
- **테스트**: Vitest, Playwright
- **상태관리**: Zustand
- **코덱**: Web Workers + WASM

## 서브에이전트 역할

| 에이전트 | 역할 | 담당 |
|----------|------|------|
| analyzer | 코드 분석, 레퍼런스 조사 | 에이전트 |
| planner | 설계, 계획 (옵션 제시) | 협업 |
| coder | 보일러플레이트, 설정, 유틸리티 | 에이전트 |
| reviewer | 코드 리뷰, 학습 피드백 | 에이전트 |
| doc-writer | 문서 작성 | 에이전트 |
| tester | 테스트 코드 작성 | 협업 |
| refactor | 리팩토링 제안 | 에이전트 (제안만) |

### 핵심 로직 (사용자 직접 구현)
- WebGL2 렌더링 엔진
- DICOM 파서
- 2D Array Texture 관리
- 프레임 동기화 알고리즘
- 성능 최적화 코드

## 코딩 컨벤션

- TypeScript strict mode
- 함수형 프로그래밍 선호
- ESLint + Prettier
- 명확한 네이밍
- 단일 책임 원칙

## 프로젝트 구조 (계획)

```
echopixel/
├── packages/
│   ├── core/          # 핵심 엔진
│   ├── react/         # React 컴포넌트
│   ├── annotations/   # 측정 도구
│   └── codecs/        # DICOM 코덱
├── apps/
│   ├── demo/          # 데모 앱
│   └── docs/          # Storybook
└── docs/              # 문서
```

## 문서 관리 체계

### docs/ 디렉토리 구조
```
docs/
├── README.md                    # 문서 인덱스
├── architecture/                # 아키텍처 설계
│   └── overview.md
├── design/                      # 상세 설계
│   ├── technical-stack.md
│   └── performance-strategy.md
├── roadmap/                     # 개발 로드맵
│   └── implementation-phases.md
├── progress/                    # 진행상황 추적 ⭐
│   ├── status.md               # 현재 상태 (Phase, 완료/진행중)
│   └── session-log.md          # 세션별 작업 기록
├── troubleshooting/             # 트러블슈팅 ⭐
│   └── README.md               # 문제 해결 인덱스
├── learning/                    # 기술 학습 ⭐
│   ├── README.md               # 학습 자료 인덱스
│   ├── webgl2/                 # WebGL2 학습 노트
│   ├── dicom/                  # DICOM 학습 노트
│   └── typescript/             # TypeScript 학습 노트
└── research/                    # 기술 조사
    ├── cornerstone3d-analysis.md
    ├── sonix-viviane-analysis.md
    └── sado-poc-analysis.md
```

### 문서 업데이트 규칙

| 시점 | 업데이트 대상 | 담당 |
|------|--------------|------|
| 세션 시작 | status.md 읽기 | Claude |
| 세션 종료 | session-log.md 추가 | Claude |
| 작업 완료 | status.md 업데이트 | Claude |
| 문제 해결 | troubleshooting/ 추가 | Claude |
| 새 개념 학습 | learning/ 추가 | 협업 |

### 문서 크기 가이드라인

> **중요**: 문서가 커지면 Claude Code가 읽기 어려워집니다. 아래 규칙을 준수하세요.

| 문서 유형 | 권장 크기 | 초과 시 조치 |
|----------|----------|-------------|
| status.md | 150줄 이하 | 오래된 활동 기록 → session-log.md로 이동 |
| session-log.md | 300줄 이하 | 월별 파일로 분리 (session-log-2026-01.md) |
| 학습 노트 | 200줄 이하 | 주제별 파일로 분리 |
| 트러블슈팅 | 100줄 이하 | 문제당 별도 파일 |

**원칙**:
- 한 파일에 모든 내용 X → 주제별/시간별 분리
- 핵심 요약만 상위 문서에, 상세 내용은 하위 문서에
- 오래된 내용은 아카이브 (`/archive` 폴더)
- 인덱스 파일(README.md)은 링크 목록 위주로 간결하게

### session-log.md 형식
```markdown
## 2026-01-17 세션

### 작업 내용
- [x] 완료한 작업 1
- [x] 완료한 작업 2

### 다음 세션 할 일
- [ ] 예정 작업 1
- [ ] 예정 작업 2

### 메모
- 특이사항, 결정사항 등
```

---

## 참고 문서

- [아키텍처](docs/architecture/overview.md)
- [기술 스택](docs/design/technical-stack.md)
- [성능 전략](docs/design/performance-strategy.md)
- [구현 로드맵](docs/roadmap/implementation-phases.md)
- [현재 진행상황](docs/progress/status.md)
- [세션 기록](docs/progress/session-log.md)
