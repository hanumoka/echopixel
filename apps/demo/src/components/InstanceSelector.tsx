/**
 * Instance 목록 표시 및 선택 UI 컴포넌트
 */

import { cn } from '@echopixel/react';
import type { ScannedInstance } from '../types/demo';

interface InstanceSelectorProps {
  instances: ScannedInstance[];
  selectedUids: Set<string>;
  maxSelect: number;
  onToggle: (uid: string) => void;
  onSelectAllPlayable: () => void;
  onClearSelection: () => void;
  disabled?: boolean;
  maxHeight?: string;
  className?: string;
}

export function InstanceSelector({
  instances,
  selectedUids,
  maxSelect,
  onToggle,
  onSelectAllPlayable,
  onClearSelection,
  disabled = false,
  maxHeight = '300px',
  className,
}: InstanceSelectorProps) {
  if (instances.length === 0) {
    return null;
  }

  const playableCount = instances.filter((i) => i.isPlayable).length;
  const stillCount = instances.filter((i) => !i.isPlayable && !i.error).length;
  const errorCount = instances.filter((i) => i.error).length;

  return (
    <div className={className}>
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-2.5">
        <span className="text-accent-info text-base">
          Instance 선택 ({selectedUids.size} / {maxSelect}개)
        </span>
        <div className="flex gap-2">
          <button
            onClick={onSelectAllPlayable}
            disabled={disabled}
            className={cn(
              'px-2.5 py-1 text-xs text-white border-none rounded-sm',
              disabled
                ? 'bg-[#444] cursor-not-allowed'
                : 'bg-[#363] cursor-pointer hover:bg-[#474]'
            )}
          >
            영상만 선택
          </button>
          <button
            onClick={onClearSelection}
            disabled={disabled}
            className={cn(
              'px-2.5 py-1 text-xs text-white border-none rounded-sm',
              disabled
                ? 'bg-[#444] cursor-not-allowed'
                : 'bg-[#633] cursor-pointer hover:bg-[#744]'
            )}
          >
            선택 해제
          </button>
        </div>
      </div>

      {/* 목록 */}
      <div
        className="bg-[#1a1a2a] rounded-md overflow-y-auto"
        style={{ maxHeight }}
      >
        {instances.map((instance, idx) => {
          const isSelected = selectedUids.has(instance.uid);
          const canSelect = isSelected || selectedUids.size < maxSelect;

          return (
            <div
              key={instance.uid}
              onClick={() => !instance.error && canSelect && !disabled && onToggle(instance.uid)}
              className={cn(
                'px-3 py-2 border-b border-[#333] flex items-center gap-2.5',
                isSelected && 'bg-[#2a3a2a]',
                instance.error && 'opacity-50',
                !instance.error && !canSelect && 'opacity-60',
                instance.error || disabled
                  ? 'cursor-not-allowed'
                  : canSelect
                    ? 'cursor-pointer hover:bg-[#252535]'
                    : 'cursor-not-allowed'
              )}
            >
              {/* 체크박스 */}
              <input
                type="checkbox"
                checked={isSelected}
                disabled={instance.error !== undefined || !canSelect || disabled}
                onChange={() => {}}
                className="cursor-inherit"
              />

              {/* 번호 */}
              <span className="text-text-disabled text-xs min-w-[24px]">
                {idx + 1}.
              </span>

              {/* 타입 배지 */}
              {instance.error ? (
                <span className="text-xxs text-[#f66] bg-[#3a1a1a] px-1.5 py-0.5 rounded-sm min-w-[50px] text-center">
                  오류
                </span>
              ) : instance.isPlayable ? (
                <span className="text-xxs text-accent-success bg-[#1a3a1a] px-1.5 py-0.5 rounded-sm min-w-[50px] text-center">
                  영상
                </span>
              ) : (
                <span className="text-xxs text-accent-warning bg-[#3a2a1a] px-1.5 py-0.5 rounded-sm min-w-[50px] text-center">
                  정지
                </span>
              )}

              {/* 프레임 수 */}
              {!instance.error && (
                <span
                  className={cn(
                    'text-xs min-w-[45px] text-right',
                    instance.isPlayable ? 'text-accent-info font-bold' : 'text-text-muted'
                  )}
                >
                  {instance.frameCount} 프레임
                </span>
              )}

              {/* UID */}
              <span className="font-mono text-xxs text-text-secondary flex-1">
                ...{instance.uid.slice(-25)}
              </span>

              {/* 크기 정보 */}
              {!instance.error && (
                <span className="text-xxs text-text-disabled">
                  {instance.width}x{instance.height}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 통계 */}
      <div className="mt-2 text-xs text-text-muted flex gap-4">
        <span>총: {instances.length}개</span>
        <span className="text-accent-success">영상: {playableCount}개</span>
        <span className="text-accent-warning">정지: {stillCount}개</span>
        {errorCount > 0 && <span className="text-[#f66]">오류: {errorCount}개</span>}
      </div>
    </div>
  );
}
