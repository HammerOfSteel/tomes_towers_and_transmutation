# River/Lake Swim Collision — Design Spec

(Written in plan mode — session workspace copy. On implementation start, this
gets committed to `docs/superpowers/specs/2026-08-25-river-lake-swim-collision-design.md`.)

## Problem

The live overworld (`OverworldScene.ts`) currently detects water with a
boolean-only `isInWaterAt()` (`src/world/WaterDetection.ts`), used purely to
apply a cosmetic sinking visual offset (`player.setSubmersion(0.4)`). There is
no depth, no swim state, and no real collision difference between water and
land — the terrain collider is a single solid stepped trimesh
(`TerrainGeometryBuilder.buildTerrainGeometryData()`) at the *same* physical
height under both land and river/water tiles.

Meanwhile, the Water Lab dev room (`src/scene/WaterLabScene.ts` +
`src/player/PlayerController.ts`) has a fully proven, tested swim state
machine: `setSwimming(isSwimming, waterSurfaceY, floorY)` drives buoyant
float/dive, capped swim speed, breaststroke animation, and wake-trail VFX,
given a real physically-carved basin to swim in.

This spec wires that already-working swim machinery onto the live overworld's
rivers and ocean-rim water, replacing the cosmetic-only check with real
per-tile depth, a physically carved basin (so both the collider and the
water-surface visual agree), and fords as the "impassable except at fords"
exception the roadmap calls for.

## Scope

**In scope:**
- Rivers (`HydrologyGenerator.ts`-carved tiles, `feature === 'river'`)
- Ocean-rim water (`biome === 'water'`, sourced from the realm generator's
  `deep_ocean`/`ocean` biomes via `RealmToWorldGrid.ts`)
- Fords: existing inter-settlement-road tiles that cross a river become
  shallow, walkable crossings instead of deep water
- Real physical depth (carved terrain + collider basin), not a cosmetic-only
  offset

**Explicitly out of scope (deferred to future work):**
- Dedicated inland lakes — the live generator has no such feature today;
  adding one is a separate future task
- Per-tile/gradient depth (e.g. river deepening from headwaters to mouth) —
  v1 uses one fixed depth per feature type
- Wiring the newer `RealmToTerrain.ts`/`RealmRiverMesh.ts` pipeline — per
  `STUDIO-LIVE-PARITY.md`, that pipeline is not live yet (P0 follow-up); this
  work stays entirely within the currently-live `WorldGrid`/
  `HydrologyGenerator`/`TerrainGeometryBuilder` stack so it isn't built on
  code about to be replaced
- Any change to `PlayerController`'s swim state machine itself — it's reused
  as-is

## Data model — `WorldGrid.ts`

```ts
export type TileFeature = 'none' | 'river' | 'river_bank' | 'river_ford' | 'road' | 'road_dirt';

export interface WorldCell {
  // ...existing fields...
  /** World units of carved depth below `elevation × LEVEL_HEIGHT`. 0 = dry/ford. */
  waterDepth: number;
}
```

- `_defaultCell()` initializes `waterDepth: 0`.
- River tiles (`HydrologyGenerator._markRiverPath`): `waterDepth = RIVER_DEPTH_WU`, `walkable = false` (unchanged).
- Ocean-rim water tiles (`RealmToWorldGrid.ts`, wherever `biome === 'water'` is assigned): `waterDepth = OCEAN_DEPTH_WU`, `walkable = false` (currently missing — a small correctness fix bundled with this change since it's the same code path).
- Ford tiles: `waterDepth = 0`, `walkable = true`, `feature = 'river_ford'` (overrides the tile's prior `'river'` feature).
- `river_bank` tiles are unaffected (dry shore, `waterDepth = 0`).

New shared module `src/world/WaterDepthConfig.ts`:
```ts
export const RIVER_DEPTH_WU = 1.0;
export const OCEAN_DEPTH_WU = 1.5;
export const LEVEL_HEIGHT = 0.55; // moved out of OverworldScene's local `SH` const

/** Physical (carved) height of a tile in world units — used by both the
 *  terrain/collider geometry builder and the water surface/depth query, so
 *  they can never disagree. */
export function physicalHeightWU(cell: Pick<WorldCell, 'elevation' | 'waterDepth'>): number {
  return cell.elevation * LEVEL_HEIGHT - cell.waterDepth;
}
```
`OverworldScene.ts`'s local `const T = 2` stays (already equals
`WorldGrid.tileUnit`); its local `const SH = 0.55` is replaced by importing
`LEVEL_HEIGHT`.

## Terrain carving — `TerrainGeometryBuilder.ts`

`buildTerrainGeometryData()` keeps its exact signature (still shared by both
`_buildTerrain()` and `_createTerrainCollider()`, so visuals and physics can
never mismatch — this is the existing design invariant and is preserved).

Internally, the `lvl()` helper (currently returns a raw integer elevation
level used both for the top-face Y and for wall-drawing neighbour
comparisons) is replaced by a WU-based `physHeight(col, row)` that calls
`physicalHeightWU()` on the cell. Top-face Y and all four wall comparisons
(`Hs < H` etc.) switch from comparing integer levels to comparing these WU
heights directly.

Effect: a land tile next to a carved river/ocean tile automatically grows a
wall down to the water tile's lower physical height — a real riverbank/shore
lip — with no new wall-generation logic, since the existing "draw a wall
whenever my neighbour is lower" rule already produces this once the compared
heights differ. Ford tiles have `waterDepth = 0`, so they carve nothing and
sit flush with the surrounding terrain, matching their "walk straight across"
intent.

Colour selection gets one more branch: `feature === 'river_ford'` renders as
a light sandy/wet-stone tint (reusing the existing `river_bank` shading
approach) so fords read visually distinct from deep river tiles.

## Water surface — `OverworldScene._buildWaterMesh()`

No change needed. Its existing condition
(`cell.feature !== 'river' && cell.biome !== 'water'` → skip) already
excludes fords for free, since fords carry `feature === 'river_ford'` (not
`'river'`) and an unchanged land `biome`. Its height calculation
(`cell.elevation * SH + 0.05`) is already anchored to the *uncarved* logical
elevation — i.e. it already sits at the correct swimmable surface height
above the new carved floor, requiring no edit.

## Water query — `WaterDetection.ts`

Replaces the boolean-only `isInWaterAt()` with a richer query:

```ts
export interface WaterInfo {
  surfaceY: number;
  floorY: number;
}

/** Returns surface/floor world-Y for a swimmable water tile at (wx, wz), or
 *  null if the tile is dry land or a ford. */
export function getWaterInfoAt(
  wg: Pick<WorldGrid, 'worldToGrid' | 'get'>,
  wx: number, wz: number,
): WaterInfo | null {
  const { col, row } = wg.worldToGrid(wx, wz);
  const cell = wg.get(col, row);
  if (cell.waterDepth <= 0) return null;
  const surfaceY = cell.elevation * LEVEL_HEIGHT;
  const floorY = physicalHeightWU(cell);
  return { surfaceY, floorY };
}
```

`isInWaterAt()` is removed; its one call site (`OverworldScene.ts:365`) is
replaced (see below). No other call sites exist (verified by search).

## Player integration — `OverworldScene.update()`

Replaces:
```ts
const inWater = isInWaterAt(this._wg, pos.x, pos.z);
this.player.setSubmersion(inWater ? 0.4 : 0);
```

With `WaterLabScene`'s already-proven tiered logic, sourcing surface/floor Y
from `getWaterInfoAt()` instead of scene-wide constants:

```ts
const water = getWaterInfoAt(this._wg, pos.x, pos.z);
if (water) {
  const depthBelowSurface = water.surfaceY - pos.y;
  if (depthBelowSurface >= SWIM_ENTER_DEPTH_THRESHOLD) {
    this.player.setSubmersion(-0.6);
    this.player.setSwimming(true, water.surfaceY, water.floorY);
  } else if (depthBelowSurface > 0) {
    this.player.setSubmersion(0.4);
    this.player.setSwimming(false);
  } else {
    this.player.setSubmersion(0);
    this.player.setSwimming(false);
  }
} else {
  this.player.setSubmersion(0);
  this.player.setSwimming(false);
}
```

`SWIM_ENTER_DEPTH_THRESHOLD` is imported from `PlayerController.ts` (already
exported there for `WaterLabScene.ts`'s use, or exported as part of this
change if currently private — to be confirmed during implementation). No
changes to `PlayerController` itself.

## Fords — `WorldGenerator.buildWorldData()`

Extends the existing post-road loop (currently only touches `'none'`/
`'road_dirt'` tiles):

```ts
for (const r of interRoads) {
  const cell = grid.get(r.col, r.row);
  if (cell.feature === 'none' || cell.feature === 'road_dirt') {
    grid.set(r.col, r.row, { feature: 'road' });
  } else if (cell.feature === 'river') {
    grid.set(r.col, r.row, { feature: 'river_ford', waterDepth: 0, walkable: true });
  }
}
```

This must run before the scene consumes `WorldData` (already the case —
`buildWorldData()` fully assembles the grid before returning).

## Testing

Following the existing unit-test patterns in `tests/world/`:
- `WaterDepthConfig.test.ts`: `physicalHeightWU()` math for dry/river/ocean
  cells.
- `TerrainGeometryBuilder.test.ts` (extend existing, if present, else new):
  a river tile between two land tiles produces a lower top face and wall
  faces down to the carved depth; a ford tile produces no carving.
- `HydrologyGenerator.test.ts` (extend): river path tiles get
  `waterDepth = RIVER_DEPTH_WU`.
- `RealmToWorldGrid.test.ts` (extend): ocean/`water`-biome tiles get
  `waterDepth = OCEAN_DEPTH_WU` and `walkable = false`.
- `WorldGenerator.test.ts` (extend): a road tile crossing a river becomes
  `'river_ford'` with `waterDepth = 0` and `walkable = true`.
- `WaterDetection.test.ts` (replace `isInWaterAt` tests): `getWaterInfoAt()`
  returns correct surface/floor Y for river/ocean tiles, `null` for dry land
  and fords.

Manual verification (3D swim feel isn't unit-testable): run the game, walk
into a river/ocean tile and confirm the buoyant swim transition matches
Water Lab's feel; walk across a ford and confirm normal walking (no swim
trigger); confirm collider/visual agreement (no clipping into or floating
above the carved basin) at a few different elevation levels.

## Risks / open questions carried into the plan

- Exact depth constants (1.0 WU river / 1.5 WU ocean) are a starting point;
  may need tuning once playtested against `CAPSULE_HALF_HEIGHT`/swim feel.
- `SWIM_ENTER_DEPTH_THRESHOLD`'s current visibility (private to
  `PlayerController.ts` vs. already exported for `WaterLabScene.ts`) needs
  confirming during implementation; exporting it if not already is a
  trivial, low-risk change.
