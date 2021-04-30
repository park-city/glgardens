import {
    BackingContextType,
    IBackingContext,
    ITileMap,
    NetgardensRenderer,
} from '../typedefs';
import { Camera } from '../camera';
import { Context } from './context';
import { WebGLContext } from './typedefs';
import { initShaders } from './shaders';
import { isWebGL2 } from './gl-utils';
import { TilesetMapping } from './tile-map-tileset';
import { TileMap } from './tile-map';
import { vec2 } from 'gl-matrix';
import { Composite } from './composite';

export type WebGLGraphicsSettings = {
    useWebGL2: boolean,
    useFboFloat: 'none' | 'half' | 'full',
};
const DEFAULT_SETTINGS: WebGLGraphicsSettings = {
    useWebGL2: true,
    useFboFloat: 'half',
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

    constructor(context: IBackingContext, map: ITileMap, settings = DEFAULT_SETTINGS) {
        this.backingContext = context;
        this._map = map;
        this.camera = new Camera();
        this.settings = settings;
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
        };

        this.tilesetMapping = new TilesetMapping(this.ctx, this.map);
        this.tileMap = new TileMap(this.ctx, this.map, this.tilesetMapping);
        this.composite = new Composite(this.ctx);
        this.didInit = true;
    }

    lastTime = Date.now();
    time = 0;

    render() {
        const dt = Math.min(1 / 30, (Date.now() - this.lastTime) / 1000);
        this.time += dt;
        this.lastTime = Date.now();

        if (!this.didInit || this.backingContext.isContextLost()) {
            this.initCtx();
        }

        const viewportSize = vec2.fromValues(this.backingContext.width, this.backingContext.height);

        const projection = this.camera.getProjection(viewportSize[0], viewportSize[1]);
        const view = this.camera.getView();

        const ctx = {
            proj: projection,
            view,
            viewport: viewportSize,
            viewportScale: this.backingContext.pixelScale,
            camera: this.camera,
            time: this.time,
        };

        this.composite.begin(ctx);
        this.tileMap.render(ctx);
        this.composite.present(ctx);
    }

    dispose() {
        this.deleteAllObjects();
    }
}
