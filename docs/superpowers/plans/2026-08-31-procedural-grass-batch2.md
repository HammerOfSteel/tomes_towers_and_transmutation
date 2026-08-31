# Procedural Grass Shader (Batch 2: Savanna/Forest/Taiga/Tundra) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing grassland-only `GrassField` system to the 4 remaining
grass-bearing biomes (savanna, forest, taiga, tundra), each with its own visually-tuned preset,
by parametrizing the batch-1 code instead of duplicating it.

**Architecture:** `GrassField.ts` gains a `GrassPreset` interface + a `GRASS_PRESETS` lookup
table (5 entries). `selectGrassPlacements()`, `createGrassBladeGeometry()`, `createGrassMaterial()`,
and the `GrassField` class all become preset-parametrized instead of hardcoding grassland's
tuning. `OverworldScene.ts` replaces its single `_grassField: GrassField` singleton with
`_grassFields: GrassField[]` (5 instances, one per preset), looping over the array at every call
site that previously touched the singleton.

**Tech Stack:** TypeScript, Three.js, Vitest, Playwright (e2e verification only) — same stack as
batch 1, no new dependencies.

## Global Constraints

- Exactly 5 grass-bearing biomes, no more: `grassland`, `savanna`, `forest`, `taiga`, `tundra`
  (design spec §1). The other 6 biomes (`deep_ocean`, `ocean`, `beach`, `desert`, `snow`,
  `mountain`) stay grass-free.
- `GRASS_RADIUS` (24 WU) and `REBUILD_HYSTERESIS` (8 WU) stay shared, biome-agnostic module
  constants — not per-preset (design spec §4's explicit YAGNI call).
- Per-biome preset values (design spec §3, exact table):

  | Biome | segments | width | height | curvature | density/unit² | baseColor | tipColor | dryColor | dryAmount | windBase | windGust | windGustFreq | maxBlades |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | grassland | 4 | 0.06 | 0.9 | 0.28 | 35 | `0x3a7d2c` | `0x8bbf40` | `0xc4a84b` | 0 | 0.4 | 0.8 | 0.3 | 100,000 |
  | savanna | 4 | 0.05 | 0.8 | 0.2 | 15 | `0x9b8b4a` | `0xd4c078` | `0xc4a84b` | 0.6 | 0.3 | 0.5 | 0.3 | 44,000 |
  | tundra | 2 | 0.04 | 0.2 | 0.05 | 25 | `0x6b7d4a` | `0x8b9d5a` | `0xc4a84b` | 0.3 | 0.6 | 1.2 | 0.3 | 72,000 |
  | forest | 4 | 0.05 | 0.6 | 0.22 | 12 | `0x2e4a22` | `0x5a7d3a` | `0xc4a84b` | 0.1 | 0.25 | 0.4 | 0.25 | 35,000 |
  | taiga | 3 | 0.04 | 0.35 | 0.15 | 8 | `0x2f3d2c` | `0x4a5d42` | `0xc4a84b` | 0.15 | 0.2 | 0.35 | 0.25 | 24,000 |

- Every task must leave `npx tsc --noEmit` at the pre-existing baseline (144 errors as of this
  plan's writing — re-confirm the exact current count at Task 1 Step 1 and hold it steady for
  every subsequent task).
- Every task's new/changed tests must pass via `npx vitest run <file>` before moving to the next
  task's Step 1.

---

### Task 1: `GrassPreset` interface + `GRASS_PRESETS` table

**Files:**
- Modify: `src/world/GrassField.ts` (purely additive — no other function changes yet)
- Modify: `tests/world/GrassField.test.ts` (new `describe('GRASS_PRESETS', ...)` block)

**Interfaces:**
- Consumes: nothing new.
- Produces: `export type GrassBiome = 'grassland' | 'savanna' | 'tundra' | 'forest' | 'taiga';`,
  `export interface GrassPreset { biome: GrassBiome; segments: number; width: number; height:
  number; curvature: number; baseColor: number; tipColor: number; dryColor: number; dryAmount:
  number; densityPerUnit2: number; windBase: number; windGust: number; windGustFreq: number;
  maxBlades: number; }`, `export const GRASS_PRESETS: Record<GrassBiome, GrassPreset>` (the 5
  entries from the Global Constraints table above). Consumed by every later task in this plan.

- [ ] **Step 1: Confirm the current `tsc` baseline**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: prints a number (the baseline to hold steady through every later task).

- [ ] **Step 2: Write the failing tests**

Open `tests/world/GrassField.test.ts`. Change the import line at the top:

```ts
import {
  selectGrassPlacements, packGrassInstanceBuffers,
  createGrassBladeGeometry, createGrassMaterial,
  GrassField, REBUILD_HYSTERESIS,
} from '@/world/GrassField';
```

to:

```ts
import {
  selectGrassPlacements, packGrassInstanceBuffers,
  createGrassBladeGeometry, createGrassMaterial,
  GrassField, REBUILD_HYSTERESIS, GRASS_PRESETS,
} from '@/world/GrassField';
```

Then append this new `describe` block at the very end of the file (after the closing `});` of
the existing `describe('GrassField', ...)` block):

```ts

describe('GRASS_PRESETS', () => {
  const EXPECTED_BIOMES = ['grassland', 'savanna', 'tundra', 'forest', 'taiga'] as const;

  it('has exactly the 5 expected biome keys', () => {
    expect(Object.keys(GRASS_PRESETS).sort()).toEqual([...EXPECTED_BIOMES].sort());
  });

  it('each preset\'s biome field matches its own key', () => {
    for (const key of EXPECTED_BIOMES) {
      expect(GRASS_PRESETS[key].biome).toBe(key);
    }
  });

  it('each preset has a positive density and maxBlades', () => {
    for (const key of EXPECTED_BIOMES) {
      expect(GRASS_PRESETS[key].densityPerUnit2).toBeGreaterThan(0);
      expect(GRASS_PRESETS[key].maxBlades).toBeGreaterThan(0);
    }
  });

  it('maxBlades for the 4 new biomes follows ceil(2304 * density * 1.25) rounded up to the ' +
     'nearest 1000 (grassland is unchanged from batch 1 and intentionally excluded from this ' +
     'formula check — see the next test)', () => {
    for (const key of ['savanna', 'tundra', 'forest', 'taiga'] as const) {
      const density = GRASS_PRESETS[key].densityPerUnit2;
      const expected = Math.ceil((2304 * density * 1.25) / 1000) * 1000;
      expect(GRASS_PRESETS[key].maxBlades).toBe(expected);
    }
  });

  it('grassland maxBlades remains 100_000 (unchanged from batch 1)', () => {
    expect(GRASS_PRESETS.grassland.maxBlades).toBe(100_000);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: FAIL — `GRASS_PRESETS` is not exported yet (import error at test collection).

- [ ] **Step 4: Add `GrassBiome`, `GrassPreset`, and `GRASS_PRESETS` to `GrassField.ts`**

Find the "Tunables" section (near the top of `src/world/GrassField.ts`):

```ts
// ── Tunables (see design spec §4/§6) ────────────────────────────────────────
export const GRASS_RADIUS = 24;          // world units, player-centered
export const REBUILD_HYSTERESIS = 8;     // world units of player movement before rebuild
const DENSITY_PER_UNIT2 = 35;            // meadow preset — blades per world-unit²
```

Change to (adding the new types/table immediately after, leaving `DENSITY_PER_UNIT2` untouched
for now — Task 2 removes it once nothing references it anymore):

```ts
// ── Tunables (see design spec §4/§6) ────────────────────────────────────────
export const GRASS_RADIUS = 24;          // world units, player-centered
export const REBUILD_HYSTERESIS = 8;     // world units of player movement before rebuild
const DENSITY_PER_UNIT2 = 35;            // meadow preset — blades per world-unit²

// ── Per-biome presets (batch 2 — see design spec §3) ────────────────────────

/** The 5 biomes this system places grass on. Other `BiomeId` values never get grass. */
export type GrassBiome = 'grassland' | 'savanna' | 'tundra' | 'forest' | 'taiga';

export interface GrassPreset {
  biome: GrassBiome;
  segments: number; width: number; height: number; curvature: number;
  baseColor: number; tipColor: number; dryColor: number; dryAmount: number;
  densityPerUnit2: number;
  windBase: number; windGust: number; windGustFreq: number;
  maxBlades: number; // see design spec §3's "maxBlades sizing" formula
}

export const GRASS_PRESETS: Record<GrassBiome, GrassPreset> = {
  grassland: {
    biome: 'grassland', segments: 4, width: 0.06, height: 0.9, curvature: 0.28,
    baseColor: 0x3a7d2c, tipColor: 0x8bbf40, dryColor: 0xc4a84b, dryAmount: 0,
    densityPerUnit2: 35, windBase: 0.4, windGust: 0.8, windGustFreq: 0.3, maxBlades: 100_000,
  },
  savanna: {
    biome: 'savanna', segments: 4, width: 0.05, height: 0.8, curvature: 0.2,
    baseColor: 0x9b8b4a, tipColor: 0xd4c078, dryColor: 0xc4a84b, dryAmount: 0.6,
    densityPerUnit2: 15, windBase: 0.3, windGust: 0.5, windGustFreq: 0.3, maxBlades: 44_000,
  },
  tundra: {
    biome: 'tundra', segments: 2, width: 0.04, height: 0.2, curvature: 0.05,
    baseColor: 0x6b7d4a, tipColor: 0x8b9d5a, dryColor: 0xc4a84b, dryAmount: 0.3,
    densityPerUnit2: 25, windBase: 0.6, windGust: 1.2, windGustFreq: 0.3, maxBlades: 72_000,
  },
  forest: {
    biome: 'forest', segments: 4, width: 0.05, height: 0.6, curvature: 0.22,
    baseColor: 0x2e4a22, tipColor: 0x5a7d3a, dryColor: 0xc4a84b, dryAmount: 0.1,
    densityPerUnit2: 12, windBase: 0.25, windGust: 0.4, windGustFreq: 0.25, maxBlades: 35_000,
  },
  taiga: {
    biome: 'taiga', segments: 3, width: 0.04, height: 0.35, curvature: 0.15,
    baseColor: 0x2f3d2c, tipColor: 0x4a5d42, dryColor: 0xc4a84b, dryAmount: 0.15,
    densityPerUnit2: 8, windBase: 0.2, windGust: 0.35, windGustFreq: 0.25, maxBlades: 24_000,
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: PASS — all tests, including the 5 new `GRASS_PRESETS` ones.

- [ ] **Step 6: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Step 1.

- [ ] **Step 7: Commit**

```bash
git add src/world/GrassField.ts tests/world/GrassField.test.ts
git commit -m "feat: add GrassPreset interface + GRASS_PRESETS table (batch 2)

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: `selectGrassPlacements()` — add `biome`/`densityPerUnit2` parameters

**Files:**
- Modify: `src/world/GrassField.ts`
- Modify: `tests/world/GrassField.test.ts`

**Interfaces:**
- Consumes: `GrassBiome` (Task 1).
- Produces: `selectGrassPlacements(wg, centerX, centerZ, radius, seed, biome: GrassBiome,
  densityPerUnit2: number): GrassPlacement[]` — the `GrassPlacement` return shape is unchanged.
  Consumed by Task 4's `GrassField.update()`.

**Note on this task's one deliberate deviation from the design spec's illustrative signature:**
the design spec (§4) shows `selectGrassPlacements` gaining only a `biome` parameter, implying
density might be looked up internally from `GRASS_PRESETS[biome]`. This plan instead makes
`densityPerUnit2` an explicit parameter too, so `selectGrassPlacements` has no hidden dependency
on the `GRASS_PRESETS` table and stays independently testable with arbitrary density values —
the same "can be understood and tested independently" principle the spec itself invokes
elsewhere. The net behavior (placement filtered by a caller-supplied biome, with per-biome
density) is identical either way.

- [ ] **Step 1: Write the failing tests**

Open `tests/world/GrassField.test.ts`. Change every existing `selectGrassPlacements(...)` call to
add the two new trailing arguments. There are 8 call sites — find and replace each exactly:

Change (line ~21):
```ts
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1);
    expect(placements.length).toBe(0);
  });

  it('returns placements for an all-grassland window', () => {
```
to:
```ts
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1, 'grassland', 35);
    expect(placements.length).toBe(0);
  });

  it('returns placements for an all-grassland window', () => {
```

Change (line ~27-28):
```ts
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1);
    expect(placements.length).toBeGreaterThan(0);
  });

  it('excludes cells with a road feature', () => {
```
to:
```ts
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1, 'grassland', 35);
    expect(placements.length).toBeGreaterThan(0);
  });

  it('excludes cells with a road feature', () => {
```

Change (line ~38, inside `it('excludes cells with a road feature', ...)`):
```ts
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1);
    expect(placements.length).toBe(0);
  });

  it('excludes cells with non-empty content', () => {
```
to:
```ts
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1, 'grassland', 35);
    expect(placements.length).toBe(0);
  });

  it('excludes cells with non-empty content', () => {
```

Change (line ~49, inside `it('excludes cells with non-empty content', ...)`):
```ts
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1);
    expect(placements.length).toBe(0);
  });

  it('excludes water cells (waterDepth > 0)', () => {
```
to:
```ts
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1, 'grassland', 35);
    expect(placements.length).toBe(0);
  });

  it('excludes water cells (waterDepth > 0)', () => {
```

Change (line ~60, inside `it('excludes water cells (waterDepth > 0)', ...)`):
```ts
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1);
    expect(placements.length).toBe(0);
  });

  it('excludes out-of-bounds candidate tiles despite WorldGrid.get()\'s grassland default fallback', () => {
```
to:
```ts
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1, 'grassland', 35);
    expect(placements.length).toBe(0);
  });

  it('excludes out-of-bounds candidate tiles despite WorldGrid.get()\'s grassland default fallback', () => {
```

Change (line ~69, inside the out-of-bounds test):
```ts
    const placements = selectGrassPlacements(wg, 500, 500, 24, 1);
    expect(placements.length).toBe(0);
  });

  it('is deterministic for a fixed seed', () => {
```
to:
```ts
    const placements = selectGrassPlacements(wg, 500, 500, 24, 1, 'grassland', 35);
    expect(placements.length).toBe(0);
  });

  it('is deterministic for a fixed seed', () => {
```

Change (line ~75-77, the determinism test):
```ts
    const a = selectGrassPlacements(wg, 0, 0, 24, 7);
    const b = selectGrassPlacements(wg, 0, 0, 24, 7);
    expect(a).toEqual(b);
  });
});
```
to:
```ts
    const a = selectGrassPlacements(wg, 0, 0, 24, 7, 'grassland', 35);
    const b = selectGrassPlacements(wg, 0, 0, 24, 7, 'grassland', 35);
    expect(a).toEqual(b);
  });

  it('filters by the given biome — an all-savanna grid produces 0 placements when queried for grassland', () => {
    const wg = makeAllBiomeGrid(40, 'savanna');
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1, 'grassland', 35);
    expect(placements.length).toBe(0);
  });

  it('filters by the given biome — an all-savanna grid produces placements when queried for savanna', () => {
    const wg = makeAllBiomeGrid(40, 'savanna');
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1, 'savanna', 15);
    expect(placements.length).toBeGreaterThan(0);
  });

  it('never cross-bleeds between any two of the 5 grass-bearing biomes (full N×N isolation matrix)', () => {
    const biomes = ['grassland', 'savanna', 'tundra', 'forest', 'taiga'] as const;
    for (const gridBiome of biomes) {
      const wg = makeAllBiomeGrid(40, gridBiome);
      for (const queryBiome of biomes) {
        const placements = selectGrassPlacements(wg, 0, 0, 24, 1, queryBiome, 20);
        if (queryBiome === gridBiome) {
          expect(placements.length).toBeGreaterThan(0);
        } else {
          expect(placements.length).toBe(0);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: FAIL — a TypeScript argument-count error (too many arguments) since
`selectGrassPlacements` doesn't accept the 2 new parameters yet.

- [ ] **Step 3: Update `selectGrassPlacements()`'s signature and remove `DENSITY_PER_UNIT2`**

In `src/world/GrassField.ts`, remove the now-obsolete constant (find it in the Tunables block
from Task 1's Step 4):

```ts
const DENSITY_PER_UNIT2 = 35;            // meadow preset — blades per world-unit²
```

Delete that line entirely (density becomes an explicit parameter below, so this module-level
constant is dead code once removed from `selectGrassPlacements()`'s body).

Then change the function itself:

```ts
export function selectGrassPlacements(
  wg: WorldGrid,
  centerX: number,
  centerZ: number,
  radius: number,
  seed: number,
): GrassPlacement[] {
  const rand = mulberry32(seed);
  const gridStep = 1 / Math.sqrt(DENSITY_PER_UNIT2);
  const halfW = (wg.width - 1) / 2;
  const halfH = (wg.height - 1) / 2;
  const placements: GrassPlacement[] = [];

  for (let gx = centerX - radius; gx < centerX + radius; gx += gridStep) {
    for (let gz = centerZ - radius; gz < centerZ + radius; gz += gridStep) {
      const x = gx + (rand() - 0.5) * gridStep;
      const z = gz + (rand() - 0.5) * gridStep;

      const col = Math.floor(x / wg.tileUnit + halfW);
      const row = Math.floor(z / wg.tileUnit + halfH);
      if (col < 0 || col >= wg.width || row < 0 || row >= wg.height) continue;

      const cell = wg.get(col, row);
      if (cell.biome !== 'grassland') continue;
      if (!isScatterAllowed(cell, 'grass')) continue;
```

to:

```ts
export function selectGrassPlacements(
  wg: WorldGrid,
  centerX: number,
  centerZ: number,
  radius: number,
  seed: number,
  biome: GrassBiome,
  densityPerUnit2: number,
): GrassPlacement[] {
  const rand = mulberry32(seed);
  const gridStep = 1 / Math.sqrt(densityPerUnit2);
  const halfW = (wg.width - 1) / 2;
  const halfH = (wg.height - 1) / 2;
  const placements: GrassPlacement[] = [];

  for (let gx = centerX - radius; gx < centerX + radius; gx += gridStep) {
    for (let gz = centerZ - radius; gz < centerZ + radius; gz += gridStep) {
      const x = gx + (rand() - 0.5) * gridStep;
      const z = gz + (rand() - 0.5) * gridStep;

      const col = Math.floor(x / wg.tileUnit + halfW);
      const row = Math.floor(z / wg.tileUnit + halfH);
      if (col < 0 || col >= wg.width || row < 0 || row >= wg.height) continue;

      const cell = wg.get(col, row);
      if (cell.biome !== biome) continue;
      if (!isScatterAllowed(cell, 'grass')) continue;
```

Also update the function's doc comment (directly above it):

```ts
/**
 * Scatter grass blade placements within a `radius`-WU square window centered
 * on `(centerX, centerZ)`, restricted to `grassland`-biome tiles that pass
 * `isScatterAllowed(cell, 'grass')`. Deterministic for a fixed `seed`.
 *
 * Map-edge guard: `WorldGrid.get()` returns a default cell (which reports
 * `biome: 'grassland'`!) for out-of-bounds col/row — so this function checks
 * bounds itself before calling `.get()`, rather than trusting that fallback.
 */
```

to:

```ts
/**
 * Scatter grass blade placements within a `radius`-WU square window centered
 * on `(centerX, centerZ)`, restricted to tiles matching `biome` that pass
 * `isScatterAllowed(cell, 'grass')`. Deterministic for a fixed `seed`.
 *
 * Map-edge guard: `WorldGrid.get()` returns a default cell (which reports
 * `biome: 'grassland'`!) for out-of-bounds col/row — so this function checks
 * bounds itself before calling `.get()`, rather than trusting that fallback.
 * This guard matters for every `biome` value, not just `'grassland'` — an
 * out-of-bounds candidate must never be treated as a match for ANY biome.
 */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: PASS — all tests, including the 2 new cross-biome filtering tests.

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1.

- [ ] **Step 6: Commit**

```bash
git add src/world/GrassField.ts tests/world/GrassField.test.ts
git commit -m "feat: parametrize selectGrassPlacements by biome + density (batch 2)

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: `createGrassBladeGeometry()` / `createGrassMaterial()` — take a `GrassPreset`

**Files:**
- Modify: `src/world/GrassField.ts`
- Modify: `tests/world/GrassField.test.ts`

**Interfaces:**
- Consumes: `GrassPreset`, `GRASS_PRESETS` (Task 1).
- Produces: `createGrassBladeGeometry(preset: GrassPreset): THREE.BufferGeometry`,
  `createGrassMaterial(preset: GrassPreset): THREE.ShaderMaterial`. Consumed by Task 4's
  `GrassField` constructor.

- [ ] **Step 1: Write the failing tests**

Open `tests/world/GrassField.test.ts`. Change both `createGrassBladeGeometry(...)` call sites:

```ts
  it('produces the expected vertex and index counts for the default tuning', () => {
    const geo = createGrassBladeGeometry(4, 0.06, 0.9, 0.28);
```
to:
```ts
  it('produces the expected vertex and index counts for the default tuning', () => {
    const geo = createGrassBladeGeometry(GRASS_PRESETS.grassland);
```

```ts
  it('computes vertex normals (non-zero normal attribute)', () => {
    const geo = createGrassBladeGeometry(4, 0.06, 0.9, 0.28);
```
to:
```ts
  it('computes vertex normals (non-zero normal attribute)', () => {
    const geo = createGrassBladeGeometry(GRASS_PRESETS.grassland);
```

Change all 4 `createGrassMaterial()` call sites (no arguments) to
`createGrassMaterial(GRASS_PRESETS.grassland)`:

```ts
  it('declares the custom instanced attributes and wind uniforms in the vertex shader', () => {
    const mat = createGrassMaterial();
```
to:
```ts
  it('declares the custom instanced attributes and wind uniforms in the vertex shader', () => {
    const mat = createGrassMaterial(GRASS_PRESETS.grassland);
```

```ts
  it('computes the distance fade from uFadeCenter (a world XZ position), not from cameraPosition', () => {
    ...
    const mat = createGrassMaterial();
```
to:
```ts
  it('computes the distance fade from uFadeCenter (a world XZ position), not from cameraPosition', () => {
    ...
    const mat = createGrassMaterial(GRASS_PRESETS.grassland);
```

```ts
  it('declares the color/shading uniforms in the fragment shader', () => {
    const mat = createGrassMaterial();
```
to:
```ts
  it('declares the color/shading uniforms in the fragment shader', () => {
    const mat = createGrassMaterial(GRASS_PRESETS.grassland);
```

```ts
  it('has sensible default uniform values', () => {
    const mat = createGrassMaterial();
```
to:
```ts
  it('has sensible default uniform values', () => {
    const mat = createGrassMaterial(GRASS_PRESETS.grassland);
```

Then append this new test at the end of the `describe('createGrassMaterial', ...)` block (right
before its closing `});`):

```ts

  it('reflects the given preset\'s colors, not always the grassland defaults', () => {
    const mat = createGrassMaterial(GRASS_PRESETS.savanna);
    const baseColor = mat.uniforms.uBaseColor.value as THREE.Color;
    const expected = new THREE.Color(GRASS_PRESETS.savanna.baseColor);
    expect(baseColor.getHex()).toBe(expected.getHex());
    expect(mat.uniforms.uDryAmount.value).toBe(GRASS_PRESETS.savanna.dryAmount);
    expect(mat.uniforms.uWindBase.value).toBe(GRASS_PRESETS.savanna.windBase);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: FAIL — TypeScript argument-mismatch errors (`createGrassBladeGeometry`/
`createGrassMaterial` don't accept a single `GrassPreset` object argument yet).

- [ ] **Step 3: Update `createGrassBladeGeometry()`**

In `src/world/GrassField.ts`, remove the now-obsolete module constants (find them just above the
function, in the "Blade geometry" section):

```ts
const BLADE_SEGMENTS  = 4;
const BLADE_WIDTH      = 0.06;
const BLADE_HEIGHT     = 0.9;
const BLADE_CURVATURE  = 0.28;
const FADE_START = GRASS_RADIUS - 10;
const FADE_END   = GRASS_RADIUS - 2;
```

to (keeping only `FADE_START`/`FADE_END`, which stay shared/biome-agnostic per the design spec's
YAGNI note — only the blade-dimension constants become preset fields):

```ts
const FADE_START = GRASS_RADIUS - 10;
const FADE_END   = GRASS_RADIUS - 2;
```

Then change the function signature and body:

```ts
/** Tapered, bezier-curved triangle-strip blade (see procedural-grass-threejs skill). */
export function createGrassBladeGeometry(
  segments = BLADE_SEGMENTS,
  width = BLADE_WIDTH,
  height = BLADE_HEIGHT,
  curvature = BLADE_CURVATURE,
): THREE.BufferGeometry {
  const vertCount = (segments + 1) * 2 + 1;
```

to:

```ts
/** Tapered, bezier-curved triangle-strip blade (see procedural-grass-threejs skill). */
export function createGrassBladeGeometry(preset: GrassPreset): THREE.BufferGeometry {
  const { segments, width, height, curvature } = preset;
  const vertCount = (segments + 1) * 2 + 1;
```

The rest of the function body (from `const positions = ...` through the final `return
geometry;`) stays exactly as-is — it already only references the local `segments`/`width`/
`height`/`curvature` names, which the destructure above now supplies from `preset` instead of
from parameter defaults.

- [ ] **Step 4: Update `createGrassMaterial()`**

Change the function's doc comment and signature:

```ts
/**
 * Wind-animated grass blade material. Uses Three.js's automatically-injected
 * built-ins (`position`, `normal`, `uv`, `modelMatrix`, `projectionMatrix`,
 * `viewMatrix`, `cameraPosition`) directly without redeclaring them — the
 * same convention already used by this project's `WaterMaterial.ts`
 * (confirmed working there: redeclaring these causes a GLSL "redefinition"
 * compile error, since `THREE.ShaderMaterial` always prepends them).
 */
export function createGrassMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uBaseColor:    { value: new THREE.Color(0x3a7d2c) },
      uTipColor:     { value: new THREE.Color(0x8bbf40) },
      uDryColor:     { value: new THREE.Color(0xc4a84b) },
      uDryAmount:    { value: 0 },
      uSssStrength:  { value: 0.5 },
      uAoStrength:   { value: 0.6 },
      uSunDir:       { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      uSunColor:     { value: new THREE.Color(0xfff4e5) },
      uAmbientColor: { value: new THREE.Color(0x4488aa) },
      uWindTime:     { value: 0 },
      uWindDir:      { value: new THREE.Vector2(1, 0.3).normalize() },
      uWindBase:     { value: 0.4 },
      uWindGust:     { value: 0.8 },
      uWindGustFreq: { value: 0.3 },
      uFadeStart:    { value: FADE_START },
      uFadeEnd:      { value: FADE_END },
      uFadeCenter:   { value: new THREE.Vector2(0, 0) },
    },
```

to:

```ts
/**
 * Wind-animated grass blade material, tuned per `preset` (colors, dry-tint amount, wind
 * response). Uses Three.js's automatically-injected built-ins (`position`, `normal`, `uv`,
 * `modelMatrix`, `projectionMatrix`, `viewMatrix`, `cameraPosition`) directly without
 * redeclaring them — the same convention already used by this project's `WaterMaterial.ts`
 * (confirmed working there: redeclaring these causes a GLSL "redefinition" compile error,
 * since `THREE.ShaderMaterial` always prepends them).
 */
export function createGrassMaterial(preset: GrassPreset): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uBaseColor:    { value: new THREE.Color(preset.baseColor) },
      uTipColor:     { value: new THREE.Color(preset.tipColor) },
      uDryColor:     { value: new THREE.Color(preset.dryColor) },
      uDryAmount:    { value: preset.dryAmount },
      uSssStrength:  { value: 0.5 },
      uAoStrength:   { value: 0.6 },
      uSunDir:       { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      uSunColor:     { value: new THREE.Color(0xfff4e5) },
      uAmbientColor: { value: new THREE.Color(0x4488aa) },
      uWindTime:     { value: 0 },
      uWindDir:      { value: new THREE.Vector2(1, 0.3).normalize() },
      uWindBase:     { value: preset.windBase },
      uWindGust:     { value: preset.windGust },
      uWindGustFreq: { value: preset.windGustFreq },
      uFadeStart:    { value: FADE_START },
      uFadeEnd:      { value: FADE_END },
      uFadeCenter:   { value: new THREE.Vector2(0, 0) },
    },
```

`uSssStrength`/`uAoStrength`/`uSunDir`/`uSunColor`/`uAmbientColor` stay fixed values — they're
lighting/shading parameters, not part of `GrassPreset` (the design spec's per-biome table only
covers geometry/color/wind/density, not lighting). The vertex/fragment shader source strings
below this uniforms block are unchanged — leave them exactly as they are.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: PASS — all tests, including the new preset-reflection test.

- [ ] **Step 6: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1.

- [ ] **Step 7: Commit**

```bash
git add src/world/GrassField.ts tests/world/GrassField.test.ts
git commit -m "feat: parametrize createGrassBladeGeometry/createGrassMaterial by preset (batch 2)

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: `GrassField` class — take a `GrassPreset` in its constructor

**Files:**
- Modify: `src/world/GrassField.ts`
- Modify: `tests/world/GrassField.test.ts`

**Interfaces:**
- Consumes: `GrassPreset`, `GRASS_PRESETS` (Task 1), the updated `selectGrassPlacements()`
  (Task 2), the updated `createGrassBladeGeometry()`/`createGrassMaterial()` (Task 3).
- Produces: `new GrassField(wg: WorldGrid, seed: number, preset: GrassPreset)` — `preset` becomes
  a public readonly field on the instance (`field.preset.biome`, etc.), consumed by Task 5's
  `OverworldScene.getGrassDebugInfo()`. `mesh`/`update()`/`tickWind()`/`dispose()` keep their
  exact existing signatures — only the constructor changes.

- [ ] **Step 1: Write the failing tests**

Open `tests/world/GrassField.test.ts`. Change all 7 `new GrassField(wg, 42)` call sites to
`new GrassField(wg, 42, GRASS_PRESETS.grassland)` (find-and-replace every occurrence inside the
`describe('GrassField', ...)` block — they appear in: `places no blades before the first
update() call`, `places blades on the first update() call`, `does not rebuild when the player
moves less than REBUILD_HYSTERESIS`, `rebuilds once the player moves past REBUILD_HYSTERESIS`,
`updates the fade-center uniform...`, `tickWind() advances...`, `dispose() disposes...`).

Then add 2 new tests right after the existing `dispose() disposes the mesh geometry and
material` test, immediately before the `describe('GrassField', ...)` block's closing `});`:

```ts

  it('places blades using a non-grassland preset (tundra) on an all-tundra grid', () => {
    const wg = makeAllBiomeGrid(40, 'tundra');
    const field = new GrassField(wg, 42, GRASS_PRESETS.tundra);
    field.update(0, 0);
    expect(field.mesh.count).toBeGreaterThan(0);
  });

  it('does NOT place blades using the tundra preset on an all-grassland grid (no cross-biome bleed)', () => {
    const wg = makeAllGrasslandGrid();
    const field = new GrassField(wg, 42, GRASS_PRESETS.tundra);
    field.update(0, 0);
    expect(field.mesh.count).toBe(0);
  });

  it('exposes the constructor-supplied preset as a public readonly field', () => {
    const wg = makeAllBiomeGrid(40, 'tundra');
    const field = new GrassField(wg, 42, GRASS_PRESETS.tundra);
    expect(field.preset.biome).toBe('tundra');
    expect(field.preset.maxBlades).toBe(GRASS_PRESETS.tundra.maxBlades);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: FAIL — TypeScript argument-count errors (`new GrassField(wg, 42, ...)` — too many
arguments, since the constructor doesn't accept a 3rd `preset` parameter yet) and
`field.preset` doesn't exist.

- [ ] **Step 3: Update the `GrassField` class**

In `src/world/GrassField.ts`, change:

```ts
export class GrassField {
  static readonly MAX_BLADES = 100_000; // see design spec §4's budget math

  readonly mesh: THREE.InstancedMesh;
  private readonly _material: THREE.ShaderMaterial;
  private readonly _wind = new WindSystem();
  private readonly _positionRotation: THREE.InstancedBufferAttribute;
  private readonly _scaleAndVariation: THREE.InstancedBufferAttribute;
  private _lastBuildX = Infinity;
  private _lastBuildZ = Infinity;

  constructor(private readonly _wg: WorldGrid, private readonly _seed: number) {
    const geometry = createGrassBladeGeometry();
    this._material = createGrassMaterial();

    this._positionRotation = new THREE.InstancedBufferAttribute(
      new Float32Array(GrassField.MAX_BLADES * 4), 4,
    );
    this._positionRotation.setUsage(THREE.DynamicDrawUsage);
    this._scaleAndVariation = new THREE.InstancedBufferAttribute(
      new Float32Array(GrassField.MAX_BLADES * 4), 4,
    );
    this._scaleAndVariation.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aPositionRotation', this._positionRotation);
    geometry.setAttribute('aScaleVariation', this._scaleAndVariation);

    this.mesh = new THREE.InstancedMesh(geometry, this._material, GrassField.MAX_BLADES);
    this.mesh.frustumCulled = false; // wind displacement can push blades outside static bounds
    this.mesh.count = 0; // nothing placed until the first update()
  }
```

to:

```ts
export class GrassField {
  readonly mesh: THREE.InstancedMesh;
  private readonly _material: THREE.ShaderMaterial;
  private readonly _wind = new WindSystem();
  private readonly _positionRotation: THREE.InstancedBufferAttribute;
  private readonly _scaleAndVariation: THREE.InstancedBufferAttribute;
  private _lastBuildX = Infinity;
  private _lastBuildZ = Infinity;

  constructor(
    private readonly _wg: WorldGrid,
    private readonly _seed: number,
    readonly preset: GrassPreset,
  ) {
    const geometry = createGrassBladeGeometry(preset);
    this._material = createGrassMaterial(preset);

    this._positionRotation = new THREE.InstancedBufferAttribute(
      new Float32Array(preset.maxBlades * 4), 4,
    );
    this._positionRotation.setUsage(THREE.DynamicDrawUsage);
    this._scaleAndVariation = new THREE.InstancedBufferAttribute(
      new Float32Array(preset.maxBlades * 4), 4,
    );
    this._scaleAndVariation.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aPositionRotation', this._positionRotation);
    geometry.setAttribute('aScaleVariation', this._scaleAndVariation);

    this.mesh = new THREE.InstancedMesh(geometry, this._material, preset.maxBlades);
    this.mesh.frustumCulled = false; // wind displacement can push blades outside static bounds
    this.mesh.count = 0; // nothing placed until the first update()
  }
```

Then change `update()`'s body:

```ts
    const placements = selectGrassPlacements(this._wg, playerX, playerZ, GRASS_RADIUS, this._seed);
    const count = Math.min(placements.length, GrassField.MAX_BLADES);
```

to:

```ts
    const placements = selectGrassPlacements(
      this._wg, playerX, playerZ, GRASS_RADIUS, this._seed,
      this.preset.biome, this.preset.densityPerUnit2,
    );
    const count = Math.min(placements.length, this.preset.maxBlades);
```

`tickWind()` and `dispose()` need no changes — they never referenced `MAX_BLADES`.

Also update the class's doc comment (directly above `export class GrassField {`):

```ts
/**
 * Owns one persistent `THREE.InstancedMesh` of grass blades, rebuilt (in
 * place — no reallocation) only when the player moves past
 * `REBUILD_HYSTERESIS` from the last build center. Call `update()` once per
 * frame with the player's world position, and `tickWind()` once per frame
 * to animate the shader (cheap — uniform writes only, no CPU instance work).
 */
```

to:

```ts
/**
 * Owns one persistent `THREE.InstancedMesh` of grass blades for ONE `GrassPreset`/biome,
 * rebuilt (in place — no reallocation) only when the player moves past `REBUILD_HYSTERESIS`
 * from the last build center. `OverworldScene` owns one `GrassField` per grass-bearing biome
 * (see `GRASS_PRESETS`), not one shared instance across biomes. Call `update()` once per frame
 * with the player's world position, and `tickWind()` once per frame to animate the shader
 * (cheap — uniform writes only, no CPU instance work).
 */
```

Finally, update the top-of-file module doc comment:

```ts
/**
 * GrassField.ts — procedural 3D grass blades for the live OverworldScene
 * (batch 1 — grassland biome only; see
 * docs/superpowers/specs/2026-08-31-procedural-grass-grassland-design.md).
 *
 * Renders wind-animated instanced grass blades within a small player-
 * centered radius (NOT tied to the ChunkManager's much larger terrain-
 * streaming radius — see the design spec's "Placement Radius" section for
 * why: grass density is 1-2 orders of magnitude higher per unit area than
 * tree/rock scatter, so applying it across the full streamed terrain area
 * would blow the desktop instanced-mesh budget).
 */
```

to:

```ts
/**
 * GrassField.ts — procedural 3D grass blades for the live OverworldScene.
 * Batch 1 shipped `grassland` only (see
 * docs/superpowers/specs/2026-08-31-procedural-grass-grassland-design.md); batch 2 generalized
 * every function here to take a `GrassPreset`, extending coverage to `savanna`/`forest`/
 * `taiga`/`tundra` too (see
 * docs/superpowers/specs/2026-08-31-procedural-grass-batch2-design.md). `OverworldScene` owns
 * one `GrassField` instance per `GRASS_PRESETS` entry.
 *
 * Renders wind-animated instanced grass blades within a small player-
 * centered radius (NOT tied to the ChunkManager's much larger terrain-
 * streaming radius — see the batch 1 design spec's "Placement Radius" section for
 * why: grass density is 1-2 orders of magnitude higher per unit area than
 * tree/rock scatter, so applying it across the full streamed terrain area
 * would blow the desktop instanced-mesh budget).
 */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: PASS — all tests, including the 3 new ones.

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1. This step is critical here — `OverworldScene.ts` still
calls `new GrassField(this._wg, this._seed)` (missing the now-required 3rd argument), so `tsc`
SHOULD show one new error at this point (in `OverworldScene.ts`, not in `GrassField.ts` or its
tests). If the count increased by exactly 1 and the new error is
`src/scene/OverworldScene.ts(...): error TS2554: Expected 3 arguments, but got 2.`, that's
expected — Task 5 fixes it. If the count increased by more than 1, or the extra error is
somewhere unexpected, stop and investigate before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/world/GrassField.ts tests/world/GrassField.test.ts
git commit -m "feat: parametrize GrassField class by preset (batch 2)

Note: this temporarily leaves OverworldScene.ts's single \`new GrassField(...)\`
call site one argument short of the new 3-argument constructor — Task 5
(next) replaces that single call with 5 preset-driven instances. tsc
--noEmit will show +1 error until then, expected and tracked.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: `OverworldScene.ts` — 5 `GrassField` instances + debug-hook generalization

**Files:**
- Modify: `src/scene/OverworldScene.ts`:
  - Import (near the top, alongside the existing `GrassField` import)
  - Field declaration (near `_grassField!: GrassField;`)
  - Constructor (the `new GrassField(...)` call)
  - `enter()` / `exit()` (the `scene.add`/`scene.remove` calls)
  - `update()` (the `.update()`/`.tickWind()` calls)
  - `dispose()` (the `.dispose()` call)
  - `findFirstGrasslandTile()` → generalized to `findFirstBiomeTile(biome: BiomeId)`
  - `getGrassDebugInfo()` → generalized to report per-biome blade counts
- Modify: `src/main.ts` (the `window.__game` hooks that call the above two methods)
- Modify: `tests/e2e/procedural-grass.spec.ts` (updated to use the renamed/regeneralized hooks)

**Interfaces:**
- Consumes: `GrassField`, `GRASS_PRESETS` (Task 1-4).
- Produces: `OverworldScene.findFirstBiomeTile(biome: BiomeId): { x: number; z: number } | null`,
  `OverworldScene.getGrassDebugInfo(): { bladeCounts: Record<string, number>; inScene: boolean }`.
  Consumed by `main.ts`'s hooks and Task 6's e2e verification.

- [ ] **Step 1: Update the import and field declaration**

In `src/scene/OverworldScene.ts`, change:

```ts
import { GrassField } from '@/world/GrassField';
```

to:

```ts
import { GrassField, GRASS_PRESETS } from '@/world/GrassField';
```

Then change:

```ts
  /** Procedural grass (batch 1 — grassland biome only). Built in the constructor once
   *  `this._wg`/`this._seed` are set (needs both, so it can't be a field initializer default
   *  like `_slimeIM` above, which has no such dependency). */
  private _grassField!: GrassField;
```

to:

```ts
  /** Procedural grass — one `GrassField` per `GRASS_PRESETS` entry (grassland/savanna/forest/
   *  taiga/tundra, see batch 2's design spec). Built in the constructor once `this._wg`/
   *  `this._seed` are set (needs both, so it can't be a field initializer default like
   *  `_slimeIM` above, which has no such dependency). */
  private _grassFields!: GrassField[];
```

- [ ] **Step 2: Update the constructor**

Change:

```ts
    this._grassField = new GrassField(this._wg, this._seed);
```

to:

```ts
    this._grassFields = Object.values(GRASS_PRESETS).map(
      preset => new GrassField(this._wg, this._seed, preset),
    );
```

- [ ] **Step 3: Update `enter()`/`exit()`**

Change (in `enter()`):

```ts
    this.scene.add(this._grassField.mesh);
```

to:

```ts
    for (const gf of this._grassFields) this.scene.add(gf.mesh);
```

Change (in `exit()`):

```ts
    this.scene.remove(this._grassField.mesh);
```

to:

```ts
    for (const gf of this._grassFields) this.scene.remove(gf.mesh);
```

- [ ] **Step 4: Update `update()`**

Change:

```ts
    // Procedural grass (batch 1): rebuild the instance buffer only when the
    // player has moved past REBUILD_HYSTERESIS; tick wind uniforms every frame.
    this._grassField.update(pos.x, pos.z);
    this._grassField.tickWind(dt);
```

to:

```ts
    // Procedural grass (batch 2: 5 biome presets): rebuild each field's instance buffer
    // only when the player has moved past REBUILD_HYSTERESIS; tick wind uniforms every
    // frame. A given tile is only ever one biome, so at most one field actually places
    // blades near the player at a time — the others just do a cheap no-op update() call.
    for (const gf of this._grassFields) {
      gf.update(pos.x, pos.z);
      gf.tickWind(dt);
    }
```

- [ ] **Step 5: Update `dispose()`**

Change:

```ts
    this._grassField.dispose();
```

to:

```ts
    for (const gf of this._grassFields) gf.dispose();
```

- [ ] **Step 6: Generalize `findFirstGrasslandTile()` to `findFirstBiomeTile(biome)`**

Change:

```ts
  /** First grassland-biome tile found by scanning the grid (or null). For tests/dev-tooling
   *  verification of the procedural grass system — mirrors `findFirstFordTile()`. */
  findFirstGrasslandTile(): { x: number; z: number } | null {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    for (let row = 0; row < GH; row++) {
      for (let col = 0; col < GW; col++) {
        if (this._wg.get(col, row).biome !== 'grassland') continue;
        return { x: (col - GHW) * T, z: (row - GHH) * T };
      }
    }
    return null;
  }
```

to:

```ts
  /** First tile of the given biome found by scanning the grid (or null). For tests/dev-tooling
   *  verification of the procedural grass system (batch 2 — generalized from the batch-1-only
   *  `findFirstGrasslandTile()`) — mirrors `findFirstFordTile()`. */
  findFirstBiomeTile(biome: BiomeId): { x: number; z: number } | null {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    for (let row = 0; row < GH; row++) {
      for (let col = 0; col < GW; col++) {
        if (this._wg.get(col, row).biome !== biome) continue;
        return { x: (col - GHW) * T, z: (row - GHH) * T };
      }
    }
    return null;
  }
```

- [ ] **Step 7: Generalize `getGrassDebugInfo()` to per-biome blade counts**

Change:

```ts
  /** Debug/dev-tooling only: grass instanced-mesh blade count + scene membership
   *  (for verification scripts). Mirrors `getWaterMeshDebugInfo()`. */
  getGrassDebugInfo(): { bladeCount: number; inScene: boolean } {
    return {
      bladeCount: this._grassField.mesh.count,
      inScene: this.scene.children.includes(this._grassField.mesh),
    };
  }
```

to:

```ts
  /** Debug/dev-tooling only: per-biome grass instanced-mesh blade counts + scene membership
   *  (for verification scripts). Mirrors `getWaterMeshDebugInfo()`. `bladeCounts` is keyed by
   *  biome name (one entry per `GRASS_PRESETS` biome, e.g. `{ grassland: 8207, savanna: 0,
   *  tundra: 0, forest: 0, taiga: 0 }` when the player stands on a grassland tile). */
  getGrassDebugInfo(): { bladeCounts: Record<string, number>; inScene: boolean } {
    const bladeCounts: Record<string, number> = {};
    for (const gf of this._grassFields) bladeCounts[gf.preset.biome] = gf.mesh.count;
    return {
      bladeCounts,
      inScene: this._grassFields.every(gf => this.scene.children.includes(gf.mesh)),
    };
  }
```

- [ ] **Step 8: Check `tsc` baseline is back to normal (Task 4's expected +1 resolved)**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1 (the +1 from Task 4 Step 5 should now be gone, since
`OverworldScene.ts`'s `new GrassField(...)` call is fixed).

- [ ] **Step 9: Update `main.ts`'s debug hooks**

In `src/main.ts`, change:

```ts
      /** First grassland-biome tile world position (exterior mode only). For tests. */
      findFirstGrasslandTile: () => gameMode === 'exterior' ? (overworld?.findFirstGrasslandTile() ?? null) : null,
      /** Grass instanced-mesh debug info (exterior mode only). For tests. */
      getGrassDebugInfo: () => gameMode === 'exterior' ? (overworld?.getGrassDebugInfo() ?? null) : null,
```

to:

```ts
      /** First tile of the given biome world position (exterior mode only). For tests.
       *  Generalized from batch 1's grassland-only `findFirstGrasslandTile` hook. */
      findFirstBiomeTile: (biome: BiomeId) => gameMode === 'exterior' ? (overworld?.findFirstBiomeTile(biome) ?? null) : null,
      /** Per-biome grass instanced-mesh debug info (exterior mode only). For tests. */
      getGrassDebugInfo: () => gameMode === 'exterior' ? (overworld?.getGrassDebugInfo() ?? null) : null,
```

Check whether `BiomeId` is already imported in `src/main.ts`:

Run: `grep -n "import.*BiomeId" src/main.ts`

If that prints nothing, add the import — find `main.ts`'s existing import block for
`@/world/WorldGrid` types (if one exists) and add `BiomeId` to it, or add a new line:

```ts
import type { BiomeId } from '@/world/WorldGrid';
```

placed alongside `main.ts`'s other `@/world/...` type imports.

- [ ] **Step 10: Update the e2e verification spec**

In `tests/e2e/procedural-grass.spec.ts`, change:

```ts
    const tile = await page.evaluate(() => (window as any).__game.findFirstGrasslandTile());
    expect(tile, 'No grassland tile found in generated overworld').toBeTruthy();
```

to:

```ts
    const tile = await page.evaluate(() => (window as any).__game.findFirstBiomeTile('grassland'));
    expect(tile, 'No grassland tile found in generated overworld').toBeTruthy();
```

And change:

```ts
    const grassInfo = await page.evaluate(() => (window as any).__game.getGrassDebugInfo());
    expect(grassInfo.inScene, 'Grass mesh not in scene').toBe(true);
    expect(grassInfo.bladeCount, 'No grass blades placed on a grassland tile').toBeGreaterThan(0);
```

to:

```ts
    const grassInfo = await page.evaluate(() => (window as any).__game.getGrassDebugInfo());
    expect(grassInfo.inScene, 'Grass mesh not in scene').toBe(true);
    expect(grassInfo.bladeCounts.grassland, 'No grass blades placed on a grassland tile').toBeGreaterThan(0);
```

- [ ] **Step 11: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1.

- [ ] **Step 12: Run the existing OverworldScene test suite to confirm no regression**

Run: `npx vitest run tests/scene/OverworldScene.chunk-scatter-alignment.test.ts tests/scene/OverworldScene.settlement-parity.test.ts tests/scene/OverworldScene.drawcall-batching.test.ts tests/scene/OverworldScene.chunk-terrain-alignment.test.ts tests/scene/OverworldScene.chunk-collider-streaming.test.ts`
Expected: PASS. `OverworldScene.drawcall-batching.test.ts` is again the most relevant one —
going from 1 to 5 `GrassField` instances adds +4 to the scene's mesh count (each
`InstancedMesh` `isMesh`-matches, since it extends `Mesh`), nowhere near its `< 8000` threshold.
`OverworldScene.chunk-scatter-alignment.test.ts`/`OverworldScene.settlement-parity.test.ts` are
this project's known occasional sandbox-contention flakes — re-run either one in isolation if it
fails here before concluding it's a real regression.

- [ ] **Step 13: Commit**

```bash
git add src/scene/OverworldScene.ts src/main.ts tests/e2e/procedural-grass.spec.ts
git commit -m "feat: wire 5 biome-preset GrassField instances into OverworldScene (batch 2)

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: e2e verification for new biomes + full regression + ship

**Files:**
- Modify: `tests/e2e/procedural-grass.spec.ts` (add a per-new-biome verification test)
- Modify: `docs/visual-progress.md` (update the batch 1 entry to note batch 2)

**Interfaces:** N/A — this task is verification + documentation + shipping only.

- [ ] **Step 1: Add a per-new-biome e2e test**

Open `tests/e2e/procedural-grass.spec.ts`. Change the `test.describe` title and add a new test
right after the existing one (before the `describe`'s closing `});`):

Change:
```ts
test.describe('Procedural grass (grassland batch 1)', () => {
```
to:
```ts
test.describe('Procedural grass (grassland batch 1 + savanna/forest/taiga/tundra batch 2)', () => {
```

Append (after the existing test, before the `});` that closes the `describe` block):

```ts

  test('each of the 4 new biome presets (savanna/forest/taiga/tundra) places grass blades on its own biome tile', async ({ page }) => {
    const { errors, all } = attachFullConsoleCapture(page);

    await loadPage(page);
    await startGame(page);
    await goExterior(page);

    for (const biome of ['savanna', 'forest', 'taiga', 'tundra'] as const) {
      const tile = await page.evaluate((b) => (window as any).__game.findFirstBiomeTile(b), biome);
      expect(tile, `No ${biome} tile found in generated overworld`).toBeTruthy();

      await teleportPlayer(page, (tile as { x: number; z: number }).x, 5, (tile as { x: number; z: number }).z);
      await page.evaluate(() => (window as any).__game.forceTick(10));
      await page.waitForTimeout(300);

      const grassInfo = await page.evaluate(() => (window as any).__game.getGrassDebugInfo());
      expect(grassInfo.bladeCounts[biome], `No grass blades placed on a ${biome} tile`).toBeGreaterThan(0);
    }

    expect(errors, `Console/page errors: ${all.join('\n')}`).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the e2e verification suite**

Kill any stray dev-server process squatting on port 5174 first (this shared environment has
occasionally had an unrelated `vite` process from a different checkout left running on this
port — verify with `ps aux | grep -i vite | grep -v grep` and `kill <pid>` if one shows up
pointing at a different directory than this worktree):

Run: `npx playwright test tests/e2e/procedural-grass.spec.ts`
Expected: 2 passed. If the new per-biome test fails with "No `<biome>` tile found", the default
seed's generated world may not contain that biome — retry with an explicit seed argument in this
spec's own `startGame(page, 0xC0FFEE)` call (do not modify shared `tests/e2e/helpers.ts`
defaults for a one-off spec).

- [ ] **Step 3: Visually confirm at least one new biome's grass looks reasonable**

Manually verify (mirroring the batch-1 fade-center bug investigation's approach): boot a local
dev server (`npm run dev -- --host 127.0.0.1 --port 5174`), use a short Playwright script to
teleport the player onto a savanna and a tundra tile, and take a screenshot (via the raw CDP
`Page.captureScreenshot` approach if Playwright's own `page.screenshot()` times out on
"waiting for fonts to load" in this environment — a known, unrelated environment slowness, not
a code bug). Confirm blades render densely around the player (not just a sliver at a distance —
the exact bug this batch's fade-center fix already resolved for grassland) and that each biome's
color/height reads distinctly from grassland's. Clean up any temp script files and kill the
manually-started dev server when done.

- [ ] **Step 4: Run the full unit/integration test suite**

Run: `npx vitest run`
Expected: the same pre-existing baseline failures already established in this project's ongoing
verification history (`main.startup.smoke.test.ts`, `enemyLoader.test.ts`, `towerGenerator.test.ts`,
`talentSystem.test.ts`, `WaterMaterial.test.ts` — count varies run-to-run within a known small
range; `OverworldScene.chunk-scatter-alignment.test.ts`/`ResourceNodePlacer.test.ts` are known
sandbox-contention flakes — re-run either in isolation if they fail here), plus every new/changed
grass test from Tasks 1-5 passing, and zero NEW failures beyond that established baseline set.

- [ ] **Step 5: Final `tsc` check**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1.

- [ ] **Step 6: Update the visual-progress log**

Open `docs/visual-progress.md`. Change:

```markdown
## Procedural Grass — Batch 1 (Grassland)

Wind-animated 3D grass blades (bezier-curved instanced geometry, SSS/AO shading, distance
fade) render within a 24-WU player-centered radius on grassland-biome tiles. Savanna/forest/
taiga/tundra grass is a planned follow-up batch — see
`docs/superpowers/specs/2026-08-31-procedural-grass-grassland-design.md`.
```

to:

```markdown
## Procedural Grass — Batch 1+2 (Grassland, Savanna, Forest, Taiga, Tundra)

Wind-animated 3D grass blades (bezier-curved instanced geometry, SSS/AO shading, distance
fade) render within a 24-WU player-centered radius on all 5 grass-bearing biomes, each with
its own preset (blade dimensions, color, density, wind response) tuned to that biome's
character — see `docs/superpowers/specs/2026-08-31-procedural-grass-grassland-design.md`
(batch 1) and `docs/superpowers/specs/2026-08-31-procedural-grass-batch2-design.md` (batch 2).
```

- [ ] **Step 7: Commit and push**

```bash
git add tests/e2e/procedural-grass.spec.ts docs/visual-progress.md
git commit -m "test: add batch 2 per-biome e2e verification; update visual-progress log

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
git push origin HEAD:main
```
