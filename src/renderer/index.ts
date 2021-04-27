import { Camera } from './camera';
import { initShaders, Shaders } from './shaders';
import { TileMapData } from './map-data';
import { TileResources } from './tile-resources';
import { TileMap } from './map';
import { vec2, vec4 } from 'gl-matrix';
import { Compositor, Context } from './context';
import { ForwardCompositor } from './forward-compositor';
import { DeferredCompositor } from './deferred-compositor';

export interface ICanvas {
    width: number;
    height: number;
    /** Canvas pixel to CSS pixel ratio. Avoid using fractional values. */
    dpiScale: number;
    gl: WebGLRenderingContext;
}

/**
 * Netgardens WebGL Renderer.
 */
export class WebGLRenderer {
    canvas: ICanvas;
    camera = new Camera();
    /** GL shaders. */
    shaders!: Shaders;
    ctx!: Context;
    compositor: Compositor;

    resources: TileResources;
    map: TileMap;

    constructor(canvas: ICanvas, data: TileMapData) {
        this.canvas = canvas;

        this.initCtx();

        this.resources = new TileResources(this.ctx);
        this.map = new TileMap(this.ctx, this.resources, data);

        if (DeferredCompositor.isAvailable(this.ctx.gl)) {
            this.compositor = new DeferredCompositor(this.ctx);
        } else {
            this.compositor = new ForwardCompositor(this.ctx);
        }
    }

    get gl() {
        return this.canvas.gl;
    }

    setCompositor(factory: { new (ctx: Context): Compositor }) {
        this.compositor.dispose();
        this.compositor = new factory(this.ctx);
    }

    initCtx() {
        const { gl } = this;
        gl.clearColor(0, 0, 0, 0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.BLEND);

        let vendor = 'unknown';
        let renderer = 'unknown';
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
            renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        }
        const floatBufAvailable = !!gl.getExtension('WEBGL_color_buffer_float');
        gl.getExtension('WEBGL_draw_buffers');

        console.debug(`Init Netgardens WebGL Renderer (${vendor}/${renderer})\nfloat buffer: ${floatBufAvailable}`);

        this.shaders = initShaders(gl);

        this.ctx = {
            gl: this.gl,
            shaders: this.shaders,
        };
    }

    setBackgroundColor(r: number, g: number, b: number, a: number) {
        const iGamma = 1 / 2.2;
        this.compositor.backgroundColor = vec4.fromValues(r ** iGamma, g ** iGamma, b ** iGamma, a);
    }

    lastTime = Date.now();
    time = 0;
    render() {
        const dt = (Date.now() - this.lastTime) / 1000;
        this.time += dt;
        this.lastTime = Date.now();

        const projection = this.camera.getProjection(this.canvas.width, this.canvas.height);
        const view = this.camera.getView();

        const frameCtx = {
            proj: projection,
            view,
            viewport: vec2.fromValues(this.canvas.width, this.canvas.height),
            viewportScale: this.canvas.dpiScale,
            camera: this.camera,
            time: this.time,
            compositor: this.compositor,
        };

        this.compositor.beginFrame(frameCtx);
        this.map.render(frameCtx);
        this.compositor.present(frameCtx);
    }

    dispose() {
        this.compositor.dispose();
        this.resources.dispose();
        this.map.dispose();
        this.shaders.dispose();
    }
}
