import createVAO, { GLVertexArray } from 'gl-vao';
import createFBO, { GLFramebuffer } from 'gl-fbo';
import { Compositor, Context, FrameContext } from './context';
import createBuffer from 'gl-buffer';
import { vec3, vec4 } from 'gl-matrix';
import { TileChunkShader } from './shaders';

export class ForwardCompositor implements Compositor {
    ctx: Context;

    /** A simple quad for drawing the final image. */
    quad: GLVertexArray;
    /** Final frame buffer. */
    fbo: GLFramebuffer;
    backgroundColor = vec4.fromValues(0, 0, 0, 1);
    tileChunkShader: TileChunkShader;

    /** Light direction for tiles with normal maps. Must be normalized. */
    lightDir = vec3.fromValues(0, 0, 1);

    constructor(ctx: Context) {
        this.ctx = ctx;

        this.quad = createVAO(this.ctx.gl, [
            {
                buffer: createBuffer(this.ctx.gl, [0, 0, 1, 0, 0, 1, 1, 1]),
                size: 2,
            },
        ]);

        this.tileChunkShader = this.ctx.shaders.tileChunk;

        const floatBufAvailable = !!this.ctx.gl.getExtension('WEBGL_color_buffer_float');
        this.fbo = createFBO(this.ctx.gl, [1, 1], {
            preferFloat: floatBufAvailable,
        });

        this.ctx.gl.blendFuncSeparate(
            this.ctx.gl.SRC_ALPHA,
            this.ctx.gl.ONE_MINUS_SRC_ALPHA,
            this.ctx.gl.ONE,
            this.ctx.gl.ONE_MINUS_SRC_ALPHA,
        );
    }

    getLightDir() {
        return this.lightDir;
    }

    beginFrame(ctx: FrameContext): void {
        const fboWidth = ctx.viewport[0] * ctx.viewportScale;
        const fboHeight = ctx.viewport[1] * ctx.viewportScale;
        this.ctx.gl.viewport(0, 0, fboWidth, fboHeight);

        if (this.fbo.shape[0] !== fboWidth || this.fbo.shape[1] !== fboHeight) {
            this.fbo.shape = [fboWidth, fboHeight];
        }

        this.fbo.bind();
        this.ctx.gl.clearColor(this.backgroundColor[0], this.backgroundColor[1], this.backgroundColor[2], this.backgroundColor[3]);
        this.ctx.gl.clear(this.ctx.gl.COLOR_BUFFER_BIT | this.ctx.gl.DEPTH_BUFFER_BIT);
    }

    present(ctx: FrameContext): void {
        this.ctx.gl.bindFramebuffer(this.ctx.gl.FRAMEBUFFER, null);
        this.ctx.gl.clear(this.ctx.gl.COLOR_BUFFER_BIT | this.ctx.gl.DEPTH_BUFFER_BIT);
        this.ctx.shaders.forwardComposite.bind();
        this.fbo.color[0].bind(0);
        this.quad.bind();
        this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 4);
        this.quad.unbind();
    }

    dispose(): void {
        this.fbo.dispose();
        this.quad.dispose();
    }
}
