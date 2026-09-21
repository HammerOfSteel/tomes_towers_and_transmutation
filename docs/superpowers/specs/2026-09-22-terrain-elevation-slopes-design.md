# Sub-task 1.3 design: real elevation (mountains/hills/valleys/slopes)

**Status:** design spec, approved by user section-by-section via
`superpowers:brainstorming`. Follows
`2026-09-22-terrain-elevation-slopes-research.md` (research pass, see
that doc for full technique inventory, codebase inventory, and the
black-gap diagnosis this spec builds on). Precedes an implementation plan
(`superpowers:writing-plans`) — **do not implement from this doc directly**;
per the governing `research-driven-world-polish` skill, a task-by-task
plan comes next and is its own review checkpoint.

Part of Overworld/Outdoor Polish Phase 1, sub-task 1.3, following sub-task
1.1 (tile/subtile dual-grid variety, closed) and sub-task 1.2 (procedural
nature-asset kit-of-parts, closed). Settlement/building architecture
remains explicitly out of scope.

---

## 1. Scope & goals

**Goal:** real elevation variety (hills/small mountains) across the
playable mid-ring — not just the world's steep forced rim — rendered as
terraced slopes with cliff texture instead of sharp uniform-height
blocks, with the tile/chunk boundary-vertex machinery hardened so the new
slope work doesn't reopen (or worsen) the logged black-gap/fall-through
issue.

**In scope:**
- Hardening `_mergedCornerPull()`/tile-boundary agreement + a new
  cross-chunk shared-vertex regression test (§2)
- `realmToWorldGrid()` quantization fix + `WorldGenerator.buildWorldGrid()`
  flat-zone/rim-bias softening, so the realm generator's existing
  ridge-noise + `mountain`-biome signal actually survives into visible
  terrain (§3)
- Multi-tile terraced ramp generation — an N-level elevation step becomes
  a staircase of existing single-level `TerrainKit.ts` ramps (§4)
- Cliff/rock-strata texture for wall faces that remain steep after
  terracing (§5)
- Live Playwright-verified repro/fix (or re-diagnosis) of the black-gap
  report (§2, §6)

**Explicitly out of scope:**
- Settlement/building code (any race/kind, any BlockKit/StoneTower*
  machinery)
- Hydraulic/thermal erosion simulation (flagged in research as a known,
  citable technique but meaningfully heavier than this pass needs —
  §2 of the research doc)
- Authored macro-landform splines/polygons as a separate system
  (Approach C, declined — the realm generator's existing ridge-noise +
  `mountain`-biome signal is the elevation source instead, per §3)
- Changes to river/lake carving (RI-2/RI-3, already shipped, untouched)
- `RealmToTerrain.ts`/`RealmRiverMesh.ts` (confirmed dead/unwired code
  paths, not part of the live pipeline — see research doc §0.4)

---

## 2. Boundary-agreement hardening (foundational — done first)

**Why first:** §4's terracing adds *more* ramp tiles at *more* tile
boundaries. Any existing gap in corner-pull/ramp-suppression bookkeeping
gets more surface area to appear on if not closed before that lands.

**Changes:**

1. **`_cornerTouchesUnpulledTile()` audit.** Enumerate every top-surface
   emission path in `TerrainGeometryBuilder.ts`
   (flat/all-four-down via `emitGroundSubTiles()`, edge ramp, single-
   corner/outer-corner/saddle ramp, road, ford) and confirm each is
   registered as "unpulled" everywhere it bypasses corner-pull. The new
   terraced multi-level ramp tiles from §4 must be added to this same
   registry when they land — terracing is not a separate suppression
   mechanism, it reuses the existing single-level ramp classification
   per intermediate tile (§4), so it only needs to be added to the
   existing registry, not given a parallel one.
2. **Cross-chunk shared-vertex regression test.** New test in
   `tests/world/TerrainGeometryBuilder.test.ts`: call
   `buildTerrainGeometryData()` twice for two adjacent chunk-sized tile
   ranges (mirroring the exact `colStart/rowStart/CHUNK_SIZE` windowing
   `OverworldScene.ts`'s real chunk loader uses), against the same
   `WorldGrid`, and assert every vertex on the shared boundary edge
   (matched by quantized world-space X/Z) has identical Y position,
   normal, and color across both independent builds. This is the
   specific coverage gap identified in the research doc (§0.3) — today's
   tests only diff vertices within one single build call.
3. **Live repro pass.** Before/alongside the above: generate a small and
   a mid-size realm via existing dev tooling, walk ramp-heavy and
   shoreline-heavy areas, and log concrete tile/chunk coordinates of any
   remaining visible gap — confirming whether it's this boundary-
   agreement class of bug or the texture-angle artifact the user's most
   recent report already suspected (research doc §0.1(e)). This is a
   required precondition for calling this section done, not optional
   polish.

**Files touched:** `src/world/TerrainGeometryBuilder.ts` (audit/fixes to
existing suppression logic — no new file needed for this section alone),
`tests/world/TerrainGeometryBuilder.test.ts` (new test).

---

## 3. Unlock the elevation signal

### 3a. Fix `realmToWorldGrid()`'s quantization

Today: `quantizeElevation()` is a naive
`Math.floor(elevation * ELEVATION_LEVELS)` applied per-cell with zero
regard for the realm's actual elevation distribution. Since the realm
generator's continent-mask + fBm + ridge-noise formula
(`elev = mVal * (noise*0.75 + ridge*0.25*roughness + 0.2)`, `RealmGenerator.ts`)
tends to produce most mid-ring cells well below `1.0`, naive flooring
compresses most of the map into the bottom 1-2 of the 8 levels regardless
of real ridge structure.

**Fix:** replace the naive floor with a distribution-aware remap:
1. Compute the realm's actual elevation value distribution once per
   generation (a cheap single pass over `RealmData.cells`).
2. Build a remap curve (e.g. a piecewise-linear or percentile-based
   stretch) tuned so `mountain`-biome cells (`elev > 0.70`, per
   `classifyBiome()`) reliably land in the top 2-3 of the 8 discrete
   levels, and the rest of the distribution spreads across the remaining
   levels instead of collapsing into 1-2.
3. Apply a light 3×3 neighbor-average smoothing pass **after**
   quantization (same technique as `RealmToTerrain.ts`'s existing
   `smoothedElevation()` — ported inline here since that module isn't
   part of the live pipeline, per research doc §0.4) so adjacent
   discrete levels don't read as sharp Voronoi-cell blobs.

### 3b. Soften `WorldGenerator.buildWorldGrid()`'s override

Today: the tower flat-zone (`flatness = max(0, 1 - tR/FR)`,
`level = round(level * (1 - flatness))`) dampens elevation gradually all
the way out to `FR` (28% of half-width) — not a hard cutoff near the
tower, but a fading multiplier that suppresses real elevation across a
large chunk of the mid-ring. The rim-bias then adds on top of whatever
survived that dampening.

**Fix:**
- Shrink the flat-zone's *effective falloff reach* so the dampening
  multiplier reaches ~0 well before `FR`'s current radius — flatness
  stays a hard, small-radius gameplay guarantee (buildable land at the
  tower) rather than a broad mid-ring suppressor. Exact radius is an
  implementation-plan/tuning detail, not fixed here — the requirement is
  "meaningfully smaller reach than today," not a specific number.
- Change the rim-bias from `level = min(MLV, round(level + rimBias*1.8))`
  (already additive — kept as-is) but audited to confirm it composes
  correctly with the now-less-aggressive flatness term (no double-
  suppression regression).
- Net effect: `mountain`-biome cells at typical mid-ring distances keep
  real elevation instead of being silently rounded toward flat.

### 3c. Tests

- Histogram/remap correctness: a synthetic `RealmData` with a known
  elevation distribution produces the expected discrete-level spread
  (not collapsed into 1-2 buckets).
- Determinism: same seed → same quantized grid (existing pattern, applied
  to the new remap logic).
- Regression test: `mountain`-biome cells at typical mid-ring distances
  (a fixed synthetic realm fixture) retain elevation at or above a
  documented threshold after `WorldGenerator.buildWorldGrid()`'s full
  post-processing — directly guards against reintroducing this
  flattening bug.

**Files touched:** `src/world/RealmToWorldGrid.ts` (quantization fix),
`src/world/WorldGenerator.ts` (flat-zone/rim-bias tuning),
`tests/world/RealmToWorldGrid.test.ts`, `tests/world/WorldGenerator.test.ts`
(new/extended tests — exact file names confirmed against existing test
layout at plan time).

---

## 4. Terraced ramp generalization

**Core idea:** an N-level elevation drop between neighboring tiles is
spread across N single-level ramp tiles in sequence (a staircase), each
still rendered by the existing, tested
`TerrainKit.classifyTileShape()`/`buildQuadFace()` — no new geometry
primitive, only a new placement pass deciding *where* ramp tiles go.

**Mechanism:**
- A new terracing pass (in `TerrainGeometryBuilder.ts`, or a new sibling
  module `TerrainTerracing.ts` if the added logic pushes the file past a
  reasonable size — exact file-split call made at plan time, matching
  this project's established practice of following existing large-file
  patterns but splitting when a file grows unwieldy) runs before tile
  classification: for each pair of adjacent tiles whose elevation differs
  by more than 1 level, it walks a path of intermediate tiles
  perpendicular to the steepest gradient and adjusts each intermediate
  tile's *effective* elevation (an input to classification, not a
  mutation of the tile's stored `WorldGrid` elevation) so it steps down
  by exactly one level per tile along that path.
- `_rawCornerElevation()`/`_tileCornerLevels()`/`classifyTileShape()` are
  unchanged — only the effective-elevation input each tile sees when
  those functions run is different, so this reuses 100% of the existing,
  tested single-level ramp machinery.
- Steep, narrow drops with no room for a multi-tile staircase (e.g. a
  cliff edge one tile wide) fall back to today's vertical wall face —
  now textured per §5 instead of left flat-tinted.
- **Physics:** `PlayerController`'s existing Rapier KCC config
  (`setMaxSlopeClimbAngle(45°)`, `enableAutostep(1.0, 0.3, false)`, per
  `src/player/PlayerController.ts:696-707`) already comfortably covers
  single-level (0.55 WU) ramp steps — confirmed from existing code, no
  physics-tuning changes required by this section.

**Tests:**
- Terracing-path unit tests: given a known elevation difference and
  direction between two tiles, the pass produces the expected staircase
  tile count and effective-elevation sequence.
- Watertightness/manifold check on a terraced region (same edge-sharing-
  count technique used for the 1.2 rock-mesh-tearing fix, applied here to
  guarantee terracing introduces no new tears).
- Extends §2's cross-chunk boundary test to a terraced region specifically
  (a staircase that happens to cross a chunk boundary must still agree
  vertex-for-vertex across the two chunk builds).

**Files touched:** `src/world/TerrainGeometryBuilder.ts` (integration
point) + new `src/world/TerrainTerracing.ts` (if split, per file-size
judgment call above) + corresponding test file(s).

---

## 5. Cliff/rock-strata texture

**Change:** the SOUTH/NORTH/EAST/WEST wall-face emission block in
`buildTerrainGeometryData()` currently pushes a flat, textureless vertex
color (`tr*d, tg*d, tb*d`, a per-direction darkening multiplier) for every
wall quad. Replace this with a small cliff-texture family — 2-3
rock-strata variants (banded sediment look), following the same
established pattern as sub-task 1.1's `TerrainTextures.ts` ground
variants and 1.2's bark/rock-facet texture families.

- **Variant selection:** deterministic from tile position + seed (the
  same `hashPosition()`-style bit-mixer pattern used for the 1.2 rock
  mesh-tearing fix), so the same wall face always picks the same variant
  across rebuilds/chunk reloads.
- **UV mapping:** vertical tiling that scales with wall height (a
  triplanar-style projection along the wall's own up axis), not a single
  quad UV stretched to fit — prevents smearing on the tallest remaining
  cliff faces (post-terracing, these should be rare/short, but must still
  look correct when they occur).
- **Scope guard:** only wall faces produced by genuine elevation steps
  get the new cliff texture. Shoreline/riverbank wall faces (already
  routed through `shorelineBoundaryPoints()`) are untouched by this
  section — no change to water-adjacent wall appearance.

**Tests:**
- Texture-variant selection determinism (same tile/wall → same variant,
  same requirement standard as existing ground-texture-variety tests).
- UV-doesn't-stretch sanity check: generated UV aspect ratio scales with
  actual wall height across a range of terraced/untеrraced wall heights.

**Files touched:** `src/world/TerrainTextures.ts` (new cliff-texture
family) or a new small sibling module if that file would grow unwieldy
(file-size call at plan time), `src/world/TerrainGeometryBuilder.ts`
(wall-face emission wired to the new texture selection instead of flat
tint), corresponding tests.

---

## 6. Testing & playtest gate

**Automated tests (consolidated from §2-§5):**
- Cross-chunk shared-vertex agreement (new, §2)
- Elevation quantization/histogram + mountain-biome-retention regression
  (new, §3)
- Terracing-path unit tests + watertightness/manifold checks on terraced
  regions (new, §4)
- Cliff-texture variant determinism + UV sanity (new, §5)
- Full existing `TerrainGeometryBuilder.test.ts`/`WorldGenerator`/
  `RealmToWorldGrid`-adjacent suites re-run green (regression guard,
  following this project's established sandbox-timeout-vs-real-regression
  triage practice — scope to relevant files with reduced parallelism
  rather than trusting a single full `npx vitest run` under contention)

**Live verification:** a Playwright pass generating a small and a
mid-size realm, screenshotting mid-ring terrain specifically (not just
the world rim) to confirm visibly varied hills/mountains with terraced
(not sharp-cliff) transitions and textured cliff faces, plus walking into
any area previously flagged as a black gap to confirm resolution or
produce a concrete re-diagnosis if it persists.

**Human playtest gate (mandatory, per `research-driven-world-polish`):**
report what changed and how to see it (dev room/seed, what to look for —
mid-ring hills specifically, terraced transitions, cliff texture, and
confirmation the black-gap report is resolved or accurately re-scoped),
then explicitly ask before starting sub-task 1.4 or any further phase
work — closing this sub-task's cycle the same way 1.1 and 1.2 closed
theirs.

---

## 7. Open items carried into the implementation plan (not decided here)

- Exact flat-zone falloff radius/rim-bias tuning constants (§3b) — a
  tuning detail for the plan/implementation step, not fixed in this spec.
- Exact file-split decisions for `TerrainTerracing.ts` and any new
  cliff-texture sibling module (§4, §5) — made at plan time based on
  actual resulting file size, per this project's established "split when
  a file grows unwieldy, don't restructure unilaterally" practice.
- Exact test file names/locations for `RealmToWorldGrid`/`WorldGenerator`
  tests (§3c) — confirmed against the actual existing test layout when
  the plan is written.
