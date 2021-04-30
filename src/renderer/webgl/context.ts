import { mat4, vec2 } from 'gl-matrix';
import { Shaders } from './shaders';
import { Camera } from '../camera';
import { WebGLContext } from './typedefs';

export type ContextParams = {
    /** If true, half-float textures can be used in FBOs. */
    fboHalfFloat: boolean,
    /** If true, float textures can be used in FBOs. */
    fboFloat: boolean,
    /** If true, half-float textures can be sampled linearly. */
    halfFloatLinear: boolean,
    /** If true, float textures can be sampled linearly. */
    floatLinear: boolean,
    /** If true, depth textures can be used. */
    depthTexture: boolean,
    /** If true, the multi-draw extension is available. */
    multiDraw: boolean,
};

export type Context = {
    gl: WebGLContext,
    gl2: WebGL2RenderingContext | null,
    shaders: Shaders,
    params: ContextParams,
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
};