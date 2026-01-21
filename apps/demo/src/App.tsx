import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  isDicomFile,
  parseDicom,
  getImageInfo,
  extractPixelData,
  isEncapsulated,
  isImageDecoderSupported,
  getTransferSyntaxName,
  getUltrasoundCalibration,
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
  type Annotation,
} from '@echopixel/core';
// DicomViewport는 더 이상 Single 모드에서 사용하지 않음 - SingleDicomViewer로 대체
// import { DicomViewport } from './components/DicomViewport';
// MultiCanvasGrid는 SingleDicomViewerGroup으로 대체됨 (Phase 3g 리팩토링)
// import { MultiCanvasGrid } from './components/MultiCanvasGrid';
import { HardwareInfoPanel, type TextureMemoryInfo } from './components/HardwareInfoPanel';
import {
  SingleDicomViewer,
  SingleDicomViewerGroup,
  HybridMultiViewport as ReactHybridMultiViewport,
  type SingleDicomViewerGroupHandle,
  type ViewerData,
  type ViewerGroupLayout,
  type HybridMultiViewportHandle,
  type HybridSeriesData as ReactHybridSeriesData,
  type HybridViewportStats,
  type PerformanceOptions,
  DEFAULT_TOOLS,
} from '@echopixel/react';
import { PerformanceOptionsPanel } from './components/PerformanceOptions';

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

  // Single Viewport 크기 설정
  const [singleViewportWidth, setSingleViewportWidth] = useState(768);
  const [singleViewportHeight, setSingleViewportHeight] = useState(576);

  // 데이터 소스 모드
  const [mode, setMode] = useState<DataSourceMode>('local');

  // WADO-RS 설정 (테스트용 기본값 설정)
  // 접속한 호스트명 기반으로 WADO URL 자동 설정 (다른 PC에서 IP 접속 시 동작)
  const [wadoBaseUrl, setWadoBaseUrl] = useState(
    `http://${window.location.hostname}:10201/dicomweb`
  );
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
  // Single canvas 기반: 1~100개, Single viewport 기반: 1~16개
  const [viewportCount, setViewportCount] = useState(4);
  // 레거시 layout 상태 (SingleDicomViewerGroup에서 사용)
  const [layout, setLayout] = useState<LayoutType>('grid-2x2');
  const [multiViewportReady, setMultiViewportReady] = useState(false);
  const [multiLoadingStatus, setMultiLoadingStatus] = useState('');
  const [multiStats, setMultiStats] = useState({ fps: 0, frameTime: 0, vramMB: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(30);

  // Instance UID 스캔 및 선택 상태
  const [scannedInstances, setScannedInstances] = useState<ScannedInstance[]>([]);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [scanningStatus, setScanningStatus] = useState<string>('');

  // Multi Canvas 모드 상태 (SingleDicomViewerGroup 사용)
  const [multiCanvasViewers, setMultiCanvasViewers] = useState<ViewerData[]>([]);
  const [multiCanvasLoading, setMultiCanvasLoading] = useState(false);
  const multiCanvasGroupRef = useRef<SingleDicomViewerGroupHandle>(null);
  const [multiCanvasFps, setMultiCanvasFps] = useState(30);
  const [multiCanvasIsPlaying, setMultiCanvasIsPlaying] = useState(false);
  const [multiCanvasShowAnnotations, setMultiCanvasShowAnnotations] = useState(true);


  // Multi 모드 (리팩토링) - @echopixel/react HybridMultiViewport 사용
  const [multiSeriesMap, setMultiSeriesMap] = useState<Map<string, ReactHybridSeriesData>>(new Map());
  const multiViewportRef = useRef<HybridMultiViewportHandle>(null);

  // 확대 뷰 상태 (Multi ViewPort에서 더블클릭 시)
  // internalViewportId ↔ seriesMap key 양방향 매핑 (HybridMultiViewport 내부 ID와 seriesMap 키가 다름)
  const [expandedViewportId, setExpandedViewportId] = useState<string | null>(null);
  const [viewportIdToSeriesKeyMap, setViewportIdToSeriesKeyMap] = useState<Map<string, string>>(new Map());

  // 역매핑: seriesKey → internalViewportId (아래 multiAnnotationsForHybrid에서 사용)
  const seriesKeyToViewportIdMap = useMemo(() => {
    const reverseMap = new Map<string, string>();
    for (const [internalId, seriesKey] of viewportIdToSeriesKeyMap) {
      reverseMap.set(seriesKey, internalId);
    }
    return reverseMap;
  }, [viewportIdToSeriesKeyMap]);

  // 성능 옵션 상태 (VRAM 제한, DPR 등)
  const [performanceOptions, setPerformanceOptions] = useState<PerformanceOptions>({
    maxVramMB: Infinity,  // 기본: 무제한
    dprOverride: undefined,  // 기본: 자동
    debugMode: false,
  });
  // performanceOptions 변경 시 컴포넌트 리마운트를 위한 키
  const performanceKey = `${performanceOptions.maxVramMB}-${performanceOptions.dprOverride}-${performanceOptions.debugMode}`;

  // ============================================================
  // Phase 3e 테스트: SVG 어노테이션 오버레이
  // ============================================================

  // 테스트용 어노테이션 데이터 생성
  const testAnnotations = useMemo<Map<string, Annotation[]>>(() => {
    const map = new Map<string, Annotation[]>();

    // multiSeriesMap이 비어있으면 빈 맵 반환
    if (multiSeriesMap.size === 0) return map;

    // 첫 번째 뷰포트에 테스트 어노테이션 추가
    const firstViewportId = 'viewport-0';
    const firstSeries = multiSeriesMap.get(firstViewportId);

    if (firstSeries) {
      const imgWidth = firstSeries.info.imageWidth;
      const imgHeight = firstSeries.info.imageHeight;

      const annotations: Annotation[] = [
        // Length 어노테이션 (두 점 거리 측정)
        {
          id: 'test-length-1',
          dicomId: firstSeries.info.seriesId || 'test-dicom',
          frameIndex: 0,
          type: 'length',
          mode: 'B',
          points: [
            { x: Math.round(imgWidth * 0.2), y: Math.round(imgHeight * 0.3) },
            { x: Math.round(imgWidth * 0.5), y: Math.round(imgHeight * 0.4) },
          ],
          value: 45.2,
          unit: 'mm',
          displayValue: '45.2 mm',
          labelPosition: { x: Math.round(imgWidth * 0.35), y: Math.round(imgHeight * 0.25) },
          color: '#00ff00',
          visible: true,
          source: 'user',
          deletable: true,
          editable: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        // Angle 어노테이션 (세 점 각도 측정)
        {
          id: 'test-angle-1',
          dicomId: firstSeries.info.seriesId || 'test-dicom',
          frameIndex: 0,
          type: 'angle',
          mode: 'B',
          points: [
            { x: Math.round(imgWidth * 0.6), y: Math.round(imgHeight * 0.2) },
            { x: Math.round(imgWidth * 0.7), y: Math.round(imgHeight * 0.4) },
            { x: Math.round(imgWidth * 0.8), y: Math.round(imgHeight * 0.25) },
          ],
          value: 67.5,
          unit: 'deg',
          displayValue: '67.5°',
          labelPosition: { x: Math.round(imgWidth * 0.75), y: Math.round(imgHeight * 0.15) },
          color: '#ffff00',
          visible: true,
          source: 'user',
          deletable: true,
          editable: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        // Point 어노테이션 (단일 점 마커)
        {
          id: 'test-point-1',
          dicomId: firstSeries.info.seriesId || 'test-dicom',
          frameIndex: 0,
          type: 'point',
          mode: 'B',
          points: [
            { x: Math.round(imgWidth * 0.5), y: Math.round(imgHeight * 0.7) },
          ],
          value: 0,
          unit: '',
          displayValue: 'Point 1',
          labelPosition: { x: Math.round(imgWidth * 0.55), y: Math.round(imgHeight * 0.68) },
          color: '#ff00ff',
          visible: true,
          source: 'ai',
          deletable: false,
          editable: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      map.set(firstViewportId, annotations);
    }

    // 두 번째 뷰포트에도 테스트 어노테이션 추가 (있는 경우)
    const secondViewportId = 'viewport-1';
    const secondSeries = multiSeriesMap.get(secondViewportId);

    if (secondSeries) {
      const imgWidth = secondSeries.info.imageWidth;
      const imgHeight = secondSeries.info.imageHeight;

      map.set(secondViewportId, [
        {
          id: 'test-length-2',
          dicomId: secondSeries.info.seriesId || 'test-dicom-2',
          frameIndex: 0,
          type: 'length',
          mode: 'B',
          points: [
            { x: Math.round(imgWidth * 0.3), y: Math.round(imgHeight * 0.5) },
            { x: Math.round(imgWidth * 0.7), y: Math.round(imgHeight * 0.5) },
          ],
          value: 82.1,
          unit: 'mm',
          displayValue: '82.1 mm',
          labelPosition: { x: Math.round(imgWidth * 0.5), y: Math.round(imgHeight * 0.45) },
          color: '#00ffff',
          visible: true,
          source: 'server',
          deletable: true,
          editable: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);
    }

    return map;
  }, [multiSeriesMap]);

  // Single Viewport용 어노테이션 상태 (Phase 3f: 생성 기능 테스트)
  const [singleAnnotations, setSingleAnnotations] = useState<Annotation[]>([]);
  // 선택된 어노테이션 ID (Phase 3g-2: 선택/편집 UI)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  // 어노테이션 표시 여부 (Phase 3g: 보이기/숨김 토글)
  const [showAnnotations, setShowAnnotations] = useState(true);
  // Single Viewport 확대 보기 (더블클릭 시)
  const [singleExpandedView, setSingleExpandedView] = useState(false);

  // Multi Viewport용 어노테이션 상태 (Phase 3g: 어노테이션 생성 기능)
  const [multiAnnotations, setMultiAnnotations] = useState<Map<string, Annotation[]>>(new Map());
  const [multiSelectedAnnotationId, setMultiSelectedAnnotationId] = useState<string | null>(null);
  const [multiActiveTool, setMultiActiveTool] = useState('WindowLevel');
  const [multiShowAnnotations, setMultiShowAnnotations] = useState(true);

  // multiAnnotations를 내부 ID 기반으로 변환 (HybridMultiViewport용)
  const multiAnnotationsForHybrid = useMemo(() => {
    const convertedMap = new Map<string, Annotation[]>();
    for (const [seriesKey, annotations] of multiAnnotations) {
      const internalId = seriesKeyToViewportIdMap.get(seriesKey);
      if (internalId) {
        convertedMap.set(internalId, annotations);
      } else {
        // 매핑이 없으면 원래 키 사용 (fallback)
        convertedMap.set(seriesKey, annotations);
      }
    }
    return convertedMap;
  }, [multiAnnotations, seriesKeyToViewportIdMap]);

  // ESC 키로 확대 뷰 닫기 (Single/Multi 모드 모두)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (expandedViewportId) {
          setExpandedViewportId(null);
        }
        if (singleExpandedView) {
          setSingleExpandedView(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedViewportId, singleExpandedView]);

  // 확대 뷰 열릴 때 body 스크롤 비활성화
  useEffect(() => {
    if (expandedViewportId || singleExpandedView) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [expandedViewportId, singleExpandedView]);

  // viewportData가 변경되면 초기 테스트 어노테이션 설정
  useEffect(() => {
    if (!viewportData?.imageInfo) {
      setSingleAnnotations([]);
      return;
    }

    const imgWidth = viewportData.imageInfo.columns;
    const imgHeight = viewportData.imageInfo.rows;

    // 초기 테스트 어노테이션 (기존 어노테이션 없을 때만)
    setSingleAnnotations([
      // Length 어노테이션 (두 점 거리 측정)
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
      // Angle 어노테이션 (세 점 각도 측정)
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
      // Point 어노테이션 (단일 점 마커)
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
    ]);
  }, [viewportData]);

  // Single Viewport 어노테이션 업데이트 핸들러 (새 어노테이션 추가 또는 기존 수정)
  const handleSingleAnnotationUpdate = useCallback((annotation: Annotation) => {
    setSingleAnnotations(prev => {
      const existingIndex = prev.findIndex(a => a.id === annotation.id);
      if (existingIndex >= 0) {
        // 기존 어노테이션 업데이트 (드래그로 이동된 경우)
        console.log('[Phase 3g-2] Annotation updated:', annotation.id);
        const newList = [...prev];
        newList[existingIndex] = annotation;
        return newList;
      } else {
        // 새 어노테이션 추가
        console.log('[Phase 3f] Annotation created:', annotation.id);
        return [...prev, annotation];
      }
    });
  }, []);

  // 어노테이션 선택 핸들러 (Phase 3g-2)
  const handleAnnotationSelect = useCallback((annotationId: string | null) => {
    console.log('[Phase 3g-2] Annotation selected:', annotationId);
    setSelectedAnnotationId(annotationId);
  }, []);

  // 어노테이션 삭제 핸들러 (Phase 3g-2)
  const handleAnnotationDelete = useCallback((annotationId: string) => {
    console.log('[Phase 3g-2] Annotation deleted:', annotationId);
    setSingleAnnotations(prev => prev.filter(a => a.id !== annotationId));
    // 삭제된 어노테이션이 선택된 상태였으면 선택 해제
    setSelectedAnnotationId(prev => prev === annotationId ? null : prev);
  }, []);

  // ============================================================
  // Multi Viewport 어노테이션 핸들러 (Phase 3g: 어노테이션 생성)
  // ============================================================

  // Multi Viewport 어노테이션 생성/업데이트 핸들러
  // 내부 뷰포트 ID → seriesKey로 변환하여 저장 (오버레이와 공유)
  const handleMultiAnnotationUpdate = useCallback((viewportId: string, annotation: Annotation) => {
    // 내부 ID를 seriesKey로 변환 (매핑이 없으면 그대로 사용)
    const seriesKey = viewportIdToSeriesKeyMap.get(viewportId) || viewportId;
    console.log('[Phase 3g] Multi Annotation update - internalId:', viewportId, 'seriesKey:', seriesKey);

    setMultiAnnotations(prev => {
      const newMap = new Map(prev);
      const viewportAnnotations = newMap.get(seriesKey) ?? [];

      const existingIndex = viewportAnnotations.findIndex(a => a.id === annotation.id);
      if (existingIndex >= 0) {
        // 기존 어노테이션 업데이트
        console.log('[Phase 3g] Multi Annotation updated:', seriesKey, annotation.id);
        const newList = [...viewportAnnotations];
        newList[existingIndex] = annotation;
        newMap.set(seriesKey, newList);
      } else {
        // 새 어노테이션 추가
        console.log('[Phase 3g] Multi Annotation created:', seriesKey, annotation.id);
        newMap.set(seriesKey, [...viewportAnnotations, annotation]);
      }

      return newMap;
    });
  }, [viewportIdToSeriesKeyMap]);

  // Multi Viewport 어노테이션 선택 핸들러
  const handleMultiAnnotationSelect = useCallback((viewportId: string, annotationId: string | null) => {
    const seriesKey = viewportIdToSeriesKeyMap.get(viewportId) || viewportId;
    console.log('[Phase 3g] Multi Annotation selected:', seriesKey, annotationId);
    setMultiSelectedAnnotationId(annotationId);
  }, [viewportIdToSeriesKeyMap]);

  // Multi Viewport 어노테이션 삭제 핸들러
  const handleMultiAnnotationDelete = useCallback((viewportId: string, annotationId: string) => {
    const seriesKey = viewportIdToSeriesKeyMap.get(viewportId) || viewportId;
    console.log('[Phase 3g] Multi Annotation deleted:', seriesKey, annotationId);
    setMultiAnnotations(prev => {
      const newMap = new Map(prev);
      const viewportAnnotations = newMap.get(seriesKey) ?? [];
      newMap.set(seriesKey, viewportAnnotations.filter(a => a.id !== annotationId));
      return newMap;
    });
    // 삭제된 어노테이션이 선택된 상태였으면 선택 해제
    setMultiSelectedAnnotationId(prev => prev === annotationId ? null : prev);
  }, [viewportIdToSeriesKeyMap]);

  // 멀티 뷰포트 refs
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const viewportManagerRef = useRef<ViewportManager | null>(null);
  const renderSchedulerRef = useRef<RenderScheduler | null>(null);
  const syncEngineRef = useRef<FrameSyncEngine | null>(null);
  const textureManagersRef = useRef<Map<string, TextureManager>>(new Map());
  const arrayRendererRef = useRef<ArrayTextureRenderer | null>(null);
  const [viewports, setViewports] = useState<Viewport[]>([]);

  // 텍스처 메모리 사용량 계산 (Multi 모드에서 viewports 기반)
  const textureMemoryInfo = useMemo<TextureMemoryInfo | null>(() => {
    if (viewports.length === 0) return null;

    const viewportMemory = viewports
      .filter((vp) => vp.series)
      .map((vp) => {
        const width = vp.series!.imageWidth;
        const height = vp.series!.imageHeight;
        const layers = vp.series!.frameCount;
        // RGBA = 4 bytes per pixel
        const bytesPerPixel = 4;
        const totalBytes = width * height * layers * bytesPerPixel;

        return {
          viewportId: vp.id,
          width,
          height,
          layers,
          bytesPerPixel,
          totalBytes,
        };
      });

    const totalBytes = viewportMemory.reduce((sum, vp) => sum + vp.totalBytes, 0);

    return {
      viewports: viewportMemory,
      totalBytes,
    };
  }, [viewports]);


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
  // SingleDicomViewer는 frames를 직접 받으므로, 여기서 프레임을 로드하여 viewportData에 저장
  const handleWadoLoad = async () => {
    if (!studyUid || !seriesUid || !instanceUid) {
      setError('Study UID, Series UID, Instance UID를 모두 입력하세요');
      return;
    }

    // 기존 데이터 초기화
    setViewportData(null);
    setParseResult(null);
    setError(null);
    setLoadingStatus('Loading from WADO-RS...');

    try {
      // DataSource 생성
      const dataSource = new WadoRsDataSource({
        baseUrl: wadoBaseUrl,
        timeout: 60000,
        maxRetries: 3,
      });

      const instanceIdToLoad: DicomInstanceId = {
        studyInstanceUid: studyUid,
        seriesInstanceUid: seriesUid,
        sopInstanceUid: instanceUid,
      };

      // 프레임 로드
      setLoadingStatus('Fetching frames...');
      const { metadata, frames } = await dataSource.loadAllFrames(instanceIdToLoad);

      // calibration 확인 - WADO-RS 메타데이터에 없으면 전체 DICOM 인스턴스에서 추출
      let finalImageInfo = metadata.imageInfo;

      if (!finalImageInfo.pixelSpacing && !finalImageInfo.ultrasoundCalibration) {
        setLoadingStatus('Fetching calibration data...');
        try {
          // 전체 DICOM 인스턴스 로드 (Part 10 파일)
          const instanceUrl = `${wadoBaseUrl}/studies/${studyUid}/series/${seriesUid}/instances/${instanceUid}`;
          const instanceResponse = await fetch(instanceUrl, {
            headers: {
              'Accept': 'application/dicom',
            },
          });

          if (instanceResponse.ok) {
            const instanceBuffer = await instanceResponse.arrayBuffer();
            // Ultrasound Calibration 추출
            const ultrasoundCalibration = getUltrasoundCalibration(instanceBuffer);
            if (ultrasoundCalibration) {
              console.log('[WADO-RS] Extracted ultrasoundCalibration from full instance:', ultrasoundCalibration);
              finalImageInfo = {
                ...finalImageInfo,
                ultrasoundCalibration,
              };
            }
          }
        } catch (calibrationError) {
          console.warn('[WADO-RS] Failed to fetch calibration from full instance:', calibrationError);
        }
      }

      // 메타데이터 저장
      setWadoDataSource(dataSource);
      setInstanceId(instanceIdToLoad);
      setWadoMetadata(metadata);

      // viewportData에 저장 (SingleDicomViewer에서 사용)
      setViewportData({
        frames,
        imageInfo: finalImageInfo,
        isEncapsulated: metadata.isEncapsulated,
      });

      setLoadingStatus('');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`WADO-RS load error: ${errorMessage}`);
      setLoadingStatus('');
    }
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

  // 최대 선택 개수 계산 (viewportCount 기반)
  const getMaxSelect = () => {
    return viewportCount;
  };

  // 그리드 차원 계산 (UI 표시용)
  // calculateGridFromCount와 동일 로직
  const getGridDimensions = (count: number): { rows: number; cols: number } => {
    if (count <= 0) return { rows: 1, cols: 1 };
    if (count === 1) return { rows: 1, cols: 1 };
    if (count === 2) return { rows: 1, cols: 2 };
    if (count <= 4) return { rows: 2, cols: 2 };
    // 5개 이상: 가로 4개 제한
    const cols = 4;
    const rows = Math.ceil(count / cols);
    return { rows, cols };
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

  // 멀티 뷰포트 로드 (리팩토링 - @echopixel/react HybridMultiViewport 사용)
  const handleMultiViewportLoad = async () => {
    setMultiLoadingStatus('초기화 중...');
    setError(null);
    setMultiViewportReady(false);
    setIsPlaying(false);
    setMultiSeriesMap(new Map());

    // 선택된 Instance UID 사용 (viewportCount 상태 사용)
    console.log('[handleMultiViewportLoad] viewportCount:', viewportCount, 'selectedUids.size:', selectedUids.size);
    const instanceUidsToLoad = Array.from(selectedUids).slice(0, viewportCount);
    console.log('[handleMultiViewportLoad] instanceUidsToLoad.length:', instanceUidsToLoad.length);

    if (instanceUidsToLoad.length === 0) {
      setError('먼저 "Instance 스캔"을 실행하고 로드할 Instance를 선택하세요');
      setMultiLoadingStatus('');
      return;
    }

    // DataSource 생성
    const dataSource = new WadoRsDataSource({
      baseUrl: wadoBaseUrl,
      timeout: 60000,
      maxRetries: 3,
    });

    // 시리즈 맵 구성
    const newSeriesMap = new Map<string, ReactHybridSeriesData>();

    for (let i = 0; i < instanceUidsToLoad.length; i++) {
      const instanceUidToLoad = instanceUidsToLoad[i];
      const viewportId = `viewport-${i}`;

      setMultiLoadingStatus(`로딩 중... (${i + 1}/${instanceUidsToLoad.length}) ${instanceUidToLoad.slice(-10)}`);

      try {
        // DICOM 데이터 로드
        const { metadata, frames } = await dataSource.loadAllFrames({
          studyInstanceUid: studyUid,
          seriesInstanceUid: seriesUid,
          sopInstanceUid: instanceUidToLoad,
        });

        // calibration 폴백: WADO-RS 메타데이터에 없으면 전체 DICOM 인스턴스에서 추출
        let finalImageInfo = metadata.imageInfo;

        if (!finalImageInfo.pixelSpacing && !finalImageInfo.ultrasoundCalibration) {
          console.log(`[MultiViewport] No calibration in metadata for viewport ${i + 1}, fetching from full instance...`);
          try {
            // 전체 DICOM 인스턴스 로드 (Part 10 파일)
            const instanceUrl = `${wadoBaseUrl}/studies/${studyUid}/series/${seriesUid}/instances/${instanceUidToLoad}`;
            const instanceResponse = await fetch(instanceUrl, {
              headers: {
                'Accept': 'application/dicom',
              },
            });

            if (instanceResponse.ok) {
              const instanceBuffer = await instanceResponse.arrayBuffer();
              // Ultrasound Calibration 추출
              const ultrasoundCalibration = getUltrasoundCalibration(instanceBuffer);
              if (ultrasoundCalibration) {
                console.log(`[MultiViewport] ✅ Extracted ultrasoundCalibration for viewport ${i + 1}:`, ultrasoundCalibration);
                finalImageInfo = {
                  ...finalImageInfo,
                  ultrasoundCalibration,
                };
              } else {
                console.log(`[MultiViewport] ❌ No ultrasoundCalibration found in full instance for viewport ${i + 1}`);
              }
            }
          } catch (calibrationError) {
            console.warn(`[MultiViewport] Failed to fetch calibration from full instance for viewport ${i + 1}:`, calibrationError);
          }
        }

        // 시리즈 맵에 추가
        newSeriesMap.set(viewportId, {
          info: {
            seriesId: instanceUidToLoad,
            frameCount: metadata.frameCount,
            imageWidth: finalImageInfo.columns,
            imageHeight: finalImageInfo.rows,
            isEncapsulated: metadata.isEncapsulated,
            bitsStored: finalImageInfo.bitsStored,
          },
          frames,
          imageInfo: finalImageInfo,
          isEncapsulated: metadata.isEncapsulated,
        });

        // 디버그: 캘리브레이션 정보 확인
        console.log(`[MultiViewport] Loaded viewport ${i + 1}:`, {
          frames: frames.length,
          hasPixelSpacing: !!finalImageInfo.pixelSpacing,
          pixelSpacing: finalImageInfo.pixelSpacing,
          hasUltrasoundCalibration: !!finalImageInfo.ultrasoundCalibration,
          ultrasoundCalibration: finalImageInfo.ultrasoundCalibration,
        });
      } catch (err) {
        console.error(`[MultiViewport] Failed to load ${instanceUidToLoad}:`, err);
      }
    }

    setMultiSeriesMap(newSeriesMap);
    setMultiLoadingStatus('');
    setMultiViewportReady(true);
    // ID 매핑은 onViewportIdsReady 콜백에서 처리됨
  };

  // Multi Canvas 모드용 데이터 로딩 (SingleDicomViewerGroup 사용)
  const loadMultiCanvasViewers = async () => {
    setMultiCanvasLoading(true);
    setError(null);
    setMultiCanvasViewers([]);

    // viewportCount 상태 사용 (슬라이더 값)
    const instanceUidsToLoad = Array.from(selectedUids).slice(0, viewportCount);

    if (instanceUidsToLoad.length === 0) {
      setError('먼저 "Instance 스캔"을 실행하고 로드할 Instance를 선택하세요');
      setMultiCanvasLoading(false);
      return;
    }

    // DataSource 생성
    const dataSource = new WadoRsDataSource({
      baseUrl: wadoBaseUrl,
      timeout: 60000,
      maxRetries: 3,
    });

    const viewers: ViewerData[] = [];

    for (let i = 0; i < instanceUidsToLoad.length; i++) {
      const instanceUidToLoad = instanceUidsToLoad[i];

      try {
        // DICOM 데이터 로드
        const { metadata, frames } = await dataSource.loadAllFrames({
          studyInstanceUid: studyUid,
          seriesInstanceUid: seriesUid,
          sopInstanceUid: instanceUidToLoad,
        });

        // ViewerData 형식으로 변환
        viewers.push({
          id: `viewer-${i}`,
          frames,
          imageInfo: metadata.imageInfo,
          isEncapsulated: metadata.isEncapsulated,
          label: `#${i + 1} (${metadata.frameCount}f)`,
        });

        console.log(`[MultiCanvas] Loaded ${frames.length} frames for viewer ${i + 1}`);
      } catch (err) {
        console.error(`[MultiCanvas] Failed to load ${instanceUidToLoad}:`, err);
        // 에러 발생해도 계속 진행 (빈 슬롯으로 표시됨)
      }
    }

    setMultiCanvasViewers(viewers);
    setMultiCanvasLoading(false);
  };

  // HybridMultiViewport에서 내부 뷰포트 ID가 준비되면 호출되는 콜백
  const handleViewportIdsReady = useCallback((internalIds: string[], seriesKeys: string[]) => {
    const mapping = new Map<string, string>();
    for (let i = 0; i < internalIds.length && i < seriesKeys.length; i++) {
      mapping.set(internalIds[i], seriesKeys[i]);
    }
    console.log('[Demo] Built viewport ID mapping via callback:', Object.fromEntries(mapping));
    setViewportIdToSeriesKeyMap(mapping);
  }, []);

  // 재생/정지 토글 (리팩토링 - ref 사용)
  const toggleMultiPlay = useCallback(() => {
    if (multiViewportRef.current) {
      multiViewportRef.current.togglePlayAll();
      setIsPlaying(multiViewportRef.current.isPlaying());
    }
  }, []);

  // FPS 변경 (리팩토링 - ref 사용)
  const handleFpsChange = useCallback((newFps: number) => {
    setFps(newFps);
    if (multiViewportRef.current) {
      multiViewportRef.current.setFps(newFps);
    }
  }, []);

  // Multi 모드 stats 업데이트 콜백
  const handleMultiStatsUpdate = useCallback((stats: HybridViewportStats) => {
    setMultiStats({ fps: stats.fps, frameTime: stats.frameTime, vramMB: stats.vramMB });
  }, []);

  // Multi 모드 재생 상태 변경 콜백
  const handleMultiPlayingChange = useCallback((playing: boolean) => {
    setIsPlaying(playing);
  }, []);

  // Multi Canvas 모드 핸들러
  const toggleMultiCanvasPlay = useCallback(() => {
    if (multiCanvasGroupRef.current) {
      multiCanvasGroupRef.current.togglePlayAll();
      setMultiCanvasIsPlaying(!multiCanvasIsPlaying);
    }
  }, [multiCanvasIsPlaying]);

  const handleMultiCanvasFpsChange = useCallback((newFps: number) => {
    setMultiCanvasFps(newFps);
    if (multiCanvasGroupRef.current) {
      multiCanvasGroupRef.current.setFpsAll(newFps);
    }
  }, []);

  // Multi Canvas 영상/정지 통계
  const multiCanvasStats = useMemo(() => {
    const playableCount = multiCanvasViewers.filter(v =>
      v.imageInfo && v.frames.length > 1
    ).length;
    const stillCount = multiCanvasViewers.length - playableCount;
    return { playableCount, stillCount, allStillImages: playableCount === 0 };
  }, [multiCanvasViewers]);

  return (
    <div style={{
      padding: '20px',
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '1400px',
      margin: '0 auto',
      minHeight: '100vh',
      background: '#121218',
      color: '#e0e0e0',
    }}>
      {/* Hardware Info Panel */}
      <HardwareInfoPanel
        gl={glRef.current}
        renderStats={multiViewportReady ? { fps: multiStats.fps, frameTime: multiStats.frameTime, lastRenderTime: multiStats.frameTime } : undefined}
        textureMemory={viewMode === 'multi' ? textureMemoryInfo : null}
        defaultOpen={false}
        position="right"
      />

      <h1 style={{ marginBottom: '20px', color: '#fff' }}>EchoPixel Demo - DICOM Viewer</h1>

      {/* 뷰 모드 선택 탭 */}
      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '20px',
        borderBottom: '2px solid #333',
        paddingBottom: '0',
      }}>
        <button
          onClick={() => handleViewModeChange('single')}
          style={{
            padding: '12px 24px',
            background: viewMode === 'single' ? '#2d1f3d' : '#1a1a1a',
            color: viewMode === 'single' ? '#e8b4f8' : '#888',
            border: 'none',
            borderRadius: '8px 8px 0 0',
            cursor: 'pointer',
            fontWeight: viewMode === 'single' ? 'bold' : 'normal',
            fontSize: '14px',
            borderBottom: viewMode === 'single' ? '3px solid #a47' : '3px solid transparent',
            transition: 'all 0.2s',
          }}
        >
          Single ViewPort
        </button>
        <button
          onClick={() => handleViewModeChange('multi-canvas')}
          style={{
            padding: '12px 24px',
            background: viewMode === 'multi-canvas' ? '#1f2d3d' : '#1a1a1a',
            color: viewMode === 'multi-canvas' ? '#b4d8f8' : '#888',
            border: 'none',
            borderRadius: '8px 8px 0 0',
            cursor: 'pointer',
            fontWeight: viewMode === 'multi-canvas' ? 'bold' : 'normal',
            fontSize: '14px',
            borderBottom: viewMode === 'multi-canvas' ? '3px solid #47a' : '3px solid transparent',
            transition: 'all 0.2s',
          }}
        >
          Multi ViewPort (Single viewPort 기반)
        </button>
        <button
          onClick={() => handleViewModeChange('multi')}
          style={{
            padding: '12px 24px',
            background: viewMode === 'multi' ? '#1f3d2d' : '#1a1a1a',
            color: viewMode === 'multi' ? '#b4f8c8' : '#888',
            border: 'none',
            borderRadius: '8px 8px 0 0',
            cursor: 'pointer',
            fontWeight: viewMode === 'multi' ? 'bold' : 'normal',
            fontSize: '14px',
            borderBottom: viewMode === 'multi' ? '3px solid #7a4' : '3px solid transparent',
            transition: 'all 0.2s',
          }}
        >
          Multi ViewPort (Single canvas 기반)
        </button>
      </div>

      {/* === 단일 뷰포트 모드 === */}
      {viewMode === 'single' && (
        <>
          {/* 모드 설명 패널 */}
          <div style={{
            padding: '15px',
            marginBottom: '15px',
            background: '#2d1f3d',
            border: '1px solid #a47',
            borderRadius: '4px',
          }}>
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
          <div style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '20px',
          }}>
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
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
            marginBottom: '15px',
            padding: '10px 15px',
            background: '#252525',
            borderRadius: '4px',
            fontSize: '13px',
          }}>
            <span style={{ color: '#888' }}>📐 Size:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#aaa' }}>
              W:
              <input
                type="number"
                min={200}
                max={1920}
                value={singleViewportWidth}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) setSingleViewportWidth(val);
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value) || 768;
                  setSingleViewportWidth(Math.max(200, Math.min(1920, val)));
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
                value={singleViewportHeight}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) setSingleViewportHeight(val);
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value) || 576;
                  setSingleViewportHeight(Math.max(200, Math.min(1080, val)));
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
              <button
                onClick={() => { setSingleViewportWidth(512); setSingleViewportHeight(384); }}
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
                512×384
              </button>
              <button
                onClick={() => { setSingleViewportWidth(768); setSingleViewportHeight(576); }}
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
                768×576
              </button>
              <button
                onClick={() => { setSingleViewportWidth(1024); setSingleViewportHeight(768); }}
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
                1024×768
              </button>
            </div>
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

          {/* WADO-RS 입력 폼 - 로딩 중에는 숨김 */}
          {mode === 'wado-rs' && !instanceId && !loadingStatus && (
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

          {/* DICOM 뷰포트 (Local / WADO-RS 모두 viewportData 사용) */}
          {viewportData && (
            <div
              onDoubleClick={() => setSingleExpandedView(true)}
              style={{ cursor: 'pointer' }}
              title="더블클릭하여 확대 보기"
            >
              <SingleDicomViewer
                frames={viewportData.frames}
                imageInfo={viewportData.imageInfo}
                isEncapsulated={viewportData.isEncapsulated}
                width={singleViewportWidth}
                height={singleViewportHeight}
                showToolbar={true}
                showContextLossTest={true}
                // Phase 3e: SVG 어노테이션 표시
                annotations={singleAnnotations}
                // Phase 3f: 어노테이션 생성 콜백
                onAnnotationUpdate={handleSingleAnnotationUpdate}
                // Phase 3g-2: 어노테이션 선택/편집
                selectedAnnotationId={selectedAnnotationId}
                onAnnotationSelect={handleAnnotationSelect}
                onAnnotationDelete={handleAnnotationDelete}
                // Phase 3g: 어노테이션 보이기/숨김
                showAnnotations={showAnnotations}
                onAnnotationsVisibilityChange={setShowAnnotations}
              />
            </div>
          )}

          {/* Single Viewport 확대 보기 오버레이 */}
          {singleExpandedView && viewportData && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.98)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* 헤더 */}
              <div
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 20px',
                  background: '#1a1a2e',
                  borderBottom: '1px solid #333',
                  color: '#fff',
                }}
              >
                <h2 style={{ margin: 0, fontSize: '16px' }}>
                  🔍 확대 보기: {fileName || 'DICOM Image'}
                </h2>
                <button
                  onClick={() => setSingleExpandedView(false)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    background: '#c44',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  ✕ 닫기 (ESC)
                </button>
              </div>

              {/* 확대된 SingleDicomViewer */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'flex-start',
                  padding: '20px',
                  paddingTop: '10px',
                  overflow: 'auto',
                  minHeight: 0,
                }}
              >
                <SingleDicomViewer
                  frames={viewportData.frames}
                  imageInfo={viewportData.imageInfo}
                  isEncapsulated={viewportData.isEncapsulated}
                  width={Math.min(window.innerWidth - 80, 1200)}
                  height={Math.min(window.innerHeight - 150, 800)}
                  initialFps={30}
                  showAnnotations={showAnnotations}
                  showToolbar={true}
                  showControls={true}
                  annotations={singleAnnotations}
                  selectedAnnotationId={selectedAnnotationId}
                  onAnnotationSelect={handleAnnotationSelect}
                  onAnnotationUpdate={handleSingleAnnotationUpdate}
                  onAnnotationDelete={handleAnnotationDelete}
                />
              </div>
            </div>
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
          {/* 모드 설명 패널 */}
          <div style={{
            padding: '15px',
            marginBottom: '15px',
            background: '#1f3d2d',
            border: '1px solid #7a4',
            borderRadius: '4px',
          }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#b4f8c8', fontSize: '16px' }}>
              🎯 Multi (Single Canvas)
            </h3>
            <p style={{ margin: 0, color: '#a8c8b8', fontSize: '13px', lineHeight: '1.5' }}>
              <strong>단일 WebGL Canvas</strong>에서 여러 뷰포트를 렌더링합니다.
              gl.scissor()와 gl.viewport()로 영역을 분할하여 각 뷰포트를 그립니다.
              텍스처 공유가 가능하여 메모리 효율적이지만, 16개 이상 뷰포트에서 성능 테스트가 필요합니다.
            </p>
          </div>

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
            background: '#1a2a1a',
            border: '1px solid #4a7',
            borderRadius: '4px',
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#8f8', fontSize: '16px' }}>
              WADO-RS 설정
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
                  뷰포트 개수: {viewportCount}개 ({getGridDimensions(viewportCount).cols}×{getGridDimensions(viewportCount).rows})
                </label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={viewportCount}
                  onChange={(e) => setViewportCount(Number(e.target.value))}
                  style={{
                    width: '100%',
                    cursor: 'pointer',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888', marginTop: '2px' }}>
                  <span>1</span>
                  <span>50</span>
                  <span>100</span>
                </div>
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
                {multiLoadingStatus || `로드 (${selectedUids.size > 0 ? selectedUids.size : viewportCount}개)`}
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
                    Instance 선택 ({selectedUids.size} / {viewportCount}개)
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

          {/* 성능 옵션 패널 */}
          <PerformanceOptionsPanel
            options={performanceOptions}
            onChange={setPerformanceOptions}
            currentVramMB={multiStats.vramMB}
            style={{ marginBottom: '15px' }}
          />

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
              <span>Multi-Viewport ({viewportCount}개, {getGridDimensions(viewportCount).cols}×{getGridDimensions(viewportCount).rows}) | {multiSeriesMap.size} loaded</span>
              <span style={{ color: '#8f8' }}>
                FPS: {multiStats.fps} | Frame Time: {multiStats.frameTime.toFixed(1)}ms | VRAM: {multiStats.vramMB.toFixed(1)}MB
              </span>
            </div>
          )}

          {/* HybridMultiViewport (리팩토링 - @echopixel/react) */}
          {multiSeriesMap.size > 0 && (
            <ReactHybridMultiViewport
              key={performanceKey}
              ref={multiViewportRef}
              viewportCount={viewportCount}
              width={1320}
              height={900}
              minViewportHeight={250}
              seriesMap={multiSeriesMap}
              syncMode="frame-ratio"
              initialFps={fps}
              showDefaultOverlay={true}
              performanceOptions={performanceOptions}
              onPlayingChange={handleMultiPlayingChange}
              onStatsUpdate={handleMultiStatsUpdate}
              onViewportDoubleClick={(viewportId) => {
                console.log('[Demo] onViewportDoubleClick called:', viewportId);
                setExpandedViewportId(viewportId);
              }}
              // Phase 3g: 어노테이션 생성 기능
              // 어노테이션은 내부 ID 기반 맵으로 변환하여 전달
              annotations={multiAnnotationsForHybrid.size > 0 ? multiAnnotationsForHybrid : testAnnotations}
              selectedAnnotationId={multiSelectedAnnotationId}
              onAnnotationSelect={handleMultiAnnotationSelect}
              onAnnotationUpdate={handleMultiAnnotationUpdate}
              onAnnotationDelete={handleMultiAnnotationDelete}
              // 어노테이션 도구
              showAnnotationTools={true}
              activeTool={multiActiveTool}
              onToolChange={setMultiActiveTool}
              showAnnotations={multiShowAnnotations}
              onAnnotationsVisibilityChange={setMultiShowAnnotations}
              // ID 매핑 콜백 (setTimeout 대신 안정적인 방식)
              onViewportIdsReady={handleViewportIdsReady}
              style={{
                border: '1px solid #444',
                marginBottom: '10px',
              }}
            />
          )}

          {/* 확대 뷰 버튼 패널 */}
          {multiSeriesMap.size > 0 && (
            <div style={{
              padding: '10px',
              marginBottom: '10px',
              background: '#1a2a3a',
              borderRadius: '4px',
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}>
              <span style={{ color: '#8cf', fontSize: '13px' }}>🔍 확대 보기:</span>
              {Array.from(multiSeriesMap.keys()).map((viewportId) => (
                <button
                  key={viewportId}
                  onClick={() => {
                    console.log('[Demo] Expand button clicked:', viewportId);
                    setExpandedViewportId(viewportId);
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    background: '#2a3a4a',
                    color: '#fff',
                    border: '1px solid #4a6a8a',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {viewportId}
                </button>
              ))}
              <span style={{ color: '#888', fontSize: '11px', marginLeft: '10px' }}>
                (또는 뷰포트 더블클릭)
              </span>
            </div>
          )}

          {/* 디버그: expandedViewportId 상태 표시 */}
          <div style={{ color: '#ff0', fontSize: '12px', marginBottom: '10px' }}>
            [DEBUG] expandedViewportId: {expandedViewportId || 'null'},
            mappedKey: {expandedViewportId ? (viewportIdToSeriesKeyMap.get(expandedViewportId) || 'not found') : 'null'}
          </div>

          {/* 확대 뷰 오버레이 (더블클릭 시) */}
          {expandedViewportId && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.98)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* 헤더 */}
              <div
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 20px',
                  background: '#1a1a2e',
                  borderBottom: '1px solid #333',
                  color: '#fff',
                }}
              >
                <h2 style={{ margin: 0, fontSize: '16px' }}>
                  🔍 확대 보기: {viewportIdToSeriesKeyMap.get(expandedViewportId) || expandedViewportId}
                </h2>
                <button
                  onClick={() => setExpandedViewportId(null)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    background: '#c44',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  ✕ 닫기 (ESC)
                </button>
              </div>

              {/* 확대된 SingleDicomViewer */}
              {(() => {
                // 내부 뷰포트 ID → seriesMap 키 변환
                const seriesKey = viewportIdToSeriesKeyMap.get(expandedViewportId!) || expandedViewportId!;
                const seriesData = multiSeriesMap.get(seriesKey);
                if (!seriesData) {
                  console.log('[Demo] No seriesData found for key:', seriesKey);
                  return <div style={{ color: '#f88', padding: '20px' }}>시리즈 데이터를 찾을 수 없습니다: {seriesKey}</div>;
                }

                // 뷰어 크기 계산 (헤더 ~50px, 패딩 40px, 여유 60px)
                const viewerWidth = Math.min(window.innerWidth - 80, 900);
                const viewerHeight = Math.min(window.innerHeight - 150, 600);

                return (
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'flex-start', // 상단부터 시작
                      padding: '20px',
                      paddingTop: '10px',
                      overflow: 'auto',
                      minHeight: 0,
                    }}
                  >
                    <SingleDicomViewer
                      frames={seriesData.frames}
                      imageInfo={seriesData.imageInfo}
                      isEncapsulated={seriesData.isEncapsulated}
                      width={viewerWidth}
                      height={viewerHeight}
                      initialFps={30}
                      showAnnotations={true}
                      showToolbar={true}
                      showControls={true}
                      annotations={multiAnnotations.get(seriesKey) || []}
                      selectedAnnotationId={multiSelectedAnnotationId}
                      onAnnotationSelect={(id) => handleMultiAnnotationSelect(seriesKey, id)}
                      onAnnotationUpdate={(annotation) => handleMultiAnnotationUpdate(seriesKey, annotation)}
                      onAnnotationDelete={(id) => handleMultiAnnotationDelete(seriesKey, id)}
                    />
                  </div>
                );
              })()}
            </div>
          )}

          {/* 컨트롤 */}
          {multiViewportReady && (() => {
            // 재생 가능한 뷰포트 수 계산 (frameCount > 1)
            const seriesArray = Array.from(multiSeriesMap.values());
            const playableCount = seriesArray.filter(s => s.info.frameCount > 1).length;
            const allStillImages = playableCount === 0;
            const stillImageCount = seriesArray.length - playableCount;

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

                {/* 어노테이션 표시 토글 */}
                <button
                  onClick={() => setMultiShowAnnotations(!multiShowAnnotations)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    background: multiShowAnnotations ? '#2a4a4a' : '#3a3a3a',
                    color: multiShowAnnotations ? '#8ff' : '#888',
                    border: multiShowAnnotations ? '2px solid #5aa' : '2px solid transparent',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                  title={multiShowAnnotations ? '어노테이션 숨기기' : '어노테이션 표시'}
                >
                  {multiShowAnnotations ? '👁 어노테이션 표시' : '👁‍🗨 어노테이션 숨김'}
                </button>

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
          {multiSeriesMap.size > 0 && (
            <div style={{
              marginTop: '10px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '8px',
            }}>
              {Array.from(multiSeriesMap.entries()).map(([viewportId, series], idx) => (
                <div
                  key={viewportId}
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
                    {series.info.frameCount <= 1 ? (
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
                        color: isPlaying ? '#8f8' : '#888',
                        background: isPlaying ? '#1a3a1a' : '#2a2a2a',
                        padding: '2px 6px',
                        borderRadius: '3px',
                      }}>
                        {isPlaying ? 'Playing' : 'Stopped'}
                      </span>
                    )}
                  </div>
                  {series.info.seriesId && (
                    <div style={{
                      fontFamily: 'monospace',
                      fontSize: '9px',
                      color: '#6af',
                      marginBottom: '4px',
                      wordBreak: 'break-all',
                    }}>
                      UID: ...{series.info.seriesId.slice(-25)}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Frames: {series.info.frameCount}</span>
                    <span>Size: {series.info.imageWidth}x{series.info.imageHeight}</span>
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
          {/* 모드 설명 패널 */}
          <div style={{
            padding: '15px',
            marginBottom: '15px',
            background: '#1f2d3d',
            border: '1px solid #47a',
            borderRadius: '4px',
          }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#b4d8f8', fontSize: '16px' }}>
              🔲 Multi (Multi Canvas)
            </h3>
            <p style={{ margin: 0, color: '#a8b8c8', fontSize: '13px', lineHeight: '1.5' }}>
              각 뷰포트마다 <strong>별도의 Canvas와 WebGL Context</strong>를 생성합니다.
              구현이 단순하지만 브라우저 제한으로 <strong>최대 8~16개</strong> Context만 동시 사용 가능합니다.
              16개 이상 뷰포트가 필요한 경우 Multi (Single Canvas) 모드를 사용하세요.
            </p>
          </div>

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
            background: '#1a1a2a',
            border: '1px solid #47a',
            borderRadius: '4px',
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#8cf', fontSize: '16px' }}>
              WADO-RS 설정
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
                  뷰포트 개수: {viewportCount}개 ({getGridDimensions(viewportCount).cols}×{getGridDimensions(viewportCount).rows})
                </label>
                <input
                  type="range"
                  min="1"
                  max="16"
                  value={Math.min(viewportCount, 16)}
                  onChange={(e) => setViewportCount(Number(e.target.value))}
                  style={{
                    width: '100%',
                    cursor: 'pointer',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888', marginTop: '2px' }}>
                  <span>1</span>
                  <span>8</span>
                  <span>16</span>
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
                onClick={loadMultiCanvasViewers}
                disabled={selectedUids.size === 0 || !!scanningStatus || multiCanvasLoading}
                style={{
                  padding: '10px 20px',
                  background: selectedUids.size === 0 || multiCanvasLoading ? '#555' : '#4a7',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: selectedUids.size === 0 || multiCanvasLoading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                {multiCanvasLoading ? '로딩 중...' : `로드 (${Math.min(selectedUids.size, getMaxSelect())}개)`}
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
                    Instance 선택 ({selectedUids.size} / {getMaxSelect()}개)
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

          {/* SingleDicomViewerGroup 렌더링 */}
          {multiCanvasViewers.length > 0 && (
            <div style={{ marginTop: '15px' }}>
              {/* 상태 표시 바 */}
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
                <span>Multi-Canvas ({viewportCount}개, {getGridDimensions(viewportCount).cols}×{getGridDimensions(viewportCount).rows}) | {multiCanvasViewers.length} loaded</span>
                <span style={{ color: '#8f8' }}>
                  FPS: {multiCanvasFps}
                </span>
              </div>

              {/* SingleDicomViewerGroup */}
              <SingleDicomViewerGroup
                ref={multiCanvasGroupRef}
                viewers={multiCanvasViewers}
                viewportCount={viewportCount}
                width={1320}
                minViewerHeight={510}
                gap={8}
                fps={multiCanvasFps}
                selectable={true}
                enableDoubleClickExpand={true}
                toolbarTools={DEFAULT_TOOLS}
                viewerOptions={{
                  showToolbar: true,
                  showStatusBar: true,
                  showControls: true,
                  toolbarCompact: true,
                  showAnnotations: multiCanvasShowAnnotations,
                }}
              />

              {/* 컨트롤 패널 */}
              <div style={{
                padding: '12px',
                marginTop: '10px',
                background: '#1a1a2e',
                borderRadius: '4px',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                flexWrap: 'wrap',
              }}>
                <button
                  onClick={toggleMultiCanvasPlay}
                  disabled={multiCanvasStats.allStillImages}
                  style={{
                    padding: '8px 20px',
                    fontSize: '14px',
                    background: multiCanvasStats.allStillImages ? '#555' : (multiCanvasIsPlaying ? '#c44' : '#4c4'),
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: multiCanvasStats.allStillImages ? 'not-allowed' : 'pointer',
                    minWidth: '100px',
                    opacity: multiCanvasStats.allStillImages ? 0.6 : 1,
                  }}
                  title={multiCanvasStats.allStillImages ? '모든 뷰포트가 정지 영상입니다' : ''}
                >
                  {multiCanvasIsPlaying ? '⏸ Stop' : '▶ Play All'}
                </button>

                {!multiCanvasStats.allStillImages && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label>FPS:</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={multiCanvasFps}
                      onChange={(e) => handleMultiCanvasFpsChange(Math.max(1, Math.min(60, Number(e.target.value))))}
                      style={{ width: '50px', padding: '4px' }}
                    />
                    <input
                      type="range"
                      min={1}
                      max={60}
                      value={multiCanvasFps}
                      onChange={(e) => handleMultiCanvasFpsChange(Number(e.target.value))}
                      style={{ width: '100px' }}
                    />
                  </div>
                )}

                <button
                  onClick={() => multiCanvasGroupRef.current?.resetFrameAll()}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    background: '#444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  ⏮ 처음으로
                </button>

                <button
                  onClick={() => multiCanvasGroupRef.current?.resetViewportAll()}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    background: '#444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  🔄 뷰포트 리셋
                </button>

                {/* 어노테이션 표시 토글 */}
                <button
                  onClick={() => setMultiCanvasShowAnnotations(!multiCanvasShowAnnotations)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    background: multiCanvasShowAnnotations ? '#2a4a4a' : '#3a3a3a',
                    color: multiCanvasShowAnnotations ? '#8ff' : '#888',
                    border: multiCanvasShowAnnotations ? '2px solid #5aa' : '2px solid transparent',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                  title={multiCanvasShowAnnotations ? '어노테이션 숨기기' : '어노테이션 표시'}
                >
                  {multiCanvasShowAnnotations ? '👁 어노테이션 표시' : '👁‍🗨 어노테이션 숨김'}
                </button>

                {/* 영상/정지 영상 통계 */}
                <div style={{ fontSize: '12px', color: '#888', marginLeft: 'auto' }}>
                  {multiCanvasStats.allStillImages ? (
                    <span style={{ color: '#fa8' }}>모든 뷰포트가 정지 영상입니다</span>
                  ) : (
                    <>
                      <span style={{ color: '#8f8' }}>영상: {multiCanvasStats.playableCount}개</span>
                      {multiCanvasStats.stillCount > 0 && (
                        <span style={{ color: '#fa8', marginLeft: '10px' }}>정지: {multiCanvasStats.stillCount}개</span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 뷰포트 정보 그리드 */}
              <div style={{
                marginTop: '10px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '8px',
              }}>
                {multiCanvasViewers.map((viewer, idx) => (
                  <div
                    key={viewer.id}
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
                      {viewer.frames.length <= 1 ? (
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
                          color: multiCanvasIsPlaying ? '#8f8' : '#888',
                          background: multiCanvasIsPlaying ? '#1a3a1a' : '#2a2a2a',
                          padding: '2px 6px',
                          borderRadius: '3px',
                        }}>
                          {multiCanvasIsPlaying ? 'Playing' : 'Stopped'}
                        </span>
                      )}
                    </div>
                    {viewer.label && (
                      <div style={{
                        fontFamily: 'monospace',
                        fontSize: '9px',
                        color: '#6af',
                        marginBottom: '4px',
                        wordBreak: 'break-all',
                      }}>
                        UID: ...{viewer.label.slice(-25)}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Frames: {viewer.frames.length}</span>
                      <span>Size: {viewer.imageInfo.width}x{viewer.imageInfo.height}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 로딩 상태 표시 */}
          {multiCanvasLoading && (
            <div style={{
              padding: '40px',
              background: '#1a1a2a',
              borderRadius: '4px',
              textAlign: 'center',
              color: '#8cf',
            }}>
              <div style={{ fontSize: '20px', marginBottom: '10px' }}>⏳</div>
              DICOM 데이터를 로딩 중입니다...
            </div>
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
