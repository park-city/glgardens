import { Context } from './context';
import { TileIdMapping, TileSetLayer, TileSetLayers } from './map-data';
import { vec2, vec3, vec4 } from 'gl-matrix';
import createTexture, { GLTexture } from 'gl-texture2d';

export class TileSet {
    ctx: Context;
    layers: TileSetLayers;
    size: vec2;
    mapping: TileIdMapping;
    textures: { [name: string]: GLTexture | undefined } = {};

    constructor(ctx: Context, layers: TileSetLayers, size: vec2, mapping: TileIdMapping) {
        this.ctx = ctx;
        this.layers = layers;
        this.size = size;
        this.mapping = mapping;
    }

    /**
     * Returns the WebGL texture for the given attachment layer in this tile set.
     * Will return an empty texture if there is no data.
     * @param layer the attachment layer
     */
    getTexture(layer: TileSetLayer): GLTexture {
        if (!this.textures[layer]) {
            let texture;
            if (this.layers[layer]) {
                texture = createTexture(this.ctx.gl, this.layers[layer]!);
            } else {
                texture = createTexture(this.ctx.gl, [2, 2]);
            }
            this.textures[layer] = texture;
            try {
                texture.generateMipmap();
                texture.minFilter = this.ctx.gl.LINEAR_MIPMAP_LINEAR;
            } catch {
                console.debug('Texture mip generation for failed; using linear min filter');
                texture.minFilter = this.ctx.gl.LINEAR;
            }
        }
        return this.textures[layer]!;
    }

    /**
     * Returns the set of animation frame coordinates for the given tile id.
     * Will return nonsense if the tile id is not mapped.
     * @param tileId the tile id
     */
    getFrames(tileId: number): vec2[] {
        if (this.mapping[tileId]) return this.mapping[tileId].frames;
        // no data! return nonsense coordinates that are visibly nonsense
        return [[-0.5, -0.5]];
    }

    getType(tileId: number): string {
        if (this.mapping[tileId]) return this.mapping[tileId].type || '';
        return '';
    }

    getPointLight(tileId: number): [vec3, vec4] | null {
        if (this.mapping[tileId]) return this.mapping[tileId].pointLight || null;
        return null;
    }

    dispose() {
        for (const tex of Object.values(this.textures)) {
            tex?.dispose();
        }
    }
}

/**
 * This tile set will render purple and black artifacts to indicate that a requested tile set could
 * not be retrieved.
 */
export class ErrorTileSet extends TileSet {
    constructor(ctx: Context) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const c = canvas.getContext('2d')!;
        c.fillStyle = '#000';
        c.fillRect(0, 0, 128, 128);
        c.fillStyle = '#f0f';
        c.fillRect(0, 0, 64, 64);
        c.fillRect(64, 64, 64, 64);
        super(ctx, canvas as any, [1, 1], {});
    }
}

export class TileResources {
    ctx: Context;
    tileSets: { [name: string]: TileSet | undefined } = {};

    constructor(ctx: Context) {
        this.ctx = ctx;
    }

    addTileSet(name: string, layers: TileSetLayers, size: vec2, mapping: TileIdMapping) {
        this.tileSets[name] = new TileSet(this.ctx, layers, size, mapping);
    }

    getTileSet(name: string) {
        return this.tileSets[name];
    }

    dispose() {
        for (const name in this.tileSets) {
            this.tileSets[name]?.dispose();
        }
    }
}
