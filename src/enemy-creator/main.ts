/**
 * main.ts — enemy-creator.html entry point
 *
 * DOM wiring layer for the standalone Enemy Creator surface (asset-designer.md
 * "Enemy Designer"; game-inventory.md 12b). All state logic lives in
 * `creatorState.ts` (zero DOM deps, unit-tested) — this file:
 *   1. Renders chips/pickers from ENEMY_CREATOR_SPECIES/ROLES/TIERS/MOVEMENTS
 *   2. Wires input events to the creatorState setters
 *   3. Calls buildEnemy(dna) for the live Three.js preview on every change
 *      (async — princess-rig based, so rebuilds are token-guarded against
 *      out-of-order resolution, mirroring npc-creator/main.ts)
 *   4. Wires Save → AssetLibrary type=enemy via toLibraryPayload()
 *
 * Debug flags exposed on window:
 *   window.__enemyCreatorReady — true once first preview has rendered
 *   window.__enemyCreatorDna   — current EnemyDNA snapshot (for e2e tests)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  createInitialEnemyState, setSpecies, setCombatRole, setTier, setMovement,
  setIsBoss, setColor, setName, setAttackRange, setAggroRange, setBaseHp, setBaseDmg,
  toLibraryPayload,
  ENEMY_CREATOR_SPECIES, ENEMY_CREATOR_ROLES, ENEMY_CREATOR_TIERS, ENEMY_CREATOR_MOVEMENTS,
  type EnemyCreatorState,
} from './creatorState';
import { buildEnemy, type EnemyBuildResult } from './builder';
import { AssetLibrary } from '@/overworld-studio/AssetLibrary';

const assetLibrary = new AssetLibrary();

// ── DOM refs ──────────────────────────────────────────────────────────────────

const canvas          = document.getElementById('ec-canvas') as HTMLCanvasElement;
const statusEl         = document.getElementById('status') as HTMLDivElement;
const nameInput         = document.getElementById('name-input') as HTMLInputElement;
const speciesChips      = document.getElementById('species-chips')!;
const roleChips         = document.getElementById('role-chips')!;
const tierChips         = document.getElementById('tier-chips')!;
const movementChips     = document.getElementById('movement-chips')!;
const bossToggle        = document.getElementById('boss-toggle') as HTMLInputElement;
const hpSlider          = document.getElementById('hp-slider') as HTMLInputElement;
const dmgSlider         = document.getElementById('dmg-slider') as HTMLInputElement;
const attackRangeSlider = document.getElementById('attack-range-slider') as HTMLInputElement;
const aggroRangeSlider  = document.getElementById('aggro-range-slider') as HTMLInputElement;
const galleryListEl     = document.getElementById('gallery-list')!;

const colorInputs: Record<string, HTMLInputElement> = {
  body:    document.getElementById('color-body')    as HTMLInputElement,
  accent:  document.getElementById('color-accent')  as HTMLInputElement,
  outline: document.getElementById('color-outline') as HTMLInputElement,
};

// ── Three.js scene ────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x170d10);
scene.fog = new THREE.Fog(0x170d10, 12, 40);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(2.5, 3.2, 6.5);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.4, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2.5;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.52;

scene.add(new THREE.AmbientLight(0xa08080, 0.55));
const key = new THREE.DirectionalLight(0xffd8d8, 1.0);
key.position.set(4, 6, 3);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight(0xff4040, 0.35);
rim.position.set(-4, 3, -4);
scene.add(rim);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(6, 48),
  new THREE.MeshStandardMaterial({ color: 0x241416, roughness: 0.9 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function resize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ── State ─────────────────────────────────────────────────────────────────────

let state: EnemyCreatorState = createInitialEnemyState('human', 'melee', 1, Date.now() >>> 0);
let currentInstance: EnemyBuildResult | null = null;
let rebuildToken = 0;

function showStatus(msg: string | null): void {
  if (!msg) { statusEl.style.display = 'none'; return; }
  statusEl.textContent = msg;
  statusEl.style.display = 'block';
}

async function rebuildPreview(): Promise<void> {
  const token = ++rebuildToken;
  showStatus('Rebuilding…');
  try {
    const inst = await buildEnemy(state.dna);
    if (token !== rebuildToken) { inst.dispose(); return; } // stale — a newer rebuild started
    if (currentInstance) {
      scene.remove(currentInstance.rig.group);
      currentInstance.dispose();
    }
    currentInstance = inst;
    scene.add(inst.rig.group);
    showStatus(null);
    (window as any).__enemyCreatorReady = true;
    (window as any).__enemyCreatorDna = state.dna;
  } catch (e) {
    console.error('[EnemyCreator] buildEnemy failed:', e);
    showStatus(`Preview failed: ${e}`);
  }
}

// ── Chip renderers ────────────────────────────────────────────────────────────

function renderChips(
  container: HTMLElement,
  values: readonly (string | number)[],
  activeValue: string | number,
  onSelect: (value: string) => void,
): void {
  container.innerHTML = '';
  for (const v of values) {
    const btn = document.createElement('button');
    btn.className = 'chip' + (v === activeValue ? ' active' : '');
    btn.textContent = String(v).replace(/_/g, ' ');
    btn.addEventListener('click', () => onSelect(String(v)));
    container.appendChild(btn);
  }
}

function syncUiFromState(): void {
  renderChips(speciesChips, ENEMY_CREATOR_SPECIES, state.dna.species, (v) => {
    state = setSpecies(state, v as typeof state.dna.species);
    syncUiFromState();
    void rebuildPreview();
  });
  renderChips(roleChips, ENEMY_CREATOR_ROLES, state.dna.combatRole, (v) => {
    state = setCombatRole(state, v as typeof state.dna.combatRole);
    syncUiFromState();
    void rebuildPreview();
  });
  renderChips(tierChips, ENEMY_CREATOR_TIERS, state.dna.tier, (v) => {
    state = setTier(state, Number(v) as typeof state.dna.tier);
    syncUiFromState();
    void rebuildPreview();
  });
  renderChips(movementChips, ENEMY_CREATOR_MOVEMENTS, state.dna.movement, (v) => {
    state = setMovement(state, v as typeof state.dna.movement);
    syncUiFromState();
  });

  bossToggle.checked = state.dna.isBoss;
  nameInput.value = state.dna.name;
  hpSlider.value          = String(state.dna.baseHp);
  dmgSlider.value         = String(state.dna.baseDmg);
  attackRangeSlider.value = String(state.dna.attackRange);
  aggroRangeSlider.value  = String(state.dna.aggroRange);
  for (const [slot, input] of Object.entries(colorInputs)) {
    input.value = (state.dna.colors as any)[slot];
  }
}

// ── Wiring ────────────────────────────────────────────────────────────────────

bossToggle.addEventListener('change', () => {
  state = setIsBoss(state, bossToggle.checked);
  void rebuildPreview();
});

nameInput.addEventListener('input', () => {
  state = setName(state, nameInput.value);
});

hpSlider.addEventListener('input', () => {
  state = setBaseHp(state, Number(hpSlider.value));
});
dmgSlider.addEventListener('input', () => {
  state = setBaseDmg(state, Number(dmgSlider.value));
});
attackRangeSlider.addEventListener('input', () => {
  state = setAttackRange(state, Number(attackRangeSlider.value));
});
aggroRangeSlider.addEventListener('input', () => {
  state = setAggroRange(state, Number(aggroRangeSlider.value));
});

for (const [slot, input] of Object.entries(colorInputs)) {
  input.addEventListener('input', () => {
    state = setColor(state, slot as keyof typeof state.dna.colors, input.value);
    void rebuildPreview();
  });
}

document.getElementById('btn-save')?.addEventListener('click', () => {
  const payload = toLibraryPayload(state);
  assetLibrary.add({
    id: `enemy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: payload.type,
    name: payload.name,
    seed: payload.seed,
    createdAt: Date.now(),
    tags: payload.tags,
    isCustom: true,
    data: payload.data,
    thumbnail: null,
  });
  renderGallery();
  console.log('[EnemyCreator] saved to library:', payload.name);
});

// ── Gallery ───────────────────────────────────────────────────────────────────

function renderGallery(): void {
  const entries = assetLibrary.getByType('enemy');
  galleryListEl.innerHTML = '';
  if (entries.length === 0) {
    galleryListEl.textContent = 'No saved enemies yet.';
    return;
  }
  for (const entry of entries) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:3px 0';
    const label = document.createElement('span');
    label.textContent = entry.name;
    label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1';
    const del = document.createElement('button');
    del.textContent = '✕';
    del.className = 'icon-btn';
    del.style.cssText = 'padding:1px 6px;font-size:10px';
    del.addEventListener('click', () => {
      assetLibrary.remove(entry.id);
      renderGallery();
    });
    row.appendChild(label);
    row.appendChild(del);
    galleryListEl.appendChild(row);
  }
}

// ── Render loop ───────────────────────────────────────────────────────────────

function animate(): void {
  requestAnimationFrame(animate);
  controls.update();
  currentInstance?.update(performance.now() / 1000, 1 / 60);
  renderer.render(scene, camera);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

syncUiFromState();
renderGallery();
void rebuildPreview();
animate();
