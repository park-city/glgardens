import { Shaders, TileChunkShader } from './shaders';
import { mat4, vec2, vec3, vec4 } from 'gl-matrix';
import { Camera } from './camera';

export type Context = {
    gl: WebGLRenderingContext,
    shaders: Shaders,
};

export type FrameContext = {
    /** Projection matrix */
    proj: mat4,
    /** View matrix */
    view: mat4,
    /** Viewport dimensions (in CSS pixels) */
    viewport: vec2,
    /** Viewport pixel ratio (canvas pixels to CSS pixels) */
    viewportScale: number,
    /** Camera */
    camera: Camera,
    /** Animation time in seconds */
    time: number,
    /** Current compositor */
    compositor: Compositor,
};

export interface Compositor {
    backgroundColor: vec4;
    readonly tileChunkShader: TileChunkShader,
    getLightDir(): vec3 | null;
    beginFrame(ctx: FrameContext): void;
    present(ctx: FrameContext): void;
    dispose(): void;
}
