# Design: Lakes + Hydrology Unification (Biome/Terrain Overhaul Phase 3)

Status: approved for implementation
Roadmap: `docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md` (Phase 3)

## 1. Problem statement

Two independent, non-matching river implementations exist today:

- **Live** (`HydrologyGenerator.ts`): operates on the real `WorldGrid`,
  4-directional downhill walk from `config.riverCount` high-rim source
  tiles, scored by `elevation*100 + distToCenter*0.5`, terminates at the
  tower flat-zone. Fully wired: `waterDepth` carving, collision, ford
  retagging, swim detection. This is the **only** river implementation any
  player ever experiences in the actual game.
- **Studio preview** (`RealmGenerator.ts`'s inline block): operates on
  `RealmData.cells`, 8-directional *probabilistic* per-cell walk (not
  count-controlled — driven by `roughness` and a per-cell dice roll),
  Chaikin-smoothed into spline points. Used only by Overworld Studio's
  Realm-tab 2D canvas preview.

`RealmRiverMesh.ts`'s `buildRiverMesh()` (a real 3D ribbon-mesh builder for
the spline rivers) is dead code — zero callers outside its own test file.
Only its `RiverHeightSampler` type alias is reused elsewhere (by
`SettlementSpawner.ts` and `SettlementRoadMesh.ts`, as a generic
`(worldX, worldZ) => number` function-shape type, unrelated to rivers
specifically).

Separately, `config.lakeCount` exists in `WorldGenConfig` but is completely
unread anywhere — there are no lakes in the live game today.

**Goal**: make Studio's preview river shape match what the live game
actually renders (same algorithm, not just "close enough"), and add real
lake generation that participates correctly in swim collision, road
avoidance, and terrain rendering — reusing the RI-3 swim-collision
machinery (`waterDepth`, `TerrainGeometryBuilder` carving,
`WaterDetection.getWaterInfoAt()`) already proven for rivers.

## 2. Hydrology unification architecture

Extract the **already-shipped, already-tested** live algorithm's two
distinct phases out of `HydrologyGenerator.ts` into a new pure,
grid-shape-agnostic module, `src/world/RiverFlow.ts`:

```ts
export interface RiverFlowSource { col: number; row: number; }

// Phase A: pick well-spaced high-elevation rim sources.
export function selectRiverSources(
  width: number, height: number,
  elevationAt: (col: number, row: number) => number,
  sourceMinLevel: number,      // absolute elevation threshold
  sourceMinRadius: number,     // tile-radius from center, inclusive
  sourceMinSpacing: number,    // tile-distance between chosen sources
  count: number,
  rand: () => number,
): RiverFlowSource[]

// Phase B: walk one river downhill from a source tile.
export function flowDownhill(
  source: RiverFlowSource,
  width: number, height: number,
  elevationAt: (col: number, row: number) => number,
  isRiver: (col: number, row: number) => boolean,  // already-claimed tiles
  terminateRadius: number,     // stop once within this radius of center
  maxSteps?: number,           // default 512, matches today's MAX_STEPS
): RiverFlowSource[]
```

Both functions are direct, behavior-preserving extractions of
`HydrologyGenerator.ts`'s existing `_flowDownhill` and its inline
source-selection block — same 4-directional neighbor set, same scoring
formula, same termination rules, same Fisher-Yates shuffle+spacing logic.
No behavior change for the live path; this is a pure refactor there.

`HydrologyGenerator.ts` becomes a thin `WorldGrid` wrapper: builds
`elevationAt`/`isRiver` closures around `grid.get(...)`, calls the two
`RiverFlow.ts` functions, keeps `_markRiverPath` (river-tile +
`waterDepth`/`river_bank` marking — genuinely `WorldGrid`-specific, stays
put) unchanged.

`RealmGenerator.ts`'s inline probabilistic 8-directional river block is
**deleted and replaced** with a call to the same two `RiverFlow.ts`
functions, wrapped around `RealmData.cells` (`elevationAt(col,row) =>
cells[row][col].elevation`, `isRiver` backed by a local `Set<string>` of
claimed cells since `RealmCell` has no `feature` field). Source count uses
Studio's own existing `maxRivers = 4 + roughness*8` heuristic (unchanged) —
**not** wired to `config.riverCount`, because `generateRealmData()` has no
`WorldGenConfig` dependency today and the live path never reads
`RealmData.rivers` at all — confirmed via grep: zero references to
`realm.rivers`/`.rivers` in `WorldGenerator.ts` or `RealmToWorldGrid.ts`.
`WorldGenerator.ts` calls `generateHydrology()` separately, entirely
independently of whatever `generateRealmData()` computed for its own
preview-only `rivers` field.
This means: **same algorithm, independently-derived counts per caller** —
sufficient for the stated goal (matching river *shape/behavior*, not
requiring an unrelated config plumbing change with no live consumer).

`RealmData.rivers: RealmRiver[]` keeps its existing shape (`{points:
Vec2[]}`) for minimal Studio-preview-rendering churn, but `points` is now
the raw grid-aligned path (one point per tile center, still passed through
`chaikin()` for a lightly-smoothed preview line — purely cosmetic, no
longer changing the underlying path's grid-based shape/logic).

**Deletion**: `RealmRiverMesh.ts`'s dead code (`buildRiverMesh`,
`makeHeightSampler`, `gridToWorld`, `BuiltRiver`/`BuildRiverMeshOptions`,
the width/offset constants) is removed. Its still-used `RiverHeightSampler`
type alias is relocated to a new minimal file, `src/world/HeightSampler.ts`
(just the one type, no logic), and `SettlementSpawner.ts` /
`SettlementRoadMesh.ts` update their import. `RealmRiverMesh.ts` and
`tests/world/RealmRiverMesh.test.ts` are deleted outright once nothing
imports from them.

## 3. Lakes design

New pure module `src/world/LakeSiting.ts`, mirroring `RiverFlow.ts`'s
split:

```ts
export interface LakeSite { col: number; row: number; }

// Phase A: find local-minima candidate tiles (a tile is a candidate if
// every one of its up-to-8 neighbors has elevation >= its own), well
// spaced, and pick `count` of them.
export function selectLakeSources(
  width: number, height: number,
  elevationAt: (col: number, row: number) => number,
  isBlocked: (col: number, row: number) => boolean,  // already water/claimed
  minSpacing: number,
  count: number,
  rand: () => number,
): LakeSite[]

// Phase B: flood-fill the connected same-elevation basin from a source,
// capped at maxSize tiles (a simple BFS over orthogonal neighbors at the
// same elevation level, stopping at blocked/out-of-bounds tiles).
export function floodFillBasin(
  source: LakeSite,
  width: number, height: number,
  elevationAt: (col: number, row: number) => number,
  isBlocked: (col: number, row: number) => boolean,
  maxSize: number,
): LakeSite[]
```

New `WorldGrid`-wrapper file `src/world/LakeGenerator.ts` (parallel
structure to `HydrologyGenerator.ts`): `generateLakes(grid, config, seed)`
reads `config.lakeCount` (finally making this field real), selects sources
via `selectLakeSources`, flood-fills each via `floodFillBasin` (cap: a
generous fixed tile budget, e.g. 40 tiles, tuned during implementation so
lakes read as small ponds rather than sprawling seas), and marks every
matched cell:

```ts
grid.set(col, row, { feature: 'lake', walkable: false, waterDepth: LAKE_DEPTH_WU });
```

Same neighbor-marking pattern as rivers: orthogonal neighbors of a lake
tile that are still `feature: 'none'` get tagged `river_bank` — reusing
the existing bank tile type rather than adding a redundant `lake_bank`,
since both mean the same thing ("dry land immediately touching water,"
used today only by `ResourceNodePlacer.ts` for essence-blossom placement
and has no river-specific meaning otherwise).

`generateLakes()` runs **after** `generateHydrology()` in
`WorldGenerator.buildWorldGrid()` (rivers claim their tiles first; lake
source selection's `isBlocked` check excludes any tile already `feature !==
'none'`, so a lake will never overlap a river or its banks).

New `WorldCell.feature` value: `'lake'` added to the `TileFeature` union in
`WorldGrid.ts`. New constant `LAKE_DEPTH_WU = 2.0` in
`WaterDepthConfig.ts` — numerically the same as `RIVER_DEPTH_WU` today (a
deliberate, documented choice: both need to reliably trigger real swim
state per the file's existing depth-tuning rationale), but kept as its own
named constant so a future re-tuning of one doesn't silently affect the
other.

**Fords do not apply to lakes.** Fords exist because roads must cross
rivers to connect settlements on opposite banks. Lakes are not spanned by
inter-settlement roads in this phase (see below) — a road may run *up to*
a lake shore but a route that would need to *cross* one is handled the
same way the ocean-crossing fix already handles impassable water: the edge
is skipped rather than drawing a road through it.

## 4. RoadGenerator.ts lake-avoidance

Lakes sit on ordinary land biomes (not a special lake `BiomeId`), so the
existing ocean-only biome checks (`_moveCost`'s `cell.biome ===
'deep_ocean' || 'ocean'`, and the recently-added `_pathCrossesWater()`)
would not catch them. Both need a parallel `feature === 'lake'` check:

- `_moveCost`: `if (cell.biome === 'deep_ocean' || cell.biome === 'ocean' || cell.feature === 'lake') return Infinity;`
- `_pathCrossesWater()`: same additional `feature === 'lake'` condition
  alongside its existing ocean-biome check.

This exactly mirrors the ocean-crossing bug just fixed (`cd930d3`) — same
shape of fix, same reasoning, applied to the new water type.

## 5. Terrain rendering + minor consumers

- `TerrainGeometryBuilder.ts`: add a `feature === 'lake'` color branch
  alongside the existing `BIOME_RIVER` tint (a new, distinct
  `BIOME_LAKE` — a calmer, slightly greener blue than the river tint, to
  read visually as still water vs. flowing water). Lakes use the same
  `waterDepth`-based carving path already built for rivers in
  `buildTerrainGeometryData()` — no new carving logic needed, since that
  code keys off `waterDepth > 0`, not the specific feature value.
- `WaterDetection.getWaterInfoAt()`: already keys off `waterDepth > 0`
  generically — needs no change for lakes to trigger real swim state.
- `ResourceNodePlacer.ts`: its existing `feature === 'river' ||
  'river_bank' || 'river_ford'` essence-blossom-siting check gains `||
  feature === 'lake'` (one-line addition — lakeside blossoms are a natural
  extension of riverside ones, and `river_bank` is already reused for lake
  shorelines per Section 3, so lake tiles themselves are the only value
  missing from this check).
- `OverworldScene.ts` line ~2739 (a narration/direction-finding helper
  checking `feature === 'river' || biome === 'ocean' || 'deep_ocean'`)
  gains `|| feature === 'lake'` for the same reason (consistency, trivial
  addition, avoids a confusing gap where a settlement visibly next to a
  lake never mentions "near water").

## 6. Studio preview rendering

`overworld-studio.ts`'s Realm-tab canvas:

- Rivers: the existing "stroke `RealmData.rivers[].points` as a line"
  drawing code is unchanged in *mechanism* (still strokes a point list) —
  only the underlying point list's shape changes (grid-aligned instead of
  probabilistic-spline), which naturally makes the preview look blockier/
  axis-aligned. This is a deliberate accuracy improvement: it now matches
  what `TerrainGeometryBuilder`'s `BIOME_RIVER` tint actually renders in
  the live game, rather than a smoother line that overstated the real
  shape.
- Lakes: new `RealmData.lakes: RealmLake[]` field (`interface RealmLake {
  cells: Vec2[] }` — an unordered tile-footprint list, unlike a river's
  ordered path, since a lake is a filled area not a path). New canvas
  drawing block: fill each lake's cells with a lake-colored square,
  matching how other biome tiles are already filled cell-by-cell in the
  same preview.
- No new Studio UI controls are added for `riverCount`/`lakeCount` in this
  phase (out of scope — Studio's preview count stays independently
  derived per Section 2/3's `maxRivers`-style heuristics; a real
  slider-driven parity is a separate, later concern if ever needed).

## 7. Testing strategy

- New `tests/world/RiverFlow.test.ts`: exhaustive coverage of
  `selectRiverSources()` (count/spacing/min-level/min-radius honored) and
  `flowDownhill()` (terminates at flat-zone radius, terminates at
  elevation-0, avoids already-claimed river tiles, respects `maxSteps`
  cap, picks the lowest-scoring neighbor).
- New `tests/world/LakeSiting.test.ts`: exhaustive coverage of
  `selectLakeSources()` (local-minima detection correctness, spacing,
  count) and `floodFillBasin()` (stays within same-elevation region,
  respects `isBlocked`, respects `maxSize` cap, handles a
  single-tile-only basin).
- `tests/world/HydrologyGenerator.test.ts`: existing suite must pass
  unchanged (behavior-preserving refactor) — re-run as a regression gate,
  not modified except perhaps one new test asserting it still produces
  the same river shape for a fixed seed as it did pre-refactor (golden/
  snapshot-style check), if practical.
- New `tests/world/LakeGenerator.test.ts`: `config.lakeCount` lakes get
  placed, `waterDepth`/`walkable`/`feature` set correctly, doesn't overlap
  rivers, respects the tile-size cap.
- `tests/world/RealmGenerator.test.ts`: update river-related assertions
  for the new grid-based shape (points are integer-tile-centered vs. the
  old free-form spline); add lake-related assertions for the new `lakes`
  field.
- `tests/world/RoadGenerator.test.ts`: add lake-avoidance tests
  (mirroring the 3 ocean-crossing tests just added) — impassable-lake
  skip, unaffected land-only fallback, same-landmass connection despite a
  lake elsewhere.
- `tests/world/TerrainGeometryBuilder.test.ts`: add a lake-tile carving/
  color test (parallel to the existing river carving test).
- `tests/world/WorldGrid.test.ts`: extend for the new `'lake'`
  `TileFeature` value.
- Delete `tests/world/RealmRiverMesh.test.ts` alongside the source file.
- Full-suite + `tsc --noEmit` regression gate at the end, same baseline
  (12 pre-existing failures, 145 `tsc` errors) as every prior phase this
  session.
- Manual/visual verification: generate a world in Overworld Studio and in
  the live game, confirm lakes appear as distinct still-water features
  separate from rivers/ocean, confirm a lake is swimmable (real swim
  transition, matching rivers), confirm roads route around lakes instead
  of through them. Attempt via the Playwright/dev-server workflow used
  earlier this session; if browser automation is unavailable/hangs (a
  recurring issue this session), fall back to automated-test-only
  verification and flag the gap explicitly, per this session's established
  precedent (Phase 2 shipped the same way).

## 8. Non-goals / explicitly deferred

- No Studio UI sliders for river/lake count in this phase.
- No lake-to-lake or lake-to-river connecting channels (each lake is a
  single isolated flood-filled basin).
- No variable lake depth/shape (bowl bottoms, ramped lake shores) — lakes
  use the same flat-`waterDepth`-basin approach rivers already use.
- No bridges (a road physically crossing a river/lake via a raised
  span) — fords remain the only river-crossing mechanism; a road that
  would need to cross a lake is skipped entirely (Section 3). Bridges are
  a candidate for a later phase, out of scope here.
