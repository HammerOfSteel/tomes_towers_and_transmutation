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
 * stretched to fill the procedural footprint — stretching to the
 * (independently-tuned, denser-than-real "Animal-Crossing-scale")
 * procedural footprints was the original cause of bad scaling and has been
 * removed entirely. This alone is NOT sufficient, though: not every model
 * in a raw pack pool is actually house-scale just because it's placed at
 * native scale. Every model's true native height was measured individually
 * via Scale Lab (see scale-lab.ts) against the game's canonical
 * TARGET_HEIGHT = 2.0 reference character, and pools are grouped by that
 * measured height, not by the pack's own folder/file naming (which can be
 * misleading — e.g. city_pack's "Building1_Small"/"Building2_Small" are
 * genuinely 4-5 story buildings at 2.3x-2.5x character height despite the
 * "Small" name, and medieval_village_pack's "House_3"/"House_4" measured at
 * only 1.04x/0.54x character height — shed-scale, not house-scale). See
 * docs/asset-integration/2026-*-scale-lab-measurements.md for the full
 * measured-height table and per-pool grouping rationale.
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
 * Native heights (Scale Lab, scale=1) are 2.93m-3.39m (1.46x-1.70x character
 * height) — a tight, coherent "single dwelling" band. `House_3`/`House_4`
 * and city_pack's `Building1_Small`/`Building2_Small` were REMOVED from
 * this pool after precise measurement showed they don't belong here:
 * `House_3` (2.09m/1.04x) and `House_4` (1.07m/0.54x) are shed-scale, not
 * house-scale, and `Building1_Small`/`Building2_Small` (4.66m-4.97m/
 * 2.33x-2.48x) are genuine 4-5 story buildings — despite being named
 * "Small" within city_pack's own (much larger) building set, they read as
 * multi-story apartment blocks next to a 2m-tall character, not cottages.
 * Mixing all of these into one pool produced the "giant building next to a
 * tiny shed, character disproportionate either way" defect. See
 * docs/asset-integration/2026-*-scale-lab-measurements.md.
 */
const RESIDENTIAL_VARIANTS = [
  'medieval_village_pack/buildings/House_1',
  'medieval_village_pack/buildings/House_2',
  'modern_type_buildings/city_pack/House1',
  'modern_type_buildings/city_pack/House2',
] as const;

/**
 * Grand/civic-scale buildings (villa, tavern, inn, guild-hall stand-ins) —
 * medieval Inn plus ALL of city_pack's multi-story monolithic buildings,
 * including the two mislabeled "_Small" ones (see RESIDENTIAL_VARIANTS
 * comment — they're civic/apartment-scale, not house-scale). Native
 * heights 3.49m-5.92m (1.75x-2.96x character height) — a wider but
 * plausible range for "big impressive building," not a bug: this category
 * is expected to include everything from a large inn up to a grand hall.
 */
const CIVIC_LARGE_VARIANTS = [
  'medieval_village_pack/buildings/Inn',
  'modern_type_buildings/city_pack/Building1_Small',
  'modern_type_buildings/city_pack/Building2_Small',
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
 * Small utility/outbuilding stand-ins (barn/gate) — Stable plus `House_3`
 * and `House_4`, which measured shed-scale (2.09m/1.04x and 1.07m/0.54x
 * character height respectively) and were removed from
 * `RESIDENTIAL_VARIANTS` for being too small to read as houses. Kept in
 * inventory rotation here instead of discarded outright, since a barn/gate
 * is legitimately expected to be smaller than a dwelling.
 */
const OUTBUILDING_VARIANTS = [
  'medieval_village_pack/buildings/Stable',
  'medieval_village_pack/buildings/House_3',
  'medieval_village_pack/buildings/House_4',
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
 *   - barn/gate                 -> OUTBUILDING_VARIANTS (Stable + the two
 *                                  shed-scale ex-"House" models)
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
  barn:          OUTBUILDING_VARIANTS,
  gate:          OUTBUILDING_VARIANTS,
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

/**
 * Uniform corrective scale applied on TOP of native scale (×1) for every
 * placed real building.
 *
 * Native scale alone (validated via Scale Lab against the 2.0m reference
 * character, see module doc comment) makes each building's overall
 * silhouette height a plausible 1.46x-2.96x character height. But that
 * whole-building check never measured the DOOR APERTURE specifically —
 * and empirical inspection of a live playtest screenshot (character
 * standing directly beside a real building's door) showed the door
 * opening itself reads as roughly the same height as the character, not
 * taller — Quaternius's low-poly buildings are stylised with thick
 * walls/chunky roofs and comparatively small doors, which isn't something
 * placing at native scale alone fixes. Doors ~1.0x character height read
 * as "character is too big for this house"; real doors are ~1.05x-1.2x
 * an adult's height for headroom.
 *
 * Since we never edit/invent geometry, the only lever available is
 * bumping the WHOLE building (and therefore its door, proportionally)
 * larger. +28% brings a ~1.0x-character door to a believable ~1.25x-
 * 1.3x, at the cost of pushing whole-building heights to a still-
 * plausible ~1.9x-3.8x character height (bigger, grander buildings —
 * acceptable; the user has repeatedly prioritised buildings/doors not
 * reading too small over strict real-world proportion accuracy).
 */
const DOOR_SCALE_CORRECTION = 1.28;

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
  group.scale.setScalar(DOOR_SCALE_CORRECTION);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y = -box.min.y;

  return group;
}
