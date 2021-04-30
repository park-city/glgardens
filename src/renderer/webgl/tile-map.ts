import { mat4, vec2, vec3, vec4 } from 'gl-matrix';
import { Context, FrameContext } from './context';
import { ITileMap, TileTypeId } from '../typedefs';
import { distanceToBox, invSquareDistance, PlaneSubspace } from '../geom-utils';
import { TileMapChunk, CHUNK_SIZE } from './tile-map-chunk';
import { TilesetMapping } from './tile-map-tileset';
import { GLUniformBuffer } from './gl-buffer';
import { UNIFORM_BLOCKS } from './shaders';

const CHUNK_GC_INTERVAL_MS = 5 * 1000;
const MAX_VIEW_RADIUS = 10;
const CHUNK_CREATION_TIME_BUDGET = 1 / 60;
const CHUNK_LIGHTING_SAMPLE_RADIUS = 2;
const MAX_CHUNK_LIGHTS = 16; // TODO: raise limit
const LIGHT_CULL_EPSILON = 0.3;

type ChunkEntry = {
    chunk: TileMapChunk,
    lastRender: number,
    lightingNeedsUpdate: boolean,
};

type MapUniformBuffers = {
    camera: GLUniformBuffer,
    lighting: GLUniformBuffer,
};

export class TileMap {
    ctx: Context;
    data: ITileMap;
    tilesetMapping: TilesetMapping;

    chunks = new Map();
    uniformBuffers?: MapUniformBuffers;

    ambientLightRadiance = vec3.fromValues(0, 0, 0);
    sunLightDir = vec3.fromValues(0, 0, 1);
    sunLightRadiance = vec3.fromValues(0, 0, 0);

    constructor(ctx: Context, data: ITileMap, tilesetMapping: TilesetMapping) {
        this.ctx = ctx;
        this.data = data;
        this.tilesetMapping = tilesetMapping;

        data.addMapUpdateListener(this.onMapUpdate);
        data.addTilesetUpdateListener(this.onTilesetUpdate);
    }

    // EVENTS
    private getTileset = (id: TileTypeId) => this.tilesetMapping.getTileset(id);

    private onMapUpdate = (x: number, y: number, w: number, h: number) => {
        this.signalTileUpdates(x, y, w, h);
    };

    private onTilesetUpdate = () => {
        for (const _chunk of this.chunks.values()) {
            const chunk = _chunk as ChunkEntry;
            if (chunk.chunk.isMissingTileTypes) {
                chunk.chunk.buffersNeedUpdate = true;
            }
        }
    };

    // BUFFERS
    buffersNeedUpdate = true;

    deleteBuffers() {
        this.uniformBuffers?.camera.dispose();
        this.uniformBuffers?.lighting.dispose();
        this.uniformBuffers = undefined;
    }

    createBuffers() {
        if (this.uniformBuffers) this.deleteBuffers();

        if (this.ctx.gl2) {
            const gl = this.ctx.gl2;
            const camera = new GLUniformBuffer(gl, UNIFORM_BLOCKS.camera);
            const lighting = new GLUniformBuffer(gl, UNIFORM_BLOCKS.globalLighting);
            this.uniformBuffers = { camera, lighting };
        }

        this.buffersNeedUpdate = false;
    }

    updateBuffers(ctx: FrameContext) {
        if (!this.uniformBuffers) return;

        this.uniformBuffers.camera.bind();
        this.uniformBuffers.camera.setUniformData({
            proj: ctx.proj,
            view: ctx.view,
            pos: ctx.camera.position,
        });

        this.uniformBuffers.lighting.bind();
        this.uniformBuffers.lighting.setUniformData({
            ambient_radiance: this.ambientLightRadiance,
            sun_dir: this.sunLightDir,
            sun_radiance: this.sunLightRadiance,
        });
    }

    // CHUNK UPDATES

    private static encodeChunkKey(x: number, y: number) {
        return `${x},${y}`;
    }

    signalTileUpdates(x: number, y: number, width: number, height: number) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cx2 = Math.floor((x + width) / CHUNK_SIZE);
        const cy2 = Math.floor((y + height) / CHUNK_SIZE);
        for (let y = cy; y <= cy2; y++) {
            for (let x = cx; x <= cx2; x++) {
                const key = TileMap.encodeChunkKey(x, y);
                const chunk = this.chunks.get(key) as ChunkEntry | null;
                if (chunk) chunk.chunk.buffersNeedUpdate = true;
            }
        }
    }

    private markChunkAsFirstScreen(cx: number, cy: number) {
        const key = TileMap.encodeChunkKey(cx, cy);
        const chunk = this.chunks.get(key) as ChunkEntry | null;
        if (chunk) {
            chunk.chunk.isFirstScreen = true;
        }
    }

    /** Deletes chunks that haven't been used in a while. */
    private purgeOldChunks(maxAgeMs: number) {
        for (const [key, chunk] of [...this.chunks.entries()]) {
            if (chunk.lastRender < Date.now() - maxAgeMs) {
                chunk.chunk.dispose();
                this.chunks.delete(key);
            }
        }
    }

    getChunkData(cx: number, cy: number) {
        const x = cx * CHUNK_SIZE;
        const y = cy * CHUNK_SIZE;
        return (dx: number, dy: number) => this.data.getTile(x + dx, y + dy);
    }

    createChunk(x: number, y: number) {
        const key = TileMap.encodeChunkKey(x, y);
        const chunk = new TileMapChunk(this.ctx, this.getChunkData(x, y), this.getTileset);
        mat4.translate(chunk.transform, chunk.transform, [x * CHUNK_SIZE, y * CHUNK_SIZE, 0]);
        this.chunks.set(key, {
            chunk,
            lastRender: 0,
            lightingNeedsUpdate: false,
        } as ChunkEntry);
    }

    // LIGHTING

    chunkDidUpdateLights(x: number, y: number) {
        for (let dy = -CHUNK_LIGHTING_SAMPLE_RADIUS; dy <= CHUNK_LIGHTING_SAMPLE_RADIUS; dy++) {
            for (let dx = -CHUNK_LIGHTING_SAMPLE_RADIUS; dx <= CHUNK_LIGHTING_SAMPLE_RADIUS; dx++) {
                const key = TileMap.encodeChunkKey(x + dx, y + dy);
                const chunk = this.chunks.get(key) as ChunkEntry | null;
                if (chunk) {
                    chunk.lightingNeedsUpdate = true;
                }
            }
        }
    }

    getCulledPointLights(x: number, y: number, targetX: number, targetY: number) {
        const key = TileMap.encodeChunkKey(x, y);
        const chunk = this.chunks.get(key) as ChunkEntry | null;
        if (!chunk) return [];
        const lights = [];
        for (const light of chunk.chunk.pointLights) {
            const radianceMag = Math.max(light.radiance[0], light.radiance[1], light.radiance[2]);
            const epsilonDist = invSquareDistance(LIGHT_CULL_EPSILON / radianceMag);
            const lightDistGround = distanceToBox(
                targetX * CHUNK_SIZE,
                targetY * CHUNK_SIZE,
                (targetX + 1) * CHUNK_SIZE,
                (targetY + 1) * CHUNK_SIZE,
                light.pos[0],
                light.pos[1],
            );
            if (lightDistGround < epsilonDist) {
                lights.push(light);
            }
        }
        return lights;
    }

    updateChunkLighting(x: number, y: number) {
        const key = TileMap.encodeChunkKey(x, y);
        const chunk = this.chunks.get(key) as ChunkEntry | null;
        if (!chunk) return;

        chunk.chunk.externalPointLights.clear();
        let lights = 0;
        outer:
        for (let dy = -CHUNK_LIGHTING_SAMPLE_RADIUS; dy <= CHUNK_LIGHTING_SAMPLE_RADIUS; dy++) {
            for (let dx = -CHUNK_LIGHTING_SAMPLE_RADIUS; dx <= CHUNK_LIGHTING_SAMPLE_RADIUS; dx++) {
                if (dx === 0 && dy === 0) continue;
                if (lights > MAX_CHUNK_LIGHTS) break outer;
                const chunkLights = this.getCulledPointLights(x + dx, y + dy, x, y);
                for (const light of chunkLights) {
                    chunk.chunk.externalPointLights.add(light);
                }
                lights += chunkLights.length;
            }
        }
        chunk.chunk.updateLighting();
        chunk.lightingNeedsUpdate = false;
    }

    // RENDERING

    renderChunk(x: number, y: number, ctx: FrameContext) {
        const key = TileMap.encodeChunkKey(x, y);
        const chunk = this.chunks.get(key)! as ChunkEntry;
        chunk.lastRender = Date.now();
        return chunk.chunk.render(ctx);
    }

    lastGcTime = Date.now();
    render(ctx: FrameContext) {
        if (this.buffersNeedUpdate) {
            this.createBuffers();
        }

        // compute view position
        const screenToWorld = (point: vec2, z = 0) => {
            const mapPlane = new PlaneSubspace(
                vec4.fromValues(0, 0, z, 1),
                vec3.fromValues(1, 0, 0),
                vec3.fromValues(0, 1, 0),
            );

            const [p, d] = ctx.camera.projectionRay(ctx.viewport, point);
            const result = mapPlane.rayIntersect(p, d);
            if (!result) return null;
            return result[1];
        };

        const centerPoint = screenToWorld([0, 0], 0);
        if (!centerPoint) return;
        const projectAndGetViewRadius = (p: vec2, z: number) => {
            const worldPoint = screenToWorld([-1, -1], z);
            if (!worldPoint) return 0;
            return Math.hypot(worldPoint[0] - centerPoint[0], worldPoint[1] - centerPoint[1]);
        };

        const viewRadius = Math.max(
            projectAndGetViewRadius([-1, -1], 5),
            projectAndGetViewRadius([1, 1], 0),
        );

        const viewChunk = vec2.fromValues(centerPoint[0], centerPoint[1]);
        vec2.scale(viewChunk, viewChunk, 1 / CHUNK_SIZE);
        vec2.floor(viewChunk, viewChunk);
        const radius = Math.min(MAX_VIEW_RADIUS, Math.ceil(viewRadius / CHUNK_SIZE));

        // update chunks
        let renderStart = Date.now();
        let didCreateAChunk = false;

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.hypot(dx, dy) > radius + 1) continue;
                const x = viewChunk[0] + dx;
                const y = viewChunk[1] + dy;
                const key = TileMap.encodeChunkKey(x, y);

                const timeSinceRenderStart = (Date.now() - renderStart) / 1000;
                const canCreate = !didCreateAChunk || timeSinceRenderStart < CHUNK_CREATION_TIME_BUDGET;

                const hasChunk = this.chunks.has(key);
                if (!hasChunk && canCreate) {
                    this.createChunk(x, y);
                    didCreateAChunk = true;
                } else if (!hasChunk) continue;

                const chunk = this.chunks.get(key)! as ChunkEntry;
                const updates = chunk.chunk.update(ctx);

                if (updates.pointLightsDidChange) {
                    this.chunkDidUpdateLights(x, y);
                }
            }
        }

        // update chunk lighting
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.hypot(dx, dy) > radius + 1) continue;
                const x = viewChunk[0] + dx;
                const y = viewChunk[1] + dy;
                const key = TileMap.encodeChunkKey(x, y);
                const chunk = this.chunks.get(key) as ChunkEntry | null;
                if (!chunk) continue;

                if (chunk.lightingNeedsUpdate) {
                    this.updateChunkLighting(x, y);
                }
            }
        }

        // render chunks
        const tileChunkShader = this.ctx.shaders.tileChunk;
        tileChunkShader.bind();
        if (this.uniformBuffers) {
            this.updateBuffers(ctx);
            tileChunkShader.bindUniformBlock('UCamera', this.uniformBuffers.camera);
            tileChunkShader.bindUniformBlock('UGlobalLighting', this.uniformBuffers.lighting);
        } else {
            tileChunkShader.setUniform('u_proj', ctx.proj);
            tileChunkShader.setUniform('u_view', ctx.view);
            tileChunkShader.setUniform('u_camera_pos', ctx.camera.position);
            tileChunkShader.setUniform('u_gl_ambient_radiance', this.ambientLightRadiance);
            tileChunkShader.setUniform('u_gl_sun_dir', this.sunLightDir);
            tileChunkShader.setUniform('u_gl_sun_radiance', this.sunLightRadiance);
        }

        let screenIsEmpty = true;

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.hypot(dx, dy) > radius + 1) continue;
                const x = viewChunk[0] + dx;
                const y = viewChunk[1] + dy;
                const key = TileMap.encodeChunkKey(x, y);
                const chunk = this.chunks.get(key) as ChunkEntry | null;
                if (!chunk) continue;

                const didRender = this.renderChunk(x, y, ctx);
                if (didRender) screenIsEmpty = false;
            }
        }

        if (screenIsEmpty) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.hypot(dx, dy) > radius + 1) continue;
                    this.markChunkAsFirstScreen(viewChunk[0] + dx, viewChunk[1] + dy);
                }
            }
        }

        if (this.lastGcTime < Date.now() - CHUNK_GC_INTERVAL_MS) {
            this.lastGcTime = Date.now();
            this.purgeOldChunks(CHUNK_GC_INTERVAL_MS);
        }
    }

    deleteAllObjects() {
        this.deleteBuffers();

        for (const chunk of this.chunks.values()) {
            chunk.chunk.dispose();
        }
    }

    dispose() {
        this.deleteAllObjects();
        this.data.removeMapUpdateListener(this.onMapUpdate);
        this.data.removeTilesetUpdateListener(this.onTilesetUpdate);
    }
}
