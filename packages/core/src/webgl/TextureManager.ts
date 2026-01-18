/**
 * WebGL 텍스처 관리자
 * 이미지를 GPU 텍스처로 업로드하고 관리
 *
 * 두 가지 모드 지원:
 * 1. 단일 텍스처 (TEXTURE_2D): 기존 방식, 매 프레임 텍스처 업로드
 * 2. 배열 텍스처 (TEXTURE_2D_ARRAY): 모든 프레임을 레이어로 저장, uniform으로 프레임 전환
 */
export class TextureManager {
  private gl: WebGL2RenderingContext;

  // 단일 텍스처 (기존 방식)
  private texture: WebGLTexture | null = null;

  // 배열 텍스처 (Phase 2)
  private arrayTexture: WebGLTexture | null = null;
  private arrayWidth = 0;
  private arrayHeight = 0;
  private frameCount = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  // ===== 기존 단일 텍스처 API (하위 호환성 유지) =====

  /**
   * 이미지를 텍스처로 업로드 (기존 방식)
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
   * 단일 텍스처를 특정 유닛에 바인딩
   * @param unit - 텍스처 유닛 번호 (0~31)
   */
  bind(unit: number = 0): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
  }

  /**
   * 단일 텍스처가 생성되었는지 확인
   */
  hasTexture(): boolean {
    return this.texture !== null;
  }

  // ===== 새로운 배열 텍스처 API (Phase 2) =====

  /**
   * 배열 텍스처 초기화 (texStorage3D로 불변 할당)
   *
   * 학습 포인트:
   * - texStorage3D는 메모리를 불변(immutable)으로 할당
   * - 한번 할당되면 크기 변경 불가, 하지만 성능 최적화됨
   * - 드라이버가 메모리를 최적으로 배치할 수 있음
   *
   * @param width - 프레임 너비
   * @param height - 프레임 높이
   * @param count - 프레임 수 (레이어 수)
   */
  initializeArrayTexture(width: number, height: number, count: number): void {
    const gl = this.gl;

    // 기존 배열 텍스처가 있으면 삭제
    if (this.arrayTexture) {
      gl.deleteTexture(this.arrayTexture);
    }

    this.arrayTexture = gl.createTexture();
    this.arrayWidth = width;
    this.arrayHeight = height;
    this.frameCount = count;

    // TEXTURE_2D_ARRAY 타겟에 바인딩
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.arrayTexture);

    // texStorage3D: 불변 스토리지 할당
    // - level: 밉맵 레벨 수 (1 = 밉맵 없음)
    // - internalformat: 내부 포맷 (RGBA8 = 8비트 RGBA)
    // - width, height: 각 레이어의 크기
    // - depth: 레이어 수 (= 프레임 수)
    gl.texStorage3D(
      gl.TEXTURE_2D_ARRAY,
      1, // 밉맵 레벨 수 (1 = 기본 레벨만)
      gl.RGBA8, // 내부 포맷
      width,
      height,
      count, // 레이어 수
    );

    // 텍스처 파라미터 설정
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // 바인딩 해제
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  }

  /**
   * 특정 프레임(레이어)에 이미지 업로드
   *
   * 학습 포인트:
   * - texSubImage3D는 기존에 할당된 텍스처의 일부만 업데이트
   * - zoffset이 레이어 인덱스 역할
   * - 프레임 전환 시 텍스처 바인딩 변경 없이 uniform만 변경하면 됨
   *
   * @param frameIndex - 프레임 인덱스 (0부터 시작)
   * @param source - ImageBitmap 또는 VideoFrame
   */
  uploadFrame(frameIndex: number, source: ImageBitmap | VideoFrame): void {
    const gl = this.gl;

    if (!this.arrayTexture) {
      throw new Error('Array texture not initialized. Call initializeArrayTexture first.');
    }

    if (frameIndex < 0 || frameIndex >= this.frameCount) {
      throw new Error(`Frame index out of range: ${frameIndex} (max: ${this.frameCount - 1})`);
    }

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.arrayTexture);

    // texSubImage3D: 특정 레이어에 이미지 업로드
    // - zoffset: 레이어 인덱스 (0부터 시작)
    // - depth: 업로드할 레이어 수 (1 = 단일 프레임)
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0, // 밉맵 레벨
      0, // x 오프셋
      0, // y 오프셋
      frameIndex, // z 오프셋 (레이어 인덱스)
      this.arrayWidth, // 너비
      this.arrayHeight, // 높이
      1, // 깊이 (1 = 단일 레이어)
      gl.RGBA, // 소스 포맷
      gl.UNSIGNED_BYTE, // 데이터 타입
      source, // 이미지 소스
    );
  }

  /**
   * 모든 프레임을 배열 텍스처에 업로드
   *
   * @param frames - ImageBitmap 배열
   */
  uploadAllFrames(frames: ImageBitmap[]): void {
    if (frames.length === 0) {
      throw new Error('No frames to upload');
    }

    // 첫 프레임 크기로 배열 텍스처 초기화
    const firstFrame = frames[0];
    this.initializeArrayTexture(firstFrame.width, firstFrame.height, frames.length);

    // 각 프레임을 레이어에 업로드
    for (let i = 0; i < frames.length; i++) {
      this.uploadFrame(i, frames[i]);
    }
  }

  /**
   * 배열 텍스처를 특정 유닛에 바인딩
   * @param unit - 텍스처 유닛 번호 (0~31)
   */
  bindArrayTexture(unit: number = 0): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.arrayTexture);
  }

  /**
   * 배열 텍스처가 초기화되었는지 확인
   */
  hasArrayTexture(): boolean {
    return this.arrayTexture !== null;
  }

  /**
   * 배열 텍스처의 프레임 수 반환
   */
  getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * 배열 텍스처 크기 반환
   */
  getArrayTextureSize(): { width: number; height: number } {
    return { width: this.arrayWidth, height: this.arrayHeight };
  }

  /**
   * 리소스 해제
   */
  dispose(): void {
    const gl = this.gl;

    // 단일 텍스처 해제
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }

    // 배열 텍스처 해제
    if (this.arrayTexture) {
      gl.deleteTexture(this.arrayTexture);
      this.arrayTexture = null;
      this.arrayWidth = 0;
      this.arrayHeight = 0;
      this.frameCount = 0;
    }
  }
}
