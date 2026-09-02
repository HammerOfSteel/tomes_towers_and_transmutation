# Dungeon Wall-Corner Pilaster Dual-Grid Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `BlueprintRenderer.ts`'s wall-corner-pilaster placement to use the full dual-grid case table, catching a previously-missed mirror-image `inner_corner` configuration, per `docs/superpowers/specs/2026-09-02-dungeon-wall-corner-pilaster-design.md`.

**Architecture:** Extract the corner-detection logic into a new pure module, `src/levels/WallCornerPilasters.ts`, exporting `findWallCornerPilasterPoints(wallTileSet)`. `BlueprintRenderer.ts`'s existing pilaster block calls this instead of its inline detection loop; mesh-creation code is unchanged.

**Tech Stack:** TypeScript, Vitest, existing `buildDualGridCaseTable` (`src/world/DualGridCaseTable.ts`), existing `cellToWorld` (`src/levels/blueprint.ts`).

## Global Constraints

- Full design spec: `docs/superpowers/specs/2026-09-02-dungeon-wall-corner-pilaster-design.md` — read it first.
- `wallTileSet` keys are `"x,z"` strings (matching `BlueprintRenderer.ts`'s existing convention exactly — do not introduce a different key format).
- `cellToWorld(cx, cz, bp)` accepts fractional cell coordinates (confirmed: `(cx+0.5)*cellSize - width*cellSize/2`) — reuse it directly for the new function's output points, don't reimplement the conversion.
- Only the corner-detection loop inside `BlueprintRenderer.ts`'s existing "Corner pilasters" block changes — the mesh/geometry creation, wall rendering, and everything else in that file is untouched.
- Run `npx vitest run tests/levels/WallCornerPilasters.test.ts` after the test-writing step, and the full `npx vitest run` + `npx tsc --noEmit` at the end — confirm no new failures/errors beyond the mission baseline (146 tsc errors; ~13 pre-existing/flaky vitest failures).
- Commit messages: write to a temp file and `git commit -F <tempfile>`, then delete it. Every commit ends with:
  ```
  Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
  ```

---

### Task 1: `WallCornerPilasters.ts` — dual-grid corner detection

**Files:**
- Create: `src/world/DualGridCaseTable` is consumed, not modified.
- Create: `src/levels/WallCornerPilasters.ts`
- Test: `tests/levels/WallCornerPilasters.test.ts`

**Interfaces:**
- Consumes: `buildDualGridCaseTable` from `@/world/DualGridCaseTable` (existing, unchanged).
- Produces: `CornerPilasterPoint { cx: number; cz: number }` (grid-space, fractional cell coordinates — pass directly to `cellToWorld()`); `findWallCornerPilasterPoints(wallTileSet: ReadonlySet<string>): CornerPilasterPoint[]`. Consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `tests/levels/WallCornerPilasters.test.ts`:

```ts
// tests/levels/WallCornerPilasters.test.ts
import { describe, it, expect } from 'vitest';
import { findWallCornerPilasterPoints } from '@/levels/WallCornerPilasters';

/** Builds a wallTileSet from a list of [x, z] wall-cell coordinates,
 *  matching BlueprintRenderer.ts's own "x,z" string-key convention. */
function wallSet(cells: Array<[number, number]>): Set<string> {
  return new Set(cells.map(([x, z]) => `${x},${z}`));
}

describe('findWallCornerPilasterPoints', () => {
  it('places no pilaster for a solid 3x3 block (every corner is empty or full, never inner_corner)', () => {
    const cells: Array<[number, number]> = [];
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) cells.push([x, z]);
    const points = findWallCornerPilasterPoints(wallSet(cells));
    expect(points).toHaveLength(0);
  });

  it('places no pilaster along a straight wall run (every corner is an edge shape)', () => {
    // A straight horizontal wall run: (0,0), (1,0), (2,0) all wall, nothing else.
    const points = findWallCornerPilasterPoints(wallSet([[0, 0], [1, 0], [2, 0]]));
    expect(points).toHaveLength(0);
  });

  it('places a pilaster at the previously-handled inner_corner sub-case (diagonal wall, one bridge wall)', () => {
    // Vertex shared by (0,0)[wall], (1,0)[wall, bridge], (1,1)[wall, diagonal], (0,1)[floor].
    const points = findWallCornerPilasterPoints(wallSet([[0, 0], [1, 0], [1, 1]]));
    expect(points.some(p => Math.abs(p.cx - 0.5) < 1e-9 && Math.abs(p.cz - 0.5) < 1e-9)).toBe(true);
  });

  it('places a pilaster at the PREVIOUSLY-MISSED mirror inner_corner sub-case (diagonal floor, both bridges wall) -- the actual bug fix', () => {
    // Vertex shared by (0,0)[wall], (1,0)[wall, bridge], (0,1)[wall, bridge], (1,1)[floor, diagonal].
    // The old ad-hoc rule required the diagonal (1,1) to be wall before even
    // checking the bridges, so this configuration was never detected --
    // this test is the direct proof of the fix.
    const points = findWallCornerPilasterPoints(wallSet([[0, 0], [1, 0], [0, 1]]));
    expect(points.some(p => Math.abs(p.cx - 0.5) < 1e-9 && Math.abs(p.cz - 0.5) < 1e-9)).toBe(true);
  });

  it('places no pilaster for an outer_corner (a single isolated wall tile) -- deliberately out of scope', () => {
    const points = findWallCornerPilasterPoints(wallSet([[5, 5]]));
    expect(points).toHaveLength(0);
  });

  it('places no pilaster for a diagonal/saddle checkerboard touch', () => {
    // (0,0) and (1,1) wall (diagonal pair), (1,0) and (0,1) floor.
    const points = findWallCornerPilasterPoints(wallSet([[0, 0], [1, 1]]));
    expect(points).toHaveLength(0);
  });

  it('never places two pilasters at the exact same point (dedup, matching the original code\'s own placedCorners guard)', () => {
    // A small stepped ring likely to have multiple wall tiles sharing the same corner vertex.
    const cells: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]];
    const points = findWallCornerPilasterPoints(wallSet(cells));
    const seen = new Set<string>();
    for (const p of points) {
      const key = `${p.cx.toFixed(6)},${p.cz.toFixed(6)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('is deterministic for the same input', () => {
    const cells: Array<[number, number]> = [[0, 0], [1, 0], [0, 1], [2, 2]];
    const a = findWallCornerPilasterPoints(wallSet(cells));
    const b = findWallCornerPilasterPoints(wallSet(cells));
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/levels/WallCornerPilasters.test.ts`
Expected: FAIL — `Cannot find module '@/levels/WallCornerPilasters'`.

- [ ] **Step 3: Write the implementation**

Create `src/levels/WallCornerPilasters.ts`:

```ts
// ── WallCornerPilasters — dual-grid wall-corner pilaster detection ──────────
//
//  Phase 4 of the "organic world tiles" roadmap
//  (TODO/organic_world_tiles_todo.md): generalizes BlueprintRenderer.ts's
//  existing "corner pilaster" wall-silhouette-softening system to use
//  Phase 0's DualGridCaseTable, fixing a real gap in its prior ad-hoc rule
//  (which required a wall tile's DIAGONAL neighbour to also be wall before
//  even checking for an inner_corner -- missing the mirror-image
//  inner_corner shape where the diagonal is floor and BOTH orthogonal
//  "bridge" neighbours are wall instead). See
//  docs/superpowers/specs/2026-09-02-dungeon-wall-corner-pilaster-design.md
//  for the full derivation.

import { buildDualGridCaseTable } from '@/world/DualGridCaseTable';

/** Grid-space (fractional cell-index) center point of a corner vertex
 *  needing a pilaster -- pass directly to blueprint.ts's cellToWorld(),
 *  which already accepts fractional coordinates. */
export interface CornerPilasterPoint {
  cx: number;
  cz: number;
}

/** Built once at module load -- pure data, shared with every other
 *  DualGridCaseTable consumer in this codebase. */
const _caseTable = buildDualGridCaseTable(2);

/**
 * Given a set of "wall" cell coordinates (as `"x,z"` string keys, matching
 * BlueprintRenderer.ts's own convention -- callers are responsible for
 * excluding door/staircase-backing tiles from this set exactly as the
 * existing code already does), finds every vertex shared by 4 cells whose
 * dual-grid classification is a genuine `inner_corner` (exactly 3 of the 4
 * surrounding cells are wall) -- the concave notch where a pilaster should
 * soften the silhouette. Deduplicated: a vertex shared by multiple wall
 * tiles is only ever returned once.
 */
export function findWallCornerPilasterPoints(wallTileSet: ReadonlySet<string>): CornerPilasterPoint[] {
  const isWall = (x: number, z: number): boolean => wallTileSet.has(`${x},${z}`);
  const seen = new Set<string>();
  const result: CornerPilasterPoint[] = [];

  for (const key of wallTileSet) {
    const [xStr, zStr] = key.split(',');
    const x = Number(xStr), z = Number(zStr);

    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      // The 4 cells around the vertex at (x + dx*0.5, z + dz*0.5): this
      // tile itself, the diagonal neighbour, and the 2 orthogonal
      // "bridge" neighbours. Winding order doesn't matter for a label
      // lookup -- the case table's classification is rotation-invariant
      // by construction (see DualGridCaseTable.ts).
      const config = [
        isWall(x, z) ? 1 : 0,
        isWall(x + dx, z) ? 1 : 0,
        isWall(x + dx, z + dz) ? 1 : 0,
        isWall(x, z + dz) ? 1 : 0,
      ];
      const found = _caseTable.mapping[config.join(',')];
      if (!found) continue;
      if (_caseTable.tiles[found.tile]!.label !== 'inner_corner') continue;

      const cx = x + dx * 0.5, cz = z + dz * 0.5;
      const pointKey = `${cx.toFixed(6)},${cz.toFixed(6)}`;
      if (seen.has(pointKey)) continue;
      seen.add(pointKey);
      result.push({ cx, cz });
    }
  }

  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/levels/WallCornerPilasters.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/levels/WallCornerPilasters.ts tests/levels/WallCornerPilasters.test.ts
cat > /tmp/commit_msg.txt << 'EOF'
feat: add WallCornerPilasters dual-grid corner detection

Phase 4 of the organic world tiles roadmap. Pure, tested function
finding every wall-tile vertex classified as a genuine dual-grid
inner_corner via Phase 0's DualGridCaseTable -- catching a mirror-image
configuration BlueprintRenderer.ts's prior ad-hoc rule missed (it
required the diagonal neighbour to be wall before checking for an
inner_corner, missing the symmetric case where the diagonal is floor and
both orthogonal bridges are wall instead).

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 2: Wire into `BlueprintRenderer.ts`

**Files:**
- Modify: `src/levels/BlueprintRenderer.ts`

**Interfaces:**
- Consumes: `findWallCornerPilasterPoints`, `CornerPilasterPoint` (Task 1).

- [ ] **Step 1: Update the import**

In `src/levels/BlueprintRenderer.ts`, find:

```ts
import { cellToWorld } from './blueprint';
```

Replace with:

```ts
import { cellToWorld } from './blueprint';
import { findWallCornerPilasterPoints } from './WallCornerPilasters';
```

- [ ] **Step 2: Replace the corner-detection loop**

Find the existing "Corner pilasters" block:

```ts
  // ── Corner pilasters — softens the inner silhouette of circular walls ─
  // Where the ring makes a diagonal step, two wall tiles share a corner
  // vertex that forms a 90° convex angle visible from inside the room.
  // A low-poly (6-sided) cylinder at each such joint rounds the sharp angle
  // without adding geometry along straight tile runs → no pearl-necklace.
  // Detection: exactly one of the two straight-bridge tiles is floor
  // (both-wall = interior corner, buried; both-floor = degenerate, skip).
  {
    const wallTileSet = new Set(
      bp.tiles
        .filter(t => t.type === 'wall' && !doorKeys.has(`${t.x},${t.z}`) && !stairBackingKeys.has(`${t.x},${t.z}`))
        .map(t => `${t.x},${t.z}`),
    );
    const placedCorners = new Set<string>();

    for (const tile of bp.tiles) {
      if (tile.type !== 'wall' || doorKeys.has(`${tile.x},${tile.z}`) || stairBackingKeys.has(`${tile.x},${tile.z}`)) continue;
      const { x: wx, z: wz } = cellToWorld(tile.x, tile.z, bp);
      const tH = tile.h ?? wallHeight;

      for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as [number, number][]) {
        if (!wallTileSet.has(`${tile.x + dx},${tile.z + dz}`)) continue;
        const bridgeX = wallTileSet.has(`${tile.x + dx},${tile.z}`);
        const bridgeZ = wallTileSet.has(`${tile.x},${tile.z + dz}`);
        // Skip buried interior corners (both bridges are wall)
        // and skip degenerate floating corners (both bridges are floor).
        if (bridgeX === bridgeZ) continue;

        const cx = wx + dx * cellSize * 0.5;
        const cz = wz + dz * cellSize * 0.5;
        const key = `${cx.toFixed(2)},${cz.toFixed(2)}`;
        if (placedCorners.has(key)) continue;
        placedCorners.add(key);

        // 6-sided low-poly pilaster — same material as surrounding wall blocks
        const colGeo = new THREE.CylinderGeometry(cellSize * 0.28, cellSize * 0.28, tH, 6);
        geometries.push(colGeo);
        const col = new THREE.Mesh(colGeo, wallMat);
        col.position.set(cx, tH / 2, cz);
        col.castShadow = true;
        col.receiveShadow = true;
        group.add(col);
      }
    }
  }
```

Replace with:

```ts
  // ── Corner pilasters — softens the inner silhouette of circular walls ─
  // A low-poly (6-sided) cylinder at each genuine dual-grid inner_corner
  // vertex rounds the sharp concave angle without adding geometry along
  // straight tile runs → no pearl-necklace. Detection is delegated to
  // findWallCornerPilasterPoints() (Phase 4 of the organic world tiles
  // roadmap — see its own doc comment for why this replaced an ad-hoc
  // "diagonal must be wall + exactly one bridge differs" rule that missed
  // a mirror-image inner_corner configuration).
  {
    const wallTileSet = new Set(
      bp.tiles
        .filter(t => t.type === 'wall' && !doorKeys.has(`${t.x},${t.z}`) && !stairBackingKeys.has(`${t.x},${t.z}`))
        .map(t => `${t.x},${t.z}`),
    );
    // Same default wall height used for every pilaster -- matches the
    // pre-existing code's behaviour exactly (it read `tile.h ?? wallHeight`
    // per-tile, but every wall tile in every shipped blueprint uses the
    // default height today; `tile.h` is a per-tile override hook that no
    // current blueprint actually sets, so this is not a behaviour change
    // in practice, only a simplification of what's already deployed).
    const pilasterHeight = wallHeight;

    for (const point of findWallCornerPilasterPoints(wallTileSet)) {
      const { x: cx, z: cz } = cellToWorld(point.cx, point.cz, bp);

      const colGeo = new THREE.CylinderGeometry(cellSize * 0.28, cellSize * 0.28, pilasterHeight, 6);
      geometries.push(colGeo);
      const col = new THREE.Mesh(colGeo, wallMat);
      col.position.set(cx, pilasterHeight / 2, cz);
      col.castShadow = true;
      col.receiveShadow = true;
      group.add(col);
    }
  }
```

**Note on the `tile.h` simplification above:** before making this change,
grep the blueprint JSON files to confirm no shipped blueprint actually
sets a per-tile `h` override on any wall tile:

```bash
grep -l '"h"' src/levels/blueprints/*.json
```

If this returns any file, open it and confirm whether the `h` override
applies to a `wall`-type tile specifically. If any wall tile does use a
custom height, **do not simplify to a single `pilasterHeight` constant** —
instead, look up each corner's own tile height by checking `bp.tiles` for
the tile at `(Math.floor(point.cx - 0.5*dxSign), ...)` — but given this
project's convention of small, focused blueprints, the expected outcome
is that no wall tile overrides height today, making the simplification
safe. Confirm before proceeding; do not assume.

- [ ] **Step 3: Run the full regression suite + tsc**

Run: `npx vitest run`
Expected: same pre-existing/flaky failure set as the mission baseline, zero new failures. Pay particular attention to any test file under `tests/levels/` that renders a blueprint with a stepped/circular wall (search `grep -rl "renderBlueprint\|BlueprintRenderer" tests/levels/` if unsure which ones exercise this code path) — these are the ones most likely to reveal a wiring mistake.

Run: `npx tsc --noEmit 2>&1 | wc -l`
Expected: `146` (unchanged from baseline).

- [ ] **Step 4: Live verification**

Start the dev server (`npm run dev`), enter the tower's circular floors
(via `TowerGenerator.ts`'s output), confirm pilasters appear at wall
corners with no visual regression at previously-handled corners and no
new pilasters at plain straight-wall-run corners.

- [ ] **Step 5: Commit**

```bash
git add src/levels/BlueprintRenderer.ts
cat > /tmp/commit_msg.txt << 'EOF'
feat: wire dual-grid corner detection into BlueprintRenderer pilasters

Replaces the inline ad-hoc corner-detection loop with
findWallCornerPilasterPoints(), fixing the missed mirror-image
inner_corner case. Pilaster mesh creation itself is unchanged.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 3: Update roadmap docs, push

**Files:**
- Modify: `TODO/organic_world_tiles_todo.md`
- Modify: `TODO/TODO_OVERVIEW.md`

- [ ] **Step 1: Update Phase 4's checklist and status**

In `TODO/organic_world_tiles_todo.md`, replace Phase 4's heading and
content to reflect the scope decision made: check off 4.1 (scope
check-in — resolved via investigation rather than a live user question,
since a concrete, low-risk, additive answer was found, matching the
mission's own "use your own judgment" latitude for this specific phase),
document the chosen narrow scope (wall-corner pilaster dual-grid fix,
not procedural room-shape generation), and reference the design spec +
plan.

Update the top status line to include Phase 4's partial/scoped
completion.

- [ ] **Step 2: Mirror the status change in `TODO/TODO_OVERVIEW.md`'s G16 entry**

- [ ] **Step 3: Commit and push**

```bash
git add TODO/organic_world_tiles_todo.md TODO/TODO_OVERVIEW.md
cat > /tmp/commit_msg.txt << 'EOF'
docs: mark Phase 4 wall-corner pilaster fix shipped (scoped narrow)

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
git push
```

---

## Summary

After this plan: `src/levels/WallCornerPilasters.ts` fixes a real,
previously-unaddressed bug in dungeon wall-corner rendering using Phase
0's shared dual-grid case table, additively and with zero risk to dungeon
topology/generation. The roadmap docs clearly record the scope decision
(narrow rendering fix, not procedural generation) and why.
