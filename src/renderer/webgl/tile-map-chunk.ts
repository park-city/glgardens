import { mat4, vec2, vec3, vec4 } from 'gl-matrix';
import { Context, FrameContext } from './context';
import { createTileGeometry, GeometryOutput, TileGeometryInfo } from './tile-geometry';
import { PointLight, TileType, TileTypeId } from '../typedefs';
import { Tileset } from './tile-map-tileset';
import { GLBuffer, GLBufferType, GLUniformBlockData, GLUniformBuffer } from './gl-buffer';
import { GLVertexArray } from './gl-vao';
import { PlaneSubspace } from '../geom-utils';
import { UNIFORM_BLOCKS } from './shaders';

export const CHUNK_SIZE = 8;
const PROJECTION_ANGLE = 60 / 180 * Math.PI;
const TEXTURE_ASPECT = 1;

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
    lighting: GLUniformBuffer,
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
    isMissingTileTypes = false;
    isFirstScreen = false;

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

        // TODO: sort by tile set if OIT is enabled
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
                    aObjPosData.push(x, y);
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
            { buffer: aObjPos, size: 2 },
        ]);

        this.buffers = { vao, index, aPos, aUv, aTile, aObjPos };

        if (this.ctx.gl2) {
            const gl = this.ctx.gl2;
            const chunk = new GLUniformBuffer(gl, UNIFORM_BLOCKS.chunk);
            const lighting = new GLUniformBuffer(gl, UNIFORM_BLOCKS.chunkLighting);
            this.uniformBuffers = { chunk, lighting };
        }

        this.buffersNeedUpdate = false;
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
    }

    externalPointLights: Set<PointLight> = new Set();
    pointLightUniformValues: { count: number, pos: Float32Array, rad: Float32Array } | null = null;

    updateLighting() {
        // TODO: support for more than 16 lights
        const allLights = [];
        for (const light of this.pointLights) {
            if (allLights.length >= 16) break;
            allLights.push(light as unknown as GLUniformBlockData);
        }
        for (const light of this.externalPointLights) {
            if (allLights.length >= 16) break;
            allLights.push(light as unknown as GLUniformBlockData);
        }

        if (this.uniformBuffers) {
            const buf = this.uniformBuffers.lighting;
            buf.bind();

            buf.setUniformData({
                point_light_count: Math.min(allLights.length, 16),
                point_lights: allLights,
            });
        } else {
            const previous = this.pointLightUniformValues;
            const pos = previous?.pos || new Float32Array(16 * 3);
            const rad = previous?.rad || new Float32Array(16 * 3);
            for (let i = 0; i < allLights.length; i++) {
                const l = allLights[i] as unknown as PointLight;
                pos[i * 3] = l.pos[0];
                pos[i * 3 + 1] = l.pos[1];
                pos[i * 3 + 2] = l.pos[2];
                rad[i * 3] = l.radiance[0];
                rad[i * 3 + 1] = l.radiance[1];
                rad[i * 3 + 2] = l.radiance[2];
            }

            this.pointLightUniformValues = { count: allLights.length, pos, rad };
        }
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

    animateInOrigin: vec2 | null = null;
    animateInTime = 999; // if data exists on first render call, don't animate in

    private getAnimateInOrigin(ctx: FrameContext) {
        const groundPlane = new PlaneSubspace(
            vec4.create(),
            vec3.fromValues(1, 0, 0),
            vec3.fromValues(0, 1, 0),
        );
        const [p, d] = ctx.camera.projectionRay(ctx.viewport, [0, 0]);
        const result = groundPlane.rayIntersect(p, d);
        if (result) {
            this.animateInOrigin = vec2.fromValues(result[1][0], result[1][1]);
        } else {
            const worldPosition = vec4.create();
            vec4.transformMat4(worldPosition, worldPosition, this.transform);
            this.animateInOrigin = vec2.fromValues(worldPosition[0], worldPosition[1]);
        }
    }

    get loadAnim() {
        return vec4.fromValues(
            this.animateInOrigin ? this.animateInOrigin[0] : 0,
            this.animateInOrigin ? this.animateInOrigin[1] : 0,
            this.animateInTime,
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
            this.animateInTime = 0;
            this.animateInOrigin = null;
            return { pointLightsDidChange };
        }

        // loading animation
        if (!this.animateInOrigin) this.getAnimateInOrigin(ctx);
        this.animateInTime += deltaTime;

        // frame animation
        this.animationFrameTime = Math.max(0, Math.min(1, this.animationFrameTime + deltaTime));
        let hasAnimation = this.buffersNeedUpdate;
        while (this.animationFrameTime > 1 / 24) { // TODO: custom fps
            this.animationFrameTime -= 1 / 24;
            if (this.advanceAnimationFrame()) hasAnimation = true;
        }
        if (hasAnimation) {
            this.updateTiles();
            return { pointLightsDidChange: true };
        }

        return { pointLightsDidChange };
    }

    /**
     * Renders this chunk.
     * Note that before calling this function, the tileChunk shader must be bound and set up.
     * Returns true if something was rendered.
     */
    render(ctx: FrameContext) {
        if (!this.buffers || !this.tileRenderBatches.length) return false;
        const { gl } = this.ctx;

        // shader setup
        const tileChunkShader = this.ctx.shaders.tileChunk;
        // TODO: don't update these every frame
        this.updateUChunkBuffer();
        if (this.uniformBuffers) {
            tileChunkShader.bindUniformBlock('UChunk', this.uniformBuffers.chunk);
            tileChunkShader.bindUniformBlock('UChunkLighting', this.uniformBuffers.lighting);
        } else {
            tileChunkShader.setUniform('u_chunk_transform', this.transform);
            // TODO: check if setting this uniform is even necessary (esp. if animInTime is big)
            tileChunkShader.setUniform('u_chunk_load_anim', this.loadAnim);

            // unfortunately, these have to be reset every time..
            const pointLightU = this.pointLightUniformValues!;
            tileChunkShader.setUniform('u_cl_point_light_count', pointLightU.count);
            tileChunkShader.setUniform('u_cl_point_light_pos', pointLightU.pos);
            tileChunkShader.setUniform('u_cl_point_light_radiance', pointLightU.rad);
        }

        const buffers = this.buffers!;
        buffers.vao.bind();
        for (const renderBatch of this.tileRenderBatches) {
            // TODO: don't rebind textures
            renderBatch.tileset.ensureAvailable();
            renderBatch.tileset.texColor!.bind(0);
            renderBatch.tileset.texNormal!.bind(1);
            renderBatch.tileset.texMaterial!.bind(2);
            const tilesetSize = renderBatch.tileset.size;
            tileChunkShader.setUniform('u_tileset_params', [
                tilesetSize[0],
                tilesetSize[1],
                renderBatch.tileset.renderIndex,
            ]);

            buffers.vao.draw(gl.TRIANGLES, renderBatch.indexPos, renderBatch.indexCount);
        }
        buffers.vao.unbind();

        return true;
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
        this.uniformBuffers?.lighting.dispose();
        this.uniformBuffers = undefined;
        this.buffers = undefined;
    }

    dispose() {
        this.deleteBuffers();
    }
}
