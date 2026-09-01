# Settlement Placement Validation (Rivers/Lakes/Odd Heights) Design Note

Status: approved autonomously as part of the nature/terrain-polish backlog (wildlife
height fix → road sub-tile reuse → this → water/shoreline work). User confirmed the
overall order; proceeding without a full interactive brainstorm cycle given user
unavailability and prior "work autonomously" authorization — this is a well-scoped bug
fix backed by a completed research investigation, not a design with open creative
questions.

## 1. Problem

User feedback (with screenshot): "sometimes settlement buildings can be placed oddly
like on the other screenshot here, in a river or odd height (same for their settlements
roads)."

A background research agent investigated the full settlement placement pipeline
(`SettlementPlacer.ts` → `SettlementGenerator.ts`) and found four concrete gaps:

1. **Site selection only validates the CENTER tile for water**, never the settlement's
   actual footprint (a city's zone radius is 16 tiles / ~32 WU — the center tile being
   dry says nothing about whether a river cuts through the rest of the zone).
2. **Lakes are not excluded at all.** `_valid()` (buildings/roads) and `isValidTile()`
   (site centers) both check `cell.biome === 'ocean' | 'deep_ocean'` and
   `cell.feature === 'river'` — but `'lake'` is a distinct `TileFeature` value that
   neither check ever tests for. A lake tile currently passes every placement check.
3. **Elevation flattening only covers the inner 60% of the zone radius**
   (`innerR = zoneR * 0.60`), leaving the outer 40% (by radius — actually a much larger
   *fraction of the zone's area*, since area scales with r²) at whatever raw terrain
   elevation it already had. Buildings/roads placed in that unflattened outer ring can
   straddle a real elevation step.
4. **Rasterized road tiles are never validated against water at all** — `rasterizeRoads()`
   doesn't even receive the `WorldGrid` as a parameter, so a road can be painted directly
   onto a river/lake tile with zero check (unlike buildings, which at least go through
   `_valid()`'s per-tile check before being placed, even though that check has gap #2
   above).

## 2. Approach

Four independent, additive fixes — each reuses/extends existing infrastructure rather
than introducing a new placement architecture:

### 2a. Fix the lake gap + add a `waterDepth` safety net (both `_valid()` and `isValidTile()`)

Add a shared `isWaterCell()` helper (exported from `SettlementGenerator.ts`, imported by
`SettlementPlacer.ts`) checking `biome ocean/deep_ocean OR feature river/lake OR
waterDepth > 0` — a strict superset of both files' current checks, so no existing
passing test that relies on setting `biome: 'ocean'` (without also setting `waterDepth`,
which many hand-built test fixtures predate) can regress. The `waterDepth > 0` clause is
purely a defensive safety net for any future/edge-case water tile that isn't caught by
the biome/feature checks. `river_ford` tiles (`waterDepth === 0`, walkable by design)
correctly remain valid, unaffected by this change.

### 2b. Area-based site suitability check — attempted, reverted after empirical testing

**Status: NOT SHIPPED.** An initial implementation added `isSuitableArea(centerCol,
centerRow, zoneR)`, sampling a coarse sub-grid within the candidate's zone radius and
rejecting sites where more than `MAX_WATER_FRACTION = 8%` of sampled tiles were water,
wired into `placeSettlements()`'s existing candidate retry loop.

**Reverted after live testing against a real generated world (seed 1, worldSize 512)**:
this check caused `placeSettlements()` to drop 2 of 6 settlements outright (Pinekeep,
Woodbury — the latter purely as a cascading side effect of Pinekeep's rejection
shifting which sites were subsequently available/occupied). Investigating Pinekeep's
*actual* pre-fix building/road placement at its original site showed **zero buildings
or roads actually sitting on a water tile** — the per-tile checks in `_valid()`
(already fixed for the lake gap in §2a) were already correctly keeping buildings/roads
off water; Pinekeep's site was merely *near* a river (8.1% of its sampled zone,
barely over the threshold), which is a normal, often-desirable relationship for a
settlement to have with a water feature, not the reported bug. The area check was
rejecting sites for being near water, not for actually having anything ON water — a
real behavioral regression (a healthy settlement genuinely disappearing from world
generation) for a problem that doesn't clearly exist once §2a's lake-gap fix and §2d's
road filter are in place. Removed rather than kept and re-tuned blind — the 8%/15%
threshold space wasn't obviously going to separate "acceptably near water" from
"unacceptably overlapping water" without a lot more empirical iteration than this
pass's scope justifies. **If a similar report recurs after 2a/2c/2d ship, revisit with
a narrower core-radius check (matching the settlement's actual built-up footprint, not
its full outskirts `zoneR`) rather than reintroducing this exact whole-zone version.**

### 2c. Widen elevation flattening from 60% to 90% of zone radius

`innerR = Math.round(zoneR * 0.60)` → `Math.round(zoneR * 0.90)` in
`applySettlementToGrid()`. Since flattened AREA scales with `innerR²`, this is roughly a
2.25× increase in flattened footprint (0.9² / 0.6² = 2.25), while still leaving a ~10%
outer fringe unflattened for a natural falloff back to surrounding terrain rather than an
abrupt flat-plateau-to-raw-terrain cliff exactly at the zone boundary. Water/river tiles
remain excluded from flattening, unchanged (correctly — flattening a river would be a
new, different bug).

### 2d. Filter rasterized road tiles through the water check

`planSettlement()`'s `rasterizeRoads()` call site filters its returned tile list through
`!isWaterCell(grid.get(col, row))` before those tiles are ever painted as `feature:
'road'` onto the grid — the road-specific parallel to `_valid()`'s building check.
Deliberately a narrow, single-purpose filter (not a full `_valid()` call, which also
rejects bounds-edge/dungeon-entrance/low-elevation tiles that may be legitimately correct
for an existing road path to cross) — only water is being newly excluded here.

## 3. Why this combination and not something larger

- A full area-based site-rejection pass (§2b) was tried and reverted — see §2b for the
  empirical reasoning. The three shipped fixes (2a/2c/2d) target the CONCRETE gaps the
  investigation found (lake never checked, insufficient flattening radius, road tiles
  never checked at all) without introducing a new, unproven rejection heuristic.
- `applySettlementToGrid()`'s widened 90% flattening radius (§2c) is the main lever
  left for "odd height" — it doesn't touch water/river presence at all (that's §2a/2d's
  job), just elevation consistency across a much larger fraction of each settlement's
  footprint.

## 4. Non-goals

- No change to `SettlementModelGenerator.ts`'s internal ward/road layout algorithm.
- No settlement relocation/re-planning after the fact based on overall site quality
  (see §2b) — only the existing local snap-around-obstacles behavior remains.
- No change to how individual buildings/roads already snap around LOCAL obstacles
  within an otherwise-suitable site (existing `snapBuildingTile()`/`_noOverlap()` logic
  untouched).
- No change to `_isRampEligible`/ramp geometry or the ground sub-tile system (§2c only
  changes which LOGICAL elevation level tiles get set to, same mechanism as today).

## 5. Testing

- `isWaterCell()`: covers ocean/deep_ocean biome, river/lake feature, `waterDepth > 0`,
  and confirms dry/ford tiles are NOT flagged as water.
- `placeSettlements()`: an entirely-lake-covered grid drops every settlement (previously
  would have silently sited settlements on lake tiles, since lakes were never checked at
  the site-center level either).
- `applySettlementToGrid()`: a tile at radius 6 for a village (zoneR=8) — inside the new
  90% inner radius (7) but outside the old 60% radius (5) — now gets flattened; a lake
  tile inside the inner zone still keeps its own elevation (not flattened).
- `planSettlement()`: a road path crossing a river tile does not paint `feature: 'road'`
  onto that specific tile (verified via a plan-then-mutate-then-replan comparison, since
  `rasterizeRoads()`'s geometry is otherwise fully deterministic for a fixed seed).
- Full regression pass on `tests/levels/settlementGenerator.test.ts` (36 tests after
  this pass's additions) — in particular the existing "snaps a building off invalid
  terrain" test (which sets `biome: 'ocean'` without `waterDepth`) must keep passing
  under the new `isWaterCell()` superset check.
- `tests/scene/OverworldScene.settlement-parity.test.ts`'s hardcoded building/road/lamp
  count snapshot (seed 1, worldSize 512) was re-verified end-to-end: buildingGroups and
  roadPaths came out byte-identical to the pre-fix baseline (251/23), confirming no
  settlement was dropped or relocated by the shipped fixes; only lampGroups shifted
  slightly (140→129), an expected minor knock-on effect of the widened flattening radius
  changing a handful of buildable tiles. Updated (not loosened) accordingly.

