import { mat4, vec2, vec3, vec4 } from 'gl-matrix';
import { Context, FrameContext } from './context';
import { IGlobalLighting, ITileMap, ITileset, PointLight, TileTypeId } from '../typedefs';
import { distanceToBox, invSquareDistance, PlaneSubspace } from '../geom-utils';
import { CHUNK_SIZE, MAX_TOTAL_POINT_LIGHTS, TileMapChunk } from './tile-map-chunk';
import { TilesetMapping } from './tile-map-tileset';
import { GLBufferUsage, GLUniformBuffer } from './gl-buffer';
import { UNIFORM_BLOCKS } from './shaders';

const CHUNK_GC_INTERVAL_MS = 5 * 1000;
const MAX_VIEW_RADIUS = 10;
const CHUNK_CREATION_TIME_BUDGET = 1 / 60;
const CHUNK_LIGHTING_SAMPLE_RADIUS = 2;
const LIGHT_CULL_EPSILON = 0.4;

type ChunkEntry = {
    chunk: TileMapChunk,
    lastUpdate: number,
    lightingNeedsUpdate: boolean,
};

type MapUniformBuffers = {
    camera: GLUniformBuffer,
    lighting: GLUniformBuffer,
};

interface LitEntity {
    position: vec3;
    pointLights: PointLight[];
    lightChunk?: TileMapChunk;
    lightChunkDidUpdate(): void;
}

export class TileMap {
    ctx: Context;
    data: ITileMap;
    tilesetMapping: TilesetMapping;

    chunks = new Map<string, ChunkEntry>();
    uniformBuffers?: MapUniformBuffers;

    lighting: IGlobalLighting;

    litEntities = new Map<unknown, LitEntity>();

    constructor(ctx: Context, data: ITileMap, lighting: IGlobalLighting, tilesetMapping: TilesetMapping) {
        this.ctx = ctx;
        this.data = data;
        this.lighting = lighting;
        this.tilesetMapping = tilesetMapping;

        data.addMapUpdateListener(this.onMapUpdate);
        data.addTilesetUpdateListener(this.onTilesetUpdate);
    }

    // EVENTS
    private getTileset = (id: TileTypeId) => this.tilesetMapping.getTileset(id);

    private onMapUpdate = (x: number, y: number, w: number, h: number) => {
        this.signalTileUpdates(x, y, w, h);
    };

    private onTilesetUpdate = (updates?: ITileset[]) => {
        for (const chunk of this.chunks.values()) {
            if (chunk.chunk.isMissingTileTypes) {
                chunk.chunk.buffersNeedUpdate = true;
            }
        }
        if (updates) {
            // tileset data has been updated!
            for (const chunk of this.chunks.values()) {
                // we need to update *all* chunks because we don't really know what exactly changed
                chunk.chunk.buffersNeedUpdate = true;
            }
            for (const set of updates) this.tilesetMapping.updateTileset(set);
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
            camera.usage = GLBufferUsage.DynamicDraw;
            lighting.usage = GLBufferUsage.DynamicDraw;
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
            ambient_radiance: this.lighting.ambientRadiance,
            sun_dir: this.lighting.sunDir,
            sun_radiance: this.lighting.sunRadiance,
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
                const chunk = this.chunks.get(key);
                if (chunk) chunk.chunk.buffersNeedUpdate = true;
            }
        }
    }

    private markChunkAsFirstScreen(cx: number, cy: number) {
        const key = TileMap.encodeChunkKey(cx, cy);
        const chunk = this.chunks.get(key);
        if (chunk) {
            chunk.chunk.isFirstScreen = true;
        }
    }

    /** Deletes chunks that haven't been used in a while. */
    private purgeOldChunks(maxAgeMs: number) {
        for (const [key, chunk] of [...this.chunks.entries()]) {
            if (chunk.lastUpdate < Date.now() - maxAgeMs) {
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
            lastUpdate: 0,
            lightingNeedsUpdate: false,
        });
    }

    // LIGHTING

    addLitEntity(key: unknown, entity: LitEntity) {
        this.litEntities.set(key, entity);
        this.litEntityDidUpdateLights(entity);
    }

    deleteLitEntity(key: unknown) {
        const entity = this.litEntities.get(key);
        this.litEntities.delete(key);
        if (entity) this.litEntityDidUpdateLights(entity);
    }

    litEntityDidUpdateLights(entity: LitEntity) {
        this.chunkDidUpdateLights(
            Math.floor(entity.position[0] / CHUNK_SIZE),
            Math.floor(entity.position[1] / CHUNK_SIZE),
        );
    }

    chunkDidUpdateLights(x: number, y: number) {
        if ((window as any).ngDebug) console.log(x, y);
        for (let dy = -CHUNK_LIGHTING_SAMPLE_RADIUS; dy <= CHUNK_LIGHTING_SAMPLE_RADIUS; dy++) {
            for (let dx = -CHUNK_LIGHTING_SAMPLE_RADIUS; dx <= CHUNK_LIGHTING_SAMPLE_RADIUS; dx++) {
                const key = TileMap.encodeChunkKey(x + dx, y + dy);
                const chunk = this.chunks.get(key);
                if (chunk) {
                    chunk.lightingNeedsUpdate = true;
                }
            }
        }
    }

    shouldCullPointLight(light: PointLight, targetX: number, targetY: number) {
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
        return lightDistGround >= epsilonDist;
    }
    getCulledPointLights(x: number, y: number, targetX: number, targetY: number) {
        const key = TileMap.encodeChunkKey(x, y);
        const chunk = this.chunks.get(key);
        if (!chunk) return [];
        const lights = [];
        for (const light of chunk.chunk.pointLights) {
            if (!this.shouldCullPointLight(light, targetX, targetY)) {
                lights.push(light);
            }
        }
        return lights;
    }

    collectExternalLights(x: number, y: number, target: Set<PointLight>, isEntity: LitEntity | false) {
        target.clear();
        let lights = 0;

        outer:
        for (const entity of this.litEntities.values()) {
            if (isEntity && isEntity === entity) continue;
            for (const light of entity.pointLights) {
                if (lights > MAX_TOTAL_POINT_LIGHTS) break outer;
                if (!this.shouldCullPointLight(light, x, y)) {
                    target.add(light);
                    lights++;
                }
            }
        }

        outer:
        for (let dy = -CHUNK_LIGHTING_SAMPLE_RADIUS; dy <= CHUNK_LIGHTING_SAMPLE_RADIUS; dy++) {
            for (let dx = -CHUNK_LIGHTING_SAMPLE_RADIUS; dx <= CHUNK_LIGHTING_SAMPLE_RADIUS; dx++) {
                if (!isEntity && dx === 0 && dy === 0) continue;
                if (lights > MAX_TOTAL_POINT_LIGHTS) break outer;
                const chunkLights = this.getCulledPointLights(x + dx, y + dy, x, y);
                for (const light of chunkLights) {
                    target.add(light);
                }
                lights += chunkLights.length;
            }
        }
    }

    updateChunkLighting(x: number, y: number) {
        const key = TileMap.encodeChunkKey(x, y);
        const chunk = this.chunks.get(key);
        if (!chunk) return;

        this.collectExternalLights(x, y, chunk.chunk.externalPointLights, false);
        chunk.chunk.updateLighting();
        chunk.lightingNeedsUpdate = false;

        for (const entity of this.litEntities.values()) {
            const cx = Math.floor(entity.position[0] / CHUNK_SIZE);
            const cy = Math.floor(entity.position[1] / CHUNK_SIZE);
            if (cx === x && cy === y) {
                // entity is in this chunk
                entity.lightChunk = chunk.chunk;
                entity.lightChunkDidUpdate();
            }
        }
    }

    // RENDERING

    getView(ctx: FrameContext) {
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
        if (!centerPoint) return { center: vec2.fromValues(0, 0), radius: 0, viewChunks: [], renderChunks: [] };
        const projectAndGetViewRadius = (p: vec2, z: number) => {
            const worldPoint = screenToWorld([-1, -1], z);
            if (!worldPoint) return 0;
            return Math.hypot(worldPoint[0] - centerPoint[0], worldPoint[1] - centerPoint[1]);
        };

        const viewRadius = Math.max(
            projectAndGetViewRadius([-1, -1], 5),
            projectAndGetViewRadius([1, 1], 0),
        );

        const center = vec2.fromValues(centerPoint[0], centerPoint[1]);
        vec2.scale(center, center, 1 / CHUNK_SIZE);
        vec2.floor(center, center);
        const radius = Math.min(MAX_VIEW_RADIUS, Math.ceil(viewRadius / CHUNK_SIZE));

        const viewChunks: vec2[] = [];
        const renderChunks: vec2[] = [];
        const p = vec4.create();
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = center[0] + dx;
                const y = center[1] + dy;
                if (Math.hypot(dx, dy) > radius + 1) continue;

                let leastWindowX = Infinity;
                let leastWindowY = Infinity;
                let mostWindowX = -Infinity;
                let mostWindowY = -Infinity;

                const project = (x: number, y: number, z: number) => {
                    vec4.set(p, x * CHUNK_SIZE, y * CHUNK_SIZE, z, 1);
                    vec4.transformMat4(p, p, ctx.view);
                    vec4.transformMat4(p, p, ctx.proj);
                    leastWindowX = Math.min(leastWindowX, p[0] / p[3]);
                    leastWindowY = Math.min(leastWindowY, p[1] / p[3]);
                    mostWindowX = Math.max(mostWindowX, p[0] / p[3]);
                    mostWindowY = Math.max(mostWindowY, p[1] / p[3]);
                };

                project(x, y, 0);
                project(x + 1, y, 0);
                project(x, y + 1, 0);
                project(x + 1, y + 1, 0);
                project(x + 1, y + 1, 1);

                if (leastWindowX < 1 && leastWindowY < 1 && mostWindowX > -1 && mostWindowY > -1) {
                    renderChunks.push(vec2.fromValues(x, y));
                }
                viewChunks.push(vec2.fromValues(x, y));
            }
        }

        return { center, radius, viewChunks, renderChunks };
    }

    private currentView: { viewChunks: vec2[], renderChunks: vec2[] } | null = null;
    update(ctx: FrameContext) {
        if (this.buffersNeedUpdate) {
            this.createBuffers();
        }

        this.currentView = this.getView(ctx);
        const chunks = this.currentView.viewChunks;

        if (this.uniformBuffers) {
            this.updateBuffers(ctx);
        }

        // update chunks
        let renderStart = Date.now();
        let didCreateAChunk = false;

        // for cache renders
        const tileChunkShader = this.ctx.shaders.tileChunk;
        tileChunkShader.bind();
        if (this.uniformBuffers) {
            tileChunkShader.bindUniformBlock('UGlobalLighting', this.uniformBuffers.lighting);
        } else {
            tileChunkShader.setUniform('u_gl_ambient_radiance', this.lighting.ambientRadiance);
            tileChunkShader.setUniform('u_gl_sun_dir', this.lighting.sunDir);
            tileChunkShader.setUniform('u_gl_sun_radiance', this.lighting.sunRadiance);
        }

        for (const [x, y] of chunks) {
            const key = TileMap.encodeChunkKey(x, y);

            const timeSinceRenderStart = (Date.now() - renderStart) / 1000;
            const canCreate = !didCreateAChunk || timeSinceRenderStart < CHUNK_CREATION_TIME_BUDGET;

            const hasChunk = this.chunks.has(key);
            if (!hasChunk && canCreate) {
                this.createChunk(x, y);
                didCreateAChunk = true;
            } else if (!hasChunk) continue;

            const chunk = this.chunks.get(key)!;
            chunk.lastUpdate = Date.now();
            // TODO: invalidate macrotile cache if global lighting changed
            // TODO: maybe pass the global lighting here instead of in gl state above?
            const updates = chunk.chunk.update(ctx);

            if (updates.pointLightsDidChange) {
                this.chunkDidUpdateLights(x, y);
            }
        }

        // update chunk lighting
        for (const [x, y] of chunks) {
            const key = TileMap.encodeChunkKey(x, y);
            const chunk = this.chunks.get(key);
            if (!chunk) continue;

            if (chunk.lightingNeedsUpdate) {
                this.updateChunkLighting(x, y);
            }
        }
    }

    lastGcTime = Date.now();
    render(ctx: FrameContext) {
        if (!this.currentView) return;
        const chunks = this.currentView.renderChunks;

        // render chunks
        const macrotileShader = this.ctx.shaders.macrotile;
        const tileChunkShader = this.ctx.shaders.tileChunk;
        if (this.uniformBuffers) {
            // FIXME don't bind uniform blocks twice
            macrotileShader.bind();
            macrotileShader.bindUniformBlock('UCamera', this.uniformBuffers.camera);
            tileChunkShader.bind();
            tileChunkShader.bindUniformBlock('UCamera', this.uniformBuffers.camera);
            tileChunkShader.bindUniformBlock('UGlobalLighting', this.uniformBuffers.lighting);
        } else {
            macrotileShader.bind();
            macrotileShader.setUniform('u_proj', ctx.proj);
            macrotileShader.setUniform('u_view', ctx.view);
            macrotileShader.setUniform('u_camera_pos', ctx.camera.position);
            tileChunkShader.bind();
            tileChunkShader.setUniform('u_proj', ctx.proj);
            tileChunkShader.setUniform('u_view', ctx.view);
            tileChunkShader.setUniform('u_camera_pos', ctx.camera.position);
            tileChunkShader.setUniform('u_gl_ambient_radiance', this.lighting.ambientRadiance);
            tileChunkShader.setUniform('u_gl_sun_dir', this.lighting.sunDir);
            tileChunkShader.setUniform('u_gl_sun_radiance', this.lighting.sunRadiance);
        }

        let screenIsEmpty = true;
        const batchState = {};

        for (const [x, y] of chunks) {
            const key = TileMap.encodeChunkKey(x, y);
            const chunk = this.chunks.get(key);
            if (!chunk) continue;
            const didRender = chunk.chunk.render(ctx, batchState);
            if (didRender) screenIsEmpty = false;
        }

        if (screenIsEmpty) {
            for (const [x, y] of chunks) {
                this.markChunkAsFirstScreen(x, y);
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
