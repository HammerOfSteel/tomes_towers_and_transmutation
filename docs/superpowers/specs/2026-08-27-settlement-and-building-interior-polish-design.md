# Settlement/Road Polish + Building Interior Scale — Design

> Written autonomously (autopilot mode, user unavailable) following the
> `finishing-a-development-branch` merge of the ocean-shoreline/biome-scatter
> branch. Documents assumptions explicitly for later user review, per the
> brainstorming skill's process.

## Context

User feedback after playing the current build:
1. Building interiors feel "too small and cramped, needs to be bigger."
2. Outdoor building representation is a nice size, but settlement/road
   placement "looks odd" — attributed (correctly, per the user) to the
   overworld not yet being fully adherent to Overworld Studio's generation.
3. Ask: read `TODO/02-game-world-integration/*` (especially
   `STUDIO-LIVE-PARITY.md`), reconcile with actual code, and plan the next
   branch's scope.

## Investigation findings (supersede stale TODO docs)

### Finding A — Building interiors: a real, simple, well-scoped bug

Every other interior-scene system in the game uses `cellSize: 2` (world
units per tile): `DungeonGenerator`/`TowerGenerator.ts` (`CELL = 2`),
`GreenhouseGenerator.ts` (`cellSize: 2`), `SandboxArena.ts` (`cellSize: 2`).

Building interiors alone — `src/buildingToDungeonPlan.ts`'s
`buildingToDungeonPlan()` — hardcode `cellSize: 1.0` when constructing each
room's `Blueprint`. That's **literally half the tile pitch of every other
interior in the game**, i.e. a quarter the floor area for the same tile
count. `BlueprintRenderer.ts` and `SceneManager.ts` read `cellSize`
generically for all wall/furniture/door/stair geometry and physics bounds,
so this one number scales the entire room proportionally. This is the
dominant cause of "cramped" interiors — not the room-carving logic or
footprint tables, which are already reasonably sized on their own.

Secondary, smaller findings in the same area:
- `InteriorGenerator.ts`'s `getBuildingFootprint()` keeps its own hardcoded
  footprint table, independent of `BuildingDNA.ts`'s exterior
  `SIZE_FOOTPRINT`/`KIND_FOOTPRINT` (which were deliberately shrunk ~45% for
  a compact "Animal Crossing scale" exterior silhouette). The interior table
  is *not* actually "the same footprint logic as BuildingBuilder" as its
  comment claims — it drifted into its own, larger values a while ago. This
  decoupling is fine and worth keeping (compact outside, spacious inside is
  what the user asked for) — the comment is just wrong and should be fixed
  to state the decoupling is intentional.
- `generatePlan()`'s room-carving for `house`/`cottage`/`terraced` silently
  skips the kitchen/bedroom split when `backD <= 1` — small/tiny buildings
  can end up as a single one-room interior even when there's a reasonable
  case for two. Worth a small threshold/proportion adjustment.
- Doubling `cellSize` doubles floor area without changing furniture count
  (`PURPOSE_FURNITURE` lists 2-3 items per room) — rooms may read as sparse
  after the fix. Small follow-up: bump per-purpose furniture counts modestly.

### Finding B — Settlement/road "odd" look: two concrete bugs, not a missing architecture

`TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md` states settlement
building-layout unification (P1‑2) is "not started" and "needs its own
design cycle." **This is stale.** `src/world/SettlementGenerator.ts`
already calls `buildSettlement()` in `src/world/SettlementModelGenerator.ts`,
which is a genuine Voronoi/ward (`d3-delaunay`) + Chaikin-smoothed-road
model — the same class of algorithm Overworld Studio uses, not the
"independent concentric-ring" description in the older docs (that
description applies to `SettlementSpawner.ts`, which is confirmed unused by
`OverworldScene.ts` — a Studio-preview-only pure module).

What's actually live and causing the "odd" look:
1. **`snapBuildingTile()` in `SettlementGenerator.ts`** maps each ward
   building to a `WorldGrid` tile, and on a collision (water/overlap/OOB)
   searches outward up to `MAX_BUILDING_SNAP_RADIUS = 12` tiles; if nothing
   opens up, **the building is silently dropped** (`return null`, caller
   `continue`s). No telemetry on how often this happens — first task is to
   measure it. If drop rates are high, the ward model's intended density
   never reaches the ground, explaining sparse/off-balance layouts.
2. **Roads have no width hierarchy.** `rasterizeRoads()` Bresenham-rasters
   every road segment as a single grid tile (`T = 2` WU) wide, with no
   distinction between a main avenue and a back alley — unlike the design
   already captured (but unused in the live path) in
   `SettlementRoadMesh.ts`'s width-by-anchor-kind logic (2 WU main / 1 WU
   alley). Every street currently reads as a uniform thin dirt/cobble line.
3. **`SETTLEMENT_MODEL_SCALE = 0.095`** compresses the ward model's
   200-420-unit model space down to grid tiles; combined with (1)'s
   silent drops, the final built settlement may be considerably smaller/
   sparser than the model intended. Needs empirical measurement (how many
   wards' buildings actually place vs. get dropped, at each settlement
   size) before deciding whether to retune the scale, the snap radius, or
   both.

This reframes P1‑2 from "undesigned architecture" to "an existing,
architecturally-sound pipeline with concrete placement/rendering bugs" —
meaningfully smaller in scope than the TODO doc implies. The TODO doc
should be updated to reflect this once the fixes land (Task: update
`STUDIO-LIVE-PARITY.md` and `settlement-integration.md`).

### Scope explicitly excluded from this branch

- Full "connect Overworld Studio and live overworld into one generation
  pipeline" (`STUDIO-LIVE-PARITY.md`'s broader P0-P4 program) — P0 (realm/
  terrain) and P1(1) (settlement siting) are already done; P1(2) (building
  layout) is what Finding B fixes here. P1(3) (NPC population wiring),
  P3 (cave/glade unification), P4 (dungeon entrance parity) remain out of
  scope — they're independent, lower-urgency items per the existing
  sequencing doc and unrelated to what the user asked about this round.
- General "visual/structural polish" beyond what Findings A/B cover — too
  vague to scope; revisit after this branch if specific issues remain.

## Approach

One branch, two workstreams (same pattern as the just-merged ocean-
shoreline branch, which combined multiple related root-cause fixes):

**Workstream 1 — Building interior scale (small, high-confidence fix)**
- Change `cellSize: 1.0` → `2.0` in `buildingToDungeonPlan.ts`.
- Fix/clarify the stale comment on `InteriorGenerator.ts`'s footprint table.
- Adjust the `house`/`cottage`/`terraced` `backD <= 1` threshold so small
  buildings can still get a kitchen/bedroom split where reasonable.
- Modestly increase `PURPOSE_FURNITURE` counts to match the new floor area.
- Regression risk: physics bounds, staircase geometry, spawn positions all
  derive from `cellSize` already (via `BlueprintRenderer`/`SceneManager`),
  so this should be low-risk, but the existing `building-floors.spec.ts`
  e2e test and unit tests around `buildingToDungeonPlan.ts` need to keep
  passing, and a manual playtest should confirm no visual clipping.

**Workstream 2 — Settlement/road placement fixes**
- Add a debug counter/log for `snapBuildingTile()` drop rate; run a
  generation sweep (like RI-3's ford sweep) across several seeds/sizes to
  quantify the problem before choosing a fix (larger search radius,
  relaxed overlap padding, and/or retuned `SETTLEMENT_MODEL_SCALE` —
  decided from the data, not guessed).
- Give roads a width tier in `rasterizeRoads()`/tile rendering: reuse
  `SettlementRoadMesh.ts`'s anchor-kind width logic (main-road-adjacent
  wards wider than alleys) instead of a uniform 1-tile line.
- Update `STUDIO-LIVE-PARITY.md` and `settlement-integration.md` to reflect
  that P1(2) is substantially further along than previously recorded.

## Testing

- Unit tests for `buildingToDungeonPlan.ts` (existing suite) re-verified
  against the new `cellSize`.
- Unit tests for `SettlementGenerator.ts`'s snap/drop behavior (new,
  covering the measured drop-rate fix).
- Manual/Playwright playtest: enter a few different building sizes,
  confirm rooms read as spacious and proportioned like dungeon rooms; walk
  a village/town/city, confirm building density and road width read as
  intentional rather than sparse/uniform.
- Full regression suite run (same bar as prior branches: no new failures
  beyond the existing pre-existing/unrelated set).

## Open items for user review

- Workstream 2's exact fix (snap radius vs. overlap padding vs. model
  scale) is deliberately left to be decided from sweep data collected
  during implementation, not fixed numbers now — flagged here so it's not
  mistaken for an oversight.
- If, after these fixes, settlements still look meaningfully different
  from Studio's preview, that would indicate P1(2) needs the fuller design
  cycle after all — this branch's job is to close the concrete bugs found,
  not to guarantee full visual parity in one pass.
