# EchoPixel 테스트용 DICOM 생성 도구

심초음파 DICOM 파일을 생성하는 Python 스크립트입니다.
EchoPixel 라이브러리 개발/테스트에 사용됩니다.

## 설치

```bash
cd python
pip install -r requirements.txt
```

## 스크립트

### generate_echo_dicom.py (v1)

간단한 심초음파 시뮬레이션

```bash
python generate_echo_dicom.py [출력폴더] [프레임수]

# 예시
python generate_echo_dicom.py ./output 30
```

**출력**:
- `echo_multiframe_{N}frames.dcm` - 멀티프레임 DICOM
- `single_frames/echo_frame_XXX.dcm` - 개별 프레임 DICOM

### generate_echo_dicom_v2.py (v2)

Apical 4-Chamber View 시뮬레이션 (더 현실적)

```bash
python generate_echo_dicom_v2.py [출력폴더] [목표크기MB]

# 예시: 20MB 파일 생성
python generate_echo_dicom_v2.py ./output 20
```

**출력**:
- `echo_4chamber_{N}frames.dcm` - 멀티프레임 DICOM

### viewer.html

브라우저에서 DICOM 파일을 확인할 수 있는 간단한 뷰어

```bash
# 브라우저에서 viewer.html 열기
# DICOM 파일을 드래그 앤 드롭
```

## 생성되는 DICOM 정보

| 항목 | 값 |
|------|-----|
| Transfer Syntax | Explicit VR Little Endian (1.2.840.10008.1.2.1) |
| Photometric | MONOCHROME2 |
| Bits Allocated | 8 |
| SOP Class | US Multi-frame Image Storage |

## Phase 1 테스트용 파일

| Transfer Syntax | 생성 방법 | 상태 |
|-----------------|----------|------|
| Uncompressed (Explicit VR LE) | v1, v2 스크립트 | ✅ 가능 |
| JPEG Baseline | 별도 스크립트 필요 | ⏳ 예정 |

## 주의사항

- `output/` 폴더는 `.gitignore`에 포함됨
- 생성된 DICOM은 테스트용 시뮬레이션 데이터임
- 실제 환자 정보가 아님
