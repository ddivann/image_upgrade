import { MLParams } from '../ml';
export declare function createWebGLProgram(gl: WebGLRenderingContext): WebGLProgram;
export declare function cleanupWebGL(): void;
export declare function applyColorCorrection(bitmap: ImageBitmap, params: MLParams): ImageBitmap;
