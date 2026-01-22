# 어노테이션 (측정 도구)

어노테이션은 DICOM 영상 위에 측정선, 각도, 마커 등을 표시하는 기능입니다. 이 문서에서는 어노테이션의 사용법과 커스터마이징 방법을 설명합니다.

---

## 목차

1. [어노테이션 개요](#어노테이션-개요)
2. [어노테이션 표시하기](#어노테이션-표시하기)
3. [어노테이션 생성하기](#어노테이션-생성하기)
4. [어노테이션 수정/삭제](#어노테이션-수정삭제)
5. [어노테이션 타입 상세](#어노테이션-타입-상세)
6. [캘리브레이션](#캘리브레이션)
7. [어노테이션 저장/불러오기](#어노테이션-저장불러오기)

---

## 어노테이션 개요

### 지원되는 어노테이션 타입

| 타입 | 설명 | 포인트 수 | 측정값 |
|------|------|-----------|--------|
| `length` | 길이 측정 | 2 | mm, cm, px |
| `angle` | 각도 측정 | 3 | degrees (°) |
| `point` | 마커 | 1 | 없음 |

### 어노테이션 구조

```typescript
interface Annotation {
  id: string;              // 고유 식별자
  dicomId: string;         // 연결된 DICOM 식별자
  frameIndex: number;      // 표시될 프레임 인덱스
  type: 'length' | 'angle' | 'point';  // 어노테이션 타입

  // 좌표 (DICOM 픽셀 좌표계)
  points: Array<{ x: number; y: number }>;

  // 측정값
  value: number;           // 측정된 값
  unit: string;            // 단위 (mm, deg 등)
  displayValue: string;    // 표시 문자열 ("52.3 mm")

  // 라벨 위치
  labelPosition: { x: number; y: number };

  // 스타일
  color: string;           // 색상 ("#00ff00")

  // 상태
  visible: boolean;        // 표시 여부
  source: 'user' | 'ai';   // 생성 주체
  deletable: boolean;      // 삭제 가능 여부
  editable: boolean;       // 수정 가능 여부

  // 메타데이터
  createdAt: number;       // 생성 시간 (Unix timestamp)
  updatedAt: number;       // 수정 시간
}
```

---

## 어노테이션 표시하기

### 기본 사용법

```tsx
import { useState } from 'react';
import { SingleDicomViewer } from '@echopixel/react';
import { type Annotation } from '@echopixel/core';

function ViewerWithAnnotations({ viewportData }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([
    {
      id: 'length-1',
      dicomId: 'dicom-001',
      frameIndex: 0,
      type: 'length',
      points: [
        { x: 100, y: 100 },
        { x: 200, y: 150 }
      ],
      value: 52.3,
      unit: 'mm',
      displayValue: '52.3 mm',
      labelPosition: { x: 150, y: 80 },
      color: '#00ff00',
      visible: true,
      source: 'user',
      deletable: true,
      editable: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  ]);

  return (
    <SingleDicomViewer
      frames={viewportData.frames}
      imageInfo={viewportData.imageInfo}
      isEncapsulated={viewportData.isEncapsulated}
      width={768}
      height={576}
      annotations={annotations}
      showAnnotations={true}
    />
  );
}
```

### 어노테이션 표시/숨기기

```tsx
function ViewerWithToggle({ viewportData }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([/* ... */]);
  const [showAnnotations, setShowAnnotations] = useState(true);

  return (
    <div>
      <button onClick={() => setShowAnnotations(!showAnnotations)}>
        {showAnnotations ? '어노테이션 숨기기' : '어노테이션 표시'}
      </button>

      <SingleDicomViewer
        {...viewportData}
        width={768}
        height={576}
        annotations={annotations}
        showAnnotations={showAnnotations}
        onAnnotationsVisibilityChange={setShowAnnotations}
      />
    </div>
  );
}
```

---

## 어노테이션 생성하기

### 도구바를 통한 생성

`SingleDicomViewer`에서 `showToolbar={true}`로 설정하면 측정 도구 버튼이 표시됩니다:

```tsx
<SingleDicomViewer
  {...viewportData}
  width={768}
  height={576}
  showToolbar={true}  // 도구바 표시
  annotations={annotations}
  onAnnotationUpdate={handleAnnotationUpdate}
/>
```

### 생성 과정

1. 도구바에서 측정 도구 선택 (Length, Angle, Point)
2. 영상 위에서 클릭하여 포인트 배치
3. 필요한 포인트를 모두 배치하면 어노테이션 완성
4. `onAnnotationUpdate` 콜백으로 새 어노테이션 전달

### 콜백 처리

```tsx
function ViewerWithCreation({ viewportData }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const handleAnnotationUpdate = (annotation: Annotation) => {
    setAnnotations(prev => {
      // 기존 어노테이션이면 업데이트
      const index = prev.findIndex(a => a.id === annotation.id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = annotation;
        return updated;
      }
      // 새 어노테이션이면 추가
      return [...prev, annotation];
    });
  };

  return (
    <SingleDicomViewer
      {...viewportData}
      width={768}
      height={576}
      annotations={annotations}
      onAnnotationUpdate={handleAnnotationUpdate}
    />
  );
}
```

---

## 어노테이션 수정/삭제

### 선택 및 수정

```tsx
function ViewerWithEditing({ viewportData }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([/* ... */]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleAnnotationUpdate = (annotation: Annotation) => {
    setAnnotations(prev => prev.map(a =>
      a.id === annotation.id ? annotation : a
    ));
  };

  const handleAnnotationSelect = (id: string | null) => {
    setSelectedId(id);
    // 선택된 어노테이션 정보 표시 등
  };

  return (
    <SingleDicomViewer
      {...viewportData}
      width={768}
      height={576}
      annotations={annotations}
      onAnnotationUpdate={handleAnnotationUpdate}
      onAnnotationSelect={handleAnnotationSelect}
      selectedAnnotationId={selectedId}
    />
  );
}
```

### 삭제 처리

```tsx
function ViewerWithDeletion({ viewportData }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([/* ... */]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleAnnotationDelete = (id: string) => {
    // deletable이 true인 어노테이션만 삭제
    setAnnotations(prev => prev.filter(a => a.id !== id));

    // 선택 해제
    if (selectedId === id) {
      setSelectedId(null);
    }
  };

  return (
    <div>
      <SingleDicomViewer
        {...viewportData}
        width={768}
        height={576}
        annotations={annotations}
        onAnnotationDelete={handleAnnotationDelete}
        selectedAnnotationId={selectedId}
        onAnnotationSelect={setSelectedId}
      />

      {/* 선택된 어노테이션 정보 표시 */}
      {selectedId && (
        <div>
          <p>선택된 어노테이션: {selectedId}</p>
          <button onClick={() => handleAnnotationDelete(selectedId)}>
            삭제
          </button>
        </div>
      )}
    </div>
  );
}
```

### 수정 불가 어노테이션

`editable: false` 또는 `deletable: false`로 설정된 어노테이션은 수정/삭제가 불가능합니다:

```tsx
const aiGeneratedAnnotation: Annotation = {
  id: 'ai-marker-1',
  // ...
  source: 'ai',
  deletable: false,  // 삭제 불가
  editable: false,   // 수정 불가
};
```

---

## 어노테이션 타입 상세

### Length (길이 측정)

두 점 사이의 거리를 측정합니다.

```typescript
const lengthAnnotation: Annotation = {
  id: 'length-1',
  type: 'length',
  points: [
    { x: 100, y: 100 },  // 시작점
    { x: 200, y: 150 }   // 끝점
  ],
  value: 52.3,
  unit: 'mm',
  displayValue: '52.3 mm',
  // ...
};
```

**표시 형태**:
- 두 점을 잇는 선
- 양 끝에 작은 직교선 (엔드캡)
- 중앙 근처에 측정값 라벨

### Angle (각도 측정)

세 점으로 각도를 측정합니다.

```typescript
const angleAnnotation: Annotation = {
  id: 'angle-1',
  type: 'angle',
  points: [
    { x: 100, y: 100 },  // 첫 번째 선 끝점
    { x: 150, y: 150 },  // 꼭지점 (vertex)
    { x: 200, y: 100 }   // 두 번째 선 끝점
  ],
  value: 72.8,
  unit: 'deg',
  displayValue: '72.8°',
  // ...
};
```

**표시 형태**:
- 두 개의 선 (꼭지점에서 양쪽으로)
- 꼭지점에 호(arc) 표시
- 각도 값 라벨

### Point (마커)

단일 점을 표시합니다.

```typescript
const pointAnnotation: Annotation = {
  id: 'point-1',
  type: 'point',
  points: [
    { x: 150, y: 150 }  // 마커 위치
  ],
  value: 0,
  unit: '',
  displayValue: 'Marker',
  // ...
};
```

**표시 형태**:
- 십자형 또는 원형 마커
- 선택적 라벨

---

## 캘리브레이션

### 캘리브레이션이란?

캘리브레이션은 **픽셀과 실제 물리적 거리 간의 변환 비율**입니다. 올바른 캘리브레이션이 있어야 정확한 측정값(mm, cm)을 얻을 수 있습니다.

### 캘리브레이션 소스

1. **Pixel Spacing (DICOM 태그)**
   - 태그: `(0028,0030)`
   - CT, MR 등에서 제공
   - 가장 신뢰할 수 있는 소스

2. **Ultrasound Calibration (초음파)**
   - 태그: `(0018,6011)` Sequence
   - 초음파 영상에서 제공
   - Physical Delta X/Y 값 사용

3. **수동 캘리브레이션**
   - 사용자가 알려진 길이를 기준으로 설정

### 캘리브레이션 적용

```tsx
import { createCalibrationFromImageInfo } from '@echopixel/core';

function CalibratedViewer({ viewportData }) {
  // imageInfo에서 캘리브레이션 자동 추출
  const calibration = createCalibrationFromImageInfo(viewportData.imageInfo);

  console.log('Calibration:', calibration);
  // { pixelSpacing: [0.5, 0.5], unit: 'mm' }

  return (
    <SingleDicomViewer
      {...viewportData}
      width={768}
      height={576}
      // 캘리브레이션은 imageInfo에 포함되어 자동 적용됨
    />
  );
}
```

### 캘리브레이션이 없는 경우

캘리브레이션 정보가 없으면 측정값이 **픽셀(px)** 단위로 표시됩니다:

```
52.3 px  (캘리브레이션 없음)
52.3 mm  (캘리브레이션 있음)
```

---

## 어노테이션 저장/불러오기

### JSON으로 저장

```tsx
function ViewerWithPersistence({ viewportData }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  // 저장
  const saveAnnotations = () => {
    const json = JSON.stringify(annotations);
    localStorage.setItem('dicom-annotations', json);
  };

  // 불러오기
  const loadAnnotations = () => {
    const json = localStorage.getItem('dicom-annotations');
    if (json) {
      const loaded = JSON.parse(json);
      setAnnotations(loaded);
    }
  };

  return (
    <div>
      <button onClick={saveAnnotations}>저장</button>
      <button onClick={loadAnnotations}>불러오기</button>

      <SingleDicomViewer
        {...viewportData}
        width={768}
        height={576}
        annotations={annotations}
        onAnnotationUpdate={/* ... */}
      />
    </div>
  );
}
```

### 서버에 저장

```tsx
const saveToServer = async (annotations: Annotation[]) => {
  await fetch('/api/annotations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dicomId: 'study-123',
      annotations
    })
  });
};

const loadFromServer = async (dicomId: string): Promise<Annotation[]> => {
  const response = await fetch(`/api/annotations?dicomId=${dicomId}`);
  const data = await response.json();
  return data.annotations;
};
```

### 좌표계 주의사항

어노테이션 좌표는 **DICOM 픽셀 좌표계**로 저장됩니다:
- 원점: 이미지 좌상단
- X: 오른쪽으로 증가
- Y: 아래로 증가
- 범위: 0 ~ (columns-1), 0 ~ (rows-1)

화면 좌표가 아닌 DICOM 좌표로 저장되므로, 뷰포트 크기가 달라져도 어노테이션 위치가 정확합니다.

---

## 스타일 커스터마이징

### 색상 변경

```tsx
const customColorAnnotation: Annotation = {
  // ...
  color: '#ff6600',  // 주황색
};
```

### 권장 색상

| 용도 | 색상 | 코드 |
|------|------|------|
| 사용자 측정 | 초록색 | `#00ff00` |
| AI 감지 | 분홍색 | `#ff00ff` |
| 경고/이상 | 빨간색 | `#ff0000` |
| 참조선 | 노란색 | `#ffff00` |

---

## 다음 단계

- [데이터 소스](./datasources.md) - WADO-RS 연동
- [고급 사용법](./advanced.md) - 성능 최적화
- [문제 해결](./troubleshooting.md) - 자주 발생하는 문제
