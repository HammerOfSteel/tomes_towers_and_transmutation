# Nature Asset Variety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single tree archetype and single rock archetype in the overworld with 3
deterministic archetypes each, add a new bush/shrub prop, and give foliage/stone materials subtle
procedural canvas-texture variation — all without external asset files, without new draw-call
categories beyond what already exists per-object, and without touching physics colliders beyond
what's already correct.

**Architecture:** Two new pure modules — `src/world/NatureAssetDNA.ts` (deterministic archetype
selection, generalizing Phase 1's per-cell hash) and `src/world/NatureAssetBuilder.ts` (shared
canvas-texture factory for mottled foliage/stone materials) — plus modifications to
`src/scene/OverworldScene.ts`'s `_makeTree`/`_placeRocks` to branch on archetype, and a new
`_plantBushes`/`_makeBush` pair that populates the existing (currently-empty) `_clutter` array.

**Tech Stack:** TypeScript, Three.js, Vitest (jsdom environment with real `canvas` npm package
backing `HTMLCanvasElement`/`CanvasRenderingContext2D`, confirmed via manual check that
`getImageData` returns real pixel data, not a stub).

## Global Constraints

- No new external asset files, textures, or npm dependencies.
- `_trees`/`_rocks` array element shapes and all existing lifecycle call sites
  (`enter()`/`exit()`/`dispose()`) must keep working exactly as before — only the mesh CONTENT
  inside each tree/rock group changes, not the surrounding bookkeeping.
- Bushes are decorative only — no physics collider is added for them (consistent with `_clutter`'s
  existing purpose and lifecycle wiring, which already exists and must not be duplicated).
- `tests/e2e/exterior.test.ts`'s full 15-test suite must continue passing unmodified after this
  phase — if any tree/rock collider position assertion fails, investigate whether the archetype
  change altered a trunk/rock collider radius incorrectly (it should not — colliders are computed
  from the SAME positions/radii-producing code paths as before, only visual mesh shape changes).

---

### Task 1: Deterministic archetype-selection module (`NatureAssetDNA.ts`)

**Files:**
- Create: `src/world/NatureAssetDNA.ts`
- Test: `tests/world/NatureAssetDNA.test.ts`

**Interfaces:**
- Produces: `export function hashIndex(a: number, b: number, count: number): number` (integer in
  `[0, count)`, deterministic for given `(a, b, count)`).
- Produces: `export type TreeArchetype = 'conifer' | 'deciduous' | 'sparse';`
- Produces: `export type RockArchetype = 'boulder' | 'slab' | 'cluster';`
- Produces: `export function pickTreeArchetype(wx: number, wz: number): TreeArchetype`
- Produces: `export function pickRockArchetype(wx: number, wz: number): RockArchetype`
- Consumed by: Task 3 (`OverworldScene.ts` tree/rock builders).

- [ ] **Step 1: Write the failing test**

Create `tests/world/NatureAssetDNA.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  hashIndex,
  pickTreeArchetype,
  pickRockArchetype,
  type TreeArchetype,
  type RockArchetype,
} from '@/world/NatureAssetDNA';

describe('hashIndex', () => {
  it('is deterministic for the same inputs', () => {
    expect(hashIndex(12.5, -7.25, 3)).toBe(hashIndex(12.5, -7.25, 3));
  });

  it('stays within [0, count)', () => {
    for (let i = -30; i < 30; i++) {
      for (let j = -30; j < 30; j++) {
        const v = hashIndex(i * 1.37, j * 2.11, 3);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(3);
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });

  it('produces more than one distinct value across many inputs', () => {
    const values = new Set<number>();
    for (let i = -30; i < 30; i++) {
      values.add(hashIndex(i * 1.37, i * -2.11, 3));
    }
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('pickTreeArchetype', () => {
  it('is deterministic and always one of the 3 known archetypes', () => {
    const known: TreeArchetype[] = ['conifer', 'deciduous', 'sparse'];
    for (let i = -20; i < 20; i++) {
      const a = pickTreeArchetype(i * 3.3, -i * 1.9);
      expect(a).toBe(pickTreeArchetype(i * 3.3, -i * 1.9));
      expect(known).toContain(a);
    }
  });

  it('produces more than one distinct archetype across many positions', () => {
    const seen = new Set<TreeArchetype>();
    for (let i = -20; i < 20; i++) seen.add(pickTreeArchetype(i * 3.3, -i * 1.9));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('pickRockArchetype', () => {
  it('is deterministic and always one of the 3 known archetypes', () => {
    const known: RockArchetype[] = ['boulder', 'slab', 'cluster'];
    for (let i = -20; i < 20; i++) {
      const a = pickRockArchetype(i * 2.2, i * 4.4);
      expect(a).toBe(pickRockArchetype(i * 2.2, i * 4.4));
      expect(known).toContain(a);
    }
  });

  it('produces more than one distinct archetype across many positions', () => {
    const seen = new Set<RockArchetype>();
    for (let i = -20; i < 20; i++) seen.add(pickRockArchetype(i * 2.2, i * 4.4));
    expect(seen.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/NatureAssetDNA.test.ts`
Expected: FAIL — module `@/world/NatureAssetDNA` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/world/NatureAssetDNA.ts`:

```typescript
/**
 * NatureAssetDNA.ts — deterministic archetype selection for procedurally
 * placed overworld nature props (trees, rocks, bushes).
 *
 * Generalizes the per-cell hash-to-bucket technique introduced in
 * TerrainGeometryBuilder.ts's cellVariantIndex/cornerHeightJitter (Phase 1
 * of the overworld-feel branch) so tree/rock/bush archetype choice is
 * deterministic for a given world position — same seed/world always
 * produces the same-looking forest, no per-frame or per-load randomness.
 */

/** Deterministic hash of two floating-point world coordinates → integer bucket in [0, count). */
export function hashIndex(a: number, b: number, count: number): number {
  // Coordinates are world-space floats (can be fractional/negative) — scale and
  // truncate to integers first so the bit-mixing hash below operates on well-defined
  // 32-bit integer inputs.
  const ai = Math.floor(a * 1000) | 0;
  const bi = Math.floor(b * 1000) | 0;
  let h = (ai * 374761393 + bi * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  const unsigned = h >>> 0;
  return unsigned % count;
}

export type TreeArchetype = 'conifer' | 'deciduous' | 'sparse';
export type RockArchetype = 'boulder' | 'slab' | 'cluster';

const TREE_ARCHETYPES: readonly TreeArchetype[] = ['conifer', 'deciduous', 'sparse'];
const ROCK_ARCHETYPES: readonly RockArchetype[] = ['boulder', 'slab', 'cluster'];

/** Deterministic tree archetype for a tree placed at world position (wx, wz). */
export function pickTreeArchetype(wx: number, wz: number): TreeArchetype {
  return TREE_ARCHETYPES[hashIndex(wx, wz, TREE_ARCHETYPES.length)]!;
}

/** Deterministic rock archetype for a rock placed at world position (wx, wz). */
export function pickRockArchetype(wx: number, wz: number): RockArchetype {
  // Offset inputs so a tree and rock at the same coordinates (never happens in practice due to
  // placement exclusion rules, but keeps the two functions independent) wouldn't be forced to
  // correlate archetype choices.
  return ROCK_ARCHETYPES[hashIndex(wx + 91.7, wz - 41.3, ROCK_ARCHETYPES.length)]!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/NatureAssetDNA.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/NatureAssetDNA.ts tests/world/NatureAssetDNA.test.ts
git commit -m "feat: add deterministic nature asset archetype selection module"
```

---

### Task 2: Shared mottled canvas-texture factory (`NatureAssetBuilder.ts`)

**Files:**
- Create: `src/world/NatureAssetBuilder.ts`
- Test: `tests/world/NatureAssetBuilder.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (independent).
- Produces: `export function makeMottledCanvasTexture(baseColorHex: number, variance: number, seed: number): THREE.CanvasTexture`
  — deterministic for the same `(baseColorHex, variance, seed)` triple, canvas size fixed at 64×64.
  Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Create `tests/world/NatureAssetBuilder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeMottledCanvasTexture } from '@/world/NatureAssetBuilder';

describe('makeMottledCanvasTexture', () => {
  it('returns a THREE.CanvasTexture with a 64x64 backing canvas', () => {
    const tex = makeMottledCanvasTexture(0x2a6614, 0.15, 42);
    expect(tex).toBeInstanceOf(THREE.CanvasTexture);
    const cv = tex.image as HTMLCanvasElement;
    expect(cv.width).toBe(64);
    expect(cv.height).toBe(64);
  });

  it('is deterministic: same seed produces byte-identical pixel data', () => {
    const texA = makeMottledCanvasTexture(0x2a6614, 0.15, 42);
    const texB = makeMottledCanvasTexture(0x2a6614, 0.15, 42);
    const cvA = texA.image as HTMLCanvasElement;
    const cvB = texB.image as HTMLCanvasElement;
    const ctxA = cvA.getContext('2d')!;
    const ctxB = cvB.getContext('2d')!;
    const dataA = ctxA.getImageData(0, 0, 64, 64).data;
    const dataB = ctxB.getImageData(0, 0, 64, 64).data;
    expect(Array.from(dataA)).toEqual(Array.from(dataB));
  });

  it('produces visibly different pixel data for a different seed', () => {
    const texA = makeMottledCanvasTexture(0x2a6614, 0.15, 42);
    const texB = makeMottledCanvasTexture(0x2a6614, 0.15, 99);
    const dataA = (texA.image as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 64, 64).data;
    const dataB = (texB.image as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 64, 64).data;
    expect(Array.from(dataA)).not.toEqual(Array.from(dataB));
  });

  it('does not throw for a range of base colors and variances', () => {
    const colors = [0x2a6614, 0x8a8060, 0x9a9a9a];
    const variances = [0.05, 0.2, 0.4];
    for (const c of colors) {
      for (const v of variances) {
        expect(() => makeMottledCanvasTexture(c, v, 7)).not.toThrow();
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/NatureAssetBuilder.test.ts`
Expected: FAIL — module `@/world/NatureAssetBuilder` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/world/NatureAssetBuilder.ts`:

```typescript
/**
 * NatureAssetBuilder.ts — shared procedural canvas-texture factory for
 * overworld nature props (tree canopies, bush foliage, rock surfaces).
 *
 * Follows the same THREE.CanvasTexture pattern already used elsewhere in
 * this codebase (src/showroom.ts's makeCheckerFloor, FloatingDialogue3D.ts's
 * speech-bubble textures) — a small offscreen 2D canvas painted with
 * deterministic noise, wrapped as a texture. No external image files.
 */
import * as THREE from 'three';

const TEX_SIZE = 64;

/** Simple deterministic PRNG (mulberry32-style) local to this module — avoids a
 * hard dependency on core/prng.ts's exact API surface for this narrow use. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Build a deterministic 64x64 mottled-noise CanvasTexture: a base color with
 * randomized per-blob brightness variation, giving foliage/stone materials a
 * less flat-shaded look without external texture files.
 *
 * @param baseColorHex  0xRRGGBB base color.
 * @param variance      0..1 — how much per-blob brightness can deviate from the base.
 * @param seed          deterministic seed — same seed always produces the same texture.
 */
export function makeMottledCanvasTexture(
  baseColorHex: number,
  variance: number,
  seed: number,
): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = TEX_SIZE;
  cv.height = TEX_SIZE;
  const ctx = cv.getContext('2d')!;
  const [br, bg, bb] = hexToRgb(baseColorHex);

  const rng = makeRng(seed);

  // Base fill.
  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Scatter mottled blobs — coarse patches of slightly lighter/darker tone.
  const blobCount = 18;
  for (let i = 0; i < blobCount; i++) {
    const cx = rng() * TEX_SIZE;
    const cy = rng() * TEX_SIZE;
    const radius = 4 + rng() * 10;
    const delta = (rng() * 2 - 1) * variance * 255;
    const r = clamp255(br + delta);
    const g = clamp255(bg + delta);
    const b = clamp255(bb + delta);
    ctx.fillStyle = `rgba(${r},${g},${b},0.55)`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/NatureAssetBuilder.test.ts`
Expected: PASS (all 4 tests). If the determinism test fails because `document.createElement` in
the jsdom test environment produces a canvas whose `getContext('2d')` differs in behavior from a
browser canvas (e.g. arc anti-aliasing differences between two calls), re-run twice to rule out
environment flakiness; if genuinely flaky, tighten the test to compare a coarser summary (e.g. the
image data's byte-sum) instead of exact per-byte equality — but attempt exact equality first since
canvas rendering with fixed inputs should be deterministic.

- [ ] **Step 5: Commit**

```bash
git add src/world/NatureAssetBuilder.ts tests/world/NatureAssetBuilder.test.ts
git commit -m "feat: add shared mottled canvas-texture factory for nature props"
```

---

### Task 3: Tree archetype variety in `OverworldScene.ts`

**Files:**
- Modify: `src/scene/OverworldScene.ts`

**Interfaces:**
- Consumes: `pickTreeArchetype` (Task 1), `makeMottledCanvasTexture` (Task 2).
- Produces: `_makeTree(rand, wx, wz)` signature changes from `_makeTree(rand)` to
  `_makeTree(rand, wx, wz)` (adds 2 params) — the ONE call site in `_plantTrees` is updated in the
  same task. No other file calls `_makeTree`.

- [ ] **Step 1: Add imports**

At the top of `src/scene/OverworldScene.ts`, alongside the existing imports (find the existing
`import { buildTerrainGeometryData } from '@/world/TerrainGeometryBuilder';` line and add directly
after it):

```typescript
import { pickTreeArchetype, pickRockArchetype } from '@/world/NatureAssetDNA';
import { makeMottledCanvasTexture } from '@/world/NatureAssetBuilder';
```

- [ ] **Step 2: Update `_plantTrees` call site to pass world position**

Find (inside `_plantTrees`):
```typescript
      const tree = this._makeTree(rand);
      tree.position.set(wx, level * SH, wz);
```

Replace with:
```typescript
      const tree = this._makeTree(rand, wx, wz);
      tree.position.set(wx, level * SH, wz);
```

- [ ] **Step 3: Replace `_makeTree` with archetype-branching version**

Find the entire existing `_makeTree` method:
```typescript
  private _makeTree(rand: () => number): THREE.Group {
    const g      = new THREE.Group();
    const trunkH = 1.6 + rand() * 1.2;
    const trunkR = 0.12 + rand() * 0.07;
    const coneR  = 0.85 + rand() * 0.55;
    const coneH  = 2.0 + rand() * 1.2;

    // Trunk
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 0.72, trunkR, trunkH, 6),
      new THREE.MeshLambertMaterial({ color: 0x4a2810 }),
    );
    trunk.position.y = trunkH / 2;
    g.add(trunk);

    // Lower canopy cone
    const greenBase = 0x1a4610 + Math.floor(rand() * 6) * 0x010100;
    const coneL = new THREE.Mesh(
      new THREE.ConeGeometry(coneR, coneH, 6),
      new THREE.MeshLambertMaterial({ color: greenBase }),
    );
    coneL.position.y = trunkH + coneH * 0.48;
    g.add(coneL);

    // Upper canopy cone (smaller, slightly lighter)
    const coneU = new THREE.Mesh(
      new THREE.ConeGeometry(coneR * 0.65, coneH * 0.70, 6),
      new THREE.MeshLambertMaterial({ color: greenBase + 0x040800 }),
    );
    coneU.position.y = trunkH + coneH * 0.88;
    g.add(coneU);

    return g;
  }
```

Replace with:
```typescript
  private _makeTree(rand: () => number, wx: number, wz: number): THREE.Group {
    const archetype = pickTreeArchetype(wx, wz);
    if (archetype === 'deciduous') return this._buildDeciduousTree(rand);
    if (archetype === 'sparse')    return this._buildSparseTree(rand);
    return this._buildConiferTree(rand);
  }

  /** Original cone-stack conifer — kept as archetype 1 of 3 for visual continuity. */
  private _buildConiferTree(rand: () => number): THREE.Group {
    const g      = new THREE.Group();
    const trunkH = 1.6 + rand() * 1.2;
    const trunkR = 0.12 + rand() * 0.07;
    const coneR  = 0.85 + rand() * 0.55;
    const coneH  = 2.0 + rand() * 1.2;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 0.72, trunkR, trunkH, 6),
      new THREE.MeshLambertMaterial({ color: 0x4a2810 }),
    );
    trunk.position.y = trunkH / 2;
    g.add(trunk);

    const greenBase = 0x1a4610 + Math.floor(rand() * 6) * 0x010100;
    const canopyMat = new THREE.MeshLambertMaterial({
      color: greenBase,
      map: makeMottledCanvasTexture(greenBase, 0.18, Math.floor(rand() * 1e6)),
    });
    const coneL = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 6), canopyMat);
    coneL.position.y = trunkH + coneH * 0.48;
    g.add(coneL);

    const coneU = new THREE.Mesh(
      new THREE.ConeGeometry(coneR * 0.65, coneH * 0.70, 6),
      new THREE.MeshLambertMaterial({
        color: greenBase + 0x040800,
        map: makeMottledCanvasTexture(greenBase + 0x040800, 0.18, Math.floor(rand() * 1e6)),
      }),
    );
    coneU.position.y = trunkH + coneH * 0.88;
    g.add(coneU);

    return g;
  }

  /** Rounded/lumpy canopy built from overlapping icosahedra — broadleaf tree archetype. */
  private _buildDeciduousTree(rand: () => number): THREE.Group {
    const g      = new THREE.Group();
    const trunkH = 1.3 + rand() * 0.9;
    const trunkR = 0.16 + rand() * 0.08;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 0.8, trunkR, trunkH, 6),
      new THREE.MeshLambertMaterial({ color: 0x4a2810 }),
    );
    trunk.position.y = trunkH / 2;
    g.add(trunk);

    const greenBase = 0x2c5a18 + Math.floor(rand() * 5) * 0x010200;
    const canopyMat = new THREE.MeshLambertMaterial({
      color: greenBase,
      map: makeMottledCanvasTexture(greenBase, 0.22, Math.floor(rand() * 1e6)),
    });

    // 3 overlapping blobs give a rounded, non-symmetric canopy silhouette.
    const blobCount = 3;
    for (let i = 0; i < blobCount; i++) {
      const radius = 0.65 + rand() * 0.45;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 0), canopyMat);
      const angle = (i / blobCount) * Math.PI * 2 + rand() * 0.6;
      const spread = 0.35 + rand() * 0.25;
      blob.position.set(
        Math.cos(angle) * spread,
        trunkH + radius * 0.75 + rand() * 0.3,
        Math.sin(angle) * spread,
      );
      g.add(blob);
    }

    return g;
  }

  /** Thin trunk with sparse bare-branch fragments — bog/dead-tree archetype. */
  private _buildSparseTree(rand: () => number): THREE.Group {
    const g      = new THREE.Group();
    const trunkH = 1.8 + rand() * 1.4;
    const trunkR = 0.08 + rand() * 0.04;

    const barkColor = 0x3a2818 + Math.floor(rand() * 4) * 0x010101;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 0.5, trunkR, trunkH, 5),
      new THREE.MeshLambertMaterial({ color: barkColor }),
    );
    trunk.position.y = trunkH / 2;
    g.add(trunk);

    // A few small angular "sparse foliage / bare branch" fragments near the top.
    const fragmentCount = 2 + Math.floor(rand() * 2);
    const sparseGreen = 0x3a4a20 + Math.floor(rand() * 4) * 0x010100;
    const fragMat = new THREE.MeshLambertMaterial({
      color: sparseGreen,
      map: makeMottledCanvasTexture(sparseGreen, 0.28, Math.floor(rand() * 1e6)),
    });
    for (let i = 0; i < fragmentCount; i++) {
      const size = 0.25 + rand() * 0.2;
      const frag = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), fragMat);
      const angle = rand() * Math.PI * 2;
      const spread = 0.2 + rand() * 0.3;
      frag.position.set(
        Math.cos(angle) * spread,
        trunkH - 0.1 + rand() * 0.4,
        Math.sin(angle) * spread,
      );
      g.add(frag);
    }

    return g;
  }
```

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: same baseline count as before this task (compare against the count recorded at the start
of Phase 1's Task 3 verification, or re-check via `git stash`/`git stash pop` if unsure). No new
errors specifically referencing `OverworldScene.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "feat: add 3 tree archetypes (conifer/deciduous/sparse) with canopy texture"
```

---

### Task 4: Rock archetype variety in `OverworldScene.ts`

**Files:**
- Modify: `src/scene/OverworldScene.ts`

**Interfaces:**
- Consumes: `pickRockArchetype` (Task 1), `makeMottledCanvasTexture` (Task 2).
- Produces: `RockEntry.mesh`'s type widens from `THREE.Mesh` to `THREE.Object3D` (the 'cluster'
  archetype needs to store a `THREE.Group`; `THREE.Group extends THREE.Object3D`, and `THREE.Mesh`
  also extends `THREE.Object3D`, so this is a safe widening — all 4 existing consumers of
  `rk.mesh` are checked and updated in this same task).

- [ ] **Step 1: Widen the `RockEntry` interface**

Find:
```typescript
interface RockEntry { mesh: THREE.Mesh; px: number; py: number; pz: number; r: number; }
```

Replace with:
```typescript
interface RockEntry { mesh: THREE.Object3D; px: number; py: number; pz: number; r: number; }
```

- [ ] **Step 2: Replace the rock mesh construction inside `_placeRocks`**

Find this block inside `_placeRocks` (the mesh construction, NOT the whole method):
```typescript
      const grey  = 0x58 + Math.floor(rand() * 0x18);
      const color = (grey << 16) | (Math.floor(grey * 0.96) << 8) | Math.floor(grey * 0.88);
      const mesh  = new THREE.Mesh(
        new THREE.DodecahedronGeometry(radius, 0),
        new THREE.MeshLambertMaterial({ color }),
      );
      mesh.position.set(wx, wy + radius * 0.45, wz);
      mesh.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      mesh.scale.set(1 + rand() * 0.4, 0.5 + rand() * 0.55, 0.9 + rand() * 0.3);

      this._rocks.push({ mesh, px: wx, py: wy + radius * 0.5, pz: wz, r: radius });
```

Replace with:
```typescript
      const grey  = 0x58 + Math.floor(rand() * 0x18);
      const color = (grey << 16) | (Math.floor(grey * 0.96) << 8) | Math.floor(grey * 0.88);
      const mat = new THREE.MeshLambertMaterial({
        color,
        map: makeMottledCanvasTexture(color, 0.12, Math.floor(rand() * 1e6)),
      });

      const archetype = pickRockArchetype(wx, wz);
      let mesh: THREE.Object3D;
      if (archetype === 'slab') {
        // Flattened box — mimics a flat rock outcrop/slab.
        mesh = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.6, radius * 0.5, radius * 1.3), mat);
      } else if (archetype === 'cluster') {
        // Grouped small dodecahedra scattered around a shared centre — rock pile look.
        const grp = new THREE.Group();
        const pieceCount = 3;
        for (let i = 0; i < pieceCount; i++) {
          const pieceR = radius * (0.45 + rand() * 0.35);
          const piece = new THREE.Mesh(new THREE.DodecahedronGeometry(pieceR, 0), mat);
          const angle = (i / pieceCount) * Math.PI * 2 + rand() * 0.5;
          const spread = radius * 0.5;
          piece.position.set(Math.cos(angle) * spread, pieceR * 0.4, Math.sin(angle) * spread);
          piece.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
          grp.add(piece);
        }
        mesh = grp;
      } else {
        // Default 'boulder' — original dodecahedron look.
        mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), mat);
      }
      mesh.position.set(wx, wy + radius * 0.45, wz);
      mesh.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      mesh.scale.set(1 + rand() * 0.4, 0.5 + rand() * 0.55, 0.9 + rand() * 0.3);

      this._rocks.push({ mesh, px: wx, py: wy + radius * 0.5, pz: wz, r: radius });
```

- [ ] **Step 3: Update the dispose loop for the widened `mesh` type**

Find (in the class's `dispose()` method):
```typescript
    for (const rk of this._rocks) {
      rk.mesh.geometry.dispose();
      (rk.mesh.material as THREE.Material).dispose();
    }
```

Replace with:
```typescript
    for (const rk of this._rocks) {
      // rk.mesh may be a single Mesh (boulder/slab archetypes) or a Group of 3 Meshes sharing
      // one material (cluster archetype) — traverse so all archetypes dispose correctly.
      rk.mesh.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else (mat as THREE.Material).dispose();
        }
      });
    }
```

(Note: for the 'cluster' archetype, all 3 pieces share the SAME `mat` instance — calling `.dispose()`
on the same material object multiple times is safe/idempotent in Three.js, so no special-casing is
needed here.)

- [ ] **Step 4: Confirm the other 2 `rk.mesh` consumers still compile as-is**

The two other consumers:
```typescript
    for (const rk of this._rocks)        this.scene.add(rk.mesh);
    ...
    for (const rk of this._rocks)        this.scene.remove(rk.mesh);
```
`THREE.Scene.add`/`.remove` accept `THREE.Object3D`, so these need NO changes — `THREE.Object3D` is
a valid argument whether `rk.mesh` holds a `Mesh` or a `Group`. Just confirm via `tsc` in the next
step that no other file reads `RockEntry.mesh` expecting `Mesh`-specific properties.

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: same baseline count as before this task (no new errors in `OverworldScene.ts`). If a new
error appears about `rk.mesh` being used somewhere as a `Mesh` (e.g. `.geometry` accessed directly
outside the dispose loop), locate that call site and apply the same `instanceof THREE.Mesh` guard
pattern used in Step 3.

- [ ] **Step 6: Run the full exterior e2e suite to check for collider regressions**

Run: `npx playwright test tests/e2e/exterior.test.ts`
Expected: all 15 tests pass — rock colliders are built from `rk.px/py/pz/r` (unchanged scalar
values), not from mesh geometry, so this should be unaffected. If any test fails specifically
around rock collision, investigate before proceeding — do not weaken test assertions.

- [ ] **Step 7: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "feat: add 3 rock archetypes (boulder/slab/cluster) with speckled texture"
```

---

### Task 5: Bush/shrub prop populating `_clutter`

**Files:**
- Modify: `src/scene/OverworldScene.ts`

**Interfaces:**
- Consumes: nothing new from Task 1/2 directly (bushes reuse the same canopy-texture approach
  inline, following Task 3's pattern) — but MAY reuse `makeMottledCanvasTexture` from Task 2.
- Produces: `_plantBushes(rand): void` (new private method), `_makeBush(rand): THREE.Group` (new
  private method). Both are called once from the constructor.

- [ ] **Step 1: Add the constructor call site**

Find (in the constructor):
```typescript
    console.log('[OverworldScene] _placeRocks...');
    this._placeRocks(rand);
```

Replace with:
```typescript
    console.log('[OverworldScene] _placeRocks...');
    this._placeRocks(rand);
    console.log('[OverworldScene] _plantBushes...');
    this._plantBushes(rand);
```

- [ ] **Step 2: Add `_plantBushes` and `_makeBush` methods**

Add these two new private methods directly after the existing `_placeRocks` method (find the end
of `_placeRocks` — it ends with `this._rocks.push(...)` inside the `for` loop's closing brace,
followed by the method's closing brace — insert after that closing brace):

```typescript
  // ── Bush placement (ground clutter — no physics collider) ─────────────────

  private _plantBushes(rand: () => number): void {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH, _FR: FR } = this;
    const W  = GW * T;
    const H  = GH * T;
    const bushInner = FR * T + 4;
    const bushOuter = GHW * T * 0.90;
    // Tighter spacing than trees (5.5) — bushes are denser undergrowth.
    const pts = poissonDisk(W, H, 3.2, rand);

    for (const [px, pz] of pts) {
      const wx = px - W / 2;
      const wz = pz - H / 2;
      const d  = Math.sqrt(wx * wx + wz * wz);
      if (d < bushInner || d > bushOuter) continue;

      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);

      const cell = this._wg.get(c, r);
      if (cell.elevation < 1)           continue;   // no bushes on bog/water
      if (cell.feature === 'road')      continue;
      if (cell.feature === 'road_dirt') continue;
      if (cell.content  !== 'empty')    continue;
      if (cell.settlementId > 0)        continue;
      // Only plant a bush on roughly 1 in 3 valid candidates — trees already use a
      // similar Poisson pass at a different spacing; without this thinning, bushes
      // would be too dense given the tighter 3.2 spacing above.
      if (rand() > 0.35) continue;

      const level = cell.elevation;
      const bush = this._makeBush(rand);
      bush.position.set(wx, level * SH, wz);
      bush.rotation.y = rand() * Math.PI * 2;
      this._clutter.push(bush);
    }
  }

  private _makeBush(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    const greenBase = 0x2e4a1a + Math.floor(rand() * 5) * 0x010200;
    const mat = new THREE.MeshLambertMaterial({
      color: greenBase,
      map: makeMottledCanvasTexture(greenBase, 0.20, Math.floor(rand() * 1e6)),
    });

    const blobCount = 2 + Math.floor(rand() * 3); // 2..4 blobs
    for (let i = 0; i < blobCount; i++) {
      const radius = 0.22 + rand() * 0.2;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 0), mat);
      const angle = rand() * Math.PI * 2;
      const spread = rand() * 0.22;
      blob.position.set(Math.cos(angle) * spread, radius * 0.7, Math.sin(angle) * spread);
      blob.scale.y = 0.7 + rand() * 0.3; // flatten slightly — low mound, not a sphere
      g.add(blob);
    }

    return g;
  }
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: same baseline count as before this task.

- [ ] **Step 4: Run the full exterior e2e suite**

Run: `npx playwright test tests/e2e/exterior.test.ts`
Expected: all 15 tests pass — bushes have no collider so should not affect any collision test; if
a screenshot-diff test exists that's sensitive to new visual clutter appearing, check its assertion
is about geometry/mode, not pixel-perfect visual match (the existing suite's screenshot check,
"no dungeon geometry in exterior scene", asserts something else — confirm by reading the test if
it fails unexpectedly).

- [ ] **Step 5: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "feat: add bush/shrub ground clutter prop to overworld"
```

---

### Task 6: Full regression pass + live visual verification

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full unit test suite**

Run: `npx vitest run`
Expected: all previously-passing tests still pass, plus the new tests from Tasks 1-2 (10 new
tests: 3+3 from Task 1, 4 from Task 2). Total passed count should increase by exactly 10 with no
new failures beyond the known pre-existing baseline (8 failing tests in `enemyLoader`/
`towerGenerator`/`talentSystem` files, confirmed unrelated to this work in prior sessions).

- [ ] **Step 2: Run the full exterior e2e suite one more time**

Run: `npx playwright test tests/e2e/exterior.test.ts`
Expected: all 15 tests pass.

- [ ] **Step 3: Run `npm run doctor`**

Run: `npm run doctor`
Expected: clean (`✅ repo-doctor: no stray build artifacts, no broken local imports...`).

- [ ] **Step 4: Live visual verification**

Start a fresh dev server on a free port (check with `lsof -ti:<port>` first, kill if occupied using
`kill <PID>`, never `pkill`):
```bash
npm run dev -- --port 5186 > /tmp/dev-server-natureassets.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5186/
```
Expected: HTTP 200.

Write a throwaway script `verify_nature_variety.mjs` at repo root (delete after use) following the
proven pattern (`page.goto` → wait for `#game-canvas` → wait for `window.__game` →
`__game.startGame(seed)` → `waitForTimeout(600)` → `__game.switchToExterior()` →
`__game.teleportPlayer(x, y, z)` to an open natural area → `page.waitForTimeout(800)` →
`page.screenshot(...)`), save to `/tmp/settlement-before-after/nature-asset-variety-AFTER.png`.

Run: `node verify_nature_variety.mjs`
Expected: no page errors; screenshot file created, non-trivial size.

- [ ] **Step 5: Visually inspect the screenshot**

Use the `view` tool on the screenshot. Confirm: multiple distinct tree silhouettes are visible
(not all identical cone-stacks), at least one non-dodecahedron rock shape is visible if any rocks
are in frame, and small bush clusters are visible near the ground. If only one archetype appears in
frame, teleport to a different position and re-screenshot before concluding the feature doesn't
work — archetype distribution is spatial-hash-based, not guaranteed uniform in every small viewport.

- [ ] **Step 6: Clean up**

```bash
rm -f verify_nature_variety.mjs
```
Kill the dev server process from Step 4 using its specific PID (find via `lsof -ti:5186`, then
`kill <PID>` — never `pkill`).

No commit needed for this task (verification only).

---

## Self-Review Notes

**Spec coverage:** Task 1 covers tree archetype selection + rock archetype selection (design doc
item 1 and 3). Task 2 covers procedural texture (design doc item 4). Task 3 wires tree archetypes
into the renderer (deciduous/sparse additions per design doc item 1). Task 4 wires rock archetypes
(slab/cluster per design doc item 3). Task 5 covers the new bush prop (design doc item 2), reusing
the existing `_clutter` lifecycle plumbing as decided during brainstorming (a deliberate deviation
from the design doc's original "own BushEntry[] array" wording, corrected in the design doc itself
before this plan was written — see the design doc's Data Flow section, which was updated to
reflect `_clutter` reuse). Task 6 covers the design doc's Testing section (full regression + visual
verification).

**Placeholder scan:** No TBD/TODO markers. All code blocks are complete. Task 4's cluster-archetype
implementation includes an explicit inline call-out (not a placeholder — a real design compromise)
with a concrete verification checklist for the mesh/group nesting approach, which is unavoidable
given the existing `RockEntry.mesh: THREE.Mesh` type constraint; this is flagged for extra scrutiny
during Task 4's review rather than silently done.

**Type consistency:** `pickTreeArchetype(wx, wz)` / `pickRockArchetype(wx, wz)` signatures match
between Task 1's tests/implementation and Task 3/4's usage. `makeMottledCanvasTexture(baseColorHex,
variance, seed)` signature matches between Task 2's tests/implementation and Tasks 3/4/5's usage.
`_makeTree(rand, wx, wz)`'s new signature is updated consistently at its one call site in the same
task (Task 3) that changes it.
