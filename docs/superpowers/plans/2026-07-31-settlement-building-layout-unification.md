# Settlement Building Layout Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify live-game settlement building and road layout with Overworld Studio’s ward-based generator so both use the same deterministic model and per-ward building fill pipeline.

**Architecture:** Extract the pure settlement ward/model + building-rect generation code from `src/overworld-studio.ts` into a new DOM-free `src/world/SettlementModelGenerator.ts`, then rewire `SettlementGenerator.ts` and `OverworldScene.ts` to consume that shared model. Replace hardcoded live settlement patterns with ward-derived anchor/filler buildings and Chaikin road rasterization while preserving Studio rendering output.

**Tech Stack:** TypeScript, Vitest, Vite dev server, existing world/building generation modules.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-30-settlement-building-layout-unification-design.md` exactly unless repo reality forces a documented deviation.
- Do not touch walls/gates beyond carrying existing data through extraction.
- Do not delete `BUILDING_SPECS`/`BuildingType` even if settlement placement stops using them.
- Do not commit generated `.js` files; source-only `.ts`/`.tsx` edits.
- Preserve Studio settlement rendering byte-for-byte by making `overworld-studio.ts` consume the extracted functions.
- Validation must include `npx tsc --noEmit`, `npm run doctor`, `npx vitest run`, dev-server smoke check, and screenshots.

---

### Task 1: Rewriting settlement tests first

**Files:**
- Modify: `tests/levels/settlementGenerator.test.ts`
- Modify: `tests/world/WorldGenerator.test.ts`

**Interfaces:**
- Consumes: current `planSettlement(type, centerCol, centerRow, seed, grid, name?, faction?)`, `applySettlementToGrid(plan, grid, id)`
- Produces: failing tests that assert deterministic ward-derived buildings/roads, anchor/filler behavior, overlap safety, terrain snapping, graceful dropping, and world integration coverage.

- [ ] Write failing tests for the new settlement behaviors.
- [ ] Run targeted vitest commands and confirm they fail for the expected old-layout reasons.
- [ ] Keep tests focused on externally visible behavior, not implementation details.

### Task 2: Extracting the shared settlement model generator

**Files:**
- Create: `src/world/SettlementModelGenerator.ts`
- Modify: `src/overworld-studio.ts`

**Interfaces:**
- Consumes: `Vec2`, `SettlementFaction` types from `src/overworld-studio.ts`; `chaikin`, `Delaunay`, `createNoise2D` dependencies.
- Produces: `buildSettlement(p: GeneratorParams): SettlementModel`, `generateBaseSeeds(p): Vec2[]`, `buildFromSeeds(seeds, p): SettlementModel`, `fillWard(ward, occ): BuildingRect[]`, exported generator/layout/ward types, and supporting geometry helpers.

- [ ] Move pure generator/model/ward-fill logic into the new module without DOM references.
- [ ] Change ward-fill functions to return `BuildingRect[]` data.
- [ ] Update Studio rendering code to draw from returned rects and preserve output.

### Task 3: Wiring the runtime settlement planner

**Files:**
- Modify: `src/world/SettlementGenerator.ts`
- Modify: `src/world/buildings/BuildingTypeMap.ts`
- Modify: `src/scene/OverworldScene.ts`

**Interfaces:**
- Consumes: extracted `SettlementModelGenerator` APIs, `getFootprint()`, `factionBuildingDna()`, `WARD_TO_KIND/SIZE/FLOORS`, `_mapStudioFactionToRuntimeFaction()`.
- Produces: new `PlacedBuilding` shape `{ wardType, isAnchor, col, row, rotation, seed }`, shared ward-based planning path, grid snapping, road rasterization, and runtime anchor/filler building adapters.

- [ ] Replace hardcoded `_planVillage/_planTown/_planCity` logic with shared model planning.
- [ ] Add Studio-space to WorldGrid mapping, snapping, overlap checks, and graceful drops.
- [ ] Update runtime building creation for anchor vs filler and real settlement faction wiring.

### Task 4: Verifying, smoke testing, and committing

**Files:**
- Modify as needed from earlier tasks only.

**Interfaces:**
- Consumes: repo validation commands and Playwright/dev-server tooling.
- Produces: verified working change set, screenshot artifacts, and git commit(s).

- [ ] Run full required verification and compare failures to known baseline.
- [ ] Start/stop the dev server and confirm browser entry points load.
- [ ] Capture Studio/live screenshots, inspect visuals, and commit with the required trailer.
