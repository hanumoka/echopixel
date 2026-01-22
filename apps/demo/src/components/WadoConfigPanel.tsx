/**
 * WADO-RS 설정 입력 폼 컴포넌트
 */

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
  style?: React.CSSProperties;
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
  style,
}: WadoConfigPanelProps) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: compact ? '6px 8px' : '8px',
    fontSize: compact ? '12px' : '14px',
    background: '#2a2a3a',
    border: '1px solid #555',
    borderRadius: '4px',
    color: '#fff',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#8cf',
    marginBottom: '5px',
    fontSize: compact ? '12px' : '13px',
  };

  return (
    <div
      style={{
        padding: '15px',
        background: '#1a2a3a',
        border: '1px solid #47a',
        borderRadius: '4px',
        ...style,
      }}
    >
      <div style={{ marginBottom: '10px' }}>
        <label style={labelStyle}>DICOM Web Base URL</label>
        <input
          type="text"
          value={config.baseUrl}
          onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
          placeholder="http://localhost:8080/dicomweb"
          disabled={disabled || loading}
          style={inputStyle}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gap: '10px',
          gridTemplateColumns: showInstanceUid
            ? 'repeat(auto-fit, minmax(200px, 1fr))'
            : 'repeat(2, 1fr)',
        }}
      >
        <div>
          <label style={labelStyle}>Study Instance UID</label>
          <input
            type="text"
            value={config.studyUid}
            onChange={(e) => onChange({ ...config, studyUid: e.target.value })}
            disabled={disabled || loading}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Series Instance UID</label>
          <input
            type="text"
            value={config.seriesUid}
            onChange={(e) => onChange({ ...config, seriesUid: e.target.value })}
            disabled={disabled || loading}
            style={inputStyle}
          />
        </div>

        {showInstanceUid && (
          <div>
            <label style={labelStyle}>SOP Instance UID</label>
            <input
              type="text"
              value={config.instanceUid}
              onChange={(e) => onChange({ ...config, instanceUid: e.target.value })}
              disabled={disabled || loading}
              style={inputStyle}
            />
          </div>
        )}
      </div>

      {showLoadButton && onLoad && (
        <button
          onClick={onLoad}
          disabled={disabled || loading}
          style={{
            marginTop: '15px',
            padding: '10px 20px',
            background: loading ? '#555' : '#47a',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
          }}
        >
          {loading ? 'Loading...' : 'Load from WADO-RS'}
        </button>
      )}
    </div>
  );
}
