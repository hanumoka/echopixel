/**
 * Vertex Shader (정점 쉐이더)
 * - 사각형의 4개 꼭짓점 위치 설정
 * - 텍스처 좌표를 Fragment Shader로 전달
 */
export const VERTEX_SHADER_SOURCE = `#version 300 es

// 입력: 정점 위치와 텍스처 좌표
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;

// 출력: Fragment Shader로 전달할 텍스처 좌표
out vec2 v_texCoord;

void main() {
  // 정점 위치 설정 (NDC: -1 ~ 1)
  gl_Position = vec4(a_position, 0.0, 1.0);

  // 텍스처 좌표 전달
  v_texCoord = a_texCoord;
}
`;

/**
 * Fragment Shader (프래그먼트 쉐이더)
 * - 각 픽셀의 색상 결정
 * - 텍스처에서 색상 샘플링
 */
export const FRAGMENT_SHADER_SOURCE = `#version 300 es

precision highp float;

// 입력: Vertex Shader에서 전달받은 텍스처 좌표
in vec2 v_texCoord;

// 출력: 픽셀 색상
out vec4 fragColor;

// 텍스처 샘플러
uniform sampler2D u_texture;

void main() {
  // 텍스처에서 색상 샘플링
  fragColor = texture(u_texture, v_texCoord);
}
`;
