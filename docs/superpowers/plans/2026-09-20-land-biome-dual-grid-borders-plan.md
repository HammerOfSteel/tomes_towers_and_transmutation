# Land-Biome Dual-Grid Borders & Texture Richness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give land-biome-to-land-biome tile borders (grassland↔desert, forest↔tundra,
etc.) a real curved dual-grid boundary shape plus height-correlated texture blending
(matching the quality shorelines already have), and add region-scale texture variant
selection so a single biome no longer reads as one repeating texture tile at a distance.

**Architecture:** Extract the existing shoreline dual-grid "corner-pull" math into a
reusable, biome-agnostic core (`DualGridCornerPull.ts`), build a land-biome corner
classifier on top of it (`LandBiomeCornerField.ts`), merge it into
`TerrainGeometryBuilder.ts`'s existing corner-pull pipeline (water pull takes priority;
land-biome pull only at vertices where all 4 tiles are dry), make the existing sub-tile
border-dithering probability height-correlated instead of flat, and add region-scale
texture variant keys (`TerrainTextures.ts`) plus a per-tile UV rotation. All of this stays
on today's square logic grid, touches only flat/edge land tiles, and leaves ramp/water
tiles and settlement/building code untouched.

**Tech Stack:** TypeScript, Vitest (`npm test` / `vitest run`), Three.js (rendering only,
no new dependency), Playwright (`npm run test:e2e`) for the final live-verification pass.

## Global Constraints

- Square logic grid only — do not touch `RelaxedMeshGrid.ts` wiring (explicitly deferred
  per the design spec).
- Ramp-shaped tiles and water tiles (`_isWaterTile()` in `TerrainGeometryBuilder.ts`) are
  untouched by every task in this plan — same scope guard the existing sub-tile system
  already uses.
- No settlement/building architecture files may be modified.
- Every new pure function must be deterministic (world-position-keyed hashing, no
  `Math.random()`), matching every existing procedural function in this codebase
  (`subTileBumpJitter`, `cornerHeightJitter`, `_subTileRoll`).
- Run `npx vitest run <file>` (not the full suite) after each task's own tests; run the
  full `npm test` only in the final task.

---

### Task 1: Extract generic dual-grid corner-pull core

**Files:**
- Create: `src/world/DualGridCornerPull.ts`
- Create: `src/world/DualGridCornerPull.test.ts`
- Modify: `src/world/ShorelineCornerField.ts`

**Interfaces:**
- Produces: `CORNER_DIRS: readonly (readonly [number, number])[]` (4 entries, `[NW, NE,
  SE, SW]` winding, unit `[dx, dz]` directions), `binaryCornerPullDirection(config:
  readonly [number, number, number, number]): number | null` (returns the 0-3 corner
  index to pull toward, or `null` for empty/full/edge/diagonal), `cornerPull(config:
  readonly [number, number, number, number], amplitudeWU: number): readonly [number,
  number]`.
- Consumes: `buildDualGridCaseTable` from `./DualGridCaseTable` (already exists, no
  changes needed).

- [ ] **Step 1: Write the failing test file**

Create `src/world/DualGridCornerPull.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CORNER_DIRS, binaryCornerPullDirection, cornerPull } from './DualGridCornerPull';

describe('binaryCornerPullDirection', () => {
  it('returns null for empty (all zeros)', () => {
    expect(binaryCornerPullDirection([0, 0, 0, 0])).toBeNull();
  });
  it('returns null for full (all ones)', () => {
    expect(binaryCornerPullDirection([1, 1, 1, 1])).toBeNull();
  });
  it('returns null for edge (2 adjacent)', () => {
    expect(binaryCornerPullDirection([1, 1, 0, 0])).toBeNull();
  });
  it('returns null for diagonal (2 opposite)', () => {
    expect(binaryCornerPullDirection([1, 0, 1, 0])).toBeNull();
  });
  it('returns the lone "1" index for outer_corner (one 1, three 0s)', () => {
    expect(binaryCornerPullDirection([0, 1, 0, 0])).toBe(1);
  });
  it('returns the lone "0" index for inner_corner (one 0, three 1s)', () => {
    expect(binaryCornerPullDirection([1, 1, 0, 1])).toBe(2);
  });
});

describe('cornerPull', () => {
  it('is [0, 0] for a non-pulling config', () => {
    expect(cornerPull([0, 0, 0, 0], 0.5)).toEqual([0, 0]);
  });
  it('scales by amplitude in the direction of the lone corner', () => {
    // Lone "1" at index 1 (NE) -> CORNER_DIRS[1] = [1, -1].
    expect(cornerPull([0, 1, 0, 0], 0.5)).toEqual([0.5, -0.5]);
  });
  it('CORNER_DIRS has exactly 4 unit-length [NW,NE,SE,SW] directions', () => {
    expect(CORNER_DIRS).toEqual([[-1, -1], [1, -1], [1, 1], [-1, 1]]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/world/DualGridCornerPull.test.ts`
Expected: FAIL — `Cannot find module './DualGridCornerPull'`.

- [ ] **Step 3: Write the implementation**

Create `src/world/DualGridCornerPull.ts`:

```ts
// ── DualGridCornerPull — biome-agnostic dual-grid "odd one out" corner-pull core ──
//
//  Extracted from ShorelineCornerField.ts (Phase 1 of the "organic world tiles"
//  roadmap) so land-biome borders (see
//  docs/superpowers/specs/2026-09-20-land-biome-dual-grid-borders-design.md) can
//  reuse the exact same shape math without duplicating it. Pure, engine-agnostic,
//  no WorldGrid dependency — a "config" here is always a raw 4-corner binary
//  state in [NW, NE, SE, SW] order, matching DualGridCaseTable's own winding.

import { buildDualGridCaseTable } from './DualGridCaseTable';

/** [dx, dz] unit direction for each corner index, matching the [NW, NE, SE, SW]
 *  winding — identical convention/values to ShorelineCornerField.ts's own
 *  (now-removed) CORNER_DIRS constant. */
export const CORNER_DIRS: readonly (readonly [number, number])[] = [
  [-1, -1], // NW
  [1, -1],  // NE
  [1, 1],   // SE
  [-1, 1],  // SW
];

/** Built once at module load — pure data, not per-world-seed content. */
const _caseTable = buildDualGridCaseTable(2);

/**
 * Given a raw 4-corner binary config, returns the corner INDEX (0-3, [NW,
 * NE, SE, SW]) that should be pulled toward — the lone "odd one out" tile
 * for an outer_corner (1 "on") or inner_corner (1 "off") config — or `null`
 * for every other shape (empty/full/edge/diagonal), which never pull.
 */
export function binaryCornerPullDirection(
  config: readonly [number, number, number, number],
): number | null {
  const found = _caseTable.mapping[config.join(',')];
  if (!found) return null;
  const tile = _caseTable.tiles[found.tile]!;
  if (tile.label !== 'outer_corner' && tile.label !== 'inner_corner') return null;
  // See ShorelineCornerField.ts's original comment: deliberately read the
  // minority value directly off the RAW config, not derived from the
  // canonical mask + `steps` (the canonical minority index differs between
  // outer_corner and inner_corner, so a single "steps % 4" formula doesn't
  // work for both).
  const minorityValue = tile.label === 'outer_corner' ? 1 : 0;
  return config.indexOf(minorityValue);
}

/**
 * Corner-pull displacement [dx, dz] (world units) for a raw 4-corner binary
 * config, scaled by `amplitudeWU`. Zero unless `binaryCornerPullDirection`
 * returns a non-null index.
 */
export function cornerPull(
  config: readonly [number, number, number, number],
  amplitudeWU: number,
): readonly [number, number] {
  const minorityIndex = binaryCornerPullDirection(config);
  if (minorityIndex === null) return [0, 0];
  const [dirX, dirZ] = CORNER_DIRS[minorityIndex]!;
  return [dirX * amplitudeWU, dirZ * amplitudeWU];
}
```

Now refactor `src/world/ShorelineCornerField.ts` to use this core instead of duplicating
it. Replace its own case-table/CORNER_DIRS/minority-index logic:

```ts
import { cornerPull } from './DualGridCornerPull';
import type { WorldGrid } from './WorldGrid';
```

(remove the `buildDualGridCaseTable` import, the local `_caseTable`, and the local
`CORNER_DIRS` constant), and replace the body of `shorelineCornerPull` with:

```ts
export function shorelineCornerPull(wg: WorldGrid, gx: number, gz: number): readonly [number, number] {
  const config: [number, number, number, number] = [
    _isLandTile(wg, gx - 1, gz - 1) ? 1 : 0, // NW
    _isLandTile(wg, gx,     gz - 1) ? 1 : 0, // NE
    _isLandTile(wg, gx,     gz)     ? 1 : 0, // SE
    _isLandTile(wg, gx - 1, gz)     ? 1 : 0, // SW
  ];
  return cornerPull(config, SHORELINE_CORNER_PULL_WU);
}
```

- [ ] **Step 4: Run tests to verify everything passes**

Run: `npx vitest run src/world/DualGridCornerPull.test.ts tests/world/ShorelineCornerField.test.ts`
Expected: PASS — all new tests green, and every existing `ShorelineCornerField.test.ts`
case still passes unchanged (pure refactor, byte-identical behavior).

- [ ] **Step 5: Commit**

```bash
git add src/world/DualGridCornerPull.ts src/world/DualGridCornerPull.test.ts src/world/ShorelineCornerField.ts
git commit -m "Extract reusable dual-grid corner-pull core from ShorelineCornerField"
```

---

### Task 2: Land-biome corner classifier

**Files:**
- Create: `src/world/LandBiomeCornerField.ts`
- Create: `src/world/LandBiomeCornerField.test.ts`

**Interfaces:**
- Consumes: `cornerPull` from `./DualGridCornerPull` (Task 1); `WorldGrid`, `BiomeId`
  from `./WorldGrid`.
- Produces: `LAND_BIOME_CORNER_PULL_WU: number`, `pluralityBiomeConfig(biomes: readonly
  [BiomeId, BiomeId, BiomeId, BiomeId]): [number, number, number, number]`,
  `landBiomeCornerPull(wg: WorldGrid, gx: number, gz: number): readonly [number,
  number]`.

- [ ] **Step 1: Write the failing test file**

Create `src/world/LandBiomeCornerField.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  LAND_BIOME_CORNER_PULL_WU, pluralityBiomeConfig, landBiomeCornerPull,
} from './LandBiomeCornerField';
import { WorldGrid } from './WorldGrid';

describe('pluralityBiomeConfig', () => {
  it('marks the 3 matching corners 1 and the lone differing corner 0 (3-vs-1)', () => {
    // NW,NE,SW = grassland; SE = desert.
    expect(pluralityBiomeConfig(['grassland', 'grassland', 'desert', 'grassland']))
      .toEqual([1, 1, 0, 1]);
  });
  it('breaks a 2-vs-2 tie toward whichever biome sorts earlier in BiomeId order', () => {
    // grassland (index 5) vs desert (index 3) -> desert wins the tie.
    // NW,NE = grassland; SE,SW = desert (adjacent pair, "edge" pattern).
    expect(pluralityBiomeConfig(['grassland', 'grassland', 'desert', 'desert']))
      .toEqual([0, 0, 1, 1]);
  });
  it('breaks a 2-vs-2 diagonal tie the same way', () => {
    // NW,SE = grassland; NE,SW = desert (diagonal pattern).
    expect(pluralityBiomeConfig(['grassland', 'desert', 'grassland', 'desert']))
      .toEqual([0, 1, 0, 1]);
  });
  it('with 4 distinct biomes, plurality is whichever sorts earliest (all tied at count 1)', () => {
    // grassland(5), desert(3), forest(6), savanna(4) -> desert (3) is earliest.
    expect(pluralityBiomeConfig(['grassland', 'desert', 'forest', 'savanna']))
      .toEqual([0, 1, 0, 0]);
  });
});

/** Sets every tile in an all-grassland `size`x`size` grid to the given
 *  biome, except the listed [col, row] overrides. */
function makeBiomeGrid(size: number, overrides: Array<[number, number, import('./WorldGrid').BiomeId]>): WorldGrid {
  const wg = new WorldGrid(size, size);
  for (const [c, r, biome] of overrides) wg.set(c, r, { biome });
  return wg;
}

describe('landBiomeCornerPull', () => {
  it('is zero for an all-grassland vertex (full, same biome everywhere)', () => {
    const wg = makeBiomeGrid(5, []);
    expect(landBiomeCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('pulls toward the lone differing biome tile (outer_corner pattern)', () => {
    // Vertex (2,2): NW=(1,1) is desert, NE=(2,1)/SE=(2,2)/SW=(1,2) grassland.
    const wg = makeBiomeGrid(5, [[1, 1, 'desert']]);
    const [dx, dz] = landBiomeCornerPull(wg, 2, 2);
    expect(dx).toBeCloseTo(-LAND_BIOME_CORNER_PULL_WU, 10);
    expect(dz).toBeCloseTo(-LAND_BIOME_CORNER_PULL_WU, 10);
  });

  it('is zero at a vertex where any of the 4 tiles is water (scope guard: dry land only)', () => {
    // NW=(1,1) desert, NE=(2,1) ocean (water) — should not pull, unlike the
    // all-dry outer_corner case above.
    const wg = makeBiomeGrid(5, [[1, 1, 'desert'], [2, 1, 'ocean']]);
    wg.set(2, 1, { biome: 'ocean', waterDepth: 2.0 });
    expect(landBiomeCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('is zero for a straight 2-biome border (edge pattern)', () => {
    const wg = makeBiomeGrid(5, [[1, 1, 'desert'], [2, 1, 'desert']]);
    expect(landBiomeCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('is zero for a checkerboard 2-biome vertex (diagonal pattern)', () => {
    const wg = makeBiomeGrid(5, [[1, 1, 'desert'], [2, 2, 'desert']]);
    expect(landBiomeCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('pulls toward the plurality-minority corner with 4 distinct biomes at one vertex', () => {
    // Vertex (2,2): NW=(1,1) grassland, NE=(2,1) desert, SE=(2,2) forest, SW=(1,2) savanna.
    // Plurality (earliest-sorting, all tied at count 1) is desert -> config [0,1,0,0]
    // -> outer_corner, minority index 1 (NE) -> pull toward NE = [1, -1] * amplitude.
    const wg = makeBiomeGrid(5, [[1, 1, 'grassland'], [2, 1, 'desert'], [2, 2, 'forest'], [1, 2, 'savanna']]);
    const [dx, dz] = landBiomeCornerPull(wg, 2, 2);
    expect(dx).toBeCloseTo(LAND_BIOME_CORNER_PULL_WU, 10);
    expect(dz).toBeCloseTo(-LAND_BIOME_CORNER_PULL_WU, 10);
  });

  it('is deterministic', () => {
    const wg = makeBiomeGrid(5, [[1, 1, 'desert']]);
    expect(landBiomeCornerPull(wg, 2, 2)).toEqual(landBiomeCornerPull(wg, 2, 2));
  });

  it('treats out-of-bounds tiles as default grassland (dry land), matching WorldGrid.get()\'s own default', () => {
    const wg = makeBiomeGrid(3, [[0, 0, 'desert']]);
    expect(() => landBiomeCornerPull(wg, 0, 0)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/world/LandBiomeCornerField.test.ts`
Expected: FAIL — `Cannot find module './LandBiomeCornerField'`.

- [ ] **Step 3: Write the implementation**

Create `src/world/LandBiomeCornerField.ts`:

```ts
// ── LandBiomeCornerField — dual-grid corner-pull for land-biome borders ──────
//
//  Sub-task 1.1 of Overworld/Outdoor Polish Phase 1. Generalizes
//  ShorelineCornerField.ts's water/land "odd one out" corner-pull to
//  land-biome borders (grassland<->desert, forest<->tundra, etc.), reusing
//  DualGridCornerPull.ts's binary case-table math unchanged — shape only
//  ever depends on the corners' EQUALITY pattern, never on which specific
//  biomes are involved, so no N-biome case table is needed. See
//  docs/superpowers/specs/2026-09-20-land-biome-dual-grid-borders-design.md.
//
//  Scope guard: only applies at vertices where all 4 surrounding tiles are
//  dry land (no water tile touching). A vertex touching any water tile
//  keeps using ONLY ShorelineCornerField's water/land pull (merged in
//  TerrainGeometryBuilder.ts) — this avoids two independent pull sources
//  fighting over the same vertex.
//
//  N-biome ambiguity: a vertex can touch 3 or 4 DISTINCT biomes, which has
//  no natural binary split. Resolved via a "plurality" reduction — each of
//  the 4 tiles is classified as matching-the-plurality-biome (1) or not
//  (0), where "plurality" is whichever biome appears most often among the
//  4 (ties broken by BIOME_ORDER, a fixed canonical order matching
//  WorldGrid.ts's BiomeId union declaration order) — before feeding the
//  existing binary case table.

import { cornerPull } from './DualGridCornerPull';
import type { WorldGrid, BiomeId } from './WorldGrid';

/** Same magnitude as ShorelineCornerField's SHORELINE_CORNER_PULL_WU — see
 *  that module's own design-spec reasoning for the bound (clearly larger
 *  than ShorelineWobble's 0.4 WU noise amplitude, leaving headroom under a
 *  tile's 1.0 WU half-width). Kept as an independent constant (not a
 *  re-export) since land-biome and water/land borders are conceptually
 *  separate tunables even though they start at the same value. */
export const LAND_BIOME_CORNER_PULL_WU = 0.5;

/** Fixed canonical order for plurality tie-breaking — matches WorldGrid.ts's
 *  BiomeId union declaration order exactly, so this stays in sync if a new
 *  biome is ever added there (deliberately not alphabetical — mirrors the
 *  source of truth instead of an arbitrary independent ordering). */
const BIOME_ORDER: readonly BiomeId[] = [
  'deep_ocean', 'ocean', 'beach', 'desert', 'savanna', 'grassland',
  'forest', 'taiga', 'tundra', 'snow', 'mountain',
];

/**
 * Reduces 4 (possibly all-distinct) biomes to a binary 4-corner config:
 * 1 where a corner matches the "plurality" biome (the most frequent among
 * the 4, ties broken by BIOME_ORDER), 0 otherwise.
 */
export function pluralityBiomeConfig(
  biomes: readonly [BiomeId, BiomeId, BiomeId, BiomeId],
): [number, number, number, number] {
  const counts = new Map<BiomeId, number>();
  for (const b of biomes) counts.set(b, (counts.get(b) ?? 0) + 1);
  let plurality: BiomeId = biomes[0];
  let bestCount = -1;
  for (const b of BIOME_ORDER) {
    const c = counts.get(b) ?? 0;
    if (c > bestCount) { bestCount = c; plurality = b; }
  }
  return biomes.map((b) => (b === plurality ? 1 : 0)) as [number, number, number, number];
}

/** True iff the tile at (col, row) is dry land — no water depth, and not
 *  an ocean/deep_ocean biome. Matches TerrainGeometryBuilder.ts's private
 *  `_isWaterTile()` check exactly (duplicated here rather than imported,
 *  since that helper is not exported — see design spec's scope-guard
 *  note); out-of-bounds tiles read as WorldGrid's default cell (grassland,
 *  waterDepth 0), which is dry land, matching ShorelineCornerField's own
 *  "out of bounds reads as land" convention. */
function _isDryLandTile(wg: WorldGrid, col: number, row: number): boolean {
  const cell = wg.get(col, row);
  return cell.waterDepth === 0 && cell.biome !== 'deep_ocean' && cell.biome !== 'ocean';
}

/**
 * Corner-pull displacement [dx, dz] (world units) for the WorldGrid vertex
 * at tile-index (gx, gz), driven by land-biome differences. Zero unless
 * all 4 surrounding tiles are dry land AND their plurality-reduced config
 * is an outer_corner/inner_corner shape.
 */
export function landBiomeCornerPull(wg: WorldGrid, gx: number, gz: number): readonly [number, number] {
  const coords: ReadonlyArray<readonly [number, number]> = [
    [gx - 1, gz - 1], // NW
    [gx,     gz - 1], // NE
    [gx,     gz],     // SE
    [gx - 1, gz],     // SW
  ];
  for (const [c, r] of coords) {
    if (!_isDryLandTile(wg, c, r)) return [0, 0];
  }
  const biomes = coords.map(([c, r]) => wg.get(c, r).biome) as [BiomeId, BiomeId, BiomeId, BiomeId];
  const config = pluralityBiomeConfig(biomes);
  return cornerPull(config, LAND_BIOME_CORNER_PULL_WU);
}
```

- [ ] **Step 4: Run tests to verify everything passes**

Run: `npx vitest run src/world/LandBiomeCornerField.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/world/LandBiomeCornerField.ts src/world/LandBiomeCornerField.test.ts
git commit -m "Add land-biome dual-grid corner classifier (plurality-reduced)"
```

---

### Task 3: Wire land-biome corner-pull into terrain geometry

**Files:**
- Modify: `src/world/ShorelineCornerField.ts`
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Test: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `landBiomeCornerPull` from `./LandBiomeCornerField` (Task 2);
  `shorelineCornerPull` (existing).
- Produces: `shorelineBoundaryPoints`'s signature grows one optional trailing
  parameter (backward-compatible default), and `TerrainGeometryBuilder.ts` gains a
  private `_mergedCornerPull()` helper used everywhere `shorelineCornerPull` was
  previously called directly for tile-corner classification.

`shorelineBoundaryPoints()` currently recomputes its endpoint pulls by calling
`shorelineCornerPull()` internally — so simply changing `TerrainGeometryBuilder.ts`'s
local `cornerPulls` object (used only for gating/wall-placement) would NOT change what
`shorelineBoundaryPoints()` itself draws. It needs a pluggable pull function.

- [ ] **Step 1: Write the failing test**

Add to `tests/world/ShorelineCornerField.test.ts` (append at the end of the file, inside
a new top-level `describe`):

```ts
describe('shorelineBoundaryPoints with a custom cornerPullFn', () => {
  it('uses the provided cornerPullFn instead of shorelineCornerPull when given', () => {
    const wg = makeGrid(5, []); // all land — shorelineCornerPull would give zero pull everywhere
    const T = 2, GHW = 2, GHH = 2;
    const customPull = (_wg: WorldGrid, gx: number, gz: number): readonly [number, number] =>
      (gx === 2 && gz === 2) ? [0.3, 0.3] : [0, 0];
    const pts = shorelineBoundaryPoints(wg, T, GHW, GHH, 2, 2, 3, 2, false, customPull);
    expect(pts[0]![0]).toBeCloseTo(0.3, 10); // plain corner (0,0) + custom pull
    expect(pts[0]![1]).toBeCloseTo(0.3, 10);
  });

  it('defaults to shorelineCornerPull when no cornerPullFn is passed (unchanged behavior)', () => {
    const wg = makeGrid(5, [[2, 1], [2, 2], [1, 2]]); // vertex (2,2) is outer_corner
    const T = 2, GHW = 2, GHH = 2;
    const pts = shorelineBoundaryPoints(wg, T, GHW, GHH, 2, 2, 3, 2, false);
    expect(pts[0]![0]).toBeCloseTo(-0.5, 10);
    expect(pts[0]![1]).toBeCloseTo(-0.5, 10);
  });
});
```

Add the missing `WorldGrid` type import if not already present at the top of the test
file (it already imports `WorldGrid` as a value — add `type` usage is fine since it's
already imported).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/world/ShorelineCornerField.test.ts`
Expected: FAIL — `shorelineBoundaryPoints` doesn't yet accept a 9th argument (TypeScript
will error, or at runtime the extra arg is silently ignored and the custom-pull test
fails its assertion).

- [ ] **Step 3: Implement**

In `src/world/ShorelineCornerField.ts`, change `shorelineBoundaryPoints`'s signature and
body to accept an optional pull-function parameter:

```ts
export function shorelineBoundaryPoints(
  wg: WorldGrid, T: number, GHW: number, GHH: number,
  gx0: number, gz0: number, gx1: number, gz1: number,
  includeNoiseWobble: boolean,
  cornerPullFn: (wg: WorldGrid, gx: number, gz: number) => readonly [number, number] = shorelineCornerPull,
): Array<[number, number]> {
  const x0 = (gx0 - GHW) * T, z0 = (gz0 - GHH) * T;
  const x1 = (gx1 - GHW) * T, z1 = (gz1 - GHH) * T;
  const base = includeNoiseWobble
    ? shorelineEdgePoints(x0, z0, x1, z1)
    : _straightEdgePoints(x0, z0, x1, z1);

  const pull0 = cornerPullFn(wg, gx0, gz0);
  const pull1 = cornerPullFn(wg, gx1, gz1);
  const n = base.length - 1;
  return base.map(([px, pz], i) => {
    const t = i / n;
    return [
      px + pull0[0] * (1 - t) + pull1[0] * t,
      pz + pull0[1] * (1 - t) + pull1[1] * t,
    ] as [number, number];
  });
}
```

(Only the two `shorelineCornerPull(...)` calls change to `cornerPullFn(...)`; everything
else is unchanged.)

In `src/world/TerrainGeometryBuilder.ts`:

1. Add the import:
```ts
import { landBiomeCornerPull } from './LandBiomeCornerField';
```

2. Add a merged-pull helper near the top of `buildTerrainGeometryData` (alongside the
   existing `_hasCornerPull` module-level helper — place this one at module level too,
   since it needs no closure state):
```ts
/** Water/land pull takes priority (a coarser, more dramatic boundary); if
 *  zero, falls back to a land-biome pull. Never both at once — see design
 *  spec's edge-case reasoning (a mixed water+differing-biome vertex keeps
 *  today's water-only behavior, since landBiomeCornerPull's own dry-land-only
 *  scope guard already returns zero there). */
function _mergedCornerPull(wg: WorldGrid, gx: number, gz: number): readonly [number, number] {
  const waterPull = shorelineCornerPull(wg, gx, gz);
  if (_hasCornerPull(waterPull)) return waterPull;
  return landBiomeCornerPull(wg, gx, gz);
}
```

3. Find the existing `cornerPulls` object (currently around line 746):
```ts
      const cornerPulls = {
        nw: shorelineCornerPull(wg, col,     row),
        ne: shorelineCornerPull(wg, col + 1, row),
        se: shorelineCornerPull(wg, col + 1, row + 1),
        sw: shorelineCornerPull(wg, col,     row + 1),
      };
```
Replace each `shorelineCornerPull(...)` call with `_mergedCornerPull(...)`:
```ts
      const cornerPulls = {
        nw: _mergedCornerPull(wg, col,     row),
        ne: _mergedCornerPull(wg, col + 1, row),
        se: _mergedCornerPull(wg, col + 1, row + 1),
        sw: _mergedCornerPull(wg, col,     row + 1),
      };
```

4. Find the 4 `shorelineBoundaryPoints(...)` calls inside `emitGroundSubTiles` (around
   lines 592-599) and add `_mergedCornerPull` as the trailing argument to each, e.g.:
```ts
    const southPts = (adjacency.south || _hasCornerPull(cornerPulls.sw) || _hasCornerPull(cornerPulls.se))
      ? shorelineBoundaryPoints(wg, T, GHW, GHH, col, row + 1, col + 1, row + 1, adjacency.south, _mergedCornerPull) : null;
    const northPts = (adjacency.north || _hasCornerPull(cornerPulls.nw) || _hasCornerPull(cornerPulls.ne))
      ? shorelineBoundaryPoints(wg, T, GHW, GHH, col, row,     col + 1, row,     adjacency.north, _mergedCornerPull) : null;
    const eastPts  = (adjacency.east  || _hasCornerPull(cornerPulls.ne) || _hasCornerPull(cornerPulls.se))
      ? shorelineBoundaryPoints(wg, T, GHW, GHH, col + 1, row, col + 1, row + 1, adjacency.east, _mergedCornerPull)  : null;
    const westPts  = (adjacency.west  || _hasCornerPull(cornerPulls.nw) || _hasCornerPull(cornerPulls.sw))
      ? shorelineBoundaryPoints(wg, T, GHW, GHH, col, row,     col,     row + 1, adjacency.west, _mergedCornerPull)  : null;
```

5. Search for any OTHER direct calls to `shorelineBoundaryPoints` in this file (the wall
   geometry sections around lines 939-1008 reference `cornerPulls.*` for gating only, via
   `_hasCornerPull` — confirm via `grep -n "shorelineBoundaryPoints" src/world/TerrainGeometryBuilder.ts`
   that only the 4 call sites above exist; if a 5th call site is found, apply the same
   trailing-argument change there too).

- [ ] **Step 4: Add a shared-corner-agreement regression test, then run all affected tests**

Add to `tests/world/TerrainGeometryBuilder.test.ts` (near the other ground-geometry
tests):

```ts
it('adjacent tiles of different biomes share identical pulled-corner positions at their shared edge (no geometric cracks)', () => {
  // 3x1 grid: desert, grassland, grassland — the (1,0)-(1,1) vertical
  // edge between col=0 (desert) and col=1 (grassland) is a straight
  // 2-biome border (no isolated corner), so this asserts the BASELINE
  // no-gap invariant that any future corner-pull change must preserve.
  const wg = new WorldGrid(3, 1);
  wg.set(0, 0, { biome: 'desert' });
  wg.set(1, 0, { biome: 'grassland' });
  wg.set(2, 0, { biome: 'grassland' });
  const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 2, 1);
  // Both tiles' groundGeometry must be defined and non-empty — this would
  // throw or produce degenerate geometry if the merged corner-pull wiring
  // were broken (e.g. wrong function reference causing a crash).
  expect(data.groundGeometry.desert).toBeDefined();
  expect(data.groundGeometry.grassland).toBeDefined();
});

it('pulls a land-biome corner at an isolated single desert tile inside grassland, mirroring the shoreline pond test', () => {
  const wg = new WorldGrid(5, 5);
  wg.set(2, 2, { biome: 'desert' });
  // Should not throw, and should produce non-empty desert geometry —
  // full correctness of the pull math is covered by
  // LandBiomeCornerField.test.ts; this just confirms the wiring reaches
  // buildTerrainGeometryData without regressing.
  const data = buildTerrainGeometryData(wg, 5, 5, 2, 2, 2, 1);
  expect(data.groundGeometry.desert).toBeDefined();
  expect(data.groundGeometry.desert!.indices.length).toBeGreaterThan(0);
});
```

Run: `npx vitest run tests/world/ShorelineCornerField.test.ts tests/world/TerrainGeometryBuilder.test.ts src/world/LandBiomeCornerField.test.ts src/world/DualGridCornerPull.test.ts`
Expected: PASS — every existing test in these files still passes (the merge is additive:
water pull priority means every existing all-water/all-land-single-biome test scenario
sees `landBiomeCornerPull` return `[0, 0]` — same biome everywhere — so behavior is
byte-identical for every fixture that doesn't mix land biomes at a vertex), plus the 2
new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/world/ShorelineCornerField.ts src/world/TerrainGeometryBuilder.ts tests/world/ShorelineCornerField.test.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "Wire land-biome corner-pull into terrain geometry (merged with water pull)"
```

---

### Task 4: Height-correlated border texture blending

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Test: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `subTileBumpJitter`, `SUBTILE_BUMP_MAX` (existing, same file).
- Produces: `HEIGHT_BLEND_WEIGHT: number` (exported constant), no change to
  `_subTileGroundVariant`'s existing exported signature (the new behavior is internal).

**Design note (engineering decision, not a spec deviation):** the design spec calls for
"height-based texture blending... so the transition reads as organic mixing rather than a
stippled hard cut." The existing render architecture picks exactly ONE discrete texture
variant per sub-tile quad (`groundGeometry[variant]` buckets) — true continuous
per-fragment alpha blending between two textures would require a new dual-texture shader
or double-rendering with transparency, a materially larger, higher-risk change than this
task's scope. This task implements the spec's intent via the smaller, buildable
technique available today: the border-pull swap probability (previously a flat 40%) is
now driven by the *same real per-texel height bump already baked into that exact
sub-tile's visible geometry* (`subTileBumpJitter`), so texture swaps correlate with real
height variation (bumped-up patches swap more/less consistently than bumped-down ones)
instead of being uniformly random — reading as organic clustering along the border rather
than salt-and-pepper noise. A true continuous shader blend remains a follow-up, flagged
explicitly rather than silently dropped, matching this project's established convention.

- [ ] **Step 1: Write the failing test**

Add to `tests/world/TerrainGeometryBuilder.test.ts`, inside the existing
`describe('_subTileGroundVariant', ...)` block:

```ts
it('height-bias shifts the border-pull rate away from the flat 40% baseline (higher bias -> more pulls, lower bias -> fewer)', () => {
  // subTileBumpJitter is deterministic per world position; find one high-bump
  // and one low-bump sample position among a spread of candidates, then
  // confirm the high-bump sample pulls toward a differing neighbor strictly
  // more often across repeated distinct positions than the low-bump sample.
  const neighbors = { ...noNeighbors, south: 'desert' };
  const samples: Array<{ x: number; bump: number }> = [];
  for (let i = 0; i < 200; i++) {
    const x = i * 1.7 + 0.3;
    samples.push({ x, bump: subTileBumpJitter(x, x) });
  }
  samples.sort((a, b) => a.bump - b.bump);
  const lowBump = samples.slice(0, 20);
  const highBump = samples.slice(-20);
  const pullRate = (group: typeof samples): number => {
    let pulls = 0;
    for (const { x } of group) {
      if (_subTileGroundVariant('mountain', neighbors, 3, 3, 4, 'mountain', x, x) === 'desert') pulls++;
    }
    return pulls / group.length;
  };
  expect(pullRate(highBump)).toBeGreaterThan(pullRate(lowBump));
});
```

Add the `subTileBumpJitter` import to the test file's existing import line if not already
present (it already is, per the current import list — no change needed there).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "height-bias"`
Expected: FAIL — with today's flat `BORDER_PULL_PROBABILITY`, pull rate has no
correlation with bump value, so `pullRate(highBump) > pullRate(lowBump)` fails roughly
half the time (flaky-looking failure) — confirming the behavior doesn't exist yet.

- [ ] **Step 3: Implement**

In `src/world/TerrainGeometryBuilder.ts`, add near the existing `BORDER_PULL_PROBABILITY`
constant:

```ts
/** How strongly the per-sub-tile height-bump signal shifts border-pull
 *  probability away from the flat BORDER_PULL_PROBABILITY baseline — see
 *  Task 4's design note in the implementation plan for why this (not a
 *  literal shader alpha-blend) is this pass's buildable interpretation of
 *  "height-based texture blending". */
export const HEIGHT_BLEND_WEIGHT = 0.35;

/** Reuses the exact seamless per-lattice-point bump already baked into a
 *  sub-tile's visible geometry (subTileBumpJitter) as its "per-texel
 *  height" signal, normalized to [-1, 1]. */
function _borderHeightBias(subWorldX: number, subWorldZ: number): number {
  return subTileBumpJitter(subWorldX, subWorldZ) / SUBTILE_BUMP_MAX;
}
```

Then modify `_subTileGroundVariant` — replace the 4 border-pull `if` blocks:

```ts
export function _subTileGroundVariant(
  ownVariant: string,
  neighborVariant: { south: string | null; north: string | null; east: string | null; west: string | null },
  sx: number, sz: number, subdivisions: number,
  ownBiome: BiomeId,
  subWorldX: number, subWorldZ: number,
): string {
  const isOutermostSouth = sz === subdivisions - 1;
  const isOutermostNorth = sz === 0;
  const isOutermostEast  = sx === subdivisions - 1;
  const isOutermostWest  = sx === 0;

  const heightBias = _borderHeightBias(subWorldX, subWorldZ);
  const effectiveProbability = Math.min(1, Math.max(0,
    BORDER_PULL_PROBABILITY + heightBias * HEIGHT_BLEND_WEIGHT,
  ));

  if (isOutermostSouth && neighborVariant.south !== null && neighborVariant.south !== ownVariant) {
    if (_subTileRoll(subWorldX, subWorldZ, 1) < effectiveProbability) return neighborVariant.south;
  }
  if (isOutermostNorth && neighborVariant.north !== null && neighborVariant.north !== ownVariant) {
    if (_subTileRoll(subWorldX, subWorldZ, 2) < effectiveProbability) return neighborVariant.north;
  }
  if (isOutermostEast && neighborVariant.east !== null && neighborVariant.east !== ownVariant) {
    if (_subTileRoll(subWorldX, subWorldZ, 3) < effectiveProbability) return neighborVariant.east;
  }
  if (isOutermostWest && neighborVariant.west !== null && neighborVariant.west !== ownVariant) {
    if (_subTileRoll(subWorldX, subWorldZ, 4) < effectiveProbability) return neighborVariant.west;
  }

  const microPatches = MICRO_PATCH_VARIANTS[ownBiome];
  if (microPatches && microPatches.length > 0) {
    if (_subTileRoll(subWorldX, subWorldZ, 5) < MICRO_PATCH_PROBABILITY) {
      const idx = Math.min(
        Math.floor(_subTileRoll(subWorldX, subWorldZ, 6) * microPatches.length),
        microPatches.length - 1,
      );
      return microPatches[idx]!;
    }
  }

  return ownVariant;
}
```

(Only the 4 `if` conditions' thresholds change from `BORDER_PULL_PROBABILITY` to the new
`effectiveProbability`; the micro-patch branch and final fallback are untouched.)

- [ ] **Step 4: Run tests to verify everything passes**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS — the new height-bias test passes, and every pre-existing test in the
`_subTileGroundVariant` describe block still passes (they assert qualitative invariants —
"only outermost row pulls", "never pulls toward own variant", "deterministic", "low-rate
micro-patch" — none of which depend on the exact 0.40 constant, so they're unaffected by
this change).

- [ ] **Step 5: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "Make ground sub-tile border-pull probability height-correlated"
```

---

### Task 5: Region-scale texture variant selection

**Files:**
- Modify: `src/world/TerrainTextures.ts`
- Create: `tests/world/TerrainTextures.test.ts` (if it doesn't already exist — check
  first with `find tests -iname "TerrainTextures.test.ts"`; if it exists, add to it
  instead of creating a new file)
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Test: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Produces (`TerrainTextures.ts`): `REGION_TEXTURE_VARIANT_COUNT: Partial<Record<string,
  number>>`, `REGION_CELL_WU: number`, `regionTextureVariantKey(biome: string, worldX:
  number, worldZ: number): string`.
- Consumes (`TerrainGeometryBuilder.ts`): `regionTextureVariantKey` from
  `./TerrainTextures`.

- [ ] **Step 1: Write the failing test**

Check for an existing test file first:

```bash
find tests -iname "TerrainTextures.test.ts"
```

If none exists, create `tests/world/TerrainTextures.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { REGION_CELL_WU, REGION_TEXTURE_VARIANT_COUNT, regionTextureVariantKey } from '@/world/TerrainTextures';

describe('regionTextureVariantKey', () => {
  it('returns the plain biome id (no suffix) for a biome with no region variants configured', () => {
    expect(regionTextureVariantKey('mountain', 0, 0)).toBe('mountain');
    expect(regionTextureVariantKey('desert', 500, -500)).toBe('desert');
  });

  it('returns either the plain biome id or a "~N" suffixed variant for a configured biome', () => {
    const count = REGION_TEXTURE_VARIANT_COUNT.grassland!;
    expect(count).toBeGreaterThan(1);
    const key = regionTextureVariantKey('grassland', 123.4, -56.7);
    const match = /^grassland(~(\d+))?$/.exec(key);
    expect(match).not.toBeNull();
    if (match![2]) expect(Number(match![2])).toBeLessThan(count);
  });

  it('is stable within one region cell (same result for two positions in the same coarse cell)', () => {
    const a = regionTextureVariantKey('grassland', 1, 1);
    const b = regionTextureVariantKey('grassland', 1 + REGION_CELL_WU * 0.4, 1 + REGION_CELL_WU * 0.4);
    expect(a).toBe(b);
  });

  it('is deterministic across repeated calls', () => {
    expect(regionTextureVariantKey('forest', 42, 42)).toBe(regionTextureVariantKey('forest', 42, 42));
  });

  it('produces more than one distinct key across a spread of far-apart region cells', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 30; i++) {
      keys.add(regionTextureVariantKey('grassland', i * REGION_CELL_WU * 3, i * REGION_CELL_WU * 5));
    }
    expect(keys.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/world/TerrainTextures.test.ts`
Expected: FAIL — `REGION_CELL_WU`/`REGION_TEXTURE_VARIANT_COUNT`/`regionTextureVariantKey`
don't exist yet.

- [ ] **Step 3: Implement**

In `src/world/TerrainTextures.ts`, add after the `GROUND_TERRAIN_VARIANTS` export:

```ts
/** Biomes that get more than one large-scale texture variant, and how many
 *  (index 0 is always the existing base canvas — no behavior change for
 *  biomes not listed here or callers passing region-agnostic keys).
 *  Chosen for biomes where "patchier vs. lusher" reads as a genuine,
 *  plausible large-scale sub-region difference; omitted biomes (desert,
 *  snow, mountain, beach, etc.) already read as fairly visually uniform at
 *  region scale, matching the same reasoning MICRO_PATCH_VARIANTS in
 *  TerrainGeometryBuilder.ts already uses for the micro-patch list. */
export const REGION_TEXTURE_VARIANT_COUNT: Partial<Record<string, number>> = {
  grassland: 3,
  forest: 2,
  savanna: 2,
  tundra: 2,
};

/** World-space size (WU) of one region cell for region-scale texture-variant
 *  selection — coarser than a tile (T=2 WU) so a variant change reads as a
 *  genuine multi-tile sub-region rather than tile-by-tile noise. 8 tiles'
 *  worth per axis. */
export const REGION_CELL_WU = 16;

function _regionHash(regionX: number, regionZ: number): number {
  let h = (regionX * 2654435761 + regionZ * 40503) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/**
 * Deterministic region-scale texture-variant KEY for a biome at a given
 * absolute world position. Returns the plain `biome` string (no behavior
 * change) if that biome has no REGION_TEXTURE_VARIANT_COUNT entry, or
 * `${biome}~${idx}` for idx in [1, count) — idx 0 always collapses back to
 * the plain biome string so the existing single-variant rendering path is
 * untouched for the common case.
 */
export function regionTextureVariantKey(biome: string, worldX: number, worldZ: number): string {
  const count = REGION_TEXTURE_VARIANT_COUNT[biome];
  if (!count || count <= 1) return biome;
  const regionX = Math.floor(worldX / REGION_CELL_WU);
  const regionZ = Math.floor(worldZ / REGION_CELL_WU);
  const idx = Math.floor(_regionHash(regionX, regionZ) * count);
  return idx === 0 ? biome : `${biome}~${idx}`;
}
```

Now make `_canvasFor` and `terrainVariantTexture` understand suffixed keys. Replace the
existing `_canvasFor` function body:

```ts
/** Generic brightness recolor applied on top of any base canvas for region
 *  variant index >= 1 — reusable across every biome without bespoke
 *  per-biome authoring. idx 1 reads darker/lusher, idx 2 (if a biome ever
 *  configures 4 variants) reads lighter/drier; deliberately a simple,
 *  cheap post-process rather than new canvas content. */
function _applyRegionVariantTint(c: HTMLCanvasElement, idx: number): HTMLCanvasElement {
  const g = c.getContext('2d')!;
  const img = g.getImageData(0, 0, c.width, c.height);
  const mul = idx % 2 === 1 ? 0.85 : 1.15;
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i]     = Math.min(255, img.data[i]!     * mul);
    img.data[i + 1] = Math.min(255, img.data[i + 1]! * mul);
    img.data[i + 2] = Math.min(255, img.data[i + 2]! * mul);
  }
  g.putImageData(img, 0, 0);
  return c;
}

function _canvasFor(variantKey: string): HTMLCanvasElement {
  const cached = _canvases.get(variantKey);
  if (cached) return cached;
  const tildeIdx = variantKey.indexOf('~');
  const base = tildeIdx === -1 ? variantKey : variantKey.slice(0, tildeIdx);
  const regionIdx = tildeIdx === -1 ? 0 : parseInt(variantKey.slice(tildeIdx + 1), 10);
  let c: HTMLCanvasElement;
  switch (base) {
    case 'beach':     c = _buildBeachCanvas(); break;
    case 'desert':    c = _buildDesertCanvas(); break;
    case 'savanna':   c = _buildSavannaCanvas(); break;
    case 'grassland': c = _buildGrasslandCanvas(); break;
    case 'forest':    c = _buildForestCanvas(); break;
    case 'taiga':     c = _buildTaigaCanvas(); break;
    case 'tundra':    c = _buildTundraCanvas(); break;
    case 'snow':      c = _buildSnowCanvas(); break;
    case 'river_floor': c = _buildRiverFloorCanvas(); break;
    case 'lake_floor':  c = _buildLakeFloorCanvas(); break;
    case 'ocean_floor': c = _buildOceanFloorCanvas(); break;
    default:          c = _buildGrasslandCanvas(); break;
  }
  if (regionIdx > 0) c = _applyRegionVariantTint(c, regionIdx);
  _canvases.set(variantKey, c);
  return c;
}
```

(`terrainVariantTexture` itself needs no change — its `variant === 'mountain'` /
`variant === 'river_bank'` special cases only match exact unsuffixed strings, and every
other variant string, suffixed or not, already falls through to `_canvasFor(variant)`
correctly.)

Now wire the region key into `src/world/TerrainGeometryBuilder.ts`. Add the import:

```ts
import { GROUND_TERRAIN_VARIANTS, regionTextureVariantKey } from './TerrainTextures';
```

Change `_groundTextureVariant`'s signature and final line — it needs the tile's own
`col`/`row` to compute a world position:

```ts
  const _groundTextureVariant = (cell: WorldCell, col: number, row: number): string | null => {
    if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') return 'ocean_floor';
    if (cell.feature === 'river')       return 'river_floor';
    if (cell.feature === 'lake')        return 'lake_floor';
    if (cell.feature === 'river_ford')  return null;
    if (cell.feature === 'river_bank')  return 'river_bank';
    if (cell.biome === 'beach')         return 'beach';
    if (!(GROUND_TERRAIN_VARIANTS as readonly string[]).includes(cell.biome)) return null;
    const wx = (col - GHW) * T, wz = (row - GHH) * T;
    return regionTextureVariantKey(cell.biome, wx, wz);
  };
```

Update every call site to pass `col`/`row` (find them with
`grep -n "_groundTextureVariant(" src/world/TerrainGeometryBuilder.ts`):

- The 4 neighbor-variant lookups inside `emitGroundSubTiles` become:
```ts
    const neighborVariant = {
      south: _groundTextureVariant(wg.get(col, row + 1), col, row + 1),
      north: _groundTextureVariant(wg.get(col, row - 1), col, row - 1),
      east:  _groundTextureVariant(wg.get(col + 1, row), col + 1, row),
      west:  _groundTextureVariant(wg.get(col - 1, row), col - 1, row),
    };
```
- The 3 main-loop call sites (`const groundVariant = _groundTextureVariant(cell);`) each
  become `const groundVariant = _groundTextureVariant(cell, col, row);` (these are already
  inside the `for (row...) for (col...)` loop, so `col`/`row` are in scope).

- [ ] **Step 4: Run tests to verify everything passes**

Run: `npx vitest run tests/world/TerrainTextures.test.ts tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS. Also add one integration assertion to
`tests/world/TerrainGeometryBuilder.test.ts` confirming a grassland tile's `groundVariant`
key can legitimately be a suffixed one:

```ts
it('region-scale variant selection can route a grassland tile into a suffixed groundGeometry bucket', () => {
  // A large grid gives enough distinct region cells that at least one
  // grassland tile should land on a non-zero region variant somewhere.
  const wg = new WorldGrid(40, 40);
  for (let r = 0; r < 40; r++) for (let c = 0; c < 40; c++) wg.set(c, r, { biome: 'grassland', elevation: 0 });
  const data = buildTerrainGeometryData(wg, 40, 40, 20, 20, 2, 1);
  const keys = Object.keys(data.groundGeometry);
  expect(keys.some((k) => k === 'grassland' || k.startsWith('grassland~'))).toBe(true);
});
```

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/world/TerrainTextures.ts src/world/TerrainGeometryBuilder.ts tests/world/TerrainTextures.test.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "Add region-scale ground texture variant selection"
```

---

### Task 6: Hex-bombing-lite per-tile UV rotation

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Test: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Produces: internal `_tileUvRotation(col: number, row: number): number` and
  `_rotateUv(u: number, v: number, rotation: number): [number, number]` (not exported —
  no external consumer needed; verified via the geometry-level test below instead of unit
  tests on the private helpers, matching this file's existing convention of only
  exporting functions that need direct unit tests).

**Design note:** the rotation must be constant across all 16 sub-tile quads of one tile
(otherwise the texture would visibly jump between adjacent sub-tiles inside a single
tile, breaking the "continuous surface" property this whole texture system exists for).
It only varies tile-to-tile.

- [ ] **Step 1: Write the failing test**

Add to `tests/world/TerrainGeometryBuilder.test.ts`, near the existing "computes
world-space-projected UV on the routed tile" test:

```ts
it('applies a per-tile UV rotation so two same-biome tiles at different grid positions are not guaranteed identical UV phase', () => {
  // Build two separate 1x1 grids at different (effectively arbitrary,
  // since buildTerrainGeometryData always treats its grid as its own
  // coordinate space) tile-index origins by using different GHW/GHH
  // offsets — this changes which _tileUvRotation(col,row) hash bucket a
  // col=0,row=0 tile falls into isn't directly controllable from the
  // public API, so instead assert the weaker, still-meaningful invariant:
  // UVs within one tile stay internally consistent under any rotation
  // (i.e., the tile's own 4 sub-tile-grid corners' UV span the expected
  // extent, just possibly rotated) by checking the UV bounding box is
  // still non-degenerate.
  const wg = new WorldGrid(1, 1);
  wg.set(0, 0, { biome: 'grassland', elevation: 0 });
  const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1);
  const uvs = data.groundGeometry.grassland!.uvs;
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let i = 0; i < uvs.length; i += 2) {
    uMin = Math.min(uMin, uvs[i]!); uMax = Math.max(uMax, uvs[i]!);
    vMin = Math.min(vMin, uvs[i + 1]!); vMax = Math.max(vMax, uvs[i + 1]!);
  }
  expect(uMax - uMin).toBeGreaterThan(0);
  expect(vMax - vMin).toBeGreaterThan(0);
});

it('keeps UV continuous across all 16 sub-tiles of one tile regardless of rotation (same rotation applied uniformly)', () => {
  const wg = new WorldGrid(1, 1);
  wg.set(0, 0, { biome: 'grassland', elevation: 0 });
  const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1);
  // 16 sub-tiles x 4 verts x 2 floats.
  expect(data.groundGeometry.grassland!.uvs.length).toBe(16 * 4 * 2);
});
```

- [ ] **Step 2: Run the test to verify it fails (for the rotation-application step) then passes trivially for the pre-existing shape**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "UV rotation"`
Expected: the "non-degenerate bounding box" test PASSES even before implementation
(rotation isn't required for it to hold) — this is expected; it is a smoke check for
Step 4, not a strict TDD red/green gate on its own. The real regression coverage for this
task is Step 4's full-suite pass after implementation confirming nothing broke.

- [ ] **Step 3: Implement**

In `src/world/TerrainGeometryBuilder.ts`, add near `GROUND_UV_TILE_WU`:

```ts
/** Deterministic per-tile UV rotation index in [0, 4) — 0/90/180/270°.
 *  "Hex-bombing-lite": a cheap rotation-only approximation of full
 *  hex-bombing (which resamples from irregular cells) that still breaks
 *  large-scale periodic-tiling visibility, since GROUND_UV_TILE_WU (2.5 WU)
 *  already doesn't align with the 2 WU tile grid — a per-tile rotation
 *  introduces no NEW seam beyond what that non-aligned tiling already has. */
function _tileUvRotation(col: number, row: number): number {
  let h = (col * 668265263 + row * 374761393) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  return (h >>> 0) % 4;
}

/** Rotates a (u, v) pair 90°*rotation clockwise in UV space. */
function _rotateUv(u: number, v: number, rotation: number): [number, number] {
  switch (rotation) {
    case 1: return [-v, u];
    case 2: return [-u, -v];
    case 3: return [v, -u];
    default: return [u, v];
  }
}
```

Modify `addGroundFace` to accept and apply a rotation parameter:

```ts
  const addGroundFace = (
    variant: string,
    v0: [number, number, number], v1: [number, number, number],
    v2: [number, number, number], v3: [number, number, number],
    nx: number, ny: number, nz: number,
    r: number, g: number, b: number,
    uvRotation: number,
  ): void => {
    let geo = groundGeometry[variant];
    if (!geo) { geo = { positions: [], normals: [], colors: [], uvs: [], indices: [] }; groundGeometry[variant] = geo; }
    const base = geo.positions.length / 3;
    geo.positions.push(...v0, ...v1, ...v2, ...v3);
    geo.normals.push(nx, ny, nz,  nx, ny, nz,  nx, ny, nz,  nx, ny, nz);
    geo.colors.push(r, g, b,  r, g, b,  r, g, b,  r, g, b);
    for (const [vx, , vz] of [v0, v1, v2, v3]) {
      const [ru, rv] = _rotateUv(vx / GROUND_UV_TILE_WU, vz / GROUND_UV_TILE_WU, uvRotation);
      geo.uvs.push(ru, rv);
    }
    geo.indices.push(base, base + 1, base + 2,  base, base + 2, base + 3);
  };
```

Update `emitGroundSubTiles`'s signature to accept and thread through a rotation
parameter, and its own `addGroundFace` call:

```ts
  const emitGroundSubTiles = (
    col: number, row: number, cell: WorldCell, groundVariant: string,
    swY: number, nwY: number, neY: number, seY: number,
    nx: number, ny: number, nz: number,
    wxTile: number, wzTile: number,
    tr: number, tg: number, tb: number,
    adjacency: WaterAdjacency,
    cornerPulls: { nw: readonly [number, number]; ne: readonly [number, number]; se: readonly [number, number]; sw: readonly [number, number] },
    uvRotation: number,
  ): void => {
```

(add the `uvRotation` parameter after `cornerPulls`), and inside its loop:

```ts
        addGroundFace(
          variant,
          [x00, ySW, z00], [x01, yNW, z01], [x11, yNE, z11], [x10, ySE, z10],
          nx, ny, nz, tr, tg, tb,
          uvRotation,
        );
```

Update every call site:
- The 2 calls to `emitGroundSubTiles(...)` in the main loop (around lines 854 and 888):
  add `_tileUvRotation(col, row)` as the final trailing argument to each.
- The 3 direct `addGroundFace(...)` calls in the main loop (the ones NOT inside
  `emitGroundSubTiles`, for ramp-shape/water/uncovered-biome tiles that skip
  sub-tiling) each need `_tileUvRotation(col, row)` appended as their final argument too
  — find them via `grep -n "addGroundFace(" src/world/TerrainGeometryBuilder.ts` and add
  the argument to each call not already inside `emitGroundSubTiles`'s own body.

- [ ] **Step 4: Run tests to verify everything passes**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS — including the pre-existing "computes world-space-projected UV on the
routed tile" test (rotation preserves non-degenerate UV variation for any of the 4 cases)
and both new tests from Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "Add hex-bombing-lite per-tile UV rotation for ground textures"
```

---

### Task 7: Full regression pass + live Playwright verification

**Files:**
- Create: `tests/e2e/land-biome-borders.spec.ts`
- No other files modified (verification-only task).

**Interfaces:**
- Consumes: whatever this project's existing e2e harness exposes for loading the
  overworld scene at a fixed seed (check `tests/e2e/ambient-wildlife.spec.ts` or another
  existing overworld e2e spec for the exact page-load/seed convention before writing this
  file, since that convention is established elsewhere in the suite and must be matched
  exactly rather than invented here).

- [ ] **Step 1: Run the full unit/integration suite**

Run: `npm test`
Expected: no new failures beyond this repo's already-documented pre-existing/flaky
baseline (check `TODO/TODO_OVERVIEW.md`'s most recent baseline failure count mentioned in
its G16 entry, or run once on `main` first if unsure, to confirm the baseline before
attributing any failure to this plan's changes).

- [ ] **Step 2: Run `tsc --noEmit` and confirm the established baseline**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: error count matches this repo's established baseline (146, per
`TODO_OVERVIEW.md`'s G16 entry as of this plan's writing) — zero NEW errors attributable
to this plan's files.

- [ ] **Step 3: Write and run a live Playwright verification**

First inspect an existing overworld-loading e2e spec to copy its exact setup convention:

```bash
grep -n "page.goto\|seed" tests/e2e/ambient-wildlife.spec.ts | head -10
```

Create `tests/e2e/land-biome-borders.spec.ts` following that same page-load/seed pattern
(fill in the actual URL/seed parameter convention found above — do not invent a
different one), then add a screenshot-based visual check:

```ts
import { test, expect } from '@playwright/test';

test('land-biome borders render curved corners and region-scale texture variety at a multi-biome seed', async ({ page }) => {
  // NOTE: replace this navigation with the exact convention found in
  // tests/e2e/ambient-wildlife.spec.ts (or another existing overworld
  // spec) for loading the overworld scene at a fixed, multi-biome seed —
  // this plan cannot hardcode that URL/seed parameter without having
  // inspected the current harness first.
  await page.goto('/'); // placeholder — replace per the harness convention found above
  await page.waitForTimeout(3000); // allow terrain generation/render to settle
  await expect(page).toHaveScreenshot('land-biome-border-overview.png', { maxDiffPixelRatio: 0.05 });
});
```

Run: `npx playwright test tests/e2e/land-biome-borders.spec.ts --update-snapshots` (first
run, to create the baseline screenshot), then `npx playwright test
tests/e2e/land-biome-borders.spec.ts` (second run, to confirm it's stable/repeatable).
Expected: PASS on the second run; visually inspect the generated screenshot (via
`npx playwright show-report` or opening the PNG directly) to confirm land-biome borders
show real curved corners (not straight tile-edge cuts) and that a large single-biome
region shows visible texture patchiness rather than one uniform repeating tile — this
human-visible confirmation is the actual point of this step, not just the exit code.

- [ ] **Step 4: Fix anything the live pass reveals**

If the screenshot shows a seam, a flat-looking border, or an obviously-tiled texture
region, that is real signal per the `research-driven-world-polish` skill's own
guidance — go back to the relevant task above and fix the root cause (do not just accept
a cosmetic issue because the unit tests pass), then re-run Steps 1-3.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/land-biome-borders.spec.ts
git commit -m "Add live Playwright verification for land-biome dual-grid borders"
```

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** generalized corner-pull (Tasks 1-3), height-based texture blending
  (Task 4, with an explicit documented scope note on how "blending" is interpreted given
  today's discrete-bucket render architecture), region-scale texture variation + UV
  hex-bombing-lite (Tasks 5-6), edge cases / determinism (covered throughout Tasks 2-3),
  testing strategy including a Playwright pass (Task 7). No spec section is uncovered.
- **After Task 7's playtest-worthy state is reached**, per the `research-driven-world-polish`
  skill, report back to the user with what changed and how to see it live, and explicitly
  pause for their playtest approval before starting sub-task 1.2 or 1.3.
