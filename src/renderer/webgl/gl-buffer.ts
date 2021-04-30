import { WebGLContext } from './typedefs';
import { mat2, mat3, mat4, vec2, vec3, vec4 } from 'gl-matrix';

export enum GLBufferType {
    Array,
    Element,
    Uniform,
}
export enum GLBufferUsage {
    StaticDraw,
    DynamicDraw,
}

export class GLBuffer {
    gl: WebGLContext;
    buffer: WebGLBuffer;
    type: GLBufferType;
    scalarType: GLuint | null = null;
    usage = GLBufferUsage.StaticDraw;

    constructor(gl: WebGLContext, type: GLBufferType) {
        this.gl = gl;
        this.type = type;
        const buffer = gl.createBuffer();
        if (!buffer) throw new Error('Failed to allocate buffer');
        this.buffer = buffer;
    }

    get glType() {
        switch (this.type) {
            case GLBufferType.Array:
                return this.gl.ARRAY_BUFFER;
            case GLBufferType.Element:
                return this.gl.ELEMENT_ARRAY_BUFFER;
            case GLBufferType.Uniform:
                return (this.gl as WebGL2RenderingContext).UNIFORM_BUFFER;
        }
    }

    get glUsage() {
        switch (this.usage) {
            case GLBufferUsage.StaticDraw:
                return this.gl.STATIC_DRAW;
            case GLBufferUsage.DynamicDraw:
                return this.gl.DYNAMIC_DRAW;
        }
    }

    bind() {
        this.gl.bindBuffer(this.glType, this.buffer);
    }

    setData(data: ArrayBuffer | ArrayBufferView) {
        if (data instanceof Float32Array) {
            this.scalarType = this.gl.FLOAT;
        } else if (data instanceof Uint8Array) {
            this.scalarType = this.gl.UNSIGNED_BYTE;
        } else if (data instanceof Uint16Array) {
            this.scalarType = this.gl.UNSIGNED_SHORT;
        } else if (data instanceof Uint32Array) {
            this.scalarType = this.gl.UNSIGNED_INT;
        } else {
            this.scalarType = null;
        }

        this.gl.bufferData(this.glType, data, this.glUsage);
    }

    updateData(offset: number, data: ArrayBuffer | ArrayBufferView) {
        this.gl.bufferSubData(this.glType, offset, data);
    }

    unbind() {
        this.gl.bindBuffer(this.glType, null);
    }

    dispose() {
        this.gl.deleteBuffer(this.buffer);
    }
}

export type GLUBI = {
    [field_name: string]: GLUBIElement,
};
export enum GLUBIValue {
    Int,
    Float,
    Vec2,
    Vec3,
    Vec4,
    Mat2,
    Mat3,
    Mat4,
}
export type GLUBIElement = GLUBI | GLUBIValue | [GLUBIElement, number];

function ubiSizeAlign(i: GLUBIElement): [number, number] {
    if (typeof i === 'number') {
        switch (i) {
            case GLUBIValue.Int:
            case GLUBIValue.Float:
                return [4, 4];
            case GLUBIValue.Vec2:
                return [8, 8];
            case GLUBIValue.Vec3:
                return [12, 16];
            case GLUBIValue.Vec4:
                return [16, 16];
            case GLUBIValue.Mat2:
                return ubiSizeAlign([GLUBIValue.Vec2, 2]);
            case GLUBIValue.Mat3:
                return ubiSizeAlign([GLUBIValue.Vec3, 3]);
            case GLUBIValue.Mat4:
                return ubiSizeAlign([GLUBIValue.Vec4, 4]);
        }
    } else if (Array.isArray(i)) {
        const [elSize, elAlign] = ubiSizeAlign(i[0]);
        const align = Math.ceil(elAlign / 16) * 16; // round up to vec4 alignment
        const stride = Math.ceil(elSize / align) * align;
        return [stride * i[1], align];
    } else {
        let size = 0;
        let align = 0;
        for (const field in i) {
            if (!i.hasOwnProperty(field)) continue;
            const [elSize, elAlign] = ubiSizeAlign(i[field]);
            size = Math.ceil(size / elAlign) * elAlign;
            size += Math.ceil(elSize / elAlign) * elAlign;
            align = Math.max(elAlign, align);
        }
        align = Math.ceil(align / 16) * 16; // round up to vec4 alignment
        return [Math.ceil(size / align) * align, align];
    }
}

function writeUbi(out: ArrayBuffer, o: number, i: GLUBIElement, value: any) {
    if (typeof i === 'number') {
        if (i === GLUBIValue.Int) {
            const abView = new Int32Array(out, o);
            abView[0] = value;
        } else {
            const abView = new Float32Array(out, o);
            switch (i) {
                case GLUBIValue.Float:
                    abView[0] = value;
                    break;
                case GLUBIValue.Vec4:
                    abView[3] = value[3];
                case GLUBIValue.Vec3:
                    abView[2] = value[2];
                case GLUBIValue.Vec2:
                    abView[1] = value[1];
                    abView[0] = value[0];
                    break;
                case GLUBIValue.Mat2:
                    for (let i = 0; i < 4; i++) abView[i] = value[i];
                    break;
                case GLUBIValue.Mat3:
                    writeUbi(out, o, GLUBIValue.Vec3, value.slice(0));
                    writeUbi(out, o + 4, GLUBIValue.Vec3, value.slice(3));
                    writeUbi(out, o + 8, GLUBIValue.Vec3, value.slice(6));
                    break;
                case GLUBIValue.Mat4:
                    for (let i = 0; i < 16; i++) abView[i] = value[i];
                    break;
            }
        }
    } else if (Array.isArray(i)) {
        const [elSize] = ubiSizeAlign(i[0]);
        for (let j = 0; j < Math.min(value.length, i[1]); j++) {
            writeUbi(out, o + j * elSize, i[0], value[j]);
        }
    } else {
        let offset = 0;
        for (const field in i) {
            if (!i.hasOwnProperty(field)) continue;
            const [elSize, elAlign] = ubiSizeAlign(i[field]);
            offset = Math.ceil(offset / elAlign) * elAlign;
            if (field in value) {
                writeUbi(out, o + offset, i[field], value[field]);
            }
            offset += Math.ceil(elSize / elAlign) * elAlign;
        }
    }
}

export type GLUniformBlockData = number | vec2 | vec3 | vec4 | mat2 | mat3 | mat4 | GLUniformBlockData[] | { [name: string]: GLUniformBlockData };

export class GLUniformBuffer extends GLBuffer {
    blockInterface: GLUBI;
    writeBuffer: ArrayBuffer;

    constructor(gl: WebGLContext, itf: GLUBI) {
        super(gl, GLBufferType.Uniform);
        this.blockInterface = itf;

        this.bind();
        const [size] = ubiSizeAlign(itf);
        this.writeBuffer = new ArrayBuffer(size);
        this.setData(this.writeBuffer);
    }

    setUniformData(data: GLUniformBlockData) {
        writeUbi(this.writeBuffer, 0, this.blockInterface, data);
        this.updateData(0, this.writeBuffer);
    }
}
