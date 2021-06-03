// super hacky test page

import {
    BackingCanvas, EntityLayer,
    EntityTextureLayer,
    GeometryType,
    NetgardensWebGLRenderer,
    TileTextureLayer
} from './renderer';
import { mat4, quat, vec2, vec3, vec4 } from 'gl-matrix';

document.body.style.background = '#123';
document.body.style.margin = '0px';
document.body.style.position = 'fixed';
document.body.style.overflow = 'hidden';

const touchControls = document.createElement('div');
Object.assign(touchControls.style, {
    position: 'fixed',
    right: '10px',
    bottom: '10px',
    marginRight: 'env(safe-area-inset-right)',
    marginBottom: 'env(safe-area-inset-bottom)',
    visibility: 'hidden',
    zIndex: '5',
});
touchControls.addEventListener('touchstart', e => e.stopPropagation(), { passive: false });
touchControls.addEventListener('touchmove', e => e.stopPropagation(), { passive: false });
touchControls.addEventListener('touchend', e => e.stopPropagation(), { passive: false });
touchControls.innerHTML = `
<div>
    <button id="zoom-out">zoom out</button>
    <button id="zoom-in">zoom in</button>
    <button id="persp">persp</button>
</div>
<div>
    <button id="up">up</button>
    <button id="down">down</button>
</div>
<div>
    <button id="rleft">&lt;</button>
    <button id="rup">^</button>
    <button id="rdown">v</button>
    <button id="rright">&gt;</button>
</div>
`;
document.body.appendChild(touchControls);

function loadImage(src: string) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = () => reject();
    });
}

async function loadModel(src: string) {
    const res = await fetch(src);
    const text = await res.text();
    const lines = text.split('\n');
    const objVertices = [];
    const objUvs = [];
    const objNormals = [];
    for (const _line of lines) {
        const line = _line.trim();
        const parts = line.split(/\s+/);
        if (parts[0] === 'v') objVertices.push(parts.slice(1).map(x => +x));
        else if (parts[0] === 'vt') objUvs.push(parts.slice(1).map(x => +x));
        else if (parts[0] === 'vn') objNormals.push(parts.slice(1).map(x => +x));
    }
    const vertices = [];
    const uvs = [];
    const normals = [];
    const indexCache = new Map<string, number>();
    const faces = [];
    for (const _line of lines) {
        const line = _line.trim();
        const parts = line.split(/\s+/);
        if (parts[0] === 'f') {
            const face = [];
            for (let i = 1; i < parts.length; i++) {
                const faceVertexParts = parts[i].split('/');
                const faceVertex = +faceVertexParts[0];
                const faceUv = +faceVertexParts[1];
                const faceNormal = +faceVertexParts[2];
                const indexKey = [faceVertex, faceUv, faceNormal].join('/');
                let index;
                if (indexCache.has(indexKey)) {
                    index = indexCache.get(indexKey);
                } else {
                    index = vertices.length;
                    vertices.push(vec3.fromValues(
                        objVertices[faceVertex - 1][0] || 0,
                        objVertices[faceVertex - 1][2] || 0,
                        objVertices[faceVertex - 1][1] || 0,
                    ));
                    uvs.push(vec2.fromValues(
                        objUvs[faceUv - 1][0] || 0,
                        1 - (objUvs[faceUv - 1][1] || 0),
                    ));
                    normals.push(vec3.fromValues(
                        objNormals[faceNormal - 1][0] || 0,
                        objNormals[faceNormal - 1][2] || 0,
                        objNormals[faceNormal - 1][1] || 0,
                    ));
                    indexCache.set(indexKey, index);
                }
                face.push(index);
            }
            faces.push(face);
        }
    }
    return { vertices, uvs, normals, faces };
}

const imagePaths = {
    centralPark: 'central-park 2.png',
    centralParkNormal: 'central-park 2-normal.png',
    centralParkMaterial: 'central-park 2-material.png',
    cybertestColor: 'cybertest-color.png',
    cybertestNormal: 'cybertest-normal.png',
    cybertestMaterial: 'cybertest-material.png',
    traintestColor: 'traintest-color.png',
    traintestNormal: 'traintest-normal.png',
    traintestMaterial: 'traintest-material.png',
    traintestTrainColor: 'traintest-train-color.png',
    traintestTrainMaterial: 'traintest-train-material.png',
};
const images = (() => {
    const promises = [];
    for (const k in imagePaths) {
        // @ts-ignore
        promises.push(loadImage(imagePaths[k]).then(res => [k, res]));
    }
    return Promise.all(promises).then(results => Object.fromEntries(results));
})();

const mapData = fetch('testmap2.csv').then(res => {
    if (!res.ok) throw new Error('Failed to fetch test map');
    return res.text();
}).then(data => {
    const rawTiles = data.split('\n').filter(x => x).map(line => line.split(',').map(x => +x));

    return (x: number, y: number) => {
        const w = rawTiles[0].length;
        const h = rawTiles.length;

        let px = Math.floor((x - y) / 2);
        let py = y + x;

        py = (py % h + h) % h;
        px = ((px % w + w) % w);

        let tileId = rawTiles[py] && rawTiles[py][px];
        if (!Number.isFinite(tileId)) return null;
        if (px >= w / 2 && py < h / 2 && tileId <= 7) tileId += 20;
        return tileId;
    };
});

const modelPaths = {
    traintest: 'traintest-geometry.obj',
};
const models = (() => {
    const promises = [];
    for (const k in modelPaths) {
        // @ts-ignore
        promises.push(loadModel(modelPaths[k]).then(res => [k, res]));
    }
    return Promise.all(promises).then(results => Object.fromEntries(results));
})();

Promise.all([images, mapData, models]).then(([images, getRawMapTile, models]) => {
    const centralParkTiles = {
        0: { frames: [[0, 0]], geometry: GeometryType.CubeBack },
        1: { frames: [[0, 1]], geometry: GeometryType.CubeBack },
        2: { frames: [[0, 2]], geometry: GeometryType.CubeBack },
        3: { frames: [[0, 3]], geometry: GeometryType.CubeBack },
        4: { frames: [[0, 4]], geometry: GeometryType.CubeFront },
        5: { frames: [[0, 5]], geometry: GeometryType.Flat },
        6: { frames: [[0, 6]], geometry: GeometryType.CubeBack },
        7: {
            frames: [[0, 7]],
            pointLight: { pos: [0.5, 0.5, 0.9], radiance: [1 * 80, 0.8 * 50, 0.4 * 50] }
        },
        8: {
            frames: [
                [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7],
                [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7],
                [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
            ],
        },
        9: {
            frames: [[3, 5]],
            pointLight: { pos: [0.5, 0.5, 1.3], radiance: [0.2 * 50, 0.7 * 50, 1 * 50] }
        },
        10: { frames: [[3, 6]] },
        11: { frames: [[3, 7]] },
        20: { frames: [[4, 0]] },
        21: { frames: [[4, 1]] },
        22: { frames: [[4, 2]] },
        23: { frames: [[4, 3]] },
        24: { frames: [[4, 4]], geometry: GeometryType.CubeFront },
        25: { frames: [[4, 5]], geometry: GeometryType.Flat },
        26: { frames: [[4, 6]] },
        27: {
            frames: [[4, 7]],
            pointLight: { pos: [0.5, 0.5, 0.9], radiance: [1 * 80, 0.8 * 50, 0.4 * 50] }
        },
    };
    const centralPark = {
        pixelSize: [images.centralPark.width, images.centralPark.height] as [number, number],
        textureSize: [8, 8] as [number, number],
        tileTypes: Object.keys(centralParkTiles).map(x => +x),
        getTexture(layer: TileTextureLayer) {
            if (layer === TileTextureLayer.Color) return images.centralPark;
            if (layer === TileTextureLayer.Normal) return images.centralParkNormal;
            if (layer === TileTextureLayer.Material) return images.centralParkMaterial;
            return null;
        },
        getTileType(id: number) {
            return (centralParkTiles as any)[id] || null;
        },
    };

    const cybertestTiles = {
        100: { frames: [[0, 0]], pointLight: { pos: [0.5, 0.5, 0.5], radiance: [0, 80, 24] } },
        101: { frames: [[1, 0]] },
        104: { frames: [[0, 1]], pointLight: { pos: [0.5, 0.5, 0.5], radiance: [0, 7, 80] } },
        105: { frames: [[1, 1]] },
        108: { frames: [[0, 2]], pointLight: { pos: [0.5, 0.5, 0.5], radiance: [0, 80, 0] } },
        112: { frames: [[0, 3]], pointLight: { pos: [0.5, 0.5, 0.5], radiance: [80, 0, 4] } },
    };
    const cybertest = {
        pixelSize: [images.cybertestColor.width, images.cybertestColor.height] as [number, number],
        textureSize: [4, 4] as [number, number],
        tileTypes: Object.keys(cybertestTiles).map(x => +x),
        getTexture(layer: TileTextureLayer) {
            if (layer === TileTextureLayer.Color) return images.cybertestColor;
            if (layer === TileTextureLayer.Normal) return images.cybertestNormal;
            if (layer === TileTextureLayer.Material) return images.cybertestMaterial;
            return null;
        },
        getTileType(id: number) {
            return (cybertestTiles as any)[id] || null;
        },
    };

    const traintestTiles = {
        200: { frames: [[0, 0]], geometry: GeometryType.CubeBack },
        201: { frames: [[1, 0]], geometry: GeometryType.CubeBack },
        202: { frames: [[0, 1]], geometry: GeometryType.CubeBack },
        203: { frames: [[1, 1]], geometry: GeometryType.CubeBack },
        204: { frames: [[0, 2]], geometry: GeometryType.CubeBack },
        205: { frames: [[1, 2]], geometry: GeometryType.CubeBack },
    };
    const traintest = {
        pixelSize: [images.traintestColor.width, images.traintestColor.height] as [number, number],
        textureSize: [4, 4] as [number, number],
        tileTypes: Object.keys(traintestTiles).map(x => +x),
        getTexture(layer: TileTextureLayer) {
            if (layer === TileTextureLayer.Color) return images.traintestColor;
            if (layer === TileTextureLayer.Normal) return images.traintestNormal;
            if (layer === TileTextureLayer.Material) return images.traintestMaterial;
            return null;
        },
        getTileType(id: number) {
            return (traintestTiles as any)[id] || null;
        },
    };
    const traintestEntityMaterial = {
        pixelSize: [1024, 1024],
        getTexture(layer: EntityTextureLayer) {
            if (layer === EntityTextureLayer.Color) return images.traintestTrainColor;
            if (layer === EntityTextureLayer.Material) return images.traintestTrainMaterial;
            return null;
        },
    };
    const traintestEntity = {
        chunks: [{
            ...models.traintest,
            material: traintestEntityMaterial,
            lights: [{
                pos: vec3.fromValues(0, 0.52, 0.82782),
                radiance: vec3.fromValues(27, 24, 15),
            }],
        }],
        layer: EntityLayer.Map,
    };

    const delay = 1000;
    const dcSize = 32;

    const loadedSections = new Map();
    const mapListeners = new Set<any>();
    const tileSetListeners = new Set<any>();

    return {
        mapData: {
            getTileset: (id: number) => {
                if (id.toString() in centralParkTiles) return centralPark;
                if (id.toString() in cybertestTiles) return cybertest;
                if (id.toString() in traintestTiles) return traintest;
                return null;
            },
            getTile: (x: number, y: number) => {
                const offX = Math.floor(x / dcSize);
                const offY = Math.floor(y / dcSize);
                const offKey = `${offX},${offY}`;
                if (!loadedSections.has(offKey)) {
                    loadedSections.set(offKey, false);
                    setTimeout(() => {
                        loadedSections.set(offKey, true);

                        for (const l of mapListeners) {
                            l(offX * dcSize, offY * dcSize, dcSize, dcSize);
                        }
                    }, delay);
                }
                if (!loadedSections.get(offKey)) return null;
                return getRawMapTile(x, y);
            },
            addTilesetUpdateListener: (l: any) => tileSetListeners.add(l),
            removeTilesetUpdateListener: (l: any) => tileSetListeners.delete(l),
            addMapUpdateListener: (l: any) => mapListeners.add(l),
            removeMapUpdateListener: (l: any) => mapListeners.delete(l),
        },
        traintestEntity,
    };
}).then(data => {
    const backingCanvas = new BackingCanvas();
    Object.assign(backingCanvas.node.style, {
        width: '100vw',
        height: '100vh',
    });
    document.body.appendChild(backingCanvas.node);

    const c = document.createElement('canvas');
    const cgl2 = c.getContext('webgl2');
    const hasWebGL2 = !!cgl2;
    const hasFloatFBO = !!(cgl2 && (cgl2.getExtension('EXT_color_buffer_float')
        || cgl2.getExtension('EXT_color_buffer_half_float')));

    let rendererSettings = {
        type: hasWebGL2 ? 'gl2' : 'gl1',
        float: hasFloatFBO,
        useFloatNormals: false,
        useLinearNormals: false,
        // WebGL1 with point lights is super laggy on Android
        enablePointLights: !navigator.userAgent.includes('Android') || hasWebGL2,
        useMacrotiles: false,

        debugType: 'normal',
    };

    const DEBUG_TYPES = {
        normal: {},
        geometry: { showGeometry: true },
        lightVolumes: { showLightVolumes: true },
        bloom: { showBloom: true },
        forceAdreno: { forceAdreno: true },
    };

    let renderer: NetgardensWebGLRenderer;
    const makeRenderer = () => {
        if (renderer) renderer.dispose();
        renderer = new NetgardensWebGLRenderer(backingCanvas, data.mapData, {
            ...rendererSettings,
            useWebGL2: rendererSettings.type === 'gl2',
            useFboFloat: rendererSettings.float ? 'full' : 'none',
            debug: (DEBUG_TYPES as any)[rendererSettings.debugType],
        });
        renderer.render();

        (window as any).renderer = renderer;
    };
    makeRenderer();

    const keysDown = new Set();
    const MIN_ZOOM = Math.sqrt(2) / 16;
    const MAX_ZOOM = Math.sqrt(2) * 4;
    const MIN_FOV = Math.atan(0.1);
    const MAX_FOV = Math.atan(2);
    const pos = [10, -5, 40];
    let rot = 0;
    let rotH = 0;
    let zoom = Math.sqrt(2);
    let fov = Math.atan(0.5);
    let persp = false;

    let zoomVelocity = 0;

    const debugBar = document.createElement('div');
    Object.assign(debugBar.style, {
        position: 'fixed',
        top: '10px',
        left: '10px',
        background: 'rgba(0, 0, 0, 0.7)',
        color: '#fff',
        font: '12px sans-serif',
        padding: '4px',
    });
    document.body.appendChild(debugBar);
    const debugBarInfoLine = document.createElement('div');
    debugBarInfoLine.style.font = '12px monospace';
    debugBar.appendChild(debugBarInfoLine);
    const debugBarSettings = document.createElement('div');
    debugBar.appendChild(debugBarSettings);

    const cursorCanvas = document.createElement('canvas');
    cursorCanvas.width = cursorCanvas.height = 256;
    const cursorCtx = cursorCanvas.getContext('2d')!;
    const overlayEntity = {
        chunks: [{
            vertices: [[-0.2, -0.2, 0], [1.2, -0.2, 0], [1.2, 1.2, 0], [-0.2, 1.2, 0]] as vec3[],
            uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] as vec2[],
            normals: [],
            faces: [[0, 1, 2, 3]],
            material: {
                pixelSize: [256, 256] as vec2,
                getTexture: (layer: EntityTextureLayer) => {
                    if (layer === EntityTextureLayer.Color) return cursorCanvas;
                    return null;
                },
            },
            lights: [],
        }],
        layer: EntityLayer.Ui,
    };

    let doLoopRender = true;

    let lastTime = Date.now();
    let fpsSamples: number[] = [];
    let renderEncodeSamples: number[] = [];
    let t = 0;
    const l = () => {
        const dt = Math.min(1 / 30, (Date.now() - lastTime) / 1000);
        lastTime = Date.now();
        t += dt;

        if (persp) {
            fov -= zoomVelocity / 2 * dt;
            fov = Math.max(MIN_FOV, Math.min(MAX_FOV, fov));
        } else {
            zoom *= (1 + zoomVelocity * dt);
            zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
        }

        // renderer.lighting.ambientRadiance = vec3.fromValues(0, 0.05, 0.2);
        renderer.lighting.ambientRadiance = vec3.fromValues(0, 0.5, 1.0);
        const sunCycleT = -3.7;
        const sunZ = Math.cos(sunCycleT / 4);
        renderer.lighting.sunDir = vec3.normalize(vec3.create(), [
            -Math.sin(sunCycleT / 4),
            Math.sin(sunCycleT / 4),
            sunZ,
        ]);
        const sunR = Math.max(0, 1 - Math.exp(-7 * (sunZ + 0.5)));
        renderer.lighting.sunRadiance[0] = sunR * (6 * Math.max(0, sunZ) + 10);
        renderer.lighting.sunRadiance[1] = sunR * (15 * Math.max(0, sunZ) + 7);
        renderer.lighting.sunRadiance[2] = sunR * (25 * Math.max(0, sunZ));

        if (!renderer.entities.get('traintest')) {
            renderer.entities.create('traintest', data.traintestEntity);
        }
        {
            const train = renderer.entities.get('traintest')!;
            const minX = 11.5;
            const minY = -2.5;
            const maxX = minX + 6;
            const maxY = minY + 10;
            const tParts = [
                { mode: 'lerp', from: [minX + 0.5, minY, -90], to: [maxX - 0.5, minY, -90], duration: 5 },
                { mode: 'arc', at: [maxX - 0.5, minY + 0.5], arc: [0.5, -90, 0], duration: 1 },
                { mode: 'lerp', from: [maxX, minY + 0.5, 0], to: [maxX, maxY - 0.5, 0], duration: 9 },
                { mode: 'arc', at: [maxX - 0.5, maxY - 0.5], arc: [0.5, 0, 90], duration: 1 },
                { mode: 'lerp', from: [maxX - 0.5, maxY, 90], to: [minX + 0.5, maxY, 90], duration: 5 },
                { mode: 'arc', at: [minX + 0.5, maxY - 0.5], arc: [0.5, 90, 180], duration: 1 },
                { mode: 'lerp', from: [minX, maxY - 0.5, 180], to: [minX, minY + 0.5, 180], duration: 9 },
                { mode: 'arc', at: [minX + 0.5, minY + 0.5], arc: [0.5, 180, 270], duration: 1 },
            ];
            const totalDuration = tParts.map(x => x.duration).reduce((a, b) => a + b);
            const trainT = t % totalDuration;

            let currentT = 0;
            let currentPart: any;
            for (const part of tParts) {
                if (trainT >= currentT && trainT < currentT + part.duration) {
                    currentPart = part;
                    currentT = (trainT - currentT) / part.duration;
                    break;
                }
                currentT += part.duration;
            }
            let pos = vec3.create();
            if (currentPart.mode === 'lerp') {
                vec3.lerp(pos, currentPart.from, currentPart.to, currentT);
            } else if (currentPart.mode === 'arc') {
                const arc = currentPart.arc;
                const t = (arc[2] - arc[1]) * currentT + arc[1];
                const tr = t / 180 * Math.PI;
                const v = vec3.fromValues(arc[0] * Math.cos(tr), arc[0] * Math.sin(tr), 0);
                vec3.add(pos, [currentPart.at[0], currentPart.at[1], t], v);
            }

            train.position[0] = pos[0];
            train.position[1] = pos[1];
            train.position[2] = 0.15;
            quat.fromEuler(train.rotation, 0, 0, pos[2]);
            train.transformNeedsUpdate = true;
        }
        if (!renderer.entities.get('cursor')) {
            renderer.entities.create('cursor', overlayEntity);
        }
        {
            const entity = renderer.entities.get('cursor')!;
            (entity as any).hframe = ((entity as any).hframe | 0) + 1;
            const t = (entity as any).htime = ((entity as any).htime || 0) + dt;
            if ((entity as any).hframe % 2 === 0) {
                const h = Math.cos(t * 3) / 2 + 0.5 + 0.5 * Math.exp(-t * 10) - 4 * Math.exp(-t * 14);
                const s = 256;
                const dh = 1 / 7 * s - h * 20;
                const dph = 32;
                cursorCtx.save();
                cursorCtx.globalAlpha = 1 - Math.exp(-t * 16);
                cursorCtx.clearRect(0, 0, 256, 256);

                const cx = 128 + Math.cos(t) * 100;
                const cy = 128 + Math.sin(t) * 100;
                const g = cursorCtx.createRadialGradient(cx, cy, 0, cx, cy, 256);
                g.addColorStop(0, '#fff');
                g.addColorStop(1, 'rgba(255, 255, 255, 0)');
                cursorCtx.strokeStyle = g;
                cursorCtx.lineWidth = 8;
                cursorCtx.strokeRect(1 / 7 * s, 1 / 7 * s, 5 / 7 * s, 5 / 7 * s);

                cursorCtx.lineCap = 'square';
                cursorCtx.beginPath();
                cursorCtx.moveTo(dh + dph, dh);
                cursorCtx.lineTo(dh, dh);
                cursorCtx.lineTo(dh, dh + dph);
                cursorCtx.moveTo(s - dh - dph, dh);
                cursorCtx.lineTo(s - dh, dh);
                cursorCtx.lineTo(s - dh, dh + dph);
                cursorCtx.moveTo(s - dh - dph, s - dh);
                cursorCtx.lineTo(s - dh, s - dh);
                cursorCtx.lineTo(s - dh, s - dh - dph);
                cursorCtx.moveTo(dh + dph, s - dh);
                cursorCtx.lineTo(dh, s - dh);
                cursorCtx.lineTo(dh, s - dh - dph);
                cursorCtx.strokeStyle = '#fff';
                cursorCtx.lineWidth = 32 * (1 + Math.exp(-t * 10));
                cursorCtx.stroke();
                cursorCtx.strokeStyle = '#000';
                cursorCtx.lineWidth = 20 * (1 + Math.exp(-t * 10));
                cursorCtx.stroke();
                cursorCtx.restore();
                entity.updateMaterials();
            }
        }

        renderer.camera.position = [15, 15, 4];
        renderer.camera.rotation = quat.fromEuler(quat.create(), -60, 0, -45);

        const a = Math.tan((60 - rotH * 16) / 180 * Math.PI);
        renderer.camera.position = [pos[0] + Math.cos(rot + Math.PI / 4) * a * pos[2], pos[1] + Math.sin(rot + Math.PI / 4) * a * pos[2], pos[2]];
        renderer.camera.rotation = quat.fromEuler(quat.create(), -60, 0, rot / Math.PI * 180 - 90);
        renderer.camera.orthoScale = zoom * 128;
        renderer.camera.fov = fov;
        renderer.camera.rotation = quat.fromEuler(quat.create(), -60 + rotH * 16, 0, (rot + Math.PI / 4) / Math.PI * 180 - 90);
        if (!persp) {
            rot -= 4 * rot * dt;
            rotH -= 4 * rotH * dt;
        }
        if (keysDown.has('e')) pos[2] += 8 * dt;
        if (keysDown.has('q')) pos[2] -= 8 * dt;
        if (keysDown.has('d')) rot += dt;
        if (keysDown.has('a')) rot -= dt;
        if (keysDown.has('w')) rotH -= dt;
        if (keysDown.has('s')) rotH = Math.min(60 / 16, rotH + dt);
        {
            if (persp && renderer.camera.perspective < 1) {
                const t = Math.sqrt(renderer.camera.perspective);
                renderer.camera.perspective = (t + dt) ** 2;
            } else if (!persp && renderer.camera.perspective > 0) {
                const k = 4;
                const t = renderer.camera.perspective ** (1 / k);
                renderer.camera.perspective = Math.max(0, t - dt) ** k;
                if (renderer.camera.perspective < 0.0001) renderer.camera.perspective = 0;
            }
            renderer.camera.perspective = Math.max(0, Math.min(1, renderer.camera.perspective));
        }


        const start = window.performance ? performance.now() : Date.now();
        renderer.render();
        const end = window.performance ? performance.now() : Date.now();
        const renderDt = end - start;

        const padn = (n: number) => (k: any) => ('0'.repeat(n) + k).substr(-n);
        const pad2 = padn(2);
        const pad4 = padn(4);
        const pad5 = padn(5);
        const fps = Math.floor(1 / dt);
        fpsSamples.push(fps);
        renderEncodeSamples.push(renderDt);
        while (fpsSamples.length > 10) fpsSamples.shift();
        while (renderEncodeSamples.length > 10) renderEncodeSamples.shift();
        const avgFps = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
        const avgRenderDt = renderEncodeSamples.reduce((a, b) => a + b, 0) / renderEncodeSamples.length;
        debugBarInfoLine.textContent = [
            `fps: ${pad2(fps)}/${pad5(renderDt.toFixed(2))}ms`,
            `avg 10 frames: ${pad4(avgFps.toFixed(1))}/${pad5(avgRenderDt.toFixed(2))}ms`,
            `debug controls: P/QE/WASD`
        ].join(' | ');

        if (doLoopRender) requestAnimationFrame(l);
    };
    l();

    {
        Object.assign(debugBarSettings.style, { paddingTop: '8px' });
        debugBarSettings.innerHTML = `
        <select id="renderer-type">
            <option value="gl1">WebGL</option>
            ${hasWebGL2 ? '<option value="gl2" selected>WebGL 2</option>' : ''}
        </select>
        <button id="play-pause"></button>
        <button id="step-render">1</button>
        <button id="capture-render">EXR</button>
        <select id="ds-debug"></select>
        <input type="checkbox" id="renderer-float" />
        <label for="renderer-float">Float Composite</label>
        <input type="checkbox" id="ds-linear-normals" />
        <label for="ds-linear-normals">Smooth Normals</label>
        <input type="checkbox" id="ds-point-lights" />
        <label for="ds-point-lights">Point Lights</label>
        <input type="checkbox" id="ds-macrotiles" />
        <label for="ds-macrotiles">GFX Cache (⚠)</label>
        `;

        const rendererType = debugBarSettings.querySelector('#renderer-type')! as HTMLSelectElement;
        rendererType.addEventListener('change', () => {
            rendererSettings.type = rendererType.value;
            makeRenderer();
        });

        const rendererCheckbox = (id: string, setting: keyof typeof rendererSettings, enabled: boolean) => {
            const chk = debugBarSettings.querySelector(id)! as HTMLInputElement;
            chk.disabled = !enabled;
            chk.checked = (rendererSettings as any)[setting];
            chk.addEventListener('change', () => {
                (rendererSettings as any)[setting] = chk.checked;
                makeRenderer();
            });
        }

        rendererCheckbox('#renderer-float', 'float', hasFloatFBO);
        rendererCheckbox('#ds-linear-normals', 'useLinearNormals', true);
        rendererCheckbox('#ds-point-lights', 'enablePointLights', true);
        rendererCheckbox('#ds-macrotiles', 'useMacrotiles', true);

        const pi = ['>', '||'];
        const playPause = debugBarSettings.querySelector('#play-pause')!;
        const stepRender = debugBarSettings.querySelector('#step-render')! as HTMLButtonElement;
        playPause.textContent = pi[1];
        stepRender.disabled = true;
        playPause.addEventListener('click', () => {
            doLoopRender = !doLoopRender;
            playPause.textContent = pi[+doLoopRender];
            if (doLoopRender) l();
            stepRender.disabled = doLoopRender;
            (window as any).ngDebug = !doLoopRender;
        });

        stepRender.addEventListener('click', () => {
            l();
        });

        debugBarSettings.querySelector('#capture-render')!.addEventListener('click', () => {
            try {
                const { size, pixels } = renderer.capture();
                const exrBuffer = writeExr(size, pixels);
                const a = document.createElement('a');
                const objURL = URL.createObjectURL(new File([exrBuffer], 'capture.exr', { type: 'image/x-exr' }));
                a.href = objURL;
                a.download = 'capture.exr';
                a.click();
                URL.revokeObjectURL(objURL);
            } catch (err) {
                alert(err);
            }
        });

        const dsDebug = debugBarSettings.querySelector('#ds-debug')! as HTMLSelectElement;
        for (const t of Object.keys(DEBUG_TYPES)) {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            dsDebug.appendChild(opt);
        }
        dsDebug.addEventListener('change', () => {
            rendererSettings.debugType = dsDebug.value;
            makeRenderer();
        });
    }

    let lastPos = [0, 0];
    let isDown = false;
    backingCanvas.node.addEventListener('touchstart', e => {
        e.preventDefault();
        touchControls.style.visibility = 'visible';
    }, { passive: false });
    backingCanvas.node.addEventListener('touchmove', e => {
        e.preventDefault();
    }, { passive: false });

    backingCanvas.node.addEventListener('pointerdown', e => {
        e.preventDefault();
        lastPos = [e.offsetX, e.offsetY];
        isDown = true;
    });
    backingCanvas.node.addEventListener('pointermove', e => {
        if (!isDown) {
            const entity = renderer.entities.get('cursor');
            if (entity) {
                const pos = renderer.getGroundLocation(e.offsetX, e.offsetY);
                const x = Math.floor(pos[0]);
                const y = Math.floor(pos[1]);
                if (x !== entity.position[0] || y !== entity.position[1]) {
                    entity.position[0] = Math.floor(pos[0]);
                    entity.position[1] = Math.floor(pos[1]);
                    (entity as any).htime = 0;
                    cursorCtx.clearRect(0, 0, 256, 256);
                    entity.updateMaterials();
                    entity.transformNeedsUpdate = true;
                }
            }

            return;
        }
        e.preventDefault();
        const dx = e.offsetX - lastPos[0];
        const dy = e.offsetY - lastPos[1];
        lastPos = [e.offsetX, e.offsetY];
        const proj = renderer.camera.getProjection(renderer.backingContext.width, renderer.backingContext.height);
        mat4.multiply(proj, proj, renderer.camera.getView());
        mat4.invert(proj, proj);
        const lookDir = vec4.fromValues(0, 0, -1, 0);
        vec4.transformQuat(lookDir, lookDir, renderer.camera.rotation);
        const p1 = renderer.getGroundLocation(e.offsetX - dx, e.offsetY - dy);
        const p2 = renderer.getGroundLocation(e.offsetX, e.offsetY);
        const ps = 1;
        pos[0] -= ps * (p2[0] - p1[0]);
        pos[1] -= ps * (p2[1] - p1[1]);

        if (!doLoopRender) l();
    });
    backingCanvas.node.addEventListener('pointerup', e => {
        e.preventDefault();
        isDown = false;
    });
    window.addEventListener('keydown', e => {
        keysDown.add(e.key);
        if (e.key === 'p') persp = !persp;
    });
    window.addEventListener('keyup', e => {
        keysDown.delete(e.key);
    });
    window.addEventListener('wheel', e => {
        e.preventDefault();
        const z = renderer.camera.perspective > 0.5 ? 1 : 0;
        zoom *= (1 - e.deltaY / 360 * (1 - z));
        fov *= (1 + e.deltaY / 360 * z);
        zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
        fov = Math.max(MIN_FOV, Math.min(MAX_FOV, fov));

        if (!doLoopRender) l();
    }, { passive: false });

    const bindHoldTouchCtrl = (id: string, start: () => void, stop: () => void) => {
        touchControls.querySelector(id)!.addEventListener('touchstart', e => {
            e.preventDefault();
            start();
        }, { passive: false });
        touchControls.querySelector(id)!.addEventListener('touchend', e => {
            e.preventDefault();
            stop();
        }, { passive: false });
    };

    bindHoldTouchCtrl('#zoom-out', () => zoomVelocity = -1, () => zoomVelocity = 0);
    bindHoldTouchCtrl('#zoom-in', () => zoomVelocity = 1, () => zoomVelocity = 0);
    touchControls.querySelector('#persp')!.addEventListener('click', () => {
        persp = !persp;
    });
    bindHoldTouchCtrl('#up', () => keysDown.add('e'), () => keysDown.delete('e'));
    bindHoldTouchCtrl('#down', () => keysDown.add('q'), () => keysDown.delete('q'));
    bindHoldTouchCtrl('#rup', () => keysDown.add('w'), () => keysDown.delete('w'));
    bindHoldTouchCtrl('#rdown', () => keysDown.add('s'), () => keysDown.delete('s'));
    bindHoldTouchCtrl('#rleft', () => keysDown.add('a'), () => keysDown.delete('a'));
    bindHoldTouchCtrl('#rright', () => keysDown.add('d'), () => keysDown.delete('d'));
}).catch(err => {
    console.error(err);
    alert('failed to load\n' + err);
});

function writeExr(size: [number, number], pixels: Float32Array) {
    const buffers: ArrayBuffer[] = [];
    const BUF_SIZE = 65536;
    let buf = new ArrayBuffer(BUF_SIZE);
    let bufView0 = new DataView(buf);
    let cursor = 0;
    let bufCursor = 0;
    const pushBuf = () => {
        buffers.push(new Uint8Array(buf).subarray(0, bufCursor));
        bufCursor = 0;
        buf = new ArrayBuffer(BUF_SIZE);
        bufView0 = new DataView(buf);
    };
    const writeU8 = (b: number) => {
        bufView0.setUint8(bufCursor, b);
        cursor++;
        bufCursor++;
        if (bufCursor > buf.byteLength) pushBuf();
    };
    const writeU32 = (n: number) => {
        const dv = new DataView(buf, bufCursor, 4);
        dv.setUint32(0, n, true);
        cursor += 4;
        bufCursor += 4;
    };
    const writeU64 = (n: number) => {
        writeU32(n);
        writeU32(0);
    };
    const writeOneFloat = (f: number) => {
        if (bufCursor > buf.byteLength - 4) pushBuf();
        const dv = new DataView(buf, bufCursor, 4);
        dv.setFloat32(0, f, true);
        cursor += 4;
        bufCursor += 4;
    };
    const writeCStr = (s: string) => {
        const buf = new TextEncoder().encode(s);
        for (const b of buf) writeU8(b);
        writeU8(0);
    };
    // magic
    [0x76, 0x2f, 0x31, 0x01].map(writeU8);
    // version
    writeU32(2);
    // header
    const writeAttrHeader = (name: string, type: string, size: number) => {
        writeCStr(name);
        writeCStr(type);
        writeU32(size);
    };
    writeAttrHeader('channels', 'chlist', 18 * 4 + 1);
    const writeCh = (name: string, pType: number, pLinear: number, xSampling: number, ySampling: number) => {
        writeCStr(name);
        writeU32(pType); // (0 uint, 1 half, 2 float)
        writeU8(pLinear); // (0 or 1)
        writeU8(0);
        writeU8(0);
        writeU8(0);
        writeU32(xSampling);
        writeU32(ySampling);
    };
    // each of these is size 18 (2+4+4*1+2*4)
    writeCh('A', 2, 0, 1, 1);
    writeCh('B', 2, 0, 1, 1);
    writeCh('G', 2, 0, 1, 1);
    writeCh('R', 2, 0, 1, 1);
    writeU8(0); // end channel list
    writeAttrHeader('compression', 'compression', 1);
    writeU8(0); // no compression
    writeAttrHeader('dataWindow', 'box2i', 16);
    writeU32(0);
    writeU32(0);
    writeU32(size[0] - 1);
    writeU32(size[1] - 1);
    writeAttrHeader('displayWindow', 'box2i', 16);
    writeU32(0);
    writeU32(0);
    writeU32(size[0] - 1);
    writeU32(size[1] - 1);
    writeAttrHeader('lineOrder', 'lineOrder', 1);
    writeU8(0); // increasing Y
    writeAttrHeader('pixelAspectRatio', 'float', 4);
    writeOneFloat(1);
    writeAttrHeader('screenWindowCenter', 'v2f', 8);
    writeOneFloat(0);
    writeOneFloat(0);
    writeAttrHeader('screenWindowWidth', 'float', 4);
    writeOneFloat(1);
    writeU8(0); // end header
    // line offset table
    const offsetTableSize = size[1] * 8;
    const pixelDataStart = cursor + offsetTableSize;
    const scanLineSize = (size[0] * 16) + 4 + 4;
    for (let y = 0; y < size[1]; y++) {
        writeU64(pixelDataStart + y * scanLineSize);
    }
    pushBuf();
    // scan line blocks
    for (let y = 0; y < size[1]; y++) {
        const scanline = new ArrayBuffer(scanLineSize);
        const headerView = new DataView(scanline, 0);
        headerView.setUint32(0, y, true);
        headerView.setUint32(4, size[0] * 16, true);
        const dataView = new DataView(scanline, 8);
        const flippedY = size[1] - 1 - y;
        let i = 0;
        for (let c = 3; c >= 0; c--) {
            for (let x = 0; x < size[0]; x++) {
                const off = (flippedY * size[0] + x) * 4;
                dataView.setFloat32(i, pixels[off + c], true);
                i += 4;
            }
        }
        buffers.push(scanline);
    }
    const finalBuffer = new Uint8Array(buffers.map(x => x.byteLength).reduce((a, b) => a + b, 0));
    let i = 0;
    for (const b of buffers) {
        finalBuffer.set(new Uint8Array(b), i);
        i += b.byteLength;
    }
    return finalBuffer;
}
