var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class ImageEnhancer {
  // 30s таймаут
  constructor() {
    __publicField(this, "worker");
    __publicField(this, "taskProgress", /* @__PURE__ */ new Map());
    __publicField(this, "taskPromises", /* @__PURE__ */ new Map());
    __publicField(this, "queue", []);
    __publicField(this, "activeTasks", /* @__PURE__ */ new Set());
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    __publicField(this, "MAX_CONCURRENT", 1);
    // Максимум 1 задача одновременно(для браузерного ML)
    __publicField(this, "TASK_TIMEOUT_MS", 3e4);
    this.worker = new Worker(new URL("/assets/index-e6e92d40.js", self.location), { type: "module" });
    this.worker.onmessage = this.handleWorkerMessage.bind(this);
  }
  handleWorkerMessage(e) {
    const { type, taskId, status, progress, blob, error } = e.data;
    if (type === "progress") {
      this.updateProgress(taskId, status, progress);
    } else if (type === "done") {
      this.updateProgress(taskId, "done", 100);
      const deferred = this.taskPromises.get(taskId);
      if (deferred) {
        clearTimeout(deferred.timeoutId);
        deferred.resolve(blob);
        this.cleanupTask(taskId);
      }
      this.pumpQueue();
    } else if (type === "error") {
      this.updateProgress(taskId, "error", progress);
      const deferred = this.taskPromises.get(taskId);
      if (deferred) {
        clearTimeout(deferred.timeoutId);
        deferred.reject(new Error(error || "Worker error"));
        this.cleanupTask(taskId);
      }
      this.pumpQueue();
    }
  }
  updateProgress(taskId, status, progress) {
    const p = { taskId, status, progress };
    this.taskProgress.set(taskId, p);
    this.listeners.forEach((cb) => cb(p));
  }
  cleanupTask(taskId) {
    this.activeTasks.delete(taskId);
  }
  async submitTask(image) {
    const taskId = crypto.randomUUID();
    this.updateProgress(taskId, "queued", 0);
    let payload;
    if (image instanceof ImageBitmap) {
      payload = image;
    } else if (image instanceof Blob) {
      payload = { buffer: await image.arrayBuffer(), type: image.type };
    } else {
      payload = { buffer: image, type: "" };
    }
    const timeoutId = window.setTimeout(() => {
      this.cancelTask(taskId);
      const def = this.taskPromises.get(taskId);
      if (def)
        def.reject(new Error("Task timeout limit (30s) reached"));
    }, this.TASK_TIMEOUT_MS);
    this.taskPromises.set(taskId, {
      resolve: () => {
      },
      reject: () => {
      },
      timeoutId,
      payload
    });
    this.queue.push(taskId);
    this.pumpQueue();
    return taskId;
  }
  pumpQueue() {
    while (this.activeTasks.size < this.MAX_CONCURRENT && this.queue.length > 0) {
      const taskId = this.queue.shift();
      this.activeTasks.add(taskId);
      const def = this.taskPromises.get(taskId);
      if (!def || !def.payload)
        continue;
      const payload = def.payload;
      delete def.payload;
      const transferList = [];
      if (payload instanceof ImageBitmap) {
        transferList.push(payload);
      } else if (payload.buffer instanceof ArrayBuffer) {
        transferList.push(payload.buffer);
      }
      this.worker.postMessage({ type: "start", taskId, payload }, transferList);
    }
  }
  async getTaskStatus(taskId) {
    const progress = this.taskProgress.get(taskId);
    if (!progress)
      throw new Error("Task not found");
    return progress;
  }
  async cancelTask(taskId) {
    const p = this.taskProgress.get(taskId);
    if (!p || ["done", "error", "cancelled"].includes(p.status))
      return false;
    this.updateProgress(taskId, "cancelled", 0);
    this.worker.postMessage({ type: "cancel", taskId });
    const queueIdx = this.queue.indexOf(taskId);
    if (queueIdx >= 0)
      this.queue.splice(queueIdx, 1);
    const def = this.taskPromises.get(taskId);
    if (def) {
      clearTimeout(def.timeoutId);
      def.reject(new Error("Task cancelled manually"));
      this.cleanupTask(taskId);
    }
    this.pumpQueue();
    return true;
  }
  async getResult(taskId) {
    const def = this.taskPromises.get(taskId);
    if (!def) {
      throw new Error("Task undefined or already finished");
    }
    return new Promise((resolve, reject) => {
      def.resolve = resolve;
      def.reject = reject;
    });
  }
  onTaskStatusChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
export {
  ImageEnhancer
};
