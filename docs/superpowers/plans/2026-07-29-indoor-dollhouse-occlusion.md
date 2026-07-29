# Indoor "Dollhouse" Occlusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give building/dungeon/tower interiors a permanent, static "dollhouse" cutaway — the camera-facing side of every room is always hidden (walls, door frames, and for buildings, decor) instead of the current per-frame screen-space fade, without touching physics/collision.

**Architecture:** A new pure module, `DollhouseCutaway.ts`, exposes one geometric test (`shouldCutForDollhouse`) derived from the fixed isometric camera's direction. `BlueprintRenderer.ts` (the live gameplay path for dungeons, towers, *and* buildings — buildings are converted to a Blueprint via `buildingToDungeonPlan.ts`) and `InteriorGenerator.ts`'s own mesh builder (used only by the showroom/creative preview tools) each run one classification pass over their wall/door/decor meshes right after building them, permanently setting `visible = false` and tagging `userData.dollhouseCut = true` on near-side meshes. `WallOcclusionManager.ts` (the existing per-frame fallback system) gets a one-line guard so it never re-shows a permanently cut mesh.

**Tech Stack:** TypeScript, three.js, Vitest (jsdom environment, `@/` path alias to `src/`).

## Global Constraints

- Camera is fixed isometric: `ISO_OFFSET = (14, 20, 14)` in `src/core/CameraRig.ts`, never rotates — this is the basis for the whole design.
- `CUT_THRESHOLD` defaults to `0` (exact half-split), named/exported so it can be tuned later.
- Hiding a mesh must only ever set `.visible = false` — physics/collider bodies for that same wall must remain created and unaffected.
- `BlueprintRenderer.ts` is the **live gameplay** rendering path (dungeons, towers, and buildings via `buildingToDungeonPlan.ts`). `InteriorGenerator.ts`'s own `buildWallSurfaces`/`buildCeiling` mesh builder is used only by `src/showroom.ts` and `src/creative/backroomScenes.ts` (preview/creative tools) — confirmed via `grep -rln "generateInterior(" src` — so its ceiling removal has no live-gameplay collision impact.
- `tsconfig.json` has `noUnusedLocals: true` — deleting `buildCeiling()`'s only call site requires deleting the function itself, not leaving it dead.
- Existing dynamic systems: `WallOcclusionManager.ts` (screen-space silhouette fade, tags `userData.isWall`) stays as-is except for the new guard; `OcclusionManager.ts` (raycast fade) needs no changes — it already only iterates currently-visible/candidate meshes.

---

### Task 1: `DollhouseCutaway.ts` shared geometry module

**Files:**
- Create: `src/rendering/DollhouseCutaway.ts`
- Test: `tests/rendering/DollhouseCutaway.test.ts`

**Interfaces:**
- Consumes: `ISO_OFFSET` (a `THREE.Vector3`-like object with `.x`/`.z` fields) from `src/core/CameraRig.ts`.
- Produces (used by Tasks 2 and 4):
  - `export interface XZ { x: number; z: number; }`
  - `export interface CuttableMesh { position: XZ; visible: boolean; userData: Record<string, unknown>; }`
  - `export const DOLLHOUSE_CAM_DIR_XZ: XZ` — normalized camera XZ direction.
  - `export const DEFAULT_CUT_THRESHOLD: number` — `0`.
  - `export function shouldCutForDollhouse(pos: XZ, roomCenterXZ: XZ, threshold?: number): boolean`
  - `export function applyDollhouseCut(mesh: CuttableMesh, roomCenterXZ: XZ, threshold?: number): boolean` — mutates `mesh` in place (sets `visible = false`, `userData.dollhouseCut = true`) and returns `true` if it cut the mesh; returns `false` and leaves the mesh untouched otherwise.

- [ ] **Step 1: Write the failing test**

Create `tests/rendering/DollhouseCutaway.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  shouldCutForDollhouse,
  applyDollhouseCut,
  DOLLHOUSE_CAM_DIR_XZ,
  DEFAULT_CUT_THRESHOLD,
  type CuttableMesh,
} from '@/rendering/DollhouseCutaway';

describe('DollhouseCutaway', () => {
  it('DOLLHOUSE_CAM_DIR_XZ is a unit vector derived from the fixed iso camera offset (14, 20, 14)', () => {
    const len = Math.hypot(DOLLHOUSE_CAM_DIR_XZ.x, DOLLHOUSE_CAM_DIR_XZ.z);
    expect(len).toBeCloseTo(1, 10);
    expect(DOLLHOUSE_CAM_DIR_XZ.x).toBeCloseTo(DOLLHOUSE_CAM_DIR_XZ.z, 10); // 14 == 14 → equal components
    expect(DOLLHOUSE_CAM_DIR_XZ.x).toBeGreaterThan(0);
  });

  it('DEFAULT_CUT_THRESHOLD is 0 (exact half-split)', () => {
    expect(DEFAULT_CUT_THRESHOLD).toBe(0);
  });

  it('returns true for a position on the camera-facing (near) side of the room', () => {
    // Room centred at origin; point at (+2, +2) is toward the camera (+14, +20, +14)
    expect(shouldCutForDollhouse({ x: 2, z: 2 }, { x: 0, z: 0 })).toBe(true);
  });

  it('returns false for a position on the far side of the room', () => {
    expect(shouldCutForDollhouse({ x: -2, z: -2 }, { x: 0, z: 0 })).toBe(false);
  });

  it('returns false exactly on the threshold plane (strict > comparison)', () => {
    // (2, -2) relative to origin: dot = 2*0.707 + -2*0.707 = 0
    expect(shouldCutForDollhouse({ x: 2, z: -2 }, { x: 0, z: 0 })).toBe(false);
  });

  it('classifies relative to a non-origin room centre', () => {
    // Room centred at (10, 10); point at (12, 12) is near-side relative to THAT centre
    expect(shouldCutForDollhouse({ x: 12, z: 12 }, { x: 10, z: 10 })).toBe(true);
    expect(shouldCutForDollhouse({ x: 8, z: 8 }, { x: 10, z: 10 })).toBe(false);
  });

  it('respects a custom threshold', () => {
    // Small near-side offset, cut with threshold 0 but not with threshold 5
    expect(shouldCutForDollhouse({ x: 1, z: 1 }, { x: 0, z: 0 }, 0)).toBe(true);
    expect(shouldCutForDollhouse({ x: 1, z: 1 }, { x: 0, z: 0 }, 5)).toBe(false);
  });

  it('samples roughly half of a ring of points as cut (circular room case)', () => {
    const N = 36;
    let cutCount = 0;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const pos = { x: Math.cos(angle) * 5, z: Math.sin(angle) * 5 };
      if (shouldCutForDollhouse(pos, { x: 0, z: 0 })) cutCount++;
    }
    expect(cutCount).toBeGreaterThan(N * 0.4);
    expect(cutCount).toBeLessThan(N * 0.6);
  });

  it('applyDollhouseCut hides and tags a near-side mesh, returns true', () => {
    const mesh: CuttableMesh = { position: { x: 2, z: 2 }, visible: true, userData: {} };
    const result = applyDollhouseCut(mesh, { x: 0, z: 0 });
    expect(result).toBe(true);
    expect(mesh.visible).toBe(false);
    expect(mesh.userData.dollhouseCut).toBe(true);
  });

  it('applyDollhouseCut leaves a far-side mesh untouched, returns false', () => {
    const mesh: CuttableMesh = { position: { x: -2, z: -2 }, visible: true, userData: {} };
    const result = applyDollhouseCut(mesh, { x: 0, z: 0 });
    expect(result).toBe(false);
    expect(mesh.visible).toBe(true);
    expect(mesh.userData.dollhouseCut).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rendering/DollhouseCutaway.test.ts`
Expected: FAIL — `Cannot find module '@/rendering/DollhouseCutaway'` (module doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/rendering/DollhouseCutaway.ts`:

```ts
/**
 * DollhouseCutaway.ts
 *
 * Pure, dependency-free geometry helper for the "dollhouse" static wall
 * cutaway used by indoor room rendering (BlueprintRenderer, InteriorGenerator).
 *
 * The game's camera (CameraRig) is a fixed isometric rig that never rotates,
 * so which side of a room faces the camera is a static, precomputable fact.
 * This module classifies a wall/decor position as "near side" (hide it) or
 * "far side" (keep it) relative to its room's XZ centroid.
 *
 * See docs/superpowers/specs/2026-07-29-indoor-dollhouse-occlusion-design.md
 */

import { ISO_OFFSET } from '@/core/CameraRig';

export interface XZ {
  x: number;
  z: number;
}

/** Structural THREE.Mesh subset — kept dependency-free from three.js. */
export interface CuttableMesh {
  position: XZ;
  visible: boolean;
  userData: Record<string, unknown>;
}

const _len = Math.hypot(ISO_OFFSET.x, ISO_OFFSET.z);

/** Normalized XZ camera direction — precomputed once from the fixed iso rig. */
export const DOLLHOUSE_CAM_DIR_XZ: XZ = Object.freeze({
  x: ISO_OFFSET.x / _len,
  z: ISO_OFFSET.z / _len,
});

/** Default split threshold — an exact half-split of the room. Exposed as a
 *  named constant so behavior can be tuned without touching call sites. */
export const DEFAULT_CUT_THRESHOLD = 0;

/**
 * Returns true if `pos` sits on the camera-facing (near) side of a room
 * whose horizontal centre is `roomCenterXZ` — i.e. should be hidden for the
 * dollhouse cutaway effect. Boundary case (`dot === threshold`) resolves to
 * false (kept visible).
 */
export function shouldCutForDollhouse(
  pos: XZ,
  roomCenterXZ: XZ,
  threshold: number = DEFAULT_CUT_THRESHOLD,
): boolean {
  const dx = pos.x - roomCenterXZ.x;
  const dz = pos.z - roomCenterXZ.z;
  const dot = dx * DOLLHOUSE_CAM_DIR_XZ.x + dz * DOLLHOUSE_CAM_DIR_XZ.z;
  return dot > threshold;
}

/**
 * Applies the cutaway rule to a mesh in place: hides it and tags
 * `userData.dollhouseCut = true` if it's on the near side. No-op (returns
 * false, leaves mesh untouched) if it's on the far side.
 */
export function applyDollhouseCut(
  mesh: CuttableMesh,
  roomCenterXZ: XZ,
  threshold: number = DEFAULT_CUT_THRESHOLD,
): boolean {
  if (!shouldCutForDollhouse(mesh.position, roomCenterXZ, threshold)) return false;
  mesh.visible = false;
  mesh.userData.dollhouseCut = true;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rendering/DollhouseCutaway.test.ts`
Expected: PASS (all 10 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/rendering/DollhouseCutaway.ts tests/rendering/DollhouseCutaway.test.ts
git commit -m "feat: add DollhouseCutaway geometry module for static wall cutaway

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Apply cutaway to `BlueprintRenderer.ts` (live gameplay path — dungeons, towers, buildings)

**Files:**
- Modify: `src/levels/BlueprintRenderer.ts:1-4` (imports), `:605-641` (door frame loop — add `isDoorFrame` tag), new block after `:641` (classification pass)
- Test: `tests/levels/blueprint.test.ts`

**Interfaces:**
- Consumes: `applyDollhouseCut(mesh, roomCenterXZ)` from `@/rendering/DollhouseCutaway` (Task 1). Room centre for any Blueprint is always `{ x: 0, z: 0 }` — confirmed from `cellToWorld()` in `src/levels/blueprint.ts`, which already centres wall/floor placement on the room's own local origin.
- Produces: wall/pillar meshes (`userData.isWall === true`) and door-frame meshes (`userData.isDoorFrame === true`, new tag) get `visible = false` + `userData.dollhouseCut = true` when on the camera-facing side. Consumed by Task 3 (`WallOcclusionManager.ts`) and Task 4 has no dependency on this file.

- [ ] **Step 1: Write the failing test**

Add to `tests/levels/blueprint.test.ts`, after the existing `describe('renderBlueprint', ...)` block (which ends around the `dispose()` test):

```ts
describe('dollhouse cutaway (BlueprintRenderer)', () => {
  it('hides the near-camera-side wall tile and keeps the far-side one visible', () => {
    const physics = makeMockPhysics();
    const room = renderBlueprint(VALID_BP, physics as never);
    const wallMeshes = room.group.children.filter(
      (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.userData.isWall === true,
    );

    // Near corner: grid (2,2) → world (2,2) → dot > 0 → cut/hidden
    const nearWall = wallMeshes.find((m) => m.position.x === 2 && m.position.z === 2);
    expect(nearWall).toBeDefined();
    expect(nearWall!.visible).toBe(false);
    expect(nearWall!.userData.dollhouseCut).toBe(true);

    // Far corner: grid (0,0) → world (-2,-2) → dot < 0 → kept visible
    const farWall = wallMeshes.find((m) => m.position.x === -2 && m.position.z === -2);
    expect(farWall).toBeDefined();
    expect(farWall!.visible).toBe(true);
    expect(farWall!.userData.dollhouseCut).toBeUndefined();
  });

  it('still creates a physics body for a hidden (cutaway) wall — collision unaffected', () => {
    const physics = makeMockPhysics();
    renderBlueprint(VALID_BP, physics as never);
    // Same 7 bodies as the pre-cutaway baseline test: 5 wall tiles + 1 floor + 1 interactable
    expect(physics.createStaticBox).toHaveBeenCalledTimes(7);
  });

  it('hides door frame posts/lintel when the door is on the camera-facing side', () => {
    const physics = makeMockPhysics();
    const room = renderBlueprint(VALID_BP, physics as never);
    const doorFrameMeshes = room.group.children.filter(
      (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.userData.isDoorFrame === true,
    );
    // VALID_BP's door is at grid (1,2) → world (0,2) → dot = 2*0.707 > 0 → cut
    expect(doorFrameMeshes.length).toBeGreaterThan(0);
    for (const m of doorFrameMeshes) {
      expect(m.visible).toBe(false);
      expect(m.userData.dollhouseCut).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/levels/blueprint.test.ts`
Expected: FAIL — `nearWall.visible` is `true` (not yet hidden) and door frame meshes have no `isDoorFrame` tag (`doorFrameMeshes.length` is `0`).

- [ ] **Step 3: Write minimal implementation**

In `src/levels/BlueprintRenderer.ts`, add the import near the top (after the existing `cellToWorld` import at line 4):

```ts
import { cellToWorld } from './blueprint';
import { applyDollhouseCut } from '@/rendering/DollhouseCutaway';
```

Tag the door frame meshes — replace the `group.add(postA, postB, lintelMesh);` line (around line 631) with tagging first:

```ts
    postA.userData.isDoorFrame = true;
    postB.userData.isDoorFrame = true;
    lintelMesh.userData.isDoorFrame = true;
    group.add(postA, postB, lintelMesh);
```

Immediately after the closing `}` of the `for (const door of bp.doors)` loop (right before the `// ── Interactables ─────` comment, around line 641-643), add the classification pass:

```ts
  }

  // ── Dollhouse cutaway ──────────────────────────────────────────────────
  // Permanently hide the camera-facing side of the room: walls, pillars, and
  // door frames beyond the room's own centroid relative to the fixed iso
  // camera direction. Room centre is always local (0,0) — cellToWorld()
  // already centres every Blueprint's own coordinate space on its origin.
  // Physics bodies created above are untouched; only the visual mesh is hidden.
  const roomCenterXZ = { x: 0, z: 0 };
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!(mesh.userData.isWall === true || mesh.userData.isDoorFrame === true)) return;
    applyDollhouseCut(mesh, roomCenterXZ);
  });

  // ── Interactables ─────────────────────────────────────────────────────
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/levels/blueprint.test.ts`
Expected: PASS (all tests in the file green, including the 3 new dollhouse cutaway tests and the pre-existing 7-bodies/wall-position tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/levels/BlueprintRenderer.ts tests/levels/blueprint.test.ts
git commit -m "feat: apply dollhouse cutaway to BlueprintRenderer walls and door frames

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Guard `WallOcclusionManager.ts` against re-showing permanently-cut meshes

**Files:**
- Modify: `src/rendering/WallOcclusionManager.ts:80-86` (mesh collection filter)
- Test: `tests/rendering/WallOcclusionManager.test.ts`

**Interfaces:**
- Consumes: `userData.dollhouseCut === true` tag produced by Task 2 (and, if implemented, Task 4).
- Produces: no new exports; behavior-only change to `WallOcclusionManager.update()`.

**Why this is needed:** without the guard, if a `dollhouseCut` mesh happens to also fall within the player's on-screen silhouette (it's already `visible = false`, so hiding it again this frame is a no-op), the manager still adds it to its internal `_hidden` set. On the *next* frame's restore step (`for (const mesh of this._hidden) mesh.visible = true;`), it would be wrongly set back to `visible = true` — undoing the permanent cutaway. The guard prevents the mesh from ever entering `_hidden` in the first place.

- [ ] **Step 1: Write the failing test**

Add to `tests/rendering/WallOcclusionManager.test.ts`, after the existing `'update() is idempotent...'` test, before the closing `});` of the `describe('WallOcclusionManager', ...)` block:

```ts
  it('never restores a wall permanently hidden by dollhouse cutaway, even if it overlaps the player silhouette', () => {
    // Same position as the "hides a wall mesh" test — would normally be
    // detected as occluding — but pre-hidden and tagged dollhouseCut.
    const wall = makeWall(0, 4);
    wall.visible = false;
    wall.userData.dollhouseCut = true;
    const room   = makeRoomGroup(wall);
    const camera = cameraAt(0, 1.5, 8);
    const player = playerAt(0, 0, 0);

    room.updateMatrixWorld(true);
    mgr.update(camera, player, room);
    expect(wall.visible).toBe(false);

    // Second frame: if the mesh had been added to _hidden, this restore
    // step would incorrectly flip it back to visible. It must not.
    mgr.update(camera, player, room);
    expect(wall.visible).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rendering/WallOcclusionManager.test.ts`
Expected: FAIL — `wall.visible` is `true` after the second `update()` call (the existing restore-then-rehide cycle flips it back).

- [ ] **Step 3: Write minimal implementation**

In `src/rendering/WallOcclusionManager.ts`, update the mesh collection filter (around line 80-83):

```ts
    // ── Collect tagged meshes (walls + pillars share userData.isWall = true) ─
    const wallMeshes: THREE.Mesh[] = [];
    roomGroup.traverse((obj) => {
      if (
        (obj as THREE.Mesh).isMesh &&
        obj.userData.isWall === true &&
        obj.userData.dollhouseCut !== true
      ) {
        wallMeshes.push(obj as THREE.Mesh);
      }
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rendering/WallOcclusionManager.test.ts`
Expected: PASS (all tests in the file green, including the new dollhouse guard test).

- [ ] **Step 5: Commit**

```bash
git add src/rendering/WallOcclusionManager.ts tests/rendering/WallOcclusionManager.test.ts
git commit -m "fix: guard WallOcclusionManager against re-showing dollhouse-cut walls

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Apply cutaway to `InteriorGenerator.ts` and remove building ceilings (showroom/creative preview path)

**Files:**
- Modify: `src/world/buildings/InteriorGenerator.ts:1-20` (imports), `:411-537` (`buildWallSurfaces` — tag door/window decor, add classification call), `:540-556` (delete `buildCeiling` function entirely), `:733-736` (remove `buildCeiling(...)` call site)
- Test: `tests/world/InteriorGenerator.test.ts`

**Interfaces:**
- Consumes: `applyDollhouseCut(mesh, roomCenterXZ)` from `@/rendering/DollhouseCutaway` (Task 1). Room centre for a `HousePlan` is `{ x: plan.w / 2, z: plan.d / 2 }` — confirmed from `buildCeiling()`'s own `ceil.position.set(plan.w / 2, h - 0.05, plan.d / 2)` and the fact all wall/door/window meshes in `buildWallSurfaces` are placed in the same un-centred plan-space grid (0..plan.w, 0..plan.d) before the later `g.position.set(cx, 0, cz)` centering offset is applied to the whole group.
- Produces: wall-face, door-trim, and window meshes get `userData.dollhouseCut = true` + hidden when on the camera-facing side. No ceiling mesh is ever added. `occluderMeshes` (already collected via `root.traverse(... userData.isOccluder ...)` at the end of `generateInterior`) will simply contain fewer/different meshes (no ceiling/beams) and some already-hidden ones — no interface change to `InteriorScene` itself.
- **Note:** this file's mesh builder (`buildWallSurfaces`/`buildCeiling`) is used only by `src/showroom.ts` and `src/creative/backroomScenes.ts` (preview/creative tools) — confirmed no call sites in `src/main.ts`. Live gameplay building interiors render via `buildingToDungeonPlan.ts` → `BlueprintRenderer.renderBlueprint` (Task 2). This task keeps the preview tools visually consistent with the live game but has no gameplay-collision impact.

- [ ] **Step 1: Write the failing test**

Add to `tests/world/InteriorGenerator.test.ts` (adjust the `describe`/`makeDna` helper names to match whatever already exists in the file — read the file's existing helper signature first if it differs):

```ts
describe('dollhouse cutaway (InteriorGenerator)', () => {
  it('produces no ceiling mesh', () => {
    const scene = generateInterior(makeDna('house'));
    let ceilingCount = 0;
    scene.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).geometry instanceof THREE.PlaneGeometry) {
        // Ceiling was the only horizontal PlaneGeometry mesh other than the floor;
        // floor uses layFloorSurface's own geometry — check no isOccluder plane
        // sits at y > 1 (ceiling height), which only a ceiling mesh would.
        if (obj.userData.isOccluder && (obj as THREE.Mesh).position.y > 1) ceilingCount++;
      }
    });
    expect(ceilingCount).toBe(0);
  });

  it('hides some near-camera-side wall-surface meshes and keeps some far-side ones visible', () => {
    const scene = generateInterior(makeDna('house'));
    const occluders: THREE.Mesh[] = [];
    scene.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && obj.userData.isOccluder) occluders.push(obj as THREE.Mesh);
    });
    const hidden  = occluders.filter((m) => m.userData.dollhouseCut === true);
    const visible = occluders.filter((m) => m.userData.dollhouseCut !== true);
    expect(hidden.length).toBeGreaterThan(0);
    expect(visible.length).toBeGreaterThan(0);
    for (const m of hidden) expect(m.visible).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/InteriorGenerator.test.ts`
Expected: FAIL — ceiling meshes are still present (`ceilingCount` > 0) and no mesh has `userData.dollhouseCut` set (`hidden.length` is `0`).

- [ ] **Step 3: Write minimal implementation**

In `src/world/buildings/InteriorGenerator.ts`, add the import after the existing imports near the top:

```ts
import { buildProp } from '@/prop-creator/builder';
import type { PropKind, PropMaterial, PropTheme } from '@/prop-creator/types';
import { MATERIAL_COLORS } from '@/prop-creator/types';
import { applyDollhouseCut } from '@/rendering/DollhouseCutaway';
```

In `buildWallSurfaces` (around line 447), tag decor meshes so they participate in classification. First, the door-trim posts/lintel (inside the `for (const [dx, dz, isNS] of ...)` arch-detection loop, around lines 466-476) — add `.userData.isOccluder = true;` to each created mesh:

```ts
        if (isNS) {
          // Door runs along X axis — posts at left and right ends of the tile gap
          const pz = nz + 0.5;
          for (const px2 of [nx, nx + 1]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(postW, postH, postW), trimMat);
            post.position.set(px2, postH / 2, pz); post.userData.isOccluder = true; g.add(post);
          }
          // Lintel above
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(1 + postW, postW, postW * 1.5), trimMat);
          lintel.position.set(nx + 0.5, postH, pz); lintel.userData.isOccluder = true; g.add(lintel);
        } else {
          // Door runs along Z axis
          const px2 = nx + 0.5;
          for (const pz2 of [nz, nz + 1]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(postW, postH, postW), trimMat);
            post.position.set(px2, postH / 2, pz2); post.userData.isOccluder = true; g.add(post);
          }
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(postW * 1.5, postW, 1 + postW), trimMat);
          lintel.position.set(px2, postH, nz + 0.5); lintel.userData.isOccluder = true; g.add(lintel);
        }
```

Next, the window glass/frame meshes (around lines 480-499) — add `.userData.isOccluder = true;` to `glass` and each `fr` frame piece:

```ts
        if (isNS) {
          const wz = dz < 0 ? z + wOff : z + 1 - wOff;
          // Glass
          const glass = new THREE.Mesh(new THREE.BoxGeometry(0.55, wH, 0.04), glassMat);
          glass.position.set(x + 0.5, wBot + wH / 2, wz); glass.userData.isOccluder = true; g.add(glass);
          // Frame
          for (const [fw, fh, fx2, fz2] of [
            [0.59, 0.05, x + 0.5, wz],       // top rail
            [0.59, 0.05, x + 0.5, wz],       // bot rail (same pos, offset y below)
            [0.05, wH + 0.05, x + 0.22, wz], // left post
            [0.05, wH + 0.05, x + 0.78, wz], // right post
          ] as [number,number,number,number][]) {
            const fr = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.06), trimMat);
            fr.position.set(fx2, fh === 0.05 ? (fz2 === wz ? wBot + wH + 0.02 : wBot - 0.02) : wBot + wH / 2, fz2);
            fr.userData.isOccluder = true;
            g.add(fr);
          }
        } else {
          const wx = dx < 0 ? x + wOff : x + 1 - wOff;
          const glass = new THREE.Mesh(new THREE.BoxGeometry(0.04, wH, 0.55), glassMat);
          glass.position.set(wx, wBot + wH / 2, z + 0.5); glass.userData.isOccluder = true; g.add(glass);
          for (const [fw, fh, fx2, fz2] of [
            [0.06, 0.05, wx, z + 0.5],
            [0.06, wH + 0.05, wx, z + 0.22],
            [0.06, wH + 0.05, wx, z + 0.78],
          ] as [number,number,number,number][]) {
            const fr = new THREE.Mesh(new THREE.BoxGeometry(0.06, fh, fw), trimMat);
            fr.position.set(fx2, fh === 0.05 ? wBot + wH + 0.02 : wBot + wH / 2, fz2);
            fr.userData.isOccluder = true;
            g.add(fr);
          }
        }
```

At the very end of `buildWallSurfaces` (right before its closing `}`, after the outer `for (let z ...) { for (let x ...) { ... } }` double loop), add the classification pass:

```ts
    }
  }

  // ── Dollhouse cutaway ──────────────────────────────────────────────────
  // Permanently hide the camera-facing side of the building: wall faces,
  // door trim, and window glass/frames beyond the plan's own centroid.
  // All meshes above are placed in plan-space (0..plan.w, 0..plan.d) before
  // the later g.position centering offset, so the room centre here is the
  // plan's own midpoint, not (0,0).
  const roomCenterXZ = { x: plan.w / 2, z: plan.d / 2 };
  g.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.isOccluder !== true) return;
    applyDollhouseCut(mesh, roomCenterXZ);
  });
}
```

Delete the entire `buildCeiling` function (lines 540-556):

```ts
function buildCeiling(g: THREE.Group, plan: HousePlan, style: StyleProfile, h: number): void {
  const ceilMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(style.wallDark), side: THREE.BackSide });
  const ceil    = new THREE.Mesh(new THREE.PlaneGeometry(plan.w, plan.d), ceilMat);
  ceil.rotation.x = -Math.PI / 2;
  ceil.position.set(plan.w / 2, h - 0.05, plan.d / 2);
  ceil.userData.isOccluder = true; ceil.userData._origOpacity = 1;
  g.add(ceil);

  // Timber beam runners (visual only)
  const beamMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(style.woodDark) });
  const beamSpacing = Math.max(2, Math.floor(plan.w / 3));
  for (let bx = beamSpacing; bx < plan.w; bx += beamSpacing) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, plan.d), beamMat);
    beam.position.set(bx, h - 0.14, plan.d / 2);
    beam.userData.isOccluder = true; beam.userData._origOpacity = 1;
    g.add(beam);
  }
}
```

Remove this call site in `generateInterior` (around line 735):

```ts
  // Floor / walls / ceiling
  layFloorSurface(g, plan, style);
  buildWallSurfaces(g, plan, style, h);
  buildCeiling(g, plan, style, h);
```

becomes:

```ts
  // Floor / walls — buildWallSurfaces applies its own dollhouse cutaway pass;
  // buildings never render a ceiling (matches the full open-top dollhouse view).
  layFloorSurface(g, plan, style);
  buildWallSurfaces(g, plan, style, h);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/InteriorGenerator.test.ts`
Expected: PASS (all tests in the file green, including the 2 new dollhouse cutaway tests).

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — no test elsewhere depends on `buildCeiling` or on ceiling meshes existing in `InteriorGenerator` output (confirmed via `grep -n "ceiling" tests/world/InteriorGenerator.test.ts` returning no matches before this task started).

- [ ] **Step 6: Commit**

```bash
git add src/world/buildings/InteriorGenerator.ts tests/world/InteriorGenerator.test.ts
git commit -m "feat: apply dollhouse cutaway to InteriorGenerator, remove building ceilings

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Manual verification pass

**Files:** none (verification only — no code changes expected; this task exists to close the design's E2E testing intent without introducing new Playwright infrastructure mid-plan).

**Interfaces:**
- Consumes: the running dev build (`npm run dev` or equivalent existing script — check `package.json` `scripts` block for the exact command already used in this project) with a building interior and a dungeon/tower room reachable in-game.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (or the project's existing equivalent — check `package.json`)
Expected: server starts without compile errors from Tasks 1-4's changes.

- [ ] **Step 2: Enter a building interior in-game**

Walk into any building. Confirm:
- The near (camera-facing) walls and door frame of the entered room are gone — you can see into the room from outside/above like a dollhouse.
- No ceiling is visible in the interior.
- Walking toward where the hidden wall would be still stops the player (collision intact) except through the actual door gap.

- [ ] **Step 3: Enter a dungeon or tower room**

Confirm the same cutaway behavior on `BlueprintRenderer`-rendered dungeon/tower rooms: near-side walls and any door frames are statically hidden, far-side walls remain, collision on hidden walls still blocks movement.

- [ ] **Step 4: Stop the dev server**

Stop the process (`Ctrl+C` or `stop_bash` if run via the async bash tool).

No commit for this task — verification only.

---

## Post-plan follow-ups (already tracked, not part of this plan)

- `bug-building-collider-lost-on-exit` — exterior building collider disappears after exiting an interior once.
- `followup-indoor-room-size` — interior rooms need a ~3x scale-up so they feel less cramped.
- Vegetation/tile visual variance (DNA-style tree/stone/bush generation) — queued after the above two.
