import { WebGLContext } from './typedefs';
import { mat2, mat3, mat4, vec2, vec3, vec4 } from 'gl-matrix';
import { GLBuffer } from './gl-buffer';

export enum GLShaderStageType {
    Vertex,
    Fragment,
}

export enum GLUniformType {
    Int,
    Float,
    Vec2,
    Vec3,
    Vec4,
    Mat2,
    Mat3,
    Mat4,
    Vec2Array,
    Vec3Array,
    Vec4Array,
    Sampler2,
    Sampler3,
    Block,
}
export type GLShaderUniforms = {
    [name: string]: GLUniformType,
};
export type GLUniformValue = number | vec2 | vec3 | vec4 | mat2 | mat3 | mat4 | Float32Array;

export class GLShaderStage {
    readonly gl: WebGLContext;
    readonly shader: WebGLShader;
    readonly uniforms: GLShaderUniforms;

    constructor(gl: WebGLContext, name: string, type: GLShaderStageType, source: string, uniforms: GLShaderUniforms) {
        this.gl = gl;
        this.uniforms = uniforms;

        const glType = type === GLShaderStageType.Vertex ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER;
        const shader = gl.createShader(glType);
        if (!shader) throw new Error(`Failed to allocate shader ${name}`);
        this.shader = shader;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader) || '- no log -';
            const sourceLines = source.split('\n');
            const fancyLog = [];
            for (const line of log.split('\n')) {
                fancyLog.push(line);
                const m = line.match(/ERROR:\s+(\d+):(\d+):/);
                if (m) {
                    fancyLog.push(sourceLines[+m[2] - 1]);
                }
            }
            throw new Error(`Failed to compile shader ${name}:\n${fancyLog.join('\n')}`);
        }
    }

    dispose() {
        this.gl.deleteShader(this.shader);
    }
}

type GLUniformBlockBindings = { [name: string]: number };

export class GLShader {
    readonly gl: WebGLContext;
    readonly vertex: GLShaderStage;
    readonly fragment: GLShaderStage;
    readonly program: WebGLProgram;
    readonly uniformLocations: { [name: string]: WebGLUniformLocation | null } = {};
    readonly uniformBlockLocations: { [name: string]: number } = {};
    uniformBlockBindings: GLUniformBlockBindings;

    constructor(gl: WebGLContext, name: string, vertex: GLShaderStage, fragment: GLShaderStage, attributes: string[], blockBindings: GLUniformBlockBindings = {}) {
        this.gl = gl;
        this.vertex = vertex;
        this.fragment = fragment;
        this.uniformBlockBindings = blockBindings;

        const program = gl.createProgram();
        if (!program) throw new Error(`Failed to allocate shader program ${name}`);
        this.program = program;
        gl.attachShader(program, vertex.shader);
        gl.attachShader(program, fragment.shader);
        for (let i = 0; i < attributes.length; i++) {
            gl.bindAttribLocation(program, i, attributes[i]);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(program);
            throw new Error(`Failed to link shader program ${name}:\n${log}`);
        }

        for (const k in this.vertex.uniforms) {
            if (!this.vertex.uniforms.hasOwnProperty(k)) continue;
            if (this.vertex.uniforms[k] === GLUniformType.Block) {
                const gl2 = (gl as WebGL2RenderingContext);
                const loc = gl2.getUniformBlockIndex(program, k);
                if (loc === gl2.INVALID_INDEX) throw new Error(`Could not find uniform block ${k} in vertex shader for program ${name}`);
                this.uniformBlockLocations[k] = loc;
                if (!(k in blockBindings)) throw new Error(`No uniform block binding for ${k} in program ${name}`);
                const bindingIndex = blockBindings[k];
                gl2.uniformBlockBinding(this.program, loc, bindingIndex);
            } else {
                const loc = gl.getUniformLocation(program, k);
                if (!loc) {
                    console.warn(`Could not find uniform ${k} in vertex shader for program ${name}`);
                }
                this.uniformLocations[k] = loc;
            }
        }
        for (const k in this.fragment.uniforms) {
            if (!this.fragment.uniforms.hasOwnProperty(k)) continue;
            if (this.fragment.uniforms[k] === GLUniformType.Block) {
                const gl2 = (gl as WebGL2RenderingContext);
                const loc = gl2.getUniformBlockIndex(program, k);
                if (loc === gl2.INVALID_INDEX) throw new Error(`Could not find uniform block ${k} in fragment shader for program ${name}`);
                this.uniformBlockLocations[k] = loc;
                if (!(k in blockBindings)) throw new Error(`No uniform block binding for ${k} in program ${name}`);
                const bindingIndex = blockBindings[k];
                gl2.uniformBlockBinding(this.program, loc, bindingIndex);
            } else {
                const loc = gl.getUniformLocation(program, k);
                if (!loc) {
                    console.warn(`Could not find uniform ${k} in fragment shader for program ${name}`);
                }
                this.uniformLocations[k] = loc;
            }
        }
    }

    bind() {
        this.gl.useProgram(this.program);
    }

    setUniform(name: string, value: GLUniformValue) {
        const type = this.vertex.uniforms[name] || this.fragment.uniforms[name];
        const loc = this.uniformLocations[name];
        if (loc === null) return;
        switch (type) {
            case GLUniformType.Int:
            case GLUniformType.Sampler2:
            case GLUniformType.Sampler3:
                if (typeof value !== 'number') throw new Error('incorrect value type')
                return this.gl.uniform1i(loc, value);
            case GLUniformType.Float:
                if (typeof value !== 'number') throw new Error('incorrect value type');
                return this.gl.uniform1f(loc, value);
            case GLUniformType.Vec2:
                if (!(value instanceof Float32Array) && !Array.isArray(value)) throw new Error('incorrect value type');
                return this.gl.uniform2f(loc, value[0], value[1]);
            case GLUniformType.Vec3:
                if (!(value instanceof Float32Array) && !Array.isArray(value)) throw new Error('incorrect value type');
                return this.gl.uniform3f(loc, value[0], value[1], value[2]!);
            case GLUniformType.Vec4:
                if (!(value instanceof Float32Array) && !Array.isArray(value)) throw new Error('incorrect value type');
                return this.gl.uniform4f(loc, value[0], value[1], value[2]!, value[3]!);
            case GLUniformType.Vec2Array:
                if (!(value instanceof Float32Array) && !Array.isArray(value)) throw new Error('incorrect value type');
                return this.gl.uniform2fv(loc, value);
            case GLUniformType.Vec3Array:
                if (!(value instanceof Float32Array) && !Array.isArray(value)) throw new Error('incorrect value type');
                return this.gl.uniform3fv(loc, value);
            case GLUniformType.Vec4Array:
                if (!(value instanceof Float32Array) && !Array.isArray(value)) throw new Error('incorrect value type');
                return this.gl.uniform4fv(loc, value);
            case GLUniformType.Mat2:
                if (!(value instanceof Float32Array) && !Array.isArray(value)) throw new Error('incorrect value type');
                return this.gl.uniformMatrix2fv(loc, false, value);
            case GLUniformType.Mat3:
                if (!(value instanceof Float32Array) && !Array.isArray(value)) throw new Error('incorrect value type');
                return this.gl.uniformMatrix3fv(loc, false, value);
            case GLUniformType.Mat4:
                if (!(value instanceof Float32Array) && !Array.isArray(value)) throw new Error('incorrect value type');
                return this.gl.uniformMatrix4fv(loc, false, value);
            case GLUniformType.Block:
                throw new Error(`Uniform ${name} is a block`);
            default:
                throw new Error(`Undefined uniform type for ${name}`);
        }
    }

    // TODO: move this function somewhere else because it's not shader-specific
    bindUniformBlock(name: string, buffer: GLBuffer) {
        const type = this.vertex.uniforms[name] || this.fragment.uniforms[name];
        if (type !== GLUniformType.Block) throw new Error(`Uniform ${name} is not a block`);
        const gl = (this.gl as WebGL2RenderingContext);
        if (!(name in this.uniformBlockBindings)) throw new Error(`No uniform block binding for ${name}`);
        const bindingIndex = this.uniformBlockBindings[name];
        gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingIndex, buffer.buffer);
    }

    dispose() {
        this.gl.deleteProgram(this.program);
    }
}
