# Vulperia Buildings — Implementation Plan

**Status:** Draft — awaiting user approval before implementation.

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` if available, otherwise `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax for tracking. Follow TDD. Do not treat the known baseline failures as new regressions.

**Goal:** Rebuild Vulperia settlement buildings as a constructed fox-folk sod-roof/burrow kit covering `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, and `watchtower`, with thick readable turf roofs, five-piece openings, rigorous ground contact, and Settlement Lab showcase coverage for all 8 kinds.

**Architecture:** One new shared `TurfRoof` module supplies the race's signature roof construction: rafters, board deck, turf-stop, thick sod layer with exposed soil edge, and instanced grass detail. Vulperia-specific modules compose low block-course/cob walls, fox-folk opening modules, berm/skirt grounding, and prop sets into per-kind builders. `FACTION_BUILDING_VARIANTS.vulperia` then wires every canonical kind to the new builders, and Settlement Lab forces a showcase mix so the unreachable `watchtower` can be reviewed beside the ward-reachable kinds.

**Tech Stack:** TypeScript, Three.js, Vitest, existing building kit modules (`buildWallSurfaceBlocks`, `OpeningParts`, `StringCourse`, `FacadeGrammar`, `MassComposer`, `RoofMassing`, `BatchedDetail`, `mergeGroupMeshesByMaterial`), existing Vulperia textures/palette (`earthTexture`, `barkTexture`, `FACTION_PRESETS.vulperia`).

**Estimated task count:** 25 tasks total: 1 baseline task, 3 shared-kit tasks (`[SHARED KIT] TurfRoof` layer geometry, dormer/porch sockets, batched turf detail), 14 race-specific construction/test tasks, and 7 final integration/verification/docs/commit tasks.

**Shared-kit note:** Vulperia is scheduled eighth, so most doctrine Tier 1/2 modules should already exist by the time this plan is executed. Consume existing `DepthLadder`, `OpeningParts`, `VoussoirArch`, `StringCourse`, `FacadeGrammar`, `RoofMassing`, `MassComposer`, and `BatchedDetail`; if any are missing on the integration branch, execute their earlier-race shared-kit plan first. Only `TurfRoof` is new and marked `[SHARED KIT]` here.

---

## Task 0: Establish implementation baseline

**Goal:** Record the known failing state before changing Vulperia code.

**Files:** none.

- [ ] **Step 1: Run full test baseline**
  - Command: `npx vitest run`
  - Expected: about 13 pre-existing failures / about 3272 passing, matching the shared brief. Record failing files and counts.

- [ ] **Step 2: Run type-check baseline**
  - Command: `npx tsc --noEmit`
  - Expected: 144 TypeScript errors, pre-existing. Record exact count.

- [ ] **Step 3: Confirm no implementation starts until baseline is recorded**
  - If counts differ, determine whether the branch already moved; only treat later changes in this plan as regressions.

---

## Task 1: [SHARED KIT] `TurfRoof` layer contract tests

**Goal:** Lock down the roof signature before implementation so it cannot become a smooth green blob.

**Files:**
- Create: `tests/world/buildings/kit/TurfRoof.test.ts`
- Create/modify later: `src/world/buildings/kit/TurfRoof.ts`

**Failing test to write first:**
- `buildTurfRoof({ archetype: 'lowGable', halfWidth: 2, halfDepth: 3, eaveHeight: 1.4, ridgeHeight: 3.2, turfThickness: 0.3, seed: 1, palette })` returns a `THREE.Group` containing named children/material buckets for:
  - `turf-roof-rafters`
  - `turf-roof-board-deck`
  - `turf-roof-board-ends`
  - `turf-roof-turf-stop`
  - `turf-roof-soil-edge`
  - `turf-roof-grass-top`
- Assert no mesh named `turf-roof-grass-top` is the only roof mesh.
- Assert the roof bounding box height exceeds `ridgeHeight - eaveHeight + turfThickness * 0.75`, proving real thickness.
- Assert all vertices are finite.

**Verification command:** `npx vitest run tests/world/buildings/kit/TurfRoof.test.ts -t "layer contract"`

**Implementation outline:**
- Create `src/world/buildings/kit/TurfRoof.ts` with exported types `TurfRoofArchetype`, `TurfRoofPalette`, `TurfRoofOptions`, and `buildTurfRoof(options): THREE.Group`.
- Implement only enough `lowGable` geometry to satisfy the layer contract:
  - rafters as repeated beveled/tapered timber beams along the slope;
  - board deck as thin sloped panels;
  - board ends as short visible blocks at eaves;
  - turf-stop/eaves board as projecting trim with optional dentil/scallop blocks;
  - sod/turf slab as thick sloped geometry;
  - soil-edge strips on every free verge/eave;
  - grass top as separate thin surface, never one monolithic roof body.
- Use shared materials by object reference; do not clone per board/tuft.

---

## Task 2: [SHARED KIT] `TurfRoof` dormer and porch-cut sockets

**Goal:** Make low eaves safe by providing roof-punched openings and porch cut-through volumes.

**Files:**
- Modify: `src/world/buildings/kit/TurfRoof.ts`
- Modify: `tests/world/buildings/kit/TurfRoof.test.ts`

**Failing test to write first:**
- Add a test for `dormers: [{ id: 'front-left', face: 'front', x: -0.7, width: 0.65, height: 0.55 }]`.
- Assert returned group includes `turf-roof-dormer-front-left`, `turf-roof-dormer-soil-edge-front-left`, and `turf-roof-dormer-hood-front-left`.
- Assert dormer bounding box front face projects beyond the low eave by at least `0.05` WU, so the opening remains visible.
- Add a test for `porchCuts: [{ id: 'front-entry', face: 'front', width: 1.3, height: 1.9 }]` and assert the returned metadata/child name exists for the cut socket.

**Verification command:** `npx vitest run tests/world/buildings/kit/TurfRoof.test.ts -t "dormer|porch"`

**Implementation outline:**
- Extend `TurfRoofOptions` with `dormers` and `porchCuts`.
- Implement dormer mini-roofs as the same layered construction at smaller scale: tiny rafters/deck/turf/soil edge.
- Implement porch cuts as geometric raised gable/hood pieces or socket metadata consumed by Vulperia porch builders; do not rely on transparent material or hidden planes.
- Keep low-eave roof planes continuous outside the socket.

---

## Task 3: [SHARED KIT] `TurfRoof` plant detail and deterministic variation

**Goal:** Add readable grass tufts/wild plants without per-building draw-call explosions.

**Files:**
- Modify: `src/world/buildings/kit/TurfRoof.ts`
- Modify: `tests/world/buildings/kit/TurfRoof.test.ts`

**Failing test to write first:**
- Same seed/options produce identical child counts and vertex counts.
- Different seeds vary tuft placement/count within configured bounds.
- `detail: { tufts: 24, wildflowers: 4 }` produces named detail group `turf-roof-detail` and uses shared geometry/material references or `BatchedDetail` adapter when available.
- No plant detail has a bounding box below the turf top surface.

**Verification command:** `npx vitest run tests/world/buildings/kit/TurfRoof.test.ts`

**Implementation outline:**
- Use `mulberry32(seed ^ 0x7A7F_ROOF)` or a valid numeric salt already used in project style.
- Add coarse grass blades/tuft clusters as instanced or batched detail; for local fallback, group repeated simple 4-6 triangle blades under one named detail group.
- Add dry-grass/wildflower color slots suitable for Vulperia grassland/savanna roofs.
- Keep detail optional so LOD/performance tuning can disable it.

---

## Task 4: Vulperia palette, constants, and public builder module shell

**Goal:** Create a focused module boundary for the race-specific kit.

**Files:**
- Create: `src/world/buildings/VulperiaBuildingKit.ts`
- Create: `tests/world/buildings/VulperiaBuildingKit.test.ts`

**Failing test to write first:**
- Import `VULPERIA_BUILDING_KINDS`, `VULPERIA_PALETTE`, and `buildVulperiaHouse` from `VulperiaBuildingKit.ts`.
- Assert `VULPERIA_BUILDING_KINDS` equals `['house','terraced','villa','inn','shop','blacksmith','chapel','watchtower']`.
- Assert palette exposes warm wall, dark facade, grass/turf, trim, door, glass, soil, timber, and lantern colors matching the spec.
- Assert `buildVulperiaHouse(makeDna('house','vulperia'))` currently throws/module missing before implementation.

**Verification command:** `npx vitest run tests/world/buildings/VulperiaBuildingKit.test.ts -t "palette|kinds"`

**Implementation outline:**
- Add constants only; stub public builders may throw until their task lands.
- Runtime faction is `vulperia`; do not introduce a new faction id.
- Centralize shared salts, visual storey heights, roof thickness ranges, and per-kind variation tables.

---

## Task 5: Vulperia five-piece openings

**Goal:** Replace existing round-door/window stand-ins with doctrine-compliant fox-folk openings.

**Files:**
- Create: `src/world/buildings/VulperiaOpenings.ts`
- Create: `tests/world/buildings/VulperiaOpenings.test.ts`
- Modify later consumers in `VulperiaBuildingKit.ts`

**Failing test to write first:**
- `buildVulperiaBurrowDoor({ width: 1.1, height: 1.7, seed, palette })` includes named pieces: recess, proud frame, threshold/sill, planked door leaf, strap iron, and set-back face at depth `-0.20`.
- `buildVulperiaRoundWatchWindow(...)` includes recess, frame, lower sill/lip, crossbar/mullion, and set-back dark glazing.
- `buildVulperiaEyebrowDormerWindow(...)` includes the same five pieces and a mini hood compatible with `TurfRoof` dormer sockets.
- Assert frame/sill/reveal/glass depths match `DepthLadder` constants.

**Verification command:** `npx vitest run tests/world/buildings/VulperiaOpenings.test.ts`

**Implementation outline:**
- Build on `OpeningParts.ts`, `VoussoirArch.ts`, and `DepthLadder.ts` if present.
- Use low/rounded arch ratios, not elven/vampire lancets.
- Door planks are real strips with gaps; straps are broad enough to read. Do not use a sphere knob as the readable feature.
- Windows are small but have real mullion/crossbar geometry.

---

## Task 6: Vulperia grounding and berm/skirt module

**Goal:** Prevent the low-roof/burrow “see under the building” bug.

**Files:**
- Create: `src/world/buildings/VulperiaGrounding.ts`
- Create: `tests/world/buildings/VulperiaGrounding.test.ts`

**Failing test to write first:**
- `buildVulperiaGroundSkirt({ halfWidth: 2, halfDepth: 1.5, eaveOutset: 0.6, maxBermHeight: 0.45, seed })` returns a group with:
  - stone/plinth course;
  - earth berm ring/apron;
  - grass edge patches;
  - named front path cut.
- Assert bounding box extends beyond wall footprint by at least `0.30` WU.
- Assert no skirt vertex is below placement ground by more than `0.02` WU.
- Assert front path remains open where the door/porch will sit.

**Verification command:** `npx vitest run tests/world/buildings/VulperiaGrounding.test.ts`

**Implementation outline:**
- Reuse `StringCourse` for plinth if available.
- Reuse `earthTexture()`/`barkTexture()`/simple packed-earth materials; optionally use `buildVulperiaDenMoundGrid()` only for small support/berm shapes, not the visible main building body.
- Keep everything inside the building group; do not modify terrain or placement.

---

## Task 7: Shared Vulperia wall/body composer

**Goal:** Provide reusable low wall + roof + opening placement helpers so kind builders do not duplicate geometry rules.

**Files:**
- Modify: `src/world/buildings/VulperiaBuildingKit.ts`
- Modify: `tests/world/buildings/VulperiaBuildingKit.test.ts`

**Failing test to write first:**
- Add internal-test-facing helper export if project convention allows: `buildVulperiaLowWallBody` or test through `buildVulperiaHouse` once stub exists.
- Assert a body contains real block-course/cob/stone wall geometry with vertex count > a simple box, a plinth/skirt, a `TurfRoof`, and at least one opening group from `VulperiaOpenings`.
- Assert no primary body mesh uses large `SphereGeometry` or a single `BoxGeometry` as the entire facade.

**Verification command:** `npx vitest run tests/world/buildings/VulperiaBuildingKit.test.ts -t "low wall body"`

**Implementation outline:**
- Use `buildWallSurfaceBlocks()` with `rectangleFaces()` for rectangular bodies; use `buildFloorCap()` for roof/wall seam closure.
- Add timber posts/string courses as distinct depth-ladder offsets.
- Define helper inputs for footprint, eave/ridge height, dormers, porch cuts, openings, and prop sockets.
- Merge by material where possible.

---

## Task 8: `house` builder — Fox Garden burrow cottage

**Goal:** Implement the purest small Vulperia cottage from the spec.

**Files:**
- Modify: `src/world/buildings/VulperiaBuildingKit.ts`
- Modify: `tests/world/buildings/VulperiaBuildingKit.test.ts`

**Failing test to write first:**
- `buildVulperiaHouse(makeDna('house','vulperia', seed))` builds a non-empty group with finite vertices.
- Assert bounding box roughly fits `4 × 3` WU plus skirt, not villa-sized.
- Assert it contains exactly one primary burrow/porch door, at least two window modules, one `TurfRoof`, and one ground skirt.
- Assert low eave does not cover the front door: front door top is above/inside a porch cut or gable opening.

**Verification command:** `npx vitest run tests/world/buildings/VulperiaBuildingKit.test.ts -t "house"`

**Implementation outline:**
- Compose wall body footprint `4 × 3`, eave `1.5`, ridge `3.2`, `TurfRoof.lowGable` with front porch lift.
- Add off-centre `burrow_round_door`, two `round_watch` windows, one optional dormer by seed.
- Add chimney or lantern mast and small dooryard prop.

---

## Task 9: `terraced` builder — Poor Burrows row segment

**Goal:** Implement a narrow two-floor row-burrow segment with party-wall rules.

**Files:**
- Modify: `src/world/buildings/VulperiaBuildingKit.ts`
- Modify: `tests/world/buildings/VulperiaBuildingKit.test.ts`

**Failing test to write first:**
- `buildVulperiaTerraced(makeDna('terraced','vulperia'))` fits the `3 × 4` WU footprint plus skirt.
- With `dna.terrace = 'both'`, assert side-window modules are absent and front/rear openings remain.
- Assert at least one upper dormer/eyebrow window exists for the second floor.
- Assert repeated seeds are deterministic and different seeds vary dormer/entry placement.

**Verification command:** `npx vitest run tests/world/buildings/VulperiaBuildingKit.test.ts -t "terraced"`

**Implementation outline:**
- Use `TurfRoof.rowGable`, taller retaining facade, one raised porch/burrow door, one upper dormer, rear escape slit.
- Respect `TerraceSide` by suppressing side openings on shared walls.
- Add cramped row props without exceeding readable scale.

---

## Task 10: `villa` builder — Fox Den / elder burrow hall

**Goal:** Replace villa reuse with a multi-mass leader hall.

**Files:**
- Modify: `src/world/buildings/VulperiaBuildingKit.ts`
- Modify: `tests/world/buildings/VulperiaBuildingKit.test.ts`

**Failing test to write first:**
- `buildVulperiaVilla(makeDna('villa','vulperia'))` contains at least two mass groups (main hall + side/rear lobe) and a cross/offset turf roof.
- Assert `villa` bounding box is wider than `house` and uses `7 × 5` WU scale.
- Assert at least four window modules and one hidden/rear door module exist.
- Assert a civic prop (banner/den marker/garden fence) is present by name.

**Verification command:** `npx vitest run tests/world/buildings/VulperiaBuildingKit.test.ts -t "villa"`

**Implementation outline:**
- Compose main hall `5.8 × 4.2`, side lobe `2.2-2.8` WU, porch, and skirt.
- Use `TurfRoof.crossGable`; add dormers for upper floors when `dna.floors >= 2`.
- Keep asymmetry deterministic via seed.

---

## Task 11: `inn` builder — Wanderer's Den

**Goal:** Build the long-hall inn inspired by the bottom-centre reference building.

**Files:**
- Modify: `src/world/buildings/VulperiaBuildingKit.ts`
- Modify: `tests/world/buildings/VulperiaBuildingKit.test.ts`

**Failing test to write first:**
- `buildVulperiaInn(makeDna('inn','vulperia'))` uses long hall massing, at least three dormer/loft windows, a raised front porch, and a rear/side service exit.
- Assert `inn` has a hanging sign or lantern string by name.
- Assert `inn` differs from `villa` in child names/massing count, not just scale.

**Verification command:** `npx vitest run tests/world/buildings/VulperiaBuildingKit.test.ts -t "inn"`

**Implementation outline:**
- Use `7 × 5` footprint, two-floor loft, broad `TurfRoof.longHall`, optional kitchen wing.
- Add wide porch cut, front/side round windows, loft dormers, service door, benches/barrels/travel props.

---

## Task 12: `shop` builder — Night Market den-mouth stall

**Goal:** Build the bottom-left reference's awning/counter structure as a Vulperia market building.

**Files:**
- Modify: `src/world/buildings/VulperiaBuildingKit.ts`
- Modify: `tests/world/buildings/VulperiaBuildingKit.test.ts`

**Failing test to write first:**
- `buildVulperiaShop(makeDna('shop','vulperia'))` includes a back turf-roof booth, a real supported awning, a framed counter opening, a side watch window, and a rear/side exit.
- Assert counter opening has five-piece parts and is not a dark box/coplanar panel.
- Assert awning has posts and thickness and is not floating: post bottoms touch ground pads.

**Verification command:** `npx vitest run tests/world/buildings/VulperiaBuildingKit.test.ts -t "shop"`

**Implementation outline:**
- Compose rear booth `4 × 3`, `TurfRoof.halfGable`, counter bay, post-supported cloth awning, lantern/goods props.
- Use facade grammar so the counter/window/exit bays do not stretch with seed variation.

---

## Task 13: `blacksmith` builder — Tinkerer's Shop

**Goal:** Build a forge/tinker shop that keeps the sod roof but handles fire/readability correctly.

**Files:**
- Modify: `src/world/buildings/VulperiaBuildingKit.ts`
- Modify: `tests/world/buildings/VulperiaBuildingKit.test.ts`

**Failing test to write first:**
- `buildVulperiaBlacksmith(makeDna('blacksmith','vulperia'))` includes open forge bay, tall chimney/hood, stone/scorched apron, and at least one small watch window.
- Assert turf roof is interrupted or protected by a named firebreak collar around chimney.
- Assert forge bay remains visibly open from front/side, not hidden by low eaves.

**Verification command:** `npx vitest run tests/world/buildings/VulperiaBuildingKit.test.ts -t "blacksmith"`

**Implementation outline:**
- Use `5 × 4` footprint, `TurfRoof.lowGable` over workshop, open bay with heavy posts and stone apron.
- Add chimney stack to `5.0+` WU, anvil/scrap/bellows/coal props.
- Keep berm away from scorched apron.

---

## Task 14: `chapel` builder — Den Mother's Hall

**Goal:** Build the long community hall while preserving opening legibility under sweeping eaves.

**Files:**
- Modify: `src/world/buildings/VulperiaBuildingKit.ts`
- Modify: `tests/world/buildings/VulperiaBuildingKit.test.ts`

**Failing test to write first:**
- `buildVulperiaChapel(makeDna('chapel','vulperia'))` fits fixed `4 × 8` footprint plus skirt.
- Assert one raised front porch door, four side dormer/eyebrow windows, and one rear round oculus/marker exist.
- Assert all windows are roof-punched/gable/end openings, not hidden behind low side eaves.
- Assert chapel differs from current `buildVulperiaChapel` mound pattern by containing `TurfRoof.longHall` and not relying on satellite mound bodies as main mass.

**Verification command:** `npx vitest run tests/world/buildings/VulperiaBuildingKit.test.ts -t "chapel"`

**Implementation outline:**
- Compose long hall with central porch gable, `TurfRoof.longHall`, four dormers, rear oculus, den-marker/lantern/offerings props.
- Keep sacred ornament fox-folk/den based; do not import elven/vampire tracery vocabulary.

---

## Task 15: `watchtower` builder — Burrow Gate lookout

**Goal:** Give Vulperia a bespoke lookout instead of generic fallback.

**Files:**
- Modify: `src/world/buildings/VulperiaBuildingKit.ts`
- Modify: `tests/world/buildings/VulperiaBuildingKit.test.ts`

**Failing test to write first:**
- `buildVulperiaWatchtower(makeDna('watchtower','vulperia'))` builds finite geometry, fits around `2 × 2` WU base plus support skirt, and has height greater than `5` WU.
- Assert it contains at least four recessed/framed `gable_slit` watch openings and a turf cap with exposed soil edge.
- Assert it is not the generic watchtower path by checking named group `vulperia-watchtower` and no null variant after wiring task later.

**Verification command:** `npx vitest run tests/world/buildings/VulperiaBuildingKit.test.ts -t "watchtower"`

**Implementation outline:**
- Compose earth/stone base, narrow timber/faceted shaft, slits, signal lantern/banner, and small `TurfRoof.steepCap`.
- Add heavy ground pads/berm so the narrow tower does not float or pierce terrain.

---

## Task 16: Per-kind determinism, variation weights, and no-banned-primitive sweep

**Goal:** Prove all eight builders vary by seed through module swapping while obeying doctrine constraints.

**Files:**
- Modify: `tests/world/buildings/VulperiaBuildingKit.test.ts`
- Modify: `src/world/buildings/VulperiaBuildingKit.ts` as needed

**Failing test to write first:**
- For all eight builders:
  - same seed produces same child-name signature and vertex count;
  - different seeds vary at least one documented module axis across a small seed sweep;
  - all vertices are finite;
  - no primary building body uses large `SphereGeometry`, one flat roof plane, or a single dark box/circle as an opening;
  - every returned group includes `vulperia-ground-skirt` and at least one `turf-roof-soil-edge` child except the open work bay's non-roof area.

**Verification command:** `npx vitest run tests/world/buildings/VulperiaBuildingKit.test.ts`

**Implementation outline:**
- Add exported weight tables for each kind matching `spec.md`.
- Use fixed module choices + seeded jitter; do not scale one finished mesh for variety.
- Ensure group/child names expose enough structure for tests and live debugging.

---

## Task 17: Performance and merge/batch regression tests

**Goal:** Keep detailed roofs/openings from creating unnecessary draw-call or allocation regressions.

**Files:**
- Modify: `tests/world/buildings/VulperiaBuildingKit.test.ts`
- Modify: `tests/world/buildings/kit/TurfRoof.test.ts`
- Modify: implementation files as needed

**Failing test to write first:**
- Build all eight kinds for seeds 1-3 and assert rough triangle/vertex budgets are within spec-scale limits:
  - small kinds (`house`, `terraced`, `shop`) under agreed LOD0 budget;
  - large kinds (`villa`, `inn`, `chapel`) under larger budget;
  - `watchtower` under tower budget.
- Assert repeated roof tuft geometry uses instancing/batching/shared geometry where available, not hundreds of unique material clones.
- Assert `mergeGroupMeshesByMaterial()` does not drop wall/roof material buckets due to missing `uv` attributes.

**Verification command:** `npx vitest run tests/world/buildings/VulperiaBuildingKit.test.ts tests/world/buildings/kit/TurfRoof.test.ts -t "budget|merge|uv"`

**Implementation outline:**
- Add UVs to custom turf/soil/deck geometries.
- Avoid material clones except where unavoidable for intentional `DoubleSide`; prefer shared material instances.
- Use `BatchedDetail` for plants if already integrated; otherwise keep detail counts modest and isolated.

---

## Task 18: Wire Vulperia builders into `FACTION_BUILDING_VARIANTS`

**Goal:** Route runtime faction `vulperia` to the new kit for all canonical kinds.

**Files:**
- Modify: `src/world/buildings/FactionBuildingVariants.ts`
- Modify: `tests/world/FactionBuildingVariants.test.ts`

**Failing test to write first:**
- Update registry tests so `getFactionBuildingVariant('vulperia', kind)` is non-null for all 8 canonical kinds, including `watchtower`.
- Assert each wired function reference equals the matching public builder from `VulperiaBuildingKit.ts`.
- Update the existing “returns null for vulperia/watchtower” test to expect a bespoke variant.
- Assert `buildBuilding(makeDna('watchtower','vulperia')).exteriorGroup` has `vulperia-watchtower` naming/geometry, not generic fallback.

**Verification command:** `npx vitest run tests/world/FactionBuildingVariants.test.ts`

**Implementation outline:**
- Import `buildVulperiaHouse`, `buildVulperiaTerraced`, `buildVulperiaVilla`, `buildVulperiaInn`, `buildVulperiaShop`, `buildVulperiaBlacksmith`, `buildVulperiaChapel`, `buildVulperiaWatchtower`.
- Replace current `vulperia` registry entries:
  - `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, `watchtower`.
- Keep `tower` optional unless the branch has a cross-race policy for `tower`; minimum required roster is `watchtower`.

---

## Task 19: Generalise Settlement Lab showcase so all 8 Vulperia kinds render together

**Goal:** Make Overworld Studio → Settlement tab → Play in 3D show every Vulperia kind in one scene.

**Files:**
- Modify: `src/scene/SettlementLabScene.ts`
- Modify: `tests/scene/SettlementLabScene.test.ts`

**Failing test to write first:**
- Add `SettlementLabScene — Vulperia all-kinds showcase` test:
  - enter lab with `{ seed: 7, type: 'city', faction: 'vulperia', layout: 'auto' }`;
  - inspect `_renderResult.buildingRecords`;
  - assert the set of `dna.buildingKind` includes all 8 target kinds: `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, `watchtower`;
  - assert readout contains `POC override: showcase` or `showcase (all vulperia kits)`.
- Add panel-regenerate test switching from human to Vulperia and asserting the same showcase behavior.

**Verification command:** `npx vitest run tests/scene/SettlementLabScene.test.ts -t "Vulperia"`

**Implementation outline:**
- Extract a helper such as `showcaseAllKinds(kinds: BuildingKind[]): (b, index) => BuildingKind | undefined` if useful.
- Add `vulperia` entry to `POC_KIND_OVERRIDE_BY_FACTION` that cycles/assigns the first eight building records to the eight kinds, guaranteeing `watchtower` appears despite no `WARD_TO_KIND` route.
- Preserve existing `elven` behavior; do not force all other factions.
- If a generated city has fewer than eight building records for a seed, choose a tested city seed/type that has enough records or update lab showcase to request enough planned buildings before assertions.

---

## Task 20: Delete superseded Vulperia builders as dead code

**Goal:** Remove old mound-based live builders after the new kit is wired, while preserving shared/territory primitives still in use.

**Files:**
- Modify: `src/world/buildings/FactionBuildingVariants.ts`
- Modify: `tests/world/FactionBuildingVariants.test.ts`
- Do not delete: `buildVulperiaDenMoundGrid()` if territory props or grounding still use it.

**Failing test to write first:**
- Add/adjust tests asserting no live `FACTION_BUILDING_VARIANTS.vulperia` entry references old inline functions (`buildVulperiaVilla`, `buildVulperiaChapel`, `buildVulperiaShop`, `vulperiaMound`).
- Assert `buildVulperiaDenMoundGrid()` remains importable for territory dressing.
- Run a text-search/manual check in review: old inline functions are removed from `FactionBuildingVariants.ts` if unreferenced.

**Verification command:** `npx vitest run tests/world/FactionBuildingVariants.test.ts tests/world/FactionTerritoryProps.test.ts`

**Implementation outline:**
- Delete old inline Vulperia helper functions that no longer have callers:
  - `vulperiaMound`, old `buildVulperiaVilla`, old `buildVulperiaChapel`, old `buildVulperiaShop`, and any old round-door/window helpers not reused elsewhere.
- Keep generic helpers used by other factions.
- Keep `FactionBlockProfiles.ts` and `FactionTerritoryProps.ts` Vulperia exports unless tests prove unused and no territory dressing depends on them.

---

## Task 21: Full regression

**Goal:** Verify no new automated failures beyond the recorded baseline.

**Files:** none unless fixes are required.

- [ ] **Step 1: Run targeted building/scene tests**
  - Command: `npx vitest run tests/world/buildings/VulperiaBuildingKit.test.ts tests/world/buildings/VulperiaOpenings.test.ts tests/world/buildings/VulperiaGrounding.test.ts tests/world/buildings/kit/TurfRoof.test.ts tests/world/FactionBuildingVariants.test.ts tests/scene/SettlementLabScene.test.ts`
  - Expected: PASS.

- [ ] **Step 2: Run full suite**
  - Command: `npx vitest run`
  - Expected: same pre-existing failure set/count as Task 0, with all new Vulperia tests passing. No new failures.

- [ ] **Step 3: Run type-check**
  - Command: `npx tsc --noEmit`
  - Expected: 144 pre-existing errors, or exact Task 0 count if branch baseline moved. No new Vulperia-related errors.

- [ ] **Step 4: Fix any new regression**
  - If a failure/error traces to this plan's files, fix it and repeat Steps 1-3.

---

## Task 22: Live Playwright verification with screenshot

**Goal:** Confirm the actual isometric scene reads correctly; unit tests are not enough for roof/ground-contact bugs.

**Files:**
- Create only throwaway verification scripts/screenshots if project convention permits, then delete them before commit.
- No committed source changes unless visual bugs are fixed.

**Verification procedure:**
- Start Vite from the session worktree on a unique port, not the stale main-checkout server.
- Navigate to Settlement Lab with Vulperia parameters, for example:
  - `http://localhost:<port>/index.html?devroom=settlement-lab&sl_seed=7&sl_type=city&sl_faction=vulperia&sl_layout=auto`
- Capture screenshots from default and rotated/zoomed views.
- Confirm visually:
  1. all 8 Vulperia kinds are present in one scene;
  2. turf roofs show thickness, exposed soil edge, board ends, turf-stop boards, and tuft detail;
  3. low eaves do not hide every door/window;
  4. each opening reads as framed/recessed with sill/mullion/glass/door depth;
  5. no building floats, reveals underside gaps, or appears to lack ground under low eaves;
  6. `shop` awning and `blacksmith` forge bay are supported and not floating;
  7. `watchtower` is bespoke and not the generic fallback.

**Verification command:** Use the existing Playwright setup/project command from the repo's e2e convention. If there is no dedicated script, run the existing Playwright command used by prior visual checks and save screenshots under the existing screenshot output path, then delete throwaway scripts/screenshots not intended for commit.

**Expected:** No page/console errors and screenshots satisfy the checklist. Fix visual issues, then rerun targeted tests and this live check.

---

## Task 23: Update TODO docs

**Goal:** Record the Vulperia building round in the project roadmap.

**Files:**
- Modify: `TODO/organic_world_tiles_todo.md`
- Modify: `TODO/TODO_OVERVIEW.md`

**Failing test to write first:** Documentation-only; no failing automated test required. Before editing, search existing Phase 6 entries and mimic their format.

**Implementation outline:**
- In `TODO/organic_world_tiles_todo.md`, add a Phase 6 Vulperia entry after the prior race rounds:
  - reference `spec.md`/implemented docs path once copied into repo by parent;
  - note thin reference set;
  - summarize TurfRoof shared kit, low sod-roof/burrow architecture, eight-kind coverage, Settlement Lab all-kinds showcase, and verification results.
- Update the Phase 6 status line to include Vulperia as shipped once implemented.
- In `TODO/TODO_OVERVIEW.md` G16 row, append a concise Vulperia follow-up summary matching existing style.

**Verification command:** `npx vitest run tests/scene/SettlementLabScene.test.ts tests/world/FactionBuildingVariants.test.ts` after doc edits if no code changed since Task 21; otherwise repeat targeted tests affected by fixes.

---

## Task 24: Commit

**Goal:** Persist the completed implementation for review.

**Files:** all implementation, tests, and TODO docs from prior tasks.

- [ ] **Step 1: Inspect changed files**
  - Command: `git status --short`
  - Expected: only intended source/test/TODO files are changed; no throwaway screenshots/scripts.

- [ ] **Step 2: Commit**
  - Command:
    ```bash
    git add src/world/buildings/kit/TurfRoof.ts src/world/buildings/VulperiaBuildingKit.ts src/world/buildings/VulperiaOpenings.ts src/world/buildings/VulperiaGrounding.ts src/world/buildings/FactionBuildingVariants.ts src/scene/SettlementLabScene.ts tests/world/buildings/kit/TurfRoof.test.ts tests/world/buildings/VulperiaBuildingKit.test.ts tests/world/buildings/VulperiaOpenings.test.ts tests/world/buildings/VulperiaGrounding.test.ts tests/world/FactionBuildingVariants.test.ts tests/scene/SettlementLabScene.test.ts TODO/organic_world_tiles_todo.md TODO/TODO_OVERVIEW.md
    git commit -m "feat: rebuild vulperia buildings with turf-roof burrow kit" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
    ```
  - Expected: one commit with only intended files.

- [ ] **Step 3: Do not merge without user approval**
  - Leave PR/merge decisions to the parent/user workflow.
