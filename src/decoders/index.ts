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
  const orientation = getExifOrientation(buffer, mimeType);
  if (orientation && orientation !== 1) {
    const oriented = applyExifOrientation(bitmap, orientation);
    bitmap.close();
    return oriented;
  }

  return bitmap;
}

function getExifOrientation(buffer: ArrayBuffer, mimeType: string): number | null {
  if (!mimeType.includes('jpeg') && !mimeType.includes('jpg')) return null;
  const view = new DataView(buffer);
  if (view.getUint16(0) !== 0xffd8) return null;

  let offset = 2;
  const length = view.byteLength;
  while (offset < length) {
    if (view.getUint16(offset) === 0xffe1) {
      const exifHeader = String.fromCharCode(
        view.getUint8(offset + 4),
        view.getUint8(offset + 5),
        view.getUint8(offset + 6),
        view.getUint8(offset + 7),
        view.getUint8(offset + 8),
        view.getUint8(offset + 9)
      );
      if (exifHeader !== 'Exif\0\0') return null;

      const little = view.getUint16(offset + 10) === 0x4949;
      const getUint16 = (pos: number) => little ? view.getUint16(pos, true) : view.getUint16(pos, false);
      const getUint32 = (pos: number) => little ? view.getUint32(pos, true) : view.getUint32(pos, false);
      const firstIFDOffset = getUint32(offset + 14);
      const dirStart = offset + 10 + firstIFDOffset;
      const entries = getUint16(dirStart);
      for (let i = 0; i < entries; i++) {
        const entryOffset = dirStart + 2 + i * 12;
        const tag = getUint16(entryOffset);
        if (tag === 0x0112) {
          return getUint16(entryOffset + 8);
        }
      }
      return null;
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

function applyExifOrientation(bitmap: ImageBitmap, orientation: number): ImageBitmap {
  const width = bitmap.width;
  const height = bitmap.height;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  switch (orientation) {
    case 2:
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      break;
    case 3:
      ctx.translate(width, height);
      ctx.rotate(Math.PI);
      break;
    case 4:
      ctx.translate(0, height);
      ctx.scale(1, -1);
      break;
    case 5:
      canvas.width = height;
      canvas.height = width;
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6:
      canvas.width = height;
      canvas.height = width;
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -height);
      break;
    case 7:
      canvas.width = height;
      canvas.height = width;
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(width, -height);
      ctx.scale(-1, 1);
      break;
    case 8:
      canvas.width = height;
      canvas.height = width;
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-width, 0);
      break;
    default:
      break;
  }

  ctx.drawImage(bitmap, 0, 0);
  return canvas.transferToImageBitmap();
}