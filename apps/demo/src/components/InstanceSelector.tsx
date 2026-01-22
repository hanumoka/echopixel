/**
 * Instance 목록 표시 및 선택 UI 컴포넌트
 */

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
  style?: React.CSSProperties;
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
  style,
}: InstanceSelectorProps) {
  if (instances.length === 0) {
    return null;
  }

  const playableCount = instances.filter((i) => i.isPlayable).length;
  const stillCount = instances.filter((i) => !i.isPlayable && !i.error).length;
  const errorCount = instances.filter((i) => i.error).length;

  return (
    <div style={style}>
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
        }}
      >
        <span style={{ color: '#8cf', fontSize: '13px' }}>
          Instance 선택 ({selectedUids.size} / {maxSelect}개)
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onSelectAllPlayable}
            disabled={disabled}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              background: disabled ? '#444' : '#363',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            영상만 선택
          </button>
          <button
            onClick={onClearSelection}
            disabled={disabled}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              background: disabled ? '#444' : '#633',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            선택 해제
          </button>
        </div>
      </div>

      {/* 목록 */}
      <div
        style={{
          background: '#1a1a2a',
          borderRadius: '4px',
          maxHeight,
          overflowY: 'auto',
        }}
      >
        {instances.map((instance, idx) => {
          const isSelected = selectedUids.has(instance.uid);
          const canSelect = isSelected || selectedUids.size < maxSelect;

          return (
            <div
              key={instance.uid}
              onClick={() => !instance.error && canSelect && !disabled && onToggle(instance.uid)}
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid #333',
                cursor: instance.error || disabled ? 'not-allowed' : canSelect ? 'pointer' : 'not-allowed',
                background: isSelected ? '#2a3a2a' : 'transparent',
                opacity: instance.error ? 0.5 : canSelect ? 1 : 0.6,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {/* 체크박스 */}
              <input
                type="checkbox"
                checked={isSelected}
                disabled={instance.error !== undefined || !canSelect || disabled}
                onChange={() => {}}
                style={{ cursor: 'inherit' }}
              />

              {/* 번호 */}
              <span style={{ color: '#666', fontSize: '11px', minWidth: '24px' }}>
                {idx + 1}.
              </span>

              {/* 타입 배지 */}
              {instance.error ? (
                <span
                  style={{
                    fontSize: '10px',
                    color: '#f66',
                    background: '#3a1a1a',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    minWidth: '50px',
                    textAlign: 'center',
                  }}
                >
                  오류
                </span>
              ) : instance.isPlayable ? (
                <span
                  style={{
                    fontSize: '10px',
                    color: '#8f8',
                    background: '#1a3a1a',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    minWidth: '50px',
                    textAlign: 'center',
                  }}
                >
                  영상
                </span>
              ) : (
                <span
                  style={{
                    fontSize: '10px',
                    color: '#fa8',
                    background: '#3a2a1a',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    minWidth: '50px',
                    textAlign: 'center',
                  }}
                >
                  정지
                </span>
              )}

              {/* 프레임 수 */}
              {!instance.error && (
                <span
                  style={{
                    fontSize: '11px',
                    color: instance.isPlayable ? '#8cf' : '#888',
                    fontWeight: instance.isPlayable ? 'bold' : 'normal',
                    minWidth: '45px',
                    textAlign: 'right',
                  }}
                >
                  {instance.frameCount} 프레임
                </span>
              )}

              {/* UID */}
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  color: '#aaa',
                  flex: 1,
                }}
              >
                ...{instance.uid.slice(-25)}
              </span>

              {/* 크기 정보 */}
              {!instance.error && (
                <span style={{ fontSize: '10px', color: '#666' }}>
                  {instance.width}x{instance.height}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 통계 */}
      <div
        style={{
          marginTop: '8px',
          fontSize: '11px',
          color: '#888',
          display: 'flex',
          gap: '15px',
        }}
      >
        <span>총: {instances.length}개</span>
        <span style={{ color: '#8f8' }}>영상: {playableCount}개</span>
        <span style={{ color: '#fa8' }}>정지: {stillCount}개</span>
        {errorCount > 0 && <span style={{ color: '#f66' }}>오류: {errorCount}개</span>}
      </div>
    </div>
  );
}
