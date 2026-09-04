# Elven Stone-Tower Variety (follow-up) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the elven stone-tower kit genuine per-tower and per-floor shape variety (not just height/roof-cap swap), per the design spec at `docs/superpowers/specs/2026-09-02-elven-stone-tower-variety-design.md`. Four additive techniques: (1) per-vertex, per-floor coherent octagon jitter (jitter-then-relax, adapted from `RelaxedMeshGrid.ts`'s technique to this ring topology), (2) per-floor footprint drift + rotation, (3) 4 seed-selected sub-archetype silhouette profiles (`tapering`/`tiered`/`leaning`/`waisted`), (4) wiring all of the above through the existing wall/roof-cap machinery with zero new rendering code paths.

**Architecture:** `StoneTowerShape.ts` gains an optional per-vertex radius-scale array parameter (backward compatible — default all-1.0 reproduces today's exact regular octagon). A new `StoneTowerSilhouette.ts` owns the profile functions and the jitter/relax math (pure functions, no THREE.js dependency, matching `StoneTowerShape.ts`'s own purity). `StoneTowerWallSurface.ts`'s `buildWallSurfaceBlocks()` accepts the per-vertex radius array; `buildWallSurfaceTextured()` falls back to the array's average (documented simplification, Strategy T is comparison-only). `StoneTowerKit.ts`'s per-floor loop calls into `StoneTowerSilhouette.ts` once per tower (profile pick) and once per floor (jitter/drift/rotation), threading the results into `buildTowerWallRing`/`buildWallSurface`.

**Tech Stack:** TypeScript, pure functions + `mulberry32` seeded PRNG (existing convention throughout this kit), Vitest.

## Global Constraints

- **Backward compatibility is required**: existing `StoneTowerShape.test.ts`/`StoneTowerWallSurface.test.ts`/`StoneTowerKit.test.ts` tests must keep passing unmodified where they test the *default* (all-1.0 / no-op) behavior — only add new tests for the new optional parameters, don't rewrite existing assertions unless a signature genuinely changed shape.
- Follow strict TDD: write the failing test, confirm it fails, implement, confirm it passes, commit.
- Commit messages: write to a temp file and use `git commit -F <tempfile>` (avoids double-quote mis-parsing), ending with `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`.
- No new npm dependencies (confirmed unnecessary by research — `d3-delaunay` already available if ever needed, not used this pass).
- Only elven's stone-tower kit files are touched. No other faction, no other elven building kind, no shared BlockKit/FactionBlockTextures files beyond what's already imported.

---

### Task 1: Per-vertex octagon radius-scale support in `StoneTowerShape.ts`

**Files:** Modify `src/world/buildings/StoneTowerShape.ts`; modify `tests/world/buildings/StoneTowerShape.test.ts` (add, don't remove existing tests).

- [ ] Add optional second parameter to `octagonPoints(radius, vertexScales?: number[])`: when given, `vertexScales` must have exactly 8 entries (one per corner, in the same order/winding as the existing output); corner `i`'s radius becomes `radius * vertexScales[i]` instead of the uniform `radius`. Omitted (or `undefined`) reproduces today's exact regular-octagon output byte-for-byte — verify with a test asserting `octagonPoints(2)` (no second arg) still `toEqual` a snapshot of the current output.
- [ ] Thread the same optional `vertexScales` through `octagonFaces(radius, vertexScales?)` (its `a`/`b` come from `octagonPoints`, so this should require no logic changes beyond passing the parameter through — `normalAngle` per face is still the bisector of its own two corners, now at their individually-scaled positions).
- [ ] New tests: (a) a `vertexScales` array with one entry `> 1` produces a point farther from the origin than the base radius at exactly that corner, others unaffected; (b) `octagonFaces` with a `vertexScales` array produces faces whose `a`/`b` match the corresponding scaled `octagonPoints` output; (c) passing an array with the wrong length throws (or, if simpler, is defensively ignored and falls back to unscaled — choose whichever and document it in a code comment; throwing is preferred since a wrong-length array is a caller bug, not organic input).
- [ ] Run `npx vitest run tests/world/buildings/StoneTowerShape.test.ts` — all pass (existing + new).
- [ ] Commit: "feat: add per-vertex radius scaling to octagon shape math".

### Task 2: `StoneTowerSilhouette.ts` — jitter, relax, drift, and profile functions

**Files:** Create `src/world/buildings/StoneTowerSilhouette.ts`; create `tests/world/buildings/StoneTowerSilhouette.test.ts`.

**Interfaces produced:**
- `OCTAGON_JITTER_MAX = 0.12` (exported constant, per design spec).
- `buildFloorVertexScales(seed: number, floorCount: number): number[][]` — returns `floorCount` arrays of 8 vertex-scale multipliers (one per floor), each near 1.0 ± `OCTAGON_JITTER_MAX`, produced via: (a) an independent seeded jitter per (corner, floor) pair using `mulberry32`-derived hashes, (b) one pass of 1D relaxation across the floor axis per corner column (`smoothed[fl][corner] = jittered[fl][corner]*0.5 + avg(jittered[fl-1][corner], jittered[fl+1][corner])*0.5`, with floor 0 and floor `floorCount-1` averaging only their single existing neighbor rather than being fully pinned — unlike `RelaxedMeshGrid.ts`'s boundary-pinned convention, a tower's top/bottom floors are NOT meant to look identical to a mathematically perfect regular octagon, so they should still receive real jitter, just averaged against only one interior neighbor instead of two).
- `SilhouetteProfile = 'tapering' | 'tiered' | 'leaning' | 'waisted'`
- `pickSilhouetteProfile(seed: number): SilhouetteProfile` — deterministic seeded choice among the 4, roughly even distribution (verify via a statistical test across many seeds, not just a couple of examples).
- `FloorTransform { radiusScale: number; offsetX: number; offsetZ: number; rotationOffset: number }`
- `buildFloorTransforms(profile: SilhouetteProfile, seed: number, floorCount: number): FloorTransform[]` — one entry per floor, per the design spec's 4 profile descriptions:
  - `tapering`: smooth monotonic `radiusScale` decrease floor-to-floor (no stepping), small seeded `offsetX`/`offsetZ` drift accumulating floor-to-floor (clamped to a max total lean), small seeded `rotationOffset` accumulating floor-to-floor.
  - `tiered`: `radiusScale` mostly flat within a tier band (~2 floors) then steps down at tier boundaries (biased toward creating an odd number of distinct tiers across `floorCount`), minimal drift/rotation accumulation (tiered towers should read as stacked/rigid, not leaning).
  - `leaning`: near-flat `radiusScale` (minimal taper), but `offsetX`/`offsetZ` drift ramps up strongly and consistently toward one seeded-random direction by the top floor (a visible one-directional lean, not a random walk).
  - `waisted`: `radiusScale` decreases through the lower-middle floors then increases again for the top 1-2 floors before the roofline (hourglass/gallery silhouette), moderate drift/rotation.
- Every function above must be a **pure function of its seed** — same seed + same floorCount always produces the same output (test explicitly).

- [ ] **Write failing tests first** covering: jitter values are all within `1 ± OCTAGON_JITTER_MAX` bounds; relaxation actually reduces floor-to-floor variance per corner column (compute variance of raw jittered values vs. relaxed values across floors for the same corner index, assert relaxed variance is lower); `pickSilhouetteProfile` over e.g. 200 distinct seeds produces all 4 profile names, with no single profile dominating more than ~50% (a loose distribution check, not exact 25/25/25/25); each profile's `buildFloorTransforms` output matches its qualitative description (e.g. `tiered`'s `radiusScale` sequence is non-monotonic/has flat runs, `leaning`'s final floor's `Math.hypot(offsetX, offsetZ)` is clearly larger than `tapering`'s for the same seed/floorCount, `waisted`'s `radiusScale` has a local minimum strictly before the last floor); determinism (same seed+floorCount twice → `toEqual`).
- [ ] Confirm tests fail (file/functions don't exist yet).
- [ ] Implement `StoneTowerSilhouette.ts`.
- [ ] Confirm all new tests pass.
- [ ] Commit: "feat: add silhouette-profile jitter/drift/relax math for stone towers".

### Task 3: Thread per-vertex scales through `StoneTowerWallSurface.ts`

**Files:** Modify `src/world/buildings/StoneTowerWallSurface.ts`; modify `tests/world/buildings/StoneTowerWallSurface.test.ts` (add, don't remove existing tests).

- [ ] `buildWallSurfaceBlocks(radius, height, seed, material, opts?)`: add an optional `vertexScales?: number[]` param (8 entries); when given, each course's face-length/position calculations (currently derived from `octagonFaces(radius)`) must instead derive from `octagonFaces(radius, vertexScales)` so blocks actually follow the jittered outline, not a plain circle. Omitted reproduces current behavior exactly (existing tests must keep passing unmodified).
- [ ] `buildWallSurfaceTextured(radius, height, material, vertexScales?)`: when `vertexScales` is given, use the **average** of the 8 entries as an effective scalar radius multiplier for the `CylinderGeometry` (documented limitation: Strategy T can't express per-vertex jitter, only an overall size nudge — acceptable since Strategy T is the non-default comparison strategy per the original design spec).
- [ ] `buildWallSurface(strategy, radius, height, seed, material, vertexScales?)` dispatcher: thread the new optional param to whichever strategy is active.
- [ ] New tests: with a `vertexScales` array containing a clear outlier (e.g. one entry at 1.3, rest at 1.0), `buildWallSurfaceBlocks`'s resulting geometry bounding box is measurably larger in that corner's direction than with an all-1.0 array; `buildWallSurfaceTextured` with a `vertexScales` average of e.g. 1.1 produces a `CylinderGeometry` with a measurably larger radius parameter than the base `radius` alone.
- [ ] Run `npx vitest run tests/world/buildings/StoneTowerWallSurface.test.ts` — all pass (existing + new).
- [ ] Commit: "feat: thread per-vertex octagon scales through wall-surface strategies".

### Task 4: Wire silhouette variety into `StoneTowerKit.ts`'s tower assembly

**Files:** Modify `src/world/buildings/StoneTowerKit.ts`; modify `tests/world/buildings/StoneTowerKit.test.ts` (add, don't remove existing tests).

- [ ] `buildTowerWallRing(radius, ringHeight, seed, palette, hasWindow, vertexScales?, offsetX?, offsetZ?, rotationOffset?)`: thread the new optional params into its call to `buildWallSurface(...)`, and apply `offsetX`/`offsetZ` as the returned group's position and `rotationOffset` as its Y-rotation (window/vine decoration inside the ring keeps its existing local-space logic — it's already relative to the ring's own group, so it moves/rotates for free with the group). All four new params optional, omitted reproduces current behavior exactly.
- [ ] `buildElvenStoneTower(dna)`: after picking `floors` (existing logic, unchanged), call `pickSilhouetteProfile(dna.seed)` once, then `buildFloorTransforms(profile, dna.seed, floors)` and `buildFloorVertexScales(dna.seed, floors)` once each; in the existing per-floor loop, combine each floor's transform's `radiusScale` with the *existing* slight per-floor taper (`radius * (1 - fl * 0.015)`) — multiply them together, don't replace one with the other, so the profile's macro-curve and the existing micro-taper both contribute — and pass that floor's `vertexScales`, `offsetX`, `offsetZ`, `rotationOffset` into `buildTowerWallRing`. The roof cap's radius/position should follow the *last* floor's combined radius/offset (not the original base radius) so the roof sits flush against wherever the top floor actually ended up, not floating relative to a now-stale base position.
- [ ] New tests: two different seeds produce measurably different vertex positions for "the same" floor index (the direct proof the user's complaint is fixed) — extract a specific floor's ring group from the returned tower `Group` (by index/name) and compare geometry bounding boxes or child mesh counts/positions between seeds; same seed run twice produces identical output (determinism preserved); a tower built with a `tiered`-profile-forcing seed (find one via `pickSilhouetteProfile` in a loop, or expose a test-only seed known to produce `tiered`) has a visibly non-monotonic floor radius sequence when floor group positions/scales are inspected.
- [ ] Run `npx vitest run tests/world/buildings/StoneTowerKit.test.ts` — all pass (existing + new).
- [ ] Run the full stone-tower-kit test slice together: `npx vitest run tests/world/buildings/StoneTowerShape.test.ts tests/world/buildings/StoneTowerSilhouette.test.ts tests/world/buildings/StoneTowerWallSurface.test.ts tests/world/buildings/StoneTowerKit.test.ts tests/world/buildings/StoneTowerRoofCap.test.ts tests/world/FactionBuildingVariants.test.ts` — all pass.
- [ ] Commit: "feat: wire silhouette-profile variety into elven stone-tower assembly".

### Task 5: Fresh-baseline regression + tsc + live verification

- [ ] Establish today's fresh baseline (re-run before claiming done, since prior baselines are from earlier in this same session and may have shifted): `npx tsc --noEmit` (expect ~144 errors, all pre-existing, none in touched files — compare exact count/file list against the immediately-prior commit's run) and full `npx vitest run` (expect the same ~13 pre-existing/flaky failures as this session's established baseline, zero new failures).
- [ ] Live verification via the actual "Play in 3D" flow (not a URL hack alone — reproduce by actually clicking through Overworld Studio's Settlement tab, faction=Elven, type=City, "PLAY IN 3D (SETTLEMENT LAB)" button, matching how the user tests): confirm the panel is visible (already fixed), confirm the readout shows the elven POC override, and — the actual point of this whole pass — visually confirm via screenshot that towers across the settlement (and across at least 2-3 different reload/regenerate seeds) now show clearly different silhouettes (leaning, tiered/stepped, tapering, waisted) rather than all looking like the same shape scaled to different heights.
- [ ] Update `TODO/organic_world_tiles_todo.md`'s Phase 6 section with a new sub-item documenting this variety pass (what shipped, verification results) and mirror in `TODO/TODO_OVERVIEW.md`'s G16 entry.
- [ ] Commit: "docs: record elven stone-tower variety pass in Phase 6 roadmap".
- [ ] Push to the existing branch; update PR #46's body with a summary of this pass (research findings, 4 techniques shipped, verification results).
