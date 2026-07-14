// ── creature-lab.ts ──────────────────────────────────────────────────────────
//
//  Standalone Three.js geometry debug viewer.
//  Served by Vite dev server at /creature-lab.html.
//
//  Exposes window.__lab API used by tests/e2e/creature-visual.test.ts
//  No Rapier dependency — creatures only.

import * as THREE from 'three';
import { buildCreature }         from '@/creatures/CreatureBuilder';
import { animateCreature }       from '@/creatures/CreatureAnimator';
import { dnaForArchetype } from '@/creatures/CreatureDNA';
import type { CreatureDNA, Archetype, OutfitTopId, OutfitLegsId, OutfitOverId } from '@/creatures/CreatureDNA';
import type { CreatureRig }      from '@/creatures/CreatureBuilder';
import type { AnimState }        from '@/creatures/CreatureAnimator';

// ── Scene setup ───────────────────────────────────────────────────────────────

const canvas   = document.getElementById('lab-canvas') as HTMLCanvasElement;
const labelsEl = document.getElementById('arch-labels') as HTMLElement;
const modeEl   = document.getElementById('mode-label')  as HTMLElement;
const stateEl  = document.getElementById('hud-state')   as HTMLElement;
const angleEl  = document.getElementById('hud-angle')   as HTMLElement;

const W = window.innerWidth, H = window.innerHeight;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x0d0b18);
renderer.shadowMap.enabled = false;

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);

// Default camera: sees a row of 5 creatures with ground clearly visible
camera.position.set(0, 2.8, 11);
camera.lookAt(0, 1.0, 0);

// ── Lighting ─────────────────────────────────────────────────────────────────

scene.add(new THREE.AmbientLight(0xffe8d0, 0.65));
const key = new THREE.DirectionalLight(0xfff0e0, 1.2);
key.position.set(4, 8, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0x8060ff, 0.4);
rim.position.set(-4, 3, -3);
scene.add(rim);

// ── Reference geometry ────────────────────────────────────────────────────────

// Grid at y=0 (1 unit spacing) — reference for ground level
const grid = new THREE.GridHelper(20, 20, 0x3a2a6a, 0x1e164a);
grid.position.y = 0;
scene.add(grid);

// Bright ground-level line (y=0 plane edge highlight)
{
  const lineMat = new THREE.LineBasicMaterial({ color: 0xff4444 });
  const pts = [new THREE.Vector3(-10, 0, 0), new THREE.Vector3(10, 0, 0)];
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
}

// Y-height reference ruler on the left side: ticks at 0, 0.5, 1.0, 1.5, 2.0
function makeRuler(xPos: number): THREE.Group {
  const g = new THREE.Group();
  // Vertical line
  g.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.5, 0)]),
    new THREE.LineBasicMaterial({ color: 0x888888 }),
  ));
  const TICKS: [number, number][] = [[0, 0xff4444], [0.5, 0x888888], [1.0, 0x44ff44], [1.5, 0x888888], [2.0, 0xffff44]];
  for (const [y, col] of TICKS) {
    const half = y === 0 || y === 1.0 || y === 2.0 ? 0.25 : 0.15;
    g.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-half, y, 0), new THREE.Vector3(half, y, 0)]),
      new THREE.LineBasicMaterial({ color: col }),
    ));
  }
  g.position.x = xPos;
  return g;
}
scene.add(makeRuler(-6));
scene.add(makeRuler(6));

// Faint horizontal planes at y=1.0 and y=2.0 for spatial reference
for (const [y, col, op] of [[1.0, 0x22aa22, 0.10], [2.0, 0xaaaa22, 0.08]] as [number, number, number][]) {
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = y;
  scene.add(plane);
}

// ── State ─────────────────────────────────────────────────────────────────────

const ARCHETYPES: Archetype[] = ['biped', 'quadruped', 'avian', 'serpent', 'amoeba'];
const SPACING = 2.4;

let rigs:      CreatureRig[] = [];
let labels:    string[]      = [];
let rotY       = 0;
let animState: AnimState     = 'idle';
let freeze     = false;  // when true, rotation stopped (for clean screenshots)

// ── Creature helpers ──────────────────────────────────────────────────────────

function clearScene(): void {
  for (const r of rigs) { scene.remove(r.root); r.dispose(); }
  rigs   = [];
  labels = [];
  labelsEl.innerHTML = '';
}

function addCreature(dna: CreatureDNA, xPos: number, label: string): void {
  const rig = buildCreature(dna);
  rig.root.position.set(xPos, 0, 0);
  scene.add(rig.root);

  // For non-biped archetypes only: use bounding box to ensure the creature
  // doesn't float above the ground (biped is designed to sink slightly into
  // the floor — that's the in-game physics convention).
  if (dna.archetype !== 'biped') {
    rig.root.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    rig.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) box.union(new THREE.Box3().setFromObject(obj));
    });
    if (!box.isEmpty() && isFinite(box.min.y) && box.min.y < -0.05) {
      rig.root.position.y = -box.min.y;
    }
  }

  rigs.push(rig);
  labels.push(label);

  const el = document.createElement('div');
  el.className = 'arch-label';
  el.textContent = label;
  labelsEl.appendChild(el);
}

// ── Layout modes ──────────────────────────────────────────────────────────────

function showAll(): void {
  clearScene();
  const startX = -((ARCHETYPES.length - 1) / 2) * SPACING;
  for (let i = 0; i < ARCHETYPES.length; i++) {
    const arch = ARCHETYPES[i];
    addCreature(dnaForArchetype(arch), startX + i * SPACING, arch);
  }
  camera.position.set(0, 2.8, 11);
  camera.lookAt(0, 1.0, 0);
  modeEl.textContent = 'All archetypes';
}

function showSingle(dna: CreatureDNA, label: string): void {
  clearScene();
  addCreature(dna, 0, label);
  camera.position.set(0, 1.8, 5.5);
  camera.lookAt(0, 1.0, 0);
  modeEl.textContent = label;
}

/** Show biped with all leg clothing options side by side */
function showLegOutfits(): void {
  clearScene();
  const options: OutfitLegsId[] = ['none', 'trousers', 'skirt', 'shorts', 'loincloth', 'robe_skirt'];
  const startX = -((options.length - 1) / 2) * SPACING;
  for (let i = 0; i < options.length; i++) {
    const dna = dnaForArchetype('biped');
    dna.outfit.legs = options[i];
    addCreature(dna, startX + i * SPACING, `legs:${options[i]}`);
  }
  camera.position.set(0, 2.2, 14);
  camera.lookAt(0, 1.0, 0);
  modeEl.textContent = 'Biped: leg clothing comparison';
}

/** Show biped with all top clothing options */
function showTopOutfits(): void {
  clearScene();
  const options: OutfitTopId[] = ['none', 'tunic', 'robe_top', 'armor_chest', 'wrap'];
  const startX = -((options.length - 1) / 2) * SPACING;
  for (let i = 0; i < options.length; i++) {
    const dna = dnaForArchetype('biped');
    dna.outfit.top = options[i];
    addCreature(dna, startX + i * SPACING, `top:${options[i]}`);
  }
  camera.position.set(0, 2.2, 12);
  camera.lookAt(0, 1.0, 0);
  modeEl.textContent = 'Biped: top clothing comparison';
}

/** Show biped with all over-clothing options */
function showOverOutfits(): void {
  clearScene();
  const options: OutfitOverId[] = ['none', 'robe_full', 'cape', 'cloak'];
  const startX = -((options.length - 1) / 2) * SPACING;
  for (let i = 0; i < options.length; i++) {
    const dna = dnaForArchetype('biped');
    dna.outfit.over = options[i];
    addCreature(dna, startX + i * SPACING, `over:${options[i]}`);
  }
  camera.position.set(0, 2.2, 10);
  camera.lookAt(0, 1.0, 0);
  modeEl.textContent = 'Biped: over-clothing comparison';
}

/** Show biped with morph extremes */
function showMorphs(): void {
  clearScene();
  const configs: Array<[string, Partial<CreatureDNA['proportions']>]> = [
    ['default', {}],
    ['wide_sh', { shoulderWidth: 2.0 }],
    ['wide_hip', { hipWidth: 2.0 }],
    ['big_belly', { bellySize: 1.5 }],
    ['thick_neck', { neckThickness: 1.8 }],
  ];
  const startX = -((configs.length - 1) / 2) * SPACING;
  for (let i = 0; i < configs.length; i++) {
    const [label, overrides] = configs[i];
    const dna = dnaForArchetype('biped');
    Object.assign(dna.proportions, overrides);
    addCreature(dna, startX + i * SPACING, label);
  }
  camera.position.set(0, 2.5, 12);
  camera.lookAt(0, 1.0, 0);
  modeEl.textContent = 'Biped: proportion morphs';
}

// ── Animation loop ────────────────────────────────────────────────────────────

let tOverride: number | null = null;  // null = use real time; number = frozen time

function tick(): void {
  requestAnimationFrame(tick);
  const t = tOverride ?? (performance.now() * 0.001);

  for (const rig of rigs) {
    if (!freeze) rig.root.rotation.y = rotY + (tOverride ?? performance.now() * 0.001) * 0.3;
    else         rig.root.rotation.y = rotY;
    animateCreature(rig, { state: animState, time: t });
  }
  renderer.render(scene, camera);
}

// ── window.__lab API ──────────────────────────────────────────────────────────

(window as any).__lab = {
  /** Show all 5 archetypes side by side */
  showAll,

  /** Show a single creature from an archetype string or full DNA object */
  showCreature(dnaOrArch: CreatureDNA | Archetype, label?: string): void {
    if (typeof dnaOrArch === 'string') {
      showSingle(dnaForArchetype(dnaOrArch), label ?? dnaOrArch);
    } else {
      showSingle(dnaOrArch, label ?? dnaOrArch.archetype);
    }
  },

  showLegOutfits,
  showTopOutfits,
  showOverOutfits,
  showMorphs,

  /** Rotate all creatures to a fixed Y angle (degrees) and stop auto-rotate */
  setAngle(deg: number): void {
    rotY = (deg * Math.PI) / 180;
    freeze = true;
    angleEl.textContent = `Angle: ${deg}°`;
  },

  /** Resume auto-rotation */
  resumeRotation(): void {
    freeze = false;
    angleEl.textContent = 'Angle: auto';
  },

  /** Set animation state for all creatures */
  setAnimState(state: AnimState): void {
    animState = state;
    stateEl.textContent = `State: ${state}`;
  },

  /** Build creature from DNA JSON passed as a plain object (from Playwright evaluate) */
  showFromJson(dnaJson: string | object, label?: string): void {
    const dna = typeof dnaJson === 'string' ? JSON.parse(dnaJson) as CreatureDNA : dnaJson as CreatureDNA;
    showSingle(dna, label ?? dna.archetype);
  },

  /** Narrow the camera to focus on creatures within a Z offset */
  setCamera(x: number, y: number, z: number, lookAtY = 1.0): void {
    camera.position.set(x, y, z);
    camera.lookAt(0, lookAtY, 0);
  },

  /** Return info about current rigs for test assertions */
  getRigInfo() {
    return rigs.map((r, i) => ({
      label:  labels[i] ?? '',
      posX:   r.root.position.x,
      posY:   r.root.position.y,
      boneKeys: Object.keys(r.bones).filter(k => (r.bones as Record<string, unknown>)[k] != null),
    }));
  },

  /**
   * Freeze animation at a specific time in seconds.
   * All subsequent renders will use this fixed time until thawTime() is called.
   * Useful in Playwright tests for capturing consistent animation frames.
   */
  freezeAt(t: number): void {
    tOverride = t;
    freeze = true;
    // Render one frame at this time so the canvas updates immediately
    for (const rig of rigs) {
      rig.root.rotation.y = rotY;
      animateCreature(rig, { state: animState, time: t });
    }
    renderer.render(scene, camera);
  },

  /** Resume live animation (undo freezeAt). */
  thawTime(): void {
    tOverride = null;
    freeze = false;
  },

  /** Snapshot helper for Playwright: returns canvas data URL */
  snapshot(): string {
    renderer.render(scene, camera);
    return canvas.toDataURL('image/png');
  },
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────

showAll();
tick();
