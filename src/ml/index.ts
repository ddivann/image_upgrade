import { TaskContext } from "../worker/pipeline";

export interface MLParams {
  brightness: number; // -1..1
  contrast: number;   // 0.5..2
  saturation: number; // 0..2
}

// Attempts to run ONNX inference if runtime + model are available.
// Falls back to a lightweight heuristic based on image statistics.
export async function runMLInference(bitmap: ImageBitmap, ctx: TaskContext): Promise<MLParams> {
  ctx.updateProgress('analyzing', 30);

  // Prepare 224x224 preview preserving aspect ratio with padding
  const previewData = await createPreview224(bitmap, ctx);
  ctx.checkCancelled();

  // ONNX disabled by default so the app stays stable on Windows/dev
  // until a model is explicitly provided and enabled.
  const onnxEnabled = import.meta.env.VITE_ENABLE_ONNX === 'true';
  if (!onnxEnabled) {
    const params = heuristicParamsFromImageData(previewData);
    ctx.updateProgress('analyzing', 40);
    return params;
  }

  // Try dynamic import of onnxruntime-web
  try {
    const ort = await import('onnxruntime-web');
    if (ort && ort.InferenceSession) {
      // Optional: fallback WASM path configuration
      // ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
      try {
        const modelResp = await fetch('model.onnx');
        if (modelResp.ok) {
          const modelBuf = await modelResp.arrayBuffer();
          ctx.checkCancelled();
          const session = await ort.InferenceSession.create(modelBuf, { executionProviders: ['wasm'] });
          const floatData = tensorFromImageData(previewData);
          const inputName = session.inputNames && session.inputNames[0] ? session.inputNames[0] : 'input';
          const tensor = new ort.Tensor('float32', floatData, [1, 3, previewData.height, previewData.width]);
          const feeds: any = {};
          feeds[inputName] = tensor;
          const output = await session.run(feeds);
          ctx.checkCancelled();
          const outNames = Object.keys(output);
          const out = output[outNames[0]];
          const arr = out.data ? (out.data as unknown as Float32Array) : (out as unknown as Float32Array);
          const b = clamp(arr[0] as number, -1, 1);
          const c = clamp(arr[1] as number, 0.5, 2.0);
          const s = clamp(arr[2] as number, 0.0, 2.0);
          ctx.updateProgress('analyzing', 40);
          return { brightness: b, contrast: c, saturation: s };
        }
      } catch (e) {
        console.warn('ML: model fetch or session error -> fallback', e);
      }
    }
  } catch (e) {
    console.warn('ML: onnxruntime-web not available -> fallback', e);
  }

  // Heuristic fallback: statistics-based estimate
  const params = heuristicParamsFromImageData(previewData);
  ctx.updateProgress('analyzing', 40);
  return params;
}

async function createPreview224(bitmap: ImageBitmap, ctx: TaskContext): Promise<ImageData> {
  const size = 224;
  const canvas = new OffscreenCanvas(size, size);
  const ctx2 = canvas.getContext('2d')!;
  const w = bitmap.width;
  const h = bitmap.height;

  const scale = Math.min(size / w, size / h);
  const drawW = Math.round(w * scale);
  const drawH = Math.round(h * scale);
  const dx = Math.floor((size - drawW) / 2);
  const dy = Math.floor((size - drawH) / 2);

  ctx2.fillStyle = 'rgb(128,128,128)';
  ctx2.fillRect(0, 0, size, size);
  ctx2.drawImage(bitmap, dx, dy, drawW, drawH);
  ctx.checkCancelled();

  return ctx2.getImageData(0, 0, size, size);
}

function tensorFromImageData(img: ImageData) {
  // Convert to float32 tensor in NCHW, normalized to [0,1]
  const { data, width, height } = img;
  const floatData = new Float32Array(3 * width * height);
  let idx = 0;
  // R channel
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      floatData[idx++] = data[i] / 255;
    }
  }
  // G
  let channelOffset = width * height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      floatData[channelOffset++] = data[i + 1] / 255;
    }
  }
  // B
  channelOffset = width * height * 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      floatData[channelOffset++] = data[i + 2] / 255;
    }
  }

  return floatData;
}

function heuristicParamsFromImageData(img: ImageData): MLParams {
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

  // luminance standard deviation
  let sumSq = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sumSq += (lum - meanLum) ** 2;
  }
  const std = Math.sqrt(sumSq / n);

  const brightness = clamp((0.5 - meanLum), -1, 1);
  const contrast = clamp(1 + (0.25 - std) * 2.0, 0.5, 2.0);
  const saturation = clamp(1 + (0.5 - meanSat) * 1.5, 0.0, 2.0);

  return { brightness, contrast, saturation };
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}