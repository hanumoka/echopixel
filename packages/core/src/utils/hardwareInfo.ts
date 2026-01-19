/**
 * Hardware Information Utility
 *
 * 학습 포인트:
 * - WebGL 컨텍스트에서 GPU 정보 추출
 * - 브라우저 API로 시스템 정보 조회
 * - DICOM 뷰어 성능과 관련된 하드웨어 한계값 파악
 */

/**
 * GPU/WebGL 정보
 */
export interface GPUInfo {
  /** GPU 벤더 (NVIDIA, AMD, Intel 등) */
  vendor: string;
  /** GPU 렌더러 (구체적인 모델명) */
  renderer: string;
  /** WebGL 버전 */
  webglVersion: string;
  /** GLSL 버전 */
  glslVersion: string;
  /** 단일 텍스처 최대 크기 (px) */
  maxTextureSize: number;
  /** 2D Array Texture 최대 레이어 수 */
  maxArrayTextureLayers: number;
  /** Fragment Shader 텍스처 유닛 수 */
  maxTextureUnits: number;
  /** 총 텍스처 유닛 수 */
  maxCombinedTextureUnits: number;
  /** 렌더버퍼 최대 크기 */
  maxRenderbufferSize: number;
  /** 최대 뷰포트 크기 */
  maxViewportDims: [number, number];
  /** Anisotropic Filtering 지원 여부 */
  maxAnisotropy: number;
  /** 지원 확장 목록 */
  extensions: string[];
}

/**
 * CPU/메모리 정보
 */
export interface CPUMemoryInfo {
  /** CPU 논리 코어 수 */
  hardwareConcurrency: number;
  /** 디바이스 메모리 (GB, 근사치) */
  deviceMemory: number | null;
  /** JS Heap 사용량 (Chrome 전용) */
  jsHeapSizeLimit: number | null;
  jsHeapUsed: number | null;
  jsHeapTotal: number | null;
}

/**
 * 디스플레이 정보
 */
export interface DisplayInfo {
  /** 화면 너비 */
  screenWidth: number;
  /** 화면 높이 */
  screenHeight: number;
  /** 사용 가능한 너비 (태스크바 제외) */
  availWidth: number;
  /** 사용 가능한 높이 */
  availHeight: number;
  /** 디바이스 픽셀 비율 (DPI 스케일) */
  devicePixelRatio: number;
  /** 색상 깊이 (비트) */
  colorDepth: number;
  /** 픽셀 깊이 */
  pixelDepth: number;
}

/**
 * 브라우저/플랫폼 정보
 */
export interface PlatformInfo {
  /** User Agent */
  userAgent: string;
  /** 플랫폼 */
  platform: string;
  /** 언어 */
  language: string;
  /** 온라인 상태 */
  onLine: boolean;
  /** 쿠키 활성화 여부 */
  cookieEnabled: boolean;
}

/**
 * 전체 하드웨어 정보
 */
export interface HardwareInfo {
  gpu: GPUInfo | null;
  cpuMemory: CPUMemoryInfo;
  display: DisplayInfo;
  platform: PlatformInfo;
  /** 정보 수집 시간 */
  timestamp: number;
}

/**
 * WebGL 컨텍스트에서 GPU 정보 추출
 *
 * @param gl - WebGL2 컨텍스트 (선택적, 없으면 임시 캔버스 생성)
 */
export function getGPUInfo(gl?: WebGL2RenderingContext | null): GPUInfo | null {
  let tempCanvas: HTMLCanvasElement | null = null;
  let context = gl;

  try {
    // gl이 없으면 임시 캔버스 생성
    if (!context) {
      tempCanvas = document.createElement('canvas');
      context = tempCanvas.getContext('webgl2');
      if (!context) {
        console.warn('[HardwareInfo] WebGL2 not supported');
        return null;
      }
    }

    // WEBGL_debug_renderer_info 확장으로 GPU 정보 조회
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo
      ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : context.getParameter(context.VENDOR);
    const renderer = debugInfo
      ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : context.getParameter(context.RENDERER);

    // Anisotropic Filtering 확장
    const anisotropicExt =
      context.getExtension('EXT_texture_filter_anisotropic') ||
      context.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    const maxAnisotropy = anisotropicExt
      ? context.getParameter(anisotropicExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT)
      : 0;

    // 지원 확장 목록
    const extensions = context.getSupportedExtensions() || [];

    // 최대 뷰포트 크기
    const maxViewport = context.getParameter(context.MAX_VIEWPORT_DIMS);

    return {
      vendor,
      renderer,
      webglVersion: context.getParameter(context.VERSION),
      glslVersion: context.getParameter(context.SHADING_LANGUAGE_VERSION),
      maxTextureSize: context.getParameter(context.MAX_TEXTURE_SIZE),
      maxArrayTextureLayers: context.getParameter(context.MAX_ARRAY_TEXTURE_LAYERS),
      maxTextureUnits: context.getParameter(context.MAX_TEXTURE_IMAGE_UNITS),
      maxCombinedTextureUnits: context.getParameter(context.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
      maxRenderbufferSize: context.getParameter(context.MAX_RENDERBUFFER_SIZE),
      maxViewportDims: [maxViewport[0], maxViewport[1]],
      maxAnisotropy,
      extensions,
    };
  } catch (error) {
    console.error('[HardwareInfo] Failed to get GPU info:', error);
    return null;
  } finally {
    // 임시 캔버스 정리
    if (tempCanvas) {
      tempCanvas.remove();
    }
  }
}

/**
 * CPU/메모리 정보 조회
 */
export function getCPUMemoryInfo(): CPUMemoryInfo {
  // performance.memory는 Chrome 전용 (비표준)
  const memory = (performance as Performance & { memory?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  } }).memory;

  return {
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory || null,
    jsHeapSizeLimit: memory?.jsHeapSizeLimit || null,
    jsHeapUsed: memory?.usedJSHeapSize || null,
    jsHeapTotal: memory?.totalJSHeapSize || null,
  };
}

/**
 * 디스플레이 정보 조회
 */
export function getDisplayInfo(): DisplayInfo {
  return {
    screenWidth: screen.width,
    screenHeight: screen.height,
    availWidth: screen.availWidth,
    availHeight: screen.availHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    colorDepth: screen.colorDepth,
    pixelDepth: screen.pixelDepth,
  };
}

/**
 * 플랫폼 정보 조회
 */
export function getPlatformInfo(): PlatformInfo {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    onLine: navigator.onLine,
    cookieEnabled: navigator.cookieEnabled,
  };
}

/**
 * 전체 하드웨어 정보 수집
 *
 * @param gl - WebGL2 컨텍스트 (선택적)
 */
export function collectHardwareInfo(gl?: WebGL2RenderingContext | null): HardwareInfo {
  return {
    gpu: getGPUInfo(gl),
    cpuMemory: getCPUMemoryInfo(),
    display: getDisplayInfo(),
    platform: getPlatformInfo(),
    timestamp: Date.now(),
  };
}

/**
 * 바이트를 사람이 읽을 수 있는 형식으로 변환
 */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'N/A';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * 텍스처 메모리 사용량 추정
 *
 * @param width - 텍스처 너비
 * @param height - 텍스처 높이
 * @param layers - 레이어 수 (2D Array Texture)
 * @param bytesPerPixel - 픽셀당 바이트 (기본: 4 for RGBA)
 */
export function estimateTextureMemory(
  width: number,
  height: number,
  layers: number = 1,
  bytesPerPixel: number = 4,
): number {
  return width * height * layers * bytesPerPixel;
}

/**
 * DICOM 뷰어 권장 사항 생성
 */
export function getDicomViewerRecommendations(info: HardwareInfo): string[] {
  const recommendations: string[] = [];

  if (!info.gpu) {
    recommendations.push('WebGL2 미지원 - DICOM 뷰어를 사용할 수 없습니다.');
    return recommendations;
  }

  // 텍스처 크기 제한 확인
  if (info.gpu.maxTextureSize < 4096) {
    recommendations.push(
      `최대 텍스처 크기(${info.gpu.maxTextureSize}px)가 작습니다. 큰 이미지 표시 시 제한될 수 있습니다.`,
    );
  }

  // Array Texture 레이어 확인
  if (info.gpu.maxArrayTextureLayers < 256) {
    recommendations.push(
      `최대 배열 레이어(${info.gpu.maxArrayTextureLayers})가 적습니다. 긴 cine 루프 재생 시 분할 필요할 수 있습니다.`,
    );
  }

  // 텍스처 유닛 확인 (16개 뷰포트 지원 여부)
  if (info.gpu.maxCombinedTextureUnits < 32) {
    recommendations.push(
      `텍스처 유닛(${info.gpu.maxCombinedTextureUnits})이 적습니다. 다중 뷰포트 지원이 제한될 수 있습니다.`,
    );
  }

  // CPU 코어 확인
  if (info.cpuMemory.hardwareConcurrency < 4) {
    recommendations.push(
      `CPU 코어(${info.cpuMemory.hardwareConcurrency})가 적습니다. 디코딩 성능이 제한될 수 있습니다.`,
    );
  }

  // 메모리 확인
  if (info.cpuMemory.deviceMemory && info.cpuMemory.deviceMemory < 4) {
    recommendations.push(
      `시스템 메모리(${info.cpuMemory.deviceMemory}GB)가 적습니다. 대용량 시리즈 로딩 시 주의가 필요합니다.`,
    );
  }

  // DPI 확인
  if (info.display.devicePixelRatio > 2) {
    recommendations.push(
      `높은 DPI(${info.display.devicePixelRatio}x) 환경입니다. 렌더링 해상도 증가로 성능 영향이 있을 수 있습니다.`,
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('시스템이 DICOM 뷰어 실행에 적합합니다.');
  }

  return recommendations;
}
