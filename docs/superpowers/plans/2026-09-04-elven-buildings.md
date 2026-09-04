# Elven Buildings — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents are available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Draft — awaiting user approval before implementation.

**Estimated task count:** 41 tasks — 18 `[SHARED KIT]` tasks, 16 elven race-specific tasks, and 7 final integration/verification tasks.

**Goal:** Build the shared modular building kit needed by all races, then deliver the complete elven 8-kind roster while keeping the approved stone tower and living-tree residential work and rebuilding the rejected market stall and chapel from scratch.

**Architecture:** Shared modules live under `src/world/buildings/kit/` and provide depth-ladder enforcement, true arches, opening parts, shingles, split grammar, columns, lattice domes, tracery, buttresses, and ruination. Elven-specific builders compose those modules in focused files and wire to runtime faction `elven` in `FACTION_BUILDING_VARIANTS`. Tests are written first for every module and builder.

**Tech Stack:** TypeScript, three.js r170, Vitest, existing Playwright workflow, existing `npx` commands only.

**Baseline to state during execution:** `npx tsc --noEmit` has 144 pre-existing errors; `npx vitest run` has about 13 pre-existing failures / 3272 passing. Only new failures beyond that baseline count as regressions.

---

## Shared-kit tasks first

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

## Elven race-specific tasks

### Task 19: Elven material palette and module weights

**Goal:** Centralise elven colors, arch ratios, roof weights, and module weights.

**Files:**
- Create: `src/world/buildings/ElvenBuildingMaterials.ts`
- Create: `tests/world/buildings/ElvenBuildingMaterials.test.ts`

**Failing test first:** Assert exported `ELVEN_ARCH_RATIO` is between `1.6` and `1.8`, roof/gazebo/ruin weight tables sum to `1`, and material factories preserve shared material identity where expected.

**Implementation outline:** Move reusable material creation for ashlar, timber/bark, moonstone glow, roof shingles, soot brick, vines, and glass into one helper file.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenBuildingMaterials.test.ts`

### Task 20: Protect and adapt the approved stone tower

**Goal:** Keep `buildElvenStoneTower()` visually/functionally approved while it consumes shared modules.

**Files:**
- Modify: `src/world/buildings/StoneTowerKit.ts`
- Modify: `src/world/buildings/StoneTowerWindows.ts`
- Modify: `src/world/buildings/StoneTowerEntrance.ts`
- Modify: `tests/world/buildings/StoneTowerKit.test.ts`

**Failing test first:** Add tests asserting tower still builds finite geometry for `watchtower` and `tower`, still has block-course walls and approved roof archetypes, and now all openings include `sill` and `glazing` named parts.

**Implementation outline:** Swap window/entrance internals to `OpeningParts`, keep ring stack/silhouette/roof weights stable, and add compatibility names for tests.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/StoneTowerKit.test.ts tests/world/buildings/StoneTowerWindows.test.ts tests/world/buildings/StoneTowerEntrance.test.ts`

### Task 21: Residential family adapter

**Goal:** Keep the approved living-tree residential builder but expose kind-specific assemblies.

**Files:**
- Create: `src/world/buildings/ElvenResidentialKit.ts`
- Create: `tests/world/buildings/ElvenResidentialKit.test.ts`
- Modify: `src/world/buildings/ElvenTreehouseKit.ts` only if extracting helpers is needed

**Failing test first:** Assert `buildElvenResidential(dna)` dispatches distinct named assemblies for `house`, `terraced`, `villa`, and `inn`, preserves valid output for seeds, and does not call rejected market/chapel builders.

**Implementation outline:** Wrap approved `buildElvenTreehouseHome` core; add facade/roof/projection modules per kind using `FacadeGrammar`, `RoofMassing`, `ShingleSurface`, and `Interlace`.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenResidentialKit.test.ts tests/world/buildings/ElvenTreehouseKit.test.ts`

### Task 22: House variant

**Goal:** Build the compact Elderwood cottage from `house_style_1/2/3`.

**Files:**
- Modify: `src/world/buildings/ElvenResidentialKit.ts`
- Modify: `tests/world/buildings/ElvenResidentialKit.test.ts`

**Failing test first:** Assert `house` footprint output includes stepped plinth, one five-piece door, at least two five-piece windows, diamond shingle roof, and a gable feature.

**Implementation outline:** Compose one compact body, steep gable roof, optional porch/root skirt, lantern/planter props.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenResidentialKit.test.ts -t "house"`

### Task 23: Terraced row variant

**Goal:** Make `terraced` visibly narrow and party-wall-aware.

**Files:**
- Modify: `src/world/buildings/ElvenResidentialKit.ts`
- Modify: `tests/world/buildings/ElvenResidentialKit.test.ts`

**Failing test first:** Assert `terraced` uses `3×4` proportions, has two floors, suppresses side windows for party-wall states, and differs in named assembly from `house`.

**Implementation outline:** Add narrow facade grammar, front/rear windows, jetty option, and shared ridge/row roof modules.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenResidentialKit.test.ts -t "terraced"`

### Task 24: Villa variant

**Goal:** Build the Noldareth manor/elder hall silhouette.

**Files:**
- Modify: `src/world/buildings/ElvenResidentialKit.ts`
- Modify: `tests/world/buildings/ElvenResidentialKit.test.ts`

**Failing test first:** Assert `villa` includes multi-mass plan, rose/oculus or balcony/arcade special bay, at least 6 windows, and multi-gable shingle roof.

**Implementation outline:** Use `MassComposer`, `FacadeGrammar`, `Tracery`, `Interlace`, chimney/towerlet options, and richer plinth/porch.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenResidentialKit.test.ts -t "villa"`

### Task 25: Inn variant

**Goal:** Make `inn` a public lodge, not a cloned house.

**Files:**
- Modify: `src/world/buildings/ElvenResidentialKit.ts`
- Modify: `tests/world/buildings/ElvenResidentialKit.test.ts`

**Failing test first:** Assert `inn` has a gallery/porch or service wing, a hanging sign module, double door, warm-lit window set, and differs from `villa` in named props.

**Implementation outline:** Add common-hall mass, sign motifs, bench/barrel modules, chimney/service lean-to, and roofed gallery.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenResidentialKit.test.ts -t "inn"`

### Task 26: Elven blacksmith forge workshop

**Goal:** Replace the current treehouse clone for `blacksmith` with a distinct forge.

**Files:**
- Create: `src/world/buildings/ElvenBlacksmithKit.ts`
- Create: `tests/world/buildings/ElvenBlacksmithKit.test.ts`

**Failing test first:** Assert `buildElvenBlacksmith()` uses `5×4` footprint, open-front forge arch, tall chimney, forge glow, anvil/bellows/tool modules, and soot-darkened wall material.

**Implementation outline:** Compose rear/side block-course walls, wide voussoir arch, vented shingle roof, chimney breast, forge props, and optional side lean-to.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenBlacksmithKit.test.ts`

### Task 27: Market pavilion plinth and columns

**Goal:** Start the rejected market rebuild as a real gazebo structure.

**Files:**
- Create: `src/world/buildings/ElvenMarketPavilionKit.ts`
- Create: `tests/world/buildings/ElvenMarketPavilionKit.test.ts`

**Failing test first:** Assert `buildElvenMarketPavilion()` contains a stepped octagonal/circular plinth, 6 or 8 `LatheColumn` columns with capitals, stairs, and no old `elven-stall-back-wall`/counter-first assembly.

**Implementation outline:** Build plinth from `StringCourse`, columns from `LatheColumn`, radial pavers from travel-circle motif, and deterministic column count.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenMarketPavilionKit.test.ts -t "plinth|columns"`

### Task 28: Market pavilion canopy and market function

**Goal:** Add the gazebo canopy, hanging goods, displays, and awnings.

**Files:**
- Modify: `src/world/buildings/ElvenMarketPavilionKit.ts`
- Modify: `tests/world/buildings/ElvenMarketPavilionKit.test.ts`

**Failing test first:** Assert canopy is either `ShingleSurface` or `LatticeDome`, has real ribs/tiles, includes at least three hanging/display goods modules, and no flat awning-only roof.

**Implementation outline:** Add weighted canopy picker, hanging goods, lantern crystals, display tables, cloth banners, and vine dressing.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenMarketPavilionKit.test.ts -t "canopy|goods"`

### Task 29: Market pavilion ruined variant

**Goal:** Provide the user-requested ruined gazebo option.

**Files:**
- Modify: `src/world/buildings/ElvenMarketPavilionKit.ts`
- Modify: `tests/world/buildings/ElvenMarketPavilionKit.test.ts`

**Failing test first:** Assert seeds can produce intact, light-ruined, and heavily ruined pavilion states; ruined states have broken columns at different heights, partial canopy ribs, rubble/vines, and still preserve market props.

**Implementation outline:** Apply `Ruinate` masks to columns/canopy/plinth edge and derive same-material rubble piles.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenMarketPavilionKit.test.ts -t "ruined"`

### Task 30: Chapel ruin masonry shell

**Goal:** Start the rejected chapel rebuild as a roofless brick-built old church ruin.

**Files:**
- Create: `src/world/buildings/ElvenChurchRuinKit.ts`
- Create: `tests/world/buildings/ElvenChurchRuinKit.test.ts`

**Failing test first:** Assert `buildElvenChurchRuin()` uses the fixed `4×8` footprint, has no roof mesh, emits rectangular two-leaf block-course walls, and includes named front/rear/side wall sections.

**Implementation outline:** Build a rectangular nave wall occupancy model from courses, wall leaves, plinth/floor pavers, and structural tags for corners/buttress zones.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenChurchRuinKit.test.ts -t "masonry shell"`

### Task 31: Chapel ruin damage profiles and gable survival

**Goal:** Make ruination first-class and course-following.

**Files:**
- Modify: `src/world/buildings/ElvenChurchRuinKit.ts`
- Modify: `tests/world/buildings/ElvenChurchRuinKit.test.ts`

**Failing test first:** Assert multiple seeds produce different survival profiles, at least one high gable remains, break lines are stair-stepped by course, and no smooth diagonal/plane cut exists.

**Implementation outline:** Drive `Ruinate` with survival profile weights, preserve one gable/buttress set, and emit loose top blocks.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenChurchRuinKit.test.ts -t "damage|gable"`

### Task 32: Chapel lancets, rose window, tracery remnants, and buttresses

**Goal:** Add the gothic ruin identity.

**Files:**
- Modify: `src/world/buildings/ElvenChurchRuinKit.ts`
- Modify: `tests/world/buildings/ElvenChurchRuinKit.test.ts`

**Failing test first:** Assert 4-6 lancet openings use `GothicArch`/`VoussoirArch`, rose window state appears by seed, buttresses survive independently of wall spans, and broken tracery fragments are present.

**Implementation outline:** Compose lancet jambs/arches, optional mullion stumps, rose/wheel ring, stepped buttresses, and absent glazing for open ruins.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenChurchRuinKit.test.ts -t "lancet|rose|buttress"`

### Task 33: Chapel rubble, ivy, altar, and floor inlay

**Goal:** Finish the ruin with environment-art cues.

**Files:**
- Modify: `src/world/buildings/ElvenChurchRuinKit.ts`
- Modify: `tests/world/buildings/ElvenChurchRuinKit.test.ts`

**Failing test first:** Assert same-material rubble piles are placed at collapsed wall bases, ivy/vines attach to surviving walls, an altar/floor-inlay module exists, and rafter remnants appear only on selected seeds.

**Implementation outline:** Use `Ruinate` rubble helpers, vegetation hooks, travel-circle inlay motif, fallen beams, and altar stone.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenChurchRuinKit.test.ts -t "rubble|ivy|altar"`

### Task 34: All-eight elven builder quality audit

**Goal:** Prove each canonical elven kind is distinct and compliant before wiring.

**Files:**
- Create: `tests/world/buildings/ElvenBuildingsRoster.test.ts`

**Failing test first:** Assert `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, and `watchtower` builders all produce finite deterministic geometry, have distinct named root assemblies, include plinth/ground contact, and do not expose banned old child names.

**Implementation outline:** Add test helpers to build `BuildingDNA` per kind and inspect child names/geometry types. This test should call builders directly before dispatch wiring.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenBuildingsRoster.test.ts`

---

## Final integration tasks — keep this order

### Task 35: Wire elven builders into `FACTION_BUILDING_VARIANTS`

**Goal:** Route runtime faction `elven` to the complete 8-kind roster.

**Files:**
- Modify: `src/world/buildings/FactionBuildingVariants.ts`
- Modify: `tests/world/FactionBuildingVariants.test.ts`

**Failing test first:** Assert `FACTION_BUILDING_VARIANTS.elven` maps `house/terraced/villa/inn` to the residential dispatcher, `blacksmith` to `buildElvenBlacksmith`, `shop` to `buildElvenMarketPavilion`, `chapel` to `buildElvenChurchRuin`, and `watchtower/tower` to `buildElvenStoneTower`.

**Implementation outline:** Add imports and replace current `shop`, `chapel`, and `blacksmith` mappings; preserve approved tower/treehouse mappings through adapters.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/FactionBuildingVariants.test.ts tests/world/buildings/ElvenBuildingsRoster.test.ts`

### Task 36: Generalise Settlement Lab showcase so all 8 elven kinds render together

**Goal:** Make the “Play in 3D” Settlement Lab acceptance gate show the whole elven roster.

**Files:**
- Modify: `src/scene/SettlementLabScene.ts`
- Create or modify: `tests/scene/SettlementLabScene.test.ts`

**Failing test first:** Assert `getShowcaseKindOverride('elven')` (export helper if needed) returns all canonical kinds across the first 8 building indices: `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, `watchtower`.

**Implementation outline:** Replace the current “index 0 watchtower only” callback with a canonical showcase order/cycle. If normal plans can contain fewer than 8 buildings, add a lab-only minimum/showcase placement helper rather than changing settlement generation.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/scene/SettlementLabScene.test.ts tests/world/buildings/BuildingTypeMap.test.ts`

### Task 37: Delete superseded rejected builders as dead code

**Goal:** Remove old implementations that caused/represent the rejections.

**Files:**
- Delete: `src/world/buildings/ElvenMarketStallKit.ts`
- Delete: `tests/world/buildings/ElvenMarketStallKit.test.ts`
- Delete: `src/world/buildings/ElvenChapelKit.ts`
- Delete: `tests/world/buildings/ElvenChapelKit.test.ts`
- Delete or deprecate: `src/world/buildings/StoneTowerGableRoof.ts` and its test if no remaining imports
- Modify any import references found by search

**Failing test first:** Add/keep a roster test asserting no object names from the old stall/church (`elven-stall-back-wall`, `elven-chapel-bellcote`, old apse/cap names) appear in new `shop`/`chapel` output.

**Implementation outline:** Search for references, remove dead imports/files, and update comments that claim rejected builders are current.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run tests/world/buildings/ElvenBuildingsRoster.test.ts tests/world/FactionBuildingVariants.test.ts`

### Task 38: Full regression

**Goal:** Confirm no new automated regressions beyond known baseline.

**Files:** none unless regressions are found.

**Failing test first:** Not applicable; this is verification. If a new failure appears, write a focused failing test for the underlying bug before fixing.

**Implementation outline:** Run full suite and typecheck. Expected baseline: `npx vitest run` still has only the known pre-existing flaky/failing set; `npx tsc --noEmit` still reports 144 pre-existing errors. Investigate and fix only new failures caused by these changes.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `npx vitest run && npx tsc --noEmit`

### Task 39: Live Playwright verification with screenshot

**Goal:** Visually verify all 8 elven kinds in the real Settlement Lab.

**Files:**
- Create only if committed as test: `tests/e2e/elven-buildings-showcase.spec.ts`
- Otherwise use a throwaway script inside the repo during execution and delete it before Task 41

**Failing test first:** If making a permanent e2e test, assert the lab readout says elven showcase and page has no console errors; otherwise manual Playwright verification is acceptable for screenshot capture.

**Implementation outline:** Start Vite from the session worktree on its own unused port, open `index.html?devroom=settlement-lab&sl_faction=elven&sl_type=town&sl_layout=auto`, verify the showcase contains house, terraced, villa, inn, shop pavilion, blacksmith forge, church ruin, and watchtower. Capture screenshot evidence. Do not use a stale server from another checkout.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `BASE_URL=http://localhost:<port> npx playwright test tests/e2e/elven-buildings-showcase.spec.ts` or documented manual Playwright run with screenshot.

### Task 40: Update TODO documentation

**Goal:** Record the completed elven roster and shared-kit rollout.

**Files:**
- Modify: `TODO/organic_world_tiles_todo.md`
- Modify: `TODO/TODO_OVERVIEW.md`

**Failing test first:** Documentation-only; no failing unit test required.

**Implementation outline:** Add a Phase 6 elven-complete entry naming shared kit modules, approved kept buildings, rejected rebuilt buildings, verification results, and remaining cross-race watchtower spawn gap.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `grep -n "Elven" TODO/organic_world_tiles_todo.md TODO/TODO_OVERVIEW.md`

### Task 41: Commit

**Goal:** Persist the verified implementation branch.

**Files:** all changed source, tests, and TODO docs.

**Failing test first:** Not applicable; only commit after Tasks 38-40 pass/are documented.

**Implementation outline:** Review changed files, stage only intended files, and commit with the required co-author trailer.

**Steps:**
- [ ] Write/update the failing test described above, or perform the stated verification directly when test-first is marked not applicable.
- [ ] Run the verification command and confirm the intended failure or documented baseline.
- [ ] Implement the outlined change only.
- [ ] Re-run the verification command and resolve any new failures.
- [ ] Keep changes uncommitted until Task 41 unless the implementation owner intentionally commits approved checkpoints.

**Verification command:** `git add <intended files> && git commit -m "feat: complete elven building roster" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`
