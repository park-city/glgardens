// super hacky test page

import { BackingCanvas, GeometryType, NetgardensWebGLRenderer, TileTextureLayer } from './renderer';
import { PlaneSubspace } from './renderer/geom-utils';
import { mat4, quat, vec3, vec4 } from 'gl-matrix';

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

const imagePaths = {
    centralPark: 'central-park 2.png',
    centralParkNormal: 'central-park 2-normal.png',
    centralParkMaterial: 'central-park 2-material.png',
    cybertestColor: 'cybertest-color.png',
    cybertestNormal: 'cybertest-normal.png',
    cybertestMaterial: 'cybertest-material.png',
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

Promise.all([images, mapData]).then(([images, getRawMapTile]) => {
    const centralParkTiles = {
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

    const delay = 1000;
    const dcSize = 32;

    const loadedSections = new Map();
    const mapListeners = new Set<any>();
    const tileSetListeners = new Set<any>();

    return {
        getTileset: (id: number) => {
            if (id.toString() in centralParkTiles) return centralPark;
            if (id.toString() in cybertestTiles) return cybertest;
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
    };
}).then(mapData => {
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
        // super laggy on android. works fine everywhere else it seems
        enablePointLights: !navigator.userAgent.includes('Android'),
        useMacrotiles: false,

        debugType: 'normal',
    };

    const DEBUG_TYPES = {
        normal: {},
        geometry: { showGeometry: true },
        lightVolumes: { showLightVolumes: true },
        bloom: { showBloom: true },
    };

    let renderer: NetgardensWebGLRenderer;
    const makeRenderer = () => {
        if (renderer) renderer.dispose();
        renderer = new NetgardensWebGLRenderer(backingCanvas, mapData, {
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

        renderer.tileMap.ambientLightRadiance = vec3.fromValues(0, 0.05, 0.2);
        // const sunCycleT = -5.7;
        const sunCycleT = -8.7;
        const sunZ = Math.cos(sunCycleT / 4);
        renderer.tileMap.sunLightDir = vec3.normalize(vec3.create(), [
            -Math.sin(sunCycleT / 4),
            Math.sin(sunCycleT / 4),
            sunZ,
        ]);
        const sunR = Math.max(0, 1 - Math.exp(-7 * (sunZ + 0.5)));
        renderer.tileMap.sunLightRadiance[0] = sunR * (6 * Math.max(0, sunZ) + 10);
        renderer.tileMap.sunLightRadiance[1] = sunR * (15 * Math.max(0, sunZ) + 7);
        renderer.tileMap.sunLightRadiance[2] = sunR * (25 * Math.max(0, sunZ));

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
        if (!isDown) return;
        e.preventDefault();
        const dx = e.offsetX - lastPos[0];
        const dy = e.offsetY - lastPos[1];
        lastPos = [e.offsetX, e.offsetY];
        const proj = renderer.camera.getProjection(renderer.backingContext.width, renderer.backingContext.height);
        mat4.multiply(proj, proj, renderer.camera.getView());
        mat4.invert(proj, proj);
        const lookDir = vec4.fromValues(0, 0, -1, 0);
        vec4.transformQuat(lookDir, lookDir, renderer.camera.rotation);
        const projectToZeroPlane = (x: number, y: number) => {
            const px = 2 * x / renderer.backingContext.width - 1;
            const py = 2 * y / renderer.backingContext.height - 1;
            const plane = new PlaneSubspace(
                vec4.create(),
                [1, 0, 0],
                [0, 1, 0],
            );
            const [p, d] = renderer.camera.projectionRay([renderer.backingContext.width, renderer.backingContext.height], [px, -py]);
            const res = plane.rayIntersect(p, d);
            if (!res) return [0, 0];
            return res[1];
        };
        const p1 = projectToZeroPlane(e.offsetX - dx, e.offsetY - dy);
        const p2 = projectToZeroPlane(e.offsetX, e.offsetY);
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
