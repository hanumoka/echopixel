/**
 * PerformanceOptions - 성능 테스트용 옵션 패널
 *
 * 테스트 목적:
 * - VRAM 제한에 따른 eviction 동작 확인
 * - DPR 변경에 따른 렌더링 품질/성능 비교
 * - 디버그 로깅으로 캐시 동작 모니터링
 */

import type { CSSProperties } from 'react';
import type { PerformanceOptions as PerformanceOptionsType } from '@echopixel/react';

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
  /** 패널 스타일 */
  style?: CSSProperties;
}

/**
 * 성능 옵션 패널 컴포넌트
 */
export function PerformanceOptionsPanel({
  options,
  onChange,
  currentVramMB,
  style,
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
      style={{
        padding: '12px',
        background: '#1a1a2e',
        borderRadius: '8px',
        border: '1px solid #333',
        fontSize: '13px',
        ...style,
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '12px', color: '#4a9eff' }}>
        Performance Options
      </div>

      {/* VRAM 제한 */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', color: '#aaa' }}>
          VRAM Limit
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {VRAM_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handleVramChange(preset.value)}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                background: currentMaxVram === preset.value
                  ? '#4a9eff'
                  : '#333',
                color: currentMaxVram === preset.value
                  ? '#fff'
                  : '#ccc',
                transition: 'all 0.15s ease',
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* VRAM 사용량 표시 */}
        {currentVramMB !== undefined && (
          <div style={{ marginTop: '8px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '4px',
              fontSize: '11px',
              color: '#888',
            }}>
              <span>Usage: {currentVramMB.toFixed(1)} MB</span>
              <span>
                {currentMaxVram === Infinity
                  ? 'Unlimited'
                  : `${currentMaxVram} MB (${vramUsagePercent.toFixed(0)}%)`}
              </span>
            </div>
            {currentMaxVram !== Infinity && (
              <div style={{
                width: '100%',
                height: '4px',
                background: '#333',
                borderRadius: '2px',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${vramUsagePercent}%`,
                  height: '100%',
                  background: vramUsagePercent > 90 ? '#f44' : vramUsagePercent > 70 ? '#fa0' : '#4a9eff',
                  transition: 'width 0.3s ease, background 0.3s ease',
                }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* DPR 설정 */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', color: '#aaa' }}>
          Device Pixel Ratio
        </label>
        <div style={{ display: 'flex', gap: '4px' }}>
          {DPR_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handleDprChange(preset.value)}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                background: currentDpr === preset.value
                  ? '#4a9eff'
                  : '#333',
                color: currentDpr === preset.value
                  ? '#fff'
                  : '#ccc',
                transition: 'all 0.15s ease',
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div style={{
          marginTop: '4px',
          fontSize: '10px',
          color: '#666',
        }}>
          Current: {currentDpr ?? window.devicePixelRatio.toFixed(2)}x
          {currentDpr === undefined && ' (auto)'}
        </div>
      </div>

      {/* 디버그 모드 */}
      <div>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          color: '#aaa',
        }}>
          <input
            type="checkbox"
            checked={isDebugMode}
            onChange={(e) => handleDebugChange(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span>Debug Mode (Console Logging)</span>
        </label>
        <div style={{
          marginTop: '4px',
          fontSize: '10px',
          color: '#666',
          paddingLeft: '24px',
        }}>
          Logs texture cache operations to console
        </div>
      </div>

      {/* 경고 메시지 */}
      <div style={{
        marginTop: '16px',
        padding: '8px',
        background: '#2a2a1e',
        borderRadius: '4px',
        fontSize: '10px',
        color: '#aa8',
        borderLeft: '3px solid #aa8',
      }}>
        Note: Changing VRAM or DPR requires reloading data to take effect.
      </div>
    </div>
  );
}
