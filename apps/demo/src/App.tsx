import { useState } from 'react';
import {
  isDicomFile,
  parseDicom,
  getImageInfo,
  extractPixelData,
  isEncapsulated,
  isImageDecoderSupported,
  getTransferSyntaxName,
  WadoRsDataSource,
  type DicomDataset,
  type DicomImageInfo,
  type PixelDataInfo,
  type DicomInstanceId,
  type DicomMetadata,
} from '@echopixel/core';
import { DicomViewport } from './components/DicomViewport';

type DataSourceMode = 'local' | 'wado-rs';

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

  // 데이터 소스 모드
  const [mode, setMode] = useState<DataSourceMode>('local');

  // WADO-RS 설정 (테스트용 기본값 설정)
  const [wadoBaseUrl, setWadoBaseUrl] = useState('http://localhost:10201/dicomweb');
  const [studyUid, setStudyUid] = useState('1.2.410.2000010.82.2291.2816285240528008');
  const [seriesUid, setSeriesUid] = useState('1.2.840.113619.2.391.60843.1732524731.1.1');
  const [instanceUid, setInstanceUid] = useState('1.2.840.113619.2.391.60843.1732524816.3.1.512');

  // DataSource와 InstanceId
  const [wadoDataSource, setWadoDataSource] = useState<WadoRsDataSource | null>(null);
  const [instanceId, setInstanceId] = useState<DicomInstanceId | null>(null);
  const [wadoMetadata, setWadoMetadata] = useState<DicomMetadata | null>(null);

  // 뷰포트에 전달할 데이터 (로컬 모드용)
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

  // WADO-RS 로드 핸들러
  const handleWadoLoad = () => {
    if (!studyUid || !seriesUid || !instanceUid) {
      setError('Study UID, Series UID, Instance UID를 모두 입력하세요');
      return;
    }

    // 기존 데이터 초기화
    setViewportData(null);
    setParseResult(null);
    setError(null);

    // DataSource 생성
    const dataSource = new WadoRsDataSource({
      baseUrl: wadoBaseUrl,
      timeout: 30000,
      maxRetries: 3,
    });

    setWadoDataSource(dataSource);
    setInstanceId({
      studyInstanceUid: studyUid,
      seriesInstanceUid: seriesUid,
      sopInstanceUid: instanceUid,
    });
  };

  // 모드 변경 핸들러
  const handleModeChange = (newMode: DataSourceMode) => {
    setMode(newMode);
    // 모드 변경 시 상태 초기화
    setViewportData(null);
    setParseResult(null);
    setError(null);
    setWadoDataSource(null);
    setInstanceId(null);
    setWadoMetadata(null);
    setLoadingStatus('');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif', maxWidth: '900px' }}>
      <h1 style={{ marginBottom: '20px' }}>EchoPixel Demo - DICOM Viewer</h1>

      {/* 모드 선택 */}
      <div style={{
        display: 'flex',
        gap: '10px',
        marginBottom: '20px',
      }}>
        <button
          onClick={() => handleModeChange('local')}
          style={{
            padding: '10px 20px',
            background: mode === 'local' ? '#4a7' : '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: mode === 'local' ? 'bold' : 'normal',
          }}
        >
          Local File
        </button>
        <button
          onClick={() => handleModeChange('wado-rs')}
          style={{
            padding: '10px 20px',
            background: mode === 'wado-rs' ? '#47a' : '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: mode === 'wado-rs' ? 'bold' : 'normal',
          }}
        >
          WADO-RS
        </button>
      </div>

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

      {/* 초기 안내 - 로컬 모드 */}
      {mode === 'local' && !viewportData && !loadingStatus && !error && (
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

      {/* WADO-RS 입력 폼 */}
      {mode === 'wado-rs' && !instanceId && (
        <div style={{
          padding: '15px',
          marginBottom: '15px',
          background: '#1a2a3a',
          border: '1px solid #47a',
          borderRadius: '4px',
        }}>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', color: '#8cf', marginBottom: '5px', fontSize: '13px' }}>
              DICOM Web Base URL
            </label>
            <input
              type="text"
              value={wadoBaseUrl}
              onChange={(e) => setWadoBaseUrl(e.target.value)}
              placeholder="http://localhost:8080/dicomweb"
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                background: '#2a2a3a',
                border: '1px solid #555',
                borderRadius: '4px',
                color: '#fff',
              }}
            />
          </div>
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div>
              <label style={{ display: 'block', color: '#8cf', marginBottom: '5px', fontSize: '13px' }}>
                Study Instance UID
              </label>
              <input
                type="text"
                value={studyUid}
                onChange={(e) => setStudyUid(e.target.value)}
                placeholder="1.2.3.4..."
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '14px',
                  background: '#2a2a3a',
                  border: '1px solid #555',
                  borderRadius: '4px',
                  color: '#fff',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: '#8cf', marginBottom: '5px', fontSize: '13px' }}>
                Series Instance UID
              </label>
              <input
                type="text"
                value={seriesUid}
                onChange={(e) => setSeriesUid(e.target.value)}
                placeholder="1.2.3.4..."
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '14px',
                  background: '#2a2a3a',
                  border: '1px solid #555',
                  borderRadius: '4px',
                  color: '#fff',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: '#8cf', marginBottom: '5px', fontSize: '13px' }}>
                SOP Instance UID
              </label>
              <input
                type="text"
                value={instanceUid}
                onChange={(e) => setInstanceUid(e.target.value)}
                placeholder="1.2.3.4..."
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '14px',
                  background: '#2a2a3a',
                  border: '1px solid #555',
                  borderRadius: '4px',
                  color: '#fff',
                }}
              />
            </div>
          </div>
          <button
            onClick={handleWadoLoad}
            style={{
              marginTop: '15px',
              padding: '10px 20px',
              background: '#47a',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Load from WADO-RS
          </button>
        </div>
      )}

      {/* DICOM 뷰포트 - 로컬 모드 */}
      {mode === 'local' && viewportData && (
        <DicomViewport
          frames={viewportData.frames}
          imageInfo={viewportData.imageInfo}
          isEncapsulated={viewportData.isEncapsulated}
          width={512}
          height={512}
        />
      )}

      {/* DICOM 뷰포트 - WADO-RS 모드 */}
      {mode === 'wado-rs' && wadoDataSource && instanceId && (
        <DicomViewport
          dataSource={wadoDataSource}
          instanceId={instanceId}
          width={512}
          height={512}
          onMetadataLoaded={(metadata) => setWadoMetadata(metadata)}
          onError={(err) => setError(err.message)}
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

      {/* WADO-RS 메타데이터 표시 */}
      {mode === 'wado-rs' && wadoMetadata && (
        <div
          style={{
            padding: '15px',
            marginTop: '15px',
            background: '#1a2a3a',
            border: '1px solid #47a',
            borderRadius: '4px',
            color: '#fff',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>
            WADO-RS Metadata
          </h3>
          <div style={{ display: 'grid', gap: '15px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', fontSize: '13px' }}>
            {/* 기본 정보 */}
            <div>
              <h4 style={{ margin: '0 0 8px 0', color: '#8cf', fontSize: '14px' }}>기본 정보</h4>
              <p style={{ margin: '3px 0' }}>
                Transfer Syntax: {getTransferSyntaxName(wadoMetadata.transferSyntax)}
              </p>
              <p style={{ margin: '3px 0' }}>
                압축: {wadoMetadata.isEncapsulated ? 'Yes (Encapsulated)' : 'No (Native)'}
              </p>
            </div>

            {/* 이미지 정보 */}
            <div>
              <h4 style={{ margin: '0 0 8px 0', color: '#8cf', fontSize: '14px' }}>이미지 정보</h4>
              <p style={{ margin: '3px 0' }}>
                크기: {wadoMetadata.imageInfo.columns} x {wadoMetadata.imageInfo.rows}
              </p>
              <p style={{ margin: '3px 0' }}>
                Bits: {wadoMetadata.imageInfo.bitsAllocated} / {wadoMetadata.imageInfo.bitsStored}
              </p>
              <p style={{ margin: '3px 0' }}>
                Photometric: {wadoMetadata.imageInfo.photometricInterpretation}
              </p>
            </div>

            {/* 프레임 정보 */}
            <div>
              <h4 style={{ margin: '0 0 8px 0', color: '#8cf', fontSize: '14px' }}>프레임 정보</h4>
              <p style={{ margin: '3px 0' }}>
                프레임 수: {wadoMetadata.frameCount}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
