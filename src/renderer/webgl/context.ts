import { mat4, vec2 } from 'gl-matrix';
import { Shaders } from './shaders';
import { Camera } from '../camera';
import { WebGLContext } from './typedefs';
import { IBackingContext } from '../typedefs';

export type ContextParams = {
    /** If true, half-float textures can be used in FBOs. */
    fboHalfFloat: boolean,
    /** If true, float textures can be used in FBOs. */
    fboFloat: boolean,
    /** If true, half-float textures can be sampled linearly. */
    halfFloatLinear: boolean,
    /** If true, float textures can be sampled linearly. */
    floatLinear: boolean,
    /** True if this is (probably) an Adreno GPU. */
    isAdreno: boolean,

    /** If true, normal textures will be sampled linearly. */
    useLinearNormals: boolean,
    /** If true, normal textures will be float textures. */
    useFloatNormals: boolean,
    /** If true, point lights will be enabled. */
    enablePointLights: boolean,
    /** If true, macrotiles will be used to cache rendered chunks. */
    useMacrotiles: boolean,

    /** Debug flags. */
    debug?: { [k: string]: unknown },
};

export type Context = {
    backing: IBackingContext,
    gl: WebGLContext,
    gl2: WebGL2RenderingContext | null,
    shaders: Shaders,
    params: ContextParams,
    getShared<T extends Disposable>(k: SharedContextData<T>): T,
};

export interface SharedContextData<T extends Disposable> {
    name: string;
    init(ctx: Context): T;
}
export interface Disposable {
    dispose(): void;
}

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
