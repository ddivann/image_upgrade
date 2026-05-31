export const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  void main() {
    // a_position is -1 to 1, maps to clip space
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord; // pass through
  }
`;

export const fragmentShaderSource = `
  precision mediump float;
  // our texture
  uniform sampler2D u_tex;
  
  // Correction parameters
  uniform float u_brightness; // -1.0 .. 1.0
  uniform float u_contrast;   // 0.5 .. 2.0
  uniform float u_saturation; // 0.0 .. 2.0

  // passed from vertex
  varying vec2 v_texCoord;

  void main() {
    vec4 color = texture2D(u_tex, v_texCoord);
    
    // 1. Contrast (scales around 0.5)
    vec3 rgb = u_contrast * (color.rgb - 0.5) + 0.5;
    
    // 2. Brightness (additive)
    rgb = rgb + u_brightness;
    
    // 3. Saturation (blend with luminance)
    float luminance = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    rgb = mix(vec3(luminance), rgb, u_saturation);
    
    gl_FragColor = vec4(rgb, color.a);
  }
`;
