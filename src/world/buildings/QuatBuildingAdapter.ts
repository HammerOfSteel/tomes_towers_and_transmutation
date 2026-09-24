/**
 * QuatBuildingAdapter.ts — External Assets, Sub-task 2 (Settlement Buildings)
 *
 * Faction-agnostic `BuildingKind` → real Quaternius building model lookup +
 * async loader, mirroring the pattern established in `QuatEnemyAdapter.ts`
 * and `AmbientWildlife.ts`'s `AmbientCreature._loadRealAsset()`.
 *
 * Per the user's explicit prior clarification, the same 10-model
 * `medieval_village_pack/buildings` pool is used for EVERY faction — no
 * blocking on a "perfect" style match. Kinds with no reasonable monolithic
 * match in this pack are simply omitted from the table below and fall
 * through to the existing procedural builder (the hard fallback rule
 * enforced by the caller, not this module).
 *
 * `modular_fantasy_village/medieval_village_megakit` (176 kit-of-parts
 * pieces) is NOT used here — assembling it needs a wall/roof/floor layout
 * engine comparable to the dungeon blueprint renderer, which is out of
 * scope for this sub-task. See
 * docs/superpowers/plans/2026-09-24-external-assets-settlement-buildings.md.
 */

import * as THREE from 'three';
import type { BuildingKind } from './BuildingDNA';
import { getFootprint } from './BuildingDNA';
import type { BuildingSize } from './BuildingDNA';
import { QUAT_MODELS } from '@/assets/quaterniusManifest';
import { loadQuatAsset } from '@/assets/QuaterniusAssetLoader';

// ── Kind → model lookup ───────────────────────────────────────────────────────

const HOUSE_VARIANTS = [
  'medieval_village_pack/buildings/House_1',
  'medieval_village_pack/buildings/House_2',
  'medieval_village_pack/buildings/House_3',
  'medieval_village_pack/buildings/House_4',
] as const;

/**
 * BuildingKind → real model id(s). A single string is used as-is; an array
 * is deterministically rotated by `seed` (see `pickQuatBuildingModelId`) so
 * repeated buildings of the same kind in one settlement aren't all
 * identical.
 *
 * Kinds intentionally left unmapped (shop, guild, chapel, cottage, villa,
 * terraced, apothecary, market_stall, gate, tent, well, ruin): no
 * reasonable monolithic match in this 10-model pack — stays procedural.
 */
const BUILDING_KIND_TO_QUAT_MODEL: Partial<Record<BuildingKind, string | readonly string[]>> = {
  house:      HOUSE_VARIANTS,
  inn:        'medieval_village_pack/buildings/Inn',
  tavern:     'medieval_village_pack/buildings/Inn',      // no dedicated tavern model
  blacksmith: 'medieval_village_pack/buildings/Blacksmith',
  watchtower: 'medieval_village_pack/buildings/Bell_Tower',
  tower:      'medieval_village_pack/buildings/Bell_Tower',
  barn:       'medieval_village_pack/buildings/Stable',
};

/**
 * Resolve which real Quaternius model id (if any) a given BuildingKind maps
 * to, deterministically varying multi-model kinds (e.g. house) by seed.
 * Returns null when this kind has no real-asset mapping.
 */
export function pickQuatBuildingModelId(kind: BuildingKind, seed: number): string | null {
  const entry = BUILDING_KIND_TO_QUAT_MODEL[kind];
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  const idx = ((seed % entry.length) + entry.length) % entry.length;
  return entry[idx]!;
}

// ── Async load + fit ──────────────────────────────────────────────────────────

/**
 * Load the real building model for `buildingKind` (if mapped) and scale it
 * to roughly fit the procedural footprint for `buildingKind`/`size`, then
 * re-pivot it to sit on the ground plane (y=0). Returns null when there's
 * no mapping for this kind or the load fails — callers must keep their
 * existing procedural building in either case (hard fallback rule).
 *
 * Scaling is uniform (fit to the footprint's larger horizontal dimension)
 * to avoid distorting the model — some footprint depth/width mismatch vs.
 * the procedural building is an accepted cosmetic limitation, not a
 * texture/color invention (that hard rule only concerns material data).
 */
export async function loadRealBuildingExterior(
  buildingKind: BuildingKind,
  size: BuildingSize,
  seed: number,
): Promise<THREE.Object3D | null> {
  const modelId = pickQuatBuildingModelId(buildingKind, seed);
  if (!modelId) return null;

  const quatDef = QUAT_MODELS.find(m => m.id === modelId);
  if (!quatDef) return null; // manifest drift — fail safe, not fatal

  let loaded;
  try {
    loaded = await loadQuatAsset(quatDef);
  } catch {
    return null; // load failure — caller keeps the procedural building
  }

  const group = loaded.scene;
  const box = new THREE.Box3().setFromObject(group);
  const sz = new THREE.Vector3();
  box.getSize(sz);

  const fp = getFootprint(buildingKind, size);
  const targetSpan = Math.max(fp.w, fp.d);
  const modelSpan = Math.max(sz.x, sz.z);
  const scale = modelSpan > 0.01 ? targetSpan / modelSpan : 1;
  group.scale.setScalar(scale);

  const centredBox = new THREE.Box3().setFromObject(group);
  group.position.y = -centredBox.min.y;

  return group;
}
