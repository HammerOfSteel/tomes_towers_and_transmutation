/**
 * InteriorPropAdapter.ts — External Assets, Sub-task 2 (Settlement Buildings), Task 3
 *
 * `PropKind` → real Quaternius interior-prop model lookup + async loader,
 * mirroring the pattern established in `QuatBuildingAdapter.ts` (buildings)
 * and `QuatEnemyAdapter.ts` (monsters).
 *
 * Model ids below were found by exact grep of `QUAT_MODELS` for names
 * plausibly matching each `PropKind` — no id is invented; every one is
 * verified to exist in the manifest. Kinds with no verified match (`rug`)
 * are simply omitted from `PROP_KIND_TO_QUAT_MODEL`, so `loadRealProp()`
 * returns null and the caller's existing hard-fallback rule sends them
 * through the unchanged procedural path.
 *
 * A few obvious candidates were measured (via the same Scale Lab /
 * bounding-box technique used to fix `QuatBuildingAdapter.ts`'s building
 * scale bug) and REJECTED for being clearly wrong-scale versions of what
 * their name promises, not a deliberate size variant:
 *   - `fantasy_props_megakit/Table_Fork|Knife|Plate|Spoon` measured
 *     6mm-20mm tall — flat cutlery/tableware items, not tables.
 *   - `medieval_village_pack/props/Barrel` measured 0.20m tall (real
 *     barrels are ~0.6m-1m) and `.../Crate` measured 0.16m tall — both
 *     toy-scale, not the building-scale props their names suggest.
 * These are excluded from their kind's pool; the correctly-scaled
 * `fantasy_props_megakit` equivalents are used instead.
 *
 * Scaling: unlike buildings (native scale, no target height — see
 * `QuatBuildingAdapter.ts`'s doc comment for why that pool didn't need
 * one once wrongly-scaled models were removed), interior props DO need a
 * per-kind target height. Two real candidates measured wildly larger than
 * the existing procedural builder's own reference geometry for the same
 * kind — `modular_dungeons/obj_kit/Statue_Fox|Stag` at 3.75m/4.63m vs the
 * procedural `buildStatue()`'s ~1.34m, and `medieval_village_pack/props/
 * Door_Straight|Round` at ~0.71m vs `buildDoor()`'s 2.2m (human-height)
 * reference — so every kind is normalised to its procedural builder's own
 * reference height (`PROP_KIND_TARGET_HEIGHT`, read directly from
 * `builder.ts`'s archetype functions) before `dna.size` is applied. This
 * keeps a real asset's footprint consistent with the room/collision
 * geometry the procedural builder was already tuned for, rather than
 * repeating the "trust native scale unconditionally" mistake.
 */

import * as THREE from 'three';
import type { PropKind } from '@/prop-creator/types';
import { QUAT_MODELS } from '@/assets/quaterniusManifest';
import { loadQuatAsset } from '@/assets/QuaterniusAssetLoader';

/**
 * Target height (world units, at dna.size=1) each real model is normalised
 * to before `dna.size` is applied — taken directly from the matching
 * procedural archetype builder in `prop-creator/builder.ts` (top-most
 * geometry's world-space Y extent), so a swapped-in real asset occupies
 * the same footprint/collision volume the room was already built around.
 */
const PROP_KIND_TARGET_HEIGHT: Partial<Record<PropKind, number>> = {
  chest:     0.62,
  bookshelf: 1.8,
  table:     0.81,
  chair:     1.38,
  cauldron:  0.62,
  lantern:   1.42,
  pillar:    2.42,
  door:      2.2,
  statue:    1.34,
  barrel:    0.6,
  crate:     0.5,
};

/**
 * PropKind → candidate real model id(s), verified present in
 * `QUAT_MODELS` by exact grep. Multi-model kinds are deterministically
 * rotated by seed (see `pickQuatPropModelId`). `rug` has no verified
 * match anywhere in the manifest and is intentionally omitted.
 */
export const PROP_KIND_TO_QUAT_MODEL: Partial<Record<PropKind, readonly string[]>> = {
  chest: [
    'modular_dungeons/obj_kit/Chest',
    'modular_dungeons/obj_kit/Chest_Gold',
    'fantasy_props/fantasy_props_megakit/Chest_Wood',
  ],
  bookshelf: [
    'modular_dungeons/obj_kit/Bookcase_Full',
    'modular_dungeons/obj_kit/Bookcase_Empty',
    'fantasy_props/fantasy_props_megakit/Bookcase_2',
  ],
  table: [
    'fantasy_props/fantasy_props_megakit/Table_Large',
  ],
  chair: [
    'fantasy_props/fantasy_props_megakit/Chair_1',
  ],
  cauldron: [
    'fantasy_props/fantasy_props_megakit/Cauldron',
    'medieval_village_pack/props/Cauldron',
  ],
  lantern: [
    'fantasy_props/fantasy_props_megakit/Lantern_Wall',
  ],
  pillar: [
    'modular_dungeons/obj_kit/Column_Round',
    'modular_dungeons/obj_kit/Column_Square',
    'modular_dungeons/obj_kit/Column_Round_Short',
  ],
  door: [
    'medieval_village_pack/props/Door_Straight',
    'medieval_village_pack/props/Door_Round',
  ],
  statue: [
    'modular_dungeons/obj_kit/Statue_Fox',
    'modular_dungeons/obj_kit/Statue_Stag',
  ],
  barrel: [
    'fantasy_props/fantasy_props_megakit/Barrel',
    'fantasy_props/fantasy_props_megakit/Barrel_Apples',
  ],
  crate: [
    'fantasy_props/fantasy_props_megakit/Crate_Wooden',
    'fantasy_props/fantasy_props_megakit/Crate_Metal',
  ],
  // rug: no verified match in inventory — omitted, falls through to procedural.
};

/**
 * Resolve which real Quaternius model id a given PropKind maps to,
 * deterministically varying multi-model kinds by seed. Returns null for
 * `rug` (no mapping) or manifest drift — never invents a fallback id.
 */
export function pickQuatPropModelId(kind: PropKind, seed: number): string | null {
  const entry = PROP_KIND_TO_QUAT_MODEL[kind];
  if (!entry || entry.length === 0) return null;
  const idx = ((seed % entry.length) + entry.length) % entry.length;
  return entry[idx]!;
}

/**
 * Load the real Quaternius model for `propKind` (if mapped), normalise it
 * to `PROP_KIND_TARGET_HEIGHT[propKind]` at scale 1 (pivoted to sit on
 * y=0), and return it — caller applies `dna.size` on top via
 * `.scale.multiplyScalar()`. Returns null when there's no mapping for
 * this kind or the load fails — callers must keep their existing
 * procedural prop in either case (hard fallback rule, same as
 * `QuatBuildingAdapter.loadRealBuildingExterior()`).
 */
export async function loadRealProp(propKind: PropKind, seed: number): Promise<THREE.Object3D | null> {
  const modelId = pickQuatPropModelId(propKind, seed);
  if (!modelId) return null;

  const quatDef = QUAT_MODELS.find(m => m.id === modelId);
  if (!quatDef) return null; // manifest drift — fail safe, not fatal

  let loaded;
  try {
    loaded = await loadQuatAsset(quatDef);
  } catch {
    return null; // load failure — caller keeps the procedural prop
  }

  const group = loaded.scene;
  const box = new THREE.Box3().setFromObject(group);
  const rawHeight = box.max.y - box.min.y;

  const targetHeight = PROP_KIND_TARGET_HEIGHT[propKind];
  const normScale = targetHeight !== undefined && rawHeight > 0.001 ? targetHeight / rawHeight : 1;
  group.scale.multiplyScalar(normScale);

  // Re-measure after scaling to pivot the (now-scaled) box to y=0.
  const scaledBox = new THREE.Box3().setFromObject(group);
  group.position.y -= scaledBox.min.y;

  return group;
}
