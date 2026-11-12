# Fae Buildings — Implementation Plan

**Status:** Draft — awaiting user approval before implementation.

**Estimated task count:** 23 tasks total: 8 shared-kit tasks, 8 Fae race-specific build tasks, and 7 final wiring/verification/release tasks. Fae is scheduled fourth, so implementers should first check whether Tier 1/2 shared kit from earlier races already exists and consume it instead of duplicating it.

---

## 1. Scope

Build the Fae canonical 8-kind building roster:

`house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, `watchtower`.

The implementation must replace the current block-grid mushroom/stalk builders with modular architecture that satisfies the doctrine:

- no visible voxel-grid blobs for caps/stalks/canopies;
- no bare boxes/spheres/cylinders for windows, doors, lanterns, signs, petals, or other readable features;
- all openings use the five-piece minimum;
- roofs/caps use shingles, ribs, gills, petals, eaves, and trim;
- organic lean/bulge/curl comes from assembly-level deformation after parts are built;
- all 8 kinds must be visible together in Settlement Lab “Play in 3D.”

Baseline failures to respect during final verification:

- `npx tsc --noEmit` currently has **144 pre-existing errors**.
- `npx vitest run` currently has **~13 failures / 3272 passing**.
- Only new failures beyond this baseline count as regressions.
- The dev server for live verification must be started from the session worktree on its own port, not the stale main checkout often running on port 5173.

---

## 2. Files to inspect/modify

### Shared kit files

- Create or consume if already present: `src/world/buildings/kit/DepthLadder.ts`
- Create or consume if already present: `src/world/buildings/kit/OpeningParts.ts`
- Create or consume if already present: `src/world/buildings/kit/GothicArch.ts`
- Create or consume if already present: `src/world/buildings/kit/VoussoirArch.ts`
- Create or consume if already present: `src/world/buildings/kit/StringCourse.ts`
- Create or consume if already present: `src/world/buildings/kit/FacadeGrammar.ts`
- Create or consume if already present: `src/world/buildings/kit/ShingleSurface.ts`
- Create or consume if already present: `src/world/buildings/kit/AssemblyLatticeDeform.ts`
- Create or consume if already present: `src/world/buildings/kit/RadialMushroomCap.ts`
- Create or consume if already present: `src/world/buildings/kit/RootFlareSkirt.ts`
- Create or consume if already present: `src/world/buildings/kit/DetailPropParts.ts`

### Fae-specific files

- Create: `src/world/buildings/FaeBuildingPalette.ts`
- Create: `src/world/buildings/FaeOpeningStyles.ts`
- Create: `src/world/buildings/FaeWallSurface.ts`
- Create: `src/world/buildings/FaeRoofs.ts`
- Create: `src/world/buildings/FaePropPlacer.ts`
- Create: `src/world/buildings/FaeBuildingKit.ts`
- Modify: `src/world/buildings/FactionBuildingVariants.ts`
- Modify: `src/scene/SettlementLabScene.ts`
- Modify or delete dead exports in: `src/world/buildings/FactionBlockProfiles.ts`
- Modify if tests currently import retired helpers: `tests/world/FactionBuildingVariants.test.ts`
- Modify TODO docs at the end only: `TODO/organic_world_tiles_todo.md`, `TODO/TODO_OVERVIEW.md`

### Tests to create/update

- `tests/world/buildings/kit/DepthLadder.test.ts`
- `tests/world/buildings/kit/OpeningParts.test.ts`
- `tests/world/buildings/kit/FacadeGrammar.test.ts`
- `tests/world/buildings/kit/ShingleSurface.test.ts`
- `tests/world/buildings/kit/AssemblyLatticeDeform.test.ts`
- `tests/world/buildings/kit/RadialMushroomCap.test.ts`
- `tests/world/buildings/kit/RootFlareSkirt.test.ts`
- `tests/world/buildings/kit/DetailPropParts.test.ts`
- `tests/world/buildings/FaeBuildingPalette.test.ts`
- `tests/world/buildings/FaeOpeningStyles.test.ts`
- `tests/world/buildings/FaeWallSurface.test.ts`
- `tests/world/buildings/FaeRoofs.test.ts`
- `tests/world/buildings/FaePropPlacer.test.ts`
- `tests/world/buildings/FaeBuildingKit.test.ts`
- Update: `tests/world/FactionBuildingVariants.test.ts`
- Add/update Settlement Lab showcase tests if a scene-level test harness exists; otherwise add pure helper tests for the showcase mapping extracted from `SettlementLabScene.ts`.

---

## 3. Task breakdown

### Task 1: [SHARED KIT] Depth ladder constants and assertion

**Goal:** Make doctrine depth offsets named, reusable, and testable.

**Failing test first:**
- File: `tests/world/buildings/kit/DepthLadder.test.ts`
- Assert `DEPTH_LADDER.frame === 0.04`, `sill === 0.08`, `reveal === -0.12`, `glazing === -0.20`, and `assertDistinctDepths()` throws when two named parts are within `0.005 WU`.

**Implementation outline:**
- Create/consume `src/world/buildings/kit/DepthLadder.ts`.
- Export `DEPTH_LADDER`, `DEPTH_EPSILON`, `assertDistinctDepths(parts)`.
- Use numeric constants from doctrine Part 2 Rule 1.

**Verification command:**
- `npx vitest run tests/world/buildings/kit/DepthLadder.test.ts`

---

### Task 2: [SHARED KIT] Five-piece opening parts

**Goal:** Provide reusable doors/windows that cannot regress to “dark box on wall.”

**Failing test first:**
- File: `tests/world/buildings/kit/OpeningParts.test.ts`
- Build a petal/lancet window and a planked door; assert children/names include `recess`, `surround`, `sill` or `threshold`, `mullion`/`transom`/`bar`, and `glazing`/`door-leaf`; assert depth offsets match `DepthLadder`; assert door has 5-7 planks and 3-5 straps.

**Implementation outline:**
- Create/consume `src/world/buildings/kit/OpeningParts.ts`.
- Wrap existing `buildRecessedArchOpening()` only for recess/surround if useful; add missing sill, mullion/transom, set-back rough emissive glazing, planked door leaf, threshold, and straps.
- Export shape-neutral builders: `buildWindowOpening(options)`, `buildDoorOpening(options)`, `buildCounterOpening(options)`.
- Avoid transparent glass; use dark rough emissive plane.

**Verification command:**
- `npx vitest run tests/world/buildings/kit/OpeningParts.test.ts tests/world/buildings/StoneTowerOpenings.test.ts tests/world/buildings/StoneTowerWindows.test.ts tests/world/buildings/StoneTowerEntrance.test.ts`

---

### Task 3: [SHARED KIT] Facade grammar for fixed-size bays

**Goal:** Fit fixed-size openings/props to variable facades without scaling mouldings.

**Failing test first:**
- File: `tests/world/buildings/kit/FacadeGrammar.test.ts`
- Assert a `4 WU` facade can place door + filler + window without scaling the door/window; assert a `7 WU` facade adds repeated bay modules and distributes leftover to filler; assert weights are deterministic for same seed.

**Implementation outline:**
- Create/consume `src/world/buildings/kit/FacadeGrammar.ts`.
- Implement `splitFacade(width, modules, seed)` with absolute modules, relative modules, repeat modules, and floating filler.
- Return bay positions/widths/socket IDs for later placement on a face.

**Verification command:**
- `npx vitest run tests/world/buildings/kit/FacadeGrammar.test.ts`

---

### Task 4: [SHARED KIT] String courses, plinths, and root/moss skirt base

**Goal:** Give every building horizontal shadow bands and grounded contact.

**Failing test first:**
- Files: `tests/world/buildings/kit/StringCourse.test.ts`, `tests/world/buildings/kit/RootFlareSkirt.test.ts`
- Assert `buildStringCourse()` returns a closed footprint-following group with proud `+0.08` profile; assert `buildRootFlareSkirt()` creates 4-8 root toes, moss pads, and embedded stones and all vertices are finite.

**Implementation outline:**
- Create/consume `src/world/buildings/kit/StringCourse.ts` if earlier race has not.
- Create/consume `[SHARED KIT] src/world/buildings/kit/RootFlareSkirt.ts`.
- Use footprint point lists from `StoneTowerShape.ts` or simple rectangle points.
- Root toes are tapered low-poly branch meshes/segments with moss pads and same-material stones; no hard cylinder entering ground.

**Verification command:**
- `npx vitest run tests/world/buildings/kit/StringCourse.test.ts tests/world/buildings/kit/RootFlareSkirt.test.ts`

---

### Task 5: [SHARED KIT] Curved shingle surface

**Goal:** Build curled/swept Fae roofs from discrete overlapping tiles rather than cones/planes.

**Failing test first:**
- File: `tests/world/buildings/kit/ShingleSurface.test.ts`
- Assert `buildCurvedShingleSurface()` creates multiple named `shingle-course-*` groups, each tile has finite geometry, successive courses overlap, eave/verge/ridge trim exist, and tile count is deterministic for seed.

**Implementation outline:**
- Create/extend `src/world/buildings/kit/ShingleSurface.ts`.
- Support straight roof surfaces from earlier races plus curved directrix mode for Fae: sample a `THREE.Curve`, compute frames, place diamond/fish-scale tiles with 2-5° kick and visible butts.
- Export `buildCurledConeShingleRoof(options)` or equivalent adapter for conical/curl roofs.
- LOD1 may use stepped bands; LOD0 must use real tiles.

**Verification command:**
- `npx vitest run tests/world/buildings/kit/ShingleSurface.test.ts`

---

### Task 6: [SHARED KIT] Assembly-level lattice deformation

**Goal:** Reuse/extend the existing lattice-deform concept so Fae buildings lean/bulge after modular assembly, without becoming blobs.

**Failing test first:**
- File: `tests/world/buildings/kit/AssemblyLatticeDeform.test.ts`
- Assert identity deformation preserves positions; a lean/bulge profile changes vertices within configured clamp; output vertices remain finite; named opening child depths remain ordered; shingle course order remains monotonic.

**Implementation outline:**
- Create `[SHARED KIT] src/world/buildings/kit/AssemblyLatticeDeform.ts`.
- Read `src/world/LatticeDeform.ts` and reuse conventions/corner ordering where applicable.
- Export profile helpers: `makeLeanProfile`, `makeBellyProfile`, `makeRoofCurlProfile`, `deformAssembly(group, bounds, profile)`.
- Deform mesh vertices after all major modules are placed, or deform sockets/control points before placing repeated detail to preserve tile alignment.
- Clamp deformation and recompute bounding boxes/normals.

**Verification command:**
- `npx vitest run tests/world/LatticeDeform.test.ts tests/world/buildings/kit/AssemblyLatticeDeform.test.ts`

---

### Task 7: [SHARED KIT] Radial mushroom cap module

**Goal:** Replace mushroom blobs with cap ribs, gills, shingle bands, raised spots, and scalloped rim.

**Failing test first:**
- File: `tests/world/buildings/kit/RadialMushroomCap.test.ts`
- Assert a cap has 12-20 radial ribs, underside gills, at least 3 shingle/scale bands, a thick scalloped rim, optional raised spore plaques, no single `SphereGeometry`/lathe dome as the cap body, and finite vertices.

**Implementation outline:**
- Create `[SHARED KIT] src/world/buildings/kit/RadialMushroomCap.ts`.
- Emit low-poly radial ribs/tubes or tapered fin meshes, underside gill fins, shingle/scale plates between bands, rim blocks/plates, and raised plaques.
- Support circular, oval, and elongated chapel cap profiles.
- Materials are passed in; no cloned material per spot/tile unless using instance colour/vertex colour.

**Verification command:**
- `npx vitest run tests/world/buildings/kit/RadialMushroomCap.test.ts`

---

### Task 8: [SHARED KIT] Detail prop parts

**Goal:** Create real prop modules that carry the Fae small-scale read.

**Failing test first:**
- File: `tests/world/buildings/kit/DetailPropParts.test.ts`
- Assert lantern is frame + panes + cap + hook, not one glowing cube; flower box is box + soil + flowers/stems; vine is curve/tendril segments with leaves; balcony has deck + posts + rails/balusters; washing/bunting line has cord + cloth pieces.

**Implementation outline:**
- Create `[SHARED KIT] src/world/buildings/kit/DetailPropParts.ts`.
- Export `buildLantern`, `buildFlowerBox`, `buildVineTendril`, `buildTinyMushroomCluster`, `buildBalconyRail`, `buildBuntingLine`, `buildHangingSign`.
- All props are deterministic by seed and named for tests.
- Use simple primitives only as sub-pieces of a named composite with thickness, frames, and context.

**Verification command:**
- `npx vitest run tests/world/buildings/kit/DetailPropParts.test.ts`

---

### Task 9: Fae palette and material recipes

**Goal:** Centralise Fae bark, fungal, petal, shingle, glow, moss, and soot materials.

**Failing test first:**
- File: `tests/world/buildings/FaeBuildingPalette.test.ts`
- Assert `buildFaePalette(dna)` returns stable material object references for wall/roof/trim/glow/bark/moss; no per-tile cloned materials; emissive materials exist only for panes, spores, lantern panes, or fireflies.

**Implementation outline:**
- Create `src/world/buildings/FaeBuildingPalette.ts`.
- Reuse texture helpers from `FactionBlockTextures.ts`/`TextureFactory.ts` where appropriate.
- Provide accent variants: pink/purple default, teal/blue cap, warm yellow lantern, bark brown, moss green, soot for blacksmith.

**Verification command:**
- `npx vitest run tests/world/buildings/FaeBuildingPalette.test.ts`

---

### Task 10: Fae opening style wrappers

**Goal:** Adapt shared five-piece openings into petal, round, moonmoth slit, shop counter, and forge mouth styles.

**Failing test first:**
- File: `tests/world/buildings/FaeOpeningStyles.test.ts`
- Assert each Fae opening type includes all five pieces, uses correct depth offsets, has at least one internal division, and names pieces for inspection; assert door has planks/straps/threshold.

**Implementation outline:**
- Create `src/world/buildings/FaeOpeningStyles.ts`.
- Export `buildFaeDoor`, `buildFaeWindow`, `buildFaeCounterBay`, `buildFaeForgeMouth`.
- Use `OpeningParts.ts`, `GothicArch.ts`, `VoussoirArch.ts`, and petal/twig trim adapters.
- Round windows get twig crossbars or crescent/petal muntins; no plain glowing discs.

**Verification command:**
- `npx vitest run tests/world/buildings/FaeOpeningStyles.test.ts tests/world/buildings/kit/OpeningParts.test.ts`

---

### Task 11: Fae wall surfaces

**Goal:** Build bark, fungal plaster, woven twig, and root-ball wall surfaces without smooth cylinders or voxel masses.

**Failing test first:**
- File: `tests/world/buildings/FaeWallSurface.test.ts`
- Assert each wall style creates named vertical ribs/panels, string course sockets, and finite geometry; assert no single smooth cylinder/box is the whole wall; assert bark ribs sit proud of wall face.

**Implementation outline:**
- Create `src/world/buildings/FaeWallSurface.ts`.
- Use face lists from `StoneTowerShape.ts` or rectangle/octagon helpers.
- Emit low-poly bark strips/panels and plaster infill; add root buttresses and floor bands via shared modules.
- Keep openings as sockets so `FaeOpeningStyles` can place five-piece modules on top.

**Verification command:**
- `npx vitest run tests/world/buildings/FaeWallSurface.test.ts`

---

### Task 12: Fae roof adapters

**Goal:** Select and build Fae roof archetypes from shared compliant roof/cap modules.

**Failing test first:**
- File: `tests/world/buildings/FaeRoofs.test.ts`
- Assert mushroom, petal, curled cone, leaf shed, and lattice chapel roof builders return finite geometry with named shingles/ribs/gills/eaves/finials; assert no roof is one flat plane/cone/sphere.

**Implementation outline:**
- Create `src/world/buildings/FaeRoofs.ts`.
- Wrap `RadialMushroomCap`, `ShingleSurface`, and lattice canopy modules.
- Add crescent/flower/lantern finials as real composites.
- Provide roof weights matching `spec.md` per kind.

**Verification command:**
- `npx vitest run tests/world/buildings/FaeRoofs.test.ts tests/world/buildings/kit/ShingleSurface.test.ts tests/world/buildings/kit/RadialMushroomCap.test.ts`

---

### Task 13: Fae prop placer

**Goal:** Place dense Fae ornaments deterministically without overlap or symmetry.

**Failing test first:**
- File: `tests/world/buildings/FaePropPlacer.test.ts`
- Assert the same seed yields identical prop placements, different seeds vary, every building gets at least two prop categories, props attach to sockets/depth offsets, and no perfectly mirrored prop layout is produced.

**Implementation outline:**
- Create `src/world/buildings/FaePropPlacer.ts`.
- Use sockets from wall/roof/facade outputs: `door-hook`, `window-sill`, `eave-under`, `ground-skirt`, `balcony`, `sign-bracket`, `stair-anchor`.
- Weighted props: lanterns, vines, flower boxes, toadstool clusters, bunting/washing lines, balcony/rails, spiral stairs, signs.
- Include collision/overlap avoidance by socket category and simple distance checks.

**Verification command:**
- `npx vitest run tests/world/buildings/FaePropPlacer.test.ts`

---

### Task 14: Fae assembly core and quality guards

**Goal:** Provide one assembly pipeline used by all Fae kinds: mass → wall → openings → roof → props → deformation → merge.

**Failing test first:**
- File: `tests/world/buildings/FaeBuildingKit.test.ts`
- Add shared tests asserting `buildFaeAssembly()` preserves finite vertices, includes root skirt/string courses, has named opening parts, and applies deformation after core modules exist.

**Implementation outline:**
- Create `src/world/buildings/FaeBuildingKit.ts` with internal helpers:
  - `buildFaeAssembly(dna, config)`;
  - `buildFaeMasses(dna, kindConfig)`;
  - `placeFaeOpenings(assembly, schedule)`;
  - `applyFaeDeformation(group, config)`.
- Use `getFootprint(dna.buildingKind, dna.size)` for all footprint-dependent dimensions.
- Keep materials shared through `FaeBuildingPalette`.

**Verification command:**
- `npx vitest run tests/world/buildings/FaeBuildingKit.test.ts`

---

### Task 15: Residential Fae kinds — `house` and `terraced`

**Goal:** Implement Glowcap Cottage and Pixie Row House.

**Failing test first:**
- File: `tests/world/buildings/FaeBuildingKit.test.ts`
- Add tests for `buildFaeHouse()` and `buildFaeTerraced()`: footprint extents differ (`terraced` narrower), five-piece openings exist, house has root flare + mushroom/curl/petal roof, terraced has party-wall-aware facade and upper window, no alias mesh counts identical to villa.

**Implementation outline:**
- Add `buildFaeHouse(dna)` and `buildFaeTerraced(dna)` to `FaeBuildingKit.ts`.
- House: 4×3, 1 floor, broad cap or curled roof, oversized door/window, root skirt.
- Terraced: 3×4, 2 mini-storeys, party side walls, narrow swept shingle roof, front bunting/lantern/flower box.

**Verification command:**
- `npx vitest run tests/world/buildings/FaeBuildingKit.test.ts --runInBand` if supported, otherwise `npx vitest run tests/world/buildings/FaeBuildingKit.test.ts`

---

### Task 16: Large social Fae kinds — `villa` and `inn`

**Goal:** Implement Fae Court House and Firefly Inn as distinct assemblies.

**Failing test first:**
- File: `tests/world/buildings/FaeBuildingKit.test.ts`
- Add tests for `buildFaeVilla()` and `buildFaeInn()`: villa has multi-mass composition and at least one secondary turret/cap; inn has porch/sign and double-door/counter/social front; both have distinct geometry/child names for same seed.

**Implementation outline:**
- Add `buildFaeVilla(dna)` and `buildFaeInn(dna)`.
- Villa: main hall + side turret/wing, 2 floors, mixed roof/cap, balcony/lantern/stair options.
- Inn: wide lodge, porch, hanging sign, double door, broad cap roof, warm window grouping.

**Verification command:**
- `npx vitest run tests/world/buildings/FaeBuildingKit.test.ts`

---

### Task 17: Work/market Fae kinds — `shop` and `blacksmith`

**Goal:** Implement Petal Market Stall and Glowforge Hollow.

**Failing test first:**
- File: `tests/world/buildings/FaeBuildingKit.test.ts`
- Add tests for `buildFaeShop()` and `buildFaeBlacksmith()`: shop has counter bay with sill/divider/set-back interior and thick petal awning; blacksmith has open-front frame, forge mouth as an opening module, chimney/vent, and tool/forge props.

**Implementation outline:**
- Add `buildFaeShop(dna)` and `buildFaeBlacksmith(dna)`.
- Replace flat `CircleGeometry` petals with thick, bevelled, ribbed petal plates.
- Blacksmith uses soot palette, root posts, forge mouth, ember plane, and leaf/petal shed roof.

**Verification command:**
- `npx vitest run tests/world/buildings/FaeBuildingKit.test.ts tests/world/buildings/FaeOpeningStyles.test.ts`

---

### Task 18: Sacred/landmark Fae kinds — `chapel` and `watchtower`

**Goal:** Implement Faerie Ring Chapel and Moonmoth Lookout.

**Failing test first:**
- File: `tests/world/buildings/FaeBuildingKit.test.ts`
- Add tests for `buildFaeChapel()` and `buildFaeWatchtower()`: chapel is a constructed canopy/nave with columns, openings/tracery, altar/root glow, and no glowing torus as the building; watchtower is 2×2, tall, has stacked windows, lookout/balcony, curled shingle roof, and root-flare anchoring.

**Implementation outline:**
- Add `buildFaeChapel(dna)` and `buildFaeWatchtower(dna)`.
- Chapel uses lattice canopy or elongated radial mushroom cap; ring is stones/moss/columns/lanterns, not torus.
- Watchtower uses octagonal/rounded-square bark shaft, string courses, spiral stair/balcony, and curled cone shingle roof.

**Verification command:**
- `npx vitest run tests/world/buildings/FaeBuildingKit.test.ts tests/world/buildings/kit/AssemblyLatticeDeform.test.ts`

---

### Task 19: Wire Fae registry into `FACTION_BUILDING_VARIANTS`

**Goal:** Make all 8 Fae builders reachable by runtime faction `fae`.

**Failing test first:**
- File: `tests/world/FactionBuildingVariants.test.ts`
- Replace old Fae block-grid tests with canonical roster tests: for every kind in `['house','terraced','villa','inn','shop','blacksmith','chapel','watchtower']`, `getFactionBuildingVariant('fae', kind)` is non-null, builds finite geometry, includes named Fae quality markers, and kinds are not all aliases with identical child/name signatures.

**Implementation outline:**
- Modify `src/world/buildings/FactionBuildingVariants.ts`.
- Import Fae builders from `FaeBuildingKit.ts`.
- Replace `fae` registry aliases with explicit builders for all 8 kinds.
- Keep `tower` optional; if wired, document it as aliasing `watchtower` only if desired, but canonical acceptance is `watchtower`.

**Verification command:**
- `npx vitest run tests/world/FactionBuildingVariants.test.ts tests/world/buildings/FaeBuildingKit.test.ts`

---

### Task 20: Generalise Settlement Lab showcase for all 8 Fae kinds

**Goal:** Ensure selecting Fae in Settlement Lab “Play in 3D” shows all 8 kinds together, including `watchtower`.

**Failing test first:**
- File: add `tests/scene/SettlementLabScene-showcase.test.ts` or a pure helper test if extracting the showcase mapping is cleaner.
- Assert the Fae showcase callback cycles/assigns `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, and `watchtower` across available placed buildings; assert elven existing behavior still includes its watchtower override.

**Implementation outline:**
- Modify `src/scene/SettlementLabScene.ts`.
- Extract `POC_KIND_OVERRIDE_BY_FACTION` or showcase helper if needed for tests.
- Add `fae` mapping that forces/cycles all 8 kinds across building indices while allowing natural ward mapping where it already supplies the kind.
- Update readout label to `showcase (all fae kits)`.

**Verification command:**
- `npx vitest run tests/scene/SettlementLabScene-showcase.test.ts tests/ui/SettlementLabPanel.test.ts`

---

### Task 21: Delete superseded Fae builders and update tests/imports

**Goal:** Remove dead code that would let future work fall back to block-grid mushroom blobs.

**Failing test first:**
- File: `tests/world/FactionBuildingVariants.test.ts`
- Assert no built Fae building contains old marker names/functions from `buildFaeStalkGrid` path, no chapel contains a standalone glowing torus named/used as sacred ring, and no shop uses flat circle petals.

**Implementation outline:**
- Delete or de-export building-scale Fae helpers from `FactionBuildingVariants.ts`: old `addMushroomGills`, `addBlockFaeStalk`, old `buildFaeVilla`, old `buildFaeChapel`, old `buildFaeShop`.
- In `FactionBlockProfiles.ts`, delete `buildFaeStalkGrid`, `faeCapTopY`, `faeCapRimRadius`, `FaeStalkOptions` if no remaining tests/props need them; if `FactionTerritoryProps.ts` still imports small mushroom grid helpers, do not break those unrelated scatter props unless this task explicitly migrates them.
- Update old tests that imported `buildFaeStalkGrid` to test new modules instead.

**Verification command:**
- `npx vitest run tests/world/FactionBuildingVariants.test.ts tests/world/FactionTerritoryProps.test.ts tests/world/buildings/FaeBuildingKit.test.ts`

---

### Task 22: Full regression

**Goal:** Confirm no new test or type regressions beyond stated baselines.

**Failing test first:**
- No new test file; this is a validation task.
- Before running full suite, record expected baseline: `npx tsc --noEmit` has 144 pre-existing errors, `npx vitest run` has ~13 pre-existing failures.

**Implementation outline:**
- Run targeted tests from previous tasks once more if any code was touched after Task 21.
- Run full unit suite.
- Run TypeScript check.
- Compare failures/errors against baseline and fix any new failures caused by Fae work.

**Verification commands:**
- `npx vitest run`
- `npx tsc --noEmit`

---

### Task 23: Live Playwright verification, TODO updates, and commit

**Goal:** Visually confirm the Fae buildings meet the art/doctrine gate, update roadmap docs, and prepare a commit.

**Failing test first:**
- Add/extend a Playwright scenario if an existing Settlement Lab screenshot flow exists, e.g. `tests/e2e/fae-buildings-showcase.spec.ts`.
- Assert it opens Settlement Lab with faction `fae`, captures a screenshot, and the scene reports `showcase (all fae kits)` with nonzero buildings.

**Implementation outline:**
1. Start Vite dev server from the session worktree on a unique port.
2. Run the Fae Settlement Lab Playwright screenshot scenario.
3. Inspect screenshot manually for: all 8 kinds visible, no blob caps, no flat circle petals, no dark-box windows, root/moss ground contact, dense but real props, and clear roof shingles/ribs/gills.
4. Update `TODO/organic_world_tiles_todo.md` and `TODO/TODO_OVERVIEW.md` with completed Fae building status and any deferred gaps.
5. Commit the implementation after verification.

**Verification commands:**
- `npx playwright test tests/e2e/fae-buildings-showcase.spec.ts --project=chromium`
- Re-run, if TODO edits affect tracked docs only, the smallest relevant doc/no-op check available; otherwise no extra unit test needed for docs.
- Commit after successful verification with a message such as:
  - `feat: rebuild fae building kits`
  - Include trailer: `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`

---

## 4. Testing and verification strategy

Targeted TDD sequence:
1. Shared kit tests first, because Fae depends on them.
2. Fae module tests next: palette, openings, walls, roofs, prop placement.
3. Fae kind assembly tests.
4. Registry and Settlement Lab showcase tests.
5. Dead-code/anti-regression tests for retired block-grid mushroom path.
6. Full `npx vitest run` and `npx tsc --noEmit`.
7. Live Playwright screenshot.

Visual acceptance checklist for the screenshot:
- All 8 canonical Fae kinds appear together.
- Each kind is distinguishable by silhouette and props.
- Curled roofs show individual shingle courses.
- Mushroom caps show ribs/gills/shingles/rim thickness, not smooth domes or voxel blobs.
- Doors/windows visibly have frames, sills/thresholds, mullions/bars, and set-back glow.
- Root/moss flares hide ground intersections.
- Prop density is high but props are real composites.

---

## 5. Order of operations / commits

Recommended commit chunks for the executor:

1. Shared depth/opening/facade/string-course basics.
2. Shared Fae-driven organic kit: curved shingles, assembly lattice deformation, radial mushroom cap, root skirt, detail props.
3. Fae palette/openings/walls/roofs/props.
4. Fae residential/social/work/sacred/landmark builders.
5. Registry + Settlement Lab showcase + dead-code cleanup.
6. TODO docs + final verification fixes.

Do not merge partial work unless targeted tests for that chunk pass. If a shared-kit module already exists from an earlier race, do not duplicate it; adapt Fae to the landed API and keep the same tests as regression coverage.

---

## 6. Risks / open questions

- `house_4.avif` was less legible in the current preview than the other references. The spec uses it only as corroboration for saturated colour/dense ornament; user can provide clearer art if it was intended to drive a specific form.
- `AssemblyLatticeDeform` could be expensive if applied after every shingle tile is emitted. Prefer deforming roof/wall control points before creating batched shingles where possible.
- Watchtower reachability outside Settlement Lab remains cross-race scope. This plan only satisfies the showcase requirement.
- `FactionTerritoryProps.ts` still has block-grid tiny mushrooms. This plan does not require rebuilding scatter props, but a later polish pass should migrate them to `RadialMushroomCap` at small scale.
- If Tier 1/2 shared modules differ from the APIs assumed here by the time Fae is implemented, preserve the spec’s visual/quality outcomes and update only the integration names.
