import { vec2, vec3 } from 'gl-matrix';
import { Camera } from './camera';

/** Types of backing contexts. */
export enum BackingContextType {
    Canvas2D,
    WebGL,
    WebGL2OrWebGL,
}

/** A backing context for the renderer, such as an HTML canvas. */
export interface IBackingContext {
    /** Logical width. */
    readonly width: number;
    /** Logical height. */
    readonly height: number;
    /** Scaling factor from logical size to pixel size. */
    readonly pixelScale: number;

    /**
     * Attempts to create or re-create the graphics context.
     * Returns success.
     */
    createContext(type: BackingContextType): boolean;

    /** Graphics context. */
    readonly context: WebGL2RenderingContext | WebGLRenderingContext | CanvasRenderingContext2D | null;

    /**
     * Returns true if the context was lost (e.g. because the GPU went away), or if there is no
     * context to begin with.
     */
    isContextLost(): boolean;
}

/** The ID of a tile in map data. */
export type TileTypeId = number;

/** Material layers for map tiles. */
export enum TileTextureLayer {
    Color = 'color',
    Normal = 'normal',
    /** Packed format: emission on rgb and roughness on alpha */
    Material = 'material',
}

/** Types of 3D geometry for map tiles. */
export enum GeometryType {
    Flat,
    CubeBack,
    CubeFront,
}

/** A zero-volume point light. */
export interface PointLight {
    pos: vec3,
    radiance: vec3,
}

/** A tile type definition. */
export interface TileType {
    /**
     * Animation frame offsets.
     * This is a list of (x, y) coordinates in the tileset image indicating which tile to use for
     * which animation frame.
     * Note that the offsets are based on tiles and not pixels.
     * Static tiles only have one entry.
     */
    frames: vec2[];
    /** Tile geometry. */
    geometry: GeometryType;
    /**
     * If not none, the tile will have a point light. The position is relative to the tile cube,
     * i.e. (0, 0, 0) will be in the most negative corner of the cube.
     */
    pointLight?: PointLight,
}

/** Defines a tileset. */
export interface ITileset {
    /** Raw texture size. Should generally be the same across different tilesets. */
    readonly pixelSize: [number, number];
    /** Texture size in number of tiles. */
    readonly textureSize: [number, number];
    /** All tile types in this tile set. */
    readonly tileTypes: TileTypeId[];

    /** Returns the given texture layer if available. */
    getTexture(layer: TileTextureLayer): HTMLImageElement | HTMLCanvasElement | ImageBitmap | null;

    /** Returns the given tile type if it's in this tile set. */
    getTileType(id: TileTypeId): TileType | null;
}

export type TileSetUpdateListener = () => void;
export type TileMapUpdateListener = (x: number, y: number, width: number, height: number) => void;

/** Defines a tile map. */
export interface ITileMap {
    /**
     * Returns the tile set that contains the tile type with the given id, or null if it's not
     * available.
     */
    getTileset(tileType: TileTypeId): ITileset | null;

    /**
     * Returns the tile at the given coordinates, or null if it's not loaded.
     */
    getTile(x: number, y: number): TileTypeId | null;

    /** Adds an event listener that will be signaled when new tile sets are available. */
    addTilesetUpdateListener(listener: TileSetUpdateListener): void;
    removeTilesetUpdateListener(listener: TileSetUpdateListener): void;

    /** Adds an event listener that will be signaled when new a new map region is available. */
    addMapUpdateListener(listener: TileMapUpdateListener): void;
    removeMapUpdateListener(listener: TileMapUpdateListener): void;
}

/** Abstract garden renderer interface. */
export interface NetgardensRenderer {
    // TODO: lighting controls
    camera: Camera;
    map: ITileMap;
    render(): void;
    dispose(): void;
}
