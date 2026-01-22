/**
 * PerformanceOptions - 성능 테스트용 옵션 패널
 *
 * 테스트 목적:
 * - VRAM 제한에 따른 eviction 동작 확인
 * - DPR 변경에 따른 렌더링 품질/성능 비교
 * - 디버그 로깅으로 캐시 동작 모니터링
 */

import { cn, type PerformanceOptions as PerformanceOptionsType } from '@echopixel/react';

/**
 * VRAM 프리셋 옵션
 */
const VRAM_PRESETS = [
  { label: '256 MB', value: 256 },
  { label: '512 MB', value: 512 },
  { label: '1 GB', value: 1024 },
  { label: '1.5 GB', value: 1536 },
  { label: '2 GB', value: 2048 },
  { label: '3 GB', value: 3072 },
  { label: '4 GB', value: 4096 },
  { label: 'Unlimited', value: Infinity },
] as const;

/**
 * DPR 프리셋 옵션
 */
const DPR_PRESETS = [
  { label: '1.0x (Low)', value: 1.0 },
  { label: '1.5x (Medium)', value: 1.5 },
  { label: '2.0x (High)', value: 2.0 },
  { label: 'Auto', value: undefined },
] as const;

export interface PerformanceOptionsPanelProps {
  /** 현재 성능 옵션 */
  options: PerformanceOptionsType;
  /** 옵션 변경 콜백 */
  onChange: (options: PerformanceOptionsType) => void;
  /** 현재 VRAM 사용량 (MB) */
  currentVramMB?: number;
  /** 패널 클래스 */
  className?: string;
}

/**
 * 성능 옵션 패널 컴포넌트
 */
export function PerformanceOptionsPanel({
  options,
  onChange,
  currentVramMB,
  className,
}: PerformanceOptionsPanelProps) {
  const handleVramChange = (value: number) => {
    onChange({ ...options, maxVramMB: value });
  };

  const handleDprChange = (value: number | undefined) => {
    onChange({ ...options, dprOverride: value });
  };

  const handleDebugChange = (checked: boolean) => {
    onChange({ ...options, debugMode: checked });
  };

  const currentMaxVram = options.maxVramMB ?? Infinity;
  const currentDpr = options.dprOverride;
  const isDebugMode = options.debugMode ?? false;

  // VRAM 사용률 계산
  const vramUsagePercent = currentVramMB !== undefined && currentMaxVram !== Infinity
    ? Math.min((currentVramMB / currentMaxVram) * 100, 100)
    : 0;

  return (
    <div
      className={cn(
        'p-3 bg-viewer-surface rounded-lg border border-[#333] text-base',
        className
      )}
    >
      <div className="font-bold mb-3 text-accent-primary">
        Performance Options
      </div>

      {/* VRAM 제한 */}
      <div className="mb-4">
        <label className="block mb-1.5 text-text-secondary">
          VRAM Limit
        </label>
        <div className="flex flex-wrap gap-1">
          {VRAM_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handleVramChange(preset.value)}
              className={cn(
                'px-2 py-1 text-xs border-none rounded-md cursor-pointer transition-all duration-150',
                currentMaxVram === preset.value
                  ? 'bg-accent-primary text-white'
                  : 'bg-[#333] text-[#ccc] hover:bg-[#444]'
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* VRAM 사용량 표시 */}
        {currentVramMB !== undefined && (
          <div className="mt-2">
            <div className="flex justify-between mb-1 text-xs text-text-muted">
              <span>Usage: {currentVramMB.toFixed(1)} MB</span>
              <span>
                {currentMaxVram === Infinity
                  ? 'Unlimited'
                  : `${currentMaxVram} MB (${vramUsagePercent.toFixed(0)}%)`}
              </span>
            </div>
            {currentMaxVram !== Infinity && (
              <div className="w-full h-1 bg-[#333] rounded-sm overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all duration-300',
                    vramUsagePercent > 90 ? 'bg-[#f44]' : vramUsagePercent > 70 ? 'bg-[#fa0]' : 'bg-accent-primary'
                  )}
                  style={{ width: `${vramUsagePercent}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* DPR 설정 */}
      <div className="mb-4">
        <label className="block mb-1.5 text-text-secondary">
          Device Pixel Ratio
        </label>
        <div className="flex gap-1">
          {DPR_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handleDprChange(preset.value)}
              className={cn(
                'px-2.5 py-1 text-xs border-none rounded-md cursor-pointer transition-all duration-150',
                currentDpr === preset.value
                  ? 'bg-accent-primary text-white'
                  : 'bg-[#333] text-[#ccc] hover:bg-[#444]'
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="mt-1 text-xxs text-text-disabled">
          Current: {currentDpr ?? window.devicePixelRatio.toFixed(2)}x
          {currentDpr === undefined && ' (auto)'}
        </div>
      </div>

      {/* 디버그 모드 */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer text-text-secondary">
          <input
            type="checkbox"
            checked={isDebugMode}
            onChange={(e) => handleDebugChange(e.target.checked)}
            className="cursor-pointer"
          />
          <span>Debug Mode (Console Logging)</span>
        </label>
        <div className="mt-1 text-xxs text-text-disabled pl-6">
          Logs texture cache operations to console
        </div>
      </div>

      {/* 경고 메시지 */}
      <div className="mt-4 p-2 bg-[#2a2a1e] rounded-md text-xxs text-[#aa8] border-l-[3px] border-[#aa8]">
        Note: Changing VRAM or DPR requires reloading data to take effect.
      </div>
    </div>
  );
}
