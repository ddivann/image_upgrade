export type TaskStatus = 'queued' | 'decoding' | 'analyzing' | 'processing' | 'encoding' | 'done' | 'cancelled' | 'error';

export interface TaskProgress {
  taskId: string;
  status: TaskStatus;
  progress: number;
}

export interface ImageEnhancerAPI {
  submitTask(image: Blob | ArrayBuffer | ImageBitmap): Promise<string>;
  getTaskStatus(taskId: string): Promise<TaskProgress>;
  cancelTask(taskId: string): Promise<boolean>;
  getResult(taskId: string): Promise<Blob>;
  onTaskStatusChange(callback: (e: TaskProgress) => void): () => void;
}

type TaskDeferred = {
  resolve: (blob: Blob) => void;
  reject: (reason: any) => void;
  timeoutId: number;
  payload?: ImageBitmap | ArrayBuffer;
};

export class ImageEnhancer implements ImageEnhancerAPI {
  private worker: Worker;
  private taskProgress = new Map<string, TaskProgress>();
  private taskPromises = new Map<string, TaskDeferred>();
  private queue: string[] = [];
  private activeTasks = new Set<string>();
  private listeners = new Set<(e: TaskProgress) => void>();

  private readonly MAX_CONCURRENT = 1; // Максимум 1 задача одновременно(для браузерного ML)
  private readonly TASK_TIMEOUT_MS = 30000; // 30s таймаут

  constructor() {
    this.worker = new Worker(new URL('../worker/index.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = this.handleWorkerMessage.bind(this);
  }

  private handleWorkerMessage(e: MessageEvent) {
    const { type, taskId, status, progress, blob, error } = e.data;
    
    if (type === 'progress') {
      this.updateProgress(taskId, status, progress);
    } else if (type === 'done') {
      this.updateProgress(taskId, 'done', 100);
      const deferred = this.taskPromises.get(taskId);
      if (deferred) {
        clearTimeout(deferred.timeoutId);
        deferred.resolve(blob);
        this.cleanupTask(taskId);
      }
      this.pumpQueue();
    } else if (type === 'error') {
      this.updateProgress(taskId, 'error', progress);
      const deferred = this.taskPromises.get(taskId);
      if (deferred) {
        clearTimeout(deferred.timeoutId);
        deferred.reject(new Error(error || 'Worker error'));
        this.cleanupTask(taskId);
      }
      this.pumpQueue();
    }
  }

  private updateProgress(taskId: string, status: TaskStatus, progress: number) {
    const p = { taskId, status, progress };
    this.taskProgress.set(taskId, p);
    this.listeners.forEach(cb => cb(p));
  }

  private cleanupTask(taskId: string) {
    this.activeTasks.delete(taskId);
  }

  async submitTask(image: Blob | ArrayBuffer | ImageBitmap): Promise<string> {
    const taskId = crypto.randomUUID();
    this.updateProgress(taskId, 'queued', 0);
    
    let payload: any;
    if (image instanceof ImageBitmap) {
      payload = image;
    } else if (image instanceof Blob) {
      payload = { buffer: await image.arrayBuffer(), type: image.type };
    } else {
      payload = { buffer: image, type: '' };
    }

    const timeoutId = window.setTimeout(() => {
      this.cancelTask(taskId);
      const def = this.taskPromises.get(taskId);
      if (def) def.reject(new Error('Task timeout limit (30s) reached'));
    }, this.TASK_TIMEOUT_MS);

    this.taskPromises.set(taskId, {
      resolve: () => {},
      reject: () => {},
      timeoutId,
      payload
    });

    this.queue.push(taskId);
    this.pumpQueue();
    return taskId;
  }

  private pumpQueue() {
    while (this.activeTasks.size < this.MAX_CONCURRENT && this.queue.length > 0) {
      const taskId = this.queue.shift()!;
      this.activeTasks.add(taskId);
      
      const def = this.taskPromises.get(taskId);
      if (!def || !def.payload) continue;

      const payload = def.payload as any;
      delete def.payload;
      
      const transferList = [];
      if (payload instanceof ImageBitmap) {
        transferList.push(payload);
      } else if (payload.buffer instanceof ArrayBuffer) {
        transferList.push(payload.buffer);
      }
      this.worker.postMessage({ type: 'start', taskId, payload }, transferList);
    }
  }

  async getTaskStatus(taskId: string): Promise<TaskProgress> {
    const progress = this.taskProgress.get(taskId);
    if (!progress) throw new Error('Task not found');
    return progress;
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const p = this.taskProgress.get(taskId);
    if (!p || ['done', 'error', 'cancelled'].includes(p.status)) return false;
    
    this.updateProgress(taskId, 'cancelled', 0);
    this.worker.postMessage({ type: 'cancel', taskId });
    
    const queueIdx = this.queue.indexOf(taskId);
    if (queueIdx >= 0) this.queue.splice(queueIdx, 1);
    
    const def = this.taskPromises.get(taskId);
    if (def) {
      clearTimeout(def.timeoutId);
      def.reject(new Error('Task cancelled manually'));
      this.cleanupTask(taskId);
    }
    
    this.pumpQueue();
    return true;
  }

  async getResult(taskId: string): Promise<Blob> {
    const def = this.taskPromises.get(taskId);
    if (!def) {
      throw new Error('Task undefined or already finished');
    }
    return new Promise((resolve, reject) => {
      def.resolve = resolve;
      def.reject = reject;
    });
  }

  onTaskStatusChange(callback: (e: TaskProgress) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
