import {
    BackingContextType,
    IBackingContext,
    ITileMap,
    NetgardensRenderer,
} from '../typedefs';
import { Camera } from '../camera';
import { Context, Disposable, FrameContext, SharedContextData } from './context';
import { WebGLContext } from './typedefs';
import { initShaders } from './shaders';
import { isWebGL2 } from './gl-utils';
import { TilesetMapping } from './tile-map-tileset';
import { TileMap } from './tile-map';
import { vec2 } from 'gl-matrix';
import { Composite } from './composite';

export type WebGLGraphicsSettings = {
    useWebGL2?: boolean,
    useFboFloat?: 'none' | 'half' | 'full',
    useFloatNormals?: boolean,
    useLinearNormals?: boolean,
    enablePointLights?: boolean,
    useMacrotiles?: boolean,
    debug?: { [k: string]: unknown },
};
const DEFAULT_SETTINGS: WebGLGraphicsSettings = {
    useWebGL2: true,
    useFboFloat: 'half',
    useFloatNormals: false,
    useLinearNormals: false,
    enablePointLights: true,
    useMacrotiles: false,
};

export class NetgardensWebGLRenderer implements NetgardensRenderer {
    backingContext: IBackingContext;
    private _map: ITileMap;
    camera: Camera;
    settings: WebGLGraphicsSettings;
    ctx!: Context;

    composite!: Composite;
    tilesetMapping!: TilesetMapping;
    tileMap!: TileMap;

    constructor(context: IBackingContext, map: ITileMap, settings: WebGLGraphicsSettings) {
        this.backingContext = context;
        this._map = map;
        this.camera = new Camera();
        this.settings = { ...DEFAULT_SETTINGS, ...settings };
    }

    get map() {
        return this._map;
    }
    set map(map) {
        this._map = map;
        this.deleteAllObjects();
    }

    private deleteAllObjects() {
        this.tilesetMapping?.dispose();
        this.tileMap?.dispose();
    }

    private didInit = false;
    initCtx() {
        this.deleteAllObjects();
        const settings = this.settings;

        if (!this.backingContext.createContext(settings.useWebGL2
            ? BackingContextType.WebGL2OrWebGL
            : BackingContextType.WebGL)) {
            throw new Error('Could not acquire WebGL context');
        }

        const gl = this.backingContext.context as WebGLContext;
        const gl2 = isWebGL2(gl)
            ? gl as WebGL2RenderingContext
            : null;

        const debugInfoExt = gl.getExtension('WEBGL_debug_renderer_info');

        const params = {
            fboHalfFloat: (settings.useFboFloat === 'half' || settings.useFboFloat === 'full') && (gl2
                ? !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float')
                : !!gl.getExtension('EXT_color_buffer_half_float') && !!gl.getExtension('OES_texture_half_float')),
            fboFloat: (settings.useFboFloat === 'full') && (gl2
                ? !!gl.getExtension('EXT_color_buffer_float')
                : !!gl.getExtension('WEBGL_color_buffer_float')),
            halfFloatLinear: !!gl.getExtension('OES_texture_float_linear') || !!gl.getExtension('OES_texture_half_float_linear'),
            floatLinear: !!gl.getExtension('OES_texture_float_linear'),

            useFloatNormals: !!settings.useFloatNormals,
            useLinearNormals: !!settings.useLinearNormals,
            enablePointLights: !!settings.enablePointLights,
            useMacrotiles: !!settings.useMacrotiles,
            debug: settings.debug,
        };

        const info = {
            version: gl.getParameter(gl.VERSION),
            renderer: debugInfoExt
                ? gl.getParameter(debugInfoExt.UNMASKED_RENDERER_WEBGL)
                : gl.getParameter(gl.RENDERER),
            ...params,
        };

        let debugInfo = 'Initializing Netgardens WebGL Context';
        // @ts-ignore
        for (const k in info) debugInfo += `\n${k}: ${info[k]}`;
        console.debug(debugInfo);

        gl.clearColor(0, 0, 0, 1);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.BLEND);

        this.ctx = {
            gl,
            gl2,
            shaders: initShaders(gl, params),
            params,
            getShared: this.getShared,
        };

        this.tilesetMapping = new TilesetMapping(this.ctx, this.map);
        this.tileMap = new TileMap(this.ctx, this.map, this.tilesetMapping);
        this.composite = new Composite(this.ctx);
        this.didInit = true;
    }

    sharedContextData = new Map();
    getShared = <T extends Disposable> (k: SharedContextData<T>) => {
        if (!this.sharedContextData.has(k.name)) {
            this.sharedContextData.set(k.name, k.init(this.ctx));
        }
        return this.sharedContextData.get(k.name);
    };

    lastTime = Date.now();
    time = 0;

    beginFrame(): FrameContext {
        if (!this.didInit || this.backingContext.isContextLost()) {
            this.initCtx();
        }

        const viewportSize = vec2.fromValues(this.backingContext.width, this.backingContext.height);

        const projection = this.camera.getProjection(viewportSize[0], viewportSize[1]);
        const view = this.camera.getView();

        return {
            proj: projection,
            view,
            viewport: viewportSize,
            viewportScale: this.backingContext.pixelScale,
            camera: this.camera,
            time: this.time,
        };
    }

    render() {
        const dt = Math.min(1 / 30, (Date.now() - this.lastTime) / 1000);
        this.time += dt;
        this.lastTime = Date.now();

        const ctx = this.beginFrame();

        this.tileMap.update(ctx);

        this.composite.begin(ctx);
        this.tileMap.render(ctx);
        this.composite.present(ctx);
    }

    capture() {
        const ctx = this.beginFrame();
        this.composite.begin(ctx);
        this.tileMap.render(ctx);
        let size: [number, number] | undefined;
        let pixels: Float32Array | undefined;
        this.composite.present(ctx, (s, p) => {
            size = s;
            pixels = p;
        });
        return { size: size!, pixels: pixels! };
    }

    dispose() {
        this.deleteAllObjects();
    }
}
