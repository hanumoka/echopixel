# 멀티 뷰포트 아키텍처

> **대상 독자**: WebGL과 React에 익숙하지 않은 주니어 개발자
> **목표**: EchoPixel이 16개 이상의 DICOM 영상을 동시에 렌더링하는 방법 이해

---

## 목차

1. [왜 멀티 뷰포트가 어려운가?](#1-왜-멀티-뷰포트가-어려운가)
2. [WebGL Context란?](#2-webgl-context란)
3. [EchoPixel의 해결책: Hybrid DOM-WebGL](#3-echopixel의-해결책-hybrid-dom-webgl)
4. [핵심 기술: Scissor Test](#4-핵심-기술-scissor-test)
5. [좌표 시스템 이해하기](#5-좌표-시스템-이해하기)
6. [Tiered Rendering 전략](#6-tiered-rendering-전략)
7. [프레임 동기화](#7-프레임-동기화)
8. [흔한 문제와 해결책](#8-흔한-문제와-해결책)
9. [주요 컴포넌트 가이드](#9-주요-컴포넌트-가이드)
10. [학습 포인트 정리](#10-학습-포인트-정리)

---

## 1. 왜 멀티 뷰포트가 어려운가?

### 문제 상황

스트레스 에코(Stress Echo) 검사에서는 운동 전/후의 심장을 비교하기 위해 **16개의 영상을 동시에** 봐야 합니다.

```
┌────────────────────────────────────────────────────────────┐
│  스트레스 에코 화면 레이아웃 (4x4 = 16개 뷰포트)             │
├───────────┬───────────┬───────────┬───────────┐            │
│  REST     │  REST     │  STRESS   │  STRESS   │            │
│  A4C      │  A2C      │  A4C      │  A2C      │            │
├───────────┼───────────┼───────────┼───────────┤            │
│  REST     │  REST     │  STRESS   │  STRESS   │            │
│  PLAX     │  PSAX     │  PLAX     │  PSAX     │            │
├───────────┼───────────┼───────────┼───────────┤            │
│  ...      │  ...      │  ...      │  ...      │            │
└───────────┴───────────┴───────────┴───────────┴────────────┘

각 뷰포트가 30fps로 재생 = 16 × 30 = 초당 480프레임 렌더링!
```

### 브라우저의 WebGL Context 제한

문제는 **브라우저가 WebGL Context 개수를 제한**한다는 것입니다:

| 브라우저 | WebGL Context 제한 |
|----------|-------------------|
| Chrome (데스크톱) | 16개 |
| Firefox | 16개 |
| Safari | 8-16개 |
| 모바일 브라우저 | **4-8개** |

> **중요**: 각 `<canvas>` 요소마다 별도의 WebGL Context가 필요합니다.
> 16개 뷰포트 × 1개 Context = 16개 → 모바일에서는 **불가능**!

### Cornerstone3D의 접근법과 한계

기존 DICOM 뷰어 라이브러리인 Cornerstone3D는 두 가지 방식을 시도했습니다:

```
방법 1: Context Pool (7개 Context 공유)
┌──────────────────────────────────────────────────────┐
│  [Context 1] [Context 2] [Context 3] ... [Context 7] │
│       ↓           ↓           ↓             ↓        │
│   Viewport    Viewport    Viewport      Viewport     │
│   1, 8, 15    2, 9, 16    3, 10         7, 14        │
└──────────────────────────────────────────────────────┘
문제: Context 전환 오버헤드, 16개 뷰포트에서 성능 저하

방법 2: Tiled Canvas (하나의 큰 캔버스)
┌─────────────────────────────────────┐
│  하나의 거대한 OffscreenCanvas       │
│  (예: 8000 × 6000 pixels)           │
│                                     │
│  → 각 영역을 작은 Canvas로 복사      │
└─────────────────────────────────────┘
문제: Canvas 크기 제한(16,384px), 복사 오버헤드
```

---

## 2. WebGL Context란?

### 기본 개념

WebGL Context는 GPU와 통신하기 위한 **인터페이스**입니다. JavaScript에서 GPU에 명령을 보내려면 이 Context가 필요합니다.

```typescript
// Canvas 요소 생성
const canvas = document.createElement('canvas');

// WebGL2 Context 획득
const gl = canvas.getContext('webgl2');

// 이제 gl을 통해 GPU 명령을 보낼 수 있음
gl.clearColor(0, 0, 0, 1);  // 배경색을 검정으로
gl.clear(gl.COLOR_BUFFER_BIT);  // 화면 지우기
```

### 왜 Context가 제한되는가?

각 WebGL Context는 다음을 포함합니다:

```
┌─────────────────────────────────────────────────────────┐
│  WebGL Context 1개당 필요한 리소스                        │
├─────────────────────────────────────────────────────────┤
│  • GPU 메모리: 2-4MB (버퍼, 상태 저장)                    │
│  • GPU 드라이버 리소스                                    │
│  • JavaScript ↔ GPU 통신 채널                            │
│  • 셰이더 프로그램 저장 공간                              │
└─────────────────────────────────────────────────────────┘

16개 Context = 최소 32-64MB GPU 오버헤드 + 드라이버 부하
```

> **참고**: [WebGL 사양](https://www.khronos.org/registry/webgl/specs/latest/1.0/)에서는 "브라우저가 리소스 관리를 위해 Context 수를 제한할 수 있다"고 명시합니다.

---

## 3. EchoPixel의 해결책: Hybrid DOM-WebGL

### 핵심 아이디어

EchoPixel은 **단 1개의 WebGL Context**로 모든 뷰포트를 렌더링합니다.

```
기존 방식 (각 뷰포트마다 Canvas):
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Canvas 1│ │Canvas 2│ │Canvas 3│ │Canvas 4│ ... (16개)
│Context │ │Context │ │Context │ │Context │
└────────┘ └────────┘ └────────┘ └────────┘
             ↓
      Context 부족으로 실패!

EchoPixel 방식 (하나의 Canvas):
┌─────────────────────────────────────────────────────┐
│           Single Full-Screen Canvas                  │
│                                                     │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│   │ 영역 1  │ │ 영역 2  │ │ 영역 3  │ │ 영역 4  │  │
│   │ (VP 1)  │ │ (VP 2)  │ │ (VP 3)  │ │ (VP 4)  │  │
│   └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
│                                                     │
│   Scissor Test로 영역을 나누어 렌더링               │
│                                                     │
│                    Context: 단 1개!                 │
└─────────────────────────────────────────────────────┘
```

### Hybrid 구조 상세

"Hybrid"라고 부르는 이유는 DOM과 WebGL을 함께 사용하기 때문입니다:

```
┌─────────────────────────────────────────────────────────────┐
│  Z-Index Layer 구조                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Layer 2: SVG Overlay (z-index: 1)                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  측정 도구, 라벨, 마커 등 (어노테이션)                 │   │
│  │  - 마우스 이벤트 직접 처리                            │   │
│  │  - React 컴포넌트로 구현                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Layer 1: DOM Slots (z-index: 0)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ Slot 1   │ │ Slot 2   │ │ Slot 3   │ │ Slot 4   │      │
│  │ (투명)   │ │ (투명)   │ │ (투명)   │ │ (투명)   │      │
│  │          │ │          │ │          │ │          │      │
│  │ 마우스   │ │ 마우스   │ │ 마우스   │ │ 마우스   │      │
│  │ 이벤트   │ │ 이벤트   │ │ 이벤트   │ │ 이벤트   │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                             │
│  Layer 0: WebGL Canvas (z-index: -1)                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Single Canvas (전체 화면)               │   │
│  │              position: absolute                      │   │
│  │              실제 DICOM 이미지 렌더링                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 왜 이 구조인가?

| 레이어 | 역할 | 왜 이 방식? |
|--------|------|------------|
| **WebGL Canvas** | DICOM 이미지 렌더링 | GPU 가속, 1개 Context로 무제한 뷰포트 |
| **DOM Slots** | 마우스/터치 이벤트, 레이아웃 | React와 자연스러운 통합, CSS Grid/Flexbox 활용 |
| **SVG Overlay** | 측정 도구, 어노테이션 | 벡터 그래픽으로 해상도 독립적, DOM 이벤트 처리 용이 |

---

## 4. 핵심 기술: Scissor Test

### Scissor Test란?

Scissor Test는 WebGL의 기능으로, **화면의 특정 영역만 렌더링**할 수 있게 합니다.

```
┌─────────────────────────────────────────────────────────┐
│  Canvas 전체 (1920 × 1080)                               │
│                                                         │
│   ┌─────────────────────┐                               │
│   │  Scissor 영역       │                               │
│   │  (400, 300) 시작    │ ← 이 영역만 렌더링됨!          │
│   │  480 × 360 크기     │                               │
│   └─────────────────────┘                               │
│                                                         │
│   나머지 영역은 렌더링 명령이 무시됨                      │
└─────────────────────────────────────────────────────────┘
```

### 코드 예제

```typescript
// Scissor Test 활성화
gl.enable(gl.SCISSOR_TEST);

// 16개 뷰포트 순회하며 렌더링
for (const viewport of viewports) {
  // 1. 뷰포트 영역 설정 (그리기 좌표계)
  gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);

  // 2. Scissor 영역 설정 (자르기 영역 - viewport와 동일하게)
  gl.scissor(viewport.x, viewport.y, viewport.width, viewport.height);

  // 3. 해당 뷰포트의 DICOM 프레임 렌더링
  renderDicomFrame(viewport.textureId, viewport.currentFrame);
}

// Scissor Test 비활성화
gl.disable(gl.SCISSOR_TEST);
```

### Viewport vs Scissor 차이

```
gl.viewport(): "어디에 그릴지" 결정
┌─────────────────────────────────────┐
│  Canvas                             │
│     ┌─────────────┐                 │
│     │  Viewport   │ ← 그리기 좌표가  │
│     │  영역       │   이 영역에 매핑 │
│     └─────────────┘                 │
└─────────────────────────────────────┘

gl.scissor(): "어디까지 잘라낼지" 결정
┌─────────────────────────────────────┐
│  Canvas                             │
│     ┌─────────────┐                 │
│     │  Scissor    │ ← 이 영역 밖은  │
│     │  영역       │   픽셀이 무시됨  │
│     └─────────────┘                 │
└─────────────────────────────────────┘

보통 viewport와 scissor를 같은 크기로 설정합니다.
```

---

## 5. 좌표 시스템 이해하기

### DOM과 WebGL 좌표계 차이

웹에서 가장 혼란스러운 부분 중 하나가 **좌표계**입니다. DOM과 WebGL은 Y축 방향이 반대입니다:

```
DOM 좌표계 (CSS, JavaScript 이벤트):     WebGL 좌표계 (GPU 렌더링):

(0,0) ─────────────→ X                   Y
  │                                      ↑
  │                                      │
  │   Y축 아래로 증가                     │   Y축 위로 증가
  ↓                                      │
  Y                                   (0,0) ─────────────→ X
```

### 좌표 변환 함수

DOM 요소의 위치를 WebGL 좌표로 변환하는 핵심 함수:

```typescript
/**
 * DOM 요소의 위치를 WebGL Viewport 좌표로 변환
 *
 * @param domRect - 뷰포트 슬롯의 DOM 위치 (getBoundingClientRect 결과)
 * @param containerRect - 전체 컨테이너의 DOM 위치
 * @param canvasHeight - Canvas의 실제 픽셀 높이 (CSS 높이 × DPR)
 * @param dpr - Device Pixel Ratio (예: Retina 디스플레이는 2)
 */
function domRectToWebGLViewport(
  domRect: DOMRect,
  containerRect: DOMRect,
  canvasHeight: number,
  dpr: number = window.devicePixelRatio
): ViewportBounds {
  // 1. 컨테이너 기준 상대 좌표 계산
  const relativeX = domRect.x - containerRect.x;
  const relativeY = domRect.y - containerRect.y;

  // 2. CSS 픽셀 → 실제 픽셀 변환 (DPR 적용)
  const physicalX = Math.round(relativeX * dpr);
  const physicalWidth = Math.round(domRect.width * dpr);
  const physicalHeight = Math.round(domRect.height * dpr);

  // 3. Y축 반전 (DOM은 위→아래, WebGL은 아래→위)
  //    WebGL Y = Canvas 높이 - (DOM Y + 요소 높이)
  const physicalY = canvasHeight - Math.round((relativeY + domRect.height) * dpr);

  return {
    x: physicalX,
    y: physicalY,  // 반전된 Y 좌표
    width: physicalWidth,
    height: physicalHeight,
  };
}
```

### 좌표 변환 예제

```
Canvas: 1920 × 1080 (CSS), DPR: 2 → 실제 3840 × 2160
DOM 슬롯 위치: x=100, y=50, width=400, height=300

변환 과정:
1. 실제 픽셀 변환:
   physicalX = 100 × 2 = 200
   physicalWidth = 400 × 2 = 800
   physicalHeight = 300 × 2 = 600

2. Y축 반전:
   DOM에서 y=50 → 위에서 50px 아래
   WebGL에서는 아래에서 (2160 - (50×2 + 600)) = 1460px 위

결과: x=200, y=1460, width=800, height=600
```

### Device Pixel Ratio (DPR) 이해하기

```
일반 디스플레이 (DPR = 1):
┌─────────────────┐
│ CSS 1px = 1물리픽셀│
│                 │
│ 100px × 100px   │ → 실제 100 × 100 픽셀
└─────────────────┘

Retina 디스플레이 (DPR = 2):
┌─────────────────┐
│ CSS 1px = 4물리픽셀│
│  ┌──┬──┐        │
│  ├──┼──┤ (2×2)  │
│  └──┴──┘        │
│ 100px × 100px   │ → 실제 200 × 200 픽셀
└─────────────────┘

왜 중요한가?
- Canvas 해상도를 DPR에 맞게 설정해야 선명한 렌더링
- DOM 좌표 → WebGL 좌표 변환 시 DPR 곱하기 필요
```

---

## 6. Tiered Rendering 전략

### 왜 모든 것을 WebGL로 렌더링하지 않는가?

모든 UI 요소를 WebGL로 그리면:
- 코드 복잡도 증가
- 텍스트 렌더링 어려움
- 마우스 이벤트 처리 복잡
- 접근성(Accessibility) 지원 어려움

EchoPixel은 **용도에 맞는 렌더링 기술**을 선택합니다:

```
┌─────────────────────────────────────────────────────────────┐
│                    Tiered Rendering 전략                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Tier 1: WebGL + Scissor (메인 DICOM 뷰포트)                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  • 16개 이상 동시 렌더링                             │   │
│  │  • 30fps+ cine 재생                                  │   │
│  │  • GPU 가속 필수                                     │   │
│  │  • Context 1개로 모든 뷰포트                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Tier 2: Canvas 2D 또는 <img> (썸네일)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  • 스크롤 영역에 적합                                │   │
│  │  • 복잡한 WebGL 동기화 불필요                        │   │
│  │  • 지연 로딩(lazy loading) 쉬움                      │   │
│  │  • 서버 렌더링 활용 가능                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Tier 3: SVG / HTML (어노테이션, 차트)                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  • 해상도 독립적 (벡터)                              │   │
│  │  • DOM 이벤트 자연스러운 처리                        │   │
│  │  • React 컴포넌트 활용                               │   │
│  │  • 접근성 지원 용이                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 언제 어떤 Tier를 사용하나?

| 요소 | Tier | 이유 |
|------|------|------|
| 메인 DICOM 영상 | 1 (WebGL) | 고성능 렌더링 필수 |
| 썸네일 목록 | 2 (img/Canvas 2D) | 스크롤 영역, 많은 개수 |
| 측정 도구 (줄자, 각도기) | 3 (SVG) | 정밀한 좌표, 인터랙션 |
| 환자 정보 오버레이 | 3 (HTML) | 텍스트, 접근성 |
| 심전도 파형 | 2-3 (Canvas 2D/SVG) | 실시간 그래프 |

---

## 7. 프레임 동기화

### 문제: 다른 프레임 수를 가진 시리즈

스트레스 에코에서 각 뷰가 다른 프레임 수를 가질 수 있습니다:

```
뷰포트 1 (Master): 47 프레임 (1초 = 47fps)
뷰포트 2 (Slave):  94 프레임 (2초 loop)
뷰포트 3 (Slave):  30 프레임

동기화 필요: 모든 뷰포트가 같은 "심장 주기" 위치를 보여야 함
```

### Frame Ratio 동기화

**비율 기반** 동기화로 해결합니다:

```typescript
// Master 뷰포트의 현재 프레임과 전체 프레임 수
const masterFrame = 10;
const masterTotal = 47;

// Slave 뷰포트 (94 프레임)의 동기화된 프레임 계산
const slaveTotal = 94;
const ratio = masterFrame / masterTotal;  // 10/47 ≈ 0.213
const slaveFrame = Math.floor(ratio * slaveTotal);  // 0.213 × 94 ≈ 20

console.log(`Master: ${masterFrame}/${masterTotal} → Slave: ${slaveFrame}/${slaveTotal}`);
// Master: 10/47 → Slave: 20/94
```

### 시각적 이해

```
시간 진행 ────────────────────────────────────────────→

Master (47 프레임):
[0]────[10]────[23]────[35]────[47]→
  ↓      ↓       ↓       ↓
 0%    21%     49%     74%    100%
  ↓      ↓       ↓       ↓
Slave (94 프레임):
[0]────[20]────[46]────[70]────[94]→

같은 비율 = 같은 심장 주기 위치!
```

### FrameSyncEngine 구현 위치

- `packages/core/src/sync/FrameSyncEngine.ts`

```typescript
// 사용 예시
const syncEngine = new FrameSyncEngine();

// Master 뷰포트 지정
syncEngine.setMaster('viewport-1');

// Slave 뷰포트들 등록
syncEngine.addSlave('viewport-2', { totalFrames: 94 });
syncEngine.addSlave('viewport-3', { totalFrames: 30 });

// Master 프레임 변경 시 Slave들 자동 동기화
syncEngine.onMasterFrameChange((masterFrame) => {
  const slaveFrames = syncEngine.calculateSlaveFrames(masterFrame);
  // slaveFrames = { 'viewport-2': 20, 'viewport-3': 6 }
});
```

---

## 8. 흔한 문제와 해결책

### 문제 1: 스크롤 드리프트

**증상**: 스크롤 시 WebGL 렌더링이 DOM 위치와 맞지 않음

```
정상 상태:                     드리프트 발생:
┌─────────────────────┐       ┌─────────────────────┐
│ ┌───────────┐       │       │ ┌───────────┐       │
│ │ DOM Slot  │       │       │ │ DOM Slot  │       │
│ │ ┌───────┐ │       │       │ └───────────┘       │
│ │ │WebGL  │ │       │       │   ↑                 │
│ │ │렌더링 │ │       │       │   ┌───────┐         │
│ │ └───────┘ │       │       │   │WebGL  │ ← 어긋남!│
│ └───────────┘       │       │   └───────┘         │
└─────────────────────┘       └─────────────────────┘
```

**원인**: 스크롤 이벤트와 requestAnimationFrame 타이밍 불일치

**해결책**:

```typescript
// 1. Passive 스크롤 이벤트 + rAF 동기화
container.addEventListener('scroll', () => {
  // rAF로 다음 프레임에 좌표 업데이트
  requestAnimationFrame(() => {
    this.syncAllSlotPositions();
  });
}, { passive: true });

// 2. CSS contain 속성으로 레이아웃 격리
// styles.css
.viewport-container {
  contain: layout;  /* 내부 변경이 외부에 영향 안 줌 */
}

// 3. 스크롤 중 저품질 렌더링 (선택적)
let isScrolling = false;
container.addEventListener('scroll', () => {
  isScrolling = true;
  clearTimeout(scrollEndTimer);
  scrollEndTimer = setTimeout(() => {
    isScrolling = false;
    renderHighQuality();  // 스크롤 종료 후 고품질 복원
  }, 100);
});
```

### 문제 2: Y축 반전 실수

**증상**: 이미지가 뒤집혀 보이거나 클릭 위치가 맞지 않음

**원인**: DOM과 WebGL Y축 방향 혼동

```typescript
// ❌ 잘못된 코드 (Y축 반전 누락)
gl.scissor(rect.x, rect.y, rect.width, rect.height);

// ✅ 올바른 코드 (Y축 반전 적용)
const webglY = canvasHeight - (rect.y + rect.height);
gl.scissor(rect.x, webglY, rect.width, rect.height);
```

### 문제 3: DPR 미적용

**증상**: Retina 디스플레이에서 흐릿하게 보임

**원인**: Canvas 해상도가 CSS 크기와 동일하게 설정됨

```typescript
// ❌ 잘못된 코드
canvas.width = canvas.clientWidth;   // CSS 픽셀
canvas.height = canvas.clientHeight;

// ✅ 올바른 코드
const dpr = window.devicePixelRatio || 1;
canvas.width = canvas.clientWidth * dpr;   // 실제 픽셀
canvas.height = canvas.clientHeight * dpr;
```

### 문제 4: ResizeObserver 미사용

**증상**: 창 크기 변경 시 렌더링 영역이 맞지 않음

**해결책**:

```typescript
// 모든 뷰포트 슬롯에 ResizeObserver 연결
const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const slotId = entry.target.dataset.slotId;
    this.syncSlotPosition(slotId);  // 해당 슬롯 좌표 재계산
  }
});

// 각 슬롯 등록
slotElements.forEach(slot => resizeObserver.observe(slot));
```

---

## 9. 주요 컴포넌트 가이드

### 컴포넌트 구조

```
packages/react/src/components/
├── HybridMultiViewport.tsx      # 최상위 컨테이너
│   ├── 단일 WebGL Canvas 관리
│   ├── 레이아웃 계산
│   └── 자식 슬롯들에 좌표 전달
│
├── building-blocks/
│   └── HybridViewportSlot.tsx   # 개별 뷰포트 슬롯
│       ├── DOM 이벤트 처리
│       ├── ResizeObserver 등록
│       └── 좌표 정보 상위에 보고
│
packages/core/src/
├── hybrid/
│   └── HybridViewportManager.ts # WebGL 렌더링 조율
│       ├── Scissor/Viewport 설정
│       ├── 텍스처 렌더링
│       └── 프레임 업데이트
│
├── sync/
│   ├── FrameSyncEngine.ts       # 프레임 동기화
│   └── RenderScheduler.ts       # rAF 루프 관리
```

### HybridMultiViewport 사용 예시

```tsx
import { HybridMultiViewport } from '@echopixel/react';

function StressEchoViewer() {
  // 16개 뷰포트 데이터
  const viewports = stressEchoSeries.map((series, index) => ({
    id: `vp-${index}`,
    seriesId: series.id,
    label: series.view,  // 예: "REST A4C", "STRESS A2C"
  }));

  return (
    <HybridMultiViewport
      viewports={viewports}
      layout={{ rows: 4, columns: 4 }}
      syncMode="ratio"  // Frame ratio 동기화
      masterViewportId="vp-0"
    />
  );
}
```

---

## 10. 학습 포인트 정리

### 핵심 개념

| 개념 | 한 줄 설명 |
|------|-----------|
| **WebGL Context 제한** | 브라우저는 8-16개 Context만 허용 → 단일 Canvas 필요 |
| **Scissor Test** | Canvas의 특정 영역만 렌더링하는 WebGL 기능 |
| **Hybrid DOM-WebGL** | DOM(이벤트) + WebGL(렌더링) 장점 결합 |
| **좌표 변환** | DOM(Y↓)과 WebGL(Y↑)은 Y축 반대 → 변환 필수 |
| **DPR** | Retina 디스플레이는 CSS 픽셀 × 2 = 실제 픽셀 |
| **Frame Ratio 동기화** | 다른 프레임 수 시리즈를 비율로 맞춤 |

### 더 배우기

- **WebGL Fundamentals**: https://webglfundamentals.org/
- **MDN WebGL Tutorial**: https://developer.mozilla.org/ko/docs/Web/API/WebGL_API/Tutorial
- **ResizeObserver API**: https://developer.mozilla.org/ko/docs/Web/API/ResizeObserver
- **IntersectionObserver API**: https://developer.mozilla.org/ko/docs/Web/API/IntersectionObserver

### 프로젝트 내부 문서

- **[멀티뷰포트 전략 분석](/docs/architecture/multi-viewport-strategy-analysis.md)** - 설계 결정의 상세 근거
- [렌더링 파이프라인](./rendering-pipeline.md) - 전체 데이터 흐름
- [성능 최적화](./performance-optimization.md) - 7가지 최적화 전략
- [메모리 관리](./memory-management.md) - GPU 메모리 전략
