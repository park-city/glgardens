import { GLFramebuffer } from './gl-fbo';
import { Context, FrameContext } from './context';
import { TextureFormat } from './typedefs';
import { setNormalAlphaBlending } from './gl-utils';
import { GLVertexArray } from './gl-vao';
import { GLBuffer, GLBufferType } from './gl-buffer';
import { Texture2D } from './texture-allocator';

type BloomSwap = {
    blitMipTarget: Texture2D,
    swap00: GLFramebuffer,
    swap01: GLFramebuffer,
    swap10: GLFramebuffer,
    swap11: GLFramebuffer,
    swap20: GLFramebuffer,
    swap21: GLFramebuffer,
};

/** Handles compositing the scene on the screen. */
export class Composite {
    ctx: Context;
    /** Composite FBO to which the scene will be drawn. */
    composite: GLFramebuffer;
    /** Swap buffers used for bloom. */
    bloomSwap?: BloomSwap;
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

            console.debug(`Composite: using format ${TextureFormat[floatFmt]}`);

            if ((ctx.params.fboHalfFloat && ctx.params.halfFloatLinear)
                || (ctx.params.fboFloat && ctx.params.floatLinear)) {
                const blitMipTarget = Texture2D.tryCreate(this.ctx.gl, floatFmt, 1, 1);
                if (!blitMipTarget) throw new Error('Could not create blit target');
                blitMipTarget.bind(0);
                blitMipTarget.setMagFilter(this.ctx.gl.LINEAR);

                const genFbo = () => {
                    const fbo = new GLFramebuffer(this.ctx.gl);
                    fbo.colorFormats = [floatFmt];
                    fbo.linearSample = true;
                    return fbo;
                };

                this.bloomSwap = {
                    blitMipTarget,
                    swap00: genFbo(),
                    swap01: genFbo(),
                    swap10: genFbo(),
                    swap11: genFbo(),
                    swap20: genFbo(),
                    swap21: genFbo(),
                };
                console.debug(`Composite: enabling bloom`);
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

    present(ctx: FrameContext, doCapture?: (size: [number, number], pixels: Float32Array) => void) {
        const { gl } = this.ctx;

        gl.disable(gl.DEPTH_TEST);
        this.quad.bind();

        if (this.bloomSwap) {
            gl.disable(gl.BLEND);
            // copy current framebuffer (composite color 0) into a texture because
            // WebGL framebuffers do not allow mipmapping
            const bmt = this.bloomSwap.blitMipTarget;
            bmt.bind(0);
            bmt.resize(gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.copyTexImage2D(gl.TEXTURE_2D, 0, bmt.glInternalFormat, 0, 0, bmt.size[0], bmt.size[1], 0);
            gl.generateMipmap(gl.TEXTURE_2D);

            const runBloomScale = (swap0: GLFramebuffer, swap1: GLFramebuffer, scale: number) => {
                swap0.size[0] = gl.drawingBufferWidth / scale;
                swap0.size[1] = gl.drawingBufferHeight / scale;
                swap1.size[0] = gl.drawingBufferWidth / scale;
                swap1.size[1] = gl.drawingBufferHeight / scale;

                swap0.bind();
                this.ctx.shaders.compositeBloomThres!.bind();
                bmt.bind(0);
                this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 0, 4);

                swap1.bind();
                this.ctx.shaders.compositeBloomBlur!.bind();
                this.ctx.shaders.compositeBloomBlur!.setUniform('u_vert', 0);
                swap0.color[0].bind(0);
                this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 0, 4);

                swap0.bind();
                this.ctx.shaders.compositeBloomBlur!.setUniform('u_vert', 1);
                swap1.color[0].bind(0);
                this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 0, 4);
            };

            runBloomScale(this.bloomSwap.swap00, this.bloomSwap.swap01, 8);
            runBloomScale(this.bloomSwap.swap10, this.bloomSwap.swap11, 16);
            runBloomScale(this.bloomSwap.swap20, this.bloomSwap.swap21, 32);

            this.composite.bind();
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE);
            this.ctx.shaders.compositeBloomFinal!.bind();
            this.ctx.shaders.compositeBloomFinal!.setUniform('u_alpha', 1 / 3);
            this.bloomSwap.swap00.color[0].bind(0);
            this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 0, 4);
            this.bloomSwap.swap10.color[0].bind(0);
            this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 0, 4);
            this.bloomSwap.swap20.color[0].bind(0);
            this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 0, 4);
        }

        if (doCapture) {
            const pixels = new Float32Array(this.composite.size[0] * this.composite.size[1] * 4);
            const colorFormat = this.composite.colorFormats[0];
            switch (colorFormat) {
                case TextureFormat.RGBA16F:
                case TextureFormat.RGBA32F:
                    gl.readPixels(0, 0, this.composite.size[0], this.composite.size[1], gl.RGBA, gl.FLOAT, pixels);
                    break;
                default:
                    throw new Error('Framebuffer format not supported');
            }
            doCapture([this.composite.size[0], this.composite.size[1]], pixels);
            return;
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
