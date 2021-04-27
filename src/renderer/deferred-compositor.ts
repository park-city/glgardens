import createVAO, { GLVertexArray } from 'gl-vao';
import createFBO, { GLFramebuffer } from 'gl-fbo';
import { Compositor, Context, FrameContext } from './context';
import createBuffer from 'gl-buffer';
import { vec3, vec4 } from 'gl-matrix';
import { TileChunkShader } from './shaders';

const MAX_DYN_RES_SCALE = 1;
const MIN_DYN_RES_SCALE = 0.4;
const DYN_RES_STEP = 0.1;
const DYN_RES_STEP_DOWN_FPS = 40;
const DYN_RES_STEP_UP_FPS = 60;

type PointLight = {
    pos: vec3,
    color: vec4,
};

export class DeferredCompositor implements Compositor {
    static isAvailable(gl: WebGLRenderingContext) {
        return !!gl.getExtension('WEBGL_color_buffer_float')
            && !!gl.getExtension('WEBGL_draw_buffers')
            && !!gl.getExtension('WEBGL_depth_texture');
    }

    ctx: Context;
    quad: GLVertexArray;
    final: GLFramebuffer;
    composite: GLFramebuffer;
    backgroundColor = vec4.fromValues(0, 0, 0, 1);
    tileChunkShader: TileChunkShader;
    dynResolutionScale = 1;

    constructor(ctx: Context) {
        this.ctx = ctx;

        if (!DeferredCompositor.isAvailable(ctx.gl)) throw new Error('Deferred compositor not available!');

        this.quad = createVAO(this.ctx.gl, [
            {
                buffer: createBuffer(this.ctx.gl, [0, 0, 1, 0, 0, 1, 1, 1]),
                size: 2,
            },
        ]);

        this.final = createFBO(this.ctx.gl, [1, 1], {
            float: true,
        });
        this.composite = createFBO(this.ctx.gl, [1, 1], {
            float: true,
            color: 3,
        });

        this.tileChunkShader = this.ctx.shaders.tileChunkDeferred;

        console.debug('NGWebGL: init deferred compositor');
    }

    getLightDir() {
        return null;
    }

    pointLights: PointLight[] = [];
    lastTime = 0;
    fpsSamples: number[] = [];
    fpsSampleTime = 0;

    beginFrame(ctx: FrameContext): void {
        const { gl } = this.ctx;

        const frameTime = Math.min(1 / 30, (Date.now() - this.lastTime) / 1000);
        this.lastTime = Date.now();
        this.fpsSamples.push(1 / frameTime);
        while (this.fpsSamples.length > 15) this.fpsSamples.shift();
        let weightedFps = 0;
        let weightedFpsWeight = 0;
        for (let i = 0; i < this.fpsSamples.length; i++) {
            const weight = i / this.fpsSamples.length * Math.max(1, 60 - this.fpsSamples[i]);
            weightedFps += this.fpsSamples[i] * weight;
            weightedFpsWeight += weight;
        }
        weightedFps /= weightedFpsWeight;
        this.fpsSampleTime++;

        if (this.fpsSampleTime > 15) {
            this.fpsSampleTime = 0;
            if (weightedFps < DYN_RES_STEP_DOWN_FPS) {
                this.dynResolutionScale -= DYN_RES_STEP;
            }
            if (weightedFps >= DYN_RES_STEP_UP_FPS) {
                this.dynResolutionScale += DYN_RES_STEP;
            }
            this.dynResolutionScale = Math.max(MIN_DYN_RES_SCALE, Math.min(MAX_DYN_RES_SCALE, this.dynResolutionScale));
        }

        const fboWidth = ctx.viewport[0] * ctx.viewportScale * this.dynResolutionScale;
        const fboHeight = ctx.viewport[1] * ctx.viewportScale * this.dynResolutionScale;
        gl.viewport(0, 0, fboWidth, fboHeight);

        if (this.composite.shape[0] !== fboWidth || this.composite.shape[1] !== fboHeight) {
            this.composite.shape = [fboWidth, fboHeight];
            this.final.shape = [fboWidth, fboHeight];
        }

        this.composite.bind();

        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        this.pointLights = [];
    }

    present(ctx: FrameContext): void {
        this.final.bind();
        this.ctx.gl.clearColor(this.backgroundColor[0], this.backgroundColor[1], this.backgroundColor[2], this.backgroundColor[3]);
        this.ctx.gl.clear(this.ctx.gl.COLOR_BUFFER_BIT | this.ctx.gl.DEPTH_BUFFER_BIT);

        this.ctx.gl.blendFuncSeparate(this.ctx.gl.ONE, this.ctx.gl.ONE, this.ctx.gl.ONE, this.ctx.gl.ONE);
        this.ctx.gl.disable(this.ctx.gl.DEPTH_TEST);

        this.composite.color[0].bind(0);
        this.composite.color[1].bind(1);
        this.composite.color[2].bind(2);

        this.quad.bind();
        this.ctx.shaders.deferredAmbientLight.bind();
        this.ctx.shaders.deferredAmbientLight.uniforms.u_light_color = [0.2, 0.5, 1, 1];
        this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 4);

        this.ctx.shaders.deferredDirectionalLight.bind();
        this.ctx.shaders.deferredDirectionalLight.uniforms.u_light_color = [1, 1, 1, 2];
        this.ctx.shaders.deferredDirectionalLight.uniforms.u_light_dir = [
            Math.cos(ctx.time / 2),
            Math.sin(ctx.time / 2),
            3,
        ];
        this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 4);

        this.ctx.shaders.deferredPointLight.bind();
        this.ctx.shaders.deferredPointLight.uniforms.u_proj = ctx.proj;
        this.ctx.shaders.deferredPointLight.uniforms.u_view = ctx.view;
        this.ctx.shaders.deferredPointLight.uniforms.u_viewport_size = this.final.shape;
        for (const light of this.pointLights) {
            this.ctx.shaders.deferredPointLight.uniforms.u_light_pos = light.pos as vec3;
            this.ctx.shaders.deferredPointLight.uniforms.u_light_color = light.color as vec4;
            this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 4);
        }

        this.ctx.gl.bindFramebuffer(this.ctx.gl.FRAMEBUFFER, null);
        this.final.color[0].bind(0);
        this.ctx.shaders.deferredFinal.bind();
        this.ctx.gl.viewport(0, 0, ctx.viewport[0] * ctx.viewportScale, ctx.viewport[1] * ctx.viewportScale);
        this.quad.draw(this.ctx.gl.TRIANGLE_STRIP, 4);

        this.quad.unbind();
        this.ctx.gl.enable(this.ctx.gl.DEPTH_TEST);
    }

    dispose(): void {
        this.final.dispose();
        this.composite.dispose();
        this.quad.dispose();
    }
}
