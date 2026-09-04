# Elven Chapel Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `buildElvenChapel()` (a ring of standing tree-stones + a
central glowing crystal) with a genuine Gothic-elven chapel — a rectangular
nave, a small octagonal apse (reusing existing radial tower-kit pieces
unmodified), a bellcote, and a relocated forecourt of standing stones — all
built on the SAME real per-course block-and-mortar construction technique
already shipped for the tower/treehouse/market-stall lineage.

**Architecture:** The nave's rectangular walls reuse
`buildWallSurfaceBlocks()`'s existing `facesOverride` mechanism with a new
4-face rectangle (zero changes needed to that function). `buildFloorCap()`
and `buildQuoins()` gain a small optional `pointsOverride` parameter so they
can use the same rectangle corners instead of a regular octagon. A new
`buildGableRoofCap()` (two raked planes + ridge beam + gable-end triangle
fills) caps the nave, since none of the kit's existing radial roof-caps can
fit a rectangle. The apse is built entirely from existing, unmodified
radial pieces (a small partial-octagon ring open toward the nave, reusing
the market stall's own proven "omit some faces" technique, topped with the
existing `buildLivingRoofCap()`).

**Tech Stack:** TypeScript, Three.js, Vitest — matches the existing
tower-kit family exactly, no new dependencies.

## Global Constraints

- Baseline (established fresh on this branch immediately before this
  plan's changes — see Task 0): full `npx vitest run` and `npx tsc
  --noEmit` results recorded there. Any NEW failures/errors beyond that
  exact baseline are real regressions that must be fixed before this plan
  is considered done.
- Every existing caller of `buildFloorCap()`/`buildQuoins()` (which never
  passes the new optional parameter) must be byte-for-byte unaffected —
  verified by re-running `StoneTowerKit.test.ts`'s full existing suite
  (30 tests) unchanged after each of Tasks 2-3.
- `chapel`'s footprint is fixed at `{w: 4, d: 8}` regardless of `dna.size`
  (`KIND_FOOTPRINT.chapel` in `BuildingDNA.ts`) and its floor count is
  always `1` (`WARD_TO_FLOORS.church = 1` in `buildingToDungeonPlan.ts`,
  the only reachable path to this kind) — every task below can rely on
  this exactly, no floor-count loop is needed for the nave.
- All new/modified meshes must have `castShadow`/`receiveShadow` set
  consistent with sibling meshes in the same file (see existing
  convention throughout the tower-kit family).
- Reuse `StoneTowerShape.ts`'s existing `OctagonFace` interface verbatim
  for the new rectangle-face helpers — do not invent a parallel type.

---

### Task 0: Establish a fresh baseline

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite and record the result**

Run: `npx vitest run 2>&1 | tail -15`
Record the exact "Test Files" / "Tests" summary line (expected, matching
the prior round's confirmed baseline: 13 failed / rest passed, 6 failed
files, all pre-existing and unrelated to this work).

- [ ] **Step 2: Run the type checker and record the result**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Record the exact count (expected: 144, matching the prior round's
confirmed baseline).

---

### Task 1: Rectangle shape math — `rectanglePoints`, `rectangleFaces`, `facePointAt`

**Files:**
- Modify: `src/world/buildings/StoneTowerShape.ts`
- Test: `tests/world/buildings/StoneTowerShape.test.ts`

**Interfaces:**
- Consumes: nothing new (pure math, no imports beyond what the file
  already has).
- Produces: `rectanglePoints(halfW: number, halfD: number): [number,
  number][]`, `rectangleFaces(halfW: number, halfD: number):
  OctagonFace[]`, `facePointAt(face: OctagonFace, t: number): [number,
  number]` — all exported from `StoneTowerShape.ts`, consumed by Tasks
  2, 3, 4, 5.

- [ ] **Step 1: Write the failing tests**

Open `tests/world/buildings/StoneTowerShape.test.ts` and add (matching
its existing `describe`/`it` style — check the file's existing imports
first and extend the same `import { ... } from '@/world/buildings/
StoneTowerShape';` line rather than adding a duplicate import):

```ts
describe('rectanglePoints', () => {
  it('returns exactly 4 corners at (+-halfW, +-halfD), winding matching octagonPoints (produces a +Y floor-cap normal)', () => {
    const pts = rectanglePoints(2, 4);
    expect(pts).toEqual([[2, 4], [2, -4], [-2, -4], [-2, 4]]);
  });
});

describe('rectangleFaces', () => {
  it('returns 4 faces with normalAngle 0 (front, +Z), PI/2 (right, +X), PI (back, -Z), -PI/2 (left, -X), matching octagonFaces\' own atan2(midX, midZ) convention', () => {
    const faces = rectangleFaces(2, 4);
    expect(faces).toHaveLength(4);
    expect(faces[0]!.normalAngle).toBeCloseTo(Math.PI / 2, 5);   // right (+X wall)
    expect(faces[1]!.normalAngle).toBeCloseTo(Math.PI, 5);        // back (-Z wall, apse-facing)
    expect(faces[2]!.normalAngle).toBeCloseTo(-Math.PI / 2, 5);   // left (-X wall)
    expect(faces[3]!.normalAngle).toBeCloseTo(0, 5);              // front (+Z wall, entrance)
  });

  it('each face\'s a/b corners match consecutive rectanglePoints entries', () => {
    const pts = rectanglePoints(2, 4);
    const faces = rectangleFaces(2, 4);
    for (let i = 0; i < 4; i++) {
      expect(faces[i]!.a).toEqual(pts[i]);
      expect(faces[i]!.b).toEqual(pts[(i + 1) % 4]);
    }
  });
});

describe('facePointAt', () => {
  it('returns face.a at t=0 and face.b at t=1', () => {
    const faces = rectangleFaces(2, 4);
    const face = faces[0]!; // right wall, a=[2,4], b=[2,-4]
    expect(facePointAt(face, 0)).toEqual([2, 4]);
    expect(facePointAt(face, 1)).toEqual([2, -4]);
  });

  it('linearly interpolates at t=0.5 (the face midpoint)', () => {
    const faces = rectangleFaces(2, 4);
    const face = faces[0]!;
    const [x, z] = facePointAt(face, 0.5);
    expect(x).toBeCloseTo(2, 5);
    expect(z).toBeCloseTo(0, 5);
  });

  it('at t=0.3 matches manual interpolation for a non-axis-aligned face', () => {
    // Use an octagon face (diagonal a/b) to prove this isn't rectangle-specific.
    const faces = octagonFaces(2);
    const face = faces[0]!;
    const [ax, az] = face.a;
    const [bx, bz] = face.b;
    const [x, z] = facePointAt(face, 0.3);
    expect(x).toBeCloseTo(ax + (bx - ax) * 0.3, 5);
    expect(z).toBeCloseTo(az + (bz - az) * 0.3, 5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/buildings/StoneTowerShape.test.ts`
Expected: FAIL — `rectanglePoints`/`rectangleFaces`/`facePointAt` are not
exported yet.

- [ ] **Step 3: Write the implementation**

In `src/world/buildings/StoneTowerShape.ts`, add at the end of the file:

```ts
/**
 * Returns the 4 corners of a rectangle of the given half-width/half-depth,
 * as [x, z] pairs -- same winding direction as `octagonPoints()` (verified
 * by direct computation to produce the same +Y-facing floor-cap normal):
 * (halfW, halfD) -> (halfW, -halfD) -> (-halfW, -halfD) -> (-halfW, halfD).
 * Used by any building whose footprint is a genuine rectangle rather than
 * a regular octagon (e.g. the elven chapel's 4x8 nave) -- paired with
 * `rectangleFaces()` below, this lets `buildFloorCap()`/`buildQuoins()`
 * (via their `pointsOverride` parameter) and `buildWallSurfaceBlocks()`
 * (via its existing `facesOverride` parameter) build a real rectangular
 * hall using the exact same real per-course block-and-mortar technique as
 * every octagonal tower-kit building, with zero new wall-building code.
 */
export function rectanglePoints(halfW: number, halfD: number): [number, number][] {
  return [
    [halfW, halfD],
    [halfW, -halfD],
    [-halfW, -halfD],
    [-halfW, halfD],
  ];
}

/**
 * Returns the 4 faces of a rectangle of the given half-width/half-depth,
 * in the same `OctagonFace` shape and winding order as `octagonFaces()`.
 * Face 0 = the +X (right) wall, face 1 = the -Z (back) wall, face 2 =
 * the -X (left) wall, face 3 = the +Z (front, entrance) wall -- matching
 * `rectanglePoints()`'s own corner order.
 */
export function rectangleFaces(halfW: number, halfD: number): OctagonFace[] {
  const pts = rectanglePoints(halfW, halfD);
  const faces: OctagonFace[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const midX = (a[0] + b[0]) / 2;
    const midZ = (a[1] + b[1]) / 2;
    faces.push({ a, b, normalAngle: Math.atan2(midX, midZ) });
  }
  return faces;
}

/**
 * Linearly interpolates a point along a face's own a->b segment, for
 * `t` in [0, 1] (t=0 -> `face.a`, t=1 -> `face.b`, t=0.5 -> the face's
 * own midpoint). Works for ANY face (rectangle or octagon) -- a small,
 * pure, generically reusable utility, distinct from
 * `buildWallSurfaceBlocks()`'s own inline per-block placement math
 * (which additionally handles per-course jitter/offset that a
 * window/entrance placement caller doesn't need).
 */
export function facePointAt(face: OctagonFace, t: number): [number, number] {
  const [ax, az] = face.a;
  const [bx, bz] = face.b;
  return [ax + (bx - ax) * t, az + (bz - az) * t];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/buildings/StoneTowerShape.test.ts`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/StoneTowerShape.ts tests/world/buildings/StoneTowerShape.test.ts
git commit -m "feat: add rectanglePoints/rectangleFaces/facePointAt -- rectangle shape math for non-octagon tower-kit buildings"
```

---

### Task 2: Generalize `buildFloorCap()` to accept an explicit point list

**Files:**
- Modify: `src/world/buildings/StoneTowerFloorCap.ts`
- Test: `tests/world/buildings/StoneTowerFloorCap.test.ts`

**Interfaces:**
- Consumes: `rectanglePoints` from Task 1 (test-only; the function itself
  accepts any `[number, number][]`).
- Produces: `buildFloorCap(radius: number, material: THREE.Material,
  vertexScales?: number[], pointsOverride?: [number, number][]):
  THREE.Mesh` — existing 3-arg call sites are unaffected (last param
  defaults to `undefined`).

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/buildings/StoneTowerFloorCap.test.ts` (add the import
`rectanglePoints` from `@/world/buildings/StoneTowerShape` alongside the
existing imports):

```ts
import { rectanglePoints } from '@/world/buildings/StoneTowerShape';

// ... inside describe('buildFloorCap', () => { ... }), add:

it('pointsOverride replaces the default octagon corners with the given points', () => {
  const rectPts = rectanglePoints(2, 4);
  const cap = buildFloorCap(0, mat(), undefined, rectPts);
  const pos = cap.geometry.attributes.position;
  // Center vertex (index 0) plus exactly 4 corner vertices (indices 1-4).
  expect(pos.count).toBe(5);
  // Corner vertices should exactly match rectPts (in x/z; y is always 0).
  for (let i = 0; i < 4; i++) {
    expect(pos.getX(i + 1)).toBeCloseTo(rectPts[i]![0], 5);
    expect(pos.getZ(i + 1)).toBeCloseTo(rectPts[i]![1], 5);
  }
});

it('pointsOverride produces a +Y-facing normal, same as the default octagon path', () => {
  const rectPts = rectanglePoints(2, 4);
  const cap = buildFloorCap(0, mat(), undefined, rectPts);
  cap.geometry.computeVertexNormals();
  const normals = cap.geometry.attributes.normal;
  for (let i = 0; i < normals.count; i++) {
    expect(normals.getY(i)).toBeGreaterThan(0.9);
  }
});

it('omitting pointsOverride reproduces the exact prior octagon behavior (backward compatibility)', () => {
  const capDefault = buildFloorCap(2, mat());
  expect(capDefault.geometry.attributes.position.count).toBe(9); // center + 8 octagon corners
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/buildings/StoneTowerFloorCap.test.ts`
Expected: the 2 new `pointsOverride` tests FAIL (parameter doesn't exist
yet / is ignored); the backward-compatibility test PASSES already (no
regression risk there since nothing has changed yet).

- [ ] **Step 3: Write the implementation**

Replace the whole `buildFloorCap` function in
`src/world/buildings/StoneTowerFloorCap.ts` with:

```ts
export function buildFloorCap(
  radius: number, material: THREE.Material, vertexScales?: number[],
  pointsOverride?: [number, number][],
): THREE.Mesh {
  const pts = pointsOverride ?? octagonPoints(radius, vertexScales);
  const positions: number[] = [0, 0, 0]; // center vertex, index 0
  // Simple planar UV mapping (x/z projected into [0,1]) -- required so
  // this geometry merges cleanly with the wall/quoin/entrance geometry
  // it shares a material with (see mergeGroupMeshesByMaterial() in
  // MeshMergeUtils.ts, called on the whole building group by
  // SettlementRenderer.ts): mergeGeometries() requires every geometry in
  // a merge bucket to have the exact same attribute set, and a missing
  // `uv` attribute here caused it to fail silently (logged, not thrown)
  // -- which in turn caused mergeGroupMeshesByMaterial() to drop AND
  // dispose EVERY mesh in that material's bucket, including the wall
  // itself, leaving affected buildings with no visible walls at all
  // (a real regression caught via live Playwright verification, not
  // any automated test -- see this file's own test for the regression
  // guard now in place). When `pointsOverride` is given (e.g. a
  // rectangle nave, which has no single natural "radius"), the UV
  // normalization falls back to the max absolute coordinate across the
  // override points instead of `radius`, so UVs stay in a sane [0,1]-ish
  // range regardless of shape.
  const uvScale = pointsOverride
    ? Math.max(1e-6, ...pts.flatMap(([x, z]) => [Math.abs(x), Math.abs(z)])) * 2
    : radius * 2;
  const uvs: number[] = [0.5, 0.5];
  for (const [x, z] of pts) uvs.push(x / uvScale + 0.5, z / uvScale + 0.5);
  for (const [x, z] of pts) positions.push(x, 0, z);

  const indices: number[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % n);
    indices.push(0, a, b);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'elven-tower-floor-cap';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
```

Also update the file's own top doc comment to mention the new
`pointsOverride` capability (append one sentence: "An optional
`pointsOverride` parameter lets a caller supply an arbitrary corner-point
list (e.g. a rectangle) instead of a regular octagon -- see
`ElvenChapelKit.ts`'s nave for the first consumer.").

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/buildings/StoneTowerFloorCap.test.ts`
Expected: PASS (all tests, including the pre-existing ones from the
prior round).

- [ ] **Step 5: Run the tower-kit regression guard**

Run: `npx vitest run tests/world/buildings/StoneTowerKit.test.ts`
Expected: PASS (all 33 tests unchanged — proves this generalization
didn't alter `buildElvenStoneTower()`'s own behavior).

- [ ] **Step 6: Commit**

```bash
git add src/world/buildings/StoneTowerFloorCap.ts tests/world/buildings/StoneTowerFloorCap.test.ts
git commit -m "feat: generalize buildFloorCap with an optional pointsOverride for non-octagon shapes"
```

---

### Task 3: Generalize `buildQuoins()` to accept an explicit point list

**Files:**
- Modify: `src/world/buildings/StoneTowerQuoins.ts`
- Test: `tests/world/buildings/StoneTowerQuoins.test.ts`

**Interfaces:**
- Consumes: `rectanglePoints` from Task 1 (test-only).
- Produces: `buildQuoins(radius: number, ringHeight: number, vertexScales:
  number[] | undefined, material: THREE.Material, pointsOverride?:
  [number, number][]): THREE.Group` — existing 4-arg call sites
  unaffected.

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/buildings/StoneTowerQuoins.test.ts` (add the import
`rectanglePoints` from `@/world/buildings/StoneTowerShape` alongside the
existing imports):

```ts
import { rectanglePoints } from '@/world/buildings/StoneTowerShape';

// New describe block:
describe('buildQuoins pointsOverride', () => {
  it('places exactly one quoin per override point instead of the default 8 octagon corners', () => {
    const rectPts = rectanglePoints(2, 4);
    const g = buildQuoins(2, 3, undefined, mat(), rectPts);
    let meshCount = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
    expect(meshCount).toBe(4);
  });

  it('positions each quoin proud of its own override corner, along that corner\'s own direction from origin', () => {
    const rectPts = rectanglePoints(2, 4);
    const g = buildQuoins(2, 3, undefined, mat(), rectPts);
    const meshes = g.children.filter((c) => c instanceof THREE.Mesh) as THREE.Mesh[];
    // First quoin corresponds to rectPts[0] = [2, 4]; QUOIN_PROUD (1.05) pushes it
    // slightly further from the origin along the same direction.
    expect(meshes[0]!.position.x).toBeGreaterThan(2);
    expect(meshes[0]!.position.z).toBeGreaterThan(4);
  });

  it('omitting pointsOverride reproduces the exact prior octagon behavior (backward compatibility)', () => {
    const g = buildQuoins(2, 3, undefined, mat());
    let meshCount = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
    expect(meshCount).toBe(8);
  });
});
```

If `mat()` isn't already a helper defined in this test file, check its
existing helper name (open the file first) and reuse whatever material
factory it already has rather than defining a duplicate.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/buildings/StoneTowerQuoins.test.ts`
Expected: the 2 new `pointsOverride` tests FAIL; the backward-
compatibility test PASSES already.

- [ ] **Step 3: Write the implementation**

Replace the whole `buildQuoins` function in
`src/world/buildings/StoneTowerQuoins.ts` with:

```ts
export function buildQuoins(
  radius: number, ringHeight: number, vertexScales: number[] | undefined, material: THREE.Material,
  pointsOverride?: [number, number][],
): THREE.Group {
  const g = new THREE.Group();
  const pts = pointsOverride ?? octagonPoints(radius, vertexScales);
  const quoinWidth = radius * 0.1;
  const quoinDepth = radius * 0.1;

  for (const [x, z] of pts) {
    const ang = Math.atan2(x, z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(quoinWidth, ringHeight, quoinDepth), material);
    mesh.position.set(x * QUOIN_PROUD, ringHeight / 2, z * QUOIN_PROUD);
    mesh.rotation.y = ang;
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  }

  return g;
}
```

(This is identical to the existing body except the first line, which now
reads `pointsOverride ?? octagonPoints(radius, vertexScales)` instead of
always calling `octagonPoints()`.) Update the function's own doc comment
to mention: "An optional `pointsOverride` parameter lets a caller supply
an arbitrary corner-point list (e.g. a rectangle's 4 real corners)
instead of a regular octagon's 8 -- `radius` is still used to scale each
quoin box's own width/depth, so pass a representative scale (e.g. a
rectangular nave's own half-width) even when overriding the point
source."

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/buildings/StoneTowerQuoins.test.ts`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Run the tower-kit regression guard**

Run: `npx vitest run tests/world/buildings/StoneTowerKit.test.ts`
Expected: PASS (all 33 tests unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/world/buildings/StoneTowerQuoins.ts tests/world/buildings/StoneTowerQuoins.test.ts
git commit -m "feat: generalize buildQuoins with an optional pointsOverride for non-octagon shapes"
```

---

### Task 4: `buildGableRoofCap()` — new gabled-ridge roof primitive

**Files:**
- Create: `src/world/buildings/StoneTowerGableRoof.ts`
- Test: `tests/world/buildings/StoneTowerGableRoof.test.ts`

**Interfaces:**
- Consumes: nothing new (plain Three.js primitives only).
- Produces: `buildGableRoofCap(halfWidth: number, halfDepth: number,
  ridgeHeight: number, material: THREE.Material): THREE.Group` —
  consumed by Task 6 (nave roof) via `ElvenChapelKit.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/world/buildings/StoneTowerGableRoof.test.ts`:

```ts
/**
 * StoneTowerGableRoof.test.ts — the gabled-ridge roof primitive for
 * rectangular tower-kit-family halls (docs/superpowers/specs/
 * 2026-09-04-elven-chapel-rebuild-design.md): two raked planes meeting
 * at a central ridge, closed at each end by a gable triangle -- the
 * real-world vernacular default for a small rectangular nave, since none
 * of the kit's existing radial roof-caps (classic/pagoda/living) can fit
 * a rectangle.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildGableRoofCap } from '@/world/buildings/StoneTowerGableRoof';

function mat(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#888' });
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

describe('buildGableRoofCap', () => {
  it('produces valid, non-NaN geometry across a range of dimensions', () => {
    for (const [hw, hd, rh] of [[2, 4, 2.5], [1, 2, 1.2], [3, 6, 3.5]] as [number, number, number][]) {
      const g = buildGableRoofCap(hw, hd, rh, mat());
      expect(hasNaN(g)).toBe(false);
      let meshCount = 0;
      g.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
      expect(meshCount).toBeGreaterThan(0);
    }
  });

  it('reaches its full ridge height (the tallest mesh vertex is close to ridgeHeight)', () => {
    const ridgeHeight = 2.7;
    const g = buildGableRoofCap(2, 4, ridgeHeight, mat());
    const box = new THREE.Box3().setFromObject(g);
    expect(box.max.y).toBeGreaterThan(ridgeHeight * 0.9);
    expect(box.max.y).toBeLessThan(ridgeHeight * 1.15);
  });

  it('the two roof planes overhang slightly past halfWidth at the eave (a real flared eave, not flush with the wall)', () => {
    const halfWidth = 2;
    const g = buildGableRoofCap(halfWidth, 4, 2.5, mat());
    const box = new THREE.Box3().setFromObject(g);
    expect(box.max.x).toBeGreaterThan(halfWidth);
    expect(box.min.x).toBeLessThan(-halfWidth);
  });

  it('spans the full depth (2*halfDepth) along Z, closed at both gable ends', () => {
    const halfDepth = 4;
    const g = buildGableRoofCap(2, halfDepth, 2.5, mat());
    const box = new THREE.Box3().setFromObject(g);
    expect(box.max.z).toBeCloseTo(halfDepth, 0);
    expect(box.min.z).toBeCloseTo(-halfDepth, 0);
  });

  it('is deterministic (same inputs, same output geometry)', () => {
    const g1 = buildGableRoofCap(2, 4, 2.5, mat());
    const g2 = buildGableRoofCap(2, 4, 2.5, mat());
    let n1 = 0, n2 = 0;
    g1.traverse((o) => { if (o instanceof THREE.Mesh) n1 += o.geometry.attributes.position.count; });
    g2.traverse((o) => { if (o instanceof THREE.Mesh) n2 += o.geometry.attributes.position.count; });
    expect(n1).toBe(n2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/buildings/StoneTowerGableRoof.test.ts`
Expected: FAIL — module `@/world/buildings/StoneTowerGableRoof` doesn't
exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/world/buildings/StoneTowerGableRoof.ts`:

```ts
/**
 * StoneTowerGableRoof.ts — a gabled-ridge roof primitive for rectangular
 * tower-kit-family halls (docs/superpowers/specs/
 * 2026-09-04-elven-chapel-rebuild-design.md): two raked planes meeting
 * at a central ridge beam, closed at each end by a flat gable triangle
 * -- the real-world vernacular default roof for a small rectangular
 * nave (a "long single-cell" hall), matching the small Jenkin Chapel
 * (Cheshire) precedent. None of the kit's existing radial roof-caps
 * (StoneTowerRoofCap.ts's classic/pagoda/living, all built from
 * CylinderGeometry/ConeGeometry stacks) can fit a rectangle -- this is
 * a genuinely new primitive, not a variant of an existing one.
 *
 * Generically reusable by any future rectangular-hall building (not
 * elven-specific), matching how StoneTowerRoofCap.ts holds the radial
 * archetypes shared across the whole tower-kit family.
 */

import * as THREE from 'three';

/** Fraction of halfWidth the roof overhangs past the wall at the eave --
 * matches the tower kit's own flared-eave convention
 * (StoneTowerRoofCap.ts's `eaveOuterR`). */
const EAVE_OVERHANG_FRAC = 0.15;

/**
 * Builds one raked roof plane (a thin box) running from the eave at
 * world (side*outerHalfWidth, 0) up to the ridge at (0, ridgeHeight),
 * spanning the full depth along Z. `side` is +1 (right/+X slope) or -1
 * (left/-X slope).
 */
function _buildSlopePlane(outerHalfWidth: number, ridgeHeight: number, depth: number, material: THREE.Material, side: 1 | -1): THREE.Mesh {
  const slopeLength = Math.hypot(outerHalfWidth, ridgeHeight);
  const thickness = Math.max(0.06, outerHalfWidth * 0.03);
  const geo = new THREE.BoxGeometry(slopeLength, thickness, depth);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(side * outerHalfWidth / 2, ridgeHeight / 2, 0);
  const dx = 0 - side * outerHalfWidth;
  const dy = ridgeHeight - 0;
  mesh.rotation.z = Math.atan2(dy, dx);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds one flat vertical gable-end triangle (fills the open gap under
 * a slope plane's own end) at world Z = `zPos`, spanning from
 * (-outerHalfWidth, 0) to (outerHalfWidth, 0) to (0, ridgeHeight).
 * `side: THREE.DoubleSide` on the material avoids any risk of the
 * triangle's winding direction facing the wrong way (a small, low-value
 * panel not worth a bespoke per-end winding derivation).
 */
function _buildGableEndTriangle(outerHalfWidth: number, ridgeHeight: number, zPos: number, material: THREE.Material): THREE.Mesh {
  const positions = new Float32Array([
    -outerHalfWidth, 0, 0,
    outerHalfWidth, 0, 0,
    0, ridgeHeight, 0,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  geo.setIndex([0, 1, 2]);
  geo.computeVertexNormals();
  const doubleSideMat = material.clone();
  (doubleSideMat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, doubleSideMat);
  mesh.position.z = zPos;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds a complete gabled-ridge roof: two raked planes (`_buildSlopePlane`),
 * a ridge-cap beam along the peak, 2 gable-end triangle fills
 * (`_buildGableEndTriangle`), and 2 small ridge-end finials (reusing the
 * tower kit's own corner-finial vocabulary) for decorative continuity
 * with the rest of the kit.
 */
export function buildGableRoofCap(halfWidth: number, halfDepth: number, ridgeHeight: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const outerHalfWidth = halfWidth * (1 + EAVE_OVERHANG_FRAC);
  const depth = halfDepth * 2;

  g.add(_buildSlopePlane(outerHalfWidth, ridgeHeight, depth, material, 1));
  g.add(_buildSlopePlane(outerHalfWidth, ridgeHeight, depth, material, -1));

  const ridgeBeam = new THREE.Mesh(
    new THREE.BoxGeometry(halfWidth * 0.12, halfWidth * 0.12, depth * 1.02),
    material,
  );
  ridgeBeam.position.y = ridgeHeight;
  ridgeBeam.castShadow = ridgeBeam.receiveShadow = true;
  g.add(ridgeBeam);

  g.add(_buildGableEndTriangle(outerHalfWidth, ridgeHeight, halfDepth, material));
  g.add(_buildGableEndTriangle(outerHalfWidth, ridgeHeight, -halfDepth, material));

  const finialH = halfWidth * 0.3;
  for (const zSide of [1, -1]) {
    const finial = new THREE.Mesh(new THREE.ConeGeometry(halfWidth * 0.045, finialH, 4), material);
    finial.position.set(0, ridgeHeight + finialH / 2, zSide * halfDepth);
    finial.castShadow = true;
    g.add(finial);
  }

  return g;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/buildings/StoneTowerGableRoof.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/StoneTowerGableRoof.ts tests/world/buildings/StoneTowerGableRoof.test.ts
git commit -m "feat: add buildGableRoofCap -- gabled-ridge roof primitive for rectangular tower-kit halls"
```

---

### Task 5: `ElvenChapelKit.ts` — the nave shell (walls, quoins, floor cap, entrance)

**Files:**
- Create: `src/world/buildings/ElvenChapelKit.ts`
- Test: `tests/world/buildings/ElvenChapelKit.test.ts`

**Interfaces:**
- Consumes: `rectanglePoints`/`rectangleFaces` (Task 1),
  `buildFloorCap` with `pointsOverride` (Task 2), `buildQuoins` with
  `pointsOverride` (Task 3), `buildWallSurfaceBlocks` (existing,
  unchanged), `buildEntrance`/`pickEntranceStyle` (existing, unchanged),
  `StoneTowerPalette` type (existing).
- Produces: an internal (not yet exported) `_buildNave(dna, halfW,
  halfD, naveHeight, palette): THREE.Group` — a private helper this
  task builds and tests indirectly via a temporary exported wrapper (see
  Step 3), which Task 6 will extend in place (same function, more
  content) rather than replacing.

- [ ] **Step 1: Write the failing test**

Create `tests/world/buildings/ElvenChapelKit.test.ts`:

```ts
/**
 * ElvenChapelKit.test.ts — the elven chapel/shrine (nave + apse +
 * bellcote + forecourt), built on the same real block-course + carved-
 * opening construction technique as the elven stone-tower kit (docs/
 * superpowers/specs/2026-09-04-elven-chapel-rebuild-design.md).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildElvenChapelShrine } from '@/world/buildings/ElvenChapelKit';
import { STYLE_COLORS } from '@/world/buildings/BuildingDNA';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';

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

function makeDna(seed: number): BuildingDNA {
  return {
    v: 1, kind: 'building', name: 'test chapel', seed,
    buildingKind: 'chapel', size: 'medium', floors: 1,
    style: 'elven', condition: 'weathered',
    hasInterior: true, interiorLayout: 'single_room',
    colors: STYLE_COLORS['elven'], rotation: 0, faction: 'elven',
    terrace: 'none', features: [],
  };
}

describe('buildElvenChapelShrine', () => {
  it('produces valid, non-NaN geometry across a seed sweep', () => {
    for (let seed = 0; seed < 10; seed++) {
      const g = buildElvenChapelShrine(makeDna(seed));
      expect(hasNaN(g)).toBe(false);
      expect(countVerts(g)).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same seed and varies with a different seed', () => {
    const g1 = buildElvenChapelShrine(makeDna(42));
    const g2 = buildElvenChapelShrine(makeDna(42));
    const g3 = buildElvenChapelShrine(makeDna(43));
    expect(countVerts(g1)).toBe(countVerts(g2));
    expect(countVerts(g1)).not.toBe(countVerts(g3));
  });

  it('builds the nave from many discrete real block meshes (BoxGeometry, matching Strategy G), not a BlockKit voxel grid', () => {
    const g = buildElvenChapelShrine(makeDna(7));
    let boxCount = 0;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'BoxGeometry') boxCount++;
    });
    expect(boxCount).toBeGreaterThan(10);
  });

  it('has a carved entrance doorway (a genuine recessed opening, not a flat surface)', () => {
    const g = buildElvenChapelShrine(makeDna(5));
    let sawExtrude = false;
    g.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry.type === 'ExtrudeGeometry') sawExtrude = true; });
    expect(sawExtrude).toBe(true);
  });

  it('has a solid floor cap (no seethrough gap at the nave\'s own top)', () => {
    const g = buildElvenChapelShrine(makeDna(9));
    const cap = g.getObjectByName('elven-tower-floor-cap');
    expect(cap).toBeDefined();
  });

  it('has 4 quoin pillars for the nave\'s 4 real rectangular corners', () => {
    const g = buildElvenChapelShrine(makeDna(3));
    const quoins = g.getObjectByName('elven-chapel-nave-quoins');
    expect(quoins).toBeDefined();
    let meshCount = 0;
    quoins!.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
    expect(meshCount).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/buildings/ElvenChapelKit.test.ts`
Expected: FAIL — module `@/world/buildings/ElvenChapelKit` doesn't exist
yet.

- [ ] **Step 3: Write the implementation**

Create `src/world/buildings/ElvenChapelKit.ts`:

```ts
/**
 * ElvenChapelKit.ts — the elven chapel/shrine, built on the same real
 * block-course + carved-opening construction technique as the elven
 * stone-tower kit (docs/superpowers/specs/
 * 2026-09-04-elven-chapel-rebuild-design.md), replacing the old
 * standing-tree-stones `buildElvenChapel()` -- the last elven building
 * kind not yet on this technique.
 *
 * A rectangular nave (the chapel's fixed 4x8 "long nave" footprint --
 * see BuildingDNA.ts's `KIND_FOOTPRINT.chapel` -- doesn't fit the tower
 * kit's single-radius octagon, so this reuses `buildWallSurfaceBlocks()`'s
 * existing `facesOverride` mechanism with a real 4-face rectangle
 * (`rectangleFaces()`), plus `buildFloorCap()`/`buildQuoins()`'s new
 * `pointsOverride` parameter for the same rectangle's 4 real corners --
 * zero changes needed to `buildWallSurfaceBlocks()` itself), topped with
 * a new `buildGableRoofCap()` (none of the kit's existing radial roof-
 * caps can fit a rectangle). A small octagonal apse (altar niche) and a
 * bellcote and forecourt are added in later tasks, all using existing,
 * unmodified tower-kit machinery.
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { BuildingDNA } from './BuildingDNA';
import { getFootprint, FLOOR_HEIGHT } from './BuildingDNA';
import { barkTexture, ashlarTexture } from './FactionBlockTextures';
import { slateTexture } from './TextureFactory';
import { rectanglePoints, rectangleFaces } from './StoneTowerShape';
import { buildWallSurfaceBlocks } from './StoneTowerWallSurface';
import { buildFloorCap } from './StoneTowerFloorCap';
import { buildQuoins } from './StoneTowerQuoins';
import { buildEntrance, pickEntranceStyle } from './StoneTowerEntrance';
import type { StoneTowerPalette } from './StoneTowerKit';

function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...opts });
}

/**
 * Builds the nave: a real rectangular wall (per-course blocks via
 * `buildWallSurfaceBlocks()`'s `facesOverride`), quoins at its 4 real
 * corners, a solid floor cap, and a carved entrance centered on the
 * front (+Z) gable wall -- which sits at exactly `z = halfD` with NO
 * rotation needed, since `rectangleFaces()`'s face index 3 (normalAngle
 * 0) has its own midpoint at `(0, halfD)`, matching `buildEntrance()`'s
 * own baked-in local-Z=radius convention exactly.
 */
function _buildNave(dna: BuildingDNA, halfW: number, halfD: number, naveHeight: number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  const naveSeed = dna.seed ^ 0x4E415645; // 'NAVE' in ASCII hex

  const navePoints = rectanglePoints(halfW, halfD);
  const naveFaces = rectangleFaces(halfW, halfD);

  const walls = buildWallSurfaceBlocks(0, naveHeight, naveSeed, palette.stone, { facesOverride: naveFaces });
  g.add(walls);

  const quoins = buildQuoins(halfW, naveHeight, undefined, palette.stone, navePoints);
  quoins.name = 'elven-chapel-nave-quoins';
  g.add(quoins);

  const floorCap = buildFloorCap(0, palette.stone, undefined, navePoints);
  floorCap.position.y = naveHeight;
  g.add(floorCap);

  // Entrance: front (+Z) gable wall, face index 3 (normalAngle 0).
  const entranceStyle = pickEntranceStyle(dna.seed);
  const entrance = buildEntrance(entranceStyle, halfD, dna.seed, palette);
  g.add(entrance);

  return g;
}

/**
 * Public entry point: builds a complete elven chapel/shrine for the
 * given `BuildingDNA` (dispatched from FactionBuildingVariants.ts's
 * elven `chapel` override). Footprint is always the fixed 4x8 "long
 * nave" (`KIND_FOOTPRINT.chapel`), floor count is always 1 (the only
 * reachable path, the `church` ward, sets `WARD_TO_FLOORS.church = 1`).
 */
export function buildElvenChapelShrine(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const naveHeight = FLOOR_HEIGHT * Math.max(1, dna.floors) * 1.4;

  const palette: StoneTowerPalette = {
    stone:     mat(dna.colors.walls, { roughness: 0.85, map: ashlarTexture(Math.max(1, halfW), Math.max(1, naveHeight / 1.5)) }),
    shingle:   mat(dna.colors.roof, { roughness: 0.75, map: slateTexture(Math.max(1, halfW), Math.max(1, naveHeight / 1.5)) }),
    leaf:      mat(dna.colors.trim, { roughness: 0.75 }),
    bark:      mat('#4a3520', { roughness: 0.9, map: barkTexture() }),
    moonstone: mat('#d8e8f0', { roughness: 0.5, metalness: 0.05 }),
  };

  const g = new THREE.Group();
  g.add(_buildNave(dna, halfW, halfD, naveHeight, palette));
  return g;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/buildings/ElvenChapelKit.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/ElvenChapelKit.ts tests/world/buildings/ElvenChapelKit.test.ts
git commit -m "feat: add ElvenChapelKit's nave shell -- real rectangular block-course walls, quoins, floor cap, entrance"
```

---

### Task 6: Nave windows + gable roof

**Files:**
- Modify: `src/world/buildings/ElvenChapelKit.ts`
- Test: `tests/world/buildings/ElvenChapelKit.test.ts`

**Interfaces:**
- Consumes: `facePointAt` (Task 1), `buildGableRoofCap` (Task 4),
  `buildWindow`/`pickWindowStyle`/`WindowStyle` (existing, unchanged).
- Produces: `_buildNave()` now also adds 4 lancet windows and returns
  the roof separately from `buildElvenChapelShrine()` (see code below)
  — no new exported names beyond what Task 5 already added.

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/buildings/ElvenChapelKit.test.ts`, inside the
existing `describe('buildElvenChapelShrine', ...)` block:

```ts
  it('has exactly 4 lancet (pointed-arch) windows, 2 per long side wall', () => {
    const g = buildElvenChapelShrine(makeDna(11));
    // Every window is built via buildRecessedArchOpening(), which (like
    // the entrance) produces its own ExtrudeGeometry frame + cavity pair
    // -- counting total ExtrudeGeometry meshes and subtracting the 1
    // known entrance frame+cavity pair isolates the window count.
    // Simpler, more direct proxy: each window's own moonstone oculus
    // accent (a small CylinderGeometry) is unique to windows, never
    // built by the entrance -- count those instead.
    let accentCount = 0;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'CylinderGeometry') {
        const mat2 = o.material as THREE.MeshStandardMaterial;
        if (mat2.color?.getHexString?.() === 'd8e8f0') accentCount++;
      }
    });
    expect(accentCount).toBe(4);
  });

  it('has a gabled roof reaching above the nave\'s own wall height', () => {
    const g = buildElvenChapelShrine(makeDna(4));
    const box = new THREE.Box3().setFromObject(g);
    // naveHeight = FLOOR_HEIGHT(3.2) * 1 * 1.4 = 4.48; the roof's ridge
    // must add real height above that.
    expect(box.max.y).toBeGreaterThan(4.48 + 1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/buildings/ElvenChapelKit.test.ts`
Expected: the 2 new tests FAIL (no windows/roof built yet); the 6
pre-existing tests still PASS.

- [ ] **Step 3: Write the implementation**

In `src/world/buildings/ElvenChapelKit.ts`, add to the imports:

```ts
import { facePointAt } from './StoneTowerShape';
import { pickWindowStyle, buildWindow } from './StoneTowerWindows';
import { buildGableRoofCap } from './StoneTowerGableRoof';
```

Add this private helper right after `_buildNave`'s own closing brace
(before `buildElvenChapelShrine`):

```ts
/**
 * Rotates + positions `obj` (a window/entrance group whose own geometry
 * is always built flush at local Z = `radius`, per
 * StoneTowerOpenings.ts's shared convention) onto `face` at fractional
 * position `t` along the face's own a->b segment (t=0.5 = the face's
 * own centered default). `radius` MUST equal the exact perpendicular
 * distance from the nave's own center to `face`'s own midpoint (verified
 * by direct computation: rotating `obj`'s own baked-in local (0,0,radius)
 * reference point by `face.normalAngle` lands it EXACTLY on that
 * midpoint when this holds) -- for the rectangle nave's own side walls,
 * that's `halfW` (StoneTowerShape.ts's `rectangleFaces()` docs).
 */
function _placeOnFace(obj: THREE.Object3D, face: { a: [number, number]; b: [number, number]; normalAngle: number }, radius: number, t: number): void {
  obj.rotation.y = face.normalAngle;
  const midX = (face.a[0] + face.b[0]) / 2;
  const midZ = (face.a[1] + face.b[1]) / 2;
  const [targetX, targetZ] = facePointAt(face, t);
  obj.position.x += targetX - midX;
  obj.position.z += targetZ - midZ;
}
```

Modify `_buildNave` to add windows before its `return g;` line:

```ts
  // Entrance: front (+Z) gable wall, face index 3 (normalAngle 0).
  const entranceStyle = pickEntranceStyle(dna.seed);
  const entrance = buildEntrance(entranceStyle, halfD, dna.seed, palette);
  g.add(entrance);

  // 4 lancet windows, 2 per long side wall (faces 0 and 2 -- the +X/-X
  // walls) -- real single-cell parish naves read as an evenly-spaced
  // lancet rhythm along both long walls (see design doc's research
  // summary), not clustered on one side.
  const windowRand = mulberry32(dna.seed ^ 0x57494E44); // 'WIND'-ish tag, matching StoneTowerWindows.ts's own convention
  for (const face of [naveFaces[0]!, naveFaces[2]!]) {
    for (const t of [0.3, 0.7]) {
      const style = pickWindowStyle(dna.seed ^ Math.floor(windowRand() * 0xFFFF));
      const win = buildWindow({ type: 'pointed_arch', size: style.size }, halfW, naveHeight, palette);
      _placeOnFace(win, face, halfW, t);
      g.add(win);
    }
  }

  return g;
```

(Only re-rolling `style.size` from `pickWindowStyle` while always
forcing `type: 'pointed_arch'` -- the design doc's research explicitly
calls for lancet windows as the dominant/only nave window type, giving
size variety without type variety, unlike the tower's own 3-type
rotation.)

Update `buildElvenChapelShrine()` to add the roof:

```ts
export function buildElvenChapelShrine(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const naveHeight = FLOOR_HEIGHT * Math.max(1, dna.floors) * 1.4;
  const ridgeHeight = naveHeight * 0.55;

  const palette: StoneTowerPalette = {
    stone:     mat(dna.colors.walls, { roughness: 0.85, map: ashlarTexture(Math.max(1, halfW), Math.max(1, naveHeight / 1.5)) }),
    shingle:   mat(dna.colors.roof, { roughness: 0.75, map: slateTexture(Math.max(1, halfW), Math.max(1, naveHeight / 1.5)) }),
    leaf:      mat(dna.colors.trim, { roughness: 0.75 }),
    bark:      mat('#4a3520', { roughness: 0.9, map: barkTexture() }),
    moonstone: mat('#d8e8f0', { roughness: 0.5, metalness: 0.05 }),
  };

  const g = new THREE.Group();
  g.add(_buildNave(dna, halfW, halfD, naveHeight, palette));

  const roof = buildGableRoofCap(halfW, halfD, ridgeHeight, palette.shingle);
  roof.position.y = naveHeight;
  g.add(roof);

  return g;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/buildings/ElvenChapelKit.test.ts`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/ElvenChapelKit.ts tests/world/buildings/ElvenChapelKit.test.ts
git commit -m "feat: add 4 lancet windows + gabled roof to the elven chapel's nave"
```

---

### Task 7: Apse — small octagonal altar niche + relocated sacred crystal

**Files:**
- Modify: `src/world/buildings/ElvenChapelKit.ts`
- Test: `tests/world/buildings/ElvenChapelKit.test.ts`

**Interfaces:**
- Consumes: `octagonFaces` (existing, from `StoneTowerShape.ts`),
  `buildWallSurfaceBlocks` (existing), `buildFloorCap`/`buildQuoins`
  (existing, no override needed here since the apse IS a regular
  octagon), `buildLivingRoofCap` (existing, from
  `StoneTowerRoofCap.ts`).
- Produces: a new private `_buildApse(dna, halfD, palette): THREE.Group`,
  added to `buildElvenChapelShrine()`'s composition.

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/buildings/ElvenChapelKit.test.ts`:

```ts
  it('has an apse (small octagonal altar niche) docked against the nave\'s back wall, open toward the nave', () => {
    const g = buildElvenChapelShrine(makeDna(6));
    const apse = g.getObjectByName('elven-chapel-apse');
    expect(apse).toBeDefined();
    // Docked behind the nave: apse's own world position.z must be
    // negative (nave's back wall sits at z = -halfD; the apse projects
    // further in -Z from there).
    const worldPos = new THREE.Vector3();
    apse!.getWorldPosition(worldPos);
    expect(worldPos.z).toBeLessThan(0);
  });

  it('the apse always uses a living-canopy roof cap (never classic/pagoda), a deliberate sacred-altar identity choice', () => {
    for (let seed = 0; seed < 10; seed++) {
      const g = buildElvenChapelShrine(makeDna(seed));
      const apse = g.getObjectByName('elven-chapel-apse')!;
      let sawApexBall = false;
      apse.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') sawApexBall = true; });
      // buildClassicRoofCap/buildPagodaRoofCap always end with a
      // SphereGeometry apex finial ball; buildLivingRoofCap never does
      // (its geometry is a single merged BlockKit grid mesh) -- see
      // StoneTowerRoofCap.test.ts's own established discriminator.
      expect(sawApexBall).toBe(false);
    }
  });

  it('the sacred crystal sits inside the apse, on-axis (x approx 0), visible from the nave\'s own entrance', () => {
    const g = buildElvenChapelShrine(makeDna(8));
    const crystal = g.getObjectByName('elven-chapel-sacred-crystal');
    expect(crystal).toBeDefined();
    const worldPos = new THREE.Vector3();
    crystal!.getWorldPosition(worldPos);
    expect(Math.abs(worldPos.x)).toBeLessThan(0.1);
    expect(worldPos.z).toBeLessThan(0); // behind the nave, inside the apse
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/buildings/ElvenChapelKit.test.ts`
Expected: the 3 new tests FAIL (no apse built yet); the 8 pre-existing
tests still PASS.

- [ ] **Step 3: Write the implementation**

In `src/world/buildings/ElvenChapelKit.ts`, add to the imports:

```ts
import { octagonFaces } from './StoneTowerShape';
import { buildLivingRoofCap } from './StoneTowerRoofCap';
```

Add this private helper after `_buildNave` (before `buildElvenChapelShrine`):

```ts
/** How far the apse's own center sits behind the nave's back gable wall
 * (as a multiple of the apse's own radius) -- a modest overlap so the
 * apse visibly docks flush against the nave's flat wall (the real-world
 * round-tower-church precedent: this seam is the historically-attested
 * detail, not a flaw to hide -- see design doc's research summary). */
const APSE_DOCK_FRAC = 0.55;

/**
 * Builds the apse: a small octagonal altar niche, using the kit's
 * EXISTING, completely unmodified radial machinery (a regular octagon
 * via `octagonFaces()`, `buildFloorCap()`, `buildQuoins()`, all called
 * with no `pointsOverride` since the apse genuinely IS a regular
 * octagon). Open toward the nave (+Z direction): faces 0 and 7 (the two
 * faces nearest normalAngle=0, i.e. facing +Z) are omitted from the
 * wall's own `facesOverride`, so the altar niche is visible from inside
 * the nave rather than a sealed room -- the same "omit some faces"
 * technique already proven on the market stall's own partial back wall.
 * Always topped with a living-canopy roof cap (never the tower's own
 * classic/pagoda/living random dispatch) -- a deliberate identity
 * choice: the altar always sits beneath a living canopy, echoing the
 * tree-integration motif already established elsewhere in this kit, and
 * visually distinguishing the sacred apse from the nave's own new plain
 * gable roof.
 */
function _buildApse(dna: BuildingDNA, halfD: number, palette: StoneTowerPalette): THREE.Group {
  const apseSeed = dna.seed ^ 0x41505345; // 'APSE' in ASCII hex
  const apseRadius = halfD * 0.45;
  const apseHeight = FLOOR_HEIGHT * 0.9;

  const g = new THREE.Group();
  g.name = 'elven-chapel-apse';

  const allFaces = octagonFaces(apseRadius);
  const openFaces = allFaces.filter((_, i) => i !== 0 && i !== 7);
  const walls = buildWallSurfaceBlocks(0, apseHeight, apseSeed, palette.stone, { facesOverride: openFaces });
  g.add(walls);

  const quoins = buildQuoins(apseRadius, apseHeight, undefined, palette.stone);
  g.add(quoins);

  const floorCap = buildFloorCap(apseRadius, palette.stone);
  floorCap.position.y = apseHeight;
  g.add(floorCap);

  const roof = buildLivingRoofCap(apseSeed ^ 0x1DEA, apseRadius, { leaf: palette.leaf, bark: palette.bark });
  roof.position.y = apseHeight;
  g.add(roof);

  // Relocated sacred crystal (unchanged material identity from the old
  // buildElvenChapel()'s own emissive octahedron) -- on-axis at the
  // apse's own focal point, on a small pedestal.
  const pedestalMat = mat('#7a8a70', { roughness: 0.95 });
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(apseRadius * 0.18, apseRadius * 0.22, apseHeight * 0.3, 8), pedestalMat);
  pedestal.position.y = apseHeight * 0.15;
  pedestal.castShadow = pedestal.receiveShadow = true;
  g.add(pedestal);

  const crystalMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#a0ffe0'), emissive: new THREE.Color('#60ffc0'), emissiveIntensity: 1.0, roughness: 0.15, transparent: true, opacity: 0.9 });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(apseRadius * 0.2, 0), crystalMat);
  crystal.name = 'elven-chapel-sacred-crystal';
  crystal.position.y = apseHeight * 0.45;
  g.add(crystal);

  // Dock the whole apse behind the nave's own back gable wall (which
  // sits at world z = -halfD -- see rectangleFaces()'s face index 1).
  g.position.z = -halfD - apseRadius * (1 - APSE_DOCK_FRAC);

  return g;
}
```

Update `buildElvenChapelShrine()` to add the apse:

```ts
  const g = new THREE.Group();
  g.add(_buildNave(dna, halfW, halfD, naveHeight, palette));

  const roof = buildGableRoofCap(halfW, halfD, ridgeHeight, palette.shingle);
  roof.position.y = naveHeight;
  g.add(roof);

  g.add(_buildApse(dna, halfD, palette));

  return g;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/buildings/ElvenChapelKit.test.ts`
Expected: PASS (all 11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/ElvenChapelKit.ts tests/world/buildings/ElvenChapelKit.test.ts
git commit -m "feat: add the elven chapel's apse -- small octagonal altar niche with relocated sacred crystal"
```

---

### Task 8: Bellcote + forecourt + final composition

**Files:**
- Modify: `src/world/buildings/ElvenChapelKit.ts`
- Test: `tests/world/buildings/ElvenChapelKit.test.ts`

**Interfaces:**
- Consumes: `buildRecessedArchOpening`/`RecessedArchOptions` (existing,
  from `StoneTowerOpenings.ts`).
- Produces: `buildElvenChapelShrine()`'s final complete composition —
  no new exported names.

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/buildings/ElvenChapelKit.test.ts`:

```ts
  it('has a bellcote (pierced wall-slab) above the entrance gable, with at least 1 bell', () => {
    const g = buildElvenChapelShrine(makeDna(2));
    const bellcote = g.getObjectByName('elven-chapel-bellcote');
    expect(bellcote).toBeDefined();
    let bellCount = 0;
    bellcote!.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'CylinderGeometry' && o.name === 'elven-chapel-bell') bellCount++;
    });
    expect(bellCount).toBeGreaterThanOrEqual(1);
    expect(bellCount).toBeLessThanOrEqual(2);
  });

  it('the bellcote sits above the nave (y > naveHeight) and in front of the nave (z > 0, near the entrance)', () => {
    const g = buildElvenChapelShrine(makeDna(2));
    const bellcote = g.getObjectByName('elven-chapel-bellcote')!;
    const worldPos = new THREE.Vector3();
    bellcote.getWorldPosition(worldPos);
    expect(worldPos.y).toBeGreaterThan(4.48); // naveHeight for floors=1
    expect(worldPos.z).toBeGreaterThan(0);
  });

  it('has a relocated forecourt of standing stones outside the nave, in front of the entrance', () => {
    const g = buildElvenChapelShrine(makeDna(1));
    const forecourt = g.getObjectByName('elven-chapel-forecourt');
    expect(forecourt).toBeDefined();
    let stoneCount = 0;
    forecourt!.traverse((o) => { if (o instanceof THREE.Mesh) stoneCount++; });
    expect(stoneCount).toBeGreaterThanOrEqual(4);
    const worldPos = new THREE.Vector3();
    forecourt!.getWorldPosition(worldPos);
    expect(worldPos.z).toBeGreaterThan(4); // fully outside the nave's own halfD=4 front wall
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/buildings/ElvenChapelKit.test.ts`
Expected: the 3 new tests FAIL; the 11 pre-existing tests still PASS.

- [ ] **Step 3: Write the implementation**

In `src/world/buildings/ElvenChapelKit.ts`, add to the imports:

```ts
import { buildRecessedArchOpening, type RecessedArchOptions } from './StoneTowerOpenings';
```

Add these two private helpers after `_buildApse` (before
`buildElvenChapelShrine`):

```ts
/**
 * Builds the bellcote: a small pierced wall-slab centered above the
 * entrance gable, with 1-2 small recessed-arch bell openings (reusing
 * `buildRecessedArchOpening()`'s shared carved-cavity technique at a
 * small scale -- the SAME technique as every other opening in the kit,
 * not a new one), each containing a small bell (a simple truncated-cone
 * silhouette via CylinderGeometry with different top/bottom radii).
 * Favored over a second full tower-kit instance per the design doc's
 * real-world small-parish-church precedent (a bell-gable is cheaper and
 * more proportionate to a fixed small 4x8 footprint than a full second
 * tower).
 */
function _buildBellcote(dna: BuildingDNA, halfW: number, halfD: number, naveHeight: number, ridgeHeight: number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'elven-chapel-bellcote';
  const rand = mulberry32(dna.seed ^ 0x42454C4C); // 'BELL' in ASCII hex
  const bellCount: 1 | 2 = rand() < 0.5 ? 1 : 2;

  const slabW = halfW * (bellCount === 2 ? 1.1 : 0.7);
  const slabH = ridgeHeight * 0.7;
  const slabThickness = 0.15;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, slabH, slabThickness), palette.stone);
  slab.castShadow = slab.receiveShadow = true;
  g.add(slab);

  const openingOpts: RecessedArchOptions = {
    width: slabW * (bellCount === 2 ? 0.32 : 0.4),
    straightHeight: slabH * 0.4,
    pointHeight: slabH * 0.2,
    recessDepth: slabThickness * 0.6,
    frameWidth: slabW * 0.03,
    frameProud: slabThickness * 0.2,
  };
  const bellMat = mat('#8a8478', { roughness: 0.6, metalness: 0.3 });
  const bellXOffsets = bellCount === 2 ? [-slabW * 0.22, slabW * 0.22] : [0];
  for (const bx of bellXOffsets) {
    const opening = buildRecessedArchOpening(openingOpts, slabThickness / 2, mat('#1a1612'), palette.stone);
    opening.position.x = bx;
    g.add(opening);

    const bell = new THREE.Mesh(new THREE.CylinderGeometry(openingOpts.width * 0.14, openingOpts.width * 0.28, openingOpts.straightHeight * 0.5, 8), bellMat);
    bell.name = 'elven-chapel-bell';
    bell.position.set(bx, slabH * 0.15, slabThickness * 0.1);
    bell.castShadow = true;
    g.add(bell);
  }

  // Positioned above the nave, centered on the entrance gable, pulled
  // slightly back from the very front edge so it reads as structurally
  // attached to the gable wall rather than floating in front of it.
  g.position.set(0, naveHeight + ridgeHeight * 0.55, halfD * 0.85);
  return g;
}

/**
 * Builds the forecourt: the old `buildElvenChapel()`'s 6 standing
 * tree-stone monoliths, RELOCATED (not deleted) outdoors as a small
 * "sacred grove" approach avenue flanking the path to the entrance --
 * preserving the current shrine's identity as context around the new
 * real building, per the design doc's research (standing stones as an
 * outdoor/approach feature, not the building's own wall material).
 */
function _buildForecourt(dna: BuildingDNA, halfD: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'elven-chapel-forecourt';
  const rand = mulberry32(dna.seed ^ 0x464F5245); // 'FORE' in ASCII hex
  const stoneMat = mat('#7a8a70', { roughness: 0.95 });
  const stoneCount = 6;
  for (let i = 0; i < stoneCount; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const rowIndex = Math.floor(i / 2);
    const sh = 0.8 + rand() * 0.4;
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, sh, 6), stoneMat);
    stone.position.set(side * (0.9 + rand() * 0.3), sh / 2, halfD + 0.6 + rowIndex * 0.9);
    stone.rotation.y = rand() * Math.PI * 2;
    stone.castShadow = true;
    g.add(stone);
  }
  return g;
}
```

Update `buildElvenChapelShrine()`'s final composition:

```ts
  const g = new THREE.Group();
  g.add(_buildNave(dna, halfW, halfD, naveHeight, palette));

  const roof = buildGableRoofCap(halfW, halfD, ridgeHeight, palette.shingle);
  roof.position.y = naveHeight;
  g.add(roof);

  g.add(_buildApse(dna, halfD, palette));
  g.add(_buildBellcote(dna, halfW, halfD, naveHeight, ridgeHeight, palette));
  g.add(_buildForecourt(dna, halfD));

  return g;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/buildings/ElvenChapelKit.test.ts`
Expected: PASS (all 14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/ElvenChapelKit.ts tests/world/buildings/ElvenChapelKit.test.ts
git commit -m "feat: add bellcote + relocated forecourt, completing buildElvenChapelShrine's composition"
```

---

### Task 9: Wire into `FactionBuildingVariants.ts`, delete old code, sync docs

**Files:**
- Modify: `src/world/buildings/FactionBuildingVariants.ts`
- Modify: `tests/world/FactionBuildingVariants.test.ts`
- Modify: `docs/BUILDINGS.md`

**Interfaces:**
- Consumes: `buildElvenChapelShrine` (Task 8, now complete).
- Produces: `FACTION_BUILDING_VARIANTS.elven.chapel` now points to
  `buildElvenChapelShrine`.

- [ ] **Step 1: Write the failing test**

In `tests/world/FactionBuildingVariants.test.ts`, find the describe block
titled `'Elven — remaining BlockKit-adjacent bits (chapel unaffected by
the tower-kit rebuild; buildElvenTrunkGrid kept as a reusable
primitive)'` (around the section documented in this file's own history)
and replace its body. First, add the import at the top of the file
(alongside its existing imports):

```ts
import { buildElvenChapelShrine } from '@/world/buildings/ElvenChapelKit';
```

Replace the whole describe block with:

```ts
describe('Elven — chapel rebuilt on the tower-kit\'s real block-course technique (2026-09-04 rebuild)', () => {
  it('elven.chapel is wired to buildElvenChapelShrine, not the old standing-tree-stones builder', () => {
    expect(FACTION_BUILDING_VARIANTS.elven!.chapel).toBe(buildElvenChapelShrine);
  });

  it('produces only finite (non-NaN/non-infinite) vertices for chapel', () => {
    expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.elven!.chapel!(makeDna('chapel', 'elven', 21)));
  });

  it('builds real per-course block walls (BoxGeometry), not the old tree-stones\' CylinderGeometry monoliths', () => {
    const g = FACTION_BUILDING_VARIANTS.elven!.chapel!(makeDna('chapel', 'elven', 21));
    let boxCount = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry.type === 'BoxGeometry') boxCount++; });
    expect(boxCount).toBeGreaterThan(10);
  });

  it('carves a real arched doorway gap in the trunk grid at the front (a genuine hole, not just an applied surface) -- buildElvenTrunkGrid itself is no longer wired into any live elven builder (shop moved to buildElvenMarketStall, chapel moved to buildElvenChapelShrine) but remains a tested, reusable primitive for future kinds', () => {
    const grid = buildElvenTrunkGrid(5, 6, 5, 5, { facade: true });
    const bw = Math.round(6 / BLOCK_UNIT);
    const bd = Math.round(5 / BLOCK_UNIT);
    const cx = Math.round(bw / 2);
    expect(hasBlock(grid, cx, 0, bd - 1)).toBe(false);
  });
});
```

(Keep whatever `makeDna` helper this test file already defines — do not
redefine it. The `buildElvenTrunkGrid`/`hasBlock`/`BLOCK_UNIT` imports
this block already used stay unchanged, since that last test is
unmodified in substance, only its own doc comment updated to mention
chapel's own move.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/FactionBuildingVariants.test.ts`
Expected: FAIL — `FACTION_BUILDING_VARIANTS.elven!.chapel` is still
`buildElvenChapel` (the old function), not `buildElvenChapelShrine`.

- [ ] **Step 3: Write the implementation**

In `src/world/buildings/FactionBuildingVariants.ts`:

1. Add the import near the top of the file, alongside the other
   `Elven*Kit` imports (e.g. near
   `import { buildElvenMarketStall } from './ElvenMarketStallKit';`):

```ts
import { buildElvenChapelShrine } from './ElvenChapelKit';
```

2. Delete the entire `buildElvenChapel` function (lines 653-671, the
   "Ancient Shrine" ring-of-standing-stones + central octahedron
   function) — confirmed via grep to have no other callers anywhere in
   the repo besides its own definition and the one wiring line below.

3. Change the `elven.chapel` wiring line from:

```ts
    chapel:   buildElvenChapel,
```

to:

```ts
    // 2026-09-04 follow-up (docs/superpowers/specs/
    // 2026-09-04-elven-chapel-rebuild-design.md): chapel moved from
    // buildElvenChapel (a ring of standing tree-stone monoliths + a
    // central glowing crystal) to buildElvenChapelShrine (a real
    // rectangular nave + small octagonal apse + bellcote + relocated
    // forecourt, all on the same real block-course + carved-opening
    // construction technique as the rest of the elven lineage) -- the
    // LAST elven building kind not yet on this technique.
    chapel:   buildElvenChapelShrine,
```

4. Update the file's own "Elven — living-tree architecture" comment
   block (around line 640-651) to remove the now-stale claim that the
   "Ancient Shrine (church)" is "kept as-is from Phase 2b/2d" — replace
   that sentence with a note that chapel has now also moved to the
   tower-kit technique, matching villa/house/terraced/inn/blacksmith/shop.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/FactionBuildingVariants.test.ts`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Sync `docs/BUILDINGS.md`'s stale elven chapel entry**

In `docs/BUILDINGS.md`, find the row:

```
| `chapel` (woodland shrine) | `elven` | No walls — open pillared colonnade, living tree as central column | Sacred grove |
```

Replace it with:

```
| `chapel` (Gothic-elven shrine) | `elven` | Rectangular nave (real per-course block walls, lancet windows, gabled roof) + small octagonal apse (living-canopy roof, sacred crystal) + bellcote + standing-stone forecourt | See `docs/superpowers/specs/2026-09-04-elven-chapel-rebuild-design.md` |
```

(This single-row sync is the only doc change in scope this round — the
surrounding Category III elven rows, e.g. `watchtower`'s stale
"spiralling form" description, are pre-existing drift from before this
session's rebuild lineage and are explicitly out of scope, per the
design doc's own "Note" section.)

- [ ] **Step 6: Run the full regression check for this task**

Run: `npx vitest run tests/world/buildings/ tests/world/FactionBuildingVariants.test.ts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/world/buildings/FactionBuildingVariants.ts tests/world/FactionBuildingVariants.test.ts docs/BUILDINGS.md
git commit -m "feat: wire elven chapel to buildElvenChapelShrine, delete old standing-tree-stones builder"
```

---

### Task 10: Full regression, live Playwright verification, TODO docs, push

**Files:**
- Modify: `TODO/organic_world_tiles_todo.md` (Phase 6 section — new
  sub-entry, e.g. `6.6e`)
- Modify: `TODO/TODO_OVERVIEW.md` (G16 row)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: exactly the same failure count as Task 0's fresh baseline (13
failed / rest passed, 6 pre-existing failing files), plus this round's
new passing tests. No new failures.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: exactly the same count as Task 0's fresh baseline (144).

- [ ] **Step 3: Live Playwright verification**

Start a dev server on an unused port (check none of 5176-5178 are
already bound first: `lsof -i :5176-5178 -t`). Since `chapel` is
reachable via the `church` ward in normal settlement generation (unlike
watchtower), and the Settlement Lab's `POC_KIND_OVERRIDE_BY_FACTION.elven`
is currently `'house'`, either (a) temporarily edit that override to
`'chapel'` for isolated close-up screenshots, reverting the edit
afterward, or (b) regenerate several `village`/`town` seeds with the
override left at its current default and look for the chapel among the
mix of building kinds (a `church` ward isn't guaranteed on every seed,
so option (a) is more reliable for a focused verification pass — prefer
it).

Take screenshots confirming: (1) the nave's real per-course block walls
with visible mortar-gap texture, matching the tower/treehouse/stall's
own established look; (2) 4 lancet windows, 2 per long side wall,
evenly spaced (not clustered or overlapping the corners/quoins); (3) a
carved entrance on the front gable; (4) the gabled roof (two raked
planes meeting at a ridge, NOT a cone) with no seethrough gap at the
wall/roof seam; (5) the small octagonal apse docked behind the nave,
visibly showing its living-canopy roof and the glowing sacred crystal
through its open (nave-facing) side; (6) the bellcote above the
entrance gable; (7) the relocated standing-stone forecourt outside the
entrance. Fix any real placement/visibility bugs found (matching this
session's established practice — e.g. the market stall round's
placement-direction bug was only caught this way), with a fresh
regression run after any fix.

Revert the temporary `POC_KIND_OVERRIDE_BY_FACTION` edit (if made) once
verification is complete — this override should end this round exactly
as it started (`'house'`), unless a real reason to change it permanently
emerges during verification (unlikely; note it explicitly either way).

Delete the dev server, any throwaway `verify_*.cjs` scripts, and
`/tmp/*.png` screenshots afterward, per this project's established
convention.

- [ ] **Step 4: Update TODO docs**

Add a new sub-entry to `TODO/organic_world_tiles_todo.md`'s Phase 6
section (following the exact format of the existing `6.6`/`6.6b`/`6.6c`/
`6.6d` entries) describing: the chapel rebuild (rectangular nave +
octagonal apse + bellcote + forecourt), the research summary, the
`rectanglePoints`/`rectangleFaces`/`facePointAt`/`buildGableRoofCap` new
primitives, the `buildFloorCap`/`buildQuoins` `pointsOverride`
generalization, the `docs/BUILDINGS.md` sync, verification results
(including any live-verification bug fixes found), and update the Phase
6 header line to "4 of ~9 elven building types shipped" (from "3 of
~9") with today's date. Mirror the status in `TODO/TODO_OVERVIEW.md`'s
G16 row.

- [ ] **Step 5: Commit and push**

```bash
git add TODO/organic_world_tiles_todo.md TODO/TODO_OVERVIEW.md
git commit -m "docs: record elven chapel rebuild round in the organic-world-tiles roadmap"
git push
```

- [ ] **Step 6: Update PR #46**

Add a new "Round 10" section to PR #46's body (via the `update_pull_request`
tool) summarizing this round, matching the format of the existing Round
1-9 sections. Do NOT merge the PR.
