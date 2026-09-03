/**
 * StoneTowerBalcony.ts — optional top-floor projecting gallery for the
 * elven stone-tower kit (docs/superpowers/specs/
 * 2026-09-03-elven-stone-tower-features-design.md): a seeded ~40%
 * chance per tower, independent of silhouette profile, giving a
 * "watch-post" reading distinct from a tiered profile's own stepping.
 * Built from 3 cheap primitives (corbel brackets, a projecting deck,
 * a low parapet) rather than full per-course block geometry -- a
 * balcony is a small accent feature, not a primary wall surface, so
 * this keeps its triangle cost low regardless of which wall strategy
 * the tower's main shaft uses.
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { StoneTowerPalette } from './StoneTowerKit';

const BALCONY_CHANCE = 0.4;

/** Deterministic seeded ~40% chance of a tower having a balcony. */
export function shouldHaveBalcony(seed: number): boolean {
  const rand = mulberry32((seed ^ 0x42414C43) >>> 0); // 'BALC'-ish tag
  return rand() < BALCONY_CHANCE;
}

/**
 * Builds a complete balcony band: a ring of corbel brackets
 * (cone wedges, apex pointing down/inward, matching real corbelling)
 * protruding from the wall at `radius`, a thin projecting deck
 * (a slightly-larger-radius short cylinder "collar"), and a low
 * parapet wall ring at the collar's outer radius.
 */
export function buildBalcony(seed: number, radius: number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  const rand = mulberry32(seed ^ 0x0BA1C04E);

  const deckRadius = radius * 1.35;
  const deckHeight = 0.12;
  const corbelCount = 8 + Math.floor(rand() * 5); // 8-12

  for (let i = 0; i < corbelCount; i++) {
    const ang = (i / corbelCount) * Math.PI * 2 + rand() * 0.1;
    const corbelLen = deckRadius - radius;
    const corbel = new THREE.Mesh(new THREE.ConeGeometry(corbelLen * 0.35, corbelLen, 4), palette.stone);
    const midR = (radius + deckRadius) / 2;
    corbel.position.set(Math.sin(ang) * midR, -corbelLen * 0.15, Math.cos(ang) * midR);
    corbel.rotation.x = Math.PI / 2;
    corbel.rotation.z = ang;
    corbel.castShadow = corbel.receiveShadow = true;
    g.add(corbel);
  }

  const deck = new THREE.Mesh(new THREE.CylinderGeometry(deckRadius, deckRadius * 0.98, deckHeight, 8), palette.stone);
  deck.position.y = deckHeight / 2;
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);

  const parapetHeight = deckRadius * 0.35;
  const parapet = new THREE.Mesh(
    new THREE.CylinderGeometry(deckRadius * 0.97, deckRadius * 0.97, parapetHeight, 8, 1, true),
    palette.stone,
  );
  parapet.position.y = deckHeight + parapetHeight / 2;
  parapet.castShadow = parapet.receiveShadow = true;
  g.add(parapet);

  return g;
}
