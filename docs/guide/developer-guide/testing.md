# 테스트 가이드

이 문서에서는 EchoPixel 프로젝트의 테스트 작성 및 실행 방법을 설명합니다.

> **참고**: 현재 테스트 인프라는 구축 예정입니다. 이 문서는 테스트 전략과 계획을 설명합니다.

---

## 목차

1. [테스트 전략](#테스트-전략)
2. [단위 테스트](#단위-테스트)
3. [컴포넌트 테스트](#컴포넌트-테스트)
4. [E2E 테스트](#e2e-테스트)
5. [테스트 작성 가이드](#테스트-작성-가이드)

---

## 테스트 전략

### 테스트 피라미드

```
         ╱╲
        ╱  ╲
       ╱ E2E╲        적은 수, 느림, 높은 비용
      ╱──────╲
     ╱ 통합   ╲      중간 수, 중간 속도
    ╱──────────╲
   ╱   단위      ╲    많은 수, 빠름, 낮은 비용
  ╱──────────────╲
```

### 테스트 범위

| 영역 | 테스트 유형 | 도구 |
|------|-------------|------|
| @echopixel/core | 단위 테스트 | Vitest |
| @echopixel/react | 컴포넌트 테스트 | Vitest + React Testing Library |
| demo 앱 | E2E 테스트 | Playwright |

### 테스트 대상

| 모듈 | 우선순위 | 테스트 내용 |
|------|----------|-------------|
| dicom/parser | 높음 | DICOM 파싱 정확성 |
| dicom/decoder | 높음 | 이미지 디코딩 |
| webgl/TextureManager | 중간 | 텍스처 생성/해제 |
| tools/* | 중간 | 도구 동작 |
| annotations/* | 중간 | 측정 계산 |
| React 컴포넌트 | 중간 | 렌더링, 이벤트 |

---

## 단위 테스트

### Vitest 설정

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/'],
    },
  },
});
```

### DICOM 파서 테스트 예시

```typescript
// src/dicom/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseDicom, isDicomFile } from './parser';
import { readFileSync } from 'fs';

describe('DICOM Parser', () => {
  describe('isDicomFile', () => {
    it('should return true for valid DICOM file', () => {
      const buffer = readFileSync('./fixtures/valid.dcm').buffer;
      expect(isDicomFile(buffer)).toBe(true);
    });

    it('should return false for non-DICOM file', () => {
      const buffer = new ArrayBuffer(132);
      expect(isDicomFile(buffer)).toBe(false);
    });

    it('should return false for empty buffer', () => {
      const buffer = new ArrayBuffer(0);
      expect(isDicomFile(buffer)).toBe(false);
    });
  });

  describe('parseDicom', () => {
    it('should parse basic DICOM tags', () => {
      const buffer = readFileSync('./fixtures/valid.dcm').buffer;
      const dataset = parseDicom(buffer);

      expect(dataset.elements.has('00100010')).toBe(true); // Patient Name
      expect(dataset.elements.has('00080060')).toBe(true); // Modality
    });

    it('should extract transfer syntax', () => {
      const buffer = readFileSync('./fixtures/valid.dcm').buffer;
      const dataset = parseDicom(buffer);

      expect(dataset.transferSyntax).toBeDefined();
    });
  });
});
```

### 어노테이션 계산 테스트 예시

```typescript
// src/annotations/calculations.test.ts
import { describe, it, expect } from 'vitest';
import { calculateLength, calculateAngle } from './calculations';

describe('Annotation Calculations', () => {
  describe('calculateLength', () => {
    it('should calculate distance between two points', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 3, y: 4 };

      expect(calculateLength(p1, p2)).toBe(5);
    });

    it('should return 0 for same point', () => {
      const p1 = { x: 10, y: 20 };
      const p2 = { x: 10, y: 20 };

      expect(calculateLength(p1, p2)).toBe(0);
    });

    it('should apply calibration', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 100, y: 0 };
      const calibration = { pixelSpacing: [0.5, 0.5] };

      expect(calculateLength(p1, p2, calibration)).toBe(50);
    });
  });

  describe('calculateAngle', () => {
    it('should calculate angle in degrees', () => {
      const p1 = { x: 0, y: 0 };   // first arm end
      const vertex = { x: 0, y: 10 }; // vertex
      const p2 = { x: 10, y: 10 }; // second arm end

      const angle = calculateAngle(p1, vertex, p2);
      expect(angle).toBeCloseTo(90, 1);
    });

    it('should return 180 for straight line', () => {
      const p1 = { x: 0, y: 0 };
      const vertex = { x: 5, y: 0 };
      const p2 = { x: 10, y: 0 };

      const angle = calculateAngle(p1, vertex, p2);
      expect(angle).toBeCloseTo(180, 1);
    });
  });
});
```

---

## 컴포넌트 테스트

### React Testing Library 설정

```typescript
// vitest.setup.ts
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

### 컴포넌트 테스트 예시

```tsx
// src/components/DicomToolbar.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DicomToolbar, DEFAULT_TOOLS } from './DicomToolbar';

describe('DicomToolbar', () => {
  it('should render all tools', () => {
    render(
      <DicomToolbar
        tools={DEFAULT_TOOLS}
        activeToolId="windowLevel"
        onToolSelect={() => {}}
      />
    );

    expect(screen.getByTitle(/Window\/Level/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Pan/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Zoom/i)).toBeInTheDocument();
  });

  it('should call onToolSelect when tool clicked', () => {
    const handleSelect = vi.fn();

    render(
      <DicomToolbar
        tools={DEFAULT_TOOLS}
        activeToolId="windowLevel"
        onToolSelect={handleSelect}
      />
    );

    fireEvent.click(screen.getByTitle(/Pan/i));

    expect(handleSelect).toHaveBeenCalledWith('pan');
  });

  it('should highlight active tool', () => {
    render(
      <DicomToolbar
        tools={DEFAULT_TOOLS}
        activeToolId="pan"
        onToolSelect={() => {}}
      />
    );

    const panButton = screen.getByTitle(/Pan/i);
    expect(panButton).toHaveClass('bg-accent-primary');
  });
});
```

### 훅 테스트 예시

```typescript
// src/hooks/useAnnotations.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnnotations } from './useAnnotations';

describe('useAnnotations', () => {
  it('should initialize with empty annotations', () => {
    const { result } = renderHook(() => useAnnotations());

    expect(result.current.annotations).toEqual([]);
  });

  it('should add annotation', () => {
    const { result } = renderHook(() => useAnnotations());

    act(() => {
      result.current.addAnnotation({
        id: 'test-1',
        type: 'point',
        // ...
      });
    });

    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0].id).toBe('test-1');
  });

  it('should delete annotation', () => {
    const { result } = renderHook(() => useAnnotations());

    act(() => {
      result.current.addAnnotation({ id: 'test-1', /* ... */ });
      result.current.addAnnotation({ id: 'test-2', /* ... */ });
    });

    act(() => {
      result.current.deleteAnnotation('test-1');
    });

    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0].id).toBe('test-2');
  });
});
```

---

## E2E 테스트

### Playwright 설정

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

### E2E 테스트 예시

```typescript
// e2e/single-viewport.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Single Viewport Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Single Viewport 탭 클릭
    await page.click('text=Single ViewPort');
  });

  test('should load and display DICOM image', async ({ page }) => {
    // 파일 선택
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('./fixtures/test.dcm');

    // 캔버스가 표시될 때까지 대기
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // 캔버스 크기 확인
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
  });

  test('should change Window/Level with mouse drag', async ({ page }) => {
    // 이미지 로드
    await page.locator('input[type="file"]').setInputFiles('./fixtures/test.dcm');
    await page.waitForSelector('canvas');

    // 초기 W/L 값 캡처
    const initialWL = await page.locator('.window-level-display').textContent();

    // 캔버스에서 드래그
    const canvas = page.locator('canvas');
    await canvas.dragTo(canvas, {
      sourcePosition: { x: 100, y: 100 },
      targetPosition: { x: 200, y: 200 },
    });

    // W/L 값 변경 확인
    const newWL = await page.locator('.window-level-display').textContent();
    expect(newWL).not.toBe(initialWL);
  });
});
```

---

## 테스트 작성 가이드

### 테스트 구조

```typescript
describe('ModuleName', () => {
  describe('functionName', () => {
    it('should do something when condition', () => {
      // Arrange (준비)
      const input = { ... };

      // Act (실행)
      const result = functionName(input);

      // Assert (검증)
      expect(result).toBe(expected);
    });
  });
});
```

### 테스트 이름 규칙

```typescript
// ✅ 명확한 테스트 이름
it('should return empty array when input is null', () => {});
it('should throw error when buffer is too small', () => {});
it('should calculate correct angle for right angle', () => {});

// ❌ 불명확한 테스트 이름
it('works', () => {});
it('test1', () => {});
it('should work correctly', () => {});
```

### Mock 사용

```typescript
import { vi } from 'vitest';

// 함수 Mock
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
});

// 모듈 Mock
vi.mock('./network', () => ({
  fetch: mockFetch,
}));

// WebGL Mock (예시)
const mockGL = {
  createTexture: vi.fn().mockReturnValue({}),
  deleteTexture: vi.fn(),
  texImage2D: vi.fn(),
};
```

### 테스트 실행

```bash
# 모든 테스트 실행
pnpm test

# Watch 모드
pnpm test:watch

# 커버리지 포함
pnpm test:coverage

# 특정 파일만
pnpm test parser.test.ts

# E2E 테스트
pnpm test:e2e
```

---

## 다음 단계

- [기여 가이드](./contributing.md)로 PR 작성 방법을 확인하세요.
