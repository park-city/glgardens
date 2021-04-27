declare module 'gl-buffer' {
    type TypedArray = Uint8Array | Uint16Array | Uint32Array | Float32Array | Float64Array;
    type DataArray = number | any[] | TypedArray;

    export class GLBuffer {
        gl: WebGLRenderingContext;
        handle: WebGLBuffer;
        type: number;
        length: number;
        usage: number;
        bind(): void;
        dispose(): void;
        update(data: DataArray, offset?: number): void;
    }

    export default function createBuffer(
        gl: WebGLRenderingContext,
        data?: DataArray,
        type?: number,
        usage?: number,
    ): GLBuffer;
}

declare module 'gl-vao' {
    import { GLBuffer } from 'gl-buffer';

    type Attribute = {
        buffer: GLBuffer,
        size?: number,
        type?: number,
        normalized?: boolean,
        stride?: number,
        offset?: number,
    };

    export class GLVertexArray {
        bind(): void;
        unbind(): void;
        draw(mode: number, count: number, offset?: number): void;
        update(attributes: Attribute[], elements?: GLBuffer, elementsType?: number): void;
        dispose(): void;
    }

    export default function createVAO(
        gl: WebGLRenderingContext,
        attributes: Attribute[],
        elements?: GLBuffer,
        elementsType?: number,
    ): GLVertexArray;
}

declare module 'gl-shader' {
    import { mat2, mat3, mat4, vec2, vec3, vec4 } from 'gl-matrix';

    type Declaration = {
        type: string,
        name: string,
    };

    export type UniformData = number | vec2 | vec3 | vec4 | mat2 | mat3 | mat4;
    type Uniforms = {
        [k: string]: UniformData | UniformData[] | undefined,
    };
    export class Attribute {
        location: number;
        pointer(type?: number, normalized?: boolean, stride?: number, offset?: number): void;
    }
    type Attributes = {
        [k: string]: Attribute | undefined,
    };

    export class GLShader {
        gl: WebGLRenderingContext;
        program: WebGLProgram;
        vertShader: WebGLShader;
        fragShader: WebGLShader;
        uniforms: Uniforms;
        attributes: Attributes;
        bind(): void;
        update(vertex: string, fragment: string, uniforms: Declaration[], attributes: Declaration[]): void;
        dispose(): void;
    }

    export default function createShader(
        gl: WebGLRenderingContext,
        vertex: string,
        fragment: string,
        uniforms?: Declaration[],
        attributes?: Declaration[],
    ): GLShader;
}

declare module 'gl-texture2d' {
    import { vec2 } from 'gl-matrix';

    type RawObject = { raw: any, width: number, height: number };

    export class GLTexture {
        gl: WebGLRenderingContext;
        handle: WebGLTexture;
        format: number;
        type: number;
        shape: vec2;
        wrap: [number, number];
        magFilter: number;
        minFilter: number;
        mipSamples: number;
        bind(texUnit?: number): void;
        dispose(): void;
        setPixels(
            data: any[] | HTMLCanvasElement | HTMLImageElement | HTMLVideoElement | RawObject,
            offset?: vec2,
            mipLevel?: number,
        ): void;
        generateMipmap(): void;
    }

    export default function createTexture(
        gl: WebGLRenderingContext,
        shape: vec2,
        format?: number,
        type?: number,
    ): GLTexture;

    export default function createTexture(
        gl: WebGLRenderingContext,
        domElement: ImageData | HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
        format?: number,
        type?: number,
    ): GLTexture;

    export default function createTexture(
        gl: WebGLRenderingContext,
        rawObject: RawObject,
        format?: number,
        type?: number,
    ): GLTexture;

    export default function createTexture(
        gl: WebGLRenderingContext,
        array: any[],
    ): GLTexture;
}

declare module 'gl-fbo' {
    import { vec2 } from 'gl-matrix';
    import { GLTexture } from 'gl-texture2d';

    type FboOptions = {
        preferFloat?: boolean,
        float?: boolean,
        color?: number,
        depth?: boolean,
        stencil?: boolean,
    };

    export class GLFramebuffer {
        shape: vec2;
        gl: WebGLRenderingContext;
        handle: WebGLFramebuffer;
        color: GLTexture[];
        depth: GLTexture | null;
        bind(): void;
        dispose(): void;
    }

    export default function createFBO(
        gl: WebGLRenderingContext,
        shape: vec2,
        options?: FboOptions,
    ): GLFramebuffer;
}
