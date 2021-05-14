import { WebGLContext } from './typedefs';
import {
    GLShader,
    GLShaderStage,
    GLShaderStageType,
    GLShaderUniforms,
    GLUniformType,
    GLUniformValue
} from './gl-shader';
import { isWebGL2 } from './gl-utils';

// @ts-ignore
import * as gl1Shaders from './shaders/webgl/index.js';
// @ts-ignore
import * as gl2Shaders from './shaders/webgl2/index.js';
import { ContextParams } from './context';
import { GLUBIElement, GLUBIValue } from './gl-buffer';

export interface Shaders {
    compositeBloomThres?: GLShader,
    compositeBloomBlur?: GLShader,
    compositeBloomFinal?: GLShader,
    compositeFinal: GLShader,
    tileChunk: GLShader,
}

export const MAX_POINT_LIGHTS = 4;

export const UNIFORM_BLOCK_BINDING = {
    UCamera: 0,
    UGlobalLighting: 1,
    UChunkLighting: 2,
    UChunk: 3,
};
export const UNIFORM_BLOCKS = {
    camera: {
        proj: GLUBIValue.Mat4,
        view: GLUBIValue.Mat4,
        pos: GLUBIValue.Vec3,
    },
    chunk: {
        transform: GLUBIValue.Mat4,
        load_anim: GLUBIValue.Vec4,
    },
    globalLighting: {
        ambient_radiance: GLUBIValue.Vec3,
        sun_dir: GLUBIValue.Vec3,
        sun_radiance: GLUBIValue.Vec3,
    },
    chunkLighting: {
        point_light_count: GLUBIValue.Int,
        point_lights: [{
            pos: GLUBIValue.Vec3,
            radiance: GLUBIValue.Vec3,
        }, MAX_POINT_LIGHTS] as [GLUBIElement, number],
    },
};

type UniformBindings = { [name: string]: GLUniformValue };

export function initShaders(gl: WebGLContext, params: ContextParams): Shaders {
    const isGL2 = isWebGL2(gl);

    const prelude = [
        (isGL2 && (params.fboFloat || params.fboHalfFloat)) && '#define FEATURE_FBO_FLOAT 1',
        (params.enablePointLights) && '#define FEATURE_POINT_LIGHTS 1',
        // debug flags
        (params.debug?.showGeometry) && '#define DEBUG_SHOW_GEOMETRY 1',
        (params.debug?.showLightVolumes) && '#define DEBUG_SHOW_LIGHT_VOLUMES 1',
    ].filter(x => x).join('\n');

    if (isGL2) {
        const cs = (n: string, s: GLShaderStageType, u: GLShaderUniforms) => {
            const source = gl2Shaders[n].replace(/(#version .*\n)/, '$1' + prelude + '\n');
            return new GLShaderStage(gl, n, s, source, u);
        };

        const stages = {
            compositeVert: cs('compositeVert', GLShaderStageType.Vertex, {}),
            compositeBloomThresFrag: cs('compositeBloomThresFrag', GLShaderStageType.Fragment, {
                u_color: GLUniformType.Sampler2,
            }),
            compositeBloomBlurFrag: cs('compositeBloomBlurFrag', GLShaderStageType.Fragment, {
                u_color: GLUniformType.Sampler2,
                u_vert: GLUniformType.Int,
            }),
            compositeBloomFinalFrag: cs('compositeBloomFinalFrag', GLShaderStageType.Fragment, {
                u_color: GLUniformType.Sampler2,
                u_alpha: GLUniformType.Float,
            }),
            compositeFinalFrag: cs('compositeFinalFrag', GLShaderStageType.Fragment, {
                u_color: GLUniformType.Sampler2,
                u_tonemap: GLUniformType.Sampler2,
            }),
            tileChunkVert: cs('tileChunkVert', GLShaderStageType.Vertex, {
                UCamera: GLUniformType.Block,
                UChunk: GLUniformType.Block,
            }),
            tileChunkFrag: cs('tileChunkFrag', GLShaderStageType.Fragment, {
                UChunk: GLUniformType.Block,
                UGlobalLighting: GLUniformType.Block,
                UChunkLighting: GLUniformType.Block,
                u_light_pass_index: GLUniformType.Int,
                u_tileset_params: GLUniformType.Vec3,
                u_tileset_color: GLUniformType.Sampler3,
                u_tileset_normal: GLUniformType.Sampler3,
                u_tileset_material: GLUniformType.Sampler3,
            }),
        };

        const cp = (n: string, v: GLShaderStage, f: GLShaderStage, u: UniformBindings = {}) => {
            const s = new GLShader(gl, n, v, f, [], UNIFORM_BLOCK_BINDING);
            s.bind();
            for (const b in u) {
                if (!u.hasOwnProperty(b)) continue;
                s.setUniform(b, u[b]);
            }
            return s;
        }
        return {
            compositeBloomThres: cp('compositeBloomThres', stages.compositeVert, stages.compositeBloomThresFrag, {
                u_color: 0,
            }),
            compositeBloomBlur: cp('compositeBloomBlur', stages.compositeVert, stages.compositeBloomBlurFrag, {
                u_color: 0,
            }),
            compositeBloomFinal: cp('compositeBloomFinal', stages.compositeVert, stages.compositeBloomFinalFrag, {
                u_color: 0,
            }),
            compositeFinal: cp('compositeFinal', stages.compositeVert, stages.compositeFinalFrag, {
                u_color: 0,
                u_tonemap: 1,
            }),
            tileChunk: cp('tileChunk', stages.tileChunkVert, stages.tileChunkFrag, {
                u_tileset_color: 0,
                u_tileset_normal: 1,
                u_tileset_material: 2,
            }),
        };
    } else {
        const cs = (n: string, s: GLShaderStageType, u: GLShaderUniforms) => {
            const source = prelude + '\n' + gl1Shaders[n];
            return new GLShaderStage(gl, n, s, source, u);
        };

        const stages = {
            compositeFinalVert: cs('compositeFinalVert', GLShaderStageType.Vertex, {}),
            compositeFinalFrag: cs('compositeFinalFrag', GLShaderStageType.Fragment, {
                u_color: GLUniformType.Sampler2,
            }),
            tileChunkVert: cs('tileChunkVert', GLShaderStageType.Vertex, {
                u_proj: GLUniformType.Mat4,
                u_view: GLUniformType.Mat4,
                u_camera_pos: GLUniformType.Vec3,
                u_chunk_transform: GLUniformType.Mat4,
                u_chunk_load_anim: GLUniformType.Vec4,
            }),
            tileChunkFrag: cs('tileChunkFrag', GLShaderStageType.Fragment, {
                u_tileset_color: GLUniformType.Sampler2,
                u_tileset_normal: GLUniformType.Sampler2,
                u_tileset_material: GLUniformType.Sampler2,
                u_tileset_params: GLUniformType.Vec3,
                u_light_pass_index: GLUniformType.Int,
                u_gl_ambient_radiance: GLUniformType.Vec3,
                u_gl_sun_dir: GLUniformType.Vec3,
                u_gl_sun_radiance: GLUniformType.Vec3,
                u_cl_point_light_count: GLUniformType.Int,
                u_cl_point_light_pos: GLUniformType.Vec3Array,
                u_cl_point_light_radiance: GLUniformType.Vec3Array,
            }),
        };

        const cp = (n: string, v: GLShaderStage, f: GLShaderStage, a: string[], u: UniformBindings = {}) => {
            const s = new GLShader(gl, n, v, f, a);
            s.bind();
            for (const b in u) {
                if (!u.hasOwnProperty(b)) continue;
                s.setUniform(b, u[b]);
            }
            return s;
        }
        return {
            compositeFinal: cp('compositeFinal', stages.compositeFinalVert, stages.compositeFinalFrag, [
                'a_position',
            ], {
                u_color: 0,
            }),
            tileChunk: cp('tileChunk', stages.tileChunkVert, stages.tileChunkFrag, [
                'a_position',
                'a_uv',
                'a_tile',
                'a_obj_pos',
            ], {
                u_tileset_color: 0,
                u_tileset_normal: 1,
                u_tileset_material: 2,
            }),
        };
    }
}
