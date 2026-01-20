# EchoPixel 진행 상황

## 현재 상태

| 항목 | 상태 |
|------|------|
| **현재 Phase** | Phase 2.6 (@echopixel/react 멀티 뷰어) ✅ 완료 |
| **마지막 업데이트** | 2026-01-20 |
| **다음 마일스톤** | Phase 3 (Annotations) |

---

## 핵심 목표

```
웹 브라우저에서 16개 이상의 DICOM 심초음파 영상을
동시에 30fps 이상으로 재생하는 고성능 뷰어 라이브러리
```

### 성능 목표

| 메트릭 | 목표 | 현황 | 비고 |
|--------|------|------|------|
| 동시 뷰포트 | **16개** | ✅ 달성 | 16개 동시 표시 성공 |
| 프레임 레이트 | **30fps+** | ✅ **60fps** | 목표 2배 초과 달성 |
| Frame Time | **<33ms** | ✅ **0.1~3ms** | 목표 10배+ 초과 달성 |
| GPU 메모리 | **<1.5GB** | ⏳ 검증 필요 | 측정 도구 필요 |
| 동기화 지연 | **<16ms** | ⏳ 검증 필요 | 측정 도구 필요 |
| 프레임 드롭 | **<1%** | ✅ 양호 | 드롭 관찰 안됨 |

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

### Phase 2: Multi-Viewport & Quality ✅ 핵심 완료

| 단계 | 내용 | 상태 |
|------|------|------|
| 2a | 2D Array Texture | ✅ |
| 2b | Single Canvas + ViewportManager | ✅ |
| 2c | RenderScheduler + FrameSyncEngine | ✅ |
| 2d | React 통합 (MultiViewport) | ✅ |
| 2e | Hybrid DOM-WebGL 아키텍처 | ✅ |
| 2f | Tool System | ✅ |
| - | 실제 DICOM 테스트 | ✅ |
| - | 16개 뷰포트 성능 검증 | ✅ 60fps 달성 |
| - | PQE (Progressive Quality Enhancement) | ⏳ 선택적 |

### Phase 2.5: Robustness ✅ 완료

| 항목 | 상태 | 비고 |
|------|------|------|
| WebGL 컨텍스트 손실 복구 | ✅ | DicomViewport, HybridMultiViewport |
| LRU Texture Cache (VRAM 관리) | ✅ | 구현 완료 (eviction은 향후 개선) |
| 대형 레이아웃 (5x5~8x8) | ✅ | VRAM 스트레스 테스트용 |

### Phase 2.6: @echopixel/react 멀티 뷰어 ✅ 완료

| 항목 | 상태 | 비고 |
|------|------|------|
| DicomMiniOverlay (빌딩 블록) | ✅ | 간소화 오버레이 |
| HybridViewportGrid (빌딩 블록) | ✅ | Canvas + DOM Grid 레이어링 |
| HybridViewportSlot (빌딩 블록) | ✅ | DOM 슬롯 (이벤트 처리) |
| SingleDicomViewerGroup | ✅ | 다중 SingleDicomViewer 그리드 |
| HybridMultiViewport | ✅ | 데모→라이브러리 이동 (UI 제거) |
| 데모 앱 리팩토링 | ✅ | SingleDicomViewer 필수 사용 |
| 데모 Multi 모드 리팩토링 | ✅ | @echopixel/react HybridMultiViewport 사용 |
| Single Viewport 사이즈 조정 | ✅ | 반응형 레이아웃 + 크기 조정 UI |

### Phase 3~5: 대기

- **Phase 3**: Annotations (좌표 변환, SVG 오버레이, 측정 도구)
- **Phase 4**: Plugin System & 16-bit 확장
- **Phase 5**: npm v1.0.0 배포

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
| | ArrayTextureRenderer.ts | 배열 텍스처 렌더링 |
| | shaders.ts | GLSL 셰이더 |
| **viewport/** | ViewportManager.ts | 그리드 레이아웃, 뷰포트 관리 |
| | HybridViewportManager.ts | DOM-WebGL 좌표 동기화 |
| **sync/** | FrameSyncEngine.ts | 프레임 동기화 |
| | RenderScheduler.ts | 단일 rAF 루프 |
| **tools/** | BaseTool.ts | 도구 추상 클래스 |
| | ToolRegistry.ts | 전역 도구 등록 |
| | ToolGroup.ts | 뷰포트별 도구 그룹 |
| | ToolManager.ts | 도구 그룹 관리 |
| | useToolGroup.ts | React 훅 |
| | manipulation/*.ts | WindowLevel, Pan, Zoom, StackScroll |
| **datasource/** | LocalFileDataSource.ts | 로컬 파일 |
| | WadoRsDataSource.ts | WADO-RS 서버 |
| **cache/** | LRUCache.ts | 일반 LRU 캐시 |
| | TextureLRUCache.ts | VRAM 기반 텍스처 캐시 |
| **network/** | retry.ts, errors.ts | 재시도, 에러 처리 |

### packages/react/src/

| 모듈 | 파일 | 설명 | 상태 |
|------|------|------|------|
| **components/** | SingleDicomViewer.tsx | 단일 DICOM 뷰어 (풀 UI) | ✅ |
| | SingleDicomViewerGroup.tsx | 다중 SingleDicomViewer 그리드 배치 | ✅ |
| | HybridMultiViewport.tsx | 대규모 뷰포트 (Single Canvas + DOM) | ✅ |
| **building-blocks/** | DicomCanvas.tsx | WebGL 렌더링 캔버스 | ✅ |
| | DicomControls.tsx | 재생/정지, FPS, 프레임 슬라이더 | ✅ |
| | DicomStatusBar.tsx | 이미지 정보, W/L, Transform, Rotation 표시 | ✅ |
| | DicomToolInfo.tsx | 마우스/키보드 도구 안내 | ✅ |
| | DicomToolbar.tsx | 도구 선택 툴바 (W/L, Pan, Zoom, 회전) | ✅ |
| | DicomMiniOverlay.tsx | 간소화 오버레이 (멀티 뷰포트용) | ✅ |
| | HybridViewportGrid.tsx | Canvas + DOM Grid 레이어링 | ✅ |
| | HybridViewportSlot.tsx | DOM 슬롯 (이벤트 처리) | ✅ |
| **types.ts** | - | 공통 타입 정의 | ✅ |

### apps/demo/src/

| 파일 | 설명 |
|------|------|
| App.tsx | 메인 데모 앱 |
| DicomViewport.tsx | 단일 뷰포트 컴포넌트 |
| MultiViewport.tsx | Phase 2 멀티뷰포트 |
| MultiCanvasGrid.tsx | 멀티 캔버스 (비교용) |
| HybridViewport/* | Hybrid DOM-WebGL 컴포넌트 |

---

## 알려진 이슈

| 이슈 | 상태 | 비고 |
|------|------|------|
| WebGL 컨텍스트 제한 (8-16개) | 🟢 해결 | Single Canvas 방식으로 우회 |
| VSCode DOM 타입 인식 오류 | 🟡 미해결 | 빌드 정상, IntelliSense만 문제 |
| vite-plugin-dts 미설정 | 🟡 보류 | .d.ts 생성 안됨 |
| 데모 Multi 모드 미사용 코드 | 🟡 정리 필요 | 리팩토링 후 레거시 코드 잔존 |
| HardwareInfoPanel GPU 정보 (Multi) | 🟡 미표시 | glRef가 null (내부 관리) |

---

## 다음 단계

1. ~~**성능 검증**: 16개 뷰포트 30fps 테스트~~ ✅ 완료 (60fps 달성)
2. ~~**Hybrid DOM-WebGL**: 아키텍처 구현~~ ✅ 완료
3. ~~**Tool System**: 기본 도구 구현~~ ✅ 완료
4. ~~**Context Loss 복구**: WebGL 컨텍스트 손실 대응~~ ✅ 완료
5. ~~**LRU Texture Cache**: VRAM 추적 및 관리~~ ✅ 완료
6. ~~**@echopixel/react 패키지**: Building Blocks 컴포넌트~~ ✅ 완료
7. ~~**@echopixel/react 멀티 뷰어 컴포넌트**~~ ✅ 완료
   - [x] `DicomMiniOverlay` (빌딩 블록)
   - [x] `HybridViewportGrid`, `HybridViewportSlot` (빌딩 블록)
   - [x] `SingleDicomViewerGroup` (다중 SingleDicomViewer 그리드)
   - [x] `HybridMultiViewport` (@echopixel/react로 이동)
8. ~~**데모 앱 리팩토링**~~ ✅ 완료 (Single 모드 SingleDicomViewer 필수)
9. ~~**데모 Multi 모드 리팩토링**~~ ✅ 완료 (@echopixel/react HybridMultiViewport 사용)
10. ~~**Single Viewport 사이즈 조정**~~ ✅ 완료 (반응형 레이아웃 + UI)
11. **Phase 3 진입**: ⬅️ 다음 마일스톤
   - [ ] 좌표 변환 시스템 (이미지 좌표 ↔ 캔버스 좌표)
   - [ ] SVG 오버레이 기본 구조
   - [ ] 측정 도구 (Length, Angle)
10. **npm 배포 준비**: vite-plugin-dts, README, CHANGELOG (Phase 5)

---

## 아키텍처 결정 사항

### 메모리 전략 (확정)
- **GPU-only 메모리 전략**: Upload & Release 패턴
- **CPU 메모리 최소화**: 디코딩 후 즉시 GPU 업로드, CPU 데이터 해제

### Context Loss 복구 ✅ 구현 완료
- **DicomViewport**: 현재 프레임 유지 후 자동 복구
- **HybridMultiViewport**: 텍스처 재업로드 및 렌더링 복구
- **구현 방식**: 이벤트 리스너 + ref 기반 상태 복원
- **향후 확장 가능**: 압축 캐시, IndexedDB 활용 (현재 미구현)

### VRAM 관리 ✅ 구현 완료
- **TextureLRUCache**: VRAM 사용량 추적 및 표시
- **현재 상태**: Eviction 비활성화 (모든 뷰포트가 화면에 표시되므로)
- **향후 개선**: "visible viewport" 인식 기능 추가하여 선택적 eviction

### 16-bit 지원 (Phase 4+ 예정)
- **현재**: 8-bit 유지 (심초음파 임상 99%+)
- **미래**: R16UI, R16F 텍스처 포맷 인터페이스 설계

> 상세: [memory-architecture-analysis.md](../architecture/memory-architecture-analysis.md)

---

> 상세 세션 기록: [session-log.md](./session-log.md)
> 아키텍처: [overview.md](../architecture/overview.md)
