# SADO POC 프로젝트 분석

## 개요

**프로젝트**: Mini PACS + DICOM 뷰어 POC (16주 학습 프로젝트)
**위치**: `C:\Users\amagr\projects\sado`
**구조**: 모노레포 (sado-be, sado-fe, sado_docs)

---

## 1. 프로젝트 구조

```
sado/
├── sado-be/                  # Backend (Spring Boot 4.0.1, Java 21)
│   ├── sado-common/          # 공통 라이브러리
│   └── sado-minipacs/        # PACS 구현 (120 Java 파일)
│       ├── controller/       # 13 REST 컨트롤러
│       ├── domain/           # 엔티티, 서비스
│       └── storage/          # SeaweedFS/S3 연동
│
├── sado-fe/                  # Frontend (React 19, TypeScript, Vite)
│   └── src/features/
│       ├── dicom-viewer/              # WADO-RS Rendered
│       ├── dicom-viewer-wado-rs-bulkdata/  # BulkData
│       ├── dicom-viewer-mjpeg/        # MJPEG 방식
│       ├── dicom-viewer-mjpeg-wado-rs/    # 하이브리드
│       └── dicom-viewer-wado-uri/     # 레거시 URI
│
└── sado_docs/                # 문서 허브
    ├── be/                   # 백엔드 문서
    ├── fe/                   # 프론트엔드 문서
    └── seaweedfs/            # 스토리지 문서
```

---

## 2. 5가지 DICOM 뷰어 접근법

### 성능 비교표

| 뷰어 | 프로토콜 | 속도 | 품질 | 적용 사례 |
|------|----------|------|------|-----------|
| **WADO-RS Rendered** | WADO-RS | 중간 | 높음 | 표준 뷰잉 |
| **WADO-RS BulkData** | WADO-RS | 느림 | 매우 높음 | 아카이브/참조 |
| **MJPEG Cine** | 커스텀 | 빠름 | 중간 | 빠른 미리보기 |
| **Hybrid** | MJPEG → WADO-RS | 빠름→높음 | 중간→높음 | 최적 UX |
| **WADO-URI** | 레거시 | 중간 | 중간 | 레거시 시스템 |

---

## 3. 프로토콜별 구현 상세

### 3.1 WADO-RS Rendered

**파일**: `sado-fe/src/lib/cornerstone/wadoRsRenderedLoader.ts` (514줄)

```typescript
// 엔드포인트
/studies/{studyUid}/series/{seriesUid}/instances/{sopUid}/rendered
/instances/{sopUid}/frames/{frameNumber}/rendered

// ImageId 형식
wadors-rendered:studyUid:seriesUid:instanceUid:frameNumber[:resolution]

// 해상도 옵션
- 1x1 레이아웃: 512px (PNG, ~342KB/프레임)
- 2x2 레이아웃: 256px (JPEG, ~25KB/프레임)
- 3x3 레이아웃: 128px (JPEG, ~2.4KB/프레임)
```

### 3.2 WADO-RS BulkData

**파일**: `sado-fe/src/features/dicom-viewer-wado-rs-bulkdata/stores/wadoRsBulkDataMultiViewerStore.ts` (1500줄+)

```typescript
특징:
- 원본 DICOM 바이너리 다운로드
- 클라이언트 측 디코딩 (cornerstoneDICOMImageLoader)
- Window/Level 조정 가능
- 프로그레시브 재생 (프레임별 로딩 추적)
- Prefetch Lookahead: N+1, N+2, N+3 프레임 선로딩
```

### 3.3 MJPEG (Cine Frames)

**파일**: `sado-fe/src/features/dicom-viewer-mjpeg/utils/CineFramesLoadingManager.ts`

```typescript
// 엔드포인트
/dicomweb/cine-frames/{sopInstanceUid}?resolution={256,128,64,32}

// 응답 형식
{
  sopInstanceUid: string,
  numberOfFrames: number,
  resolution: number,
  frames: string[]  // Base64 JPEG 배열
}

// 동시 로딩 제한
- 4x4 레이아웃 = 16개 슬롯 동시 fetch → 서버 과부하
- 해결: 최대 4개 동시 로딩, 큐 기반 순차 처리
```

### 3.4 WADO-URI (레거시)

**파일**: `sado-fe/src/features/dicom-viewer-wado-uri/utils/wadoUriImageLoader.ts` (212줄)

```typescript
// 엔드포인트
/dicomweb/wado?requestType=WADO&studyUID=X&seriesUID=Y&objectUID=Z

// LRU 캐시 (2026-01-09 추가)
- MAX_CACHE_SIZE = 200 이미지 (~100MB)
- 캐시 히트율 추적
- 동일 imageId 중복 요청 제거
```

---

## 4. 발견된 성능 문제 및 해결 시도

### 4.1 Critical Issues

| 문제 | 원인 | 해결 | 효과 |
|------|------|------|------|
| **PixelData CPU 오버헤드** | 매번 `new Uint8Array()` 복사 | 참조 캐싱 | 렌더링 25% 향상 |
| **LRU 캐시 느림** | O(N log N) 정렬 | MinHeap 기반 O(log N) | 대용량 캐시 개선 |
| **ObjectURL 메모리 누수** | revoke 누락 | 30초 타임아웃 + canvas 정리 | OOM 방지 |
| **멀티슬롯 동시 fetch** | 16개 동시 요청 | 최대 4개 제한 | 서버 부하 감소 |
| **첫 재생 이미지 깨짐** | GPU 텍스처 미생성 | 워밍업 렌더링 | 시각 결함 해결 |

### 4.2 React 리렌더링 폭발

**문제** (BaseCineAnimationManager.ts):
```
4개 슬롯 × 30fps = 초당 120회 React 리렌더링
각 프레임 전진 → Zustand set() → React 리렌더
```

**해결**:
```typescript
Phase 1: Zustand 셀렉터 분할
  - 전체 slot 객체 → 개별 필드 셀렉터
  - primitive 타입별 구독

Phase 2: 직접 뷰포트 조작
  - CineAnimationManager가 viewport 참조 직접 보관
  - React 우회하여 viewport.setImageIdIndex() 호출
  - 재생 시작/종료 시에만 React 상태 동기화
```

### 4.3 프리페칭 전략

**파일**: `cornerstoneMultiViewerStore.ts`

```typescript
// 2단계 프리로딩
Phase 1 - 배치 API 프리페치 (0-50%):
  - 5프레임 배치, 6개 동시 배치
  - /frames/1,2,3,4,5/rendered API
  - Interceptor가 PNG/JPEG 캐싱

Phase 2 - Cornerstone 로드 (50-100%):
  - imageLoader.loadImage() 개별 호출
  - Interceptor가 캐시된 데이터 반환
  - 프로그레시브 재생: 즉시 로딩 마킹

초기 버퍼 대기:
  - 프레임 0 + 20프레임 최소 대기
  - 타임아웃: 10초
  - 임계값 도달 시 재생 시작 (전체 프리로드 대기 X)
```

### 4.4 GPU 텍스처 워밍업

**파일**: `cineAnimationManager.ts`

```typescript
async warmupGpuTextures(slotId):
  - 모든 프레임 순회
  - viewport.setImageIdIndex(i) + viewport.render() 호출
  - GPU 텍스처 사전 생성
  - 원래 프레임으로 복귀
  - 첫 재생 사이클 시각 결함 방지
```

### 4.5 Fetch/XHR 인터셉터

**파일**: `wadoRsRenderedInterceptor.ts` (324줄)

```typescript
// window.fetch와 XMLHttpRequest 오버라이드
패턴 매칭: /dicomweb/.../instances/{uid}/frames/{N}/rendered$

캐시 히트: ArrayBuffer Response 즉시 반환
캐시 미스: originalFetch 호출

통계 추적:
  - interceptedRequests
  - cacheHitRequests
  - passedThroughRequests
  - hitRate = (cacheHits / interceptedRequests) * 100
```

---

## 5. Cornerstone 설정

### 버전 및 패키지

```json
"@cornerstonejs/core": "4.12.6"
"@cornerstonejs/dicom-image-loader": "4.12.6"
"@cornerstonejs/tools": "4.12.6"
```

### 초기화 설정

**파일**: `sado-fe/src/lib/cornerstone/initCornerstone.ts`

```typescript
// 캐시 크기
cache.setMaxCacheSize(2 * 1024 * 1024 * 1024)  // 2GB

// Pool Manager 최적화
imageRetrievalPoolManager.setMaxSimultaneousRequests(RequestType.Interaction, 8)
imageRetrievalPoolManager.setMaxSimultaneousRequests(RequestType.Prefetch, 16)
imageLoadPoolManager.setMaxSimultaneousRequests(RequestType.Interaction, Math.min(cpuCores, 8))
imageLoadPoolManager.setMaxSimultaneousRequests(RequestType.Prefetch, cpuCores)

// Web Workers
maxWebWorkers = navigator.hardwareConcurrency || 4
```

### 뷰포트 구성

```typescript
// 단일 RenderingEngine + 다중 Viewport
레이아웃: 1x1, 2x2, 3x2, 3x3 (최대 9개 슬롯)
타입: STACK (Enums.ViewportType.STACK)
도구: WindowLevel (좌클릭), Pan (중클릭), Zoom (우클릭)
```

---

## 6. 캐시 아키텍처

### 3계층 캐싱

```
Layer 1: Rendered Frame Cache (wadoRsRenderedCache.ts)
├── LRUHeapCache (O(log N))
├── 200MB 최대
└── PNG/JPEG ArrayBuffer 저장

Layer 2: IImage Object Cache (wadoRsRenderedLoader.ts)
├── LRUHeapCache 기반
├── 100개 엔트리 (100MB)
└── 디코딩된 이미지 객체

Layer 3: Cornerstone Core Cache
├── 2GB 관리
└── 자동 LRU 제거
```

---

## 7. EchoPixel 시사점

### 채택할 패턴

| 패턴 | 출처 | 효과 |
|------|------|------|
| **LRUHeapCache** | minHeap.ts | O(log N) 캐시 연산 |
| **Fetch 인터셉터** | wadoRsRenderedInterceptor.ts | 네트워크 요청 최적화 |
| **GPU 텍스처 워밍업** | cineAnimationManager.ts | 첫 재생 결함 방지 |
| **2단계 프리페칭** | cornerstoneMultiViewerStore.ts | 빠른 초기 표시 |
| **직접 뷰포트 조작** | BaseCineAnimationManager.ts | React 오버헤드 제거 |

### 아직 해결 못한 문제 (EchoPixel이 해결해야 함)

| 문제 | Sado 한계 | EchoPixel 해결책 |
|------|-----------|------------------|
| 최대 9개 뷰포트 | WebGL 컨텍스트 제한 | 단일 캔버스 Scissor 렌더링 |
| 프레임별 텍스처 전환 | Cornerstone 아키텍처 | 2D Array Texture |
| React 리렌더링 | 여전히 시작/종료 시 발생 | 완전한 React 분리 |
| 메모리 사용량 | 2GB 캐시 필요 | GPU 직접 관리로 효율화 |

### 성능 지표 참고

```typescript
// Sado에서 추적하는 지표
performanceStats: {
  fps: number,
  avgFps: number,
  frameDrops: number,
  totalFramesRendered: number,
  fpsHistory: number[]
}

// 프레임 드롭 기준
FPS < 목표의 70% → 드롭으로 간주
```

---

## 8. 핵심 파일 참조

| 기능 | 파일 경로 |
|------|-----------|
| Cornerstone 초기화 | `sado-fe/src/lib/cornerstone/initCornerstone.ts` |
| WADO-RS Rendered | `sado-fe/src/lib/cornerstone/wadoRsRenderedLoader.ts` |
| 멀티뷰어 스토어 | `sado-fe/src/features/dicom-viewer/stores/cornerstoneMultiViewerStore.ts` |
| Cine 애니메이션 | `sado-fe/src/features/dicom-viewer/utils/cineAnimationManager.ts` |
| 캐시 인터셉터 | `sado-fe/src/features/dicom-viewer/utils/wadoRsRenderedInterceptor.ts` |
| MJPEG 로딩 | `sado-fe/src/features/dicom-viewer-mjpeg/utils/CineFramesLoadingManager.ts` |
| BulkData 스토어 | `sado-fe/src/features/dicom-viewer-wado-rs-bulkdata/stores/wadoRsBulkDataMultiViewerStore.ts` |
| Pre-decode | `sado-fe/src/features/dicom-viewer-wado-rs-bulkdata/utils/preDecodeManager.ts` |

---

## 9. 결론

Sado POC는 다양한 DICOM 프로토콜과 최적화 기법을 탐색한 종합적인 실험 프로젝트입니다.

**달성한 것**:
- 5가지 뷰어 접근법 구현 및 비교
- 3계층 캐싱 아키텍처
- React 리렌더링 최적화 (Phase 2)
- GPU 텍스처 워밍업
- Fetch 인터셉터 패턴

**한계**:
- 최대 9개 뷰포트 (WebGL 컨텍스트 제한)
- Cornerstone 의존으로 인한 구조적 성능 한계
- 여전히 높은 메모리 사용량 (2GB 캐시)

**EchoPixel이 해결해야 할 것**:
- 10+ 뷰포트를 위한 단일 캔버스 아키텍처
- 2D Array Texture로 프레임 전환 오버헤드 제거
- Cornerstone/vtk.js 없는 직접 WebGL2 제어
