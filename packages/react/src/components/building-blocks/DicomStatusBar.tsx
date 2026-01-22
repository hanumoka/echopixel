import type { ImageStatus, CanvasInfo, WindowLevelInfo, TransformInfo } from '../../types';
import { cn } from '../../utils';

/**
 * DicomStatusBar Props
 *
 * DICOM 뷰어 상단에 이미지 정보와 상태를 표시하는 컴포넌트
 */
export interface DicomStatusBarProps {
  /** 이미지 상태 정보 (columns, rows, frameCount) */
  imageStatus?: ImageStatus | null;
  /** 캔버스 정보 (width, height, dpr) */
  canvasInfo?: CanvasInfo;
  /** Window/Level 값 (설정된 경우에만 표시) */
  windowLevel?: WindowLevelInfo | null;
  /** Transform 정보 (기본값에서 변경된 경우에만 표시) */
  transform?: TransformInfo;
  /** 커스텀 상태 텍스트 */
  statusText?: string;
  /** 커스텀 스타일 */
  style?: React.CSSProperties;
  /** 커스텀 클래스명 */
  className?: string;
}

/**
 * DicomStatusBar
 *
 * DICOM 뷰어의 상태 표시줄 컴포넌트
 * - 이미지 크기 및 프레임 수
 * - DPR 및 캔버스 크기
 * - Window/Level 값 (설정된 경우)
 * - Pan/Zoom 값 (기본값이 아닌 경우)
 *
 * @example
 * ```tsx
 * <DicomStatusBar
 *   imageStatus={{ columns: 800, rows: 600, frameCount: 30 }}
 *   canvasInfo={{ width: 512, height: 512, dpr: 2 }}
 *   windowLevel={{ center: 128, width: 256 }}
 *   transform={{ pan: { x: 0, y: 0 }, zoom: 1.5 }}
 * />
 * ```
 */
export function DicomStatusBar({
  imageStatus,
  canvasInfo,
  windowLevel,
  transform,
  statusText,
  style,
  className,
}: DicomStatusBarProps) {
  // 표시할 상태 텍스트 결정
  const displayStatus = statusText ?? (imageStatus
    ? `${imageStatus.columns}x${imageStatus.rows}, ${imageStatus.frameCount} 프레임`
    : '');

  // Transform 변경 여부 확인 (기본값: pan={0,0}, zoom=1.0, rotation=0, flip=false)
  const hasTransformChange = transform && (
    transform.zoom !== 1.0 ||
    transform.pan.x !== 0 ||
    transform.pan.y !== 0 ||
    (transform.rotation && transform.rotation !== 0) ||
    transform.flipH ||
    transform.flipV
  );

  return (
    <div
      className={cn(
        'py-2 px-3 mb-2.5 bg-viewer-surface-alt text-text-primary rounded-md text-base',
        'flex justify-between items-center gap-3 flex-wrap',
        className
      )}
      style={style}
    >
      {/* 이미지 상태 */}
      <span>{displayStatus}</span>

      {/* 캔버스/DPR 정보 */}
      {canvasInfo && (
        <span className="text-[#8f8] text-xs">
          DPR: {canvasInfo.dpr} | Canvas: {Math.floor(canvasInfo.width * canvasInfo.dpr)}x{Math.floor(canvasInfo.height * canvasInfo.dpr)}
        </span>
      )}

      {/* Window/Level (설정된 경우에만 표시) */}
      {windowLevel && (
        <span className="text-accent-info">
          W/L: {Math.round(windowLevel.width)} / {Math.round(windowLevel.center)}
        </span>
      )}

      {/* Pan/Zoom/Rotation/Flip (변경된 경우에만 표시) */}
      {hasTransformChange && transform && (
        <span className="text-[#cf8]">
          Zoom: {transform.zoom.toFixed(1)}x | Pan: ({Math.round(transform.pan.x)}, {Math.round(transform.pan.y)})
          {transform.rotation ? ` | Rot: ${transform.rotation}°` : ''}
          {(transform.flipH || transform.flipV) && ` | Flip: ${transform.flipH ? 'H' : ''}${transform.flipV ? 'V' : ''}`}
        </span>
      )}
    </div>
  );
}
