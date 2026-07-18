/**
 * assetViewer.ts — standalone visual test scene.
 *
 * Renders one instance of every key GLB asset in a controlled, well-lit
 * orthographic-ish isometric Three.js scene so visual regressions are obvious.
 *
 * Served at /asset-viewer.html (Vite MPA entry).
 * Playwright test: tests/e2e/asset-viewer.test.ts
 */
import * as THREE from 'three';
import { AssetLoader } from '@/assets/AssetLoader';
import { assembleBuilding, BUILDING_PRELOAD_PATHS, } from '@/world/buildings/AssetBuildingAssembler';
// ── Scene setup ───────────────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const W = window.innerWidth;
const H = Math.min(window.innerHeight - 30, 700);
canvas.width = W;
canvas.height = H;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2e4a2e);
// Isometric-style camera looking down at an angle
const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 400);
camera.position.set(0, 28, 40);
camera.lookAt(0, 0, 0);
// Lighting — key light + fill + hemisphere so PBR diffuse shows correctly
const hemi = new THREE.HemisphereLight(0xb0cfe8, 0x3a5a2a, 1.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff5e0, 2.0);
sun.position.set(12, 22, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 150;
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
scene.add(sun);
// Ground plane
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), new THREE.MeshLambertMaterial({ color: 0x3a6b3a }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
// ── Asset grid ────────────────────────────────────────────────────────────────
/**
 * Groups of assets — each group is rendered in a column.
 * [label, path, scale]
 */
const GROUPS = [
    {
        title: 'Nature — rocks',
        items: [
            ['rock_smallA', '/assets/nature/rock_smallA.glb', 3.0],
            ['rock_largeA', '/assets/nature/rock_largeA.glb', 3.0],
            ['rock_tallA', '/assets/nature/rock_tallA.glb', 3.0],
        ],
    },
    {
        title: 'Nature — foliage',
        items: [
            ['grass', '/assets/nature/grass.glb', 6.0],
            ['flower_redA', '/assets/nature/flower_redA.glb', 6.0],
            ['mushroom_red', '/assets/nature/mushroom_red.glb', 6.0],
        ],
    },
    {
        title: 'Nature — paths',
        items: [
            ['path-straight', '/assets/nature/ground_pathStraight.glb', 4.0],
            ['path-bend', '/assets/nature/ground_pathBend.glb', 4.0],
            ['path-cross', '/assets/nature/ground_pathCross.glb', 4.0],
        ],
    },
    {
        title: 'Nature — river',
        items: [
            ['riverStraight', '/assets/nature/ground_riverStraight.glb', 4.0],
            ['riverBend', '/assets/nature/ground_riverBend.glb', 4.0],
            ['riverEnd', '/assets/nature/ground_riverEnd.glb', 4.0],
        ],
    },
    {
        title: 'Town — props',
        items: [
            ['lantern', '/assets/town/lantern.glb', 2.2],
            ['stall-green', '/assets/town/stall-green.glb', 2.2],
            ['fountain-round', '/assets/town/fountain-round.glb', 2.4],
        ],
    },
    {
        title: 'Town — roads',
        items: [
            ['road', '/assets/town/road.glb', 2.2],
            ['road-corner', '/assets/town/road-corner.glb', 2.2],
            ['road-bend', '/assets/town/road-bend.glb', 2.2],
        ],
    },
    {
        title: 'Buildings — walls',
        items: [
            ['wall', '/assets/buildings/wall.glb', 2.0],
            ['wall-window', '/assets/buildings/wall-window.glb', 2.0],
            ['wall-door', '/assets/buildings/wall-door.glb', 2.0],
        ],
    },
    {
        title: 'Buildings — roofs',
        items: [
            ['roof', '/assets/buildings/roof.glb', 2.0],
            ['roof-corner', '/assets/buildings/roof-corner.glb', 2.0],
            ['roof-edge', '/assets/buildings/roof-edge.glb', 2.0],
        ],
    },
    {
        title: 'Castle',
        items: [
            ['tower-base', '/assets/castle/tower-square-base.glb', 2.4],
            ['tower-mid', '/assets/castle/tower-square-mid.glb', 2.4],
            ['tower-top', '/assets/castle/tower-square-top.glb', 2.4],
        ],
    },
    {
        title: 'Dungeon',
        items: [
            ['gate', '/assets/dungeon/gate.glb', 1.8],
            ['gate-door', '/assets/dungeon/gate-door.glb', 1.8],
            ['corridor', '/assets/dungeon/corridor.glb', 1.8],
        ],
    },
];
const COL_SPACING = 10;
const ROW_SPACING = 6;
const TOTAL_COLS = GROUPS.length;
const START_X = -((TOTAL_COLS - 1) / 2) * COL_SPACING;
// Labels overlay
const labelsEl = document.getElementById('labels');
const labelData = [];
const loader = new AssetLoader();
const statusEl = document.getElementById('status');
let loaded = 0;
const totalPieces = GROUPS.reduce((s, g) => s + g.items.length, 0);
async function buildScene() {
    for (let gi = 0; gi < GROUPS.length; gi++) {
        const group = GROUPS[gi];
        const cx = START_X + gi * COL_SPACING;
        // Column title marker (small sphere)
        const marker = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({ color: 0xffff88 }));
        marker.position.set(cx, 0.2, -ROW_SPACING * (group.items.length / 2));
        scene.add(marker);
        for (let ri = 0; ri < group.items.length; ri++) {
            const [label, path, scale] = group.items[ri];
            const rz = (ri - (group.items.length - 1) / 2) * ROW_SPACING;
            try {
                const model = await loader.load(path);
                model.scale.setScalar(scale);
                model.position.set(cx, 0, rz);
                scene.add(model);
                labelData.push({ obj: model, text: label });
            }
            catch {
                // Show a red fallback cube
                const fb = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xff3333 }));
                fb.position.set(cx, 0.5, rz);
                scene.add(fb);
                labelData.push({ obj: fb, text: `❌ ${label}` });
            }
            loaded++;
            statusEl.textContent = `Loading… ${loaded}/${totalPieces} (${path.split('/').pop()})`;
        }
    }
}
// ── Assembled building examples ───────────────────────────────────────────────
/**
 * Show fully-assembled buildings in a second row below the tile grid.
 * This is the ground-truth visual verification for the modular assembler.
 */
async function buildAssembledExamples() {
    await loader.preload([...BUILDING_PRELOAD_PATHS]);
    const EXAMPLES = [
        { label: 'cottage', type: 'cottage', seed: 1 },
        { label: 'inn', type: 'inn', seed: 2 },
        { label: 'smithy', type: 'smithy', seed: 3 },
        { label: 'tavern', type: 'tavern', seed: 4 },
        { label: 'guard_tower', type: 'guard_tower', seed: 5 },
        { label: 'market_stall', type: 'market_stall', seed: 6 },
        { label: 'city_hall', type: 'city_hall', seed: 7 },
        { label: 'well', type: 'well', seed: 8 },
        { label: 'market_cross', type: 'market_cross', seed: 9 },
    ];
    const exColSpacing = 14;
    const exRowZ = 22; // place assembled buildings behind (south of) the tile grid
    const exStartX = -((EXAMPLES.length - 1) / 2) * exColSpacing;
    for (let i = 0; i < EXAMPLES.length; i++) {
        const ex = EXAMPLES[i];
        const cx = exStartX + i * exColSpacing;
        try {
            const grp = assembleBuilding(loader, ex.type, ex.seed);
            grp.position.set(cx, 0, exRowZ);
            scene.add(grp);
            labelData.push({ obj: grp, text: `[${ex.label}]` });
        }
        catch (e) {
            const fb = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), new THREE.MeshLambertMaterial({ color: 0xff3333 }));
            fb.position.set(cx, 1.5, exRowZ);
            scene.add(fb);
            labelData.push({ obj: fb, text: `❌ ${ex.label}` });
        }
    }
}
// ── Main startup ──────────────────────────────────────────────────────────────
async function main() {
    await buildScene();
    await buildAssembledExamples();
    statusEl.textContent = `✓ All assets + ${9} assembled buildings loaded`;
    window.__assetViewerReady = true;
}
// ── Render loop ───────────────────────────────────────────────────────────────
const _proj = new THREE.Vector3();
function updateLabels() {
    // Clear old labels
    labelsEl.innerHTML = '';
    for (const { obj, text } of labelData) {
        _proj.setFromMatrixPosition(obj.matrixWorld);
        _proj.project(camera);
        const x = (_proj.x * 0.5 + 0.5) * W;
        const y = (_proj.y * -0.5 + 0.5) * H - 6;
        const div = document.createElement('div');
        div.className = 'lbl';
        div.textContent = text;
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
        labelsEl.appendChild(div);
    }
}
renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
    updateLabels();
});
// ── Start ─────────────────────────────────────────────────────────────────────
window.__viewerCamera = camera;
main();
