import {
  VERTEX_SHADER_SOURCE,
  FRAGMENT_SHADER_SOURCE,
  FRAGMENT_SHADER_ARRAY_SOURCE,
} from './shaders';

/**
 * Window/Level 렌더링 옵션
 */
export interface WindowLevelOptions {
  /** Window Center (0.0 ~ 1.0 정규화 값) */
  windowCenter: number;
  /** Window Width (0.0 ~ 1.0 정규화 값) */
  windowWidth: number;
}

/**
 * Transform 렌더링 옵션 (Pan/Zoom/Rotation)
 *
 * Pan은 NDC 좌표 (-1 ~ 1 범위)로 전달해야 함
 * 픽셀 → NDC 변환: panNDC = panPixel * (2 / viewportSize)
 */
export interface TransformOptions {
  /** Pan X (NDC 좌표, -1 ~ 1) */
  panX: number;
  /** Pan Y (NDC 좌표, -1 ~ 1) */
  panY: number;
  /** Zoom 배율 (기본값 1.0) */
  zoom: number;
  /** Rotation 각도 (라디안, 기본값 0.0) */
  rotation?: number;
}

/**
 * 화면 전체를 덮는 사각형에 텍스처를 렌더링
 */
export class QuadRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private textureLocation: WebGLUniformLocation | null = null;
  private windowCenterLocation: WebGLUniformLocation | null = null;
  private windowWidthLocation: WebGLUniformLocation | null = null;
  private applyWLLocation: WebGLUniformLocation | null = null;
  // Pan/Zoom/Rotation uniform locations
  private panLocation: WebGLUniformLocation | null = null;
  private zoomLocation: WebGLUniformLocation | null = null;
  private rotationLocation: WebGLUniformLocation | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.initShaders();
    this.initBuffers();
  }

  /**
   * 쉐이더 컴파일 및 프로그램 링크
   */
  private initShaders(): void {
    const gl = this.gl;

    // Vertex Shader 컴파일
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertexShader, VERTEX_SHADER_SOURCE);
    gl.compileShader(vertexShader);

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(vertexShader);
      gl.deleteShader(vertexShader);
      throw new Error(`Vertex shader compilation failed: ${error}`);
    }

    // Fragment Shader 컴파일
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fragmentShader, FRAGMENT_SHADER_SOURCE);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(fragmentShader);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw new Error(`Fragment shader compilation failed: ${error}`);
    }

    // 프로그램 링크
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(this.program);
      throw new Error(`Shader program linking failed: ${error}`);
    }

    // 쉐이더 객체 삭제 (프로그램에 링크되어 있으므로 안전)
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    // uniform 위치 가져오기
    this.textureLocation = gl.getUniformLocation(this.program, 'u_texture');
    this.windowCenterLocation = gl.getUniformLocation(this.program, 'u_windowCenter');
    this.windowWidthLocation = gl.getUniformLocation(this.program, 'u_windowWidth');
    this.applyWLLocation = gl.getUniformLocation(this.program, 'u_applyWL');
    // Pan/Zoom/Rotation uniform locations
    this.panLocation = gl.getUniformLocation(this.program, 'u_pan');
    this.zoomLocation = gl.getUniformLocation(this.program, 'u_zoom');
    this.rotationLocation = gl.getUniformLocation(this.program, 'u_rotation');
  }

  /**
   * 사각형 정점 버퍼 초기화
   */
  private initBuffers(): void {
    const gl = this.gl;

    // VAO 생성 (정점 배열 객체)
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // 정점 데이터: [x, y, u, v] × 4개 정점
    // 화면 전체를 덮는 사각형 (2개의 삼각형)
    const vertices = new Float32Array([
      // 위치 (x, y)   텍스처 좌표 (u, v)
      -1, -1, 0, 0, // 좌하단
      1, -1, 1, 0, // 우하단
      -1, 1, 0, 1, // 좌상단
      1, 1, 1, 1, // 우상단
    ]);

    // VBO 생성 및 데이터 업로드 (클래스 멤버에 저장하여 dispose에서 해제)
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // 정점 속성 설정
    const stride = 4 * Float32Array.BYTES_PER_ELEMENT; // 16 bytes per vertex

    // location 0: position (vec2)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);

    // location 1: texCoord (vec2)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(
      1,
      2,
      gl.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT,
    );

    // VAO 바인딩 해제
    gl.bindVertexArray(null);
  }

  /**
   * 텍스처를 화면에 렌더링
   * @param textureUnit - 텍스처가 바인딩된 유닛 번호
   * @param windowLevel - Window/Level 옵션 (선택적)
   * @param transform - Pan/Zoom 옵션 (선택적)
   */
  render(textureUnit: number = 0, windowLevel?: WindowLevelOptions, transform?: TransformOptions): void {
    const gl = this.gl;

    // 쉐이더 프로그램 활성화
    gl.useProgram(this.program);

    // 텍스처 유닛 설정
    gl.uniform1i(this.textureLocation, textureUnit);

    // Window/Level uniform 설정
    // 참고: bool 대신 float 사용 (크로스 플랫폼 호환성)
    if (windowLevel) {
      gl.uniform1f(this.windowCenterLocation, windowLevel.windowCenter);
      gl.uniform1f(this.windowWidthLocation, windowLevel.windowWidth);
      gl.uniform1f(this.applyWLLocation, 1.0); // true
    } else {
      gl.uniform1f(this.windowCenterLocation, 0.5);
      gl.uniform1f(this.windowWidthLocation, 1.0);
      gl.uniform1f(this.applyWLLocation, 0.0); // false
    }

    // Pan/Zoom/Rotation uniform 설정
    if (transform) {
      gl.uniform2f(this.panLocation, transform.panX, transform.panY);
      gl.uniform1f(this.zoomLocation, transform.zoom);
      gl.uniform1f(this.rotationLocation, transform.rotation ?? 0.0);
    } else {
      gl.uniform2f(this.panLocation, 0.0, 0.0);
      gl.uniform1f(this.zoomLocation, 1.0);
      gl.uniform1f(this.rotationLocation, 0.0);
    }

    // VAO 바인딩
    gl.bindVertexArray(this.vao);

    // 사각형 그리기 (TRIANGLE_STRIP: 4개 정점으로 2개 삼각형)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // VAO 바인딩 해제
    gl.bindVertexArray(null);
  }

  /**
   * WebGL 리소스가 유효한지 확인
   */
  isValid(): boolean {
    return this.program !== null && this.vao !== null;
  }

  /**
   * 리소스 해제
   */
  dispose(): void {
    const gl = this.gl;

    if (this.vbo) {
      gl.deleteBuffer(this.vbo);
      this.vbo = null;
    }

    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }

    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }
  }
}

/**
 * 배열 텍스처용 렌더러 (Phase 2)
 *
 * 학습 포인트:
 * - 프레임 전환 시 텍스처 바인딩 변경 없이 uniform만 변경
 * - u_currentFrame uniform으로 표시할 프레임 선택
 * - 성능: 텍스처 바인딩은 비용이 높은 작업 (드라이버 상태 변경)
 *
 * 사용 흐름:
 * 1. TextureManager.uploadAllFrames()로 모든 프레임 GPU에 업로드
 * 2. TextureManager.bindArrayTexture()로 텍스처 바인딩 (한 번만)
 * 3. ArrayTextureRenderer.renderFrame()으로 프레임별 렌더링 (uniform만 변경)
 */
export class ArrayTextureRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;

  // Uniform locations
  private frameSequenceLocation: WebGLUniformLocation | null = null;
  private currentFrameLocation: WebGLUniformLocation | null = null;
  private windowCenterLocation: WebGLUniformLocation | null = null;
  private windowWidthLocation: WebGLUniformLocation | null = null;
  private applyWLLocation: WebGLUniformLocation | null = null;
  // Pan/Zoom/Rotation uniform locations
  private panLocation: WebGLUniformLocation | null = null;
  private zoomLocation: WebGLUniformLocation | null = null;
  private rotationLocation: WebGLUniformLocation | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.initShaders();
    this.initBuffers();
  }

  /**
   * 셰이더 컴파일 및 프로그램 링크
   */
  private initShaders(): void {
    const gl = this.gl;

    // Vertex Shader 컴파일
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertexShader, VERTEX_SHADER_SOURCE);
    gl.compileShader(vertexShader);

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(vertexShader);
      gl.deleteShader(vertexShader);
      throw new Error(`Vertex shader compilation failed: ${error}`);
    }

    // Fragment Shader 컴파일 (배열 텍스처용)
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fragmentShader, FRAGMENT_SHADER_ARRAY_SOURCE);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(fragmentShader);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw new Error(`Fragment shader (array) compilation failed: ${error}`);
    }

    // 프로그램 링크
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(this.program);
      throw new Error(`Shader program linking failed: ${error}`);
    }

    // 셰이더 객체 삭제
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    // Uniform locations 가져오기
    this.frameSequenceLocation = gl.getUniformLocation(this.program, 'u_frameSequence');
    this.currentFrameLocation = gl.getUniformLocation(this.program, 'u_currentFrame');
    this.windowCenterLocation = gl.getUniformLocation(this.program, 'u_windowCenter');
    this.windowWidthLocation = gl.getUniformLocation(this.program, 'u_windowWidth');
    this.applyWLLocation = gl.getUniformLocation(this.program, 'u_applyWL');
    // Pan/Zoom/Rotation uniform locations
    this.panLocation = gl.getUniformLocation(this.program, 'u_pan');
    this.zoomLocation = gl.getUniformLocation(this.program, 'u_zoom');
    this.rotationLocation = gl.getUniformLocation(this.program, 'u_rotation');
  }

  /**
   * 사각형 정점 버퍼 초기화
   */
  private initBuffers(): void {
    const gl = this.gl;

    // VAO 생성
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // 정점 데이터: [x, y, u, v] × 4개 정점
    const vertices = new Float32Array([
      // 위치 (x, y)   텍스처 좌표 (u, v)
      -1, -1, 0, 0, // 좌하단
      1, -1, 1, 0, // 우하단
      -1, 1, 0, 1, // 좌상단
      1, 1, 1, 1, // 우상단
    ]);

    // VBO 생성 및 데이터 업로드 (클래스 멤버에 저장하여 dispose에서 해제)
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // 정점 속성 설정
    const stride = 4 * Float32Array.BYTES_PER_ELEMENT;

    // location 0: position (vec2)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);

    // location 1: texCoord (vec2)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(
      1,
      2,
      gl.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT,
    );

    // VAO 바인딩 해제
    gl.bindVertexArray(null);
  }

  /**
   * 배열 텍스처의 특정 프레임을 렌더링
   *
   * @param textureUnit - 배열 텍스처가 바인딩된 유닛 번호
   * @param frameIndex - 표시할 프레임 인덱스 (0부터 시작)
   * @param windowLevel - Window/Level 옵션 (선택적)
   * @param transform - Pan/Zoom 옵션 (선택적)
   */
  renderFrame(
    textureUnit: number = 0,
    frameIndex: number = 0,
    windowLevel?: WindowLevelOptions,
    transform?: TransformOptions,
  ): void {
    const gl = this.gl;

    // 셰이더 프로그램 활성화
    gl.useProgram(this.program);

    // 텍스처 유닛 설정
    gl.uniform1i(this.frameSequenceLocation, textureUnit);

    // 현재 프레임 인덱스 설정
    gl.uniform1i(this.currentFrameLocation, frameIndex);

    // Window/Level uniform 설정
    if (windowLevel) {
      gl.uniform1f(this.windowCenterLocation, windowLevel.windowCenter);
      gl.uniform1f(this.windowWidthLocation, windowLevel.windowWidth);
      gl.uniform1f(this.applyWLLocation, 1.0);
    } else {
      gl.uniform1f(this.windowCenterLocation, 0.5);
      gl.uniform1f(this.windowWidthLocation, 1.0);
      gl.uniform1f(this.applyWLLocation, 0.0);
    }

    // Pan/Zoom/Rotation uniform 설정
    if (transform) {
      gl.uniform2f(this.panLocation, transform.panX, transform.panY);
      gl.uniform1f(this.zoomLocation, transform.zoom);
      gl.uniform1f(this.rotationLocation, transform.rotation ?? 0.0);
    } else {
      gl.uniform2f(this.panLocation, 0.0, 0.0);
      gl.uniform1f(this.zoomLocation, 1.0);
      gl.uniform1f(this.rotationLocation, 0.0);
    }

    // VAO 바인딩
    gl.bindVertexArray(this.vao);

    // 사각형 그리기
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // VAO 바인딩 해제
    gl.bindVertexArray(null);
  }

  /**
   * WebGL 리소스가 유효한지 확인
   */
  isValid(): boolean {
    return this.program !== null && this.vao !== null;
  }

  /**
   * 리소스 해제
   */
  dispose(): void {
    const gl = this.gl;

    if (this.vbo) {
      gl.deleteBuffer(this.vbo);
      this.vbo = null;
    }

    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }

    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }
  }
}
