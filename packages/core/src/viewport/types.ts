/**
 * Viewport 관련 타입 정의 (Phase 2b)
 *
 * 학습 포인트:
 * - 단일 Canvas에서 여러 뷰포트를 관리하기 위한 데이터 구조
 * - 각 뷰포트는 Canvas 내 특정 영역 (x, y, width, height)에 렌더링
 * - gl.scissor() + gl.viewport()로 렌더링 영역 제한
 */

/**
 * 사각형 영역 (Canvas 내 위치와 크기)
 *
 * 좌표 시스템:
 * - 원점 (0, 0)은 Canvas 좌하단 (WebGL 좌표계)
 * - x는 오른쪽으로 증가, y는 위로 증가
 */
export interface Rect {
  /** X 좌표 (Canvas 내) */
  x: number;
  /** Y 좌표 (Canvas 내) */
  y: number;
  /** 너비 (픽셀) */
  width: number;
  /** 높이 (픽셀) */
  height: number;
}

/**
 * Window/Level 설정
 */
export interface WindowLevel {
  /** Window Center (정규화된 값 또는 원본 값) */
  center: number;
  /** Window Width (정규화된 값 또는 원본 값) */
  width: number;
}

/**
 * 뷰포트 재생 상태
 */
export interface ViewportPlaybackState {
  /** 현재 프레임 인덱스 (0부터 시작) */
  currentFrame: number;
  /** 재생 중 여부 */
  isPlaying: boolean;
  /** 재생 FPS */
  fps: number;
  /** 마지막 프레임 렌더링 시간 (timestamp) */
  lastFrameTime: number;
}

/**
 * 뷰포트 시리즈 정보
 */
export interface ViewportSeriesInfo {
  /** 시리즈 ID (DICOM Series Instance UID 또는 임의 ID) */
  seriesId: string;
  /** 총 프레임 수 */
  frameCount: number;
  /** 이미지 너비 */
  imageWidth: number;
  /** 이미지 높이 */
  imageHeight: number;
  /** 압축 여부 (JPEG 등) */
  isEncapsulated: boolean;
  /** 비트 깊이 */
  bitsStored?: number;
}

/**
 * 이미지 변환 상태 (Pan, Zoom, Rotation, Flip)
 *
 * Tool System에서 사용하는 이미지 조작 상태
 */
export interface ViewportTransform {
  /** 이동 오프셋 (픽셀 단위) */
  pan: { x: number; y: number };
  /** 확대 배율 (1.0 = 원본 크기) */
  zoom: number;
  /** 회전 각도 (degree) */
  rotation: number;
  /** 가로 플립 (좌우 반전) */
  flipH: boolean;
  /** 세로 플립 (상하 반전) */
  flipV: boolean;
}

/**
 * 뷰포트 구성
 *
 * 하나의 DICOM 시리즈를 표시하는 뷰포트의 전체 상태
 */
export interface Viewport {
  /** 뷰포트 고유 ID */
  id: string;

  /** Canvas 내 위치와 크기 */
  bounds: Rect;

  /** 연결된 시리즈 정보 (없으면 빈 뷰포트) */
  series: ViewportSeriesInfo | null;

  /** 재생 상태 */
  playback: ViewportPlaybackState;

  /** Window/Level 설정 (null이면 기본값 사용) */
  windowLevel: WindowLevel | null;

  /** 이미지 변환 상태 (Pan, Zoom, Rotation) */
  transform: ViewportTransform;

  /** 텍스처 유닛 번호 (이 뷰포트의 배열 텍스처가 바인딩될 유닛) */
  textureUnit: number;

  /** 활성화 여부 (비활성 뷰포트는 렌더링 스킵) */
  active: boolean;
}

/**
 * 뷰포트 생성 옵션
 */
export interface CreateViewportOptions {
  /** Canvas 내 위치와 크기 */
  bounds: Rect;
  /** 텍스처 유닛 번호 (기본값: 자동 할당) */
  textureUnit?: number;
  /** 초기 FPS (기본값: 30) */
  fps?: number;
}

/**
 * 레이아웃 타입
 */
export type LayoutType =
  | 'grid-1x1'
  | 'grid-2x2'
  | 'grid-3x3'
  | 'grid-4x4'
  | 'grid-5x5'
  | 'grid-6x6'
  | 'grid-7x7'
  | 'grid-8x8'
  | 'custom';

/**
 * 레이아웃 설정
 */
export interface LayoutConfig {
  /** 레이아웃 타입 */
  type: LayoutType;
  /** 행 수 (custom 레이아웃용) */
  rows?: number;
  /** 열 수 (custom 레이아웃용) */
  cols?: number;
  /** 뷰포트 간 간격 (픽셀) */
  gap?: number;
}
