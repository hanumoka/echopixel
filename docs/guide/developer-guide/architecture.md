# 아키텍처 이해

이 문서에서는 EchoPixel의 핵심 아키텍처와 데이터 흐름을 설명합니다.

---

## 목차

1. [전체 아키텍처](#전체-아키텍처)
2. [렌더링 파이프라인](#렌더링-파이프라인)
3. [뷰포트 아키텍처](#뷰포트-아키텍처)
4. [도구 시스템](#도구-시스템)
5. [어노테이션 시스템](#어노테이션-시스템)
6. [성능 최적화 전략](#성능-최적화-전략)

---

## 전체 아키텍처

### 레이어 구조

```
┌─────────────────────────────────────────────────┐
│                   React Layer                    │
│  (SingleDicomViewer, HybridMultiViewport, ...)  │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│                   Core Layer                     │
│  (ViewportManager, ToolGroup, AnnotationStore)  │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│                 WebGL Layer                      │
│  (TextureManager, QuadRenderer, Shaders)        │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│                  GPU (WebGL2)                    │
└─────────────────────────────────────────────────┘
```

### 데이터 흐름

```
DICOM File/WADO-RS
        │
        ▼
┌───────────────┐
│  DICOM Parser │ → DicomDataset, ImageInfo
└───────────────┘
        │
        ▼
┌───────────────┐
│    Decoder    │ → DecodedFrame (ImageBitmap)
└───────────────┘
        │
        ▼
┌───────────────┐
│TextureManager │ → WebGL Texture
└───────────────┘
        │
        ▼
┌───────────────┐
│  QuadRenderer │ → Canvas에 렌더링
└───────────────┘
```

---

## 렌더링 파이프라인

### 1. DICOM 파싱

```typescript
// 1. 바이너리 데이터 파싱
const dataset = parseDicom(buffer);

// 2. 이미지 메타데이터 추출
const imageInfo = getImageInfo(buffer, dataset);
// → rows, columns, bitsStored, windowCenter, windowWidth, ...

// 3. 픽셀 데이터 추출
const pixelData = extractPixelData(buffer, dataset);
// → frames: ArrayBuffer[], isEncapsulated: boolean
```

### 2. 이미지 디코딩

```typescript
// 비압축 (Raw)
if (!isEncapsulated) {
  // 직접 사용 가능
  return new Uint8Array(frameBuffer);
}

// 압축 (JPEG, JPEG2000, ...)
if (isImageDecoderSupported()) {
  // Web Codecs API 사용 (하드웨어 가속)
  const decoder = new ImageDecoder({ data: frameBuffer, type: 'image/jpeg' });
  const result = await decoder.decode();
  return result.image; // VideoFrame
} else {
  // 폴백 디코더 사용
  return decodeJpegFallback(frameBuffer);
}
```

### 3. 텍스처 업로드

```typescript
// TextureManager가 WebGL 텍스처 생성
const texture = textureManager.createTexture(decodedFrame, imageInfo);

// 2D Array Texture 사용 (멀티프레임)
gl.texImage3D(
  gl.TEXTURE_2D_ARRAY,
  0,                    // mipmap level
  gl.LUMINANCE,         // internal format
  width, height,
  frameCount,           // depth (프레임 수)
  0,                    // border
  gl.LUMINANCE,         // format
  gl.UNSIGNED_BYTE,     // type
  pixelData
);
```

### 4. 셰이더 렌더링

```glsl
// Vertex Shader
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}

// Fragment Shader
precision mediump float;
uniform sampler2D u_texture;
uniform float u_windowCenter;
uniform float u_windowWidth;
varying vec2 v_texCoord;

void main() {
  float value = texture2D(u_texture, v_texCoord).r;

  // Window/Level 적용
  float minValue = u_windowCenter - u_windowWidth / 2.0;
  float maxValue = u_windowCenter + u_windowWidth / 2.0;
  float normalized = (value * 255.0 - minValue) / (maxValue - minValue);
  normalized = clamp(normalized, 0.0, 1.0);

  gl_FragColor = vec4(normalized, normalized, normalized, 1.0);
}
```

---

## 뷰포트 아키텍처

### SingleDicomViewer 아키텍처

```
┌─────────────────────────────────────────────────┐
│              SingleDicomViewer                   │
├─────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────┐    │
│  │           DicomToolbar                   │    │
│  └─────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────┐    │
│  │           DicomCanvas                    │    │
│  │  ┌───────────────────────────────────┐  │    │
│  │  │        WebGL Canvas               │  │    │
│  │  └───────────────────────────────────┘  │    │
│  │  ┌───────────────────────────────────┐  │    │
│  │  │        SVG Overlay                │  │    │
│  │  │        (Annotations)              │  │    │
│  │  └───────────────────────────────────┘  │    │
│  └─────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────┐    │
│  │           DicomControls                  │    │
│  └─────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────┐    │
│  │           DicomStatusBar                 │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### HybridMultiViewport 아키텍처

```
┌─────────────────────────────────────────────────┐
│            HybridMultiViewport                   │
├─────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────┐    │
│  │     Single WebGL Canvas (전체)           │    │
│  │  ┌────┬────┬────┬────┐                  │    │
│  │  │ V1 │ V2 │ V3 │ V4 │  ← gl.scissor() │    │
│  │  ├────┼────┼────┼────┤    로 분할      │    │
│  │  │ V5 │ V6 │ V7 │ V8 │                  │    │
│  │  └────┴────┴────┴────┘                  │    │
│  └─────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────┐    │
│  │     DOM Overlay Grid                     │    │
│  │  ┌────┬────┬────┬────┐                  │    │
│  │  │ S1 │ S2 │ S3 │ S4 │ ← HybridViewport │    │
│  │  ├────┼────┼────┼────┤    Slot (DOM)    │    │
│  │  │ S5 │ S6 │ S7 │ S8 │                  │    │
│  │  └────┴────┴────┴────┘                  │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### 하이브리드 방식의 장점

| 기존 방식 | 하이브리드 방식 |
|-----------|-----------------|
| 뷰포트당 1개 WebGL Context | 전체에 1개 WebGL Context |
| 최대 8~16개 뷰포트 | 100개+ 뷰포트 |
| DOM 오버헤드 높음 | DOM 오버헤드 낮음 |
| 구현 간단 | 구현 복잡 |

---

## 도구 시스템

### 도구 등록 및 활성화

```typescript
// 도구 등록
ToolRegistry.register('windowLevel', WindowLevelTool);
ToolRegistry.register('pan', PanTool);
ToolRegistry.register('zoom', ZoomTool);

// 도구 그룹 생성
const toolGroup = new ToolGroup({
  defaultTool: 'windowLevel',
  enabledTools: ['windowLevel', 'pan', 'zoom'],
});

// 뷰포트에 연결
toolGroup.addViewport(viewport);

// 도구 활성화
toolGroup.setActiveTool('pan');
```

### 이벤트 처리 흐름

```
Mouse Event
     │
     ▼
┌──────────────┐
│EventNormalizer│ → NormalizedMouseEvent
└──────────────┘
     │
     ▼
┌──────────────┐
│  ToolGroup   │ → 활성 도구 찾기
└──────────────┘
     │
     ▼
┌──────────────┐
│  Active Tool │ → mouseDown/mouseMove/mouseUp
└──────────────┘
     │
     ▼
┌──────────────┐
│   Viewport   │ → 상태 업데이트 (transform, windowLevel)
└──────────────┘
     │
     ▼
┌──────────────┐
│   Renderer   │ → 화면 업데이트
└──────────────┘
```

### 도구 바인딩

```typescript
// 기본 바인딩
const defaultBindings = {
  windowLevel: [{ mouseButton: 'left', modifiers: [] }],
  pan: [
    { mouseButton: 'right', modifiers: [] },
    { mouseButton: 'left', modifiers: ['ctrl'] },
  ],
  zoom: [{ wheel: true, modifiers: [] }],
  stackScroll: [{ wheel: true, modifiers: ['shift'] }],
};

// 바인딩 매칭
function matchesBinding(event: NormalizedMouseEvent, binding: ToolBinding): boolean {
  if (binding.mouseButton && event.mouseButton !== binding.mouseButton) return false;
  if (binding.modifiers) {
    for (const mod of binding.modifiers) {
      if (!event.modifiers[mod]) return false;
    }
  }
  return true;
}
```

---

## 어노테이션 시스템

### 좌표계

```
┌────────────────────────────────────┐
│        DICOM 픽셀 좌표계            │
│  (0,0)──────────────────► X        │
│    │                               │
│    │    • (x, y)                   │
│    │    어노테이션 포인트            │
│    │                               │
│    ▼                               │
│    Y                               │
│                                    │
│         (columns-1, rows-1)        │
└────────────────────────────────────┘
```

### 좌표 변환

```typescript
// DICOM 좌표 → 화면 좌표
function dicomToScreen(
  dicomPoint: Point,
  viewport: Viewport,
  canvasSize: { width: number; height: number }
): Point {
  const { scale, panX, panY } = viewport.transform;
  const { windowCenter, windowWidth } = viewport.windowLevel;

  // 1. 스케일 적용
  let x = dicomPoint.x * scale;
  let y = dicomPoint.y * scale;

  // 2. 팬 적용
  x += panX;
  y += panY;

  // 3. 캔버스 중앙 정렬
  x += canvasSize.width / 2;
  y += canvasSize.height / 2;

  return { x, y };
}

// 화면 좌표 → DICOM 좌표
function screenToDicom(
  screenPoint: Point,
  viewport: Viewport,
  canvasSize: { width: number; height: number }
): Point {
  const { scale, panX, panY } = viewport.transform;

  let x = screenPoint.x - canvasSize.width / 2;
  let y = screenPoint.y - canvasSize.height / 2;

  x -= panX;
  y -= panY;

  x /= scale;
  y /= scale;

  return { x, y };
}
```

### SVG 렌더링

```tsx
// SVGOverlay 구조
<svg className="annotation-overlay" style={{ position: 'absolute', ... }}>
  {annotations.map(annotation => {
    switch (annotation.type) {
      case 'length':
        return <LengthShape key={annotation.id} annotation={annotation} />;
      case 'angle':
        return <AngleShape key={annotation.id} annotation={annotation} />;
      case 'point':
        return <PointShape key={annotation.id} annotation={annotation} />;
    }
  })}
</svg>
```

---

## 성능 최적화 전략

### 1. GPU 메모리 전략

```
Upload & Release 전략
─────────────────────
1. 필요할 때만 GPU에 업로드
2. 사용 후 즉시 해제
3. LRU 캐시로 재사용 최적화

┌─────────┐      ┌─────────┐      ┌─────────┐
│ CPU RAM │ ───► │   GPU   │ ───► │ Display │
│ (Frame) │      │(Texture)│      │         │
└─────────┘      └─────────┘      └─────────┘
     │                │
     │   Upload       │   Release
     └────────────────┘
```

### 2. 2D Array Texture

```
기존 방식 (프레임당 1 텍스처)
────────────────────────────
Frame 0 → Texture 0
Frame 1 → Texture 1
Frame 2 → Texture 2
...

→ 텍스처 전환 비용 높음

2D Array Texture 방식
────────────────────────────
All Frames → Single Array Texture

→ 레이어 인덱스만 변경하면 프레임 전환
→ 텍스처 바인딩 비용 없음
```

### 3. requestAnimationFrame 최적화

```typescript
// 렌더 스케줄러
class RenderScheduler {
  private pendingRender = false;

  scheduleRender() {
    if (this.pendingRender) return;

    this.pendingRender = true;
    requestAnimationFrame(() => {
      this.render();
      this.pendingRender = false;
    });
  }

  render() {
    // 모든 뷰포트 한 번에 렌더링
    for (const viewport of this.viewports) {
      viewport.render();
    }
  }
}
```

### 4. 하이브리드 렌더링

```typescript
// gl.scissor()로 캔버스 분할
for (const viewport of viewports) {
  const { x, y, width, height } = viewport.bounds;

  gl.scissor(x, y, width, height);
  gl.viewport(x, y, width, height);

  // 해당 영역만 렌더링
  viewport.render();
}
```

---

## 다음 단계

- [코딩 가이드](./coding-guide.md)로 코드 스타일을 확인하세요.
- [테스트 가이드](./testing.md)로 테스트 작성 방법을 배우세요.
