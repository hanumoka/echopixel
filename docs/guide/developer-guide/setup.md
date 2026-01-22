# 개발 환경 설정

이 문서에서는 EchoPixel 프로젝트를 로컬에서 개발하기 위한 환경 설정 방법을 설명합니다.

---

## 목차

1. [사전 요구사항](#사전-요구사항)
2. [저장소 설정](#저장소-설정)
3. [IDE 설정](#ide-설정)
4. [개발 워크플로우](#개발-워크플로우)
5. [트러블슈팅](#트러블슈팅)

---

## 사전 요구사항

### 필수 소프트웨어

| 소프트웨어 | 최소 버전 | 권장 버전 | 설치 확인 |
|------------|-----------|-----------|-----------|
| **Node.js** | 18.0.0 | 20.x LTS | `node --version` |
| **pnpm** | 8.0.0 | 최신 | `pnpm --version` |
| **Git** | 2.30.0 | 최신 | `git --version` |

### Node.js 설치

```bash
# nvm 사용 (권장)
nvm install 20
nvm use 20

# 또는 공식 사이트에서 직접 설치
# https://nodejs.org/
```

### pnpm 설치

```bash
# npm으로 설치
npm install -g pnpm

# 또는 corepack 사용 (Node.js 16.13+)
corepack enable
corepack prepare pnpm@latest --activate
```

### 권장 도구

| 도구 | 용도 |
|------|------|
| **VS Code** | IDE |
| **Chrome DevTools** | 디버깅 |
| **WebGL Inspector** | WebGL 디버깅 |

---

## 저장소 설정

### 1. 저장소 클론

```bash
# HTTPS
git clone https://github.com/hanumoka/echopixel.git

# SSH (권장)
git clone git@github.com:hanumoka/echopixel.git

cd echopixel
```

### 2. 의존성 설치

```bash
pnpm install
```

이 명령은:
- 루트 의존성 설치
- 모든 워크스페이스 패키지 의존성 설치
- 패키지 간 심볼릭 링크 생성

### 3. 환경 확인

```bash
# 패키지 구조 확인
pnpm ls --depth 0

# 빌드 테스트
pnpm build

# 개발 서버 실행
pnpm dev
```

### 4. Git 훅 설정 (선택)

```bash
# husky 설치 (커밋 훅)
pnpm add -D -w husky
npx husky install
```

---

## IDE 설정

### VS Code 권장 확장

`.vscode/extensions.json`:
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

### VS Code 설정

`.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "tailwindCSS.experimental.classRegex": [
    ["cn\\(([^)]*)\\)", "'([^']*)'"]
  ]
}
```

### TypeScript 설정

프로젝트는 다음 TypeScript 설정을 사용합니다:

`tsconfig.json` (루트):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

---

## 개발 워크플로우

### 일반적인 개발 사이클

```bash
# 1. 기능 브랜치 생성
git checkout -b feature/my-feature

# 2. 개발 서버 실행
pnpm dev

# 3. 코드 수정 및 테스트
# (hot reload로 자동 반영)

# 4. 린트 실행
pnpm lint

# 5. 빌드 확인
pnpm build

# 6. 커밋
git add .
git commit -m "feat: add my feature"

# 7. 푸시 및 PR 생성
git push origin feature/my-feature
```

### 패키지별 개발

#### @echopixel/core 개발

```bash
# core 패키지만 빌드
pnpm --filter @echopixel/core build

# core 패키지 watch 모드
pnpm --filter @echopixel/core dev
```

#### @echopixel/react 개발

```bash
# react 패키지만 빌드
pnpm --filter @echopixel/react build

# react 패키지 watch 모드
pnpm --filter @echopixel/react dev
```

#### 데모 앱 개발

```bash
# 데모 앱만 실행
pnpm --filter demo dev
```

### 전체 빌드

```bash
# 모든 패키지 순서대로 빌드
pnpm build

# 빌드 순서:
# 1. @echopixel/core
# 2. @echopixel/react
# 3. demo (선택)
```

---

## 디렉토리 구조 설명

```
echopixel/
├── apps/
│   └── demo/               # 데모 애플리케이션
│       ├── src/
│       │   ├── components/ # 데모 전용 컴포넌트
│       │   ├── pages/      # 페이지 컴포넌트
│       │   ├── hooks/      # 커스텀 훅
│       │   ├── styles/     # CSS (Tailwind)
│       │   └── types/      # 타입 정의
│       ├── index.html
│       └── vite.config.ts
│
├── packages/
│   ├── core/               # @echopixel/core
│   │   ├── src/
│   │   │   ├── dicom/      # DICOM 관련
│   │   │   ├── webgl/      # WebGL 렌더링
│   │   │   ├── viewport/   # 뷰포트 관리
│   │   │   ├── sync/       # 동기화
│   │   │   ├── tools/      # 도구 시스템
│   │   │   ├── annotations/# 어노테이션
│   │   │   ├── cache/      # 캐시
│   │   │   ├── network/    # 네트워크
│   │   │   ├── datasource/ # 데이터 소스
│   │   │   ├── hybrid/     # 하이브리드 아키텍처
│   │   │   └── utils/      # 유틸리티
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── react/              # @echopixel/react
│       ├── src/
│       │   ├── components/
│       │   │   ├── SingleDicomViewer.tsx
│       │   │   ├── SingleDicomViewerGroup.tsx
│       │   │   ├── HybridMultiViewport.tsx
│       │   │   ├── building-blocks/
│       │   │   └── annotations/
│       │   ├── types/
│       │   └── utils/
│       ├── package.json
│       └── vite.config.ts
│
├── docs/                   # 문서
│   ├── architecture/       # 아키텍처 문서
│   ├── design/            # 설계 문서
│   ├── guide/             # 가이드
│   ├── progress/          # 진행상황
│   └── research/          # 기술 조사
│
├── package.json           # 루트 패키지
├── pnpm-workspace.yaml    # pnpm 워크스페이스 설정
├── tsconfig.json          # 루트 TypeScript 설정
├── tailwind.config.ts     # Tailwind 설정
├── postcss.config.js      # PostCSS 설정
└── eslint.config.js       # ESLint 설정
```

---

## 환경 변수

### 데모 앱 환경 변수

`apps/demo/.env` (선택):
```env
# WADO-RS 서버 기본 URL
VITE_WADO_BASE_URL=https://your-dicom-server.com/dicom-web

# 개발 모드 설정
VITE_DEV_MODE=true
```

---

## 트러블슈팅

### pnpm install 실패

```bash
# 캐시 삭제 후 재시도
pnpm store prune
rm -rf node_modules
pnpm install
```

### TypeScript 에러

```bash
# TypeScript 캐시 삭제
rm -rf node_modules/.cache
rm -rf packages/*/dist

# 재빌드
pnpm build
```

### WebGL 관련 에러

```bash
# Chrome에서 WebGL 상태 확인
chrome://gpu

# 하드웨어 가속 강제 활성화
chrome://flags/#ignore-gpu-blocklist
```

### 포트 충돌

```bash
# 다른 포트로 실행
pnpm dev -- --port 3001
```

### 워크스페이스 링크 문제

```bash
# 링크 재생성
pnpm install --force
```

---

## 다음 단계

- [프로젝트 구조](./project-structure.md)를 파악하세요.
- [아키텍처 이해](./architecture.md)로 전체 구조를 이해하세요.
