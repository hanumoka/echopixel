# Learning Notes

프로젝트 진행 중 학습한 기술 내용을 정리합니다.

---

## 학습 자료

### WebGL2

EchoPixel의 핵심 렌더링 기술:

- 2D Array Texture - 프레임 시퀀스 저장
- Scissor/Viewport - 단일 캔버스 멀티 뷰포트
- Fragment Shader - GPU VOI LUT

**참고 문서**:
- [렌더링 파이프라인](/docs/guide/developer-guide/rendering-pipeline.md)
- [WebGL2 Fundamentals](https://webgl2fundamentals.org/)

### DICOM

의료 영상 표준:

- Multi-frame 구조 - 심초음파 cine loop
- Transfer Syntax - JPEG 압축
- UltrasoundRegion - 캘리브레이션

**참고 문서**:
- [DICOM 기초](/docs/guide/developer-guide/dicom-fundamentals.md)
- [DICOM Standard](https://www.dicomstandard.org/)

### TypeScript

프로젝트 타입 시스템:

- Strict mode
- 제네릭 활용
- TypedArray 처리

**참고 문서**:
- [코딩 가이드](/docs/guide/developer-guide/coding-guide.md)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)

---

## 학습 원칙

이 프로젝트는 **학습 목적**입니다:

1. 핵심 코드는 사용자가 직접 구현
2. Claude는 가이드, 리뷰, 문서화 담당
3. 각 단계마다 설계적/기술적 설명 포함

자세한 내용은 [CLAUDE.md](/CLAUDE.md)의 가이드 원칙 참조.
