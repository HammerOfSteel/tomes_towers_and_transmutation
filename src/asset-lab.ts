/**
 * asset-lab.ts — Standalone Quaternius Asset Lab (dev-only 3D inventory browser)
 *
 * Rebuild of the step-2 Asset Lab after the first attempt (a tab bolted onto
 * the legacy Dev Sandbox — sandbox-arena floor, player character, dim
 * atmospheric lighting) was explicitly rejected. This is a fully standalone
 * page — no game, no player, no arena — modeled on showroom.ts's pattern:
 * its own THREE.WebGLRenderer + OrbitControls + a bright, neutral studio
 * lighting rig, so every imported asset can be judged on its own merits
 * (including whether "looks dark" is the asset's real authored palette or a
 * lighting/normals bug — a dim in-game arena can never answer that).
 *
 * UI is the Category → Pack → Sub-group hierarchy documented in
 * docs/asset-integration/2026-09-22-quaternius-asset-inventory.md — not a
 * flat per-category list. Sub-group assignment comes from the `subgroup`
 * field baked into quaterniusManifest.ts by scripts/gen-quaternius-manifest.mjs.
 *
 * Entry: asset-lab.html
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  QUAT_PACKS, QUAT_MODELS,
  type QuatCategory, type QuatModelDef, type QuatPackDef,
} from '@/assets/quaterniusManifest';
import { loadQuatAsset, type LoadedQuatAsset } from '@/assets/QuaterniusAssetLoader';

// ── Category display metadata (fixed order + friendly labels) ────────────────

const CATEGORY_ORDER: readonly QuatCategory[] = [
  'animals', 'monsters', 'fantasy_props',
  'medieval_village_pack', 'modular_fantasy_village', 'modular_dungeons',
];

const CATEGORY_LABEL: Record<QuatCategory, string> = {
  animals:                 '🐾 Animals',
  monsters:                '👹 Monsters',
  fantasy_props:           '🏺 Fantasy Props',
  medieval_village_pack:   '🏠 Medieval Village',
  modular_dungeons:        '🗝️ Modular Dungeon Kit',
  modular_fantasy_village: '🏘️ Modular Fantasy Village Kit',
};

/** Packs deliberately not imported yet — see the inventory doc's "Import
 *  scope" table. Purely informational here: shows the user the full picture
 *  of what exists on disk even though it's not browsable in 3D yet. */
const NOT_YET_IMPORTED: ReadonlyArray<{ label: string; reason: string }> = [
  { label: 'modern_type_buildings/ — City Pack + Interior Pack',   reason: 'tonal mismatch (modern, not fantasy/medieval) — excluded by design' },
  { label: 'modular_dungeons/Textures.zip',                       reason: 'orphaned — only 2 loose texture files, no meshes' },
  { label: 'modular_dungeons/Ultimate Modular Sci-Fi (91 pieces)', reason: 'tonal mismatch (sci-fi) — pending user decision on whether to import' },
  { label: 'nature_props/ — Blends.zip (trees, rocks, flowers, bushes)', reason: '.blend-only, no exported FBX/GLTF/OBJ — blocked on a Blender export pass (Blender MCP now available for this, per the inventory doc)' },
];

// ── Grouped data model ────────────────────────────────────────────────────────

interface SubgroupNode { name: string; models: QuatModelDef[]; }
interface PackNode { pack: QuatPackDef; subgroups: SubgroupNode[]; flatModels: QuatModelDef[]; }
interface CategoryNode { category: QuatCategory; packs: PackNode[]; }

function buildTree(): CategoryNode[] {
  const modelsByPack = new Map<string, QuatModelDef[]>();
  for (const m of QUAT_MODELS) {
    (modelsByPack.get(m.packId) ?? modelsByPack.set(m.packId, []).get(m.packId)!).push(m);
  }

  const tree: CategoryNode[] = [];
  for (const category of CATEGORY_ORDER) {
    const packs = QUAT_PACKS.filter((p) => p.category === category);
    if (packs.length === 0) continue;
    const packNodes: PackNode[] = packs.map((pack) => {
      const models = modelsByPack.get(pack.id) ?? [];
      const hasSubgroups = models.some((m) => m.subgroup);
      if (!hasSubgroups) {
        return { pack, subgroups: [], flatModels: [...models].sort((a, b) => a.name.localeCompare(b.name)) };
      }
      const bySub = new Map<string, QuatModelDef[]>();
      for (const m of models) {
        const key = m.subgroup ?? 'Misc / Other';
        (bySub.get(key) ?? bySub.set(key, []).get(key)!).push(m);
      }
      const subgroups: SubgroupNode[] = [...bySub.entries()]
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .map(([name, ms]) => ({ name, models: ms.sort((a, b) => a.name.localeCompare(b.name)) }));
      return { pack, subgroups, flatModels: [] };
    });
    tree.push({ category, packs: packNodes });
  }
  return tree;
}

const TREE = buildTree();

// ── DOM scaffold ───────────────────────────────────────────────────────────────

const root = document.getElementById('al-root')!;
root.innerHTML = `
<style>
  #al-root { position: fixed; inset: 0; display: flex; flex-direction: column; color: #e8e6f0; }
  #al-topbar {
    height: 46px; flex: none; display: flex; align-items: center; gap: 14px;
    padding: 0 16px; background: #1c1c28; border-bottom: 1px solid #2e2e40;
  }
  #al-topbar h1 { font-size: .95rem; font-weight: 600; color: #d8b8ff; }
  #al-topbar .al-count { font-size: .72rem; color: #8884a0; }
  #al-search {
    flex: none; width: 220px; background: #14141e; border: 1px solid #3a3a50;
    color: #e8e6f0; border-radius: 5px; padding: 5px 9px; font-size: .78rem; margin-left: auto;
  }
  #al-body { flex: 1; display: flex; min-height: 0; }
  #al-sidebar {
    width: 300px; flex: none; overflow-y: auto; background: #191922;
    border-right: 1px solid #2e2e40; padding: 8px;
  }
  .al-cat { margin-bottom: 4px; }
  .al-cat > summary {
    cursor: pointer; padding: 7px 8px; border-radius: 5px; font-size: .82rem;
    font-weight: 600; color: #f0e8ff; list-style: none; user-select: none;
  }
  .al-cat > summary::-webkit-details-marker { display: none; }
  .al-cat > summary:hover { background: #24243230; }
  .al-cat[open] > summary { background: #2a2038; }
  .al-pack { margin: 2px 0 6px 10px; }
  .al-pack > summary {
    cursor: pointer; padding: 5px 8px; border-radius: 4px; font-size: .76rem;
    color: #c8c2e0; list-style: none; user-select: none; display: flex; justify-content: space-between;
  }
  .al-pack > summary::-webkit-details-marker { display: none; }
  .al-pack > summary:hover { background: #22222e; }
  .al-pack-count { color: #706a90; font-size: .68rem; }
  .al-sub { margin: 1px 0 4px 12px; }
  .al-sub > summary {
    cursor: pointer; padding: 3px 8px; border-radius: 4px; font-size: .7rem;
    color: #9a92c0; list-style: none; user-select: none; display: flex; justify-content: space-between;
  }
  .al-sub > summary::-webkit-details-marker { display: none; }
  .al-sub > summary:hover { background: #202030; }
  .al-item {
    display: block; width: calc(100% - 12px); margin: 1px 0 1px 12px; padding: 4px 8px;
    background: none; border: none; color: #b8b4d0; font-size: .71rem; text-align: left;
    border-radius: 4px; cursor: pointer;
  }
  .al-item:hover { background: #262638; color: #fff; }
  .al-item.al-item--active { background: #6c3fb8; color: #fff; }
  .al-item .al-anim-dot { color: #40e0a0; margin-left: 4px; }
  #al-notimported {
    margin-top: 10px; padding-top: 8px; border-top: 1px solid #2e2e40;
  }
  #al-notimported summary {
    cursor: pointer; font-size: .74rem; color: #8a8298; padding: 6px 8px; list-style: none;
  }
  #al-notimported summary::-webkit-details-marker { display: none; }
  #al-notimported li { font-size: .68rem; color: #78728e; padding: 4px 8px 4px 20px; line-height: 1.4; }
  #al-notimported b { color: #a89ac0; }
  #al-viewport { flex: 1; position: relative; background: #d8d8e0; }
  #al-viewport-empty {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    color: #7a7690; font-size: .9rem; pointer-events: none;
  }
  #al-infobar {
    position: absolute; left: 0; right: 0; bottom: 0; padding: 10px 16px;
    background: linear-gradient(0deg, rgba(20,20,28,.92), rgba(20,20,28,0));
    display: flex; flex-direction: column; gap: 6px; pointer-events: none;
  }
  #al-infobar.al-hidden { display: none; }
  #al-info-title { font-size: .95rem; font-weight: 600; color: #fff; }
  #al-info-meta { font-size: .72rem; color: #c8c4dc; display: flex; gap: 12px; }
  #al-clips { display: flex; gap: 6px; flex-wrap: wrap; pointer-events: all; }
  .al-clip-btn {
    background: #2a2438; border: 1px solid #4a3f68; color: #d8d0ec;
    font-size: .68rem; padding: 4px 10px; border-radius: 12px; cursor: pointer;
  }
  .al-clip-btn:hover { background: #3a2f52; }
  .al-clip-btn--active { background: #7040cc; border-color: #9060f0; color: #fff; }
  #al-loading {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
    background: rgba(20,20,28,.85); color: #d8d0ec; font-size: .78rem;
    padding: 6px 14px; border-radius: 6px; display: none;
  }
  #al-error {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
    background: #4a1a1a; color: #ffb0b0; font-size: .78rem;
    padding: 6px 14px; border-radius: 6px; display: none; max-width: 70%;
  }
</style>
<div id="al-topbar">
  <h1>🗿 Asset Lab</h1>
  <span class="al-count">${QUAT_MODELS.length} models · ${QUAT_PACKS.length} packs</span>
  <input id="al-search" type="text" placeholder="Search assets…" />
</div>
<div id="al-body">
  <div id="al-sidebar"></div>
  <div id="al-viewport">
    <div id="al-viewport-empty">Select an asset from the list to preview it here.</div>
    <div id="al-loading">Loading…</div>
    <div id="al-error"></div>
    <div id="al-infobar" class="al-hidden">
      <div id="al-info-title"></div>
      <div id="al-info-meta"></div>
      <div id="al-clips"></div>
    </div>
  </div>
</div>
`;

const sidebarEl   = document.getElementById('al-sidebar')!;
const searchEl    = document.getElementById('al-search') as HTMLInputElement;
const viewportEl  = document.getElementById('al-viewport')!;
const emptyEl     = document.getElementById('al-viewport-empty')!;
const loadingEl   = document.getElementById('al-loading')!;
const errorEl     = document.getElementById('al-error')!;
const infobarEl   = document.getElementById('al-infobar')!;
const infoTitleEl = document.getElementById('al-info-title')!;
const infoMetaEl  = document.getElementById('al-info-meta')!;
const clipsEl     = document.getElementById('al-clips')!;

// ── Sidebar tree rendering ────────────────────────────────────────────────────

let activeItemEl: HTMLElement | null = null;

function renderSidebar(filter: string): void {
  sidebarEl.innerHTML = '';
  const q = filter.trim().toLowerCase();

  for (const catNode of TREE) {
    const matchingPacks = catNode.packs
      .map((packNode) => filterPackNode(packNode, q))
      .filter((p): p is PackNode => p !== null);
    if (q && matchingPacks.length === 0) continue;

    const catCount = matchingPacks.reduce((n, p) => n + p.flatModels.length + p.subgroups.reduce((s, sg) => s + sg.models.length, 0), 0);

    const details = document.createElement('details');
    details.className = 'al-cat';
    details.open = !!q || catNode.category === CATEGORY_ORDER[0];
    const summary = document.createElement('summary');
    summary.textContent = `${CATEGORY_LABEL[catNode.category]} (${catCount})`;
    details.appendChild(summary);

    for (const packNode of matchingPacks) {
      details.appendChild(renderPackNode(packNode, q));
    }
    sidebarEl.appendChild(details);
  }

  // "Not yet imported" informational section — always visible, unaffected by search.
  const niDetails = document.createElement('details');
  niDetails.id = 'al-notimported';
  const niSummary = document.createElement('summary');
  niSummary.textContent = `📋 Not yet imported (${NOT_YET_IMPORTED.length}) — see inventory doc`;
  niDetails.appendChild(niSummary);
  const ul = document.createElement('ul');
  ul.style.cssText = 'list-style:none;';
  for (const entry of NOT_YET_IMPORTED) {
    const li = document.createElement('li');
    li.innerHTML = `<b>${entry.label}</b><br/>${entry.reason}`;
    ul.appendChild(li);
  }
  niDetails.appendChild(ul);
  sidebarEl.appendChild(niDetails);
}

/** Returns a filtered copy of packNode (only matching subgroups/models), or
 *  null if nothing in it matches the query. */
function filterPackNode(packNode: PackNode, q: string): PackNode | null {
  if (!q) return packNode;
  const flatModels = packNode.flatModels.filter((m) => m.name.toLowerCase().includes(q));
  const subgroups = packNode.subgroups
    .map((sg) => ({ name: sg.name, models: sg.models.filter((m) => m.name.toLowerCase().includes(q)) }))
    .filter((sg) => sg.models.length > 0);
  if (flatModels.length === 0 && subgroups.length === 0) return null;
  return { pack: packNode.pack, flatModels, subgroups };
}

function renderPackNode(packNode: PackNode, q: string): HTMLElement {
  const total = packNode.flatModels.length + packNode.subgroups.reduce((s, sg) => s + sg.models.length, 0);
  const details = document.createElement('details');
  details.className = 'al-pack';
  details.open = !!q;
  const summary = document.createElement('summary');
  summary.innerHTML = `<span>${packNode.pack.icon} ${packNode.pack.name}</span><span class="al-pack-count">${total}</span>`;
  summary.title = packNode.pack.desc;
  details.appendChild(summary);

  if (packNode.subgroups.length > 0) {
    for (const sg of packNode.subgroups) {
      const sgDetails = document.createElement('details');
      sgDetails.className = 'al-sub';
      sgDetails.open = !!q;
      const sgSummary = document.createElement('summary');
      sgSummary.innerHTML = `<span>${sg.name}</span><span class="al-pack-count">${sg.models.length}</span>`;
      sgDetails.appendChild(sgSummary);
      for (const model of sg.models) sgDetails.appendChild(renderItemButton(model));
      details.appendChild(sgDetails);
    }
  } else {
    for (const model of packNode.flatModels) details.appendChild(renderItemButton(model));
  }
  return details;
}

function renderItemButton(model: QuatModelDef): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'al-item';
  btn.dataset.modelId = model.id;
  btn.innerHTML = model.name + (model.animated ? '<span class="al-anim-dot">●</span>' : '');
  btn.onclick = () => {
    activeItemEl?.classList.remove('al-item--active');
    btn.classList.add('al-item--active');
    activeItemEl = btn;
    void previewModel(model);
  };
  return btn;
}

searchEl.addEventListener('input', () => renderSidebar(searchEl.value));
renderSidebar('');

// ── THREE scene: standalone renderer, no game/player dependency ─────────────

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.outputColorSpace  = THREE.SRGBColorSpace;
viewportEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8d8e0); // neutral bright studio gray — not a game arena

const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
camera.position.set(3, 2.5, 4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0.8, 0);

// ── Bright, neutral studio lighting rig ───────────────────────────────────────
// Deliberately much brighter/flatter than the game's in-world lighting so an
// asset's *true* material/texture can be judged in isolation — this is the
// dedicated instrument the dark-OBJ-material question (genuine muted stone
// palette vs. a lighting/normals bug) needs, which the old dim sandbox-arena
// lighting could never answer.
const hemi = new THREE.HemisphereLight(0xffffff, 0x9090a0, 1.1);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(4, 6, 5);
key.castShadow = true;
key.shadow.mapSize.setScalar(1024);
key.shadow.camera.near = 0.1;
key.shadow.camera.far  = 30;
key.shadow.camera.left = key.shadow.camera.bottom = -6;
key.shadow.camera.right = key.shadow.camera.top   = 6;
scene.add(key);

const fill = new THREE.DirectionalLight(0xdce8ff, 0.7);
fill.position.set(-5, 3, -3);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xfff0e0, 0.5);
rim.position.set(0, 4, -6);
scene.add(rim);

// ── Neutral pedestal (no game floor/grid — just a soft round disc) ──────────

const pedestal = new THREE.Mesh(
  new THREE.CircleGeometry(2.2, 48),
  new THREE.MeshStandardMaterial({ color: 0xc4c4cc, roughness: 0.9, metalness: 0 }),
);
pedestal.rotation.x = -Math.PI / 2;
pedestal.receiveShadow = true;
scene.add(pedestal);

function resize(): void {
  const w = viewportEl.clientWidth, h = viewportEl.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ── Asset preview state ───────────────────────────────────────────────────────

let currentObject: THREE.Object3D | null = null;
let currentMixer: THREE.AnimationMixer | null = null;
let currentLoaded: LoadedQuatAsset | null = null;
let loadToken = 0;

/** Force double-sided materials on a loaded object. Several OBJ dungeon-kit
 *  pieces render as flat black silhouettes under normal single-sided
 *  rendering — consistent with inverted/missing back-facing normals from the
 *  Blender→OBJ axis-conversion pipeline rather than genuinely black-authored
 *  materials (their .mtl Kd values are dark-stone, not black). Forcing
 *  DoubleSide is a safe, non-destructive display fix: it can only reveal
 *  currently-invisible back faces, never hide anything that already renders. */
function forceDoubleSided(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) (mat as THREE.Material).side = THREE.DoubleSide;
  });
}

function frameCameraToObject(obj: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.01);
  const dist = maxDim * 1.8 / Math.tan((camera.fov * Math.PI / 180) / 2);
  const dir = new THREE.Vector3(1, 0.6, 1).normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  controls.target.copy(center);
  controls.update();
}

async function previewModel(def: QuatModelDef): Promise<void> {
  const myToken = ++loadToken;
  errorEl.style.display = 'none';
  loadingEl.style.display = 'block';
  emptyEl.style.display = 'none';

  try {
    const loaded = await loadQuatAsset(def);
    if (myToken !== loadToken) return; // superseded by a newer click

    if (currentObject) scene.remove(currentObject);
    currentLoaded = loaded;
    currentObject = loaded.scene;
    currentMixer  = loaded.mixer;

    forceDoubleSided(currentObject);
    currentObject.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });

    // Normalize to a consistent ~1.6m tall inspection scale so tiny props
    // (a Coin) and huge kit pieces (a Wall section) are both easy to see.
    const box0 = new THREE.Box3().setFromObject(currentObject);
    const height = Math.max(box0.max.y - box0.min.y, 0.01);
    currentObject.scale.setScalar(1.6 / height);
    currentObject.position.set(0, 0, 0);
    const box1 = new THREE.Box3().setFromObject(currentObject);
    currentObject.position.y -= box1.min.y; // sit on the pedestal, not floating/clipping

    scene.add(currentObject);
    frameCameraToObject(currentObject);

    infobarEl.classList.remove('al-hidden');
    infoTitleEl.textContent = def.name;
    infoMetaEl.innerHTML =
      `<span>📦 ${def.packId}</span>` +
      (def.subgroup ? `<span>🗂 ${def.subgroup}</span>` : '') +
      `<span>${def.format.toUpperCase()}</span>` +
      `<span>${loaded.clips.length > 0 ? `🎬 ${loaded.clips.length} clip${loaded.clips.length > 1 ? 's' : ''}` : '🧊 static'}</span>`;

    clipsEl.innerHTML = '';
    if (currentMixer && loaded.clips.length > 0) {
      const idle = loaded.clips.find((c) => /idle/i.test(c.name)) ?? loaded.clips[0];
      playClip(idle.name);
      for (const clip of loaded.clips) {
        const btn = document.createElement('button');
        btn.className = 'al-clip-btn' + (clip.name === idle.name ? ' al-clip-btn--active' : '');
        btn.textContent = clip.name;
        btn.onclick = () => playClip(clip.name);
        clipsEl.appendChild(btn);
      }
    }
  } catch (e) {
    if (myToken !== loadToken) return;
    console.error('[asset-lab] failed to load', def.id, e);
    errorEl.textContent = `Failed to load "${def.name}" (${def.path}) — ${String(e)}`;
    errorEl.style.display = 'block';
    infobarEl.classList.add('al-hidden');
  } finally {
    if (myToken === loadToken) loadingEl.style.display = 'none';
  }
}

function playClip(name: string): void {
  if (!currentMixer || !currentLoaded) return;
  currentMixer.stopAllAction();
  const clip = currentLoaded.clips.find((c) => c.name === name);
  if (clip) currentMixer.clipAction(clip).play();
  clipsEl.querySelectorAll<HTMLButtonElement>('.al-clip-btn').forEach((b) => {
    b.classList.toggle('al-clip-btn--active', b.textContent === name);
  });
}

// ── Render loop — the mixer is ticked here, every frame, unconditionally.  ──
// (The prior Dev-Sandbox-embedded Asset Lab silently never ticked its
// preview mixer because it piggybacked on the main game loop and that loop
// only updated the *character*-preview mixer, not the Quaternius one — a
// standalone page with its own loop structurally can't have that class of
// bug: there is only one mixer reference and only one place that ticks it.)
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  currentMixer?.update(dt);
  controls.update();
  renderer.render(scene, camera);
});
