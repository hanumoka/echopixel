# 컴포넌트 가이드

EchoPixel React 패키지는 다양한 사용 사례에 맞는 컴포넌트를 제공합니다. 이 문서에서는 각 컴포넌트의 사용법과 옵션을 설명합니다.

---

## 목차

1. [컴포넌트 개요](#컴포넌트-개요)
2. [SingleDicomViewer](#singledicomviewer)
3. [SingleDicomViewerGroup](#singledicomviewergroup)
4. [HybridMultiViewport](#hybridmultiviewport)
5. [Building Blocks](#building-blocks)
6. [언제 어떤 컴포넌트를 사용할까?](#언제-어떤-컴포넌트를-사용할까)

---

## 컴포넌트 개요

### 고수준 컴포넌트 (Composed Components)

| 컴포넌트 | 설명 | 최대 뷰포트 | 사용 사례 |
|----------|------|-------------|-----------|
| `SingleDicomViewer` | 단일 DICOM 뷰어 | 1개 | 단일 영상 표시 |
| `SingleDicomViewerGroup` | 다중 독립 뷰어 그룹 | 8~16개 | 소규모 멀티 뷰포트 |
| `HybridMultiViewport` | 대규모 멀티 뷰포트 | 100개+ | 스트레스 에코 등 |

### Building Blocks (저수준 컴포넌트)

| 컴포넌트 | 설명 |
|----------|------|
| `DicomCanvas` | 순수 WebGL 캔버스 |
| `DicomControls` | 재생/정지, FPS 컨트롤 |
| `DicomStatusBar` | 이미지 정보 표시 |
| `DicomToolbar` | 도구 선택 툴바 |
| `DicomToolInfo` | 마우스/키보드 바인딩 안내 |
| `DicomMiniOverlay` | 멀티 뷰포트용 간소화 오버레이 |

---

## SingleDicomViewer

**단일 DICOM 영상을 표시하는 완전한 뷰어 컴포넌트**입니다.

### 기본 사용법

```tsx
import { SingleDicomViewer } from '@echopixel/react';

function MyViewer({ viewportData }) {
  return (
    <SingleDicomViewer
      frames={viewportData.frames}
      imageInfo={viewportData.imageInfo}
      isEncapsulated={viewportData.isEncapsulated}
      width={768}
      height={576}
    />
  );
}
```

### Props 상세

#### 필수 Props

| Prop | 타입 | 설명 |
|------|------|------|
| `frames` | `Uint8Array[]` | 프레임 데이터 배열. 단일 프레임이면 길이 1인 배열 |
| `imageInfo` | `DicomImageInfo` | DICOM 이미지 메타데이터 |
| `isEncapsulated` | `boolean` | 압축된 데이터인지 여부 (JPEG, JPEG2000 등) |

#### 선택적 Props - 크기 설정

| Prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `width` | `number` | 자동 | 뷰포트 너비 (픽셀) |
| `height` | `number` | 자동 | 뷰포트 높이 (픽셀) |

#### 선택적 Props - UI 설정

| Prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `showToolbar` | `boolean` | `true` | 도구 선택 툴바 표시 |
| `showControls` | `boolean` | `true` | 재생 컨트롤 표시 |
| `showStatusBar` | `boolean` | `true` | 상태바 표시 |
| `showToolInfo` | `boolean` | `true` | 마우스/키보드 바인딩 안내 표시 |

#### 선택적 Props - 재생 설정

| Prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `initialFps` | `number` | `30` | 초기 재생 FPS |

#### 선택적 Props - 어노테이션

| Prop | 타입 | 설명 |
|------|------|------|
| `annotations` | `Annotation[]` | 표시할 어노테이션 목록 |
| `onAnnotationUpdate` | `(annotation) => void` | 어노테이션 수정 콜백 |
| `onAnnotationSelect` | `(id) => void` | 어노테이션 선택 콜백 |
| `onAnnotationDelete` | `(id) => void` | 어노테이션 삭제 콜백 |
| `selectedAnnotationId` | `string` | 현재 선택된 어노테이션 ID |
| `showAnnotations` | `boolean` | 어노테이션 표시 여부 |

### Handle (ref)

`SingleDicomViewer`는 `ref`를 통해 명령형 API를 제공합니다:

```tsx
import { useRef } from 'react';
import { SingleDicomViewer, type SingleDicomViewerHandle } from '@echopixel/react';

function MyViewer({ viewportData }) {
  const viewerRef = useRef<SingleDicomViewerHandle>(null);

  const handlePlayPause = () => {
    if (viewerRef.current) {
      viewerRef.current.togglePlay();
    }
  };

  const handleReset = () => {
    if (viewerRef.current) {
      viewerRef.current.resetViewport(); // 뷰포트 초기화 (W/L, 위치, 줌)
    }
  };

  return (
    <>
      <SingleDicomViewer
        ref={viewerRef}
        {...viewportData}
        width={768}
        height={576}
      />
      <button onClick={handlePlayPause}>재생/정지</button>
      <button onClick={handleReset}>초기화</button>
    </>
  );
}
```

#### Handle 메서드

| 메서드 | 설명 |
|--------|------|
| `play()` | 재생 시작 |
| `pause()` | 재생 정지 |
| `togglePlay()` | 재생/정지 토글 |
| `setFps(fps)` | FPS 설정 |
| `goToFrame(index)` | 특정 프레임으로 이동 |
| `resetViewport()` | 뷰포트 초기화 (W/L, 위치, 줌) |
| `resetActiveTool()` | 현재 활성화된 도구 상태 초기화 |
| `getActiveMeasurementToolId()` | 현재 활성화된 측정 도구 ID 반환 (없으면 `null`) |
| `getState()` | 현재 상태 반환 `{ isPlaying, currentFrame, fps, totalFrames }` |

### 전체 예제

```tsx
import { useState, useRef } from 'react';
import { SingleDicomViewer, type SingleDicomViewerHandle } from '@echopixel/react';
import { type Annotation } from '@echopixel/core';

function FullFeaturedViewer({ viewportData }) {
  const viewerRef = useRef<SingleDicomViewerHandle>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);

  const handleAnnotationUpdate = (annotation: Annotation) => {
    setAnnotations(prev => {
      const index = prev.findIndex(a => a.id === annotation.id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = annotation;
        return updated;
      }
      return [...prev, annotation];
    });
  };

  const handleAnnotationDelete = (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
    }
  };

  return (
    <div>
      <SingleDicomViewer
        ref={viewerRef}
        frames={viewportData.frames}
        imageInfo={viewportData.imageInfo}
        isEncapsulated={viewportData.isEncapsulated}
        width={1024}
        height={768}
        showToolbar={true}
        showControls={true}
        showStatusBar={true}
        showToolInfo={true}
        initialFps={30}
        annotations={annotations}
        onAnnotationUpdate={handleAnnotationUpdate}
        onAnnotationSelect={setSelectedId}
        onAnnotationDelete={handleAnnotationDelete}
        selectedAnnotationId={selectedId}
        showAnnotations={showAnnotations}
        onAnnotationsVisibilityChange={setShowAnnotations}
      />
    </div>
  );
}
```

---

## SingleDicomViewerGroup

**여러 개의 SingleDicomViewer를 그리드로 배치**하는 컴포넌트입니다.

### 언제 사용하나요?

- 2~16개의 DICOM 영상을 동시에 표시해야 할 때
- 각 뷰포트가 독립적인 WebGL 컨텍스트를 가져야 할 때
- 뷰포트 간 영상 비교가 필요할 때

> ⚠️ **제한사항**: 브라우저는 보통 8~16개의 WebGL 컨텍스트만 동시에 유지합니다. 더 많은 뷰포트가 필요하면 `HybridMultiViewport`를 사용하세요.

### 기본 사용법

```tsx
import { SingleDicomViewerGroup, type ViewerData } from '@echopixel/react';

function MultiViewer({ viewers }: { viewers: ViewerData[] }) {
  return (
    <SingleDicomViewerGroup
      viewers={viewers}
      columns={2}
      viewportWidth={512}
      viewportHeight={384}
    />
  );
}
```

### ViewerData 타입

```typescript
interface ViewerData {
  id: string;                    // 고유 식별자
  frames: Uint8Array[];          // 프레임 데이터
  imageInfo: DicomImageInfo;     // 이미지 정보
  isEncapsulated?: boolean;      // 압축 여부
  annotations?: Annotation[];    // 어노테이션 (선택)
}
```

### Props 상세

| Prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `viewers` | `ViewerData[]` | - | 뷰어 데이터 배열 |
| `columns` | `number` | 자동 계산 | 그리드 열 수 |
| `viewportWidth` | `number` | `512` | 개별 뷰포트 너비 |
| `viewportHeight` | `number` | `384` | 개별 뷰포트 높이 |
| `gap` | `number` | `10` | 뷰포트 간 간격 (픽셀) |
| `showToolbar` | `boolean` | `true` | 공용 도구바 표시 |
| `onViewerSelect` | `(id) => void` | - | 뷰어 선택 콜백 |
| `selectedViewerId` | `string` | - | 현재 선택된 뷰어 ID |

### Handle 메서드

```tsx
const groupRef = useRef<SingleDicomViewerGroupHandle>(null);

// 모든 뷰어 동시 재생/정지
groupRef.current?.playAll();
groupRef.current?.pauseAll();
groupRef.current?.togglePlayAll();

// 모든 뷰어 FPS 설정
groupRef.current?.setFpsAll(60);

// 특정 뷰어 접근
groupRef.current?.getViewer(viewerId);
```

### 예제: 재생 동기화

```tsx
import { useRef, useState, useCallback } from 'react';
import {
  SingleDicomViewerGroup,
  type SingleDicomViewerGroupHandle,
  type ViewerData,
} from '@echopixel/react';

function SyncedMultiViewer({ viewers }: { viewers: ViewerData[] }) {
  const groupRef = useRef<SingleDicomViewerGroupHandle>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(30);

  const togglePlay = useCallback(() => {
    if (groupRef.current) {
      groupRef.current.togglePlayAll();
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleFpsChange = useCallback((newFps: number) => {
    setFps(newFps);
    if (groupRef.current) {
      groupRef.current.setFpsAll(newFps);
    }
  }, []);

  return (
    <div>
      {/* 공용 컨트롤 */}
      <div style={{ marginBottom: '10px' }}>
        <button onClick={togglePlay}>
          {isPlaying ? '⏸ 정지' : '▶ 재생'}
        </button>
        <label style={{ marginLeft: '10px' }}>
          FPS:
          <input
            type="number"
            value={fps}
            onChange={(e) => handleFpsChange(Number(e.target.value))}
            min={1}
            max={60}
            style={{ width: '50px', marginLeft: '5px' }}
          />
        </label>
      </div>

      {/* 뷰어 그룹 */}
      <SingleDicomViewerGroup
        ref={groupRef}
        viewers={viewers}
        columns={2}
        viewportWidth={512}
        viewportHeight={384}
      />
    </div>
  );
}
```

---

## HybridMultiViewport

**100개 이상의 뷰포트를 동시에 표시**할 수 있는 고성능 컴포넌트입니다.

### 작동 원리

- 단일 WebGL 캔버스를 사용하여 모든 뷰포트 렌더링
- DOM 오버레이로 각 뷰포트의 UI (선택 테두리, 어노테이션) 처리
- `gl.scissor()` + `gl.viewport()`로 캔버스를 분할 렌더링

### 언제 사용하나요?

- 16개 이상의 뷰포트가 필요할 때
- 스트레스 에코 (Stress Echo) 같은 대량 영상 비교
- 메모리/GPU 리소스 최적화가 중요할 때

### 기본 사용법

```tsx
import { HybridMultiViewport, type HybridSeriesData } from '@echopixel/react';

function LargeMultiViewer({ seriesDataList }: { seriesDataList: HybridSeriesData[] }) {
  return (
    <HybridMultiViewport
      seriesDataList={seriesDataList}
      rows={4}
      cols={4}
      width={1200}
      height={900}
    />
  );
}
```

### HybridSeriesData 타입

```typescript
interface HybridSeriesData {
  id: string;                    // 고유 식별자
  frames: Uint8Array[];          // 프레임 데이터
  imageInfo: DicomImageInfo;     // 이미지 정보
  isEncapsulated?: boolean;      // 압축 여부
}
```

### Props 상세

| Prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `seriesDataList` | `HybridSeriesData[]` | - | 시리즈 데이터 배열 |
| `rows` | `number` | - | 그리드 행 수 |
| `cols` | `number` | - | 그리드 열 수 |
| `width` | `number` | - | 전체 컨테이너 너비 |
| `height` | `number` | - | 전체 컨테이너 높이 |
| `fps` | `number` | `30` | 재생 FPS |
| `performanceOptions` | `PerformanceOptions` | - | 성능 최적화 옵션 |

### PerformanceOptions

```typescript
interface PerformanceOptions {
  batchDecode?: boolean;        // 배치 디코딩 사용
  skipInvisible?: boolean;      // 화면 밖 뷰포트 스킵
  reducedQuality?: boolean;     // 저화질 모드
  maxConcurrentDecodes?: number; // 동시 디코딩 수
}
```

### Handle 메서드

```tsx
const hybridRef = useRef<HybridMultiViewportHandle>(null);

// 재생 제어
hybridRef.current?.playAll();
hybridRef.current?.pauseAll();
hybridRef.current?.togglePlayAll();
hybridRef.current?.setFps(60);

// 통계 조회
const stats = hybridRef.current?.getStats();
// stats = { fps, frameTime, viewportCount, ... }
```

### 예제: 성능 옵션 사용

```tsx
import { useState } from 'react';
import { HybridMultiViewport, type PerformanceOptions } from '@echopixel/react';

function PerformanceOptimizedViewer({ seriesDataList }) {
  const [performanceOptions, setPerformanceOptions] = useState<PerformanceOptions>({
    batchDecode: true,
    skipInvisible: true,
    reducedQuality: false,
    maxConcurrentDecodes: 4,
  });

  return (
    <div>
      {/* 성능 옵션 UI */}
      <div style={{ marginBottom: '10px' }}>
        <label>
          <input
            type="checkbox"
            checked={performanceOptions.batchDecode}
            onChange={(e) => setPerformanceOptions(prev => ({
              ...prev,
              batchDecode: e.target.checked
            }))}
          />
          배치 디코딩
        </label>
        <label style={{ marginLeft: '10px' }}>
          <input
            type="checkbox"
            checked={performanceOptions.skipInvisible}
            onChange={(e) => setPerformanceOptions(prev => ({
              ...prev,
              skipInvisible: e.target.checked
            }))}
          />
          화면 밖 스킵
        </label>
      </div>

      <HybridMultiViewport
        seriesDataList={seriesDataList}
        rows={10}
        cols={10}
        width={1600}
        height={1200}
        performanceOptions={performanceOptions}
      />
    </div>
  );
}
```

---

## Building Blocks

고수준 컴포넌트가 아닌 **개별 UI 요소**를 직접 조합하고 싶을 때 사용합니다.

### DicomCanvas

순수 WebGL 캔버스만 필요할 때:

```tsx
import { DicomCanvas, type DicomCanvasHandle } from '@echopixel/react';

function PureCanvas({ frames, imageInfo }) {
  const canvasRef = useRef<DicomCanvasHandle>(null);

  return (
    <DicomCanvas
      ref={canvasRef}
      frames={frames}
      imageInfo={imageInfo}
      width={512}
      height={512}
    />
  );
}
```

### DicomToolbar

도구 선택 UI만 필요할 때:

```tsx
import { DicomToolbar, DEFAULT_TOOLS } from '@echopixel/react';

function MyToolbar({ activeTool, onToolChange }) {
  return (
    <DicomToolbar
      tools={DEFAULT_TOOLS}
      activeToolId={activeTool}
      onToolSelect={onToolChange}
    />
  );
}
```

### DicomControls

재생 컨트롤만 필요할 때:

```tsx
import { DicomControls } from '@echopixel/react';

function MyControls({ isPlaying, fps, frameIndex, totalFrames, onToggle, onFpsChange }) {
  return (
    <DicomControls
      isPlaying={isPlaying}
      fps={fps}
      currentFrame={frameIndex}
      totalFrames={totalFrames}
      onTogglePlay={onToggle}
      onFpsChange={onFpsChange}
    />
  );
}
```

---

## 언제 어떤 컴포넌트를 사용할까?

### 의사결정 플로우차트

```
뷰포트가 몇 개 필요한가?

    1개
    └── SingleDicomViewer

    2~16개
    └── 각 뷰포트가 독립적으로 동작해야 하나?
        ├── 예 → SingleDicomViewerGroup
        └── 아니오 (동기화 필요) → HybridMultiViewport

    17개 이상
    └── HybridMultiViewport
```

### 비교표

| 기준 | SingleDicomViewer | SingleDicomViewerGroup | HybridMultiViewport |
|------|-------------------|------------------------|---------------------|
| 최대 뷰포트 | 1 | ~16 | 100+ |
| WebGL 컨텍스트 | 1개 | N개 (뷰포트당 1개) | 1개 |
| 메모리 사용 | 낮음 | 중간 | 낮음~중간 |
| 구현 복잡도 | 간단 | 간단 | 복잡 |
| 어노테이션 | 지원 | 지원 | 지원 |
| 뷰포트 독립성 | N/A | 높음 | 낮음 |

---

## 다음 단계

- [도구 시스템](./tools.md) - 도구 바인딩 커스터마이징
- [어노테이션](./annotations.md) - 측정 도구 사용법
- [데이터 소스](./datasources.md) - WADO-RS 연동
