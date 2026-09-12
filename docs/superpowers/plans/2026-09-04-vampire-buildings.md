# Vampire Buildings — Implementation Plan

**Status:** Draft — awaiting user approval before implementation.

Estimated task count: **29 tasks** — Tasks 1–11 are `[SHARED KIT]` or shared-kit extensions that may already be implemented by earlier race branches and should be deduped by the parent; Tasks 12–22 are vampire-specific builders/tests; Tasks 23–29 are mandatory wiring, showcase, cleanup, regression, live verification, TODO updates, and commit.

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` if subagents are available, otherwise use `superpowers:executing-plans`. Follow TDD: write the failing test first, confirm it fails, implement the smallest change, then run the targeted verification.

**Goal:** Replace vampire's current reused BlockKit spire/stall implementations with a complete 8-kind private-aristocratic manor/townhouse building kit: shuttered, vertical, immaculate, roof-rich, and visibly distinct from undead funerary decay.

**Architecture:** Build/consume shared facade, opening, roof, massing, shutter, and oriel modules first. Then implement vampire-specific material palettes, facade module weights, roof presets, and one public builder per canonical kind. The final integration wires runtime faction `vampire` into `FACTION_BUILDING_VARIANTS` and Settlement Lab's all-kinds showcase.

**Tech Stack:** TypeScript, Three.js r170 APIs, existing `StoneTower*` building helpers, Vitest, Playwright for live visual verification. No new runtime dependency unless the already-approved `straight-skeleton` roof module is missing and required by the shared `RoofMassing` implementation.

## Global constraints and baselines

- Runtime faction: studio id `vampire` maps to runtime `vampire` via `mapStudioFactionToRuntimeFaction()`.
- Canonical roster: `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, `watchtower`.
- Baselines to state in final verification: `npx tsc --noEmit` has **144 pre-existing errors**; `npx vitest run` has **~13 failures / 3272 passing** pre-existing. Only new failures beyond those count as regressions.
- Do not implement visible surfaces with voxel blobs, dark boxes for openings, smooth cone roofs, or flat two-plane roofs.
- If a `[SHARED KIT]` task has already landed from an earlier race, do not duplicate it. Extend tests only where vampire needs additional assertions.
- Keep material objects shared/merge-safe; use vertex/instance color for variation, not cloned material objects.

---

### Task 1: [SHARED KIT] Depth ladder and bevel constants

**Goal:** Make facade depth offsets and bevel settings explicit and testable.

**Failing test to write first:** `tests/world/buildings/kit/DepthLadder.test.ts` asserts exported offsets match the doctrine (`buttress +0.30`, `pilaster +0.12`, `stringCourse +0.08`, `frame +0.04`, `wall 0`, `panelRecess -0.06`, `reveal -0.12`, `glazing -0.20`) and `assertDistinctDepths()` throws when two surfaces differ by `<0.005`.

**Implementation outline:** Create/extend `src/world/buildings/kit/DepthLadder.ts` and `src/world/buildings/kit/Bevels.ts`. Export constants and common bevel presets for trim, frames, sills, shutter slats, and ironwork. If these files already exist, add vampire-required names without changing existing values.

**Verification command:** `npx vitest run tests/world/buildings/kit/DepthLadder.test.ts`

---

### Task 2: [SHARED KIT] Gothic arch geometry

**Goal:** Replace straight-line pointed arches with parameterised two-centred Gothic arches.

**Failing test to write first:** `tests/world/buildings/kit/GothicArch.test.ts` asserts `buildGothicArchShape({ width: 1, springHeight: 1.2, archRatio: 1.6 })` produces a centred apex, finite points, and a taller/narrower lancet than `archRatio: 1.0`.

**Implementation outline:** Create/extend `src/world/buildings/kit/GothicArch.ts`; adapt existing `StoneTowerOpenings.buildArchShape()` callers through a compatibility path or migrate them to the new function. Keep `archRatio` per-race configurable: vampire default `1.4–1.7`.

**Verification command:** `npx vitest run tests/world/buildings/kit/GothicArch.test.ts tests/world/buildings/StoneTowerOpenings.test.ts`

---

### Task 3: [SHARED KIT] Five-piece opening parts

**Goal:** Ensure every window and door has recess, proud surround, sill/threshold, internal division, and set-back glass/door face.

**Failing test to write first:** `tests/world/buildings/kit/OpeningParts.test.ts` builds a closed vampire lancet and asserts distinct meshes/material roles exist for `reveal`, `surround`, `sill`, `mullion`/`transom`, and `glazing`, with z-depths matching `DepthLadder`.

**Implementation outline:** Create/extend `src/world/buildings/kit/OpeningParts.ts`; export `buildWindowOpening()`, `buildDoorLeaf()`, `buildThreshold()`, `buildMullions()`, `buildSetBackGlass()`, `buildStrapIronwork()`. Migrate `StoneTowerWindows.ts`/`StoneTowerEntrance.ts` or add adapters so old users gain the missing sill/mullion/glazing pieces.

**Verification command:** `npx vitest run tests/world/buildings/kit/OpeningParts.test.ts tests/world/buildings/StoneTowerWindows.test.ts tests/world/buildings/StoneTowerEntrance.test.ts`

---

### Task 4: [SHARED KIT] Voussoir arches

**Goal:** Build arch heads from wedge blocks and keystones that match block-course walls.

**Failing test to write first:** `tests/world/buildings/kit/VoussoirArch.test.ts` asserts a vampire door arch emits 7–15 voussoir blocks per side, one proud keystone, no NaN vertices, and a shared material reference across all stone blocks.

**Implementation outline:** Create/extend `src/world/buildings/kit/VoussoirArch.ts`; use `GothicArch` sampling to place wedge/block voussoirs along the curve. Include jitter knobs but keep material identity shared.

**Verification command:** `npx vitest run tests/world/buildings/kit/VoussoirArch.test.ts`

---

### Task 5: [SHARED KIT] String courses, plinths, and cornices

**Goal:** Provide continuous horizontal bands that break tall vampire facades into readable storeys.

**Failing test to write first:** `tests/world/buildings/kit/StringCourse.test.ts` builds courses around `rectanglePoints(2, 3)` and asserts there is a plinth at ground, storey course at configured y, cornice projection `>=0.12`, finite geometry, and no missing UV attribute.

**Implementation outline:** Create/extend `src/world/buildings/kit/StringCourse.ts`; support closed footprints, weathered/chamfered top profiles, corbel spacing, and eaves-table variants. Consume existing `rectanglePoints`/`octagonPoints` helpers.

**Verification command:** `npx vitest run tests/world/buildings/kit/StringCourse.test.ts tests/world/buildings/StoneTowerFloorCap.test.ts`

---

### Task 6: [SHARED KIT] Facade split grammar

**Goal:** Divide facades into fixed-size bays plus floating filler so mouldings never scale with building width.

**Failing test to write first:** `tests/world/buildings/kit/FacadeGrammar.test.ts` asserts a 7.3 WU facade with fixed door/window bay widths preserves exact module widths and assigns leftover to filler; repeat choices are deterministic for the same seed.

**Implementation outline:** Create/extend `src/world/buildings/kit/FacadeGrammar.ts`; implement absolute, relative, repeat, and floating segments. Return bay placements with face, t-range, centre, width, and module id.

**Verification command:** `npx vitest run tests/world/buildings/kit/FacadeGrammar.test.ts`

---

### Task 7: [SHARED KIT] Shingle roof surfaces and roof massing

**Goal:** Support vampire gable, hip, mansard, dormer, and turret roofs with real tile courses.

**Failing test to write first:** `tests/world/buildings/kit/RoofMassing.test.ts` asserts `buildMansardRoof()` produces two slopes per side, eaves overhang `0.3–0.6 WU`, dormer anchors, finite vertices, and uses `ShingleSurface` at LOD0 rather than a single plane/cone.

**Implementation outline:** Create/extend `src/world/buildings/kit/ShingleSurface.ts` and `src/world/buildings/kit/RoofMassing.ts`; include gable, hip, mansard, dormer, turret cap, ridge/hip/verge/eave trim. Use `straight-skeleton` only if it is already approved/needed for arbitrary footprints; rectangular fallback must work without it.

**Verification command:** `npx vitest run tests/world/buildings/kit/ShingleSurface.test.ts tests/world/buildings/kit/RoofMassing.test.ts tests/world/buildings/StoneTowerGableRoof.test.ts tests/world/buildings/StoneTowerRoofCap.test.ts`

---

### Task 8: [SHARED KIT] Mass composer

**Goal:** Compose main blocks, wings, porches, turrets, oriels, dormers, and chimneys without bespoke per-kind geometry duplication.

**Failing test to write first:** `tests/world/buildings/kit/MassComposer.test.ts` asserts a seeded villa recipe places non-overlapping main block, side turret, porch, and chimney masses inside/around the `7 × 5 WU` footprint and produces deterministic transforms.

**Implementation outline:** Create/extend `src/world/buildings/kit/MassComposer.ts`; define mass descriptors, sockets, collision/overlap checks, and transform outputs consumed by facade/roof builders.

**Verification command:** `npx vitest run tests/world/buildings/kit/MassComposer.test.ts`

---

### Task 9: [SHARED KIT] Tracery plates

**Goal:** Provide rose/lancet tracery for vampire chapel and high-status manor windows.

**Failing test to write first:** `tests/world/buildings/kit/Tracery.test.ts` builds a quatrefoil rose and a lancet plate, asserts `Shape.holes` are present, geometry is finite, and the glass plane remains set back behind stone tracery.

**Implementation outline:** Create/extend `src/world/buildings/kit/Tracery.ts`; implement rose, lancet, trefoil/quatrefoil formulas, bevel presets, and glass backing integration with `OpeningParts`.

**Verification command:** `npx vitest run tests/world/buildings/kit/Tracery.test.ts`

---

### Task 10: [SHARED KIT] Shutter module

**Goal:** Add louvred shutters as the vampire signature closed-window module reusable by human and vulperia.

**Failing test to write first:** `tests/world/buildings/kit/Shutter.test.ts` builds `buildShutter({ width: 0.32, height: 1.2, state: 'closed_louvred' })` and asserts it contains a leaf, at least 5 slat meshes, 2 hinge straps, a holdback, finite vertices, and distinct depth offsets for leaf/slats/hinge.

**Implementation outline:** Create `src/world/buildings/kit/Shutter.ts`; export `buildShutterLeaf()`, `buildShutterPair()`, and state options `closed`, `oneAjar`, `foldedOpen`, `boardedInPlace`. Use real slat boxes or batched slats; no texture-only louvres.

**Verification command:** `npx vitest run tests/world/buildings/kit/Shutter.test.ts`

---

### Task 11: [SHARED KIT] Oriel bay module

**Goal:** Add projecting glazed bays on corbels, the second vampire signature silhouette module.

**Failing test to write first:** `tests/world/buildings/kit/OrielBay.test.ts` builds an upper-floor `OrielBay` and asserts projection `>=0.45 WU`, at least two corbels, three five-piece window faces, a floor/roof cap, and no coplanar glazing/frame surfaces.

**Implementation outline:** Create `src/world/buildings/kit/OrielBay.ts`; compose a shallow faceted bay shell, corbel brackets, sill/cornice, optional tiny roof, and window faces using `OpeningParts`/`Shutter`/`Tracery`. Keep generic parameters so human/vulperia can reuse it.

**Verification command:** `npx vitest run tests/world/buildings/kit/OrielBay.test.ts`

---

### Task 12: Vampire material palette

**Goal:** Centralise merge-safe vampire materials and roof/glass/iron variants.

**Failing test to write first:** `tests/world/buildings/VampireMaterials.test.ts` asserts `createVampireMaterials()` returns stable material object identities for repeated calls within one palette, includes `ashlar`, `limewash`, `blackBrick`, `roofTile`, `iron`, `darkWood`, `amberGlass`, and `bloodGlass`, and does not clone materials per module.

**Implementation outline:** Create `src/world/buildings/VampireMaterials.ts`. Reuse `obsidianTexture()` where useful, add/refine canvas textures only if needed, and expose a `VampireMaterials` interface consumed by all vampire builders.

**Verification command:** `npx vitest run tests/world/buildings/VampireMaterials.test.ts tests/world/FactionBlockTextures.test.ts`

---

### Task 13: Vampire facade library

**Goal:** Define vampire-specific facade modules and weights for doors, lancets, grilles, shutters, signs, and special bays.

**Failing test to write first:** `tests/world/buildings/VampireFacadeKit.test.ts` asserts a seeded `buildVampireFacade()` for a 4 WU house front includes one off-centre door, at least one shuttered window, one special bay candidate, all openings satisfy five-piece roles, and no side windows are emitted on `terrace: 'both'` party walls.

**Implementation outline:** Create `src/world/buildings/VampireFacadeKit.ts`; wrap `FacadeGrammar`, `OpeningParts`, `Shutter`, `OrielBay`, `StringCourse`, and iron grille/sign helpers. Add per-kind facade recipe configs.

**Verification command:** `npx vitest run tests/world/buildings/VampireFacadeKit.test.ts`

---

### Task 14: Vampire roof and silhouette library

**Goal:** Define vampire roof presets, dormer/chimney/finial/cresting placement, and silhouette weights.

**Failing test to write first:** `tests/world/buildings/VampireRoofKit.test.ts` asserts each roof preset has tile-course geometry, eave thickness, ridge/verge trim, at least one silhouette breaker, and deterministic output for identical seeds.

**Implementation outline:** Create `src/world/buildings/VampireRoofKit.ts`; expose `buildVampireRoof(kind, footprint, seed, materials, roofConfig)` and helpers for mansard, steep gable, hip, turret cap, dormers, chimneys, bat vane, and cresting. Consume `RoofMassing`/`ShingleSurface`.

**Verification command:** `npx vitest run tests/world/buildings/VampireRoofKit.test.ts tests/world/buildings/kit/RoofMassing.test.ts`

---

### Task 15: Vampire `house` and `terraced` builders

**Goal:** Implement residential small/townhouse forms with real differentiation.

**Failing test to write first:** `tests/world/buildings/VampireBuildings.test.ts` adds cases asserting `buildVampireHouse()` fits `4 × 3 WU`, has 2 floors, shutters, plinth, steep roof, and asymmetry; `buildVampireTerraced()` fits `3 × 4 WU`, has 3 stacked floors, no side windows on party walls, and a mansard/dormer or varied cornice.

**Implementation outline:** Create `src/world/buildings/VampireBuildings.ts`; implement `buildVampireHouse(dna)` and `buildVampireTerraced(dna)` using `MassComposer`, `VampireFacadeKit`, and `VampireRoofKit`. Export them but do not wire registry yet.

**Verification command:** `npx vitest run tests/world/buildings/VampireBuildings.test.ts --testNamePattern "house|terraced"`

---

### Task 16: Vampire `villa` builder

**Goal:** Implement the flagship Count's manor with manor massing, oriel/balcony, mansard roof, and gated forecourt.

**Failing test to write first:** `tests/world/buildings/VampireBuildings.test.ts` adds a villa case asserting footprint near `7 × 5 WU`, 3 floors, at least 8 five-piece openings, one `OrielBay` or iron balcony, 3+ chimney/finial silhouette props, and no `buildVampireSpireGrid` dependency.

**Implementation outline:** Extend `VampireBuildings.ts` with `buildVampireVilla(dna)`; use `MassComposer` main block + side turret/cross wing; add gated forecourt props; select variation weights from the spec.

**Verification command:** `npx vitest run tests/world/buildings/VampireBuildings.test.ts --testNamePattern "villa"`

---

### Task 17: Vampire `inn` builder

**Goal:** Implement the Nocturne boarding house/guest house distinct from villa.

**Failing test to write first:** `tests/world/buildings/VampireBuildings.test.ts` adds an inn case asserting footprint near `7 × 5 WU`, carriage arch or raised porch, wider social facade than house, upper guest-room shutters, hanging crest sign, and service-yard/coach-lamp prop.

**Implementation outline:** Extend `VampireBuildings.ts` with `buildVampireInn(dna)`; use a wider front recipe, carriage arch module, common-room grilles, guest windows, optional mews lean-to, and roof presets from the inn table.

**Verification command:** `npx vitest run tests/world/buildings/VampireBuildings.test.ts --testNamePattern "inn"`

---

### Task 18: Vampire `shop` builder

**Goal:** Implement locked vampire commerce as an atelier/apothecary/jeweller, not a generic stall.

**Failing test to write first:** `tests/world/buildings/VampireBuildings.test.ts` adds a shop case asserting ground display bay has frame+sill+mullion+set-back glass+iron grille+shutters, an upper residence window/oriel, a readable hanging sign, and no unsupported flat canopy.

**Implementation outline:** Extend `VampireBuildings.ts` with `buildVampireShop(dna)`; use trade-type weights, facade grammar, sign bracket geometry, and optional iron-supported awning/hood.

**Verification command:** `npx vitest run tests/world/buildings/VampireBuildings.test.ts --testNamePattern "shop"`

---

### Task 19: Vampire `blacksmith` builder

**Goal:** Implement a nocturnal ironworks/locksmith forge with secure yard and massive chimney.

**Failing test to write first:** `tests/world/buildings/VampireBuildings.test.ts` adds a blacksmith case asserting footprint near `5 × 4 WU`, wide arched forge/carriage door, louvred vents, large chimney/roof vent, iron fence/sample props, ember glow behind grille, and no fallback to villa massing.

**Implementation outline:** Extend `VampireBuildings.ts` with `buildVampireBlacksmith(dna)`; use dark brick/ashlar lower hall, forge door, ventilation shutters, chimney breast, yard fence, and trade props.

**Verification command:** `npx vitest run tests/world/buildings/VampireBuildings.test.ts --testNamePattern "blacksmith"`

---

### Task 20: Vampire `chapel` builder

**Goal:** Implement a private blood chantry that is maintained and aristocratic, not an undead cemetery.

**Failing test to write first:** `tests/world/buildings/VampireBuildings.test.ts` adds a chapel case asserting fixed `4 × 8 WU` nave, tall side lancets, front rose/tracery or lancet pair, buttresses, bellcote/turret roof detail, no crumbled walls, and at most a tiny fenced private-marker accent.

**Implementation outline:** Extend `VampireBuildings.ts` with `buildVampireChapel(dna)`; use rectangle nave faces, `Buttress`, `Tracery`, gable/mansard chapel roof, iron gate, and restrained altar/glass glow.

**Verification command:** `npx vitest run tests/world/buildings/VampireBuildings.test.ts --testNamePattern "chapel"`

---

### Task 21: Vampire `watchtower` builder

**Goal:** Implement a narrow needle watchtower instead of generic fallback.

**Failing test to write first:** `tests/world/buildings/VampireBuildings.test.ts` adds a watchtower case asserting fixed `2 × 2 WU` footprint, 4–5 floors, tapered real block-course shaft, slit/shutter/grille openings, steep shingled turret roof, finial/cresting, and no smooth cone or BlockKit spire grid.

**Implementation outline:** Extend `VampireBuildings.ts` with `buildVampireWatchtower(dna)`; use octagon or clipped-square faces, `StringCourse`, `OpeningParts`, `Shutter`, and `VampireRoofKit` turret cap.

**Verification command:** `npx vitest run tests/world/buildings/VampireBuildings.test.ts --testNamePattern "watchtower"`

---

### Task 22: Vampire roster determinism, variation, and quality sweep

**Goal:** Guard all 8 builders as a coherent faction kit.

**Failing test to write first:** `tests/world/buildings/VampireBuildings.test.ts` adds a full-roster describe block asserting all 8 exported builders produce finite geometry for seeds `[1, 7, 42, 99]`, repeated same seed has stable mesh/role counts, different seeds change at least one variation count, every kind has a plinth and silhouette breaker, and no geometry type matches banned large placeholder primitives for windows/doors/roofs.

**Implementation outline:** Add test helpers to count named roles (`vampire-opening-*`, `vampire-shutter-*`, `vampire-roof-tile`, `vampire-plinth`, `vampire-silhouette-*`). Add names to meshes/groups in builders where tests need stable semantic assertions.

**Verification command:** `npx vitest run tests/world/buildings/VampireBuildings.test.ts`

---

### Task 23: Wire vampire builders into `FACTION_BUILDING_VARIANTS`

**Goal:** Dispatch all canonical vampire kinds through the new kit.

**Failing test to write first:** Update `tests/world/FactionBuildingVariants.test.ts` so `covered` includes all 8 vampire kinds and assertions confirm `getFactionBuildingVariant('vampire', kind)` is non-null for `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, and `watchtower`; add a regression asserting `inn` and `blacksmith` mesh/role signatures differ from `villa`.

**Implementation outline:** Modify `src/world/buildings/FactionBuildingVariants.ts`: import new vampire builders from `VampireBuildings.ts`; map each of the 8 kinds explicitly; remove temporary reuse of `buildVampireVilla` for house/terraced/inn/blacksmith; add `watchtower` entry. Keep `tower` optional only if the public builder is footprint-dynamic and tests cover it.

**Verification command:** `npx vitest run tests/world/FactionBuildingVariants.test.ts tests/world/buildings/VampireBuildings.test.ts`

---

### Task 24: Generalise Settlement Lab showcase so all 8 vampire kinds render together

**Goal:** Make “Play in 3D” on the Settlement tab show the whole vampire roster, including watchtower.

**Failing test to write first:** Create/update `tests/scene/SettlementLabShowcase.test.ts` to assert `makeRosterShowcaseOverride(['house','terraced','villa','inn','shop','blacksmith','chapel','watchtower'])` returns each kind for indexes 0–7, cycles or falls through deterministically afterward, and `POC_KIND_OVERRIDE_BY_FACTION.vampire` uses the full roster rather than a single-kind override.

**Implementation outline:** Refactor `src/scene/SettlementLabScene.ts` to export/test a small pure helper such as `makeRosterShowcaseOverride(kinds)`. Set `vampire` to the full 8-kind roster. Consider migrating `elven` to the same helper if it is already complete; do not regress existing elven behavior.

**Verification command:** `npx vitest run tests/scene/SettlementLabShowcase.test.ts tests/world/FactionBuildingVariants.test.ts`

---

### Task 25: Delete superseded vampire builders as dead code

**Goal:** Remove the old BlockKit spire/stall code after new registry wiring is green.

**Failing test/check to write first:** Update `tests/world/FactionBuildingVariants.test.ts` to remove old vampire spire-grid expectations and add a negative assertion that no vampire roster builder emits the old `bloodglow` block-grid role. Run `rg "buildVampireSpireGrid|addBlockVampireSpire|vampireSpireTopY|vampireSpireDeckRadius" src tests` and confirm only intentional removal targets remain before deleting.

**Implementation outline:** Delete inline old vampire helpers from `FactionBuildingVariants.ts`; delete `VampireSpireOptions`, `buildVampireSpireGrid`, `vampireSpireTopY`, and `vampireSpireDeckRadius` from `FactionBlockProfiles.ts` if `rg` proves no remaining references. Keep `obsidianTexture()` if `VampireMaterials.ts` still uses it.

**Verification command:** `npx vitest run tests/world/FactionBuildingVariants.test.ts tests/world/buildings/VampireBuildings.test.ts tests/world/FactionBlockProfiles.test.ts`

---

### Task 26: Full regression

**Goal:** Verify no new test/type regressions beyond known baselines.

**Failing test/check to write first:** No new test file; this is the required suite check. Record the pre-existing baseline lines and compare failures/errors to the known values.

**Implementation outline:** Run full Vitest and TypeScript checks. Investigate and fix any new vampire-related failure; do not attempt to fix unrelated pre-existing failures unless directly caused by this work.

**Verification command:** `npx vitest run` then `npx tsc --noEmit` — expected no new failures beyond **~13 vitest failures / 3272 passing** and **144 tsc errors** baseline.

---

### Task 27: Live Playwright verification with screenshot

**Goal:** Visually confirm the vampire kit in the real Settlement Lab, not just unit tests.

**Failing test to write first:** Create/update `tests/e2e/vampire-building-showcase.spec.ts` to launch a session-worktree dev server on a non-5173 port, open Settlement Lab with faction `vampire`, assert the readout says showcase/all vampire kits, and save a screenshot artifact such as `test-results/vampire-building-showcase.png`.

**Implementation outline:** Ensure the Playwright spec starts/uses the correct Vite server from this worktree, not a stale server from another checkout. In the screenshot, manually inspect that all 8 kinds are visible together: house, terraced, villa, inn, shop, blacksmith, chapel, watchtower; check especially shutters/louvres, oriels, mansards, chimneys, iron gates, and undead differentiation.

**Verification command:** `npx playwright test tests/e2e/vampire-building-showcase.spec.ts --project=chromium`

---

### Task 28: Update TODO tracking docs

**Goal:** Record vampire completion and any cross-race follow-ups.

**Failing test/check to write first:** Use `rg "vampire|building" TODO/organic_world_tiles_todo.md TODO/TODO_OVERVIEW.md` to find the existing sections; before editing, confirm they do not already state the new vampire kit is complete.

**Implementation outline:** Update `TODO/organic_world_tiles_todo.md` and `TODO/TODO_OVERVIEW.md` with vampire spec/implementation status, shared kit modules added (`Shutter`, `OrielBay`, any shared roof/opening modules), the GIF visibility gap if still unresolved, and remaining cross-race watchtower reachability caveat.

**Verification command:** `rg "Vampire|vampire|Shutter|OrielBay" TODO/organic_world_tiles_todo.md TODO/TODO_OVERVIEW.md`

---

### Task 29: Commit

**Goal:** Persist the complete vampire building kit implementation.

**Failing test/check to write first:** Run `git status --short` and verify only intended source, test, e2e, and TODO files are changed.

**Implementation outline:** Stage all intended files and commit with a message summarising the new vampire 8-kind kit and shared modules. Include the required trailer.

**Verification command:**

```bash
git add src/world/buildings src/scene/SettlementLabScene.ts tests/world tests/scene tests/e2e TODO/organic_world_tiles_todo.md TODO/TODO_OVERVIEW.md
git commit -m "feat: add vampire aristocratic building kit" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
