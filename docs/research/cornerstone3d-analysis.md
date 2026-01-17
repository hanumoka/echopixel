# Cornerstone3D 분석 보고서

## 개요

Cornerstone3D는 웹 기반 의료 영상 뷰어를 위한 JavaScript 라이브러리로, OHIF Viewer의 핵심 엔진입니다.

**저장소**: [cornerstonejs/cornerstone3D](https://github.com/cornerstonejs/cornerstone3D)

---

## 핵심 기능

### 지원 기능
- GPU 가속 이미지 렌더링 (WebGL)
- 멀티스레드 이미지 디코딩 (WebAssembly)
- 프로그레시브 데이터 스트리밍
- 볼륨 렌더링 및 MPR (Multi-planar Reconstruction)
- 3D 어노테이션 및 측정
- 뷰포트 간 도구 상태 공유
- WADO-RS/WADO-URI 프로토콜 지원

### 아키텍처 특징
- vtk.js 기반 렌더링
- World 좌표계 통합
- StackViewport / VolumeViewport 분리

---

## 성능 문제 분석

### Issue #1756: Poor multi-frame cine loop playback

**출처**: [GitHub Issue #1756](https://github.com/cornerstonejs/cornerstone3D/issues/1756) (2025년 1월)

#### 증상
- 멀티 프레임 cine 이미지 (심초음파 등) 재생 시 프레임 드롭
- 여러 멀티 프레임 cine 동시 렌더링 시 특히 심각
- 느린 머신에서 현저한 성능 저하

#### 테스트 환경
- Mac M1 Pro
- macOS 15.1.1
- Chromium 131

#### 프로파일링 결과

전체 실행 시간 중 약 50%가 불필요한 재계산에 소비됨:

```
+------------------------+--------+----------------------------------+
| 함수                    | 비율   | 원인                              |
+------------------------+--------+----------------------------------+
| combineFrameInstance   | ~25%   | 매 렌더마다 ImagePlaneModule 조회  |
| vtkDataArray.getRange  | ~25%   | 새 배열 생성 시 range 재계산       |
| vtk 텍스처 빌드         | ~30%   | 캐싱 없이 매번 텍스처 생성         |
| 실제 렌더링             | ~20%   | 필요한 작업                        |
+------------------------+--------+----------------------------------+
```

#### 확인된 병목

1. **combineFrameInstance 과다 호출**
   - `StackViewport.getFrameOfReferenceUID()`에서 호출
   - 매 프레임마다 `ImagePlaneModule` 재계산
   - **해결책**: ImagePlaneModule 캐싱

2. **vtkDataArray 범위 계산**
   - vtk.js가 새 배열 생성 시 자동으로 range 계산
   - StackViewport에서 매 렌더마다 발생
   - **해결책**: Pre-calculated range 전달

3. **vtk.js 텍스처 캐싱 부재**
   - 프레임마다 새 텍스처 빌드
   - `imgScalars` range가 사용되지 않음
   - **해결책**: Pre-rendered 프레임 캐싱

---

## dicom.ts 비교 분석

[dicom.ts](https://www.npmjs.com/package/dicom.ts)는 Cornerstone보다 10-1800% 빠른 성능을 보고함.

### 핵심 차이점

| 항목 | Cornerstone3D | dicom.ts |
|------|---------------|----------|
| 파싱 방식 | Eager (전체 파싱) | Lazy (필요 시 파싱) |
| LUT 처리 | CPU | GPU (Fragment shader) |
| 텍스처 관리 | vtk.js 의존 | 직접 WebGL 제어 |
| 번들 크기 | ~500KB | ~100KB |
| 의존성 | vtk.js, dcmjs | 최소화 |

### dicom.ts 최적화 기법

```typescript
// 1. Lazy 파싱 - 필요한 태그만 해석
class DicomParser {
  getElement(tag: Tag): DicomElement {
    if (!this.parsed.has(tag)) {
      this.seekToTag(tag)  // 해당 위치로 점프
      this.parseElement(tag)
    }
    return this.parsed.get(tag)
  }
}

// 2. GPU LUT - Fragment shader에서 처리
const fragmentShader = `
  uniform sampler2D uImage;
  uniform vec2 uWindowLevel;  // [center, width]

  void main() {
    float pixel = texture2D(uImage, vTexCoord).r;
    float normalized = (pixel - uWindowLevel.x + uWindowLevel.y * 0.5) / uWindowLevel.y;
    gl_FragColor = vec4(vec3(clamp(normalized, 0.0, 1.0)), 1.0);
  }
`;

// 3. 직접 WebGL 관리 - vtk.js 오버헤드 제거
class Renderer {
  private gl: WebGL2RenderingContext
  private program: WebGLProgram

  render(imageData: TypedArray, windowLevel: [number, number]): void {
    // 직접 텍스처 업로드 및 렌더링
    gl.texImage2D(...)
    gl.drawArrays(...)
  }
}
```

---

## 웹 DICOM 뷰어 성능 연구

### 학술 조사 결과

**출처**: [Web-Based DICOM Viewers Survey](https://pmc.ncbi.nlm.nih.gov/articles/PMC12092310/)

#### 브라우저별 성능
| 브라우저 | 상대 속도 | 비고 |
|----------|-----------|------|
| Chrome | 1.0x (기준) | 가장 빠름 |
| Firefox | 0.95x | Chrome과 유사 |
| Safari | 0.9x | WebGL2 지원 후 개선 |
| Edge | 0.95x | Chromium 기반 |

#### OS별 성능
| OS | 상대 성능 |
|----|-----------|
| Windows | 1.0x (기준) |
| macOS | 0.9x |
| Linux | 0.95x |

---

## EchoPixel에 대한 시사점

### 채택할 접근법

1. **vtk.js 의존성 제거**
   - 직접 WebGL2 제어로 오버헤드 최소화
   - 심초음파 특화 최적화 가능

2. **Lazy DICOM 파싱**
   - dicom.ts 방식 채택
   - 필요한 메타데이터만 추출

3. **GPU-first 렌더링**
   - LUT, 윈도우/레벨 모두 GPU에서 처리
   - 2D Array Texture로 프레임 시퀀스 저장

4. **프레임 캐싱 전략**
   - Pre-decoded 프레임 GPU 텍스처로 유지
   - 범위 계산 1회 후 캐싱

### 회피할 패턴

- vtk.js 의존성
- 매 프레임 메타데이터 재계산
- CPU 기반 LUT 처리
- Eager 전체 파싱

---

## 결론

Cornerstone3D는 범용 의료 영상 뷰어로 기능이 풍부하지만, 심초음파와 같은 멀티 프레임 cine 시나리오에서 구조적 성능 한계가 있습니다.

EchoPixel은:
- vtk.js 없이 직접 WebGL2 제어
- 심초음파 cine loop 특화 최적화
- Lazy 파싱 + GPU 렌더링

로 차별화된 성능을 목표로 합니다.

---

## 참고 자료

- [Cornerstone3D GitHub](https://github.com/cornerstonejs/cornerstone3D)
- [Issue #1756 - Multi-frame cine loop playback](https://github.com/cornerstonejs/cornerstone3D/issues/1756)
- [dicom.ts npm](https://www.npmjs.com/package/dicom.ts)
- [Web-Based DICOM Viewers Survey](https://pmc.ncbi.nlm.nih.gov/articles/PMC12092310/)
- [DECODE-3DViz Performance](https://link.springer.com/article/10.1007/s10278-025-01430-9)
