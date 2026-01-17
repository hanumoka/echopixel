# Session Log

세션별 작업 기록입니다. 최신 세션이 위에 표시됩니다.

---

## 2026-01-17 세션 #4 (Phase 1a 시작)

### 작업 내용
- [x] CLAUDE.md에 가이드 원칙 추가 (학습 중심 가이드 방식)
- [x] pnpm-workspace.yaml 생성
- [x] 루트 package.json 생성
- [x] 폴더 구조 생성 (packages/core/src, apps/demo/src)
- [x] packages/core/package.json 생성

### 학습 내용
- 모노레포 구조 (packages vs apps)
- pnpm workspace 개념
- package.json 필드:
  - `type: "module"` (ESM vs CommonJS)
  - `engines` (Node.js 버전 제약)
  - `packageManager` (Corepack 연동)
  - `exports` (모던 진입점 명시)
  - `files` (npm 배포 시 포함 파일)
- Corepack 개념 및 pnpm과의 관계
- rimraf (크로스 플랫폼 삭제 도구)

### 다음 세션 할 일
- [ ] 폴더명 변경 (echopixcel → echopixel)
- [ ] apps/demo/package.json 생성
- [ ] TypeScript 설정 (tsconfig.json)
- [ ] Vite 설정 (vite.config.ts)
- [ ] ESLint + Prettier 설정
- [ ] 첫 번째 pnpm install 실행

### 메모
- 프로젝트 폴더명 echopixcel → echopixel로 변경 예정
- 사용자가 직접 코드 작성, Claude는 가이드 역할

---

## 2026-01-17 세션 #3

### 작업 내용
- [x] POC 계획 최종 검토 및 문서 정리
- [x] POC-SUMMARY.md 문서 생성
- [x] 테스트/CI/CD 전략 문서화
- [x] 잠재적 위험 문서화

### 결정사항
- 반응형 웹 지원 필수
- 네트워크 최적화 전략 (PQE, 프리페칭, 캐싱)
- 에러 처리 전략 (폴백 체인, 재시도, 컨텍스트 복구)
- npm alpha → sado 연동 테스트

### 메모
- WebCodecs ImageDecoder 도입 결정
- VideoFrame 제로카피 텍스처 업로드 전략 수립

---

## 2026-01-17 세션 #2

### 작업 내용
- [x] 프로젝트 목표 최종 정리
  - 성능 목표 구체화 (16개 뷰포트, 30fps, GPU 메모리 1.5GB 미만)
  - DataSource 지원 계획 수립 (WADO-RS/URI, MJPEG, Hybrid)
  - Progressive Quality Enhancement (PQE) 전략 정의
  - 프레임 동기화 방식 설계 (Frame Ratio, R-wave, Time, Manual)
- [x] 문서 업데이트
  - status.md: 성능 목표, 현재 상태, Phase 상세
  - implementation-phases.md: DataSource, PQE, 동기화 상세

### 결정사항
- Phase 1에 DataSource 추상화 레이어 포함
- Phase 2에 PQE 및 QIDO-RS 포함
- Phase 3에 STOW-RS (DICOM SR 저장) 포함
- Phase 5에 CPU 폴백 및 렌더링 전략 선택 포함

### 다음 세션 할 일
- [ ] Phase 1 시작: 모노레포 초기화 (pnpm workspace)
- [ ] Vite + TypeScript 설정
- [ ] 기본 프로젝트 구조 생성

### 메모
- Cornerstone3D 대비 차별화: 16개+ 뷰포트, 2D Array Texture, PQE
- 학습 목적: 핵심 로직(WebGL2, DICOM 파서)은 사용자 직접 구현

---

## 2026-01-17 세션 #1

### 작업 내용
- [x] 프로젝트 분석 및 현황 파악
- [x] 커스텀 서브에이전트 7개 생성 (analyzer, planner, coder, reviewer, doc-writer, tester, refactor)
- [x] CLAUDE.md 생성 및 설정
- [x] 문서 관리 체계 수립
- [x] 학습 목적에 맞는 역할 분담 정의

### 결정사항
- 핵심 로직(WebGL2, DICOM 파서 등)은 사용자가 직접 구현 (학습 목적)
- 에이전트는 분석, 리뷰, 보조 코드, 문서화 담당
- 장기 프로젝트로 세션 간 컨텍스트 유지를 위한 문서화 체계 구축

### 다음 세션 할 일
- [ ] Phase 1 시작: 모노레포 초기화 (pnpm workspace)
- [ ] Vite + TypeScript 설정
- [ ] 기본 프로젝트 구조 생성

### 메모
- 사용자: Spring Java 개발자, React/Next.js 초중급
- 학습 중: TypeScript, WebGL2, DICOM
