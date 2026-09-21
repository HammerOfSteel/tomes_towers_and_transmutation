# Implementation Plan: Procedural Nature-Asset Kit (Sub-task 1.2)

**Spec:** `docs/superpowers/specs/2026-09-21-procedural-nature-asset-kit-design.md`
**Research:** `docs/superpowers/specs/2026-09-21-procedural-nature-asset-kit-research.md`
**Process:** `.agents/skills/research-driven-world-polish/SKILL.md`

## Overview

Replace `OverworldScene`'s ~10 bespoke, per-archetype tree/rock/bush builder
methods with a **part-library + declarative recipe** system, add **3 texture
families** (bark / foliage / rock-facet) in place of the single
`makeMottledCanvasTexture()` used everywhere today, and move **visual**
rendering of trees/rocks/bushes from per-object `THREE.Mesh` children merged
per chunk (`MeshMergeUtils`) to **player-radius `THREE.InstancedMesh` fields**
that mirror `GrassField.ts`'s existing architecture exactly.

**Critical constraint surfaced during planning (not fully explicit in the
spec, resolved here — see "Physics/visual position parity" below):**
`_loadTerrainChunk()` builds tree/rock Rapier ball colliders by walking
`_buildChunkScatter()`'s returned `THREE.Group` for children tagged
`userData.scatterKind === 'tree' | 'rock'` (with `userData.scatterRadius` for
rocks). Trees/rocks/bushes today get their positions from a **per-chunk,
chunk-seed-derived `poissonDisk()` call** (`mulberry32((this._seed ^ MAGIC) ^
(coord.cx * P1) ^ (coord.cz * P2))`), NOT from a continuous/global placement
function like `selectGrassPlacements()`. If the new player-radius visual path
invented a different (e.g. grid-jitter) placement algorithm, visual trees
would render in different world positions than their own invisible physics
colliders — trees floating away from where the player actually collides with
them. This plan preserves position parity by **extracting the existing
per-chunk poisson-disk position generation into a shared, testable function**
that both the (unchanged) collider path and the new instancing path call
identically for the same chunk coordinate.

Scope explicitly excludes (per approved spec): new nature-asset categories,
full L-system/space-colonization/Weber-Penn recursive generators,
rock-destruction gameplay, and any change to `NatureAssetDNA.ts`'s biome
tables or `ScatterRules.ts`'s legality rules.

## Physics/visual position parity (read before Task 3)

- `selectNatureScatterPoints(coord, kind, seed)` (new, pure) reproduces
  **exactly** what `_buildChunkScatter()`/`_buildChunkBushes()` do today:
  same `chunkWorldSize`, same origin math via `_chunkGridOrigin()`, same
  `mulberry32` seed formula, same `poissonDisk()` minDist per kind (tree
  5.5, rock 8, bush 3.2 + the existing 0.35 acceptance thinning), same
  `isScatterAllowed()` filter, same inner/outer radius exclusions.
- The new player-radius visual path (`NaturePropManager`) determines which
  chunk coordinates overlap `[playerX-radius, playerX+radius] ×
  [playerZ-radius, playerZ+radius]` (using `worldToChunkCoord()` on the four
  corners, matching `ChunkManager.ts`'s existing conventions) and calls
  `selectNatureScatterPoints()` once per overlapping chunk coordinate — i.e.
  it **regenerates** each chunk's deterministic point set on demand,
  independent of whether that chunk is actually loaded in `ChunkManager`.
  This is still "not tied to ChunkManager's loaded/unloaded bookkeeping" (no
  add/remove slot management) while guaranteeing identical positions to
  whatever collider a loaded chunk built.
- `_buildChunkScatter()`/`_buildChunkBushes()` are refactored to call
  `selectNatureScatterPoints()` too (single source of truth), instead of
  inlining their own `poissonDisk()` calls — this is the change that makes
  drift structurally impossible instead of merely documented.

## File structure

**New files:**
- `src/world/NaturePartPools.ts` — geometry-variant factories (trunk,
  branch-arm, canopy-blob, rock-chunk) + lazy pool cache.
- `src/world/NatureAssetRecipes.ts` — declarative archetype recipes +
  `assembleFromRecipe()`.
- `src/world/NatureScatterPoints.ts` — `selectNatureScatterPoints()` (the
  shared chunk-scoped position generator described above).
- `src/world/NaturePropField.ts` — `NaturePropField` class (one
  `InstancedMesh` per part×geometry-variant×material-variant combo),
  `selectNaturePropPlacements()`, `packNaturePropInstanceBuffers()|` shared
  types, and `NaturePropManager` (owns all `NaturePropField`s, mirrors
  `_grassFields` ownership).
- `tests/world/NaturePartPools.test.ts`
- `tests/world/NatureAssetRecipes.test.ts`
- `tests/world/NatureScatterPoints.test.ts`
- `tests/world/NaturePropField.test.ts`

**Modified files:**
- `src/world/NatureAssetBuilder.ts` — add `makeBarkCanvasTexture()`,
  `makeRockFacetCanvasTexture()` (siblings of the kept
  `makeMottledCanvasTexture()`).
- `tests/world/NatureAssetBuilder.test.ts` — tests for the 2 new factories.
- `src/scene/OverworldScene.ts` —
  - `_buildChunkScatter()`/`_buildChunkBushes()` refactored to call
    `selectNatureScatterPoints()` (Task 3) instead of inline `poissonDisk()`.
  - The ~10 bespoke `_build*Tree()`/`_makeRock()`/`_makeBush()` methods and
    their `_pooledMaterial()`-per-kind material calls are **removed**;
    replaced by `assembleFromRecipe()` calls feeding `NaturePropManager`.
  - Collider-producing code path in `_buildChunkScatter()` now creates
    lightweight invisible placeholder `Object3D`s (position +
    `userData.scatterKind`/`scatterRadius` only, no geometry) instead of full
    visual meshes, since visuals now render through `NaturePropManager`.
  - `_grassFields`-style wiring added for a new `_natureProps:
    NaturePropManager` field: constructed in `enter()`, added/removed from
    scene, `.update(pos.x, pos.z)` called in the same per-frame block as
    `GrassField.update()`, disposed in `exit()`.
- `tests/scene/OverworldScene.test.ts` (or wherever existing scatter/collider
  tests for this file live — confirm exact path in Task 6) — regression
  coverage that collider placement is unchanged and that old bespoke-builder
  tests (if any exist) are removed/updated.

## Task 1 — Part pools: geometry-variant factories

**Files:** `src/world/NaturePartPools.ts`, `tests/world/NaturePartPools.test.ts`

Small, fixed libraries of distinct `BufferGeometry` variants per part-type,
built once and cached lazily (mirrors `_pooledMaterial()`'s existing
lazy-cache convention, now for geometry).

```ts
// src/world/NaturePartPools.ts
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';

export type PartType = 'trunk' | 'branch-arm' | 'canopy-blob' | 'rock-chunk';

/** Variant counts per part-type — trunk/branch-arm/canopy-blob variety comes from
 *  varying proportions (radius/height ratio, taper) baked into distinct geometries;
 *  rock-chunk variety additionally bakes a one-time vertex-displacement noise pass
 *  (see `_displaceRockVertices()`) so no two rock-chunk variants share a silhouette. */
const VARIANT_COUNTS: Record<PartType, number> = {
  trunk: 4, 'branch-arm': 4, 'canopy-blob': 6, 'rock-chunk': 6,
};

function buildTrunkVariant(index: number): THREE.BufferGeometry {
  const rand = mulberry32(0x7A17_0001 + index);
  const taper = 0.55 + rand() * 0.35;      // top-radius / base-radius ratio
  const radialSegs = 5 + Math.floor(rand() * 3); // 5..7
  // Unit height/radius=1 cylinder; callers scale to the archetype's own trunkH/trunkR.
  return new THREE.CylinderGeometry(taper, 1, 1, radialSegs);
}

function buildBranchArmVariant(index: number): THREE.BufferGeometry {
  const rand = mulberry32(0x7A17_0100 + index);
  const taper = 0.5 + rand() * 0.4;
  const radialSegs = 5 + Math.floor(rand() * 2); // 5..6
  return new THREE.CylinderGeometry(taper, 1, 1, radialSegs);
}

function buildCanopyBlobVariant(index: number): THREE.BufferGeometry {
  const rand = mulberry32(0x7A17_0200 + index);
  const detail = rand() < 0.3 ? 1 : 0; // occasional smoother blob among the low-poly ones
  return new THREE.IcosahedronGeometry(1, detail);
}

/** Applies a one-time, deterministic per-vertex outward displacement so this
 *  rock-chunk variant reads as distinctly faceted/irregular rather than a perfect
 *  dodecahedron — see research doc §"Kitbashing + vertex-displacement faceting". */
function displaceRockVertices(geo: THREE.BufferGeometry, seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const scale = 1 + (rand() - 0.5) * 0.32;
    v.multiplyScalar(scale);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function buildRockChunkVariant(index: number): THREE.BufferGeometry {
  const rand = mulberry32(0x7A17_0300 + index);
  const shape = rand();
  const base = shape < 0.5
    ? new THREE.DodecahedronGeometry(1, 0)
    : new THREE.IcosahedronGeometry(1, 0);
  return displaceRockVertices(base, 0x7A17_0400 + index);
}

const BUILDERS: Record<PartType, (index: number) => THREE.BufferGeometry> = {
  trunk: buildTrunkVariant,
  'branch-arm': buildBranchArmVariant,
  'canopy-blob': buildCanopyBlobVariant,
  'rock-chunk': buildRockChunkVariant,
};

const _cache = new Map<PartType, THREE.BufferGeometry[]>();

/** Lazily builds and caches all variants for `partType`, returning the same array
 *  (and same geometry instances) on every call — never rebuilds or disposes them
 *  mid-session (mirrors `_pooledMaterial()`'s "cache for the process lifetime"
 *  convention; `OverworldScene.dispose()` owns disposing these, same as it already
 *  disposes pooled materials). */
export function getPartVariantPool(partType: PartType): THREE.BufferGeometry[] {
  let pool = _cache.get(partType);
  if (!pool) {
    const count = VARIANT_COUNTS[partType];
    pool = Array.from({ length: count }, (_, i) => BUILDERS[partType](i));
    _cache.set(partType, pool);
  }
  return pool;
}

/** Test-only / dispose-time reset — clears the module-level cache so a fresh
 *  process (or a disposing OverworldScene, for symmetry with material-pool
 *  disposal) doesn't leak geometry across scene reloads in tests. */
export function _resetPartVariantPoolsForTest(): void {
  for (const pool of _cache.values()) for (const g of pool) g.dispose();
  _cache.clear();
}
```

**TDD steps:**
1. Write failing tests asserting: `getPartVariantPool('trunk').length === 4`
   (and 4/6/6 for the others); every returned geometry has a `position`
   attribute with `count > 0`; calling `getPartVariantPool('rock-chunk')`
   twice returns the *same* array reference (cache hit, no rebuild); two
   different `rock-chunk` variants have different vertex positions (proves
   displacement actually varies per-variant, not a shared no-op).
2. Implement `NaturePartPools.ts` as above.
3. Run `npx vitest run tests/world/NaturePartPools.test.ts` — confirm green.
4. Commit: `git commit -m "1.2: add nature-asset part-variant geometry pools"`.

## Task 2 — Declarative archetype recipes + `assembleFromRecipe()`

**Files:** `src/world/NatureAssetRecipes.ts`, `tests/world/NatureAssetRecipes.test.ts`

Each existing bespoke builder becomes a small data recipe consumed by one
generic assembler. `arrangement` values: `stacked` (parts centered on the Y
axis, stacked bottom-to-top — trunk+canopy trees, cactus bodies),
`radial-ring` (N parts arranged in a horizontal ring at a given Y — acacia
canopy, prickly-pear pads, rock clusters), `side-arms` (N parts branching
left/right off a parent at staggered heights — saguaro arms, sparse-tree
branch fragments).

```ts
// src/world/NatureAssetRecipes.ts
import * as THREE from 'three';
import type { PartType } from '@/world/NaturePartPools';
import { getPartVariantPool } from '@/world/NaturePartPools';

export type Arrangement = 'stacked' | 'radial-ring' | 'side-arms';

export interface RecipePart {
  partType: PartType;
  /** Material pool key — passed straight through to the caller's material
   *  lookup (kept as a plain string, not a THREE.Material, so this module has
   *  zero THREE.Material/texture dependency — see design spec §3.3's texture-
   *  family separation). */
  materialKey: string;
  arrangement: Arrangement;
  /** Fixed count, or an inclusive [min, max] rolled per-instance via `rand()`. */
  count: number | [number, number];
  /** Base scale range applied to each part instance (radius/length, in local
   *  units before the archetype-level trunkH/trunkR/canopyR multipliers). */
  scaleRange: [number, number];
  /** Vertical scale multiplier range (Y-axis squash/stretch) — 1 = no squash. */
  yScaleRange?: [number, number];
}

export interface AssetRecipe {
  /** archetype-level size knobs — one rand()-driven roll per assembled instance,
   *  shared by every part below that keys off `trunkH`/`trunkR`/`canopyR`. */
  trunkHRange: [number, number];
  trunkRRange: [number, number];
  canopyRRange: [number, number];
  parts: RecipePart[];
}

export const ARCHETYPE_RECIPES: Record<string, AssetRecipe> = {
  conifer: {
    trunkHRange: [1.6, 2.8], trunkRRange: [0.12, 0.19], canopyRRange: [0.85, 1.4],
    parts: [
      { partType: 'trunk', materialKey: 'tree-trunk', arrangement: 'stacked', count: 1, scaleRange: [1, 1] },
      { partType: 'canopy-blob', materialKey: 'conifer-lower', arrangement: 'stacked', count: 1, scaleRange: [1, 1] },
      { partType: 'canopy-blob', materialKey: 'conifer-upper', arrangement: 'stacked', count: 1, scaleRange: [0.65, 0.65] },
    ],
  },
  deciduous: {
    trunkHRange: [1.3, 2.2], trunkRRange: [0.16, 0.24], canopyRRange: [0.65, 1.1],
    parts: [
      { partType: 'trunk', materialKey: 'tree-trunk', arrangement: 'stacked', count: 1, scaleRange: [1, 1] },
      { partType: 'canopy-blob', materialKey: 'deciduous', arrangement: 'radial-ring', count: 3, scaleRange: [0.65, 1.1] },
    ],
  },
  // sparse, acacia, joshuatree, cactus-saguaro/barrel/pricklypear, rock
  // boulder/slab/cluster, bush follow the exact same shape — see Task 2b.
};

/** One assembled part instance, ready for the caller to place into either a
 *  visible InstancedMesh (NaturePropField) or a plain THREE.Group (dev/test
 *  rendering, non-instanced fallback). Positions/rotations are LOCAL to the
 *  archetype's own origin — the caller positions the whole assembled asset
 *  in world space, mirroring `_makeTree()`'s existing "unpositioned group"
 *  contract. */
export interface AssembledPart {
  partType: PartType;
  variantIndex: number;
  materialKey: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

/** Pure function: rolls one archetype instance's part list deterministically
 *  from `rand`. No THREE.Object3D/Mesh construction here — callers decide how
 *  to render (instanced attribute vs. a THREE.Group for tests/fallback). */
export function assembleFromRecipe(recipe: AssetRecipe, rand: () => number): AssembledPart[] {
  const lerp = (r: [number, number]) => r[0] + rand() * (r[1] - r[0]);
  const trunkH = lerp(recipe.trunkHRange);
  const trunkR = lerp(recipe.trunkRRange);
  const canopyR = lerp(recipe.canopyRRange);
  const parts: AssembledPart[] = [];

  let stackY = 0;
  for (const part of recipe.parts) {
    const count = Array.isArray(part.count)
      ? part.count[0] + Math.floor(rand() * (part.count[1] - part.count[0] + 1))
      : part.count;
    const variants = 4; // resolved against the real pool length by the caller if it differs
    for (let i = 0; i < count; i++) {
      const variantIndex = Math.floor(rand() * variants);
      const s = lerp(part.scaleRange) * (part.partType === 'trunk' ? trunkR : canopyR);
      const yS = part.yScaleRange ? lerp(part.yScaleRange) : 1;

      let position = new THREE.Vector3(0, 0, 0);
      let rotation = new THREE.Euler(0, 0, 0);
      if (part.arrangement === 'stacked') {
        const h = s * 2;
        position = new THREE.Vector3(0, stackY + h * 0.5, 0);
        stackY += h * 0.7; // slight overlap, matches existing overlapping-blob look
      } else if (part.arrangement === 'radial-ring') {
        const angle = (i / count) * Math.PI * 2 + rand() * 0.6;
        const spread = canopyR * (0.35 + rand() * 0.25);
        position = new THREE.Vector3(Math.cos(angle) * spread, trunkH, Math.sin(angle) * spread);
        rotation = new THREE.Euler(0, angle, 0);
      } else { // side-arms
        const side = i % 2 === 0 ? 1 : -1;
        position = new THREE.Vector3(side * (trunkR + s + 0.02), trunkH * (0.35 + rand() * 0.35), 0);
      }

      parts.push({
        partType: part.partType, variantIndex, materialKey: part.materialKey,
        position, rotation, scale: new THREE.Vector3(s, s * yS, s),
      });
    }
  }
  return parts;
}
```

**TDD steps:**
1. Write failing tests: `assembleFromRecipe(ARCHETYPE_RECIPES.conifer, mulberry32(1))`
   returns exactly 3 parts (1 trunk + 2 canopy-blob) with expected
   `partType`/`materialKey` order; determinism (same seed → identical output,
   including exact `position`/`scale` component values, not just counts);
   `deciduous`'s `radial-ring` count of 3 produces 3 canopy-blob parts at 3
   distinct angles spanning `2π`.
2. Implement `NatureAssetRecipes.ts`.
3. **Task 2b (same task, continued):** Convert the remaining 8 archetypes
   (`sparse`, `acacia`, `joshuatree`, `cactus-saguaro`, `cactus-barrel`,
   `cactus-pricklypear`, `rock-boulder`, `rock-slab`, `rock-cluster`, `bush`)
   into recipes, reading each corresponding method removed in Task 6
   (`_buildSparseTree`, `_buildAcaciaTree`, `_buildJoshuaTree`,
   `_buildSaguaroCactus`, `_buildBarrelCactus`, `_buildPricklyPearCactus`,
   the 3 `_makeRock()` archetype branches, `_makeBush`) for the exact
   size/count ranges and material color variants to preserve, and add one
   recipe-shape unit test per archetype (count + arrangement + materialKey
   assertions, same style as `conifer`/`deciduous` above).
4. Run `npx vitest run tests/world/NatureAssetRecipes.test.ts` — confirm green.
5. Commit: `git commit -m "1.2: add declarative archetype recipes + assembleFromRecipe()"`.

## Task 3 — Shared chunk-scoped scatter-point generator (parity fix)

**Files:** `src/world/NatureScatterPoints.ts`, `tests/world/NatureScatterPoints.test.ts`

```ts
// src/world/NatureScatterPoints.ts
import { poissonDisk } from '@/core/poissonDisk';
import { mulberry32 } from '@/core/prng';
import { isScatterAllowed } from '@/world/ScatterRules';
import type { WorldGrid } from '@/world/WorldGrid';
import type { ChunkCoord } from '@/world/ChunkManager';

export type NatureScatterKind = 'tree' | 'rock' | 'bush';

/** Per-kind poisson-disk minDist + acceptance-thinning — extracted verbatim from
 *  `_buildChunkScatter()`'s tree (5.5) / rock (8) calls and `_buildChunkBushes()`'s
 *  bush (3.2, 0.35 acceptance) call, so both the collider path (Task 6) and the new
 *  visual path (Task 4) share one formula and can never drift apart again. */
const SCATTER_PARAMS: Record<NatureScatterKind, { minDist: number; seedXor: number; acceptRate: number }> = {
  tree:  { minDist: 5.5, seedXor: 0x5C47_7E12, acceptRate: 1 },
  rock:  { minDist: 8,   seedXor: 0x5C47_7E12, acceptRate: 1 }, // same chunk seed as trees — one shared rand() stream, matching _buildChunkScatter()'s single `rand` reused for both loops
  bush:  { minDist: 3.2, seedXor: 0x8B21_44F7, acceptRate: 0.35 },
};

export interface NatureScatterPoint {
  wx: number; wz: number;
}

export interface ChunkGridInfo {
  GHW: number; GHH: number; T: number; chunkSize: number;
}

/**
 * Regenerates one chunk's deterministic tree/rock/bush candidate points —
 * IDENTICAL to what `_buildChunkScatter()`/`_buildChunkBushes()` compute inline
 * today for the same `coord`/`seed`/`kind`. Pure, chunk-scoped, callable for a
 * chunk regardless of whether it's actually loaded in `ChunkManager` — see
 * this plan's "Physics/visual position parity" section for why this must be a
 * single shared function rather than two independent call sites.
 *
 * Returns raw candidate points only (world x/z) — biome/`isScatterAllowed()`
 * filtering and archetype/recipe selection happen in the caller (both callers
 * already have their own `WorldGrid` cell lookup and rand() stream needs, so
 * folding that in here would force a shape neither caller actually wants).
 */
export function generateChunkScatterCandidates(
  coord: ChunkCoord,
  worldSeed: number,
  kind: NatureScatterKind,
  grid: ChunkGridInfo,
): { wx: number; wz: number; rand: () => number }[] {
  const { minDist, seedXor } = SCATTER_PARAMS[kind];
  const { GHW, GHH, T, chunkSize } = grid;
  const chunkWorldSize = T * chunkSize;
  const colStart = coord.cx * chunkSize + Math.floor(GHW);
  const rowStart = coord.cz * chunkSize + Math.floor(GHH);
  const originX = (colStart - GHW) * T;
  const originZ = (rowStart - GHH) * T;
  // Trees and rocks share ONE rand() stream per chunk (mirrors
  // `_buildChunkScatter()`'s single `rand` reused across both its loops) so
  // this must reconstruct that same stream for 'tree'/'rock' rather than
  // starting a fresh one per kind — otherwise rock positions/colliders would
  // shift the moment tree-loop iteration count changed for any reason.
  const rand = mulberry32((worldSeed ^ seedXor) ^ (coord.cx * (kind === 'bush' ? 51749 : 92821)) ^ (coord.cz * (kind === 'bush' ? 40361 : 68917)));
  const pts = poissonDisk(chunkWorldSize, chunkWorldSize, minDist, rand);
  return pts.map(([px, pz]) => ({ wx: originX + px, wz: originZ + pz, rand }));
}
```

**Important correction applied during implementation:** trees and rocks are
generated by **two separate `poissonDisk()` calls sharing one `rand` stream**
in the current code (tree loop runs to completion, consuming `rand()` calls,
*then* the rock loop starts consuming the same advancing stream) — not two
independently-seeded streams. `generateChunkScatterCandidates()` must be
called for `'tree'` first and `'rock'` second against the *same* `rand`
instance for a given chunk to reproduce this exactly; expose this by having
the function optionally accept a pre-built `rand: () => number` (falling back
to constructing its own only when omitted, for `'bush'`'s independently-seeded
case). Adjust the signature to `(coord, worldSeed, kind, grid, existingRand?)`
and thread `_buildChunkScatter()`'s single `rand` through for both tree and
rock calls in Task 6. Add a unit test asserting that calling for `'tree'` then
`'rock'` with a shared `rand` produces the exact same rock points as today's
inline two-loop code for a fixed chunk coord/seed (golden values captured from
the pre-refactor code before Task 6 touches `OverworldScene.ts`).

**TDD steps:**
1. Before touching `OverworldScene.ts`, add a temporary console/test script
   capturing golden tree+rock (wx,wz) pairs for `coord = {cx:0,cz:0}` and
   `coord = {cx:2,cz:-1}` from the **current, unmodified**
   `_buildChunkScatter()` (e.g. a scratch unit test calling the private
   method via a test-only export, or reading values from a debug log) —
   these become the regression fixture.
2. Write failing tests: `generateChunkScatterCandidates()` for `'tree'`
   reproduces the golden fixture exactly; calling it for `'tree'` then
   `'rock'` with the same `rand` instance reproduces both golden fixtures;
   `'bush'` reproduces `_buildChunkBushes()`'s golden fixture independently.
3. Implement `NatureScatterPoints.ts` per above (with the shared-`rand`
   correction).
4. Run `npx vitest run tests/world/NatureScatterPoints.test.ts` — confirm
   green against the golden fixtures.
5. Commit: `git commit -m "1.2: extract shared chunk-scoped nature scatter-point generator"`.

## Task 4 — Texture families

**Files:** `src/world/NatureAssetBuilder.ts` (add exports), `tests/world/NatureAssetBuilder.test.ts`

```ts
// added to src/world/NatureAssetBuilder.ts

/** Vertical streaky/fibrous bark texture — distinct from the mottled-blob
 *  family (kept for foliage) per the approved design spec's "distinct texture
 *  families per part-type" decision. Draws thin vertical stripes of varying
 *  brightness instead of round blobs. */
export function makeBarkCanvasTexture(baseColorHex: number, variance: number, seed: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = TEX_SIZE; cv.height = TEX_SIZE;
  const ctx = cv.getContext('2d')!;
  const [br, bg, bb] = hexToRgb(baseColorHex);
  const rng = makeRng(seed);
  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  const stripeCount = 22;
  for (let i = 0; i < stripeCount; i++) {
    const x = rng() * TEX_SIZE;
    const w = 1 + rng() * 2.5;
    const delta = (rng() * 2 - 1) * variance * 255;
    const r = clamp255(br + delta), g = clamp255(bg + delta), b = clamp255(bb + delta);
    ctx.fillStyle = `rgba(${r},${g},${b},0.6)`;
    ctx.fillRect(x, 0, w, TEX_SIZE);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

/** Angular/speckled rock-facet texture — small hard-edged polygon speckles
 *  instead of round blobs, reading as mineral/crystalline facets rather than
 *  organic mottling. */
export function makeRockFacetCanvasTexture(baseColorHex: number, variance: number, seed: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = TEX_SIZE; cv.height = TEX_SIZE;
  const ctx = cv.getContext('2d')!;
  const [br, bg, bb] = hexToRgb(baseColorHex);
  const rng = makeRng(seed);
  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  const speckleCount = 26;
  for (let i = 0; i < speckleCount; i++) {
    const cx = rng() * TEX_SIZE, cy = rng() * TEX_SIZE;
    const r = 2 + rng() * 5;
    const delta = (rng() * 2 - 1) * variance * 255;
    const cr = clamp255(br + delta), cg = clamp255(bg + delta), cb = clamp255(bb + delta);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.65)`;
    ctx.beginPath();
    // Hard-edged triangle/quad facet instead of arc() — reads angular, not round.
    const sides = 3 + Math.floor(rng() * 2); // 3 or 4
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + rng() * 0.4;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}
```

**TDD steps:**
1. Write failing tests (mirroring existing `makeMottledCanvasTexture` tests
   in `NatureAssetBuilder.test.ts`): both new functions return a
   `THREE.CanvasTexture` with a `64×64` backing canvas; same seed produces
   pixel-identical output (compare `canvas.toDataURL()` or sampled pixel
   values); different seeds produce different output; `variance: 0` produces
   a flat single-color canvas (no visible variation).
2. Implement both functions in `NatureAssetBuilder.ts`.
3. Run `npx vitest run tests/world/NatureAssetBuilder.test.ts` — confirm green.
4. Commit: `git commit -m "1.2: add bark and rock-facet texture families"`.

## Task 5 — `NaturePropField` / `selectNaturePropPlacements` / `NaturePropManager`

**Files:** `src/world/NaturePropField.ts`, `tests/world/NaturePropField.test.ts`

Mirrors `GrassField.ts` section-for-section:

```ts
// src/world/NaturePropField.ts
import * as THREE from 'three';
import type { WorldGrid } from '@/world/WorldGrid';
import type { ChunkCoord } from '@/world/ChunkManager';
import { worldToChunkCoord, CHUNK_SIZE } from '@/world/ChunkManager';
import { generateChunkScatterCandidates, type NatureScatterKind } from '@/world/NatureScatterPoints';
import { isScatterAllowed } from '@/world/ScatterRules';
import { pickTreeArchetype, pickRockArchetype } from '@/world/NatureAssetDNA';
import { ARCHETYPE_RECIPES, assembleFromRecipe, type AssembledPart } from '@/world/NatureAssetRecipes';
import { getPartVariantPool, type PartType } from '@/world/NaturePartPools';

export const NATURE_PROP_RADIUS = 48;       // wider than GRASS_RADIUS (24) — trees/
                                             // rocks are sparse enough (5.5-8 WU spacing
                                             // vs grass's sub-1WU spacing) that a larger
                                             // visible radius costs far fewer instances.
export const NATURE_PROP_REBUILD_HYSTERESIS = 12;

export interface NaturePropInstance {
  worldPosition: THREE.Vector3;
  localOffset: THREE.Vector3;    // AssembledPart.position, un-rotated
  rotationY: number;             // whole-asset yaw (existing per-tree/rock rand()*2π)
  localRotation: THREE.Euler;    // AssembledPart.rotation
  scale: THREE.Vector3;          // AssembledPart.scale
}

/**
 * Scans chunk coordinates overlapping a player-centered `radius` square,
 * regenerates each one's deterministic scatter candidates via
 * `generateChunkScatterCandidates()` (guaranteeing parity with whatever
 * collider `_loadTerrainChunk()` built for the same chunk — see this plan's
 * "Physics/visual position parity" section), filters through
 * `isScatterAllowed()`, picks an archetype via `NatureAssetDNA`, and
 * assembles it via `assembleFromRecipe()`. Returns one `NaturePropInstance`
 * per assembled PART (not per tree) grouped by `(partType, variantIndex,
 * materialKey)` so the caller can hand each group straight to one
 * `NaturePropField`'s instance buffer.
 */
export function selectNaturePropPlacements(
  wg: WorldGrid, playerX: number, playerZ: number, radius: number,
  seed: number, kind: NatureScatterKind, gridInfo: { GHW: number; GHH: number; T: number },
): Map<string, NaturePropInstance[]> {
  const groups = new Map<string, NaturePropInstance[]>();
  const { GHW, GHH, T } = gridInfo;
  const minCoord = worldToChunkCoord(playerX - radius, playerZ - radius, T, CHUNK_SIZE);
  const maxCoord = worldToChunkCoord(playerX + radius, playerZ + radius, T, CHUNK_SIZE);

  for (let cx = minCoord.cx; cx <= maxCoord.cx; cx++) {
    for (let cz = minCoord.cz; cz <= maxCoord.cz; cz++) {
      const coord: ChunkCoord = { cx, cz };
      const treeRand = kind === 'tree' || kind === 'rock' ? undefined : undefined; // see note below
      const candidates = generateChunkScatterCandidates(coord, seed, kind, { GHW, GHH, T, chunkSize: CHUNK_SIZE });
      for (const { wx, wz, rand } of candidates) {
        const d2 = (wx - playerX) ** 2 + (wz - playerZ) ** 2;
        if (d2 > radius * radius) continue;
        const col = Math.floor(wx / T + GHW);
        const row = Math.floor(wz / T + GHH);
        if (col < 0 || col >= wg.width || row < 0 || row >= wg.height) continue;
        const cell = wg.get(col, row);
        if (!isScatterAllowed(cell, kind)) continue;

        const archetypeKey = kind === 'tree' ? pickTreeArchetype(cell.biome, wx, wz)
          : kind === 'rock' ? `rock-${pickRockArchetype(wx, wz)}`
          : 'bush';
        const recipe = ARCHETYPE_RECIPES[archetypeKey];
        if (!recipe) continue;
        const assembled = assembleFromRecipe(recipe, rand);
        const wholeYaw = rand() * Math.PI * 2;

        for (const part of assembled) {
          const key = `${part.partType}|${part.variantIndex}|${part.materialKey}`;
          const arr = groups.get(key) ?? [];
          arr.push({
            worldPosition: new THREE.Vector3(wx, cell.elevation, wz),
            localOffset: part.position, rotationY: wholeYaw,
            localRotation: part.rotation, scale: part.scale,
          });
          groups.set(key, arr);
        }
      }
    }
  }
  return groups;
}

/** One InstancedMesh for a single (partType, variantIndex, materialKey) combo —
 *  directly mirrors GrassField's constructor/update/dispose shape. `maxInstances`
 *  is a hard capacity ceiling (mirrors GrassPreset.maxBlades); placements beyond
 *  it are dropped, oldest-first-scan order (same truncation convention as
 *  GrassField.update()'s `Math.min(placements.length, maxBlades)`). */
export class NaturePropField {
  readonly mesh: THREE.InstancedMesh;
  private _lastBuildX = Infinity;
  private _lastBuildZ = Infinity;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    private readonly _maxInstances: number,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, _maxInstances);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  /** Called once per frame per field by NaturePropManager with this field's own
   *  pre-filtered instance list (already grouped by key in selectNaturePropPlacements). */
  rebuild(instances: NaturePropInstance[]): void {
    const count = Math.min(instances.length, this._maxInstances);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < count; i++) {
      const inst = instances[i]!;
      e.set(inst.localRotation.x, inst.localRotation.y + inst.rotationY, inst.localRotation.z);
      q.setFromEuler(e);
      const worldPos = inst.localOffset.clone()
        .applyEuler(new THREE.Euler(0, inst.rotationY, 0))
        .add(inst.worldPosition);
      m.compose(worldPos, q, inst.scale);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Owns one NaturePropField per unique (partType, variantIndex, materialKey)
 *  key, mirrors `_grassFields: GrassField[]` ownership in OverworldScene.
 *  Materials come from the SAME `_pooledMaterial`-style cache OverworldScene
 *  already threads through recipe material keys — this class receives a
 *  `materialLookup` callback rather than constructing materials itself, so it
 *  has no THREE-texture-family knowledge (kept in NatureAssetBuilder.ts/
 *  OverworldScene.ts). */
export class NaturePropManager {
  private readonly _fields = new Map<string, NaturePropField>();
  private _lastX = Infinity;
  private _lastZ = Infinity;

  constructor(
    private readonly _wg: WorldGrid,
    private readonly _seed: number,
    private readonly _gridInfo: { GHW: number; GHH: number; T: number },
    private readonly _materialLookup: (materialKey: string, rand: () => number) => THREE.Material,
    private readonly _maxInstancesPerField = 4000,
  ) {}

  /** All meshes currently owned — for scene.add/remove wiring. */
  get meshes(): THREE.InstancedMesh[] {
    return [...this._fields.values()].map(f => f.mesh);
  }

  update(playerX: number, playerZ: number): void {
    const dx = playerX - this._lastX, dz = playerZ - this._lastZ;
    if (Number.isFinite(this._lastX) && Math.sqrt(dx * dx + dz * dz) < 12) return;
    this._lastX = playerX; this._lastZ = playerZ;

    const allGroups = new Map<string, NaturePropInstance[]>();
    for (const kind of ['tree', 'rock', 'bush'] as const) {
      const groups = selectNaturePropPlacements(this._wg, playerX, playerZ, 48, this._seed, kind, this._gridInfo);
      for (const [key, arr] of groups) {
        const existing = allGroups.get(key) ?? [];
        allGroups.set(key, existing.concat(arr));
      }
    }

    for (const [key, instances] of allGroups) {
      let field = this._fields.get(key);
      if (!field) {
        const [partType, variantIndexStr, materialKey] = key.split('|') as [PartType, string, string];
        const geometry = getPartVariantPool(partType)[Number(variantIndexStr)]!;
        const material = this._materialLookup(materialKey, () => Math.random());
        field = new NaturePropField(geometry, material, this._maxInstancesPerField);
        this._fields.set(key, field);
      }
      field.rebuild(instances);
    }
    // Any field whose key no longer appears this rebuild simply keeps its last
    // instance buffer (its meshes still exist in the scene) until the next
    // rebuild that DOES produce entries for it — matches GrassField's own
    // "stale until next qualifying rebuild" behavior, not a live diff.
  }

  dispose(): void {
    for (const f of this._fields.values()) f.dispose();
    this._fields.clear();
  }
}
```

**Note on the material-key → material lookup:** `NaturePropManager` is
deliberately **not** responsible for building materials (texture-family
choice lives in `OverworldScene.ts`/`NatureAssetBuilder.ts`, per the design
spec's separation) — it receives a `materialLookup` callback. Task 6 wires
this callback to a small helper in `OverworldScene.ts` that maps each
`materialKey` (`'tree-trunk'`, `'conifer-lower'`, `'rock'`, `'bush'`, etc.) to
the correct texture family (bark for `*-trunk` keys, rock-facet for `rock*`
keys, foliage/mottled for everything else) and reuses the existing
`_pooledMaterial()`-style cache so materials are still built once and shared.

**TDD steps:**
1. Write failing tests: `selectNaturePropPlacements()` on a small all-forest
   `WorldGrid` returns a non-empty map with `'trunk|...'` and
   `'canopy-blob|...'` keys; a position-parity test asserting the `(wx,wz)`
   pairs it produces for `kind: 'tree'` at a given chunk are a subset of
   (and match exactly, ignoring per-part-offset) the golden fixture from
   Task 3; determinism (same seed/position → identical output);
   `NaturePropField.rebuild()` sets `mesh.count` to the passed instance count
   (capped at `maxInstances`) and marks `instanceMatrix.needsUpdate`;
   `NaturePropManager.update()` only rebuilds fields after 12 WU of player
   movement (hysteresis, mirroring `REBUILD_HYSTERESIS` test style in
   `GrassField.test.ts`); `.dispose()` disposes every owned field's geometry
   reference count correctly (geometry itself is pool-owned and must NOT be
   disposed by `NaturePropField.dispose()` — only the material).
   **Correction:** since `NaturePropField.dispose()` must not dispose
   pool-shared geometry, remove the `this.mesh.geometry.dispose()` call from
   the class above during implementation — only `material.dispose()`
   belongs there; add a test asserting geometry survives a field's disposal.
2. Implement `NaturePropField.ts`.
3. Run `npx vitest run tests/world/NaturePropField.test.ts` — confirm green.
4. Commit: `git commit -m "1.2: add NaturePropField/NaturePropManager instancing"`.

## Task 6 — Wire into `OverworldScene.ts`, remove bespoke builders

**Files:** `src/scene/OverworldScene.ts`, its test file(s)

1. Add `private _natureProps!: NaturePropManager;` alongside
   `_grassFields`. Construct it in `enter()` right after the existing
   `_grassFields = Object.values(GRASS_PRESETS).map(...)` line, passing a
   `materialLookup` closure built from a small new private method
   `_natureMaterialFor(materialKey, rand)` that:
   - Picks the texture family: `materialKey.endsWith('-trunk')` →
     `makeBarkCanvasTexture`; `materialKey.startsWith('rock')` →
     `makeRockFacetCanvasTexture`; else → `makeMottledCanvasTexture` (kept,
     now explicitly "the foliage family").
   - Reuses the existing `_materialPools` `Map<string, Material[]>` cache
     keyed by `materialKey`, same lazy-build-once convention as
     `_pooledMaterial()` (extend that same map/method rather than adding a
     second one — `_pooledMaterial()`'s signature already accepts arbitrary
     `variantColors`/`variance`; add an optional `textureFamily` parameter
     defaulting to `'mottled'` instead of duplicating the whole method).
   - Base colors/variance per `materialKey` come from the existing per-kind
     literal arrays already inline in the removed builder methods (e.g.
     `'tree-trunk'` → `[0x4a2810]`, `'conifer-lower'` → the 6-value
     `0x1a4610..+5*0x010100` range) — move these literal arrays into
     `ARCHETYPE_RECIPES`... **correction:** keep them as a small
     `NATURE_MATERIAL_COLORS: Record<string, { colors: number[]; variance: number }>`
     table alongside `_natureMaterialFor()` in `OverworldScene.ts` (not in
     `NatureAssetRecipes.ts`, which per Task 2 has zero THREE.Material
     dependency by design) — one entry per `materialKey` used across all
     recipes, values copied verbatim from the removed builder methods.
2. Add every `this._natureProps.meshes` entry to `this.scene` in `enter()`
   (alongside the existing `if (this._grassEnabled) for (const gf of
   this._grassFields) this.scene.add(gf.mesh);` block — nature props are
   NOT gated by the grass flag, they're unconditional).
3. Add `this._natureProps.update(pos.x, pos.z);` in the same per-frame block
   as the existing `if (this._grassEnabled) { for (const gf of
   this._grassFields) { gf.update(...); gf.tickWind(dt); } }`.
4. In `exit()`, remove each `_natureProps.meshes` entry from the scene
   (mirroring `for (const gf of this._grassFields) this.scene.remove(gf.mesh);`)
   and call `this._natureProps.dispose()` where `GrassField.dispose()` is
   called today.
5. Refactor `_buildChunkScatter()`:
   - Replace the inline `poissonDisk(chunkWorldSize, chunkWorldSize, 5.5, rand)`
     tree loop and `poissonDisk(..., 8, rand)` rock loop with calls to
     `generateChunkScatterCandidates(coord, this._seed, 'tree', gridInfo,
     rand)` / `('rock', ..., rand)` (passing the SAME `rand` instance through
     both, per Task 3's shared-stream correction) so the exact same
     candidate points still drive collider placement.
   - For each surviving candidate (after the same `isScatterAllowed`/distance
     checks as today), instead of calling `this._makeTree(...)` /
     `this._makeRock(...)` to build a full visual mesh, create a lightweight
     invisible placeholder: `const placeholder = new THREE.Object3D();
     placeholder.position.set(wx, cell.elevation * SH, wz);
     placeholder.userData.scatterKind = 'tree'; group.add(placeholder);`
     (rocks additionally set `placeholder.userData.scatterRadius = radius`,
     using the same `radius = 0.48 + rand() * 0.84` roll `_makeRock()` used
     to compute — this value must still be rolled from `rand` here, in the
     same position in the stream, so collider sizing is unchanged; verify
     against the Task 3 golden fixture, which should already capture this).
   - `_buildChunkBushes()` similarly switches to
     `generateChunkScatterCandidates(coord, this._seed, 'bush', gridInfo)`
     but needs NO placeholder at all (bushes have never had colliders) — the
     entire per-bush block in that method is removed; bush visuals now come
     exclusively from `NaturePropManager`.
   - Territory-prop dressing (`_tryPlaceTerritoryProp`) stays exactly as-is;
     it already runs before the tree/rock builder call and `continue`s past
     it when it fires — unaffected by this change since it doesn't touch the
     builder methods being removed.
6. Delete the now-unused bespoke methods: `_buildConiferTree`,
   `_buildDeciduousTree`, `_buildSparseTree`, `_buildCactusTree`,
   `_buildSaguaroCactus`, `_buildBarrelCactus`, `_buildPricklyPearCactus`,
   `_buildAcaciaTree`, `_buildJoshuaTree`, `_makeTree`, `_makeRock`,
   `_makeBush`. Keep `_pooledMaterial()` (now used only by
   `_natureMaterialFor()` plus any other unrelated callers — grep first to
   confirm none of the beach-decor/water-decor builders (`_makeDriftwood`,
   `_makeDuneGrassTuft`, `_makeBeachPebbles`, reed/underwater builders) are
   affected; they are explicitly out of scope and must NOT be touched).
7. Confirm `MeshMergeUtils`'s merge-by-material pass (further down in
   `_buildChunkScatter()`, "Collapse every individual tree/rock/bush/decor
   Mesh...") now only ever sees beach/water decor + placeholder `Object3D`s
   (no geometry) for tree/rock/bush — verify it either already no-ops
   correctly on geometry-less objects or add an explicit skip for
   `userData.scatterKind === 'tree' | 'rock'` placeholders in that pass so it
   doesn't attempt to merge non-existent geometry.

**TDD steps:**
1. Before deleting anything, run the existing full test suite for
   `OverworldScene.ts` (`npx vitest run tests/scene/OverworldScene*.test.ts`
   — confirm exact glob by listing `tests/scene/`) to capture a clean
   baseline.
2. Make the wiring/refactor changes as one cohesive change (this task isn't
   meaningfully separable into a failing-test-first cycle the way the pure
   modules above are, since it's an integration/wiring task against existing
   scene machinery) — but add/update targeted tests as you go:
   - A test asserting `_buildChunkScatter()`'s returned group still contains
     exactly the same count of `userData.scatterKind === 'tree'` /
     `'rock'` placeholder objects at the same positions/radii as the
     pre-refactor golden fixture (Task 3's fixture, now checked end-to-end
     through the real method instead of the extracted function alone).
   - A test asserting `enter()` adds `_natureProps.meshes` to the scene and
     `exit()` removes them.
   - A test asserting `update()`'s per-frame loop calls
     `_natureProps.update(pos.x, pos.z)` (spy/mock).
3. Run the full targeted test file(s) — confirm green, including the
   pre-existing suite from step 1 (regression: collider tests must still
   pass unchanged).
4. Commit: `git commit -m "1.2: wire NaturePropManager into OverworldScene, remove bespoke tree/rock/bush builders"`.

## Task 7 — Full regression pass + human playtest gate

1. Run the complete targeted test set for this sub-task in one pass:
   `npx vitest run tests/world/NaturePartPools.test.ts tests/world/NatureAssetRecipes.test.ts tests/world/NatureScatterPoints.test.ts tests/world/NaturePropField.test.ts tests/world/NatureAssetBuilder.test.ts tests/world/NatureAssetDNA.test.ts tests/world/ScatterRules.test.ts tests/scene/OverworldScene*.test.ts`
   — all green.
2. `npx tsc --noEmit` — confirm error count is at/below the established
   ~146-150 baseline (no new errors introduced).
3. Manual/dev-lab smoke check: run the dev sandbox, generate a small realm,
   visually confirm trees/rocks/bushes render with the new part-kit look,
   confirm no console errors, confirm FPS is not obviously worse than the
   pre-1.2 baseline (instancing should improve it, but this is a sanity
   check, not the deep FPS work already deferred from 1.1).
4. **Human playtest gate (per skill, required):** report what changed, how
   to see it (dev sandbox route + seed), and explicitly ask before starting
   sub-task 1.3 — do not proceed automatically.

## Plan self-review (per writing-plans skill)

- **Placeholder scan:** no `TBD`/`TODO` left in any task; the `treeRand`
  unused-variable placeholder in Task 5's first draft snippet is called out
  explicitly as removed by Task 3's shared-rand correction — flagged here so
  whoever implements it doesn't copy it verbatim into a lint failure.
- **Spec coverage:** part pools ✅ (Task 1), recipes ✅ (Task 2), texture
  families ✅ (Task 4), player-radius InstancedMesh + hysteresis ✅ (Task 5),
  chunk-based colliders unchanged ✅ (Task 3 + Task 6 explicitly preserves
  the collider code path, just re-sources its candidate points), no new
  categories ✅ (only the existing archetype set is converted), no
  `NatureAssetDNA`/`ScatterRules` changes ✅ (both consumed as-is).
- **Consistency check resolved:** the spec's phrase "mirrors
  `selectGrassPlacements()`'s poisson-disk + ScatterRules + archetype-pick
  logic" is technically imprecise (grass uses grid-jitter, not poisson-disk)
  — this plan implements the spec's actual intent (poisson-disk, matching
  today's tree/rock/bush placement, for physics/visual parity) while
  matching `GrassField`'s *architectural* pattern (field class + player
  radius + hysteresis rebuild), which is what the spec's data-flow section
  actually depended on architecturally.
- **Task ordering:** matches spec §6 exactly (parts+recipes → textures →
  instancing → wiring), with Task 3 (position-parity extraction) inserted
  between recipes and instancing since instancing cannot be built correctly
  without it.

## Execution Handoff

Two ways to execute this plan:
1. **Subagent-Driven Development** (this session) — I dispatch each task to
   a fresh subagent with the relevant task section as its brief, review its
   diff, then move to the next task.
2. **Executing-Plans** (parallel session) — spin up a separate session that
   works through this plan file end-to-end with its own review checkpoints.

Given the user's earlier guidance ("if there are tasks to be done in
parallel I think subagent makes sense otherwise just work here step by step
is ok") — Tasks 1, 2, and 4 have no interdependencies and can run in
parallel via subagents; Task 3 depends on none of them but should land
before Task 5; Task 5 depends on Tasks 1-4; Task 6 depends on Task 5; Task 7
depends on Task 6.
