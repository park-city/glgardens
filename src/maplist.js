import MapData from "./renderer/mapdata"

// tilemap definitions (TODO: LOAD FROM SERVER)
// also, should these even be stored like this? idk lol
export const CentralPark = new MapData(
	{
		color: 'central-park 2.png',
		normal: 'central-park 2-normal.png',
		material: 'central-park 2-material.png',
	},
	"testmap2.csv",
	{
		0: { frames: [[0, 0]], geometry: GeometryType.CubeBack },
		1: { frames: [[0, 1]], geometry: GeometryType.CubeBack },
		2: { frames: [[0, 2]], geometry: GeometryType.CubeBack },
		3: { frames: [[0, 3]], geometry: GeometryType.CubeBack },
		4: { frames: [[0, 4]], geometry: GeometryType.CubeFront },
		5: { frames: [[0, 5]], geometry: GeometryType.Flat },
		6: { frames: [[0, 6]], geometry: GeometryType.CubeBack },
		7: { frames: [[0, 7]], pointLight: { pos: [0.5, 0.5, 0.9], radiance: [1 * 80, 0.8 * 50, 0.4 * 50] } },
		8: {
			frames: [
				[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7],
				[2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7],
				[3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
			],
		},
		9: { frames: [[3, 5]], pointLight: { pos: [0.5, 0.5, 1.3], radiance: [0.2 * 50, 0.7 * 50, 1 * 50] } },
		10: { frames: [[3, 6]] },
		11: { frames: [[3, 7]] },
		20: { frames: [[4, 0]] },
		21: { frames: [[4, 1]] },
		22: { frames: [[4, 2]] },
		23: { frames: [[4, 3]] },
		24: { frames: [[4, 4]], geometry: GeometryType.CubeFront },
		25: { frames: [[4, 5]], geometry: GeometryType.Flat },
		26: { frames: [[4, 6]] },
		27: { frames: [[4, 7]], pointLight: { pos: [0.5, 0.5, 0.9], radiance: [1 * 80, 0.8 * 50, 0.4 * 50] } },
	},
	[8, 8]
);
export const CyberTest = new MapData(
	{
		color: 'cybertest-color.png',
		normal: 'cybertest-normal.png',
		material: 'cybertest-material.png',
	},
	"testmap2.csv",
	{
		100: { frames: [[0, 0]], pointLight: { pos: [0.5, 0.5, 0.5], radiance: [0, 80, 24] } },
		101: { frames: [[1, 0]] },
		104: { frames: [[0, 1]], pointLight: { pos: [0.5, 0.5, 0.5], radiance: [0, 7, 80] } },
		105: { frames: [[1, 1]] },
		108: { frames: [[0, 2]], pointLight: { pos: [0.5, 0.5, 0.5], radiance: [0, 80, 0] } },
		112: { frames: [[0, 3]], pointLight: { pos: [0.5, 0.5, 0.5], radiance: [80, 0, 4] } },
	},
	[4, 4]
);