# Orcish Buildings — Implementation Plan

**Status:** Draft — awaiting user approval before implementation.

**Estimated task count:** 25 tasks. Tasks 1–8 are shared-kit tasks marked `[SHARED KIT]` and may be consumed/deduped if earlier race branches already implemented them. Tasks 9–18 are orcish-specific builders. Tasks 19–25 are integration, verification, docs, and commit.

**Baseline expectations to restate during implementation:** `npx tsc --noEmit` has 144 pre-existing errors; `npx vitest run` has about 13 pre-existing failures / 3272 passing. Only new failures beyond that baseline are regressions.

**Implementation root:** repository root. Do not use `/tmp`; if an ad-hoc Playwright spec or screenshot is needed, keep it under project-local ignored output such as `test-results/` and remove throwaway source before committing.

---

### Task 1: [SHARED KIT] Depth ladder constants

**Goal:** Make the doctrine depth offsets reusable and testable.

- [ ] **Failing test:** Create `tests/world/buildings/kit/DepthLadder.test.ts`; assert named offsets are ordered (`buttress > sill > frame > wall > reveal > glazing`) and `assertDistinctDepths()` throws for offsets within `0.005 WU`.
- [ ] **Implementation outline:** Create `src/world/buildings/kit/DepthLadder.ts` exporting `DEPTH_LADDER`, `DepthSlot`, `depthOffset(slot)`, and `assertDistinctDepths(entries)`.
- [ ] **Verification:** `npx vitest run tests/world/buildings/kit/DepthLadder.test.ts`.

### Task 2: [SHARED KIT] Five-piece opening parts

**Goal:** Complete windows/doors/counters so no opening is a dark box.

- [ ] **Failing test:** Create `tests/world/buildings/kit/OpeningParts.test.ts`; assert `buildFivePieceOpening()` includes named children `recess`, `surround`, `sill-or-threshold`, `division`, and `back-plane`, each on distinct `DEPTH_LADDER` offsets. Assert `buildPlankedDoorLeaf()` emits 5–7 plank meshes plus 3–5 straps.
- [ ] **Implementation outline:** Create `src/world/buildings/kit/OpeningParts.ts`; use existing `buildRecessedArchOpening()` where possible, add sill/threshold, mullion/crossbar, dark set-back plane, plank leaves, and strap ironwork. Use `GothicArch` once Task 3 exists.
- [ ] **Verification:** `npx vitest run tests/world/buildings/kit/OpeningParts.test.ts tests/world/buildings/StoneTowerOpenings.test.ts`.

### Task 3: [SHARED KIT] Squat arch and voussoir support

**Goal:** Provide rough Romanesque/tusk arches for orcish doors and forge mouths.

- [ ] **Failing test:** Create `tests/world/buildings/kit/GothicArch.test.ts` and `tests/world/buildings/kit/VoussoirArch.test.ts`; assert `buildArchShape({ archRatio: 0.5 })` is lower/squatter than `1.6`, and `buildVoussoirArch()` emits wedge blocks plus a proud keystone.
- [ ] **Implementation outline:** Create/consume `src/world/buildings/kit/GothicArch.ts` and `src/world/buildings/kit/VoussoirArch.ts`; parameterize `archRatio`; allow materials for stone, bone, or tusk blocks.
- [ ] **Verification:** `npx vitest run tests/world/buildings/kit/GothicArch.test.ts tests/world/buildings/kit/VoussoirArch.test.ts`.

### Task 4: [SHARED KIT] Facade grammar and sockets

**Goal:** Make salvage/spoils deterministic module swaps, not random scatter.

- [ ] **Failing test:** Create `tests/world/buildings/kit/FacadeGrammar.test.ts`; assert fixed bay modules keep exact widths, leftover is assigned to floating filler, weighted choices are deterministic by seed, and sockets reject excluded neighbors.
- [ ] **Implementation outline:** Create/consume `src/world/buildings/kit/FacadeGrammar.ts` and `src/world/buildings/kit/ModuleSocket.ts` with split/repeat/floating segments and weighted module prototypes.
- [ ] **Verification:** `npx vitest run tests/world/buildings/kit/FacadeGrammar.test.ts`.

### Task 5: [SHARED KIT] Lashed timber module

**Goal:** Replace visible orcish voxel walls with discrete tapered log construction.

- [ ] **Failing test:** Create `tests/world/buildings/kit/LashedTimber.test.ts`; assert `buildLashedTimberWall()` emits individual log members, visible end-grain caps, lashing bands at joints, staggered seams across courses, and no single wall-sized box/grid mesh.
- [ ] **Implementation outline:** Create `src/world/buildings/kit/LashedTimber.ts` exporting tapered-log geometry helpers, `buildLogCourseWall()`, `buildPostFrame()`, `buildCrossBraces()`, and `buildLashingBand()`.
- [ ] **Verification:** `npx vitest run tests/world/buildings/kit/LashedTimber.test.ts`.

### Task 6: [SHARED KIT] Hide panel / stretched skin module

**Goal:** Build hide walls and roofs from frames first, sagging skin second.

- [ ] **Failing test:** Create `tests/world/buildings/kit/HidePanel.test.ts`; assert every panel has at least two proud ribs/posts, a skin mesh set behind/proudly separate from ribs, sag between ribs, and thickened/chamfered free edges.
- [ ] **Implementation outline:** Create `src/world/buildings/kit/HidePanel.ts` (or `StretchedSkin.ts`) with `buildHidePanel(frame)`, `buildRibbedHideWall()`, and material parameters for patched hides.
- [ ] **Verification:** `npx vitest run tests/world/buildings/kit/HidePanel.test.ts`.

### Task 7: [SHARED KIT] Ribbed hide roofs and awnings

**Goal:** Replace smooth cones/flat awnings with yurt, longhouse, and lean-to roof assemblies.

- [ ] **Failing test:** Create `tests/world/buildings/kit/RibbedRoof.test.ts`; assert yurt/conical/longhouse/awning roofs have visible ribs, crown or ridge pieces, thick eaves, multiple hide panels, and no lone `ConeGeometry`/one-plane roof result.
- [ ] **Implementation outline:** Create `src/world/buildings/kit/RibbedRoof.ts` consuming `HidePanel` and `LashedTimber`; export `buildYurtRoof()`, `buildConicalHideRoof()`, `buildLonghouseHideRoof()`, and `buildRibbedAwning()`.
- [ ] **Verification:** `npx vitest run tests/world/buildings/kit/RibbedRoof.test.ts`.

### Task 8: [SHARED KIT] Salvage and built prop modules

**Goal:** Provide socketable shields, tusks, banners, racks, kegs, crates, and forge props as assembled modules.

- [ ] **Failing test:** Create `tests/world/buildings/kit/SalvageSpoils.test.ts`; assert each prop is multi-piece, has a named socket anchor, obeys minimum readable size (`>= 0.08 WU`), and is deterministic by seed.
- [ ] **Implementation outline:** Create `src/world/buildings/kit/SalvageSpoils.ts` with captured shields, tusk finials, banner strips, board-built crates, stave-built kegs, weapon racks, anvil, coal bin, and trophy skull/mask approximations.
- [ ] **Verification:** `npx vitest run tests/world/buildings/kit/SalvageSpoils.test.ts`.

### Task 9: Orcish palette and builder skeleton

**Goal:** Establish one race-specific module that composes all eight kinds.

- [ ] **Failing test:** Create `tests/world/buildings/OrcishBuildingKit.test.ts`; assert exported builder names exist for `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, and `watchtower` and return non-empty finite `THREE.Group`s.
- [ ] **Implementation outline:** Create `src/world/buildings/OrcishBuildingKit.ts` with shared palette/material helpers, `ORCISH_BUILDING_KIND_ROSTER`, seeded weighted-choice helpers, and empty/minimal composition shells using the new shared modules.
- [ ] **Verification:** `npx vitest run tests/world/buildings/OrcishBuildingKit.test.ts`.

### Task 10: Orcish house

**Goal:** Build the small ribbed hide hut.

- [ ] **Failing test:** In `OrcishBuildingKit.test.ts`, assert `buildOrcishHouse()` uses `getFootprint('house','small')` scale, has one five-piece off-centre door, at least one smoke slot, `LashedTimber` walls, and a ribbed yurt/conical hide roof.
- [ ] **Implementation outline:** Implement `buildOrcishHouse(dna)` using `LashedTimber`, `RibbedRoof`, `OpeningParts`, and `SalvageSpoils`; apply house variation weights from `spec.md`.
- [ ] **Verification:** `npx vitest run tests/world/buildings/OrcishBuildingKit.test.ts -t "house"`.

### Task 11: Orcish terraced row hut

**Goal:** Build the narrow two-level slum/row variant without side-window leaks.

- [ ] **Failing test:** Assert `buildOrcishTerraced()` has 2 visual tiers, no side openings when `dna.terrace` marks party walls, a jettied/upper front module on weighted seeds, and a shared ragged roof ridge.
- [ ] **Implementation outline:** Add terraced composition with front/rear detailed `LashedTimber`, party-wall suppression, upper hide/plank module choices, and row-compatible roof.
- [ ] **Verification:** `npx vitest run tests/world/buildings/OrcishBuildingKit.test.ts -t "terraced"`.

### Task 12: Orcish villa / warlord hall

**Goal:** Build the big-house/warlord hall from the reference camp kit.

- [ ] **Failing test:** Assert `buildOrcishVilla()` has broad `7×5` massing, double war door, trophy/tusk socket, optional side lean-to, and module-swapped spoil panels; assert it is not the old `buildOrcishHutGrid()` mesh.
- [ ] **Implementation outline:** Compose long hall mass via `MassComposer`/`FacadeGrammar`, larger log courses, rough stone plinth, porch, longhouse roof, and weighted trophy sockets.
- [ ] **Verification:** `npx vitest run tests/world/buildings/OrcishBuildingKit.test.ts -t "villa"`.

### Task 13: Orcish inn / mead hall

**Goal:** Build a strong longhouse silhouette for the inn kind.

- [ ] **Failing test:** Assert `buildOrcishInn()` has `7×5` footprint, 2 visual storeys, high ridge roof, porch/counter opening, 4 shuttered windows, smoke vents, and a shield/tusk sign module.
- [ ] **Implementation outline:** Reuse villa hall pieces with mead-hall-specific porch, signs, stave-built kegs, benches, and smoke-vent sockets.
- [ ] **Verification:** `npx vitest run tests/world/buildings/OrcishBuildingKit.test.ts -t "inn"`.

### Task 14: Orcish shop / loot stall

**Goal:** Rebuild the loot stall as an open framed shop, not a voxel lean-to.

- [ ] **Failing test:** Assert `buildOrcishShop()` has an open front, wide five-piece counter aperture, red ribbed awning, goods/rack sockets, and no bare box crates as the main prop signal.
- [ ] **Implementation outline:** Compose short back/side timber walls, framed counter slab, `buildRibbedAwning()`, and weighted goods from `SalvageSpoils`.
- [ ] **Verification:** `npx vitest run tests/world/buildings/OrcishBuildingKit.test.ts -t "shop"`.

### Task 15: Orcish blacksmith / forge-smelter

**Goal:** Make blacksmith the flagship forge with the reference image’s metal chimney.

- [ ] **Failing test:** Assert `buildOrcishBlacksmith()` has a rough stone forge pad, a main forge mouth with five-piece/tusk surround, a work-bay opening, a tall riveted metal stack higher than the roof, and assembled forge props.
- [ ] **Implementation outline:** Add forge hearth module, stacked metal plate chimney, orange emissive forge interior, side shelter roof, anvil/weapon/coal sockets.
- [ ] **Verification:** `npx vitest run tests/world/buildings/OrcishBuildingKit.test.ts -t "blacksmith"`.

### Task 16: Orcish chapel / war totem shrine

**Goal:** Replace props-only chapel with a real open shrine building.

- [ ] **Failing test:** Assert `buildOrcishChapel()` uses `4×8` chapel footprint, has front ritual portal, ribbed hide canopy, central totem/altar line, side screens, and no old ring of cylinder poles + sphere skulls as the whole building.
- [ ] **Implementation outline:** Compose processional post frame, low log rails, hide screens, long canopy with smoke gap, totem modules, altar plinth, and offering sockets.
- [ ] **Verification:** `npx vitest run tests/world/buildings/OrcishBuildingKit.test.ts -t "chapel"`.

### Task 17: Orcish watchtower

**Goal:** Add a proper lashed lookout platform for the unreachable-but-canonical kind.

- [ ] **Failing test:** Assert `buildOrcishWatchtower()` fits the fixed `2×2` footprint, is taller than wide, has four splayed legs, cross braces, ladder/hatch, platform rails, ribbed cap or open platform, and a signal prop.
- [ ] **Implementation outline:** Use `LashedTimber` vertical logs/braces, plank platform, parapet gaps, hatch frame, ladder, and roof/pennant variants.
- [ ] **Verification:** `npx vitest run tests/world/buildings/OrcishBuildingKit.test.ts -t "watchtower"`.

### Task 18: Orcish seed variation and kind distinctness

**Goal:** Prove procedural variety is weighted module swapping, not scaling one mesh.

- [ ] **Failing test:** In `OrcishBuildingKit.test.ts`, assert same seed is deterministic, different seeds choose different named module variants, all per-kind variation tables sum to 1.0, and all eight kinds produce distinct signatures (names/child groups/bounds), not one reused villa.
- [ ] **Implementation outline:** Export/test `ORCISH_VARIATION_TABLES`; name child groups by module choice; ensure every builder uses fixed modules plus `FacadeGrammar` fillers.
- [ ] **Verification:** `npx vitest run tests/world/buildings/OrcishBuildingKit.test.ts`.

### Task 19: Wire into `FACTION_BUILDING_VARIANTS`

**Goal:** Route runtime faction `'orcish'` to all eight new builders.

- [ ] **Failing test:** Update `tests/world/FactionBuildingVariants.test.ts`; assert `FACTION_BUILDING_VARIANTS.orcish` has builders for `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, and `watchtower`; assert `getFactionBuildingVariant('orcish', kind)` returns each new function; assert `mapStudioFactionToRuntimeFaction('orcish')` remains `'orcish'`.
- [ ] **Implementation outline:** Modify `src/world/buildings/FactionBuildingVariants.ts`; import the eight builders from `OrcishBuildingKit.ts`; replace current orcish table entries that reuse `buildOrcishVilla`; add `watchtower` (and `tower` only if the canonical showcase needs it as an alias to watchtower).
- [ ] **Verification:** `npx vitest run tests/world/FactionBuildingVariants.test.ts`.

### Task 20: Generalise Settlement Lab showcase for all eight orcish kinds

**Goal:** Make “Play in 3D” show the full orcish roster together.

- [ ] **Failing test:** Update `tests/scene/SettlementLabScene.test.ts`; for `faction='orcish'`, `type='city'`, assert rendered building records include all canonical kinds: `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, `watchtower`; assert readout says `POC override: showcase`.
- [ ] **Implementation outline:** Modify `src/scene/SettlementLabScene.ts`; add reusable `SHOWCASE_BUILDING_KIND_ROSTER` and helper `(building,index)=>roster[index % roster.length]`; keep elven behavior compatible; add `orcish` entry.
- [ ] **Verification:** `npx vitest run tests/scene/SettlementLabScene.test.ts -t "showcase"`.

### Task 21: Delete superseded orcish builders as dead code

**Goal:** Remove the old BlockKit hut implementation once no runtime path uses it.

- [ ] **Failing test:** Update `tests/world/FactionBlockProfiles.test.ts` and `tests/world/FactionBuildingVariants.test.ts` to stop expecting `buildOrcishHutGrid()`; add a regression assertion that no `FACTION_BUILDING_VARIANTS.orcish` builder name/signature comes from the old villa/chapel/shop functions.
- [ ] **Implementation outline:** In `FactionBuildingVariants.ts`, delete `addBlockOrcishHut`, `buildOrcishVilla`, `buildOrcishChapel`, `buildOrcishShop`, and unused imports (`buildOrcishHutGrid`, `orcishWallTopY`, `OrcishHutOptions`) after confirming no non-test runtime references remain. If `buildOrcishHutGrid()` is otherwise unused, delete it from `FactionBlockProfiles.ts` and update exports/tests.
- [ ] **Verification:** `npx vitest run tests/world/FactionBlockProfiles.test.ts tests/world/FactionBuildingVariants.test.ts tests/world/buildings/OrcishBuildingKit.test.ts`.

### Task 22: Full regression

**Goal:** Confirm no new automated regressions beyond known baseline.

- [ ] **Failing test:** None; verification task.
- [ ] **Implementation outline:** Run full tests and typecheck from the implementation branch; compare against baseline.
- [ ] **Verification:** `npx vitest run` should show no new failures beyond the known ~13; `npx tsc --noEmit` should show no new errors beyond 144.

### Task 23: Live Playwright verification with screenshot

**Goal:** Visually verify all eight orcish kinds in the live Settlement Lab.

- [ ] **Failing test:** Create or update an ad-hoc Playwright verification spec under `tests/e2e/orcish-buildings-showcase.spec.ts`; assert page opens the Settlement Lab with `sl_faction=orcish`, captures a screenshot, and logs/labels all eight building kinds.
- [ ] **Implementation outline:** Start Vite from this worktree on a non-stale unused port; navigate to a city seed with the orcish showcase override; capture screenshot to `test-results/orcish-buildings-showcase.png`; inspect for ribbed hides, lashings, no voxel hut bodies, blacksmith chimney, shrine, and watchtower. Remove throwaway spec before commit if it is not intended to remain.
- [ ] **Verification:** `npx playwright test tests/e2e/orcish-buildings-showcase.spec.ts --project=chromium` plus manual screenshot review.

### Task 24: Update TODO documentation

**Goal:** Record the orcish plan/implementation result in project tracking docs.

- [ ] **Failing test:** None; documentation task.
- [ ] **Implementation outline:** Update `TODO/organic_world_tiles_todo.md` with the orcish race round, shared-kit modules consumed/added, visual verification notes, and thin-reference warning. Update `TODO/TODO_OVERVIEW.md` G16/status line to include orcish progress.
- [ ] **Verification:** `rg -n "orcish|LashedTimber|thin reference" TODO/organic_world_tiles_todo.md TODO/TODO_OVERVIEW.md`.

### Task 25: Commit

**Goal:** Persist the approved implementation after verification and docs.

- [ ] **Failing test:** None; source-control task.
- [ ] **Implementation outline:** Review changed files, ensure no throwaway Playwright spec/screenshots are staged unless intentionally permanent, then commit with the required trailer.
- [ ] **Verification:** Use the parent’s normal source-control workflow. Commit message should summarize the orcish building-kit rebuild and include:

```text
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```
