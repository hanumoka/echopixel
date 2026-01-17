# EchoPixel 기술 스택

## 핵심 기술

| 레이어 | 기술 | 선정 이유 |
|--------|------|-----------|
| **렌더링** | WebGL2 | 2D Array Texture로 프레임 시퀀스 저장, 98% 브라우저 지원 |
| **UI** | React 18+ | Concurrent features, Suspense |
| **DICOM 파싱** | 커스텀 파서 (dicom.ts 참고) | Lazy 파싱, GPU 최적화 |
| **빌드** | Vite + TypeScript | Tree-shaking, ESM 우선 |
| **상태관리** | Zustand | 경량, Provider 불필요 |
| **코덱** | Web Workers + WASM | OpenJPEG, CharLS |

---

## 상세 기술 선택

### 렌더링: WebGL2

#### 선택 이유
- **2D Array Texture**: 프레임 시퀀스를 단일 텍스처 배열로 저장
- **98% 브라우저 지원**: IE 제외 모든 주요 브라우저
- **Compute-like 기능**: Transform feedback, Instanced rendering

#### 대안 분석
| 옵션 | 장점 | 단점 | 결정 |
|------|------|------|------|
| WebGL2 | 광범위 지원, Array Texture | WebGPU보다 성능 낮음 | **선택** |
| WebGPU | 최고 성능, Compute shader | 76% 지원율, Safari 불안정 | 보류 |
| Canvas 2D | 간단함 | GPU 활용 불가 | 제외 |

---

### UI: React 18+

#### 선택 이유
- **Concurrent Features**: 무거운 렌더링 중 UI 응답성 유지
- **Suspense**: DICOM 로딩 상태 관리
- **생태계**: 의료 영상 분야에서 가장 널리 사용

#### 고려 사항
- Strict Mode에서 더블 마운트 처리 필요
- useSyncExternalStore로 WebGL 상태 연동

---

### DICOM 파싱: 커스텀 파서

#### 선택 이유
기존 라이브러리 성능 비교:

| 라이브러리 | 로딩 시간 | 메모리 | 비고 |
|------------|-----------|--------|------|
| dicom-parser | 기준 | 기준 | 가장 널리 사용 |
| dcmjs | 1.5x 느림 | 1.3x | 더 많은 기능 |
| dicom.ts | **0.1-0.5x** | 0.5x | Lazy 파싱, GPU 최적화 |

**dicom.ts 방식 채택**: 필요한 태그만 파싱, GPU에서 LUT 처리

#### 핵심 설계 원칙
```typescript
class DicomParser {
  // Lazy: 태그 접근 시점에 파싱
  getElement(tag: Tag): DicomElement {
    if (!this.parsed.has(tag)) {
      this.parseElement(tag)
    }
    return this.parsed.get(tag)
  }
}
```

---

### 빌드: Vite + TypeScript

#### 선택 이유
- **빠른 개발 서버**: ESM 네이티브, HMR
- **Tree-shaking**: 사용하지 않는 코드 제거
- **TypeScript**: 의료 데이터의 타입 안전성

#### 설정 포인트
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs']  // 듀얼 포맷
    },
    rollupOptions: {
      external: ['react', 'react-dom']  // Peer deps
    }
  }
})
```

---

### 상태 관리: Zustand

#### 선택 이유
- **경량**: 1KB gzipped
- **Provider 불필요**: 전역 상태 쉽게 접근
- **Concurrent Mode 호환**: useSyncExternalStore 사용

#### 대안 분석
| 옵션 | 크기 | 복잡도 | 결정 |
|------|------|--------|------|
| Zustand | 1KB | 낮음 | **선택** |
| Jotai | 2KB | 낮음 | 고려 |
| Redux Toolkit | 11KB | 높음 | 과도함 |
| React Context | 0KB | 중간 | 리렌더링 이슈 |

---

### 코덱: Web Workers + WASM

#### 선택 이유
- **메인 스레드 차단 방지**: 디코딩 중 UI 응답성 유지
- **네이티브 성능**: WASM으로 C/C++ 코덱 포팅

#### 코덱 구성

| Transfer Syntax | 코덱 | 구현 |
|-----------------|------|------|
| 1.2.840.10008.1.2 (Implicit VR) | Native | ArrayBuffer |
| 1.2.840.10008.1.2.1 (Explicit VR) | Native | ArrayBuffer |
| 1.2.840.10008.1.2.4.50 (JPEG Baseline) | Browser | createImageBitmap |
| 1.2.840.10008.1.2.4.70 (JPEG Lossless) | OpenJPEG | WASM |
| 1.2.840.10008.1.2.4.80 (JPEG-LS) | CharLS | WASM |
| 1.2.840.10008.1.2.4.90 (JPEG2000) | OpenJPEG | WASM |
| 1.2.840.10008.1.2.5 (RLE) | Custom | JavaScript |

---

## 지원 기술

| 구성요소 | 기술 | 목적 |
|----------|------|------|
| 테스팅 | Vitest + Playwright | 단위 테스트 + E2E |
| 문서화 | Storybook + TypeDoc | 컴포넌트 데모 + API 문서 |
| 린팅 | ESLint + Prettier | 코드 품질 |
| CI/CD | GitHub Actions | 자동화된 빌드/배포 |
| 패키지 | pnpm workspace | 모노레포 관리 |

---

## 브라우저 지원

| 브라우저 | 최소 버전 | 비고 |
|----------|-----------|------|
| Chrome | 80+ | 권장 |
| Firefox | 74+ | |
| Safari | 15+ | WebGL2 지원 시작 |
| Edge | 80+ | Chromium 기반 |
| IE | 미지원 | |

### 성능 참고
[Web-Based DICOM Viewers Survey](https://pmc.ncbi.nlm.nih.gov/articles/PMC12092310/)에 따르면:
- Chrome/Firefox가 가장 빠른 표시 속도
- Windows가 Mac보다 약간 우수한 성능
- Safari는 Chrome과 유사한 성능 (WebGL2 지원 시)

---

## 참고 자료

- [dicom.ts npm](https://www.npmjs.com/package/dicom.ts) - 10-1800% 성능 향상
- [WebGL2 Fundamentals](https://webgl2fundamentals.org/)
- [Zustand GitHub](https://github.com/pmndrs/zustand)
- [Vite Library Mode](https://vitejs.dev/guide/build.html#library-mode)
