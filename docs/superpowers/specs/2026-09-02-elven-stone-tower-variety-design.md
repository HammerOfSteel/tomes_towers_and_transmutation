# Elven stone-tower kit — genuine shape variety (follow-up) design spec

Status: written from a dedicated research pass (see "Research" below),
not an interactive brainstorm — the user's own explicit instruction
this round was "research first, then learn from that research, plan
how to apply/implement, then follow that plan and present in
settlement tab play in 3D." Decisions below are made autonomously per
that instruction, documented here for review rather than gated on a
Q&A round.

## Origin

After the elven stone-tower kit POC shipped (PR #46) and was actually
made reachable/visible in the Settlement Lab (faction=elven now
auto-overrides every building to a stone tower, no dropdown needed —
see the `POC_KIND_OVERRIDE_BY_FACTION` fix), the user reviewed real
towers live and said:

> "I like these towers but I feel like we could do some more work on
> them, the only variation they have now is the top and the height
> really... I would think that with procedural generation there would
> be more variety to these even at this stage."

They explicitly asked for real research before any more code: general
procedural building/tower techniques, a deep dive on Townscaper/Oskar
Stålberg's technique specifically (since they'd cited it by name
earlier), Godot addon prior art, and Three.js-compatible libraries —
this doc is the "learn from that research" step.

## Research summary

Full research (5 threads, with citations) was produced by a dedicated
research pass; see that report's structure reflected below. Key
findings:

1. **This repo already has the exact Townscaper technique implemented
   and tested, but never wired to anything**: `src/world/
   RelaxedMeshGrid.ts` — jittered-triangle lattice → greedy quad
   pairing → Laplacian relaxation (boundary pinned, interior
   perturbed), ported from Boris the Brave's Sylves "Townscaper Grid"
   tutorial and this repo's own prior Phase 3 research
   (`TODO/organic_world_tiles_todo.md`). It operates on a flat 2D
   quad-mesh region, which doesn't map cleanly onto a single circular/
   octagonal tower ring's topology (see "Why not reuse
   RelaxedMeshGrid.ts's mesh directly" below) — but its **core
   technique** (seeded jitter + relaxation/smoothing for coherent,
   non-noisy organic variation, boundary/envelope pinned) is exactly
   what's missing from the current tower kit and is what this spec
   adapts.
2. **The literal root cause of "only height/roof vary"**:
   `StoneTowerShape.ts`'s `octagonPoints()` produces one mathematically
   perfect, identical regular octagon on every floor of every tower —
   the only per-floor variable in the current code
   (`StoneTowerKit.ts:167`) is a single uniform taper scalar. Every
   other structural aspect (facet positions, center, rotation) is
   fixed.
3. **Real-world precedent for towers changing shape mid-height, not
   just uniformly scaling**: Irish round towers (Kilmacduagh leans out
   of plumb; Kinneigh has a hexagonal base transitioning to a round
   shaft above), minarets (al-Hakim Mosque's two towers share a square
   base but diverge into different upper-shaft cross-sections; Burji
   Mamluk minarets standardize octagonal-first-tier → round-second-
   tier → lantern-third-tier), pagodas (odd tiers, stepped diameter +
   projecting eave per tier), Smeaton's Tower/lighthouses (smooth
   continuous taper), Château Gaillard's beaked/asymmetric keep.
4. **Explicit recommendation, ranked by (visible variety) ÷
   (complexity)**: (1) integrate the relaxation *technique* into ring-
   outline generation, (2) per-vertex + per-floor octagon
   perturbation, (3) footprint drift/lean + per-floor rotation, (4)
   seed-selected sub-archetype silhouette profiles (biggest single
   lever for towers reading as genuinely *different kinds*, not noisy
   variations of one kind). WFC and CSG were explicitly researched and
   explicitly **not** recommended as a first move — WFC solves
   discrete content-selection given an already-varied lattice (it
   presupposes the shape variety this project is missing, rather than
   producing it) and no mature 3D-ready Three.js WFC library exists
   (`three-wfc` is 2D-only/WIP); CSG (`three-bvh-csg`) is for later
   local detail carving (openings, machicolations), not silhouette
   generation.

## Why not reuse RelaxedMeshGrid.ts's mesh directly

`buildRelaxedMeshGrid(nx, nz, seed)` returns a flat NxM all-quad mesh
over a rectangular region — built for terrain/footprint-shaped
regions, not a closed radial ring. Forcing a tower ring's 8-vertex
polygon through that machinery (e.g. by sampling boundary points from
a tiny quad patch) would produce a mesh topology mismatch: quad-grid
boundary traces are naturally rectangular/blocky, not radially
symmetric, and retrofitting it would need new, bespoke ring-extraction
code anyway — no simpler than writing a purpose-built radial jitter
function. Instead, this spec **reuses the technique** (seeded jitter +
relaxation-style smoothing, boundary/envelope pinned) applied natively
to the ring's own polar topology. This is consistent with how this
repo already treats the same underlying idea differently per topology
elsewhere: `ShorelineWobble.ts` (grid-cell corners), `BlockKit.ts`
(voxel occupancy), and `buildElvenTrunkGrid()` (per-level radius
profile with noise-driven jitter, smoothstep-tapered, satellite lobes
held apart from the trunk by visible branches) are three *different*
concrete implementations of "jitter + coherent smoothing" for three
different underlying shapes, not one shared code path. A radial
tower ring is a fourth topology, deserving its own small
implementation rather than a forced fit.

## Chosen design

Four additive, independently-toggleable techniques, all seeded from
`dna.seed` so results stay fully deterministic per building — each
directly maps to one of the research report's ranked recommendations.

### 1. Per-vertex, per-floor coherent octagon jitter (recommendation #1+#2 combined)

Generalize `StoneTowerShape.ts`'s `octagonPoints(radius)` to accept an
optional **per-vertex radius-scale array** (8 numbers, one per corner,
each near 1.0). `StoneTowerKit.ts`'s per-floor loop generates this
array per floor via a small **vertical relaxation pass**: each of the
8 "corner columns" (the same corner index across every floor) gets an
independent seeded jitter per floor, then 1 pass of 1D smoothing
across adjacent floors (`smoothed[fl] = jittered[fl] * 0.5 +
(jittered[fl-1] + jittered[fl+1])/2 * 0.5`, edges clamped) — this is
the direct topological analogue of RelaxedMeshGrid's "jitter then
relax," swapping its 2D grid-neighbor averaging for 1D floor-neighbor
averaging along one corner column. The result: no two floors have an
identical outline, but adjacent floors' outlines flow smoothly into
each other (organic bulges/dents that read as *hand-built stonework
settling unevenly*, not random per-floor noise).

Jitter magnitude: ±12% of radius per vertex (`OCTAGON_JITTER_MAX =
0.12`), small enough that the tower always reads as "an octagon that's
slightly organic," never a shape that looks broken/inconsistent.

### 2. Per-floor footprint drift + rotation (recommendation #3)

`StoneTowerKit.ts`'s per-floor loop already threads a `ringRadius`
per floor; extend it to also thread a **seeded per-floor `(offsetX,
offsetZ, rotationOffset)`** accumulator: each floor's center drifts a
small seeded delta from the floor below (clamped to a max total lean
so the tower never looks structurally implausible/floating apart),
and each floor's octagon is rotated by a small seeded delta so facet
edges don't stack in perfect vertical alignment floor-to-floor. This
directly reflects the Kilmacduagh leaning-tower precedent and breaks
the "obviously extruded from one flat profile" look even before any
per-vertex jitter is applied.

### 3. Seed-selected sub-archetype silhouette profiles (recommendation #4 — biggest single lever)

Four named per-floor **profile functions**, each mapping
`(floorIndex, totalFloors) => { radiusScale, leanScale, rotationScale
}` (multipliers applied on top of techniques #1/#2's base jitter/
drift, not a replacement for them), selected once per tower by
`dna.seed`:

- **`tapering`** (current default, refined) — smooth, continuous
  taper from base to roofline, no stepping. Precedent: Smeaton's
  Tower/lighthouse continuous taper.
- **`tiered`** — stepped radius with a small radius jump (projecting
  "eave" ring) every ~2 floors, biased toward an odd total tier count.
  Precedent: pagodas.
- **`leaning`** — minimal taper, but `leanScale` ramps up strongly
  with height (the tower visibly leans to one seeded-random side by
  the roofline). Precedent: Kilmacduagh round tower.
- **`waisted`** — tapers inward through the lower-middle floors, then
  flares back outward for the top 1-2 floors before the roof cap (an
  overhanging gallery silhouette). Precedent: machicolated galleries.

Each profile reuses 100% of the existing wall/roof-cap mesh-building
code (`buildTowerWallRing`, `buildTowerRoofCap`,
`buildWallSurfaceBlocks`) — only the per-floor radius/offset/rotation
*curve* differs, so this is purely new math feeding existing call
sites, no new rendering logic.

### 4. Deferred / explicitly out of scope for this pass

- **Per-tier facet-count change** (minaret precedent: octagon → higher-
  facet-count "near-round" upper tier) — the single most structurally
  novel idea surfaced in research, but requires generalizing
  `StoneTowerShape.ts` to variable polygon side-counts and reconciling
  wall-block generation (`buildWallSurfaceBlocks`'s course/face
  logic) across a facet-count change at a tier boundary. Real,
  valuable, but a bigger lift than 1-3 above; deferred to a later pass
  once 1-3 are shipped and verified, and only if the user still wants
  more variety after seeing them.
- **WFC, CSG, L-systems, Voronoi footprint deformation** — all
  researched, all explicitly not recommended as a first move (see
  Research summary point 4). Not pursued this pass.

## Integration points (files touched)

- `StoneTowerShape.ts` — generalize `octagonPoints()`/`octagonFaces()`
  to accept an optional per-vertex radius-scale array (default: all
  1.0, i.e. today's exact regular-octagon behavior — fully backward
  compatible, existing callers/tests unaffected).
- New file `StoneTowerSilhouette.ts` — the 4 named profile functions
  + the per-floor jitter/relax/drift math (kept separate from
  `StoneTowerKit.ts`'s assembly loop and `StoneTowerShape.ts`'s pure
  geometry, matching this repo's small-single-responsibility-file
  convention).
- `StoneTowerWallSurface.ts` — `buildWallSurfaceBlocks()` needs the
  per-vertex radius array threaded through (currently takes one scalar
  `radius`); `buildWallSurfaceTextured()` similarly (its
  `CylinderGeometry` approach can't express per-vertex jitter directly,
  so Strategy T falls back to using the *average* of the per-vertex
  radii — an accepted, documented simplification, since Strategy T is
  the non-default/comparison-only strategy).
- `StoneTowerKit.ts` — per-floor loop now calls into
  `StoneTowerSilhouette.ts` for the profile-driven radius array/
  offset/rotation, applies it to `buildTowerWallRing` (which gains
  `offsetX`/`offsetZ`/`rotationOffset` params), and picks one profile
  by seed at the top of `buildElvenStoneTower()`.

## Testing plan

- Pure-function unit tests for `StoneTowerSilhouette.ts` (deterministic
  per seed, per-vertex jitter within documented bounds, relaxation
  actually smooths — adjacent floors' same-corner values differ less
  after relaxation than before, profile functions produce documented
  qualitative shape e.g. `tiered`'s radius is non-monotonic between
  tier floors).
- `StoneTowerShape.test.ts` additions: per-vertex radius array
  produces the documented perturbed positions; default (all-1.0) array
  is byte-identical to the existing regular-octagon output (backward
  compatibility).
- `StoneTowerKit.test.ts`/`StoneTowerWallSurface.test.ts` additions:
  two different seeds produce measurably different vertex positions
  for the "same" floor (proof the complaint is fixed); same seed is
  fully deterministic (reproducibility preserved).
- Live verification: Settlement Lab, faction=elven (auto-overridden to
  watchtower), several seeds — visually confirm towers no longer look
  like a uniformly-scaled repeat of one shape.

## Non-goals

- Not changing the wall-surface strategy choice (Strategy G/real
  blocks stays default), roof-cap variants, or hybrid stone+living-
  tree decoration — those already vary appropriately and are not what
  the user flagged.
- Not touching any other race's building generation.
- Not attempting per-tier facet-count changes this pass (see
  "Deferred" above).
