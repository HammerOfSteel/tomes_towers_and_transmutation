# Shared Modular Building Kit (Tier 1–3) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents are available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Ready to execute — extracted verbatim from `docs/superpowers/plans/2026-09-04-elven-buildings.md` Tasks 1–18 (its `[SHARED KIT]` tasks), which were written as race-agnostic prerequisites consumed by all 9 race plans. This document is the canonical source for the shared kit so later races reference this file instead of the elven plan.

**Estimated task count:** 18 tasks, all `[SHARED KIT]`.

**Goal:** Build the shared modular building kit (`src/world/buildings/kit/`) required by every race's building plan per `docs/superpowers/specs/2026-09-04-modular-building-kit-doctrine.md` Part 4: depth-ladder enforcement, true arches, five-piece opening parts, voussoirs, string courses, facade split grammar, shingles, roof massing, tracery/rose windows, buttresses, lathe columns, lattice domes, interlace ornament, ruination, and a batched-detail registry.

**Architecture:** Shared modules live under `src/world/buildings/kit/` and are race-agnostic — no race names, no race-specific palettes or proportions. Each race's builders (elven first, since it depends on all 18) compose these modules in their own files and wire to their own runtime faction in `FACTION_BUILDING_VARIANTS`. Tests are written first for every module.

**Tech Stack:** TypeScript, three.js r170, Vitest, existing `npx` commands only.

**Baseline recorded before this branch's changes (2026-09-04, fresh checkout of `origin/main` at `024c432`):** `npx tsc --noEmit` → **144 pre-existing errors**; `npx vitest run` → **12 failed / 3273 passed (3285 total), 5 test files failing**. Only new failures beyond this baseline count as regressions.

**Landing plan:** This work lands directly on `main` via its own short-lived branch (`shared/building-kit-tier1`) once all 18 tasks pass task review and the final whole-branch review, so all 9 race branches can consume it. It carries no race-specific code, so there is no merge-order dependency on any race branch.

---

## Shared-kit tasks

### Task 1: [SHARED KIT] Depth ladder constants and assertion

**Goal:** Make doctrine Part 2 Rule 1 enforceable.

**Files:**
- Create: `src/world/buildings/kit/DepthLadder.ts`
- Create: `tests/world/buildings/kit/DepthLadder.test.ts`

**Failing test first:** `DepthLadder.test.ts` asserts exported constants equal `BUTTRESS=0.30`, `PILASTER=0.12`, `TRIM=0.08`, `FRAME=0.04`, `WALL=0`, `RECESS=-0.06`, `REVEAL=-0.12`, `GLAZING=-0.20`, and `assertDepthSeparated()` throws when two surfaces differ by `<0.005`.

**Implementation outline:** Add `DEPTH_LADDER`, `DepthRole`, `depthFor(role)`, and `assertDepthSeparated(entries)`. Keep it geometry-agnostic.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/DepthLadder.test.ts`

### Task 2: [SHARED KIT] Bevel/extrusion settings and creased-normal bake

**Goal:** Give trim, sill, coping, and tracery chamfered arrises.

**Files:**
- Create: `src/world/buildings/kit/Bevels.ts`
- Create: `tests/world/buildings/kit/Bevels.test.ts`
- Modify: `src/scene/MeshMergeUtils.ts` if needed to preserve normals after merge

**Failing test first:** `Bevels.test.ts` asserts `trimExtrudeSettings(width)` enables bevels with `bevelSegments: 1`, creates finite geometry for a sample shape, and `finishArchitecturalGeometry()` returns geometry with normal attributes.

**Implementation outline:** Export shared bevel profiles and a finish function wrapping `mergeVertices`/`toCreasedNormals` where available. Do not clone materials.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/Bevels.test.ts tests/scene/MeshMergeUtils.test.ts`

### Task 3: [SHARED KIT] True two-centred `GothicArch`

**Goal:** Replace the current two-straight-line arch point with a parameterised real arch.

**Files:**
- Create: `src/world/buildings/kit/GothicArch.ts`
- Create: `tests/world/buildings/kit/GothicArch.test.ts`
- Modify: `src/world/buildings/StoneTowerOpenings.ts`

**Failing test first:** Assert `buildGothicArchShape({ width: 1, springHeight: 1.6, archRatio: 1.7 })` has curved sampled points, a single apex at x≈0, finite coordinates, and `archRatio` changes apex height. Add a compatibility test proving `buildArchShape()` now delegates without producing straight triangular sides.

**Implementation outline:** Implement true two-centred arc with `THREE.Shape`/`Path.absarc`; expose `archRatio` defaults for Romanesque/equilateral/lancet.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/GothicArch.test.ts tests/world/buildings/StoneTowerOpenings.test.ts`

### Task 4: [SHARED KIT] Five-piece window `OpeningParts`

**Goal:** Make every window satisfy recess, surround, sill, division, and glazing.

**Files:**
- Create: `src/world/buildings/kit/OpeningParts.ts`
- Create: `tests/world/buildings/kit/OpeningParts.test.ts`
- Modify: `src/world/buildings/StoneTowerWindows.ts`

**Failing test first:** Assert `buildWindowOpening()` returns named children `recess`, `surround`, `sill`, `division`, `glazing`, with z/depth offsets matching `DepthLadder`, and no child is coplanar with the wall.

**Implementation outline:** Build sill as chamfered box/extrusion, divisions as mullion/transom/tracery slots, and opaque rough glass set back at `GLAZING`. Update existing tower windows to use it.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/OpeningParts.test.ts tests/world/buildings/StoneTowerWindows.test.ts`

### Task 5: [SHARED KIT] Door leaves, thresholds, planks, and straps

**Goal:** Upgrade entrances from dark cavities to readable built doors.

**Files:**
- Modify: `src/world/buildings/kit/OpeningParts.ts`
- Modify: `tests/world/buildings/kit/OpeningParts.test.ts`
- Modify: `src/world/buildings/StoneTowerEntrance.ts`

**Failing test first:** Assert `buildDoorOpening()` includes `threshold`, `door-leaf`, 5-7 planks, and 3-5 strap bars set back at `GLAZING`; assert the tower entrance uses those named parts.

**Implementation outline:** Add planked door module with strap geometry and optional open/broken states for ruins.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/OpeningParts.test.ts tests/world/buildings/StoneTowerEntrance.test.ts`

### Task 6: [SHARED KIT] Voussoir arch blocks

**Goal:** Build arches from individual wedge stones matching block-course masonry.

**Files:**
- Create: `src/world/buildings/kit/VoussoirArch.ts`
- Create: `tests/world/buildings/kit/VoussoirArch.test.ts`

**Failing test first:** Assert `buildVoussoirArch()` emits left/right voussoirs plus keystone, all finite, all using the same material reference, with optional `survivalFraction` omitting upper stones for ruins.

**Implementation outline:** Place wedge/block stones along `GothicArch` sampled curve; add jitter seed, keystone proud offset, and broken emission option.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/VoussoirArch.test.ts`

### Task 7: [SHARED KIT] String courses and stepped plinths

**Goal:** Provide ground contact and floor separation for every building.

**Files:**
- Create: `src/world/buildings/kit/StringCourse.ts`
- Create: `tests/world/buildings/kit/StringCourse.test.ts`

**Failing test first:** Assert `buildPlinthCourses(rectanglePoints(2,4), levels=3)` creates three named courses at increasing y/projection, uses `TRIM` depth, and produces finite geometry for rectangle and octagon points.

**Implementation outline:** Sweep/chamfer simple profiles along closed point loops; include radial/circular plinth helper for gazebo.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/StringCourse.test.ts`

### Task 8: [SHARED KIT] Facade split grammar

**Goal:** Divide arbitrary facade widths into fixed-size bays without stretched modules.

**Files:**
- Create: `src/world/buildings/kit/FacadeGrammar.ts`
- Create: `tests/world/buildings/kit/FacadeGrammar.test.ts`

**Failing test first:** Assert a facade width `7.3` with `[fixed door 1.2, repeat window 1.0, float filler]` fills exactly `7.3`, never scales fixed modules, and produces deterministic weighted selections by seed.

**Implementation outline:** Implement abs/relative/floating segments, repeat groups, weighted module slots, and output bay transforms.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/FacadeGrammar.test.ts`

### Task 9: [SHARED KIT] Diamond/fish-scale `ShingleSurface`

**Goal:** Replace flat roof surfaces with visible kicked tile courses.

**Files:**
- Create: `src/world/buildings/kit/ShingleSurface.ts`
- Create: `tests/world/buildings/kit/ShingleSurface.test.ts`

**Failing test first:** Assert a slope surface emits multiple named tile-course rows, alternating stagger, 2-5° kick, ridge/eave/verge trim, and more triangles than a single plane while staying under a sane ceiling.

**Implementation outline:** Generate tile quads with thickness/returns, diamond/fish-scale silhouette options, and material identity preservation.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/ShingleSurface.test.ts`

### Task 10: [SHARED KIT] Roof massing over rectangular and compound footprints

**Goal:** Build gable/hip/cross-gable roofs that consume `ShingleSurface`.

**Files:**
- Create: `src/world/buildings/kit/RoofMassing.ts`
- Create: `tests/world/buildings/kit/RoofMassing.test.ts`
- Modify: `src/world/buildings/StoneTowerGableRoof.ts` only to deprecate/redirect if still needed

**Failing test first:** Assert `buildGableRoof()` for `4×8` creates two shingled slopes, thick eaves, ridge cap, no flat `PlaneGeometry` roof face, and finite geometry.

**Implementation outline:** Start with explicit rectangular gable/hip/cross-gable builders; leave straight-skeleton adoption deferred unless already available.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/RoofMassing.test.ts tests/world/buildings/StoneTowerGableRoof.test.ts`

### Task 11: [SHARED KIT] Tracery and rose windows

**Goal:** Provide lancet tracery, quatrefoils, and rose/wheel windows.

**Files:**
- Create: `src/world/buildings/kit/Tracery.ts`
- Create: `tests/world/buildings/kit/Tracery.test.ts`

**Failing test first:** Assert `buildRoseWindow({ lobes: 8 })` creates a pierced shape with holes, named ring/spokes, finite geometry, and optional broken segments.

**Implementation outline:** Use `THREE.Shape.holes` + `ExtrudeGeometry` with bevel settings; include trefoil/quatrefoil formulas and broken fragment output.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/Tracery.test.ts`

### Task 12: [SHARED KIT] Buttresses

**Goal:** Build surviving stepped piers for ruins and civic facades.

**Files:**
- Create: `src/world/buildings/kit/Buttress.ts`
- Create: `tests/world/buildings/kit/Buttress.test.ts`

**Failing test first:** Assert `buildButtress(height=4)` emits base/mid/top set-offs, weathered caps, optional gablet/pinnacle, and supports a `brokenTopHeight` variant.

**Implementation outline:** Compose block-course pier segments with depth `BUTTRESS`, decreasing projection per stage.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/Buttress.test.ts`

### Task 13: [SHARED KIT] Lathe/cluster columns

**Goal:** Give pavilions and arcades real columns with bases/capitals.

**Files:**
- Create: `src/world/buildings/kit/LatheColumn.ts`
- Create: `tests/world/buildings/kit/LatheColumn.test.ts`

**Failing test first:** Assert `buildLatheColumn()` radius is not a straight taper, includes named `base`, `shaft`, `capital`, `impost`, and can emit broken columns at given heights.

**Implementation outline:** Use `LatheGeometry` or custom ring emission with entasis `r(y)` and optional lobed/fluted cross-section.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/LatheColumn.test.ts`

### Task 14: [SHARED KIT] Lattice dome / canopy ribs

**Goal:** Build gazebo canopies from real helical rib families.

**Files:**
- Create: `src/world/buildings/kit/LatticeDome.ts`
- Create: `tests/world/buildings/kit/LatticeDome.test.ts`

**Failing test first:** Assert two rib families are present, one offset outward and one inward for over/under weave, tube radius tapers, and broken/partial canopy masks remove deterministic rib segments.

**Implementation outline:** Sample `theta(s)=theta0±k*s` on lathe/spherical profile; emit tubes or low-poly custom tubes plus crossing knuckles and optional vine hooks.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/LatticeDome.test.ts`

### Task 15: [SHARED KIT] Raised interlace ornament

**Goal:** Provide non-flat Celtic/leaf bargeboards and inlays.

**Files:**
- Create: `src/world/buildings/kit/Interlace.ts`
- Create: `tests/world/buildings/kit/Interlace.test.ts`

**Failing test first:** Assert generated interlace has alternating over/under z relief, raised cord radius, terminal knots, and deterministic length-constrained output.

**Implementation outline:** Build periodic 3-strand plait as tube/low-poly cord along a path; expose straight and gable-verge variants.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/Interlace.test.ts`

### Task 16: [SHARED KIT] Ruination damage field and course erosion

**Goal:** Make jagged, block-quantised ruins instead of smooth cuts.

**Files:**
- Create: `src/world/buildings/kit/Ruinate.ts`
- Create: `tests/world/buildings/kit/Ruinate.test.ts`

**Failing test first:** Build a rectangular 10-course wall with tags for corners/buttresses; assert `ruinateCourses()` removes more mid-span blocks than tagged structural blocks, produces stepped break lines, and is seed-deterministic.

**Implementation outline:** Add damage field, survival profiles, two-leaf wall support, exempt tags, per-course occupancy mask, and break-height metadata.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/Ruinate.test.ts`

### Task 17: [SHARED KIT] Ruin rubble, rafters, cracks, and vegetation hooks

**Goal:** Convert removed blocks into believable ruin debris.

**Files:**
- Modify: `src/world/buildings/kit/Ruinate.ts`
- Modify: `tests/world/buildings/kit/Ruinate.test.ts`

**Failing test first:** Assert `buildRubbleFromLostBlocks()` uses the same material reference as the source wall, emits named rubble piles near collapsed spans, and `buildRafterRemnants()` deletes about half of rafters by seed.

**Implementation outline:** Add same-material block fragments, fallen tracery fragments, rafter remnants, ivy attachment points, and crack decals/curves.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/Ruinate.test.ts`

### Task 18: [SHARED KIT] Batched detail registry

**Goal:** Keep high-count shingles/rubble/leaves performant.

**Files:**
- Create: `src/world/buildings/kit/BatchedDetail.ts`
- Create: `tests/world/buildings/kit/BatchedDetail.test.ts`

**Failing test first:** Assert a registry groups details by material identity/type, supports adding heterogeneous geometry records, and can fall back to per-building groups in tests/jsdom.

**Implementation outline:** Provide an abstraction around `THREE.BatchedMesh` with feature detection/fallback; do not require immediate settlement-wide adoption by every builder.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/kit/BatchedDetail.test.ts`

---
