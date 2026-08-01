# Building Placement & Interior Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix overworld building placement/overlap by making the settlement layout algorithms footprint-aware, and route live building entry through the same dungeon-style interior system (`buildingToDungeonPlan()` + `sceneManager.loadDungeon()`) that dungeons and the greenhouse already use, removing the older `InteriorGenerator`/`_mountInterior` overlay system.

**Architecture:** Section A makes `BUILDING_SPECS[type].footprint` (consumed by `SettlementGenerator.ts`'s placement/overlap logic) derive from `BuildingDNA.getFootprint()` — the actual mesh-render size — instead of a stale hand-authored table, then reworks each settlement tier's placement loop (village/town/city) to size its offsets/steps from real footprints instead of fixed constants. Section B swaps the live building-entry code path in `main.ts` from the old always-on-screen `_mountInterior()` overlay (positioned at a fixed `INTERIOR_Y = 200` offset, player never truly "enters" a separate scene) to the same `sceneManager.loadDungeon()` route dungeons/the greenhouse use, converting a building's `BuildingDNA` to a `DungeonPlan` via the already-built (but previously only Studio-wired) `buildingToDungeonPlan()`.

**Tech Stack:** TypeScript, Three.js, Vitest (unit tests), Playwright (e2e, best-effort), Vite.

## Global Constraints

- World units per grid tile is `T = 2` (matches `OverworldScene.ts`'s `T` constant) — any new tile↔world-unit conversion must use this exact factor.
- Settlements are allowed to become larger/more spread out to fit real building footprints (approved by user) — do not shrink or clip building footprints to preserve the old tight layout.
- Building interiors must route through `sceneManager.loadDungeon()`, matching real dungeons/the greenhouse (approved by user) — no bespoke overlay-mount system.
- `buildingToDungeonPlan()` produces rooms with `spawns: []` — building interiors must never contain enemy spawns; do not add any.
- `_valid()`/`_noOverlap()` signatures in `SettlementGenerator.ts` must not change — only the values fed into them.
- Full `tsc --noEmit`, `vitest run`, and `vite build` must stay green after every task with code changes.
- `tests/e2e/backroom-building-lab.spec.ts` requires **no changes** (confirmed: `enterBackroom()` uses `buildBuildingLab()`/`buildEmptyRoom()` from `@/creative/backroomScenes`, entirely independent of `_mountInterior`/`generateInterior()`).

---

## Section A — Footprint-aware settlement layout

### Task 1: Consolidate building footprint into a single source of truth

**Files:**
- Modify: `src/world/buildings/BuildingTypes.ts` (entire file)
- Modify: `src/world/buildings/BuildingTypeMap.ts:1-35` (imports + drop local `KIND_MAP`)
- Test: `tests/world/BuildingTypes.test.ts` (create)

**Interfaces:**
- Consumes: `getFootprint(kind: BuildingKind, size: BuildingSize): { w: number; d: number }`, `type BuildingKind`, `type BuildingSize` from `src/world/buildings/BuildingDNA.ts` (unchanged, not modified by this task).
- Produces: `KIND_MAP: Record<BuildingType, BuildingKind>`, `SIZE_MAP: Record<BuildingType, BuildingSize>`, and `BUILDING_SPECS: Readonly<Record<BuildingType, BuildingSpec>>` (all exported from `BuildingTypes.ts`) — consumed by `BuildingTypeMap.ts` (Task 1) and `SettlementGenerator.ts` (Tasks 3-5, already imports `BUILDING_SPECS` today, no signature change needed there).

- [ ] **Step 1: Write the failing test**

Create `tests/world/BuildingTypes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BUILDING_SPECS, type BuildingType } from '@/world/buildings/BuildingTypes';

// Expected tile footprints, hand-computed from BuildingDNA.getFootprint(KIND_MAP[type], SIZE_MAP[type])
// at WORLD_UNITS_PER_TILE=2 (ceil(worldUnits / 2)). These are the REAL render sizes — the whole
// point of this test is to catch BUILDING_SPECS drifting back to stale hand-authored numbers.
const EXPECTED_FOOTPRINT: Record<BuildingType, [number, number]> = {
  cottage:      [5, 4], // kind 'cottage' has a KIND_FOOTPRINT override: 9x7 WU
  inn:          [3, 3], // kind 'inn', size 'small': SIZE_FOOTPRINT.small = 6x5 WU
  market_stall: [3, 2], // kind 'market_stall' has a KIND_FOOTPRINT override: 6x3 WU
  smithy:       [5, 4], // kind 'blacksmith' has a KIND_FOOTPRINT override: 9x7 WU
  tavern:       [6, 5], // kind 'tavern' has a KIND_FOOTPRINT override: 12x9 WU
  temple:       [4, 7], // kind 'chapel' has a KIND_FOOTPRINT override: 7x14 WU
  city_hall:    [7, 5], // kind 'guild', size 'large': SIZE_FOOTPRINT.large = 13x10 WU
  guard_tower:  [2, 2], // kind 'watchtower' has a KIND_FOOTPRINT override: 3x3 WU
  well:         [2, 2], // kind 'well', size 'tiny': SIZE_FOOTPRINT.tiny = 4x4 WU
  market_cross: [3, 2], // kind 'market_stall' has a KIND_FOOTPRINT override: 6x3 WU
};

describe('BUILDING_SPECS footprints', () => {
  it('match the real BuildingDNA render footprint (tiles, T=2 WU/tile)', () => {
    for (const type of Object.keys(EXPECTED_FOOTPRINT) as BuildingType[]) {
      expect(BUILDING_SPECS[type].footprint).toEqual(EXPECTED_FOOTPRINT[type]);
    }
  });

  it('every BuildingType has a positive-area footprint', () => {
    for (const type of Object.keys(EXPECTED_FOOTPRINT) as BuildingType[]) {
      const [w, d] = BUILDING_SPECS[type].footprint;
      expect(w).toBeGreaterThan(0);
      expect(d).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/BuildingTypes.test.ts`
Expected: FAIL — current `BUILDING_SPECS` values (e.g. `cottage: [2, 2]`) don't match `[5, 4]`.

- [ ] **Step 3: Replace `BuildingTypes.ts` with the footprint-derived version**

Replace the full contents of `src/world/buildings/BuildingTypes.ts` with:

```typescript
/**
 * BuildingTypes — type identifiers and specs for every building that can
 * appear in a settlement. Used by BuildingGenerator and SettlementGenerator.
 *
 * `footprint` is derived directly from BuildingDNA.getFootprint() — the exact
 * same function BuildingBuilder.ts uses to size the rendered mesh — so the
 * settlement planner and the actual renderer always agree on a building's
 * real size. (Previously this table was hand-authored and stale, which is
 * why buildings used to overlap/clip through each other.)
 */

import { getFootprint, type BuildingKind, type BuildingSize } from './BuildingDNA';

export type BuildingType =
  | 'cottage'       // small 1-room dwelling, thatched dome roof
  | 'inn'           // larger, 2 floors, pitched roof, hanging sign
  | 'market_stall'  // open-sided awning, vendor counter, 4 poles
  | 'smithy'        // rectangular, chimney, forge glow
  | 'tavern'        // wide 2-floor, pitched roof, barrel cluster
  | 'temple'        // circular columns, dome roof, emissive altar
  | 'city_hall'     // 3-floor, flat parapet + central spire
  | 'guard_tower'   // tall narrow cylinder + battlements
  | 'well'          // cylinder surround + mini pitched roof + bucket
  | 'market_cross'; // focal pillar + cross-arm + stone plinth

export type RoofStyle = 'thatched_dome' | 'pointed' | 'flat_parapet' | 'spire';

/** World units per grid tile — must match OverworldScene.ts's `T` constant. */
const WORLD_UNITS_PER_TILE = 2;

/**
 * Which BuildingKind (new procedural-building system) and BuildingSize each
 * old BuildingType maps to. Single source of truth — also consumed by
 * BuildingTypeMap.ts's createSettlementBuildingDna() so the settlement
 * planner and the actual renderer always agree on a building's real kind/size.
 */
export const KIND_MAP: Record<BuildingType, BuildingKind> = {
  cottage:      'cottage',
  inn:          'inn',
  market_stall: 'market_stall',
  smithy:       'blacksmith',
  tavern:       'tavern',
  temple:       'chapel',
  city_hall:    'guild',
  guard_tower:  'watchtower',
  well:         'well',
  market_cross: 'market_stall',
};

export const SIZE_MAP: Record<BuildingType, BuildingSize> = {
  cottage:      'tiny',
  inn:          'small',
  market_stall: 'tiny',
  smithy:       'tiny',
  tavern:       'small',
  temple:       'medium',
  city_hall:    'large',
  guard_tower:  'tiny',
  well:         'tiny',
  market_cross: 'tiny',
};

export interface BuildingSpec {
  type:           BuildingType;
  /** Footprint in grid tiles [cols, rows] — derived from
   *  getFootprint(KIND_MAP[type], SIZE_MAP[type]), the exact footprint
   *  BuildingBuilder.ts uses to render the mesh. */
  footprint:      [cols: number, rows: number];
  minFloors:      number;
  maxFloors:      number;
  roofStyle:      RoofStyle;
  /** If true, pressing [E] at the door opens an interior generator. */
  allowsInterior: boolean;
}

/** Convert a BuildingType's real render footprint (world units) to grid tiles, rounded up. */
function _tileFootprint(type: BuildingType): [number, number] {
  const { w, d } = getFootprint(KIND_MAP[type], SIZE_MAP[type]);
  return [Math.ceil(w / WORLD_UNITS_PER_TILE), Math.ceil(d / WORLD_UNITS_PER_TILE)];
}

export const BUILDING_SPECS: Readonly<Record<BuildingType, BuildingSpec>> = {
  cottage:      { type: 'cottage',      footprint: _tileFootprint('cottage'),      minFloors: 1, maxFloors: 1, roofStyle: 'thatched_dome', allowsInterior: true  },
  inn:          { type: 'inn',          footprint: _tileFootprint('inn'),          minFloors: 2, maxFloors: 2, roofStyle: 'pointed',        allowsInterior: true  },
  market_stall: { type: 'market_stall', footprint: _tileFootprint('market_stall'), minFloors: 1, maxFloors: 1, roofStyle: 'flat_parapet',   allowsInterior: false },
  smithy:       { type: 'smithy',       footprint: _tileFootprint('smithy'),       minFloors: 1, maxFloors: 1, roofStyle: 'flat_parapet',   allowsInterior: true  },
  tavern:       { type: 'tavern',       footprint: _tileFootprint('tavern'),       minFloors: 2, maxFloors: 2, roofStyle: 'pointed',        allowsInterior: true  },
  temple:       { type: 'temple',       footprint: _tileFootprint('temple'),       minFloors: 2, maxFloors: 2, roofStyle: 'thatched_dome',  allowsInterior: true  },
  city_hall:    { type: 'city_hall',    footprint: _tileFootprint('city_hall'),    minFloors: 3, maxFloors: 3, roofStyle: 'spire',          allowsInterior: true  },
  guard_tower:  { type: 'guard_tower',  footprint: _tileFootprint('guard_tower'),  minFloors: 4, maxFloors: 5, roofStyle: 'flat_parapet',   allowsInterior: false },
  well:         { type: 'well',         footprint: _tileFootprint('well'),         minFloors: 1, maxFloors: 1, roofStyle: 'pointed',        allowsInterior: false },
  market_cross: { type: 'market_cross', footprint: _tileFootprint('market_cross'), minFloors: 1, maxFloors: 1, roofStyle: 'flat_parapet',   allowsInterior: false },
};
```

- [ ] **Step 4: Update `BuildingTypeMap.ts` to import `KIND_MAP`/`SIZE_MAP` instead of redefining them**

In `src/world/buildings/BuildingTypeMap.ts`, replace the top of the file (imports through the `SIZE_MAP` block) — i.e. everything from the file start down to (but not including) the `// ── Floors from old BuildingSpec ──` comment — with:

```typescript
/**
 * BuildingTypeMap — bridges the old BuildingType identifier system (used by
 * SettlementGenerator / WorldData) to the new BuildingDNA system.
 *
 * createSettlementBuildingDna() produces a deterministic BuildingDNA from:
 *  • PlacedBuilding.type  (old kind string)
 *  • PlacedBuilding.seed  (drives deterministic variation)
 *  • SettlementType       (village/town/city → style tier)
 */

import { KIND_MAP, SIZE_MAP, type BuildingType } from './BuildingTypes';
import type { SettlementType }  from '../SettlementGenerator';
import type { PlacedBuilding }  from '../SettlementGenerator';
import {
  STYLE_COLORS,
  type BuildingDNA,
  type BuildingStyle,
} from './BuildingDNA';
import { mulberry32 } from '@/core/prng';

// ── Style selection by settlement tier ───────────────────────────────────────

type StyleTier = [primary: BuildingStyle, secondary: BuildingStyle];

const TIER_STYLES: Record<SettlementType, StyleTier> = {
  village: ['thatched', 'timber'],
  town:    ['timber',   'stone'],
  city:    ['stone',    'tudor'],
};

/** Certain kinds always use a specific style regardless of settlement tier. */
const STYLE_OVERRIDES: Partial<Record<BuildingType, BuildingStyle>> = {
  temple:      'gothic',
  city_hall:   'stone',
  guard_tower: 'stone',
  well:        'stone',
  smithy:      'stone',
};

```

This drops the local `KIND_MAP`/`SIZE_MAP` const declarations (now imported from `BuildingTypes.ts`) and the now-unused `BuildingKind`/`BuildingSize` type imports. Leave the rest of the file (`FLOORS_MAP` through the end of `createSettlementBuildingDna`) untouched **except** update these two lines inside `createSettlementBuildingDna` (remove the now-unnecessary `??` fallbacks, since `KIND_MAP`/`SIZE_MAP` are full `Record`s, not `Partial`):

```typescript
  const kind  = KIND_MAP[b.type];
  const size  = SIZE_MAP[b.type];
```

(replacing the old `const kind  = KIND_MAP[b.type]  ?? 'house';` / `const size  = SIZE_MAP[b.type]  ?? 'medium';` lines.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/world/BuildingTypes.test.ts`
Expected: PASS

- [ ] **Step 6: Full typecheck + existing test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors. (`BuildingTypeMap.ts`'s import of `BuildingKind`/`BuildingSize` types was removed — confirm no other code in that file still references them; if `tsc` reports an unused-import or missing-type error, double-check Step 4's replacement was applied exactly as written.)

- [ ] **Step 7: Commit**

```bash
git add src/world/buildings/BuildingTypes.ts src/world/buildings/BuildingTypeMap.ts tests/world/BuildingTypes.test.ts
git commit -m "feat(buildings): derive BUILDING_SPECS footprint from real BuildingDNA render size

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Write the building-overlap regression test (expected to fail)

**Files:**
- Modify: `tests/levels/settlementGenerator.test.ts` (append new `describe` block)

**Interfaces:**
- Consumes: `planSettlement(type, centerCol, centerRow, seed, grid): SettlementPlan` (unchanged signature, from `src/world/SettlementGenerator.ts`), `BUILDING_SPECS` and `type BuildingType` from `src/world/buildings/BuildingTypes.ts` (Task 1's output), `type PlacedBuilding` from `src/world/SettlementGenerator.ts`.
- Produces: a regression test that Tasks 3-5 must turn green.

- [ ] **Step 1: Append the failing test**

Add to the end of `tests/levels/settlementGenerator.test.ts` (after the existing `describe('placeSettlements', ...)` block), and add the two new imports to the top of the file alongside the existing imports:

```typescript
import { BUILDING_SPECS } from '@/world/buildings/BuildingTypes';
import type { PlacedBuilding } from '@/world/SettlementGenerator';
```

Then append:

```typescript
// ── Building overlap regression (TV-3 side-track: footprint-aware layout) ────

describe('planSettlement building overlap', () => {
  function overlaps(a: PlacedBuilding, b: PlacedBuilding): boolean {
    const [aw, ad] = BUILDING_SPECS[a.type].footprint;
    const [bw, bd] = BUILDING_SPECS[b.type].footprint;
    const ahw = Math.ceil(aw / 2), ahd = Math.ceil(ad / 2);
    const bhw = Math.ceil(bw / 2), bhd = Math.ceil(bd / 2);
    return Math.abs(a.col - b.col) < ahw + bhw && Math.abs(a.row - b.row) < ahd + bhd;
  }

  it('no two buildings overlap, for several seeds per settlement type', () => {
    const g = flatGrid(128);
    for (const type of ['village', 'town', 'city'] as const) {
      for (const seed of [1, 2, 3, 42, 999]) {
        const plan = planSettlement(type, 64, 64, seed, g);
        for (let i = 0; i < plan.buildings.length; i++) {
          for (let j = i + 1; j < plan.buildings.length; j++) {
            const a = plan.buildings[i]!, b = plan.buildings[j]!;
            expect(
              overlaps(a, b),
              `${type} seed=${seed}: ${a.type}@(${a.col},${a.row}) overlaps ${b.type}@(${b.col},${b.row})`,
            ).toBe(false);
          }
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts -t "no two buildings overlap"`
Expected: FAIL — with Task 1's corrected (larger) footprints, the old fixed-offset village/town/city placement loops produce overlapping buildings.

- [ ] **Step 3: Commit the failing test (documents the bug before the fix)**

```bash
git add tests/levels/settlementGenerator.test.ts
git commit -m "test(settlement): add footprint-aware building overlap regression (currently failing)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Rework village placement to be footprint-aware

**Files:**
- Modify: `src/world/SettlementGenerator.ts` (function `_planVillage`, currently lines ~208-266)

**Interfaces:**
- Consumes: `BUILDING_SPECS` (Task 1's corrected values), unchanged `_valid()`/`_noOverlap()` helpers already defined earlier in this file.
- Produces: no external signature change — `planSettlement('village', ...)` still returns the same `SettlementPlan` shape.

- [ ] **Step 1: Replace the plot-offset block inside `_planVillage`**

In `src/world/SettlementGenerator.ts`, inside `_planVillage`, replace this block:

```typescript
  // ── Building placement: 8 corner/arm plots, all guaranteed clear of roads ───
  //   Positions chosen so no plot overlaps the ±4-tile cross paths or T-stubs.
  //   Each entry: [col_offset, row_offset, rotation_y]
  const MIX: BuildingType[] = [
    'smithy', 'cottage', 'cottage', 'market_stall',
    'cottage', 'cottage', 'cottage', 'cottage',
  ];
  // [dc, dr, rot]  rot=0 → door +Z(S)  rot=π → door −Z(N)
  //                rot=π/2 → door +X(E)  rot=−π/2 → door −X(W)
  const PLOTS: [number, number, number][] = [
    [-4, -4,  0],               // NW corner  — faces south
    [ 4, -4,  0],               // NE corner  — faces south
    [-4,  4,  Math.PI],         // SW corner  — faces north
    [ 4,  4,  Math.PI],         // SE corner  — faces north
    [-6,  0,  Math.PI / 2],     // W midpoint — faces east
    [ 6,  0, -Math.PI / 2],     // E midpoint — faces west
    [ 0, -6,  0],               // N midpoint — faces south (door toward centre)
    [ 0,  6,  Math.PI],         // S midpoint — faces north (door toward centre)
  ];
```

with:

```typescript
  // ── Building placement: 8 corner/arm plots, offsets sized to the largest
  //   building in the mix so no plot can overlap the ±4-tile cross paths
  //   regardless of how big the real BuildingDNA footprint turns out to be.
  //   Each entry: [col_offset, row_offset, rotation_y]
  const MIX: BuildingType[] = [
    'smithy', 'cottage', 'cottage', 'market_stall',
    'cottage', 'cottage', 'cottage', 'cottage',
  ];
  let maxHalf = 0;
  for (const t of MIX) {
    const [fw, fd] = BUILDING_SPECS[t].footprint;
    maxHalf = Math.max(maxHalf, Math.ceil(fw / 2), Math.ceil(fd / 2));
  }
  const CLEARANCE = 2;                          // gap between road edge and building edge
  const cornerOff = VL + CLEARANCE + maxHalf;
  const midOff    = VL + CLEARANCE + maxHalf + 2; // midpoints sit slightly further out than corners
  // [dc, dr, rot]  rot=0 → door +Z(S)  rot=π → door −Z(N)
  //                rot=π/2 → door +X(E)  rot=−π/2 → door −X(W)
  const PLOTS: [number, number, number][] = [
    [-cornerOff, -cornerOff,  0],               // NW corner  — faces south
    [ cornerOff, -cornerOff,  0],               // NE corner  — faces south
    [-cornerOff,  cornerOff,  Math.PI],         // SW corner  — faces north
    [ cornerOff,  cornerOff,  Math.PI],         // SE corner  — faces north
    [-midOff,  0,  Math.PI / 2],                // W midpoint — faces east
    [ midOff,  0, -Math.PI / 2],                // E midpoint — faces west
    [ 0, -midOff,  0],                          // N midpoint — faces south (door toward centre)
    [ 0,  midOff,  Math.PI],                    // S midpoint — faces north (door toward centre)
  ];
```

Leave the rest of `_planVillage` (the `mi`-loop that consumes `PLOTS`, and the `VL`/road-drawing code above this block) unchanged — `VL` is already defined earlier in the function (`const VL = 4;`) and is now referenced here too.

- [ ] **Step 2: Run the overlap regression test for village only**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts -t "no two buildings overlap"`
Expected: still FAIL (town/city not yet fixed) — but manually confirm no *village*-specific overlap by running a quick check:

```bash
npx vitest run tests/levels/settlementGenerator.test.ts -t "planSettlement" 
```
Expected: PASS (the pre-existing `planSettlement` describe block — bounds/building-count checks — still passes for village).

- [ ] **Step 3: Run full existing settlement + BuildingTypes suites**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts tests/world/BuildingTypes.test.ts`
Expected: `planSettlement`, `applySettlementToGrid`, `placeSettlements`, and `BUILDING_SPECS footprints` describe blocks all PASS. The `planSettlement building overlap` block still fails only on town/city seeds (this is expected until Tasks 4-5).

- [ ] **Step 4: Commit**

```bash
git add src/world/SettlementGenerator.ts
git commit -m "fix(settlement): size village plot offsets from real building footprints

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Rework town placement to be footprint-aware

**Files:**
- Modify: `src/world/SettlementGenerator.ts` (function `_planTown`, currently lines ~272-345)

**Interfaces:**
- Consumes: `BUILDING_SPECS` (Task 1), unchanged `_valid()`/`_noOverlap()`.
- Produces: no external signature change.

- [ ] **Step 1: Replace the full `_planTown` function body**

Replace the entire `_planTown` function in `src/world/SettlementGenerator.ts` with:

```typescript
function _planTown(
  cc: number, cr: number, seed: number, grid: WorldGrid, name: string,
): SettlementPlan {
  const rand  = mulberry32(seed ^ 0xB2_C4_D6_E8);
  const GW = grid.width, GH = grid.height;
  const buildings: PlacedBuilding[] = [];
  const roadSet = new Set<string>();

  const MIX: BuildingType[] = [
    'tavern', 'inn', 'smithy', 'market_stall', 'market_stall',
    'inn', 'cottage', 'cottage', 'cottage', 'cottage',
    'cottage', 'well', 'guard_tower', 'cottage',
    'cottage', 'market_stall', 'cottage',
  ];
  // Scale the original hand-tuned 4-tile step/setback so real (possibly much
  // larger) BuildingDNA footprints never overlap, while keeping the same
  // slot COUNT as the original hand-authored layout.
  let maxHalf = 0;
  for (const t of MIX) {
    const [fw, fd] = BUILDING_SPECS[t].footprint;
    maxHalf = Math.max(maxHalf, Math.ceil(fw / 2), Math.ceil(fd / 2));
  }
  const scale   = Math.max(1, maxHalf / 2);
  const step    = Math.round(4 * scale);
  const setback = Math.round(4 * scale);
  const SL      = Math.round(8 * scale);

  // Main E-W street (3 tiles wide = 6 WU — feels like a real market high street)
  for (let i = -SL; i <= SL; i++) {
    for (const dr of [-1, 0, 1]) {
      const c = cc + i, r = cr + dr;
      if (c >= 0 && c < GW && r >= 0 && r < GH) roadSet.add(`${c},${r}`);
    }
  }
  // N-S cross street (3 tiles wide)
  for (let i = -(SL - 2); i <= SL - 2; i++) {
    for (const dc of [-1, 0, 1]) {
      const c = cc + dc, r = cr + i;
      if (c >= 0 && c < GW && r >= 0 && r < GH) roadSet.add(`${c},${r}`);
    }
  }

  // Central market_cross
  if (_valid(grid, cc, cr)) {
    buildings.push({ type: 'market_cross', col: cc, row: cr, rotation: 0, seed: (seed ^ 0x01) >>> 0 });
  }

  let mi = 0;

  // Buildings along E-W street — setback `setback` tiles from road centre, step every `step` tiles
  for (let n = -2; n <= 2; n++) {
    for (const side of [-1, 1]) {
      if (mi >= MIX.length) break;
      const col = cc + n * step;
      const row = cr + side * setback;
      const btype = MIX[mi]!;
      if (roadSet.has(`${col},${row}`))                                continue;  // skip road tiles
      if (!_valid(grid, col, row) || !_noOverlap(buildings, col, row, btype, 2)) continue;
      buildings.push({
        type:     MIX[mi++],
        col, row,
        rotation: side < 0 ? 0 : Math.PI,
        seed:     (seed ^ (mi * 0x7A3B)) >>> 0,
      });
    }
  }

  // Buildings along N-S cross street — same setback, matching the original
  // 4-slot spacing pattern (offsets -6,-2,2,6 tiles when step was fixed at 4)
  const crossMultipliers = [-1.5, -0.5, 0.5, 1.5];
  for (const mult of crossMultipliers) {
    for (const side of [-1, 1]) {
      if (mi >= MIX.length) break;
      const col = cc + side * setback;
      const row = cr + Math.round(mult * step);
      const btype = MIX[mi]!;
      if (roadSet.has(`${col},${row}`))                                continue;  // skip road tiles
      if (!_valid(grid, col, row) || !_noOverlap(buildings, col, row, btype, 2)) continue;
      buildings.push({
        type:     MIX[mi++],
        col, row,
        rotation: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        seed:     (seed ^ (mi * 0x7A3B)) >>> 0,
      });
    }
  }

  const roads: RoadSegment[] = [];
  for (const key of roadSet) {
    const [c, r] = key.split(',').map(Number);
    roads.push({ col: c!, row: r! });
  }

  return { type: 'town', name, centerCol: cc, centerRow: cr, buildings, roads,
           population: 25 + Math.floor(rand() * 26) };
}
```

- [ ] **Step 2: Run the overlap regression test for town**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts -t "no two buildings overlap"`
Expected: still FAIL (city not yet fixed), but no failure message should mention `type=town` any more — inspect the failure output to confirm remaining failures are all `city`.

- [ ] **Step 3: Run full existing settlement + BuildingTypes suites**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts tests/world/BuildingTypes.test.ts`
Expected: `planSettlement`, `applySettlementToGrid`, `placeSettlements`, `BUILDING_SPECS footprints` all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/world/SettlementGenerator.ts
git commit -m "fix(settlement): scale town street spacing from real building footprints

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Rework city placement to be footprint-aware

**Files:**
- Modify: `src/world/SettlementGenerator.ts` (function `_planCity`, currently lines ~351-410)

**Interfaces:**
- Consumes: `BUILDING_SPECS` (Task 1), unchanged `_valid()`/`_noOverlap()`.
- Produces: no external signature change. This is the last placement-algorithm task — after this, the Task 2 regression test must be fully green.

- [ ] **Step 1: Replace the full `_planCity` function body**

Replace the entire `_planCity` function in `src/world/SettlementGenerator.ts` with:

```typescript
function _planCity(
  cc: number, cr: number, seed: number, grid: WorldGrid, name: string,
): SettlementPlan {
  const rand  = mulberry32(seed ^ 0xC3_D5_E7_F9);
  const GW = grid.width, GH = grid.height;
  const buildings: PlacedBuilding[] = [];
  const roadSet = new Set<string>();

  const QUADRANT_MIX: BuildingType[] = [
    'inn', 'tavern', 'smithy', 'market_stall', 'guard_tower',
    'market_stall', 'inn', 'well', 'cottage', 'cottage', 'cottage',
    'inn', 'smithy', 'market_stall', 'cottage', 'guard_tower',
    'cottage', 'cottage', 'market_stall', 'well', 'cottage',
  ];
  // Uniform grid step/clearance sized to the largest building in the mix —
  // simple and always overlap-free, if a little more generous than a tight
  // per-building pack.
  let maxHalf = 0;
  for (const t of QUADRANT_MIX) {
    const [fw, fd] = BUILDING_SPECS[t].footprint;
    maxHalf = Math.max(maxHalf, Math.ceil(fw / 2), Math.ceil(fd / 2));
  }
  const GAP        = 1;
  const gridStep   = maxHalf * 2 + GAP;
  const baseOffset = Math.max(6, maxHalf + 3);
  const SL         = baseOffset + 2 * gridStep + 4; // road extent scales with the quadrant grid

  // Grand boulevard grid — 3-tile-wide avenues creating distinct city blocks.
  // E-W main boulevard (3 tiles wide) + parallel avenues at ±4
  for (let i = -SL; i <= SL; i++) {
    for (const dr of [-1, 0, 1]) {
      const c = cc + i;
      if (c >= 0 && c < GW) {
        const r0 = cr + dr; if (r0 >= 0 && r0 < GH) roadSet.add(`${c},${r0}`);
        const r1 = cr + dr + 4; if (r1 >= 0 && r1 < GH) roadSet.add(`${c},${r1}`);
        const r2 = cr + dr - 4; if (r2 >= 0 && r2 < GH) roadSet.add(`${c},${r2}`);
      }
    }
  }
  // N-S main boulevard (3 tiles wide) + parallel avenues at ±4
  for (let i = -SL; i <= SL; i++) {
    for (const dc of [-1, 0, 1]) {
      const r = cr + i;
      if (r >= 0 && r < GH) {
        const c0 = cc + dc; if (c0 >= 0 && c0 < GW) roadSet.add(`${c0},${r}`);
        const c1 = cc + dc + 4; if (c1 >= 0 && c1 < GW) roadSet.add(`${c1},${r}`);
        const c2 = cc + dc - 4; if (c2 >= 0 && c2 < GW) roadSet.add(`${c2},${r}`);
      }
    }
  }

  // Central city_hall
  if (_valid(grid, cc, cr)) {
    buildings.push({ type: 'city_hall', col: cc, row: cr, rotation: 0, seed: (seed ^ 0x01) >>> 0 });
  }
  // Temple north of city hall with proper separation
  const templeOff = baseOffset + gridStep;
  if (_valid(grid, cc, cr - templeOff)) {
    buildings.push({ type: 'temple', col: cc, row: cr - templeOff, rotation: 0, seed: (seed ^ 0x02) >>> 0 });
  }

  let mi = 0;

  // 4 quadrants: uniform grid spaced `gridStep` tiles apart, starting `baseOffset` tiles from centre
  for (const [qsc, qsr] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
    for (let bi = 0; bi < 5; bi++) {
      if (mi >= QUADRANT_MIX.length) break;
      const col = cc + qsc * (baseOffset + (bi % 3) * gridStep);
      const row = cr + qsr * (baseOffset + Math.floor(bi / 3) * gridStep);
      const btype = QUADRANT_MIX[mi]!;
      if (roadSet.has(`${col},${row}`))                                          { mi++; continue; }  // skip road tiles
      if (!_valid(grid, col, row) || !_noOverlap(buildings, col, row, btype)) { mi++; continue; }
      buildings.push({
        type:     QUADRANT_MIX[mi++],
        col, row,
        rotation: qsr < 0 ? 0 : Math.PI,
        seed:     (seed ^ (mi * 0x5C3D)) >>> 0,
      });
    }
  }

  const roads: RoadSegment[] = [];
  for (const key of roadSet) {
    const [c, r] = key.split(',').map(Number);
    roads.push({ col: c, row: r });
  }

  return { type: 'city', name, centerCol: cc, centerRow: cr, buildings, roads,
           population: 80 + Math.floor(rand() * 71) };
}
```

- [ ] **Step 2: Run the overlap regression test — must now fully pass**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts -t "no two buildings overlap"`
Expected: PASS for all three settlement types, all 5 seeds.

- [ ] **Step 3: Full unit suite + typecheck (Section A verification pass)**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests green.

- [ ] **Step 4: Build check**

Run: `npx vite build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/world/SettlementGenerator.ts
git commit -m "fix(settlement): scale city quadrant grid from real building footprints

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Section B — Route building interiors through sceneManager.loadDungeon()

### Task 6: Thread `Faction` through `OverworldScene`'s building data

**Files:**
- Modify: `src/world/buildings/BuildingTypeMap.ts` (add `settlementTypeToFaction`)
- Modify: `src/scene/OverworldScene.ts:132` (`_buildingData` type), `:531` (`getNearestBuilding` return type), `:438` and surrounding (no change needed there — different registry), `:~1730-1780` (`_buildStudioSettlementPreview`'s push), `:~1830-1848` (`_buildSettlements`'s push)
- Test: `tests/world/BuildingTypeMap.test.ts` (create, or extend if one already exists — check first with `ls tests/world/`)

**Interfaces:**
- Consumes: `type Faction`, `type SettlementType` (from `../SettlementGenerator`, already imported in `BuildingTypeMap.ts`).
- Produces: `settlementTypeToFaction(type: SettlementType): Faction`, exported from `BuildingTypeMap.ts` — consumed by Task 8 (`main.ts`'s `getNearestBuilding()` caller doesn't need this directly, but `OverworldScene._buildSettlements()` does). `OverworldScene._buildingData` items and `getNearestBuilding()`'s return type both gain a `faction: Faction` field — consumed by Task 8.

- [ ] **Step 1: Check for an existing BuildingTypeMap test file**

Run: `ls tests/world/ 2>/dev/null | grep -i buildingtypemap`
If a file exists, read it and add the new test to its existing `describe` structure instead of creating a new file. If none exists, create `tests/world/BuildingTypeMap.test.ts` as below.

- [ ] **Step 2: Write the failing test**

Create (or append to) `tests/world/BuildingTypeMap.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { settlementTypeToFaction } from '@/world/buildings/BuildingTypeMap';

describe('settlementTypeToFaction', () => {
  it('maps each settlement tier to a distinct human Faction', () => {
    expect(settlementTypeToFaction('village')).toBe('human_rural');
    expect(settlementTypeToFaction('town')).toBe('human_town');
    expect(settlementTypeToFaction('city')).toBe('human_noble');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/world/BuildingTypeMap.test.ts`
Expected: FAIL — `settlementTypeToFaction` is not exported yet.

- [ ] **Step 4: Add `settlementTypeToFaction` to `BuildingTypeMap.ts`**

In `src/world/buildings/BuildingTypeMap.ts`, add `type Faction` to the existing `BuildingDNA` import block (it currently imports `STYLE_COLORS, type BuildingDNA, type BuildingStyle` from `./BuildingDNA` — per Task 1 Step 4's replacement):

```typescript
import {
  STYLE_COLORS,
  type BuildingDNA,
  type BuildingStyle,
  type Faction,
} from './BuildingDNA';
```

Then add this function anywhere after the `TIER_STYLES` constant (e.g. directly below it):

```typescript
/**
 * Maps a settlement tier to the Faction used to derive its buildings' style
 * preset (via factionBuildingDna()) when routing building interiors through
 * buildingToDungeonPlan(). Mirrors TIER_STYLES' existing style intent
 * (village=thatched/rural, town=timber, city=stone/noble).
 */
export function settlementTypeToFaction(type: SettlementType): Faction {
  switch (type) {
    case 'village': return 'human_rural';
    case 'town':    return 'human_town';
    case 'city':    return 'human_noble';
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/world/BuildingTypeMap.test.ts`
Expected: PASS

- [ ] **Step 6: Add `faction` to `OverworldScene._buildingData` and `getNearestBuilding()`**

In `src/scene/OverworldScene.ts`, change line 132 from:

```typescript
  private readonly _buildingData: Array<{ dna: BuildingDNA; pos: THREE.Vector3 }> = [];
```

to:

```typescript
  /** DNA + world-space position + faction per placed building — used for building-entry proximity
   *  and to derive a matching interior style via buildingToDungeonPlan(). */
  private readonly _buildingData: Array<{ dna: BuildingDNA; pos: THREE.Vector3; faction: Faction }> = [];
```

Change the `getNearestBuilding()` method (around line 531) from:

```typescript
  getNearestBuilding(pos: THREE.Vector3, maxDist = 4): { dna: BuildingDNA; pos: THREE.Vector3 } | null {
    let best: { dna: BuildingDNA; pos: THREE.Vector3 } | null = null;
```

to:

```typescript
  getNearestBuilding(pos: THREE.Vector3, maxDist = 4): { dna: BuildingDNA; pos: THREE.Vector3; faction: Faction } | null {
    let best: { dna: BuildingDNA; pos: THREE.Vector3; faction: Faction } | null = null;
```

(the loop body below is unchanged — `bd` already carries the full object, including the new `faction` field, once Step 7 below populates it).

- [ ] **Step 7: Populate `faction` at both `_buildingData.push()` call sites**

Add the import at the top of `src/scene/OverworldScene.ts`, alongside the existing `createSettlementBuildingDna` import (line 42):

```typescript
import { createSettlementBuildingDna, settlementTypeToFaction } from '@/world/buildings/BuildingTypeMap';
```

In `_buildStudioSettlementPreview()` (around line 1775), change:

```typescript
      this._buildingGroups.push(grp);
      this._buildingData.push({ dna, pos: new THREE.Vector3(wx, wy, wz) });
      buildingCount++;
```

to:

```typescript
      this._buildingGroups.push(grp);
      this._buildingData.push({ dna, pos: new THREE.Vector3(wx, wy, wz), faction: runtimeFaction });
      buildingCount++;
```

(`runtimeFaction` is already computed earlier in this method via `this._mapStudioFactionToRuntimeFaction(payload.faction)` — no new variable needed.)

In `_buildSettlements()` (around line 1854), change:

```typescript
        const dna = createSettlementBuildingDna(b, plan.type);
        const inst = buildBuilding(dna);
        const grp = inst.exteriorGroup;
        grp.position.set(wx, wy, wz);
        grp.rotation.y = b.rotation;
        this._buildingGroups.push(grp);
        this._buildingData.push({ dna, pos: new THREE.Vector3(wx, wy, wz) });
```

to:

```typescript
        const dna = createSettlementBuildingDna(b, plan.type);
        const inst = buildBuilding(dna);
        const grp = inst.exteriorGroup;
        grp.position.set(wx, wy, wz);
        grp.rotation.y = b.rotation;
        this._buildingGroups.push(grp);
        this._buildingData.push({ dna, pos: new THREE.Vector3(wx, wy, wz), faction: settlementTypeToFaction(plan.type) });
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `main.ts`'s debug `spawnBuildingNearPlayer` (which does `(overworld as any)?._buildingData?.push({ dna, pos: ... })`, cast through `any`) shows no error here — that's expected since the cast bypasses the type checker; it will be fixed for real behavior in Task 10.

- [ ] **Step 9: Run full test suite**

Run: `npx vitest run`
Expected: all green (no existing test reads `_buildingData` directly, so this is a low-risk structural change).

- [ ] **Step 10: Commit**

```bash
git add src/world/buildings/BuildingTypeMap.ts src/scene/OverworldScene.ts tests/world/BuildingTypeMap.test.ts
git commit -m "feat(overworld): thread Faction through building data for interior generation

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Add `getStaircaseTrigger()` and `loadedFloorCount` to `SceneManager`

**Files:**
- Modify: `src/levels/SceneManager.ts` (near `loadDungeon()` at line ~189 and `getStaircaseHint()` at line ~246)
- Test: `tests/levels/sceneManager.test.ts` (check if it exists first; if not, check `tests/levels/` for the closest existing SceneManager test file to extend, otherwise create)

**Interfaces:**
- Consumes: `DungeonPlan` (from `./DungeonGenerator`, unchanged), `Blueprint.floor: number` (existing field), `RenderedRoom.doorTriggers: DoorTrigger[]` where `DoorTrigger = { targetId: string | null; direction?: 'up' | 'down'; cx: number; cz: number; hx: number; hz: number }` (existing, from `src/levels/BlueprintRenderer.ts`).
- Produces: `SceneManager.getStaircaseTrigger(direction: 'up' | 'down'): { x: number; y: number; z: number } | null`, `SceneManager.loadedFloorCount: number` (getter) — both consumed by Task 10 (`main.ts`'s debug API + e2e test rewrite).

- [ ] **Step 1: Check for an existing SceneManager test file**

Run: `find tests -iname "*scenemanager*"`
If found, read it to match its existing style/imports/mocking approach before adding new tests. If none exists, create `tests/levels/sceneManager.test.ts` using the pattern below — first check how `SceneManager` is constructed elsewhere (it takes `scene`, `physics`, and blueprint JSON in its constructor per `src/levels/SceneManager.ts:117-119`); mirror whatever existing test/mocking pattern for `PhysicsWorld`/`THREE.Scene` is used elsewhere in the test suite (search `grep -rl "new SceneManager(" tests/ src/` if unsure), since this file's exact constructor signature/mocking needs isn't in scope of this plan's research — use `buildingToDungeonPlan()` + `loadDungeon()` directly against a real `SceneManager` instance if a working test harness for it already exists, otherwise write the test as an integration-style check colocated with the `buildingToDungeonPlan.ts` tests below in Task 8 instead (that file already exercises `DungeonPlan` shapes without needing a live `SceneManager`).

Given the higher setup cost of instantiating a full `SceneManager` in a unit test, **skip a dedicated SceneManager unit test for this task** and instead verify `getStaircaseTrigger()`/`loadedFloorCount` indirectly via the `buildingToDungeonPlan.ts` structural test in Task 8 (which checks the `DungeonPlan`'s `doorTriggers`/`floor` data these two methods read) plus the Playwright e2e coverage in Task 10 (which exercises them through the real running game). This keeps Task 7 a pure implementation step with verification deferred to Task 10, which is the task that actually depends on these methods working correctly end-to-end.

- [ ] **Step 2: Add a `_lastLoadedRoomIds` tracking set and the `loadDungeon()` update**

In `src/levels/SceneManager.ts`, find the private field declarations near `private currentRoom: RenderedRoom | null = null;` (line ~40) and add a new field directly after it:

```typescript
  private currentRoom: RenderedRoom | null = null;
  /** Room IDs registered by the most recent loadDungeon() call — used by
   *  loadedFloorCount to report only the active plan's floor count, not
   *  every blueprint ever registered (including the base tower rooms). */
  private _lastLoadedRoomIds: Set<string> = new Set();
```

Then update `loadDungeon()` (currently lines 189-195) from:

```typescript
  loadDungeon(plan: import('./DungeonGenerator').DungeonPlan): void {
    for (const [, bp] of plan.rooms) {
      this.registerBlueprint(bp);
    }
    this._startRoomId = plan.startRoomId;
    this.loadRoomImmediate(plan.startRoomId);
  }
```

to:

```typescript
  loadDungeon(plan: import('./DungeonGenerator').DungeonPlan): void {
    this._lastLoadedRoomIds = new Set(plan.rooms.keys());
    for (const [, bp] of plan.rooms) {
      this.registerBlueprint(bp);
    }
    this._startRoomId = plan.startRoomId;
    this.loadRoomImmediate(plan.startRoomId);
  }
```

- [ ] **Step 3: Add `getStaircaseTrigger()` and `loadedFloorCount`**

Directly after the existing `getStaircaseHint()` method (ends around line 261, just before the `/** Enemies the player can target with attacks this frame. */` comment), add:

```typescript
  /**
   * Returns the world-space (x, y, z) position of the current room's
   * staircase trigger in the given direction, or null if this room has none.
   * Unlike getStaircaseHint(), there is no proximity range limit — used by
   * debug tooling/e2e tests to teleport the player directly to a known
   * staircase rather than needing to walk into range first.
   */
  getStaircaseTrigger(direction: 'up' | 'down'): { x: number; y: number; z: number } | null {
    if (!this.currentRoom) return null;
    for (const t of this.currentRoom.doorTriggers) {
      if (t.direction === direction) return { x: t.cx, y: 1.5, z: t.cz };
    }
    return null;
  }

  /**
   * Number of distinct floors registered by the most recently loaded
   * loadDungeon() plan. Used by debug tooling/e2e tests to verify a
   * generated dungeon/building's total floor count.
   */
  get loadedFloorCount(): number {
    const floors = new Set<number>();
    for (const id of this._lastLoadedRoomIds) {
      const bp = this.blueprints.get(id);
      if (bp) floors.add(bp.floor);
    }
    return floors.size;
  }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: all green — this task only adds new methods/fields, no existing behavior changed.

- [ ] **Step 6: Commit**

```bash
git add src/levels/SceneManager.ts
git commit -m "feat(scenemanager): add getStaircaseTrigger() and loadedFloorCount for building-interior debug API

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Add a structural test for `buildingToDungeonPlan()` (pre-existing function, currently untested at this integration point)

**Files:**
- Test: `tests/buildingToDungeonPlan.test.ts` (check if one exists first: `find tests -iname "*buildingtodungeonplan*"`)

**Interfaces:**
- Consumes: `buildingToDungeonPlan(kind, faction, seed, size, floors): DungeonPlan` (existing, unmodified function from `src/buildingToDungeonPlan.ts`).
- Produces: a regression check confirming the exact properties Task 9's live wiring and Task 10's e2e rewrite depend on (`spawns: []` on every room, `floor` numbering, `doors` with `targetId: null` for the exterior door).

- [ ] **Step 1: Check for an existing test file**

Run: `find tests -iname "*buildingtodungeonplan*"`
If one exists, read it fully and skip to Step 4 if it already covers the properties below — otherwise extend it. If none exists, create it per Step 2.

- [ ] **Step 2: Write the test**

Create `tests/buildingToDungeonPlan.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildingToDungeonPlan } from '@/buildingToDungeonPlan';

describe('buildingToDungeonPlan', () => {
  it('produces a DungeonPlan with a valid startRoomId and no enemy spawns', () => {
    const plan = buildingToDungeonPlan('cottage', 'human_rural', 12345, 'tiny', 1);
    expect(plan.startRoomId).toBeTruthy();
    expect(plan.rooms.has(plan.startRoomId)).toBe(true);
    for (const [, bp] of plan.rooms) {
      expect(bp.spawns).toEqual([]);
    }
  });

  it('single-floor buildings have no up/down staircase doors', () => {
    const plan = buildingToDungeonPlan('cottage', 'human_rural', 12345, 'tiny', 1);
    for (const [, bp] of plan.rooms) {
      expect(bp.doors.every(d => d.facing === 'north' || d.facing === 'south' || d.facing === 'east' || d.facing === 'west')).toBe(true);
    }
    // Exactly one exterior door (targetId: null) across the whole plan
    const exteriorDoors = [...plan.rooms.values()].flatMap(bp => bp.doors).filter(d => d.targetId === null);
    expect(exteriorDoors.length).toBe(1);
  });

  it('multi-floor buildings register rooms across all requested floors', () => {
    const plan = buildingToDungeonPlan('inn', 'human_town', 999, 'small', 2);
    const floors = new Set([...plan.rooms.values()].map(bp => bp.floor));
    expect(floors.size).toBeGreaterThanOrEqual(1);
    expect(Math.max(...floors)).toBeLessThanOrEqual(1); // floors are 0-indexed, 2 floors → max index 1
  });
});
```

- [ ] **Step 3: Run test to verify it passes (this is characterization of existing behavior, not new code)**

Run: `npx vitest run tests/buildingToDungeonPlan.test.ts`
Expected: PASS. If any assertion fails, read `src/buildingToDungeonPlan.ts` again carefully and correct the test's expectation to match actual (already-correct) behavior — do not modify `buildingToDungeonPlan.ts` itself in this task; it is not part of this plan's scope.

- [ ] **Step 4: Commit**

```bash
git add tests/buildingToDungeonPlan.test.ts
git commit -m "test: characterize buildingToDungeonPlan output shape ahead of live wiring

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Wire live building entry/exit through `buildingToDungeonPlan()` + `sceneManager.loadDungeon()`

**Files:**
- Modify: `src/main.ts` — multiple regions: imports (top of file), state declarations (~lines 289-303), `_mountInterior`/`_unmountInterior`/`enterBuildingInterior`/`_switchBuildingFloor`/`leaveBuildingInterior` (~lines 357-440, delete), the "Building interior entry/exit" per-frame block (~lines 2459-2515, delete), the exterior-prompt `_bld`/`nearBuilding` block (~line 2587, extend), the `[E]`-press "Generic building" branch (~lines 2772-2793, replace), the debug `window.__game` object (~lines 1787-1799, update)

**Interfaces:**
- Consumes: `buildingToDungeonPlan(kind: BuildingKind, faction: Faction, seed: number, size: BuildingSize, floors: 1|2|3|4): DungeonPlan` (from `@/buildingToDungeonPlan`), `overworld.getNearestBuilding(pos, maxDist): { dna: BuildingDNA; pos: THREE.Vector3; faction: Faction } | null` (Task 6's updated return type), `sceneManager.loadDungeon(plan: DungeonPlan): void` (existing), `_activeDungeonEntrancePos: THREE.Vector3 | null` (existing var, line 607), `switchToExterior()` (existing, unchanged — already restores `_activeDungeonEntrancePos` on exit).
- Produces: `main.ts` no longer exports/uses `_inBuildingInterior`, `_activeBuildingDna`, `_currentBuildingFloor`, `_activeInterior`, `INTERIOR_Y`, `enterBuildingInterior`, `_mountInterior`, `_unmountInterior`, `_switchBuildingFloor`, `leaveBuildingInterior` — all removed. Building interiors now use the same `gameMode`/`sceneManager` state as dungeons.

- [ ] **Step 1: Add the `buildingToDungeonPlan` import**

At the top of `src/main.ts`, alongside the existing `import { generateDungeon, type DungeonPlan } from '@/levels/DungeonGenerator';` (line 33), add:

```typescript
import { buildingToDungeonPlan } from '@/buildingToDungeonPlan';
```

- [ ] **Step 2: Remove the old building-interior state and mount/unmount/enter/switch/leave functions**

In `src/main.ts`, delete these blocks entirely:

1. Lines 289-303 (state block):
```typescript
  // ── Building interior overlay (while gameMode stays 'exterior') ────
  let _inBuildingInterior = false;
  let _buildingReturnPos  = new THREE.Vector3();
  let _activeBuildingDna: import('@/world/buildings/BuildingDNA').BuildingDNA | null = null;
  let _currentBuildingFloor = 0;
  let _activeInterior: {
    scene:     import('@/world/buildings/InteriorGenerator').InteriorScene;
    floorBody: import('@dimforge/rapier3d-compat').RigidBody;
  } | null = null;
```
Also delete the now-unused line just below it:
```typescript
  /** Y offset above terrain where building interiors are shown. */
  const INTERIOR_Y = 200;
```
(Keep the `_occlusionMgr`-related lines in between — those are unrelated to building interiors.)

2. The five functions `_mountInterior`, `_unmountInterior`, `enterBuildingInterior`, `_switchBuildingFloor`, `leaveBuildingInterior` (the full block from the `/** Shared interior mount: ... */` comment through the closing `}` of `leaveBuildingInterior`, currently lines ~357-440) — delete the entire block, from:

```typescript
  /** Shared interior mount: loads a generated floor, positions it at INTERIOR_Y. */
  async function _mountInterior(
```

through:

```typescript
  /** Leave the current building interior and return to exterior. */
  function leaveBuildingInterior(): void {
    if (!_inBuildingInterior || !_activeInterior) return;
    _doFade(() => {
      _unmountInterior();
      _inBuildingInterior   = false;
      _activeBuildingDna    = null;
      _currentBuildingFloor = 0;
      player.teleport(_buildingReturnPos);
      console.log('[buildingInterior] exited');
    });
  }
```

(the next line after this deleted block is `function _makeOverworld(seed: number): OverworldScene {` — leave that and everything after it as-is).

- [ ] **Step 3: Remove the per-frame "Building interior entry/exit" block**

In the per-frame update (inside the `if (gameMode === 'exterior' && overworld)` branch), delete the entire block from:

```typescript
        // ── Building interior entry / exit ────────────────────────────────
        if (_inBuildingInterior) {
```

through its matching closing brace, ending at:

```typescript
          } else {
            // (prompt cleared below in the existing exterior-prompt block)
          }
        }
```

(This is the full ~57-line block shown in the "Files" section reference at ~lines 2459-2515. After deletion, the code that immediately follows should be `solmorPresence.update(dt);   // E2: bob + anim tick` — confirm this line is now directly reachable with no dangling braces.)

- [ ] **Step 4: Extend the exterior-prompt block to also check generic buildings**

Find this block (in the exterior interaction-prompt section):

```typescript
              const _bld = overworld.nearBuilding(_pos);
              if (_bld) {
                _setExteriorPrompt(_bld.label);
              } else {
                // NPC talk check
```

Replace with:

```typescript
              const _bld = overworld.nearBuilding(_pos);
              if (_bld) {
                _setExteriorPrompt(_bld.label);
              } else {
                const _genBld = overworld.getNearestBuilding(_pos, 4);
                if (_genBld) {
                  _setExteriorPrompt(`Enter ${_genBld.dna.buildingKind}`);
                } else {
                // NPC talk check
```

Because this changes the brace nesting, also add one matching closing `}` right before the existing closing braces of this `if`/`else` chain. Concretely, the full updated block (matching against the surrounding code shown in `src/main.ts`'s "Update exterior interaction prompt" section) becomes:

```typescript
            const _cave = overworld.nearCaveEntrance(_pos);
            const _glade = !_cave ? overworld.nearGladeEntrance(_pos) : null;
            if (_cave) {
              _setExteriorPrompt('🕳 Cave Entrance');
            } else if (_glade) {
              _setExteriorPrompt('🌿 Glade');
            } else {
              const _bld = overworld.nearBuilding(_pos);
              if (_bld) {
                _setExteriorPrompt(_bld.label);
              } else {
                const _genBld = overworld.getNearestBuilding(_pos, 4);
                if (_genBld) {
                  _setExteriorPrompt(`Enter ${_genBld.dna.buildingKind}`);
                } else {
                  // NPC talk check
                  const _nearNPC = overworld.nearestNPC(_pos);
                  if (_nearNPC) {
                    _setExteriorPrompt(`Talk to ${_nearNPC}`);
                  } else {
                    // Watch Perch guard assignment
                    const _wp = baseScene.nearWatchPerch(_pos);
                    if (_wp && party.members.some(m => !m.isGuarding)) {
                      _setExteriorPrompt('🗼 Assign guard');
                    } else {
                      const _res = overworld.nearResourceNode(_pos);
                      const _LABELS: Record<string, string> = { ore: '⛏ Mine ore', timber: '🪵 Chop timber', essence: '✨ Harvest essence' };
                      _setExteriorPrompt(_res ? (_LABELS[_res.node.type] ?? 'Harvest') : null);
                    }
                  }
                }
              }
            }
```

(This is the same structure as before with one new `if (_genBld) { ... } else { ... }` level inserted — every other line is unchanged, just re-indented one level deeper. Use this full block to replace the original one exactly, rather than trying to hand-edit braces.)

- [ ] **Step 5: Replace the dead "Generic building" branch in the `[E]`-press handler**

Find this block (the final `else` branch inside the dungeon/cave/glade/watch-perch `[E]`-press handler):

```typescript
              } else {
                const bld = overworld.nearBuilding(player.group.position);
                if (bld) {
                  if (bld.type === 'greenhouse') {
                    // Load the greenhouse interior dungeon
                    const ghPlan = generateGreenhouse(currentSeed ^ 0x6745_23f1);
                    overworld.exit();
                    gameMode = 'interior';
                    scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
                    sceneManager.loadDungeon(ghPlan);
                    player.teleport(new THREE.Vector3(0, 1.5, 8));
                  } else {
                    // Generic building — load a random dungeon floor
                    const bldSeed = currentSeed ^ 0xCAFE_BABE;
                    const bldPlan = generateDungeon(bldSeed, 1);
                    overworld.exit();
                    gameMode = 'interior';
                    scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
                    sceneManager.loadDungeon(bldPlan);
                  }
                }
              }
```

Replace with:

```typescript
              } else {
                const bld = overworld.nearBuilding(player.group.position);
                if (bld && bld.type === 'greenhouse') {
                  // Load the greenhouse interior dungeon
                  const ghPlan = generateGreenhouse(currentSeed ^ 0x6745_23f1);
                  overworld.exit();
                  gameMode = 'interior';
                  scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
                  sceneManager.loadDungeon(ghPlan);
                  player.teleport(new THREE.Vector3(0, 1.5, 8));
                } else {
                  const genBld = overworld.getNearestBuilding(player.group.position, 4);
                  if (genBld) {
                    const bldPlan = buildingToDungeonPlan(
                      genBld.dna.buildingKind, genBld.faction, genBld.dna.seed,
                      genBld.dna.size, genBld.dna.floors,
                    );
                    _activeDungeonEntrancePos = player.group.position.clone();
                    overworld.exit();
                    gameMode = 'interior';
                    scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
                    sceneManager.loadDungeon(bldPlan);
                    player.teleport(new THREE.Vector3(0, 1.5, 8));
                  }
                }
              }
```

Note: `_activeDungeonId` is intentionally left untouched/`null` here (matches the design spec — buildings should never get marked "cleared" via `discoveryTracker.markDungeonCleared()`, which only fires in `switchToExterior()` when `_activeDungeonId !== null`).

- [ ] **Step 6: Update the debug `window.__game` API**

In the `window.__game` object literal (~lines 1787-1799), replace:

```typescript
      /** Building interior state — used by E2E tests. */
      isInBuildingInterior: () => _inBuildingInterior,
      getBuildingFloor:     () => _currentBuildingFloor,
      getBuildingTotalFloors: () => _activeInterior?.scene.totalFloors ?? 0,
      getBuildingStairUpPos: () => {
        const p = _activeInterior?.scene.stairUpPos;
        if (!p) return null;
        // root-local XZ + INTERIOR_Y for world Y
        return { x: p.x, y: INTERIOR_Y + p.y + 1.2, z: p.z };
      },
      getBuildingStairDownPos: () => {
        const p = _activeInterior?.scene.stairDownPos;
        if (!p) return null;
        return { x: p.x, y: INTERIOR_Y + p.y + 1.2, z: p.z };
      },
```

with:

```typescript
      /** Building interior state — used by E2E tests. Buildings now route through the
       *  same sceneManager.loadDungeon() system as real dungeons/the greenhouse. */
      isInBuildingInterior:   () => gameMode === 'interior',
      getBuildingFloor:       () => sceneManager.currentFloor,
      getBuildingTotalFloors: () => sceneManager.loadedFloorCount,
      getBuildingStairUpPos: () => {
        const t = sceneManager.getStaircaseTrigger('up');
        return t ? { x: t.x, y: t.y, z: t.z } : null;
      },
      getBuildingStairDownPos: () => {
        const t = sceneManager.getStaircaseTrigger('down');
        return t ? { x: t.x, y: t.y, z: t.z } : null;
      },
```

Then find `spawnBuildingNearPlayer` (a few lines below) and update its `_buildingData.push()` call (currently `(overworld as any)?._buildingData?.push({ dna, pos: new THREE.Vector3(bx, 0, bz) });`) to include a `faction`:

```typescript
              // Register in overworld building data so getNearestBuilding finds it
              (overworld as any)?._buildingData?.push({
                dna, pos: new THREE.Vector3(bx, 0, bz), faction: 'human_town',
              });
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If there are leftover references to removed identifiers (`_inBuildingInterior`, `_activeInterior`, etc.) anywhere else in `main.ts`, `tsc` will report them — grep to confirm none remain: `grep -n "_inBuildingInterior\|_activeBuildingDna\|_currentBuildingFloor\|_activeInterior\|_mountInterior\|_unmountInterior\|_switchBuildingFloor\|enterBuildingInterior\|leaveBuildingInterior\|INTERIOR_Y" src/main.ts` should return no matches.

- [ ] **Step 8: Run full unit test suite**

Run: `npx vitest run`
Expected: all green (no unit test directly exercises `main.ts`'s internal building-interior state — this is covered by the e2e suite in Task 10).

- [ ] **Step 9: Build check**

Run: `npx vite build`
Expected: build succeeds with no errors, no unused-import warnings for anything removed in this task.

- [ ] **Step 10: Commit**

```bash
git add src/main.ts
git commit -m "feat(buildings): route live building interiors through sceneManager.loadDungeon()

Removes the old _mountInterior overlay system (fixed INTERIOR_Y=200 offset,
player never truly left the overworld scene) in favor of the same dungeon-style
per-room routing dungeons and the greenhouse already use, via
buildingToDungeonPlan(). Building interiors are now real (0-height) rooms
with generic stair/door navigation handled entirely by SceneManager — no
building-specific floor-switch code needed in main.ts any more.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Update `tests/e2e/building-floors.spec.ts` for the new architecture

**Files:**
- Modify: `tests/e2e/building-floors.spec.ts` (entire file — targeted edits per step below)

**Interfaces:**
- Consumes: the updated debug API from Task 9 (`isInBuildingInterior()`, `getBuildingFloor()`, `getBuildingTotalFloors()`, `getBuildingStairUpPos()`/`getBuildingStairDownPos()` — same method names, new semantics/coordinate scale), `spawnBuildingNearPlayer(kind, style, floors)` (unchanged signature, now pushes a `faction` field internally per Task 9 Step 6).
- Produces: an e2e suite that exercises the new architecture; no other files depend on this one.

- [ ] **Step 1: Remove the stale `INTERIOR_Y`-relative height assertion**

In the `multi-floor building (inn, 2 floors)` test, find:

```typescript
    // The stair-up trigger exists on floor 0
    const stairUp = await page.evaluate(() => (window as any).__game.getBuildingStairUpPos?.());
    expect(stairUp).not.toBeNull();
    expect(stairUp.y).toBeGreaterThan(100); // at INTERIOR_Y
```

Replace with:

```typescript
    // The stair-up trigger exists on floor 0 (buildings are now real-height rooms, not
    // offset to INTERIOR_Y=200 any more — just confirm the trigger has sane coordinates)
    const stairUp = await page.evaluate(() => (window as any).__game.getBuildingStairUpPos?.());
    expect(stairUp).not.toBeNull();
    expect(typeof stairUp.y).toBe('number');
```

- [ ] **Step 2: Confirm the teleport-to-stair calls still work with real-scale Y**

Immediately below (unchanged code, just confirm no other `y > 100`-style assumption exists in the file):

Run: `grep -n "100\|INTERIOR_Y" tests/e2e/building-floors.spec.ts`
Expected: no remaining matches (Step 1 removed the only one). If any other match appears, inspect it — it is very likely unrelated (e.g. a timeout value) and should be left alone.

- [ ] **Step 3: Run the Playwright suite for this file (best-effort)**

Run: `npx playwright test tests/e2e/building-floors.spec.ts --reporter=list`

This requires a running dev server the Playwright config points at; check `playwright.config.ts` for a `webServer` block — if one is configured, Playwright will start it automatically. If the sandbox lacks GPU/WebGL support and tests fail with WebGL-context errors unrelated to building logic (a known environment limitation, not a code bug), note this in the commit message and move on rather than blocking the plan on an environment limitation. If tests run and fail on building-logic assertions specifically (not WebGL/browser-launch errors), fix the underlying `main.ts`/`SceneManager.ts` code from Tasks 7 and 9 until they pass.

Expected: PASS, or a clearly-environment-related failure (WebGL context creation) that is not this plan's concern.

- [ ] **Step 4: Confirm `backroom-building-lab.spec.ts` needs no changes**

Run: `grep -n "getBuildingStairUpPos\|_mountInterior\|generateInterior\|enterBuildingInterior" tests/e2e/backroom-building-lab.spec.ts`

Expected: only a soft/unasserted `getBuildingStairUpPos()` reference (if any), with no dependency on anything removed in Task 9. If this grep reveals a real dependency that was missed during planning, stop and re-scope this task to include the needed fix before proceeding.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/building-floors.spec.ts
git commit -m "test(e2e): update building-floors spec for real-height sceneManager-routed interiors

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 11: Final verification pass, docs, and push

**Files:**
- Modify: `TODO/02-game-world-integration/*.md` and/or `TODO_OVERVIEW.md`/`README.md` — locate the specific building-placement/interior TODO entries (search first: `grep -rl "building" TODO/ | xargs grep -l "interior\|footprint\|placement"`) and mark them done, referencing this plan.

**Interfaces:**
- Consumes: nothing new — this task only runs verification and updates tracking docs.
- Produces: nothing new — final wrap-up task.

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full unit test suite**

Run: `npx vitest run`
Expected: all tests green, including the two new files from Tasks 1, 2, 6, 8 and the updated `settlementGenerator.test.ts` overlap regression.

- [ ] **Step 3: Full production build**

Run: `npx vite build`
Expected: build succeeds with no errors or new warnings.

- [ ] **Step 4: Best-effort full Playwright run**

Run: `npx playwright test --reporter=list`
Expected: PASS or environment-limited (WebGL) failures only, matching Task 10 Step 3's guidance. Do not block completion on environment-only failures, but do investigate and fix any failure that is clearly about building/dungeon logic.

- [ ] **Step 5: Manual smoke check**

Run: `npx vite preview` (or the project's existing manual-smoke-check command used in prior slices this session), then in a browser: start a new game, walk to a settlement, confirm buildings no longer visibly overlap/clip, walk up to a non-greenhouse building, press E, confirm you enter a real dungeon-style interior (not floating at a huge Y offset), navigate any stairs, exit back to the same spot outside the building.

- [ ] **Step 6: Update TODO tracking docs**

Find and update the relevant TODO entries:

```bash
grep -rl "building" TODO/ | xargs grep -l "interior\|footprint\|placement" 2>/dev/null
```

Mark the matching checklist items complete (change `- [ ]` to `- [x]`) and add a one-line note referencing `docs/superpowers/specs/2026-07-28-building-placement-and-interiors-design.md` and this plan file. Update `TODO_OVERVIEW.md`/`README.md` similarly if they summarize this item.

- [ ] **Step 7: Commit and push**

```bash
git add TODO/
git commit -m "docs: mark building placement/interior routing complete in TODO tracking

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push origin cline_work-01_overworld_studio
```
