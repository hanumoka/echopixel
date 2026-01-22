# 멀티 뷰포트 아키텍처

> **목적**: EchoPixel의 다중 뷰포트 렌더링 전략, Hybrid DOM-WebGL 구조, Tiered Rendering을 설명합니다.

---

## 목차

1. [아키텍처 개요](#1-아키텍처-개요)
2. [렌더링 전략 비교](#2-렌더링-전략-비교)
3. [Hybrid DOM-WebGL 구조](#3-hybrid-dom-webgl-구조)
4. [Tiered Rendering](#4-tiered-rendering)
5. [프레임 동기화](#5-프레임-동기화)
6. [스크롤 및 레이아웃](#6-스크롤-및-레이아웃)

---

## 1. 아키텍처 개요

### 1.1 문제 정의

**Stress Echo 시나리오**:
- 16개 이상의 심초음파 영상을 동시에 표시
- 모든 뷰포트가 30fps로 동기화 재생
- 브라우저의 WebGL Context 제한 (8-16개)

### 1.2 EchoPixel 솔루션

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EchoPixel 멀티 뷰포트 아키텍처                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      React Layer                               │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │  HybridMultiViewport                                     │  │  │
│  │  │  - DOM 기반 레이아웃 (CSS Grid/Flexbox)                  │  │  │
│  │  │  - 각 뷰포트 슬롯이 ResizeObserver로 크기 감지          │  │  │
│  │  │  - IntersectionObserver로 가시성 관리                   │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Single WebGL Canvas                         │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │  ┌─────┬─────┬─────┬─────┐                              │  │  │
│  │  │  │ VP1 │ VP2 │ VP3 │ VP4 │  ← Scissor/Viewport 분할     │  │  │
│  │  │  ├─────┼─────┼─────┼─────┤                              │  │  │
│  │  │  │ VP5 │ VP6 │ VP7 │ VP8 │                              │  │  │
│  │  │  └─────┴─────┴─────┴─────┘                              │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 핵심 구성요소

| 구성요소 | 역할 |
|----------|------|
| **HybridMultiViewport** | React 컴포넌트, 레이아웃 관리 |
| **HybridViewportSlot** | 개별 뷰포트 슬롯 (DOM 영역) |
| **RenderScheduler** | 단일 렌더 루프, 뷰포트별 렌더링 조율 |
| **Single Canvas** | 전체 화면 크기, Scissor로 영역 분할 |

---

## 2. 렌더링 전략 비교

### 2.1 옵션 분석

| 전략 | 장점 | 단점 | 적합 시나리오 |
|------|------|------|---------------|
| **Multi Canvas** | 구현 단순, 격리 | Context 제한 (8-16) | 소수 뷰포트 |
| **Single Canvas + Scissor** | 무제한 뷰포트 | 좌표 관리 복잡 | 고정 레이아웃 |
| **Hybrid DOM-WebGL** | 유연한 레이아웃 + 무제한 | 동기화 복잡 | **스크롤 레이아웃** |

### 2.2 EchoPixel 선택: Hybrid DOM-WebGL

**이유**:
- DOM으로 레이아웃 → CSS의 강력한 레이아웃 기능 활용
- WebGL로 렌더링 → 단일 Context로 무제한 뷰포트
- 스크롤 지원 → IntersectionObserver로 가시성 기반 최적화

---

## 3. Hybrid DOM-WebGL 구조

### 3.1 계층 구조

```
┌─────────────────────────────────────────────────────────────────────┐
│                       DOM Layer (레이아웃)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  .viewport-container (CSS Grid)                              │    │
│  │  ┌─────────┬─────────┬─────────┬─────────┐                  │    │
│  │  │ .slot-1 │ .slot-2 │ .slot-3 │ .slot-4 │                  │    │
│  │  │ (DOM)   │ (DOM)   │ (DOM)   │ (DOM)   │                  │    │
│  │  ├─────────┼─────────┼─────────┼─────────┤                  │    │
│  │  │ .slot-5 │ .slot-6 │ .slot-7 │ .slot-8 │                  │    │
│  │  │ (DOM)   │ (DOM)   │ (DOM)   │ (DOM)   │                  │    │
│  │  └─────────┴─────────┴─────────┴─────────┘                  │    │
│  │                                                              │    │
│  │  각 slot은 투명, position: relative                         │    │
│  │  ResizeObserver가 크기 변화 감지                            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  WebGL Canvas (position: absolute, top: 0, left: 0)          │    │
│  │                                                              │    │
│  │  - 전체 컨테이너 크기                                        │    │
│  │  - z-index: -1 (DOM 뒤에 배치)                              │    │
│  │  - 각 slot 위치에 맞춰 Scissor/Viewport 설정                │    │
│  │  - 단일 Context로 모든 뷰포트 렌더링                        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  SVG Overlay (position: absolute, pointer-events: none)      │    │
│  │                                                              │    │
│  │  - 어노테이션, 측정 표시                                     │    │
│  │  - 각 slot에 대응하는 SVG 그룹                              │    │
│  │  - z-index: 1 (WebGL 위에 배치)                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 좌표 동기화

DOM 좌표와 WebGL 좌표의 변환:

```typescript
interface ViewportBounds {
  x: number;      // WebGL X (좌측 기준)
  y: number;      // WebGL Y (하단 기준)
  width: number;
  height: number;
}

/**
 * DOM 영역 → WebGL Viewport 좌표 변환
 *
 * 핵심: Y축 반전 필요
 * - DOM: 좌상단 (0,0), 아래로 증가
 * - WebGL: 좌하단 (0,0), 위로 증가
 */
function domRectToWebGLViewport(
  domRect: DOMRect,
  containerRect: DOMRect,
  canvasHeight: number,
  dpr: number = window.devicePixelRatio
): ViewportBounds {
  // DOM 상대 좌표 (컨테이너 기준)
  const relativeX = domRect.x - containerRect.x;
  const relativeY = domRect.y - containerRect.y;

  // DPR 적용
  const x = Math.round(relativeX * dpr);
  const width = Math.round(domRect.width * dpr);
  const height = Math.round(domRect.height * dpr);

  // Y축 반전: 하단 기준으로 변환
  const y = canvasHeight - Math.round((relativeY + domRect.height) * dpr);

  return { x, y, width, height };
}
```

### 3.3 HybridViewportManager

```typescript
interface ViewportSlot {
  id: string;
  element: HTMLElement;
  bounds: ViewportBounds;
  isVisible: boolean;
  series?: DicomSeries;
}

class HybridViewportManager {
  private slots: Map<string, ViewportSlot> = new Map();
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;

  constructor(canvas: HTMLCanvasElement, container: HTMLElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2')!;

    // 크기 변화 감지
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const slotId = (entry.target as HTMLElement).dataset.slotId!;
        this.updateSlotBounds(slotId);
      }
    });

    // 가시성 감지
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const slotId = (entry.target as HTMLElement).dataset.slotId!;
          this.updateSlotVisibility(slotId, entry.isIntersecting);
        }
      },
      { threshold: [0, 0.1, 0.5, 1.0] }
    );
  }

  /**
   * 뷰포트 슬롯 등록
   */
  registerSlot(slotId: string, element: HTMLElement): void {
    const bounds = this.calculateBounds(element);

    this.slots.set(slotId, {
      id: slotId,
      element,
      bounds,
      isVisible: true,
    });

    element.dataset.slotId = slotId;
    this.resizeObserver.observe(element);
    this.intersectionObserver.observe(element);
  }

  /**
   * 모든 뷰포트 렌더링
   */
  renderAllViewports(): void {
    const gl = this.gl;

    gl.enable(gl.SCISSOR_TEST);

    for (const slot of this.slots.values()) {
      if (!slot.isVisible || !slot.series) continue;

      const { x, y, width, height } = slot.bounds;

      // Scissor: 렌더링 영역 제한
      gl.scissor(x, y, width, height);

      // Viewport: 좌표 변환
      gl.viewport(x, y, width, height);

      // 해당 뷰포트 렌더링
      this.renderViewport(slot);
    }

    gl.disable(gl.SCISSOR_TEST);
  }

  private calculateBounds(element: HTMLElement): ViewportBounds {
    const domRect = element.getBoundingClientRect();
    const containerRect = this.canvas.parentElement!.getBoundingClientRect();
    const canvasHeight = this.canvas.height;

    return domRectToWebGLViewport(domRect, containerRect, canvasHeight);
  }

  private updateSlotBounds(slotId: string): void {
    const slot = this.slots.get(slotId);
    if (slot) {
      slot.bounds = this.calculateBounds(slot.element);
    }
  }

  private updateSlotVisibility(slotId: string, isVisible: boolean): void {
    const slot = this.slots.get(slotId);
    if (slot) {
      slot.isVisible = isVisible;
    }
  }
}
```

---

## 4. Tiered Rendering

### 4.1 개념

콘텐츠 유형에 따라 최적의 렌더링 방식 선택:

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Tiered Rendering                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Tier 1: WebGL (Primary Viewports)                           │    │
│  │  ───────────────────────────────────────────────────────────│    │
│  │  - 메인 DICOM 뷰포트 (Cine 재생)                             │    │
│  │  - 고해상도, 실시간 렌더링                                   │    │
│  │  - Single Canvas + Scissor                                   │    │
│  │  - GPU 가속 W/L 조정                                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Tier 2: <img> / Canvas 2D (Thumbnails)                      │    │
│  │  ───────────────────────────────────────────────────────────│    │
│  │  - 썸네일, 미리보기                                          │    │
│  │  - 저해상도 (64-256px)                                       │    │
│  │  - 정적 이미지, 가끔 업데이트                                │    │
│  │  - 브라우저 네이티브 최적화 활용                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Tier 3: SVG / HTML (Overlays)                               │    │
│  │  ───────────────────────────────────────────────────────────│    │
│  │  - 어노테이션, 측정 결과                                     │    │
│  │  - 텍스트 레이블, 아이콘                                     │    │
│  │  - 차트 (EF 그래프, Strain 커브)                             │    │
│  │  - 벡터 기반, 해상도 독립적                                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Tier별 구현

**Tier 1: WebGL 뷰포트**

```typescript
// 고성능 DICOM 렌더링
interface Tier1Viewport {
  type: 'webgl';
  slotId: string;
  textureManager: TextureManager;
  quadRenderer: QuadRenderer;
  series: DicomSeries;
  currentFrame: number;
  isPlaying: boolean;
}

function renderTier1Viewport(vp: Tier1Viewport, bounds: ViewportBounds): void {
  gl.scissor(bounds.x, bounds.y, bounds.width, bounds.height);
  gl.viewport(bounds.x, bounds.y, bounds.width, bounds.height);

  vp.textureManager.bind(0);
  vp.quadRenderer.render(0, vp.windowLevel);
}
```

**Tier 2: 썸네일**

```typescript
// 가벼운 썸네일 렌더링
interface Tier2Thumbnail {
  type: 'thumbnail';
  slotId: string;
  imageUrl: string;  // 저해상도 JPEG URL
  element: HTMLImageElement;
}

function renderTier2Thumbnail(thumb: Tier2Thumbnail): void {
  // 브라우저가 <img> 렌더링 최적화
  if (thumb.element.src !== thumb.imageUrl) {
    thumb.element.src = thumb.imageUrl;
  }
}
```

**Tier 3: SVG 오버레이**

```tsx
// 어노테이션 SVG 오버레이
function AnnotationOverlay({ annotations, viewportBounds }: Props) {
  return (
    <svg
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        ...viewportBounds,
      }}
    >
      {annotations.map((ann) => (
        <AnnotationRenderer key={ann.id} annotation={ann} />
      ))}
    </svg>
  );
}
```

### 4.3 Tier 선택 기준

| 기준 | Tier 1 (WebGL) | Tier 2 (img) | Tier 3 (SVG) |
|------|----------------|--------------|--------------|
| 콘텐츠 | DICOM Cine | 썸네일 | 어노테이션 |
| 업데이트 | 30fps+ | 가끔 | 사용자 조작 시 |
| 해상도 | 원본 | 64-256px | 벡터 |
| 상호작용 | W/L, Pan, Zoom | 클릭 선택 | 편집 |

---

## 5. 프레임 동기화

### 5.1 동기화 유형

| 유형 | 설명 | 사용 사례 |
|------|------|----------|
| **Frame Ratio** | 비율 기반 매핑 | 다른 프레임 수 |
| **Time-based** | 타임스탬프 기준 | 다른 FPS |
| **R-wave** | 심장 박동 기준 | ECG 동기화 |

### 5.2 Frame Ratio 동기화

```typescript
/**
 * 프레임 비율 기반 동기화
 *
 * 문제: 시리즈마다 프레임 수가 다름
 * 예) Master: 47프레임, Slave: 94프레임
 *
 * 해결: 비율로 매핑
 * Master frame 10 → Slave frame = (10/47) × 94 ≈ 20
 */
class FrameSyncEngine {
  private masterViewport: string | null = null;
  private syncGroup: Set<string> = new Set();

  /**
   * 동기화 그룹 설정
   */
  createSyncGroup(masterId: string, slaveIds: string[]): void {
    this.masterViewport = masterId;
    this.syncGroup.clear();
    this.syncGroup.add(masterId);
    slaveIds.forEach(id => this.syncGroup.add(id));
  }

  /**
   * Master 프레임 변경 시 Slave 동기화
   */
  syncFromMaster(masterFrame: number): void {
    if (!this.masterViewport) return;

    const master = this.getViewport(this.masterViewport);
    if (!master) return;

    for (const slaveId of this.syncGroup) {
      if (slaveId === this.masterViewport) continue;

      const slave = this.getViewport(slaveId);
      if (!slave) continue;

      const syncedFrame = this.calculateSyncedFrame(
        masterFrame,
        master.totalFrames,
        slave.totalFrames
      );

      slave.setCurrentFrame(syncedFrame);
    }
  }

  /**
   * 동기화 프레임 계산
   */
  private calculateSyncedFrame(
    masterFrame: number,
    masterTotal: number,
    slaveTotal: number
  ): number {
    if (masterTotal <= 0 || slaveTotal <= 0) return 0;

    const ratio = masterFrame / masterTotal;
    const slaveFrame = Math.floor(ratio * slaveTotal);

    return Math.max(0, Math.min(slaveFrame, slaveTotal - 1));
  }
}
```

### 5.3 FPS 정규화 동기화

```typescript
/**
 * FPS 정규화 동기화
 *
 * 문제: 시리즈마다 FPS가 다름
 * 예) Series A: 30fps, Series B: 60fps
 *
 * 해결: 정규화된 시간 기준 동기화
 */
interface NormalizedSyncConfig {
  targetFps: number;  // 통일된 재생 FPS
  syncMode: 'frame' | 'time';
}

class NormalizedSyncEngine extends FrameSyncEngine {
  private config: NormalizedSyncConfig;

  /**
   * 시간 기반 프레임 계산
   */
  getFrameAtTime(seriesId: string, timeMs: number): number {
    const series = this.getSeries(seriesId);
    if (!series) return 0;

    // 시리즈 전체 재생 시간
    const totalDuration = series.frameCount / series.fps * 1000;

    // 정규화된 시간 → 프레임
    const normalizedTime = timeMs % totalDuration;
    const frame = Math.floor(normalizedTime / 1000 * series.fps);

    return frame % series.frameCount;
  }

  /**
   * 동기화된 렌더 루프
   */
  tick(timestamp: number): void {
    const elapsedMs = timestamp - this.startTime;

    for (const viewportId of this.syncGroup) {
      const frame = this.getFrameAtTime(viewportId, elapsedMs);
      this.getViewport(viewportId)?.setCurrentFrame(frame);
    }
  }
}
```

---

## 6. 스크롤 및 레이아웃

### 6.1 스크롤 드리프트 문제

```
┌─────────────────────────────────────────────────────────────────────┐
│                       스크롤 드리프트 문제                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  스크롤 시 DOM 요소와 WebGL 렌더링 영역이 일시적으로 어긋남:         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  스크롤 전                     스크롤 중 (드리프트)          │    │
│  │  ┌─────────────────────┐      ┌─────────────────────┐       │    │
│  │  │ DOM  │ WebGL │      │      │ DOM  │      │      │       │    │
│  │  │ Slot │ 영역  │ ✓    │      │ Slot │ WebGL│ ✗    │       │    │
│  │  │      │       │ 일치  │      │      │ 영역 │ 불일치│       │    │
│  │  └─────────────────────┘      └─────────────────────┘       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  원인:                                                              │
│  1. requestAnimationFrame과 스크롤 이벤트 타이밍 차이              │
│  2. getBoundingClientRect() 호출 비용                              │
│  3. 레이아웃 재계산 지연                                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 해결 전략

**전략 1: Passive 스크롤 + RAF 동기화**

```typescript
class ScrollSyncManager {
  private isScrolling = false;
  private scrollRAF: number | null = null;

  constructor(container: HTMLElement) {
    container.addEventListener('scroll', this.handleScroll, { passive: true });
  }

  private handleScroll = (): void => {
    if (!this.isScrolling) {
      this.isScrolling = true;
      this.scheduleUpdate();
    }
  };

  private scheduleUpdate(): void {
    if (this.scrollRAF) return;

    this.scrollRAF = requestAnimationFrame(() => {
      // RAF 내에서 좌표 업데이트
      this.updateAllViewportBounds();
      this.renderAllViewports();

      this.scrollRAF = null;

      // 스크롤 계속 중이면 다음 프레임도 예약
      if (this.isScrolling) {
        this.isScrolling = false;
        // 다음 스크롤 이벤트 대기
      }
    });
  }
}
```

**전략 2: CSS contain 활용**

```css
.viewport-container {
  /* 레이아웃 격리 */
  contain: strict;

  /* GPU 가속 힌트 */
  will-change: scroll-position;
}

.viewport-slot {
  /* 페인트 격리 */
  contain: paint;
}
```

**전략 3: 스크롤 중 렌더링 품질 저하**

```typescript
class AdaptiveQualityManager {
  private isScrolling = false;
  private scrollEndTimeout: number | null = null;

  onScrollStart(): void {
    this.isScrolling = true;

    // 스크롤 중: 저품질 렌더링
    this.setRenderQuality('low');
  }

  onScrollEnd(): void {
    // 스크롤 종료 후 200ms 대기
    if (this.scrollEndTimeout) {
      clearTimeout(this.scrollEndTimeout);
    }

    this.scrollEndTimeout = window.setTimeout(() => {
      this.isScrolling = false;

      // 고품질 렌더링 복원
      this.setRenderQuality('high');

      // 좌표 정확히 재계산
      this.updateAllViewportBounds();
    }, 200);
  }
}
```

### 6.3 반응형 그리드 레이아웃

```typescript
interface GridConfig {
  breakpoints: {
    desktop: number;   // ≥1200px
    tablet: number;    // ≥768px
    mobile: number;    // <768px
  };
  layouts: {
    desktop: { cols: number; rows: number };
    tablet: { cols: number; rows: number };
    mobile: { cols: number; rows: number };
  };
}

const defaultGridConfig: GridConfig = {
  breakpoints: {
    desktop: 1200,
    tablet: 768,
    mobile: 0,
  },
  layouts: {
    desktop: { cols: 4, rows: 4 },  // 16 뷰포트
    tablet: { cols: 3, rows: 3 },   // 9 뷰포트
    mobile: { cols: 2, rows: 2 },   // 4 뷰포트
  },
};

function getGridLayout(width: number, config: GridConfig): { cols: number; rows: number } {
  if (width >= config.breakpoints.desktop) {
    return config.layouts.desktop;
  } else if (width >= config.breakpoints.tablet) {
    return config.layouts.tablet;
  } else {
    return config.layouts.mobile;
  }
}
```

**CSS Grid 기반 레이아웃**:

```tsx
function HybridViewportGrid({ viewportCount, containerWidth }: Props) {
  const { cols, rows } = getGridLayout(containerWidth, defaultGridConfig);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: '4px',
        width: '100%',
        height: '100%',
      }}
    >
      {Array.from({ length: viewportCount }).map((_, i) => (
        <HybridViewportSlot key={i} slotId={`slot-${i}`} />
      ))}
    </div>
  );
}
```

---

## 관련 문서

- [렌더링 파이프라인](./rendering-pipeline.md)
- [성능 최적화](./performance-optimization.md)
- [메모리 관리](./memory-management.md)
- [멀티뷰포트 전략 분석](/docs/architecture/multi-viewport-strategy-analysis.md)
