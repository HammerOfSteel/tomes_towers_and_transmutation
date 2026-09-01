# Grass Boundary-Blend v2 + Savanna Distinctiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix v1's two remaining gaps (see design spec
`docs/superpowers/specs/2026-09-01-grass-boundary-blend-v2-design.md`): the boundary
blend band is too narrow to read as gradual, and it blends toward a generic shared tan
instead of the actual neighboring biome's own color. Also make savanna read as its own
distinct, sparse/dry biome rather than looking like grassland.

**Architecture:** `computeEdgeBlend()` changes from an 8-sample single-distance
snapshot to an 8-direction ray march up to a wider `EDGE_BAND_WU`, returning both a
smooth 0..1 `blend` and the specific `neighborBiome` found. `selectGrassPlacements()`
uses `neighborBiome` to look up that preset's averaged color and packs it per-instance.
`packGrassInstanceBuffers()` carries the new color through. `GrassField`/the shader gain
a new `aNeighborColor` instanced attribute (3 floats — NOT a texture, no VTF risk) and
the fragment shader splits interior dry-tint variance from edge-boundary color pull
into two independent `mix()` calls. Savanna's `densityPerUnit2`/`height` are reduced.

**Tech Stack:** TypeScript, Three.js (`THREE.InstancedBufferAttribute`), Vitest (TDD for
all pure/data logic; shader-visible changes verified manually in a browser, per this
session's established pattern for GLSL work — jsdom/vitest cannot render real GLSL).

## Global Constraints

- `EDGE_BAND_WU`: 2.5 → 8 (world units) — the ray-march max reach. `EDGE_RAY_STEP_WU
  = 1` (new constant) — the marching step size.
- `computeEdgeBlend()`'s return type changes from `number` to `{ blend: number;
  neighborBiome: GrassBiome | null }` — a breaking signature change to this function;
  every existing call site (`selectGrassPlacements()`, all unit tests) must be updated
  in the same task that changes it (Task 1), not left broken between tasks.
- Density-fade formula unchanged: `keepProbability = 1 - blend * 0.85` (still never
  fully to 0), just now reading `.blend` instead of a bare number.
- New neighbor-color-blend formula (fragment shader): `color = mix(color, uDryColor,
  vColorVar * uDryAmount); color = mix(color, vNeighborColor, vEdgeBlend);` — replaces
  the old single combined `mix(color, uDryColor, max(vColorVar * uDryAmount,
  vEdgeBlend))` line entirely.
- Savanna preset: `densityPerUnit2: 15 → 9`, `height: 0.4 → 0.28`. No other preset or
  savanna field changes.
- `GrassPlacement`/`packGrassInstanceBuffers()`/`GrassField`'s existing test call
  sites for unrelated fields (position, rotation, scale, tilt, colorVar) MUST keep
  working unchanged.
- No changes to `classifyBiome()`, `_domainWarp()`, or where biome boundaries
  themselves are drawn.

---

### Task 1: `computeEdgeBlend()` v2 — ray-marched distance + neighbor biome

**Files:**
- Modify: `src/world/GrassField.ts` (rewrite the function + `EDGE_BAND_WU`, add
  `EDGE_RAY_STEP_WU`)
- Modify: `tests/world/GrassField.test.ts` (rewrite the `computeEdgeBlend` describe
  block)

**Interfaces:**
- Produces: `EDGE_BAND_WU = 8`, `EDGE_RAY_STEP_WU = 1`, `computeEdgeBlend(wg: WorldGrid,
  x: number, z: number, biome: GrassBiome, bandWidthWU: number): { blend: number;
  neighborBiome: GrassBiome | null }`. Consumed by Task 2.

- [x] **Step 1: Write the failing tests**

Replace the existing `describe('computeEdgeBlend', ...)` block (the one using
`makeAllBiomeGrid`) with:

```ts
describe('computeEdgeBlend', () => {
  function makeAllBiomeGrid(size: number, biome: BiomeId): WorldGrid {
    const g = new WorldGrid(size, size);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) g.set(col, row, { elevation: 1, biome });
    }
    return g;
  }

  it('returns blend 0 and neighborBiome null deep inside a uniform biome', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const result = computeEdgeBlend(wg, 0, 0, 'grassland', EDGE_BAND_WU);
    expect(result.blend).toBe(0);
    expect(result.neighborBiome).toBeNull();
  });

  it('returns blend 1 and the correct neighborBiome when completely surrounded by a different biome', () => {
    const wg = makeAllBiomeGrid(40, 'savanna');
    const result = computeEdgeBlend(wg, 0, 0, 'grassland', EDGE_BAND_WU);
    expect(result.blend).toBe(1);
    expect(result.neighborBiome).toBe('savanna');
  });

  it('returns a partial fraction when the boundary is partway into the search band', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    // Right half 'savanna' — boundary sits 1 WU east of the query point (see the
    // original v1 test's window-math comment for the col/world-x derivation).
    for (let row = 0; row < 40; row++) {
      for (let col = 20; col < 40; col++) wg.set(col, row, { biome: 'savanna' });
    }
    const result = computeEdgeBlend(wg, 0, 0, 'grassland', EDGE_BAND_WU);
    expect(result.blend).toBeGreaterThan(0);
    expect(result.blend).toBeLessThan(1);
    expect(result.neighborBiome).toBe('savanna');
  });

  it('reaches further than the old 2.5 WU band — finds a boundary 5 WU away', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    // For a 40x40 grid, halfW=(40-1)/2=19.5 and tileUnit=2, so col=22 begins at world
    // x=(22-19.5)*2=5.0 — querying from (0,0) puts the boundary exactly 5 WU east,
    // still within the new EDGE_BAND_WU=8 reach but outside v1's old EDGE_BAND_WU=2.5,
    // proving the widened band actually matters.
    for (let row = 0; row < 40; row++) {
      for (let col = 22; col < 40; col++) wg.set(col, row, { biome: 'forest' });
    }
    const result = computeEdgeBlend(wg, 0, 0, 'grassland', EDGE_BAND_WU);
    expect(result.blend).toBeGreaterThan(0);
    expect(result.neighborBiome).toBe('forest');
  });

  it('skips out-of-bounds neighbors instead of counting them as a boundary (map edge is not a false transition)', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const { wx, wz } = wg.gridToWorld(0, 20); // leftmost column, middle row
    const result = computeEdgeBlend(wg, wx, wz, 'grassland', EDGE_BAND_WU);
    expect(result.blend).toBe(0);
    expect(result.neighborBiome).toBeNull();
  });

  it('is deterministic (same inputs, same output)', () => {
    const wg = makeAllBiomeGrid(40, 'forest');
    const a = computeEdgeBlend(wg, 5, 5, 'forest', EDGE_BAND_WU);
    const b = computeEdgeBlend(wg, 5, 5, 'forest', EDGE_BAND_WU);
    expect(a).toEqual(b);
  });
});
```

Run `npx vitest run tests/world/GrassField.test.ts` — confirm these new/changed
assertions fail (old implementation still returns a bare number, so `.blend`/
`.neighborBiome` access will fail or be `undefined`).

- [x] **Step 2: Implement**

In `src/world/GrassField.ts`, replace the `EDGE_BAND_WU` constant and the
`computeEdgeBlend` function with:

```ts
/** World-unit max reach `computeEdgeBlend()` ray-marches when searching for a nearby
 *  biome boundary. ~4 tiles — wide enough that the resulting blend is visible as a
 *  gradient over a few real steps of player movement, not a snap, while still leaving
 *  most of a biome's interior fully saturated. Widened from an earlier 2.5 WU
 *  single-fixed-distance version that was too narrow to read as gradual — see design
 *  spec docs/superpowers/specs/2026-09-01-grass-boundary-blend-v2-design.md §2a. */
export const EDGE_BAND_WU = 8;

/** Ray-march step size (1 grid tile) — bounds `computeEdgeBlend()`'s per-candidate
 *  cost to at most 8 directions × (EDGE_BAND_WU / EDGE_RAY_STEP_WU) `wg.get()` calls. */
export const EDGE_RAY_STEP_WU = 1;

const EDGE_SAMPLE_DIRECTIONS: ReadonlyArray<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
];

/**
 * Ray-marches 8 directions (N/S/E/W and the 4 diagonals) out to `bandWidthWU`,
 * looking for the nearest point that resolves to a DIFFERENT biome than `biome`.
 * Returns a smooth 0 (no boundary within range) to 1 (right at/inside a boundary)
 * `blend` signal plus the specific `neighborBiome` found (or `null` if none/interior).
 * Out-of-grid-bounds samples stop that direction's march without counting as a
 * boundary, so the map's outer edge never falsely reads as a biome transition.
 */
export function computeEdgeBlend(
  wg: WorldGrid, x: number, z: number, biome: GrassBiome, bandWidthWU: number,
): { blend: number; neighborBiome: GrassBiome | null } {
  const halfW = (wg.width - 1) / 2;
  const halfH = (wg.height - 1) / 2;

  const biomeAt = (sx: number, sz: number): BiomeId | null => {
    const col = Math.floor(sx / wg.tileUnit + halfW);
    const row = Math.floor(sz / wg.tileUnit + halfH);
    if (col < 0 || col >= wg.width || row < 0 || row >= wg.height) return null;
    return wg.get(col, row).biome;
  };

  // Distance-0 case: the candidate's own cell already differs — trivially at the
  // boundary, e.g. jitter placed it just over a cell line.
  const own = biomeAt(x, z);
  if (own !== null && own !== biome) return { blend: 1, neighborBiome: own as GrassBiome };

  let nearestDist = Infinity;
  let nearestBiome: GrassBiome | null = null;
  for (const [dx, dz] of EDGE_SAMPLE_DIRECTIONS) {
    for (let t = EDGE_RAY_STEP_WU; t <= bandWidthWU; t += EDGE_RAY_STEP_WU) {
      const b = biomeAt(x + dx * t, z + dz * t);
      if (b === null) break; // ran off the grid this direction — stop, don't count
      if (b !== biome) {
        if (t < nearestDist) { nearestDist = t; nearestBiome = b as GrassBiome; }
        break;
      }
    }
  }
  if (nearestDist === Infinity) return { blend: 0, neighborBiome: null };
  return { blend: Math.max(0, 1 - nearestDist / bandWidthWU), neighborBiome: nearestBiome };
}
```

- [x] **Step 3: Run tests, confirm they pass**

`npx vitest run tests/world/GrassField.test.ts` — expect the `computeEdgeBlend` block
green. Other blocks (`selectGrassPlacements`, etc.) will now fail to COMPILE (tsc error:
`.blend`/`.neighborBiome` don't exist on `number`) since `selectGrassPlacements` still
calls the old signature — this is expected and fixed in Task 2. Do not attempt to make
the whole file pass yet; just confirm THIS describe block's tests pass in isolation
(comment out or `.skip` any lines that fail to compile only if the runner refuses to
execute anything at all due to a file-level TS error — otherwise proceed straight to
Task 2, which fixes the call site immediately after).

---

### Task 2: `selectGrassPlacements()` + `GrassPlacement.neighborColor`

**Files:**
- Modify: `src/world/GrassField.ts`
- Modify: `tests/world/GrassField.test.ts`

**Interfaces:**
- Consumes: Task 1's `computeEdgeBlend()`.
- Produces: `GrassPlacement.neighborColor: { r: number; g: number; b: number }` (0..1
  floats). Consumed by Task 3.

- [x] **Step 1: Write the failing tests**

Add to the existing `describe('selectGrassPlacements', ...)` block:

```ts
it('defaults neighborColor to the blade\'s own averaged color for a fully-interior placement', () => {
  const wg = makeAllBiomeGrid(40, 'grassland');
  const placements = selectGrassPlacements(wg, 0, 0, 10, 1, 'grassland', 35);
  expect(placements.length).toBeGreaterThan(0);
  const preset = GRASS_PRESETS.grassland;
  const ownAvg = averageColor(preset.baseColor, preset.tipColor);
  for (const p of placements) {
    expect(p.neighborColor.r).toBeCloseTo(ownAvg.r, 5);
    expect(p.neighborColor.g).toBeCloseTo(ownAvg.g, 5);
    expect(p.neighborColor.b).toBeCloseTo(ownAvg.b, 5);
  }
});

it('blends boundary placements toward the actual neighboring biome\'s averaged color, not a generic tan', () => {
  const wg = makeAllBiomeGrid(60, 'grassland');
  for (let row = 0; row < 60; row++) {
    for (let col = 30; col < 60; col++) wg.set(col, row, { biome: 'forest' });
  }
  const placements = selectGrassPlacements(wg, -5, 0, 10, 7, 'grassland', 35);
  const forestAvg = averageColor(GRASS_PRESETS.forest.baseColor, GRASS_PRESETS.forest.tipColor);
  const nearBoundary = placements.filter(p => p.edgeBlend > 0.5);
  expect(nearBoundary.length).toBeGreaterThan(0);
  for (const p of nearBoundary) {
    expect(p.neighborColor.r).toBeCloseTo(forestAvg.r, 2);
    expect(p.neighborColor.g).toBeCloseTo(forestAvg.g, 2);
    expect(p.neighborColor.b).toBeCloseTo(forestAvg.b, 2);
  }
});
```

Add a small local test helper near the top of the `computeEdgeBlend`/
`selectGrassPlacements` describe blocks (or as a top-level test-file helper):

```ts
function averageColor(hexA: number, hexB: number): { r: number; g: number; b: number } {
  const a = new THREE.Color(hexA);
  const b = new THREE.Color(hexB);
  return { r: (a.r + b.r) / 2, g: (a.g + b.g) / 2, b: (a.b + b.b) / 2 };
}
```

(`THREE` is already imported in this test file — confirm before adding a duplicate
import.)

Run `npx vitest run tests/world/GrassField.test.ts` — confirm these new tests fail
(field doesn't exist yet).

- [x] **Step 2: Implement**

In `src/world/GrassField.ts`:

1. Add an `averageColor()` helper near the top of the placement section (module-level,
   not exported unless a test needs it directly — the test above can inline its own
   copy instead if keeping this private is preferred; keep it exported as
   `averageColor` for reuse by the test to avoid duplicated logic):

```ts
/** Cheap single-tone stand-in for a preset's full base→tip gradient, used only for the
 *  boundary neighbor-color blend (see GrassPlacement.neighborColor) — a full per-vertex
 *  neighbor base/tip gradient was rejected as unnecessary complexity for a thin edge
 *  band; see design spec §2b. */
export function averageColor(hexA: number, hexB: number): { r: number; g: number; b: number } {
  const a = new THREE.Color(hexA);
  const b = new THREE.Color(hexB);
  return { r: (a.r + b.r) / 2, g: (a.g + b.g) / 2, b: (a.b + b.b) / 2 };
}
```

2. Update `GrassPlacement`'s doc comment/field: add `neighborColor: { r: number; g:
   number; b: number };` (replacing nothing — `edgeBlend` stays).

3. In `selectGrassPlacements()`, replace:

```ts
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
```

with:

```ts
      const { blend: edgeBlend, neighborBiome } = computeEdgeBlend(wg, x, z, biome, EDGE_BAND_WU);
      // Density fade: thin placements near a boundary instead of a hard second cutoff
      // line — never fully to 0 (a thin residual chance keeps a few sparse blades
      // right at the seam) — see design spec §2, point 1.
      if (edgeBlend > 0 && rand() > 1 - edgeBlend * 0.85) continue;

      const preset = GRASS_PRESETS[biome];
      const neighborPreset = neighborBiome && neighborBiome in GRASS_PRESETS
        ? GRASS_PRESETS[neighborBiome as GrassBiome]
        : null;
      const neighborColor = neighborPreset
        ? averageColor(neighborPreset.baseColor, neighborPreset.tipColor)
        : averageColor(preset.baseColor, preset.tipColor);

      placements.push({
        x, y: cell.elevation * LEVEL_HEIGHT, z,
        rotation: rand() * Math.PI * 2,
        scaleX: 0.7 + rand() * 0.6,
        scaleY: 0.6 + rand() * 0.8,
        tilt: (rand() - 0.5) * 0.3,
        colorVar: rand(),
        edgeBlend,
        neighborColor,
      });
```

Note: `neighborBiome` from `computeEdgeBlend()` is typed as `GrassBiome | null`
already (see Task 1's implementation — it's cast from `BiomeId`), so the `in
GRASS_PRESETS` guard above is a defensive no-op given the current type; keep it anyway
since `WorldGrid` cells can technically hold any `BiomeId` and `computeEdgeBlend`'s
cast is a type-level assumption, not a runtime guarantee — this guard is what makes
the "neighbor is a non-grass biome" non-goal (design spec §2b) actually safe at
runtime instead of just documented.

- [x] **Step 3: Run tests, confirm they pass**

`npx vitest run tests/world/GrassField.test.ts`. Also run `npx tsc --noEmit` — expect
new errors ONLY in `packGrassInstanceBuffers()`'s existing test literals (which
construct `GrassPlacement` objects without a `neighborColor` field, now required) —
fix those literals by adding `neighborColor: { r: 0, g: 0, b: 0 }` to each (mirrors how
the v1 plan handled the same situation for `edgeBlend`). Confirm `tsc` is clean after.

---

### Task 3: `packGrassInstanceBuffers()` — carry `neighborColor` through

**Files:**
- Modify: `src/world/GrassField.ts`
- Modify: `tests/world/GrassField.test.ts`

**Interfaces:**
- Produces: `GrassInstanceBuffers.neighborColor: Float32Array` (3 components/instance).
  Consumed by Task 4.

- [x] **Step 1: Write the failing test**

Add to `describe('packGrassInstanceBuffers', ...)`:

```ts
it('packs neighborColor into a Float32Array of length N*3, r/g/b in order', () => {
  const placements = [
    { x: 0, y: 0, z: 0, rotation: 0, scaleX: 1, scaleY: 1, tilt: 0, colorVar: 0, edgeBlend: 0.5,
      neighborColor: { r: 0.1, g: 0.2, b: 0.3 } },
    { x: 0, y: 0, z: 0, rotation: 0, scaleX: 1, scaleY: 1, tilt: 0, colorVar: 0, edgeBlend: 0,
      neighborColor: { r: 0.4, g: 0.5, b: 0.6 } },
  ];
  const { neighborColor } = packGrassInstanceBuffers(placements);
  expect(neighborColor.length).toBe(6);
  const expected = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  for (let i = 0; i < expected.length; i++) expect(neighborColor[i]).toBeCloseTo(expected[i]!, 5);
});
```

(Note: Float32Array storage introduces float32 rounding, so compare element-by-element
with `toBeCloseTo` rather than a single `toEqual` against the raw double-precision
literal array.)

Run `npx vitest run tests/world/GrassField.test.ts` — confirm it fails (field doesn't
exist on the returned object yet).

- [x] **Step 2: Implement**

In `GrassInstanceBuffers`, add `neighborColor: Float32Array;` (with a doc comment
matching the existing `edgeBlend` field's style). In `packGrassInstanceBuffers()`, add:

```ts
  const neighborColor = new Float32Array(count * 3);
```

and inside the existing per-placement loop, add:

```ts
    neighborColor[i * 3]     = p.neighborColor.r;
    neighborColor[i * 3 + 1] = p.neighborColor.g;
    neighborColor[i * 3 + 2] = p.neighborColor.b;
```

and include `neighborColor` in the function's returned object.

- [x] **Step 3: Run tests, confirm they pass**

`npx vitest run tests/world/GrassField.test.ts` and `npx tsc --noEmit` both clean.

---

### Task 4: Shader/`GrassField` wiring + savanna preset + ship

**Files:**
- Modify: `src/world/GrassField.ts`
- Modify: `tests/world/GrassField.test.ts`
- Modify: `docs/visual-progress.md`

**Interfaces:**
- Consumes: Task 3's `neighborColor` buffer.
- No new exports — this task wires existing pieces into the live shader/mesh and ships.

- [x] **Step 1: Savanna preset test (write failing first)**

Add near the existing `it('grassland maxBlades remains 100_000 ...')` test:

```ts
it('savanna is sparser and shorter than before (distinct dry-biome look)', () => {
  expect(GRASS_PRESETS.savanna.densityPerUnit2).toBe(9);
  expect(GRASS_PRESETS.savanna.height).toBe(0.28);
});
```

Run, confirm it fails.

- [x] **Step 2: Update the savanna preset**

In `GRASS_PRESETS.savanna`, change `densityPerUnit2: 15` → `9` and `height: 0.4` →
`0.28`. Leave every other field (colors, width, curvature, wind) unchanged, EXCEPT
`maxBlades`: the existing `'maxBlades for the 4 new biomes follows ceil(2304 *
density * 1.25)...'` test recomputes the expected value from each preset's CURRENT
`densityPerUnit2`, so changing density without updating `maxBlades` in lockstep
breaks that pre-existing test — `ceil(2304 * 9 * 1.25 / 1000) * 1000 = 26_000`
(down from `44_000`, which was density 15's value). Run the test from Step 1, confirm
it passes. Run the FULL `GrassField.test.ts` suite — confirm nothing else regresses.

- [x] **Step 3: Wire `aNeighborColor` into the vertex + fragment shader**

In `createGrassMaterial()`'s vertex shader, add the attribute and varying:

```glsl
      attribute vec3  aNeighborColor;    // averaged base/tip color of the nearest
                                          // different biome within EDGE_BAND_WU — see
                                          // GrassPlacement.neighborColor's doc comment.
```
(placed directly after the existing `attribute float aEdgeBlend;` line), and:

```glsl
      varying vec3  vNeighborColor;
```
(directly after the existing `varying float vEdgeBlend;` line). In `main()`, directly
after the existing `vEdgeBlend = aEdgeBlend;` line, add:

```glsl
        vNeighborColor = aNeighborColor;
```

In the fragment shader, add the matching varying (after the existing `varying float
vEdgeBlend;` line):

```glsl
      varying vec3  vNeighborColor;
```

Then replace the single combined mix line:

```glsl
        color = mix(color, uDryColor, max(vColorVar * uDryAmount, vEdgeBlend));
```

with the two split lines from the design spec §2b:

```glsl
        // Interior dry-tint variance (unrelated to biome edges) — small random dry
        // patches within a single biome's own territory, exactly as before this change.
        color = mix(color, uDryColor, vColorVar * uDryAmount);
        // Near a biome boundary (vEdgeBlend -> 1), blend toward the ACTUAL neighboring
        // biome's own grass color instead of a generic shared tan — a true, continuous
        // hue gradient between whichever two biomes meet here. See design spec
        // docs/superpowers/specs/2026-09-01-grass-boundary-blend-v2-design.md §2b.
        color = mix(color, vNeighborColor, vEdgeBlend);
```

- [x] **Step 4: Register the new instanced attribute in the `GrassField` class**

Find where `_edgeBlend: THREE.InstancedBufferAttribute` is declared/constructed/
updated in the `GrassField` class (constructor and `update()`), and add a parallel
`_neighborColor: THREE.InstancedBufferAttribute` (itemSize 3) following the exact same
pattern (construction, `mesh.geometry.setAttribute('aNeighborColor', ...)`, and the
`update()` method's per-rebuild upload of the new array from
`packGrassInstanceBuffers()`'s `neighborColor` output).

- [x] **Step 5: Full regression pass**

Run `npx vitest run tests/world/GrassField.test.ts tests/scene/OverworldScene*.test.ts`
— all green. Run `npx tsc --noEmit` — clean. Run the FULL test suite
(`npx vitest run`) — compare failure count against this session's established 12-
failure baseline; investigate anything beyond that baseline before proceeding.

- [x] **Step 6: Real-browser shader verification**

Start the dev server, load the game in a real (or headless-but-real-WebGL, not
jsdom) browser, switch to exterior, and confirm zero console/page errors (shader
compiles). Use `debugCellAt()`/`findFirstBiomeTile()` to locate a real grassland/
forest or grassland/savanna seam (same approach as v1's verification), and take
before/after comparison screenshots confirming: (a) the color transition now visibly
extends further and trends toward the actual neighboring biome's hue rather than a
generic tan smear, (b) savanna reads visibly sparser/shorter than grassland when
viewed side by side.

- [x] **Step 7: Update `docs/visual-progress.md` and ship**

Add a short section (or amend the existing "Grass Biome-Boundary Blending" section)
noting the v2 fix: wider ray-marched band, real neighbor-color blending, and savanna's
sparser/shorter look. Commit all of Task 4's changes together (shader + savanna +
docs), run `git log`/`git status` to confirm a clean, fully-pushed tree, matching this
session's established finishing pattern.
