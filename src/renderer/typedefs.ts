import { quat, vec2, vec3 } from 'gl-matrix';
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

    getDomLayer(name: string): HTMLElement | null;

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
    readonly pixelSize: vec2;
    /** Texture size in number of tiles. */
    readonly textureSize: vec2;
    /** All tile types in this tile set. */
    readonly tileTypes: TileTypeId[];

    /** Returns the given texture layer if available. */
    getTexture(layer: TileTextureLayer): HTMLImageElement | HTMLCanvasElement | ImageBitmap | null;

    /** Returns the given tile type if it's in this tile set. */
    getTileType(id: TileTypeId): TileType | null;
}

/**
 * Listens for tileset updates.
 * If specific tilesets are passed, their textures will be force-reloaded.
 * Otherwise, this will only fill in missing tiles.
 */
export type TileSetUpdateListener = (specificUpdates?: ITileset[]) => void;

/**
 * Listens for map updates. All tiles in the given region will be invalidated and reloaded.
 */
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

export enum EntityTextureLayer {
    Color = 'color',
    Material = 'material',
}

export interface IEntityMaterial {
    pixelSize: vec2;
    getTexture(layer: EntityTextureLayer): HTMLImageElement | HTMLCanvasElement | ImageBitmap | null;
}

export enum EntityLayer {
    /** Entities on this layer will be rendered on the map. */
    Map = 'map',
    /** Entities on this layer will be rendered on top of the map and do not have depth testing. */
    Ui = 'ui',
}

export interface IEntity {
    chunks: IEntityGeometryChunk[];
    layer: EntityLayer,
    /**
     * An optional HTML element that will be displayed at the entity’s location.
     * In the default rotation, it will be flat on the display.
     */
    node?: HTMLElement,
}

export interface IEntityGeometryChunk {
    /** A list of vertices. */
    vertices: vec3[];
    /** A list of UV coordinates for each vertex. Indices should match the list of vertices. */
    uvs: vec2[];
    /**
     * A list of normal vectors for each vertex.
     * If zero, lighting will be disabled.
     */
    normals: vec3[];
    /**
     * A list of mesh faces.
     * Each face is a list of at least three vertex indices that defines a convex polygon.
     */
    faces: number[][];
    /** The material that should be applied to this chunk. */
    material: IEntityMaterial;
    /** Point lights in this chunk. */
    lights: PointLight[];
}

export interface IGlobalLighting {
    ambientRadiance: vec3;
    sunDir: vec3;
    sunRadiance: vec3;
}

export interface IRendererEntity {
    position: vec3;
    rotation: quat;
    /** Reloads materials. Useful if some material contains an animated Canvas2D texture. */
    updateMaterials(): void;
}

export interface IEntities {
    create(key: unknown, entity: IEntity): IRendererEntity;
    get(key: unknown): IRendererEntity | null;
    delete(key: unknown): boolean;
}

/** Abstract garden renderer interface. */
export interface NetgardensRenderer {
    camera: Camera;
    map: ITileMap;
    render(): void;

    /**
     * Frees resources used by this renderer.
     * The renderer may no longer be usable after this.
     */
    dispose(): void;

    readonly entities?: IEntities;
    readonly lighting?: IGlobalLighting;

    /** Returns the location on the ground plane for the given screen space location. */
    getGroundLocation(screenX: number, screenY: number): vec2;
}
