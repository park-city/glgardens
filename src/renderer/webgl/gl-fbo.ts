import { TextureFormat, WebGLContext } from './typedefs';
import { vec2 } from 'gl-matrix';
import { Texture2D } from './texture-allocator';
import { isWebGL2 } from './gl-utils';

export class GLFramebuffer {
    gl: WebGLContext;
    framebuffer: WebGLFramebuffer;
    size = vec2.fromValues(1, 1);
    colorFormats = [TextureFormat.RGBA8];
    linearSample = false;

    readonly color: Texture2D[] = [];
    depth: WebGLRenderbuffer | null = null;
    readonly depthSize = vec2.fromValues(0, 0);

    constructor(gl: WebGLContext) {
        this.gl = gl;

        const fb = gl.createFramebuffer();
        if (!fb) throw new Error('Failed to allocate framebuffer');
        this.framebuffer = fb;
    }

    bind() {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
        this.updateAttachments();
        this.gl.viewport(0, 0, this.size[0], this.size[1]);
    }

    private updateAttachments() {
        const { gl } = this;
        let updatedAttachments = false;

        while (this.color.length > this.colorFormats.length) this.color.pop()?.dispose();
        for (let i = 0; i < this.colorFormats.length; i++) {
            const needsResize = this.color[i]?.size[0] !== this.size[0] || this.color[i]?.size[1] !== this.size[1];
            if (this.color[i]?.format !== this.colorFormats[i] || needsResize) {
                this.color[i]?.dispose();
                const tex = Texture2D.tryCreate(gl, this.colorFormats[i], this.size[0], this.size[1]);
                if (!tex) throw new Error('Failed to create color attachment');
                tex.bind(0);
                if (this.linearSample) {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                } else {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                }
                this.color[i] = tex;

                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, this.color[i].textures[0], 0);
                updatedAttachments = true;
            }
        }

        if (updatedAttachments && isWebGL2(gl)) {
            const gl2 = gl as WebGL2RenderingContext;
            const buffers = [];
            for (let i = 0; i < this.colorFormats.length; i++) {
                buffers.push(gl2.COLOR_ATTACHMENT0 + i)
            }
            gl2.drawBuffers(buffers);
        }

        if (!this.depth || this.depthSize[0] !== this.size[0] || this.depthSize[1] !== this.size[1]) {
            if (!this.depth) {
                gl.deleteRenderbuffer(this.depth);
                const rb = gl.createRenderbuffer();
                if (!rb) throw new Error('Failed to allocate depth attachment');
                this.depth = rb;
            }
            gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.size[0], this.size[1]);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
            this.depthSize[0] = this.size[0];
            this.depthSize[1] = this.size[1];
        }
    }

    dispose() {
        for (const tex of this.color) tex.dispose();
        if (this.depth) this.gl.deleteRenderbuffer(this.depth);
        this.gl.deleteFramebuffer(this.framebuffer);
    }
}
