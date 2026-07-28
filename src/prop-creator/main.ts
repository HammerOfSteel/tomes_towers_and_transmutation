/**
 * main.ts — prop-creator.html entry point
 *
 * DOM wiring layer for the standalone Prop Creator surface (asset-designer.md
 * "Prop Designer"). All state logic lives in `creatorState.ts` (zero DOM
 * deps, unit-tested) — this file:
 *   1. Renders chips/pickers from PROP_CREATOR_KINDS/MATERIALS/THEMES/CONDITIONS
 *   2. Wires input events to the creatorState setters
 *   3. Calls buildProp(dna) for the live Three.js preview on every change
 *      (synchronous — pure primitive geometry, no async imports needed)
 *   4. Wires Save → AssetLibrary type=prop via toLibraryPayload()
 *
 * Debug flags exposed on window:
 *   window.__propCreatorReady — true once first preview has rendered
 *   window.__propCreatorDna   — current PropDNA snapshot (for e2e tests)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  createInitialPropState, setPropKind, setMaterial, setTheme, setCondition,
  setSize, setColor, setGlow, setGlowIntensity, setName, setInteractionType, toLibraryPayload,
  PROP_CREATOR_KINDS, PROP_CREATOR_MATERIALS, PROP_CREATOR_THEMES, PROP_CREATOR_CONDITIONS,
  type PropCreatorState, type PropInteractionType,
} from './creatorState';
import { buildProp, type BuiltProp } from './builder';
import { AssetLibrary } from '@/overworld-studio/AssetLibrary';

const INTERACTION_TYPES: readonly PropInteractionType[] = ['none', 'lootable', 'readable', 'usable'];

const assetLibrary = new AssetLibrary();

// ── DOM refs ──────────────────────────────────────────────────────────────────

const canvas             = document.getElementById('pc-canvas') as HTMLCanvasElement;
const statusEl            = document.getElementById('status') as HTMLDivElement;
const nameInput            = document.getElementById('name-input') as HTMLInputElement;
const kindChips            = document.getElementById('kind-chips')!;
const materialChips        = document.getElementById('material-chips')!;
const themeChips           = document.getElementById('theme-chips')!;
const conditionChips       = document.getElementById('condition-chips')!;
const interactionChips     = document.getElementById('interaction-chips')!;
const sizeSlider           = document.getElementById('size-slider') as HTMLInputElement;
const glowToggle           = document.getElementById('glow-toggle') as HTMLInputElement;
const glowIntensitySlider  = document.getElementById('glow-intensity-slider') as HTMLInputElement;
const galleryListEl        = document.getElementById('gallery-list')!;

const colorInputs: Record<string, HTMLInputElement> = {
  base:   document.getElementById('color-base')   as HTMLInputElement,
  detail: document.getElementById('color-detail') as HTMLInputElement,
  glow:   document.getElementById('color-glow')   as HTMLInputElement,
};

// ── Three.js scene ────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10140f);
scene.fog = new THREE.Fog(0x10140f, 8, 30);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(1.6, 1.8, 3.2);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.52;

scene.add(new THREE.AmbientLight(0x90a080, 0.55));
const key = new THREE.DirectionalLight(0xe8ffd8, 1.0);
key.position.set(3, 5, 2);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight(0x60ff80, 0.3);
rim.position.set(-3, 2, -3);
scene.add(rim);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(4, 48),
  new THREE.MeshStandardMaterial({ color: 0x161f14, roughness: 0.9 }),
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

let state: PropCreatorState = createInitialPropState('chest', 'wood', Date.now() >>> 0);
let currentInstance: BuiltProp | null = null;

function showStatus(msg: string | null): void {
  if (!msg) { statusEl.style.display = 'none'; return; }
  statusEl.textContent = msg;
  statusEl.style.display = 'block';
}

function rebuildPreview(): void {
  showStatus(null);
  try {
    if (currentInstance) {
      scene.remove(currentInstance.root);
      currentInstance.dispose();
      currentInstance = null;
    }
    const inst = buildProp(state.dna);
    currentInstance = inst;
    scene.add(inst.root);
    (window as any).__propCreatorReady = true;
    (window as any).__propCreatorDna = state.dna;
  } catch (e) {
    console.error('[PropCreator] buildProp failed:', e);
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

function syncUiFromState(): void {
  renderChips(kindChips, PROP_CREATOR_KINDS, state.dna.propKind, (v) => {
    state = setPropKind(state, v as typeof state.dna.propKind);
    syncUiFromState();
    rebuildPreview();
  });
  renderChips(materialChips, PROP_CREATOR_MATERIALS, state.dna.material, (v) => {
    state = setMaterial(state, v as typeof state.dna.material);
    syncUiFromState();
    rebuildPreview();
  });
  renderChips(themeChips, PROP_CREATOR_THEMES, state.dna.theme, (v) => {
    state = setTheme(state, v as typeof state.dna.theme);
    syncUiFromState();
  });
  renderChips(conditionChips, PROP_CREATOR_CONDITIONS, state.dna.condition, (v) => {
    state = setCondition(state, v as typeof state.dna.condition);
    syncUiFromState();
    rebuildPreview();
  });
  renderChips(interactionChips, INTERACTION_TYPES, state.interactionType, (v) => {
    state = setInteractionType(state, v as PropInteractionType);
    syncUiFromState();
  });

  sizeSlider.value          = String(state.dna.size);
  glowToggle.checked        = state.dna.glow;
  glowIntensitySlider.value = String(state.dna.glowIntensity);
  nameInput.value           = state.dna.name;
  for (const [slot, input] of Object.entries(colorInputs)) {
    const value = (state.dna.colors as any)[slot];
    if (value) input.value = value;
  }
}

// ── Wiring ────────────────────────────────────────────────────────────────────

sizeSlider.addEventListener('input', () => {
  state = setSize(state, Number(sizeSlider.value));
  rebuildPreview();
});

glowToggle.addEventListener('change', () => {
  state = setGlow(state, glowToggle.checked);
  rebuildPreview();
});

glowIntensitySlider.addEventListener('input', () => {
  state = setGlowIntensity(state, Number(glowIntensitySlider.value));
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
    id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
  console.log('[PropCreator] saved to library:', payload.name);
});

// ── Gallery ───────────────────────────────────────────────────────────────────

function renderGallery(): void {
  const entries = assetLibrary.getByType('prop');
  galleryListEl.innerHTML = '';
  if (entries.length === 0) {
    galleryListEl.textContent = 'No saved props yet.';
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
