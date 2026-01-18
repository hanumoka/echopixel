# Session Log

세션별 작업 기록입니다. 최신 세션이 위에 표시됩니다.

---

## 2026-01-18 세션 #8 (DICOM 파서 구현)

### 작업 내용
- [x] DICOM 모듈 파일 구조 생성
  - `packages/core/src/dicom/types.ts` (DicomTag, DicomElement, DicomDataset 인터페이스)
  - `packages/core/src/dicom/DicomParser.ts` (파싱 함수들)
  - `packages/core/src/dicom/index.ts` (배럴 export)
- [x] isDicomFile 함수 구현
  - DICM magic number (offset 128~131) 확인
  - 레거시 DICOM 지원 (Group 0x0002 또는 0x0008)
- [x] parseDicom 함수 구현
  - Explicit VR 태그 파싱 (Short/Long VR 형식)
  - Transfer Syntax UID 추출 (0002,0010)
  - Pixel Data 위치 저장 (7FE0,0010)
- [x] 핵심 태그 추출 함수 구현
  - `getUint16Value()`: US (Unsigned Short) 값 추출
  - `getStringValue()`: 문자열 값 추출
  - `getImageInfo()`: 렌더링 필수 정보 일괄 추출
- [x] core/index.ts 업데이트 (DICOM 모듈 export)
- [x] 빌드 및 타입체크 성공 확인
- [ ] 데모에서 테스트 (진행중)

### 학습 내용
- **WADO-RS vs WADO-URI 메타데이터 차이**
  - WADO-URI: 완전한 DICOM 파일 (메타데이터 + 픽셀)
  - WADO-RS /frames: 픽셀 데이터만 (메타데이터 별도 요청 필요)
  - WADO-RS /metadata: JSON 형식 메타데이터
- **DataView API**: ArrayBuffer에서 바이너리 데이터 읽기
- **VR (Value Representation)**: Short(2바이트 길이) vs Long(4바이트 길이) 형식
- **Little-endian**: DICOM 표준 바이트 순서

### 발견된 이슈
1. **VSCode IntelliSense DOM 타입 인식 오류**
   - `WebGL2RenderingContext`, `HTMLCanvasElement`, `console` 등 미인식
   - `pnpm build`, `pnpm typecheck` 모두 성공 (실제 오류 아님)
   - tsconfig.json에 `lib: ["ES2022", "DOM", "DOM.Iterable"]` 설정됨
   - VSCode 캐시 삭제, TS 서버 재시작 등 시도했으나 미해결
   - **결론**: 빌드에 영향 없음, 추후 해결

### 다음 세션 할 일
- [ ] Step 3 완료: 데모에서 DICOM 파서 테스트
- [ ] App.tsx 수정 (파일 선택 UI, 파싱 결과 표시)
- [ ] 실제 DICOM 파일로 테스트
- [ ] Step 4: 문서화 및 커밋

### 메모
- DICOM 파서 핵심 기능 구현 완료
- 현재 Explicit VR만 지원 (대부분의 DICOM 파일)
- Implicit VR, Sequence 파싱은 추후 필요시 확장

---

## 2026-01-18 세션 #7 (프로젝트 분석 + 코드 품질 개선)

### 작업 내용
- [x] 프로젝트 전체 분석 (4개 에이전트 병렬 실행)
  - 구조 분석, 문서 일관성, 코드 품질, 아키텍처 리뷰
- [x] 문서 불일치 수정
  - 뷰포트 목표: 10개 → **16개** 통일 (스트레스 에코)
  - 프레임 드롭: 0 → **< 1%** (현실적 목표)
  - GPU 메모리: 1GB → **1.5GB** 통일
  - Safari 폴백: Phase 2 이후로 결정
- [x] 오타 수정
  - CLAUDE.md: `echopixcel` → `echopixel`
  - package.json: `libraray` → `library`
- [x] README.md 기본 내용 작성
- [x] core 코드 개선
  - Renderer 인터페이스 정의 (타입 안전성)
  - dispose() 함수 추가 (메모리 관리)
  - WebGL2 컨텍스트 옵션 추가 (의료영상 최적화)
- [x] App.tsx 개선
  - cleanup 함수 추가 (메모리 누수 방지)
  - 에러 처리 추가 (사용자 피드백)

### 발견된 이슈
1. **TypeScript 선언 파일 미생성** (Critical)
   - vite-plugin-dts 설치 필요 (pnpm 환경 문제로 TODO)
2. **cleanup 함수 누락** (Critical) → 수정 완료
3. **문서 불일치** (4곳) → 수정 완료

### 결정사항
- 뷰포트 목표: **16개** (스트레스 에코)
- Safari 우선순위: **Phase 2 이후**
- README.md: 지금 작성

### 다음 세션 할 일
- [ ] pnpm 환경 확인 후 vite-plugin-dts 설정
- [ ] Phase 1b-1 시작: 단일 프레임 DICOM 파싱
- [ ] DICOM 파일 식별 함수 (isDicomFile)
- [ ] 기본 태그 파싱 (Rows, Columns, Bits Allocated 등)

### 메모
- 프로젝트 전체 점검 완료, 코드 품질 B+ → A 목표
- 핵심 개선: Renderer 인터페이스, dispose(), cleanup, 에러 처리

---

## 2026-01-18 세션 #6 (Phase 1a 완료 + Phase 1b 설계)

### 작업 내용
- [x] ESLint + Prettier 설정
  - .prettierrc 생성 (semi: true, singleQuote: true, trailingComma: all)
  - eslint.config.js 생성 (ESLint 9 Flat Config)
- [x] 루트 package.json에 devDependencies 추가
- [x] apps/demo에 React 의존성 추가
- [x] pnpm 설치 및 pnpm install 실행
- [x] @echopixel/core 첫 구현
  - packages/core/src/index.ts (createRenderer, WebGL2 컨텍스트)
- [x] apps/demo React 앱 구현
  - index.html, main.tsx, App.tsx
- [x] core 빌드 → demo 개발 서버 실행
- [x] **WebGL2 파란색 캔버스 렌더링 성공!**
- [x] Phase 1b 설계 문서 작성 (docs/design/phase-1b-design.md)

### 학습 내용
- ESLint 9 Flat Config 방식
- pnpm 전역 설치 방법
- Canvas와 WebGL2의 관계:
  - Canvas = 도화지 (픽셀 버퍼)
  - WebGL2 Context = GPU 가속 그림 도구
  - gl.clearColor() + gl.clear() = 화면 채우기
- 브라우저 → GPU 통신 흐름:
  - JavaScript → 브라우저 렌더링 엔진 → GPU 드라이버 → GPU
- 모노레포에서 패키지 빌드 → 앱에서 사용 워크플로우

### Phase 1b 설계 결정사항
1. **DICOM 파일 식별**: 확장자가 아닌 파일 내용으로 판단
   - DICM prefix (offset 128~131) 확인
   - 레거시 DICOM은 첫 번째 태그 유효성 검사
   - .dcm, .dicom, .dic, 확장자 없음 모두 지원

2. **Modality 검증**: 범용 DICOM 뷰어로 설계
   - 심장초음파(US) 전용 필터링 하지 않음
   - DICOM 메타데이터는 신뢰할 수 없음 (누락, 오류 흔함)
   - 뷰어의 역할은 "이미지를 잘 보여주는 것"
   - 검증: DICOM 파일인지 + 픽셀 데이터 존재 여부만 확인

3. **단계적 구현 전략**:
   - Phase 1b-1: 단일 프레임 먼저 구현
   - Phase 1b-2: 멀티프레임 확장

### 다음 세션 할 일
- [ ] Phase 1b-1 시작: 단일 프레임 DICOM 파싱
- [ ] DICOM 파일 식별 함수 (isDicomFile)
- [ ] 기본 태그 파싱 (Rows, Columns, Bits Allocated 등)
- [ ] 픽셀 데이터 추출

### 메모
- Phase 1a 완료! 첫 번째 마일스톤 달성
- WebGL2 동작 확인 완료
- Phase 1b 설계 완료, 구현 준비 완료

---

## 2026-01-17 세션 #5 (Phase 1a 계속 - 개발 환경 설정)

### 작업 내용
- [x] 루트 package.json name 오타 수정 (echopixcel → echopixel)
- [x] apps/demo/package.json 생성
- [x] TypeScript 설정 (tsconfig.json)
  - 루트: 공통 설정 (strict, moduleResolution: bundler)
  - packages/core: 라이브러리용 (declaration, declarationMap)
  - apps/demo: React 앱용 (jsx: react-jsx, paths alias)
- [x] Vite 설정 (vite.config.ts)
  - packages/core: Library 모드 (ESM + CJS 듀얼 빌드)
  - apps/demo: App 모드 (React 플러그인, 개발 서버)

### 학습 내용
- `workspace:*` 프로토콜: pnpm에서 로컬 패키지를 심볼릭 링크로 연결
- tsconfig.json과 Vite의 관계:
  - tsc: 타입 체크만 (noEmit: true)
  - Vite(esbuild): 실제 코드 변환 (타입 체크 생략)
  - paths 설정은 둘 다 필요 (IDE용, 빌드용)
- VSCode의 tsconfig.json 자동 인식 (가장 가까운 설정 파일 사용)
- vite build 과정: 진입점 → 의존성 그래프 → 변환 → 최적화 → 번들
- 번들러 처리 대상: 스크립트(.ts/.tsx), 스타일(.css/.scss), 에셋, WASM, GLSL 등

### 다음 세션 할 일
- [ ] ESLint + Prettier 설정
- [ ] 첫 번째 pnpm install 실행
- [ ] WebGL2 컨텍스트 초기화
- [ ] 정적 텍스처 렌더링

### 메모
- TS 오류(vite 모듈 못 찾음)는 pnpm install 후 해결 예정
- Library 모드: minify: false (개발 중 디버깅 편의)

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
