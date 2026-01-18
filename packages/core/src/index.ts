export const VERSION = '0.0.1';

// WebGL2를 사용한 기본 렌더러 생성 함수 => 그림판 셋팅(도구 준비)
export function createRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2'); // WebGL2 컨텍스트 획득

  if (!gl) {
    throw new Error('WebGL2 is not supported');
  } //if

  return {
    gl,
    clear(r: number, g: number, b: number) {
      gl.clearColor(r, g, b, 1.0); // 배경색 설정(RGB, 0~1 범위)
      gl.clear(gl.COLOR_BUFFER_BIT); // 색상 버퍼 클리어
    },
  };
}
