# Session Log

세션별 작업 기록입니다. 최신 세션이 위에 표시됩니다.

> **아카이브**: 오래된 세션은 [archive/](./archive/) 폴더에 있습니다.

---

## 2026-01-26 세션 #40 (프로젝트 검토 및 타입 체크 오류 수정)

### 작업 내용

**1. 프로젝트 전체 검토** ⭐⭐⭐

포괄적인 코드베이스 분석 수행:
- 142개 TS/TSX 파일 (~13,100줄)
- 48개 문서 파일
- 패키지 구조 및 의존성 분석
- 성능 달성 현황 확인 (100개 뷰포트 60fps)

**2. 타입 체크 오류 수정** ⭐⭐

`pnpm typecheck` 실행 시 다수의 오류 발견 및 수정:

| 문제 | 원인 | 해결 |
|------|------|------|
| JSX 플래그 미설정 | 루트 tsconfig에 jsx 옵션 없음 | `jsx: "react-jsx"` 추가 |
| ViewportTransform 타입 불일치 | flipH, flipV 속성 누락 | 속성 추가 |
| ViewportPlaybackState 타입 불일치 | lastFrameTime 속성 누락 | 속성 추가 |
| ViewportSeriesInfo 타입 불일치 | seriesId 속성 누락 | 속성 추가 |
| Viewport 타입 불일치 | bounds, active 속성 누락 | 속성 추가 |
| RenderStats 타입 오류 | lastRenderTime 속성 미존재 | 중복 UI 행 제거 |

### 변경된 파일

| 파일 | 변경 내용 |
|------|----------|
| `tsconfig.json` | `jsx: "react-jsx"` 추가 |
| `apps/demo/src/components/DicomViewport.tsx` | Viewport 타입 완전 구현 |
| `apps/demo/src/components/HardwareInfoPanel.tsx` | 존재하지 않는 속성 참조 제거 |

### 검증 결과

| 명령어 | 결과 |
|--------|------|
| `pnpm typecheck` | ✅ 통과 |
| `pnpm build` | ✅ 성공 |
| `pnpm lint` | ⚠️ 기존 ESLint 설정 문제 (별도 작업 필요) |

### 발견된 추가 이슈

| 이슈 | 상태 | 우선순위 |
|------|------|----------|
| ESLint 환경 설정 미흡 (no-undef 오류) | 🟡 미해결 | 중간 |
| vite-plugin-dts TS 버전 경고 | 🟡 미해결 | 낮음 |

**3. ESLint 설정 개선** ⭐

| 항목 | 내용 |
|------|------|
| 추가 패키지 | `globals`, `eslint-plugin-react`, `eslint-plugin-react-hooks` |
| 오류 감소 | 495개 → 68개 (86% 감소) |
| 해결된 문제 | browser/node 전역 변수, React 17+ JSX 트랜스폼 |
| 남은 문제 | React Hooks 코드 패턴 (별도 수정 필요) |

### 다음 단계

- [x] React Hooks 조건부 호출 패턴 수정 ✅ (2026-01-26 완료)
- [x] 렌더링 중 ref 업데이트 패턴 수정 ✅ (2026-01-26 완료)
- [ ] npm 배포는 Private npm repository 설정 후 진행 예정

---

## 2026-01-26 세션 #40-2 (ESLint 에러 완전 해결)

### 작업 내용

**1. React Hooks 규칙 위반 수정** ⭐⭐⭐

| 파일 | 문제 | 해결 |
|------|------|------|
| `LengthShape.tsx` | 조건부 Hook 호출 | Hooks를 early return 전으로 이동 |
| `AngleShape.tsx` | 조건부 Hook 호출 | Hooks를 early return 전으로 이동 |
| `PointShape.tsx` | 조건부 Hook 호출 | Hooks를 early return 전으로 이동 |
| `HybridViewportSlot.tsx` | 렌더링 중 ref 업데이트 | useLayoutEffect 사용 |
| `SVGOverlay.tsx` | 렌더링 중 ref 업데이트 | useLayoutEffect 사용 |
| `useToolGroup.ts` | 렌더링 중 ref 업데이트 | useLayoutEffect 사용 |
| `HybridMultiViewport.tsx` | 렌더링 중 ref 업데이트 | useLayoutEffect 사용 |

**2. 미사용 변수 에러 수정** ⭐⭐

ESLint 설정에 `varsIgnorePattern: "^_"` 추가하여 `_` 접두사 변수 허용

| 파일 | 수정 내용 |
|------|----------|
| `eslint.config.js` | varsIgnorePattern 규칙 추가 |
| 24개 파일 | 미사용 변수에 `_` 접두사 또는 제거 |

**3. 의도적 패턴에 대한 ESLint 비활성화**

| 패턴 | 파일 | 이유 |
|------|------|------|
| setState in effect | HardwareInfoPanel.tsx, useToolGroup.ts, SingleDicomViewer.tsx | 초기화/정리 로직 |
| ref access in render | HybridMultiViewport.tsx | 초기화된 매니저 접근 |

### 결과

| 항목 | 이전 | 이후 |
|------|------|------|
| ESLint 에러 | 48개 | **0개** ✅ |
| ESLint 경고 | 15개 | 13개 |
| TypeScript 에러 | 0개 | 0개 |

### 변경된 파일 (24개)

- `apps/demo/src/`: App.tsx, DicomViewport.tsx, HardwareInfoPanel.tsx, MultiCanvasGrid.tsx, MultiViewport.tsx
- `apps/demo/src/hooks/`: useWadoLoader.ts
- `apps/demo/src/pages/`: MultiCanvasPage.tsx
- `eslint.config.js`
- `packages/core/src/datasource/`: WadoRsDataSource.ts, types.ts
- `packages/core/src/hybrid/`: HybridRenderScheduler.ts, coordinateUtils.ts, types.ts
- `packages/core/src/sync/`: RenderScheduler.ts
- `packages/core/src/tools/`: ToolGroup.ts, useToolGroup.ts
- `packages/react/src/components/`: HybridMultiViewport.tsx, SingleDicomViewer.tsx, SingleDicomViewerGroup.tsx
- `packages/react/src/components/annotations/`: SVGOverlay.tsx
- `packages/react/src/components/annotations/shapes/`: AngleShape.tsx, LengthShape.tsx, PointShape.tsx
- `packages/react/src/components/building-blocks/`: HybridViewportSlot.tsx

### 남은 경고 (13개)

모두 `react-hooks/exhaustive-deps` 경고로, 의존성 배열 관련:
- ref cleanup 패턴 경고 (의도적)
- missing/unnecessary dependency 경고 (추후 검토)
- useMemo 의존성 경고 (AngleShape)

---

## 2026-01-23 세션 #39 (pnpm dev Race Condition 분석 및 해결)

### 작업 내용

**1. pnpm dev 실행 시 오류 분석** ⭐⭐⭐

사용자 환경: 다른 PC에서 git pull 후 `pnpm dev` 실행 시 오류 발생

**발생한 오류들**:

| 오류 | 원인 |
|------|------|
| `Failed to resolve entry for package "@echopixel/core"` | 병렬 실행으로 dist/ 미생성 상태에서 접근 |
| `Cannot find module '@echopixel/core'` (TS) | vite-plugin-dts가 타입 생성 시 dist/index.d.ts 미존재 |
| `TS6059: File is not under 'rootDir'` | tsconfig paths로 외부 소스 참조 시 rootDir 충돌 |

**2. 근본 원인 분석**

`pnpm dev` 스크립트의 `--parallel` 플래그가 Race Condition 유발:

```json
"dev": "pnpm -r --parallel run dev"
```

| 패키지 | dev 스크립트 | 문제 |
|--------|-------------|------|
| `apps/demo` | `vite` | 즉시 시작, 의존성 스캔 |
| `packages/core` | `vite build --watch` | 빌드 중, dist/ 재생성 중 |
| `packages/react` | `vite build --watch` | 빌드 중, core 타입 필요 |

**다른 PC에서 작동한 이유**:
- Vite `.vite` 캐시에 이전 pre-bundling 결과 존재
- 이전에 `pnpm build` 실행하여 `dist/` 폴더 존재

**3. 해결책 적용**

**적용된 해결책**: `apps/demo/vite.config.ts`에 alias 추가

```typescript
resolve: {
  alias: {
    "@echopixel/core": resolve(__dirname, "../../packages/core/src/index.ts"),
    "@echopixel/react": resolve(__dirname, "../../packages/react/src/index.ts"),
  },
},
```

**결과**:
- ✅ apps/demo dev server 정상 시작
- ✅ 브라우저에서 앱 정상 작동
- ⚠️ packages/react의 vite-plugin-dts TypeScript 경고 (런타임 영향 없음)

**4. 시도했지만 실패한 방법**

| 시도 | 결과 | 원인 |
|------|------|------|
| `tsconfig.json`에 paths 추가 | TS6059 오류 | rootDir 제약 충돌 |

**5. 추가 해결책 적용**

`pnpm dev` 스크립트 수정으로 빌드 순서 보장 (적용됨):

```json
{
  "scripts": {
    "dev": "pnpm build && pnpm -r --parallel run dev"
  }
}
```

### 생성된 문서

| 파일 | 내용 |
|------|------|
| `docs/troubleshooting/pnpm-dev-race-condition.md` | 문제 분석, 해결책, 시도한 방법 정리 |

### 변경된 파일

| 파일 | 변경 내용 |
|------|----------|
| `package.json` | dev 스크립트 수정 (빌드 순서 보장) |
| `apps/demo/vite.config.ts` | alias 추가 (@echopixel/core, @echopixel/react) |
| `tsconfig.json` | paths 추가 후 제거 (원래 상태로 복원) |

### 학습 포인트

- **pnpm 워크스페이스 병렬 실행**: `--parallel` 플래그는 의존성 순서를 무시하므로 race condition 발생 가능
- **Vite alias vs TypeScript paths**: Vite alias는 런타임 번들링용, TypeScript paths는 타입 체크용으로 별개
- **vite-plugin-dts의 한계**: 모노레포에서 다른 패키지 소스 직접 참조 시 rootDir 제약 발생
- **캐시의 중요성**: Vite `.vite` 캐시가 있으면 문제가 숨겨질 수 있음

### 다음 단계

- [x] pnpm dev 스크립트 수정 (빌드 순서 보장) ✅
- [ ] 또는 turbo/nx 등 빌드 도구 도입 검토 (선택적)

---

## 2026-01-23 세션 #39 계속 (문서 검토 및 버그 수정)

### 작업 내용

**1. docs 폴더 검토 및 수정**

| 파일 | 수정 내용 |
|------|----------|
| `docs/progress/status.md` | 개발자 가이드 파일 수 7개 → 15개 수정, 파일 목록 업데이트 |
| `docs/guide/developer-guide/README.md` | 절대 경로 `/docs/...` → 상대 경로 `../../...` 수정 (4개 링크) |

**2. 체크박스 UI 버그 수정** ⭐

**증상**:
- 체크박스 체크 표시가 보이지 않음
- 초기 선택이 maxSelect(viewportCount)를 무시하고 16개까지 선택됨
- 체크 해제 후 다시 선택 불가

**원인 및 해결**:

| 문제 | 원인 | 해결 |
|------|------|------|
| 체크 표시 안보임 | `@tailwindcss/forms` 기본 스타일이 어두운 배경색 적용 | `globals.css`에 `:checked` 스타일 추가 |
| 초기 16개 선택 | `scanInstances`가 항상 16개 자동 선택 | `maxSelect` 파라미터 추가 |
| 재선택 불가 | `toggleSelection`이 maxSelect 미체크 | `maxSelect` 파라미터로 제한 체크 |

**변경된 파일**:

| 파일 | 변경 내용 |
|------|----------|
| `apps/demo/src/styles/globals.css` | 체크박스 `:checked` 스타일 추가 |
| `apps/demo/src/hooks/useInstanceScanner.ts` | `scanInstances`, `toggleSelection`에 maxSelect 파라미터 추가 |
| `apps/demo/src/pages/MultiCanvasPage.tsx` | viewportCount 전달 |
| `apps/demo/src/pages/MultiViewportPage.tsx` | viewportCount 전달 |
| `apps/demo/src/pages/PerfTestPage.tsx` | viewportCount 전달 |

**3. 가이드 문서 검토 및 수정**

| 파일 | 수정 내용 |
|------|----------|
| `docs/guide/user-guide/datasources.md` | WADO-RS 예제 import에 `parseDicom` 추가 |
| `docs/guide/user-guide/components.md` | Props 테이블에 `onAnnotationsVisibilityChange` 추가 |

### 커밋 내역

| 커밋 | 내용 |
|------|------|
| `7ca7198` | fix: resolve pnpm dev race condition with build-first approach |
| `0897407` | docs: fix developer guide file count and use relative links |
| `b48e099` | fix: instance selector checkbox and maxSelect limit issues |
| `8bc8b8a` | docs: fix missing import and add missing prop in guide docs |

### 학습 포인트

- **@tailwindcss/forms**: 폼 요소 기본 스타일을 리셋하므로 다크 테마에서 `:checked` 스타일 오버라이드 필요
- **상태 관리**: 초기화 로직과 토글 로직 모두 동일한 제한 조건을 적용해야 일관성 유지
- **문서 검증**: API 문서 작성 후 실제 코드와 대조하여 import, Props 검증 필수

---

## 2026-01-22 세션 #38 (Tailwind CSS + 가이드 문서)

### 작업 내용

**0. 개발자 가이드 심화 문서 추가** ⭐⭐⭐

사용자 요청: 개발자 가이드 보강
1. Cornerstone3D 내부 구조, 동작 원리, 한계 및 극복 아이디어
2. Cornerstone vs EchoPixel 설계/동작 원리 비교
3. DICOM 파일 근본적 이해
4. Core 개발 기반 지식 (WebGL, WebAssembly, 인코딩/디코딩, 캐시, WebWorker 등)
5. **DICOM 렌더링 파이프라인** - 파일 입력부터 화면 출력까지 전체 흐름 (이벤트 흐름 포함)

**생성된 문서** (4개 파일, +4,500줄):

| 파일 | 내용 | 크기 |
|------|------|------|
| `cornerstone-vs-echopixel.md` | Cornerstone3D 내부 구조, 성능 병목점, EchoPixel 접근 방식 | ~700줄 |
| `dicom-fundamentals.md` | DICOM 바이너리 구조, Data Element 파싱, Transfer Syntax | ~650줄 |
| `core-technologies.md` | WebGL2 파이프라인, 디코딩 전략, LRU 캐시, Web Workers | ~1000줄 |
| `rendering-pipeline.md` | DICOM 파일 입력 → 화면 렌더링 전체 흐름, 이벤트 처리 | ~1600줄 |

**rendering-pipeline.md 주요 내용**:
- 데이터 입력 단계 (로컬 파일 / WADO-RS)
- DICOM 파싱 프로세스 (DicomParser)
- 이미지 디코딩 (WebCodecs / createImageBitmap)
- 텍스처 업로드 (TextureManager)
- WebGL 렌더링 (QuadRenderer, Shaders)
- Cine 재생 및 프레임 동기화 (FrameSyncEngine)
- Tool System 이벤트 처리 흐름
- 전체 데이터 흐름도 (ASCII 다이어그램)

---

**1. 가이드 문서 작성 및 검토** ⭐⭐

사용자 요청: "사용자 가이드와 개발자 가이드 작성 (주니어 React 개발자 대상)"

**생성된 문서** (15개 파일, +6,186줄):

| 가이드 | 파일 | 내용 |
|--------|------|------|
| **사용자 가이드** | README.md | 가이드 인덱스, 빠른 시작 |
| | getting-started.md | 설치, 첫 뷰어 만들기 튜토리얼 |
| | components.md | 컴포넌트 API 문서 |
| | tools.md | 도구 시스템, 바인딩 커스터마이징 |
| | annotations.md | 측정 도구, 캘리브레이션 |
| | datasources.md | 로컬 파일, WADO-RS 연동 |
| | advanced.md | 고급 기능, 성능 최적화 |
| | troubleshooting.md | 일반적인 문제 해결 |
| **개발자 가이드** | README.md | 프로젝트 개요 |
| | setup.md | 개발 환경 설정 |
| | project-structure.md | 디렉토리 구조 설명 |
| | architecture.md | 핵심 아키텍처, 데이터 흐름 |
| | coding-guide.md | 코딩 컨벤션 |
| | testing.md | 테스트 전략 및 작성법 |
| | contributing.md | 기여 가이드 |

**문서 검토 및 수정** (7개 파일):

| 문제 | 파일 | 수정 |
|------|------|------|
| `frames` 타입 오류 | components.md, getting-started.md, architecture.md | `ArrayBuffer[]` → `Uint8Array[]` |
| 존재하지 않는 `autoPlay` prop | components.md | 제거 |
| `width`/`height` 필수 표시 오류 | components.md, getting-started.md | 선택적으로 수정 |
| Handle 메서드명 오류 | components.md, advanced.md, troubleshooting.md | `reset()` → `resetViewport()` |
| 존재하지 않는 Handle 메서드 | components.md, advanced.md, tools.md | `getTransform()`, `getWindowLevel()` 제거 |
| 실제 Handle 메서드 누락 | components.md | `resetActiveTool()`, `getActiveMeasurementToolId()`, `getState()` 추가 |
| docs/README.md 링크 누락 | docs/README.md | 가이드 폴더 링크 추가 |

**1. Tailwind CSS 인프라 설정** ⭐

모노레포 전체에서 공유하는 Tailwind CSS 설정 구축

| 파일 | 내용 |
|------|------|
| `tailwind.config.ts` | 커스텀 테마 (viewer, accent, text, border 색상) |
| `postcss.config.js` | PostCSS 플러그인 설정 |
| `globals.css` | @tailwind 지시자 + 베이스 스타일 |

**커스텀 테마 색상**:
```
viewer: bg, surface, surface-alt, panel
accent: primary, secondary, success, warning, error, info
text: primary, secondary, muted, disabled
border: DEFAULT, active, selected, hover
```

**2. cn() 유틸리티 구현**

`clsx` + `tailwind-merge` 조합으로 조건부 클래스 병합 유틸리티 구현

```typescript
// extendTailwindMerge로 커스텀 색상 인식
const customTwMerge = extendTailwindMerge({
  extend: {
    theme: {
      colors: ['viewer-bg', 'accent-primary', 'text-primary', ...]
    }
  }
})

export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs))
}
```

**3. Demo App 마이그레이션**

| 파일 | 변환 내용 |
|------|----------|
| `App.tsx` | 탭 버튼, 컨테이너 레이아웃 |
| `SingleViewportPage.tsx` | 전체 레이아웃, 패널 |
| `MultiCanvasPage.tsx` | 그리드, 패널, 버튼 |
| `MultiViewportPage.tsx` | 레이아웃, 상태 표시 |
| `PerfTestPage.tsx` | 레이아웃 (WebGL 캔버스 유지) |
| `PlaybackControlBar.tsx` | 버튼, FPS 컨트롤 |
| `PerformanceOptions.tsx` | 체크박스, 입력 필드 |
| `WadoConfigPanel.tsx` | 폼 요소, 패널 |
| `InstanceSelector.tsx` | 테이블, 버튼 |
| `ExpandedViewModal.tsx` | 모달 오버레이 |

**4. Building-blocks 마이그레이션**

| 컴포넌트 | 변환 내용 |
|----------|----------|
| `DicomToolbar.tsx` | 도구 버튼 그룹, 활성 상태 |
| `DicomControls.tsx` | 재생 버튼, 슬라이더 |
| `DicomStatusBar.tsx` | 상태 텍스트, 배지 |
| `DicomToolInfo.tsx` | 안내 패널, 아이콘 |
| `DicomMiniOverlay.tsx` | 오버레이, 컨트롤 |
| `HybridViewportGrid.tsx` | 그리드 레이아웃 |
| `HybridViewportSlot.tsx` | 뷰포트 슬롯, 테두리 |

**5. 모노레포 호환성 이슈 해결**

| 문제 | 원인 | 해결 |
|------|------|------|
| Vite에서 PostCSS 설정 미인식 | 루트의 postcss.config.js 탐색 실패 | `vite.config.ts`에 명시적 PostCSS 설정 |
| "No utility classes detected" | 상대 경로 content 패턴 | `fileURLToPath`로 절대 경로 사용 |
| Input 텍스트 미표시 | `@tailwindcss/forms` 기본 스타일 | globals.css에서 오버라이드 |

### 커밋 내역

| 커밋 | 내용 |
|------|------|
| `3775513` | Add Tailwind CSS infrastructure and migrate all components |
| `937d375` | Fix input text visibility by overriding @tailwindcss/forms styles |
| `7dd159d` | Add comprehensive user and developer guides |
| `66bd9f5` | Fix API documentation errors in guide |

### 변경 통계

- **파일**: 29개 변경
- **추가**: 1,536줄
- **삭제**: 1,869줄
- **순감소**: 333줄 (인라인 스타일 → Tailwind 유틸리티)

### 학습 포인트

- **모노레포 Tailwind 설정**: Vite에서 루트 설정 파일 자동 탐색이 안 될 수 있음 → 명시적 경로 지정
- **ESM에서 __dirname**: `dirname(fileURLToPath(import.meta.url))` 사용
- **tailwind-merge 커스텀 테마**: `extendTailwindMerge`로 커스텀 색상 인식 필요
- **@tailwindcss/forms**: 폼 요소의 기본 스타일을 리셋하므로 다크 테마에서 오버라이드 필요
- **API 문서 검증**: 문서 작성 후 실제 코드와 대조하여 타입, 메서드명, 필수/선택 여부 검증 필수
- **데이터 흐름 이해**: DataSource(ArrayBuffer) → extractPixelData(Uint8Array) → Component(Uint8Array) 레이어별 타입 차이

---

## 2026-01-22 세션 #37 (Multi ViewPort 어노테이션 버그 수정)

### 작업 내용

**1. Multi ViewPort (Single viewport 기반) 어노테이션 도구 수정** ⭐

사용자 요청: "Multi ViewPort 탭에서 어노테이션 도구가 동작하지 않음"

**원인 분석**:
| 문제 | 원인 | 해결 |
|------|------|------|
| 어노테이션 완료 클릭이 뷰포트 선택으로 처리됨 | `handleViewerClick`이 모든 클릭 가로챔 | `getActiveMeasurementToolId()` 체크 추가 |
| Click outside가 어노테이션 완료를 가로챔 | `handleClickOutside`가 컴포넌트 내부 클릭도 처리 | 활성 도구 있을 때 스킵 |
| 어노테이션이 저장되지 않음 | App.tsx에서 `onAnnotationUpdate` 미전달 | 핸들러 추가 |

**2. 캘리브레이션 로딩 수정**

사용자 요청: "길이 어노테이션이 cm이 아닌 px로 표시됨"

**원인**: `loadMultiCanvasViewers`에서 full DICOM 인스턴스의 캘리브레이션 정보 미추출

**해결**: Single ViewPort의 `handleWadoLoad`와 동일한 캘리브레이션 추출 로직 추가

```typescript
// ultrasoundCalibration 추출
if (!finalImageInfo.pixelSpacing && !finalImageInfo.ultrasoundCalibration) {
  const instanceBuffer = await fetch(instanceUrl, { headers: { 'Accept': 'application/dicom' } });
  const ultrasoundCalibration = getUltrasoundCalibration(instanceBuffer);
  if (ultrasoundCalibration) {
    finalImageInfo = { ...finalImageInfo, ultrasoundCalibration };
  }
}
```

**3. 개별 어노테이션 Visibility 컨트롤 추가**

사용자 요청: "어노테이션 숨기기가 그룹에서만 컨트롤되고 개별 컨트롤이 안됨"

**해결**:
- `viewerAnnotationsVisibility` 상태 추가 (`Record<string, boolean>`)
- 각 뷰어별로 독립적인 visibility 토글 가능

**4. 코드 정리**

| 항목 | 내용 |
|------|------|
| 디버그 로그 제거 | SingleDicomViewer, SingleDicomViewerGroup, LengthTool에서 16개+ console.log 제거 |
| useEffect 최적화 | 의존성 배열에서 `imageInfo` 제거 (`transformContext.viewport` 사용) |
| .gitignore 업데이트 | Vite timestamp 파일 패턴 추가 (`*.timestamp-*.mjs`) |

### 커밋 내역

| 커밋 | 내용 |
|------|------|
| `e561b68` | Fix annotation tools in Multi ViewPort and add individual visibility control |
| `d43f1b0` | Remove debug console.log statements and optimize useEffect dependencies |
| `ac18fe3` | Add Vite timestamp files to .gitignore and remove accidentally committed files |

### 학습 포인트

- **이벤트 전파 관리**: 중첩된 컴포넌트에서 이벤트 핸들링 시 활성 상태 체크 필요
- **캘리브레이션 로딩**: WADO-RS metadata만으로는 ultrasoundCalibration 추출 불가, full DICOM instance 필요
- **상태 관리**: 그룹 레벨 vs 개별 레벨 상태 분리 (viewerAnnotationsVisibility)

---

## 2026-01-21 세션 #36 (Performance Test 탭 추가)

### 작업 내용

**1. Performance Test (Pure WebGL) 탭 추가** ⭐

사용자 요청: "Pure WebGL 방식과 Hybrid DOM-WebGL 방식의 성능 비교 테스트용 탭 추가"

**구현 내용**:
- 새 탭 `'perf-test'` ViewMode 추가
- 순수 WebGL 렌더링 (DOM Overlay 없음)
- `gl.scissor()` + `gl.viewport()`로 그리드 분할
- `requestAnimationFrame` 기반 애니메이션 루프
- 실시간 FPS, Frame Time, VRAM 사용량 표시

**성능 비교 목적**:
| 항목 | Pure WebGL | Hybrid DOM-WebGL |
|------|------------|------------------|
| Frame Time | ~0.1ms | ~1-3ms |
| DOM 조작 | 없음 | React 리렌더링 |
| 어노테이션 | 미지원 | SVG 기반 지원 |

**2. 버그 수정**

| 버그 | 원인 | 수정 |
|------|------|------|
| `Cannot read 'animationId' of null` | `data?.animationId !== null` 로직 오류 | `data && data.animationId !== null`로 수정 |
| `texImage2D overload resolution failed` | `ArrayTextureRenderer` 사용 (TEXTURE_2D_ARRAY용) | `QuadRenderer` 사용 (TEXTURE_2D용) |
| `decoded.bitmap is undefined` | `DecodedFrame`에 `.bitmap` 없음 | `.image` 속성 사용 |
| Instance 선택 안됨 (16개 제한) | `getMaxSelect()`가 항상 `viewportCount` 반환 | `viewMode === 'perf-test'`일 때 `perfTestViewportCount` 반환 |
| 프레임 수 항상 1 | `metadata.numFrames`가 제대로 파싱 안됨 | `scannedInstances`에서 `frameCount` 사용 |

### 학습 포인트

- **TEXTURE_2D vs TEXTURE_2D_ARRAY**: `QuadRenderer`는 2D용, `ArrayTextureRenderer`는 배열 텍스처용
- **DecodedFrame 인터페이스**: `.bitmap`이 아닌 `.image` 속성 사용
- **Optional Chaining 주의**: `data?.prop !== null`은 `data`가 `null`일 때 `undefined !== null`이 `true`가 됨

---

## 2026-01-21 세션 #35 (UI 레이아웃 개선 및 최대 뷰포트 설정)

### 작업 내용

**1. UI 레이아웃 정확도 개선** ⭐

- `uiElementsHeight` 계산 수정 (DicomControls: 60px → 113px)
- `minViewerHeight` 450px → 510px

**2. Flex-wrap 자동 줄바꿈 추가**

- `DicomToolbar.tsx`: `flexWrap: 'wrap'` 추가
- `DicomControls.tsx`: FPS 컨트롤 compact화

**3. 최대 뷰포트 개수 차별화**

| 탭 | 최대 뷰포트 |
|---|---|
| Multi ViewPort (Single canvas 기반) | **100개** |
| Multi ViewPort (Single viewport 기반) | **16개** |

### 학습 포인트

- **CSS Flexbox**: `flex-wrap: wrap`으로 자동 줄바꿈 처리
- 하드코딩된 높이 계산은 유지보수가 어려움 → Flex 기반 레이아웃 권장

---

## 2026-01-21 세션 #34 (Click Outside 뷰포트 선택 해제)

### 작업 내용

**Click Outside 패턴 적용** ⭐

- document 레벨 `mousedown` 이벤트로 컴포넌트 외부 클릭 감지
- HybridMultiViewport, SingleDicomViewerGroup에 적용
- 컴포넌트 외부 클릭 시 뷰포트 선택 해제 → 도구바 숨김

### 학습 포인트

- **Click Outside 패턴**: `document.addEventListener('mousedown', handler)` + `element.contains(target)`
- `mousedown`이 `click`보다 빠르게 반응

---

## 다음 세션 할 일

- [x] Tailwind CSS 마이그레이션 ✅ (세션 #38 완료)
- [x] 사용자/개발자 가이드 문서 작성 ✅ (세션 #38 완료)
- [ ] npm 배포 준비 (README.md, CHANGELOG.md)
- [ ] 패키지 버전 관리 설정
- [ ] 선택적: Ellipse, VTI 측정 도구
- [ ] 선택적: 라벨 드래그 기능

---

> **이전 세션 기록**:
> - [세션 #24~#33 (2026-01-21 초중반)](./archive/session-log-2026-01-21-mid.md)
> - [세션 #12~#23 (2026-01-18~20)](./archive/session-log-2026-01-phase2.md)
> - [세션 #1~#11 (2026-01-17~18 초반)](./archive/session-log-2026-01-early.md)
