/**
 * PrincessDefaults.ts — PC1: 4 pre-built princess DNA templates, one per
 * playable game species. Seeds the gallery on first launch if empty.
 *
 * Usage:
 *   import { DEFAULT_PRINCESSES, seedGalleryIfEmpty } from '@/princess-creator/defaults/PrincessDefaults';
 *   seedGalleryIfEmpty();   // call once at app start
 */

import type { PrincessDNA } from '@/princess-creator/types';
import { addToGallery, loadGallery } from '@/princess-creator/gallery';
import { dnaToShareCode } from '@/princess-creator/dna';

// ── Human — "Amelie the Mage" ─────────────────────────────────────────────────
const HUMAN: PrincessDNA = {
  v: 2, name: 'Amelie', seed: 1001, species: 'human', archetype: 'human',
  pclass: 'mage', subtype: '',
  aura: { style: 'warm', intensity: 0.6 },
  body: { height: 1, headSize: 1.05, chubbiness: 0.9, armLength: 1, legLength: 1, shoulderWidth: 0.95, hipWidth: 1 },
  dress: { style: 'bell', flare: 1.1, length: 1, trim: true, sash: true, puffSleeves: true },
  face: { eyeStyle: 'sparkle', eyeSize: 1.1, eyeSpacing: 1, eyeTilt: 0.08, blush: 0.45, mouth: 'smile' },
  hair: { style: 'long', length: 1.15 },
  parts: {
    crown: 'tiara', crownTilt: 0, crownSize: 1, ears: 'none', earSize: 1,
    tail: 'none', tailSize: 1, back: 'bow', backSize: 1,
    handL: 'staff', handR: 'none', handSize: 1, glasses: false,
  },
  colors: {
    primary: '#5b3fa8', secondary: '#c8a0f0', tertiary: '#f5e8ff',
    skin: '#f7d5b8', hair: '#4a2c6e', eyes: '#8b5cf6',
    outline: '#1a0a2e', aura: '#f0c040',
  },
  traits: { snoutLength: 1, fluff: 1, wobble: 0.5, translucency: 0.6, coreGlow: 0.35, boneThickness: 1, eyeGlowIntensity: 1 },
  motion: { energy: 0.6, bounce: 0.5, idleStyle: 'sway' },
};

// ── Undead — "Mortica the Lich" ───────────────────────────────────────────────
const UNDEAD: PrincessDNA = {
  v: 2, name: 'Mortica', seed: 2001, species: 'skeleton', archetype: 'skeleton',
  pclass: 'mage', subtype: '',
  aura: { style: 'cold', intensity: 0.75 },
  body: { height: 1, headSize: 0.95, chubbiness: 0.7, armLength: 1.1, legLength: 1.05, shoulderWidth: 0.9, hipWidth: 0.85 },
  dress: { style: 'slim', flare: 0.8, length: 1.1, trim: false, sash: false, puffSleeves: false },
  face: { eyeStyle: 'void', eyeSize: 1.15, eyeSpacing: 1.05, eyeTilt: -0.05, blush: 0, mouth: 'none' },
  hair: { style: 'none', length: 1 },
  parts: {
    crown: 'tiara', crownTilt: 0, crownSize: 0.9, ears: 'none', earSize: 1,
    tail: 'none', tailSize: 1, back: 'none', backSize: 1,
    handL: 'none', handR: 'staff', handSize: 1, glasses: false,
  },
  colors: {
    primary: '#1a1a2e', secondary: '#0d6e6e', tertiary: '#7af3f3',
    skin: '#c8c8c8', hair: '#1a1a2e', eyes: '#00ffcc',
    outline: '#000000', aura: '#00ccff',
  },
  traits: { snoutLength: 1, fluff: 1, wobble: 0.3, translucency: 0.4, coreGlow: 0.8, boneThickness: 0.85, eyeGlowIntensity: 1.4 },
  motion: { energy: 0.4, bounce: 0.3, idleStyle: 'float' },
};

// ── Foxling — "Maribel the Scout" ─────────────────────────────────────────────
const FOXLING: PrincessDNA = {
  v: 2, name: 'Maribel', seed: 3001, species: 'foxling', archetype: 'fox',
  pclass: 'none', subtype: '',
  aura: { style: 'ember', intensity: 0.5 },
  body: { height: 1, headSize: 1.05, chubbiness: 0.95, armLength: 1, legLength: 1.05, shoulderWidth: 0.9, hipWidth: 1.05 },
  dress: { style: 'aline', flare: 1, length: 0.85, trim: true, sash: true, puffSleeves: false },
  face: { eyeStyle: 'lash', eyeSize: 1.1, eyeSpacing: 0.95, eyeTilt: 0.06, blush: 0.55, mouth: 'cat' },
  hair: { style: 'ponytail', length: 1 },
  parts: {
    crown: 'none', crownTilt: 0, crownSize: 1, ears: 'fox', earSize: 1.2,
    tail: 'fluffy', tailSize: 1.1, back: 'none', backSize: 1,
    handL: 'none', handR: 'none', handSize: 1, glasses: false,
  },
  colors: {
    primary: '#d97706', secondary: '#fde68a', tertiary: '#fff7ed',
    skin: '#f5c5a3', hair: '#92400e', eyes: '#b45309',
    outline: '#451a03', aura: '#f97316',
  },
  traits: { snoutLength: 1.15, fluff: 1.4, wobble: 0.6, translucency: 0.5, coreGlow: 0.25, boneThickness: 1, eyeGlowIntensity: 0.8 },
  motion: { energy: 0.8, bounce: 0.7, idleStyle: 'bob' },
};

// ── Slime — "Blobette" ────────────────────────────────────────────────────────
const SLIME: PrincessDNA = {
  v: 2, name: 'Blobette', seed: 4001, species: 'slime', archetype: 'slime',
  pclass: 'none', subtype: '',
  aura: { style: 'bubbles', intensity: 0.65 },
  body: { height: 1, headSize: 1.2, chubbiness: 1.3, armLength: 0.9, legLength: 0.85, shoulderWidth: 1.1, hipWidth: 1.15 },
  dress: { style: 'hex', flare: 1.2, length: 1, trim: false, sash: false, puffSleeves: false },
  face: { eyeStyle: 'star', eyeSize: 1.3, eyeSpacing: 1.05, eyeTilt: 0.1, blush: 0.7, mouth: 'open' },
  hair: { style: 'none', length: 1 },
  parts: {
    crown: 'none', crownTilt: 0, crownSize: 1, ears: 'none', earSize: 1,
    tail: 'none', tailSize: 1, back: 'none', backSize: 1,
    handL: 'none', handR: 'none', handSize: 1, glasses: false,
  },
  colors: {
    primary: '#22c55e', secondary: '#86efac', tertiary: '#f0fdf4',
    skin: '#bbf7d0', hair: '#22c55e', eyes: '#16a34a',
    outline: '#052e16', aura: '#4ade80',
  },
  traits: { snoutLength: 1, fluff: 1, wobble: 1, translucency: 0.85, coreGlow: 0.5, boneThickness: 1, eyeGlowIntensity: 1 },
  motion: { energy: 0.65, bounce: 0.9, idleStyle: 'bob' },
};

export const DEFAULT_PRINCESSES: readonly PrincessDNA[] = [HUMAN, UNDEAD, FOXLING, SLIME];

/** Map from princess species → game species ID (for abilities/story/talents). */
export const PRINCESS_SPECIES_MAP: Record<string, 'human' | 'undead' | 'vulperia' | 'slime'> = {
  human: 'human', elf: 'human', high_elf: 'human', celestial: 'human',
  pixie: 'human', gnome: 'human', goblin: 'human', draconic: 'human',
  fae: 'human', ignis: 'human', naiad: 'human', moonborn: 'human', verdant: 'human',
  foxling: 'vulperia', orc: 'vulperia', troll: 'vulperia', lamia: 'vulperia',
  specter: 'undead', undead: 'undead', skeleton: 'undead',
  slime: 'slime',
};

/**
 * Seed the gallery with DEFAULT_PRINCESSES on first launch (if gallery is empty).
 * Safe to call multiple times — only seeds once.
 */
export function seedGalleryIfEmpty(): void {
  if (loadGallery().length > 0) return;
  for (const dna of DEFAULT_PRINCESSES) {
    addToGallery({
      name: dna.name,
      code: dnaToShareCode(dna),
      thumb: '',   // no thumbnail on defaults — generated lazily in gallery UI
    });
  }
}
