# Ground Tile Texture & Mesh Variety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the overworld's gameplay ground tiles look less flat/uniform by adding
deterministic per-tile color-variant patchiness (grass/dirt/stone-ish look variety within each
existing elevation band) and small organic corner-height jitter to the terrain mesh, without
changing the file's public API, without new draw calls, and without touching collision-critical
wall faces.

**Architecture:** All changes are contained in `src/world/TerrainGeometryBuilder.ts`. Two new
pure, exported-for-testing helper functions are added: `cellVariantIndex(col, row): number` (which
of 3 look-variants a cell uses, deterministic hash of its own coordinates) and
`cornerHeightJitter(cornerCol, cornerRow): number` (a small ± world-unit Y offset for a *grid
corner* — shared by all cells touching that corner, so adjacent tiles never show seams/gaps). The
existing single-level `BIOME` array becomes a `BIOME_VARIANTS` 2D array (5 elevation levels × 3
variants each). `addFace` calls for top faces apply the corner jitter to each of the 4 vertices'
Y coordinates; wall faces and all other geometry are untouched.

**Tech Stack:** TypeScript, Three.js (consumed downstream, not directly imported by this file),
Vitest for unit tests, existing `WorldGrid` data model.

## Global Constraints

- Corner-jitter amplitude must be small enough not to break existing collision/traversal
  assertions in `tests/e2e/exterior.test.ts` — if any such test needs updating, the fix is to
  *reduce jitter amplitude*, not to loosen the test's precision (per the design doc's explicit
  scope boundary).
- `buildTerrainGeometryData`'s exported signature, parameter list, and return shape
  (`{ positions, normals, colors, indices }`) must not change — both the visual mesh and the
  physics collider in `OverworldScene.ts` call this same function and must continue to do so
  without modification.
- No new external asset files, textures, or npm dependencies — stays within the project's
  zero-external-asset "Code-First" policy.
- Water-biome cells (`cell.biome === 'water'`) and river cells (`cell.feature === 'river'` /
  `'river_bank'`) keep their existing exact color-selection logic untouched — variant noise applies
  only to plain land cells, since water rendering is out of scope for this phase (Phase 5 replaces
  it entirely) and the existing `tests/world/TerrainGeometryBuilder.test.ts` water-color-ratio test
  must keep passing unmodified.

---

### Task 1: Deterministic per-cell variant index helper

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts` (add new exported function near the top, after imports)
- Test: `tests/world/TerrainGeometryBuilder.test.ts` (add new `describe` block)

**Interfaces:**
- Produces: `export function cellVariantIndex(col: number, row: number, variantCount: number): number`
  — returns an integer in `[0, variantCount)`, deterministic for a given `(col, row, variantCount)`
  triple. Used by Task 3 to pick a color variant per cell.

- [ ] **Step 1: Write the failing test**

Add this `describe` block to `tests/world/TerrainGeometryBuilder.test.ts` (append after the last
existing `describe`'s closing, still inside the file, add the new import alongside the existing one):

```typescript
import { buildTerrainGeometryData, cellVariantIndex } from '@/world/TerrainGeometryBuilder';
```

(Replace the existing `import { buildTerrainGeometryData } from '@/world/TerrainGeometryBuilder';`
line with the combined import above.)

```typescript
describe('cellVariantIndex', () => {
  it('is deterministic for the same inputs', () => {
    expect(cellVariantIndex(5, 7, 3)).toBe(cellVariantIndex(5, 7, 3));
  });

  it('stays within [0, variantCount)', () => {
    for (let col = 0; col < 20; col++) {
      for (let row = 0; row < 20; row++) {
        const v = cellVariantIndex(col, row, 3);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(3);
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });

  it('produces more than one distinct value across many cells (not a constant)', () => {
    const values = new Set<number>();
    for (let col = 0; col < 20; col++) {
      for (let row = 0; row < 20; row++) {
        values.add(cellVariantIndex(col, row, 3));
      }
    }
    expect(values.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: FAIL — `cellVariantIndex` is not exported (TypeScript/module error or `undefined is not
a function`).

- [ ] **Step 3: Write minimal implementation**

In `src/world/TerrainGeometryBuilder.ts`, add this function after the existing imports and before
the `BIOME` constant:

```typescript
/**
 * Deterministic per-cell hash → integer variant index in [0, variantCount).
 * Same (col, row, variantCount) always yields the same result. Uses a cheap
 * integer mix (not mulberry32/PRNG-stream — no state, single call per cell,
 * so a direct hash is simpler and equally deterministic).
 */
export function cellVariantIndex(col: number, row: number, variantCount: number): number {
  let h = (col * 374761393 + row * 668265263) | 0; // large odd primes, standard integer hash mix
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  const unsigned = h >>> 0;
  return unsigned % variantCount;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS (all tests in the file, including the 3 new ones and the 3 pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "feat: add deterministic per-cell variant hash for terrain tiles"
```

---

### Task 2: Deterministic per-corner height jitter helper

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Test: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (independent helper).
- Produces: `export function cornerHeightJitter(cornerCol: number, cornerRow: number): number` —
  returns a small deterministic float in `[-0.03, 0.03]` (world units), keyed by *grid corner*
  coordinates (integer lattice points, one more than the tile count in each dimension), not by
  cell/tile coordinates. Used by Task 3 to jitter the 4 corners of each tile's top face so that
  cells sharing a corner get the identical jittered value (no seams).

- [ ] **Step 1: Write the failing test**

Add to `tests/world/TerrainGeometryBuilder.test.ts`, update the import line again:

```typescript
import { buildTerrainGeometryData, cellVariantIndex, cornerHeightJitter } from '@/world/TerrainGeometryBuilder';
```

```typescript
describe('cornerHeightJitter', () => {
  it('is deterministic for the same corner coordinates', () => {
    expect(cornerHeightJitter(3, 4)).toBe(cornerHeightJitter(3, 4));
  });

  it('stays within a small bounded range', () => {
    for (let c = 0; c < 15; c++) {
      for (let r = 0; r < 15; r++) {
        const j = cornerHeightJitter(c, r);
        expect(j).toBeGreaterThanOrEqual(-0.03);
        expect(j).toBeLessThanOrEqual(0.03);
      }
    }
  });

  it('gives adjacent tiles sharing a corner the same jitter for that corner', () => {
    // Tile (col=2,row=2)'s "south-east" corner is grid corner (3,3).
    // Tile (col=3,row=2)'s "south-west" corner is the SAME grid corner (3,3).
    const sharedCornerFromTileA = cornerHeightJitter(3, 3);
    const sharedCornerFromTileB = cornerHeightJitter(3, 3);
    expect(sharedCornerFromTileA).toBe(sharedCornerFromTileB);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: FAIL — `cornerHeightJitter` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add this function directly after `cellVariantIndex` in `src/world/TerrainGeometryBuilder.ts`:

```typescript
/** Max Y-offset (world units) applied to a single grid corner by cornerHeightJitter. */
const CORNER_JITTER_MAX = 0.03;

/**
 * Deterministic per-GRID-CORNER (not per-cell) small Y jitter, in world units,
 * within [-CORNER_JITTER_MAX, +CORNER_JITTER_MAX]. Keying by corner lattice
 * coordinates (rather than cell coordinates) guarantees that every tile
 * sharing a given corner computes the identical jitter value for it — so
 * adjacent tiles' top faces never separate at their shared edge/corner.
 */
export function cornerHeightJitter(cornerCol: number, cornerRow: number): number {
  let h = (cornerCol * 1274126177 + cornerRow * 2654435761) | 0;
  h = (h ^ (h >>> 15)) * 2246822519 | 0;
  h = h ^ (h >>> 13);
  const unit = (h >>> 0) / 4294967296; // → [0, 1)
  return (unit * 2 - 1) * CORNER_JITTER_MAX; // → [-max, +max]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS (all tests, including the 3 new corner-jitter tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "feat: add deterministic per-corner height jitter helper for terrain tiles"
```

---

### Task 3: Wire variant color + corner jitter into the top-face render loop

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Test: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `cellVariantIndex` (Task 1), `cornerHeightJitter` (Task 2).
- Produces: `buildTerrainGeometryData`'s existing signature/behavior for wall faces and water/river
  cells is preserved exactly; only plain land-cell top-face color and top-face vertex Y coordinates
  change.

- [ ] **Step 1: Write the failing test**

Add to `tests/world/TerrainGeometryBuilder.test.ts`:

```typescript
describe('buildTerrainGeometryData — variant color and corner jitter', () => {
  it('gives different plain land cells at the same elevation level visibly different colors sometimes', () => {
    // A 6x6 flat grid at elevation 1 (grass level) — with only single-level BIOME colors
    // every cell would render byte-identical color. With per-cell variants, at least
    // one pair of cells should differ.
    const wg = new WorldGrid(6, 6);
    for (let col = 0; col < 6; col++) {
      for (let row = 0; row < 6; row++) wg.set(col, row, { elevation: 1 });
    }
    const data = buildTerrainGeometryData(wg, 6, 6, 3, 3, 1, 1);

    // Each cell contributes exactly one top face (flat grid) = 4 verts = 12 color floats.
    const cellColors: Array<[number, number, number]> = [];
    for (let i = 0; i < data.colors.length; i += 12) {
      cellColors.push([data.colors[i]!, data.colors[i + 1]!, data.colors[i + 2]!]);
    }
    const distinct = new Set(cellColors.map(c => c.join(',')));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('keeps water-biome tile color ratio unchanged by variant noise', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'water' });
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = [data.colors[0]!, data.colors[1]!, data.colors[2]!];
    expect(r / g).toBeCloseTo(0.14 / 0.26, 5);
    expect(g / b).toBeCloseTo(0.26 / 0.48, 5);
  });

  it('jitters top-face corner Y coordinates within the documented bound around the tile base height', () => {
    const wg = new WorldGrid(2, 2);
    // All default elevation 0 -> base wy = 0.
    const data = buildTerrainGeometryData(wg, 2, 2, 1, 1, 2, 1);
    // Every top-face vertex Y (index 1, 4, 7, 10 within each 4-vert face, but since flat grid
    // has ONLY top faces, every 3rd float starting at offset 1 is a Y value).
    for (let i = 1; i < data.positions.length; i += 3) {
      const y = data.positions[i]!;
      expect(Math.abs(y)).toBeLessThanOrEqual(0.03 + 1e-9);
    }
  });

  it('gives two adjacent flat cells identical Y at their shared corner (no seam)', () => {
    const wg = new WorldGrid(2, 1);
    const data = buildTerrainGeometryData(wg, 2, 1, 1, 0, 1, 1);
    // Tile 0 (col=0): verts at local (wx,wy,wz),(wx,wy,wz1),(wx1,wy,wz1),(wx1,wy,wz) → indices 0..3
    // Tile 1 (col=1): same layout, base index 4..7.
    // Tile 0's east edge (v2,v3 = wx1 corner) must match tile 1's west edge (v0,v1 = wx corner)
    // since tile0's wx1 === tile1's wx (adjacent tiles, T=1).
    const face0 = [0, 1, 2, 3].map(v => ({
      x: data.positions[v * 3]!, y: data.positions[v * 3 + 1]!, z: data.positions[v * 3 + 2]!,
    }));
    const face1 = [4, 5, 6, 7].map(v => ({
      x: data.positions[v * 3]!, y: data.positions[v * 3 + 1]!, z: data.positions[v * 3 + 2]!,
    }));
    // face0 v2 (wx1,wz1) should match face1 v1 (wx,wz1) in both x and y (same world point).
    expect(face0[2]!.x).toBeCloseTo(face1[1]!.x, 9);
    expect(face0[2]!.y).toBeCloseTo(face1[1]!.y, 9);
    // face0 v3 (wx1,wz) should match face1 v0 (wx,wz) in both x and y.
    expect(face0[3]!.x).toBeCloseTo(face1[0]!.x, 9);
    expect(face0[3]!.y).toBeCloseTo(face1[0]!.y, 9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: FAIL — the "different colors" and "corner Y match" tests fail because color/geometry
generation hasn't been wired up yet (colors will all be identical per level; Y will be exactly 0
everywhere).

- [ ] **Step 3: Write minimal implementation**

Replace the existing `BIOME` constant and the top-face color-selection + `addFace` top-face call
in `src/world/TerrainGeometryBuilder.ts` as follows.

Replace:
```typescript
/** Biome vertex colours [r, g, b] for height levels 0–4. */
export const BIOME: readonly [number, number, number][] = [
  [0.20, 0.26, 0.11],   // 0  bog / muddy path
  [0.26, 0.44, 0.16],   // 1  grass
  [0.20, 0.36, 0.13],   // 2  forest floor
  [0.35, 0.41, 0.26],   // 3  highland
  [0.44, 0.41, 0.30],   // 4  rocky upland
];
```

With:
```typescript
/** Biome vertex colours [r, g, b] for height levels 0–4 — kept for backward-compat callers
 * that only need the "primary" look; internally buildTerrainGeometryData now picks from
 * BIOME_VARIANTS for patchiness, this array is variant index 0 of each level. */
export const BIOME: readonly [number, number, number][] = [
  [0.20, 0.26, 0.11],   // 0  bog / muddy path
  [0.26, 0.44, 0.16],   // 1  grass
  [0.20, 0.36, 0.13],   // 2  forest floor
  [0.35, 0.41, 0.26],   // 3  highland
  [0.44, 0.41, 0.30],   // 4  rocky upland
];

/**
 * 3 color-look variants per elevation level, giving each level visible patchiness
 * instead of one flat repeated color. Variant 0 always equals the corresponding
 * BIOME[] entry for backward compatibility. Names loosely mirror TileDNA.ts's
 * TILE_VARIANTS vocabulary (e.g. grassland: short/lush/patchy) for cross-system
 * naming consistency, without importing TileDNA.ts (terrain rendering intentionally
 * stays decoupled from the Studio-only Tile Designer system — see design doc).
 */
export const BIOME_VARIANTS: readonly (readonly [number, number, number])[][] = [
  // 0  bog / muddy path — variants: base, drier, wetter
  [[0.20, 0.26, 0.11], [0.24, 0.28, 0.14], [0.17, 0.23, 0.10]],
  // 1  grass — variants: base(short), lush, patchy
  [[0.26, 0.44, 0.16], [0.22, 0.40, 0.15], [0.30, 0.46, 0.20]],
  // 2  forest floor — variants: base(leaf litter), moss, roots
  [[0.20, 0.36, 0.13], [0.18, 0.34, 0.20], [0.24, 0.32, 0.16]],
  // 3  highland — variants: base, mossy, pebbly
  [[0.35, 0.41, 0.26], [0.32, 0.40, 0.24], [0.39, 0.38, 0.30]],
  // 4  rocky upland — variants: base, dry, pebbly
  [[0.44, 0.41, 0.30], [0.46, 0.40, 0.28], [0.41, 0.39, 0.34]],
];
```

Then find this block inside the `row`/`col` loop (the biome/feature-aware color selection):

```typescript
      // Biome/feature-aware colour selection
      const cell = wg.get(col, row);
      let biomeRgb: [number, number, number];
      if (cell.biome === 'water') {
        biomeRgb = BIOME_WATER;
      } else if (cell.feature === 'river') {
        biomeRgb = BIOME_RIVER;
      } else if (cell.feature === 'river_bank') {
        const b = BIOME[H]!;
        biomeRgb = [b[0] * 0.88, b[1] * 0.80, b[2] * 0.68];
      } else {
        biomeRgb = BIOME[H]!;
      }
```

Replace the final `else` branch's line `biomeRgb = BIOME[H]!;` with variant selection:

```typescript
      } else {
        const variants = BIOME_VARIANTS[H] ?? [BIOME[H]!];
        const vi = cellVariantIndex(col, row, variants.length);
        biomeRgb = variants[vi]!;
      }
```

(Leave the `water`/`river`/`river_bank` branches exactly as they are — per the constraint that
water/river color logic is untouched this phase.)

Now find the top-face `addFace` call:

```typescript
      // ── TOP face (normal +Y) ─────────────────────────────────────────
      addFace(
        [wx, wy, wz], [wx, wy, wz1], [wx1, wy, wz1], [wx1, wy, wz],
        0, 1, 0,  tr, tg, tb,
      );
```

Replace with (adds per-corner jitter to each vertex's Y independently — note `wy` stays the base
per-tile elevation height and jitter is *added* on top, using the tile's 4 corner grid coordinates
`(col,row)`, `(col,row+1)`, `(col+1,row+1)`, `(col+1,row)` matching the 4 vertex world positions
in winding order):

```typescript
      // ── TOP face (normal +Y) ─────────────────────────────────────────
      // Small per-corner jitter added on top of the flat elevation height gives the
      // ground an organic, non-uniform look while keeping wall faces (collision-critical)
      // perfectly flat. Corner coordinates are grid-lattice points shared by neighbouring
      // tiles, so adjacent tiles' shared edges/corners always agree (no seams).
      const jSW = cornerHeightJitter(col,     row);
      const jNW = cornerHeightJitter(col,     row + 1);
      const jNE = cornerHeightJitter(col + 1, row + 1);
      const jSE = cornerHeightJitter(col + 1, row);
      addFace(
        [wx, wy + jSW, wz], [wx, wy + jNW, wz1], [wx1, wy + jNE, wz1], [wx1, wy + jSE, wz],
        0, 1, 0,  tr, tg, tb,
      );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS — all tests in the file (pre-existing 3 + Task 1's 3 + Task 2's 3 + Task 3's 4 = 13
tests) pass.

- [ ] **Step 5: Run the full existing terrain/collision-adjacent test suites to check for regressions**

Run: `npx vitest run tests/world/RealmToTerrain.test.ts tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS, no failures.

Run: `npx playwright test tests/e2e/exterior.test.ts`
Expected: all 15 tests pass. If any collision/position-precision assertion fails specifically
because of the new corner jitter, reduce `CORNER_JITTER_MAX` in Task 2's code (e.g. to `0.015`) and
re-run — do not loosen the e2e test's precision (per the plan's Global Constraints).

- [ ] **Step 6: Run full project verification**

Run: `npx tsc --noEmit` — expect the same pre-existing baseline warning count as before this task
(confirm via `git stash` + re-run if unsure whether a new warning was introduced).

Run: `npx vitest run` — expect the same known baseline (2154 passed / 8 pre-existing failures) plus
the newly-added tests, i.e. total passed count should increase by exactly 10 (3+3+4 new tests) with
no new failures.

- [ ] **Step 7: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "feat: add color-variant patchiness and organic corner jitter to terrain tiles"
```

---

### Task 4: Live visual verification

**Files:** none modified — this task only runs the dev server and captures screenshots for manual
comparison; no code changes.

**Interfaces:**
- Consumes: the completed Task 3 implementation.
- Produces: two screenshot files for the session workspace, used to confirm the visual improvement
  before moving to Phase 2 of the branch.

- [ ] **Step 1: Start a fresh dev server**

Run (background, detached is not required — a normal background dev-server process for this
verification session is fine, kill it when done):
```bash
npm run dev -- --port 5185 > /tmp/dev-server-tilevariety.log 2>&1 &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5185/
```
Expected: HTTP 200.

- [ ] **Step 2: Capture an elevated top-down screenshot of open grass terrain**

Write a throwaway script (delete after use) at repo root, e.g. `verify_tile_variety.mjs`, following
the proven helper pattern already used in this codebase (`tests/e2e/helpers.ts`: navigate → wait
for `#game-canvas` → wait for `window.__game` → `__game.startGame(seed)` →
`waitForTimeout(600)` → `__game.switchToExterior()`), then move the camera to an elevated top-down
angle over a patch of open grass terrain (away from any settlement) and save a screenshot to
`/tmp/settlement-before-after/ground-tile-variety-AFTER.png`.

Run: `node verify_tile_variety.mjs`
Expected: script completes without page errors; screenshot file exists and is non-trivial size
(`ls -la /tmp/settlement-before-after/ground-tile-variety-AFTER.png` shows a file > 20KB).

- [ ] **Step 3: Visually inspect the screenshot**

Use the `view` tool on `/tmp/settlement-before-after/ground-tile-variety-AFTER.png` and confirm: the
ground shows visible color patchiness (not one uniform flat green) and a subtly non-flat/organic
silhouette rather than perfectly identical flat squares. If the effect is too subtle to see, increase
`CORNER_JITTER_MAX` (Task 2) and/or widen the color variant spread in `BIOME_VARIANTS` (Task 3),
re-run Task 3's Step 5-6 verification, and re-capture.

- [ ] **Step 4: Clean up**

```bash
rm -f verify_tile_variety.mjs
kill %1 2>/dev/null || true  # stop the dev server background job from Step 1
```

(No commit needed for this task — it produces no source changes.)

---

## Self-Review Notes

**Spec coverage:** Task 1 covers the "variant selection" data-layer requirement. Task 2 covers the
"organic Townscaper-style mesh variety" requirement. Task 3 wires both into the actual render loop
and explicitly preserves the water/river color paths and wall-face flatness per the design doc's
scope boundaries. Task 4 provides the visual verification called for in the design doc's Testing
section. The design doc's "determinism regression guard" and "no-seam regression guard" unit tests
are both present (Task 3's tests 1/2 for determinism-adjacent coverage via Task 1/2's own dedicated
tests, and Task 3's test 4 specifically for the no-seam guarantee).

**Placeholder scan:** No TBD/TODO markers; all code blocks are complete, runnable TypeScript: no
"add error handling" or "similar to Task N" placeholders — every step repeats full code.

**Type consistency:** `cellVariantIndex(col, row, variantCount)` signature is used identically in
Task 1's tests and Task 3's implementation. `cornerHeightJitter(cornerCol, cornerRow)` signature
matches between Task 2's tests/implementation and Task 3's usage. `BIOME_VARIANTS` type
(`readonly (readonly [number,number,number])[][]`) is consistent between its declaration and usage.
