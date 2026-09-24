/**
 * QuatBuildingAdapter.ts — External Assets, Sub-task 2 (Settlement Buildings)
 *
 * Faction-agnostic `BuildingKind` → real Quaternius building model lookup +
 * async loader, mirroring the pattern established in `QuatEnemyAdapter.ts`
 * and `AmbientWildlife.ts`'s `AmbientCreature._loadRealAsset()`.
 *
 * Per the user's explicit prior clarification, the same 10-model
 * `medieval_village_pack/buildings` pool is used for EVERY faction — no
 * blocking on a "perfect" style match. Per a later, equally explicit
 * clarification, `modern_type_buildings/city_pack`'s 9 monolithic buildings
 * are mixed into the same rotation pools for variety — an asset is never
 * excluded for "not fitting the fantasy theme"; more unique silhouettes in
 * a settlement is more valuable than tonal consistency right now.
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
 * Scaling: real buildings are placed at their NATIVE scale (×1), not
 * stretched to fill the procedural footprint. Measured via Scale Lab
 * (see scale-lab.ts) against the game's canonical TARGET_HEIGHT = 2.0
 * reference character, every medieval_village_pack and city_pack building
 * already sits at a believable 1.0x-3.0x character height at scale=1 —
 * Quaternius modelled them consistently against an implied human scale, so
 * stretching them to match the (independently-tuned, denser-than-real
 * "Animal-Crossing-scale") procedural footprints was both unnecessary and
 * the direct cause of reported "not scaled well/coherently" and
 * "transparent-looking walls" (up-scaled cube-built meshes overlapping
 * neighbouring plots -> z-fighting) symptoms. See
 * docs/asset-integration/2026-*-scale-lab-measurements.md.
 *
 * `modular_fantasy_village/medieval_village_megakit` (176 kit-of-parts
 * pieces) is NOT used here — assembling it needs a wall/roof/floor layout
 * engine comparable to the dungeon blueprint renderer, which is out of
 * scope for this sub-task. See
 * docs/superpowers/plans/2026-09-24-external-assets-settlement-buildings.md.
 */

import * as THREE from 'three';
import type { BuildingKind } from './BuildingDNA';
import type { BuildingSize } from './BuildingDNA';
import { QUAT_MODELS } from '@/assets/quaterniusManifest';
import { loadQuatAsset } from '@/assets/QuaterniusAssetLoader';

// ── Kind → model lookup ───────────────────────────────────────────────────────

/**
 * House/shop-scale single dwellings — medieval + modern mixed for variety.
 * Native heights (Scale Lab, scale=1) range ~1.07m-3.39m (0.5x-1.7x
 * character height): House_1-3, city_pack House1/House2 and the two
 * "_Small" monolithic city buildings.
 */
const RESIDENTIAL_VARIANTS = [
  'medieval_village_pack/buildings/House_1',
  'medieval_village_pack/buildings/House_2',
  'medieval_village_pack/buildings/House_3',
  'medieval_village_pack/buildings/House_4',
  'modern_type_buildings/city_pack/House1',
  'modern_type_buildings/city_pack/House2',
  'modern_type_buildings/city_pack/Building1_Small',
  'modern_type_buildings/city_pack/Building2_Small',
] as const;

/**
 * Grand/civic-scale buildings (villa, tavern, inn) — medieval Inn plus the
 * larger monolithic city_pack buildings. Native heights ~3.49m-5.92m
 * (1.75x-2.96x character height).
 */
const CIVIC_LARGE_VARIANTS = [
  'medieval_village_pack/buildings/Inn',
  'modern_type_buildings/city_pack/Building1_Large',
  'modern_type_buildings/city_pack/Building2_Large',
  'modern_type_buildings/city_pack/Building3_Big',
  'modern_type_buildings/city_pack/Building4',
] as const;

/** Guild hall stand-ins — the pack's mill plus the tallest city buildings. */
const GUILD_VARIANTS = [
  'medieval_village_pack/buildings/Mill',
  'modern_type_buildings/city_pack/Building1_Large',
  'modern_type_buildings/city_pack/Building4',
] as const;

/**
 * Tower-shaped stand-ins (chapel/tower/watchtower) — the pack's Bell_Tower
 * plus city_pack's narrowest tall building for a second silhouette.
 */
const TOWER_VARIANTS = [
  'medieval_village_pack/buildings/Bell_Tower',
  'modern_type_buildings/city_pack/Building3_Small',
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
 * settlement-buildings toggle is ON:
 *   - house/terraced/cottage/shop/apothecary/ruin -> RESIDENTIAL_VARIANTS
 *     (all are house-scale residential/commercial single structures)
 *   - villa/tavern/inn          -> CIVIC_LARGE_VARIANTS
 *   - guild                     -> GUILD_VARIANTS
 *   - chapel/tower/watchtower   -> TOWER_VARIANTS
 *   - blacksmith                -> Blacksmith (functional forge shape, no
 *                                  meaningfully-different alt in inventory)
 *   - barn/gate                 -> Stable (widest open-archway structure)
 *   - well                      -> Well (dedicated prop-scale model)
 *   - tent                      -> Gazebo (only open-air roofed structure)
 *   - market_stall               -> MARKET_STALL_VARIANTS
 */
const BUILDING_KIND_TO_QUAT_MODEL: Record<BuildingKind, string | readonly string[]> = {
  house:         RESIDENTIAL_VARIANTS,
  terraced:      RESIDENTIAL_VARIANTS,
  cottage:       RESIDENTIAL_VARIANTS,
  shop:          RESIDENTIAL_VARIANTS,
  apothecary:    RESIDENTIAL_VARIANTS,
  ruin:          RESIDENTIAL_VARIANTS,
  villa:         CIVIC_LARGE_VARIANTS,
  tavern:        CIVIC_LARGE_VARIANTS,
  inn:           CIVIC_LARGE_VARIANTS,
  guild:         GUILD_VARIANTS,
  chapel:        TOWER_VARIANTS,
  tower:         TOWER_VARIANTS,
  watchtower:    TOWER_VARIANTS,
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
 * Load the real building model for `buildingKind` (if mapped), pivot it to
 * sit on the ground plane (y=0), and return it at its NATIVE scale — see
 * the module doc comment for why no footprint-fit rescaling is applied.
 * Returns null when there's no mapping for this kind or the load fails —
 * callers must keep their existing procedural building in either case
 * (hard fallback rule).
 */
export async function loadRealBuildingExterior(
  buildingKind: BuildingKind,
  _size: BuildingSize,
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
  group.position.y = -box.min.y;

  return group;
}
