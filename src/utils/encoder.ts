import { TaskContext } from "../worker/pipeline";

// Этап: Кодирование результата
export async function encodeResult(bitmap: ImageBitmap, ctx: TaskContext): Promise<Blob> {
  // mark ctx as used to avoid TS unused-variable error in stub
  void ctx;
  await new Promise(r => setTimeout(r, 300));
  
  const canvas = new OffscreenCanvas(Math.min(bitmap.width, 800), Math.min(bitmap.height, 600));
  const canvasCtx = canvas.getContext('2d')!;
  
  canvasCtx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  canvasCtx.fillRect(0, 0, canvas.width, 50);
  
  canvasCtx.fillStyle = '#00ff00';
  canvasCtx.font = '20px sans-serif';
  canvasCtx.fillText('Pipeline Completed', 10, 30);

  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
}