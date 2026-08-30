# Ground-Tile Texture Variety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every ground (non-road, non-water) terrain tile a real tileable surface texture —
reusing BlockKit's world-space-projected UV technique so it tiles seamlessly across tile
boundaries with zero new geometry — instead of today's flat single-vertex-color quad, killing
the "blocky patchwork" look at near-zero performance cost.

**Architecture:** New `src/world/TerrainTextures.ts` (mirrors the already-shipped
`RoadTextures.ts`) provides one real canvas texture per covered biome/feature variant.
`TerrainGeometryBuilder.ts` gains a parallel `groundGeometry` output (mirrors the already-shipped
`roadGeometry`) that covered tiles' top faces route into instead of the plain vertex-color
buffer, carrying a world-space-projected UV alongside the existing vertex color (preserved for
a tint-preserving `color * map` multiply). `OverworldScene._loadTerrainChunk()` gains one small
textured mesh per ground-variant present in a chunk (mirrors its existing road-variant mesh
loop) and folds their triangles into the same collider merge that already covers road variants.

**Tech Stack:** TypeScript, Vitest (jsdom canvas-stub convention already used by
`FactionBlockTextures.test.ts`/`RoadTextures.test.ts`), Three.js `CanvasTexture`/
`MeshStandardMaterial`, Rapier physics (collider derived from the same merged buffers).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-30-ground-tile-texture-variety-design.md`
  (approved 2026-08-30) — read this first; this plan implements it directly.
- **Texture-only, zero new geometry** — every textured tile keeps the exact same vertex
  positions/normals it has today; only the buffer it's routed into and its UV attribute change.
  No ground tile gets subdivided into sub-quads (see spec §2's rejected alternative).
- Covered variants (10): `beach`, `desert`, `savanna`, `grassland`, `forest`, `taiga`, `tundra`,
  `snow`, `mountain`, `river_bank`. Everything else (`ocean`, `deep_ocean`, `river`, `lake`,
  `river_ford`, and any future uncovered biome) stays on today's untextured vertex-color path,
  completely unchanged.
- Walls (the 4 vertical elevation-step faces) are never textured in this pass — always emitted
  via the existing `addFace()` into the base buffer, regardless of the tile's ground-texture
  variant.
- Every existing test in `tests/world/TerrainGeometryBuilder.test.ts` (~45 tests) must continue
  to pass **unchanged** — untextured tiles (water/river/lake/ford, and this plan's own new tests
  confirm uncovered biomes) must render byte-identical to today.
- After each task: run the task's targeted test file(s), then `npx tsc --noEmit` and confirm the
  error count matches the pre-existing baseline (144 errors) or better — never worse.

---

## File Structure

- **Modify** `src/world/buildings/FactionBlockTextures.ts` — export the two existing private
  helpers `_jitterPixels`/`_wrap` (add the `export` keyword only, no rename, no behavior
  change) so `TerrainTextures.ts` can reuse them instead of duplicating the pattern.
- **Create** `src/world/TerrainTextures.ts` — one real canvas texture per of the 10 covered
  variants; 8 newly authored (`beach`, `desert`, `savanna`, `grassland`, `forest`, `taiga`,
  `tundra`, `snow`), 2 reused as-is from the already-shipped `earthTexture()`/`graniteTexture()`
  (`river_bank`, `mountain`).
- **Create** `tests/world/TerrainTextures.test.ts` — structural-only tests (cache/shape/repeat
  assertions), matching `FactionBlockTextures.test.ts`'s existing convention.
- **Modify** `src/world/TerrainGeometryBuilder.ts` — new `GroundVariantGeometry` type, new
  `groundGeometry` output field, new `_groundTextureVariant()` + `addGroundFace()` helpers, new
  `GROUND_UV_TILE_WU` constant; all 3 top-face branches (flat/all-four-down, edge, ramp) gain a
  variant-routing check.
- **Modify** `tests/world/TerrainGeometryBuilder.test.ts` — new tests for variant routing, UV
  correctness, ramp-shape coverage, and wall-exclusion; existing tests untouched.
- **Modify** `src/scene/OverworldScene.ts` (`_loadTerrainChunk()`) — new ground-variant mesh
  loop (mirrors the existing road-variant loop) + collider-merge extension.

---

## Task 1: `TerrainTextures.ts` — the 10 ground texture variants

**Files:**
- Modify: `src/world/buildings/FactionBlockTextures.ts` (export `_jitterPixels`/`_wrap`)
- Create: `src/world/TerrainTextures.ts`
- Test: `tests/world/TerrainTextures.test.ts`

**Interfaces:**
- Produces: `terrainVariantTexture(variant: string): THREE.CanvasTexture`, exported from
  `src/world/TerrainTextures.ts`. Task 4 imports and calls this from `OverworldScene.ts`.
  `GROUND_TERRAIN_VARIANTS` (a `readonly string[]` of the 10 covered keys) also exported, for
  Task 2's `_groundTextureVariant()` membership check.

- [ ] **Step 1: Export the two private helpers in `FactionBlockTextures.ts`**

Find these two function declarations and add `export` in front of each — no other change:

```ts
export function _wrap(t: THREE.CanvasTexture, rx: number, ry: number): THREE.CanvasTexture {
```
```ts
export function _jitterPixels(g: CanvasRenderingContext2D, size: number, amp: number, tint: [number, number, number] = [1, 1, 0.7]): void {
```

- [ ] **Step 2: Run `npx tsc --noEmit`, confirm error count is 144 or fewer** (a pure `export`
  addition should never introduce a new error)

- [ ] **Step 3: Write failing structural tests for `TerrainTextures.ts`**

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { terrainVariantTexture, GROUND_TERRAIN_VARIANTS } from '@/world/TerrainTextures';

describe('terrainVariantTexture', () => {
  it('returns a distinct CanvasTexture for every covered variant', () => {
    const seen = new Set<THREE.CanvasTexture>();
    for (const v of GROUND_TERRAIN_VARIANTS) {
      const tex = terrainVariantTexture(v);
      expect(tex).toBeInstanceOf(THREE.CanvasTexture);
      expect(seen.has(tex)).toBe(false);
      seen.add(tex);
    }
  });

  it('lists exactly the 10 spec-covered variants', () => {
    expect([...GROUND_TERRAIN_VARIANTS].sort()).toEqual([
      'beach', 'desert', 'forest', 'grassland', 'mountain',
      'river_bank', 'savanna', 'snow', 'taiga', 'tundra',
    ]);
  });

  it('caches the underlying canvas across repeated calls for the same variant', () => {
    const a = terrainVariantTexture('grassland');
    const b = terrainVariantTexture('grassland');
    // Each call returns a fresh THREE.CanvasTexture wrapper (so independent
    // call sites can set repeat independently, matching RoadTextures.ts's
    // convention), but both must wrap the exact same underlying canvas.
    expect(a.image).toBe(b.image);
  });

  it('sets RepeatWrapping and the requested repeat factor', () => {
    const tex = terrainVariantTexture('desert');
    expect(tex.wrapS).toBe(THREE.RepeatWrapping);
    expect(tex.wrapT).toBe(THREE.RepeatWrapping);
  });
});
```

- [ ] **Step 4: Run the tests, confirm they fail** (module doesn't exist)

```bash
npx vitest run tests/world/TerrainTextures.test.ts
```

- [ ] **Step 5: Implement `src/world/TerrainTextures.ts`**

```ts
/**
 * TerrainTextures.ts — real tileable canvas textures for ground (non-road,
 * non-water) terrain tiles, sampled via world-space-projected UV so they
 * read as continuous surface detail across every tile boundary instead of
 * a stamped checkerboard (same technique as BlockKit.ts's buildings and
 * RoadTextures.ts's roads). See
 * docs/superpowers/specs/2026-08-30-ground-tile-texture-variety-design.md §3.1.
 *
 * `mountain` and `river_bank` reuse the already-shipped `graniteTexture()`/
 * `earthTexture()` factories as-is (bare rock and packed dirt already read
 * correctly at ground scale) — only the other 8 variants get new canvases.
 */

import * as THREE from 'three';
import { _wrap, _jitterPixels, earthTexture, graniteTexture } from './buildings/FactionBlockTextures';

export const GROUND_TERRAIN_VARIANTS = [
  'beach', 'desert', 'savanna', 'grassland', 'forest',
  'taiga', 'tundra', 'snow', 'mountain', 'river_bank',
] as const;

const _canvases = new Map<string, HTMLCanvasElement>();

function _newCanvas(): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  return { c, g };
}

function _buildBeachCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#e8dcae';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 18, [1, 0.95, 0.7]);
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = `rgba(200,190,160,${0.15 + Math.random() * 0.15})`;
    g.beginPath();
    g.ellipse(x, y, 3 + Math.random() * 4, 2 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = `rgba(110,95,65,${0.2 + Math.random() * 0.2})`;
    g.beginPath();
    g.arc(x, y, 1 + Math.random() * 1.5, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function _buildDesertCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#cc9a52';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 22, [1, 0.9, 0.55]);
  g.strokeStyle = 'rgba(140,95,40,0.30)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    let x = Math.random() * 256, y = Math.random() * 256;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (Math.random() - 0.5) * 36;
      y += (Math.random() - 0.5) * 36;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

function _buildSavannaCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#b8a05c';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 20, [1, 0.92, 0.55]);
  g.strokeStyle = 'rgba(90,75,35,0.35)';
  g.lineWidth = 1.4;
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 4, y - 6 - Math.random() * 8);
    g.stroke();
  }
  return c;
}

function _buildGrasslandCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#4f8a3a';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 16, [0.8, 1, 0.6]);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const dark = Math.random() < 0.5;
    g.strokeStyle = dark ? 'rgba(60,110,40,0.40)' : 'rgba(120,170,80,0.30)';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 3, y - 5 - Math.random() * 6);
    g.stroke();
  }
  return c;
}

function _buildForestCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#3e5a2c';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 20, [0.9, 1, 0.6]);
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const brown = Math.random() < 0.5;
    g.fillStyle = brown ? `rgba(90,70,40,${0.15 + Math.random() * 0.15})` : `rgba(60,90,45,${0.15 + Math.random() * 0.15})`;
    g.beginPath();
    g.ellipse(x, y, 4 + Math.random() * 5, 2.5 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function _buildTaigaCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#374a34';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 14, [0.85, 1, 0.7]);
  g.strokeStyle = 'rgba(30,40,25,0.35)';
  g.lineWidth = 1;
  for (let i = 0; i < 110; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6);
    g.stroke();
  }
  return c;
}

function _buildTundraCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#8a978c';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 14, [0.9, 1, 1]);
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = `rgba(230,235,230,${0.12 + Math.random() * 0.13})`;
    g.beginPath();
    g.arc(x, y, 1 + Math.random() * 2, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function _buildSnowCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#eef2f6';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 10, [0.85, 0.9, 1]);
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = `rgba(190,205,220,${0.08 + Math.random() * 0.1})`;
    g.beginPath();
    g.ellipse(x, y, 8 + Math.random() * 14, 5 + Math.random() * 8, Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function _canvasFor(variant: string): HTMLCanvasElement {
  let c = _canvases.get(variant);
  if (c) return c;
  switch (variant) {
    case 'beach':     c = _buildBeachCanvas(); break;
    case 'desert':    c = _buildDesertCanvas(); break;
    case 'savanna':   c = _buildSavannaCanvas(); break;
    case 'grassland': c = _buildGrasslandCanvas(); break;
    case 'forest':    c = _buildForestCanvas(); break;
    case 'taiga':     c = _buildTaigaCanvas(); break;
    case 'tundra':    c = _buildTundraCanvas(); break;
    case 'snow':      c = _buildSnowCanvas(); break;
    default:          c = _buildGrasslandCanvas(); break; // unreachable via terrainVariantTexture's own switch, kept for type safety
  }
  _canvases.set(variant, c);
  return c;
}

/** Real tileable canvas texture for a covered ground variant (see
 *  GROUND_TERRAIN_VARIANTS). `repX`/`repY` default to 1 since
 *  TerrainGeometryBuilder's world-space UV projection already carries the
 *  tiling period — callers only need to override for deliberate retuning. */
export function terrainVariantTexture(variant: string, repX = 1, repY = 1): THREE.CanvasTexture {
  if (variant === 'mountain')   return _wrap(graniteTexture(1, 1), repX, repY);
  if (variant === 'river_bank') return _wrap(earthTexture(1, 1), repX, repY);
  return _wrap(new THREE.CanvasTexture(_canvasFor(variant)), repX, repY);
}
```

- [ ] **Step 6: Run the tests, confirm all pass**

```bash
npx vitest run tests/world/TerrainTextures.test.ts
```

- [ ] **Step 7: Run `npx tsc --noEmit`, confirm baseline (144 or fewer)**

- [ ] **Step 8: Commit**

```bash
git add src/world/buildings/FactionBlockTextures.ts src/world/TerrainTextures.ts tests/world/TerrainTextures.test.ts
git commit -m "feat: add TerrainTextures.ts with 10 ground texture variants"
```

---

## Task 2: `GroundVariantGeometry` + `addGroundFace()` + flat/all-four-down routing

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Modify: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `GROUND_TERRAIN_VARIANTS` from Task 1's `src/world/TerrainTextures.ts` (just the
  variant-name list — the actual texture objects aren't touched by this module, only by
  `OverworldScene.ts` in Task 4).
- Produces: `GroundVariantGeometry` interface and a new `groundGeometry` field on
  `TerrainGeometryData` (the return type of `buildTerrainGeometryData()`), consumed by Task 3
  (more routing) and Task 4 (`OverworldScene.ts`'s mesh/collider loop).

- [ ] **Step 1: Write a failing test for flat-tile variant routing**

Add to `tests/world/TerrainGeometryBuilder.test.ts` (find the top `describe('buildTerrainGeometryData', ...)` block and add a new sibling describe below it):

```ts
describe('buildTerrainGeometryData — ground texture variant routing (Phase 4a)', () => {
  it('routes a flat grassland tile into groundGeometry.grassland, not the base buffer', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'grassland', elevation: 0 });
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 1, 1);

    expect(data.groundGeometry.grassland).toBeDefined();
    expect(data.groundGeometry.grassland!.indices.length).toBe(6); // one quad = 2 triangles
    // The base buffer must stay empty for this tile — no top face duplicated there.
    expect(data.indices.length).toBe(0);
  });

  it('computes world-space-projected UV on the routed tile', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'grassland', elevation: 0 });
    // T (tile size) = 2 in this call, so this tile spans world X/Z [0,2).
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1);
    const uvs = data.groundGeometry.grassland!.uvs;
    // 4 vertices x 2 floats = 8 values; just assert they vary across the
    // tile's footprint (not all identical, which would mean UV is broken/flat).
    const uSet = new Set<number>();
    for (let i = 0; i < uvs.length; i += 2) uSet.add(uvs[i]!);
    expect(uSet.size).toBeGreaterThan(1);
  });

  it('leaves an uncovered biome (ocean) on the untextured base buffer, byte-identical to today', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'ocean', elevation: 0, waterDepth: 1.0 });
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 1, 1);

    expect(data.groundGeometry.ocean).toBeUndefined();
    expect(data.indices.length).toBe(6); // top face in the base buffer, as before
  });
});
```

- [ ] **Step 2: Run the tests, confirm failure**

```bash
npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "ground texture variant routing"
```

Expected: FAIL — `data.groundGeometry` is `undefined` (property doesn't exist yet).

- [ ] **Step 3: Add `GROUND_UV_TILE_WU`, `GroundVariantGeometry`, `groundGeometry` buffer,
  `_groundTextureVariant()`, and `addGroundFace()` to `src/world/TerrainGeometryBuilder.ts`**

Add near the top of the file, alongside the existing `ROAD_UV_TILE_WU` constant (find it via
`grep -n "ROAD_UV_TILE_WU" src/world/TerrainGeometryBuilder.ts` — add this constant right after
it):

```ts
/** World-space UV tiling period (WU) for ground textures — close to one
 *  tile's own footprint (T=2 WU) so the texture shows real per-tile detail
 *  without an obviously-repeating wallpaper look at typical camera
 *  distance. See docs/superpowers/specs/2026-08-30-ground-tile-texture-variety-design.md §3.1. */
const GROUND_UV_TILE_WU = 2.5;
```

Add the new exported interface near `RoadVariantGeometry`'s own definition (find it via `grep -n
"interface RoadVariantGeometry" src/world/TerrainGeometryBuilder.ts`):

```ts
/** One ground-texture variant's own geometry buffers — mirrors
 *  RoadVariantGeometry, plus a `colors` array since ground needs
 *  per-vertex color preserved for the tint-preserving `color * map`
 *  multiply (roads don't carry per-vertex color today). */
export interface GroundVariantGeometry {
  positions: number[]; normals: number[]; colors: number[]; uvs: number[]; indices: number[];
}
```

Add `groundGeometry` to the `TerrainGeometryData` return type (find its definition, likely near
`RoadVariantGeometry`'s usage in a `roadGeometry: Record<string, RoadVariantGeometry>` field):

```ts
groundGeometry: Record<string, GroundVariantGeometry>;
```

Inside `buildTerrainGeometryData()`, alongside the existing `const roadGeometry: Record<string,
RoadVariantGeometry> = {};` declaration, add:

```ts
const groundGeometry: Record<string, GroundVariantGeometry> = {};
```

Add the two new helper functions right after the existing `addRoadFace` closure definition:

```ts
/** Ground-texture variant key for a cell, or null to keep today's
 *  untextured vertex-color-only path. Priority order matches the existing
 *  biomeRgb selection chain just below in this function — see
 *  docs/superpowers/specs/2026-08-30-ground-tile-texture-variety-design.md §3.2. */
const _groundTextureVariant = (cell: WorldCell): string | null => {
  if (cell.biome === 'ocean' || cell.biome === 'deep_ocean') return null;
  if (cell.feature === 'river' || cell.feature === 'lake' || cell.feature === 'river_ford') return null;
  if (cell.feature === 'river_bank') return 'river_bank';
  if (cell.biome === 'beach') return 'beach';
  return (GROUND_TERRAIN_VARIANTS as readonly string[]).includes(cell.biome) ? cell.biome : null;
};

/** Append a quad face into a ground-variant's own buffers (created lazily
 *  on first use), with world-space-projected planar UV (same technique as
 *  addRoadFace) plus the tile's vertex color preserved for the
 *  tint-preserving color*map multiply. */
const addGroundFace = (
  variant: string,
  v0: [number, number, number], v1: [number, number, number],
  v2: [number, number, number], v3: [number, number, number],
  nx: number, ny: number, nz: number,
  r: number, g: number, b: number,
): void => {
  let geo = groundGeometry[variant];
  if (!geo) { geo = { positions: [], normals: [], colors: [], uvs: [], indices: [] }; groundGeometry[variant] = geo; }
  const base = geo.positions.length / 3;
  geo.positions.push(...v0, ...v1, ...v2, ...v3);
  geo.normals.push(nx, ny, nz,  nx, ny, nz,  nx, ny, nz,  nx, ny, nz);
  geo.colors.push(r, g, b,  r, g, b,  r, g, b,  r, g, b);
  for (const [vx, , vz] of [v0, v1, v2, v3]) {
    geo.uvs.push(vx / GROUND_UV_TILE_WU, vz / GROUND_UV_TILE_WU);
  }
  geo.indices.push(base, base + 1, base + 2,  base, base + 2, base + 3);
};
```

Add the import at the top of the file:

```ts
import { GROUND_TERRAIN_VARIANTS } from './TerrainTextures';
```

Add `groundGeometry` to the function's final `return { ... }` statement (find it, likely
`return { positions: pos, normals: nrm, colors: clr, indices: idx, roadGeometry };`):

```ts
return { positions: pos, normals: nrm, colors: clr, indices: idx, roadGeometry, groundGeometry };
```

- [ ] **Step 4: Wire routing into the flat/all-four-down branch only**

Find the existing flat-tile branch:

```ts
      } else if (shape === 'flat' || shape === 'all-four-down' || !rampEligible) {
        // Identical to pre-ramp behavior: jitter-only positions, fixed up-normal.
        addFace(
          [wx, wy + jSW, wz], [wx, wy + jNW, wz1], [wx1, wy + jNE, wz1], [wx1, wy + jSE, wz],
          0, 1, 0,  tr, tg, tb,
        );
```

Replace with:

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

(This `hasRoadCoverage`/edge/ramp branches stay untouched in this task — Task 3 handles them.
Road-covered tiles never reach this branch at all, since `hasRoadCoverage` is checked earlier
in the `if`/`else if` chain, so there's no interaction to worry about here.)

- [ ] **Step 5: Run the tests, confirm they pass**

```bash
npx vitest run tests/world/TerrainGeometryBuilder.test.ts
```

Confirm all ~48 tests pass (45 existing + 3 new) — existing tests must be completely unaffected
since only flat/all-four-down ground tiles with a *covered* biome change buffers; anything not
covered (ocean/river/lake/ford, or any test using a biome outside the 10) still produces
byte-identical output via the untouched `else` branch.

- [ ] **Step 6: Run `npx tsc --noEmit`, confirm baseline**

- [ ] **Step 7: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "feat: route flat ground tiles into textured groundGeometry buffers"
```

---

## Task 3: Wire the edge and ramp (single-corner/outer-corner/saddle) branches

**Files:**
- Modify: `src/world/TerrainGeometryBuilder.ts`
- Modify: `tests/world/TerrainGeometryBuilder.test.ts`

**Interfaces:**
- Consumes: `addGroundFace()`/`_groundTextureVariant()` from Task 2 (same file, already defined).

- [ ] **Step 1: Write failing tests for edge and ramp routing**

Add to the same `describe('buildTerrainGeometryData — ground texture variant routing (Phase 4a)', ...)`
block from Task 2. These reuse the exact same proven corner fixtures as the existing "Edge-shaped
tile"/"Single-corner-shaped tile" tests earlier in this same file (search for `renders an
Edge-shaped tile` / `renders a Single-corner-shaped tile` to see the originals) — only the biome
changes (to `grassland`, so this tile actually has a covered ground-texture variant) and the
assertions target `groundGeometry` instead of the base buffer:

```ts
  it('routes an edge-shaped (planar tilt) grassland tile into groundGeometry too', () => {
    const wg = new WorldGrid(3, 3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) wg.set(c, r, { elevation: 3, biome: 'grassland' });
    wg.set(0, 1, { elevation: 2, biome: 'grassland' }); // west neighbor of tile (1,1), 1 level lower
    const data = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1, 1, 1, 1, 1);
    expect(data.groundGeometry.grassland).toBeDefined();
    expect(data.groundGeometry.grassland!.normals).toHaveLength(12); // 1 planar quad, 4 verts
    const topFaceNy = data.groundGeometry.grassland!.normals[1]!;
    expect(topFaceNy).toBeLessThan(0.999); // genuinely tilted, not flat
    expect(topFaceNy).toBeGreaterThan(0);
  });

  it('routes a single-corner (non-planar) grassland tile into groundGeometry too', () => {
    const wg = new WorldGrid(4, 3);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) wg.set(c, r, { elevation: 3, biome: 'grassland' });
    wg.set(2, 2, { elevation: 2, biome: 'grassland' }); // isolates a single NE-corner dip on tile (1,1)
    const data = buildTerrainGeometryData(wg, 4, 4, 1, 1, 2, 1, 1, 1, 1, 1);
    expect(data.groundGeometry.grassland).toBeDefined();
    // Non-planar ramp shapes emit 6 vertices (2 explicit triangles) per tile.
    expect(data.groundGeometry.grassland!.positions.length / 3).toBe(6);
    const tri1Normal = data.groundGeometry.grassland!.normals.slice(0, 3);
    const tri2Normal = data.groundGeometry.grassland!.normals.slice(9, 12);
    expect(tri1Normal).not.toEqual(tri2Normal);
  });
```

- [ ] **Step 2: Run the tests, confirm failure**

```bash
npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "routes an edge-shaped"
npx vitest run tests/world/TerrainGeometryBuilder.test.ts -t "routes a single-corner"
```

Expected: FAIL — `data.groundGeometry.grassland` is `undefined` (edge/ramp branches don't route
into it yet, only the flat/all-four-down branch from Task 2 does).

- [ ] **Step 3: Wire the edge branch**

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
        addFace(v0, v1, v2, v3, n[0], n[1], n[2], tr, tg, tb);
```

Replace the final `addFace` call:

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

- [ ] **Step 4: Wire the single-corner/outer-corner/saddle branch**

Find:

```ts
      } else {
        // single-corner / outer-corner / saddle: non-planar, 2 explicit
        // triangles with independently-computed per-triangle normals.
        const corners = {
          sw: [wx,  swY + jSW, wz]  as [number, number, number],
          nw: [wx,  nwY + jNW, wz1] as [number, number, number],
          ne: [wx1, neY + jNE, wz1] as [number, number, number],
          se: [wx1, seY + jSE, wz]  as [number, number, number],
        };
        const { positions: rampPos, normals: rampNrm } = buildQuadFace(corners, diagonal);
        const base = pos.length / 3;
        pos.push(...rampPos);
        nrm.push(...rampNrm);
        for (let i = 0; i < 6; i++) clr.push(tr, tg, tb);
        idx.push(base, base + 1, base + 2, base + 3, base + 4, base + 5);
      }
```

Replace with:

```ts
      } else {
        // single-corner / outer-corner / saddle: non-planar, 2 explicit
        // triangles with independently-computed per-triangle normals.
        const corners = {
          sw: [wx,  swY + jSW, wz]  as [number, number, number],
          nw: [wx,  nwY + jNW, wz1] as [number, number, number],
          ne: [wx1, neY + jNE, wz1] as [number, number, number],
          se: [wx1, seY + jSE, wz]  as [number, number, number],
        };
        const { positions: rampPos, normals: rampNrm } = buildQuadFace(corners, diagonal);
        const groundVariant = _groundTextureVariant(cell);
        if (groundVariant !== null) {
          let geo = groundGeometry[groundVariant];
          if (!geo) { geo = { positions: [], normals: [], colors: [], uvs: [], indices: [] }; groundGeometry[groundVariant] = geo; }
          const base = geo.positions.length / 3;
          geo.positions.push(...rampPos);
          geo.normals.push(...rampNrm);
          for (let i = 0; i < 6; i++) geo.colors.push(tr, tg, tb);
          for (let i = 0; i < rampPos.length; i += 3) {
            geo.uvs.push(rampPos[i]! / GROUND_UV_TILE_WU, rampPos[i + 2]! / GROUND_UV_TILE_WU);
          }
          geo.indices.push(base, base + 1, base + 2, base + 3, base + 4, base + 5);
        } else {
          const base = pos.length / 3;
          pos.push(...rampPos);
          nrm.push(...rampNrm);
          for (let i = 0; i < 6; i++) clr.push(tr, tg, tb);
          idx.push(base, base + 1, base + 2, base + 3, base + 4, base + 5);
        }
      }
```

- [ ] **Step 5: Run the tests, confirm all pass**

```bash
npx vitest run tests/world/TerrainGeometryBuilder.test.ts
```

- [ ] **Step 6: Run `npx tsc --noEmit`, confirm baseline**

- [ ] **Step 7: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts
git commit -m "feat: route edge and ramp-shaped ground tiles into textured groundGeometry"
```

---

## Task 4: `OverworldScene.ts` — textured meshes + collider merge

**Files:**
- Modify: `src/scene/OverworldScene.ts`

**Interfaces:**
- Consumes: `data.groundGeometry` (Tasks 2-3) and `terrainVariantTexture()` (Task 1).

- [ ] **Step 1: Add the import**

Find `OverworldScene.ts`'s existing `import { roadVariantTexture } from '@/world/RoadTextures';`
(or similar) and add alongside it:

```ts
import { terrainVariantTexture } from '@/world/TerrainTextures';
```

- [ ] **Step 2: Add the ground-variant mesh loop**

In `_loadTerrainChunk()`, find the existing road-variant mesh loop:

```ts
    const roadMeshes: THREE.Mesh[] = [];
    for (const [variant, rg] of Object.entries(roadGeometry)) {
      if (rg.indices.length === 0) continue;
      const roadGeo = new THREE.BufferGeometry();
      roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(rg.positions, 3));
      roadGeo.setAttribute('normal',   new THREE.Float32BufferAttribute(rg.normals, 3));
      roadGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(rg.uvs, 2));
      roadGeo.setIndex(rg.indices);
      const roadMesh = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({
        map: roadVariantTexture(variant), roughness: 0.92, metalness: 0,
      }));
      if (this._isInScene) this.scene.add(roadMesh);
      roadMeshes.push(roadMesh);
    }
```

Add right after it (still inside `_loadTerrainChunk()`, before the collider-building block):

```ts
    const groundMeshes: THREE.Mesh[] = [];
    for (const [variant, gg] of Object.entries(groundGeometry)) {
      if (gg.indices.length === 0) continue;
      const groundGeo = new THREE.BufferGeometry();
      groundGeo.setAttribute('position', new THREE.Float32BufferAttribute(gg.positions, 3));
      groundGeo.setAttribute('normal',   new THREE.Float32BufferAttribute(gg.normals, 3));
      groundGeo.setAttribute('color',    new THREE.Float32BufferAttribute(gg.colors, 3));
      groundGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(gg.uvs, 2));
      groundGeo.setIndex(gg.indices);
      const groundMesh = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
        map: terrainVariantTexture(variant), vertexColors: true, roughness: 0.95, metalness: 0,
      }));
      if (this._isInScene) this.scene.add(groundMesh);
      groundMeshes.push(groundMesh);
    }
```

- [ ] **Step 3: Extend the collider merge**

Find the existing collider-merge block:

```ts
    const colliderPositions = positions.slice();
    const colliderIndices   = indices.slice();
    for (const rg of Object.values(roadGeometry)) {
      const vertOffset = colliderPositions.length / 3;
      colliderPositions.push(...rg.positions);
      for (const i of rg.indices) colliderIndices.push(i + vertOffset);
    }
```

Replace with:

```ts
    const colliderPositions = positions.slice();
    const colliderIndices   = indices.slice();
    for (const rg of Object.values(roadGeometry)) {
      const vertOffset = colliderPositions.length / 3;
      colliderPositions.push(...rg.positions);
      for (const i of rg.indices) colliderIndices.push(i + vertOffset);
    }
    for (const gg of Object.values(groundGeometry)) {
      const vertOffset = colliderPositions.length / 3;
      colliderPositions.push(...gg.positions);
      for (const i of gg.indices) colliderIndices.push(i + vertOffset);
    }
```

- [ ] **Step 4: Wire `groundMeshes` into the chunk lifecycle (mirrors `roadMeshes` exactly, at 5 exact spots)**

**4a.** `TerrainChunkData` interface — find:

```ts
interface TerrainChunkData {
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody | null;
  scatter: THREE.Group;
  colliders: RAPIER.RigidBody[];
  /** Textured road sub-tile surface meshes (one per texture variant present
   *  in this chunk) — built alongside the main terrain mesh from the same
   *  buildTerrainGeometryData() call's roadGeometry output, sharing this
   *  chunk's own load/unload/enter/exit lifecycle. See RoadPathSampler.ts /
   *  docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md Phase 2. */
  roadMeshes: THREE.Mesh[];
}
```

Replace with:

```ts
interface TerrainChunkData {
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody | null;
  scatter: THREE.Group;
  colliders: RAPIER.RigidBody[];
  /** Textured road sub-tile surface meshes (one per texture variant present
   *  in this chunk) — built alongside the main terrain mesh from the same
   *  buildTerrainGeometryData() call's roadGeometry output, sharing this
   *  chunk's own load/unload/enter/exit lifecycle. See RoadPathSampler.ts /
   *  docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md Phase 2. */
  roadMeshes: THREE.Mesh[];
  /** Textured ground surface meshes (one per ground-texture variant present
   *  in this chunk) — built alongside roadMeshes from the same
   *  buildTerrainGeometryData() call's groundGeometry output, sharing this
   *  chunk's own load/unload/enter/exit lifecycle. See TerrainTextures.ts /
   *  docs/superpowers/specs/2026-08-30-ground-tile-texture-variety-design.md. */
  groundMeshes: THREE.Mesh[];
}
```

**4b.** `enter()` — find:

```ts
    for (const { mesh, body, scatter, colliders, roadMeshes } of this._terrainChunkData.values()) {
      this.scene.add(mesh);
      body?.setEnabled(true);
      this.scene.add(scatter);
      for (const c of colliders) c.setEnabled(true);
      for (const rm of roadMeshes) this.scene.add(rm);
    }
```

Replace with:

```ts
    for (const { mesh, body, scatter, colliders, roadMeshes, groundMeshes } of this._terrainChunkData.values()) {
      this.scene.add(mesh);
      body?.setEnabled(true);
      this.scene.add(scatter);
      for (const c of colliders) c.setEnabled(true);
      for (const rm of roadMeshes) this.scene.add(rm);
      for (const gm of groundMeshes) this.scene.add(gm);
    }
```

**4c.** `exit()` — find:

```ts
    for (const { mesh, body, scatter, colliders, roadMeshes } of this._terrainChunkData.values()) {
      this.scene.remove(mesh);
      body?.setEnabled(false);
      this.scene.remove(scatter);
      for (const c of colliders) c.setEnabled(false);
      for (const rm of roadMeshes) this.scene.remove(rm);
    }
```

Replace with:

```ts
    for (const { mesh, body, scatter, colliders, roadMeshes, groundMeshes } of this._terrainChunkData.values()) {
      this.scene.remove(mesh);
      body?.setEnabled(false);
      this.scene.remove(scatter);
      for (const c of colliders) c.setEnabled(false);
      for (const rm of roadMeshes) this.scene.remove(rm);
      for (const gm of groundMeshes) this.scene.remove(gm);
    }
```

**4d.** `_loadTerrainChunk()`'s returned chunk-data object — find:

```ts
    const data: TerrainChunkData = { mesh, body, scatter, colliders, roadMeshes };
```

Replace with:

```ts
    const data: TerrainChunkData = { mesh, body, scatter, colliders, roadMeshes, groundMeshes };
```

**4e.** `_unloadTerrainChunk()`'s disposal loop — find:

```ts
    for (const rm of data.roadMeshes) {
      this.scene.remove(rm);
      rm.geometry.dispose();
      // The material instance is per-mesh (not shared) and safe to
      // dispose; the texture it references IS shared/cached across many
      // chunks (RoadTextures.ts's own module-level cache) and must NOT be
      // disposed here — Material.dispose() only releases the material
      // itself, never textures it references.
      (rm.material as THREE.Material).dispose();
    }
```

Replace with:

```ts
    for (const rm of data.roadMeshes) {
      this.scene.remove(rm);
      rm.geometry.dispose();
      // The material instance is per-mesh (not shared) and safe to
      // dispose; the texture it references IS shared/cached across many
      // chunks (RoadTextures.ts's own module-level cache) and must NOT be
      // disposed here — Material.dispose() only releases the material
      // itself, never textures it references.
      (rm.material as THREE.Material).dispose();
    }

    for (const gm of data.groundMeshes) {
      this.scene.remove(gm);
      gm.geometry.dispose();
      // Same reasoning as roadMeshes above: the material is per-mesh and
      // safe to dispose, but the texture it references is shared/cached
      // across chunks (TerrainTextures.ts's own module-level canvas cache)
      // and must NOT be disposed here.
      (gm.material as THREE.Material).dispose();
    }
```

- [ ] **Step 5: Run `npx tsc --noEmit`, confirm baseline**

- [ ] **Step 6: Run the existing terrain-chunk test suite**

```bash
npx vitest run tests/scene/OverworldScene.chunk-terrain-alignment.test.ts tests/scene/OverworldScene.chunk-collider-streaming.test.ts tests/scene/OverworldScene.chunk-scatter-alignment.test.ts tests/scene/OverworldScene.drawcall-batching.test.ts
```

Confirm all pass — these exercise chunk load/unload and collider correctness and must not
regress now that `groundGeometry` triangles are folded into the collider merge.

- [ ] **Step 7: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "feat: render textured ground meshes per chunk, extend collider merge"
```

---

## Task 5: Full regression, perf check, live verification, ship

**Files:** none (verification + rollout only)

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Confirm the exact same 12 pre-existing baseline failures (`main.startup.smoke.test.ts` ×3,
`enemyLoader.test.ts` ×3, `towerGenerator.test.ts` ×2, `talentSystem.test.ts` ×3,
`WaterMaterial.test.ts` ×1) — zero new failures. If `ResourceNodePlacer.test.ts` shows a
failure, re-run it in isolation before concluding it's a real regression (this suite has shown a
one-off sandbox flake before, unrelated to code changes — see Phase 3's rollout notes).

- [ ] **Step 2: Run `npx tsc --noEmit`, confirm error count is at or below the 144 baseline**

- [ ] **Step 3: Honest perf check**

Compare chunk-build time before/after this plan's changes, same methodology as Phase 2 (a
temporary `git worktree` at the commit before Task 1, running the same benchmark script/timing
harness if one exists from Phase 2's own verification, or a simple `console.time` around
`buildTerrainGeometryData()` for a representative chunk at `worldSize: 512`). Report the real
number in the rollout writeup — do not downplay any measured regression, matching this project's
established honesty precedent.

- [ ] **Step 4: Attempt live/manual verification**

Using the Playwright + dev server workflow established in prior phases (check `ps aux | grep
chrom` and kill stale processes first, given this sandbox's documented history of browser-
automation hangs): generate a world, take a screenshot, confirm visible surface texture detail
on grass/forest/desert tiles (not just a flat color), confirm no new console errors, confirm
walking around still works (no collider regression — the physics fix in Task 4 is the
highest-risk change in this plan). If browser automation is unavailable or hangs beyond a
reasonable wait, fall back to reporting this gap explicitly rather than blocking completion on
it, per this project's established precedent.

- [ ] **Step 5: Update the roadmap doc**

In `docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md`'s Phase 8 section ("Ground
texture wiring"), mark the ground-texture-wiring bullet DONE with a technical writeup mirroring
Phases 2/3's style (what shipped, what was deferred — biome-transition blending, textured walls,
textured water-biome ground, literal sub-tile subdivision — and the perf/manual-verification
results from Steps 3-4).

- [ ] **Step 6: Commit and push to `main`**

```bash
git add docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md
git commit -m "docs: mark ground-texture wiring DONE (Phase 4a)"
git push origin HEAD:main
```
