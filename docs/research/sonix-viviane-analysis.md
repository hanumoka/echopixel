# Sonix-Viviane 프로젝트 분석

## 개요

**프로젝트**: AI 기반 심장 초음파 분석 웹 애플리케이션
**위치**: `C:\Users\amagr\sonix\fe\sonix-viviane`
**기술 스택**: React 19 + TypeScript + Cornerstone.js 4.14.2

---

## 1. Cornerstone.js 사용 현황

### 패키지 버전
```json
"@cornerstonejs/core": "4.14.2"
"@cornerstonejs/dicom-image-loader": "4.14.2"
"@cornerstonejs/tools": "4.14.2"
"@cornerstonejs/nifti-volume-loader": "4.14.2"
"@cornerstonejs/calculate-suv": "1.1.0"
"dcmjs": "0.33.0"
"dicom-parser": "1.8.21"
"dicomweb-client": "0.10.4"
```

### 초기화 설정

**파일**: `src/utils/dicom/cornerstone.ts`

| 설정 | 값 | 설명 |
|------|-----|------|
| RENDERING_ENGINE_MODE | 'tiled' (기본) | 안정성 우선 |
| GPU_TIER | 0-3 (기본 2) | 고성능 GPU 대상 |
| 웹 워커 수 | 최대 8개 | 병렬 디코딩 |

### DICOM 로딩 방식

```typescript
// 두 가지 로딩 모드 지원
1. 'wado-uri' (기본) - 전체 프레임 순차 로드 (안정적)
2. 'wado-uri-progressive' - 첫 프레임 먼저, 나머지 백그라운드 (빠른 UX)

// 프레임 ID 형식
imageId: `wadouri:{url}?frame={frameIndex}`  // 1-based 인덱싱
```

---

## 2. 핵심 기능 분석

### 뷰포트 구현

| 항목 | 구현 내용 |
|------|----------|
| **뷰포트 타입** | STACK (Enums.ViewportType.STACK) |
| **레이아웃** | 1x1, 2x2, 커스텀 그리드 |
| **네이밍** | `viewport-0`, `viewport-{row}-{col}` |
| **배경** | [0, 0, 0] (검정) |
| **맞춤** | 'FIT' (화면에 맞춤) |

### 멀티 뷰포트 동기화

**파일**: `src/hooks/dicom/play-cine-tool/use-sync-playback.ts`

```typescript
동기화 메커니즘:
- 프레임 수가 다른 뷰포트들의 재생 시간 동기화
- FPS 정규화: 앵커 뷰포트 기준으로 다른 뷰포트 FPS 조정
- 단일 progress 값 (0-1)으로 전체 동기화
- requestAnimationFrame 기반 정밀 타이밍
- 개별 뷰포트 일시정지 지원 (전역 재생 중)
```

### 측정 도구

**지원 도구**:
| 도구 | 컴포넌트 | 기능 |
|------|----------|------|
| **Spline (Strain)** | StrainSplineTool | Endo/Mid/Epi 컨투어 |
| **Contour** | ContourSplineTool | 다점 측정 컨투어 |
| **Line** | LineTool | 거리, D-mode 시간 측정 |
| **Point** | PointTool | SVG 점 또는 텍스트 라벨 |
| **Angle** | AngleTool | 3점 각도 측정 |
| **Eraser** | EraserTool | 어노테이션 삭제 |
| **Reset** | ResetTool | 뷰포트/어노테이션 초기화 |

### Strain 분석

```typescript
지원 심실:
- LV (Left Ventricle) - 좌심실
- LA (Left Atrium) - 좌심방
- RV (Right Ventricle) - 우심실
- RA (Right Atrium) - 우심방

지원 뷰:
- A4C (Apical 4-Chamber)
- A2C (Apical 2-Chamber)
- A3C (Apical 3-Chamber)

Strain 지표:
- GLS (Global Longitudinal Strain)
- FAC (Fractional Area Change)
- TAPSE
- MFS

프레임 마커:
- AVC (Aortic Valve Closure)
- PVC (Pulmonary Valve Closure)
- ED (End Diastole)
- ES (End Systole)
```

---

## 3. 아키텍처 분석

### 폴더 구조

```
src/
├── components/dicom/
│   ├── ai-review/         # 리뷰/측정 모드
│   ├── ai-strain/         # Strain 분석 모드
│   ├── ai-capture/        # 자동 캡처 모드
│   ├── core/              # 재생 컨트롤
│   └── tool/              # 측정 도구
│       └── spline/
│           ├── contour/   # 측정용 컨투어
│           └── strain/    # Strain용 스플라인
├── hooks/dicom/
│   └── play-cine-tool/    # 재생 동기화
├── utils/dicom/
│   ├── measure/           # 측정 계산
│   └── strain/            # Strain 알고리즘
├── context/               # React Context
├── types/dicom/           # TypeScript 타입
└── services/dicom/        # API 서비스
```

### 상태 관리

```typescript
// DICOM Tool Context
- activeViewportId: string | null
- viewportIds: Record<string, string | null>
- currentLayout: { rows: number; cols: number }
- toolStates: Record<viewportId, ToolState>
- globalPlayback: {
    isStrain: boolean
    isPlaying: boolean
    fps: number
    startTime: number | null
  }
- playingViewports: Set<string>
- pausedViewports: Set<string>

// Annotation Context
- 프레임별 어노테이션 저장
- DICOM ID 기준 그룹화
- Undo/Redo 스택
- 잠금/편집 상태 관리
```

### 커스텀 훅

| 훅 | 용도 |
|----|------|
| `useDicomData()` | DICOM 분석 데이터 fetch + 필터링 |
| `useLayoutManagement()` | 그리드 레이아웃 변경 관리 |
| `useCineEngine()` | 단일 뷰포트 재생 제어 |
| `useSyncPlayback()` | 멀티 뷰포트 동기 재생 |
| `useMeasurementCine()` | 측정 모드 재생 |
| `useStrainCine()` | Strain 모드 재생 |

---

## 4. 추출된 요구사항

### 필수 기능

#### 4.1 DICOM 뷰잉
- [x] 멀티프레임 DICOM 로딩 (WADO-URI)
- [x] 프로그레시브 프레임 로딩
- [x] B-mode, M-mode, D-mode 초음파 지원
- [x] 프레임 동기화

#### 4.2 측정 도구
- [x] 점 측정 (Point)
- [x] 선 측정 (Line) - 거리, 시간
- [x] 컨투어/스플라인 (면적)
- [x] 각도 측정 (Angle)
- [x] 캘리브레이션 지원
- [x] 어노테이션 저장/로드

#### 4.3 Strain 분석
- [x] Endo/Mid/Epi 컨투어 표시
- [x] LV/LA/RV/RA 심실 지원
- [x] A4C/A2C/A3C 뷰 지원
- [x] GLS, FAC, TAPSE, MFS 지표
- [x] 컨투어 편집 및 재추적
- [x] Bulls-eye 차트, 그래프 시각화

#### 4.4 멀티 뷰포트
- [x] 1x1, 2x2, 커스텀 그리드
- [x] 동기화 재생 (다른 프레임 수 지원)
- [x] 개별 뷰포트 일시정지
- [x] Seek/Progress 제어

#### 4.5 비디오 재생
- [x] 프레임 단위 탐색
- [x] FPS 조절 (1-150)
- [x] 반복/루프 구간
- [x] 프레임 마커 (AVC, PVC, ED, ES)

#### 4.6 사용자 인터페이스
- [x] 썸네일 목록
- [x] 레이아웃 전환
- [x] 줌/팬 컨트롤
- [x] Window/Level 조정
- [x] 도구 팔레트
- [x] Undo/Redo
- [x] 어노테이션 표시/숨김

---

## 5. EchoPixel 시사점

### 채택할 패턴

| 패턴 | 출처 | EchoPixel 적용 |
|------|------|----------------|
| **프로그레시브 로딩** | cornerstone.ts | 첫 프레임 우선 + 백그라운드 캐싱 |
| **FPS 정규화 동기화** | use-sync-playback.ts | 다른 프레임 수 뷰포트 동기화 |
| **프레임별 어노테이션** | annotation-context.tsx | 프레임 키 기반 저장 구조 |
| **뷰포트 상태 분리** | tool-context.tsx | 개별 뷰포트 로딩/FPS/도구 상태 |
| **레이아웃 관리 훅** | use-layout-management.ts | 그리드 변경 로직 분리 |

### 개선 가능 영역

| 현재 구현 | EchoPixel 개선안 |
|-----------|------------------|
| Cornerstone STACK 뷰포트 | WebGL2 Array Texture (즉시 프레임 전환) |
| 개별 이미지 로드 | 전체 시퀀스 GPU 프리로드 |
| vtk.js 의존 | 직접 WebGL2 (오버헤드 제거) |
| 컨텍스트 풀 렌더링 | 단일 캔버스 Scissor 렌더링 |

### 구현 우선순위 조정

Sonix-Viviane 분석 결과, EchoPixel Phase 3의 어노테이션 기능에서 다음이 필수:

1. **Strain 컨투어 렌더링** - Endo/Mid/Epi 다층 스플라인
2. **D-mode 측정** - 시간 기반 거리/속도 계산
3. **프레임 마커 시스템** - AVC, ED, ES 등 핵심 프레임 표시
4. **Bulls-eye Plot** - Strain 결과 시각화

---

## 6. 핵심 파일 참조

| 기능 | 파일 경로 |
|------|-----------|
| Cornerstone 설정 | `src/utils/dicom/cornerstone.ts` |
| 뷰포트 Context | `src/context/dicom-tool-context.tsx` |
| 어노테이션 Context | `src/context/dicom-annotation-context.tsx` |
| Cine 엔진 | `src/hooks/dicom/play-cine-tool/use-cine-engine.ts` |
| 동기 재생 | `src/hooks/dicom/play-cine-tool/use-sync-playback.ts` |
| 측정 계산 | `src/utils/dicom/measure/calculations/` |
| Strain Spline | `src/components/dicom/tool/spline/strain/` |
| AI Strain 뷰어 | `src/components/dicom/ai-strain/AiStrainDicomViewer.tsx` |

---

## 7. 결론

Sonix-Viviane는 Cornerstone.js 4.x를 활용한 성숙한 심초음파 분석 뷰어입니다.

**EchoPixel이 참고할 점**:
- 멀티 뷰포트 동기화 알고리즘 (FPS 정규화)
- 프레임별 어노테이션 저장 구조
- Strain 분석 워크플로우 (컨투어 → 추적 → 시각화)
- 프레임 마커 시스템

**EchoPixel이 개선할 점**:
- Cornerstone 의존성 제거로 더 나은 성능
- 2D Array Texture로 즉시 프레임 전환
- 단일 WebGL 컨텍스트로 10+ 뷰포트 지원
