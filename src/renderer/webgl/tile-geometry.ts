import { vec2, vec3, vec4 } from 'gl-matrix';
import { PlaneSubspace } from '../geom-utils';
import { GeometryType } from '../typedefs';

export type GeometryOutput = {
    positions: number[],
    uvs: number[],
    indices: number[],
};

export type TileGeometryInfo = {
    vertCount: number,
    indexPos: number,
    indexCount: number,
};

function pushVertex(out: GeometryOutput, pos: vec3, uv: vec2): number {
    const index = out.positions.length / 3;
    out.positions.push(...pos);
    out.uvs.push(...uv);
    return index;
}

export function createTileGeometry(
    out: GeometryOutput,
    type: GeometryType,
    x: number, y: number, z: number,
    projectionAngle: number,
    textureAspect: number,
): TileGeometryInfo {
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
    if (type === GeometryType.Flat) {
        const leftCubePoint = vec4.fromValues(1, 0, 0, 1);
        const normalDist = uvPlane.getNormalDistance(leftCubePoint);
        const n = uvPlane.normal;
        const n4 = vec4.fromValues(n[0], n[1], n[2], 1);
        vec4.add(uvPlane.origin, uvPlane.origin, vec4.scale(vec4.create(), n4, normalDist));
    }

    // squish cube so it's as tall as the texture aspect ratio
    const zSquishFactor = 1 / (textureAspect * uvPlane.projectFromPlane([0, 1])[2]);

    let vertCount = 0;

    const push = (dx: number, dy: number, dz: number) => {
        vertCount++;

        const cubePos = vec4.fromValues(dx, dy, dz, 1);
        let vertexPos;
        if (type === GeometryType.Flat) {
            vertexPos = uvPlane.projectFromPlane(uvPlane.projectToPlane(cubePos));
        } else {
            vertexPos = vec4.copy(vec4.create(), cubePos);
        }

        const vertexPos3 = vec3.fromValues(
            vertexPos[0] + x,
            vertexPos[1] + y,
            vertexPos[2] + z,
        );

        const rawUv = uvPlane.projectToPlane(cubePos);
        const uv = vec2.fromValues(1 - rawUv[0], 1 - rawUv[1]);

        return pushVertex(out, vertexPos3, uv);
    };

    const startIndex = out.indices.length;

    if (type === GeometryType.Flat) {
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
        const p111 = type === GeometryType.CubeFront ? push(1, 1, z) : push(0, 0, 0);
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

