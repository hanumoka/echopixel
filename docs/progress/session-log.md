# Session Log

세션별 작업 기록입니다. 최신 세션이 위에 표시됩니다.

> **아카이브**: 오래된 세션은 [archive/](./archive/) 폴더에 있습니다.

---

## 2026-01-22 세션 #37 (Multi ViewPort 어노테이션 버그 수정)

### 작업 내용

**1. Multi ViewPort (Single viewport 기반) 어노테이션 도구 수정** ⭐

사용자 요청: "Multi ViewPort 탭에서 어노테이션 도구가 동작하지 않음"

**원인 분석**:
| 문제 | 원인 | 해결 |
|------|------|------|
| 어노테이션 완료 클릭이 뷰포트 선택으로 처리됨 | `handleViewerClick`이 모든 클릭 가로챔 | `getActiveMeasurementToolId()` 체크 추가 |
| Click outside가 어노테이션 완료를 가로챔 | `handleClickOutside`가 컴포넌트 내부 클릭도 처리 | 활성 도구 있을 때 스킵 |
| 어노테이션이 저장되지 않음 | App.tsx에서 `onAnnotationUpdate` 미전달 | 핸들러 추가 |

**2. 캘리브레이션 로딩 수정**

사용자 요청: "길이 어노테이션이 cm이 아닌 px로 표시됨"

**원인**: `loadMultiCanvasViewers`에서 full DICOM 인스턴스의 캘리브레이션 정보 미추출

**해결**: Single ViewPort의 `handleWadoLoad`와 동일한 캘리브레이션 추출 로직 추가

```typescript
// ultrasoundCalibration 추출
if (!finalImageInfo.pixelSpacing && !finalImageInfo.ultrasoundCalibration) {
  const instanceBuffer = await fetch(instanceUrl, { headers: { 'Accept': 'application/dicom' } });
  const ultrasoundCalibration = getUltrasoundCalibration(instanceBuffer);
  if (ultrasoundCalibration) {
    finalImageInfo = { ...finalImageInfo, ultrasoundCalibration };
  }
}
```

**3. 개별 어노테이션 Visibility 컨트롤 추가**

사용자 요청: "어노테이션 숨기기가 그룹에서만 컨트롤되고 개별 컨트롤이 안됨"

**해결**:
- `viewerAnnotationsVisibility` 상태 추가 (`Record<string, boolean>`)
- 각 뷰어별로 독립적인 visibility 토글 가능

**4. 코드 정리**

| 항목 | 내용 |
|------|------|
| 디버그 로그 제거 | SingleDicomViewer, SingleDicomViewerGroup, LengthTool에서 16개+ console.log 제거 |
| useEffect 최적화 | 의존성 배열에서 `imageInfo` 제거 (`transformContext.viewport` 사용) |
| .gitignore 업데이트 | Vite timestamp 파일 패턴 추가 (`*.timestamp-*.mjs`) |

### 커밋 내역

| 커밋 | 내용 |
|------|------|
| `e561b68` | Fix annotation tools in Multi ViewPort and add individual visibility control |
| `d43f1b0` | Remove debug console.log statements and optimize useEffect dependencies |
| `ac18fe3` | Add Vite timestamp files to .gitignore and remove accidentally committed files |

### 학습 포인트

- **이벤트 전파 관리**: 중첩된 컴포넌트에서 이벤트 핸들링 시 활성 상태 체크 필요
- **캘리브레이션 로딩**: WADO-RS metadata만으로는 ultrasoundCalibration 추출 불가, full DICOM instance 필요
- **상태 관리**: 그룹 레벨 vs 개별 레벨 상태 분리 (viewerAnnotationsVisibility)

---

## 2026-01-21 세션 #36 (Performance Test 탭 추가)

### 작업 내용

**1. Performance Test (Pure WebGL) 탭 추가** ⭐

사용자 요청: "Pure WebGL 방식과 Hybrid DOM-WebGL 방식의 성능 비교 테스트용 탭 추가"

**구현 내용**:
- 새 탭 `'perf-test'` ViewMode 추가
- 순수 WebGL 렌더링 (DOM Overlay 없음)
- `gl.scissor()` + `gl.viewport()`로 그리드 분할
- `requestAnimationFrame` 기반 애니메이션 루프
- 실시간 FPS, Frame Time, VRAM 사용량 표시

**성능 비교 목적**:
| 항목 | Pure WebGL | Hybrid DOM-WebGL |
|------|------------|------------------|
| Frame Time | ~0.1ms | ~1-3ms |
| DOM 조작 | 없음 | React 리렌더링 |
| 어노테이션 | 미지원 | SVG 기반 지원 |

**2. 버그 수정**

| 버그 | 원인 | 수정 |
|------|------|------|
| `Cannot read 'animationId' of null` | `data?.animationId !== null` 로직 오류 | `data && data.animationId !== null`로 수정 |
| `texImage2D overload resolution failed` | `ArrayTextureRenderer` 사용 (TEXTURE_2D_ARRAY용) | `QuadRenderer` 사용 (TEXTURE_2D용) |
| `decoded.bitmap is undefined` | `DecodedFrame`에 `.bitmap` 없음 | `.image` 속성 사용 |
| Instance 선택 안됨 (16개 제한) | `getMaxSelect()`가 항상 `viewportCount` 반환 | `viewMode === 'perf-test'`일 때 `perfTestViewportCount` 반환 |
| 프레임 수 항상 1 | `metadata.numFrames`가 제대로 파싱 안됨 | `scannedInstances`에서 `frameCount` 사용 |

### 학습 포인트

- **TEXTURE_2D vs TEXTURE_2D_ARRAY**: `QuadRenderer`는 2D용, `ArrayTextureRenderer`는 배열 텍스처용
- **DecodedFrame 인터페이스**: `.bitmap`이 아닌 `.image` 속성 사용
- **Optional Chaining 주의**: `data?.prop !== null`은 `data`가 `null`일 때 `undefined !== null`이 `true`가 됨

---

## 2026-01-21 세션 #35 (UI 레이아웃 개선 및 최대 뷰포트 설정)

### 작업 내용

**1. UI 레이아웃 정확도 개선** ⭐

- `uiElementsHeight` 계산 수정 (DicomControls: 60px → 113px)
- `minViewerHeight` 450px → 510px

**2. Flex-wrap 자동 줄바꿈 추가**

- `DicomToolbar.tsx`: `flexWrap: 'wrap'` 추가
- `DicomControls.tsx`: FPS 컨트롤 compact화

**3. 최대 뷰포트 개수 차별화**

| 탭 | 최대 뷰포트 |
|---|---|
| Multi ViewPort (Single canvas 기반) | **100개** |
| Multi ViewPort (Single viewport 기반) | **16개** |

### 학습 포인트

- **CSS Flexbox**: `flex-wrap: wrap`으로 자동 줄바꿈 처리
- 하드코딩된 높이 계산은 유지보수가 어려움 → Flex 기반 레이아웃 권장

---

## 2026-01-21 세션 #34 (Click Outside 뷰포트 선택 해제)

### 작업 내용

**Click Outside 패턴 적용** ⭐

- document 레벨 `mousedown` 이벤트로 컴포넌트 외부 클릭 감지
- HybridMultiViewport, SingleDicomViewerGroup에 적용
- 컴포넌트 외부 클릭 시 뷰포트 선택 해제 → 도구바 숨김

### 학습 포인트

- **Click Outside 패턴**: `document.addEventListener('mousedown', handler)` + `element.contains(target)`
- `mousedown`이 `click`보다 빠르게 반응

---

## 다음 세션 할 일

- [ ] npm 배포 준비 (README.md, CHANGELOG.md)
- [ ] 패키지 버전 관리 설정
- [ ] 선택적: Ellipse, VTI 측정 도구
- [ ] 선택적: 라벨 드래그 기능

---

> **이전 세션 기록**:
> - [세션 #24~#33 (2026-01-21 초중반)](./archive/session-log-2026-01-21-mid.md)
> - [세션 #12~#23 (2026-01-18~20)](./archive/session-log-2026-01-phase2.md)
> - [세션 #1~#11 (2026-01-17~18 초반)](./archive/session-log-2026-01-early.md)
