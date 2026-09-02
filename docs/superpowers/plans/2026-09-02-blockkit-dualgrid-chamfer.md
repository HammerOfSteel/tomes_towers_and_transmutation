# BlockKit Dual-Grid Chamfer Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `BlockKit.ts`'s `getChamferFlags()` two-neighbour-only rule with a full dual-grid case-table classification, fixing the `outer_corner`/`diagonal` conflation identified in design — chamfer only a genuine `outer_corner`, never a `diagonal`/saddle touch.

**Architecture:** `getChamferFlags()` builds each corner's 4-cell vertex config (diagonal neighbour + 2 orthogonal neighbours + the always-occupied self cell, in `[NW, NE, SE, SW]` winding) and looks it up in a module-level, once-built `buildDualGridCaseTable(2)` (mirroring `ShorelineCornerField.ts`'s own pattern) — chamfer iff the resulting canonical label is exactly `'outer_corner'`.

**Tech Stack:** TypeScript, Vitest, existing `buildDualGridCaseTable` (`src/world/DualGridCaseTable.ts`).

## Global Constraints

- Full design spec: `docs/superpowers/specs/2026-09-02-blockkit-dualgrid-chamfer-design.md` — read it first, especially "Investigation findings" (the hand-verified fact that all 5 existing chamfer tests resolve identically under the new rule, and the geometric fact that the self cell is always diagonally opposite the diagonal neighbour and adjacent to both orthogonals, for every one of the 4 corners).
- `getChamferFlags()`'s public signature is unchanged — same parameters, same `ChamferFlags` return shape, same `suppressChamfer` short-circuit behaviour (checked first, unaffected by this change).
- No other file calls `getChamferFlags()` directly (confirmed by grep during design) — this is a self-contained change to `BlockKit.ts` plus its own test file.
- Run `npx vitest run tests/world/BlockKit.test.ts` after the test-writing step, and the full `npx vitest run` + `npx tsc --noEmit` at the end — confirm no new failures/errors beyond the established mission baseline (146 tsc errors; 13 pre-existing/flaky vitest failures, confirmed identical between a clean baseline checkout and this branch during Phase 1's verification).
- Commit messages: write to a temp file and `git commit -F <tempfile>`, then delete it. Every commit ends with:
  ```
  Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
  ```

---

### Task 1: Generalize `getChamferFlags()` to use the dual-grid case table

**Files:**
- Modify: `src/world/buildings/BlockKit.ts`
- Modify: `tests/world/BlockKit.test.ts`

**Interfaces:**
- Consumes: `buildDualGridCaseTable` from `@/world/DualGridCaseTable` (existing, unchanged).
- Produces: no new exports — `getChamferFlags()`'s existing signature/return type (`ChamferFlags`) is unchanged; only its internal classification logic changes.

- [ ] **Step 1: Write the failing test for the new diagonal/saddle behaviour**

In `tests/world/BlockKit.test.ts`, add this test inside the existing `describe('BlockKit — chamfer-flag classification (the core marching-squares-style test)', ...)` block, right after the `'a suppress-chamfer override forces all corners sharp regardless of neighbours'` test:

```ts
  it('a diagonal-only touch (self + NW-diagonal neighbour occupied, both orthogonals empty) does NOT chamfer that corner (dual-grid saddle case)', () => {
    // Cell at origin: NW-diagonal neighbour (-1, 0, -1) occupied, N (0,0,-1)
    // and W (-1,0,0) both empty. Under the OLD two-neighbour-only rule this
    // chamfered (both orthogonals empty); under the new dual-grid rule this
    // is a genuine 'diagonal'/saddle shape (self + the opposite diagonal
    // cell occupied, both orthogonals empty) and must NOT chamfer, since
    // chamfering would visually pull the two diagonally-touching cells
    // apart at the one point they share.
    const grid = createBlockGrid();
    setBlock(grid, 0, 0, 0, 'earth');
    setBlock(grid, -1, 0, -1, 'earth'); // NW-diagonal neighbour only
    const flags = getChamferFlags(grid, 0, 0, 0);
    expect(flags.NW).toBe(false);
    // The other 3 corners are unaffected by this specific diagonal
    // neighbour (their own diagonal/orthogonal cells are still all empty)
    // and remain genuine outer_corner shapes -- still chamfered.
    expect(flags.NE).toBe(true);
    expect(flags.SE).toBe(true);
    expect(flags.SW).toBe(true);
  });

  it('every existing chamfer scenario in this file resolves identically under the new dual-grid classification (regression proof, not just re-run)', () => {
    // Re-derives each of the 4 preceding tests' expected flags directly
    // from buildDualGridCaseTable(2) itself (rather than re-running
    // getChamferFlags(), which would be circular) to prove the new
    // implementation's classification agrees with the case table's own
    // already-tested (Phase 0) canonical shapes, corner by corner.
    const table = buildDualGridCaseTable(2);
    const labelFor = (config: number[]): string => {
      const found = table.mapping[config.join(',')]!;
      return table.tiles[found.tile]!.label;
    };
    // Isolated single block: every corner's [diag, ortho, self, ortho] = [0,0,1,0] -> outer_corner.
    expect(labelFor([0, 0, 1, 0])).toBe('outer_corner');
    // Buried in a solid 3x3: every corner's config = [1,1,1,1] -> full (never outer_corner).
    expect(labelFor([1, 1, 1, 1])).not.toBe('outer_corner');
    // Straight wall-run cell (N and S filled, E/W empty, diagonals empty):
    // NW corner = [diagNW=0, N=1, self=1, W=0] -> edge (never outer_corner).
    expect(labelFor([0, 1, 1, 0])).not.toBe('outer_corner');
  });
```

Add the needed import at the top of the test file (alongside the existing `getChamferFlags` import):

```ts
import { buildDualGridCaseTable } from '@/world/DualGridCaseTable';
```

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `npx vitest run tests/world/BlockKit.test.ts`
Expected: the new `'a diagonal-only touch...'` test FAILS (`flags.NW` is currently `true` under the old rule, not `false`); the "resolves identically" test PASSES already (it only calls `buildDualGridCaseTable` directly, not `getChamferFlags`); every pre-existing test in the file still PASSES (confirming the design spec's hand-verification was correct — no other test in this file happens to exercise the diagonal-only case).

- [ ] **Step 3: Implement the new classification**

In `src/world/buildings/BlockKit.ts`, find the import line:

```ts
import * as THREE from 'three';
import { mergeGroupMeshesByMaterial } from '@/scene/MeshMergeUtils';
```

Replace with:

```ts
import * as THREE from 'three';
import { mergeGroupMeshesByMaterial } from '@/scene/MeshMergeUtils';
import { buildDualGridCaseTable } from '@/world/DualGridCaseTable';
```

Find the `getChamferFlags()` function:

```ts
/**
 * Which of a cell's 4 vertical edges should be chamfered, based purely on
 * neighbour occupancy (the marching-squares-style exterior-corner test).
 * `suppressChamfer`, when it returns true for this cell, forces every edge
 * sharp regardless of neighbours (used by e.g. dwarven "monumental" cells
 * that should read as deliberately hard-edged masonry).
 */
export function getChamferFlags(
  grid: BlockGrid,
  bx: number, by: number, bz: number,
  suppressChamfer?: (bx: number, by: number, bz: number) => boolean,
): ChamferFlags {
  if (suppressChamfer?.(bx, by, bz)) {
    return { NW: false, NE: false, SE: false, SW: false };
  }
  const nEmpty = !hasBlock(grid, bx + DIRS.N[0], by + DIRS.N[1], bz + DIRS.N[2]);
  const sEmpty = !hasBlock(grid, bx + DIRS.S[0], by + DIRS.S[1], bz + DIRS.S[2]);
  const eEmpty = !hasBlock(grid, bx + DIRS.E[0], by + DIRS.E[1], bz + DIRS.E[2]);
  const wEmpty = !hasBlock(grid, bx + DIRS.W[0], by + DIRS.W[1], bz + DIRS.W[2]);
  return {
    NW: nEmpty && wEmpty,
    NE: nEmpty && eEmpty,
    SE: sEmpty && eEmpty,
    SW: sEmpty && wEmpty,
  };
}
```

Replace with:

```ts
/** Built once at module load — pure data, shared with ShorelineCornerField.ts's
 *  own identical pattern (see docs/superpowers/specs/2026-09-02-dual-grid-case-table-usage.md). */
const _chamferCaseTable = buildDualGridCaseTable(2);

/** A cell is always occupied when getChamferFlags() is asked about it (the
 *  function's own contract — see its doc comment) — this constant avoids a
 *  redundant hasBlock() self-lookup at every one of the 4 corners below. */
const SELF_OCCUPIED = 1;

/**
 * Which of a cell's 4 vertical edges should be chamfered, based on the full
 * dual-grid classification of the vertex at that corner: the corner's own
 * diagonal neighbour, its two orthogonal neighbours, and the cell itself
 * (always occupied) — chamfer iff that 4-cell configuration is exactly the
 * dual-grid `outer_corner` shape (a genuinely isolated tip), never the
 * `diagonal`/saddle shape (two cells touching only at a shared point, where
 * chamfering would visually pull them apart) that a naive two-neighbour
 * check can't distinguish from it. See
 * docs/superpowers/specs/2026-09-02-blockkit-dualgrid-chamfer-design.md for
 * the full derivation (including why `edge`/`inner_corner`/`full` never
 * need to chamfer either, matching this rule's `outer_corner`-only test).
 * `suppressChamfer`, when it returns true for this cell, forces every edge
 * sharp regardless of neighbours (used by e.g. dwarven "monumental" cells
 * that should read as deliberately hard-edged masonry) — checked first,
 * independent of the case-table classification below.
 */
export function getChamferFlags(
  grid: BlockGrid,
  bx: number, by: number, bz: number,
  suppressChamfer?: (bx: number, by: number, bz: number) => boolean,
): ChamferFlags {
  if (suppressChamfer?.(bx, by, bz)) {
    return { NW: false, NE: false, SE: false, SW: false };
  }
  const occ = (c: number, r: number): number => (hasBlock(grid, c, by, r) ? 1 : 0);
  const isOuterCorner = (config: number[]): boolean => {
    const found = _chamferCaseTable.mapping[config.join(',')];
    if (!found) return false;
    return _chamferCaseTable.tiles[found.tile]!.label === 'outer_corner';
  };
  // Each corner's [NW, NE, SE, SW] vertex config: the self cell always sits
  // diagonally opposite that corner's own diagonal neighbour, and adjacent
  // to both of that corner's orthogonal neighbours (see design spec).
  const nw = isOuterCorner([occ(bx - 1, bz - 1), occ(bx, bz - 1), SELF_OCCUPIED, occ(bx - 1, bz)]);
  const ne = isOuterCorner([occ(bx, bz - 1), occ(bx + 1, bz - 1), occ(bx + 1, bz), SELF_OCCUPIED]);
  const se = isOuterCorner([SELF_OCCUPIED, occ(bx + 1, bz), occ(bx + 1, bz + 1), occ(bx, bz + 1)]);
  const sw = isOuterCorner([occ(bx - 1, bz), SELF_OCCUPIED, occ(bx, bz + 1), occ(bx - 1, bz + 1)]);
  return { NW: nw, NE: ne, SE: se, SW: sw };
}
```

Note: `DIRS` and the old `nEmpty`/`sEmpty`/`eEmpty`/`wEmpty` locals are no
longer referenced by `getChamferFlags()` — but `DIRS` is still used by
`getFaceVisibility()` right below it in the same file, so do NOT remove
the `DIRS` constant itself, only the old function body shown above.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/world/BlockKit.test.ts`
Expected: PASS — every test in the file, including the 2 new ones.

- [ ] **Step 5: Run the full regression suite + tsc**

Run: `npx vitest run`
Expected: same pre-existing failure set as the established baseline (13 tests, unrelated to BlockKit), zero new failures.

Run: `npx tsc --noEmit 2>&1 | wc -l`
Expected: `146` (unchanged from baseline).

- [ ] **Step 6: Live verification**

Start the dev server (`npm run dev`), load a settlement with at least 2
different factions' buildings, confirm building silhouettes still read as
expected (softened isolated corners, sharp wall-run corners) with no
obviously-broken/inverted geometry. This change only alters behaviour for
the narrow diagonal-touching case, so a broad "buildings still look
right" pass is the appropriate check — not a hunt for one specific
diagonal-touch instance.

- [ ] **Step 7: Commit**

```bash
git add src/world/buildings/BlockKit.ts tests/world/BlockKit.test.ts
cat > /tmp/commit_msg.txt << 'EOF'
feat: generalize BlockKit chamfer to the full dual-grid case table

getChamferFlags() now classifies each corner's full 4-cell vertex config
(diagonal + 2 orthogonal neighbours + the always-occupied self cell)
against Phase 0's DualGridCaseTable, chamfering only a genuine
outer_corner -- fixing a conflation with the diagonal/saddle shape (two
cells touching only at a shared point) that the old two-neighbour-only
rule couldn't distinguish. All 5 pre-existing chamfer tests verified to
resolve identically; the roadmap's larger kit-of-parts mesh-swap
architecture is deliberately deferred (documented in the design spec) as
it needs a live user check-in before wider rollout.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 2: Update roadmap docs, push

**Files:**
- Modify: `TODO/organic_world_tiles_todo.md`
- Modify: `TODO/TODO_OVERVIEW.md`

- [ ] **Step 1: Update Phase 2's checklist and status**

In `TODO/organic_world_tiles_todo.md`, change the Phase 2 heading from
`## Phase 2 — Extend \`BlockKit.ts\` to a true dual-grid + kit-of-parts building system`
to
`## Phase 2 — Extend \`BlockKit.ts\` to the full dual-grid case table ✅ Shipped 2026-09-02 (chamfer classification only — kit-of-parts deferred, see below)`,
check off item 2.1 (design spec) as done with a note that it resolved to
the classification-only scope, and add a note after the existing item
list (before the next `---`) explaining that 2.2–2.6 (the kit-of-parts
mesh-swap architecture) remain unstarted and are deliberately deferred —
point at `docs/superpowers/specs/2026-09-02-blockkit-dualgrid-chamfer-design.md`'s
"Rejected alternative" section for the reasoning (needs a live user
check-in before wider rollout per the roadmap's own 2.5, not something an
autonomous pass can complete responsibly).

Update the top status line from
`> **Status: 🚧 Phase 0 and Phase 1 shipped (2026-09-02), Phases 2-5 not yet started.**`
to
`> **Status: 🚧 Phase 0 and Phase 1 shipped, Phase 2 partially shipped (chamfer classification; kit-of-parts deferred) (2026-09-02), Phases 3-5 not yet started.**`.

- [ ] **Step 2: Mirror the status change in `TODO/TODO_OVERVIEW.md`'s G16 entry**

Update the G16 row's Phase 2 mention the same way (chamfer classification
shipped, kit-of-parts deferred).

- [ ] **Step 3: Commit and push**

```bash
git add TODO/organic_world_tiles_todo.md TODO/TODO_OVERVIEW.md
cat > /tmp/commit_msg.txt << 'EOF'
docs: mark Phase 2 chamfer classification shipped (kit-of-parts deferred)

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
git push
```

---

## Summary

After this plan: `BlockKit.ts`'s `getChamferFlags()` uses the same shared
`DualGridCaseTable` Phase 1 already relies on, fixing a real (if narrow)
classification bug; the larger kit-of-parts mesh-swap architecture is
explicitly, visibly deferred rather than silently dropped or half-built;
the full suite and `tsc` stay clean against the mission baseline; the
change is live-verified in the browser; and the roadmap docs reflect the
actual (partial, and why) shipped scope.
