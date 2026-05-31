import { TaskContext } from "../worker/pipeline";

// Простая проверка сигнатуры HEIC (magic bytes)
function isHeic(buffer: ArrayBuffer): boolean {
  const arr = new Uint8Array(buffer);
  if (arr.length < 12) return false;
  // ftypheic, ftypheix, ftypmif1, ftypmsf1
  const magic = String.fromCharCode(...arr.slice(4, 12));
  return magic.includes('heic') || magic.includes('heix') || magic.includes('mif1') || magic.includes('msf1');
}

export async function decodeImage(payload: any, ctx: TaskContext): Promise<ImageBitmap> {
  // Уже готовый ImageBitmap (быстрый путь для нативных форматов, если передан)
  if (payload instanceof ImageBitmap) {
    return payload;
  }

  const buffer = payload.buffer instanceof ArrayBuffer ? payload.buffer : payload;
  const mimeType = payload.type || '';

  // Если это ArrayBuffer, проверяем, не HEIC ли это
  let blob = new Blob([buffer], { type: mimeType });
  
  if (isHeic(buffer)) {
    ctx.updateProgress('decoding', 10); // Уведомляем, что пошло WASM HEIC конвертирование
    
    // Polyfill window required by heic2any
    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = globalThis;
    }
    const heic2any = (await import('heic2any')).default;

    // heic2any вернет Blob(jpeg/png/gif)
    const result = await heic2any({
      blob,
      toType: "image/jpeg",
      quality: 0.9
    });
    
    ctx.checkCancelled();
    
    // Если вернулся массив Blob, берем первый
    blob = Array.isArray(result) ? result[0] : result;
  }
  
  ctx.updateProgress('decoding', 15);
  // Нативное декодирование остального (JPG, PNG, BMP, либо JPEG после HEIC)
  const bitmap = await createImageBitmap(blob);
  return bitmap;
}