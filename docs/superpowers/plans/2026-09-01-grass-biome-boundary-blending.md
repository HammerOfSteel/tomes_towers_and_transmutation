# Grass Biome-Boundary Blending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soften the hard color/density cutoff where grass meets a different biome —
grass thins out gradually near any boundary instead of stopping abruptly, and blades
near a boundary trend toward the shared warm `dryColor` already defined on every
preset, so adjacent biomes' grass blends into each other instead of clashing.

**Architecture:** A new pure `computeEdgeBlend()` function samples 8 neighbor points
around each grass placement candidate to produce a 0 (interior) to 1 (at a boundary)
signal. `selectGrassPlacements()` uses it to probabilistically thin boundary-adjacent
placements and attaches the value to each `GrassPlacement`. `packGrassInstanceBuffers()`
carries it through as a new per-instance `Float32Array`. `GrassField` uploads it as a
new `aEdgeBlend` instanced attribute (NOT a uniform or texture — per-instance attribute
data has none of the vertex-texture-fetch performance risk fixed earlier this session).
The fragment shader uses it to strengthen the existing dry-tint blend near boundaries.

**Tech Stack:** TypeScript, Three.js (`THREE.InstancedBufferAttribute`), Vitest (TDD for
all pure/data logic; the shader-visible color/density change itself is verified
manually in a browser, per this session's established pattern for GLSL work).

## Global Constraints

- `EDGE_BAND_WU = 2.5` (world units) — the neighbor-sample radius for
  `computeEdgeBlend()`. Copied verbatim from the design spec §2.
- Density-fade formula: `keepProbability = 1 - edgeBlend * 0.85` (never fully to 0 —
  see design spec §2, point 1, for why a thin residual chance is kept).
- Color-fade formula: `effectiveDryAmount = max(uDryAmount, aEdgeBlend)` in the
  fragment shader — reuses the EXISTING `uDryColor`/`uDryAmount` mixing code as-is;
  only the value fed into it changes.
- `GrassPlacement`/`packGrassInstanceBuffers()`/`GrassField`'s existing 3-argument
  test call sites (`new GrassField(wg, seed, preset)`, `createGrassMaterial(preset)`)
  MUST keep working unchanged — this is an additive change, not a breaking one.
- No changes to `classifyBiome()`, `_domainWarp()`, or where biome boundaries
  themselves are drawn — only how grass reacts to boundaries that already exist.

---

### Task 1: `computeEdgeBlend()` — pure edge-proximity function

**Files:**
- Modify: `src/world/GrassField.ts` (append the function, near `selectGrassPlacements`)
- Modify: `tests/world/GrassField.test.ts` (append tests)

**Interfaces:**
- Consumes: `WorldGrid` (existing type, already imported in `GrassField.ts`).
- Produces: `EDGE_BAND_WU` constant, `computeEdgeBlend(wg: WorldGrid, x: number, z:
  number, biome: GrassBiome, bandWidthWU: number): number`. Consumed by Task 2's
  `selectGrassPlacements()`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/world/GrassField.test.ts` (add `computeEdgeBlend` and `EDGE_BAND_WU` to
the existing top-of-file import — find:

```ts
import {
  selectGrassPlacements, packGrassInstanceBuffers,
  createGrassBladeGeometry, createGrassMaterial,
  GrassField, REBUILD_HYSTERESIS, GRASS_PRESETS,
} from '@/world/GrassField';
```

change to:

```ts
import {
  selectGrassPlacements, packGrassInstanceBuffers,
  createGrassBladeGeometry, createGrassMaterial,
  GrassField, REBUILD_HYSTERESIS, GRASS_PRESETS,
  computeEdgeBlend, EDGE_BAND_WU,
} from '@/world/GrassField';
```

then append at the end of the file:

```ts

describe('computeEdgeBlend', () => {
  function makeAllBiomeGrid(size: number, biome: BiomeId): WorldGrid {
    const g = new WorldGrid(size, size);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) g.set(col, row, { elevation: 1, biome });
    }
    return g;
  }

  it('returns 0 deep inside a uniform biome (all 8 neighbors match)', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    expect(computeEdgeBlend(wg, 0, 0, 'grassland', EDGE_BAND_WU)).toBe(0);
  });

  it('returns 1 when completely surrounded by a different biome', () => {
    const wg = makeAllBiomeGrid(40, 'savanna');
    // Query as if this candidate were 'grassland' — every one of the 8 sampled
    // neighbors is actually 'savanna', so all 8 count as "different".
    expect(computeEdgeBlend(wg, 0, 0, 'grassland', EDGE_BAND_WU)).toBe(1);
  });

  it('returns a partial fraction when only some neighbors differ', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    // Overwrite the whole right half of the grid to 'savanna' so exactly the
    // eastward-leaning samples (E, NE, SE) differ, out of the 8 total.
    for (let row = 0; row < 40; row++) {
      for (let col = 20; col < 40; col++) wg.set(col, row, { biome: 'savanna' });
    }
    const blend = computeEdgeBlend(wg, 0, 0, 'grassland', EDGE_BAND_WU);
    expect(blend).toBeGreaterThan(0);
    expect(blend).toBeLessThan(1);
  });

  it('skips out-of-bounds neighbors instead of counting them as different (map edge is not a false transition)', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    // (0,0) in world space is the grid's exact center (WorldGrid centers world (0,0)
    // at its middle column/row) — to reach an actual grid EDGE, query far to one side.
    const { wx, wz } = wg.gridToWorld(0, 20); // leftmost column, middle row
    const blend = computeEdgeBlend(wg, wx, wz, 'grassland', EDGE_BAND_WU);
    expect(blend).toBe(0); // every actual (in-bounds) neighbor is still 'grassland'
  });

  it('is deterministic (same inputs, same output)', () => {
    const wg = makeAllBiomeGrid(40, 'forest');
    const a = computeEdgeBlend(wg, 5, 5, 'forest', EDGE_BAND_WU);
    const b = computeEdgeBlend(wg, 5, 5, 'forest', EDGE_BAND_WU);
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: FAIL — `computeEdgeBlend`/`EDGE_BAND_WU` are not exported yet.

- [ ] **Step 3: Implement `computeEdgeBlend()`**

Add to `src/world/GrassField.ts`, immediately after the `selectGrassPlacements()`
function (before the "Instance-buffer packing" section):

```ts

/** World-unit radius `computeEdgeBlend()` samples at, to decide whether a grass
 *  placement candidate sits near a biome boundary. ~1 tile — a modest transition
 *  band, so only the outermost ring of a biome's footprint is affected. See design
 *  spec docs/superpowers/specs/2026-09-01-grass-biome-boundary-blending-design.md §2. */
export const EDGE_BAND_WU = 2.5;

const EDGE_SAMPLE_DIRECTIONS: ReadonlyArray<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
];

/**
 * Samples 8 neighbor points around (x, z) at `bandWidthWU` distance (N/S/E/W and the
 * 4 diagonals) and returns the fraction (0..1) that resolve to a DIFFERENT biome than
 * `biome` — 0 deep inside a uniform biome, up to 1 if completely surrounded by
 * something else (e.g. a thin sliver or a corner). Out-of-grid-bounds samples are
 * skipped entirely (not counted as "different"), so the map's outer edge never falsely
 * reads as a biome transition.
 */
export function computeEdgeBlend(
  wg: WorldGrid, x: number, z: number, biome: GrassBiome, bandWidthWU: number,
): number {
  const halfW = (wg.width - 1) / 2;
  const halfH = (wg.height - 1) / 2;
  let sampled = 0;
  let different = 0;
  for (const [dx, dz] of EDGE_SAMPLE_DIRECTIONS) {
    const sx = x + dx * bandWidthWU;
    const sz = z + dz * bandWidthWU;
    const col = Math.floor(sx / wg.tileUnit + halfW);
    const row = Math.floor(sz / wg.tileUnit + halfH);
    if (col < 0 || col >= wg.width || row < 0 || row >= wg.height) continue;
    sampled++;
    if (wg.get(col, row).biome !== biome) different++;
  }
  return sampled === 0 ? 0 : different / EDGE_SAMPLE_DIRECTIONS.length;
}
```

Note the division is by `EDGE_SAMPLE_DIRECTIONS.length` (always 8), NOT by `sampled` —
so a candidate near the grid's outer edge (where some of the 8 samples fall out of
bounds) can only ever show a LOWER blend than a fully-interior-but-actually-bordered
candidate would, never an inflated one from a smaller effective denominator. This
matches the "map edge is not a false transition" test above (all in-bounds neighbors
agree → blend is 0, not artificially raised by the missing out-of-bounds samples).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: PASS — all tests, including the 5 new `computeEdgeBlend` tests.

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144 (this project's steady baseline throughout this whole session).

- [ ] **Step 6: Commit**

```bash
git add src/world/GrassField.ts tests/world/GrassField.test.ts
git commit -m "feat: add pure computeEdgeBlend biome-boundary proximity function

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Wire density fade + `edgeBlend` into `selectGrassPlacements()`

**Files:**
- Modify: `src/world/GrassField.ts` (`GrassPlacement` interface, `selectGrassPlacements()`)
- Modify: `tests/world/GrassField.test.ts`

**Interfaces:**
- Consumes: `computeEdgeBlend`, `EDGE_BAND_WU` (Task 1).
- Produces: `GrassPlacement` gains an `edgeBlend: number` field. Consumed by Task 3's
  `packGrassInstanceBuffers()`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/world/GrassField.test.ts`, inside (or right after) the existing
`describe('selectGrassPlacements', ...)` block — find the end of that block (its
closing `});`) and add these two new tests just before it:

```ts

  it('attaches an edgeBlend field to every placement (0 for a fully-interior window)', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const placements = selectGrassPlacements(wg, 0, 0, 10, 1, 'grassland', 35);
    expect(placements.length).toBeGreaterThan(0);
    for (const p of placements) expect(p.edgeBlend).toBe(0);
  });

  it('thins placements near a biome boundary compared to an identical all-one-biome control', () => {
    const interiorGrid = makeAllBiomeGrid(60, 'grassland');
    const boundaryGrid = makeAllBiomeGrid(60, 'grassland');
    // Make the right half of the boundary grid a different biome. For a 60x60 grid,
    // halfW=(60-1)/2=29.5 and tileUnit=2, so col=30 begins at world x=1.0 — the query
    // window below (centered at x=-5, radius=10, covering x in [-15,5]) straddles that
    // exact seam, so its outer (rightmost) band of candidates sits within EDGE_BAND_WU
    // of the boundary.
    for (let row = 0; row < 60; row++) {
      for (let col = 30; col < 60; col++) boundaryGrid.set(col, row, { biome: 'savanna' });
    }
    const seed = 7;
    const interior = selectGrassPlacements(interiorGrid, -5, 0, 10, seed, 'grassland', 35);
    const boundary = selectGrassPlacements(boundaryGrid, -5, 0, 10, seed, 'grassland', 35);
    // Same window, same seed, same biome match rate going in — the only difference is
    // proximity to the boundary — so the boundary run must end up with fewer kept
    // placements (thinned by the density-fade probability check).
    expect(boundary.length).toBeLessThan(interior.length);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: FAIL — `p.edgeBlend` is `undefined` (not yet attached), so `toBe(0)` fails;
the thinning test likely fails too since nothing thins placements yet.

- [ ] **Step 3: Wire `computeEdgeBlend()` into `selectGrassPlacements()`**

In `src/world/GrassField.ts`, find:

```ts
export interface GrassPlacement {
  x: number; y: number; z: number;
  rotation: number; scaleX: number; scaleY: number; tilt: number; colorVar: number;
}
```

Change to:

```ts
export interface GrassPlacement {
  x: number; y: number; z: number;
  rotation: number; scaleX: number; scaleY: number; tilt: number; colorVar: number;
  /** 0 (deep in this biome's interior) to 1 (right at a boundary with another biome)
   *  — see computeEdgeBlend(). Drives both this function's own density-fade thinning
   *  below AND the shader's dry-tint color blend (GrassField class, further down). */
  edgeBlend: number;
}
```

Find:

```ts
      const cell = wg.get(col, row);
      if (cell.biome !== biome) continue;
      if (!isScatterAllowed(cell, 'grass')) continue;

      placements.push({
        x, y: cell.elevation * LEVEL_HEIGHT, z,
        rotation: rand() * Math.PI * 2,
        scaleX: 0.7 + rand() * 0.6,
        scaleY: 0.6 + rand() * 0.8,
        tilt: (rand() - 0.5) * 0.3,
        colorVar: rand(),
      });
    }
  }
  return placements;
}
```

Change to:

```ts
      const cell = wg.get(col, row);
      if (cell.biome !== biome) continue;
      if (!isScatterAllowed(cell, 'grass')) continue;

      const edgeBlend = computeEdgeBlend(wg, x, z, biome, EDGE_BAND_WU);
      // Density fade: thin placements near a boundary instead of a hard second cutoff
      // line — never fully to 0 (a thin residual chance keeps a few sparse blades
      // right at the seam) — see design spec §2, point 1.
      if (edgeBlend > 0 && rand() > 1 - edgeBlend * 0.85) continue;

      placements.push({
        x, y: cell.elevation * LEVEL_HEIGHT, z,
        rotation: rand() * Math.PI * 2,
        scaleX: 0.7 + rand() * 0.6,
        scaleY: 0.6 + rand() * 0.8,
        tilt: (rand() - 0.5) * 0.3,
        colorVar: rand(),
        edgeBlend,
      });
    }
  }
  return placements;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: PASS — all tests, including the 2 new ones.

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144.

- [ ] **Step 6: Commit**

```bash
git add src/world/GrassField.ts tests/world/GrassField.test.ts
git commit -m "feat: thin grass density near biome boundaries via edgeBlend

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Carry `edgeBlend` through `packGrassInstanceBuffers()`

**Files:**
- Modify: `src/world/GrassField.ts` (`GrassInstanceBuffers`, `packGrassInstanceBuffers()`)
- Modify: `tests/world/GrassField.test.ts`

**Interfaces:**
- Consumes: `GrassPlacement.edgeBlend` (Task 2).
- Produces: `GrassInstanceBuffers` gains an `edgeBlend: Float32Array` field. Consumed
  by Task 4's `GrassField` class.

- [ ] **Step 1: Write the failing test**

In `tests/world/GrassField.test.ts`, find the top-of-file import (already extended by
Task 1):

```ts
import {
  selectGrassPlacements, packGrassInstanceBuffers,
  createGrassBladeGeometry, createGrassMaterial,
  GrassField, REBUILD_HYSTERESIS, GRASS_PRESETS,
  computeEdgeBlend, EDGE_BAND_WU,
} from '@/world/GrassField';
```

Change to:

```ts
import {
  selectGrassPlacements, packGrassInstanceBuffers,
  createGrassBladeGeometry, createGrassMaterial,
  GrassField, REBUILD_HYSTERESIS, GRASS_PRESETS,
  computeEdgeBlend, EDGE_BAND_WU, type GrassPlacement,
} from '@/world/GrassField';
```

Then find the existing `describe('packGrassInstanceBuffers', ...)` block and add this
test just before its closing `});`:

```ts

  it('carries each placement\'s edgeBlend value through into a same-length Float32Array', () => {
    const placements: GrassPlacement[] = [
      { x: 0, y: 0, z: 0, rotation: 0, scaleX: 1, scaleY: 1, tilt: 0, colorVar: 0, edgeBlend: 0 },
      { x: 1, y: 0, z: 1, rotation: 0, scaleX: 1, scaleY: 1, tilt: 0, colorVar: 0, edgeBlend: 0.75 },
    ];
    const { edgeBlend } = packGrassInstanceBuffers(placements);
    expect(edgeBlend.length).toBe(2);
    expect(edgeBlend[0]).toBe(0);
    expect(edgeBlend[1]).toBeCloseTo(0.75, 5);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: FAIL — `packGrassInstanceBuffers(...)`'s return value has no `edgeBlend` key.

- [ ] **Step 3: Extend `GrassInstanceBuffers`/`packGrassInstanceBuffers()`**

Find:

```ts
export interface GrassInstanceBuffers {
  positionRotation: Float32Array;
  scaleAndVariation: Float32Array;
}

/** Pack placements into the Float32Arrays the shader's instanced attributes expect. */
export function packGrassInstanceBuffers(placements: GrassPlacement[]): GrassInstanceBuffers {
  const count = placements.length;
  const positionRotation = new Float32Array(count * 4);
  const scaleAndVariation = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const p = placements[i]!;
    positionRotation[i * 4]     = p.x;
    positionRotation[i * 4 + 1] = p.y;
    positionRotation[i * 4 + 2] = p.z;
    positionRotation[i * 4 + 3] = p.rotation;
    scaleAndVariation[i * 4]     = p.scaleX;
    scaleAndVariation[i * 4 + 1] = p.scaleY;
    scaleAndVariation[i * 4 + 2] = p.tilt;
    scaleAndVariation[i * 4 + 3] = p.colorVar;
  }
```

Change to:

```ts
export interface GrassInstanceBuffers {
  positionRotation: Float32Array;
  scaleAndVariation: Float32Array;
  /** 1 component per blade — see GrassPlacement.edgeBlend's doc comment. Its own typed
   *  array (not packed into an unused positionRotation/scaleAndVariation channel — all
   *  8 of those are already spoken for) since it's a new, independent per-instance value. */
  edgeBlend: Float32Array;
}

/** Pack placements into the Float32Arrays the shader's instanced attributes expect. */
export function packGrassInstanceBuffers(placements: GrassPlacement[]): GrassInstanceBuffers {
  const count = placements.length;
  const positionRotation = new Float32Array(count * 4);
  const scaleAndVariation = new Float32Array(count * 4);
  const edgeBlend = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = placements[i]!;
    positionRotation[i * 4]     = p.x;
    positionRotation[i * 4 + 1] = p.y;
    positionRotation[i * 4 + 2] = p.z;
    positionRotation[i * 4 + 3] = p.rotation;
    scaleAndVariation[i * 4]     = p.scaleX;
    scaleAndVariation[i * 4 + 1] = p.scaleY;
    scaleAndVariation[i * 4 + 2] = p.tilt;
    scaleAndVariation[i * 4 + 3] = p.colorVar;
    edgeBlend[i] = p.edgeBlend;
  }
```

Find the end of the same function:

```ts
  return { positionRotation, scaleAndVariation };
}
```

Change to:

```ts
  return { positionRotation, scaleAndVariation, edgeBlend };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: PASS — all tests, including the new one. (The existing
`packGrassInstanceBuffers` tests that don't check `edgeBlend` still pass unchanged —
this is a purely additive return-value change.)

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144.

- [ ] **Step 6: Commit**

```bash
git add src/world/GrassField.ts tests/world/GrassField.test.ts
git commit -m "feat: carry edgeBlend through packGrassInstanceBuffers

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Wire `aEdgeBlend` into the `GrassField` class + shader + ship

**Files:**
- Modify: `src/world/GrassField.ts` (`createGrassMaterial()`'s shader, `GrassField` class)
- Modify: `docs/visual-progress.md`

**Interfaces:**
- Consumes: `GrassInstanceBuffers.edgeBlend` (Task 3).
- Produces: nothing new for later tasks — this is the final integration + ship task.

This task's shader-visible color/density change cannot be asserted by an automated
test (no real GPU in this project's test environment — same limitation documented for
every other GLSL change this session). Verification is: (1) the existing
`GrassField.test.ts`/`OverworldScene` regression suites must stay green (confirming no
functional regression to anything already tested), and (2) a manual browser
screenshot at a real grassland/savanna (or other grass-biome-pair) boundary, per this
step's own instructions below.

- [ ] **Step 1: Add the `aEdgeBlend` instanced attribute to the vertex shader**

In `src/world/GrassField.ts`, find:

```ts
    vertexShader: /* glsl */ `
      attribute vec4 aPositionRotation; // xyz = world pos, w = Y rotation
      attribute vec4 aScaleVariation;   // x = scaleX, y = scaleY, z = tilt, w = colorVar
```

Change to:

```ts
    vertexShader: /* glsl */ `
      attribute vec4  aPositionRotation; // xyz = world pos, w = Y rotation
      attribute vec4  aScaleVariation;   // x = scaleX, y = scaleY, z = tilt, w = colorVar
      attribute float aEdgeBlend;        // 0 = interior, 1 = at a biome boundary — see
                                          // GrassPlacement.edgeBlend's doc comment.
```

Find:

```ts
      varying vec2  vUv;
      varying vec3  vNormal;
      varying vec3  vWorldPos;
      varying float vColorVar;
      varying float vFade;
```

Change to:

```ts
      varying vec2  vUv;
      varying vec3  vNormal;
      varying vec3  vWorldPos;
      varying float vColorVar;
      varying float vFade;
      varying float vEdgeBlend;
```

Find (in `main()`):

```ts
      void main() {
        vUv = uv;
        vColorVar = aScaleVariation.w;
```

Change to:

```ts
      void main() {
        vUv = uv;
        vColorVar = aScaleVariation.w;
        vEdgeBlend = aEdgeBlend;
```

- [ ] **Step 2: Use `vEdgeBlend` in the fragment shader's existing dry-tint mix**

Find, in the fragment shader (`createGrassMaterial()`'s `fragmentShader` template —
NOT the vertex shader edited in Step 1 above):

```ts
      uniform vec3  uBaseColor;
      uniform vec3  uTipColor;
      uniform vec3  uDryColor;
      uniform float uDryAmount;
      uniform float uSssStrength;
      uniform float uAoStrength;
      uniform vec3  uSunDir;
      uniform vec3  uSunColor;
      uniform vec3  uAmbientColor;

      varying vec2  vUv;
      varying vec3  vNormal;
      varying vec3  vWorldPos;
      varying float vColorVar;
      varying float vFade;

      void main() {
        if (vFade < 0.01) discard;

        float heightT = vUv.y;
        vec3 color = mix(uBaseColor, uTipColor, heightT);
        color = mix(color, uDryColor, vColorVar * uDryAmount);
```

Change to:

```ts
      uniform vec3  uBaseColor;
      uniform vec3  uTipColor;
      uniform vec3  uDryColor;
      uniform float uDryAmount;
      uniform float uSssStrength;
      uniform float uAoStrength;
      uniform vec3  uSunDir;
      uniform vec3  uSunColor;
      uniform vec3  uAmbientColor;

      varying vec2  vUv;
      varying vec3  vNormal;
      varying vec3  vWorldPos;
      varying float vColorVar;
      varying float vFade;
      varying float vEdgeBlend;

      void main() {
        if (vFade < 0.01) discard;

        float heightT = vUv.y;
        vec3 color = mix(uBaseColor, uTipColor, heightT);
        // Blades near a biome boundary (vEdgeBlend -> 1) are pulled toward the shared
        // uDryColor regardless of their own random vColorVar roll — max(), not a plain
        // multiply, so the boundary pull is reliable rather than only affecting blades
        // that also happened to roll a high vColorVar. See design spec
        // docs/superpowers/specs/2026-09-01-grass-biome-boundary-blending-design.md §2.
        color = mix(color, uDryColor, max(vColorVar * uDryAmount, vEdgeBlend));
```

- [ ] **Step 3: Register the new instanced attribute in the `GrassField` class**

Find:

```ts
  private readonly _positionRotation: THREE.InstancedBufferAttribute;
  private readonly _scaleAndVariation: THREE.InstancedBufferAttribute;
```

Change to:

```ts
  private readonly _positionRotation: THREE.InstancedBufferAttribute;
  private readonly _scaleAndVariation: THREE.InstancedBufferAttribute;
  private readonly _edgeBlend: THREE.InstancedBufferAttribute;
```

Find:

```ts
    this._scaleAndVariation = new THREE.InstancedBufferAttribute(
      new Float32Array(preset.maxBlades * 4), 4,
    );
    this._scaleAndVariation.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aPositionRotation', this._positionRotation);
    geometry.setAttribute('aScaleVariation', this._scaleAndVariation);
```

Change to:

```ts
    this._scaleAndVariation = new THREE.InstancedBufferAttribute(
      new Float32Array(preset.maxBlades * 4), 4,
    );
    this._scaleAndVariation.setUsage(THREE.DynamicDrawUsage);
    this._edgeBlend = new THREE.InstancedBufferAttribute(
      new Float32Array(preset.maxBlades), 1,
    );
    this._edgeBlend.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aPositionRotation', this._positionRotation);
    geometry.setAttribute('aScaleVariation', this._scaleAndVariation);
    geometry.setAttribute('aEdgeBlend', this._edgeBlend);
```

- [ ] **Step 4: Upload the new array on every rebuild**

Find:

```ts
    const { positionRotation, scaleAndVariation } =
      packGrassInstanceBuffers(placements.slice(0, count));

    this._positionRotation.array.set(positionRotation);
    this._scaleAndVariation.array.set(scaleAndVariation);
    this._positionRotation.needsUpdate = true;
    this._scaleAndVariation.needsUpdate = true;
    this.mesh.count = count;
```

Change to:

```ts
    const { positionRotation, scaleAndVariation, edgeBlend } =
      packGrassInstanceBuffers(placements.slice(0, count));

    this._positionRotation.array.set(positionRotation);
    this._scaleAndVariation.array.set(scaleAndVariation);
    this._edgeBlend.array.set(edgeBlend);
    this._positionRotation.needsUpdate = true;
    this._scaleAndVariation.needsUpdate = true;
    this._edgeBlend.needsUpdate = true;
    this.mesh.count = count;
```

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144.

- [ ] **Step 6: Run the GrassField and OverworldScene regression suites**

Run: `npx vitest run tests/world/GrassField.test.ts tests/scene/OverworldScene.chunk-scatter-alignment.test.ts tests/scene/OverworldScene.settlement-parity.test.ts tests/scene/OverworldScene.drawcall-batching.test.ts tests/scene/OverworldScene.chunk-terrain-alignment.test.ts tests/scene/OverworldScene.chunk-collider-streaming.test.ts`
Expected: PASS — all of them.

- [ ] **Step 7: Commit**

```bash
git add src/world/GrassField.ts
git commit -m "feat: blend grass color toward the shared dry tint near biome boundaries

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 8: Manual browser verification**

Kill any stray dev-server process squatting on port 5174 first (`ps aux | grep -i vite
| grep -v grep`; only kill one pointing at THIS worktree's path). Then:

```bash
npm run dev -- --host 127.0.0.1 --port 5174
```

Using a short throwaway Playwright script (raw CDP `Page.captureScreenshot`, per this
session's established environment workaround) or a headed browser:
1. Start the game, enter the overworld, use `window.__game.debugCellAt(x, z)` to find a
   real grassland/savanna (or grassland/forest, etc.) boundary — sample a line of
   points near a known grassland tile (from `findFirstBiomeTile('grassland')`) the same
   way this session's earlier investigation did, looking for a neighboring grass-biome
   tile within ~50 WU.
2. Teleport the player near that boundary, `forceTick` a few times, screenshot.
3. Confirm: grass density visibly tapers (not a sudden wall) approaching the boundary,
   and blade color near the seam looks less starkly different between the two sides
   than deep in each biome's own interior (both sides pull toward the same warm
   `dryColor` near the edge). Confirm zero console/page errors.
4. Also do a quick sanity screenshot of a biome's DEEP interior (far from any boundary)
   to confirm its own base color still looks correct/unmuted there — this feature must
   only visibly affect the outer ring, not wash out every blade with dry tint uniformly.

Stop the manually-started dev server when done (`ps aux | grep -i "vite --host"`, `kill
<pid>` for the one matching THIS worktree's path). Delete any throwaway verification
scripts and screenshots afterward.

- [ ] **Step 9: Run the full unit/integration test suite**

Run: `npx vitest run`
Expected: the same pre-existing baseline failures established throughout this session
(`main.startup.smoke.test.ts`×3, `enemyLoader.test.ts`×3, `towerGenerator.test.ts`×2,
`talentSystem.test.ts`×3, `WaterMaterial.test.ts`×1 — 12 total), plus every new test
from Tasks 1-3 passing, and zero NEW failures. If `ResourceNodePlacer.test.ts` or
`OverworldScene.chunk-scatter-alignment.test.ts` fail, re-run each in isolation first
(documented sandbox-contention flakes in this shared environment) before treating
either as a real regression.

- [ ] **Step 10: Final `tsc` check**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144.

- [ ] **Step 11: Update the visual-progress log**

Open `docs/visual-progress.md`. Add a new section after the "Trampled-Grass Trail"
section:

```markdown

## Grass Biome-Boundary Blending

Grass now thins out gradually and shifts toward a shared warm dry-tint near biome
boundaries (e.g. grassland meeting savanna) instead of stopping in a hard wall with a
stark color jump — see
`docs/superpowers/specs/2026-09-01-grass-biome-boundary-blending-design.md`.
```

- [ ] **Step 12: Commit and push**

```bash
git add docs/visual-progress.md
git commit -m "docs: note grass biome-boundary blending in visual-progress log

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
git push origin HEAD:main
```
