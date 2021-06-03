import { ITileMap, ITileset, TileTextureLayer, TileType, TileTypeId } from '../typedefs';
import { Context } from './context';
import { TextureAllocator, TextureHandle } from './texture-allocator';
import { TextureFormat } from './typedefs';

export class Tileset {
    ctx: Context;
    allocator: TextureAllocator;
    data: ITileset;
    texColor?: TextureHandle;
    texNormal?: TextureHandle;
    texMaterial?: TextureHandle;

    constructor(ctx: Context, allocator: TextureAllocator, data: ITileset) {
        this.ctx = ctx;
        this.allocator = allocator;
        this.data = data;
    }

    get pixelSize() {
        return this.data.pixelSize;
    }
    get size() {
        return this.data.textureSize;
    }
    get depth() {
        return this.texColor?.depth || 0;
    }
    get renderIndex() {
        return this.texColor?.index || 0;
    }

    getTileType(id: TileTypeId): TileType | null {
        return this.data.getTileType(id);
    }

    get isAvailable() {
        if (!this.texColor?.isAvailable) return false;
        if (!this.texNormal?.isAvailable) return false;
        if (!this.texMaterial?.isAvailable) return false;
        if (this.data.pixelSize[0] !== this.texColor?.size[0]) return false;
        if (this.data.pixelSize[1] !== this.texColor?.size[1]) return false;
        return true;
    }

    ensureAvailable() {
        if (!this.isAvailable) {
            this.allocate();
        }
    }

    allocate() {
        this.deallocate();

        const normalTexFormat = this.ctx.params.useFloatNormals
            ? TextureFormat.RGBA16F : TextureFormat.RGBA8;

        const allocated = this.allocator.parallelAllocate([
            [this.data.pixelSize[0], this.data.pixelSize[1], TextureFormat.RGBA8],
            [this.data.pixelSize[0], this.data.pixelSize[1], normalTexFormat],
            [this.data.pixelSize[0], this.data.pixelSize[1], TextureFormat.RGBA8],
        ]);
        this.texColor = allocated[0];
        this.texNormal = allocated[1];
        this.texMaterial = allocated[2];
        const color = this.data.getTexture(TileTextureLayer.Color);
        const normal = this.data.getTexture(TileTextureLayer.Normal);
        const material = this.data.getTexture(TileTextureLayer.Material);
        if (color) this.texColor.update(color);
        if (normal) this.texNormal.update(normal);
        if (material) this.texMaterial.update(material);

        if (this.ctx.params.useLinearNormals && (!this.ctx.params.useFloatNormals || this.ctx.params.halfFloatLinear)) {
            this.texNormal.array.setMagFilter(this.ctx.gl.LINEAR);
        }
    }

    deallocate() {
        this.texColor?.dispose();
        this.texNormal?.dispose();
        this.texMaterial?.dispose();
    }

    dispose() {
        this.deallocate();
    }
}

export class TilesetMapping {
    ctx: Context;
    map: ITileMap;
    tilesets: Tileset[] = [];
    mapping = new Map();
    allocator: TextureAllocator;
    isDeleted = false;

    constructor(ctx: Context, map: ITileMap) {
        this.ctx = ctx;
        this.map = map;
        this.allocator = new TextureAllocator(ctx);
    }

    getTileset(tileTypeId: TileTypeId, emitRequest: boolean = true): Tileset | null {
        if (emitRequest && !this.mapping.has(tileTypeId)) {
            const set = this.map.getTileset(tileTypeId);
            if (set) this.addTileset(set);
        }
        if (this.mapping.has(tileTypeId)) {
            return this.tilesets[this.mapping.get(tileTypeId)];
        }
        return null;
    }

    addTileset(set: ITileset) {
        for (const tileset of this.tilesets) {
            if (tileset.data === set) return;
        }
        const tileset = new Tileset(this.ctx, this.allocator, set);
        const id = this.tilesets.length;
        this.tilesets.push(tileset);

        for (const type of set.tileTypes) {
            this.mapping.set(type, id);
        }
    }

    updateTileset(set: ITileset) {
        for (let i = 0; i < this.tilesets.length; i++) {
            const tileset = this.tilesets[i];
            if (tileset.data === set) {
                // will be reloaded on next render
                tileset.deallocate();

                let maybeDelete = new Set();
                for (const [k, v] of this.mapping) {
                    if (v === i) maybeDelete.add(k);
                }
                // reload mappings
                for (const type of set.tileTypes) {
                    maybeDelete.delete(type);
                    this.mapping.set(type, i);
                }
                for (const type of maybeDelete) this.mapping.delete(type);
            }
        }
    }

    dispose() {
        for (const tileset of this.tilesets) {
            tileset.dispose();
        }
        this.isDeleted = true;
    }
}
