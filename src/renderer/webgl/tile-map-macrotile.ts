import { GLFramebuffer } from './gl-fbo';
import { Context, SharedContextData } from './context';
import { TextureFormat } from './typedefs';
import { Texture2D } from './texture-allocator';
import { PlaneSubspace } from '../geom-utils';
import { mat4, quat, vec3, vec4 } from 'gl-matrix';
import { Camera } from '../camera';
import { GLBuffer, GLBufferType, GLUniformBuffer } from './gl-buffer';
import { UNIFORM_BLOCKS } from './shaders';
import { GLVertexArray } from './gl-vao';
import { Composite } from './composite';
import { SHARED_QUAD } from './quad';
import { setNormalAlphaBlending } from './gl-utils';

const MACROTILE_MAX_SIZE = 1024;
const PROJECTION_ANGLE = 60;

const SHARED_FBO: SharedContextData<GLFramebuffer> = {
    name: 'macrotile_shared_fbo',
    init(ctx) {
        const fbo = new GLFramebuffer(ctx.gl);
        fbo.colorFormats = [Composite.getFormat(ctx)];
        if (ctx.gl2) fbo.colorFormats.push(TextureFormat.R8);
        return fbo;
    },
};

const SHARED_UBOS: SharedContextData<{
    camera: GLUniformBuffer,
    chunk: GLUniformBuffer,
    dispose(): void,
}> = {
    name: 'macrotile_shared_ubo',
    init(ctx) {
        const camera = new GLUniformBuffer(ctx.gl, UNIFORM_BLOCKS.camera);
        const chunk = new GLUniformBuffer(ctx.gl, UNIFORM_BLOCKS.chunk);
        chunk.setUniformData({
            transform: mat4.create(),
            load_anim: [0, 0, 999, 0],
        });
        return {
            camera,
            chunk,
            dispose() {
                camera.dispose();
                chunk.dispose();
            },
        };
    },
};

type MacroTileBuffers = {
    vao: GLVertexArray,
    index: GLBuffer,
    aPos: GLBuffer,
    aUv: GLBuffer,
    aTile: GLBuffer,
    aObjPos: GLBuffer,
    indexCount: number,
};

/** A macrotile impostor for tile map chunks. */
export class Macrotile {
    ctx: Context;
    isValid = false;

    readonly textureFormat: TextureFormat;
    texColor?: Texture2D;
    texTonemap?: Texture2D;
    buffers?: MacroTileBuffers;

    /** Size of this macrotile in normal tiles. */
    size: number;
    /** Height of this macrotile. */
    height: number;
    /** The max resolution of a single tile, in pixels. */
    tilesetResolution = 0;

    constructor(ctx: Context, size: number, height: number) {
        this.ctx = ctx;
        this.size = size;
        this.height = height;

        this.textureFormat = Composite.getFormat(ctx);
    }

    invalidate() {
        this.isValid = false;
    }

    getRenderCamera() {
        const viewRay = vec3.fromValues(-1, -1, 0);
        vec3.normalize(viewRay, viewRay);
        vec3.scale(viewRay, viewRay, Math.sin(PROJECTION_ANGLE / 180 * Math.PI));
        viewRay[2] = -Math.cos(PROJECTION_ANGLE / 180 * Math.PI);

        const right = vec3.fromValues(1, -1, 0);
        const up = vec3.cross(vec3.create(), right, viewRay);

        const bottomPoint = vec4.fromValues(this.size, this.size, 0, 1);
        const leftPoint = vec4.fromValues(0, this.size, 0, 1);
        const rightPoint = vec4.fromValues(this.size, 0, 0, 1);
        const topPoint = vec4.fromValues(0, 0, this.height, 1);

        const orthoCameraPlane = new PlaneSubspace(vec4.fromValues(0, 0, 0, 1), right, up);
        const bottomOnPlane = orthoCameraPlane.projectToPlane(bottomPoint);
        const leftOnPlane = orthoCameraPlane.projectToPlane(leftPoint);
        const rightOnPlane = orthoCameraPlane.projectToPlane(rightPoint);
        const topOnPlane = orthoCameraPlane.projectToPlane(topPoint);

        const aspect = Math.abs(rightOnPlane[0] - leftOnPlane[0]) / Math.abs(topOnPlane[1] - bottomOnPlane[1]);
        const centerU = (rightOnPlane[0] + leftOnPlane[0]) / 2;
        const centerV = (topOnPlane[1] + bottomOnPlane[1]) / 2;
        const centerPoint = orthoCameraPlane.projectFromPlane([centerU, centerV]);
        const cameraPos = vec3.fromValues(centerPoint[0], centerPoint[1], centerPoint[2]);
        vec3.scaleAndAdd(cameraPos, cameraPos, viewRay, -this.size * 2);

        let height = (this.tilesetResolution * this.size) / aspect;
        let width = height * aspect;

        if (width > MACROTILE_MAX_SIZE) {
            width = MACROTILE_MAX_SIZE;
            height = width / aspect;
        }
        if (height > MACROTILE_MAX_SIZE) {
            height = MACROTILE_MAX_SIZE;
            width = height * aspect;
        }

        width = Math.ceil(width);
        height = Math.ceil(height);

        if (width < 8) width = 8;
        if (height < 8) height = 8;

        const camera = new Camera();
        camera.position = cameraPos;
        camera.invertY = false;
        quat.fromEuler(camera.rotation, -PROJECTION_ANGLE, 0, -45);

        const leftRightExtent = vec4.distance(leftPoint, rightPoint);
        camera.orthoScale = width / leftRightExtent * 2;

        orthoCameraPlane.moveOriginToUV(leftOnPlane[0], bottomOnPlane[1]);
        vec3.scale(orthoCameraPlane.u, orthoCameraPlane.u, (rightOnPlane[0] - leftOnPlane[0]) / vec3.length(orthoCameraPlane.u));
        vec3.scale(orthoCameraPlane.v, orthoCameraPlane.v, (topOnPlane[1] - bottomOnPlane[1]) / vec3.length(orthoCameraPlane.v));
        // FIXME: why are these off by sqrt(2)?
        vec3.scale(orthoCameraPlane.u, orthoCameraPlane.u, Math.sqrt(2));
        vec3.scale(orthoCameraPlane.v, orthoCameraPlane.v, Math.sqrt(2));

        return {
            camera,
            width,
            height,
            uvPlane: orthoCameraPlane
        };
    }

    deleteBuffers() {
        this.buffers?.vao.dispose();
        this.buffers?.index.dispose();
        this.buffers?.aPos.dispose();
        this.buffers?.aUv.dispose();
        this.buffers?.aTile.dispose();
        this.buffers?.aObjPos.dispose();
    }

    createBuffers() {
        if (this.buffers) this.deleteBuffers();

        const { uvPlane } = this.getRenderCamera();

        const positions: number[] = [];
        const uvs: number[] = [];
        const aTileData: number[] = [];
        const aObjPosData: number[] = [];

        let i = 0;
        const push = (x: number, y: number, z: number) => {
            x *= this.size;
            y *= this.size;
            z *= this.height;
            positions.push(x, y, z);
            const uv = uvPlane.projectToPlane(vec4.fromValues(x, y, z, 1));
            // FIXME: why is u flipped?
            uvs.push(uv[0], 1 - uv[1]);
            aTileData.push(0, 0);
            aObjPosData.push(0, 0, 0);
            return i++;
        };

        const indices = [];
        const p010 = push(0, 1, 0);
        const p110 = push(1, 1, 0);
        const p100 = push(1, 0, 0);
        const p001 = push(0, 0, 1);
        const p011 = push(0, 1, 1);
        const p111 = push(0, 0, 0);
        const p101 = push(1, 0, 1);

        // left face
        indices.push(p010, p111, p110);
        indices.push(p010, p011, p111);

        // bottom face
        indices.push(p001, p111, p011);
        indices.push(p001, p101, p111);

        // right face
        indices.push(p100, p111, p101);
        indices.push(p100, p110, p111);

        const { gl } = this.ctx;
        const index = new GLBuffer(gl, GLBufferType.Element);
        const aPos = new GLBuffer(gl, GLBufferType.Array);
        const aUv = new GLBuffer(gl, GLBufferType.Array);
        const aTile = new GLBuffer(gl, GLBufferType.Array);
        const aObjPos = new GLBuffer(gl, GLBufferType.Array);

        index.bind();
        index.setData(new Uint16Array(indices));
        aPos.bind();
        aPos.setData(new Float32Array(positions));
        aUv.bind();
        aUv.setData(new Float32Array(uvs));
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

        this.buffers = { vao, index, aPos, aUv, aTile, aObjPos, indexCount: indices.length };
    }

    beginCacheRender() {
        const { gl } = this.ctx;

        const { camera, width, height } = this.getRenderCamera();

        const fbo = this.ctx.getShared(SHARED_FBO);
        fbo.linearSample = (this.textureFormat !== TextureFormat.RGBA16F || this.ctx.params.halfFloatLinear)
            && (this.textureFormat !== TextureFormat.RGBA32F || this.ctx.params.floatLinear);

        this.createBuffers();

        if (this.texColor) fbo.color[0] = this.texColor;
        if (this.texTonemap) fbo.color[1] = this.texTonemap;
        fbo.size = [width, height];
        fbo.bind();
        fbo.forceRemapColor();
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.enable(gl.BLEND);
        setNormalAlphaBlending(gl);

        const proj = camera.getProjection(width, height);
        const view = camera.getView();

        const tileChunkShader = this.ctx.shaders.tileChunk;
        tileChunkShader.bind();
        if (this.ctx.gl2) {
            const buffers = this.ctx.getShared(SHARED_UBOS);
            buffers.camera.bind();
            buffers.camera.setUniformData({ proj, view, pos: camera.position });

            tileChunkShader.bindUniformBlock('UCamera', buffers.camera);
            tileChunkShader.bindUniformBlock('UChunk', buffers.chunk);
        } else {
            tileChunkShader.setUniform('u_proj', proj);
            tileChunkShader.setUniform('u_view', view);
            tileChunkShader.setUniform('u_camera_pos', camera.position);
            tileChunkShader.setUniform('u_chunk_transform', mat4.create());
            tileChunkShader.setUniform('u_chunk_load_anim', vec4.fromValues(0, 0, 999, 0));
        }
        tileChunkShader.setUniform('u_cache_render', 1);
    }

    finishCacheRender() {
        const tileChunkShader = this.ctx.shaders.tileChunk;
        tileChunkShader.setUniform('u_cache_render', 0);

        const fbo = this.ctx.getShared(SHARED_FBO);
        this.texColor = fbo.color[0];
        if (fbo.color[1]) this.texTonemap = fbo.color[1];
        while (fbo.color.length) fbo.color.pop();

        this.isValid = true;
    }

    render() {
        if (!this.buffers || !this.texColor) return false;

        this.texColor.bind(0);
        if (this.texTonemap) this.texTonemap.bind(1);
        this.buffers.vao.bind();
        this.buffers.vao.draw(this.ctx.gl.TRIANGLES, 0, this.buffers.indexCount);
        this.buffers.vao.unbind();

        return true;
    }

    dispose() {
        this.texColor?.dispose();
    }
}
