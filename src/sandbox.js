/**
 * sandbox.ts — Interactive modular tile sandbox.
 *
 * A live 3D builder for visual testing and design iteration.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  Left panel: Tile palette (all Kenney GLB pieces)           │
 * │  Centre:     THREE.js viewport with OrbitControls           │
 * │              Annotation overlay canvas (draw with pen)      │
 * │  Right panel: Mode/Rotation/Floor controls + Presets        │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Playwright API
 * ──────────────
 *   window.__sandbox.placeTile(path, col, row, floor?, rotY?)
 *   window.__sandbox.assembleBuilding(type, seed?, col?, row?)
 *   window.__sandbox.clearAll()
 *   window.__sandbox.setCameraPreset('iso' | 'top' | 'front' | 'side')
 *   window.__sandbox.setCamera(x, y, z, lx?, ly?, lz?)
 *   window.__sandbox.canvasDataURL()
 *   window.__sandbox.getTiles()
 *   window.__sandbox.ready  → boolean
 *
 * Keyboard shortcuts
 * ──────────────────
 *   P = place mode    D = delete mode   R = rotate 90°
 *   Q = floor down    E = floor up      A = toggle annotation
 *   Ctrl+Z = undo     Del = delete under cursor
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AssetLoader } from '@/assets/AssetLoader';
import { assembleBuilding, BUILDING_PRELOAD_PATHS, } from '@/world/buildings/AssetBuildingAssembler';
import { generateBuilding } from '@/world/buildings/BuildingGenerator';
import { mulberry32 } from '@/core/prng';
import { ASSET_PACKS } from '@/assetManifest';
import { loadWorldGenConfig, saveWorldGenConfig, KENNEY_PACKS, } from '@/world/WorldGenConfig';
import { createSlimeBodyIM } from '@/enemy/SlimeEnemy';
// ── Constants ─────────────────────────────────────────────────────────────────
const T = 2; // tile size in WU (matches game constant)
const FLOOR_H = T; // WU per floor level (wall height)
const GHALF = 12; // grid extends ±GHALF tiles from origin
// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas3d = document.getElementById('c3d');
const annotCanvas = document.getElementById('annotation-canvas');
const wrap = document.getElementById('viewport-wrap');
// ── Renderer / Scene / Camera ─────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1e26);
scene.fog = new THREE.FogExp2(0x1a1e26, 0.018);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
camera.position.set(20, 18, 20);
camera.lookAt(0, 0, 0);
const orbitControls = new OrbitControls(camera, canvas3d);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.12;
orbitControls.minDistance = 3;
orbitControls.maxDistance = 100;
orbitControls.maxPolarAngle = Math.PI / 2.05;
// ── Lights ────────────────────────────────────────────────────────────────────
scene.add(new THREE.HemisphereLight(0xaac8e0, 0x3a5a28, 1.0));
const sun = new THREE.DirectionalLight(0xfff5e0, 2.4);
sun.position.set(16, 26, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sScale = GHALF * T + 10;
Object.assign(sun.shadow.camera, { left: -sScale, right: sScale, top: sScale, bottom: -sScale });
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;
scene.add(sun);
// Fill light from opposite side
const fill = new THREE.DirectionalLight(0xaaccff, 0.5);
fill.position.set(-10, 8, -8);
scene.add(fill);
// ── Ground + Grid ─────────────────────────────────────────────────────────────
const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry((GHALF * 2 + 2) * T, (GHALF * 2 + 2) * T), new THREE.MeshLambertMaterial({ color: 0x1e2430 }));
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.y = -0.004;
groundMesh.receiveShadow = true;
scene.add(groundMesh);
// Tile grid — one line per tile
scene.add(new THREE.GridHelper(GHALF * 2 * T, GHALF * 2, 0x3a4860, 0x252d3a));
// Invisible raycast plane — y updated per floor
const rayPlane = new THREE.Mesh(new THREE.PlaneGeometry(10_000, 10_000), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
rayPlane.rotation.x = -Math.PI / 2;
scene.add(rayPlane);
// Ghost cursor indicator — green quad snapped to tile grid
const ghostIndicator = new THREE.Mesh(new THREE.PlaneGeometry(T * 0.88, T * 0.88), new THREE.MeshBasicMaterial({
    color: 0x44ee88, transparent: true, opacity: 0.3, depthWrite: false,
}));
ghostIndicator.rotation.x = -Math.PI / 2;
ghostIndicator.visible = false;
scene.add(ghostIndicator);
// Ghost tile group (semi-transparent preview of selected tile)
const ghostTileGroup = new THREE.Group();
ghostTileGroup.visible = false;
scene.add(ghostTileGroup);
// Preview-cell pool — blue highlight squares for line / rect tool
const MAX_PREVIEW = 500;
const previewMat = new THREE.MeshBasicMaterial({
    color: 0x44aaff, transparent: true, opacity: 0.22, depthWrite: false,
});
const previewPool = [];
for (let i = 0; i < MAX_PREVIEW; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(T * 0.92, T * 0.92), previewMat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    previewPool.push(m);
}
function setPreviewCells(cells) {
    const y = currentFloor * FLOOR_H + 0.01;
    const n = Math.min(cells.length, MAX_PREVIEW);
    for (let i = 0; i < n; i++) {
        previewPool[i].position.set(cells[i].col * T, y, cells[i].row * T);
        previewPool[i].visible = true;
    }
    for (let i = n; i < MAX_PREVIEW; i++)
        previewPool[i].visible = false;
}
function clearPreviewCells() {
    for (let i = 0; i < MAX_PREVIEW; i++)
        previewPool[i].visible = false;
}
// ── Resize ────────────────────────────────────────────────────────────────────
function resize() {
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (W === 0 || H === 0)
        return;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    // Keep annotation canvas pixel-perfect
    annotCanvas.width = W;
    annotCanvas.height = H;
}
window.addEventListener('resize', resize);
const loader = new AssetLoader();
const placedTiles = [];
let selectedPath = null;
let selectedBtn = null;
// Code-mode palette selection (key = 'building:<type>' or 'nature:<tree|rock>')
let selectedCodeItem = null;
let selectedCodeBtn = null;
let currentRotDeg = 0;
let currentFloor = 0;
let mode = 'pencil';
// Fine sub-grid offset (WU)
let tileOffX = 0;
let tileOffZ = 0;
const OFFSET_STEP = 0.25;
// Drag-paint / tool state
let isPointerDown = false;
let lastPaintCol = -9999;
let lastPaintRow = -9999;
let lineStartPos = null;
let rectStartPos = null;
let cursorCol = 0;
let cursorRow = 0;
let cursorInViewport = false;
let ghostLoadedPath = null;
// ── Auto-categorized tile catalog from manifest ───────────────────────────────
/** Derive a human-readable sub-category from the GLB filename. */
function autoCategory(pack, filename) {
    const n = filename.replace('.glb', '');
    if (pack === 'nature') {
        if (n.startsWith('ground_grass'))
            return 'Grass';
        if (n.startsWith('ground_path'))
            return 'Paths';
        if (n.startsWith('ground_river'))
            return 'Rivers';
        if (n.startsWith('ground_water') || n === 'water')
            return 'Water';
        if (n.startsWith('tree') || n.startsWith('bush'))
            return 'Vegetation';
        if (n.startsWith('rock'))
            return 'Rocks';
        return 'Ground';
    }
    if (pack === 'buildings') {
        if (n.startsWith('wall'))
            return 'Walls';
        if (n.startsWith('roof'))
            return 'Roofs';
        if (n.startsWith('floor') || n.startsWith('wood-floor'))
            return 'Floors';
        if (n.startsWith('tower'))
            return 'Towers';
        if (n.startsWith('stairs'))
            return 'Stairs';
        if (n.startsWith('battlement'))
            return 'Battlements';
        if (n.startsWith('fence'))
            return 'Fences';
        if (n.startsWith('overhang'))
            return 'Overhangs';
        if (n.startsWith('dock'))
            return 'Dock';
        if (n.startsWith('structure'))
            return 'Structure';
        if (n.startsWith('column'))
            return 'Columns';
        if (n.startsWith('detail') || n.startsWith('barrel') || n.startsWith('pulley') || n.startsWith('ladder'))
            return 'Props';
        return 'Misc';
    }
    if (pack === 'town') {
        if (n.startsWith('road'))
            return 'Roads';
        if (n.startsWith('roof'))
            return 'Roofs';
        if (n.startsWith('stairs'))
            return 'Stairs';
        if (n.startsWith('fountain'))
            return 'Fountains';
        if (n.startsWith('hedge'))
            return 'Vegetation';
        if (n.startsWith('fence'))
            return 'Fences';
        if (n.startsWith('banner') || n.startsWith('blade') || n.startsWith('cart') ||
            n.startsWith('lantern') || n.startsWith('rock'))
            return 'Props';
        if (n.startsWith('chimney') || n.startsWith('balcony') || n.startsWith('planks') ||
            n.startsWith('poles') || n.startsWith('pillar') || n.startsWith('overhang'))
            return 'Architecture';
        return 'Misc';
    }
    if (pack === 'castle') {
        if (n.includes('tower-square'))
            return 'Square Tower';
        if (n.includes('tower-round'))
            return 'Round Tower';
        if (n.includes('tower-pentagon'))
            return 'Pentagon Tower';
        if (n.startsWith('wall'))
            return 'Walls';
        if (n.startsWith('gate'))
            return 'Gates';
        if (n.startsWith('stairs'))
            return 'Stairs';
        return 'Misc';
    }
    if (pack === 'dungeon') {
        if (n.startsWith('gate'))
            return 'Gates';
        if (n.startsWith('corridor'))
            return 'Corridors';
        if (n.startsWith('room'))
            return 'Rooms';
        if (n.startsWith('stairs'))
            return 'Stairs';
        if (n.startsWith('template'))
            return 'Templates';
        return 'Misc';
    }
    return 'Misc';
}
const PACK_COLORS = {
    buildings: '#a07848',
    castle: '#6060a0',
    dungeon: '#6a3a8a',
    nature: '#3a703a',
    town: '#6b8b3a',
};
function buildCatalog() {
    const map = new Map();
    for (const [pack, paths] of Object.entries(ASSET_PACKS)) {
        for (const path of paths) {
            const filename = path.split('/').pop();
            const subcat = autoCategory(pack, filename);
            const key = `${pack}::${subcat}`;
            if (!map.has(key)) {
                map.set(key, {
                    pack,
                    subcat,
                    color: PACK_COLORS[pack] ?? '#888',
                    paths: [],
                });
            }
            map.get(key).paths.push(path);
        }
    }
    // Sort: by pack order, then sub-category
    const packOrder = ['buildings', 'castle', 'dungeon', 'nature', 'town'];
    return [...map.values()].sort((a, b) => {
        const pi = packOrder.indexOf(a.pack) - packOrder.indexOf(b.pack);
        return pi !== 0 ? pi : a.subcat.localeCompare(b.subcat);
    });
}
const CATALOG = buildCatalog();
// ── Palette collapse state ────────────────────────────────────────────────────
const collapsedPacks = new Set(); // empty = all packs open
// ── Line / rect helper algorithms ────────────────────────────────────────────
function bresenhamLine(c0, r0, c1, r1) {
    const cells = [];
    const dc = Math.abs(c1 - c0), dr = Math.abs(r1 - r0);
    const sc = c0 < c1 ? 1 : -1, sr = r0 < r1 ? 1 : -1;
    let err = dc - dr, c = c0, r = r0;
    for (;;) {
        cells.push({ col: c, row: r });
        if (c === c1 && r === r1)
            break;
        const e2 = 2 * err;
        if (e2 > -dr) {
            err -= dr;
            c += sc;
        }
        if (e2 < dc) {
            err += dc;
            r += sr;
        }
    }
    return cells;
}
function fillRect(c0, r0, c1, r1) {
    const cells = [];
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++)
        for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++)
            cells.push({ col: c, row: r });
    return cells;
}
// ── Palette UI ────────────────────────────────────────────────────────────────
/** Short display name for a GLB path: removes /assets/pack/ prefix + .glb suffix */
function shortName(path) {
    return path.split('/').pop().replace('.glb', '');
}
const PACK_ICONS = {
    buildings: '🏠', castle: '🏰', dungeon: '🗝️', nature: '🌿', town: '🏘️',
};
function buildPaletteUI() {
    const scroll = document.getElementById('palette-scroll');
    scroll.innerHTML = '';
    // Group catalog entries by pack
    const byPack = new Map();
    for (const group of CATALOG) {
        if (!byPack.has(group.pack))
            byPack.set(group.pack, []);
        byPack.get(group.pack).push(group);
    }
    for (const [pack, groups] of byPack) {
        const totalTiles = groups.reduce((s, g) => s + g.paths.length, 0);
        const isOpen = !collapsedPacks.has(pack);
        const color = PACK_COLORS[pack] ?? '#888';
        // ── Pack section wrapper ──────────────────────────────
        const packSection = document.createElement('div');
        packSection.className = 'pack-section';
        packSection.dataset['pack'] = pack;
        // ── Pack header (collapsible) ─────────────────────────
        const ph = document.createElement('div');
        ph.className = 'pack-header';
        ph.style.borderLeft = `3px solid ${color}`;
        ph.style.color = color;
        ph.innerHTML =
            `<span class="ph-arrow" style="display:inline-block;transition:transform .15s;transform:rotate(${isOpen ? 90 : 0}deg)">▶</span>` +
                `<span class="ph-icon">${PACK_ICONS[pack] ?? '📦'}</span>` +
                `<span class="ph-name">${pack}</span>` +
                `<span class="ph-count">${totalTiles}</span>`;
        ph.addEventListener('click', () => {
            const content = packSection.querySelector('.pack-content');
            const arrow = ph.querySelector('.ph-arrow');
            if (collapsedPacks.has(pack)) {
                collapsedPacks.delete(pack);
                content.style.display = '';
                arrow.style.transform = 'rotate(90deg)';
            }
            else {
                collapsedPacks.add(pack);
                content.style.display = 'none';
                arrow.style.transform = 'rotate(0deg)';
            }
        });
        packSection.appendChild(ph);
        // ── Pack content (all tiles — always in DOM for search) ─
        const content = document.createElement('div');
        content.className = 'pack-content';
        if (!isOpen)
            content.style.display = 'none';
        for (const group of groups) {
            // Sub-category header
            const sh = document.createElement('div');
            sh.className = 'subcat-hdr';
            sh.textContent = `${group.subcat}  (${group.paths.length})`;
            content.appendChild(sh);
            for (const path of group.paths) {
                const btn = document.createElement('button');
                btn.className = 'tile-btn';
                btn.title = path;
                btn.textContent = shortName(path);
                btn.dataset['path'] = path;
                if (path === selectedPath) {
                    btn.classList.add('selected');
                    selectedBtn = btn;
                }
                btn.addEventListener('click', () => {
                    selectedBtn?.classList.remove('selected');
                    btn.classList.add('selected');
                    selectedBtn = btn;
                    selectedPath = path;
                    updateHUD();
                    refreshGhostModel().catch(console.error);
                });
                content.appendChild(btn);
            }
        }
        packSection.appendChild(content);
        scroll.appendChild(packSection);
    }
}
// ── Code-mode palette ─────────────────────────────────────────────────────────
/** Visual metadata for each code-mode palette item. */
const CODE_BUILDINGS = [
    { key: 'building:cottage', icon: '🏡', name: 'Cottage', desc: 'Small 1-room dwelling', footprint: '2×2' },
    { key: 'building:inn', icon: '🏨', name: 'Inn', desc: '2-floor traveller lodge', footprint: '3×4' },
    { key: 'building:market_stall', icon: '⛺', name: 'Market Stall', desc: 'Open awning & counter', footprint: '2×2' },
    { key: 'building:smithy', icon: '⚒️', name: 'Smithy', desc: 'Forge + chimney', footprint: '2×2' },
    { key: 'building:tavern', icon: '🍺', name: 'Tavern', desc: 'Wide 2-floor social hub', footprint: '4×3' },
    { key: 'building:temple', icon: '🏛️', name: 'Temple', desc: 'Columns + dome', footprint: '4×4' },
    { key: 'building:city_hall', icon: '🏛', name: 'City Hall', desc: '3-floor seat of power', footprint: '6×4' },
    { key: 'building:guard_tower', icon: '🗼', name: 'Guard Tower', desc: 'Tall cylinder + battlements', footprint: '2×2' },
    { key: 'building:well', icon: '🪣', name: 'Well', desc: 'Stone surround + bucket', footprint: '1×1' },
    { key: 'building:market_cross', icon: '✚', name: 'Market Cross', desc: 'Civic column focal point', footprint: '1×1' },
];
const CODE_NATURE = [
    { key: 'nature:tree', icon: '🌲', name: 'Tree', desc: 'Cone canopy + cylinder trunk' },
    { key: 'nature:rock', icon: '🪨', name: 'Rock', desc: 'Icosahedron boulder' },
    { key: 'nature:bush', icon: '🌿', name: 'Bush', desc: 'Low sphere cluster' },
    { key: 'nature:stump', icon: '🪵', name: 'Stump', desc: 'Short flat cylinder' },
];
/** Build or rebuild the procedural code-mode palette. */
function buildCodePaletteUI() {
    const scroll = document.getElementById('code-palette-scroll');
    scroll.innerHTML = '';
    const hdrB = document.createElement('div');
    hdrB.className = 'code-section-hdr';
    hdrB.textContent = '🏗 Procedural Buildings';
    scroll.appendChild(hdrB);
    for (const item of CODE_BUILDINGS) {
        const btn = document.createElement('button');
        btn.className = 'code-item-btn';
        if (item.key === selectedCodeItem)
            btn.classList.add('selected');
        btn.innerHTML =
            `<span class="ci-icon">${item.icon}</span>` +
                `<span style="flex:1;min-width:0"><span class="ci-name">${item.name}</span>` +
                `<span class="ci-desc">${item.desc}</span></span>` +
                `<span class="ci-footprint">${item.footprint}</span>`;
        btn.addEventListener('click', () => {
            selectedCodeBtn?.classList.remove('selected');
            btn.classList.add('selected');
            selectedCodeBtn = btn;
            selectedCodeItem = item.key;
            selectedPath = null; // clear GLB selection
            selectedBtn?.classList.remove('selected');
            selectedBtn = null;
            refreshCodeGhost();
            updateHUD();
        });
        scroll.appendChild(btn);
    }
    const hdrN = document.createElement('div');
    hdrN.className = 'code-section-hdr';
    hdrN.textContent = '🌿 Procedural Nature';
    scroll.appendChild(hdrN);
    for (const item of CODE_NATURE) {
        const btn = document.createElement('button');
        btn.className = 'code-item-btn';
        if (item.key === selectedCodeItem)
            btn.classList.add('selected');
        btn.innerHTML =
            `<span class="ci-icon">${item.icon}</span>` +
                `<span style="flex:1;min-width:0"><span class="ci-name">${item.name}</span>` +
                `<span class="ci-desc">${item.desc}</span></span>`;
        btn.addEventListener('click', () => {
            selectedCodeBtn?.classList.remove('selected');
            btn.classList.add('selected');
            selectedCodeBtn = btn;
            selectedCodeItem = item.key;
            selectedPath = null;
            selectedBtn?.classList.remove('selected');
            selectedBtn = null;
            refreshCodeGhost();
            updateHUD();
        });
        scroll.appendChild(btn);
    }
}
/** Filter palette tiles; shows matching tiles across all packs (expanding if needed). */
function filterPalette(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
        // Restore pack collapse state
        document.querySelectorAll('#palette-scroll .pack-section').forEach(sec => {
            sec.style.display = '';
            const pack = sec.dataset['pack'] ?? '';
            const content = sec.querySelector('.pack-content');
            if (content)
                content.style.display = collapsedPacks.has(pack) ? 'none' : '';
            sec.querySelectorAll('.tile-btn').forEach(b => b.style.display = '');
            sec.querySelectorAll('.subcat-hdr').forEach(h => h.style.display = '');
        });
        return;
    }
    // Show matching tiles; temporarily expand all pack-content sections
    document.querySelectorAll('#palette-scroll .pack-section').forEach(sec => {
        let packHasMatch = false;
        const content = sec.querySelector('.pack-content');
        sec.querySelectorAll('.tile-btn').forEach(btn => {
            const matches = (btn.textContent ?? '').toLowerCase().includes(q);
            btn.style.display = matches ? '' : 'none';
            if (matches)
                packHasMatch = true;
        });
        sec.querySelectorAll('.subcat-hdr').forEach(h => h.style.display = '');
        sec.style.display = packHasMatch ? '' : 'none';
        if (content)
            content.style.display = packHasMatch ? '' : 'none';
    });
}
// ── Building assembly helper (used by API + My Creations) ────────────────────
async function _placeBuilding(type, seed, col, row) {
    setStatus(`Assembling ${type}…`);
    await loader.preload([...BUILDING_PRELOAD_PATHS]);
    const grp = assembleBuilding(loader, type, seed);
    grp.position.set(col * T, 0, row * T);
    scene.add(grp);
    placedTiles.push({ path: `preset:${type}`, col, row, floor: 0, rotY: 0, offX: 0, offZ: 0, group: grp });
    setStatus(`${type} assembled`);
}
// ── Tile placement ────────────────────────────────────────────────────────────
async function placeTileAt(path, col, row, floor, rotY, offX = 0, offZ = 0) {
    await loader.preload([path]);
    const model = loader.getClone(path);
    if (!model) {
        setStatus(`⚠ Could not clone: ${path}`);
        return;
    }
    model.scale.setScalar(T);
    const g = new THREE.Group();
    g.add(model);
    g.rotation.y = rotY;
    g.position.set(col * T + offX, floor * FLOOR_H, row * T + offZ);
    scene.add(g);
    placedTiles.push({ path, col, row, floor, rotY, offX, offZ, group: g });
    setStatus(`Placed  ${path.split('/').pop()}  at (${col}, ${row}, F${floor})`);
}
function removeTileAt(col, row, floor) {
    // Remove topmost tile at this position (last in array = most recently placed)
    for (let i = placedTiles.length - 1; i >= 0; i--) {
        const t = placedTiles[i];
        if (t.col === col && t.row === row && t.floor === floor) {
            scene.remove(t.group);
            freeGroup(t.group);
            placedTiles.splice(i, 1);
            setStatus(`Removed at (${col}, ${row}, F${floor})`);
            return true;
        }
    }
    return false;
}
function clearAll() {
    for (const t of [...placedTiles]) {
        scene.remove(t.group);
        freeGroup(t.group);
    }
    placedTiles.length = 0;
    setStatus('Scene cleared');
}
function undo() {
    if (placedTiles.length === 0)
        return;
    const last = placedTiles.pop();
    scene.remove(last.group);
    freeGroup(last.group);
    setStatus('Undone');
}
function freeGroup(g) {
    g.traverse((child) => {
        const m = child;
        if (!m.isMesh)
            return;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats)
            mat.dispose();
    });
}
// ── Ghost tile (semi-transparent preview) ─────────────────────────────────────
/** Build a ghost preview for the currently selected code item. */
function refreshCodeGhost() {
    // Clear previous ghost
    while (ghostTileGroup.children.length > 0)
        ghostTileGroup.remove(ghostTileGroup.children[0]);
    ghostLoadedPath = null;
    if (!selectedCodeItem)
        return;
    let src = null;
    if (selectedCodeItem.startsWith('building:')) {
        const type = selectedCodeItem.slice('building:'.length);
        src = generateBuilding(type, 12345);
    }
    else if (selectedCodeItem === 'nature:tree') {
        src = _makeProceduralTree(12345);
    }
    else if (selectedCodeItem === 'nature:rock') {
        src = _makeProceduralRock(12345);
    }
    else if (selectedCodeItem === 'nature:bush') {
        src = _makeProceduralBush(12345);
    }
    else if (selectedCodeItem === 'nature:stump') {
        src = _makeProceduralStump();
    }
    if (!src)
        return;
    src.traverse(child => {
        const mesh = child;
        if (!mesh.isMesh)
            return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mesh.material = mats.map(mat => {
            const c = mat.clone();
            c.transparent = true;
            c.opacity = 0.35;
            c.depthWrite = false;
            return c;
        });
    });
    ghostTileGroup.add(src);
}
async function refreshGhostModel() {
    if (!selectedPath || ghostLoadedPath === selectedPath)
        return;
    ghostLoadedPath = selectedPath;
    const pathSnapshot = selectedPath;
    // Clear old ghost children
    while (ghostTileGroup.children.length > 0) {
        ghostTileGroup.remove(ghostTileGroup.children[0]);
    }
    try {
        await loader.preload([pathSnapshot]);
        if (ghostLoadedPath !== pathSnapshot)
            return; // selection changed
        const model = loader.getClone(pathSnapshot);
        if (!model)
            return;
        model.scale.setScalar(T);
        // Clone materials to make semi-transparent without affecting the cache
        model.traverse((child) => {
            const mesh = child;
            if (!mesh.isMesh)
                return;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mesh.material = mats.map(mat => {
                const c = mat.clone();
                c.transparent = true;
                c.opacity = 0.4;
                c.depthWrite = false;
                return c;
            });
        });
        ghostTileGroup.add(model);
    }
    catch {
        // ignore — ghost is cosmetic
    }
}
// ── Procedural nature helpers (code-mode) ─────────────────────────────────────
function _makeProceduralTree(seed) {
    const rng = mulberry32(seed);
    const g = new THREE.Group();
    const h = 1.2 + rng() * 0.8;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, h, 6), new THREE.MeshStandardMaterial({ color: 0x5a3a1a }));
    trunk.position.y = h / 2;
    g.add(trunk);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.55 + rng() * 0.2, 1.2 + rng() * 0.4, 7), new THREE.MeshStandardMaterial({ color: 0x2d6a2d }));
    canopy.position.y = h + 0.4;
    g.add(canopy);
    return g;
}
function _makeProceduralRock(seed) {
    const rng = mulberry32(seed);
    const g = new THREE.Group();
    const r = 0.35 + rng() * 0.25;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), new THREE.MeshStandardMaterial({ color: 0x888877, roughness: 0.9 }));
    rock.position.y = r * 0.6;
    rock.rotation.y = rng() * Math.PI;
    g.add(rock);
    return g;
}
function _makeProceduralBush(seed) {
    const rng = mulberry32(seed);
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a7a30 });
    for (let i = 0; i < 3; i++) {
        const r = 0.22 + rng() * 0.12;
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), mat);
        sphere.position.set((rng() - 0.5) * 0.3, r * 0.7 + rng() * 0.1, (rng() - 0.5) * 0.3);
        g.add(sphere);
    }
    return g;
}
function _makeProceduralStump() {
    const g = new THREE.Group();
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.28, 7), new THREE.MeshStandardMaterial({ color: 0x6a4820, roughness: 0.95 }));
    stump.position.y = 0.14;
    g.add(stump);
    return g;
}
/** Place whatever the code-mode palette has selected at (col, row). */
function placeCodeItem(col, row) {
    if (!selectedCodeItem)
        return;
    const wy = currentFloor * FLOOR_H;
    let grp = null;
    let path = selectedCodeItem;
    if (selectedCodeItem.startsWith('building:')) {
        const type = selectedCodeItem.slice('building:'.length);
        path = `code:building:${type}`;
        grp = generateBuilding(type, Math.floor(Math.random() * 0xffff));
    }
    else if (selectedCodeItem === 'nature:tree') {
        path = 'code:nature:tree';
        grp = _makeProceduralTree(Math.floor(Math.random() * 0xffff));
    }
    else if (selectedCodeItem === 'nature:rock') {
        path = 'code:nature:rock';
        grp = _makeProceduralRock(Math.floor(Math.random() * 0xffff));
    }
    else if (selectedCodeItem === 'nature:bush') {
        path = 'code:nature:bush';
        grp = _makeProceduralBush(Math.floor(Math.random() * 0xffff));
    }
    else if (selectedCodeItem === 'nature:stump') {
        path = 'code:nature:stump';
        grp = _makeProceduralStump();
    }
    if (!grp)
        return;
    grp.position.set(col * T + tileOffX, wy, row * T + tileOffZ);
    grp.rotation.y = (currentRotDeg * Math.PI) / 180;
    scene.add(grp);
    placedTiles.push({ path, col, row, floor: currentFloor, rotY: (currentRotDeg * Math.PI) / 180, offX: tileOffX, offZ: tileOffZ, group: grp });
    setStatus(`Placed ${selectedCodeItem.split(':').pop()} at (${col}, ${row}, F${currentFloor})`);
}
// ── Raycasting / mouse ────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const ndcMouse = new THREE.Vector2();
function screenToTile(clientX, clientY) {
    const rect = canvas3d.getBoundingClientRect();
    ndcMouse.set(((clientX - rect.left) / rect.width) * 2 - 1, ((clientY - rect.top) / rect.height) * -2 + 1);
    raycaster.setFromCamera(ndcMouse, camera);
    const hits = raycaster.intersectObject(rayPlane);
    if (hits.length === 0)
        return null;
    const p = hits[0].point;
    return { col: Math.round(p.x / T), row: Math.round(p.z / T) };
}
function updateGhostPosition(col, row) {
    const wx = col * T + tileOffX;
    const wy = currentFloor * FLOOR_H;
    const wz = row * T + tileOffZ;
    ghostIndicator.position.set(wx, wy + 0.008, wz);
    ghostTileGroup.position.set(wx, wy, wz);
    ghostTileGroup.rotation.y = (currentRotDeg * Math.PI) / 180;
    const showGhost = mode !== 'erase' && (selectedPath !== null || selectedCodeItem !== null);
    ghostIndicator.visible = true;
    ghostTileGroup.visible = showGhost;
    // Indicator colour by mode
    const indicatorColor = mode === 'erase' ? 0xff4444 :
        mode === 'line' ? (lineStartPos ? 0xff8800 : 0x44aaff) :
            mode === 'rect' ? 0xffaa44 : 0x44ee88;
    ghostIndicator.material.color.setHex(indicatorColor);
}
/** Replace tile at (col, row, floor) then place new one — the "paint" action. */
function paintAt(col, row) {
    // Code mode: place procedural item
    if (selectedCodeItem) {
        removeTileAt(col, row, currentFloor);
        placeCodeItem(col, row);
        return;
    }
    if (!selectedPath)
        return;
    removeTileAt(col, row, currentFloor);
    const rotY = (currentRotDeg * Math.PI) / 180;
    placeTileAt(selectedPath, col, row, currentFloor, rotY, tileOffX, tileOffZ).catch(console.error);
}
/** Place all cells (line / rect bulk) */
async function placeMany(cells) {
    // Code mode
    if (selectedCodeItem) {
        for (const c of cells) {
            removeTileAt(c.col, c.row, currentFloor);
            placeCodeItem(c.col, c.row);
        }
        return;
    }
    if (!selectedPath)
        return;
    const rotY = (currentRotDeg * Math.PI) / 180;
    const path = selectedPath;
    for (const c of cells) {
        removeTileAt(c.col, c.row, currentFloor);
        await placeTileAt(path, c.col, c.row, currentFloor, rotY, tileOffX, tileOffZ);
    }
}
canvas3d.addEventListener('pointermove', (e) => {
    cursorInViewport = true;
    const snap = screenToTile(e.clientX, e.clientY);
    if (!snap)
        return;
    cursorCol = snap.col;
    cursorRow = snap.row;
    updateGhostPosition(snap.col, snap.row);
    // Drag-paint / drag-erase
    if (isPointerDown) {
        if (mode === 'pencil' && (snap.col !== lastPaintCol || snap.row !== lastPaintRow)) {
            lastPaintCol = snap.col;
            lastPaintRow = snap.row;
            paintAt(snap.col, snap.row);
        }
        else if (mode === 'erase' && (snap.col !== lastPaintCol || snap.row !== lastPaintRow)) {
            lastPaintCol = snap.col;
            lastPaintRow = snap.row;
            removeTileAt(snap.col, snap.row, currentFloor);
        }
    }
    // Live line / rect previews
    if (mode === 'line' && lineStartPos) {
        setPreviewCells(bresenhamLine(lineStartPos.col, lineStartPos.row, snap.col, snap.row));
    }
    else if (mode === 'rect' && rectStartPos && isPointerDown) {
        setPreviewCells(fillRect(rectStartPos.col, rectStartPos.row, snap.col, snap.row));
    }
});
canvas3d.addEventListener('pointerleave', () => {
    cursorInViewport = false;
    ghostIndicator.visible = false;
    ghostTileGroup.visible = false;
    if (!isPointerDown)
        clearPreviewCells();
});
canvas3d.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || annotActive)
        return;
    const snap = screenToTile(e.clientX, e.clientY);
    if (!snap)
        return;
    isPointerDown = true;
    lastPaintCol = snap.col;
    lastPaintRow = snap.row;
    if (mode === 'pencil') {
        orbitControls.enabled = false;
        canvas3d.setPointerCapture(e.pointerId);
        paintAt(snap.col, snap.row);
    }
    else if (mode === 'erase') {
        orbitControls.enabled = false;
        canvas3d.setPointerCapture(e.pointerId);
        removeTileAt(snap.col, snap.row, currentFloor);
    }
    else if (mode === 'line') {
        if (!lineStartPos) {
            lineStartPos = snap;
            setStatus(`Line: start (${snap.col}, ${snap.row}) — click endpoint`);
        }
        else {
            const cells = bresenhamLine(lineStartPos.col, lineStartPos.row, snap.col, snap.row);
            setStatus(`Line: placing ${cells.length} tiles…`);
            placeMany(cells).then(() => setStatus(`Line placed (${cells.length} tiles)`)).catch(console.error);
            lineStartPos = null;
            clearPreviewCells();
        }
        isPointerDown = false;
    }
    else if (mode === 'rect') {
        if (!rectStartPos) {
            rectStartPos = snap;
            orbitControls.enabled = false;
            canvas3d.setPointerCapture(e.pointerId);
        }
    }
});
canvas3d.addEventListener('pointerup', (e) => {
    if (annotActive) {
        isPointerDown = false;
        return;
    }
    const wasDown = isPointerDown;
    isPointerDown = false;
    orbitControls.enabled = true;
    if (mode === 'rect' && rectStartPos && wasDown) {
        const snap = screenToTile(e.clientX, e.clientY);
        const start = rectStartPos;
        rectStartPos = null;
        clearPreviewCells();
        if (snap) {
            const cells = fillRect(start.col, start.row, snap.col, snap.row);
            setStatus(`Rect: placing ${cells.length} tiles…`);
            placeMany(cells).then(() => setStatus(`Rect filled (${cells.length} tiles)`)).catch(console.error);
        }
    }
});
canvas3d.addEventListener('pointercancel', () => {
    isPointerDown = false;
    rectStartPos = null;
    orbitControls.enabled = true;
    clearPreviewCells();
});
canvas3d.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const snap = screenToTile(e.clientX, e.clientY);
    if (snap)
        removeTileAt(snap.col, snap.row, currentFloor);
});
// ── Tool wiring ───────────────────────────────────────────────────────────────
function setMode(m) {
    mode = m;
    lineStartPos = null;
    rectStartPos = null;
    clearPreviewCells();
    document.getElementById('mode-pencil').classList.toggle('active', m === 'pencil');
    document.getElementById('mode-erase').classList.toggle('active', m === 'erase');
    document.getElementById('mode-line').classList.toggle('active', m === 'line');
    document.getElementById('mode-rect').classList.toggle('active', m === 'rect');
    updateHUD();
}
function setRotation(deg) {
    currentRotDeg = deg;
    document.querySelectorAll('[data-rot]').forEach(btn => btn.classList.toggle('active', btn.dataset['rot'] === String(deg)));
    ghostTileGroup.rotation.y = (deg * Math.PI) / 180;
    updateHUD();
}
function cycleRotation() {
    setRotation(((currentRotDeg + 90) % 360));
}
function setFloor(f) {
    currentFloor = Math.max(0, Math.min(f, 12));
    rayPlane.position.y = currentFloor * FLOOR_H;
    document.getElementById('floor-display').textContent = String(currentFloor);
    updateHUD();
}
function setOffset(x, z) {
    const clamp = (v) => Math.round(Math.max(-T, Math.min(T, v)) / OFFSET_STEP) * OFFSET_STEP;
    tileOffX = clamp(x);
    tileOffZ = clamp(z);
    const el = document.getElementById('offset-display');
    if (el)
        el.textContent = `X: ${tileOffX.toFixed(2)}  Z: ${tileOffZ.toFixed(2)}`;
    updateGhostPosition(cursorCol, cursorRow);
}
document.getElementById('mode-pencil').addEventListener('click', () => setMode('pencil'));
document.getElementById('mode-erase').addEventListener('click', () => setMode('erase'));
document.getElementById('mode-line').addEventListener('click', () => setMode('line'));
document.getElementById('mode-rect').addEventListener('click', () => setMode('rect'));
document.getElementById('floor-up').addEventListener('click', () => setFloor(currentFloor + 1));
document.getElementById('floor-down').addEventListener('click', () => setFloor(currentFloor - 1));
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('Clear all tiles?'))
        clearAll();
});
document.getElementById('off-x-minus').addEventListener('click', () => setOffset(tileOffX - OFFSET_STEP, tileOffZ));
document.getElementById('off-x-plus').addEventListener('click', () => setOffset(tileOffX + OFFSET_STEP, tileOffZ));
document.getElementById('off-z-minus').addEventListener('click', () => setOffset(tileOffX, tileOffZ - OFFSET_STEP));
document.getElementById('off-z-plus').addEventListener('click', () => setOffset(tileOffX, tileOffZ + OFFSET_STEP));
document.getElementById('off-reset').addEventListener('click', () => setOffset(0, 0));
document.querySelectorAll('[data-rot]').forEach(btn => btn.addEventListener('click', () => setRotation(parseInt(btn.dataset['rot'] ?? '0', 10))));
document.querySelectorAll('[data-cam]').forEach(btn => btn.addEventListener('click', () => setCameraPreset(btn.dataset['cam'])));
// ── Camera presets ────────────────────────────────────────────────────────────
function setCameraPreset(preset) {
    const d = 26;
    const pos = {
        iso: [d * 0.7, d * 0.65, d * 0.7],
        top: [0.01, d * 1.4, 0.01],
        front: [0, d * 0.5, d],
        side: [d, d * 0.5, 0],
    };
    camera.position.set(...pos[preset]);
    orbitControls.target.set(0, 0, 0);
    orbitControls.update();
}
// ── Keyboard shortcuts ────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA')
        return;
    if (annotActive)
        return;
    switch (e.code) {
        case 'KeyP':
            setMode('pencil');
            break;
        case 'KeyX':
            setMode('erase');
            break;
        case 'KeyL':
            setMode('line');
            break;
        case 'KeyB':
            setMode('rect');
            break;
        case 'KeyR':
            cycleRotation();
            break;
        case 'KeyQ':
            setFloor(currentFloor - 1);
            break;
        case 'KeyE':
            setFloor(currentFloor + 1);
            break;
        case 'Escape':
            // Cancel line / rect start
            if (lineStartPos || rectStartPos) {
                lineStartPos = null;
                rectStartPos = null;
                clearPreviewCells();
                setStatus('Cancelled');
            }
            break;
        case 'ArrowLeft':
            e.preventDefault();
            setOffset(tileOffX - OFFSET_STEP, tileOffZ);
            break;
        case 'ArrowRight':
            e.preventDefault();
            setOffset(tileOffX + OFFSET_STEP, tileOffZ);
            break;
        case 'ArrowUp':
            e.preventDefault();
            setOffset(tileOffX, tileOffZ - OFFSET_STEP);
            break;
        case 'ArrowDown':
            e.preventDefault();
            setOffset(tileOffX, tileOffZ + OFFSET_STEP);
            break;
        case 'Delete':
        case 'Backspace':
            if (cursorInViewport)
                removeTileAt(cursorCol, cursorRow, currentFloor);
            break;
        case 'KeyZ':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                undo();
            }
            break;
        case 'KeyA':
            toggleAnnotation();
            break;
    }
});
// ── Annotation overlay ────────────────────────────────────────────────────────
const annotCtx = annotCanvas.getContext('2d');
let annotActive = false;
let isDrawing = false;
let penColor = '#ff4444';
let penSize = 4;
let lastPX = 0, lastPY = 0;
const PEN_COLORS = ['#ff3333', '#ffcc00', '#44ff88', '#3399ff', '#ff44ff', '#ffffff'];
const PEN_SIZES = [2, 4, 8, 16];
function buildAnnotationUI() {
    const colsEl = document.getElementById('pen-colors');
    for (const c of PEN_COLORS) {
        const sw = document.createElement('div');
        sw.className = 'swatch' + (c === penColor ? ' active' : '');
        sw.style.background = c;
        sw.title = c;
        sw.addEventListener('click', () => {
            colsEl.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
            sw.classList.add('active');
            penColor = c;
        });
        colsEl.appendChild(sw);
    }
    const szEl = document.getElementById('pen-sizes');
    for (const sz of PEN_SIZES) {
        const btn = document.createElement('button');
        btn.className = 'size-btn' + (sz === penSize ? ' active' : '');
        btn.textContent = String(sz);
        btn.addEventListener('click', () => {
            szEl.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            penSize = sz;
        });
        szEl.appendChild(btn);
    }
}
function toggleAnnotation() {
    annotActive = !annotActive;
    annotCanvas.classList.toggle('active', annotActive);
    document.getElementById('annot-toggle').checked = annotActive;
    setStatus(annotActive ? 'Annotation mode — draw freely. A to toggle off.' : 'Annotation mode off');
}
document.getElementById('annot-toggle').addEventListener('change', (e) => {
    annotActive = e.target.checked;
    annotCanvas.classList.toggle('active', annotActive);
});
document.getElementById('btn-clear-annot').addEventListener('click', () => {
    annotCtx.clearRect(0, 0, annotCanvas.width, annotCanvas.height);
});
annotCanvas.addEventListener('pointerdown', (e) => {
    if (!annotActive)
        return;
    isDrawing = true;
    lastPX = e.clientX;
    lastPY = e.clientY;
    annotCanvas.setPointerCapture(e.pointerId);
});
annotCanvas.addEventListener('pointermove', (e) => {
    if (!isDrawing || !annotActive)
        return;
    annotCtx.beginPath();
    annotCtx.strokeStyle = penColor;
    annotCtx.lineWidth = penSize * Math.max(e.pressure, 0.5);
    annotCtx.lineCap = 'round';
    annotCtx.lineJoin = 'round';
    annotCtx.moveTo(lastPX, lastPY);
    annotCtx.lineTo(e.clientX, e.clientY);
    annotCtx.stroke();
    lastPX = e.clientX;
    lastPY = e.clientY;
});
annotCanvas.addEventListener('pointerup', () => { isDrawing = false; });
annotCanvas.addEventListener('pointercancel', () => { isDrawing = false; });
// ── HUD + status ──────────────────────────────────────────────────────────────
function updateHUD() {
    const modeLabel = {
        pencil: 'Paint', erase: 'Erase', line: 'Line', rect: 'Rect',
    };
    document.getElementById('hud-mode').textContent = modeLabel[mode];
    let name = '— none —';
    if (selectedPath)
        name = selectedPath.split('/').pop();
    if (selectedCodeItem)
        name = selectedCodeItem.replace('building:', '').replace('nature:', '').replace('_', ' ');
    document.getElementById('hud-tile').textContent = name;
    document.getElementById('hud-floor').textContent = `Floor ${currentFloor}`;
    document.getElementById('hud-rot').textContent = `${currentRotDeg}°`;
}
function setStatus(msg) {
    document.getElementById('status-bar').textContent = msg;
}
function captureThumb() {
    renderer.render(scene, camera);
    try {
        return canvas3d.toDataURL('image/jpeg', 0.55);
    }
    catch {
        return '';
    }
}
// ── Creation Store (localStorage persistence) ─────────────────────────────────
const STORE_KEY = 'ttt-sandbox-creations';
class CreationStore {
    items = [];
    constructor() { this._load(); }
    _load() {
        try {
            this.items = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]');
        }
        catch {
            this.items = [];
        }
    }
    _persist() { localStorage.setItem(STORE_KEY, JSON.stringify(this.items)); }
    getAll() { return this.items; }
    get(id) { return this.items.find(c => c.id === id); }
    save(name, folder, tiles, thumbnail) {
        const now = Date.now();
        const c = {
            id: `c-${now}-${Math.random().toString(36).slice(2, 6)}`,
            name, folder: folder.replace(/^\/+|\/+$/g, ''),
            tiles, thumbnail, createdAt: now, updatedAt: now,
        };
        this.items.push(c);
        this._persist();
        return c;
    }
    update(id, patch) {
        const c = this.items.find(c => c.id === id);
        if (!c)
            return false;
        Object.assign(c, patch, { updatedAt: Date.now() });
        this._persist();
        return true;
    }
    delete(id) {
        const i = this.items.findIndex(c => c.id === id);
        if (i === -1)
            return false;
        this.items.splice(i, 1);
        this._persist();
        return true;
    }
    buildTree() {
        const root = { name: '', path: '', children: new Map(), items: [] };
        for (const c of this.items) {
            if (!c.folder) {
                root.items.push(c);
                continue;
            }
            const parts = c.folder.split('/').filter(Boolean);
            let node = root;
            let sofar = '';
            for (const p of parts) {
                sofar = sofar ? `${sofar}/${p}` : p;
                if (!node.children.has(p))
                    node.children.set(p, { name: p, path: sofar, children: new Map(), items: [] });
                node = node.children.get(p);
            }
            node.items.push(c);
        }
        return root;
    }
}
// ── Creations Panel ────────────────────────────────────────────────────────────
class CreationsPanel {
    store;
    container;
    openFolders = new Set();
    onLoad;
    onEdit;
    constructor(store, el, onLoad, onEdit) {
        this.store = store;
        this.container = el;
        this.onLoad = onLoad;
        this.onEdit = onEdit;
        this.refresh();
    }
    refresh() {
        this.container.innerHTML = '';
        if (this.store.getAll().length === 0) {
            const msg = document.createElement('div');
            msg.className = 'creat-empty';
            msg.textContent = 'No creations yet.\nBuild something then click\n💾 Save Creation.';
            this.container.appendChild(msg);
            return;
        }
        this._renderNode(this.store.buildTree(), this.container, 0);
    }
    _count(n) {
        return n.items.length + [...n.children.values()].reduce((s, c) => s + this._count(c), 0);
    }
    _renderNode(node, parent, depth) {
        for (const [, child] of node.children) {
            const open = this.openFolders.has(child.path);
            const fEl = document.createElement('div');
            fEl.className = 'creat-folder';
            fEl.style.paddingLeft = `${8 + depth * 14}px`;
            fEl.innerHTML =
                `<span class="cf-arrow" style="transform:rotate(${open ? 90 : 0}deg)">▶</span>` +
                    `<span>📁 ${child.name}</span>` +
                    `<span class="cf-count">${this._count(child)}</span>`;
            fEl.addEventListener('click', () => {
                open ? this.openFolders.delete(child.path) : this.openFolders.add(child.path);
                this.refresh();
            });
            parent.appendChild(fEl);
            if (open)
                this._renderNode(child, parent, depth + 1);
        }
        for (const c of node.items) {
            const el = document.createElement('div');
            el.className = 'creat-item';
            el.style.paddingLeft = `${10 + depth * 14}px`;
            el.dataset['id'] = c.id;
            el.innerHTML =
                (c.thumbnail
                    ? `<img class="ci-thumb" src="${c.thumbnail}" alt=""/>`
                    : `<div class="ci-thumb ci-no-thumb"></div>`) +
                    `<span class="ci-name">${c.name}</span>` +
                    `<span class="ci-actions">` +
                    `<button class="ci-btn ci-edit" title="Rename / move">✏️</button>` +
                    `<button class="ci-btn ci-del"  title="Delete">🗑</button>` +
                    `</span>`;
            el.addEventListener('click', (e) => {
                if (e.target.closest('.ci-actions'))
                    return;
                this.onLoad(c);
            });
            el.querySelector('.ci-edit').addEventListener('click', (e) => {
                e.stopPropagation();
                this.onEdit(c);
            });
            el.querySelector('.ci-del').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Delete "${c.name}"?`)) {
                    this.store.delete(c.id);
                    this.refresh();
                    setStatus(`Deleted "${c.name}"`);
                }
            });
            parent.appendChild(el);
        }
    }
}
// ── Sandbox API (Playwright + user scripts) ───────────────────────────────────
window.__sandbox = {
    ready: false,
    /** Place a single GLB tile at grid position. rotY in radians. */
    async placeTile(path, col, row, floor = 0, rotY = 0) {
        await placeTileAt(path, col, row, floor, rotY);
    },
    /** Remove topmost tile at grid position. */
    removeTile(col, row, floor = 0) {
        removeTileAt(col, row, floor);
    },
    /** Remove all placed tiles and presets. */
    clearAll() {
        clearAll();
    },
    /** Assemble a named building type at grid position (col, row). */
    async assembleBuilding(type, seed = 1, col = 0, row = 0) {
        await _placeBuilding(type, seed, col, row);
    },
    /** Move camera to an arbitrary world position. */
    setCamera(x, y, z, lx = 0, ly = 0, lz = 0) {
        camera.position.set(x, y, z);
        orbitControls.target.set(lx, ly, lz);
        orbitControls.update();
    },
    /** Snap camera to a named viewpoint. */
    setCameraPreset(preset) {
        setCameraPreset(preset);
    },
    /** Return a data URL of the current 3D canvas frame (for screenshot comparison). */
    canvasDataURL() {
        renderer.render(scene, camera);
        return canvas3d.toDataURL();
    },
    /** List all currently placed tiles as plain objects. */
    getTiles() {
        return placedTiles.map(t => ({
            path: t.path, col: t.col, row: t.row, floor: t.floor, rotY: t.rotY,
        }));
    },
    /** Programmatically select a tile from the palette by GLB path. */
    selectTile(path) {
        selectedPath = path;
        ghostLoadedPath = null;
        updateHUD();
        refreshGhostModel().catch(console.error);
        // Highlight matching button in palette
        document.querySelectorAll('.tile-btn').forEach(btn => {
            const isMatch = btn.dataset['path'] === path;
            btn.classList.toggle('selected', isMatch);
            if (isMatch)
                selectedBtn = btn;
        });
    },
};
// ── Render loop ───────────────────────────────────────────────────────────────
renderer.setAnimationLoop(() => {
    orbitControls.update();
    renderer.render(scene, camera);
});
// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    buildAnnotationUI();
    // First resize call to establish correct dimensions
    resize();
    // ── Asset Mode panel (reads same localStorage key as game Settings) ─────────
    const codeModeBtn = document.getElementById('sb-code-btn');
    const assetModeBtn = document.getElementById('sb-asset-btn');
    const packsWrap = document.getElementById('sb-packs-wrap');
    // Build pack toggle labels from KENNEY_PACKS definition
    for (const p of KENNEY_PACKS) {
        const lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;color:#8899aa;cursor:pointer';
        lbl.title = p.desc;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = p.id;
        cb.style.cursor = 'pointer';
        const txt = document.createElement('span');
        txt.textContent = `${p.icon} ${p.name}${p.recommended ? ' ★' : ''}`;
        lbl.append(cb, txt);
        packsWrap.appendChild(lbl);
    }
    /** Sync palette collapse state + button highlights from saved config. */
    function applyAssetModeToUI() {
        const cfg = loadWorldGenConfig();
        const isKenney = cfg.assetMode === 'kenney';
        codeModeBtn.classList.toggle('active', !isKenney);
        assetModeBtn.classList.toggle('active', isKenney);
        // Show/hide the correct palette container + search box
        const glbScroll = document.getElementById('palette-scroll');
        const codeScroll = document.getElementById('code-palette-scroll');
        const searchInput = document.getElementById('tile-search');
        glbScroll.style.display = isKenney ? '' : 'none';
        codeScroll.style.display = isKenney ? 'none' : '';
        searchInput.style.display = isKenney ? '' : 'none';
        // If switching to code mode, clear any GLB selection
        if (!isKenney) {
            selectedPath = null;
            selectedBtn?.classList.remove('selected');
            selectedBtn = null;
        }
        // If switching to kenney mode, clear code item selection
        if (isKenney) {
            selectedCodeItem = null;
            selectedCodeBtn?.classList.remove('selected');
            selectedCodeBtn = null;
            while (ghostTileGroup.children.length > 0)
                ghostTileGroup.remove(ghostTileGroup.children[0]);
            ghostLoadedPath = null;
        }
        // Sync pack checkboxes
        packsWrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
            cb.checked = cfg.assetPacks.includes(cb.value);
        });
        // Collapse packs not in the active selection (Kenney mode only)
        collapsedPacks.clear();
        if (isKenney) {
            for (const pack of Object.keys(ASSET_PACKS)) {
                if (!cfg.assetPacks.includes(pack))
                    collapsedPacks.add(pack);
            }
            buildPaletteUI();
        }
        else {
            buildCodePaletteUI();
        }
        updateHUD();
        setStatus(isKenney
            ? `Ready — Kenney asset mode — active packs: ${cfg.assetPacks.join(', ')}  •  P=paint  X=erase  L=line  B=rect  R=rotate  Q/E=floor  ↑↓←→=offset  A=annot  Ctrl+Z=undo`
            : `Ready — Code-first mode (procedural geometry)  •  P=paint  X=erase  L=line  B=rect  R=rotate  Q/E=floor  ↑↓←→=offset  A=annot  Ctrl+Z=undo`);
    }
    codeModeBtn.addEventListener('click', () => {
        const cfg = loadWorldGenConfig();
        cfg.assetMode = 'code';
        saveWorldGenConfig(cfg);
        applyAssetModeToUI();
    });
    assetModeBtn.addEventListener('click', () => {
        const cfg = loadWorldGenConfig();
        cfg.assetMode = 'kenney';
        saveWorldGenConfig(cfg);
        applyAssetModeToUI();
    });
    packsWrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
            const cfg = loadWorldGenConfig();
            cfg.assetPacks = [...packsWrap.querySelectorAll('input:checked')]
                .map(c => c.value);
            saveWorldGenConfig(cfg);
            applyAssetModeToUI();
        });
    });
    // Apply on init (reads current saved state)
    applyAssetModeToUI();
    // ── Tab switching ─────────────────────────────────────────────────────────
    function setActiveTab(tab) {
        const tilesEl = document.getElementById('palette-scroll');
        const creatEl = document.getElementById('creation-scroll');
        const searchEl = document.getElementById('tile-search');
        tilesEl.style.display = tab === 'tiles' ? '' : 'none';
        creatEl.style.display = tab === 'creations' ? '' : 'none';
        searchEl.style.display = tab === 'tiles' ? '' : 'none';
        document.getElementById('tab-tiles').classList.toggle('active', tab === 'tiles');
        document.getElementById('tab-creations').classList.toggle('active', tab === 'creations');
    }
    document.getElementById('tab-tiles').addEventListener('click', () => setActiveTab('tiles'));
    document.getElementById('tab-creations').addEventListener('click', () => setActiveTab('creations'));
    // Search filter
    document.getElementById('tile-search').addEventListener('input', (e) => {
        filterPalette(e.target.value);
    });
    // ── Creation store + panel ────────────────────────────────────────────────
    const creationStore = new CreationStore();
    let saveEditId = null;
    function openSaveModal(existing) {
        saveEditId = existing?.id ?? null;
        document.getElementById('sm-name').value = existing?.name ?? '';
        document.getElementById('sm-folder').value = existing?.folder ?? '';
        document.getElementById('sm-title').textContent = existing ? 'Edit Creation' : 'Save Creation';
        document.getElementById('sm-save-btn').textContent = existing ? 'Update' : 'Save';
        const thumb = existing?.thumbnail ?? captureThumb();
        const count = existing?.tiles.length ?? placedTiles.length;
        document.getElementById('sm-thumb').innerHTML =
            thumb ? `<img src="${thumb}" style="max-width:110px;max-height:72px;border-radius:4px;"/>` : '';
        document.getElementById('sm-count').textContent =
            `${count} tile${count !== 1 ? 's' : ''}`;
        document.getElementById('save-modal').classList.remove('hidden');
        setTimeout(() => document.getElementById('sm-name').focus(), 40);
    }
    function closeSaveModal() {
        document.getElementById('save-modal').classList.add('hidden');
        saveEditId = null;
    }
    const creationPanel = new CreationsPanel(creationStore, document.getElementById('creation-scroll'), 
    // onLoad — clear scene and restore all tiles
    async (creation) => {
        if (!confirm(`Load "${creation.name}"?\nThis will clear the current scene.`))
            return;
        clearAll();
        setStatus(`Loading "${creation.name}"…`);
        for (const t of creation.tiles)
            await placeTileAt(t.path, t.col, t.row, t.floor, t.rotY, t.offX ?? 0, t.offZ ?? 0);
        setStatus(`Loaded: ${creation.name} (${creation.tiles.length} tiles)`);
        setActiveTab('tiles');
    }, 
    // onEdit — open modal pre-filled
    (creation) => openSaveModal(creation));
    // Modal confirm
    document.getElementById('sm-save-btn').addEventListener('click', () => {
        const name = document.getElementById('sm-name').value.trim();
        const folder = document.getElementById('sm-folder').value.trim();
        if (!name) {
            document.getElementById('sm-name').focus();
            return;
        }
        if (saveEditId) {
            creationStore.update(saveEditId, { name, folder });
            setStatus(`Updated: "${name}"`);
        }
        else {
            const tiles = placedTiles.map(t => ({
                path: t.path, col: t.col, row: t.row, floor: t.floor, rotY: t.rotY,
                offX: t.offX, offZ: t.offZ,
            }));
            creationStore.save(name, folder, tiles, captureThumb());
            setStatus(`Saved "${name}"${folder ? ` → ${folder}` : ''}`);
        }
        creationPanel.refresh();
        closeSaveModal();
    });
    document.getElementById('sm-cancel-btn').addEventListener('click', closeSaveModal);
    document.getElementById('save-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('save-modal'))
            closeSaveModal();
    });
    [document.getElementById('sm-name'), document.getElementById('sm-folder')].forEach(inp => inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter')
            document.getElementById('sm-save-btn').click();
        if (e.key === 'Escape')
            closeSaveModal();
    }));
    document.getElementById('btn-save-creation').addEventListener('click', () => {
        if (placedTiles.length === 0) {
            setStatus('Nothing to save — place some tiles first!');
            return;
        }
        openSaveModal();
    });
    // ── Pre-warm common assets ────────────────────────────────────────────────
    loader.preload([
        '/assets/buildings/wall.glb',
        '/assets/buildings/floor.glb',
        '/assets/buildings/roof.glb',
    ]).catch(() => { });
    updateHUD();
    // Status is set by applyAssetModeToUI() above
    // Extend __sandbox with creation management
    Object.assign(window.__sandbox, {
        saveCreation(name, folder = '') {
            if (placedTiles.length === 0)
                return null;
            const tiles = placedTiles.map(t => ({
                path: t.path, col: t.col, row: t.row, floor: t.floor, rotY: t.rotY,
                offX: t.offX, offZ: t.offZ,
            }));
            const c = creationStore.save(name, folder, tiles, captureThumb());
            creationPanel.refresh();
            return c.id;
        },
        async loadCreation(id) {
            const c = creationStore.get(id);
            if (!c)
                return false;
            clearAll();
            for (const t of c.tiles)
                await placeTileAt(t.path, t.col, t.row, t.floor, t.rotY, t.offX ?? 0, t.offZ ?? 0);
            return true;
        },
        listCreations() { return [...creationStore.getAll()]; },
        deleteCreation(id) {
            const ok = creationStore.delete(id);
            if (ok)
                creationPanel.refresh();
            return ok;
        },
    });
    // ── Slime IM Lab ──────────────────────────────────────────────────────────
    //  Lets you spawn N slimes using the same InstancedMesh pipeline as the game,
    //  so you can visually verify rendering before running the full game.
    // ──────────────────────────────────────────────────────────────────────────
    let _slimeIM = null;
    const _slimeDummy = new THREE.Object3D();
    const _slimeColor = new THREE.Color();
    function _refreshSlimeStats(count) {
        const el = document.getElementById('slime-stats');
        if (!el)
            return;
        if (!_slimeIM || count === 0) {
            el.textContent = 'No slimes spawned.';
            return;
        }
        const fc = _slimeIM.frustumCulled;
        el.innerHTML = [
            `Instances: <b>${count}</b>`,
            `Draw calls: <b>1</b> (InstancedMesh)`,
            `frustumCulled: <b style="color:${fc ? '#f66' : '#4f4'}">${fc}</b>`,
        ].join('<br>');
    }
    function _spawnSlimesInSandbox(count) {
        if (_slimeIM) {
            scene.remove(_slimeIM);
            _slimeIM = null;
        }
        if (count <= 0) {
            _refreshSlimeStats(0);
            return;
        }
        _slimeIM = createSlimeBodyIM(count);
        // Spiral layout so they're all visible from the iso camera
        const COLORS = [0x44bb55, 0xffdd44, 0x9955ff]; // hostile / flee / recruit
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const radius = 4 + (i % 5) * 1.6;
            _slimeDummy.position.set(Math.cos(angle) * radius, 0.9, Math.sin(angle) * radius);
            _slimeDummy.scale.set(1, 0.55, 1); // flattened sphere, matches REST_SCALE_Y
            _slimeDummy.rotation.y = -angle;
            _slimeDummy.updateMatrix();
            _slimeIM.setMatrixAt(i, _slimeDummy.matrix);
            _slimeColor.setHex(COLORS[i % 3]);
            _slimeIM.setColorAt(i, _slimeColor);
        }
        _slimeIM.instanceMatrix.needsUpdate = true;
        if (_slimeIM.instanceColor)
            _slimeIM.instanceColor.needsUpdate = true;
        scene.add(_slimeIM);
        setCameraPreset('iso');
        _refreshSlimeStats(count);
        setStatus(`Slime IM Lab: ${count} instance${count === 1 ? '' : 's'}, 1 draw call`);
    }
    document.getElementById('btn-spawn-slimes').addEventListener('click', () => {
        const n = parseInt(document.getElementById('slime-count').value, 10);
        _spawnSlimesInSandbox(isNaN(n) ? 20 : Math.max(1, Math.min(128, n)));
    });
    document.getElementById('btn-clear-slimes').addEventListener('click', () => _spawnSlimesInSandbox(0));
    // Expose under __sandbox.slime.* for Playwright tests
    window.__sandbox.slime = {
        /** Spawn `count` fake slimes via InstancedMesh. */
        spawn(count = 20) { _spawnSlimesInSandbox(count); },
        /** Remove all slimes from the scene. */
        clear() { _spawnSlimesInSandbox(0); },
        /**
         * Returns stats about the active slime InstancedMesh.
         * Playwright tests assert frustumCulled===false and drawCalls===1.
         */
        getStats() {
            if (!_slimeIM)
                return { count: 0, frustumCulled: null, drawCalls: 0 };
            return {
                count: _slimeIM.count,
                frustumCulled: _slimeIM.frustumCulled,
                drawCalls: 1,
            };
        },
    };
    window.__sandbox.ready = true;
}
init().catch(console.error);
