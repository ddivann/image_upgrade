import { TaskContext } from "../worker/pipeline";
import { MLParams } from "../ml/index";
import { applyColorCorrection, cleanupWebGL } from "./webgl";

export { cleanupWebGL };

// Этап 6: Применение коррекции WebGL
export async function processWebGL(bitmap: ImageBitmap, params: MLParams, ctx: TaskContext): Promise<ImageBitmap> {
  ctx.updateProgress('processing', 50);
  ctx.checkCancelled();
  
  // Применяем WebGL-фильтр или 2D-фолбэк
  const processedBitmap = await applyColorCorrection(bitmap, params);
  
  ctx.updateProgress('processing', 90);
  
  return processedBitmap;
}