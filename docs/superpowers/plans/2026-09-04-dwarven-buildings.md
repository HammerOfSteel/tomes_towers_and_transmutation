# Dwarven Buildings — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents are available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Draft — awaiting user approval before implementation.

**Estimated task count:** 28 tasks: 12 `[SHARED KIT]` tasks that may be skipped or narrowed if elven has already landed equivalent modules, 9 dwarven race-specific build tasks, and 7 final wiring/verification/docs/commit tasks.

**Goal:** Replace the current reused dwarven BlockKit hall variants with a full eight-kind dwarven building kit: grounded stone halls, tiered workshops, an industrial flagship blacksmith, a rock-cut chapel, and a watchtower showcase, all built from doctrine-compliant modular geometry.

**Architecture:** Consume the elven/shared Tier 1 kit wherever it exists, then add dwarven-specific shared modules only for rock plinths, battered walls, corbelled chimneys, angular ornament, metal banding, pipework/vents, hex roof plates, and squat columns. The race-specific layer composes those modules into eight distinct builders, then registry and Settlement Lab wiring expose every kind.

**Tech Stack:** TypeScript, Three.js geometry assemblies, Vitest unit tests, Vite dev server for local visual verification, Playwright screenshots.

**Runtime faction:** studio `dwarven` maps to runtime `dwarven` through `mapStudioFactionToRuntimeFaction()`.

**Baselines to preserve:** `npx tsc --noEmit` has 144 pre-existing errors; `npx vitest run` has about 13 pre-existing failures / 3272 passing. Only new failures count as regressions. Do not use an already-running Vite server from another checkout for Playwright verification.

**File map:**

- Shared kit under `src/world/buildings/kit/`: `DepthLadder.ts`, `OpeningParts.ts`, `GothicArch.ts`, `VoussoirArch.ts`, `StringCourse.ts`, `FacadeGrammar.ts`, `ShingleSurface.ts`, `RoofMassing.ts`, `MassComposer.ts`, plus new/extended dwarven-needed modules `RockPlinthSkirt.ts`, `SteppedBatterProfile.ts`, `CorbelledChimneyStack.ts`, `AngularOrnament.ts`, `MetalBanding.ts`, `PipeworkVent.ts`, `LatheColumn.ts`.
- Race kit under `src/world/buildings/dwarven/`: `DwarvenMaterials.ts`, `DwarvenOpenings.ts`, `DwarvenBuildingKit.ts`, `DwarvenWorkshopProps.ts`.
- Tests under `tests/world/buildings/kit/`, `tests/world/buildings/dwarven/`, `tests/world/FactionBuildingVariants.test.ts`, and `tests/scene/SettlementLabScene.test.ts`.
- Final wiring in `src/world/buildings/FactionBuildingVariants.ts` and `src/scene/SettlementLabScene.ts`.
- Roadmap docs in `TODO/organic_world_tiles_todo.md` and `TODO/TODO_OVERVIEW.md`.

---

## Task 1: `[SHARED KIT]` Depth ladder constants and assertion

**Goal:** Ensure facade parts can share one canonical depth system and tests can catch coplanar placeholder geometry.

- [ ] **Failing test to write first:** `tests/world/buildings/kit/DepthLadder.test.ts` asserts exported offsets match doctrine values and `assertNoCoplanarDepths()` throws when two named surfaces are within `0.005` WU.
- [ ] **Implementation outline:** Create or consume `src/world/buildings/kit/DepthLadder.ts` with constants for buttress, pilaster/chimney, quoin/string/sill, frame, wall, recess, reveal, glazing/door. If elven already added it, extend tests only for dwarven usage names.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/kit/DepthLadder.test.ts`.

## Task 2: `[SHARED KIT]` Five-piece openings for dwarven low arches

**Goal:** Provide doors/windows with recess, proud surround, sill/threshold, division/grille, and set-back glass/door face.

- [ ] **Failing test to write first:** `tests/world/buildings/kit/OpeningParts.test.ts` asserts a dwarven window preset has at least five named child parts, uses depth-ladder offsets, and includes either a mullion, transom, or grille.
- [ ] **Implementation outline:** Consume/extend `OpeningParts.ts` with `buildCompleteWindow()` and `buildPlankedDoorLeaf()` presets. Add dwarven options for thick sill, iron grille, and strap-planked door leaf. Do not duplicate `buildRecessedArchOpening()` logic; wrap it.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/kit/OpeningParts.test.ts tests/world/buildings/StoneTowerOpenings.test.ts`.

## Task 3: `[SHARED KIT]` Romanesque `GothicArch` and block voussoirs

**Goal:** Support low dwarven arch character (`archRatio` 0.50-0.65) and block-course arch heads.

- [ ] **Failing test to write first:** `tests/world/buildings/kit/GothicArch.test.ts` asserts `buildArchShape({ archRatio: 0.55 })` is lower/wider than an elven lancet and has no NaN points; `tests/world/buildings/kit/VoussoirArch.test.ts` asserts a dwarven arch emits odd-count voussoirs plus a keystone.
- [ ] **Implementation outline:** Consume/extend `GothicArch.ts` and `VoussoirArch.ts`. Replace direct triangular arch usage in new dwarven code with these modules. Keep old `StoneTowerOpenings` tests passing.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/kit/GothicArch.test.ts tests/world/buildings/kit/VoussoirArch.test.ts tests/world/buildings/StoneTowerOpenings.test.ts`.

## Task 4: `[SHARED KIT]` String courses, plinths, and `RockPlinthSkirt`

**Goal:** Make ground contact and horizontal floor bands first-class geometry.

- [ ] **Failing test to write first:** `tests/world/buildings/kit/RockPlinthSkirt.test.ts` asserts a plinth+skirt group has named `plinth-course`, `rubble-skirt`, and `front-steps` children, extends below/around the wall bottom, and remains within footprint plus configured skirt margin.
- [ ] **Implementation outline:** Consume existing `StringCourse.ts` if present; otherwise implement chamfered swept course helpers. Add `RockPlinthSkirt.ts` for rough same-material block fragments, soil skirt, stair slabs, and optional rear rock cheek.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/kit/StringCourse.test.ts tests/world/buildings/kit/RockPlinthSkirt.test.ts`.

## Task 5: `[SHARED KIT]` Facade split grammar for fixed-size dwarven bays

**Goal:** Divide rectangular and octagonal faces into reusable door/window/panel bays without stretching ornaments.

- [ ] **Failing test to write first:** `tests/world/buildings/kit/FacadeGrammar.test.ts` asserts a 7.3 WU facade with fixed door/window modules and floating filler produces correctly sized modules whose fixed widths do not scale.
- [ ] **Implementation outline:** Consume or implement `FacadeGrammar.ts` with fixed/relative/floating segments and deterministic weighted special-bay selection. Add helpers for skipping party-wall side windows on terraced houses.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/kit/FacadeGrammar.test.ts`.

## Task 6: `[SHARED KIT]` Dwarven roof tile and hex metal plate surfaces

**Goal:** Replace flat roof surfaces with visible course-built stone/slate/metal plates.

- [ ] **Failing test to write first:** `tests/world/buildings/kit/ShingleSurface.test.ts` asserts a dwarven `hex_plate`/`stone_slate` roof emits repeated tile-course instances, thick eaves, ridge/verge trim, and finite geometry.
- [ ] **Implementation outline:** Extend `ShingleSurface.ts` and `RoofMassing.ts` with dwarven plate profiles. Use elven's shared roof machinery if already present; add only the dwarven profile and tests.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/kit/ShingleSurface.test.ts tests/world/buildings/kit/RoofMassing.test.ts`.

## Task 7: `[SHARED KIT]` Stepped and battered wall profiles

**Goal:** Produce dwarven stepped-in and battered silhouettes without visible BlockKit voxel massing.

- [ ] **Failing test to write first:** `tests/world/buildings/kit/SteppedBatterProfile.test.ts` asserts tier outlines shrink inward, lower tiers project outward, and generated face lists stay compatible with `buildWallSurfaceBlocks({ facesOverride })`.
- [ ] **Implementation outline:** Create `SteppedBatterProfile.ts` or extend `MassComposer.ts` with `makeBatteredRectangleFaces()` and `makeTieredOctagonFaces()`. Do not mesh visible voxel cells; emit face lists for the coursed-wall builder.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/kit/SteppedBatterProfile.test.ts tests/world/buildings/StoneTowerWallSurface.test.ts`.

## Task 8: `[SHARED KIT]` Corbelled chimney stack module

**Goal:** Build readable square/rectangular chimneys from block courses, capstones, collars, and flue mouths.

- [ ] **Failing test to write first:** `tests/world/buildings/kit/CorbelledChimneyStack.test.ts` asserts a chimney has named base, course, collar, cap, and recessed flue children, uses no raw CylinderGeometry, and has a taller-than-wide bounding box.
- [ ] **Implementation outline:** Create `CorbelledChimneyStack.ts` with rectangular stack options, course count, taper schedule, cap style, flue orientation, and optional smoke socket. Use shared wall material and `DepthLadder` offsets.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/kit/CorbelledChimneyStack.test.ts`.

## Task 9: `[SHARED KIT]` Angular chevron/X-lattice ornament

**Goal:** Provide dwarven chevrons, zig-zags, X-lattice strips, shield plaques, and block corbels as real relief geometry.

- [ ] **Failing test to write first:** `tests/world/buildings/kit/AngularOrnament.test.ts` asserts chevron belts have alternating raised segments, X-lattice has crossing members with depth relief, and shield plaques are extruded/chamfered.
- [ ] **Implementation outline:** Create `AngularOrnament.ts`. Use fixed-size modules with bay-fitting filler; no flat texture-only knotwork or sub-pixel bolt fields.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/kit/AngularOrnament.test.ts`.

## Task 10: `[SHARED KIT]` Metal banding and readable straps

**Goal:** Add roof straps, chimney collars, door straps, hoop bands, and large bolt plates without material-clone explosions.

- [ ] **Failing test to write first:** `tests/world/buildings/kit/MetalBanding.test.ts` asserts a door receives 3-5 strap meshes, a chimney collar wraps four sides, and generated parts share the provided material object.
- [ ] **Implementation outline:** Create `MetalBanding.ts` with `buildDoorStraps`, `buildRoofBand`, `buildChimneyCollar`, and `buildHoopBand`. Use large readable plates; skip tiny bolts unless they are ≥0.08 WU.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/kit/MetalBanding.test.ts`.

## Task 11: `[SHARED KIT]` Pipework, vents, and tanks as assemblies

**Goal:** Support alchemist/blacksmith industrial cues without bare cylinder placeholders.

- [ ] **Failing test to write first:** `tests/world/buildings/kit/PipeworkVent.test.ts` asserts a pipe run has straight segments, elbows, collars, brackets, and at least one louvred vent/tank cap; no child named `bare-cylinder` or unbanded cylinder is accepted.
- [ ] **Implementation outline:** Create `PipeworkVent.ts`. Pipes may use cylinders/tubes internally only when wrapped with elbows/collars/brackets and named as pipe assemblies; visible tanks get rims, rivet bands, bases, caps, and gauges large enough to read.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/kit/PipeworkVent.test.ts`.

## Task 12: `[SHARED KIT]` Squat lathe columns / engaged half-pillars

**Goal:** Provide chapel/villa columns with bases, capitals, entasis, and fluted/lobed profiles.

- [ ] **Failing test to write first:** `tests/world/buildings/kit/LatheColumn.test.ts` asserts the dwarven column radius varies by height (entasis), has base/capital/impost parts, and can build a half-column for a wall face.
- [ ] **Implementation outline:** Consume or create `LatheColumn.ts`. Use lobed cross-section/fluting by geometry, not CSG. Add squat dwarven presets.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/kit/LatheColumn.test.ts`.

## Task 13: Dwarven materials, constants, and top-level kit skeleton

**Goal:** Establish shared race palette, material identity, and public builder exports.

- [ ] **Failing test to write first:** `tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts` imports all eight public builder names and asserts material helpers return stable shared references per building, not per-block clones.
- [ ] **Implementation outline:** Create `src/world/buildings/dwarven/DwarvenMaterials.ts` and `DwarvenBuildingKit.ts`. Define palette: granite, dark basalt, iron, soot, planked wood, dark glass, forge emissive. Export stubs that throw until later tasks or return empty groups only after tests are adjusted per task.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts`.

## Task 14: Dwarven opening presets

**Goal:** Wrap shared opening parts into dwarven door, slit, oculus, hatch, and forge-mouth presets.

- [ ] **Failing test to write first:** `tests/world/buildings/dwarven/DwarvenOpenings.test.ts` asserts each preset contains five-piece opening parts, uses `archRatio` in the dwarven low range, includes strap/plank/grille geometry, and satisfies depth-ladder offsets.
- [ ] **Implementation outline:** Create `DwarvenOpenings.ts` with `buildDwarvenDoor`, `buildDwarvenWindow`, `buildDwarvenOculus`, `buildDwarvenVentSlit`, `buildDwarvenForgeMouth`.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/dwarven/DwarvenOpenings.test.ts tests/world/buildings/kit/OpeningParts.test.ts`.

## Task 15: House builder

**Goal:** Implement a compact rectangular gabled/parapeted dwarven house with rock plinth and chimney.

- [ ] **Failing test to write first:** `tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts` asserts `buildDwarvenHouse()` respects `getFootprint('house', size)`, has `rock-plinth`, `dwarven-door`, at least one complete window, a corbelled chimney on chimney variants, and finite geometry across seeds.
- [ ] **Implementation outline:** In `DwarvenBuildingKit.ts`, compose rectangular coursed walls, plinth/skirt, gabled/parapet/conical roof variant, chevron belt, front steps, and one practical prop cluster.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts -t "House"`.

## Task 16: Terraced builder

**Goal:** Implement narrow row-house variants with party-wall rules and front/back detail.

- [ ] **Failing test to write first:** `tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts` asserts `buildDwarvenTerraced()` has no side windows when `terrace='both'`, preserves front door/window detail, and is narrower than villa.
- [ ] **Implementation outline:** Add terraced composition with party-wall-aware facade grammar, parapet/gable/sawtooth roof variants, front chevron band, doorstep, and drain/scupper details.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts -t "Terraced"`.

## Task 17: Villa / guild hall builder

**Goal:** Build the larger stepped residential/guild hall with octagonal/parapeted core and side wing.

- [ ] **Failing test to write first:** `tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts` asserts `buildDwarvenVilla()` has at least two masses, floor string courses, a monumental door, chevron/X-lattice ornament, and seed-varied mass composition.
- [ ] **Implementation outline:** Use `MassComposer`, `SteppedBatterProfile`, block-course walls, lathe/engaged pillars, parapet or conical cap, shield crest, and rock plinth.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts -t "Villa"`.

## Task 18: Inn builder

**Goal:** Build a broad public hall with stone lower storey, supported upper panels, sign medallion, and kitchen chimney.

- [ ] **Failing test to write first:** `tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts` asserts `buildDwarvenInn()` has a double entry, at least three windows/sign elements, support posts under any overhang, and one corbelled kitchen chimney.
- [ ] **Implementation outline:** Compose lower stone hall, optional planked upper bay, gabled roof courses, porch/arcade, hanging sign bracket, benches/trough, and chimney.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts -t "Inn"`.

## Task 19: Shop builder

**Goal:** Build a trade vault/alchemist storefront with a real recessed display bay and optional machine stack.

- [ ] **Failing test to write first:** `tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts` asserts `buildDwarvenShop()` has door + display/service opening, fixed-size facade bays from `FacadeGrammar`, and optional pipe/vent/sign stack variants that stay within footprint.
- [ ] **Implementation outline:** Add split front facade, recessed counter/window, sign medallion, chevron belt, strapped crates/ore trays, optional pipework/hex equipment bay.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts -t "Shop"`.

## Task 20: Flagship blacksmith builder

**Goal:** Build the most detailed dwarven kind: forge hall, corbelled chimney, bellows, quench trough, ore/coal store, and working yard.

- [ ] **Failing test to write first:** `tests/world/buildings/dwarven/DwarvenWorkshopProps.test.ts` asserts bellows, quench trough, anvil, and ore/coal bin are multi-part named assemblies with no bare placeholder primitives; `DwarvenBuildingKit.test.ts` asserts `buildDwarvenBlacksmith()` contains `forge-chimney`, `forge-mouth`, `working-yard`, `bellows` or `quench-trough`, and heat/soot treatment.
- [ ] **Implementation outline:** Create `DwarvenWorkshopProps.ts`; compose blacksmith in `DwarvenBuildingKit.ts` with enclosed rear forge, open yard, paver grid, side lean-to, chimney, forge mouth, vents, bellows, trough, ore/coal store, anvil, tool rack/hoist.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/dwarven/DwarvenWorkshopProps.test.ts tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts -t "Blacksmith"`.

## Task 21: Chapel builder

**Goal:** Build a low ancestor chapel with rectangular nave, rear octagonal/rock-cut core, oculi/slits, braziers, and heavy plinth.

- [ ] **Failing test to write first:** `tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts` asserts `buildDwarvenChapel()` uses the fixed `4 × 8` footprint, has rear core or rock cheek, four side openings or blind panels, no full cathedral tower, and grounded stairs/plinth.
- [ ] **Implementation outline:** Compose rectangular nave using `rectangleFaces`, rear octagonal apse/core, gabled/vault/parapet roof variant, engaged columns/buttresses, ancestor plaques, braziers, and high rock plinth.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts -t "Chapel"`.

## Task 22: Watchtower builder

**Goal:** Build the tiny-footprint tiered signal/mine-head tower for showcase visibility.

- [ ] **Failing test to write first:** `tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts` asserts `buildDwarvenWatchtower()` respects the `2 × 2` footprint, is taller than wide, has 3-4 tiered rings, alternating slit openings, and a coped parapet/vent/conical cap.
- [ ] **Implementation outline:** Add octagonal/square-chamfered tower composition using stepped tier faces, tight rock plinth, string courses, slit openings, parapet/vent cap, and signal brazier/lantern.
- [ ] **Verification command:** `npx vitest run tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts -t "Watchtower"`.

## Task 23: Wire all eight kinds into `FACTION_BUILDING_VARIANTS`

**Goal:** Route runtime faction `dwarven` to distinct doctrine-compliant builders for every canonical kind.

- [ ] **Failing test to write first:** Update `tests/world/FactionBuildingVariants.test.ts` with a dwarven roster test asserting `FACTION_BUILDING_VARIANTS.dwarven` has non-null builders for `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, and `watchtower`, and that `blacksmith` is not the same function as `villa`.
- [ ] **Implementation outline:** Modify `src/world/buildings/FactionBuildingVariants.ts`: import dwarven builders and wire all eight. Use `watchtower` rather than `tower` for the canonical roster unless a cross-race tower alias is later approved.
- [ ] **Verification command:** `npx vitest run tests/world/FactionBuildingVariants.test.ts -t "dwarven roster"`.

## Task 24: Generalise Settlement Lab showcase so all eight dwarven kinds render together

**Goal:** Make the Settlement tab “Play in 3D” acceptance gate show the complete dwarven roster in one scene.

- [ ] **Failing test to write first:** Extend `tests/scene/SettlementLabScene.test.ts` with `faction=dwarven` city/lab entry asserting `buildingRecords` includes all reachable ward kinds plus one forced `watchtower`, and the set contains all eight canonical kinds after showcase override.
- [ ] **Implementation outline:** Modify `src/scene/SettlementLabScene.ts` so `POC_KIND_OVERRIDE_BY_FACTION.dwarven` is a callback that maps enough placed buildings by index/ward to `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, and forced `watchtower`, while preserving elven behaviour. Update readout text to `POC override: showcase` for function-form overrides.
- [ ] **Verification command:** `npx vitest run tests/scene/SettlementLabScene.test.ts -t "dwarven"`.

## Task 25: Delete superseded dwarven builders as dead code

**Goal:** Remove live old implementations that violate the new doctrine or now have no callers.

- [ ] **Failing test to write first:** Add/extend a static assertion in `tests/world/FactionBuildingVariants.test.ts` or a focused import test asserting the registry no longer references `buildDwarvenVilla`, `buildDwarvenChapel`, `buildDwarvenShop`, or `dwarvenBlock` from `FactionBuildingVariants.ts`.
- [ ] **Implementation outline:** Delete old dwarven helper functions in `FactionBuildingVariants.ts` if no longer referenced. If `buildDwarvenHallGrid`, `planDwarvenTiers`, or related tests remain useful as shared math, leave them in `FactionBlockProfiles.ts`; otherwise remove unused exports and update tests.
- [ ] **Verification command:** `npx vitest run tests/world/FactionBuildingVariants.test.ts tests/world/buildings/dwarven/DwarvenBuildingKit.test.ts`.

## Task 26: Full regression

**Goal:** Confirm no new test or type-check regressions beyond the known baseline.

- [ ] **Failing test to write first:** None; verification task.
- [ ] **Implementation outline:** Run full suite and type checker, compare against baseline. Investigate only differences caused by dwarven/shared-kit changes.
- [ ] **Verification command:** `npx vitest run` and `npx tsc --noEmit`. Expected: no new failures beyond about 13 pre-existing Vitest failures and 144 pre-existing TypeScript errors.

## Task 27: Live Playwright verification with screenshot

**Goal:** Verify the visual acceptance gate: dwarven Settlement Lab shows all eight kinds, grounded, without placeholder geometry.

- [ ] **Failing test to write first:** Add a temporary local Playwright verification script only if the repo already has Playwright utilities; otherwise use the existing live verification pattern from prior rounds. The check must fail if the page has console errors or the rendered kind set is missing any canonical kind.
- [ ] **Implementation outline:** Start Vite from the session worktree on an unused port, not 5173 from another checkout. Open `index.html?devroom=settlement-lab&sl_seed=<seed>&sl_type=city&sl_faction=dwarven&sl_layout=auto`. Capture at least one screenshot showing all eight kind labels/records and zoomed blacksmith. Visually confirm: rock plinths hide terrain gaps, blacksmith has chimney/bellows/quench/ore yard, no windows/doors are boxes, no bare cylinder chimneys/barrels, no floating props.
- [ ] **Verification command:** Playwright run/Node script used by the repo plus manual screenshot inspection. Clean up temporary verification scripts/screenshots unless the project convention keeps artifacts.

## Task 28: Update TODO docs and commit

**Goal:** Record the dwarven building plan implementation and leave a clean, reviewable branch.

- [ ] **Failing test to write first:** None; docs/commit task.
- [ ] **Implementation outline:** Update `TODO/organic_world_tiles_todo.md` with a dwarven-race entry summarizing all eight builders, shared modules used/new, blacksmith flagship, live verification screenshot, and baseline results. Update `TODO/TODO_OVERVIEW.md` with the new dwarven status. Commit all intended source/test/doc changes with the required co-author trailer.
- [ ] **Verification command:** Re-run the targeted docs check if one exists; otherwise verify files are updated and then commit. Suggested commit message: `feat: add doctrine-compliant dwarven building kit` with `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
