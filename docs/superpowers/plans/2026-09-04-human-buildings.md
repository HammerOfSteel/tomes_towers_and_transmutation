# Human Buildings — Implementation Plan

**Status:** Draft — awaiting user approval before implementation.

> **For agentic workers:** REQUIRED: implement with TDD. If subagents are available, use the project's plan-execution workflow; otherwise execute task-by-task in one session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the human baseline settlement kit for runtime faction `human_town`, covering `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, and `watchtower` with modular medieval vernacular construction.

**Architecture:** Human runs third after elven and dwarven, so consume Tier 1 and existing Tier 2 doctrine kit instead of rebuilding it. The flagship new shared module is `TimberFrame`; add a small shared thatch roof profile only if the previous races did not already implement one. Human-specific composition then layers `FacadeGrammar`, fixed-size modules, `TimberFrame` panel swapping, roof material swapping, jetties, and `MassComposer` wings/porches/dormers.

**Tech Stack:** TypeScript, Three.js, Vitest, existing Playwright visual verification. No new runtime dependencies unless the already-approved shared `RoofMassing` implementation requires one.

**Estimated task count:** 21 implementation tasks. Shared-kit tasks: 2-3 (`TimberFrame`, optional thatch profile, and any missing shared roof assertion support). Race-specific tasks: 11-12 (materials, jetty, props, eight kind builders, seed/quality tests). Final wiring/verification/documentation/commit tasks: 7.

**Baseline expectations to record during implementation:** `npx tsc --noEmit` currently reports 144 pre-existing errors; `npx vitest run` currently reports about 13 failures / 3272 passing. Only new failures beyond those baselines count as regressions.

---

## File map

- Create: `src/world/buildings/kit/TimberFrame.ts` — `[SHARED KIT]` proud structural frame generator for posts, rails, studs, braces, decorative patterns, and recessed infill sockets.
- Create or extend: `src/world/buildings/kit/ThatchRoofSurface.ts` or `src/world/buildings/kit/ShingleSurface.ts` — `[SHARED KIT]` thatch profile if missing.
- Create: `src/world/buildings/HumanBuildingMaterials.ts` — shared human materials/palette helpers that preserve material identity for merge bucketing.
- Create: `src/world/buildings/HumanJetty.ts` — bressummer beam, exposed joist ends, corbels, braces, underside board.
- Create: `src/world/buildings/HumanBuildingProps.ts` — sign brackets, barrels, crates, lanterns, flower boxes, tool racks, wood piles, grave markers, all composed from readable pieces.
- Create: `src/world/buildings/HumanBuildingsKit.ts` — top-level kind builders: `buildHumanHouse`, `buildHumanTerraced`, `buildHumanVilla`, `buildHumanInn`, `buildHumanShop`, `buildHumanBlacksmith`, `buildHumanChapel`, `buildHumanWatchtower`.
- Modify: `src/world/buildings/FactionBuildingVariants.ts` — add `human_town` dispatch for all 8 kinds; optionally map `human_rural`/`human_noble` to same builders with different presets if product decision allows.
- Modify: `src/scene/SettlementLabScene.ts` and related tests — generalise showcase so all 8 kinds of the selected race render together in Play in 3D.
- Modify: `src/world/buildings/BuildingBuilder.ts` — delete superseded human-only/generic dead helpers only after variant wiring proves no callers need them.
- Test: `tests/world/buildings/kit/TimberFrame.test.ts`, roof-surface tests if needed, `tests/world/buildings/HumanBuildingsKit.test.ts`, `tests/world/buildings/FactionBuildingVariants.test.ts`, Settlement Lab showcase tests.
- Docs: `TODO/organic_world_tiles_todo.md`, `TODO/TODO_OVERVIEW.md` in the final documentation task.

---

### Task 1: [SHARED KIT] TimberFrame structural wall panels

**Goal:** Add a reusable half-timbered facade module whose frame is proud of recessed infill and whose frame lines come from the split grid.

**Files:**
- Create: `src/world/buildings/kit/TimberFrame.ts`
- Test: `tests/world/buildings/kit/TimberFrame.test.ts`

- [ ] **Step 1: Write the failing test**

Test path: `tests/world/buildings/kit/TimberFrame.test.ts`.

Assert that `buildTimberFramePanel({ width: 2, height: 3.2, pattern: 'stAndrewsCross', seed })`:
- returns a `THREE.Group` with named children for `post`, `rail`, `brace`, and `infill`;
- places frame pieces at depth `+0.08 WU` and infill at `0.00` or `-0.04 WU`;
- emits two vertical posts, at least three rails, and two crossing braces for `stAndrewsCross`;
- respects maximum post spacing `2.4 WU` and infill span `0.75 WU`;
- emits non-flat decorative geometry for `quatrefoil` and alternating braces for `herringbone`;
- never places braces through a supplied opening exclusion rectangle;
- is deterministic for the same seed.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/world/buildings/kit/TimberFrame.test.ts`

Expected: FAIL because `TimberFrame.ts` does not exist.

- [ ] **Step 3: Implement the minimal module**

Implement exports:
- `type TimberFramePattern = 'simpleBrace' | 'stAndrewsCross' | 'herringbone' | 'quatrefoil' | 'brickNogging' | 'repairPanel'`;
- `buildTimberFramePanel(opts): THREE.Group`;
- `buildTimberFrameFacade(opts): THREE.Group` that accepts bay splits from `FacadeGrammar` or plain bay descriptors.

Rules:
- posts `0.16-0.22 WU`; maximum post spacing `2.4 WU`; rails at `0.18`, `1.05`, `2.15`, `height - 0.08`;
- studs when open span exceeds `0.75 WU`;
- brace angle `35-55°`;
- timber depth `+0.08`, infill `0.00/-0.04`;
- decorative patterns include St Andrew's cross, herringbone, brick-nogging, repair panels, and a raised/pierced quatrefoil panel;
- use shared materials passed in, never clone for colour variation.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/world/buildings/kit/TimberFrame.test.ts`

Expected: PASS.

---

### Task 2: [SHARED KIT] Thatch roof profile if missing

**Goal:** Ensure human rural houses can use non-smooth thatch with thick eaves, ridge cap, visible verge depth, and straw wisps.

**Files:**
- Create or modify: `src/world/buildings/kit/ThatchRoofSurface.ts` or `src/world/buildings/kit/ShingleSurface.ts`
- Test: `tests/world/buildings/kit/ThatchRoofSurface.test.ts` or extend `tests/world/buildings/kit/ShingleSurface.test.ts`

- [ ] **Step 1: Write or extend the roof test first**

Test path: `tests/world/buildings/kit/ThatchRoofSurface.test.ts` or the existing `tests/world/buildings/kit/ShingleSurface.test.ts` if `ShingleSurface` already owns roof materials.

Assert that a `4 × 3 WU` gable thatch surface has:
- 4-6 stacked scalloped bands per pitch;
- a rolled eave piece thicker than `0.15 WU`;
- a ridge cap with pegged spars;
- at least 40 instanced straw/wisp quads;
- visible verge pieces on both gables;
- no single smooth roof plane standing in for thatch.

If an existing shared `ShingleSurface` thatch mode already satisfies this exact test, keep that test and mark this task as consumed rather than duplicating the module.

- [ ] **Step 2: Run the test and confirm the status**

Run the smallest matching test file.

Expected: FAIL if thatch support is missing; PASS means the shared kit already exists and implementation can skip to Task 3.

- [ ] **Step 3: Implement or extend the roof kit if the test failed**

Use the research §3.2 approach: bands instead of a smooth plane, jittered wisps, ridge cap, eave roll, and verge depth. Keep materials shared; use `BatchedDetail` if already available.

- [ ] **Step 4: Verify**

Run the same targeted roof test.

Expected: PASS.

---

### Task 3: Human material palette and module weights

**Goal:** Centralise human materials and weighted grammar choices so all kinds share a coherent baseline palette without cloning materials per mesh.

**Files:**
- Create: `src/world/buildings/HumanBuildingMaterials.ts`
- Test: `tests/world/buildings/HumanBuildingMaterials.test.ts`

- [ ] **Step 1: Write the failing test**

Assert that `createHumanBuildingMaterials('human_town')` returns stable material identities for plaster, timber, stone, clayTile, slate, thatch, iron, glass, and door; repeated calls through a per-building material cache reuse identities; colour choices match the spec palette.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/world/buildings/HumanBuildingMaterials.test.ts`

Expected: FAIL because file/export is missing.

- [ ] **Step 3: Implement materials and weights**

Add palette constants and variation-weight helpers for roof material, wall system, frame pattern, and prop sets. Do not create random material clones for per-instance variation; use instance colors or named tint inputs where the shared kit supports them.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/world/buildings/HumanBuildingMaterials.test.ts`

Expected: PASS.

---

### Task 4: HumanJetty silhouette assembly

**Goal:** Build jetties as real construction: bressummer, joist ends, corbels, braces, underside, and shifted upper facade sockets.

**Files:**
- Create: `src/world/buildings/HumanJetty.ts`
- Test: `tests/world/buildings/HumanJetty.test.ts`

- [ ] **Step 1: Write the failing test**

Assert that `buildHumanJetty({ width: 3, projection: 0.35, floorY: 3.2 })`:
- has a bressummer beam at the floor line;
- creates exposed joist ends at `0.28-0.40 WU` spacing;
- includes at least two corbels/knee braces;
- projects upper facade sockets by the requested amount;
- does not create one enlarged upper box as the only jetty geometry.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/world/buildings/HumanJetty.test.ts`

Expected: FAIL because module is missing.

- [ ] **Step 3: Implement**

Compose simple chamfered timber pieces with shared timber material. Return both geometry group and a `facadeOffset` value that race builders use when placing upper-storey walls/openings.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/world/buildings/HumanJetty.test.ts`

Expected: PASS.

---

### Task 5: Human props library

**Goal:** Replace base-geometry stand-ins with readable modular props for human street life.

**Files:**
- Create: `src/world/buildings/HumanBuildingProps.ts`
- Test: `tests/world/buildings/HumanBuildingProps.test.ts`

- [ ] **Step 1: Write the failing test**

Assert that sign, barrel, crate, lantern, tool rack, wood pile, bench, flower box, and grave marker builders use named subparts (staves/hoops, slats, bracket, cage panes, handles) and do not expose lone `SphereGeometry`/plain box as the readable feature.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/world/buildings/HumanBuildingProps.test.ts`

Expected: FAIL because prop builders are missing.

- [ ] **Step 3: Implement**

Create small composed groups using existing material helpers. Keep counts modest and deterministic. Add LOD-safe naming so tests can find the components.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/world/buildings/HumanBuildingProps.test.ts`

Expected: PASS.

---

### Task 6: Human house builder

**Goal:** Implement `house` as a compact varied baseline cottage/town house with timber frame, thick roof, five-piece openings, plinth, chimney, and props.

**Files:**
- Create/modify: `src/world/buildings/HumanBuildingsKit.ts`
- Test: `tests/world/buildings/HumanBuildingsKit.test.ts`

- [ ] **Step 1: Write the failing test**

Assert `buildHumanHouse(factionBuildingDna('house','human_town', seed, 'small', 1))`:
- fits `4 × 3 WU` footprint plus documented eave/porch overhang;
- has a rubble plinth/base skirt;
- contains `TimberFrame` or stone-base wall modules;
- has a thatch/tile/slate constructed roof with ridge and eaves;
- has a five-piece door and at least two five-piece windows;
- includes one asymmetry source and one chimney.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/world/buildings/HumanBuildingsKit.test.ts -t "human house"`

Expected: FAIL because builder is missing.

- [ ] **Step 3: Implement**

Compose `MassComposer` main block, `TimberFrame`, `OpeningParts`, `RoofMassing`/roof surfaces, `StringCourse`, chimney blocks, and props. Use weighted axes from spec §4.1.

- [ ] **Step 4: Verify**

Run the same targeted test.

Expected: PASS.

---

### Task 7: Human terraced builder

**Goal:** Implement `terraced` as a narrow row-house unit with party walls, jettied upper floor, and bay variation.

**Files:**
- Modify: `src/world/buildings/HumanBuildingsKit.ts`
- Test: `tests/world/buildings/HumanBuildingsKit.test.ts`

- [ ] **Step 1: Write the failing test**

Assert `buildHumanTerraced(...)`:
- uses `3 × 4 WU` footprint;
- has no side windows on party walls;
- uses a real `HumanJetty` in at least 70% of deterministic sample seeds;
- creates front facade bay modules and one special bay;
- has five-piece openings and non-smooth roof courses.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/world/buildings/HumanBuildingsKit.test.ts -t "human terraced"`

Expected: FAIL until builder exists.

- [ ] **Step 3: Implement**

Add `buildHumanTerraced`, reusing house wall/roof helpers but different facade grammar: narrow front, party-wall sides, jettied upper, shared chimney options.

- [ ] **Step 4: Verify**

Run the same targeted test.

Expected: PASS.

---

### Task 8: Human villa builder

**Goal:** Implement `villa` as a high-status but still vernacular manor/townhouse with L/T wings, stone ground floor, timber upper, and balconies/porches.

**Files:**
- Modify: `src/world/buildings/HumanBuildingsKit.ts`
- Test: `tests/world/buildings/HumanBuildingsKit.test.ts`

- [ ] **Step 1: Write the failing test**

Assert `buildHumanVilla(...)`:
- uses `7 × 5 WU` base footprint;
- composes at least two masses for selected seeds;
- includes stone ground floor or rusticated plinth and timber/plaster upper;
- includes 4-5 front bays with one asymmetric/special bay;
- has at least two chimneys and dormer/balcony/porch silhouette detail.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/world/buildings/HumanBuildingsKit.test.ts -t "human villa"`

Expected: FAIL until builder exists.

- [ ] **Step 3: Implement**

Use `MassComposer` for L/T/wing variants, `TimberFrame` for upper facades, `StringCourse` for floor separation, and `ShingleSurface` tile/slate roofs.

- [ ] **Step 4: Verify**

Run the same targeted test.

Expected: PASS.

---

### Task 9: Human inn builder

**Goal:** Implement `inn` as a broad public building with porch/gallery, sign, large constructed openings, and kitchen/stable variation.

**Files:**
- Modify: `src/world/buildings/HumanBuildingsKit.ts`
- Test: `tests/world/buildings/HumanBuildingsKit.test.ts`

- [ ] **Step 1: Write the failing test**

Assert `buildHumanInn(...)`:
- uses large `7 × 5 WU` footprint;
- has a double plank door and large mullioned public windows;
- includes a hanging inn sign and at least three public-house props;
- creates porch/gallery/side wing in weighted deterministic sample seeds;
- has 2-3 chimneys and a constructed roof.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/world/buildings/HumanBuildingsKit.test.ts -t "human inn"`

Expected: FAIL until builder exists.

- [ ] **Step 3: Implement**

Add inn-specific facade module, sign placement, balcony/porch helper calls, and prop scatter. Share villa roof/massing helpers where possible.

- [ ] **Step 4: Verify**

Run the same targeted test.

Expected: PASS.

---

### Task 10: Human shop builder

**Goal:** Implement `shop` with a real shopfront/counter opening, awning, sign, and upper living variation.

**Files:**
- Modify: `src/world/buildings/HumanBuildingsKit.ts`
- Test: `tests/world/buildings/HumanBuildingsKit.test.ts`

- [ ] **Step 1: Write the failing test**

Assert `buildHumanShop(...)`:
- uses `4 × 3 WU` footprint;
- includes a five-piece shop door and a shopfront/counter opening with sill/counter slab, mullions, and set-back dark interior;
- includes signboard/bracket and trade props;
- can create upper jettied living floor in selected seeds;
- uses tile/slate/thatch roof modules, not flat planes.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/world/buildings/HumanBuildingsKit.test.ts -t "human shop"`

Expected: FAIL until builder exists.

- [ ] **Step 3: Implement**

Add shopfront module with awning ribs and counter slab. Use `OpeningParts` for all openings and `HumanBuildingProps` for trade props.

- [ ] **Step 4: Verify**

Run the same targeted test.

Expected: PASS.

---

### Task 11: Human blacksmith builder

**Goal:** Implement `blacksmith` as an open-front forge with constructed hearth, dominant chimney, tool props, and soot-dark roof detail.

**Files:**
- Modify: `src/world/buildings/HumanBuildingsKit.ts`
- Test: `tests/world/buildings/HumanBuildingsKit.test.ts`

- [ ] **Step 1: Write the failing test**

Assert `buildHumanBlacksmith(...)`:
- uses `5 × 4 WU` footprint;
- has three constructed walls and an open front carried by posts, lintel, and braces;
- has masonry forge pieces, not just a glowing box;
- has massive corbelled chimney breast/stack;
- includes anvil, quench barrel, tool rack, and fuel pile props;
- uses roof courses and visible rafter tails.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/world/buildings/HumanBuildingsKit.test.ts -t "human blacksmith"`

Expected: FAIL until builder exists.

- [ ] **Step 3: Implement**

Compose stone/timber walls, open-front structural frame, forge, chimney, prop scatter, and roof. Use soot tint via shared material/instance colour, not cloned materials per tile.

- [ ] **Step 4: Verify**

Run the same targeted test.

Expected: PASS.

---

### Task 12: Human chapel builder

**Goal:** Implement `chapel` as a humble parish chapel with block-course stone, arched five-piece windows, modest buttresses, constructed roof, and bellcote.

**Files:**
- Modify: `src/world/buildings/HumanBuildingsKit.ts`
- Test: `tests/world/buildings/HumanBuildingsKit.test.ts`

- [ ] **Step 1: Write the failing test**

Assert `buildHumanChapel(...)`:
- uses `4 × 8 WU` long nave;
- uses block-course stone or equally detailed wall surfaces;
- creates 2-3 arched windows per long side with voussoirs/mullions/glazing;
- includes front door, gable oculus/arch window, modest buttresses, bellcote and visible bell;
- uses slate/clay/thatch roof courses with ridge/bargeboards;
- includes grave/path/lantern props.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/world/buildings/HumanBuildingsKit.test.ts -t "human chapel"`

Expected: FAIL until builder exists.

- [ ] **Step 3: Implement**

Reuse rectangular face helpers, `buildWallSurfaceBlocks()`/`StringCourse`, `VoussoirArch`, `OpeningParts`, `Buttress`, `Tracery` for optional quatrefoil, and roof kit. Keep chapel ordinary, not cathedral-scale.

- [ ] **Step 4: Verify**

Run the same targeted test.

Expected: PASS.

---

### Task 13: Human watchtower builder

**Goal:** Implement `watchtower` for showcase and future gateward-anchor reachability with block-course stone, arrow loops, parapet/roof variants, and human timber accents.

**Files:**
- Modify: `src/world/buildings/HumanBuildingsKit.ts`
- Test: `tests/world/buildings/HumanBuildingsKit.test.ts`

- [ ] **Step 1: Write the failing test**

Assert `buildHumanWatchtower(...)`:
- uses `2 × 2 WU` footprint with at least 4 visual floors;
- has coursed stone wall surfaces, quoins, and string courses;
- has five-piece arrow-loop openings rather than flat dark rectangles;
- uses either coping battlements or constructed slate/tile roof cap;
- includes at least one skyline detail: banner, lantern cage, hoarding, stair turret.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/world/buildings/HumanBuildingsKit.test.ts -t "human watchtower"`

Expected: FAIL until builder exists.

- [ ] **Step 3: Implement**

Reuse `buildWallSurfaceBlocks()` with rectangle/octagon faces. Build merlons with coping caps if crenellated; otherwise use roof courses. Reference doctrine §9.1 in comments/tests for future gateward-anchor mapping, but do not change `WARD_TO_KIND` in this race task.

- [ ] **Step 4: Verify**

Run the same targeted test.

Expected: PASS.

---

### Task 14: Seed sweep, depth-ladder, and banned-primitive tests

**Goal:** Add cross-kind safeguards so human builders cannot regress into base geometry, coplanar facades, or identical variants.

**Files:**
- Modify: `tests/world/buildings/HumanBuildingsKit.test.ts`
- Possibly modify: `src/world/buildings/HumanBuildingsKit.ts` to add names/userData for testability

- [ ] **Step 1: Write failing tests**

For all 8 builders and seeds `[1, 2, 3, 4, 5, 42, 99]`, assert:
- no NaN/Infinity transforms;
- every building has plinth/ground-contact marker;
- every scheduled opening reports all five pieces;
- depth ladder assertions pass;
- at least two distinct roof/wall/massing variants appear in the seed sweep;
- no readable feature is a lone primitive named as window, door, sign, barrel, lantern, or prop.

- [ ] **Step 2: Run and confirm failures**

Run: `npx vitest run tests/world/buildings/HumanBuildingsKit.test.ts`

Expected: FAIL until missing metadata/regressions are fixed.

- [ ] **Step 3: Implement fixes**

Add names/userData to human module outputs; fix any coplanar or primitive stand-in issues the tests reveal.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/world/buildings/HumanBuildingsKit.test.ts`

Expected: PASS.

---

### Task 15: Wire into `FACTION_BUILDING_VARIANTS`

**Goal:** Make runtime faction `human_town` use the new human kit for all canonical 8 kinds.

**Files:**
- Modify: `src/world/buildings/FactionBuildingVariants.ts`
- Test: `tests/world/buildings/FactionBuildingVariants.test.ts`

- [ ] **Step 1: Write the failing test**

Assert:
- `getFactionBuildingVariant('human_town', kind)` is non-null for `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, `watchtower`;
- each returned builder has the expected human marker in `userData`;
- `mapStudioFactionToRuntimeFaction('human')` remains `human_town`.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/world/buildings/FactionBuildingVariants.test.ts -t "human_town"`

Expected: FAIL because no `human_town` registry exists yet.

- [ ] **Step 3: Implement wiring**

Import the eight human builders and add a `human_town` entry to `FACTION_BUILDING_VARIANTS`. Do not wire `human_rural`/`human_noble` unless approved; leave them as future palette variants or add a TODO comment if needed.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/world/buildings/FactionBuildingVariants.test.ts -t "human_town" tests/world/buildings/HumanBuildingsKit.test.ts`

Expected: PASS.

---

### Task 16: Generalise Settlement Lab showcase so all 8 kinds render

**Goal:** Ensure Play in 3D on the Settlement tab displays the selected race's full 8-kind roster together, including human watchtower.

**Files:**
- Modify: `src/scene/SettlementLabScene.ts`
- Modify or create tests matching existing Settlement Lab test location

- [ ] **Step 1: Write the failing test**

Assert that the showcase kind override can provide a per-building callback or equivalent roster distributor that returns all 8 canonical kinds for studio faction `human`, mapped to runtime `human_town`, not only one global override. Assert the generated preview contains `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, and `watchtower` markers at least once each.

- [ ] **Step 2: Run and confirm failure**

Run the smallest existing Settlement Lab/scene test file.

Expected: FAIL until showcase generalisation is implemented.

- [ ] **Step 3: Implement**

Generalise the round-6.6f per-building callback so every selected race can distribute canonical kinds across settlement buildings. For human, cycle the first eight building records through the canonical roster in a stable order, then let later buildings fall back to natural ward kinds or repeat by weighted roster if needed. Keep natural `WARD_TO_KIND` unchanged; this is a review/showcase path. Include `watchtower` despite no ward entry so the visual acceptance gate is possible.

- [ ] **Step 4: Verify**

Run the targeted Settlement Lab test and `npx vitest run tests/world/buildings/FactionBuildingVariants.test.ts tests/world/buildings/HumanBuildingsKit.test.ts`.

Expected: PASS.

---

### Task 17: Delete superseded builders as dead code

**Goal:** Remove old human/generic code that is no longer reachable after `human_town` wiring, without deleting helpers still used by other factions or non-human styles.

**Files:**
- Modify: `src/world/buildings/BuildingBuilder.ts` and/or old human helper files only if reference search proves they are dead
- Test: affected building tests

- [ ] **Step 1: Write/extend reachability test**

Assert all `human_town` canonical kinds route through `FACTION_BUILDING_VARIANTS`, not generic `KIND_BUILDERS`.

- [ ] **Step 2: Search references without using git**

Use code search for each candidate helper name. Do not remove any helper still used by non-human fallback building kinds.

- [ ] **Step 3: Delete only proven-dead code**

Remove superseded human-specific stand-ins or comments. Keep generic fallback builders if other factions/kinds still rely on them.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/world/buildings/FactionBuildingVariants.test.ts tests/world/buildings/HumanBuildingsKit.test.ts`

Expected: PASS.

---

### Task 18: Full regression

**Goal:** Prove the human kit adds no new automated regressions beyond known baselines.

**Files:** none unless failures reveal required fixes.

- [ ] **Step 1: Run full Vitest**

Run: `npx vitest run`

Expected: Same known baseline class as before: about 13 pre-existing failures / 3272 passing. Investigate and fix any new failure introduced by this work.

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: 144 pre-existing errors. Investigate and fix any new error introduced by this work.

---

### Task 19: Live Playwright verification with screenshot

**Goal:** Visually confirm all 8 human building kinds render together from the session worktree, not a stale server.

**Files:**
- Screenshot artifact only, stored according to project convention; do not commit throwaway local files unless the project already tracks verification artifacts.

- [ ] **Step 1: Start Vite from the session worktree on a unique port**

Run from the active worktree, not `~/Documents/GitHub/...`:
`npm run dev -- --host 127.0.0.1 --port <unused-port>`

- [ ] **Step 2: Open Settlement Lab via Playwright**

Select race `human`, enter Play in 3D on the Settlement tab, and verify the page is served from the session worktree. Capture screenshot showing all 8 kinds.

- [ ] **Step 3: Inspect screenshot**

Confirm no flat placeholder windows/doors, no smooth thatch/tile roofs, no voxel blobs, no identical cloned row, and human street reads ordinary-but-varied. Fix any visual bug and repeat targeted tests plus screenshot.

---

### Task 20: Update TODO documentation

**Goal:** Record the completed human race pass and any remaining cross-race follow-ups.

**Files:**
- Modify: `TODO/organic_world_tiles_todo.md`
- Modify: `TODO/TODO_OVERVIEW.md`

- [ ] **Step 1: Update race progress**

Mark human building spec/implementation complete after approval and implementation. Note any skipped optional modules and the watchtower reachability decision deferred to doctrine §9.1.

- [ ] **Step 2: Verify docs diff manually**

Read the changed sections and ensure they do not claim unverified success.

---

### Task 21: Commit

**Goal:** Commit the completed, tested implementation with the required trailer.

**Files:** all implementation/test/docs files changed by the approved implementation.

- [ ] **Step 1: Review changed files**

Run the project's normal change-review commands. Ensure no generated junk, screenshots, or secrets are staged accidentally.

- [ ] **Step 2: Commit**

Use a concise message, including the required trailer:

```bash
git add src/world/buildings src/scene tests TODO
git commit -m "feat: add human building kit" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Expected: commit succeeds after full regression and live screenshot verification.
