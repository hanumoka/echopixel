/**
 * 프레임 동기화 관련 타입 정의 (Phase 2c)
 *
 * 학습 포인트:
 * - 심초음파 스트레스 에코에서 여러 뷰포트 동기화 필요
 * - 시리즈마다 프레임 수가 다를 수 있음 (예: 47 vs 94 프레임)
 * - 동기화 방식: Frame Ratio, Time, Manual
 */

/**
 * 프레임 동기화 모드
 *
 * - frame-ratio: 프레임 비율 기반 (47프레임의 10번째 = 94프레임의 20번째)
 * - time: 절대 시간 기반 (ms 단위)
 * - manual: 수동 (동기화 없음, 각 뷰포트 독립)
 */
export type SyncMode = 'frame-ratio' | 'time' | 'manual';

/**
 * 동기화 그룹
 *
 * 마스터-슬레이브 구조:
 * - 마스터 뷰포트의 프레임 변경이 슬레이브들에게 전파
 * - 슬레이브들은 각자의 프레임 수에 맞게 인덱스 변환
 */
export interface SyncGroup {
  /** 그룹 고유 ID */
  id: string;
  /** 마스터 뷰포트 ID */
  masterId: string;
  /** 슬레이브 뷰포트 ID 목록 */
  slaveIds: string[];
  /** 동기화 모드 */
  mode: SyncMode;
  /** 그룹 활성화 여부 */
  active: boolean;
}

/**
 * 동기화 그룹 생성 옵션
 */
export interface CreateSyncGroupOptions {
  /** 마스터 뷰포트 ID */
  masterId: string;
  /** 슬레이브 뷰포트 ID 목록 */
  slaveIds: string[];
  /** 동기화 모드 (기본값: 'frame-ratio') */
  mode?: SyncMode;
}

/**
 * RenderScheduler 옵션
 */
export interface RenderSchedulerOptions {
  /** 최대 FPS (기본값: 60) */
  maxFps?: number;
  /** 프레임 예산 (ms, 기본값: 16.67ms = 60fps) */
  frameBudget?: number;
}

/**
 * 렌더링 통계
 */
export interface RenderStats {
  /** 마지막 프레임 렌더링 시간 (ms) */
  frameTime: number;
  /** 현재 FPS */
  fps: number;
  /** 렌더링된 뷰포트 수 */
  renderedViewports: number;
  /** 총 프레임 수 (통계 시작 이후) */
  totalFrames: number;
  /** 드롭된 프레임 수 */
  droppedFrames: number;
}

/**
 * 뷰포트 렌더링 콜백
 *
 * RenderScheduler가 각 뷰포트에 대해 호출
 */
export type ViewportRenderCallback = (
  viewportId: string,
  frameIndex: number,
  bounds: { x: number; y: number; width: number; height: number },
) => void;

/**
 * 프레임 업데이트 콜백
 *
 * 뷰포트의 프레임이 변경될 때 호출 (UI 상태 업데이트용)
 */
export type FrameUpdateCallback = (viewportId: string, frameIndex: number) => void;
