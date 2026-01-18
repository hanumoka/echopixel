"""
사실적인 심초음파 DICOM 파일 생성 스크립트 v3 (Realistic)

실제 심초음파 영상과 유사한 특성을 시뮬레이션합니다:
- 사실적인 해부학적 구조 (Apical 4-Chamber View)
- 조직별 에코 특성 (심근, 판막, 혈액)
- 멀티스케일 스페클 노이즈
- Color Doppler Flow 오버레이
- 초음파 아티팩트 (TGC, lateral resolution, shadowing)
- UI 오버레이 (파라미터, 스케일바, 컬러바)

사용법:
    python generate_echo_dicom_realistic.py [출력폴더] [프레임수] [품질]

예시:
    python generate_echo_dicom_realistic.py ./output 90 90
"""

import os
import sys
import io
import datetime
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import gaussian_filter, map_coordinates
from scipy.interpolate import splprep, splev

from pydicom import Dataset, FileDataset, uid
from pydicom.sequence import Sequence
from pydicom.encaps import encapsulate


# Transfer Syntax UIDs
JPEG_BASELINE_UID = "1.2.840.10008.1.2.4.50"
EXPLICIT_VR_LE_UID = "1.2.840.10008.1.2.1"


# =============================================================================
# 해부학적 구조 정의 (Apical 4-Chamber View)
# =============================================================================

class CardiacAnatomy:
    """
    심장 해부학적 구조 정의

    Apical 4-Chamber View에서 보이는 구조:
    - 상단: Apex (심첨부) - 트랜스듀서 위치
    - LV (좌심실) - 좌측
    - RV (우심실) - 우측
    - LA (좌심방) - 하단 좌측
    - RA (우심방) - 하단 우측
    - IVS (심실중격) - 중앙
    - MV (승모판) - LV와 LA 사이
    - TV (삼첨판) - RV와 RA 사이
    """

    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.cx = width // 2  # 중심 X

        # 섹터 영역 정의
        self.apex_y = int(height * 0.08)  # 심첨부 (상단)
        self.base_y = int(height * 0.82)  # 기저부 (하단)
        self.mid_y = int(height * 0.48)   # 방실 경계

    def get_lv_contour(self, systole_factor: float) -> tuple:
        """좌심실 외곽선 (수축 상태에 따라 변화)"""
        # 수축 시 내강 감소
        contraction = 0.22 * systole_factor

        # 외벽 (심근)
        outer_rx = int(self.width * 0.14 * (1 - contraction * 0.15))
        outer_ry = int(self.height * 0.32 * (1 - contraction * 0.1))

        # 내강 (혈액)
        inner_rx = int(self.width * 0.10 * (1 - contraction * 0.4))
        inner_ry = int(self.height * 0.26 * (1 - contraction * 0.35))

        cx = self.cx - int(self.width * 0.08)
        cy = int(self.height * 0.30)

        return {
            'center': (cx, cy),
            'outer': (outer_rx, outer_ry),
            'inner': (inner_rx, inner_ry),
            'apex_y': self.apex_y + 15,
            'wall_thickness': outer_rx - inner_rx
        }

    def get_rv_contour(self, systole_factor: float) -> tuple:
        """우심실 외곽선"""
        contraction = 0.15 * systole_factor

        outer_rx = int(self.width * 0.11 * (1 - contraction * 0.15))
        outer_ry = int(self.height * 0.28 * (1 - contraction * 0.1))
        inner_rx = int(self.width * 0.08 * (1 - contraction * 0.35))
        inner_ry = int(self.height * 0.23 * (1 - contraction * 0.3))

        cx = self.cx + int(self.width * 0.12)
        cy = int(self.height * 0.28)

        return {
            'center': (cx, cy),
            'outer': (outer_rx, outer_ry),
            'inner': (inner_rx, inner_ry),
            'apex_y': self.apex_y + 25,
            'wall_thickness': outer_rx - inner_rx
        }

    def get_la_contour(self, systole_factor: float) -> tuple:
        """좌심방 외곽선 (심실 수축 시 확장)"""
        expansion = 0.12 * systole_factor

        rx = int(self.width * 0.12 * (1 + expansion))
        ry = int(self.height * 0.12 * (1 + expansion))

        cx = self.cx - int(self.width * 0.10)
        cy = int(self.height * 0.65)

        return {
            'center': (cx, cy),
            'radius': (rx, ry),
            'wall_thickness': int(self.width * 0.015)
        }

    def get_ra_contour(self, systole_factor: float) -> tuple:
        """우심방 외곽선"""
        expansion = 0.10 * systole_factor

        rx = int(self.width * 0.10 * (1 + expansion))
        ry = int(self.height * 0.11 * (1 + expansion))

        cx = self.cx + int(self.width * 0.12)
        cy = int(self.height * 0.63)

        return {
            'center': (cx, cy),
            'radius': (rx, ry),
            'wall_thickness': int(self.width * 0.012)
        }

    def get_mitral_valve(self, systole_factor: float) -> dict:
        """승모판 위치 및 상태"""
        # 이완기에 열림 (systole_factor가 낮을 때)
        opening = int(30 * (1 - systole_factor))

        return {
            'position': (self.cx - int(self.width * 0.08), self.mid_y),
            'opening': opening,
            'leaflet_length': 35
        }

    def get_tricuspid_valve(self, systole_factor: float) -> dict:
        """삼첨판 위치 및 상태"""
        opening = int(25 * (1 - systole_factor))

        return {
            'position': (self.cx + int(self.width * 0.10), self.mid_y - 5),
            'opening': opening,
            'leaflet_length': 30
        }


# =============================================================================
# 스페클 노이즈 생성
# =============================================================================

def generate_realistic_speckle(width: int, height: int, seed: int = None) -> np.ndarray:
    """
    사실적인 초음파 스페클 패턴 생성

    실제 초음파 스페클의 특성:
    - Rayleigh 분포를 따르는 밝기
    - 공간적 상관관계 (correlation)
    - 깊이에 따른 패턴 변화
    """
    if seed is not None:
        np.random.seed(seed)

    # 다중 스케일 스페클
    speckle = np.zeros((height, width), dtype=np.float32)

    # 미세 스페클 (고주파)
    fine = np.random.rayleigh(0.6, (height, width))
    fine = gaussian_filter(fine, sigma=0.8)

    # 중간 스페클
    h2, w2 = height // 2, width // 2
    medium = np.random.rayleigh(0.5, (h2, w2))
    medium = gaussian_filter(medium, sigma=1.2)
    medium = np.repeat(np.repeat(medium, 2, axis=0), 2, axis=1)[:height, :width]

    # 거친 스페클 (저주파)
    h4, w4 = height // 4, width // 4
    coarse = np.random.rayleigh(0.4, (h4, w4))
    coarse = gaussian_filter(coarse, sigma=1.5)
    coarse = np.repeat(np.repeat(coarse, 4, axis=0), 4, axis=1)[:height, :width]

    # 조합
    speckle = fine * 0.5 + medium * 0.35 + coarse * 0.15

    # 깊이에 따른 변조 (깊을수록 스페클이 더 거침)
    depth_factor = np.linspace(0.8, 1.2, height).reshape(-1, 1)
    speckle = speckle * depth_factor

    # 정규화
    speckle = (speckle - speckle.min()) / (speckle.max() - speckle.min() + 1e-8)

    return speckle


def generate_tissue_texture(width: int, height: int, texture_type: str = 'myocardium') -> np.ndarray:
    """
    조직별 텍스처 패턴 생성

    texture_type:
    - 'myocardium': 심근 (밝은 에코, 섬유 방향성)
    - 'blood': 혈액 (어두움, 약간의 에코)
    - 'valve': 판막 (매우 밝음)
    - 'pericardium': 심낭 (매우 밝은 선)
    """
    if texture_type == 'myocardium':
        # 심근: 섬유 방향을 따른 텍스처
        base = np.random.rayleigh(0.5, (height, width))
        # 방향성 있는 블러
        texture = gaussian_filter(base, sigma=(2, 0.5))
        intensity = 0.6

    elif texture_type == 'blood':
        # 혈액: 매우 어둡지만 완전히 검지 않음
        base = np.random.exponential(0.1, (height, width))
        texture = gaussian_filter(base, sigma=1.5)
        intensity = 0.08

    elif texture_type == 'valve':
        # 판막: 매우 밝고 균일
        base = np.random.normal(0.9, 0.05, (height, width))
        texture = gaussian_filter(base, sigma=0.5)
        intensity = 0.95

    elif texture_type == 'pericardium':
        # 심낭: 밝은 선
        base = np.random.normal(0.85, 0.08, (height, width))
        texture = gaussian_filter(base, sigma=(0.3, 1.5))
        intensity = 0.9

    else:
        texture = np.ones((height, width)) * 0.5
        intensity = 0.5

    texture = np.clip(texture, 0, 1) * intensity
    return texture


# =============================================================================
# 초음파 섹터 및 아티팩트
# =============================================================================

def create_sector_geometry(width: int, height: int, angle_deg: float = 75) -> dict:
    """
    초음파 섹터 기하학 생성

    Returns:
        dict: mask, distance_map, angle_map
    """
    cx = width // 2
    cy = int(height * 0.02)

    y, x = np.ogrid[:height, :width]

    # 각도 계산
    angles = np.arctan2(x - cx, y - cy)
    angle_rad = np.deg2rad(angle_deg / 2)

    # 거리 계산
    distances = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    max_dist = height * 0.92
    min_dist = height * 0.03

    # 섹터 마스크
    in_sector = np.abs(angles) <= angle_rad
    in_range = (distances >= min_dist) & (distances <= max_dist)
    mask = (in_sector & in_range).astype(np.float32)

    # 가장자리 부드럽게
    mask = gaussian_filter(mask, sigma=2)

    # 정규화된 거리 맵 (TGC용)
    distance_map = (distances - min_dist) / (max_dist - min_dist)
    distance_map = np.clip(distance_map, 0, 1)

    # 각도 맵 (lateral resolution용)
    angle_map = np.abs(angles) / angle_rad
    angle_map = np.clip(angle_map, 0, 1)

    return {
        'mask': mask,
        'distance_map': distance_map,
        'angle_map': angle_map,
        'center': (cx, cy),
        'max_dist': max_dist
    }


def apply_tgc(image: np.ndarray, distance_map: np.ndarray) -> np.ndarray:
    """
    Time Gain Compensation (TGC) 적용

    깊이에 따른 초음파 감쇠를 보상
    """
    # 실제 TGC 곡선 시뮬레이션
    # 가까운 곳은 약간 억제, 중간은 정상, 깊은 곳은 증폭
    tgc_curve = 0.7 + 0.6 * distance_map + 0.1 * np.sin(distance_map * np.pi)

    return image * tgc_curve


def apply_lateral_blur(image: np.ndarray, distance_map: np.ndarray) -> np.ndarray:
    """
    깊이에 따른 lateral resolution 감소 시뮬레이션

    깊을수록 빔이 퍼져서 해상도가 떨어짐
    """
    result = image.copy()

    # 깊이 구간별로 다른 블러 적용
    for depth_start in np.arange(0.3, 1.0, 0.1):
        depth_end = depth_start + 0.15
        depth_mask = ((distance_map >= depth_start) & (distance_map < depth_end)).astype(np.float32)

        if np.sum(depth_mask) > 0:
            blur_sigma = 0.5 + depth_start * 1.5
            blurred = gaussian_filter(image, sigma=(0, blur_sigma))
            result = result * (1 - depth_mask) + blurred * depth_mask

    return result


# =============================================================================
# Color Doppler Flow
# =============================================================================

def generate_color_doppler_flow(
    width: int,
    height: int,
    anatomy: CardiacAnatomy,
    systole_factor: float,
    frame_phase: float
) -> np.ndarray:
    """
    Color Doppler Flow Map 생성

    RGB 이미지로 반환:
    - 빨간색: 트랜스듀서 방향으로 오는 혈류 (toward)
    - 파란색: 트랜스듀서에서 멀어지는 혈류 (away)
    - 검정색: 혈류 없음

    심장 주기에 따른 혈류:
    - 이완기: 심방 → 심실 (승모판/삼첨판 통과)
    - 수축기: 심실 → 대동맥/폐동맥
    """
    # RGB 이미지 초기화
    flow_rgb = np.zeros((height, width, 3), dtype=np.float32)

    # 이완기 (diastole) - systole_factor가 낮을 때
    # 혈액이 심방에서 심실로 이동 (away from transducer = blue)
    diastole_factor = 1 - systole_factor

    # 수축기 (systole) - systole_factor가 높을 때
    # 혈액이 심실에서 나감

    # 승모판 영역 (이완기에 혈류)
    mv = anatomy.get_mitral_valve(systole_factor)
    mv_x, mv_y = mv['position']

    if diastole_factor > 0.3:  # 이완기
        # E파, A파 시뮬레이션
        e_wave = np.sin(frame_phase * 2 * np.pi) * 0.5 + 0.5
        flow_intensity = diastole_factor * e_wave

        # 승모판 통과 혈류 영역
        y, x = np.ogrid[:height, :width]
        mv_dist = np.sqrt((x - mv_x) ** 2 + (y - mv_y) ** 2)
        mv_mask = (mv_dist < 50) & (y > mv_y - 30) & (y < mv_y + 60)

        # 파란색 (away) - 심방에서 심실로
        flow_rgb[mv_mask, 2] = np.clip(flow_intensity * 0.9, 0, 1)  # Blue
        # 약간의 aliasing 효과 (속도가 빠르면 색상 반전)
        fast_flow = mv_mask & (mv_dist < 20)
        flow_rgb[fast_flow, 0] = np.clip(flow_intensity * 0.3, 0, 1)  # Red tint

    # 삼첨판 영역
    tv = anatomy.get_tricuspid_valve(systole_factor)
    tv_x, tv_y = tv['position']

    if diastole_factor > 0.3:
        y, x = np.ogrid[:height, :width]
        tv_dist = np.sqrt((x - tv_x) ** 2 + (y - tv_y) ** 2)
        tv_mask = (tv_dist < 40) & (y > tv_y - 25) & (y < tv_y + 50)

        flow_rgb[tv_mask, 2] = np.clip(diastole_factor * 0.7, 0, 1)  # Blue

    # 수축기 역류 (만약 있다면 - VSD 등)
    # 여기서는 정상 심장으로 가정하여 최소한의 역류만 표시

    # 노이즈 추가 (Color Doppler 특유의 노이즈)
    noise = np.random.normal(0, 0.05, flow_rgb.shape)
    flow_rgb = flow_rgb + noise

    # 클리핑
    flow_rgb = np.clip(flow_rgb, 0, 1)

    return flow_rgb


# =============================================================================
# 프레임 생성
# =============================================================================

def draw_heart_structure(
    image: np.ndarray,
    anatomy: CardiacAnatomy,
    systole_factor: float
) -> np.ndarray:
    """심장 구조를 이미지에 그리기"""

    height, width = image.shape
    result = image.copy()

    # PIL Image로 변환하여 그리기
    img_pil = Image.fromarray((result * 255).astype(np.uint8), mode='L')
    draw = ImageDraw.Draw(img_pil)

    # ===== 좌심실 (LV) =====
    lv = anatomy.get_lv_contour(systole_factor)
    lv_cx, lv_cy = lv['center']
    lv_orx, lv_ory = lv['outer']
    lv_irx, lv_iry = lv['inner']
    apex_y = lv['apex_y']

    # LV 외벽 (심근)
    draw.ellipse(
        [lv_cx - lv_orx, apex_y, lv_cx + lv_orx, lv_cy + lv_ory],
        fill=145  # 심근 밝기
    )
    # LV 내강 (혈액)
    draw.ellipse(
        [lv_cx - lv_irx, apex_y + 20, lv_cx + lv_irx, lv_cy + lv_iry],
        fill=15  # 혈액 (어두움)
    )

    # ===== 우심실 (RV) =====
    rv = anatomy.get_rv_contour(systole_factor)
    rv_cx, rv_cy = rv['center']
    rv_orx, rv_ory = rv['outer']
    rv_irx, rv_iry = rv['inner']
    rv_apex_y = rv['apex_y']

    # RV 외벽 (더 얇음)
    draw.ellipse(
        [rv_cx - rv_orx, rv_apex_y, rv_cx + rv_orx, rv_cy + rv_ory],
        fill=125
    )
    # RV 내강
    draw.ellipse(
        [rv_cx - rv_irx, rv_apex_y + 15, rv_cx + rv_irx, rv_cy + rv_iry],
        fill=18
    )

    # ===== 심실 중격 (IVS) =====
    septum_x = anatomy.cx - int(width * 0.02)
    draw.line(
        [(septum_x, apex_y + 15), (septum_x, anatomy.mid_y - 10)],
        fill=165,  # 중격은 좀 더 밝음
        width=20
    )

    # ===== 좌심방 (LA) =====
    la = anatomy.get_la_contour(systole_factor)
    la_cx, la_cy = la['center']
    la_rx, la_ry = la['radius']
    la_wall = la['wall_thickness']

    # LA 외벽
    draw.ellipse(
        [la_cx - la_rx - la_wall, la_cy - la_ry - la_wall,
         la_cx + la_rx + la_wall, la_cy + la_ry + la_wall],
        fill=120
    )
    # LA 내강
    draw.ellipse(
        [la_cx - la_rx, la_cy - la_ry, la_cx + la_rx, la_cy + la_ry],
        fill=20
    )

    # ===== 우심방 (RA) =====
    ra = anatomy.get_ra_contour(systole_factor)
    ra_cx, ra_cy = ra['center']
    ra_rx, ra_ry = ra['radius']
    ra_wall = ra['wall_thickness']

    draw.ellipse(
        [ra_cx - ra_rx - ra_wall, ra_cy - ra_ry - ra_wall,
         ra_cx + ra_rx + ra_wall, ra_cy + ra_ry + ra_wall],
        fill=110
    )
    draw.ellipse(
        [ra_cx - ra_rx, ra_cy - ra_ry, ra_cx + ra_rx, ra_cy + ra_ry],
        fill=22
    )

    # ===== 심방 중격 (IAS) =====
    draw.line(
        [(anatomy.cx, anatomy.mid_y + 15), (anatomy.cx, int(height * 0.75))],
        fill=140,
        width=12
    )

    # ===== 승모판 (MV) =====
    mv = anatomy.get_mitral_valve(systole_factor)
    mv_x, mv_y = mv['position']
    mv_opening = mv['opening']
    mv_len = mv['leaflet_length']

    # 전엽 (anterior leaflet)
    draw.polygon([
        (mv_x - 25, mv_y - 5),
        (mv_x, mv_y + mv_opening + mv_len - 10),
        (mv_x + 10, mv_y - 5)
    ], fill=210)

    # 후엽 (posterior leaflet)
    draw.polygon([
        (mv_x - 30, mv_y),
        (mv_x - 10, mv_y + mv_opening + mv_len - 20),
        (mv_x - 35, mv_y + 10)
    ], fill=195)

    # ===== 삼첨판 (TV) =====
    tv = anatomy.get_tricuspid_valve(systole_factor)
    tv_x, tv_y = tv['position']
    tv_opening = tv['opening']
    tv_len = tv['leaflet_length']

    draw.polygon([
        (tv_x - 20, tv_y - 3),
        (tv_x, tv_y + tv_opening + tv_len - 15),
        (tv_x + 15, tv_y - 3)
    ], fill=190)

    # numpy 배열로 변환
    result = np.array(img_pil, dtype=np.float32) / 255.0

    return result


def generate_realistic_frame(
    width: int,
    height: int,
    frame: int,
    total_frames: int,
    include_color_doppler: bool = True,
    speckle_seed: int = None
) -> np.ndarray:
    """
    사실적인 심초음파 프레임 생성

    Returns:
        RGB numpy array (H, W, 3), uint8
    """
    # 해부학 구조 초기화
    anatomy = CardiacAnatomy(width, height)

    # 심장 주기 계산
    cycle = frame / total_frames
    phase = 2 * np.pi * cycle
    systole_factor = (np.sin(phase) + 1) / 2  # 0~1

    # 섹터 기하학
    sector = create_sector_geometry(width, height, angle_deg=72)

    # 1. 배경 (검정)
    image = np.zeros((height, width), dtype=np.float32)

    # 2. 스페클 노이즈 기반
    if speckle_seed is not None:
        seed = speckle_seed + frame
    else:
        seed = None
    speckle = generate_realistic_speckle(width, height, seed=seed)
    image = speckle * 0.15  # 배경 스페클

    # 3. 심장 구조 그리기
    heart = draw_heart_structure(image, anatomy, systole_factor)

    # 4. 심장 구조 + 스페클 조합
    # 심장 영역에는 더 강한 스페클
    heart_speckle = generate_realistic_speckle(width, height, seed=seed + 1000 if seed else None)
    image = heart * (0.85 + heart_speckle * 0.25)

    # 5. TGC 적용
    image = apply_tgc(image, sector['distance_map'])

    # 6. Lateral blur
    image = apply_lateral_blur(image, sector['distance_map'])

    # 7. 섹터 마스크 적용
    image = image * sector['mask']

    # 8. 최종 조정
    image = np.clip(image, 0, 1)

    # RGB로 변환
    if include_color_doppler:
        # Color Doppler 생성
        doppler = generate_color_doppler_flow(
            width, height, anatomy, systole_factor, cycle
        )

        # 그레이스케일을 RGB로
        image_rgb = np.stack([image, image, image], axis=-1)

        # Doppler 오버레이 (심장 내강 영역에만)
        # 마스크: 어두운 영역 (혈액)에만 Color Doppler
        blood_mask = (heart < 0.1)[:, :, np.newaxis]

        # 색상 합성
        image_rgb = np.where(
            blood_mask & (doppler > 0.05),
            doppler * 0.8 + image_rgb * 0.2,
            image_rgb
        )

        image_rgb = np.clip(image_rgb, 0, 1)
        image_rgb = (image_rgb * 255).astype(np.uint8)

    else:
        # 그레이스케일만
        image = (image * 255).astype(np.uint8)
        image_rgb = np.stack([image, image, image], axis=-1)

    return image_rgb


# =============================================================================
# UI 오버레이
# =============================================================================

def add_ui_overlay(
    image: np.ndarray,
    frame: int,
    total_frames: int,
    heart_rate: int = 72,
    depth_cm: float = 16.0
) -> np.ndarray:
    """
    UI 오버레이 추가

    - 좌측: 스캔 파라미터
    - 우측: Color bar
    - 하단: 스케일
    """
    height, width = image.shape[:2]

    # PIL Image로 변환
    img_pil = Image.fromarray(image)
    draw = ImageDraw.Draw(img_pil)

    # 기본 폰트 (시스템 폰트 사용 시도, 실패시 기본)
    try:
        font_small = ImageFont.truetype("arial.ttf", 11)
        font_medium = ImageFont.truetype("arial.ttf", 13)
    except:
        font_small = ImageFont.load_default()
        font_medium = font_small

    text_color = (200, 200, 200)  # 밝은 회색

    # ===== 좌측 상단: 스캔 파라미터 =====
    left_x = 10
    top_y = 10
    line_height = 16

    params = [
        "S9-2",
        "32Hz",
        f"{depth_cm:.1f}cm",
        "",
        "2D",
        " 53%",
        " C 46",
        " P Off",
        " HGen",
        "",
        "CF",
        " 40%",
        " 7920Hz",
        " WF 792Hz",
        " 3.3MHz"
    ]

    for i, text in enumerate(params):
        draw.text((left_x, top_y + i * line_height), text, fill=text_color, font=font_small)

    # ===== 우측 상단: Color velocity bar =====
    bar_x = width - 40
    bar_y = 30
    bar_height = 120
    bar_width = 15

    # 그라데이션 컬러바
    for i in range(bar_height):
        ratio = i / bar_height
        if ratio < 0.5:
            # 상단: 빨간색 → 검정
            r = int(255 * (1 - ratio * 2))
            b = 0
        else:
            # 하단: 검정 → 파란색
            r = 0
            b = int(255 * (ratio - 0.5) * 2)

        draw.line([(bar_x, bar_y + i), (bar_x + bar_width, bar_y + i)], fill=(r, 0, b))

    # 속도 라벨
    draw.text((bar_x - 5, bar_y - 15), "+92.4", fill=text_color, font=font_small)
    draw.text((bar_x + 2, bar_y + bar_height // 2 - 5), "0", fill=text_color, font=font_small)
    draw.text((bar_x - 5, bar_y + bar_height + 2), "-92.4", fill=text_color, font=font_small)
    draw.text((bar_x - 5, bar_y + bar_height + 14), "cm/s", fill=text_color, font=font_small)

    # ===== 우측 상단: 기타 정보 =====
    draw.text((width - 90, 10), "TIS2.0", fill=text_color, font=font_small)
    draw.text((width - 90, 24), f"MI 1.2", fill=text_color, font=font_small)

    # ===== 하단: 스케일 바 =====
    scale_y = height - 30
    scale_x = width // 2 - 50
    scale_length = 100  # pixels

    # 스케일 선
    draw.line([(scale_x, scale_y), (scale_x + scale_length, scale_y)], fill=text_color, width=2)
    draw.line([(scale_x, scale_y - 5), (scale_x, scale_y + 5)], fill=text_color, width=1)
    draw.line([(scale_x + scale_length, scale_y - 5), (scale_x + scale_length, scale_y + 5)], fill=text_color, width=1)

    # 스케일 라벨 (예: 2cm)
    draw.text((scale_x + scale_length // 2 - 10, scale_y + 5), "2 cm", fill=text_color, font=font_small)

    # ===== 프레임 표시 =====
    frame_time = frame / 30.0  # 30fps 가정
    # draw.text((width - 80, height - 30), f"{frame_time:.2f}s", fill=text_color, font=font_small)

    return np.array(img_pil)


# =============================================================================
# 섹터 프레임 (흰색 테두리)
# =============================================================================

def add_sector_frame(image: np.ndarray, angle_deg: float = 72) -> np.ndarray:
    """섹터 영역에 흰색 테두리 추가"""
    height, width = image.shape[:2]

    img_pil = Image.fromarray(image)
    draw = ImageDraw.Draw(img_pil)

    cx = width // 2
    cy = int(height * 0.02)
    radius = int(height * 0.92)

    angle_rad = np.deg2rad(angle_deg / 2)

    # 좌측 선
    x1 = cx + int(radius * np.sin(-angle_rad))
    y1 = cy + int(radius * np.cos(-angle_rad))
    draw.line([(cx, cy + 5), (x1, y1)], fill=(255, 255, 255), width=2)

    # 우측 선
    x2 = cx + int(radius * np.sin(angle_rad))
    y2 = cy + int(radius * np.cos(angle_rad))
    draw.line([(cx, cy + 5), (x2, y2)], fill=(255, 255, 255), width=2)

    # 하단 호 (arc)
    # PIL의 arc는 각도 단위가 다름
    start_angle = 90 - angle_deg / 2
    end_angle = 90 + angle_deg / 2
    bbox = [cx - radius, cy - radius, cx + radius, cy + radius]
    draw.arc(bbox, start_angle, end_angle, fill=(255, 255, 255), width=2)

    return np.array(img_pil)


# =============================================================================
# DICOM 생성
# =============================================================================

def encode_frame_as_jpeg(frame: np.ndarray, quality: int = 90) -> bytes:
    """RGB 프레임을 JPEG로 인코딩"""
    img = Image.fromarray(frame, mode='RGB')
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=quality, subsampling=0)
    return buffer.getvalue()


def create_realistic_dicom_dataset(
    jpeg_frames: list,
    rows: int,
    cols: int,
    series_uid: str,
    study_uid: str,
    heart_rate: int = 72,
    frame_rate: int = 30,
    include_color: bool = True
) -> FileDataset:
    """사실적인 DICOM 데이터셋 생성"""

    file_meta = Dataset()
    file_meta.MediaStorageSOPClassUID = uid.UltrasoundMultiFrameImageStorage
    file_meta.MediaStorageSOPInstanceUID = uid.generate_uid()
    file_meta.TransferSyntaxUID = JPEG_BASELINE_UID
    file_meta.ImplementationClassUID = uid.generate_uid()
    file_meta.ImplementationVersionName = "EchoPixel_Realistic_1.0"

    ds = FileDataset(
        filename_or_obj="",
        dataset={},
        file_meta=file_meta,
        preamble=b"\x00" * 128
    )

    now = datetime.datetime.now()
    num_frames = len(jpeg_frames)

    # Patient
    ds.PatientName = "Kim^Chul-Soo"
    ds.PatientID = "P20260118001"
    ds.PatientBirthDate = "19750315"
    ds.PatientSex = "M"
    ds.PatientAge = "050Y"

    # Study
    ds.StudyInstanceUID = study_uid
    ds.StudyDate = now.strftime("%Y%m%d")
    ds.StudyTime = now.strftime("%H%M%S")
    ds.StudyID = "ECHO20260118"
    ds.AccessionNumber = "ACC2026011800001"
    ds.ReferringPhysicianName = "Park^Min-Joon^Dr"
    ds.StudyDescription = "TTE - Realistic Simulation"

    # Series
    ds.SeriesInstanceUID = series_uid
    ds.SeriesNumber = 1
    ds.SeriesDescription = "Apical 4-Chamber with Color Doppler" if include_color else "Apical 4-Chamber"
    ds.Modality = "US"
    ds.BodyPartExamined = "HEART"

    # Equipment
    ds.Manufacturer = "EchoPixel Medical"
    ds.ManufacturerModelName = "VirtualEcho Realistic X2"
    ds.InstitutionName = "Seoul National University Hospital"

    # Image
    ds.SOPClassUID = uid.UltrasoundMultiFrameImageStorage
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.InstanceNumber = 1
    ds.ContentDate = now.strftime("%Y%m%d")
    ds.ContentTime = now.strftime("%H%M%S")
    ds.ImageType = ["ORIGINAL", "PRIMARY", ""]
    ds.LossyImageCompression = "01"
    ds.LossyImageCompressionMethod = "ISO_10918_1"

    # Pixel (RGB for Color Doppler)
    ds.SamplesPerPixel = 3 if include_color else 1
    ds.PhotometricInterpretation = "YBR_FULL_422" if include_color else "MONOCHROME2"
    ds.NumberOfFrames = num_frames
    ds.Rows = rows
    ds.Columns = cols
    ds.BitsAllocated = 8
    ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelRepresentation = 0
    ds.PlanarConfiguration = 0

    # Encapsulated Pixel Data
    ds.PixelData = encapsulate(jpeg_frames)
    ds['PixelData'].is_undefined_length = True

    # Cine
    ds.FrameTime = 1000.0 / frame_rate
    ds.FrameTimeVector = [1000.0 / frame_rate] * num_frames
    ds.RecommendedDisplayFrameRate = frame_rate
    ds.CineRate = frame_rate

    # Cardiac
    ds.HeartRate = heart_rate
    ds.CardiacNumberOfImages = num_frames

    # VOI LUT
    ds.WindowCenter = 128.0
    ds.WindowWidth = 256.0

    ds.SpecificCharacterSet = "ISO_IR 192"

    return ds


# =============================================================================
# 메인 생성 함수
# =============================================================================

def generate_realistic_dicom(
    output_dir: str,
    num_frames: int = 90,
    quality: int = 90,
    width: int = 640,
    height: int = 480,
    frame_rate: int = 30,
    include_color_doppler: bool = True,
    include_ui: bool = True
) -> str:
    """
    사실적인 심초음파 DICOM 생성
    """
    os.makedirs(output_dir, exist_ok=True)

    study_uid = uid.generate_uid()
    series_uid = uid.generate_uid()

    print("=" * 60)
    print("사실적인 심초음파 DICOM 생성")
    print("=" * 60)
    print(f"  Transfer Syntax: JPEG Baseline")
    print(f"  출력 폴더: {output_dir}")
    print(f"  이미지 크기: {width}x{height}")
    print(f"  프레임 수: {num_frames}")
    print(f"  JPEG 품질: {quality}")
    print(f"  Color Doppler: {'Yes' if include_color_doppler else 'No'}")
    print(f"  UI Overlay: {'Yes' if include_ui else 'No'}")
    print()

    print("프레임 생성 중...")
    jpeg_frames = []
    total_size = 0

    # 일관된 스페클을 위한 시드
    base_seed = np.random.randint(0, 10000)

    for i in range(num_frames):
        # 프레임 생성
        frame = generate_realistic_frame(
            width, height, i, num_frames,
            include_color_doppler=include_color_doppler,
            speckle_seed=base_seed
        )

        # 섹터 프레임 추가
        frame = add_sector_frame(frame)

        # UI 오버레이 추가
        if include_ui:
            frame = add_ui_overlay(frame, i, num_frames)

        # JPEG 인코딩
        jpeg_data = encode_frame_as_jpeg(frame, quality=quality)
        jpeg_frames.append(jpeg_data)
        total_size += len(jpeg_data)

        if (i + 1) % 15 == 0 or i == num_frames - 1:
            print(f"  프레임 {i+1}/{num_frames} 완료")

    print(f"\n총 JPEG 데이터: {total_size / (1024*1024):.2f} MB")

    # DICOM 생성
    print("\nDICOM 파일 생성 중...")
    ds = create_realistic_dicom_dataset(
        jpeg_frames=jpeg_frames,
        rows=height,
        cols=width,
        series_uid=series_uid,
        study_uid=study_uid,
        include_color=include_color_doppler
    )

    suffix = "_color" if include_color_doppler else ""
    filename = f"echo_realistic_{num_frames}frames{suffix}.dcm"
    filepath = os.path.join(output_dir, filename)
    ds.save_as(filepath)

    file_size = os.path.getsize(filepath) / (1024 * 1024)
    print(f"  저장됨: {filepath}")
    print(f"  파일 크기: {file_size:.2f} MB")

    return filepath


def main():
    output_dir = "./output"
    num_frames = 90  # 3초 (30fps)
    quality = 90

    if len(sys.argv) > 1:
        output_dir = sys.argv[1]
    if len(sys.argv) > 2:
        num_frames = int(sys.argv[2])
    if len(sys.argv) > 3:
        quality = int(sys.argv[3])

    quality = max(1, min(100, quality))

    filepath = generate_realistic_dicom(
        output_dir=output_dir,
        num_frames=num_frames,
        quality=quality,
        width=640,
        height=480,
        frame_rate=30,
        include_color_doppler=True,
        include_ui=True
    )

    print(f"\n완료!")
    print(f"생성된 파일: {filepath}")


if __name__ == "__main__":
    main()
