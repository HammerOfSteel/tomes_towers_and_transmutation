/**
 * ElvenTreehouseKit.ts — the elven living-tree home (house/terraced/
 * villa/inn/blacksmith), built on the same real block-course + carved-
 * opening construction technique as the elven stone-tower kit (docs/
 * superpowers/specs/2026-09-03-elven-treehouse-tower-kit-rebuild.md),
 * per direct user feedback replacing the prior round's BlockKit
 * voxel-occupancy approach: "we dont go with that old block design...
 * more in style with the tower for building the structure."
 *
 * Reuses `StoneTowerKit.ts`'s `buildTowerKitCore()` (base + N wall
 * rings + roof cap, extracted specifically to make this reuse
 * possible) with a wood/bark palette and `buildLivingRoofCap()` always
 * as the roof (never the tower's own classic/pagoda/living random
 * dispatch — a residential tree home should always end in a living
 * canopy). Everything else (wall rings with carved windows and vine/
 * moss/banner props, quoins, the base's root-tendril decoration and
 * carved entrance, the optional open-gallery balcony) is the SAME
 * exported tower-kit machinery, unmodified.
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { BuildingDNA } from './BuildingDNA';
import { getFootprint, FLOOR_HEIGHT } from './BuildingDNA';
import { barkTexture } from './FactionBlockTextures';
import { buildTowerKitCore, type StoneTowerPalette } from './StoneTowerKit';
import { buildLivingRoofCap } from './StoneTowerRoofCap';

function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...opts });
}

/**
 * Public entry point: builds a complete elven living-tree home for the
 * given `BuildingDNA` (dispatched from FactionBuildingVariants.ts's
 * elven `house`/`terraced`/`villa`/`inn`/`blacksmith` override).
 *
 * Unlike `buildElvenStoneTower()` (a fixed-tall 3-6-floor archetype
 * regardless of `dna.floors`), this respects `dna.floors` exactly --
 * a residential building's height should match whatever the settlement
 * generator actually assigned it (typically 1-3 floors), not a
 * tower's own heroic scale.
 */
export function buildElvenTreehouseHome(dna: BuildingDNA): THREE.Group {
  const { w, d } = getFootprint(dna.buildingKind, dna.size);
  const radius = Math.max(1, Math.min(w, d) / 2);
  const floors = Math.max(1, dna.floors);
  const ringHeight = FLOOR_HEIGHT * 0.9;
  // A living canopy is the whole point of this building's top -- give it
  // real visual weight, matching the tower's own roof-cap proportion fix
  // (a cap that's too small a fraction of total height reads as
  // negligible at normal viewing distance).
  const coneHeight = radius * 3.0;

  // `StoneTowerPalette`'s field names are tower-specific vocabulary
  // (`stone`/`shingle`) reused as-is here since the underlying tower-kit
  // functions are material-agnostic, just keyed by these names --
  // `stone` holds this house's real WOOD wall/quoin/entrance/frame
  // material (bark-textured, matching a plank/log-course wall), and
  // `shingle` is unused (this house always calls `buildLivingRoofCap`
  // directly, never `buildTowerRoofCap`'s classic/pagoda dispatch which
  // is the only consumer of `shingle`) but still populated to satisfy
  // the shared interface.
  const woodMat = mat(dna.colors.walls, { roughness: 0.9, map: barkTexture(Math.max(1, radius / 1.2), Math.max(1, ringHeight / 1.2)) });
  const palette: StoneTowerPalette = {
    stone:     woodMat,
    shingle:   woodMat,
    leaf:      mat(dna.colors.roof, { roughness: 0.75 }),
    bark:      mat('#4a3520', { roughness: 0.9, map: barkTexture() }),
    moonstone: mat('#d8e8f0', { roughness: 0.5, metalness: 0.05 }),
  };

  const rand = mulberry32(dna.seed ^ 0xE15E70);
  return buildTowerKitCore(
    dna, radius, floors, coneHeight, palette,
    (seed, r, _h, p) => buildLivingRoofCap(seed ^ 0x1DEA, r, { leaf: p.leaf, bark: p.bark }),
    rand,
  );
}
