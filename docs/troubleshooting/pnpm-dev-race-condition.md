# pnpm dev 실행 시 Race Condition 문제

## 증상

`pnpm dev` 실행 시 다음 오류 중 하나 또는 여러 개가 발생:

```
Failed to resolve entry for package "@echopixel/core".
The package may have incorrect main/module/exports specified in its package.json.
```

```
Cannot find module '@echopixel/core' or its corresponding type declarations.
```

```
error TS6059: File '...' is not under 'rootDir'.
'rootDir' is expected to contain all source files.
```

## 근본 원인

### pnpm dev 스크립트의 병렬 실행

```json
"dev": "pnpm -r --parallel run dev"
```

이 스크립트는 모든 패키지의 `dev` 스크립트를 **동시에** 실행합니다:

| 패키지 | dev 스크립트 | 역할 |
|--------|-------------|------|
| `packages/core` | `vite build --watch` | 라이브러리 빌드 |
| `packages/react` | `vite build --watch` | 라이브러리 빌드 |
| `apps/demo` | `vite` | dev server 시작 |

### 문제 발생 순서

```
시간순서:
1. apps/demo      → vite dev server 시작 → 의존성 스캔 시작
2. packages/core  → vite build --watch 시작 → dist/ 재생성 중...
3. packages/react → vite build --watch 시작 → dist/ 재생성 중...
   ↓
4. apps/demo가 @echopixel/core의 entry point 검색
5. 심볼릭 링크 → packages/core/dist/index.js 참조
6. 하지만 dist/index.js가 아직 재생성 중이거나 없음!
   → "Failed to resolve entry for package" 오류
```

### 다른 PC에서 작동한 이유

- **Vite 캐시**: `.vite` 폴더에 이전 dependency pre-bundling 결과 존재
- **타이밍**: 우연히 packages 빌드가 먼저 완료된 후 demo가 스캔 시작
- **이전 빌드**: `pnpm build`가 이미 실행되어 `dist/` 폴더 존재

---

## 해결책

### 해결책 1: apps/demo의 Vite alias 설정 (런타임 문제 해결)

`apps/demo/vite.config.ts`에서 워크스페이스 패키지를 소스 파일로 직접 참조:

```typescript
// apps/demo/vite.config.ts
export default defineConfig({
  resolve: {
    alias: {
      "@echopixel/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      "@echopixel/react": resolve(__dirname, "../../packages/react/src/index.ts"),
    },
  },
  // ...
});
```

**장점**:
- `dist/` 폴더 존재 여부와 관계없이 dev server 작동
- 소스 변경 시 즉시 HMR 반영

**한계**:
- TypeScript 타입 생성 시(vite-plugin-dts) 오류는 여전히 발생 가능

### 해결책 2: dev 스크립트 수정 ✅ 적용됨

빌드 완료 후 watch 모드 시작:

```json
{
  "scripts": {
    "dev": "pnpm build && pnpm -r --parallel run dev"
  }
}
```

또는 스크립트 분리:

```json
{
  "scripts": {
    "dev": "pnpm build && pnpm dev:watch",
    "dev:watch": "pnpm -r --parallel run dev"
  }
}
```

**장점**:
- 첫 실행 시 모든 `dist/` 폴더 생성 보장
- TypeScript 오류도 해결

### 해결책 3: 터미널 분리 (수동)

```bash
# 터미널 1: packages만 watch
pnpm --filter './packages/*' -r --parallel run dev

# 터미널 2: demo만 실행 (packages 빌드 완료 후)
pnpm --filter @echopixel/demo dev
```

---

## 시도했지만 실패한 방법

### TypeScript paths 설정

`tsconfig.json`에 paths 추가:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@echopixel/core": ["packages/core/src/index.ts"],
      "@echopixel/react": ["packages/react/src/index.ts"]
    }
  }
}
```

**결과**: TS6059 오류 발생

```
error TS6059: File 'packages/core/src/...' is not under 'rootDir'
'packages/react/src'. 'rootDir' is expected to contain all source files.
```

**원인**:
- paths로 다른 패키지의 소스를 직접 참조하면 TypeScript가 해당 파일들을 프로그램에 포함
- `packages/react/tsconfig.json`의 `rootDir: "./src"` 제약과 충돌

---

## 현재 적용된 설정

### apps/demo/vite.config.ts (alias 적용)

```typescript
resolve: {
  alias: {
    "@": resolve(__dirname, "./src"),
    "@echopixel/core": resolve(__dirname, "../../packages/core/src/index.ts"),
    "@echopixel/react": resolve(__dirname, "../../packages/react/src/index.ts"),
  },
},
```

### tsconfig.json (원래 상태)

paths 설정 없음 (TS6059 오류 방지)

---

## 관련 리소스

- [Vite Discussion #11997 - Failed to resolve entry](https://github.com/vitejs/vite/discussions/11997)
- [vite-plugin-dts Issue #14 - Monorepo](https://github.com/qmhc/vite-plugin-dts/issues/14)
- [unplugin-dts Issue #210 - rootDir error](https://github.com/qmhc/unplugin-dts/issues/210)
- [Live types in a TypeScript monorepo](https://colinhacks.com/essays/live-types-typescript-monorepo)

---

## 요약

| 문제 | 원인 | 해결책 |
|------|------|--------|
| "Failed to resolve entry" | 병렬 실행으로 dist/ 미생성 상태에서 접근 | Vite alias 또는 빌드 순서 보장 |
| "Cannot find module" (TS) | vite-plugin-dts가 타입 생성 시 dist/index.d.ts 미존재 | 빌드 순서 보장 |
| TS6059 rootDir | paths로 외부 소스 참조 시 rootDir 제약 충돌 | paths 설정 제거 |
