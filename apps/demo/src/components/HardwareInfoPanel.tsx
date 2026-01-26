/**
 * HardwareInfoPanel - 하드웨어 정보 모니터링 패널
 *
 * 학습 포인트:
 * - WebGL에서 GPU 정보 추출
 * - 브라우저 API로 시스템 정보 조회
 * - 접을 수 있는 패널 UI 구현
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collectHardwareInfo,
  formatBytes,
  getDicomViewerRecommendations,
  type HardwareInfo,
  type RenderStats,
} from '@echopixel/core';

/**
 * 텍스처 메모리 사용 정보
 */
export interface TextureMemoryInfo {
  /** 뷰포트별 텍스처 메모리 (bytes) */
  viewports: {
    viewportId: string;
    width: number;
    height: number;
    layers: number;
    bytesPerPixel: number;
    totalBytes: number;
  }[];
  /** 전체 텍스처 메모리 합계 (bytes) */
  totalBytes: number;
}

interface HardwareInfoPanelProps {
  /** WebGL 컨텍스트 (선택적, 없으면 자체 생성) */
  gl?: WebGL2RenderingContext | null;
  /** 런타임 성능 통계 */
  renderStats?: RenderStats | null;
  /** 텍스처 메모리 사용 정보 */
  textureMemory?: TextureMemoryInfo | null;
  /** 패널 초기 열림 상태 */
  defaultOpen?: boolean;
  /** 패널 위치 */
  position?: 'left' | 'right';
}

/**
 * 하드웨어 정보 모니터링 패널 컴포넌트
 */
export function HardwareInfoPanel({
  gl,
  renderStats,
  textureMemory,
  defaultOpen = false,
  position = 'right',
}: HardwareInfoPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'gpu' | 'cpu' | 'display' | 'runtime'>('gpu');
  const [showExtensions, setShowExtensions] = useState(false);

  // 메모리 업데이트를 위한 인터벌
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 하드웨어 정보 수집
  const collectInfo = useCallback(() => {
    const info = collectHardwareInfo(gl);
    setHardwareInfo(info);
  }, [gl]);

  // 초기 수집 및 주기적 메모리 업데이트
  useEffect(() => {
    collectInfo();

    // 메모리 정보는 5초마다 업데이트
    intervalRef.current = setInterval(() => {
      if (isOpen) {
        collectInfo();
      }
    }, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [collectInfo, isOpen]);

  // 패널 토글
  const togglePanel = () => setIsOpen(!isOpen);

  // 권장 사항
  const recommendations = hardwareInfo ? getDicomViewerRecommendations(hardwareInfo) : [];

  return (
    <div
      style={{
        position: 'fixed',
        top: '10px',
        [position]: '10px',
        zIndex: 1000,
        fontFamily: 'monospace',
        fontSize: '12px',
      }}
    >
      {/* 토글 버튼 */}
      <button
        onClick={togglePanel}
        style={{
          padding: '8px 12px',
          backgroundColor: '#333',
          color: '#fff',
          border: '1px solid #555',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span style={{ fontSize: '14px' }}>&#128187;</span>
        Hardware Info
        <span style={{ marginLeft: '4px' }}>{isOpen ? '▼' : '▶'}</span>
      </button>

      {/* 패널 내용 */}
      {isOpen && hardwareInfo && (
        <div
          style={{
            marginTop: '8px',
            backgroundColor: 'rgba(30, 30, 30, 0.95)',
            color: '#e0e0e0',
            border: '1px solid #555',
            borderRadius: '4px',
            width: '380px',
            maxHeight: '70vh',
            overflow: 'auto',
          }}
        >
          {/* 탭 */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid #555',
              backgroundColor: '#252525',
            }}
          >
            {(['gpu', 'cpu', 'display', 'runtime'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: '8px',
                  backgroundColor: activeTab === tab ? '#444' : 'transparent',
                  color: activeTab === tab ? '#4cf' : '#aaa',
                  border: 'none',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontSize: '11px',
                  fontWeight: activeTab === tab ? 'bold' : 'normal',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* 탭 내용 */}
          <div style={{ padding: '12px' }}>
            {/* GPU 탭 */}
            {activeTab === 'gpu' && hardwareInfo.gpu && (
              <div>
                <SectionTitle>GPU Information</SectionTitle>
                <InfoRow label="Vendor" value={hardwareInfo.gpu.vendor} />
                <InfoRow label="Renderer" value={hardwareInfo.gpu.renderer} highlight />
                <InfoRow label="WebGL" value={hardwareInfo.gpu.webglVersion} />
                <InfoRow label="GLSL" value={hardwareInfo.gpu.glslVersion} />

                <SectionTitle>Texture Limits</SectionTitle>
                <InfoRow
                  label="Max Texture Size"
                  value={`${hardwareInfo.gpu.maxTextureSize} px`}
                  highlight
                />
                <InfoRow
                  label="Max Array Layers"
                  value={hardwareInfo.gpu.maxArrayTextureLayers.toString()}
                  highlight
                />
                <InfoRow
                  label="Texture Units"
                  value={hardwareInfo.gpu.maxTextureUnits.toString()}
                />
                <InfoRow
                  label="Combined Units"
                  value={hardwareInfo.gpu.maxCombinedTextureUnits.toString()}
                />

                <SectionTitle>Other Limits</SectionTitle>
                <InfoRow
                  label="Max Renderbuffer"
                  value={`${hardwareInfo.gpu.maxRenderbufferSize} px`}
                />
                <InfoRow
                  label="Max Viewport"
                  value={`${hardwareInfo.gpu.maxViewportDims[0]} x ${hardwareInfo.gpu.maxViewportDims[1]}`}
                />
                <InfoRow
                  label="Anisotropy"
                  value={hardwareInfo.gpu.maxAnisotropy ? `${hardwareInfo.gpu.maxAnisotropy}x` : 'N/A'}
                />

                {/* Texture Memory Estimation */}
                <SectionTitle>Estimated GPU Memory (Textures)</SectionTitle>
                {textureMemory && textureMemory.viewports.length > 0 ? (
                  <>
                    <InfoRow
                      label="Total Texture Memory"
                      value={formatBytes(textureMemory.totalBytes)}
                      highlight
                    />
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '8px',
                        backgroundColor: '#1a1a1a',
                        borderRadius: '4px',
                        fontSize: '10px',
                      }}
                    >
                      <div style={{ color: '#888', marginBottom: '4px' }}>
                        Loaded Viewports ({textureMemory.viewports.length})
                      </div>
                      {textureMemory.viewports.map((vp) => (
                        <div
                          key={vp.viewportId}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '2px 0',
                            borderBottom: '1px solid #333',
                          }}
                        >
                          <span style={{ color: '#aaa' }}>
                            {vp.viewportId.slice(0, 8)}... ({vp.width}x{vp.height}x{vp.layers})
                          </span>
                          <span style={{ color: '#4cf' }}>{formatBytes(vp.totalBytes)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ color: '#888', fontStyle: 'italic', fontSize: '11px' }}>
                    No textures loaded. Load DICOM files to see memory usage.
                  </div>
                )}

                {/* Extensions Toggle */}
                <button
                  onClick={() => setShowExtensions(!showExtensions)}
                  style={{
                    marginTop: '8px',
                    padding: '4px 8px',
                    backgroundColor: '#444',
                    color: '#aaa',
                    border: '1px solid #555',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    fontSize: '10px',
                  }}
                >
                  Extensions ({hardwareInfo.gpu.extensions.length}) {showExtensions ? '▲' : '▼'}
                </button>
                {showExtensions && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '8px',
                      backgroundColor: '#1a1a1a',
                      borderRadius: '4px',
                      maxHeight: '150px',
                      overflow: 'auto',
                      fontSize: '10px',
                    }}
                  >
                    {hardwareInfo.gpu.extensions.map((ext) => (
                      <div key={ext} style={{ color: '#888' }}>
                        {ext}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* CPU/Memory 탭 */}
            {activeTab === 'cpu' && (
              <div>
                <SectionTitle>CPU</SectionTitle>
                <InfoRow
                  label="Logical Cores"
                  value={hardwareInfo.cpuMemory.hardwareConcurrency.toString()}
                  highlight
                />

                <SectionTitle>Memory</SectionTitle>
                <InfoRow
                  label="Device Memory"
                  value={
                    hardwareInfo.cpuMemory.deviceMemory
                      ? `~${hardwareInfo.cpuMemory.deviceMemory} GB`
                      : 'N/A'
                  }
                  highlight
                />
                <InfoRow
                  label="JS Heap Limit"
                  value={formatBytes(hardwareInfo.cpuMemory.jsHeapSizeLimit)}
                />
                <InfoRow
                  label="JS Heap Used"
                  value={formatBytes(hardwareInfo.cpuMemory.jsHeapUsed)}
                />
                <InfoRow
                  label="JS Heap Total"
                  value={formatBytes(hardwareInfo.cpuMemory.jsHeapTotal)}
                />

                {/* Memory bar */}
                {hardwareInfo.cpuMemory.jsHeapUsed && hardwareInfo.cpuMemory.jsHeapSizeLimit && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>
                      Heap Usage
                    </div>
                    <div
                      style={{
                        height: '8px',
                        backgroundColor: '#333',
                        borderRadius: '4px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${(hardwareInfo.cpuMemory.jsHeapUsed / hardwareInfo.cpuMemory.jsHeapSizeLimit) * 100}%`,
                          backgroundColor:
                            hardwareInfo.cpuMemory.jsHeapUsed / hardwareInfo.cpuMemory.jsHeapSizeLimit > 0.8
                              ? '#f55'
                              : hardwareInfo.cpuMemory.jsHeapUsed / hardwareInfo.cpuMemory.jsHeapSizeLimit > 0.5
                                ? '#fa0'
                                : '#4c8',
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                  </div>
                )}

                <SectionTitle>Platform</SectionTitle>
                <InfoRow label="Platform" value={hardwareInfo.platform.platform} />
                <InfoRow label="Language" value={hardwareInfo.platform.language} />
                <InfoRow label="Online" value={hardwareInfo.platform.onLine ? 'Yes' : 'No'} />
              </div>
            )}

            {/* Display 탭 */}
            {activeTab === 'display' && (
              <div>
                <SectionTitle>Screen</SectionTitle>
                <InfoRow
                  label="Resolution"
                  value={`${hardwareInfo.display.screenWidth} x ${hardwareInfo.display.screenHeight}`}
                  highlight
                />
                <InfoRow
                  label="Available"
                  value={`${hardwareInfo.display.availWidth} x ${hardwareInfo.display.availHeight}`}
                />
                <InfoRow
                  label="Device Pixel Ratio"
                  value={`${hardwareInfo.display.devicePixelRatio}x`}
                  highlight
                />
                <InfoRow label="Color Depth" value={`${hardwareInfo.display.colorDepth} bit`} />
                <InfoRow label="Pixel Depth" value={`${hardwareInfo.display.pixelDepth} bit`} />

                <SectionTitle>Effective Resolution</SectionTitle>
                <InfoRow
                  label="Physical Pixels"
                  value={`${Math.round(hardwareInfo.display.screenWidth * hardwareInfo.display.devicePixelRatio)} x ${Math.round(hardwareInfo.display.screenHeight * hardwareInfo.display.devicePixelRatio)}`}
                />
              </div>
            )}

            {/* Runtime 탭 */}
            {activeTab === 'runtime' && (
              <div>
                <SectionTitle>Render Performance</SectionTitle>
                {renderStats ? (
                  <>
                    <InfoRow label="FPS" value={renderStats.fps.toFixed(1)} highlight />
                    <InfoRow
                      label="Frame Time"
                      value={`${renderStats.frameTime.toFixed(2)} ms`}
                      highlight
                    />

                    {/* FPS bar */}
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>
                        FPS (target: 60)
                      </div>
                      <div
                        style={{
                          height: '8px',
                          backgroundColor: '#333',
                          borderRadius: '4px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min((renderStats.fps / 60) * 100, 100)}%`,
                            backgroundColor:
                              renderStats.fps >= 55
                                ? '#4c8'
                                : renderStats.fps >= 30
                                  ? '#fa0'
                                  : '#f55',
                            transition: 'width 0.3s',
                          }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ color: '#888', fontStyle: 'italic' }}>
                    No render stats available.
                    <br />
                    Pass renderStats prop to see live metrics.
                  </div>
                )}

                <SectionTitle>Session Info</SectionTitle>
                <InfoRow
                  label="Info Collected"
                  value={new Date(hardwareInfo.timestamp).toLocaleTimeString()}
                />
              </div>
            )}

            {/* 권장 사항 */}
            <div
              style={{
                marginTop: '16px',
                padding: '8px',
                backgroundColor: '#252525',
                borderRadius: '4px',
                borderLeft: '3px solid #4cf',
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  color: '#4cf',
                  fontWeight: 'bold',
                  marginBottom: '6px',
                }}
              >
                DICOM Viewer Compatibility
              </div>
              {recommendations.map((rec, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: '11px',
                    color: rec.includes('적합') ? '#4c8' : '#fa0',
                    marginBottom: '2px',
                  }}
                >
                  {rec.includes('적합') ? '✓' : '⚠'} {rec}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Helper Components =====

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '10px',
        color: '#888',
        textTransform: 'uppercase',
        marginTop: '12px',
        marginBottom: '6px',
        borderBottom: '1px solid #444',
        paddingBottom: '2px',
      }}
    >
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '2px 0',
      }}
    >
      <span style={{ color: '#888' }}>{label}</span>
      <span
        style={{
          color: highlight ? '#4cf' : '#e0e0e0',
          fontWeight: highlight ? 'bold' : 'normal',
          maxWidth: '200px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'right',
        }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export default HardwareInfoPanel;
