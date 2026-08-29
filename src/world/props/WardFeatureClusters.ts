/**
 * WardFeatureClusters.ts — Phase 2a of the settlement visual fidelity plan
 * (docs/superpowers/plans/2026-08-29-settlement-visual-fidelity.md §4.0a).
 *
 * A ward whose type has no BuildingKind mapping (WARD_TO_KIND[type] is
 * falsy — currently only 'park') gets a non-building "feature cluster"
 * here instead of rendering nothing. Each faction's park-ward feature is a
 * genuinely different *kind of place* — not a palette-swapped copy of a
 * shared shape — matching the per-faction ward names already defined in
 * `overworld-studio.ts`'s FACTION_WARD_NAMES table:
 *
 *   human    -> Village Green   (well, benches, shade tree)
 *   elven    -> Sacred Grove    (tree ring, standing stone, firefly motes)
 *   dwarven  -> Mushroom Hall   (giant stone-toned mushroom cluster, benches)
 *   orcish   -> Pit Arena       (sunken pit, log benches, bone totem)
 *   vampire  -> Moon Courtyard  (ornate fountain, hedge walls)
 *   undead   -> Graveyard       (tombstone scatter, mausoleum, broken fence)
 *   vulperia -> Burrow Commons  (burrow-mound cluster, totem post)
 *   slime    -> Slime Pool      (translucent pool, blob mounds, bubbles)
 *   fae      -> Enchanted Glade (giant glowing mushroom ring, fae-ring torus, lantern motes)
 *
 * Follows BuildingBuilder.ts's applyStyleOverlay() convention: a seeded
 * mulberry32 RNG, THREE.Mesh primitives composed into a THREE.Group,
 * MeshStandardMaterial, castShadow = true. No interior/collider semantics
 * — these are decorative, walkable-around clutter, not buildings.
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { Faction } from '../buildings/BuildingDNA';

export type WardFeatureBuilder = (seed: number) => THREE.Group;

// ── Shared helpers ────────────────────────────────────────────────────────────

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
}

function addMesh(group: THREE.Group, geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, ry = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** Small glowing point-sprite used for firefly/lantern/bubble motes. */
function addMote(group: THREE.Group, color: number, x: number, y: number, z: number, r = 0.06): void {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(r, 6, 6),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.4 }),
  );
  mesh.position.set(x, y, z);
  group.add(mesh);
}

// ── Per-faction builders ──────────────────────────────────────────────────────

/** human — Village Green: a well, a shade tree, a couple of benches. */
function buildVillageGreen(seed: number): THREE.Group {
  const r = mulberry32(seed ^ 0x5645_4747);
  const group = new THREE.Group();

  // Stone well.
  const wellMat = mat(0x8a8a80);
  addMesh(group, new THREE.CylinderGeometry(0.9, 1.0, 0.7, 12), wellMat, 0, 0.35, 0);
  const roofMat = mat(0x6a4030);
  addMesh(group, new THREE.ConeGeometry(1.15, 0.6, 8), roofMat, 0, 1.05, 0);
  for (let i = 0; i < 2; i++) {
    const ang = i * Math.PI;
    addMesh(group, new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), mat(0x4a3020),
      Math.cos(ang) * 0.9, 0.9, Math.sin(ang) * 0.9);
  }

  // Shade tree.
  const trunk = mat(0x5a3d24);
  addMesh(group, new THREE.CylinderGeometry(0.22, 0.3, 2.4, 8), trunk, 2.4, 1.2, 1.6);
  const canopy = mat(0x4a7a3a);
  addMesh(group, new THREE.SphereGeometry(1.5, 10, 8), canopy, 2.4, 3.0, 1.6);

  // Benches.
  const benchMat = mat(0x7a5a3a);
  for (let i = 0; i < 2; i++) {
    const ang = r() * Math.PI * 2;
    const dist = 2.4 + r() * 0.6;
    addMesh(group, new THREE.BoxGeometry(1.1, 0.45, 0.4), benchMat,
      Math.cos(ang) * dist, 0.22, Math.sin(ang) * dist, ang);
  }
  return group;
}

/** elven — Sacred Grove: a ring of trees around a standing stone, firefly motes. */
function buildSacredGrove(seed: number): THREE.Group {
  const r = mulberry32(seed ^ 0xE1FE_0001);
  const group = new THREE.Group();

  const stoneMat = mat(0xa8a8b8, { roughness: 0.6 });
  addMesh(group, new THREE.CylinderGeometry(0.35, 0.5, 2.0, 6), stoneMat, 0, 1.0, 0, r() * Math.PI);

  const trunkMat = mat(0x4a6a3a);
  const canopyMat = mat(0x6aa85a, { roughness: 0.7 });
  const ringCount = 6;
  for (let i = 0; i < ringCount; i++) {
    const ang = (i / ringCount) * Math.PI * 2 + r() * 0.2;
    const dist = 2.6 + r() * 0.4;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    const h = 3.0 + r() * 1.0;
    addMesh(group, new THREE.CylinderGeometry(0.18, 0.26, h, 7), trunkMat, x, h / 2, z);
    addMesh(group, new THREE.SphereGeometry(1.1 + r() * 0.3, 8, 7), canopyMat, x, h + 0.6, z);
  }

  for (let i = 0; i < 10; i++) {
    const ang = r() * Math.PI * 2;
    const dist = r() * 2.2;
    addMote(group, 0xbfffa0, Math.cos(ang) * dist, 0.4 + r() * 1.6, Math.sin(ang) * dist, 0.045);
  }
  return group;
}

/** dwarven — Mushroom Hall: giant stone-toned mushroom cluster, stone benches. */
function buildMushroomHall(seed: number): THREE.Group {
  const r = mulberry32(seed ^ 0xD4A5_0002);
  const group = new THREE.Group();

  const stemMat = mat(0xc8b89a);
  const capMat  = mat(0x8a6858, { roughness: 0.7 });
  const count = 5;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + r() * 0.4;
    const dist = r() * 2.0;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    const h = 1.2 + r() * 1.6;
    const capR = 0.7 + r() * 0.6;
    addMesh(group, new THREE.CylinderGeometry(0.25, 0.35, h, 8), stemMat, x, h / 2, z);
    addMesh(group, new THREE.SphereGeometry(capR, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat, x, h, z);
  }

  const benchMat = mat(0x5a5a5a, { roughness: 0.6 });
  for (let i = 0; i < 3; i++) {
    const ang = r() * Math.PI * 2;
    addMesh(group, new THREE.CylinderGeometry(0.5, 0.5, 0.4, 8), benchMat,
      Math.cos(ang) * 2.8, 0.2, Math.sin(ang) * 2.8);
  }
  return group;
}

/** orcish — Pit Arena: a sunken ring, log benches, a bone totem in the middle. */
function buildPitArena(seed: number): THREE.Group {
  const r = mulberry32(seed ^ 0x0Bc1_0003);
  const group = new THREE.Group();

  const dirtMat = mat(0x5a4530, { roughness: 1 });
  addMesh(group, new THREE.CylinderGeometry(2.6, 2.6, 0.15, 16), dirtMat, 0, -0.3, 0);
  const rimMat = mat(0x3a2a1a);
  addMesh(group, new THREE.TorusGeometry(2.6, 0.2, 6, 16), rimMat, 0, -0.1, 0, 0);

  const boneMat = mat(0xd8d0b8, { roughness: 0.5 });
  addMesh(group, new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), boneMat, 0, 1.3, 0);
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    addMesh(group, new THREE.ConeGeometry(0.25, 0.5, 6), boneMat, Math.cos(ang) * 0.3, 2.6, Math.sin(ang) * 0.3, ang);
  }

  const logMat = mat(0x4a3320);
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 + r() * 0.3;
    addMesh(group, new THREE.CylinderGeometry(0.22, 0.22, 1.3, 7), logMat,
      Math.cos(ang) * 3.2, -0.05, Math.sin(ang) * 3.2, Math.PI / 2 + ang);
  }
  return group;
}

/** vampire — Moon Courtyard: an ornate fountain ringed by dark hedge walls. */
function buildMoonCourtyard(seed: number): THREE.Group {
  const r = mulberry32(seed ^ 0x4004_0004);
  const group = new THREE.Group();

  const basinMat = mat(0x30283a, { roughness: 0.4, metalness: 0.2 });
  addMesh(group, new THREE.CylinderGeometry(1.3, 1.4, 0.5, 16), basinMat, 0, 0.25, 0);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x3a4a6a, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 });
  addMesh(group, new THREE.CylinderGeometry(1.15, 1.15, 0.06, 16), waterMat, 0, 0.53, 0);
  const spireMat = mat(0x50485a, { metalness: 0.3, roughness: 0.4 });
  addMesh(group, new THREE.CylinderGeometry(0.12, 0.2, 1.4, 8), spireMat, 0, 1.2, 0);
  addMesh(group, new THREE.SphereGeometry(0.22, 8, 8), spireMat, 0, 2.0, 0);

  const hedgeMat = mat(0x1e2a1e, { roughness: 0.9 });
  const hedgeCount = 8;
  for (let i = 0; i < hedgeCount; i++) {
    const ang = (i / hedgeCount) * Math.PI * 2;
    const gapAt = r() < 0.13; // occasional gap for an entrance
    if (gapAt) continue;
    addMesh(group, new THREE.BoxGeometry(1.4, 1.1, 0.4), hedgeMat,
      Math.cos(ang) * 3.0, 0.55, Math.sin(ang) * 3.0, ang + Math.PI / 2);
  }
  return group;
}

/** undead — Graveyard: scattered tombstones, a mausoleum, a broken fence. */
function buildGraveyard(seed: number): THREE.Group {
  const r = mulberry32(seed ^ 0x6EAD_0005);
  const group = new THREE.Group();

  const stoneMat = mat(0x7a7a72, { roughness: 0.8 });
  addMesh(group, new THREE.BoxGeometry(1.6, 1.8, 1.6), stoneMat, -1.8, 0.9, -1.8);
  addMesh(group, new THREE.ConeGeometry(1.2, 0.9, 4), mat(0x60605a), -1.8, 2.25, -1.8, Math.PI / 4);

  const tombMat = mat(0x8a8a80, { roughness: 0.9 });
  for (let i = 0; i < 8; i++) {
    const ang = r() * Math.PI * 2;
    const dist = 1.0 + r() * 2.4;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    const h = 0.6 + r() * 0.4;
    const tilt = (r() - 0.5) * 0.3;
    addMesh(group, new THREE.BoxGeometry(0.5, h, 0.12), tombMat, x, h / 2, z, r() * Math.PI).rotation.z = tilt;
  }

  const fenceMat = mat(0x2a2420);
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    if (r() < 0.3) continue; // broken section — gap
    addMesh(group, new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5), fenceMat,
      Math.cos(ang) * 3.6, 0.45, Math.sin(ang) * 3.6);
  }
  return group;
}

/** vulperia — Burrow Commons: a cluster of earthen burrow-mounds and a totem post. */
function buildBurrowCommons(seed: number): THREE.Group {
  const r = mulberry32(seed ^ 0xF0A9_0006);
  const group = new THREE.Group();

  const moundMat = mat(0x8a6a42, { roughness: 1 });
  const holeMat  = mat(0x100a06);
  for (let i = 0; i < 4; i++) {
    const ang = r() * Math.PI * 2;
    const dist = r() * 2.2;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    const size = 0.8 + r() * 0.5;
    addMesh(group, new THREE.SphereGeometry(size, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), moundMat, x, size * 0.35, z);
    addMesh(group, new THREE.CylinderGeometry(size * 0.35, size * 0.4, 0.15, 10), holeMat, x, size * 0.5, z);
  }

  const totemMat = mat(0x6a4a2a);
  addMesh(group, new THREE.CylinderGeometry(0.15, 0.2, 2.6, 6), totemMat, 0, 1.3, 0);
  const carvingMat = mat(0xd8b878);
  for (let i = 0; i < 3; i++) {
    addMesh(group, new THREE.BoxGeometry(0.4, 0.35, 0.4), carvingMat, 0, 0.6 + i * 0.7, 0.18);
  }
  return group;
}

/** slime — Slime Pool: a translucent pool ringed by blob mounds, rising bubbles. */
function buildSlimePool(seed: number): THREE.Group {
  const r = mulberry32(seed ^ 0x517E_0007);
  const group = new THREE.Group();

  const poolMat = new THREE.MeshStandardMaterial({
    color: 0x5adf8a, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.75, emissive: 0x1a5a2a, emissiveIntensity: 0.3,
  });
  addMesh(group, new THREE.CylinderGeometry(2.2, 2.4, 0.35, 20), poolMat, 0, 0.18, 0);
  const rimMat = mat(0x3a6a4a, { roughness: 0.9 });
  addMesh(group, new THREE.TorusGeometry(2.3, 0.18, 8, 20), rimMat, 0, 0.05, 0);

  const blobMat = mat(0x6ad89a, { roughness: 0.3, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + r() * 0.4;
    const dist = 2.9 + r() * 0.6;
    const s = 0.4 + r() * 0.35;
    addMesh(group, new THREE.SphereGeometry(s, 8, 7), blobMat, Math.cos(ang) * dist, s * 0.8, Math.sin(ang) * dist);
  }

  for (let i = 0; i < 8; i++) {
    const ang = r() * Math.PI * 2;
    const dist = r() * 1.8;
    addMote(group, 0x9affc0, Math.cos(ang) * dist, 0.4 + r() * 0.8, Math.sin(ang) * dist, 0.05);
  }
  return group;
}

/** fae — Enchanted Glade: a glowing giant-mushroom ring around a fae-ring torus, lantern motes. */
function buildEnchantedGlade(seed: number): THREE.Group {
  const r = mulberry32(seed ^ 0xFAE0_0008);
  const group = new THREE.Group();

  const ringMat = new THREE.MeshStandardMaterial({ color: 0xd0a8f0, emissive: 0x8050b0, emissiveIntensity: 0.5, roughness: 0.4 });
  addMesh(group, new THREE.TorusGeometry(1.6, 0.15, 8, 24), ringMat, 0, 0.15, 0, 0).rotation.x = Math.PI / 2;

  const stemMat = mat(0xe8e0f0, { roughness: 0.4 });
  const capMat  = new THREE.MeshStandardMaterial({ color: 0xb070d8, emissive: 0x6030a0, emissiveIntensity: 0.6, roughness: 0.3 });
  const count = 6;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + r() * 0.3;
    const dist = 2.4 + r() * 0.5;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    const h = 0.9 + r() * 0.7;
    const capR = 0.35 + r() * 0.25;
    addMesh(group, new THREE.CylinderGeometry(0.08, 0.12, h, 6), stemMat, x, h / 2, z);
    addMesh(group, new THREE.SphereGeometry(capR, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat, x, h, z);
  }

  for (let i = 0; i < 12; i++) {
    const ang = r() * Math.PI * 2;
    const dist = r() * 2.6;
    addMote(group, 0xffe8a0, Math.cos(ang) * dist, 0.5 + r() * 1.8, Math.sin(ang) * dist, 0.05);
  }
  return group;
}

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Maps a runtime `Faction` (see BuildingDNA.ts) to its park-ward feature
 * builder. Only the 9 factions reachable from
 * `mapStudioFactionToRuntimeFaction()` have entries; anything else falls
 * back to the human Village Green in `buildParkFeature()`.
 */
const PARK_FEATURE_BUILDERS: Partial<Record<Faction, WardFeatureBuilder>> = {
  human_town:    buildVillageGreen,
  human_rural:   buildVillageGreen,
  human_noble:   buildVillageGreen,
  elven:         buildSacredGrove,
  dwarven:       buildMushroomHall,
  orcish:        buildPitArena,
  vampire:       buildMoonCourtyard,
  undead_common: buildGraveyard,
  vulperia:      buildBurrowCommons,
  slime:         buildSlimePool,
  fae:           buildEnchantedGlade,
};

/** Build the park-ward feature cluster for the given faction/seed. Always
 *  returns a non-empty group (falls back to Village Green for any faction
 *  without a dedicated builder, e.g. draconic/celestial). */
export function buildParkFeature(faction: Faction, seed: number): THREE.Group {
  const builder = PARK_FEATURE_BUILDERS[faction] ?? buildVillageGreen;
  return builder(seed);
}
