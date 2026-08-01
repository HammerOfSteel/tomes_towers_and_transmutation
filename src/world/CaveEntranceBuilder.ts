/**
 * CaveEntranceBuilder.ts — 02-game-world-integration (CG-1)
 *
 * Procedural cave entrance prop builder — a rock arch / hillside opening,
 * styled per `CaveEntranceBiome` (CG-1's 5 spec variants: crystal, lava,
 * ice, fungal, ancient). Same flat-primitive, no-texture-GLB style as
 * `DungeonEntranceBuilder.ts` / `BuildingBuilder.ts`.
 */

import * as THREE from 'three';
import type { CaveEntranceBiome } from './CaveGladePlacer';

/** World-unit radius for the "[E] Enter Cave" interaction trigger. */
export const CAVE_ENTRANCE_TRIGGER_RADIUS = 2;

interface CaveBiomeStyle {
  rock: string;
  accent: string;
  /** Whether the accent material should glow (crystal/lava): emissive intensity > 0. */
  emissive: number;
}

const CAVE_BIOME_STYLES: Record<CaveEntranceBiome, CaveBiomeStyle> = {
  crystal: { rock: '#4a4858', accent: '#88e0ff', emissive: 0.9 },
  lava:    { rock: '#2a1810', accent: '#ff5522', emissive: 1.0 },
  ice:     { rock: '#c8d8e8', accent: '#e8f4ff', emissive: 0.0 },
  fungal:  { rock: '#3a3828', accent: '#78c850', emissive: 0.3 },
  ancient: { rock: '#605850', accent: '#a89868', emissive: 0.0 },
};

export interface BuiltCaveEntrance {
  /** Three.js root group — add to scene with `scene.add(entrance.root)`. */
  root: THREE.Group;
  /** Release GPU resources. */
  dispose(): void;
}

/**
 * CG-1 — build a procedural cave entrance prop (rock arch around a dark
 * opening, styled per biome variant). Deterministic aside from THREE.js
 * object allocation — no randomness, fixed geometry per biome.
 */
export function buildCaveEntrance(biome: CaveEntranceBiome): BuiltCaveEntrance {
  const style = CAVE_BIOME_STYLES[biome];
  const root = new THREE.Group();
  root.userData['caveEntranceBiome'] = biome;

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const rockMat = new THREE.MeshStandardMaterial({ color: style.rock, roughness: 1 });
  materials.push(rockMat);
  const accentMat = new THREE.MeshStandardMaterial({
    color: style.accent, roughness: 0.4,
    emissive: style.emissive > 0 ? new THREE.Color(style.accent) : new THREE.Color(0x000000),
    emissiveIntensity: style.emissive,
  });
  materials.push(accentMat);
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
  materials.push(darkMat);

  // Irregular rocky hillside mound around the opening.
  const mound = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 1), rockMat);
  geometries.push(mound.geometry);
  mound.position.set(0, 1.2, -1.2);
  mound.scale.set(1.4, 1, 1);

  // Dark opening.
  const opening = new THREE.Mesh(new THREE.CircleGeometry(1.3, 16), darkMat);
  geometries.push(opening.geometry);
  opening.position.set(0, 1.3, 0.1);

  // Biome-flavour accent chunks flanking the opening (crystal shards, embers, ice, moss, carved stone).
  const accentGeo = biome === 'ice' ? new THREE.ConeGeometry(0.3, 1, 5) : new THREE.OctahedronGeometry(0.4, 0);
  const leftAccent = new THREE.Mesh(accentGeo.clone(), accentMat);
  geometries.push(leftAccent.geometry);
  leftAccent.position.set(-1.5, 0.8, 0.4);
  const rightAccent = new THREE.Mesh(accentGeo.clone(), accentMat);
  geometries.push(rightAccent.geometry);
  rightAccent.position.set(1.5, 0.9, 0.4);
  accentGeo.dispose(); // the un-cloned prototype geometry isn't used directly

  root.add(mound, opening, leftAccent, rightAccent);

  return {
    root,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

/** CG-1 — is a world-space (x, z) position within the cave entrance's interaction trigger radius? */
export function isNearCaveEntrance(
  position: { x: number; z: number },
  entrancePosition: { x: number; z: number },
  radius: number = CAVE_ENTRANCE_TRIGGER_RADIUS,
): boolean {
  return Math.hypot(position.x - entrancePosition.x, position.z - entrancePosition.z) <= radius;
}
