"""
심장초음파 DICOM 파일 생성 스크립트 v2

더 현실적인 Apical 4-Chamber View를 시뮬레이션합니다.
- 좌심실 (LV), 우심실 (RV)
- 좌심방 (LA), 우심방 (RA)
- 승모판, 삼첨판
- 심실 중격

사용법:
    python generate_echo_dicom_v2.py [출력폴더] [프레임수]
"""

import os
import sys
import datetime
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from pydicom import Dataset, FileDataset, uid
from pydicom.sequence import Sequence


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

    # 가장자리 부드럽게
    from scipy.ndimage import gaussian_filter
    mask = gaussian_filter(mask, sigma=2)

    return mask


def generate_speckle_noise(width: int, height: int, intensity: float = 0.4) -> np.ndarray:
    """초음파 스페클 노이즈 생성"""
    # 다중 스케일 노이즈
    noise = np.zeros((height, width), dtype=np.float32)

    for scale in [1, 2, 4, 8]:
        h, w = height // scale, width // scale
        layer = np.random.rayleigh(0.5, (h, w))
        # 업스케일
        layer = np.repeat(np.repeat(layer, scale, axis=0), scale, axis=1)[:height, :width]
        noise += layer * (1.0 / scale)

    noise = noise / noise.max() * intensity
    return noise


def draw_heart_chamber(
    draw: ImageDraw.Draw,
    cx: int, cy: int,
    outer_rx: int, outer_ry: int,
    inner_rx: int, inner_ry: int,
    wall_brightness: int = 180,
    cavity_brightness: int = 15,
    wall_thickness: int = 12
):
    """심장 방 그리기 (벽 + 내강)"""
    # 외벽 (근육 - 밝음)
    draw.ellipse(
        [cx - outer_rx, cy - outer_ry, cx + outer_rx, cy + outer_ry],
        fill=wall_brightness
    )
    # 내강 (혈액 - 어두움)
    draw.ellipse(
        [cx - inner_rx, cy - inner_ry, cx + inner_rx, cy + inner_ry],
        fill=cavity_brightness
    )


def generate_4chamber_frame(
    width: int,
    height: int,
    frame: int,
    total_frames: int,
    heart_rate: int = 72
) -> np.ndarray:
    """
    Apical 4-Chamber View 프레임 생성

    해부학적 구조:
    - 상단: Apex (심첨부)
    - 하단 좌: LA (좌심방)
    - 하단 우: RA (우심방)
    - 중단 좌: LV (좌심실)
    - 중단 우: RV (우심실)
    """
    img = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(img)

    # 심장 주기 계산 (수축기/이완기)
    # 약 1/3이 수축기, 2/3가 이완기
    cycle = frame / total_frames
    phase = 2 * np.pi * cycle

    # 수축기 (systole): 심실 수축, 심방 이완
    # 이완기 (diastole): 심실 이완, 심방 수축
    systole_factor = (np.sin(phase) + 1) / 2  # 0~1 (1이 최대 수축)

    # 중심점들 정의
    apex_y = int(height * 0.12)  # 심첨부 (상단)
    base_y = int(height * 0.75)  # 기저부 (하단)
    mid_y = int(height * 0.45)   # 방실 경계

    center_x = width // 2

    # ===== 좌심실 (LV) - 좌측 =====
    lv_cx = center_x - int(width * 0.12)
    lv_cy = int(height * 0.35)

    # 수축에 따른 크기 변화
    lv_contraction = 0.18 * systole_factor
    lv_outer_rx = int(75 * (1 - lv_contraction * 0.3))
    lv_outer_ry = int(140 * (1 - lv_contraction * 0.2))
    lv_inner_rx = int(55 * (1 - lv_contraction))
    lv_inner_ry = int(115 * (1 - lv_contraction * 0.8))

    # LV 벽 그리기
    draw.ellipse(
        [lv_cx - lv_outer_rx, apex_y, lv_cx + lv_outer_rx, lv_cy + lv_outer_ry],
        fill=170
    )
    draw.ellipse(
        [lv_cx - lv_inner_rx, apex_y + 25, lv_cx + lv_inner_rx, lv_cy + lv_inner_ry],
        fill=12
    )

    # ===== 우심실 (RV) - 우측 =====
    rv_cx = center_x + int(width * 0.15)
    rv_cy = int(height * 0.32)

    rv_contraction = 0.12 * systole_factor
    rv_outer_rx = int(65 * (1 - rv_contraction * 0.3))
    rv_outer_ry = int(120 * (1 - rv_contraction * 0.2))
    rv_inner_rx = int(50 * (1 - rv_contraction))
    rv_inner_ry = int(100 * (1 - rv_contraction * 0.7))

    # RV는 LV보다 벽이 얇음
    draw.ellipse(
        [rv_cx - rv_outer_rx, apex_y + 15, rv_cx + rv_outer_rx, rv_cy + rv_outer_ry],
        fill=150
    )
    draw.ellipse(
        [rv_cx - rv_inner_rx, apex_y + 30, rv_cx + rv_inner_rx, rv_cy + rv_inner_ry],
        fill=15
    )

    # ===== 심실 중격 (IVS) =====
    septum_x = center_x
    draw.line(
        [(septum_x, apex_y + 20), (septum_x, mid_y - 10)],
        fill=190,
        width=18
    )

    # ===== 좌심방 (LA) - 하단 좌측 =====
    la_cx = center_x - int(width * 0.14)
    la_cy = int(height * 0.62)

    # 심방은 심실과 반대로 움직임
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

    # ===== 우심방 (RA) - 하단 우측 =====
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

    # ===== 심방 중격 (IAS) =====
    draw.line(
        [(septum_x, mid_y + 20), (septum_x, base_y - 30)],
        fill=160,
        width=10
    )

    # ===== 승모판 (Mitral Valve) =====
    mv_y = mid_y
    mv_x = lv_cx

    # 이완기에 열림, 수축기에 닫힘
    mv_opening = int(25 * (1 - systole_factor))

    # 전엽 (anterior leaflet)
    draw.polygon([
        (mv_x - 30, mv_y),
        (mv_x - 5, mv_y + mv_opening + 20),
        (mv_x + 5, mv_y)
    ], fill=200)

    # 후엽 (posterior leaflet)
    draw.polygon([
        (mv_x - 35, mv_y + 5),
        (mv_x - 15, mv_y + mv_opening + 10),
        (mv_x - 40, mv_y + 15)
    ], fill=190)

    # ===== 삼첨판 (Tricuspid Valve) =====
    tv_y = mid_y - 5
    tv_x = rv_cx - 15

    tv_opening = int(20 * (1 - systole_factor))

    draw.polygon([
        (tv_x - 20, tv_y),
        (tv_x, tv_y + tv_opening + 15),
        (tv_x + 15, tv_y)
    ], fill=180)

    # ===== 폐정맥 입구 (Pulmonary Veins) =====
    # LA 상단에 작은 어두운 원으로 표현
    pv_y = la_cy - la_ry - 5
    draw.ellipse([la_cx - 25, pv_y - 8, la_cx - 10, pv_y + 8], fill=25)
    draw.ellipse([la_cx + 10, pv_y - 8, la_cx + 25, pv_y + 8], fill=25)

    # 이미지를 numpy 배열로 변환
    heart = np.array(img, dtype=np.float32) / 255.0

    return heart


def apply_ultrasound_artifacts(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """초음파 아티팩트 적용"""
    height, width = image.shape

    # 1. TGC (Time Gain Compensation) - 깊이에 따른 밝기 보정
    y_coords = np.arange(height).reshape(-1, 1) / height
    tgc = 0.7 + 0.5 * y_coords  # 깊이가 깊을수록 약간 밝게
    image = image * tgc

    # 2. Lateral resolution 감소 (깊이에 따라)
    # 간단히 구현: 하단으로 갈수록 약간 흐리게

    # 3. 음향 그림자 효과 (강한 반사체 아래)
    # 여기서는 생략 (실제로는 뼈/석회화 아래에 나타남)

    # 4. 섹터 마스크 적용
    image = image * mask

    # 5. 전체 밝기/대비 조정
    image = np.clip(image * 1.2, 0, 1)

    return image


def generate_echo_frame_v2(
    width: int,
    height: int,
    frame: int,
    total_frames: int
) -> np.ndarray:
    """완성된 심초음파 프레임 생성"""

    # 섹터 마스크
    mask = create_sector_mask(width, height, angle_deg=75)

    # 배경 (검정 + 약간의 노이즈)
    background = np.ones((height, width), dtype=np.float32) * 0.02

    # 스페클 노이즈
    speckle = generate_speckle_noise(width, height, intensity=0.25)

    # 심장 구조
    heart = generate_4chamber_frame(width, height, frame, total_frames)

    # 조합
    image = background + speckle * 0.3 + heart * 0.85

    # 아티팩트 적용
    image = apply_ultrasound_artifacts(image, mask)

    # 클리핑 및 8비트 변환
    image = np.clip(image, 0, 1)
    image = (image * 255).astype(np.uint8)

    return image


def create_dicom_dataset(
    pixel_data: np.ndarray,
    series_uid: str,
    study_uid: str,
    heart_rate: int = 72,
    frame_rate: int = 30
) -> FileDataset:
    """DICOM 데이터셋 생성 - 풍부한 메타데이터 포함"""

    file_meta = Dataset()
    file_meta.MediaStorageSOPClassUID = uid.UltrasoundMultiFrameImageStorage
    file_meta.MediaStorageSOPInstanceUID = uid.generate_uid()
    file_meta.TransferSyntaxUID = uid.ExplicitVRLittleEndian
    file_meta.ImplementationClassUID = uid.generate_uid()
    file_meta.ImplementationVersionName = "EchoPixel_2.0"

    ds = FileDataset(
        filename_or_obj="",
        dataset={},
        file_meta=file_meta,
        preamble=b"\x00" * 128
    )

    now = datetime.datetime.now()
    num_frames, rows, cols = pixel_data.shape

    # ========== Patient Module ==========
    ds.PatientName = "Kim^Chul-Soo"
    ds.PatientID = "P20240117001"
    ds.PatientBirthDate = "19750315"
    ds.PatientSex = "M"
    ds.PatientAge = "050Y"
    ds.PatientWeight = "72.5"  # kg
    ds.PatientSize = "1.75"   # meters (height)
    ds.EthnicGroup = "Asian"
    ds.PatientComments = "Regular cardiac checkup"

    # ========== Study Module ==========
    ds.StudyInstanceUID = study_uid
    ds.StudyDate = now.strftime("%Y%m%d")
    ds.StudyTime = now.strftime("%H%M%S")
    ds.StudyID = "ECHO20240117"
    ds.AccessionNumber = "ACC2024011700001"
    ds.ReferringPhysicianName = "Park^Min-Joon^Dr"
    ds.StudyDescription = "Transthoracic Echocardiography - Complete"
    ds.NameOfPhysiciansReadingStudy = "Lee^Sung-Ho^Dr"
    ds.AdmittingDiagnosesDescription = "Routine cardiac evaluation"
    ds.PatientBodyMassIndex = "23.7"  # BMI (custom)

    # ========== Series Module ==========
    ds.SeriesInstanceUID = series_uid
    ds.SeriesNumber = 1
    ds.SeriesDescription = "Apical 4-Chamber View"
    ds.SeriesDate = now.strftime("%Y%m%d")
    ds.SeriesTime = now.strftime("%H%M%S")
    ds.Modality = "US"
    ds.BodyPartExamined = "HEART"
    ds.PatientPosition = "HFS"  # Head First Supine
    ds.Laterality = "L"  # Left (심장)
    ds.ProtocolName = "Adult TTE Protocol"
    ds.OperatorsName = "Cho^Eun-Ji"

    # ========== General Equipment Module ==========
    ds.Manufacturer = "EchoPixel Medical"
    ds.ManufacturerModelName = "VirtualEcho Pro X1"
    ds.InstitutionName = "Seoul National University Hospital"
    ds.InstitutionAddress = "101 Daehak-ro, Jongno-gu, Seoul, Korea"
    ds.StationName = "ECHO-ROOM-3"
    ds.InstitutionalDepartmentName = "Cardiology"
    ds.DeviceSerialNumber = "EP2024-001234"
    ds.SoftwareVersions = ["2.0.0", "DicomLib 1.5"]
    ds.DateOfLastCalibration = now.strftime("%Y%m%d")
    ds.TimeOfLastCalibration = "080000"

    # ========== Frame of Reference Module ==========
    ds.FrameOfReferenceUID = uid.generate_uid()
    ds.PositionReferenceIndicator = "APEX"

    # ========== General Image Module ==========
    ds.SOPClassUID = uid.UltrasoundMultiFrameImageStorage
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.InstanceNumber = 1
    ds.ContentDate = now.strftime("%Y%m%d")
    ds.ContentTime = now.strftime("%H%M%S.%f")[:13]
    ds.ImageType = ["ORIGINAL", "PRIMARY", ""]
    ds.AcquisitionDate = now.strftime("%Y%m%d")
    ds.AcquisitionTime = now.strftime("%H%M%S")
    ds.AcquisitionNumber = 1
    ds.InstanceCreationDate = now.strftime("%Y%m%d")
    ds.InstanceCreationTime = now.strftime("%H%M%S")
    ds.ImageComments = "4-Chamber view acquired at rest"
    ds.BurnedInAnnotation = "NO"
    ds.LossyImageCompression = "00"
    ds.PresentationLUTShape = "IDENTITY"

    # ========== Image Pixel Module ==========
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
    ds.PixelAspectRatio = [1, 1]
    ds.PixelData = pixel_data.tobytes()

    # ========== Cine Module ==========
    ds.FrameTime = 1000.0 / frame_rate  # ms per frame
    ds.FrameTimeVector = [1000.0 / frame_rate] * num_frames
    ds.StartTrim = 1
    ds.StopTrim = num_frames
    ds.RecommendedDisplayFrameRate = frame_rate
    ds.CineRate = frame_rate
    ds.FrameDelay = 0.0
    ds.EffectiveDuration = num_frames / frame_rate  # seconds
    ds.ActualFrameDuration = int(1000000 / frame_rate)  # microseconds

    # ========== Multi-frame Module ==========
    ds.NumberOfFrames = num_frames
    ds.FrameIncrementPointer = (0x0018, 0x1063)  # Frame Time

    # ========== US Image Module ==========
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = 8
    ds.BitsStored = 8
    ds.HighBit = 7

    # ========== US Region Calibration Module ==========
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
    region.PhysicalDeltaX = 0.028  # 0.28mm per pixel
    region.PhysicalDeltaY = 0.028
    region.ReferencePixelX0 = cols // 2
    region.ReferencePixelY0 = 0
    region.ReferencePixelPhysicalValueX = 0.0
    region.ReferencePixelPhysicalValueY = 0.0
    ds.SequenceOfUltrasoundRegions.append(region)

    # ========== Cardiac Module ==========
    ds.HeartRate = heart_rate
    ds.CardiacNumberOfImages = num_frames
    ds.IntervalsAcquired = num_frames
    ds.IntervalsRejected = 0
    ds.BeatRejectionFlag = "N"
    ds.TriggerTime = 0.0
    ds.TriggerWindow = 100  # ms
    ds.NominalInterval = int(60000 / heart_rate)  # RR interval in ms
    ds.LowRRValue = int(60000 / (heart_rate + 10))
    ds.HighRRValue = int(60000 / (heart_rate - 10))

    # ========== Acquisition Context Module ==========
    ds.AcquisitionContextSequence = Sequence()

    # Image View 정보
    acq_context1 = Dataset()
    acq_context1.ValueType = "CODE"
    acq_concept1 = Dataset()
    acq_concept1.CodeValue = "399098009"
    acq_concept1.CodingSchemeDesignator = "SCT"
    acq_concept1.CodeMeaning = "Apical 4-chamber view"
    acq_context1.ConceptNameCodeSequence = Sequence([acq_concept1])
    ds.AcquisitionContextSequence.append(acq_context1)

    # ========== VOI LUT Module ==========
    ds.WindowCenter = 128.0
    ds.WindowWidth = 256.0
    ds.WindowCenterWidthExplanation = "Default Window"

    # ========== SOP Common Module ==========
    ds.SpecificCharacterSet = "ISO_IR 192"  # UTF-8
    ds.InstanceCreatorUID = uid.generate_uid()
    ds.TimezoneOffsetFromUTC = "+0900"

    # ========== Additional US Specific Attributes ==========
    ds.TransducerType = "PHASED ARRAY"
    ds.DepthOfScanField = 180  # mm
    ds.MechanicalIndex = "0.8"
    ds.BoneThermalIndex = "0.5"
    ds.SoftTissueThermalIndex = "0.6"

    # ========== Performed Procedure Step Module ==========
    ds.PerformedProcedureStepStartDate = now.strftime("%Y%m%d")
    ds.PerformedProcedureStepStartTime = now.strftime("%H%M%S")
    ds.PerformedProcedureStepID = "PPS001"
    ds.PerformedProcedureStepDescription = "Transthoracic Echocardiogram"

    return ds


def generate_echo_dicom_v2(
    output_dir: str,
    target_size_mb: float = 20.0,
    width: int = 640,
    height: int = 480,
    frame_rate: int = 30
) -> str:
    """
    목표 크기에 맞는 DICOM 파일 생성
    """
    os.makedirs(output_dir, exist_ok=True)

    # 프레임 수 계산 (목표 크기 기준)
    bytes_per_frame = width * height  # 8bit
    target_bytes = target_size_mb * 1024 * 1024
    num_frames = int(target_bytes / bytes_per_frame)

    # 심장 주기에 맞게 조정 (약 1초에 1 cycle, 72bpm 기준)
    # 30fps * 2.5초 = 75프레임 (약 3 심장주기)
    # 최소 1 cycle은 보장
    cycles = max(1, num_frames // (frame_rate * 60 // 72))
    num_frames = max(num_frames, frame_rate)  # 최소 1초

    study_uid = uid.generate_uid()
    series_uid = uid.generate_uid()

    print(f"심초음파 4-Chamber DICOM 생성 시작...")
    print(f"  - 출력 폴더: {output_dir}")
    print(f"  - 목표 크기: {target_size_mb:.1f} MB")
    print(f"  - 이미지 크기: {width}x{height}")
    print(f"  - 프레임 수: {num_frames}")
    print(f"  - 프레임 레이트: {frame_rate} fps")
    print(f"  - 예상 재생시간: {num_frames/frame_rate:.1f}초")
    print()

    print("프레임 생성 중...")
    frames = []
    for i in range(num_frames):
        frame = generate_echo_frame_v2(width, height, i, num_frames)
        frames.append(frame)

        if (i + 1) % 20 == 0 or i == num_frames - 1:
            print(f"  프레임 {i+1}/{num_frames} 생성 완료")

    pixel_data = np.stack(frames, axis=0)

    print("\nDICOM 파일 생성 중...")
    ds = create_dicom_dataset(
        pixel_data=pixel_data,
        series_uid=series_uid,
        study_uid=study_uid,
        heart_rate=72,
        frame_rate=frame_rate
    )

    filename = f"echo_4chamber_{num_frames}frames.dcm"
    filepath = os.path.join(output_dir, filename)
    ds.save_as(filepath)

    file_size_mb = os.path.getsize(filepath) / (1024 * 1024)
    print(f"  저장됨: {filepath}")
    print(f"  실제 크기: {file_size_mb:.2f} MB")

    return filepath


def main():
    output_dir = "./output"
    target_size_mb = 20.0

    if len(sys.argv) > 1:
        output_dir = sys.argv[1]
    if len(sys.argv) > 2:
        target_size_mb = float(sys.argv[2])

    filepath = generate_echo_dicom_v2(
        output_dir=output_dir,
        target_size_mb=target_size_mb,
        width=640,
        height=480,
        frame_rate=30
    )

    print(f"\n완료! 생성된 파일: {filepath}")


if __name__ == "__main__":
    main()
