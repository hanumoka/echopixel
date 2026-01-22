/**
 * WADO-RS 설정 입력 폼 컴포넌트
 */

import { cn } from '@echopixel/react';
import type { WadoConfig } from '../types/demo';

interface WadoConfigPanelProps {
  config: WadoConfig;
  onChange: (config: WadoConfig) => void;
  onLoad?: () => void;
  loading?: boolean;
  disabled?: boolean;
  showInstanceUid?: boolean;
  showLoadButton?: boolean;
  compact?: boolean;
  className?: string;
}

export function WadoConfigPanel({
  config,
  onChange,
  onLoad,
  loading = false,
  disabled = false,
  showInstanceUid = true,
  showLoadButton = true,
  compact = false,
  className,
}: WadoConfigPanelProps) {
  const inputClass = cn(
    'w-full bg-[#2a2a3a] border border-[#555] rounded-md text-white',
    compact ? 'px-2 py-1.5 text-sm' : 'p-2 text-base'
  );

  const labelClass = cn(
    'block text-accent-info mb-1.5',
    compact ? 'text-sm' : 'text-base'
  );

  return (
    <div
      className={cn(
        'p-4 bg-[#1a2a3a] border border-[#47a] rounded-md',
        className
      )}
    >
      <div className="mb-2.5">
        <label className={labelClass}>DICOM Web Base URL</label>
        <input
          type="text"
          value={config.baseUrl}
          onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
          placeholder="http://localhost:8080/dicomweb"
          disabled={disabled || loading}
          className={inputClass}
        />
      </div>

      <div
        className="grid gap-2.5"
        style={{
          gridTemplateColumns: showInstanceUid
            ? 'repeat(auto-fit, minmax(200px, 1fr))'
            : 'repeat(2, 1fr)',
        }}
      >
        <div>
          <label className={labelClass}>Study Instance UID</label>
          <input
            type="text"
            value={config.studyUid}
            onChange={(e) => onChange({ ...config, studyUid: e.target.value })}
            disabled={disabled || loading}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Series Instance UID</label>
          <input
            type="text"
            value={config.seriesUid}
            onChange={(e) => onChange({ ...config, seriesUid: e.target.value })}
            disabled={disabled || loading}
            className={inputClass}
          />
        </div>

        {showInstanceUid && (
          <div>
            <label className={labelClass}>SOP Instance UID</label>
            <input
              type="text"
              value={config.instanceUid}
              onChange={(e) => onChange({ ...config, instanceUid: e.target.value })}
              disabled={disabled || loading}
              className={inputClass}
            />
          </div>
        )}
      </div>

      {showLoadButton && onLoad && (
        <button
          onClick={onLoad}
          disabled={disabled || loading}
          className={cn(
            'mt-4 px-5 py-2.5 text-white border-none rounded-md text-base',
            loading
              ? 'bg-text-disabled cursor-not-allowed'
              : 'bg-[#47a] cursor-pointer hover:bg-[#58b]'
          )}
        >
          {loading ? 'Loading...' : 'Load from WADO-RS'}
        </button>
      )}
    </div>
  );
}
