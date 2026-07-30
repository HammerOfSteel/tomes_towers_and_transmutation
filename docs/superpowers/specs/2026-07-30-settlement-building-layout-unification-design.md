# Settlement Building Layout Unification — Design Spec

**P1 sub-project (2)** of `TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md`.
Depends on P1 sub-project (1) (Settlement Siting, shipped).

## Problem

Overworld Studio's building layout (`buildSettlement()` in
`overworld-studio.ts`) and the live game's building layout
(`SettlementGenerator.ts`'s `_planVillage`/`_planTown`/`_planCity`) are two
unrelated algorithms:

- **Studio**: spiral-distributed seed points → Voronoi cells (d3-delaunay) →
  Lloyd-relax the central cells → Simplex warp → assign each cell a
  `WardType` (market/church/inn/smithy/craftsmen/merchant/patriciate/slum/
  gateward/farm/park) via `rateLocation()` → build a street graph from
  Voronoi edges → Chaikin-smooth roads. Produces a `SettlementModel`
  (`wards[]`, `roads[]`, `wall?`, `gates[]`, `centre`, `radius`).
- **Live game**: hardcoded per-`SettlementType` patterns (a "cross" of roads
  for villages, "street"/"grid" patterns for towns/cities) with a fixed
  `BuildingType` mix (`smithy`, `cottage`, `market_stall`, ...), placed via
  `_noOverlap()` AABB checks. Produces a `SettlementPlan`
  (`buildings[]: PlacedBuilding[]`, `roads[]: RoadSegment[]`).

Both sides already converge one layer *below* this: rendering goes through
`BuildingDNA` → `factionBuildingDna()` → `buildBuilding()` in both places
(confirmed live in `OverworldScene.ts`'s normal settlement-building loop via
`createSettlementBuildingDna()`, and in its separate Studio-preview loader
via `WARD_TO_KIND`/`WARD_TO_SIZE`/`WARD_TO_FLOORS` → `factionBuildingDna()`
directly). The gap is entirely in the **placement algorithm and
building-kind assignment** above that shared rendering layer.

`overworld-studio.ts` has module-scope DOM wiring (`document.getElementById`
calls executed at import time, starting ~line 1474) — the same problem P0
solved for `generateRealmData()` by extracting it into a DOM-free
`RealmGenerator.ts`. `buildSettlement()` and its pure dependencies have the
same problem and need the same treatment before live-game code can safely
import them.

## Goal

Live-game settlements should place their buildings in the same
positions/kinds as Studio's ward-based preview would produce for the same
seed — full positional parity, not just a "similar-looking" approximation.

**Out of scope for this sub-project** (explicit user decision): walls and
gates. Studio only ever renders these as 2D canvas lines; the live 3D game
has no wall mesh/collision system at all today. Adding one is a
substantial, independent feature — deferred to a future follow-up. This
sub-project covers **buildings + roads only**.

## Architecture

### 1. Extract the pure ward/Voronoi generator

Create `src/world/SettlementModelGenerator.ts`, mirroring the P0 precedent
(`RealmGenerator.ts`'s extraction of `generateRealmData()`). Move these
DOM-free functions out of `overworld-studio.ts` into the new file (as a
pure, importable module with no module-scope side effects):

- `buildSettlement(p: GeneratorParams): SettlementModel`
- `generateBaseSeeds(p)`, `buildFromSeeds(seeds, p)`
- Ward-type assignment (`rateLocation()` and friends)
- Ward-layout mixing (`assignWardLayouts`/`ZONE_PALETTES`) — **not needed**
  for this sub-project's scope (layout mixing affects only Studio's 2D
  interior sub-block rendering, which the live game does not consume;
  leave `wardLayout` computed but unused on the live side)
- Road-graph construction + Chaikin smoothing
- The `Ward`, `Road`, `SettlementModel`, `WardType`, `LayoutType`,
  `GeneratorParams` types (re-exported, not duplicated)

`overworld-studio.ts` re-imports these from the new module (same pattern P0
used for `chaikin()`/`generateRealmData()`), so Studio's own behavior is
byte-for-byte unchanged.

**Explicitly not moved**: wall/gate generation, ward-layout sub-block
rendering, anything Canvas-2D-specific (`drawSettlement`, `drawSettlement2D5`).
These stay in `overworld-studio.ts`.

### 2. `SettlementGenerator.ts` calls the shared generator

`planSettlement()`'s `_planVillage`/`_planTown`/`_planCity` functions are
replaced by one shared code path that:

1. Maps `SettlementType` → `GeneratorParams` (`nPatches`, `width`/`height`,
   `walled`/`hasCitadel`/`hasPlaza` — carried through for parity with
   Studio's own type-based defaults, even though walls aren't rendered yet)
2. Calls `buildSettlement(params)` to get a `SettlementModel`
3. For each ward where `withinCity` is true:
   - Look up `WARD_TO_KIND[ward.type]` — skip the ward (no building) if
     there's no mapping, exactly like the existing Studio-preview code does
   - Map the ward's `center: Vec2` (Studio canvas-space) to a `(col, row)`
     on the `WorldGrid`, anchored at the settlement's `centerCol`/`centerRow`
   - Snap to a valid tile if needed (see below)
   - Emit a `PlacedBuilding` carrying the ward-derived kind/size/floors
4. For each `Road` in the model, rasterize its Chaikin-smoothed polyline
   into grid `(col, row)` tiles (replacing the current Bresenham-line road
   generation) and emit `RoadSegment`s

### 3. Coordinate mapping and snapping

Studio's model lives in local canvas-space: seeds spread within
`radius ≈ min(width, height) * 0.42` around `(width/2, height/2)`. To place
this on the `WorldGrid`:

- Fix a **world-tiles-per-Studio-unit** scale constant (new, e.g.
  `SETTLEMENT_MODEL_SCALE`), chosen so a `city`'s ward spread (`radius`)
  comfortably fits the zone radii `applySettlementToGrid()` already uses
  (`zoneR = 16` for city, `12` town, `8` village) — i.e. pick `GeneratorParams.width/height`
  and the scale together so `radius * scale ≈ zoneR`.
- `(col, row) = (centerCol + round((ward.center.x - CX) * scale), centerRow + round((ward.center.y - CY) * scale))`
- If the resulting tile fails `_valid()` (water/river/dungeon/out-of-bounds,
  reusing the existing helper unchanged) or collides with an already-placed
  building's footprint (reusing `_noOverlap()`'s AABB check with the
  ward-derived building's `BUILDING_SPECS`-equivalent footprint from
  `getFootprint()` in `BuildingDNA.ts`), snap outward via the same
  8-direction ring search pattern `SettlementPlacer.ts` uses for settlement
  siting (`DIRS8`, expanding radius, bounded retries). If no valid tile is
  found within the retry budget, drop the building (log via the same
  graceful-drop convention Task 3 established) rather than throwing.
- Road tiles are rasterized the same way, without snapping (a road tile
  landing on invalid terrain is acceptable — roads already tolerate this in
  the current implementation, e.g. crossing minor elevation steps).

### 4. Data model changes

`PlacedBuilding` (`SettlementGenerator.ts`):

```ts
export interface PlacedBuilding {
  wardType: WardType;      // replaces `type: BuildingType`
  col:      number;
  row:      number;
  rotation: number;
  seed:     number;
}
```

`OverworldScene.ts`'s `createSettlementBuildingDna(b, plan.type)` is
replaced by a small adapter that mirrors the existing Studio-preview
inline logic exactly:

```ts
const kind   = WARD_TO_KIND[b.wardType];      // skip if undefined (shouldn't happen — filtered upstream)
const size   = WARD_TO_SIZE[b.wardType] ?? 'medium';
const floors = WARD_TO_FLOORS[b.wardType] ?? (plan.type === 'city' ? 2 : 1);
const dna    = factionBuildingDna(kind, settlementTypeToFaction(plan.type), b.seed, size, floors);
```

`applySettlementToGrid()`'s grid-marking logic (outskirts zone, elevation
flattening, road/building tile marking) is unchanged — it only reads
`col`/`row`/`roads`/`buildings.length`, none of which change shape.

`SettlementPlan.buildings: PlacedBuilding[]` and `SettlementPlan.roads:
RoadSegment[]` keep their existing field names/types on `SettlementPlan`
itself — only `PlacedBuilding`'s internals change. No consumer outside
`SettlementGenerator.ts` and `OverworldScene.ts` reads `PlacedBuilding.type`
directly (confirmed: `MainMenu.ts` and save/load do not touch building
internals, only `SettlementPlan`-level `name`/`faction`/`type`/`population`).

`BUILDING_SPECS`/`BuildingType` (the old code-defined catalog) becomes
unused by settlement placement after this change. It is **not deleted** in
this sub-project — confirm at implementation time whether anything else
still references it (e.g. non-settlement building spawns); if it becomes
fully dead code, note it for a future cleanup rather than deleting it here
(same precedent as keeping `generateSettlementName()` in the siting
sub-project).

### 5. Testing

`tests/levels/settlementGenerator.test.ts`'s existing pattern-specific
assertions (asserting the hardcoded cross/street/grid shapes) are replaced
with assertions on the new behavior:

- Determinism: same seed → identical `buildings[]`/`roads[]`
- Building kind/size/floors trace back correctly to `WARD_TO_KIND`/`SIZE`/`FLOORS`
  for each ward type produced
- No two buildings overlap (footprint-aware)
- Snap-on-invalid-terrain behavior (mirroring the siting sub-project's
  Task 3 test style: a grid rigged with water/dungeon tiles at a ward's
  expected position, verifying the building lands on the nearest valid tile)
- Graceful drop when no valid tile exists within the retry budget
- `applySettlementToGrid()` still correctly marks road/building tiles given
  the new `PlacedBuilding` shape

A new integration test in `tests/world/WorldGenerator.test.ts` (or
extending the existing settlement-integration describe block from the
siting sub-project) verifies `buildWorldData()`'s settlements have
buildings whose kinds are valid `WARD_TO_KIND` outputs.

The existing dev-preview code path (`OverworldScene.ts`'s
`_buildStudioSettlementPreview`/`_readStudioSettlementPreview`) is
untouched — it's a separate, manual, single-settlement dev tool that
already talks to the ward model directly via localStorage, not part of
this sub-project's normal per-realm-settlement generation path.

## Explicitly deferred (not this sub-project)

- Walls and gates (new 3D mesh + collision system — user decision, see Goal)
- Ward-layout sub-block mixing (`assignWardLayouts`, `ZONE_PALETTES`) —
  affects only Studio's interior-block rendering style, which the live game
  doesn't consume at this granularity
- Deleting `BuildingType`/`BUILDING_SPECS` if it turns out to be fully dead
  after this change — flag for a future cleanup task, don't delete here
- P1 sub-project (3), NPC population unification (next in sequence after this)
