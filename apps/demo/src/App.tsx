import { useState } from 'react';
import {
  isDicomFile,
  parseDicom,
  getImageInfo,
  extractPixelData,
  isEncapsulated,
  isImageDecoderSupported,
  getTransferSyntaxName,
  type DicomDataset,
  type DicomImageInfo,
  type PixelDataInfo,
} from '@echopixel/core';
import { DicomViewport } from './components/DicomViewport';

interface ParseResult {
  isValid: boolean;
  dataset?: DicomDataset;
  imageInfo?: DicomImageInfo;
  pixelData?: PixelDataInfo;
  error?: string;
  tagCount?: number;
}

export default function App() {
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [loadingStatus, setLoadingStatus] = useState<string>('');

  // 뷰포트에 전달할 데이터
  const [viewportData, setViewportData] = useState<{
    frames: Uint8Array[];
    imageInfo: DicomImageInfo;
    isEncapsulated: boolean;
  } | null>(null);

  // DICOM 파일 처리
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 초기화
    setViewportData(null);
    setFileName(file.name);
    setParseResult(null);
    setError(null);
    setLoadingStatus('파일 로딩 중...');

    try {
      // 1. 파일을 ArrayBuffer로 읽기
      const buffer = await file.arrayBuffer();
      setLoadingStatus('DICOM 파싱 중...');

      // 2. DICOM 파일 검증
      if (!isDicomFile(buffer)) {
        setParseResult({ isValid: false, error: 'Not a valid DICOM file' });
        setLoadingStatus('');
        return;
      }

      // 3. DICOM 파싱
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

      // 4. 뷰포트 데이터 설정
      if (pixelData && pixelData.frameCount > 0 && imageInfo) {
        setViewportData({
          frames: pixelData.frames,
          imageInfo,
          isEncapsulated: pixelData.isEncapsulated,
        });
        setLoadingStatus('');
      } else {
        setLoadingStatus('픽셀 데이터가 없습니다');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setLoadingStatus('');
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif', maxWidth: '900px' }}>
      <h1 style={{ marginBottom: '20px' }}>EchoPixel Demo - DICOM Viewer</h1>

      {/* 초기 상태 / 에러 표시 */}
      {error && (
        <div style={{
          padding: '15px',
          marginBottom: '15px',
          background: '#3a1a1a',
          border: '1px solid #a44',
          borderRadius: '4px',
          color: '#f88',
        }}>
          Error: {error}
        </div>
      )}

      {/* 로딩 상태 */}
      {loadingStatus && (
        <div style={{
          padding: '10px',
          marginBottom: '15px',
          background: '#2a2a2a',
          color: '#fff',
          borderRadius: '4px',
          fontSize: '14px',
        }}>
          {loadingStatus}
        </div>
      )}

      {/* 초기 안내 */}
      {!viewportData && !loadingStatus && !error && (
        <div style={{
          padding: '10px',
          marginBottom: '15px',
          background: '#2a2a2a',
          color: '#888',
          borderRadius: '4px',
          fontSize: '14px',
        }}>
          DICOM 파일을 선택하세요 (ImageDecoder: {isImageDecoderSupported() ? '지원' : '미지원'})
        </div>
      )}

      {/* DICOM 뷰포트 */}
      {viewportData && (
        <DicomViewport
          frames={viewportData.frames}
          imageInfo={viewportData.imageInfo}
          isEncapsulated={viewportData.isEncapsulated}
          width={512}
          height={512}
        />
      )}

      {/* 파일 선택 */}
      <div style={{ marginTop: '15px', marginBottom: '20px' }}>
        <input
          type="file"
          accept=".dcm,.dicom,application/dicom"
          onChange={handleFileChange}
          style={{ fontSize: '16px' }}
        />
      </div>

      {/* 파싱 결과 (메타데이터) */}
      {parseResult && (
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
            <p style={{ color: '#f88', margin: '5px 0' }}>
              Error: {parseResult.error}
            </p>
          )}

          {parseResult.isValid && parseResult.dataset && (
            <div style={{ display: 'grid', gap: '15px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', fontSize: '13px' }}>
              {/* 기본 정보 */}
              <div>
                <h4 style={{ margin: '0 0 8px 0', color: '#8cf', fontSize: '14px' }}>기본 정보</h4>
                <p style={{ margin: '3px 0' }}>Tags: {parseResult.tagCount}</p>
                <p style={{ margin: '3px 0' }}>
                  Transfer Syntax: {getTransferSyntaxName(parseResult.dataset.transferSyntax)}
                </p>
                <p style={{ margin: '3px 0' }}>
                  압축: {isEncapsulated(parseResult.dataset.transferSyntax) ? 'Yes (Encapsulated)' : 'No (Native)'}
                </p>
              </div>

              {/* 이미지 정보 */}
              {parseResult.imageInfo && (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: '#8cf', fontSize: '14px' }}>이미지 정보</h4>
                  <p style={{ margin: '3px 0' }}>
                    크기: {parseResult.imageInfo.columns} x {parseResult.imageInfo.rows}
                  </p>
                  <p style={{ margin: '3px 0' }}>
                    Bits: {parseResult.imageInfo.bitsAllocated} / {parseResult.imageInfo.bitsStored}
                  </p>
                  <p style={{ margin: '3px 0' }}>
                    Photometric: {parseResult.imageInfo.photometricInterpretation}
                  </p>
                </div>
              )}

              {/* 픽셀 데이터 정보 */}
              {parseResult.pixelData && (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: '#8cf', fontSize: '14px' }}>픽셀 데이터</h4>
                  <p style={{ margin: '3px 0' }}>
                    프레임 수: {parseResult.pixelData.frameCount}
                  </p>
                  <p style={{ margin: '3px 0' }}>
                    형식: {parseResult.pixelData.isEncapsulated ? 'Encapsulated' : 'Native'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
