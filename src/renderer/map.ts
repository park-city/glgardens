import { vec2, vec3, vec4 } from 'gl-matrix';
import { Context, FrameContext } from './context';
import { TileMapChunk, CHUNK_SIZE, TileChunkBatchState } from './tile-chunk';
import { TileMapData } from './map-data';
import { TileResources, ErrorTileSet } from './tile-resources';
import { PlaneSubspace } from './geom-utils';

const CHUNK_GC_INTERVAL_MS = 5 * 1000;
const MAX_VIEW_RADIUS = 10;
const CHUNK_CREATION_TIME_BUDGET = 1 / 60;

type ChunkEntry = { chunk: TileMapChunk, lastRender: number };

/**
 * Renders a tile map.
 */
export class TileMap {
    ctx: Context;
    resources: TileResources;
    chunks = new Map();
    data: TileMapData;

    constructor(ctx: Context, resources: TileResources, data: TileMapData) {
        this.ctx = ctx;
        this.resources = resources;
        this.data = data;
    }

    private static encodeChunkKey(x: number, y: number) {
        return `${x},${y}`;
    }

    private getChunkData(cx: number, cy: number) {
        return (dx: number, dy: number) => this.data.getTile(cx * CHUNK_SIZE + dx, cy * CHUNK_SIZE + dy);
    }

    private renderChunk(ctx: FrameContext, cx: number, cy: number, batchState?: TileChunkBatchState, canCreate = true) {
        const key = TileMap.encodeChunkKey(cx, cy);
        if (!this.chunks.has(key)) {
            if (!canCreate) return;
            let tileSet = this.resources.getTileSet(this.data.tileSet);
            if (!tileSet) tileSet = new ErrorTileSet(this.ctx);

            const chunk = new TileMapChunk(this.ctx, [cx, cy], tileSet, this.getChunkData(cx, cy));
            this.chunks.set(key, { chunk, lastRender: 0 } as ChunkEntry);
        }

        const chunk = this.chunks.get(key)! as ChunkEntry;
        chunk.lastRender = Date.now();
        return chunk.chunk.render(ctx, undefined, batchState);
    }

    private markChunkAsFirstScreen(cx: number, cy: number) {
        const key = TileMap.encodeChunkKey(cx, cy);
        const chunk = this.chunks.get(key) as ChunkEntry | null;
        if (chunk) {
            chunk.chunk.isFirstScreen = true;
        }
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

    /** Deletes chunks that haven't been used in a while. */
    private purgeOldChunks(maxAgeMs: number) {
        for (const [key, chunk] of [...this.chunks.entries()]) {
            if (chunk.lastRender < Date.now() - maxAgeMs) {
                chunk.chunk.dispose();
                this.chunks.delete(key);
            }
        }
    }

    lastGcTime = Date.now();

    render(ctx: FrameContext) {
        const tileChunkShader = ctx.compositor.tileChunkShader;
        tileChunkShader.bind();
        tileChunkShader.uniforms.u_proj = ctx.proj;
        tileChunkShader.uniforms.u_view = ctx.view;
        const lightDir = ctx.compositor.getLightDir();
        if (lightDir) tileChunkShader.uniforms.u_light_dir = lightDir;
        tileChunkShader.uniforms.u_camera_pos = ctx.camera.position;

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
        let radius = Math.ceil(viewRadius / CHUNK_SIZE);

        if (radius > MAX_VIEW_RADIUS) radius = MAX_VIEW_RADIUS;

        let batchState = {
            boundTileSetTextures: null,
        };

        let renderStart = Date.now();
        let screenIsEmpty = true;

        for (let y = -radius; y <= radius; y++) {
            for (let x = -radius; x <= radius; x++) {
                if (Math.hypot(x, y) > radius + 1) continue;

                const timeSinceRenderStart = (Date.now() - renderStart) / 1000;
                const canCreate = timeSinceRenderStart < CHUNK_CREATION_TIME_BUDGET;

                const rendered = this.renderChunk(ctx, viewChunk[0] + x, viewChunk[1] + y, batchState, canCreate);
                if (rendered) screenIsEmpty = false;
            }
        }

        if (screenIsEmpty) {
            for (let y = -radius; y <= radius; y++) {
                for (let x = -radius; x <= radius; x++) {
                    if (Math.hypot(x, y) > radius + 1) continue;
                    this.markChunkAsFirstScreen(viewChunk[0] + x, viewChunk[1] + y);
                }
            }
        }

        if (this.lastGcTime < Date.now() - CHUNK_GC_INTERVAL_MS) {
            this.lastGcTime = Date.now();
            this.purgeOldChunks(CHUNK_GC_INTERVAL_MS);
        }
    }

    dispose() {
        for (const chunk of this.chunks.values()) {
            chunk.chunk.dispose();
        }
    }
}
