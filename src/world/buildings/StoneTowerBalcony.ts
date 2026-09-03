/**
 * StoneTowerBalcony.ts — optional top-floor projecting gallery for the
 * elven stone-tower kit (docs/superpowers/specs/
 * 2026-09-03-elven-stone-tower-features-design.md): a seeded ~40%
 * chance per tower, independent of silhouette profile, giving a
 * "watch-post" reading distinct from a tiered profile's own stepping.
 *
 * Built as a genuinely OPEN crow's-nest: corbel brackets (protruding
 * from the wall) support a projecting deck, topped by an open
 * balustrade of individual vertical rib posts with real visible gaps
 * between them (plus thin top/bottom rail bands connecting the ribs)
 * -- matching the reference tabletop-kit image's open gallery you
 * could actually stand in and see through, not a solid closed drum
 * (the original implementation's flaw, flagged directly against the
 * reference).
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
 * (a slightly-larger-radius short cylinder "collar"), and an OPEN
 * balustrade -- individual vertical rib posts with visible gaps
 * between them, joined by a thin bottom kick-rail and a thin top
 * hand-rail band -- rather than one solid parapet shell.
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

  // Open balustrade: individual rib posts around the circumference
  // (real gaps between them, unlike a closed cylindrical shell), plus
  // thin top/bottom rail bands so the ribs read as one connected
  // railing structure rather than a loose picket fence.
  const parapetHeight = deckRadius * 0.35;
  const railThickness = deckRadius * 0.035;
  const ribCount = 10 + Math.floor(rand() * 4); // 10-13, denser than the corbel spacing
  const ribRadius = deckRadius * 0.97;
  for (let i = 0; i < ribCount; i++) {
    const ang = (i / ribCount) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(railThickness, parapetHeight, railThickness), palette.stone);
    rib.position.set(Math.sin(ang) * ribRadius, deckHeight + parapetHeight / 2, Math.cos(ang) * ribRadius);
    rib.rotation.y = ang;
    rib.castShadow = rib.receiveShadow = true;
    g.add(rib);
  }

  const bottomRail = new THREE.Mesh(
    new THREE.CylinderGeometry(ribRadius, ribRadius, railThickness * 1.4, 8, 1, true),
    palette.stone,
  );
  bottomRail.position.y = deckHeight + railThickness * 0.7;
  bottomRail.castShadow = bottomRail.receiveShadow = true;
  g.add(bottomRail);

  const topRail = new THREE.Mesh(
    new THREE.CylinderGeometry(ribRadius, ribRadius, railThickness * 1.4, 8, 1, true),
    palette.stone,
  );
  topRail.position.y = deckHeight + parapetHeight - railThickness * 0.7;
  topRail.castShadow = topRail.receiveShadow = true;
  g.add(topRail);

  return g;
}
