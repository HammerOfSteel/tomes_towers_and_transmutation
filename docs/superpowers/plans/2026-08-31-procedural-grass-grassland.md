# Procedural Grass Shader (Grassland Batch 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render wind-animated, instanced 3D grass blades on `grassland`-biome tiles in the live
`OverworldScene`, within a small player-centered radius, reusing the project's established
world-content/scatter conventions.

**Architecture:** A new `src/world/GrassField.ts` module split into pure logic (blade placement
selection + instance-buffer packing, fully unit-testable without THREE) and THREE-dependent
rendering (blade geometry, a hand-written `ShaderMaterial` with wind/SSS/AO/distance-fade, a
`GrassField` class owning one persistent `InstancedMesh`). `ScatterRules.ts` gains a `'grass'`
scatter kind sharing the existing road/content exclusions. `OverworldScene.ts` wires one
`GrassField` instance into its existing constructor/enter/exit/update/dispose lifecycle, mirroring
exactly how `_slimeIM` (its other singleton `InstancedMesh`) is already wired.

**Tech Stack:** TypeScript, Three.js (`THREE.ShaderMaterial` + `THREE.InstancedMesh`, WebGL2 — this
project has no WebGPU renderer), Vitest, Playwright (e2e verification only).

## Global Constraints

- Batch 1 scope is `grassland` biome ONLY — `savanna`, `forest`, `taiga`, `tundra` are explicitly
  deferred to a follow-up batch (see design spec §2).
- Placement radius: `GRASS_RADIUS = 24` world units (player-centered, NOT tied to
  `ChunkManager`'s much larger terrain-streaming radius) — see design spec §4 for the blade-count
  budget rationale (worst case ~80,640 blades in a 48×48 WU window at 35 blades/unit²).
  `REBUILD_HYSTERESIS = 8` world units — the instance buffer only rebuilds once the player has
  moved that far from the last build center.
- Blade tuning (design spec §6): `segments=4`, `width=0.06`, `height=0.9`, `curvature=0.28`,
  `baseColor=0x3a7d2c`, `tipColor=0x8bbf40`, `dryAmount=0`.
- LOD: shader-based alpha distance fade only (`FADE_START`/`FADE_END` uniforms) — no geometry-swap
  LOD rings, no interactive push-displacement, in this batch.
- Map-edge guard (design spec §5): `WorldGrid.get(col, row)` returns a default cell for
  out-of-bounds queries, and that default cell's `biome` is `'grassland'` — placement logic MUST
  check `col`/`row` against `wg.width`/`wg.height` itself before calling `.get()`, never trusting
  the fallback.
- Every task must leave `npx tsc --noEmit` at the pre-existing baseline (144 errors as of this
  plan's writing — confirm the current count at Task 1 Step 1 and hold it steady for every
  subsequent task).
- Every task's new/changed tests must pass via `npx vitest run <file>` before moving to the next
  task's Step 1.

---

### Task 1: `ScatterRules.ts` — add the `'grass'` scatter kind

**Files:**
- Modify: `src/world/ScatterRules.ts`
- Modify: `tests/world/ScatterRules.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ScatterKind` includes `'grass'`; `isScatterAllowed(cell, 'grass')` shares the
  existing water/settlement (top-of-function) exclusions plus the road/non-empty-content
  exclusion already shared by `tree`/`bush`/`rock`. Consumed by Task 2's `selectGrassPlacements()`.

- [ ] **Step 1: Confirm the current `tsc` baseline**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: prints a number (the baseline you must hold steady through every later task in this
plan — if it differs from 144, that's your real baseline, not a discrepancy to fix).

- [ ] **Step 2: Write the failing tests**

Open `tests/world/ScatterRules.test.ts`. Make these 5 edits:

Change (line 23):
```ts
    for (const kind of ['tree', 'bush', 'rock', 'camp', 'ruin'] as const) {
```
to:
```ts
    for (const kind of ['tree', 'bush', 'rock', 'camp', 'ruin', 'grass'] as const) {
```

Change (line 30):
```ts
    for (const kind of ['tree', 'bush', 'rock', 'camp', 'ruin'] as const) {
```
to:
```ts
    for (const kind of ['tree', 'bush', 'rock', 'camp', 'ruin', 'grass'] as const) {
```

Change (line 54-61):
```ts
  it('disallows every scatter kind on a road tile', () => {
    for (const feature of ['road', 'road_dirt'] as const) {
      const cell = makeCell({ feature });
      for (const kind of ['tree', 'bush', 'rock'] as const) {
        expect(isScatterAllowed(cell, kind)).toBe(false);
      }
    }
  });
```
to:
```ts
  it('disallows every scatter kind on a road tile', () => {
    for (const feature of ['road', 'road_dirt'] as const) {
      const cell = makeCell({ feature });
      for (const kind of ['tree', 'bush', 'rock', 'grass'] as const) {
        expect(isScatterAllowed(cell, kind)).toBe(false);
      }
    }
  });
```

Change (line 63-68):
```ts
  it('disallows tree/bush/rock on a non-empty content cell (building, entrance, etc.)', () => {
    const cell = makeCell({ content: 'building' });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(false);
  });
```
to:
```ts
  it('disallows tree/bush/rock/grass on a non-empty content cell (building, entrance, etc.)', () => {
    const cell = makeCell({ content: 'building' });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(false);
    expect(isScatterAllowed(cell, 'grass')).toBe(false);
  });
```

Change (line 70-75):
```ts
  it('disallows tree/bush/rock inside a settlement zone', () => {
    const cell = makeCell({ settlementId: 3 });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(false);
  });
```
to:
```ts
  it('disallows tree/bush/rock/grass inside a settlement zone', () => {
    const cell = makeCell({ settlementId: 3 });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(false);
    expect(isScatterAllowed(cell, 'grass')).toBe(false);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/world/ScatterRules.test.ts`
Expected: FAIL — TypeScript/vitest will reject `'grass'` as not assignable to `ScatterKind` (a
type error surfaced at test collection), since `ScatterKind` doesn't include it yet.

- [ ] **Step 4: Add the `'grass'` kind to `ScatterRules.ts`**

In `src/world/ScatterRules.ts`, change:

```ts
export type ScatterKind = 'tree' | 'bush' | 'rock' | 'camp' | 'ruin';
```

to:

```ts
export type ScatterKind = 'tree' | 'bush' | 'rock' | 'camp' | 'ruin' | 'grass';
```

Then change:

```ts
  if (kind === 'tree' || kind === 'bush' || kind === 'rock') {
    if (cell.feature === 'road' || cell.feature === 'road_dirt') return false;
    if (cell.content !== 'empty') return false;
  }
```

to:

```ts
  if (kind === 'tree' || kind === 'bush' || kind === 'rock' || kind === 'grass') {
    if (cell.feature === 'road' || cell.feature === 'road_dirt') return false;
    if (cell.content !== 'empty') return false;
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/world/ScatterRules.test.ts`
Expected: PASS — all tests in the file.

- [ ] **Step 6: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Step 1.

- [ ] **Step 7: Commit**

```bash
git add src/world/ScatterRules.ts tests/world/ScatterRules.test.ts
git commit -m "feat: add grass scatter kind to ScatterRules

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: `GrassField.ts` — pure placement + instance-buffer packing logic

**Files:**
- Create: `src/world/GrassField.ts` (this task only adds the pure-logic top section; Tasks 3-4
  add to this same file)
- Test: Create `tests/world/GrassField.test.ts` (this task only adds the pure-logic test
  `describe` blocks; Tasks 3-4 add more `describe` blocks to this same file)

**Interfaces:**
- Consumes: `isScatterAllowed` from `@/world/ScatterRules` (Task 1), `WorldGrid`/`BiomeId` types
  from `@/world/WorldGrid`, `mulberry32` from `@/core/prng`, `LEVEL_HEIGHT` from
  `@/world/WaterDepthConfig`.
- Produces: `GrassPlacement` interface (`{ x, y, z, rotation, scaleX, scaleY, tilt, colorVar }`,
  all `number`), `selectGrassPlacements(wg, centerX, centerZ, radius, seed): GrassPlacement[]`,
  `GrassInstanceBuffers` interface (`{ positionRotation: Float32Array, scaleAndVariation:
  Float32Array }`), `packGrassInstanceBuffers(placements): GrassInstanceBuffers`. Both are
  consumed directly by Task 4's `GrassField` class.

- [ ] **Step 1: Write the failing tests**

Create `tests/world/GrassField.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { WorldGrid, type BiomeId } from '@/world/WorldGrid';
import { selectGrassPlacements, packGrassInstanceBuffers } from '@/world/GrassField';

function makeAllBiomeGrid(size: number, biome: BiomeId): WorldGrid {
  const g = new WorldGrid(size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) g.set(col, row, { elevation: 1, biome });
  }
  return g;
}

describe('selectGrassPlacements', () => {
  it('returns 0 placements for a window with no grassland cells', () => {
    const wg = makeAllBiomeGrid(40, 'desert');
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1);
    expect(placements.length).toBe(0);
  });

  it('returns placements for an all-grassland window', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1);
    expect(placements.length).toBeGreaterThan(0);
  });

  it('excludes cells with a road feature', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const { col: c0, row: r0 } = wg.worldToGrid(-24, -24);
    const { col: c1, row: r1 } = wg.worldToGrid(24, 24);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) wg.set(col, row, { feature: 'road' });
    }
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1);
    expect(placements.length).toBe(0);
  });

  it('excludes cells with non-empty content', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const { col: c0, row: r0 } = wg.worldToGrid(-24, -24);
    const { col: c1, row: r1 } = wg.worldToGrid(24, 24);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) wg.set(col, row, { content: 'tree' });
    }
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1);
    expect(placements.length).toBe(0);
  });

  it('excludes water cells (waterDepth > 0)', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const { col: c0, row: r0 } = wg.worldToGrid(-24, -24);
    const { col: c1, row: r1 } = wg.worldToGrid(24, 24);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) wg.set(col, row, { waterDepth: 1.5 });
    }
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1);
    expect(placements.length).toBe(0);
  });

  it('excludes out-of-bounds candidate tiles despite WorldGrid.get()\'s grassland default fallback', () => {
    // A tiny 4x4 grid — a window centered far outside it (world (500,500)) must
    // produce 0 placements, even though .get() on out-of-bounds col/row returns
    // a default cell reporting biome: 'grassland'.
    const wg = makeAllBiomeGrid(4, 'grassland');
    const placements = selectGrassPlacements(wg, 500, 500, 24, 1);
    expect(placements.length).toBe(0);
  });

  it('is deterministic for a fixed seed', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const a = selectGrassPlacements(wg, 0, 0, 24, 7);
    const b = selectGrassPlacements(wg, 0, 0, 24, 7);
    expect(a).toEqual(b);
  });
});

describe('packGrassInstanceBuffers', () => {
  it('packs N placements into Float32Arrays of length N*4, at the expected offsets', () => {
    const placements = [
      { x: 1, y: 2, z: 3, rotation: 0.5, scaleX: 0.8, scaleY: 0.9, tilt: 0.1, colorVar: 0.4 },
      { x: 4, y: 5, z: 6, rotation: 1.5, scaleX: 1.1, scaleY: 1.2, tilt: -0.1, colorVar: 0.7 },
    ];
    const { positionRotation, scaleAndVariation } = packGrassInstanceBuffers(placements);
    expect(positionRotation.length).toBe(8);
    expect(scaleAndVariation.length).toBe(8);
    expect(positionRotation[0]).toBe(1);
    expect(positionRotation[1]).toBe(2);
    expect(positionRotation[2]).toBe(3);
    expect(positionRotation[3]).toBe(0.5);
    expect(scaleAndVariation[4]).toBe(1.1);
    expect(scaleAndVariation[7]).toBe(0.7);
  });

  it('returns empty arrays for an empty placements list', () => {
    const { positionRotation, scaleAndVariation } = packGrassInstanceBuffers([]);
    expect(positionRotation.length).toBe(0);
    expect(scaleAndVariation.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: FAIL with "Failed to resolve import `@/world/GrassField`" (the file doesn't exist yet).

- [ ] **Step 3: Create `src/world/GrassField.ts` with the pure-logic section**

```ts
/**
 * GrassField.ts — procedural 3D grass blades for the live OverworldScene
 * (batch 1 — grassland biome only; see
 * docs/superpowers/specs/2026-08-31-procedural-grass-grassland-design.md).
 *
 * Renders wind-animated instanced grass blades within a small player-
 * centered radius (NOT tied to the ChunkManager's much larger terrain-
 * streaming radius — see the design spec's "Placement Radius" section for
 * why: grass density is 1-2 orders of magnitude higher per unit area than
 * tree/rock scatter, so applying it across the full streamed terrain area
 * would blow the desktop instanced-mesh budget).
 */
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { LEVEL_HEIGHT } from '@/world/WaterDepthConfig';
import { isScatterAllowed } from '@/world/ScatterRules';
import type { WorldGrid } from '@/world/WorldGrid';

// ── Tunables (see design spec §4/§6) ────────────────────────────────────────
export const GRASS_RADIUS = 24;          // world units, player-centered
export const REBUILD_HYSTERESIS = 8;     // world units of player movement before rebuild
const DENSITY_PER_UNIT2 = 35;            // meadow preset — blades per world-unit²

// ── Placement ─────────────────────────────────────────────────────────────

export interface GrassPlacement {
  x: number; y: number; z: number;
  rotation: number; scaleX: number; scaleY: number; tilt: number; colorVar: number;
}

/**
 * Scatter grass blade placements within a `radius`-WU square window centered
 * on `(centerX, centerZ)`, restricted to `grassland`-biome tiles that pass
 * `isScatterAllowed(cell, 'grass')`. Deterministic for a fixed `seed`.
 *
 * Map-edge guard: `WorldGrid.get()` returns a default cell (which reports
 * `biome: 'grassland'`!) for out-of-bounds col/row — so this function checks
 * bounds itself before calling `.get()`, rather than trusting that fallback.
 */
export function selectGrassPlacements(
  wg: WorldGrid,
  centerX: number,
  centerZ: number,
  radius: number,
  seed: number,
): GrassPlacement[] {
  const rand = mulberry32(seed);
  const gridStep = 1 / Math.sqrt(DENSITY_PER_UNIT2);
  const halfW = (wg.width - 1) / 2;
  const halfH = (wg.height - 1) / 2;
  const placements: GrassPlacement[] = [];

  for (let gx = centerX - radius; gx < centerX + radius; gx += gridStep) {
    for (let gz = centerZ - radius; gz < centerZ + radius; gz += gridStep) {
      const x = gx + (rand() - 0.5) * gridStep;
      const z = gz + (rand() - 0.5) * gridStep;

      const col = Math.floor(x / wg.tileUnit + halfW);
      const row = Math.floor(z / wg.tileUnit + halfH);
      if (col < 0 || col >= wg.width || row < 0 || row >= wg.height) continue;

      const cell = wg.get(col, row);
      if (cell.biome !== 'grassland') continue;
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

// ── Instance-buffer packing ──────────────────────────────────────────────

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
  return { positionRotation, scaleAndVariation };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: PASS — all 8 tests.

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1. Note: this file imports `* as THREE from 'three'` but
doesn't use it yet in this task — that's fine, Tasks 3-4 use it in the same file, and an unused
namespace import does not raise a TS6133 error (only unused named bindings do).

- [ ] **Step 6: Commit**

```bash
git add src/world/GrassField.ts tests/world/GrassField.test.ts
git commit -m "feat: add grass placement + instance-buffer packing logic

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: `GrassField.ts` — blade geometry + shader material

**Files:**
- Modify: `src/world/GrassField.ts` (append geometry + material section)
- Modify: `tests/world/GrassField.test.ts` (append geometry + material `describe` blocks)

**Interfaces:**
- Consumes: nothing new from earlier tasks.
- Produces: `createGrassBladeGeometry(segments?, width?, height?, curvature?):
  THREE.BufferGeometry`, `createGrassMaterial(): THREE.ShaderMaterial` (with uniforms
  `uWindTime`, `uWindDir`, `uWindBase`, `uWindGust`, `uWindGustFreq`, `uFadeStart`, `uFadeEnd`,
  `uBaseColor`, `uTipColor`, `uDryColor`, `uDryAmount`, `uSssStrength`, `uAoStrength`, `uSunDir`,
  `uSunColor`, `uAmbientColor`). Both consumed directly by Task 4's `GrassField` class
  constructor.

- [ ] **Step 1: Write the failing tests**

Append to `tests/world/GrassField.test.ts` (after the `packGrassInstanceBuffers` describe block,
add a new import at the top of the file alongside the existing ones):

Change the import line:
```ts
import { selectGrassPlacements, packGrassInstanceBuffers } from '@/world/GrassField';
```
to:
```ts
import {
  selectGrassPlacements, packGrassInstanceBuffers,
  createGrassBladeGeometry, createGrassMaterial,
} from '@/world/GrassField';
```

Then append at the end of the file:

```ts
describe('createGrassBladeGeometry', () => {
  it('produces the expected vertex and index counts for the default tuning', () => {
    const geo = createGrassBladeGeometry(4, 0.06, 0.9, 0.28);
    // (segments+1)*2 cross-section verts + 1 tip vertex = 5*2+1 = 11
    expect(geo.attributes.position.count).toBe(11);
    // segments*6 (2 tris per cross-section pair) + 3 (tip triangle) = 4*6+3 = 27
    expect(geo.index).not.toBeNull();
    expect(geo.index!.count).toBe(27);
  });

  it('computes vertex normals (non-zero normal attribute)', () => {
    const geo = createGrassBladeGeometry(4, 0.06, 0.9, 0.28);
    expect(geo.attributes.normal).toBeDefined();
  });
});

describe('createGrassMaterial', () => {
  it('declares the custom instanced attributes and wind uniforms in the vertex shader', () => {
    const mat = createGrassMaterial();
    expect(mat.vertexShader).toContain('aPositionRotation');
    expect(mat.vertexShader).toContain('aScaleVariation');
    expect(mat.vertexShader).toContain('uWindTime');
    expect(mat.vertexShader).toContain('uFadeStart');
  });

  it('declares the color/shading uniforms in the fragment shader', () => {
    const mat = createGrassMaterial();
    expect(mat.fragmentShader).toContain('uBaseColor');
    expect(mat.fragmentShader).toContain('uTipColor');
    expect(mat.fragmentShader).toContain('uSssStrength');
  });

  it('has sensible default uniform values', () => {
    const mat = createGrassMaterial();
    expect(mat.uniforms.uWindTime.value).toBe(0);
    expect(mat.uniforms.uDryAmount.value).toBe(0);
    expect(mat.transparent).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: FAIL — `createGrassBladeGeometry`/`createGrassMaterial` are not exported yet.

- [ ] **Step 3: Append the geometry + material section to `GrassField.ts`**

Add to `src/world/GrassField.ts`, after `packGrassInstanceBuffers()`:

```ts
// ── Blade geometry ────────────────────────────────────────────────────────

const BLADE_SEGMENTS  = 4;
const BLADE_WIDTH      = 0.06;
const BLADE_HEIGHT     = 0.9;
const BLADE_CURVATURE  = 0.28;
const FADE_START = GRASS_RADIUS - 10;
const FADE_END   = GRASS_RADIUS - 2;

/** Tapered, bezier-curved triangle-strip blade (see procedural-grass-threejs skill). */
export function createGrassBladeGeometry(
  segments = BLADE_SEGMENTS,
  width = BLADE_WIDTH,
  height = BLADE_HEIGHT,
  curvature = BLADE_CURVATURE,
): THREE.BufferGeometry {
  const vertCount = (segments + 1) * 2 + 1;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = 2 * (1 - t) * t * curvature;
    const y = t * height;
    const w = width * (1 - t * 0.8);

    const vi = i * 2;
    positions[vi * 3]     = x - w * 0.5;
    positions[vi * 3 + 1] = y;
    positions[vi * 3 + 2] = 0;
    uvs[vi * 2] = 0;
    uvs[vi * 2 + 1] = t;

    positions[(vi + 1) * 3]     = x + w * 0.5;
    positions[(vi + 1) * 3 + 1] = y;
    positions[(vi + 1) * 3 + 2] = 0;
    uvs[(vi + 1) * 2] = 1;
    uvs[(vi + 1) * 2 + 1] = t;
  }

  const tipIdx = (segments + 1) * 2;
  positions[tipIdx * 3]     = curvature * 0.5;
  positions[tipIdx * 3 + 1] = height;
  positions[tipIdx * 3 + 2] = 0;
  uvs[tipIdx * 2] = 0.5;
  uvs[tipIdx * 2 + 1] = 1.0;

  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    indices.push(a, b, c, b, d, c);
  }
  const lastL = segments * 2, lastR = segments * 2 + 1;
  indices.push(lastL, lastR, tipIdx);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ── Shader material ───────────────────────────────────────────────────────

/**
 * Wind-animated grass blade material. Uses Three.js's automatically-injected
 * built-ins (`position`, `normal`, `uv`, `modelMatrix`, `projectionMatrix`,
 * `viewMatrix`, `cameraPosition`) directly without redeclaring them — the
 * same convention already used by this project's `WaterMaterial.ts`
 * (confirmed working there: redeclaring these causes a GLSL "redefinition"
 * compile error, since `THREE.ShaderMaterial` always prepends them).
 */
export function createGrassMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uBaseColor:    { value: new THREE.Color(0x3a7d2c) },
      uTipColor:     { value: new THREE.Color(0x8bbf40) },
      uDryColor:     { value: new THREE.Color(0xc4a84b) },
      uDryAmount:    { value: 0 },
      uSssStrength:  { value: 0.5 },
      uAoStrength:   { value: 0.6 },
      uSunDir:       { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      uSunColor:     { value: new THREE.Color(0xfff4e5) },
      uAmbientColor: { value: new THREE.Color(0x4488aa) },
      uWindTime:     { value: 0 },
      uWindDir:      { value: new THREE.Vector2(1, 0.3).normalize() },
      uWindBase:     { value: 0.4 },
      uWindGust:     { value: 0.8 },
      uWindGustFreq: { value: 0.3 },
      uFadeStart:    { value: FADE_START },
      uFadeEnd:      { value: FADE_END },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aPositionRotation; // xyz = world pos, w = Y rotation
      attribute vec4 aScaleVariation;   // x = scaleX, y = scaleY, z = tilt, w = colorVar

      uniform float uWindTime;
      uniform vec2  uWindDir;
      uniform float uWindBase;
      uniform float uWindGust;
      uniform float uWindGustFreq;
      uniform float uFadeStart;
      uniform float uFadeEnd;

      varying vec2  vUv;
      varying vec3  vNormal;
      varying vec3  vWorldPos;
      varying float vColorVar;
      varying float vFade;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      vec2 computeWind(vec3 worldPos, float heightFactor) {
        float globalPhase = dot(worldPos.xz, uWindDir) * 0.5 + uWindTime * 1.2;
        vec2 globalSway = uWindDir * sin(globalPhase) * uWindBase;

        float gustPhase = dot(worldPos.xz, uWindDir) * uWindGustFreq + uWindTime * 2.5;
        float gustEnvelope = smoothstep(0.3, 0.7, noise2D(worldPos.xz * 0.02 + uWindTime * 0.3));
        vec2 gustSway = uWindDir * sin(gustPhase) * uWindGust * gustEnvelope;

        float bladeHash = hash(worldPos.xz * 10.0);
        float turbPhase = uWindTime * 3.0 + bladeHash * 6.28;
        vec2 turbulence = vec2(sin(turbPhase), cos(turbPhase * 0.7)) * 0.1;

        float h2 = heightFactor * heightFactor;
        return (globalSway + gustSway + turbulence) * h2;
      }

      void main() {
        vUv = uv;
        vColorVar = aScaleVariation.w;

        vec3 pos = position;
        pos.x *= aScaleVariation.x;
        pos.y *= aScaleVariation.y;

        float tilt = aScaleVariation.z;
        float cosT = cos(tilt);
        float sinT = sin(tilt);
        float tiltedY = pos.y * cosT - pos.z * sinT;
        float tiltedZ = pos.y * sinT + pos.z * cosT;
        pos.y = tiltedY;
        pos.z = tiltedZ;

        float rot = aPositionRotation.w;
        float cosR = cos(rot);
        float sinR = sin(rot);
        vec3 rotated;
        rotated.x = pos.x * cosR - pos.z * sinR;
        rotated.y = pos.y;
        rotated.z = pos.x * sinR + pos.z * cosR;

        vec3 worldPos = rotated + aPositionRotation.xyz;

        float heightFactor = uv.y;
        vec2 windOffsetXZ = computeWind(worldPos, heightFactor);
        worldPos.x += windOffsetXZ.x;
        worldPos.z += windOffsetXZ.y;

        vWorldPos = worldPos;
        vNormal = normalize(normal);
        vNormal.xz += windOffsetXZ * 0.3;
        vNormal = normalize(vNormal);

        float dist = distance(cameraPosition, worldPos);
        vFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);

        gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
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
        color *= 1.0 + (vColorVar - 0.5) * 0.15;

        float ao = mix(1.0 - uAoStrength, 1.0, smoothstep(0.0, 0.3, heightT));
        color *= ao;

        vec3 N = normalize(vNormal);
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float diffuse = max(dot(N, L) * 0.5 + 0.5, 0.0);

        // Subsurface-scattering approximation: light passing through the
        // blade from behind (relative to the viewer) makes it glow.
        float sss = pow(max(dot(-V, L), 0.0), 3.0) * uSssStrength * heightT;

        vec3 lit = color * (uSunColor * diffuse + uAmbientColor * 0.5) + uSunColor * sss;

        gl_FragColor = vec4(lit, vFade);
      }
    `,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: PASS — all tests, including the 6 new ones.

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1.

- [ ] **Step 6: Commit**

```bash
git add src/world/GrassField.ts tests/world/GrassField.test.ts
git commit -m "feat: add grass blade geometry + wind/SSS shader material

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: `GrassField.ts` — `WindSystem`/`GrassField` classes + `OverworldScene.ts` wiring

**Files:**
- Modify: `src/world/GrassField.ts` (append `WindSystem` + `GrassField` classes)
- Modify: `tests/world/GrassField.test.ts` (append `GrassField` class `describe` block)
- Modify: `src/scene/OverworldScene.ts`:
  - Imports (near line 46/84, alongside `TerritoryDressing`/`ScatterRules` imports)
  - Field declaration block (near line 239, alongside `_slimeIM`)
  - Constructor (near line 380, alongside `_buildTerritoryPropPool()`)
  - `enter()` (near line 442, alongside `this.scene.add(this._slimeIM)`)
  - `exit()` (near line 496, alongside `this.scene.remove(this._slimeIM)`)
  - `update()` (near line 582, alongside `this._syncSlimeIM()`)
  - `dispose()` (near line 616-617, alongside `_slimeIM` geometry/material disposal)
  - New `findFirstGrasslandTile()` and `getGrassDebugInfo()` methods (alongside
    `findFirstWaterTile()`/`getWaterMeshDebugInfo()`, near line 792)

**Interfaces:**
- Consumes: `selectGrassPlacements`, `packGrassInstanceBuffers`, `createGrassBladeGeometry`,
  `createGrassMaterial`, `GRASS_RADIUS`, `REBUILD_HYSTERESIS` (all from Tasks 2-3, same file).
- Produces: `GrassField` class with `mesh: THREE.InstancedMesh` (public, readonly),
  `update(playerX: number, playerZ: number): void`, `tickWind(dt: number): void`,
  `dispose(): void`. Consumed by `OverworldScene.ts`'s wiring in this same task, and by Task 5's
  `getGrassDebugInfo()`/e2e verification.

- [ ] **Step 1: Write the failing test**

Change the import line at the top of `tests/world/GrassField.test.ts`:
```ts
import {
  selectGrassPlacements, packGrassInstanceBuffers,
  createGrassBladeGeometry, createGrassMaterial,
} from '@/world/GrassField';
```
to:
```ts
import {
  selectGrassPlacements, packGrassInstanceBuffers,
  createGrassBladeGeometry, createGrassMaterial,
  GrassField, REBUILD_HYSTERESIS,
} from '@/world/GrassField';
```

Then append at the end of the file:

```ts
describe('GrassField', () => {
  function makeAllGrasslandGrid(size = 40): WorldGrid {
    const g = new WorldGrid(size, size);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) g.set(col, row, { elevation: 1, biome: 'grassland' });
    }
    return g;
  }

  it('places no blades before the first update() call', () => {
    const wg = makeAllGrasslandGrid();
    const field = new GrassField(wg, 42);
    expect(field.mesh.count).toBe(0);
  });

  it('places blades on the first update() call', () => {
    const wg = makeAllGrasslandGrid();
    const field = new GrassField(wg, 42);
    field.update(0, 0);
    expect(field.mesh.count).toBeGreaterThan(0);
  });

  it('does not rebuild when the player moves less than REBUILD_HYSTERESIS', () => {
    const wg = makeAllGrasslandGrid();
    const field = new GrassField(wg, 42);
    field.update(0, 0);
    expect((field as unknown as { _lastBuildX: number })._lastBuildX).toBe(0);
    field.update(1, 1); // well under REBUILD_HYSTERESIS
    expect((field as unknown as { _lastBuildX: number })._lastBuildX).toBe(0); // unchanged
  });

  it('rebuilds once the player moves past REBUILD_HYSTERESIS', () => {
    const wg = makeAllGrasslandGrid();
    const field = new GrassField(wg, 42);
    field.update(0, 0);
    field.update(REBUILD_HYSTERESIS + 1, 0);
    expect((field as unknown as { _lastBuildX: number })._lastBuildX).toBe(REBUILD_HYSTERESIS + 1);
  });

  it('tickWind() advances the wind time uniform without needing an update() call', () => {
    const wg = makeAllGrasslandGrid();
    const field = new GrassField(wg, 42);
    const material = (field as unknown as { _material: THREE.ShaderMaterial })._material;
    expect(material.uniforms.uWindTime.value).toBe(0);
    field.tickWind(0.5);
    expect(material.uniforms.uWindTime.value).toBeCloseTo(0.5);
  });

  it('dispose() disposes the mesh geometry and material', () => {
    const wg = makeAllGrasslandGrid();
    const field = new GrassField(wg, 42);
    const geoDisposeSpy = vi.spyOn(field.mesh.geometry, 'dispose');
    const material = (field as unknown as { _material: THREE.ShaderMaterial })._material;
    const matDisposeSpy = vi.spyOn(material, 'dispose');
    field.dispose();
    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });
});
```

Also add `vi` to the top-of-file vitest import:
```ts
import { describe, it, expect } from 'vitest';
```
becomes:
```ts
import { describe, it, expect, vi } from 'vitest';
```

And add a `THREE` import (needed for the `THREE.ShaderMaterial` cast type above) alongside the
existing `WorldGrid` import:
```ts
import { WorldGrid, type BiomeId } from '@/world/WorldGrid';
```
becomes:
```ts
import * as THREE from 'three';
import { WorldGrid, type BiomeId } from '@/world/WorldGrid';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: FAIL — `GrassField`/`REBUILD_HYSTERESIS` import error (not exported as a class /
`REBUILD_HYSTERESIS` isn't imported by name in this test file yet, actually it already is a
named export from Task 2 — the failure here is specifically `GrassField` not being defined as a
class yet).

- [ ] **Step 3: Append the `WindSystem` and `GrassField` classes to `GrassField.ts`**

Add to `src/world/GrassField.ts`, after `createGrassMaterial()`:

```ts
// ── Wind system ───────────────────────────────────────────────────────────

/** Drives the grass shader's wind uniforms over time — global sway + gusts. */
export class WindSystem {
  direction = new THREE.Vector2(1, 0.3).normalize();
  baseStrength = 0.4;
  gustStrength = 0.8;
  gustFrequency = 0.3;
  time = 0;

  update(dt: number): void {
    this.time += dt;
  }
}

// ── GrassField ────────────────────────────────────────────────────────────

/**
 * Owns one persistent `THREE.InstancedMesh` of grass blades, rebuilt (in
 * place — no reallocation) only when the player moves past
 * `REBUILD_HYSTERESIS` from the last build center. Call `update()` once per
 * frame with the player's world position, and `tickWind()` once per frame
 * to animate the shader (cheap — uniform writes only, no CPU instance work).
 */
export class GrassField {
  static readonly MAX_BLADES = 100_000; // see design spec §4's budget math

  readonly mesh: THREE.InstancedMesh;
  private readonly _material: THREE.ShaderMaterial;
  private readonly _wind = new WindSystem();
  private readonly _positionRotation: THREE.InstancedBufferAttribute;
  private readonly _scaleAndVariation: THREE.InstancedBufferAttribute;
  private _lastBuildX = Infinity;
  private _lastBuildZ = Infinity;

  constructor(private readonly _wg: WorldGrid, private readonly _seed: number) {
    const geometry = createGrassBladeGeometry();
    this._material = createGrassMaterial();

    this._positionRotation = new THREE.InstancedBufferAttribute(
      new Float32Array(GrassField.MAX_BLADES * 4), 4,
    );
    this._positionRotation.setUsage(THREE.DynamicDrawUsage);
    this._scaleAndVariation = new THREE.InstancedBufferAttribute(
      new Float32Array(GrassField.MAX_BLADES * 4), 4,
    );
    this._scaleAndVariation.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aPositionRotation', this._positionRotation);
    geometry.setAttribute('aScaleVariation', this._scaleAndVariation);

    this.mesh = new THREE.InstancedMesh(geometry, this._material, GrassField.MAX_BLADES);
    this.mesh.frustumCulled = false; // wind displacement can push blades outside static bounds
    this.mesh.count = 0; // nothing placed until the first update()
  }

  /** Rebuild the instance buffer only once the player has moved past REBUILD_HYSTERESIS. */
  update(playerX: number, playerZ: number): void {
    const dx = playerX - this._lastBuildX;
    const dz = playerZ - this._lastBuildZ;
    if (Number.isFinite(this._lastBuildX) && Math.sqrt(dx * dx + dz * dz) < REBUILD_HYSTERESIS) {
      return;
    }
    this._lastBuildX = playerX;
    this._lastBuildZ = playerZ;

    const placements = selectGrassPlacements(this._wg, playerX, playerZ, GRASS_RADIUS, this._seed);
    const count = Math.min(placements.length, GrassField.MAX_BLADES);
    const { positionRotation, scaleAndVariation } =
      packGrassInstanceBuffers(placements.slice(0, count));

    this._positionRotation.array.set(positionRotation);
    this._scaleAndVariation.array.set(scaleAndVariation);
    this._positionRotation.needsUpdate = true;
    this._scaleAndVariation.needsUpdate = true;
    this.mesh.count = count;
  }

  /** Per-frame, cheap — only updates shader uniforms, no CPU instance-data work. */
  tickWind(dt: number): void {
    this._wind.update(dt);
    const u = this._material.uniforms;
    u.uWindTime.value = this._wind.time;
    (u.uWindDir.value as THREE.Vector2).copy(this._wind.direction);
    u.uWindBase.value = this._wind.baseStrength;
    u.uWindGust.value = this._wind.gustStrength;
    u.uWindGustFreq.value = this._wind.gustFrequency;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this._material.dispose();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: PASS — all tests, including the 6 new `GrassField` ones.

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1.

- [ ] **Step 6: Commit the `GrassField.ts` module on its own**

```bash
git add src/world/GrassField.ts tests/world/GrassField.test.ts
git commit -m "feat: add WindSystem + GrassField class (rebuild-threshold instancing)

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 7: Wire `GrassField` into `OverworldScene.ts` — add the import**

In `src/scene/OverworldScene.ts`, find the existing `ScatterRules` import:
```ts
import { isScatterAllowed } from '@/world/ScatterRules';
```
Change to:
```ts
import { isScatterAllowed } from '@/world/ScatterRules';
import { GrassField } from '@/world/GrassField';
```

- [ ] **Step 8: Add the field declaration**

Find the `_slimeIM` field declaration:
```ts
  /** Phase 7h.2 — one draw call for all slime bodies (128 slots; enemies never exceed that). */
  private readonly _slimeIM: THREE.InstancedMesh = createSlimeBodyIM(128);
```
Change to:
```ts
  /** Phase 7h.2 — one draw call for all slime bodies (128 slots; enemies never exceed that). */
  private readonly _slimeIM: THREE.InstancedMesh = createSlimeBodyIM(128);
  /** Procedural grass (batch 1 — grassland biome only). Built in the constructor once
   *  `this._wg`/`this._seed` are set (needs both, so it can't be a field initializer default
   *  like `_slimeIM` above, which has no such dependency). */
  private _grassField!: GrassField;
```

- [ ] **Step 9: Instantiate it in the constructor**

Find:
```ts
    this._buildSettlements(worldData);
    this._buildTerritoryPropPool();
```
Change to:
```ts
    this._buildSettlements(worldData);
    this._buildTerritoryPropPool();
    this._grassField = new GrassField(this._wg, this._seed);
```

- [ ] **Step 10: Add/remove the mesh in `enter()`/`exit()`**

Find in `enter()`:
```ts
    this.scene.add(this._slimeIM);  // Phase 7h.2: single draw call for all bodies
```
Change to:
```ts
    this.scene.add(this._slimeIM);  // Phase 7h.2: single draw call for all bodies
    this.scene.add(this._grassField.mesh);
```

Find in `exit()`:
```ts
    this.scene.remove(this._slimeIM);   // Phase 7h.2
```
Change to:
```ts
    this.scene.remove(this._slimeIM);   // Phase 7h.2
    this.scene.remove(this._grassField.mesh);
```

- [ ] **Step 11: Wire `update()`/`tickWind()` into the per-frame `update()` method**

Find:
```ts
    // Phase 7h.2: sync all slime body matrices/colours into the InstancedMesh
    this._syncSlimeIM();
```
Change to:
```ts
    // Phase 7h.2: sync all slime body matrices/colours into the InstancedMesh
    this._syncSlimeIM();

    // Procedural grass (batch 1): rebuild the instance buffer only when the
    // player has moved past REBUILD_HYSTERESIS; tick wind uniforms every frame.
    this._grassField.update(pos.x, pos.z);
    this._grassField.tickWind(dt);
```

- [ ] **Step 12: Dispose it in `dispose()`**

Find:
```ts
    (this._slimeIM.geometry as THREE.BufferGeometry).dispose();
    (this._slimeIM.material as THREE.Material).dispose();
```
Change to:
```ts
    (this._slimeIM.geometry as THREE.BufferGeometry).dispose();
    (this._slimeIM.material as THREE.Material).dispose();
    this._grassField.dispose();
```

- [ ] **Step 13: Add `findFirstGrasslandTile()` and `getGrassDebugInfo()` debug/test methods**

Find `findFirstFordTile()`:
```ts
  findFirstFordTile(): { x: number; z: number } | null {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    for (let row = 0; row < GH; row++) {
      for (let col = 0; col < GW; col++) {
        if (this._wg.get(col, row).feature !== 'river_ford') continue;
        return { x: (col - GHW) * T, z: (row - GHH) * T };
      }
    }
    return null;
  }
```
Add immediately after it:
```ts

  /** First grassland-biome tile found by scanning the grid (or null). For tests/dev-tooling
   *  verification of the procedural grass system — mirrors `findFirstFordTile()`. */
  findFirstGrasslandTile(): { x: number; z: number } | null {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    for (let row = 0; row < GH; row++) {
      for (let col = 0; col < GW; col++) {
        if (this._wg.get(col, row).biome !== 'grassland') continue;
        return { x: (col - GHW) * T, z: (row - GHH) * T };
      }
    }
    return null;
  }

  /** Debug/dev-tooling only: grass instanced-mesh blade count + scene membership
   *  (for verification scripts). Mirrors `getWaterMeshDebugInfo()`. */
  getGrassDebugInfo(): { bladeCount: number; inScene: boolean } {
    return {
      bladeCount: this._grassField.mesh.count,
      inScene: this.scene.children.includes(this._grassField.mesh),
    };
  }
```

- [ ] **Step 14: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1.

- [ ] **Step 15: Run the existing OverworldScene test suite to confirm no regression**

Run: `npx vitest run tests/scene/OverworldScene.chunk-scatter-alignment.test.ts tests/scene/OverworldScene.settlement-parity.test.ts tests/scene/OverworldScene.drawcall-batching.test.ts tests/scene/OverworldScene.chunk-terrain-alignment.test.ts tests/scene/OverworldScene.chunk-collider-streaming.test.ts`
Expected: PASS. `OverworldScene.drawcall-batching.test.ts` is the most relevant one to watch —
it counts every `THREE.Mesh` (which `THREE.InstancedMesh` `isMesh`-matches too, since it extends
`Mesh`) in the scene after `enter()` and asserts `meshCount < 8000`; adding one more persistent
`InstancedMesh` (the grass field, exactly like the pre-existing `_slimeIM` singleton already
does) only adds +1 to that count, nowhere near the threshold — if this test fails for a
different reason, investigate before proceeding. `OverworldScene.chunk-scatter-alignment.test.ts`
and `OverworldScene.settlement-parity.test.ts` are known to have occasional sandbox-contention
flakes in this project's established baseline — re-run either one in isolation if it fails here
before concluding it's a real regression.

- [ ] **Step 16: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "feat: wire GrassField into OverworldScene lifecycle

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: `main.ts` debug hooks + e2e verification + full regression + ship

**Files:**
- Modify: `src/main.ts` (add `findFirstGrasslandTile`/`getGrassDebugInfo` hooks to the
  `window.__game` object, alongside the existing `findWaterTile`/`getWaterMeshDebugInfo` hooks)
- Create: `tests/e2e/procedural-grass.spec.ts` (one-off Playwright verification, not part of CI
  regression — matches the established `river-lake-swim.spec.ts`/`lantern-spell.spec.ts`
  convention)

**Interfaces:**
- Consumes: `OverworldScene.findFirstGrasslandTile()`/`getGrassDebugInfo()` (Task 4).
- Produces: nothing new for later tasks — this is the final verification step.

- [ ] **Step 1: Add the debug hooks to `main.ts`**

In `src/main.ts`, find:
```ts
      /** Water mesh debug info (exterior mode only). For tests. */
      getWaterMeshDebugInfo: () => gameMode === 'exterior' ? (overworld?.getWaterMeshDebugInfo() ?? null) : null,
```
Change to:
```ts
      /** Water mesh debug info (exterior mode only). For tests. */
      getWaterMeshDebugInfo: () => gameMode === 'exterior' ? (overworld?.getWaterMeshDebugInfo() ?? null) : null,
      /** First grassland-biome tile world position (exterior mode only). For tests. */
      findFirstGrasslandTile: () => gameMode === 'exterior' ? (overworld?.findFirstGrasslandTile() ?? null) : null,
      /** Grass instanced-mesh debug info (exterior mode only). For tests. */
      getGrassDebugInfo: () => gameMode === 'exterior' ? (overworld?.getGrassDebugInfo() ?? null) : null,
```

- [ ] **Step 2: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1.

- [ ] **Step 3: Commit the `main.ts` hooks**

```bash
git add src/main.ts
git commit -m "feat: add grass debug hooks to window.__game

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 4: Write the e2e verification spec**

Create `tests/e2e/procedural-grass.spec.ts`:

```ts
/**
 * procedural-grass.spec.ts — manual/visual verification for the procedural
 * grass shader, batch 1 (grassland biome only; see
 * docs/superpowers/specs/2026-08-31-procedural-grass-grassland-design.md).
 *
 * Not part of the regular CI regression suite — one-off verification
 * tooling confirming the unit-tested placement/packing/geometry/material
 * logic actually produces visible, correctly-instanced grass in the live
 * OverworldScene with no console/page errors and a sane draw-call count.
 * Run: npx playwright test tests/e2e/procedural-grass.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage, startGame, goExterior, teleportPlayer, attachFullConsoleCapture } from './helpers';

test.use({ actionTimeout: 150_000, navigationTimeout: 60_000 });
test.setTimeout(300_000);

const SS = async (page: Page, name: string) => {
  try {
    await page.screenshot({ path: `tests/e2e/screenshots/procedural-grass-${name}.png`, timeout: 10_000 });
  } catch (e) {
    console.warn(`[procedural-grass.spec] screenshot '${name}' skipped: ${(e as Error).message}`);
  }
};

test.describe('Procedural grass (grassland batch 1)', () => {
  test('grass instances render on a grassland tile with no errors and a bounded draw-call count', async ({ page }) => {
    const { errors, all } = attachFullConsoleCapture(page);

    await loadPage(page);
    await startGame(page);
    await goExterior(page);

    const tile = await page.evaluate(() => (window as any).__game.findFirstGrasslandTile());
    expect(tile, 'No grassland tile found in generated overworld').toBeTruthy();

    await teleportPlayer(page, (tile as { x: number; z: number }).x, 5, (tile as { x: number; z: number }).z);
    await page.evaluate(() => (window as any).__game.forceTick(10));
    await page.waitForTimeout(300);
    await SS(page, '01-on-grassland');

    expect(errors, `Console/page errors: ${all.join('\n')}`).toHaveLength(0);

    const grassInfo = await page.evaluate(() => (window as any).__game.getGrassDebugInfo());
    expect(grassInfo.inScene, 'Grass mesh not in scene').toBe(true);
    expect(grassInfo.bladeCount, 'No grass blades placed on a grassland tile').toBeGreaterThan(0);

    // Regression guard against the "un-merged scatter caused sub-7fps" class of bug this
    // project has hit before (see OverworldScene.ts's mergeGroupMeshesByMaterial() comment) —
    // grass is one InstancedMesh (1 draw call), so total draw calls should stay well bounded
    // even with the rest of a loaded overworld scene's geometry.
    const perf = await page.evaluate(() => (window as any).__game.getPerfStats());
    expect(perf.drawCalls, `Unexpectedly high draw call count: ${perf.drawCalls}`).toBeLessThan(500);
  });
});
```

- [ ] **Step 5: Run the e2e verification spec**

Run: `npx playwright test tests/e2e/procedural-grass.spec.ts`
Expected: 1 passed. If it fails, read the failure message carefully:
- "No grassland tile found" → the generated overworld for the default seed has no grassland
  biome; rerun with a different seed by temporarily changing `startGame(page)`'s default seed
  in `tests/e2e/helpers.ts` is NOT the right fix (don't modify shared test infra for a one-off
  spec) — instead add a seed argument directly in this spec:
  `await startGame(page, 0xC0FFEE);` and retry.
- Console/page errors mentioning a GLSL compile failure → re-check the vertex/fragment shader
  strings from Task 3 for a typo; this is the exact class of bug this e2e spec exists to catch
  (unit tests only assert shader *string content*, never actual GPU compilation).
- `bladeCount` is 0 despite a grassland tile existing → check that `teleportPlayer`'s y-value
  (5) is reasonable for the tile's elevation, and that `forceTick(10)` actually advanced the
  game loop far enough to call `OverworldScene.update()` at least once with the new player
  position (10 ticks should be more than enough).

- [ ] **Step 6: Commit the e2e spec**

```bash
git add tests/e2e/procedural-grass.spec.ts
git commit -m "test: add procedural grass e2e verification spec

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 7: Run the full unit/integration test suite**

Run: `npx vitest run`
Expected: the same pre-existing baseline failures already established in this project's ongoing
verification history (`main.startup.smoke.test.ts`, `enemyLoader.test.ts`, `towerGenerator.test.ts`,
`talentSystem.test.ts`, `WaterMaterial.test.ts` — count varies run-to-run within a known small
range; `OverworldScene.chunk-scatter-alignment.test.ts`/`ResourceNodePlacer.test.ts` are known
sandbox-contention flakes — re-run either in isolation if they fail here), plus every new grass
test from Tasks 1-4 passing, and zero NEW failures beyond that established baseline set.

- [ ] **Step 8: Final `tsc` check**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1.

- [ ] **Step 9: Update the roadmap/progress doc**

Add a short entry to `docs/visual-progress.md` (this project's established visual-changes log)
under a new heading, following the existing heading style (`## Phase N — <Title>`):

```markdown

## Procedural Grass — Batch 1 (Grassland)

Wind-animated 3D grass blades (bezier-curved instanced geometry, SSS/AO shading, distance
fade) render within a 24-WU player-centered radius on grassland-biome tiles. Savanna/forest/
taiga/tundra grass is a planned follow-up batch — see
`docs/superpowers/specs/2026-08-31-procedural-grass-grassland-design.md`.
```

- [ ] **Step 10: Push to `main`**

```bash
git add docs/visual-progress.md
git commit -m "docs: note procedural grass batch 1 in visual-progress log

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
git push origin HEAD:main
```
