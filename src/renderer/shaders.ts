import createShader, { GLShader } from 'gl-shader';
import { mat4, vec2, vec3, vec4 } from 'gl-matrix';

// @ts-ignore
import forwardCompositeVert from './forward-composite.vert';
// @ts-ignore
import forwardCompositeFrag from './forward-composite.frag';
// @ts-ignore
import deferredAmbientLightFrag from './deferred-ambient-light.frag';
// @ts-ignore
import deferredDirectionalLightFrag from './deferred-directional-light.frag';
// @ts-ignore
import deferredPointLightVert from './deferred-point-light.vert';
// @ts-ignore
import deferredPointLightFrag from './deferred-point-light.frag';
// @ts-ignore
import deferredFinalFrag from './deferred-final.frag';
// @ts-ignore
import tileChunkVert from './tile-chunk.vert';
// @ts-ignore
import tileChunkFrag from './tile-chunk.frag';
// @ts-ignore
import tileChunkDeferredFrag from './tile-chunk-deferred.frag';

type Shader<U> = {
    bind(): void;
    dispose(): void;

    uniforms: U;
};

// -- shader uniform variables --

type UForwardComposite = {
    u_texture: number,
};

type UDeferredFinal = UForwardComposite;

type UDeferredAmbientLight = {
    u_albedo: number,
    u_light_color: vec4,
};

type UDeferredDirectionalLight = {
    u_albedo: number,
    u_normal: number,
    u_light_dir: vec3,
    u_light_color: vec4,
};

type UDeferredPointLight = {
    u_proj: mat4,
    u_view: mat4,
    u_position: number,
    u_albedo: number,
    u_normal: number,
    u_light_pos: vec3,
    u_light_color: vec4,
    u_viewport_size: vec2,
};

type UTileChunk = {
    u_proj: mat4,
    u_view: mat4,
    u_chunk: mat4,
    u_tileset: number,
    u_tileset_normal: number,
    u_tileset_size: vec2,
    u_light_dir: vec3,
    u_camera_pos: vec3,
    u_in_anim: vec4,
};

// --

export type TileChunkShader = Shader<UTileChunk>;

export interface Shaders {
    forwardComposite: Shader<UForwardComposite>;
    deferredAmbientLight: Shader<UDeferredAmbientLight>;
    deferredDirectionalLight: Shader<UDeferredDirectionalLight>;
    deferredPointLight: Shader<UDeferredPointLight>;
    deferredFinal: Shader<UDeferredFinal>;
    tileChunk: TileChunkShader;
    tileChunkDeferred: TileChunkShader;

    dispose(): void;
}

export function initShaders(gl: WebGLRenderingContext): Shaders {
    const tileChunk = createShader(gl, tileChunkVert, tileChunkFrag);
    tileChunk.attributes.a_position!.location = 0;
    tileChunk.attributes.a_uv!.location = 1;
    tileChunk.attributes.a_tile!.location = 2;
    tileChunk.attributes.a_obj_pos!.location = 3;

    let tileChunkDeferred!: GLShader;
    try {
        tileChunkDeferred = createShader(gl, tileChunkVert, tileChunkDeferredFrag);
        tileChunkDeferred.attributes.a_position!.location = 0;
        tileChunkDeferred.attributes.a_uv!.location = 1;
        tileChunkDeferred.attributes.a_tile!.location = 2;
        tileChunkDeferred.attributes.a_obj_pos!.location = 3;
    } catch (e) {
        console.debug(`TileChunkDeferred compilation failed:`, e);
        // compilation failed because the extension couldn't be loaded
        // so this is fine, because we won't be using this shader anyway
    }

    const forwardComposite = createShader(gl, forwardCompositeVert, forwardCompositeFrag);

    const deferredAmbientLight = createShader(gl, forwardCompositeVert, deferredAmbientLightFrag);
    deferredAmbientLight.bind();
    deferredAmbientLight.uniforms.u_albedo = 1;

    const deferredDirectionalLight = createShader(gl, forwardCompositeVert, deferredDirectionalLightFrag);
    deferredDirectionalLight.bind();
    deferredDirectionalLight.uniforms.u_albedo = 1;
    deferredDirectionalLight.uniforms.u_normal = 2;

    const deferredPointLight = createShader(gl, deferredPointLightVert, deferredPointLightFrag);
    deferredPointLight.bind();
    deferredPointLight.uniforms.u_position = 0;
    deferredPointLight.uniforms.u_albedo = 1;
    deferredPointLight.uniforms.u_normal = 2;

    const deferredFinal = createShader(gl, forwardCompositeVert, deferredFinalFrag);

    return {
        forwardComposite: forwardComposite as any as Shader<UForwardComposite>,
        deferredAmbientLight: deferredAmbientLight as any as Shader<UDeferredAmbientLight>,
        deferredDirectionalLight: deferredDirectionalLight as any as Shader<UDeferredDirectionalLight>,
        deferredPointLight: deferredPointLight as any as Shader<UDeferredPointLight>,
        deferredFinal: deferredFinal as any as Shader<UDeferredFinal>,
        tileChunk: tileChunk as any as Shader<UTileChunk>,
        tileChunkDeferred: tileChunkDeferred as any as Shader<UTileChunk>,

        dispose() {
            forwardComposite.dispose();
            deferredAmbientLight.dispose();
            deferredDirectionalLight.dispose();
            deferredPointLight.dispose();
            deferredFinal.dispose();
            tileChunk.dispose();
            tileChunkDeferred.dispose();
        },
    };
}
