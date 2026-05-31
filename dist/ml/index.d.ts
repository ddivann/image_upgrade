import { TaskContext } from '../worker/pipeline';
export interface MLParams {
    brightness: number;
    contrast: number;
    saturation: number;
}
export declare function runMLInference(bitmap: ImageBitmap, ctx: TaskContext): Promise<MLParams>;
