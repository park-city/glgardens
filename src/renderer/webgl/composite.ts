import { GLFramebuffer } from './gl-fbo';
import { Context, FrameContext } from './context';
import { TextureFormat } from './typedefs';
import { setNormalAlphaBlending } from './gl-utils';
import { GLVertexArray } from './gl-vao';
import { GLBuffer, GLBufferType } from './gl-buffer';

/** Handles compositing the scene on the screen. */
export class Composite {
    ctx: Context;
    /** Composite FBO to which the scene will be drawn. */
    composite: GLFramebuffer;
    /** Swap buffers used for bloom. */
    bloomSwap?: GLFramebuffer[];
    quad: GLVertexArray;

    constructor(ctx: Context) {
        this.ctx = ctx;
        this.composite = new GLFramebuffer(this.ctx.gl);

        if (ctx.gl2 && (ctx.params.fboHalfFloat || ctx.params.fboFloat)) {
            const floatFmt = (ctx.params.fboHalfFloat && ctx.params.halfFloatLinear)
                ? TextureFormat.RGBA16F
                : (ctx.params.fboFloat && ctx.params.floatLinear)
                    ? TextureFormat.RGBA32F
                    : ctx.params.fboHalfFloat ? TextureFormat.RGBA16F : TextureFormat.RGBA32F;

            this.composite.colorFormats = [floatFmt, TextureFormat.R8];

            if ((ctx.params.fboHalfFloat && ctx.params.halfFloatLinear)
                || (ctx.params.fboFloat && ctx.params.floatLinear)) {
                const swap0 = new GLFramebuffer(this.ctx.gl);
                const swap1 = new GLFramebuffer(this.ctx.gl);
                swap0.colorFormats = swap1.colorFormats = [floatFmt];
                swap0.linearSample = true;

                this.bloomSwap = [swap0, swap1];
                console.debug(`Composite: using format ${TextureFormat[floatFmt]}; enabling bloom`);
            } else {
                console.debug(`Composite: using format ${TextureFormat[floatFmt]}`);
            }
        } else if (ctx.gl2) {
            this.composite.colorFormats = [TextureFormat.RGBA8, TextureFormat.R8];
        } else {
            this.composite.colorFormats = [TextureFormat.RGBA8];
        }

        this.quad = new GLVertexArray(this.ctx.gl);
        const quadBuffer = new GLBuffer(this.ctx.gl, GLBufferType.Array);
        quadBuffer.bind();
        quadBuffer.setData(new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            1, 1,
        ]));
        this.quad.bind();
        this.quad.update(null, [{
            buffer: quadBuffer,
            size: 2,
        }]);
        this.quad.unbind();
    }

    begin(ctx: FrameContext) {
        const { gl } = this.ctx;

        this.composite.size[0] = ctx.viewport[0] * ctx.viewportScale;
        this.composite.size[1] = ctx.viewport[1] * ctx.viewportScale;
        this.composite.bind();
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        setNormalAlphaBlending(gl);
    }

    present(ctx: FrameContext) {
        const { gl } = this.ctx;

        gl.disable(gl.DEPTH_TEST);
        this.quad.bind();

        if (this.bloomSwap) {
            const swapWidth = gl.drawingBufferWidth / 8;
            const swapHeight = gl.drawingBufferHeight / 8;
            this.bloomSwap[0].size[0] = swapWidth;
            this.bloomSwap[1].size[0] = swapWidth;
            this.bloomSwap[0].size[1] = swapHeight;
            this.bloomSwap[1].size[1] = swapHeight;

            this.bloomSwap[0].bind();
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            this.ctx.shaders.compositeBloomThres!.bind();
            this.composite.color[0].bind(0);
            this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 0, 4);

            this.bloomSwap[1].bind();
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            this.ctx.shaders.compositeBloomBlur!.bind();
            this.ctx.shaders.compositeBloomBlur!.setUniform('u_vert', 0);
            this.bloomSwap[0].color[0].bind(0);
            this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 0, 4);

            this.bloomSwap[0].bind();
            this.ctx.shaders.compositeBloomBlur!.setUniform('u_vert', 1);
            this.bloomSwap[1].color[0].bind(0);
            this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 0, 4);

            this.composite.bind();
            gl.blendFunc(gl.ONE, gl.ONE);
            this.ctx.shaders.compositeBloomFinal!.bind();
            this.bloomSwap[0].color[0].bind(0);
            this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 0, 4);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        this.ctx.shaders.compositeFinal.bind();
        this.composite.color[0].bind(0);
        if (this.composite.color[1]) {
            this.composite.color[1].bind(1);
        }

        this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 0, 4);
        this.quad.unbind();
    }
}
