# Undead Buildings — Implementation Plan

**Status:** Draft — awaiting user approval before implementation.

**Estimated task count:** 33 tasks total: 14 `[SHARED KIT]` tasks that may already be satisfied by earlier race branches and 19 undead-specific / integration tasks. Shared-kit tasks come first so the parent can dedupe them across races; if a shared module already exists, run the listed test and only extend it for undead's missing requirements.

**Goal:** Replace the current `undead_common` collapsed spire/bazaar/shrine set with eight distinct necropolis buildings whose read comes from mausoleum massing, funerary-classical ornament, real openings, ironwork, monuments, and maintained-decay geometry.

**Architecture:** Build one race-specific undead kit on top of shared modular primitives: depth ladder, five-piece openings, facade grammar, coursed masonry, roofs, friezes, pediments, railings, monuments, lanterns, and `Ruinate`. Public undead builders live in focused kit files and are wired into `FACTION_BUILDING_VARIANTS.undead_common` only after all eight kinds are tested. Settlement Lab is then generalized so all eight undead kinds render together, including `watchtower`, which is otherwise unreachable via `WARD_TO_KIND`.

**Tech Stack:** TypeScript, three.js r170, Vitest, Playwright, existing procedural building helpers. Baselines to respect: `npx tsc --noEmit` has 144 pre-existing errors; `npx vitest run` has about 13 pre-existing failures / 3272 passing. Only new failures count as regressions.

## File structure map

- Create/extend shared kit under `src/world/buildings/kit/`:
  - `DepthLadder.ts`, `GothicArch.ts`, `OpeningParts.ts`, `VoussoirArch.ts`, `StringCourse.ts`, `FacadeGrammar.ts`, `Frieze.ts`, `Pediment.ts`, `Railing.ts`, `LanternKit.ts`, `MonumentKit.ts`, `RoofMassing.ts`, `ShingleSurface.ts`, `Ruinate.ts`, `BatchedDetail.ts` as needed.
- Create undead-specific files:
  - `src/world/buildings/UndeadNecropolisPalette.ts` — material factories and shared colors.
  - `src/world/buildings/UndeadFacadeModules.ts` — crypt doors, plaque niches, barred lantern windows, reliquary niches, shored cracks, columbarium bands.
  - `src/world/buildings/UndeadLotDressing.ts` — monuments, rails, pavers, lantern posts, sarcophagus counters, repair rubble placement.
  - `src/world/buildings/UndeadNecropolisKit.ts` — public builders for `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, `watchtower`.
- Modify integration files only at the end:
  - `src/world/buildings/FactionBuildingVariants.ts`.
  - `src/scene/SettlementLabScene.ts`.
  - `TODO/organic_world_tiles_todo.md` and `TODO/TODO_OVERVIEW.md`.
- Tests:
  - Add focused tests in `tests/world/buildings/kit/*.test.ts` for shared modules.
  - Add `tests/world/buildings/UndeadNecropolisKit.test.ts`, `UndeadFacadeModules.test.ts`, `UndeadLotDressing.test.ts`.
  - Extend `tests/world/FactionBuildingVariants.test.ts` and `tests/scene/SettlementLabScene.test.ts`.
  - Add or extend an e2e Playwright spec for undead Settlement Lab visual verification.

## Tasks

### Task 1: [SHARED KIT] Depth ladder constants and assertion

**Goal:** Make doctrine offsets named and testable.

**Failing test to write first:** `tests/world/buildings/kit/DepthLadder.test.ts` asserts constants equal `{ buttress: 0.30, pilaster: 0.12, sill: 0.08, frame: 0.04, wall: 0, blindRecess: -0.06, reveal: -0.12, backPlane: -0.20 }` and `assertDepthLadderSeparation()` throws when two registered surfaces differ by less than 0.005 WU.

**Implementation outline:** Create/extend `src/world/buildings/kit/DepthLadder.ts` with constants, a typed surface registry helper, and a dev/test assertion. Do not scan whole geometries yet; expose a small API modules can call.

**Verification command:** `npx vitest run tests/world/buildings/kit/DepthLadder.test.ts`

### Task 2: [SHARED KIT] True arch geometry for undead equilateral arches

**Goal:** Replace triangular pointed arches with reusable two-centred arches parameterised by race.

**Failing test to write first:** `tests/world/buildings/kit/GothicArch.test.ts` asserts `buildArchShape({ halfWidth: 0.5, straightHeight: 1.2, archRatio: 1.0 })` has a centred apex, curved sampled sides (more than straight-line endpoints), finite points, and deterministic output.

**Implementation outline:** Create/extend `src/world/buildings/kit/GothicArch.ts`; route old `StoneTowerOpenings.buildArchShape()` through it only when safe. Use `archRatio: 1.0` as undead default.

**Verification command:** `npx vitest run tests/world/buildings/kit/GothicArch.test.ts tests/world/buildings/StoneTowerOpenings.test.ts`

### Task 3: [SHARED KIT] Complete five-piece opening parts

**Goal:** Make every door/window/niche capable of satisfying the doctrine's five-piece minimum.

**Failing test to write first:** `tests/world/buildings/kit/OpeningParts.test.ts` builds a barred arched window and asserts it contains named children for recess, surround, sill, mullion/grille, and backPlane; bounding boxes prove sill projects beyond frame and back plane sits behind reveal.

**Implementation outline:** Create/extend `src/world/buildings/kit/OpeningParts.ts`. Provide `buildMasonryWindow`, `buildMasonryDoor`, `buildPlaqueNiche`, `buildVentSlit`, and common door-leaf/grille/threshold subparts. Ensure no bare dark box can be returned as the whole opening.

**Verification command:** `npx vitest run tests/world/buildings/kit/OpeningParts.test.ts tests/world/buildings/StoneTowerOpenings.test.ts`

### Task 4: [SHARED KIT] Voussoir arch blocks

**Goal:** Build arch surrounds from wedge blocks plus keystone so openings match coursed masonry.

**Failing test to write first:** `tests/world/buildings/kit/VoussoirArch.test.ts` asserts a 9-stone arch has 9+1 named voussoir/keystone meshes, all finite, keystone is proud by about 0.03 WU, and `missingFromIndex` creates a partial ruined arch without floating stones.

**Implementation outline:** Create/extend `src/world/buildings/kit/VoussoirArch.ts`. Consume `GothicArch` sampling and shared material references; emit blocks with seeded jitter and material identity preserved.

**Verification command:** `npx vitest run tests/world/buildings/kit/VoussoirArch.test.ts`

### Task 5: [SHARED KIT] String courses, plinths, and cornices

**Goal:** Give every undead facade horizontal shadow bands and grounded plinths.

**Failing test to write first:** `tests/world/buildings/kit/StringCourse.test.ts` builds a rectangular plinth/cornice and asserts separate base, weathered top, and cap profiles exist at +0.08 or stronger depth offsets, with finite geometry and no cloned material explosion.

**Implementation outline:** Create/extend `src/world/buildings/kit/StringCourse.ts` with rectangular and arbitrary-footprint helpers. Include greek-key/frieze sockets but leave ornament detail to `Frieze`.

**Verification command:** `npx vitest run tests/world/buildings/kit/StringCourse.test.ts`

### Task 6: [SHARED KIT] Facade split grammar

**Goal:** Divide walls into fixed-size bays without stretching mouldings.

**Failing test to write first:** `tests/world/buildings/kit/FacadeGrammar.test.ts` asserts a 7.3 WU facade split into `[edge, repeat bay, floating filler, edge]` returns fixed bay widths, absorbs leftover into filler, is deterministic, and marks exactly one special bay when requested.

**Implementation outline:** Create/extend `src/world/buildings/kit/FacadeGrammar.ts` with `split`, `repeat`, floating filler, seeded weighted choice, and connector metadata for modules.

**Verification command:** `npx vitest run tests/world/buildings/kit/FacadeGrammar.test.ts`

### Task 7: [SHARED KIT] Greek-key and classical frieze bands

**Goal:** Implement the frieze vocabulary visible in `CEM0035.webp`.

**Failing test to write first:** `tests/world/buildings/kit/Frieze.test.ts` asserts greek-key, dentil, plain-double-string, and cracked/missing variants produce finite geometry, named repeating submodules, and no parametric scaling of the motif when length changes.

**Implementation outline:** Create/extend `src/world/buildings/kit/Frieze.ts`; build fixed motif modules placed by `FacadeGrammar` or repeat solver. Add missing-segment support for ruins.

**Verification command:** `npx vitest run tests/world/buildings/kit/Frieze.test.ts`

### Task 8: [SHARED KIT] Pediment and broken-pediment module

**Goal:** Support mausoleum fronts, chapel tympana, and tomb-marker caps.

**Failing test to write first:** `tests/world/buildings/kit/Pediment.test.ts` asserts triangular, segmental, gabled-slab, and broken-pediment variants have cap/cornice/tympanum named parts, bevels, finite geometry, and optional medallion socket.

**Implementation outline:** Create/extend `src/world/buildings/kit/Pediment.ts`; accept width, pitch/radius, material set, break side, and tympanum ornament. Use actual thickness and chamfered returns.

**Verification command:** `npx vitest run tests/world/buildings/kit/Pediment.test.ts`

### Task 9: [SHARED KIT] Iron railings and gates

**Goal:** Make cemetery boundaries from real pickets, posts, rails, and spear finials.

**Failing test to write first:** `tests/world/buildings/kit/Railing.test.ts` asserts a 3 WU rail section has posts, upper/lower rails, at least 5 pickets, finials, and optional broken/missing pickets; gate variant has two leaves and hinge posts.

**Implementation outline:** Create/extend `src/world/buildings/kit/Railing.ts`. Use instancing or batched repeated pickets if available; otherwise preserve material identity for merging.

**Verification command:** `npx vitest run tests/world/buildings/kit/Railing.test.ts`

### Task 10: [SHARED KIT] Lantern cages and gallows brackets

**Goal:** Implement lanterns from `file.jpg` as constructed geometry, not glowing spheres.

**Failing test to write first:** `tests/world/buildings/kit/LanternKit.test.ts` asserts each lantern has cage bars, gridded panes, cap, base, ring/hook, and either timber gallows bracket or iron wall bracket; emissive pane alone is not enough to satisfy the test.

**Implementation outline:** Create/extend `src/world/buildings/kit/LanternKit.ts`; add `buildLanternCage`, `buildGallowsLanternPost`, `buildWallLanternBracket`. Pane material may be slightly emissive but must be set back inside bars.

**Verification command:** `npx vitest run tests/world/buildings/kit/LanternKit.test.ts`

### Task 11: [SHARED KIT] MonumentKit cemetery props

**Goal:** Provide the slab/obelisk/urn/sarcophagus/table-tomb kit used by every undead lot.

**Failing test to write first:** `tests/world/buildings/kit/MonumentKit.test.ts` asserts arched slab, gabled slab, cross marker, obelisk, urn, sarcophagus, table tomb, and broken marker variants have plinth/body/cap named parts, finite geometry, and deterministic weighted selection.

**Implementation outline:** Create/extend `src/world/buildings/kit/MonumentKit.ts` with modelled ornament sockets and no floating skull primitives. Allow carved skull boss as one optional child.

**Verification command:** `npx vitest run tests/world/buildings/kit/MonumentKit.test.ts`

### Task 12: [SHARED KIT] Stone-slab roofs and roof trim

**Goal:** Avoid one-piece flat roof planes on mausoleums and chapel roofs.

**Failing test to write first:** `tests/world/buildings/kit/RoofMassing.test.ts` or `ShingleSurface.test.ts` asserts rectangular gable/hip/table-tomb roofs emit visible slab/tile courses, thick eaves, fascia, ridge/verge trim, and optional exposed rafters.

**Implementation outline:** Extend `RoofMassing.ts`/`ShingleSurface.ts` or create them if absent. Layer course geometry on top of existing `StoneTowerGableRoof` where practical; support low table-tomb lids for crypt rows.

**Verification command:** `npx vitest run tests/world/buildings/kit/RoofMassing.test.ts tests/world/buildings/kit/ShingleSurface.test.ts`

### Task 13: [SHARED KIT] Ruinate maintained-decay mode

**Goal:** Extend shared ruin generation so undead ruins differ from elven ruins.

**Failing test to write first:** `tests/world/buildings/kit/Ruinate.test.ts` adds an undead profile test: applying `ruinate(..., mode: 'maintained-decay')` creates same-material rubble, mismatched spolia patches, timber shoring, braced broken pediment/cornice, and controlled overgrowth while preserving structural corner supports.

**Implementation outline:** Extend `src/world/buildings/kit/Ruinate.ts` with mode/profile parameters. Keep elven defaults unchanged; add undead profile constants and tests proving no elven regressions.

**Verification command:** `npx vitest run tests/world/buildings/kit/Ruinate.test.ts`

### Task 14: [SHARED KIT] Batched repeated detail smoke test

**Goal:** Ensure repeated rail pickets, graves, rubble, lanterns, and roof tiles can be pooled without changing visual structure.

**Failing test to write first:** `tests/world/buildings/kit/BatchedDetail.test.ts` asserts a batch can register heterogeneous monument/rail/tile geometries, add instances deterministically, preserve material identity, and expose counts for budget checks.

**Implementation outline:** Create/extend `src/world/buildings/kit/BatchedDetail.ts` if absent. If settlement-wide batching is deferred, implement a no-op adapter with the same API that returns groups so callers can migrate later.

**Verification command:** `npx vitest run tests/world/buildings/kit/BatchedDetail.test.ts`

### Task 15: Undead palette and deterministic variation helpers

**Goal:** Centralize ashstone/spolia/bone/iron/timber/lichen/dark-pane materials and weighted selectors.

**Failing test to write first:** `tests/world/buildings/UndeadNecropolisPalette.test.ts` asserts `makeUndeadNecropolisPalette()` returns stable material references, no per-call cloned materials inside one palette, and `pickUndeadWeighted(seed, axis)` is deterministic and covers all documented options across a seed sweep.

**Implementation outline:** Create `src/world/buildings/UndeadNecropolisPalette.ts`. Reuse `ashStoneTexture()` where appropriate; add palette colors from the spec. Provide seed salts for axes.

**Verification command:** `npx vitest run tests/world/buildings/UndeadNecropolisPalette.test.ts`

### Task 16: Undead facade module library

**Goal:** Build reusable crypt doors, barred lantern windows, plaque niches, reliquary displays, sealed slabs, and shored cracks.

**Failing test to write first:** `tests/world/buildings/UndeadFacadeModules.test.ts` asserts each module returns finite geometry, registers depth ladder surfaces, contains the required five opening pieces when it has an aperture, and uses named children for tests/review.

**Implementation outline:** Create `src/world/buildings/UndeadFacadeModules.ts`; consume `OpeningParts`, `VoussoirArch`, `Frieze`, `Pediment`, `LanternKit`, and `DepthLadder`. No module should be a single box/plane stand-in.

**Verification command:** `npx vitest run tests/world/buildings/UndeadFacadeModules.test.ts`

### Task 17: Undead lot dressing placement

**Goal:** Place cemetery ground props deterministically around each footprint without floating or cluttering entrances.

**Failing test to write first:** `tests/world/buildings/UndeadLotDressing.test.ts` asserts dressing for each kind includes plinth/ground-contact elements, avoids a reserved entrance rectangle, is deterministic for the same seed, and varies across seeds.

**Implementation outline:** Create `src/world/buildings/UndeadLotDressing.ts`; consume `MonumentKit`, `Railing`, `LanternKit`, `StringCourse`, and same-material rubble helpers. Return groups with names like `undead-lot-dressing`, `undead-rail`, `undead-monument`.

**Verification command:** `npx vitest run tests/world/buildings/UndeadLotDressing.test.ts`

### Task 18: Undead house builder

**Goal:** Build a one-floor family crypt dwelling / grave-keeper tomb.

**Failing test to write first:** `tests/world/buildings/UndeadNecropolisKit.test.ts` adds `buildUndeadHouse` assertions: footprint fits 4×3, has one off-centre five-piece door, at least one monument/rail/paver ground-contact prop, a gable/table-tomb roof with slab courses, finite geometry, determinism, and no standalone dark `BoxGeometry` window child.

**Implementation outline:** In `UndeadNecropolisKit.ts`, implement `buildUndeadHouse(dna)` using rectangular block-course walls, plinth, one side feature, roof module, and lot dressing.

**Verification command:** `npx vitest run tests/world/buildings/UndeadNecropolisKit.test.ts -t "Undead house"`

### Task 19: Undead terraced crypt-row builder

**Goal:** Make `terraced` a row of crypt fronts sharing party walls.

**Failing test to write first:** Add `buildUndeadTerraced` tests asserting 2-4 front crypt bays, no side windows on party walls, continuous frieze/string course, at least one bay differs, deterministic variation, and finite geometry.

**Implementation outline:** Implement `buildUndeadTerraced(dna)` with `FacadeGrammar` front split, repeated crypt bay modules, party-wall side surfaces, segmented table-tomb/gabled caps, and row-end obelisk/rail dressing.

**Verification command:** `npx vitest run tests/world/buildings/UndeadNecropolisKit.test.ts -t "Undead terraced"`

### Task 20: Undead villa builder

**Goal:** Build a patrician mausoleum / columbarium hall distinct from the house.

**Failing test to write first:** Add `buildUndeadVilla` tests asserting 7×5 footprint fit, 2-3 floor bands, grand front arch, upper columbarium/niche rhythm, obelisk/urn/sarcophagus elite props, one asymmetry/repair feature, finite geometry, and different bounding-box/mesh structure than house.

**Implementation outline:** Implement `buildUndeadVilla(dna)` with central block + portico/wing, floor string courses, columbarium side bands, pediment/roof options, and maintained-decay patches.

**Verification command:** `npx vitest run tests/world/buildings/UndeadNecropolisKit.test.ts -t "Undead villa"`

### Task 21: Undead inn builder

**Goal:** Solve `inn` as an ossuary rest hall instead of reusing the villa.

**Failing test to write first:** Add `buildUndeadInn` tests asserting a 7×5 two-floor hall, 2-3 front arcade bays, upper barred/niche rhythm, bier/sarcophagus/lantern props, service arch offset from centre, finite geometry, and not the same builder/function as villa.

**Implementation outline:** Implement `buildUndeadInn(dna)` with public arcade front, upper niche band, side vents, long slab roof, lantern brackets, and rest-hall lot dressing.

**Verification command:** `npx vitest run tests/world/buildings/UndeadNecropolisKit.test.ts -t "Undead inn"`

### Task 22: Undead shop builder

**Goal:** Rebuild shop as a reliquary market arcade.

**Failing test to write first:** Add `buildUndeadShop` tests asserting shallow U-shaped partial wall, wide counter/double arcade, sarcophagus/table-tomb counter, reliquary display niche with grille, goods from `MonumentKit`/`LanternKit`, finite geometry, and no sphere lanterns or flat transparent cloth as primary read.

**Implementation outline:** Implement `buildUndeadShop(dna)` with partial back/side walls, arcade opening(s), constructed counter, display shelves/niches, stone/timber canopy frame, and deterministic goods placement.

**Verification command:** `npx vitest run tests/world/buildings/UndeadNecropolisKit.test.ts -t "Undead shop"`

### Task 23: Undead blacksmith builder

**Goal:** Build a grave-forge / cemetery ironworks.

**Failing test to write first:** Add `buildUndeadBlacksmith` tests asserting 5×4 footprint fit, broad forge arch with voussoirs, tall stack with vent slits, iron railing/gate/cage goods, exposed/patch roof option, finite geometry, and forge glow not required for recognizability.

**Implementation outline:** Implement `buildUndeadBlacksmith(dna)` with L-shaped masonry, open work arch, chimney/crematory stack, rail racks, anvil/workbench as assembled slabs, and shored roof damage.

**Verification command:** `npx vitest run tests/world/buildings/UndeadNecropolisKit.test.ts -t "Undead blacksmith"`

### Task 24: Undead chapel builder

**Goal:** Build the flagship necropolis chapel.

**Failing test to write first:** Add `buildUndeadChapel` tests asserting 4×8 footprint fit, long nave, three side bays per long wall, grand front iron gate/door, pediment/frieze, side buttresses/pilasters, rail forecourt, tomb/obelisk props, maintained-decay shoring, finite geometry, and clay-render readability without counting emissive materials.

**Implementation outline:** Implement `buildUndeadChapel(dna)` with rectangular block-course nave, front portico/pediment, side bay grammar, rear apse/crypt annex, stone-slate gabled roof, bellcote/finials, and graveyard forecourt.

**Verification command:** `npx vitest run tests/world/buildings/UndeadNecropolisKit.test.ts -t "Undead chapel"`

### Task 25: Undead watchtower builder

**Goal:** Provide the otherwise-unreachable cemetery sentinel/obelisk tower.

**Failing test to write first:** Add `buildUndeadWatchtower` tests asserting 2×2 footprint fit, 3-4 stacked/tapered rings, framed slit openings, obelisk/belfry/rail crown, top lantern/bell if selected, finite geometry, deterministic seed variation, and no floating orb.

**Implementation outline:** Implement `buildUndeadWatchtower(dna)` with square/octagonal block-course shaft, banding, slit opening modules, maintained broken crown, rail/obelisk/belfry cap, and small lot dressing.

**Verification command:** `npx vitest run tests/world/buildings/UndeadNecropolisKit.test.ts -t "Undead watchtower"`

### Task 26: Undead all-kind seed sweep and quality guards

**Goal:** Prove all eight builders are distinct, deterministic, and doctrine-compliant before wiring.

**Failing test to write first:** Extend `tests/world/buildings/UndeadNecropolisKit.test.ts` with a sweep over `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, `watchtower` asserting finite vertices for seeds `[1,2,3,42,999]`, stable vertex/mesh counts for same seed, varied counts or bounding boxes across seeds, and at least six distinct kind bounding boxes/signature child-name sets.

**Implementation outline:** Add common test helpers; add `name` fields to important child groups if missing. Fix any builder that fails determinism or distinctness.

**Verification command:** `npx vitest run tests/world/buildings/UndeadNecropolisKit.test.ts`

### Task 27: Wire into `FACTION_BUILDING_VARIANTS`

**Goal:** Replace collapsed `undead_common` dispatch with all eight new builders.

**Failing test to write first:** Extend `tests/world/FactionBuildingVariants.test.ts` to assert `FACTION_BUILDING_VARIANTS.undead_common` has entries for all eight canonical kinds; `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, and `watchtower` are all present; at least six are distinct function references; `mapStudioFactionToRuntimeFaction('undead')` still resolves to `undead_common`.

**Implementation outline:** Import undead builders from `UndeadNecropolisKit.ts`; update only the `undead_common` registry entry in `src/world/buildings/FactionBuildingVariants.ts`. Do not change other factions.

**Verification command:** `npx vitest run tests/world/FactionBuildingVariants.test.ts tests/world/buildings/BuildingTypeMap.test.ts`

### Task 28: Generalize Settlement Lab showcase so all 8 undead kinds render

**Goal:** Ensure Play in 3D on the Settlement tab shows the complete undead roster together.

**Failing test to write first:** Extend `tests/scene/SettlementLabScene.test.ts` with `faction='undead'` entering a city settlement and assert rendered `buildingRecords` include every canonical undead kind at least once, including `watchtower`; readout mentions showcase; elven behavior remains unchanged.

**Implementation outline:** In `src/scene/SettlementLabScene.ts`, replace one-off `POC_KIND_OVERRIDE_BY_FACTION` logic with a reusable per-race showcase function that can inject missing kinds across the first N buildings while preserving natural ward kinds where possible. For undead, cycle/assign all eight kinds; for elven, preserve current watchtower-plus-natural behavior or express it through the same helper.

**Verification command:** `npx vitest run tests/scene/SettlementLabScene.test.ts -t "showcase"`

### Task 29: Delete superseded undead builders as dead code

**Goal:** Remove old inline undead spire/shrine/shop code and any unused exports after wiring.

**Failing test to write first:** Add `tests/world/buildings/UndeadDeadCode.test.ts` that reads `src/world/buildings/FactionBuildingVariants.ts` and asserts legacy identifiers `buildUndeadVilla`, `buildUndeadChapel`, `buildUndeadShop`, `addBlockUndeadSpire`, and live `IcosahedronGeometry` orb usage under the undead section are absent; also assert no undead registry entry points at a fallback villa builder.

**Implementation outline:** Delete legacy undead helper functions from `FactionBuildingVariants.ts`; remove imports from `FactionBlockProfiles.ts` only if no longer used elsewhere. If `buildUndeadTierGrid` becomes unused except tests, either delete its tests/exports or move it to a documented legacy fixture only if needed. Keep unrelated territory props unless unused.

**Verification command:** `npx vitest run tests/world/buildings/UndeadDeadCode.test.ts tests/world/FactionBuildingVariants.test.ts`

### Task 30: Full regression

**Goal:** Catch new unit/integration/type regressions relative to known baselines.

**Failing test to write first:** No new test file; this is the mandatory regression gate. First run targeted undead/shared tests as a group and confirm they pass.

**Implementation outline:** Fix only failures caused by this work. Do not chase the pre-existing 144 TypeScript errors or known flaky Vitest failures unless this branch added them.

**Verification commands:**

- `npx vitest run tests/world/buildings/kit/DepthLadder.test.ts tests/world/buildings/kit/GothicArch.test.ts tests/world/buildings/kit/OpeningParts.test.ts tests/world/buildings/kit/VoussoirArch.test.ts tests/world/buildings/kit/StringCourse.test.ts tests/world/buildings/kit/FacadeGrammar.test.ts tests/world/buildings/kit/Frieze.test.ts tests/world/buildings/kit/Pediment.test.ts tests/world/buildings/kit/Railing.test.ts tests/world/buildings/kit/LanternKit.test.ts tests/world/buildings/kit/MonumentKit.test.ts tests/world/buildings/kit/Ruinate.test.ts tests/world/buildings/UndeadNecropolisKit.test.ts tests/world/FactionBuildingVariants.test.ts tests/scene/SettlementLabScene.test.ts`
- `npx vitest run` — expected approximately existing baseline: ~13 failures / ~3272 passing unless baseline has moved.
- `npx tsc --noEmit` — expected existing baseline count: 144 errors unless baseline has moved.

### Task 31: Live Playwright verification with screenshot

**Goal:** Visually verify undead buildings in the real Settlement Lab scene.

**Failing test to write first:** Add `tests/e2e/undead-settlement-showcase.spec.ts` or extend `tests/e2e/overworld-studio-settlement-lab-launch.spec.ts` to launch Settlement Lab with `seed=7&type=city&faction=undead&layout=auto`, assert no console errors, assert the readout includes the undead showcase, and capture a screenshot that includes all eight kinds.

**Implementation outline:** Use the existing Playwright config, which starts Vite on `127.0.0.1:5174`. Do not rely on port 5173 because another checkout may serve stale code. Add camera/UI steps only as needed to frame the settlement.

**Verification command:** `npx playwright test tests/e2e/undead-settlement-showcase.spec.ts`

### Task 32: Update TODO documents

**Goal:** Record completion state and any deferred cross-race gaps.

**Failing test to write first:** Documentation-only; no failing code test. Before editing, inspect existing TODO structure and preserve its format.

**Implementation outline:** Update `TODO/organic_world_tiles_todo.md` with undead buildings completed/verified, shared kit consumed/added, and note `watchtower` natural-spawn gap remains cross-race. Update `TODO/TODO_OVERVIEW.md` summary/progress. Do not add planning markdown elsewhere.

**Verification command:** `npx vitest run tests/world/buildings/UndeadNecropolisKit.test.ts tests/scene/SettlementLabScene.test.ts`

### Task 33: Commit

**Goal:** Persist the approved implementation after all verification passes.

**Failing test to write first:** No new test; commit only after Tasks 30-32 are complete and evidence is recorded.

**Implementation outline:** Review changed files, ensure no screenshots/build artifacts are staged unless intentionally tracked, then create one commit with the required co-author trailer.

**Verification command:** After committing, re-run `npx vitest run tests/world/buildings/UndeadNecropolisKit.test.ts tests/world/FactionBuildingVariants.test.ts tests/scene/SettlementLabScene.test.ts` if any last-minute staging edits were made.

Suggested commit message:

```text
feat: add undead necropolis building kit

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```
