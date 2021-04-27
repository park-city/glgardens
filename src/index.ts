import { WebGLRenderer } from './renderer';
import { mat4, quat, vec2, vec3, vec4 } from 'gl-matrix';
import { PlaneSubspace } from './renderer/geom-utils';
import { DeferredCompositor } from './renderer/deferred-compositor';
import { ForwardCompositor } from './renderer/forward-compositor';

document.body.style.background = '#9cf';
document.body.style.margin = '0px';

function getScale() {
    return Math.ceil(window.devicePixelRatio);
}

const canvas = document.createElement('canvas');
canvas.width = window.innerWidth * getScale();
canvas.height = window.innerHeight * getScale();
canvas.style.width = canvas.width / getScale() + 'px';
canvas.style.height = canvas.height / getScale() + 'px';
canvas.style.display = 'block';
document.body.appendChild(canvas);

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
    <button id="toggle-deferred">deferred</button>
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

const iCanvas = {
    get width() { return canvas.width / getScale(); },
    get height() { return canvas.height / getScale(); },
    get dpiScale() { return getScale(); },
    gl: canvas.getContext('webgl', {
        premultipliedAlpha: true,
    })!,
};

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth * 2;
    canvas.height = window.innerHeight * 2;
    canvas.style.width = canvas.width / 2 + 'px';
    canvas.style.height = canvas.height / 2 + 'px';
});

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
    const delay = 1000;
    const dcSize = 32;

    const loadedSections = new Map();
    let renderer: any;

    return {
        size: [rawTiles[0].length, rawTiles.length] as vec2,
        tileSet: 'central-park',
        getTile: (x: number, y: number) => {
            const w = rawTiles[0].length;
            const h = rawTiles.length;

            let px = Math.floor((x - y) / 2);
            let py = y + x;

            const offX = Math.floor(x / dcSize);
            const offY = Math.floor(y / dcSize);
            const offKey = `${offX},${offY}`;

            if (!loadedSections.has(offKey)) {
                loadedSections.set(offKey, false);
                setTimeout(() => {
                    loadedSections.set(offKey, true);
                    renderer.map.signalTileUpdates(offX * dcSize, offY * dcSize, dcSize, dcSize);
                }, delay);
            }
            if (!loadedSections.get(offKey)) return null;

            py = (py % h + h) % h;
            px = ((px % w + w) % w);

            const tileId = rawTiles[py] && rawTiles[py][px];
            if (!Number.isFinite(tileId)) return null;
            return { id: tileId };
        },
        _setRenderer: (r: any) => renderer = r,
    };
});

Promise.all([images, mapData]).then(([images, mapData]) => {
    const renderer = new WebGLRenderer(iCanvas, mapData);
    renderer.setBackgroundColor(0.6, 0.8, 1, 1);
    renderer.setBackgroundColor(0, 0, 0, 1);
    mapData._setRenderer(renderer);
    renderer.resources.addTileSet('central-park', {
        color: images.centralPark,
        normal: images.centralParkNormal,
    }, [4, 8], {
        0: { frames: [[0, 0]] },
        1: { frames: [[0, 1]] },
        2: { frames: [[0, 2]] },
        3: { frames: [[0, 3]] },
        4: { frames: [[0, 4]], type: 'outer' },
        5: { frames: [[0, 5]], type: 'flat' },
        6: { frames: [[0, 6]] },
        7: { frames: [[0, 7]], pointLight: [[0.5, 0.5, 0.9], [1, 0.8, 0.4, 0.6]] },
        8: {
            frames: [
                [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7],
                [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7],
                [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
            ],
        },
        9: { frames: [[3, 5]], pointLight: [[0.5, 0.5, 1.3], [0.2, 0.7, 1, 1]] },
        10: { frames: [[3, 6]] },
        11: { frames: [[3, 7]] },
    });

    const p = 10;
    const q = 0;
    setTimeout(() => {
        renderer.map.signalTileUpdates(p-128, q-128, 256, 256);
    }, 550);

    const keysDown = new Set();
    const MIN_ZOOM = Math.sqrt(2) / 16;
    const MAX_ZOOM = Math.sqrt(2) * 4;
    const MIN_FOV = Math.atan(0.1);
    const MAX_FOV = Math.atan(2);
    const pos = [p, q, 40];
    let rot = 0;
    let rotH = 0;
    let zoom = Math.sqrt(2);
    let fov = Math.atan(0.5);
    let persp = false;

    let zoomVelocity = 0;

    const fpsDisplay = document.createElement('div');
    Object.assign(fpsDisplay.style, {
        position: 'fixed',
        top: '10px',
        left: '10px',
        background: '#000',
        color: '#fff',
        font: '12px monospace',
    });
    document.body.appendChild(fpsDisplay);

    renderer.render();
    let lastTime = Date.now();
    let fpsSamples: number[] = [];
    let renderEncodeSamples: number[] = [];
    let t = 0;
    const l = () => {
        const dt = (Date.now() - lastTime) / 1000;
        lastTime = Date.now();
        t += dt;

        if (persp) {
            fov -= zoomVelocity / 2 * dt;
            fov = Math.max(MIN_FOV, Math.min(MAX_FOV, fov));
        } else {
            zoom *= (1 + zoomVelocity * dt);
            zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
        }

        (renderer.compositor as any).lightDir = vec3.normalize(vec3.create(), [
            Math.cos(t),
            Math.sin(t),
            2,
        ]);

        requestAnimationFrame(l);
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
        fpsDisplay.textContent = [
            `fps: ${pad2(fps)}/${pad5(renderDt.toFixed(2))}ms`,
            `avg 10 frames: ${pad4(avgFps.toFixed(1))}/${pad5(avgRenderDt.toFixed(2))}ms`,
            `debug controls: P/QE/WASD/R`
        ].join(' | ');

        renderer.camera.position = [15, 15, 4];
        renderer.camera.rotation = quat.fromEuler(quat.create(), -60, 0, -45);

        const a = Math.tan((60 - rotH * 16) / 180 * Math.PI);
        renderer.camera.position = [pos[0] + Math.cos(rot + Math.PI / 4) * a * pos[2], pos[1] + Math.sin(rot + Math.PI / 4) * a * pos[2], pos[2]];
        renderer.camera.rotation = quat.fromEuler(quat.create(), -60, 0, rot / Math.PI * 180 - 90);
        renderer.camera.orthoScale = zoom;
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
    };
    l();

    const toggleDeferred = () => {
        if (renderer.compositor instanceof DeferredCompositor) {
            renderer.setCompositor(ForwardCompositor);
        } else if (DeferredCompositor.isAvailable(renderer.gl)) {
            renderer.setCompositor(DeferredCompositor);
        }
    };

    let lastPos = [0, 0];
    let isDown = false;
    window.addEventListener('touchstart', e => {
        e.preventDefault();
        touchControls.style.visibility = 'visible';
    }, { passive: false });
    window.addEventListener('touchmove', e => {
        e.preventDefault();
    }, { passive: false });

    window.addEventListener('pointerdown', e => {
        e.preventDefault();
        lastPos = [e.offsetX, e.offsetY];
        isDown = true;
    });
    window.addEventListener('pointermove', e => {
        if (!isDown) return;
        e.preventDefault();
        const dx = e.offsetX - lastPos[0];
        const dy = e.offsetY - lastPos[1];
        lastPos = [e.offsetX, e.offsetY];
        const proj = renderer.camera.getProjection(renderer.canvas.width, renderer.canvas.height);
        mat4.multiply(proj, proj, renderer.camera.getView());
        mat4.invert(proj, proj);
        const lookDir = vec4.fromValues(0, 0, -1, 0);
        vec4.transformQuat(lookDir, lookDir, renderer.camera.rotation);
        const projectToZeroPlane = (x: number, y: number) => {
            const px = 2 * x / renderer.canvas.width - 1;
            const py = 2 * y / renderer.canvas.height - 1;
            const plane = new PlaneSubspace(
                vec4.create(),
                [1, 0, 0],
                [0, 1, 0],
            );
            const [p, d] = renderer.camera.projectionRay([renderer.canvas.width, renderer.canvas.height], [px, -py]);
            const res = plane.rayIntersect(p, d);
            if (!res) return [0, 0];
            return res[1];
        };
        const p1 = projectToZeroPlane(e.offsetX - dx, e.offsetY - dy);
        const p2 = projectToZeroPlane(e.offsetX, e.offsetY);
        const ps = 1;
        pos[0] -= ps * (p2[0] - p1[0]);
        pos[1] -= ps * (p2[1] - p1[1]);
    });
    window.addEventListener('pointerup', e => {
        e.preventDefault();
        isDown = false;
    });
    window.addEventListener('keydown', e => {
        keysDown.add(e.key);
        if (e.key === 'p') persp = !persp;
        if (e.key === 'r') toggleDeferred();
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
    touchControls.querySelector('#toggle-deferred')!.addEventListener('click', () => {
        toggleDeferred();
    });
    bindHoldTouchCtrl('#up', () => keysDown.add('e'), () => keysDown.delete('e'));
    bindHoldTouchCtrl('#down', () => keysDown.add('q'), () => keysDown.delete('q'));
    bindHoldTouchCtrl('#rup', () => keysDown.add('w'), () => keysDown.delete('w'));
    bindHoldTouchCtrl('#rdown', () => keysDown.add('s'), () => keysDown.delete('s'));
    bindHoldTouchCtrl('#rleft', () => keysDown.add('a'), () => keysDown.delete('a'));
    bindHoldTouchCtrl('#rright', () => keysDown.add('d'), () => keysDown.delete('d'));

    (window as any).renderer = renderer;
}).catch(err => {
    console.error(err);
    alert('failed to load\n' + err);
});
