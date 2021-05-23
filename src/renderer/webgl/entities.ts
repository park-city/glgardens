import { EntityLayer, IEntity, IEntityMaterial } from '../typedefs';
import { EntityMaterial } from './entity-material';
import { Context, FrameContext } from './context';
import { Entity } from './entity';
import { TileMap } from './tile-map';
import { setNormalAlphaBlending } from './gl-utils';

export class Entities {
    ctx: Context;
    tileMap: TileMap;
    entities = new Map<unknown, Entity>();
    // TODO: GC?
    materials = new Map<IEntityMaterial, EntityMaterial>();

    constructor(ctx: Context, tileMap: TileMap) {
        this.ctx = ctx;
        this.tileMap = tileMap;
    }

    getMaterial(mat: IEntityMaterial): EntityMaterial {
        if (!this.materials.has(mat)) {
            this.materials.set(mat, new EntityMaterial(this.ctx, mat));
        }
        return this.materials.get(mat)!;
    }

    createEntity(key: unknown, data: IEntity): Entity {
        const entity = new Entity(this.ctx, data, this);
        this.entities.set(key, entity);
        this.tileMap.addLitEntity(key, entity);
        return entity;
    }
    getEntity(key: unknown) {
        return this.entities.get(key);
    }
    deleteEntity(key: unknown) {
        const entity = this.entities.get(key);
        this.entities.delete(key);
        this.tileMap.deleteLitEntity(key);
        if (entity) {
            entity.dispose();
        }
    }

    update(ctx: FrameContext) {
        for (const entity of this.entities.values()) {
            entity.update(ctx);
            if (entity.lightingNeedsUpdate) {
                this.tileMap.litEntityDidUpdateLights(entity);
            }
        }
    }

    render(ctx: FrameContext) {
        const { gl } = this.ctx;
        const entityShader = this.ctx.shaders.entity;
        entityShader.bind();
        setNormalAlphaBlending(gl);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.enable(gl.CULL_FACE);

        if (this.tileMap.uniformBuffers) {
            entityShader.bindUniformBlock('UCamera', this.tileMap.uniformBuffers.camera);
            entityShader.bindUniformBlock('UGlobalLighting', this.tileMap.uniformBuffers.lighting);
        } else {
            entityShader.setUniform('u_proj', ctx.proj);
            entityShader.setUniform('u_view', ctx.view);
            entityShader.setUniform('u_gl_ambient_radiance', this.tileMap.lighting.ambientRadiance);
            entityShader.setUniform('u_gl_sun_dir', this.tileMap.lighting.sunDir);
            entityShader.setUniform('u_gl_sun_radiance', this.tileMap.lighting.sunRadiance);
        }

        for (const entity of this.entities.values()) {
            if (entity.data.layer === EntityLayer.Map) {
                entity.render();
            }
        }

        gl.disable(gl.CULL_FACE);
        gl.disable(gl.DEPTH_TEST);

        for (const entity of this.entities.values()) {
            if (entity.data.layer === EntityLayer.Ui) {
                entity.render();
            }
        }
    }

    dispose() {
        for (const entity of this.entities.values()) {
            entity.dispose();
        }
        for (const mat of this.materials.values()) {
            mat.dispose();
        }
    }
}
