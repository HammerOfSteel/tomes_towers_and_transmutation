# Terrain Elevation & Slopes (Sub-task 1.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the overworld's mid-ring terrain show real elevation variety (hills, terraced slopes, mountains with a matching rock-strata look) instead of reading mostly flat, by unlocking the elevation signal the world generator already computes but currently suppresses, terracing multi-level drops into walkable staircases the existing ramp renderer already knows how to draw, and texturing the resulting cliff faces — while locking in a regression test that the tile/chunk boundary-agreement machinery already handles the result correctly.

**Architecture:** A single new `WorldGrid`-mutating pre-processing pass (`terraceElevation()`) runs once at the end of `WorldGenerator.buildWorldGrid()`, after hydrology/lakes, and guarantees no two orthogonally-adjacent dry-land tiles differ by more than 1 elevation level. Because `TerrainGeometryBuilder.ts`'s existing corner/ramp/corner-pull-suppression machinery (`_rawCornerElevation`, `classifyTileShape`, `_isCurrentlyRampedShape`, `_cornerTouchesUnpulledTile`) already derives everything from stored `WorldGrid.elevation` and already only supports single-level drops, terracing the grid *before* geometry building means every downstream consumer (ramps, walls, colliders, corner-pull suppression) "just works" unchanged — no new elevation parameter is threaded through the geometry builder, and no multi-level cliff wall can exist after this pass runs. Two smaller upstream fixes (softened tower flat-zone radius, a post-quantization neighbor-smoothing pass) unlock more real elevation variation for terracing to work with. A new `addCliffFace` helper routes the vertical wall faces this now produces into a dedicated `groundGeometry.cliff` texture-variant bucket (reusing the already-wired `graniteTexture()`), instead of the flat vertex-color base buffer.

**Tech Stack:** TypeScript, Three.js (`BufferGeometry`), Vitest, existing `WorldGrid`/`WorldGenerator`/`TerrainGeometryBuilder`/`TerrainTextures` modules.

## Global Constraints

- `ELEVATION_LEVELS = 8` (levels 0–7) and `LEVEL_HEIGHT = 0.55` WU per level are fixed — do not change either constant.
- Never lower a tile's stored elevation once written by the realm/quantization pipeline — every new pass in this plan only ever raises elevation (preserves realm-authored peaks) or leaves it unchanged.
- Water tiles (`biome === 'ocean' || biome === 'deep_ocean'`, or any tile with `waterDepth > 0`) are excluded from every new elevation pass in this plan (never raised, never read as a neighbor pull) — shoreline/riverbank drops are handled by existing, separate machinery and must not be touched.
- No changes to `TerrainKit.ts`'s `classifyTileShape()`, to `buildTerrainGeometryData()`'s function signature, or to the Rapier `PlayerController.ts` slope/autostep config — this plan's design explicitly avoids needing any of the three (see `docs/superpowers/specs/2026-09-22-terrain-elevation-slopes-design.md`).
- Every new module/function gets a doc comment that cites `docs/superpowers/specs/2026-09-22-terrain-elevation-slopes-design.md` by section, matching this codebase's existing convention.

---

## Plan Deviations From The Approved Spec (read before implementing)

Investigation while writing this plan surfaced two places where the literal spec mechanism needed a small, evidence-based correction. Both are flagged here explicitly per the project's process skill, rather than silently substituted:

1. **§3a (fix quantization formula) → rescoped to "add smoothing pass only."** The spec's stated premise was that `RealmToWorldGrid.ts`'s naive `Math.floor(elevation * 8)` quantization "compresses most cells into the bottom 1-2 levels." Reading `tests/world/RealmToWorldGrid.test.ts`'s existing assertions (`elevation 0.30 → level 2`, `0.55 → level 4`, `0.99 → level 7`) shows the current per-cell formula already produces a reasonable, non-collapsed spread, and since `RealmGenerator.ts`'s `mountain` biome cutoff is `elev > 0.70`, naive flooring already reliably places real mountain cells at levels 5–7. The formula itself is not the bug. Task 4 below therefore keeps the existing per-cell `Math.floor` formula completely unchanged and adds only a post-quantization 3×3 neighbor-smoothing pass (still a real, useful part of §3a — it removes single-tile "pixel" blobs) — the actual "mid-ring reads flat" fix weight moves entirely onto Task 3 (§3b, the flat-zone/rim-bias override), which the same investigation confirmed IS the real, code-evidenced suppressor.
2. **§5 (cliff/rock-strata texture) → confirmed texture reuse, not new texture generation.** `TerrainTextures.ts` already has a `graniteTexture()` factory (imported from `FactionBlockTextures.ts`) wired to the `'mountain'` ground-texture variant. Task 6 below reuses this exact texture for the new `'cliff'` variant (with its own vertical UV projection) rather than authoring a new canvas-texture family — a significant simplification versus the spec's more open-ended "2–3 rock-strata variants" framing, achieved by wiring one existing texture through a new UV-projection helper instead.

---

## File Structure

- **Create:** `src/world/TerrainTerracing.ts` — `terraceElevation(grid: WorldGrid): void`, the slope-limiting relaxation pass (Task 5).
- **Create:** `tests/world/TerrainTerracing.test.ts` — unit tests for the above.
- **Modify:** `src/world/WorldGenerator.ts` — shrink the flat-zone radius fraction (Task 3); call `terraceElevation()` after `generateLakes()` (Task 5).
- **Modify:** `src/world/RealmToWorldGrid.ts` — add `_smoothQuantizedElevation()` and call it before returning the grid (Task 4).
- **Modify:** `src/world/TerrainTextures.ts` — add a `'cliff'` variant to `terrainVariantTexture()` reusing `graniteTexture()` (Task 6).
- **Modify:** `src/world/TerrainGeometryBuilder.ts` — add `addCliffFace()` helper; redirect the 4 wall-emission blocks' non-shoreline `else` branches to use it (Task 6).
- **Modify:** `tests/world/TerrainGeometryBuilder.test.ts` — add the cross-chunk shared-vertex regression test (Task 1); add the `groundGeometry.cliff` variant test; update the one existing test whose assertions assume walls land in the base buffer (Task 6).
- **Modify:** `tests/world/TerrainTextures.test.ts` — add the cliff-variant texture-lookup test (Task 6).
- **Modify:** `tests/world/WorldGenerator.test.ts` — add a regression test asserting `mountain`-biome cells retain elevation after the flat-zone override (Task 3).

---

### Task 1: Cross-chunk shared-vertex boundary-agreement regression test

**Files:**
- Modify: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `buildTerrainGeometryData(wg, GW, GH, GHW, GHH, T, SH, colStart, rowStart, chunkW, chunkH)` (existing signature, unchanged).
- Produces: nothing new for later tasks — this is a standalone regression guard.

This test locks in an invariant the design spec (§2) called out as needing hardening: two adjacent chunks built from the *same* `WorldGrid` via two separate `buildTerrainGeometryData()` calls must agree exactly on the vertices along their shared boundary — no seams, no black gaps. Investigation while writing this plan traced through every function `buildTerrainGeometryData()` calls (`_rawCornerElevation`, `_tileCornerLevels`, `classifyTileShape`, `_mergedCornerPull`) and confirmed all of them read from the *entire* `wg` by absolute column/row, never clamped to `colStart..colStart+chunkW`/`rowStart..rowStart+chunkH` — so this test is expected to **pass immediately** on today's code. That's fine and intentional: it converts a currently-correct-but-unverified invariant into a permanent regression guard, not a bugfix. If it unexpectedly fails, stop and investigate before continuing to Task 2 — that would mean the diagnosis behind this whole plan is wrong.

- [ ] **Step 1: Write the regression test**

Add to `tests/world/TerrainGeometryBuilder.test.ts`, inside a new top-level `describe` block (place it after the closing `});` of the existing `describe('buildTerrainGeometryData — water depth carving (RI-3)', ...)` block, or any top-level position — it does not depend on any other describe block):

```ts
describe('buildTerrainGeometryData — cross-chunk boundary agreement', () => {
  it('produces identical shared-edge vertices whether two adjacent chunks are built separately or as one', () => {
    // A 4x4 grid with genuine elevation variety (not flat) so the ramp/
    // corner-pull machinery actually has something to disagree about if
    // chunk splitting were to break it.
    const wg = new WorldGrid(4, 4);
    wg.set(1, 1, { elevation: 2 });
    wg.set(2, 1, { elevation: 2 });
    wg.set(1, 2, { elevation: 1 });
    wg.set(2, 2, { elevation: 1 });

    // Whole-grid build (one call, no chunk splitting).
    const whole = buildTerrainGeometryData(wg, 4, 4, 1.5, 1.5, 1, 1);

    // Same grid, split into two 2-column-wide chunks at the col=2 boundary.
    const chunkA = buildTerrainGeometryData(wg, 4, 4, 1.5, 1.5, 1, 1, 0, 0, 2, 4);
    const chunkB = buildTerrainGeometryData(wg, 4, 4, 1.5, 1.5, 1, 1, 2, 0, 2, 4);

    // Collect every (x, y, z) vertex position that lies exactly on the
    // shared boundary plane between tile columns 1 and 2. With GHW=1.5,
    // T=1, a tile's left edge is at world-x = (col - GHW) * T, so column
    // 1's right edge / column 2's left edge — the seam this 2/2 chunk
    // split falls on — is at world-x = (2 - 1.5) * 1 = 0.5.
    const SEAM_X = 0.5;
    function boundaryVerts(data: TerrainGeometryData): Set<string> {
      const out = new Set<string>();
      const collect = (positions: readonly number[]) => {
        for (let i = 0; i < positions.length; i += 3) {
          const x = positions[i]!, y = positions[i + 1]!, z = positions[i + 2]!;
          if (Math.abs(x - SEAM_X) < 1e-6) out.add(`${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`);
        }
      };
      collect(data.positions);
      for (const g of Object.values(data.groundGeometry)) collect(g.positions);
      return out;
    }

    const wholeBoundary = boundaryVerts(whole);
    const splitBoundary = new Set([...boundaryVerts(chunkA), ...boundaryVerts(chunkB)]);

    // The seam must exist (sanity check the test itself isn't vacuous)
    // and every vertex the whole-grid build placed on the seam must also
    // appear when built as two separate chunks — no missing/shifted verts.
    expect(wholeBoundary.size).toBeGreaterThan(0);
    for (const v of wholeBoundary) {
      expect(splitBoundary.has(v)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "cross-chunk boundary agreement" --poolOptions.threads.maxThreads=1`
Expected: PASS (1 test). If it fails, stop and re-investigate before proceeding to Task 2.

- [ ] **Step 3: Commit**

```bash
git add tests/world/TerrainGeometryBuilder.test.ts
git commit -m "test: lock in cross-chunk shared-vertex boundary agreement (1.3 §2)"
```

---

### Task 2: Confirm boundary-agreement suppression registry needs no new entries

**Files:**
- None modified — this is a documentation-only confirmation task, folded in because §2 of the spec asked for an audit before moving on.

**Interfaces:** None — no code produced.

Investigation while writing this plan read `_cornerTouchesUnpulledTile()`, `_isCurrentlyRampedShape()`, and `_hasRoadFeature()` (`TerrainGeometryBuilder.ts` lines ~41–563) in full. All three re-derive a tile's own classification live from `WorldGrid` state (elevation, road/ford features) rather than consulting a separately-maintained registry that could drift out of sync — so once Task 5's terracing pass guarantees no adjacent land tiles differ by more than 1 level, every tile these functions see is an *ordinary* single-level-drop tile they already handle correctly today. No new suppression-registry entries, no new corner-pull cases, and no changes to these three functions are needed for this plan. This task exists only to record that conclusion so a future reader doesn't re-derive it from scratch — no commit needed (no files changed).

---

### Task 3: Soften the tower flat-zone radius (§3b — primary elevation-signal unlock)

**Files:**
- Modify: `src/world/WorldGenerator.ts:38-44` (and the header doc comment above `buildWorldGrid`)
- Test: `tests/world/WorldGenerator.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks — a standalone tuning fix.

`WorldGenerator.buildWorldGrid()`'s flat-zone override currently uses `FR = Math.round(GHW * 0.28)` — a flatness falloff reaching 28% of the half-grid-width, which investigation confirmed is the actual, code-evidenced cause of the mid-ring reading flat (not the quantization formula — see "Plan Deviations" above). This task shrinks that radius to 12% of half-width, cutting the flattened area's *radius* by more than half (and its *area* by roughly 82%) while keeping the exact same falloff shape/formula — still guarantees a genuinely flat, buildable tower site, just a much smaller one.

- [ ] **Step 1: Write the failing test**

Add to `tests/world/WorldGenerator.test.ts`. The file already imports `DEFAULT_WORLD_GEN_CONFIG` from `@/world/WorldGenConfig` and uses the `{ ...DEFAULT_WORLD_GEN_CONFIG, seed: N }` override pattern for existing tests (e.g. the `'is deterministic for the same seed'` test) — match that style and override `worldSize` down to the smallest valid `WorldSize` (`128`, from `export type WorldSize = 128 | 256 | 512` in `WorldGenConfig.ts`) to keep the test fast, since terracing (Task 5) scans the whole grid up to `max(width, height)` times:

```ts
it('lets mountain-biome cells retain most of their elevation outside the tower flat zone', () => {
  const config = { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 128 as const };
  const grid = buildWorldGrid(12345, config);
  const GHW = (config.worldSize - 1) / 2;

  // Sample a ring well outside both the (now much smaller) flat zone and
  // the rim-bias band, and assert at least one mountain-biome cell out
  // there kept a high elevation level (>= 5) rather than being flattened
  // toward 0 by the tower override. Mountain biome is elev > 0.70 in
  // RealmGenerator.ts, which quantizes to level >= 5 (see
  // RealmToWorldGrid.test.ts's 0.70 -> level 5 boundary).
  let foundHighMountain = false;
  for (let row = 0; row < config.worldSize; row++) {
    for (let col = 0; col < config.worldSize; col++) {
      const dc = col - GHW, dr = row - GHW;
      const tR = Math.sqrt(dc * dc + dr * dr);
      if (tR < GHW * 0.20 || tR > GHW * 0.75) continue; // mid-ring only
      const cell = grid.get(col, row);
      if (cell.biome === 'mountain' && cell.elevation >= 5) { foundHighMountain = true; break; }
    }
    if (foundHighMountain) break;
  }
  expect(foundHighMountain).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/WorldGenerator.test.ts -t "mountain-biome cells retain" --poolOptions.threads.maxThreads=1`
Expected: FAIL (no mid-ring mountain cell reaches level 5 — the current 0.28 flat-zone radius still reaches into this sampled ring at typical mountain-biome locations for this seed).

- [ ] **Step 3: Shrink the flat-zone radius**

In `src/world/WorldGenerator.ts`, update the header doc comment and the `FR` line:

```ts
// change this line in the header doc comment above buildWorldGrid:
 *   – Flat zone  ≈ 28 % of half-width  (FR = 7 at GW = 51)
// to:
 *   – Flat zone  ≈ 12 % of half-width  (FR = 3 at GW = 51) — shrunk from
 *     28% (2026-09-22 terrain elevation unlock, see
 *     docs/superpowers/specs/2026-09-22-terrain-elevation-slopes-design.md §3b)
 *     so the mid-ring's real elevation signal isn't flattened away; still
 *     guarantees a small buildable flat area at the tower.
```

```ts
  const FLAT_ZONE_RADIUS_FRACTION = 0.12; // was 0.28 — see header comment above
  const FR  = Math.round(GHW * FLAT_ZONE_RADIUS_FRACTION);    // flat zone radius in tiles
```

(Replace the existing `const FR  = Math.round(GHW * 0.28);    // flat zone radius in tiles` line with the two lines above.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/WorldGenerator.test.ts -t "mountain-biome cells retain" --poolOptions.threads.maxThreads=1`
Expected: PASS.

- [ ] **Step 5: Run the full WorldGenerator test file to check for regressions**

Run: `npx vitest run tests/world/WorldGenerator.test.ts --poolOptions.threads.maxThreads=1`
Expected: All PASS. If any existing test asserted specifics about the flat zone's exact radius/tile count, update its expected values to match the new 0.12 fraction rather than reverting this change.

- [ ] **Step 6: Commit**

```bash
git add src/world/WorldGenerator.ts tests/world/WorldGenerator.test.ts
git commit -m "feat: shrink tower flat-zone radius so mid-ring elevation signal survives (1.3 §3b)"
```

---

### Task 4: Post-quantization neighbor-smoothing pass (§3a, rescoped)

**Files:**
- Modify: `src/world/RealmToWorldGrid.ts`
- Test: `tests/world/RealmToWorldGrid.test.ts`

**Interfaces:**
- Consumes: `WorldGrid.get(col, row)` / `.set(col, row, patch)` (existing API).
- Produces: nothing new for later tasks.

Per the "Plan Deviations" note above, this task keeps `quantizeElevation()`'s existing per-cell `Math.floor` formula unchanged (evidence showed it isn't the real bug) and adds a one-pass 3×3 neighbor-average smoothing step after quantization, removing single-tile elevation "blobs" so terracing (Task 5) has cleaner, less noisy input to work with.

- [ ] **Step 1: Write the failing test**

Add to `tests/world/RealmToWorldGrid.test.ts`, reusing its existing `fakeRealm(cells: RealmCell[][])` helper (already defined at the top of the file) rather than constructing a `RealmData` by hand:

```ts
it('smooths a single spiked elevation cell toward its flat neighbors', () => {
  // A 3x3 realm, all cells at elevation 0.10 (-> level 0 pre-smoothing)
  // except the center cell spiked to 0.99 (-> level 7 pre-smoothing).
  const cells: RealmCell[][] = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, col) => ({
      biome: 'grassland' as const,
      moisture: 0.5,
      elevation: (row === 1 && col === 1) ? 0.99 : 0.10,
    })),
  );
  const realm = fakeRealm(cells);

  const grid = realmToWorldGrid(realm, 3);

  // Before smoothing the center would be level 7 with every neighbor at
  // level 0 — after the 3x3 self-weighted-double average
  // ((7*2 + 0*8) / 10 = 1.4 -> rounds to 1), it should land far below 7,
  // while a corner (which only touches 3 of the 8 neighbor slots, all at
  // level 0) should stay unchanged at 0.
  expect(grid.get(1, 1).elevation).toBeLessThan(3);
  expect(grid.get(0, 0).elevation).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/RealmToWorldGrid.test.ts -t "smooths a single spiked" --poolOptions.threads.maxThreads=1`
Expected: FAIL (`grid.get(1, 1).elevation` is currently 7, unsmoothed).

- [ ] **Step 3: Implement the smoothing pass**

In `src/world/RealmToWorldGrid.ts`, add this function after `quantizeElevation()`:

```ts
const NEIGHBOR_OFFSETS_8: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],           [1,  0],
  [-1,  1], [0,  1], [1,  1],
];

/** One-pass 3x3 neighbor-average smoothing applied AFTER quantization, so
 *  a single spiked cell doesn't read as an isolated "pixel" blob of
 *  elevation — the cell's own (already-quantized) value counts double in
 *  the average (weight 2 of 10 total, vs weight 1 for each of up to 8
 *  neighbors) so real ridgelines/plateaus aren't smoothed flat, just
 *  de-spiked. Reads from a snapshot of the pre-smoothing elevations (not
 *  live `grid.get()` values being written mid-pass) so the result doesn't
 *  depend on sweep order. Water tiles are excluded from both being
 *  smoothed and from contributing to a neighbor's average — elevation
 *  levels under water carve to depth via a separate mechanism (see
 *  WaterDepthConfig.ts's physicalHeightWU), not through this level field.
 *  See docs/superpowers/specs/2026-09-22-terrain-elevation-slopes-design.md
 *  §3a. */
function _smoothQuantizedElevation(grid: WorldGrid, worldSize: number): void {
  const isWater = (biome: string) => biome === 'ocean' || biome === 'deep_ocean';
  const snapshot: number[][] = [];
  for (let row = 0; row < worldSize; row++) {
    snapshot.push(Array.from({ length: worldSize }, (_, col) => grid.get(col, row).elevation));
  }
  for (let row = 0; row < worldSize; row++) {
    for (let col = 0; col < worldSize; col++) {
      const cell = grid.get(col, row);
      if (isWater(cell.biome)) continue;
      let sum = snapshot[row]![col]! * 2;
      let count = 2;
      for (const [dc, dr] of NEIGHBOR_OFFSETS_8) {
        const nCol = col + dc, nRow = row + dr;
        if (nCol < 0 || nCol >= worldSize || nRow < 0 || nRow >= worldSize) continue;
        const nCell = grid.get(nCol, nRow);
        if (isWater(nCell.biome)) continue;
        sum += snapshot[nRow]![nCol]!;
        count++;
      }
      grid.set(col, row, { elevation: Math.round(sum / count) });
    }
  }
}
```

Then call it at the end of `realmToWorldGrid()`, replacing the bare `return grid;`:

```ts
  _smoothQuantizedElevation(grid, worldSize);
  return grid;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/RealmToWorldGrid.test.ts -t "smooths a single spiked" --poolOptions.threads.maxThreads=1`
Expected: PASS.

- [ ] **Step 5: Run the full RealmToWorldGrid test file to check for regressions**

Run: `npx vitest run tests/world/RealmToWorldGrid.test.ts --poolOptions.threads.maxThreads=1`
Expected: All PASS. The existing quantization boundary tests (`0.30 -> level 2` etc.) use single-cell fixtures where every neighbor shares the same elevation, so the smoothing pass is a no-op for them (self*2 + 8*same value, divided by 10, equals the same value) and should not need changes — if any does fail, it means that fixture has non-uniform neighbor elevations; update its expected value to the smoothed result rather than reverting Step 3.

- [ ] **Step 6: Commit**

```bash
git add src/world/RealmToWorldGrid.ts tests/world/RealmToWorldGrid.test.ts
git commit -m "feat: smooth quantized elevation to remove single-tile spikes (1.3 §3a)"
```

---

### Task 5: Terracing pass — enforce a 1-level max elevation step between land tiles

**Files:**
- Create: `src/world/TerrainTerracing.ts`
- Create: `tests/world/TerrainTerracing.test.ts`
- Modify: `src/world/WorldGenerator.ts`

**Interfaces:**
- Consumes: `WorldGrid` (`.get`/`.set`/`.width`/`.height`, existing API).
- Produces: `terraceElevation(grid: WorldGrid): void` — Task 6's cliff-texture wiring does not depend on this function directly, but relies on it having run (so wall faces it touches are genuinely single-level cliffs).

This is the core of the sub-task: a pre-processing pass that mutates `WorldGrid.elevation` so no two orthogonally-adjacent dry-land tiles ever differ by more than 1 level, by repeatedly raising (never lowering) the lower tile of any such pair. Because it only ever raises values, is bounded above by `ELEVATION_LEVELS - 1`, and converges to the same fixed point regardless of sweep order (each cell's final value is `max(original, every neighbor's final value - 1)` — a monotone relaxation with a unique fixed point, the same class of computation as a distance transform), running it turns every multi-level drop into a run of single-level steps that `TerrainKit.ts`'s existing ramp classifier already renders correctly — with zero changes needed to that file.

- [ ] **Step 1: Write the failing tests**

Create `tests/world/TerrainTerracing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { WorldGrid } from '@/world/WorldGrid';
import { terraceElevation } from '@/world/TerrainTerracing';

describe('terraceElevation', () => {
  it('terraces a 3-tile chain to at most 1-level steps between adjacent tiles', () => {
    const wg = new WorldGrid(3, 1);
    wg.set(0, 0, { elevation: 0 });
    wg.set(1, 0, { elevation: 0 });
    wg.set(2, 0, { elevation: 5 });

    terraceElevation(wg);

    expect(wg.get(2, 0).elevation).toBe(5); // the high tile is never lowered
    expect(wg.get(1, 0).elevation).toBe(4); // raised to within 1 of its high neighbor
    expect(wg.get(0, 0).elevation).toBe(3); // raised to within 1 of its (now-4) neighbor
  });

  it('never lowers a tile, only raises its lower neighbor toward it', () => {
    const wg = new WorldGrid(2, 1);
    wg.set(0, 0, { elevation: 5 });
    wg.set(1, 0, { elevation: 0 });

    terraceElevation(wg);

    expect(wg.get(0, 0).elevation).toBe(5); // unchanged
    expect(wg.get(1, 0).elevation).toBe(4); // raised to within 1 level
  });

  it('does not raise or pull elevation across a water tile', () => {
    const wg = new WorldGrid(2, 1);
    wg.set(0, 0, { elevation: 0, biome: 'ocean', waterDepth: 1 });
    wg.set(1, 0, { elevation: 5 });

    terraceElevation(wg);

    expect(wg.get(0, 0).elevation).toBe(0); // ocean tile untouched
    expect(wg.get(1, 0).elevation).toBe(5); // land tile's only neighbor is water (excluded), so also untouched
  });

  it('converges to the same result regardless of a 2D grid with multiple peaks', () => {
    const wg = new WorldGrid(5, 1);
    wg.set(0, 0, { elevation: 0 });
    wg.set(1, 0, { elevation: 0 });
    wg.set(2, 0, { elevation: 7 });
    wg.set(3, 0, { elevation: 0 });
    wg.set(4, 0, { elevation: 0 });

    terraceElevation(wg);

    // The peak stays put; both sides step down by exactly 1 per tile
    // until they can't go any lower without violating the original value.
    expect(wg.get(2, 0).elevation).toBe(7);
    expect(wg.get(1, 0).elevation).toBe(6);
    expect(wg.get(3, 0).elevation).toBe(6);
    expect(wg.get(0, 0).elevation).toBe(5);
    expect(wg.get(4, 0).elevation).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/TerrainTerracing.test.ts --poolOptions.threads.maxThreads=1`
Expected: FAIL with "Cannot find module '@/world/TerrainTerracing'" (module doesn't exist yet).

- [ ] **Step 3: Implement `TerrainTerracing.ts`**

Create `src/world/TerrainTerracing.ts`:

```ts
/**
 * TerrainTerracing.ts — enforces a maximum 1-level elevation difference
 * between any two orthogonally-adjacent dry-land WorldGrid tiles, by
 * repeatedly raising (never lowering) the lower tile of any such pair.
 *
 * This is what lets TerrainKit.ts's existing single-level ramp classifier
 * (classifyTileShape()) handle every elevation drop in the world without
 * any changes to that file: after this pass runs, no multi-level "cliff"
 * drop can exist, because every drop greater than 1 level has been
 * converted into a run of single-level steps.
 *
 * Monotonically non-decreasing (only raises) and bounded above by
 * ELEVATION_LEVELS-1, so this always converges to a unique fixed point
 * regardless of sweep order — the same terrain terraces identically no
 * matter how many times or in what order this runs, which is what keeps
 * tile/chunk boundary agreement intact (see
 * docs/superpowers/specs/2026-09-22-terrain-elevation-slopes-design.md §4).
 */

import { WorldGrid, type WorldCell } from './WorldGrid';

const NEIGHBOR_OFFSETS_4: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

function _isTerracingEligible(cell: Pick<WorldCell, 'biome' | 'waterDepth'>): boolean {
  return cell.biome !== 'ocean' && cell.biome !== 'deep_ocean' && cell.waterDepth === 0;
}

/**
 * Mutates `grid` in place. Water tiles (ocean/deep_ocean biome, or any
 * tile with waterDepth > 0 — river/lake carves) are excluded from both
 * being raised and from acting as a neighbor pull, since ramp/slope
 * geometry only ever applies to dry land — a coastline or riverbank
 * keeps its existing vertical-wall-into-the-basin look, unaffected by
 * this pass.
 */
export function terraceElevation(grid: WorldGrid): void {
  const { width, height } = grid;
  const maxIterations = Math.max(width, height);
  let changed = true;
  let iterations = 0;
  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const cell = grid.get(col, row);
        if (!_isTerracingEligible(cell)) continue;
        let target = cell.elevation;
        for (const [dc, dr] of NEIGHBOR_OFFSETS_4) {
          const nCol = col + dc, nRow = row + dr;
          if (nCol < 0 || nCol >= width || nRow < 0 || nRow >= height) continue;
          const nCell = grid.get(nCol, nRow);
          if (!_isTerracingEligible(nCell)) continue;
          if (nCell.elevation > target + 1) target = nCell.elevation - 1;
        }
        if (target !== cell.elevation) {
          grid.set(col, row, { elevation: target });
          changed = true;
        }
      }
    }
  }
}
```

Check `WorldGrid.ts` exports a `WorldCell` type and `width`/`height` properties before this step — if the property names differ (e.g. `cols`/`rows` instead of `width`/`height`), use the grid's actual property names instead of guessing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/TerrainTerracing.test.ts --poolOptions.threads.maxThreads=1`
Expected: All 4 PASS.

- [ ] **Step 5: Wire the pass into `WorldGenerator.buildWorldGrid()`**

In `src/world/WorldGenerator.ts`, add the import:

```ts
import { terraceElevation } from './TerrainTerracing';
```

Then, after the existing `generateLakes(grid, config, seed);` line and before `return grid;`, add:

```ts
  // 1.3: terrace any remaining multi-level elevation drops into
  // single-level steps TerrainKit.ts's existing ramp renderer already
  // handles — see docs/superpowers/specs/2026-09-22-terrain-elevation-slopes-design.md §4.
  terraceElevation(grid);
```

- [ ] **Step 6: Run the full WorldGenerator test file to check for regressions**

Run: `npx vitest run tests/world/WorldGenerator.test.ts --poolOptions.threads.maxThreads=1`
Expected: All PASS (including Task 3's new mountain-retention test — terracing only raises elevation, so it cannot lower that test's asserted `>= 5` mountain cell).

- [ ] **Step 7: Commit**

```bash
git add src/world/TerrainTerracing.ts tests/world/TerrainTerracing.test.ts src/world/WorldGenerator.ts
git commit -m "feat: terrace multi-level elevation drops into single-level steps (1.3 §4)"
```

---

### Task 6: Cliff/rock-strata wall texture

**Files:**
- Modify: `src/world/TerrainTextures.ts`
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Modify: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `graniteTexture()` (existing, from `FactionBlockTextures.ts`, already imported into `TerrainTextures.ts`), `groundGeometry: Record<string, GroundVariantGeometry>` (existing `TerrainGeometryData` field).
- Produces: `terrainVariantTexture('cliff')` (new variant key); `groundGeometry.cliff` buffer (new, consumed automatically by `OverworldScene.ts`'s existing generic `for (const [variant, gg] of Object.entries(groundGeometry))` loop — no `OverworldScene.ts` changes needed).

Every wall face `buildTerrainGeometryData()` draws (after Task 5's terracing, these are now always genuine single-level cliff steps, since anything bigger has been terraced away) currently lands in the plain vertex-color base buffer with no texture. This task routes the non-shoreline wall faces into a new `'cliff'` ground-texture variant, reusing the same `graniteTexture()` already wired to the `'mountain'` top-surface variant, with a vertical (tangent, Y) UV projection instead of the horizontal (X, Z) projection `addGroundFace()` uses for top faces — a wall varies in height along Y, not in X/Z, so the horizontal projection would smear across a wall's height if reused directly. Water-adjacent/shoreline wall faces (already routed through `shorelineBoundaryPoints()`) are explicitly left untouched, matching the design spec's scope guard.

- [ ] **Step 1: Write the failing texture-lookup test**

Add to `tests/world/TerrainTextures.test.ts` (this file already exists and already imports `terrainVariantTexture` — do not re-import it, just add the new `describe` block):

```ts
describe('terrainVariantTexture — cliff variant', () => {
  it('returns a texture for the cliff variant', () => {
    const tex = terrainVariantTexture('cliff');
    expect(tex).toBeTruthy();
    expect(tex.image).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --poolOptions.threads.maxThreads=1 -t "cliff variant"`
Expected: FAIL — `terrainVariantTexture('cliff')` currently falls through to the `default` branch (`new THREE.CanvasTexture(_canvasFor('cliff'))`), which does not throw, so instead assert on texture identity: change the test to compare against `graniteTexture`'s image directly once Step 3 is implemented — or more simply, treat this as a smoke test that documents intent and confirm manually that Step 3 wires the granite path. Use this simpler, still-meaningful version instead:

```ts
it('routes the cliff variant through the same texture as the mountain variant', () => {
  const cliffTex = terrainVariantTexture('cliff');
  const mountainTex = terrainVariantTexture('mountain');
  expect(cliffTex.image).toBe(mountainTex.image);
});
```

Run: `npx vitest run --poolOptions.threads.maxThreads=1 -t "routes the cliff variant"`
Expected: FAIL (`cliff` currently falls through to the generic canvas path, not granite, so the images differ).

- [ ] **Step 3: Wire `'cliff'` to `graniteTexture()` in `TerrainTextures.ts`**

In `src/world/TerrainTextures.ts`, modify `terrainVariantTexture()`:

```ts
export function terrainVariantTexture(variant: string, repX = 1, repY = 1): THREE.CanvasTexture {
  if (variant === 'mountain')   return _wrap(graniteTexture(1, 1), repX, repY);
  if (variant === 'cliff')      return _wrap(graniteTexture(1, 1), repX, repY);
  if (variant === 'river_bank') return _wrap(earthTexture(1, 1), repX, repY);
  return _wrap(new THREE.CanvasTexture(_canvasFor(variant)), repX, repY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --poolOptions.threads.maxThreads=1 -t "routes the cliff variant"`
Expected: PASS.

- [ ] **Step 5: Write the failing geometry-routing test**

Add to `tests/world/TerrainGeometryBuilder.test.ts` (place near the existing `'emits 4 wall faces around a single raised tile'` test):

```ts
it('routes non-shoreline wall faces into groundGeometry.cliff instead of the base buffer', () => {
  const wg = new WorldGrid(3, 1);
  wg.set(1, 0, { elevation: 1 }); // single-level step, no water adjacency

  const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);

  // Wall faces no longer land in the untextured base buffer...
  expect(data.positions).toHaveLength(0);
  // ...they land in groundGeometry.cliff instead: 4 wall faces (N/S/E/W)
  // x 4 verts x 3 floats = 48.
  expect(data.groundGeometry.cliff).toBeDefined();
  expect(data.groundGeometry.cliff!.positions).toHaveLength(4 * 4 * 3);
  expect(data.groundGeometry.cliff!.uvs).toHaveLength(4 * 4 * 2);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "routes non-shoreline wall faces" --poolOptions.threads.maxThreads=1`
Expected: FAIL (`data.groundGeometry.cliff` is `undefined` — walls still land in `data.positions` today).

- [ ] **Step 7: Add `addCliffFace()` and wire the 4 wall blocks**

In `src/world/TerrainGeometryBuilder.ts`, add this constant near the existing `GROUND_UV_TILE_WU` (line ~70):

```ts
const CLIFF_UV_TILE_WU = 2.0;
```

Add `addCliffFace` right after the existing `addGroundFace` definition (inside `buildTerrainGeometryData`, so it closes over `groundGeometry`):

```ts
  /** Append a quad face into the 'cliff' ground-texture variant's own
   *  buffers, with UV mapped from (horizontal tangent, Y) instead of
   *  (X, Z) — a vertical wall face varies in Y along its height and in
   *  one horizontal axis along its width, so projecting UV from (X, Z)
   *  directly (as addGroundFace does for horizontal top faces) would
   *  smear the texture across the wall's vertical extent instead of
   *  tiling it sensibly. `tangent` extracts the vertex's horizontal
   *  coordinate along the wall's own width — X for south/north walls,
   *  Z for east/west walls (whichever axis actually varies across the
   *  wall's 4 vertices). See
   *  docs/superpowers/specs/2026-09-22-terrain-elevation-slopes-design.md §5. */
  const addCliffFace = (
    v0: [number, number, number], v1: [number, number, number],
    v2: [number, number, number], v3: [number, number, number],
    nx: number, ny: number, nz: number,
    r: number, g: number, b: number,
    tangent: (v: readonly [number, number, number]) => number,
  ): void => {
    let geo = groundGeometry['cliff'];
    if (!geo) { geo = { positions: [], normals: [], colors: [], uvs: [], indices: [] }; groundGeometry['cliff'] = geo; }
    const base = geo.positions.length / 3;
    geo.positions.push(...v0, ...v1, ...v2, ...v3);
    geo.normals.push(nx, ny, nz,  nx, ny, nz,  nx, ny, nz,  nx, ny, nz);
    geo.colors.push(r, g, b,  r, g, b,  r, g, b,  r, g, b);
    for (const v of [v0, v1, v2, v3]) {
      geo.uvs.push(tangent(v) / CLIFF_UV_TILE_WU, v[1] / CLIFF_UV_TILE_WU);
    }
    geo.indices.push(base, base + 1, base + 2,  base, base + 2, base + 3);
  };
```

Now replace each of the 4 wall blocks' plain (non-shoreline) `else { addFace(...) }` branch. **South wall** (`else` branch under `if (southWaterAdjacent || ...)`):

```ts
        } else {
          addCliffFace(
            [wx1, wallTopS, wz1], [wx, wallTopS, wz1], [wx, wyS, wz1], [wx1, wyS, wz1],
            0, 0, 1,  tr * d, tg * d, tb * d,
            (v) => v[0],
          );
        }
```

**North wall:**

```ts
        } else {
          addCliffFace(
            [wx, wallTopN, wz], [wx1, wallTopN, wz], [wx1, wyN, wz], [wx, wyN, wz],
            0, 0, -1,  tr * d, tg * d, tb * d,
            (v) => v[0],
          );
        }
```

**East wall:**

```ts
        } else {
          addCliffFace(
            [wx1, wallTopE, wz], [wx1, wallTopE, wz1], [wx1, wyE, wz1], [wx1, wyE, wz],
            1, 0, 0,  tr * d, tg * d, tb * d,
            (v) => v[2],
          );
        }
```

**West wall:**

```ts
        } else {
          addCliffFace(
            [wx, wallTopW, wz1], [wx, wallTopW, wz], [wx, wyW, wz], [wx, wyW, wz1],
            -1, 0, 0,  tr * d, tg * d, tb * d,
            (v) => v[2],
          );
        }
```

Leave every `if (...WaterAdjacent || _hasCornerPull(...))` shoreline branch (the `addFace` call inside the `for (let i = 0; i < pts.length - 1; i++)` loop in each of the 4 blocks) completely unchanged.

- [ ] **Step 8: Run the new test to verify it passes**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "routes non-shoreline wall faces" --poolOptions.threads.maxThreads=1`
Expected: PASS.

- [ ] **Step 9: Update the now-outdated existing wall-face test**

The existing `'emits 4 wall faces around a single raised tile between two flat tiles'` test (near the top of the file) asserted `data.positions` directly contains the 4 wall faces — that assumption is no longer true. Update it:

Replace:

```ts
    expect(totalPositionsLength(data)).toBe(624);
    expect(data.positions).toHaveLength(4 * 4 * 3); // 4 wall faces
    const totalGroundPositions = Object.values(data.groundGeometry).reduce((s, g) => s + g.positions.length, 0);
    expect(totalGroundPositions).toBe(3 * 16 * 4 * 3); // 3 tiles' top faces, subdivided
    expect(totalIndicesLength(data)).toBe(4 * 6 + 3 * 16 * 6); // 4 wall faces + 48 sub-tile top faces, × 6 indices each
```

with:

```ts
    // Wall faces now route into groundGeometry.cliff (1.3 §5) instead of
    // the base buffer, so the base buffer stays empty and the total
    // ground-geometry position count grows by the 4 wall faces' share.
    expect(totalPositionsLength(data)).toBe(624);
    expect(data.positions).toHaveLength(0);
    expect(data.groundGeometry.cliff).toBeDefined();
    expect(data.groundGeometry.cliff!.positions).toHaveLength(4 * 4 * 3); // 4 wall faces
    const totalTopFacePositions = Object.entries(data.groundGeometry)
      .filter(([variant]) => variant !== 'cliff')
      .reduce((s, [, g]) => s + g.positions.length, 0);
    expect(totalTopFacePositions).toBe(3 * 16 * 4 * 3); // 3 tiles' top faces, subdivided
    expect(totalIndicesLength(data)).toBe(4 * 6 + 3 * 16 * 6); // 4 wall faces + 48 sub-tile top faces, × 6 indices each
```

Update the comment 3 lines above this block too (the one describing where walls land) to say "Walls now land in groundGeometry.cliff (1.3 §5)" instead of "Walls land in the base buffer."

- [ ] **Step 10: Run the full TerrainGeometryBuilder test file to check for regressions**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts --poolOptions.threads.maxThreads=1`
Expected: All PASS. If any other existing test asserts on `data.positions` length/contents for a scenario that includes a non-shoreline wall face, update it the same way as Step 9 (walls moved out of the base buffer into `groundGeometry.cliff`); if a test asserts on shoreline-adjacent wall faces (water-adjacent or corner-pulled), it should be unaffected since those still use `addFace` into the base buffer.

- [ ] **Step 11: Commit**

```bash
git add src/world/TerrainTextures.ts src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts tests/world/TerrainTextures.test.ts
git commit -m "feat: texture cliff walls with the existing granite/mountain material (1.3 §5)"
```

---

### Task 7: Full regression pass, live verification, and playtest handoff

**Files:** None modified — verification-only task.

- [ ] **Step 1: Run the full world test suite scoped and throttled to avoid sandbox contention timeouts**

Run: `npx vitest run tests/world --poolOptions.threads.maxThreads=2`
Expected: All PASS. Investigate and fix any failure before proceeding — do not skip or `.skip()` any test.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Live verification via Playwright**

Launch the dev app (however this project's existing Playwright/dev-server verification flow works — check `package.json` scripts and any existing `docs/superpowers/plans/*.md` from sub-tasks 1.1/1.2 for the exact command this project has used before), generate a mid-size world, and capture screenshots of: (a) a mid-ring area with visible terraced hills/slopes, (b) a mountain-biome area showing the new cliff/granite wall texture, (c) a shoreline area to confirm the existing shoreline wall look is unaffected. Visually confirm no new black gaps or floating/fall-through geometry appear at terraced slope edges.

- [ ] **Step 4: Human playtest gate**

Per the `research-driven-world-polish` process skill, present the screenshots and a summary of the 6 changes (boundary-agreement regression test, flat-zone shrink, elevation smoothing, terracing pass, cliff texture, plus the two flagged spec deviations) to the user and wait for explicit approval before considering sub-task 1.3 complete. Do not proceed to any Phase 1 sub-task 1.4 (or close out Phase 1) until this gate is passed.
