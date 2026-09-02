# Elven Stone-Tower Kit (Phase 6 POC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a modular octagon-cross-section "ring stack" tower construction system (base/plinth, wall rings, roof cap), with two swappable wall-surface strategies (procedural texture vs. real block geometry) that get directly compared, hybrid stone + living-tree elven decoration, and wire it in as elven's `watchtower`/`tower` building kinds so it's testable live via Overworld Studio's Settlement Lab.

**Architecture:** A shared octagon cross-section (`StoneTowerShape.ts`) underlies everything. Two wall-surface strategies (`StoneTowerWallSurface.ts`) share one interface — Strategy T (a plain textured octagonal prism) and Strategy G (individual protruding stone blocks per course, merged into one draw call) — so the tower-assembly code is agnostic to which is active. A roof-cap module (`StoneTowerRoofCap.ts`) offers a classic conical-shingle cap and a living-canopy cap (a small dedicated `BlockKit` grid). The top-level orchestrator (`StoneTowerKit.ts`) stacks base + N wall rings + roof cap and derives all procedural variation from `dna.seed`. Finally, `FactionBuildingVariants.ts` wires this in as elven's `watchtower`/`tower` override (currently unstyled, so purely additive).

**Tech Stack:** TypeScript, Three.js (`THREE.BufferGeometry`, `THREE.CylinderGeometry`, `THREE.ConeGeometry`, `THREE.BoxGeometry`), existing `BlockKit.ts` primitives (`createBlockGrid`/`setBlock`/`meshBlockGrid`) for the living roof cap only, existing `mergeGroupMeshesByMaterial` utility, Vitest.

## Global Constraints

- Octagon cross-section (8 sides) for every tower piece — matches the reference image's faceted-round silhouette and keeps per-ring triangle counts low.
- Angle convention for all new geometry code in this plan: `x = radius * Math.sin(angle)`, `z = radius * Math.cos(angle)` (matches `THREE.CylinderGeometry`'s own internal convention, verified against its source in the prior rounded-corners round) — `angle = 0` is local `+Z` (north), increasing angle rotates toward `+X` (east).
- Strategy G (real block geometry) is the shipped default (`WALL_STRATEGY = 'blocks'` in `StoneTowerWallSurface.ts`) per the user's explicit preference; Strategy T (textured) must still be fully implemented and tested for direct comparison, not deleted or left partial.
- All blocks in Strategy G share one material object reference (not per-block clones) so `mergeGroupMeshesByMaterial()` (buckets by material identity) actually merges them into one draw call — visual variation comes from geometry (size/protrusion), not per-block material/color cloning.
- This POC touches **only** elven's `watchtower`/`tower` building kinds. No other faction, no other elven kind (villa/chapel/shop/house/terraced/inn/blacksmith), is modified.
- Follow TDD: write the failing test, confirm it fails, implement, confirm it passes, commit.
- Commit messages: write to a temp file and use `git commit -F <tempfile>` (avoids double-quote mis-parsing), ending with `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`.

---

### Task 1: Shared octagon cross-section math

**Files:**
- Create: `src/world/buildings/StoneTowerShape.ts`
- Test: `tests/world/buildings/StoneTowerShape.test.ts`

**Interfaces:**
- Consumes: nothing (pure math, no dependencies on other new files).
- Produces: `octagonPoints(radius: number): [number, number][]` (8 points), `OctagonFace { a: [number,number]; b: [number,number]; normalAngle: number }`, `octagonFaces(radius: number): OctagonFace[]` (8 faces) — used by Task 4 (`buildWallSurfaceBlocks`).

- [ ] **Step 1: Write the failing test**

Create `tests/world/buildings/StoneTowerShape.test.ts`:

```ts
/**
 * StoneTowerShape.test.ts — shared octagon cross-section math for the
 * elven stone-tower kit POC. See docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md.
 */

import { describe, it, expect } from 'vitest';
import { octagonPoints, octagonFaces } from '@/world/buildings/StoneTowerShape';

describe('octagonPoints', () => {
  it('returns exactly 8 points', () => {
    expect(octagonPoints(2)).toHaveLength(8);
  });

  it('every point sits at exactly the given radius from the origin', () => {
    const pts = octagonPoints(2.5);
    for (const [x, z] of pts) {
      expect(Math.hypot(x, z)).toBeCloseTo(2.5, 9);
    }
  });

  it('the first point is at local +Z (angle 0): (0, radius)', () => {
    const [first] = octagonPoints(3);
    expect(first![0]).toBeCloseTo(0, 9);
    expect(first![1]).toBeCloseTo(3, 9);
  });

  it('is deterministic', () => {
    expect(octagonPoints(2)).toEqual(octagonPoints(2));
  });
});

describe('octagonFaces', () => {
  it('returns exactly 8 faces', () => {
    expect(octagonFaces(2)).toHaveLength(8);
  });

  it("each face's a/b endpoints match consecutive octagonPoints entries", () => {
    const pts = octagonPoints(2);
    const faces = octagonFaces(2);
    for (let i = 0; i < 8; i++) {
      expect(faces[i]!.a).toEqual(pts[i]);
      expect(faces[i]!.b).toEqual(pts[(i + 1) % 8]);
    }
  });

  it("each face's midpoint sits at the regular-octagon apothem distance (radius * cos(PI/8))", () => {
    const radius = 2;
    const faces = octagonFaces(radius);
    const expectedApothem = radius * Math.cos(Math.PI / 8);
    for (const face of faces) {
      const midX = (face.a[0] + face.b[0]) / 2;
      const midZ = (face.a[1] + face.b[1]) / 2;
      expect(Math.hypot(midX, midZ)).toBeCloseTo(expectedApothem, 9);
    }
  });

  it("normalAngle matches the module's x=r*sin(angle), z=r*cos(angle) convention (round-tripping through the face midpoint)", () => {
    const radius = 2;
    const faces = octagonFaces(radius);
    for (const face of faces) {
      const midX = (face.a[0] + face.b[0]) / 2;
      const midZ = (face.a[1] + face.b[1]) / 2;
      const apothem = radius * Math.cos(Math.PI / 8);
      expect(apothem * Math.sin(face.normalAngle)).toBeCloseTo(midX, 9);
      expect(apothem * Math.cos(face.normalAngle)).toBeCloseTo(midZ, 9);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/buildings/StoneTowerShape.test.ts`
Expected: FAIL with a module-not-found error for `@/world/buildings/StoneTowerShape`.

- [ ] **Step 3: Implement**

Create `src/world/buildings/StoneTowerShape.ts`:

```ts
/**
 * StoneTowerShape.ts — shared octagon cross-section math for the elven
 * stone-tower kit POC (docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md). Every tower piece (base,
 * wall rings, roof cap) shares this same 8-sided cross-section, matching
 * the faceted-round silhouette in the user's reference image while
 * keeping per-ring triangle counts low.
 *
 * Angle convention: `x = radius * Math.sin(angle)`, `z = radius *
 * Math.cos(angle)` — matches THREE.CylinderGeometry's own internal
 * convention (angle 0 = local +Z/"north", increasing angle rotates
 * toward +X/"east"), so geometry built here stays consistent with
 * THREE's built-in primitives used elsewhere in this kit (e.g.
 * StoneTowerWallSurface.ts's textured-strategy CylinderGeometry).
 */

const SIDES = 8;

/** Returns the 8 corner points of a regular octagon of the given
 * circumradius, as [x, z] pairs. Point 0 is at local +Z (angle 0). */
export function octagonPoints(radius: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < SIDES; i++) {
    const angle = (i / SIDES) * Math.PI * 2;
    pts.push([radius * Math.sin(angle), radius * Math.cos(angle)]);
  }
  return pts;
}

/** One face of the octagon: its two corner points, and the angle (this
 * module's sin/cos convention) that bisects them — i.e. the direction
 * pointing straight out from the face's midpoint. */
export interface OctagonFace {
  a: [number, number];
  b: [number, number];
  normalAngle: number;
}

/** Returns the 8 faces of a regular octagon of the given circumradius,
 * in the same winding order as octagonPoints(). */
export function octagonFaces(radius: number): OctagonFace[] {
  const pts = octagonPoints(radius);
  const faces: OctagonFace[] = [];
  for (let i = 0; i < SIDES; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % SIDES]!;
    const midX = (a[0] + b[0]) / 2;
    const midZ = (a[1] + b[1]) / 2;
    faces.push({ a, b, normalAngle: Math.atan2(midX, midZ) });
  }
  return faces;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/buildings/StoneTowerShape.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
feat: add shared octagon cross-section math for stone-tower kit

New StoneTowerShape.ts provides octagonPoints()/octagonFaces() -- the
shared 8-sided cross-section every stone-tower piece (base, wall rings,
roof cap) will build on. Pure math, no THREE.js geometry yet.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add src/world/buildings/StoneTowerShape.ts tests/world/buildings/StoneTowerShape.test.ts
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 2: `ashlarTexture()` — refined elven dressed-stone texture

**Files:**
- Modify: `src/world/buildings/FactionBlockTextures.ts`
- Test: `tests/world/FactionBlockTextures.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ashlarTexture(repX?: number, repY?: number): THREE.CanvasTexture` — used by Task 9 (`buildElvenStoneTower`'s palette) for Strategy T and as the base color/roughness map shared by Strategy G's blocks too.

- [ ] **Step 1: Write the failing test**

Modify `tests/world/FactionBlockTextures.test.ts` — add `ashlarTexture` to the existing shared-convention test table (this file already loops `ALL_TEXTURES` through 5 generic tests per texture, so adding one entry gets full coverage for free):

Find:
```ts
import {
  earthTexture,
  graniteTexture,
  barkTexture,
  hideTexture,
  ashStoneTexture,
  obsidianTexture,
  toadstoolTexture,
} from '@/world/buildings/FactionBlockTextures';

const ALL_TEXTURES: Array<[string, (repX?: number, repY?: number) => THREE.CanvasTexture]> = [
  ['earthTexture', earthTexture],
  ['graniteTexture', graniteTexture],
  ['barkTexture', barkTexture],
  ['hideTexture', hideTexture],
  ['ashStoneTexture', ashStoneTexture],
  ['obsidianTexture', obsidianTexture],
  ['toadstoolTexture', toadstoolTexture],
];
```

Replace with:
```ts
import {
  earthTexture,
  graniteTexture,
  barkTexture,
  hideTexture,
  ashStoneTexture,
  obsidianTexture,
  toadstoolTexture,
  ashlarTexture,
} from '@/world/buildings/FactionBlockTextures';

const ALL_TEXTURES: Array<[string, (repX?: number, repY?: number) => THREE.CanvasTexture]> = [
  ['earthTexture', earthTexture],
  ['graniteTexture', graniteTexture],
  ['barkTexture', barkTexture],
  ['hideTexture', hideTexture],
  ['ashStoneTexture', ashStoneTexture],
  ['obsidianTexture', obsidianTexture],
  ['toadstoolTexture', toadstoolTexture],
  ['ashlarTexture', ashlarTexture],
];
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/FactionBlockTextures.test.ts`
Expected: FAIL — `ashlarTexture` doesn't exist yet in `FactionBlockTextures.ts` (import error).

- [ ] **Step 3: Implement**

In `src/world/buildings/FactionBlockTextures.ts`, find the exact canvas cache declaration block:

```ts
let _earthCanvas:     HTMLCanvasElement | null = null;
let _graniteCanvas:   HTMLCanvasElement | null = null;
let _barkCanvas:      HTMLCanvasElement | null = null;
let _hideCanvas:      HTMLCanvasElement | null = null;
let _ashStoneCanvas:  HTMLCanvasElement | null = null;
let _obsidianCanvas:  HTMLCanvasElement | null = null;
let _toadstoolCanvas: HTMLCanvasElement | null = null;
```

Replace with:

```ts
let _earthCanvas:     HTMLCanvasElement | null = null;
let _graniteCanvas:   HTMLCanvasElement | null = null;
let _barkCanvas:      HTMLCanvasElement | null = null;
let _hideCanvas:      HTMLCanvasElement | null = null;
let _ashStoneCanvas:  HTMLCanvasElement | null = null;
let _obsidianCanvas:  HTMLCanvasElement | null = null;
let _toadstoolCanvas: HTMLCanvasElement | null = null;
let _ashlarCanvas:    HTMLCanvasElement | null = null;
```

Then find this exact existing text (the end of `_buildGraniteCanvas()` and the start of the bark section):

```ts
}
  return c;
}

// ── Bark — elven living trunks ────────────────────────────────────────────────
// Vertical wood-grain striations with occasional knots.
```

Replace with (inserting the new ashlar section between them):

```ts
}
  return c;
}

// ── Ashlar — refined elven dressed stone ─────────────────────────────────────
// Larger, more uniform, cooler-grey coursed blocks than dwarven's
// rougher graniteTexture() (which uses a rough salt-and-pepper
// speckle) -- reads as refined elven masonry rather than crude-hewn
// dwarven stone, keeping faction identity distinct even though both
// are "grey stone" materials.

function _buildAshlarCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return c;

  g.fillStyle = '#9aa0a8';
  g.fillRect(0, 0, 256, 256);

  const palette = ['#a4aab2', '#9ea4ac', '#98a0a8', '#a8aeb4'];
  const bw = 84, bh = 44, mortar = 3;
  let y = 0, row = 0;
  while (y < 260) {
    const offset = row % 2 === 0 ? 0 : bw / 2;
    let x = -offset;
    while (x < 260) {
      const col = palette[Math.floor(Math.random() * palette.length)]!;
      g.fillStyle = col;
      g.fillRect(x + mortar, y + mortar, bw - mortar, bh - mortar);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x + mortar, y + mortar, bw - mortar, 2);
      g.fillStyle = 'rgba(0,0,0,0.1)';
      g.fillRect(x + mortar, y + bh - mortar - 2, bw - mortar, 2);
      x += bw;
    }
    y += bh;
    row++;
  }
  return c;
}

// ── Bark — elven living trunks ────────────────────────────────────────────────
// Vertical wood-grain striations with occasional knots.
```

Finally, at the very end of the file (after `toadstoolTexture()`'s closing brace, which is the file's last existing line), append:

```ts

/** Larger, uniform, cooler-grey dressed ashlar blocks — elven stone
 * towers (distinct from graniteTexture()'s rougher dwarven speckle). */
export function ashlarTexture(repX = 1, repY = 1): THREE.CanvasTexture {
  if (!_ashlarCanvas) _ashlarCanvas = _buildAshlarCanvas();
  return _wrap(new THREE.CanvasTexture(_ashlarCanvas), repX, repY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/FactionBlockTextures.test.ts`
Expected: PASS (all tests, including the 5 new ones for `ashlarTexture`).

- [ ] **Step 5: Commit**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
feat: add ashlarTexture for elven stone-tower kit

New refined dressed-stone canvas texture in FactionBlockTextures.ts --
larger, more uniform, cooler-grey blocks than dwarven's rougher
graniteTexture(), keeping faction identity distinct. Used by the
elven stone-tower kit's textured wall strategy and as the base
color/roughness map for its block-geometry strategy.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add src/world/buildings/FactionBlockTextures.ts tests/world/FactionBlockTextures.test.ts
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 3: Wall surface Strategy T (textured octagonal prism)

**Files:**
- Create: `src/world/buildings/StoneTowerWallSurface.ts`
- Test: `tests/world/buildings/StoneTowerWallSurface.test.ts`

**Interfaces:**
- Consumes: nothing from other new files yet (Task 4 will extend this same file/test file to add Strategy G).
- Produces: `buildWallSurfaceTextured(radius: number, height: number, material: THREE.Material): THREE.Group` — used directly by Task 9 (via the `buildWallSurface` dispatcher added in Task 4).

- [ ] **Step 1: Write the failing test**

Create `tests/world/buildings/StoneTowerWallSurface.test.ts`:

```ts
/**
 * StoneTowerWallSurface.test.ts — the two swappable wall-surface
 * strategies for the elven stone-tower kit POC (textured prism vs. real
 * block geometry). See docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildWallSurfaceTextured } from '@/world/buildings/StoneTowerWallSurface';

function countTriangles(group: THREE.Group): number {
  let tris = 0;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const pos = o.geometry.attributes.position;
      tris += o.geometry.index ? o.geometry.index.count / 3 : pos.count / 3;
    }
  });
  return tris;
}

function hasNaN(group: THREE.Group): boolean {
  let bad = false;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count * 3; i++) {
        if (!Number.isFinite(pos.array[i])) bad = true;
      }
    }
  });
  return bad;
}

describe('buildWallSurfaceTextured (Strategy T)', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#9aa0a8' });

  it('produces a group with at least one mesh', () => {
    const g = buildWallSurfaceTextured(2, 3, mat);
    let meshCount = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
    expect(meshCount).toBeGreaterThan(0);
  });

  it('produces finite, non-NaN geometry', () => {
    const g = buildWallSurfaceTextured(2, 3, mat);
    expect(hasNaN(g)).toBe(false);
  });

  it('is cheap: an 8-sided prism has at most a few dozen triangles', () => {
    const g = buildWallSurfaceTextured(2, 3, mat);
    expect(countTriangles(g)).toBeLessThan(50);
  });

  it('is deterministic', () => {
    const g1 = buildWallSurfaceTextured(2, 3, mat);
    const g2 = buildWallSurfaceTextured(2, 3, mat);
    expect(countTriangles(g1)).toBe(countTriangles(g2));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/buildings/StoneTowerWallSurface.test.ts`
Expected: FAIL with a module-not-found error for `@/world/buildings/StoneTowerWallSurface`.

- [ ] **Step 3: Implement**

Create `src/world/buildings/StoneTowerWallSurface.ts`:

```ts
/**
 * StoneTowerWallSurface.ts — the two swappable wall-surface strategies
 * for the elven stone-tower kit POC (docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md): a cheap textured
 * octagonal prism (Strategy T) vs. real protruding stone-block geometry
 * per course (Strategy G, added in a later task). Both share the
 * `buildWallSurface()` dispatcher's signature so the tower-assembly code
 * (StoneTowerKit.ts) is agnostic to which is active.
 */

import * as THREE from 'three';

/**
 * Strategy T: a plain 8-sided extruded prism (matches
 * StoneTowerShape.ts's octagon cross-section exactly, since
 * THREE.CylinderGeometry with radialSegments=8 produces the identical
 * regular octagon -- verified: both use x=r*sin(theta), z=r*cos(theta)).
 * Cheapest possible wall surface; relies entirely on the material's
 * texture map for the coursed-stone look.
 */
export function buildWallSurfaceTextured(radius: number, height: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(radius, radius, height, 8, 1, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = height / 2;
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/buildings/StoneTowerWallSurface.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
feat: add textured wall surface strategy (Strategy T) for stone towers

buildWallSurfaceTextured() -- a cheap 8-sided extruded prism relying on
the material's texture map for coursed-stone detail. First of two
swappable wall-surface strategies for the elven stone-tower kit POC;
Strategy G (real block geometry) follows in the next task for direct
comparison.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add src/world/buildings/StoneTowerWallSurface.ts tests/world/buildings/StoneTowerWallSurface.test.ts
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 4: Wall surface Strategy G (real block geometry) + T-vs-G comparison

**Files:**
- Modify: `src/world/buildings/StoneTowerWallSurface.ts`
- Test: `tests/world/buildings/StoneTowerWallSurface.test.ts`

**Interfaces:**
- Consumes: `octagonFaces(radius): OctagonFace[]` from Task 1's `StoneTowerShape.ts`; `mergeGroupMeshesByMaterial(group: THREE.Group): void` from the existing `@/scene/MeshMergeUtils`; `mulberry32(seed: number): () => number` from the existing `@/core/prng`.
- Produces: `WallBlockOptions { courseHeight?: number; blocksPerFace?: number; jitter?: number }`, `buildWallSurfaceBlocks(radius: number, height: number, seed: number, material: THREE.Material, opts?: WallBlockOptions): THREE.Group`, `WallStrategy = 'textured' | 'blocks'`, `WALL_STRATEGY: WallStrategy` (module-level const, `'blocks'`), `buildWallSurface(strategy: WallStrategy, radius: number, height: number, seed: number, material: THREE.Material): THREE.Group` — all used by Task 9 (`buildElvenStoneTower`/`buildTowerWallRing`/`buildTowerBase`).

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/buildings/StoneTowerWallSurface.test.ts` (after the existing `import` line, add two more imports; after the existing `describe('buildWallSurfaceTextured (Strategy T)', ...)` block, add two new `describe` blocks):

Change the import line from:
```ts
import { buildWallSurfaceTextured } from '@/world/buildings/StoneTowerWallSurface';
```
to:
```ts
import { buildWallSurfaceTextured, buildWallSurfaceBlocks, buildWallSurface, WALL_STRATEGY } from '@/world/buildings/StoneTowerWallSurface';
```

Then add, after the closing `});` of the `describe('buildWallSurfaceTextured (Strategy T)', ...)` block:

```ts
describe('buildWallSurfaceBlocks (Strategy G)', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#9aa0a8' });

  it('produces finite, non-NaN geometry', () => {
    const g = buildWallSurfaceBlocks(2, 3, 42, mat);
    expect(hasNaN(g)).toBe(false);
  });

  it('is deterministic for the same seed', () => {
    const g1 = buildWallSurfaceBlocks(2, 3, 42, mat);
    const g2 = buildWallSurfaceBlocks(2, 3, 42, mat);
    expect(countTriangles(g1)).toBe(countTriangles(g2));
  });

  it('different seeds still produce the same triangle count (jitter affects size/position, not block count)', () => {
    const g1 = buildWallSurfaceBlocks(2, 3, 1, mat);
    const g2 = buildWallSurfaceBlocks(2, 3, 2, mat);
    expect(countTriangles(g1)).toBe(countTriangles(g2));
  });

  it('merges into very few draw calls regardless of block count (mergeGroupMeshesByMaterial ran)', () => {
    const g = buildWallSurfaceBlocks(2, 3, 42, mat, { blocksPerFace: 4, courseHeight: 0.3 });
    let meshCount = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
    // Many blocks (8 faces * 4 blocks/face * 10 courses = 320) must merge
    // down to a small handful of meshes (one shared material -> ~1 merged
    // mesh), not stay as 320 separate draw calls.
    expect(meshCount).toBeLessThan(5);
  });

  it('honours blocksPerFace/courseHeight options (more blocks -> more triangles)', () => {
    const coarse = buildWallSurfaceBlocks(2, 3, 42, mat, { blocksPerFace: 2, courseHeight: 1 });
    const fine = buildWallSurfaceBlocks(2, 3, 42, mat, { blocksPerFace: 4, courseHeight: 0.3 });
    expect(countTriangles(fine)).toBeGreaterThan(countTriangles(coarse));
  });
});

describe('buildWallSurface dispatcher', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#9aa0a8' });

  it("'textured' dispatches to the cheap prism strategy", () => {
    const dispatched = buildWallSurface('textured', 2, 3, 42, mat);
    const direct = buildWallSurfaceTextured(2, 3, mat);
    expect(countTriangles(dispatched)).toBe(countTriangles(direct));
  });

  it("'blocks' dispatches to the real-geometry strategy", () => {
    const dispatched = buildWallSurface('blocks', 2, 3, 42, mat);
    const direct = buildWallSurfaceBlocks(2, 3, 42, mat);
    expect(countTriangles(dispatched)).toBe(countTriangles(direct));
  });

  it('WALL_STRATEGY (the shipped default) is "blocks" per the user\'s explicit preference for real geometry', () => {
    expect(WALL_STRATEGY).toBe('blocks');
  });
});

describe('Strategy T vs Strategy G -- measured comparison (answers "is real geometry too expensive?")', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#9aa0a8' });

  it('records triangle count and generation time for both strategies at realistic tower-ring dimensions', () => {
    const radius = 2, height = 2.9; // one FLOOR_HEIGHT*0.9-ish ring
    const tStart = performance.now();
    const gTextured = buildWallSurfaceTextured(radius, height, mat);
    const tTexturedMs = performance.now() - tStart;

    const gStart = performance.now();
    const gBlocks = buildWallSurfaceBlocks(radius, height, 42, mat);
    const gBlocksMs = performance.now() - gStart;

    const trisTextured = countTriangles(gTextured);
    const trisBlocks = countTriangles(gBlocks);

    // eslint-disable-next-line no-console
    console.log(
      `[StoneTowerWallSurface T-vs-G] textured: ${trisTextured} tris in ${tTexturedMs.toFixed(2)}ms | ` +
      `blocks: ${trisBlocks} tris in ${gBlocksMs.toFixed(2)}ms (one wall ring, radius=${radius}, height=${height})`,
    );

    // Real assertions (not just logging): G has strictly more triangles
    // than T (expected -- that's the whole point of real geometry), but
    // both must still complete well within a single frame budget even at
    // this small unit-test scale (generous absolute ceiling, not a tight
    // flaky threshold) -- and G's per-ring triangle count must stay in a
    // sane range (not accidentally quadratic/exploding).
    expect(trisBlocks).toBeGreaterThan(trisTextured);
    expect(gBlocksMs).toBeLessThan(500);
    expect(trisBlocks).toBeLessThan(2000); // one ring; a whole tower stacks ~5 of these
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/buildings/StoneTowerWallSurface.test.ts`
Expected: FAIL — `buildWallSurfaceBlocks`, `buildWallSurface`, `WALL_STRATEGY` don't exist yet.

- [ ] **Step 3: Implement**

Add to `src/world/buildings/StoneTowerWallSurface.ts` (after the existing `buildWallSurfaceTextured` function; also add two new imports at the top of the file):

Change the top of the file from:
```ts
import * as THREE from 'three';
```
to:
```ts
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { mergeGroupMeshesByMaterial } from '@/scene/MeshMergeUtils';
import { octagonFaces } from './StoneTowerShape';
```

Then append:

```ts
/** Options for Strategy G's per-course block subdivision. */
export interface WallBlockOptions {
  /** World units per course (row of blocks). Default 0.5. */
  courseHeight?: number;
  /** How many blocks split each octagon face's width. Default 3. */
  blocksPerFace?: number;
  /** 0-1 fraction of per-block size/protrusion variance. Default 0.15. */
  jitter?: number;
}

/**
 * Strategy G: each course (a horizontal band) is built from individual
 * slightly-protruding stone blocks arranged around the octagon's
 * circumference -- a polar-coordinate sibling of BlockKit's own "many
 * small solid pieces read as hand-built" philosophy, using plain
 * THREE.BoxGeometry rather than a Cartesian voxel grid (an octagon
 * doesn't fit BlockKit's axis-aligned cells). Alternating courses shift
 * by half a block width (running-bond coursing, matching real masonry
 * and this codebase's own `_buildBrickCanvas()` convention in
 * TextureFactory.ts). All blocks share ONE material object reference
 * (never cloned) so `mergeGroupMeshesByMaterial()` -- which buckets by
 * material identity -- merges the whole tower ring into a single draw
 * call regardless of block count; visual variation comes from geometry
 * (size/protrusion jitter), not per-block material cloning.
 */
export function buildWallSurfaceBlocks(
  radius: number, height: number, seed: number, material: THREE.Material,
  opts: WallBlockOptions = {},
): THREE.Group {
  const g = new THREE.Group();
  const courseHeight = opts.courseHeight ?? 0.5;
  const blocksPerFace = opts.blocksPerFace ?? 3;
  const jitter = opts.jitter ?? 0.15;
  const rand = mulberry32(seed);
  const faces = octagonFaces(radius);
  const numCourses = Math.max(1, Math.round(height / courseHeight));
  const actualCourseH = height / numCourses;
  const blockDepth = 0.18;

  for (let course = 0; course < numCourses; course++) {
    const y = course * actualCourseH + actualCourseH / 2;
    const rowOffset = course % 2 === 1 ? 0.5 / blocksPerFace : 0;
    for (const face of faces) {
      const [ax, az] = face.a;
      const [bx, bz] = face.b;
      const faceLen = Math.hypot(bx - ax, bz - az);
      const blockW = (faceLen / blocksPerFace) * 0.92; // leave a mortar gap
      const outwardX = Math.sin(face.normalAngle);
      const outwardZ = Math.cos(face.normalAngle);
      for (let bi = 0; bi < blocksPerFace; bi++) {
        let t = (bi + 0.5) / blocksPerFace + rowOffset;
        t = ((t % 1) + 1) % 1; // wrap into [0,1)
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        const sizeJ = 1 + (rand() - 0.5) * jitter;
        const protrudeJ = (rand() - 0.5) * jitter * blockDepth;
        const geo = new THREE.BoxGeometry(blockW * sizeJ, actualCourseH * 0.88, blockDepth);
        const mesh = new THREE.Mesh(geo, material);
        mesh.position.set(px + outwardX * protrudeJ, y, pz + outwardZ * protrudeJ);
        mesh.rotation.y = face.normalAngle;
        mesh.castShadow = mesh.receiveShadow = true;
        g.add(mesh);
      }
    }
  }
  mergeGroupMeshesByMaterial(g);
  return g;
}

/** Which wall-surface strategy is actually shipped/live. 'blocks'
 * (Strategy G, real geometry) per the user's explicit preference --
 * past texture-only attempts in this project have looked "too basic."
 * 'textured' (Strategy T) is fully implemented and tested above for
 * direct comparison. */
export type WallStrategy = 'textured' | 'blocks';
export const WALL_STRATEGY: WallStrategy = 'blocks';

/** Dispatches to whichever wall-surface strategy is requested -- lets
 * the tower-assembly code (StoneTowerKit.ts) stay agnostic to which is
 * active. */
export function buildWallSurface(
  strategy: WallStrategy, radius: number, height: number, seed: number, material: THREE.Material,
): THREE.Group {
  return strategy === 'textured'
    ? buildWallSurfaceTextured(radius, height, material)
    : buildWallSurfaceBlocks(radius, height, seed, material);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/buildings/StoneTowerWallSurface.test.ts`
Expected: PASS (all tests). Note the console output from the "measured comparison" test — record the actual triangle counts/timings it prints in your final report, since that's the concrete answer to the user's "is real geometry too expensive?" question.

- [ ] **Step 5: Commit**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
feat: add real-geometry wall surface strategy (Strategy G) for stone towers

buildWallSurfaceBlocks() builds each course from individual protruding
stone blocks (running-bond coursing), merged into one draw call via
the existing mergeGroupMeshesByMaterial() utility. Added buildWallSurface()
dispatcher (WALL_STRATEGY='blocks' is the shipped default) and a direct
T-vs-G triangle-count/timing comparison test, per the user's explicit
request to measure rather than assume the real-geometry cost.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add src/world/buildings/StoneTowerWallSurface.ts tests/world/buildings/StoneTowerWallSurface.test.ts
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 5: Classic conical-shingle roof cap

**Files:**
- Create: `src/world/buildings/StoneTowerRoofCap.ts`
- Test: `tests/world/buildings/StoneTowerRoofCap.test.ts`

**Interfaces:**
- Consumes: nothing from other new files.
- Produces: `buildClassicRoofCap(radius: number, coneHeight: number, material: THREE.Material): THREE.Group` — used by Task 6's `buildTowerRoofCap` dispatcher.

- [ ] **Step 1: Write the failing test**

Create `tests/world/buildings/StoneTowerRoofCap.test.ts`:

```ts
/**
 * StoneTowerRoofCap.test.ts — the two roof-cap variants for the elven
 * stone-tower kit POC (classic conical shingle roof vs. a living-canopy
 * cap). See docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildClassicRoofCap } from '@/world/buildings/StoneTowerRoofCap';

function hasNaN(group: THREE.Group): boolean {
  let bad = false;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count * 3; i++) {
        if (!Number.isFinite(pos.array[i])) bad = true;
      }
    }
  });
  return bad;
}

function countVerts(group: THREE.Group): number {
  let n = 0;
  group.traverse((o) => { if (o instanceof THREE.Mesh) n += o.geometry.attributes.position.count; });
  return n;
}

describe('buildClassicRoofCap', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#5a6068' });

  it('produces at least one mesh with finite, non-NaN geometry', () => {
    const g = buildClassicRoofCap(2, 3, mat);
    expect(countVerts(g)).toBeGreaterThan(0);
    expect(hasNaN(g)).toBe(false);
  });

  it('is deterministic', () => {
    const g1 = buildClassicRoofCap(2, 3, mat);
    const g2 = buildClassicRoofCap(2, 3, mat);
    expect(countVerts(g1)).toBe(countVerts(g2));
  });

  it('a larger cone height produces a taller bounding box', () => {
    const short = buildClassicRoofCap(2, 1.5, mat);
    const tall = buildClassicRoofCap(2, 4, mat);
    const boxOf = (g: THREE.Group) => new THREE.Box3().setFromObject(g);
    expect(boxOf(tall).max.y - boxOf(tall).min.y).toBeGreaterThan(boxOf(short).max.y - boxOf(short).min.y);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/buildings/StoneTowerRoofCap.test.ts`
Expected: FAIL with a module-not-found error for `@/world/buildings/StoneTowerRoofCap`.

- [ ] **Step 3: Implement**

Create `src/world/buildings/StoneTowerRoofCap.ts`:

```ts
/**
 * StoneTowerRoofCap.ts — the two roof-cap variants for the elven
 * stone-tower kit POC (docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md): a classic conical
 * shingle roof (this task), and a living-canopy cap where the stone
 * shaft transitions into actual foliage (added in the next task) --
 * the clearest "hybrid stone + living tree" moment in the whole kit.
 */

import * as THREE from 'three';

/**
 * Classic conical shingle roof cap. A slight eave overhang (radius
 * *1.15) matches real tower-roof construction (the roof oversails the
 * wall below it). Relies on the material's own texture map (this kit's
 * caller passes a slateTexture()-mapped material) for shingle detail --
 * unlike the wall surface, this spec scoped the texture-vs-geometry
 * comparison to the wall only (see design spec's Testing section), so
 * the roof stays a single low-poly cone.
 */
export function buildClassicRoofCap(radius: number, coneHeight: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.ConeGeometry(radius * 1.15, coneHeight, 8);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = coneHeight / 2;
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/buildings/StoneTowerRoofCap.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
feat: add classic conical shingle roof cap for stone towers

buildClassicRoofCap() -- a low-poly 8-sided cone with a slight eave
overhang, relying on the caller's slate-textured material for shingle
detail. First of two roof-cap variants for the elven stone-tower kit
POC; the living-canopy cap follows in the next task.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add src/world/buildings/StoneTowerRoofCap.ts tests/world/buildings/StoneTowerRoofCap.test.ts
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 6: Living-canopy roof cap + roof-cap dispatcher

**Files:**
- Modify: `src/world/buildings/StoneTowerRoofCap.ts`
- Test: `tests/world/buildings/StoneTowerRoofCap.test.ts`

**Interfaces:**
- Consumes: `createBlockGrid(): BlockGrid`, `setBlock(grid, bx: number, by: number, bz: number, materialKey: string): void`, `meshBlockGrid(grid: BlockGrid, palette: Record<string, THREE.Material>): THREE.Group`, `BLOCK_UNIT: number` (all from the existing `./BlockKit`); `mulberry32(seed: number): () => number` from `@/core/prng`.
- Produces: `LivingCapPalette { leaf: THREE.Material; bark: THREE.Material }`, `buildLivingRoofCap(seed: number, radius: number, palette: LivingCapPalette): THREE.Group`, `RoofCapPalette { shingle: THREE.Material; leaf: THREE.Material; bark: THREE.Material }`, `buildTowerRoofCap(seed: number, radius: number, coneHeight: number, palette: RoofCapPalette): THREE.Group` — used by Task 9 (`buildElvenStoneTower`).

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/buildings/StoneTowerRoofCap.test.ts`. Change the import line from:
```ts
import { buildClassicRoofCap } from '@/world/buildings/StoneTowerRoofCap';
```
to:
```ts
import { buildClassicRoofCap, buildLivingRoofCap, buildTowerRoofCap } from '@/world/buildings/StoneTowerRoofCap';
```

Then add, after the closing `});` of the existing `describe('buildClassicRoofCap', ...)` block:

```ts
describe('buildLivingRoofCap', () => {
  const leaf = new THREE.MeshStandardMaterial({ color: '#3d6b35' });
  const bark = new THREE.MeshStandardMaterial({ color: '#4a3520' });

  it('produces at least one mesh with finite, non-NaN geometry', () => {
    const g = buildLivingRoofCap(42, 2, { leaf, bark });
    expect(countVerts(g)).toBeGreaterThan(0);
    expect(hasNaN(g)).toBe(false);
  });

  it('is deterministic for the same seed', () => {
    const g1 = buildLivingRoofCap(42, 2, { leaf, bark });
    const g2 = buildLivingRoofCap(42, 2, { leaf, bark });
    expect(countVerts(g1)).toBe(countVerts(g2));
  });

  it('different seeds produce different (but still valid) shapes', () => {
    const g1 = buildLivingRoofCap(1, 2, { leaf, bark });
    const g2 = buildLivingRoofCap(2, 2, { leaf, bark });
    expect(hasNaN(g1)).toBe(false);
    expect(hasNaN(g2)).toBe(false);
    // Not required to differ in vertex count (both are valid organic
    // blobs), just confirmed both build without error above.
  });
});

describe('buildTowerRoofCap (dispatcher)', () => {
  const palette = {
    shingle: new THREE.MeshStandardMaterial({ color: '#5a6068' }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3d6b35' }),
    bark: new THREE.MeshStandardMaterial({ color: '#4a3520' }),
  };

  it('produces valid, non-NaN geometry across many seeds (covers both classic and living branches)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const g = buildTowerRoofCap(seed, 2, 3, palette);
      expect(countVerts(g)).toBeGreaterThan(0);
      expect(hasNaN(g)).toBe(false);
    }
  });

  it('is deterministic for the same seed', () => {
    const g1 = buildTowerRoofCap(42, 2, 3, palette);
    const g2 = buildTowerRoofCap(42, 2, 3, palette);
    expect(countVerts(g1)).toBe(countVerts(g2));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/buildings/StoneTowerRoofCap.test.ts`
Expected: FAIL — `buildLivingRoofCap` and `buildTowerRoofCap` don't exist yet.

- [ ] **Step 3: Implement**

Add to `src/world/buildings/StoneTowerRoofCap.ts`. Change the top of the file from:
```ts
import * as THREE from 'three';
```
to:
```ts
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { createBlockGrid, setBlock, meshBlockGrid, BLOCK_UNIT } from './BlockKit';
```

Then append:

```ts
/** Materials for the living-canopy roof cap. */
export interface LivingCapPalette {
  leaf: THREE.Material;
  bark: THREE.Material;
}

/**
 * Living-canopy roof cap: the stone shaft transitions into an actual
 * foliage crown -- the clearest "hybrid stone + living tree" moment in
 * the kit. Deliberately a small, dedicated BlockKit grid (NOT a call
 * into the existing buildElvenTrunkGrid(), which is coupled to being an
 * entire trunk-to-canopy shape and isn't designed to be composed as a
 * cap sitting on a separate stone shaft) -- 3 tiers: a narrow bark
 * "neck" matching the shaft below, a wide central bulge, and a leaf
 * taper to a near-point at the top. Deliberately simple (a single
 * circular-cross-section bulge per tier, no satellite lobes/branches)
 * to avoid the "muddy brown blob" failure mode documented elsewhere in
 * this codebase's elven trunk code -- this is a small cap, not a whole
 * tree, so it doesn't need that system's full complexity.
 */
export function buildLivingRoofCap(seed: number, radius: number, palette: LivingCapPalette): THREE.Group {
  const grid = createBlockGrid();
  const rand = mulberry32(seed);
  const bw = Math.max(3, Math.round((radius * 2.4) / BLOCK_UNIT));
  const bd = bw;
  const bh = Math.max(3, Math.round((radius * 2.0) / BLOCK_UNIT));
  const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
  const maxR = Math.max(cx, cz);

  function tierRadiusFrac(level: number): number {
    const t = level / Math.max(1, bh - 1);
    if (t < 0.3) return 0.5 + (t / 0.3) * 0.5;        // 0.5 -> 1.0 (flare out from the neck)
    if (t < 0.7) return 1.0;                          // full bulge
    return 1.0 - ((t - 0.7) / 0.3) * 0.85;             // 1.0 -> 0.15 (taper to near-point)
  }

  for (let by = 0; by < bh; by++) {
    const tierR = maxR * tierRadiusFrac(by);
    const isNeck = by < bh * 0.15;
    for (let bx = 0; bx < bw; bx++) {
      for (let bz = 0; bz < bd; bz++) {
        const d = Math.hypot(bx - cx, bz - cz);
        if (d <= tierR + (rand() - 0.5) * 0.4) {
          setBlock(grid, bx, by, bz, isNeck ? 'bark' : 'leaf');
        }
      }
    }
  }

  const mesh = meshBlockGrid(grid, { bark: palette.bark, leaf: palette.leaf });
  mesh.position.x -= cx * BLOCK_UNIT;
  mesh.position.z -= cz * BLOCK_UNIT;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

/** Materials for whichever roof-cap variant buildTowerRoofCap() picks. */
export interface RoofCapPalette {
  shingle: THREE.Material;
  leaf: THREE.Material;
  bark: THREE.Material;
}

/**
 * Picks a roof-cap style (classic conical shingle vs. living canopy)
 * from `seed`: 40% living, 60% classic -- most towers keep the classic
 * silhouette, with the living cap as a distinctive rarer variant.
 */
export function buildTowerRoofCap(seed: number, radius: number, coneHeight: number, palette: RoofCapPalette): THREE.Group {
  const rand = mulberry32(seed);
  const useLiving = rand() < 0.4;
  return useLiving
    ? buildLivingRoofCap(seed ^ 0x1DEA, radius, { leaf: palette.leaf, bark: palette.bark })
    : buildClassicRoofCap(radius, coneHeight, palette.shingle);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/buildings/StoneTowerRoofCap.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
feat: add living-canopy roof cap + roof-cap dispatcher

buildLivingRoofCap() -- a small dedicated BlockKit grid (not a reuse of
the full buildElvenTrunkGrid, which is coupled to being an entire
trunk shape) giving the stone shaft an actual foliage-crown cap: the
clearest hybrid stone+living-tree moment in the kit. buildTowerRoofCap()
dispatches between this and the classic conical cap by seed (40%
living / 60% classic).

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add src/world/buildings/StoneTowerRoofCap.ts tests/world/buildings/StoneTowerRoofCap.test.ts
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 7: Tower base (plinth + rock outcropping + tree roots)

**Files:**
- Create: `src/world/buildings/StoneTowerKit.ts`
- Test: `tests/world/buildings/StoneTowerKit.test.ts`

**Interfaces:**
- Consumes: `WALL_STRATEGY`, `buildWallSurface(strategy, radius, height, seed, material)` from Task 4's `StoneTowerWallSurface.ts`; `mulberry32` from `@/core/prng`.
- Produces: `StoneTowerPalette { stone: THREE.Material; shingle: THREE.Material; leaf: THREE.Material; bark: THREE.Material; moonstone: THREE.Material }`, `buildTowerBase(radius: number, plinthHeight: number, seed: number, palette: StoneTowerPalette): THREE.Group` — used by Task 9 (`buildElvenStoneTower`).

- [ ] **Step 1: Write the failing test**

Create `tests/world/buildings/StoneTowerKit.test.ts`:

```ts
/**
 * StoneTowerKit.test.ts — the top-level elven stone-tower kit POC
 * assembly (base + wall rings + roof cap). See docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildTowerBase, type StoneTowerPalette } from '@/world/buildings/StoneTowerKit';

function hasNaN(group: THREE.Group): boolean {
  let bad = false;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count * 3; i++) {
        if (!Number.isFinite(pos.array[i])) bad = true;
      }
    }
  });
  return bad;
}

function countVerts(group: THREE.Group): number {
  let n = 0;
  group.traverse((o) => { if (o instanceof THREE.Mesh) n += o.geometry.attributes.position.count; });
  return n;
}

function makePalette(): StoneTowerPalette {
  return {
    stone:     new THREE.MeshStandardMaterial({ color: '#9aa0a8' }),
    shingle:   new THREE.MeshStandardMaterial({ color: '#5a6068' }),
    leaf:      new THREE.MeshStandardMaterial({ color: '#3d6b35' }),
    bark:      new THREE.MeshStandardMaterial({ color: '#4a3520' }),
    moonstone: new THREE.MeshStandardMaterial({ color: '#d8e8f0' }),
  };
}

describe('buildTowerBase', () => {
  it('produces at least one mesh with finite, non-NaN geometry', () => {
    const g = buildTowerBase(2, 0.6, 42, makePalette());
    expect(countVerts(g)).toBeGreaterThan(0);
    expect(hasNaN(g)).toBe(false);
  });

  it('is deterministic for the same seed', () => {
    const g1 = buildTowerBase(2, 0.6, 42, makePalette());
    const g2 = buildTowerBase(2, 0.6, 42, makePalette());
    expect(countVerts(g1)).toBe(countVerts(g2));
  });

  it('different seeds still produce valid geometry (root/rock placement varies)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = buildTowerBase(2, 0.6, seed, makePalette());
      expect(hasNaN(g)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/buildings/StoneTowerKit.test.ts`
Expected: FAIL with a module-not-found error for `@/world/buildings/StoneTowerKit`.

- [ ] **Step 3: Implement**

Create `src/world/buildings/StoneTowerKit.ts`:

```ts
/**
 * StoneTowerKit.ts — top-level orchestrator for the elven stone-tower
 * kit POC (docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md): stacks a base/plinth,
 * N wall rings, and a roof cap into a complete tower, all driven from
 * `dna.seed`. Wired in as elven's `watchtower`/`tower` building-kind
 * override (both currently unstyled, so purely additive).
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { WALL_STRATEGY, buildWallSurface } from './StoneTowerWallSurface';

/** Local material helper -- mirrors FactionBuildingVariants.ts's own
 * `mat()` (not imported directly to avoid a circular import, since that
 * file will import buildElvenStoneTower from this one). */
function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...opts });
}

/** Shared materials passed through every piece of one tower. */
export interface StoneTowerPalette {
  stone: THREE.Material;
  shingle: THREE.Material;
  leaf: THREE.Material;
  bark: THREE.Material;
  moonstone: THREE.Material;
}

/**
 * Base/plinth ring: wider than the shaft above it (a "battered," flared
 * base, matching real tower construction for stability), plus rock
 * outcropping and tree-root tendrils blended in -- the base is where
 * the "complement, don't replace" hybrid stone+living-tree direction
 * reads most clearly at ground level.
 */
export function buildTowerBase(radius: number, plinthHeight: number, seed: number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  const rand = mulberry32(seed);

  const plinth = buildWallSurface(WALL_STRATEGY, radius * 1.2, plinthHeight, seed ^ 0xB453, palette.stone);
  g.add(plinth);

  const rootCount = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < rootCount; i++) {
    const ang = (i / rootCount) * Math.PI * 2 + rand() * 0.4;
    const len = radius * (0.5 + rand() * 0.4);
    const rx = Math.sin(ang) * radius * 0.9;
    const rz = Math.cos(ang) * radius * 0.9;
    const root = new THREE.Mesh(new THREE.ConeGeometry(0.12 + rand() * 0.06, len, 5), palette.bark);
    root.position.set(rx, len * 0.4, rz);
    root.rotation.x = Math.PI / 2 - 0.5;
    root.rotation.y = ang;
    root.castShadow = true;
    g.add(root);
  }

  for (let i = 0; i < 3; i++) {
    const ang = rand() * Math.PI * 2;
    const rr = radius * (1.0 + rand() * 0.3);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + rand() * 0.2, 0), palette.stone);
    rock.position.set(Math.sin(ang) * rr, 0.15, Math.cos(ang) * rr);
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    rock.castShadow = rock.receiveShadow = true;
    g.add(rock);
  }

  return g;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/buildings/StoneTowerKit.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
feat: add stone-tower base (plinth + roots + rock outcropping)

buildTowerBase() -- a flared plinth ring (using whichever wall
strategy is active) with tree-root tendrils and rock outcropping
blended in, the first piece of the top-level StoneTowerKit.ts
orchestrator for the elven stone-tower kit POC.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add src/world/buildings/StoneTowerKit.ts tests/world/buildings/StoneTowerKit.test.ts
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 8: Wall ring assembly (window insert + vine decoration)

**Files:**
- Modify: `src/world/buildings/StoneTowerKit.ts`
- Test: `tests/world/buildings/StoneTowerKit.test.ts`

**Interfaces:**
- Consumes: `WALL_STRATEGY`, `buildWallSurface` from Task 4; `StoneTowerPalette` from Task 7.
- Produces: `buildTowerWallRing(radius: number, ringHeight: number, seed: number, palette: StoneTowerPalette, hasWindow: boolean): THREE.Group` — used by Task 9 (`buildElvenStoneTower`).

- [ ] **Step 1: Write the failing test**

Add to `tests/world/buildings/StoneTowerKit.test.ts`. Change the import line from:
```ts
import { buildTowerBase, type StoneTowerPalette } from '@/world/buildings/StoneTowerKit';
```
to:
```ts
import { buildTowerBase, buildTowerWallRing, type StoneTowerPalette } from '@/world/buildings/StoneTowerKit';
```

Then add, after the closing `});` of the existing `describe('buildTowerBase', ...)` block:

```ts
describe('buildTowerWallRing', () => {
  it('produces valid, non-NaN geometry with a window', () => {
    const g = buildTowerWallRing(2, 2.9, 42, makePalette(), true);
    expect(countVerts(g)).toBeGreaterThan(0);
    expect(hasNaN(g)).toBe(false);
  });

  it('produces valid, non-NaN geometry without a window', () => {
    const g = buildTowerWallRing(2, 2.9, 42, makePalette(), false);
    expect(countVerts(g)).toBeGreaterThan(0);
    expect(hasNaN(g)).toBe(false);
  });

  it('a windowed ring has more geometry than a plain one at the same seed', () => {
    const withWindow = buildTowerWallRing(2, 2.9, 42, makePalette(), true);
    const plain = buildTowerWallRing(2, 2.9, 42, makePalette(), false);
    expect(countVerts(withWindow)).toBeGreaterThan(countVerts(plain));
  });

  it('is deterministic for the same seed/hasWindow', () => {
    const g1 = buildTowerWallRing(2, 2.9, 42, makePalette(), true);
    const g2 = buildTowerWallRing(2, 2.9, 42, makePalette(), true);
    expect(countVerts(g1)).toBe(countVerts(g2));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/buildings/StoneTowerKit.test.ts`
Expected: FAIL — `buildTowerWallRing` doesn't exist yet.

- [ ] **Step 3: Implement**

Append to `src/world/buildings/StoneTowerKit.ts`:

```ts
/**
 * One floor's wall ring: the shaft surface (whichever strategy is
 * active) plus an optional pointed-arch window insert (with a small
 * moonstone accent at its point, matching elven's existing palette
 * conventions) and sparse seed-driven vine growth -- kept sparse so the
 * stone still reads as the primary material, not overwhelmed by
 * foliage.
 */
export function buildTowerWallRing(
  radius: number, ringHeight: number, seed: number, palette: StoneTowerPalette, hasWindow: boolean,
): THREE.Group {
  const g = new THREE.Group();
  const wall = buildWallSurface(WALL_STRATEGY, radius, ringHeight, seed, palette.stone);
  g.add(wall);

  const rand = mulberry32(seed ^ 0x714D0);

  if (hasWindow) {
    const archBodyH = ringHeight * 0.35;
    const archBodyW = radius * 0.3;
    const archPointH = archBodyH * 0.5;
    const glassMat = new THREE.MeshStandardMaterial({ color: '#1a2a1a', roughness: 0.4 });
    const archBody = new THREE.Mesh(new THREE.BoxGeometry(archBodyW, archBodyH, 0.06), glassMat);
    archBody.position.set(0, ringHeight * 0.5, radius * 0.99);
    g.add(archBody);
    const archPoint = new THREE.Mesh(new THREE.ConeGeometry(archBodyW * 0.5, archPointH, 3), palette.moonstone);
    archPoint.position.set(0, ringHeight * 0.5 + archBodyH / 2 + archPointH / 2, radius * 0.99);
    archPoint.rotation.y = Math.PI / 4;
    g.add(archPoint);
  }

  if (rand() < 0.5) {
    const vineAng = rand() * Math.PI * 2;
    const vineLen = ringHeight * (0.4 + rand() * 0.4);
    const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, vineLen, 5), palette.bark);
    vine.position.set(Math.sin(vineAng) * radius * 1.01, vineLen / 2, Math.cos(vineAng) * radius * 1.01);
    vine.rotation.y = vineAng;
    vine.castShadow = true;
    g.add(vine);
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08 + rand() * 0.04, 6, 5), palette.leaf);
      leaf.position.set(
        Math.sin(vineAng) * radius * 1.05,
        vineLen * (0.3 + i * 0.3),
        Math.cos(vineAng) * radius * 1.05,
      );
      g.add(leaf);
    }
  }

  return g;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/buildings/StoneTowerKit.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
feat: add stone-tower wall ring (window insert + vine decoration)

buildTowerWallRing() -- one floor's shaft surface plus an optional
pointed-arch window (with a moonstone accent) and sparse seed-driven
vine growth, the second piece of StoneTowerKit.ts's orchestrator.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add src/world/buildings/StoneTowerKit.ts tests/world/buildings/StoneTowerKit.test.ts
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 9: Top-level `buildElvenStoneTower()` assembly

**Files:**
- Modify: `src/world/buildings/StoneTowerKit.ts`
- Test: `tests/world/buildings/StoneTowerKit.test.ts`

**Interfaces:**
- Consumes: `buildTowerBase`, `buildTowerWallRing`, `StoneTowerPalette` (this file, Tasks 7-8); `buildTowerRoofCap` from Task 6's `StoneTowerRoofCap.ts`; `ashlarTexture` from Task 2's `FactionBlockTextures.ts`; `barkTexture` (existing, `FactionBlockTextures.ts`); `slateTexture` (existing, `TextureFactory.ts`); `getFootprint`, `FLOOR_HEIGHT`, `type BuildingDNA` (existing, `BuildingDNA.ts`); `mulberry32` (existing, `@/core/prng`).
- Produces: `buildElvenStoneTower(dna: BuildingDNA): THREE.Group` — used by Task 10 to wire into `FactionBuildingVariants.ts`.

- [ ] **Step 1: Write the failing test**

Add to `tests/world/buildings/StoneTowerKit.test.ts`. Change the import line from:
```ts
import { buildTowerBase, buildTowerWallRing, type StoneTowerPalette } from '@/world/buildings/StoneTowerKit';
```
to:
```ts
import { buildTowerBase, buildTowerWallRing, buildElvenStoneTower, type StoneTowerPalette } from '@/world/buildings/StoneTowerKit';
import { STYLE_COLORS } from '@/world/buildings/BuildingDNA';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';
```

Then add, after the closing `});` of the existing `describe('buildTowerWallRing', ...)` block:

```ts
function makeTowerDna(kind: 'watchtower' | 'tower', overrides: Partial<BuildingDNA> = {}): BuildingDNA {
  return {
    v: 1, kind: 'building', name: `test ${kind}`, seed: 99,
    buildingKind: kind, size: 'medium', floors: 1,
    style: 'stone', condition: 'weathered',
    hasInterior: false, interiorLayout: 'single_room',
    colors: STYLE_COLORS['stone'], rotation: 0,
    terrace: 'none', features: [], faction: 'elven',
    ...overrides,
  };
}

describe('buildElvenStoneTower', () => {
  it('produces valid, non-NaN geometry for the watchtower kind', () => {
    const g = buildElvenStoneTower(makeTowerDna('watchtower'));
    expect(countVerts(g)).toBeGreaterThan(0);
    expect(hasNaN(g)).toBe(false);
  });

  it('produces valid, non-NaN geometry for the tower kind, across all sizes', () => {
    for (const size of ['tiny', 'small', 'medium', 'large'] as const) {
      const g = buildElvenStoneTower(makeTowerDna('tower', { size }));
      expect(countVerts(g)).toBeGreaterThan(0);
      expect(hasNaN(g)).toBe(false);
    }
  });

  it('is deterministic for the same seed', () => {
    const g1 = buildElvenStoneTower(makeTowerDna('tower', { seed: 42 }));
    const g2 = buildElvenStoneTower(makeTowerDna('tower', { seed: 42 }));
    expect(countVerts(g1)).toBe(countVerts(g2));
  });

  it('different seeds produce valid towers of varying height (floor count varies)', () => {
    const heights: number[] = [];
    for (let seed = 0; seed < 15; seed++) {
      const g = buildElvenStoneTower(makeTowerDna('tower', { seed }));
      const box = new THREE.Box3().setFromObject(g);
      heights.push(box.max.y - box.min.y);
      expect(hasNaN(g)).toBe(false);
    }
    // At least two distinct heights across 15 seeds -- proves floor
    // count actually varies, not fixed.
    expect(new Set(heights.map((h) => Math.round(h * 10))).size).toBeGreaterThan(1);
  });

  it('produces a reasonable tower silhouette: taller than it is wide', () => {
    const g = buildElvenStoneTower(makeTowerDna('tower', { seed: 7, size: 'medium' }));
    const box = new THREE.Box3().setFromObject(g);
    const height = box.max.y - box.min.y;
    const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    expect(height).toBeGreaterThan(width);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/buildings/StoneTowerKit.test.ts`
Expected: FAIL — `buildElvenStoneTower` doesn't exist yet.

- [ ] **Step 3: Implement**

Append to `src/world/buildings/StoneTowerKit.ts`. Change the top of the file from:
```ts
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { WALL_STRATEGY, buildWallSurface } from './StoneTowerWallSurface';
```
to:
```ts
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { BuildingDNA } from './BuildingDNA';
import { getFootprint, FLOOR_HEIGHT } from './BuildingDNA';
import { barkTexture, ashlarTexture } from './FactionBlockTextures';
import { slateTexture } from './TextureFactory';
import { WALL_STRATEGY, buildWallSurface } from './StoneTowerWallSurface';
import { buildTowerRoofCap } from './StoneTowerRoofCap';
```

Then append:

```ts
/**
 * Public entry point: builds a complete elven stone tower for the given
 * `BuildingDNA` (dispatched from FactionBuildingVariants.ts's elven
 * `watchtower`/`tower` override). Derives its footprint the same way
 * every other builder in this codebase does (getFootprint(dna.
 * buildingKind, dna.size)), so it automatically scales to both kinds'
 * very different footprint scales (watchtower: fixed 2x2; tower:
 * 3x3-7x5 by size).
 *
 * Floor count (3-6) is picked from the seed rather than strictly
 * following `dna.floors` -- towers are a fixed-tall archetype, the same
 * precedent the generic buildWatchtower() already sets with its own
 * `Math.max(4, dna.floors)` override.
 */
export function buildElvenStoneTower(dna: BuildingDNA): THREE.Group {
  const { w, d } = getFootprint(dna.buildingKind, dna.size);
  const radius = Math.max(1, Math.min(w, d) / 2);
  const rand = mulberry32(dna.seed ^ 0xE15E70);
  const floors = 3 + Math.floor(rand() * 4); // 3-6
  const ringHeight = FLOOR_HEIGHT * 0.9;
  const plinthHeight = 0.6;
  const coneHeight = radius * 2.2;

  const palette: StoneTowerPalette = {
    stone:     mat(dna.colors.walls, { roughness: 0.85, map: ashlarTexture(Math.max(1, radius / 1.5), Math.max(1, ringHeight / 1.5)) }),
    shingle:   mat(dna.colors.roof, { roughness: 0.75, map: slateTexture(Math.max(1, radius), Math.max(1, coneHeight / 1.5)) }),
    leaf:      mat(dna.colors.trim, { roughness: 0.75 }),
    bark:      mat('#4a3520', { roughness: 0.9, map: barkTexture() }),
    moonstone: mat('#d8e8f0', { roughness: 0.5, metalness: 0.05 }),
  };

  const g = new THREE.Group();
  const base = buildTowerBase(radius, plinthHeight, dna.seed ^ 0xB453E, palette);
  g.add(base);

  let y = plinthHeight;
  for (let fl = 0; fl < floors; fl++) {
    const hasWindow = fl > 0 && rand() < 0.7;
    const ringRadius = radius * (1 - fl * 0.015); // very slight taper per floor
    const ring = buildTowerWallRing(ringRadius, ringHeight, dna.seed ^ (0x9E1E ^ fl), palette, hasWindow);
    ring.position.y = y;
    g.add(ring);
    y += ringHeight;
  }

  const roofRadius = radius * (1 - (floors - 1) * 0.015);
  const roof = buildTowerRoofCap(dna.seed ^ 0x800F, roofRadius, coneHeight, palette);
  roof.position.y = y;
  g.add(roof);

  return g;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/buildings/StoneTowerKit.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
feat: add buildElvenStoneTower top-level assembly

Public entry point stacking base + N wall rings + roof cap, all
procedural variation (floor count, roof style, window/vine placement)
driven from dna.seed. Completes the elven stone-tower kit POC's
construction system; wiring into live elven settlements follows in the
next task.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add src/world/buildings/StoneTowerKit.ts tests/world/buildings/StoneTowerKit.test.ts
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 10: Wire `buildElvenStoneTower` into elven's `watchtower`/`tower`

**Files:**
- Modify: `src/world/buildings/FactionBuildingVariants.ts`
- Test: `tests/world/FactionBuildingVariants.test.ts`

**Interfaces:**
- Consumes: `buildElvenStoneTower(dna: BuildingDNA): THREE.Group` from Task 9's `StoneTowerKit.ts`. The existing test file's own `makeDna(kind: BuildingKind, faction: Faction | undefined, seed = 99): BuildingDNA` helper (verified exact signature — no `overrides` parameter, fixed `size: 'small'`; size-scaling is already covered directly in Task 9's `StoneTowerKit.test.ts`, so this task's tests only need to prove dispatch wiring, not re-test size variation).
- Produces: `getFactionBuildingVariant('elven', 'watchtower')` and `getFactionBuildingVariant('elven', 'tower')` both resolve to `buildElvenStoneTower` — this is what `buildBuilding()` (`BuildingBuilder.ts`, unchanged) dispatches to for any elven-faction watchtower/tower.

- [ ] **Step 1: Write the failing test**

Add to `tests/world/FactionBuildingVariants.test.ts`, reusing its existing `makeDna(kind, faction, seed)` helper (already defined at the top of the file — do not redefine it):

```ts
describe('elven watchtower/tower -- stone-tower kit POC', () => {
  it('elven watchtower resolves to a distinct builder from the generic default', () => {
    const inst = buildBuilding(makeDna('watchtower', 'elven', 5));
    // Generic buildWatchtower() has a fixed square footprint; the elven
    // stone tower is built from an octagon cross-section -- a reliable,
    // cheap way to prove a *different* builder actually ran without
    // depending on exact vertex counts.
    let elvenHasCylinderOrCone = false;
    inst.exteriorGroup.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.geometry instanceof THREE.CylinderGeometry || o.geometry instanceof THREE.ConeGeometry)) {
        elvenHasCylinderOrCone = true;
      }
    });
    expect(elvenHasCylinderOrCone).toBe(true);
  });

  it('the generic (no-faction) watchtower does NOT use a cylinder/cone shaft (proves elven genuinely differs from the fallback)', () => {
    const generic = buildBuilding(makeDna('watchtower', undefined, 5));
    let genericHasCylinderOrCone = false;
    generic.exteriorGroup.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.geometry instanceof THREE.CylinderGeometry || o.geometry instanceof THREE.ConeGeometry)) {
        genericHasCylinderOrCone = true;
      }
    });
    expect(genericHasCylinderOrCone).toBe(false);
  });

  it('elven tower kind also resolves to the stone-tower builder', () => {
    const inst = buildBuilding(makeDna('tower', 'elven', 3));
    expect(inst.exteriorGroup.children.length).toBeGreaterThan(0);
    let hasCylinderOrCone = false;
    inst.exteriorGroup.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.geometry instanceof THREE.CylinderGeometry || o.geometry instanceof THREE.ConeGeometry)) {
        hasCylinderOrCone = true;
      }
    });
    expect(hasCylinderOrCone).toBe(true);
  });

  it('other elven kinds are untouched (still resolve to the existing tree-trunk builders)', () => {
    const villa = buildBuilding(makeDna('villa', 'elven', 5));
    let hasCylinderOrConeInVilla = false;
    villa.exteriorGroup.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.geometry instanceof THREE.CylinderGeometry || o.geometry instanceof THREE.ConeGeometry)) {
        hasCylinderOrConeInVilla = true;
      }
    });
    // The tree-trunk builder (BlockKit-meshed, non-indexed custom
    // geometry) never produces a raw CylinderGeometry/ConeGeometry --
    // confirms villa's builder is unchanged by this task.
    expect(hasCylinderOrConeInVilla).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/FactionBuildingVariants.test.ts -t "stone-tower kit POC"`
Expected: FAIL — elven's `watchtower`/`tower` still fall through to the generic builder (no `CylinderGeometry`/`ConeGeometry` present), so the first and third assertions fail.

- [ ] **Step 3: Implement**

In `src/world/buildings/FactionBuildingVariants.ts`, add the import near the other block-profile imports at the top of the file:

Find:
```ts
import { buildVulperiaDenMoundGrid, type DenMoundOptions, buildDwarvenHallGrid, dwarvenRoofTopY, dwarvenTopTierExtents, type DwarvenHallOptions, buildElvenTrunkGrid, elvenNeckY, elvenWaistRadius, type ElvenTrunkOptions, buildVampireSpireGrid, vampireSpireTopY, vampireSpireDeckRadius, type VampireSpireOptions, buildFaeStalkGrid, faeCapTopY, faeCapRimRadius, type FaeStalkOptions, buildOrcishHutGrid, orcishWallTopY, type OrcishHutOptions, buildUndeadTierGrid, undeadRoofTopY, type UndeadTierOptions } from './FactionBlockProfiles';
```

Add directly after it:
```ts
import { buildElvenStoneTower } from './StoneTowerKit';
```

Then find elven's entry in `FACTION_BUILDING_VARIANTS`:
```ts
  elven: {
    villa:    buildElvenVilla,
    chapel:   buildElvenChapel,
    shop:     buildElvenShop,
    // `house` (gateward/farm wards) and `terraced` (slum ward) are real
    // BuildingKinds produced by WARD_TO_KIND (src/buildingToDungeonPlan.ts)
    // — every settlement's farm/gateward/slum buildings use them, so
    // without an override here they fell through to the generic default
    // builder and only got elven's STYLE_COLORS palette (pale sage walls/
    // roof tint), not elven geometry. Reusing buildElvenVilla is safe:
    // it derives its footprint from `dna.buildingKind`/`dna.size`
    // dynamically (via getFootprint()), so it scales correctly to these
    // smaller kinds rather than assuming villa's fixed 7x5.
    house:    buildElvenVilla,
    terraced: buildElvenVilla,
    // Phase 2b increment 3: inn/blacksmith had no elven override either.
    inn:        buildElvenVilla,
    blacksmith: buildElvenVilla,
  },
```

Replace with:
```ts
  elven: {
    villa:    buildElvenVilla,
    chapel:   buildElvenChapel,
    shop:     buildElvenShop,
    // `house` (gateward/farm wards) and `terraced` (slum ward) are real
    // BuildingKinds produced by WARD_TO_KIND (src/buildingToDungeonPlan.ts)
    // — every settlement's farm/gateward/slum buildings use them, so
    // without an override here they fell through to the generic default
    // builder and only got elven's STYLE_COLORS palette (pale sage walls/
    // roof tint), not elven geometry. Reusing buildElvenVilla is safe:
    // it derives its footprint from `dna.buildingKind`/`dna.size`
    // dynamically (via getFootprint()), so it scales correctly to these
    // smaller kinds rather than assuming villa's fixed 7x5.
    house:    buildElvenVilla,
    terraced: buildElvenVilla,
    // Phase 2b increment 3: inn/blacksmith had no elven override either.
    inn:        buildElvenVilla,
    blacksmith: buildElvenVilla,
    // Phase 6 POC (docs/superpowers/specs/
    // 2026-09-02-elven-stone-tower-kit-design.md): watchtower/tower had
    // NO elven override at all (fell through to the generic square
    // box-stacked builder, purely a safety choice for this POC -- no
    // existing elven look to risk regressing). The new octagon-
    // cross-section stone-tower kit (hybrid stone + living-tree
    // architecture, "brick-by-brick" real geometry per the user's
    // explicit preference) lands here first, before any other elven
    // kind, as the proof-of-concept for the same technique applied
    // race-by-race in future rounds.
    watchtower: buildElvenStoneTower,
    tower:      buildElvenStoneTower,
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/FactionBuildingVariants.test.ts`
Expected: PASS (all tests, including the pre-existing ones — this is a purely additive change to elven's table).

- [ ] **Step 5: Commit**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
feat: wire elven stone-tower kit into watchtower/tower building kinds

FACTION_BUILDING_VARIANTS['elven'] now overrides watchtower/tower with
buildElvenStoneTower (StoneTowerKit.ts) -- both kinds previously fell
through to the generic, unstyled square box-stacked builder. Purely
additive: no other faction or elven kind (villa/chapel/shop/house/
terraced/inn/blacksmith) is touched. This is the live-wiring step of
the Phase 6 elven stone-tower kit POC.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add src/world/buildings/FactionBuildingVariants.ts tests/world/FactionBuildingVariants.test.ts
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 11: Full regression, live verification, roadmap doc, push, PR

**Files:**
- Modify: `TODO/organic_world_tiles_todo.md` (new "Phase 6" section), `TODO/TODO_OVERVIEW.md` (G16 entry)
- No new source files.

**Interfaces:**
- Consumes: everything from Tasks 1-10.
- Produces: a pushed, verified branch state and a new PR (the previous round's PR #45 is merged/closed, so this needs a fresh PR, same as every prior round in this effort).

- [ ] **Step 1: Re-establish a fresh regression baseline**

`main` has moved since the last round's baseline (146 tsc errors / 13 pre-existing test failures) was established — re-confirm it's still accurate on the current branch tip before drawing conclusions about "new" failures:

Run: `npx tsc --noEmit 2>&1 | tail -5` (note the error count)
Run: `npx vitest run 2>&1 | tail -40` (note failed test count/names)

- [ ] **Step 2: Compare against baseline, fix only genuinely new regressions**

If the tsc error count or failing-test set differs from the previously-established baseline, investigate whether the difference traces back to this plan's changes (`StoneTowerShape.ts`, `StoneTowerWallSurface.ts`, `StoneTowerRoofCap.ts`, `StoneTowerKit.ts`, `FactionBlockTextures.ts`, `FactionBuildingVariants.ts`) and fix only those. Don't chase pre-existing/flaky failures unrelated to this change.

- [ ] **Step 3: Live verification via Overworld Studio's Settlement Lab**

Launch the dev server (`npx vite --port <port>`) and navigate directly to
`http://localhost:<port>/index.html?devroom=settlement-lab&sl_seed=<seed>&sl_type=village&sl_faction=elven&sl_layout=auto`
(the query-param handoff documented in `src/overworld-studio/DevRoomHandoff.ts`, used in the prior round to bypass Overworld Studio's own UI navigation) for at least 3 different seeds. For each:
- Confirm no console/page errors.
- Confirm at least one watchtower/tower-kind building renders as the new octagonal stone tower (not a square box) — zoom in with the mouse-wheel scroll-to-zoom (as in the prior round) and screenshot for visual confirmation.
- Visually confirm the "brick-by-brick" real-geometry wall surface (individual protruding stone blocks, not a flat texture) is actually visible at normal camera distance — this is the key question the whole POC is answering; if it reads as flat/textured-looking rather than genuinely dimensional, that's a finding to report, not something to silently accept.
- Confirm at least one living-canopy roof cap appears across the seeds tried (it's a 40%-weighted random variant, so try enough seeds to see it, e.g. loop seeds 1-10 and check for at least one).

Clean up any throwaway Playwright spec files used for this (do not commit them), matching the prior round's practice.

- [ ] **Step 4: Update roadmap docs — new Phase 6 section**

In `TODO/organic_world_tiles_todo.md`, after the existing Phase 5 section's content and before the file's closing cross-cutting notes (check the file's structure with `grep -n "^## Phase\|^---$" TODO/organic_world_tiles_todo.md` first to find the exact insertion point), add:

```markdown
## Phase 6 — Procedural race-by-race building construction (Elven stone-tower kit POC) ✅ POC shipped 2026-09-02

**Goal:** move past "stacking blocks looks okayish" toward a genuinely
researched, modular "kit of parts" construction method per race,
starting with one proof-of-concept (an elven tower) before rolling the
same research → design → plan → implement cycle out to the other
races (order: Elven, Dwarves, Orcish, Vampire, Undead, Vulperia, Fae,
Slime, Human — Slime/Human last, since those already look best).

- [x] **6.1 — Research**: real-world tower construction (coursing,
  battered bases, quoins, conical shingle roofs) + procedural building
  generation techniques in games/research (shape grammars/CGA shape,
  and — the far more common game-industry answer, matching the user's
  tabletop-terrain-kit reference image — modular "kit of parts" systems:
  a small set of pieces sharing one socket/cross-section, stacked in
  any order). See `docs/superpowers/specs/
  2026-09-02-elven-stone-tower-kit-design.md`'s "Research summary."
- [x] **6.2 — Design + POC plan**: an octagonal cross-section "ring
  stack" (base/plinth, wall rings, roof cap), with two directly-compared
  wall-surface strategies — a cheap textured prism vs. real per-course
  block geometry (`StoneTowerShape.ts`, `StoneTowerWallSurface.ts`,
  `StoneTowerRoofCap.ts`, `StoneTowerKit.ts`) — per the user's explicit
  preference for real geometry over a flat texture illusion (past
  texture-only attempts in this project reportedly looked "too basic").
  Hybrid stone + living-tree decoration (root tendrils, vines, a
  living-canopy roof-cap variant) per the user's "complement, don't
  replace" direction for elven's existing tree-trunk architecture.
- [x] **6.3 — Live-wired for testing**: `FACTION_BUILDING_VARIANTS['elven']`
  now overrides `watchtower`/`tower` (both previously unstyled/generic)
  with `buildElvenStoneTower` — testable live via Overworld Studio's
  Settlement Lab ("Play in 3D", elven faction).
- [ ] **6.4 — T-vs-G measured verdict, then roll out to the next race**:
  the direct triangle-count/timing comparison test
  (`StoneTowerWallSurface.test.ts`) gives a concrete measurement of the
  real-geometry cost — see this plan's execution report for the actual
  numbers. If the POC holds up under live testing, repeat 6.1-6.3 for
  the next race in the priority order above. **Not started** — this
  POC's own live verification needs to happen (and the user's own
  testing/verdict) before committing to a rollout order/pace.

**Non-goal for this phase**: applying lessons learned here back to
terrain/nature tile-connection — explicitly a *future* step the user
named, after all races' buildings are done.
```

- [ ] **Step 5: Mirror in TODO_OVERVIEW.md**

In `TODO/TODO_OVERVIEW.md`'s G16 entry (`grep -n "G16" TODO/TODO_OVERVIEW.md`), append a clause after the existing Phase 5 mention (matching how each prior round in this same effort added its own clause to this same line):

`, Phase 6 procedural race-by-race building construction ✅ POC shipped for elven watchtower/tower (octagon ring-stack kit, real per-course block geometry, hybrid stone+living-tree decoration) — see organic_world_tiles_todo.md's Phase 6 for the T-vs-G measured comparison and next-race rollout status`

- [ ] **Step 6: Commit, push, open a new PR**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
docs: add Phase 6 (elven stone-tower kit POC) to organic world tiles roadmap

Records the research findings, design decisions, and live-wiring status
for the procedural race-by-race building construction effort, starting
with the elven watchtower/tower POC. Cross-references
docs/superpowers/specs/2026-09-02-elven-stone-tower-kit-design.md and
docs/superpowers/plans/2026-09-02-elven-stone-tower-kit.md.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add TODO/organic_world_tiles_todo.md TODO/TODO_OVERVIEW.md
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
git push
```

Run: `gh pr list --repo HammerOfSteel/tomes_towers_and_transmutation --head <this-branch-name> --state all` to confirm no open PR exists for this branch (the prior round's PR #45 is merged/closed). Use the `create_pull_request` tool for a fresh PR (title referencing the elven stone-tower kit POC; body summarizing the research, the T-vs-G measured comparison's actual numbers, what's live-wired, and the still-open 6.4 rollout decision). Do **not** merge it — leave it open for the user to review and test via the Settlement Lab, per this whole effort's standing instruction.
