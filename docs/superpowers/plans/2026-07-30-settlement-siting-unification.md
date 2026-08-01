# Settlement Siting Unification (P1 sub-project 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make settlement positions, counts, names, types, and factions come
from the same `generateRealmData()` realm generator Overworld Studio uses,
replacing `SettlementPlacer.ts`'s independent Poisson-disk placement — while
leaving building layout (`SettlementGenerator.ts`'s plan/apply functions) and
NPC population completely unchanged.

**Architecture:** `SettlementPlacer.ts` calls `generateRealmData(seed, 96, 72,
config.settlementCount)` itself (a second, cheap, deterministic call mirroring
the pattern `buildWorldGrid()` already established in P0), maps each realm
settlement's position onto the live `WorldGrid` via a scale-factor conversion,
snaps invalid positions to the nearest valid tile via an expanding 8-direction
ring search, and enforces existing min-distance constants in city → town →
village priority order. `WorldGenConfig`'s three separate count/toggle fields
collapse into a single `settlementCount`. `SettlementPlan` gains a `faction`
field carried from realm data; settlement `name` now comes from realm data too.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- Full spec: `docs/superpowers/specs/2026-07-30-settlement-siting-unification-design.md`.
- `buildWorldGrid()`'s signature and return type do NOT change (protected invariant since P0).
- `SettlementGenerator.ts`'s `_planVillage`/`_planTown`/`_planCity` internal building-layout logic is NOT modified — only `planSettlement()`'s outer wrapper gains new optional parameters.
- Dungeon-before-settlement ordering in `buildWorldData()` is preserved (`placeDungeons()` still runs first).
- Existing min-distance constants stay: `MIN_DIST_CITY=35`, `MIN_DIST_TOWN=22`, `MIN_DIST_VILLAGE=14`.
- `*.js` duplicate files alongside the `.ts` files being modified in this plan (`SettlementPlacer.js`, `SettlementGenerator.js`, `WorldGenConfig.js`, `MainMenu.js`) are pre-existing stale artifacts (same category as the already-known `enemyLoader`/`towerGenerator`/`talentSystem` `.js`/`.ts` duplicate-pair baseline failures documented from the P0 work) — do NOT touch them, they are out of scope.
- Run `npx vitest run <changed test files>` after each task; run the full suite + `tsc --noEmit` only at the very end (per the established P0 pattern), comparing against the known baseline of 16 pre-existing failures.

---

### Task 1: Collapse settlement count config into a single field

**Files:**
- Modify: `src/world/WorldGenConfig.ts:15-61` (interface + defaults)
- Modify: `tests/levels/settlementGenerator.test.ts:33-35` (BASE_CONFIG)

**Interfaces:**
- Produces: `WorldGenConfig.settlementCount: number` (replaces `villageCount`, `townCount`, `hasCity`). `DEFAULT_WORLD_GEN_CONFIG.settlementCount = 6`.
- Consumes: nothing new.

- [x] **Step 1: Write the failing test**

In `tests/levels/settlementGenerator.test.ts`, replace the `BASE_CONFIG` declaration:

```ts
const BASE_CONFIG: WorldGenConfig = {
  seed: 42, worldSize: 128, riverCount: 2, lakeCount: 0,
  dungeonCount: 2, settlementCount: 3, enemyCampCount: 2,
  assetMode: 'code', assetPacks: [], charMode: 'code', charPacks: [],
};
```

(This alone will fail to compile/typecheck against the current `WorldGenConfig` interface, which still requires `villageCount`/`townCount`/`hasCity` and doesn't know `settlementCount`.)

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts`
Expected: FAIL — TypeScript error or runtime error referencing missing/unknown config fields (vitest's esbuild transform may not catch missing-required-field errors, but the later steps in this task update the `placeSettlements` tests to read `BASE_CONFIG.settlementCount`, which will be `undefined` here and cause assertion failures. If nothing fails yet, proceed to Step 3 first — the important gate is Step 4/6, verified below.)

- [x] **Step 3: Update the `WorldGenConfig` interface and defaults**

In `src/world/WorldGenConfig.ts`, replace lines 26-31:

```ts
  /** Small villages to generate (OW-5). */
  villageCount:   number;
  /** Mid-size towns to generate (OW-5). */
  townCount:      number;
  /** Whether to include one large city (OW-5). */
  hasCity:        boolean;
```

with:

```ts
  /**
   * Total settlements to generate (P1 siting unification). Type
   * (village/town/city) is assigned by the realm algorithm, not
   * user-configurable per type — matches Overworld Studio's `nSettlements`
   * parameter to `generateRealmData()`.
   */
  settlementCount: number;
```

Then replace lines 58-60 (`villageCount: 3, townCount: 1, hasCity: true,`) with:

```ts
  settlementCount: 6,
```

- [x] **Step 4: Run test to verify config compiles**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts`
Expected: still FAIL at this point (the `placeSettlements` describe block further down in this same file still references `BASE_CONFIG.hasCity`/`.townCount`/`.villageCount`, which no longer exist — these get fixed in Task 3). This is expected and will be resolved by Task 3's test updates; do not fix them now.

- [x] **Step 5: Commit**

```bash
git add src/world/WorldGenConfig.ts tests/levels/settlementGenerator.test.ts
git commit -m "Collapse villageCount/townCount/hasCity into settlementCount"
```

---

### Task 2: Thread realm name + faction through `planSettlement()`

**Files:**
- Modify: `src/world/SettlementGenerator.ts:40-66` (interface + function signature), and lines 284, 412, 537 (the three `_planVillage`/`_planTown`/`_planCity` return statements)
- Test: `tests/levels/settlementGenerator.test.ts` (extend `describe('planSettlement', ...)`)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `SettlementPlan.faction: string` (new required field, default `'human'` when not overridden). `planSettlement(type, centerCol, centerRow, seed, grid, name?: string, faction?: string): SettlementPlan` — two new optional trailing parameters; all existing call sites (`SettlementPlacer.ts`, both `.test.ts`/`.js` test files) remain valid unchanged since the new parameters are optional and appended at the end.

- [x] **Step 1: Write the failing test**

In `tests/levels/settlementGenerator.test.ts`, inside `describe('planSettlement', ...)` (after the existing `'plan has a non-empty name'` test), add:

```ts
  it('defaults to faction "human" when no faction is given', () => {
    const g = flatGrid(GW);
    const plan = planSettlement('village', cc, cr, 0x1111, g);
    expect(plan.faction).toBe('human');
  });

  it('accepts an explicit name and faction override', () => {
    const g = flatGrid(GW);
    const plan = planSettlement('town', cc, cr, 0x2222, g, 'Custom Falls', 'elven');
    expect(plan.name).toBe('Custom Falls');
    expect(plan.faction).toBe('elven');
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts -t "faction"`
Expected: FAIL — `plan.faction` is `undefined` (property doesn't exist yet), and the 6-argument call doesn't match the current 5-parameter signature.

- [x] **Step 3: Add `faction` to `SettlementPlan` and update the three plan helpers**

In `src/world/SettlementGenerator.ts`, in the `SettlementPlan` interface (around line 40-49), add a `faction` field:

```ts
export interface SettlementPlan {
  type:       SettlementType;
  name:       string;
  faction:    string;
  centerCol:  number;
  centerRow:  number;
  buildings:  PlacedBuilding[];
  roads:      RoadSegment[];
  /** Rough inhabitant count — drives NPC spawning in OW-6. */
  population: number;
}
```

Then update each of the three return statements to include a default `faction: 'human'` (it gets overridden by `planSettlement()` below if an explicit faction was passed in):

At line 284 (`_planVillage`'s return):
```ts
  return { type: 'village', name, faction: 'human', centerCol: cc, centerRow: cr, buildings, roads,
           population: 8 + Math.floor(rand() * 9) };
```

At line 412 (`_planTown`'s return):
```ts
  return { type: 'town', name, faction: 'human', centerCol: cc, centerRow: cr, buildings, roads,
           population: 25 + Math.floor(rand() * 26) };
```

At line 537 (`_planCity`'s return):
```ts
  return { type: 'city', name, faction: 'human', centerCol: cc, centerRow: cr, buildings, roads,
           population: 80 + Math.floor(rand() * 71) };
```

- [x] **Step 4: Update `planSettlement()`'s signature to accept `name`/`faction` overrides**

Replace the current `planSettlement()` function:

```ts
export function planSettlement(
  type:      SettlementType,
  centerCol: number,
  centerRow: number,
  seed:      number,
  grid:      WorldGrid,
): SettlementPlan {
  const name = generateSettlementName(seed, type);
  switch (type) {
    case 'village': return _planVillage(centerCol, centerRow, seed, grid, name);
    case 'town':    return _planTown(centerCol, centerRow, seed, grid, name);
    case 'city':    return _planCity(centerCol, centerRow, seed, grid, name);
  }
}
```

with:

```ts
export function planSettlement(
  type:      SettlementType,
  centerCol: number,
  centerRow: number,
  seed:      number,
  grid:      WorldGrid,
  name?:     string,
  faction?:  string,
): SettlementPlan {
  const settlementName = name ?? generateSettlementName(seed, type);
  let plan: SettlementPlan;
  switch (type) {
    case 'village': plan = _planVillage(centerCol, centerRow, seed, grid, settlementName); break;
    case 'town':    plan = _planTown(centerCol, centerRow, seed, grid, settlementName); break;
    case 'city':    plan = _planCity(centerCol, centerRow, seed, grid, settlementName); break;
  }
  if (faction !== undefined) plan.faction = faction;
  return plan;
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts`
Expected: PASS — all tests in this file pass, including the two new ones. (The `placeSettlements` describe block further down is still broken from Task 1's config change; that's expected until Task 3.)

- [x] **Step 6: Commit**

```bash
git add src/world/SettlementGenerator.ts tests/levels/settlementGenerator.test.ts
git commit -m "Add faction field and name/faction overrides to planSettlement()"
```

---

### Task 3: Rewrite `SettlementPlacer.ts` to site settlements from realm data

**Files:**
- Modify: `src/world/SettlementPlacer.ts` (full rewrite of the placement algorithm; `SettlementEntry` interface is unchanged)
- Modify: `tests/levels/settlementGenerator.test.ts` (rewrite the `describe('placeSettlements', ...)` block)

**Interfaces:**
- Consumes: `generateRealmData(seed, W, H, nSettlements, shape?, climate?, roughness?): RealmData` from `src/world/RealmGenerator.ts` (existing, from P0). `planSettlement(type, centerCol, centerRow, seed, grid, name?, faction?): SettlementPlan` and `applySettlementToGrid(plan, grid, id): void` from Task 2's updated `SettlementGenerator.ts`. `WorldGenConfig.settlementCount` from Task 1.
- Produces: `placeSettlements(grid: WorldGrid, config: WorldGenConfig, seed: number): SettlementEntry[]` — same signature and `SettlementEntry { id, seed, plan }` shape as before (unchanged), so `WorldGenerator.ts`'s `buildWorldData()` call site needs zero changes.

- [x] **Step 1: Write the failing tests**

In `tests/levels/settlementGenerator.test.ts`, replace the entire `describe('placeSettlements', ...)` block with:

```ts
describe('placeSettlements', () => {
  it('places at most config.settlementCount settlements', () => {
    const g = flatGrid(128);
    const entries = placeSettlements(g, BASE_CONFIG, 42);
    expect(entries.length).toBeLessThanOrEqual(BASE_CONFIG.settlementCount);
  });

  it('produces unique names per settlement', () => {
    const g = flatGrid(128);
    const entries = placeSettlements(g, { ...BASE_CONFIG, settlementCount: 5 }, 99);
    const names = entries.map(e => e.plan.name);
    expect(new Set(names).size).toBeGreaterThan(0);
  });

  it('returns empty array when settlementCount is 0', () => {
    const g = flatGrid(64);
    const entries = placeSettlements(g, { ...BASE_CONFIG, settlementCount: 0 }, 7);
    expect(entries).toHaveLength(0);
  });

  it('is deterministic for the same seed', () => {
    const cfg = { ...BASE_CONFIG, settlementCount: 6 };
    const e1 = placeSettlements(flatGrid(128), cfg, 777);
    const e2 = placeSettlements(flatGrid(128), cfg, 777);
    const summarize = (es: typeof e1) => es.map(e => ({ col: e.plan.centerCol, row: e.plan.centerRow, name: e.plan.name }));
    expect(summarize(e1)).toEqual(summarize(e2));
  });

  it('processes settlements in city -> town -> village priority order', () => {
    const g = flatGrid(128);
    const entries = placeSettlements(g, { ...BASE_CONFIG, settlementCount: 6 }, 42);
    const idsByType: Record<string, number[]> = { city: [], town: [], village: [] };
    for (const e of entries) idsByType[e.plan.type]!.push(e.id);
    const maxCityId    = idsByType.city!.length    ? Math.max(...idsByType.city!)    : -Infinity;
    const minTownId    = idsByType.town!.length    ? Math.min(...idsByType.town!)    : Infinity;
    const maxTownId    = idsByType.town!.length    ? Math.max(...idsByType.town!)    : -Infinity;
    const minVillageId = idsByType.village!.length ? Math.min(...idsByType.village!) : Infinity;
    expect(maxCityId).toBeLessThan(minTownId);
    expect(maxTownId).toBeLessThan(minVillageId);
  });

  it('carries over realm name, faction, and type onto the settlement plan', () => {
    const g = flatGrid(128);
    const cfg = { ...BASE_CONFIG, settlementCount: 6 };
    const realm = generateRealmData(42, 96, 72, cfg.settlementCount);
    const entries = placeSettlements(g, cfg, 42);
    expect(entries.length).toBeGreaterThan(0);
    const realmByName = new Map(realm.settlements.map(s => [s.name, s]));
    for (const e of entries) {
      const src = realmByName.get(e.plan.name);
      expect(src).toBeDefined();
      expect(e.plan.type).toBe(src!.size);
      expect(e.plan.faction).toBe(src!.faction);
    }
  });

  it('enforces minimum spacing between placed settlements by (later-placed) type', () => {
    const g = flatGrid(128);
    const entries = placeSettlements(g, { ...BASE_CONFIG, settlementCount: 6 }, 42);
    const MIN_DIST: Record<string, number> = { city: 35, town: 22, village: 14 };
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]!.plan, b = entries[j]!.plan; // b was placed after a
        const dist = Math.hypot(a.centerCol - b.centerCol, a.centerRow - b.centerRow);
        expect(dist).toBeGreaterThanOrEqual(MIN_DIST[b.type]! - 0.001);
      }
    }
  });

  it('never sites a settlement on a tile pre-occupied by a dungeon', () => {
    const g = flatGrid(128);
    for (let row = 60; row <= 68; row++) {
      for (let col = 60; col <= 68; col++) {
        g.set(col, row, { content: 'dungeon' });
      }
    }
    const entries = placeSettlements(g, { ...BASE_CONFIG, settlementCount: 3 }, 11);
    for (const e of entries) {
      const inBlockedZone = e.plan.centerCol >= 60 && e.plan.centerCol <= 68 &&
                             e.plan.centerRow >= 60 && e.plan.centerRow <= 68;
      expect(inBlockedZone).toBe(false);
    }
  });

  it('drops all settlements when the entire grid is invalid terrain', () => {
    const g = new WorldGrid(64, 64);
    for (let row = 0; row < 64; row++) {
      for (let col = 0; col < 64; col++) {
        g.set(col, row, { elevation: 1, biome: 'water', content: 'empty', feature: 'none', walkable: false });
      }
    }
    const entries = placeSettlements(g, { ...BASE_CONFIG, settlementCount: 3 }, 5);
    expect(entries).toHaveLength(0);
  });
});
```

Add the missing import at the top of the file (alongside the existing imports):

```ts
import { generateRealmData } from '@/world/RealmGenerator';
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts -t "placeSettlements"`
Expected: FAIL — `placeSettlements` still reads `config.hasCity`/`.townCount`/`.villageCount` (now `undefined`), so it currently produces 0 settlements regardless of seed, failing the "places at most" / "unique names" / "priority order" / "carries over" / "minimum spacing" tests (their positive-count expectations won't hold).

- [x] **Step 3: Rewrite `src/world/SettlementPlacer.ts`**

Replace the entire file contents with:

```ts
/**
 * SettlementPlacer — sites settlements using positions from the same realm
 * generator Overworld Studio uses (P1 sub-project 1: settlement siting
 * unification — see TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md
 * and docs/superpowers/specs/2026-07-30-settlement-siting-unification-design.md).
 *
 * Placement strategy:
 *   1. Call generateRealmData(seed, 96, 72, config.settlementCount) to get
 *      realm.settlements — the same positions/names/types/factions Studio's
 *      realm-map preview shows for this seed.
 *   2. Map each realm settlement's (x, y) onto this WorldGrid's (col, row)
 *      using the grid's scale factor relative to the realm's 96x72 shape.
 *   3. If the mapped tile is invalid (water/wrong elevation/tower flat
 *      zone/rim/occupied), search outward in expanding 8-direction rings
 *      for the nearest valid tile (snap) — same nudge pattern
 *      RealmGenerator.ts uses for its own tower-placement search.
 *   4. Enforce minimum tile-distance between settlements, processed in
 *      city -> town -> village priority order. Drop a settlement if no
 *      valid, sufficiently-spaced tile can be found.
 *   5. Call planSettlement() + applySettlementToGrid() for each, passing
 *      the realm's name/faction through so live and Studio agree on both.
 */

import type { WorldGrid }      from './WorldGrid';
import type { WorldGenConfig } from './WorldGenConfig';
import { planSettlement, applySettlementToGrid } from './SettlementGenerator';
import type { SettlementPlan, SettlementType }   from './SettlementGenerator';
import { generateRealmData }   from './RealmGenerator';

// Minimum tile-distance between any two settlement centers.
const MIN_DIST_CITY    = 35;
const MIN_DIST_TOWN    = 22;
const MIN_DIST_VILLAGE = 14;

const MIN_DIST_BY_TYPE: Record<SettlementType, number> = {
  city:    MIN_DIST_CITY,
  town:    MIN_DIST_TOWN,
  village: MIN_DIST_VILLAGE,
};

// Placement/min-distance check priority: city first, then town, then village.
const PRIORITY_BY_TYPE: Record<SettlementType, number> = { city: 0, town: 1, village: 2 };

// 8-directional nudge offsets — same pattern RealmGenerator.ts uses for its
// own tower-placement search.
const DIRS8: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]];

// Bounded number of times to retry snapping after excluding a too-close
// candidate tile, before giving up and dropping the settlement.
const MAX_SNAP_RETRIES = 8;

export interface SettlementEntry {
  id:   number;
  seed: number;
  plan: SettlementPlan;
}

export function placeSettlements(
  grid:   WorldGrid,
  config: WorldGenConfig,
  seed:   number,
): SettlementEntry[] {
  const GW  = grid.width;
  const GH  = grid.height;
  const GHW = (GW - 1) / 2;
  const GHH = (GH - 1) / 2;
  const FR  = Math.round(GHW * 0.28);

  // Habitable annulus: outside 2xFR (tower area) and inside 0.82xGHW (before rim).
  const innerR = FR * 2.0;
  const outerR = GHW * 0.82;

  // Bounded ring-search radius: enough to cross the whole grid in the worst case.
  const maxSnapRadius = Math.ceil(Math.max(GHW, GHH));

  const realm = generateRealmData(seed, 96, 72, config.settlementCount);

  function realmToGrid(x: number, y: number): { col: number; row: number } {
    return {
      col: Math.floor((x * GW) / realm.W),
      row: Math.floor((y * GH) / realm.H),
    };
  }

  function isValidTile(col: number, row: number, occupied: Set<string>): boolean {
    if (col < 2 || col >= GW - 2 || row < 2 || row >= GH - 2) return false;
    if (occupied.has(`${col},${row}`)) return false;

    const dc = col - GHW, dr = row - GHH;
    const tR = Math.sqrt(dc * dc + dr * dr);
    if (tR < innerR || tR > outerR) return false;

    const cell = grid.get(col, row);
    if (cell.biome === 'water')                    return false;
    if (cell.feature === 'river')                  return false;
    if (cell.elevation < 1 || cell.elevation > 2)  return false;
    if (cell.content !== 'empty')                  return false;
    return true;
  }

  function snapToValidTile(col: number, row: number, occupied: Set<string>): { col: number; row: number } | null {
    if (isValidTile(col, row, occupied)) return { col, row };
    for (let r = 1; r <= maxSnapRadius; r++) {
      for (const [dr, dc] of DIRS8) {
        const nc = col + dc * r;
        const nr = row + dr * r;
        if (isValidTile(nc, nr, occupied)) return { col: nc, row: nr };
      }
    }
    return null;
  }

  function tooCloseToPlaced(
    col: number, row: number, minDist: number,
    placements: Array<{ col: number; row: number }>,
  ): boolean {
    for (const p of placements) {
      const dc = col - p.col, dr = row - p.row;
      if (Math.sqrt(dc * dc + dr * dr) < minDist) return true;
    }
    return false;
  }

  const ordered = [...realm.settlements].sort(
    (a, b) => PRIORITY_BY_TYPE[a.size] - PRIORITY_BY_TYPE[b.size],
  );

  const placements: Array<{ col: number; row: number }> = [];
  const entries: SettlementEntry[] = [];
  const occupied = new Set<string>();

  for (const s of ordered) {
    const raw     = realmToGrid(s.x, s.y);
    const minDist = MIN_DIST_BY_TYPE[s.size];

    let candidate = snapToValidTile(raw.col, raw.row, occupied);
    // If the nearest valid tile is too close to an already-placed
    // settlement, exclude it and search again, up to a bounded retry count.
    for (
      let attempt = 0;
      attempt < MAX_SNAP_RETRIES && candidate && tooCloseToPlaced(candidate.col, candidate.row, minDist, placements);
      attempt++
    ) {
      occupied.add(`${candidate.col},${candidate.row}`);
      candidate = snapToValidTile(raw.col, raw.row, occupied);
    }
    if (!candidate || tooCloseToPlaced(candidate.col, candidate.row, minDist, placements)) {
      continue; // drop — no valid, sufficiently-spaced tile found
    }

    const id    = entries.length + 1;
    const eSeed = (seed ^ (id * 0x9E37_79B9)) >>> 0;
    const plan  = planSettlement(s.size, candidate.col, candidate.row, eSeed, grid, s.name, s.faction);
    applySettlementToGrid(plan, grid, id);

    placements.push({ col: candidate.col, row: candidate.row });
    occupied.add(`${candidate.col},${candidate.row}`);
    entries.push({ id, seed: eSeed, plan });
  }

  return entries;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts`
Expected: PASS — all tests in the file, including the rewritten `placeSettlements` block.

- [x] **Step 5: Run `tsc --noEmit` to confirm no type errors**

Run: `npx tsc --noEmit`
Expected: same error count as the pre-existing baseline (159 errors, per the P0 ledger) — no new errors introduced by this task.

- [x] **Step 6: Commit**

```bash
git add src/world/SettlementPlacer.ts tests/levels/settlementGenerator.test.ts
git commit -m "Site settlements from realm data instead of independent Poisson-disk placement"
```

---

### Task 4: Collapse MainMenu's settlement controls into one slider

**Files:**
- Modify: `src/ui/MainMenu.ts:765-796` (HTML template: Villages/Towns/City controls)
- Modify: `src/ui/MainMenu.ts:918-927` (event wiring: `mkSlider`/`cityToggle` calls)

**Interfaces:**
- Consumes: `WorldGenConfig.settlementCount` (Task 1).
- Produces: no new exports — this is leaf UI wiring with no other consumers.

- [x] **Step 1: Replace the three settlement controls with one slider**

In `src/ui/MainMenu.ts`, replace this block (the "Villages" row):

```ts
      <div class="mm-setting-row">
        <label class="mm-setting-label">Villages</label>
        <div class="mm-setting-ctl">
          <input type="range" id="mm-wg-villages" class="mm-slider" min="0" max="6" value="${wg.villageCount}">
          <span id="mm-wg-villages-val" class="mm-setting-val">${wg.villageCount}</span>
        </div>
      </div>
```

with:

```ts
      <div class="mm-setting-row">
        <label class="mm-setting-label">Settlements</label>
        <div class="mm-setting-ctl">
          <input type="range" id="mm-wg-settlements" class="mm-slider" min="0" max="12" value="${wg.settlementCount}">
          <span id="mm-wg-settlements-val" class="mm-setting-val">${wg.settlementCount}</span>
        </div>
      </div>
```

Then remove the "Towns" row and "City" row entirely:

```ts
      <div class="mm-setting-row">
        <label class="mm-setting-label">Towns</label>
        <div class="mm-setting-ctl">
          <input type="range" id="mm-wg-towns" class="mm-slider" min="0" max="4" value="${wg.townCount}">
          <span id="mm-wg-towns-val" class="mm-setting-val">${wg.townCount}</span>
        </div>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">City</label>
        <div class="mm-setting-ctl">
          <label class="mm-toggle">
            <input type="checkbox" id="mm-wg-city" ${wg.hasCity ? 'checked' : ''}>
            <span class="mm-toggle-track"><span class="mm-toggle-thumb"></span></span>
          </label>
        </div>
      </div>
```

(delete both blocks — nothing replaces them, "Settlements" above now covers all three).

- [x] **Step 2: Update the event-wiring section**

Replace:

```ts
    mkSlider('#mm-wg-dungeons', '#mm-wg-dungeons-val', 'dungeonCount');
    mkSlider('#mm-wg-camps',    '#mm-wg-camps-val',    'enemyCampCount');
    mkSlider('#mm-wg-villages', '#mm-wg-villages-val', 'villageCount');
    mkSlider('#mm-wg-rivers',   '#mm-wg-rivers-val',   'riverCount');
    mkSlider('#mm-wg-towns',    '#mm-wg-towns-val',    'townCount');

    const cityToggle = card.querySelector<HTMLInputElement>('#mm-wg-city')!;
    cityToggle.addEventListener('change', () => { wg.hasCity = cityToggle.checked; saveWg(); });
```

with:

```ts
    mkSlider('#mm-wg-dungeons',    '#mm-wg-dungeons-val',    'dungeonCount');
    mkSlider('#mm-wg-camps',       '#mm-wg-camps-val',       'enemyCampCount');
    mkSlider('#mm-wg-settlements', '#mm-wg-settlements-val', 'settlementCount');
    mkSlider('#mm-wg-rivers',      '#mm-wg-rivers-val',      'riverCount');
```

- [x] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: same error count as the baseline (159 errors) — no new errors. There is no dedicated automated test for `MainMenu.ts`'s settings UI (confirmed: no existing test file references `mm-wg-villages`/`mm-wg-towns`/`mm-wg-city`), so a type-check is the verification gate for this task.

- [x] **Step 4: Commit**

```bash
git add src/ui/MainMenu.ts
git commit -m "Collapse Villages/Towns/City MainMenu controls into one Settlements slider"
```

---

### Task 5: Integration test — `buildWorldData()` settlements match realm data

**Files:**
- Modify: `tests/world/WorldGenerator.test.ts` (add import + new describe block)

**Interfaces:**
- Consumes: `buildWorldData(seed, config): WorldData` from `src/world/WorldGenerator.ts` (already exported, unchanged signature). `WorldData.settlements: SettlementEntry[]` from `src/world/WorldData.ts` (unchanged shape).
- Produces: nothing new — this is a pure test addition confirming Tasks 1-3 integrate correctly end-to-end.

- [x] **Step 1: Write the failing test**

In `tests/world/WorldGenerator.test.ts`, update the import line:

```ts
import { buildWorldGrid, buildWorldData } from '@/world/WorldGenerator';
```

Then add a new describe block at the end of the file:

```ts

describe('buildWorldData — realm-sourced settlements (P1 siting)', () => {
  it('sites at most config.settlementCount settlements, each with a valid name/type/faction', () => {
    const cfg  = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 600 };
    const data = buildWorldData(600, cfg);
    expect(data.settlements.length).toBeLessThanOrEqual(cfg.settlementCount);
    for (const entry of data.settlements) {
      expect(entry.plan.name.length).toBeGreaterThan(0);
      expect(['village', 'town', 'city']).toContain(entry.plan.type);
      expect(entry.plan.faction.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same seed', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 601 };
    const a = buildWorldData(601, cfg);
    const b = buildWorldData(601, cfg);
    const summarize = (d: typeof a) =>
      d.settlements.map(e => ({ col: e.plan.centerCol, row: e.plan.centerRow, name: e.plan.name }));
    expect(summarize(a)).toEqual(summarize(b));
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/WorldGenerator.test.ts -t "buildWorldData"`
Expected: FAIL — `buildWorldData` is not yet imported/exported in a way the test can resolve (it exists already in `WorldGenerator.ts`, so this should actually resolve; if Tasks 1-4 were done correctly this test should already pass. Run it anyway as the verification gate for the full integration, per TDD discipline — if it fails, that reveals a real integration bug to fix before continuing, not a step to skip.)

- [x] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/world/WorldGenerator.test.ts`
Expected: PASS — all tests in the file, including the two new ones.

- [x] **Step 4: Commit**

```bash
git add tests/world/WorldGenerator.test.ts
git commit -m "Add buildWorldData integration test for realm-sourced settlements"
```

---

### Task 6: Update parity tracking doc and full-suite verification

**Files:**
- Modify: `TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md:56-60` (P1 section)
- Modify: `docs/superpowers/plans/2026-07-30-settlement-siting-unification.md` (this file — check off all boxes)

**Interfaces:**
- Consumes: nothing — documentation-only task.
- Produces: nothing — documentation-only task.

- [x] **Step 1: Update the P1 section of `STUDIO-LIVE-PARITY.md`**

Replace:

```markdown
### P1 — Settlement unification (depends on P0)
Once realm data is shared, settlement layout and NPC population converge
to one algorithm. Either the live game adopts Studio's ward/Voronoi model,
or a new shared placement module replaces both. `SettlementGenerator.ts`'s
independently-reimplemented NPC spawner gets retired in favor of one path.
```

with:

```markdown
### P1 — Settlement unification (depends on P0)
Split into three ordered sub-projects: (1) siting ✅, (2) building layout,
(3) NPC population.

**(1) Siting ✅ shipped.** `SettlementPlacer.ts` now calls the same
`generateRealmData()` Overworld Studio uses to get settlement
positions/names/types/factions, instead of running an independent
Poisson-disk placement. `WorldGenConfig`'s `villageCount`/`townCount`/
`hasCity` collapsed into one `settlementCount` field (type is assigned by
the realm algorithm). Building layout (`SettlementGenerator.ts`'s
plan/apply functions) and NPC population are untouched by this slice.

**(2) Building layout — not started.** Reconciling Studio's Voronoi-ward
zone-label system, the live game's current cross/street/boulevard
patterns, and the unused concentric-ring algorithm in
`SettlementSpawner.ts`. Genuinely unresolved architecture question (Studio
produces ward *labels*, not building instances) — needs its own design
cycle.

**(3) NPC population — not started.** Wire up the unused
`SettlementPopulator.ts` to retire `OverworldScene.ts`'s independently
reimplemented radial-scatter NPC spawner.
```

- [x] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: same 16 known pre-existing failures as the P0 baseline (enemyLoader/towerGenerator/talentSystem `.js`/`.ts` duplicate pairs), no new failures.

- [x] **Step 3: Run the full type-check**

Run: `npx tsc --noEmit`
Expected: same 159-error baseline count as recorded after P0, no new errors.

- [x] **Step 4: Check off every remaining checkbox in this plan document**

Mark all `- [ ]` boxes in this file as `- [x]`.

- [x] **Step 5: Commit**

```bash
git add TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md docs/superpowers/plans/2026-07-30-settlement-siting-unification.md
git commit -m "Mark P1 settlement siting unification shipped; update parity tracking doc"
```
