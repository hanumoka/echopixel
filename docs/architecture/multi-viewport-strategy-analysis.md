# EchoPixel 다중 뷰포트 전략 분석

> **문서 목적**: 다른 Claude 세션에 전달하여 아키텍처 결정의 맥락을 공유
> **작성일**: 2026-01-19
> **상태**: 분석 완료, 구현 전

---

## 1. 배경

### 1.1 프로젝트 목표
- 웹 브라우저에서 **16개 DICOM 심초음파 영상**을 동시에 **30fps 이상**으로 재생
- Cornerstone3D 대비 성능 개선 및 뷰포트 제한 극복
- npm 패키지로 오픈소스 배포

### 1.2 핵심 제약사항
- **WebGL 컨텍스트 제한**: 브라우저당 8-16개 (Chrome 16, Firefox 16, Mobile 8)
- **Canvas 크기 제한**: 최대 16,384px (Chrome)
- **GPU 메모리**: 컨텍스트당 2-4MB 오버헤드

---

## 2. Cornerstone3D vs EchoPixel 비교

### 2.1 아키텍처 비교

| 항목 | Cornerstone3D | EchoPixel |
|------|---------------|-----------|
| **렌더링 백본** | vtk.js (무거움) | 직접 WebGL2 (경량) |
| **텍스처 관리** | 3D Texture (볼륨 중심) | 2D Array Texture (프레임 중심) |
| **프레임 전환** | 텍스처 바인딩 가능 | uniform 변경만 (빠름) |
| **멀티 뷰포트** | Context Pool (7개 기본) | Single Canvas + Scissor |

### 2.2 Cornerstone3D의 두 가지 렌더링 엔진

#### TiledRenderingEngine (레거시)
```
[대형 Offscreen Canvas] → [drawImage 복사] → [개별 Onscreen Canvas]

문제점:
- Canvas 크기 16,384px 초과 시 시각적 아티팩트
- 복사 오버헤드
- Firefox에서 transferToImageBitmap 10x 느림
```

#### ContextPoolRenderingEngine (기본값)
```
[WebGL Context Pool (7개)] → [배치 렌더링] → [개별 Canvas]

개선점:
- Canvas 크기 제한 해결
- 더 나은 메모리 사용

한계:
- 여전히 컨텍스트 풀 제한
- 16개 뷰포트 시 오버헤드
```

### 2.3 EchoPixel의 차별화 포인트

1. **TEXTURE_2D_ARRAY 활용**: 프레임 전환 시 uniform만 변경
2. **Single Canvas + Scissor**: WebGL 컨텍스트 1개로 무제한 뷰포트
3. **드라이버 오버헤드 최소화**: 단일 rAF 루프
4. **vtk.js 의존성 제거**: 번들 크기 및 초기화 시간 단축

---

## 3. 다중 뷰포트 전략 분석

### 3.1 현재 EchoPixel 구현 (Phase 2)

#### Single Canvas 방식 (MultiViewport.tsx)
```
┌──────────────────────────────────────┐
│  Single Canvas (전체 영역)           │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐        │
│  │ V1 │ │ V2 │ │ V3 │ │ V4 │  ...   │
│  └────┘ └────┘ └────┘ └────┘        │
│  gl.scissor() + gl.viewport()로 분할 │
└──────────────────────────────────────┘
   WebGL Context: 1개

장점:
✅ WebGL 컨텍스트 1개 → 제한 우회
✅ 텍스처/버퍼 공유 → 메모리 효율
✅ 단일 rAF → 오버헤드 최소화

단점:
❌ DOM 이벤트 처리 복잡
❌ React 컴포넌트 모델과 부조화
❌ 드래그앤드롭, 컨텍스트 메뉴 구현 어려움
```

#### Multi Canvas 방식 (MultiCanvasGrid.tsx)
```
┌────┐ ┌────┐ ┌────┐ ┌────┐
│ C1 │ │ C2 │ │ C3 │ │ C4 │  ...
└────┘ └────┘ └────┘ └────┘
각각 독립된 WebGL Context

장점:
✅ React 컴포넌트 모델과 자연스러운 통합
✅ 개별 DOM 이벤트 처리 용이

치명적 단점:
❌ WebGL 컨텍스트 제한 (8-16개)
❌ 16개 뷰포트 시 Context Lost 발생
❌ 메모리 중복 (컨텍스트당 2-4MB)
```

### 3.2 Hybrid DOM-WebGL 아키텍처 (제안)

#### 개념
```
┌─────────────────────────────────────────────────────────────┐
│                    Z-Index Layer 1 (DOM)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 투명 Slot│ │ 투명 Slot│ │ 투명 Slot│ │ 투명 Slot│       │
│  │ (React)  │ │ (React)  │ │ (React)  │ │ (React)  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├─────────────────────────────────────────────────────────────┤
│                   Z-Index Layer 0 (WebGL)                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Single Full-Screen Canvas                  ││
│  │   getBoundingClientRect() → scissor/viewport 매핑       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

#### 좌표 동기화 메커니즘
```typescript
// DOM 좌표 → WebGL 좌표 변환
function domRectToWebGLViewport(rect: DOMRect, canvasHeight: number, dpr: number) {
  return {
    x: rect.left * dpr,
    y: (canvasHeight / dpr - rect.bottom) * dpr,  // Y축 반전
    width: rect.width * dpr,
    height: rect.height * dpr,
  };
}

// 동기화 트리거
- ResizeObserver: 슬롯 크기 변경 감지
- IntersectionObserver: 가시성 변경 감지
- requestAnimationFrame: 렌더링과 동기화
```

#### 장점
- ✅ WebGL 컨텍스트 1개로 16개+ 뷰포트 지원
- ✅ React 컴포넌트 모델과 통합
- ✅ 드래그앤드롭, 컨텍스트 메뉴 등 DOM 이벤트 활용
- ✅ CSS Grid/Flexbox로 반응형 레이아웃

---

## 4. 복잡한 레이아웃에서의 한계

### 4.1 실제 프로덕션 뷰어 레이아웃 (sonix-viviane, sado 참고)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [헤더 / 툴바]                                                           │
├────────────────────────────────────────────────┬─────────────────────────┤
│                                                │ ┌─────────────────────┐ │
│   메인 뷰포트 영역 (고정)                       │ │ 썸네일 패널         │ │
│   ┌──────────────┬──────────────┐              │ │ (내부 스크롤)       │ │
│   │  Viewport 1  │  Viewport 2  │              │ ├─────────────────────┤ │
│   ├──────────────┼──────────────┤              │ │ ┌───┐ A4C          │ │
│   │  Viewport 3  │  Viewport 4  │              │ │ │ 1 │ 30 frames    │ │
│   └──────────────┴──────────────┘              │ │ └───┘              │ │
│                                                │ │ ┌───┐ A2C ← 스크롤 │ │
├────────────────────────────────────────────────┤ │ │ 2 │              │ │
│  [재생 컨트롤 / 타임라인]                        │ │ └───┘              │ │
├────────────────────────────────────────────────┤ │ ...                 │ │
│ ┌────────────────────────────────────────────┐ │ └─────────────────────┘ │
│ │ Strain 결과 패널 (접이식)                  │ ├─────────────────────────┤
│ │ Bulls-eye, GLS, FAC 등                    │ │ 정보 패널 (스크롤)      │
│ └────────────────────────────────────────────┘ │                         │
└────────────────────────────────────────────────┴─────────────────────────┘
```

### 4.2 핵심 문제점

#### 문제 1: 다중 스크롤 컨텍스트
```
스크롤 영역이 여러 개:
- 메인 페이지 스크롤 (있을 수도 없을 수도)
- 썸네일 패널 (내부 스크롤)
- 정보 패널 (내부 스크롤)
- Strain 결과 패널 (접이식)

Single Canvas로 모든 영역을 커버하려면:
→ 각 스크롤 컨텍스트마다 scroll 이벤트 추적 필요
→ getBoundingClientRect() 해석이 복잡해짐
```

#### 문제 2: 스크롤 동기화 타이밍
```
[스크롤 발생] → [브라우저 네이티브 처리] → [DOM 이동]
                                              ↓
                                       [다음 rAF 대기]
                                              ↓
[WebGL 렌더링] ← [getBoundingClientRect()] ← [rAF 콜백]

문제: 스크롤은 즉시 발생하지만, WebGL은 다음 rAF까지 대기
     → 빠른 스크롤 시 "드리프트" 발생 (WebGL이 DOM과 불일치)
```

#### 문제 3: 스크롤 내부 WebGL 요소
```
썸네일 패널 내부에 WebGL 요소가 있으면:
1. 스크롤 시 WebGL viewport 위치 갱신 필요
2. 스크롤 영역 밖으로 나가면 렌더링 제외 필요
3. CSS overflow: hidden vs WebGL scissor 충돌
4. 드리프트 발생 가능성 높음
```

### 4.3 시나리오별 Single Canvas 적합성

| 시나리오 | 적합성 | 난이도 | 리스크 |
|----------|--------|--------|--------|
| **고정 그리드 레이아웃** (2x2, 4x4) | ✅ 매우 적합 | 낮음 | 낮음 |
| **리사이즈 가능한 패널** | ⚠️ 가능하나 주의 | 중간 | 중간 |
| **단일 스크롤 (페이지 전체)** | ⚠️ 추가 작업 필요 | 중간 | 중간 |
| **다중 스크롤 컨텍스트** | ❌ 매우 어려움 | 높음 | 높음 |
| **스크롤 내부 WebGL 요소** | ❌ 권장하지 않음 | 매우 높음 | 매우 높음 |

---

## 5. 최종 권장 아키텍처

### 5.1 계층화된 렌더링 전략 (Tiered Rendering)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Tier 1: 메인 뷰포트 (고정 영역)                                          │
│ → Single Canvas + Scissor (EchoPixel 핵심 기술)                         │
│ → WebGL 컨텍스트 1개로 16개 뷰포트 지원                                  │
│ → 최고 성능, 30fps+ 보장                                                │
├─────────────────────────────────────────────────────────────────────────┤
│ Tier 2: 사이드바 썸네일 (스크롤 영역)                                    │
│ → Option A: <img> + 서버 렌더링 (가장 단순, 권장)                        │
│ → Option B: Canvas 2D (클라이언트 렌더링)                               │
│ → Option C: 가상화 + 제한된 WebGL 컨텍스트 풀 (2-3개)                    │
│ → Option D: OffscreenCanvas → ImageBitmap (Worker)                     │
├─────────────────────────────────────────────────────────────────────────┤
│ Tier 3: 차트/그래프 (비 DICOM)                                          │
│ → Canvas 2D 또는 SVG                                                   │
│ → Chart.js, D3.js 등 별도 라이브러리                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 구체적인 구조

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           EchoPixel 아키텍처 v2                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌────────────────────────────────────┐  ┌───────────────────────────┐ │
│   │       Main Viewport Area           │  │    Sidebar (Scrollable)   │ │
│   │       (position: relative)         │  │                           │ │
│   │                                    │  │  ┌─────────────────────┐  │ │
│   │   ┌────────────────────────────┐   │  │  │ Thumbnail List      │  │ │
│   │   │   Single WebGL Canvas      │   │  │  │ (Virtualized)       │  │ │
│   │   │   (position: absolute)     │   │  │  │                     │  │ │
│   │   │                            │   │  │  │ ┌───┐ ← <img> 또는  │  │ │
│   │   │   ┌──────┐ ┌──────┐       │   │  │  │ └───┘   Canvas 2D   │  │ │
│   │   │   │ VP1  │ │ VP2  │       │   │  │  │ ┌───┐               │  │ │
│   │   │   ├──────┼──────┤       │   │  │  │ └───┘               │  │ │
│   │   │   │ VP3  │ │ VP4  │       │   │  │  │ ...                  │  │ │
│   │   │   └──────┘ └──────┘       │   │  │  └─────────────────────┘  │ │
│   │   │                            │   │  │                           │ │
│   │   │   16개 뷰포트              │   │  │  ┌─────────────────────┐  │ │
│   │   │   WebGL Context: 1개       │   │  │  │ Info Panel (DOM)    │  │ │
│   │   │   30fps+ 보장              │   │  │  └─────────────────────┘  │ │
│   │   └────────────────────────────┘   │  │                           │ │
│   │                                    │  │  WebGL Context: 0개      │ │
│   │   ┌────────────────────────────┐   │  │  (스크롤 문제 없음)      │ │
│   │   │ DOM Overlay Layer          │   │  │                           │ │
│   │   │ 프레임 카운터, 버튼 등     │   │  └───────────────────────────┘ │
│   │   └────────────────────────────┘   │                                │
│   └────────────────────────────────────┘                                │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│   Controls / Timeline (DOM)                                              │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.3 핵심 원칙

1. **메인 뷰포트**: Single Canvas + Scissor (고정 영역, 스크롤 없음)
2. **사이드바 썸네일**: img 태그 또는 Canvas 2D (스크롤 친화적)
3. **영역 분리**: 스크롤 영역에는 WebGL Single Canvas 사용 안 함
4. **WebGL 컨텍스트**: 핵심 영역에 1개만 사용

---

## 6. 구현 시 고려사항

### 6.1 Hybrid DOM-WebGL (메인 뷰포트)

```typescript
// HybridViewportManager 핵심 구조
class HybridViewportManager {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;  // position: fixed 또는 absolute
  private slots: Map<string, HTMLElement>;  // DOM placeholders
  private viewportBounds: Map<string, WebGLViewport>;

  // DOM 슬롯 등록
  registerSlot(id: string, element: HTMLElement): void;

  // 좌표 동기화
  syncSlot(id: string): void {
    const rect = element.getBoundingClientRect();
    const bounds = this.domRectToWebGL(rect);
    this.viewportBounds.set(id, bounds);
  }

  // 렌더링
  render(): void {
    gl.enable(gl.SCISSOR_TEST);
    for (const [id, bounds] of this.viewportBounds) {
      gl.scissor(bounds.x, bounds.y, bounds.width, bounds.height);
      gl.viewport(bounds.x, bounds.y, bounds.width, bounds.height);
      this.renderViewport(id);
    }
    gl.disable(gl.SCISSOR_TEST);
  }
}
```

### 6.2 썸네일 옵션별 구현

#### Option A: img + 서버 렌더링 (권장)
```typescript
// 서버 API
GET /api/dicom/{sopInstanceUid}/thumbnail?size=128

// React 컴포넌트
function Thumbnail({ sopInstanceUid }) {
  return (
    <img
      src={`/api/dicom/${sopInstanceUid}/thumbnail?size=128`}
      loading="lazy"
    />
  );
}
```

#### Option B: Canvas 2D
```typescript
// 가상화된 목록에서 보이는 썸네일만 렌더링
function ThumbnailCanvas({ imageBitmap }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    ctx?.drawImage(imageBitmap, 0, 0, 128, 128);
  }, [imageBitmap]);

  return <canvas ref={canvasRef} width={128} height={128} />;
}
```

### 6.3 기존 코드 재사용

| 기존 모듈 | 재사용 방법 |
|----------|------------|
| `TextureManager` | 그대로 사용 (2D Array Texture) |
| `ArrayTextureRenderer` | 그대로 사용 |
| `FrameSyncEngine` | 그대로 사용 |
| `ViewportManager` | `HybridViewportManager`로 대체 |
| `RenderScheduler` | `HybridRenderScheduler`로 대체 |

---

## 7. 예상 이슈 및 해결책

| 이슈 | 원인 | 해결책 |
|------|------|--------|
| **스크롤 드리프트** | rAF 타이밍 불일치 | 메인 뷰포트는 고정, 스크롤 영역은 별도 전략 |
| **리사이즈 깜빡임** | 애니메이션 중 불일치 | ResizeObserver + rAF 동기화 |
| **메모리 폭발** | 썸네일 + 메인 동시 로딩 | Tier 분리, 가상화 적용 |
| **좌표 계산 복잡** | 중첩 스크롤 | 영역 분리로 복잡성 제거 |

---

## 8. 참고 자료

### 외부 문서
- [WebGL Fundamentals - Multiple Views](https://webglfundamentals.org/webgl/lessons/webgl-multiple-views.html)
- [Lusion WebGL Scroll Sync](https://github.com/lusionltd/WebGL-Scroll-Sync)
- [Cornerstone3D Rendering Engine](https://www.cornerstonejs.org/docs/concepts/cornerstone-core/renderingengine/)
- [deck.gl Multi-Viewport RFC](https://github.com/visgl/deck.gl/blob/master/dev-docs/RFCs/v5.0/multi-viewport-rfc.md)

### 프로젝트 내부 문서
- `docs/research/sonix-viviane-analysis.md` - 실제 프로덕션 뷰어 분석
- `docs/research/sado-poc-analysis.md` - SADO POC 분석
- `docs/research/cornerstone3d-analysis.md` - Cornerstone3D 분석

---

## 9. 결론

### 핵심 결정사항

1. **메인 뷰포트 (16개)**: Single Canvas + Scissor 유지
   - 이유: 최고 성능, WebGL 컨텍스트 1개로 제한 우회

2. **스크롤 영역 (썸네일 등)**: WebGL Single Canvas 사용 안 함
   - 이유: 스크롤 드리프트 문제, 복잡성 증가

3. **영역별 렌더링 전략 분리**
   - Tier 1 (메인): WebGL Single Canvas
   - Tier 2 (썸네일): img 또는 Canvas 2D
   - Tier 3 (차트): Canvas 2D / SVG

### 다음 단계

1. `HybridViewportManager` 구현 (메인 뷰포트용)
2. 썸네일 서버 API 또는 Canvas 2D 구현
3. 기존 `MultiViewport` 컴포넌트를 Hybrid 방식으로 마이그레이션
4. 복잡한 레이아웃 테스트 (sonix-viviane 참고)
