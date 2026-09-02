# Organic settlement plot layout — relaxed-mesh generator (Phase 3) — design spec

Status: drafted autonomously (background/autopilot mission, no interactive
user for the brainstorming Q&A — same precedent as Phases 1–2's design
specs). Ready for review before implementation.

## Origin

`TODO/organic_world_tiles_todo.md` Phase 3: apply the jittered-triangle →
quad → relaxed-mesh technique (Stålberg/Sylves, see the roadmap's own
"Research summary") to settlement plot layout, for a less grid-aligned,
"hand-drawn" feel — the roadmap's own framing calls this "the most
ambitious phase" with "the largest number of open questions of any phase
here."

## Investigation findings (live settlement pipeline)

- The live settlement pipeline is `SettlementGenerator.ts`'s
  `planSettlement()` → `SettlementModelGenerator.ts`'s `buildSettlement()`
  (Delaunay-seeded Voronoi wards + Chaikin-smoothed roads, via the
  `d3-delaunay` npm package) → `fillWard()` (layout-specific building-rect
  fillers per ward, e.g. `fillWardOrganically`/`fillWardGrid`) → grid
  quantization (`snapBuildingTile()`) → `applySettlementToGrid()` (writes
  road/building tiles, flattens elevation, marks the settlement zone).
- This is a **mature, heavily-tested, working system**:
  `tests/levels/settlementGenerator.test.ts` alone has 44+ tests covering
  building density, road clearance, water filtering, per-faction layout
  preferences, elevation flattening, wall generation, and population — and
  this project's own history (the cross-cutting notes at the bottom of
  `organic_world_tiles_todo.md`) explicitly records that a *previous*,
  plausible-looking settlement-placement change "empirically made things
  worse once tested against real data." Any change to the live pipeline
  needs to be treated as genuinely higher-risk than it looks on paper.
- `SettlementSpawner.ts` (a different, concentric-ring/spoke-road model)
  is confirmed unused by the live path (`OverworldScene.ts` never imports
  it) — it only backs a Studio-preview dev feature, per
  `STUDIO-LIVE-PARITY.md`. Not relevant to this phase.
- Roads are represented as `RoadPathSegment[]` (a centerline polyline +
  half-width + texture variant) consumed by `RoadPathSampler.ts`'s
  `computeTileRoadCoverage()` — both inter-settlement roads and
  in-settlement streets already share this one shape, so any new plot
  layout doesn't need a new road representation, only new *centerline*
  data if it changes street layout at all.

## Answering the roadmap's own open questions (3.1)

The roadmap explicitly asks these be flagged rather than guessed at.
Recommendations below are for whoever picks up live integration next —
**this phase's own implementation (see "Chosen approach") deliberately
does not act on them yet**, for the same reason Phase 0 shipped
infrastructure before Phase 1/2 touched anything live:

- **(a) Does relaxation run once at settlement-generation time, replacing/
  augmenting the Voronoi ward system, or generate *within* each ward's
  existing boundary?** Recommended: generate *within* each ward's own
  Voronoi polygon (as its plot subdivision), not as a wholesale
  replacement of the Voronoi step. This preserves everything the existing
  44+ tests already verify (ward type assignment by distance-to-center,
  per-faction layout preference, wall/gate placement, road hub topology)
  — all of which key off the *ward* structure — while still giving
  individual *buildings within a ward* the irregular, non-grid-aligned
  footprint shapes the roadmap is after. Replacing the Voronoi step
  entirely would touch far more of the already-tested pipeline for an
  unclear gain, since Voronoi cells are already irregular polygons at the
  ward level — the actual user complaint ("roads look like a drawn
  line," "buildings spawn oddly") is more about *individual building
  footprint regularity* than ward-boundary shape.
- **(b) How do irregular plots interact with the road network — does the
  road need to follow the relaxed grid's own edges, or can it stay on the
  current system?** Recommended: roads stay on the current system
  unchanged (Chaikin-smoothed centerlines are already a deliberately
  organic-reading curve, not the "drawn line" complaint's real target —
  re-reading the original feedback, "roads look like a drawn line" is
  about *arrow-straight inter-settlement A* paths*, which is
  `RoadGenerator.ts` territory, a different system entirely, not
  in-settlement streets). Relaxed plots would fit *between* existing
  street centerlines as an alternative to `fillWard()`'s current
  fixed-size-rect-with-clearance placement.
- **(c) Does building footprint size map onto the relaxed grid's own
  chunk/hex size, or does that need its own tuning?** Recommended: the
  relaxed mesh's base lattice unit should be tuned per settlement type
  (village/town/city) to roughly match that type's existing typical
  building footprint (`fillWard()`'s hardcoded per-ward-type sizes, e.g.
  ~14–22px for market/patriciate down to ~11–16px for slums, in
  `SettlementModelGenerator.ts`'s model-space pixel units) — a future
  integration pass should read those existing constants rather than
  inventing new ones.

## Chosen approach: ship the pipeline as a standalone, pure utility; defer live integration

Given (1) the open questions above are genuinely unresolved design
decisions the roadmap itself says need explicit answers, not
autonomous guesses, (2) the live settlement system's own documented
fragility (a past "obviously fine" change made things worse), and (3)
roadmap item 3.2's own description — *"a small, directly-tested,
engine-agnostic utility (mirrors this session's `ShorelineWobble.ts`/
`ShorelineWobble.test.ts` pattern: pure functions, deterministic,
unit-tested in isolation **before any rendering integration**)"* —
this phase ships exactly that: the jittered-triangle → quad → relaxation
pipeline as a new, pure, standalone module, with **zero changes to
`SettlementGenerator.ts`, `SettlementModelGenerator.ts`, or any other live
code path**. This is the same "prove the algorithm in isolation first"
approach Phase 0 took for the dual-grid case table, and the same
incremental-pilot caution the roadmap's own cross-cutting notes ask for.

### The algorithm (`src/world/RelaxedMeshGrid.ts`)

1. **Base lattice**: an `(nx+1) × (nz+1)` grid of points over an
   `nx × nz` unit-square region, each point initialized at its regular
   grid position.
2. **Jitter interior points**: every point NOT on the region's outer
   boundary (`i ∈ {0, nx}` or `j ∈ {0, nz}`) gets a small deterministic
   random offset (seeded by position + a seed parameter), matching
   `ShorelineWobble.ts`'s own "boundary pinned, interior perturbed"
   convention this codebase already established independently.
3. **Split each unit square into 2 triangles** along a randomly (seeded)
   chosen diagonal.
4. **Greedily pair adjacent triangles into quads**: each triangle has up
   to 3 possible partners — its same-square diagonal partner, plus up to
   2 cross-square partners along its other 2 sides (computed directly via
   `(i, j)` arithmetic against the regular lattice, not a general mesh
   traversal, since the lattice is fully regular — no half-edge data
   structure needed). Process triangles in a seeded-shuffled order;
   pair the first still-unmatched neighbor found. A triangle with no
   unmatched neighbor left is a "leftover."
5. **Handle leftovers**: split each leftover triangle into 3 quads via
   its centroid and 3 edge midpoints (guarantees no stray triangles reach
   the next step).
6. **Subdivide every quad into 4** (via edge midpoints + a center point)
   — guarantees a uniform, indexable all-quad mesh regardless of which of
   steps 4/5 produced each source quad.
7. **Relax**: build a vertex-adjacency graph from every final quad's 4
   edges; run a fixed number of Laplacian-smoothing iterations
   (`lerp(pos, neighbourMean, 0.5)` per iteration, ~10–12 iterations,
   matching the roadmap's own researched parameters), **skipping any
   vertex on the original region's outer boundary** so the overall
   footprint never shrinks/distorts and still tiles with an adjacent
   region using the same boundary points.

### Rejected alternative: wire directly into `SettlementModelGenerator.ts` now

Rejected for the reasons above — this would be exactly the kind of
"looks fine, breaks in practice" risk this project has already been
burned by once for settlement placement specifically, and the roadmap's
own open questions (3.1) aren't things an autonomous pass should resolve
by guessing when a real design conversation is what's actually needed.

## Scope

- New file only: `src/world/RelaxedMeshGrid.ts` (pure functions, no
  THREE.js/WorldGrid/settlement dependency — engine-agnostic per the
  roadmap's own description).
- No changes to any settlement/road/WorldGrid file.
- Lattice-deforming existing building modules to fit the irregular quads
  (roadmap 3.3) is **explicitly out of scope** here too — it depends on
  Phase 2's kit-of-parts pieces (deferred, see Phase 2's own design spec)
  having something concrete to deform in the first place; building it now
  would have no real target to fit.

## Testing plan

- Determinism: same seed + same region size → byte-identical output.
- Boundary pinning: every outer-boundary lattice point's final relaxed
  position exactly equals its original regular-grid position (never
  jittered, never moved by relaxation).
- All-quad invariant: every element of the final mesh has exactly 4
  vertices, for a range of region sizes (including odd/small sizes and a
  size guaranteed to produce at least one leftover-triangle 3-way split).
- Relaxation actually relaxes: for a small hand-constructed case, confirm
  an interior point's position after N iterations has moved measurably
  toward its neighbours' centroid compared to its pre-relaxation
  (jittered but unrelaxed) position.
- No degenerate output: no duplicate-position quad corners, no
  self-intersecting quad (a cheap convexity/ordering sanity check, not a
  full robust polygon validator).
- Tiling-safety smoke test: two adjacent regions built with the same seed
  and sharing a boundary produce identical points along that shared
  boundary (mirroring `ShorelineWobble.test.ts`'s own
  "chunk-boundary continuity" test).

## Explicitly out of scope

- Any change to `SettlementGenerator.ts`, `SettlementModelGenerator.ts`,
  `RoadPathSampler.ts`, or any other live settlement/road file.
- Lattice-deforming building modules to fit the irregular quads (roadmap
  3.3) — deferred pending Phase 2's kit-of-parts pieces.
- Piloting on one settlement/ward type (roadmap 3.4) — there's nothing
  live to pilot yet, by design.
- A rendering/visualization pass for the generated mesh — this phase
  produces geometry data only, matching Phase 0's own "no visual change
  on its own, by design" framing.
