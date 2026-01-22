/**
 * EchoPixel Demo App
 *
 * 리팩토링된 버전: 탭 전환 및 공통 설정만 관리
 * 각 뷰 모드는 별도 페이지 컴포넌트에서 처리
 */

import { useState, useRef } from 'react';
import { HardwareInfoPanel, type TextureMemoryInfo } from './components/HardwareInfoPanel';
import {
  SingleViewportPage,
  MultiCanvasPage,
  MultiViewportPage,
  PerfTestPage,
} from './pages';
import type { ViewMode, WadoConfig } from './types/demo';

export default function App() {
  // 현재 뷰 모드
  const [viewMode, setViewMode] = useState<ViewMode>('single');

  // 공유 WADO-RS 설정 (접속한 호스트 기반으로 자동 설정)
  const [wadoConfig, setWadoConfig] = useState<WadoConfig>({
    baseUrl: `http://${window.location.hostname}:10201/dicomweb`,
    studyUid: '1.2.410.2000010.82.2291.2816285240528008',
    seriesUid: '1.2.840.113619.2.391.60843.1732524731.1.1',
    instanceUid: '1.2.840.113619.2.391.60843.1732524816.3.1.512',
  });

  // WebGL context ref (HardwareInfoPanel용)
  const glRef = useRef<WebGL2RenderingContext | null>(null);

  // 탭 스타일
  const getTabStyle = (mode: ViewMode, colors: { bg: string; activeBg: string; color: string; activeColor: string; border: string }) => ({
    padding: '12px 24px',
    background: viewMode === mode ? colors.activeBg : '#1a1a1a',
    color: viewMode === mode ? colors.activeColor : '#888',
    border: 'none',
    borderRadius: '8px 8px 0 0',
    cursor: 'pointer',
    fontWeight: viewMode === mode ? 'bold' : 'normal',
    fontSize: '14px',
    borderBottom: viewMode === mode ? `3px solid ${colors.border}` : '3px solid transparent',
    transition: 'all 0.2s',
  });

  return (
    <div
      style={{
        padding: '20px',
        fontFamily: 'system-ui, sans-serif',
        maxWidth: '1400px',
        margin: '0 auto',
        minHeight: '100vh',
        background: '#121218',
        color: '#e0e0e0',
      }}
    >
      {/* Hardware Info Panel */}
      <HardwareInfoPanel
        gl={glRef.current}
        defaultOpen={false}
        position="right"
      />

      <h1 style={{ marginBottom: '20px', color: '#fff' }}>EchoPixel Demo - DICOM Viewer</h1>

      {/* 뷰 모드 선택 탭 */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '20px',
          borderBottom: '2px solid #333',
          paddingBottom: '0',
        }}
      >
        <button
          onClick={() => setViewMode('single')}
          style={getTabStyle('single', {
            bg: '#1a1a1a',
            activeBg: '#2d1f3d',
            color: '#888',
            activeColor: '#e8b4f8',
            border: '#a47',
          })}
        >
          Single ViewPort
        </button>
        <button
          onClick={() => setViewMode('multi-canvas')}
          style={getTabStyle('multi-canvas', {
            bg: '#1a1a1a',
            activeBg: '#1f2d3d',
            color: '#888',
            activeColor: '#b4d8f8',
            border: '#47a',
          })}
        >
          Multi ViewPort (Single viewPort 기반)
        </button>
        <button
          onClick={() => setViewMode('multi')}
          style={getTabStyle('multi', {
            bg: '#1a1a1a',
            activeBg: '#1f3d2d',
            color: '#888',
            activeColor: '#b4f8c8',
            border: '#7a4',
          })}
        >
          Multi ViewPort (Single canvas 기반)
        </button>
        <button
          onClick={() => setViewMode('perf-test')}
          style={getTabStyle('perf-test', {
            bg: '#1a1a1a',
            activeBg: '#3d2d1f',
            color: '#888',
            activeColor: '#f8d8b4',
            border: '#a74',
          })}
        >
          Performance Test (Pure WebGL)
        </button>
      </div>

      {/* 페이지 렌더링 */}
      {viewMode === 'single' && (
        <SingleViewportPage
          wadoConfig={wadoConfig}
          onWadoConfigChange={setWadoConfig}
        />
      )}
      {viewMode === 'multi-canvas' && (
        <MultiCanvasPage
          wadoConfig={wadoConfig}
          onWadoConfigChange={setWadoConfig}
        />
      )}
      {viewMode === 'multi' && (
        <MultiViewportPage
          wadoConfig={wadoConfig}
          onWadoConfigChange={setWadoConfig}
        />
      )}
      {viewMode === 'perf-test' && (
        <PerfTestPage
          wadoConfig={wadoConfig}
          onWadoConfigChange={setWadoConfig}
        />
      )}
    </div>
  );
}
