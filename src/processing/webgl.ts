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

async function applyColorCorrectionWebGL(bitmap: ImageBitmap, params: MLParams): Promise<ImageBitmap> {
  let width = bitmap.width;
  let height = bitmap.height;
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

  // Flip Y on upload so texture coordinates map correctly to canvas orientation.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);

  // Draw
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  const outWidth = (gl.canvas as OffscreenCanvas).width;
  const outHeight = (gl.canvas as OffscreenCanvas).height;
  const pixels = new Uint8Array(outWidth * outHeight * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  const canvas2d = new OffscreenCanvas(width, height);
  const ctx2d = canvas2d.getContext('2d');
  if (!ctx2d) throw new Error('2D canvas is not supported for WebGL readback');

  const imageData = ctx2d.createImageData(outWidth, outHeight);
  const dest = imageData.data;
  const rowBytes = outWidth * 4;

  for (let y = 0; y < outHeight; y++) {
    const srcOffset = y * rowBytes;
    const dstOffset = y * rowBytes;
    dest.set(pixels.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
  }

  ctx2d.putImageData(imageData, 0, 0);
  const result = canvas2d.transferToImageBitmap();

  // Clean buffers
  gl.deleteTexture(texture);
  gl.deleteBuffer(pBuffer);
  gl.deleteBuffer(tBuffer);

  return result;
}

function applyColorCorrection2D(bitmap: ImageBitmap, params: MLParams): ImageBitmap {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not supported');

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    r = params.contrast * (r - 0.5) + 0.5 + params.brightness;
    g = params.contrast * (g - 0.5) + 0.5 + params.brightness;
    b = params.contrast * (b - 0.5) + 0.5 + params.brightness;

    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = luminance + (r - luminance) * params.saturation;
    g = luminance + (g - luminance) * params.saturation;
    b = luminance + (b - luminance) * params.saturation;

    data[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.transferToImageBitmap();
}

export async function applyColorCorrection(bitmap: ImageBitmap, params: MLParams): Promise<ImageBitmap> {
  try {
    return await applyColorCorrectionWebGL(bitmap, params);
  } catch (error) {
    console.warn('WebGL failed, falling back to 2D processing', error);
    return applyColorCorrection2D(bitmap, params);
  }
}
