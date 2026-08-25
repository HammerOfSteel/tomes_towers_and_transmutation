# Ocean Shoreline, Depth Gradient & Biome Scatter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the collision bug that lets players walk straight through the
"deep" ocean, give the live overworld's ocean a real shallow-near-shore /
deep-further-out depth split, add a `sand` beach biome with a few
procedural nature props, and stop trees/rocks/enemy camps/ruins from
spawning inside water.

**Architecture:** Small, surgical changes across the existing RI-3 water
pipeline (`WaterDepthConfig.ts` → `RealmToWorldGrid.ts` →
`TerrainGeometryBuilder.ts` → `WaterDetection.ts`, unchanged internally) plus
one new pure rules module (`ScatterRules.ts`) that centralizes "can I place
X on this cell" logic previously duplicated ad-hoc across five
`OverworldScene` methods. One line changes a physics safety-net plane's
height — the actual root-cause bug fix.

**Tech Stack:** TypeScript, Vitest, Three.js (procedural geometry, no
asset imports), Rapier3D (`@dimforge/rapier3d-compat`), the existing
in-repo `WorldGrid`/`WorldCell` data model.

## Global Constraints

- No new asset pipeline / no GLTF imports — every visual prop in this
  codebase (trees, rocks, bushes) is built from THREE.js primitive
  geometry + the existing `makeMottledCanvasTexture()` canvas-noise
  helper; beach decor follows the same pattern.
- `physicalHeightWU()` (`WaterDepthConfig.ts`) stays the single source of
  truth for both the visual mesh/collider (`TerrainGeometryBuilder`) and
  the swim query (`WaterDetection.getWaterInfoAt()`) — do not duplicate
  its math anywhere.
- `BiomeId` gains exactly one new value (`'sand'`) — no other biome
  taxonomy changes in this plan (see spec's "Out of scope").
- Every data/math change is TDD: failing test → minimal implementation →
  passing test → commit.
- The Y=0 safety-net floor fix and the shallow/deep depth tuning are
  physics-timing-dependent and cannot be meaningfully unit-tested — they
  are verified by a mandatory manual Playwright playtest task (Task 9). Do
  not claim this plan complete without running it.
- Full existing test suite must pass before this plan is considered done
  (Task 10).

Full design spec: `docs/superpowers/specs/2026-08-26-ocean-shoreline-and-biome-scatter-design.md`

---

### Task 1: Add `'sand'` to `BiomeId`

**Files:**
- Modify: `src/world/WorldGrid.ts:9`
- Test: `tests/world/WorldGrid.test.ts`

**Interfaces:**
- Produces: `BiomeId` now includes `'sand'` as a 7th valid value. All
  downstream tasks (2-8) that reference `BiomeId` treat `'sand'` as a
  normal, valid, dry, walkable biome — no other file needs to special-case
  its existence unless explicitly doing so (rendering, scatter rules).

- [ ] **Step 1: Write the failing test**

Add to `tests/world/WorldGrid.test.ts` (new `describe` block at the end
of the file):

```ts
describe('WorldGrid — sand biome', () => {
  it('accepts sand as a valid BiomeId via set()', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'sand' });
    expect(wg.get(0, 0).biome).toBe('sand');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/WorldGrid.test.ts`
Expected: FAIL — TypeScript error, `'sand'` is not assignable to type
`BiomeId` (or a Vitest/TS compile error surfaced through the test runner).

- [ ] **Step 3: Add `'sand'` to the `BiomeId` union**

In `src/world/WorldGrid.ts`, change:

```ts
export type BiomeId = 'bog' | 'grass' | 'forest' | 'highland' | 'rocky' | 'water';
```

to:

```ts
export type BiomeId = 'bog' | 'grass' | 'forest' | 'highland' | 'rocky' | 'water' | 'sand';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/WorldGrid.test.ts`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/world/WorldGrid.ts tests/world/WorldGrid.test.ts
git commit -m "Add 'sand' as a valid BiomeId

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Split ocean depth into shallow/deep constants

**Files:**
- Modify: `src/world/WaterDepthConfig.ts`
- Modify: `src/world/RealmToWorldGrid.ts` (import site only — value usage
  fixed in Task 3)
- Test: `tests/world/WaterDepthConfig.test.ts`
- Test: `tests/world/WaterDetection.test.ts` (rename-only fix, see Step 6)

**Interfaces:**
- Consumes: nothing new.
- Produces: `OCEAN_SHALLOW_DEPTH_WU` (new, = 1.0) and
  `OCEAN_DEEP_DEPTH_WU` (renamed from `OCEAN_DEPTH_WU`, value unchanged =
  2.5) exported from `WaterDepthConfig.ts`. `physicalHeightWU()`'s
  signature and behavior are unchanged. Task 3 consumes both new/renamed
  constants.

- [ ] **Step 1: Write the failing test**

Replace the existing ocean-depth assertions in
`tests/world/WaterDepthConfig.test.ts` (the whole file) with:

```ts
import { describe, it, expect } from 'vitest';
import {
  RIVER_DEPTH_WU,
  OCEAN_SHALLOW_DEPTH_WU,
  OCEAN_DEEP_DEPTH_WU,
  LEVEL_HEIGHT,
  physicalHeightWU,
} from '@/world/WaterDepthConfig';

describe('WaterDepthConfig — physicalHeightWU', () => {
  it('equals elevation * LEVEL_HEIGHT for a dry tile (waterDepth 0)', () => {
    expect(physicalHeightWU({ elevation: 2, waterDepth: 0 })).toBeCloseTo(2 * LEVEL_HEIGHT, 9);
  });

  it('subtracts the river depth for a river tile', () => {
    const h = physicalHeightWU({ elevation: 3, waterDepth: RIVER_DEPTH_WU });
    expect(h).toBeCloseTo(3 * LEVEL_HEIGHT - RIVER_DEPTH_WU, 9);
  });

  it('subtracts the shallow ocean depth for a shallow-band ocean tile', () => {
    const h = physicalHeightWU({ elevation: 0, waterDepth: OCEAN_SHALLOW_DEPTH_WU });
    expect(h).toBeCloseTo(0 * LEVEL_HEIGHT - OCEAN_SHALLOW_DEPTH_WU, 9);
  });

  it('subtracts the deep ocean depth for a deep-band ocean tile', () => {
    const h = physicalHeightWU({ elevation: 0, waterDepth: OCEAN_DEEP_DEPTH_WU });
    expect(h).toBeCloseTo(0 * LEVEL_HEIGHT - OCEAN_DEEP_DEPTH_WU, 9);
  });

  it('deep ocean depth is deeper than shallow ocean depth, which is deeper than river depth', () => {
    expect(OCEAN_DEEP_DEPTH_WU).toBeGreaterThan(OCEAN_SHALLOW_DEPTH_WU);
    expect(OCEAN_SHALLOW_DEPTH_WU).toBeGreaterThan(0);
  });

  it('all depth constants are positive', () => {
    expect(RIVER_DEPTH_WU).toBeGreaterThan(0);
    expect(OCEAN_SHALLOW_DEPTH_WU).toBeGreaterThan(0);
    expect(OCEAN_DEEP_DEPTH_WU).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/WaterDepthConfig.test.ts`
Expected: FAIL — `OCEAN_SHALLOW_DEPTH_WU` and `OCEAN_DEEP_DEPTH_WU` are
not exported from `@/world/WaterDepthConfig` yet.

- [ ] **Step 3: Rename `OCEAN_DEPTH_WU` and add the shallow constant**

In `src/world/WaterDepthConfig.ts`, replace:

```ts
/** Carved depth (world units) for ocean-rim water-biome tiles — deeper than
 *  rivers since the ocean is the world's deepest water body. Same tuning
 *  rationale as RIVER_DEPTH_WU above; 2.5 WU keeps a visible margin over the
 *  river depth so the ocean still reads as the deeper body. */
export const OCEAN_DEPTH_WU = 2.5;
```

with:

```ts
/** Carved depth (world units) for the shallow ocean band — the ring of
 *  water nearest the coastline (realm's `ocean` biome, as opposed to
 *  `deep_ocean`). Intentionally shallow enough that a standing player only
 *  ever reaches "wading" (`setSubmersion`), never real swim mode: per the
 *  RIVER_DEPTH_WU comment above, the standing depth-below-surface is
 *  `waterDepth - 0.85`, and needs to clear ~1.75 WU to cross
 *  SWIM_ENTER_DEPTH_THRESHOLD. 1.0 WU gives a standing depth of 0.15 —
 *  clearly wet, clearly not swimmable — matching a real beach's shallows. */
export const OCEAN_SHALLOW_DEPTH_WU = 1.0;

/** Carved depth (world units) for the deep ocean band (realm's
 *  `deep_ocean` biome) — the real swim-triggering depth. Renamed from the
 *  original `OCEAN_DEPTH_WU` (same 2.5 WU value, proven via manual
 *  playtest in RI-3) now that ocean water has two depth tiers instead of
 *  one flat value. */
export const OCEAN_DEEP_DEPTH_WU = 2.5;
```

- [ ] **Step 4: Update the one production import site**

In `src/world/RealmToWorldGrid.ts`, change the import:

```ts
import { OCEAN_DEPTH_WU } from './WaterDepthConfig';
```

to:

```ts
import { OCEAN_SHALLOW_DEPTH_WU, OCEAN_DEEP_DEPTH_WU } from './WaterDepthConfig';
```

(The one usage site, `waterDepth: isWater ? OCEAN_DEPTH_WU : 0`, is fully
rewritten in Task 3 — this step only fixes the import so the file
compiles standalone; do not touch the usage line yet.)

- [ ] **Step 5: Run the WaterDepthConfig test to verify it passes**

Run: `npx vitest run tests/world/WaterDepthConfig.test.ts`
Expected: PASS.

- [ ] **Step 6: Fix the other two references to the old name**

`tests/world/RealmToWorldGrid.test.ts` and
`tests/world/WaterDetection.test.ts` both still import `OCEAN_DEPTH_WU`.
`RealmToWorldGrid.test.ts`'s specific assertion is rewritten in Task 3
(its expected biome-mapping behavior changes there); for now, just fix
`WaterDetection.test.ts`'s import and usage so it keeps compiling and
testing the deep-water case (its own behavior is unaffected — it only
constructs a mock cell with an explicit `waterDepth` number, it doesn't
call `realmToWorldGrid` at all):

In `tests/world/WaterDetection.test.ts`, change:

```ts
import { LEVEL_HEIGHT, RIVER_DEPTH_WU, OCEAN_DEPTH_WU } from '@/world/WaterDepthConfig';
```

to:

```ts
import { LEVEL_HEIGHT, RIVER_DEPTH_WU, OCEAN_DEEP_DEPTH_WU } from '@/world/WaterDepthConfig';
```

and change both later usages of `OCEAN_DEPTH_WU` in that file to
`OCEAN_DEEP_DEPTH_WU` (same values, name only):

```ts
const wg = makeMockGrid(makeCell({ biome: 'water' as any, waterDepth: OCEAN_DEEP_DEPTH_WU, elevation: 0 }));
```

```ts
expect(info!.depth).toBe(OCEAN_DEEP_DEPTH_WU);
expect(info!.floorY).toBeCloseTo(-OCEAN_DEEP_DEPTH_WU, 9);
```

- [ ] **Step 7: Run the full water test slice to verify nothing else broke**

Run: `npx vitest run tests/world/WaterDepthConfig.test.ts tests/world/WaterDetection.test.ts`
Expected: PASS for both files. (`tests/world/RealmToWorldGrid.test.ts` is
expected to still be RED at this point — its `OCEAN_DEPTH_WU` import is
now a broken reference to a removed export; that's fixed in Task 3, the
very next task, so leave it broken here rather than half-fixing it.)

- [ ] **Step 8: Commit**

```bash
git add src/world/WaterDepthConfig.ts src/world/RealmToWorldGrid.ts tests/world/WaterDepthConfig.test.ts tests/world/WaterDetection.test.ts
git commit -m "Split OCEAN_DEPTH_WU into shallow/deep ocean depth constants

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Wire the shallow/deep split and sand biome into `RealmToWorldGrid`

**Files:**
- Modify: `src/world/RealmToWorldGrid.ts`
- Test: `tests/world/RealmToWorldGrid.test.ts`

**Interfaces:**
- Consumes: `OCEAN_SHALLOW_DEPTH_WU`, `OCEAN_DEEP_DEPTH_WU` (Task 2);
  `'sand'` `BiomeId` (Task 1).
- Produces: `realmToWorldGrid()`'s behavior — unchanged signature
  `(realm: RealmData, worldSize: number) => WorldGrid` — now maps realm
  `beach` → WorldGrid `'sand'` (not `'grass'`), realm `ocean` → `'water'`
  with `waterDepth: OCEAN_SHALLOW_DEPTH_WU`, realm `deep_ocean` →
  `'water'` with `waterDepth: OCEAN_DEEP_DEPTH_WU`. This is what Tasks 4
  (rendering) and 9 (playtest) rely on.

- [ ] **Step 1: Write the failing tests**

In `tests/world/RealmToWorldGrid.test.ts`, first fix the broken import
(currently references the now-removed `OCEAN_DEPTH_WU`):

```ts
import { OCEAN_SHALLOW_DEPTH_WU, OCEAN_DEEP_DEPTH_WU } from '@/world/WaterDepthConfig';
```

Then update the `'maps every RealmBiome to a valid WorldGrid BiomeId'`
test's `validWorldBiomes` set to include `'sand'`:

```ts
const validWorldBiomes = new Set(['bog', 'grass', 'forest', 'highland', 'rocky', 'water', 'sand']);
```

Replace the `'carves waterDepth = OCEAN_DEPTH_WU and marks ocean/water
tiles unwalkable'` test with two tests, one per depth band:

```ts
  it('carves waterDepth = OCEAN_DEEP_DEPTH_WU for deep_ocean and marks it unwalkable', () => {
    const cells = [[
      { elevation: 0.1, moisture: 0.5, biome: 'deep_ocean' as const },
      { elevation: 0.5, moisture: 0.5, biome: 'grassland' as const },
    ]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 128);
    expect(grid.get(0, 0).biome).toBe('water');
    expect(grid.get(0, 0).waterDepth).toBe(OCEAN_DEEP_DEPTH_WU);
    expect(grid.get(0, 0).walkable).toBe(false);
    // Non-water tile stays dry and walkable.
    expect(grid.get(127, 0).waterDepth).toBe(0);
    expect(grid.get(127, 0).walkable).toBe(true);
  });

  it('carves waterDepth = OCEAN_SHALLOW_DEPTH_WU for the ocean (shallow) band', () => {
    const cells = [[
      { elevation: 0.32, moisture: 0.5, biome: 'ocean' as const },
    ]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 128);
    expect(grid.get(0, 0).biome).toBe('water');
    expect(grid.get(0, 0).waterDepth).toBe(OCEAN_SHALLOW_DEPTH_WU);
    expect(grid.get(0, 0).walkable).toBe(false);
  });

  it('shallow ocean depth is less than deep ocean depth', () => {
    expect(OCEAN_SHALLOW_DEPTH_WU).toBeLessThan(OCEAN_DEEP_DEPTH_WU);
  });

  it('maps beach to a distinct sand biome, not grass', () => {
    const cells = [[
      { elevation: 0.36, moisture: 0.5, biome: 'beach' as const },
      { elevation: 0.5,  moisture: 0.5, biome: 'grassland' as const },
    ]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 128);
    expect(grid.get(0, 0).biome).toBe('sand');
    expect(grid.get(0, 0).waterDepth).toBe(0);
    expect(grid.get(0, 0).walkable).toBe(true);
    expect(grid.get(127, 0).biome).toBe('grass');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/RealmToWorldGrid.test.ts`
Expected: FAIL — `beach` still maps to `'grass'`, `ocean`/`deep_ocean` both
still map to the same flat depth, `OCEAN_SHALLOW_DEPTH_WU` usage compiles
but the production code doesn't produce it yet.

- [ ] **Step 3: Implement the shallow/deep split and sand mapping**

In `src/world/RealmToWorldGrid.ts`, change the biome map:

```ts
const REALM_BIOME_TO_WORLD_BIOME: Record<RealmBiome, BiomeId> = {
  deep_ocean: 'water',
  ocean:      'water',
  beach:      'grass',
  desert:     'grass',
  savanna:    'grass',
  grassland:  'grass',
  forest:     'forest',
  taiga:      'forest',
  tundra:     'highland',
  snow:       'rocky',
};
```

to:

```ts
const REALM_BIOME_TO_WORLD_BIOME: Record<RealmBiome, BiomeId> = {
  deep_ocean: 'water',
  ocean:      'water',
  beach:      'sand',
  desert:     'grass',
  savanna:    'grass',
  grassland:  'grass',
  forest:     'forest',
  taiga:      'forest',
  tundra:     'highland',
  snow:       'rocky',
};
```

Then change the water-depth assignment in `realmToWorldGrid()`. Replace:

```ts
      const biome = REALM_BIOME_TO_WORLD_BIOME[cell.biome];
      // Ocean-rim water tiles get a real carved depth (RI-3) so they're
      // physically swimmable, not just cosmetically tinted — matching
      // river tiles' HydrologyGenerator.ts treatment.
      const isWater = biome === 'water';
      grid.set(col, row, {
        elevation:  quantizeElevation(cell.elevation),
        biome,
        waterDepth: isWater ? OCEAN_DEPTH_WU : 0,
        walkable:   !isWater,
      });
```

with:

```ts
      const biome = REALM_BIOME_TO_WORLD_BIOME[cell.biome];
      // Ocean-rim water tiles get a real carved depth (RI-3) so they're
      // physically swimmable, not just cosmetically tinted — matching
      // river tiles' HydrologyGenerator.ts treatment. Two depth tiers
      // (not one flat value): the realm's own `ocean` (shallow, coastal
      // ring) vs `deep_ocean` (open water) classification drives a real
      // shallow-near-shore / deep-further-out gradient instead of
      // discarding that distinction as before.
      const isWater = biome === 'water';
      const waterDepth = cell.biome === 'deep_ocean' ? OCEAN_DEEP_DEPTH_WU
                        : cell.biome === 'ocean'      ? OCEAN_SHALLOW_DEPTH_WU
                        : 0;
      grid.set(col, row, {
        elevation:  quantizeElevation(cell.elevation),
        biome,
        waterDepth,
        walkable:   !isWater,
      });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/RealmToWorldGrid.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Run the full water-related test slice to check for regressions**

Run: `npx vitest run tests/world/WaterDepthConfig.test.ts tests/world/WaterDetection.test.ts tests/world/RealmToWorldGrid.test.ts tests/world/HydrologyGenerator.test.ts`
Expected: PASS for all four files.

- [ ] **Step 6: Commit**

```bash
git add src/world/RealmToWorldGrid.ts tests/world/RealmToWorldGrid.test.ts
git commit -m "Give ocean a real shallow/deep depth split and a distinct sand biome

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Render sand tiles and tint shallow vs. deep water

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Test: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `'sand'` `BiomeId` (Task 1), `OCEAN_SHALLOW_DEPTH_WU` /
  `OCEAN_DEEP_DEPTH_WU` (Task 2) only for writing the test fixture depths
  — the builder itself keys off `cell.waterDepth`, not the named
  constants, to stay depth-value-agnostic (see Step 3).
- Produces: `buildTerrainGeometryData()`'s output now colors `'sand'`
  tiles with `BIOME_SAND` and colors `'water'` tiles with a lighter tint
  when `cell.waterDepth` is below a `SHALLOW_WATER_TINT_THRESHOLD_WU`
  midpoint, darker above it — both new exported constants. Signature
  unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/TerrainGeometryBuilder.test.ts` (new `describe`
blocks at the end of the file):

```ts
describe('buildTerrainGeometryData — sand biome', () => {
  it('colors sand-biome tiles using the sand palette, distinct from grass', () => {
    const sandGrid = new WorldGrid(1, 1);
    sandGrid.set(0, 0, { biome: 'sand', elevation: 1 });
    const sandData = buildTerrainGeometryData(sandGrid, 1, 1, 0, 0, 1, 1);

    const grassGrid = new WorldGrid(1, 1);
    grassGrid.set(0, 0, { biome: 'grass', elevation: 1 });
    const grassData = buildTerrainGeometryData(grassGrid, 1, 1, 0, 0, 1, 1);

    const sandColor  = [sandData.colors[0]!, sandData.colors[1]!, sandData.colors[2]!];
    const grassColor = [grassData.colors[0]!, grassData.colors[1]!, grassData.colors[2]!];
    expect(sandColor).not.toEqual(grassColor);
  });
});

describe('buildTerrainGeometryData — shallow vs deep water tint (RI-3 shoreline)', () => {
  it('tints a shallow-depth water tile lighter than a deep-depth water tile', () => {
    const shallowGrid = new WorldGrid(1, 1);
    shallowGrid.set(0, 0, { biome: 'water', waterDepth: OCEAN_SHALLOW_DEPTH_WU });
    const shallowData = buildTerrainGeometryData(shallowGrid, 1, 1, 0, 0, 1, 1);

    const deepGrid = new WorldGrid(1, 1);
    deepGrid.set(0, 0, { biome: 'water', waterDepth: OCEAN_DEEP_DEPTH_WU });
    const deepData = buildTerrainGeometryData(deepGrid, 1, 1, 0, 0, 1, 1);

    // Sum of RGB channels as a simple brightness proxy — shallow should
    // read visibly lighter than deep.
    const shallowBrightness = shallowData.colors[0]! + shallowData.colors[1]! + shallowData.colors[2]!;
    const deepBrightness    = deepData.colors[0]!    + deepData.colors[1]!    + deepData.colors[2]!;
    expect(shallowBrightness).toBeGreaterThan(deepBrightness);
  });
});
```

Add the two new imports to the top of the test file:

```ts
import { RIVER_DEPTH_WU, OCEAN_SHALLOW_DEPTH_WU, OCEAN_DEEP_DEPTH_WU } from '@/world/WaterDepthConfig';
```

(replacing the existing `import { RIVER_DEPTH_WU } from '@/world/WaterDepthConfig';` line).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: FAIL — the sand test fails because `TerrainGeometryBuilder` has
no sand-specific color branch yet: a `'sand'`-biome tile (valid since Task
1) silently falls through to the generic `BIOME_VARIANTS[H]` land-level
branch keyed only by elevation, so it isn't reliably/intentionally
distinct from grass. The water-tint test fails because shallow and deep
water currently render identically (`BIOME_WATER` flat regardless of
depth).

- [ ] **Step 3: Implement sand color + depth-based water tint**

In `src/world/TerrainGeometryBuilder.ts`, add new exported constants right
after the existing `BIOME_FORD` constant:

```ts
/** Sand/beach biome tint — pale warm tan, distinct from grass/rock. */
export const BIOME_SAND: readonly [number, number, number] = [0.76, 0.68, 0.50];
/** Per-cell colour-look variants for sand, following the same 3-variant
 *  pattern as BIOME_VARIANTS (base, lighter/drier, darker/wetter near the
 *  waterline). */
export const BIOME_SAND_VARIANTS: readonly (readonly [number, number, number])[] =
  [[0.76, 0.68, 0.50], [0.80, 0.73, 0.56], [0.70, 0.62, 0.44]];

/** Water tiles carved shallower than this (world units) render with the
 *  lighter shallow-water tint; deeper tiles render with the existing
 *  darker BIOME_WATER tint. Sits at the midpoint between
 *  OCEAN_SHALLOW_DEPTH_WU and OCEAN_DEEP_DEPTH_WU (1.0 and 2.5) so the
 *  threshold tracks those constants' intent without importing them
 *  directly — this module stays a pure function of `cell.waterDepth`,
 *  matching physicalHeightWU()'s existing depth-value-agnostic design. */
export const SHALLOW_WATER_TINT_THRESHOLD_WU = 1.75;
/** Lighter, more turquoise tint for shallow (wading-depth) water. */
export const BIOME_WATER_SHALLOW: readonly [number, number, number] = [0.24, 0.46, 0.58];
```

Then update the biome/feature color-selection branch. Replace:

```ts
      const cell = wg.get(col, row);
      let biomeRgb: readonly [number, number, number];
      if (cell.biome === 'water') {
        biomeRgb = BIOME_WATER;
      } else if (cell.feature === 'river') {
```

with:

```ts
      const cell = wg.get(col, row);
      let biomeRgb: readonly [number, number, number];
      if (cell.biome === 'water') {
        biomeRgb = cell.waterDepth < SHALLOW_WATER_TINT_THRESHOLD_WU ? BIOME_WATER_SHALLOW : BIOME_WATER;
      } else if (cell.biome === 'sand') {
        const vi = cellVariantIndex(col, row, BIOME_SAND_VARIANTS.length);
        biomeRgb = BIOME_SAND_VARIANTS[vi]!;
      } else if (cell.feature === 'river') {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS (all tests in the file, including the two new ones and all
pre-existing ones — the pre-existing water-color test uses `waterDepth: 0`
implicitly via `WorldGrid`'s default, which is `< 1.75`, so it now
exercises the shallow branch; re-check that test's exact expected ratio
still holds since it currently asserts against `BIOME_WATER`'s ratio).

- [ ] **Step 5: Fix the pre-existing water-color tests if they now fail**

Two existing tests set `wg.set(0, 0, { biome: 'water' })` with no
explicit `waterDepth`, which defaults to `0` (dry ford-like value) —
under the new logic this renders as `BIOME_WATER_SHALLOW`, not
`BIOME_WATER`, so their ratio assertions will fail. Update both to
explicitly set a deep `waterDepth` so they keep testing the deep-water
branch they were written for.

First, `'colors water-biome tiles using the water palette'`:

```ts
  it('colors water-biome tiles using the water palette', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'water', waterDepth: OCEAN_DEEP_DEPTH_WU });

    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 1, 1);

    // Water tint uses BIOME_WATER = [0.14, 0.26, 0.48] with a brightness
    // variation factor `v` applied uniformly to r/g/b — check the ratio
    // between channels matches the water palette's ratio, which is
    // biome-specific and distinct from any BIOME[] land level.
    const [r, g, b] = [data.colors[0]!, data.colors[1]!, data.colors[2]!];
    expect(r / g).toBeCloseTo(0.14 / 0.26, 5);
    expect(g / b).toBeCloseTo(0.26 / 0.48, 5);
  });
```

Second, `'keeps water-biome tile color ratio unchanged by variant noise'`:

```ts
  it('keeps water-biome tile color ratio unchanged by variant noise', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'water', waterDepth: OCEAN_DEEP_DEPTH_WU });
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = [data.colors[0]!, data.colors[1]!, data.colors[2]!];
    expect(r / g).toBeCloseTo(0.14 / 0.26, 5);
    expect(g / b).toBeCloseTo(0.26 / 0.48, 5);
  });
```

Then re-run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS for the whole file.

- [ ] **Step 6: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "Render sand-biome tiles and tint shallow water lighter than deep water

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Fix the Y=0 safety-net floor that defeats carved water depth

**Files:**
- Modify: `src/scene/OverworldScene.ts:280`

**Interfaces:**
- Consumes: `OCEAN_DEEP_DEPTH_WU` (Task 2) — imported for the safety
  margin calculation, so the fix stays correct if that constant is ever
  retuned.
- Produces: no interface change — `enter()`'s behavior is fixed
  internally. Manual playtest (Task 9) is the verification for this task;
  it cannot be meaningfully unit-tested (it's a Rapier physics-timing bug,
  not a pure-function bug — see Global Constraints).

This is the root-cause fix identified during design (spec section A):
`OverworldScene.enter()` creates a flat safety-net floor at world Y=0
covering the entire map. Carved ocean floors sit below Y=0
(`physicalHeightWU()` ≈ -1.95 for a typical deep-ocean tile), so the
player's capsule lands on the Y=0 plane before ever reaching the real
carved floor, and the swim-enter depth threshold is never crossed.

- [ ] **Step 1: Add the import**

In `src/scene/OverworldScene.ts`, add `OCEAN_DEEP_DEPTH_WU` to the
existing `WaterDepthConfig` import:

```ts
import { LEVEL_HEIGHT } from '@/world/WaterDepthConfig';
```

becomes:

```ts
import { LEVEL_HEIGHT, OCEAN_DEEP_DEPTH_WU } from '@/world/WaterDepthConfig';
```

- [ ] **Step 2: Lower the safety-net floor below the deepest possible carved depth**

In `src/scene/OverworldScene.ts`, find (around line 280, inside `enter()`):

```ts
    // Flat base plane covers level-0 tiles and acts as the underfloor.
    this._groundBody = this.physics.createGroundPlane(0);
```

Replace with:

```ts
    // Underfloor safety net — catches the player if they ever fall through
    // a gap in the terrain trimesh. Must sit BELOW the deepest possible
    // carved water floor (physicalHeightWU() can reach roughly
    // -OCEAN_DEEP_DEPTH_WU for a deep-ocean tile at elevation 0), or this
    // "safety" plane silently becomes the real collision floor for every
    // carved water tile and swim mode can never trigger (see design spec
    // section A — this was the actual root cause of "the sea is too
    // shallow to swim in"). -5 WU of margin below the deepest carve is
    // comfortably clear of any real terrain.
    this._groundBody = this.physics.createGroundPlane(-(OCEAN_DEEP_DEPTH_WU + 5));
```

- [ ] **Step 3: Run the existing overworld smoke test to confirm no import/compile regressions**

Run: `npx vitest run tests/scene/overworld.startup.smoke.test.ts`
Expected: PASS (this test only checks the modules import without
throwing — it does not exercise physics, so it won't catch the actual
bug, but it will catch a broken import or syntax error immediately).

- [ ] **Step 4: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "Fix Y=0 safety-net floor masking carved ocean/river depth

The underfloor safety plane created in enter() sat at world Y=0, but
carved water floors (physicalHeightWU()) can go as low as roughly
-OCEAN_DEEP_DEPTH_WU. The player's capsule was landing on the shallow
safety net instead of the real carved floor, so depth-below-surface
never crossed the swim-enter threshold — this was the actual root cause
of the sea reading as walkable/shallow everywhere. Lowering the safety
net below the deepest possible carve fixes it without changing what the
plane is for (catching genuine out-of-bounds falls).

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: `ScatterRules.ts` — centralize water/sand/content exclusion logic

**Files:**
- Create: `src/world/ScatterRules.ts`
- Test: `tests/world/ScatterRules.test.ts`

**Interfaces:**
- Consumes: `WorldCell` (`@/world/WorldGrid`).
- Produces: `isScatterAllowed(cell: WorldCell, kind: ScatterKind): boolean`
  and the `ScatterKind` type (`'tree' | 'bush' | 'rock' | 'camp' |
  'ruin'`), exported for Task 7 to import and call from all five
  `OverworldScene` scatter methods, replacing their current ad-hoc,
  duplicated (and in three cases missing) exclusion checks.

- [ ] **Step 1: Write the failing tests**

Create `tests/world/ScatterRules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isScatterAllowed } from '@/world/ScatterRules';
import type { WorldCell } from '@/world/WorldGrid';

function makeCell(overrides: Partial<WorldCell> = {}): WorldCell {
  return {
    elevation: 2,
    biome: 'grass',
    feature: 'none',
    content: 'empty',
    dungeonId: 0,
    buildingId: 0,
    settlementId: 0,
    walkable: true,
    waterDepth: 0,
    ...overrides,
  };
}

describe('isScatterAllowed', () => {
  it('allows every scatter kind on a plain empty grass cell', () => {
    const cell = makeCell();
    for (const kind of ['tree', 'bush', 'rock', 'camp', 'ruin'] as const) {
      expect(isScatterAllowed(cell, kind)).toBe(true);
    }
  });

  it('disallows every scatter kind on a water-biome cell', () => {
    const cell = makeCell({ biome: 'water', waterDepth: 2.5 });
    for (const kind of ['tree', 'bush', 'rock', 'camp', 'ruin'] as const) {
      expect(isScatterAllowed(cell, kind)).toBe(false);
    }
  });

  it('disallows trees on a sand-biome cell but allows rocks and camps', () => {
    const cell = makeCell({ biome: 'sand' });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(true);
    expect(isScatterAllowed(cell, 'camp')).toBe(true);
    expect(isScatterAllowed(cell, 'ruin')).toBe(true);
  });

  it('disallows every scatter kind on a bog/low-elevation cell for trees and bushes only', () => {
    const cell = makeCell({ elevation: 0 });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    // Rocks/camps/ruins never had an elevation restriction — preserve that.
    expect(isScatterAllowed(cell, 'rock')).toBe(true);
    expect(isScatterAllowed(cell, 'camp')).toBe(true);
    expect(isScatterAllowed(cell, 'ruin')).toBe(true);
  });

  it('disallows every scatter kind on a road tile', () => {
    for (const feature of ['road', 'road_dirt'] as const) {
      const cell = makeCell({ feature });
      for (const kind of ['tree', 'bush', 'rock'] as const) {
        expect(isScatterAllowed(cell, kind)).toBe(false);
      }
    }
  });

  it('disallows tree/bush/rock on a non-empty content cell (building, entrance, etc.)', () => {
    const cell = makeCell({ content: 'building' });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(false);
  });

  it('disallows tree/bush/rock inside a settlement zone', () => {
    const cell = makeCell({ settlementId: 3 });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/ScatterRules.test.ts`
Expected: FAIL — `@/world/ScatterRules` doesn't exist yet.

- [ ] **Step 3: Implement `ScatterRules.ts`**

Create `src/world/ScatterRules.ts`:

```ts
/**
 * ScatterRules.ts — centralizes "is it OK to place a scatter object (tree,
 * bush, rock, enemy camp, ruin) on this cell?" logic.
 *
 * Before this module, each of OverworldScene's five scatter methods
 * (_plantTrees, _plantBushes, _placeRocks, _spawnCamps, _addRuins)
 * duplicated a slightly different subset of these checks ad-hoc.
 * _spawnCamps and _addRuins had NO water exclusion at all, meaning
 * enemies/ruins could land on open water. _plantTrees/_plantBushes used
 * an `elevation < 1` heuristic that doesn't reliably exclude the shallow
 * ocean band (it quantizes to elevation === 1, same as ordinary dry
 * land). This module is the single, testable source of truth instead.
 */
import type { WorldCell } from './WorldGrid';

export type ScatterKind = 'tree' | 'bush' | 'rock' | 'camp' | 'ruin';

/**
 * Returns whether a scatter object of the given kind may be placed on
 * `cell`. All kinds share the "never on water, never on a road, never on
 * a non-empty/occupied tile, never inside a settlement zone" rules; trees
 * and bushes additionally exclude sand (no trees/undergrowth on a beach —
 * see `_scatterBeachDecor` for what DOES go there) and low/bog elevation
 * (unchanged from the pre-existing behavior).
 */
export function isScatterAllowed(cell: WorldCell, kind: ScatterKind): boolean {
  if (cell.biome === 'water') return false;
  if (cell.settlementId > 0) return false;

  if (kind === 'tree' || kind === 'bush' || kind === 'rock') {
    if (cell.feature === 'road' || cell.feature === 'road_dirt') return false;
    if (cell.content !== 'empty') return false;
  }

  if (kind === 'tree' || kind === 'bush') {
    if (cell.biome === 'sand') return false;
    if (cell.elevation < 1) return false; // no trees/undergrowth on bog
  }

  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/ScatterRules.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/world/ScatterRules.ts tests/world/ScatterRules.test.ts
git commit -m "Add ScatterRules.ts to centralize tree/bush/rock/camp/ruin placement checks

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Wire `isScatterAllowed()` into all five `OverworldScene` scatter methods

**Files:**
- Modify: `src/scene/OverworldScene.ts` (`_plantTrees` ~line 1179,
  `_placeRocks` ~line 1334, `_plantBushes` ~line 1400, `_spawnCamps` ~line
  1474, `_addRuins` ~line 1558 — line numbers approximate, shift slightly
  after Task 5's edit)

**Interfaces:**
- Consumes: `isScatterAllowed()`, `ScatterKind` (Task 6).
- Produces: no new interface — internal behavior fix only. This closes
  the "trees/rocks/enemies spawn inside water" bug reports. Verified by
  manual playtest (Task 9) since `OverworldScene` itself has no direct
  unit test harness (see the existing smoke test's comment: "too
  heavyweight for unit tests" — needs real `PhysicsWorld` +
  `PlayerController` + `WorldGrid`). `ScatterRules.test.ts` (Task 6)
  already covers the actual decision logic in isolation; this task is
  pure call-site wiring.

- [ ] **Step 1: Add the import**

In `src/scene/OverworldScene.ts`, add near the other `@/world/*` imports
(alongside `import { getWaterInfoAt } from '@/world/WaterDetection';`):

```ts
import { isScatterAllowed } from '@/world/ScatterRules';
```

- [ ] **Step 2: Fix `_plantTrees()`**

Replace its single exclusion check:

```ts
      const cell = this._wg.get(c, r);
      if (cell.elevation < 1)           continue;   // no trees on bog/water
      if (cell.feature === 'road')      continue;   // no trees on roads
      if (cell.feature === 'road_dirt') continue;
      if (cell.content  !== 'empty')    continue;   // no trees on buildings/entrances
      if (cell.settlementId > 0)        continue;   // no trees inside settlement zones
```

with:

```ts
      const cell = this._wg.get(c, r);
      if (!isScatterAllowed(cell, 'tree')) continue;
```

- [ ] **Step 3: Fix `_placeRocks()`**

Replace:

```ts
      const cell = this._wg.get(c, r);
      if (cell.feature === 'road')      continue;   // no rocks on roads
      if (cell.feature === 'road_dirt') continue;
      if (cell.content  !== 'empty')    continue;   // no rocks on buildings
      if (cell.settlementId > 0)        continue;   // no rocks inside settlement zones
```

with:

```ts
      const cell = this._wg.get(c, r);
      if (!isScatterAllowed(cell, 'rock')) continue;
```

- [ ] **Step 4: Fix `_plantBushes()`**

Replace:

```ts
      const cell = this._wg.get(c, r);
      if (cell.elevation < 1)           continue;   // no bushes on bog/water
      if (cell.feature === 'road')      continue;
      if (cell.feature === 'road_dirt') continue;
      if (cell.content  !== 'empty')    continue;
      if (cell.settlementId > 0)        continue;
```

with:

```ts
      const cell = this._wg.get(c, r);
      if (!isScatterAllowed(cell, 'bush')) continue;
```

- [ ] **Step 5: Fix `_spawnCamps()`**

Inside the per-enemy loop, replace:

```ts
        const c = Math.floor(ex / T + GHW);
        const r = Math.floor(ez / T + GHH);
        const level = this._wg.get(c, r).elevation;

        this._enemies.push(new SlimeEnemy(
```

with:

```ts
        const c = Math.floor(ex / T + GHW);
        const r = Math.floor(ez / T + GHH);
        const cell = this._wg.get(c, r);
        if (!isScatterAllowed(cell, 'camp')) continue;
        const level = cell.elevation;

        this._enemies.push(new SlimeEnemy(
```

- [ ] **Step 6: Fix `_addRuins()`**

Replace:

```ts
      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const level = this._wg.get(c, r).elevation;
      const wy = level * SH;
```

with:

```ts
      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const cell = this._wg.get(c, r);
      if (!isScatterAllowed(cell, 'ruin')) continue;
      const level = cell.elevation;
      const wy = level * SH;
```

- [ ] **Step 7: Run the overworld smoke test to confirm no compile regressions**

Run: `npx vitest run tests/scene/overworld.startup.smoke.test.ts`
Expected: PASS.

- [ ] **Step 8: Run the ScatterRules test again (unchanged, sanity check)**

Run: `npx vitest run tests/world/ScatterRules.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "Use ScatterRules.isScatterAllowed() in all 5 scatter methods

_placeRocks, _spawnCamps, and _addRuins had zero water exclusion checks
(rocks/enemies/ruins could spawn on open water). _plantTrees/_plantBushes
had an elevation<1 heuristic that didn't reliably exclude the shallow
ocean band. All five now share one tested rule set.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Beach decor — driftwood, dune-grass tufts, beach pebbles

**Files:**
- Modify: `src/scene/OverworldScene.ts`

**Interfaces:**
- Consumes: `this._wg` (`WorldGrid`), `isScatterAllowed` is NOT used here
  — beach decor's placement rule is simply `cell.biome === 'sand'`, a
  positive allow-list rather than an exclusion list, so it doesn't belong
  in `ScatterRules.ts` (which answers "is X excluded from this cell",
  not "does X belong here").
- Produces: a new private method `_scatterBeachDecor(rand: () => number):
  void`, called once from the constructor; pushes THREE.js groups into
  the existing `this._clutter: THREE.Object3D[]` array (same array bushes
  use — no physics collider, purely visual, matching bushes' existing
  treatment).

- [ ] **Step 1: Add the constructor call**

In `src/scene/OverworldScene.ts`'s constructor, add the call right after
`_plantBushes`:

```ts
    console.log('[OverworldScene] _plantBushes...');
    this._plantBushes(rand);
    console.log('[OverworldScene] _scatterBeachDecor...');
    this._scatterBeachDecor(rand);
    console.log('[OverworldScene] _spawnCamps...');
```

- [ ] **Step 2: Implement `_scatterBeachDecor()` and its 3 prop builders**

Add this new method right after `_makeBush()` (end of the bush section,
before the `// ── Phase 7h.2 — InstancedMesh sync` comment):

```ts
  // ── Beach decor (sand-only ground clutter — no physics collider) ──────────

  private _scatterBeachDecor(rand: () => number): void {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    const W = GW * T;
    const H = GH * T;
    // Denser than bushes (3.2) since beach strips are typically narrow —
    // a wider spacing would mean most candidate points land off the sand.
    const pts = poissonDisk(W, H, 2.4, rand);

    for (const [px, pz] of pts) {
      const wx = px - W / 2;
      const wz = pz - H / 2;

      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const cell = this._wg.get(c, r);
      if (cell.biome !== 'sand') continue;
      if (cell.feature === 'road' || cell.feature === 'road_dirt') continue;
      if (cell.content !== 'empty') continue;
      if (cell.settlementId > 0) continue;

      const level = cell.elevation;
      const roll = rand();
      const decor = roll < 0.34 ? this._makeDriftwood(rand)
                  : roll < 0.67 ? this._makeDuneGrassTuft(rand)
                  : this._makeBeachPebbles(rand);
      decor.position.set(wx, level * SH, wz);
      decor.rotation.y = rand() * Math.PI * 2;
      this._clutter.push(decor);
    }
  }

  private _makeDriftwood(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    const len = 1.1 + rand() * 0.9;
    const r0 = 0.06 + rand() * 0.03;
    const grey = 0x6a5a48 + Math.floor(rand() * 4) * 0x040302;
    const mat = new THREE.MeshLambertMaterial({
      color: grey,
      map: makeMottledCanvasTexture(grey, 0.16, Math.floor(rand() * 1e6)),
    });
    const log = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.8, r0, len, 6), mat);
    log.rotation.z = Math.PI / 2; // lying flat
    log.rotation.y = rand() * Math.PI;
    log.position.y = r0;
    g.add(log);
    return g;
  }

  private _makeDuneGrassTuft(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    const tan = 0x9a9660 + Math.floor(rand() * 4) * 0x030200;
    const mat = new THREE.MeshLambertMaterial({
      color: tan,
      map: makeMottledCanvasTexture(tan, 0.22, Math.floor(rand() * 1e6)),
    });
    const bladeCount = 3 + Math.floor(rand() * 3); // 3..5 blades
    for (let i = 0; i < bladeCount; i++) {
      const h = 0.35 + rand() * 0.3;
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, h, 4), mat);
      const angle = (i / bladeCount) * Math.PI * 2 + rand() * 0.4;
      const spread = 0.05 + rand() * 0.06;
      blade.position.set(Math.cos(angle) * spread, h / 2, Math.sin(angle) * spread);
      blade.rotation.z = (rand() - 0.5) * 0.3;
      g.add(blade);
    }
    return g;
  }

  private _makeBeachPebbles(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    const pale = 0x8a8478 + Math.floor(rand() * 5) * 0x020202;
    const mat = new THREE.MeshLambertMaterial({
      color: pale,
      map: makeMottledCanvasTexture(pale, 0.10, Math.floor(rand() * 1e6)),
    });
    const pieceCount = 2 + Math.floor(rand() * 3); // 2..4 pebbles
    for (let i = 0; i < pieceCount; i++) {
      const pr = 0.08 + rand() * 0.1;
      const piece = new THREE.Mesh(new THREE.DodecahedronGeometry(pr, 0), mat);
      const angle = rand() * Math.PI * 2;
      const spread = rand() * 0.18;
      piece.position.set(Math.cos(angle) * spread, pr * 0.5, Math.sin(angle) * spread);
      piece.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      piece.scale.set(1, 0.5 + rand() * 0.3, 0.8 + rand() * 0.3);
      g.add(piece);
    }
    return g;
  }
```

- [ ] **Step 3: Run the overworld smoke test to confirm no compile regressions**

Run: `npx vitest run tests/scene/overworld.startup.smoke.test.ts`
Expected: PASS.

- [ ] **Step 4: Run the full test suite once as an early regression check**

Run: `npx vitest run`
Expected: PASS across the whole suite (this is a lighter check than
Task 10's final full run, but catching a break here — e.g. a
`WorldGenerator.test.ts` assumption about biome counts — is cheaper than
finding it at the very end).

- [ ] **Step 5: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "Add procedural beach decor: driftwood, dune-grass tufts, pebbles

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Manual playtest verification (required — no unverified completion claims)

**Files:** none (verification only, using the existing `window.__game`
debug hooks in `src/main.ts`, same workflow as RI-3's verification).

- [ ] **Step 1: Start a local dev server**

```bash
npx vite --port 5199
```

If 5199 is in use, note whatever port Vite actually binds to.

- [ ] **Step 2: Load the game and locate a deep-ocean tile**

Using Playwright (or the browser directly) against
`http://localhost:<port>/`, run in the page console (or via
`page.evaluate`):

```js
await window.__game.startGame(1234);
window.__game.switchToExterior();
window.__game.forceTick(10);
const deep = window.__game.findWaterTile?.() ?? null;
console.log(deep);
```

If `findWaterTile()` doesn't expose depth, use `debugCellAt(col, row)`
across a scan near the map edge (ocean is at the world's rim) to find a
cell with `waterDepth` equal to the new `OCEAN_DEEP_DEPTH_WU` (2.5) —
confirm via `console.log` of the constant if needed.

- [ ] **Step 3: Confirm deep ocean now triggers real swim**

Teleport the player to the deep-ocean tile's center (grid cell center,
not corner — see the prior session's coordinate-convention note if this
matters for the debug hook you're using) and run `forceTick()`
repeatedly:

```js
window.__game.teleportPlayer(wx, 5, wz);
for (let i = 0; i < 30; i++) { window.__game.forceTick(1); }
console.log(window.__game.getPlayerPos(), window.__game.isPlayerSwimming());
```

Expected: the player's Y stabilizes near the carved floor / buoyant depth
(not clamped at Y≈0 or Y≈1.4 like before the Task 5 fix), and
`isPlayerSwimming()` becomes `true`.

- [ ] **Step 4: Confirm the shallow ocean band is wade-only, not swimmable**

Find/teleport to a shallow-band (`waterDepth === OCEAN_SHALLOW_DEPTH_WU`,
i.e. 1.0) ocean tile the same way. Expected: the player can stand/walk
(cosmetic submersion via `setSubmersion`, visibly wet) but
`isPlayerSwimming()` stays `false`.

- [ ] **Step 5: Confirm rivers still swim correctly (RI-3 regression check)**

Repeat the deep-ocean check against a river tile
(`findFordTile`/`debugCellAt` scanning for `feature === 'river'`).
Expected: unchanged from RI-3 — real swim transition still triggers.

- [ ] **Step 6: Visually confirm sand appears and props avoid water**

Walk the player around a coastline visually (via screenshot or manual
observation in a headed browser) and confirm: a distinct tan sand strip
between grass and water; no trees/rocks/slime camps visibly standing in
open water; beach decor (driftwood/tufts/pebbles) visible on the sand
strip.

- [ ] **Step 7: If depth constants feel off, tune and re-verify**

If shallow water still swims, or deep water still doesn't, adjust
`OCEAN_SHALLOW_DEPTH_WU`/`OCEAN_DEEP_DEPTH_WU` in
`src/world/WaterDepthConfig.ts`, re-run the existing unit tests
(`npx vitest run tests/world/WaterDepthConfig.test.ts
tests/world/RealmToWorldGrid.test.ts`), and repeat Steps 3-4 until the
feel is right. Commit any constant changes:

```bash
git add src/world/WaterDepthConfig.ts
git commit -m "Tune ocean shallow/deep depth constants after playtest

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 8: Clean up**

Stop the dev server. Delete any scratch/diagnostic scripts created during
this verification pass that aren't meant to be permanent (do not leave
temporary `.mjs` files under `tests/e2e/` uncommitted-but-present).

---

### Task 10: Full test suite run (regression check)

**Files:** none.

- [ ] **Step 1: Run the entire test suite**

```bash
npx vitest run
```

Expected: all tests pass. Pay particular attention to any suite touching
`DungeonPlacer`, `SettlementPlacer`, `RoadGenerator`, `WorldGenerator`, or
`OWMinimap` — all consume `BiomeId`/`WorldCell` and could be sensitive to
the new `'sand'` value or the changed `beach`→`sand` mapping (previously
`beach`→`grass`).

- [ ] **Step 2: If any test fails, fix forward**

If a consumer test asserts something like "beach areas count as grass" or
enumerates `BiomeId` values explicitly, update it to include `'sand'` —
do not revert the `'sand'` biome to fix a stale assertion; the assertion
was encoding the old (identity-losing) behavior this plan intentionally
changes.

- [ ] **Step 3: Confirm the working tree is clean and all commits are in place**

```bash
git status --short
git log --oneline -12
```

Expected: no uncommitted changes; the log shows this plan's ~9 commits
(Tasks 1-8 plus any Task 9 tuning commit) on top of the prior RI-3 work.
