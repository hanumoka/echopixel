import { DecodedFrame } from './types';
import { DicomImageInfo } from './DicomParser';

/**
 * Native (비압축) 픽셀 데이터 디코딩 옵션
 */
export interface NativeDecodeOptions {
  /** 이미지 정보 (필수) */
  imageInfo: DicomImageInfo;
  /** Window Center (선택, 없으면 자동 계산) */
  windowCenter?: number;
  /** Window Width (선택, 없으면 자동 계산) */
  windowWidth?: number;
}

/**
 * Window/Level을 적용하여 0-255 범위로 변환
 *
 * @param pixelValue - 원본 픽셀 값
 * @param windowCenter - Window Center (밝기 중심)
 * @param windowWidth - Window Width (대비 범위)
 * @returns 0-255 범위의 출력 값
 */
export function applyWindowLevel(
  pixelValue: number,
  windowCenter: number,
  windowWidth: number,
): number {
  // Window 범위의 최소/최대 계산
  const minValue = windowCenter - windowWidth / 2;
  const maxValue = windowCenter + windowWidth / 2;

  // 범위 밖 값 클램핑
  if (pixelValue <= minValue) return 0;
  if (pixelValue >= maxValue) return 255;

  // 선형 보간으로 0-255 범위로 변환
  return Math.round(((pixelValue - minValue) / windowWidth) * 255);
}

/**
 * 픽셀 데이터의 최소/최대값 계산 (자동 Window/Level용)
 *
 * @param pixelData - Raw 픽셀 데이터
 * @param bitsAllocated - 픽셀당 할당 비트 (8 또는 16)
 * @param pixelRepresentation - 0=unsigned, 1=signed
 * @returns 최소/최대값
 */
export function calculateMinMax(
  pixelData: Uint8Array,
  bitsAllocated: number,
  pixelRepresentation: number,
): { min: number; max: number } {
  let min = Number.MAX_VALUE;
  let max = Number.MIN_VALUE;

  if (bitsAllocated === 8) {
    // 8-bit 데이터
    for (let i = 0; i < pixelData.length; i++) {
      const value = pixelData[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }
  } else if (bitsAllocated === 16) {
    // 16-bit 데이터 - Little Endian으로 읽기
    const dataView = new DataView(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength);
    const pixelCount = pixelData.length / 2;

    for (let i = 0; i < pixelCount; i++) {
      let value: number;
      if (pixelRepresentation === 1) {
        // Signed
        value = dataView.getInt16(i * 2, true);
      } else {
        // Unsigned
        value = dataView.getUint16(i * 2, true);
      }
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  return { min, max };
}

/**
 * Raw 픽셀 데이터를 TypedArray로 변환
 *
 * @param pixelData - Raw 바이트 배열
 * @param bitsAllocated - 픽셀당 할당 비트
 * @param pixelRepresentation - 0=unsigned, 1=signed
 * @returns 픽셀 값 배열
 */
function convertToTypedArray(
  pixelData: Uint8Array,
  bitsAllocated: number,
  pixelRepresentation: number,
): Int16Array | Uint16Array | Uint8Array {
  if (bitsAllocated === 8) {
    return pixelData;
  }

  // 16-bit 데이터
  const buffer = pixelData.buffer.slice(
    pixelData.byteOffset,
    pixelData.byteOffset + pixelData.byteLength,
  );

  if (pixelRepresentation === 1) {
    return new Int16Array(buffer);
  }
  return new Uint16Array(buffer);
}

/**
 * Native 픽셀 데이터를 디코딩하여 렌더링 가능한 형태로 변환
 *
 * @param pixelData - Raw 픽셀 데이터 (Uint8Array)
 * @param options - 디코딩 옵션
 * @returns DecodedFrame (ImageBitmap 포함)
 */
export async function decodeNative(
  pixelData: Uint8Array,
  options: NativeDecodeOptions,
): Promise<DecodedFrame> {
  const { imageInfo, windowCenter: wc, windowWidth: ww } = options;
  const {
    columns,
    rows,
    bitsAllocated,
    samplesPerPixel,
    photometricInterpretation,
    pixelRepresentation,
  } = imageInfo;

  const pixelCount = columns * rows;

  // RGB 컬러 이미지 처리
  if (samplesPerPixel === 3) {
    return decodeRgbNative(pixelData, columns, rows, photometricInterpretation);
  }

  // Grayscale 이미지 처리
  const typedPixels = convertToTypedArray(pixelData, bitsAllocated, pixelRepresentation);

  // Window/Level 계산 (제공되지 않은 경우 자동 계산)
  let windowCenter = wc;
  let windowWidth = ww;

  if (windowCenter === undefined || windowWidth === undefined) {
    const { min, max } = calculateMinMax(pixelData, bitsAllocated, pixelRepresentation);
    windowCenter = (min + max) / 2;
    windowWidth = max - min;
    if (windowWidth === 0) windowWidth = 1; // 0으로 나누기 방지
  }

  // RGBA 배열 생성 (4 bytes per pixel)
  const rgbaData = new Uint8ClampedArray(pixelCount * 4);

  // MONOCHROME1은 반전 필요 (0=흰색, max=검은색)
  const invert = photometricInterpretation === 'MONOCHROME1';

  for (let i = 0; i < pixelCount; i++) {
    let gray = applyWindowLevel(typedPixels[i], windowCenter, windowWidth);

    if (invert) {
      gray = 255 - gray;
    }

    const idx = i * 4;
    rgbaData[idx] = gray; // R
    rgbaData[idx + 1] = gray; // G
    rgbaData[idx + 2] = gray; // B
    rgbaData[idx + 3] = 255; // A (불투명)
  }

  // ImageData 생성
  const imageData = new ImageData(rgbaData, columns, rows);

  // ImageBitmap 생성 (GPU 업로드 최적화)
  const imageBitmap = await createImageBitmap(imageData);

  return {
    image: imageBitmap,
    width: columns,
    height: rows,
    needsClose: false, // ImageBitmap은 close() 불필요
  };
}

/**
 * RGB Native 픽셀 데이터 디코딩
 */
async function decodeRgbNative(
  pixelData: Uint8Array,
  columns: number,
  rows: number,
  photometricInterpretation: string,
): Promise<DecodedFrame> {
  const pixelCount = columns * rows;
  const rgbaData = new Uint8ClampedArray(pixelCount * 4);

  // YBR_FULL → RGB 변환이 필요한 경우
  const isYBR = photometricInterpretation.startsWith('YBR');

  for (let i = 0; i < pixelCount; i++) {
    const srcIdx = i * 3;
    const dstIdx = i * 4;

    if (isYBR) {
      // YBR_FULL → RGB 변환
      const y = pixelData[srcIdx];
      const cb = pixelData[srcIdx + 1];
      const cr = pixelData[srcIdx + 2];

      rgbaData[dstIdx] = clamp(y + 1.402 * (cr - 128)); // R
      rgbaData[dstIdx + 1] = clamp(y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128)); // G
      rgbaData[dstIdx + 2] = clamp(y + 1.772 * (cb - 128)); // B
    } else {
      // RGB는 그대로 복사
      rgbaData[dstIdx] = pixelData[srcIdx]; // R
      rgbaData[dstIdx + 1] = pixelData[srcIdx + 1]; // G
      rgbaData[dstIdx + 2] = pixelData[srcIdx + 2]; // B
    }
    rgbaData[dstIdx + 3] = 255; // A
  }

  const imageData = new ImageData(rgbaData, columns, rows);
  const imageBitmap = await createImageBitmap(imageData);

  return {
    image: imageBitmap,
    width: columns,
    height: rows,
    needsClose: false,
  };
}

/**
 * 값을 0-255 범위로 클램핑
 */
function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
