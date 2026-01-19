import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  isDicomFile,
  parseDicom,
  getImageInfo,
  extractPixelData,
  isEncapsulated,
  isImageDecoderSupported,
  getTransferSyntaxName,
  WadoRsDataSource,
  ViewportManager,
  RenderScheduler,
  FrameSyncEngine,
  TextureManager,
  ArrayTextureRenderer,
  decodeJpeg,
  decodeNative,
  closeDecodedFrame,
  type DicomDataset,
  type DicomImageInfo,
  type PixelDataInfo,
  type DicomInstanceId,
  type DicomMetadata,
  type LayoutType,
  type Viewport,
} from '@echopixel/core';
import { DicomViewport } from './components/DicomViewport';
import { MultiCanvasGrid } from './components/MultiCanvasGrid';

type ViewMode = 'single' | 'multi' | 'multi-canvas';
type DataSourceMode = 'local' | 'wado-rs';

interface ParseResult {
  isValid: boolean;
  dataset?: DicomDataset;
  imageInfo?: DicomImageInfo;
  pixelData?: PixelDataInfo;
  error?: string;
  tagCount?: number;
}

// Instance UID 스캔 결과
interface ScannedInstance {
  uid: string;
  frameCount: number;
  width: number;
  height: number;
  isPlayable: boolean; // frameCount > 1
  isEncapsulated: boolean;
  error?: string;
}


export default function App() {
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [loadingStatus, setLoadingStatus] = useState<string>('');

  // 뷰 모드 (단일/멀티)
  const [viewMode, setViewMode] = useState<ViewMode>('single');

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

  // === 멀티 뷰포트 관련 상태 ===
  const [layout, setLayout] = useState<LayoutType>('grid-2x2');
  const [multiViewportReady, setMultiViewportReady] = useState(false);
  const [multiLoadingStatus, setMultiLoadingStatus] = useState('');
  const [multiStats, setMultiStats] = useState({ fps: 0, frameTime: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(30);

  // Instance UID 스캔 및 선택 상태
  const [scannedInstances, setScannedInstances] = useState<ScannedInstance[]>([]);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [scanningStatus, setScanningStatus] = useState<string>('');

  // Multi Canvas 모드 상태
  const [multiCanvasLoaded, setMultiCanvasLoaded] = useState(false);
  const [multiCanvasUids, setMultiCanvasUids] = useState<string[]>([]);
  const [multiCanvasCount, setMultiCanvasCount] = useState<number>(1); // 1~4개

  // Multi Canvas용 DataSource (안정적인 참조 유지)
  const multiCanvasDataSource = useMemo(() => {
    if (!multiCanvasLoaded) return null;
    return new WadoRsDataSource({
      baseUrl: wadoBaseUrl,
      timeout: 60000,
      maxRetries: 3,
    });
  // wadoBaseUrl이 변경되거나 multiCanvasLoaded가 true가 될 때만 재생성
  }, [wadoBaseUrl, multiCanvasLoaded]);

  // 멀티 뷰포트 refs
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const viewportManagerRef = useRef<ViewportManager | null>(null);
  const renderSchedulerRef = useRef<RenderScheduler | null>(null);
  const syncEngineRef = useRef<FrameSyncEngine | null>(null);
  const textureManagersRef = useRef<Map<string, TextureManager>>(new Map());
  const arrayRendererRef = useRef<ArrayTextureRenderer | null>(null);
  const [viewports, setViewports] = useState<Viewport[]>([]);

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

  // WADO-RS 로드 핸들러 (단일 뷰포트)
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

  // 뷰 모드 변경 핸들러
  const handleViewModeChange = (newViewMode: ViewMode) => {
    // 기존 Multi Viewport (Single Canvas) 리소스 정리
    const existingCleanup = (window as unknown as { multiViewportCleanup?: () => void }).multiViewportCleanup;
    if (existingCleanup) {
      console.log('[ViewMode] Cleaning up Multi Viewport resources...');
      existingCleanup();
      (window as unknown as { multiViewportCleanup?: () => void }).multiViewportCleanup = undefined;
    }

    setViewMode(newViewMode);
    // 모드 변경 시 상태 초기화
    setViewportData(null);
    setParseResult(null);
    setError(null);
    setWadoDataSource(null);
    setInstanceId(null);
    setWadoMetadata(null);
    setLoadingStatus('');
    setMultiViewportReady(false);
    setMultiLoadingStatus('');
    setIsPlaying(false);
    setViewports([]);  // 뷰포트 목록 초기화
    setSelectedUids(new Set());  // 선택된 Instance 초기화
    // Multi Canvas 상태 초기화
    setMultiCanvasLoaded(false);
    setMultiCanvasUids([]);
  };

  // === 멀티 뷰포트 관련 함수 ===

  // Instance UID 스캔 (WADO-RS API로 Series 내 모든 Instance 조회 후 메타데이터 확인)
  const handleScanInstances = async () => {
    setScanningStatus('Instance 목록 조회 중...');
    setScannedInstances([]);
    setSelectedUids(new Set());
    setError(null);

    const dataSource = new WadoRsDataSource({
      baseUrl: wadoBaseUrl,
      timeout: 30000,
      maxRetries: 2,
    });

    try {
      // 1. Series 내 모든 Instance UID 조회
      const instanceUids = await dataSource.listInstances(studyUid, seriesUid);

      if (instanceUids.length === 0) {
        setError('Series에서 Instance를 찾을 수 없습니다');
        setScanningStatus('');
        return;
      }

      console.log(`[Scan] Found ${instanceUids.length} instances in series`);

      // 2. 각 Instance의 메타데이터 조회
      const results: ScannedInstance[] = [];

      for (let i = 0; i < instanceUids.length; i++) {
        const uid = instanceUids[i];
        setScanningStatus(`메타데이터 조회 중... (${i + 1}/${instanceUids.length})`);

        try {
          const metadata = await dataSource.loadMetadata({
            studyInstanceUid: studyUid,
            seriesInstanceUid: seriesUid,
            sopInstanceUid: uid,
          });

          results.push({
            uid,
            frameCount: metadata.frameCount,
            width: metadata.imageInfo.columns,
            height: metadata.imageInfo.rows,
            isPlayable: metadata.frameCount > 1,
            isEncapsulated: metadata.isEncapsulated,
          });
        } catch (err) {
          results.push({
            uid,
            frameCount: 0,
            width: 0,
            height: 0,
            isPlayable: false,
            isEncapsulated: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      setScannedInstances(results);
      setScanningStatus('');

      // 성공적으로 스캔된 것들 중 첫 N개 자동 선택 (현재 viewMode에 맞게)
      const maxSelect = getMaxSelect();
      const validUids = results.filter(r => !r.error).slice(0, maxSelect).map(r => r.uid);
      setSelectedUids(new Set(validUids));

    } catch (err) {
      setError(`Instance 목록 조회 실패: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setScanningStatus('');
    }
  };

  // 최대 선택 개수 계산 (viewMode에 따라 다름)
  const getMaxSelect = () => {
    if (viewMode === 'multi-canvas') {
      return multiCanvasCount;
    }
    // multi 또는 single 모드: layout 기반
    const gridSize = layout === 'grid-2x2' ? 2 : layout === 'grid-3x3' ? 3 : 4;
    return gridSize * gridSize;
  };

  // Instance UID 선택 토글
  const toggleInstanceSelection = (uid: string) => {
    setSelectedUids(prev => {
      const newSet = new Set(prev);
      if (newSet.has(uid)) {
        newSet.delete(uid);
      } else {
        // 현재 모드에 맞는 최대 개수 제한
        const maxSelect = getMaxSelect();
        if (newSet.size < maxSelect) {
          newSet.add(uid);
        }
      }
      return newSet;
    });
  };

  // 전체 선택/해제
  const selectAllPlayable = () => {
    const maxSelect = getMaxSelect();
    const playableUids = scannedInstances
      .filter(r => !r.error && r.isPlayable)
      .slice(0, maxSelect)
      .map(r => r.uid);
    setSelectedUids(new Set(playableUids));
  };

  const clearSelection = () => {
    setSelectedUids(new Set());
  };

  // 멀티 뷰포트 초기화 (layout을 파라미터로 받아 클로저 문제 방지)
  const initMultiViewport = (canvas: HTMLCanvasElement, currentLayout: LayoutType) => {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      setError('WebGL2 not supported');
      return null;
    }

    // 뷰포트 수 결정
    const gridSize = currentLayout === 'grid-2x2' ? 2 : currentLayout === 'grid-3x3' ? 3 : 4;
    const viewportCount = gridSize * gridSize;

    console.log(`[MultiViewport] Layout: ${currentLayout}, Grid: ${gridSize}x${gridSize}, Viewports: ${viewportCount}`);

    // 관리자 초기화
    const viewportManager = new ViewportManager(canvas.width, canvas.height);
    viewportManager.setLayout(currentLayout);

    console.log(`[MultiViewport] ViewportManager created with ${viewportManager.getViewportCount()} viewports`);

    const syncEngine = new FrameSyncEngine();
    const renderScheduler = new RenderScheduler(gl, viewportManager, syncEngine);
    const arrayRenderer = new ArrayTextureRenderer(gl);

    return {
      gl,
      viewportManager,
      syncEngine,
      renderScheduler,
      arrayRenderer,
      viewportCount,
    };
  };

  // 멀티 뷰포트 로드
  const handleMultiViewportLoad = async () => {
    setMultiLoadingStatus('초기화 중...');
    setError(null);
    setMultiViewportReady(false);
    setIsPlaying(false);

    // 이전 리소스 정리 (재로드 시 필수)
    const existingCleanup = (window as unknown as { multiViewportCleanup?: () => void }).multiViewportCleanup;
    if (existingCleanup) {
      console.log('[MultiViewport] Cleaning up previous resources...');
      existingCleanup();
    }

    // refs 초기화
    renderSchedulerRef.current = null;
    viewportManagerRef.current = null;
    syncEngineRef.current = null;
    arrayRendererRef.current = null;
    // 기존 TextureManagers 직접 정리 (cleanup이 설정되지 않았을 경우를 대비)
    textureManagersRef.current.forEach((tm) => tm.dispose());
    textureManagersRef.current = new Map();
    setViewports([]);

    // Canvas 생성
    const canvas = document.getElementById('multi-canvas') as HTMLCanvasElement;
    if (!canvas) {
      setError('Canvas not found');
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = 1024;
    const height = 768;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const result = initMultiViewport(canvas, layout);
    if (!result) return;

    const { gl, viewportManager, syncEngine, renderScheduler, arrayRenderer, viewportCount } = result;

    // refs 저장
    glRef.current = gl;
    viewportManagerRef.current = viewportManager;
    syncEngineRef.current = syncEngine;
    renderSchedulerRef.current = renderScheduler;
    arrayRendererRef.current = arrayRenderer;

    // DataSource 생성
    const dataSource = new WadoRsDataSource({
      baseUrl: wadoBaseUrl,
      timeout: 60000,
      maxRetries: 3,
    });

    // 뷰포트 목록 가져오기
    const viewportIds = viewportManager.getAllViewportIds();
    setViewports(viewportManager.getAllViewports());

    // 텍스처 매니저 맵 초기화
    const textureManagers = new Map<string, TextureManager>();

    // 선택된 Instance UID 사용
    const instanceUidsToLoad = Array.from(selectedUids).slice(0, viewportCount);

    if (instanceUidsToLoad.length === 0) {
      setError('먼저 "Instance 스캔"을 실행하고 로드할 Instance를 선택하세요');
      setMultiLoadingStatus('');
      return;
    }

    for (let i = 0; i < instanceUidsToLoad.length && i < viewportIds.length; i++) {
      const viewportId = viewportIds[i];
      const instanceUidToLoad = instanceUidsToLoad[i];

      setMultiLoadingStatus(`로딩 중... (${i + 1}/${instanceUidsToLoad.length}) ${instanceUidToLoad.slice(-10)}`);

      try {
        // DICOM 데이터 로드
        const { metadata, frames } = await dataSource.loadAllFrames({
          studyInstanceUid: studyUid,
          seriesInstanceUid: seriesUid,
          sopInstanceUid: instanceUidToLoad,
        });

        // 뷰포트에 시리즈 정보 설정
        viewportManager.setViewportSeries(viewportId, {
          seriesId: instanceUidToLoad,
          frameCount: metadata.frameCount,
          imageWidth: metadata.imageInfo.columns,
          imageHeight: metadata.imageInfo.rows,
          isEncapsulated: metadata.isEncapsulated,
          bitsStored: metadata.imageInfo.bitsStored,
        });

        // TextureManager 생성
        const textureManager = new TextureManager(gl);
        textureManagers.set(viewportId, textureManager);

        // 모든 프레임 디코딩 및 텍스처 업로드
        const decodedFrames: ImageBitmap[] = [];

        try {
          for (const frameData of frames) {
            let decoded;
            if (metadata.isEncapsulated) {
              decoded = await decodeJpeg(frameData);
            } else {
              decoded = await decodeNative(frameData, {
                imageInfo: metadata.imageInfo,
              });
            }

            // ImageBitmap으로 변환
            if (decoded.image instanceof VideoFrame) {
              const bitmap = await createImageBitmap(decoded.image);
              closeDecodedFrame(decoded);
              decodedFrames.push(bitmap);
            } else {
              decodedFrames.push(decoded.image as ImageBitmap);
            }
          }

          // 배열 텍스처에 업로드
          textureManager.uploadAllFrames(decodedFrames);
        } finally {
          // ImageBitmap 정리 (성공/실패 모두 반드시 실행)
          decodedFrames.forEach((bmp) => bmp.close());
        }

        console.log(`[MultiViewport] Loaded ${frames.length} frames for viewport ${i + 1}`);
      } catch (err) {
        console.error(`[MultiViewport] Failed to load ${instanceUidToLoad}:`, err);
      }
    }

    textureManagersRef.current = textureManagers;

    // 렌더링 콜백 설정
    renderScheduler.setRenderCallback((viewportId, frameIndex, bounds) => {
      const viewport = viewportManager.getViewport(viewportId);
      const textureManager = textureManagers.get(viewportId);

      if (!viewport || !textureManager || !textureManager.hasArrayTexture()) {
        return;
      }

      // 텍스처 바인딩 및 렌더링
      textureManager.bindArrayTexture(viewport.textureUnit);
      arrayRenderer.renderFrame(viewport.textureUnit, frameIndex, undefined);
    });

    // 프레임 업데이트 콜백
    renderScheduler.setFrameUpdateCallback((viewportId, frameIndex) => {
      setViewports((prev) =>
        prev.map((v) =>
          v.id === viewportId ? { ...v, playback: { ...v.playback, currentFrame: frameIndex } } : v,
        ),
      );
    });

    // 초기 렌더링
    renderScheduler.renderSingleFrame();

    // 상태 업데이트 인터벌
    const statsInterval = setInterval(() => {
      const stats = renderScheduler.getStats();
      setMultiStats({ fps: stats.fps, frameTime: stats.frameTime });
    }, 500);

    // 동기화 그룹 생성 (재생 가능한 뷰포트만 포함)
    const playableViewportIds = viewportIds.filter(id => {
      const vp = viewportManager.getViewport(id);
      return vp?.series && vp.series.frameCount > 1;
    });

    if (playableViewportIds.length >= 2) {
      syncEngine.createSyncGroup({
        masterId: playableViewportIds[0],
        slaveIds: playableViewportIds.slice(1),
        mode: 'frame-ratio',
      });
      console.log(`[MultiViewport] Sync group created with ${playableViewportIds.length} playable viewports`);
    } else {
      console.log(`[MultiViewport] No sync group created (only ${playableViewportIds.length} playable viewport(s))`);
    }

    setViewports(viewportManager.getAllViewports());
    setMultiLoadingStatus('');
    setMultiViewportReady(true);

    // Cleanup 함수 저장
    (window as unknown as { multiViewportCleanup?: () => void }).multiViewportCleanup = () => {
      clearInterval(statsInterval);
      renderScheduler.dispose();
      arrayRenderer.dispose();
      textureManagers.forEach((tm) => tm.dispose());
    };
  };

  // 재생/정지 토글
  const toggleMultiPlay = useCallback(() => {
    const viewportManager = viewportManagerRef.current;
    const renderScheduler = renderSchedulerRef.current;
    if (!viewportManager || !renderScheduler) return;

    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);

    // 모든 뷰포트의 재생 상태 설정
    for (const id of viewportManager.getAllViewportIds()) {
      viewportManager.setViewportPlaying(id, newIsPlaying);
      viewportManager.setViewportFps(id, fps);
    }

    if (newIsPlaying) {
      renderScheduler.start();
    } else {
      renderScheduler.stop();
    }
  }, [isPlaying, fps]);

  // FPS 변경
  const handleFpsChange = useCallback((newFps: number) => {
    setFps(newFps);
    const viewportManager = viewportManagerRef.current;
    if (!viewportManager) return;

    for (const id of viewportManager.getAllViewportIds()) {
      viewportManager.setViewportFps(id, newFps);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const cleanup = (window as unknown as { multiViewportCleanup?: () => void }).multiViewportCleanup;
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif', maxWidth: '1200px' }}>
      <h1 style={{ marginBottom: '20px' }}>EchoPixel Demo - DICOM Viewer</h1>

      {/* 뷰 모드 선택 (Single / Multi / Multi-Canvas) */}
      <div style={{
        display: 'flex',
        gap: '10px',
        marginBottom: '15px',
        flexWrap: 'wrap',
      }}>
        <button
          onClick={() => handleViewModeChange('single')}
          style={{
            padding: '10px 20px',
            background: viewMode === 'single' ? '#a47' : '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: viewMode === 'single' ? 'bold' : 'normal',
          }}
        >
          Single Viewport
        </button>
        <button
          onClick={() => handleViewModeChange('multi')}
          style={{
            padding: '10px 20px',
            background: viewMode === 'multi' ? '#7a4' : '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: viewMode === 'multi' ? 'bold' : 'normal',
          }}
        >
          Multi (Single Canvas)
        </button>
        <button
          onClick={() => handleViewModeChange('multi-canvas')}
          style={{
            padding: '10px 20px',
            background: viewMode === 'multi-canvas' ? '#47a' : '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: viewMode === 'multi-canvas' ? 'bold' : 'normal',
          }}
        >
          Multi (Multi Canvas)
        </button>
      </div>

      {/* === 단일 뷰포트 모드 === */}
      {viewMode === 'single' && (
        <>
          {/* 데이터 소스 모드 선택 */}
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

          {/* 에러/로딩 상태 */}
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
                      <p style={{ margin: '3px 0' }}>
                        프레임 수: {parseResult.pixelData.frameCount}
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
              <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>WADO-RS Metadata</h3>
              <div style={{ display: 'grid', gap: '15px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', fontSize: '13px' }}>
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: '#8cf', fontSize: '14px' }}>기본 정보</h4>
                  <p style={{ margin: '3px 0' }}>
                    Transfer Syntax: {getTransferSyntaxName(wadoMetadata.transferSyntax)}
                  </p>
                  <p style={{ margin: '3px 0' }}>
                    압축: {wadoMetadata.isEncapsulated ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: '#8cf', fontSize: '14px' }}>이미지 정보</h4>
                  <p style={{ margin: '3px 0' }}>
                    크기: {wadoMetadata.imageInfo.columns} x {wadoMetadata.imageInfo.rows}
                  </p>
                  <p style={{ margin: '3px 0' }}>
                    Bits: {wadoMetadata.imageInfo.bitsAllocated} / {wadoMetadata.imageInfo.bitsStored}
                  </p>
                </div>
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: '#8cf', fontSize: '14px' }}>프레임 정보</h4>
                  <p style={{ margin: '3px 0' }}>
                    프레임 수: {wadoMetadata.frameCount}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* === 멀티 뷰포트 모드 === */}
      {viewMode === 'multi' && (
        <div>
          {/* 에러 표시 */}
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

          {/* 설정 패널 */}
          <div style={{
            padding: '15px',
            marginBottom: '15px',
            background: '#1a3a2a',
            border: '1px solid #4a7',
            borderRadius: '4px',
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#8f8', fontSize: '16px' }}>
              Multi-Viewport 설정 (WADO-RS)
            </h3>

            <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div>
                <label style={{ display: 'block', color: '#8cf', marginBottom: '5px', fontSize: '13px' }}>
                  DICOM Web Base URL
                </label>
                <input
                  type="text"
                  value={wadoBaseUrl}
                  onChange={(e) => setWadoBaseUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '13px',
                    background: '#2a2a3a',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    color: '#fff',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#8cf', marginBottom: '5px', fontSize: '13px' }}>
                  Study Instance UID
                </label>
                <input
                  type="text"
                  value={studyUid}
                  onChange={(e) => setStudyUid(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '13px',
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
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '13px',
                    background: '#2a2a3a',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    color: '#fff',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#8cf', marginBottom: '5px', fontSize: '13px' }}>
                  Layout
                </label>
                <select
                  value={layout}
                  onChange={(e) => setLayout(e.target.value as LayoutType)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '13px',
                    background: '#2a2a3a',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    color: '#fff',
                  }}
                >
                  <option value="grid-2x2">2x2 (4 viewports)</option>
                  <option value="grid-3x3">3x3 (9 viewports)</option>
                  <option value="grid-4x4">4x4 (16 viewports)</option>
                </select>
              </div>
            </div>

            {/* 액션 버튼들 */}
            <div style={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={handleScanInstances}
                disabled={!!scanningStatus || !!multiLoadingStatus}
                style={{
                  padding: '10px 20px',
                  background: scanningStatus ? '#555' : '#47a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: scanningStatus ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                }}
              >
                {scanningStatus || 'Instance 스캔'}
              </button>

              <button
                onClick={handleMultiViewportLoad}
                disabled={!!multiLoadingStatus || !!scanningStatus || (scannedInstances.length > 0 && selectedUids.size === 0)}
                style={{
                  padding: '10px 20px',
                  background: (multiLoadingStatus || (scannedInstances.length > 0 && selectedUids.size === 0)) ? '#555' : '#4a7',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (multiLoadingStatus || (scannedInstances.length > 0 && selectedUids.size === 0)) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                {multiLoadingStatus || `로드 (${selectedUids.size > 0 ? selectedUids.size : layout === 'grid-2x2' ? 4 : layout === 'grid-3x3' ? 9 : 16}개)`}
              </button>
            </div>

            {/* Instance UID 선택 목록 */}
            {scannedInstances.length > 0 && (
              <div style={{ marginTop: '15px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                }}>
                  <span style={{ color: '#8cf', fontSize: '13px' }}>
                    Instance 선택 ({selectedUids.size} / {layout === 'grid-2x2' ? 4 : layout === 'grid-3x3' ? 9 : 16}개)
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={selectAllPlayable}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        background: '#363',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      영상만 선택
                    </button>
                    <button
                      onClick={clearSelection}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        background: '#633',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      선택 해제
                    </button>
                  </div>
                </div>

                <div style={{
                  background: '#1a1a2a',
                  borderRadius: '4px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                }}>
                  {scannedInstances.map((instance, idx) => {
                    const isSelected = selectedUids.has(instance.uid);
                    const maxSelect = getMaxSelect();
                    const canSelect = isSelected || selectedUids.size < maxSelect;

                    return (
                      <div
                        key={instance.uid}
                        onClick={() => !instance.error && canSelect && toggleInstanceSelection(instance.uid)}
                        style={{
                          padding: '8px 12px',
                          borderBottom: '1px solid #333',
                          cursor: instance.error ? 'not-allowed' : (canSelect ? 'pointer' : 'not-allowed'),
                          background: isSelected ? '#2a3a2a' : 'transparent',
                          opacity: instance.error ? 0.5 : (canSelect ? 1 : 0.6),
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        {/* 체크박스 */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={instance.error !== undefined || !canSelect}
                          onChange={() => {}}
                          style={{ cursor: 'inherit' }}
                        />

                        {/* 번호 */}
                        <span style={{ color: '#666', fontSize: '11px', minWidth: '24px' }}>
                          {idx + 1}.
                        </span>

                        {/* 타입 배지 */}
                        {instance.error ? (
                          <span style={{
                            fontSize: '10px',
                            color: '#f66',
                            background: '#3a1a1a',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            minWidth: '50px',
                            textAlign: 'center',
                          }}>
                            오류
                          </span>
                        ) : instance.isPlayable ? (
                          <span style={{
                            fontSize: '10px',
                            color: '#8f8',
                            background: '#1a3a1a',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            minWidth: '50px',
                            textAlign: 'center',
                          }}>
                            영상
                          </span>
                        ) : (
                          <span style={{
                            fontSize: '10px',
                            color: '#fa8',
                            background: '#3a2a1a',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            minWidth: '50px',
                            textAlign: 'center',
                          }}>
                            정지
                          </span>
                        )}

                        {/* 프레임 수 (강조) */}
                        {!instance.error && (
                          <span style={{
                            fontSize: '11px',
                            color: instance.isPlayable ? '#8cf' : '#888',
                            fontWeight: instance.isPlayable ? 'bold' : 'normal',
                            minWidth: '45px',
                            textAlign: 'right',
                          }}>
                            {instance.frameCount} 프레임
                          </span>
                        )}

                        {/* UID */}
                        <span style={{
                          fontFamily: 'monospace',
                          fontSize: '10px',
                          color: '#aaa',
                          flex: 1,
                        }}>
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
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#888', display: 'flex', gap: '15px' }}>
                  <span>
                    총: {scannedInstances.length}개
                  </span>
                  <span style={{ color: '#8f8' }}>
                    영상: {scannedInstances.filter(i => i.isPlayable).length}개
                  </span>
                  <span style={{ color: '#fa8' }}>
                    정지: {scannedInstances.filter(i => !i.isPlayable && !i.error).length}개
                  </span>
                  {scannedInstances.filter(i => i.error).length > 0 && (
                    <span style={{ color: '#f66' }}>
                      오류: {scannedInstances.filter(i => i.error).length}개
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* 스캔 전 안내 */}
            {scannedInstances.length === 0 && !scanningStatus && (
              <div style={{ marginTop: '15px', fontSize: '12px', color: '#888' }}>
                'Instance 스캔' 버튼을 클릭하여 Series 내 모든 Instance를 조회하세요.
                <br />
                스캔 후 로드할 Instance를 선택할 수 있습니다.
              </div>
            )}
          </div>

          {/* 상태 표시 */}
          {multiViewportReady && (
            <div style={{
              padding: '8px 12px',
              marginBottom: '10px',
              background: '#2a2a2a',
              color: '#fff',
              borderRadius: '4px',
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>Multi-Viewport ({layout}) | {viewports.length} viewports loaded</span>
              <span style={{ color: '#8f8' }}>
                FPS: {multiStats.fps} | Frame Time: {multiStats.frameTime.toFixed(1)}ms
              </span>
            </div>
          )}

          {/* Canvas */}
          <canvas
            id="multi-canvas"
            style={{
              width: '1024px',
              height: '768px',
              border: '1px solid #444',
              background: '#000',
              display: 'block',
              marginBottom: '10px',
            }}
          />

          {/* 컨트롤 */}
          {multiViewportReady && (() => {
            // 재생 가능한 뷰포트 수 계산 (frameCount > 1)
            const playableCount = viewports.filter(vp => (vp.series?.frameCount ?? 0) > 1).length;
            const allStillImages = playableCount === 0;
            const stillImageCount = viewports.length - playableCount;

            return (
              <div style={{
                padding: '12px',
                background: '#1a1a2e',
                borderRadius: '4px',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                flexWrap: 'wrap',
              }}>
                <button
                  onClick={toggleMultiPlay}
                  disabled={allStillImages}
                  style={{
                    padding: '8px 20px',
                    fontSize: '14px',
                    background: allStillImages ? '#555' : (isPlaying ? '#c44' : '#4c4'),
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: allStillImages ? 'not-allowed' : 'pointer',
                    minWidth: '100px',
                    opacity: allStillImages ? 0.6 : 1,
                  }}
                  title={allStillImages ? '모든 뷰포트가 정지 영상입니다' : ''}
                >
                  {isPlaying ? '⏸ Stop' : '▶ Play All'}
                </button>

                {!allStillImages && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label>FPS:</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={fps}
                      onChange={(e) => handleFpsChange(Math.max(1, Math.min(60, Number(e.target.value))))}
                      style={{ width: '50px', padding: '4px' }}
                    />
                    <input
                      type="range"
                      min={1}
                      max={60}
                      value={fps}
                      onChange={(e) => handleFpsChange(Number(e.target.value))}
                      style={{ width: '100px' }}
                    />
                  </div>
                )}

                {/* 영상/정지 영상 통계 */}
                <div style={{ fontSize: '12px', color: '#888', marginLeft: 'auto' }}>
                  {allStillImages ? (
                    <span style={{ color: '#fa8' }}>모든 뷰포트가 정지 영상입니다</span>
                  ) : (
                    <>
                      <span style={{ color: '#8f8' }}>영상: {playableCount}개</span>
                      {stillImageCount > 0 && (
                        <span style={{ color: '#fa8', marginLeft: '10px' }}>정지: {stillImageCount}개</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 뷰포트 정보 */}
          {viewports.length > 0 && (
            <div style={{
              marginTop: '10px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '8px',
            }}>
              {viewports.map((vp, idx) => (
                <div
                  key={vp.id}
                  style={{
                    padding: '10px',
                    background: '#1a1a1a',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: '#aaa',
                    border: '1px solid #333',
                  }}
                >
                  <div style={{
                    fontWeight: 'bold',
                    color: '#fff',
                    marginBottom: '6px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span>Viewport {idx + 1}</span>
                    {/* 단일 프레임 vs 영상 구분 */}
                    {(vp.series?.frameCount ?? 0) <= 1 ? (
                      <span style={{
                        fontSize: '10px',
                        color: '#fa8',
                        background: '#3a2a1a',
                        padding: '2px 6px',
                        borderRadius: '3px',
                      }}>
                        정지 영상
                      </span>
                    ) : (
                      <span style={{
                        fontSize: '10px',
                        color: vp.playback.isPlaying ? '#8f8' : '#888',
                        background: vp.playback.isPlaying ? '#1a3a1a' : '#2a2a2a',
                        padding: '2px 6px',
                        borderRadius: '3px',
                      }}>
                        {vp.playback.isPlaying ? 'Playing' : 'Stopped'}
                      </span>
                    )}
                  </div>
                  {vp.series?.seriesId && (
                    <div style={{
                      fontFamily: 'monospace',
                      fontSize: '9px',
                      color: '#6af',
                      marginBottom: '4px',
                      wordBreak: 'break-all',
                    }}>
                      UID: ...{vp.series.seriesId.slice(-25)}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Frame: {vp.playback.currentFrame + 1} / {vp.series?.frameCount ?? 0}</span>
                    <span>Size: {vp.series?.imageWidth ?? 0}x{vp.series?.imageHeight ?? 0}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === 멀티 캔버스 모드 (Multiple Canvas) === */}
      {viewMode === 'multi-canvas' && (
        <div>
          {/* 에러 표시 */}
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

          {/* 설정 패널 */}
          <div style={{
            padding: '15px',
            marginBottom: '15px',
            background: '#1a2a4a',
            border: '1px solid #47a',
            borderRadius: '4px',
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#8cf', fontSize: '16px' }}>
              Multi-Canvas Grid 설정 (Multiple WebGL Contexts)
            </h3>

            <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div>
                <label style={{ display: 'block', color: '#8cf', marginBottom: '5px', fontSize: '13px' }}>
                  DICOM Web Base URL
                </label>
                <input
                  type="text"
                  value={wadoBaseUrl}
                  onChange={(e) => setWadoBaseUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '13px',
                    background: '#2a2a3a',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    color: '#fff',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#8cf', marginBottom: '5px', fontSize: '13px' }}>
                  Study Instance UID
                </label>
                <input
                  type="text"
                  value={studyUid}
                  onChange={(e) => setStudyUid(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '13px',
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
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '13px',
                    background: '#2a2a3a',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    color: '#fff',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#8cf', marginBottom: '5px', fontSize: '13px' }}>
                  뷰포트 개수
                </label>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(count => (
                    <button
                      key={count}
                      onClick={() => setMultiCanvasCount(count)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '13px',
                        background: multiCanvasCount === count ? '#47a' : '#2a2a3a',
                        color: '#fff',
                        border: multiCanvasCount === count ? '2px solid #8cf' : '1px solid #555',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: multiCanvasCount === count ? 'bold' : 'normal',
                        minWidth: '40px',
                      }}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 액션 버튼들 */}
            <div style={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={handleScanInstances}
                disabled={!!scanningStatus}
                style={{
                  padding: '10px 20px',
                  background: scanningStatus ? '#555' : '#47a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: scanningStatus ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                }}
              >
                {scanningStatus || 'Instance 스캔'}
              </button>

              <button
                onClick={() => {
                  const uidsToLoad = Array.from(selectedUids).slice(0, multiCanvasCount);
                  if (uidsToLoad.length === 0) {
                    setError('로드할 Instance를 선택하세요');
                    return;
                  }
                  setMultiCanvasUids(uidsToLoad);
                  setMultiCanvasLoaded(true);
                  setError(null);
                }}
                disabled={selectedUids.size === 0 || !!scanningStatus}
                style={{
                  padding: '10px 20px',
                  background: selectedUids.size === 0 ? '#555' : '#4a7',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: selectedUids.size === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                로드 ({Math.min(selectedUids.size, multiCanvasCount)}개)
              </button>
            </div>

            {/* Instance UID 선택 목록 */}
            {scannedInstances.length > 0 && (
              <div style={{ marginTop: '15px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                }}>
                  <span style={{ color: '#8cf', fontSize: '13px' }}>
                    Instance 선택 ({selectedUids.size} / {multiCanvasCount}개)
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={selectAllPlayable}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        background: '#363',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      영상만 선택
                    </button>
                    <button
                      onClick={clearSelection}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        background: '#633',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      선택 해제
                    </button>
                  </div>
                </div>

                <div style={{
                  background: '#1a1a2a',
                  borderRadius: '4px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}>
                  {scannedInstances.map((instance, idx) => {
                    const isSelected = selectedUids.has(instance.uid);
                    const maxSelect = getMaxSelect();
                    const canSelect = isSelected || selectedUids.size < maxSelect;

                    return (
                      <div
                        key={instance.uid}
                        onClick={() => !instance.error && canSelect && toggleInstanceSelection(instance.uid)}
                        style={{
                          padding: '6px 10px',
                          borderBottom: '1px solid #333',
                          cursor: instance.error ? 'not-allowed' : (canSelect ? 'pointer' : 'not-allowed'),
                          background: isSelected ? '#2a3a4a' : 'transparent',
                          opacity: instance.error ? 0.5 : (canSelect ? 1 : 0.6),
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '11px',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={instance.error !== undefined || !canSelect}
                          onChange={() => {}}
                          style={{ cursor: 'inherit' }}
                        />
                        <span style={{ color: '#666', minWidth: '20px' }}>{idx + 1}.</span>
                        <span style={{
                          color: instance.isPlayable ? '#8f8' : '#fa8',
                          minWidth: '35px',
                        }}>
                          {instance.isPlayable ? '영상' : '정지'}
                        </span>
                        <span style={{ color: '#8cf', minWidth: '50px' }}>
                          {instance.frameCount}f
                        </span>
                        <span style={{ fontFamily: 'monospace', color: '#aaa', flex: 1 }}>
                          ...{instance.uid.slice(-20)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* MultiCanvasGrid 렌더링 */}
          {multiCanvasLoaded && multiCanvasUids.length > 0 && multiCanvasDataSource && (
            <MultiCanvasGrid
              key={multiCanvasUids.join('-')}
              layout={layout}
              dataSource={multiCanvasDataSource}
              studyUid={studyUid}
              seriesUid={seriesUid}
              instanceUids={multiCanvasUids}
              viewportSize={layout === 'grid-2x2' ? 380 : layout === 'grid-3x3' ? 250 : 180}
              gap={4}
            />
          )}

          {/* 스캔 전 안내 */}
          {scannedInstances.length === 0 && !scanningStatus && (
            <div style={{
              padding: '20px',
              background: '#1a1a2a',
              borderRadius: '4px',
              textAlign: 'center',
              color: '#888',
            }}>
              'Instance 스캔' 버튼을 클릭하여 Series 내 Instance를 조회하세요.
              <br />
              스캔 후 로드할 Instance를 선택하면 자동으로 뷰포트가 생성됩니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
