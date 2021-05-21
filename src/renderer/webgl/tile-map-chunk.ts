import { mat4, vec2, vec3, vec4 } from 'gl-matrix';
import { Context, FrameContext } from './context';
import { createTileGeometry, GeometryOutput, TileGeometryInfo } from './tile-geometry';
import { PointLight, TileType, TileTypeId } from '../typedefs';
import { Tileset } from './tile-map-tileset';
import { GLBuffer, GLBufferType, GLUniformBlockData, GLUniformBuffer } from './gl-buffer';
import { GLVertexArray } from './gl-vao';
import { PlaneSubspace } from '../geom-utils';
import { MAX_POINT_LIGHTS, UNIFORM_BLOCKS } from './shaders';
import { setNormalAlphaBlending } from './gl-utils';
import { TextureArray } from './texture-allocator';
import { Macrotile } from './tile-map-macrotile';

export const CHUNK_SIZE = 8;
const PROJECTION_ANGLE = 60 / 180 * Math.PI;
const TEXTURE_ASPECT = 1;
const LOAD_ANIM_UPDATE_TIME = 6;
const LOAD_ANIM_COMPLETE_TIME = 999;
export const MAX_TOTAL_POINT_LIGHTS = 16;

export type TileMapChunkBatchState = {
    tileset?: Tileset,
    texColor?: TextureArray,
    texNormal?: TextureArray,
    texMaterial?: TextureArray,
};

type ChunkBuffers = {
    vao: GLVertexArray,
    index: GLBuffer,
    aPos: GLBuffer,
    aUv: GLBuffer,
    aTile: GLBuffer,
    aObjPos: GLBuffer,
};

type ChunkUniformBuffers = {
    chunk: GLUniformBuffer,
    lighting: GLUniformBuffer[],
};

export type TileMapChunkData = (cx: number, cy: number) => TileTypeId | null;
export type TileMapChunkTilesetProvider = (id: TileTypeId) => Tileset | null;

type TileRenderChunk = {
    indexPos: number,
    indexCount: number,
    tileset: Tileset,
};

export class TileMapChunk {
    ctx: Context;
    mapData: TileMapChunkData;
    mapTileset: TileMapChunkTilesetProvider;
    transform = mat4.create();

    buffers?: ChunkBuffers;
    uniformBuffers?: ChunkUniformBuffers;
    tileIdCache: (TileTypeId | null)[] = [];
    tileTypeCache: (TileType | null)[] = [];
    tileGeometryInfo: (TileGeometryInfo | null)[] = [];
    tileRenderBatches: TileRenderChunk[] = [];
    pointLights: PointLight[] = [];

    buffersNeedUpdate = false;
    chunkBufferNeedsUpdate = false;
    isMissingTileTypes = false;
    isFirstScreen = false;
    didRenderContentsOnce = false;

    macrotileCache?: Macrotile;

    constructor(ctx: Context, data: TileMapChunkData, tilesetProvider: TileMapChunkTilesetProvider) {
        this.ctx = ctx;
        this.mapData = data;
        this.mapTileset = tilesetProvider;
    }

    createBuffers() {
        if (this.buffers) this.deleteBuffers();

        this.tileIdCache = [];
        this.tileTypeCache = [];
        this.tileGeometryInfo = [];
        this.tileRenderBatches = [];
        this.pointLights = [];
        this.isMissingTileTypes = false;

        const geomOut: GeometryOutput = {
            positions: [],
            uvs: [],
            indices: [],
        };
        const aTileData = [];
        const aObjPosData = [];

        let prevTileset: Tileset | null = null;
        let indexPos = 0;
        let currentRenderBatch: TileRenderChunk | null = null;
        let isCacheable = true;
        let tilesetResolution = 1;

        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const z = 0;
                const tileTypeId = this.mapData(x, y);
                this.tileIdCache.push(tileTypeId);

                if (tileTypeId === null) {
                    this.tileTypeCache.push(null);
                    this.tileGeometryInfo.push(null);
                    continue;
                }

                const tileset = this.mapTileset(tileTypeId);
                if (!tileset) {
                    this.isMissingTileTypes = true;
                    this.tileTypeCache.push(null);
                    this.tileGeometryInfo.push(null);
                    continue;
                }

                const tileType = tileset.getTileType(tileTypeId);
                if (!tileType) {
                    throw new Error('Incorrect mapping of tile sets (corrupt renderer state?)');
                }

                this.tileTypeCache[y * CHUNK_SIZE + x] = tileType;

                if (tileset !== prevTileset) {
                    prevTileset = tileset;
                    if (currentRenderBatch?.indexCount) this.tileRenderBatches.push(currentRenderBatch);
                    currentRenderBatch = {
                        indexPos,
                        indexCount: 0,
                        tileset,
                    };
                }

                const geomInfo = createTileGeometry(geomOut, tileType.geometry, x, y, z, PROJECTION_ANGLE, TEXTURE_ASPECT);
                this.tileGeometryInfo.push(geomInfo);

                indexPos += geomInfo.indexCount;
                currentRenderBatch!.indexCount += geomInfo.indexCount;

                for (let i = 0; i < geomInfo.vertCount; i++) {
                    aTileData.push(0, 0);
                    aObjPosData.push(x, y, z);
                }

                if (tileType.pointLight) {
                    const lightPos = vec4.fromValues(
                        x + tileType.pointLight.pos[0],
                        y + tileType.pointLight.pos[1],
                        z + tileType.pointLight.pos[2],
                        1,
                    );
                    vec4.transformMat4(lightPos, lightPos, this.transform);

                    this.pointLights.push({
                        pos: vec3.fromValues(lightPos[0], lightPos[1], lightPos[2]),
                        radiance: tileType.pointLight.radiance,
                    });
                }

                if (tileType.frames.length > 1) {
                    // animated!
                    isCacheable = false;
                }

                tilesetResolution = Math.max(tilesetResolution, tileset.pixelSize[0] / tileset.size[0]);
                tilesetResolution = Math.max(tilesetResolution, tileset.pixelSize[1] / tileset.size[1]);
            }
        }

        if (currentRenderBatch?.indexCount) this.tileRenderBatches.push(currentRenderBatch);

        const { gl } = this.ctx;
        const index = new GLBuffer(gl, GLBufferType.Element);
        const aPos = new GLBuffer(gl, GLBufferType.Array);
        const aUv = new GLBuffer(gl, GLBufferType.Array);
        const aTile = new GLBuffer(gl, GLBufferType.Array);
        const aObjPos = new GLBuffer(gl, GLBufferType.Array);

        index.bind();
        index.setData(new Uint16Array(geomOut.indices));
        aPos.bind();
        aPos.setData(new Float32Array(geomOut.positions));
        aUv.bind();
        aUv.setData(new Float32Array(geomOut.uvs));
        aTile.bind();
        aTile.setData(new Float32Array(aTileData));
        aObjPos.bind();
        aObjPos.setData(new Float32Array(aObjPosData));

        const vao = new GLVertexArray(gl);
        vao.update(index, [
            { buffer: aPos, size: 3 },
            { buffer: aUv, size: 2 },
            { buffer: aTile, size: 2 },
            { buffer: aObjPos, size: 3 },
        ]);

        this.buffers = { vao, index, aPos, aUv, aTile, aObjPos };

        if (this.ctx.gl2) {
            const gl = this.ctx.gl2;
            const chunk = new GLUniformBuffer(gl, UNIFORM_BLOCKS.chunk);
            this.uniformBuffers = { chunk, lighting: [] };
        }

        if (this.ctx.params.useMacrotiles && isCacheable && !this.macrotileCache) {
            this.macrotileCache = new Macrotile(this.ctx, CHUNK_SIZE, 1);
        } else if (!isCacheable && this.macrotileCache) {
            this.macrotileCache.dispose();
            this.macrotileCache = undefined;
        }
        if (this.macrotileCache) {
            this.macrotileCache.invalidate();
            this.macrotileCache.tilesetResolution = tilesetResolution;
        }

        this.buffersNeedUpdate = false;
        this.chunkBufferNeedsUpdate = true;
        this.didRenderContentsOnce = false;
        this.updateTiles();
    }

    tileAnimations = new Map();

    updateUChunkBuffer() {
        if (!this.uniformBuffers) return;
        const buf = this.uniformBuffers.chunk;
        buf.bind();
        buf.setUniformData({
            transform: this.transform,
            load_anim: this.loadAnim,
        });
        this.chunkBufferNeedsUpdate = false;
    }

    externalPointLights: Set<PointLight> = new Set();
    pointLightUniformValues: { count: number, pos: Float32Array, rad: Float32Array }[] | null = null;

    updateLighting() {
        const allLights = [];
        for (const light of this.pointLights) {
            if (allLights.length >= MAX_TOTAL_POINT_LIGHTS) break;
            allLights.push(light as unknown as GLUniformBlockData);
        }
        for (const light of this.externalPointLights) {
            if (allLights.length >= MAX_TOTAL_POINT_LIGHTS) break;
            allLights.push(light as unknown as GLUniformBlockData);
        }

        // max(1, ..): we need at least 1 lighting buffer (with zero lights) to render the chunk
        const bufferCount = Math.max(1, Math.ceil(allLights.length / MAX_POINT_LIGHTS));

        if (this.uniformBuffers) {
            while (this.uniformBuffers.lighting.length < bufferCount) {
                const buf = new GLUniformBuffer(this.ctx.gl2!, UNIFORM_BLOCKS.chunkLighting);
                this.uniformBuffers.lighting.push(buf);
            }
            while (this.uniformBuffers.lighting.length > bufferCount) {
                const buf = this.uniformBuffers.lighting.pop();
                if (buf) buf.dispose();
            }

            for (let i = 0; i < bufferCount; i++) {
                const startIndex = i * MAX_POINT_LIGHTS;
                const endIndex = Math.min(allLights.length, (i + 1) * MAX_POINT_LIGHTS);

                const buf = this.uniformBuffers.lighting[i];
                buf.bind();
                buf.setUniformData({
                    point_light_count: endIndex - startIndex,
                    point_lights: allLights.slice(startIndex, endIndex),
                });
            }
        } else {
            if (!this.pointLightUniformValues) this.pointLightUniformValues = [];
            while (this.pointLightUniformValues.length < bufferCount) {
                const pos = new Float32Array(MAX_POINT_LIGHTS * 3);
                const rad = new Float32Array(MAX_POINT_LIGHTS * 3);
                this.pointLightUniformValues.push({ count: 0, pos, rad });
            }
            while (this.pointLightUniformValues.length > bufferCount) {
                this.pointLightUniformValues.pop();
            }

            for (let i = 0; i < bufferCount; i++) {
                const startIndex = i * MAX_POINT_LIGHTS;
                const endIndex = Math.min(allLights.length, (i + 1) * MAX_POINT_LIGHTS);

                const entry = this.pointLightUniformValues[i];
                entry.count = endIndex - startIndex;

                for (let j = 0; j < entry.count; j++) {
                    const l = allLights[startIndex + j] as unknown as PointLight;
                    entry.pos[j * 3] = l.pos[0];
                    entry.pos[j * 3 + 1] = l.pos[1];
                    entry.pos[j * 3 + 2] = l.pos[2];
                    entry.rad[j * 3] = l.radiance[0];
                    entry.rad[j * 3 + 1] = l.radiance[1];
                    entry.rad[j * 3 + 2] = l.radiance[2];
                }
            }
        }
        this.macrotileCache?.invalidate();
    }

    updateTiles() {
        if (!this.buffers) return;
        // TODO: use partial updates instead of updating the whole thing every time, maybe
        // (though that might just be a premature optimization...)
        const data = [];
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const tileInfo = this.tileGeometryInfo[y * CHUNK_SIZE + x];
                const tileId = this.tileIdCache[y * CHUNK_SIZE + x];
                const tile = this.tileTypeCache[y * CHUNK_SIZE + x];
                if (!tileInfo || !tile) continue;

                const frames = tile.frames;
                const frame: number = this.tileAnimations.get(tileId) || 0;
                const frameOffset = frames[frame];

                for (let i = 0; i < tileInfo.vertCount; i++) {
                    data.push(frameOffset[0], frameOffset[1]);
                }
            }
        }
        this.buffers.aTile.bind();
        this.buffers.aTile.updateData(0, new Float32Array(data));
    }

    lastTime = -Infinity;
    animationFrameTime = 0;

    advanceAnimationFrame() {
        let hasAnimation = false;
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const tileId = this.tileIdCache[y * CHUNK_SIZE + x];
                const tile = this.tileTypeCache[y * CHUNK_SIZE + x];
                if (tileId === null || !tile) continue;

                const frames = tile.frames;
                if (frames.length <= 1) continue;

                hasAnimation = true;

                if (!this.tileAnimations.has(tileId)) this.tileAnimations.set(tileId, 0);
                let frame: number = this.tileAnimations.get(tileId) || 0;
                frame++;
                if (frame >= frames.length) frame = 0;
                this.tileAnimations.set(tileId, frame);
            }
        }
        return hasAnimation;
    }

    loadAnimOrigin: vec2 | null = null;
    loadAnimTime = LOAD_ANIM_COMPLETE_TIME; // if data exists on first render call, don't animate in

    private getAnimateInOrigin(ctx: FrameContext) {
        const groundPlane = new PlaneSubspace(
            vec4.create(),
            vec3.fromValues(1, 0, 0),
            vec3.fromValues(0, 1, 0),
        );
        const [p, d] = ctx.camera.projectionRay(ctx.viewport, [0, 0]);
        const result = groundPlane.rayIntersect(p, d);
        if (result) {
            this.loadAnimOrigin = vec2.fromValues(result[1][0], result[1][1]);
        } else {
            const worldPosition = vec4.create();
            vec4.transformMat4(worldPosition, worldPosition, this.transform);
            this.loadAnimOrigin = vec2.fromValues(worldPosition[0], worldPosition[1]);
        }
    }

    get loadAnim() {
        return vec4.fromValues(
            this.loadAnimOrigin ? this.loadAnimOrigin[0] : 0,
            this.loadAnimOrigin ? this.loadAnimOrigin[1] : 0,
            this.loadAnimTime,
            this.isFirstScreen ? 1 : 0,
        );
    }

    /** Updates the chunk: creating buffers, advancing animation, etc. */
    update(ctx: FrameContext) {
        const prevPointLights = this.pointLights;

        if (!this.buffers || !this.tileTypeCache || this.buffersNeedUpdate) {
            this.createBuffers();
        }

        const pointLightsDidChange = this.pointLights !== prevPointLights;

        if (this.lastTime === -Infinity) this.lastTime = ctx.time; // first render
        const deltaTime = ctx.time - this.lastTime;
        this.lastTime = ctx.time;

        if (!this.tileRenderBatches.length && !this.buffersNeedUpdate) {
            // no data loaded! reset animation and quit
            this.loadAnimTime = 0;
            this.loadAnimOrigin = null;
            return { pointLightsDidChange };
        }

        // loading animation
        if (!this.loadAnimOrigin) this.getAnimateInOrigin(ctx);
        this.loadAnimTime += deltaTime;
        if (this.loadAnimTime < LOAD_ANIM_UPDATE_TIME) {
            this.chunkBufferNeedsUpdate = true;
        } else {
            this.loadAnimTime = LOAD_ANIM_COMPLETE_TIME;
        }

        if (this.chunkBufferNeedsUpdate) {
            this.updateUChunkBuffer();
        }

        // frame animation
        this.animationFrameTime = Math.max(0, Math.min(1, this.animationFrameTime + deltaTime));
        let hasAnimation = this.buffersNeedUpdate;
        while (this.animationFrameTime > 1 / 24) { // TODO: custom fps
            this.animationFrameTime -= 1 / 24;
            if (this.advanceAnimationFrame()) hasAnimation = true;
        }
        if (hasAnimation) {
            this.updateTiles();
            return { pointLightsDidChange };
        }

        if (this.loadAnimTime >= LOAD_ANIM_UPDATE_TIME && this.macrotileCache
            && !this.macrotileCache.isValid && this.didRenderContentsOnce) {
            // only cache if contents have been rendered before
            // otherwise, updates may be incomplete and some buffers may not exist
            // TODO: have an extra cache pass?
            this.macrotileCache.beginCacheRender();
            this.renderContents();
            this.macrotileCache.finishCacheRender();
        }

        return { pointLightsDidChange };
    }

    /**
     * Renders this chunk.
     * Note that before calling this function, the tileChunk shader must be bound and set up.
     * Returns true if something was rendered.
     */
    render(ctx: FrameContext, batchState?: TileMapChunkBatchState) {
        if (!this.buffers || !this.tileRenderBatches.length) return false;

        if (this.macrotileCache?.isValid) {
            this.renderCached(batchState);
        } else {
            this.renderContents(batchState);
        }
        return true;
    }

    private renderCached(batchState: TileMapChunkBatchState = {}) {
        const macrotileShader = this.ctx.shaders.macrotile;
        macrotileShader.bind();
        if (this.uniformBuffers) {
            macrotileShader.bindUniformBlock('UChunk', this.uniformBuffers.chunk);
        } else {
            macrotileShader.setUniform('u_chunk_transform', this.transform);
        }
        this.macrotileCache?.render();
        if (batchState) {
            batchState.tileset = batchState.texColor = undefined;
        }
        this.ctx.shaders.tileChunk.bind();
    }

    private renderContents(batchState = {}) {
        const { gl } = this.ctx;

        const tileChunkShader = this.ctx.shaders.tileChunk;
        const buffers = this.buffers!;
        buffers.vao.bind();

        let isFirst = true;
        for (const renderBatch of this.tileRenderBatches) {
            if (this.uniformBuffers) {
                if (isFirst) {
                    tileChunkShader.bindUniformBlock('UChunk', this.uniformBuffers.chunk);
                    isFirst = false;
                }

                for (let i = 0; i < this.uniformBuffers.lighting.length; i++) {
                    const isFirst = i === 0;
                    const isLast = i === this.uniformBuffers.lighting.length - 1;
                    const buf = this.uniformBuffers.lighting[i];

                    tileChunkShader.setUniform('u_light_pass_index', i);
                    tileChunkShader.bindUniformBlock('UChunkLighting', buf);
                    this.bindTileset(renderBatch.tileset, batchState);
                    buffers.vao.draw(this.ctx.gl.TRIANGLES, renderBatch.indexPos, renderBatch.indexCount);

                    if (isFirst && !isLast) {
                        // start additive composite
                        gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
                    } else if (!isFirst && isLast) {
                        // complete additive composite
                        setNormalAlphaBlending(gl);
                    }
                }
            } else {
                tileChunkShader.setUniform('u_chunk_transform', this.transform);
                tileChunkShader.setUniform('u_chunk_load_anim', this.loadAnim);

                for (let i = 0; i < this.pointLightUniformValues!.length; i++) {
                    const pointLightU = this.pointLightUniformValues![i];

                    tileChunkShader.setUniform('u_light_pass_index', i);
                    tileChunkShader.setUniform('u_cl_point_light_count', pointLightU.count);
                    tileChunkShader.setUniform('u_cl_point_light_pos', pointLightU.pos);
                    tileChunkShader.setUniform('u_cl_point_light_radiance', pointLightU.rad);
                    this.bindTileset(renderBatch.tileset, batchState);
                    buffers.vao.draw(this.ctx.gl.TRIANGLES, renderBatch.indexPos, renderBatch.indexCount);

                    const isFirst = i === 0;
                    const isLast = i === this.pointLightUniformValues!.length - 1;
                    if (isFirst && !isLast) {
                        // start additive composite
                        gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
                    } else if (!isFirst && isLast) {
                        // complete additive composite
                        setNormalAlphaBlending(gl);
                    }
                }
            }
        }
        buffers.vao.unbind();

        this.didRenderContentsOnce = true;
    }

    private bindTileset(tileset: Tileset, batchState: TileMapChunkBatchState) {
        const tileChunkShader = this.ctx.shaders.tileChunk;
        if (tileset !== batchState.tileset) {
            tileset.ensureAvailable();
            if (tileset.texColor?.array !== batchState.texColor) {
                tileset.texColor!.bind(0);
                batchState.texColor = tileset.texColor?.array;
            }
            if (tileset.texNormal?.array !== batchState.texNormal) {
                tileset.texNormal!.bind(1);
                batchState.texNormal = tileset.texNormal?.array;
            }
            if (tileset.texMaterial?.array !== batchState.texMaterial) {
                tileset.texMaterial!.bind(2);
                batchState.texMaterial = tileset.texMaterial?.array;
            }
            const tilesetSize = tileset.size;
            tileChunkShader.setUniform('u_tileset_params', [
                tilesetSize[0],
                tilesetSize[1],
                tileset.renderIndex,
            ]);
            batchState.tileset = tileset;
        }
    }

    deleteBuffers() {
        if (!this.buffers) return;
        this.buffers.vao.dispose();
        this.buffers.index.dispose();
        this.buffers.aPos.dispose();
        this.buffers.aUv.dispose();
        this.buffers.aTile.dispose();
        this.buffers.aObjPos.dispose();
        this.uniformBuffers?.chunk.dispose();
        for (const buf of (this.uniformBuffers?.lighting || [])) buf.dispose();
        this.uniformBuffers = undefined;
        this.buffers = undefined;
    }

    dispose() {
        this.deleteBuffers();
    }
}
