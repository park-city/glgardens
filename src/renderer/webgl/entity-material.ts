import { Context } from './context';
import { Texture2D } from './texture-allocator';
import { EntityTextureLayer, IEntityMaterial } from '../typedefs';
import { TextureFormat } from './typedefs';

let noneTexture: HTMLCanvasElement | null = null;
function createNoneTexture() {
    if (!noneTexture) {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        c.getContext('2d')!.fillRect(0, 0, 1, 1);
        noneTexture = c;
    }
    return noneTexture;
}

export class EntityMaterial {
    ctx: Context;
    source: IEntityMaterial;
    texColor?: Texture2D;
    texMaterial?: Texture2D;

    constructor(ctx: Context, source: IEntityMaterial) {
        this.ctx = ctx;
        this.source = source;
    }

    ensureAvailable() {
        if (!this.texColor) {
            const tex = Texture2D.tryCreate(this.ctx.gl, TextureFormat.RGBA8, this.source.pixelSize[0], this.source.pixelSize[1]);
            if (!tex) throw new Error('Could not allocate texture');
            this.texColor = tex;
            const source = this.source.getTexture(EntityTextureLayer.Color) || createNoneTexture();
            tex.update(0, source);
        }
        if (!this.texMaterial) {
            const tex = Texture2D.tryCreate(this.ctx.gl, TextureFormat.RGBA8, this.source.pixelSize[0], this.source.pixelSize[1]);
            if (!tex) throw new Error('Could not allocate texture');
            this.texMaterial = tex;
            const source = this.source.getTexture(EntityTextureLayer.Material) || createNoneTexture();
            tex.update(0, source);
        }
    }

    update() {
        if (this.texColor) {
            this.texColor.bind(0);
            const source = this.source.getTexture(EntityTextureLayer.Color) || createNoneTexture();
            this.texColor.update(0, source);
        }
        if (this.texMaterial) {
            this.texMaterial.bind(2);
            const source = this.source.getTexture(EntityTextureLayer.Material) || createNoneTexture();
            this.texMaterial.update(0, source);
        }
    }

    invalidate() {
        this.texColor?.dispose();
        this.texMaterial?.dispose();
    }

    dispose() {
        this.invalidate();
    }
}
