# Outdoor Collision Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two collision bugs in the overworld — buildings have zero physics collider (player walks through houses), and the terrain physics collider (a smoothly-interpolated Rapier heightfield) mismatches the blocky-stepped visual terrain mesh at elevation edges/slopes (player clips through what looks like solid cliff faces).

**Architecture:** (1) Extract the terrain's vertex/index buffer construction into a shared pure function so the exact same geometry backs both the visual mesh and a new Rapier **trimesh** physics collider (replacing the heightfield) — guaranteeing they can never diverge. (2) Add a rotated static box collider per building, sized from the same `getFootprint()`/`FLOOR_HEIGHT` data the visual builder already uses, registered through one shared method so every building-spawn path (settlements, studio previews, dev test-hooks) stays consistent. (3) Fix `getNearestBuilding()`'s door-proximity check to measure distance to the building's nearest wall (not its center), which is what keeps the "press E to enter" prompt working once buildings become solid.

**Tech Stack:** TypeScript, Three.js, Rapier3D (`@dimforge/rapier3d-compat`), Vitest, Playwright.

## Global Constraints

- Only `src/scene/OverworldScene.ts`, `src/physics/PhysicsWorld.ts`, `src/main.ts`, and new files under `src/world/` are in scope. Do not touch dungeon/tower/building-interior collision systems.
- Building collision is a single axis-aligned-at-origin box per building (no custom per-kind shapes) — minor visual overhang (eaves, chimneys, signage) poking past the box is an accepted simplification.
- `maxDist` in `getNearestBuilding(pos, maxDist = 4)` keeps its default value of `4`, but its meaning changes from "distance to building center" to "distance to building's nearest wall/surface."
- No changes to existing tree/rock/tower colliders, `PhysicsWorld` culling (`cullingRadius`/`cullingOrigin`), or the settlement-boundary-crossing system (`checkSettlementBoundaryCrossing`).
- Buildings are authored centered at local origin (`x ∈ [-w/2, w/2]`, `z ∈ [-d/2, d/2]`, door faces local `+Z`) — this is why a box collider centered at the building's placement position with half-extents `(w/2, h/2, d/2)` aligns exactly with the visual mesh.
- `THREE.Object3D.rotation.y = θ` transforms a local point `(lx, lz)` to world `(wx, wz)` via `wx = lx·cos(θ) + lz·sin(θ)`, `wz = -lx·sin(θ) + lz·cos(θ)` (verified empirically against three.js). The inverse (world offset → local) is `lx = dx·cos(θ) - dz·sin(θ)`, `lz = dx·sin(θ) + dz·cos(θ)`, where `dx = wx - centerX`, `dz = wz - centerZ`.

---

### Task 1: Extract terrain geometry into a shared, pure, testable module

**Files:**
- Create: `src/world/TerrainGeometryBuilder.ts`
- Create: `tests/world/TerrainGeometryBuilder.test.ts`
- Modify: `src/scene/OverworldScene.ts` (`_buildTerrain()`, lines 729–844; remove `BIOME`/`BIOME_RIVER`/`BIOME_WATER` consts, lines 72–81)

**Interfaces:**
- Consumes: `WorldGrid` (`src/world/WorldGrid.ts`) — `wg.get(col, row): WorldCell` with `{ elevation: number; biome: BiomeId; feature: TileFeature; ... }`.
- Produces: `buildTerrainGeometryData(wg, GW, GH, GHW, GHH, T, SH): TerrainGeometryData` where `TerrainGeometryData = { positions: number[]; normals: number[]; colors: number[]; indices: number[] }`. Also exports `BIOME: readonly [number,number,number][]`, `BIOME_RIVER: [number,number,number]`, `BIOME_WATER: [number,number,number]`. Task 2 (`_createTerrainCollider`) calls this same function.

- [ ] **Step 1: Write the failing unit tests**

Create `tests/world/TerrainGeometryBuilder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { WorldGrid } from '@/world/WorldGrid';
import { buildTerrainGeometryData } from '@/world/TerrainGeometryBuilder';

describe('buildTerrainGeometryData', () => {
  it('emits only top faces when all tiles are flat (no elevation steps)', () => {
    const wg = new WorldGrid(3, 1);
    // All tiles default to elevation 0 — no edits needed.

    const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);

    // 3 tiles × 1 top face × 4 verts × 3 floats = 36 position floats.
    expect(data.positions).toHaveLength(36);
    // 3 tiles × 1 top face × 6 indices = 18.
    expect(data.indices).toHaveLength(18);
    // Every face normal should be straight up (+Y) — no wall faces.
    for (let i = 0; i < data.normals.length; i += 3) {
      expect([data.normals[i], data.normals[i + 1], data.normals[i + 2]]).toEqual([0, 1, 0]);
    }
  });

  it('emits 4 wall faces around a single raised tile between two flat tiles', () => {
    const wg = new WorldGrid(3, 1);
    wg.set(1, 0, { elevation: 2 });
    // Tile (0,0) and (2,0) stay at default elevation 0.

    const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);

    // Tile 0: top only (1 face). Tile 1 (raised): top + N + S + E + W (5 faces).
    // Tile 2: top only (1 face). Total 7 faces × 4 verts × 3 floats = 84.
    expect(data.positions).toHaveLength(84);
    expect(data.indices).toHaveLength(42); // 7 faces × 6 indices

    // Collect the set of distinct face normals present — should include
    // up, north, south, east, west (5 distinct normals; tiles 0 and 2
    // contribute only "up" again, so 5 distinct values total).
    const normalSet = new Set<string>();
    for (let i = 0; i < data.normals.length; i += 3) {
      normalSet.add(`${data.normals[i]},${data.normals[i + 1]},${data.normals[i + 2]}`);
    }
    expect(normalSet).toEqual(new Set(['0,1,0', '0,0,1', '0,0,-1', '1,0,0', '-1,0,0']));
  });

  it('colors water-biome tiles using the water palette', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'water' });

    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 1, 1);

    // Water tint uses BIOME_WATER = [0.14, 0.26, 0.48] with a brightness
    // variation factor `v` applied uniformly to r/g/b — check the ratio
    // between channels matches the water palette's ratio, which is
    // biome-specific and distinct from any BIOME[] land level.
    const [r, g, b] = [data.colors[0]!, data.colors[1]!, data.colors[2]!];
    expect(r / g).toBeCloseTo(0.14 / 0.26, 5);
    expect(g / b).toBeCloseTo(0.26 / 0.48, 5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: FAIL — `Cannot find module '@/world/TerrainGeometryBuilder'` (module doesn't exist yet).

- [ ] **Step 3: Create the extracted module**

Create `src/world/TerrainGeometryBuilder.ts`:

```ts
/**
 * TerrainGeometryBuilder.ts — pure geometry builder for the overworld's
 * blocky-step terrain mesh.
 *
 * Extracted so the exact same vertex/index buffers back both the visual
 * mesh (OverworldScene._buildTerrain) and the physics collider
 * (OverworldScene._createTerrainCollider) — guaranteeing they can never
 * mismatch, which was the root cause of players clipping through terrain
 * at elevation edges/slopes (the old collider used a Rapier heightfield
 * that smoothly interpolated between samples instead of stepping).
 */
import type { WorldGrid } from './WorldGrid';

/** Biome vertex colours [r, g, b] for height levels 0–4. */
export const BIOME: readonly [number, number, number][] = [
  [0.20, 0.26, 0.11],   // 0  bog / muddy path
  [0.26, 0.44, 0.16],   // 1  grass
  [0.20, 0.36, 0.13],   // 2  forest floor
  [0.35, 0.41, 0.26],   // 3  highland
  [0.44, 0.41, 0.30],   // 4  rocky upland
];

export const BIOME_RIVER: [number, number, number] = [0.18, 0.38, 0.62]; // blue channel
export const BIOME_WATER: [number, number, number] = [0.14, 0.26, 0.48]; // deep water

export interface TerrainGeometryData {
  positions: number[];
  normals:   number[];
  colors:    number[];
  indices:   number[];
}

/**
 * Build the raw vertex/index/normal/color buffers for the overworld terrain.
 *
 * For each tile at height H:
 *   – Top face     (normal +Y)
 *   – South wall   (normal +Z) when south neighbour is lower
 *   – North wall   (normal −Z) when north neighbour is lower
 *   – East  wall   (normal +X) when east  neighbour is lower
 *   – West  wall   (normal −X) when west  neighbour is lower
 *
 * `GW`/`GH` = grid width/height (tile counts). `GHW`/`GHH` = half-grid-width/
 * height offsets used to center the grid at world origin. `T` = tile side
 * length (world units). `SH` = world-unit height increment per elevation level.
 */
export function buildTerrainGeometryData(
  wg: WorldGrid,
  GW: number, GH: number, GHW: number, GHH: number,
  T: number, SH: number,
): TerrainGeometryData {
  const pos: number[] = [];
  const nrm: number[] = [];
  const clr: number[] = [];
  const idx: number[] = [];

  /** Height level of a (possibly out-of-bounds) tile. */
  const lvl = (c: number, r: number): number => wg.get(c, r).elevation;

  /**
   * Append a quad face to the buffers.
   * v0→v1→v2→v3 must be counter-clockwise when viewed along the outward normal.
   */
  const addFace = (
    v0: [number, number, number], v1: [number, number, number],
    v2: [number, number, number], v3: [number, number, number],
    nx: number, ny: number, nz: number,
    r: number, g: number, b: number,
  ): void => {
    const base = pos.length / 3;
    pos.push(...v0, ...v1, ...v2, ...v3);
    nrm.push(nx, ny, nz,  nx, ny, nz,  nx, ny, nz,  nx, ny, nz);
    clr.push(r, g, b,  r, g, b,  r, g, b,  r, g, b);
    idx.push(base, base + 1, base + 2,  base, base + 2, base + 3);
  };

  for (let row = 0; row < GH; row++) {
    for (let col = 0; col < GW; col++) {
      const H   = lvl(col, row);
      const wy  = H * SH;
      const wx  = (col - GHW) * T;
      const wz  = (row - GHH) * T;
      const wx1 = wx + T;
      const wz1 = wz + T;

      // Subtle per-tile brightness variation (avoids repetitive flat look)
      const v = 0.92 + ((col * 29 + row * 19) % 18) / 200;

      // Biome/feature-aware colour selection
      const cell = wg.get(col, row);
      let biomeRgb: [number, number, number];
      if (cell.biome === 'water') {
        biomeRgb = BIOME_WATER;
      } else if (cell.feature === 'river') {
        biomeRgb = BIOME_RIVER;
      } else if (cell.feature === 'river_bank') {
        const b = BIOME[H]!;
        biomeRgb = [b[0] * 0.88, b[1] * 0.80, b[2] * 0.68];
      } else {
        biomeRgb = BIOME[H]!;
      }
      const [rb, gb, bb] = biomeRgb;
      const tr = rb * v, tg = gb * v, tb = bb * v;

      // ── TOP face (normal +Y) ─────────────────────────────────────────
      addFace(
        [wx, wy, wz], [wx, wy, wz1], [wx1, wy, wz1], [wx1, wy, wz],
        0, 1, 0,  tr, tg, tb,
      );

      // ── SOUTH wall (+Z face, at wz1) ─────────────────────────────────
      const Hs = lvl(col, row + 1);
      if (Hs < H) {
        const wy2 = Hs * SH;
        const d = 0.76;
        addFace(
          [wx1, wy, wz1], [wx, wy, wz1], [wx, wy2, wz1], [wx1, wy2, wz1],
          0, 0, 1,  tr * d, tg * d, tb * d,
        );
      }

      // ── NORTH wall (−Z face, at wz) ──────────────────────────────────
      const Hn = lvl(col, row - 1);
      if (Hn < H) {
        const wy2 = Hn * SH;
        const d = 0.50;
        addFace(
          [wx, wy, wz], [wx1, wy, wz], [wx1, wy2, wz], [wx, wy2, wz],
          0, 0, -1,  tr * d, tg * d, tb * d,
        );
      }

      // ── EAST wall (+X face, at wx1) ──────────────────────────────────
      const He = lvl(col + 1, row);
      if (He < H) {
        const wy2 = He * SH;
        const d = 0.63;
        addFace(
          [wx1, wy, wz], [wx1, wy, wz1], [wx1, wy2, wz1], [wx1, wy2, wz],
          1, 0, 0,  tr * d, tg * d, tb * d,
        );
      }

      // ── WEST wall (−X face, at wx) ───────────────────────────────────
      const Hw = lvl(col - 1, row);
      if (Hw < H) {
        const wy2 = Hw * SH;
        const d = 0.55;
        addFace(
          [wx, wy, wz1], [wx, wy, wz], [wx, wy2, wz], [wx, wy2, wz1],
          -1, 0, 0,  tr * d, tg * d, tb * d,
        );
      }
    }
  }

  return { positions: pos, normals: nrm, colors: clr, indices: idx };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts`
Expected: PASS (3/3 tests).

- [ ] **Step 5: Wire `OverworldScene._buildTerrain()` to use the new module**

In `src/scene/OverworldScene.ts`:

Remove the `BIOME`/`BIOME_RIVER`/`BIOME_WATER` constant block (lines 70–81, everything between `const SH = 0.55;` and the constructor section) — keep `T` and `SH` (still used elsewhere in the file):

```ts
const T   = 2;                // tile side length in world units (= interior cell)
const SH  = 0.55;             // world-unit height increment per level
```

(Delete the `// ── Biome vertex colours ...` comment block and the `BIOME`, `BIOME_RIVER`, `BIOME_WATER` const declarations that followed it.)

Add the import near the other `@/world/...` imports:

```ts
import { buildTerrainGeometryData } from '@/world/TerrainGeometryBuilder';
```

Replace the entire body of `_buildTerrain()` (the whole method from `private _buildTerrain(): THREE.Mesh {` through its closing `}`, currently ~115 lines) with:

```ts
  private _buildTerrain(): THREE.Mesh {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    const { positions, normals, colors, indices } = buildTerrainGeometryData(
      this._wg, GW, GH, GHW, GHH, T, SH,
    );

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);

    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  }
```

- [ ] **Step 6: Type-check and run the broader suite**

Run: `npx tsc --noEmit`
Expected: no new errors (the removed `BIOME`/`BIOME_RIVER`/`BIOME_WATER` consts must have zero remaining references in `OverworldScene.ts` — confirm with `grep -n "BIOME" src/scene/OverworldScene.ts` returning nothing).

Run: `npx vitest run tests/world/TerrainGeometryBuilder.test.ts tests/scene/`
Expected: all PASS, including the existing `overworld.startup.smoke.test.ts` (confirms `OverworldScene` still imports cleanly).

- [ ] **Step 7: Commit**

```bash
git add src/world/TerrainGeometryBuilder.ts tests/world/TerrainGeometryBuilder.test.ts src/scene/OverworldScene.ts
git commit -m "refactor(overworld): extract terrain geometry into shared TerrainGeometryBuilder

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Replace the terrain physics collider with a trimesh built from the same geometry

**Files:**
- Modify: `src/physics/PhysicsWorld.ts` (add `createStaticTrimesh`)
- Modify: `src/scene/OverworldScene.ts` (`_createTerrainCollider()`, lines 684–704)
- Create: `tests/physics/PhysicsWorld.test.ts`

**Interfaces:**
- Consumes: `buildTerrainGeometryData()` from Task 1.
- Produces: `PhysicsWorld.createStaticTrimesh(vertices: Float32Array, indices: Uint32Array): RAPIER.RigidBody` — a new factory method alongside `createStaticBox`/`createStaticRotatedBox`.

- [ ] **Step 1: Write the failing unit test**

Create `tests/physics/PhysicsWorld.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { PhysicsWorld } from '@/physics/PhysicsWorld';

describe('PhysicsWorld.createStaticTrimesh', () => {
  let physics: PhysicsWorld;

  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
  });

  it('creates a fixed rigid body with a trimesh collider from vertex/index buffers', () => {
    // A single flat quad (two triangles) at y=0, spanning x:[0,1], z:[0,1].
    const vertices = new Float32Array([
      0, 0, 0,   1, 0, 0,   0, 0, 1,   1, 0, 1,
    ]);
    const indices = new Uint32Array([0, 1, 2,  1, 3, 2]);

    const bodiesBefore = physics.rapierWorld.bodies.len();
    const body = physics.createStaticTrimesh(vertices, indices);

    expect(physics.rapierWorld.bodies.len()).toBe(bodiesBefore + 1);
    expect(body.bodyType()).toBe(0); // RAPIER.RigidBodyType.Fixed === 0
    expect(body.numColliders()).toBe(1);

    const collider = body.collider(0);
    expect(collider).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/physics/PhysicsWorld.test.ts`
Expected: FAIL — `physics.createStaticTrimesh is not a function`.

- [ ] **Step 3: Add the factory method**

In `src/physics/PhysicsWorld.ts`, add after `createStaticRotatedBox` (after its closing `}`, before `createKinematicCapsule`):

```ts
  /** Create a fixed static trimesh collider from raw vertex/index buffers.
   *  Used for terrain — guarantees the physics surface exactly matches
   *  whatever geometry produced `vertices`/`indices` (see
   *  TerrainGeometryBuilder.buildTerrainGeometryData). */
  createStaticTrimesh(vertices: Float32Array, indices: Uint32Array): RAPIER.RigidBody {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
    this.world.createCollider(colliderDesc, body);
    return body;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/physics/PhysicsWorld.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `_createTerrainCollider()` to use the trimesh**

In `src/scene/OverworldScene.ts`, replace the entire body of `_createTerrainCollider()` with:

```ts
  private _createTerrainCollider(): RAPIER.RigidBody {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    const { positions, indices } = buildTerrainGeometryData(this._wg, GW, GH, GHW, GHH, T, SH);
    return this.physics.createStaticTrimesh(
      new Float32Array(positions),
      new Uint32Array(indices),
    );
  }
```

Update the method's doc comment (currently describes the Rapier heightfield convention) to:

```ts
  /**
   * Build a Rapier trimesh collider from the exact same vertex/index buffers
   * used to render the terrain (`buildTerrainGeometryData`) — physics and
   * visuals can never mismatch, including at elevation-edge cliff faces.
   */
```

- [ ] **Step 6: Type-check and run the broader suite**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npx vitest run tests/physics/ tests/world/TerrainGeometryBuilder.test.ts tests/scene/`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/physics/PhysicsWorld.ts src/scene/OverworldScene.ts tests/physics/PhysicsWorld.test.ts
git commit -m "fix(physics): replace terrain heightfield collider with trimesh matching visual mesh

Root cause of players clipping through terrain at elevation edges/slopes:
the visual terrain renders blocky steps (flat tile top + vertical cliff
faces), but the old Rapier heightfield collider smoothly interpolated
between elevation samples instead. Now both are built from the same
buildTerrainGeometryData() buffers.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Building footprint distance helper

**Files:**
- Create: `src/world/buildings/BuildingCollision.ts`
- Create: `tests/world/buildings/BuildingCollision.test.ts`

**Interfaces:**
- Produces: `closestDistanceToBuildingFootprint(p: XZPoint, center: XZPoint, footprint: { w: number; d: number }, rotationY: number): number` and `export interface XZPoint { x: number; z: number }`. Consumed by Task 5 (`getNearestBuilding`).

- [ ] **Step 1: Write the failing unit tests**

Create `tests/world/buildings/BuildingCollision.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { closestDistanceToBuildingFootprint } from '@/world/buildings/BuildingCollision';

describe('closestDistanceToBuildingFootprint', () => {
  it('returns 0 for a point inside the (unrotated) footprint', () => {
    const d = closestDistanceToBuildingFootprint(
      { x: 1, z: 1 }, { x: 0, z: 0 }, { w: 4, d: 6 }, 0,
    );
    expect(d).toBe(0);
  });

  it('returns the straight-line gap for a point outside an unrotated footprint', () => {
    // Footprint half-extents: w/2=2, d/2=3. Point at (5, 0) is 3 units
    // past the +X wall (5 - 2 = 3), directly out along X (z stays inside).
    const d = closestDistanceToBuildingFootprint(
      { x: 5, z: 0 }, { x: 0, z: 0 }, { w: 4, d: 6 }, 0,
    );
    expect(d).toBeCloseTo(3, 6);
  });

  it('accounts for a 90-degree rotation swapping the effective width/depth axes', () => {
    // Footprint w=4 (half=2), d=6 (half=3), rotated 90 degrees around Y,
    // centered at (10, 10). World point (10, 15) is offset (0, +5) in world
    // space. Verified by hand against three.js's Object3D.rotation.y
    // convention (wx = lx*cos(θ)+lz*sin(θ), wz = -lx*sin(θ)+lz*cos(θ)):
    // this offset corresponds to local point (lx, lz) = (-5, 0), which
    // clamps to the box's local half-extents (hw=2, hd=3) at (-2, 0),
    // giving a distance of 3.
    const d = closestDistanceToBuildingFootprint(
      { x: 10, z: 15 }, { x: 10, z: 10 }, { w: 4, d: 6 }, Math.PI / 2,
    );
    expect(d).toBeCloseTo(3, 6);
  });

  it('returns 0 for a point on the footprint boundary', () => {
    const d = closestDistanceToBuildingFootprint(
      { x: 2, z: 0 }, { x: 0, z: 0 }, { w: 4, d: 6 }, 0,
    );
    expect(d).toBeCloseTo(0, 6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/buildings/BuildingCollision.test.ts`
Expected: FAIL — `Cannot find module '@/world/buildings/BuildingCollision'`.

- [ ] **Step 3: Implement the helper**

Create `src/world/buildings/BuildingCollision.ts`:

```ts
/**
 * BuildingCollision.ts — pure geometry helpers for building physics
 * collision sizing and door-proximity checks. No THREE.js/Rapier
 * dependency (plain numbers only) so it's trivially unit-testable.
 */

/** A 2D point in world-space XZ coordinates (Y is ignored — buildings are
 *  always upright). */
export interface XZPoint {
  x: number;
  z: number;
}

/**
 * Distance from `p` to the nearest point on a building's rotated
 * rectangular footprint (XZ plane only).
 *
 * The footprint is a `footprint.w` (width, local X) × `footprint.d` (depth,
 * local Z) rectangle centered at `center`, rotated by `rotationY` radians
 * around Y — matching `THREE.Object3D.rotation.y` (0 = local +Z axis
 * aligned with world +Z; buildings are authored with their door facing
 * local +Z).
 *
 * Returns 0 if `p` is inside or exactly on the footprint boundary.
 */
export function closestDistanceToBuildingFootprint(
  p: XZPoint,
  center: XZPoint,
  footprint: { w: number; d: number },
  rotationY: number,
): number {
  const dx = p.x - center.x;
  const dz = p.z - center.z;

  // Rotate the world-space offset into the building's local (unrotated)
  // frame: local = R(-rotationY) * worldOffset (the inverse of the
  // rotation matrix used to place the building, since rotation matrices
  // are orthogonal — inverse == transpose).
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;

  const hw = footprint.w / 2;
  const hd = footprint.d / 2;

  // Clamp to the box's local half-extents — closest point on/in the box.
  const cx = Math.max(-hw, Math.min(hw, lx));
  const cz = Math.max(-hd, Math.min(hd, lz));

  const ox = lx - cx;
  const oz = lz - cz;
  return Math.hypot(ox, oz);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/buildings/BuildingCollision.test.ts`
Expected: PASS (4/4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/BuildingCollision.ts tests/world/buildings/BuildingCollision.test.ts
git commit -m "feat(buildings): add closestDistanceToBuildingFootprint pure helper

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Register a physics collider for every placed building

**Files:**
- Modify: `src/scene/OverworldScene.ts`:
  - `_buildingData` field declaration (line 133)
  - New public method `registerBuildingCollider()`
  - `_buildStudioSettlementPreview()` (building push site, ~line 1774–1776)
  - `_buildSettlements()` (building push site, ~line 1849–1855)
- Modify: `src/main.ts` (`spawnBuildingNearPlayer` dev hook, ~line 1704–1725)

**Interfaces:**
- Consumes: `getFootprint(kind, size)` and `FLOOR_HEIGHT` from `@/world/buildings/BuildingDNA` (already imported as `factionBuildingDna, type BuildingDNA, type Faction` in `OverworldScene.ts` — extend that import). `physics.createStaticRotatedBox()` (existing `PhysicsWorld` method, unchanged).
- Produces: `OverworldScene.registerBuildingCollider(dna: BuildingDNA, pos: THREE.Vector3, rotationY: number): void`. `_buildingData` entries gain a `rotationY: number` field, consumed by Task 5.

- [ ] **Step 1: Extend the `BuildingDNA` import**

In `src/scene/OverworldScene.ts`, change:

```ts
import {
  factionBuildingDna,
  type BuildingDNA,
  type Faction,
} from '@/world/buildings/BuildingDNA';
```

to:

```ts
import {
  factionBuildingDna,
  getFootprint,
  FLOOR_HEIGHT,
  type BuildingDNA,
  type Faction,
} from '@/world/buildings/BuildingDNA';
```

- [ ] **Step 2: Add `rotationY` to the `_buildingData` field type**

Change (line 133):

```ts
  private readonly _buildingData: Array<{ dna: BuildingDNA; pos: THREE.Vector3; faction: Faction }> = [];
```

to:

```ts
  private readonly _buildingData: Array<{ dna: BuildingDNA; pos: THREE.Vector3; faction: Faction; rotationY: number }> = [];
```

- [ ] **Step 3: Add `registerBuildingCollider()`**

Add this new public method directly after `getNearestBuilding()` (after its closing `}`, around line 539):

```ts
  /**
   * Create and register a static box collider matching a building's
   * footprint, position, rotation, and floor count. Call this for every
   * building placed in the overworld (settlements, studio previews, and
   * dev test-spawn hooks) so every building blocks player movement.
   * `pos` is the building's placement position (its local origin — see
   * `BuildingCollision.ts` docs: buildings are authored centered at local
   * origin with the door facing local +Z).
   */
  registerBuildingCollider(dna: BuildingDNA, pos: THREE.Vector3, rotationY: number): void {
    const fp = getFootprint(dna.buildingKind, dna.size);
    const halfH = (dna.floors * FLOOR_HEIGHT) / 2;
    const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
    this._staticBodies.push(
      this.physics.createStaticRotatedBox(
        new THREE.Vector3(pos.x, pos.y + halfH, pos.z),
        rotQuat,
        new THREE.Vector3(fp.w / 2, halfH, fp.d / 2),
      ),
    );
  }
```

- [ ] **Step 4: Wire the studio-preview building placement site**

In `_buildStudioSettlementPreview()`, change:

```ts
      grp.position.set(wx, wy, wz);
      grp.rotation.y = (seed % 4) * (Math.PI / 2);
      grp.userData['studioPreview'] = true;
      grp.userData['studioWardType'] = ward.type;

      this._buildingGroups.push(grp);
      this._buildingData.push({ dna, pos: new THREE.Vector3(wx, wy, wz), faction: runtimeFaction });
      buildingCount++;
```

to:

```ts
      const buildingRotationY = (seed % 4) * (Math.PI / 2);
      grp.position.set(wx, wy, wz);
      grp.rotation.y = buildingRotationY;
      grp.userData['studioPreview'] = true;
      grp.userData['studioWardType'] = ward.type;

      this._buildingGroups.push(grp);
      this._buildingData.push({ dna, pos: new THREE.Vector3(wx, wy, wz), faction: runtimeFaction, rotationY: buildingRotationY });
      this.registerBuildingCollider(dna, new THREE.Vector3(wx, wy, wz), buildingRotationY);
      buildingCount++;
```

- [ ] **Step 5: Wire the settlement building placement site**

In `_buildSettlements()`, change:

```ts
        const dna = createSettlementBuildingDna(b, plan.type);
        const inst = buildBuilding(dna);
        const grp = inst.exteriorGroup;
        grp.position.set(wx, wy, wz);
        grp.rotation.y = b.rotation;
        this._buildingGroups.push(grp);
        this._buildingData.push({ dna, pos: new THREE.Vector3(wx, wy, wz), faction: settlementTypeToFaction(plan.type) });
```

to:

```ts
        const dna = createSettlementBuildingDna(b, plan.type);
        const inst = buildBuilding(dna);
        const grp = inst.exteriorGroup;
        grp.position.set(wx, wy, wz);
        grp.rotation.y = b.rotation;
        this._buildingGroups.push(grp);
        this._buildingData.push({ dna, pos: new THREE.Vector3(wx, wy, wz), faction: settlementTypeToFaction(plan.type), rotationY: b.rotation });
        this.registerBuildingCollider(dna, new THREE.Vector3(wx, wy, wz), b.rotation);
```

- [ ] **Step 6: Update the `spawnBuildingNearPlayer` dev test-hook in `main.ts`**

In `src/main.ts`, inside `spawnBuildingNearPlayer`, change:

```ts
              const inst = buildBuilding(dna);
              inst.exteriorGroup.position.set(bx, 0, bz);
              scene.add(inst.exteriorGroup);
              // Register in overworld building data so getNearestBuilding finds it
              (overworld as any)?._buildingData?.push({
                dna, pos: new THREE.Vector3(bx, 0, bz), faction: 'human_town',
              });
              console.log(`[spawnBuildingNearPlayer] ${kind}/${style} floors=${floors} at (${bx},${bz})`);
              resolve({ x: bx, z: bz });
```

to:

```ts
              const inst = buildBuilding(dna);
              inst.exteriorGroup.position.set(bx, 0, bz);
              scene.add(inst.exteriorGroup);
              // Register in overworld building data so getNearestBuilding finds it
              (overworld as any)?._buildingData?.push({
                dna, pos: new THREE.Vector3(bx, 0, bz), faction: 'human_town', rotationY: 0,
              });
              overworld?.registerBuildingCollider(dna, new THREE.Vector3(bx, 0, bz), 0);
              console.log(`[spawnBuildingNearPlayer] ${kind}/${style} floors=${floors} at (${bx},${bz})`);
              resolve({ x: bx, z: bz });
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. (`getNearestBuilding()`'s return type still only has `dna`/`pos`/`faction` at this point — Task 5 updates it to include `rotationY`. Since `_buildingData`'s type now has an extra field, `getNearestBuilding`'s `best` variable — which is typed independently as `{ dna: BuildingDNA; pos: THREE.Vector3; faction: Faction } | null` — will still compile because TypeScript structurally allows assigning a wider object to a narrower-typed variable... verify this compiles; if `tsc` reports an error assigning `bd` — which now has `rotationY` — to `best`, it means structural typing rejected the extra property in that specific assignment context (unlikely for a `let` variable read, but double check). If it does error, that's expected and resolved by Task 5, not a bug in this task.)

- [ ] **Step 8: Run the existing building/scene test suite**

Run: `npx vitest run tests/world/ tests/scene/`
Expected: all PASS, no regressions.

- [ ] **Step 9: Commit**

```bash
git add src/scene/OverworldScene.ts src/main.ts
git commit -m "fix(overworld): give every placed building a physics collider

Buildings were pushed into the render list but never given a Rapier
collider anywhere, so the player walked straight through every house.
Adds a rotated static box collider (sized from getFootprint()/
FLOOR_HEIGHT, matching the visual builder) at every building-placement
site: settlements, studio previews, and the spawnBuildingNearPlayer
dev/test hook.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Fix building door-interaction distance to measure from the wall, not the center

**Files:**
- Modify: `src/scene/OverworldScene.ts` (`getNearestBuilding()`, lines 528–539)

**Interfaces:**
- Consumes: `closestDistanceToBuildingFootprint()` from Task 3; `getFootprint()` (already imported per Task 4 Step 1); `rotationY` field on `_buildingData` from Task 4.
- Produces: `getNearestBuilding(pos, maxDist)` return type gains `rotationY: number`. This is a public method — check `main.ts` call sites still compile (they only destructure `dna`/`pos`/`faction`, so the added field is additive and non-breaking).

- [ ] **Step 1: Add the import**

In `src/scene/OverworldScene.ts`, add near the other `@/world/buildings/...` imports:

```ts
import { closestDistanceToBuildingFootprint } from '@/world/buildings/BuildingCollision';
```

- [ ] **Step 2: Rewrite `getNearestBuilding()`**

Replace:

```ts
  getNearestBuilding(pos: THREE.Vector3, maxDist = 4): { dna: BuildingDNA; pos: THREE.Vector3; faction: Faction } | null {
    let best: { dna: BuildingDNA; pos: THREE.Vector3; faction: Faction } | null = null;
    let bestD2 = maxDist * maxDist;
    for (const bd of this._buildingData) {
      const dx = bd.pos.x - pos.x;
      const dz = bd.pos.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = bd; }
    }
    return best;
  }
```

with:

```ts
  /**
   * Returns the nearest building whose exterior surface is within `maxDist`
   * world units of `pos`, or null if none is close enough. Distance is
   * measured to the building's rotated footprint rectangle (its nearest
   * wall), not its center — see BuildingCollision.ts. Used by main.ts to
   * show the "Press E to enter" prompt.
   */
  getNearestBuilding(pos: THREE.Vector3, maxDist = 4): { dna: BuildingDNA; pos: THREE.Vector3; faction: Faction; rotationY: number } | null {
    let best: { dna: BuildingDNA; pos: THREE.Vector3; faction: Faction; rotationY: number } | null = null;
    let bestD = maxDist;
    for (const bd of this._buildingData) {
      const fp = getFootprint(bd.dna.buildingKind, bd.dna.size);
      const d = closestDistanceToBuildingFootprint(
        { x: pos.x, z: pos.z },
        { x: bd.pos.x, z: bd.pos.z },
        fp,
        bd.rotationY,
      );
      if (d < bestD) { bestD = d; best = bd; }
    }
    return best;
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (this resolves any structural-typing gap noted at the end of Task 4).

- [ ] **Step 4: Run the existing building/scene test suite**

Run: `npx vitest run tests/world/ tests/scene/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "fix(overworld): measure building door-proximity from nearest wall, not center

getNearestBuilding() compared raw distance to a building's center point
with a hardcoded maxDist=4, but building depths range 3-14 world units —
for anything with half-depth > 4 (most medium+ buildings), this made
entry unreachable once buildings became solid (Task 4). Now measures
distance to the building's rotated footprint surface instead.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: End-to-end verification

**Files:**
- Modify: `tests/e2e/exterior.test.ts` (append new tests to the existing `describe('Overworld (exterior) scene', ...)` block)

**Interfaces:**
- Consumes: existing helpers from `./helpers` (`loadPage`, `startGame`, `goExterior`, `teleportPlayer`, `getPlayerPos`, `waitForGrounded`) and the existing `window.__game.spawnBuildingNearPlayer(kind, style, floors)` dev hook (now registers a real collider per Task 4) and `window.__game` (for a new `getNearestBuildingDistance`-style check via direct `page.evaluate`, described below — no new dev hook needed since `spawnBuildingNearPlayer` already resolves the building's world position).

- [ ] **Step 1: Write the building-collision e2e test**

In `tests/e2e/exterior.test.ts`, add inside the `test.describe('Overworld (exterior) scene', ...)` block, after the existing terrain-physics tests (after the `'player Y never goes below -1...'` test, before the `describe` block's closing `});`):

```ts
  // ── 6. Building blocks player movement (collision fix) ───────────────────

  test('player cannot walk through a spawned building (blocked by collider)', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await goExterior(page, '06-building-collision-before');

    // spawnBuildingNearPlayer places a medium 'inn' 6 units in front of the
    // player (along +X) and returns its world position.
    const buildingPos = await page.evaluate(() =>
      (window as any).__game.spawnBuildingNearPlayer('inn', 'tudor', 2),
    ) as { x: number; z: number };

    const before = await getPlayerPos(page);

    // Try to walk straight through the building's center by teleporting
    // repeatedly in small steps toward it and letting physics settle each
    // time — a naive single teleport past the wall would just phase the
    // kinematic character controller through, which isn't what we're
    // testing. Instead, teleport just short of the wall (within its
    // footprint) and confirm the character controller pushes the player
    // back out rather than letting them settle inside solid geometry.
    await teleportPlayer(page, buildingPos.x - 0.2, before.y, buildingPos.z);
    await page.waitForTimeout(500); // let the physics step resolve the overlap

    const after = await getPlayerPos(page);
    await page.screenshot({ path: 'tests/e2e/screenshots/06-building-collision-after.png' });

    // 'inn' at 'medium' size has footprint w=9 (getFootprint default —
    // KIND_FOOTPRINT has no 'inn' override, so SIZE_FOOTPRINT.medium
    // applies: w=9, d=7), so its west wall sits 4.5 units before its
    // center (buildingPos.x - 4.5). The player was teleported to
    // buildingPos.x - 0.2 (deep inside the footprint) — physics must
    // resolve this by pushing them back out to at or beyond the wall,
    // not leave them embedded past it.
    expect(after.x, `player should be pushed out to x <= ${buildingPos.x - 4.5}, got ${after.x}`)
      .toBeLessThanOrEqual(buildingPos.x - 4.4); // small epsilon over the exact wall
  });

  // ── 7. Door-proximity prompt still works right at the wall ───────────────

  test('getNearestBuilding still finds the building from just outside its wall', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await goExterior(page, '07-building-door-proximity');

    const buildingPos = await page.evaluate(() =>
      (window as any).__game.spawnBuildingNearPlayer('cottage', 'thatched', 1),
    ) as { x: number; z: number };

    // 'cottage' footprint is w=9, d=7 (KIND_FOOTPRINT override) — its south
    // wall sits 3.5 units before its center (buildingPos.z + 3.5). Stand
    // 1 unit outside that wall (well within maxDist=4 of the wall, but
    // more than 4 units from the *center* — this is exactly the scenario
    // that broke before this fix).
    await teleportPlayer(page, buildingPos.x, 1.5, buildingPos.z + 4.5);
    await page.waitForTimeout(300);

    // main.ts's exterior HUD toggles #exterior-prompt's opacity between
    // '0' (hidden) and '1' (visible) via _setExteriorPrompt() — see
    // main.ts ~line 2127-2146. getNearestBuilding() returning non-null
    // sets its text to "Enter <buildingKind>" (main.ts ~line 2437-2439).
    const opacity = await page.locator('#exterior-prompt').evaluate(el => (el as HTMLElement).style.opacity);
    const text = await page.locator('#exterior-prompt').innerHTML();

    expect(opacity, 'prompt should be visible (opacity 1) when within 1 unit of the wall').toBe('1');
    expect(text).toContain('cottage');
  });

  // ── 8. Player does not clip through terrain at an elevation edge ─────────

  test('player stays grounded at a terrain elevation edge (no clipping)', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await goExterior(page, '08-elevation-edge-before');

    // Walk the player toward the world edge in a straight line, sampling Y
    // periodically — elevation transitions exist somewhere along any long
    // traversal across the default generated terrain. A negative or wildly
    // fluctuating Y (falling into geometry) indicates the collider doesn't
    // match the visual steps.
    const samples: number[] = [];
    for (let step = 0; step < 10; step++) {
      await teleportPlayer(page, step * 4 - 20, 5, step * 4 - 20);
      await page.waitForTimeout(200);
      const p = await getPlayerPos(page);
      samples.push(p.y);
    }
    await page.screenshot({ path: 'tests/e2e/screenshots/08-elevation-edge-after.png' });

    console.log(`[test] Y samples across traversal: ${samples.map(y => y.toFixed(2)).join(', ')}`);
    for (const y of samples) {
      expect(y, `player Y should never fall below -1 (fell through terrain), got ${y}`)
        .toBeGreaterThan(-1);
    }
  });
```

- [ ] **Step 2: Start the dev server**

Run (background/async): `npm run dev`
Expected: server starts, prints a local URL.

- [ ] **Step 3: Run the new tests**

Run: `npx playwright test tests/e2e/exterior.test.ts --reporter=list`
Expected: all tests in the file PASS, including the 3 new ones. If test 7's `#interact-prompt` selector doesn't match the actual DOM (it's a documentation placeholder pending verification against `main.ts`'s real prompt element — search `main.ts`/`index.html` for how the "press E" UI is actually rendered and fix the selector to match before treating this test as final), update the selector to the real one and re-run. Do not weaken the other two tests' assertions to force a pass — if test 6 or 8 fails, that indicates Tasks 1–5 have a real bug; debug those tasks, do not patch the test.

- [ ] **Step 4: Run the full existing e2e exterior suite to confirm no regressions**

Run: `npx playwright test tests/e2e/exterior.test.ts --reporter=list`
Expected: PASS for every test in the file (the pre-existing terrain-physics tests must still pass now that the collider is a trimesh instead of a heightfield).

- [ ] **Step 5: Stop the dev server**

Stop the background dev server process started in Step 2.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/exterior.test.ts
git commit -m "test(e2e): verify building collision, door-proximity, and terrain-edge fixes

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Post-Plan Notes (not tasks — informational only)

- This plan does not address indoor occlusion, interior room sizing, or vegetation variance — those are separate, already-scoped follow-up efforts per the brainstorming decomposition.
