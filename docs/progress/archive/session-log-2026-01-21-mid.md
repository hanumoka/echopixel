# Session Log Archive - 2026-01-21 중반

> **아카이브**: 2026-01-21 세션 #24~#33 기록
>
> **기간**: 2026-01-21 (초중반)
>
> **주요 작업**:
> - Phase 3g (어노테이션 생성 UI) 완료
> - HybridMultiViewport 어노테이션 통합
> - 도구 격리 및 이벤트 처리 개선
> - 브라우저 줌 대응 버그 수정
> - 뷰포트 개수 슬라이더 시스템
> - Multi ViewPort 기능 보완

---

## 2026-01-21 세션 #33 (Multi ViewPort Single viewport 기반 기능 보완)

### 작업 내용

**SingleDicomViewerGroup 기능 보완** ⭐

사용자 요청: "multi Viewport(Singleviewport기반)에서 어노테이션 도구 동작 안함, 레이아웃 수정 필요, 기능 검증 필요"

**구현 사항**:

1. **SingleDicomViewerGroup Props 확장**
   - [x] `toolbarTools` prop 추가 (어노테이션 도구 포함)
   - [x] `enableDoubleClickExpand` prop 추가 (더블클릭 확대)
   - [x] Annotation 관련 props 추가:
     - `onAnnotationSelect`, `onAnnotationUpdate`, `onAnnotationDelete`
     - `onAnnotationCreate`, `onAnnotationsVisibilityChange`
   - [x] `ViewerData.annotations` 필드 추가

2. **더블클릭 확대 뷰 구현**
   - [x] `expandedViewerId` 상태 관리
   - [x] 확대 뷰 오버레이 렌더링 (90% 크기)
   - [x] ESC 키로 닫기 (useEffect + keydown)
   - [x] 더블클릭으로 닫기

3. **데모 앱 업데이트**
   - [x] `DEFAULT_TOOLS` import 및 전달
   - [x] `enableDoubleClickExpand={true}` 활성화
   - [x] `showAnnotations: true` viewerOptions 추가

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/react/src/components/SingleDicomViewerGroup.tsx` | annotation props, toolbarTools, enableDoubleClickExpand, 확대 뷰 오버레이 |
| `apps/demo/src/App.tsx` | DEFAULT_TOOLS import, SingleDicomViewerGroup props 추가 |

### 기능 비교표

| 기능 | Single canvas | Single viewport 기반 |
|------|---------------|---------------------|
| 레이아웃 슬라이더 | ✅ | ✅ |
| 어노테이션 도구 | ✅ | ✅ (추가됨) |
| 더블클릭 확대 | ✅ | ✅ (추가됨) |
| 개별 재생/정지 | 그룹만 | ✅ 개별+그룹 |
| FPS 제어 | ✅ | ✅ |
| VRAM 관리 | ✅ | N/A (독립 캔버스) |

### 학습 포인트

- **컴포넌트 Props 설계**: 상위 컴포넌트(Group)가 하위 컴포넌트(Viewer)에 props를 전달할 때, 콜백은 viewerId를 포함하여 어떤 뷰어에서 발생했는지 식별
- **ESC 키 핸들링**: useEffect에서 조건부 이벤트 리스너 등록 (상태가 있을 때만)
- **확대 뷰 구현**: position: absolute 오버레이 + stopPropagation으로 버블링 방지

---

## 2026-01-21 세션 #32 (Multi ViewPort UI 통합 및 그리드 최적화)

### 작업 내용

**Multi ViewPort (Single ViewPort 기반) UI 통합** ⭐

사용자 요청: "multi 뷰포터 (single canvas)의 화면구현을 multi viewport(single viewport기반)에 적용해줘"

**구현 사항**:

1. **SingleDicomViewerGroup 컴포넌트 확장**
   - [x] `viewportCount` prop 추가
   - [x] `calculateGridFromCount()` 함수 추가 (HybridMultiViewport와 동일 로직)
   - [x] UI 요소 높이 계산 개선 (toolbar, statusbar, controls, padding)

2. **DicomCanvas 종횡비 보정**
   - [x] `calculateAspectScale` 적용 (기존에는 HybridMultiViewport만 적용)
   - [x] 3개 탭 모두 DICOM 원본 종횡비 유지

3. **배경색 구분**
   - [x] WebGL clearColor: `(0, 0, 0, 1)` → `(0.1, 0.1, 0.1, 1)` (어두운 회색)
   - [x] CSS background: `#000` → `#1a1a1a`
   - [x] 적용 파일: DicomCanvas, SingleDicomViewer, HybridViewportGrid, RenderScheduler, HybridRenderScheduler

4. **그리드 레이아웃 최적화** ⭐
   - [x] 가로 열 최대 4개로 제한
   - [x] 4개 이하 뷰포트: 정사각형에 가깝게 배치 (1→1×1, 2→2×1, 3-4→2×2)
   - [x] 5개 이상 뷰포트: 4열 고정 (5→4×2, 9→4×3...)

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/react/.../SingleDicomViewerGroup.tsx` | `viewportCount` prop, `calculateGridFromCount()`, UI 높이 계산 |
| `packages/react/.../HybridMultiViewport.tsx` | `calculateGridFromCount()` 그리드 최적화 로직 |
| `packages/react/.../DicomCanvas.tsx` | `calculateAspectScale` 적용, 배경색 변경 |
| `packages/react/.../SingleDicomViewer.tsx` | 배경색 변경 |
| `packages/react/.../HybridViewportGrid.tsx` | 배경색 변경 |
| `packages/core/src/sync/RenderScheduler.ts` | WebGL clearColor 변경 |
| `packages/core/src/hybrid/HybridRenderScheduler.ts` | WebGL clearColor 변경 |
| `apps/demo/src/App.tsx` | `getGridDimensions()` 함수, 레이아웃 슬라이더 UI |

### 학습 포인트

- **종횡비 보정**: `calculateAspectScale()` → fit-to-viewport 방식
- **그리드 최적화**: UX 관점에서 가로 열 제한이 필요한 이유 - 너무 긴 가로 스크롤 방지
- **배경색 설계**: DICOM 이미지가 검은색인 경우 배경과 구분 필요

---

## 2026-01-21 세션 #31 (뷰포트 개수 슬라이더 및 동적 그리드)

### 작업 내용

**레이아웃 시스템 변경: 고정 그리드 → 동적 뷰포트 개수** ⭐

사용자 요청: "레이아웃을 2x2, 3x3 이런 식으로 만들지 않겠다. 1~50개로 슬라이드 바로 선택하고 싶다."

**구현 사항**:

1. **HybridMultiViewport 컴포넌트 확장**
   - [x] `viewportCount` prop 추가 (1~50)
   - [x] `calculateGridFromCount()` 함수 구현
     - 뷰포트 개수로 최적 그리드 차원 자동 계산
     - 예: 16개 → 4×4, 17개 → 5×4
   - [x] `slotCount` 변경 감지 useEffect 추가
     - 뷰포트 개수 변경 시 슬롯 재생성
     - HybridViewportManager dispose 후 재초기화

2. **데모 앱 UI 변경**
   - [x] 레이아웃 드롭다운 → 슬라이더로 교체
   - [x] `viewportCount` 상태 추가
   - [x] `getMaxSelect()` 함수 수정: `viewportCount` 반환
   - [x] UI 텍스트 업데이트 (로드 버튼, Instance 선택 표시)

**버그 수정**:
- [x] 인스턴스 로드 4개 제한 버그
  - **원인**: `getMaxSelect()` 함수가 오래된 `layout` 변수 사용
  - **수정**: `viewportCount`를 직접 반환하도록 변경
- [x] 뷰포트 그리드 4개만 표시 버그
  - **원인**: `handleCanvasRef` 콜백이 canvas 변경 시에만 실행되어 `slotCount` 변경 미감지
  - **수정**: `slotCount` 변경을 감지하는 별도 useEffect 추가

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/react/src/components/HybridMultiViewport.tsx` | `viewportCount` prop, `calculateGridFromCount()`, slotCount 변경 감지 effect |
| `apps/demo/src/App.tsx` | 레이아웃 드롭다운→슬라이더, `viewportCount` 상태, `getMaxSelect()` 수정, UI 텍스트 |

### 핵심 코드

**자동 그리드 차원 계산 (HybridMultiViewport.tsx)**
```typescript
function calculateGridFromCount(count: number): { rows: number; cols: number } {
  if (count <= 0) return { rows: 1, cols: 1 };
  if (count === 1) return { rows: 1, cols: 1 };
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { rows, cols };
}
```

**slotCount 변경 감지 effect (HybridMultiViewport.tsx)**
```typescript
const prevSlotCountRef = useRef<number>(slotCount);
useEffect(() => {
  if (!isInitialized || !hybridManagerRef.current || prevSlotCountRef.current === slotCount) {
    prevSlotCountRef.current = slotCount;
    return;
  }

  // 기존 매니저 정리 후 재생성
  hybridManager.dispose();
  const newHybridManager = new HybridViewportManager({ canvas, dpr });
  const ids = newHybridManager.createSlots(slotCount);
  setViewportIds(ids);
  // ... RenderScheduler 재생성
}, [slotCount, isInitialized, dpr, setupRenderCallbacks]);
```

**getMaxSelect() 수정 (App.tsx)**
```typescript
// 이전: layout 기반 계산 (버그)
const getMaxSelect = () => {
  const gridSizeMap = { 'grid-2x2': 2, 'grid-3x3': 3, ... };
  return gridSize * gridSize;  // 항상 4 반환
};

// 수정: viewportCount 직접 반환
const getMaxSelect = () => viewportCount;
```

### 학습 포인트

- **useCallback 의존성**: `useCallback`에 의존성을 추가해도 콜백 자체가 재호출되지는 않음. 콜백은 "호출"되어야 실행됨.
- **React 상태와 클로저**: 함수 컴포넌트 내 함수가 오래된 상태를 참조하는 클로저 문제 주의
- **동적 그리드 계산**: `Math.ceil(Math.sqrt(count))`로 열 수 계산, `Math.ceil(count / cols)`로 행 수 계산하면 최적의 정사각형에 가까운 그리드 생성

---

## 2026-01-21 세션 #30 (Multi ViewPort 캘리브레이션 버그 수정)

### 작업 내용

**Multi ViewPort 거리 어노테이션 "px" 표시 버그 수정** ⭐

사용자 이슈: "Multi ViewPort (Single canvas 기반)"에서 거리 측정 시 mm/cm 대신 "px" 표시

**근본 원인 분석**:
1. 디버그 로깅으로 문제 추적
2. `[HybridMultiViewport] imageInfo for viewport: { hasUltrasoundCalibration: false }` 확인
3. `[WadoRsDataSource] ✅ Parsed ultrasoundCalibration:` 로그가 전혀 없음 발견
4. **원인**: WADO-RS 서버가 Ultrasound Calibration 태그(00186011)를 메타데이터에 포함하지 않음
5. Single ViewPort에는 폴백 로직이 있었으나, Multi ViewPort에는 없었음

**수정 사항**:
- [x] `handleMultiViewportLoad`에 캘리브레이션 폴백 로직 추가
  - WADO-RS 메타데이터에 pixelSpacing/ultrasoundCalibration 없으면
  - 전체 DICOM 인스턴스(`application/dicom`) 로드하여 캘리브레이션 추출
- [x] `setMultiCanvasLoaded is not defined` 에러 수정
  - 이전 리팩토링에서 상태 제거 후 참조 남아있던 버그

**Single ViewPort 더블클릭 확대 기능 추가**:
- [x] `singleExpandedView` 상태 추가
- [x] ESC 키로 확대 뷰 닫기 (Single + Multi 모두)
- [x] body 스크롤 비활성화 (확대 뷰 열릴 때)

**디버그 로깅 추가** (문제 진단용):
- [x] `WadoRsDataSource.parseUltrasoundCalibration`: 태그 존재 여부, 시퀀스 내용 로깅
- [x] `WadoRsDataSource.parseDicomJson`: 캘리브레이션 파싱 결과 로깅
- [x] `App.tsx handleMultiViewportLoad`: 뷰포트별 캘리브레이션 정보 로깅

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `apps/demo/src/App.tsx` | 캘리브레이션 폴백 로직, setMultiCanvasLoaded 에러 수정, Single 확대 뷰, 디버그 로깅 |
| `packages/core/src/datasource/WadoRsDataSource.ts` | 상세 디버그 로깅 추가 |

### 핵심 코드

**캘리브레이션 폴백 로직 (App.tsx)**
```typescript
// calibration 폴백: WADO-RS 메타데이터에 없으면 전체 DICOM 인스턴스에서 추출
if (!finalImageInfo.pixelSpacing && !finalImageInfo.ultrasoundCalibration) {
  const instanceUrl = `${wadoBaseUrl}/studies/${studyUid}/series/${seriesUid}/instances/${instanceUidToLoad}`;
  const instanceResponse = await fetch(instanceUrl, {
    headers: { 'Accept': 'application/dicom' },
  });

  if (instanceResponse.ok) {
    const instanceBuffer = await instanceResponse.arrayBuffer();
    const ultrasoundCalibration = getUltrasoundCalibration(instanceBuffer);
    if (ultrasoundCalibration) {
      finalImageInfo = { ...finalImageInfo, ultrasoundCalibration };
    }
  }
}
```

### 학습 포인트

- **WADO-RS vs DICOM Part 10**: WADO-RS 메타데이터(`application/dicom+json`)는 서버 설정에 따라 일부 태그가 누락될 수 있음. 전체 DICOM 인스턴스(`application/dicom`)를 로드하면 모든 태그 접근 가능.
- **캘리브레이션 폴백 전략**: 메타데이터에 없으면 전체 인스턴스에서 추출 (네트워크 비용 증가, 정확도 보장)
- **코드 일관성**: 동일한 기능(캘리브레이션 추출)은 모든 뷰포트 타입에 동일하게 적용해야 함

---

## 2026-01-21 세션 #29 (Multi Canvas 모드 리팩토링)

### 작업 내용

**Multi Canvas 모드 리팩토링 - SingleDicomViewerGroup 적용** ⭐

"Multi ViewPort (Single viewPort 기반)" 탭이 실제로는 레거시 `DicomViewport` 컴포넌트를 사용하고 있어 Single ViewPort의 풍부한 UI (툴바, 상태바, 어노테이션 도구)가 없었음. 이를 `SingleDicomViewerGroup`으로 교체하여 일관된 UI 제공.

- [x] `MultiCanvasGrid` → `SingleDicomViewerGroup` 교체
- [x] 데이터 로딩 함수 `loadMultiCanvasViewers()` 추가
  - WADO-RS를 통해 DICOM 데이터 로드
  - `ViewerData[]` 형식으로 변환
- [x] 그룹 컨트롤 패널 추가
  - 전체 재생/정지 토글
  - 처음으로 이동
  - 뷰포트 리셋
- [x] 상태 변수 정리
  - `multiCanvasLoaded`, `multiCanvasUids` → `multiCanvasViewers` (ViewerData[])
  - `multiCanvasDataSource` useMemo 제거
  - `multiCanvasGroupRef` (SingleDicomViewerGroupHandle) 추가

### 설계 결정

| 옵션 | 설명 | 선택 |
|------|------|------|
| A. SingleDicomViewerGroup 사용 | @echopixel/react의 기존 컴포넌트 활용 | ✅ 선택 |
| B. MultiCanvasGrid 리팩토링 | DicomViewport → SingleDicomViewer 직접 교체 | - |
| C. 현상 유지 + UI 개선 | DicomViewport에 기능 추가 | - |

**선택 이유**: "안전하고 유연한 설계" - 이미 검증된 SingleDicomViewerGroup을 사용하여 코드 중복 방지 및 일관성 유지

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `apps/demo/src/App.tsx` | SingleDicomViewerGroup import, 상태/로딩 함수 추가, 렌더링 교체 |

### 핵심 코드

**ViewerData 변환 (loadMultiCanvasViewers)**
```typescript
viewers.push({
  id: `viewer-${i}`,
  frames,
  imageInfo: metadata.imageInfo,
  isEncapsulated: metadata.isEncapsulated,
  label: `#${i + 1} (${metadata.frameCount}f)`,
});
```

**레이아웃 변환 (LayoutType → ViewerGroupLayout)**
```typescript
const layoutMap: Record<LayoutType, ViewerGroupLayout> = {
  'grid-1x1': '1x1',
  'grid-2x2': '2x2',
  'grid-3x3': '3x3',
  'grid-4x4': '4x4',
  'grid-5x5': '4x4', // fallback
  // ...
};
```

### 학습 포인트

- **컴포넌트 재사용**: 라이브러리에 이미 존재하는 `SingleDicomViewerGroup`을 활용하면 중복 구현 없이 일관된 UI 제공 가능
- **데이터 변환 레이어**: 기존 WADO-RS 로딩 로직을 `ViewerData[]` 형식으로 변환하여 컴포넌트에 전달
- **레거시 코드 정리**: 사용하지 않는 상태/함수 제거로 코드 복잡도 감소

---

## 2026-01-21 세션 #28 (더블클릭 확대 뷰 & IP 접속 지원)

### 작업 내용

**IP 접속 지원 (동료 테스트용)** ⭐
- [x] Vite 개발 서버 `host: '0.0.0.0'` 설정 (모든 IP에서 접속 허용)
- [x] WADO-RS URL 동적 생성 (`window.location.hostname` 기반)
- [x] sado_be CORS 설정 수정 (개발 환경에서 모든 origin 허용)
  - `allowedOriginPatterns("*")` 사용 (allowCredentials와 호환)
  - 개발/로컬 프로파일에서만 활성화, 운영 환경은 기존 방식 유지

**더블클릭 확대 뷰 기능 구현** ⭐
- [x] Multi ViewPort에서 DICOM 더블클릭 시 Single Viewport 확대 뷰 표시
- [x] HybridViewportSlot: `onDoubleClick` prop 추가
- [x] HybridMultiViewport: `onViewportDoubleClick` prop 추가
- [x] 데모 앱: `expandedViewportId` 상태, 오버레이 렌더링
- [x] ESC 키로 확대 뷰 닫기
- [x] 확대 뷰 열릴 때 body 스크롤 비활성화
- [x] 뷰포트 ID ↔ seriesMap 키 양방향 매핑

**코드 리뷰 및 버그 수정** ⭐
- [x] **더블클릭 이벤트 핸들러 중복 제거**
  - 문제: React `onDoubleClick` + native `dblclick` 리스너 동시 존재 → 콜백 여러 번 호출
  - 수정: native dblclick 리스너 제거, React onDoubleClick만 사용
  - 파일: `HybridMultiViewport.tsx` - handleDblClick, addEventListener 삭제
- [x] **setTimeout 500ms race condition 해결**
  - 문제: ID 매핑이 타이밍에 의존 (불안정)
  - 수정: `onViewportIdsReady` 콜백 prop 추가
  - 파일: `HybridMultiViewport.tsx` - useEffect에서 viewportIds/seriesMap 준비 시 콜백 호출
  - 파일: `App.tsx` - handleViewportIdsReady 콜백으로 대체

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `apps/demo/vite.config.ts` | `host: '0.0.0.0'` 추가 (IP 접속 허용) |
| `apps/demo/src/App.tsx` | WADO URL 동적 생성, 확대 뷰 오버레이, handleViewportIdsReady |
| `packages/react/.../HybridViewportSlot.tsx` | onDoubleClick prop 추가 |
| `packages/react/.../HybridMultiViewport.tsx` | onViewportDoubleClick prop, onViewportIdsReady prop, 중복 이벤트 핸들러 제거 |
| `sado_be/.../WebConfig.java` | 개발 환경 CORS `allowedOriginPatterns("*")` 적용 |

### 핵심 코드

**onViewportIdsReady 콜백 (HybridMultiViewport.tsx)**
```typescript
// viewportIds와 seriesMap이 모두 준비되면 콜백 호출
useEffect(() => {
  if (!onViewportIdsReady || viewportIds.length === 0 || !seriesMap || seriesMap.size === 0) {
    return;
  }
  const seriesKeys = Array.from(seriesMap.keys());
  onViewportIdsReady(viewportIds, seriesKeys);
}, [viewportIds, seriesMap, onViewportIdsReady]);
```

**ID 매핑 콜백 사용 (App.tsx)**
```typescript
// setTimeout 대신 콜백 사용
const handleViewportIdsReady = useCallback((internalIds: string[], seriesKeys: string[]) => {
  const mapping = new Map<string, string>();
  for (let i = 0; i < internalIds.length && i < seriesKeys.length; i++) {
    mapping.set(internalIds[i], seriesKeys[i]);
  }
  setViewportIdToSeriesKeyMap(mapping);
}, []);
```

### 학습 포인트

- **React vs Native 이벤트 중복**: 동일 요소에 React onDoubleClick + native addEventListener('dblclick') 모두 등록하면 콜백이 여러 번 호출됨
- **setTimeout 안티패턴**: 타이밍에 의존한 초기화는 race condition 발생 → 콜백 기반 접근이 안정적
- **ID 매핑 문제**: HybridMultiViewport 내부 ID (viewport-timestamp-random)와 seriesMap 키 (viewport-0, viewport-1)가 다름 → 양방향 매핑 필요
- **Vite IP 접속**: `server.host: '0.0.0.0'` 설정으로 모든 네트워크 인터페이스에서 접속 허용
- **Spring CORS**: `allowCredentials(true)` + `allowedOrigins("*")` 불가 → `allowedOriginPatterns("*")` 사용
- **동적 WADO URL**: `window.location.hostname`으로 접속한 호스트 기반 URL 자동 생성

---

## 2026-01-21 세션 #27 (데모앱 탭 정리 & 문서화)

### 작업 내용

**데모앱 탭 순서 및 제목 변경**
- [x] 탭 순서 변경: Single → Multi (multi-canvas) → Multi (multi)
- [x] 탭 제목 변경:
  - `Single ViewPort`
  - `Multi ViewPort (Single viewPort 기반)` (구 multi-canvas)
  - `Multi ViewPort (Single canvas 기반)` (구 multi)

**CLAUDE.md 문서화**
- [x] 데모앱 뷰포트 모드 섹션 추가
- [x] 기능 적용 순서 문서화 (필수 가이드라인)

### 핵심 결정사항 ⭐

**기능 적용 순서 (개발 파이프라인)**:
```
Single ViewPort → Multi ViewPort (Single viewPort 기반) → Multi ViewPort (Single canvas 기반)
```

| 순서 | 모드 | 이유 |
|------|------|------|
| 1 | Single ViewPort | 기능 개발/검증 기준점 |
| 2 | Multi (Single viewPort 기반) | Single을 여러 개 배치 → 기능 자연 적용 |
| 3 | Multi (Single canvas 기반) | WebGL 분할 → 별도 최적화 필요 |

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `apps/demo/src/App.tsx` | 탭 순서 변경, 탭 제목 변경 |
| `CLAUDE.md` | "데모앱 뷰포트 모드" 섹션 추가 |

---

## 2026-01-21 세션 #26 (종횡비 보정 & 도구바 영역 예약)

### 작업 내용

**도구바 영역 항상 예약** ⭐
- [x] **문제**: 뷰포트 선택/해제 시 도구바가 나타나거나 사라지면서 DICOM 영역 크기 변동
- [x] **해결**: 도구바 영역을 항상 예약하고, 버튼만 선택된 뷰포트에서 표시
- [x] HybridViewportSlot: topToolbar, bottomToolbar props (영역 항상 유지)
- [x] 선택된 뷰포트: 밝은 배경 + 버튼 표시
- [x] 선택 안 된 뷰포트: 어두운 배경 + 버튼 숨김

**도구바가 WebGL Canvas 영역과 겹치는 문제 해결** ⭐
- [x] **근본 원인**: `getBoundingClientRect()`가 도구바 영역 포함한 전체 슬롯 크기 반환
- [x] **해결**: HybridViewportSlot DOM 구조 변경
  - 외부 컨테이너: topToolbar + contentArea + bottomToolbar (flex column)
  - contentRef: 이미지 영역만 (도구바 제외)
  - HybridViewportManager에 contentRef만 등록 → WebGL 렌더링 영역 정확
- [x] 뷰포트 선택 변경 시 bounds 재동기화 (double requestAnimationFrame)

**종횡비 보정 (Aspect Ratio Preservation)** ⭐
- [x] **문제**: DICOM 이미지가 뷰포트에 꽉 채워지면서 가로로 눌림 (찌그러짐)
- [x] **Cornerstone 방식 분석**: `getImageFitScale()` 함수 조사
  - `scaleFactor = min(viewportH/imageH, viewportW/imageW)`
  - 이미지 종횡비 유지, 남는 공간은 검은색 (letterbox/pillarbox)
- [x] **구현**:
  - `shaders.ts`: `u_aspectScale` uniform 추가 (vec2)
  - `QuadRenderer.ts`: `AspectScaleOptions` 인터페이스, `calculateAspectScale()` 함수
  - Vertex Shader: 다른 변환 전에 aspectScale 적용
  - `HybridMultiViewport.tsx`: 렌더 콜백에서 이미지/뷰포트 크기로 스케일 계산

### 핵심 코드

**종횡비 계산 공식 (QuadRenderer.ts)**
```typescript
export function calculateAspectScale(
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number
): AspectScaleOptions {
  const imageAspect = imageWidth / imageHeight;
  const viewportAspect = viewportWidth / viewportHeight;

  let scaleX = 1.0, scaleY = 1.0;

  if (imageAspect > viewportAspect) {
    // 이미지가 더 넓음 → 가로 맞춤, 세로 축소 (letterbox)
    scaleY = viewportAspect / imageAspect;
  } else {
    // 이미지가 더 높음 → 세로 맞춤, 가로 축소 (pillarbox)
    scaleX = imageAspect / viewportAspect;
  }

  return { scaleX, scaleY };
}
```

**Vertex Shader 변환 순서 (shaders.ts)**
```glsl
void main() {
  // 1. 종횡비 보정 (이미지 비율 유지)
  vec2 aspectPos = a_position * u_aspectScale;
  // 2. Zoom
  vec2 scaledPos = aspectPos * u_zoom;
  // 3. Flip
  // 4. Rotation
  // 5. Pan
  gl_Position = vec4(finalPos, 0.0, 1.0);
}
```

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/core/src/webgl/shaders.ts` | u_aspectScale uniform 추가, 변환 순서 주석 |
| `packages/core/src/webgl/QuadRenderer.ts` | AspectScaleOptions, calculateAspectScale(), 렌더러 파라미터 추가 |
| `packages/core/src/webgl/index.ts` | export 추가 |
| `packages/core/src/index.ts` | export 추가 |
| `packages/react/.../HybridMultiViewport.tsx` | calculateAspectScale import, 렌더 콜백에서 스케일 계산 |
| `packages/react/.../HybridViewportSlot.tsx` | topToolbar, bottomToolbar props, DOM 구조 변경 |

### 학습 포인트

- **fit-to-viewport vs stretch**: 의료 영상에서 종횡비 유지가 진단 정확도에 중요
- **Cornerstone 접근법**: `min(scaleH, scaleW)` 공식으로 이미지가 뷰포트 안에 완전히 들어감
- **변환 순서**: aspectScale → zoom → flip → rotation → pan (역변환은 역순)
- **DOM 구조 분리**: WebGL 렌더링 영역과 UI 영역 명확히 분리하여 bounds 계산 정확도 보장

---

## 2026-01-21 세션 #25 (HybridMultiViewport 어노테이션 생성 & 조작 도구 통합)

### 작업 내용

**HybridMultiViewport 어노테이션 생성 기능** ⭐
- [x] MeasurementTool 통합 (LengthTool, AngleTool, PointTool)
- [x] DicomMiniOverlay에 어노테이션 도구 버튼 추가 (📏 거리, ∠ 각도, ● 점)
- [x] Canvas 이벤트 처리 (mousedown, mousemove, contextmenu)
- [x] tempAnnotation 렌더링 (점선 미리보기)
- [x] Delete/Backspace 키 삭제 기능
- [x] Escape 키 드로잉 취소

**HybridMultiViewport 조작 도구 통합** ⭐
- [x] **문제**: W/L, Pan, Zoom, StackScroll 도구가 동작하지 않음
- [x] **원인**: Tool System 콜백이 React 상태를 업데이트하지 않음 (hybridManager만 변경)
- [x] **해결**: ViewportManagerLike 어댑터 패턴 구현
  - hybridManager 메서드 호출 + setViewports() + renderSingleFrame() 조합
- [x] StackScroll 프레임 변경 시 렌더링 동작 확인

**성능 최적화 (드래그 버벅임 수정)** ⭐
- [x] **문제**: 어노테이션 드래그 시 극심한 렉 발생
- [x] **원인**: useEffect 의존성에 viewports, getActiveViewportTransformContext 포함
  - 매 마우스 이동마다 이벤트 핸들러 재등록
- [x] **해결**: Ref 패턴으로 최신 값 접근
  - `getActiveViewportTransformContextRef`, `viewportsRef` 사용
  - useEffect 의존성에서 제거하여 재등록 방지

**tempAnnotation 첫 포인트 미표시 수정**
- [x] **문제**: 첫 포인트 클릭 후 화면에 미표시, 두 번째 클릭 후에야 표시
- [x] **원인**: SVGOverlay에 tempAnnotationType prop 미전달
- [x] **해결**: tempAnnotationType prop 추가 및 activeMeasurementToolId 매핑

**UI 개선**
- [x] DicomMiniOverlay 버튼 크기 증가 (24×24px → 32×32px)
- [x] 버튼 폰트 크기 증가 (12px → 16px)
- [x] W/L, Pan, Zoom 버튼 추가 (어노테이션 도구와 분리)
- [x] 어노테이션 표시 토글 버튼 (데모 앱)

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/react/.../HybridMultiViewport.tsx` | MeasurementTool 통합, ViewportManagerLike 어댑터, Ref 패턴 최적화, Delete 키 핸들러 |
| `packages/react/.../DicomMiniOverlay.tsx` | 버튼 크기 증가, W/L/Pan/Zoom 버튼 추가 |
| `packages/react/.../SVGOverlay.tsx` | tempAnnotationType prop 추가 |
| `apps/demo/src/App.tsx` | 어노테이션 표시 토글 버튼 |

### 핵심 코드

**ViewportManagerLike 어댑터 (HybridMultiViewport.tsx)**
```typescript
const viewportManagerAdapter = useMemo<ViewportManagerLike | null>(() => {
  const hybridManager = hybridManagerRef.current;
  if (!hybridManager) return null;

  return {
    getViewport: (id: string) => hybridManager.getViewport(id),
    setViewportWindowLevel: (id: string, wl: { center: number; width: number } | null) => {
      hybridManager.setViewportWindowLevel(id, wl);
      setViewports(hybridManager.getAllViewports());  // React 상태 업데이트
      renderSchedulerRef.current?.renderSingleFrame();  // 즉시 렌더링
    },
    // Pan, Zoom, Frame도 동일 패턴
  };
}, [isInitialized]);
```

**Ref 패턴으로 성능 최적화 (HybridMultiViewport.tsx)**
```typescript
// Ref로 최신 값 접근 (useEffect 의존성 제거)
const getActiveViewportTransformContextRef = useRef<() => TransformContext | null>(() => null);
const viewportsRef = useRef<Viewport[]>([]);

// 매 렌더링마다 ref 업데이트 (의존성 없음)
getActiveViewportTransformContextRef.current = getActiveViewportTransformContext;
viewportsRef.current = viewports;

// useEffect에서 ref 사용 → 재등록 없이 최신 값 접근
useEffect(() => {
  const handleMouseMove = (e: MouseEvent) => {
    const transformContext = getActiveViewportTransformContextRef.current();
    // ...
  };
  canvas.addEventListener('mousemove', handleMouseMove);
  // 의존성: [isInitialized, activeMeasurementToolId] (viewports 제거!)
}, [isInitialized, activeMeasurementToolId]);
```

### 학습 포인트

- **ViewportManagerLike 어댑터**: Tool System은 ViewportManagerLike 인터페이스를 통해 뷰포트 조작
  - SingleDicomViewer: 직접 React 상태 업데이트
  - HybridMultiViewport: hybridManager + React 상태 + 렌더링 조합 필요
- **Ref 패턴**: useEffect 내부에서 최신 상태 접근이 필요하지만 재실행을 원하지 않을 때
  - 상태 변경 → ref 업데이트 (렌더링 단계)
  - useEffect → ref.current 읽기 (최신 값, 재등록 없음)
- **성능**: 이벤트 핸들러 등록/해제는 비용이 큼 → 의존성 최소화

---

## 2026-01-21 세션 #24 (도구 격리, 이미지 경계, 브라우저 줌 수정)

### 작업 내용

**어노테이션 선택/편집 UI 개선**
- [x] Shape 컴포넌트에 `annotation-shape` 공통 클래스 추가
- [x] SingleDicomViewer: 어노테이션 클릭 시 MeasurementTool 이벤트 전파 차단
- [x] SVGOverlay: 임시 어노테이션 `pointerEvents: 'none'` 적용 (클릭 간섭 방지)
- [x] SVGOverlay: document-level 드래그 이벤트 처리 (SVG 영역 밖 드래그 지원)

**조작 도구/어노테이션 도구 격리** ⭐
- [x] **문제**: W/L 선택 후 어노테이션 도구 선택 시 드래그하면 W/L도 동작
- [x] **원인**: 이전 도구의 바인딩만 복원, 모든 조작 도구 바인딩 미처리
- [x] `MANIPULATION_TOOL_IDS` 상수 추가 (WindowLevel, Pan, Zoom, StackScroll)
- [x] `handleToolbarToolChange`: 어노테이션 도구 선택 시 모든 조작 도구를 기본 바인딩으로 복원

**DragHandle 이벤트 전파 수정** ⭐
- [x] **문제**: W/L 선택 상태에서 기존 어노테이션 DragHandle 드래그 시 W/L 동작
- [x] **원인**: React `stopPropagation()`은 native addEventListener에 영향 없음
- [x] DragHandle.tsx: `e.nativeEvent.stopImmediatePropagation()` 추가
- [x] ToolGroup.ts: `onMouseDown`에서 `.drag-handle, .annotation-shape` 요소 클릭 시 무시

**이미지 경계 밖 어노테이션 차단** ⭐
- [x] **문제**: DICOM 이미지 영역 밖에서 어노테이션 포인트 생성 가능
- [x] `isWithinImageBounds()` 함수 추가 (DICOM 좌표 경계 검증)
- [x] `createToolEvent()`: 경계 밖 좌표 시 null 반환 → 이벤트 무시

**브라우저 줌 변경 시 검은 화면 버그 수정**
- [x] **근본 원인**: matchMedia 패턴 오류 + DPR 변경 시 재렌더링 미트리거
- [x] DicomCanvas.tsx: MDN 권장 matchMedia 패턴 적용 (매번 새 미디어 쿼리 생성)
- [x] SingleDicomViewer.tsx: 동일한 MDN matchMedia 패턴 적용
- [x] SingleDicomViewer.tsx: useEffect 의존성에 `dpr` 추가 (DPR 변경 시 재렌더링)
- [x] coordinateUtils.ts: `updateCoordinateContext()`에서 dpr 업데이트 추가

### 버그 상세: 브라우저 줌 검은 화면

**증상**: DICOM 정지 상태에서 브라우저 줌(Ctrl+휠) 변경 시 화면이 검은색으로 변함. 재생 시 정상.

**근본 원인 분석**:
1. 기존 matchMedia 코드: `window.matchMedia(\`(resolution: ${window.devicePixelRatio}dppx)\`)`
   - 문제: 초기 DPR 값으로 고정된 미디어 쿼리 → 첫 번째 변경만 감지
2. MDN 권장 패턴: 매번 새 devicePixelRatio 값으로 미디어 쿼리 재생성
3. DPR 변경 시 `setDpr()` 호출되지만 useEffect 의존성에 없어 재렌더링 미발생

**수정 사항**:
```typescript
// MDN 권장 패턴 (DicomCanvas.tsx, SingleDicomViewer.tsx)
useEffect(() => {
  let removeListener: (() => void) | null = null;
  const updatePixelRatio = () => {
    removeListener?.();
    const newDpr = Math.min(window.devicePixelRatio || 1, 2);
    setDpr(newDpr);
    const mqString = `(resolution: ${window.devicePixelRatio}dppx)`;
    const media = window.matchMedia(mqString);
    media.addEventListener('change', updatePixelRatio);
    removeListener = () => media.removeEventListener('change', updatePixelRatio);
  };
  updatePixelRatio();
  return () => removeListener?.();
}, []);

// DPR 변경 시 재렌더링 (SingleDicomViewer.tsx)
useEffect(() => {
  if (webglReady && frames.length > 0) {
    canvasRef.current?.renderFrame(currentFrame);
  }
}, [...dependencies, dpr]); // dpr 추가
```

### 버그 상세: 도구 격리 문제

**증상**: W/L 선택 → Length 도구 선택 → 마우스 드래그 시 W/L과 어노테이션이 동시에 동작

**원인 분석**:
1. 두 이벤트 시스템이 동일 DOM에서 동작 (ToolGroup native + MeasurementTool React)
2. `handleToolbarToolChange`에서 이전 도구 바인딩만 복원 → 다른 조작 도구 Primary 바인딩 유지

**수정 사항**:
```typescript
// SingleDicomViewer.tsx
const MANIPULATION_TOOL_IDS = ['WindowLevel', 'Pan', 'Zoom', 'StackScroll'] as const;

// 어노테이션 도구 선택 시 모든 조작 도구를 기본 바인딩으로 복원
for (const manipToolId of MANIPULATION_TOOL_IDS) {
  const defaultBindings = getDefaultBindings(manipToolId);
  setToolGroupToolActive(manipToolId, defaultBindings);
}
```

### 버그 상세: DragHandle 이벤트 전파

**증상**: W/L 선택 상태에서 기존 어노테이션 DragHandle 드래그 시 W/L 동작

**원인 분석**:
- React SyntheticEvent의 `stopPropagation()`은 React 이벤트 시스템 내부에서만 동작
- ToolGroup은 native `addEventListener`로 등록됨 → React 전파 중지가 영향 없음

**수정 사항**:
```typescript
// DragHandle.tsx
const handleMouseDown = useCallback((e: React.MouseEvent) => {
  e.stopPropagation();
  e.preventDefault();
  // ★ Native DOM 이벤트 전파도 중지
  e.nativeEvent.stopImmediatePropagation();
  onDragStart?.(e);
}, [onDragStart]);

// ToolGroup.ts - 방어적 체크 추가
private onMouseDown(evt: MouseEvent, viewportId: string, element: HTMLElement): void {
  const target = evt.target as Element;
  if (target.closest('.drag-handle, .annotation-shape')) {
    return; // 어노테이션 관련 요소 클릭 무시
  }
  // ... 기존 로직
}
```

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/react/.../DicomCanvas.tsx` | MDN matchMedia 패턴 |
| `packages/react/.../SingleDicomViewer.tsx` | MDN matchMedia 패턴, dpr 의존성, MANIPULATION_TOOL_IDS, 이미지 경계 검증 |
| `packages/core/.../coordinateUtils.ts` | updateCoordinateContext dpr 업데이트 |
| `packages/core/.../tools/ToolGroup.ts` | onMouseDown에서 어노테이션 요소 클릭 무시 |
| `packages/react/.../SVGOverlay.tsx` | document 드래그, pointerEvents |
| `packages/react/.../shapes/*.tsx` | annotation-shape 클래스 |
| `packages/react/.../annotations/DragHandle.tsx` | nativeEvent.stopImmediatePropagation() |

### 학습 포인트

- **MDN matchMedia DPR 감지**: 미디어 쿼리는 매번 새 DPR 값으로 재생성해야 연속 감지 가능
- **React vs Native 이벤트**: `stopPropagation()` vs `nativeEvent.stopImmediatePropagation()`
  - React stopPropagation: React 이벤트 시스템 내부에서만 전파 중지
  - nativeEvent.stopImmediatePropagation: native addEventListener도 중지
- **도구 바인딩 관리**: 도구 전환 시 모든 관련 도구의 바인딩 상태 고려 필요
- **좌표 경계 검증**: 사용자 입력 좌표는 유효 범위 내인지 항상 검증
