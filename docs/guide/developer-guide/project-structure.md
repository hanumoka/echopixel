# 프로젝트 구조

이 문서에서는 EchoPixel 프로젝트의 디렉토리 구조와 각 모듈의 역할을 설명합니다.

---

## 목차

1. [전체 구조](#전체-구조)
2. [@echopixel/core 상세](#echopixelcore-상세)
3. [@echopixel/react 상세](#echopixelreact-상세)
4. [데모 앱 구조](#데모-앱-구조)
5. [의존성 관계](#의존성-관계)

---

## 전체 구조

```
echopixel/
├── apps/                   # 애플리케이션
│   └── demo/               # 데모 앱
│
├── packages/               # 라이브러리 패키지
│   ├── core/               # @echopixel/core
│   └── react/              # @echopixel/react
│
├── docs/                   # 문서
│
└── [설정 파일들]
```

### 모노레포 구조

pnpm workspace를 사용한 모노레포 구조입니다:

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

---

## @echopixel/core 상세

**핵심 엔진 패키지**입니다. React에 의존하지 않는 순수 TypeScript 로직입니다.

```
packages/core/src/
├── index.ts                # 공개 API 내보내기
│
├── dicom/                  # DICOM 처리
│   ├── index.ts
│   ├── parser.ts           # DICOM 파싱
│   ├── decoder.ts          # 이미지 디코딩
│   ├── imageInfo.ts        # 이미지 메타데이터 추출
│   ├── calibration.ts      # 캘리브레이션
│   └── types.ts            # DICOM 타입 정의
│
├── webgl/                  # WebGL2 렌더링
│   ├── index.ts
│   ├── TextureManager.ts   # 텍스처 관리
│   ├── QuadRenderer.ts     # 2D 텍스처 렌더링
│   ├── ArrayTextureRenderer.ts  # 2D Array 텍스처 렌더링
│   ├── shaders/            # GLSL 셰이더
│   └── types.ts
│
├── viewport/               # 뷰포트 관리
│   ├── index.ts
│   ├── ViewportManager.ts  # 뷰포트 생성/관리
│   ├── Viewport.ts         # 뷰포트 클래스
│   └── types.ts
│
├── sync/                   # 프레임 동기화
│   ├── index.ts
│   ├── FrameSyncEngine.ts  # 프레임 동기화 엔진
│   ├── RenderScheduler.ts  # 렌더링 스케줄러
│   └── types.ts
│
├── tools/                  # 도구 시스템
│   ├── index.ts
│   ├── BaseTool.ts         # 도구 기본 클래스
│   ├── ToolRegistry.ts     # 도구 등록소
│   ├── ToolGroup.ts        # 도구 그룹
│   ├── manipulation/       # 조작 도구 (W/L, Pan, Zoom)
│   ├── measurement/        # 측정 도구 (Phase 3)
│   └── types.ts
│
├── annotations/            # 어노테이션 시스템
│   ├── index.ts
│   ├── AnnotationStore.ts  # 어노테이션 저장소
│   ├── types.ts            # 어노테이션 타입
│   └── calculations/       # 측정 계산 로직
│
├── cache/                  # 캐시 시스템
│   ├── index.ts
│   ├── LRUCache.ts         # 범용 LRU 캐시
│   └── TextureLRUCache.ts  # 텍스처 전용 캐시
│
├── network/                # 네트워크 유틸리티
│   ├── index.ts
│   ├── retryFetch.ts       # 재시도 로직
│   └── types.ts
│
├── datasource/             # 데이터 소스
│   ├── index.ts
│   ├── DataSource.ts       # 인터페이스
│   ├── LocalFileDataSource.ts
│   ├── WadoRsDataSource.ts
│   └── types.ts
│
├── hybrid/                 # DOM-WebGL 하이브리드
│   ├── index.ts
│   ├── HybridViewportManager.ts
│   ├── HybridRenderScheduler.ts
│   ├── coordinates.ts      # 좌표 변환
│   └── types.ts
│
└── utils/                  # 유틸리티
    ├── hardwareInfo.ts     # 하드웨어 정보
    └── calibration.ts      # 캘리브레이션 유틸
```

### 모듈별 역할

| 모듈 | 역할 | 주요 export |
|------|------|-------------|
| **dicom** | DICOM 파일 파싱, 디코딩 | `parseDicom`, `getImageInfo`, `extractPixelData` |
| **webgl** | WebGL2 렌더링 | `TextureManager`, `QuadRenderer` |
| **viewport** | 뷰포트 상태 관리 | `ViewportManager`, `Viewport` |
| **sync** | 멀티뷰포트 동기화 | `FrameSyncEngine`, `RenderScheduler` |
| **tools** | 사용자 상호작용 도구 | `WindowLevelTool`, `PanTool`, `ZoomTool` |
| **annotations** | 측정 어노테이션 | `Annotation`, `AnnotationStore` |
| **cache** | 메모리 캐시 | `LRUCache`, `TextureLRUCache` |
| **hybrid** | 대규모 뷰포트 지원 | `HybridViewportManager` |

---

## @echopixel/react 상세

**React 컴포넌트 패키지**입니다. @echopixel/core를 React로 래핑합니다.

```
packages/react/src/
├── index.ts                # 공개 API 내보내기
│
├── components/
│   ├── SingleDicomViewer.tsx      # 단일 뷰어 (완전한 UI)
│   ├── SingleDicomViewerGroup.tsx # 다중 뷰어 그룹
│   ├── HybridMultiViewport.tsx    # 대규모 멀티 뷰포트
│   │
│   ├── building-blocks/           # 저수준 컴포넌트
│   │   ├── DicomCanvas.tsx        # 순수 캔버스
│   │   ├── DicomControls.tsx      # 재생 컨트롤
│   │   ├── DicomStatusBar.tsx     # 상태 표시
│   │   ├── DicomToolbar.tsx       # 도구 선택
│   │   ├── DicomToolInfo.tsx      # 도구 안내
│   │   ├── DicomMiniOverlay.tsx   # 간소화 오버레이
│   │   ├── HybridViewportGrid.tsx # 하이브리드 그리드
│   │   └── HybridViewportSlot.tsx # 뷰포트 슬롯
│   │
│   └── annotations/               # 어노테이션 컴포넌트
│       ├── index.ts
│       ├── SVGOverlay.tsx         # SVG 오버레이
│       ├── LengthShape.tsx        # 길이 측정 도형
│       ├── AngleShape.tsx         # 각도 측정 도형
│       ├── PointShape.tsx         # 포인트 마커
│       ├── MeasurementLabel.tsx   # 측정값 라벨
│       └── DragHandle.tsx         # 드래그 핸들
│
├── types/
│   └── index.ts            # React 컴포넌트 타입
│
└── utils/
    ├── index.ts
    └── cn.ts               # 클래스명 병합 (clsx + tailwind-merge)
```

### 컴포넌트 계층

```
고수준 (Composed)
├── SingleDicomViewer
│   └── DicomCanvas + DicomToolbar + DicomControls + ...
│
├── SingleDicomViewerGroup
│   └── SingleDicomViewer × N
│
└── HybridMultiViewport
    └── HybridViewportGrid + HybridViewportSlot × N

저수준 (Building Blocks)
├── DicomCanvas        # 순수 캔버스
├── DicomToolbar       # 도구 선택
├── DicomControls      # 재생 컨트롤
├── DicomStatusBar     # 상태 표시
├── DicomToolInfo      # 도구 안내
└── DicomMiniOverlay   # 간소화 오버레이
```

---

## 데모 앱 구조

```
apps/demo/
├── src/
│   ├── main.tsx            # 엔트리 포인트
│   ├── App.tsx             # 루트 컴포넌트
│   │
│   ├── pages/              # 페이지 컴포넌트
│   │   ├── SingleViewportPage.tsx    # 단일 뷰포트
│   │   ├── MultiCanvasPage.tsx       # 다중 캔버스
│   │   ├── MultiViewportPage.tsx     # 대규모 뷰포트
│   │   └── PerfTestPage.tsx          # 성능 테스트
│   │
│   ├── components/         # 데모 전용 컴포넌트
│   │   ├── WadoConfigPanel.tsx       # WADO 설정 패널
│   │   ├── InstanceSelector.tsx      # 인스턴스 선택
│   │   ├── PlaybackControlBar.tsx    # 재생 컨트롤
│   │   ├── PerformanceOptions.tsx    # 성능 옵션
│   │   └── ExpandedViewModal.tsx     # 확대 보기 모달
│   │
│   ├── hooks/              # 커스텀 훅
│   │   ├── useWadoLoader.ts          # WADO 데이터 로딩
│   │   ├── useInstanceScanner.ts     # 인스턴스 스캔
│   │   └── useAnnotations.ts         # 어노테이션 관리
│   │
│   ├── styles/
│   │   └── globals.css     # Tailwind CSS
│   │
│   └── types/
│       └── demo.ts         # 데모 앱 타입
│
├── index.html
└── vite.config.ts
```

---

## 의존성 관계

### 패키지 간 의존성

```
@echopixel/react
    │
    └── @echopixel/core (의존)
            │
            └── (외부 의존성 없음, 순수 TypeScript)

demo (apps/demo)
    │
    ├── @echopixel/react (의존)
    └── @echopixel/core (의존)
```

### 빌드 순서

```
1. @echopixel/core  (의존성 없음, 먼저 빌드)
2. @echopixel/react (core에 의존)
3. demo             (core, react에 의존)
```

### 외부 의존성

**@echopixel/core**:
- 없음 (순수 TypeScript)

**@echopixel/react**:
- `react` (peer)
- `react-dom` (peer)
- `clsx` (클래스명 조합)
- `tailwind-merge` (Tailwind 클래스 병합)

---

## 파일 명명 규칙

| 유형 | 규칙 | 예시 |
|------|------|------|
| **컴포넌트** | PascalCase | `SingleDicomViewer.tsx` |
| **훅** | camelCase + use 접두사 | `useWadoLoader.ts` |
| **유틸리티** | camelCase | `calibration.ts` |
| **타입** | types.ts 또는 해당 모듈 | `types.ts` |
| **상수** | UPPER_SNAKE_CASE | `MANIPULATION_TOOL_IDS` |

---

## 다음 단계

- [아키텍처 이해](./architecture.md)로 데이터 흐름을 파악하세요.
- [코딩 가이드](./coding-guide.md)로 코드 스타일을 확인하세요.
