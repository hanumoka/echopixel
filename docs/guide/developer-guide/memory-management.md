# 메모리 관리

> **대상 독자**: 웹 개발 경험이 있지만 GPU 프로그래밍이 처음인 주니어 개발자
> **목표**: EchoPixel의 GPU 메모리 전략, 누수 방지, Context Loss 복구 이해

---

## 목차

1. [왜 메모리 관리가 중요한가?](#1-왜-메모리-관리가-중요한가)
2. [CPU vs GPU 메모리](#2-cpu-vs-gpu-메모리)
3. [Upload & Release 패턴](#3-upload--release-패턴)
4. [GPU 텍스처 메모리 계산](#4-gpu-텍스처-메모리-계산)
5. [VideoFrame 생명주기](#5-videoframe-생명주기)
6. [WebGL Context Loss 복구](#6-webgl-context-loss-복구)
7. [LRU 캐시 전략](#7-lru-캐시-전략)
8. [흔한 메모리 문제](#8-흔한-메모리-문제)
9. [메모리 모니터링](#9-메모리-모니터링)
10. [학습 포인트 정리](#10-학습-포인트-정리)

---

## 1. 왜 메모리 관리가 중요한가?

### 문제 상황

의료 영상 뷰어는 **대용량 데이터**를 다룹니다:

```
일반적인 심초음파 검사:
┌──────────────────────────────────────────────────────────┐
│  시리즈 1개:                                              │
│  • 해상도: 800 × 600 픽셀                                 │
│  • 프레임 수: 60~120 프레임 (1~2초 심장 주기)              │
│  • 픽셀당 크기: 4 bytes (RGBA)                            │
│                                                          │
│  계산: 800 × 600 × 4 × 100 = 192 MB (시리즈 1개!)        │
│                                                          │
│  스트레스 에코 (16개 시리즈):                             │
│  192 MB × 16 = 3.07 GB ← 일반 GPU 메모리 초과!           │
└──────────────────────────────────────────────────────────┘
```

### Cornerstone3D의 문제점

기존 라이브러리인 Cornerstone3D는 **3중 메모리 저장**을 합니다:

```
┌─────────────────────────────────────────────────────────────┐
│                Cornerstone3D 메모리 구조                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. CPU Image Cache (~300MB)                                │
│     └─ 원본 픽셀 데이터 보관                                │
│              ↓                                              │
│  2. vtk.js 복사본 (~300MB)                                  │
│     └─ 렌더링 라이브러리가 자체 복사                         │
│              ↓                                              │
│  3. GPU Texture (~300MB)                                    │
│     └─ 실제 화면에 그려지는 데이터                          │
│                                                             │
│  동일한 데이터가 3곳에! → ~900MB 사용 (4개 파일 기준)        │
└─────────────────────────────────────────────────────────────┘
```

### EchoPixel의 해결책

EchoPixel은 **GPU-only** 전략으로 ~90% 메모리 절약:

```
┌─────────────────────────────────────────────────────────────┐
│                EchoPixel 메모리 구조                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  GPU VRAM에만 저장 (~100-200MB)                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  2D Array Texture                                    │   │
│  │  - 모든 프레임을 레이어로 저장                        │   │
│  │  - 프레임 전환 시 uniform만 변경                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  CPU 메모리: 디코딩 직후 즉시 해제!                          │
│                                                             │
│  결과: Cornerstone3D 대비 ~75-90% 메모리 절약               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. CPU vs GPU 메모리

### 두 가지 메모리 공간

웹 애플리케이션에서 다루는 메모리는 두 종류입니다:

```
┌─────────────────────────────────────────────────────────────┐
│                    시스템 메모리 구조                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  │
│  │   CPU (시스템) 메모리    │  │   GPU (비디오) 메모리    │  │
│  ├─────────────────────────┤  ├─────────────────────────┤  │
│  │ • 용량: 8-64 GB         │  │ • 용량: 256MB-12GB      │  │
│  │ • 접근: 느림 (상대적)    │  │ • 접근: 매우 빠름        │  │
│  │ • 관리: 자동 (GC)       │  │ • 관리: 수동 필요        │  │
│  │ • 브라우저 탭당 ~4GB    │  │ • 전체 시스템 공유       │  │
│  └─────────────────────────┘  └─────────────────────────┘  │
│            ↑                            ↑                  │
│       JavaScript                   WebGL API               │
│       ArrayBuffer                  Texture                 │
│       TypedArray                   Framebuffer             │
└─────────────────────────────────────────────────────────────┘
```

### 데이터 이동 비용

CPU → GPU 데이터 전송은 비용이 큽니다:

```typescript
// CPU에서 GPU로 텍스처 업로드 (비용 큼!)
gl.texImage2D(
  gl.TEXTURE_2D,          // 타겟
  0,                      // 밉맵 레벨
  gl.RGBA,                // 내부 포맷
  800, 600,               // 크기
  0,                      // 보더
  gl.RGBA,                // 소스 포맷
  gl.UNSIGNED_BYTE,       // 데이터 타입
  imageData               // CPU 메모리의 이미지 데이터
);

// 이 호출은:
// 1. CPU 메모리 → GPU 메모리로 복사
// 2. GPU 드라이버 통해 전송 (오버헤드)
// 3. 800×600×4 = 1.92MB 전송
// 4. 약 0.5~2ms 소요 (해상도에 따라)
```

### 메모리 유형별 특징

| 특성 | CPU 메모리 | GPU 메모리 (VRAM) |
|------|-----------|------------------|
| **크기** | 8-64 GB | 256MB-12GB |
| **속도** | 상대적으로 느림 | 매우 빠름 (렌더링용) |
| **가비지 컬렉션** | 자동 | 수동 해제 필요 |
| **브라우저 접근** | 직접 (ArrayBuffer) | WebGL API 통해서만 |
| **공유** | 탭별 격리 | 시스템 전체 공유 |
| **부족 시** | 탭 크래시 | Context Lost 발생 |

---

## 3. Upload & Release 패턴

### 핵심 아이디어

"**업로드하고 즉시 해제**" - CPU에서 GPU로 데이터를 보내고 CPU 쪽은 바로 정리합니다.

```
데이터 흐름:

[네트워크]       [CPU 메모리]        [GPU 메모리]
    │                │                  │
    │  DICOM 파일    │                  │
    │  (압축 50KB)   │                  │
    ↓                ↓                  │
    ├────────────────┤                  │
    │   디코딩       │                  │
    │   (VideoFrame) │                  │
    │   ~2MB         │                  │
    └────────────────┘                  │
           │                            │
           │  gl.texImage2D()          │
           ↓                            ↓
           ├────────────────────────────┤
           │        GPU Texture         │
           │        ~2MB                │
           └────────────────────────────┘
           │
    frame.close()  ← CPU 메모리 즉시 해제!
           │
           ▼
    CPU 메모리: 0MB (정리됨)
    GPU 메모리: 2MB (렌더링용)
```

### 코드 예제

```typescript
/**
 * Upload & Release 패턴 구현
 *
 * 왜 이렇게 하나?
 * - CPU 메모리를 최소화하여 더 많은 시리즈 로드 가능
 * - 브라우저 메모리 제한(~4GB) 내에서 동작
 * - GPU 메모리만 사용하여 렌더링 성능 최적화
 */
async function loadAndUploadFrames(
  dicomData: ArrayBuffer
): Promise<WebGLTexture> {
  // 1. DICOM 데이터 디코딩 (CPU에서 작업)
  const frames: VideoFrame[] = await decodeDicomFrames(dicomData);

  // 2. 2D Array Texture 생성
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);

  // 3. 텍스처 공간 할당
  gl.texStorage3D(
    gl.TEXTURE_2D_ARRAY,
    1,                    // 밉맵 레벨
    gl.RGBA8,             // 내부 포맷
    frames[0].displayWidth,
    frames[0].displayHeight,
    frames.length         // 레이어 수 = 프레임 수
  );

  // 4. 각 프레임을 GPU로 업로드하고 즉시 해제
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];

    // GPU로 업로드
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,                  // 밉맵 레벨
      0, 0, i,            // x, y, layer
      frame.displayWidth,
      frame.displayHeight,
      1,                  // depth
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      frame               // VideoFrame은 직접 업로드 가능!
    );

    // ⚠️ 중요: CPU 메모리 즉시 해제!
    frame.close();
  }

  return texture;
}
```

### 왜 즉시 해제해야 하는가?

```
VideoFrame을 닫지 않으면 (메모리 누수):

시간 →
프레임 1 로드: ████ 2MB
프레임 2 로드: ████████ 4MB
프레임 3 로드: ████████████ 6MB
프레임 4 로드: ████████████████ 8MB
...
100프레임 후: ████████████████████████████████████████ 200MB 누수!

VideoFrame을 바로 닫으면:

시간 →
프레임 1 로드: ████ 2MB → close() → 0MB
프레임 2 로드: ████ 2MB → close() → 0MB
프레임 3 로드: ████ 2MB → close() → 0MB
...
피크 메모리: 항상 ~2MB (현재 처리 중인 프레임만)
```

---

## 4. GPU 텍스처 메모리 계산

### 계산 공식

```
텍스처 메모리 = Width × Height × Channels × BytesPerChannel × FrameCount
```

### 일반적인 시나리오

```typescript
// 심초음파 영상 메모리 계산
const width = 800;     // 픽셀
const height = 600;    // 픽셀
const channels = 4;    // RGBA
const bytes = 1;       // 8-bit per channel
const frames = 100;    // cine loop

const memoryPerFrame = width * height * channels * bytes;
// 800 × 600 × 4 × 1 = 1,920,000 bytes ≈ 1.83 MB

const totalMemory = memoryPerFrame * frames;
// 1.83 MB × 100 = 183 MB (시리즈 1개)
```

### 시나리오별 메모리 사용량

| 시나리오 | 뷰포트 수 | 프레임/뷰포트 | 해상도 | 총 VRAM |
|----------|----------|--------------|--------|---------|
| 단일 뷰어 | 1 | 100 | 800×600 | ~183 MB |
| 4분할 | 4 | 100 | 800×600 | ~732 MB |
| 스트레스 에코 | 16 | 60 | 800×600 | ~1.76 GB |
| 고해상도 | 4 | 100 | 1280×1024 | ~2 GB |

### GPU 메모리 제한

```
┌─────────────────────────────────────────────────────────────┐
│                    일반적인 GPU 메모리                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  통합 그래픽 (Intel/AMD APU):                                │
│  ├─ 시스템 메모리 공유                                       │
│  ├─ 실제 사용 가능: 128MB - 512MB                           │
│  └─ ⚠️ 스트레스 에코에 부족할 수 있음                        │
│                                                             │
│  저가형 외장 GPU (GTX 1050, RX 570):                        │
│  ├─ 전용 VRAM: 2GB - 4GB                                    │
│  └─ ✅ 대부분의 임상 시나리오 충분                           │
│                                                             │
│  중급 이상 외장 GPU (RTX 3060+):                            │
│  ├─ 전용 VRAM: 6GB - 12GB                                   │
│  └─ ✅ 여유 있음                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. VideoFrame 생명주기

### VideoFrame이란?

Web Codecs API의 `VideoFrame`은 디코딩된 비디오/이미지 프레임을 나타냅니다:

```typescript
// ImageDecoder로 JPEG 디코딩
const decoder = new ImageDecoder({
  type: 'image/jpeg',
  data: jpegData  // Uint8Array
});

const result = await decoder.decode();
const frame: VideoFrame = result.image;

// VideoFrame 속성
console.log(frame.displayWidth);   // 800
console.log(frame.displayHeight);  // 600
console.log(frame.format);         // 'RGBA' 또는 'I420'
```

### 왜 VideoFrame을 사용하는가?

```
ImageBitmap vs VideoFrame 비교:

ImageBitmap (구식):
┌────────────────────────────────────────────────────┐
│ • 브라우저 호환성 좋음                              │
│ • WebGL 업로드 가능                                │
│ • 단점: 형식 제어 어려움, 일부 브라우저 지연        │
└────────────────────────────────────────────────────┘

VideoFrame (신규, 권장):
┌────────────────────────────────────────────────────┐
│ ✅ WebGL texImage2D에 직접 전달 가능               │
│ ✅ 명시적 리소스 관리 (close() 메서드)             │
│ ✅ 하드웨어 가속 디코딩 활용                        │
│ ✅ 정확한 타이밍/프레임 정보                        │
│ ⚠️ 단점: 모던 브라우저만 지원                      │
└────────────────────────────────────────────────────┘
```

### 올바른 VideoFrame 사용 패턴

```typescript
/**
 * VideoFrame의 올바른 생명주기 관리
 *
 * 핵심 규칙: VideoFrame은 "빌린" 리소스
 * - 사용 후 반드시 close() 호출
 * - try-finally 패턴 권장
 */

// ✅ 올바른 패턴: try-finally
async function processFrame(jpegData: Uint8Array): Promise<void> {
  let frame: VideoFrame | null = null;

  try {
    const decoder = new ImageDecoder({
      type: 'image/jpeg',
      data: jpegData
    });
    const result = await decoder.decode();
    frame = result.image;

    // GPU로 업로드
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      frame
    );
  } finally {
    // 항상 실행됨 (에러가 발생해도)
    frame?.close();
  }
}

// ❌ 잘못된 패턴: close() 누락
async function badProcessFrame(jpegData: Uint8Array): Promise<void> {
  const decoder = new ImageDecoder({
    type: 'image/jpeg',
    data: jpegData
  });
  const result = await decoder.decode();
  const frame = result.image;

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);

  // close() 호출 없음! → 메모리 누수!
}

// ❌ 잘못된 패턴: 예외 시 누수
async function anotherBadPattern(jpegData: Uint8Array): Promise<void> {
  const decoder = new ImageDecoder({
    type: 'image/jpeg',
    data: jpegData
  });
  const result = await decoder.decode();
  const frame = result.image;

  // 여기서 예외 발생하면?
  await someOperationThatMightFail();  // 예외 발생!

  frame.close();  // 이 줄은 실행되지 않음 → 누수!
}
```

### 여러 프레임 처리 패턴

```typescript
/**
 * 다중 프레임 처리 시 패턴
 */
async function loadAllFrames(
  dicomFrames: Uint8Array[]
): Promise<WebGLTexture> {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);

  // 첫 프레임으로 크기 확인
  let firstFrame: VideoFrame | null = null;
  try {
    firstFrame = await decodeFrame(dicomFrames[0]);
    gl.texStorage3D(
      gl.TEXTURE_2D_ARRAY,
      1,
      gl.RGBA8,
      firstFrame.displayWidth,
      firstFrame.displayHeight,
      dicomFrames.length
    );
    uploadFrame(firstFrame, 0);
  } finally {
    firstFrame?.close();
  }

  // 나머지 프레임 처리
  for (let i = 1; i < dicomFrames.length; i++) {
    let frame: VideoFrame | null = null;
    try {
      frame = await decodeFrame(dicomFrames[i]);
      uploadFrame(frame, i);
    } finally {
      frame?.close();  // 각 프레임 즉시 해제
    }
  }

  return texture;
}
```

---

## 6. WebGL Context Loss 복구

### Context Loss란?

WebGL Context는 다양한 이유로 **손실**될 수 있습니다:

```
Context Loss 발생 원인:

1. GPU 드라이버 리셋
   └─ Windows: "디스플레이 드라이버가 응답하지 않아 복구되었습니다"

2. 시스템 절전 모드
   └─ 노트북 덮개 닫기 → 다시 열기

3. GPU 메모리 부족
   └─ 다른 앱이 GPU 메모리 점유 → WebGL 컨텍스트 해제

4. 탭 백그라운드 전환 (일부 브라우저)
   └─ 메모리 절약을 위해 브라우저가 Context 해제

5. GPU 전환 (노트북)
   └─ 통합 GPU ↔ 외장 GPU 전환 시
```

### Context Loss 시 발생하는 일

```
┌─────────────────────────────────────────────────────────────┐
│                Context Loss 발생!                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ❌ 모든 WebGL 리소스 무효화:                               │
│     • 텍스처 (DICOM 이미지 데이터)                          │
│     • 버퍼 (vertex, index)                                  │
│     • 셰이더 프로그램                                       │
│     • 프레임버퍼                                            │
│                                                             │
│  ✅ 유지되는 것:                                            │
│     • JavaScript 변수                                       │
│     • DOM 구조                                              │
│     • React 상태                                            │
│                                                             │
│  문제: GPU에 업로드한 DICOM 데이터가 모두 사라짐!           │
│        CPU에 복사본이 없으면 복구 불가능!                    │
└─────────────────────────────────────────────────────────────┘
```

### Context Loss 처리 코드

```typescript
/**
 * WebGL Context Loss 이벤트 처리
 *
 * MDN 권장 패턴 (https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
 */
class WebGLContextHandler {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private isContextLost = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2')!;

    // Context Lost 이벤트 리스너
    canvas.addEventListener('webglcontextlost', (event) => {
      // ⚠️ 중요: preventDefault() 호출로 자동 복구 활성화!
      event.preventDefault();

      this.isContextLost = true;
      console.warn('WebGL Context Lost');

      // 렌더링 루프 중지
      this.stopRenderLoop();

      // 사용자에게 알림 (선택적)
      this.showRecoveryUI();
    });

    // Context Restored 이벤트 리스너
    canvas.addEventListener('webglcontextrestored', async () => {
      console.log('WebGL Context Restored');

      // WebGL 리소스 재초기화
      await this.initializeWebGL();

      // 텍스처 복구
      await this.recoverTextures();

      this.isContextLost = false;

      // 렌더링 루프 재시작
      this.startRenderLoop();

      // 복구 완료 알림
      this.hideRecoveryUI();
    });
  }

  private async recoverTextures(): Promise<void> {
    // 복구 전략 순서대로 시도
    // 1. 압축 캐시에서 복구 (가장 빠름)
    // 2. IndexedDB에서 복구
    // 3. 서버에서 재요청 (최후 수단)
  }
}
```

### 복구 전략 3단계

```
┌─────────────────────────────────────────────────────────────┐
│                    복구 전략 우선순위                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1순위: 압축 캐시 (메모리)                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  • 원본 JPEG/압축 데이터를 CPU 메모리에 보관          │   │
│  │  • 복구 시간: 100-300ms (디코딩만 필요)              │   │
│  │  • 추가 메모리: +20-50MB (압축 상태)                 │   │
│  │  • 오프라인에서도 복구 가능                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  2순위: IndexedDB (디스크)                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  • 브라우저 로컬 저장소에 보관                       │   │
│  │  • 복구 시간: 100-500ms (디스크 I/O 추가)           │   │
│  │  • 추가 메모리: ~0 (디스크 사용)                     │   │
│  │  • 세션 간 데이터 유지 가능                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  3순위: 서버 재요청 (네트워크)                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  • WADO-RS 서버에서 다시 다운로드                    │   │
│  │  • 복구 시간: 2-10초 (네트워크 상태 의존)            │   │
│  │  • 추가 메모리: 0                                    │   │
│  │  • 오프라인에서 불가능                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### EchoPixel의 복구 구현

```typescript
/**
 * Context Loss 복구 구현 예시
 *
 * 참고: 현재는 React 컴포넌트에서 처리
 * - packages/react/src/components/HybridMultiViewport.tsx
 * - packages/react/src/components/building-blocks/DicomCanvas.tsx
 */
class TextureRecoveryManager {
  // 1순위: 압축 데이터 캐시
  private compressedCache = new Map<string, Uint8Array[]>();

  // 2순위: IndexedDB 연결
  private indexedDB?: IDBDatabase;

  // 3순위: 데이터 소스 (서버)
  private dataSource: DicomDataSource;

  async recoverTexture(viewportId: string): Promise<WebGLTexture> {
    // 1순위: 압축 캐시 확인
    if (this.compressedCache.has(viewportId)) {
      console.log(`Recovering ${viewportId} from compressed cache`);
      const compressed = this.compressedCache.get(viewportId)!;
      return await this.decodeAndUpload(compressed);
    }

    // 2순위: IndexedDB 확인
    const cachedData = await this.getFromIndexedDB(viewportId);
    if (cachedData) {
      console.log(`Recovering ${viewportId} from IndexedDB`);
      return await this.decodeAndUpload(cachedData);
    }

    // 3순위: 서버 재요청
    console.log(`Recovering ${viewportId} from server`);
    this.showLoadingIndicator(viewportId);
    const serverData = await this.dataSource.fetchAllFrames(viewportId);
    return await this.decodeAndUpload(serverData);
  }

  // 압축 캐시 활성화 (선택적)
  enableCompressedCache(viewportId: string, jpegFrames: Uint8Array[]): void {
    this.compressedCache.set(viewportId, jpegFrames);
  }
}
```

---

## 7. LRU 캐시 전략

### LRU란?

**Least Recently Used** - 가장 오래 사용하지 않은 항목을 먼저 제거하는 캐시 전략입니다.

```
LRU 캐시 동작 예시 (용량: 3개):

시간 →
접근: A    B    C    D    A    E
─────────────────────────────────────
상태:
[A]  [A,B] [A,B,C] [B,C,D] [C,D,A] [D,A,E]
             ↓        ↓
          A 제거    B 제거   C 제거
          (가장     (가장    (가장
           오래됨)   오래됨)  오래됨)

핵심: 최근에 사용한 것 = 다시 사용할 가능성 높음
```

### 텍스처 LRU 캐시

```typescript
/**
 * GPU 텍스처를 위한 LRU 캐시
 *
 * 왜 필요한가?
 * - GPU 메모리 제한 (통합 그래픽: 256-512MB)
 * - 16개 뷰포트 × 100프레임 = 3GB (제한 초과)
 * - 자주 보는 뷰포트의 텍스처는 유지
 * - 오래 안 본 뷰포트의 텍스처는 해제
 *
 * 구현 위치: packages/core/src/cache/TextureLRUCache.ts
 */
class TextureLRUCache {
  private maxBytes: number;      // 최대 크기 (예: 1GB)
  private currentBytes = 0;
  private cache = new Map<string, TextureEntry>();

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  /**
   * 텍스처 저장
   */
  set(key: string, texture: WebGLTexture, sizeBytes: number): void {
    // 용량 초과 시 오래된 것부터 제거
    while (this.currentBytes + sizeBytes > this.maxBytes) {
      this.evictOldest();
    }

    this.cache.set(key, {
      texture,
      sizeBytes,
      lastUsed: Date.now()
    });
    this.currentBytes += sizeBytes;
  }

  /**
   * 텍스처 가져오기 (사용 시간 갱신)
   */
  get(key: string): WebGLTexture | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 사용 시간 갱신 (LRU 순서 갱신)
    entry.lastUsed = Date.now();
    return entry.texture;
  }

  /**
   * 가장 오래된 텍스처 제거
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey)!;
      // GPU 텍스처 해제
      gl.deleteTexture(entry.texture);
      this.currentBytes -= entry.sizeBytes;
      this.cache.delete(oldestKey);

      console.log(`Evicted texture: ${oldestKey}`);
    }
  }
}

// 사용 예시
const textureCache = new TextureLRUCache(1024 * 1024 * 1024); // 1GB

// 텍스처 저장 (183MB)
textureCache.set('series-001', texture1, 183 * 1024 * 1024);
textureCache.set('series-002', texture2, 183 * 1024 * 1024);
// ...

// 텍스처 사용 (LRU 순서 갱신됨)
const tex = textureCache.get('series-001');
```

### 가시성 기반 캐시 전략

```typescript
/**
 * IntersectionObserver와 LRU 캐시 연동
 *
 * 화면에 보이는 뷰포트 = 높은 우선순위
 * 화면에서 사라진 뷰포트 = 30초 후 해제 고려
 */
class VisibilityAwareCacheManager {
  private cache: TextureLRUCache;
  private visibleViewports = new Set<string>();
  private observer: IntersectionObserver;

  constructor(cache: TextureLRUCache) {
    this.cache = cache;

    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const viewportId = entry.target.dataset.viewportId!;

        if (entry.isIntersecting) {
          // 화면에 나타남 → 텍스처 로드 (없으면)
          this.visibleViewports.add(viewportId);
          this.ensureTextureLoaded(viewportId);
        } else {
          // 화면에서 사라짐 → 30초 후 해제 예약
          this.visibleViewports.delete(viewportId);
          this.scheduleUnload(viewportId, 30000);
        }
      }
    }, { threshold: 0.1 });
  }

  private async ensureTextureLoaded(viewportId: string): Promise<void> {
    if (!this.cache.get(viewportId)) {
      // 캐시에 없으면 로드
      const texture = await this.loadTexture(viewportId);
      this.cache.set(viewportId, texture, this.getTextureSize(viewportId));
    }
  }

  private scheduleUnload(viewportId: string, delayMs: number): void {
    setTimeout(() => {
      // 여전히 안 보이면 해제
      if (!this.visibleViewports.has(viewportId)) {
        // LRU 캐시가 자동으로 관리하므로 별도 해제 불필요
        // (단, 강제 해제가 필요하면 cache.delete() 호출)
      }
    }, delayMs);
  }
}
```

---

## 8. 흔한 메모리 문제

### 문제 1: VideoFrame 누수

**증상**: 시간이 지나면서 메모리 사용량이 계속 증가

```typescript
// ❌ 누수 발생 코드
async function processFrames(frames: Uint8Array[]): Promise<void> {
  for (const data of frames) {
    const decoder = new ImageDecoder({ type: 'image/jpeg', data });
    const result = await decoder.decode();
    const frame = result.image;

    gl.texSubImage3D(/* ... */, frame);
    // frame.close() 호출 없음!
  }
}

// ✅ 수정된 코드
async function processFrames(frames: Uint8Array[]): Promise<void> {
  for (const data of frames) {
    let frame: VideoFrame | null = null;
    try {
      const decoder = new ImageDecoder({ type: 'image/jpeg', data });
      const result = await decoder.decode();
      frame = result.image;
      gl.texSubImage3D(/* ... */, frame);
    } finally {
      frame?.close();  // 항상 해제
    }
  }
}
```

### 문제 2: 텍스처 해제 누락

**증상**: 시리즈 교체 시 이전 텍스처가 GPU에 남음

```typescript
// ❌ 누수 발생 코드
function loadNewSeries(newData: DicomData): void {
  // 이전 텍스처 해제 없이 새로 생성
  const texture = gl.createTexture();
  // 이전 this.texture는 어디로?
  this.texture = texture;
}

// ✅ 수정된 코드
function loadNewSeries(newData: DicomData): void {
  // 이전 텍스처 먼저 해제
  if (this.texture) {
    gl.deleteTexture(this.texture);
  }

  const texture = gl.createTexture();
  this.texture = texture;
}
```

### 문제 3: 컴포넌트 언마운트 시 정리 누락

**증상**: 컴포넌트가 사라져도 GPU 리소스가 남음

```tsx
// ❌ 정리 누락
function DicomViewer({ seriesId }) {
  const textureRef = useRef<WebGLTexture | null>(null);

  useEffect(() => {
    loadTexture(seriesId).then(tex => {
      textureRef.current = tex;
    });
    // 정리 함수 없음!
  }, [seriesId]);

  return <canvas ref={canvasRef} />;
}

// ✅ 정리 함수 추가
function DicomViewer({ seriesId }) {
  const textureRef = useRef<WebGLTexture | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);

  useEffect(() => {
    loadTexture(seriesId).then(tex => {
      textureRef.current = tex;
    });

    // 정리 함수
    return () => {
      if (textureRef.current && glRef.current) {
        glRef.current.deleteTexture(textureRef.current);
        textureRef.current = null;
      }
    };
  }, [seriesId]);

  return <canvas ref={canvasRef} />;
}
```

### 문제 4: ArrayBuffer 누수

**증상**: DICOM 파일 로드 후 CPU 메모리가 해제되지 않음

```typescript
// ❌ 참조 유지로 GC 불가
class DicomLoader {
  private loadedData: ArrayBuffer[] = [];  // 계속 쌓임!

  async load(url: string): Promise<void> {
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    this.loadedData.push(data);  // 참조 유지 → GC 안 됨
    await this.process(data);
  }
}

// ✅ 참조 해제
class DicomLoader {
  async load(url: string): Promise<void> {
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    await this.process(data);
    // data는 함수 종료 후 참조 없음 → GC 가능
  }
}
```

---

## 9. 메모리 모니터링

### Chrome DevTools 사용

```
1. Memory 탭
   - Heap snapshot: JavaScript 힙 메모리 분석
   - Allocation instrumentation: 메모리 할당 추적
   - Allocation sampling: 메모리 할당 샘플링

2. Performance 탭
   - Memory 체크박스 활성화
   - JS Heap, Documents, Nodes, Listeners 추적

3. Task Manager (Chrome)
   - Shift+Esc
   - GPU Memory 열 추가
```

### 코드에서 메모리 측정

```typescript
// JavaScript 힙 메모리 측정
if (performance.memory) {
  console.log('JS Heap:', {
    usedJSHeapSize: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
    totalJSHeapSize: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
  });
}

// WebGL 확장으로 GPU 정보 확인 (일부 브라우저만)
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
if (debugInfo) {
  console.log('GPU:', gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
}

// 텍스처 메모리 직접 추적
class TextureMemoryTracker {
  private totalBytes = 0;

  track(width: number, height: number, format: 'RGBA8' | 'R16UI'): void {
    const bytesPerPixel = format === 'RGBA8' ? 4 : 2;
    this.totalBytes += width * height * bytesPerPixel;
  }

  untrack(width: number, height: number, format: 'RGBA8' | 'R16UI'): void {
    const bytesPerPixel = format === 'RGBA8' ? 4 : 2;
    this.totalBytes -= width * height * bytesPerPixel;
  }

  getUsage(): string {
    return (this.totalBytes / 1024 / 1024).toFixed(2) + ' MB';
  }
}
```

### 메모리 문제 디버깅 체크리스트

```
□ VideoFrame.close() 모든 곳에서 호출되는가?
□ gl.deleteTexture() 필요한 곳에서 호출되는가?
□ React useEffect cleanup 함수가 있는가?
□ 전역 배열/Map에 데이터가 계속 쌓이지 않는가?
□ 이벤트 리스너가 제거되는가?
□ setInterval/setTimeout이 정리되는가?
```

---

## 10. 학습 포인트 정리

### 핵심 개념

| 개념 | 한 줄 설명 |
|------|-----------|
| **Upload & Release** | GPU에 업로드 후 CPU 데이터 즉시 해제 |
| **VideoFrame.close()** | 디코딩된 프레임 리소스 명시적 해제 필수 |
| **Context Loss** | GPU 리소스가 손실되는 상황, 복구 전략 필요 |
| **LRU 캐시** | 오래된 텍스처부터 자동 제거 |
| **VRAM 한계** | 통합 그래픽 256-512MB, 계획적 관리 필요 |

### 메모리 관리 우선순위

1. **VideoFrame 누수 방지** - try-finally 패턴 필수
2. **텍스처 해제** - 컴포넌트 언마운트 시 정리
3. **LRU 캐시 적용** - VRAM 한계 대응
4. **Context Loss 복구** - 압축 캐시 유지

### 더 배우기

- **WebGL Best Practices**: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- **Web Codecs API**: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- **IndexedDB Guide**: https://developer.mozilla.org/ko/docs/Web/API/IndexedDB_API

### 프로젝트 내부 문서

- **[메모리 아키텍처 분석](/docs/architecture/memory-architecture-analysis.md)** - 설계 결정의 상세 근거
- [렌더링 파이프라인](./rendering-pipeline.md) - 전체 데이터 흐름
- [성능 최적화](./performance-optimization.md) - 7가지 최적화 전략
- [멀티 뷰포트 아키텍처](./multi-viewport-architecture.md) - Hybrid DOM-WebGL 구조
