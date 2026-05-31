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
export declare class ImageEnhancer implements ImageEnhancerAPI {
    private worker;
    private taskProgress;
    private taskPromises;
    private queue;
    private activeTasks;
    private listeners;
    private readonly MAX_CONCURRENT;
    private readonly TASK_TIMEOUT_MS;
    constructor();
    private handleWorkerMessage;
    private updateProgress;
    private cleanupTask;
    submitTask(image: Blob | ArrayBuffer | ImageBitmap): Promise<string>;
    private pumpQueue;
    getTaskStatus(taskId: string): Promise<TaskProgress>;
    cancelTask(taskId: string): Promise<boolean>;
    getResult(taskId: string): Promise<Blob>;
    onTaskStatusChange(callback: (e: TaskProgress) => void): () => void;
}
