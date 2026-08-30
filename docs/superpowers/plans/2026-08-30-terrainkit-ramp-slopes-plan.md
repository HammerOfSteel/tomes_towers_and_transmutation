# TerrainKit Ramp/Slope Terrain Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace today's vertical-wall elevation transitions with real sloped ramp geometry for
dry-land terrain, via a new canonical shape-classification system (`TerrainKit.ts`), eliminating
the "blocky staircase" look without touching water tiles, `WaterDetection.ts`, or road-subtile
rendering.

**Architecture:** A new pure module `src/world/TerrainKit.ts` classifies a tile's 4 corner
elevations into one of 5 canonical ramp shapes (flat/single-corner/edge/saddle/outer-corner)
plus a degenerate all-four-down fallback, and emits correctly-triangulated (and, for non-planar
shapes, correctly-per-triangle-normaled) geometry. `TerrainGeometryBuilder.ts`'s existing
`buildTerrainGeometryData()` is extended (no new public parameters) to compute each tile's 4
corner elevations from its neighbors, classify via `TerrainKit`, and render the appropriate
shape instead of always emitting a flat quad — with wall faces on each side anchored to the
tile's own (possibly ramped) corner heights instead of its flat elevation, so a ramp that
already reaches a lower neighbor no longer draws a redundant wall.

**Tech Stack:** TypeScript, Vitest, Three.js (consumed downstream by `OverworldScene.ts`,
untouched by this plan), Rapier physics (collider derived from the same buffers, untouched
integration point).

## Global Constraints

- Ramps apply to **dry land tiles only** — any tile with `biome === 'ocean'`,
  `biome === 'deep_ocean'`, or `waterDepth > 0` is completely excluded, both as the tile being
  classified and as a corner-elevation contributor for a neighboring dry tile. `WaterDetection.ts`
  is never touched by this plan.
- No sub-tile subdivision, no ramp-aware road-subtile height blending — both explicitly deferred
  (see design spec §2 "Explicitly out of scope").
- Every existing test in `tests/world/TerrainGeometryBuilder.test.ts` must continue to pass
  **unchanged** — flat terrain (the ~94% common case) must render byte-identical to today.
- Design spec: `docs/superpowers/specs/2026-08-30-terrainkit-ramp-slopes-design.md` (approved
  2026-08-30) — read this first for the full corner-height derivation rule and shape taxonomy
  rationale; this plan implements it directly, terminology matches 1:1.

---

## File Structure

- **Create** `src/world/TerrainKit.ts` — pure geometry helpers: `classifyTileShape()`,
  `orderCornersForDiagonal()`, `triangleNormal()`, `buildQuadFace()`. No THREE.js/Rapier/WorldGrid
  dependency — inputs are plain numbers/booleans/tuples, outputs are plain number arrays.
- **Create** `tests/world/TerrainKit.test.ts` — exhaustive 16-corner-combination coverage.
- **Modify** `src/world/TerrainGeometryBuilder.ts` — add private corner-height helpers
  (`_isWaterTile`, `_rawCornerElevation`, `_tileCornerLevels`, `_lowCorners`, `_isRampEligible`),
  replace the top-face block's unconditional flat `addFace()` call with shape-aware rendering,
  and adjust the 4 wall blocks to anchor against ramped corner heights instead of the flat tile
  height.
- **Modify** `tests/world/TerrainGeometryBuilder.test.ts` — new tests for each ramp shape's
  geometry and for wall suppression/residual-wall behavior; existing tests unchanged (must stay
  green with zero edits).

---

### Task 1: `TerrainKit.ts` — shape classification

**Files:**
- Create: `src/world/TerrainKit.ts`
- Test: `tests/world/TerrainKit.test.ts`

**Interfaces:**
- Produces: `export type RampShape = 'flat' | 'single-corner' | 'edge' | 'saddle' | 'outer-corner' | 'all-four-down';`
  `export type Diagonal = 'sw-ne' | 'nw-se';`
  `export interface RampClassification { shape: RampShape; diagonal: Diagonal; }`
  `export function classifyTileShape(lowCorners: readonly [boolean, boolean, boolean, boolean]): RampClassification`
  — `lowCorners` is `[sw, nw, ne, se]`, `true` meaning that corner is one elevation level below
  the tile's own elevation.

- [ ] **Step 1: Write the failing test**

Create `tests/world/TerrainKit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyTileShape, type RampShape, type Diagonal } from '@/world/TerrainKit';

// All 16 combinations of [sw, nw, ne, se], with the shape+diagonal every
// combination must classify to. Order: sw, nw, ne, se.
const CASES: Array<{ corners: [boolean, boolean, boolean, boolean]; shape: RampShape; diagonal: Diagonal }> = [
  { corners: [false, false, false, false], shape: 'flat',         diagonal: 'sw-ne' },
  { corners: [true,  false, false, false], shape: 'single-corner', diagonal: 'sw-ne' },
  { corners: [false, true,  false, false], shape: 'single-corner', diagonal: 'nw-se' },
  { corners: [false, false, true,  false], shape: 'single-corner', diagonal: 'sw-ne' },
  { corners: [false, false, false, true ], shape: 'single-corner', diagonal: 'nw-se' },
  { corners: [true,  true,  false, false], shape: 'edge',          diagonal: 'sw-ne' },
  { corners: [true,  false, true,  false], shape: 'saddle',        diagonal: 'sw-ne' },
  { corners: [true,  false, false, true ], shape: 'edge',          diagonal: 'sw-ne' },
  { corners: [false, true,  true,  false], shape: 'edge',          diagonal: 'sw-ne' },
  { corners: [false, true,  false, true ], shape: 'saddle',        diagonal: 'nw-se' },
  { corners: [false, false, true,  true ], shape: 'edge',          diagonal: 'sw-ne' },
  { corners: [true,  true,  true,  false], shape: 'outer-corner',  diagonal: 'nw-se' },
  { corners: [true,  true,  false, true ], shape: 'outer-corner',  diagonal: 'sw-ne' },
  { corners: [true,  false, true,  true ], shape: 'outer-corner',  diagonal: 'nw-se' },
  { corners: [false, true,  true,  true ], shape: 'outer-corner',  diagonal: 'sw-ne' },
  { corners: [true,  true,  true,  true ], shape: 'all-four-down', diagonal: 'sw-ne' },
];

describe('classifyTileShape', () => {
  it('classifies all 16 corner-low combinations to the correct shape and diagonal', () => {
    for (const { corners, shape, diagonal } of CASES) {
      const result = classifyTileShape(corners);
      expect(result.shape, `corners=${JSON.stringify(corners)}`).toBe(shape);
      expect(result.diagonal, `corners=${JSON.stringify(corners)}`).toBe(diagonal);
    }
  });

  it('is a pure function (same input always produces the same output)', () => {
    const a = classifyTileShape([true, false, true, false]);
    const b = classifyTileShape([true, false, true, false]);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/TerrainKit.test.ts`
Expected: FAIL — `Cannot find module '@/world/TerrainKit'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/world/TerrainKit.ts`:

```ts
/**
 * TerrainKit.ts — pure geometry classifier + emitter for ramp/slope
 * terrain shapes, mirroring BlockKit.ts's role for buildings (pure
 * corner-data-in, geometry-buffers-out, no THREE.js/WorldGrid dependency).
 *
 * See docs/superpowers/specs/2026-08-30-terrainkit-ramp-slopes-design.md
 * for the full corner-height derivation rule and shape taxonomy rationale
 * this module implements.
 */

export type RampShape =
  | 'flat' | 'single-corner' | 'edge' | 'saddle' | 'outer-corner' | 'all-four-down';

export type Diagonal = 'sw-ne' | 'nw-se';

export interface RampClassification {
  shape: RampShape;
  /** Which diagonal to split the quad along when triangulating a non-planar
   *  shape — chosen so the shape's distinguishing corner(s) sit on the
   *  diagonal itself (single-corner/outer-corner: passes through the lone
   *  odd corner; saddle: connects the two low corners, giving the "valley"
   *  reading rather than the "ridge" reading). Irrelevant for flat/edge/
   *  all-four-down (both diagonal choices are geometrically equivalent for
   *  a planar quad) but always populated for API consistency. */
  diagonal: Diagonal;
}

/**
 * Classifies a tile's 4 corners — `[sw, nw, ne, se]`, `true` meaning that
 * corner is one elevation level below the tile's own elevation — into one
 * of the 5 canonical ramp shapes (plus the degenerate all-four-down
 * fallback), and picks the correct triangulation diagonal.
 */
export function classifyTileShape(
  lowCorners: readonly [boolean, boolean, boolean, boolean],
): RampClassification {
  const [sw, nw, ne, se] = lowCorners;
  const lowCount = [sw, nw, ne, se].filter(Boolean).length;

  if (lowCount === 0) return { shape: 'flat', diagonal: 'sw-ne' };
  if (lowCount === 4) return { shape: 'all-four-down', diagonal: 'sw-ne' };

  if (lowCount === 1) {
    // Diagonal passes through the lone low corner.
    const diagonal: Diagonal = (sw || ne) ? 'sw-ne' : 'nw-se';
    return { shape: 'single-corner', diagonal };
  }

  if (lowCount === 3) {
    // Diagonal passes through the lone HIGH corner (the odd one out).
    const highIsSwOrNe = !sw || !ne;
    const diagonal: Diagonal = highIsSwOrNe ? 'sw-ne' : 'nw-se';
    return { shape: 'outer-corner', diagonal };
  }

  // lowCount === 2: either adjacent (edge, planar) or diagonal (saddle).
  if (sw && ne && !nw && !se) return { shape: 'saddle', diagonal: 'sw-ne' };
  if (nw && se && !sw && !ne) return { shape: 'saddle', diagonal: 'nw-se' };
  // Adjacent pair — genuinely planar, diagonal choice doesn't affect the
  // resulting surface (see design spec §4/§6), 'sw-ne' by convention.
  return { shape: 'edge', diagonal: 'sw-ne' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/TerrainKit.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/world/TerrainKit.ts tests/world/TerrainKit.test.ts
git commit -m "feat: add TerrainKit.classifyTileShape for ramp/slope terrain

Pure classifier: given a tile's 4 corner low/high booleans, returns
which of the 5 canonical ramp shapes (flat/single-corner/edge/saddle/
outer-corner, plus the degenerate all-four-down fallback) applies and
which diagonal to triangulate along. Exhaustively tested across all 16
corner-low combinations.

Part of the ramp/slope terrain plan:
docs/superpowers/plans/2026-08-30-terrainkit-ramp-slopes-plan.md"
```

---

### Task 2: `TerrainKit.ts` — quad geometry emission

**Files:**
- Modify: `src/world/TerrainKit.ts`
- Test: `tests/world/TerrainKit.test.ts`

**Interfaces:**
- Consumes: `Diagonal` from Task 1.
- Produces: `export function orderCornersForDiagonal<T>(corners: { sw: T; nw: T; ne: T; se: T }, diagonal: Diagonal): [T, T, T, T]`
  `export function triangleNormal(a: readonly [number, number, number], b: readonly [number, number, number], c: readonly [number, number, number]): [number, number, number]`
  `export interface QuadFaceGeometry { positions: number[]; normals: number[]; }`
  `export function buildQuadFace(corners: { sw: readonly [number, number, number]; nw: readonly [number, number, number]; ne: readonly [number, number, number]; se: readonly [number, number, number]; }, diagonal: Diagonal): QuadFaceGeometry`
  — `buildQuadFace` always emits exactly 6 vertices (2 triangles, 18 position floats, 18 normal
  floats), with each triangle's 3 vertices sharing one computed normal (flat-shaded per
  triangle) — used by `TerrainGeometryBuilder.ts` for the 3 non-planar shapes
  (single-corner/outer-corner/saddle); flat/edge/all-four-down are cheaper to render directly
  via the existing `addFace()` helper and don't need this function (see Task 4).

- [ ] **Step 1: Write the failing test**

Append to `tests/world/TerrainKit.test.ts`:

```ts
import { orderCornersForDiagonal, triangleNormal, buildQuadFace } from '@/world/TerrainKit';

describe('orderCornersForDiagonal', () => {
  it('orders sw,nw,ne,se unchanged for the sw-ne diagonal', () => {
    const corners = { sw: 'SW', nw: 'NW', ne: 'NE', se: 'SE' };
    expect(orderCornersForDiagonal(corners, 'sw-ne')).toEqual(['SW', 'NW', 'NE', 'SE']);
  });

  it('rotates to nw,ne,se,sw for the nw-se diagonal (keeps the diagonal as v0-v2)', () => {
    const corners = { sw: 'SW', nw: 'NW', ne: 'NE', se: 'SE' };
    expect(orderCornersForDiagonal(corners, 'nw-se')).toEqual(['NW', 'NE', 'SE', 'SW']);
  });
});

describe('triangleNormal', () => {
  it('returns straight up (0,1,0) for a flat horizontal triangle', () => {
    const n = triangleNormal([0, 0, 0], [0, 0, 1], [1, 0, 1]);
    expect(n[0]).toBeCloseTo(0);
    expect(n[1]).toBeCloseTo(1);
    expect(n[2]).toBeCloseTo(0);
  });

  it('returns a unit-length vector', () => {
    const n = triangleNormal([0, 0, 0], [1, 1, 0], [0, 1, 1]);
    const len = Math.hypot(n[0], n[1], n[2]);
    expect(len).toBeCloseTo(1);
  });

  it('tilts away from straight-up for a sloped triangle', () => {
    const n = triangleNormal([0, 0, 0], [0, -1, 1], [1, -1, 1]);
    expect(n[1]).toBeLessThan(1);
  });
});

describe('buildQuadFace', () => {
  it('emits exactly 6 vertices (2 triangles) with matching normal/position counts', () => {
    const corners = {
      sw: [0, 0, 0] as [number, number, number],
      nw: [0, 0, 2] as [number, number, number],
      ne: [2, 0, 2] as [number, number, number],
      se: [2, 0, 0] as [number, number, number],
    };
    const { positions, normals } = buildQuadFace(corners, 'sw-ne');
    expect(positions).toHaveLength(18);
    expect(normals).toHaveLength(18);
  });

  it('gives both triangles the identical straight-up normal for a flat quad', () => {
    const corners = {
      sw: [0, 0, 0] as [number, number, number],
      nw: [0, 0, 2] as [number, number, number],
      ne: [2, 0, 2] as [number, number, number],
      se: [2, 0, 0] as [number, number, number],
    };
    const { normals } = buildQuadFace(corners, 'sw-ne');
    // 6 verts x 3 floats; triangle 1 = verts 0-2, triangle 2 = verts 3-5.
    const tri1Normal = [normals[0], normals[1], normals[2]];
    const tri2Normal = [normals[9], normals[10], normals[11]];
    expect(tri1Normal[1]).toBeCloseTo(1);
    expect(tri2Normal[1]).toBeCloseTo(1);
  });

  it('gives the two triangles genuinely different normals for a single-corner-dipped quad', () => {
    const corners = {
      sw: [0, -1, 0] as [number, number, number], // dipped corner
      nw: [0, 0, 2] as [number, number, number],
      ne: [2, 0, 2] as [number, number, number],
      se: [2, 0, 0] as [number, number, number],
    };
    const { normals } = buildQuadFace(corners, 'sw-ne');
    const tri1Normal = [normals[0], normals[1], normals[2]];
    const tri2Normal = [normals[9], normals[10], normals[11]];
    // Not identical — the dip breaks planarity, so the two triangles tilt differently.
    expect(tri1Normal).not.toEqual(tri2Normal);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/TerrainKit.test.ts`
Expected: FAIL — `orderCornersForDiagonal`/`triangleNormal`/`buildQuadFace` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/world/TerrainKit.ts`:

```ts
/**
 * Reorders a tile's 4 corners so the requested diagonal becomes the
 * shared edge between the 2 emitted triangles (matching the existing
 * `addFace()`-style convention in `TerrainGeometryBuilder.ts`, where a
 * quad's v0..v3 always triangulates as (v0,v1,v2)/(v0,v2,v3) — i.e. the
 * diagonal is always v0-v2). Rotating the vertex order preserves
 * counter-clockwise winding (rotating a CCW list cyclically stays CCW).
 */
export function orderCornersForDiagonal<T>(
  corners: { sw: T; nw: T; ne: T; se: T },
  diagonal: Diagonal,
): [T, T, T, T] {
  return diagonal === 'sw-ne'
    ? [corners.sw, corners.nw, corners.ne, corners.se]
    : [corners.nw, corners.ne, corners.se, corners.sw];
}

/** Unit-length face normal of the triangle (a, b, c), via the cross
 *  product of its two edge vectors. Winding must be counter-clockwise
 *  when viewed along the intended outward normal (matches every other
 *  face-emission helper in this codebase). */
export function triangleNormal(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): [number, number, number] {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

export interface QuadFaceGeometry {
  /** 18 floats: 2 triangles x 3 verts x 3 floats (x,y,z), not indexed/deduplicated. */
  positions: number[];
  /** 18 floats, one normal per vertex — the 3 vertices of a given triangle
   *  always share the identical normal (flat-shaded per triangle); the two
   *  triangles composing the quad may differ from each other when the quad
   *  is non-planar. */
  normals: number[];
}

/**
 * Builds explicit 2-triangle geometry for a tile's top face given its 4
 * corner world-space positions and which diagonal to split along.
 * Always used for non-planar shapes (single-corner/outer-corner/saddle) —
 * flat/edge/all-four-down are cheaper to render via the existing
 * single-normal `addFace()` helper directly (see Task 4), since those
 * shapes are always genuinely planar (or intentionally forced flat).
 */
export function buildQuadFace(
  corners: {
    sw: readonly [number, number, number];
    nw: readonly [number, number, number];
    ne: readonly [number, number, number];
    se: readonly [number, number, number];
  },
  diagonal: Diagonal,
): QuadFaceGeometry {
  const [v0, v1, v2, v3] = orderCornersForDiagonal(corners, diagonal);
  // Matches addFace()'s existing (0,1,2)/(0,2,3) index convention — the
  // diagonal is always v0-v2 after ordering, so triangle 1 = v0,v1,v2 and
  // triangle 2 = v0,v2,v3.
  const n1 = triangleNormal(v0, v1, v2);
  const n2 = triangleNormal(v0, v2, v3);
  const positions: number[] = [...v0, ...v1, ...v2, ...v0, ...v2, ...v3];
  const normals: number[] = [...n1, ...n1, ...n1, ...n2, ...n2, ...n2];
  return { positions, normals };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/TerrainKit.test.ts`
Expected: PASS (8 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/world/TerrainKit.ts tests/world/TerrainKit.test.ts
git commit -m "feat: add TerrainKit.buildQuadFace for non-planar ramp geometry

orderCornersForDiagonal() reorders a tile's 4 corners so the chosen
diagonal becomes the shared triangle edge; triangleNormal() computes a
real cross-product face normal; buildQuadFace() combines both into
explicit 2-triangle geometry with correct per-triangle normals for
non-planar ramp shapes (single-corner/outer-corner/saddle).

Part of the ramp/slope terrain plan:
docs/superpowers/plans/2026-08-30-terrainkit-ramp-slopes-plan.md"
```

---

### Task 3: `TerrainGeometryBuilder.ts` — corner-height derivation helpers

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Test: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `WorldGrid`, `WorldCell` from `./WorldGrid` (add `WorldCell` to the existing type-only
  import at the top of the file).
- Produces (module-private, not exported — only consumed within this file in Task 4):
  `_isWaterTile(cell: WorldCell): boolean`
  `_isRampEligible(cell: WorldCell): boolean`
  `_rawCornerElevation(wg: WorldGrid, cornerCol: number, cornerRow: number, selfElevation: number): number`
  `_tileCornerLevels(wg: WorldGrid, col: number, row: number): [number, number, number, number]`
  `_lowCorners(levels: readonly [number, number, number, number], selfElevation: number): [boolean, boolean, boolean, boolean]`

These are tested indirectly through `buildTerrainGeometryData()`'s public behavior in this task
(no new exports needed yet — Task 4 is where they get wired into actual rendering, so this
task's tests exercise them via a small temporary exported wrapper, removed once Task 4 lands).

- [ ] **Step 1: Write the failing test**

Add to `tests/world/TerrainGeometryBuilder.test.ts` (near the top, after the existing imports):

```ts
import { _testOnlyTileCornerLevels } from '@/world/TerrainGeometryBuilder';
```

Append a new describe block:

```ts
describe('corner-height derivation for ramp classification', () => {
  it('gives all 4 corners the tile\'s own elevation when every neighbor matches', () => {
    const wg = new WorldGrid(3, 3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) wg.set(c, r, { elevation: 2 });
    const levels = _testOnlyTileCornerLevels(wg, 1, 1);
    expect(levels).toEqual([2, 2, 2, 2]);
  });

  it('pulls the shared corners down by exactly 1 level toward a lower west neighbor', () => {
    const wg = new WorldGrid(3, 3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) wg.set(c, r, { elevation: 2 });
    wg.set(0, 1, { elevation: 1 }); // west neighbor of tile (1,1)
    const [sw, nw, ne, se] = _testOnlyTileCornerLevels(wg, 1, 1);
    expect(sw).toBe(1);
    expect(nw).toBe(1);
    expect(ne).toBe(2);
    expect(se).toBe(2);
  });

  it('clamps a 2-level-lower neighbor to only 1 level of ramp (residual handled by walls, not ramp)', () => {
    const wg = new WorldGrid(3, 3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) wg.set(c, r, { elevation: 3 });
    wg.set(0, 1, { elevation: 1 }); // 2 levels lower than this tile's elevation 3
    const [sw] = _testOnlyTileCornerLevels(wg, 1, 1);
    expect(sw).toBe(2); // clamped to elevation-1, not the raw elevation 1
  });

  it('treats out-of-bounds neighbors as matching the tile\'s own elevation (no spurious edge-of-map ramp)', () => {
    const wg = new WorldGrid(2, 2);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) wg.set(c, r, { elevation: 4 });
    const levels = _testOnlyTileCornerLevels(wg, 0, 0); // corner tile, 2 of its corners touch OOB
    expect(levels).toEqual([4, 4, 4, 4]);
  });

  it('never lets a water-tile neighbor (ocean/river) pull a dry tile\'s corner down', () => {
    const wg = new WorldGrid(3, 3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) wg.set(c, r, { elevation: 3 });
    wg.set(0, 1, { elevation: 1, biome: 'ocean', waterDepth: 1 }); // lower AND water
    const levels = _testOnlyTileCornerLevels(wg, 1, 1);
    expect(levels).toEqual([3, 3, 3, 3]); // water neighbor ignored entirely
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "corner-height derivation"`
Expected: FAIL — `_testOnlyTileCornerLevels` is not exported from `TerrainGeometryBuilder.ts`.

- [ ] **Step 3: Write minimal implementation**

In `src/world/TerrainGeometryBuilder.ts`, update the top-of-file import to include `WorldCell`:

```ts
import type { WorldGrid, BiomeId, WorldCell } from './WorldGrid';
```

Add the following helpers directly after the `cornerHeightJitter` function (before
`export interface RoadVariantGeometry`):

```ts
/** True for any tile that should never participate in ramp geometry —
 *  neither as the tile being classified nor as a neighbor contributing to
 *  a corner — so shorelines/riverbanks keep today's exact flat-carved +
 *  vertical-wall look (ramps are a dry-land-only feature, see
 *  docs/superpowers/specs/2026-08-30-terrainkit-ramp-slopes-design.md §2). */
function _isWaterTile(cell: Pick<WorldCell, 'biome' | 'waterDepth'>): boolean {
  return cell.biome === 'deep_ocean' || cell.biome === 'ocean' || cell.waterDepth > 0;
}

/** Whether ramp classification should even be attempted for this tile. */
function _isRampEligible(cell: Pick<WorldCell, 'biome' | 'waterDepth'>): boolean {
  return !_isWaterTile(cell);
}

/**
 * Raw (unclamped) elevation for the grid corner at lattice point
 * (cornerCol, cornerRow) — the minimum elevation among the up-to-4 tiles
 * sharing that corner, matching cornerHeightJitter()'s existing lattice
 * convention (corner (c,r) is tile (c,r)'s SW corner, tile (c-1,r)'s SE
 * corner, tile (c,r-1)'s NW corner, tile (c-1,r-1)'s NE corner).
 * Out-of-bounds and water-tile contributors are excluded (substituted
 * with `selfElevation`) so map edges and shorelines never spuriously pull
 * a corner down.
 */
function _rawCornerElevation(
  wg: WorldGrid, cornerCol: number, cornerRow: number, selfElevation: number,
): number {
  let m = selfElevation;
  for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
    const c = cornerCol + dc, r = cornerRow + dr;
    if (c < 0 || c >= wg.width || r < 0 || r >= wg.height) continue;
    const cell = wg.get(c, r);
    if (_isWaterTile(cell)) continue;
    m = Math.min(m, cell.elevation);
  }
  return m;
}

/**
 * A tile's 4 corner elevation levels — `[sw, nw, ne, se]` — each clamped
 * to at most 1 level below the tile's own elevation (see design spec §3).
 */
function _tileCornerLevels(wg: WorldGrid, col: number, row: number): [number, number, number, number] {
  const selfElevation = wg.get(col, row).elevation;
  const clamp = (raw: number) => Math.max(selfElevation - 1, Math.min(selfElevation, raw));
  return [
    clamp(_rawCornerElevation(wg, col,     row,     selfElevation)), // SW
    clamp(_rawCornerElevation(wg, col,     row + 1, selfElevation)), // NW
    clamp(_rawCornerElevation(wg, col + 1, row + 1, selfElevation)), // NE
    clamp(_rawCornerElevation(wg, col + 1, row,     selfElevation)), // SE
  ];
}

/** Which of a tile's 4 corners are one level below its own elevation. */
function _lowCorners(
  levels: readonly [number, number, number, number], selfElevation: number,
): [boolean, boolean, boolean, boolean] {
  return [
    levels[0] < selfElevation,
    levels[1] < selfElevation,
    levels[2] < selfElevation,
    levels[3] < selfElevation,
  ];
}

/** Test-only export — exercises `_tileCornerLevels` directly. Removed once
 *  Task 4 wires these helpers into `buildTerrainGeometryData()` and adds
 *  end-to-end coverage through the public API instead. */
export function _testOnlyTileCornerLevels(wg: WorldGrid, col: number, row: number): [number, number, number, number] {
  return _tileCornerLevels(wg, col, row);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS — all existing tests plus the 5 new "corner-height derivation" tests (verify the
full file, not just the `-t` filter, to confirm zero regressions from the new import/helpers).

- [ ] **Step 5: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "feat: add per-tile corner-height derivation for ramp classification

_tileCornerLevels() computes a tile's 4 corner elevation levels from its
neighbors (min-of-4-surrounding-tiles rule, clamped to at most 1 level
below the tile's own elevation), excluding out-of-bounds and water-tile
contributors so map edges and shorelines are never affected. Not yet
wired into rendering (Task 4) — exposed via a temporary test-only export
for standalone coverage.

Part of the ramp/slope terrain plan:
docs/superpowers/plans/2026-08-30-terrainkit-ramp-slopes-plan.md"
```

---

### Task 4: Wire ramp top-face rendering into `buildTerrainGeometryData()`

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Test: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `classifyTileShape`, `orderCornersForDiagonal`, `triangleNormal`, `buildQuadFace`
  from `./TerrainKit` (Tasks 1-2); `_tileCornerLevels`, `_lowCorners`, `_isRampEligible` from
  Task 3 (now used directly, no longer only via the test-only wrapper).
- Produces: `buildTerrainGeometryData()`'s public signature is **unchanged** — this task only
  changes what happens inside the existing top-face code path.

- [ ] **Step 1: Write the failing test**

Remove the `_testOnlyTileCornerLevels` import line from `tests/world/TerrainGeometryBuilder.test.ts`
(added in Task 3 — no longer needed, replaced by end-to-end coverage below) and remove the
`_testOnlyTileCornerLevels` export from `src/world/TerrainGeometryBuilder.ts` (its job is now
done by the real integration below).

Add a new describe block to `tests/world/TerrainGeometryBuilder.test.ts`:

```ts
describe('buildTerrainGeometryData — ramp/slope top-face shapes', () => {
  function flatGrid(size: number, elevation: number): WorldGrid {
    const g = new WorldGrid(size, size);
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) g.set(c, r, { elevation });
    return g;
  }

  it('renders a flat tile identically to before (byte-for-byte position/normal match)', () => {
    const wg = flatGrid(3, 2);
    const data = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1);
    // Center tile (1,1): 4 positions, 6 indices, all normals exactly (0,1,0) — matches the
    // pre-existing "emits only top faces when all tiles are flat" test's expectations exactly.
    expect(data.positions.length).toBe(9 * 4 * 3); // 9 tiles x 4 verts x 3 floats
    for (let i = 0; i < data.normals.length; i += 3) {
      expect([data.normals[i], data.normals[i + 1], data.normals[i + 2]]).toEqual([0, 1, 0]);
    }
  });

  it('renders an Edge-shaped tile (one full side ramped down) as a tilted planar quad with no wall on the OTHER 3 sides', () => {
    const wg = flatGrid(3, 3);
    wg.set(0, 1, { elevation: 2 }); // west neighbor of tile (1,1), 1 level lower
    // Isolate tile (1,1)'s own contribution via the chunk sub-rectangle params
    // (colStart=1, rowStart=1, chunkW=1, chunkH=1) — scanning the WHOLE 3x3
    // buffer for "any tilted normal" would be a false-positive risk, since
    // OTHER tiles in the scene (e.g. tile (0,1) itself, bordering its own
    // now-different neighbors) already draw ordinary vertical WALL faces
    // whose normals also have ny=0, which a naive "ny < 0.999" scan would
    // wrongly count as "tilted". Isolating to exactly tile (1,1) avoids that.
    const data = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1, 1, 1, 1, 1);
    // Tile (1,1)'s west neighbor is 1 level lower (classifies 'edge', ramped
    // west side); its north/south/east neighbors all match its own elevation,
    // so — with Task 4 alone (walls not yet updated, that's Task 5) — the
    // OLD wall code still fires a west wall here (still comparing the flat
    // `wy`, not yet aware of the ramp) and no other walls. Expected
    // contribution: 1 top face (planar Edge quad, 4 verts) + 1 west wall (4
    // verts) = 8 vertices = 24 normal floats total.
    expect(data.normals).toHaveLength(24);
    // The top face's normal (first of the 4 verts) must be genuinely tilted
    // — not exactly (0,1,0) — confirming Task 4's real slope, while still
    // mostly upward-facing (not vertical like a wall).
    const topFaceNy = data.normals[1]!;
    expect(topFaceNy).toBeLessThan(0.999);
    expect(topFaceNy).toBeGreaterThan(0);
  });

  it('renders a Single-corner-shaped tile as 2 explicit triangles with different normals', () => {
    const wg = flatGrid(4, 3);
    // Lower only the SW-diagonal neighbor (0,0) relative to tile (1,1), leaving the
    // orthogonal neighbors (1,0) and (0,1) at the same level — only the NE corner
    // of tile (1,1) sees a lower contributor, isolating a single-corner dip.
    // (NE corner of tile(1,1) is lattice (2,2), contributed to by tiles (1,1),(2,1),(1,2),(2,2).)
    wg.set(2, 2, { elevation: 2 });
    // Isolate tile (1,1) via the chunk sub-rectangle params — its 4 orthogonal
    // neighbors (0,1),(2,1),(1,0),(1,2) all still match its own elevation 3,
    // so no wall faces trigger at all; the buffer contains EXACTLY the top
    // face's geometry, avoiding any risk of an unrelated wall/flat-tile
    // normal elsewhere in a wider scan being mistaken for the ramp's own.
    const data = buildTerrainGeometryData(wg, 4, 4, 1, 1, 2, 1, 1, 1, 1, 1);
    expect(data.normals).toHaveLength(18); // 2 triangles x 3 verts x 3 floats — the non-planar path
    const tri1Normal = [data.normals[0], data.normals[1], data.normals[2]];
    const tri2Normal = [data.normals[9], data.normals[10], data.normals[11]];
    expect(tri1Normal).not.toEqual(tri2Normal);
  });

  it('falls back to flat-plus-wall (today\'s exact behavior) for the degenerate all-four-down case', () => {
    // Reuses the existing "emits 4 wall faces around a single raised tile" scenario —
    // tile 1 in a 1-row grid, both orthogonal neighbors 2 levels lower, and (with
    // height=1) the north/south neighbors are out-of-bounds, substituted as this
    // tile's own elevation — so tile 1 classifies as all-four-down and must render
    // exactly like before: flat top face, full walls on both sides.
    const wg = new WorldGrid(3, 1);
    wg.set(1, 0, { elevation: 2 });
    const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);
    expect(data.positions).toHaveLength(84); // unchanged from the pre-existing test's expectation
    expect(data.indices).toHaveLength(42);
    const normalSet = new Set<string>();
    for (let i = 0; i < data.normals.length; i += 3) {
      normalSet.add(`${data.normals[i]},${data.normals[i + 1]},${data.normals[i + 2]}`);
    }
    expect(normalSet).toEqual(new Set(['0,1,0', '0,0,1', '0,0,-1', '1,0,0', '-1,0,0']));
  });

  it('never ramps a dry tile toward an adjacent water tile (shoreline stays exactly as before)', () => {
    const wg = new WorldGrid(3, 3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) wg.set(c, r, { elevation: 2 });
    wg.set(0, 1, { elevation: 1, biome: 'ocean', waterDepth: 1 }); // lower AND water, west of (1,1)
    const data = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1);
    // A real vertical wall face DOES still exist here (tile (1,1) dropping
    // into the carved water) — that's correct, unchanged, pre-existing
    // behavior, not a regression. What must NOT exist is a "partial ramp
    // tilt" normal — every normal must be either a flat top face
    // (ny ~ 1) or a fully-vertical wall (ny ~ 0), never a value strictly
    // between the two, which would indicate a dry tile incorrectly ramping
    // toward the water boundary instead of keeping today's clean
    // vertical-wall-into-water look.
    for (let i = 0; i < data.normals.length; i += 3) {
      const ny = data.normals[i + 1]!;
      const isFlat = Math.abs(ny - 1) < 0.01;
      const isWall = Math.abs(ny) < 0.01;
      expect(isFlat || isWall, `unexpected partial-tilt normal ny=${ny}`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: FAIL on the new "Edge-shaped"/"Single-corner-shaped" tests (current code always emits
a flat quad with hardcoded `(0,1,0)` normal, so no tilted/differing normals ever appear) — the
"flat tile identically" and "all-four-down" and "never ramps toward water" tests should already
PASS even before Task 4's change (since today's code already renders those scenarios correctly
by coincidence — confirm this, don't worry if they pass early).

- [ ] **Step 3: Write minimal implementation**

In `src/world/TerrainGeometryBuilder.ts`, add the import at the top:

```ts
import { classifyTileShape, orderCornersForDiagonal, triangleNormal, buildQuadFace } from './TerrainKit';
```

Remove the `_testOnlyTileCornerLevels` export added in Task 3 (its job is now done by real
integration below):

```ts
// DELETE this function (was only needed for Task 3's standalone test coverage):
// export function _testOnlyTileCornerLevels(wg: WorldGrid, col: number, row: number): [number, number, number, number] {
//   return _tileCornerLevels(wg, col, row);
// }
```

Replace the existing "TOP face" block (everything from `// ── TOP face (normal +Y) ──` through
the closing `} else { addFace(...) }` that currently handles the non-road-coverage case) with:

```ts
      // ── TOP face (normal +Y) ─────────────────────────────────────────
      // Small per-corner jitter added on top of the flat elevation height gives the
      // ground an organic, non-uniform look while keeping wall faces (collision-critical)
      // perfectly flat. Corner coordinates are grid-lattice points shared by neighbouring
      // tiles, so adjacent tiles' shared edges/corners always agree (no seams).
      const jSW = cornerHeightJitter(col,     row);
      const jNW = cornerHeightJitter(col,     row + 1);
      const jNE = cornerHeightJitter(col + 1, row + 1);
      const jSE = cornerHeightJitter(col + 1, row);

      // Ramp classification (see docs/superpowers/specs/2026-08-30-terrainkit-ramp-slopes-design.md):
      // a dry tile's 4 corners derive from its real neighbors' elevation levels
      // (clamped to at most 1 level of slope); water tiles are never ramp-eligible,
      // so shorelines/riverbanks are completely unaffected by this block.
      const rampEligible = _isRampEligible(cell);
      const cornerLevels = rampEligible ? _tileCornerLevels(wg, col, row) : [H, H, H, H] as const;
      const lowCorners = rampEligible ? _lowCorners(cornerLevels, H) : [false, false, false, false] as const;
      const { shape, diagonal } = classifyTileShape(lowCorners);

      // Raw (pre-jitter) ramp corner Y offsets from this tile's own `wy` — always 0 for
      // flat/all-four-down/non-ramp-eligible tiles (byte-identical to pre-ramp behavior),
      // exactly (H - level) * SH (0 or SH) for genuinely ramped shapes. Computed once here
      // so both the top face below AND the wall blocks further down can share it.
      const rampDrop = (level: number): number =>
        (!rampEligible || shape === 'flat' || shape === 'all-four-down') ? 0 : (H - level) * SH;
      const swY = wy - rampDrop(cornerLevels[0]);
      const nwY = wy - rampDrop(cornerLevels[1]);
      const neY = wy - rampDrop(cornerLevels[2]);
      const seY = wy - rampDrop(cornerLevels[3]);

      // Road sub-tile surface: only attempted for tiles already flagged as
      // carrying a road, and only when the caller actually supplied path
      // data. `computeTileRoadCoverage()` can legitimately return "no
      // coverage" even for a road-flagged tile (e.g. path data that's
      // incomplete or doesn't quite reach this tile) — in that case we fall
      // through to the exact same single-quad behavior as before, so a gap
      // in the input data never produces a visible hole in the terrain.
      //
      // `river_ford` tiles (a road/A* path crossing a river, re-tagged by
      // WorldGenerator.applyRoadFords() per RI-3) get the same sub-tile
      // treatment as an ordinary road so the crossing renders as a real
      // bridge deck instead of a plain colored ground quad — see the
      // BRIDGE_ROAD_VARIANT override just below. Road sub-tiles never get
      // ramp geometry (deferred non-goal — see design spec §2), always
      // using the flat `wy` + jitter exactly as before.
      const isRoadTile = cell.feature === 'road' || cell.feature === 'road_dirt' || cell.feature === 'river_ford';
      const rawCoverage = (isRoadTile && roadPaths.length > 0)
        ? computeTileRoadCoverage(roadPaths, wx, wz, T, roadSubdivisions)
        : null;
      const coverage = (rawCoverage && cell.feature === 'river_ford')
        ? rawCoverage.map(v => (v === null ? null : BRIDGE_ROAD_VARIANT))
        : rawCoverage;
      const hasRoadCoverage = coverage !== null && coverage.some(vnt => vnt !== null);

      if (hasRoadCoverage) {
        // Bilinearly interpolate the tile's 4 corner jitters across the
        // sub-tile grid — keeps the same organic-but-seamless look as the
        // un-subdivided case (adjacent tiles' shared corners still match
        // exactly, since we're interpolating from the identical jitter
        // values they'd compute too) without needing per-sub-tile jitter.
        const heightAt = (u: number, w: number): number =>
          jSW * (1 - u) * (1 - w) + jSE * u * (1 - w) + jNW * (1 - u) * w + jNE * u * w;

        for (let sz = 0; sz < roadSubdivisions; sz++) {
          for (let sx = 0; sx < roadSubdivisions; sx++) {
            const variant = coverage![sz * roadSubdivisions + sx];
            const u0 = sx / roadSubdivisions, u1 = (sx + 1) / roadSubdivisions;
            const w0 = sz / roadSubdivisions, w1 = (sz + 1) / roadSubdivisions;
            const px0 = wx + u0 * T, px1 = wx + u1 * T;
            const pz0 = wz + w0 * T, pz1 = wz + w1 * T;
            const ySW = wy + heightAt(u0, w0), yNW = wy + heightAt(u0, w1);
            const yNE = wy + heightAt(u1, w1), ySE = wy + heightAt(u1, w0);
            if (variant === null) {
              addFace(
                [px0, ySW, pz0], [px0, yNW, pz1], [px1, yNE, pz1], [px1, ySE, pz0],
                0, 1, 0,  tr, tg, tb,
              );
            } else {
              addRoadFace(
                variant,
                [px0, ySW, pz0], [px0, yNW, pz1], [px1, yNE, pz1], [px1, ySE, pz0],
                0, 1, 0,
              );
            }
          }
        }
      } else if (shape === 'flat' || shape === 'all-four-down' || !rampEligible) {
        // Identical to pre-ramp behavior: jitter-only positions, fixed up-normal.
        addFace(
          [wx, wy + jSW, wz], [wx, wy + jNW, wz1], [wx1, wy + jNE, wz1], [wx1, wy + jSE, wz],
          0, 1, 0,  tr, tg, tb,
        );
      } else if (shape === 'edge') {
        // Genuinely tilted but still planar — cheap 4-vertex/1-normal path
        // with a REAL computed normal (an Edge ramp really is sloped).
        const corners = {
          sw: [wx,  swY + jSW, wz]  as [number, number, number],
          nw: [wx,  nwY + jNW, wz1] as [number, number, number],
          ne: [wx1, neY + jNE, wz1] as [number, number, number],
          se: [wx1, seY + jSE, wz]  as [number, number, number],
        };
        const [v0, v1, v2, v3] = orderCornersForDiagonal(corners, diagonal);
        const n = triangleNormal(v0, v1, v2);
        addFace(v0, v1, v2, v3, n[0], n[1], n[2], tr, tg, tb);
      } else {
        // single-corner / outer-corner / saddle: non-planar, 2 explicit
        // triangles with independently-computed per-triangle normals.
        const corners = {
          sw: [wx,  swY + jSW, wz]  as [number, number, number],
          nw: [wx,  nwY + jNW, wz1] as [number, number, number],
          ne: [wx1, neY + jNE, wz1] as [number, number, number],
          se: [wx1, seY + jSE, wz]  as [number, number, number],
        };
        const { positions: rampPos, normals: rampNrm } = buildQuadFace(corners, diagonal);
        const base = pos.length / 3;
        pos.push(...rampPos);
        nrm.push(...rampNrm);
        for (let i = 0; i < 6; i++) clr.push(tr, tg, tb);
        idx.push(base, base + 1, base + 2, base + 3, base + 4, base + 5);
      }
```

Leave the 4 wall blocks (`// ── SOUTH wall`, `NORTH wall`, `EAST wall`, `WEST wall`) exactly as
they are for this task — Task 5 updates them.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS — every test in the file, including all pre-existing tests (flat-terrain,
sand-biome, water-depth-carving, road-sub-tile, chunk-sub-rectangle, bridge-deck) plus the 5 new
ramp-shape tests. If the pre-existing "emits 4 wall faces around a single raised tile" test or
any other pre-existing test fails, STOP and investigate — this task must not change any
existing test's outcome.

- [ ] **Step 5: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "feat: render ramp/slope top faces via TerrainKit classification

buildTerrainGeometryData()'s top-face block now classifies each dry
tile's 4 corners via TerrainKit.classifyTileShape() and renders the
correct shape: flat/all-four-down/water-ineligible tiles keep today's
exact cheap 4-vertex path; Edge ramps use the same cheap path with a
real computed (tilted) normal; Single-corner/Outer-corner/Saddle ramps
use TerrainKit.buildQuadFace()'s explicit 2-triangle geometry with
independently-computed per-triangle normals. Wall faces are unchanged
in this task (Task 5) — a ramp that already reaches its lower neighbor
may still show a redundant wall until then, a known, deliberately
sequenced intermediate state.

Part of the ramp/slope terrain plan:
docs/superpowers/plans/2026-08-30-terrainkit-ramp-slopes-plan.md"
```

---

### Task 5: Anchor wall faces to ramped corner heights

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Test: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `swY`, `nwY`, `neY`, `seY` (computed in Task 4, now also read by the wall blocks
  below — no new function signatures, purely a change to which Y value each wall's top edge uses).

- [ ] **Step 1: Write the failing test**

Add to `tests/world/TerrainGeometryBuilder.test.ts`, inside the "ramp/slope top-face shapes"
describe block from Task 4:

```ts
  it('suppresses the wall on the ramped side once the ramp itself reaches exactly down to the lower neighbor', () => {
    const isolated = new WorldGrid(2, 1);
    isolated.set(0, 0, { elevation: 3 });
    isolated.set(1, 0, { elevation: 2 }); // tile 1 is exactly 1 level lower, directly east of tile 0
    const data = buildTerrainGeometryData(isolated, 2, 1, 1, 0, 2, 1);
    // Tile 0 (elevation 3) has an EAST-adjacent edge ramp toward tile 1 (elevation 2) —
    // with a 1-row grid, north/south are out-of-bounds (treated as self, no ramp
    // there), so tile 0 classifies as 'edge' (its NE+SE corners clamp to exactly
    // tile 1's own elevation). The east wall must be fully suppressed since the
    // ramp already reaches exactly down to tile 1's height — no gap remains.
    const eastWallNormalPresent = (() => {
      for (let i = 0; i < data.normals.length; i += 3) {
        const nx = data.normals[i]!, ny = data.normals[i + 1]!, nz = data.normals[i + 2]!;
        if (Math.abs(nx - 1) < 0.01 && Math.abs(ny) < 0.01 && Math.abs(nz) < 0.01) return true;
      }
      return false;
    })();
    expect(eastWallNormalPresent).toBe(false);
  });

  it('still draws a residual wall for the rare 2-level-jump case, anchored to the clamped ramp height not the old flat height', () => {
    const isolated = new WorldGrid(2, 1);
    isolated.set(0, 0, { elevation: 3 });
    isolated.set(1, 0, { elevation: 1 }); // 2 levels lower — ramp only covers 1 level, residual wall for the rest
    const data = buildTerrainGeometryData(isolated, 2, 1, 1, 0, 2, 1);
    let eastWallTopY = -Infinity;
    for (let i = 0; i < data.normals.length; i += 3) {
      const nx = data.normals[i]!, ny = data.normals[i + 1]!, nz = data.normals[i + 2]!;
      if (Math.abs(nx - 1) < 0.01 && Math.abs(ny) < 0.01 && Math.abs(nz) < 0.01) {
        eastWallTopY = Math.max(eastWallTopY, data.positions[i + 1]!); // Y component of this same vertex
      }
    }
    expect(eastWallTopY).toBeGreaterThan(-Infinity); // residual wall is present
    // SH=1 here (buildTerrainGeometryData's SH parameter) — elevation 3 tile ramped
    // down 1 level = physical height 2, strictly less than the old flat height of 3
    // (the wall's top now starts where the ramp's own corner already reached, not
    // at the tile's original flat elevation).
    expect(eastWallTopY).toBeLessThan(3);
    expect(eastWallTopY).toBeCloseTo(2, 5);
  });

  it('the pre-existing all-four-down wall test still produces exactly 4 full walls (unaffected by the anchor change)', () => {
    const wg = new WorldGrid(3, 1);
    wg.set(1, 0, { elevation: 2 });
    const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);
    expect(data.positions).toHaveLength(84);
    expect(data.indices).toHaveLength(42);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "wall"`
Expected: FAIL on "suppresses the wall" and "residual wall" tests (current wall code still
unconditionally compares against the flat `wy`, so a wall is drawn even where the ramp already
reaches the neighbor, and the residual wall's top is still the old flat height, not the clamped
ramp height). The "all-four-down" test should already pass.

- [ ] **Step 3: Write minimal implementation**

In `src/world/TerrainGeometryBuilder.ts`, replace the 4 wall blocks (SOUTH/NORTH/EAST/WEST) with:

```ts
      // ── SOUTH wall (+Z face, at wz1) ─────────────────────────────────
      // Wall faces compare *physical* (carved) height, not raw elevation
      // level, so a land tile next to a carved river/ocean tile grows a
      // wall down into the basin — a real riverbank/shore lip — with no
      // extra logic. Anchored to this tile's own NW/NE ramp corners
      // (Task 4) rather than the flat `wy`, so a ramp that already
      // reaches down to a lower neighbor doesn't leave a redundant wall —
      // see docs/superpowers/specs/2026-08-30-terrainkit-ramp-slopes-design.md §5.
      const wallTopS = Math.min(nwY, neY);
      const wyS = physH(col, row + 1);
      if (wyS < wallTopS) {
        const d = 0.76;
        addFace(
          [wx1, wallTopS, wz1], [wx, wallTopS, wz1], [wx, wyS, wz1], [wx1, wyS, wz1],
          0, 0, 1,  tr * d, tg * d, tb * d,
        );
      }

      // ── NORTH wall (−Z face, at wz) ──────────────────────────────────
      const wallTopN = Math.min(swY, seY);
      const wyN = physH(col, row - 1);
      if (wyN < wallTopN) {
        const d = 0.50;
        addFace(
          [wx, wallTopN, wz], [wx1, wallTopN, wz], [wx1, wyN, wz], [wx, wyN, wz],
          0, 0, -1,  tr * d, tg * d, tb * d,
        );
      }

      // ── EAST wall (+X face, at wx1) ──────────────────────────────────
      const wallTopE = Math.min(neY, seY);
      const wyE = physH(col + 1, row);
      if (wyE < wallTopE) {
        const d = 0.63;
        addFace(
          [wx1, wallTopE, wz], [wx1, wallTopE, wz1], [wx1, wyE, wz1], [wx1, wyE, wz],
          1, 0, 0,  tr * d, tg * d, tb * d,
        );
      }

      // ── WEST wall (−X face, at wx) ───────────────────────────────────
      const wallTopW = Math.min(swY, nwY);
      const wyW = physH(col - 1, row);
      if (wyW < wallTopW) {
        const d = 0.55;
        addFace(
          [wx, wallTopW, wz1], [wx, wallTopW, wz], [wx, wyW, wz], [wx, wyW, wz1],
          -1, 0, 0,  tr * d, tg * d, tb * d,
        );
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS — every test in the file (all pre-existing tests, all Task 4 ramp tests, all
Task 5 wall tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "fix: anchor terrain wall faces to ramped corner heights

Each of the 4 wall blocks now anchors its top edge to
min(the tile's own 2 corner heights on that side) instead of the flat
tile height, so a ramp that already reaches down to a lower neighbor
(the common single-level-step case) no longer draws a redundant wall
underneath/behind the new sloped surface. The rare 2-level-jump case
still draws a correctly-anchored residual wall for the remaining drop.
Flat and all-four-down tiles are unaffected (their corners are always
uniform, matching today's exact wall behavior).

Part of the ramp/slope terrain plan:
docs/superpowers/plans/2026-08-30-terrainkit-ramp-slopes-plan.md"
```

---

### Task 6: Full verification, perf benchmark, and live visual check

**Files:** none created/modified — verification only.

- [ ] **Step 1: Run the full targeted test sweep**

```bash
npx vitest run tests/world/TerrainKit.test.ts tests/world/TerrainGeometryBuilder.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 2: Run `tsc --noEmit` and confirm the baseline error count is unchanged**

```bash
npx tsc --noEmit 2>&1 | wc -l
```

Expected: same count as the pre-existing baseline (145 errors, per this session's established
tracking — confirm by checking the count matches what was measured before Task 1 started; if it
differs, investigate every new/changed error before proceeding).

- [ ] **Step 3: Run the broad `tests/world/` + `tests/scene/` regression sweep**

```bash
npx vitest run tests/world/ tests/scene/
```

Expected: only the documented pre-existing failures (`WaterMaterial.test.ts`'s alpha-threshold
test, plus any others already known from this session's baseline) — zero NEW failures.

- [ ] **Step 4: Run the full project test suite**

```bash
npx vitest run
```

Expected: the same pre-existing baseline failure set (12 failures as of this plan's writing —
`main.startup.smoke.test.ts` x3, `enemyLoader.test.ts` x3, `towerGenerator.test.ts` x2,
`talentSystem.test.ts` x3, `WaterMaterial.test.ts` x1) — zero new failures, and MORE total
passing tests than before (the new TerrainKit/TerrainGeometryBuilder tests added).

- [ ] **Step 5: Perf benchmark — chunk-build time at `worldSize: 512`**

Create a temporary (not committed) benchmark script to compare before/after chunk-build time:

```bash
cat > /tmp/terrainkit_perf_bench.mjs << 'EOF'
import { buildWorldData } from './src/world/WorldGenerator.ts';
import { buildTerrainGeometryData } from './src/world/TerrainGeometryBuilder.ts';
import { DEFAULT_WORLD_GEN_CONFIG } from './src/world/WorldGenConfig.ts';

const wd = buildWorldData(42, { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 512 });
const CHUNK = 16;
const T = 2, SH = 0.55;
const GW = wd.grid.width, GH = wd.grid.height, GHW = GW / 2, GHH = GH / 2;

// Warm up, then time 20 chunk builds at varied offsets.
for (let i = 0; i < 5; i++) buildTerrainGeometryData(wd.grid, GW, GH, GHW, GHH, T, SH, 0, 0, CHUNK, CHUNK);
const N = 20;
const start = performance.now();
for (let i = 0; i < N; i++) {
  const cs = (i * 37) % (GW - CHUNK);
  buildTerrainGeometryData(wd.grid, GW, GH, GHW, GHH, T, SH, cs, cs, CHUNK, CHUNK);
}
const elapsed = performance.now() - start;
console.log(`avg chunk-build time: ${(elapsed / N).toFixed(3)}ms over ${N} chunks`);
EOF
npx tsx /tmp/terrainkit_perf_bench.mjs
rm -f /tmp/terrainkit_perf_bench.mjs
```

Expected: report the average time; compare informally against a `git stash` run of the same
script against the pre-Task-1 commit if the reported time looks concerning (no hard numeric gate
— per design spec §8, the expectation is the increase scales with existing wall-face count, not
total tile count, since ramps only replace boundary geometry).

- [ ] **Step 6: Live Overworld Lab visual verification**

With the dev server running (`npm run dev` or already running on its usual port), use a
Playwright script (matching this session's established pattern) to:
1. Boot the game directly (`window.__game.startGame(seed)` then `switchToExterior()`).
2. Use `window.__game.getSettlements()` or scan for a hill/mountain-biome area, teleport there.
3. Take a screenshot and visually confirm sloped terrain (no vertical staircase cliffs) is
   visible where elevation changes.
4. Confirm no new console errors.

If any live-verification browser session hangs or times out due to sandbox resource contention
(a known issue in this environment), fall back to the automated test suite's coverage as
sufficient evidence and note this in the completion summary rather than blocking indefinitely.

- [ ] **Step 7: Update the parent roadmap doc**

In `docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md`, find the Phase 2 status block
(the `> **Status: 🟡 Partially DONE...**` note) and the line reading:

```
- [ ] New `src/world/TerrainKit.ts` (naming mirrors `BlockKit.ts`): given a
```

Change the Phase 2 status header from "🟡 Partially DONE" to "✅ DONE" and add a new status
paragraph immediately after the existing "Follow-up shipped (2026-08-30): bridges over water"
paragraph, summarizing what shipped: `TerrainKit.ts`'s shape classifier (flat/single-corner/
edge/saddle/outer-corner/all-four-down), the corner-height derivation rule, wall-anchoring
change, test counts, and confirmation that `tsc`/full-suite baselines are unchanged. Also check
off the "Both the visual mesh AND the Rapier collider must be rebuilt from the same ramp
geometry" task item and the corresponding "New `src/world/TerrainKit.ts`" task item in the
existing task checklist (leave sub-tile subdivision and `WaterDetection.ts` ramping items
unchecked — still deferred non-goals per this plan's scope).

- [ ] **Step 8: Commit the roadmap doc update**

```bash
git add docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md
git commit -m "docs: mark Phase 2's ramp/slope terrain item DONE

TerrainKit.ts shipped: corner-height-derived shape classification
(flat/single-corner/edge/saddle/outer-corner + all-four-down fallback)
replaces vertical-wall elevation transitions with real sloped ramps for
dry land, walls anchored to ramped corner heights to avoid redundant
geometry. Sub-tile subdivision and water/riverbank ramping remain
explicitly deferred non-goals."
```

- [ ] **Step 9: Push to `main` for live testing**

```bash
git push origin HEAD:main
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** §3 (corner-height derivation) → Task 3. §4 (shape taxonomy) → Task 1. §5
  (module boundary, walls, collider) → Tasks 2, 4, 5 (collider needs no code change at all,
  since it's derived from the exact same `positions`/`indices` buffers `buildTerrainGeometryData()`
  already returns — no separate task needed, confirmed by inspecting
  `OverworldScene.ts`'s existing collider-construction call site, which is untouched by this plan).
  §7 (testing strategy) → Tasks 1-5's own test steps plus Task 6's regression sweep. §8 (perf) →
  Task 6 Step 5. §9 (rollout) → Task 6 overall.
- **Placeholder scan:** no TBD/TODO in any step; every code block is complete and runnable as
  written.
- **Type consistency:** `RampShape`/`Diagonal`/`RampClassification` (Task 1) are reused verbatim
  by `orderCornersForDiagonal`/`buildQuadFace` (Task 2) and by `TerrainGeometryBuilder.ts`'s
  integration (Task 4) — no renaming drift. `_tileCornerLevels`/`_lowCorners`/`_isRampEligible`
  (Task 3) are consumed with identical names in Task 4's integration.
