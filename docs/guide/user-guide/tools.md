# 도구 시스템

EchoPixel은 영상 조작을 위한 다양한 도구를 제공합니다. 이 문서에서는 도구의 종류, 사용법, 커스터마이징 방법을 설명합니다.

---

## 목차

1. [도구 개요](#도구-개요)
2. [기본 도구 사용하기](#기본-도구-사용하기)
3. [도구 바인딩 이해하기](#도구-바인딩-이해하기)
4. [도구 바인딩 커스터마이징](#도구-바인딩-커스터마이징)
5. [프로그래매틱 제어](#프로그래매틱-제어)

---

## 도구 개요

### 기본 제공 도구

| 도구 | ID | 설명 | 기본 바인딩 |
|------|-----|------|-------------|
| **Window/Level** | `windowLevel` | 영상 밝기/대비 조절 | 좌클릭 드래그 |
| **Pan** | `pan` | 영상 이동 | 우클릭 드래그 |
| **Zoom** | `zoom` | 영상 확대/축소 | 휠 스크롤 |
| **Stack Scroll** | `stackScroll` | 프레임 탐색 | Shift + 휠 |

### 측정 도구 (어노테이션)

| 도구 | ID | 설명 |
|------|-----|------|
| **Length** | `length` | 두 점 사이 거리 측정 |
| **Angle** | `angle` | 세 점으로 각도 측정 |
| **Point** | `point` | 마커 배치 |

> 측정 도구는 [어노테이션](./annotations.md) 문서에서 자세히 다룹니다.

---

## 기본 도구 사용하기

### SingleDicomViewer에서의 기본 동작

`SingleDicomViewer`는 기본적으로 모든 조작 도구가 활성화되어 있습니다:

```tsx
<SingleDicomViewer
  frames={frames}
  imageInfo={imageInfo}
  isEncapsulated={isEncapsulated}
  width={768}
  height={576}
  showToolbar={true}  // 도구 선택 UI 표시
/>
```

### 기본 마우스/키보드 바인딩

#### Window/Level (영상 밝기/대비)

| 동작 | 효과 |
|------|------|
| 좌클릭 + 좌우 드래그 | Window Width 조절 (대비) |
| 좌클릭 + 상하 드래그 | Window Center 조절 (밝기) |

**사용 예시**: 어두운 영상을 밝게 보거나, 대비를 높여 경계를 선명하게 볼 때

#### Pan (영상 이동)

| 동작 | 효과 |
|------|------|
| 우클릭 + 드래그 | 영상 이동 |
| Ctrl + 좌클릭 + 드래그 | 영상 이동 (대체) |

**사용 예시**: 확대된 영상에서 관심 영역으로 이동할 때

#### Zoom (확대/축소)

| 동작 | 효과 |
|------|------|
| 휠 위로 | 확대 |
| 휠 아래로 | 축소 |

**사용 예시**: 세부 구조를 자세히 볼 때

#### Stack Scroll (프레임 탐색)

| 동작 | 효과 |
|------|------|
| Shift + 휠 위로 | 다음 프레임 |
| Shift + 휠 아래로 | 이전 프레임 |

**사용 예시**: 멀티프레임 영상에서 특정 프레임을 찾을 때

---

## 도구 바인딩 이해하기

### 바인딩이란?

**바인딩(Binding)**은 마우스 버튼, 키보드 수정자(Ctrl, Shift, Alt), 휠 동작의 조합으로 특정 도구를 활성화하는 규칙입니다.

### 바인딩 구조

```typescript
interface ToolBinding {
  mouseButton: MouseButton;      // 'left' | 'right' | 'middle'
  modifiers?: KeyboardModifier[]; // ['ctrl'] | ['shift'] | ['alt'] 등
  wheel?: boolean;               // 휠 동작 여부
}
```

### 기본 바인딩 예시

```typescript
// Window/Level 도구의 기본 바인딩
const windowLevelBindings: ToolBinding[] = [
  { mouseButton: 'left', modifiers: [] }  // 순수 좌클릭
];

// Pan 도구의 기본 바인딩
const panBindings: ToolBinding[] = [
  { mouseButton: 'right', modifiers: [] },     // 우클릭
  { mouseButton: 'left', modifiers: ['ctrl'] } // Ctrl + 좌클릭
];

// Zoom 도구의 기본 바인딩
const zoomBindings: ToolBinding[] = [
  { wheel: true, modifiers: [] }  // 순수 휠
];
```

---

## 도구 바인딩 커스터마이징

### 방법 1: DEFAULT_TOOLS 수정

`DEFAULT_TOOLS` 배열을 복사하여 수정합니다:

```tsx
import { SingleDicomViewer, DEFAULT_TOOLS, type ToolDefinition } from '@echopixel/react';

// 커스텀 도구 정의
const customTools: ToolDefinition[] = DEFAULT_TOOLS.map(tool => {
  if (tool.id === 'windowLevel') {
    return {
      ...tool,
      // Window/Level을 Ctrl + 좌클릭으로 변경
      bindings: [{ mouseButton: 'left', modifiers: ['ctrl'] }]
    };
  }
  if (tool.id === 'pan') {
    return {
      ...tool,
      // Pan을 순수 좌클릭으로 변경
      bindings: [{ mouseButton: 'left', modifiers: [] }]
    };
  }
  return tool;
});

function MyViewer({ viewportData }) {
  return (
    <SingleDicomViewer
      {...viewportData}
      width={768}
      height={576}
      tools={customTools}
    />
  );
}
```

### 방법 2: 도구 비활성화

특정 도구를 제거하려면 필터링합니다:

```tsx
// Zoom 도구 제거
const toolsWithoutZoom = DEFAULT_TOOLS.filter(tool => tool.id !== 'zoom');

<SingleDicomViewer
  {...viewportData}
  width={768}
  height={576}
  tools={toolsWithoutZoom}
/>
```

### 방법 3: 새 도구 추가

커스텀 도구를 추가할 수 있습니다:

```tsx
const customTools: ToolDefinition[] = [
  ...DEFAULT_TOOLS,
  {
    id: 'myCustomTool',
    name: '내 커스텀 도구',
    icon: '🔧',
    bindings: [{ mouseButton: 'middle', modifiers: [] }],
    cursor: 'crosshair',
  }
];
```

---

## 프로그래매틱 제어

### useToolGroup 훅 사용

`@echopixel/core`의 `useToolGroup` 훅으로 도구를 프로그래매틱하게 제어할 수 있습니다:

```tsx
import { useToolGroup } from '@echopixel/core';

function AdvancedViewer({ viewportData }) {
  const { activeToolId, setActiveTool, getToolState } = useToolGroup({
    defaultTool: 'windowLevel',
    enabledTools: ['windowLevel', 'pan', 'zoom', 'stackScroll']
  });

  return (
    <div>
      {/* 도구 선택 버튼 */}
      <div>
        <button
          onClick={() => setActiveTool('windowLevel')}
          style={{ fontWeight: activeToolId === 'windowLevel' ? 'bold' : 'normal' }}
        >
          Window/Level
        </button>
        <button
          onClick={() => setActiveTool('pan')}
          style={{ fontWeight: activeToolId === 'pan' ? 'bold' : 'normal' }}
        >
          Pan
        </button>
      </div>

      <SingleDicomViewer
        {...viewportData}
        width={768}
        height={576}
        activeToolId={activeToolId}
      />
    </div>
  );
}
```

### 도구 상태 저장/복원

뷰어의 재생 상태를 조회하고 제어할 수 있습니다:

```tsx
function ViewerWithStateManagement({ viewportData }) {
  const viewerRef = useRef<SingleDicomViewerHandle>(null);
  const [playbackState, setPlaybackState] = useState(null);

  const checkState = () => {
    if (viewerRef.current) {
      // 재생 상태 조회 (isPlaying, currentFrame, fps, totalFrames)
      const state = viewerRef.current.getState();
      setPlaybackState(state);
      console.log('Current state:', state);
    }
  };

  const resetAll = () => {
    if (viewerRef.current) {
      // 뷰포트 초기화 (Window/Level, 위치, 줌 복원)
      viewerRef.current.resetViewport();
    }
  };

  return (
    <div>
      <button onClick={checkState}>상태 조회</button>
      <button onClick={resetAll}>뷰포트 초기화</button>

      <SingleDicomViewer
        ref={viewerRef}
        {...viewportData}
        width={768}
        height={576}
      />
    </div>
  );
}
```

---

## 도구 동작 상세

### Window/Level 알고리즘

Window/Level은 픽셀 값을 화면에 표시할 밝기로 변환합니다:

```
표시값 = (픽셀값 - (WindowCenter - WindowWidth/2)) / WindowWidth * 255
```

| 파라미터 | 설명 | 효과 |
|----------|------|------|
| Window Center (WC) | 중심 픽셀 값 | 값을 높이면 영상이 어두워짐 |
| Window Width (WW) | 표시 범위 | 값을 낮추면 대비가 높아짐 |

### Zoom 동작

| 상태 | 설명 |
|------|------|
| `scale = 1.0` | 원본 크기 |
| `scale > 1.0` | 확대 |
| `scale < 1.0` | 축소 |

줌은 마우스 포인터 위치를 중심으로 확대/축소됩니다.

### Pan 동작

| 값 | 설명 |
|-----|------|
| `panX = 0, panY = 0` | 중앙 정렬 |
| `panX > 0` | 오른쪽으로 이동 |
| `panY > 0` | 아래로 이동 |

---

## 키보드 단축키

### 기본 단축키

| 키 | 동작 |
|-----|------|
| `1` | Window/Level 도구 선택 |
| `2` | Pan 도구 선택 |
| `3` | Zoom 도구 선택 |
| `R` | 뷰포트 초기화 (리셋) |
| `Space` | 재생/정지 토글 |

### 단축키 활성화

```tsx
<SingleDicomViewer
  {...viewportData}
  width={768}
  height={576}
  enableKeyboardShortcuts={true}  // 기본값: true
/>
```

---

## 자주 묻는 질문

### Q: 도구를 완전히 비활성화하려면?

```tsx
<SingleDicomViewer
  {...viewportData}
  width={768}
  height={576}
  tools={[]}  // 빈 배열로 모든 도구 비활성화
  showToolbar={false}
/>
```

### Q: 특정 도구만 활성화하려면?

```tsx
const onlyZoom = DEFAULT_TOOLS.filter(t => t.id === 'zoom');

<SingleDicomViewer
  {...viewportData}
  width={768}
  height={576}
  tools={onlyZoom}
/>
```

### Q: 읽기 전용 뷰어를 만들려면?

```tsx
<SingleDicomViewer
  {...viewportData}
  width={768}
  height={576}
  tools={[]}
  showToolbar={false}
  showControls={false}
/>
```

---

## 다음 단계

- [어노테이션](./annotations.md) - 측정 도구 사용법
- [데이터 소스](./datasources.md) - WADO-RS 연동
- [고급 사용법](./advanced.md) - 성능 최적화
