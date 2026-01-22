/**
 * Single Viewport 페이지
 * - 데이터 소스 선택 (Local / WADO-RS)
 * - 뷰포트 크기 설정
 * - SingleDicomViewer 렌더링
 * - 어노테이션 관리
 */

import { useState, useEffect } from 'react';
import {
  isDicomFile,
  parseDicom,
  getImageInfo,
  extractPixelData,
  isEncapsulated,
  getTransferSyntaxName,
  isImageDecoderSupported,
  type Annotation,
} from '@echopixel/core';
import { SingleDicomViewer, cn } from '@echopixel/react';
import { WadoConfigPanel, ExpandedViewModal } from '../components';
import { useWadoLoader, useAnnotations } from '../hooks';
import type { WadoConfig, ViewportData, DataSourceMode, ParseResult } from '../types/demo';

interface SingleViewportPageProps {
  wadoConfig: WadoConfig;
  onWadoConfigChange: (config: WadoConfig) => void;
}

export function SingleViewportPage({ wadoConfig, onWadoConfigChange }: SingleViewportPageProps) {
  // 데이터 소스 모드
  const [mode, setMode] = useState<DataSourceMode>('local');

  // 뷰포트 크기
  const [viewportWidth, setViewportWidth] = useState(768);
  const [viewportHeight, setViewportHeight] = useState(576);

  // 로컬 파일 상태
  const [fileName, setFileName] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [localLoading, setLocalLoading] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // 뷰포트 데이터
  const [viewportData, setViewportData] = useState<ViewportData | null>(null);

  // 확대 보기
  const [expandedView, setExpandedView] = useState(false);

  // WADO 로더 훅
  const {
    loadInstance,
    loadingStatus: wadoLoading,
    error: wadoError,
  } = useWadoLoader();

  // 어노테이션 훅
  const {
    annotations,
    setAnnotations,
    updateAnnotation,
    deleteAnnotation,
    selectedId,
    selectAnnotation,
    showAnnotations,
    setShowAnnotations,
  } = useAnnotations();

  // viewportData 변경 시 초기 어노테이션 설정
  useEffect(() => {
    if (!viewportData?.imageInfo) {
      setAnnotations([]);
      return;
    }

    const imgWidth = viewportData.imageInfo.columns;
    const imgHeight = viewportData.imageInfo.rows;

    // 초기 테스트 어노테이션
    const initialAnnotations: Annotation[] = [
      {
        id: 'single-length-1',
        dicomId: 'local-dicom',
        frameIndex: 0,
        type: 'length',
        mode: 'B',
        points: [
          { x: Math.round(imgWidth * 0.15), y: Math.round(imgHeight * 0.25) },
          { x: Math.round(imgWidth * 0.45), y: Math.round(imgHeight * 0.35) },
        ],
        value: 52.3,
        unit: 'mm',
        displayValue: '52.3 mm',
        labelPosition: { x: Math.round(imgWidth * 0.30), y: Math.round(imgHeight * 0.20) },
        color: '#00ff00',
        visible: true,
        source: 'user',
        deletable: true,
        editable: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'single-angle-1',
        dicomId: 'local-dicom',
        frameIndex: 0,
        type: 'angle',
        mode: 'B',
        points: [
          { x: Math.round(imgWidth * 0.55), y: Math.round(imgHeight * 0.20) },
          { x: Math.round(imgWidth * 0.65), y: Math.round(imgHeight * 0.45) },
          { x: Math.round(imgWidth * 0.85), y: Math.round(imgHeight * 0.30) },
        ],
        value: 72.8,
        unit: 'deg',
        displayValue: '72.8°',
        labelPosition: { x: Math.round(imgWidth * 0.75), y: Math.round(imgHeight * 0.15) },
        color: '#ffff00',
        visible: true,
        source: 'user',
        deletable: true,
        editable: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'single-point-1',
        dicomId: 'local-dicom',
        frameIndex: 0,
        type: 'point',
        mode: 'B',
        points: [
          { x: Math.round(imgWidth * 0.50), y: Math.round(imgHeight * 0.75) },
        ],
        value: 0,
        unit: '',
        displayValue: 'Marker',
        labelPosition: { x: Math.round(imgWidth * 0.55), y: Math.round(imgHeight * 0.73) },
        color: '#ff00ff',
        visible: true,
        source: 'ai',
        deletable: false,
        editable: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    setAnnotations(initialAnnotations);
  }, [viewportData, setAnnotations]);

  // 모드 변경 핸들러
  const handleModeChange = (newMode: DataSourceMode) => {
    setMode(newMode);
    setViewportData(null);
    setParseResult(null);
    setLocalError(null);
    setLocalLoading('');
  };

  // 로컬 파일 처리
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setViewportData(null);
    setFileName(file.name);
    setParseResult(null);
    setLocalError(null);
    setLocalLoading('파일 로딩 중...');

    try {
      const buffer = await file.arrayBuffer();
      setLocalLoading('DICOM 파싱 중...');

      if (!isDicomFile(buffer)) {
        setParseResult({ isValid: false, error: 'Not a valid DICOM file' });
        setLocalLoading('');
        return;
      }

      const dataset = parseDicom(buffer);
      const imageInfo = getImageInfo(buffer, dataset);
      const pixelData = extractPixelData(buffer, dataset);

      setParseResult({
        isValid: true,
        dataset,
        imageInfo,
        pixelData,
        tagCount: dataset.elements.size,
      });

      if (pixelData && pixelData.frameCount > 0 && imageInfo) {
        setViewportData({
          frames: pixelData.frames,
          imageInfo,
          isEncapsulated: pixelData.isEncapsulated,
        });
        setLocalLoading('');
      } else {
        setLocalLoading('픽셀 데이터가 없습니다');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setLocalError(message);
      setLocalLoading('');
    }
  };

  // WADO-RS 로드
  const handleWadoLoad = async () => {
    setViewportData(null);
    setParseResult(null);

    const data = await loadInstance(wadoConfig);
    if (data) {
      setViewportData(data);
    }
  };

  const error = mode === 'local' ? localError : wadoError;
  const loading = mode === 'local' ? localLoading : wadoLoading;

  return (
    <div>
      {/* 모드 설명 패널 */}
      <div className="p-4 mb-4 bg-[#2d1f3d] border border-[#a47] rounded-md">
        <h3 className="m-0 mb-2.5 text-[#e8b4f8] text-lg">
          🖼️ Single Viewport
        </h3>
        <p className="m-0 text-[#b8a8c8] text-base leading-relaxed">
          단일 DICOM 파일을 로드하여 하나의 뷰포트에서 재생합니다.
          로컬 파일 또는 WADO-RS 서버에서 데이터를 가져올 수 있습니다.
          Window/Level, Pan, Zoom, 프레임 탐색 등 기본 도구를 테스트할 수 있습니다.
        </p>
        <div className="mt-2 text-xs text-[#7a7]">
          Using: @echopixel/react SingleDicomViewer
        </div>
      </div>

      {/* 데이터 소스 모드 선택 */}
      <div className="flex gap-2.5 mb-5">
        <button
          onClick={() => handleModeChange('local')}
          className={cn(
            'px-5 py-2.5 rounded-md cursor-pointer transition-all duration-200',
            mode === 'local'
              ? 'bg-[#3d2d4d] text-[#e8b4f8] border border-[#a47] font-bold'
              : 'bg-[#252525] text-text-muted border border-[#444] font-normal hover:bg-[#303030]'
          )}
        >
          📁 Local File
        </button>
        <button
          onClick={() => handleModeChange('wado-rs')}
          className={cn(
            'px-5 py-2.5 rounded-md cursor-pointer transition-all duration-200',
            mode === 'wado-rs'
              ? 'bg-[#3d2d4d] text-[#e8b4f8] border border-[#a47] font-bold'
              : 'bg-[#252525] text-text-muted border border-[#444] font-normal hover:bg-[#303030]'
          )}
        >
          🌐 WADO-RS
        </button>
      </div>

      {/* 뷰포트 사이즈 조정 */}
      <div className="flex items-center gap-4 mb-4 px-4 py-2.5 bg-[#252525] rounded-md text-base">
        <span className="text-text-muted">📐 Size:</span>
        <label className="flex items-center gap-1.5 text-text-secondary">
          W:
          <input
            type="number"
            min={200}
            max={1920}
            value={viewportWidth}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val)) setViewportWidth(val);
            }}
            onBlur={(e) => {
              const val = parseInt(e.target.value) || 768;
              setViewportWidth(Math.max(200, Math.min(1920, val)));
            }}
            className="w-[70px] px-2 py-1 bg-viewer-surface-alt border border-[#444] rounded-sm text-white text-base"
          />
        </label>
        <label className="flex items-center gap-1.5 text-text-secondary">
          H:
          <input
            type="number"
            min={200}
            max={1080}
            value={viewportHeight}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val)) setViewportHeight(val);
            }}
            onBlur={(e) => {
              const val = parseInt(e.target.value) || 576;
              setViewportHeight(Math.max(200, Math.min(1080, val)));
            }}
            className="w-[70px] px-2 py-1 bg-viewer-surface-alt border border-[#444] rounded-sm text-white text-base"
          />
        </label>
        <div className="flex gap-1.5">
          {[
            { w: 512, h: 384 },
            { w: 768, h: 576 },
            { w: 1024, h: 768 },
          ].map(({ w, h }) => (
            <button
              key={`${w}x${h}`}
              onClick={() => {
                setViewportWidth(w);
                setViewportHeight(h);
              }}
              className="px-2 py-1 bg-[#2a2a2a] border border-[#444] rounded-sm text-text-secondary cursor-pointer text-xs hover:bg-[#3a3a3a]"
            >
              {w}×{h}
            </button>
          ))}
        </div>
      </div>

      {/* 에러/로딩 상태 */}
      {error && (
        <div className="p-4 mb-4 bg-[#3a1a1a] border border-[#a44] rounded-md text-[#f88]">
          Error: {error}
        </div>
      )}

      {loading && (
        <div className="p-2.5 mb-4 bg-[#2a2a2a] text-white rounded-md text-lg">
          {loading}
        </div>
      )}

      {/* 초기 안내 - 로컬 모드 */}
      {mode === 'local' && !viewportData && !loading && !error && (
        <div className="p-2.5 mb-4 bg-[#2a2a2a] text-text-muted rounded-md text-lg">
          DICOM 파일을 선택하세요 (ImageDecoder: {isImageDecoderSupported() ? '지원' : '미지원'})
        </div>
      )}

      {/* WADO-RS 입력 폼 */}
      {mode === 'wado-rs' && !viewportData && !loading && (
        <WadoConfigPanel
          config={wadoConfig}
          onChange={onWadoConfigChange}
          onLoad={handleWadoLoad}
          loading={!!loading}
          className="mb-4"
        />
      )}

      {/* DICOM 뷰포트 */}
      {viewportData && (
        <div
          onDoubleClick={() => setExpandedView(true)}
          className="cursor-pointer"
          title="더블클릭하여 확대 보기"
        >
          <SingleDicomViewer
            frames={viewportData.frames}
            imageInfo={viewportData.imageInfo}
            isEncapsulated={viewportData.isEncapsulated}
            width={viewportWidth}
            height={viewportHeight}
            showToolbar={true}
            showContextLossTest={true}
            annotations={annotations}
            onAnnotationUpdate={updateAnnotation}
            selectedAnnotationId={selectedId}
            onAnnotationSelect={selectAnnotation}
            onAnnotationDelete={deleteAnnotation}
            showAnnotations={showAnnotations}
            onAnnotationsVisibilityChange={setShowAnnotations}
          />
        </div>
      )}

      {/* 확대 보기 모달 */}
      {viewportData && (
        <ExpandedViewModal
          isOpen={expandedView}
          onClose={() => setExpandedView(false)}
          title={fileName || 'DICOM Image'}
          frames={viewportData.frames}
          imageInfo={viewportData.imageInfo}
          isEncapsulated={viewportData.isEncapsulated}
          annotations={annotations}
          selectedAnnotationId={selectedId}
          onAnnotationSelect={selectAnnotation}
          onAnnotationUpdate={updateAnnotation}
          onAnnotationDelete={deleteAnnotation}
          showAnnotations={showAnnotations}
        />
      )}

      {/* 파일 선택 - 로컬 모드만 */}
      {mode === 'local' && (
        <div className="mt-4 mb-5">
          <input
            type="file"
            accept=".dcm,.dicom,application/dicom"
            onChange={handleFileChange}
            className="text-lg"
          />
        </div>
      )}

      {/* 파싱 결과 (메타데이터) - 로컬 모드만 */}
      {mode === 'local' && parseResult && (
        <div
          className={cn(
            'p-4 rounded-md text-white',
            parseResult.isValid
              ? 'bg-[#1a3a1a] border border-[#4a4]'
              : 'bg-[#3a1a1a] border border-[#a44]'
          )}
        >
          <h3 className="m-0 mb-2.5 text-lg">
            {fileName} - {parseResult.isValid ? '✅ Valid DICOM' : '❌ Invalid'}
          </h3>

          {parseResult.error && (
            <p className="text-[#f88] my-1.5">Error: {parseResult.error}</p>
          )}

          {parseResult.isValid && parseResult.dataset && (
            <div className="grid gap-4 text-base" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <div>
                <h4 className="m-0 mb-2 text-accent-info text-lg">기본 정보</h4>
                <p className="my-1">Tags: {parseResult.tagCount}</p>
                <p className="my-1">
                  Transfer Syntax: {getTransferSyntaxName(parseResult.dataset.transferSyntax)}
                </p>
                <p className="my-1">
                  압축: {isEncapsulated(parseResult.dataset.transferSyntax) ? 'Yes' : 'No'}
                </p>
              </div>

              {parseResult.imageInfo && (
                <div>
                  <h4 className="m-0 mb-2 text-accent-info text-lg">이미지 정보</h4>
                  <p className="my-1">
                    크기: {parseResult.imageInfo.columns} x {parseResult.imageInfo.rows}
                  </p>
                  <p className="my-1">
                    Bits: {parseResult.imageInfo.bitsAllocated} / {parseResult.imageInfo.bitsStored}
                  </p>
                </div>
              )}

              {parseResult.pixelData && (
                <div>
                  <h4 className="m-0 mb-2 text-accent-info text-lg">픽셀 데이터</h4>
                  <p className="my-1">프레임 수: {parseResult.pixelData.frameCount}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
