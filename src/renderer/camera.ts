import { mat4, quat, vec2, vec3, vec4 } from 'gl-matrix';

// TODO: fewer arbitrary constants

export class Camera {
    position = vec3.create();
    rotation = quat.create();
    clipNear = 0.1;
    clipFar = 200;
    perspective = 0;
    fov = Math.PI / 3;
    orthoScale = 0.25;

    get actualOrthoScale() {
        return 128 * this.orthoScale;
    }

    getProjection(width: number, height: number): mat4 {
        const ortho = mat4.create();
        const orthoScale = this.actualOrthoScale;
        mat4.ortho(ortho, -width / orthoScale, width / orthoScale, -height / orthoScale, height / orthoScale, this.clipNear, this.clipFar);

        const persp = mat4.create();
        mat4.perspective(persp, this.fov, width / height, this.clipNear, this.clipFar);

        const projection = mat4.create();
        mat4.add(
            projection,
            mat4.multiplyScalar(ortho, ortho, 1 - this.perspective),
            mat4.multiplyScalar(persp, persp, this.perspective),
        );

        const invertY = mat4.fromValues(
            1, 0, 0, 0,
            0, -1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
        );
        mat4.multiply(projection, invertY, projection);

        return projection;
    }

    getView(): mat4 {
        const view = mat4.create();
        mat4.translate(view, view, this.position);

        const rot = mat4.fromQuat(mat4.create(), this.rotation);
        mat4.multiply(view, view, rot);

        mat4.invert(view, view);
        return view;
    }

    viewSpaceProjectionRay(viewportSize: vec2, clipSpacePoint: vec2): [vec3, vec3] {
        const aspect = viewportSize[0] / viewportSize[1];
        const orthoScale = this.actualOrthoScale;

        const orthoPlanePoint = vec3.fromValues(
            clipSpacePoint[0] * viewportSize[0] / orthoScale,
            -clipSpacePoint[1] * viewportSize[1] / orthoScale,
            -1,
        );
        const orthoRayDir = vec3.fromValues(0, 0, -1);

        // FIXME: this one is wrong but i don't know how exactly
        const perspPlanePoint = vec3.fromValues(0, 0, -1);
        const perspY = Math.tan(this.fov);
        const perspX = perspY / aspect;
        const perspRayDir = vec3.fromValues(
            clipSpacePoint[0] * perspX,
            -clipSpacePoint[1] * perspY,
            -1,
        );
        vec3.normalize(perspRayDir, perspRayDir);

        const planePoint = vec3.lerp(orthoPlanePoint, orthoPlanePoint, perspPlanePoint, this.perspective);
        const rayDir = vec3.lerp(orthoRayDir, orthoRayDir, perspRayDir, this.perspective);

        return [planePoint, rayDir];
    }

    projectionRay(viewportSize: vec2, clipSpacePoint: vec2): [vec4, vec3] {
        const [p, d] = this.viewSpaceProjectionRay(viewportSize, clipSpacePoint);
        const m = this.getView();
        mat4.invert(m, m);
        const p4 = vec4.fromValues(p[0], p[1], p[2], 1);
        const d4 = vec4.fromValues(p[0] + d[0], p[1] + d[1], p[2] + d[2], 1);
        vec4.transformMat4(p4, p4, m);
        vec4.transformMat4(d4, d4, m);
        const d3 = vec3.fromValues(d4[0] - p4[0], d4[1] - p4[1], d4[2] - p4[2]);
        return [p4, d3];
    }
}
