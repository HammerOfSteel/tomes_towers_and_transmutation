/**
 * main.ts — npc-creator.html entry point
 *
 * DOM wiring layer for the standalone NPC Creator surface. All actual state
 * logic lives in `creatorState.ts` (fully unit-tested, zero DOM deps) — this
 * file just:
 *   1. Renders chips/pickers from NPC_CREATOR_SPECIES / NPC_CREATOR_ROLES
 *   2. Wires input events to the creatorState setters
 *   3. Calls buildNpc(dna) for the live Three.js preview on every change
 *   4. Wires Save → creatorState.saveToGallery + renders the gallery list
 *
 * Debug flags exposed on window:
 *   window.__npcCreatorReady   — true once first preview has rendered
 *   window.__npcCreatorDna     — current NpcDNA snapshot (for e2e tests)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  createInitialState, setSpecies, setRole, setPersonality, setBodyPreset,
  setName, setColor, rerollDialogue, saveToGallery,
  NPC_CREATOR_SPECIES, NPC_CREATOR_ROLES,
  type NpcCreatorState,
} from './creatorState';
import type { NpcPersonality } from './types';
import { buildNpc, type NpcInstance } from './builder';
import { loadNpcGallery, removeFromNpcGallery, type NpcGalleryEntry } from './gallery';

const PERSONALITIES: readonly NpcPersonality[] = ['friendly', 'wary', 'eccentric', 'formal', 'cheerful'];

// ── DOM refs ──────────────────────────────────────────────────────────────────

const canvas       = document.getElementById('nc-canvas') as HTMLCanvasElement;
const statusEl      = document.getElementById('status') as HTMLDivElement;
const nameInput      = document.getElementById('name-input') as HTMLInputElement;
const speciesChips   = document.getElementById('species-chips')!;
const roleChips      = document.getElementById('role-chips')!;
const personalityChips = document.getElementById('personality-chips')!;
const bodyChips      = document.getElementById('body-chips')!;
const galleryListEl  = document.getElementById('gallery-list')!;

const colorInputs: Record<string, HTMLInputElement> = {
  primary:   document.getElementById('color-primary')   as HTMLInputElement,
  secondary: document.getElementById('color-secondary') as HTMLInputElement,
  skin:      document.getElementById('color-skin')      as HTMLInputElement,
  hair:      document.getElementById('color-hair')      as HTMLInputElement,
  eyes:      document.getElementById('color-eyes')      as HTMLInputElement,
};

// ── Three.js scene ────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x161126);
scene.fog = new THREE.Fog(0x161126, 12, 40);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(2.5, 3.2, 6.5);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.4, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2.5;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.52;

scene.add(new THREE.AmbientLight(0x8880a0, 0.55));
const key = new THREE.DirectionalLight(0xfff2d8, 1.0);
key.position.set(4, 6, 3);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight(0x8090ff, 0.35);
rim.position.set(-4, 3, -4);
scene.add(rim);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(6, 48),
  new THREE.MeshStandardMaterial({ color: 0x2a2144, roughness: 0.9 }),
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

let state: NpcCreatorState = createInitialState('human', 'merchant', Date.now() >>> 0);
let currentInstance: NpcInstance | null = null;
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
    const inst = await buildNpc(state.dna);
    if (token !== rebuildToken) { inst.dispose(); return; } // stale — a newer rebuild started
    if (currentInstance) {
      scene.remove(currentInstance.root);
      currentInstance.dispose();
    }
    currentInstance = inst;
    scene.add(inst.root);
    showStatus(null);
    (window as any).__npcCreatorReady = true;
    (window as any).__npcCreatorDna = state.dna;
  } catch (e) {
    console.error('[NpcCreator] buildNpc failed:', e);
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
  renderChips(speciesChips, NPC_CREATOR_SPECIES, state.dna.species, (v) => {
    state = setSpecies(state, v as typeof state.dna.species);
    syncUiFromState();
    void rebuildPreview();
  });
  renderChips(roleChips, NPC_CREATOR_ROLES, state.dna.role, (v) => {
    state = setRole(state, v as typeof state.dna.role);
    syncUiFromState();
    void rebuildPreview();
  });
  renderChips(personalityChips, PERSONALITIES, state.dna.personality, (v) => {
    state = setPersonality(state, v as NpcPersonality);
    syncUiFromState();
  });

  bodyChips.querySelectorAll<HTMLButtonElement>('.chip').forEach(btn => {
    const preset = Number(btn.dataset.preset);
    btn.classList.toggle('active', preset === state.dna.bodyPreset);
  });

  nameInput.value = state.dna.name;
  for (const [slot, input] of Object.entries(colorInputs)) {
    input.value = (state.dna.colors as any)[slot];
  }
}

// ── Wiring ────────────────────────────────────────────────────────────────────

bodyChips.querySelectorAll<HTMLButtonElement>('.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = Number(btn.dataset.preset) as 0 | 1 | 2;
    state = setBodyPreset(state, preset);
    syncUiFromState();
    void rebuildPreview();
  });
});

nameInput.addEventListener('input', () => {
  state = setName(state, nameInput.value);
});

for (const [slot, input] of Object.entries(colorInputs)) {
  input.addEventListener('input', () => {
    state = setColor(state, slot as keyof typeof state.dna.colors, input.value);
    void rebuildPreview();
  });
}

document.getElementById('btn-reroll-dialogue')?.addEventListener('click', () => {
  state = rerollDialogue(state);
  (window as any).__npcCreatorDna = state.dna;
});

document.getElementById('btn-save')?.addEventListener('click', () => {
  const entry = saveToGallery(state);
  renderGallery();
  console.log('[NpcCreator] saved to gallery:', entry.name);
});

// ── Gallery ───────────────────────────────────────────────────────────────────

function renderGallery(): void {
  const entries = loadNpcGallery();
  galleryListEl.innerHTML = '';
  if (entries.length === 0) {
    galleryListEl.textContent = 'No saved NPCs yet.';
    return;
  }
  for (const entry of entries as NpcGalleryEntry[]) {
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
      removeFromNpcGallery(entry.id);
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