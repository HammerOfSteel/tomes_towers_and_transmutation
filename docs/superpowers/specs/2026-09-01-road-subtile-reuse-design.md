# Road Sub-Tile Reuse (Bump + Tint) Design Note

Status: approved autonomously as part of a larger nature/terrain-polish backlog the user
requested (wildlife height fix → this → settlement placement fix → water/shoreline work).
User confirmed the overall order; individual quick-win items proceed without a full
brainstorm cycle, matching this session's established pattern for well-scoped, low-
ambiguity fixes that heavily reuse already-designed/tested infrastructure.

## 1. Problem

User feedback: intercity/overworld roads "just look like a drawn line... not very organic
or any real texture etc. The turning edges are nice on those roads though." Investigated
via a background research agent: confirmed roads' 4×4 sub-tile grid (`RoadPathSampler.ts`)
already exists for CLASSIFYING which sub-tiles are road vs. ground, but:

1. **Height**: road sub-tile corners are bilinearly interpolated from just the tile's 4
   REAL corners' jitter values (`jSW/jNW/jNE/jSE`, themselves `subTileBumpJitter()` calls
   at the tile's 4 corners only) — a perfectly smooth interpolated plane across the whole
   4×4 grid, unlike ground tiles' `emitGroundSubTiles()`, which independently samples
   `subTileBumpJitter()` at every sub-tile LATTICE POINT (16 points, not just 4), giving
   real per-sub-tile surface roughness.
2. **Texture**: road sub-tiles render via a single canvas texture (`RoadTextures.ts`)
   tiled uniformly with zero per-position brightness/color variation — unlike ground,
   which multiplies its texture against a per-vertex color (biome tint + border-dither +
   micro-patch variety).

Turns already look good because the sub-tile CLASSIFICATION (which tiles are road) itself
already varies smoothly along a curve (`RoadPathSampler.ts`'s point-to-segment distance
classification) — that's unrelated to and unaffected by this fix.

## 2. Approach

Both fixes directly reuse existing, already-tested infrastructure rather than building
anything new from scratch:

### 2a. Height: swap bilinear interpolation for direct per-lattice-point sampling

Replace the road sub-tile loop's `heightAt(u, w)` bilinear-interpolation helper with
direct `subTileBumpJitter(px, pz)` calls at each of the 4 sub-tile corners — the EXACT
same call ground's `emitGroundSubTiles()` makes for flat tiles (road sub-tiles are never
ramp-eligible, so a road tile's `wy` is uniformly flat, same as `emitGroundSubTiles()`'s
`heightAt()` collapsing to a constant for a flat tile's 4 identical corners). Since
`subTileBumpJitter()` is a pure function of absolute world position, this preserves the
existing seamlessness guarantee at every shared lattice point — a road sub-tile bordering
a ground sub-tile (or another road sub-tile) always computes the identical bump there,
regardless of which side "asks" for it.

### 2b. Texture: per-sub-tile vertex-color brightness tint

Add a `colors: number[]` buffer to `RoadVariantGeometry` (mirroring `GroundVariantGeometry`)
and a new `roadSubTileTint(worldX, worldZ): number` function — a deterministic per-sub-tile
brightness multiplier in `[ROAD_TINT_MIN=0.86, ROAD_TINT_MAX=1.06]`, reusing the existing
`_subTileRoll()` salted-hash helper (salt=20, distinct from every ground salt 1-6) rather
than inventing a new hash. This is a pure brightness scalar (r=g=b, same value on all 3
channels) — NOT a hue/color shift — multiplied against the road's existing single texture
map via the same "vertex color × map" technique ground tiles already use (`vertexColors:
true` + a `color` buffer attribute on the road mesh's `THREE.MeshStandardMaterial`).

## 3. Why not full neighbor-aware border-dithering / new "worn" road textures

A more complete parallel to ground's system would also (a) look up neighboring tiles'
road coverage to border-dither between two adjacent road variants, and (b) define new
"worn"/muddy alternate textures per faction for occasional micro-patch swaps (mirroring
`MICRO_PATCH_VARIANTS`). Deferred for this pass:

- (a) requires calling `computeTileRoadCoverage()` (an O(all road paths) scan) up to 4
  additional times per road tile just to peek at neighbors — a real per-frame-adjacent
  cost increase (this only runs at chunk-build time, not per-frame, but still 5x the
  scans for every road tile in a chunk) for a benefit (variety AT a road-to-road-variant
  boundary, e.g. two different factions' roads meeting) that's a much rarer case than
  "a single faction's road running in a straight line," which is the actual reported
  complaint.
- (b) requires new texture content (an alternate "worn" canvas texture per faction) —
  real art/design work, not just wiring existing pieces together.

The vertex-color tint (§2b) already directly targets the reported symptom ("no real
texture or variety... looks like a drawn line") using zero new texture content, and the
height bump (§2a) directly targets the "not organic" complaint. Both are flagged as
possible future refinements if this pass doesn't read as sufficient once verified live.

## 4. Non-goals

- No change to `RoadPathSampler.ts`'s classification/turn-mitering logic (already good,
  per the user's own feedback — "the turning edges are nice").
- No change to which biomes/settlements get which road variant/texture.
- No neighbor-aware road-to-road border dithering (§3).
- No new road texture content (§3).

## 5. Testing

- `roadSubTileTint()`: deterministic, bounded to `[ROAD_TINT_MIN, ROAD_TINT_MAX]`, not a
  constant, and (a light smoke check, not a rigorous proof) doesn't trivially rescale the
  same underlying roll as `subTileBumpJitter()` at the same position.
- `buildTerrainGeometryData()`'s existing road sub-tile test suite (11 tests, unchanged)
  must all still pass — the watertightness bound test in particular (`max - min <= 2 ×
  SUBTILE_BUMP_MAX`) is unaffected by switching from interpolated-then-clamped values to
  directly-sampled values, since each individual point was always bounded to
  `[-SUBTILE_BUMP_MAX, +SUBTILE_BUMP_MAX]` either way.
- New test: an interior road sub-tile lattice point (not one of the tile's 4 real
  corners) gets the EXACT `subTileBumpJitter()` value at that world position — the
  precise behavioral difference from the old bilinear-blend implementation.
- New test: road sub-tile colors buffer is present, bounded, brightness-only (r=g=b),
  and shows real per-sub-tile variety (not a single repeated value).
- Manual visual verification (screenshot comparison at a real straight inter-settlement
  road stretch) — same established pattern as every other shader/geometry-visible change
  this session.
