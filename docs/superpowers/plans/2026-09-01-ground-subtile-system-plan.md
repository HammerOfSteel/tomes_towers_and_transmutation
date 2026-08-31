# Ground Sub-Tile System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give flat and edge-shaped ground tiles (the vast majority of tiles, already textured
since Phase 4a) a real 4×4 sub-tile grid with seamless per-sub-tile height bump jitter (genuinely
uneven, rocky-feeling ground, not just a texture that looks bumpy) and per-sub-tile texture
variant selection (organic dithered biome-border transitions + occasional micro-patches like a
dirt/rock/flower patch within an otherwise-uniform tile).

**Architecture:** Two new pure functions in `TerrainGeometryBuilder.ts` — `subTileBumpJitter()`
(a finer-resolution sibling of the existing `cornerHeightJitter()`, seamless across both
sub-tile-to-sub-tile and tile-to-tile boundaries since it's a pure function of absolute world
lattice position) and `_subTileGroundVariant()` (border-dithering + micro-patch pure selection
logic, no `WorldGrid` dependency). The flat/edge top-face branches loop over a 4×4 sub-tile grid
instead of emitting one quad, bilinear-interpolating the tile's already-computed 4 corner heights
(exact, since these shapes are already planar) plus the new bump, routing each sub-tile
independently into the appropriate `groundGeometry[variant]` buffer.

**Tech Stack:** TypeScript, Vitest, Three.js/Rapier (unaffected — same buffer structure feeds the
same collider merge and mesh-per-variant rendering already shipped in Phase 4a).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-09-01-ground-subtile-system-design.md` (approved
  2026-09-01) — read this first; this plan implements it directly.
- **Scope boundary (confirmed with user):** only flat and edge shapes get sub-tile treatment.
  Ramp shapes (single-corner/outer-corner/saddle) and water/uncovered-biome tiles are completely
  unaffected by this plan — same code paths, same output, as Phase 4a shipped them.
- **Also explicitly out of scope:** tiles with partial road coverage (`hasRoadCoverage` branch) —
  their ground-only sub-tile portions keep today's plain vertex-color/jitter-only rendering,
  unchanged. This is a pre-existing, separate code path this plan does not touch.
- Walls are unaffected — wall-anchoring keeps comparing against the tile's raw (pre-bump)
  `swY`/`nwY`/`neY`/`seY`, exactly as today.
- The new bump **replaces** (does not layer with) the old per-tile-corner `cornerHeightJitter()`
  call for sub-divided tiles — see design spec §3.2. Non-sub-divided tiles keep using
  `cornerHeightJitter()` exactly as before.
- After each task: run the task's targeted test file(s), then `npx tsc --noEmit` and confirm the
  error count matches the pre-existing baseline (144 errors) or better — never worse.
- This pass is expected to show a **real, measurable perf cost** (subdividing ~94%+~edge% of
  tiles into up to 16× the quad count) — the user has explicitly accepted this tradeoff. Report
  the honest number in Task 5, do not downplay it.

---

## File Structure

- **Modify** `src/world/TerrainGeometryBuilder.ts` — new `subTileBumpJitter()` (exported, pure),
  new `MICRO_PATCH_VARIANTS` table + `_subTileGroundVariant()` (pure, internal), new
  `emitGroundSubTiles()` helper, flat/edge branches updated to call it instead of a single
  `addGroundFace()`.
- **Modify** `tests/world/TerrainGeometryBuilder.test.ts` — new tests for the 2 new pure
  functions; migrate every existing test whose fixture is a covered-biome flat/edge tile from
  "1 quad" to "16 sub-tile quads" counts (see Task 3's migration recipe); existing ramp-shape and
  uncovered-biome tests need no changes.

---

## Task 1: `subTileBumpJitter()` — seamless finer-resolution height bump

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Modify: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Produces: `subTileBumpJitter(worldX: number, worldZ: number): number` and
  `SUBTILE_BUMP_MAX = 0.06` (both exported), consumed by Task 3's `emitGroundSubTiles()`.

- [ ] **Step 1: Write failing tests**

Add a new `describe` block to `tests/world/TerrainGeometryBuilder.test.ts` (append near
`cornerHeightJitter`'s existing describe block — search for `describe('cornerHeightJitter'` to
find it and add this as a sibling block right after):

```ts
describe('subTileBumpJitter', () => {
  it('is deterministic for the same world coordinates', () => {
    expect(subTileBumpJitter(12.5, -7.25)).toBe(subTileBumpJitter(12.5, -7.25));
  });

  it('stays within [-SUBTILE_BUMP_MAX, +SUBTILE_BUMP_MAX]', () => {
    for (let i = -30; i < 30; i++) {
      for (let j = -30; j < 30; j++) {
        const v = subTileBumpJitter(i * 0.37, j * 0.53);
        expect(v).toBeGreaterThanOrEqual(-SUBTILE_BUMP_MAX);
        expect(v).toBeLessThanOrEqual(SUBTILE_BUMP_MAX);
      }
    }
  });

  it('produces more than one distinct value across many positions (not a constant)', () => {
    const values = new Set<number>();
    for (let i = -30; i < 30; i++) values.add(subTileBumpJitter(i * 0.41, i * -0.29));
    expect(values.size).toBeGreaterThan(1);
  });

  it('gives two adjacent tiles sharing a sub-lattice point the identical bump there (seamless)', () => {
    // The world point (10, 5) could be reached as a sub-tile corner from
    // either side of a tile boundary — must always compute the same value
    // regardless of which tile "owns" the lookup.
    const a = subTileBumpJitter(10, 5);
    const b = subTileBumpJitter(10, 5);
    expect(a).toBe(b);
  });
});
```

Add `subTileBumpJitter` and `SUBTILE_BUMP_MAX` to the test file's existing import from
`@/world/TerrainGeometryBuilder` (find the line starting `import { buildTerrainGeometryData,
BIOME_COLOR_VARIANTS, ...` and add both names to that same import list).

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "subTileBumpJitter"
```

Expected: FAIL — module doesn't export these names yet.

- [ ] **Step 3: Implement in `src/world/TerrainGeometryBuilder.ts`**

Find `cornerHeightJitter()`'s definition (search `export function cornerHeightJitter`) and add
this new function + constant right after it:

```ts
/** Small height offset for a sub-tile lattice point, keyed by absolute
 *  world (x, z) position rather than integer tile-corner coordinates —
 *  same bit-mixing hash technique as cornerHeightJitter(), but at the
 *  finer sub-tile lattice resolution. Being a pure function of world
 *  position (not tile-relative coordinates) guarantees any two quads that
 *  reference the same world point — adjacent sub-tiles within one tile,
 *  or adjacent tiles sharing a real corner — always compute the identical
 *  value there, so this is seamless everywhere without a special case at
 *  tile boundaries. Replaces (does not layer with) cornerHeightJitter()
 *  for tiles that get sub-tile treatment — see
 *  docs/superpowers/specs/2026-09-01-ground-subtile-system-design.md §3.2. */
export const SUBTILE_BUMP_MAX = 0.06;

export function subTileBumpJitter(worldX: number, worldZ: number): number {
  const xi = Math.floor(worldX * 1000) | 0;
  const zi = Math.floor(worldZ * 1000) | 0;
  let h = (xi * 1274126177 + zi * 2654435761) | 0;
  h = (h ^ (h >>> 15)) * 2246822519 | 0;
  h = h ^ (h >>> 13);
  const unit = (h >>> 0) / 4294967296; // → [0, 1)
  return (unit * 2 - 1) * SUBTILE_BUMP_MAX; // → [-max, +max]
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

```bash
npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "subTileBumpJitter"
```

- [ ] **Step 5: Run `npx tsc --noEmit`, confirm baseline (144)**

- [ ] **Step 6: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "feat: add subTileBumpJitter, a seamless finer-resolution height bump"
```

---

## Task 2: `_subTileGroundVariant()` — border dithering + micro-patches

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Modify: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (independent pure logic).
- Produces: `_subTileGroundVariant(...)` (internal, not exported — tested indirectly is NOT
  possible since it's not exported; **export it** for direct unit testing, matching this file's
  existing convention of exporting `cornerHeightJitter`/`cellVariantIndex` for the same reason),
  consumed by Task 3's `emitGroundSubTiles()`.

- [ ] **Step 1: Write failing tests**

Add a new `describe` block to `tests/world/TerrainGeometryBuilder.test.ts`:

```ts
describe('_subTileGroundVariant', () => {
  const noNeighbors = { south: null, north: null, east: null, west: null };

  it('returns the tile\'s own variant when no neighbor differs and no micro-patch is defined', () => {
    // 'mountain' has no MICRO_PATCH_VARIANTS entry (see design spec §3.3).
    for (let sx = 0; sx < 4; sx++) {
      for (let sz = 0; sz < 4; sz++) {
        const v = _subTileGroundVariant('mountain', noNeighbors, sx, sz, 4, 'mountain', sx * 3.1, sz * 2.7);
        expect(v).toBe('mountain');
      }
    }
  });

  it('only pulls toward a differing neighbor variant for the outermost sub-tile row/column touching that edge', () => {
    // South neighbor differs; only sz === 3 (the outermost south-facing row, N=4) may ever pull.
    const neighbors = { ...noNeighbors, south: 'desert' };
    let sawPullAtInterior = false;
    for (let sx = 0; sx < 4; sx++) {
      for (let sz = 0; sz < 3; sz++) { // sz 0,1,2 — never the outermost south row
        const v = _subTileGroundVariant('mountain', neighbors, sx, sz, 4, 'mountain', sx * 5.3 + 1, sz * 4.1 + 1);
        if (v === 'desert') sawPullAtInterior = true;
      }
    }
    expect(sawPullAtInterior).toBe(false);
  });

  it('never pulls toward a neighbor whose variant equals its own', () => {
    const neighbors = { ...noNeighbors, south: 'mountain' }; // same as own variant
    for (let sx = 0; sx < 4; sx++) {
      const v = _subTileGroundVariant('mountain', neighbors, sx, 3, 4, 'mountain', sx * 7.7, 99);
      expect(v).toBe('mountain');
    }
  });

  it('is deterministic for the same inputs', () => {
    const neighbors = { ...noNeighbors, east: 'forest' };
    const a = _subTileGroundVariant('grassland', neighbors, 3, 1, 4, 'grassland', 12.3, 45.6);
    const b = _subTileGroundVariant('grassland', neighbors, 3, 1, 4, 'grassland', 12.3, 45.6);
    expect(a).toBe(b);
  });

  it('occasionally applies a micro-patch variant for a biome with one mapped, at a low rate', () => {
    // 'grassland' maps to ['river_bank'] (see design spec §3.3's MICRO_PATCH_VARIANTS table).
    let patchCount = 0;
    const total = 400;
    for (let i = 0; i < total; i++) {
      const v = _subTileGroundVariant('grassland', noNeighbors, 1, 1, 4, 'grassland', i * 3.7, i * -2.9);
      if (v === 'river_bank') patchCount++;
      else expect(v).toBe('grassland');
    }
    expect(patchCount).toBeGreaterThan(0);
    expect(patchCount).toBeLessThan(total * 0.25); // low rate, not dominant
  });
});
```

Add `_subTileGroundVariant` to the test file's existing import from
`@/world/TerrainGeometryBuilder`.

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "_subTileGroundVariant"
```

- [ ] **Step 3: Implement in `src/world/TerrainGeometryBuilder.ts`**

Add near the top of the file, after the `GROUND_UV_TILE_WU` constant:

```ts
/** Sub-tile grid resolution for ground tiles — same N=4 convention roads
 *  already established (RoadPathSampler.ts's roadSubdivisions default),
 *  for consistency rather than a new magic number. */
const GROUND_SUBDIVISIONS = 4;

/** Probability (per independent roll) that an outermost-row/column
 *  sub-tile pulls toward a differing neighbor's variant instead of its
 *  own — see design spec §3.3. */
const BORDER_PULL_PROBABILITY = 0.40;

/** Probability that a sub-tile swaps to a micro-patch variant, for
 *  biomes that have one mapped. */
const MICRO_PATCH_PROBABILITY = 0.06;

/** Which "micro-patch" texture variant occasionally interrupts a biome's
 *  own ground texture — reuses the 10 variants already shipped in Phase
 *  4a, no new content. Biomes not listed have no micro-patch (already
 *  read as fairly uniform — mountain/snow/desert/beach/river_bank). See
 *  docs/superpowers/specs/2026-09-01-ground-subtile-system-design.md §3.3. */
const MICRO_PATCH_VARIANTS: Partial<Record<BiomeId, readonly string[]>> = {
  grassland: ['river_bank'],
  forest:    ['mountain'],
  savanna:   ['desert'],
  taiga:     ['mountain'],
  tundra:    ['snow'],
};

/** Deterministic pseudo-random unit value [0, 1) for a world position,
 *  offset by `salt` so multiple independent rolls at the same position
 *  (one per border direction, one for micro-patch selection) don't
 *  correlate with each other. */
function _subTileRoll(worldX: number, worldZ: number, salt: number): number {
  const xi = Math.floor(worldX * 1000) | 0;
  const zi = Math.floor(worldZ * 1000) | 0;
  let h = (xi * 374761393 + zi * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Resolves which texture variant one ground sub-tile should render with
 *  — border dithering (pull toward a differing orthogonal neighbor's
 *  variant, only for the outermost sub-tile row/column touching that
 *  edge) checked in a fixed S/N/E/W priority order, then an occasional
 *  low-probability micro-patch swap, else the tile's own variant. Pure
 *  function — the caller resolves neighbor cells/variants and passes
 *  them in. Exported (like cornerHeightJitter/cellVariantIndex) for
 *  direct unit testing. */
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

  if (isOutermostSouth && neighborVariant.south !== null && neighborVariant.south !== ownVariant) {
    if (_subTileRoll(subWorldX, subWorldZ, 1) < BORDER_PULL_PROBABILITY) return neighborVariant.south;
  }
  if (isOutermostNorth && neighborVariant.north !== null && neighborVariant.north !== ownVariant) {
    if (_subTileRoll(subWorldX, subWorldZ, 2) < BORDER_PULL_PROBABILITY) return neighborVariant.north;
  }
  if (isOutermostEast && neighborVariant.east !== null && neighborVariant.east !== ownVariant) {
    if (_subTileRoll(subWorldX, subWorldZ, 3) < BORDER_PULL_PROBABILITY) return neighborVariant.east;
  }
  if (isOutermostWest && neighborVariant.west !== null && neighborVariant.west !== ownVariant) {
    if (_subTileRoll(subWorldX, subWorldZ, 4) < BORDER_PULL_PROBABILITY) return neighborVariant.west;
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

- [ ] **Step 4: Run the tests, confirm they pass**

```bash
npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "_subTileGroundVariant"
```

- [ ] **Step 5: Run `npx tsc --noEmit`, confirm baseline (144)**

- [ ] **Step 6: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "feat: add _subTileGroundVariant border-dithering + micro-patch logic"
```

---

## Task 3: Wire sub-tile emission into the flat/edge branches

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Modify: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `subTileBumpJitter()` (Task 1), `_subTileGroundVariant()` (Task 2), and the existing
  `addGroundFace()`/`_groundTextureVariant()` helpers (Phase 4a).

- [ ] **Step 1: Add the `emitGroundSubTiles()` helper**

Add this function inside `buildTerrainGeometryData()`, right after the existing
`addGroundFace` closure definition (so it can close over `addGroundFace`) — find `const
addGroundFace = (` and its closing `};`, then add immediately after:

```ts
  /** Emits one flat/edge-shaped tile's top face as a GROUND_SUBDIVISIONS×
   *  GROUND_SUBDIVISIONS sub-tile grid instead of a single quad — each
   *  sub-tile's height is bilinearly interpolated from the tile's own 4
   *  corner heights (exact, since flat/edge shapes are already planar)
   *  plus subTileBumpJitter(), and each sub-tile independently resolves
   *  its own texture variant via _subTileGroundVariant(). Shares one
   *  normal across every sub-tile (matching the parent shape's own
   *  already-computed normal — flat's fixed up-normal, or edge's real
   *  tilted normal), consistent with how the pre-existing per-tile jitter
   *  already never perturbs the normal either. See
   *  docs/superpowers/specs/2026-09-01-ground-subtile-system-design.md. */
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

- [ ] **Step 2: Wire it into the flat/all-four-down branch**

Find:

```ts
      } else if (shape === 'flat' || shape === 'all-four-down' || !rampEligible) {
        // Identical to pre-ramp behavior: jitter-only positions, fixed up-normal.
        const groundVariant = _groundTextureVariant(cell);
        if (groundVariant !== null) {
          addGroundFace(
            groundVariant,
            [wx, wy + jSW, wz], [wx, wy + jNW, wz1], [wx1, wy + jNE, wz1], [wx1, wy + jSE, wz],
            0, 1, 0,  tr, tg, tb,
          );
        } else {
          addFace(
            [wx, wy + jSW, wz], [wx, wy + jNW, wz1], [wx1, wy + jNE, wz1], [wx1, wy + jSE, wz],
            0, 1, 0,  tr, tg, tb,
          );
        }
```

Replace the `groundVariant !== null` branch:

```ts
      } else if (shape === 'flat' || shape === 'all-four-down' || !rampEligible) {
        // Identical to pre-ramp behavior: jitter-only positions, fixed up-normal.
        const groundVariant = _groundTextureVariant(cell);
        if (groundVariant !== null) {
          emitGroundSubTiles(col, row, cell, groundVariant, swY, nwY, neY, seY, 0, 1, 0, wx, wz, tr, tg, tb);
        } else {
          addFace(
            [wx, wy + jSW, wz], [wx, wy + jNW, wz1], [wx1, wy + jNE, wz1], [wx1, wy + jSE, wz],
            0, 1, 0,  tr, tg, tb,
          );
        }
```

- [ ] **Step 3: Wire it into the edge branch**

Find:

```ts
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
        const groundVariant = _groundTextureVariant(cell);
        if (groundVariant !== null) {
          addGroundFace(groundVariant, v0, v1, v2, v3, n[0], n[1], n[2], tr, tg, tb);
        } else {
          addFace(v0, v1, v2, v3, n[0], n[1], n[2], tr, tg, tb);
        }
```

Replace the `groundVariant !== null` branch:

```ts
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
        const groundVariant = _groundTextureVariant(cell);
        if (groundVariant !== null) {
          // NOTE: emitGroundSubTiles interpolates from the tile's raw
          // (pre-jitter) swY/nwY/neY/seY, not the jittered v0..v3 corners
          // computed just above for the non-subdivided fallback path —
          // this is intentional (see design spec §3.2: the new bump
          // replaces, not layers with, the old per-tile jitter).
          emitGroundSubTiles(col, row, cell, groundVariant, swY, nwY, neY, seY, n[0], n[1], n[2], wx, wz, tr, tg, tb);
        } else {
          addFace(v0, v1, v2, v3, n[0], n[1], n[2], tr, tg, tb);
        }
```

- [ ] **Step 4: Run the full test suite for this file, triage every failure**

```bash
npx vitest run tests/world/TerrainGeometryBuilder.test.ts
```

Expect many failures — every test whose fixture is a covered-biome (commonly the default
`'grassland'`) flat or edge tile now produces `GROUND_SUBDIVISIONS² = 16` sub-tile quads instead
of 1. **Migration recipe** (same technique used for each failure):

- A test asserting `data.groundGeometry.<biome>.indices.length` (or `.positions.length` /
  `.normals.length`) for a **single flat or edge tile with no biome-differing neighbors and no
  micro-patch triggered** (i.e., an isolated tile via the `colStart/rowStart/chunkW/chunkH`
  params, surrounded by same-biome tiles, or a biome with no `MICRO_PATCH_VARIANTS` entry like
  `'mountain'`) should have its expected count multiplied by 16 (e.g. `6` → `16 * 6`, `4 * 3` →
  `16 * 4 * 3`).
- A test checking **exact vertex indices** (e.g. `data.groundGeometry.grassland!.positions[0]`
  for "the first vertex") needs re-deriving which sub-tile now occupies that position — for the
  "no seam between adjacent tiles" test specifically, rewrite it to compare the *last sub-tile
  column* of one tile's grid against the *first sub-tile column* of the neighbor tile's grid
  (not raw indices 2/3 vs 0/1), or simplify to directly assert
  `subTileBumpJitter(sharedWorldX, sharedWorldZ)` is the same value used by both (a unit-level
  check, since Task 1 already proves the underlying function is seamless — the geometry-level
  test just needs to confirm the *wiring* passes the correct shared world coordinates, not
  re-prove seamlessness from scratch).
- A test using an **uncovered biome** (ocean/river/lake/ford) or an **explicitly ramp-shaped**
  tile (single-corner/outer-corner/saddle, e.g. the "Single-corner-shaped tile" test) needs
  **no changes** — those paths are untouched by this task.
- If a test's *actual intent* is "total geometry emitted" rather than a specific shape's exact
  count, prefer the existing `totalPositionsLength()`/`totalIndicesLength()`/`allNormals()`
  helpers (added in Phase 4a) over hand-multiplying by 16, for robustness against small future
  tuning of `GROUND_SUBDIVISIONS`.

Do not weaken any test's actual guarantee while migrating it — every fix must still verify the
same real property the test originally checked (seamlessness, correct routing, correct color/UV,
wall behavior, etc.), just accounting for the new sub-tile count/positions.

- [ ] **Step 5: Add new tests specific to sub-tile behavior**

Add to a new `describe('buildTerrainGeometryData — ground sub-tile system (2026-09-01)', ...)`
block:

```ts
  it('emits GROUND_SUBDIVISIONS^2 sub-tile quads for a flat covered-biome tile with no differing neighbors', () => {
    const wg = new WorldGrid(3, 3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) wg.set(c, r, { biome: 'mountain', elevation: 1 });
    const data = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1, 1, 1, 1, 1);
    // 'mountain' has no MICRO_PATCH_VARIANTS entry and no differing
    // neighbor here, so every sub-tile should resolve to 'mountain' itself.
    expect(data.groundGeometry.mountain!.indices).toHaveLength(16 * 6);
    expect(Object.keys(data.groundGeometry)).toEqual(['mountain']);
  });

  it('gives adjacent sub-tiles within the same tile seamless shared-edge heights (bump is consistent)', () => {
    const wg = new WorldGrid(3, 3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) wg.set(c, r, { biome: 'mountain', elevation: 1 });
    const data = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1, 1, 1, 1, 1);
    const p = data.groundGeometry.mountain!.positions;
    // Emission order: sz outer loop, sx inner loop, 4 verts (SW,NW,NE,SE)
    // per sub-tile quad. Quad 0 = sub-tile (sx=0,sz=0): verts 0(SW),1(NW),
    // 2(NE),3(SE). Quad 1 = sub-tile (sx=1,sz=0): verts 4(SW),5(NW),6(NE),
    // 7(SE) — immediately east of quad 0. Quad0's east edge (NE,SE) must
    // exactly match quad1's west edge (NW,SW): same world lattice points,
    // so the shared bump value must agree.
    const v = (i: number) => ({ x: p[i * 3]!, y: p[i * 3 + 1]!, z: p[i * 3 + 2]! });
    const q0NE = v(2), q0SE = v(3);
    const q1NW = v(5), q1SW = v(4);
    expect(q0NE.x).toBeCloseTo(q1NW.x, 9);
    expect(q0NE.y).toBeCloseTo(q1NW.y, 9);
    expect(q0NE.z).toBeCloseTo(q1NW.z, 9);
    expect(q0SE.x).toBeCloseTo(q1SW.x, 9);
    expect(q0SE.y).toBeCloseTo(q1SW.y, 9);
    expect(q0SE.z).toBeCloseTo(q1SW.z, 9);
  });

  it('pulls border sub-tiles toward a differently-textured neighbor sometimes, concentrated near the shared edge', () => {
    // 6 mountain/desert tile-pairs along a shared north-south edge = 24
    // independent per-sub-tile 40% border-pull rolls (N=4 each) — makes
    // "zero pulls succeed" astronomically unlikely (0.6^24 ≈ 0.0005%),
    // unlike testing a single tile-pair (0.6^4 ≈ 13% flake risk).
    const wg = new WorldGrid(2, 6);
    for (let r = 0; r < 6; r++) {
      wg.set(0, r, { biome: 'mountain', elevation: 1 });
      wg.set(1, r, { biome: 'desert', elevation: 1 });
    }
    const data = buildTerrainGeometryData(wg, 2, 6, 0.5, 2.5, 2, 1);
    const desertPulledIn = data.groundGeometry.desert?.indices.length ?? 0;
    expect(desertPulledIn).toBeGreaterThan(0);
  });

  it('never subdivides a ramp-shaped (non-planar) tile — unaffected by this pass', () => {
    const wg = new WorldGrid(4, 4);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) wg.set(c, r, { elevation: 3, biome: 'grassland' });
    wg.set(2, 2, { elevation: 2, biome: 'grassland' }); // isolates a single-corner dip on tile (1,1), same fixture as the existing single-corner test
    const data = buildTerrainGeometryData(wg, 4, 4, 1, 1, 2, 1, 1, 1, 1, 1);
    // Still exactly 1 shape's worth (6 verts, 2 triangles) — not 16 sub-tiles.
    expect(data.groundGeometry.grassland!.positions.length / 3).toBe(6);
  });
```

Add `WorldGrid` biome `'mountain'`/`'desert'` fixtures already exist elsewhere in the file for
reference on exact call signatures if any of the above need adjustment.

- [ ] **Step 6: Run the full test suite for this file again, confirm everything passes**

```bash
npx vitest run tests/world/TerrainGeometryBuilder.test.ts
```

- [ ] **Step 7: Run `npx tsc --noEmit`, confirm baseline (144)**

- [ ] **Step 8: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "feat: subdivide flat/edge ground tiles into a bumpy, dithered sub-tile grid"
```

---

## Task 4: OverworldScene regression check + honest perf measurement

**Files:** none modified (verification only — Phase 4a's mesh/collider wiring already consumes
`groundGeometry` generically, so no `OverworldScene.ts` changes should be needed).

- [ ] **Step 1: Run the full scene test suite**

```bash
npx vitest run tests/scene/
```

Confirm all pass — this exercises chunk load/unload, collider correctness (now covering the
bumpy sub-tile geometry too, automatically, since it's baked into the same `groundGeometry`
buffers Phase 4a's collider merge already consumes), and scatter/terrain alignment.

- [ ] **Step 2: Honest perf check**

Same methodology as every prior phase — a temporary `git worktree` at the commit before Task 1,
comparing chunk-build time for a representative mixed-biome chunk set (reuse or adapt the
benchmark script from Phase 4a's own perf check if it still exists in shell history/scrollback,
or write a fresh one following that same pattern: build N chunks via `buildTerrainGeometryData()`
directly, `performance.now()` around each call, average). **Report the real number** — this pass
is expected to show a real, larger increase than Phase 4a's (subdividing into up to 16× the quad
count for ~94%+ of tiles is a substantial geometry increase, not a marginal one). Do not round
favorably or downplay it.

- [ ] **Step 3: Commit the perf finding as part of Task 5's rollout doc update** (no separate
  commit here — folded into Task 5).

---

## Task 5: Full regression, live verification, ship

**Files:** none (verification + rollout only)

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Confirm the same 12 pre-existing baseline failures — zero new failures. Re-run any flaky-looking
failure in isolation before concluding it's a real regression (documented sandbox-contention
precedent from Phases 3/4a/7).

- [ ] **Step 2: Run `npx tsc --noEmit`, confirm error count at or below the 144 baseline**

- [ ] **Step 3: Attempt live/manual verification**

Using the established Playwright + dev server workflow (check `ps aux | grep chrom` and kill
stale processes first): generate a world, confirm no console/page errors after `forceTick()`,
attempt a screenshot to visually confirm ground reads as less blocky/more organic with visible
micro-terrain roughness and dithered biome-border transitions, and confirm player movement still
feels normal (no jankiness from the bump). If browser automation hangs or screenshot capture
times out, report the gap explicitly rather than blocking completion on it, per established
precedent.

- [ ] **Step 4: Update the roadmap doc**

In `docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md`'s Phase 8 section (which already
documents the Phase 4a ground-texture-wiring DONE writeup), add a follow-up entry noting the
sub-tile system shipped as a further pass, with the honest perf number from Task 4 and the
explicit ramp-shape/road-coverage scope boundaries.

- [ ] **Step 5: Commit and push to `main`**

```bash
git add docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md
git commit -m "docs: mark ground sub-tile system (bumps + micro-patches) DONE"
git push origin HEAD:main
```
