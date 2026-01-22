# Core 개발을 위한 기반 기술 가이드

이 문서에서는 EchoPixel Core 개발에 필요한 기반 기술들을 설명합니다. WebGL2, Web Workers, 이미지 인코딩/디코딩, 캐싱 전략 등을 다룹니다.

---

## 목차

1. [WebGL2 기초](#webgl2-기초)
2. [텍스처 관리](#텍스처-관리)
3. [셰이더 프로그래밍](#셰이더-프로그래밍)
4. [이미지 디코딩](#이미지-디코딩)
5. [Web Workers](#web-workers)
6. [메모리와 캐싱](#메모리와-캐싱)
7. [성능 최적화](#성능-최적화)

---

## WebGL2 기초

### WebGL2란?

[WebGL2](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext)는 브라우저에서 GPU 가속 2D/3D 그래픽을 렌더링하기 위한 API입니다.

```
WebGL 발전 과정
───────────────

WebGL 1.0 (2011)
  - OpenGL ES 2.0 기반
  - 기본적인 텍스처, 셰이더

WebGL 2.0 (2017) ← EchoPixel 사용
  - OpenGL ES 3.0 기반
  - 3D 텍스처, 2D Array Texture
  - Transform Feedback
  - Multiple Render Targets
```

### WebGL2 컨텍스트 얻기

```typescript
// WebGL2 컨텍스트 생성
function getWebGL2Context(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    alpha: false,              // 투명 배경 불필요
    antialias: false,          // DICOM에서 안티앨리어싱 불필요
    depth: false,              // 깊이 버퍼 불필요 (2D)
    stencil: false,            // 스텐실 버퍼 불필요
    preserveDrawingBuffer: false,  // 성능 최적화
    powerPreference: 'high-performance',  // 고성능 GPU 선호
  });

  if (!gl) {
    throw new Error('WebGL2 is not supported');
  }

  return gl;
}
```

### 렌더링 파이프라인 이해

```
WebGL2 렌더링 파이프라인
────────────────────────

JavaScript (CPU)
    │
    ├── 버텍스 데이터 준비
    ├── 텍스처 업로드
    ├── Uniform 설정
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│                         GPU                                   │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│   Vertex Shader                                               │
│   ┌───────────────────────────────────────────────────────┐  │
│   │ 각 정점(vertex)에 대해 실행                            │  │
│   │ - 위치 변환 (모델 → 클립 좌표)                         │  │
│   │ - 텍스처 좌표 전달                                     │  │
│   └───────────────────────────────────────────────────────┘  │
│        │                                                      │
│        ▼                                                      │
│   Rasterization                                               │
│   ┌───────────────────────────────────────────────────────┐  │
│   │ 삼각형을 픽셀(fragment)로 분해                         │  │
│   │ - 각 픽셀에 대해 보간된 값 계산                        │  │
│   └───────────────────────────────────────────────────────┘  │
│        │                                                      │
│        ▼                                                      │
│   Fragment Shader                                             │
│   ┌───────────────────────────────────────────────────────┐  │
│   │ 각 픽셀에 대해 실행                                    │  │
│   │ - 텍스처 샘플링                                        │  │
│   │ - Window/Level 변환                                    │  │
│   │ - 최종 색상 출력                                       │  │
│   └───────────────────────────────────────────────────────┘  │
│        │                                                      │
│        ▼                                                      │
│   Framebuffer (화면 출력)                                     │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 기본 렌더링 루프

```typescript
// 단순화된 렌더링 예시
function render(gl: WebGL2RenderingContext) {
  // 1. 화면 클리어
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // 2. 셰이더 프로그램 사용
  gl.useProgram(shaderProgram);

  // 3. 텍스처 바인딩
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(textureLocation, 0);  // 텍스처 유닛 0

  // 4. Uniform 설정 (Window/Level)
  gl.uniform1f(windowCenterLocation, 128.0);
  gl.uniform1f(windowWidthLocation, 256.0);

  // 5. 버텍스 버퍼 바인딩
  gl.bindVertexArray(vao);

  // 6. 드로우 콜
  gl.drawArrays(gl.TRIANGLES, 0, 6);  // 쿼드 = 2 삼각형 = 6 정점
}
```

---

## 텍스처 관리

### 2D 텍스처 (TEXTURE_2D)

단일 프레임 이미지에 적합합니다.

```typescript
// 2D 텍스처 생성 및 업로드
function createTexture2D(
  gl: WebGL2RenderingContext,
  image: ImageBitmap
): WebGLTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // 텍스처 파라미터 설정
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // 이미지 데이터 업로드
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,              // mipmap level
    gl.RGBA,        // internal format
    gl.RGBA,        // format
    gl.UNSIGNED_BYTE, // type
    image           // source
  );

  return texture;
}
```

### 2D Array Texture (TEXTURE_2D_ARRAY) ⭐

**Multi-frame 이미지의 핵심 최적화 기법**입니다.

```
TEXTURE_2D vs TEXTURE_2D_ARRAY
────────────────────────────────

TEXTURE_2D (프레임마다 개별 텍스처):
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Texture │ │ Texture │ │ Texture │  ...
│    0    │ │    1    │ │    2    │
└─────────┘ └─────────┘ └─────────┘
     ↑           ↑           ↑
  bind(0)     bind(1)     bind(2)    ← 매번 바인딩 변경!


TEXTURE_2D_ARRAY (모든 프레임이 하나의 텍스처):
┌─────────────────────────────────────┐
│           Array Texture             │
│  ┌─────┬─────┬─────┬─────┬─────┐   │
│  │ L0  │ L1  │ L2  │ L3  │ ... │   │  L = Layer
│  └─────┴─────┴─────┴─────┴─────┘   │
└─────────────────────────────────────┘
                ↑
         bind 한 번만!
   uniform u_layer = n  ← layer만 변경!
```

```typescript
// 2D Array Texture 생성
function createArrayTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  frameCount: number
): WebGLTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);

  // 텍스처 파라미터
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // ⭐ Immutable Storage 할당 (권장)
  gl.texStorage3D(
    gl.TEXTURE_2D_ARRAY,
    1,              // mipmap levels
    gl.RGBA8,       // internal format
    width,
    height,
    frameCount      // 레이어 수 (프레임 수)
  );

  return texture;
}

// 개별 프레임 업로드
function uploadFrame(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  frameIndex: number,
  image: ImageBitmap
): void {
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);

  gl.texSubImage3D(
    gl.TEXTURE_2D_ARRAY,
    0,              // mipmap level
    0, 0,           // x, y offset
    frameIndex,     // z offset (레이어 인덱스)
    image.width,
    image.height,
    1,              // depth (1 레이어)
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    image
  );
}
```

### Grayscale 텍스처 (LUMINANCE/R8)

의료 영상은 대부분 Grayscale입니다.

```typescript
// WebGL2에서 Grayscale 텍스처 처리
// R8 (단일 채널) + 셰이더에서 확장

gl.texStorage3D(
  gl.TEXTURE_2D_ARRAY,
  1,
  gl.R8,          // 단일 채널, 8-bit
  width,
  height,
  frameCount
);

gl.texSubImage3D(
  gl.TEXTURE_2D_ARRAY,
  0, 0, 0, frameIndex,
  width, height, 1,
  gl.RED,         // 단일 채널
  gl.UNSIGNED_BYTE,
  pixelData
);
```

셰이더에서:
```glsl
// R 채널만 샘플링하여 grayscale로 사용
float pixel = texture(u_texture, vec3(v_texCoord, u_layer)).r;
gl_FragColor = vec4(pixel, pixel, pixel, 1.0);
```

### 텍스처 메모리 관리

```typescript
// TextureManager 클래스 개념

class TextureManager {
  private gl: WebGL2RenderingContext;
  private textures: Map<string, WebGLTexture> = new Map();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  // 텍스처 생성 또는 재사용
  getOrCreateTexture(id: string, config: TextureConfig): WebGLTexture {
    if (this.textures.has(id)) {
      return this.textures.get(id)!;
    }

    const texture = this.createTexture(config);
    this.textures.set(id, texture);
    return texture;
  }

  // 텍스처 해제
  deleteTexture(id: string): void {
    const texture = this.textures.get(id);
    if (texture) {
      this.gl.deleteTexture(texture);
      this.textures.delete(id);
    }
  }

  // 모든 텍스처 해제
  dispose(): void {
    for (const texture of this.textures.values()) {
      this.gl.deleteTexture(texture);
    }
    this.textures.clear();
  }
}
```

---

## 셰이더 프로그래밍

### GLSL ES 3.0 기초

WebGL2는 GLSL ES 3.0을 사용합니다.

```glsl
#version 300 es  // WebGL2 필수

// 정밀도 지정 (필수)
precision highp float;
precision highp int;
precision highp sampler2DArray;

// Vertex Shader 입력/출력
in vec2 a_position;      // 버텍스 위치 (in = attribute)
in vec2 a_texCoord;      // 텍스처 좌표
out vec2 v_texCoord;     // Fragment로 전달 (out = varying)

// Fragment Shader 입력/출력
in vec2 v_texCoord;      // Vertex에서 전달받음
out vec4 fragColor;      // 최종 출력 색상 (gl_FragColor 대신)

// Uniform (CPU에서 설정)
uniform mat4 u_transform;
uniform float u_windowCenter;
uniform float u_windowWidth;
uniform sampler2DArray u_texture;
uniform float u_layer;
```

### EchoPixel 버텍스 셰이더

```glsl
#version 300 es

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

uniform mat4 u_transform;  // 변환 행렬 (Pan, Zoom, Rotation)

void main() {
  // 변환 적용
  vec4 pos = u_transform * vec4(a_position, 0.0, 1.0);
  gl_Position = pos;

  // 텍스처 좌표 전달
  v_texCoord = a_texCoord;
}
```

### EchoPixel 프래그먼트 셰이더

```glsl
#version 300 es

precision highp float;
precision highp sampler2DArray;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2DArray u_texture;
uniform float u_layer;           // 현재 프레임 인덱스
uniform float u_windowCenter;
uniform float u_windowWidth;
uniform float u_rescaleSlope;    // CT용
uniform float u_rescaleIntercept;
uniform int u_invert;            // MONOCHROME1 반전

void main() {
  // 1. 텍스처 샘플링
  float rawPixel = texture(u_texture, vec3(v_texCoord, u_layer)).r;

  // 2. Rescale 적용 (CT의 경우)
  float pixel = rawPixel * 255.0;  // 0~1 → 0~255
  pixel = pixel * u_rescaleSlope + u_rescaleIntercept;

  // 3. Window/Level 적용
  float minValue = u_windowCenter - u_windowWidth / 2.0;
  float maxValue = u_windowCenter + u_windowWidth / 2.0;
  float normalized = (pixel - minValue) / (maxValue - minValue);
  normalized = clamp(normalized, 0.0, 1.0);

  // 4. 반전 처리 (MONOCHROME1)
  if (u_invert == 1) {
    normalized = 1.0 - normalized;
  }

  // 5. 최종 출력
  fragColor = vec4(normalized, normalized, normalized, 1.0);
}
```

### 셰이더 컴파일

```typescript
// 셰이더 컴파일 유틸리티
function compileShader(
  gl: WebGL2RenderingContext,
  source: string,
  type: number
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  // 컴파일 에러 확인
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${error}`);
  }

  return shader;
}

// 프로그램 링크
function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertexShader = compileShader(gl, vertexSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(gl, fragmentSource, gl.FRAGMENT_SHADER);

  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  // 링크 에러 확인
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program);
    throw new Error(`Program linking failed: ${error}`);
  }

  // 셰이더 정리 (프로그램에 포함됨)
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return program;
}
```

---

## 이미지 디코딩

### 디코딩 전략 개요

```
DICOM 이미지 디코딩 경로
────────────────────────

Transfer Syntax
     │
     ├── Native (비압축)
     │      └── 직접 사용 → Uint8Array/Uint16Array
     │
     ├── JPEG Baseline (8-bit)
     │      ├── WebCodecs ImageDecoder (권장)
     │      └── createImageBitmap 폴백
     │
     ├── JPEG Extended (12-bit)
     │      └── 소프트웨어 디코더 (jpeg-lossless-decoder-js 등)
     │
     ├── JPEG Lossless
     │      └── 소프트웨어 디코더
     │
     ├── JPEG 2000
     │      └── OpenJPEG WASM
     │
     └── RLE
           └── 직접 구현 (Run-Length Decoding)
```

### WebCodecs ImageDecoder (권장)

[WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder)는 하드웨어 가속 디코딩을 제공합니다.

```typescript
// WebCodecs ImageDecoder 사용
async function decodeWithWebCodecs(
  jpegData: Uint8Array
): Promise<ImageBitmap> {
  // ImageDecoder 지원 확인
  if (!('ImageDecoder' in window)) {
    throw new Error('ImageDecoder not supported');
  }

  const decoder = new ImageDecoder({
    data: jpegData,
    type: 'image/jpeg',
  });

  // 디코딩 대기
  await decoder.completed;

  // 프레임 디코딩
  const result = await decoder.decode();

  // VideoFrame → ImageBitmap 변환
  const bitmap = await createImageBitmap(result.image);

  // 리소스 정리
  result.image.close();
  decoder.close();

  return bitmap;
}
```

### createImageBitmap 폴백

Safari 등 WebCodecs 미지원 브라우저용:

```typescript
// createImageBitmap 폴백
async function decodeWithImageBitmap(
  jpegData: Uint8Array
): Promise<ImageBitmap> {
  // Blob 생성
  const blob = new Blob([jpegData], { type: 'image/jpeg' });

  // ImageBitmap 생성 (자동 디코딩)
  const bitmap = await createImageBitmap(blob);

  return bitmap;
}
```

### Native (비압축) 디코딩

```typescript
// 비압축 픽셀 데이터 처리
function decodeNative(
  pixelData: Uint8Array,
  imageInfo: DicomImageInfo
): ImageData {
  const { rows, columns, bitsAllocated, photometricInterpretation } = imageInfo;

  // RGBA 출력 버퍼
  const output = new Uint8ClampedArray(rows * columns * 4);

  if (bitsAllocated === 8 && photometricInterpretation === 'MONOCHROME2') {
    // 8-bit Grayscale
    for (let i = 0; i < pixelData.length; i++) {
      const gray = pixelData[i];
      output[i * 4 + 0] = gray;  // R
      output[i * 4 + 1] = gray;  // G
      output[i * 4 + 2] = gray;  // B
      output[i * 4 + 3] = 255;   // A
    }
  } else if (bitsAllocated === 16) {
    // 16-bit Grayscale → 8-bit 변환
    const view = new DataView(pixelData.buffer);
    const maxValue = (1 << imageInfo.bitsStored) - 1;

    for (let i = 0; i < rows * columns; i++) {
      const pixel16 = view.getUint16(i * 2, true);  // Little Endian
      const gray = Math.round((pixel16 / maxValue) * 255);
      output[i * 4 + 0] = gray;
      output[i * 4 + 1] = gray;
      output[i * 4 + 2] = gray;
      output[i * 4 + 3] = 255;
    }
  }

  return new ImageData(output, columns, rows);
}
```

### 디코더 선택 로직

```typescript
// EchoPixel 디코더 선택
async function decodeFrame(
  frameData: Uint8Array,
  imageInfo: DicomImageInfo,
  isEncapsulated: boolean
): Promise<ImageBitmap | ImageData> {

  if (!isEncapsulated) {
    // Native (비압축)
    return decodeNative(frameData, imageInfo);
  }

  // JPEG 계열
  const isJpeg = frameData[0] === 0xFF && frameData[1] === 0xD8;

  if (isJpeg) {
    // WebCodecs 우선 시도
    if ('ImageDecoder' in window) {
      try {
        return await decodeWithWebCodecs(frameData);
      } catch {
        // 폴백
      }
    }

    // createImageBitmap 폴백
    return await decodeWithImageBitmap(frameData);
  }

  // JPEG 2000 (추후 구현)
  throw new Error('Unsupported compression');
}
```

---

## Web Workers

### Web Worker란?

Web Worker는 백그라운드 스레드에서 JavaScript를 실행합니다.

```
메인 스레드 vs Web Worker
─────────────────────────

메인 스레드:
  - UI 렌더링
  - 이벤트 처리
  - DOM 접근 가능
  - 무거운 작업 시 UI 프리징

Web Worker:
  - 백그라운드 연산
  - DOM 접근 불가
  - 메인 스레드와 메시지로 통신
  - UI 블로킹 없음
```

### DICOM 디코딩용 Worker

```typescript
// dicom-worker.ts
self.onmessage = async (event: MessageEvent) => {
  const { type, data, id } = event.data;

  if (type === 'decode') {
    try {
      const { frameData, imageInfo, isEncapsulated } = data;

      // 무거운 디코딩 작업
      const decoded = await decodeFrame(frameData, imageInfo, isEncapsulated);

      // 결과 전송 (Transferable 사용)
      self.postMessage(
        { id, success: true, result: decoded },
        [decoded.data.buffer]  // ArrayBuffer 소유권 이전
      );
    } catch (error) {
      self.postMessage({ id, success: false, error: error.message });
    }
  }
};
```

### Worker 풀 관리

```typescript
// Worker Pool 개념
class DecoderWorkerPool {
  private workers: Worker[] = [];
  private queue: Task[] = [];
  private idle: Worker[] = [];

  constructor(size: number = navigator.hardwareConcurrency || 4) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL('./dicom-worker.ts', import.meta.url));
      worker.onmessage = (e) => this.handleResult(worker, e.data);
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  async decode(frameData: Uint8Array, imageInfo: DicomImageInfo): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const task = { frameData, imageInfo, resolve, reject };

      if (this.idle.length > 0) {
        this.dispatch(this.idle.pop()!, task);
      } else {
        this.queue.push(task);
      }
    });
  }

  private dispatch(worker: Worker, task: Task): void {
    const id = crypto.randomUUID();
    this.pendingTasks.set(id, task);
    worker.postMessage(
      { type: 'decode', id, data: task },
      [task.frameData.buffer]  // Transfer ownership
    );
  }

  private handleResult(worker: Worker, result: WorkerResult): void {
    const task = this.pendingTasks.get(result.id);
    if (result.success) {
      task.resolve(result.data);
    } else {
      task.reject(new Error(result.error));
    }

    // 다음 작업 처리
    if (this.queue.length > 0) {
      this.dispatch(worker, this.queue.shift()!);
    } else {
      this.idle.push(worker);
    }
  }

  dispose(): void {
    this.workers.forEach(w => w.terminate());
  }
}
```

### Transferable Objects

```typescript
// Transferable Objects로 성능 최적화
//
// 일반 postMessage: 데이터 복사 (느림)
// Transferable: 소유권 이전 (빠름)

// ❌ 데이터 복사 (느림)
worker.postMessage({ pixels: largeArray });

// ✅ 소유권 이전 (빠름)
worker.postMessage(
  { pixels: largeArray },
  [largeArray.buffer]  // Transferable 목록
);

// 이후 largeArray.buffer는 접근 불가 (소유권 이전됨)
```

---

## 메모리와 캐싱

### JavaScript 메모리 모델

```
브라우저 메모리 구조
───────────────────

┌─────────────────────────────────────────────────────────┐
│                       RAM (시스템)                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   JavaScript Heap                                        │
│   ┌────────────────────────────────────────────────┐    │
│   │ - Objects, Arrays                               │    │
│   │ - TypedArray 데이터                             │    │
│   │ - String, Number                                │    │
│   │                                                 │    │
│   │ 제한: 보통 1-4GB (브라우저/OS에 따라 다름)     │    │
│   └────────────────────────────────────────────────┘    │
│                                                          │
│   VRAM (GPU Memory)                                      │
│   ┌────────────────────────────────────────────────┐    │
│   │ - WebGL Textures                                │    │
│   │ - Buffers                                       │    │
│   │ - Framebuffers                                  │    │
│   │                                                 │    │
│   │ 제한: GPU VRAM 크기 (2-16GB)                   │    │
│   └────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### LRU Cache 구현

```typescript
// Least Recently Used (LRU) 캐시
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }

    // 접근 시 맨 뒤로 이동 (최근 사용)
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    // 이미 있으면 삭제 후 갱신
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // 용량 초과 시 가장 오래된 항목 제거
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
```

### GPU 메모리 관리 전략

```
EchoPixel GPU 메모리 전략: Upload & Release
──────────────────────────────────────────

1. 필요할 때만 업로드
   - Lazy loading
   - 보이는 뷰포트만 텍스처 로드

2. 사용 후 즉시 해제 가능하도록 설계
   - 뷰포트 닫을 때 텍스처 해제
   - Context Loss 시 모든 텍스처 무효화

3. LRU 기반 텍스처 캐시
   - 자주 사용하는 시리즈 캐시
   - VRAM 한계 도달 시 오래된 텍스처 evict

4. 모니터링
   - gl.getParameter(gl.GPU_MEMORY_INFO_CURRENT_AVAILABLE_VIDMEM_NVX)
   - (NVIDIA 전용, 대안 필요)
```

### Context Loss 처리

```typescript
// WebGL Context Loss 처리
function setupContextLossHandling(canvas: HTMLCanvasElement) {
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();  // 자동 복구 시도
    console.warn('WebGL context lost');

    // 모든 WebGL 리소스 참조 무효화
    textureManager.invalidateAll();
    shaderCache.clear();
  });

  canvas.addEventListener('webglcontextrestored', () => {
    console.log('WebGL context restored');

    // 리소스 재생성
    initializeWebGL();
    reloadVisibleTextures();
  });
}
```

---

## 성능 최적화

### 렌더링 최적화

```typescript
// 1. requestAnimationFrame 통합
class RenderScheduler {
  private pendingRender = false;
  private viewports: Viewport[] = [];

  scheduleRender(): void {
    if (this.pendingRender) return;

    this.pendingRender = true;
    requestAnimationFrame(() => {
      this.render();
      this.pendingRender = false;
    });
  }

  private render(): void {
    // 모든 뷰포트를 한 프레임에 렌더링
    for (const viewport of this.viewports) {
      viewport.render();
    }
  }
}

// 2. gl.scissor()로 영역 분할
function renderMultiViewport(gl: WebGL2RenderingContext, viewports: Viewport[]) {
  gl.enable(gl.SCISSOR_TEST);

  for (const vp of viewports) {
    // 해당 뷰포트 영역만 렌더링
    gl.scissor(vp.x, vp.y, vp.width, vp.height);
    gl.viewport(vp.x, vp.y, vp.width, vp.height);

    renderViewport(gl, vp);
  }

  gl.disable(gl.SCISSOR_TEST);
}
```

### 배치 최적화

```typescript
// 3. Uniform 변경 최소화
function renderFrames(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  frames: number[]
) {
  gl.useProgram(program);

  // 변하지 않는 uniform은 한 번만 설정
  gl.uniform1f(gl.getUniformLocation(program, 'u_windowCenter'), 128);
  gl.uniform1f(gl.getUniformLocation(program, 'u_windowWidth'), 256);

  const layerLocation = gl.getUniformLocation(program, 'u_layer');

  for (const frameIndex of frames) {
    // 프레임마다 변하는 것만 업데이트
    gl.uniform1f(layerLocation, frameIndex);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
```

### 메모리 최적화

```typescript
// 4. TypedArray 재사용
class BufferPool {
  private pool: Map<number, Uint8Array[]> = new Map();

  acquire(size: number): Uint8Array {
    const sizePool = this.pool.get(size);
    if (sizePool && sizePool.length > 0) {
      return sizePool.pop()!;
    }
    return new Uint8Array(size);
  }

  release(buffer: Uint8Array): void {
    const size = buffer.byteLength;
    if (!this.pool.has(size)) {
      this.pool.set(size, []);
    }
    this.pool.get(size)!.push(buffer);
  }
}

// 5. Object Pooling
const pointPool: Point[] = [];

function acquirePoint(): Point {
  return pointPool.pop() || { x: 0, y: 0 };
}

function releasePoint(point: Point): void {
  pointPool.push(point);
}
```

### 프로파일링

```typescript
// 성능 측정 유틸리티
class PerformanceMonitor {
  private frameTimes: number[] = [];
  private lastFrameTime = 0;

  beginFrame(): void {
    this.lastFrameTime = performance.now();
  }

  endFrame(): void {
    const frameTime = performance.now() - this.lastFrameTime;
    this.frameTimes.push(frameTime);

    // 최근 60프레임만 유지
    if (this.frameTimes.length > 60) {
      this.frameTimes.shift();
    }
  }

  get fps(): number {
    if (this.frameTimes.length === 0) return 0;
    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b) / this.frameTimes.length;
    return 1000 / avgFrameTime;
  }

  get avgFrameTime(): number {
    if (this.frameTimes.length === 0) return 0;
    return this.frameTimes.reduce((a, b) => a + b) / this.frameTimes.length;
  }
}
```

---

## 학습 리소스

### WebGL

- [WebGL2 Fundamentals](https://webgl2fundamentals.org/) - 기초부터 고급까지
- [MDN WebGL Tutorial](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial)
- [WebGL Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)

### WASM/디코딩

- [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [OpenJPEG](https://github.com/nickkraakman/openjpeg-browser) - JPEG 2000 WASM

### 성능

- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
- [GPU 메모리 프로파일링](https://link.springer.com/article/10.1007/s10278-025-01430-9)

---

## 다음 단계

- [아키텍처 이해](./architecture.md) - 전체 시스템 구조
- [코딩 가이드](./coding-guide.md) - 코드 스타일
- [Cornerstone vs EchoPixel](./cornerstone-vs-echopixel.md) - 비교 분석
