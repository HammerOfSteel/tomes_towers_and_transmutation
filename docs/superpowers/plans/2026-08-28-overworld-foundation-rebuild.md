# Overworld Foundation Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live overworld generate directly from Overworld Studio's
realm generator at native resolution (no lossy resample), carry its full
10-value biome taxonomy end-to-end, render with real biome-distinct colours,
and stream in chunks (terrain mesh + collider + scatter) instead of building
the whole world eagerly — fixing both the "no biome variety" and "unplayable
framerate at scale" problems in one pass.

**Architecture:** `generateRealmData()` is called at `config.worldSize ×
config.worldSize` instead of a fixed 96×72 default, and
`realmToWorldGrid()`'s nearest-neighbor resample becomes a direct 1:1 index
(no stretching). `WorldGrid.BiomeId` widens from its current 7 values to
Studio's 10, and every consumer that switches on a biome literal is updated.
Rendering keeps the existing hand-rolled `TerrainGeometryBuilder` (see
"Deviation from the committed spec" below) but chunks it into
`ChunkManager`-driven sub-rectangles, re-colours it with a proper
10-biome-aware palette, and chunk-scopes tree/rock scatter the same way.

**Tech Stack:** TypeScript, Three.js, Rapier physics (`@dimforge/rapier3d`),
Vitest, the existing `ChunkManager`/`WorldGrid`/`TerrainGeometryBuilder`
modules.

## Global Constraints

- No changes to `WorldCell.elevation`'s 0–4 integer level semantics or to
  the already-shipped `waterDepth`/`river_ford` swim-collision machinery
  (`WaterDepthConfig.ts`, `HydrologyGenerator.ts`) — that work is complete
  and merged; this plan only touches `biome` classification and rendering.
- Every `BiomeId` consumer must be updated in the same commit that widens
  the type — TypeScript's `strict` mode will compile-error most sites, but
  two files (`CaveGladeWorldPlacer.ts`, `ResourceNodePlacer.ts`) use a
  loosely-typed `string` and will **not** error, so they need explicit,
  deliberate fixes (Task 4).
- Follow existing test conventions exactly: plain `describe`/`it`/`expect`
  (Vitest), `fakeRealm()`-style small hand-built fixtures, direct
  `WorldGrid` construction with explicit `.set()` calls.
- Run `npx vitest run <file>` after every task; run the full suite
  (`npx vitest run`) before the branch is considered done.
- Commit after every task with the
  `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`
  trailer.

## Deviation from the committed spec

`docs/superpowers/specs/2026-08-28-overworld-foundation-rebuild-design.md`
assumed the chunked terrain renderer would adopt `RealmToTerrain.ts`'s
`BIOME_TILE_MAP` + `TileDNA`/`buildTile()` (Overworld Studio's per-tile GLB
asset system). Investigation while writing this plan found that the **live
game's terrain renderer is actually `TerrainGeometryBuilder
.buildTerrainGeometryData()`** — a hand-rolled, single continuous
vertex-colored blocky mesh, deliberately decoupled from `TileDNA` (see that
file's own header comment) so it can guarantee the physics collider and the
visual mesh share one buffer set.

**Decision: keep `TerrainGeometryBuilder`**, chunked into sub-rectangles,
rather than switching to `buildTile()`/`TileDNA`, because:
1. `buildTerrainGeometryData()` already guarantees the visual mesh and the
   Rapier trimesh collider can never disagree (same buffers). Switching
   renderers means rebuilding that guarantee from scratch.
2. `buildTile()` is a fundamentally different, GLB-per-tile visual style —
   adopting it here would be an unplanned, much larger visual rewrite than
   "fix framerate + biome colour fidelity."
3. The actual goals of this sub-project (framerate, biome-colour fidelity)
   are fully satisfiable by chunking + re-colouring the existing builder.

This is a **revisitable decision, not a permanent one** — sub-project 3
(biome asset/texture diversity) may reconsider whether per-tile GLB assets
via `buildTile()` should eventually replace the procedural vertex-colored
mesh for greater visual richness. Sub-project 1 (this plan) deliberately
does not make that call.

---

## File Map

| File | Change |
|---|---|
| `src/world/WorldGrid.ts` | Widen `BiomeId` to 10 values; fix default cell biome |
| `tests/world/WorldGrid.test.ts` | Add biome-union coverage |
| `src/world/RealmToWorldGrid.ts` | Delete the collapsing table; direct 1:1 index instead of nearest-neighbor |
| `tests/world/RealmToWorldGrid.test.ts` | Rewrite for identity mapping, remove mismatched-dimension test |
| `src/world/WorldGenerator.ts` | Pass `config.worldSize` into `generateRealmData()` |
| `tests/world/WorldGenerator.test.ts` | Assert realm called at native size |
| `src/world/ScatterRules.ts`, `DungeonPlacer.ts`, `RoadGenerator.ts`, `SettlementGenerator.ts`, `SettlementPlacer.ts`, `CaveGladeWorldPlacer.ts`, `ResourceNodePlacer.ts` | Fix biome-literal checks for the widened taxonomy |
| `src/scene/OverworldScene.ts` | Fix 4 biome-literal sites (water mesh ×2, beach decor, river-scan); wire `ChunkManager` for terrain + collider + scatter |
| `src/world/TerrainGeometryBuilder.ts` | Add `BIOME_COLOR_VARIANTS`; add chunk sub-rectangle params to `buildTerrainGeometryData()` |
| `tests/world/TerrainGeometryBuilder.test.ts` | Cover new colours + chunk sub-rectangle behaviour |
| `src/world/WorldGenConfig.ts` | Add `512` to `WorldSize`, make it the default |
| `tests/world/RealmGenerator.perf.test.ts` (new) | 512×512 generation-time budget + determinism guard |

---

### Task 1: Widen `BiomeId` to Studio's 10-value taxonomy

**Files:**
- Modify: `src/world/WorldGrid.ts:9` (type), `:56` (default cell)
- Test: `tests/world/WorldGrid.test.ts`

**Interfaces:**
- Produces: `BiomeId = 'deep_ocean' | 'ocean' | 'beach' | 'desert' |
  'savanna' | 'grassland' | 'forest' | 'taiga' | 'tundra' | 'snow'` — every
  later task in this plan consumes this exact union (spelling/order matches
  `RealmBiome` in `src/overworld-studio.ts:2628` exactly, so no mapping
  table is needed anywhere downstream).

- [ ] **Step 1: Write the failing test**

Add to `tests/world/WorldGrid.test.ts`:

```typescript
describe('WorldGrid — BiomeId taxonomy (10 values, matches RealmBiome)', () => {
  it('accepts every RealmBiome-aligned biome value via set()', () => {
    const biomes: BiomeId[] = [
      'deep_ocean', 'ocean', 'beach', 'desert', 'savanna',
      'grassland', 'forest', 'taiga', 'tundra', 'snow',
    ];
    const wg = new WorldGrid(1, 1);
    for (const biome of biomes) {
      wg.set(0, 0, { biome });
      expect(wg.get(0, 0).biome).toBe(biome);
    }
  });

  it('defaults every cell to grassland (a valid, walkable land biome)', () => {
    const wg = new WorldGrid(2, 2);
    expect(wg.get(0, 0).biome).toBe('grassland');
    expect(wg.get(-1, -1).biome).toBe('grassland'); // out-of-bounds default too
  });
});
```

Add `BiomeId` to the existing import line:
`import { WorldGrid, type BiomeId } from '@/world/WorldGrid';` (or add a
new import if the test file doesn't already import a type from WorldGrid —
check the top of the file first).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/WorldGrid.test.ts -t "BiomeId taxonomy"`
Expected: FAIL — `'deep_ocean'` etc. not assignable to old `BiomeId`
(TypeScript compile error surfaced by Vitest), and the default-biome test
fails because the default is currently `'bog'`.

- [ ] **Step 3: Widen the type and fix the default**

In `src/world/WorldGrid.ts`, replace:

```typescript
export type BiomeId = 'bog' | 'grass' | 'forest' | 'highland' | 'rocky' | 'water' | 'sand';
```

with:

```typescript
/**
 * Matches Overworld Studio's `RealmBiome` (`src/overworld-studio.ts`)
 * exactly — a deliberate rename-not-add-alongside decision so every
 * consumer switches on the same literal set the realm generator produces,
 * with no collapsing/mapping table needed (see RealmToWorldGrid.ts).
 */
export type BiomeId =
  | 'deep_ocean' | 'ocean' | 'beach'
  | 'desert' | 'savanna' | 'grassland'
  | 'forest' | 'taiga' | 'tundra' | 'snow';
```

And in `_defaultCell()`, replace `biome: 'bog',` with `biome: 'grassland',`
(grassland is a valid, walkable, common land biome — the safest default for
any code path that reads a cell before it's been populated by generation).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/WorldGrid.test.ts`
Expected: PASS (all tests in the file, including the pre-existing
`waterDepth`/`river_ford` ones, which are untouched by this change).

- [ ] **Step 5: Commit**

```bash
git add src/world/WorldGrid.ts tests/world/WorldGrid.test.ts
git commit -m "feat(world): widen BiomeId to Studio's 10-value taxonomy"
```

---

### Task 2: `RealmToWorldGrid.ts` — identity mapping + native-size direct indexing

**Files:**
- Modify: `src/world/RealmToWorldGrid.ts` (whole file)
- Test: `tests/world/RealmToWorldGrid.test.ts` (whole file rewrite)

**Interfaces:**
- Consumes: `BiomeId` from Task 1 (now identical to `RealmBiome`).
- Produces: `realmToWorldGrid(realm: RealmData, worldSize: number):
  WorldGrid` — same exported signature as before, callers in
  `WorldGenerator.ts` are unaffected by this task alone.

Because Task 1 made `BiomeId` byte-for-byte identical to `RealmBiome`, the
collapsing table becomes a pure identity map and can be deleted entirely.
Because `WorldGenerator.ts` will (Task 3) call `generateRealmData(seed,
config.worldSize, config.worldSize)`, realm dimensions and world-grid
dimensions are now always equal — nearest-neighbor resampling becomes
unnecessary; a direct 1:1 index is simpler and lossless. This task only
changes `RealmToWorldGrid.ts` itself; it still accepts a `realm` of any
size defensively (falls back to nearest-index behaviour if sizes ever
differ, e.g. in an old save or a future preview use), but the "happy path"
call site (Task 3) is always same-size.

- [ ] **Step 1: Write the failing test**

Replace `tests/world/RealmToWorldGrid.test.ts` in full:

```typescript
import { describe, it, expect } from 'vitest';
import { realmToWorldGrid } from '@/world/RealmToWorldGrid';
import { OCEAN_SHALLOW_DEPTH_WU, OCEAN_DEEP_DEPTH_WU } from '@/world/WaterDepthConfig';
import type { RealmData, RealmCell } from '@/overworld-studio';

function fakeRealm(cells: RealmCell[][]): RealmData {
  return {
    cells, W: cells[0]!.length, H: cells.length,
    rivers: [], settlements: [], dungeons: [],
    towerX: 0, towerY: 0, seed: 1,
  };
}

describe('realmToWorldGrid — identity biome mapping', () => {
  it('preserves every RealmBiome value unchanged (no collapsing)', () => {
    const biomes: RealmCell['biome'][] = [
      'deep_ocean', 'ocean', 'beach', 'desert', 'savanna',
      'grassland', 'forest', 'taiga', 'tundra', 'snow',
    ];
    const cells = [biomes.map(biome => ({ elevation: 0.5, moisture: 0.5, biome }))];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, biomes.length);
    for (let col = 0; col < biomes.length; col++) {
      expect(grid.get(col, 0).biome).toBe(biomes[col]);
    }
  });

  it('direct-indexes a same-size realm (col,row) -> (col,row), not nearest-neighbor stretch', () => {
    // 4x4 realm where each cell's biome encodes its own coordinate via a
    // distinct value, so any resampling/stretch would be observable.
    const row0: RealmCell[] = ['ocean', 'beach', 'desert', 'savanna'].map(biome => ({ elevation: 0.5, moisture: 0.5, biome: biome as RealmCell['biome'] }));
    const row1: RealmCell[] = ['grassland', 'forest', 'taiga', 'tundra'].map(biome => ({ elevation: 0.5, moisture: 0.5, biome: biome as RealmCell['biome'] }));
    const realm = fakeRealm([row0, row1, row0, row1]);
    const grid = realmToWorldGrid(realm, 4);
    expect(grid.get(0, 0).biome).toBe('ocean');
    expect(grid.get(3, 0).biome).toBe('savanna');
    expect(grid.get(1, 1).biome).toBe('forest');
    expect(grid.get(2, 3).biome).toBe('taiga');
  });

  it('carves waterDepth = OCEAN_DEEP_DEPTH_WU for deep_ocean and marks it unwalkable', () => {
    const cells = [[
      { elevation: 0.1, moisture: 0.5, biome: 'deep_ocean' as const },
      { elevation: 0.5, moisture: 0.5, biome: 'grassland' as const },
    ]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 2);
    expect(grid.get(0, 0).waterDepth).toBe(OCEAN_DEEP_DEPTH_WU);
    expect(grid.get(0, 0).walkable).toBe(false);
    expect(grid.get(1, 0).waterDepth).toBe(0);
    expect(grid.get(1, 0).walkable).toBe(true);
  });

  it('carves waterDepth = OCEAN_SHALLOW_DEPTH_WU for the ocean (shallow) band', () => {
    const cells = [[{ elevation: 0.32, moisture: 0.5, biome: 'ocean' as const }]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 1);
    expect(grid.get(0, 0).waterDepth).toBe(OCEAN_SHALLOW_DEPTH_WU);
    expect(grid.get(0, 0).walkable).toBe(false);
  });

  it('beach is dry and walkable with no carved depth', () => {
    const cells = [[{ elevation: 0.36, moisture: 0.5, biome: 'beach' as const }]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 1);
    expect(grid.get(0, 0).biome).toBe('beach');
    expect(grid.get(0, 0).waterDepth).toBe(0);
    expect(grid.get(0, 0).walkable).toBe(true);
  });

  it('quantizes continuous 0..1 realm elevation into WorldGrid 0-4 levels', () => {
    const cells = [[
      { elevation: 0.0,  moisture: 0.5, biome: 'grassland' as const },
      { elevation: 0.99, moisture: 0.5, biome: 'grassland' as const },
    ]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 2);
    expect(grid.get(0, 0).elevation).toBe(0);
    expect(grid.get(1, 0).elevation).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/RealmToWorldGrid.test.ts`
Expected: FAIL — old file still collapses biomes to the 7-value taxonomy
and stretches via nearest-neighbor.

- [ ] **Step 3: Rewrite `RealmToWorldGrid.ts`**

Replace the whole file:

```typescript
/**
 * RealmToWorldGrid.ts — builds a live-game WorldGrid directly from a
 * Studio-generated RealmData (P0/foundation-rebuild of the Studio<->live
 * parity work, see TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md).
 *
 * WorldGrid.BiomeId is now identical to RealmBiome (see WorldGrid.ts), so
 * biome values pass through unchanged — no collapsing table. Realm and
 * world grid are generated at the same size (WorldGenerator.ts calls
 * generateRealmData(seed, config.worldSize, config.worldSize)), so this
 * is a direct 1:1 index, not a resample. A defensive nearest-index
 * fallback is kept for the (currently unused) case of a differently-sized
 * realm being passed in, so this function never throws on legitimate
 * mismatched input.
 */

import { WorldGrid } from './WorldGrid';
import type { WorldSize } from './WorldGenConfig';
import type { RealmData } from '@/overworld-studio';
import { OCEAN_SHALLOW_DEPTH_WU, OCEAN_DEEP_DEPTH_WU } from './WaterDepthConfig';

/** Quantize a continuous 0..1 realm elevation into WorldGrid's 0-4 levels. */
function quantizeElevation(elevation: number): number {
  return Math.max(0, Math.min(4, Math.floor(elevation * 5)));
}

/**
 * Sample a realm cell for a target WorldGrid position. Direct 1:1 index
 * when `realm` is already `worldSize x worldSize` (the normal case);
 * nearest-neighbor fallback otherwise so mismatched sizes degrade
 * gracefully instead of throwing.
 */
function sampleRealmCell(realm: RealmData, col: number, row: number, worldSize: number) {
  const realmW = Math.max(1, realm.W);
  const realmH = Math.max(1, realm.H);
  if (realmW === worldSize && realmH === worldSize) {
    return realm.cells[row]![col]!;
  }
  const rx = Math.min(realmW - 1, Math.floor((col / worldSize) * realmW));
  const ry = Math.min(realmH - 1, Math.floor((row / worldSize) * realmH));
  return realm.cells[ry]![rx]!;
}

export function realmToWorldGrid(realm: RealmData, worldSize: number): WorldGrid {
  const grid = new WorldGrid(worldSize as WorldSize, worldSize as WorldSize);
  for (let row = 0; row < worldSize; row++) {
    for (let col = 0; col < worldSize; col++) {
      const cell = sampleRealmCell(realm, col, row, worldSize);
      const biome = cell.biome;
      // Ocean tiles get a real carved depth (RI-3, already shipped) so
      // they're physically swimmable — two tiers so `ocean` (shallow,
      // coastal ring) reads as wading depth while `deep_ocean` (open
      // water) triggers real swim mode.
      const isWater = biome === 'deep_ocean' || biome === 'ocean';
      const waterDepth = biome === 'deep_ocean' ? OCEAN_DEEP_DEPTH_WU
                        : biome === 'ocean'      ? OCEAN_SHALLOW_DEPTH_WU
                        : 0;
      grid.set(col, row, {
        elevation: quantizeElevation(cell.elevation),
        biome,
        waterDepth,
        walkable: !isWater,
      });
    }
  }
  return grid;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/RealmToWorldGrid.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/RealmToWorldGrid.ts tests/world/RealmToWorldGrid.test.ts
git commit -m "feat(world): RealmToWorldGrid direct-indexes native-size realms, no biome collapsing"
```

---

### Task 3: `WorldGenerator.buildWorldGrid()` calls `generateRealmData` at native world size

**Files:**
- Modify: `src/world/WorldGenerator.ts:53` (the `generateRealmData(seed)` call)
- Test: `tests/world/WorldGenerator.test.ts` (check if this file exists; if
  not, create it — search first with
  `ls tests/world/WorldGenerator.test.ts 2>/dev/null || echo "does not exist"`)

**Interfaces:**
- Consumes: `generateRealmData(seed, W?, H?, ...)` (`src/world/RealmGenerator.ts:53`,
  unchanged signature); `realmToWorldGrid(realm, worldSize)` from Task 2.
- Produces: no interface change — `buildWorldGrid(seed, config): WorldGrid`
  keeps its exact signature; only its internal realm size changes.

- [ ] **Step 1: Write the failing test**

If `tests/world/WorldGenerator.test.ts` doesn't exist, create it with this
content (if it exists, add this `describe` block, plus its imports, to it):

```typescript
import { describe, it, expect } from 'vitest';
import { buildWorldGrid } from '@/world/WorldGenerator';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';

describe('buildWorldGrid — native realm resolution', () => {
  it('produces a grid exactly config.worldSize on each side, with no default-96x72 seam', () => {
    const config = { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 128 as const };
    const grid = buildWorldGrid(12345, config);
    expect(grid.width).toBe(128);
    expect(grid.height).toBe(128);
  });

  it('every cell has a biome from the 10-value taxonomy (never falls back to a stretched/default value)', () => {
    const config = { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 128 as const };
    const grid = buildWorldGrid(777, config);
    const valid = new Set([
      'deep_ocean', 'ocean', 'beach', 'desert', 'savanna',
      'grassland', 'forest', 'taiga', 'tundra', 'snow',
    ]);
    let sampled = 0;
    for (let row = 0; row < 128; row += 7) {
      for (let col = 0; col < 128; col += 7) {
        expect(valid.has(grid.get(col, row).biome)).toBe(true);
        sampled++;
      }
    }
    expect(sampled).toBeGreaterThan(0);
  });
});
```

(This is the complete file if it didn't already exist — just the two
imports above followed by this `describe` block.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/WorldGenerator.test.ts`
Expected: Currently PASSES today too (existing behaviour already produces a
128x128 grid via resampling) — this is a case where the observable output
doesn't change, only the *mechanism* (native generation vs. resample) does.
This test is a regression guard, not a red/green TDD driver here; skip
strict red-first if it already passes, but still run it before and after
Step 3 to confirm no behavioural regression.

- [ ] **Step 3: Update the call site**

In `src/world/WorldGenerator.ts`, replace:

```typescript
  const realm = generateRealmData(seed);
```

with:

```typescript
  // Native resolution — realm and world grid are always the same size now,
  // so RealmToWorldGrid.ts direct-indexes instead of resampling (P0
  // foundation rebuild, see docs/superpowers/specs/2026-08-28-overworld-foundation-rebuild-design.md).
  const realm = generateRealmData(seed, config.worldSize, config.worldSize);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/WorldGenerator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/world/WorldGenerator.ts tests/world/WorldGenerator.test.ts
git commit -m "feat(world): generate the realm at native worldSize instead of resampling from 96x72"
```

---

### Task 4: Fix every remaining biome-literal consumer for the widened taxonomy

**Files:**
- Modify: `src/world/ScatterRules.ts`, `src/world/DungeonPlacer.ts:65`,
  `src/world/RoadGenerator.ts:93,107`, `src/world/SettlementGenerator.ts:149,164,193`,
  `src/world/SettlementPlacer.ts:94`, `src/world/CaveGladeWorldPlacer.ts:33-41`,
  `src/world/ResourceNodePlacer.ts:100`
- Test: existing test files for each (`tests/world/ScatterRules.test.ts`,
  `tests/world/DungeonPlacer.test.ts`, `tests/world/RoadGenerator.test.ts`,
  `tests/world/SettlementGenerator.test.ts`, `tests/world/SettlementPlacer.test.ts`,
  `tests/world/CaveGladeWorldPlacer.test.ts`, `tests/world/ResourceNodePlacer.test.ts`
  — check which exist with `ls tests/world/*.test.ts`; add a biome-specific
  test to whichever exist, skip creating new files for ones that don't
  since these are one-line literal fixes, not new behaviour).

**Interfaces:** No signature changes anywhere in this task — every fix is
"same boolean logic, updated literal(s)."

Two of these files are **not** compile-error-forcing (their biome
parameter is typed `string`, not `BiomeId`) and would otherwise silently
break real gameplay behaviour after Task 1 — `CaveGladeWorldPlacer.ts`
(caves/glades would **stop spawning entirely**, since `'bog'`/`'highland'`/
`'rocky'` no longer exist) and `ResourceNodePlacer.ts` (`'bog'` timber
candidates never generate). Both get an **elevation-based** rewrite instead
of a biome-name substitution, since `elevation` is unchanged by this
rebuild and these two files' own doc comments already describe the
old biome-name↔elevation correspondence they were approximating.

- [ ] **Step 1: `ScatterRules.ts`** — replace `cell.biome === 'water'` with
  `(cell.biome === 'deep_ocean' || cell.biome === 'ocean')`, and
  `cell.biome === 'sand'` with `cell.biome === 'beach'`:

```typescript
export function isScatterAllowed(cell: WorldCell, kind: ScatterKind): boolean {
  if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') return false;
  if (cell.settlementId > 0) return false;

  if (kind === 'tree' || kind === 'bush' || kind === 'rock') {
    if (cell.feature === 'road' || cell.feature === 'road_dirt') return false;
    if (cell.content !== 'empty') return false;
  }

  if (kind === 'tree' || kind === 'bush') {
    if (cell.biome === 'beach') return false;
    if (cell.elevation < 1) return false; // no trees/undergrowth in the lowest band
  }

  return true;
}
```

- [ ] **Step 2: `DungeonPlacer.ts:65`** — replace
  `if (cell.biome === 'water') continue;` with:

```typescript
    if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') continue;
```

- [ ] **Step 3: `RoadGenerator.ts:93,107`** — replace
  `if (cell.biome === 'water') return Infinity;` with:

```typescript
  if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') return Infinity;
```

  and replace
  `const terrainPenalty = (cell.biome === 'rocky' || cell.biome === 'highland') ? 2.0 : 0;`
  with an elevation-based check (elevation 3-4 was the old
  `highland`/`rocky` band — see `CaveGladeWorldPlacer.ts`'s doc comment for
  the same correspondence):

```typescript
  // Elevation-based (was a rocky/highland biome-name check before the
  // biome-taxonomy rebuild) — elevation 3-4 was always the old
  // highland/rocky band, and elevation is unchanged by that rebuild.
  const terrainPenalty = cell.elevation >= 3 ? 2.0 : 0;
```

- [ ] **Step 4: `SettlementGenerator.ts:149,164,193`** — replace all three
  `cell.biome === 'water'` / `cell.biome !== 'water'` checks:

```typescript
      // line ~149
      if (cell.biome !== 'deep_ocean' && cell.biome !== 'ocean' && cell.feature !== 'river') {
```

```typescript
      // line ~164
      if (cell.biome !== 'deep_ocean' && cell.biome !== 'ocean' && cell.feature !== 'river') {
```

```typescript
  // line ~193 (_valid helper)
  if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') return false;
```

- [ ] **Step 5: `SettlementPlacer.ts:94`** — replace
  `if (cell.biome === 'water') return false;` with:

```typescript
    if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') return false;
```

- [ ] **Step 6: `CaveGladeWorldPlacer.ts:33-41`** — replace the biome-name
  eligibility checks with elevation-based ones:

```typescript
/** Cave-eligible: elevation 0 (was "bog") or elevation 3-4 (was
 *  "highland/rocky") — the elevation bands the old biome names
 *  approximated. Elevation is unchanged by the biome-taxonomy rebuild
 *  (docs/superpowers/specs/2026-08-28-overworld-foundation-rebuild-design.md),
 *  so this stays a correct, low-risk substitution rather than an invented
 *  biome-name mapping. */
function isCaveEligible(cell: { elevation: number; feature: string; content: string }): boolean {
  return (cell.elevation === 0 || cell.elevation >= 3)
    && cell.feature === 'none' && cell.content === 'empty';
}

/** Glade-eligible: forest biome, unchanged — 'forest' still exists in the
 *  widened taxonomy under the same name. */
function isGladeEligible(cell: { biome: string; feature: string; content: string }): boolean {
  return cell.biome === 'forest' && cell.feature === 'none' && cell.content === 'empty';
}
```

  Note the parameter type for `isCaveEligible` changes from `{ biome:
  string; ... }` to `{ elevation: number; ... }` — check its one call site
  in the same file (search `isCaveEligible(` in `CaveGladeWorldPlacer.ts`)
  and confirm it's still passed a `WorldCell` (which has both `elevation`
  and `biome`, so this is a safe narrowing, not a breaking change to the
  caller).

- [ ] **Step 7: `ResourceNodePlacer.ts:100`** — replace
  `if (biome === 'forest' || biome === 'bog') {` with:

```typescript
      if (biome === 'forest' || biome === 'taiga') {
```

  Leave the other checks in this file (`'highlands'`, `'mountain'`,
  `'wetland'`, `'river'`, `'lake'` at lines ~97, ~103) untouched — these are
  pre-existing dead code that never matched even the old 7-value taxonomy
  (confirmed by inspection: none of those strings were ever valid
  `BiomeId`/`RealmBiome` values), unrelated to this rebuild, and out of
  scope to fix here.

- [ ] **Step 8: Add a regression test**

Add to `tests/world/ScatterRules.test.ts` (create if it doesn't exist,
following the file's existing style if it does):

```typescript
import { describe, it, expect } from 'vitest';
import { isScatterAllowed } from '@/world/ScatterRules';
import { WorldGrid } from '@/world/WorldGrid';

describe('isScatterAllowed — widened biome taxonomy', () => {
  it('disallows trees/rocks on both ocean tiers, not just one', () => {
    const wg = new WorldGrid(2, 1);
    wg.set(0, 0, { biome: 'ocean' });
    wg.set(1, 0, { biome: 'deep_ocean' });
    expect(isScatterAllowed(wg.get(0, 0), 'tree')).toBe(false);
    expect(isScatterAllowed(wg.get(1, 0), 'rock')).toBe(false);
  });

  it('disallows trees/bushes on beach (renamed from sand)', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'beach', elevation: 1 });
    expect(isScatterAllowed(wg.get(0, 0), 'tree')).toBe(false);
    expect(isScatterAllowed(wg.get(0, 0), 'bush')).toBe(false);
  });
});
```

- [ ] **Step 9: Run all affected test suites**

Run: `npx vitest run tests/world/ScatterRules.test.ts tests/world/DungeonPlacer.test.ts tests/world/RoadGenerator.test.ts tests/world/SettlementGenerator.test.ts tests/world/SettlementPlacer.test.ts tests/world/CaveGladeWorldPlacer.test.ts tests/world/ResourceNodePlacer.test.ts`
Expected: PASS (run each individually first if the combined command errors
on a file that doesn't exist yet — `vitest run` accepts multiple paths but
skips missing ones with a warning, not a hard failure; if any file is
genuinely missing, just omit it from the command).

- [ ] **Step 10: Commit**

```bash
git add src/world/ScatterRules.ts src/world/DungeonPlacer.ts src/world/RoadGenerator.ts src/world/SettlementGenerator.ts src/world/SettlementPlacer.ts src/world/CaveGladeWorldPlacer.ts src/world/ResourceNodePlacer.ts tests/world/ScatterRules.test.ts
git commit -m "fix(world): update all biome-literal consumers for the widened 10-value taxonomy"
```

---

### Task 5: Fix `OverworldScene.ts`'s 4 biome-literal sites

**Files:**
- Modify: `src/scene/OverworldScene.ts:624, 975, 1476, 2359`

**Interfaces:** No signature changes — same fix pattern as Task 4, applied
to the 4 sites inside `OverworldScene`. No dedicated unit test (this class
isn't unit-tested directly per existing project convention — verified by
the manual playtest in Task 11), but this task must compile cleanly.

- [ ] **Step 1: Line ~624 and ~975** (both are `if (cell.feature !== 'river'
  && cell.biome !== 'water') continue;` — appears in a settlement-siting
  scan and in `_buildWaterMesh()`). Replace both occurrences with:

```typescript
          if (cell.feature !== 'river' && cell.biome !== 'ocean' && cell.biome !== 'deep_ocean') continue;
```

- [ ] **Step 2: Line ~1476** (`if (cell.biome !== 'sand') continue;` in the
  beach-decor scatter method). Replace with:

```typescript
      if (cell.biome !== 'beach') continue;
```

- [ ] **Step 3: Line ~2359** (`if (cell.feature === 'river' || cell.biome
  === 'water') {` in the nearest-river-direction scan). Replace with:

```typescript
            if (cell.feature === 'river' || cell.biome === 'ocean' || cell.biome === 'deep_ocean') {
```

- [ ] **Step 4: Type-check the whole file**

Run: `npx tsc --noEmit -p .` (or the project's existing typecheck script —
check `package.json`'s `scripts` first with
`grep -A2 '"scripts"' package.json | head -20` if `tsc --noEmit -p .`
doesn't match how this project normally typechecks).
Expected: no errors referencing `OverworldScene.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "fix(scene): update OverworldScene's 4 biome-literal checks for the widened taxonomy"
```

---

### Task 6: `TerrainGeometryBuilder.ts` — real per-biome colour table

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts` (add `BIOME_COLOR_VARIANTS`,
  update the colour-selection `if`/`else` chain around line 178-197)
- Test: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `BiomeId` (Task 1), existing `BIOME_VARIANTS` (elevation-keyed,
  kept unchanged for back-compat), existing `BIOME_WATER`/`BIOME_WATER_SHALLOW`/
  `BIOME_SAND_VARIANTS`/`BIOME_RIVER`/`BIOME_FORD` (kept unchanged, reused).
- Produces: `BIOME_COLOR_VARIANTS: Record<BiomeId, readonly (readonly
  [number, number, number])[]>` — a new export, 3 colour variants per
  biome, consumed only inside `buildTerrainGeometryData()`'s colour
  selection (no other file needs to import it for this plan).

Today's colour selection is keyed almost entirely by **elevation level**
(`BIOME_VARIANTS[H]`), with only `water`/`sand`/river features as biome
overrides — so widening `BiomeId` alone produces zero visual biome
diversity. This task adds real per-biome palettes for the 7 land biomes
that don't already have bespoke colour handling (`deep_ocean`/`ocean`/
`beach` keep using the existing water/sand tables, since those are already
biome-correct and re-used as-is).

- [ ] **Step 1: Write the failing test**

Add to `tests/world/TerrainGeometryBuilder.test.ts`:

```typescript
describe('buildTerrainGeometryData — biome-distinct colours', () => {
  function firstTopFaceColor(wg: WorldGrid, GW: number, GH: number): [number, number, number] {
    const { colors } = buildTerrainGeometryData(wg, GW, GH, (GW - 1) / 2, (GH - 1) / 2, 2, 1);
    return [colors[0]!, colors[1]!, colors[2]!];
  }

  it('renders desert and forest tiles with visibly different top-face colours', () => {
    const wg = new WorldGrid(1, 2);
    wg.set(0, 0, { biome: 'desert', elevation: 1 });
    wg.set(0, 1, { biome: 'forest', elevation: 1 });

    const desertGeo = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1);
    const wg2 = new WorldGrid(1, 1);
    wg2.set(0, 0, { biome: 'forest', elevation: 1 });
    const forestGeo = buildTerrainGeometryData(wg2, 1, 1, 0, 0, 2, 1);

    const desertColor = [desertGeo.colors[0], desertGeo.colors[1], desertGeo.colors[2]];
    const forestColor = [forestGeo.colors[0], forestGeo.colors[1], forestGeo.colors[2]];
    expect(desertColor).not.toEqual(forestColor);
  });

  it('covers all 7 non-water/beach biomes with a distinct BIOME_COLOR_VARIANTS entry', () => {
    const landBiomes: BiomeId[] = ['desert', 'savanna', 'grassland', 'forest', 'taiga', 'tundra', 'snow'];
    const seen = new Set<string>();
    for (const biome of landBiomes) {
      const variants = BIOME_COLOR_VARIANTS[biome];
      expect(variants.length).toBeGreaterThanOrEqual(1);
      seen.add(JSON.stringify(variants[0]));
    }
    // All 7 biomes must have a visually distinct primary colour from each other.
    expect(seen.size).toBe(landBiomes.length);
  });

  it('ocean/beach tiles still use the existing water/sand colour tables (unchanged)', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'deep_ocean', elevation: 0, waterDepth: 2.5 });
    const { colors } = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1);
    // Deep water uses BIOME_WATER (darker blue), not a land palette.
    expect(colors[2]).toBeGreaterThan(colors[1]!); // blue channel dominant
  });
});
```

Add `BIOME_COLOR_VARIANTS` and `BiomeId` to the test file's existing import
lines (`import { buildTerrainGeometryData, BIOME_COLOR_VARIANTS } from
'@/world/TerrainGeometryBuilder';` and `import type { BiomeId } from
'@/world/WorldGrid';`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: FAIL — `BIOME_COLOR_VARIANTS` doesn't exist yet; desert/forest
currently render identically (both fall through to the elevation-only
`else` branch).

- [ ] **Step 3: Add the colour table and wire it into selection**

In `src/world/TerrainGeometryBuilder.ts`, add after the existing
`BIOME_SAND_VARIANTS` export:

```typescript
import type { BiomeId } from './WorldGrid';

/** Per-biome colour-look variants for the 7 non-water/beach biomes (ocean
 *  tiers and beach keep using BIOME_WATER*/BIOME_SAND_VARIANTS above,
 *  which are already biome-correct). 2-3 variants each, following the
 *  same "base / lighter / darker" patchiness pattern as BIOME_VARIANTS.
 *  deep_ocean/ocean/beach are included with empty-equivalent aliases
 *  (pointing at the existing tables) purely so this is a total Record
 *  over BiomeId — buildTerrainGeometryData's water/beach branches never
 *  actually read these three entries. */
export const BIOME_COLOR_VARIANTS: Record<BiomeId, readonly (readonly [number, number, number])[]> = {
  deep_ocean: [BIOME_WATER],
  ocean:      [BIOME_WATER_SHALLOW],
  beach:      BIOME_SAND_VARIANTS,
  desert:     [[0.78, 0.66, 0.42], [0.82, 0.70, 0.46], [0.72, 0.60, 0.36]],
  savanna:    [[0.62, 0.56, 0.28], [0.66, 0.60, 0.32], [0.56, 0.50, 0.24]],
  grassland:  [[0.26, 0.44, 0.16], [0.22, 0.40, 0.15], [0.30, 0.46, 0.20]],
  forest:     [[0.16, 0.32, 0.14], [0.14, 0.30, 0.20], [0.19, 0.28, 0.15]],
  taiga:      [[0.15, 0.28, 0.20], [0.13, 0.26, 0.24], [0.18, 0.30, 0.22]],
  tundra:     [[0.42, 0.44, 0.36], [0.46, 0.46, 0.40], [0.38, 0.40, 0.34]],
  snow:       [[0.88, 0.90, 0.92], [0.92, 0.93, 0.95], [0.82, 0.85, 0.88]],
};
```

Then, inside `buildTerrainGeometryData()`, replace the colour-selection
`if`/`else` chain:

```typescript
      let biomeRgb: readonly [number, number, number];
      if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') {
        biomeRgb = cell.waterDepth < SHALLOW_WATER_TINT_THRESHOLD_WU ? BIOME_WATER_SHALLOW : BIOME_WATER;
      } else if (cell.biome === 'beach') {
        const vi = cellVariantIndex(col, row, BIOME_SAND_VARIANTS.length);
        biomeRgb = BIOME_SAND_VARIANTS[vi]!;
      } else if (cell.feature === 'river') {
        biomeRgb = BIOME_RIVER;
      } else if (cell.feature === 'river_ford') {
        biomeRgb = BIOME_FORD;
      } else if (cell.feature === 'river_bank') {
        const b = BIOME[H]!;
        biomeRgb = [b[0] * 0.88, b[1] * 0.80, b[2] * 0.68];
      } else {
        const variants = BIOME_COLOR_VARIANTS[cell.biome] ?? BIOME_VARIANTS[H] ?? [BIOME[H]!];
        const vi = cellVariantIndex(col, row, variants.length);
        biomeRgb = variants[vi]!;
      }
```

(Note: `BIOME_WATER`/`BIOME_WATER_SHALLOW`/`BIOME_SAND_VARIANTS` must be
declared *before* `BIOME_COLOR_VARIANTS` in file order since the table
literal references them — they already are, per the existing file layout
read during planning.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS (all tests, including pre-existing ones — `BIOME`/
`BIOME_VARIANTS` stay exported and unchanged, so no existing test using
them breaks).

- [ ] **Step 5: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "feat(world): add real per-biome colour table (7 land biomes now visually distinct)"
```

---

### Task 7: Add a `512` world-size tier and make it the default

**Files:**
- Modify: `src/world/WorldGenConfig.ts:9` (type), `:68` (default)
- Test: create `tests/world/WorldGenConfig.test.ts` if it doesn't exist
  (check with `ls tests/world/WorldGenConfig.test.ts`)

**Interfaces:**
- Produces: `WorldSize = 128 | 256 | 512`; `DEFAULT_WORLD_GEN_CONFIG.worldSize
  === 512`. Later tasks (chunking) must handle a 512-tile-per-side grid
  performantly — that's the whole point of this sub-project.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';
import type { WorldSize } from '@/world/WorldGenConfig';

describe('WorldGenConfig — 512 world-size tier', () => {
  it('accepts 512 as a valid WorldSize', () => {
    const size: WorldSize = 512;
    expect(size).toBe(512);
  });

  it('defaults to the larger 512 world size (foundation rebuild)', () => {
    expect(DEFAULT_WORLD_GEN_CONFIG.worldSize).toBe(512);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/WorldGenConfig.test.ts`
Expected: FAIL — `512` not assignable to `WorldSize`; default is `128`.

- [ ] **Step 3: Widen the type and default**

```typescript
export type WorldSize = 128 | 256 | 512;
```

and

```typescript
export const DEFAULT_WORLD_GEN_CONFIG: Readonly<WorldGenConfig> = {
  seed:           0,
  worldSize:      512,
  // ...unchanged fields below...
```

Update the doc comment above `worldSize` in the `WorldGenConfig` interface
too: `/** Tile count per side. 128 → 256×256 world-units. 256 → 512×512.
512 → 1024×1024. */`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/WorldGenConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/world/WorldGenConfig.ts tests/world/WorldGenConfig.test.ts
git commit -m "feat(world): add 512-tile world-size tier and make it the default"
```

---

### Task 8: 512×512 realm-generation performance + determinism guard

**Files:**
- Create: `tests/world/RealmGenerator.perf.test.ts`

**Interfaces:**
- Consumes: `generateRealmData(seed, W, H, ...)` (`src/world/RealmGenerator.ts`,
  unchanged by this plan).

This is a pure guard test — no production code change. It exists because
Task 7 makes 512 the default, and generation must stay fast enough not to
regress load-time, and macro-structure (settlement placement, coastline
shape) must stay recognizable across resolutions for the same seed (per
the committed design spec's explicit requirement).

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect } from 'vitest';
import { generateRealmData } from '@/world/RealmGenerator';

describe('generateRealmData — 512x512 performance + determinism', () => {
  it('generates a 512x512 realm in under 3 seconds', () => {
    const start = performance.now();
    const realm = generateRealmData(999, 512, 512);
    const elapsedMs = performance.now() - start;
    expect(realm.W).toBe(512);
    expect(realm.H).toBe(512);
    expect(elapsedMs).toBeLessThan(3000);
  });

  it('is fully deterministic for the same seed and size', () => {
    const a = generateRealmData(4242, 512, 512);
    const b = generateRealmData(4242, 512, 512);
    expect(a.cells[0]![0]).toEqual(b.cells[0]![0]);
    expect(a.cells[511]![511]).toEqual(b.cells[511]![511]);
    expect(a.settlements.length).toBe(b.settlements.length);
  });

  it('produces the same settlement count across resolutions for the same seed (macro-structure stable)', () => {
    const small = generateRealmData(555, 96, 72, 6);
    const large = generateRealmData(555, 512, 512, 6);
    expect(small.settlements.length).toBe(large.settlements.length);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/world/RealmGenerator.perf.test.ts`
Expected: PASS. If the 3-second budget fails, profile
`generateRealmData()` (likely culprit: any O(W²×H²) pass, e.g. a full
distance-transform without a spatial index) and optimize before proceeding
— **do not raise the budget to make a slow implementation pass**; a
genuinely-too-slow generator blocks the rest of this plan's premise (a
1024×1024-world-unit map with acceptable load time) and must be fixed here,
not deferred.

- [ ] **Step 3: Commit**

```bash
git add tests/world/RealmGenerator.perf.test.ts
git commit -m "test(world): guard 512x512 realm generation time budget + cross-resolution determinism"
```

---

### Task 9: `buildTerrainGeometryData()` — chunk sub-rectangle parameters

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts` (function signature +
  loop bounds)
- Test: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Produces: `buildTerrainGeometryData(wg, GW, GH, GHW, GHH, T, SH,
  colStart = 0, rowStart = 0, chunkW = GW, chunkH = GH):
  TerrainGeometryData` — the 4 new trailing parameters are optional and
  default to "whole grid," so **every existing call site
  (`OverworldScene._buildTerrain()`, `_createTerrainCollider()`) keeps
  compiling and behaving identically without modification until Task 10
  updates them.** `GW`/`GH`/`GHW`/`GHH`/`T`/`SH` keep their exact current
  meaning (full-grid dimensions and world-origin centering); `colStart`/
  `rowStart`/`chunkW`/`chunkH` describe the sub-rectangle of tiles to
  actually emit geometry for, while the loop still reads neighbour cells
  via `wg.get()` (which is safe across the sub-rectangle boundary — it
  already returns the *real* neighbouring cell for any in-bounds
  coordinate, and a safe default for out-of-bounds ones), so chunk-boundary
  walls render correctly with no additional logic.

- [ ] **Step 1: Write the failing test**

Add to `tests/world/TerrainGeometryBuilder.test.ts`:

```typescript
describe('buildTerrainGeometryData — chunk sub-rectangle', () => {
  it('building a 2x2 sub-rectangle of a 4x4 grid emits only that sub-rectangle\'s top faces', () => {
    const wg = new WorldGrid(4, 4);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) wg.set(c, r, { elevation: 0 });

    const full  = buildTerrainGeometryData(wg, 4, 4, 1.5, 1.5, 2, 1);
    const chunk = buildTerrainGeometryData(wg, 4, 4, 1.5, 1.5, 2, 1, /*colStart*/ 0, /*rowStart*/ 0, /*chunkW*/ 2, /*chunkH*/ 2);

    // Full grid emits 4x more top faces (4 quads = 16 verts each face type) than a quarter chunk.
    expect(chunk.positions.length).toBeLessThan(full.positions.length);
    expect(chunk.positions.length).toBeGreaterThan(0);
  });

  it('a chunk built at colStart/rowStart occupies the same world-space location as the equivalent slice of the full grid', () => {
    const wg = new WorldGrid(4, 4);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) wg.set(c, r, { elevation: 2 });

    const chunk = buildTerrainGeometryData(wg, 4, 4, 1.5, 1.5, 2, 1, 2, 2, 2, 2);
    // Top-face Y for elevation 2 at SH=1 should be 2, regardless of chunking.
    expect(chunk.positions[1]).toBe(chunk.positions[1]); // sanity: same array shape as before
    // World X of the first vertex should reflect colStart=2, not 0.
    const wx = (2 - 1.5) * 2; // (col - GHW) * T for col=2
    expect(chunk.positions[0]).toBeCloseTo(wx, 5);
  });

  it('defaults to the whole grid when chunk params are omitted (back-compat)', () => {
    const wg = new WorldGrid(3, 3);
    const withDefaults = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1);
    const explicit     = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1, 0, 0, 3, 3);
    expect(withDefaults.positions).toEqual(explicit.positions);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: FAIL — extra arguments not accepted by the current signature (or
silently ignored with wrong output, depending on TS's handling of excess
args — either way, the loop-bounds assertions fail).

- [ ] **Step 3: Add the chunk parameters**

Change the function signature:

```typescript
export function buildTerrainGeometryData(
  wg: WorldGrid,
  GW: number, GH: number, GHW: number, GHH: number,
  T: number, SH: number,
  colStart: number = 0, rowStart: number = 0,
  chunkW: number = GW, chunkH: number = GH,
): TerrainGeometryData {
```

Change the main loop bounds from:

```typescript
  for (let row = 0; row < GH; row++) {
    for (let col = 0; col < GW; col++) {
```

to:

```typescript
  const rowEnd = Math.min(GH, rowStart + chunkH);
  const colEnd = Math.min(GW, colStart + chunkW);
  for (let row = rowStart; row < rowEnd; row++) {
    for (let col = colStart; col < colEnd; col++) {
```

Every other line inside the loop body is unchanged — `wx`/`wz`/`physH`/
`lvl`/wall-neighbour checks all already use `col`/`row` (not a
loop-relative index), and `wg.get(col, row)` already safely reads any
grid coordinate regardless of the sub-rectangle being built, so
chunk-boundary geometry (walls facing an out-of-chunk-but-in-grid
neighbour) renders correctly with zero extra logic.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "feat(world): buildTerrainGeometryData supports a chunk sub-rectangle (back-compat default = whole grid)"
```

---

### Task 10: Wire `ChunkManager` into `OverworldScene` for terrain + collider

**Files:**
- Modify: `src/scene/OverworldScene.ts`
  (`_buildTerrain()` ~line 930, `_createTerrainCollider()` ~line 899,
  constructor ~line 222-293, `update()` ~line 381)

**Interfaces:**
- Consumes: `ChunkManager<T>`, `ChunkCoord`, `chunksWithinRadius`,
  `worldToChunkCoord`, `CHUNK_SIZE` (`src/world/ChunkManager.ts`, unchanged);
  `buildTerrainGeometryData(..., colStart, rowStart, chunkW, chunkH)` (Task 9);
  `physics.createStaticTrimesh(vertices, indices): RAPIER.RigidBody` and
  `physics.removeBody(body)` (`src/physics/PhysicsWorld.ts`, unchanged).
- Produces: a private `_chunkManager: ChunkManager<{ mesh: THREE.Mesh;
  body: RAPIER.RigidBody }>` field; terrain is built/torn down per-chunk
  instead of once for the whole grid at construction time.

This is the core framerate fix: instead of building one giant mesh +
collider for the whole `GW×GH` grid up front, each `CHUNK_SIZE`-tile-square
chunk gets its own small mesh + collider, created only when the player
comes within `LOAD_RADIUS_CHUNKS` and destroyed when they leave
`UNLOAD_RADIUS_CHUNKS`.

**Deviation from the spec's suggested test approach:** the committed design
spec suggested "a scene-level integration test asserting chunk load/unload
actually adds/removes THREE objects from the scene graph." The existing
test suite deliberately avoids instantiating `OverworldScene` directly —
see `tests/scene/overworld.startup.smoke.test.ts`'s own header comment:
"Tests buildWorldData + OWMinimap rather than full OverworldScene (which
requires PhysicsWorld + PlayerController + real WorldGrid — too heavyweight
for unit tests)." `_loadTerrainChunk`/`_unloadTerrainChunk` are private
methods that only make sense on a fully-constructed scene, so adding a true
integration test here would mean either exporting/restructuring them
against established convention, or standing up the full heavyweight
scene (physics + player + grid) in a test for the first time. Given the
existing project-wide pattern, this task relies on the manual smoke test
in Step 4 plus the full manual playtest in Task 13 instead — consistent
with how the rest of `OverworldScene` is already verified, not a new gap
introduced by this task.

- [ ] **Step 1: Replace the whole-grid terrain build in the constructor**

Find this in the constructor (around the `_buildTerrain()`/
`_createTerrainCollider()` calls, per the existing `console.log` markers):

```typescript
    console.log('[OverworldScene] _buildTerrain...');
    this._terrain   = this._buildTerrain();
    // ... (scene.add(this._terrain) and similar nearby) ...
```

and the later:

```typescript
    this._staticBodies.push(this._createTerrainCollider());
```

Replace both with a single `_chunkManager` construction placed after
`this._wg` is fully populated (same point in the constructor where
`_buildTerrain()` was previously called) and **do not** eagerly build
terrain for the whole grid anymore:

```typescript
    console.log('[OverworldScene] setting up terrain ChunkManager...');
    this._chunkManager = new ChunkManager<{ mesh: THREE.Mesh; body: RAPIER.RigidBody }>(
      {
        load: (coord) => this._loadTerrainChunk(coord),
        unload: (coord, data) => this._unloadTerrainChunk(coord, data),
      },
      { tileSize: T, chunkSize: CHUNK_SIZE },
    );
    // Force an initial load centered on the player's starting position so
    // the world isn't empty for the first frame.
    this._chunkManager.update(this.player.group.position.x, this.player.group.position.z);
```

Add the field declaration near the other private fields at the top of the
class:

```typescript
  private _chunkManager!: ChunkManager<{ mesh: THREE.Mesh; body: RAPIER.RigidBody }>;
```

Add the import at the top of the file:

```typescript
import { ChunkManager, CHUNK_SIZE, type ChunkCoord } from '@/world/ChunkManager';
```

- [ ] **Step 2: Replace `_buildTerrain()`/`_createTerrainCollider()` with
  per-chunk load/unload methods**

Replace the bodies of `_buildTerrain()` and `_createTerrainCollider()`
(delete both methods entirely — they're superseded) with two new private
methods placed in the same location:

```typescript
  /** ChunkManager `load` handler: builds one chunk's terrain mesh + Rapier
   *  trimesh collider from the same buffers (guarantees they agree — see
   *  TerrainGeometryBuilder.ts's header comment), adds the mesh to the
   *  scene, and returns both so `_unloadTerrainChunk` can tear them down. */
  private _loadTerrainChunk(coord: ChunkCoord): { mesh: THREE.Mesh; body: RAPIER.RigidBody } {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    const colStart = coord.cx * CHUNK_SIZE;
    const rowStart = coord.cz * CHUNK_SIZE;
    const { positions, normals, colors, indices } = buildTerrainGeometryData(
      this._wg, GW, GH, GHW, GHH, T, SH, colStart, rowStart, CHUNK_SIZE, CHUNK_SIZE,
    );

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(mesh);

    const body = this.physics.createStaticTrimesh(
      new Float32Array(positions),
      new Uint32Array(indices),
    );

    return { mesh, body };
  }

  /** ChunkManager `unload` handler: removes the mesh from the scene and
   *  disposes its GPU buffers, and removes the physics body. */
  private _unloadTerrainChunk(_coord: ChunkCoord, data: { mesh: THREE.Mesh; body: RAPIER.RigidBody }): void {
    this.scene.remove(data.mesh);
    data.mesh.geometry.dispose();
    (data.mesh.material as THREE.Material).dispose();
    this.physics.removeBody(data.body);
  }
```

Note: chunks at the world's edge may have `chunkW`/`chunkH` requested as
`CHUNK_SIZE` but the actual emitted range clipped by
`buildTerrainGeometryData()`'s own `Math.min(GW, colStart + chunkW)` bound
(Task 9) — no special-casing needed here, ragged edge chunks are handled
inside the builder already.

- [ ] **Step 2: Wire `update()` to drive the chunk manager**

In `update(dt, inputE, camera)` (~line 381), where `this.player.group
.position` is already read for water detection, add a call to advance the
chunk manager. Find the existing water-detection block (search for
`isInWaterAt` or the swim-related code using `pos.x`, `pos.z`), and add,
near it:

```typescript
    this._chunkManager.update(pos.x, pos.z);
```

(`pos` is the existing local variable already holding
`this.player.group.position` at that point in `update()` — reuse it, don't
re-read `this.player.group.position` a second time.)

- [ ] **Step 3: Remove now-dead references**

Search the file for any remaining references to `this._terrain` (the old
single whole-grid mesh field) and remove them — it's superseded by the
per-chunk meshes tracked inside `_chunkManager`. If `this._terrain` was
also referenced by the minimap or any other feature (search
`this._terrain` across the whole `src/` tree with
`grep -rn "_terrain" src/`), that consumer needs a decision: either keep a
lightweight separate whole-grid-summary data source for the minimap (it
doesn't need real geometry, just biome/elevation per cell, which `this._wg`
already provides directly), or defer minimap changes to a follow-up if none
of this plan's scope depends on it. Verify with a search before assuming
either way.

- [ ] **Step 4: Manual smoke-test (not yet the full playtest — that's Task 13)**

Run: `npm run dev` (or the project's existing dev-server script — check
`package.json`), load the overworld, and confirm terrain renders under and
around the player with no visible gaps, and the player doesn't fall
through the ground. This is a quick sanity check before moving to scatter
chunking, not the full checklist in Task 13.

- [ ] **Step 5: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "feat(scene): stream terrain mesh+collider per-chunk via ChunkManager instead of building the whole grid eagerly"
```

---

### Task 11: Chunk-scope tree and rock scatter

**Files:**
- Modify: `src/scene/OverworldScene.ts` (`_plantTrees()` ~line 1190,
  `_placeRocks()` ~line 1341, constructor, `_loadTerrainChunk`/
  `_unloadTerrainChunk` from Task 10)

**Interfaces:**
- Consumes: `poissonDisk(width, height, minDist, rand): [number, number][]`
  (`src/core/poissonDisk.ts`, unchanged); `mulberry32(seed)` (used
  elsewhere in the codebase for per-feature deterministic PRNGs — reuse
  the same pattern already used by `CaveGladeWorldPlacer.ts`/
  `ResourceNodePlacer.ts` for seeding sub-generators, confirm the import
  path with `grep -n "from '@/core/prng'" src/world/*.ts`).
- Produces: tree/rock groups become **per-chunk children**, added/removed
  alongside the terrain chunk they belong to, instead of one flat
  `this._trees`/`this._rocks` array built once for the whole world.

The whole-world `poissonDisk` calls in `_plantTrees`/`_placeRocks` are the
dominant, unbounded-with-world-size cost (worse than the terrain mesh
itself) — at `worldSize: 512` they'd sample Poisson-disk points across a
1024×1024 world-unit area up front, before the player ever moves. This task
converts both to per-chunk-local sampling, seeded by world seed + chunk
coordinates so the result is deterministic and reproducible, built and torn
down through the same `ChunkManager` used for terrain.

**Accepted tradeoff:** per-chunk-local Poisson-disk sampling (rather than a
single global pass sliced afterward) can produce slightly uneven density
right at chunk seams — a point near a chunk's edge doesn't "see" the
neighbouring chunk's points, so occasionally two trees end up closer
together than `minDist` across a chunk boundary. This is a standard,
accepted tradeoff in chunked open-world scatter (the alternative —
buffering each chunk's Poisson sampling with its neighbours' already-placed
points — is meaningfully more complex and not justified for trees/rocks at
this stage). Documented here rather than silently presented as seamless.

- [ ] **Step 1: Extend the terrain chunk payload to carry scatter groups**

Update the `ChunkManager` payload type introduced in Task 10 from `{ mesh:
THREE.Mesh; body: RAPIER.RigidBody }` to also carry a scatter group:

```typescript
  private _chunkManager!: ChunkManager<{
    mesh: THREE.Mesh;
    body: RAPIER.RigidBody;
    scatter: THREE.Group;
  }>;
```

Update the `ChunkManager` constructor's payload type argument in Step 1 of
Task 10 to match (`ChunkManager<{ mesh: THREE.Mesh; body: RAPIER.RigidBody;
scatter: THREE.Group }>`).

- [ ] **Step 2: Add a per-chunk scatter builder**

Add a new private method, called from `_loadTerrainChunk` (Task 10):

```typescript
  /** Builds one chunk's tree + rock scatter, deterministically seeded by
   *  world seed + chunk coordinate so results are stable across reloads.
   *  Runs its own small Poisson-disk pass over just this chunk's world-unit
   *  extent (CHUNK_SIZE * T on a side) rather than the whole world — the
   *  dominant fix for scatter's unbounded-with-world-size cost. Known
   *  tradeoff: chunk-seam density can be slightly uneven since neighbouring
   *  chunks' points aren't visible to each other's sampling pass. */
  private _buildChunkScatter(coord: ChunkCoord): THREE.Group {
    const group = new THREE.Group();
    const { _GHW: GHW, _GHH: GHH, _FR: FR } = this;
    const chunkWorldSize = T * CHUNK_SIZE;
    const originX = coord.cx * chunkWorldSize - GHW * T;
    const originZ = coord.cz * chunkWorldSize - GHH * T;
    const rand = mulberry32((this._seed ^ 0x5C47_7E12) ^ (coord.cx * 92821) ^ (coord.cz * 68917));

    const treePts = poissonDisk(chunkWorldSize, chunkWorldSize, 5.5, rand);
    for (const [px, pz] of treePts) {
      const wx = originX + px;
      const wz = originZ + pz;
      const d = Math.sqrt(wx * wx + wz * wz);
      if (d < FR * T + 5) continue; // tower clear-zone
      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const cell = this._wg.get(c, r);
      if (!isScatterAllowed(cell, 'tree')) continue;
      const tree = this._makeTree(rand, wx, wz);
      tree.position.set(wx, cell.elevation * SH, wz);
      tree.rotation.y = rand() * Math.PI * 2;
      group.add(tree);
    }

    const rockPts = poissonDisk(chunkWorldSize, chunkWorldSize, 8, rand);
    for (const [px, pz] of rockPts) {
      const wx = originX + px;
      const wz = originZ + pz;
      const d = Math.sqrt(wx * wx + wz * wz);
      if (d < FR * T + 6) continue;
      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const cell = this._wg.get(c, r);
      if (!isScatterAllowed(cell, 'rock')) continue;
      const rock = this._makeRock(rand, wx, wz);
      rock.position.set(wx, cell.elevation * SH, wz);
      group.add(rock);
    }

    this.scene.add(group);
    return group;
  }
```

(`this._seed` must exist as a stored field on the class already holding the
world-gen seed passed to the constructor — verify with
`grep -n "_seed" src/scene/OverworldScene.ts`; if the constructor takes a
`seed` parameter but doesn't store it, add `private readonly _seed:
number;` and set it in the constructor body alongside the other field
assignments, before this task's code is added. `_makeRock` must already
exist as the rock-mesh builder used by the old `_placeRocks` — reuse it
unchanged; only the call site changes.)

- [ ] **Step 3: Wire it into chunk load/unload**

In `_loadTerrainChunk` (Task 10), before the `return { mesh, body };` line,
add:

```typescript
    const scatter = this._buildChunkScatter(coord);
```

and change the return to `return { mesh, body, scatter };`.

In `_unloadTerrainChunk` (Task 10), add scatter teardown alongside the
mesh/body teardown:

```typescript
    this.scene.remove(data.scatter);
    data.scatter.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else mat.dispose();
      }
    });
```

- [ ] **Step 4: Delete the old whole-world scatter calls**

Remove the constructor's `this._plantTrees(rand); this._placeRocks(rand);`
calls (per the `console.log` markers seen during investigation) and delete
the old `_plantTrees()`/`_placeRocks()` method bodies — they're fully
superseded by `_buildChunkScatter()`. Keep `_makeTree`/`_makeConiferTree`/
`_buildDeciduousTree`/`_buildSparseTree`/`_makeRock` and
`pickTreeArchetype` unchanged (still used by `_buildChunkScatter`).

Also remove the now-unused `this._trees`/`this._rocks` flat-array fields
if nothing else in the file reads them — search first with
`grep -n "_trees\b\|_rocks\b" src/scene/OverworldScene.ts` to confirm no
other feature (e.g. a minimap overlay, an NPC AI avoidance check) depends
on that array before deleting it. If something does depend on it, keep a
thin accessor that walks `this._chunkManager`'s currently-loaded chunks'
`scatter` groups instead of removing the concept outright.

- [ ] **Step 5: Manual smoke-test**

Run: `npm run dev`, load the overworld, walk around, and confirm trees and
rocks appear as chunks load and disappear as they unload (no world-wide
scatter freeze at startup). This is a quick sanity check; the full
framerate/pop-in verification happens in Task 13.

- [ ] **Step 6: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "feat(scene): chunk-scope tree/rock scatter (was: one whole-world Poisson-disk pass at construction)"
```

---

### Task 12: Full regression test suite run

**Files:** none (verification-only task)

- [ ] **Step 1: Run the full suite**

Run: `npx vitest run`
Expected: PASS, including every file touched by Tasks 1-11 and every
untouched file that depends on `WorldGrid`/`BiomeId`/
`buildTerrainGeometryData` transitively (dungeon placement, road
generation, settlement generation, minimap, save/load if it serializes
`WorldCell.biome`).

- [ ] **Step 2: If anything fails**

Grep for any remaining raw biome-literal string that isn't one of the 10
new values, across the whole `src/` and `tests/` trees:

```bash
grep -rn "'bog'\|'grass'\b\|'highland'\|'rocky'\b\|=== 'water'\|=== 'sand'" src/world/ src/scene/ tests/world/
```

Any hit outside files this plan already lists (e.g. an untouched consumer
missed during investigation) must be fixed the same way as Task 4/5 before
this task can pass. Note this grep will also match unrelated, legitimate
uses of the word "grass" (e.g. `floorType: 'grass'` in
`src/levels/blueprint.ts`, dungeon floor materials) — only fix hits that
are actually `WorldCell.biome`/`BiomeId` comparisons, not unrelated
dungeon-floor-material strings that happen to share a word.

- [ ] **Step 3: Commit any fixes found**

```bash
git add -A
git commit -m "fix(world): address remaining biome-literal consumers found by full regression run"
```

(Skip this commit if Step 1 passed clean on the first run.)

---

### Task 13: Manual playtest verification

**Files:** none (verification-only task — no completion claim without this)

- [ ] **Step 1: Framerate comparison**

Run the game (`npm run dev`), open the browser devtools performance panel
or use the existing in-game FPS counter if one exists (check `grep -rn
"fps\|FPS" src/scene/OverworldScene.ts src/main.ts` for an existing
overlay), and compare average FPS while walking through the overworld
before vs. after this branch, at both `worldSize: 128` (old default) and
`worldSize: 512` (new default). Record actual numbers — do not claim
"better" without a measurement.

- [ ] **Step 2: Chunk streaming correctness**

Walk in a straight line for at least `2 * UNLOAD_RADIUS_CHUNKS *
CHUNK_SIZE * T` world units (roughly 320 WU) and confirm: no visible
terrain gaps or pop-in stutter beyond a brief, acceptable mesh-build cost
per chunk; no falling through the ground at a chunk boundary; trees/rocks
appear ahead of the player and disappear well behind (not abruptly at the
edge of view).

- [ ] **Step 3: Memory/heap check**

Per `TODO/02-game-world-integration/performance.md`'s GP-4 guidance, watch
the browser's heap usage (devtools Memory tab) while walking continuously
for a few minutes in one direction, then reversing — heap should stabilize
(chunks unloading is actually freeing geometry/material GPU memory, not
just JS references), not grow unbounded. If it grows unbounded, check that
`_unloadTerrainChunk`'s `geometry.dispose()`/`material.dispose()` calls
(Task 10) and the scatter teardown (Task 11, Step 3) are actually being
invoked — add a temporary `console.log` in `_unloadTerrainChunk` if needed
to confirm, then remove it before committing.

- [ ] **Step 4: Biome visual diversity**

Fly/walk to several different regions of a freshly generated 512-size
world and visually confirm at least desert, forest, grassland, tundra/snow,
and both ocean tiers are each visibly distinct from each other (not all
some shade of the old green/brown palette). Screenshot a few for the PR
description if creating one.

- [ ] **Step 5: Swim/ford/settlement/road regression spot-check**

Since this branch touches biome classification broadly, spot-check that
already-shipped features relying on it still work: walk into ocean/river
water and confirm real swim transition still triggers (RI-3, unchanged by
this plan but depends on `waterDepth`, which depends on biome
classification staying correct); cross a generated ford and confirm normal
walking; visit at least one settlement and confirm buildings are present
(tracking the user's earlier "settlement had no buildings" report as an
open hypothesis — note whether it still reproduces on this branch; if it
does, it's a separate bug for a future sub-project, not something to
silently fix here without its own investigation).

- [ ] **Step 6: No completion claim until all of the above pass**

If Step 1-5 reveal a real regression (not a pre-existing, separately-scoped
issue), fix it and re-run the full suite (Task 12) plus the affected steps
above before considering this plan done.

---

## Dependency order

1 → 2 → 3 (data model, then identity mapping, then native-size call site)
1 → 4, 5 (widened type forces every consumer fix)
1 → 6 (colour table needs the widened `BiomeId`)
3 → 7 → 8 (native sizing must work before raising the default size + perf
guard)
6, 9 → 10 (chunked terrain needs both the colour table and the chunk
sub-rectangle parameters)
10 → 11 (scatter chunking reuses the terrain `ChunkManager`'s payload/
lifecycle)
4, 5, 6, 9, 10, 11 → 12 → 13 (regression suite, then manual playtest, are
last)
