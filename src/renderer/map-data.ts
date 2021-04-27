import { vec2, vec3, vec4 } from 'gl-matrix';

export type TileIdMapping = {
    [id: string]: {
        frames: vec2[],
        type?: string,
        pointLight?: [vec3, vec4],
    },
};
export enum TileSetLayer {
    color = 'color',
    normal = 'normal',
}
export type TileSetLayers = {
    [TileSetLayer.color]: HTMLImageElement,
    [TileSetLayer.normal]?: HTMLImageElement,
};

export interface TileData {
    id: number,
}
export interface TileMapData {
    size: vec2,
    tileSet: string,
    getTile: (x: number, y: number) => TileData | null,
}
