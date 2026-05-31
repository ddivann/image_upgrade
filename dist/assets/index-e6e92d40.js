var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
function isHeic(buffer) {
  const arr = new Uint8Array(buffer);
  if (arr.length < 12)
    return false;
  const magic = String.fromCharCode(...arr.slice(4, 12));
  return magic.includes("heic") || magic.includes("heix") || magic.includes("mif1") || magic.includes("msf1");
}
async function decodeImage(payload, ctx) {
  if (payload instanceof ImageBitmap) {
    return payload;
  }
  const buffer = payload.buffer instanceof ArrayBuffer ? payload.buffer : payload;
  const mimeType = payload.type || "";
  let blob = new Blob([buffer], { type: mimeType });
  if (isHeic(buffer)) {
    ctx.updateProgress("decoding", 10);
    if (typeof globalThis.window === "undefined") {
      globalThis.window = globalThis;
    }
    const heic2any = (await import("./heic2any-bb1f4f80.js").then(function(n) {
      return n.h;
    })).default;
    const result = await heic2any({
      blob,
      toType: "image/jpeg",
      quality: 0.9
    });
    ctx.checkCancelled();
    blob = Array.isArray(result) ? result[0] : result;
  }
  ctx.updateProgress("decoding", 15);
  const bitmap = await createImageBitmap(blob);
  return bitmap;
}
async function runMLInference(bitmap, ctx) {
  ctx.updateProgress("analyzing", 30);
  const previewData = await createPreview224(bitmap, ctx);
  ctx.checkCancelled();
  try {
    const importFn = new Function("m", "return import(m)");
    const ort = await importFn("onnxruntime-web").catch(() => null);
    if (ort && ort.InferenceSession) {
      try {
        const modelResp = await fetch("model.onnx");
        if (modelResp.ok) {
          const modelBuf = await modelResp.arrayBuffer();
          ctx.checkCancelled();
          const session = await ort.InferenceSession.create(modelBuf);
          const floatData = tensorFromImageData(previewData);
          const inputName = session.inputNames && session.inputNames[0] ? session.inputNames[0] : "input";
          const tensor = new ort.Tensor("float32", floatData, [1, 3, previewData.height, previewData.width]);
          const feeds = {};
          feeds[inputName] = tensor;
          const output = await session.run(feeds);
          ctx.checkCancelled();
          const outNames = Object.keys(output);
          const out = output[outNames[0]];
          const arr = out.data ? out.data : out;
          const b = clamp(arr[0], -1, 1);
          const c = clamp(arr[1], 0.5, 2);
          const s = clamp(arr[2], 0, 2);
          ctx.updateProgress("analyzing", 40);
          return { brightness: b, contrast: c, saturation: s };
        }
      } catch (e) {
      }
    }
  } catch (e) {
  }
  const params = heuristicParamsFromImageData(previewData);
  ctx.updateProgress("analyzing", 40);
  return params;
}
async function createPreview224(bitmap, ctx) {
  const size = 224;
  const canvas = new OffscreenCanvas(size, size);
  const ctx2 = canvas.getContext("2d");
  const w = bitmap.width;
  const h = bitmap.height;
  const scale = Math.min(size / w, size / h);
  const drawW = Math.round(w * scale);
  const drawH = Math.round(h * scale);
  const dx = Math.floor((size - drawW) / 2);
  const dy = Math.floor((size - drawH) / 2);
  ctx2.fillStyle = "rgb(128,128,128)";
  ctx2.fillRect(0, 0, size, size);
  ctx2.drawImage(bitmap, dx, dy, drawW, drawH);
  ctx.checkCancelled();
  return ctx2.getImageData(0, 0, size, size);
}
function tensorFromImageData(img) {
  const { data, width, height } = img;
  const floatData = new Float32Array(3 * width * height);
  let idx = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      floatData[idx++] = data[i] / 255;
    }
  }
  let channelOffset = width * height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      floatData[channelOffset++] = data[i + 1] / 255;
    }
  }
  channelOffset = width * height * 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      floatData[channelOffset++] = data[i + 2] / 255;
    }
  }
  return floatData;
}
function heuristicParamsFromImageData(img) {
  const { data, width, height } = img;
  let sumLum = 0;
  const n = width * height;
  let satSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sumLum += lum;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    satSum += sat;
  }
  const meanLum = sumLum / n;
  const meanSat = satSum / n;
  let sumSq = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sumSq += (lum - meanLum) ** 2;
  }
  const std = Math.sqrt(sumSq / n);
  const brightness = clamp(0.5 - meanLum, -1, 1);
  const contrast = clamp(1 + (0.25 - std) * 2, 0.5, 2);
  const saturation = clamp(1 + (0.5 - meanSat) * 1.5, 0, 2);
  return { brightness, contrast, saturation };
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  void main() {
    // a_position is -1 to 1, maps to clip space
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord; // pass through
  }
`;
const fragmentShaderSource = `
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
function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader)
    throw new Error("Could not create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("Shader compile error: " + error);
  }
  return shader;
}
function createWebGLProgram(gl) {
  const vShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();
  if (!program)
    throw new Error("Could not create WebGL program");
  gl.attachShader(program, vShader);
  gl.attachShader(program, fShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error("Program link error: " + error);
  }
  gl.deleteShader(vShader);
  gl.deleteShader(fShader);
  return program;
}
let cachedGl = null;
let cachedProgram = null;
function getContext(width, height) {
  let canvas;
  if (!cachedGl) {
    canvas = new OffscreenCanvas(width, height);
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: false });
    if (!gl)
      throw new Error("WebGL not supported");
    cachedGl = gl;
    cachedProgram = createWebGLProgram(cachedGl);
  } else {
    canvas = cachedGl.canvas;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      cachedGl.viewport(0, 0, width, height);
    }
  }
  return { gl: cachedGl, program: cachedProgram };
}
function cleanupWebGL() {
  if (cachedGl) {
    const loseContext = cachedGl.getExtension("WEBGL_lose_context");
    if (loseContext)
      loseContext.loseContext();
    if (cachedProgram)
      cachedGl.deleteProgram(cachedProgram);
    cachedGl = null;
    cachedProgram = null;
  }
}
function applyColorCorrection(bitmap, params) {
  let { width, height } = bitmap;
  const { gl, program } = getContext(width, height);
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
  const pBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1,
      -1,
      // bottom left
      1,
      -1,
      // bottom right
      -1,
      1,
      // top left
      -1,
      1,
      // top left
      1,
      -1,
      // bottom right
      1,
      1
      // top right
    ]),
    gl.STATIC_DRAW
  );
  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
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
      0,
      0,
      1,
      0,
      0,
      1,
      0,
      1,
      1,
      0,
      1,
      1
    ]),
    gl.STATIC_DRAW
  );
  const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
  gl.enableVertexAttribArray(texCoordLocation);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
  const bLoc = gl.getUniformLocation(program, "u_brightness");
  const cLoc = gl.getUniformLocation(program, "u_contrast");
  const sLoc = gl.getUniformLocation(program, "u_saturation");
  gl.uniform1f(bLoc, params.brightness);
  gl.uniform1f(cLoc, params.contrast);
  gl.uniform1f(sLoc, params.saturation);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  const result = gl.canvas.transferToImageBitmap();
  gl.deleteTexture(texture);
  gl.deleteBuffer(pBuffer);
  gl.deleteBuffer(tBuffer);
  return result;
}
async function processWebGL(bitmap, params, ctx) {
  ctx.updateProgress("processing", 50);
  ctx.checkCancelled();
  const processedBitmap = applyColorCorrection(bitmap, params);
  ctx.updateProgress("processing", 90);
  return processedBitmap;
}
async function encodeResult(bitmap, ctx) {
  await new Promise((r) => setTimeout(r, 300));
  const canvas = new OffscreenCanvas(Math.min(bitmap.width, 800), Math.min(bitmap.height, 600));
  const canvasCtx = canvas.getContext("2d");
  canvasCtx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  canvasCtx.fillStyle = "rgba(0, 0, 0, 0.5)";
  canvasCtx.fillRect(0, 0, canvas.width, 50);
  canvasCtx.fillStyle = "#00ff00";
  canvasCtx.font = "20px sans-serif";
  canvasCtx.fillText("Pipeline Completed", 10, 30);
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
}
class ProcessingPipeline {
  constructor() {
    __publicField(this, "activeTasks", /* @__PURE__ */ new Map());
  }
  startTask(taskId, payload) {
    const context = {
      taskId,
      aborted: false,
      updateProgress: (status, progress) => {
        if (!context.aborted) {
          self.postMessage({ type: "progress", taskId, status, progress });
        }
      },
      checkCancelled: () => {
        if (context.aborted) {
          throw new Error("Cancelled");
        }
      }
    };
    this.activeTasks.set(taskId, context);
    this.runPipeline(context, payload).catch((err) => {
      if (err.message !== "Cancelled") {
        self.postMessage({ type: "error", taskId, status: "error", progress: 0, error: err.message });
      }
      this.activeTasks.delete(taskId);
    });
  }
  cancelTask(taskId) {
    const context = this.activeTasks.get(taskId);
    if (context) {
      context.aborted = true;
      this.activeTasks.delete(taskId);
      console.log(`[Worker] Task ${taskId} explicitly cancelled.`);
      cleanupWebGL();
    }
  }
  async runPipeline(ctx, payload) {
    let internalBitmap;
    let webGLResult;
    try {
      ctx.updateProgress("decoding", 5);
      internalBitmap = await decodeImage(payload, ctx);
      ctx.checkCancelled();
      ctx.updateProgress("decoding", 20);
      ctx.updateProgress("analyzing", 25);
      const params = await runMLInference(internalBitmap, ctx);
      ctx.checkCancelled();
      ctx.updateProgress("analyzing", 40);
      ctx.updateProgress("processing", 45);
      webGLResult = await processWebGL(internalBitmap, params, ctx);
      ctx.checkCancelled();
      ctx.updateProgress("processing", 90);
      ctx.updateProgress("encoding", 95);
      const blob = await encodeResult(webGLResult, ctx);
      ctx.checkCancelled();
      if (!ctx.aborted) {
        self.postMessage({ type: "done", taskId: ctx.taskId, status: "done", progress: 100, blob });
        this.activeTasks.delete(ctx.taskId);
      }
    } finally {
      if (internalBitmap)
        internalBitmap.close();
      if (webGLResult)
        webGLResult.close();
    }
  }
}
const pipeline = new ProcessingPipeline();
self.onmessage = async (e) => {
  const { type, taskId, payload } = e.data;
  if (type === "start") {
    pipeline.startTask(taskId, payload);
  } else if (type === "cancel") {
    pipeline.cancelTask(taskId);
  }
};
