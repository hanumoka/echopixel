/**
 * Single Viewport 페이지
 * - 데이터 소스 선택 (Local / WADO-RS)
 * - 뷰포트 크기 설정
 * - SingleDicomViewer 렌더링
 * - 어노테이션 관리
 */

import { useState, useCallback, useEffect } from 'react';
import {
  isDicomFile,
  parseDicom,
  getImageInfo,
  extractPixelData,
  isEncapsulated,
  getTransferSyntaxName,
  isImageDecoderSupported,
  type DicomDataset,
  type DicomImageInfo,
  type PixelDataInfo,
  type Annotation,
} from '@echopixel/core';
import { SingleDicomViewer } from '@echopixel/react';
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
      <div
        style={{
          padding: '15px',
          marginBottom: '15px',
          background: '#2d1f3d',
          border: '1px solid #a47',
          borderRadius: '4px',
        }}
      >
        <h3 style={{ margin: '0 0 10px 0', color: '#e8b4f8', fontSize: '16px' }}>
          🖼️ Single Viewport
        </h3>
        <p style={{ margin: 0, color: '#b8a8c8', fontSize: '13px', lineHeight: '1.5' }}>
          단일 DICOM 파일을 로드하여 하나의 뷰포트에서 재생합니다.
          로컬 파일 또는 WADO-RS 서버에서 데이터를 가져올 수 있습니다.
          Window/Level, Pan, Zoom, 프레임 탐색 등 기본 도구를 테스트할 수 있습니다.
        </p>
        <div style={{ marginTop: '8px', fontSize: '11px', color: '#7a7' }}>
          Using: @echopixel/react SingleDicomViewer
        </div>
      </div>

      {/* 데이터 소스 모드 선택 */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          onClick={() => handleModeChange('local')}
          style={{
            padding: '10px 20px',
            background: mode === 'local' ? '#3d2d4d' : '#252525',
            color: mode === 'local' ? '#e8b4f8' : '#888',
            border: mode === 'local' ? '1px solid #a47' : '1px solid #444',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: mode === 'local' ? 'bold' : 'normal',
            transition: 'all 0.2s',
          }}
        >
          📁 Local File
        </button>
        <button
          onClick={() => handleModeChange('wado-rs')}
          style={{
            padding: '10px 20px',
            background: mode === 'wado-rs' ? '#3d2d4d' : '#252525',
            color: mode === 'wado-rs' ? '#e8b4f8' : '#888',
            border: mode === 'wado-rs' ? '1px solid #a47' : '1px solid #444',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: mode === 'wado-rs' ? 'bold' : 'normal',
            transition: 'all 0.2s',
          }}
        >
          🌐 WADO-RS
        </button>
      </div>

      {/* 뷰포트 사이즈 조정 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '15px',
          marginBottom: '15px',
          padding: '10px 15px',
          background: '#252525',
          borderRadius: '4px',
          fontSize: '13px',
        }}
      >
        <span style={{ color: '#888' }}>📐 Size:</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#aaa' }}>
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
            style={{
              width: '70px',
              padding: '4px 8px',
              background: '#1a1a1a',
              border: '1px solid #444',
              borderRadius: '3px',
              color: '#fff',
              fontSize: '13px',
            }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#aaa' }}>
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
            style={{
              width: '70px',
              padding: '4px 8px',
              background: '#1a1a1a',
              border: '1px solid #444',
              borderRadius: '3px',
              color: '#fff',
              fontSize: '13px',
            }}
          />
        </label>
        <div style={{ display: 'flex', gap: '5px' }}>
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
              style={{
                padding: '4px 8px',
                background: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '3px',
                color: '#aaa',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              {w}×{h}
            </button>
          ))}
        </div>
      </div>

      {/* 에러/로딩 상태 */}
      {error && (
        <div
          style={{
            padding: '15px',
            marginBottom: '15px',
            background: '#3a1a1a',
            border: '1px solid #a44',
            borderRadius: '4px',
            color: '#f88',
          }}
        >
          Error: {error}
        </div>
      )}

      {loading && (
        <div
          style={{
            padding: '10px',
            marginBottom: '15px',
            background: '#2a2a2a',
            color: '#fff',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          {loading}
        </div>
      )}

      {/* 초기 안내 - 로컬 모드 */}
      {mode === 'local' && !viewportData && !loading && !error && (
        <div
          style={{
            padding: '10px',
            marginBottom: '15px',
            background: '#2a2a2a',
            color: '#888',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
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
          style={{ marginBottom: '15px' }}
        />
      )}

      {/* DICOM 뷰포트 */}
      {viewportData && (
        <div
          onDoubleClick={() => setExpandedView(true)}
          style={{ cursor: 'pointer' }}
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
        <div style={{ marginTop: '15px', marginBottom: '20px' }}>
          <input
            type="file"
            accept=".dcm,.dicom,application/dicom"
            onChange={handleFileChange}
            style={{ fontSize: '16px' }}
          />
        </div>
      )}

      {/* 파싱 결과 (메타데이터) - 로컬 모드만 */}
      {mode === 'local' && parseResult && (
        <div
          style={{
            padding: '15px',
            background: parseResult.isValid ? '#1a3a1a' : '#3a1a1a',
            border: `1px solid ${parseResult.isValid ? '#4a4' : '#a44'}`,
            borderRadius: '4px',
            color: '#fff',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>
            {fileName} - {parseResult.isValid ? '✅ Valid DICOM' : '❌ Invalid'}
          </h3>

          {parseResult.error && (
            <p style={{ color: '#f88', margin: '5px 0' }}>Error: {parseResult.error}</p>
          )}

          {parseResult.isValid && parseResult.dataset && (
            <div
              style={{
                display: 'grid',
                gap: '15px',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                fontSize: '13px',
              }}
            >
              <div>
                <h4 style={{ margin: '0 0 8px 0', color: '#8cf', fontSize: '14px' }}>기본 정보</h4>
                <p style={{ margin: '3px 0' }}>Tags: {parseResult.tagCount}</p>
                <p style={{ margin: '3px 0' }}>
                  Transfer Syntax: {getTransferSyntaxName(parseResult.dataset.transferSyntax)}
                </p>
                <p style={{ margin: '3px 0' }}>
                  압축: {isEncapsulated(parseResult.dataset.transferSyntax) ? 'Yes' : 'No'}
                </p>
              </div>

              {parseResult.imageInfo && (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: '#8cf', fontSize: '14px' }}>이미지 정보</h4>
                  <p style={{ margin: '3px 0' }}>
                    크기: {parseResult.imageInfo.columns} x {parseResult.imageInfo.rows}
                  </p>
                  <p style={{ margin: '3px 0' }}>
                    Bits: {parseResult.imageInfo.bitsAllocated} / {parseResult.imageInfo.bitsStored}
                  </p>
                </div>
              )}

              {parseResult.pixelData && (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: '#8cf', fontSize: '14px' }}>픽셀 데이터</h4>
                  <p style={{ margin: '3px 0' }}>프레임 수: {parseResult.pixelData.frameCount}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
