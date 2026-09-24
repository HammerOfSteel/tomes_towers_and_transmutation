/**
 * scale-lab.ts — Standalone empirical scale-calibration tool (dev-only)
 *
 * Built in response to the user's explicit request during Sub-task 2
 * (Settlement Buildings): rather than guessing a scaling formula per asset
 * category, stand a real reference character (normalised to the game's
 * canonical `TARGET_HEIGHT = 2.0` — the same constant used by
 * `EnemyLoader.ts`, `QuatEnemyAdapter.ts` and `AmbientWildlife.ts`) next to
 * a metered ruler and a door-height marker, load any imported Quaternius
 * asset alongside it, and read exact measured dimensions back — both
 * visually (screenshot) and programmatically (`window.__scaleLab`, so
 * Playwright/tests can drive it without a human eyeballing anything).
 *
 * This is deliberately reusable for *any* future asset category (buildings,
 * nature props, monsters, animals) — the model list is the full
 * `QUAT_MODELS` manifest, not just buildings.
 *
 * Entry: scale-lab.html. Optional `?model=<id>` query param preloads a
 * specific asset (e.g. `scale-lab.html?model=medieval_village_pack/buildings/Inn`).
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { QUAT_PACKS, QUAT_MODELS, type QuatCategory, type QuatModelDef } from '@/assets/quaterniusManifest';
import { loadQuatAsset, type LoadedQuatAsset } from '@/assets/QuaterniusAssetLoader';
import { CHAR_MODELS, type CharModelDef } from '@/characters/charManifest';
import { loadCharModel, getCharModelBounds } from '@/characters/CharacterLoader';

/** The game's one canonical character/enemy height — see EnemyLoader.ts, QuatEnemyAdapter.ts, AmbientWildlife.ts. */
const TARGET_HEIGHT = 2.0;
/** Typical human door top, used as a second visual/measurement reference. */
const DOOR_HEIGHT = 2.1;
/** Reference character used to stand in for the player — one of the game's actual playable wizard models. */
const REFERENCE_CHAR_ID = 'wizards/elf';

const RULER_X = -5;
const CHAR_X  = -2;
const ASSET_X = 2;

// ── DOM scaffold ───────────────────────────────────────────────────────────────

const root = document.getElementById('sl-root')!;
root.innerHTML = `
<style>
  #sl-root { position: fixed; inset: 0; display: flex; flex-direction: column; color: #e8e6f0; }
  #sl-topbar {
    height: 46px; flex: none; display: flex; align-items: center; gap: 14px;
    padding: 0 16px; background: #1c1c28; border-bottom: 1px solid #2e2e40;
  }
  #sl-topbar h1 { font-size: .95rem; font-weight: 600; color: #ffd080; }
  #sl-topbar .sl-count { font-size: .72rem; color: #8884a0; }
  #sl-search {
    flex: none; width: 220px; background: #14141e; border: 1px solid #3a3a50;
    color: #e8e6f0; border-radius: 5px; padding: 5px 9px; font-size: .78rem; margin-left: auto;
  }
  #sl-body { flex: 1; display: flex; min-height: 0; }
  #sl-sidebar {
    width: 300px; flex: none; overflow-y: auto; background: #191922;
    border-right: 1px solid #2e2e40; padding: 8px;
  }
  .sl-cat { margin-bottom: 4px; }
  .sl-cat > summary {
    cursor: pointer; padding: 7px 8px; border-radius: 5px; font-size: .82rem;
    font-weight: 600; color: #ffe8c0; list-style: none; user-select: none;
  }
  .sl-cat > summary::-webkit-details-marker { display: none; }
  .sl-cat > summary:hover { background: #24243230; }
  .sl-cat[open] > summary { background: #2a2038; }
  .sl-item {
    display: block; width: calc(100% - 12px); margin: 1px 0 1px 12px; padding: 4px 8px;
    background: none; border: none; color: #b8b4d0; font-size: .71rem; text-align: left;
    border-radius: 4px; cursor: pointer;
  }
  .sl-item:hover { background: #262638; color: #fff; }
  .sl-item.sl-item--active { background: #b8802f; color: #fff; }
  #sl-viewport { flex: 1; position: relative; background: #2a3038; }
  #sl-panel {
    position: absolute; right: 12px; top: 12px; width: 280px;
    background: rgba(20,20,28,.92); border: 1px solid #3a3a50; border-radius: 8px;
    padding: 12px; font-size: .74rem; color: #d8d4ec;
  }
  #sl-panel h2 { font-size: .8rem; color: #ffd080; margin-bottom: 8px; }
  #sl-panel label { display: block; margin: 8px 0 3px; color: #a8a4c0; }
  #sl-panel input[type="number"] {
    width: 100%; background: #14141e; border: 1px solid #3a3a50; color: #e8e6f0;
    border-radius: 4px; padding: 4px 6px; font-size: .76rem;
  }
  #sl-panel button {
    margin-top: 8px; width: 100%; background: #4a3f2f; border: 1px solid #8a6f3f;
    color: #ffe8c0; border-radius: 5px; padding: 6px; font-size: .74rem; cursor: pointer;
  }
  #sl-panel button:hover { background: #5a4d3a; }
  #sl-measurements { margin-top: 10px; border-top: 1px solid #3a3a50; padding-top: 8px; }
  #sl-measurements div { display: flex; justify-content: space-between; padding: 1px 0; }
  #sl-measurements span:last-child { color: #fff; font-family: monospace; }
  #sl-loading {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
    background: rgba(20,20,28,.85); color: #d8d0ec; font-size: .78rem;
    padding: 6px 14px; border-radius: 6px; display: none;
  }
  #sl-empty {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    color: #7a8290; font-size: .9rem; pointer-events: none;
  }
</style>
<div id="sl-topbar">
  <h1>📏 Scale Lab</h1>
  <span class="sl-count">${QUAT_MODELS.length} models — measure any asset against a ${TARGET_HEIGHT}m reference character</span>
  <input id="sl-search" type="text" placeholder="Search assets…" />
</div>
<div id="sl-body">
  <div id="sl-sidebar"></div>
  <div id="sl-viewport">
    <div id="sl-empty">Select an asset to load it next to the reference character and ruler.</div>
    <div id="sl-loading">Loading…</div>
    <div id="sl-panel">
      <h2 id="sl-panel-title">No asset loaded</h2>
      <label for="sl-scale-input">Scale multiplier (×)</label>
      <input id="sl-scale-input" type="number" step="0.05" value="1" />
      <label for="sl-target-input">Auto-fit to height (m)</label>
      <input id="sl-target-input" type="number" step="0.1" value="4" />
      <button id="sl-autofit-btn">Auto-fit height</button>
      <button id="sl-reset-btn">Reset to native scale (×1)</button>
      <div id="sl-measurements"></div>
    </div>
  </div>
</div>
`;

const sidebarEl    = document.getElementById('sl-sidebar')!;
const searchEl     = document.getElementById('sl-search') as HTMLInputElement;
const emptyEl      = document.getElementById('sl-empty')!;
const loadingEl    = document.getElementById('sl-loading')!;
const panelTitleEl = document.getElementById('sl-panel-title')!;
const scaleInputEl = document.getElementById('sl-scale-input') as HTMLInputElement;
const targetInputEl= document.getElementById('sl-target-input') as HTMLInputElement;
const autofitBtnEl = document.getElementById('sl-autofit-btn') as HTMLButtonElement;
const resetBtnEl   = document.getElementById('sl-reset-btn') as HTMLButtonElement;
const measureEl    = document.getElementById('sl-measurements')!;
const viewportEl   = document.getElementById('sl-viewport')!;

// ── Sidebar (flat, category-grouped, searchable list of every model) ─────────

const CATEGORY_LABEL: Record<QuatCategory, string> = {
  animals:                 '🐾 Animals',
  monsters:                '👹 Monsters',
  fantasy_props:           '🏺 Fantasy Props',
  medieval_village_pack:   '🏠 Medieval Village',
  modular_dungeons:        '🗝️ Modular Dungeon Kit',
  modular_fantasy_village: '🏘️ Modular Fantasy Village Kit',
  modern_type_buildings:   '🏙️ Modern Buildings & Interiors',
  nature_props:            '🌳 Nature Props',
};

let activeItemEl: HTMLElement | null = null;

function renderSidebar(filter: string): void {
  sidebarEl.innerHTML = '';
  const q = filter.trim().toLowerCase();
  for (const packDef of QUAT_PACKS) {
    const models = QUAT_MODELS
      .filter(m => m.packId === packDef.id)
      .filter(m => !q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (models.length === 0) continue;
    const details = document.createElement('details');
    details.className = 'sl-cat';
    if (q) details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = `${CATEGORY_LABEL[packDef.category]} / ${packDef.name} (${models.length})`;
    details.appendChild(summary);
    for (const model of models) {
      const btn = document.createElement('button');
      btn.className = 'sl-item';
      btn.textContent = model.name;
      btn.dataset['modelId'] = model.id;
      btn.onclick = () => {
        activeItemEl?.classList.remove('sl-item--active');
        btn.classList.add('sl-item--active');
        activeItemEl = btn;
        void loadAsset(model);
      };
      details.appendChild(btn);
    }
    sidebarEl.appendChild(details);
  }
}
searchEl.addEventListener('input', () => renderSidebar(searchEl.value));
renderSidebar('');

// ── THREE scene ────────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.outputColorSpace  = THREE.SRGBColorSpace;
viewportEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a4048);

const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
camera.position.set(0, 4, 12);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1.5, 0);

const hemi = new THREE.HemisphereLight(0xffffff, 0x707880, 1.1);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.position.set(6, 10, 6);
key.castShadow = true;
key.shadow.mapSize.setScalar(2048);
key.shadow.camera.near = 0.1;
key.shadow.camera.far  = 40;
key.shadow.camera.left = key.shadow.camera.bottom = -15;
key.shadow.camera.right = key.shadow.camera.top   = 15;
scene.add(key);
scene.add(new THREE.DirectionalLight(0xdce8ff, 0.5).translateX(-6).translateY(4));

// ── Ground: 1-unit grid so scale is legible at a glance ───────────────────────

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x484f58, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(60, 60, 0xffe0a0, 0x606870);
scene.add(grid);

// ── Text-sprite label helper (billboarded canvas texture) ─────────────────────

function makeLabelSprite(text: string, color = '#ffe8c0'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 4, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.0, 0.25, 1);
  return sprite;
}

// ── Metered ruler pole: 1m alternating bands + numeric labels up to 15m ──────

const RULER_MAX_M = 15;
const rulerGroup = new THREE.Group();
rulerGroup.position.set(RULER_X, 0, 0);
for (let m = 0; m < RULER_MAX_M; m++) {
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 1, 12),
    new THREE.MeshStandardMaterial({ color: m % 2 === 0 ? 0xffffff : 0x222222 }),
  );
  band.position.y = m + 0.5;
  band.castShadow = true;
  rulerGroup.add(band);
  if (m > 0 && m % 1 === 0) {
    const label = makeLabelSprite(`${m}m`);
    label.position.set(0.35, m, 0);
    rulerGroup.add(label);
  }
}
scene.add(rulerGroup);

// ── Door-height marker: a thin translucent bar spanning the whole scene ──────

const doorMarker = new THREE.Mesh(
  new THREE.BoxGeometry(16, 0.03, 0.03),
  new THREE.MeshBasicMaterial({ color: 0x50c0ff, transparent: true, opacity: 0.85 }),
);
doorMarker.position.set(-1, DOOR_HEIGHT, 0);
scene.add(doorMarker);
const doorLabel = makeLabelSprite(`door ≈ ${DOOR_HEIGHT}m`, '#50c0ff');
doorLabel.position.set(RULER_X + 1.2, DOOR_HEIGHT + 0.2, 0);
scene.add(doorLabel);

// ── Reference character, normalised to TARGET_HEIGHT (matches EnemyLoader/QuatEnemyAdapter) ──

let referenceLoaded = false;
function addReferenceCharLabel(): void {
  const label = makeLabelSprite(`character = ${TARGET_HEIGHT}m`, '#a0ffb0');
  label.position.set(CHAR_X - 0.6, TARGET_HEIGHT + 0.3, 0);
  scene.add(label);
}

async function loadReferenceCharacter(): Promise<void> {
  const def: CharModelDef | undefined = CHAR_MODELS.find(m => m.id === REFERENCE_CHAR_ID);
  if (!def) { console.warn('[scale-lab] reference character not found in CHAR_MODELS:', REFERENCE_CHAR_ID); return; }
  const loaded = await loadCharModel(def);
  // Bounds must come from the original (non-cloned) scene with world matrices
  // updated — cloned scenes' skinned-mesh bind pose can report near-zero
  // bounds if bone offsets encode the real scale (see CharacterLoader.ts).
  const box = await getCharModelBounds(def);
  const rawH = Math.max(box.max.y - box.min.y, 0.01);
  loaded.scene.scale.setScalar(TARGET_HEIGHT / rawH);
  const centredBox = new THREE.Box3().setFromObject(loaded.scene);
  loaded.scene.position.set(CHAR_X, -centredBox.min.y, 0);
  loaded.scene.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  scene.add(loaded.scene);
  if (loaded.mixer && loaded.clips.length > 0) {
    const idle = loaded.clips.find(c => /idle/i.test(c.name)) ?? loaded.clips[0];
    loaded.mixer.clipAction(idle).play();
  }
  charMixer = loaded.mixer;
  referenceLoaded = true;
  addReferenceCharLabel();
  frameAll();
}
let charMixer: THREE.AnimationMixer | null = null;

// ── Asset slot ─────────────────────────────────────────────────────────────────

let currentObject: THREE.Object3D | null = null;
let currentMixer: THREE.AnimationMixer | null = null;
let currentDef: QuatModelDef | null = null;
/** The raw (unscaled, as-loaded) bounding box size — measured once per load, before any scale is applied. */
let rawSize = new THREE.Vector3(0, 0, 0);
let loadToken = 0;

function applyScale(scale: number): void {
  if (!currentObject) return;
  currentObject.scale.setScalar(scale);
  const box = new THREE.Box3().setFromObject(currentObject);
  currentObject.position.set(ASSET_X, -box.min.y, 0);
  updateMeasurements(scale);
  frameAll();
}

/** Frame the camera so the ruler, reference character, and the currently
 *  loaded asset are all visible at once — recomputed after every load/scale
 *  change so the composition never requires manual re-framing. */
function frameAll(): void {
  const box = new THREE.Box3();
  box.expandByPoint(new THREE.Vector3(RULER_X - 0.5, 0, 0));
  box.expandByPoint(new THREE.Vector3(RULER_X - 0.5, RULER_MAX_M, 0));
  box.expandByPoint(new THREE.Vector3(CHAR_X, TARGET_HEIGHT, 0));
  if (currentObject) {
    const assetBox = new THREE.Box3().setFromObject(currentObject);
    box.union(assetBox);
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, 0.01);
  const dist = maxDim * 1.15 / Math.tan((camera.fov * Math.PI / 180) / 2);
  camera.position.set(center.x, center.y * 0.85, center.z + dist);
  controls.target.set(center.x, center.y * 0.6, center.z);
  controls.update();
}

function updateMeasurements(scale: number): void {
  const w = rawSize.x * scale, h = rawSize.y * scale, d = rawSize.z * scale;
  measureEl.innerHTML = `
    <div><span>Raw (×1)</span><span>${rawSize.x.toFixed(2)} × ${rawSize.y.toFixed(2)} × ${rawSize.z.toFixed(2)}</span></div>
    <div><span>Applied scale</span><span>×${scale.toFixed(3)}</span></div>
    <div><span>Final W×H×D (m)</span><span>${w.toFixed(2)} × ${h.toFixed(2)} × ${d.toFixed(2)}</span></div>
    <div><span>Height ÷ character</span><span>${(h / TARGET_HEIGHT).toFixed(2)}×</span></div>
    <div><span>Height ÷ door</span><span>${(h / DOOR_HEIGHT).toFixed(2)}×</span></div>
  `;
}

async function loadAsset(def: QuatModelDef): Promise<void> {
  const myToken = ++loadToken;
  emptyEl.style.display = 'none';
  loadingEl.style.display = 'block';
  try {
    const loaded: LoadedQuatAsset = await loadQuatAsset(def);
    if (myToken !== loadToken) return;
    if (currentObject) scene.remove(currentObject);

    currentObject = loaded.scene;
    currentMixer  = loaded.mixer;
    currentDef    = def;
    currentObject.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

    // Measure at native scale (×1) first — this is the number that matters
    // for calibration: how big is this model *before* any adapter applies a
    // scale factor to it.
    currentObject.scale.setScalar(1);
    const box = new THREE.Box3().setFromObject(currentObject);
    rawSize = box.getSize(new THREE.Vector3());

    scaleInputEl.value = '1';
    scene.add(currentObject);
    applyScale(1);

    panelTitleEl.textContent = def.name;
    if (currentMixer && loaded.clips.length > 0) {
      const idle = loaded.clips.find(c => /idle/i.test(c.name)) ?? loaded.clips[0];
      currentMixer.clipAction(idle).play();
    }
  } catch (e) {
    console.error('[scale-lab] failed to load', def.id, e);
    panelTitleEl.textContent = `Failed to load "${def.name}"`;
  } finally {
    if (myToken === loadToken) loadingEl.style.display = 'none';
  }
}

scaleInputEl.addEventListener('input', () => {
  const v = parseFloat(scaleInputEl.value);
  if (Number.isFinite(v) && v > 0) applyScale(v);
});
autofitBtnEl.addEventListener('click', () => {
  if (!currentObject || rawSize.y <= 0.001) return;
  const target = parseFloat(targetInputEl.value);
  if (!Number.isFinite(target) || target <= 0) return;
  const scale = target / rawSize.y;
  scaleInputEl.value = scale.toFixed(4);
  applyScale(scale);
});
resetBtnEl.addEventListener('click', () => {
  scaleInputEl.value = '1';
  applyScale(1);
});

function resize(): void {
  const w = viewportEl.clientWidth, h = viewportEl.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  currentMixer?.update(dt);
  charMixer?.update(dt);
  controls.update();
  renderer.render(scene, camera);
});

// ── Programmatic hook for Playwright/tests — the whole point of this tool ────
// Lets calibration be driven and read back exactly, without a human
// eyeballing a screenshot. Reusable for any future asset category.

interface ScaleLabMeasurements {
  modelId: string | null;
  raw:     { w: number; h: number; d: number };
  scale:   number;
  final:   { w: number; h: number; d: number };
  heightVsCharacter: number;
  heightVsDoor: number;
}

function getMeasurements(): ScaleLabMeasurements {
  const scale = parseFloat(scaleInputEl.value) || 1;
  const final = { w: rawSize.x * scale, h: rawSize.y * scale, d: rawSize.z * scale };
  return {
    modelId: currentDef?.id ?? null,
    raw: { w: rawSize.x, h: rawSize.y, d: rawSize.z },
    scale,
    final,
    heightVsCharacter: final.h / TARGET_HEIGHT,
    heightVsDoor: final.h / DOOR_HEIGHT,
  };
}

(window as unknown as Record<string, unknown>)['__scaleLab'] = {
  targetHeight: TARGET_HEIGHT,
  doorHeight: DOOR_HEIGHT,
  loadModel: async (id: string) => {
    const def = QUAT_MODELS.find(m => m.id === id);
    if (!def) throw new Error(`__scaleLab.loadModel: unknown model id "${id}"`);
    await loadAsset(def);
    return getMeasurements();
  },
  setScale: (factor: number) => { scaleInputEl.value = String(factor); applyScale(factor); return getMeasurements(); },
  autoFitHeight: (targetHeight: number) => {
    if (!currentObject || rawSize.y <= 0.001) return getMeasurements();
    const scale = targetHeight / rawSize.y;
    scaleInputEl.value = scale.toFixed(4);
    applyScale(scale);
    return getMeasurements();
  },
  getMeasurements,
  ready: () => referenceLoaded,
};

void loadReferenceCharacter();

// Optional ?model=<id> deep link — preloads a specific asset for a direct
// "go measure this one" workflow from another dev tool.
const params = new URLSearchParams(location.search);
const preloadId = params.get('model');
if (preloadId) {
  const def = QUAT_MODELS.find(m => m.id === preloadId);
  if (def) void loadAsset(def);
}
