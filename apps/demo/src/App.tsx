/**
 * EchoPixel Demo App
 *
 * 리팩토링된 버전: 탭 전환 및 공통 설정만 관리
 * 각 뷰 모드는 별도 페이지 컴포넌트에서 처리
 */

import { useState } from 'react';
import { cn } from '@echopixel/react';
import { HardwareInfoPanel } from './components/HardwareInfoPanel';
import {
  SingleViewportPage,
  MultiCanvasPage,
  MultiViewportPage,
  PerfTestPage,
} from './pages';
import type { ViewMode, WadoConfig } from './types/demo';

// 탭 색상 정의
const TAB_COLORS = {
  single: {
    bg: 'bg-[#2d1f3d]',
    text: 'text-[#e8b4f8]',
    border: 'border-b-[#a47]',
  },
  'multi-canvas': {
    bg: 'bg-[#1f2d3d]',
    text: 'text-[#b4d8f8]',
    border: 'border-b-[#47a]',
  },
  multi: {
    bg: 'bg-[#1f3d2d]',
    text: 'text-[#b4f8c8]',
    border: 'border-b-[#7a4]',
  },
  'perf-test': {
    bg: 'bg-[#3d2d1f]',
    text: 'text-[#f8d8b4]',
    border: 'border-b-[#a74]',
  },
} as const;

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

  // 탭 버튼 렌더링
  const renderTab = (mode: ViewMode, label: string) => {
    const isActive = viewMode === mode;
    const colors = TAB_COLORS[mode];

    return (
      <button
        key={mode}
        onClick={() => setViewMode(mode)}
        className={cn(
          'px-6 py-3 border-none rounded-t-lg cursor-pointer text-lg transition-all duration-200 border-b-[3px]',
          isActive
            ? `${colors.bg} ${colors.text} ${colors.border} font-bold`
            : 'bg-viewer-surface-alt text-text-muted border-b-transparent font-normal'
        )}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="p-5 font-sans max-w-[1400px] mx-auto min-h-screen bg-[#121218] text-[#e0e0e0]">
      {/* Hardware Info Panel */}
      <HardwareInfoPanel
        defaultOpen={false}
        position="right"
      />

      <h1 className="mb-5 text-white text-2xl">EchoPixel Demo - DICOM Viewer</h1>

      {/* 뷰 모드 선택 탭 */}
      <div className="flex gap-1 mb-5 border-b-2 border-[#333] pb-0">
        {renderTab('single', 'Single ViewPort')}
        {renderTab('multi-canvas', 'Multi ViewPort (Single viewPort 기반)')}
        {renderTab('multi', 'Multi ViewPort (Single canvas 기반)')}
        {renderTab('perf-test', 'Performance Test (Pure WebGL)')}
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
