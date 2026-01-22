# 트러블슈팅 가이드

> **목적**: EchoPixel 개발 중 발생할 수 있는 주요 문제와 해결 방법을 정리합니다.

---

## 목차

1. [WebGL 관련 문제](#1-webgl-관련-문제)
2. [React 관련 문제](#2-react-관련-문제)
3. [DICOM 파싱 문제](#3-dicom-파싱-문제)
4. [성능 문제](#4-성능-문제)
5. [디버깅 전략](#5-디버깅-전략)

---

## 1. WebGL 관련 문제

### 1.1 React Strict Mode에서 Canvas 검은 화면 ⭐ Critical

#### 증상

- DICOM 데이터 로드 후 Canvas가 **완전히 검은색**으로 표시
- 재생 버튼을 눌러도 프레임이 변경되지 않음
- **HMR 클릭 시 즉시 정상 표시** (핵심 힌트!)

#### 재현 조건

```
1. React 18 + StrictMode 활성화 (개발 모드)
2. 브라우저 새로고침
3. DICOM 로드 → 검은 화면
```

#### 근본 원인

React 18 Strict Mode는 개발 모드에서 Effect를 **2번 실행**합니다:

```
mount → useEffect 실행 → cleanup 실행 → 재마운트 → useEffect 재실행
```

문제는 cleanup에서 `loseContext()`를 호출할 때 발생합니다:

```typescript
// ❌ 잘못된 패턴
return () => {
  const loseContext = gl.getExtension('WEBGL_lose_context');
  loseContext.loseContext();  // 동기적으로 컨텍스트 무효화
  // → 하지만 복구는 비동기적! (webglcontextrestored 이벤트)
  // → 2차 마운트 시 컨텍스트가 아직 lost 상태
};
```

**타이밍 문제**:

```
[1차 마운트] Context 생성 (정상)
     ↓
[cleanup] loseContext() → Context 즉시 무효화! ⚠️
     ↓
[2차 마운트] getContext() → 같은 Canvas면 lost 상태의 Context 반환
     ↓
gl.isContextLost() === true → 초기화 실패
     ↓
[비동기 복구] webglcontextrestored 이벤트 (이미 늦음)
```

#### 해결 방법

```typescript
// ✅ 올바른 패턴: cleanup에서 loseContext() 호출하지 않음
return () => {
  // 이벤트 리스너 제거
  canvas.removeEventListener('webglcontextlost', handleContextLost);
  canvas.removeEventListener('webglcontextrestored', handleContextRestored);
  resizeObserver.disconnect();

  // WebGL 리소스 정리 (TextureManager, QuadRenderer)
  textureManagerRef.current?.dispose();
  quadRendererRef.current?.dispose();

  // 주의: loseContext()를 호출하면 안 됨!
  // ref만 정리하고, 새 Canvas에서 새 컨텍스트를 요청하도록 함

  glRef.current = null;
  textureManagerRef.current = null;
  quadRendererRef.current = null;
  setWebglReady(false);
};
```

#### 왜 동작하는가?

1. `glRef.current = null`로 설정하면, 2차 마운트에서 새 컨텍스트 요청
2. 같은 Canvas에서 `getContext('webgl2')`는 같은 **유효한** 컨텍스트 반환
3. 브라우저가 Canvas 제거 시 자동으로 컨텍스트 정리 (메모리 누수 없음)

#### 디버깅 힌트

| 힌트 | 의미 |
|------|------|
| HMR이 문제 해결 | 마운트/언마운트 사이클 문제 |
| `gl.canvas !== canvasRef.current` | Canvas 참조 불일치 |
| `gl.isContextLost() === true` | Context가 lost 상태 |

> **참고**: [상세 분석 문서](/docs/troubleshooting/react-strictmode-webgl-black-screen.md)

---

### 1.2 WebGL Context Lost

#### 증상

- 렌더링이 갑자기 멈춤
- Console에 `WebGL context lost` 경고
- GPU 메모리 부족 또는 드라이버 리셋 후 발생

#### 원인

| 원인 | 빈도 |
|------|------|
| GPU 드라이버 리셋 | 드물음 |
| GPU 메모리 부족 | 중간 |
| 백그라운드 탭 전환 | 드물음 |
| 시스템 절전 모드 | 드물음 |

#### 해결 방법

```typescript
// Context Lost/Restored 이벤트 처리
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();  // 기본 동작 방지
  setWebglReady(false);

  // 리소스 정리
  textureManager?.dispose();
  quadRenderer?.dispose();

  console.log('[WebGL] Context lost, waiting for restore...');
});

canvas.addEventListener('webglcontextrestored', () => {
  console.log('[WebGL] Context restored, reinitializing...');

  // WebGL 리소스 재초기화
  initializeWebGL();

  // 캐시된 프레임 재업로드
  reuploadTextures();

  setWebglReady(true);
});
```

#### 복구 전략 (Hybrid)

```
Context Lost 발생
     ↓
[1순위] Compressed Cache 확인 (메모리)
     ↓ 없으면
[2순위] IndexedDB 캐시 확인
     ↓ 없으면
[3순위] 서버에서 재요청
```

---

### 1.3 텍스처 업로드 실패

#### 증상

- 이미지가 표시되지 않거나 깨짐
- `gl.getError()`가 `GL_INVALID_OPERATION` 반환

#### 원인 및 해결

| 원인 | 해결 |
|------|------|
| VideoFrame 지원 안 됨 | ImageBitmap 폴백 |
| 텍스처 크기 제한 초과 | `gl.MAX_TEXTURE_SIZE` 확인 후 리사이즈 |
| Context Lost 상태 | Context 복구 후 재시도 |

```typescript
// 폴백 체인
async function uploadToTexture(source: VideoFrame | ImageBitmap) {
  // 1차: VideoFrame 직접 업로드
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (gl.getError() === gl.NO_ERROR) return true;
  } catch { /* 폴백 */ }

  // 2차: ImageBitmap 변환
  if (source instanceof VideoFrame) {
    const bitmap = await createImageBitmap(source);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    bitmap.close();
    return true;
  }

  return false;
}
```

---

## 2. React 관련 문제

### 2.1 무한 리렌더링

#### 증상

- 브라우저가 멈추거나 매우 느려짐
- Console에 "Maximum update depth exceeded" 경고

#### 원인

```typescript
// ❌ 잘못된 패턴: useEffect 의존성에 객체 직접 포함
useEffect(() => {
  renderFrame(currentFrame);
}, [windowLevel]);  // windowLevel이 객체면 매번 새 참조
```

#### 해결

```typescript
// ✅ 올바른 패턴 1: 원시값만 의존성에 포함
useEffect(() => {
  renderFrame(currentFrame);
}, [windowLevel.center, windowLevel.width]);

// ✅ 올바른 패턴 2: useMemo로 객체 안정화
const stableWindowLevel = useMemo(
  () => ({ center: wc, width: ww }),
  [wc, ww]
);
```

### 2.2 Cine 재생 시 React 리렌더링 폭발

#### 증상

```
4개 뷰포트 × 30fps = 초당 120회 React 리렌더링
→ UI 응답성 저하, 프레임 드롭
```

#### 해결: 2단계 최적화

**Phase 1: Zustand 셀렉터 분할**

```typescript
// ❌ 전체 객체 구독
const slot = useViewerStore((s) => s.slots[slotId]);

// ✅ 필요한 필드만 구독
const currentFrame = useViewerStore((s) => s.slots[slotId].currentFrame);
const isPlaying = useViewerStore((s) => s.slots[slotId].isPlaying);
```

**Phase 2: React 우회 렌더링**

```typescript
// 재생 중에는 React 상태 업데이트 없이 직접 렌더링
class CineAnimationManager {
  private viewportRef: DicomCanvasHandle;

  tick(timestamp: number) {
    if (this.shouldAdvanceFrame(timestamp)) {
      this.currentFrame = (this.currentFrame + 1) % this.totalFrames;

      // React 우회: 직접 캔버스 렌더링
      this.viewportRef.renderFrame(this.currentFrame);
    }

    this.animationId = requestAnimationFrame(this.tick);
  }
}
```

### 2.3 메모리 누수 (useEffect cleanup)

#### 증상

- 시간이 지날수록 메모리 사용량 증가
- 컴포넌트 언마운트 후에도 이벤트 발생

#### 체크리스트

```typescript
useEffect(() => {
  // 구독, 타이머, 이벤트 리스너 설정
  const subscription = observable.subscribe(handler);
  const timerId = setInterval(tick, 1000);
  window.addEventListener('resize', handleResize);

  return () => {
    // ✅ 반드시 정리
    subscription.unsubscribe();
    clearInterval(timerId);
    window.removeEventListener('resize', handleResize);
  };
}, []);
```

---

## 3. DICOM 파싱 문제

### 3.1 DICOM 파일 인식 실패

#### 증상

- `isDicomFile()` false 반환
- "Not a valid DICOM file" 에러

#### 원인 및 해결

| 원인 | 해결 |
|------|------|
| DICM 매직넘버 없음 | 128바이트 오프셋 확인 |
| Part 10 미준수 파일 | 레거시 파서 사용 (미구현) |
| 파일 손상 | 파일 재다운로드 |

```typescript
function isDicomFile(buffer: ArrayBuffer): boolean {
  const view = new Uint8Array(buffer);

  // DICM 매직넘버는 128바이트 이후에 위치
  if (buffer.byteLength < 132) return false;

  return (
    view[128] === 0x44 &&  // 'D'
    view[129] === 0x49 &&  // 'I'
    view[130] === 0x43 &&  // 'C'
    view[131] === 0x4D     // 'M'
  );
}
```

### 3.2 Transfer Syntax 미지원

#### 증상

- 픽셀 데이터 디코딩 실패
- 이미지 깨짐 또는 표시 안 됨

#### 지원 현황

| Transfer Syntax | UID | 상태 |
|-----------------|-----|------|
| Implicit VR LE | 1.2.840.10008.1.2 | ✅ 지원 |
| Explicit VR LE | 1.2.840.10008.1.2.1 | ✅ 지원 |
| JPEG Baseline | 1.2.840.10008.1.2.4.50 | ✅ 지원 |
| JPEG Lossless | 1.2.840.10008.1.2.4.70 | ⏳ Phase 5 |
| JPEG-LS | 1.2.840.10008.1.2.4.80 | ⏳ Phase 5 |
| JPEG 2000 | 1.2.840.10008.1.2.4.90 | ⏳ Phase 5 |

### 3.3 멀티프레임 프레임 수 불일치

#### 증상

- 예상보다 적은 프레임 추출
- 일부 프레임 누락

#### 디버깅

```typescript
// 프레임 수 확인
const numberOfFrames = dataset.elements.get('00280008')?.value;  // Number of Frames
const extractedFrames = pixelData.frames.length;

console.log(`Expected: ${numberOfFrames}, Extracted: ${extractedFrames}`);

// Encapsulated 데이터 구조 확인
// Basic Offset Table이 비어있으면 Fragment 경계 추정 필요
```

---

## 4. 성능 문제

### 4.1 프레임 드롭

#### 증상

- FPS가 목표치(30fps) 미달
- 재생이 끊기거나 버벅임

#### 진단

```typescript
// 프레임 타이밍 측정
let lastTime = performance.now();
let frameCount = 0;

function animate(timestamp: number) {
  frameCount++;

  if (timestamp - lastTime >= 1000) {
    const fps = frameCount;
    console.log(`FPS: ${fps}`);

    if (fps < 25) {
      console.warn('Frame drop detected!');
    }

    frameCount = 0;
    lastTime = timestamp;
  }

  requestAnimationFrame(animate);
}
```

#### 원인별 해결

| 원인 | 해결 |
|------|------|
| 디코딩 병목 | Web Worker로 오프로드 |
| 텍스처 업로드 병목 | 프리페칭, 배열 텍스처 |
| React 리렌더링 | 셀렉터 최적화, React 우회 |
| GPU 메모리 부족 | LRU 캐시 크기 조정 |

### 4.2 메모리 사용량 과다

#### 측정

```typescript
// Chrome에서만 동작
if (performance.memory) {
  console.log(`Used: ${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Total: ${(performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1)} MB`);
}
```

#### 해결

- **VideoFrame**: 반드시 `close()` 호출
- **ImageBitmap**: 명시적 `close()` 권장
- **LRU Cache**: 적절한 크기 제한 설정
- **텍스처**: 화면 밖 뷰포트는 텍스처 해제

### 4.3 첫 재생 시 이미지 깨짐

#### 증상

- 재생 시작 후 첫 1-2초간 이미지가 깨지거나 검게 표시
- 이후 정상 표시

#### 원인

GPU 텍스처가 아직 생성되지 않은 상태에서 렌더링 시도

#### 해결: GPU 텍스처 워밍업

```typescript
async function warmupGpuTextures(frames: Uint8Array[]) {
  console.log('[Warmup] Starting GPU texture warmup...');

  for (let i = 0; i < frames.length; i++) {
    // 각 프레임을 한 번씩 렌더링하여 텍스처 생성
    await canvasRef.current?.renderFrame(i);
  }

  // 원래 프레임으로 복귀
  await canvasRef.current?.renderFrame(0);

  console.log('[Warmup] GPU texture warmup complete');
}
```

---

## 5. 디버깅 전략

### 5.1 WebGL 디버깅

```typescript
// WebGL 에러 체크
function checkGLError(gl: WebGL2RenderingContext, operation: string) {
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    const errorMap: Record<number, string> = {
      [gl.INVALID_ENUM]: 'INVALID_ENUM',
      [gl.INVALID_VALUE]: 'INVALID_VALUE',
      [gl.INVALID_OPERATION]: 'INVALID_OPERATION',
      [gl.OUT_OF_MEMORY]: 'OUT_OF_MEMORY',
    };
    console.error(`[WebGL] ${operation}: ${errorMap[error] || error}`);
  }
}

// 사용
gl.bindTexture(gl.TEXTURE_2D, texture);
checkGLError(gl, 'bindTexture');
```

### 5.2 Canvas 참조 검증

```typescript
// WebGL과 React의 Canvas 참조가 일치하는지 확인
function verifyCanvasReference(gl: WebGL2RenderingContext, canvasRef: HTMLCanvasElement) {
  const glCanvas = gl.canvas as HTMLCanvasElement;

  console.log('[Debug] Canvas reference check:', {
    isSameCanvas: glCanvas === canvasRef,
    glCanvasInDOM: document.body.contains(glCanvas),
    refCanvasInDOM: document.body.contains(canvasRef),
    glCanvasSize: `${glCanvas.width}x${glCanvas.height}`,
    refCanvasSize: `${canvasRef.width}x${canvasRef.height}`,
  });
}
```

### 5.3 DICOM 데이터 검증

```typescript
// 파싱된 DICOM 데이터 검증
function validateDicomData(imageInfo: DicomImageInfo, frames: Uint8Array[]) {
  console.log('[Validate] DICOM data:', {
    dimensions: `${imageInfo.columns}x${imageInfo.rows}`,
    bitsAllocated: imageInfo.bitsAllocated,
    samplesPerPixel: imageInfo.samplesPerPixel,
    frameCount: frames.length,
    firstFrameSize: frames[0]?.length,
  });

  // 예상 프레임 크기 계산 (비압축 시)
  const expectedSize = imageInfo.columns * imageInfo.rows *
                       (imageInfo.bitsAllocated / 8) *
                       imageInfo.samplesPerPixel;

  if (!imageInfo.isEncapsulated && frames[0]?.length !== expectedSize) {
    console.warn(`[Validate] Frame size mismatch: expected ${expectedSize}, got ${frames[0]?.length}`);
  }
}
```

### 5.4 성능 프로파일링

```typescript
// 파이프라인 단계별 시간 측정
async function profileRenderPipeline(frameIndex: number) {
  const metrics: Record<string, number> = {};

  let start = performance.now();
  const decoded = await decodeFrame(frames[frameIndex]);
  metrics.decode = performance.now() - start;

  start = performance.now();
  textureManager.upload(decoded.image);
  metrics.upload = performance.now() - start;

  start = performance.now();
  quadRenderer.render(0, windowLevel);
  metrics.render = performance.now() - start;

  closeDecodedFrame(decoded);

  console.table(metrics);
  return metrics;
}
```

---

## 관련 문서

- [렌더링 파이프라인](./rendering-pipeline.md)
- [Core 기반 기술](./core-technologies.md)
- [메모리 관리](./memory-management.md)
- [상세 트러블슈팅 기록](/docs/troubleshooting/)
