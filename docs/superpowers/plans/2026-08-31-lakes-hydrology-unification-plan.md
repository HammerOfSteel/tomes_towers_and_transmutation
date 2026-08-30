# Lakes + Hydrology Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Overworld Studio's Realm-tab river preview use the exact same algorithm as the
live game's river generator (instead of an unrelated probabilistic one), and add a real lake
feature that reuses the already-shipped river swim-collision machinery — while deleting the
now-fully-dead parts of `RealmRiverMesh.ts`.

**Architecture:** Extract `HydrologyGenerator.ts`'s existing source-selection and downhill-walk
logic into a new pure, grid-shape-agnostic module `src/world/RiverFlow.ts` (parameterized by
plain `elevationAt`/`isRiver` callbacks instead of a concrete `WorldGrid`), so both
`HydrologyGenerator.ts` (live, wraps `WorldGrid`) and `RealmGenerator.ts` (Studio preview, wraps
`RealmData.cells`) become thin wrappers around the identical algorithm. A parallel new pure
module `src/world/LakeSiting.ts` (local-minima source selection + flood-fill basin) backs a new
`src/world/LakeGenerator.ts` (`WorldGrid` wrapper, finally reads `config.lakeCount`) and a
parallel addition to `RealmGenerator.ts` for Studio's own lake preview. Lakes reuse the existing
`waterDepth`-driven carving/collision/swim-detection path built for rivers — no new physics
machinery. `RoadGenerator.ts` gets a lake-avoidance check mirroring the just-shipped
ocean-crossing fix.

**Tech Stack:** TypeScript, Vitest, existing `WorldGrid`/`RealmData` data model, no new runtime
dependencies.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-31-lakes-hydrology-unification-design.md`
  (approved 2026-08-31) — read this first; this plan implements it directly, terminology matches
  1:1.
- `HydrologyGenerator.ts`'s refactor into `RiverFlow.ts` must be **behavior-preserving** for the
  live path — every existing test in `tests/world/HydrologyGenerator.test.ts` must continue to
  pass unchanged.
- Lakes reuse `waterDepth > 0` for swim/collision detection (no changes to
  `WaterDetection.ts` or `TerrainGeometryBuilder.ts`'s carving math — only a new color branch).
- `RealmData.rivers`/`RealmData.lakes` are Studio-preview-only fields; the live path
  (`WorldGenerator.ts`) never reads them (confirmed via grep in the design spec) — no wiring
  needed between `generateRealmData()`'s river/lake counts and `config.riverCount`/`lakeCount`.
- No Studio UI sliders added for river/lake count (explicitly deferred, design spec §8).
- No bridges, no lake-to-lake channels, no variable lake depth (explicitly deferred, design spec
  §8).
- After each task: run the task's targeted test file(s), then `npx tsc --noEmit` and confirm the
  error count matches the pre-existing baseline (145 errors) or better — never worse. Full-suite
  regression run happens at the final task.

---

## File Structure

- **Create** `src/world/RiverFlow.ts` — pure `selectRiverSources()` + `flowDownhill()`, extracted
  from `HydrologyGenerator.ts`.
- **Create** `tests/world/RiverFlow.test.ts`.
- **Modify** `src/world/HydrologyGenerator.ts` — becomes a thin `WorldGrid` wrapper around
  `RiverFlow.ts`.
- **Create** `src/world/LakeSiting.ts` — pure `selectLakeSources()` + `floodFillBasin()`.
- **Create** `tests/world/LakeSiting.test.ts`.
- **Create** `src/world/LakeGenerator.ts` — `WorldGrid` wrapper, `generateLakes()`.
- **Create** `tests/world/LakeGenerator.test.ts`.
- **Modify** `src/world/WorldGrid.ts` — add `'lake'` to `TileFeature`.
- **Modify** `tests/world/WorldGrid.test.ts` — cover the new value.
- **Modify** `src/world/WaterDepthConfig.ts` — add `LAKE_DEPTH_WU`.
- **Modify** `src/world/WorldGenerator.ts` — call `generateLakes()` after `generateHydrology()`.
- **Modify** `src/world/RoadGenerator.ts` — lake-avoidance in `_moveCost` + `_pathCrossesWater`.
- **Modify** `tests/world/RoadGenerator.test.ts` — 3 new lake-avoidance tests mirroring the
  ocean-crossing ones.
- **Modify** `src/world/TerrainGeometryBuilder.ts` — new `BIOME_LAKE` color branch.
- **Modify** `tests/world/TerrainGeometryBuilder.test.ts` — lake carving/color test.
- **Modify** `src/world/ResourceNodePlacer.ts` — add `feature === 'lake'` to essence-blossom
  siting check.
- **Modify** `src/scene/OverworldScene.ts` (~line 2739) — add `feature === 'lake'` to the
  near-water narration check.
- **Create** `src/world/HeightSampler.ts` — relocated `RiverHeightSampler` type.
- **Modify** `src/world/SettlementSpawner.ts`, `src/world/SettlementRoadMesh.ts` — import
  `RiverHeightSampler` from `HeightSampler.ts` instead of `RealmRiverMesh.ts`.
- **Delete** `src/world/RealmRiverMesh.ts`, `tests/world/RealmRiverMesh.test.ts`.
- **Modify** `src/world/RealmGenerator.ts` — replace inline river block with
  `RiverFlow.ts` calls; add a new lake-generation block calling `LakeSiting.ts`; add `lakes:
  RealmLake[]` to output.
- **Modify** `src/overworld-studio.ts` — add `RealmLake` interface + `lakes` field to
  `RealmData`; add lake-drawing canvas block in the Realm-tab preview.
- **Modify** `tests/world/RealmGenerator.test.ts` — update river assertions for the new
  grid-based shape, add lake assertions.

---

## Task 1: Extract `RiverFlow.ts` from `HydrologyGenerator.ts`

**Files:**
- Create: `src/world/RiverFlow.ts`
- Test: `tests/world/RiverFlow.test.ts`
- Modify: `src/world/HydrologyGenerator.ts`

**Interfaces:**
- Produces: `selectRiverSources(width, height, elevationAt, sourceMinLevel, sourceMinRadius,
  sourceMinSpacing, count, rand) => {col,row}[]` and `flowDownhill(source, width, height,
  elevationAt, isRiver, terminateRadius, maxSteps?) => {col,row}[]`, both exported from
  `src/world/RiverFlow.ts`. Later tasks (`RealmGenerator.ts`) import these directly.

- [ ] **Step 1: Write failing tests for `flowDownhill()`**

Create `tests/world/RiverFlow.test.ts`. Cover: (a) walks toward lower elevation (score =
`elevation*100 + distToCenter*0.5`, picks lowest score among 4 orthogonal neighbors), (b)
terminates once within `terminateRadius` of grid center, (c) terminates when the current tile's
elevation is 0, (d) never re-visits a tile or steps onto a tile where `isRiver()` returns true,
(e) respects a `maxSteps` cap (pass a tiny cap like 3 and assert path length <= 4), (f) stops
early (returns just `[source]`) if all neighbors are out of bounds or already visited/river.
Build small hand-crafted elevation grids (e.g. a 5x5 array) for each case — do not depend on
`WorldGrid`.

```ts
import { describe, it, expect } from 'vitest';
import { flowDownhill, selectRiverSources } from '@/world/RiverFlow';

describe('flowDownhill', () => {
  it('walks toward the lowest-scoring neighbor', () => {
    // 3x3 grid, elevations descending toward (2,1); center at (1,1) so
    // terminateRadius=0 never triggers early.
    const elev = [
      [5, 5, 5],
      [5, 4, 1],
      [5, 5, 5],
    ];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const path = flowDownhill({ col: 1, row: 1 }, 3, 3, elevationAt, () => false, 0, 10);
    expect(path[0]).toEqual({ col: 1, row: 1 });
    expect(path[path.length - 1]).toEqual({ col: 2, row: 1 });
  });

  it('terminates once within terminateRadius of grid center', () => {
    const elevationAt = () => 5; // flat — would otherwise run to maxSteps
    const path = flowDownhill({ col: 0, row: 2 }, 5, 5, elevationAt, () => false, 3, 50);
    expect(path.length).toBeLessThan(50);
  });

  it('terminates when current elevation is 0', () => {
    const elev = [[0, 3], [3, 3]];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const path = flowDownhill({ col: 0, row: 0 }, 2, 2, elevationAt, () => false, 0, 10);
    expect(path).toEqual([{ col: 0, row: 0 }]);
  });

  it('never steps onto an isRiver tile', () => {
    const elev = [[5, 4], [4, 3]];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const isRiver = (c: number, r: number) => c === 1 && r === 0; // block the (1,0) neighbor
    const path = flowDownhill({ col: 0, row: 0 }, 2, 2, elevationAt, isRiver, 0, 10);
    expect(path.some(p => p.col === 1 && p.row === 0)).toBe(false);
  });

  it('respects the maxSteps cap', () => {
    const elevationAt = () => 5; // flat, no natural termination
    const path = flowDownhill({ col: 0, row: 0 }, 20, 20, elevationAt, () => false, 0, 3);
    expect(path.length).toBeLessThanOrEqual(4); // source + up to 3 steps
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail** (module doesn't exist yet)

```bash
npx vitest run tests/world/RiverFlow.test.ts
```

- [ ] **Step 3: Implement `flowDownhill()` in `src/world/RiverFlow.ts`**

Copy `HydrologyGenerator.ts`'s existing `_flowDownhill` body verbatim, renaming parameters to
the new signature (no `WorldGrid` — replace `grid.get(col,row).elevation` with
`elevationAt(col,row)`, replace `cell.feature === 'river'` with `isRiver(nc,nr)`). Keep the exact
same 4-directional neighbor set, scoring formula, and termination checks. Add a `maxSteps =
512` default parameter.

```ts
/**
 * RiverFlow — pure, grid-shape-agnostic river source-selection and
 * downhill-walk algorithm, shared by `HydrologyGenerator.ts` (live,
 * wraps WorldGrid) and `RealmGenerator.ts` (Studio preview, wraps
 * RealmData.cells). See docs/superpowers/specs/2026-08-31-lakes-hydrology-unification-design.md §2.
 */

export interface RiverFlowSource { col: number; row: number; }

const DEFAULT_MAX_STEPS = 512;

export function flowDownhill(
  source: RiverFlowSource,
  width: number, height: number,
  elevationAt: (col: number, row: number) => number,
  isRiver: (col: number, row: number) => boolean,
  terminateRadius: number,
  maxSteps: number = DEFAULT_MAX_STEPS,
): RiverFlowSource[] {
  const GHW = (width - 1) / 2;
  const GHH = (height - 1) / 2;
  const visited = new Set<number>();
  const path: RiverFlowSource[] = [source];
  visited.add(source.row * width + source.col);

  let current = source;

  for (let step = 0; step < maxSteps; step++) {
    const { col, row } = current;
    const dc = col - GHW, dr = row - GHH;
    const tR = Math.sqrt(dc * dc + dr * dr);

    if (tR < terminateRadius) break;
    if (elevationAt(col, row) === 0) break;

    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
    const neighbours: { col: number; row: number; score: number }[] = [];

    for (const [dc2, dr2] of DIRS) {
      const nc = col + dc2;
      const nr = row + dr2;
      if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;
      if (visited.has(nr * width + nc)) continue;
      if (isRiver(nc, nr)) continue;

      const distToCenter = Math.sqrt((nc - GHW) ** 2 + (nr - GHH) ** 2);
      neighbours.push({
        col: nc, row: nr,
        score: elevationAt(nc, nr) * 100 + distToCenter * 0.5,
      });
    }

    if (neighbours.length === 0) break;

    neighbours.sort((a, b) => a.score - b.score);
    const next = neighbours[0]!;

    path.push({ col: next.col, row: next.row });
    visited.add(next.row * width + next.col);
    current = next;
  }

  return path;
}
```

- [ ] **Step 4: Run the tests, confirm `flowDownhill` tests pass**

```bash
npx vitest run tests/world/RiverFlow.test.ts
```

- [ ] **Step 5: Write failing tests for `selectRiverSources()`**

Add to `tests/world/RiverFlow.test.ts`: (a) only returns tiles at/above `sourceMinLevel` and
at/beyond `sourceMinRadius` from center, (b) respects `count` (never returns more), (c) enforces
`sourceMinSpacing` between chosen sources, (d) returns `[]` if no candidates qualify, (e) is
deterministic for a fixed `rand` sequence (pass a seeded `mulberry32`-style deterministic
function or a simple linear-congruential stub and assert the exact output for a tiny fixed
grid).

```ts
describe('selectRiverSources', () => {
  const flatHighRim = (w: number, h: number) => (c: number, r: number) => {
    const ghw = (w - 1) / 2, ghh = (h - 1) / 2;
    const dist = Math.sqrt((c - ghw) ** 2 + (r - ghh) ** 2);
    return dist > ghw * 0.7 ? 5 : 1; // rim is high, interior is low
  };

  it('only returns tiles meeting min level and min radius', () => {
    const elevationAt = flatHighRim(11, 11);
    const rand = () => 0.5;
    const sources = selectRiverSources(11, 11, elevationAt, 3, 3, 0, 10, rand);
    for (const s of sources) {
      expect(elevationAt(s.col, s.row)).toBeGreaterThanOrEqual(3);
    }
  });

  it('never returns more than count', () => {
    const elevationAt = flatHighRim(21, 21);
    const rand = () => 0.5;
    const sources = selectRiverSources(21, 21, elevationAt, 3, 3, 0, 2, rand);
    expect(sources.length).toBeLessThanOrEqual(2);
  });

  it('enforces minimum spacing between chosen sources', () => {
    const elevationAt = flatHighRim(21, 21);
    const rand = () => 0.5;
    const sources = selectRiverSources(21, 21, elevationAt, 3, 3, 5, 10, rand);
    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const d = Math.hypot(sources[i]!.col - sources[j]!.col, sources[i]!.row - sources[j]!.row);
        expect(d).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('returns empty array when no candidates qualify', () => {
    const elevationAt = () => 0;
    const sources = selectRiverSources(5, 5, elevationAt, 3, 0, 0, 5, () => 0.5);
    expect(sources).toEqual([]);
  });
});
```

- [ ] **Step 6: Run, confirm failure**

- [ ] **Step 7: Implement `selectRiverSources()` in `src/world/RiverFlow.ts`**

Copy `HydrologyGenerator.ts`'s existing candidate-collection + Fisher-Yates shuffle + spacing
loop verbatim, parameterized:

```ts
export function selectRiverSources(
  width: number, height: number,
  elevationAt: (col: number, row: number) => number,
  sourceMinLevel: number,
  sourceMinRadius: number,
  sourceMinSpacing: number,
  count: number,
  rand: () => number,
): RiverFlowSource[] {
  const GHW = (width - 1) / 2;
  const GHH = (height - 1) / 2;

  const candidates: RiverFlowSource[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const dc = col - GHW, dr = row - GHH;
      const tR = Math.sqrt(dc * dc + dr * dr);
      if (tR >= sourceMinRadius && elevationAt(col, row) >= sourceMinLevel) {
        candidates.push({ col, row });
      }
    }
  }

  if (candidates.length === 0) return [];

  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = tmp;
  }

  const chosen: RiverFlowSource[] = [];
  for (const s of candidates) {
    if (chosen.length >= count) break;
    const tooClose = chosen.some(c => Math.hypot(c.col - s.col, c.row - s.row) < sourceMinSpacing);
    if (!tooClose) chosen.push(s);
  }

  return chosen;
}
```

- [ ] **Step 8: Run the tests, confirm all `RiverFlow.test.ts` tests pass**

```bash
npx vitest run tests/world/RiverFlow.test.ts
```

- [ ] **Step 9: Refactor `HydrologyGenerator.ts` to delegate to `RiverFlow.ts`**

Replace the inline candidate-collection/shuffle/spacing block and `_flowDownhill` function with
calls to `selectRiverSources()`/`flowDownhill()`, building `elevationAt`/`isRiver` closures
around `grid.get(...)`. Keep `_markRiverPath` unchanged (still `WorldGrid`-specific). The public
`generateHydrology(grid, config, seed)` signature and all constants (`FLAT_MARGIN`,
`SOURCE_MIN_FRAC`, `SOURCE_MIN_SPACING_FRAC`, `MAX_STEPS`, `RIVER_SOURCE_MIN_LEVEL`) stay
exactly as they are today — this is a pure internal refactor.

```ts
import { selectRiverSources, flowDownhill } from './RiverFlow';
// ... (existing imports/constants unchanged)

export function generateHydrology(grid: WorldGrid, config: WorldGenConfig, seed: number): void {
  const rand = mulberry32(seed ^ 0x77_A1_F0_3C);
  const GW = grid.width, GH = grid.height;
  const GHW = (GW - 1) / 2, GHH = (GH - 1) / 2;
  const FR = Math.round(GHW * 0.28);
  const terminateR = FR * FLAT_MARGIN;
  const sourceMinR = GHW * SOURCE_MIN_FRAC;
  const minSpacing = GW * SOURCE_MIN_SPACING_FRAC;

  const elevationAt = (col: number, row: number) => grid.get(col, row).elevation;
  const isRiver = (col: number, row: number) => grid.get(col, row).feature === 'river';

  const chosen = selectRiverSources(
    GW, GH, elevationAt, RIVER_SOURCE_MIN_LEVEL, sourceMinR, minSpacing, config.riverCount, rand,
  );

  for (const source of chosen) {
    const path = flowDownhill(source, GW, GH, elevationAt, isRiver, terminateR, MAX_STEPS);
    _markRiverPath(grid, path, GW, GH);
  }
}
```

Remove the now-unused `_flowDownhill` function and its parameters entirely.

- [ ] **Step 10: Run the full `HydrologyGenerator.test.ts` suite, confirm it passes unchanged**

```bash
npx vitest run tests/world/HydrologyGenerator.test.ts
```

If any test fails, the refactor introduced a behavior change — diff the extracted logic against
the original line-by-line before proceeding; do not alter test expectations to paper over a
behavior change.

- [ ] **Step 11: Run `npx tsc --noEmit`, confirm error count is 145 or fewer**

- [ ] **Step 12: Commit**

```bash
git add src/world/RiverFlow.ts tests/world/RiverFlow.test.ts src/world/HydrologyGenerator.ts
git commit -m "refactor: extract RiverFlow.ts pure downhill-flow algorithm from HydrologyGenerator"
```

---

## Task 2: Create `LakeSiting.ts`

**Files:**
- Create: `src/world/LakeSiting.ts`
- Test: `tests/world/LakeSiting.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (fully independent pure module).
- Produces: `selectLakeSources(width, height, elevationAt, isBlocked, minSpacing, count, rand) =>
  {col,row}[]` and `floodFillBasin(source, width, height, elevationAt, isBlocked, maxSize) =>
  {col,row}[]`, both exported from `src/world/LakeSiting.ts`. Task 3 (`LakeGenerator.ts`) and
  Task 9 (`RealmGenerator.ts`) import these directly.

- [ ] **Step 1: Write failing tests for `floodFillBasin()`**

Cover: (a) fills a same-elevation connected region and stops at elevation changes, (b) respects
`isBlocked` (won't cross into a blocked tile even at the same elevation), (c) respects `maxSize`
cap, (d) a single isolated tile (all neighbors different elevation) returns just that one tile,
(e) doesn't step out of grid bounds.

```ts
import { describe, it, expect } from 'vitest';
import { floodFillBasin, selectLakeSources } from '@/world/LakeSiting';

describe('floodFillBasin', () => {
  it('fills a connected same-elevation region', () => {
    const elev = [
      [3, 2, 2, 3],
      [3, 2, 2, 3],
      [3, 3, 3, 3],
    ];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const basin = floodFillBasin({ col: 1, row: 0 }, 4, 3, elevationAt, () => false, 100);
    const keys = new Set(basin.map(p => `${p.col},${p.row}`));
    expect(keys).toEqual(new Set(['1,0', '2,0', '1,1', '2,1']));
  });

  it('does not cross into a blocked tile', () => {
    const elevationAt = () => 2;
    const isBlocked = (c: number, r: number) => c === 2;
    const basin = floodFillBasin({ col: 0, row: 0 }, 4, 1, elevationAt, isBlocked, 100);
    expect(basin.some(p => p.col === 2)).toBe(false);
    expect(basin.some(p => p.col === 3)).toBe(false); // unreachable past the block
  });

  it('respects maxSize', () => {
    const elevationAt = () => 2; // fully flat 10x10 — would fill 100 tiles unbounded
    const basin = floodFillBasin({ col: 5, row: 5 }, 10, 10, elevationAt, () => false, 5);
    expect(basin.length).toBeLessThanOrEqual(5);
  });

  it('returns a single tile when fully isolated', () => {
    const elev = [[1, 9], [9, 9]];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const basin = floodFillBasin({ col: 0, row: 0 }, 2, 2, elevationAt, () => false, 100);
    expect(basin).toEqual([{ col: 0, row: 0 }]);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement `floodFillBasin()`**

```ts
/**
 * LakeSiting — pure local-minima source selection + flood-fill basin
 * algorithm for lakes. See
 * docs/superpowers/specs/2026-08-31-lakes-hydrology-unification-design.md §3.
 */

export interface LakeSite { col: number; row: number; }

export function floodFillBasin(
  source: LakeSite,
  width: number, height: number,
  elevationAt: (col: number, row: number) => number,
  isBlocked: (col: number, row: number) => boolean,
  maxSize: number,
): LakeSite[] {
  const level = elevationAt(source.col, source.row);
  const visited = new Set<number>([source.row * width + source.col]);
  const basin: LakeSite[] = [source];
  const queue: LakeSite[] = [source];
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

  while (queue.length > 0 && basin.length < maxSize) {
    const { col, row } = queue.shift()!;
    for (const [dc, dr] of DIRS) {
      const nc = col + dc, nr = row + dr;
      if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;
      const key = nr * width + nc;
      if (visited.has(key)) continue;
      visited.add(key);
      if (isBlocked(nc, nr)) continue;
      if (elevationAt(nc, nr) !== level) continue;
      basin.push({ col: nc, row: nr });
      queue.push({ col: nc, row: nr });
      if (basin.length >= maxSize) break;
    }
  }

  return basin;
}
```

- [ ] **Step 4: Run, confirm `floodFillBasin` tests pass**

- [ ] **Step 5: Write failing tests for `selectLakeSources()`**

Cover: (a) only returns local minima (every neighbor has elevation >= the candidate's), (b)
respects `isBlocked` (a blocked tile is never a candidate), (c) respects `count`, (d) enforces
`minSpacing`, (e) deterministic given a fixed `rand`.

```ts
describe('selectLakeSources', () => {
  it('only returns local minima', () => {
    const elev = [
      [5, 5, 5],
      [5, 1, 5],
      [5, 5, 5],
    ];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const sources = selectLakeSources(3, 3, elevationAt, () => false, 0, 5, () => 0.5);
    expect(sources).toEqual([{ col: 1, row: 1 }]);
  });

  it('excludes blocked tiles even if a local minimum', () => {
    const elev = [[5, 5], [5, 1]];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const isBlocked = (c: number, r: number) => c === 1 && r === 1;
    const sources = selectLakeSources(2, 2, elevationAt, isBlocked, 0, 5, () => 0.5);
    expect(sources).toEqual([]);
  });

  it('respects count and minSpacing', () => {
    const elev = [
      [1, 5, 5, 5, 1],
      [5, 5, 5, 5, 5],
    ];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const sources = selectLakeSources(5, 2, elevationAt, () => false, 3, 5, () => 0.5);
    expect(sources.length).toBeLessThanOrEqual(2);
    if (sources.length === 2) {
      const d = Math.hypot(sources[0]!.col - sources[1]!.col, sources[0]!.row - sources[1]!.row);
      expect(d).toBeGreaterThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 6: Run, confirm failure**

- [ ] **Step 7: Implement `selectLakeSources()`**

A tile is a local-minimum candidate if it is not blocked and every one of its up-to-8 neighbors
(orthogonal + diagonal) has elevation `>=` its own (edge/corner tiles simply have fewer
neighbors to check — this is not a special case, just fewer iterations). Then Fisher-Yates
shuffle + greedy spacing selection, identical pattern to `selectRiverSources()`.

```ts
export function selectLakeSources(
  width: number, height: number,
  elevationAt: (col: number, row: number) => number,
  isBlocked: (col: number, row: number) => boolean,
  minSpacing: number,
  count: number,
  rand: () => number,
): LakeSite[] {
  const DIRS8 = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ] as const;

  const candidates: LakeSite[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (isBlocked(col, row)) continue;
      const level = elevationAt(col, row);
      let isMinimum = true;
      for (const [dc, dr] of DIRS8) {
        const nc = col + dc, nr = row + dr;
        if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;
        if (elevationAt(nc, nr) < level) { isMinimum = false; break; }
      }
      if (isMinimum) candidates.push({ col, row });
    }
  }

  if (candidates.length === 0) return [];

  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = tmp;
  }

  const chosen: LakeSite[] = [];
  for (const s of candidates) {
    if (chosen.length >= count) break;
    const tooClose = chosen.some(c => Math.hypot(c.col - s.col, c.row - s.row) < minSpacing);
    if (!tooClose) chosen.push(s);
  }

  return chosen;
}
```

- [ ] **Step 8: Run the full `LakeSiting.test.ts` suite, confirm all pass**

```bash
npx vitest run tests/world/LakeSiting.test.ts
```

- [ ] **Step 9: Run `npx tsc --noEmit`, confirm baseline**

- [ ] **Step 10: Commit**

```bash
git add src/world/LakeSiting.ts tests/world/LakeSiting.test.ts
git commit -m "feat: add pure LakeSiting local-minima + flood-fill algorithm"
```

---

## Task 3: Add `'lake'` feature + `LAKE_DEPTH_WU` + `LakeGenerator.ts`

**Files:**
- Modify: `src/world/WorldGrid.ts`
- Modify: `tests/world/WorldGrid.test.ts`
- Modify: `src/world/WaterDepthConfig.ts`
- Create: `src/world/LakeGenerator.ts`
- Test: `tests/world/LakeGenerator.test.ts`

**Interfaces:**
- Consumes: `selectLakeSources`/`floodFillBasin` from Task 2's `src/world/LakeSiting.ts`.
- Produces: `generateLakes(grid: WorldGrid, config: WorldGenConfig, seed: number): void`, called
  by Task 4's `WorldGenerator.ts`.

- [ ] **Step 1: Add `'lake'` to `TileFeature` and write the failing test**

In `tests/world/WorldGrid.test.ts`, add a test asserting a cell can be set with `feature:
'lake'` and it round-trips through `grid.get()`.

- [ ] **Step 2: Run, confirm failure** (type error / assertion failure)

- [ ] **Step 3: Add `'lake'` to the `TileFeature` union in `WorldGrid.ts`**

```ts
export type TileFeature =
  | 'none' | 'river' | 'river_bank' | 'river_ford' | 'lake' | 'road' | 'road_dirt';
```

- [ ] **Step 4: Run `tests/world/WorldGrid.test.ts`, confirm pass**

- [ ] **Step 5: Write a failing test for `LAKE_DEPTH_WU`**

In a new or existing `tests/world/WaterDepthConfig.test.ts` (check if one exists first; if so
extend it, else create it), assert `LAKE_DEPTH_WU` is exported, is a positive number, and equals
`RIVER_DEPTH_WU` (per the design spec's "numerically the same, separately named" decision).

- [ ] **Step 6: Run, confirm failure**

- [ ] **Step 7: Add `LAKE_DEPTH_WU` to `WaterDepthConfig.ts`**

```ts
/**
 * Lake standing depth — numerically the same as RIVER_DEPTH_WU today (both
 * need to reliably trigger real swim state, see the reasoning above), kept
 * as its own named constant so a future re-tuning of one doesn't silently
 * affect the other.
 */
export const LAKE_DEPTH_WU = 2.0;
```

- [ ] **Step 8: Run, confirm pass. Run `npx tsc --noEmit`, confirm baseline**

- [ ] **Step 9: Write failing tests for `generateLakes()`**

Create `tests/world/LakeGenerator.test.ts`. Use a real small `WorldGrid` (e.g. 21x21) with hand-
set elevations to guarantee at least one clear local minimum away from center. Cover: (a) places
approximately `config.lakeCount` lakes (allow fewer if candidates are scarce — assert `<=
lakeCount` and `>= 1` for a grid engineered to have enough minima), (b) every lake tile has
`feature: 'lake'`, `walkable: false`, `waterDepth: LAKE_DEPTH_WU`, (c) neighbors of lake tiles
that were `'none'` become `'river_bank'`, (d) does not overlap tiles already marked `'river'`
(pre-seed one river tile at what would otherwise be a lake candidate and confirm it's skipped),
(e) is deterministic for a fixed seed (two calls with the same seed produce identical lake
tile sets).

```ts
import { describe, it, expect } from 'vitest';
import { WorldGrid } from '@/world/WorldGrid';
import { generateLakes } from '@/world/LakeGenerator';
import { LAKE_DEPTH_WU } from '@/world/WaterDepthConfig';
import type { WorldGenConfig } from '@/world/WorldGenConfig';

function makeGridWithBasin(size = 21): WorldGrid {
  const grid = new WorldGrid(size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const dc = col - (size - 1) / 2, dr = row - (size - 1) / 2;
      const isBasin = Math.abs(dc) < 2 && Math.abs(dr) < 2;
      grid.set(col, row, { elevation: isBasin ? 1 : 4 });
    }
  }
  return grid;
}

describe('generateLakes', () => {
  it('places at most config.lakeCount lakes with correct tile data', () => {
    const grid = makeGridWithBasin();
    const config = { lakeCount: 1 } as WorldGenConfig;
    generateLakes(grid, config, 12345);
    let lakeTiles = 0;
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const c = grid.get(col, row);
        if (c.feature === 'lake') {
          lakeTiles++;
          expect(c.walkable).toBe(false);
          expect(c.waterDepth).toBe(LAKE_DEPTH_WU);
        }
      }
    }
    expect(lakeTiles).toBeGreaterThan(0);
  });

  it('does not overlap a pre-existing river tile', () => {
    const grid = makeGridWithBasin();
    grid.set(10, 10, { feature: 'river', waterDepth: 2.0, walkable: false });
    const config = { lakeCount: 1 } as WorldGenConfig;
    generateLakes(grid, config, 12345);
    expect(grid.get(10, 10).feature).toBe('river'); // unchanged, not overwritten
  });

  it('is deterministic for a fixed seed', () => {
    const gridA = makeGridWithBasin();
    const gridB = makeGridWithBasin();
    const config = { lakeCount: 1 } as WorldGenConfig;
    generateLakes(gridA, config, 999);
    generateLakes(gridB, config, 999);
    for (let row = 0; row < gridA.height; row++) {
      for (let col = 0; col < gridA.width; col++) {
        expect(gridA.get(col, row).feature).toBe(gridB.get(col, row).feature);
      }
    }
  });
});
```

- [ ] **Step 10: Run, confirm failure** (module doesn't exist)

- [ ] **Step 11: Implement `src/world/LakeGenerator.ts`**

```ts
/**
 * LakeGenerator — carves lakes into a WorldGrid, reusing the river
 * swim-collision machinery (waterDepth-driven carving/collision/swim
 * detection — see WaterDepthConfig.ts and TerrainGeometryBuilder.ts).
 * See docs/superpowers/specs/2026-08-31-lakes-hydrology-unification-design.md §3.
 */

import { WorldGrid } from './WorldGrid';
import type { WorldGenConfig } from './WorldGenConfig';
import { mulberry32 } from '@/core/prng';
import { LAKE_DEPTH_WU } from './WaterDepthConfig';
import { selectLakeSources, floodFillBasin } from './LakeSiting';

const LAKE_MIN_SPACING_FRAC = 0.15; // fraction of grid width, mirrors river source spacing
const LAKE_MAX_SIZE = 40;           // tile budget per lake — reads as a pond, not a sea

export function generateLakes(grid: WorldGrid, config: WorldGenConfig, seed: number): void {
  const rand = mulberry32(seed ^ 0x4C_41_4B_45); // 'LAKE' in hex, distinct stream from rivers
  const GW = grid.width, GH = grid.height;
  const minSpacing = GW * LAKE_MIN_SPACING_FRAC;

  const elevationAt = (col: number, row: number) => grid.get(col, row).elevation;
  const isBlocked = (col: number, row: number) => grid.get(col, row).feature !== 'none';

  const sources = selectLakeSources(GW, GH, elevationAt, isBlocked, minSpacing, config.lakeCount, rand);

  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
  for (const source of sources) {
    // A source could have been claimed by a lake basin sited earlier in this
    // same loop (floodFillBasin doesn't know about prior lakes) — re-check.
    if (isBlocked(source.col, source.row)) continue;

    const basin = floodFillBasin(source, GW, GH, elevationAt, isBlocked, LAKE_MAX_SIZE);
    for (const { col, row } of basin) {
      grid.set(col, row, { feature: 'lake', walkable: false, waterDepth: LAKE_DEPTH_WU });
      for (const [dc, dr] of DIRS) {
        const nc = col + dc, nr = row + dr;
        if (nc < 0 || nc >= GW || nr < 0 || nr >= GH) continue;
        if (grid.get(nc, nr).feature === 'none') {
          grid.set(nc, nr, { feature: 'river_bank' });
        }
      }
    }
  }
}
```

- [ ] **Step 12: Run `tests/world/LakeGenerator.test.ts`, confirm all pass**

- [ ] **Step 13: Run `npx tsc --noEmit`, confirm baseline**

- [ ] **Step 14: Commit**

```bash
git add src/world/WorldGrid.ts tests/world/WorldGrid.test.ts src/world/WaterDepthConfig.ts \
        src/world/LakeGenerator.ts tests/world/LakeGenerator.test.ts
git commit -m "feat: add lake feature, LAKE_DEPTH_WU, and LakeGenerator"
```

---

## Task 4: Wire `generateLakes()` into `WorldGenerator.buildWorldGrid()`

**Files:**
- Modify: `src/world/WorldGenerator.ts`
- Test: existing `tests/world/WorldGenerator.test.ts` (extend)

**Interfaces:**
- Consumes: `generateLakes` from Task 3's `src/world/LakeGenerator.ts`.

- [ ] **Step 1: Write a failing test in `tests/world/WorldGenerator.test.ts`**

Assert that `buildWorldGrid()` with a `config.lakeCount > 0` produces at least one `feature ===
'lake'` tile for a seed/config combination known to have enough elevation variance (reuse an
existing test's config/seed if one already exercises varied terrain; otherwise pick a seed
empirically by running a quick throwaway script). If lake placement is inherently probabilistic
for arbitrary seeds, assert loosely across multiple seeds (e.g., check that at least 1 of 5
fixed seeds produces a lake) rather than requiring every single seed to guarantee one — flag
this in a comment so it's clear the assertion is intentionally loose, not a bug.

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Add the `generateLakes()` call**

```ts
import { generateLakes } from './LakeGenerator';
// ...
  // OW-2: carve rivers into the grid (unchanged)
  generateHydrology(grid, config, seed);

  // Phase 3: carve lakes — runs after rivers so lake source-selection's
  // isBlocked() check correctly excludes tiles rivers already claimed.
  generateLakes(grid, config, seed);

  return grid;
```

- [ ] **Step 4: Run the new test, confirm pass**

- [ ] **Step 5: Run the full `tests/world/WorldGenerator.test.ts` suite, confirm no regressions**

- [ ] **Step 6: Run `npx tsc --noEmit`, confirm baseline**

- [ ] **Step 7: Commit**

```bash
git add src/world/WorldGenerator.ts tests/world/WorldGenerator.test.ts
git commit -m "feat: wire generateLakes into buildWorldGrid"
```

---

## Task 5: `RoadGenerator.ts` lake avoidance

**Files:**
- Modify: `src/world/RoadGenerator.ts`
- Modify: `tests/world/RoadGenerator.test.ts`

**Interfaces:**
- Consumes: `feature === 'lake'` tiles as produced by Task 3/4.

- [ ] **Step 1: Write 3 failing tests in `tests/world/RoadGenerator.test.ts`**, mirroring the
  existing ocean-crossing tests: (a) an edge whose only route is blocked by a lake and whose
  L-shape fallback would cross it gets skipped (no road tile lands on a lake), (b) an
  unaffected land-only route elsewhere on the same map still connects normally, (c) two
  settlements on the same landmass still connect despite an unrelated lake sitting elsewhere on
  the map. Construct these by hand-placing `feature: 'lake'` tiles on a test `WorldGrid` (same
  pattern the existing ocean tests use for `biome: 'ocean'`).

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Add lake checks to `_moveCost` and `_pathCrossesWater`**

```ts
// _moveCost:
if (cell.biome === 'deep_ocean' || cell.biome === 'ocean' || cell.feature === 'lake') return Infinity;
```

```ts
// _pathCrossesWater — add the same feature === 'lake' condition alongside
// its existing ocean-biome check (read the existing function body first to
// match its exact structure/early-return style before editing).
```

- [ ] **Step 4: Run `tests/world/RoadGenerator.test.ts`, confirm all pass (12 tests: 9 existing + 3 new)**

- [ ] **Step 5: Run `npx tsc --noEmit`, confirm baseline**

- [ ] **Step 6: Commit**

```bash
git add src/world/RoadGenerator.ts tests/world/RoadGenerator.test.ts
git commit -m "fix: RoadGenerator avoids routing roads through lakes"
```

---

## Task 6: `TerrainGeometryBuilder.ts` lake color + `ResourceNodePlacer.ts` / `OverworldScene.ts` consistency

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Modify: `tests/world/TerrainGeometryBuilder.test.ts`
- Modify: `src/world/ResourceNodePlacer.ts`
- Modify: `src/scene/OverworldScene.ts` (~line 2739)

**Interfaces:**
- Consumes: `feature === 'lake'` / `waterDepth > 0` from Task 3.

- [ ] **Step 1: Write a failing test in `tests/world/TerrainGeometryBuilder.test.ts`**

Find the existing river-carving/color test (search for `BIOME_RIVER` or the river depth-carving
test) and write a parallel test: a `feature: 'lake'` tile with `waterDepth: LAKE_DEPTH_WU`
produces (a) the same carved-depth geometry math as a river tile at the same `waterDepth` value
(the carving code keys off `waterDepth`, not feature, so this should already pass once the
color branch is added — assert it explicitly as a regression guard), and (b) a distinct color
(`BIOME_LAKE`, not equal to `BIOME_RIVER`) in the output color buffer.

- [ ] **Step 2: Run, confirm failure** (color assertion fails — `BIOME_LAKE` doesn't exist yet)

- [ ] **Step 3: Add `BIOME_LAKE` constant and color branch**

Find where `BIOME_RIVER` color is defined/applied in `TerrainGeometryBuilder.ts` and add a
sibling constant (a calmer, slightly greener blue — e.g. if `BIOME_RIVER` is something like
`[0.2, 0.4, 0.75]`, use `[0.25, 0.45, 0.55]` for `BIOME_LAKE`, tuning by eye during manual
verification later) and an `if (cell.feature === 'lake') { ...use BIOME_LAKE... }` branch
alongside the existing river branch.

- [ ] **Step 4: Run `tests/world/TerrainGeometryBuilder.test.ts`, confirm full suite passes**

- [ ] **Step 5: Add `feature === 'lake'` to `ResourceNodePlacer.ts`'s essence-blossom check**

```ts
if (feature === 'river' || feature === 'river_bank' || feature === 'river_ford' || feature === 'lake') {
```

- [ ] **Step 6: Add `feature === 'lake'` to `OverworldScene.ts`'s near-water check (~line 2739)**

```ts
if (cell.feature === 'river' || cell.feature === 'lake' || cell.biome === 'ocean' || cell.biome === 'deep_ocean') {
```

- [ ] **Step 7: Run existing `tests/world/ResourceNodePlacer.test.ts` (if present) and any
  `OverworldScene`-related tests, confirm no regressions**

- [ ] **Step 8: Run `npx tsc --noEmit`, confirm baseline**

- [ ] **Step 9: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts \
        src/world/ResourceNodePlacer.ts src/scene/OverworldScene.ts
git commit -m "feat: render lakes with a distinct color, extend water checks to include lakes"
```

---

## Task 7: Relocate `RiverHeightSampler`, delete dead `RealmRiverMesh.ts` code

**Files:**
- Create: `src/world/HeightSampler.ts`
- Modify: `src/world/SettlementSpawner.ts`, `src/world/SettlementRoadMesh.ts`
- Delete: `src/world/RealmRiverMesh.ts`, `tests/world/RealmRiverMesh.test.ts`

**Interfaces:**
- Produces: `RiverHeightSampler` type, re-exported from `src/world/HeightSampler.ts`.

This task is a pure relocation with no new test needed beyond the existing consumer tests
continuing to pass (confirmed via `tsc` — a type-only relocation either compiles or doesn't).

- [ ] **Step 1: Create `src/world/HeightSampler.ts`**

```ts
/**
 * Generic world-space height-sampling function type, shared by any system
 * that needs to query ground height at an arbitrary (x, z) — settlement
 * building placement, road-ribbon rendering, etc. Relocated out of the
 * now-deleted `RealmRiverMesh.ts` (Phase 3 hydrology unification), where
 * it lived despite having no river-specific meaning.
 */
export type RiverHeightSampler = (worldX: number, worldZ: number) => number;
```

- [ ] **Step 2: Update imports in `src/world/SettlementSpawner.ts` and `src/world/SettlementRoadMesh.ts`**

```ts
import type { RiverHeightSampler } from './HeightSampler';
```

- [ ] **Step 3: Confirm nothing else imports from `RealmRiverMesh.ts` besides its own test file**

```bash
grep -rln "RealmRiverMesh" src/ tests/ --include="*.ts"
```

Expect only `src/world/RealmRiverMesh.ts` and `tests/world/RealmRiverMesh.test.ts` themselves.

- [ ] **Step 4: Delete both files**

```bash
git rm src/world/RealmRiverMesh.ts tests/world/RealmRiverMesh.test.ts
```

- [ ] **Step 5: Run `npx tsc --noEmit`, confirm baseline (145 or fewer — expect it to actually
  drop since dead code + its test file are removed)**

- [ ] **Step 6: Run the full test suite once, confirm the removed test file's tests are simply
  gone (not replaced by failures) and no other suite references them**

```bash
npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add src/world/HeightSampler.ts src/world/SettlementSpawner.ts src/world/SettlementRoadMesh.ts
git commit -m "refactor: relocate RiverHeightSampler, delete dead RealmRiverMesh code"
```

---

## Task 8: `RealmGenerator.ts` — replace inline rivers with `RiverFlow.ts`, add lakes

**Files:**
- Modify: `src/world/RealmGenerator.ts`
- Modify: `tests/world/RealmGenerator.test.ts`
- Modify: `src/overworld-studio.ts` (add `RealmLake` interface + `lakes` field to `RealmData`)

**Interfaces:**
- Consumes: `selectRiverSources`/`flowDownhill` (Task 1), `selectLakeSources`/`floodFillBasin`
  (Task 2).
- Produces: `RealmData.rivers` now grid-based (points are integer tile centers, still
  Chaikin-smoothed for preview); new `RealmData.lakes: RealmLake[]`.

- [ ] **Step 1: Add `RealmLake` interface and `lakes` field to `RealmData` in `overworld-studio.ts`**

```ts
export interface RealmLake { cells: Vec2[]; }

export interface RealmData {
  cells: RealmCell[][];
  W: number; H: number;
  rivers: RealmRiver[];
  lakes: RealmLake[];
  settlements: RealmSettlement[];
  dungeons: { x: number; y: number }[];
  towerX: number; towerY: number;
  seed: number;
}
```

- [ ] **Step 2: Update or add failing tests in `tests/world/RealmGenerator.test.ts`**

Read the existing river-related test assertions first — they likely check `rivers.length` /
`rivers[].points` shape against the old probabilistic algorithm's characteristics. Update them
to assert the new grid-based behavior instead: (a) `rivers` is still populated (length > 0 for a
seed/roughness combo known to produce rim elevation), (b) each river's raw (pre-chaikin, or
check the chaikin-smoothed output is still reasonable) points trace a connected path, (c) NEW:
`lakes` field exists and is an array; for a seed/config known to have enough elevation variance,
at least one lake has `cells.length > 0`; (d) NEW: no lake cell coincides with a river-claimed
cell.

- [ ] **Step 3: Run, confirm failure**

- [ ] **Step 4: Replace the inline rivers block**

Remove the existing `// ── Rivers ──` block (the 8-directional probabilistic walk). Replace
with:

```ts
// ── Rivers (Phase 3: same algorithm as the live game's HydrologyGenerator,
// via the shared RiverFlow.ts module — see
// docs/superpowers/specs/2026-08-31-lakes-hydrology-unification-design.md §2) ──
const GHW = (W - 1) / 2, GHH = (H - 1) / 2;
const FR = Math.round(GHW * 0.28);
const terminateR = FR * 1.8;
const sourceMinR = GHW * 0.70;
const minSpacing = W * 0.15;
const riverSourceMinLevel = 0.68; // matches this file's own elevation scale (0-1, not 0-7 levels)

const claimedRiver = new Set<string>();
const elevationAt = (col: number, row: number) => cells[row]![col]!.elevation;
const isRiver = (col: number, row: number) => claimedRiver.has(`${col},${row}`);

const riverSources = selectRiverSources(
  W, H, elevationAt, riverSourceMinLevel, sourceMinR, minSpacing,
  4 + Math.floor(roughness * 8), rand4,
);

const rivers: RealmRiver[] = [];
for (const source of riverSources) {
  const b = cells[source.row]![source.col]!.biome;
  if (b === 'ocean' || b === 'deep_ocean' || b === 'snow') continue;
  const path = flowDownhill(source, W, H, elevationAt, isRiver, terminateR);
  if (path.length < 6) continue; // matches the old ">= 6 points" quality gate
  const pts: Vec2[] = path.map(p => ({ x: p.col + 0.5, y: p.row + 0.5 }));
  for (const p of path) claimedRiver.add(`${p.col},${p.row}`);
  rivers.push({ points: chaikin(pts, 2) });
}
```

Note: `riverSourceMinLevel` is expressed on this file's 0-1 elevation scale (`RealmCell.elevation`
is a float 0-1, unlike `WorldGrid`'s integer 0-7 levels) — 0.68 matches the old inline block's
`c.elevation > 0.68` filter, preserving the "rivers start high up" visual intent even though the
selection mechanism (rim-radius + level threshold via `selectRiverSources`) is now different
from the old block's simple per-cell dice roll. Remove the now-unused `DIRS8`/`riverCount`/
`maxRivers`-loop variables that only served the deleted block (keep `maxRivers`'s *value*
inlined into the `count` argument above as shown).

- [ ] **Step 5: Add the lakes block, placed after rivers (so `claimedRiver` tiles are excluded)**

```ts
// ── Lakes (Phase 3: independent local-minima siting, see design spec §3) ──
const isBlockedForLake = (col: number, row: number) => {
  if (claimedRiver.has(`${col},${row}`)) return true;
  const b = cells[row]![col]!.biome;
  return b === 'ocean' || b === 'deep_ocean';
};
const lakeSources = selectLakeSources(W, H, elevationAt, isBlockedForLake, minSpacing, 2, rand4);
const lakes: RealmLake[] = [];
const claimedLake = new Set<string>();
for (const source of lakeSources) {
  if (claimedLake.has(`${source.col},${source.row}`)) continue;
  const basin = floodFillBasin(
    source, W, H, elevationAt,
    (c, r) => isBlockedForLake(c, r) || claimedLake.has(`${c},${r}`),
    40,
  );
  for (const p of basin) claimedLake.add(`${p.col},${p.row}`);
  lakes.push({ cells: basin.map(p => ({ x: p.col + 0.5, y: p.row + 0.5 })) });
}
```

- [ ] **Step 6: Add `lakes` to the returned `RealmData` object** (find the function's final
  `return { ... }` and add `lakes,`).

- [ ] **Step 7: Add the new imports at the top of `RealmGenerator.ts`**

```ts
import { selectRiverSources, flowDownhill } from './RiverFlow';
import { selectLakeSources, floodFillBasin } from './LakeSiting';
```

- [ ] **Step 8: Run `tests/world/RealmGenerator.test.ts`, confirm all pass**

- [ ] **Step 9: Run `npx tsc --noEmit`, confirm baseline**

- [ ] **Step 10: Commit**

```bash
git add src/world/RealmGenerator.ts tests/world/RealmGenerator.test.ts src/overworld-studio.ts
git commit -m "feat: RealmGenerator rivers use shared RiverFlow algorithm, add lake generation"
```

---

## Task 9: Studio preview — draw lakes on the Realm-tab canvas

**Files:**
- Modify: `src/overworld-studio.ts`

**Interfaces:**
- Consumes: `RealmData.lakes` from Task 8.

- [ ] **Step 1: Find the existing river-drawing canvas block** (search for where
  `realm.rivers` is stroked — likely near the biome cell-fill loop in the Realm-tab preview
  drawing function).

- [ ] **Step 2: Add a lake-drawing block using the same fill-cell technique other biome tiles
  already use**, with a lake-appropriate fill color (reuse or closely match the
  `BIOME_LAKE` tone chosen in Task 6 for visual consistency between Studio preview and the live
  game, even though these are two separate color constants in two separate files — no shared
  import needed, just eyeball-matching the hex value).

```ts
ctx.fillStyle = '#3a6858'; // matches TerrainGeometryBuilder's BIOME_LAKE tone
for (const lake of realm.lakes) {
  for (const cell of lake.cells) {
    ctx.fillRect(Math.floor(cell.x) * tileSize, Math.floor(cell.y) * tileSize, tileSize, tileSize);
  }
}
```

(Match the exact variable names for tile size / canvas scaling already used by the surrounding
biome-drawing code — read that code first rather than guessing at names.)

- [ ] **Step 3: Manually verify** (see Task 10 for the consolidated manual-verification pass —
  this step's own check can be folded into that pass rather than duplicated here).

- [ ] **Step 4: Run `npx tsc --noEmit`, confirm baseline**

- [ ] **Step 5: Commit**

```bash
git add src/overworld-studio.ts
git commit -m "feat: draw lakes on the Overworld Studio realm preview"
```

---

## Task 10: Full regression pass + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Confirm exactly the same pre-existing baseline failures as documented in the roadmap (12 —
`main.startup.smoke.test.ts` x3, `enemyLoader.test.ts` x3, `towerGenerator.test.ts` x2,
`talentSystem.test.ts` x3, `WaterMaterial.test.ts` x1) plus any expected reduction from Task 7's
`RealmRiverMesh.test.ts` deletion — zero *new* failures.

- [ ] **Step 2: Run `npx tsc --noEmit`, confirm error count is at or below the 145 baseline**

- [ ] **Step 3: Attempt live/manual verification**

Generate a world in Overworld Studio's Realm tab and confirm: rivers render as a blockier
grid-aligned line (expected visual change, matches live rendering now), lakes appear as
distinct filled patches separate from rivers/ocean. Generate a world in the live game and
confirm: lakes are visually distinct from rivers (color), walking into a lake triggers real
swim state (matching river behavior), a road never visibly crosses a lake. Use the
Playwright/dev-server workflow from earlier in this session; check `ps aux | grep chrom` and
kill stale processes first given this sandbox's documented history of browser-automation hangs.
If browser automation is unavailable or hangs beyond a reasonable wait, fall back to reporting
this gap explicitly (as Phase 2 did) rather than blocking completion on it — the automated test
coverage from Tasks 1-9 stands on its own.

- [ ] **Step 4: Update `docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md`'s Phase 3
  status to DONE**, with a technical writeup mirroring Phase 2's (what shipped, what was
  deferred, any manual-verification limitation), and check off the relevant task-list items.

- [ ] **Step 5: Commit and push to `main`**

```bash
git add docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md
git commit -m "docs: mark Phase 3 (lakes + hydrology unification) DONE"
git push origin HEAD:main
```
