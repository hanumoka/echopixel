import { useEffect, useRef, useState } from 'react';
import {
  // DICOM 파싱
  isDicomFile,
  parseDicom,
  getImageInfo,
  extractPixelData,
  isEncapsulated,
  // 이미지 디코딩
  decodeJpeg,
  decodeNative,
  closeDecodedFrame,
  isImageDecoderSupported,
  // WebGL 렌더링
  TextureManager,
  QuadRenderer,
  // 타입
  type DicomDataset,
  type DicomImageInfo,
  type PixelDataInfo,
} from '@echopixel/core';

interface ParseResult {
  isValid: boolean;
  dataset?: DicomDataset;
  imageInfo?: DicomImageInfo;
  pixelData?: PixelDataInfo;
  error?: string;
  tagCount?: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const textureManagerRef = useRef<TextureManager | null>(null);
  const quadRendererRef = useRef<QuadRenderer | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [renderStatus, setRenderStatus] = useState<string>('');

  // WebGL 초기화
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance',
      });

      if (!gl) {
        throw new Error('WebGL2 is not supported');
      }

      glRef.current = gl;
      textureManagerRef.current = new TextureManager(gl);
      quadRendererRef.current = new QuadRenderer(gl);

      // 초기 화면: 검은색
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      setRenderStatus(`WebGL2 초기화 완료 (ImageDecoder: ${isImageDecoderSupported() ? '지원' : '미지원'})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    }

    return () => {
      textureManagerRef.current?.dispose();
      quadRendererRef.current?.dispose();
    };
  }, []);

  // DICOM 파일 처리 및 렌더링
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseResult(null);
    setRenderStatus('파일 로딩 중...');

    try {
      // 1. 파일을 ArrayBuffer로 읽기
      const buffer = await file.arrayBuffer();
      setRenderStatus('DICOM 파싱 중...');

      // 2. DICOM 파일 검증
      if (!isDicomFile(buffer)) {
        setParseResult({ isValid: false, error: 'Not a valid DICOM file' });
        setRenderStatus('오류: 유효한 DICOM 파일이 아닙니다');
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

      // 4. 렌더링 시도
      if (!pixelData || pixelData.frameCount === 0) {
        setRenderStatus('오류: 픽셀 데이터가 없습니다');
        return;
      }

      setRenderStatus(`디코딩 중... (${pixelData.frameCount} 프레임, ${pixelData.isEncapsulated ? '압축' : '비압축'})`);

      // 5. 첫 번째 프레임 디코딩
      const firstFrame = pixelData.frames[0];
      let decodedFrame;

      if (pixelData.isEncapsulated) {
        // JPEG 압축 데이터 → WebCodecs로 디코딩
        decodedFrame = await decodeJpeg(firstFrame);
      } else {
        // Native (비압축) 데이터 → 직접 변환
        decodedFrame = await decodeNative(firstFrame, {
          imageInfo,
          // Window/Level은 자동 계산 (또는 DICOM 태그에서 읽어올 수 있음)
        });
      }

      setRenderStatus('텍스처 업로드 중...');

      // 6. 텍스처 업로드
      const textureManager = textureManagerRef.current;
      const quadRenderer = quadRendererRef.current;
      const gl = glRef.current;

      if (!textureManager || !quadRenderer || !gl) {
        throw new Error('WebGL이 초기화되지 않았습니다');
      }

      textureManager.upload(decodedFrame.image);

      // 7. 렌더링
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      textureManager.bind(0);
      quadRenderer.render(0);

      // 8. VideoFrame 리소스 해제
      closeDecodedFrame(decodedFrame);

      setRenderStatus(
        `렌더링 완료! (${decodedFrame.width}x${decodedFrame.height}, ` +
        `${decodedFrame.needsClose ? 'VideoFrame' : 'ImageBitmap'})`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setParseResult({
        isValid: false,
        error: message,
      });
      setRenderStatus(`오류: ${message}`);
    }
  };

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h1>EchoPixel Demo</h1>
        <p>Failed to initialize WebGL2: {error}</p>
        <p>Please use a modern browser (Chrome, Edge, Firefox).</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>EchoPixel Demo - DICOM Viewer</h1>

      {/* 상태 표시 */}
      <div style={{
        padding: '10px',
        marginBottom: '15px',
        background: '#2a2a2a',
        color: '#fff',
        borderRadius: '4px',
        fontSize: '14px',
      }}>
        {renderStatus || 'DICOM 파일을 선택하세요'}
      </div>

      {/* 캔버스 */}
      <canvas
        ref={canvasRef}
        width={512}
        height={512}
        style={{
          border: '1px solid #444',
          background: '#000',
          display: 'block',
          marginBottom: '15px',
        }}
      />

      {/* 파일 선택 */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="file"
          accept=".dcm,.dicom,application/dicom"
          onChange={handleFileChange}
          style={{ fontSize: '16px' }}
        />
      </div>

      {/* 파싱 결과 */}
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
          <h3 style={{ margin: '0 0 10px 0' }}>
            {fileName} - {parseResult.isValid ? '✅ Valid DICOM' : '❌ Invalid'}
          </h3>

          {parseResult.error && (
            <p style={{ color: '#f88', margin: '5px 0' }}>
              Error: {parseResult.error}
            </p>
          )}

          {parseResult.isValid && parseResult.dataset && (
            <div style={{ display: 'grid', gap: '15px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              {/* 기본 정보 */}
              <div>
                <h4 style={{ margin: '0 0 8px 0', color: '#8cf' }}>기본 정보</h4>
                <p style={{ margin: '3px 0' }}>Tags: {parseResult.tagCount}</p>
                <p style={{ margin: '3px 0' }}>
                  Transfer Syntax: {parseResult.dataset.transferSyntax || 'N/A'}
                </p>
                <p style={{ margin: '3px 0' }}>
                  압축: {isEncapsulated(parseResult.dataset.transferSyntax) ? 'Yes' : 'No'}
                </p>
              </div>

              {/* 이미지 정보 */}
              {parseResult.imageInfo && (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: '#8cf' }}>이미지 정보</h4>
                  <p style={{ margin: '3px 0' }}>
                    크기: {parseResult.imageInfo.columns} x {parseResult.imageInfo.rows}
                  </p>
                  <p style={{ margin: '3px 0' }}>
                    Bits: {parseResult.imageInfo.bitsAllocated} / {parseResult.imageInfo.bitsStored}
                  </p>
                  <p style={{ margin: '3px 0' }}>
                    Photometric: {parseResult.imageInfo.photometricInterpretation}
                  </p>
                  <p style={{ margin: '3px 0' }}>
                    Samples/Pixel: {parseResult.imageInfo.samplesPerPixel}
                  </p>
                </div>
              )}

              {/* 픽셀 데이터 정보 */}
              {parseResult.pixelData && (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: '#8cf' }}>픽셀 데이터</h4>
                  <p style={{ margin: '3px 0' }}>
                    프레임 수: {parseResult.pixelData.frameCount}
                  </p>
                  <p style={{ margin: '3px 0' }}>
                    형식: {parseResult.pixelData.isEncapsulated ? 'Encapsulated (압축)' : 'Native (비압축)'}
                  </p>
                  {parseResult.pixelData.frames[0] && (
                    <p style={{ margin: '3px 0' }}>
                      첫 프레임 크기: {(parseResult.pixelData.frames[0].length / 1024).toFixed(1)} KB
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
