# Session Log

세션별 작업 기록입니다. 최신 세션이 위에 표시됩니다.

> **아카이브**: 오래된 세션은 [archive/](./archive/) 폴더에 있습니다.

---

## 2026-01-20 세션 #19 (@echopixel/react 멀티 뷰어 완성)

### 작업 내용

**빌딩 블록 컴포넌트 구현**
- [x] `DicomMiniOverlay`: 간소화 오버레이 (인덱스, 프레임 번호, 재생 상태, W/L)
- [x] `HybridViewportGrid`: Canvas + DOM Grid 레이어링 (z-index 기반)
- [x] `HybridViewportSlot`: DOM 슬롯 (이벤트 처리, Manager 등록)

**Composed 컴포넌트 구현**
- [x] `SingleDicomViewerGroup`: 다중 SingleDicomViewer 그리드 배치
  - 그룹 컨트롤 (전체 재생/정지, FPS 조절)
  - `syncPlayback` prop (향후 프레임 동기화용, 현재 미사용)
  - `viewerOptions`로 개별 뷰어 설정 오버라이드
- [x] `HybridMultiViewport`: 데모 앱에서 @echopixel/react로 이동
  - 데모 전용 UI 제거 (stats bar, 테스트 버튼)
  - ref 기반 외부 제어 API 유지
  - `renderOverlay` prop으로 커스텀 오버레이 지원

**데모 앱 리팩토링**
- [x] `useNewComponent` 토글 제거 (Single 모드)
- [x] `SingleDicomViewer` 필수 사용 (Local + WADO-RS)
- [x] `handleWadoLoad` async 변환 (프레임 직접 로드)
- [x] 로딩 중 입력 폼 숨김 조건 추가

**코드 정리**
- [x] CSSProperties import 수정 (React.CSSProperties → CSSProperties)
- [x] 미사용 변수 정리 (contextLostRef 등)
- [x] 콜백 파라미터 명시적 타입 추가

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/react/src/components/building-blocks/DicomMiniOverlay.tsx` | 신규 생성 |
| `packages/react/src/components/building-blocks/HybridViewportGrid.tsx` | 신규 생성 |
| `packages/react/src/components/building-blocks/HybridViewportSlot.tsx` | 신규 생성 |
| `packages/react/src/components/SingleDicomViewerGroup.tsx` | 신규 생성 |
| `packages/react/src/components/HybridMultiViewport.tsx` | 데모→라이브러리 이동 |
| `packages/react/src/index.ts` | 새 컴포넌트 export 추가 |
| `apps/demo/src/App.tsx` | Single 모드 리팩토링 |

### 설계 결정

**HybridMultiViewport 최소화 원칙**
- 라이브러리 컴포넌트는 핵심 기능만 포함
- 데모 전용 UI (stats, 테스트 버튼)는 데모 앱에서 구현
- ref 기반 API로 외부 제어 가능

**SingleDicomViewer 필수 사용**
- Local/WADO-RS 모드 통합 (viewportData 기반)
- DicomViewport는 MultiCanvasGrid에서만 사용 (레거시)

### 학습 포인트
- React Building Blocks 패턴: 작은 컴포넌트 → 큰 컴포넌트 조합
- forwardRef + useImperativeHandle: 라이브러리 컴포넌트 외부 제어 패턴
- Hybrid DOM-WebGL: z-index 레이어링, pointerEvents 제어

### 다음 세션 할 일
- [ ] Phase 3 설계: 좌표 변환 시스템
- [ ] SVG 오버레이 기본 구조
- [ ] 측정 도구 프로토타입 (Length)

---

## 2026-01-20 세션 #18 (Rotation 구현 + 데모 리팩토링 계획)

### 작업 내용

**90도 회전 기능 구현**
- [x] `shaders.ts`: Vertex shader에 `u_rotation` uniform 추가
- [x] `QuadRenderer.ts`: `TransformOptions.rotation` 추가, 렌더러에 rotation 전달
- [x] `DicomToolbar.tsx`: 회전 버튼 (↺ 좌 90°, ↻ 우 90°) 추가
- [x] `DicomCanvas.tsx`: rotation prop + CSS transform rotate() 적용
- [x] `DicomStatusBar.tsx`: rotation 변경 시 `Rot: 90°` 표시
- [x] `SingleDicomViewer.tsx`: rotation 상태, 핸들러, 리셋 시 초기화
- [x] `types.ts`: `TransformInfo.rotation` 필드 추가

**데모 앱 리팩토링 검토 및 계획 수립**
- [x] 현재 데모 앱 구조 분석 (App.tsx 2424줄, 4개 뷰 모드)
- [x] @echopixel/react 패키지 현황 검토
- [x] 리팩토링 방향 결정

### 설계 결정

**@echopixel/react 컴포넌트 구조 (확정)**

| 컴포넌트 | 용도 | 상태 |
|----------|------|------|
| `SingleDicomViewer` | 단일 뷰어 (풀 UI) | ✅ 구현됨 |
| `SingleDicomViewerGroup` | 다중 SingleDicomViewer 그리드 배치 | ⏳ 구현 예정 |
| `HybridMultiViewport` | 대규모 뷰포트 (Single Canvas + DOM Overlay) | ⏳ 구현 예정 |
| `DicomMiniOverlay` | 간소화 오버레이 (프레임 번호만) | ⏳ 구현 예정 |

**데모 탭 구조 (확정)**

| 현재 탭 | 리팩토링 후 | 비고 |
|---------|-------------|------|
| Single Viewport | `SingleDicomViewer` | 유지 |
| Multi (Single Canvas) | `HybridMultiViewport` | `disableOverlay` 옵션으로 통합 |
| Multi (Multi Canvas) | `SingleDicomViewerGroup` | 대체 |
| Hybrid-Multi | `HybridMultiViewport` | 유지 |

**Multi vs Hybrid 통합 결정**
- Multi (Single Canvas)와 Hybrid를 **하나의 컴포넌트로 통합**
- `HybridMultiViewport`에 `disableOverlay?: boolean` 옵션 추가
- 이유: 어노테이션(Phase 3) 대비, 코드 중복 방지, 유지보수 단순화

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/core/src/webgl/shaders.ts` | rotation uniform 추가 |
| `packages/core/src/webgl/QuadRenderer.ts` | rotation 지원 |
| `packages/react/src/components/building-blocks/DicomToolbar.tsx` | 회전 버튼 |
| `packages/react/src/components/building-blocks/DicomCanvas.tsx` | rotation prop |
| `packages/react/src/components/building-blocks/DicomStatusBar.tsx` | rotation 표시 |
| `packages/react/src/components/SingleDicomViewer.tsx` | rotation 상태/핸들러 |
| `packages/react/src/types.ts` | TransformInfo.rotation |

### 다음 세션 할 일
- [ ] `DicomMiniOverlay` 구현 (빌딩 블록)
- [ ] `SingleDicomViewerGroup` 구현
- [ ] `HybridMultiViewport`를 @echopixel/react로 이동
- [ ] 데모 앱에서 Multi (Multi Canvas) 탭 제거/대체

---

## 2026-01-20 세션 #17 (@echopixel/react 패키지 구현)

### 작업 내용

**@echopixel/react 패키지 생성**
- [x] `packages/react/` 패키지 구조 설정
- [x] Vite + TypeScript + vite-plugin-dts 구성
- [x] 공통 타입 정의 (`types.ts`)

**Building Blocks 컴포넌트 구현**
- [x] `DicomCanvas`: WebGL 렌더링 캔버스 (forwardRef + useImperativeHandle)
- [x] `DicomControls`: 재생/정지, FPS 조절, 프레임 슬라이더
- [x] `DicomStatusBar`: 이미지 정보, W/L, Pan/Zoom 상태 표시
- [x] `DicomToolInfo`: 마우스/키보드 도구 안내
- [x] `DicomToolbar`: 커스터마이징 가능한 도구 선택 툴바

**SingleDicomViewer 컴포넌트**
- [x] Building Blocks 조합한 완성형 단일 뷰어
- [x] Tool System 통합 (useToolGroup)
- [x] 툴바 도구 선택 시 좌클릭 바인딩 동적 변경

**OHIF 스타일 뷰포트 스타일링**
- [x] 뷰어 컨테이너: `#0b1a42` (어두운 인디고)
- [x] 뷰포트 영역: `#000` (순수 검정) + `#333` border
- [x] box-shadow로 깊이감 추가

**버그 수정**
- [x] 툴바 도구 선택 시 기존 바인딩 유실 문제 수정
  - 원인: setToolActive가 바인딩을 대체함
  - 해결: getDefaultBindings() + Primary 바인딩 추가 방식

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/react/` | 신규 패키지 생성 |
| `packages/react/src/types.ts` | 공통 타입 정의 |
| `packages/react/src/components/building-blocks/` | Building Blocks 컴포넌트 |
| `packages/react/src/components/SingleDicomViewer.tsx` | 조합형 뷰어 |
| `apps/demo/src/App.tsx` | SingleDicomViewer 테스트 추가 |

### 학습 포인트
- React Building Blocks 패턴: 작은 컴포넌트 조합으로 유연성 확보
- forwardRef + useImperativeHandle: 외부 제어 API 노출
- Tool System 바인딩: 기본 바인딩 유지하면서 추가 바인딩 적용
- OHIF UI 디자인: 의료 영상 뷰어 표준 색상 체계

### 다음 세션 할 일
- [ ] MultiDicomViewer 구현 (Building Blocks 기반)
- [ ] Phase 3 (Annotations) 설계 검토

---

## 2026-01-19 세션 #16 (LRU Texture Cache 구현)

### 작업 내용

**TextureLRUCache 구현**
- [x] `packages/core/src/cache/TextureLRUCache.ts` 생성
  - VRAM 기반 LRU 캐시 (바이트 단위 추적)
  - `calculateVRAMSize()`: width × height × frameCount × 4 (RGBA8)
  - `clearWithoutDispose()`: Context 복구용 (무효화된 텍스처 dispose 스킵)
  - NaN 방어 로직 추가

**HybridMultiViewport 통합**
- [x] `textureCacheRef` 도입 (기존 Map 대체)
- [x] VRAM 사용량 UI 표시 (`stats.vramMB`)
- [x] Context 복구 시 `clearWithoutDispose()` 사용
- [x] DicomImageInfo의 `rows`/`columns` 사용 (width/height 아님)

**대형 레이아웃 추가**
- [x] 5x5, 6x6, 7x7, 8x8 레이아웃 타입 추가
- [x] `getLayoutDimensions()` 함수 확장
- [x] `getMaxSelect()` 함수 확장 (인스턴스 선택 개수)

**버그 수정**
- [x] NaN VRAM 표시 → `rows`/`columns` 사용으로 해결
- [x] 4x4 검은 화면 → LRU eviction이 visible 뷰포트 해제 → eviction 비활성화

### 설계 결정

**LRU Eviction 비활성화**
- 현재 시나리오: 모든 뷰포트가 화면에 표시됨
- 문제: eviction 발생 시 visible 뷰포트가 검은 화면으로 변함
- 해결: `maxVRAMBytes: Number.MAX_SAFE_INTEGER` (사실상 무제한)
- 향후: "visible viewport" 인식 기능 추가하여 선택적 eviction

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/core/src/cache/TextureLRUCache.ts` | 신규 생성 |
| `packages/core/src/cache/index.ts` | export 추가 |
| `packages/core/src/index.ts` | export 추가 |
| `packages/core/src/viewport/types.ts` | 5x5~8x8 레이아웃 추가 |
| `apps/demo/.../HybridMultiViewport.tsx` | TextureLRUCache 통합 |
| `apps/demo/src/App.tsx` | 레이아웃/인스턴스 선택 확장 |

### 학습 포인트
- VRAM 관리: 개수 기반 vs 바이트 기반 LRU
- DicomImageInfo: `width`/`height` 아닌 `rows`/`columns` 사용
- Context Loss 복구: 무효화된 텍스처에 dispose() 호출 금지
- LRU 설계: "로드된 시리즈 > 표시 뷰포트" 시나리오 vs "모든 뷰포트 표시" 시나리오

### 다음 세션 할 일
- [ ] Phase 3 (Annotations) 설계 검토
- [ ] 좌표 변환 시스템 (이미지 좌표 ↔ 캔버스 좌표)

---

## 2026-01-19 세션 #15 (문서 정비)

### 작업 내용
- [x] 프로젝트 전체 분석
- [x] status.md 갱신 (간결하게 정리)
- [x] session-log.md 정리 (오래된 세션 아카이브)
- [x] architecture/overview.md 갱신
- [x] implementation-phases.md 갱신

### 다음 세션 할 일
- [ ] 16개 뷰포트 성능 테스트
- [ ] npm 배포 준비

---

## 2026-01-18 세션 #14 (Multi Canvas 기능 고도화)

### 작업 내용

**무한 루프 버그 수정**
- [x] Maximum update depth exceeded 에러 해결
  - 원인: `instanceId` 객체가 매 렌더링마다 새 참조 발생
  - 해결: useEffect 의존성에 개별 UID 문자열 사용

**전역 제어 및 동기화 기능**
- [x] DicomViewportHandle 인터페이스 정의 (useImperativeHandle)
- [x] 전역 제어 패널 구현 (전체 재생/정지, FPS 조절, 처음으로)
- [x] 프레임 동기화 모드 구현 (none, frame-ratio, absolute)
- [x] 연속 동기화 (재생 중 setInterval로 지속 동기화)

**뷰포트 확장**
- [x] Multi Canvas 뷰포트 개수 확장 (4개 → 10개)
- [x] 동적 그리드 계산 (뷰포트 수에 따라 2~4열)

**WebGL 컨텍스트 제한 발견**
- [x] 브라우저별 WebGL 컨텍스트 제한 (8-16개) 발견
- [x] Multi Canvas 방식 실질적 한계: ~8개 뷰포트
- [x] **Single Canvas 방식의 중요성 재확인**

### 학습 포인트
- React 의존성 배열과 객체 참조 문제
- useImperativeHandle + forwardRef 패턴
- 브라우저 WebGL 컨텍스트 제한

---

## 2026-01-18 세션 #13 (Phase 2 핵심 구현!)

### 작업 내용

**Phase 2a: 2D Array Texture**
- [x] TextureManager에 배열 텍스처 API 추가
  - `initializeArrayTexture()`: texStorage3D로 불변 할당
  - `uploadFrame()`: texSubImage3D로 특정 레이어 업로드
  - `uploadAllFrames()`: 모든 프레임 일괄 업로드
- [x] sampler2DArray 셰이더 추가
- [x] ArrayTextureRenderer 클래스 구현

**Phase 2b: Single Canvas + ViewportManager**
- [x] Viewport 인터페이스 및 타입 정의
- [x] ViewportManager 클래스 구현 (레이아웃 관리, Scissor 기반)

**Phase 2c: RenderScheduler + FrameSyncEngine**
- [x] 단일 rAF 루프로 모든 뷰포트 렌더링
- [x] Frame Ratio 기반 프레임 동기화

**Phase 2d: React 통합**
- [x] MultiViewport 컴포넌트 구현

### 학습 포인트
- TEXTURE_2D_ARRAY: 레이어 인덱스로 프레임 전환
- gl.scissor() + gl.viewport(): Canvas 내 영역 제한
- 프레임 비율 동기화: masterFrame/masterTotal * slaveTotal

---

## 2026-01-18 세션 #12 (Phase 1e 완료! Phase 1 완료!)

### 작업 내용

**렌더링 에러 처리 강화**
- [x] `renderError` 상태 추가
- [x] 에러 오버레이 UI 구현 (재시도 버튼)

**DPI (devicePixelRatio) 대응**
- [x] Retina 디스플레이 선명 렌더링
- [x] DPR 최대 2로 제한 (성능 고려)
- [x] `matchMedia`로 DPR 변경 감지

**반응형 Canvas 옵션**
- [x] `responsive` prop (컨테이너 크기 자동 조정)
- [x] `maintainAspectRatio` prop (종횡비 유지)
- [x] ResizeObserver + 디바운싱

### 학습 포인트
- Canvas width/height vs style.width/height 차이
- gl.viewport()와 드로잉 버퍼 크기 관계
- ResizeObserver vs window resize 이벤트

---

> **이전 세션 기록**: [archive/session-log-2026-01-early.md](./archive/session-log-2026-01-early.md)
