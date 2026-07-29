# Indoor "Dollhouse" Occlusion — Design Spec

**Date:** 2026-07-29
**Status:** Approved
**Author:** Copilot CLI (collaborative design with project owner)

## Problem

Building/dungeon/tower interiors currently rely on `WallOcclusionManager`, a
per-frame screen-space system that hides walls only when they overlap the
player's on-screen silhouette. This means walls between the camera and the
room's interior pop visible/invisible as the player moves, and doesn't
reliably clear the room enough to feel open — it still reads as "inside a
small cell" rather than the classic isometric "dollhouse" cutaway look used
by games like *Diablo*, *The Sims*, and *Baldur's Gate*.

The camera in this project is a **fixed isometric orthographic rig**
(`CameraRig`, `ISO_OFFSET = (14, 20, 14)`, never rotates). Because the
viewing angle never changes, which walls of any given room *always* sit
between the camera and the interior is a static, computable fact — it does
not need to be re-evaluated every frame or per-player-position.

## Goals

- Always hide the walls (and ceiling, for buildings) that sit on the
  camera-facing side of a room, regardless of player position — a permanent
  cutaway, not a dynamic per-frame fade.
- Generalize to rectangular building rooms, circular dungeon/tower rings,
  and irregular/L-shaped rooms with a single geometric rule.
- Decor mounted on a cut wall (door frames, window frames, torches,
  banners) disappears along with its wall — no floating props.
- Ceilings are always removed for building interiors (dungeons/towers
  already have no ceiling mesh).
- Collision is unaffected — cut walls remain solid; players can only pass
  through actual door/opening gaps, exactly as today.
- No added per-frame cost for the common case; keep the existing dynamic
  `WallOcclusionManager` only as a fallback for residual cases (e.g. a
  mid-room pillar that ends up between camera and player).

## Non-Goals

- Camera rotation / orbiting (camera is and remains fixed-angle).
- Changing door/opening placement logic.
- Building/dungeon/tower interior room *sizing* (tracked separately as a
  follow-up item).
- Fixing the building-collider-lost-on-exit regression (tracked separately).

## Approach

### Geometric rule

Because the camera direction is fixed, "does this wall occlude the room's
interior" reduces to: *is this wall on the camera-facing half of the room,
relative to the room's center?*

```
camDirXZ = normalize(ISO_OFFSET.x, ISO_OFFSET.z)   // constant, precomputed once

shouldCut(pos, roomCenterXZ) =
    dot(pos.xz - roomCenterXZ, camDirXZ) > CUT_THRESHOLD
```

This single dot-product test is evaluated per wall/pillar/door-frame/window
instance against its own room's XZ centroid. It generalizes correctly to:
- **Rectangular rooms** — cuts the two walls on the camera-facing corner
  (matches the "south/east" walls given current `ISO_OFFSET`).
- **Circular tower rings** — cuts the near arc of wall segments; the far
  arc remains, exactly like a dollhouse cutaway cylinder.
- **L-shaped / multi-room interiors** — evaluated per room (each room's own
  centroid), so each room independently gets its near-side walls cut, even
  if rooms are offset from each other.

`CUT_THRESHOLD` defaults to `0` (an exact half-split). This is exposed as a
named constant so it can be tuned later without touching call sites.

### New shared module: `src/rendering/DollhouseCutaway.ts`

A small, pure, dependency-free module (no THREE.js scene coupling) so it's
trivially unit-testable:

```ts
export const DOLLHOUSE_CAM_DIR_XZ: { x: number; z: number }; // derived from ISO_OFFSET, normalized

export function shouldCutForDollhouse(
  pos: { x: number; z: number },
  roomCenterXZ: { x: number; z: number },
  threshold?: number, // defaults to 0
): boolean;
```

`DOLLHOUSE_CAM_DIR_XZ` is computed from `ISO_OFFSET` imported from
`CameraRig.ts` (read-only import, no circular dependency — `CameraRig`
does not import from `DollhouseCutaway`).

### Integration point 1: `BlueprintRenderer.ts` (dungeons & towers)

After all wall/pillar/door-frame meshes for a room are constructed and
added to the group (existing loop over `bp.tiles` and `bp.doors`), run a
single post-process pass:

1. Compute the room's XZ centroid from `bp` bounds (already available as
   `width`/`depth`/`cellToWorld`).
2. For each mesh tagged `userData.isWall === true` (walls, pillars —
   already tagged today) or `userData.isDoorFrame === true` (new tag added
   to the post/lintel meshes at door openings), call `shouldCutForDollhouse`
   with the mesh's world XZ position.
3. If true: set `mesh.visible = false` and `mesh.userData.dollhouseCut =
   true`. Existing physics bodies for that wall are left untouched (created
   earlier in the same function, independent of the visual mesh).

For circular rings (used by some dungeon/tower room shapes per the
existing "corner pilasters" logic), the same per-tile classification
naturally cuts the near arc without any special-casing.

### Integration point 2: `InteriorGenerator.ts` (building interiors)

1. `buildWallSurfaces()`: after each wall-face mesh, window, and door-arch
   post/lintel mesh is created, classify it the same way relative to the
   building's XZ centroid (`plan.w/2, plan.d/2`) and hide near-side
   instances, tagging `dollhouseCut = true`.
2. `buildCeiling()`: stop being called unconditionally — building
   interiors never render a ceiling or its timber beams (matches user's
   choice for full open-top dollhouse view). The function is removed (or
   left dead/unused behind a flag if other call sites depend on it —
   verified during implementation).

### Integration point 3: `WallOcclusionManager.ts`

One-line guard added to the per-mesh loop: skip any mesh whose
`userData.dollhouseCut === true` (already permanently hidden, no need to
test/restore it every frame). This keeps the dynamic system purely as a
fallback for meshes that were *not* statically cut (e.g. mid-room pillars,
furniture) — unchanged behavior for those.

### `OcclusionManager.ts` (raycast fade)

No changes needed — it already skips per-mesh via `_isCandidate` checks and
operates on whatever's currently visible; statically-hidden meshes are
simply invisible and excluded automatically.

## Data Flow

```
Room/building generation (BlueprintRenderer / InteriorGenerator)
  → build wall/pillar/door/window meshes + physics colliders (unchanged)
  → NEW: classify each via shouldCutForDollhouse(meshWorldPosXZ, roomCenterXZ)
  → NEW: hide (visible=false, dollhouseCut=true) if near-side
  → group added to scene (visual + physics as before)

Per-frame (gameplay loop, unchanged call sites):
  WallOcclusionManager.update(camera, player, roomGroup)
    → skips meshes with dollhouseCut===true (NEW guard)
    → still dynamically fades any remaining tagged isWall mesh between
      camera and player (fallback case)
  OcclusionManager.update(camera, playerPos)
    → unchanged, operates on whatever's visible
```

## Error Handling / Edge Cases

- **Degenerate/zero-size rooms** (e.g. a 1-tile closet): centroid still
  well-defined; classification still works, no special-casing needed.
- **Meshes exactly on the threshold plane** (`dot == 0`): resolved by a
  strict `>` comparison, consistently placing boundary cases on the
  "kept visible" (far) side — avoids flicker since this is evaluated once,
  not per-frame, so there's no flicker risk regardless.
- **Rooms with no camera-facing wall at all** (e.g. already-open side from
  a corridor): classification simply finds nothing to cut on that side;
  no error.
- **`buildCeiling`'s removal**: if any other code path depends on
  `userData.isOccluder` ceiling meshes existing (e.g. `OcclusionManager`
  candidate list, minimap/lighting logic), verify no runtime error from a
  missing ceiling reference during implementation — grep for `isOccluder`
  ceiling assumptions before removing.

## Testing

- **Unit tests** (`tests/rendering/DollhouseCutaway.test.ts`): pure function
  tests for `shouldCutForDollhouse` — near-side true, far-side false,
  boundary case, plus a circular-arc sample set (points around a ring)
  confirming roughly half are cut.
- **Component tests**: extend/add tests for `BlueprintRenderer` and
  `InteriorGenerator` confirming: (a) a known small blueprint produces the
  expected count of hidden vs visible wall meshes, (b) hidden meshes still
  have a corresponding physics body, (c) no ceiling mesh is added for
  building interiors.
- **E2e**: extend existing interior/building e2e tests to assert the
  camera-facing side of a room is visually absent (e.g. query scene graph
  for `dollhouseCut` count > 0) while player movement is still blocked at
  the same wall position (collision regression check, reusing patterns
  from `tests/e2e/exterior.test.ts`).

## Out of Scope / Follow-ups (already tracked)

- Building collider lost after building exit/re-entry (logged as
  `bug-building-collider-lost-on-exit`).
- Interior room sizing scale-up (logged as `followup-indoor-room-size`).
- Vegetation/tile visual variance (queued after this + room sizing).
