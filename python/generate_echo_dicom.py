"""
심장초음파 DICOM 파일 생성 스크립트

20프레임의 시뮬레이션된 심장초음파 영상을 DICOM 형식으로 생성합니다.
실제 초음파 영상처럼 보이도록 섹터 모양과 노이즈를 포함합니다.

사용법:
    python generate_echo_dicom.py [출력폴더] [프레임수]

예시:
    python generate_echo_dicom.py ./output 20
"""

import os
import sys
import datetime
import numpy as np
from PIL import Image, ImageDraw

# pydicom imports
from pydicom import Dataset, FileDataset, uid
from pydicom.sequence import Sequence


def create_sector_mask(width: int, height: int, angle_deg: float = 80) -> np.ndarray:
    """
    초음파 섹터 형태의 마스크를 생성합니다.

    Args:
        width: 이미지 너비
        height: 이미지 높이
        angle_deg: 섹터 각도 (도)

    Returns:
        섹터 마스크 (0~1 float array)
    """
    # 섹터 중심점 (상단 중앙)
    cx, cy = width // 2, 0

    # 좌표 그리드 생성
    y, x = np.ogrid[:height, :width]

    # 중심으로부터의 각도 계산
    angles = np.arctan2(x - cx, y - cy)  # y가 아래로 증가
    angle_rad = np.deg2rad(angle_deg / 2)

    # 섹터 범위 내인지 확인
    in_sector = np.abs(angles) <= angle_rad

    # 거리 계산 (최대 거리로 정규화)
    distances = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    max_dist = height * 0.95
    min_dist = height * 0.05
    in_range = (distances >= min_dist) & (distances <= max_dist)

    mask = (in_sector & in_range).astype(np.float32)

    return mask


def generate_speckle_noise(width: int, height: int, scale: float = 0.3) -> np.ndarray:
    """
    초음파 특유의 스페클 노이즈를 생성합니다.

    Args:
        width: 이미지 너비
        height: 이미지 높이
        scale: 노이즈 강도

    Returns:
        노이즈 배열 (0~1 float array)
    """
    # 다중 스케일 노이즈 조합
    noise = np.zeros((height, width), dtype=np.float32)

    for s in [1, 2, 4]:
        small_h, small_w = height // s, width // s
        small_noise = np.random.rayleigh(scale, (small_h, small_w))
        # 업샘플링
        if s > 1:
            small_noise = np.repeat(np.repeat(small_noise, s, axis=0), s, axis=1)
            small_noise = small_noise[:height, :width]
        noise += small_noise / s

    # 정규화
    noise = noise / noise.max()
    return noise


def generate_heart_structure(
    width: int,
    height: int,
    frame: int,
    total_frames: int
) -> np.ndarray:
    """
    간단한 심장 구조 (좌심실 시뮬레이션)를 생성합니다.
    프레임에 따라 수축/이완을 시뮬레이션합니다.

    Args:
        width: 이미지 너비
        height: 이미지 높이
        frame: 현재 프레임 번호
        total_frames: 전체 프레임 수

    Returns:
        심장 구조 이미지 (0~1 float array)
    """
    img = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(img)

    # 심장 주기 시뮬레이션 (사인파)
    phase = 2 * np.pi * frame / total_frames
    contraction = 0.15 * np.sin(phase)  # 수축률

    # 좌심실 외벽 (타원)
    cx, cy = width // 2, height // 2 + 30
    outer_rx = int(80 * (1 - contraction * 0.5))
    outer_ry = int(120 * (1 - contraction * 0.3))

    # 외벽 (밝은 경계)
    draw.ellipse(
        [cx - outer_rx, cy - outer_ry, cx + outer_rx, cy + outer_ry],
        outline=200,
        width=8
    )

    # 내벽 (심실강 - 어두움)
    inner_rx = int(outer_rx * 0.6 * (1 - contraction))
    inner_ry = int(outer_ry * 0.6 * (1 - contraction))
    draw.ellipse(
        [cx - inner_rx, cy - inner_ry, cx + inner_rx, cy + inner_ry],
        fill=20
    )

    # 승모판 시뮬레이션 (상단)
    valve_y = cy - outer_ry + 20
    valve_opening = int(30 * (1 + contraction))
    draw.line(
        [(cx - valve_opening, valve_y), (cx, valve_y + 15), (cx + valve_opening, valve_y)],
        fill=180,
        width=4
    )

    return np.array(img, dtype=np.float32) / 255.0


def generate_echo_frame(
    width: int,
    height: int,
    frame: int,
    total_frames: int
) -> np.ndarray:
    """
    단일 심초음파 프레임을 생성합니다.

    Args:
        width: 이미지 너비
        height: 이미지 높이
        frame: 현재 프레임 번호
        total_frames: 전체 프레임 수

    Returns:
        8비트 그레이스케일 이미지 (uint8 array)
    """
    # 섹터 마스크
    mask = create_sector_mask(width, height)

    # 배경 노이즈
    noise = generate_speckle_noise(width, height, scale=0.4)

    # 심장 구조
    heart = generate_heart_structure(width, height, frame, total_frames)

    # 조합
    # 기본 배경 (어두움)
    base = np.ones((height, width), dtype=np.float32) * 0.05

    # 노이즈 추가
    image = base + noise * 0.3

    # 심장 구조 추가
    image = image + heart * 0.7

    # 섹터 마스크 적용
    image = image * mask

    # 깊이에 따른 감쇠 (TGC 시뮬레이션)
    y_coords = np.arange(height).reshape(-1, 1)
    attenuation = 1.0 - (y_coords / height) * 0.3
    image = image * attenuation

    # 클리핑 및 8비트 변환
    image = np.clip(image, 0, 1)
    image = (image * 255).astype(np.uint8)

    return image


def create_dicom_dataset(
    pixel_data: np.ndarray,
    frame_index: int,
    total_frames: int,
    series_uid: str,
    study_uid: str
) -> FileDataset:
    """
    DICOM 데이터셋을 생성합니다.

    Args:
        pixel_data: 픽셀 데이터 배열 (frames, height, width)
        frame_index: 시리즈 내 인스턴스 번호
        total_frames: 전체 프레임 수
        series_uid: Series Instance UID
        study_uid: Study Instance UID

    Returns:
        FileDataset 객체
    """
    # 파일 메타 정보
    file_meta = Dataset()
    file_meta.MediaStorageSOPClassUID = uid.UltrasoundMultiFrameImageStorage
    file_meta.MediaStorageSOPInstanceUID = uid.generate_uid()
    file_meta.TransferSyntaxUID = uid.ExplicitVRLittleEndian
    file_meta.ImplementationClassUID = uid.generate_uid()
    file_meta.ImplementationVersionName = "EchoPixel_1.0"

    # FileDataset 생성
    ds = FileDataset(
        filename_or_obj="",
        dataset={},
        file_meta=file_meta,
        preamble=b"\x00" * 128
    )

    # 현재 시간
    now = datetime.datetime.now()

    # Patient 모듈
    ds.PatientName = "Test^Echo^Patient"
    ds.PatientID = "ECHO001"
    ds.PatientBirthDate = "19800101"
    ds.PatientSex = "O"

    # Study 모듈
    ds.StudyInstanceUID = study_uid
    ds.StudyDate = now.strftime("%Y%m%d")
    ds.StudyTime = now.strftime("%H%M%S")
    ds.StudyID = "ECHO_STUDY_001"
    ds.AccessionNumber = "ACC001"
    ds.ReferringPhysicianName = "Dr^Test"
    ds.StudyDescription = "Echocardiography Study"

    # Series 모듈
    ds.SeriesInstanceUID = series_uid
    ds.SeriesNumber = 1
    ds.SeriesDescription = "2D Echo - Apical 4 Chamber"
    ds.Modality = "US"
    ds.Manufacturer = "EchoPixel"
    ds.ManufacturerModelName = "Virtual Echo"

    # General Equipment
    ds.InstitutionName = "Test Hospital"
    ds.StationName = "ECHO_WS_01"
    ds.SoftwareVersions = "1.0.0"

    # Frame of Reference (US는 선택적)
    ds.FrameOfReferenceUID = uid.generate_uid()

    # Image 모듈
    ds.SOPClassUID = uid.UltrasoundMultiFrameImageStorage
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.InstanceNumber = frame_index + 1
    ds.ContentDate = now.strftime("%Y%m%d")
    ds.ContentTime = now.strftime("%H%M%S.%f")[:13]

    # Image Pixel 모듈
    num_frames, rows, cols = pixel_data.shape
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.NumberOfFrames = num_frames
    ds.Rows = rows
    ds.Columns = cols
    ds.BitsAllocated = 8
    ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelRepresentation = 0
    ds.PlanarConfiguration = 0

    # Pixel Data
    ds.PixelData = pixel_data.tobytes()

    # US Image 모듈
    ds.ImageType = ["DERIVED", "SECONDARY"]
    ds.LossyImageCompression = "00"

    # US Region Calibration (간단한 예시)
    ds.SequenceOfUltrasoundRegions = Sequence()
    region = Dataset()
    region.RegionSpatialFormat = 1  # 2D
    region.RegionDataType = 1  # Tissue
    region.RegionFlags = 0
    region.RegionLocationMinX0 = 0
    region.RegionLocationMinY0 = 0
    region.RegionLocationMaxX1 = cols - 1
    region.RegionLocationMaxY1 = rows - 1
    region.PhysicalUnitsXDirection = 3  # cm
    region.PhysicalUnitsYDirection = 3  # cm
    region.PhysicalDeltaX = 0.02  # 2mm per pixel
    region.PhysicalDeltaY = 0.02
    ds.SequenceOfUltrasoundRegions.append(region)

    # Cine 모듈
    ds.FrameTime = 33.33  # ~30fps (ms per frame)
    ds.HeartRate = 72
    ds.RecommendedDisplayFrameRate = 30

    return ds


def generate_echo_dicom_files(
    output_dir: str,
    num_frames: int = 20,
    width: int = 512,
    height: int = 512
) -> list[str]:
    """
    심초음파 DICOM 파일들을 생성합니다.

    Args:
        output_dir: 출력 디렉토리
        num_frames: 프레임 수
        width: 이미지 너비
        height: 이미지 높이

    Returns:
        생성된 파일 경로 목록
    """
    # 출력 디렉토리 생성
    os.makedirs(output_dir, exist_ok=True)

    # UID 생성 (같은 시리즈로)
    study_uid = uid.generate_uid()
    series_uid = uid.generate_uid()

    print(f"심초음파 DICOM 생성 시작...")
    print(f"  - 출력 폴더: {output_dir}")
    print(f"  - 프레임 수: {num_frames}")
    print(f"  - 이미지 크기: {width}x{height}")
    print(f"  - Study UID: {study_uid}")
    print(f"  - Series UID: {series_uid}")
    print()

    # 프레임 생성
    print("프레임 생성 중...")
    frames = []
    for i in range(num_frames):
        frame = generate_echo_frame(width, height, i, num_frames)
        frames.append(frame)
        print(f"  프레임 {i+1}/{num_frames} 생성 완료")

    # numpy 배열로 변환 (frames, height, width)
    pixel_data = np.stack(frames, axis=0)

    # DICOM 파일 생성 (멀티프레임으로 단일 파일)
    print("\nDICOM 파일 생성 중...")
    ds = create_dicom_dataset(
        pixel_data=pixel_data,
        frame_index=0,
        total_frames=num_frames,
        series_uid=series_uid,
        study_uid=study_uid
    )

    # 파일 저장
    filename = f"echo_multiframe_{num_frames}frames.dcm"
    filepath = os.path.join(output_dir, filename)
    ds.save_as(filepath)
    print(f"  저장됨: {filepath}")

    # 추가로 단일 프레임 파일들도 생성 (테스트용)
    print("\n개별 프레임 DICOM 파일 생성 중...")
    single_frame_dir = os.path.join(output_dir, "single_frames")
    os.makedirs(single_frame_dir, exist_ok=True)

    created_files = [filepath]

    for i, frame in enumerate(frames):
        single_pixel = frame.reshape(1, height, width)
        ds_single = create_dicom_dataset(
            pixel_data=single_pixel,
            frame_index=i,
            total_frames=num_frames,
            series_uid=series_uid,
            study_uid=study_uid
        )
        ds_single.NumberOfFrames = 1
        ds_single.InstanceNumber = i + 1

        single_filename = f"echo_frame_{i+1:03d}.dcm"
        single_filepath = os.path.join(single_frame_dir, single_filename)
        ds_single.save_as(single_filepath)
        created_files.append(single_filepath)

    print(f"  {num_frames}개의 단일 프레임 파일 저장됨: {single_frame_dir}")

    print(f"\n완료! 총 {len(created_files)}개 파일 생성됨")

    return created_files


def main():
    """메인 함수"""
    # 기본값
    output_dir = "./output"
    num_frames = 20

    # 명령행 인자 처리
    if len(sys.argv) > 1:
        output_dir = sys.argv[1]
    if len(sys.argv) > 2:
        num_frames = int(sys.argv[2])

    # DICOM 생성
    created_files = generate_echo_dicom_files(
        output_dir=output_dir,
        num_frames=num_frames
    )

    print("\n생성된 파일 목록:")
    for f in created_files[:5]:  # 처음 5개만 표시
        print(f"  - {f}")
    if len(created_files) > 5:
        print(f"  ... 외 {len(created_files) - 5}개")


if __name__ == "__main__":
    main()
