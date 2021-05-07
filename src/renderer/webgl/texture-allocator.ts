import { Context } from './context';
import { vec2 } from 'gl-matrix';
import { TextureFormat, WebGLContext } from './typedefs';
import { isWebGL2 } from './gl-utils';

export class TextureHandle {
    array: TextureArray;
    index: number;

    constructor(array: TextureArray, index: number) {
        this.array = array;
        this.index = index;
    }

    get size(): vec2 {
        return this.array.size;
    }

    /** Returns the true depth of the underlying texture. Always 1 for WebGL1. */
    get depth(): number {
        return this.array.depth;
    }

    /** Returns true if this texture handle is still valid. */
    get isAvailable() {
        return this.index >= 0 && !this.array.isDeleted;
    }

    bind(slot: number) {
        if (!this.isAvailable) throw new Error('Can’t bind a deleted texture!');
        this.array.bind(slot, this.index);
    }

    update(data: TexImageSource) {
        this.array.update(this.index, data);
    }

    dispose() {
        if (this.index === -1) return;
        this.array.slots[this.index] = null;
        this.index = -1;
    }
}

const TEX_ARRAY_SIZE = 8; // if this value is too high you get very strange bugs
const TEX_MIP_LEVELS = 4;

export interface TextureArray {
    readonly glFormat: GLenum;
    readonly size: vec2;
    readonly depth: number;
    readonly slots: (TextureHandle | null)[];
    readonly lastUsedTime: number;
    readonly isDeleted: boolean;

    isTaken(index: number): boolean;
    takeHandle(index: number): TextureHandle;
    bind(slot: number, index: number): void;
    update(index: number, data: TexImageSource): void;
    dispose(): void;
    setMagFilter(type: GLuint): void;
}

export class Texture2D implements TextureArray {
    readonly gl: WebGLContext;
    readonly textures: WebGLTexture[];
    readonly format: TextureFormat;
    readonly glInternalFormat: GLenum;
    readonly glFormat: GLenum;
    readonly glType: GLint;
    readonly size: vec2;
    readonly depth = 1;
    slots: (TextureHandle | null)[] = [];
    lastUsedTime = Date.now();
    isDeleted = false;

    private constructor(
        gl: WebGLContext,
        textures: WebGLTexture[],
        format: TextureFormat,
        glInternalFormat: GLenum,
        glFormat: GLenum,
        glType: GLint,
        size: vec2,
    ) {
        this.gl = gl;
        this.textures = textures;
        this.format = format;
        this.glInternalFormat = glInternalFormat;
        this.glFormat = glFormat;
        this.glType = glType;
        this.size = size;
        for (let i = 0; i < this.textures.length; i++) this.slots.push(null);
    }

    static tryCreate(gl: WebGLContext, format: TextureFormat, width: GLuint, height: GLuint): Texture2D | null {
        const gl2 = isWebGL2(gl) ? gl as WebGL2RenderingContext : null;

        let glInternalFormat, glFormat, glType;
        switch (format) {
            case TextureFormat.RGBA8:
                glInternalFormat = gl2 ? gl2.RGBA8 : gl.RGBA;
                glFormat = gl.RGBA;
                glType = gl.UNSIGNED_BYTE;
                break;
            case TextureFormat.R8:
                if (!gl2) throw new Error('Texture format R8 not available');
                glInternalFormat = gl2.R8;
                glFormat = gl2.RED;
                glType = gl2.UNSIGNED_BYTE;
                break;
            case TextureFormat.RGBA16F:
                if (!gl2) throw new Error('Texture format RGBA16F not available');
                glInternalFormat = gl2.RGBA16F;
                glFormat = gl2.RGBA;
                glType = gl2.HALF_FLOAT;
                break;
            case TextureFormat.RGBA32F:
                if (!gl2) throw new Error('Texture format RGBA32F not available');
                glInternalFormat = gl2.RGBA32F;
                glFormat = gl2.RGBA;
                glType = gl2.FLOAT;
                break;
            default:
                throw new Error('Texture format not implemented');
        }

        const textures = [];
        {
            const texture = gl.createTexture();
            if (!texture) return null;
            textures.push(texture);
        }
        {
            gl.bindTexture(gl.TEXTURE_2D, textures[0]);
            gl.texImage2D(gl.TEXTURE_2D, 0, glInternalFormat, width, height, 0, glFormat, glType, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        }

        return new Texture2D(gl, textures, format, glInternalFormat, glFormat, glType, [width, height]);
    }

    isTaken(index: number) {
        return !!this.slots[index];
    }

    takeHandle(index: number) {
        this.slots[index]?.dispose();
        const handle: TextureHandle = new TextureHandle(this, index);
        this.slots[index] = handle;
        return handle;
    }

    bind(slot: number, index = 0) {
        this.gl.activeTexture(this.gl.TEXTURE0 + slot);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[index]);
        this.lastUsedTime = Date.now();
    }

    update(index: number, data: TexImageSource) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[index]);
        this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, this.glFormat, this.glType, data);
        this.gl.generateMipmap(this.gl.TEXTURE_2D);
    }

    setMagFilter(type: GLuint) {
        for (const tex of this.textures) {
            this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, type);
        }
    }

    resize(width: number, height: number) {
        if (width === this.size[0] && height === this.size[1]) return;
        const { gl } = this;
        gl.texImage2D(gl.TEXTURE_2D, 0, this.glInternalFormat, width, height, 0, this.glFormat, this.glType, null);
        this.size[0] = width;
        this.size[1] = height;
    }

    dispose() {
        this.isDeleted = true;
        for (const texture of this.textures) {
            this.gl.deleteTexture(texture);
        }
    }
}

class Texture2DArray implements TextureArray {
    readonly gl: WebGL2RenderingContext;
    readonly texture: WebGLTexture;
    readonly glFormat: GLenum;
    readonly glType: GLint;
    readonly size: vec2;
    readonly depth = TEX_ARRAY_SIZE;
    slots: (TextureHandle | null)[] = [];
    lastUsedTime = Date.now();
    isDeleted = false;

    private constructor(gl: WebGL2RenderingContext, texture: WebGLTexture, format: GLenum, type: GLint, size: vec2) {
        this.gl = gl;
        this.texture = texture;
        this.glFormat = format;
        this.glType = type;
        this.size = size;
        for (let i = 0; i < TEX_ARRAY_SIZE; i++) this.slots.push(null);
    }

    static tryCreate(gl: WebGL2RenderingContext, format: TextureFormat, width: GLuint, height: GLuint): Texture2DArray | null {
        let glStorageFormat, glFormat, glType;
        switch (format) {
            case TextureFormat.RGBA8:
                glStorageFormat = gl.RGBA8;
                glFormat = gl.RGBA;
                glType = gl.UNSIGNED_BYTE;
                break;
            case TextureFormat.RGBA16F:
                glStorageFormat = gl.RGBA16F;
                glFormat = gl.RGBA;
                glType = gl.HALF_FLOAT;
                break;
            default:
                throw new Error('Texture format not implemented');
        }

        const texture = gl.createTexture();
        if (!texture) return null;
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, TEX_MIP_LEVELS, glStorageFormat, width, height, TEX_ARRAY_SIZE);

        return new Texture2DArray(gl, texture, glFormat, glType, [width, height]);
    }

    isTaken(index: number) {
        return !!this.slots[index];
    }

    takeHandle(index: number) {
        this.slots[index]?.dispose();
        const handle: TextureHandle = new TextureHandle(this, index);
        this.slots[index] = handle;
        return handle;
    }

    bind(slot: number, index: number) {
        this.gl.activeTexture(this.gl.TEXTURE0 + slot);
        this.gl.bindTexture(this.gl.TEXTURE_2D_ARRAY, this.texture);
        this.lastUsedTime = Date.now();
    }

    update(index: number, data: TexImageSource) {
        this.gl.bindTexture(this.gl.TEXTURE_2D_ARRAY, this.texture);
        this.gl.texSubImage3D(
            this.gl.TEXTURE_2D_ARRAY,
            0,
            0,
            0,
            index,
            this.size[0],
            this.size[1],
            1,
            this.glFormat,
            this.glType,
            data,
        );
        this.gl.generateMipmap(this.gl.TEXTURE_2D_ARRAY);
    }

    setMagFilter(type: GLuint) {
        this.gl.bindTexture(this.gl.TEXTURE_2D_ARRAY, this.texture);
        this.gl.texParameteri(this.gl.TEXTURE_2D_ARRAY, this.gl.TEXTURE_MAG_FILTER, type);
    }

    dispose() {
        this.isDeleted = true;
        this.gl.deleteTexture(this.texture);
    }
}

function textureArrayKey(width: number, height: number, format: TextureFormat, parallelIndex: number) {
    return `${width | 0},${height | 0},${format},${parallelIndex | 0}`;
}

export class TextureAllocator {
    ctx: Context;
    textureArrays: { [key: string]: Set<TextureArray> } = {};
    useGL2Arrays: boolean;

    constructor(ctx: Context) {
        this.ctx = ctx;
        this.useGL2Arrays = !!ctx.gl2;
    }

    deleteUnusedArrays() {
        for (const k in Object.keys(this.textureArrays)) {
            if (!this.textureArrays.hasOwnProperty(k)) continue;
            const arrays = this.textureArrays[k];
            for (const array of [...arrays]) {
                let isUnused = true;
                for (const slot of array.slots) {
                    if (slot) {
                        isUnused = false;
                        break;
                    }
                }
                if (isUnused) {
                    arrays.delete(array);
                }
            }
            if (!arrays.size) delete this.textureArrays[k];
        }
    }

    deleteOldestArray() {
        let oldest;
        let oldestTime = Infinity;
        for (const k in this.textureArrays) {
            if (!this.textureArrays.hasOwnProperty(k)) continue;
            const arrays = this.textureArrays[k];
            for (const array of arrays) {
                if (array.lastUsedTime < oldestTime) {
                    oldest = { arrays, array };
                    oldestTime = array.lastUsedTime;
                }
            }
        }
        if (oldest) {
            oldest.arrays.delete(oldest.array);
            oldest.array.dispose();
        }
    }

    private tryCreateArray(width: number, height: number, format: TextureFormat) {
        if (this.useGL2Arrays) {
            return Texture2DArray.tryCreate(this.ctx.gl2!, format, width, height);
        } else {
            return Texture2D.tryCreate(this.ctx.gl, format, width, height);
        }
    }

    getTextureArrays(width: number, height: number, format: TextureFormat, parallelIndex: number) {
        const key = textureArrayKey(width, height, format, parallelIndex);
        if (!this.textureArrays[key]) this.textureArrays[key] = new Set();
        return this.textureArrays[key];
    }

    allocate(width: number, height: number, format: TextureFormat): TextureHandle {
        return this.parallelAllocate([[width, height, format]])[0];
    }

    /**
     * Allocates several textures at once, ensuring that
     * (a) they are not allocated on the same texture bindings
     * (b) their index in the texture array is the same (only applies to texture2d arrays)
     */
    parallelAllocate(params: [number, number, TextureFormat][]): TextureHandle[] {
        let results = [];

        // use parallel indices if WebGL2 (texture2d array)
        let indexInArray = 0;

        outer:
        for (let i = 0; i < params.length; i++) {
            const [width, height, format] = params[i];
            const arrays = this.getTextureArrays(width, height, format, this.useGL2Arrays ? i : 0);
            for (const array of arrays) {
                if (i === 0 || !this.useGL2Arrays) {
                    // control index: pick *any* empty slot
                    for (let j = 0; j < array.slots.length; j++) {
                        if (!array.slots[j]) {
                            results[i] = array.takeHandle(j);
                            indexInArray = j;
                            continue outer;
                        }
                    }
                } else {
                    // control index has picked a slot; we must now find an array with exactly
                    // that slot free
                    if (!array.slots[indexInArray]) {
                        results[i] = array.takeHandle(indexInArray);
                    }
                }
            }

            let array;
            for (let i = 0; i < 64; i++) {
                array = this.tryCreateArray(width, height, format);
                if (array) break;
                this.deleteOldestArray();
            }
            if (!array) throw new Error('Could not allocate texture');
            arrays.add(array);
            const idx = this.useGL2Arrays ? indexInArray : 0;
            results[i] = array.takeHandle(this.useGL2Arrays ? indexInArray : 0);
        }
        return results;
    }
}
