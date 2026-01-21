# Session Log

세션별 작업 기록입니다. 최신 세션이 위에 표시됩니다.

> **아카이브**: 오래된 세션은 [archive/](./archive/) 폴더에 있습니다.

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

### 다음 세션 할 일

- [ ] 어노테이션 선택/편집 UI (DragHandle 통합)
- [ ] 포인트 드래그 편집
- [ ] 라벨 위치 이동

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

### 다음 세션 할 일

- [ ] 어노테이션 선택/편집 UI (DragHandle 통합)
- [ ] 포인트 드래그 편집
- [ ] 라벨 위치 이동

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

### 다음 세션 할 일

- [ ] 어노테이션 선택/편집 UI (DragHandle 통합)
- [ ] 포인트 드래그 편집
- [ ] 라벨 위치 이동

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

### 다음 세션 할 일

- [ ] 어노테이션 선택/편집 UI (DragHandle 통합)
- [ ] 포인트 드래그 편집
- [ ] 라벨 위치 이동

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

### 다음 세션 할 일

- [ ] 어노테이션 드래그 편집 완성 (DragHandle 통합)
- [ ] Delete 키 삭제 기능
- [ ] HybridMultiViewport 어노테이션 생성 기능

---

## 2026-01-20 세션 #23 (Phase 3g: Calibration 지원)

### 작업 내용

**DICOM Pixel Spacing 파싱**
- [x] `PixelSpacing` 인터페이스 추가 (rowSpacing, columnSpacing in mm)
- [x] `getPixelSpacing()` 함수 구현: DICOM 태그 (0028,0030) 파싱
- [x] `DicomImageInfo`에 `pixelSpacing?: PixelSpacing` 필드 추가

**Ultrasound Region Calibration 파싱** (심초음파용)
- [x] `UltrasoundCalibration` 인터페이스 추가 (physicalDeltaX/Y, physicalUnitsX/Y)
- [x] `ULTRASOUND_PHYSICAL_UNITS` 상수 추가 (CM=3, SECONDS=4, CM_PER_SEC=5)
- [x] `getUltrasoundCalibration()` 함수 구현: Sequence of Ultrasound Regions (0018,6011) 파싱
- [x] Physical Delta X/Y (0018,602C/602E) - FD 8바이트 double 파싱
- [x] Physical Units X/Y Direction (0018,6024/6026) - US 2바이트 파싱
- [x] Short form / Long form VR 인코딩 모두 지원
- [x] `DicomImageInfo`에 `ultrasoundCalibration` 필드 추가

**SingleDicomViewer Calibration 통합**
- [x] `transformContext` useMemo에서 `CalibrationData` 생성
- [x] Pixel Spacing (우선) → Ultrasound Region (대체) 순서로 Calibration 사용
- [x] mm → cm 변환 적용 (DICOM Pixel Spacing은 mm, CalibrationData는 cm 사용)
- [x] `TransformContext`에 `calibration`, `mode` 포함

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/core/src/dicom/DicomParser.ts` | PixelSpacing, UltrasoundCalibration 인터페이스, getPixelSpacing(), getUltrasoundCalibration() 함수 |
| `packages/core/src/dicom/index.ts` | getPixelSpacing, PixelSpacing, getUltrasoundCalibration, UltrasoundCalibration, ULTRASOUND_PHYSICAL_UNITS export |
| `packages/core/src/index.ts` | getUltrasoundCalibration, ULTRASOUND_PHYSICAL_UNITS, UltrasoundCalibration export |
| `packages/react/.../SingleDicomViewer.tsx` | CalibrationData 생성 (pixelSpacing 또는 ultrasoundCalibration 사용) |

### 커밋

```
bcc1f0a Add Pixel Spacing parsing and calibration support for measurements
d5a4a75 Add Ultrasound Region Calibration support for cardiac echo DICOM files
```

### 측정 흐름

```
1. DICOM 로드 → getImageInfo() → pixelSpacing (mm) 또는 ultrasoundCalibration (cm/pixel)
2. SingleDicomViewer → CalibrationData (cm) 생성
   - Pixel Spacing 있으면 → mm → cm 변환 (/10)
   - 없으면 Ultrasound Calibration → physicalDeltaX/Y 사용
3. TransformContext에 calibration 포함
4. MeasurementTool.activate() → ToolContext 전달
5. LengthTool.calculateMeasurement() → CoordinateTransformer.calculateDistance()
6. 결과: "1.23 cm" 또는 "8.5 mm" (1cm 미만일 때 자동 mm 변환)
```

### 학습 포인트

- **DICOM Pixel Spacing**: 태그 (0028,0030), 형식 "row\\column", 단위 mm
- **DICOM Ultrasound Region Calibration**:
  - Sequence of Ultrasound Regions (0018,6011)
  - Physical Delta X/Y (0018,602C/602E) - FD (8바이트 double), cm/pixel
  - Physical Units (0018,6024/6026) - US (2바이트), 3=cm, 4=sec, 5=cm/s
- **VR 인코딩**: FD는 보통 long form이지만 시퀀스 내부에서는 short form일 수 있음
  - Short form: Tag(4) + VR(2) + Length(2) + Value
  - Long form: Tag(4) + VR(2) + Reserved(2) + Length(4) + Value
- **바이트 스캔 접근법**: 완전한 시퀀스 파싱 없이 태그 패턴을 직접 검색

**WADO-RS Calibration 지원**
- [x] `WadoRsDataSource.parseDicomJson()`에 Pixel Spacing, Ultrasound Calibration 파싱 추가
- [x] 문제: WADO-RS 서버가 Sequence 태그(0018,6011)를 메타데이터에 포함하지 않음
- [x] 해결: 데모 앱에서 calibration 없을 때 전체 DICOM 인스턴스 로드하여 추출

### 커밋

```
d5a4a75 Add Ultrasound Region Calibration support for cardiac echo DICOM files
bd8d17e Add Pixel Spacing and Ultrasound Calibration parsing to WadoRsDataSource
d2c1b47 Add fallback calibration extraction for WADO-RS in demo app
```

### 다음 세션 할 일

- [ ] 어노테이션 선택/편집 UI
- [ ] HybridMultiViewport 어노테이션 생성 기능
- [ ] Ellipse, VTI 도구 (선택적)

---

## 2026-01-20 세션 #22 (Phase 3f: 어노테이션 생성 UI 구현)

### 작업 내용

**DicomToolbar 어노테이션 도구 추가**
- [x] Length (📏 거리), Angle (∠ 각도), Point (● 점) 버튼 추가
- [x] `ANNOTATION_TOOL_IDS` 상수 export

**SingleDicomViewer MeasurementTool 통합**
- [x] `activeMeasurementToolId`, `tempAnnotation` state 추가
- [x] `measurementToolsRef`로 도구 인스턴스 관리 (렌더링마다 재생성 방지)
- [x] `handleToolbarToolChange` 수정: 조작 도구 vs 어노테이션 도구 분기
- [x] Canvas mousedown/mousemove 이벤트 → MeasurementTool에 전달
- [x] 컴포넌트 unmount 시 MeasurementTool deactivate (메모리 누수 방지)

**SVGOverlay 임시 어노테이션 렌더링**
- [x] `tempAnnotation`, `tempAnnotationType` props 추가
- [x] 점선 스타일 (`strokeDasharray: '5,5'`)로 미리보기 렌더링
- [x] 포인트 부족 시 점/선만 표시 (Length 1점, Angle 1-2점)

**Shape 컴포넌트 strokeDasharray 지원**
- [x] LengthShape, AngleShape, PointShape에 `strokeDasharray` 적용

**버그 수정**
- [x] Tool "Length"/"Angle" not found 경고 → `isPrevAnnotationTool` 체크 추가
- [x] Tool point does not support mode B → PointTool B/M-mode 지원 추가
- [x] Rotation/Flip 시 어노테이션 좌표 불일치 → CoordinateTransformer 수정

**CoordinateTransformer rotation/flip 좌표 변환**
- [x] `dicomToCanvas`: Flip → Scale → Rotation → Pan 순서 적용
- [x] `canvasToDicom`: Pan → Rotation역변환 → Scale역변환 → Flip역변환 순서 적용

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/react/.../DicomToolbar.tsx` | Length, Angle, Point 도구 추가, ANNOTATION_TOOL_IDS |
| `packages/react/.../SingleDicomViewer.tsx` | MeasurementTool 통합, 이벤트 처리, cleanup |
| `packages/react/.../SVGOverlay.tsx` | tempAnnotation 렌더링, 부분 포인트 미리보기 |
| `packages/core/.../CoordinateTransformer.ts` | rotation/flipH/flipV 좌표 변환 |
| `packages/core/.../renderers/types.ts` | SVGRenderConfig에 strokeDasharray 추가 |
| `packages/core/.../tools/PointTool.ts` | B/M-mode 마커 지원 |
| `packages/react/.../shapes/*.tsx` | strokeDasharray 지원 |
| `apps/demo/src/App.tsx` | 어노테이션 생성 콜백 연결 |

### 커밋

```
152b706 Implement Phase 3f: Annotation creation UI with MeasurementTool integration
```

### 테스트 결과

- ✅ Length 도구: 두 점 클릭 → 거리 측정 어노테이션 생성
- ✅ Angle 도구: 세 점 클릭 → 각도 측정 어노테이션 생성
- ✅ Point 도구: 한 점 클릭 → 마커 어노테이션 생성
- ✅ 임시 어노테이션: 점선 미리보기 정상 표시
- ✅ 우클릭: 드로잉 취소 동작
- ✅ 회전/플립 후 어노테이션: 이미지와 함께 회전/플립

### 학습 포인트

- **MeasurementTool 인스턴스 관리**: useRef로 렌더링 간 상태 유지
- **좌표 변환 순서**: 변환과 역변환의 순서가 정확히 반대여야 함
- **임시 어노테이션**: 확정 전 미리보기로 UX 향상
- **어노테이션 도구 vs 조작 도구**: ToolGroup에 등록된 도구만 setToolActive 호출

### 다음 세션 할 일

- [x] Calibration 지원 (px → mm/cm 변환) ✅ 세션 #23에서 완료
- [ ] 어노테이션 선택/편집 UI
- [ ] Ellipse, VTI 도구 (선택적)

---

## 2026-01-20 세션 #21 (Phase 3e: SingleDicomViewer 어노테이션 통합)

### 작업 내용

**SingleDicomViewer SVGOverlay 통합**
- [x] SVGOverlay 및 관련 타입 import 추가
- [x] annotation props 추가 (annotations, selectedAnnotationId, onAnnotationSelect 등)
- [x] TransformContext 생성 로직 (DICOM→Canvas 좌표 변환)
- [x] annotationHandlers useMemo 생성
- [x] SVGOverlay 렌더링 (캔버스 컨테이너 내부)

**데모 앱 테스트 어노테이션**
- [x] `singleTestAnnotations` useMemo 생성 (viewportData 기반)
- [x] Length (녹색, 52.3mm), Angle (노란색, 72.8°), Point (마젠타) 테스트 데이터
- [x] SingleDicomViewer에 `annotations` prop 전달
- [x] Multi 모드용 `testAnnotations` 유지 (이전 세션에서 구현)

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/react/src/components/SingleDicomViewer.tsx` | SVGOverlay import, annotation props, TransformContext, 렌더링 |
| `apps/demo/src/App.tsx` | singleTestAnnotations 생성, annotations prop 전달 |

### 커밋

```
bfbc981 Add SVGOverlay support to SingleDicomViewer with test annotations
```

### 테스트 결과

- ✅ Single Viewport (Local) 모드에서 SVG 어노테이션 렌더링 확인
- ✅ Length, Angle, Point 3가지 타입 모두 정상 표시
- ✅ 이미지 크기 비례 좌표 계산 정상 동작

### 학습 포인트

- TransformContext: viewport 정보 (imageWidth/Height, canvasWidth/Height, zoom, pan, rotation, flip)를 포함
- SVGOverlay는 position: absolute로 캔버스 위에 오버레이
- 어노테이션 좌표는 DICOM 픽셀 좌표로 저장, 렌더링 시 Canvas 좌표로 변환

### 다음 세션 할 일

- [ ] 어노테이션 인터랙션 테스트 (선택, 드래그)
- [ ] Pan/Zoom 시 어노테이션 좌표 변환 검증
- [ ] 어노테이션 생성 UI (도구 활성화 → 클릭으로 포인트 추가)

---

## 2026-01-20 세션 #20 (Multi 모드 리팩토링 + 사이즈 조정 + 플립 기능)

### 작업 내용

**데모 Multi 모드 리팩토링**
- [x] `@echopixel/react` `HybridMultiViewport` 컴포넌트 사용으로 전환
- [x] `handleMultiViewportLoad` 간소화 (~200줄 → ~70줄)
- [x] `toggleMultiPlay`, `handleFpsChange` ref 기반으로 변경
- [x] `multiSeriesMap` state로 시리즈 데이터 관리
- [x] 뷰포트 정보 그리드 `multiSeriesMap` 기반으로 업데이트

**Single Viewport 사이즈 조정 기능**
- [x] `singleViewportWidth`, `singleViewportHeight` state 추가
- [x] 사이즈 조정 UI (숫자 입력 + 프리셋 버튼: 512×384, 768×576, 1024×768)
- [x] 입력 검증: `onBlur`에서 범위 클램핑 (입력 중 자유 타이핑 허용)

**SingleDicomViewer 반응형 레이아웃**
- [x] 외부 컨테이너에 `display: 'inline-block'` 추가 (내용물 크기에 맞춤)
- [x] `width`, `height` 변경 시 자동 재렌더링 (useEffect dependency 추가)

**플립 기능 (가로/세로 반전)**
- [x] `types.ts`: `TransformInfo`에 `flipH`, `flipV` 추가
- [x] `DicomCanvas.tsx`: CSS transform `scale(flipH ? -zoom : zoom, flipV ? -zoom : zoom)` 적용
- [x] `DicomToolbar.tsx`: 플립 버튼 추가 (⇆ 가로, ⇅ 세로) + 활성 상태 시각화
- [x] `DicomStatusBar.tsx`: 플립 상태 표시 (`Flip: H`, `Flip: V`, `Flip: HV`)
- [x] `SingleDicomViewer.tsx`: 플립 상태 관리, 토글 핸들러, 리셋 시 초기화

### 파일 변경

| 파일 | 변경 내용 |
|------|-----------|
| `apps/demo/src/App.tsx` | Multi 모드 리팩토링, 사이즈 조정 UI |
| `packages/react/src/types.ts` | `TransformInfo`에 `flipH`, `flipV` 추가 |
| `packages/react/src/components/SingleDicomViewer.tsx` | 반응형, 사이즈 재렌더링, 플립 상태/핸들러 |
| `packages/react/src/components/building-blocks/DicomCanvas.tsx` | 플립 props + CSS transform |
| `packages/react/src/components/building-blocks/DicomToolbar.tsx` | 플립 버튼 + 상태 시각화 |
| `packages/react/src/components/building-blocks/DicomStatusBar.tsx` | 플립 상태 표시 |

### 코드 변경 상세

**SingleDicomViewer.tsx**
```tsx
// 외부 컨테이너 반응형
style={{
  display: 'inline-block', // 추가됨
  background: '#0b1a42',
  ...
}}

// 사이즈 변경 시 재렌더링
useEffect(() => {
  if (webglReady && frames.length > 0) {
    canvasRef.current?.renderFrame(currentFrame);
  }
}, [windowCenter, windowWidth, currentFrame, webglReady, frames.length, width, height]); // width, height 추가
```

**DicomCanvas.tsx (플립 적용)**
```tsx
// CSS transform에 플립 적용 - zoom과 결합
transform: `translate(...) scale(${flipH ? -zoom : zoom}, ${flipV ? -zoom : zoom}) rotate(...)`
```

### 알려진 이슈 (미사용 코드)

리팩토링 후 더 이상 사용되지 않는 코드 (향후 정리 필요):
- `viewportManagerRef`, `syncEngineRef`, `textureManagersRef`, `arrayRendererRef`
- `initMultiViewport` 함수
- `HardwareInfoPanel` GPU 정보 미표시 (glRef null)

### 학습 포인트

- `onChange` vs `onBlur` 검증: 즉시 클램핑은 타이핑 방해 → blur 시점 검증이 UX 개선
- `display: inline-block`: 컨테이너가 내용물 크기에 맞게 축소
- Canvas 크기 변경 시 버퍼 초기화됨 → 명시적 재렌더링 필요
- CSS `scale(x, y)`: 음수 값으로 플립 구현 가능, zoom과 결합하여 `scale(-zoom, zoom)` 형태로 적용

### 다음 세션 할 일

- [ ] 미사용 코드 정리 (선택적)
- [ ] Phase 3 설계: 좌표 변환 시스템
- [ ] SVG 오버레이 기본 구조

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
