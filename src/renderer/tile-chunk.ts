import { mat4, vec2, vec3, vec4 } from 'gl-matrix';
import createBuffer, { GLBuffer } from 'gl-buffer';
import createVAO, { GLVertexArray } from 'gl-vao';
import { Context, FrameContext } from './context';
import { TileData, TileSetLayer } from './map-data';
import { TileSet } from './tile-resources';
import { PlaneSubspace } from './geom-utils';
import { DeferredCompositor } from './deferred-compositor';

export const CHUNK_SIZE = 8;

type GeomOut = {
    positions: number[],
    uvs: number[],
    indices: number[],
};

function pushVertex(out: GeomOut, pos: vec4, uv: vec2): number {
    const index = out.positions.length / 4;
    out.positions.push(...pos);
    out.uvs.push(...uv);
    return index;
}

function createTileGeometry(out: GeomOut, type: string, x: number, y: number, projectionAngle: number): MapChunkTileInfo {
    const uvPlane = new PlaneSubspace(
        // origin at bottom cube corner
        vec4.fromValues(1, 1, 0, 1),
        // u: right
        vec3.fromValues(-1, 1, 0),
        // v: up on the floor
        vec3.fromValues(-1, -1, 0),
    );
    // rotate v by the projection angle so it stands up
    uvPlane.rotateVAroundUAxis(projectionAngle);

    // translate origin on plane to align with bottom/left cube bounds
    {
        const leftCubePoint = vec4.fromValues(1, 0, 0, 1);
        const bottomCubePoint = vec4.fromValues(1, 1, 0, 1);

        const leftPointU = uvPlane.projectToPlane(leftCubePoint)[0];
        const bottomPointV = uvPlane.projectToPlane(bottomCubePoint)[1];
        uvPlane.moveOriginToUV(leftPointU, bottomPointV);
    }

    // translate uv plane origin along normal so it's in the middle of the cube instead of at the bottom corner
    if (type === 'flat') {
        const leftCubePoint = vec4.fromValues(1, 0, 0, 1);
        const normalDist = uvPlane.getNormalDistance(leftCubePoint);
        const n = uvPlane.normal;
        const n4 = vec4.fromValues(n[0], n[1], n[2], 1);
        vec4.add(uvPlane.origin, uvPlane.origin, vec4.scale(vec4.create(), n4, normalDist));
    }

    // squish cube so it's 1:1
    const zSquishFactor = 1 / uvPlane.projectFromPlane([0, 1])[2];

    let vertCount = 0;

    const push = (dx: number, dy: number, dz: number) => {
        vertCount++;

        const cubePos = vec4.fromValues(dx, dy, dz, 1);
        let vertexPos;
        if (type === 'flat') {
            vertexPos = uvPlane.projectFromPlane(uvPlane.projectToPlane(cubePos));
        } else {
            vertexPos = vec4.copy(vec4.create(), cubePos);
        }
        vertexPos[0] += x;
        vertexPos[1] += y;

        const rawUv = uvPlane.projectToPlane(cubePos);
        const uv = vec2.fromValues(1 - rawUv[0], 1 - rawUv[1]);

        return pushVertex(out, vertexPos, uv);
    };

    const startIndex = out.indices.length;

    if (type === 'flat') {
        const puvBotL = uvPlane.projectFromPlane([0, 0]);
        const puvBotR = uvPlane.projectFromPlane([1, 0]);
        const puvTopL = uvPlane.projectFromPlane([0, 1]);
        const puvTopR = uvPlane.projectFromPlane([1, 1]);
        const pBotL = push(puvBotL[0], puvBotL[1], puvBotL[2]);
        const pBotR = push(puvBotR[0], puvBotR[1], puvBotR[2]);
        const pTopL = push(puvTopL[0], puvTopL[1], puvTopL[2]);
        const pTopR = push(puvTopR[0], puvTopR[1], puvTopR[2]);

        out.indices.push(pBotL, pTopR, pTopL);
        out.indices.push(pTopR, pBotR, pBotL);
    } else {
        const z = zSquishFactor;
        const p010 = push(0, 1, 0);
        const p110 = push(1, 1, 0);
        const p100 = push(1, 0, 0);
        const p001 = push(0, 0, z);
        const p011 = push(0, 1, z);
        const p111 = type === 'outer' ? push(1, 1, z) : push(0, 0, 0);
        const p101 = push(1, 0, z);

        // left face
        out.indices.push(p010, p111, p110);
        out.indices.push(p010, p011, p111);

        // top face
        out.indices.push(p001, p111, p011);
        out.indices.push(p001, p101, p111);

        // right face
        out.indices.push(p100, p111, p101);
        out.indices.push(p100, p110, p111);
    }

    return {
        indexPos: startIndex,
        indexCount: out.indices.length - startIndex,
        vertCount,
    };
}

type MapChunkTileInfo = {
    vertCount: number,
    indexPos: number,
    indexCount: number,
};

type MapChunkBuffers = {
    pos: GLBuffer,
    uv: GLBuffer,
    tile: GLBuffer,
    objPos: GLBuffer,
    index: GLBuffer,
};

type TileChunkData = (x: number, y: number) => TileData | null;

type TileDataCache = {
    id: number,
    frames: vec2[],
} | null;

export type TileChunkBatchState = {
    boundTileSetTextures: TileSet | null,
};

type PointLight = {
    pos: vec4,
    color: vec4,
};

/**
 * An NxN chunk of the map. (N = CHUNK_SIZE)
 */
export class TileMapChunk {
    ctx: Context;

    buffers!: MapChunkBuffers;
    tileInfo!: (MapChunkTileInfo | null)[];
    vao!: GLVertexArray;
    count = 0;
    tileSet: TileSet;
    data: TileChunkData;
    dataCache: TileDataCache[] = [];
    position: vec2;

    constructor(ctx: Context, position: vec2, tileSet: TileSet, data: TileChunkData) {
        this.ctx = ctx;
        this.position = position;
        this.tileSet = tileSet;
        this.data = data;

        this.createBuffers();
    }

    buffersNeedUpdate = false;
    pointLights: PointLight[] = [];

    createBuffers() {
        const out: GeomOut = {
            positions: [],
            uvs: [],
            indices: [],
        };

        this.tileInfo = [];
        this.dataCache = [];
        this.pointLights = [];
        const tiles = [];
        const tilePos = [];

        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const tile = this.data(x, y);
                this.dataCache[y * CHUNK_SIZE + x] = tile ? {
                    id: tile.id,
                    frames: this.tileSet.getFrames(tile.id),
                } : null;
                if (!tile) {
                    this.tileInfo.push(null);
                    continue;
                }
                const tileType = this.tileSet.getType(tile.id);
                const ti = createTileGeometry(out, tileType, x, y, 60 / 180 * Math.PI);
                this.tileInfo.push(ti);
                for (let i = 0; i < ti.vertCount; i++) tiles.push(0, 0);
                for (let i = 0; i < ti.vertCount; i++) tilePos.push(x, y);

                const pointLight = this.tileSet.getPointLight(tile.id);
                if (pointLight) this.pointLights.push({
                    pos: vec4.fromValues(
                        pointLight[0][0] + x,
                        pointLight[0][1] + y,
                        pointLight[0][2],
                        1,
                    ),
                    color: pointLight[1],
                });
            }
        }

        if (this.buffers) {
            this.buffers.pos.dispose();
            this.buffers.uv.dispose();
            this.buffers.tile.dispose();
            this.buffers.objPos.dispose();
            this.buffers.index.dispose();
        }
        if (this.vao) this.vao.dispose();

        const { gl } = this.ctx;
        const pos = createBuffer(gl, out.positions, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
        const uv = createBuffer(gl, out.uvs, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
        const tile = createBuffer(gl, tiles, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
        const objPos = createBuffer(gl, tilePos, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
        const index = createBuffer(gl, new Uint16Array(out.indices), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
        this.count = out.indices.length;
        this.vao = createVAO(gl, [
            { buffer: pos, size: 4 },
            { buffer: uv, size: 2 },
            { buffer: tile, size: 2 },
            { buffer: objPos, size: 2 },
        ], index);
        this.buffers = { pos, uv, tile, objPos, index };
        this.buffersNeedUpdate = false;

        this.updateTiles();
    }

    tileAnimations = new Map();

    updateTiles() {
        if (this.buffersNeedUpdate) {
            this.createBuffers();
            return;
        }

        // TODO: use partial updates instead of updating the whole thing every time, maybe
        // (though that might just be a premature optimization...)
        const data = [];
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const tileInfo = this.tileInfo[y * CHUNK_SIZE + x];
                if (!tileInfo) continue;
                const tile = this.dataCache[y * CHUNK_SIZE + x];
                if (!tile) continue;

                const frames = tile.frames;
                const frame: number = this.tileAnimations.get(tile.id) || 0;
                const frameOffset = frames[frame];

                for (let i = 0; i < tileInfo.vertCount; i++) {
                    data.push(frameOffset[0], frameOffset[1]);
                }
            }
        }
        this.buffers.tile.update(data, 0);
    }

    lastTime = -Infinity;
    animationFrameTime = 0;

    advanceAnimationFrame() {
        let hasAnimation = false;
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const tile = this.dataCache[y * CHUNK_SIZE + x];
                if (!tile) continue;
                const frames = tile.frames;
                if (frames.length <= 1) continue;

                hasAnimation = true;

                if (!this.tileAnimations.has(tile.id)) this.tileAnimations.set(tile.id, 0);
                let frame: number = this.tileAnimations.get(tile.id) || 0;
                frame++;
                if (frame >= frames.length) frame = 0;
                this.tileAnimations.set(tile.id, frame);
            }
        }
        return hasAnimation;
    }

    animateInOrigin: vec2 | null = null;
    animateInTime = 999; // if data exists on first render call, don't animate in
    isFirstScreen = false;

    getAnimateInOrigin(ctx: FrameContext) {
        const groundPlane = new PlaneSubspace(
            vec4.create(),
            vec3.fromValues(1, 0, 0),
            vec3.fromValues(0, 1, 0),
        );
        const [p, d] = ctx.camera.projectionRay(ctx.viewport, [0, 0]);
        const result = groundPlane.rayIntersect(p, d);
        if (!result) this.animateInOrigin = this.position;
        else this.animateInOrigin = vec2.fromValues(result[1][0], result[1][1]);
    }

    /**
     * Renders this chunk.
     * Note that before calling this function, the tileChunk shader must be bound and set up.
     */
    render(ctx: FrameContext, transform = mat4.create(), batchState?: TileChunkBatchState) {
        if (this.lastTime === -Infinity) this.lastTime = ctx.time; // first render

        const deltaTime = ctx.time - this.lastTime;
        this.lastTime = ctx.time;

        if (!this.count && !this.buffersNeedUpdate) {
            this.animateInTime = 0;
            this.animateInOrigin = null;
            return false;
        }

        const tileChunkShader = ctx.compositor.tileChunkShader;

        if (!this.animateInOrigin) this.getAnimateInOrigin(ctx);
        this.animateInTime += deltaTime;

        mat4.translate(transform, transform, [
            this.position[0] * CHUNK_SIZE,
            this.position[1] * CHUNK_SIZE,
            0,
        ]);
        tileChunkShader.uniforms.u_chunk = transform;

        // TODO: check if setting this uniform is even necessary (esp. if animInTime is big)
        tileChunkShader.uniforms.u_in_anim = [
            this.animateInOrigin![0],
            this.animateInOrigin![1],
            this.animateInTime,
            this.isFirstScreen ? 1 : 0,
        ];

        this.animationFrameTime = Math.max(0, Math.min(1, this.animationFrameTime + deltaTime));
        let hasAnimation = this.buffersNeedUpdate;
        while (this.animationFrameTime > 1 / 24) { // TODO: custom fps
            this.animationFrameTime -= 1 / 24;
            if (this.advanceAnimationFrame()) hasAnimation = true;
        }
        if (hasAnimation) {
            this.updateTiles();
        }

        if (ctx.compositor instanceof DeferredCompositor) {
            const lightPos = vec4.create();
            for (const light of this.pointLights) {
                vec4.copy(lightPos, light.pos);
                vec4.transformMat4(lightPos, lightPos, transform);
                ctx.compositor.pointLights.push({
                    pos: [lightPos[0], lightPos[1], lightPos[2]],
                    color: light.color,
                });
            }
        }

        if (batchState?.boundTileSetTextures !== this.tileSet) {
            const color = this.tileSet.getTexture(TileSetLayer.color);
            color.bind(0);
            const normal = this.tileSet.getTexture(TileSetLayer.normal);
            normal.bind(1);
            tileChunkShader.uniforms.u_tileset = 0;
            tileChunkShader.uniforms.u_tileset_normal = 1;
            tileChunkShader.uniforms.u_tileset_size = this.tileSet.size;

            if (batchState) batchState.boundTileSetTextures = this.tileSet;
        }

        this.vao.bind();
        this.vao.draw(this.ctx.gl.TRIANGLES, this.count);
        this.vao.unbind();

        return true;
    }

    dispose() {
        this.buffers.pos.dispose();
        this.buffers.uv.dispose();
        this.buffers.tile.dispose();
        this.buffers.objPos.dispose();
        this.buffers.index.dispose();
        this.vao.dispose();
    }
}
