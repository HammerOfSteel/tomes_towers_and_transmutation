# Terrain Corner Crack Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the black-crack/hole bug at diagonal elevation jumps by
extending `TerrainTerracing.ts` to enforce the 1-level-max-adjacent-drop
invariant across diagonal neighbors too, not just orthogonal ones.

**Architecture:** `TerrainTerracing.ts`'s `terraceElevation()` currently
only compares each tile against its 4 orthogonal neighbors
(`NEIGHBOR_OFFSETS_4`). Renaming/expanding this to 8 neighbors
(`NEIGHBOR_OFFSETS_8`, adding the 4 diagonal offsets) guarantees no two
corner-sharing tiles can ever differ by more than 1 elevation level, which
in turn guarantees `TerrainGeometryBuilder.ts`'s existing per-tile
`_tileCornerLevels()` clamp always agrees across every tile touching a
given corner — no code changes needed in `TerrainGeometryBuilder.ts`
beyond exporting `_tileCornerLevels()` for direct testability (already an
established pattern in this file — see `_mergedCornerPull`,
`_subTileGroundVariant`, `_rampGroundVariant`, all exported
underscore-prefixed test-only helpers).

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- Never lower a tile's elevation — only raise (existing invariant, must be
  preserved; see current `terraceElevation()` behavior and its tests).
- Water tiles (`ocean`/`deep_ocean` biome or `waterDepth > 0`) are excluded
  from both being raised and from acting as a neighbor pull — unchanged.
- Convergence must remain guaranteed and order-independent (the existing
  fixed-point iteration approach already gives this; adding neighbors
  doesn't change that property, per design spec).
- No change to `TerrainKit.ts`'s ramp classifier or its 5-shape taxonomy.

---

### Task 1: Extend terracing to 8-neighbor (add diagonal adjacency)

**Files:**
- Modify: `src/world/TerrainTerracing.ts`
- Test: `tests/world/TerrainTerracing.test.ts`

**Interfaces:**
- Consumes: `WorldGrid` (`wg.width`, `wg.height`, `wg.get(col, row)`,
  `wg.set(col, row, { elevation })`) — unchanged from existing usage.
- Produces: `terraceElevation(grid: WorldGrid): void` — same signature,
  now also raises tiles to satisfy diagonal adjacency, not just
  orthogonal.

- [ ] **Step 1: Write the failing test reproducing the diagonal 2-level jump**

Add to `tests/world/TerrainTerracing.test.ts` (inside the existing
`describe('terraceElevation', ...)` block):

```ts
  it('terraces a diagonal 2-level jump, not just orthogonal ones', () => {
    // A 2x2 block where every orthogonal pair already differs by at most
    // 1 level (satisfies the pre-existing 4-neighbor invariant), but the
    // diagonal pair (0,0)/(1,1) differs by 2 — the exact scenario that
    // produces a black-crack hole at their shared corner in
    // TerrainGeometryBuilder.ts, since that corner is shared by all 4 of
    // these tiles. See docs/superpowers/specs/2026-09-23-terrain-seam-and-organic-polish-research.md §1.2.
    const wg = new WorldGrid(2, 2);
    wg.set(0, 0, { elevation: 2 }); // A
    wg.set(1, 0, { elevation: 1 }); // B
    wg.set(0, 1, { elevation: 1 }); // C
    wg.set(1, 1, { elevation: 0 }); // D

    terraceElevation(wg);

    // Orthogonal pairs were already fine and stay put.
    expect(wg.get(0, 0).elevation).toBe(2); // A never lowered
    expect(wg.get(1, 0).elevation).toBe(1); // B unchanged (within 1 of A and D)
    expect(wg.get(0, 1).elevation).toBe(1); // C unchanged (within 1 of A and D)
    // D must be raised so the A/D diagonal pair is within 1 level too.
    expect(wg.get(1, 1).elevation).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/TerrainTerracing.test.ts -t "diagonal 2-level jump"`
Expected: FAIL — `wg.get(1, 1).elevation` is `0`, not `1` (current
4-neighbor-only pass never touches D, since D's only orthogonal neighbors
are B and C, both within 1 level of it already).

- [ ] **Step 3: Extend the neighbor offsets to 8 (add diagonals)**

In `src/world/TerrainTerracing.ts`, replace:

```ts
const NEIGHBOR_OFFSETS_4: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];
```

with:

```ts
/** All 8 neighbors (orthogonal + diagonal). Diagonal neighbors must be
 *  included, not just orthogonal, because a tile corner is shared by up
 *  to 4 tiles arranged in a 2x2 block, including one diagonal pair — if
 *  terracing only bounded orthogonal pairs, a diagonal pair could still
 *  differ by 2+ levels even at full convergence, which desyncs
 *  TerrainGeometryBuilder.ts's per-tile corner-elevation clamp between
 *  the two diagonal tiles and opens a real hole in the mesh/collider at
 *  their shared corner. See
 *  docs/superpowers/specs/2026-09-23-terrain-corner-crack-fix-design.md. */
const NEIGHBOR_OFFSETS_8: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];
```

Then update the one call site further down in the same file (inside
`terraceElevation()`'s inner loop) from:

```ts
        for (const [dc, dr] of NEIGHBOR_OFFSETS_4) {
```

to:

```ts
        for (const [dc, dr] of NEIGHBOR_OFFSETS_8) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/TerrainTerracing.test.ts`
Expected: PASS — all tests in the file, including the new one and the
3 pre-existing ones (orthogonal-chain, never-lowers, water-exclusion),
since 8-neighbor terracing is a strict superset of what 4-neighbor
terracing already guaranteed for those cases.

- [ ] **Step 5: Commit**

```bash
git add src/world/TerrainTerracing.ts tests/world/TerrainTerracing.test.ts
git commit -m "fix: terrace diagonal elevation jumps too, not just orthogonal ones"
```

---

### Task 2: Export `_tileCornerLevels` and add a corner-agreement regression test

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts:486`
- Test: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `terraceElevation` from `src/world/TerrainTerracing.ts` (Task 1).
- Produces: `_tileCornerLevels(wg: WorldGrid, col: number, row: number): [number, number, number, number]`
  now exported (`[sw, nw, ne, se]`, each a raw elevation-level number, not
  a boolean) — usable directly by tests and by any future sub-task 2.2/2.3
  work that needs a tile's clamped corner view.

- [ ] **Step 1: Export `_tileCornerLevels`**

In `src/world/TerrainGeometryBuilder.ts`, change:

```ts
function _tileCornerLevels(wg: WorldGrid, col: number, row: number): [number, number, number, number] {
```

to:

```ts
export function _tileCornerLevels(wg: WorldGrid, col: number, row: number): [number, number, number, number] {
```

- [ ] **Step 2: Write the failing regression test for the worked example**

Add to `tests/world/TerrainGeometryBuilder.test.ts` (add `_tileCornerLevels`
and `terraceElevation` to the existing import lines at the top of the
file — `_tileCornerLevels` from `@/world/TerrainGeometryBuilder` alongside
the other already-imported underscore helpers, `terraceElevation` from a
new `import { terraceElevation } from '@/world/TerrainTerracing';`):

```ts
describe('_tileCornerLevels corner agreement (crack-fix regression)', () => {
  it('every tile sharing a corner computes the identical clamped elevation for it, after terracing', () => {
    // Same worked example as TerrainTerracing.test.ts's diagonal-jump
    // case, but asserted at the geometry-corner layer this time — this is
    // the actual crack-fix contract: not just "terracing raises D", but
    // "every tile touching the shared corner now agrees on its height".
    const wg = new WorldGrid(2, 2);
    wg.set(0, 0, { elevation: 2 }); // A
    wg.set(1, 0, { elevation: 1 }); // B
    wg.set(0, 1, { elevation: 1 }); // C
    wg.set(1, 1, { elevation: 0 }); // D

    terraceElevation(wg);

    // The corner shared by all 4 tiles: A's NE corner, B's NW corner,
    // C's SE corner, D's SW corner (see TerrainGeometryBuilder.ts's
    // _tileCornerLevels() doc comment for the [sw, nw, ne, se] index
    // convention this relies on).
    const aCorner = _tileCornerLevels(wg, 0, 0)[2]; // A's NE
    const bCorner = _tileCornerLevels(wg, 1, 0)[1]; // B's NW
    const cCorner = _tileCornerLevels(wg, 0, 1)[3]; // C's SE
    const dCorner = _tileCornerLevels(wg, 1, 1)[0]; // D's SW

    expect(aCorner).toBe(bCorner);
    expect(aCorner).toBe(cCorner);
    expect(aCorner).toBe(dCorner);
  });

  it('agrees on every interior corner of a radial hill grid (broader stress case)', () => {
    // A rounded-distance "hill" — realistic terrain generation shape
    // (elevation falls off with Euclidean, not Chebyshev, distance from a
    // peak) — deliberately chosen because Euclidean rounding, unlike
    // Chebyshev/orthogonal-only distance, routinely produces diagonal
    // steps 2 levels apart even where every orthogonal step is safe,
    // exactly the class of real-world shape that produced the reported
    // in-game cracks near mountains/towers.
    const SIZE = 9;
    const CENTER = 4;
    const wg = new WorldGrid(SIZE, SIZE);
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const dist = Math.hypot(col - CENTER, row - CENTER);
        const elevation = Math.max(0, 4 - Math.round(dist));
        wg.set(col, row, { elevation });
      }
    }

    terraceElevation(wg);

    // Check every interior grid-corner lattice point (cc, cr) with all 4
    // surrounding tiles in bounds: (cc-1,cr-1)'s NE, (cc,cr-1)'s NW,
    // (cc-1,cr)'s SE, (cc,cr)'s SW must all agree.
    for (let cr = 1; cr < SIZE; cr++) {
      for (let cc = 1; cc < SIZE; cc++) {
        const swTile = _tileCornerLevels(wg, cc, cr)[0];
        const nwTile = _tileCornerLevels(wg, cc, cr - 1)[1];
        const seTile = _tileCornerLevels(wg, cc - 1, cr)[3];
        const neTile = _tileCornerLevels(wg, cc - 1, cr - 1)[2];
        expect(swTile).toBe(nwTile);
        expect(swTile).toBe(seTile);
        expect(swTile).toBe(neTile);
      }
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails without Task 1's fix**

Run: `git stash` (temporarily reverts Task 1's `TerrainTerracing.ts`
change while keeping this test), then:
`npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "corner agreement"`
Expected: FAIL — the worked-example test fails because `dCorner` (D's own
view, `0`) disagrees with `aCorner` (A's view, `1`); the radial-hill test
likely also fails at one or more corners. Then run `git stash pop` to
restore Task 1's fix before continuing.

- [ ] **Step 4: Run test to verify it passes with the fix in place**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS — the full file (all pre-existing tests plus the 2 new
ones in the `_tileCornerLevels corner agreement` block).

- [ ] **Step 5: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "test: assert every tile sharing a corner agrees on its elevation"
```

---

### Task 3: Full regression pass, typecheck, and playtest handoff

**Files:** None modified — verification only.

**Interfaces:** N/A.

- [ ] **Step 1: Run the full world test suite**

Run: `npx vitest run tests/world --poolOptions.threads.maxThreads=2`
Expected: same pass/fail counts as the pre-existing baseline (per prior
sessions on this branch, `WaterMaterial.test.ts` and
`StoneTowerKit.test.ts` may show pre-existing, environment-flaky timeouts
under sandbox contention — if either fails, re-run that single file in
isolation to confirm it's the known flake, not a real regression from
this change). No other file should show new failures.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: same error count/list as the pre-existing baseline (this
change touches no types consumed elsewhere in a breaking way — only adds
an `export` keyword and a renamed internal constant). Confirm no new
errors reference `TerrainTerracing.ts` or `TerrainGeometryBuilder.ts`.

- [ ] **Step 3: Report to the user for the human playtest gate**

Summarize for the user (per the `research-driven-world-polish` skill's
required playtest-gate step): what changed (terracing now also considers
diagonal neighbors, closing the shared-corner disagreement that caused
black cracks/fall-through holes at slopes), and ask them to regenerate an
overworld (any seed/shape) and confirm: (a) no black wedge/crack gaps are
visible near mountains, towers, or terraced slopes, and (b) walking near
a slope no longer causes falling partway through the ground. Do not
proceed to sub-task 2.2 (organic geometry softening) until the user
confirms.
