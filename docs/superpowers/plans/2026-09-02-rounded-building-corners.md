# Rounded Building Corners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make building corners genuinely rounded (not just flat-chamfered or sharp) across BlockKit-driven faction buildings and the human/generic default house builder, so the "organic/Townscaper" treatment the user asked for is visible on buildings, not just water.

**Architecture:** (A1) Generalize `BlockKit.ts`'s existing flat 2-point diagonal chamfer into an N-segment quarter-circle arc — a pure math change to the corner-point generator; the downstream mesh-building code already iterates over an arbitrary-length outline, so it needs zero changes. (A2) Add a new small, reusable `addRoundedCornerPosts()` helper using `THREE.CylinderGeometry`'s built-in partial-arc support, wired only into `buildHouseOrShop()` (the generic/human default builder, currently 100% sharp boxes).

**Tech Stack:** TypeScript, Three.js (`THREE.BufferGeometry`, `THREE.CylinderGeometry`), Vitest.

## Global Constraints

- `segments = 1` (the default for `buildBlockOutline`/`cornerPoints` direct calls) must reproduce today's existing flat-chamfer output within floating-point tolerance — this is a backward-compatible generalization, not a behavior change, for any caller that doesn't opt in to a higher segment count.
- `blockGeometry()`/`meshBlockGrid()` (the layer that actually backs live rendering) default `chamferSegments` to **3** — no other call site (`FactionBlockProfiles.ts`, `FactionBuildingVariants.ts`) needs to change to pick up rounder corners.
- Do not touch `buildVilla()` (intentional Georgian quoins), `buildTerraced()`/`buildCottage()`, or any of the other specialty builders — out of scope per the design spec.
- New rounded corner post radius is fixed at `0.14` world units in `buildHouseOrShop`, matching its existing wall-panel half-thickness exactly (tangent, no gap/overlap).
- Follow TDD: write the failing test, confirm it fails, implement, confirm it passes, commit.
- Commit messages: write to a temp file and use `git commit -F <tempfile>` (avoids double-quote mis-parsing), ending with `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`.

---

### Task 1: Generalize BlockKit's corner chamfer into an N-segment arc

**Files:**
- Modify: `src/world/buildings/BlockKit.ts:143-176` (`cornerPoints`, `buildOutlinePoints`, `buildBlockOutline`)
- Test: `tests/world/BlockKit.test.ts`

**Interfaces:**
- Consumes: nothing new (pure refactor of existing private/exported functions in the same file).
- Produces: `cornerPoints(corner: CornerId, s: number, r: number, chamfered: boolean, segments: number): [number, number][]`, `buildOutlinePoints(flags: ChamferFlags, s: number, r: number, segments?: number): OutlinePoint[]` (now takes an optional 4th param, default `1`), `buildBlockOutline(flags: ChamferFlags, s: number, r: number, segments?: number): [number, number][]` (same). Task 2 will call `buildOutlinePoints` with an explicit segment count from `BlockGeometryOptions`.

The current code (for reference, exact lines to replace):

```ts
function cornerPoints(corner: CornerId, s: number, r: number, chamfered: boolean): [number, number][] {
  switch (corner) {
    case 'NW': return chamfered ? [[-s, -s + r], [-s + r, -s]] : [[-s, -s]];
    case 'NE': return chamfered ? [[s - r, -s], [s, -s + r]] : [[s, -s]];
    case 'SE': return chamfered ? [[s, s - r], [s - r, s]] : [[s, s]];
    case 'SW': return chamfered ? [[-s + r, s], [-s, s - r]] : [[-s, s]];
  }
}

/** One outline point per element; `edgeTag[i]` names the segment from `points[i]` to `points[(i+1)%n]`. */
export interface BlockOutline extends Array<[number, number]> {}

interface OutlinePoint { p: [number, number]; tagToNext: string }

function buildOutlinePoints(flags: ChamferFlags, s: number, r: number): OutlinePoint[] {
  const CORNERS: CornerId[] = ['NW', 'NE', 'SE', 'SW'];
  const out: OutlinePoint[] = [];
  for (const corner of CORNERS) {
    const chamfered = flags[corner];
    const pts = cornerPoints(corner, s, Math.min(r, s * 0.98), chamfered);
    if (pts.length === 2) {
      out.push({ p: pts[0]!, tagToNext: `${corner}_diag` });
      out.push({ p: pts[1]!, tagToNext: OUTGOING_EDGE[corner] });
    } else {
      out.push({ p: pts[0]!, tagToNext: OUTGOING_EDGE[corner] });
    }
  }
  return out;
}

/** Public: just the ordered `[x,z]` outline points (for direct unit testing of the corner algorithm). */
export function buildBlockOutline(flags: ChamferFlags, s: number, r: number): [number, number][] {
  return buildOutlinePoints(flags, s, r).map(pt => pt.p);
}
```

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/BlockKit.test.ts`, inside the existing `describe('BlockKit — outline polygon (2D cross-section)', ...)` block (after the last existing `it(...)` in that block, before its closing `});`):

```ts
  it('segments=1 (default) reproduces the exact existing 2-point flat-chamfer output', () => {
    const withDefault = buildBlockOutline({ NW: true, NE: true, SE: true, SW: true }, s, r);
    const withExplicit1 = buildBlockOutline({ NW: true, NE: true, SE: true, SW: true }, s, r, 1);
    expect(withDefault.length).toBe(8);
    for (let i = 0; i < withDefault.length; i++) {
      expect(withDefault[i]![0]).toBeCloseTo(withExplicit1[i]![0]!, 9);
      expect(withDefault[i]![1]).toBeCloseTo(withExplicit1[i]![1]!, 9);
    }
  });

  it('segments=3 produces a 4-point arc per chamfered corner (16 points for all 4 corners)', () => {
    const outline = buildBlockOutline({ NW: true, NE: true, SE: true, SW: true }, s, r, 3);
    expect(outline.length).toBe(16); // 4 corners * (segments + 1) points each
  });

  it('segments=3 arc endpoints match the segments=1 flat-chamfer tangent points exactly', () => {
    const flat = buildBlockOutline({ NW: true, NE: false, SE: false, SW: false }, s, r, 1);
    const arc = buildBlockOutline({ NW: true, NE: false, SE: false, SW: false }, s, r, 3);
    // flat = [NW_p0, NW_p1, NE, SE, SW] (5 points); arc = [NW_p0..NW_p3, NE, SE, SW] (7 points).
    expect(arc[0]![0]).toBeCloseTo(flat[0]![0]!, 9);
    expect(arc[0]![1]).toBeCloseTo(flat[0]![1]!, 9);
    expect(arc[3]![0]).toBeCloseTo(flat[1]![0]!, 9);
    expect(arc[3]![1]).toBeCloseTo(flat[1]![1]!, 9);
  });

  it('every segments=3 arc point stays within the block half-size bounds and outside the flat-chamfer line (bulges outward)', () => {
    const outline = buildBlockOutline({ NW: true, NE: false, SE: false, SW: false }, s, r, 3);
    for (const [x, z] of outline) {
      expect(Math.abs(x)).toBeLessThanOrEqual(s + 1e-9);
      expect(Math.abs(z)).toBeLessThanOrEqual(s + 1e-9);
    }
    // The arc's midpoint (3rd of 4 points, index 1 or 2) must lie strictly
    // closer to the true sharp corner (-s,-s) than the flat chamfer's
    // midpoint would (proving it bulges outward, i.e. is convex/rounded
    // rather than a straight cut).
    const midArc = outline[1]!; // second of the 4 NW arc points
    const flatMid: [number, number] = [(-s + (-s + r)) / 2, (-s + r + -s) / 2];
    const distToCorner = (p: [number, number]) => Math.hypot(p[0] - (-s), p[1] - (-s));
    expect(distToCorner(midArc)).toBeLessThan(distToCorner(flatMid));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/BlockKit.test.ts -t "segments"`
Expected: FAIL — `buildBlockOutline` doesn't accept a 4th argument yet (TypeScript will also fail to compile until Step 3, since the test calls `buildBlockOutline(flags, s, r, 3)` with 4 args against the current 3-arg signature).

- [ ] **Step 3: Implement the arc generalization**

Replace the code block shown above in `src/world/buildings/BlockKit.ts` with:

```ts
/** Per-corner arc center (inset by `r` from the true corner along both axes,
 * matching the existing chamfer's inset convention) and the 90° sweep
 * (in standard math radians, x = cx + r*cos(angle), z = cz + r*sin(angle))
 * between the corner's two existing flat-chamfer tangent points. */
const CORNER_ARC: Record<CornerId, (s: number, r: number) => { cx: number; cz: number; startAngle: number; endAngle: number }> = {
  NW: (s, r) => ({ cx: -s + r, cz: -s + r, startAngle: Math.PI,       endAngle: Math.PI * 1.5 }),
  NE: (s, r) => ({ cx:  s - r, cz: -s + r, startAngle: Math.PI * 1.5, endAngle: Math.PI * 2   }),
  SE: (s, r) => ({ cx:  s - r, cz:  s - r, startAngle: 0,             endAngle: Math.PI * 0.5 }),
  SW: (s, r) => ({ cx: -s + r, cz:  s - r, startAngle: Math.PI * 0.5, endAngle: Math.PI       }),
};

/**
 * A sharp corner contributes 1 point. A chamfered corner contributes
 * `segments + 1` points sampled along the 90° arc between the two tangent
 * points a flat chamfer would use (see `CORNER_ARC`) — `segments = 1`
 * samples just the two endpoints, exactly reproducing the original flat
 * 2-point diagonal cut; `segments > 1` adds intermediate points along the
 * arc, producing a genuinely rounded (not just beveled) corner.
 */
function cornerPoints(corner: CornerId, s: number, r: number, chamfered: boolean, segments: number): [number, number][] {
  if (!chamfered) {
    switch (corner) {
      case 'NW': return [[-s, -s]];
      case 'NE': return [[s, -s]];
      case 'SE': return [[s, s]];
      case 'SW': return [[-s, s]];
    }
  }
  const { cx, cz, startAngle, endAngle } = CORNER_ARC[corner](s, r);
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = startAngle + (endAngle - startAngle) * t;
    pts.push([cx + r * Math.cos(angle), cz + r * Math.sin(angle)]);
  }
  return pts;
}

/** One outline point per element; `edgeTag[i]` names the segment from `points[i]` to `points[(i+1)%n]`. */
export interface BlockOutline extends Array<[number, number]> {}

interface OutlinePoint { p: [number, number]; tagToNext: string }

function buildOutlinePoints(flags: ChamferFlags, s: number, r: number, segments: number = 1): OutlinePoint[] {
  const CORNERS: CornerId[] = ['NW', 'NE', 'SE', 'SW'];
  const out: OutlinePoint[] = [];
  for (const corner of CORNERS) {
    const chamfered = flags[corner];
    const pts = cornerPoints(corner, s, Math.min(r, s * 0.98), chamfered, segments);
    for (let i = 0; i < pts.length; i++) {
      const isLast = i === pts.length - 1;
      // Every internal arc-to-arc segment (not the corner's final edge to
      // the next corner) is always visible regardless of face culling —
      // same as the original 2-point diagonal's `_diag` tag — so
      // blockGeometry()'s `tag.endsWith('_diag')` check needs no changes.
      out.push({ p: pts[i]!, tagToNext: isLast ? OUTGOING_EDGE[corner] : `${corner}_diag` });
    }
  }
  return out;
}

/** Public: just the ordered `[x,z]` outline points (for direct unit testing of the corner algorithm). */
export function buildBlockOutline(flags: ChamferFlags, s: number, r: number, segments: number = 1): [number, number][] {
  return buildOutlinePoints(flags, s, r, segments).map(pt => pt.p);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/BlockKit.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones — `segments` defaults to `1` everywhere it isn't explicitly passed, so every pre-existing call/assertion is unaffected).

- [ ] **Step 5: Commit**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
feat: generalize BlockKit chamfer into an N-segment rounded arc

cornerPoints()/buildOutlinePoints()/buildBlockOutline() now accept an
optional segments parameter. segments=1 (the default) reproduces the
existing flat 2-point diagonal chamfer exactly; segments>1 samples
additional points along the same 90-degree arc, producing a genuinely
rounded corner instead of a flat bevel. No change to blockGeometry()'s
meshing code, which already iterates over an arbitrary-length outline.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add src/world/buildings/BlockKit.ts tests/world/BlockKit.test.ts
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 2: Thread `chamferSegments` through `blockGeometry`/`meshBlockGrid`, defaulting to 3

**Files:**
- Modify: `src/world/buildings/BlockKit.ts` (`BlockGeometryOptions` interface, `blockGeometry()`, `MeshBlockGridOptions` interface, `meshBlockGrid()`)
- Test: `tests/world/BlockKit.test.ts`

**Interfaces:**
- Consumes: `buildOutlinePoints(flags, s, r, segments)` from Task 1.
- Produces: `BlockGeometryOptions.chamferSegments?: number`, `MeshBlockGridOptions.chamferSegments?: number` — both optional, default `3` at the `blockGeometry()` layer. No existing caller (`FactionBlockProfiles.ts`, `FactionBuildingVariants.ts`) needs to change.

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/BlockKit.test.ts`, inside `describe('BlockKit — single-block geometry sanity', ...)` (after the existing `it('is deterministic...')`, before the closing `});`):

```ts
  it('defaults to rounded (chamferSegments=3) corners, producing more vertices than a flat chamfer (segments=1)', () => {
    const flags = { NW: true, NE: true, SE: true, SW: true };
    const faces = { N: true, S: true, E: true, W: true, U: true, D: true };
    const rounded = blockGeometry(flags, faces, {});
    const flat = blockGeometry(flags, faces, { chamferSegments: 1 });
    expect(hasNaN(rounded)).toBe(false);
    expect(countVerts(rounded)).toBeGreaterThan(countVerts(flat));
  });

  it('a sharp (unchamfered) block is unaffected by chamferSegments', () => {
    const flags = { NW: false, NE: false, SE: false, SW: false };
    const faces = { N: true, S: true, E: true, W: true, U: true, D: true };
    const g3 = blockGeometry(flags, faces, { chamferSegments: 3 });
    const g1 = blockGeometry(flags, faces, { chamferSegments: 1 });
    expect(countVerts(g3)).toBe(countVerts(g1));
  });
```

Add to `describe('BlockKit — meshBlockGrid (full grid -> THREE.Group)', ...)` (after the existing `it('a suppressChamfer override...')` test, before the closing `});`):

```ts
  it('meshBlockGrid defaults to rounded corners (more vertices than an explicit flat chamferSegments=1)', () => {
    const grid = createBlockGrid();
    setBlock(grid, 0, 0, 0, 'earth');
    const rounded = meshBlockGrid(grid, samplePalette());
    const flat = meshBlockGrid(grid, samplePalette(), { chamferSegments: 1 });
    let roundedVerts = 0, flatVerts = 0;
    rounded.traverse((o) => { if (o instanceof THREE.Mesh) roundedVerts += countVerts(o.geometry); });
    flat.traverse((o) => { if (o instanceof THREE.Mesh) flatVerts += countVerts(o.geometry); });
    expect(roundedVerts).toBeGreaterThan(flatVerts);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/BlockKit.test.ts -t "chamferSegments"`
Expected: FAIL — `BlockGeometryOptions`/`MeshBlockGridOptions` don't have a `chamferSegments` field yet, so `blockGeometry`/`meshBlockGrid` ignore it and both calls in each test produce identical (segments=1, today's default) output, failing the `toBeGreaterThan` assertions.

- [ ] **Step 3: Implement**

In `src/world/buildings/BlockKit.ts`, find the `BlockGeometryOptions` interface:

```ts
export interface BlockGeometryOptions {
  chamferRadius?: number;   // world units, default 0.16 * BLOCK_UNIT
  topBevel?: boolean;       // roofline-cell bevel (frustum-shaped cap)
  topBevelInset?: number;   // world units, default 0.12 * BLOCK_UNIT
  topBevelDrop?: number;    // world units, default 0.12 * BLOCK_UNIT
```

Add a new field right after `chamferRadius`:

```ts
export interface BlockGeometryOptions {
  chamferRadius?: number;   // world units, default 0.16 * BLOCK_UNIT
  /** Points sampled along each chamfered corner's 90-degree arc (see
   * buildOutlinePoints()). 1 = flat diagonal cut (legacy look); default 3
   * = a genuinely rounded corner. */
  chamferSegments?: number;
  topBevel?: boolean;       // roofline-cell bevel (frustum-shaped cap)
  topBevelInset?: number;   // world units, default 0.12 * BLOCK_UNIT
  topBevelDrop?: number;    // world units, default 0.12 * BLOCK_UNIT
```

Find in `blockGeometry()`:

```ts
  const s = BLOCK_UNIT / 2;
  const r = opts.chamferRadius ?? 0.16 * BLOCK_UNIT;
  const inset = opts.topBevelInset ?? 0.12 * BLOCK_UNIT;
  const drop = opts.topBevelDrop ?? 0.12 * BLOCK_UNIT;
  const [bx, by, bz] = opts.blockCoord ?? [0, 0, 0];
  const worldOx = bx * BLOCK_UNIT, worldOy = by * BLOCK_UNIT, worldOz = bz * BLOCK_UNIT;

  const outline = buildOutlinePoints(flags, s, r);
```

Replace with:

```ts
  const s = BLOCK_UNIT / 2;
  const r = opts.chamferRadius ?? 0.16 * BLOCK_UNIT;
  const chamferSegments = opts.chamferSegments ?? 3;
  const inset = opts.topBevelInset ?? 0.12 * BLOCK_UNIT;
  const drop = opts.topBevelDrop ?? 0.12 * BLOCK_UNIT;
  const [bx, by, bz] = opts.blockCoord ?? [0, 0, 0];
  const worldOx = bx * BLOCK_UNIT, worldOy = by * BLOCK_UNIT, worldOz = bz * BLOCK_UNIT;

  const outline = buildOutlinePoints(flags, s, r, chamferSegments);
```

Find the `MeshBlockGridOptions` interface:

```ts
export interface MeshBlockGridOptions {
  chamferRadius?: number;
  topBevel?: boolean;
  topBevelInset?: number;
  topBevelDrop?: number;
  suppressChamfer?: (bx: number, by: number, bz: number) => boolean;
  suppressTopBevel?: (bx: number, by: number, bz: number) => boolean;
}
```

Add `chamferSegments` there too:

```ts
export interface MeshBlockGridOptions {
  chamferRadius?: number;
  chamferSegments?: number;
  topBevel?: boolean;
  topBevelInset?: number;
  topBevelDrop?: number;
  suppressChamfer?: (bx: number, by: number, bz: number) => boolean;
  suppressTopBevel?: (bx: number, by: number, bz: number) => boolean;
}
```

Find in `meshBlockGrid()` where it calls `blockGeometry`:

```ts
    const geo = blockGeometry(flags, faces, {
      chamferRadius: opts.chamferRadius,
      topBevel: useTopBevel,
      topBevelInset: opts.topBevelInset,
      topBevelDrop: opts.topBevelDrop,
      blockCoord: [bx, by, bz],
    });
```

Replace with:

```ts
    const geo = blockGeometry(flags, faces, {
      chamferRadius: opts.chamferRadius,
      chamferSegments: opts.chamferSegments,
      topBevel: useTopBevel,
      topBevelInset: opts.topBevelInset,
      topBevelDrop: opts.topBevelDrop,
      blockCoord: [bx, by, bz],
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/BlockKit.test.ts`
Expected: PASS (full file).

- [ ] **Step 5: Commit**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
feat: default BlockKit-driven buildings to rounded (3-segment) corners

Threads a new chamferSegments option through BlockGeometryOptions and
MeshBlockGridOptions, defaulting to 3 at the blockGeometry()/
meshBlockGrid() layer that backs live rendering. No caller in
FactionBlockProfiles.ts/FactionBuildingVariants.ts needs to change to
pick up the rounder default; segments=1 is still available for callers
that want the legacy flat-chamfer look.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add src/world/buildings/BlockKit.ts tests/world/BlockKit.test.ts
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 3: New `RoundedCornerPosts.ts` helper module

**Files:**
- Create: `src/world/buildings/RoundedCornerPosts.ts`
- Test: `tests/world/buildings/RoundedCornerPosts.test.ts`

**Interfaces:**
- Consumes: `THREE.CylinderGeometry`'s built-in `thetaStart`/`thetaLength` partial-arc support (no BlockKit dependency).
- Produces: `addRoundedCornerPosts(group: THREE.Group, w: number, d: number, yBase: number, height: number, radius: number, material: THREE.Material): void` — used by Task 4.

**Background for the implementer:** three.js's `CylinderGeometry` builds its radial rim using `x = radius * Math.sin(theta)`, `z = radius * Math.cos(theta)`, where `theta` sweeps from `thetaStart` to `thetaStart + thetaLength`. That means `theta = 0` is the point `(0, radius)` (i.e. along local `+z`) and `theta = Math.PI/2` is `(radius, 0)` (along local `+x`) — **not** the standard math convention used in Task 1's `CORNER_ARC` table. The 4 corner posts below use `thetaStart` values chosen specifically for this three.js convention (verified by hand: e.g. for the `+x,+z` corner, sweeping `thetaStart=0` to `thetaStart+Math.PI/2` traces from the tangent point on the `+z` wall face to the tangent point on the `+x` wall face, bulging outward through the true corner direction in between).

- [ ] **Step 1: Write the failing test**

Create `tests/world/buildings/RoundedCornerPosts.test.ts`:

```ts
/**
 * RoundedCornerPosts.test.ts — rounded-corner-post helper used by
 * buildHouseOrShop() (BuildingBuilder.ts) to round the sharp seam between
 * two perpendicular box wall panels without touching the panels
 * themselves. See docs/superpowers/specs/
 * 2026-09-02-rounded-building-corners-design.md (§A2).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { addRoundedCornerPosts } from '@/world/buildings/RoundedCornerPosts';

function countVerts(geo: THREE.BufferGeometry): number {
  return geo.attributes.position.count;
}

function hasNaN(geo: THREE.BufferGeometry): boolean {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count * 3; i++) {
    if (!Number.isFinite(pos.array[i])) return true;
  }
  return false;
}

describe('addRoundedCornerPosts', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#a08060' });

  it('adds exactly 4 mesh posts to the group', () => {
    const g = new THREE.Group();
    addRoundedCornerPosts(g, 6, 4, 0.35, 3.0, 0.14, mat);
    const meshes = g.children.filter((c) => c instanceof THREE.Mesh);
    expect(meshes.length).toBe(4);
  });

  it('produces finite, non-NaN geometry for every post', () => {
    const g = new THREE.Group();
    addRoundedCornerPosts(g, 6, 4, 0.35, 3.0, 0.14, mat);
    for (const child of g.children) {
      if (child instanceof THREE.Mesh) {
        expect(hasNaN(child.geometry)).toBe(false);
        expect(countVerts(child.geometry)).toBeGreaterThan(0);
      }
    }
  });

  it('each post is tangent to the building footprint edges (max |x| reaches w/2, max |z| reaches d/2)', () => {
    const w = 6, d = 4, radius = 0.14;
    const g = new THREE.Group();
    addRoundedCornerPosts(g, w, d, 0.35, 3.0, radius, mat);
    let maxAbsX = 0, maxAbsZ = 0;
    for (const child of g.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const pos = child.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const worldX = pos.getX(i) + child.position.x;
        const worldZ = pos.getZ(i) + child.position.z;
        maxAbsX = Math.max(maxAbsX, Math.abs(worldX));
        maxAbsZ = Math.max(maxAbsZ, Math.abs(worldZ));
      }
    }
    expect(maxAbsX).toBeCloseTo(w / 2, 5);
    expect(maxAbsZ).toBeCloseTo(d / 2, 5);
  });

  it('no post point exceeds the building footprint (stays within w/2, d/2 bounds)', () => {
    const w = 6, d = 4, radius = 0.14;
    const g = new THREE.Group();
    addRoundedCornerPosts(g, w, d, 0.35, 3.0, radius, mat);
    for (const child of g.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const pos = child.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const worldX = pos.getX(i) + child.position.x;
        const worldZ = pos.getZ(i) + child.position.z;
        expect(Math.abs(worldX)).toBeLessThanOrEqual(w / 2 + 1e-6);
        expect(Math.abs(worldZ)).toBeLessThanOrEqual(d / 2 + 1e-6);
      }
    }
  });

  it('is deterministic: identical inputs produce identical vertex data', () => {
    const g1 = new THREE.Group();
    const g2 = new THREE.Group();
    addRoundedCornerPosts(g1, 6, 4, 0.35, 3.0, 0.14, mat);
    addRoundedCornerPosts(g2, 6, 4, 0.35, 3.0, 0.14, mat);
    const verts1 = (g1.children[0] as THREE.Mesh).geometry.attributes.position.array;
    const verts2 = (g2.children[0] as THREE.Mesh).geometry.attributes.position.array;
    expect(Array.from(verts1)).toEqual(Array.from(verts2));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/buildings/RoundedCornerPosts.test.ts`
Expected: FAIL with a module-not-found error for `@/world/buildings/RoundedCornerPosts`.

- [ ] **Step 3: Implement**

Create `src/world/buildings/RoundedCornerPosts.ts`:

```ts
/**
 * RoundedCornerPosts.ts — small, additive helper that rounds the sharp
 * vertical seam between two perpendicular box wall panels (as used by
 * BuildingBuilder.ts's plain-box builders, e.g. buildHouseOrShop()),
 * without touching the existing wall panel meshes at all. See
 * docs/superpowers/specs/2026-09-02-rounded-building-corners-design.md
 * (§A2) for the full design rationale — this is the box-panel-building
 * counterpart to BlockKit.ts's rounded chamfer arc (§A1), giving both
 * building-construction families in this codebase the same rounded-corner
 * visual language.
 */

import * as THREE from 'three';

/**
 * IMPORTANT (verified against three.js's CylinderGeometry source,
 * node_modules/three/src/geometries/CylinderGeometry.js's
 * generateTorso()): the `radialSegments` constructor argument is the
 * number of straight segments drawn across whatever `thetaLength` you
 * pass in — theta is computed as `u * thetaLength + thetaStart` where
 * `u = x / radialSegments` for `x` from `0` to `radialSegments`. It does
 * NOT scale down proportionally for a partial arc, so passing a
 * "full-circle" segment count together with a quarter-circle
 * `thetaLength` (as an earlier draft of this file mistakenly assumed)
 * would render the FULL segment count packed into just the quarter —
 * far denser than intended. `RADIAL_SEGMENTS` below is therefore the
 * actual number of straight segments each quarter-circle post renders
 * with, directly. */
const RADIAL_SEGMENTS = 8;

/** [signX, signZ, thetaStart] for each of a building's 4 corners, in
 * three.js's CylinderGeometry angle convention (theta=0 is local +z,
 * theta=PI/2 is local +x — see the module comment in
 * RoundedCornerPosts.test.ts for the derivation). Each entry's thetaStart
 * is chosen so the quarter-circle sweep (thetaLength = PI/2) traces from
 * the tangent point on one wall face to the tangent point on the other,
 * bulging outward through the true (sharp) corner direction in between. */
const CORNERS: Array<[number, number, number]> = [
  [ 1,  1, 0],
  [ 1, -1, Math.PI / 2],
  [-1, -1, Math.PI],
  [-1,  1, Math.PI * 1.5],
];

/**
 * Adds 4 quarter-cylinder corner posts to `group`, one at each corner of a
 * `w` x `d` rectangular footprint, each centered `radius` back from the
 * true corner along both axes so its curved outer surface is exactly
 * tangent to both adjacent wall faces (no gap or overlap when `radius`
 * matches the wall panels' own half-thickness). Spans from `yBase` to
 * `yBase + height`, matching the wall panels' own vertical span.
 */
export function addRoundedCornerPosts(
  group: THREE.Group,
  w: number, d: number,
  yBase: number, height: number,
  radius: number,
  material: THREE.Material,
): void {
  const halfW = w / 2, halfD = d / 2;
  for (const [signX, signZ, thetaStart] of CORNERS) {
    const cx = signX * (halfW - radius);
    const cz = signZ * (halfD - radius);
    const geo = new THREE.CylinderGeometry(radius, radius, height, RADIAL_SEGMENTS, 1, false, thetaStart, Math.PI / 2);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(cx, yBase + height / 2, cz);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/buildings/RoundedCornerPosts.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
feat: add addRoundedCornerPosts helper for box-panel buildings

New small module providing 4 quarter-cylinder corner posts (using
THREE.CylinderGeometry's built-in partial-arc support) that round the
sharp seam between two perpendicular box wall panels, without touching
the panels themselves. Counterpart to BlockKit.ts's rounded chamfer arc
for the plain-box building family (buildHouseOrShop() and friends).

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add src/world/buildings/RoundedCornerPosts.ts tests/world/buildings/RoundedCornerPosts.test.ts
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 4: Wire rounded corner posts into `buildHouseOrShop()`

**Files:**
- Modify: `src/world/buildings/BuildingBuilder.ts:199-234`
- Test: `tests/world/BuildingBuilder.test.ts` (already exists — has a `makeDna(kind, overrides)` helper covering all `BuildingKind`s including `house`; reuse it, do not create a new file).

**Interfaces:**
- Consumes: `addRoundedCornerPosts(group, w, d, yBase, height, radius, material)` from Task 3. `makeDna(kind: BuildingKind, overrides?: Partial<BuildingDNA>): BuildingDNA` (already defined at the top of `tests/world/BuildingBuilder.test.ts`).
- Produces: `buildHouseOrShop()`'s output group now includes 4 additional corner-post meshes; `buildBuilding()`'s public contract is unchanged.

- [ ] **Step 1: Write the failing test**

Add to the existing `tests/world/BuildingBuilder.test.ts` (its imports already include `buildBuilding`, `THREE`, and the `makeDna` helper shown below for reference — do not redefine them, just add a new `describe` block after the existing ones, using the file's existing `makeDna` helper):

```ts
describe('buildHouseOrShop — rounded corner posts', () => {
  it('the generic house builder (no faction override) includes 4 rounded corner post meshes', () => {
    const inst = buildBuilding(makeDna('house'));
    let cylinderCount = 0;
    inst.exteriorGroup.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry instanceof THREE.CylinderGeometry) {
        cylinderCount++;
      }
    });
    expect(cylinderCount).toBe(4);
  });

  it('shop/inn/guild (also routed through buildHouseOrShop) each include 4 rounded corner post meshes', () => {
    for (const kind of ['shop', 'inn', 'guild'] as const) {
      const inst = buildBuilding(makeDna(kind));
      let cylinderCount = 0;
      inst.exteriorGroup.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry instanceof THREE.CylinderGeometry) {
          cylinderCount++;
        }
      });
      expect(cylinderCount).toBe(4);
    }
  });

  it('produces finite, non-NaN geometry across the whole building (including the new corner posts)', () => {
    const inst = buildBuilding(makeDna('house'));
    let hasNaN = false;
    inst.exteriorGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count * 3; i++) {
          if (!Number.isFinite(pos.array[i])) hasNaN = true;
        }
      }
    });
    expect(hasNaN).toBe(false);
  });
});
```

The file's existing `makeDna` helper (for reference, already present at the top of the file — do not re-add it):

```ts
function makeDna(kind: BuildingKind, overrides: Partial<BuildingDNA> = {}): BuildingDNA {
  return {
    v: 1, kind: 'building', name: `test ${kind}`, seed: 99,
    buildingKind: kind, size: 'small', floors: 1,
    style: 'thatched', condition: 'weathered',
    hasInterior: true, interiorLayout: 'single_room',
    colors: STYLE_COLORS['thatched'], rotation: 0,
    terrace: 'none', features: [],
    ...overrides,
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/BuildingBuilder.test.ts -t "rounded corner posts"`
Expected: FAIL — `cylinderCount` is `0` (no corner posts wired in yet).

- [ ] **Step 3: Implement**

In `src/world/buildings/BuildingBuilder.ts`, add the import near the top (alongside the existing `FactionBuildingVariants` import):

```ts
import { getFactionBuildingVariant } from './FactionBuildingVariants';
```

becomes:

```ts
import { getFactionBuildingVariant } from './FactionBuildingVariants';
import { addRoundedCornerPosts } from './RoundedCornerPosts';
```

Find this exact block inside `buildHouseOrShop()`:

```ts
  for (const [px, pz, ry, pw, pd] of [
    [0,      d / 2 - 0.14,  0,           w,    0.28],
    [0,     -d / 2 + 0.14,  0,           w,    0.28],
    [-w/2+0.14,  0,  Math.PI / 2,        0.28,  d - 0.28],
    [ w/2-0.14,  0,  Math.PI / 2,        0.28,  d - 0.28],
  ] as [number, number, number, number, number][]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(pw > 0.3 ? pw : pd, wallH, pw > 0.3 ? 0.28 : pw), wMat.clone());
    panel.rotation.y = ry;
    panel.position.set(px, yMid, pz);
    panel.castShadow = panel.receiveShadow = true;
    g.add(panel);
  }

  // Core shadow volume
```

Replace with:

```ts
  for (const [px, pz, ry, pw, pd] of [
    [0,      d / 2 - 0.14,  0,           w,    0.28],
    [0,     -d / 2 + 0.14,  0,           w,    0.28],
    [-w/2+0.14,  0,  Math.PI / 2,        0.28,  d - 0.28],
    [ w/2-0.14,  0,  Math.PI / 2,        0.28,  d - 0.28],
  ] as [number, number, number, number, number][]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(pw > 0.3 ? pw : pd, wallH, pw > 0.3 ? 0.28 : pw), wMat.clone());
    panel.rotation.y = ry;
    panel.position.set(px, yMid, pz);
    panel.castShadow = panel.receiveShadow = true;
    g.add(panel);
  }

  // Rounded corner posts — round the sharp seam between the front/back and
  // side wall panels above without touching those panels. Radius 0.14
  // matches the panels' own half-thickness (0.28 / 2) exactly, so the
  // post's curved outer surface is tangent to both adjacent wall faces
  // with no gap or overlap. See docs/superpowers/specs/
  // 2026-09-02-rounded-building-corners-design.md (§A2).
  addRoundedCornerPosts(g, w, d, plinthH, wallH, 0.14, wMat.clone());

  // Core shadow volume
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/BuildingBuilder.test.ts`
Expected: PASS (all tests in the file, including the 3 new ones added in Step 1).

- [ ] **Step 5: Commit**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
feat: round buildHouseOrShop's corners with addRoundedCornerPosts

buildHouseOrShop() backs the house/shop/inn/guild kinds and is the
generic fallback for any faction (notably human) with no dedicated
FACTION_BUILDING_VARIANTS entry — previously 100% sharp box corners
with zero treatment at all. Now adds 4 rounded corner posts tangent to
the existing wall panels, matching the rounded-corner visual language
BlockKit-driven faction buildings already get from the chamfer arc.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add src/world/buildings/BuildingBuilder.ts tests/world/BuildingBuilder.test.ts
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 5: Full regression, live verification, roadmap update, push

**Files:**
- Modify: `TODO/organic_world_tiles_todo.md`, `TODO/TODO_OVERVIEW.md`
- No new source files.

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: a pushed, verified branch state and an updated PR.

- [ ] **Step 1: Re-establish a fresh regression baseline**

The mission's original baseline (146 tsc errors, ~13 pre-existing/flaky test failures) was established before PR #44 merged and `main` has moved since. Re-confirm it's still accurate on the current branch tip (which matches `origin/main` plus this task's new commits) by running, before drawing any conclusions about "new" failures:

Run: `npx tsc --noEmit 2>&1 | tail -5` (note the error count from the summary line)
Run: `npx vitest run 2>&1 | tail -40` (note the failed test count/names)

- [ ] **Step 2: Compare against baseline, fix only genuinely new regressions**

If the tsc error count or the set of failing test names differs from the established baseline (146 errors; failures in `tests/levels/towerGenerator.test.ts`, `tests/progression/talentSystem.test.ts`, `tests/world/WaterMaterial.test.ts`, `src/__tests__/main.startup.smoke.test.ts`, `tests/levels/enemyLoader.test.ts`, `tests/world/ResourceNodePlacer.test.ts`), investigate and fix any failure that traces back to this plan's changes (`BlockKit.ts`, `BuildingBuilder.ts`, `RoundedCornerPosts.ts`). Do not chase pre-existing/flaky failures unrelated to this change — cross-check by re-running a failing test in isolation 2-3 times if it looks flaky.

- [ ] **Step 3: Live verification via Overworld Studio's Settlement Lab**

Launch the app's dev server and open Overworld Studio, go to the Settlement tab, and use "Play in 3D" (`SettlementLabScene`) to generate settlements across at least: 2 factions that use BlockKit (e.g. dwarven, elven) and the human faction (uses `buildHouseOrShop`), at 2-3 different seeds each. Visually confirm:
- BlockKit-driven faction buildings (dwarven/elven/etc.) show visibly smoother/rounder corners than before (compare against a `git stash`'d pre-change build if the difference is subtle).
- Human houses/shops/inns/guildhalls show 4 rounded corner posts with no visible gap, overlap, or z-fighting where each post meets the wall panels.
- No new visual artifacts (floating geometry, NaN-flicker, missing faces) anywhere in the generated settlements.

If a dev server workflow isn't readily available in this environment, fall back to a scripted/headless render smoke check: write a short throwaway Node/tsx script that calls `buildBuilding()` directly for a handful of `(faction, buildingKind, seed)` combinations and asserts (via the same NaN/vertex-count checks used in the unit tests) that geometry is well-formed — this doesn't replace visual confirmation but at least proves nothing crashes across a wider matrix than the unit tests cover. Note in the final report which verification path was actually used.

- [ ] **Step 4: Update roadmap docs**

In `TODO/organic_world_tiles_todo.md`, find Phase 2's status line and checklist (already marked `✅ Shipped 2026-09-02 (chamfer classification only — kit-of-parts deferred, see below)`). Add a follow-up note directly beneath it (do not remove the existing text) documenting this round's work, e.g.:

```markdown
> **2026-09-02 follow-up** (user feedback: "was this implemented only on
> water edges?"): shipped a lighter-weight alternative to the deferred
> kit-of-parts effort — generalized BlockKit's flat chamfer into a true
> N-segment rounded arc (default 3 segments), and added rounded corner
> posts to the human/generic default builder (`buildHouseOrShop`), which
> previously had zero corner treatment at all. See
> `docs/superpowers/specs/2026-09-02-rounded-building-corners-design.md`.
> Full kit-of-parts mesh-swap architecture remains deferred; several
> specialty builders (villa, terraced, cottage, tavern, tower, gate, etc.)
> intentionally not touched this round — see the spec's "Alternatives
> considered" section.
```

Mirror this in `TODO/TODO_OVERVIEW.md`'s G16 entry (find the line referencing Phase 2/organic world tiles and append a one-line pointer to the same follow-up, matching however that file's existing entries are phrased for prior updates in this same effort).

- [ ] **Step 5: Commit and push**

```bash
cat > /tmp/commit_msg.txt << 'EOF'
docs: record rounded-building-corners follow-up in roadmap docs

Cross-references docs/superpowers/specs/
2026-09-02-rounded-building-corners-design.md from Phase 2's status in
organic_world_tiles_todo.md and TODO_OVERVIEW.md's G16 entry.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git add TODO/organic_world_tiles_todo.md TODO/TODO_OVERVIEW.md
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
git push
```

- [ ] **Step 6: Open or update the PR**

Run: `gh pr list --repo HammerOfSteel/tomes_towers_and_transmutation --head <this-branch-name> --state all` to check whether a PR already exists for this branch (PR #44 was merged, so a fresh one is needed unless one was already opened earlier in this session).

If none exists, use the `create_pull_request` tool (title referencing "rounded building corners follow-up", body summarizing A1/A2, what's deferred, and verification results). If one already exists, use `update_pull_request` to refresh its body with this round's summary. Do **not** merge it — leave it open for the user to review, per the mission's standing instruction.
