import { VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE } from './shaders';

/**
 * 화면 전체를 덮는 사각형에 텍스처를 렌더링
 */
export class QuadRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private textureLocation: WebGLUniformLocation | null = null;

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

    // VBO 생성 및 데이터 업로드
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
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
   */
  render(textureUnit: number = 0): void {
    const gl = this.gl;

    // 쉐이더 프로그램 활성화
    gl.useProgram(this.program);

    // 텍스처 유닛 설정
    gl.uniform1i(this.textureLocation, textureUnit);

    // VAO 바인딩
    gl.bindVertexArray(this.vao);

    // 사각형 그리기 (TRIANGLE_STRIP: 4개 정점으로 2개 삼각형)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // VAO 바인딩 해제
    gl.bindVertexArray(null);
  }

  /**
   * 리소스 해제
   */
  dispose(): void {
    const gl = this.gl;

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
