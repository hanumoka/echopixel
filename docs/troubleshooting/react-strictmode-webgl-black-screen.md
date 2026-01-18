# React Strict Mode에서 WebGL Canvas 검은 화면 문제

> **심각도**: Critical
> **발생일**: 2026-01-18
> **해결일**: 2026-01-18
> **관련 커밋**: `1498d59`

---

## 증상

### 문제 현상
- WADO-RS 모드에서 DICOM 데이터 로드 후 **Canvas가 완전히 검은색/빈 화면**으로 표시
- 재생 버튼을 눌러도 프레임이 변경되지 않거나 검은 화면 유지
- **HMR(Hot Module Replacement) 버튼 클릭 시 즉시 정상 표시** (핵심 힌트!)
- Local File 모드에서는 정상 동작

### 재현 조건
1. React 18 + StrictMode 활성화 (개발 모드)
2. 브라우저 새로고침 (F5 또는 Ctrl+R)
3. WADO-RS 모드로 DICOM 로드
4. 재생 시도 → 검은 화면

### 로그 패턴
```
[DicomViewport] Initializing WebGL... {hasExistingGl: false}
[DicomViewport] WebGL initialized successfully on canvas: {canvasInDOM: true, clientWidth: 512}
[DicomViewport] useEffect cleanup (React Strict Mode may re-mount)
[DicomViewport] Explicitly losing WebGL context        ← 문제의 원인!
[DicomViewport] Initializing WebGL... {hasExistingGl: false}
[DicomViewport] Context is lost, waiting for restore event...  ← 컨텍스트가 복구 안 됨
[DicomViewport] WebGL context lost
```

---

## 근본 원인

### 1. React 18 Strict Mode의 이중 마운트 동작

React 18의 Strict Mode는 **개발 모드에서만** 다음과 같이 동작합니다:

```
컴포넌트 마운트 → useEffect 실행 → cleanup 실행 → 컴포넌트 재마운트 → useEffect 재실행
```

이는 Effect의 cleanup 로직이 올바른지 검증하기 위한 의도적인 동작입니다.

### 2. `WEBGL_lose_context.loseContext()`의 비동기 복구

WebGL의 `loseContext()`는 **동기적으로** 컨텍스트를 무효화하지만, 복구는 **비동기적으로** `webglcontextrestored` 이벤트를 통해 발생합니다.

```javascript
// cleanup에서 호출
const loseContext = gl.getExtension('WEBGL_lose_context');
loseContext.loseContext();  // 즉시 컨텍스트 무효화

// 이후 브라우저가 비동기적으로 복구 이벤트 발생
// → 하지만 React Strict Mode의 빠른 재마운트에서는 복구 전에 다음 마운트 발생!
```

### 3. 문제의 타이밍

```
시간 →
─────────────────────────────────────────────────────────────────────
[1차 마운트]
  ├─ Canvas A 생성
  ├─ getContext('webgl2') → Context 생성 (정상)
  └─ webglReady = true

[cleanup] (React Strict Mode)
  ├─ loseContext() 호출 → Context 즉시 무효화! ⚠️
  └─ ref들 null로 설정

[2차 마운트] (cleanup 직후, 거의 동시)
  ├─ Canvas B 생성 (또는 같은 Canvas 재사용)
  ├─ getContext('webgl2') → 같은 Canvas면 같은 Context 반환
  │                         → 하지만 아직 lost 상태! ⚠️
  ├─ gl.isContextLost() === true
  └─ 초기화 실패, webglReady = false

[비동기 복구] (수 ms ~ 수십 ms 후)
  └─ webglcontextrestored 이벤트 발생
     → 하지만 이미 초기화 로직은 끝남, 이벤트 핸들러가 처리해야 함
     → 그런데 2차 마운트에서 이미 실패 상태로 끝남
```

### 4. 동일 Canvas에서 getContext()의 동작

MDN 문서에 따르면:
> "If the contextType matches a possible drawing context, but one that was created with a different contextType, then the method returns null."

하지만 **같은 contextType**을 요청하면 **기존 컨텍스트를 반환**합니다. 즉, lost 상태의 컨텍스트가 그대로 반환됩니다.

---

## 디버깅 과정

### 1단계: HMR 힌트 분석

**관찰**: HMR 버튼 클릭 시 정상 동작
**가설**: 컴포넌트 완전 리마운트가 문제를 해결

HMR 시뮬레이션 버튼 추가:
```tsx
const [viewportKey, setViewportKey] = useState(0);
<DicomViewport key={viewportKey} ... />
<button onClick={() => setViewportKey(prev => prev + 1)}>Force Remount</button>
```

### 2단계: Canvas 참조 검증

**가설**: WebGL이 DOM에 없는 Canvas에 렌더링 중

디버깅 코드 추가:
```typescript
const glCanvas = gl.canvas as HTMLCanvasElement;
const refCanvas = canvasRef.current;
const isSameCanvas = glCanvas === refCanvas;
console.log('[WebGL DEBUG] Canvas reference check:', {
  isSameCanvas,
  glCanvasInDOM: document.body.contains(glCanvas),
  refCanvasInDOM: document.body.contains(refCanvas),
});
```

**결과**:
- 검은 화면 시: `isSameCanvas: false, glCanvasInDOM: false`
- HMR 후: `isSameCanvas: true, glCanvasInDOM: true`

### 3단계: Context Lost 상태 확인

로그에서 발견:
```
[DicomViewport] Context is lost, waiting for restore event...
```

`gl.isContextLost() === true` 상태에서 초기화가 스킵되고 있었음.

### 4단계: loseContext() 호출 추적

cleanup에서 `loseContext()` 호출 로그 확인:
```
[DicomViewport] Explicitly losing WebGL context
```

이 호출이 문제의 직접적인 원인임을 확인.

---

## 시도했으나 실패한 해결책

### 1. ResizeObserver로 Canvas 레이아웃 대기
```typescript
const resizeObserver = new ResizeObserver((entries) => {
  if (width > 0 && height > 0 && webglInitialized) {
    setWebglReady(true);
  }
});
```
**결과**: 실패 - Canvas 크기와 무관하게 Context가 lost 상태

### 2. Canvas 변경 감지 후 재초기화 (initializeWebGL 내부)
```typescript
if (glRef.current && glRef.current.canvas !== canvas) {
  // 재초기화
}
```
**결과**: 실패 - 검사 시점에 ref가 이미 null이거나, 같은 Canvas에서 lost 컨텍스트 반환

### 3. renderFrame()에서 Canvas 불일치 감지
```typescript
if (gl && currentCanvas && gl.canvas !== currentCanvas) {
  // 재초기화
}
```
**결과**: 부분 성공 - 백업 로직으로 유용하나, 근본 해결책 아님

---

## 최종 해결책

### cleanup에서 `loseContext()` 제거

**변경 전** (문제 코드):
```typescript
return () => {
  // ... 리소스 정리

  // 이 코드가 문제!
  if (glRef.current) {
    const loseContext = glRef.current.getExtension('WEBGL_lose_context');
    if (loseContext) {
      loseContext.loseContext();  // ← 제거해야 함
    }
  }

  glRef.current = null;
  // ...
};
```

**변경 후** (해결 코드):
```typescript
return () => {
  console.log('[DicomViewport] useEffect cleanup (React Strict Mode may re-mount)');
  canvas.removeEventListener('webglcontextlost', handleContextLost);
  canvas.removeEventListener('webglcontextrestored', handleContextRestored);
  resizeObserver.disconnect();

  // WebGL 리소스 정리 (TextureManager, QuadRenderer)
  textureManagerRef.current?.dispose();
  quadRendererRef.current?.dispose();

  // 주의: loseContext()를 호출하면 안 됨!
  // loseContext()는 비동기적으로 복구되므로, React Strict Mode의 빠른
  // mount-unmount-mount 사이클에서 두 번째 마운트 시 컨텍스트가 아직 lost 상태일 수 있음.
  // 대신 ref만 정리하고, 새 Canvas에서 새 컨텍스트를 요청하도록 함.

  glRef.current = null;
  textureManagerRef.current = null;
  quadRendererRef.current = null;
  setWebglReady(false);

  // 애니메이션 정리
  if (animationRef.current) {
    cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }
};
```

### 왜 이 해결책이 동작하는가?

1. **ref만 정리**: `glRef.current = null`로 설정하면, 2차 마운트에서 `hasExistingGl: false`로 판단되어 새 컨텍스트 요청
2. **Canvas 재사용 시 같은 컨텍스트 반환**: 같은 Canvas에서 `getContext('webgl2')`를 다시 호출하면 같은 (유효한) 컨텍스트가 반환됨
3. **loseContext() 없이도 메모리 누수 없음**: 브라우저가 Canvas 제거 시 자동으로 컨텍스트 정리

---

## 핵심 학습 포인트

### 1. React Strict Mode Effect 동작 이해
- 개발 모드에서 Effect가 2번 실행됨 (mount → cleanup → mount)
- cleanup이 정말 "clean"한지 검증하는 목적
- **cleanup 후 즉시 재마운트**되므로 비동기 작업 주의

### 2. WebGL Context Lifecycle
- `loseContext()`: 동기적 무효화, 비동기적 복구
- 같은 Canvas에서 `getContext()`는 같은 컨텍스트 반환
- Context lost 상태에서는 모든 WebGL 작업 실패

### 3. cleanup에서 피해야 할 패턴
```typescript
// ❌ 잘못된 패턴: 비동기 복구가 필요한 리소스 해제
loseContext.loseContext();

// ✅ 올바른 패턴: ref만 정리, 리소스는 브라우저가 관리
glRef.current = null;
```

### 4. 디버깅 전략
- **HMR이 문제를 해결**한다면 → 마운트/언마운트 사이클 문제
- **Canvas 참조 일치 확인**: `gl.canvas === canvasRef.current`
- **Context 상태 확인**: `gl.isContextLost()`

---

## 참고 자료

### 공식 문서
- [React 18 StrictMode](https://react.dev/reference/react/StrictMode)
- [Adding Reusable State to StrictMode - React 18 WG](https://github.com/reactwg/react-18/discussions/19)
- [MDN: HTMLCanvasElement.getContext()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext)

### 관련 이슈
- [react-three-fiber: Too many active WebGL contexts on Safari](https://github.com/pmndrs/react-three-fiber/discussions/2457)
- [React Issue #26315: useRef cleanup in StrictMode](https://github.com/facebook/react/issues/26315)

### 핵심 인용
> "It is not a good idea to mount and unmount [WebGL contexts] between route changes. Instead you should keep one instance and unmount canvas contents."
> — react-three-fiber maintainers

---

## 관련 파일

- `apps/demo/src/components/DicomViewport.tsx` - WebGL 초기화 및 cleanup 로직
- `apps/demo/src/App.tsx` - HMR 시뮬레이션 버튼

---

## 태그

`#WebGL` `#React` `#StrictMode` `#Canvas` `#ContextLost` `#Critical`
