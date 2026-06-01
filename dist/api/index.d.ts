/**
 * Возможные состояния задачи.
 */
export type TaskStatus = 'queued' | 'decoding' | 'analyzing' | 'processing' | 'encoding' | 'done' | 'cancelled' | 'error';
/**
 * Объект, отражающий прогресс выполнения задачи.
 */
export interface TaskProgress {
    /** Идентификатор задачи */
    taskId: string;
    /** Текущий статус */
    status: TaskStatus;
    /** Процесс выполнения (0-100) */
    progress: number;
}
/**
 * Основной API обработки изображений.
 */
export interface ImageEnhancerAPI {
    /**
     * Отправляет задачу на улучшение изображения.
     * @param image Исходное изображение (Blob, ArrayBuffer, или ImageBitmap).
     * @returns Идентификатор задачи (taskId).
     */
    submitTask(image: Blob | ArrayBuffer | ImageBitmap): Promise<string>;
    /**
     * Получает текущий статус задачи.
     * @param taskId Идентификатор задачи.
     */
    getTaskStatus(taskId: string): Promise<TaskProgress>;
    /**
     * Отменяет выполнение задачи (на любом этапе).
     * @param taskId Идентификатор задачи.
     * @returns true, если задача успешно отменена.
     */
    cancelTask(taskId: string): Promise<boolean>;
    /**
     * Получает итоговое улучшенное изображение.
     * @param taskId Идентификатор задачи.
     * @returns Улучшенное изображение в виде Blob.
     */
    getResult(taskId: string): Promise<Blob>;
    /**
     * Подписка на обновление статуса всех задач.
     * @param callback Функция обратного вызова при изменении статуса.
     * @returns Функция для отписки.
     */
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
