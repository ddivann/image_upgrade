import { TaskContext } from "../worker/pipeline";

export async function encodeResult(bitmap: ImageBitmap, ctx: TaskContext): Promise<Blob> {
  void ctx;
  
  const canvas = new OffscreenCanvas(Math.min(bitmap.width, 800), Math.min(bitmap.height, 600));
  const canvasCtx = canvas.getContext('2d')!;

  canvasCtx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
}