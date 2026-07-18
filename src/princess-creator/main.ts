// ── Princess Atelier bootstrap ───────────────────────────────────────────────
//
//  Wires store ⇄ stage ⇄ synths ⇄ animator ⇄ UI. First load lands on a
//  curated daily princess so the pedestal is never empty (preset-first UX).

import * as THREE from 'three';
import type { Archetype, PrincessDNA } from './types';
import { ARCHETYPES } from './types';
import { defaultDna, dnaToShareCode, shareCodeToDna, cloneDna } from './dna';
import { mulberry32, hashString, freshSeed, pick } from './rng';
import { randomDna, mutateDna } from './randomize';
import { generateName } from './names';
import { PALETTES } from './palettes';
import { DnaStore } from './store';
import { Stage } from './scene';
import { createMaterialKit, type MaterialKit } from './materials';
import { composePrincess } from './compose';
import type { BuildResult } from './synth/contracts';
import { Animator, EMOTES, type EmoteId } from './animate';
import { Ui } from './ui';
import { exportPng, exportGlb, exportJson } from './exporter';
import { loadGallery, addToGallery, removeFromGallery } from './gallery';

// ── Daily curated starter ──
function starterDna(): PrincessDNA {
  const day = new Date().toISOString().slice(0, 10);
  const rng = mulberry32(hashString(`atelier:${day}`));
  const archetype = pick(rng, ARCHETYPES);
  const dna = defaultDna(archetype);
  dna.name = generateName(rng, archetype);
  dna.seed = hashString(day);
  return dna;
}

const canvas = document.getElementById('stage-canvas') as HTMLCanvasElement;
const stage = new Stage(canvas);
const store = new DnaStore(starterDna());
const animator = new Animator();
animator.onCastBurst = () => stage.castBurst();

let kit: MaterialKit = createMaterialKit(store.dna);
let result: BuildResult = composePrincess(store.dna, kit);
stage.scene.add(result.root);
stage.setArchetypeMood(store.dna.archetype);
animator.bind(result, store.dna);

function rebuild(dna: PrincessDNA, archetypeChanged: boolean): void {
  stage.scene.remove(result.root);
  result.dispose();
  if (archetypeChanged) {
    kit.dispose();
    kit = createMaterialKit(dna);
    stage.setArchetypeMood(dna.archetype);
    stage.frame();
  } else {
    kit.apply(dna);
  }
  result = composePrincess(dna, kit);
  stage.scene.add(result.root);
  animator.bind(result, dna);
}

// ── UI actions ──
const ui = new Ui(store, {
  randomize: () => store.setDna(randomDna(store.dna.archetype, freshSeed())),
  mutate: () => store.setDna(mutateDna(store.dna, freshSeed())),
  rollName: () => {
    const rng = mulberry32(freshSeed());
    store.set('name', generateName(rng, store.dna.archetype));
  },
  setArchetype: (a: Archetype) => {
    if (a === store.dna.archetype) return;
    const cur = store.dna;
    const next = defaultDna(a);
    // Carry the player's tuning of shared traits across archetypes; colors
    // reset to the archetype's canonical palette so each card lands looking
    // its best (UX_SPEC §1) — a palette click brings any look back.
    next.name = cur.name;
    next.seed = cur.seed;
    next.body = { ...cur.body };
    next.motion.energy = cur.motion.energy;
    next.motion.bounce = cur.motion.bounce;
    store.setDna(next);
  },
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
  exportPng: () => exportPng(stage, store.dna),
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
  playEmote: (id: EmoteId) => animator.playEmote(id),
  toggleWalk: () => {
    animator.setWalking(!animator.isWalking);
    return animator.isWalking;
  },
  undo: () => store.undo(),
  redo: () => store.redo(),
  applyPalette: (archetype: Archetype, paletteId: string) => {
    const pal = PALETTES[archetype].find((p) => p.id === paletteId);
    if (!pal) return;
    const dna = cloneDna(store.dna);
    dna.colors = { ...pal.colors };
    store.setDna(dna);
  },
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
    animator.playEmote(EMOTES[Math.floor(Math.random() * EMOTES.length)]);
  } else if (e.key.toLowerCase() === 'w') {
    animator.setWalking(!animator.isWalking);
    ui.setWalkActive(animator.isWalking);
  } else if (e.key.toLowerCase() === 'r') {
    stage.frame();
  } else if (['1', '2', '3', '4'].includes(e.key)) {
    const a = ARCHETYPES[parseInt(e.key, 10) - 1];
    const card = document.querySelector<HTMLButtonElement>(`.arch-card[data-arch="${a}"]`);
    card?.click();
  }
});

canvas.addEventListener('dblclick', () => stage.focusFace());

// ── Main loop ──
const clock = new THREE.Clock();
function loop(): void {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  animator.update(t);
  result.update(t, dt);
  stage.update(t, dt);
  stage.render();
}
loop();
