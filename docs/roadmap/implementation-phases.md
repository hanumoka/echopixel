# EchoPixel 구현 로드맵

## 전체 개요

| Phase | 목표 | 마일스톤 |
|-------|------|----------|
| 1 | Foundation | 단일 뷰포트 cine 재생 + DataSource |
| 2 | Multi-Viewport & Quality | 16개 뷰포트 @ 30fps + PQE |
| 3 | Annotations | EchoPAC 수준 측정 도구 + STOW-RS |
| 4 | Plugin System | 확장 가능한 생태계 |
| 5 | Release | npm v1.0.0 배포 |

### 성능 목표

| 메트릭 | 목표 |
|--------|------|
| 동시 뷰포트 | **16개** (스트레스 에코) |
| 프레임 레이트 | **30fps 이상** |
| GPU 메모리 | **1.5GB 미만** |
| 동기화 지연 | **< 16ms** |
| 프레임 드롭 | **0** |
| 초기 표시 | **0.5초 이내** (저품질) |

---

## Phase 1: Foundation

### 목표
단일 DICOM 심초음파 파일을 로드하고 cine loop로 재생

### 작업 항목

#### 프로젝트 설정
- [ ] 모노레포 구조 초기화 (pnpm workspace)
- [ ] Vite + TypeScript 설정
- [ ] ESLint + Prettier 설정
- [ ] Vitest 테스트 환경

#### DICOM 파서 (`@echopixel/core/dicom`)
- [ ] DICOM Part 10 기본 파싱
- [ ] Lazy 태그 접근 구현
- [ ] 심초음파 메타데이터 추출
  - Frame Time (0018,1063)
  - Frame Time Vector (0018,1065)
  - Number of Frames (0028,0008)
- [ ] 멀티프레임 픽셀 데이터 분리

#### 픽셀 디코더 (`@echopixel/core/decoder`)
- [ ] **WebCodecs ImageDecoder** (하드웨어 가속) ⭐
  - Chrome, Edge, Firefox 118+ 지원
  - JPEG/PNG 하드웨어 디코딩
- [ ] **VideoFrame → WebGL 텍스처 직접 업로드** ⭐
  - 제로카피 GPU→GPU 전송
  - `gl.texImage2D(gl.TEXTURE_2D, ..., videoFrame)`
- [ ] Safari 폴백 (JPEG Baseline 브라우저 API)
- [ ] Uncompressed (Native) 지원
- [ ] Web Worker 기반 디코딩

#### WebGL 렌더러 (`@echopixel/core/renderer`)
- [ ] WebGL2 컨텍스트 초기화
- [ ] 그레이스케일 텍스처 업로드
- [ ] VOI LUT Fragment shader
- [ ] 기본 렌더 루프

#### React 컴포넌트 (`@echopixel/react`)
- [ ] `<EchoProvider>` 컨텍스트
- [ ] `<Viewport>` 기본 컴포넌트
- [ ] Window/Level 마우스 인터랙션

#### Cine 재생
- [ ] requestAnimationFrame 기반 타이머
- [ ] Play/Pause/Stop 제어
- [ ] Frame Time Vector 기반 가변 속도

#### DataSource 추상화 레이어 (`@echopixel/core/datasource`)
- [ ] DataSource 인터페이스 정의
- [ ] **Local File** - 개발/테스트용
- [ ] **WADO-RS** - DICOMweb 표준
  - Instance Retrieval
  - Metadata (JSON)
  - Rendered (JPEG)
  - BulkData (raw pixels)
- [ ] **WADO-URI** - 레거시 PACS 호환
- [ ] **MJPEG Cine** - 빠른 미리보기 스트리밍
- [ ] **Hybrid** - MJPEG → WADO-RS 점진적 전환

#### 반응형 기초 (`@echopixel/react`) ⭐ 신규
- [ ] ResizeObserver 기반 뷰포트 크기 감지
- [ ] DPI/devicePixelRatio 감지
- [ ] 캔버스 해상도 자동 조정

#### 네트워크 기초 (`@echopixel/core/network`) ⭐ 신규
- [ ] Range Requests (멀티프레임 부분 요청)
- [ ] LRU 메모리 캐시 (디코딩된 프레임)
- [ ] 기본 재시도 로직 (지수 백오프)

#### 에러 처리 기초 ⭐ 신규
- [ ] 로딩/에러 상태 UI 컴포넌트
- [ ] 디코딩 폴백 (WebCodecs → 브라우저 API)
- [ ] 네트워크 에러 재시도 (3회)
- [ ] 기본 에러 리포트 구조

### 마일스톤 검증
```
✓ 샘플 심초음파 DICOM 로드 (Local File)
✓ 단일 뷰포트에서 cine 재생
✓ 마우스 드래그로 Window/Level 조정
✓ Play/Pause 버튼 동작
✓ WADO-RS로 원격 DICOM 로드
```

---

## Phase 2: Multi-Viewport & Quality

### 목표
16개 이상의 뷰포트에서 동기화된 30fps cine 재생 + 점진적 품질 향상

### 작업 항목

#### Single Canvas 아키텍처
- [ ] 전체 화면 캔버스 생성
- [ ] Scissor/Viewport 영역 분할
- [ ] DOM 요소와 렌더링 영역 매핑

#### 2D Array Texture (`@echopixel/core/renderer`)
- [ ] GL_TEXTURE_2D_ARRAY 생성
- [ ] 프레임 시퀀스 업로드
- [ ] Layer 인덱스로 프레임 선택
- [ ] texSubImage3D (레이어 단위 업데이트)

#### ViewportManager (`@echopixel/core/viewport`)
- [ ] 뷰포트 인스턴스 관리
- [ ] 레이아웃 시스템 (그리드, 자유 배치)
- [ ] 뷰포트 추가/제거

#### FrameSyncEngine (`@echopixel/core/sync`)
- [ ] FrameClock 마스터 타이머
- [ ] SyncGroup 뷰포트 그룹화
- [ ] **동기화 방식**:
  - Frame Ratio (프레임 비율 기반 - 기본)
  - R-wave (심박 주기 기준)
  - Time (절대 시간 기준)
  - Manual (사용자 정의 동기점)
- [ ] FPS 정규화 (다른 프레임 수 자동 조정)
- [ ] 앵커 뷰포트 지정
- [ ] 개별 뷰포트 일시정지/재개
- [ ] 재생 속도 조절 (0.5x ~ 2x)

#### Progressive Quality Enhancement (PQE)
- [ ] **품질 레벨**:
  | Level | 이름 | 해상도 | 소스 |
  |-------|------|--------|------|
  | 1 | Thumbnail | 64px | MJPEG |
  | 2 | Preview | 256px | MJPEG |
  | 3 | Standard | 512px | WADO-RS Rendered |
  | 4 | Original | 원본 | WADO-RS BulkData |
- [ ] 프레임 단위 점진적 교체
- [ ] Double Buffering (끊김 없는 전환)
- [ ] 선제적 로딩 (재생 위치 예측)

#### 캐시 관리 (`@echopixel/core/cache`)
- [ ] LRU CPU 캐시 (디코딩된 프레임)
- [ ] LRU GPU 캐시 (텍스처)
- [ ] 메모리 예산 관리 (1.5GB 미만)
- [ ] 프레임 프리페칭

#### QIDO-RS (`@echopixel/core/datasource`)
- [ ] Study 검색
- [ ] Series 검색
- [ ] Instance 검색

#### 디바이스 성능 감지
- [ ] GPU 성능 측정
- [ ] 자동 품질 조절

#### OffscreenCanvas 렌더링 ⭐ (신규)
- [ ] Worker 기반 렌더링 옵션
- [ ] 메인 스레드 분리
- [ ] UI 응답성 향상

#### H.264 스트림 옵션 ⭐ (신규)
- [ ] WebCodecs VideoDecoder 활용
- [ ] 서버에서 H.264 스트림 지원 시 사용
- [ ] MJPEG 대비 10배+ 압축

#### LOD 알고리즘 ⭐ (신규)
- [ ] 뷰포트 크기별 해상도 동적 조절
- [ ] DECODE-3DViz 기법 참고
- [ ] 작은 뷰포트 = 저해상도, 확대 시 고해상도

#### 최적화
- [ ] IntersectionObserver 뷰포트 가시성
- [ ] Pre-calculated 픽셀 통계
- [ ] 프레임 드롭 보상

#### 반응형 레이아웃 ⭐ (신규)
- [ ] 브레이크포인트별 그리드 (Desktop 4x4, Tablet 3x3, Mobile 2x1)
- [ ] 터치 제스처 (핀치 줌, 스와이프, 드래그)
- [ ] Portrait ↔ Landscape 전환 처리
- [ ] CSS Container Queries 활용

#### 네트워크 고급 ⭐ (신규)
- [ ] 프리페칭 (재생 방향 예측)
- [ ] 가시성 기반 로딩 (보이는 뷰포트 우선)
- [ ] 대역폭 감지 (Network Information API)
- [ ] Service Worker 캐싱

#### 에러 처리 고급 ⭐ (신규)
- [ ] WebGL 컨텍스트 손실 감지 및 복구
- [ ] GPU 메모리 부족 시 LRU 정리
- [ ] 상세 에러 로깅 및 모니터링
- [ ] 에러 리포트 수집 (선택적)

#### 스크롤/가시성 최적화 ⭐ (신규)
- [ ] IntersectionObserver 기반 가시성 감지
- [ ] 화면 밖 뷰포트 렌더링 일시 중지
- [ ] 오래 안 보이는 뷰포트 텍스처 언로드 (30초 후)
- [ ] Passive 스크롤 리스너, CSS contain
- [ ] 가상화 옵션 (32개+ 뷰포트 시)

### 마일스톤 검증
```
✓ 16개 뷰포트 동시 표시 (스트레스 에코)
✓ Chrome DevTools에서 30fps 확인
✓ 동기화 그룹 내 프레임 일치 (< 16ms)
✓ GPU 메모리 1.5GB 미만
✓ 0.5초 내 저품질 → 고품질 전환
✓ 프레임 드롭 0
✓ 반응형 레이아웃 (데스크탑/태블릿/모바일)
✓ 저속 네트워크(10Mbps)에서 적응형 품질
✓ 스크롤 시 화면 밖 뷰포트 렌더링 중지 확인
✓ 스크롤 성능 60fps 유지 (jank 없음)
```

---

## Phase 3: Annotations

### 목표
EchoPAC 수준의 측정 도구 구현

### 작업 항목

#### 어노테이션 엔진 (`@echopixel/annotations`)
- [ ] SVG 오버레이 레이어
- [ ] 좌표 변환 시스템
  - DICOM Pixel → Canvas
  - Canvas → World (mm)
- [ ] 핸들/그립 인터랙션
- [ ] 상태 머신 (생성/편집/선택)

#### 측정 도구
- [ ] **거리 측정** (2점 라인)
  - 픽셀 간격 기반 mm 계산
  - 라벨 표시
- [ ] **영역 측정** (타원, 다각형)
  - 면적 계산 (cm²)
  - 자유 곡선 지원
- [ ] **Doppler Trace**
  - 속도 엔벨로프 추적
  - VTI, Vmax 계산
- [ ] **각도 측정** (3점)

#### 캘리브레이션
- [ ] Pixel Spacing 태그 활용
- [ ] 수동 캘리브레이션 도구
- [ ] 단위 시스템 (mm, cm)

#### 직렬화
- [ ] JSON 내보내기/가져오기
- [ ] DICOM SR 생성

#### STOW-RS (`@echopixel/core/datasource`)
- [ ] DICOM SR 업로드
- [ ] 어노테이션 저장/동기화

### 마일스톤 검증
```
✓ 거리 측정 ±1mm 정확도
✓ 영역 측정 ±5% 정확도
✓ Doppler trace로 VTI 계산
✓ 어노테이션 저장/로드
```

---

## Phase 4: Plugin System

### 목표
확장 가능한 플러그인 아키텍처 구현

### 작업 항목

#### Plugin API (`@echopixel/core/plugins`)
- [ ] 플러그인 인터페이스 정의
- [ ] 라이프사이클 훅
  - onInstall / onUninstall
  - onActivate / onDeactivate
- [ ] PluginContext API 노출
- [ ] 이벤트 버스

#### 기본 플러그인
- [ ] **MeasurementPlugin**
  - Phase 3 도구 통합
  - 툴바 연동
- [ ] **AIOverlayPlugin**
  - Heatmap 렌더링
  - Bounding box 표시
  - Segmentation mask 오버레이
- [ ] **StrainVisualizationPlugin**
  - Bull's eye plot
  - Polar map
  - Strain curve 그래프

#### React 통합
- [ ] `usePlugin` 훅
- [ ] 플러그인 설정 UI
- [ ] 동적 플러그인 로딩

### 마일스톤 검증
```
✓ 커스텀 플러그인 작성 가이드
✓ AI 결과 오버레이 표시
✓ Strain 시각화 동작
✓ 플러그인 동적 로드/언로드
```

---

## Phase 5: Polish & Release

### 목표
프로덕션 준비 완료 및 npm 배포

### 작업 항목

#### 멀티 벤더 테스트
- [ ] GE 장비 DICOM 테스트
- [ ] Philips 장비 DICOM 테스트
- [ ] Siemens 장비 DICOM 테스트
- [ ] Canon 장비 DICOM 테스트

#### 추가 코덱
- [ ] JPEG-LS (CharLS WASM)
- [ ] JPEG2000 (OpenJPEG WASM)
- [ ] RLE

#### 렌더링 전략
- [ ] GPU (WebGL2) 전용 (기본)
- [ ] CPU 폴백 (Canvas 2D)
- [ ] 사용자 선택 UI
- [ ] 디바이스 감지 및 자동 선택

#### 접근성
- [ ] 키보드 네비게이션
- [ ] ARIA 레이블
- [ ] 고대비 모드

#### 문서화
- [ ] Storybook 컴포넌트 데모
- [ ] TypeDoc API 문서
- [ ] Getting Started 가이드
- [ ] 플러그인 개발 가이드

#### 배포
- [ ] npm 패키지 구성
- [ ] ESM + CJS 듀얼 빌드
- [ ] GitHub Actions CI/CD
- [ ] 버전 관리 (Changesets)

#### WebGPU 렌더링 경로 ⭐ (신규, 옵션)
- [ ] WebGPU 추상화 레이어
- [ ] WebGL2 → WebGPU 호환 인터페이스
- [ ] 미래 대비 (5~100x 성능 향상 잠재력)

### 마일스톤 검증
```
✓ npm install echopixel 동작
✓ 4개 벤더 DICOM 호환
✓ Storybook 문서 배포
✓ GitHub 릴리즈 v1.0.0
```

---

## 의존성 차트

```
Phase 1 (Foundation)
    │
    ├── DICOM Parser ──────┬── Pixel Decoder
    │                      │
    └── WebGL Renderer ────┴── React Viewport
                                    │
                                    v
Phase 2 (Multi-Viewport) ──────────────────────────
    │
    ├── Single Canvas ─────┬── 2D Array Texture
    │                      │
    ├── ViewportManager ───┼── FrameClock
    │                      │
    └── CacheManager ──────┴── Prefetcher
                                    │
                                    v
Phase 3 (Annotations) ─────────────────────────────
    │
    ├── SVG Layer ─────────┬── Coordinate Transform
    │                      │
    └── Measurement Tools ─┴── Serialization
                                    │
                                    v
Phase 4 (Plugin System) ───────────────────────────
    │
    ├── Plugin API ────────┬── Event Bus
    │                      │
    └── Official Plugins ──┴── React Integration
                                    │
                                    v
Phase 5 (Release) ─────────────────────────────────
    │
    └── Multi-vendor ──┬── Documentation ──┬── npm
                       └── Accessibility ──┘
```

---

## 참고 사항

### 병렬 진행 가능 작업
- Phase 1의 DICOM 파서와 WebGL 렌더러는 병렬 개발 가능
- Phase 3의 각 측정 도구는 독립적으로 개발 가능
- Phase 4의 각 플러그인은 독립적으로 개발 가능

### 위험 요소
| 위험 | 영향 | 완화 방안 |
|------|------|-----------|
| WebGL2 제한 (Safari) | 일부 기능 불가 | WebGL1 폴백 |
| GPU 메모리 부족 | 성능 저하 | LRU 캐시 적극 활용 |
| 벤더별 DICOM 차이 | 호환성 이슈 | 다양한 샘플 테스트 |
