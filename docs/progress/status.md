# EchoPixel 진행 상황

## 현재 상태

| 항목 | 상태 |
|------|------|
| **현재 Phase** | Phase 3 (Annotations) ✅ **완료** |
| **마지막 업데이트** | 2026-01-26 (세션 #40-4) |
| **다음 마일스톤** | npm 배포 (Private npm repository 설정 후) |
| **스타일링** | Tailwind CSS ✅ **마이그레이션 완료** |
| **문서화** | 사용자/개발자 가이드 ✅ **작성 완료** |
| **타입 체크** | ✅ **통과** (세션 #40 수정) |
| **ESLint** | ✅ **0 에러** (세션 #40-2 수정) |

### 핵심 목표

```
웹 브라우저에서 16개 이상의 DICOM 심초음파 영상을
동시에 30fps 이상으로 재생하는 고성능 뷰어 라이브러리
```

---

## 성능 달성 현황 ✅

| 메트릭 | 목표 | 달성 | 달성률 |
|--------|------|------|--------|
| 동시 뷰포트 | 16개 | 100개 (Single canvas) | 625% |
| 프레임 레이트 | 30fps | 60fps | 200% |
| Frame Time | <33ms | 0.1~3ms | 1000%+ |
| GPU 메모리 | <1.5GB | 측정 가능 | ✅ |
| 프레임 드롭 | <1% | 관찰 안됨 | ✅ |

---

## Phase별 진행률

| Phase | 내용 | 상태 |
|-------|------|------|
| **0** | 계획 수립 | ✅ 완료 |
| **1** | Foundation (WebGL2, DICOM, React) | ✅ 완료 |
| **2** | Multi-Viewport (2D Array Texture, Sync) | ✅ 완료 |
| **2.5** | Robustness (Context Loss, LRU Cache) | ✅ 완료 |
| **2.6** | @echopixel/react 멀티 뷰어 | ✅ 완료 |
| **2.7** | Multi Viewport Rotation/Flip | ✅ 완료 |
| **2.8** | Performance Options | ✅ 완료 |
| **3** | Annotations (측정 도구, SVG 오버레이) | ✅ **완료** |
| **3.5** | Tailwind CSS 마이그레이션 | ✅ **완료** |
| **4** | Plugin System & 16-bit | ⏳ 대기 |
| **5** | npm v1.0.0 배포 | ⏳ 대기 |

### Phase 3 세부 (Annotations)

| 단계 | 내용 | 상태 |
|------|------|------|
| 3a | 기본 인프라 (타입, Store, 좌표 변환) | ✅ |
| 3b | 측정 도구 (Length, Angle, Point) | ✅ |
| 3c | SVG 오버레이 렌더링 | ✅ |
| 3d-e | Single/Multi Viewport 통합 | ✅ |
| 3f | 어노테이션 생성 UI | ✅ |
| 3g | 확장 & 버그 수정 (Calibration 등) | ✅ |
| 3h | Performance Test 탭 | ✅ |
| - | Ellipse, VTI 측정 도구 | ⏳ 선택적 |
| - | 라벨 드래그 | ⏳ 선택적 |

### Phase 3.5 세부 (Tailwind CSS)

| 단계 | 내용 | 상태 |
|------|------|------|
| 인프라 | tailwind.config.ts, postcss.config.js, globals.css | ✅ |
| 유틸리티 | cn() with extendTailwindMerge | ✅ |
| Demo App | App.tsx, 4개 페이지, 5개 컴포넌트 | ✅ |
| Building-blocks | 7개 컴포넌트 (DicomToolbar, Controls 등) | ✅ |
| 설정 수정 | Vite PostCSS 명시적 설정, 절대 경로 | ✅ |
| 버그 수정 | @tailwindcss/forms 스타일 오버라이드 | ✅ |

### 문서화 (Phase 3.5+)

| 가이드 | 대상 | 파일 수 | 상태 |
|--------|------|---------|------|
| **사용자 가이드** | React 개발자 | 8개 | ✅ |
| **개발자 가이드** | 기여자/메인테이너 | 15개 | ✅ |
| **문서 리팩토링** | 중복 제거, 요약화 | 세션 #40-3 | ✅ |

**사용자 가이드** (`docs/guide/user-guide/`):
- README.md, getting-started.md, components.md, tools.md
- annotations.md, datasources.md, advanced.md, troubleshooting.md

**개발자 가이드** (`docs/guide/developer-guide/`):
- 기본: README.md, setup.md, project-structure.md, architecture.md, coding-guide.md, testing.md, contributing.md
- 심화: dicom-fundamentals.md, cornerstone-vs-echopixel.md, core-technologies.md, rendering-pipeline.md
- 요약 + 링크: multi-viewport-architecture.md, memory-management.md, performance-optimization.md, troubleshooting-guide.md

> **Note**: 심화 문서 3개(multi-viewport, memory, performance)는 주니어 개발자를 위해 상세하게 보강됨 (세션 #40-4)

---

## 패키지 구조

```
packages/
├── core/           # @echopixel/core (핵심 엔진)
│   ├── dicom/      # DICOM 파싱, 디코딩
│   ├── webgl/      # TextureManager, Renderer
│   ├── viewport/   # ViewportManager
│   ├── sync/       # FrameSyncEngine, RenderScheduler
│   ├── tools/      # Tool System
│   ├── annotations/# 어노테이션 시스템
│   └── cache/      # LRU Cache
│
└── react/          # @echopixel/react (React 컴포넌트)
    ├── SingleDicomViewer
    ├── SingleDicomViewerGroup
    ├── HybridMultiViewport
    └── building-blocks/
```

---

## 다음 단계

### 1. 코드 품질 개선 ✅ 완료

| 작업 | 상태 | 세션 |
|------|------|------|
| React Hooks 조건부 호출 수정 | ✅ | #40-2 |
| 렌더링 중 ref 업데이트 패턴 수정 | ✅ | #40-2 |
| ESLint 에러 0개 | ✅ | #40-2 |
| 문서 중복 제거 리팩토링 | ✅ | #40-3 |
| 주니어 개발자 가이드 상세화 | ✅ | #40-4 |

### 2. npm 배포 (Phase 5) - 보류

> Private npm repository 설정 후 진행 예정

| 작업 | 상태 |
|------|------|
| README.md 작성 | ⏳ 보류 |
| CHANGELOG.md 작성 | ⏳ 보류 |
| 패키지 버전 관리 | ⏳ 보류 |
| Private npm 설정 | ⏳ 보류 |

### 3. 선택적 확장

| 작업 | 상태 | 비고 |
|------|------|------|
| Ellipse 측정 도구 | ⏳ | 필요 시 추가 |
| VTI 측정 도구 | ⏳ | 필요 시 추가 |
| 라벨 드래그 | ⏳ | 필요 시 추가 |
| Plugin System (Phase 4) | ⏳ | |
| 16-bit 텍스처 지원 | ⏳ | CT/MR용 |

---

## 알려진 이슈

| 이슈 | 상태 | 참고 |
|------|------|------|
| pnpm dev Race Condition | ✅ 해결됨 | [troubleshooting](../troubleshooting/pnpm-dev-race-condition.md) |
| 루트 tsconfig JSX 설정 누락 | ✅ 해결됨 | 세션 #40 |
| DicomViewport 타입 불일치 | ✅ 해결됨 | 세션 #40 |
| ESLint 환경 설정 미흡 | 🟡 미해결 | browser/node 전역 변수 no-undef |
| VSCode DOM 타입 인식 오류 | 🟡 미해결 | 빌드 정상 |
| HardwareInfoPanel GPU 정보 (Multi) | 🟡 미표시 | |

### pnpm dev Race Condition (세션 #39)

**증상**: 새 환경에서 `pnpm dev` 실행 시 "Failed to resolve entry for package" 오류

**원인**: `--parallel` 플래그로 인해 packages 빌드 완료 전 apps/demo가 의존성 스캔

**적용된 해결책**:
- `package.json`의 dev 스크립트 수정: `pnpm build && pnpm -r --parallel run dev`
- `apps/demo/vite.config.ts`에 alias 추가 (추가 안전장치)

### 해결된 이슈 (세션 #37)

| 이슈 | 해결 |
|------|------|
| Multi ViewPort 어노테이션 도구 미작동 | ✅ 이벤트 핸들링 수정 |
| Multi ViewPort 캘리브레이션 미로딩 (px 표시) | ✅ full DICOM 인스턴스에서 추출 |
| 개별 뷰어 어노테이션 visibility 미작동 | ✅ 개별 상태 관리 추가 |
| 디버그 console.log 잔존 | ✅ 제거 완료 |

---

## 아키텍처 결정 사항

| 항목 | 결정 |
|------|------|
| 메모리 전략 | GPU-only (Upload & Release) |
| Context Loss | 이벤트 리스너 + ref 기반 복구 |
| VRAM 관리 | TextureLRUCache (eviction 비활성화) |
| 16-bit 지원 | Phase 4+ 예정 |
| 어노테이션 좌표계 | DICOM 픽셀 좌표 저장 |

---

## 참고 문서

- [아키텍처](../architecture/overview.md)
- [Phase 3 설계](../design/phase3-annotations-plan.md)
- [세션 기록](./session-log.md)
