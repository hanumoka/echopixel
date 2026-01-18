"""
JPEG Baseline 압축 DICOM 파일 생성 스크립트

Transfer Syntax: JPEG Baseline (Process 1) - 1.2.840.10008.1.2.4.50
Photometric Interpretation: YBR_FULL_422 (JPEG 표준)

기존 v2 스크립트의 4-Chamber View를 JPEG 압축하여 저장합니다.

사용법:
    python generate_echo_dicom_jpeg.py [출력폴더] [프레임수] [품질]

    - 출력폴더: DICOM 저장 위치 (기본: ./output)
    - 프레임수: 생성할 프레임 수 (기본: 60)
    - 품질: JPEG 품질 1-100 (기본: 85)

예시:
    python generate_echo_dicom_jpeg.py ./output 60 85
"""

import os
import sys
import io
import datetime
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from pydicom import Dataset, FileDataset, uid
from pydicom.sequence import Sequence
from pydicom.encaps import encapsulate


# JPEG Baseline Transfer Syntax UID
JPEG_BASELINE_UID = "1.2.840.10008.1.2.4.50"


def create_sector_mask(width: int, height: int, angle_deg: float = 75) -> np.ndarray:
    """초음파 섹터 형태의 마스크 생성"""
    cx, cy = width // 2, int(height * 0.02)
    y, x = np.ogrid[:height, :width]

    angles = np.arctan2(x - cx, y - cy)
    angle_rad = np.deg2rad(angle_deg / 2)
    in_sector = np.abs(angles) <= angle_rad

    distances = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    max_dist = height * 0.95
    min_dist = height * 0.03
    in_range = (distances >= min_dist) & (distances <= max_dist)

    mask = (in_sector & in_range).astype(np.float32)

    from scipy.ndimage import gaussian_filter
    mask = gaussian_filter(mask, sigma=2)

    return mask


def generate_speckle_noise(width: int, height: int, intensity: float = 0.4) -> np.ndarray:
    """초음파 스페클 노이즈 생성"""
    noise = np.zeros((height, width), dtype=np.float32)

    for scale in [1, 2, 4, 8]:
        h, w = height // scale, width // scale
        layer = np.random.rayleigh(0.5, (h, w))
        layer = np.repeat(np.repeat(layer, scale, axis=0), scale, axis=1)[:height, :width]
        noise += layer * (1.0 / scale)

    noise = noise / noise.max() * intensity
    return noise


def generate_4chamber_frame(
    width: int,
    height: int,
    frame: int,
    total_frames: int,
    heart_rate: int = 72
) -> np.ndarray:
    """Apical 4-Chamber View 프레임 생성"""
    img = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(img)

    cycle = frame / total_frames
    phase = 2 * np.pi * cycle
    systole_factor = (np.sin(phase) + 1) / 2

    apex_y = int(height * 0.12)
    base_y = int(height * 0.75)
    mid_y = int(height * 0.45)
    center_x = width // 2

    # 좌심실 (LV)
    lv_cx = center_x - int(width * 0.12)
    lv_cy = int(height * 0.35)
    lv_contraction = 0.18 * systole_factor
    lv_outer_rx = int(75 * (1 - lv_contraction * 0.3))
    lv_outer_ry = int(140 * (1 - lv_contraction * 0.2))
    lv_inner_rx = int(55 * (1 - lv_contraction))
    lv_inner_ry = int(115 * (1 - lv_contraction * 0.8))

    draw.ellipse(
        [lv_cx - lv_outer_rx, apex_y, lv_cx + lv_outer_rx, lv_cy + lv_outer_ry],
        fill=170
    )
    draw.ellipse(
        [lv_cx - lv_inner_rx, apex_y + 25, lv_cx + lv_inner_rx, lv_cy + lv_inner_ry],
        fill=12
    )

    # 우심실 (RV)
    rv_cx = center_x + int(width * 0.15)
    rv_cy = int(height * 0.32)
    rv_contraction = 0.12 * systole_factor
    rv_outer_rx = int(65 * (1 - rv_contraction * 0.3))
    rv_outer_ry = int(120 * (1 - rv_contraction * 0.2))
    rv_inner_rx = int(50 * (1 - rv_contraction))
    rv_inner_ry = int(100 * (1 - rv_contraction * 0.7))

    draw.ellipse(
        [rv_cx - rv_outer_rx, apex_y + 15, rv_cx + rv_outer_rx, rv_cy + rv_outer_ry],
        fill=150
    )
    draw.ellipse(
        [rv_cx - rv_inner_rx, apex_y + 30, rv_cx + rv_inner_rx, rv_cy + rv_inner_ry],
        fill=15
    )

    # 심실 중격
    septum_x = center_x
    draw.line(
        [(septum_x, apex_y + 20), (septum_x, mid_y - 10)],
        fill=190,
        width=18
    )

    # 좌심방 (LA)
    la_cx = center_x - int(width * 0.14)
    la_cy = int(height * 0.62)
    la_expansion = 0.08 * systole_factor
    la_rx = int(70 * (1 + la_expansion))
    la_ry = int(55 * (1 + la_expansion))

    draw.ellipse(
        [la_cx - la_rx - 8, la_cy - la_ry - 8, la_cx + la_rx + 8, la_cy + la_ry + 8],
        fill=140
    )
    draw.ellipse(
        [la_cx - la_rx, la_cy - la_ry, la_cx + la_rx, la_cy + la_ry],
        fill=18
    )

    # 우심방 (RA)
    ra_cx = center_x + int(width * 0.16)
    ra_cy = int(height * 0.60)
    ra_expansion = 0.06 * systole_factor
    ra_rx = int(60 * (1 + ra_expansion))
    ra_ry = int(50 * (1 + ra_expansion))

    draw.ellipse(
        [ra_cx - ra_rx - 6, ra_cy - ra_ry - 6, ra_cx + ra_rx + 6, ra_cy + ra_ry + 6],
        fill=130
    )
    draw.ellipse(
        [ra_cx - ra_rx, ra_cy - ra_ry, ra_cx + ra_rx, ra_cy + ra_ry],
        fill=20
    )

    # 심방 중격
    draw.line(
        [(septum_x, mid_y + 20), (septum_x, base_y - 30)],
        fill=160,
        width=10
    )

    # 승모판
    mv_y = mid_y
    mv_x = lv_cx
    mv_opening = int(25 * (1 - systole_factor))

    draw.polygon([
        (mv_x - 30, mv_y),
        (mv_x - 5, mv_y + mv_opening + 20),
        (mv_x + 5, mv_y)
    ], fill=200)

    draw.polygon([
        (mv_x - 35, mv_y + 5),
        (mv_x - 15, mv_y + mv_opening + 10),
        (mv_x - 40, mv_y + 15)
    ], fill=190)

    # 삼첨판
    tv_y = mid_y - 5
    tv_x = rv_cx - 15
    tv_opening = int(20 * (1 - systole_factor))

    draw.polygon([
        (tv_x - 20, tv_y),
        (tv_x, tv_y + tv_opening + 15),
        (tv_x + 15, tv_y)
    ], fill=180)

    # 폐정맥
    pv_y = la_cy - la_ry - 5
    draw.ellipse([la_cx - 25, pv_y - 8, la_cx - 10, pv_y + 8], fill=25)
    draw.ellipse([la_cx + 10, pv_y - 8, la_cx + 25, pv_y + 8], fill=25)

    heart = np.array(img, dtype=np.float32) / 255.0
    return heart


def apply_ultrasound_artifacts(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """초음파 아티팩트 적용"""
    height, width = image.shape

    y_coords = np.arange(height).reshape(-1, 1) / height
    tgc = 0.7 + 0.5 * y_coords
    image = image * tgc
    image = image * mask
    image = np.clip(image * 1.2, 0, 1)

    return image


def generate_echo_frame(
    width: int,
    height: int,
    frame: int,
    total_frames: int
) -> np.ndarray:
    """완성된 심초음파 프레임 생성 (8-bit grayscale)"""
    mask = create_sector_mask(width, height, angle_deg=75)
    background = np.ones((height, width), dtype=np.float32) * 0.02
    speckle = generate_speckle_noise(width, height, intensity=0.25)
    heart = generate_4chamber_frame(width, height, frame, total_frames)

    image = background + speckle * 0.3 + heart * 0.85
    image = apply_ultrasound_artifacts(image, mask)
    image = np.clip(image, 0, 1)
    image = (image * 255).astype(np.uint8)

    return image


def encode_frame_as_jpeg(frame: np.ndarray, quality: int = 85) -> bytes:
    """
    프레임을 JPEG Baseline으로 인코딩

    JPEG Baseline은 8-bit만 지원합니다.
    Grayscale 이미지도 JPEG로 압축 가능합니다.

    Args:
        frame: 2D numpy array (H, W), uint8
        quality: JPEG 품질 (1-100, 높을수록 고품질)

    Returns:
        JPEG 바이트 데이터
    """
    # numpy array를 PIL Image로 변환
    img = Image.fromarray(frame, mode='L')  # 'L' = 8-bit grayscale

    # JPEG로 인코딩
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=quality, subsampling=0)  # subsampling=0 for best quality

    return buffer.getvalue()


def create_jpeg_dicom_dataset(
    jpeg_frames: list,
    rows: int,
    cols: int,
    series_uid: str,
    study_uid: str,
    heart_rate: int = 72,
    frame_rate: int = 30
) -> FileDataset:
    """
    JPEG 압축된 멀티프레임 DICOM 데이터셋 생성

    핵심 포인트:
    1. Transfer Syntax: JPEG Baseline (1.2.840.10008.1.2.4.50)
    2. Pixel Data: 캡슐화된 형태 (Encapsulated)
    3. Photometric Interpretation: MONOCHROME2 (grayscale JPEG)
    """

    file_meta = Dataset()
    file_meta.MediaStorageSOPClassUID = uid.UltrasoundMultiFrameImageStorage
    file_meta.MediaStorageSOPInstanceUID = uid.generate_uid()
    file_meta.TransferSyntaxUID = JPEG_BASELINE_UID  # JPEG Baseline
    file_meta.ImplementationClassUID = uid.generate_uid()
    file_meta.ImplementationVersionName = "EchoPixel_JPEG_1.0"

    ds = FileDataset(
        filename_or_obj="",
        dataset={},
        file_meta=file_meta,
        preamble=b"\x00" * 128
    )

    now = datetime.datetime.now()
    num_frames = len(jpeg_frames)

    # ========== Patient Module ==========
    ds.PatientName = "Kim^Chul-Soo"
    ds.PatientID = "P20240117002"
    ds.PatientBirthDate = "19750315"
    ds.PatientSex = "M"
    ds.PatientAge = "050Y"

    # ========== Study Module ==========
    ds.StudyInstanceUID = study_uid
    ds.StudyDate = now.strftime("%Y%m%d")
    ds.StudyTime = now.strftime("%H%M%S")
    ds.StudyID = "ECHO20240117"
    ds.AccessionNumber = "ACC2024011700002"
    ds.ReferringPhysicianName = "Park^Min-Joon^Dr"
    ds.StudyDescription = "TTE - JPEG Compressed"

    # ========== Series Module ==========
    ds.SeriesInstanceUID = series_uid
    ds.SeriesNumber = 1
    ds.SeriesDescription = "Apical 4-Chamber View (JPEG)"
    ds.Modality = "US"
    ds.BodyPartExamined = "HEART"

    # ========== General Equipment Module ==========
    ds.Manufacturer = "EchoPixel Medical"
    ds.ManufacturerModelName = "VirtualEcho Pro X1"
    ds.InstitutionName = "Seoul National University Hospital"

    # ========== General Image Module ==========
    ds.SOPClassUID = uid.UltrasoundMultiFrameImageStorage
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.InstanceNumber = 1
    ds.ContentDate = now.strftime("%Y%m%d")
    ds.ContentTime = now.strftime("%H%M%S")
    ds.ImageType = ["ORIGINAL", "PRIMARY", ""]
    ds.LossyImageCompression = "01"  # 손실 압축 사용
    ds.LossyImageCompressionRatio = "10"  # 대략적인 압축률
    ds.LossyImageCompressionMethod = "ISO_10918_1"  # JPEG

    # ========== Image Pixel Module ==========
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"  # Grayscale JPEG
    ds.NumberOfFrames = num_frames
    ds.Rows = rows
    ds.Columns = cols
    ds.BitsAllocated = 8
    ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelRepresentation = 0
    ds.PlanarConfiguration = 0

    # ========== Encapsulated Pixel Data ==========
    # JPEG 프레임들을 캡슐화
    # encapsulate() 함수가 Basic Offset Table과 함께 캡슐화해줌
    ds.PixelData = encapsulate(jpeg_frames)
    ds['PixelData'].is_undefined_length = True  # 캡슐화된 데이터는 undefined length

    # ========== Cine Module ==========
    ds.FrameTime = 1000.0 / frame_rate
    ds.FrameTimeVector = [1000.0 / frame_rate] * num_frames
    ds.RecommendedDisplayFrameRate = frame_rate
    ds.CineRate = frame_rate

    # ========== Multi-frame Module ==========
    ds.FrameIncrementPointer = (0x0018, 0x1063)

    # ========== US Region Calibration ==========
    ds.SequenceOfUltrasoundRegions = Sequence()
    region = Dataset()
    region.RegionSpatialFormat = 1
    region.RegionDataType = 1
    region.RegionFlags = 0
    region.RegionLocationMinX0 = 0
    region.RegionLocationMinY0 = 0
    region.RegionLocationMaxX1 = cols - 1
    region.RegionLocationMaxY1 = rows - 1
    region.PhysicalUnitsXDirection = 3
    region.PhysicalUnitsYDirection = 3
    region.PhysicalDeltaX = 0.028
    region.PhysicalDeltaY = 0.028
    ds.SequenceOfUltrasoundRegions.append(region)

    # ========== Cardiac Module ==========
    ds.HeartRate = heart_rate
    ds.CardiacNumberOfImages = num_frames

    # ========== VOI LUT ==========
    ds.WindowCenter = 128.0
    ds.WindowWidth = 256.0

    # ========== SOP Common ==========
    ds.SpecificCharacterSet = "ISO_IR 192"

    return ds


def generate_jpeg_dicom(
    output_dir: str,
    num_frames: int = 60,
    quality: int = 85,
    width: int = 640,
    height: int = 480,
    frame_rate: int = 30
) -> str:
    """
    JPEG Baseline 압축 DICOM 파일 생성

    Args:
        output_dir: 출력 폴더
        num_frames: 프레임 수
        quality: JPEG 품질 (1-100)
        width: 이미지 너비
        height: 이미지 높이
        frame_rate: 프레임 레이트

    Returns:
        생성된 파일 경로
    """
    os.makedirs(output_dir, exist_ok=True)

    study_uid = uid.generate_uid()
    series_uid = uid.generate_uid()

    print(f"JPEG Baseline DICOM 생성 시작...")
    print(f"  - Transfer Syntax: JPEG Baseline (Process 1)")
    print(f"  - Transfer Syntax UID: {JPEG_BASELINE_UID}")
    print(f"  - 출력 폴더: {output_dir}")
    print(f"  - 이미지 크기: {width}x{height}")
    print(f"  - 프레임 수: {num_frames}")
    print(f"  - JPEG 품질: {quality}")
    print(f"  - 프레임 레이트: {frame_rate} fps")
    print()

    print("프레임 생성 및 JPEG 인코딩 중...")
    jpeg_frames = []
    total_jpeg_size = 0

    for i in range(num_frames):
        # 프레임 생성
        frame = generate_echo_frame(width, height, i, num_frames)

        # JPEG 인코딩
        jpeg_data = encode_frame_as_jpeg(frame, quality=quality)
        jpeg_frames.append(jpeg_data)
        total_jpeg_size += len(jpeg_data)

        if (i + 1) % 20 == 0 or i == num_frames - 1:
            avg_size = total_jpeg_size / (i + 1) / 1024
            print(f"  프레임 {i+1}/{num_frames} - 평균 JPEG 크기: {avg_size:.1f} KB")

    print(f"\n총 JPEG 데이터 크기: {total_jpeg_size / (1024*1024):.2f} MB")

    # 비압축 대비 압축률 계산
    uncompressed_size = num_frames * width * height
    compression_ratio = uncompressed_size / total_jpeg_size
    print(f"압축률: {compression_ratio:.1f}:1 (비압축 대비)")

    print("\nDICOM 파일 생성 중...")
    ds = create_jpeg_dicom_dataset(
        jpeg_frames=jpeg_frames,
        rows=height,
        cols=width,
        series_uid=series_uid,
        study_uid=study_uid,
        heart_rate=72,
        frame_rate=frame_rate
    )

    filename = f"echo_4chamber_{num_frames}frames_jpeg.dcm"
    filepath = os.path.join(output_dir, filename)
    ds.save_as(filepath)

    file_size_mb = os.path.getsize(filepath) / (1024 * 1024)
    print(f"  저장됨: {filepath}")
    print(f"  파일 크기: {file_size_mb:.2f} MB")

    return filepath


def main():
    output_dir = "./output"
    num_frames = 60
    quality = 85

    if len(sys.argv) > 1:
        output_dir = sys.argv[1]
    if len(sys.argv) > 2:
        num_frames = int(sys.argv[2])
    if len(sys.argv) > 3:
        quality = int(sys.argv[3])

    # 품질 범위 검증
    quality = max(1, min(100, quality))

    filepath = generate_jpeg_dicom(
        output_dir=output_dir,
        num_frames=num_frames,
        quality=quality,
        width=640,
        height=480,
        frame_rate=30
    )

    print(f"\n완료! 생성된 파일: {filepath}")
    print("\n=== DICOM 정보 ===")
    print(f"Transfer Syntax: JPEG Baseline (Process 1)")
    print(f"Transfer Syntax UID: {JPEG_BASELINE_UID}")
    print(f"Photometric: MONOCHROME2")
    print(f"Bits Allocated: 8")


if __name__ == "__main__":
    main()
