// pipeline.ts - Конвейер обработки

export interface TaskContext {
  taskId: string;
  aborted: boolean;
  updateProgress: (status: string, progress: number) => void;
  checkCancelled: () => void;
}

// Заглушки для будущих этапов (4, 5, 6)
import { decodeImage } from '../decoders/index';
import { runMLInference } from '../ml/index';
import { processWebGL, cleanupWebGL } from '../processing/index';
import { encodeResult } from '../utils/encoder';

export class ProcessingPipeline {
  private activeTasks: Map<string, TaskContext> = new Map();

  startTask(taskId: string, payload: ImageBitmap | ArrayBuffer) {
    const context: TaskContext = {
      taskId,
      aborted: false,
      updateProgress: (status: string, progress: number) => {
        if (!context.aborted) {
          self.postMessage({ type: 'progress', taskId, status, progress });
        }
      },
      checkCancelled: () => {
        if (context.aborted) {
          throw new Error('Cancelled');
        }
      }
    };
    
    this.activeTasks.set(taskId, context);
    this.runPipeline(context, payload).catch(err => {
      if (err.message !== 'Cancelled') {
        self.postMessage({ type: 'error', taskId, status: 'error', progress: 0, error: err.message });
      }
      this.activeTasks.delete(taskId);
    });
  }

  cancelTask(taskId: string) {
    const context = this.activeTasks.get(taskId);
    if (context) {
      context.aborted = true;
      this.activeTasks.delete(taskId);
      console.log(`[Worker] Task ${taskId} explicitly cancelled.`);
      cleanupWebGL(); // Очистка WebGL-контекста
    }
  }

  private async runPipeline(ctx: TaskContext, payload: ImageBitmap | ArrayBuffer) {
    let internalBitmap: ImageBitmap | undefined;
    let webGLResult: ImageBitmap | undefined;

    try {
      // 1. Декодирование (0-20%)
      ctx.updateProgress('decoding', 5);
      internalBitmap = await decodeImage(payload, ctx);
      ctx.checkCancelled();
      ctx.updateProgress('decoding', 20);

      // 2. Подготовка превью + ML-инференс (20-40%)
      ctx.updateProgress('analyzing', 25);
      const params = await runMLInference(internalBitmap, ctx);
      ctx.checkCancelled();
      ctx.updateProgress('analyzing', 40);

      // 3. Обработка параметров к полному разрешению (40-90%)
      ctx.updateProgress('processing', 45);
      webGLResult = await processWebGL(internalBitmap, params, ctx);
      ctx.checkCancelled();
      ctx.updateProgress('processing', 90);

      // 4. Кодирование результата (90-100%)
      ctx.updateProgress('encoding', 95);
      const blob = await encodeResult(webGLResult, ctx);
      ctx.checkCancelled();

      // Успешно завершено
      if (!ctx.aborted) {
        self.postMessage({ type: 'done', taskId: ctx.taskId, status: 'done', progress: 100, blob });
        this.activeTasks.delete(ctx.taskId);
      }
    } finally {
      // Очистка ресурсов
      if (internalBitmap) internalBitmap.close();
      if (webGLResult) webGLResult.close();
    }
  }
}
