# Ocean Shoreline, Depth Gradient & Biome Scatter — Design

**Status:** approved (autonomous decision — user unavailable at review gate;
see "Autonomy note" at the end).

## Background

RI-3 (previous task, merged) wired real swim collision onto rivers and
ocean-rim water. Immediately after, the user reported three related
problems while playtesting the live overworld:

1. Trees, rocks, roads, and enemy camps can spawn inside the sea.
2. The sea is "very shallow" — most of it can be walked/run through
   instead of swum.
3. Request: a proper sand/beach tile with nice texture/variants and some
   procedural beach-nature dressing, and — since biome work is on the
   roadmap anyway — use this pass to put in a *few* real biome building
   blocks rather than patching around the current 6-value `BiomeId`.

Investigation (this session) found that (2) is not a tuning problem — it's
a genuine, previously-undetected collision bug that defeats RI-3's water
carving. That bug is now item **A** below and must be fixed for any of the
rest of this spec to matter. Items **B** and **C** are the depth-gradient
and beach/scatter requests.

## A. Bug fix: the Y=0 safety-net floor defeats all carved water depth

`OverworldScene.enter()` creates a flat static box the size of the whole
map, top surface at world Y=0, as an "underfloor" safety net
(`PhysicsWorld.createGroundPlane(0)` — intended to catch the player if they
ever fall through a gap in the terrain trimesh).

RI-3's water carving lowers a water tile's *physical* floor
(`physicalHeightWU()`) below Y=0 whenever
`elevation * LEVEL_HEIGHT < waterDepth` — true for essentially all ocean
tiles (`elevation` is 0 or 1, `LEVEL_HEIGHT=0.55`, `OCEAN_DEPTH_WU=2.5`,
so `physH ≈ -1.95` or `-1.40`) and for many river tiles depending on local
elevation. The player's capsule falls onto the Y=0 safety plane *before*
reaching that carved floor, so `depthBelowSurface` never crosses the swim
threshold — the water is visually deep but the real collision floor is
clamped at Y=0. This is why the sea (and, by luck of this session's test
seed, most — not all — rivers) reads as "shallow" no matter what
`waterDepth` says.

**Fix:** lower the safety net so it sits beneath the deepest possible
carved floor instead of at Y=0. It only exists to catch genuine
out-of-bounds falls, not to be a load-bearing surface anywhere in the
normal map (dry level-0 tiles are already part of the real terrain
trimesh at their own height). Concretely:

```ts
// OverworldScene.enter()
this._groundBody = this.physics.createGroundPlane(-(OCEAN_DEPTH_WU + 5));
```

`PhysicsWorld.createGroundPlane(elevation)` already accepts an arbitrary
Y; no signature change needed. `main.ts`'s unrelated backroom-scene call
(`createGroundPlane(0)`) is untouched — that scene has no water carving.

## B. Ocean depth gradient (shallow near shore, deep further out)

The realm generator already classifies ocean water into two elevation
bands (`deep_ocean` below 0.28, `ocean` 0.28–0.35) before
`RealmToWorldGrid.ts` collapses both into a single `'water'` `BiomeId`
with one flat `OCEAN_DEPTH_WU`. That collapsed distinction is exactly the
raw material needed for a shallow/deep split — no new distance-transform
or biome math required, just stop discarding it.

**Change:** `RealmToWorldGrid.ts` keeps mapping both bands to `BiomeId
'water'` (unchanged — every existing `biome === 'water'` consumer keeps
working), but sets `waterDepth` per-band instead of one constant:

- realm `ocean` (shallow band, i.e. the ring nearest the coastline) →
  new `OCEAN_SHALLOW_DEPTH_WU` constant in `WaterDepthConfig.ts`. Tuned so
  a standing player wades (visible water, `setSubmersion` cosmetic
  sink) but does not cross the swim-enter threshold — this is the
  "walkable shallows" band, intentionally not swimmable, matching a real
  beach's wading zone.
- realm `deep_ocean` → existing `OCEAN_DEPTH_WU` (renamed
  `OCEAN_DEEP_DEPTH_WU` for clarity), unchanged value — the real swim
  band, exactly as RI-3 already tuned it.

This is a two-tier step, not a continuous gradient — it directly reuses
the realm generator's existing radial falloff (which already produces a
shallow ring around each landmass) rather than adding a new BFS
distance-to-shore computation. Simpler, cheaper, and matches what the
user described ("shallow at the start... deeper after a short while
out").

Rivers are unaffected — `RIVER_DEPTH_WU` stays a flat value; the user
didn't ask for river gradients and rivers already swim correctly once (A)
is fixed.

`TerrainGeometryBuilder`'s water color also gets a two-tone tint: shallow
water lighter/more turquoise, deep water the existing darker blue — a
`waterDepth`-threshold check alongside the existing `cell.biome ===
'water'` branch, not a new `BiomeId`.

## C. Sand/beach biome + scatter/prop exclusion fixes

### C1. New `'sand'` `BiomeId`

Extend `BiomeId` from 6 to 7 values: add `'sand'`. `RealmToWorldGrid.ts`
maps realm's `beach` biome to `'sand'` instead of collapsing it into
`'grass'` (its current, identity-losing treatment). Sand tiles are dry,
walkable, `waterDepth: 0` — plain land tiles from a collision standpoint,
distinguished only by biome id (rendering + scatter rules).

`TerrainGeometryBuilder` gets a `BIOME_SAND` color constant (pale
tan/cream, with the existing per-cell variant-index patchiness reused for
a bit of texture) and a variants row, following the exact pattern already
used for the other 5 biomes.

### C2. Beach scatter (a *few* procedural nature props, not full parity with forest)

New, small set of procedural (not GLTF — matching every existing prop in
this file, which are all THREE.js primitives) beach decorations, built the
same way `_makeTree`/`_placeRocks` already build their meshes:

- **Driftwood**: a thin, tilted cylinder (reuse tree-trunk primitive
  proportions, desaturated grey-brown, no canopy).
- **Dune-grass tuft**: 3-5 thin cone/blade shapes clustered, pale
  green-tan.
- **Beach pebbles**: a smaller-scale, lighter-tinted variant of the
  existing rock mesh (reuse `_placeRocks`'s geometry, new color + smaller
  scale range, sand-only placement pass).

These are placed by a new `_scatterBeachDecor()` method, called once in
the constructor next to the other scatter passes, restricted to
`cell.biome === 'sand'` tiles only. No new asset pipeline, no textures
beyond the existing canvas-noise helper already used for tree bark/canopy.

### C3. Fix prop/enemy spawns inside water

Confirmed via code read — these currently have no or insufficient water
exclusion:

- `_placeRocks()` — **no check at all**. Add `cell.biome === 'water'`
  exclusion (same idiom as `RoadGenerator.ts:93`).
- `_spawnCamps()` — **no check at all**. Add the same exclusion.
- `_addRuins()` — **no check at all**. Add the same exclusion (ruins are
  capped at 2 and ring-constrained already, but cheap to make correct).
- `_plantTrees()` / `_plantBushes()` — existing `cell.elevation < 1`
  check is insufficient: realm's shallow `ocean` band quantizes to
  `elevation === 1`, identical to ordinary dry land, so it silently lets
  trees/bushes spawn in shallow sea. Replace/augment with an explicit
  `cell.biome === 'water'` check (kept alongside the existing elevation
  check, which still correctly excludes bog). Also exclude
  `cell.biome === 'sand'` from trees (no trees on beaches) — bushes are
  allowed to stay excluded from sand too, to keep the sand strip visually
  clean for the new beach-decor pass in C2.

Roads/settlements/dungeons already correctly check `cell.biome ===
'water'` (`RoadGenerator.ts:93`, `SettlementPlacer.ts:94`,
`DungeonPlacer.ts:65`) — no change needed there. Any road-over-water
seen in screenshots is either a legitimate ford tile or a rendering/fog
perception issue, not a placement bug; out of scope for this spec.

## Out of scope

- A continuous (per-tile, distance-to-shore) depth gradient — the two-tier
  ocean/deep_ocean split satisfies the request with far less complexity
  and risk.
- Extending `BiomeId` further than the one `'sand'` addition (e.g. splitting
  grass into sub-biomes, desert, tundra distinctions) — realm already
  collapses `desert`/`savanna`/`grassland` into `grass` and
  `tundra`→`highland`, `snow`→`rocky`; revisiting those collapses is a
  separate, larger biome-system project for later, not bundled here.
- The dormant `RealmToTerrain.ts`/`RealmRiverMesh.ts` pipeline — confirmed
  (per `STUDIO-LIVE-PARITY.md`) still not the live path; this spec only
  touches the live `WorldGenerator.ts`/`OverworldScene.ts` pipeline, same
  as RI-3.
- River depth gradients (not requested, rivers already work once (A) is
  fixed).

## Testing approach

Same rigor as RI-3: TDD for all data/math changes, manual Playwright-driven
live playtest for the physics-dependent bug fix (A) and depth-gradient
tuning (B), full suite run before completion.

- `WaterDepthConfig.test.ts` — extend for `OCEAN_SHALLOW_DEPTH_WU`,
  renamed `OCEAN_DEEP_DEPTH_WU`, `physicalHeightWU()` unaffected.
- `RealmToWorldGrid.test.ts` — extend to assert `beach` → `sand` biome,
  `ocean` → shallow depth, `deep_ocean` → deep depth.
- `WorldGrid.test.ts` — extend `BiomeId` coverage for `'sand'`.
- `TerrainGeometryBuilder.test.ts` — extend for sand color branch and
  shallow/deep water tint branch.
- `OverworldScene` scatter methods don't currently have direct unit tests
  (they're constructor-time, THREE.js-coupled) — verify the water/sand
  exclusion logic via a small extraction if practical (a pure
  `isScatterAllowed(cell, kind)` helper function is worth adding so the
  exclusion rules are unit-testable instead of buried in THREE.js-heavy
  methods), otherwise verify via live playtest.
- Manual playtest (required, not optional): confirm ocean now has a real
  swim-triggering deep band; confirm the shallow band is wade-only (no
  swim, no more "running clean through the deep sea"); confirm rivers
  still swim correctly (regression check on RI-3); confirm no
  trees/rocks/camps/ruins visibly inside water; confirm beach decor
  appears on real beach tiles between land and shallow water.
- Full existing test suite run before marking complete (regression check
  on dungeon placement, settlement/road generation, minimap — all
  `BiomeId`/`WorldCell` consumers).

## Autonomy note

The user was unavailable to answer scoping/approval questions live. Per
the session's autopilot instructions, I made the following judgment calls
rather than blocking:

- Combined all three reported issues into one spec (they're tightly
  coupled — the beach tile literally marks where "shallow" begins).
- Chose a two-tier shallow/deep split over a continuous distance-to-shore
  gradient, favoring reuse of data the generator already computes over a
  new algorithm.
- Chose to add exactly one new `BiomeId` (`sand`) rather than a larger
  biome-taxonomy overhaul, keeping "some biome work now" bounded to what
  this bug fix + feature request actually needs.
- Kept beach scatter to three small prop types rather than a full asset
  set, matching the existing forest/rock scatter's scope and the
  "nice to have" framing of the original request.

If any of these calls don't match what was actually wanted, they're each
independently revisable in the implementation plan before/while it's
executed.
