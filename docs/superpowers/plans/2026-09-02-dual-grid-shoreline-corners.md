# Dual-Grid Shoreline Corners (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the noise-only shoreline wobble's fixed, tile-grid-aligned corners with genuine dual-grid corner-typed displacement (Phase 0's `DualGridCaseTable.ts`), so water/land boundaries show real coves/points/peninsulas, while keeping the existing fine noise wobble as a secondary detail layer and the visual-mesh/collider buffers identical (unchanged invariant).

**Architecture:** A new pure module, `src/world/ShorelineCornerField.ts`, adds `shorelineCornerPull(wg, gx, gz)` (per-`WorldGrid`-vertex displacement toward whichever of its 4 surrounding tiles is the dual-grid "odd one out") and `shorelineBoundaryPoints(...)` (drop-in replacement for `ShorelineWobble.ts`'s `shorelineEdgePoints()` that layers corner pull under the existing noise wobble). `TerrainGeometryBuilder.ts` (top surface + 4 wall blocks) and `WaterMeshBuilder.ts` (4 water-tile edges) switch to the new function at their existing call sites — no new call sites, no change to `ShorelineWobble.ts` itself.

**Tech Stack:** TypeScript, Vitest, existing `buildDualGridCaseTable` (`src/world/DualGridCaseTable.ts`) and `shorelineEdgePoints`/`shorelineEdgeOffsets` (`src/world/ShorelineWobble.ts`).

## Global Constraints

- Full design spec: `docs/superpowers/specs/2026-09-02-dual-grid-shoreline-corners-design.md` — read it first, especially "A real correctness risk found during design" (diagonal-adjacency corner consistency) and the hand-derived direction sanity-check.
- `SHORELINE_CORNER_PULL_WU = 0.5` (world units, per axis) — the corner-pull amplitude. Do not change without re-reading the design spec's magnitude-bound reasoning.
- Corner order/winding is always `[NW, NE, SE, SW]` = indices `[0, 1, 2, 3]`, matching `DualGridCaseTable.ts`'s own convention. A `WorldGrid` vertex at tile-index `(gx, gz)` touches tiles `NW=(gx-1,gz-1)`, `NE=(gx,gz-1)`, `SE=(gx,gz)`, `SW=(gx-1,gz)`.
- `ShorelineWobble.ts` is NOT modified by this plan — it stays exactly as-is (all 13 existing tests must keep passing unchanged). The new module composes with it, it does not replace it.
- Every new function must be a pure function of its inputs (`wg` read-only) — no hidden mutable state, so any two call sites computing the same vertex always agree.
- Corner pull must be computed **regardless of whether the specific edge being rendered is itself directly (orthogonally) water-adjacent** — only the fine noise-wobble layer stays gated on direct adjacency. This is the diagonal-adjacency fix; do not skip it as an optimization.
- Run `npx vitest run <changed test files>` after every task’s test-writing step, and the full `npx vitest run` + `npx tsc --noEmit` at the end of every task — confirm no new failures/errors beyond the fresh baseline established at mission start (146 tsc errors; 9 pre-existing failures in `tests/levels/towerGenerator.test.ts`, `tests/progression/talentSystem.test.ts` (x2), `tests/world/WaterMaterial.test.ts` — all unrelated to this work).
- Commit messages: write to a temp file and `git commit -F <tempfile>`, then delete it (avoids shell quoting issues with embedded punctuation). Every commit ends with:
  ```
  Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
  ```

---

### Task 1: `ShorelineCornerField.ts` — `shorelineCornerPull()`

**Files:**
- Create: `src/world/ShorelineCornerField.ts`
- Test: `tests/world/ShorelineCornerField.test.ts`

**Interfaces:**
- Consumes: `buildDualGridCaseTable` from `@/world/DualGridCaseTable` (existing); `WorldGrid` type from `@/world/WorldGrid` (existing).
- Produces: `SHORELINE_CORNER_PULL_WU: number` (constant, `0.5`); `shorelineCornerPull(wg: WorldGrid, gx: number, gz: number): readonly [number, number]`. Consumed by Task 2 (same file) and Tasks 3–4.

- [ ] **Step 1: Write the failing tests**

Create `tests/world/ShorelineCornerField.test.ts`:

```ts
// tests/world/ShorelineCornerField.test.ts
import { describe, it, expect } from 'vitest';
import { SHORELINE_CORNER_PULL_WU, shorelineCornerPull } from '@/world/ShorelineCornerField';
import { WorldGrid } from '@/world/WorldGrid';

/** Marks every tile in `wg` as land (waterDepth 0, the WorldGrid default)
 *  except the given [col, row] pairs, which are marked water. */
function makeGrid(size: number, waterTiles: Array<[number, number]>): WorldGrid {
  const wg = new WorldGrid(size, size);
  for (const [c, r] of waterTiles) wg.set(c, r, { waterDepth: 2.0, feature: 'lake' });
  return wg;
}

describe('shorelineCornerPull', () => {
  it('is zero for an all-land vertex (full)', () => {
    const wg = makeGrid(5, []);
    expect(shorelineCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('is zero for an all-water vertex (empty)', () => {
    const wg = makeGrid(5, [[1, 1], [2, 1], [1, 2], [2, 2]]);
    expect(shorelineCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('is zero for a straight coastline vertex (edge — 2 adjacent land, 2 adjacent water)', () => {
    // Vertex (2,2) touches NW=(1,1), NE=(2,1), SE=(2,2), SW=(1,2).
    // Water north (NW, NE), land south (SE, SW) -> a straight E-W coast.
    const wg = makeGrid(5, [[1, 1], [2, 1]]);
    expect(shorelineCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('is zero for a checkerboard vertex (diagonal/saddle — documented scope limitation)', () => {
    // NW=(1,1) water, SE=(2,2) water, NE=(2,1) land, SW=(1,2) land.
    const wg = makeGrid(5, [[1, 1], [2, 2]]);
    expect(shorelineCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('pulls toward the lone land tile for an outer_corner vertex', () => {
    // Vertex (2,2): NW=(1,1) is the ONLY land tile; NE=(2,1), SE=(2,2),
    // SW=(1,2) are all water. The pull must point toward NW: both
    // components negative, magnitude exactly SHORELINE_CORNER_PULL_WU.
    const wg = makeGrid(5, [[2, 1], [2, 2], [1, 2]]);
    const [dx, dz] = shorelineCornerPull(wg, 2, 2);
    expect(dx).toBeCloseTo(-SHORELINE_CORNER_PULL_WU, 10);
    expect(dz).toBeCloseTo(-SHORELINE_CORNER_PULL_WU, 10);
  });

  it('pulls toward the lone water tile for an inner_corner vertex', () => {
    // Vertex (2,2): SE=(2,2) is the ONLY water tile; NW=(1,1), NE=(2,1),
    // SW=(1,2) are all land. The pull must point toward SE: both
    // components positive, magnitude exactly SHORELINE_CORNER_PULL_WU.
    const wg = makeGrid(5, [[2, 2]]);
    const [dx, dz] = shorelineCornerPull(wg, 2, 2);
    expect(dx).toBeCloseTo(SHORELINE_CORNER_PULL_WU, 10);
    expect(dz).toBeCloseTo(SHORELINE_CORNER_PULL_WU, 10);
  });

  it('is deterministic — the same vertex called twice returns identical results', () => {
    const wg = makeGrid(5, [[2, 2]]);
    expect(shorelineCornerPull(wg, 2, 2)).toEqual(shorelineCornerPull(wg, 2, 2));
  });

  it('never exceeds SHORELINE_CORNER_PULL_WU on either axis, across every possible 4-tile config', () => {
    // Exhaustively try every land/water combination of the 4 surrounding
    // tiles at vertex (2,2) by directly setting them (16 total configs).
    for (let mask = 0; mask < 16; mask++) {
      const wg = makeGrid(5, []);
      const cells: Array<[number, number]> = [[1, 1], [2, 1], [2, 2], [1, 2]]; // NW,NE,SE,SW
      for (let i = 0; i < 4; i++) {
        if (((mask >> i) & 1) === 0) wg.set(cells[i]![0], cells[i]![1], { waterDepth: 2.0 });
      }
      const [dx, dz] = shorelineCornerPull(wg, 2, 2);
      expect(Math.abs(dx)).toBeLessThanOrEqual(SHORELINE_CORNER_PULL_WU);
      expect(Math.abs(dz)).toBeLessThanOrEqual(SHORELINE_CORNER_PULL_WU);
    }
  });

  it('treats out-of-bounds tiles as land, matching waterAdjacency()\'s convention', () => {
    const wg = makeGrid(3, [[0, 0]]); // water at the very corner tile
    // Vertex (0,0): NW=(-1,-1) oob->land, NE=(0,-1) oob->land,
    // SE=(0,0) water, SW=(-1,0) oob->land -> inner_corner, minority=water@SE.
    expect(() => shorelineCornerPull(wg, 0, 0)).not.toThrow();
    const [dx, dz] = shorelineCornerPull(wg, 0, 0);
    expect(dx).toBeCloseTo(SHORELINE_CORNER_PULL_WU, 10);
    expect(dz).toBeCloseTo(SHORELINE_CORNER_PULL_WU, 10);
  });

  it('an isolated 1-tile pond pulls all 4 of its corners inward symmetrically', () => {
    // Pond at (2,2) in an otherwise all-land 5x5 grid. Its 4 corner
    // vertices are (2,2) NW, (3,2) NE, (3,3) SE, (2,3) SW.
    const wg = makeGrid(5, [[2, 2]]);
    const nw = shorelineCornerPull(wg, 2, 2);
    const ne = shorelineCornerPull(wg, 3, 2);
    const se = shorelineCornerPull(wg, 3, 3);
    const sw = shorelineCornerPull(wg, 2, 3);
    // Each corner pulls toward the pond's own center, i.e. toward
    // whichever diagonal direction the pond tile sits relative to it.
    expect(nw).toEqual([SHORELINE_CORNER_PULL_WU, SHORELINE_CORNER_PULL_WU]);   // pond is SE of NW vertex
    expect(ne).toEqual([-SHORELINE_CORNER_PULL_WU, SHORELINE_CORNER_PULL_WU]);  // pond is SW of NE vertex
    expect(se).toEqual([-SHORELINE_CORNER_PULL_WU, -SHORELINE_CORNER_PULL_WU]); // pond is NW of SE vertex
    expect(sw).toEqual([SHORELINE_CORNER_PULL_WU, -SHORELINE_CORNER_PULL_WU]);  // pond is NE of SW vertex
  });

  it('an isolated 1-tile land peninsula pulls all 4 of its corners inward symmetrically (mirror of the pond case)', () => {
    // Land at (2,2), water everywhere else in a 5x5 grid.
    const wg = new WorldGrid(5, 5);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (c !== 2 || r !== 2) wg.set(c, r, { waterDepth: 2.0 });
      }
    }
    const nw = shorelineCornerPull(wg, 2, 2);
    const ne = shorelineCornerPull(wg, 3, 2);
    const se = shorelineCornerPull(wg, 3, 3);
    const sw = shorelineCornerPull(wg, 2, 3);
    expect(nw).toEqual([SHORELINE_CORNER_PULL_WU, SHORELINE_CORNER_PULL_WU]);
    expect(ne).toEqual([-SHORELINE_CORNER_PULL_WU, SHORELINE_CORNER_PULL_WU]);
    expect(se).toEqual([-SHORELINE_CORNER_PULL_WU, -SHORELINE_CORNER_PULL_WU]);
    expect(sw).toEqual([SHORELINE_CORNER_PULL_WU, -SHORELINE_CORNER_PULL_WU]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/world/ShorelineCornerField.test.ts`
Expected: FAIL — `Cannot find module '@/world/ShorelineCornerField'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/world/ShorelineCornerField.ts`:

```ts
// ── ShorelineCornerField — dual-grid corner-pull for shoreline geometry ─────
//
//  Phase 1 of the "organic world tiles" roadmap
//  (TODO/organic_world_tiles_todo.md): where ShorelineWobble.ts perturbs only
//  the INTERIOR of a water/land boundary edge (its 2 endpoints — the tile
//  grid corners — always pinned exactly in place), this module computes a
//  genuine displacement FOR those corners themselves, driven by Phase 0's
//  DualGridCaseTable rather than noise. See
//  docs/superpowers/specs/2026-09-02-dual-grid-shoreline-corners-design.md
//  for the full derivation (including a hand-verified direction check).
//
//  A "corner" here is a WorldGrid tile-grid VERTEX at tile-index (gx, gz),
//  shared by up to 4 tiles: NW=(gx-1,gz-1), NE=(gx,gz-1), SE=(gx,gz),
//  SW=(gx-1,gz) — matching DualGridCaseTable's own [NW,NE,SE,SW] winding, so
//  no index remapping is needed at the call site. A vertex whose 4
//  surrounding tiles are exactly 3-vs-1 (the case table's outer_corner /
//  inner_corner shapes) gets pulled TOWARD whichever single tile is the
//  odd one out — this always reads as THAT tile's corner being chamfered/
//  rounded off, regardless of whether the odd tile is land or water (see
//  the design spec's "isolated pond" / "isolated peninsula" derivation).
//  Every other case (empty/full/edge/diagonal) gets zero pull.

import { buildDualGridCaseTable } from './DualGridCaseTable';
import type { WorldGrid } from './WorldGrid';

/** Per-axis corner-pull amplitude (world units) — see design spec for the
 *  magnitude-bound reasoning (clearly larger than ShorelineWobble's 0.4 WU
 *  noise amplitude, while leaving headroom under a tile's 1.0 WU
 *  half-width even combined with that noise layer). */
export const SHORELINE_CORNER_PULL_WU = 0.5;

/** Built once at module load — pure data, not per-world-seed content (see
 *  docs/superpowers/specs/2026-09-02-dual-grid-case-table-usage.md). */
const _caseTable = buildDualGridCaseTable(2);

/** [dx, dz] unit direction for each corner index, matching the [NW, NE,
 *  SE, SW] winding: NW is up-left (-x,-z), NE is up-right (+x,-z), SE is
 *  down-right (+x,+z), SW is down-left (-x,+z) — "up"/"down" meaning
 *  toward smaller/larger `row` (matching WorldGrid.gridToWorld's wz
 *  convention: wz increases with row). */
const CORNER_DIRS: readonly (readonly [number, number])[] = [
  [-1, -1], // NW
  [1, -1],  // NE
  [1, 1],   // SE
  [-1, 1],  // SW
];

function _isLandTile(wg: WorldGrid, col: number, row: number): boolean {
  return wg.get(col, row).waterDepth === 0;
}

/**
 * Corner-pull displacement [dx, dz] (world units) for the WorldGrid vertex
 * at tile-index (gx, gz). Zero unless exactly 1 of its 4 surrounding tiles
 * differs from the other 3 (dual-grid outer_corner/inner_corner); in that
 * case, returns SHORELINE_CORNER_PULL_WU toward that lone tile's diagonal
 * direction. Out-of-bounds tiles read as land (WorldGrid.get()'s own
 * default), matching ShorelineWobble.ts's waterAdjacency() convention.
 */
export function shorelineCornerPull(wg: WorldGrid, gx: number, gz: number): readonly [number, number] {
  const config = [
    _isLandTile(wg, gx - 1, gz - 1) ? 1 : 0, // NW
    _isLandTile(wg, gx,     gz - 1) ? 1 : 0, // NE
    _isLandTile(wg, gx,     gz)     ? 1 : 0, // SE
    _isLandTile(wg, gx - 1, gz)     ? 1 : 0, // SW
  ];
  const found = _caseTable.mapping[config.join(',')];
  if (!found) return [0, 0];
  const tile = _caseTable.tiles[found.tile]!;
  if (tile.label !== 'outer_corner' && tile.label !== 'inner_corner') return [0, 0];

  // Find the "odd one out" directly in the RAW (un-rotated) config: for
  // outer_corner it's the lone land (1) corner; for inner_corner it's the
  // lone water (0) corner. (Deliberately not derived from the case
  // table's canonical mask + `steps` — the canonical mask's minority
  // corner sits at a DIFFERENT index for outer_corner (index 3 / SW,
  // since [0,0,0,1] is lexicographically smaller than [1,0,0,0]) than for
  // inner_corner (index 0 / NW, since [0,1,1,1] is smallest) so a single
  // "steps % 4" formula shared between both labels was wrong.)
  const minorityValue = tile.label === 'outer_corner' ? 1 : 0;
  const minorityIndex = config.indexOf(minorityValue);
  const [dirX, dirZ] = CORNER_DIRS[minorityIndex]!;
  return [dirX * SHORELINE_CORNER_PULL_WU, dirZ * SHORELINE_CORNER_PULL_WU];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/world/ShorelineCornerField.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/ShorelineCornerField.ts tests/world/ShorelineCornerField.test.ts
cat > /tmp/commit_msg.txt << 'EOF'
feat: add shorelineCornerPull (dual-grid corner displacement)

Phase 1 of the organic world tiles roadmap. Computes a genuine
displacement for a WorldGrid vertex, using Phase 0's DualGridCaseTable to
pull the vertex toward whichever of its 4 surrounding tiles is the lone
odd one out (outer_corner/inner_corner) -- chamfering that tile's corner,
regardless of whether it's land or water.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 2: `ShorelineCornerField.ts` — `shorelineBoundaryPoints()`

**Files:**
- Modify: `src/world/ShorelineCornerField.ts`
- Test: `tests/world/ShorelineCornerField.test.ts`

**Interfaces:**
- Consumes: `shorelineCornerPull` (Task 1, same file); `shorelineEdgePoints`, `SHORELINE_WOBBLE_SUBDIVISIONS` from `@/world/ShorelineWobble` (existing, unmodified).
- Produces: `shorelineBoundaryPoints(wg: WorldGrid, T: number, GHW: number, GHH: number, gx0: number, gz0: number, gx1: number, gz1: number, includeNoiseWobble: boolean): Array<[number, number]>`. Consumed by Tasks 3–4.

- [ ] **Step 1: Write the failing tests**

Append to `tests/world/ShorelineCornerField.test.ts` (add this import to the top alongside the existing ones, and add this new `describe` block at the end of the file):

```ts
import { shorelineBoundaryPoints } from '@/world/ShorelineCornerField';
import { shorelineEdgePoints, SHORELINE_WOBBLE_SUBDIVISIONS } from '@/world/ShorelineWobble';
```

```ts
describe('shorelineBoundaryPoints', () => {
  it('endpoints equal exactly corner + pull (not the plain grid corner)', () => {
    // Vertex (2,2) is an outer_corner (see the 'pulls toward the lone
    // land tile' test above) -> pull = [-0.5, -0.5]. Vertex (3,2) is
    // all-land (full) -> pull = [0, 0].
    const wg = makeGrid(5, [[2, 1], [2, 2], [1, 2]]);
    const T = 2, GHW = 2, GHH = 2; // vertex (gx,gz) world pos = (gx-GHW)*T
    const pts = shorelineBoundaryPoints(wg, T, GHW, GHH, 2, 2, 3, 2, false);
    // Plain grid corner for (2,2) is ((2-2)*2, (2-2)*2) = (0, 0); pulled -> (-0.5, -0.5).
    expect(pts[0]![0]).toBeCloseTo(-0.5, 10);
    expect(pts[0]![1]).toBeCloseTo(-0.5, 10);
    // Plain grid corner for (3,2) is ((3-2)*2, (2-2)*2) = (2, 0); pull is zero.
    expect(pts[pts.length - 1]![0]).toBeCloseTo(2, 10);
    expect(pts[pts.length - 1]![1]).toBeCloseTo(0, 10);
  });

  it('degenerates to the exact plain straight line when both corners have zero pull and noise is off', () => {
    const wg = makeGrid(5, []); // all land, no shoreline anywhere
    const T = 2, GHW = 2, GHH = 2;
    const pts = shorelineBoundaryPoints(wg, T, GHW, GHH, 1, 1, 2, 1, false);
    const n = SHORELINE_WOBBLE_SUBDIVISIONS;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      expect(pts[i]![0]).toBeCloseTo((1 - GHW) * T + ((2 - GHW) * T - (1 - GHW) * T) * t, 10);
      expect(pts[i]![1]).toBeCloseTo((1 - GHH) * T, 10);
    }
  });

  it('includes the exact ShorelineWobble noise offsets, plus interpolated pull, when includeNoiseWobble is true', () => {
    const wg = makeGrid(5, [[2, 1], [2, 2], [1, 2]]); // vertex (2,2) is outer_corner
    const T = 2, GHW = 2, GHH = 2;
    const pts = shorelineBoundaryPoints(wg, T, GHW, GHH, 2, 2, 3, 2, true);
    const plainWobble = shorelineEdgePoints((2 - GHW) * T, (2 - GHH) * T, (3 - GHW) * T, (2 - GHH) * T);
    const n = SHORELINE_WOBBLE_SUBDIVISIONS;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const pullX = -0.5 * (1 - t) + 0 * t; // pull0=[-0.5,-0.5], pull1=[0,0]
      const pullZ = -0.5 * (1 - t) + 0 * t;
      expect(pts[i]![0]).toBeCloseTo(plainWobble[i]![0] + pullX, 10);
      expect(pts[i]![1]).toBeCloseTo(plainWobble[i]![1] + pullZ, 10);
    }
  });

  it('is deterministic — the same call twice returns identical results', () => {
    const wg = makeGrid(5, [[2, 2]]);
    const T = 2, GHW = 2, GHH = 2;
    const a = shorelineBoundaryPoints(wg, T, GHW, GHH, 2, 2, 3, 2, true);
    const b = shorelineBoundaryPoints(wg, T, GHW, GHH, 2, 2, 3, 2, true);
    expect(a).toEqual(b);
  });

  it('reversed-endpoint calls produce the same point set, order reversed (tile/chunk agreement invariant)', () => {
    const wg = makeGrid(5, [[2, 2]]);
    const T = 2, GHW = 2, GHH = 2;
    const forward = shorelineBoundaryPoints(wg, T, GHW, GHH, 2, 2, 3, 2, true);
    const backward = shorelineBoundaryPoints(wg, T, GHW, GHH, 3, 2, 2, 2, true);
    expect(backward.slice().reverse()).toEqual(forward);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/world/ShorelineCornerField.test.ts`
Expected: FAIL — `shorelineBoundaryPoints is not a function` (or similar — the export doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Append to `src/world/ShorelineCornerField.ts` (after `shorelineCornerPull`, add this import at the top of the file next to the existing `DualGridCaseTable` import):

```ts
import { shorelineEdgePoints, SHORELINE_WOBBLE_SUBDIVISIONS } from './ShorelineWobble';
```

```ts
/** Same length/shape as shorelineEdgePoints()'s output, but with zero
 *  perpendicular offset at every point — used when `includeNoiseWobble`
 *  is false, so shorelineBoundaryPoints() always has an N+1-point base
 *  line to add corner pull onto, regardless of whether this particular
 *  edge is itself a direct water boundary. */
function _straightEdgePoints(x0: number, z0: number, x1: number, z1: number): Array<[number, number]> {
  const n = SHORELINE_WOBBLE_SUBDIVISIONS;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
  }
  return pts;
}

/**
 * Drop-in replacement for ShorelineWobble.ts's shorelineEdgePoints(), for
 * a tile edge between the WorldGrid vertices (gx0, gz0) and (gx1, gz1).
 * Always applies each endpoint's shorelineCornerPull() (interpolated
 * across the polyline: full pull at each endpoint, blended in between) --
 * this is intentionally NOT gated by `includeNoiseWobble`, so any two
 * tiles sharing a vertex always agree on its position even when only one
 * of them has a direct water neighbor on this specific side (see design
 * spec's diagonal-adjacency finding). `includeNoiseWobble` gates ONLY the
 * existing fine interior noise layer (shorelineEdgePoints() itself) --
 * pass the same direct-water-adjacency check callers already compute
 * today (e.g. ShorelineWobble.ts's waterAdjacency() or an equivalent
 * per-side `waterDepth > 0` check).
 */
export function shorelineBoundaryPoints(
  wg: WorldGrid, T: number, GHW: number, GHH: number,
  gx0: number, gz0: number, gx1: number, gz1: number,
  includeNoiseWobble: boolean,
): Array<[number, number]> {
  const x0 = (gx0 - GHW) * T, z0 = (gz0 - GHH) * T;
  const x1 = (gx1 - GHW) * T, z1 = (gz1 - GHH) * T;
  const base = includeNoiseWobble
    ? shorelineEdgePoints(x0, z0, x1, z1)
    : _straightEdgePoints(x0, z0, x1, z1);

  const pull0 = shorelineCornerPull(wg, gx0, gz0);
  const pull1 = shorelineCornerPull(wg, gx1, gz1);
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/world/ShorelineCornerField.test.ts`
Expected: PASS (18 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/world/ShorelineCornerField.ts tests/world/ShorelineCornerField.test.ts
cat > /tmp/commit_msg.txt << 'EOF'
feat: add shorelineBoundaryPoints (corner pull + noise wobble)

Drop-in replacement for ShorelineWobble's shorelineEdgePoints() that
always layers corner pull under the existing fine noise wobble, so any
two tiles sharing a vertex agree on its position regardless of which
specific edge is the direct water boundary.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 3: Wire corner pull into `TerrainGeometryBuilder.ts`

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Modify: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `shorelineCornerPull`, `shorelineBoundaryPoints` from `@/world/ShorelineCornerField` (Tasks 1–2).
- Produces: no new exports — `buildTerrainGeometryData()`'s existing signature/output shape is unchanged, only its internal shoreline geometry changes.

- [ ] **Step 1: Update the import**

In `src/world/TerrainGeometryBuilder.ts`, find:

```ts
import { waterAdjacency, shorelineEdgePoints, type WaterAdjacency } from './ShorelineWobble';
```

Replace with:

```ts
import { waterAdjacency, type WaterAdjacency } from './ShorelineWobble';
import { shorelineCornerPull, shorelineBoundaryPoints } from './ShorelineCornerField';
```

- [ ] **Step 2: Add a `NO_CORNER_PULL` constant next to `NO_WATER_ADJACENCY`**

Find:

```ts
const NO_WATER_ADJACENCY: WaterAdjacency = { north: false, south: false, east: false, west: false };
```

Add immediately after it:

```ts
/** Shared "no corner pull" constant for the same 'edge'-ramp path that
 *  already opts out via NO_WATER_ADJACENCY (see design spec's "Explicitly
 *  out of scope" — ramp shapes keep their pre-existing exclusion from any
 *  shoreline treatment, corner pull included). */
const NO_CORNER_PULL: readonly [number, number] = [0, 0];

/** True if a corner-pull tuple is non-zero on either axis. A module-level
 *  (not closure-local) helper so both emitGroundSubTiles() and the 4 wall
 *  blocks further down in buildTerrainGeometryData() can use it without
 *  worrying about declaration order — and named distinctly from
 *  emitGroundSubTiles()'s own `nz` parameter (the face normal's Z
 *  component) to avoid any shadowing confusion. */
function _hasCornerPull(p: readonly [number, number]): boolean {
  return p[0] !== 0 || p[1] !== 0;
}
```

- [ ] **Step 3: Update `emitGroundSubTiles()`'s signature and boundary-point computation**

Find the function signature:

```ts
  const emitGroundSubTiles = (
    col: number, row: number, cell: WorldCell, groundVariant: string,
    swY: number, nwY: number, neY: number, seY: number,
    nx: number, ny: number, nz: number,
    wxTile: number, wzTile: number,
    tr: number, tg: number, tb: number,
    adjacency: WaterAdjacency,
  ): void => {
```

Replace with (adds a `cornerPulls` parameter):

```ts
  const emitGroundSubTiles = (
    col: number, row: number, cell: WorldCell, groundVariant: string,
    swY: number, nwY: number, neY: number, seY: number,
    nx: number, ny: number, nz: number,
    wxTile: number, wzTile: number,
    tr: number, tg: number, tb: number,
    adjacency: WaterAdjacency,
    cornerPulls: { nw: readonly [number, number]; ne: readonly [number, number]; se: readonly [number, number]; sw: readonly [number, number] },
  ): void => {
```

Find (the 4 `*Pts` lines inside `emitGroundSubTiles`):

```ts
    const wxTile1 = wxTile + T, wzTile1 = wzTile + T;
    // Shoreline wobble points for each water-adjacent edge (null when that
    // side has no water neighbor). Endpoint ordering follows
    // ShorelineWobble.ts's documented convention: horizontal edges
    // west-first, vertical edges north-first — lattice index i (0..N) is
    // the i-th sub-tile boundary point along that edge.
    const southPts = adjacency.south ? shorelineEdgePoints(wxTile, wzTile1, wxTile1, wzTile1) : null;
    const northPts = adjacency.north ? shorelineEdgePoints(wxTile, wzTile,  wxTile1, wzTile)  : null;
    const eastPts  = adjacency.east  ? shorelineEdgePoints(wxTile1, wzTile, wxTile1, wzTile1) : null;
    const westPts  = adjacency.west  ? shorelineEdgePoints(wxTile,  wzTile, wxTile,  wzTile1) : null;
```

Replace with:

```ts
    const wxTile1 = wxTile + T, wzTile1 = wzTile + T;
    // Shoreline boundary points for each edge that either (a) directly
    // borders water (adjacency.<side>, gates the fine noise-wobble layer
    // too), or (b) has a non-zero corner pull at either endpoint even
    // without direct adjacency (a diagonal water neighbor) — see design
    // spec's diagonal-adjacency finding: skipping (b) would let this tile
    // render an unpulled corner while its neighbor renders the same
    // vertex pulled, opening a gap. Endpoint ordering follows
    // ShorelineWobble.ts's documented convention: horizontal edges
    // west-first, vertical edges north-first — lattice index i (0..N) is
    // the i-th sub-tile boundary point along that edge.
    const southPts = (adjacency.south || _hasCornerPull(cornerPulls.sw) || _hasCornerPull(cornerPulls.se))
      ? shorelineBoundaryPoints(wg, T, GHW, GHH, col, row + 1, col + 1, row + 1, adjacency.south) : null;
    const northPts = (adjacency.north || _hasCornerPull(cornerPulls.nw) || _hasCornerPull(cornerPulls.ne))
      ? shorelineBoundaryPoints(wg, T, GHW, GHH, col, row,     col + 1, row,     adjacency.north) : null;
    const eastPts  = (adjacency.east  || _hasCornerPull(cornerPulls.ne) || _hasCornerPull(cornerPulls.se))
      ? shorelineBoundaryPoints(wg, T, GHW, GHH, col + 1, row, col + 1, row + 1, adjacency.east)  : null;
    const westPts  = (adjacency.west  || _hasCornerPull(cornerPulls.nw) || _hasCornerPull(cornerPulls.sw))
      ? shorelineBoundaryPoints(wg, T, GHW, GHH, col, row,     col,     row + 1, adjacency.west)  : null;
```

- [ ] **Step 4: Compute each tile's 4 corner pulls once, before the shape branches**

Find:

```ts
      // Ramp classification (see docs/superpowers/specs/2026-08-30-terrainkit-ramp-slopes-design.md):
      // a dry tile's 4 corners derive from its real neighbors' elevation levels
      // (clamped to at most 1 level of slope); water tiles are never ramp-eligible,
      // so shorelines/riverbanks are completely unaffected by this block.
      const rampEligible = _isRampEligible(cell);
```

Replace with (adds the corner-pull computation right before it):

```ts
      // Computed once per tile (not per call site) and reused by both the
      // top-surface path below AND the 4 wall blocks further down — see
      // design spec's "diagonal-adjacency" finding for why this must not
      // be gated by this tile's own direct water adjacency.
      const cornerPulls = {
        nw: shorelineCornerPull(wg, col,     row),
        ne: shorelineCornerPull(wg, col + 1, row),
        se: shorelineCornerPull(wg, col + 1, row + 1),
        sw: shorelineCornerPull(wg, col,     row + 1),
      };

      // Ramp classification (see docs/superpowers/specs/2026-08-30-terrainkit-ramp-slopes-design.md):
      // a dry tile's 4 corners derive from its real neighbors' elevation levels
      // (clamped to at most 1 level of slope); water tiles are never ramp-eligible,
      // so shorelines/riverbanks are completely unaffected by this block.
      const rampEligible = _isRampEligible(cell);
```

- [ ] **Step 5: Pass `cornerPulls` (or the zero constant) at both `emitGroundSubTiles` call sites**

Find (the flat-shape call site):

```ts
        if (groundVariant !== null) {
          emitGroundSubTiles(
            col, row, cell, groundVariant, swY, nwY, neY, seY, 0, 1, 0, wx, wz, tr, tg, tb,
            waterAdjacency(wg, col, row),
          );
        } else {
```

Replace with:

```ts
        if (groundVariant !== null) {
          emitGroundSubTiles(
            col, row, cell, groundVariant, swY, nwY, neY, seY, 0, 1, 0, wx, wz, tr, tg, tb,
            waterAdjacency(wg, col, row), cornerPulls,
          );
        } else {
```

Find (the 'edge'-ramp call site):

```ts
          emitGroundSubTiles(
            col, row, cell, groundVariant, swY, nwY, neY, seY, n[0], n[1], n[2], wx, wz, tr, tg, tb,
            NO_WATER_ADJACENCY,
          );
```

Replace with:

```ts
          emitGroundSubTiles(
            col, row, cell, groundVariant, swY, nwY, neY, seY, n[0], n[1], n[2], wx, wz, tr, tg, tb,
            NO_WATER_ADJACENCY, { nw: NO_CORNER_PULL, ne: NO_CORNER_PULL, se: NO_CORNER_PULL, sw: NO_CORNER_PULL },
          );
```

- [ ] **Step 6: Update the 4 wall blocks**

Find the south wall block:

```ts
      const wallTopS = Math.min(nwY, neY);
      const wyS = physH(col, row + 1);
      if (wyS < wallTopS) {
        const d = 0.76;
        if (wg.get(col, row + 1).waterDepth > 0) {
          const pts = shorelineEdgePoints(wx, wz1, wx1, wz1);
          for (let i = 0; i < pts.length - 1; i++) {
```

Replace with:

```ts
      const wallTopS = Math.min(nwY, neY);
      const wyS = physH(col, row + 1);
      if (wyS < wallTopS) {
        const d = 0.76;
        const southWaterAdjacent = wg.get(col, row + 1).waterDepth > 0;
        if (southWaterAdjacent || _hasCornerPull(cornerPulls.sw) || _hasCornerPull(cornerPulls.se)) {
          const pts = shorelineBoundaryPoints(wg, T, GHW, GHH, col, row + 1, col + 1, row + 1, southWaterAdjacent);
          for (let i = 0; i < pts.length - 1; i++) {
```

(The rest of that block — the `addFace(...)` call inside the loop, and the `else { addFace(flat quad) }` fallback — stays exactly as it is today; only the `if` condition and the `const pts = ...` line change. `_hasCornerPull` is the module-level helper added in Step 2.)

Find the north wall block:

```ts
      const wallTopN = Math.min(swY, seY);
      const wyN = physH(col, row - 1);
      if (wyN < wallTopN) {
        const d = 0.50;
        if (wg.get(col, row - 1).waterDepth > 0) {
          const pts = shorelineEdgePoints(wx, wz, wx1, wz);
          for (let i = 0; i < pts.length - 1; i++) {
```

Replace with:

```ts
      const wallTopN = Math.min(swY, seY);
      const wyN = physH(col, row - 1);
      if (wyN < wallTopN) {
        const d = 0.50;
        const northWaterAdjacent = wg.get(col, row - 1).waterDepth > 0;
        if (northWaterAdjacent || _hasCornerPull(cornerPulls.nw) || _hasCornerPull(cornerPulls.ne)) {
          const pts = shorelineBoundaryPoints(wg, T, GHW, GHH, col, row, col + 1, row, northWaterAdjacent);
          for (let i = 0; i < pts.length - 1; i++) {
```

Find the east wall block:

```ts
      const wallTopE = Math.min(neY, seY);
      const wyE = physH(col + 1, row);
      if (wyE < wallTopE) {
        const d = 0.63;
        if (wg.get(col + 1, row).waterDepth > 0) {
          const pts = shorelineEdgePoints(wx1, wz, wx1, wz1);
          for (let i = 0; i < pts.length - 1; i++) {
```

Replace with:

```ts
      const wallTopE = Math.min(neY, seY);
      const wyE = physH(col + 1, row);
      if (wyE < wallTopE) {
        const d = 0.63;
        const eastWaterAdjacent = wg.get(col + 1, row).waterDepth > 0;
        if (eastWaterAdjacent || _hasCornerPull(cornerPulls.ne) || _hasCornerPull(cornerPulls.se)) {
          const pts = shorelineBoundaryPoints(wg, T, GHW, GHH, col + 1, row, col + 1, row + 1, eastWaterAdjacent);
          for (let i = 0; i < pts.length - 1; i++) {
```

Find the west wall block:

```ts
      const wallTopW = Math.min(swY, nwY);
      const wyW = physH(col - 1, row);
      if (wyW < wallTopW) {
        const d = 0.55;
        if (wg.get(col - 1, row).waterDepth > 0) {
          const pts = shorelineEdgePoints(wx, wz, wx, wz1);
          for (let i = 0; i < pts.length - 1; i++) {
```

Replace with:

```ts
      const wallTopW = Math.min(swY, nwY);
      const wyW = physH(col - 1, row);
      if (wyW < wallTopW) {
        const d = 0.55;
        const westWaterAdjacent = wg.get(col - 1, row).waterDepth > 0;
        if (westWaterAdjacent || _hasCornerPull(cornerPulls.nw) || _hasCornerPull(cornerPulls.sw)) {
          const pts = shorelineBoundaryPoints(wg, T, GHW, GHH, col, row, col, row + 1, westWaterAdjacent);
          for (let i = 0; i < pts.length - 1; i++) {
```

No further changes needed for this task's implementation — `_hasCornerPull` (Step 2) and `cornerPulls` (Step 4) are both already in scope everywhere they're used above.

- [ ] **Step 7: Update the 2 existing exact-value tests**

In `tests/world/TerrainGeometryBuilder.test.ts`, find the import line:

```ts
import { shorelineEdgePoints } from '@/world/ShorelineWobble';
```

Replace with:

```ts
import { shorelineBoundaryPoints } from '@/world/ShorelineCornerField';
```

Find the test `'wobbles the water-adjacent tile using the exact ShorelineWobble points (precise vertex check)'` and replace its body with (same grid/scenario, expected value now sourced from `shorelineBoundaryPoints`; tile (1,1)'s south edge runs from vertex (1,2) to vertex (2,2) in a 3x3 grid where `GHW=GHH=1, T=2`):

```ts
  it('wobbles the water-adjacent tile using the exact shoreline boundary points (precise vertex check)', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 2, { waterDepth: 2.0, feature: 'lake' }); // south of tile (1,1)
    const T = 2, SH = 0.55;
    const data = buildTerrainGeometryData(wg, 3, 3, 1, 1, T, SH, 1, 1, 1, 1);

    // Tile (1,1)'s south edge runs from vertex (1,2) to vertex (2,2) —
    // the exact same call emitGroundSubTiles() makes internally.
    const southEdgePts = shorelineBoundaryPoints(wg, T, 1, 1, 1, 2, 2, 2, true);
    const expectedZ = southEdgePts[1]![1];
    expect(expectedZ).not.toBe(2); // sanity: this lattice point really is perturbed

    const allPositions = [data.positions, ...Object.values(data.groundGeometry).map(g => g.positions)];
    const foundZs: number[] = [];
    for (const buf of allPositions) {
      for (let i = 0; i < buf.length; i += 3) {
        if (Math.abs(buf[i]! - southEdgePts[1]![0]) < 1e-9) foundZs.push(buf[i + 2]!);
      }
    }
    expect(foundZs.some(z => Math.abs(z - expectedZ) < 1e-9)).toBe(true);
  });
```

(Note: the old test searched for `x` close to `0.5` specifically, since the OLD wobble never moved X on a horizontal edge. Now that corner pull can also move X, this rewritten test searches for the vertex's own — possibly pulled — X coordinate instead, which is the correct generalization.)

Find the test `'a water-adjacent wall segment follows the exact ShorelineWobble points'` and replace its body with:

```ts
  it('a water-adjacent wall segment follows the exact shoreline boundary points', () => {
    const wg = new WorldGrid(3, 1);
    wg.set(1, 0, { feature: 'river', waterDepth: RIVER_DEPTH_WU });
    const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);

    // Tile 0's east wall runs along vertex (1,0) to vertex (1,1) (T=1, GHW=1, GHH=0).
    const expectedPts = shorelineBoundaryPoints(wg, 1, 1, 0, 1, 0, 1, 1, true);

    const base = data.positions;
    let foundWobbledPoint = false;
    for (let i = 0; i < base.length; i += 3) {
      const x = base[i]!, z = base[i + 2]!;
      if (Math.abs(z - expectedPts[1]![1]) < 1e-9 && Math.abs(x - expectedPts[1]![0]) < 1e-9) {
        foundWobbledPoint = true;
      }
    }
    expect(foundWobbledPoint).toBe(true);
    expect(expectedPts[1]![0]).not.toBe(0);
  });
```

- [ ] **Step 8: Add the diagonal-adjacency regression test**

Add this new test to the `'shoreline wobble — top surface'` describe block in `tests/world/TerrainGeometryBuilder.test.ts` (after the tests updated in Step 7):

```ts
  it('a tile with only a DIAGONAL water neighbor still agrees with its directly-water-adjacent neighbor at their shared corner (no gap)', () => {
    // 5x5 grid: water at (3,3). Tile (2,2) has NO direct orthogonal water
    // neighbor (its neighbors are (1,2),(3,2),(2,1),(2,3), none of which
    // are water) but DOES share vertex (3,3) with the water tile
    // diagonally. Tile (2,3) (south of (2,2)) directly borders water at
    // (3,3)... — actually (2,3)'s east neighbor (3,3) is water, so tile
    // (2,3) has a direct water adjacency to the east, sharing vertex (3,3)
    // (its own NE corner) with tile (2,2)'s SE corner (also vertex (3,3)).
    const wg = new WorldGrid(5, 5);
    wg.set(3, 3, { waterDepth: 2.0, feature: 'lake' });
    const T = 2, SH = 0.55, GHW = 2, GHH = 2;
    // Render both tiles (2,2) and (2,3) together so their shared corner
    // is present in the same output buffers.
    const data = buildTerrainGeometryData(wg, 5, 5, GHW, GHH, T, SH, 2, 2, 1, 2);

    // Vertex (3,3) is an inner_corner (only (3,3) itself is water among
    // its 4 surrounding tiles) -> non-zero pull, computed once and shared.
    const pull = shorelineCornerPull(wg, 3, 3);
    expect(pull[0]).not.toBe(0);
    expect(pull[1]).not.toBe(0);
    const expectedX = (3 - GHW) * T + pull[0];
    const expectedZ = (3 - GHH) * T + pull[1];

    // Both tile (2,2)'s SE corner and tile (2,3)'s NE corner render this
    // exact vertex — search every buffer for a vertex at the pulled
    // position (proves both tiles agree; if either used the plain
    // unpulled position instead, this exact (x,z) pair wouldn't appear,
    // or would only appear once instead of from both tiles' geometry).
    const allPositions = [data.positions, ...Object.values(data.groundGeometry).map(g => g.positions)];
    let found = false;
    for (const buf of allPositions) {
      for (let i = 0; i < buf.length; i += 3) {
        if (Math.abs(buf[i]! - expectedX) < 1e-9 && Math.abs(buf[i + 2]! - expectedZ) < 1e-9) found = true;
      }
    }
    expect(found).toBe(true);

    // And the OLD plain (unpulled) vertex position must be completely
    // absent from tile (2,2)'s own rendering at this corner — if it
    // still appeared, that would mean tile (2,2) rendered an unpulled
    // corner while tile (2,3) rendered the pulled one: a real gap.
    const plainX = (3 - GHW) * T, plainZ = (3 - GHH) * T;
    let foundPlain = false;
    for (const buf of allPositions) {
      for (let i = 0; i < buf.length; i += 3) {
        if (Math.abs(buf[i]! - plainX) < 1e-9 && Math.abs(buf[i + 2]! - plainZ) < 1e-9) foundPlain = true;
      }
    }
    expect(foundPlain).toBe(false);
  });
```

Add the needed import at the top of the test file (alongside the existing `shorelineBoundaryPoints` import added in Step 7):

```ts
import { shorelineCornerPull } from '@/world/ShorelineCornerField';
```

- [ ] **Step 9: Run the full `TerrainGeometryBuilder.test.ts` suite**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS — every test in the file, including the 2 rewritten exact-value tests, the new diagonal-adjacency test, and every pre-existing test untouched by this task (e.g. `'a tile with no water neighbor is completely unaffected'`, `'a plain land-elevation wall (no water involved) is unaffected'`).

If any pre-existing test fails, stop and re-check Steps 3–6 against the design spec's exact call-site mapping before proceeding — do not alter an unrelated test's expectations to force a pass.

- [ ] **Step 10: Run `tsc --noEmit` scoped to the changed files**

Run: `npx tsc --noEmit`
Expected: same 146 pre-existing errors as the mission-start baseline, no new ones introduced by this task (check the diff of error lists if the count differs at all).

- [ ] **Step 11: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
cat > /tmp/commit_msg.txt << 'EOF'
feat: wire dual-grid corner pull into TerrainGeometryBuilder

Top-surface sub-tile boundaries and all 4 wall blocks now use
shorelineBoundaryPoints() instead of the raw noise-only
shorelineEdgePoints(), so shoreline corners show real dual-grid shape
(coves/points/peninsulas) instead of just a wobble. Corner pull is
computed once per tile and applied regardless of direct water adjacency,
fixing a diagonal-adjacency gap risk found during design (see
docs/superpowers/specs/2026-09-02-dual-grid-shoreline-corners-design.md).

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 4: Wire corner pull into `WaterMeshBuilder.ts`

**Files:**
- Modify: `src/world/WaterMeshBuilder.ts`
- Modify: `tests/world/WaterMeshBuilder.test.ts`

**Interfaces:**
- Consumes: `shorelineBoundaryPoints` from `@/world/ShorelineCornerField` (Task 2).
- Produces: no new exports — `buildWaterMeshGeometryData()`'s signature/output shape unchanged.

- [ ] **Step 1: Update the import and the 4 edge computations**

In `src/world/WaterMeshBuilder.ts`, find:

```ts
import type { WorldGrid } from './WorldGrid';
import { shorelineEdgePoints } from './ShorelineWobble';
```

Replace with:

```ts
import type { WorldGrid } from './WorldGrid';
import { shorelineBoundaryPoints } from './ShorelineCornerField';
```

Find:

```ts
      // Each side's points always ordered per ShorelineWobble.ts's
      // convention (horizontal edges west-first, vertical edges
      // north-first), matching exactly what the land tile on the other
      // side of each edge computes — this is what guarantees the two
      // meshes meet with no gap.
      const westPts  = shorelineEdgePoints(wx,  wz,  wx,  wz1); // N -> S
      const southPts = shorelineEdgePoints(wx,  wz1, wx1, wz1); // W -> E
      const eastPts  = shorelineEdgePoints(wx1, wz,  wx1, wz1); // N -> S
      const northPts = shorelineEdgePoints(wx,  wz,  wx1, wz);  // W -> E
```

Replace with:

```ts
      // Each side's points always ordered per ShorelineCornerField's
      // convention (same as ShorelineWobble.ts's: horizontal edges
      // west-first, vertical edges north-first), matching exactly what
      // the land tile on the other side of each edge computes — this is
      // what guarantees the two meshes meet with no gap. Corner pull
      // (unlike the noise wobble) is included regardless of `*Dry` below
      // — even a water-water (non-boundary) side must reflect any pull
      // its corners pick up from a DIFFERENT, diagonally-adjacent land
      // tile, for consistency with that land tile's own rendering.
      const westPts  = shorelineBoundaryPoints(wg, T, GHW, GHH, col,     row,     col,     row + 1, westDry);  // N -> S
      const southPts = shorelineBoundaryPoints(wg, T, GHW, GHH, col,     row + 1, col + 1, row + 1, southDry); // W -> E
      const eastPts  = shorelineBoundaryPoints(wg, T, GHW, GHH, col + 1, row,     col + 1, row + 1, eastDry);  // N -> S
      const northPts = shorelineBoundaryPoints(wg, T, GHW, GHH, col,     row,     col + 1, row,     northDry); // W -> E
```

(The `southDry`/`northDry`/`eastDry`/`westDry` booleans are already computed just above this block in the existing code — no change needed there. The rest of the function — the `west`/`south`/`east`/`north` collapse-to-2-points logic, ring building, and fan triangulation — is unchanged.)

- [ ] **Step 2: Update the existing exact-value test**

In `tests/world/WaterMeshBuilder.test.ts`, find:

```ts
import { shorelineEdgePoints } from '@/world/ShorelineWobble';
```

Replace with:

```ts
import { shorelineBoundaryPoints } from '@/world/ShorelineCornerField';
```

Find the test `'a water tile bordering land wobbles its edge using the exact ShorelineWobble points'` and replace its body with:

```ts
  it('a water tile bordering land follows the exact shoreline boundary points', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 1, { waterDepth: 2.0, feature: 'lake' }); // dry land all around it
    const T = 2, GHW = 1, GHH = 1;
    const data = buildWaterMeshGeometryData(wg, 3, 3, GHW, GHH, T, 0.55);

    // Tile (1,1)'s south edge runs from vertex (1,2) to vertex (2,2) —
    // the exact same call buildWaterMeshGeometryData() makes internally.
    const southPts = shorelineBoundaryPoints(wg, T, GHW, GHH, 1, 2, 2, 2, true);
    const interiorPt = southPts[1]!;
    expect(interiorPt[1]).not.toBe(2); // sanity: really is perturbed

    let found = false;
    for (let i = 0; i < data.positions.length; i += 3) {
      if (Math.abs(data.positions[i]! - interiorPt[0]) < 1e-9 && Math.abs(data.positions[i + 2]! - interiorPt[1]) < 1e-9) {
        found = true;
      }
    }
    expect(found).toBe(true);
  });
```

- [ ] **Step 3: Add the cross-module (land/water) consistency test**

Add this new test to the same `describe('buildWaterMeshGeometryData', ...)` block:

```ts
  it('a shared shoreline vertex matches TerrainGeometryBuilder\'s land-side point exactly (no land/water seam)', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 1, { waterDepth: 2.0, feature: 'lake' }); // pond surrounded by land
    const T = 2, GHW = 1, GHH = 1, SH = 0.55;
    const waterData = buildWaterMeshGeometryData(wg, 3, 3, GHW, GHH, T, SH);
    const terrainData = buildTerrainGeometryData(wg, 3, 3, GHW, GHH, T, SH);

    // Vertex (2,2) is the pond's SE corner (see design spec's "isolated
    // pond" case) -- an inner_corner with a real, non-zero pull.
    const pulled = shorelineBoundaryPoints(wg, T, GHW, GHH, 2, 2, 2, 2, false)[0]!; // degenerate zero-length "edge" isolates just the corner
    expect(pulled[0]).not.toBeCloseTo(2, 5);

    const findPoint = (positions: number[], x: number, z: number) => {
      for (let i = 0; i < positions.length; i += 3) {
        if (Math.abs(positions[i]! - x) < 1e-9 && Math.abs(positions[i + 2]! - z) < 1e-9) return true;
      }
      return false;
    };
    const terrainAllPositions = [terrainData.positions, ...Object.values(terrainData.groundGeometry).map(g => g.positions)];
    const foundInWater = findPoint(waterData.positions, pulled[0], pulled[1]);
    const foundInTerrain = terrainAllPositions.some(buf => findPoint(buf, pulled[0], pulled[1]));
    expect(foundInWater).toBe(true);
    expect(foundInTerrain).toBe(true);
  });
```

Add the needed import at the top of the test file:

```ts
import { buildTerrainGeometryData } from '@/world/TerrainGeometryBuilder';
```

- [ ] **Step 4: Run the full `WaterMeshBuilder.test.ts` suite**

Run: `npx vitest run tests/world/WaterMeshBuilder.test.ts`
Expected: PASS — every test, including the rewritten exact-value test and the new cross-module consistency test.

- [ ] **Step 5: Run `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: same 146 pre-existing errors as baseline, no new ones.

- [ ] **Step 6: Commit**

```bash
git add src/world/WaterMeshBuilder.ts tests/world/WaterMeshBuilder.test.ts
cat > /tmp/commit_msg.txt << 'EOF'
feat: wire dual-grid corner pull into WaterMeshBuilder

The water-surface mesh's 4 tile edges now use shorelineBoundaryPoints(),
matching TerrainGeometryBuilder's land-side corners exactly (including at
vertices whose pull comes from a diagonally, not directly, adjacent
water/land tile) so the two meshes never separate at a shoreline.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 5: Full regression verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: same 9 pre-existing failures as the mission-start baseline (`tests/levels/towerGenerator.test.ts`, `tests/progression/talentSystem.test.ts` x2, `tests/world/WaterMaterial.test.ts`, plus whichever 5th pre-existing failure rounds out the original 9 — re-confirm the exact baseline list from this plan's Global Constraints section), zero new failures. Total passing count should be higher than baseline (new tests added in Tasks 1–4).

- [ ] **Step 2: Run `tsc --noEmit`**

Run: `npx tsc --noEmit 2>&1 | wc -l`
Expected: `146` (unchanged from baseline). If different, run `npx tsc --noEmit` without the `wc -l` to see the actual new/missing error lines and fix any introduced by this work before proceeding.

- [ ] **Step 3: Re-run the chunk-boundary and collider-streaming suites explicitly**

Run: `npx vitest run tests/scene/OverworldScene.chunk-terrain-alignment.test.ts tests/scene/OverworldScene.chunk-collider-streaming.test.ts`
Expected: PASS, unchanged (these don't reference shoreline values directly, confirmed during design, but re-run explicitly since this task's changes touch the exact functions these tests exercise indirectly through `buildTerrainGeometryData`/`buildWaterMeshGeometryData`).

- [ ] **Step 4: No commit needed** — this task is verification-only. If any check fails, return to the relevant earlier task and fix before proceeding to Task 6.

---

### Task 6: Live verification (dev server + visual check)

**Files:** none (manual verification), possibly re-tuning `SHORELINE_CORNER_PULL_WU` in `src/world/ShorelineCornerField.ts` if the live result warrants it.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background/async — leave running).

- [ ] **Step 2: Load the overworld and navigate to a lake, a river, and an ocean/beach shoreline**

Use the existing dev/debug camera or player controls to reach each of the 3 shoreline types. Take a screenshot of each.

- [ ] **Step 3: Confirm the visual change is real and correct**

For each screenshot, confirm:
- The shoreline shows visible coves/points/rounded corners — a real shape change, not just a jiggle (compare mentally against the pre-Phase-1 wobble-only look, or check out `git stash`/a throwaway branch at the previous commit if a direct before/after is needed).
- No visible gaps, floating geometry, or z-fighting at any shoreline, especially where the coastline turns a corner.
- Swim/walk transitions still feel correct at the (unchanged) gameplay boundary.

- [ ] **Step 4: If the effect reads as too subtle or too extreme, tune `SHORELINE_CORNER_PULL_WU`**

Edit `src/world/ShorelineCornerField.ts`'s `SHORELINE_CORNER_PULL_WU` constant (currently `0.5`). If changed, re-run `npx vitest run tests/world/ShorelineCornerField.test.ts` (the exact-value tests reference this constant symbolically via the exported name, not a hardcoded number, so they should still pass) and repeat Steps 2–3.

- [ ] **Step 5: Stop the dev server**

Stop the background process started in Step 1.

- [ ] **Step 6: Commit any tuning change (skip if no change was made)**

```bash
git add src/world/ShorelineCornerField.ts
cat > /tmp/commit_msg.txt << 'EOF'
tune: adjust SHORELINE_CORNER_PULL_WU after live verification

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 7: Update roadmap docs, push, and open the PR

**Files:**
- Modify: `TODO/organic_world_tiles_todo.md`
- Modify: `TODO/TODO_OVERVIEW.md`

- [ ] **Step 1: Check off Phase 1's tasks and update its status**

In `TODO/organic_world_tiles_todo.md`, change every `- [ ] **1.x — ...` under "Phase 1 — Real dual-grid shorelines" to `- [x] **1.x — ...`, and update the doc's top status line from:

```
> **Status: 🚧 Phase 0 shipped (2026-09-02), Phases 1-5 not yet started.**
```

to:

```
> **Status: 🚧 Phase 0 and Phase 1 shipped (2026-09-02), Phases 2-5 not yet started.**
```

Also update the Phase 1 section heading itself, from:

```
## Phase 1 — Real dual-grid shorelines (supersede `ShorelineWobble.ts`)
```

to:

```
## Phase 1 — Real dual-grid shorelines ✅ Shipped 2026-09-02
```

- [ ] **Step 2: Mirror the status change in `TODO/TODO_OVERVIEW.md`'s G16 entry**

Find the G16 entry referencing the organic world tiles roadmap (search for `organic_world_tiles_todo` or `G16` in `TODO/TODO_OVERVIEW.md`) and update its status text the same way (Phase 0 + Phase 1 shipped, Phases 2-5 pending).

- [ ] **Step 3: Commit the doc updates**

```bash
git add TODO/organic_world_tiles_todo.md TODO/TODO_OVERVIEW.md
cat > /tmp/commit_msg.txt << 'EOF'
docs: mark Phase 1 (dual-grid shorelines) shipped

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

- [ ] **Step 4: Push the branch**

Run: `git push -u origin HEAD`

- [ ] **Step 5: Open the pull request**

Check for an existing PR first: `gh pr list --repo HammerOfSteel/tomes_towers_and_transmutation --head <this-branch-name> --state all`. If none exists, use the `create_pull_request` tool (title: something like "Organic world tiles: Phase 1 — real dual-grid shorelines", targeting `main`, not a draft, body summarizing what shipped, verification results, and that Phases 2-5 are still to come on this same branch). Do NOT merge it.

---

## Summary

After this plan: `ShorelineWobble.ts` is untouched and still owns fine noise detail; a new `ShorelineCornerField.ts` adds genuine dual-grid corner displacement on top of it; `TerrainGeometryBuilder.ts` and `WaterMeshBuilder.ts` both consume the combined result at their existing call sites; a real diagonal-adjacency gap risk found during design is fixed and regression-tested; the full suite and `tsc` are clean against the mission-start baseline; the change is live-verified in the browser; and the roadmap doc, overview doc, and an open (unmerged) PR all reflect Phase 1 as shipped.
