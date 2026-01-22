# 코딩 가이드

이 문서에서는 EchoPixel 프로젝트의 코딩 컨벤션과 베스트 프랙티스를 설명합니다.

---

## 목차

1. [일반 원칙](#일반-원칙)
2. [TypeScript 가이드](#typescript-가이드)
3. [React 가이드](#react-가이드)
4. [WebGL 가이드](#webgl-가이드)
5. [스타일 가이드](#스타일-가이드)
6. [네이밍 규칙](#네이밍-규칙)

---

## 일반 원칙

### 1. 명확성 우선

```typescript
// ❌ 불명확
const d = getData();
const p = process(d);

// ✅ 명확
const dicomDataset = parseDicomFile(buffer);
const imageInfo = extractImageInfo(dicomDataset);
```

### 2. 단일 책임

```typescript
// ❌ 여러 책임
function loadAndRenderDicom(url: string, canvas: HTMLCanvasElement) {
  // 로딩 + 파싱 + 렌더링 모두 수행
}

// ✅ 분리된 책임
async function loadDicom(url: string): Promise<ArrayBuffer> { ... }
function parseDicom(buffer: ArrayBuffer): DicomDataset { ... }
function renderToCanvas(imageData: ImageData, canvas: HTMLCanvasElement) { ... }
```

### 3. 불변성 선호

```typescript
// ❌ 직접 수정
function updateViewport(viewport: Viewport) {
  viewport.windowCenter = 40;
  viewport.windowWidth = 400;
}

// ✅ 새 객체 반환
function updateViewport(viewport: Viewport): Viewport {
  return {
    ...viewport,
    windowCenter: 40,
    windowWidth: 400,
  };
}
```

### 4. 조기 반환 (Early Return)

```typescript
// ❌ 중첩된 조건문
function processFrame(frame: Frame | null) {
  if (frame) {
    if (frame.data) {
      if (frame.data.length > 0) {
        // 처리
      }
    }
  }
}

// ✅ 조기 반환
function processFrame(frame: Frame | null) {
  if (!frame) return;
  if (!frame.data) return;
  if (frame.data.length === 0) return;

  // 처리
}
```

---

## TypeScript 가이드

### strict mode 사용

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### 타입 vs 인터페이스

```typescript
// 인터페이스: 객체 형태 정의, 확장 가능
interface DicomImageInfo {
  rows: number;
  columns: number;
  bitsStored: number;
}

// 타입: 유니온, 튜플, 매핑 등 복잡한 타입
type AnnotationType = 'length' | 'angle' | 'point';
type Point = [number, number];
type DecodedFrame = ImageBitmap | VideoFrame;
```

### 제네릭 활용

```typescript
// ❌ any 사용
function getFirst(arr: any[]): any {
  return arr[0];
}

// ✅ 제네릭 사용
function getFirst<T>(arr: T[]): T | undefined {
  return arr[0];
}
```

### null/undefined 처리

```typescript
// ❌ 느슨한 체크
if (value) { ... }

// ✅ 명시적 체크
if (value !== null && value !== undefined) { ... }
// 또는
if (value != null) { ... }
```

### 타입 가드

```typescript
// 타입 가드 함수
function isImageBitmap(frame: DecodedFrame): frame is ImageBitmap {
  return frame instanceof ImageBitmap;
}

// 사용
if (isImageBitmap(frame)) {
  // frame은 ImageBitmap으로 좁혀짐
  frame.close();
}
```

### const assertion

```typescript
// ❌ 타입이 string[]으로 추론됨
const TOOL_IDS = ['windowLevel', 'pan', 'zoom'];

// ✅ 타입이 readonly ['windowLevel', 'pan', 'zoom']으로 추론됨
const TOOL_IDS = ['windowLevel', 'pan', 'zoom'] as const;
```

---

## React 가이드

### 함수 컴포넌트 사용

```tsx
// ✅ 함수 컴포넌트 + TypeScript
interface MyComponentProps {
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
}

export function MyComponent({ title, onClose, children }: MyComponentProps) {
  return (
    <div>
      <h1>{title}</h1>
      {children}
      <button onClick={onClose}>닫기</button>
    </div>
  );
}
```

### 훅 규칙

```tsx
// 1. 컴포넌트 최상위에서만 호출
function MyComponent() {
  // ✅ 최상위
  const [state, setState] = useState(0);

  // ❌ 조건문 안에서 호출
  if (condition) {
    const [other, setOther] = useState(0); // 에러!
  }
}

// 2. 커스텀 훅은 use 접두사
function useWindowSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  // ...
  return size;
}
```

### 메모이제이션

```tsx
// useMemo: 계산 비용이 높은 값
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(data);
}, [data]);

// useCallback: 콜백 함수
const handleClick = useCallback(() => {
  console.log('clicked', id);
}, [id]);

// React.memo: 컴포넌트
const MemoizedComponent = React.memo(function MyComponent({ value }) {
  return <div>{value}</div>;
});
```

### ref 사용

```tsx
// DOM 요소 접근
const canvasRef = useRef<HTMLCanvasElement>(null);

useEffect(() => {
  const canvas = canvasRef.current;
  if (canvas) {
    const ctx = canvas.getContext('2d');
    // ...
  }
}, []);

return <canvas ref={canvasRef} />;
```

### Handle (명령형 API) 패턴

```tsx
// Handle 타입 정의
export interface MyViewerHandle {
  play: () => void;
  pause: () => void;
  reset: () => void;
}

// forwardRef로 ref 전달
export const MyViewer = forwardRef<MyViewerHandle, MyViewerProps>(
  function MyViewer(props, ref) {
    const [isPlaying, setIsPlaying] = useState(false);

    // useImperativeHandle로 Handle 노출
    useImperativeHandle(ref, () => ({
      play: () => setIsPlaying(true),
      pause: () => setIsPlaying(false),
      reset: () => { /* ... */ },
    }), []);

    return <div>{/* ... */}</div>;
  }
);
```

---

## WebGL 가이드

### 리소스 관리

```typescript
// ✅ 리소스 생성과 해제 쌍으로 관리
class TextureManager {
  private textures: Map<string, WebGLTexture> = new Map();

  createTexture(id: string, data: ImageData): WebGLTexture {
    const texture = this.gl.createTexture();
    // ... 설정
    this.textures.set(id, texture);
    return texture;
  }

  deleteTexture(id: string): void {
    const texture = this.textures.get(id);
    if (texture) {
      this.gl.deleteTexture(texture);
      this.textures.delete(id);
    }
  }

  dispose(): void {
    // 모든 텍스처 해제
    for (const [id, texture] of this.textures) {
      this.gl.deleteTexture(texture);
    }
    this.textures.clear();
  }
}
```

### 컨텍스트 손실 처리

```typescript
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  console.warn('WebGL context lost');
  // 리소스 참조 무효화
});

canvas.addEventListener('webglcontextrestored', () => {
  console.log('WebGL context restored');
  // 리소스 재생성
  this.initializeWebGL();
});
```

### 에러 체크

```typescript
function checkGLError(gl: WebGL2RenderingContext, operation: string): void {
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    console.error(`WebGL error after ${operation}: ${error}`);
  }
}

// 개발 모드에서만 사용
if (process.env.NODE_ENV === 'development') {
  checkGLError(gl, 'drawArrays');
}
```

---

## 스타일 가이드

### Tailwind CSS 사용

```tsx
// cn() 유틸리티로 조건부 클래스
import { cn } from '@echopixel/react';

function Button({ isActive, disabled, className }) {
  return (
    <button
      className={cn(
        // 기본 스타일
        'px-4 py-2 rounded-md transition-all',
        // 조건부 스타일
        isActive && 'bg-accent-primary text-white',
        !isActive && 'bg-viewer-panel text-text-secondary',
        disabled && 'opacity-50 cursor-not-allowed',
        // 외부 클래스 병합
        className
      )}
    >
      Click me
    </button>
  );
}
```

### 동적 스타일

```tsx
// Tailwind로 표현 불가한 동적 값은 인라인 스타일
function Grid({ columns, gap }) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap}px`,
      }}
    >
      {/* ... */}
    </div>
  );
}
```

---

## 네이밍 규칙

### 파일명

| 유형 | 규칙 | 예시 |
|------|------|------|
| 컴포넌트 | PascalCase | `SingleDicomViewer.tsx` |
| 훅 | camelCase + use | `useWadoLoader.ts` |
| 유틸리티 | camelCase | `calibration.ts` |
| 타입 정의 | 해당 모듈/types | `types.ts` |
| 테스트 | .test 또는 .spec | `parser.test.ts` |

### 변수/함수명

| 유형 | 규칙 | 예시 |
|------|------|------|
| 변수 | camelCase | `windowCenter`, `isPlaying` |
| 함수 | camelCase | `parseDicom`, `getImageInfo` |
| 상수 | UPPER_SNAKE_CASE | `MAX_VIEWPORTS`, `DEFAULT_FPS` |
| 불리언 | is/has/can 접두사 | `isActive`, `hasError`, `canEdit` |
| 핸들러 | handle/on 접두사 | `handleClick`, `onSelect` |

### 타입/인터페이스

| 유형 | 규칙 | 예시 |
|------|------|------|
| 인터페이스 | PascalCase | `DicomImageInfo` |
| 타입 | PascalCase | `AnnotationType` |
| Props | 컴포넌트명 + Props | `SingleDicomViewerProps` |
| Handle | 컴포넌트명 + Handle | `SingleDicomViewerHandle` |

---

## 코드 포맷팅

### Prettier 설정

`.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### ESLint 설정

주요 규칙:
- `@typescript-eslint/no-explicit-any`: error
- `@typescript-eslint/explicit-function-return-type`: off (추론 허용)
- `react-hooks/rules-of-hooks`: error
- `react-hooks/exhaustive-deps`: warn

---

## 다음 단계

- [테스트 가이드](./testing.md)로 테스트 작성 방법을 배우세요.
- [기여 가이드](./contributing.md)로 PR 작성 방법을 확인하세요.
