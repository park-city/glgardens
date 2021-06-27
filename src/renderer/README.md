# Netgardens Renderer
## API
### Overview
The Netgardens Renderer API is an interface between the renderer implementation (currently, WebGL only)
and the application within which it will be embedded.

Backends may not support all features outlined in the API.

#### Coordinate System
The world coordinate system is left-handed Z-up. One width of a tile (in 3D space) is one unit.
The default isometric view points in the −X/−Y direction horizontally
and at a −60° angle vertically.

### Setup
#### Backing Context
Rendering a garden first requires a drawing surface, which is provided by the `IBackingContext`
interface.

An implementation should allow creation, re-creation, and destruction of drawing surfaces and DOM elements.
Context recreation exists
because WebGL contexts especially may be destroyed by the system
and may need to be recreated even after having acquired a drawing context.

A default implementation is provided by the `BackingCanvas` type, which should be fine for most applications.

The `BackingCanvas` type, upon creation,
contains a `node: HTMLDivElement` property that will contain all relevant DOM nodes
and can be placed in the document and resized with CSS.

Layout will be recalculated automatically when the browser window is resized.
Any other resize events should notify the `BackingCanvas` with a call to `BackingCanvas#didResize`.

#### Map
Map data consists of tiles in an ordinary rectangular grid,
and is provided to the renderer in the form of the `ITileMap` interface.

Specifically, map data is a grid of integer IDs that index one or more tilesets,
which contain the actual details about the tiles.

The most important functions to be implemented are `getTileset` and `getTile`.

- `getTileset(tileType)` should return an `ITileset` object that contains the requested `tileType`.
- `getTile(x, y)` should the tile ID of the tile at the given location.

Data and tilesets can be loaded asynchronously. Any unavailable data should simply be indicated by
returning `null` in the respective getter function.

When the data is available, an update should be signaled to listeners that have been registered
in calls to `addMapUpdateListener` or `addTilesetUpdateListener`.

The WebGL renderer currently renders map data in 8×8 chunks, and having loading boundaries be aligned
to the chunk grid would probably look the nicest.

#### Tilesets
Tilesets contain a number of specific tile types in a single batch.
Ideally, this set of tile types should be co-occurrent in the map for efficient rendering.

Tiles should be laid out in a rectangular grid inside the tileset images.
This grid is then indexed in two dimensions using integer coordinates in definitions of individual tiles.
For best performance, the tileset image should have a pixel size that is a power of 2.

Tile image data is split up into several layers for PBR rendering (see `TileTextureLayer`).
In practice, these are simply a set of several different images.

##### Color
The `Color` layer is an ordinary RGBA color image that contains the base color of the tiles.
This is the only required layer for rendering.

##### Normal
The `Normal` layer encodes normal vectors on the RGB channels and height data on the A channel.
It ignores the sRGB transfer curve.

If the RGB channels are non-zero (i.e. not black), lighting is enabled for this tile.
The RGB channels each encode the XYZ components of the normal vector in world space.
The value range 0–255 maps to −1–1 in vector component values, with 127 being 0.
Vectors do not need to be normalized.

If the A channel is anything but full alpha,
3D lighting adjustment using height data is enabled for this tile.
The value range 0-254 maps to 0–1.99 in height.
This is required for correct display of 3D geometry when using point lights,
but is not really required for it to look acceptable.
For most tiles, setting appropriate tile geometry may be sufficient.

##### Material
The `Material` layer encodes various PBR material properties.
It also ignores the sRGB transfer curve.
The RGB channels encode linear emission values with the transfer function *x ↦ ln(x + 1) / 32 × 255*.
The A channel encodes roughness values where 0 is shiny and 255 is rough.

##### Tile Definitions
The `TileType` interface defines a single tile type.

Individual animation frames are specified with 2D integer coordinates in the tile data
(e.g. `frames: [[0, 0], [1, 0], [2, 0]]` for a 3-frame animation).
These are currently hard-coded to be displayed at 24 frames per second.

These images are then projected onto either a plane or the front or back of a 3D cube.
The 3D geometry of a tile can be selected with `geometry: GeometryType`.
While the default geometry type is a plane to save vertices,
alternate projects may be useful for tiles with lighting data but no height data
to approximate the tile’s depicted geometry.

Finally, tiles may contain a point light in an arbitrary location.
This should be used sparingly, as it slows down the renderer on lower-end devices.

### Camera
The camera rotation looks towards −X/−Y at a pitch of −60° by default, which is the isometric view
that Netgardens would use in most cases.

Due to clipping,
the camera should be positioned sufficiently high (in Z) for tiles in the front to be visible,
and also sufficiently low for tiles in the back to show up.

To get a pixel-perfect view of tile textures,
set the camera’s orthographic scale to a multiple of √2.

The camera API can also be used to generate rays for intersection with world geometry.

#### Example
```ts
import { vec3 } from 'gl-matrix';
import {
    BackingCanvas,
    NetgardensWebGLRenderer,
    TileTextureLayer,
    ITileset,
} from '???/renderer';

// create a backing context
const canvas = new BackingCanvas();
document.body.appendChild(canvas.node);

// set up a tileset
const tilesetColorImage = new Image();
tilesetColorImage.src = 'somewhere/tileset.png';

const tileset = {
    pixelSize: [512, 256],
    textureSize: [2, 1], // 2 tiles horizontally
    tileTypes: [0, 1], // defines two tile types
    getTexture(layer) {
        if (layer === TileTextureLayer.Color) return tilesetColorImage;
        return null; // no other layers available
    },
    getTileType(id) {
        // id 0 is the left tile in the tileset image
        if (id === 0) return { frames: [[0, 0]] };
        // id 1 is the right tile in the tileset image
        else if (id === 1) return { frames: [[1, 0]] };
        return null;
    },
};

// set up a map
const mapData = [[0, 1], [1, 0]];

const tilesetUpdateListeners = new Set();
const mapUpdateListeners = new Set();

const map = {
    getTileset(tileType) {
        if (tileset.tileTypes.includes(tileType)) return tileset;
        return null;
    },
    getTile(x, y) {
        if ((y in mapData) && (x in mapData[y])) return mapData[y][x];
        return null;
    },
    addTilesetUpdateListener: listener => tilesetUpdateListeners.add(listener),
    removeTilesetUpdateListener: listener => tilesetUpdateListeners.delete(listener),
    addMapUpdateListener: listener => mapUpdateListeners.add(listener),
    removeMapUpdateListener: listener => mapUpdateListeners.delete(listener),
};

function signalTilesetUpdate(specificTilesets?: ITileset[]) {
    for (const listener of tilesetUpdateListeners) listener(specificTilesets);
}

const renderer = new NetgardensWebGLRenderer(canvas, map);

// position the camera such that the tile at (0, 0) is actually visible
renderer.camera.position = vec3.fromValues(10, 10, 4);

// render the map! this will probably be a black screen though, because the image hasn't been loaded yet
renderer.render();

tilesetColorImage.onload = () => {
    // the image has now been loaded!
    // the tileset needs to be updated to use the now loaded image,
    // so we'll call signalTilesetUpdate.
    // however, to actually reload the textures from scratch,
    // the specific tileset must be passed in the event.
    signalTilesetUpdate([tileset]);
    // now render the map again, which will hopefully not result in a black screen anymore
    renderer.render();
};
```

### Entities
Entities are arbitrary objects in the scene,
and are accessible through the renderer’s `entities` property.
If the renderer does not support entities, this property may not exist.

They mostly consist of static 3D geometry
defined by an object that conforms to the `IEntity` interface.
Normal vectors may be set to zero if lighting should not be enabled for an entity.

Optionally, an entity may also display an HTML element at its location in the world.

### Lighting
The WebGL renderer is also capable of dynamic lighting (albeit with no shadows).

Tiles without normals in their tile texture will be displayed as expected,
and the color texture will be shown as-is in the final image.
Alpha is blended in linear gamma if available.

Tiles with lighting data will be composited into an HDR framebuffer
(or in-place if HDR framebuffers are not available).
HDR color will be affected by the tile’s material properties, the global lighting,
and any close point lights.
This image will then be compressed into SDR by a final tonemapping function.

#### Global Lighting
Global lighting is accessible from the renderer’s `lighting` property.
If the renderer does not support lighting, this property may not exist.

In the absence of global illumination, a global ambient light can be used to add baseline color to
shadows, such that they aren’t pure black.

A global sun light lights the scene from where the sun direction vector is pointing.
The sun direction vector should be normalized.
The order of magnitude for the sun light’s radiance should be around 10 to 40.
Significantly brighter values may overexpose the scene.

#### Local Lighting
Local lighting currently consists of point lights only.
It should be noted that local lighting comes at a quite significant runtime cost
when there are many lights, as the WebGL renderer is not a deferred renderer.

Both entities and tiles may contain point lights that will light the surrounding scene.
It should be noted that while there is no limit on the brightness of these lights,
they will only reach a certain radius of chunks around them,
after which the lighting is simply cut off and may look bad.
Hence, the radiance should generally be less than about 100.

Animating light positions (e.g. in entities) should be used very sparingly, as this incurs another
non-negligible runtime cost.

## WebGL
The WebGL renderer is a forward renderer that renders the world in vertical 8×8 chunks.

Supported WebGL variations:

- WebGL 1
- WebGL 1 + OES_vertex_arrays
  - this does not change much apart from the handling of vertex array objects
- WebGL 2 + EXT_color_buffer_float/EXT_color_buffer_half_float
  - this will enable HDR compositing
- WebGL 2 + EXT_color_buffer_float/EXT_color_buffer_half_float + OES_texture_float_linear/OES_texture_half_float_linear
  - this will enable HDR compositing and bloom
- WebGL 2 on Android
  - this is an extra support target because WebGL on Android has many strange issues

### Tile Map
The tile map is responsible for rendering the tile world.
This is done in chunks that are culled to fit the view frame exactly.

Chunks are created when they appear on screen
and destroyed shortly after they are no longer visible.
Chunks will be created even if there is no map data.

When a chunk’s data is made available after creation of the chunk,
the chunk will play a loading animation.
If the entire screen had no map data, then the chunks will play a fancier loading animation.

Local lighting is calculated in the same chunks as render chunks.
Each chunk has a list of point lights that are its own,
and receives a list of external point lights from surrounding chunks.

A single render call will render up to 4 lights,
and a chunk will be rendered multiple times if there are more.
On WebGL variations without HDR compositing,
this will slightly (or sometimes significantly) distort colors.
There is also a hard limit for how many lights can contribute to the lighting of a single chunk.
Hence, a chunk’s own lights (which will probably contribute the most light)
are prioritized to be first.

### Entities
Entities are rendered after the tile map and rely on the Z-buffer to be composited correctly.
Entity backfaces will be culled by default, unless they are on the UI layer.

For local lighting,
entities use the lighting data from the chunk in which they are currently located.

### Macrotiles
Macrotiles are impostors for tile chunks and kind of glitchy.
Specifically, they do not interact well with lighting.
When enabled, tile chunks will render their contents to a separate framebuffer, which will then be
projected onto the macrotile and rendered as a single unit.

### Composite
The hybrid SDR-HDR composite is achieved by rendering to a color render target
and an additional HDR mask render target.
Tonemapping is only applied where the mask indicates HDR content.
Whilel this does cause strange alpha blending issues, they are usually not that noticeable.

Bloom samples several mipmap LODs,
each applies a threshold, a gaussian blur,
and adds them to the composite (before tonemapping).
