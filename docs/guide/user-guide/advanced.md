# 고급 사용법

이 문서에서는 EchoPixel의 고급 기능과 성능 최적화 방법을 설명합니다.

---

## 목차

1. [성능 최적화](#성능-최적화)
2. [메모리 관리](#메모리-관리)
3. [WebGL Context 관리](#webgl-context-관리)
4. [커스텀 렌더링](#커스텀-렌더링)
5. [TypeScript 활용](#typescript-활용)

---

## 성능 최적화

### HybridMultiViewport 성능 옵션

대규모 뷰포트를 사용할 때 성능 옵션을 활용하세요:

```tsx
import { HybridMultiViewport, type PerformanceOptions } from '@echopixel/react';

const performanceOptions: PerformanceOptions = {
  // 배치 디코딩: 여러 프레임을 한 번에 디코딩
  batchDecode: true,

  // 화면 밖 뷰포트 스킵: 보이지 않는 뷰포트는 렌더링 생략
  skipInvisible: true,

  // 저화질 모드: 스크롤/드래그 중 저해상도로 렌더링
  reducedQuality: false,

  // 동시 디코딩 수 제한
  maxConcurrentDecodes: 4,
};

<HybridMultiViewport
  seriesDataList={data}
  rows={10}
  cols={10}
  width={1600}
  height={1200}
  performanceOptions={performanceOptions}
/>
```

### FPS 조절

불필요하게 높은 FPS는 CPU/GPU 자원을 낭비합니다:

```tsx
// 일반적인 의료 영상: 30fps로 충분
<SingleDicomViewer
  {...viewportData}
  width={768}
  height={576}
  initialFps={30}
/>

// 부드러운 재생이 필요한 경우
<SingleDicomViewer
  {...viewportData}
  width={768}
  height={576}
  initialFps={60}
/>
```

### 지연 로딩 (Lazy Loading)

대량의 데이터를 다룰 때 지연 로딩을 사용하세요:

```tsx
import { useState, useEffect } from 'react';

function LazyLoadedViewers({ instanceList }) {
  const [loadedViewers, setLoadedViewers] = useState([]);
  const [loadingIndex, setLoadingIndex] = useState(0);

  useEffect(() => {
    if (loadingIndex >= instanceList.length) return;

    const loadNext = async () => {
      const data = await loadInstance(instanceList[loadingIndex]);
      setLoadedViewers(prev => [...prev, data]);
      setLoadingIndex(prev => prev + 1);
    };

    // 순차적으로 로드
    loadNext();
  }, [loadingIndex, instanceList]);

  return (
    <div>
      <p>로딩 진행: {loadingIndex} / {instanceList.length}</p>
      <SingleDicomViewerGroup
        viewers={loadedViewers}
        columns={4}
        viewportWidth={256}
        viewportHeight={256}
      />
    </div>
  );
}
```

### 가상화 (Virtualization)

매우 많은 뷰포트가 필요한 경우, 화면에 보이는 것만 렌더링하세요:

```tsx
import { useCallback, useMemo } from 'react';

function VirtualizedViewers({ allViewers, containerHeight, itemHeight }) {
  const [scrollTop, setScrollTop] = useState(0);

  // 보이는 범위 계산
  const visibleRange = useMemo(() => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.ceil((scrollTop + containerHeight) / itemHeight);
    return { startIndex, endIndex };
  }, [scrollTop, containerHeight, itemHeight]);

  // 보이는 뷰어만 렌더링
  const visibleViewers = useMemo(() => {
    return allViewers.slice(visibleRange.startIndex, visibleRange.endIndex);
  }, [allViewers, visibleRange]);

  return (
    <div
      style={{ height: containerHeight, overflow: 'auto' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: allViewers.length * itemHeight, position: 'relative' }}>
        {visibleViewers.map((viewer, index) => (
          <div
            key={viewer.id}
            style={{
              position: 'absolute',
              top: (visibleRange.startIndex + index) * itemHeight,
              height: itemHeight,
            }}
          >
            <SingleDicomViewer {...viewer} width={256} height={256} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 메모리 관리

### 뷰어 정리 (Cleanup)

뷰어가 더 이상 필요 없을 때 리소스를 해제하세요:

```tsx
function ViewerWithCleanup() {
  const viewerRef = useRef<SingleDicomViewerHandle>(null);
  const [showViewer, setShowViewer] = useState(true);

  const handleClose = () => {
    // 뷰어 정리
    if (viewerRef.current) {
      viewerRef.current.dispose?.();
    }
    setShowViewer(false);
  };

  return (
    <div>
      {showViewer && (
        <SingleDicomViewer
          ref={viewerRef}
          {...viewportData}
          width={768}
          height={576}
        />
      )}
      <button onClick={handleClose}>닫기</button>
    </div>
  );
}
```

### 텍스처 캐시

EchoPixel은 내부적으로 텍스처 캐시를 사용합니다:

```tsx
import { TextureLRUCache } from '@echopixel/core';

// 캐시 설정 (고급 사용자용)
const cache = new TextureLRUCache({
  maxSize: 100,           // 최대 캐시 항목 수
  evictionEnabled: true,  // 자동 eviction 활성화
});
```

### 대용량 데이터 처리

많은 프레임을 가진 영상을 처리할 때:

```tsx
// 프레임을 청크로 나누어 로드
async function loadFramesInChunks(totalFrames: number, chunkSize: number = 10) {
  const frames = [];

  for (let i = 0; i < totalFrames; i += chunkSize) {
    const chunk = await loadFrameRange(i, Math.min(i + chunkSize, totalFrames));
    frames.push(...chunk);

    // UI 업데이트 기회 제공
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return frames;
}
```

---

## WebGL Context 관리

### Context 손실 처리

WebGL context가 손실될 수 있습니다 (GPU 리셋, 탭 전환 등):

```tsx
function RobustViewer({ viewportData }) {
  const viewerRef = useRef<SingleDicomViewerHandle>(null);
  const [contextLost, setContextLost] = useState(false);

  const handleContextLost = useCallback(() => {
    console.warn('WebGL Context Lost');
    setContextLost(true);
  }, []);

  const handleContextRestored = useCallback(() => {
    console.log('WebGL Context Restored');
    setContextLost(false);
    // 필요시 상태 복원
    viewerRef.current?.reset();
  }, []);

  return (
    <div>
      {contextLost && (
        <div style={{ color: 'orange', padding: '10px' }}>
          GPU 컨텍스트가 손실되었습니다. 복구 중...
        </div>
      )}

      <SingleDicomViewer
        ref={viewerRef}
        {...viewportData}
        width={768}
        height={576}
        onContextLost={handleContextLost}
        onContextRestored={handleContextRestored}
      />
    </div>
  );
}
```

### Context 수 제한

브라우저는 동시 WebGL context 수를 제한합니다 (보통 8~16개):

```tsx
// SingleDicomViewerGroup은 뷰어당 1개의 context 사용
// 16개 이상 필요하면 HybridMultiViewport 사용 (1개 context)

function SmartViewerSelector({ viewerCount, viewers }) {
  if (viewerCount <= 16) {
    return (
      <SingleDicomViewerGroup
        viewers={viewers}
        columns={4}
        viewportWidth={256}
        viewportHeight={256}
      />
    );
  } else {
    return (
      <HybridMultiViewport
        seriesDataList={viewers}
        rows={Math.ceil(viewerCount / 10)}
        cols={10}
        width={1600}
        height={1200}
      />
    );
  }
}
```

---

## 커스텀 렌더링

### DicomCanvas 직접 사용

더 세밀한 제어가 필요하면 저수준 컴포넌트를 사용하세요:

```tsx
import { DicomCanvas, type DicomCanvasHandle } from '@echopixel/react';

function CustomViewer({ frames, imageInfo }) {
  const canvasRef = useRef<DicomCanvasHandle>(null);

  // 수동으로 프레임 렌더링
  const renderFrame = (index: number) => {
    if (canvasRef.current) {
      canvasRef.current.renderFrame(index);
    }
  };

  // 수동으로 Window/Level 설정
  const setWindowLevel = (center: number, width: number) => {
    if (canvasRef.current) {
      canvasRef.current.setWindowLevel(center, width);
    }
  };

  return (
    <div>
      <DicomCanvas
        ref={canvasRef}
        frames={frames}
        imageInfo={imageInfo}
        width={512}
        height={512}
      />

      <div>
        <button onClick={() => renderFrame(0)}>프레임 0</button>
        <button onClick={() => renderFrame(1)}>프레임 1</button>
        <button onClick={() => setWindowLevel(40, 400)}>W/L 설정</button>
      </div>
    </div>
  );
}
```

### 커스텀 오버레이

영상 위에 커스텀 UI를 추가하세요:

```tsx
function ViewerWithCustomOverlay({ viewportData }) {
  return (
    <div style={{ position: 'relative' }}>
      <SingleDicomViewer
        {...viewportData}
        width={768}
        height={576}
      />

      {/* 커스텀 오버레이 */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          background: 'rgba(0,0,0,0.7)',
          padding: '10px',
          color: 'white',
          borderRadius: '4px',
        }}
      >
        <h4>커스텀 정보</h4>
        <p>환자명: {viewportData.patientName}</p>
        <p>검사일: {viewportData.studyDate}</p>
      </div>
    </div>
  );
}
```

---

## TypeScript 활용

### 타입 임포트

```tsx
import {
  // 컴포넌트 타입
  type SingleDicomViewerProps,
  type SingleDicomViewerHandle,
  type SingleDicomViewerGroupProps,
  type HybridMultiViewportProps,

  // 데이터 타입
  type ViewerData,
  type HybridSeriesData,
  type PerformanceOptions,

  // 도구 타입
  type ToolDefinition,
  type ToolBinding,
} from '@echopixel/react';

import {
  // DICOM 타입
  type DicomDataset,
  type DicomImageInfo,
  type PixelDataInfo,

  // 어노테이션 타입
  type Annotation,
  type AnnotationType,

  // 기타
  type WindowLevel,
  type ViewportTransform,
} from '@echopixel/core';
```

### 제네릭 활용

```tsx
// 커스텀 뷰어 데이터 타입
interface MyViewerData extends ViewerData {
  patientName: string;
  studyDate: string;
  customMetadata: Record<string, unknown>;
}

function MyApp() {
  const [viewers, setViewers] = useState<MyViewerData[]>([]);

  const addViewer = (data: MyViewerData) => {
    setViewers(prev => [...prev, data]);
  };

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

### 타입 가드

```tsx
function isMultiFrame(imageInfo: DicomImageInfo): boolean {
  return (imageInfo.numberOfFrames ?? 1) > 1;
}

function ViewerSelector({ viewportData }) {
  if (isMultiFrame(viewportData.imageInfo)) {
    return (
      <SingleDicomViewer
        {...viewportData}
        width={768}
        height={576}
        showControls={true}  // 재생 컨트롤 표시
      />
    );
  }

  return (
    <SingleDicomViewer
      {...viewportData}
      width={768}
      height={576}
      showControls={false}  // 단일 프레임이면 컨트롤 숨김
    />
  );
}
```

---

## 디버깅

### 통계 표시

```tsx
function DebugViewer({ viewportData }) {
  const viewerRef = useRef<SingleDicomViewerHandle>(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (viewerRef.current) {
        const transform = viewerRef.current.getTransform();
        const windowLevel = viewerRef.current.getWindowLevel();
        setStats({ transform, windowLevel });
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <SingleDicomViewer
        ref={viewerRef}
        {...viewportData}
        width={768}
        height={576}
      />

      {/* 디버그 정보 */}
      {stats && (
        <pre style={{ fontSize: '10px', background: '#111', padding: '10px' }}>
          {JSON.stringify(stats, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

### 성능 모니터링

```tsx
function PerformanceMonitor({ viewportData }) {
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useEffect(() => {
    const measureFps = () => {
      frameCountRef.current++;
      const now = performance.now();
      const elapsed = now - lastTimeRef.current;

      if (elapsed >= 1000) {
        setFps(Math.round(frameCountRef.current * 1000 / elapsed));
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      requestAnimationFrame(measureFps);
    };

    const handle = requestAnimationFrame(measureFps);
    return () => cancelAnimationFrame(handle);
  }, []);

  return (
    <div>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        background: 'rgba(0,0,0,0.8)',
        color: fps < 30 ? 'red' : 'lime',
        padding: '5px 10px',
        zIndex: 1000,
      }}>
        {fps} FPS
      </div>

      <SingleDicomViewer
        {...viewportData}
        width={768}
        height={576}
      />
    </div>
  );
}
```

---

## 다음 단계

- [문제 해결](./troubleshooting.md) - 자주 발생하는 문제와 해결 방법
