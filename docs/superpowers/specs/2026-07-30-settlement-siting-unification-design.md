# Settlement Siting Unification (P1, sub-project 1) — Design

> Part of the Studio↔live-game parity work. See
> `TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md` for the full audit
> and sequencing. This is the first of three sub-projects under P1
> (Settlement Unification): (1) siting — this doc, (2) building layout
> within a settlement, (3) NPC population. (2) and (3) are separate,
> future design cycles.

## Goal & scope

Today, `generateRealmData()` (`src/world/RealmGenerator.ts`, shared with
Overworld Studio since P0) already produces `RealmData.settlements:
RealmSettlement[]` — each with a realm position, name, size
(`village`/`town`/`city`), and faction. But the live game's
`buildWorldData()` discards this and calls `placeSettlements()`
(`src/world/SettlementPlacer.ts`), which runs its own, entirely
independent Poisson-disk placement algorithm with fixed min-distance
constants. As a result, a given seed produces different settlement
positions, counts, names, and factions in Studio's realm preview versus
the live overworld.

**In scope:** settlement *siting* only — where each settlement is
positioned, how many there are, and its name/type/faction, all now sourced
from `generateRealmData()`.

**Explicitly out of scope** (future sub-projects, unchanged by this work):
- Building layout within a settlement — `SettlementGenerator.ts`'s
  `planSettlement()`/`applySettlementToGrid()` (cross/street/boulevard
  patterns) keep running exactly as they do today, just invoked with a
  realm-derived center/type/name/seed instead of a Poisson-disk-derived
  one.
- NPC population — `OverworldScene.ts`'s radial-scatter spawner is
  untouched.
- Faction-driven behavior — `faction` is threaded through and persisted
  starting now, but nothing reads it for gameplay/visual purposes yet.
- Studio's Voronoi-ward system — that produces zone *labels*, not building
  instances, and is a separate, harder design problem tracked under
  sub-project (2).

## Architecture

`buildWorldGrid()`'s signature and return type are **unchanged** (an
invariant protected since P0 — it already regenerates and discards realm
data internally for terrain, and other callers depend on its existing
`WorldGrid` return shape).

Instead, `SettlementPlacer.ts` gets its own realm data by calling
`generateRealmData(seed, 96, 72, config.settlementCount)` directly — a
second, cheap, fully deterministic call with the same seed used for
terrain. This mirrors the pattern `buildWorldGrid()` already established
in P0 (independently regenerating realm data rather than threading it
through call signatures).

```
buildWorldData(seed, config)
  ├─ buildWorldGrid(seed, config)          // terrain (P0, unchanged)
  ├─ placeDungeons(grid, config, seed)      // unchanged, runs first
  └─ placeSettlements(grid, config, seed)   // THIS CHANGE:
       │
       ├─ generateRealmData(seed, 96, 72, config.settlementCount)
       │     └─► realm.settlements: RealmSettlement[] (x, y, name, size, faction)
       │
       ├─ for each realm settlement, in city → town → village priority order:
       │     ├─ map realm (x, y) → world-grid (col, row) using the same
       │     │    scale factor RealmToWorldGrid.ts uses for cells
       │     ├─ if tile is invalid (see snapping below), search outward in
       │     │    expanding rings for the nearest valid tile
       │     ├─ if a valid tile is found within the search radius, and it
       │     │    satisfies the min-distance constant for its type against
       │     │    already-placed settlements, place it there
       │     └─ else, drop this settlement (matches today's behavior when
       │          Poisson-disk placement can't find a candidate)
       │
       └─► SettlementPlan[] (center, type, name, faction, seed)
```

## Coordinate mapping & terrain-validity snapping

**Mapping:** realm `(x, y)` (0–96, 0–72 by default) → world-grid `(col,
row)` using `col = floor(x * worldSize / 96)`, `row = floor(y * worldSize
/ 72)` — the same scale-factor approach `RealmToWorldGrid.ts` uses for
resampling cells.

**Validity check** (reuses `SettlementPlacer.ts`'s existing eligibility
rules, applied to the mapped tile instead of a Poisson-disk candidate):
- Elevation in `[1, 2]`.
- Biome is `grass` or `forest`.
- Not water, not a river tile.
- Inside the habitable annulus: outside `2 × FR` (flat-zone radius) and
  inside `0.82 × GHW` (grid half-width) from grid center.
- Not already occupied by a dungeon (`placeDungeons()` still runs first,
  so dungeon tiles are known at this point).
- Not already occupied by a previously-placed settlement in this same
  pass.

**Snapping:** if the mapped tile fails validity, search outward in
expanding rings (8-directional, same nudge pattern `RealmGenerator.ts`
already uses for its own tower-placement search) up to a bounded max
radius. First valid tile found is used. If none is found within the max
radius, the settlement is dropped — the same graceful-degradation
behavior as today (Poisson-disk placement already silently skips a
settlement slot if it can't find a valid candidate).

**Min-distance enforcement:** after snapping, still enforce
`MIN_DIST_CITY=35` / `MIN_DIST_TOWN=22` / `MIN_DIST_VILLAGE=14` (unchanged
constants) against already-placed settlements, processed in city → town →
village priority order (unchanged from today). If a snapped position
violates min-distance, treat it the same as a failed snap (try to find
another nearby valid tile satisfying both terrain validity and
min-distance; if none exists within the search radius, drop the
settlement).

## Config & data model changes

**`WorldGenConfig`** (`src/world/WorldGenConfig.ts`): remove
`villageCount`, `townCount`, `hasCity`. Add `settlementCount: number`
(default **6**, matching Studio's own `generateRealmData()` default for
`nSettlements` — this replaces the old default sum of 3+1+1=5, since we're
unifying toward Studio's behavior as the source of truth). Settlement
*type* (village/town/city) is no longer user-configurable — it's assigned
by the realm algorithm based on `settlementCount` and seed, exactly as
Studio's preview already does.

**`src/ui/MainMenu.ts`** (lines ~769-791, ~922-927): the three
village-count/town-count/has-city controls collapse into a single
"Number of Settlements" slider bound to `config.settlementCount`.

**`SettlementEntry`/`SettlementPlan`** (`src/world/WorldData.ts`,
`src/world/SettlementGenerator.ts`): add a `faction: string` field,
populated from `realm.settlements[i].faction`. No save-file migration
needed — settlements aren't persisted beyond an ID (`DiscoveryTracker.ts`
tracks `discoveredSettlements: Set<number>`), so adding a field is fully
backward-compatible.

**Naming:** settlement `name` now comes from `realm.settlements[i].name`
(Studio's existing name generator, already part of `RealmSettlement`)
instead of `SettlementGenerator.ts`'s separate `generateSettlementName()`.
That function becomes dead code and is deleted. `name` is used only for
UI/narrative display and as a hash seed in `SettlementPopulator.ts` — never
a save key or lookup ID — so swapping the source is safe.

**Type mapping:** `realm.settlements[i].size` (`'village' | 'town' |
'city'`) maps 1:1 to the existing `SettlementType` values used throughout
`SettlementGenerator.ts` and `SettlementPlacer.ts` — no new type values
needed.

**Ordering preserved:** `placeDungeons()` continues to run before
`placeSettlements()` in `buildWorldData()`, so the snap algorithm correctly
sees dungeon tiles as already occupied.

## Data flow

```
generateRealmData(seed, 96, 72, config.settlementCount)
        │
        ▼
realm.settlements: RealmSettlement[] (x, y, name, size, faction)
        │
        ▼
map each to world-grid (col, row)  ──► invalid? ──► expanding-ring snap search
        │                                                    │
        │◄───────────────────────────────────────────────────
        ▼
validity + min-distance check (city → town → village priority)
        │
   valid & unique ──► SettlementPlan { center, type, name, faction, seed }
   else            ──► settlement dropped
        │
        ▼
planSettlement() / applySettlementToGrid()  (UNCHANGED — building layout,
                                              sub-project 2's concern)
        │
        ▼
SettlementEntry[] returned from buildWorldData() (unchanged shape + new faction field)
```

## Error handling / edge cases

- `config.settlementCount` of 0: `generateRealmData()` returns an empty
  `settlements` array; `placeSettlements()` returns an empty
  `SettlementEntry[]`, matching today's behavior when all three old count
  fields are 0.
- Snap search exhausts its max radius for every settlement (e.g. a
  degenerate seed with almost no valid land): settlements are dropped one
  by one; the world simply has fewer settlements than requested, same
  graceful degradation as today's Poisson-disk approach when it can't find
  enough valid candidates.
- Two realm settlements resample to the same world-grid tile (possible
  with small `worldSize` and many settlements, given lossy
  higher-resolution → lower-resolution mapping): the second one snaps
  outward via the same expanding-ring search used for invalid tiles.

## Testing

- **New `tests/world/SettlementPlacer.test.ts`** (no test file exists for
  this module today — confirmed): deterministic seed reproducibility;
  priority ordering (city placed/checked before town before village);
  snap-to-valid-tile behavior on a crafted grid where a realm settlement's
  raw mapped position is intentionally invalid (e.g. on water); dungeon
  and min-distance exclusion during snapping; drop-on-unsnappable
  fallback when no valid tile exists within search radius.
- **Existing `tests/levels/settlementGenerator.test.ts`** (building
  layout): unchanged — it takes a center/type/seed as input, which this
  change still provides, just from a different source. Re-run as a
  regression check.
- **`tests/world/WorldGenerator.test.ts`** (added in P0): extend with a
  case asserting `buildWorldData()`'s settlement count is at most
  `config.settlementCount` (allowing for snap-failure drops) and that
  settlement names/factions/types for a given seed match
  `generateRealmData(seed, 96, 72, config.settlementCount).settlements`
  (accounting for coordinate snapping — assert same name/faction/type per
  settlement index, not exact position).
- Full test suite + `tsc --noEmit` run at the end, same
  baseline-comparison approach as P0 (expect only the same 16 known
  pre-existing failures, no new regressions).

## Follow-ups (not this slice, tracked in STUDIO-LIVE-PARITY.md)

- P1 sub-project (2): building layout within a settlement — reconciling
  Studio's Voronoi-ward zone labels, the live game's current
  cross/street/boulevard patterns, and the unused concentric-ring
  algorithm in `SettlementSpawner.ts`. Genuinely unresolved architecture
  question, needs its own design cycle.
- P1 sub-project (3): NPC population unification — wiring up the unused
  `SettlementPopulator.ts` to retire `OverworldScene.ts`'s radial-scatter
  spawner.
- Faction-driven gameplay/visual behavior — `faction` is stored starting
  with this change but unused until a future phase.
