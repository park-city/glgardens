import { GeometryType, TileTextureLayer } from '.';
import { vec2, vec3 } from 'gl-matrix';
import { ITileMap } from "."
// A higher level tile map. In desperate need of a rename.

// type definitions (todo: move to typedefs.ts)
export interface ImgPaths {
	color: string;
	normal?: string;
	material?: string;
}
export interface Tiles {
	[index: number]: {
		frames: Array<Array<number>>,
		geometry?: GeometryType,
		pointLight?: {
			pos: vec3,
			radiance: vec3
		},
	}
};

// MapData class
export class MapData implements ITileMap {
	imagePaths: ImgPaths;
	mapPath: string;
	tiles: Tiles;
	images: any;
	mapData: any;
	pixelSize: any;
	textureSize: vec2;
	tileTypes: number[];
	rawTiles: any;

	delay = 1000;
	dcSize = 32;

	loadedSections = new Map();
	mapListeners = new Set<any>();
	tileSetListeners = new Set<any>();

	// Load image from the webserver
	loadImage(src: string)
	{
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.src = src;
			img.onload = () => resolve(img);
			img.onerror = () => reject();
		});
	}

	// load all images from list
	loadImages(imagePaths: ImgPaths)
	{
		const promises = [];
		for (const k in imagePaths) {
			promises.push(
				this.loadImage(imagePaths[k])
				.then(res => [k, res])
			);
		}
		return Promise.all(promises).then(
			results => Object.fromEntries(results)
		);
	}

	loadMapData(url: string)
	{
		return fetch(url).then(res => {
			if (!res.ok) throw new Error('Failed to fetch test map');
			return res.text();
		}).then(data => {
			const rawTiles = data
				.split('\n')
				.filter(x => x)
				.map(line => line.split(',').map(x => +x));

			return 		});
	}

	getRawTile(x: number, y: number) {
		const w = this.rawTiles[0].length;
		const h = this.rawTiles.length;

		let px = Math.floor((x - y) / 2);
		let py = y + x;

		py = (py % h + h) % h;
		px = ((px % w + w) % w);

		let tileId = this.rawTiles[py] && this.rawTiles[py][px];
		if (!Number.isFinite(tileId)) return null;
		if (px >= w / 2 && py < h / 2 && tileId <= 7) tileId += 20;
		return tileId;
	};
s

	getTexture(layer: TileTextureLayer) {
		if (layer === TileTextureLayer.Color) return this.images.color;
		if (layer === TileTextureLayer.Normal) return this.images.normal;
		if (layer === TileTextureLayer.Material) return this.images.material;
		return null;
	}

	getTileType(id: number) {
		return (this.tiles as any)[id] || null;
	}

        getTile(x: number, y: number) {
            const offX = Math.floor(x / this.dcSize);
            const offY = Math.floor(y / this.dcSize);
            const offKey = `${offX},${offY}`;
            if (!this.loadedSections.has(offKey)) {
                this.loadedSections.set(offKey, false);
                setTimeout(() => {
                    this.loadedSections.set(offKey, true);

                    for (const l of this.mapListeners) {
                        l(
				offX * this.dcSize,
				offY * this.dcSize,
				this.dcSize, this.dcSize
			);
                    }
                }, this.delay);
            }
            if (!this.loadedSections.get(offKey)) return null;
            return this.getRawTile(x, y);
        }

        addTilesetUpdateListener (l: any) {
		this.tileSetListeners.add(l);
	}
        removeTilesetUpdateListener (l: any) {
		this.tileSetListeners.delete(l);
	}
        addMapUpdateListener (l: any) {
		this.mapListeners.add(l);
	}
        removeMapUpdateListener (l: any) {
		this.mapListeners.delete(l);
	}

	constructor(
		imagePaths: ImgPaths,
		mapPath: string,
		tiles: Tiles,
		textureSize: vec2
	) {
		this.imagePaths = imagePaths;
		this.mapPath = mapPath;
		this.tiles = tiles;
		this.textureSize = textureSize;

		// todo: this, but in parallel
		this.images = this.loadImages(this.imagePaths);
		this.mapData = this.loadMapData(this.mapPath);

		// FIXME: this might fail because of the promises
		this.pixelSize = [this.images.color.width, this.images.color.height];
		this.tileTypes = Object.keys(this.tiles).map(x => +x);
	}
}
