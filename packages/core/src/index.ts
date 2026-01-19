export const VERSION = '0.0.1';

/**
 * 렌더러 인터페이스
 * WebGL2 기반 렌더링을 위한 기본 API 정의
 */
export interface Renderer {
  /** 원시 WebGL2 컨텍스트 (고급 사용자용) */
  readonly gl: WebGL2RenderingContext;

  /**
   * 캔버스를 단색으로 채움
   * @param r Red (0.0 ~ 1.0)
   * @param g Green (0.0 ~ 1.0)
   * @param b Blue (0.0 ~ 1.0)
   */
  clear(r: number, g: number, b: number): void;

  /**
   * 렌더러와 관련된 모든 리소스 해제
   * React useEffect cleanup에서 호출 필요
   */
  dispose(): void;
}

/**
 * WebGL2 렌더러 생성 옵션
 */
export interface RendererOptions {
  /** WebGL2 컨텍스트 속성 */
  contextAttributes?: WebGLContextAttributes;
}

/**
 * WebGL2를 사용한 기본 렌더러 생성 함수
 * Canvas에 WebGL2 컨텍스트를 연결하고 렌더링 도구를 준비합니다.
 *
 * @param canvas - 렌더링 대상 캔버스 요소
 * @param options - 렌더러 옵션 (선택적)
 * @returns Renderer 인스턴스
 * @throws WebGL2를 지원하지 않는 브라우저에서 에러
 */
export function createRenderer(canvas: HTMLCanvasElement, options?: RendererOptions): Renderer {
  // 의료영상 최적화 기본값
  const defaultAttributes: WebGLContextAttributes = {
    alpha: false, // 배경 투명도 불필요 → 성능 향상
    antialias: false, // 픽셀 정확도 우선 (진단용)
    preserveDrawingBuffer: false, // 일반 렌더링에는 불필요
    powerPreference: 'high-performance', // 고성능 GPU 선호
  };

  const attributes = {
    ...defaultAttributes,
    ...options?.contextAttributes,
  };

  const gl = canvas.getContext('webgl2', attributes);

  if (!gl) {
    throw new Error('WebGL2 is not supported in this browser');
  }

  let disposed = false;

  return {
    gl,

    clear(r: number, g: number, b: number): void {
      if (disposed) {
        console.warn('Renderer is disposed, clear() ignored');
        return;
      }
      gl.clearColor(r, g, b, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },

    dispose(): void {
      if (disposed) return;

      // 향후 텍스처, 버퍼, 프로그램 등 GPU 리소스 정리
      // gl.deleteTexture(...)
      // gl.deleteBuffer(...)
      // gl.deleteProgram(...)

      disposed = true;
    },
  };
}

// DICOM
export {
  isDicomFile,
  parseDicom,
  getUint16Value,
  getStringValue,
  getImageInfo,
  isEncapsulated,
  getTransferSyntaxName,
  extractPixelData,
  isImageDecoderSupported,
  decodeJpeg,
  closeDecodedFrame,
  // Native Decoder
  decodeNative,
  applyWindowLevel,
  calculateMinMax,
} from './dicom';
export type {
  DicomTag,
  DicomElement,
  DicomDataset,
  DicomImageInfo,
  PixelDataInfo,
  DecodedFrame,
  NativeDecodeOptions,
} from './dicom';

// WebGL
export { TextureManager, QuadRenderer, ArrayTextureRenderer } from './webgl';
export type { WindowLevelOptions } from './webgl';

// Cache
export { LRUCache } from './cache';

// Network
export { NetworkError, retryFetch, raceFetch } from './network';
export type { NetworkErrorType, RetryOptions } from './network';

// DataSource
export { LocalFileDataSource, WadoRsDataSource } from './datasource';
export type {
  DataSource,
  DicomInstanceId,
  DicomMetadata,
  LoadFrameOptions,
  WadoRsConfig,
  LocalFileConfig,
} from './datasource';

// Viewport (Phase 2)
export { ViewportManager } from './viewport';
export type {
  Rect,
  WindowLevel,
  ViewportPlaybackState,
  ViewportSeriesInfo,
  ViewportTransform,
  Viewport,
  CreateViewportOptions,
  LayoutType,
  LayoutConfig,
} from './viewport';

// Sync (Phase 2)
export { RenderScheduler, FrameSyncEngine } from './sync';
export type {
  SyncMode,
  SyncGroup,
  CreateSyncGroupOptions,
  RenderSchedulerOptions,
  RenderStats,
  ViewportRenderCallback,
  FrameUpdateCallback,
} from './sync';

// Hybrid DOM-WebGL Architecture
export {
  HybridViewportManager,
  HybridRenderScheduler,
  domRectToWebGLViewport,
  webglViewportToCssRect,
  clientToWebGL,
  createCoordinateContext,
  updateCoordinateContext,
} from './hybrid';
export type {
  WebGLViewportBounds,
  ViewportSlotInfo,
  HybridViewport,
  CoordinateContext,
  SyncOptions,
  HybridViewportManagerOptions,
} from './hybrid';

// Tool System
export {
  // Types and Enums
  MouseBindings,
  KeyboardModifiers,
  ToolModes,
  // Base Tool
  BaseTool,
  // Registry
  ToolRegistry,
  addTool,
  removeTool,
  hasTool,
  getRegisteredToolNames,
  // Tool Management
  ToolGroup,
  ToolGroupManager,
  // Event Normalizer
  normalizeMouseEvent,
  normalizeWheelEvent,
  matchesBinding,
  // Manipulation Tools
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  // React Integration
  useToolGroup,
} from './tools';

export type {
  // Tool Types
  ToolBinding,
  NormalizedMouseEvent,
  ToolConfiguration,
  ToolState,
  ToolActivationOptions,
  ToolConstructor,
  ITool,
  // Tool Configuration Types
  WindowLevelToolConfiguration,
  PanToolConfiguration,
  ZoomToolConfiguration,
  StackScrollToolConfiguration,
  // React Hook Types
  UseToolGroupOptions,
  UseToolGroupReturn,
  ViewportManagerLike,
  DefaultToolBindings,
} from './tools';

// Hardware Info Utils
export {
  getGPUInfo,
  getCPUMemoryInfo,
  getDisplayInfo,
  getPlatformInfo,
  collectHardwareInfo,
  formatBytes,
  estimateTextureMemory,
  getDicomViewerRecommendations,
} from './utils/hardwareInfo';
export type {
  GPUInfo,
  CPUMemoryInfo,
  DisplayInfo,
  PlatformInfo,
  HardwareInfo,
} from './utils/hardwareInfo';
