import { fragmentShaderSource, vertexShaderSource } from './shaders';
import { MLParams } from '../ml';

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compile error: ' + error);
  }
  return shader;
}

export function createWebGLProgram(gl: WebGLRenderingContext) {
  const vShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

  const program = gl.createProgram();
  if (!program) throw new Error('Could not create WebGL program');
  gl.attachShader(program, vShader);
  gl.attachShader(program, fShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('Program link error: ' + error);
  }

  // Cleanup shaders as they are linked into the program
  gl.deleteShader(vShader);
  gl.deleteShader(fShader);

  return program;
}

// Global cached config for re-use
let cachedGl: WebGLRenderingContext | null = null;
let cachedProgram: WebGLProgram | null = null;

function getContext(width: number, height: number) {
  let canvas: OffscreenCanvas;
  if (!cachedGl) {
    canvas = new OffscreenCanvas(width, height);
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL not supported');
    cachedGl = gl as WebGLRenderingContext;
    cachedProgram = createWebGLProgram(cachedGl);
  } else {
    canvas = cachedGl.canvas as OffscreenCanvas;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      cachedGl.viewport(0, 0, width, height); // update viewport explicitly
    }
  }
  
  return { gl: cachedGl, program: cachedProgram! };
}

// Helper to destroy GL context entirely
export function cleanupWebGL() {
  if (cachedGl) {
    const loseContext = cachedGl.getExtension('WEBGL_lose_context');
    if (loseContext) loseContext.loseContext();
    if (cachedProgram) cachedGl.deleteProgram(cachedProgram);
    cachedGl = null;
    cachedProgram = null;
  }
}

export function applyColorCorrection(bitmap: ImageBitmap, params: MLParams): ImageBitmap {
  let { width, height } = bitmap;
  const { gl, program } = getContext(width, height);

  // MAX_TEXTURE_SIZE check for fallback/tiling
  const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  if (width > maxTexSize || height > maxTexSize) {
    const scale = Math.min(maxTexSize / width, maxTexSize / height);
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
    getContext(width, height);
    gl.canvas.width = width;
    gl.canvas.height = height;
    gl.viewport(0, 0, width, height);
    console.warn("[WebGL] Texture size exceeds MAX_TEXTURE_SIZE (" + maxTexSize + "). Downscaling to " + width + "x" + height);
  }

  gl.useProgram(program);

  // Geometry
  const pBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1, // bottom left
       1, -1, // bottom right
      -1,  1, // top left
      -1,  1, // top left
       1, -1, // bottom right
       1,  1, // top right
    ]),
    gl.STATIC_DRAW
  );
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  // TexCoords
  const tBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    /* 
      Texture coordinates
      In WebGL, 0.0 is the bottom and 1.0 is the top. 
      But when uploading ImageBitmap, sometimes data is flipped. 
      We'll map 0,1 to see if we get upside-down bugs, standard maps:
    */
    new Float32Array([
      0.0, 0.0,
      1.0, 0.0,
      0.0, 1.0,
      0.0, 1.0,
      1.0, 0.0,
      1.0, 1.0,
    ]),
    gl.STATIC_DRAW
  );
  const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
  gl.enableVertexAttribArray(texCoordLocation);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

  // Uniforms
  const bLoc = gl.getUniformLocation(program, 'u_brightness');
  const cLoc = gl.getUniformLocation(program, 'u_contrast');
  const sLoc = gl.getUniformLocation(program, 'u_saturation');

  gl.uniform1f(bLoc, params.brightness);
  gl.uniform1f(cLoc, params.contrast);
  gl.uniform1f(sLoc, params.saturation);

  // Upload Texture
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // These allow rendering of non-power-of-two (NPOT) textures
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Depending on how browsers deal with bitmap -> Y flipping
  // It's usually better NOT to flip IF canvas draws straight
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);

  // Draw
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // We can transfer from the underlying OffscreenCanvas 
  // without readPixels using transferToImageBitmap (fastest path).
  const result = (gl.canvas as OffscreenCanvas).transferToImageBitmap();

  // Clean buffers
  gl.deleteTexture(texture);
  gl.deleteBuffer(pBuffer);
  gl.deleteBuffer(tBuffer);

  return result;
}
