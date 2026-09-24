/**
 * QuatBuildingAdapter.ts — External Assets, Sub-task 2 (Settlement Buildings)
 *
 * Faction-agnostic `BuildingKind` → real Quaternius building model lookup +
 * async loader, mirroring the pattern established in `QuatEnemyAdapter.ts`
 * and `AmbientWildlife.ts`'s `AmbientCreature._loadRealAsset()`.
 *
 * Per the user's explicit prior clarification, the same 10-model
 * `medieval_village_pack/buildings` pool is used for EVERY faction — no
 * blocking on a "perfect" style match.
 *
 * Every `BuildingKind` is mapped below. Per the user's hard "never mix
 * procedural and real assets" rule, the settlement-buildings toggle must
 * never fall back to procedural geometry for an unmapped kind while ON —
 * so kinds with no dedicated real model are deliberately assigned the
 * closest available whole-object stand-in from inventory (documented
 * per-kind below) rather than left unmapped. This is a cosmetic best-fit,
 * never an invented texture/mesh — every model used is a real asset that
 * actually exists in the imported Quaternius packs.
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

const MARKET_STALL_VARIANTS = [
  'medieval_village_pack/props/MarketStand_1',
  'medieval_village_pack/props/MarketStand_2',
] as const;

/**
 * BuildingKind → real model id(s). A single string is used as-is; an array
 * is deterministically rotated by `seed` (see `pickQuatBuildingModelId`) so
 * repeated buildings of the same kind in one settlement aren't all
 * identical.
 *
 * ALL 19 kinds are mapped — none fall through to procedural while the
 * settlement-buildings toggle is ON. Direct/obvious matches are the 10
 * whole `medieval_village_pack/buildings` models; a few infrastructure
 * kinds get a dedicated prop-scale real model instead (Well, MarketStand);
 * kinds with no dedicated model at all reuse the closest available whole
 * building as a cosmetic stand-in (documented inline):
 *   - terraced/cottage/shop/apothecary/ruin -> reuse HOUSE_VARIANTS
 *     (all are house-scale residential/commercial single structures)
 *   - villa/tavern              -> Inn (the pack's largest/grandest building)
 *   - guild                     -> Mill (largest civic-scale structure available)
 *   - chapel/tower/watchtower   -> Bell_Tower (only tower-shaped model)
 *   - gate                      -> Stable (widest open-archway structure)
 *   - tent                      -> Gazebo (only open-air roofed structure)
 */
const BUILDING_KIND_TO_QUAT_MODEL: Record<BuildingKind, string | readonly string[]> = {
  house:         HOUSE_VARIANTS,
  terraced:      HOUSE_VARIANTS,
  cottage:       HOUSE_VARIANTS,
  shop:          HOUSE_VARIANTS,
  apothecary:    HOUSE_VARIANTS,
  ruin:          HOUSE_VARIANTS,
  villa:         'medieval_village_pack/buildings/Inn',
  tavern:        'medieval_village_pack/buildings/Inn',
  inn:           'medieval_village_pack/buildings/Inn',
  guild:         'medieval_village_pack/buildings/Mill',
  chapel:        'medieval_village_pack/buildings/Bell_Tower',
  tower:         'medieval_village_pack/buildings/Bell_Tower',
  watchtower:    'medieval_village_pack/buildings/Bell_Tower',
  blacksmith:    'medieval_village_pack/buildings/Blacksmith',
  barn:          'medieval_village_pack/buildings/Stable',
  gate:          'medieval_village_pack/buildings/Stable',
  well:          'medieval_village_pack/props/Well',
  tent:          'medieval_village_pack/props/Gazebo',
  market_stall:  MARKET_STALL_VARIANTS,
};

/**
 * Resolve which real Quaternius model id a given BuildingKind maps to,
 * deterministically varying multi-model kinds (e.g. house) by seed. Every
 * `BuildingKind` has a mapping (see table above) — this only returns null
 * on manifest drift (checked by the caller), never by design.
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
