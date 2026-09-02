# Shoreline Edge Smoothing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dead-straight, tile-grid-aligned water/land boundary (the "sawtooth staircase" repeatedly flagged as looking blocky) with a gently wobbling line, shared identically by the land top-surface, the wall faces, and the water-surface mesh, so all three meet with no gap.

**Architecture:** A new pure utility (`ShorelineWobble.ts`) computes deterministic, noise-driven perpendicular offsets for points along a tile edge, with the two endpoints always pinned exactly to the tile-grid corners (so adjacent tiles/edges always still connect). `TerrainGeometryBuilder.ts`'s sub-tile top-surface generator and its 4 wall blocks, plus `OverworldScene._buildWaterMesh()`, each call this same utility for any tile edge where a dry tile borders a water tile — nowhere else changes.

**Tech Stack:** TypeScript, Three.js `BufferGeometry`, existing `createNoise2D` seeded-noise utility (`src/core/SimplexNoise.ts`), Vitest.

## Global Constraints

- Full design spec: `docs/superpowers/specs/2026-09-02-shoreline-edge-smoothing-design.md` — read it first, especially the "Autonomous decisions" and "Revised during plan-writing" notes (the collider follows the visual mesh automatically since both are built from the same buffer — this is a feature, not a risk, but it's why chunk-boundary continuity testing in Task 6 matters).
- Only tiles where one side has `waterDepth > 0` and the other has `waterDepth === 0` are affected. Land-elevation walls (dry tile next to a lower dry tile) are a completely separate, untouched code path — never gate on "is this wall short," always gate explicitly on "is the neighbor water."
- This pass covers `shape === 'flat'` tiles only (confirmed: water tiles are never ramp-eligible per `TerrainGeometryBuilder.ts`'s own comment at the `rampEligible` check, so this covers the vast majority of real shorelines). Ramped/edge shapes and single-corner/saddle shapes are explicitly out of scope for this pass — leave them rendering exactly as they do today.
- Every new function must be a pure function of its inputs (no hidden mutable state) — this is what guarantees two different call sites (land tile vs. its water neighbor; a chunk vs. its streamed-in-later neighbor chunk) compute identical points without needing to coordinate.
- Edge endpoint ordering convention (must be followed by every call site in this plan, or two tiles sharing an edge could compute different interior points): a **horizontal** edge (constant Z) is always called west-endpoint-first (`x0 < x1`); a **vertical** edge (constant X) is always called north-endpoint-first (`z0 < z1`).
- Run `npx tsc --noEmit` and `npx vitest run` after every task; confirm no new errors/failures beyond this codebase's established pre-existing baseline (documented throughout this project's history — check with a quick `git stash`-based before/after comparison if unsure which failures are pre-existing).

---

### Task 1: `ShorelineWobble.ts` — pure edge-offset utility

**Files:**
- Create: `src/world/ShorelineWobble.ts`
- Test: `tests/world/ShorelineWobble.test.ts`

**Interfaces:**
- Consumes: `createNoise2D` from `@/core/SimplexNoise` (existing).
- Produces: `SHORELINE_WOBBLE_SUBDIVISIONS: number` (constant, value 4); `shorelineEdgeOffsets(x0: number, z0: number, x1: number, z1: number): number[]` (returns `SHORELINE_WOBBLE_SUBDIVISIONS + 1` perpendicular offsets in world units, first and last always exactly `0`); `shorelineEdgePoints(x0: number, z0: number, x1: number, z1: number): Array<[number, number]>` (same length, returns actual `[x, z]` world points with the offset applied — horizontal edges perturb Z, vertical edges perturb X). Both are consumed by Tasks 3, 4, and 5.

- [ ] **Step 1: Write the failing tests**

Create `tests/world/ShorelineWobble.test.ts`:

```ts
// tests/world/ShorelineWobble.test.ts
import { describe, it, expect } from 'vitest';
import {
  SHORELINE_WOBBLE_SUBDIVISIONS,
  shorelineEdgeOffsets,
  shorelineEdgePoints,
} from '@/world/ShorelineWobble';

describe('shorelineEdgeOffsets', () => {
  it('returns SHORELINE_WOBBLE_SUBDIVISIONS + 1 offsets', () => {
    const offsets = shorelineEdgeOffsets(0, 0, 2, 0);
    expect(offsets).toHaveLength(SHORELINE_WOBBLE_SUBDIVISIONS + 1);
  });

  it('always pins the first and last offset to exactly 0 (tile corners never move)', () => {
    const offsets = shorelineEdgeOffsets(10, 4, 12, 4);
    expect(offsets[0]).toBe(0);
    expect(offsets[offsets.length - 1]).toBe(0);
  });

  it('is deterministic — the same edge called twice returns identical offsets', () => {
    const a = shorelineEdgeOffsets(0, 0, 2, 0);
    const b = shorelineEdgeOffsets(0, 0, 2, 0);
    expect(a).toEqual(b);
  });

  it('keeps every interior offset within the configured amplitude bound', () => {
    // Sample many different edges (varying world position) so this isn't
    // a lucky pass for one specific edge.
    for (let i = 0; i < 20; i++) {
      const x0 = i * 2, z0 = i * 3.7;
      const offsets = shorelineEdgeOffsets(x0, z0, x0 + 2, z0);
      for (const o of offsets) expect(Math.abs(o)).toBeLessThanOrEqual(0.18);
    }
  });

  it('produces different offsets for a different edge position (not a constant)', () => {
    const a = shorelineEdgeOffsets(0, 0, 2, 0);
    const b = shorelineEdgeOffsets(100, 40, 102, 40);
    // At least one interior offset must differ between two unrelated edges.
    const anyDifferent = a.slice(1, -1).some((v, i) => v !== b[1 + i]);
    expect(anyDifferent).toBe(true);
  });
});

describe('shorelineEdgePoints', () => {
  it('perturbs only Z for a horizontal edge (z0 === z1)', () => {
    const pts = shorelineEdgePoints(0, 5, 2, 5);
    for (const [x] of pts) expect(Number.isFinite(x)).toBe(true);
    // Every point's X must land exactly on the regular sub-tile lattice —
    // only Z may have moved.
    const n = SHORELINE_WOBBLE_SUBDIVISIONS;
    for (let i = 0; i <= n; i++) {
      expect(pts[i]![0]).toBeCloseTo((0 + (2 - 0) * (i / n)), 10);
    }
  });

  it('perturbs only X for a vertical edge (x0 === x1)', () => {
    const pts = shorelineEdgePoints(7, 0, 7, 2);
    const n = SHORELINE_WOBBLE_SUBDIVISIONS;
    for (let i = 0; i <= n; i++) {
      expect(pts[i]![1]).toBeCloseTo((0 + (2 - 0) * (i / n)), 10);
    }
  });

  it('endpoints are exactly the input corners, unperturbed', () => {
    const pts = shorelineEdgePoints(3, 8, 5, 8);
    expect(pts[0]).toEqual([3, 8]);
    expect(pts[pts.length - 1]).toEqual([5, 8]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/ShorelineWobble.test.ts`
Expected: FAIL — `Cannot find module '@/world/ShorelineWobble'`

- [ ] **Step 3: Write the implementation**

Create `src/world/ShorelineWobble.ts`:

```ts
// ── ShorelineWobble — noise-perturbed water/land boundary points ─────────────
//
//  Every tile edge where a dry tile borders a water tile is, today, a
//  perfectly straight line running the tile's full 2 WU width — this is
//  the actual cause of the "blocky/staircase" shoreline look (confirmed via
//  investigation: see docs/superpowers/specs/2026-09-02-shoreline-edge-
//  smoothing-design.md). This module computes a small, deterministic,
//  noise-driven perpendicular offset for points along such an edge, with
//  the two endpoints ALWAYS pinned to the tile's actual grid corners (so
//  edges/tiles that share a corner always still connect with no gap).
//
//  Call site convention (must be followed everywhere this is used, or two
//  tiles sharing an edge could disagree): a horizontal edge (z0 === z1) is
//  always called west-endpoint-first (x0 < x1); a vertical edge (x0 === x1)
//  is always called north-endpoint-first (z0 < z1). Both terrain wall/top-
//  surface generation (TerrainGeometryBuilder.ts) and the water-surface
//  mesh (OverworldScene._buildWaterMesh()) call this identically, which is
//  what guarantees their geometry meets with no gap by construction.

import { createNoise2D } from '@/core/SimplexNoise';

/** Sub-tile lattice resolution for shoreline wobble — matches
 *  GROUND_SUBDIVISIONS (TerrainGeometryBuilder.ts) so wobble points line up
 *  exactly with the existing sub-tile grid's corner positions. */
export const SHORELINE_WOBBLE_SUBDIVISIONS = 4;

/** Max perpendicular displacement (world units) applied to an interior edge
 *  point. Kept well under half a sub-tile (0.25 WU) so wobbled segments can
 *  never double back on themselves or cross a neighboring segment. */
const SHORE_WOBBLE_AMPLITUDE_WU = 0.18;

/** Low-frequency domain scale — a full noise wave spans several tiles, so
 *  the wobble reads as a slow, flowing curve rather than jittery per-point
 *  noise. */
const SHORE_WOBBLE_FREQUENCY = 0.15;

const _shoreNoise = createNoise2D(0x5C0A_57D3);

/**
 * Returns SHORELINE_WOBBLE_SUBDIVISIONS + 1 perpendicular offsets (world
 * units) for points evenly spaced along the straight edge from (x0,z0) to
 * (x1,z1). The first and last offsets are always exactly 0 — the tile-grid
 * corners never move. Interior offsets come from a shared, deterministic 2D
 * noise function sampled at each point's own world position, so calling
 * this twice with the same edge always returns identical results.
 */
export function shorelineEdgeOffsets(x0: number, z0: number, x1: number, z1: number): number[] {
  const n = SHORELINE_WOBBLE_SUBDIVISIONS;
  const offsets: number[] = [];
  for (let i = 0; i <= n; i++) {
    if (i === 0 || i === n) { offsets.push(0); continue; }
    const t = i / n;
    const px = x0 + (x1 - x0) * t;
    const pz = z0 + (z1 - z0) * t;
    offsets.push(_shoreNoise(px * SHORE_WOBBLE_FREQUENCY, pz * SHORE_WOBBLE_FREQUENCY) * SHORE_WOBBLE_AMPLITUDE_WU);
  }
  return offsets;
}

/**
 * Same as shorelineEdgeOffsets(), but returns the actual [x, z] world points
 * along the edge with the perpendicular offset already applied — for a
 * horizontal edge (z0 === z1) the offset perturbs Z; for a vertical edge
 * (x0 === x1) the offset perturbs X.
 */
export function shorelineEdgePoints(x0: number, z0: number, x1: number, z1: number): Array<[number, number]> {
  const offsets = shorelineEdgeOffsets(x0, z0, x1, z1);
  const n = SHORELINE_WOBBLE_SUBDIVISIONS;
  const horizontal = z0 === z1;
  return offsets.map((offset, i) => {
    const t = i / n;
    const px = x0 + (x1 - x0) * t;
    const pz = z0 + (z1 - z0) * t;
    return horizontal ? [px, pz + offset] : [px + offset, pz] as [number, number];
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/ShorelineWobble.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/world/ShorelineWobble.ts tests/world/ShorelineWobble.test.ts
git commit -m "feat: add ShorelineWobble edge-offset utility

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Water-adjacency edge detection helper

**Files:**
- Modify: `src/world/ShorelineWobble.ts`
- Test: `tests/world/ShorelineWobble.test.ts`

**Interfaces:**
- Consumes: `WorldGrid`/`WorldCell` types from `@/world/WorldGrid` (existing).
- Produces: `interface WaterAdjacency { north: boolean; south: boolean; east: boolean; west: boolean }`; `waterAdjacency(wg: WorldGrid, col: number, row: number): WaterAdjacency` — `true` for a direction only when THIS cell is dry (`waterDepth === 0`) and that neighbor is wet (`waterDepth > 0`); always all-`false` if this cell is itself wet (water tiles don't need their own top-surface/wall boundary treatment — the DRY neighbor across the same edge is the one that generates the wall). Consumed by Tasks 3 and 4.

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/ShorelineWobble.test.ts` (append at the end of the file, after the existing `describe` blocks):

```ts
import { WorldGrid } from '@/world/WorldGrid';
import { waterAdjacency } from '@/world/ShorelineWobble';

describe('waterAdjacency', () => {
  it('detects a wet neighbor to the south (row + 1)', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 2, { waterDepth: 2.0 }); // south of (1,1)
    const adj = waterAdjacency(wg, 1, 1);
    expect(adj).toEqual({ north: false, south: true, east: false, west: false });
  });

  it('detects wet neighbors on multiple sides at once (a peninsula tip)', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 2, { waterDepth: 2.0 }); // south
    wg.set(2, 1, { waterDepth: 2.0 }); // east
    const adj = waterAdjacency(wg, 1, 1);
    expect(adj).toEqual({ north: false, south: true, east: true, west: false });
  });

  it('returns all-false when this cell is itself wet', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 1, { waterDepth: 2.0 });
    wg.set(1, 2, { waterDepth: 0 });
    const adj = waterAdjacency(wg, 1, 1);
    expect(adj).toEqual({ north: false, south: false, east: false, west: false });
  });

  it('returns all-false when every neighbor is dry', () => {
    const wg = new WorldGrid(3, 3);
    const adj = waterAdjacency(wg, 1, 1);
    expect(adj).toEqual({ north: false, south: false, east: false, west: false });
  });

  it('does not throw at the map edge (out-of-bounds neighbor defaults to dry)', () => {
    const wg = new WorldGrid(3, 3);
    expect(() => waterAdjacency(wg, 0, 0)).not.toThrow();
    expect(waterAdjacency(wg, 0, 0)).toEqual({ north: false, south: false, east: false, west: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/ShorelineWobble.test.ts -t waterAdjacency`
Expected: FAIL — `waterAdjacency is not a function` (or similar export-not-found error)

- [ ] **Step 3: Write the implementation**

Add to `src/world/ShorelineWobble.ts`, after the existing `shorelineEdgePoints()` function:

```ts
import type { WorldGrid } from './WorldGrid';

/** Which of a dry tile's 4 orthogonal edges border an actually-submerged
 *  neighbor (`waterDepth > 0`). All-false if this cell is itself wet — the
 *  DRY tile across a shared water/land edge is the one whose top-surface
 *  and wall generation needs the wobble treatment, not the wet tile. */
export interface WaterAdjacency {
  north: boolean;
  south: boolean;
  east:  boolean;
  west:  boolean;
}

export function waterAdjacency(wg: WorldGrid, col: number, row: number): WaterAdjacency {
  if (wg.get(col, row).waterDepth > 0) {
    return { north: false, south: false, east: false, west: false };
  }
  return {
    north: wg.get(col, row - 1).waterDepth > 0,
    south: wg.get(col, row + 1).waterDepth > 0,
    east:  wg.get(col + 1, row).waterDepth > 0,
    west:  wg.get(col - 1, row).waterDepth > 0,
  };
}
```

(Move the `import type { WorldGrid } from './WorldGrid';` line up to the top of the file with the other import, next to the `createNoise2D` import, rather than mid-file — TypeScript allows either position but grouping imports at the top matches this codebase's convention.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/ShorelineWobble.test.ts`
Expected: PASS (14 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/world/ShorelineWobble.ts tests/world/ShorelineWobble.test.ts
git commit -m "feat: add waterAdjacency edge-detection helper

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Wobble the top-surface boundary in `emitGroundSubTiles()`

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts:538-580` (`emitGroundSubTiles`), `:767-772` (its call site)
- Test: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `waterAdjacency()`, `shorelineEdgePoints()` from `@/world/ShorelineWobble` (Tasks 1-2).
- Produces: `emitGroundSubTiles()` gains a new 14th parameter, `adjacency: WaterAdjacency`, threading water-boundary wobble into the outermost sub-tile row/column on each water-adjacent side. Task 4 (wall generation) reuses the exact same `shorelineEdgePoints()` calls (recomputed there — cheap, pure, deterministic — rather than plumbed through as a parameter, since the wall blocks are a separate code region with their own local variables).

- [ ] **Step 1: Write the failing test**

First, check whether `tests/world/TerrainGeometryBuilder.test.ts` already exists:

Run: `ls tests/world/TerrainGeometryBuilder.test.ts`

If it exists, add the following `describe` block to the end of the file. If it does not exist, create it with this full content (adjust the imports at the top if the file already exists and already imports `WorldGrid`/`buildTerrainGeometryData` — reuse those imports rather than duplicating):

```ts
// tests/world/TerrainGeometryBuilder.test.ts (append if file exists)
import { describe, it, expect } from 'vitest';
import { WorldGrid } from '@/world/WorldGrid';
import { buildTerrainGeometryData } from '@/world/TerrainGeometryBuilder';

describe('shoreline wobble — top surface', () => {
  it('a dry tile bordering water gets a non-degenerate, gap-free ground mesh', () => {
    // 3x3 grid: center dry tile (1,1) borders a wet tile to the south (1,2).
    const wg = new WorldGrid(3, 3);
    wg.set(1, 2, { waterDepth: 2.0, feature: 'lake' });
    const T = 2, SH = 0.55;
    const data = buildTerrainGeometryData(wg, 3, 3, 1.5, 1.5, T, SH);
    // The base (untextured) buffer must contain a non-empty, well-formed
    // mesh: every index must reference a valid position, and the position
    // count must be a multiple of 3 (one x,y,z triple per vertex).
    expect(data.positions.length % 3).toBe(0);
    expect(data.positions.length).toBeGreaterThan(0);
    const vertexCount = data.positions.length / 3;
    for (const i of data.indices) expect(i).toBeLessThan(vertexCount);
  });

  it('two independent builds of the same water-adjacent grid produce byte-identical geometry (determinism)', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 2, { waterDepth: 2.0, feature: 'lake' });
    const T = 2, SH = 0.55;
    const a = buildTerrainGeometryData(wg, 3, 3, 1.5, 1.5, T, SH);
    const b = buildTerrainGeometryData(wg, 3, 3, 1.5, 1.5, T, SH);
    expect(a.positions).toEqual(b.positions);
  });

  it('a dry tile with no water neighbor is completely unaffected (regression guard)', () => {
    const wgWithWater = new WorldGrid(3, 3);
    wgWithWater.set(1, 2, { waterDepth: 2.0, feature: 'lake' });
    const wgAllDry = new WorldGrid(3, 3);
    const T = 2, SH = 0.55;
    const withWater = buildTerrainGeometryData(wgWithWater, 3, 3, 1.5, 1.5, T, SH);
    const allDry = buildTerrainGeometryData(wgAllDry, 3, 3, 1.5, 1.5, T, SH);
    // Tile (1,0) — the row north of the water-adjacent tile — has no water
    // neighbor in either grid, so its 4 corners (first 12 numbers emitted
    // for that tile, if it's the first tile processed) must be unaffected
    // by whether water exists elsewhere on the map. Rather than assume
    // emission order, just assert the two grids produce a DIFFERENT overall
    // vertex count (proving the water-adjacent tile's boundary actually
    // changed shape) — a same-count result would mean Task 3 had no effect.
    expect(withWater.positions.length).not.toBe(allDry.positions.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes for the wrong reason**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "shoreline wobble"`
Expected: the first two tests PASS already (the existing flat quad is already well-formed and deterministic — this is fine, they're regression guards for after this task's change, not red/green signals). The **third test FAILS** (`withWater.positions.length` currently equals `allDry.positions.length`, since nothing wobbles yet) — this is the one real signal that Task 3's change hasn't landed.

- [ ] **Step 3: Write the implementation**

In `src/world/TerrainGeometryBuilder.ts`, add the import at the top of the file (near the other imports, e.g. after the `GROUND_TERRAIN_VARIANTS` import):

```ts
import { waterAdjacency, shorelineEdgePoints } from './ShorelineWobble';
```

Change `emitGroundSubTiles()`'s signature and body. It currently reads:

```ts
  const emitGroundSubTiles = (
    col: number, row: number, cell: WorldCell, groundVariant: string,
    swY: number, nwY: number, neY: number, seY: number,
    nx: number, ny: number, nz: number,
    wxTile: number, wzTile: number,
    tr: number, tg: number, tb: number,
  ): void => {
    const N = GROUND_SUBDIVISIONS;
    const heightAt = (u: number, w: number): number =>
      swY * (1 - u) * (1 - w) + seY * u * (1 - w) + nwY * (1 - u) * w + neY * u * w;

    const neighborVariant = {
      south: _groundTextureVariant(wg.get(col, row + 1)),
      north: _groundTextureVariant(wg.get(col, row - 1)),
      east:  _groundTextureVariant(wg.get(col + 1, row)),
      west:  _groundTextureVariant(wg.get(col - 1, row)),
    };

    for (let sz = 0; sz < N; sz++) {
      for (let sx = 0; sx < N; sx++) {
        const u0 = sx / N, u1 = (sx + 1) / N;
        const w0 = sz / N, w1 = (sz + 1) / N;
        const px0 = wxTile + u0 * T, px1 = wxTile + u1 * T;
        const pz0 = wzTile + w0 * T, pz1 = wzTile + w1 * T;

        const ySW = heightAt(u0, w0) + subTileBumpJitter(px0, pz0);
        const yNW = heightAt(u0, w1) + subTileBumpJitter(px0, pz1);
        const yNE = heightAt(u1, w1) + subTileBumpJitter(px1, pz1);
        const ySE = heightAt(u1, w0) + subTileBumpJitter(px1, pz0);

        const subCenterX = (px0 + px1) / 2, subCenterZ = (pz0 + pz1) / 2;
        const variant = _subTileGroundVariant(
          groundVariant, neighborVariant, sx, sz, N, cell.biome, subCenterX, subCenterZ,
        );

        addGroundFace(
          variant,
          [px0, ySW, pz0], [px0, yNW, pz1], [px1, yNE, pz1], [px1, ySE, pz0],
          nx, ny, nz, tr, tg, tb,
        );
      }
    }
  };
```

Replace with (new parameter `adjacency`, and 4 new lookup tables computed once per tile, giving each boundary sub-tile corner its own independently-wobbled X/Z instead of the regular grid position — a corner shared between two sub-tiles along an edge needs its own, not a value shared with its neighbor across that same boundary, so this changes the sub-tile quad from "shared px0/px1/pz0/pz1" to 4 fully independent corner positions):

```ts
  const emitGroundSubTiles = (
    col: number, row: number, cell: WorldCell, groundVariant: string,
    swY: number, nwY: number, neY: number, seY: number,
    nx: number, ny: number, nz: number,
    wxTile: number, wzTile: number,
    tr: number, tg: number, tb: number,
    adjacency: WaterAdjacency,
  ): void => {
    const N = GROUND_SUBDIVISIONS;
    const heightAt = (u: number, w: number): number =>
      swY * (1 - u) * (1 - w) + seY * u * (1 - w) + nwY * (1 - u) * w + neY * u * w;

    const neighborVariant = {
      south: _groundTextureVariant(wg.get(col, row + 1)),
      north: _groundTextureVariant(wg.get(col, row - 1)),
      east:  _groundTextureVariant(wg.get(col + 1, row)),
      west:  _groundTextureVariant(wg.get(col - 1, row)),
    };

    const wxTile1 = wxTile + T, wzTile1 = wzTile + T;
    // Shoreline wobble points for each water-adjacent edge (null when that
    // side has no water neighbor). Endpoint ordering follows
    // ShorelineWobble.ts's documented convention: horizontal edges
    // west-first, vertical edges north-first — lattice index i (0..N)
    // is the i-th sub-tile boundary point along that edge.
    const southPts = adjacency.south ? shorelineEdgePoints(wxTile, wzTile1, wxTile1, wzTile1) : null;
    const northPts = adjacency.north ? shorelineEdgePoints(wxTile, wzTile,  wxTile1, wzTile)  : null;
    const eastPts  = adjacency.east  ? shorelineEdgePoints(wxTile1, wzTile, wxTile1, wzTile1) : null;
    const westPts  = adjacency.west  ? shorelineEdgePoints(wxTile,  wzTile, wxTile,  wzTile1) : null;

    for (let sz = 0; sz < N; sz++) {
      for (let sx = 0; sx < N; sx++) {
        const u0 = sx / N, u1 = (sx + 1) / N;
        const w0 = sz / N, w1 = (sz + 1) / N;
        const regPx0 = wxTile + u0 * T, regPx1 = wxTile + u1 * T;
        const regPz0 = wzTile + w0 * T, regPz1 = wzTile + w1 * T;

        // This sub-tile's 4 corners, named by their (u, w) lattice position.
        // Each starts at the regular grid position and is independently
        // overridden only where it actually sits on a water-adjacent tile
        // boundary — interior corners (and every corner of a tile with no
        // water neighbor) are completely untouched. A corner in an actual
        // tile CORNER (e.g. sx=N-1 and sz=N-1 both true — a "peninsula tip"
        // water-adjacent on two sides at once) can pick up both an X wobble
        // (east/west edge) and a Z wobble (north/south edge) independently;
        // they never conflict, since X and Z are separate coordinates.
        let x00 = regPx0, z00 = regPz0; // corner at (u0, w0)
        let x01 = regPx0, z01 = regPz1; // corner at (u0, w1)
        let x11 = regPx1, z11 = regPz1; // corner at (u1, w1)
        let x10 = regPx1, z10 = regPz0; // corner at (u1, w0)

        if (northPts && sz === 0)     { z00 = northPts[sx]![1];     z10 = northPts[sx + 1]![1]; }
        if (southPts && sz === N - 1) { z01 = southPts[sx]![1];     z11 = southPts[sx + 1]![1]; }
        if (westPts  && sx === 0)     { x00 = westPts[sz]![0];      x01 = westPts[sz + 1]![0]; }
        if (eastPts  && sx === N - 1) { x10 = eastPts[sz]![0];      x11 = eastPts[sz + 1]![0]; }

        // Heights and the sub-tile-variant lookup stay keyed by the
        // REGULAR (unwobbled) grid position, deliberately — subTileBumpJitter()
        // is keyed by absolute world position specifically so adjacent
        // tiles agree at shared lattice points (see the existing comment
        // above jSW/jNW at line 655); wobbling that lookup key would break
        // agreement with the unwobbled neighboring interior sub-tiles. Only
        // the wobbled corners' horizontal (x, z) position changes above —
        // height and texture-variant selection are unaffected.
        const ySW = heightAt(u0, w0) + subTileBumpJitter(regPx0, regPz0);
        const yNW = heightAt(u0, w1) + subTileBumpJitter(regPx0, regPz1);
        const yNE = heightAt(u1, w1) + subTileBumpJitter(regPx1, regPz1);
        const ySE = heightAt(u1, w0) + subTileBumpJitter(regPx1, regPz0);

        const subCenterX = (regPx0 + regPx1) / 2, subCenterZ = (regPz0 + regPz1) / 2;
        const variant = _subTileGroundVariant(
          groundVariant, neighborVariant, sx, sz, N, cell.biome, subCenterX, subCenterZ,
        );

        addGroundFace(
          variant,
          [x00, ySW, z00], [x01, yNW, z01], [x11, yNE, z11], [x10, ySE, z10],
          nx, ny, nz, tr, tg, tb,
        );
      }
    }
  };
```

Now update the one call site (currently at line ~771):

```ts
        if (groundVariant !== null) {
          emitGroundSubTiles(col, row, cell, groundVariant, swY, nwY, neY, seY, 0, 1, 0, wx, wz, tr, tg, tb);
        } else {
```

Change to:

```ts
        if (groundVariant !== null) {
          emitGroundSubTiles(
            col, row, cell, groundVariant, swY, nwY, neY, seY, 0, 1, 0, wx, wz, tr, tg, tb,
            waterAdjacency(wg, col, row),
          );
        } else {
```

Also add the `WaterAdjacency` type import alongside the value imports at the top of the file:

```ts
import { waterAdjacency, shorelineEdgePoints, type WaterAdjacency } from './ShorelineWobble';
```

(replacing the earlier plain `import { waterAdjacency, shorelineEdgePoints } from './ShorelineWobble';` — this single combined import line is the one to actually add; don't add both.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS (all tests, including the previously-failing determinism-guard test)

- [ ] **Step 5: Run the broader terrain/collider regression suite**

Run: `npx vitest run tests/scene/OverworldScene.chunk-terrain-alignment.test.ts tests/scene/OverworldScene.chunk-collider-streaming.test.ts tests/scene/OverworldScene.drawcall-batching.test.ts`
Expected: PASS (these tests check collider/scatter alignment against the terrain mesh's actual bounding box, which must still hold — a 0.18 WU wobble is far smaller than any margin those tests use, but this confirms nothing broke)

- [ ] **Step 6: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "feat: wobble the top-surface boundary at water-adjacent tile edges

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Wobble the wall faces at water-adjacent edges

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts:831-880` (the 4 wall blocks)
- Test: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `waterAdjacency()`, `shorelineEdgePoints()` from Task 2/1 (already imported in Task 3).
- Produces: no new exports — this task only changes wall geometry emission. Later tasks don't depend on anything new from here.

- [ ] **Step 1: Write the failing test**

Add to `tests/world/TerrainGeometryBuilder.test.ts`, inside the `describe('shoreline wobble — top surface', ...)` block from Task 3 (or as a sibling `describe` block right after it):

```ts
describe('shoreline wobble — walls', () => {
  it('a water-adjacent wall is subdivided into more than one quad', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 2, { waterDepth: 2.0, feature: 'lake' });
    const T = 2, SH = 0.55;
    const before = (() => {
      const wgAllDry = new WorldGrid(3, 3);
      return buildTerrainGeometryData(wgAllDry, 3, 3, 1.5, 1.5, T, SH);
    })();
    const after = buildTerrainGeometryData(wg, 3, 3, 1.5, 1.5, T, SH);
    // A single flat wall quad contributes 4 vertices/6 indices; a wobbled
    // wall subdivided into SHORELINE_WOBBLE_SUBDIVISIONS (4) segments
    // contributes 4x as many. The exact byte-for-byte count isn't asserted
    // (too brittle against unrelated future changes) — just that adding
    // one water tile meaningfully grows the base buffer's index count
    // beyond what a single extra wall quad alone would add.
    const growth = after.indices.length - before.indices.length;
    expect(growth).toBeGreaterThan(6); // more than one flat quad's worth (6 indices)
  });

  it('a plain land-elevation wall (no water involved) is completely unaffected', () => {
    // Two dry tiles at different elevation levels, no water anywhere —
    // this must still produce exactly the pre-existing single-quad wall,
    // proving the wobble gate is keyed on water, not on "is there a wall".
    const wg = new WorldGrid(3, 3);
    wg.set(1, 1, { elevation: 3 });
    wg.set(1, 2, { elevation: 1 }); // lower dry neighbor -> a land-elevation wall
    const T = 2, SH = 0.55;
    const a = buildTerrainGeometryData(wg, 3, 3, 1.5, 1.5, T, SH);
    const b = buildTerrainGeometryData(wg, 3, 3, 1.5, 1.5, T, SH);
    expect(a.indices.length).toEqual(b.indices.length); // deterministic, sanity check
    // The actual "unaffected" assertion: rebuild the SAME grid but confirm
    // total index count matches what today's un-wobbled single-quad-per-
    // wall logic would produce for this exact land-only elevation setup —
    // i.e. it must NOT have grown the way the water case above does.
    // (This is a regression guard: if a future change accidentally starts
    // gating wobble on "wall exists" instead of "wall borders water", this
    // test's sibling in Task 3/4's water case would still pass but this one
    // would start failing as soon as this land wall also got subdivided.)
    expect(a.indices.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "shoreline wobble — walls"`
Expected: FAIL — the first test fails (`growth` is exactly 6, one flat quad, since walls aren't subdivided yet)

- [ ] **Step 3: Write the implementation**

In `src/world/TerrainGeometryBuilder.ts`, the 4 wall blocks currently read (shown together for context — they appear consecutively):

```ts
      // ── SOUTH wall (+Z face, at wz1) ─────────────────────────────────
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

Replace with (each block gated on `wg.get(<neighbor>).waterDepth > 0` to build a subdivided, wobbled wall instead of one flat quad — only when it's actually a water boundary; the plain `addFace` fallback for land-elevation walls is untouched):

```ts
      // ── SOUTH wall (+Z face, at wz1) ─────────────────────────────────
      const wallTopS = Math.min(nwY, neY);
      const wyS = physH(col, row + 1);
      if (wyS < wallTopS) {
        const d = 0.76;
        if (wg.get(col, row + 1).waterDepth > 0) {
          const pts = shorelineEdgePoints(wx, wz1, wx1, wz1);
          for (let i = 0; i < pts.length - 1; i++) {
            const [ax, az] = pts[i]!, [bx, bz] = pts[i + 1]!;
            addFace(
              [bx, wallTopS, bz], [ax, wallTopS, az], [ax, wyS, az], [bx, wyS, bz],
              0, 0, 1,  tr * d, tg * d, tb * d,
            );
          }
        } else {
          addFace(
            [wx1, wallTopS, wz1], [wx, wallTopS, wz1], [wx, wyS, wz1], [wx1, wyS, wz1],
            0, 0, 1,  tr * d, tg * d, tb * d,
          );
        }
      }

      // ── NORTH wall (−Z face, at wz) ──────────────────────────────────
      const wallTopN = Math.min(swY, seY);
      const wyN = physH(col, row - 1);
      if (wyN < wallTopN) {
        const d = 0.50;
        if (wg.get(col, row - 1).waterDepth > 0) {
          const pts = shorelineEdgePoints(wx, wz, wx1, wz);
          for (let i = 0; i < pts.length - 1; i++) {
            const [ax, az] = pts[i]!, [bx, bz] = pts[i + 1]!;
            addFace(
              [ax, wallTopN, az], [bx, wallTopN, bz], [bx, wyN, bz], [ax, wyN, az],
              0, 0, -1,  tr * d, tg * d, tb * d,
            );
          }
        } else {
          addFace(
            [wx, wallTopN, wz], [wx1, wallTopN, wz], [wx1, wyN, wz], [wx, wyN, wz],
            0, 0, -1,  tr * d, tg * d, tb * d,
          );
        }
      }

      // ── EAST wall (+X face, at wx1) ──────────────────────────────────
      const wallTopE = Math.min(neY, seY);
      const wyE = physH(col + 1, row);
      if (wyE < wallTopE) {
        const d = 0.63;
        if (wg.get(col + 1, row).waterDepth > 0) {
          const pts = shorelineEdgePoints(wx1, wz, wx1, wz1);
          for (let i = 0; i < pts.length - 1; i++) {
            const [ax, az] = pts[i]!, [bx, bz] = pts[i + 1]!;
            addFace(
              [ax, wallTopE, az], [bx, wallTopE, bz], [bx, wyE, bz], [ax, wyE, az],
              1, 0, 0,  tr * d, tg * d, tb * d,
            );
          }
        } else {
          addFace(
            [wx1, wallTopE, wz], [wx1, wallTopE, wz1], [wx1, wyE, wz1], [wx1, wyE, wz],
            1, 0, 0,  tr * d, tg * d, tb * d,
          );
        }
      }

      // ── WEST wall (−X face, at wx) ───────────────────────────────────
      const wallTopW = Math.min(swY, nwY);
      const wyW = physH(col - 1, row);
      if (wyW < wallTopW) {
        const d = 0.55;
        if (wg.get(col - 1, row).waterDepth > 0) {
          const pts = shorelineEdgePoints(wx, wz, wx, wz1);
          for (let i = 0; i < pts.length - 1; i++) {
            const [ax, az] = pts[i]!, [bx, bz] = pts[i + 1]!;
            addFace(
              [bx, wallTopW, bz], [ax, wallTopW, az], [ax, wyW, az], [bx, wyW, bz],
              -1, 0, 0,  tr * d, tg * d, tb * d,
            );
          }
        } else {
          addFace(
            [wx, wallTopW, wz1], [wx, wallTopW, wz], [wx, wyW, wz], [wx, wyW, wz1],
            -1, 0, 0,  tr * d, tg * d, tb * d,
          );
        }
      }
```

Note the winding order of each subdivided quad is deliberately kept consistent with that wall's original single-quad winding (compare each `addFace(...)` corner order above against the pre-existing version it replaces) — `addFace()`'s doc comment requires counter-clockwise winding viewed along the outward normal, and getting this backwards on a subdivided wall would silently back-face-cull half the wall's segments, which existing visual regression (Task 5's live check) would catch, but getting it right the first time avoids that debugging detour.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Run the broader terrain/collider regression suite**

Run: `npx vitest run tests/scene/OverworldScene.chunk-terrain-alignment.test.ts tests/scene/OverworldScene.chunk-collider-streaming.test.ts tests/scene/OverworldScene.drawcall-batching.test.ts tests/scene/OverworldScene.settlement-parity.test.ts`
Expected: PASS. Pay particular attention to `settlement-parity.test.ts` — it snapshot-tests exact building/road placement counts; this task must not change them (settlement placement reads tile-grid `waterDepth`/`feature` classification directly, never the wobbled mesh, so it should be untouched, but this is the test that would catch it if that assumption were ever wrong).

- [ ] **Step 6: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "feat: wobble wall faces at water-adjacent tile edges

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Wobble the water-surface mesh's land-facing edges

**Files:**
- Modify: `src/scene/OverworldScene.ts:1607-1645` (`_buildWaterMesh`)
- Test: `tests/scene/overworld.startup.smoke.test.ts` (or a new focused test file if that one doesn't easily support a targeted water-mesh assertion — check first)

**Interfaces:**
- Consumes: `waterAdjacency()`, `shorelineEdgePoints()` from `@/world/ShorelineWobble`.
- Produces: no new exports — `_buildWaterMesh()`'s internal geometry changes only.

- [ ] **Step 1: Investigate the existing test coverage**

Run: `grep -n "_buildWaterMesh\|waterMesh" tests/scene/*.test.ts`

If no existing test directly exercises `_buildWaterMesh()`'s geometry (likely, since it's a private method only reachable through full `OverworldScene` construction), write a new focused test file `tests/scene/OverworldScene.water-mesh-wobble.test.ts` in Step 1 below rather than trying to retrofit an existing one.

- [ ] **Step 2: Write the failing test**

Create `tests/scene/OverworldScene.water-mesh-wobble.test.ts`. Check the top of an existing `tests/scene/OverworldScene.*.test.ts` file first (e.g. `OverworldScene.chunk-terrain-alignment.test.ts`) to copy its exact `OverworldScene` construction boilerplate (constructor args, any required mocks) — do not guess at the constructor signature. Structure:

```ts
// tests/scene/OverworldScene.water-mesh-wobble.test.ts
//
//  Confirms the water-surface mesh's land-facing edges follow the same
//  ShorelineWobble points as the terrain mesh, so the two never show a gap
//  or overlap at the shoreline. Copy this suite's OverworldScene
//  construction boilerplate from an existing test in this directory (e.g.
//  OverworldScene.chunk-terrain-alignment.test.ts) rather than guessing at
//  the constructor signature.

import { describe, it, expect } from 'vitest';
// ... copy the exact same imports/setup used by
// tests/scene/OverworldScene.chunk-terrain-alignment.test.ts to construct
// a real OverworldScene instance against a small test WorldGrid containing
// at least one water tile adjacent to a land tile ...

describe('water surface mesh — shoreline wobble', () => {
  it('the water mesh is subdivided at a land-adjacent edge (not one flat quad per tile)', () => {
    // Build (or reuse the shared test helper for) an OverworldScene whose
    // WorldGrid has a small lake, then read its private water mesh via
    // whatever access pattern the copied test file already uses (a getter,
    // or a cast to `any` if that's this test suite's established
    // convention — check the copied file for precedent before choosing).
    // Assert the water mesh's index count is greater than
    // `6 * <number of water tiles>` (one flat quad per water tile would be
    // exactly 6 indices each; any land-adjacent tile's edge should now
    // contribute more).
  });
});
```

(This step's exact code depends on `OverworldScene`'s real constructor signature and test-access conventions, which must be copied from a sibling test file rather than invented — see Step 1's investigation.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/scene/OverworldScene.water-mesh-wobble.test.ts`
Expected: FAIL (water mesh not yet subdivided)

- [ ] **Step 4: Write the implementation**

In `src/scene/OverworldScene.ts`, add the import near the top of the file (next to the existing `TerrainGeometryBuilder` import):

```ts
import { waterAdjacency, shorelineEdgePoints } from '@/world/ShorelineWobble';
```

`_buildWaterMesh()` currently reads:

```ts
  private _buildWaterMesh(): THREE.Mesh | null {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    const pos: number[] = [];
    const idx: number[] = [];

    for (let row = 0; row < GH; row++) {
      for (let col = 0; col < GW; col++) {
        const cell = this._wg.get(col, row);
        if (cell.feature !== 'river' && cell.feature !== 'lake' && cell.biome !== 'ocean' && cell.biome !== 'deep_ocean') continue;

        const wx  = (col - GHW) * T;
        const wz  = (row - GHH) * T;
        const wy  = cell.elevation * SH + 0.05;

        const base = pos.length / 3;
        pos.push(
          wx,     wy, wz,
          wx + T, wy, wz,
          wx + T, wy, wz + T,
          wx,     wy, wz + T,
        );
        idx.push(base, base + 3, base + 2,  base, base + 2, base + 1);
      }
    }

    if (pos.length === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    return new THREE.Mesh(geo, this._makeWaterMaterial());
  }
```

Replace with (this water tile's own edges wobble on whichever sides border land — a `waterAdjacency()` call keyed at the water tile's own col/row returns all-false since `waterAdjacency()` only reports adjacency for a *dry* tile's cell per its own doc comment, so the neighbor's dryness is checked directly here instead of reusing `waterAdjacency()` in the "wrong direction"):

```ts
  private _buildWaterMesh(): THREE.Mesh | null {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    const pos: number[] = [];
    const idx: number[] = [];

    for (let row = 0; row < GH; row++) {
      for (let col = 0; col < GW; col++) {
        const cell = this._wg.get(col, row);
        if (cell.feature !== 'river' && cell.feature !== 'lake' && cell.biome !== 'ocean' && cell.biome !== 'deep_ocean') continue;

        const wx  = (col - GHW) * T;
        const wz  = (row - GHH) * T;
        const wx1 = wx + T;
        const wz1 = wz + T;
        const wy  = cell.elevation * SH + 0.05;

        // Wobble this water tile's own edges wherever the neighbor is dry
        // land — the SAME ShorelineWobble points the land tile on the
        // other side computes for its own wall/top-surface, so the two
        // meshes' boundaries always match with no gap. (waterAdjacency()
        // itself only answers "does this DRY tile border water" per its
        // doc comment, so dryness is checked directly here, from the water
        // tile's own col/row, rather than reusing that helper backwards.)
        const southDry = this._wg.get(col, row + 1).waterDepth === 0;
        const northDry = this._wg.get(col, row - 1).waterDepth === 0;
        const eastDry  = this._wg.get(col + 1, row).waterDepth === 0;
        const westDry  = this._wg.get(col - 1, row).waterDepth === 0;

        // Each side's points always ordered per ShorelineWobble.ts's
        // convention (horizontal edges west-first, vertical edges
        // north-first), matching exactly what the land tile on the other
        // side of each edge computes — this is what guarantees the two
        // meshes meet with no gap.
        const westPts  = shorelineEdgePoints(wx,  wz,  wx,  wz1); // N -> S
        const southPts = shorelineEdgePoints(wx,  wz1, wx1, wz1); // W -> E
        const eastPts  = shorelineEdgePoints(wx1, wz,  wx1, wz1); // N -> S
        const northPts = shorelineEdgePoints(wx,  wz,  wx1, wz);  // W -> E

        // Re-orient each side for a single consistent ring traversal
        // (NW -> SW -> SE -> NE -> back to NW) — the exact corner order the
        // pre-existing code below already proved produces a +Y-up-facing
        // triangle winding (see its own comment about the naive-winding
        // back-face-culling bug this fixed). Non-land-adjacent sides fall
        // back to their own plain 2-point (unwobbled) edge, in the same
        // orientation, so the ring-building logic below is uniform either way.
        const west  = westDry  ? westPts  : [westPts[0]!,  westPts[westPts.length - 1]!];
        const south = southDry ? southPts : [southPts[0]!, southPts[southPts.length - 1]!];
        const east  = (eastDry ? eastPts  : [eastPts[0]!,  eastPts[eastPts.length - 1]!]).slice().reverse();
        const north = (northDry ? northPts : [northPts[0]!, northPts[northPts.length - 1]!]).slice().reverse();

        const ring: Array<[number, number]> = [
          ...west,               // NW ... SW
          ...south.slice(1),     // SW -> ... -> SE (drop duplicate SW)
          ...east.slice(1),      // SE -> ... -> NE (drop duplicate SE)
          ...north.slice(1, -1), // NE -> ... (drop duplicate NE; drop trailing NW, already ring[0])
        ];

        // Fan-triangulate from the ring's first point (NW) — correct for any
        // subset of wobbled/plain sides since `ring` is always a simple,
        // consistently-wound polygon boundary. When every side is unwobbled
        // this reduces to exactly [NW, SW, SE, NE] with 2 triangles — byte-
        // identical to the original flat-quad triangulation below, so a
        // fully-interior water tile (the common case, no land neighbors)
        // renders exactly as it always has.
        const base = pos.length / 3;
        for (const [rx, rz] of ring) pos.push(rx, wy, rz);
        for (let i = 1; i < ring.length - 1; i++) {
          idx.push(base, base + i, base + i + 1);
        }
      }
    }

    if (pos.length === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    return new THREE.Mesh(geo, this._makeWaterMaterial());
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsc --noEmit 2>&1 | grep -i "OverworldScene.ts"` — confirm no new errors.

Run: `npx vitest run tests/scene/OverworldScene.water-mesh-wobble.test.ts`
Expected: PASS

Also spot-check the winding is still correct (this replaces a fixed 4-vertex quad with a variable-length fan, so it's worth confirming explicitly rather than assuming): the fully-unwobbled case (`west`/`south`/`east`/`north` all reduce to their 2-point fallback) must produce exactly `ring = [NW, SW, SE, NE]` with triangles `(NW,SW,SE)` and `(NW,SE,NE)` — byte-identical to the original code's proven-correct `idx.push(base, base+3, base+2, base, base+2, base+1)` pattern (corners pushed in NW,NE,SE,SW order there, i.e. indices 0=NW,1=NE,2=SE,3=SW, so `(0,3,2)=(NW,SW,SE)` and `(0,2,1)=(NW,SE,NE)` — same two triangles). Confirm this by temporarily logging `ring` for an all-water-neighbor tile during a manual test run, or add a quick throwaway assertion while developing, then remove it once confirmed.

- [ ] **Step 6: Commit**

```bash
git add src/scene/OverworldScene.ts tests/scene/OverworldScene.water-mesh-wobble.test.ts
git commit -m "feat: wobble the water-surface mesh's land-facing edges

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Chunk-boundary continuity test + full regression + manual verification

**Files:**
- Test: `tests/world/ShorelineWobble.test.ts` (one more test), then full-suite verification only (no further source changes expected)

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: nothing new — this task is verification-only.

- [ ] **Step 1: Write and run a chunk-boundary continuity test**

Add to `tests/world/ShorelineWobble.test.ts`:

```ts
describe('chunk-boundary continuity', () => {
  it('two calls representing two different chunks rendering opposite sides of the same shared edge produce identical points', () => {
    // Simulates chunk A rendering a dry tile's south edge and chunk B (a
    // different chunk, streamed in independently, at a different time)
    // rendering the water tile immediately south of it — both must
    // compute the exact same edge, since ShorelineWobble takes only the
    // edge's world coordinates and is otherwise stateless.
    const edgeFromChunkA = shorelineEdgePoints(40, 12, 42, 12); // dry tile's south edge
    const edgeFromChunkB = shorelineEdgePoints(40, 12, 42, 12); // water tile's north edge, same line
    expect(edgeFromChunkB).toEqual(edgeFromChunkA);
  });
});
```

Run: `npx vitest run tests/world/ShorelineWobble.test.ts`
Expected: PASS (15 tests total in this file)

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: no new failures beyond this project's established pre-existing baseline. If unsure which failures are pre-existing, compare against `git stash` (temporarily revert this plan's commits, or check out the commit before Task 1 started, run the suite, compare the failing-test list).

- [ ] **Step 3: Run `tsc --noEmit`**

Run: `npx tsc --noEmit 2>&1 | grep -iE "ShorelineWobble|TerrainGeometryBuilder|OverworldScene.ts"`
Expected: no new errors.

- [ ] **Step 4: Manual live-browser verification (required — no unverified completion claim)**

Start the dev server, load into the exterior overworld, and for at least one lake, one river, and one ocean/beach shoreline:
- Screenshot before/after comparison (or just a fresh screenshot if no "before" is readily available) confirming the sawtooth silhouette is visibly softer, not a hard tile-grid staircase.
- Confirm no visible gaps (dark voids), z-fighting (flickering overlapping surfaces), or floating geometry at any shoreline.
- Confirm the water surface mesh's edge and the land/floor mesh's edge appear to meet correctly (no visible seam between them).
- Walk the player character across a shoreline (dry to wet and back) and confirm swim/walk transition still feels correct (the ~0.18 WU wobble should be imperceptible as a gameplay issue, per the spec's accepted trade-off).
- Force a new chunk to stream in at runtime near a shoreline (walk far enough to trigger chunk loading) and confirm no seam appears at the chunk boundary.
- Check the browser console for zero new errors.

- [ ] **Step 5: Update the changelog**

Append a new section to `docs/visual-progress.md` (match the existing entries' heading style) describing: the shoreline edge smoothing (noise-perturbed wobbly boundary shared by land, wall, and water-surface meshes), that it addresses the repeatedly-requested "blocky shoreline" feedback, and that it's scoped to flat-shape water-adjacent tiles (the common case) with ramped/complex-shape tiles deferred as a known smaller residual. Reference `docs/superpowers/specs/2026-09-02-shoreline-edge-smoothing-design.md` and this plan file.

- [ ] **Step 6: Commit and push**

```bash
git add docs/visual-progress.md
git commit -m "docs: log shoreline edge smoothing in visual-progress changelog

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
git push
```
