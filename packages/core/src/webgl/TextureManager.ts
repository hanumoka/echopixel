/**
 * WebGL 텍스처 관리자
 * 이미지를 GPU 텍스처로 업로드하고 관리
 */
export class TextureManager {
  private gl: WebGL2RenderingContext;
  private texture: WebGLTexture | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /**
   * 이미지를 텍스처로 업로드
   * @param source - ImageBitmap 또는 VideoFrame
   */
  upload(source: ImageBitmap | VideoFrame): void {
    const gl = this.gl;

    // 텍스처가 없으면 생성
    if (!this.texture) {
      this.texture = gl.createTexture();
    }

    // 텍스처 바인딩
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    // 이미지 데이터 업로드
    gl.texImage2D(
      gl.TEXTURE_2D,
      0, // 밉맵 레벨
      gl.RGBA, // 내부 포맷
      gl.RGBA, // 소스 포맷
      gl.UNSIGNED_BYTE, // 데이터 타입
      source, // 이미지 소스
    );

    // 텍스처 파라미터 설정
    // CLAMP_TO_EDGE: 텍스처 좌표가 0~1을 벗어나면 가장자리 색상 사용
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // LINEAR: 부드러운 보간 (의료영상에 적합)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  /**
   * 텍스처를 특정 유닛에 바인딩
   * @param unit - 텍스처 유닛 번호 (0~31)
   */
  bind(unit: number = 0): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
  }

  /**
   * 텍스처가 생성되었는지 확인
   */
  hasTexture(): boolean {
    return this.texture !== null;
  }

  /**
   * 리소스 해제
   */
  dispose(): void {
    if (this.texture) {
      this.gl.deleteTexture(this.texture);
      this.texture = null;
    }
  }
}
