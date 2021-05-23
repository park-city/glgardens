import { mat4, quat, vec3 } from 'gl-matrix';
import { Context, FrameContext } from './context';
import { GLBuffer, GLBufferType, GLUniformBuffer } from './gl-buffer';
import { GLVertexArray } from './gl-vao';
import { IEntity, IEntityGeometryChunk, IEntityMaterial, PointLight } from '../typedefs';
import { UNIFORM_BLOCKS } from './shaders';
import { EntityMaterial } from './entity-material';
import { setNormalAlphaBlending } from './gl-utils';
import { TileMapChunk } from './tile-map-chunk';

export const MAX_ENTITY_POINT_LIGHTS = 4;

type EntityBuffers = {
    vao: GLVertexArray,
    index: GLBuffer,
    aPos: GLBuffer,
    aUv: GLBuffer,
    aNormal: GLBuffer,
};

type EntityUniformBuffers = {
    entity: GLUniformBuffer,
};

type EntityRenderChunk = {
    indexPos: number,
    indexCount: number,
    material: EntityMaterial,
};

interface MaterialProvider {
    getMaterial(mat: IEntityMaterial): EntityMaterial;
}

export class Entity {
    ctx: Context;
    materialProvider: MaterialProvider;

    data: IEntity;

    buffers?: EntityBuffers;
    uniformBuffers?: EntityUniformBuffers;
    renderChunks: EntityRenderChunk[] = [];
    localPointLights: PointLight[] = [];
    pointLights: PointLight[] = [];
    lightChunk?: TileMapChunk;

    private _position = vec3.create();
    private _rotation = quat.create();

    buffersNeedUpdate = true;
    transformNeedsUpdate = true;
    lightingNeedsUpdate = false;

    constructor(ctx: Context, data: IEntity, materialProvider: MaterialProvider) {
        this.ctx = ctx;
        this.data = data;
        this.materialProvider = materialProvider;
    }

    get position() {
        return this._position;
    }
    get rotation() {
        return this._rotation;
    }
    set position(v) {
        this._position = v;
        this.transformNeedsUpdate = true;
    }
    set rotation(v) {
        this._rotation = v;
        this.transformNeedsUpdate = true;
    }

    updateMaterials() {
        for (const chunk of this.renderChunks) {
            chunk.material.update();
        }
    }

    get transform(): mat4 {
        const m = mat4.create();
        mat4.translate(m, m, this.position);
        const rv = vec3.create();
        const rt = quat.getAxisAngle(rv, this.rotation);
        mat4.rotate(m, m, rt, rv);
        return m;
    }

    deleteBuffers() {
        if (!this.buffers) return;
        this.buffers.vao.dispose();
        this.buffers.index.dispose();
        this.buffers.aPos.dispose();
        this.buffers.aUv.dispose();
        this.buffers.aNormal.dispose();
        this.uniformBuffers?.entity.dispose();
        this.uniformBuffers = undefined;
        this.buffers = undefined;
    }

    createBuffers() {
        if (this.buffers) this.deleteBuffers();

        this.localPointLights = [];

        const geomOut = {
            positions: [] as number[],
            uvs: [] as number[],
            normals: [] as number[],
            indices: [] as number[],
        };
        this.renderChunks = [];
        for (const chunk of this.data.chunks) {
            const offset = geomOut.positions.length / 3;
            for (let i = 0; i < chunk.vertices.length; i++) {
                const vertex = chunk.vertices[i];
                const uv = chunk.uvs[i];
                const normal = chunk.normals[i];

                geomOut.positions.push(vertex[0], vertex[1], vertex[2]);
                if (uv) geomOut.uvs.push(uv[0], uv[1]);
                else geomOut.uvs.push(0, 0);
                if (normal) geomOut.normals.push(normal[0], normal[1], normal[2]);
                else geomOut.normals.push(0, 0, 0);
            }
            let indexCount = 0;
            for (const face of chunk.faces) {
                for (let i = 0; i < face.length - 2; i++) {
                    geomOut.indices.push(face[0] + offset, face[i + 1] + offset, face[i + 2] + offset);
                    indexCount += 3;
                }
            }
            this.renderChunks.push({
                indexPos: offset,
                indexCount,
                material: this.materialProvider.getMaterial(chunk.material),
            });
            for (const light of chunk.lights) {
                if (this.localPointLights.length >= MAX_ENTITY_POINT_LIGHTS) break;
                this.localPointLights.push(light);
            }
        }

        const { gl } = this.ctx;
        const index = new GLBuffer(gl, GLBufferType.Element);
        const aPos = new GLBuffer(gl, GLBufferType.Array);
        const aUv = new GLBuffer(gl, GLBufferType.Array);
        const aNormal = new GLBuffer(gl, GLBufferType.Array);

        index.bind();
        index.setData(new Uint16Array(geomOut.indices));
        aPos.bind();
        aPos.setData(new Float32Array(geomOut.positions));
        aUv.bind();
        aUv.setData(new Float32Array(geomOut.uvs));
        aNormal.bind();
        aNormal.setData(new Float32Array(geomOut.normals));

        const vao = new GLVertexArray(gl);
        vao.update(index, [
            { buffer: aPos, size: 3 },
            { buffer: aUv, size: 2 },
            { buffer: aNormal, size: 3 },
        ]);

        this.buffers = { vao, index, aPos, aUv, aNormal };

        if (this.ctx.gl2) {
            const gl = this.ctx.gl2;
            const entity = new GLUniformBuffer(gl, UNIFORM_BLOCKS.entity);
            this.uniformBuffers = { entity };
        }

        this.buffersNeedUpdate = false;
        this.transformNeedsUpdate = true;
    }

    updateTransform() {
        const transform = this.transform;
        if (this.uniformBuffers) {
            this.uniformBuffers.entity.bind();
            this.uniformBuffers.entity.setUniformData({ transform });
        } else {
            // nothing to do! uniforms are uploaded at render time
        }

        // update point lights in world space
        const hadLights = this.pointLights.length;
        for (let i = 0; i < this.localPointLights.length; i++) {
            const light = this.localPointLights[i];
            const pos = vec3.copy(vec3.create(), light.pos);
            vec3.transformMat4(pos, pos, transform);

            this.pointLights[i] = {
                pos,
                radiance: light.radiance,
            };
        }
        while (this.pointLights.length > this.localPointLights.length) this.pointLights.pop();

        this.transformNeedsUpdate = false;
        this.lightingNeedsUpdate = !!(hadLights || this.pointLights.length);
    }

    lightChunkDidUpdate() {
        // currently, this function does nothing
        this.lightingNeedsUpdate = false;
    }

    update(ctx: FrameContext) {
        if (!this.buffers || this.buffersNeedUpdate) {
            this.createBuffers();
        }

        if (this.transformNeedsUpdate) {
            this.updateTransform();
        }
    }

    render() {
        if (!this.buffers || !this.lightChunk) return;
        const { gl } = this.ctx;
        const entityShader = this.ctx.shaders.entity;
        this.buffers.vao.bind();

        let isFirst = true;
        for (const renderChunk of this.renderChunks) {
            if (this.uniformBuffers) {
                if (!this.lightChunk.uniformBuffers) {
                    this.buffers.vao.unbind();
                    return;
                }
                const lightBuffers = this.lightChunk.uniformBuffers!.lighting;
                if (isFirst) {
                    entityShader.bindUniformBlock('UEntity', this.uniformBuffers.entity);
                    isFirst = false;
                }

                for (let i = 0; i < lightBuffers.length; i++) {
                    const isFirst = i === 0;
                    const isLast = i === lightBuffers.length - 1;
                    const buf = lightBuffers[i];

                    entityShader.setUniform('u_light_pass_index', i);
                    entityShader.bindUniformBlock('UChunkLighting', buf);

                    renderChunk.material.ensureAvailable();
                    renderChunk.material.texColor!.bind(0);
                    renderChunk.material.texMaterial!.bind(2);

                    this.buffers.vao.draw(this.ctx.gl.TRIANGLES, renderChunk.indexPos, renderChunk.indexCount);

                    if (isFirst && !isLast) {
                        // start additive composite
                        gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
                    } else if (!isFirst && isLast) {
                        // complete additive composite
                        setNormalAlphaBlending(gl);
                    }
                }
            } else {
                entityShader.setUniform('u_entity_transform', this.transform);

                const lightUniforms = this.lightChunk!.pointLightUniformValues || [];

                for (let i = 0; i < lightUniforms.length; i++) {
                    const pointLightU = lightUniforms[i];

                    entityShader.setUniform('u_light_pass_index', i);
                    entityShader.setUniform('u_cl_point_light_count', pointLightU.count);
                    entityShader.setUniform('u_cl_point_light_pos', pointLightU.pos);
                    entityShader.setUniform('u_cl_point_light_radiance', pointLightU.rad);

                    renderChunk.material.ensureAvailable();
                    renderChunk.material.texColor!.bind(0);
                    renderChunk.material.texMaterial!.bind(2);

                    this.buffers.vao.draw(this.ctx.gl.TRIANGLES, renderChunk.indexPos, renderChunk.indexCount);

                    const isFirst = i === 0;
                    const isLast = i === lightUniforms.length - 1;
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
        this.buffers.vao.unbind();
    }

    dispose() {
        this.deleteBuffers();
    }
}
