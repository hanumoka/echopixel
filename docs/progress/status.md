# EchoPixel 진행 상황

## 현재 상태

| 항목 | 상태 |
|------|------|
| **현재 Phase** | Phase 2 핵심 구현 완료, 테스트/검증 단계 |
| **마지막 업데이트** | 2026-01-19 |
| **다음 마일스톤** | 16개 뷰포트 30fps 성능 검증 |

---

## 핵심 목표

```
웹 브라우저에서 16개 이상의 DICOM 심초음파 영상을
동시에 30fps 이상으로 재생하는 고성능 뷰어 라이브러리
```

### 성능 목표

| 메트릭 | 목표 | 현황 |
|--------|------|------|
| 동시 뷰포트 | **16개** | ⏳ 검증 필요 |
| 프레임 레이트 | **30fps+** | ⏳ 검증 필요 |
| GPU 메모리 | **<1.5GB** | ⏳ 검증 필요 |
| 동기화 지연 | **<16ms** | ⏳ 검증 필요 |
| 프레임 드롭 | **<1%** | ⏳ 검증 필요 |

---

## Phase별 진행률

### Phase 0: 계획 수립 ✅ 완료

### Phase 1: Foundation ✅ 완료

| 단계 | 내용 | 상태 |
|------|------|------|
| 1a | 프로젝트 설정 + WebGL2 기본 렌더링 | ✅ |
| 1b | DICOM 파싱 + 디코딩 (단일/멀티프레임) | ✅ |
| 1c | React 컴포넌트 + Window/Level | ✅ |
| 1d | DataSource + 네트워크 기초 | ✅ |
| 1e | 에러 처리 + 반응형 기초 | ✅ |

### Phase 2: Multi-Viewport & Quality 🔄 진행중

| 단계 | 내용 | 상태 |
|------|------|------|
| 2a | 2D Array Texture | ✅ |
| 2b | Single Canvas + ViewportManager | ✅ |
| 2c | RenderScheduler + FrameSyncEngine | ✅ |
| 2d | React 통합 (MultiViewport) | ✅ |
| - | 실제 DICOM 테스트 | ⏳ |
| - | 16개 뷰포트 성능 검증 | ⏳ |
| - | PQE (Progressive Quality Enhancement) | ⏳ |

### Phase 3~5: 대기

- Phase 3: Annotations (SVG 오버레이, 측정 도구)
- Phase 4: Plugin System
- Phase 5: npm v1.0.0 배포

---

## 구현 완료된 모듈

### packages/core/src/

| 모듈 | 파일 | 설명 |
|------|------|------|
| **dicom/** | DicomParser.ts | DICOM 파싱, 태그 추출 |
| | ImageDecoder.ts | WebCodecs/createImageBitmap 디코딩 |
| | NativeDecoder.ts | 비압축 픽셀 디코딩, W/L 처리 |
| **webgl/** | TextureManager.ts | 2D/2D Array 텍스처 관리 |
| | QuadRenderer.ts | 단일 텍스처 렌더링 |
| | ArrayTextureRenderer | 배열 텍스처 렌더링 |
| | shaders.ts | GLSL 셰이더 |
| **viewport/** | ViewportManager.ts | 그리드 레이아웃, 뷰포트 관리 |
| **sync/** | FrameSyncEngine.ts | 프레임 동기화 |
| | RenderScheduler.ts | 단일 rAF 루프 |
| **datasource/** | LocalFileDataSource.ts | 로컬 파일 |
| | WadoRsDataSource.ts | WADO-RS 서버 |
| **cache/** | LRUCache.ts | LRU 캐시 |
| **network/** | retry.ts, errors.ts | 재시도, 에러 처리 |

### apps/demo/src/

| 파일 | 설명 |
|------|------|
| App.tsx | 메인 데모 앱 |
| DicomViewport.tsx | 단일 뷰포트 컴포넌트 |
| MultiViewport.tsx | Phase 2 멀티뷰포트 |
| MultiCanvasGrid.tsx | 멀티 캔버스 (비교용) |

---

## 알려진 이슈

| 이슈 | 상태 | 비고 |
|------|------|------|
| WebGL 컨텍스트 제한 (8-16개) | 🟢 해결 | Single Canvas 방식으로 우회 |
| VSCode DOM 타입 인식 오류 | 🟡 미해결 | 빌드 정상, IntelliSense만 문제 |
| vite-plugin-dts 미설정 | 🟡 보류 | .d.ts 생성 안됨 |

---

## 다음 단계

1. **성능 검증**: 16개 뷰포트 30fps 테스트
2. **PQE 구현**: 점진적 품질 향상
3. **npm 배포 준비**: vite-plugin-dts, README, CHANGELOG

---

> 상세 세션 기록: [session-log.md](./session-log.md)
> 아키텍처: [overview.md](../architecture/overview.md)
