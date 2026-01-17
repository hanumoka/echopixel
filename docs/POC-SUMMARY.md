# EchoPixel POC 프로젝트 요약

> **목적**: 검토용 단일 문서
> **작성일**: 2026-01-17
> **상태**: Phase 1 시작 전 (계획 완료)

---

## 1. 프로젝트 목표

### 핵심 목표
```
웹 브라우저에서 16개 이상의 DICOM 심초음파 영상을
동시에 30fps 이상으로 재생하는 고성능 뷰어 라이브러리
```

### 성능 목표

| 메트릭 | 목표 | 비고 |
|--------|------|------|
| 동시 뷰포트 | **16개** | 스트레스 에코 요구사항 |
| 프레임 레이트 | **30fps 이상** | YouTube/Netflix 수준 |
| GPU 메모리 | **1.5GB 미만** | 16 뷰포트 × 100프레임 기준 |
| 동기화 지연 | **< 16ms** | 1프레임 이내 |
| 프레임 드롭 | **< 1%** | 더블 버퍼링, 현실적 목표 |
| 초기 표시 | **0.5초 이내** | 저품질 우선 로드 |

### Cornerstone3D 대비 차별점

| 항목 | Cornerstone3D | EchoPixel |
|------|---------------|-----------|
| 뷰포트 제한 | ~8개 (WebGL 컨텍스트) | **16개+** (Single Canvas) |
| 렌더링 | vtk.js 의존 (25% 오버헤드) | **직접 WebGL2** |
| 프레임 전환 | 텍스처 바인딩 필요 | **2D Array Texture** (바인딩 없음) |
| 품질 전환 | 단순 교체 | **PQE** (점진적 향상) |
| 디코딩 | WASM | **WebCodecs** (HW 가속) |

### 반응형 웹 요구사항

| 항목 | 요구사항 |
|------|----------|
| **화면 크기** | 데스크탑, 태블릿, 모바일 지원 |
| **레이아웃** | 화면 크기에 따라 뷰포트 그리드 자동 조정 |
| **터치 지원** | 터치 제스처 (핀치 줌, 스와이프, 드래그) |
| **DPI 대응** | Retina/HiDPI 디스플레이 선명도 유지 |
| **방향 전환** | Portrait ↔ Landscape 전환 시 재배치 |

**반응형 브레이크포인트 (예시)**:
```
Desktop  (≥1200px): 4x4 그리드 (16개 뷰포트)
Tablet   (768-1199px): 2x2 또는 3x3 그리드
Mobile   (<768px): 1x1 또는 2x1 그리드
```

**고려 사항**:
- 작은 화면에서는 LOD로 저해상도 렌더링 → 성능 유지
- 터치 이벤트와 마우스 이벤트 통합 처리
- CSS Container Queries 활용 가능

### 스크롤/가시성 최적화 전략

#### 문제: 스트레스 에코 격자 레이아웃
```
스트레스 에코 시나리오:
- 16개 이상의 뷰포트가 격자(4x4, 5x4 등)로 배치
- 화면 크기에 따라 일부 뷰포트는 스크롤 영역 밖에 위치
- 모든 뷰포트를 동시에 렌더링하면 성능 저하
```

#### 전략 1: IntersectionObserver 기반 가시성 감지

```typescript
// 뷰포트 가시성 상태
type VisibilityState = 'visible' | 'partial' | 'hidden'

// IntersectionObserver 설정
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      viewport.resume()  // 렌더링 재개
    } else {
      viewport.pause()   // 렌더링 일시 중지
    }
  })
}, { threshold: [0, 0.1, 0.5, 1.0] })
```

#### 전략 2: 가시성 기반 렌더링 우선순위

| 가시성 상태 | 렌더링 | 품질 | 프리페칭 | 메모리 |
|------------|--------|------|----------|--------|
| **보임 (100%)** | 활성 | 고품질 | 적극적 | 유지 |
| **일부 보임 (10-99%)** | 활성 | 중품질 | 보통 | 유지 |
| **안 보임 (0%)** | **일시 중지** | - | 최소 | 일정 시간 후 해제 |

#### 전략 3: 화면 밖 뷰포트 처리

```
화면 밖 뷰포트 처리 흐름:
1. IntersectionObserver가 가시성 0% 감지
2. Cine 애니메이션 일시 중지 (rAF 콜백 스킵)
3. 30초 후에도 안 보이면 → GPU 텍스처 언로드
4. 다시 보이면 → 마지막 프레임부터 재개 + 텍스처 재로드
```

#### 전략 4: 스크롤 성능 최적화

| 기법 | 설명 |
|------|------|
| **Passive 스크롤 리스너** | `{ passive: true }` 옵션으로 스크롤 성능 향상 |
| **Debounce/Throttle** | 빈번한 가시성 체크 방지 |
| **will-change: transform** | CSS GPU 가속 힌트 |
| **contain: strict** | 레이아웃 격리로 리플로우 최소화 |

#### 전략 5: 가상화 (32개+ 뷰포트 시 옵션)

| 방식 | 설명 | 사용 시점 |
|------|------|----------|
| **Windowing** | 보이는 영역만 DOM 생성 | 32개+ 뷰포트 |
| **react-virtualized** | 대규모 리스트/그리드 | 필요 시 |
| **자체 구현** | Single Canvas + 가상 뷰포트 | Phase 2 |

#### Phase별 스크롤 최적화 범위

| Phase | 범위 |
|-------|------|
| **Phase 1** | 단일 뷰포트 (스크롤 최적화 불필요) |
| **Phase 2** | IntersectionObserver, 렌더링 우선순위, 텍스처 언로드 |
| **Phase 2+** | 가상화 (32개+ 뷰포트 시 옵션) |

---

### 네트워크 최적화 전략

#### 문제: DICOM 파일 용량
```
심초음파 1개 Study 예시:
- 프레임 수: 100 프레임/시리즈
- 시리즈 수: 10~20개 (스트레스 에코 시 더 많음)
- 프레임 크기: 800x600 JPEG ≈ 50KB
- 총 용량: 100 × 16 × 50KB = 80MB (단일 스터디)
```

#### 전략 1: 점진적 품질 향상 (PQE)

| 단계 | 해상도 | 용량 | 로드 시점 |
|------|--------|------|----------|
| Thumbnail | 64px | ~2KB | 즉시 |
| Preview | 256px | ~10KB | 0.5초 내 |
| Standard | 512px | ~25KB | 백그라운드 |
| Original | 원본 | ~50KB | 필요 시 |

```
사용자 체감: 0.5초 내 미리보기 → 점진적으로 선명해짐
네트워크 효과: 초기 로드 80MB → 3MB (96% 감소)
```

#### 전략 2: 스트리밍 방식 선택

| 방식 | 압축률 | 장점 | 단점 |
|------|--------|------|------|
| **MJPEG** | 1x (기준) | 구현 간단, 프레임별 접근 | 용량 큼 |
| **H.264** | 10~30x | 압축 효율 높음 | 서버 변환 필요, GOP 제약 |
| **Hybrid** | 가변 | 빠른 미리보기 + 고품질 | 복잡도 증가 |

#### 전략 3: 지능형 로딩

| 기법 | 설명 | Phase |
|------|------|-------|
| **프리페칭** | 재생 방향 예측, 다음 프레임 미리 로드 | 2 |
| **가시성 기반** | 화면에 보이는 뷰포트만 고품질 로드 | 2 |
| **대역폭 감지** | Network Information API로 품질 자동 조절 | 2 |
| **Range Requests** | 멀티프레임 DICOM에서 특정 프레임만 요청 | 1 |

#### 전략 4: 캐싱

| 레벨 | 기술 | 용도 |
|------|------|------|
| **메모리** | LRU Cache | 현재 세션 내 재사용 |
| **브라우저** | Cache API | 새로고침 시 재사용 |
| **오프라인** | IndexedDB + Service Worker | 오프라인 접근 |
| **서버/CDN** | Edge Cache | 다중 사용자 공유 |

#### 전략 5: 서버 측 최적화 (권장사항)

| 기능 | 설명 |
|------|------|
| **WADO-RS Rendered** | 서버에서 JPEG 변환 후 전송 |
| **동적 리사이징** | 요청 해상도에 맞게 축소 |
| **H.264 트랜스코딩** | 실시간 또는 사전 변환 |
| **CDN 배포** | 정적 자산 엣지 캐싱 |

#### 네트워크 성능 목표

| 시나리오 | 목표 | 전략 |
|----------|------|------|
| 고속 (100Mbps+) | 2초 내 전체 로드 | Original 직접 로드 |
| 중속 (10-100Mbps) | 0.5초 미리보기, 10초 전체 | PQE + 프리페칭 |
| 저속 (<10Mbps) | 1초 미리보기, 적응형 품질 | Thumbnail + 대역폭 감지 |

### 에러 처리 전략

#### 에러 유형별 처리

| 영역 | 에러 유형 | 처리 전략 | 사용자 피드백 |
|------|----------|----------|--------------|
| **네트워크** | 연결 실패 | 재시도 (3회, 지수 백오프) | "연결 중..." 표시 |
| | 타임아웃 | 타임아웃 증가 후 재시도 | "느린 네트워크" 알림 |
| | 부분 실패 | 성공한 프레임만 표시 | 실패 프레임 표시 |
| **DICOM** | 손상된 파일 | 파싱 중단, 에러 리포트 | "파일 손상" 메시지 |
| | 미지원 Transfer Syntax | 지원 코덱 목록 안내 | "미지원 포맷" 메시지 |
| | 필수 태그 누락 | 기본값 사용 또는 스킵 | 경고 표시 |
| **디코딩** | WebCodecs 실패 | 브라우저 API 폴백 | 자동 (무음) |
| | 브라우저 API 실패 | WASM 폴백 (Phase 5) | 자동 (무음) |
| | 모든 디코더 실패 | 에러 프레임 표시 | "디코딩 실패" |
| **렌더링** | WebGL 컨텍스트 손실 | 컨텍스트 복구, 텍스처 재업로드 | "복구 중..." |
| | GPU 메모리 부족 | LRU 캐시 정리, 품질 낮춤 | "메모리 부족" 경고 |
| | 셰이더 컴파일 실패 | 기본 셰이더 폴백 | 자동 (무음) |

#### 폴백 체인 (Graceful Degradation)

```
디코딩 폴백 체인:
WebCodecs ImageDecoder (HW 가속)
    ↓ 실패 시
브라우저 JPEG API (createImageBitmap)
    ↓ 실패 시
WASM 디코더 (Phase 5)
    ↓ 실패 시
에러 프레임 표시 (빨간 X)

렌더링 폴백 체인:
WebGL2
    ↓ 미지원 시
WebGL1 (기능 제한)
    ↓ 미지원 시
Canvas 2D (Phase 5, 성능 저하)
```

#### 재시도 전략

```typescript
// 지수 백오프 재시도
const retryConfig = {
  maxRetries: 3,
  baseDelay: 1000,      // 1초
  maxDelay: 10000,      // 10초
  backoffFactor: 2,     // 1초 → 2초 → 4초
}
```

| 시도 | 대기 시간 | 누적 시간 |
|------|----------|----------|
| 1차 | 0초 | 0초 |
| 2차 (재시도) | 1초 | 1초 |
| 3차 (재시도) | 2초 | 3초 |
| 4차 (재시도) | 4초 | 7초 |
| 실패 확정 | - | 7초 |

#### WebGL 컨텍스트 손실 처리

```
원인: GPU 드라이버 리셋, 메모리 부족, 백그라운드 탭
빈도: 드물지만 발생 가능

처리 흐름:
1. webglcontextlost 이벤트 감지
2. 렌더링 일시 중지
3. "복구 중..." UI 표시
4. webglcontextrestored 이벤트 대기
5. WebGL 리소스 재초기화 (셰이더, 텍스처)
6. 캐시된 프레임 재업로드
7. 렌더링 재개
```

#### 에러 UI 컴포넌트

| 상태 | UI 표시 | 사용자 액션 |
|------|--------|------------|
| 로딩 중 | 스피너 + 진행률 | - |
| 느린 로딩 | 스피너 + "느린 네트워크" | 취소 가능 |
| 부분 실패 | 성공 프레임 + 에러 아이콘 | 재시도 버튼 |
| 완전 실패 | 에러 메시지 + 상세 정보 | 재시도 / 닫기 |
| 컨텍스트 손실 | "복구 중..." 오버레이 | 자동 복구 |

#### 에러 로깅 및 모니터링

| 레벨 | 용도 | 예시 |
|------|------|------|
| **DEBUG** | 개발 시 상세 정보 | 디코딩 시간, 캐시 히트율 |
| **INFO** | 정상 동작 기록 | 파일 로드 완료 |
| **WARN** | 복구 가능한 문제 | 폴백 사용, 재시도 |
| **ERROR** | 복구 불가능한 문제 | 파싱 실패, 렌더링 실패 |

```typescript
// 에러 리포트 구조
interface ErrorReport {
  code: string           // 'DECODE_FAILED'
  message: string        // 사용자 친화적 메시지
  details: {
    file?: string        // DICOM 파일명
    frame?: number       // 실패한 프레임
    transferSyntax?: string
    browser?: string
    fallbackUsed?: string
  }
  timestamp: number
  recoverable: boolean
}
```

#### Phase별 에러 처리 범위

| Phase | 에러 처리 범위 |
|-------|---------------|
| **Phase 1** | 기본 에러 UI, 네트워크 재시도, 디코딩 폴백 |
| **Phase 2** | WebGL 컨텍스트 복구, 메모리 관리, 상세 로깅 |
| **Phase 5** | WASM 폴백, Canvas 2D 폴백, 에러 리포팅 서비스 연동 |

### 테스트 및 배포 전략

#### 배포 방식
```
EchoPixel (npm 패키지) → sado 프로젝트에 적용 → 기능/성능 테스트
```

#### 패키지 이름

```
@echopixel/core      # 핵심 엔진 (DICOM, 렌더링, 디코딩)
@echopixel/react     # React 컴포넌트
@echopixel/annotations  # 측정 도구 (Phase 3)
```

#### npm 배포 전략

| 버전 | 단계 | 내용 |
|------|------|------|
| `0.1.0-alpha.1` | Phase 1b | 로컬 DICOM → 화면 표시 |
| `0.1.0-alpha.2` | Phase 1c | 단일 뷰포트 cine + W/L |
| `0.1.0-alpha.3` | Phase 1d | WADO-RS 원격 로드 |
| `0.1.0-beta.1` | Phase 1e | 에러 처리 + 반응형 |
| `0.2.x` | Phase 2 | 멀티 뷰포트, PQE, 동기화 |
| `0.3.x` | Phase 3 | Annotations |
| `0.4.x` | Phase 4 | Plugin System |
| `1.0.0` | Phase 5 | 프로덕션 릴리즈 |

```bash
# 개발 중 테스트 배포
npm publish --tag alpha    # 0.1.0-alpha.1
npm publish --tag beta     # 0.1.0-beta.1

# sado 프로젝트에서 설치
npm install @echopixel/core@alpha
npm install @echopixel/react@alpha
```

#### sado 프로젝트 연동 테스트

| 테스트 항목 | 검증 내용 | 목표 |
|------------|----------|------|
| **기능 테스트** | DICOM 로드, cine 재생, W/L 조정 | 정상 동작 |
| **성능 테스트** | FPS, 메모리, 로딩 시간 | 목표치 달성 |
| **호환성 테스트** | 다양한 DICOM 샘플 | 에러 없음 |
| **통합 테스트** | sado UI와 연동 | 기존 기능 유지 |

#### 성능 측정 항목

| 메트릭 | 측정 방법 | 목표 |
|--------|----------|------|
| FPS | `requestAnimationFrame` 콜백 간격 | ≥ 30fps |
| 프레임 드롭 | 실제 vs 예상 프레임 수 비교 | < 1% |
| 메모리 | `performance.memory` (Chrome) | < 1.5GB |
| 초기 로딩 | 첫 프레임 표시까지 시간 | < 0.5초 |
| 디코딩 속도 | 프레임당 디코딩 시간 | < 10ms |

#### 테스트 환경

| 환경 | 용도 |
|------|------|
| **로컬 데모** | 개발 중 빠른 테스트 (apps/demo) |
| **Storybook** | 컴포넌트 단위 테스트 |
| **sado (개발)** | 실제 환경 통합 테스트 |
| **sado (스테이징)** | 실제 DICOM 데이터로 성능 테스트 |

#### CI/CD 파이프라인

```
Push → Lint/Type Check → Unit Test → Build → npm publish (alpha)
                                         ↓
                              sado 프로젝트에서 자동 업데이트 (optional)
```

---

## 2. 기술 스택

### 핵심 기술

| 영역 | 선택 | 이유 |
|------|------|------|
| 렌더링 API | WebGL2 | 98% 브라우저 지원, 충분한 성능 |
| 텍스처 전략 | 2D Array Texture | 프레임 전환 시 바인딩 불필요 |
| 캔버스 전략 | Single Canvas | WebGL 컨텍스트 제한 우회 |
| 이미지 디코딩 | **WebCodecs ImageDecoder** | 하드웨어 가속, 제로카피 |
| 텍스처 업로드 | **VideoFrame 직접 업로드** | GPU→GPU 전송, 복사 없음 |
| 추가 코덱 | **WASM** (Phase 5) | JPEG-LS, JPEG2000 지원용 |
| UI 프레임워크 | React 18+ | Concurrent features |
| 상태 관리 | Zustand | 경량, React 친화적 |
| 빌드 도구 | Vite | 빠른 HMR, 라이브러리 모드 |
| 패키지 관리 | pnpm workspace | 모노레포 효율성 |

**디코딩 전략 요약**:
```
Phase 1~2: WebCodecs (JPEG Baseline, H.264) - WASM 불필요
Phase 5:   WASM 추가 (JPEG-LS, JPEG2000) - 멀티 벤더 호환성
```

### Transfer Syntax 지원 범위

대중적인 Transfer Syntax는 모두 지원합니다.

| Transfer Syntax | UID | Phase | 구현 방법 |
|-----------------|-----|-------|----------|
| Implicit VR Little Endian | 1.2.840.10008.1.2 | 1 | 직접 처리 |
| Explicit VR Little Endian | 1.2.840.10008.1.2.1 | 1 | 직접 처리 |
| **JPEG Baseline (8-bit)** | 1.2.840.10008.1.2.4.50 | 1 | WebCodecs |
| JPEG Extended (12-bit) | 1.2.840.10008.1.2.4.51 | 1 | WebCodecs |
| **JPEG Lossless** | 1.2.840.10008.1.2.4.70 | 5 | WASM |
| **JPEG-LS Lossless** | 1.2.840.10008.1.2.4.80 | 5 | CharLS WASM |
| JPEG-LS Near-Lossless | 1.2.840.10008.1.2.4.81 | 5 | CharLS WASM |
| **JPEG 2000 Lossless** | 1.2.840.10008.1.2.4.90 | 5 | OpenJPEG WASM |
| JPEG 2000 Lossy | 1.2.840.10008.1.2.4.91 | 5 | OpenJPEG WASM |
| **RLE Lossless** | 1.2.840.10008.1.2.5 | 5 | 직접 구현 |
| MPEG-4 (H.264) | 1.2.840.10008.1.2.4.102 | 2 | WebCodecs VideoDecoder |

**Phase별 요약**:
```
Phase 1: Uncompressed + JPEG Baseline/Extended
Phase 2: + MPEG-4 (H.264)
Phase 5: + JPEG Lossless, JPEG-LS, JPEG 2000, RLE
```

### WebCodecs 전략 (핵심 차별화)

```
기존 방식 (2번 복사):
  JPEG 데이터 → [WASM 디코딩] → CPU 메모리 → [texImage2D] → GPU 메모리

EchoPixel 방식 (0번 복사):
  JPEG 데이터 → [WebCodecs HW 디코딩] → VideoFrame → [texImage2D] → GPU 메모리
                     ↑                        ↑
                  GPU 가속              GPU→GPU 직접 전송
```

**브라우저 지원**:
- Chrome/Edge: 완전 지원
- Firefox 118+: 지원
- Safari: 제한적 → **JPEG Baseline 폴백 필요**

### VideoFrame 메모리 관리 (🔴 필수)

```typescript
// VideoFrame 사용 후 반드시 close() 호출
const videoFrame = await imageDecoder.decode({ frameIndex })

// 텍스처 업로드
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoFrame)

// 🔴 필수! 메모리 누수 방지
videoFrame.close()
```

**주의사항**:
- VideoFrame은 GPU 메모리를 점유
- `close()` 호출하지 않으면 메모리 누수 발생
- 에러 발생 시에도 반드시 `try-finally`로 해제

```typescript
// 권장 패턴
try {
  const videoFrame = await imageDecoder.decode({ frameIndex })
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoFrame)
} finally {
  videoFrame?.close()  // 항상 해제
}
```

### VideoFrame 제로카피 폴백 체인

일부 GPU/드라이버에서 VideoFrame 직접 업로드가 실패할 수 있음

```
폴백 체인:
1. gl.texImage2D(target, ..., videoFrame)  // 제로카피 시도
      ↓ 실패 시
2. createImageBitmap(videoFrame) → texImage2D  // 1번 복사
      ↓ 실패 시
3. VideoFrame → Canvas2D → texImage2D  // 2번 복사 (최후 수단)
```

**구현 전략**:
```typescript
async function uploadVideoFrameToTexture(gl: WebGL2RenderingContext, videoFrame: VideoFrame) {
  // 1차: 제로카피 시도
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoFrame)
    const error = gl.getError()
    if (error === gl.NO_ERROR) return true
  } catch (e) { /* 폴백으로 */ }

  // 2차: ImageBitmap 경유
  try {
    const bitmap = await createImageBitmap(videoFrame)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    bitmap.close()
    return true
  } catch (e) { /* 폴백으로 */ }

  // 3차: Canvas2D 경유 (최후 수단)
  const canvas = new OffscreenCanvas(videoFrame.displayWidth, videoFrame.displayHeight)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(videoFrame, 0, 0)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
  return true
}
```

---

## 3. 아키텍처 개요

```
+------------------------------------------------------------------+
|                        EchoPixel Library                          |
+------------------------------------------------------------------+
|  React Layer          Core Engine           Plugin System         |
|  +--------------+     +---------------+     +------------------+  |
|  | <EchoProvider>|<-->| ViewportMgr   |<-->| MeasurementPlugin|  |
|  | <Viewport>   |     | FrameSyncEngine|    | AIOverlayPlugin  |  |
|  | <Toolbar>    |     | RenderScheduler|    | StrainPlugin     |  |
|  +--------------+     +---------------+     +------------------+  |
|         |                    |                                    |
|         v                    v                                    |
|  +---------------+    +----------------+    +------------------+  |
|  | Annotation    |    | WebGL Renderer |    | DataSource Layer |  |
|  | Engine (SVG)  |    +----------------+    +------------------+  |
|  +---------------+    | TextureManager |    | LocalFile        |  |
|                       | ShaderPrograms |    | WADO-RS/URI      |  |
|                       | LUT Pipeline   |    | MJPEG Cine       |  |
|                       +----------------+    | Hybrid           |  |
|                              |              +------------------+  |
|                              v                                    |
|                    +-------------------------------------+        |
|                    | WebCodecs Layer                     |        |
|                    | - ImageDecoder (HW accelerated)     |        |
|                    | - VideoFrame → texImage2D (0-copy)  |        |
|                    | - Safari fallback                   |        |
|                    +-------------------------------------+        |
|                              |                                    |
|                              v                                    |
|                    +-------------------------------------+        |
|                    | GPU Memory                          |        |
|                    | - 2D Array Textures (frame seq)     |        |
|                    | - Single WebGL Context (16+ VP)     |        |
|                    +-------------------------------------+        |
+------------------------------------------------------------------+
```

### 패키지 구조

```
echopixel/
├── packages/
│   ├── core/                 # 핵심 렌더링 엔진
│   │   ├── dicom/            # DICOM 파싱
│   │   ├── decoder/          # 픽셀 디코딩 (WebCodecs)
│   │   ├── renderer/         # WebGL 렌더링
│   │   ├── viewport/         # 뷰포트 관리
│   │   ├── cache/            # 메모리 관리
│   │   └── sync/             # 프레임 동기화
│   │
│   ├── react/                # React 컴포넌트
│   │   ├── components/       # Viewport, Toolbar, Provider
│   │   └── hooks/            # useViewport, useCine
│   │
│   ├── annotations/          # 측정 도구 (Phase 3)
│   └── codecs/               # WASM 디코더 (Phase 5)
│
├── apps/
│   ├── demo/                 # 데모 앱
│   └── docs/                 # Storybook
│
└── pnpm-workspace.yaml
```

---

## 4. 구현 로드맵

### Phase 1: Foundation (세분화)

#### Phase 1a: 프로젝트 설정 + 기본 렌더링

**목표**: 모노레포 설정 및 정적 이미지 렌더링

| 작업 | 설명 |
|------|------|
| 모노레포 초기화 | pnpm workspace, Vite, TypeScript |
| ESLint + Prettier | 코드 품질 |
| WebGL2 컨텍스트 | 기본 초기화 |
| 정적 텍스처 렌더링 | 테스트 이미지 표시 |

**마일스톤**: WebGL2로 테스트 이미지 렌더링

---

#### Phase 1b: DICOM 파싱 + 디코딩

**목표**: DICOM 파일 로드 및 픽셀 디코딩

| 작업 | 설명 |
|------|------|
| DICOM 파서 | Lazy 파싱, 메타데이터 추출 |
| WebCodecs ImageDecoder | 하드웨어 가속 JPEG 디코딩 |
| VideoFrame 텍스처 업로드 | 제로카피 GPU 전송 |
| Local File DataSource | 파일 로드 |

**마일스톤**: 로컬 DICOM 파일 → 화면 표시

---

#### Phase 1c: Cine 재생 + React 컴포넌트

**목표**: 애니메이션 재생 및 기본 UI

| 작업 | 설명 |
|------|------|
| Cine 재생 | rAF 기반 타이머, 가변 FPS |
| React Viewport | 기본 컴포넌트 |
| Window/Level | 마우스 드래그 조정 |
| Play/Pause | 기본 제어 |

**마일스톤**: 단일 뷰포트 cine 재생 + W/L 조정

---

#### Phase 1d: DataSource + 네트워크 기초

**목표**: 원격 데이터 로드

| 작업 | 설명 |
|------|------|
| WADO-RS DataSource | DICOMweb 표준 |
| Range Requests | 멀티프레임 부분 요청 |
| LRU 메모리 캐시 | 프레임 재사용 |
| 네트워크 재시도 | 지수 백오프 (3회) |

**마일스톤**: WADO-RS로 원격 DICOM 로드

---

#### Phase 1e: 에러 처리 + 반응형 기초

**목표**: 안정성 및 기본 반응형

| 작업 | 설명 |
|------|------|
| 기본 에러 UI | 로딩/에러 상태 표시 |
| 디코딩 폴백 | WebCodecs → createImageBitmap |
| ResizeObserver | 뷰포트 크기 감지 |
| DPI 감지 | devicePixelRatio 대응 |

**마일스톤**: 에러 처리 + 반응형 기초 동작

---

#### Phase 1 전체 완료 기준
- [ ] 로컬/원격 DICOM 로드
- [ ] 단일 뷰포트 cine 재생
- [ ] Window/Level 조정
- [ ] Play/Pause 동작
- [ ] 기본 에러 처리
- [ ] 반응형 기초

#### Safari 폴백 (우선순위 낮음 → Phase 1e 또는 Phase 2)
- createImageBitmap 기반 폴백 (WebCodecs 미지원 시)

---

### Phase 2: Multi-Viewport & Quality

**목표**: 16개 뷰포트 동시 30fps + 점진적 품질 향상

| 작업 | 설명 |
|------|------|
| Single Canvas | Scissor/Viewport 영역 분할 |
| 2D Array Texture | 프레임 시퀀스 GPU 저장 |
| FrameSyncEngine | 프레임 동기화 (Frame Ratio, R-wave, Time) |
| PQE | Thumbnail → Preview → Standard → Original |
| **OffscreenCanvas** | Worker 기반 렌더링 (메인 스레드 분리) |
| **H.264 스트림** | WebCodecs VideoDecoder (옵션) |
| **LOD 알고리즘** | 뷰포트 크기별 해상도 조절 |
| **반응형 레이아웃** | 브레이크포인트별 그리드, 터치 제스처 |
| **프리페칭** | 재생 방향 예측, 미리 로드 |
| **대역폭 감지** | Network Information API, 적응형 품질 |
| **Service Worker 캐싱** | 오프라인/재방문 지원 |
| **WebGL 컨텍스트 복구** | 손실 감지 및 자동 복구 |
| **메모리 관리** | GPU 메모리 부족 시 LRU 정리 |
| **에러 로깅** | 상세 로깅 및 모니터링 |
| **스크롤 최적화** | IntersectionObserver, 화면 밖 렌더링 중지 |
| **텍스처 언로드** | 오래 안 보이는 뷰포트 메모리 해제 |

**마일스톤**:
- [ ] 16개 뷰포트 @ 30fps
- [ ] GPU 메모리 1.5GB 미만
- [ ] 프레임 드롭 < 1%
- [ ] 반응형 레이아웃 (데스크탑/태블릿/모바일)
- [ ] 터치 제스처 동작
- [ ] 0.5초 내 미리보기 표시 (PQE)
- [ ] 저속 네트워크(10Mbps)에서 적응형 품질 동작

---

### Phase 3: Annotations

**목표**: EchoPAC 수준 측정 도구

- SVG 오버레이 엔진
- 거리/영역/Doppler/각도 측정
- 캘리브레이션 시스템
- DICOM SR 저장 (STOW-RS)

---

### Phase 4: Plugin System

**목표**: 확장 가능한 플러그인 아키텍처

- Plugin API, 라이프사이클 훅
- MeasurementPlugin, AIOverlayPlugin, StrainPlugin

---

### Phase 5: Release

**목표**: npm v1.0.0 배포

- 멀티 벤더 테스트 (GE, Philips, Siemens, Canon)
- 추가 코덱 (JPEG-LS, JPEG2000)
- **WebGPU 렌더링 경로** (옵션, 미래 대비)
- 문서화 (Storybook, TypeDoc)

---

## 5. 핵심 결정 사항

| 결정 | 이유 |
|------|------|
| Cornerstone3D 호환성 불필요 | 독립적 개발로 성능 최적화 가능 |
| WebGL2 사용 (WebGPU 아님) | 98% 브라우저 지원, 충분한 성능 |
| vtk.js 미사용 | 오버헤드 제거, 직접 WebGL 제어 |
| **WebCodecs ImageDecoder** | 하드웨어 가속, WASM 대비 빠름 |
| **VideoFrame 제로카피** | GPU→GPU 직접 전송, 복사 오버헤드 제거 |
| **Safari 폴백 (우선순위 낮음)** | Chrome/Edge 우선, Safari는 Phase 1e 또는 2 |
| **OffscreenCanvas (Phase 2)** | 메인 스레드 분리, UI 응답성 |
| **WebGPU (Phase 5 옵션)** | 미래 대비 추상화 레이어 |
| **`@echopixel/*` 스코프 패키지** | 모노레포 표준, 네임스페이스 관리 |
| **Phase 1 세분화 (1a~1e)** | 작은 단위로 진행/검증 용이, 중간 sado 테스트 |

---

## 6. 학습 포인트 (사용자 직접 구현)

### Phase 1 핵심 학습 영역

1. **WebCodecs API**
   - ImageDecoder 사용법
   - VideoFrame 생명주기 관리
   - 브라우저 지원 감지

2. **WebGL2 기초**
   - 컨텍스트 초기화
   - 텍스처 업로드 (texImage2D with VideoFrame)
   - Shader 프로그램 (VOI LUT)
   - 렌더 루프

3. **DICOM 파싱**
   - Part 10 구조 이해
   - Lazy 파싱 전략
   - 멀티프레임 픽셀 데이터

4. **애니메이션**
   - requestAnimationFrame
   - 가변 프레임 레이트 처리

---

## 7. 참고 자료

### 공식 문서
- [WebCodecs API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [ImageDecoder - MDN](https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder)
- [OffscreenCanvas - web.dev](https://web.dev/articles/offscreen-canvas)

### 성능 연구
- [DECODE-3DViz (2025)](https://link.springer.com/article/10.1007/s10278-025-01430-9) - 98% 렌더링 시간 감소, 144 FPS 달성

### 기술 비교
- [WebGL vs WebGPU - Toji.dev](https://toji.dev/webgpu-best-practices/webgl-performance-comparison.html)

---

## 8. 예상 성능 비교 (Cornerstone3D vs EchoPixel)

### 종합 비교

| 메트릭 | Cornerstone3D (현재) | EchoPixel (예상) | 향상 |
|--------|---------------------|------------------|------|
| 동시 뷰포트 | ~8개 | **16개+** | **2배+** |
| FPS (16개 기준) | 불가능 | **30fps+** | - |
| 초기 로딩 | 2-5초 | **0.5초** | **4~10배** |
| GPU 메모리 | 2-3GB | **1.5GB** | **30-50%↓** |
| CPU 사용률 | 높음 | **낮음** | GPU 오프로드 |
| 프레임당 디코딩 | 20-50ms | **5-10ms** | **2~5배** |

### 상세 비교

| 영역 | Cornerstone3D | EchoPixel | 개선 포인트 |
|------|---------------|-----------|------------|
| **디코딩** | WASM (CPU) | WebCodecs (GPU HW) | 하드웨어 가속 |
| **텍스처 업로드** | CPU→GPU 2번 복사 | VideoFrame 제로카피 | 복사 오버헤드 제거 |
| **프레임 전환** | 텍스처 바인딩 | 2D Array Texture 인덱스 | 바인딩 제거 |
| **렌더링** | vtk.js (~25% 오버헤드) | 직접 WebGL2 | 오버헤드 제거 |
| **캔버스** | 뷰포트별 별도 | Single Canvas 공유 | 컨텍스트 제한 우회 |
| **품질 전환** | 단순 교체 | PQE (점진적) | 체감 속도 향상 |

### 참고: 유사 연구 결과

**DECODE-3DViz (2025)**:
- 렌더링 시간: **98% 감소**
- FPS: **144 FPS** 달성

### 주의사항

```
⚠️ 위 수치는 추정치입니다.
실제 성능은 하드웨어, 브라우저, DICOM 파일에 따라 다릅니다.
→ Phase 1 완료 후 sado 프로젝트에서 실측 필요
```

**확실한 것**: 뷰포트 제한(8→16+) 해결은 아키텍처 변경으로 **보장됨**

---

## 9. 다음 단계

검토 후 결정 필요:

1. **Phase 1 범위 조정** - 추가/삭제할 기능?
2. **우선순위 변경** - WebCodecs vs 기본 기능?
3. **학습 순서** - 어떤 부분부터 시작?
4. **추가 요구사항** - 놓친 기능?

---

*이 문서는 검토용 요약입니다. 상세 내용은 docs/ 폴더의 개별 문서를 참조하세요.*
