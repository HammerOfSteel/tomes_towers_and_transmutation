/**
 * world-editor.ts  —  TTT World Editor
 *
 * Standalone 3D editor accessible at /world-editor.html.
 * Four modes:
 *   • Asset Studio  — procedurally generate and save props to the library
 *   • Tower Rooms   — visualise and edit room layouts per floor
 *   • Buildings     — generate procedural buildings and save them
 *   • Library       — browse, load, delete, import/export saved items
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { generateBuilding } from '@/world/buildings/BuildingGenerator';
import { buildCauldron, buildGoblet, buildArch, buildBookStack, buildLantern, buildBed, buildTable, buildChair, buildWardrobe, buildCampfire, buildTelescope, buildShelf, buildPillar, buildAltar, buildRug, buildBanner, buildFireplace, } from '@/rendering/ProceduralProps';
import { TEXTURE_PRESETS, buildMaterial, buildEmissiveMaterial, } from '@/rendering/ProceduralTextures';
import { TOWER_FLOOR_DEFS } from '@/levels/TowerFloorDef';
import { TOWER_VERSION_KEY, TOWER_VERSION_MAX, GRID as TV_GRID, CELL as TV_CELL, GRID_CX, gridToWorld, worldToGrid, loadVersions, createVersion, restoreVersion, deleteVersion, } from '@/world-editor/towerVersioning';
// ── Helpers ────────────────────────────────────────────────────────────────────
function qs(sel) {
    return document.querySelector(sel);
}
// Legacy hex color utility kept for building studio / library re-load only
function hexToInt(hex) {
    return parseInt(hex.replace('#', ''), 16);
}
void hexToInt; // suppress "unused" when not referenced elsewhere
/** Quick solid-color mat (used only inside mini-builders below). */
function _solidMat(hex, roughness = 0.8, metalness = 0) {
    return new THREE.MeshStandardMaterial({
        color: new THREE.Color(hex), roughness, metalness,
    });
}
/** Show a quick toast notification. */
function toast(msg, ms = 2400) {
    const el = qs('#toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), ms);
}
const ASSET_TYPES = [
    // ─────────────── FURNITURE ───────────────────────────────────────────────────
    {
        id: 'bed', label: 'Bed', emoji: '🛏',
        category: 'furniture',
        params: [
            { id: 'headboard_style', label: 'Headboard Style', min: 0, max: 2, step: 1, default: 0 },
            { id: 'post_height', label: 'Post Height', min: 0, max: 0.8, step: 0.1, default: 0 },
        ],
        build: (_p, mat1, mat2) => buildBed(mat1, mat2),
    },
    {
        id: 'table', label: 'Table', emoji: '🪑',
        category: 'furniture',
        params: [
            { id: 'w', label: 'Width', min: 0.8, max: 2.8, step: 0.1, default: 1.4 },
            { id: 'd', label: 'Depth', min: 0.6, max: 1.6, step: 0.1, default: 0.8 },
            { id: 'h', label: 'Height', min: 0.6, max: 1.0, step: 0.05, default: 0.78 },
            { id: 'leg_style', label: 'Leg Style', min: 0, max: 2, step: 1, default: 0 },
        ],
        build: (p, mat1) => buildTable(mat1, p['w'], p['d'], p['h']),
    },
    {
        id: 'chair', label: 'Chair', emoji: '💺',
        category: 'furniture',
        params: [
            { id: 'back_style', label: 'Back Style', min: 0, max: 2, step: 1, default: 0 },
            { id: 'arm_rests', label: 'Arm Rests', min: 0, max: 1, step: 1, default: 0 },
        ],
        build: (_p, mat1) => buildChair(mat1),
    },
    {
        id: 'wardrobe', label: 'Wardrobe', emoji: '🗄',
        category: 'furniture',
        params: [
            { id: 'height', label: 'Height', min: 1.6, max: 2.8, step: 0.1, default: 2.1 },
            { id: 'door_count', label: 'Door Count', min: 1, max: 3, step: 1, default: 2 },
        ],
        build: (_p, mat1) => buildWardrobe(mat1),
    },
    {
        id: 'bookstack', label: 'Book Stack', emoji: '📚',
        category: 'furniture',
        params: [
            { id: 'stack_h', label: 'Stack Height', min: 0.3, max: 1.2, step: 0.1, default: 0.6 },
            { id: 'tilt', label: 'Tilt Amount', min: 0, max: 1, step: 0.1, default: 0.3 },
        ],
        build: (_p, mat1) => buildBookStack(mat1),
    },
    {
        id: 'shelf', label: 'Wall Shelf', emoji: '🗃',
        category: 'furniture',
        params: [
            { id: 'w', label: 'Width', min: 0.6, max: 2.2, step: 0.2, default: 1.2 },
            { id: 'd', label: 'Depth', min: 0.16, max: 0.45, step: 0.05, default: 0.28 },
            { id: 'shelf_count', label: 'Shelf Count', min: 1, max: 4, step: 1, default: 2 },
            { id: 'bracket_style', label: 'Bracket Style', min: 0, max: 2, step: 1, default: 1 },
        ],
        build: (p, mat1) => buildShelf(mat1, p['w'], p['d'], {
            shelfCount: Math.round(p['shelf_count'] ?? 2),
            bracketStyle: Math.round(p['bracket_style'] ?? 1),
        }),
    },
    // ─────────────── PROPS ──────────────────────────────────────────────────────
    {
        id: 'barrel', label: 'Barrel', emoji: '🛢',
        category: 'props',
        params: [
            { id: 'ht', label: 'Height', min: 0.5, max: 1.6, step: 0.1, default: 0.9 },
            { id: 'rd', label: 'Radius', min: 0.18, max: 0.55, step: 0.05, default: 0.32 },
            { id: 'hoop_count', label: 'Hoop Count', min: 2, max: 5, step: 1, default: 3 },
            { id: 'stave_count', label: 'Stave Count', min: 6, max: 16, step: 2, default: 10 },
        ],
        build: (p, mat1, mat2) => _buildBarrel(p['ht'] ?? 0.9, p['rd'] ?? 0.32, Math.round(p['hoop_count'] ?? 3), mat1, mat2),
    },
    {
        id: 'crate', label: 'Crate', emoji: '📦',
        category: 'props',
        params: [
            { id: 'sz', label: 'Size', min: 0.35, max: 1.0, step: 0.05, default: 0.6 },
            { id: 'plank_style', label: 'Plank Style', min: 0, max: 2, step: 1, default: 0 },
        ],
        build: (p, mat1, mat2) => _buildCrate(p['sz'] ?? 0.6, mat1, mat2),
    },
    {
        id: 'chest', label: 'Chest', emoji: '🎁',
        category: 'props',
        params: [
            { id: 'sz', label: 'Size', min: 0.5, max: 1.4, step: 0.1, default: 1.0 },
            { id: 'lock_type', label: 'Lock Type', min: 0, max: 2, step: 1, default: 0 },
        ],
        build: (p, mat1, mat2) => _buildChest(p['sz'] ?? 1.0, mat1, mat2),
    },
    {
        id: 'cauldron', label: 'Cauldron', emoji: '🫕',
        category: 'props',
        emissive2: true,
        params: [
            { id: 'size', label: 'Size', min: 0.5, max: 1.4, step: 0.1, default: 1.0 },
        ],
        build: (_p, mat1, mat2) => buildCauldron(mat1, mat2),
    },
    {
        id: 'goblet', label: 'Goblet', emoji: '🏆',
        category: 'props',
        params: [
            { id: 'stem_height', label: 'Stem Height', min: 0.4, max: 1.0, step: 0.05, default: 0.6 },
        ],
        build: (_p, mat1) => buildGoblet(mat1),
    },
    {
        id: 'campfire', label: 'Campfire', emoji: '🔥',
        category: 'props',
        emissive2: true,
        params: [
            { id: 'stone_count', label: 'Stone Count', min: 4, max: 12, step: 2, default: 6 },
            { id: 'flame_height', label: 'Flame Height', min: 0.2, max: 0.9, step: 0.1, default: 0.5 },
            { id: 'log_count', label: 'Log Count', min: 2, max: 5, step: 1, default: 3 },
        ],
        build: (_p, mat1, mat2) => buildCampfire(_solidMat('#7a6a5a', 0.9), mat1, mat2),
    },
    {
        id: 'rug', label: 'Rug', emoji: '🟥',
        category: 'props',
        params: [
            { id: 'w', label: 'Width', min: 0.8, max: 3.5, step: 0.2, default: 2.0 },
            { id: 'd', label: 'Depth', min: 0.6, max: 2.5, step: 0.2, default: 1.4 },
            { id: 'pattern', label: 'Pattern', min: 0, max: 4, step: 1, default: 2 },
        ],
        // Colors are baked into the rug canvas — we use mat1/mat2 color values at call site
        build: (p, _mat1, _mat2) => buildRug(document.querySelector('#asset-color')?.value ?? '#8b5e3c', document.querySelector('#asset-color2')?.value ?? '#d4aa00', p['w'] ?? 2.0, p['d'] ?? 1.4, Math.round(p['pattern'] ?? 2)),
    },
    // ─────────────── STRUCTURES ─────────────────────────────────────────────────
    {
        id: 'arch', label: 'Archway', emoji: '🏛',
        category: 'structures',
        params: [
            { id: 'w', label: 'Width', min: 1.0, max: 4.0, step: 0.25, default: 2.0 },
            { id: 'h', label: 'Height', min: 2.0, max: 5.0, step: 0.25, default: 3.5 },
            { id: 'pier_thickness', label: 'Pier Thickness', min: 0.2, max: 0.8, step: 0.05, default: 0.45 },
        ],
        build: (p, mat1) => buildArch(mat1, p['w'], p['h']),
    },
    {
        id: 'pillar', label: 'Pillar', emoji: '🏺',
        category: 'structures',
        params: [
            { id: 'height', label: 'Height', min: 1.5, max: 5.0, step: 0.25, default: 3.0 },
            { id: 'radius', label: 'Radius', min: 0.1, max: 0.4, step: 0.05, default: 0.18 },
            { id: 'style', label: 'Style', min: 0, max: 2, step: 1, default: 0 },
            { id: 'capital_h', label: 'Capital H', min: 0, max: 0.5, step: 0.05, default: 0.25 },
            { id: 'base_h', label: 'Base H', min: 0, max: 0.4, step: 0.05, default: 0.15 },
            { id: 'entasis', label: 'Entasis', min: 0, max: 0.15, step: 0.01, default: 0.06 },
        ],
        build: (p, mat1) => buildPillar(mat1, p['height'] ?? 3.0, p['radius'] ?? 0.18, {
            style: Math.round(p['style'] ?? 0),
            capitalH: p['capital_h'] ?? 0.25,
            baseH: p['base_h'] ?? 0.15,
            entasis: p['entasis'] ?? 0.06,
        }),
    },
    {
        id: 'altar', label: 'Altar', emoji: '🪬',
        category: 'structures',
        emissive2: true,
        params: [
            { id: 'w', label: 'Width', min: 0.8, max: 2.0, step: 0.1, default: 1.2 },
            { id: 'd', label: 'Depth', min: 0.5, max: 1.2, step: 0.1, default: 0.7 },
            { id: 'h', label: 'Height', min: 0.6, max: 1.4, step: 0.1, default: 1.0 },
            { id: 'tiers', label: 'Tiers', min: 1, max: 3, step: 1, default: 2 },
            { id: 'top_element', label: 'Top Element', min: 0, max: 2, step: 1, default: 1 },
        ],
        build: (p, mat1, mat2) => buildAltar(mat1, mat2, p['w'] ?? 1.2, p['d'] ?? 0.7, p['h'] ?? 1.0, {
            tiers: Math.round(p['tiers'] ?? 2),
            topElement: Math.round(p['top_element'] ?? 1),
        }),
    },
    {
        id: 'banner', label: 'Banner', emoji: '🚩',
        category: 'structures',
        params: [
            { id: 'w', label: 'Width', min: 0.3, max: 1.2, step: 0.1, default: 0.65 },
            { id: 'h', label: 'Height', min: 0.6, max: 2.5, step: 0.2, default: 1.4 },
            { id: 'pattern', label: 'Pattern', min: 0, max: 3, step: 1, default: 1 },
        ],
        build: (p, mat1) => buildBanner(mat1, document.querySelector('#asset-color')?.value ?? '#8b2222', document.querySelector('#asset-color2')?.value ?? '#d4aa00', p['w'] ?? 0.65, p['h'] ?? 1.4, Math.round(p['pattern'] ?? 1)),
    },
    {
        id: 'fireplace', label: 'Fireplace', emoji: '🔥',
        category: 'structures',
        emissive2: true,
        params: [
            { id: 'w', label: 'Width', min: 1.2, max: 2.8, step: 0.2, default: 1.8 },
            { id: 'h', label: 'Height', min: 1.4, max: 2.6, step: 0.2, default: 2.0 },
            { id: 'arch_opening', label: 'Arch Opening', min: 0, max: 1, step: 1, default: 1 },
            { id: 'mantel_h', label: 'Mantel H', min: 0, max: 0.35, step: 0.05, default: 0.18 },
        ],
        build: (p, mat1, mat2) => buildFireplace(mat1, mat2, p['w'] ?? 1.8, p['h'] ?? 2.0, {
            archOpening: Math.round(p['arch_opening'] ?? 1),
            mantelH: p['mantel_h'] ?? 0.18,
        }),
    },
    {
        id: 'telescope', label: 'Telescope', emoji: '🔭',
        category: 'structures',
        params: [
            { id: 'length', label: 'Tube Length', min: 0.5, max: 1.8, step: 0.1, default: 1.0 },
            { id: 'tilt', label: 'Elevation°', min: 20, max: 75, step: 5, default: 45 },
        ],
        build: (_p, mat1) => buildTelescope(mat1),
    },
    // ─────────────── LIGHT ───────────────────────────────────────────────────────
    {
        id: 'lantern', label: 'Lantern', emoji: '🏮',
        category: 'light',
        emissive2: true,
        params: [
            { id: 'cage_style', label: 'Cage Style', min: 0, max: 2, step: 1, default: 0 },
            { id: 'chain_length', label: 'Chain Length', min: 0, max: 2.0, step: 0.2, default: 0.0 },
            { id: 'globe_size', label: 'Globe Size', min: 0.15, max: 0.45, step: 0.05, default: 0.25 },
        ],
        build: (_p, mat1, mat2) => buildLantern(mat1, mat2),
    },
];
// ── Inline mini-builders (props already in the game but not in ProceduralProps) ─
function _buildBarrel(ht, rd, hoopCount, woodMat, hoopMat) {
    const grp = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(rd * 1.1, rd, ht, 10);
    const body = new THREE.Mesh(bodyGeo, woodMat);
    body.position.y = ht / 2;
    body.castShadow = true;
    grp.add(body);
    for (let i = 0; i < hoopCount; i++) {
        const sy = 0.15 + (i / Math.max(1, hoopCount - 1)) * 0.7;
        const hoopGeo = new THREE.TorusGeometry(rd * 1.12, 0.025, 5, 14);
        const hoop = new THREE.Mesh(hoopGeo, hoopMat);
        hoop.position.y = ht * sy;
        hoop.rotation.x = Math.PI / 2;
        hoop.castShadow = true;
        grp.add(hoop);
    }
    return grp;
}
function _buildCrate(sz, woodMat, braceMat) {
    const grp = new THREE.Group();
    const geo = new THREE.BoxGeometry(sz, sz, sz);
    const body = new THREE.Mesh(geo, woodMat);
    body.position.y = sz / 2;
    body.castShadow = true;
    grp.add(body);
    // Cross brace on top
    for (const [w, d] of [[sz * 0.9, 0.06], [0.06, sz * 0.9]]) {
        const bGeo = new THREE.BoxGeometry(w, 0.045, d);
        const brace = new THREE.Mesh(bGeo, braceMat);
        brace.position.y = sz + 0.025;
        brace.castShadow = true;
        grp.add(brace);
    }
    return grp;
}
function _buildChest(sz, woodMat, metalMat) {
    const grp = new THREE.Group();
    const scale = sz;
    const baseGeo = new THREE.BoxGeometry(0.70 * scale, 0.38 * scale, 0.46 * scale);
    const base = new THREE.Mesh(baseGeo, woodMat);
    base.position.y = 0.19 * scale;
    base.castShadow = true;
    grp.add(base);
    const lidGeo = new THREE.BoxGeometry(0.72 * scale, 0.22 * scale, 0.47 * scale);
    const lid = new THREE.Mesh(lidGeo, woodMat);
    lid.position.y = 0.49 * scale;
    lid.castShadow = true;
    grp.add(lid);
    const claspGeo = new THREE.BoxGeometry(0.12 * scale, 0.09 * scale, 0.06 * scale);
    const clasp = new THREE.Mesh(claspGeo, metalMat);
    clasp.position.set(0, 0.41 * scale, 0.25 * scale);
    clasp.castShadow = true;
    grp.add(clasp);
    return grp;
}
// ── Library (localStorage) ─────────────────────────────────────────────────────
const STORAGE_KEY = 'ttt_world_editor_library_v1';
function loadLibrary() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    }
    catch {
        return [];
    }
}
function saveLibrary(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}
function addToLibrary(entry) {
    const lib = loadLibrary();
    lib.push(entry);
    saveLibrary(lib);
}
function deleteFromLibrary(id) {
    const lib = loadLibrary().filter(e => e.id !== id);
    saveLibrary(lib);
}
// ── THREE.js scene setup ───────────────────────────────────────────────────────
const canvas = qs('#canvas3d');
const wrap = qs('#viewport-wrap');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1e26);
scene.fog = new THREE.FogExp2(0x1a1e26, 0.015);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
camera.position.set(4, 3.5, 4);
camera.lookAt(0, 0, 0);
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.dampingFactor = 0.12;
orbit.minDistance = 1;
orbit.maxDistance = 80;
orbit.maxPolarAngle = Math.PI / 2.05;
// Lights
scene.add(new THREE.HemisphereLight(0xb0c8e0, 0x3a4a30, 1.2));
const sun = new THREE.DirectionalLight(0xfff5e0, 2.0);
sun.position.set(10, 18, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);
// Ground plane
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: 0x1e2430 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.005;
ground.receiveShadow = true;
scene.add(ground);
// Grid
scene.add(new THREE.GridHelper(20, 20, 0x3a4860, 0x252d3a));
// ── Thumbnail renderer (offscreen, preserveDrawingBuffer, reuses scene+camera) ─
let _thumbRenderer = null;
function _captureThumb() {
    if (!_thumbRenderer) {
        _thumbRenderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
        _thumbRenderer.setSize(170, 110);
        _thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
        _thumbRenderer.shadowMap.enabled = false;
    }
    _thumbRenderer.render(scene, camera);
    return _thumbRenderer.domElement.toDataURL('image/jpeg', 0.7);
}
// ── Preview group ──────────────────────────────────────────────────────────────
let previewGroup = null;
function clearPreview() {
    if (previewGroup) {
        scene.remove(previewGroup);
        previewGroup.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                if (Array.isArray(obj.material))
                    obj.material.forEach(m => m.dispose());
                else
                    obj.material.dispose();
            }
        });
        previewGroup = null;
    }
}
function showPreview(grp) {
    clearPreview();
    previewGroup = grp;
    // Centre on ground
    const box = new THREE.Box3().setFromObject(grp);
    grp.position.y = -box.min.y;
    scene.add(grp);
    // Frame camera
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2.0 + 1.5;
    camera.position.set(dist * 0.7, dist * 0.7, dist * 0.7);
    orbit.target.set(0, size.y * 0.4, 0);
    orbit.update();
}
// ── Render loop ────────────────────────────────────────────────────────────────
function resize() {
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (!W || !H)
        return;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
// ── State ──────────────────────────────────────────────────────────────────────
let activeTab = 'assets';
let _modelManifest = null;
let _modelLoader = null;
let _currentModelGroup = null;
let _modelMixer = null;
let _modelAnims = [];
// ── Tower palette state ───────────────────────────────────────────────────────
let _towerPaletteMode = 'items';
let _towerLibSearch = '';
let _towerLibModelPath = null; // selected library model path
let _towerTool = 'place';
let _towerSnapToGrid = true;
let _towerSelectedIdx = null;
let _towerSelectionBox = null;
let _towerDragging = false;
let _towerDragMoved = false;
let _towerDragOffset = new THREE.Vector3();
let _towerDragOffsetY = 0;
let _towerDragStartPos = new THREE.Vector3();
const _towerDragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
// ── Render loop ───────────────────────────────────────────────────────────────
const _clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const delta = _clock.getDelta();
    orbit.update();
    if (_modelMixer)
        _modelMixer.update(delta);
    if (_towerSelectionBox)
        _towerSelectionBox.update();
    renderer.render(scene, camera);
}
animate();
let selectedAssetId = null;
let paramValues = {};
let libCat = 'assets';
// Material preset state (Asset Studio)
let mat1Preset = 'wood';
let mat1Params = {};
let mat2Preset = 'metal';
let mat2Params = {};
// Tower editor state
/** Items placed per floor — key is floorIndex. */
const towerFloorItems = new Map();
/** Get (or lazily create) the items array for a specific floor. */
function _getTowerFloorItems(floor) {
    if (!towerFloorItems.has(floor))
        towerFloorItems.set(floor, []);
    return towerFloorItems.get(floor);
}
let towerPaletteType = 'barrel';
let _towerFloorSelectorReady = false;
// ── Tower version control (UI wrappers around towerVersioning module) ─────────
// Pure logic lives in src/world-editor/towerVersioning.ts (tested separately).
function _saveTowerVersionToStorage(label) {
    const v = createVersion(localStorage, towerFloorItems, label);
    renderTowerVersionHistory();
    toast(`Saved version "${v.label}"`);
}
function _restoreTowerVersion(v) {
    restoreVersion(v, towerFloorItems);
    _towerFloorSelectorReady = false; // force floor selector dots to refresh
    initTowerEditor();
    renderTowerVersionHistory();
    toast(`Restored "${v.label}"`);
}
function _loadTowerFromGame() {
    towerFloorItems.clear();
    for (const def of TOWER_FLOOR_DEFS) {
        if (!def.chamberScatter?.length)
            continue;
        towerFloorItems.set(def.floorIndex, def.chamberScatter.map(s => ({
            type: s.type,
            x: gridToWorld(s.x),
            z: gridToWorld(s.z),
            rotation: (s.rotation ?? 0),
        })));
    }
    _towerFloorSelectorReady = false; // force floor selector dots to refresh
    initTowerEditor();
    toast('Loaded tower layout from game definitions');
}
function renderTowerVersionHistory() {
    const container = qs('#tower-version-list');
    const countEl = qs('#tower-version-count');
    const versions = loadVersions(localStorage);
    countEl.textContent = versions.length ? `(${versions.length}/${TOWER_VERSION_MAX})` : '';
    if (!versions.length) {
        container.innerHTML = '<div style="padding:6px 2px;color:var(--text2)">No versions saved yet.</div>';
        return;
    }
    container.innerHTML = '';
    for (const v of [...versions].reverse()) {
        const d = new Date(v.savedAt);
        const dateStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:5px;padding:5px 2px;border-bottom:1px solid var(--border)';
        row.innerHTML = `
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.label}</div>
        <div style="font-size:10px;color:var(--text2)">${dateStr}</div>
      </div>
      <button class="btn" style="font-size:10px;padding:2px 7px;flex-shrink:0">\u21a9 Restore</button>
    `;
        row.querySelector('button').addEventListener('click', () => {
            if (confirm(`Restore "${v.label}"?\n\nUnsaved changes will be lost.`)) {
                _restoreTowerVersion(v);
            }
        });
        container.appendChild(row);
    }
}
// Building state
let currentBuildingGroup = null;
// ── Tab switching ──────────────────────────────────────────────────────────────
function switchTab(tab) {
    // ── Clear all 3D scene objects before switching ──────────────────────────────
    // Prevent geometry from a previous tab bleeding into the new one.
    clearPreview();
    _clearModelPreview();
    // Remove tower grid and placed items
    if (towerGridGroup) {
        scene.remove(towerGridGroup);
        towerGridGroup = null;
    }
    for (const g of towerItemGroups) {
        scene.remove(g);
        g.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m.dispose());
            }
        });
    }
    towerItemGroups = [];
    _towerFloorSelectorReady = false; // force floor selector rebuild on next entry
    // Remove building preview
    if (currentBuildingGroup) {
        scene.remove(currentBuildingGroup);
        currentBuildingGroup = null;
    }
    activeTab = tab;
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset['tab'] === tab);
    });
    const appEl = qs('#app');
    const libView = qs('#library-view');
    const tilesView = qs('#tiles-view');
    const leftAssets = qs('#left-assets');
    const leftModels = qs('#left-models');
    const leftTower = qs('#left-tower');
    const leftBld = qs('#left-buildings');
    const rightAssets = qs('#right-assets');
    const rightModels = qs('#right-models');
    const rightTower = qs('#right-tower');
    const rightBld = qs('#right-buildings');
    const vpLabel = qs('#vp-mode-label');
    // Tiles and Library replace the 3-panel layout
    const hideApp = tab === 'library' || tab === 'tiles';
    appEl.style.display = hideApp ? 'none' : 'flex';
    libView.classList.toggle('active', tab === 'library');
    tilesView.style.display = tab === 'tiles' ? 'flex' : 'none';
    leftAssets.style.display = tab === 'assets' ? '' : 'none';
    leftModels.style.display = tab === 'models' ? '' : 'none';
    leftTower.style.display = tab === 'tower' ? '' : 'none';
    leftBld.style.display = tab === 'buildings' ? '' : 'none';
    rightAssets.style.display = tab === 'assets' ? '' : 'none';
    rightModels.style.display = tab === 'models' ? '' : 'none';
    rightTower.style.display = tab === 'tower' ? '' : 'none';
    rightBld.style.display = tab === 'buildings' ? '' : 'none';
    const LABELS = {
        assets: 'Asset Studio — 3D Preview',
        models: 'Model Browser — 3D Preview',
        tiles: '',
        tower: 'Tower Room Editor',
        buildings: 'Building Studio — 3D Preview',
        library: '',
    };
    vpLabel.textContent = LABELS[tab];
    if (tab === 'library')
        renderLibraryGrid();
    if (tab === 'tower')
        initTowerEditor();
    if (tab === 'models') {
        _clearTowerItems();
        initModelsTab();
    }
    if (tab !== 'tower') {
        _clearGhost();
        _deselectTowerItem();
    }
}
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const t = btn.dataset['tab'];
        if (t)
            switchTab(t);
    });
});
// ── Models Tab ─────────────────────────────────────────────────────────────────
function _getModelLoader() {
    if (!_modelLoader)
        _modelLoader = new GLTFLoader();
    return _modelLoader;
}
function _clearModelPreview() {
    if (_modelMixer) {
        _modelMixer.stopAllAction();
        _modelMixer = null;
    }
    _modelAnims = [];
    if (_currentModelGroup) {
        scene.remove(_currentModelGroup);
        _currentModelGroup.traverse(obj => {
            const mesh = obj;
            if (mesh.isMesh) {
                mesh.geometry.dispose();
                (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => m.dispose());
            }
        });
        _currentModelGroup = null;
    }
}
function _fitCameraToModel(group) {
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 1.8;
    camera.position.set(center.x + dist * 0.7, center.y + dist * 0.6, center.z + dist * 0.7);
    orbit.target.copy(center);
    orbit.update();
}
function _loadModelPreview(entry) {
    _clearModelPreview();
    qs('#model-preview-name').textContent = entry.label;
    qs('#model-preview-path').textContent = entry.path;
    qs('#model-copy-path').textContent = entry.path;
    qs('#model-anim-list').textContent = 'Loading…';
    _getModelLoader().load(entry.path, (gltf) => {
        const group = gltf.scene;
        group.traverse(obj => {
            const mesh = obj;
            if (mesh.isMesh) {
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const mat of mats) {
                    const std = mat;
                    if (std.isMeshStandardMaterial) {
                        std.metalness = 0;
                        std.roughness = Math.max(std.roughness, 0.6);
                    }
                }
            }
        });
        scene.add(group);
        _currentModelGroup = group;
        _fitCameraToModel(group);
        // Wire up animations
        const clips = gltf.animations;
        const animDiv = qs('#model-anim-list');
        if (clips.length) {
            _modelMixer = new THREE.AnimationMixer(group);
            _modelAnims = clips.map(c => _modelMixer.clipAction(c));
            _modelAnims[0].play();
            animDiv.innerHTML = clips.map((c, i) => `<button class="btn" style="margin:2px 2px 0;font-size:10px" data-anim="${i}">${c.name}</button>`).join('');
            animDiv.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset['anim']);
                    _modelAnims.forEach(a => a.stop());
                    _modelAnims[idx]?.play();
                });
            });
        }
        else {
            animDiv.textContent = 'None';
        }
    }, undefined, (err) => {
        qs('#model-anim-list').textContent = 'Load error';
        console.warn('[Models] failed to load', entry.path, err);
    });
}
function _buildModelList(cat, search) {
    const container = qs('#model-list');
    container.innerHTML = '';
    if (!_modelManifest) {
        container.innerHTML = '<div style="padding:12px;color:#6a7a8a;font-size:12px">Loading manifest…</div>';
        return;
    }
    const lc = search.toLowerCase();
    const categories = cat === 'all' ? Object.keys(_modelManifest) : [cat];
    let count = 0;
    for (const c of categories) {
        const entries = _modelManifest[c] ?? [];
        const filtered = lc ? entries.filter(e => e.label.toLowerCase().includes(lc) || e.id.toLowerCase().includes(lc)) : entries;
        if (!filtered.length)
            continue;
        if (cat === 'all') {
            const hdr = document.createElement('div');
            hdr.style.cssText = 'padding:6px 12px 3px;font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;border-top:1px solid var(--border);margin-top:4px';
            hdr.textContent = c;
            container.appendChild(hdr);
        }
        for (const entry of filtered) {
            const item = document.createElement('div');
            item.className = 'asset-item';
            item.textContent = entry.label;
            item.title = entry.path;
            item.addEventListener('click', () => {
                container.querySelectorAll('.asset-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                _loadModelPreview(entry);
            });
            container.appendChild(item);
            count++;
        }
    }
    if (!count) {
        container.innerHTML = '<div style="padding:12px;color:#6a7a8a;font-size:12px">No models found.</div>';
    }
}
function initModelsTab() {
    const catSel = qs('#model-category');
    const searchIn = qs('#model-search');
    const refresh = () => _buildModelList(catSel.value, searchIn.value);
    if (!_modelManifest) {
        fetch('/assets/manifest.json')
            .then(r => r.json())
            .then((data) => {
            _modelManifest = data;
            refresh();
        })
            .catch(() => { qs('#model-list').innerHTML = '<div style="padding:12px;color:#df6a5a;font-size:12px">Failed to load manifest.</div>'; });
    }
    else {
        refresh();
    }
    // Wire controls (idempotent — overwriting listeners each time tab opens is fine)
    catSel.onchange = refresh;
    searchIn.oninput = refresh;
    qs('#btn-model-reset-cam').onclick = () => {
        if (_currentModelGroup)
            _fitCameraToModel(_currentModelGroup);
    };
    qs('#model-copy-path').onclick = () => {
        const path = qs('#model-copy-path').textContent ?? '';
        if (path) {
            navigator.clipboard.writeText(path).then(() => toast('Path copied!'));
        }
    };
    qs('#btn-model-save').onclick = () => {
        const name = qs('#model-preview-name').textContent ?? '';
        const path = qs('#model-copy-path').textContent ?? '';
        if (!path) {
            toast('Select a model first');
            return;
        }
        const entry = {
            id: `model_${Date.now()}`,
            name,
            kind: 'asset',
            params: {},
            typeId: 'model',
            category: 'models',
            color: '#ffffff',
            color2: '#ffffff',
            createdAt: Date.now(),
            modelPath: path,
            thumbnail: _captureThumb(),
        };
        const lib = loadLibrary();
        lib.push(entry);
        saveLibrary(lib);
        toast(`Saved "${name}" to Library`);
    };
}
// ── Asset Studio ───────────────────────────────────────────────────────────────
function buildAssetTypeList(category) {
    const container = qs('#asset-type-list');
    container.innerHTML = '';
    const types = ASSET_TYPES.filter(t => t.category === category);
    if (!types.length) {
        container.innerHTML = '<div style="padding:8px 12px;color:#6a7a8a;font-size:12px">No assets in this category.</div>';
        return;
    }
    for (const at of types) {
        const item = document.createElement('div');
        item.className = `asset-item${selectedAssetId === at.id ? ' selected' : ''}`;
        item.innerHTML = `<span style="margin-right:6px">${at.emoji}</span>${at.label}`;
        item.addEventListener('click', () => selectAsset(at.id));
        container.appendChild(item);
    }
    // Bug 3 fix: auto-select the first asset if nothing is selected yet
    if (!selectedAssetId && types.length) {
        selectAsset(types[0].id);
    }
}
function selectAsset(id) {
    selectedAssetId = id;
    const def = ASSET_TYPES.find(t => t.id === id);
    if (!def)
        return;
    buildAssetTypeList(def.category);
    qs('#right-asset-name-lbl').textContent = `${def.emoji} ${def.label}`;
    buildParamSliders(def.params);
    populateTexParamSliders('mat1', mat1Preset, mat1Params);
    populateTexParamSliders('mat2', mat2Preset, mat2Params);
    previewCurrentAsset();
}
// ── Texture preset UI helpers ─────────────────────────────────────────────────
/** Populate the texture parameter sliders for a material slot ('mat1' or 'mat2'). */
function populateTexParamSliders(slot, presetId, paramsState) {
    const container = document.getElementById(`${slot}-tex-params`);
    if (!container)
        return;
    container.innerHTML = '';
    const preset = TEXTURE_PRESETS.find(p => p.id === presetId);
    if (!preset || !preset.params.length)
        return;
    for (const pd of preset.params) {
        if (!(pd.id in paramsState))
            paramsState[pd.id] = pd.default;
        const row = document.createElement('div');
        row.className = 'ctrl-row';
        row.style.cssText = 'padding:1px 0;gap:4px';
        const lbl = document.createElement('span');
        lbl.className = 'ctrl-label';
        lbl.style.fontSize = '10px';
        lbl.textContent = pd.label;
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'ctrl-slider';
        slider.min = String(pd.min);
        slider.max = String(pd.max);
        slider.step = String(pd.step);
        slider.value = String(paramsState[pd.id] ?? pd.default);
        const valSpan = document.createElement('span');
        valSpan.className = 'ctrl-value';
        valSpan.style.fontSize = '10px';
        valSpan.textContent = slider.value;
        slider.addEventListener('input', () => {
            paramsState[pd.id] = parseFloat(slider.value);
            valSpan.textContent = slider.value;
            previewCurrentAsset();
        });
        row.append(lbl, slider, valSpan);
        container.appendChild(row);
    }
}
/** Initialize the mat preset select dropdowns and wire them up. */
function initMatPresetSelects() {
    for (const slot of ['mat1', 'mat2']) {
        const sel = document.getElementById(`${slot}-preset`);
        if (!sel)
            continue;
        sel.innerHTML = TEXTURE_PRESETS.map(p => `<option value="${p.id}">${p.emoji} ${p.label}</option>`).join('');
        const currentPreset = slot === 'mat1' ? mat1Preset : mat2Preset;
        sel.value = currentPreset;
        // Bug 7 fix: seed the params object with preset defaults on first init
        const preset = TEXTURE_PRESETS.find(p => p.id === currentPreset);
        if (preset) {
            const paramsRef = slot === 'mat1' ? mat1Params : mat2Params;
            for (const pd of preset.params) {
                if (!(pd.id in paramsRef))
                    paramsRef[pd.id] = pd.default;
            }
        }
        populateTexParamSliders(slot, currentPreset, slot === 'mat1' ? mat1Params : mat2Params);
        sel.addEventListener('change', () => {
            if (slot === 'mat1') {
                mat1Preset = sel.value;
                mat1Params = {}; // reset to defaults for new preset
                populateTexParamSliders('mat1', mat1Preset, mat1Params);
            }
            else {
                mat2Preset = sel.value;
                mat2Params = {};
                populateTexParamSliders('mat2', mat2Preset, mat2Params);
            }
            previewCurrentAsset();
        });
    }
}
// ── Asset parameters ──────────────────────────────────────────────────────────
function buildParamSliders(params) {
    const container = qs('#asset-params-list');
    container.innerHTML = '';
    if (!params.length) {
        container.innerHTML = '<div style="padding:6px 12px;color:#6a7a8a;font-size:11px">No shape parameters.</div>';
        paramValues = {};
        return;
    }
    paramValues = Object.fromEntries(params.map(p => [p.id, p.default]));
    const section = document.createElement('div');
    section.className = 'panel-section';
    const lbl = document.createElement('div');
    lbl.className = 'panel-label';
    lbl.textContent = 'Shape Parameters';
    section.appendChild(lbl);
    for (const p of params) {
        const row = document.createElement('div');
        row.className = 'ctrl-row';
        const label = document.createElement('span');
        label.className = 'ctrl-label';
        label.textContent = p.label;
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'ctrl-slider';
        slider.min = String(p.min);
        slider.max = String(p.max);
        slider.step = String(p.step);
        slider.value = String(p.default);
        const valSpan = document.createElement('span');
        valSpan.className = 'ctrl-value';
        valSpan.textContent = String(p.default);
        slider.addEventListener('input', () => {
            const v = parseFloat(slider.value);
            paramValues[p.id] = v;
            valSpan.textContent = String(v);
            previewCurrentAsset(); // Bug fix: live-update preview on slider change
        });
        row.append(label, slider, valSpan);
        section.appendChild(row);
    }
    container.appendChild(section);
}
// ── Preview / Randomize ───────────────────────────────────────────────────────
function previewCurrentAsset() {
    if (!selectedAssetId)
        return;
    const def = ASSET_TYPES.find(t => t.id === selectedAssetId);
    if (!def)
        return;
    const color1 = qs('#asset-color').value;
    const color2 = qs('#asset-color2').value;
    const mat1 = buildMaterial(mat1Preset, { ...mat1Params }, color1);
    const mat2 = def.emissive2
        ? buildEmissiveMaterial(color2)
        : buildMaterial(mat2Preset, { ...mat2Params }, color2);
    const grp = def.build(paramValues, mat1, mat2);
    showPreview(grp);
}
function randomizeCurrentAsset() {
    if (!selectedAssetId)
        return;
    const def = ASSET_TYPES.find(t => t.id === selectedAssetId);
    if (!def)
        return;
    // Randomize shape params
    for (const p of def.params) {
        const range = p.max - p.min;
        const steps = Math.round(range / p.step);
        paramValues[p.id] = parseFloat((p.min + Math.round(Math.random() * steps) * p.step).toFixed(4));
    }
    // Randomize material presets
    const presetIds = TEXTURE_PRESETS.map(p => p.id);
    mat1Preset = presetIds[Math.floor(Math.random() * presetIds.length)];
    mat2Preset = presetIds[Math.floor(Math.random() * presetIds.length)];
    mat1Params = {};
    mat2Params = {};
    // Randomize texture params to non-default values
    const p1 = TEXTURE_PRESETS.find(p => p.id === mat1Preset);
    if (p1) {
        for (const pd of p1.params) {
            const range = pd.max - pd.min;
            mat1Params[pd.id] = parseFloat((pd.min + Math.random() * range).toFixed(3));
        }
    }
    const p2 = TEXTURE_PRESETS.find(p => p.id === mat2Preset);
    if (p2) {
        for (const pd of p2.params) {
            const range = pd.max - pd.min;
            mat2Params[pd.id] = parseFloat((pd.min + Math.random() * range).toFixed(3));
        }
    }
    // Randomize colors with material-aware palette
    const preset1 = TEXTURE_PRESETS.find(p => p.id === mat1Preset);
    qs('#asset-color').value = preset1.defaultColor;
    qs('#asset-color2').value = preset1.defaultColor2;
    // Update UI
    const s1 = document.getElementById('mat1-preset');
    const s2 = document.getElementById('mat2-preset');
    if (s1)
        s1.value = mat1Preset;
    if (s2)
        s2.value = mat2Preset;
    buildParamSliders(def.params.map(p => ({ ...p, default: paramValues[p.id] ?? p.default })));
    populateTexParamSliders('mat1', mat1Preset, mat1Params);
    populateTexParamSliders('mat2', mat2Preset, mat2Params);
    previewCurrentAsset();
}
function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
        const k = (n + h / 30) % 12;
        const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}
void hslToHex; // kept for potential future use
// Wire preview/randomize/save buttons
qs('#btn-preview').addEventListener('click', previewCurrentAsset);
qs('#btn-randomize').addEventListener('click', randomizeCurrentAsset);
qs('#asset-color').addEventListener('input', previewCurrentAsset);
qs('#asset-color2').addEventListener('input', previewCurrentAsset);
qs('#btn-save-asset').addEventListener('click', () => {
    if (!selectedAssetId) {
        toast('Select an asset type first.');
        return;
    }
    const def = ASSET_TYPES.find(t => t.id === selectedAssetId);
    const name = qs('#asset-save-name').value.trim() || `${def.label} #${Date.now().toString(36)}`;
    const entry = {
        id: crypto.randomUUID(),
        name,
        typeId: selectedAssetId,
        category: def.category,
        params: { ...paramValues },
        color: qs('#asset-color').value,
        color2: qs('#asset-color2').value,
        createdAt: Date.now(),
        kind: 'asset',
        thumbnail: _captureThumb(),
    };
    addToLibrary(entry);
    toast(`"${name}" saved to Library`);
    qs('#asset-save-name').value = '';
});
// Populate category select
qs('#asset-category').addEventListener('change', (e) => {
    buildAssetTypeList(e.target.value);
});
buildAssetTypeList('furniture'); // initial
initMatPresetSelects(); // populate material preset dropdowns
// ── Tower Room Editor ──────────────────────────────────────────────────────────
const INTERACTABLE_LABELS = {
    barrel: '🛢 Barrel',
    crate: '📦 Crate',
    chest: '🎁 Chest',
    bookshelf: '📚 Bookshelf',
    lectern: '📖 Lectern',
    candelabra: '🕯 Candelabra',
    forge: '⚒ Forge',
    cauldron: '🫕 Cauldron',
    workbench_key: '🗝 Key Workbench',
    telescope: '🔭 Telescope',
    quest_board: '📋 Quest Board',
};
// Tower grid constants — imported from towerVersioning (TV_ prefix to avoid name clash)
const GRID = TV_GRID;
const CELL = TV_CELL;
void GRID_CX;
void worldToGrid;
void deleteVersion;
void TOWER_VERSION_KEY; // silence unused-import warnings
let towerGridGroup = null;
let towerItemGroups = [];
// ── Tower editor: ghost preview state ─────────────────────────────────────────
let _ghostGroup = null;
let _ghostRotation = 0;
let _ghostMaterial = null; // lazy-init
function _getGhostMat() {
    if (!_ghostMaterial) {
        _ghostMaterial = new THREE.MeshLambertMaterial({
            color: 0x88ccff, transparent: true, opacity: 0.45, depthWrite: false,
        });
    }
    return _ghostMaterial;
}
// ── Tower editor: async GLB rendering ─────────────────────────────────────────
// Maps interactable type → best-match GLB in our asset library
const _TOWER_ITEM_GLB = {
    barrel: '/assets/survival/barrel.glb',
    crate: '/assets/survival/box-large.glb',
    chest: '/assets/survival/chest.glb',
    bookshelf: '/assets/furniture/bookcaseOpen.glb',
    workbench_key: '/assets/survival/workbench.glb',
};
const _towerGlbCache = new Map(); // path → template
let _towerGlbLoaderRef = null;
function _towerGlbLoader() {
    if (!_towerGlbLoaderRef)
        _towerGlbLoaderRef = new GLTFLoader();
    return _towerGlbLoaderRef;
}
// ── Tower palette builders ─────────────────────────────────────────────────────
function _makePaletteItem(label, selected, onClick) {
    const el = document.createElement('div');
    el.className = `asset-item${selected ? ' selected' : ''}`;
    el.style.fontSize = '11px';
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
}
function _buildTowerItemsPalette(container) {
    const types = [
        'barrel', 'crate', 'chest', 'bookshelf', 'candelabra', 'lectern',
        'cauldron', 'forge', 'workbench_key', 'telescope',
    ];
    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text2);margin-bottom:5px';
    hdr.textContent = '⚔ Gameplay Interactables';
    container.appendChild(hdr);
    for (const t of types) {
        const hasGlb = !!_TOWER_ITEM_GLB[t];
        const isSelected = _towerPaletteMode === 'items' && towerPaletteType === t;
        container.appendChild(_makePaletteItem((INTERACTABLE_LABELS[t] ?? t) + (hasGlb ? ' ✦' : ''), isSelected, () => {
            towerPaletteType = t;
            _towerLibModelPath = null;
            _ghostRotation = 0;
            _clearGhost();
            initTowerEditor();
        }));
    }
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;color:var(--text2);margin-top:8px;line-height:1.7';
    hint.innerHTML = '<b>Click</b> place &nbsp;·&nbsp; <b>R</b> rotate<br><b>Right-click</b> delete<br>✦ = real 3D model';
    container.appendChild(hint);
}
function _buildTowerLibraryPalette(container) {
    if (!_modelManifest) {
        const msg = document.createElement('div');
        msg.style.cssText = 'font-size:11px;color:var(--text2);padding:8px 2px';
        msg.textContent = 'Loading library…';
        container.appendChild(msg);
        fetch('/assets/manifest.json').then(r => r.json()).then((m) => {
            _modelManifest = m;
            if (_towerPaletteMode === 'library') {
                container.innerHTML = '';
                _buildTowerLibraryPalette(container);
            }
        }).catch(() => { msg.textContent = 'Failed to load library'; });
        return;
    }
    const search = _towerLibSearch;
    // Build: pack → subcat → entries[]
    const byPackSubcat = new Map();
    for (const entries of Object.values(_modelManifest)) {
        for (const e of entries) {
            if (search && !e.label.toLowerCase().includes(search) && !e.pack.toLowerCase().includes(search) && !e.subcat.toLowerCase().includes(search))
                continue;
            const pack = e.pack || 'Other';
            const sub = e.subcat || 'Misc';
            if (!byPackSubcat.has(pack))
                byPackSubcat.set(pack, new Map());
            const bySub = byPackSubcat.get(pack);
            if (!bySub.has(sub))
                bySub.set(sub, []);
            bySub.get(sub).push(e);
        }
    }
    if (byPackSubcat.size === 0) {
        container.innerHTML = '<div style="padding:8px 2px;font-size:11px;color:var(--text2)">No results.</div>';
        return;
    }
    const selectEntry = (e) => {
        _towerLibModelPath = e.path;
        _ghostRotation = 0;
        _clearGhost();
        container.querySelectorAll('.asset-item').forEach(el => el.classList.remove('selected'));
        container.querySelector(`[data-libpath="${CSS.escape(e.path)}"]`)?.classList.add('selected');
    };
    for (const [packName, subcatMap] of [...byPackSubcat.entries()].sort()) {
        // ── Pack header (collapsible) ──────────────────────────────────────────
        const packSection = document.createElement('details');
        packSection.open = true; // expanded by default
        const packSummary = document.createElement('summary');
        packSummary.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--accent);cursor:pointer;padding:6px 2px 4px;list-style:none;display:flex;align-items:center;gap:4px';
        const totalCount = [...subcatMap.values()].reduce((s, a) => s + a.length, 0);
        packSummary.innerHTML = `<span style="flex:1">${packName}</span><span style="font-weight:400;opacity:.6">${totalCount}</span>`;
        packSection.appendChild(packSummary);
        for (const [subcatName, entries] of [...subcatMap.entries()].sort()) {
            // ── Subcat section (also collapsible) ─────────────────────────────
            const subSection = document.createElement('details');
            subSection.open = search !== ''; // auto-open when searching
            const subSummary = document.createElement('summary');
            subSummary.style.cssText = 'font-size:10px;font-weight:600;color:var(--text2);cursor:pointer;padding:3px 2px 3px 10px;list-style:none;display:flex;align-items:center;gap:4px';
            subSummary.innerHTML = `<span style="flex:1">${subcatName}</span><span style="font-weight:400;opacity:.5">${entries.length}</span>`;
            subSection.appendChild(subSummary);
            for (const e of entries) {
                const el = _makePaletteItem(e.label, _towerLibModelPath === e.path, () => selectEntry(e));
                el.style.paddingLeft = '18px';
                el.dataset['libpath'] = e.path;
                subSection.appendChild(el);
            }
            packSection.appendChild(subSection);
        }
        container.appendChild(packSection);
    }
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;color:var(--text2);margin-top:8px;line-height:1.7;padding-bottom:8px';
    hint.innerHTML = '<b>Click</b> place &nbsp;·&nbsp; <b>R</b> rotate &nbsp;·&nbsp; <b>Right-click</b> delete';
    container.appendChild(hint);
}
function initTowerEditor() {
    // ── Populate floor selector once (not on every palette re-render) ──────────
    const floorSel = qs('#tower-floor-sel');
    if (!_towerFloorSelectorReady) {
        _towerFloorSelectorReady = true;
        const prevValue = floorSel.value;
        floorSel.innerHTML = '';
        for (const def of TOWER_FLOOR_DEFS) {
            const hasItems = (towerFloorItems.get(def.floorIndex) ?? []).length > 0 ||
                def.chamberScatter?.length;
            const dot = hasItems ? ' ●' : '';
            const opt = document.createElement('option');
            opt.value = String(def.floorIndex);
            opt.textContent = `Floor ${def.floorIndex < 0 ? def.floorIndex : `+${def.floorIndex}`}  ${def.name}${dot}`;
            floorSel.appendChild(opt);
        }
        // Restore previous selection or default to 0
        floorSel.value = prevValue || '0';
        if (!floorSel.value)
            floorSel.selectedIndex = 0;
        renderTowerVersionHistory();
    }
    const floorIdx = parseInt(floorSel.value, 10);
    const floorDef = TOWER_FLOOR_DEFS.find(d => d.floorIndex === floorIdx);
    // ── Wire tool buttons ────────────────────────────────────────────────────────
    const toolPlace = qs('#tower-tool-place');
    const toolSelect = qs('#tower-tool-select');
    const snapGrid = qs('#tower-snap-grid');
    const activeBtn = 'background:var(--accent);color:#fff;border-color:var(--accent)';
    toolPlace.style.cssText = _towerTool === 'place' ? activeBtn : '';
    toolSelect.style.cssText = _towerTool === 'select' ? activeBtn : '';
    snapGrid.checked = _towerSnapToGrid;
    toolPlace.onclick = () => { _towerTool = 'place'; _deselectTowerItem(); _clearGhost(); initTowerEditor(); };
    toolSelect.onclick = () => { _towerTool = 'select'; _clearGhost(); initTowerEditor(); };
    snapGrid.onchange = () => { _towerSnapToGrid = snapGrid.checked; };
    // Build palette — items mode or library mode
    const palette = qs('#tower-palette');
    const tabItems = qs('#tower-tab-items');
    const tabLib = qs('#tower-tab-lib');
    const libSearch = qs('#tower-lib-search');
    palette.innerHTML = '';
    // Style the active tab button
    const accentStyle = 'background:var(--accent);color:#fff;border-color:var(--accent)';
    tabItems.style.cssText = _towerPaletteMode === 'items' ? accentStyle : '';
    tabLib.style.cssText = _towerPaletteMode === 'library' ? accentStyle : '';
    libSearch.style.display = _towerPaletteMode === 'library' ? '' : 'none';
    // Tab toggle handlers (idempotent — safe to re-register each time)
    tabItems.onclick = () => { _towerPaletteMode = 'items'; _towerLibSearch = ''; initTowerEditor(); };
    tabLib.onclick = () => { _towerPaletteMode = 'library'; initTowerEditor(); };
    libSearch.oninput = (e) => {
        _towerLibSearch = e.target.value.toLowerCase();
        _buildTowerLibraryPalette(palette);
    };
    if (_towerPaletteMode === 'items') {
        _buildTowerItemsPalette(palette);
    }
    else {
        libSearch.value = _towerLibSearch;
        _buildTowerLibraryPalette(palette);
    }
    // Build tower grid scene
    if (towerGridGroup) {
        scene.remove(towerGridGroup);
        towerGridGroup = null;
    }
    towerGridGroup = new THREE.Group();
    scene.remove(...towerItemGroups);
    towerItemGroups = [];
    // Render a simplified top-down grid
    const R = floorDef?.chamberRadius ?? 7;
    const cx = Math.floor(GRID / 2);
    const cz = Math.floor(GRID / 2);
    for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < GRID; col++) {
            const dx = col - cx;
            const dz = row - cz;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const isFloor = dist <= R;
            const isWall = dist > R && dist <= R + 1.5;
            if (!isFloor && !isWall)
                continue;
            const geo = new THREE.PlaneGeometry(CELL * 0.96, CELL * 0.96);
            geo.rotateX(-Math.PI / 2);
            const color = isWall ? 0x3a3a4a : (dist < 1.5 ? 0x4a3a2a : 0x2a2a35);
            const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
            m.position.set((col - cx) * CELL, 0, (row - cz) * CELL);
            m.receiveShadow = true;
            towerGridGroup.add(m);
        }
    }
    scene.add(towerGridGroup);
    // Render placed items for this floor
    _clearTowerItems();
    for (const item of _getTowerFloorItems(floorIdx)) {
        _renderTowerItem(item.type, item.x, item.z, item.rotation, item.modelPath, item.scale ?? 1, item.rotX ?? 0, item.rotY, item.rotZ ?? 0, item.y ?? 0);
    }
    // Set camera to top-down-ish view
    const gridSize = GRID * CELL;
    camera.position.set(gridSize * 0.3, gridSize * 0.9, gridSize * 0.5);
    orbit.target.set(0, 0, 0);
    orbit.update();
}
// ── Tower item GLB/box rendering ──────────────────────────────────────────────
function _towerItemColor(type) {
    const colorMap = {
        barrel: 0x8b5e3c, crate: 0x7a6a4a, chest: 0xd4a520,
        bookshelf: 0x5a7a3a, candelabra: 0xe8c870, lectern: 0x4a6a9a,
        cauldron: 0x4a5a4a, forge: 0x8a4a2a, workbench_key: 0xd4aa20, telescope: 0x8a8a5a,
    };
    return colorMap[type] ?? 0x6a6a6a;
}
function _makeBoxPlaceholder(type, mat) {
    const grp = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.55, 0.6, 0.55);
    const m = new THREE.Mesh(geo, mat ?? new THREE.MeshLambertMaterial({ color: _towerItemColor(type) }));
    m.position.y = 0.3;
    m.castShadow = true;
    grp.add(m);
    return grp;
}
function _clearTowerItems() {
    _deselectTowerItem();
    for (const g of towerItemGroups) {
        scene.remove(g);
        g.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(mat => mat.dispose());
                }
                else {
                    obj.material.dispose();
                }
                obj.geometry.dispose();
            }
        });
    }
    towerItemGroups = [];
}
function _selectTowerItem(idx) {
    _deselectTowerItem();
    _towerSelectedIdx = idx;
    const grp = towerItemGroups[idx];
    if (!grp)
        return;
    _towerSelectionBox = new THREE.BoxHelper(grp, 0xffdd00);
    scene.add(_towerSelectionBox);
    const item = _getTowerFloorItems(_towerCurrentFloorIdx())[idx];
    const label = item?.type === 'prop'
        ? (item.modelPath?.split('/').pop() ?? 'Prop')
        : (INTERACTABLE_LABELS[item?.type] ?? item?.type ?? '?');
    qs('#tower-sel-info').textContent = label;
    qs('#tower-sel-controls').style.display = '';
    // Scale
    qs('#tower-sel-scale').value = String(grp.scale.x);
    qs('#tower-sel-scale-val').textContent = grp.scale.x.toFixed(2) + '×';
    // Rotation
    const rx = item?.rotX ?? 0;
    const ry = item?.rotY ?? (item?.rotation ?? 0);
    const rz = item?.rotZ ?? 0;
    qs('#tower-sel-rotx').value = String(rx);
    qs('#tower-sel-roty').value = String(ry);
    qs('#tower-sel-rotz').value = String(rz);
    qs('#tower-sel-rotx-val').textContent = rx + '°';
    qs('#tower-sel-roty-val').textContent = ry + '°';
    qs('#tower-sel-rotz-val').textContent = rz + '°';
}
function _deselectTowerItem() {
    _towerSelectedIdx = null;
    _towerDragging = false;
    _towerDragMoved = false;
    if (_towerSelectionBox) {
        scene.remove(_towerSelectionBox);
        _towerSelectionBox = null;
    }
    const info = document.getElementById('tower-sel-info');
    const ctrl = document.getElementById('tower-sel-controls');
    if (info)
        info.textContent = 'Nothing selected';
    if (ctrl)
        ctrl.style.display = 'none';
}
function _towerRaycastItems(event) {
    const rect = canvas.getBoundingClientRect();
    const ndc = {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    };
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    for (let i = 0; i < towerItemGroups.length; i++) {
        const meshes = [];
        towerItemGroups[i].traverse(o => { if (o instanceof THREE.Mesh)
            meshes.push(o); });
        if (meshes.length && ray.intersectObjects(meshes, false).length > 0)
            return i;
    }
    return null;
}
function _clearGhost() {
    if (_ghostGroup) {
        scene.remove(_ghostGroup);
        _ghostGroup = null;
    }
}
function _renderTowerItem(type, x, z, rotation = 0, modelPath, scale = 1, rotX = 0, rotY, rotZ = 0, y = 0) {
    const grp = new THREE.Group();
    const DEG = Math.PI / 180;
    grp.position.set(x, y, z);
    grp.rotation.x = rotX * DEG;
    grp.rotation.y = (rotY ?? rotation) * DEG;
    grp.rotation.z = rotZ * DEG;
    grp.scale.setScalar(scale);
    // Resolve which GLB to load
    const glbPath = type === 'prop' ? (modelPath ?? null) : (_TOWER_ITEM_GLB[type] ?? null);
    // Start with colored box placeholder
    const placeholder = type === 'prop'
        ? _makeBoxPlaceholder('barrel') // generic placeholder for props
        : _makeBoxPlaceholder(type);
    grp.add(placeholder);
    scene.add(grp);
    towerItemGroups.push(grp);
    if (glbPath) {
        const swapIn = (template) => {
            if (!grp.parent)
                return;
            grp.remove(placeholder);
            placeholder.traverse(o => { if (o instanceof THREE.Mesh) {
                o.geometry.dispose();
                o.material.dispose();
            } });
            const clone = template.clone(true);
            clone.traverse(o => { if (o instanceof THREE.Mesh) {
                o.castShadow = true;
                o.receiveShadow = true;
            } });
            grp.add(clone);
        };
        const cached = _towerGlbCache.get(glbPath);
        if (cached) {
            swapIn(cached);
        }
        else {
            _towerGlbLoader().load(glbPath, (gltf) => { _towerGlbCache.set(glbPath, gltf.scene); swapIn(gltf.scene); });
        }
    }
    return grp;
}
// ── Ghost preview ─────────────────────────────────────────────────────────────
function _buildGhostGroup(type, modelPath) {
    const mat = _getGhostMat();
    const glbPath = type === 'prop' ? (modelPath ?? null) : (_TOWER_ITEM_GLB[type] ?? null);
    const cached = glbPath ? _towerGlbCache.get(glbPath) : undefined;
    const grp = new THREE.Group();
    if (cached) {
        const clone = cached.clone(true);
        clone.traverse(o => { if (o instanceof THREE.Mesh)
            o.material = mat; });
        grp.add(clone);
    }
    else {
        const placeholder = type === 'prop' ? _makeBoxPlaceholder('barrel', mat) : _makeBoxPlaceholder(type, mat);
        grp.add(placeholder);
        // If GLB isn't cached yet, kick off a load so next hover shows it
        if (glbPath && !_towerGlbCache.has(glbPath)) {
            _towerGlbLoader().load(glbPath, gltf => { _towerGlbCache.set(glbPath, gltf.scene); });
        }
    }
    return grp;
}
function _refreshGhost(x, z, show) {
    if (!show) {
        _clearGhost();
        return;
    }
    _clearGhost();
    const isLib = _towerPaletteMode === 'library';
    _ghostGroup = isLib
        ? _buildGhostGroup('prop', _towerLibModelPath ?? undefined)
        : _buildGhostGroup(towerPaletteType);
    _ghostGroup.position.set(x, 0.02, z);
    _ghostGroup.rotation.y = _ghostRotation * (Math.PI / 180);
    scene.add(_ghostGroup);
}
// ── Tower canvas: shared raycaster helper ─────────────────────────────────────
function _towerRaycast(e) {
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pt = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, pt))
        return null;
    return {
        x: Math.round(pt.x / CELL) * CELL,
        z: Math.round(pt.z / CELL) * CELL,
    };
}
function _towerCurrentFloorIdx() {
    return parseInt(qs('#tower-floor-sel').value, 10);
}
function _towerFloorR() {
    const floorDef = TOWER_FLOOR_DEFS.find(d => d.floorIndex === _towerCurrentFloorIdx());
    return floorDef?.chamberRadius ?? 7;
}
// ── Tower canvas event listeners ──────────────────────────────────────────────
canvas.addEventListener('mousemove', (e) => {
    if (activeTab !== 'tower')
        return;
    // — drag selected item —
    if (_towerTool === 'select' && _towerDragging && _towerSelectedIdx !== null) {
        const rect = canvas.getBoundingClientRect();
        const ndc = { x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: -((e.clientY - rect.top) / rect.height) * 2 + 1 };
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
        const pt = new THREE.Vector3();
        const grp = towerItemGroups[_towerSelectedIdx];
        if (e.shiftKey) {
            // Shift = vertical (Y-axis) drag only — project onto a camera-facing vertical plane
            const camDir = new THREE.Vector3(camera.position.x - _towerDragStartPos.x, 0, camera.position.z - _towerDragStartPos.z).normalize();
            const vertPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, _towerDragStartPos);
            if (ray.ray.intersectPlane(vertPlane, pt)) {
                let ny = pt.y + _towerDragOffsetY;
                if (_towerSnapToGrid)
                    ny = Math.round(ny / CELL) * CELL;
                grp.position.set(_towerDragStartPos.x, Math.max(-4, Math.min(8, ny)), _towerDragStartPos.z);
            }
        }
        else {
            // Normal = horizontal (XZ) drag on floor plane
            if (ray.ray.intersectPlane(_towerDragPlane, pt)) {
                let nx = pt.x + _towerDragOffset.x;
                let nz = pt.z + _towerDragOffset.z;
                if (_towerSnapToGrid) {
                    nx = Math.round(nx / CELL) * CELL;
                    nz = Math.round(nz / CELL) * CELL;
                }
                grp.position.set(nx, grp.position.y, nz);
            }
        }
        _towerDragMoved = true;
        return;
    }
    // — ghost for place mode — only when no mouse button held (avoids conflict with orbit drag) —
    if (_towerTool === 'place' && e.buttons === 0) {
        const hit = _towerRaycast(e);
        if (!hit) {
            _clearGhost();
            return;
        }
        const dist = Math.sqrt((hit.x / CELL) ** 2 + (hit.z / CELL) ** 2);
        _refreshGhost(hit.x, hit.z, dist <= _towerFloorR() - 1);
    }
});
canvas.addEventListener('mouseleave', () => { if (activeTab === 'tower')
    _clearGhost(); });
canvas.addEventListener('mousedown', (e) => {
    if (activeTab !== 'tower' || _towerTool !== 'select' || e.button !== 0)
        return;
    if (_towerSelectedIdx === null)
        return;
    // Require the click to actually land on the selected item
    if (_towerRaycastItems(e) !== _towerSelectedIdx)
        return;
    const rect = canvas.getBoundingClientRect();
    const ndc = { x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: -((e.clientY - rect.top) / rect.height) * 2 + 1 };
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    const grp = towerItemGroups[_towerSelectedIdx];
    _towerDragStartPos.copy(grp.position);
    const pt = new THREE.Vector3();
    if (ray.ray.intersectPlane(_towerDragPlane, pt)) {
        _towerDragOffset.set(grp.position.x - pt.x, 0, grp.position.z - pt.z);
    }
    // Precompute vertical offset for Shift-drag
    const camDir = new THREE.Vector3(camera.position.x - grp.position.x, 0, camera.position.z - grp.position.z).normalize();
    const ptV = new THREE.Vector3();
    _towerDragOffsetY = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, grp.position)
        .intersectLine(new THREE.Line3(ray.ray.origin, ray.ray.origin.clone().addScaledVector(ray.ray.direction, 1000)), ptV)
        ? grp.position.y - ptV.y : 0;
    _towerDragging = true;
    _towerDragMoved = false;
    orbit.enabled = false; // prevent camera orbit while dragging an item
    e.preventDefault();
});
canvas.addEventListener('mouseup', () => {
    if (_towerDragging) {
        orbit.enabled = true;
        if (_towerSelectedIdx !== null) {
            const grp = towerItemGroups[_towerSelectedIdx];
            const item = _getTowerFloorItems(_towerCurrentFloorIdx())[_towerSelectedIdx];
            if (item) {
                item.x = grp.position.x;
                item.y = grp.position.y;
                item.z = grp.position.z;
            }
        }
    }
    _towerDragging = false;
});
canvas.addEventListener('click', (e) => {
    if (activeTab !== 'tower')
        return;
    if (_towerDragMoved) {
        _towerDragMoved = false;
        return;
    }
    if (_towerTool === 'select') {
        const hitIdx = _towerRaycastItems(e);
        if (hitIdx === null) {
            _deselectTowerItem();
        }
        else if (hitIdx === _towerSelectedIdx) {
            _deselectTowerItem();
        }
        else {
            _selectTowerItem(hitIdx);
        }
        return;
    }
    const hit = _towerRaycast(e);
    if (!hit)
        return;
    const dist = Math.sqrt((hit.x / CELL) ** 2 + (hit.z / CELL) ** 2);
    if (dist > _towerFloorR() - 1) {
        toast('Outside chamber bounds');
        return;
    }
    const floorItems = _getTowerFloorItems(_towerCurrentFloorIdx());
    const existIdx = floorItems.findIndex(i => Math.abs(i.x - hit.x) < 0.1 && Math.abs(i.z - hit.z) < 0.1);
    if (existIdx !== -1) {
        toast('Cell occupied — right-click to remove');
        return;
    }
    const isLib = _towerPaletteMode === 'library';
    if (isLib && !_towerLibModelPath) {
        toast('Select a model from the library first');
        return;
    }
    if (isLib) {
        floorItems.push({ type: 'prop', modelPath: _towerLibModelPath, x: hit.x, z: hit.z, rotation: _ghostRotation });
        _renderTowerItem('prop', hit.x, hit.z, _ghostRotation, _towerLibModelPath);
    }
    else {
        floorItems.push({ type: towerPaletteType, x: hit.x, z: hit.z, rotation: _ghostRotation });
        _renderTowerItem(towerPaletteType, hit.x, hit.z, _ghostRotation);
    }
    _towerFloorSelectorReady = false;
    const floorSel = qs('#tower-floor-sel');
    for (const opt of Array.from(floorSel.options)) {
        const idx = parseInt(opt.value, 10);
        const has = (towerFloorItems.get(idx) ?? []).length > 0;
        opt.textContent = opt.textContent.replace(' ●', '') + (has ? ' ●' : '');
    }
});
canvas.addEventListener('contextmenu', (e) => {
    if (activeTab !== 'tower')
        return;
    e.preventDefault();
    const floorIdx = _towerCurrentFloorIdx();
    const floorItems = _getTowerFloorItems(floorIdx);
    let existIdx;
    if (_towerTool === 'select') {
        // Right-click only deletes if the cursor is directly over the selected item
        if (_towerSelectedIdx === null)
            return;
        if (_towerRaycastItems(e) !== _towerSelectedIdx)
            return;
        existIdx = _towerSelectedIdx;
        _deselectTowerItem();
    }
    else {
        const hit = _towerRaycast(e);
        if (!hit)
            return;
        existIdx = floorItems.findIndex(i => Math.abs(i.x - hit.x) < 0.1 && Math.abs(i.z - hit.z) < 0.1);
        if (existIdx === -1)
            return;
    }
    floorItems.splice(existIdx, 1);
    const g = towerItemGroups[existIdx];
    if (g) {
        scene.remove(g);
        g.traverse(o => {
            if (o instanceof THREE.Mesh) {
                if (Array.isArray(o.material))
                    o.material.forEach(m => m.dispose());
                else
                    o.material.dispose();
                o.geometry.dispose();
            }
        });
        towerItemGroups.splice(existIdx, 1);
    }
    toast('Item removed');
    _towerFloorSelectorReady = false;
    initTowerEditor();
});
window.addEventListener('keydown', (e) => {
    if (activeTab !== 'tower')
        return;
    if (e.key !== 'r' && e.key !== 'R')
        return;
    const next = { 0: 90, 90: 180, 180: 270, 270: 0 };
    if (_towerTool === 'select' && _towerSelectedIdx !== null) {
        // Rotate selected item Y by 90° in select mode
        const item = _getTowerFloorItems(_towerCurrentFloorIdx())[_towerSelectedIdx];
        const grp = towerItemGroups[_towerSelectedIdx];
        if (item && grp) {
            const curDeg = Math.round(((item.rotY ?? item.rotation) % 360 + 360) % 360);
            const newDeg = next[curDeg in next ? curDeg : 0] ?? 90;
            item.rotY = newDeg;
            grp.rotation.y = newDeg * (Math.PI / 180);
            qs('#tower-sel-roty').value = String(newDeg);
            qs('#tower-sel-roty-val').textContent = newDeg + '°';
            toast(`Yaw: ${newDeg}°`);
        }
    }
    else {
        _ghostRotation = next[_ghostRotation];
        if (_ghostGroup)
            _ghostGroup.rotation.y = _ghostRotation * (Math.PI / 180);
        toast(`Rotation: ${_ghostRotation}°`);
    }
});
qs('#tower-floor-sel').addEventListener('change', () => {
    // Do NOT wipe items — each floor keeps its own items via towerFloorItems Map
    initTowerEditor();
});
qs('#btn-tower-clear').addEventListener('click', () => {
    const floorIdxClear = parseInt(qs('#tower-floor-sel').value, 10);
    towerFloorItems.set(floorIdxClear, []);
    _clearTowerItems();
    _clearGhost();
    toast('Cleared all placed items on this floor');
});
qs('#tower-sel-scale').addEventListener('input', (e) => {
    if (_towerSelectedIdx === null)
        return;
    const val = parseFloat(e.target.value);
    const grp = towerItemGroups[_towerSelectedIdx];
    if (!grp)
        return;
    grp.scale.setScalar(val);
    qs('#tower-sel-scale-val').textContent = val.toFixed(2) + '×';
    const item = _getTowerFloorItems(_towerCurrentFloorIdx())[_towerSelectedIdx];
    if (item)
        item.scale = val;
});
// Rotation sliders (Pitch / Yaw / Roll)
['rotx', 'roty', 'rotz'].forEach(axis => {
    qs(`#tower-sel-${axis}`).addEventListener('input', (ev) => {
        if (_towerSelectedIdx === null)
            return;
        const val = parseFloat(ev.target.value);
        const grp = towerItemGroups[_towerSelectedIdx];
        if (!grp)
            return;
        const DEG = Math.PI / 180;
        const item = _getTowerFloorItems(_towerCurrentFloorIdx())[_towerSelectedIdx];
        if (axis === 'rotx') {
            grp.rotation.x = val * DEG;
            if (item)
                item.rotX = val;
            qs('#tower-sel-rotx-val').textContent = val + '°';
        }
        else if (axis === 'roty') {
            grp.rotation.y = val * DEG;
            if (item)
                item.rotY = val;
            qs('#tower-sel-roty-val').textContent = val + '°';
        }
        else {
            grp.rotation.z = val * DEG;
            if (item)
                item.rotZ = val;
            qs('#tower-sel-rotz-val').textContent = val + '°';
        }
    });
});
qs('#btn-tower-export').addEventListener('click', () => {
    const floorIdx = parseInt(qs('#tower-floor-sel').value, 10);
    const floorDef = TOWER_FLOOR_DEFS.find(d => d.floorIndex === floorIdx);
    const output = {
        floor: floorDef?.id ?? `floor_${floorIdx}`,
        chamberScatter: _getTowerFloorItems(floorIdx).map(item => ({
            type: item.type,
            x: Math.round((item.x / CELL) + Math.floor(GRID / 2)),
            z: Math.round((item.z / CELL) + Math.floor(GRID / 2)),
            rotation: item.rotation,
        })),
    };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${floorDef?.id ?? 'room'}_layout.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported room layout JSON');
});
qs('#btn-tower-save-version').addEventListener('click', () => {
    const label = qs('#tower-version-label').value.trim();
    _saveTowerVersionToStorage(label || undefined);
    qs('#tower-version-label').value = '';
});
qs('#btn-tower-load-game').addEventListener('click', () => {
    const totalFloors = TOWER_FLOOR_DEFS.filter(d => d.chamberScatter?.length).length;
    if (totalFloors === 0) {
        toast('No chamberScatter data found in TOWER_FLOOR_DEFS');
        return;
    }
    const hasEdits = [...towerFloorItems.values()].some(v => v.length > 0);
    if (hasEdits) {
        if (!confirm('Load the game tower layout?\n\nYour current unsaved changes will be replaced. Save a version first if you want to keep them.'))
            return;
    }
    _loadTowerFromGame();
});
// ── Building Studio ────────────────────────────────────────────────────────────
function _syncBuildingSlider(id) {
    const slider = qs(`#${id}`);
    const valEl = qs(`#${id}-v`);
    slider.addEventListener('input', () => { valEl.textContent = slider.value; });
}
_syncBuildingSlider('bld-width');
_syncBuildingSlider('bld-depth');
_syncBuildingSlider('bld-floors');
_syncBuildingSlider('bld-floorh');
const BUILDING_TYPE_MAP = {
    tower: 'guard_tower',
    house: 'cottage',
    shop: 'inn',
    temple: 'temple',
    ruins: 'market_cross',
};
function generateBuildingPreview() {
    const typeKey = qs('#bld-type').value;
    const seed = parseInt(qs('#bld-seed').value, 10) || 42;
    const bType = BUILDING_TYPE_MAP[typeKey] ?? 'cottage';
    if (currentBuildingGroup) {
        scene.remove(currentBuildingGroup);
        currentBuildingGroup.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                if (Array.isArray(obj.material))
                    obj.material.forEach(m => m.dispose());
                else
                    obj.material.dispose();
            }
        });
    }
    currentBuildingGroup = generateBuilding(bType, seed);
    showPreview(currentBuildingGroup);
    toast(`Generated ${typeKey} (seed ${seed})`);
}
qs('#btn-bld-generate').addEventListener('click', generateBuildingPreview);
qs('#btn-bld-random').addEventListener('click', () => {
    qs('#bld-seed').value = String(Math.floor(Math.random() * 99999));
    generateBuildingPreview();
});
qs('#btn-bld-save').addEventListener('click', () => {
    const typeKey = qs('#bld-type').value;
    const seed = qs('#bld-seed').value;
    const entry = {
        id: crypto.randomUUID(),
        name: `${typeKey} (seed ${seed})`,
        typeId: 'building',
        category: 'buildings',
        params: {
            seed: parseInt(seed, 10),
            width: parseInt(qs('#bld-width').value, 10),
            depth: parseInt(qs('#bld-depth').value, 10),
            floors: parseInt(qs('#bld-floors').value, 10),
        },
        color: '#8a7a6a',
        color2: '#5a5a6a',
        createdAt: Date.now(),
        kind: 'building',
        buildingType: typeKey,
        thumbnail: _captureThumb(),
    };
    addToLibrary(entry);
    toast(`"${entry.name}" saved to Library`);
});
// ── Library ────────────────────────────────────────────────────────────────────
document.querySelectorAll('.lib-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.lib-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        libCat = btn.dataset['libcat'];
        renderLibraryGrid();
    });
});
const CATEGORY_EMOJI = {
    furniture: '🛏', props: '🛢', structures: '🏛', light: '🏮',
    buildings: '🏠', room: '🏰',
};
function renderLibraryGrid() {
    const grid = qs('#lib-grid');
    const entries = loadLibrary().filter(e => {
        if (libCat === 'assets')
            return e.kind === 'asset';
        if (libCat === 'buildings')
            return e.kind === 'building';
        if (libCat === 'rooms')
            return e.kind === 'room';
        return false;
    });
    grid.innerHTML = '';
    if (!entries.length) {
        const empty = document.createElement('div');
        empty.className = 'lib-empty';
        empty.innerHTML = `No ${libCat} saved yet.<br>Create some in the other tabs!`;
        grid.appendChild(empty);
        return;
    }
    for (const entry of entries) {
        const def = ASSET_TYPES.find(t => t.id === entry.typeId);
        const icon = def?.emoji ?? CATEGORY_EMOJI[entry.category] ?? '📁';
        const card = document.createElement('div');
        card.className = 'lib-card';
        const thumb = document.createElement('div');
        thumb.className = 'lib-card-thumb';
        if (entry.thumbnail) {
            const img = document.createElement('img');
            img.src = entry.thumbnail;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
            thumb.style.padding = '0';
            thumb.appendChild(img);
        }
        else {
            thumb.style.background = `linear-gradient(135deg, ${entry.color}55, ${entry.color2}55)`;
            thumb.textContent = icon;
        }
        const body = document.createElement('div');
        body.className = 'lib-card-body';
        const name = document.createElement('div');
        name.className = 'lib-card-name';
        name.title = entry.name;
        name.textContent = entry.name;
        const meta = document.createElement('div');
        meta.className = 'lib-card-meta';
        const date = new Date(entry.createdAt);
        meta.textContent = `${entry.typeId} · ${date.toLocaleDateString()}`;
        const actions = document.createElement('div');
        actions.className = 'lib-card-actions';
        const loadBtn = document.createElement('button');
        loadBtn.className = 'lib-card-btn';
        loadBtn.textContent = 'Load';
        loadBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            loadLibraryEntry(entry);
        });
        const delBtn = document.createElement('button');
        delBtn.className = 'lib-card-btn del';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            deleteFromLibrary(entry.id);
            card.remove();
            if (!grid.childElementCount)
                renderLibraryGrid(); // show empty state
            toast(`Deleted "${entry.name}"`);
        });
        const expBtn = document.createElement('button');
        expBtn.className = 'lib-card-btn';
        expBtn.textContent = 'JSON';
        expBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const blob = new Blob([JSON.stringify(entry, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${entry.name.replace(/[^a-z0-9]/gi, '_')}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
        actions.append(loadBtn, expBtn, delBtn);
        body.append(name, meta);
        card.append(thumb, body, actions);
        grid.appendChild(card);
    }
}
function loadLibraryEntry(entry) {
    if (entry.kind === 'asset') {
        switchTab('assets');
        const def = ASSET_TYPES.find(t => t.id === entry.typeId);
        if (!def) {
            toast('Unknown asset type');
            return;
        }
        selectedAssetId = entry.typeId;
        paramValues = { ...entry.params };
        qs('#asset-color').value = entry.color;
        qs('#asset-color2').value = entry.color2;
        qs('#asset-category').value = def.category;
        buildAssetTypeList(def.category);
        buildParamSliders(def.params.map(p => ({ ...p, default: paramValues[p.id] ?? p.default })));
        previewCurrentAsset();
        toast(`Loaded "${entry.name}"`);
    }
    else if (entry.kind === 'building') {
        switchTab('buildings');
        qs('#bld-seed').value = String(entry.params['seed'] ?? 42);
        qs('#bld-type').value = entry.buildingType ?? 'cottage';
        generateBuildingPreview();
        toast(`Loaded "${entry.name}"`);
    }
    else {
        toast(`Loaded "${entry.name}" — go to Tower Rooms to see it`);
    }
}
// Export all library
qs('#btn-lib-export-all').addEventListener('click', () => {
    const all = loadLibrary();
    if (!all.length) {
        toast('Library is empty');
        return;
    }
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ttt_library_export.json';
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${all.length} items`);
});
// Import library
qs('#btn-lib-import').addEventListener('click', () => {
    qs('#lib-import-input').click();
});
qs('#lib-import-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file)
        return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const imported = JSON.parse(ev.target?.result);
            if (!Array.isArray(imported))
                throw new Error('Not an array');
            const existing = loadLibrary();
            const existingIds = new Set(existing.map(e => e.id));
            const newItems = imported.filter(e => !existingIds.has(e.id));
            saveLibrary([...existing, ...newItems]);
            renderLibraryGrid();
            toast(`Imported ${newItems.length} new items`);
        }
        catch {
            toast('Import failed — invalid JSON format');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});
// ── Help button ────────────────────────────────────────────────────────────────
qs('#btn-help').addEventListener('click', () => {
    toast('Asset Studio: pick a type, adjust params, preview & save  ·  Buildings: generate & save  ·  Library: browse saved items', 4000);
});
