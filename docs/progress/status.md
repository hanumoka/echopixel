# EchoPixel 진행 상황

## 현재 상태

| 항목 | 상태 |
|------|------|
| **현재 Phase** | Phase 3 (Annotations) ✅ 핵심 완료 |
| **마지막 업데이트** | 2026-01-20 |
| **다음 마일스톤** | Phase 3g (확장 도구 및 Calibration) 또는 Phase 4 |

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
| GPU 메모리 | **<1.5GB** | ✅ 측정 가능 | Performance Options 패널 추가 |
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
| 플립 기능 (가로/세로) | ✅ | CSS transform scaleX/Y 기반 |
| 데모 중복 Hybrid 모드 제거 | ✅ | 로컬 HybridViewport 폴더 삭제 |

### Phase 2.7: Multi Viewport Rotation/Flip ✅ 완료

| 항목 | 상태 | 비고 |
|------|------|------|
| HybridMultiViewport Rotation | ✅ | 각 뷰포트별 90° 회전 (셰이더 기반) |
| HybridMultiViewport Flip | ✅ | 각 뷰포트별 H/V 플립 (셰이더 기반) |
| ArrayTextureRenderer 셰이더 | ✅ | Vertex Shader에서 Flip uniform 적용 |
| DicomMiniOverlay 도구 UI | ✅ | 회전/플립/리셋 버튼 추가 (선택 시 표시) |

### Phase 2.8: Performance Options ✅ 완료

| 항목 | 상태 | 비고 |
|------|------|------|
| PerformanceOptions 인터페이스 | ✅ | maxVramMB, dprOverride, debugMode |
| HybridMultiViewport props | ✅ | performanceOptions prop 추가 |
| PerformanceOptionsPanel | ✅ | 데모 앱 UI (VRAM/DPR/Debug 설정) |
| VRAM 프리셋 | ✅ | 256MB ~ 4GB, Unlimited |
| DPR 프리셋 | ✅ | 1.0x, 1.5x, 2.0x, Auto |
| VRAM 사용량 표시 | ✅ | 상태 바 + 프로그레스 바 |

### Phase 3: Annotations 🚧 구현 중

#### Phase 3a: 기본 인프라 ✅ 완료

| 항목 | 상태 | 비고 |
|------|------|------|
| 요구사항 분석 | ✅ | Viviane 분석 완료 |
| 아키텍처 설계 | ✅ | 플러그인 기반 유연한 구조 |
| 타입 정의 (types.ts) | ✅ | Annotation, Permission, Limit, Export 타입 |
| 좌표 변환 시스템 | ✅ | CoordinateTransformer (Canvas/DICOM/Physical) |
| AnnotationStore | ✅ | CRUD + 권한/제한 검증 + 내부 메서드 |
| Exporter/Importer | ✅ | JSON v1.0 포맷 |
| HistoryManager | ✅ | Undo/Redo + Batch 지원 |

#### Phase 3b: 측정 도구 ✅ 완료

| 항목 | 상태 | 비고 |
|------|------|------|
| MeasurementTool 기본 클래스 | ✅ | 상태 관리, 이벤트 처리, 좌표 변환 |
| LengthTool | ✅ | 두 점 거리 (B, M mode) |
| AngleTool | ✅ | 세 점 각도 (B mode) |
| PointTool | ✅ | 단일 점 속도 (D mode) |

#### Phase 3c: SVG 오버레이 ✅ 완료

| 항목 | 상태 | 비고 |
|------|------|------|
| 렌더러 타입 정의 (renderers/types.ts) | ✅ | RenderContext, ShapeRenderData, SVGRenderConfig |
| SVGOverlay 컴포넌트 | ✅ | DICOM→Canvas 좌표 변환, 프레임별 필터링 |
| LengthShape 컴포넌트 | ✅ | 두 점 거리 SVG 렌더링 |
| AngleShape 컴포넌트 | ✅ | 세 점 각도 + 호(Arc) SVG 렌더링 |
| PointShape 컴포넌트 | ✅ | 단일 점 십자선 SVG 렌더링 |
| MeasurementLabel 컴포넌트 | ✅ | foreignObject 기반 라벨 |
| DragHandle 컴포넌트 | ✅ | 드래그 가능한 원형 핸들 |
| @echopixel/react exports | ✅ | 어노테이션 컴포넌트 공개 |
| vite-plugin-dts 활성화 | ✅ | core 패키지 .d.ts 생성 |

#### Phase 3d: HybridMultiViewport 통합 ✅ 완료

| 항목 | 상태 | 비고 |
|------|------|------|
| annotations props 추가 | ✅ | annotations, selectedAnnotationId, onAnnotationSelect 등 |
| createTransformContext 헬퍼 | ✅ | Viewport → TransformContext 변환 |
| SVGOverlay 통합 렌더링 | ✅ | HybridViewportSlot 내부 렌더링 |
| 이벤트 핸들러 연결 | ✅ | 선택, 업데이트, 삭제 콜백 |

#### Phase 3e: SingleDicomViewer 통합 ✅ 완료

| 항목 | 상태 | 비고 |
|------|------|------|
| SingleDicomViewer annotation props | ✅ | annotations, selectedAnnotationId, handlers, config |
| TransformContext 생성 | ✅ | DICOM→Canvas 좌표 변환 |
| SVGOverlay 통합 렌더링 | ✅ | 캔버스 컨테이너 내부 |
| 데모 앱 테스트 어노테이션 | ✅ | Single (Local) 모드 + Multi 모드 |

#### Phase 3f: 어노테이션 생성 UI ✅ 완료

| 항목 | 상태 | 비고 |
|------|------|------|
| DicomToolbar 어노테이션 도구 추가 | ✅ | Length, Angle, Point 버튼 |
| MeasurementTool SingleDicomViewer 통합 | ✅ | activate/deactivate, 이벤트 처리 |
| Canvas 이벤트 처리 | ✅ | 클릭→포인트 추가, 우클릭→취소 |
| 임시 어노테이션 렌더링 | ✅ | 점선 미리보기, 부분 포인트 표시 |
| strokeDasharray 지원 | ✅ | LengthShape, AngleShape, PointShape |
| PointTool B/M-mode 지원 | ✅ | 마커로 동작 (D-mode는 속도 측정) |
| CoordinateTransformer rotation/flip | ✅ | 회전/플립 시 어노테이션 좌표 변환 |
| 컴포넌트 unmount cleanup | ✅ | MeasurementTool 메모리 누수 방지 |

#### Phase 3g: 확장 & 플러그인 🚧 진행 중

| 항목 | 상태 | 비고 |
|------|------|------|
| Calibration 지원 | ✅ | Pixel Spacing + Ultrasound Region (Local File, WADO-RS) |
| 측정 도구 (Ellipse, VTI) | ⏳ | 확장 도구 |
| 플러그인 시스템 | ⏳ | 도구/계산기/렌더러 확장 |

**Calibration 구현 상세**:
- Local File: `getImageInfo()` → `getPixelSpacing()` / `getUltrasoundCalibration()`
- WADO-RS: `parseDicomJson()` → Pixel Spacing, Ultrasound Calibration 파싱
- WADO-RS fallback: 메타데이터에 없으면 전체 DICOM 인스턴스에서 추출
- 단위: mm(Pixel Spacing) → cm 변환, Ultrasound는 이미 cm/pixel

**설계 원칙**:
- 유연성: 플러그인 기반 확장 가능
- 커스터마이징: 설정 기반 권한/제한
- 책임 분리: EchoPixel(렌더링/CRUD/Export) vs 앱(네트워크/API/동기화)
- DataSource: WADO-RS/URI는 앱 구현 권장 (내장 DataSource는 옵셔널)

**결정 사항**:
- 권한: AI(삭제❌/수정✅/카운트❌), User(삭제✅/수정✅/카운트✅) - 설정 가능
- 개수 제한: DICOM 단위 15개 (User만, 설정 가능)
- 좌표계: DICOM 픽셀 좌표 저장, 모드별 물리 단위 표시
- 멀티 뷰포트: 독립 (1 viewport = 1 DICOM)
- 내보내기: JSON 포맷 v1.0 (버전 관리)

> 상세: [phase3-annotations-plan.md](../design/phase3-annotations-plan.md)

### Phase 4~5: 대기

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
| **annotations/** | types.ts | 어노테이션 타입 정의 |
| | coordinates/ | 좌표 변환 시스템 |
| | AnnotationStore.ts | CRUD + 권한/제한 |
| | Exporter.ts | JSON 내보내기 |
| | Importer.ts | JSON 가져오기 |
| | HistoryManager.ts | Undo/Redo |
| | tools/MeasurementTool.ts | 측정 도구 추상 기본 클래스 |
| | tools/LengthTool.ts | 두 점 거리 측정 |
| | tools/AngleTool.ts | 세 점 각도 측정 |
| | tools/PointTool.ts | 단일 점 마커 (B/M-mode) / 속도 측정 (D-mode) |
| | renderers/types.ts | 렌더러 인터페이스 및 타입 정의 |

### packages/react/src/

| 모듈 | 파일 | 설명 | 상태 |
|------|------|------|------|
| **components/** | SingleDicomViewer.tsx | 단일 DICOM 뷰어 (풀 UI + SVGOverlay) | ✅ |
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
| **annotations/** | SVGOverlay.tsx | 어노테이션 SVG 오버레이 | ✅ |
| | shapes/LengthShape.tsx | 두 점 거리 도형 | ✅ |
| | shapes/AngleShape.tsx | 세 점 각도 도형 | ✅ |
| | shapes/PointShape.tsx | 단일 점 십자선 도형 | ✅ |
| | MeasurementLabel.tsx | 측정값 라벨 | ✅ |
| | DragHandle.tsx | 드래그 핸들 | ✅ |
| **types.ts** | - | 공통 타입 정의 | ✅ |

### apps/demo/src/

| 파일 | 설명 |
|------|------|
| App.tsx | 메인 데모 앱 (3개 모드: Single, Multi, Multi-Canvas) |
| components/PerformanceOptions.tsx | 성능 옵션 패널 (VRAM/DPR/Debug) |
| components/MultiCanvasGrid.tsx | 멀티 캔버스 (비교용, 의도적 유지) |
| components/DicomViewport.tsx | 단일 뷰포트 컴포넌트 (레거시) |
| components/MultiViewport.tsx | Phase 2 멀티뷰포트 (레거시) |

---

## 알려진 이슈

| 이슈 | 상태 | 비고 |
|------|------|------|
| WebGL 컨텍스트 제한 (8-16개) | 🟢 해결 | Single Canvas 방식으로 우회 |
| VSCode DOM 타입 인식 오류 | 🟡 미해결 | 빌드 정상, IntelliSense만 문제 |
| vite-plugin-dts 설정 | 🟢 해결 | core 패키지 .d.ts 생성 활성화 |
| 데모 중복 Hybrid 모드 | 🟢 해결 | 로컬 HybridViewport 폴더 삭제 완료 |
| HardwareInfoPanel GPU 정보 (Multi) | 🟡 미표시 | glRef가 null (내부 관리) |
| 브라우저 줌 변경 시 검은 화면 | 🟢 해결 | MDN matchMedia 패턴 + DPR 재렌더링 |

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
11. ~~**Phase 2.7 Multi Viewport Rotation/Flip**~~ ✅ 완료
   - [x] HybridMultiViewport Rotation/Flip 지원 (셰이더 기반)
   - [x] ArrayTextureRenderer 셰이더 Flip uniform 추가
   - [x] DicomMiniOverlay 도구 UI (회전/플립/리셋 버튼)
12. ~~**Phase 2.8 Performance Options**~~ ✅ 완료
   - [x] PerformanceOptions 인터페이스 (VRAM, DPR, Debug)
   - [x] HybridMultiViewport performanceOptions prop
   - [x] 데모 앱 PerformanceOptionsPanel UI
   - [x] VRAM 사용량 실시간 표시
13. ~~**Phase 3 계획**~~ ✅ 완료
   - [x] Viviane 코드 분석 (좌표계, 측정 도구)
   - [x] 요구사항 결정 (권한, 개수 제한, 좌표계)
   - [x] 아키텍처 설계 (phase3-annotations-plan.md)
14. ~~**Phase 3a 구현**~~ ✅ 완료
   - [x] 타입 및 인터페이스 정의 (types.ts)
   - [x] AnnotationStore (CRUD + 권한/제한)
   - [x] HistoryManager (Undo/Redo + Batch)
   - [x] 좌표 변환 시스템 (CoordinateTransformer)
   - [x] Exporter/Importer (JSON v1.0)
15. ~~**Phase 3b 구현**~~ ✅ 완료
   - [x] MeasurementTool 추상 기본 클래스
   - [x] LengthTool (두 점 거리, B/M mode)
   - [x] AngleTool (세 점 각도, B mode)
   - [x] PointTool (단일 점 속도, D mode)
16. ~~**Phase 3c 구현**~~ ✅ 완료
   - [x] renderers/types.ts (RenderContext, ShapeRenderData, SVGRenderConfig)
   - [x] SVGOverlay.tsx (DICOM→Canvas 변환, 프레임 필터링)
   - [x] LengthShape, AngleShape, PointShape 컴포넌트
   - [x] MeasurementLabel, DragHandle 컴포넌트
   - [x] vite-plugin-dts 활성화 (core 패키지 .d.ts 생성)
17. ~~**Phase 3d 구현**~~ ✅ 완료
   - [x] HybridMultiViewportProps에 annotations prop 추가
   - [x] createTransformContext 헬퍼 함수
   - [x] HybridViewportSlot에 SVGOverlay 렌더링
   - [x] 어노테이션 이벤트 핸들러 연결
18. ~~**Phase 3e 구현**~~ ✅ 완료
   - [x] SingleDicomViewer에 SVGOverlay 통합
   - [x] annotation props 추가 (annotations, selectedAnnotationId, handlers 등)
   - [x] TransformContext 생성 로직
   - [x] 데모 앱 테스트 어노테이션 (Single + Multi 모드)
19. ~~**Phase 3f 구현**~~ ✅ 완료
   - [x] DicomToolbar에 어노테이션 도구 추가 (Length, Angle, Point)
   - [x] MeasurementTool SingleDicomViewer 통합
   - [x] Canvas 이벤트 처리 (클릭→포인트 추가, 우클릭→취소)
   - [x] 임시 어노테이션 렌더링 (점선 미리보기)
   - [x] CoordinateTransformer rotation/flip 좌표 변환
20. **Phase 3g 구현** (진행 중): ⬅️ 다음 마일스톤
   - [x] Calibration 지원 (Pixel Spacing + Ultrasound Region Calibration → mm/cm)
   - [ ] 측정 도구 확장 (Ellipse, VTI)
   - [ ] 플러그인 시스템
   - [ ] 어노테이션 선택/편집 UI
   - [ ] HybridMultiViewport 어노테이션 생성 기능
21. **npm 배포 준비**: README, CHANGELOG (Phase 5)

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
