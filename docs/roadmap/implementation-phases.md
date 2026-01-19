# EchoPixel 구현 로드맵

## 전체 개요

| Phase | 목표 | 상태 |
|-------|------|------|
| 1 | Foundation (단일 뷰포트 cine 재생) | ✅ 완료 |
| 2 | Multi-Viewport & Quality | 🔄 진행중 |
| 3 | Annotations | ⏳ 대기 |
| 4 | Plugin System | ⏳ 대기 |
| 5 | Release | ⏳ 대기 |

### 성능 목표

| 메트릭 | 목표 |
|--------|------|
| 동시 뷰포트 | **16개** |
| 프레임 레이트 | **30fps+** |
| GPU 메모리 | **<1.5GB** |
| 동기화 지연 | **<16ms** |
| 프레임 드롭 | **<1%** |

---

## Phase 1: Foundation ✅ 완료

### 작업 항목

#### 프로젝트 설정 ✅
- [x] 모노레포 구조 초기화 (pnpm workspace)
- [x] Vite + TypeScript 설정
- [x] ESLint + Prettier 설정
- [ ] Vitest 테스트 환경 (보류)

#### DICOM 파서 ✅
- [x] DICOM Part 10 기본 파싱
- [x] 심초음파 메타데이터 추출 (Frame Time, Number of Frames)
- [x] 멀티프레임 픽셀 데이터 분리

#### 픽셀 디코더 ✅
- [x] WebCodecs ImageDecoder (하드웨어 가속)
- [x] createImageBitmap 폴백 (Safari)
- [x] Uncompressed (Native) 지원
- [ ] Web Worker 기반 디코딩 (Phase 2로 이동)

#### WebGL 렌더러 ✅
- [x] WebGL2 컨텍스트 초기화
- [x] 텍스처 업로드 (TextureManager)
- [x] VOI LUT Fragment shader
- [x] 기본 렌더 루프 (QuadRenderer)

#### React 컴포넌트 ✅
- [x] `<DicomViewport>` 기본 컴포넌트
- [x] Window/Level 마우스 인터랙션
- [x] 키보드 단축키 (Space, 방향키, R)

#### Cine 재생 ✅
- [x] requestAnimationFrame 기반 타이머
- [x] Play/Pause/Stop 제어
- [x] 가변 FPS 지원 (1-60)

#### DataSource ✅
- [x] DataSource 인터페이스 정의
- [x] LocalFileDataSource
- [x] WadoRsDataSource (캐싱, 재시도, 중복 방지)

#### 반응형 기초 ✅
- [x] ResizeObserver 기반 크기 감지
- [x] DPI/devicePixelRatio 감지
- [x] 캔버스 해상도 자동 조정

#### 네트워크 기초 ✅
- [x] LRU 메모리 캐시
- [x] 기본 재시도 로직 (지수 백오프)

#### 에러 처리 기초 ✅
- [x] 로딩/에러 상태 UI 컴포넌트
- [x] 디코딩 폴백 (WebCodecs → createImageBitmap)
- [x] 네트워크 에러 재시도

---

## Phase 2: Multi-Viewport & Quality 🔄 진행중

### 작업 항목

#### Single Canvas 아키텍처 ✅
- [x] 전체 화면 캔버스 생성
- [x] Scissor/Viewport 영역 분할
- [x] DOM 요소와 렌더링 영역 매핑

#### 2D Array Texture ✅
- [x] GL_TEXTURE_2D_ARRAY 생성
- [x] 프레임 시퀀스 업로드
- [x] Layer 인덱스로 프레임 선택
- [x] texSubImage3D (레이어 단위 업데이트)

#### ViewportManager ✅
- [x] 뷰포트 인스턴스 관리
- [x] 레이아웃 시스템 (1x1, 2x2, 3x3, 4x4)
- [x] 뷰포트 추가/제거

#### FrameSyncEngine ✅
- [x] SyncGroup 뷰포트 그룹화
- [x] Frame Ratio 동기화 (기본)
- [ ] R-wave 동기화 (계획)
- [ ] Time 동기화 (계획)

#### RenderScheduler ✅
- [x] 단일 requestAnimationFrame 루프
- [x] FPS 기반 프레임 업데이트
- [x] 렌더링 통계

#### React 통합 ✅
- [x] MultiViewport 컴포넌트
- [x] MultiCanvasGrid 컴포넌트 (비교용)

#### 남은 작업 ⏳
- [ ] 실제 DICOM 데이터 테스트
- [ ] 16개 뷰포트 30fps 성능 검증
- [ ] Progressive Quality Enhancement (PQE)
- [ ] QIDO-RS (검색)
- [ ] 캐시 관리 고도화
- [ ] 디바이스 성능 감지
- [ ] OffscreenCanvas 렌더링 옵션
- [ ] H.264 스트림 옵션 (WebCodecs VideoDecoder)
- [ ] LOD 알고리즘
- [ ] 반응형 레이아웃 (브레이크포인트, 터치 제스처)
- [ ] 네트워크 고급 (프리페칭, 대역폭 감지, SW 캐싱)
  - [ ] WadoRsDataSource.pendingFrames 중복 요청 방지 (선언만 됨, 미구현)
- [ ] 에러 처리 고급 (컨텍스트 복구, 메모리 관리)
- [ ] 스크롤/가시성 최적화 (IntersectionObserver)

---

## Phase 3: Annotations ⏳ 대기

### 작업 항목

#### 어노테이션 엔진
- [ ] SVG 오버레이 레이어
- [ ] 좌표 변환 시스템 (DICOM Pixel → Canvas → World)
- [ ] 핸들/그립 인터랙션
- [ ] 상태 머신 (생성/편집/선택)

#### 측정 도구
- [ ] 거리 측정 (2점 라인)
- [ ] 영역 측정 (타원, 다각형)
- [ ] Doppler Trace (속도 엔벨로프)
- [ ] 각도 측정 (3점)

#### 캘리브레이션
- [ ] Pixel Spacing 태그 활용
- [ ] 수동 캘리브레이션 도구

#### 직렬화
- [ ] JSON 내보내기/가져오기
- [ ] DICOM SR 생성
- [ ] STOW-RS 업로드

---

## Phase 4: Plugin System ⏳ 대기

### 작업 항목

#### Plugin API
- [ ] 플러그인 인터페이스 정의
- [ ] 라이프사이클 훅 (onInstall, onActivate 등)
- [ ] PluginContext API 노출
- [ ] 이벤트 버스

#### 기본 플러그인
- [ ] MeasurementPlugin
- [ ] AIOverlayPlugin
- [ ] StrainVisualizationPlugin

#### React 통합
- [ ] usePlugin 훅
- [ ] 플러그인 설정 UI
- [ ] 동적 플러그인 로딩

---

## Phase 5: Release ⏳ 대기

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

#### 접근성
- [ ] 키보드 네비게이션
- [ ] ARIA 레이블

#### 문서화
- [ ] Storybook 컴포넌트 데모
- [ ] TypeDoc API 문서
- [ ] Getting Started 가이드

#### 배포
- [ ] npm 패키지 구성
- [ ] ESM + CJS 듀얼 빌드
- [ ] GitHub Actions CI/CD
- [ ] npm v1.0.0 배포

---

## 의존성 차트

```
Phase 1 (Foundation) ✅
    │
    ├── DICOM Parser ✅ ──┬── Pixel Decoder ✅
    │                     │
    └── WebGL Renderer ✅ ┴── React Viewport ✅
                                    │
                                    v
Phase 2 (Multi-Viewport) 🔄 ─────────────────────
    │
    ├── Single Canvas ✅ ──┬── 2D Array Texture ✅
    │                      │
    ├── ViewportManager ✅ ┼── FrameSyncEngine ✅
    │                      │
    └── CacheManager ⏳ ───┴── Prefetcher ⏳
                                    │
                                    v
Phase 3 (Annotations) ⏳ ────────────────────────
    │
    v
Phase 4 (Plugin System) ⏳ ──────────────────────
    │
    v
Phase 5 (Release) ⏳ ────────────────────────────
```

---

## 위험 요소

| 위험 | 영향 | 완화 방안 | 상태 |
|------|------|-----------|------|
| WebGL 컨텍스트 제한 (8-16개) | 멀티뷰포트 제한 | Single Canvas 방식 | ✅ 해결 |
| Safari WebCodecs 미지원 | 일부 성능 저하 | createImageBitmap 폴백 | ✅ 구현 |
| GPU 메모리 부족 | 성능 저하 | LRU 캐시 | ✅ 구현 |
| 벤더별 DICOM 차이 | 호환성 이슈 | 다양한 샘플 테스트 | ⏳ Phase 5 |
