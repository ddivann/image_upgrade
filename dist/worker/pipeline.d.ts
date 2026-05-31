export interface TaskContext {
    taskId: string;
    aborted: boolean;
    updateProgress: (status: string, progress: number) => void;
    checkCancelled: () => void;
}
export declare class ProcessingPipeline {
    private activeTasks;
    startTask(taskId: string, payload: ImageBitmap | ArrayBuffer): void;
    cancelTask(taskId: string): void;
    private runPipeline;
}
