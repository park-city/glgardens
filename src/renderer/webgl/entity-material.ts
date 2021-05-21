import { Context } from './context';
import { Texture2D } from './texture-allocator';
import { EntityTextureLayer, IEntityMaterial } from '../typedefs';
import { TextureFormat } from './typedefs';

function createNoneTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    c.getContext('2d')!.fillRect(0, 0, 1, 1);
    return c;
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

    dispose() {
        this.texColor?.dispose();
        this.texMaterial?.dispose();
    }
}
