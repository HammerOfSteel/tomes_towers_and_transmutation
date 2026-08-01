/**
 * main.ts — tile-creator.html entry point
 *
 * DOM wiring layer for the standalone Tile Creator surface (TV-3 in
 * tile-designer.md). All state logic lives in `tileCreatorState.ts` (zero
 * DOM deps, unit-tested) — this file:
 *   1. Renders chips for category/biome/variant (variant list updates
 *      reactively when biome changes, per TILE_VARIANTS[biome])
 *   2. Wires sliders/color picker/seed input to the creatorState setters
 *   3. Calls buildTile(dna) for the live Three.js preview on every change
 *      (synchronous — pure primitive geometry, no async imports needed)
 *   4. Supports toggling between isometric and top-down camera angles
 *   5. Supports "Generate Variations" — seeds N sibling DNAs, renders
 *      colour swatches, lets the user adopt one
 *   6. Wires Save → AssetLibrary type=tile via toLibraryPayload()
 *
 * Debug flags exposed on window:
 *   window.__tileCreatorReady — true once first preview has rendered
 *   window.__tileCreatorDna   — current TileDNA snapshot (for e2e tests)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  createInitialTileState, setBiome, setVariant, setCategory, setSize, setRoughness,
  setColorOverride, clearColorOverride, setSeed, currentColor,
  generateVariationSeeds, adoptVariation, toLibraryPayload,
  TILE_CREATOR_CATEGORIES, TILE_CREATOR_BIOMES, variantsForBiome,
  type TileCreatorState,
} from '@/procedural/tileCreatorState';
import { buildTile, type BuiltTile } from '@/procedural/TileBuilder';
import type { TileDNA } from '@/procedural/TileDNA';
import { AssetLibrary } from '@/overworld-studio/AssetLibrary';

const assetLibrary = new AssetLibrary();

// ── DOM refs ──────────────────────────────────────────────────────────────────

const canvas              = document.getElementById('tc-canvas') as HTMLCanvasElement;
const statusEl            = document.getElementById('status') as HTMLDivElement;
const nameInput           = document.getElementById('name-input') as HTMLInputElement;
const categoryChips       = document.getElementById('category-chips')!;
const biomeChips          = document.getElementById('biome-chips')!;
const variantChips        = document.getElementById('variant-chips')!;
const sizeSlider          = document.getElementById('size-slider') as HTMLInputElement;
const roughnessSlider     = document.getElementById('roughness-slider') as HTMLInputElement;
const colorOverrideInput  = document.getElementById('color-override') as HTMLInputElement;
const btnClearColor       = document.getElementById('btn-clear-color') as HTMLButtonElement;
const seedInput           = document.getElementById('seed-input') as HTMLInputElement;
const btnReroll           = document.getElementById('btn-reroll') as HTMLButtonElement;
const btnGenerateVariations = document.getElementById('btn-generate-variations') as HTMLButtonElement;
const variationsListEl    = document.getElementById('variations-list')!;
const galleryListEl       = document.getElementById('gallery-list')!;
const btnCamIso           = document.getElementById('btn-cam-iso') as HTMLButtonElement;
const btnCamTop           = document.getElementById('btn-cam-top') as HTMLButtonElement;

// ── Three.js scene ────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12100f);
scene.fog = new THREE.Fog(0x12100f, 8, 30);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);

const ISO_POSITION: [number, number, number] = [2.6, 2.4, 2.6];
const TOP_POSITION: [number, number, number] = [0, 4.4, 0.001];

function setCameraAngle(mode: 'iso' | 'top'): void {
  const pos = mode === 'iso' ? ISO_POSITION : TOP_POSITION;
  camera.position.set(...pos);
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
  controls.update();
  btnCamIso.classList.toggle('active', mode === 'iso');
  btnCamTop.classList.toggle('active', mode === 'top');
}

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1;
controls.maxDistance = 10;

scene.add(new THREE.AmbientLight(0x90a0a8, 0.6));
const key = new THREE.DirectionalLight(0xfff0d8, 1.0);
key.position.set(3, 5, 2);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight(0x80c0ff, 0.25);
rim.position.set(-3, 2, -3);
scene.add(rim);

function resize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
setCameraAngle('iso');

btnCamIso.addEventListener('click', () => setCameraAngle('iso'));
btnCamTop.addEventListener('click', () => setCameraAngle('top'));

// ── State ─────────────────────────────────────────────────────────────────────

let state: TileCreatorState = createInitialTileState('grassland', 'lush', Date.now() >>> 0);
let currentInstance: BuiltTile | null = null;
let currentVariations: TileDNA[] = [];

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
    const inst = buildTile(state.dna);
    currentInstance = inst;
    scene.add(inst.root);
    (window as any).__tileCreatorReady = true;
    (window as any).__tileCreatorDna = state.dna;
  } catch (e) {
    console.error('[TileCreator] buildTile failed:', e);
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
  renderChips(categoryChips, TILE_CREATOR_CATEGORIES, state.dna.category, (v) => {
    state = setCategory(state, v as typeof state.dna.category);
    syncUiFromState();
    rebuildPreview();
  });
  renderChips(biomeChips, TILE_CREATOR_BIOMES, state.dna.biome, (v) => {
    state = setBiome(state, v as typeof state.dna.biome);
    syncUiFromState();
    rebuildPreview();
  });
  renderChips(variantChips, variantsForBiome(state.dna.biome), state.dna.variant, (v) => {
    state = setVariant(state, v);
    syncUiFromState();
    rebuildPreview();
  });

  sizeSlider.value      = String(state.dna.size);
  roughnessSlider.value = String(state.dna.roughness ?? 0.85);
  seedInput.value       = String(state.dna.seed);
  colorOverrideInput.value = currentColor(state);
  nameInput.value       = `${state.dna.biome} ${state.dna.variant}`.replace(/_/g, ' ');
}

// ── Wiring ────────────────────────────────────────────────────────────────────

sizeSlider.addEventListener('input', () => {
  state = setSize(state, Number(sizeSlider.value));
  rebuildPreview();
});

roughnessSlider.addEventListener('input', () => {
  state = setRoughness(state, Number(roughnessSlider.value));
  rebuildPreview();
});

colorOverrideInput.addEventListener('input', () => {
  state = setColorOverride(state, colorOverrideInput.value);
  rebuildPreview();
});

btnClearColor.addEventListener('click', () => {
  state = clearColorOverride(state);
  syncUiFromState();
  rebuildPreview();
});

seedInput.addEventListener('change', () => {
  const seed = Number(seedInput.value);
  if (Number.isFinite(seed)) {
    state = setSeed(state, seed >>> 0);
    rebuildPreview();
  }
});

btnReroll.addEventListener('click', () => {
  state = setSeed(state, Date.now() >>> 0);
  syncUiFromState();
  rebuildPreview();
});

document.getElementById('btn-save')?.addEventListener('click', () => {
  const payload = toLibraryPayload(state);
  assetLibrary.add({
    id: `tile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
  console.log('[TileCreator] saved to library:', payload.name);
});

// ── Generate Variations ────────────────────────────────────────────────────────

function renderVariations(): void {
  variationsListEl.innerHTML = '';
  for (const dna of currentVariations) {
    const swatch = document.createElement('button');
    swatch.className = 'variation-swatch';
    swatch.title = `seed ${dna.seed}`;
    swatch.style.background = currentColor({ dna, hasColorOverride: !!dna.colorOverride });
    swatch.addEventListener('click', () => {
      state = adoptVariation(state, dna);
      syncUiFromState();
      rebuildPreview();
    });
    variationsListEl.appendChild(swatch);
  }
}

btnGenerateVariations.addEventListener('click', () => {
  currentVariations = generateVariationSeeds(state, 6, Date.now() >>> 0);
  renderVariations();
});

// ── Gallery ───────────────────────────────────────────────────────────────────

function renderGallery(): void {
  const entries = assetLibrary.getByType('tile');
  galleryListEl.innerHTML = '';
  if (entries.length === 0) {
    galleryListEl.textContent = 'No saved tiles yet.';
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
