import type { DecodedFrame } from './types';

/**
 * WebCodecs ImageDecoder 지원 여부 확인
 */
export function isImageDecoderSupported(): boolean {
  return typeof ImageDecoder !== 'undefined';
}

/**
 * JPEG 데이터를 디코딩 (WebCodecs 우선, createImageBitmap 폴백)
 */
export async function decodeJpeg(jpegData: Uint8Array): Promise<DecodedFrame> {
  // WebCodecs ImageDecoder 시도
  if (isImageDecoderSupported()) {
    try {
      return await decodeWithImageDecoder(jpegData);
    } catch (err) {
      console.warn('ImageDecoder failed, falling back to createImageBitmap:', err);
    }
  }

  // 폴백: createImageBitmap
  return await decodeWithCreateImageBitmap(jpegData);
}

/**
 * WebCodecs ImageDecoder로 디코딩
 */
async function decodeWithImageDecoder(jpegData: Uint8Array): Promise<DecodedFrame> {
  const decoder = new ImageDecoder({
    type: 'image/jpeg',
    data: jpegData,
  });

  // completed를 기다려서 안정적인 디코딩 보장
  await decoder.completed;

  const { image: videoFrame } = await decoder.decode();

  // I422, I420 등 YUV 포맷은 texImage2D에서 문제 발생
  // ImageBitmap으로 변환하여 RGBA로 만듦
  const isYuvFormat = videoFrame.format?.startsWith('I4') || videoFrame.format?.startsWith('NV');

  if (isYuvFormat) {
    const bitmap = await createImageBitmap(videoFrame);
    videoFrame.close(); // 원본 VideoFrame 해제
    decoder.close();

    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      needsClose: false, // ImageBitmap은 close() 선택적
    };
  }

  // RGB 계열은 그대로 사용
  const result: DecodedFrame = {
    image: videoFrame,
    width: videoFrame.displayWidth,
    height: videoFrame.displayHeight,
    needsClose: true, // VideoFrame은 close() 필요
  };

  decoder.close();

  return result;
}

/**
 * createImageBitmap으로 디코딩 (폴백)
 */
async function decodeWithCreateImageBitmap(jpegData: Uint8Array): Promise<DecodedFrame> {
  // slice()로 ArrayBuffer 기반 복사본 생성 (SharedArrayBuffer 호환성)
  const blob = new Blob([jpegData.slice()], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);

  return {
    image: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    needsClose: false, // ImageBitmap은 close() 선택적
  };
}

/**
 * 디코딩된 프레임 리소스 해제
 * VideoFrame은 반드시 close() 호출 필요 (GPU 메모리 누수 방지)
 */
export function closeDecodedFrame(frame: DecodedFrame): void {
  if (frame.needsClose && 'close' in frame.image) {
    (frame.image as VideoFrame).close();
  }
}
