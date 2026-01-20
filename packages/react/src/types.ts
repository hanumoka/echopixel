/**
 * @echopixel/react 공통 타입 정의
 */

/**
 * Window/Level (밝기/대비) 설정
 */
export interface WindowLevelInfo {
  /** Window Center (밝기) */
  center: number;
  /** Window Width (대비) */
  width: number;
}

/**
 * Transform (Pan/Zoom) 설정
 */
export interface TransformInfo {
  /** Pan offset */
  pan: { x: number; y: number };
  /** Zoom level (1.0 = 100%) */
  zoom: number;
}

/**
 * 이미지 정보 (DicomStatusBar용)
 */
export interface ImageStatus {
  /** 이미지 너비 */
  columns: number;
  /** 이미지 높이 */
  rows: number;
  /** 총 프레임 수 */
  frameCount: number;
}

/**
 * 캔버스 정보
 */
export interface CanvasInfo {
  /** CSS 너비 (픽셀) */
  width: number;
  /** CSS 높이 (픽셀) */
  height: number;
  /** Device Pixel Ratio */
  dpr: number;
}

/**
 * 재생 상태
 */
export interface PlaybackState {
  /** 현재 프레임 인덱스 (0-based) */
  currentFrame: number;
  /** 총 프레임 수 */
  totalFrames: number;
  /** 재생 중 여부 */
  isPlaying: boolean;
  /** 초당 프레임 수 */
  fps: number;
}

/**
 * 도구 모드
 * - static: 정지 이미지 (휠 → 줌)
 * - video: 동영상 (휠 → 프레임 전환)
 */
export type ToolMode = 'static' | 'video';
