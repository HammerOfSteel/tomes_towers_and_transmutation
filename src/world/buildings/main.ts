/**
 * main.ts — building-creator.html entry point
 *
 * DOM wiring layer for the standalone Building Creator surface. All state
 * logic lives in `buildingCreatorState.ts` (zero DOM deps, unit-tested) —
 * this file:
 *   1. Renders chips/pickers from BUILDING_CREATOR_KINDS/FACTIONS/SIZES
 *   2. Wires input events to the creatorState setters
 *   3. Calls buildBuilding(dna) for the live Three.js preview on every change
 *   4. Wires Save → AssetLibrary type=building via toLibraryPayload()
 *
 * Debug flags exposed on window:
 *   window.__buildingCreatorReady — true once first preview has rendered
 *   window.__buildingCreatorDna   — current BuildingDNA snapshot (for e2e tests)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  createInitialBuildingState, setKind, setFaction, setSize, setFloors,
  setRotation, toggleFeature, setColor, setName, toLibraryPayload,
  BUILDING_CREATOR_KINDS, BUILDING_CREATOR_FACTIONS, BUILDING_CREATOR_SIZES,
  type BuildingCreatorState,
} from './buildingCreatorState';
import type { BuildingDNA } from './BuildingDNA';
import { buildBuilding, type BuildingInstance } from './BuildingBuilder';
import { AssetLibrary } from '@/overworld-studio/AssetLibrary';

const FEATURES: readonly BuildingDNA['features'][number][] = [
  'bay_window', 'jetty', 'battlements', 'buttress', 'awning', 'balcony',
];

const assetLibrary = new AssetLibrary();

// ── DOM refs ──────────────────────────────────────────────────────────────────

const canvas       = document.getElementById('bc-canvas') as HTMLCanvasElement;
const statusEl      = document.getElementById('status') as HTMLDivElement;
const nameInput      = document.getElementById('name-input') as HTMLInputElement;
const kindChips      = document.getElementById('kind-chips')!;
const factionChips   = document.getElementById('faction-chips')!;
const sizeChips      = document.getElementById('size-chips')!;
const floorsChips    = document.getElementById('floors-chips')!;
const featureChips   = document.getElementById('feature-chips')!;
const rotationSlider = document.getElementById('rotation-slider') as HTMLInputElement;
const galleryListEl  = document.getElementById('gallery-list')!;

const colorInputs: Record<string, HTMLInputElement> = {
  walls: document.getElementById('color-walls') as HTMLInputElement,
  roof:  document.getElementById('color-roof')  as HTMLInputElement,
  trim:  document.getElementById('color-trim')  as HTMLInputElement,
  door:  document.getElementById('color-door')  as HTMLInputElement,
};

// ── Three.js scene ────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a140f);
scene.fog = new THREE.Fog(0x1a140f, 15, 60);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(10, 9, 16);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.5;

scene.add(new THREE.AmbientLight(0x9088a0, 0.5));
const key = new THREE.DirectionalLight(0xfff2d8, 1.05);
key.position.set(8, 12, 6);
key.castShadow = true;
scene.add(key);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x2a2016, roughness: 0.95 }),
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

let state: BuildingCreatorState = createInitialBuildingState('house', 'human_rural', Date.now() >>> 0);
let currentInstance: BuildingInstance | null = null;

function showStatus(msg: string | null): void {
  if (!msg) { statusEl.style.display = 'none'; return; }
  statusEl.textContent = msg;
  statusEl.style.display = 'block';
}

function rebuildPreview(): void {
  showStatus(null);
  try {
    if (currentInstance) {
      scene.remove(currentInstance.exteriorGroup);
      currentInstance.dispose();
      currentInstance = null;
    }
    const inst = buildBuilding(state.dna);
    currentInstance = inst;
    scene.add(inst.exteriorGroup);
    (window as any).__buildingCreatorReady = true;
    (window as any).__buildingCreatorDna = state.dna;
  } catch (e) {
    console.error('[BuildingCreator] buildBuilding failed:', e);
    showStatus(`Preview failed: ${e}`);
  }
}

// ── Chip renderers ────────────────────────────────────────────────────────────

function renderChips(
  container: HTMLElement,
  values: readonly string[],
  activeValue: string,
  onSelect: (value: string) => void,
): void {
  container.innerHTML = '';
  for (const v of values) {
    const btn = document.createElement('button');
    btn.className = 'chip' + (v === activeValue ? ' active' : '');
    btn.textContent = v.replace(/_/g, ' ');
    btn.addEventListener('click', () => onSelect(v));
    container.appendChild(btn);
  }
}

function renderMultiChips(
  container: HTMLElement,
  values: readonly string[],
  activeValues: readonly string[],
  onToggle: (value: string) => void,
): void {
  container.innerHTML = '';
  for (const v of values) {
    const btn = document.createElement('button');
    btn.className = 'chip' + (activeValues.includes(v) ? ' active' : '');
    btn.textContent = v.replace(/_/g, ' ');
    btn.addEventListener('click', () => onToggle(v));
    container.appendChild(btn);
  }
}

function syncUiFromState(): void {
  renderChips(kindChips, BUILDING_CREATOR_KINDS, state.dna.buildingKind, (v) => {
    state = setKind(state, v as typeof state.dna.buildingKind);
    syncUiFromState();
    rebuildPreview();
  });
  renderChips(factionChips, BUILDING_CREATOR_FACTIONS, _currentFaction(), (v) => {
    state = setFaction(state, v as any);
    syncUiFromState();
    rebuildPreview();
  });
  renderChips(sizeChips, BUILDING_CREATOR_SIZES, state.dna.size, (v) => {
    state = setSize(state, v as typeof state.dna.size);
    syncUiFromState();
    rebuildPreview();
  });
  renderChips(floorsChips, ['1', '2', '3', '4'], String(state.dna.floors), (v) => {
    state = setFloors(state, Number(v) as 1 | 2 | 3 | 4);
    syncUiFromState();
    rebuildPreview();
  });
  renderMultiChips(featureChips, FEATURES, state.dna.features, (v) => {
    state = toggleFeature(state, v as typeof state.dna.features[number]);
    syncUiFromState();
    rebuildPreview();
  });

  rotationSlider.value = String(state.dna.rotation);
  nameInput.value = state.dna.name;
  for (const [slot, input] of Object.entries(colorInputs)) {
    input.value = (state.dna.colors as any)[slot];
  }
}

function _currentFaction(): string {
  return state.dna.name.split(' ')[0] ?? 'human_rural';
}

// ── Wiring ────────────────────────────────────────────────────────────────────

rotationSlider.addEventListener('input', () => {
  state = setRotation(state, Number(rotationSlider.value));
  rebuildPreview();
});

nameInput.addEventListener('input', () => {
  state = setName(state, nameInput.value);
});

for (const [slot, input] of Object.entries(colorInputs)) {
  input.addEventListener('input', () => {
    state = setColor(state, slot as keyof typeof state.dna.colors, input.value);
    rebuildPreview();
  });
}

document.getElementById('btn-save')?.addEventListener('click', () => {
  const payload = toLibraryPayload(state);
  assetLibrary.add({
    id: `building_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
  console.log('[BuildingCreator] saved to library:', payload.name);
});

// ── Gallery ───────────────────────────────────────────────────────────────────

function renderGallery(): void {
  const entries = assetLibrary.getByType('building');
  galleryListEl.innerHTML = '';
  if (entries.length === 0) {
    galleryListEl.textContent = 'No saved buildings yet.';
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
  renderer.render(scene, camera);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

syncUiFromState();
renderGallery();
rebuildPreview();
animate();