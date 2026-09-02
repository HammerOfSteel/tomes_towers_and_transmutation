# Shoreline edge smoothing (wobbly water/land boundary) — design spec

Status: drafted autonomously (user unavailable for the brainstorming Q&A —
see "Autonomous decisions" note). Ready for review before implementation.

## Origin

Repeated user feedback (explicitly "the 5th time" as of this pass) that
river/lake/sea shorelines look "very blocky." Two screenshots (a small lake,
a sea/beach edge) both show a hard, tile-grid-aligned sawtooth/staircase
silhouette where water meets land — this is the literal boundary SHAPE, not
a texture or prop issue (both of those were already addressed in earlier
passes and are not what's being complained about here).

## Autonomous decision note

The user was unavailable for the brainstorming Q&A this round. One load-
bearing question was resolved in favour of the lower-risk option (see
"Scope" below): this fix is **purely visual** — the gameplay walkable/
swimmable grid, physics collider, and settlement/road water-placement
checks all keep using the existing tile-grid classification, completely
unchanged. Only the rendered mesh gets a smoother boundary. The user should
confirm this trade-off (a few tens of centimetres of invisible mismatch
between "what you see" and "where the game thinks the water edge is")
is acceptable before implementation proceeds.

## Investigation findings

- The boundary is **100% tile-grid-aligned with zero smoothing today**.
  Confirmed via direct code reading: `TerrainGeometryBuilder.ts` adds a
  single flat vertical wall quad per tile-edge whenever a neighbour tile's
  carved (physical) height is lower — always a straight line running the
  tile's full 2 WU width, with sharp corners at every tile boundary.
  `OverworldScene._buildWaterMesh()` (the separate, semi-transparent water
  *surface* mesh) is even simpler: one flat, non-subdivided quad per water
  tile, also tile-grid-aligned. Both are the source of the visible zigzag.
- The existing sub-tile system (`GROUND_SUBDIVISIONS = 4`, i.e. a 4×4
  lattice per 2×2 WU tile, 0.5 WU per sub-tile) only varies tile *content*
  (height bump jitter, texture variant, border-color dithering) — its
  outer boundary always coincides exactly with the tile's square edges.
  Recent passes (`water-floor-texture-variety`, `water-riverbank-decor-
  props`) both improved content within this grid but explicitly deferred
  the boundary *shape* itself as "a fundamentally harder problem...
  deserving its own focused design/implementation pass" — this spec is
  that pass.
- No marching-squares/contour-smoothing code exists anywhere in
  `src/world/` today for terrain — this is a greenfield problem. (A
  superficially similar technique exists in `BlockKit.ts` for building
  *corner chamfering*, and in `RealmGenerator.ts` for wobbling abstract
  realm-map biome borders in noise-space — neither touches the live
  terrain mesh's water/land boundary.)
- `RealmRiverMesh.ts` (a separate spline-ribbon river mesh approach) was
  already deleted from the codebase; the live game exclusively uses the
  simpler per-tile-carving `WorldGrid` + `TerrainGeometryBuilder` pipeline
  described above. Nothing to reconcile with an alternate pipeline.
- A deterministic seeded 2D noise utility already exists and is reused
  elsewhere in the codebase: `createNoise2D(seed): (x, y) => number`
  (`src/core/SimplexNoise.ts`, returns values in [-1, 1]) — this spec reuses
  it rather than inventing a new noise function.
- Tile size `T = 2` world units. A typical small lake spans roughly 5–8
  tiles across; rivers run 5–30 tiles long.

## Approach

### Rejected alternatives

1. **Full marching-squares/SDF contour extraction** (a genuinely organic,
   arbitrarily-curved coastline derived from a continuous signed-distance
   field sampled across the whole map). This is the "most correct" fix but
   requires solving ambiguous-cell topology, re-triangulating both land and
   water meshes' interiors near every boundary cell, and very careful
   gap/z-fighting testing across every shape marching squares can produce.
   Rejected as disproportionate risk/effort for this pass — flagged as a
   possible *future* upgrade if this spec's simpler approach still isn't
   enough (see "Explicitly out of scope").
2. **Corner-chamfering only** (cutting sharp 90° corners, the same trick
   `BlockKit.ts` already uses for building corners). Rejected: the
   screenshots show a fine sawtooth running along entire tile edges, not
   just occasional sharp corners at otherwise-straight runs — chamfering
   corners alone wouldn't touch the per-edge zigzag that's actually being
   complained about.

### Chosen approach: noise-perturbed edge polylines, shared between meshes

Every water-adjacent tile edge (a straight line between two dry/wet tiles
today) is replaced with a **wobbly polyline**: the same 2 endpoints (the
tile-grid corners, always left exactly in place) plus 3 new interior
points along the edge, each displaced perpendicular to the original
straight edge by a small amount driven by `createNoise2D`, sampled at that
point's own world position.

**Why endpoints stay fixed:** tile corners are shared by up to 4
neighbouring tiles/edges. Leaving them un-perturbed means every edge that
touches a given corner — including an adjacent tile's *different* edge
meeting the same corner at an L-shaped shoreline turn — automatically
lines up with zero extra corner-case logic. Only interior points move.

**Why the same function must be called on all 3 sides:** a single shared
utility, `computeWobblyEdgePoints(x0, z0, x1, z1, noiseSeed)`, is called
identically by:
1. `TerrainGeometryBuilder`'s dry-land top-surface boundary generation
   (fills the land side up to the wobbly line instead of the straight
   tile edge),
2. the same file's wall-face generation (the wall ribbon follows the
   wobbly line down to the neighbouring water tile's carved floor height,
   instead of one flat quad),
3. `OverworldScene._buildWaterMesh()`'s per-tile water quad (its
   land-facing edge(s) follow the identical wobbly line).

Because all three call the same pure, deterministic function with the
same edge endpoints and the same seed, they compute **identical** points
— the three meshes are guaranteed to meet with no gap and no overlap, by
construction, without needing any cross-mesh coordination logic beyond
"call the same function."

**Noise tuning:** the noise is sampled at a low frequency (roughly one
full wave per 4–6 WU, i.e. 2–3 tiles) so the wobble reads as a slow,
flowing curve rather than jittery per-point noise, with a small amplitude
(~0.15–0.2 WU, well under half a sub-tile) — enough to break the dead-
straight tile edge without ever causing a wall segment to double back on
itself or poke through an adjacent segment.

### Scope

- Applies only to tiles where the boundary is a straight water/land
  cutline today: any tile edge where one side has `waterDepth > 0` and the
  other has `waterDepth === 0`. Water-water and land-land internal edges
  are completely untouched (zero risk, zero visual change) — this keeps
  the change's footprint limited to exactly the boundary tiles the
  complaint is about.
- **Visual only.** `PhysicsWorld`'s collider, `WaterDetection.ts`'s swim
  query, and settlement/road placement's `isWaterCell()` all keep using
  the existing tile-grid `waterDepth`/`feature` classification, completely
  unchanged — none of them are touched by this spec. The wobble is at
  most ~0.2 WU (a tenth of a tile), imperceptible as a gameplay
  discrepancy in practice.
- Ocean shorelines, lake shorelines, and river banks are all in scope —
  the same shared utility handles all three, since they're all just
  "water tile adjacent to land tile" at the mesh-generation level.

### Testing plan

- `ShorelineEdge.test.ts` (new): `computeWobblyEdgePoints()` — endpoints
  are always exactly the input corners (never perturbed); calling it twice
  with the same edge (same 2 endpoints, same seed) returns identical
  points (determinism, and the cross-mesh-alignment guarantee); the 3
  interior points' perpendicular offsets stay within the configured
  amplitude bound; a horizontal edge (`z0 === z1`) perturbs only Z, a
  vertical edge (`x0 === x1`) perturbs only X.
- Extend `TerrainGeometryBuilder.test.ts` and the existing
  `OverworldScene.chunk-terrain-alignment.test.ts`/`chunk-collider-
  streaming.test.ts` suites to confirm: (a) the collider footprint is
  unchanged (still tile-grid-aligned — this is the regression check that
  proves the "visual only" boundary held), (b) no new gaps appear between
  adjacent chunks' wobbly edges at chunk boundaries (a wobbly edge must
  not depend on which chunk is rendering it, since two chunks can each
  render one side of the same shared tile edge).
- Manual live-browser verification (required, no unverified completion
  claim, matching this whole project's established rigor): screenshot a
  lake, river, and ocean shoreline before/after; confirm the sawtooth is
  visibly softened; confirm no gaps/z-fighting/floating geometry at any
  shoreline; confirm swim/walk transitions still feel correct at the
  (unchanged) gameplay boundary; confirm chunk streaming (loading a new
  chunk at runtime) doesn't introduce a seam at the chunk edge.

### Explicitly out of scope

- Changing the gameplay walkable/swimmable grid resolution (stays exactly
  as coarse as it is today — see "Autonomous decision note").
- A full marching-squares/SDF organic contour (rejected above as
  disproportionate for this pass; noted as a possible future upgrade if
  this spec's simpler wobble still isn't enough).
- Any change to the water shader/shimmer/foam look itself (separate,
  already-tuned system — `WaterMaterial.ts` — untouched).
- Any change to the shoreline decor props (reeds/rocks/seaweed) — already
  addressed in a separate, smaller fix shipped just before this spec.
