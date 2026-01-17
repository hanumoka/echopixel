# EchoPixel 진행 상황

## 현재 상태

| 항목 | 상태 |
|------|------|
| **현재 Phase** | Phase 0 (계획 수립) |
| **마지막 업데이트** | 2026-01-17 |
| **다음 마일스톤** | Phase 1 프로젝트 설정 |

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

### Phase 1: Foundation ⏳ 대기

- [ ] 프로젝트 설정
  - [ ] 모노레포 초기화
  - [ ] Vite + TypeScript
  - [ ] ESLint + Prettier
  - [ ] Vitest
- [ ] DICOM 파서
- [ ] 픽셀 디코더
- [ ] WebGL 렌더러
- [ ] React 컴포넌트
- [ ] Cine 재생

### Phase 2: Multi-Viewport ⏳ 대기

- [ ] Single Canvas 아키텍처
- [ ] 2D Array Texture
- [ ] ViewportManager
- [ ] 프레임 동기화
- [ ] 캐시 관리

### Phase 3: Annotations ⏳ 대기

- [ ] 어노테이션 엔진
- [ ] 측정 도구
- [ ] 캘리브레이션
- [ ] 직렬화

### Phase 4: Plugin System ⏳ 대기

- [ ] Plugin API
- [ ] 기본 플러그인
- [ ] React 통합

### Phase 5: Release ⏳ 대기

- [ ] 멀티 벤더 테스트
- [ ] 문서화
- [ ] npm 배포

---

## 최근 활동

### 2026-01-17
- 프로젝트 초기 계획 수립
- 기술 조사 완료
  - Cornerstone3D 성능 문제 분석 (Issue #1756)
  - dicom.ts 성능 비교
  - WebGL 최적화 기법 조사
- 문서 구조 생성
  - `docs/architecture/overview.md`
  - `docs/design/technical-stack.md`
  - `docs/design/performance-strategy.md`
  - `docs/research/cornerstone3d-analysis.md`
  - `docs/roadmap/implementation-phases.md`

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

---

## 다음 단계

1. **모노레포 초기화**
   - pnpm workspace 설정
   - packages/core, packages/react 구조 생성

2. **개발 환경 설정**
   - Vite 라이브러리 모드 설정
   - TypeScript strict 모드
   - ESLint + Prettier

3. **DICOM 파서 프로토타입**
   - Lazy 파싱 POC
   - 멀티프레임 지원

---

## 연락처

- **Repository**: [GitHub - echopixel](https://github.com/hanumoka/echopixel)
- **이슈 트래커**: GitHub Issues
