# Real dual-grid shorelines (Phase 1) — design spec

Status: drafted autonomously (this is a background/autopilot multi-phase
mission; no interactive user available for the brainstorming Q&A — see
`docs/superpowers/specs/2026-09-02-shoreline-edge-smoothing-design.md`'s
identical precedent note). Ready for review before implementation.

## Origin

`TODO/organic_world_tiles_todo.md` Phase 1: replace/augment the existing
noise-wobble shoreline (`ShorelineWobble.ts`, shipped just before this
mission started) with genuine corner-typed dual-grid geometry, using Phase
0's `DualGridCaseTable.ts`, so coastlines show real coves/points/peninsulas
— a structural fix, not another amplitude tweak on the noise wobble.

## Investigation findings

- `ShorelineWobble.ts`'s existing wobble perturbs only the **interior**
  points of a water/land boundary edge; its 2 endpoints (the tile-grid
  corners) are *always* pinned exactly at the plain grid position. This is
  why it reads as "wobbly" rather than "shaped" — the actual coastline
  *topology* (where a corner sticks out or cuts in) never changes, only a
  jiggle along an otherwise-fixed line.
- Per `docs/superpowers/specs/2026-09-02-dual-grid-case-table-usage.md`'s
  Phase 1 worked example, a "corner" for shoreline purposes is a `WorldGrid`
  tile-grid **vertex** (shared by up to 4 tiles), and its 4-corner config is
  simply the 4 surrounding tiles' own land/water classification directly —
  no voting/averaging needed. This matches the real dual-grid geometric
  fact: a render tile centered on a logic-grid vertex has its own 4 corners
  sitting exactly at the 4 surrounding logic cells' centers.
- **Key derivation (worked by hand, see "Chosen approach" below):** moving
  a shared vertex *toward* whichever single tile is the "odd one out"
  among its 4 surrounding tiles (the dual-grid `outer_corner`/`inner_corner`
  cases) always reads as that tile's corner being **cut/chamfered/rounded**
  — regardless of whether the odd tile is land or water. Verified against
  a fully-symmetric test case (a 1-tile pond, or a 1-tile land peninsula,
  each isolated in the opposite terrain): all 4 of its corners pull inward
  by the same amount, producing the classic Townscaper rounded-square
  look. This is the core mechanism this phase implements.
- **A real correctness risk found during design, not present in the old
  wobble:** the old system never moves corners at all, so any two tiles
  sharing a corner trivially agree on its position. Once corners *do* move
  (this phase's whole point), a tile whose corner is shared with a
  *diagonally* water-adjacent tile — but which itself has no *directly*
  (orthogonally) adjacent water neighbor — must still apply the exact same
  pull at that shared corner, or its ground mesh will visibly separate
  from the neighboring tile that does apply the pull. `waterAdjacency()`
  (orthogonal-only) is therefore not sufficient gating for *corner
  pull*, only for the *fine noise wobble* layer (see "Chosen approach").
- `TerrainGeometryBuilder.ts`'s header comment confirms (again, as it did
  for the noise-wobble spec) that its output buffers back **both** the
  visual mesh and the Rapier collider from the same data — so this
  invariant is preserved automatically; no separate collider-only code
  path is touched.
- Only one live terrain pipeline exists for the overworld
  (`WorldGenerator.ts` → `WorldGrid`, per
  `TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md`'s P0 note) and it
  feeds `TerrainGeometryBuilder`/`WaterMeshBuilder` directly — no
  alternate/legacy pipeline to reconcile.

## Approach

### Rejected alternatives

1. **Full render-grid restructuring** (literally switch top-surface
   rendering to the offset dual grid everywhere, the "textbook" Townscaper
   architecture). Rejected: this would require re-deriving ramp/road/
   sub-tile-texture rendering (all currently organized per logic tile) on
   an entirely different offset lattice, a much larger and riskier rewrite
   than the roadmap's own risk budget for this phase, and disproportionate
   for a fix that's specifically about the *shoreline* boundary, not all
   terrain rendering.
2. **True per-corner topological chamfer** (emit 2 new vertices at each
   `outer_corner`/`inner_corner`, actually cutting a diagonal facet the way
   `BlockKit.ts` does for buildings, rather than displacing the single
   shared vertex). This is closer to "textbook" marching squares and would
   look marginally crisper at extreme close range, but requires reworking
   the top-surface/wall/water-mesh triangulation topology at every
   affected corner (not just moving a point), touching far more of
   `TerrainGeometryBuilder.ts`'s vertex/index bookkeeping for a marginal
   visual gain over vertex displacement at this project's typical camera
   distance. Rejected for this pass; flagged as a possible future upgrade
   if vertex displacement alone doesn't read as organic enough.
3. **Corner pull gated only by direct (orthogonal) water adjacency**
   (i.e., reuse `waterAdjacency()` unchanged as the sole gate for corner
   pull, same as the noise wobble). Rejected once the diagonal-adjacency
   gap risk above was found — would silently reintroduce a real seam/gap
   in collision-critical geometry at diagonal-only water corners.

### Chosen approach: per-vertex "pull toward the odd corner", layered under the existing noise wobble

**New module, `src/world/ShorelineCornerField.ts`** (leaves `ShorelineWobble.ts`
completely unmodified — its own 13 tests keep passing unchanged, and its
noise wobble becomes a secondary fine-detail layer, exactly as the roadmap
recommended):

- `shorelineCornerPull(wg, gx, gz): readonly [number, number]` — for the
  `WorldGrid` vertex at tile-index `(gx, gz)` (touching tiles
  `NW=(gx-1,gz-1)`, `NE=(gx,gz-1)`, `SE=(gx,gz)`, `SW=(gx-1,gz)`,
  out-of-bounds reading as land — matching `waterAdjacency()`'s existing
  convention), looks up the 4-tile config in Phase 0's
  `buildDualGridCaseTable(2)` (built once, module-level, per its own
  documented calling convention). Zero unless the shape is
  `outer_corner` or `inner_corner` (exactly 1 of the 4 differs from the
  other 3); in that case, returns a displacement of
  `SHORELINE_CORNER_PULL_WU` (both axes) **toward** that lone/"minority"
  tile's diagonal direction. The minority tile's position is found
  directly in the RAW (un-rotated) 4-corner config passed to the case
  table — `config.indexOf(1)` for `outer_corner` (the lone land corner),
  `config.indexOf(0)` for `inner_corner` (the lone water corner) — **not**
  derived from the case table's canonical mask + `steps` rotation count:
  an earlier draft assumed both labels' canonical mask puts the minority
  corner at index 0 (`NW`), which is only true for `inner_corner`
  (canonical `[0,1,1,1]`); `outer_corner`'s actual canonical mask is
  `[0,0,0,1]` (lexicographically smaller than `[1,0,0,0]`), putting its
  minority corner at index 3 (`SW`) instead — a real bug caught by this
  phase's own TDD tests (the "isolated peninsula" case), fixed before
  this spec's first commit landed.
- `SHORELINE_CORNER_PULL_WU = 0.5` — chosen so the per-axis pull is
  clearly larger than the existing 0.4 WU noise amplitude (a "real shape
  change", per the roadmap's own framing) while its diagonal magnitude
  (~0.71 WU) still leaves headroom under a tile's 1.0 WU half-width, even
  combined with the smaller interior noise wobble layered on top. Subject
  to live-verification tuning (§ "Live verification").
- `shorelineBoundaryPoints(wg, T, GHW, GHH, gx0, gz0, gx1, gz1, includeNoiseWobble)`
  — the new drop-in replacement for every existing `shorelineEdgePoints()`
  call site. Computes the base line (the *existing*, untouched
  `shorelineEdgeOffsets`/noise wobble from `ShorelineWobble.ts` when
  `includeNoiseWobble` is true — i.e. this specific edge really does
  border water directly, same gating condition callers already compute
  today; otherwise a plain evenly-spaced straight line, same point count),
  then **always** adds each of the two endpoints' `shorelineCornerPull`,
  linearly interpolated across the polyline (full pull at each endpoint,
  smoothly blended in between). This is what fixes the diagonal-adjacency
  gap risk: corner pull is computed independently of whether *this*
  specific edge is a direct water boundary, so any two tiles sharing a
  vertex always agree on it, while the noise layer stays exactly as
  narrowly-scoped as before.

**Call-site changes** (the same 3 files/12 call sites `ShorelineWobble.ts`
already touches — no new call sites):

- `TerrainGeometryBuilder.ts`'s per-tile loop computes the tile's own 4
  corner pulls **once** (`shorelineCornerPull` for its NW/NE/SE/SW
  vertices) up front, reusing them in both `emitGroundSubTiles()` (top
  surface) and the 4 wall blocks below — not recomputed per call site.
  `emitGroundSubTiles()`'s `southPts`/`northPts`/`eastPts`/`westPts` are
  now computed (non-null) whenever *either* `adjacency.<side>` is true
  *or* either endpoint's corner pull is non-zero (previously:
  `adjacency.<side>` alone) — the added `nz(pull)` checks are cheap
  (pre-computed tuples, no extra table lookups) so the common fully-inland
  tile (all four pulls zero, no adjacency) still takes the exact original
  fast/no-op path. The `'edge'`-ramp call site keeps passing an explicit
  all-zero corner-pull set (mirroring its existing `NO_WATER_ADJACENCY`
  scope exclusion — see "Explicitly out of scope").
- The 4 wall blocks (south/north/east/west) gain the same
  `waterAdjacent || nz(pull0) || nz(pull1)` gating in place of today's
  bare `wg.get(...).waterDepth > 0` check, reusing the same
  once-per-tile-computed corner pulls; `includeNoiseWobble` passed through
  is still exactly the original per-side water check (so a non-water
  elevation wall that happens to pick up a small corner pull from a
  diagonal water tile never gains noise wobble, only the shape pull).
- `WaterMeshBuilder.ts`'s 4 edges (`west`/`south`/`east`/`north`) switch
  from unconditional `shorelineEdgePoints()` to unconditional
  `shorelineBoundaryPoints(..., includeNoiseWobble = <side>Dry)` — always
  called (cheap), with the existing dry/wet collapse-to-2-points logic
  unchanged other than sourcing those 2 points from the new function so
  they carry corner pull even on a water-water (non-boundary) side.

### Direction sanity-check (worked by hand, not just asserted)

For a single land tile surrounded by water on all sides (isolated
peninsula) and, separately, a single water tile surrounded by land on all
sides (isolated pond): every one of the shape's 4 corners is an
`outer_corner`/`inner_corner` case whose lone/minority tile is the
central tile itself, and the derived pull for all 4 corners points
**inward, toward that central tile's own footprint** — chamfering all 4
corners symmetrically inward, i.e. exactly the classic rounded-square
Townscaper look, for both the "small island" and "small pond" cases. This
was verified arithmetically for all 4 corners of both cases before writing
any code (see implementation plan's first task — this becomes the first
integration-style test).

### Scope

- Applies to the same water/land boundary as the existing wobble: any
  vertex where at least one of the 4 surrounding tiles' `waterDepth`
  classification differs from at least one other (i.e. corner pull is
  zero everywhere else, by construction). Water-water and land-land
  interior tiles are untouched.
- The genuinely ambiguous dual-grid `diagonal`/saddle case (2 opposite
  corners land, 2 opposite water — a checkerboard) is **left at zero
  pull**, matching the `edge` case's treatment. A real fix (the
  literature's own framing: a distinct "thin bridge/split" 6th shape)
  requires actual topology change (splitting one shared vertex into two),
  which vertex displacement alone cannot do — out of scope for this pass,
  same class of decision as `2026-09-02-shoreline-edge-smoothing-design.md`
  rejecting full marching-squares.
- The `'edge'`-shaped **ramp** path (genuinely sloped, non-water tiles at
  an elevation transition) keeps its pre-existing, pre-this-mission
  exclusion from *any* shoreline treatment (passes an explicit all-zero
  corner-pull set, mirroring its existing `NO_WATER_ADJACENCY` constant) —
  unchanged, pre-existing scope boundary from
  `2026-08-30-terrainkit-ramp-slopes-design.md`, not reopened here.
  Single-corner/outer-corner/saddle **ramp** shapes (non-planar, already
  routed through `buildQuadFace`) are likewise untouched, as before.
- Ocean, lake, and river shorelines are all in scope (unchanged from the
  existing wobble — all are just "water tile adjacent to land tile" at
  this level).
- The logical tile-grid classification used by `WaterDetection.ts`'s swim
  query and settlement/road placement's `isWaterCell()` checks is
  unchanged — same accepted, bounded visual/gameplay-logic mismatch this
  project's shoreline-wobble spec already accepted, now bounded by
  `SHORELINE_CORNER_PULL_WU` (0.5 WU) instead of the wobble's 0.4 WU.

### Testing plan

- `ShorelineCornerField.test.ts` (new, written first per TDD):
  `shorelineCornerPull()` — zero for `empty`/`full`/`edge`/`diagonal`
  configs; correct non-zero direction for `outer_corner` (verified against
  the hand-derived direction above) and `inner_corner`; magnitude never
  exceeds `SHORELINE_CORNER_PULL_WU` on either axis; deterministic;
  out-of-bounds tiles read as land; the symmetric "isolated pond" and
  "isolated peninsula" integration cases (all 4 corners pull inward by the
  same amount). `shorelineBoundaryPoints()` — endpoints equal exactly
  `corner + pull` (not the plain grid corner, a deliberate change from the
  old wobble's "endpoints never move"); interior points still carry the
  existing noise offsets when `includeNoiseWobble` is true, plus the
  interpolated pull; degenerates to the exact old wobble behavior when
  both corners have zero pull; deterministic; reversed-endpoint calls
  produce the same point set (order reversed) — the chunk/tile-agreement
  invariant.
- `TerrainGeometryBuilder.test.ts`: update the 2 existing exact-vertex
  wobble tests to compute their expected value via `shorelineBoundaryPoints()`
  instead of the raw `shorelineEdgePoints()` (an intentional behavior
  change, not a regression — the whole point of this phase). **New**
  regression test for the diagonal-adjacency gap risk found during design:
  a tile with no *direct* water neighbor but a *diagonal* one still emits
  a ground-mesh corner at the exact same pulled position as its neighbor
  tile that *does* border that water tile directly (no gap). Existing
  "no water neighbor at all" and "plain land-elevation wall" regression
  guards must keep passing byte-identical (zero pull everywhere in an
  all-dry grid).
- `WaterMeshBuilder.test.ts`: update its 1 exact-vertex test the same way;
  **new** cross-module consistency test asserting the water mesh's
  boundary point at a given shared vertex exactly matches
  `TerrainGeometryBuilder`'s land-side point at that same vertex (the most
  direct regression guard against a land/water seam).
- `tests/scene/OverworldScene.chunk-terrain-alignment.test.ts` and
  `.chunk-collider-streaming.test.ts`: re-run unmodified (neither
  references wobble/shoreline values directly, confirmed by inspection) —
  should keep passing untouched; if not, investigate before proceeding.
- Full regression suite + `tsc --noEmit`, against the fresh baseline
  established at mission start (146 tsc errors, 9 pre-existing test
  failures across 4 unrelated files) — no new failures/errors permitted.
- **Live verification** (required, no unverified completion claim): launch
  the overworld, screenshot a lake, river, and ocean shoreline before/after;
  confirm real coves/points/peninsulas are visible (not just a wobble);
  confirm no gaps/z-fighting/floating geometry at any shoreline, especially
  at diagonal-adjacency corners; confirm chunk streaming doesn't introduce
  a seam. Tune `SHORELINE_CORNER_PULL_WU` if the effect reads as too subtle
  or too extreme.

### Explicitly out of scope

- Full render-grid restructuring and true topological per-corner chamfer
  (rejected above; possible future upgrades).
- A dedicated 6th "saddle/bridge" mesh shape for the diagonal case
  (documented limitation, zero pull for now).
- Any change to `ShorelineWobble.ts` itself, the water shader, or shoreline
  decor props (all separate, already-tuned systems).
- Changing the gameplay walkable/swimmable grid resolution or any
  logic-layer water classification (unchanged, as in the prior wobble
  spec).
