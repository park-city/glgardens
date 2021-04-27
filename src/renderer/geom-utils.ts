import { mat4, vec2, vec3, vec4 } from 'gl-matrix';

/** A 2d subspace in 3d space. */
export class PlaneSubspace {
    origin: vec4;
    u: vec3;
    v: vec3;

    constructor(origin: vec4, u: vec3, v: vec3) {
        this.origin = origin;
        this.u = u;
        this.v = v;
    }

    get projectionFromPlane(): mat4 {
        return mat4.fromValues(
            this.u[0], this.u[1], this.u[2], 0,
            this.v[0], this.v[1], this.v[2], 0,
            0, 0, 0, 0,
            this.origin[0], this.origin[1], this.origin[2], 1,
        );
    }

    projectFromPlane(p: vec2): vec4 {
        const p4 = vec4.fromValues(p[0], p[1], 0, 1);
        return vec4.transformMat4(p4, p4, this.projectionFromPlane);
    }

    projectToPlane(p: vec4): vec2 {
        const op = vec4.create();
        vec4.sub(op, p, this.origin);
        const p3 = vec3.fromValues(op[0], op[1], op[2]);
        const ul = vec3.length(this.u);
        const vl = vec3.length(this.v);
        const u = vec3.dot(this.u, p3) / ul / ul;
        const v = vec3.dot(this.v, p3) / vl / vl;
        return vec2.fromValues(u, v);
    }

    get normal(): vec3 {
        const n = vec3.create();
        vec3.cross(n, this.u, this.v);
        vec3.normalize(n, n);
        return n;
    }

    /** Returns the shortest distance of the point p to the plane. */
    getNormalDistance(p: vec4): number {
        const v = this.projectFromPlane(this.projectToPlane(p));
        vec4.sub(v, p, v);
        const v3 = vec3.fromValues(v[0], v[1], v[2]);
        return vec3.dot(this.normal, v3);
    }

    rotateVAroundUAxis(angle: number) {
        const m = mat4.fromRotation(mat4.create(), angle, this.u);
        const v4 = vec4.fromValues(this.v[0], this.v[1], this.v[2], 1);
        vec4.transformMat4(v4, v4, m);
        this.v = vec3.fromValues(v4[0], v4[1], v4[2]);
    }

    moveOriginToUV(u: number, v: number) {
        const u4 = vec4.fromValues(this.u[0], this.u[1], this.u[2], 1);
        const v4 = vec4.fromValues(this.v[0], this.v[1], this.v[2], 1);
        vec4.scale(u4, u4, u);
        vec4.scale(v4, v4, v);
        vec4.add(this.origin, this.origin, u4);
        vec4.add(this.origin, this.origin, v4);
    }

    rayIntersect(p: vec4, d: vec3): [number, vec4] | null {
        const p3 = vec3.fromValues(p[0], p[1], p[2]);
        vec3.sub(p3, p3, this.origin as vec3);
        const { normal } = this;
        const pn = vec3.dot(normal, p3);
        const dn = vec3.dot(normal, d);
        if (dn === 0) return null;
        const t = -pn / dn;
        const intersection = vec4.create();
        const d4 = vec4.fromValues(d[0], d[1], d[2], 1);
        vec4.scaleAndAdd(intersection, p, d4, t);
        intersection[3] = 1;
        return [t, intersection];
    }
}
