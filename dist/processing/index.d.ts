import { TaskContext } from '../worker/pipeline';
import { MLParams } from '../ml/index';
import { cleanupWebGL } from './webgl';
export { cleanupWebGL };
export declare function processWebGL(bitmap: ImageBitmap, params: MLParams, ctx: TaskContext): Promise<ImageBitmap>;
