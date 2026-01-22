# 기여 가이드

EchoPixel 프로젝트에 기여해 주셔서 감사합니다! 이 문서에서는 기여 방법과 프로세스를 설명합니다.

---

## 목차

1. [기여 방법](#기여-방법)
2. [개발 프로세스](#개발-프로세스)
3. [커밋 규칙](#커밋-규칙)
4. [PR 가이드](#pr-가이드)
5. [코드 리뷰](#코드-리뷰)

---

## 기여 방법

### 기여 유형

| 유형 | 설명 |
|------|------|
| **버그 리포트** | 버그 발견 시 이슈 등록 |
| **기능 제안** | 새 기능 아이디어 제안 |
| **문서 개선** | 문서 오류 수정, 내용 추가 |
| **버그 수정** | 버그 수정 PR |
| **기능 구현** | 새 기능 구현 PR |
| **리팩토링** | 코드 개선 PR |

### 시작하기 전에

1. **이슈 확인**: 작업하려는 내용이 이미 이슈로 등록되어 있는지 확인
2. **이슈 생성**: 없다면 새 이슈 생성하여 논의
3. **할당 요청**: 작업하고 싶은 이슈에 댓글로 할당 요청

---

## 개발 프로세스

### 1. Fork & Clone

```bash
# 1. GitHub에서 Fork
# 2. Fork한 저장소 Clone
git clone https://github.com/YOUR_USERNAME/echopixel.git
cd echopixel

# 3. upstream 추가
git remote add upstream https://github.com/hanumoka/echopixel.git
```

### 2. 브랜치 생성

```bash
# 최신 main 동기화
git fetch upstream
git checkout main
git merge upstream/main

# 기능 브랜치 생성
git checkout -b feature/my-feature

# 또는 버그 수정
git checkout -b fix/bug-description
```

### 브랜치 네이밍

| 접두사 | 용도 | 예시 |
|--------|------|------|
| `feature/` | 새 기능 | `feature/ellipse-measurement` |
| `fix/` | 버그 수정 | `fix/context-loss-handling` |
| `docs/` | 문서 수정 | `docs/update-readme` |
| `refactor/` | 리팩토링 | `refactor/tool-system` |
| `test/` | 테스트 추가 | `test/parser-unit-tests` |

### 3. 개발

```bash
# 의존성 설치
pnpm install

# 개발 서버 실행
pnpm dev

# 코드 수정...

# 린트 확인
pnpm lint

# 빌드 확인
pnpm build
```

### 4. 커밋

```bash
git add .
git commit -m "feat: add ellipse measurement tool"
```

### 5. Push & PR

```bash
# Fork한 저장소에 Push
git push origin feature/my-feature

# GitHub에서 PR 생성
```

---

## 커밋 규칙

### Conventional Commits

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

| Type | 설명 |
|------|------|
| `feat` | 새 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서 변경 |
| `style` | 코드 포맷팅 (기능 변경 없음) |
| `refactor` | 리팩토링 (기능 변경 없음) |
| `test` | 테스트 추가/수정 |
| `chore` | 빌드, 설정 변경 |
| `perf` | 성능 개선 |

### Scope (선택)

| Scope | 설명 |
|-------|------|
| `core` | @echopixel/core |
| `react` | @echopixel/react |
| `demo` | demo 앱 |
| `dicom` | DICOM 관련 |
| `webgl` | WebGL 관련 |
| `tools` | 도구 시스템 |
| `annotations` | 어노테이션 |

### 예시

```bash
# 기능 추가
feat(annotations): add ellipse measurement tool

# 버그 수정
fix(webgl): handle context loss gracefully

# 문서 수정
docs: update installation guide

# 리팩토링
refactor(tools): simplify event handling

# 성능 개선
perf(core): optimize texture upload
```

### 커밋 본문

```
feat(annotations): add ellipse measurement tool

- Add EllipseTool class with mouse handlers
- Calculate area using pi * a * b formula
- Support calibration for real units

Closes #123
```

---

## PR 가이드

### PR 템플릿

```markdown
## 설명

<!-- 변경 내용을 간략히 설명하세요 -->

## 변경 유형

- [ ] 버그 수정 (기존 기능에 영향 없는 수정)
- [ ] 새 기능 (기존 기능에 영향 없는 추가)
- [ ] Breaking Change (기존 기능에 영향 있는 변경)
- [ ] 문서 수정

## 체크리스트

- [ ] 코드가 프로젝트 스타일 가이드를 따름
- [ ] 변경 내용에 대한 테스트 추가
- [ ] 모든 테스트 통과
- [ ] 문서 업데이트 (필요한 경우)

## 관련 이슈

Closes #이슈번호

## 스크린샷 (UI 변경 시)

<!-- 스크린샷 첨부 -->
```

### PR 작성 팁

1. **작은 단위로**: 하나의 PR에는 하나의 목적
2. **명확한 제목**: 변경 내용을 한 문장으로
3. **상세한 설명**: 왜 이 변경이 필요한지
4. **테스트 포함**: 변경 내용에 대한 테스트
5. **스크린샷**: UI 변경 시 before/after

### PR 크기 가이드

| 크기 | 변경 라인 | 권장 |
|------|-----------|------|
| XS | < 10 | ✅ |
| S | 10-50 | ✅ |
| M | 50-200 | ⚠️ 분할 고려 |
| L | 200-500 | ⚠️ 분할 권장 |
| XL | > 500 | ❌ 반드시 분할 |

---

## 코드 리뷰

### 리뷰어 역할

- **정확성**: 로직이 올바른지
- **성능**: 성능 문제가 없는지
- **보안**: 보안 취약점이 없는지
- **스타일**: 코딩 컨벤션 준수
- **테스트**: 테스트 커버리지
- **문서**: 문서 업데이트 필요 여부

### 리뷰 요청자 역할

- 모든 CI 체크 통과 후 리뷰 요청
- 리뷰어 코멘트에 응답
- 필요한 수정 반영

### 리뷰 코멘트 유형

```
# 필수 수정
🔴 MUST: 이 부분은 반드시 수정해야 합니다.

# 권장 수정
🟡 SHOULD: 수정을 권장합니다.

# 제안
🟢 COULD: 이렇게 하면 더 좋을 것 같습니다.

# 질문
❓ QUESTION: 이 부분이 이해가 안 됩니다.

# 칭찬
👍 GOOD: 좋은 접근 방식입니다!
```

---

## 문서 기여

### 문서 유형

| 위치 | 내용 |
|------|------|
| `docs/guide/user-guide/` | 사용자 가이드 |
| `docs/guide/developer-guide/` | 개발자 가이드 |
| `docs/architecture/` | 아키텍처 문서 |
| `docs/design/` | 설계 문서 |
| `README.md` | 프로젝트 소개 |

### 문서 작성 가이드

1. **마크다운 사용**: GitHub Flavored Markdown
2. **코드 예시 포함**: 가능하면 실행 가능한 예시
3. **한국어/영어**: 현재는 한국어 우선
4. **스크린샷**: 필요시 이미지 추가

---

## 이슈 등록

### 버그 리포트

```markdown
## 버그 설명

<!-- 버그를 명확하게 설명하세요 -->

## 재현 단계

1. '...'로 이동
2. '...'를 클릭
3. '...'를 스크롤
4. 에러 발생

## 예상 동작

<!-- 정상적으로 어떻게 동작해야 하는지 -->

## 실제 동작

<!-- 실제로 어떻게 동작하는지 -->

## 환경

- OS: [예: Windows 11]
- 브라우저: [예: Chrome 120]
- EchoPixel 버전: [예: 0.0.1]

## 스크린샷

<!-- 가능하면 스크린샷 첨부 -->
```

### 기능 제안

```markdown
## 기능 설명

<!-- 제안하는 기능을 설명하세요 -->

## 동기

<!-- 왜 이 기능이 필요한지 -->

## 제안 구현

<!-- 어떻게 구현하면 좋을지 (선택) -->

## 대안

<!-- 고려한 다른 방법 (선택) -->
```

---

## 질문 및 도움

- **GitHub Issues**: 버그 리포트, 기능 제안
- **GitHub Discussions**: 일반 질문, 아이디어 논의

감사합니다! 🎉
