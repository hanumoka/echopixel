# Phase 3: Annotations 구현 계획서

## 개요

EchoPixel 측정 도구 및 어노테이션 시스템 구현

**설계 원칙**:
- 유연성: 플러그인 기반 확장 가능한 구조
- 커스터마이징: 설정 기반 권한/제한 시스템
- 성능: 최적화된 렌더링 및 메모리 관리
- 안정성: 명확한 책임 분리

---

## 결정 사항 요약

### 지원 범위

| 항목 | 결정 |
|------|------|
| DICOM 모드 | B + M + D 모두 지원 |
| 측정 도구 | Length, Angle, Area, Ellipse, Trace 등 전체 |
| 렌더링 방식 | SVG/Hybrid (프레임별 동기화) |
| 좌표계 | DICOM 픽셀 좌표 저장, 모드별 물리 단위 표시 |

### 권한 시스템 (설정 가능)

| 출처 | 삭제 | 수정 | 카운트 | 비고 |
|------|------|------|--------|------|
| AI | ❌ | ✅ | ❌ | 서버에서 제공 (기본값) |
| User | ✅ | ✅ | ✅ | 브라우저에서 추가 (기본값) |

### 데이터 관리

| 항목 | 결정 |
|------|------|
| 저장 구조 | 프레임 기반 `[dicomId][frameIndex]` |
| 좌표 저장 | DICOM 픽셀 좌표 (정수) |
| 개수 제한 | DICOM 단위 15개 (User만, 설정 가능) |
| 멀티 뷰포트 | 독립 (1 viewport = 1 DICOM) |
| Undo/Redo | 지원 + 초기 데이터 리셋 |
| 숨김 기능 | 옵셔널 (구현 권장) |
| DICOM SR | Phase 4+ 선택적 |

### 책임 범위

| 영역 | EchoPixel | 사용자(앱) |
|------|-----------|-----------|
| **데이터 입력** | | |
| DICOM 파싱 (바이트→메타데이터+픽셀) | ✅ | - |
| 디코딩 (JPEG→ImageBitmap) | ✅ | - |
| WADO-RS/WADO-URI 통신 | ⚪ 옵셔널 | ✅ 권장 |
| 인증/헤더 관리 | ❌ | ✅ |
| 네트워크 캐싱/재시도 | ⚪ 옵셔널 | ✅ 권장 |
| **렌더링** | | |
| WebGL 렌더링 | ✅ | - |
| 뷰포트 관리 | ✅ | - |
| 도구 시스템 | ✅ | - |
| **어노테이션** | | |
| 어노테이션 CRUD | ✅ | - |
| 내보내기 (export) | ✅ | - |
| 가져오기 (import) | ✅ | - |
| 포맷 유효성 검증 | ✅ | - |
| 서버 API 통신 | ❌ | ✅ |
| 동기화 로직 | ❌ | ✅ |
| 오프라인 지원 | ❌ | ✅ |

> **⚪ 옵셔널**: EchoPixel이 편의 기능으로 제공하나, 앱에서 직접 구현 권장

---

## 아키텍처

### 전체 구조 (플러그인 기반)

```
┌─────────────────────────────────────────────────────────────────┐
│                    AnnotationManager                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Configuration                          │   │
│  │  - PermissionConfig (권한 설정)                           │   │
│  │  - LimitConfig (제한 설정)                                │   │
│  │  - RenderConfig (렌더링 설정)                             │   │
│  └──────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                    Plugin Registry                               │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                  │
│  │   Tool     │ │ Calculator │ │  Renderer  │                  │
│  │  Plugins   │ │  Plugins   │ │  Plugins   │                  │
│  └────────────┘ └────────────┘ └────────────┘                  │
├─────────────────────────────────────────────────────────────────┤
│                    Core Services                                 │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │Annotation  │ │  History   │ │ Coordinate │ │  Exporter  │   │
│  │  Store     │ │  Manager   │ │   System   │ │ /Importer  │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                    Built-in Tools                                │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │
│  │ Length │ │ Angle  │ │Ellipse │ │ Trace  │ │  VTI   │       │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│                    Data Flow                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [사용자 입력]                                                   │
│       │ (Canvas 좌표)                                           │
│       ▼                                                         │
│  ┌─────────────┐                                                │
│  │ Canvas →    │  즉시 변환                                      │
│  │ DICOM 변환  │──────────────────────┐                         │
│  └─────────────┘                      │                         │
│       │                               │                         │
│       ▼                               ▼                         │
│  ┌─────────────┐              ┌─────────────┐                  │
│  │AnnotationStore             │  Exporter   │                  │
│  │ (DICOM 좌표 저장)           │ (JSON 생성) │                  │
│  └─────────────┘              └──────┬──────┘                  │
│       │                               │                         │
│       │ (렌더링 시)                    ▼                         │
│       ▼                       ┌─────────────┐                  │
│  ┌─────────────┐              │  앱에서     │                  │
│  │ DICOM →    │              │  API 호출   │                  │
│  │ Canvas 변환 │              │  (앱 책임)  │                  │
│  └─────────────┘              └─────────────┘                  │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────┐                                                │
│  │ SVG 렌더링  │                                                │
│  └─────────────┘                                                │
│                                                                 │
│  핵심: 내부 저장은 항상 DICOM 픽셀 좌표                          │
│       렌더링 시에만 Canvas 좌표로 변환                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 설정 시스템

### 권한 설정 (PermissionConfig)

```typescript
interface PermissionConfig {
  // 출처별 기본 권한 (확장 가능)
  sourcePermissions: Record<string, PermissionSet>;

  // 개별 어노테이션 권한 오버라이드 (선택적)
  getPermission?: (annotation: Annotation) => PermissionSet;
}

interface PermissionSet {
  deletable: boolean;
  editable: boolean;
  countable: boolean;
  hideable: boolean;
}

// 기본값
const DEFAULT_PERMISSIONS: PermissionConfig = {
  sourcePermissions: {
    ai: { deletable: false, editable: true, countable: false, hideable: true },
    user: { deletable: true, editable: true, countable: true, hideable: true },
    server: { deletable: true, editable: true, countable: false, hideable: true },
  },
};
```

### 제한 설정 (LimitConfig)

```typescript
interface LimitConfig {
  // 전역 제한
  global?: {
    maxPerDicom?: number;     // DICOM당 최대 개수
  };

  // 도구별 제한 (선택적)
  perTool?: Record<string, {
    maxPerDicom?: number;
  }>;

  // 출처별 제한 (countable=true인 것만 적용)
  perSource?: Record<string, {
    maxPerDicom?: number;
  }>;
}

// 기본값
const DEFAULT_LIMITS: LimitConfig = {
  perSource: {
    user: { maxPerDicom: 15 },
  },
};
```

---

## 내보내기/가져오기 시스템

### 내보내기 포맷 (v1.0)

```typescript
/**
 * DICOM 기반 좌표로 변환된 어노테이션 데이터
 * 서버 저장 및 외부 시스템 연동용
 */
interface ExportedAnnotationData {
  // 포맷 버전
  version: '1.0';

  // DICOM 정보
  dicomId: string;
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  sopInstanceUID?: string;

  // 어노테이션 목록
  annotations: ExportedAnnotation[];

  // 내보내기 정보
  exportedAt: string;  // ISO 8601
}

interface ExportedAnnotation {
  // 식별자
  id: string;
  frameIndex: number;

  // 도구 정보
  type: string;           // 'length', 'angle', 'ellipse', etc.
  mode: DicomMode;        // 'B', 'M', 'D'

  // DICOM 픽셀 좌표 (원본 이미지 기준)
  points: Array<{
    x: number;            // 픽셀 X (정수)
    y: number;            // 픽셀 Y (정수)
  }>;

  // 계산된 값
  measurement: {
    value: number;        // 45.2
    unit: string;         // 'mm', 'cm/s', 'ms'
    displayText: string;  // '45.2 mm'
  };

  // 캘리브레이션 정보 (재계산용)
  calibration: {
    physicalDeltaX: number;
    physicalDeltaY: number;
    unitX: number;
    unitY: number;
    baseLine?: number;    // D-mode
  };

  // 표시 설정
  display: {
    labelPosition: { x: number; y: number };
    color?: string;
    visible: boolean;
  };

  // 메타데이터
  metadata: {
    source: string;       // 'ai', 'user', 'server'
    createdAt: string;    // ISO 8601
    updatedAt: string;
    createdBy?: string;   // 사용자 ID (선택적)
    customData?: Record<string, unknown>;  // 확장 데이터
  };
}
```

### 내보내기/가져오기 인터페이스

```typescript
interface AnnotationManager {
  // 내보내기
  export(dicomId: string): ExportedAnnotationData;
  exportFrame(dicomId: string, frameIndex: number): ExportedAnnotationData;
  exportAll(): ExportedAnnotationData[];

  // 가져오기
  import(data: ExportedAnnotationData, options?: ImportOptions): void;

  // 유효성 검증
  validate(data: unknown): ValidationResult;
}

interface ImportOptions {
  // 기존 어노테이션 처리
  conflictStrategy: 'replace' | 'skip' | 'merge';

  // 가져온 데이터의 출처 설정
  sourceOverride?: string;

  // 권한 오버라이드 (선택적)
  permissionOverride?: Partial<PermissionSet>;
}
```

### 사용 예시 (앱에서)

```typescript
// EchoPixel 사용
import { createAnnotationManager } from '@echopixel/core';

const manager = createAnnotationManager();

// 내보내기 (EchoPixel 제공)
const exportData = manager.export(dicomId);

// 서버 저장 (앱에서 구현)
await fetch(`/api/annotations/${dicomId}`, {
  method: 'POST',
  body: JSON.stringify(exportData),
});

// 서버에서 로드 (앱에서 구현)
const serverData = await fetch(`/api/annotations/${dicomId}`).then(r => r.json());

// 가져오기 (EchoPixel 제공)
manager.import(serverData, {
  sourceOverride: 'server',
  conflictStrategy: 'replace',
});
```

---

## DataSource 책임 범위

### 설계 원칙

EchoPixel은 **렌더링 라이브러리**로서, 네트워크 통신은 앱의 책임으로 둔다.

```
┌─────────────────────────────────────────────────────────────────┐
│                    권장 데이터 흐름                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [앱]                              [EchoPixel]                  │
│                                                                 │
│  ┌─────────────┐                                                │
│  │ WADO-RS/URI │  앱에서 직접 구현                              │
│  │ 통신        │  - 인증 (OAuth, JWT)                          │
│  │             │  - 캐싱 전략                                   │
│  │             │  - 재시도 로직                                 │
│  └──────┬──────┘                                                │
│         │ ArrayBuffer                                           │
│         ▼                                                       │
│  ┌─────────────┐    loadDicom()    ┌─────────────┐             │
│  │   앱 코드   │ ───────────────▶  │  EchoPixel  │             │
│  └─────────────┘                   │  - 파싱     │             │
│                                    │  - 디코딩   │             │
│                                    │  - 렌더링   │             │
│                                    └─────────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### EchoPixel 데이터 입력 인터페이스

```typescript
// 방법 1: ArrayBuffer (DICOM 파일 전체) - 권장
viewer.loadDicom(arrayBuffer: ArrayBuffer);

// 방법 2: 파싱된 데이터 (고급 사용)
viewer.loadParsedDicom({
  metadata: DicomMetadata,
  frames: ImageBitmap[] | ArrayBuffer[],
});

// 방법 3: 내장 DataSource 사용 (편의 기능, 간단한 케이스용)
viewer.loadFromWadoRs({
  baseUrl: 'https://pacs.example.com/dicomweb',
  studyUID: '...',
  seriesUID: '...',
});
```

### 앱에서 WADO-RS 구현 예시

```typescript
// 앱에서 구현하는 DICOM 로더
class MyDicomLoader {
  constructor(
    private baseUrl: string,
    private authService: AuthService,  // 앱의 인증 서비스
    private cacheService: CacheService, // 앱의 캐시 서비스
  ) {}

  async loadSeries(studyUID: string, seriesUID: string): Promise<ArrayBuffer[]> {
    // 1. 캐시 확인 (앱 정책)
    const cached = await this.cacheService.get(`${studyUID}/${seriesUID}`);
    if (cached) return cached;

    // 2. 인증 토큰 (앱 정책)
    const token = await this.authService.getToken();

    // 3. WADO-RS 호출 (앱 구현)
    const response = await fetch(
      `${this.baseUrl}/studies/${studyUID}/series/${seriesUID}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'multipart/related; type="application/dicom"',
        },
      }
    );

    // 4. 에러 처리 (앱 정책)
    if (!response.ok) {
      throw new MyAppError('DICOM 로드 실패', response.status);
    }

    const data = await this.parseMultipart(response);

    // 5. 캐싱 (앱 정책)
    await this.cacheService.set(`${studyUID}/${seriesUID}`, data);

    return data;
  }
}

// 앱에서 EchoPixel 사용
const loader = new MyDicomLoader(wadoUrl, authService, cacheService);
const dicomData = await loader.loadSeries(studyUID, seriesUID);

// EchoPixel에 데이터 전달
dicomData.forEach((arrayBuffer, index) => {
  viewer.loadDicom(arrayBuffer, { viewportIndex: index });
});
```

### 내장 DataSource (옵셔널)

EchoPixel은 간단한 사용 케이스를 위해 기본 DataSource를 제공하나, **프로덕션에서는 앱 구현 권장**.

```typescript
// 내장 DataSource 사용 (개발/테스트용)
import { WadoRsDataSource, LocalFileDataSource } from '@echopixel/core';

// 주의: 인증, 고급 캐싱, 커스텀 에러 처리 미지원
const dataSource = new WadoRsDataSource({ baseUrl: 'http://localhost:8080' });
```

| 기능 | 내장 DataSource | 앱 구현 권장 |
|------|-----------------|-------------|
| 기본 fetch | ✅ | ✅ |
| 인증 (OAuth/JWT) | ❌ | ✅ |
| 커스텀 헤더 | 제한적 | ✅ |
| 고급 캐싱 (SW, IndexedDB) | ❌ | ✅ |
| 커스텀 재시도 로직 | 기본 | ✅ |
| 앱 에러 UI 통합 | ❌ | ✅ |

---

## 플러그인 시스템

### 도구 플러그인

```typescript
interface MeasurementToolPlugin {
  // 메타데이터
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly supportedModes: DicomMode[];

  // 팩토리
  createTool(config?: ToolConfig): MeasurementTool;

  // 렌더러 (선택적 커스텀)
  createRenderer?(): AnnotationRenderer;

  // 계산기 (선택적 커스텀)
  createCalculator?(): MeasurementCalculator;
}

// 커스텀 도구 등록
manager.registerTool({
  id: 'custom-cardiac-volume',
  name: 'Cardiac Volume',
  supportedModes: ['B'],
  createTool: () => new CardiacVolumeTool(),
});
```

### 좌표 계산기 플러그인

```typescript
interface CoordinateCalculator {
  readonly mode: DicomMode;

  // 측정값 계산
  calculate(
    type: MeasurementType,
    points: Point[],
    calibration: CalibrationData
  ): MeasurementResult;
}

// 커스텀 모드 등록
coordinateSystem.registerCalculator('PW', new PWDopplerCalculator());
```

### 렌더러 플러그인

```typescript
interface AnnotationRenderer {
  render(annotations: Annotation[], viewport: ViewportInfo): void;
  dispose(): void;
  hitTest(point: Point): HitTestResult | null;
}

// 렌더러 타입 선택
const manager = createAnnotationManager({
  renderer: 'svg',  // 'svg' | 'canvas' | 'webgl'
});
```

---

## 내부 데이터 구조

### 어노테이션

```typescript
interface Annotation {
  id: string;
  dicomId: string;
  frameIndex: number;

  // 도구 정보
  type: AnnotationType;
  mode: DicomMode;

  // DICOM 픽셀 좌표 (정수)
  points: Point[];

  // 계산 결과
  value: number;
  unit: string;
  displayValue: string;

  // 표시 설정
  labelPosition: Point;
  color?: string;
  visible: boolean;

  // 권한 (source 기반 자동 결정 또는 오버라이드)
  source: string;
  deletable: boolean;
  editable: boolean;

  // 메타데이터
  createdAt: number;
  updatedAt: number;
  customData?: Record<string, unknown>;
}
```

### Undo/Redo 시스템

```typescript
interface AnnotationCommand {
  type: 'create' | 'update' | 'delete';
  annotationId: string;
  dicomId: string;
  frameIndex: number;
  previousState: Annotation | null;
  newState: Annotation | null;
  timestamp: number;
}

interface HistoryManager {
  // 초기 상태 (import된 데이터)
  initialState: Map<string, Annotation>;

  // 스택
  undoStack: AnnotationCommand[];
  redoStack: AnnotationCommand[];
  maxStackSize: number;  // 기본값: 50

  // 메서드
  push(command: AnnotationCommand): void;
  undo(): void;
  redo(): void;
  resetToInitial(): void;
  hasChanges(): boolean;
}
```

---

## 좌표 변환 시스템

### Viviane 방식 적용

```typescript
interface CalibrationData {
  physicalDeltaX: number;  // 픽셀당 물리값 (X축)
  physicalDeltaY: number;  // 픽셀당 물리값 (Y축)
  unitX: number;           // DICOM 단위 코드 (0-9)
  unitY: number;           // DICOM 단위 코드 (0-9)
  baseLine?: number;       // D-mode 기준선
}

// 모드별 좌표 의미
// B-mode: X=거리(mm), Y=거리(mm) - 등방성
// M-mode: X=시간(ms), Y=거리(mm) - 비등방성
// D-mode: X=시간(ms), Y=속도(cm/s) - 비등방성 + baseline
```

### DICOM 단위 코드

| 코드 | 단위 | 설명 |
|------|------|------|
| 0 | none | 없음 |
| 1 | % | 퍼센트 |
| 2 | dB | 데시벨 |
| 3 | cm | 센티미터 (길이) |
| 4 | s | 초 (시간) |
| 5 | Hz | 헤르츠 |
| 6 | dB/s | - |
| 7 | cm/s | 속도 |
| 8 | cm² | 면적 |
| 9 | cm²/s | 체적 유량 |

---

## 파일 구조

```
packages/core/src/annotations/
├── index.ts
├── types.ts                    # 타입 정의
├── AnnotationManager.ts        # 고수준 API
├── AnnotationStore.ts          # 상태 관리
├── HistoryManager.ts           # Undo/Redo
├── Exporter.ts                 # 내보내기
├── Importer.ts                 # 가져오기
├── PluginRegistry.ts           # 플러그인 등록
├── coordinates/
│   ├── index.ts
│   ├── CoordinateSystem.ts     # 좌표 변환
│   ├── BModeCalculator.ts
│   ├── MModeCalculator.ts
│   └── DModeCalculator.ts
├── tools/
│   ├── index.ts
│   ├── MeasurementTool.ts      # 추상 기본 클래스
│   ├── LengthTool.ts
│   ├── AngleTool.ts
│   ├── PointTool.ts
│   ├── EllipseTool.ts
│   ├── TraceTool.ts
│   └── VTITool.ts
├── renderers/
│   ├── index.ts
│   ├── AnnotationRenderer.ts   # 추상 인터페이스
│   └── SVGRenderer.ts          # SVG 구현
└── utils/
    ├── geometry.ts             # 기하 계산
    └── unit-conversion.ts      # 단위 변환

packages/react/src/components/
├── annotations/
│   ├── SVGOverlay.tsx          # SVG 오버레이
│   ├── AnnotationShape.tsx     # 개별 도형
│   ├── MeasurementLabel.tsx    # 측정값 라벨
│   └── DragHandle.tsx          # 드래그 핸들
└── building-blocks/
    └── DicomMiniOverlay.tsx    # 도구 버튼 추가
```

---

## 구현 단계

### Phase 3a: 기본 인프라 (1차)

1. **타입 및 인터페이스 정의**
   - Annotation, AnnotationConfig
   - ExportedAnnotationData (v1.0)
   - PermissionConfig, LimitConfig

2. **AnnotationStore 구현**
   - Map 기반 저장소
   - CRUD 메서드
   - 설정 기반 권한/제한 로직

3. **Exporter/Importer 구현**
   - DICOM 좌표 기반 JSON 생성
   - 유효성 검증
   - ImportOptions 처리

4. **HistoryManager 구현**
   - Command Pattern
   - Undo/Redo 스택
   - 초기 데이터 리셋

5. **좌표 변환 시스템**
   - Viviane 방식 적용
   - B/M/D 모드별 계산기

### Phase 3b: 측정 도구 (2차)

1. **MeasurementTool 기본 클래스**
2. **LengthTool** (B-mode, M-mode)
3. **AngleTool** (B-mode)
4. **PointTool** (D-mode 속도)

### Phase 3c: SVG 오버레이 (3차)

1. **SVGOverlay 컴포넌트**
2. **AnnotationShape 렌더링**
3. **프레임 동기화**
4. **드래그 핸들 (선택/수정)**

### Phase 3d: 확장 도구 (4차)

1. **EllipseTool**
2. **TraceTool**
3. **VTITool**
4. **숨김 기능**

### Phase 3e: 통합 (5차)

1. **HybridMultiViewport 통합**
2. **DicomMiniOverlay 도구 버튼**
3. **플러그인 시스템 테스트**
4. **데모 앱 연동**

---

## 성능 최적화

### 렌더링 최적화

```typescript
interface RenderOptimization {
  // 프레임당 최대 렌더링 어노테이션
  maxRenderPerFrame: number;  // 기본: 100

  // 뷰포트 밖 어노테이션 스킵
  cullOutOfView: boolean;  // 기본: true

  // 배치 렌더링 (같은 타입 그룹화)
  batchRendering: boolean;  // 기본: true
}
```

### 메모리 최적화

```typescript
interface MemoryOptimization {
  // 히스토리 스택 제한
  maxHistorySize: number;  // 기본: 50
}
```

### 이벤트 최적화

- 드래그 중 업데이트 쓰로틀링: ~60fps (16ms)
- Undo 스택: 드래그 시작 시점에만 저장

---

## 검증 항목

### 기능 테스트

- [ ] Length 측정 (B-mode)
- [ ] Length 측정 (M-mode)
- [ ] Angle 측정
- [ ] Point 속도 측정 (D-mode)
- [ ] 측정값 라벨 드래그
- [ ] 어노테이션 선택/수정/삭제
- [ ] Undo/Redo
- [ ] 초기 데이터 리셋
- [ ] 개수 제한 (15개/DICOM)
- [ ] 프레임별 표시 동기화

### 권한 테스트

- [ ] AI 측정: 삭제 불가
- [ ] AI 측정: 수정 가능
- [ ] User 측정: 삭제/수정 가능
- [ ] User 측정만 카운트
- [ ] 커스텀 권한 설정

### 내보내기/가져오기 테스트

- [ ] DICOM 좌표로 정확히 내보내기
- [ ] 가져오기 후 정확히 복원
- [ ] 유효성 검증
- [ ] conflictStrategy 동작

### 성능 테스트

- [ ] 16개 뷰포트 동시 렌더링
- [ ] 30fps 재생 시 어노테이션 동기화
- [ ] 다수 어노테이션 (AI 50개 + User 15개)

### 플러그인 테스트

- [ ] 커스텀 도구 등록
- [ ] 커스텀 좌표 계산기
- [ ] 설정 기반 권한 변경

---

## 의존성

- Phase 2 완료 (HybridMultiViewport)
- Tool System 완료 (Phase 2f)
- DICOM Calibration 데이터 접근

---

> 작성일: 2026-01-20
> 수정일: 2026-01-20 (유연성 검토 반영)
> 상태: 계획 완료, 구현 대기
