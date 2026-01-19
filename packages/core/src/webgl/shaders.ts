/**
 * Vertex Shader (정점 쉐이더)
 * - 사각형의 4개 꼭짓점 위치 설정
 * - 텍스처 좌표를 Fragment Shader로 전달
 * - Pan/Zoom 변환 적용
 *
 * 참고: 단일 텍스처와 배열 텍스처 모두 동일한 Vertex Shader 사용
 */
export const VERTEX_SHADER_SOURCE = `#version 300 es

// 입력: 정점 위치와 텍스처 좌표
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;

// Pan/Zoom uniforms
// u_pan: NDC 좌표 (-1 ~ 1 범위, 픽셀 → NDC 변환 필요)
// u_zoom: 확대 배율 (기본값 1.0)
uniform vec2 u_pan;
uniform float u_zoom;

// 출력: Fragment Shader로 전달할 텍스처 좌표
out vec2 v_texCoord;

void main() {
  // Zoom 적용 (중앙 기준 스케일)
  vec2 scaledPos = a_position * u_zoom;

  // Pan 적용 (NDC 좌표)
  vec2 finalPos = scaledPos + u_pan;

  // 정점 위치 설정 (NDC: -1 ~ 1)
  gl_Position = vec4(finalPos, 0.0, 1.0);

  // 텍스처 좌표 전달
  v_texCoord = a_texCoord;
}
`;

/**
 * Fragment Shader (프래그먼트 쉐이더) - 단일 텍스처용
 * - 각 픽셀의 색상 결정
 * - 텍스처에서 색상 샘플링
 * - Window/Level 변환 적용 (GPU 기반)
 *
 * 참고: bool uniform 대신 float 사용 (크로스 플랫폼 호환성)
 * https://bugs.chromium.org/p/chromium/issues/detail?id=133523
 */
export const FRAGMENT_SHADER_SOURCE = `#version 300 es

precision highp float;

// 입력: Vertex Shader에서 전달받은 텍스처 좌표
in vec2 v_texCoord;

// 출력: 픽셀 색상
out vec4 fragColor;

// 텍스처 샘플러
uniform sampler2D u_texture;

// Window/Level uniforms (0.0 ~ 1.0 범위로 정규화된 값)
uniform float u_windowCenter;  // 기본값: 0.5
uniform float u_windowWidth;   // 기본값: 1.0
uniform float u_applyWL;       // W/L 적용 여부 (0.0 = false, 1.0 = true)

void main() {
  // 텍스처에서 색상 샘플링
  vec4 texColor = texture(u_texture, v_texCoord);

  // Luminance 계산 (ITU-R BT.601)
  float luminance = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));

  // Window/Level 변환 (width가 0이면 나누기 오류 방지)
  float safeWidth = max(u_windowWidth, 0.001);
  float lower = u_windowCenter - safeWidth / 2.0;
  float wlOutput = clamp((luminance - lower) / safeWidth, 0.0, 1.0);

  // mix로 분기 제거: u_applyWL이 0이면 원본, 1이면 W/L 적용
  // 원본 색상과 W/L 적용 결과를 블렌딩
  vec3 wlColor = vec3(wlOutput);
  vec3 finalColor = mix(texColor.rgb, wlColor, u_applyWL);

  fragColor = vec4(finalColor, texColor.a);
}
`;

/**
 * Fragment Shader (프래그먼트 쉐이더) - 배열 텍스처용 (Phase 2)
 *
 * 학습 포인트:
 * - sampler2DArray: 2D 배열 텍스처용 샘플러 타입
 * - texture(sampler, vec3(u, v, layer)): 3D 좌표로 특정 레이어 샘플링
 * - u_currentFrame: int uniform으로 현재 프레임 인덱스 지정
 *
 * 장점 (vs TEXTURE_2D):
 * - 프레임 전환 시 텍스처 바인딩 변경 불필요 (uniform만 변경)
 * - GPU 상태 변경이 적어 드라이버 오버헤드 감소
 * - 모든 프레임이 하나의 텍스처 객체에 저장되어 관리 용이
 *
 * 주의:
 * - int uniform을 float으로 변환하여 texture() 함수에 전달
 * - GLSL ES 3.0에서 texture()는 자동으로 레이어 인덱스를 반올림
 */
export const FRAGMENT_SHADER_ARRAY_SOURCE = `#version 300 es

precision highp float;
precision highp sampler2DArray;

// 입력: Vertex Shader에서 전달받은 텍스처 좌표
in vec2 v_texCoord;

// 출력: 픽셀 색상
out vec4 fragColor;

// 배열 텍스처 샘플러 (sampler2D → sampler2DArray)
uniform sampler2DArray u_frameSequence;

// 현재 프레임 인덱스 (0부터 시작)
uniform int u_currentFrame;

// Window/Level uniforms (0.0 ~ 1.0 범위로 정규화된 값)
uniform float u_windowCenter;  // 기본값: 0.5
uniform float u_windowWidth;   // 기본값: 1.0
uniform float u_applyWL;       // W/L 적용 여부 (0.0 = false, 1.0 = true)

void main() {
  // 배열 텍스처에서 색상 샘플링
  // vec3(u, v, layer): u, v는 텍스처 좌표, layer는 프레임 인덱스
  vec4 texColor = texture(u_frameSequence, vec3(v_texCoord, float(u_currentFrame)));

  // Luminance 계산 (ITU-R BT.601)
  float luminance = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));

  // Window/Level 변환
  float safeWidth = max(u_windowWidth, 0.001);
  float lower = u_windowCenter - safeWidth / 2.0;
  float wlOutput = clamp((luminance - lower) / safeWidth, 0.0, 1.0);

  // mix로 분기 제거
  vec3 wlColor = vec3(wlOutput);
  vec3 finalColor = mix(texColor.rgb, wlColor, u_applyWL);

  fragColor = vec4(finalColor, texColor.a);
}
`;
