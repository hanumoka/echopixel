# EchoPixel 진행 상황

## 현재 상태

| 항목 | 상태 |
|------|------|
| **현재 Phase** | Phase 1 (Foundation) |
| **마지막 업데이트** | 2026-01-17 |
| **다음 마일스톤** | 모노레포 초기화 + 기본 설정 |

---

## 핵심 목표

```
웹 브라우저에서 16개 이상의 DICOM 심초음파 영상을
동시에 30fps 이상으로 재생하는 고성능 뷰어 라이브러리
```

### 성능 목표

| 메트릭 | 목표 |
|--------|------|
| 동시 뷰포트 | **16개** (스트레스 에코) |
| 프레임 레이트 | **30fps 이상** |
| GPU 메모리 | **1.5GB 미만** |
| 동기화 지연 | **< 16ms** |
| 프레임 드롭 | **< 1%** |
| 초기 표시 | **0.5초 이내** (저품질) |

### 기술적 차별화 (vs Cornerstone3D)

| 항목 | Cornerstone3D | EchoPixel |
|------|---------------|-----------|
| 뷰포트 제한 | ~8개 | **16개+** |
| 렌더링 | vtk.js 의존 | **직접 WebGL2** |
| 프레임 전환 | 텍스처 바인딩 | **2D Array Texture** |
| 품질 전환 | 단순 교체 | **PQE (점진적)** |
| 디코딩 | WASM (CPU) | **WebCodecs (GPU HW)** |

### 추가 요구사항

| 항목 | 설명 |
|------|------|
| **반응형 웹** | 데스크탑/태블릿/모바일, 터치 제스처 |
| **네트워크 최적화** | PQE, 프리페칭, 캐싱, 대역폭 감지 |
| **에러 처리** | 폴백 체인, 재시도, 컨텍스트 복구 |
| **테스트/배포** | npm alpha → sado 프로젝트 연동 테스트 |

> 상세 내용: [POC-SUMMARY.md](../POC-SUMMARY.md) 참조

---

## Phase별 진행률

### Phase 0: 계획 수립 ✅ 완료

- [x] 프로젝트 요구사항 정의
- [x] 기술 조사 (Cornerstone3D 분석)
- [x] 기술 스택 결정
- [x] 아키텍처 설계
- [x] 성능 최적화 전략 수립
- [x] 구현 로드맵 작성
- [x] 문서 구조 설정

### Phase 1: Foundation 🚧 진행중 (세분화)

#### Phase 1a: 프로젝트 설정 + 기본 렌더링 ⏳
- [ ] 모노레포 초기화 (pnpm workspace)
- [ ] Vite + TypeScript (strict)
- [ ] ESLint + Prettier
- [ ] WebGL2 컨텍스트 초기화
- [ ] 정적 텍스처 렌더링

#### Phase 1b: DICOM 파싱 + 디코딩 ⏳
- [ ] DICOM 파서 (Lazy 파싱)
- [ ] **WebCodecs ImageDecoder** (하드웨어 가속)
- [ ] **VideoFrame → WebGL 텍스처 직접 업로드** (제로카피)
- [ ] Local File DataSource

#### Phase 1c: Cine 재생 + React 컴포넌트 ⏳
- [ ] Cine 재생 (rAF, 가변 FPS)
- [ ] React Viewport 컴포넌트
- [ ] Window/Level 마우스 조정
- [ ] Play/Pause 제어

#### Phase 1d: DataSource + 네트워크 기초 ⏳
- [ ] WADO-RS DataSource
- [ ] Range Requests (멀티프레임 부분 요청)
- [ ] LRU 메모리 캐시
- [ ] 네트워크 재시도 (지수 백오프)

#### Phase 1e: 에러 처리 + 반응형 기초 ⏳
- [ ] 기본 에러 UI
- [ ] 디코딩 폴백 (WebCodecs → createImageBitmap)
- [ ] ResizeObserver, DPI 감지

#### Safari 폴백 (우선순위 낮음)
- [ ] createImageBitmap 기반 (Phase 1e 또는 Phase 2)

### Phase 2: Multi-Viewport & Quality ⏳ 대기

- [ ] Single Canvas 아키텍처 (16개 뷰포트)
- [ ] 2D Array Texture
- [ ] ViewportManager
- [ ] FrameSyncEngine (프레임 동기화)
  - [ ] Frame Ratio (프레임 비율 기반)
  - [ ] R-wave (심박 주기 기준)
  - [ ] Time (절대 시간 기준)
  - [ ] FPS 정규화 (다른 프레임 수 조정)
- [ ] 캐시 관리
- [ ] Progressive Quality Enhancement (PQE)
  - [ ] Thumbnail (64px) → Preview (256px) → Standard (512px) → Original
  - [ ] Double Buffering (끊김 없는 전환)
  - [ ] texSubImage3D (레이어 단위 업데이트)
- [ ] QIDO-RS (Study/Series/Instance 검색)
- [ ] 디바이스 성능 감지
- [ ] **OffscreenCanvas 렌더링 옵션** ⭐ 신규
- [ ] **H.264 스트림 옵션** (WebCodecs VideoDecoder) ⭐ 신규
- [ ] **LOD 알고리즘** (뷰포트 크기별 해상도 조절) ⭐ 신규
- [ ] **반응형 레이아웃** (브레이크포인트, 터치 제스처) ⭐ 신규
- [ ] **네트워크 고급** (프리페칭, 대역폭 감지, SW 캐싱) ⭐ 신규
- [ ] **에러 처리 고급** (컨텍스트 복구, 메모리 관리, 로깅) ⭐ 신규
- [ ] **스크롤/가시성 최적화** (IntersectionObserver, 화면 밖 렌더링 중지) ⭐ 신규

### Phase 3: Annotations ⏳ 대기

- [ ] SVG 오버레이 엔진
- [ ] 측정 도구 (거리, 영역, Doppler, 각도)
- [ ] 캘리브레이션 시스템
- [ ] 어노테이션 저장/로드
- [ ] STOW-RS (DICOM SR 저장)

### Phase 4: Plugin System ⏳ 대기

- [ ] Plugin API
- [ ] 기본 플러그인
- [ ] React 통합

### Phase 5: Release ⏳ 대기

- [ ] 멀티 벤더 테스트 (GE, Philips, Siemens, Canon)
- [ ] 추가 코덱 (JPEG-LS, JPEG2000, RLE)
- [ ] CPU 폴백 + 사용자 선택 UI
- [ ] 접근성 (키보드, ARIA)
- [ ] 문서화 (Storybook, TypeDoc)
- [ ] npm v1.0.0 배포
- [ ] **WebGPU 렌더링 경로** (옵션, 미래 대비) ⭐ 신규

---

## 최근 활동

### 2026-01-17 (세션 #3)
- POC 계획 최종 검토 및 문서 정리
  - 반응형 웹 요구사항 추가
  - 네트워크 최적화 전략 수립 (PQE, 프리페칭, 캐싱)
  - 에러 처리 전략 수립 (폴백 체인, 재시도, 컨텍스트 복구)
  - 테스트/배포 전략 확정 (npm alpha → sado 연동)
  - 예상 성능 비교 분석 (Cornerstone3D vs EchoPixel)
- POC-SUMMARY.md 문서 생성

### 2026-01-17 (세션 #2)
- 프로젝트 목표 최종 정리
  - 성능 목표 구체화 (16개 뷰포트, 30fps, 1.5GB 미만)
  - DataSource 지원 계획 (WADO-RS/URI, MJPEG, Hybrid)
  - Progressive Quality Enhancement (PQE) 전략 수립
  - 프레임 동기화 방식 정의 (Frame Ratio, R-wave, Time)
- 문서 업데이트 (status.md, implementation-phases.md)

---

## 이슈 및 블로커

| 이슈 | 상태 | 담당 | 비고 |
|------|------|------|------|
| 없음 | - | - | - |

---

## 결정 사항 로그

| 날짜 | 결정 | 이유 |
|------|------|------|
| 2026-01-17 | Cornerstone3D 호환성 불필요 | 독립적 개발로 성능 최적화 가능 |
| 2026-01-17 | WebGL2 사용 (WebGPU 아님) | 98% 브라우저 지원, 충분한 성능 |
| 2026-01-17 | vtk.js 미사용 | 오버헤드 제거, 직접 WebGL 제어 |
| 2026-01-17 | React 18+ 지원 | Concurrent features 활용 |
| 2026-01-17 | pnpm workspace 모노레포 | 효율적 패키지 관리 |
| 2026-01-17 | WebCodecs ImageDecoder 도입 | 하드웨어 가속 디코딩, WASM 대비 빠름 |
| 2026-01-17 | VideoFrame 제로카피 텍스처 | GPU→GPU 직접 전송, 복사 오버헤드 제거 |
| 2026-01-17 | Safari 폴백 필요 | WebCodecs 지원 제한적, JPEG Baseline 폴백 |
| 2026-01-17 | OffscreenCanvas Phase 2에 추가 | 메인 스레드 분리, UI 응답성 향상 |
| 2026-01-17 | WebGPU Phase 5 옵션 | 미래 대비, 추상화 레이어 준비 |
| 2026-01-17 | 반응형 웹 지원 필수 | 데스크탑/태블릿/모바일 대응 |
| 2026-01-17 | 네트워크 최적화 전략 | PQE, 프리페칭, 캐싱, 대역폭 감지 |
| 2026-01-17 | 에러 처리 전략 | 폴백 체인, 재시도, 컨텍스트 복구 |
| 2026-01-17 | npm alpha → sado 테스트 | 중간 결과물 실환경 검증 |
| 2026-01-17 | Phase 1 세분화 (1a~1e) | 작은 단위로 진행/검증 용이 |
| 2026-01-17 | `@echopixel/*` 스코프 패키지 | 모노레포 표준, 네임스페이스 관리 |
| 2026-01-17 | Safari 폴백 우선순위 낮춤 | Chrome/Edge 우선, Safari는 Phase 1e 또는 2 |
| 2026-01-17 | VideoFrame.close() 필수 | GPU 메모리 누수 방지, try-finally 패턴 사용 |
| 2026-01-17 | VideoFrame 제로카피 폴백 체인 | 일부 GPU/드라이버에서 실패 대비 |
| 2026-01-17 | 프레임 드롭 목표 조정 (0→<1%) | 완벽한 0은 비현실적, 현실적 목표 설정 |
| 2026-01-17 | 대중적 Transfer Syntax 전체 지원 | Phase별 점진적 지원 (1: JPEG, 2: H.264, 5: WASM) |
| 2026-01-17 | Decoder 추상화 레이어 설계 | Phase 1에서 인터페이스 정의, Phase 5까지 확장 가능 |
| 2026-01-17 | TextureUploader 다중 입력 지원 | VideoFrame, ImageBitmap, TypedArray 모두 처리 |
| 2026-01-17 | 테스트 전략 정의 | Vitest (Unit/Integration) + Playwright (E2E) |
| 2026-01-17 | CI/CD 워크플로우 정의 | GitHub Actions: lint, typecheck, test, build, publish |
| 2026-01-17 | React Error Boundary 전략 | App/Viewport/Toolbar 계층별 에러 격리 |
| 2026-01-17 | 잠재적 위험 문서화 | Safari, 메모리 누수, 폴백, 벤더 호환성 |
| 2026-01-17 | DICOM 샘플 수집 계획 | Transfer Syntax별, 벤더별, 엣지 케이스별 |

---

## 다음 단계

### 즉시 진행 (Phase 1a)

1. **모노레포 초기화**
   - pnpm workspace 설정
   - `@echopixel/core`, `@echopixel/react` 구조 생성

2. **개발 환경 설정**
   - Vite 라이브러리 모드 설정
   - TypeScript strict 모드
   - ESLint + Prettier

3. **WebGL2 기본 렌더링**
   - 컨텍스트 초기화
   - 테스트 이미지 렌더링

### Phase 1 세부 마일스톤

| Phase | 마일스톤 | npm 버전 |
|-------|----------|----------|
| 1a | WebGL2 테스트 이미지 렌더링 | - |
| 1b | 로컬 DICOM → 화면 표시 | 0.1.0-alpha.1 |
| 1c | 단일 뷰포트 cine + W/L | 0.1.0-alpha.2 |
| 1d | WADO-RS 원격 로드 | 0.1.0-alpha.3 |
| 1e | 에러 처리 + 반응형 | 0.1.0-beta.1 |

---

## 연락처

- **Repository**: [GitHub - echopixel](https://github.com/hanumoka/echopixel)
- **이슈 트래커**: GitHub Issues
