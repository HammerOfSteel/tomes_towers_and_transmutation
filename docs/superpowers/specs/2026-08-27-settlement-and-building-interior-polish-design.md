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

What's actually live, and what a direct measurement confirmed (built a
throwaway harness: a fully flat/buildable 400×400 `WorldGrid`, ran
`planSettlement()` for village/town/city across seeds 1-20, compared
buildings placed vs. wards' requested rects):

1. **`snapBuildingTile()`'s silent-drop concern did not hold up.** On
   buildable (non-water, elevation ≥ 1) terrain, drop rate measured **0%**
   for all three settlement types across 20 seeds each, at both the
   current `MAX_BUILDING_SNAP_RADIUS = 12` and a much larger radius (20) —
   changing the radius made no difference, confirming placement isn't
   radius-starved. (An initial naive measurement showed a 6.9% "drop" for
   cities; it turned out to be a bug in the *measurement script*, not the
   generator — it counted `park`-ward plaza rects as "requested buildings"
   when `planSettlement()` correctly skips wards with no `WARD_TO_KIND`
   mapping, i.e. parks were never meant to become buildings. Corrected
   script: 0% for all types.) **Conclusion: this is not a real bug and is
   dropped from scope** — building density loss is not why settlements
   look sparse/odd, at least on the buildable terrain this harness models.
   Residual, unmeasured risk: real terrain has water/river tiles inside a
   settlement's zone that `applySettlementToGrid`'s flattening step
   doesn't reclaim, so live drop rates could be nonzero on rough seeds —
   the fix below adds a permanent regression test on the harness so this
   stays visible if it ever regresses, without spending further time
   chasing a currently-unconfirmed problem.

2. **`buildingHalfExtents()` uses the wrong size for anchor buildings —
   a confirmed, real correctness bug**, independent of placement success.
   It estimates each anchor building's overlap-avoidance half-extents from
   an ad-hoc `wardType === 'patriciate' ? 'large' : wardType === 'church'
   ? 'medium' : 'medium'` check that **ignores `WARD_TO_SIZE` entirely** —
   the same table `createSettlementBuildingDna()` actually uses to build
   the real DNA/mesh. E.g. an `inn` ward is `WARD_TO_SIZE.inn = 'large'`
   (7×5 footprint) but `buildingHalfExtents()` estimates it as `'medium'`
   (5×4), under-padding its clearance by roughly a full tile. This can let
   larger anchor buildings (inn, merchant, patriciate, gateward, farm,
   craftsmen, market — everything but patriciate/church) sit closer to
   their neighbors than their real mesh footprint allows, a plausible
   direct cause of the "looks odd" visual (buildings crowding/clipping),
   not just a cosmetic inconsistency. Verified via the same harness that
   fixing this (using `WARD_TO_SIZE[wardType] ?? 'medium'` directly) does
   not regress placement success (still 0%/0%/0% drop after correcting the
   measurement bug, same as before the fix).

3. **Roads have no width variation**, but not for the reason first
   assumed. `model.roads[]` (`SettlementModelGenerator.ts`) is a flat array
   of gate→hub arterials (one per city gate, 2-4 depending on settlement
   size) — there is no separate secondary/alley road network generated at
   all, so there's no natural "avenue vs. alley" data to key a width tier
   off (the `SettlementRoadMesh.ts`/`isMain = ri === 0` distinctions
   referenced by older docs belong to a *different*, unused spoke-road
   companion module with a different data shape — not applicable here).
   The real, simple issue: `rasterizeRoads()` marks a single Bresenham-line
   grid tile (`T = 2` WU) per road position, so even these primary
   arterial streets render as a 1-tile-wide dirt/cobble line — too thin to
   read as a real street. Fix: widen the rasterized swath uniformly (e.g.
   a perpendicular 3-tile band, ~6 WU), which is honest to what the data
   actually models (these are all primary streets) rather than inventing
   a hierarchy the generator doesn't have.

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
- Fix `buildingHalfExtents()` to use `WARD_TO_SIZE[wardType] ?? 'medium'`
  for anchor buildings (matching `createSettlementBuildingDna()`'s real
  sizing) instead of the current ad-hoc patriciate/church-only check.
- Add a permanent regression test (the flat-terrain harness described in
  Finding B) asserting 0% building-drop rate for village/town/city across
  a fixed seed range, so this stays visible if terrain-flattening
  interactions ever regress it.
- Widen `rasterizeRoads()`'s output from a single Bresenham tile to a
  perpendicular multi-tile swath (~3 tiles / 6 WU) so primary settlement
  streets read as real streets rather than 1-tile dirt lines.
- Update `STUDIO-LIVE-PARITY.md` and `settlement-integration.md` to
  reflect that P1(2) is substantially further along than previously
  recorded, and that the building-drop concern was investigated and found
  not to reproduce on buildable terrain.

## Testing

- Unit tests for `buildingToDungeonPlan.ts` (existing suite) re-verified
  against the new `cellSize`.
- New unit tests for `SettlementGenerator.ts`: `buildingHalfExtents()`
  sizing correctness, and the flat-terrain 0%-drop-rate regression guard.
- Manual/Playwright playtest: enter a few different building sizes,
  confirm rooms read as spacious and proportioned like dungeon rooms; walk
  a village/town/city, confirm road width reads as intentional rather than
  a thin uniform line.
- Full regression suite run (same bar as prior branches: no new failures
  beyond the existing pre-existing/unrelated set).

## Open items for user review

- Workstream 2's building-drop concern was measured and found not to
  reproduce on buildable terrain (see Finding B) — scoped down accordingly.
  If real playtesting surfaces sparse settlements on rough/water-adjacent
  terrain, that would need its own follow-up investigation.
- If, after these fixes, settlements still look meaningfully different
  from Studio's preview, that would indicate P1(2) needs the fuller design
  cycle after all — this branch's job is to close the concrete bugs found,
  not to guarantee full visual parity in one pass.
