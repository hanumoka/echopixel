# Session Log

세션별 작업 기록입니다. 최신 세션이 위에 표시됩니다.

> **아카이브**: 오래된 세션은 [archive/](./archive/) 폴더에 있습니다.

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
