# Building Placement/Size Fix + Dungeon-Style Interior Wiring — Design

> Sub-project 1 of 2 (sub-project 2: swapping live NPC visuals to the
> princess-creator-based `NPCSpawner`/`buildNpc()` pipeline — separate,
> later spec).

## Context

Auditing `src/scene/OverworldScene.ts`, `src/world/SettlementGenerator.ts`,
`src/world/buildings/*`, and `src/main.ts` surfaced two independent,
long-standing integration gaps in the live overworld:

1. **Building placement/size**: settlement layouts place buildings at
   hardcoded fixed offsets, sized against a stale tile-footprint table
   (`BUILDING_SPECS[type].footprint`, in tiles) that has drifted out of
   sync with the *actual* rendered mesh size
   (`BuildingDNA.getFootprint(kind, size)`, in world units — kind-specific
   overrides for several building kinds ignore the size tier entirely,
   e.g. `cottage` always renders 9×7 WU regardless of its assigned "tiny"
   size). Some buildings render more than 2x larger than their planned
   plot, causing visual overlap with roads and neighbouring buildings.
2. **Building interiors**: `main.ts`'s `enterBuildingInterior()` already
   works (enter/exit/floor-switch all function), but it generates content
   via the older, bespoke `InteriorGenerator.generateInterior()` and
   overlays the result directly into the persistent overworld scene at a
   fixed Y offset, with custom floor-switch/exit functions
   (`_mountInterior`/`_unmountInterior`/`_switchBuildingFloor`/
   `leaveBuildingInterior`). A newer, better-suited system already exists:
   `buildingToDungeonPlan.ts` converts `BuildingDNA` into a dungeon-style
   `DungeonPlan` (one `Blueprint` per room, doors, staircases, **zero
   enemy spawns** — confirmed safe for peaceful house exploration), the
   same format real dungeons and the "greenhouse" special building already
   load via `sceneManager.loadDungeon()`. It's currently wired only into
   the Overworld Studio preview tool, not live gameplay.

Both are "connect the better system that already exists" integration
work, matching the pattern of every other slice in this session
(cave/glade, settlement boundary, dungeon site-metadata).

## Goals

- Building plots are sized/spaced to match each building's *actual*
  rendered footprint — no more overlap between buildings, or between
  buildings and roads.
- Entering any settlement building loads a dungeon-style, per-room
  interior (doors, staircases between floors, furniture) via the same
  `sceneManager.loadDungeon()` pipeline real dungeons use, replacing the
  bespoke overlay-mount system.
- No enemy encounters inside ordinary houses (buildingToDungeonPlan
  already guarantees this — `spawns: []` per room).
- Villages/towns/cities may become visually larger/more spread out as a
  side effect of correcting the footprint math — this is expected and
  accepted (confirmed with the user), not a bug to avoid.

## Non-goals

- Sub-project 2 (NPC visual pipeline swap) — separate spec, separate
  session.
- Adding combat/enemies inside buildings — explicitly out of scope;
  `buildingToDungeonPlan.ts`'s empty `spawns: []` is intentional and
  preserved.
- Redesigning building exterior meshes/art (`BuildingBuilder.ts`,
  `BuildingDNA.ts` kind overrides) — footprint *values* are corrected by
  reading the existing tables consistently, not by changing art/geometry.
- Retiring `InteriorGenerator.ts` entirely — `generatePlan()` (the room
  layout half) remains in active use by `buildingToDungeonPlan.ts`; only
  `generateInterior()`'s Three.js-mounting half (and its `main.ts`
  call site) is replaced.

## Design

### A. Footprint-aware settlement layout

**Single source of truth for footprint.** `BuildingTypes.ts` currently
hand-authors `BUILDING_SPECS[type].footprint` (tiles) independently of
`BuildingDNA.getFootprint(kind, size)` (world units, used for the actual
render). Consolidate:

- Move `KIND_MAP` (old `BuildingType` → `BuildingKind`) and `SIZE_MAP`
  (old `BuildingType` → `BuildingSize`) from `BuildingTypeMap.ts` into
  `BuildingTypes.ts`, co-located with `BuildingType`/`BUILDING_SPECS`
  (no circular import: `BuildingDNA.ts` has no dependency on
  `BuildingTypes.ts`, so `BuildingTypes.ts` can safely import
  `getFootprint`/`BuildingKind`/`BuildingSize` from it).
- Compute each `BUILDING_SPECS[type].footprint` as
  `[Math.ceil(getFootprint(KIND_MAP[type], SIZE_MAP[type]).w / T),
  Math.ceil(getFootprint(KIND_MAP[type], SIZE_MAP[type]).d / T)]`
  (T = 2 WU/tile, matching `OverworldScene.ts`'s tile scale) instead of
  hand-authored tile numbers.
- `BuildingTypeMap.ts` imports `KIND_MAP`/`SIZE_MAP` from
  `BuildingTypes.ts` instead of redefining them, so `createSettlementBuildingDna()`
  and the settlement planner always agree on kind/size per old-type.

**Footprint-aware placement cursor.** `SettlementGenerator.ts`'s
`_planVillage`/`_planTown`/`_planCity` currently place buildings at
hardcoded offsets (e.g. village corners at fixed `[±4, ±4]`, town street
buildings stepped every 4 tiles). Replace fixed offsets with a running
placement cursor per street/ring:

- Walk buildings along each street or ring in mix order, advancing the
  cursor by `previousHalfFootprint + gap + nextHalfFootprint` (using the
  now-correct `BUILDING_SPECS[type].footprint`) instead of a constant
  step — mirrors how `_noOverlap`'s AABB check already works, just
  applied proactively instead of reactively skip-on-conflict.
  Village "corner" plots become ring-packed around the centre using the
  same running-footprint logic instead of magic per-corner offsets.
- Widen roads/streets to match the widest building actually placed along
  them (a village/town street reserves lane width based on the tallest
  footprint depth in its mix, not a fixed 1-3 tile constant).
- `_valid()` and `_noOverlap()` keep their existing signatures/logic —
  they become correct automatically once footprint values are corrected
  and the cursor logic feeds them true adjacent positions.
- Net effect: settlements grow to fit real building sizes (confirmed
  acceptable). Population/building-count targets (`plan.population`) are
  unchanged; if a settlement tier's building mix doesn't fit within a
  reasonable grid bound, the existing "skip if `!_valid`/`!_noOverlap`"
  behavior degrades gracefully (fewer buildings placed) exactly as today.

### B. Dungeon-style building interiors

Replace the overlay-mount interior system with the dungeon-floor loader:

- On building-entry (`main.ts`'s per-frame `getNearestBuilding()` check),
  instead of calling `enterBuildingInterior(_nearBuilding.dna)`:
  1. Capture the player's current world position (mirrors
     `_activeDungeonEntrancePos` from the DI-3 fix).
  2. Call `buildingToDungeonPlan(dna.buildingKind, faction, dna.seed,
     dna.size, dna.floors)` to get a `DungeonPlan`.
  3. `overworld.exit()`, set `gameMode = 'interior'`, apply the existing
     interior fog (`new THREE.Fog(0x0a0a0f, 30, 60)`, matching dungeons/
     greenhouse), `sceneManager.loadDungeon(plan)`, teleport the player
     into the entrance room.
- Exit: reuse the generic `switchToExterior()` dungeon-exit path (already
  fixed in DI-3 to restore the entrance position) — no bespoke
  `leaveBuildingInterior()` needed. `SceneManager` already supports
  null-target "exit to world" doors and staircase floor transitions
  generically (same mechanics dungeons/greenhouse rely on), confirmed via
  code inspection — `buildingToDungeonPlan()`'s entrance room already
  emits exactly this door shape (`targetId: null` on the room-0 exterior
  door).
- Retire the building-interior-specific functions in `main.ts`:
  `_mountInterior`, `_unmountInterior`, `_switchBuildingFloor`,
  `leaveBuildingInterior`, `enterBuildingInterior`, and the
  `_activeInterior`/`_activeBuildingDna`/`_currentBuildingFloor`/
  `_buildingReturnPos`/`_inBuildingInterior`/`INTERIOR_Y` state tied to
  them, once the new call site is confirmed working end-to-end.
- `faction` needed by `buildingToDungeonPlan()`: derive from the owning
  settlement's existing faction data (already computed for the exterior
  `BuildingDNA` via `createSettlementBuildingDna`) — reuse rather than
  re-derive so exterior and interior visually agree in style/faction.

## Testing

- `tests/world/SettlementGenerator.test.ts` (new or extended): every
  placed building's AABB (using the corrected footprint) does not overlap
  any other placed building's AABB or any road tile, across several
  seeds/settlement types — a direct regression test for the bug being
  fixed.
- `tests/world/BuildingTypes.test.ts` or extend existing building tests:
  `BUILDING_SPECS[type].footprint` matches
  `getFootprint(KIND_MAP[type], SIZE_MAP[type])` converted to tiles, for
  every `BuildingType` — locks in the single-source-of-truth invariant.
- No dedicated automated test is planned for the interior swap itself
  (consistent with this session's established pattern — `enterBuildingInterior`/
  `switchToExterior`/`sceneManager.loadDungeon` are large DOM/THREE/game-loop
  integration points with no existing test harness); verified instead via
  manual `vite preview` smoke-check (enter a village cottage, confirm
  dungeon-style rooms load, walk through, exit, confirm player position
  restored) plus `tsc`/`vitest`/`vite build` full-suite checks after each
  change, per the session's standing verification protocol.

## Risks / open questions

- Reworking plot-placement algorithms for all three settlement tiers
  (village/town/city) is the largest single piece of work here; if the
  footprint-aware cursor produces layouts that look worse than intended
  for any tier, that tier's mix/pattern may need follow-up tuning as a
  fast-follow, not a blocker for this slice.
- `faction` plumbing for `buildingToDungeonPlan()` needs verifying against
  whatever the settlement-building exterior DNA path already uses
  (`createSettlementBuildingDna` currently doesn't take a `faction`
  parameter directly — needs a small compatible adapter, to be resolved
  during implementation).
