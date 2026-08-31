# Organic Biome Transitions (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make biome borders (coastlines, mountain treelines, climate-zone edges) read as
organically wobbly instead of perfect noise-contours, by domain-warping the coordinate fed into
`RealmGenerator.ts`'s biome-classification noise sampling.

**Architecture:** Add one new low-frequency `noiseW` field to `generateRealmData()`, and a small
pure `_domainWarp(nx, ny, roughness, noiseW)` helper that computes a bounded `(wx, wy)` displaced
coordinate. Feed `(wx, wy)` into every noise lookup that drives `classifyBiome()` (continent mask,
elevation, ridge, moisture, temperature-noise) instead of the raw `(nx, ny)`. `classifyBiome()`
itself, and the latitude term, stay untouched.

**Tech Stack:** TypeScript, Vitest, the existing `createNoise2D`/`fbmR` Simplex-noise helpers
already used throughout `RealmGenerator.ts`.

## Global Constraints

- `classifyBiome()`'s thresholds must not change at all — only which sample coordinate feeds it.
- `generateRealmData()` must stay fully deterministic for a given seed (existing tests already
  assert this — must keep passing unmodified).
- `generateRealmData(seed, 512, 512)` must stay under the existing 3-second perf budget
  (`tests/world/RealmGenerator.perf.test.ts`).
- Warp amplitude bound: `0.03 + roughness * 0.05` (roughness ranges 0–1 in existing callers).
- Warp frequency: `0.6` (well below the elevation noise's own 1.8–3.0 scale).
- The latitude term (`latT`) must keep using the true, unwarped `ny` — do not warp it.

---

## Task 1: `_domainWarp()` — the pure warp-displacement helper

**Files:**
- Modify: `src/world/RealmGenerator.ts`
- Test: `tests/world/RealmGenerator.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (self-contained pure function). Uses `createNoise2D` from
  `@/core/SimplexNoise` (already imported in `RealmGenerator.ts`).
- Produces: `export function _domainWarp(nx: number, ny: number, roughness: number, noiseW: (x: number, y: number) => number): { wx: number; wy: number }`,
  consumed by Task 2's edit to `generateRealmData()`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/RealmGenerator.test.ts` (add `_domainWarp` to the existing import line from
`@/world/RealmGenerator`, alongside `generateRealmData, classifyBiome`):

```ts
import { createNoise2D } from '@/core/SimplexNoise';

describe('_domainWarp', () => {
  it('is deterministic for the same inputs', () => {
    const noiseW = createNoise2D(123);
    const a = _domainWarp(0.4, 0.6, 0.5, noiseW);
    const b = _domainWarp(0.4, 0.6, 0.5, noiseW);
    expect(a).toEqual(b);
  });

  it('stays within the documented bound (0.03 + roughness * 0.05) for a range of roughness values', () => {
    const noiseW = createNoise2D(456);
    for (let i = 0; i < 30; i++) {
      for (const roughness of [0, 0.25, 0.5, 0.75, 1]) {
        const nx = (i * 0.037) % 1, ny = (i * 0.071) % 1;
        const { wx, wy } = _domainWarp(nx, ny, roughness, noiseW);
        const bound = 0.03 + roughness * 0.05;
        expect(Math.abs(wx - nx)).toBeLessThanOrEqual(bound + 1e-9);
        expect(Math.abs(wy - ny)).toBeLessThanOrEqual(bound + 1e-9);
      }
    }
  });

  it('produces more than one distinct displacement across many positions (not a degenerate constant)', () => {
    const noiseW = createNoise2D(789);
    const displacements = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const nx = (i * 0.041) % 1, ny = (i * 0.083) % 1;
      const { wx, wy } = _domainWarp(nx, ny, 0.5, noiseW);
      displacements.add(`${(wx - nx).toFixed(6)},${(wy - ny).toFixed(6)}`);
    }
    expect(displacements.size).toBeGreaterThan(1);
  });

  it('gives dx and dy different values (decorrelated, not the same displacement in both axes)', () => {
    const noiseW = createNoise2D(321);
    const { wx, wy } = _domainWarp(0.33, 0.71, 0.5, noiseW);
    expect(wx - 0.33).not.toBeCloseTo(wy - 0.71, 6);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
npx vitest run tests/world/RealmGenerator.test.ts -t "_domainWarp"
```

Expected: FAIL — `_domainWarp is not a function` (not yet exported).

- [ ] **Step 3: Implement `_domainWarp()` in `src/world/RealmGenerator.ts`**

Add this right after the `fbmR()` function definition (which currently sits just above
`export function generateRealmData(...)`):

```ts
/** Broad, low-frequency displacement applied to a biome-sampling coordinate
 *  before every noise lookup that feeds classifyBiome() — makes noise-
 *  contour-shaped biome borders (coastlines, treelines, climate-zone
 *  edges) read as organically wobbly instead of a perfect iso-contour.
 *  Pure function of (nx, ny, roughness) plus the caller-supplied seeded
 *  noiseW field — exported for direct unit testing (same pattern as
 *  TerrainGeometryBuilder.ts's subTileBumpJitter/_subTileGroundVariant).
 *  See docs/superpowers/specs/2026-08-31-organic-biome-transitions-design.md §3. */
export function _domainWarp(
  nx: number, ny: number, roughness: number,
  noiseW: (x: number, y: number) => number,
): { wx: number; wy: number } {
  const WARP_FREQ = 0.6; // well below the elevation noise's own scale (1.8–3.0) — broad, sweeping wobble, not speckle
  const warpAmount = 0.03 + roughness * 0.05; // 0.03–0.08, scales with the existing roughness knob
  const dx = noiseW(nx * WARP_FREQ, ny * WARP_FREQ) * warpAmount;
  // Offset sample point (not a different noise field) decorrelates dy from
  // dx using the same single noiseW field — same "+offset for decorrelation"
  // convention already used below for moisture (nx+5,ny+5) and temperature
  // (nx+10,ny+10) sampling.
  const dy = noiseW(nx * WARP_FREQ + 31.7, ny * WARP_FREQ + 47.3) * warpAmount;
  return { wx: nx + dx, wy: ny + dy };
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

```bash
npx vitest run tests/world/RealmGenerator.test.ts -t "_domainWarp"
```

Expected: PASS (4 tests).

- [ ] **Step 5: Run `npx tsc --noEmit`, confirm the error count is still 144**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: `144` (the project's documented pre-existing baseline — see any prior phase's shipping
notes in `docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md` for how this baseline was
established).

- [ ] **Step 6: Commit**

```bash
git add src/world/RealmGenerator.ts tests/world/RealmGenerator.test.ts
git commit -m "feat: add _domainWarp biome-sampling coordinate helper"
```

---

## Task 2: Wire `_domainWarp()` into `generateRealmData()`'s per-cell loop

**Files:**
- Modify: `src/world/RealmGenerator.ts`
- Test: `tests/world/RealmGenerator.test.ts`

**Interfaces:**
- Consumes: `_domainWarp(nx, ny, roughness, noiseW)` from Task 1.
- Produces: nothing new for later tasks — this is the final wiring task for this plan.

- [ ] **Step 1: Write the failing wiring test**

Add to `tests/world/RealmGenerator.test.ts`:

```ts
describe('generateRealmData — domain warp wiring', () => {
  it('feeds a warped coordinate into elevation/moisture sampling, not the raw (nx, ny)', () => {
    // Reproduce the exact pre-warp sampling formula inline (same noise
    // instances/seeds generateRealmData() itself constructs) and confirm
    // the real, current output differs from what the OLD unwarped formula
    // would have produced at the same cell — proves the warp is actually
    // wired into the real generation path, not just correct in isolation
    // (Task 1 already proves _domainWarp() itself is correct/bounded).
    const seed = 2024, W = 40, H = 30;
    const realm = generateRealmData(seed, W, H, 6, 'island', 'temperate', 0.5);

    const noiseE = createNoise2D(seed);
    const noiseR = createNoise2D(seed ^ 0xBADF00D);
    const oct = 4 + Math.round(0.5 * 2), scale = 1.8 + 0.5 * 1.2;
    const cx = 17, cy = 11; // an arbitrary non-edge, non-symmetric cell
    const nx = cx / W, ny = cy / H;
    const mask = (nx2: number, ny2: number) => Math.min(nx2, 1 - nx2, ny2, 1 - ny2) * 4.2; // 'island' shape's mask fn
    const fbmR2 = (noise: (x: number, y: number) => number, x: number, y: number, o: number, s: number) => {
      let v = 0, amp = 0.5, freq = s, max = 0;
      for (let i = 0; i < o; i++) { v += noise(x * freq, y * freq) * amp; max += amp; amp *= 0.5; freq *= 2.0; }
      return (v / max + 1) / 2;
    };
    const unwarpedMVal  = Math.min(1, mask(nx, ny));
    const unwarpedNoise = fbmR2(noiseE, nx, ny, oct, scale);
    const unwarpedRidge = Math.abs(fbmR2(noiseR, nx * 1.3, ny * 1.3, 3, 3.0) - 0.5) * 2;
    const unwarpedElev  = Math.min(1, unwarpedMVal * (unwarpedNoise * 0.75 + unwarpedRidge * 0.25 * 0.5 + 0.2));

    const actualElev = realm.cells[cy]![cx]!.elevation;
    expect(actualElev).not.toBeCloseTo(unwarpedElev, 6);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
npx vitest run tests/world/RealmGenerator.test.ts -t "domain warp wiring"
```

Expected: FAIL — `actualElev` equals `unwarpedElev` (warp not wired in yet).

- [ ] **Step 3: Wire `_domainWarp()` into `generateRealmData()`**

In `src/world/RealmGenerator.ts`, inside `generateRealmData()`:

Find this block (declaring the 4 noise fields):

```ts
  const noiseE = createNoise2D(seed);
  const noiseM = createNoise2D(seed ^ 0xDEADBEEF);
  const noiseT = createNoise2D(seed ^ 0xC0FFEE);
  const noiseR = createNoise2D(seed ^ 0xBADF00D);   // ridge/continent noise
```

Add a 5th field right after it:

```ts
  const noiseW = createNoise2D(seed ^ 0xFEEDFACE);  // domain-warp field (Phase 4)
```

Then find the per-cell closure body:

```ts
      const nx = cx / W, ny = cy / H;

      // Elevation: continent mask + fBm noise
      const mVal   = Math.min(1, mask(nx, ny));
      const noise  = fbmR(noiseE, nx, ny, oct, scale);
      const ridge  = Math.abs(fbmR(noiseR, nx*1.3, ny*1.3, 3, 3.0) - 0.5) * 2;
      const elev   = Math.min(1, mVal * (noise * 0.75 + ridge * 0.25 * roughness + 0.2));

      // Moisture
      const moist  = fbmR(noiseM, nx+5, ny+5, 3, 1.8);

      // Temperature: latitude + elevation + climate bias + noise jitter
      const latT   = 1 - Math.abs(ny - 0.5) * 1.5;
      const elvT   = 1 - Math.max(0, elev - 0.4) * 2.0;
      const tNoise = fbmR(noiseT, nx+10, ny+10, 2, 1.2) * 0.12;
      const temp   = Math.max(0, Math.min(1, latT*0.65 + elvT*0.35 + tNoise + climateBias));

      return { elevation: elev, moisture: moist, biome: classifyBiome(elev, moist, temp) };
```

Replace it with:

```ts
      const nx = cx / W, ny = cy / H;
      const { wx, wy } = _domainWarp(nx, ny, roughness, noiseW);

      // Elevation: continent mask + fBm noise — sampled at the warped
      // coordinate so coastlines/mountain edges read as organically
      // wobbly instead of a perfect noise-contour (Phase 4).
      const mVal   = Math.min(1, mask(wx, wy));
      const noise  = fbmR(noiseE, wx, wy, oct, scale);
      const ridge  = Math.abs(fbmR(noiseR, wx*1.3, wy*1.3, 3, 3.0) - 0.5) * 2;
      const elev   = Math.min(1, mVal * (noise * 0.75 + ridge * 0.25 * roughness + 0.2));

      // Moisture — also sampled at the warped coordinate.
      const moist  = fbmR(noiseM, wx+5, wy+5, 3, 1.8);

      // Temperature: latitude keeps the TRUE (unwarped) ny — it
      // represents the cell's real map position for climate banding, not
      // a noise-sample target, so warping it would be physically
      // meaningless. elvT is derived from the already-warped elev, so it
      // inherits the organic wobble; tNoise is sampled at the warped coordinate.
      const latT   = 1 - Math.abs(ny - 0.5) * 1.5;
      const elvT   = 1 - Math.max(0, elev - 0.4) * 2.0;
      const tNoise = fbmR(noiseT, wx+10, wy+10, 2, 1.2) * 0.12;
      const temp   = Math.max(0, Math.min(1, latT*0.65 + elvT*0.35 + tNoise + climateBias));

      return { elevation: elev, moisture: moist, biome: classifyBiome(elev, moist, temp) };
```

- [ ] **Step 4: Run the wiring test, confirm it passes**

```bash
npx vitest run tests/world/RealmGenerator.test.ts -t "domain warp wiring"
```

Expected: PASS.

- [ ] **Step 5: Run the full `RealmGenerator` test files, confirm all pass**

```bash
npx vitest run tests/world/RealmGenerator.test.ts tests/world/RealmGenerator.perf.test.ts
```

Expected: all tests pass, including the pre-existing determinism/settlement/tower/dungeon tests
(unmodified — this proves the warp change didn't break any existing invariant) and the 3-second
512×512 perf budget.

- [ ] **Step 6: Run the full downstream test suites that consume `generateRealmData`**

```bash
npx vitest run tests/world/RealmToWorldGrid.test.ts tests/world/WorldGenerator.test.ts tests/world/WorldGenConfig.test.ts
```

Expected: all pass — these consume `generateRealmData()`'s output but assert on structural
properties (grid size, biome validity, walkability), not exact per-cell noise values, so the
warp change should not affect them.

- [ ] **Step 7: Run `npx tsc --noEmit`, confirm the error count is still 144**

- [ ] **Step 8: Run the full project test suite**

```bash
npx vitest run
```

Expected: the same pre-existing baseline failures documented in
`docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md` (main.startup.smoke.test.ts×3,
enemyLoader.test.ts×3, towerGenerator.test.ts×2, talentSystem.test.ts×3, WaterMaterial.test.ts×1
— 12 total), zero new failures. Re-run any suspicious failure in isolation before concluding it's
a real regression (this project's documented sandbox-contention flakes are
`OverworldScene.chunk-scatter-alignment.test.ts` and `tests/world/ResourceNodePlacer.test.ts` and
occasionally `WorldGenerator.test.ts`'s determinism test — all three pass cleanly in isolation).

- [ ] **Step 9: Update the roadmap doc**

In `docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md`'s Phase 4 section, replace the
`- [ ]` checkboxes with a "✅ DONE" status write-up (matching the style of the Phase 3/7/8
write-ups already in that file): what shipped (`_domainWarp()` + wiring), the explicit note that
the "transition tile" bullet was already satisfied by the ground sub-tile system shipped
2026-09-01 (not re-built), and the actual test/perf/tsc results from steps 5–8 above.

- [ ] **Step 10: Commit and push to `main`**

```bash
git add src/world/RealmGenerator.ts tests/world/RealmGenerator.test.ts docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md
git commit -m "feat: domain-warp biome sampling for organic coastlines/borders (Phase 4)"
git push origin HEAD:main
```
