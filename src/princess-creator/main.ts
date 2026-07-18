// ── Princess Atelier bootstrap ───────────────────────────────────────────────
//
//  Wires store ⇄ stage ⇄ synths ⇄ animator ⇄ UI. First load lands on a
//  curated daily princess so the pedestal is never empty (preset-first UX).

import * as THREE from 'three';
import type { PrincessDNA, SpeciesId, ClassId } from './types';
import { SPECIES_IDS } from './types';
import { defaultDna, dnaToShareCode, shareCodeToDna, dnaFromRaw, cloneDna } from './dna';
import { mulberry32, hashString, freshSeed, pick } from './rng';
import { randomDna, mutateDna } from './randomize';
import { generateName } from './names';
import { PALETTES, CLASS_DEFS } from './species';
import { DnaStore } from './store';
import { Stage } from './scene';
import { createMaterialKit, type MaterialKit } from './materials';
import { composePrincess } from './compose';
import type { BuildResult } from './synth/contracts';
import { Animator } from './animate';
import { ANIM_IDS, type AnimId } from './anim/clips';
import {
  tweaksFor, setTweak, clearTweaks, buildAnimationExport, importAnimationExport,
} from './anim/tweaks';
import { DirectManipulator } from './interact';
import { Ui } from './ui';
import { exportPng, exportGlb, exportJson, downloadBlob } from './exporter';
import { extractFromImageFile } from './stegano';
import { loadGallery, addToGallery, removeFromGallery } from './gallery';

// ── Daily curated starter ──
function starterDna(): PrincessDNA {
  const day = new Date().toISOString().slice(0, 10);
  const rng = mulberry32(hashString(`atelier:${day}`));
  const species = pick(rng, SPECIES_IDS);
  const dna = defaultDna(species);
  dna.name = generateName(rng, dna.archetype);
  dna.seed = hashString(day);
  return dna;
}

const canvas = document.getElementById('stage-canvas') as HTMLCanvasElement;
const stage = new Stage(canvas);
const store = new DnaStore(starterDna());
const animator = new Animator();
animator.onCastBurst = () => stage.castBurst();

const manipulator = new DirectManipulator(stage, store);

let kit: MaterialKit = createMaterialKit(store.dna);
let result: BuildResult = composePrincess(store.dna, kit);
stage.scene.add(result.root);
stage.setArchetypeMood(store.dna.archetype);
animator.bind(result, store.dna, tweaksFor(store.dna.species));
manipulator.bind(result);

let lastSpecies = store.dna.species;
stage.frame(store.dna.body.height);

function rebuild(dna: PrincessDNA, archetypeChanged: boolean): void {
  stage.scene.remove(result.root);
  result.dispose();
  const speciesChanged = dna.species !== lastSpecies;
  lastSpecies = dna.species;
  // Kits carry species-specific material tech (specter transparency, naiad
  // clearcoat, moonborn hair glow…) — rebuild on ANY species change, not just
  // body-tech swaps, so nothing leaks between same-synth species.
  if (archetypeChanged || speciesChanged) {
    kit.dispose();
    kit = createMaterialKit(dna);
    if (archetypeChanged) stage.setArchetypeMood(dna.archetype);
  } else {
    kit.apply(dna);
  }
  if (speciesChanged) stage.frame(dna.body.height);
  result = composePrincess(dna, kit);
  stage.scene.add(result.root);
  animator.bind(result, dna, tweaksFor(dna.species));
  manipulator.bind(result);
  // Clip labels/speeds are species-flavored (lamia Slither, slime Melt…).
  if (speciesChanged) ui.refreshAnimPanel();
}

// ── UI actions ──
const ui = new Ui(store, {
  randomize: () => store.setDna(randomDna(store.dna.species, freshSeed())),
  mutate: () => store.setDna(mutateDna(store.dna, freshSeed())),
  rollName: () => {
    const rng = mulberry32(freshSeed());
    store.set('name', generateName(rng, store.dna.archetype));
  },
  setSpecies: (s: SpeciesId) => {
    if (s === store.dna.species) return;
    const cur = store.dna;
    const next = defaultDna(s);
    // Species switch = identity change: land on the species' canonical look
    // (proportion presets included). Carry the persistent bits: her name,
    // seed, and chosen class vocabulary (reapplied on the new body).
    next.name = cur.name;
    next.seed = cur.seed;
    if (cur.pclass !== 'none') CLASS_DEFS[cur.pclass].apply(next);
    store.setDna(next);
  },
  setClass: (c: ClassId) => {
    const next = cloneDna(store.dna);
    if (c === 'none') {
      // Back to the species' pure look for outfit fields the classes touch.
      const fresh = defaultDna(next.species);
      next.dress = fresh.dress;
      next.parts.glasses = fresh.parts.glasses;
      next.parts.handL = fresh.parts.handL;
      next.parts.back = fresh.parts.back;
    }
    CLASS_DEFS[c].apply(next);
    store.setDna(next);
  },
  setSubtype: (id: string) => store.set('subtype', id),
  copyCode: () => {
    const code = dnaToShareCode(store.dna);
    void navigator.clipboard?.writeText(code).catch(() => {
      const field = document.getElementById('share-code') as HTMLInputElement;
      field.select();
      document.execCommand('copy');
    });
  },
  importCode: (code: string) => {
    const dna = shareCodeToDna(code);
    if (!dna) return false;
    store.setDna(dna);
    return true;
  },
  exportPng: () => { void exportPng(stage, store.dna); },
  exportGlb: () => { void exportGlb(result, store.dna); },
  exportJson: () => exportJson(store.dna),
  saveToGallery: () => {
    const thumb = stage.snapshot(128, true);
    ui.setGallery(addToGallery({
      name: store.dna.name,
      code: dnaToShareCode(store.dna),
      thumb,
    }));
  },
  loadGalleryEntry: (id: string) => {
    const entry = loadGallery().find((e) => e.id === id);
    if (!entry) return;
    const dna = shareCodeToDna(entry.code);
    if (dna) store.setDna(dna);
  },
  deleteGalleryEntry: (id: string) => ui.setGallery(removeFromGallery(id)),
  listClips: () => {
    const set = animator.clips;
    return ANIM_IDS.map((id) => ({
      id,
      label: set?.[id].label ?? id,
      group: set?.[id].group ?? 'misc',
      loop: set?.[id].loop ?? false,
    }));
  },
  playClip: (id: AnimId) => animator.play(id),
  setAnimState: (id: AnimId) => animator.setState(id),
  getAnimState: () => animator.stateId,
  getTweak: (id: AnimId) => {
    const t = tweaksFor(store.dna.species)[id];
    return { speed: t?.speed ?? 1, amp: t?.amp ?? 1 };
  },
  setTweakValue: (id: AnimId, patch: { speed?: number; amp?: number }) => {
    setTweak(store.dna.species, id, patch);
    animator.bind(result, store.dna, tweaksFor(store.dna.species));
  },
  resetTweak: (id: AnimId) => {
    clearTweaks(store.dna.species, id);
    animator.bind(result, store.dna, tweaksFor(store.dna.species));
  },
  exportAnims: () => {
    const blob = new Blob(
      [JSON.stringify(buildAnimationExport())],
      { type: 'application/json' },
    );
    downloadBlob(blob, 'princess-animations.anim.json');
  },
  undo: () => store.undo(),
  redo: () => store.redo(),
  applyPalette: (species: SpeciesId, paletteId: string) => {
    const pal = PALETTES[species].find((p) => p.id === paletteId);
    if (!pal) return;
    const dna = cloneDna(store.dna);
    dna.colors = { ...pal.colors };
    store.setDna(dna);
  },
  startPaintDrag: (hex: string) => manipulator.startPaintDrag(hex),
});

ui.setGallery(loadGallery());
ui.setShareCode(dnaToShareCode(store.dna));

store.subscribe((ev) => {
  if (ev.structural) {
    rebuild(ev.dna, ev.archetypeChanged);
  } else {
    kit.apply(ev.dna);
  }
  if (ev.archetypeChanged) ui.onArchetypeChanged();
  ui.sync(ev.dna);
  ui.setShareCode(dnaToShareCode(ev.dna));
});

// ── Keyboard ──
window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
  } else if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    const thumb = stage.snapshot(128, true);
    ui.setGallery(addToGallery({ name: store.dna.name, code: dnaToShareCode(store.dna), thumb }));
  } else if (e.key === ' ') {
    e.preventDefault();
    const set = animator.clips;
    if (set) {
      const shots = ANIM_IDS.filter((id) => !set[id].loop);
      animator.play(shots[Math.floor(Math.random() * shots.length)]);
    }
  } else if (e.key.toLowerCase() === 'w') {
    animator.setWalking(!animator.isWalking);
    ui.setAnimActive(animator.stateId);
  } else if (e.key.toLowerCase() === 'r') {
    stage.frame();
  } else if (/^[1-9]$/.test(e.key)) {
    const s = SPECIES_IDS[parseInt(e.key, 10) - 1];
    if (s) {
      const card = document.querySelector<HTMLButtonElement>(`.arch-card[data-species="${s}"]`);
      card?.click();
    }
  }
});

canvas.addEventListener('dblclick', () => stage.focusFace());

// ── Drop a portrait (or .princess.json) anywhere → load the princess ────────
function importFeedback(ok: boolean): void {
  const field = document.getElementById('import-code') as HTMLInputElement;
  if (ok) return;
  field.classList.remove('shake');
  void field.offsetWidth;
  field.classList.add('shake');
}

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  void (async () => {
    if (file.type === 'image/png' || file.name.endsWith('.png')) {
      const code = await extractFromImageFile(file);
      const dna = code ? shareCodeToDna(code) : null;
      if (dna) store.setDna(dna);
      importFeedback(dna !== null);
    } else if (file.name.endsWith('.json')) {
      try {
        const parsed: unknown = JSON.parse(await file.text());
        if ((parsed as { format?: string } | null)?.format === 'ttt-princess-anim') {
          // Animation library drop → restore the saved tweaks.
          const ok = importAnimationExport(parsed);
          if (ok) {
            animator.bind(result, store.dna, tweaksFor(store.dna.species));
            ui.refreshAnimPanel();
          }
          importFeedback(ok);
        } else {
          store.setDna(dnaFromRaw(parsed)); // runs v1→v2 migration + sanitize
          importFeedback(true);
        }
      } catch {
        importFeedback(false);
      }
    }
  })();
});

// ── Main loop ──
const clock = new THREE.Clock();
function loop(): void {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  animator.update(t);
  result.update(t, dt);
  manipulator.update(t);
  stage.update(t, dt);
  stage.render();
}
loop();

// Dev/e2e handle (not part of the public surface).
(window as unknown as Record<string, unknown>).__atelier = {
  store,
  stage,
  manipulator,
  animator,
  buildAnimationExport,
  dnaToShareCode,
  shareCodeToDna,
  stegano: { embed: import('./stegano') },
  get result() { return result; },
};
