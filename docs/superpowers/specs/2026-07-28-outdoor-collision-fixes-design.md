# Outdoor Collision Fixes — Design Spec

Date: 2026-07-28
Status: Approved

## Problem

Two related collision bugs in the overworld (`src/scene/OverworldScene.ts`):

1. **Buildings have no physics collider at all.** Settlement and studio-preview
   buildings are pushed into `_buildingGroups`/`_buildingData` for rendering,
   but no Rapier collider is ever created for them. The player walks straight
   through every house.

2. **Terrain collision mismatches the visual mesh at elevation edges/slopes.**
   `_buildTerrain()` renders **blocky steps**: each tile is a flat top quad at
   `elevation * SH`, with a vertical wall face added wherever a neighboring
   tile's elevation is lower (see the `addFace` calls in `_buildTerrain()`).
   But `_createTerrainCollider()` builds a Rapier **heightfield**, which
   *smoothly interpolates* between per-tile elevation samples instead of
   stepping. At elevation transitions, the physical surface sits at a
   different height/slope than the rendered cliff face, so the player can
   clip through what looks like solid ground — reported as "walking through
   a bush" around slopes/edges.

A corollary bug, only surfaced by fixing (1): `getNearestBuilding(pos, maxDist)`
(used for the "press E to enter" prompt) measures distance from the player to
the building's **center point**, with a hardcoded `maxDist = 4`. Building
depths range 3–14 world units (`SIZE_FOOTPRINT`/`KIND_FOOTPRINT` in
`BuildingDNA.ts`), so for large buildings (half-depth > 4) the front door is
already farther than `maxDist` from the center. Today this doesn't matter
because the player can walk *into* the building's volume (no collider) to get
within range. Once buildings are solid, this would silently break entry on
every building bigger than ~8×8.

## Goals

- Buildings block player movement (solid collision matching their footprint).
- Terrain collision exactly matches the rendered blocky-step terrain — no
  clipping at elevation edges/slopes.
- Building entry ("press E") continues to work at every building size once
  buildings become solid.
- No change to existing tree/rock/tower colliders, `PhysicsWorld` culling, or
  the settlement-boundary-crossing system.

## Non-Goals

- Custom per-building-kind collision shapes (e.g. porches, chimneys, bay
  windows carved out precisely) — a single bounding box per building is the
  accepted simplification.
- Changing how buildings are visually authored, their footprint tables, or
  floor heights.
- Reworking the terrain heightfield/elevation data model itself (`WorldGrid`)
  — only the physics *representation* of the existing elevation data changes.
- Dungeon/tower/building-interior collision (separate systems, out of scope
  for this spec — the tower's own capsule collider at world origin is
  untouched).

## Design

### 1. Terrain collider: heightfield → trimesh

Refactor `_buildTerrain()` to separate geometry construction from
`THREE.BufferGeometry` wrapping: extract a private helper (e.g.
`_buildTerrainGeometryData(): { positions: number[]; normals: number[]; colors: number[]; indices: number[] }`)
that both `_buildTerrain()` (visual mesh) and a new
`_createTerrainCollider()` consume — the same `positions`/`indices` arrays
back both. This guarantees visual and physical terrain can never diverge,
including future terrain-shape changes.

`_createTerrainCollider()` converts `positions`/`indices` to typed arrays
(`Float32Array`/`Uint32Array`) and calls a new `PhysicsWorld` factory method:

```ts
/** Create a fixed static trimesh collider from raw vertex/index buffers.
 *  Used for terrain — guarantees physics exactly matches the render mesh. */
createStaticTrimesh(vertices: Float32Array, indices: Uint32Array): RAPIER.RigidBody {
  const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  this.world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices), body);
  return body;
}
```

No changes to the ground plane (`createGroundPlane`), tower capsule, or
tree/rock colliders.

### 2. Building collider: rotated box per building

At both building-placement call sites in `OverworldScene.ts`
(`_buildSettlements()` and `_buildStudioSettlementPreview()`), immediately
after `buildBuilding(dna)` and positioning `grp`, add:

```ts
const fp = getFootprint(dna.buildingKind, dna.size);
const halfH = (dna.floors * FLOOR_HEIGHT) / 2;
const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), grp.rotation.y);
this._staticBodies.push(
  this.physics.createStaticRotatedBox(
    new THREE.Vector3(wx, wy + halfH, wz),
    rotQuat,
    new THREE.Vector3(fp.w / 2, halfH, fp.d / 2),
  ),
);
```

This reuses the existing `PhysicsWorld.createStaticRotatedBox()` helper
(already used elsewhere) — no new physics API needed for this part. Building
meshes are authored centered at local origin (`x ∈ [-w/2, w/2]`,
`z ∈ [-d/2, d/2]`), matching the box exactly.

`_staticBodies` already gets torn down on scene exit/dispose alongside
tree/rock/terrain bodies — no lifecycle changes needed.

### 3. Interaction-distance fix: closest-point-on-box, not center distance

Add a pure helper (new file or alongside `BuildingDNA.ts` —
implementation task decides placement, suggest `src/world/buildings/BuildingCollision.ts`
to keep it colocated with the footprint/geometry data it depends on):

```ts
/** Closest point on an axis-aligned box (halfExtents, centered at origin,
 *  rotated by rotationY around Y) to a world-space point `p`. Distance is
 *  measured in the XZ plane only (Y ignored — buildings are always upright). */
export function closestDistanceToBuildingFootprint(
  p: { x: number; z: number },
  center: { x: number; z: number },
  halfExtents: { w: number; d: number },
  rotationY: number,
): number {
  // Transform p into the box's local (unrotated) space, clamp to half-extents,
  // transform back, return Euclidean distance.
}
```

`getNearestBuilding(pos, maxDist)` changes its per-building distance check
from `Math.hypot(dx, dz)` (to `bd.pos`) to
`closestDistanceToBuildingFootprint(pos, bd.pos, getFootprint(bd.dna.buildingKind, bd.dna.size), bd.rotationY)`.
This requires `_buildingData` entries to also carry the building's `rotationY`
(currently only `dna`, `pos`, `faction` are stored) — add that field at both
push sites, using the same rotation value already applied to `grp.rotation.y`.

`maxDist` stays `4` at call sites in `main.ts` — semantics change from "4
units from center" to "4 units from the wall," which is the intended, more
consistent behavior across all building sizes.

## Error Handling / Edge Cases

- **Trimesh construction cost**: built once per scene `enter()`, same as the
  heightfield today — no runtime cost change, just a different Rapier
  collider type.
- **Rotation edge cases** in `closestDistanceToBuildingFootprint`: must
  correctly handle `rotationY` values that aren't multiples of `π/2` (some
  studio-preview buildings use `(seed % 4) * (π/2)`, but settlement buildings
  use arbitrary `plan.buildings[].rotation` — verify against actual data, the
  helper must work for any angle, not just cardinal rotations).
- **Studio preview buildings** (`_buildStudioSettlementPreview()`) currently
  have `grp.userData['studioPreview'] = true` and are dev-only — they still
  get the same collider treatment for consistency (no gameplay reason to
  exclude them; the studio is used with dev-shortcut cheats where solid
  buildings are expected too).
- **Building interiors**: entering a building transitions to a separate
  interior scene (unrelated to `OverworldScene`'s Rapier world) — the new
  exterior box collider has no interaction with interior collision.

## Testing

- **Unit tests** (`tests/world/BuildingCollision.test.ts` or similar):
  - `closestDistanceToBuildingFootprint()` — zero rotation cases (point
    inside box → 0, point outside on each axis → expected offset), 90°/180°
    rotation, and an arbitrary non-cardinal rotation, verified against
    hand-computed expected distances.
  - `_buildTerrainGeometryData()` (or equivalent extracted function) —
    characterization test confirming the extracted geometry-building function
    produces the same `positions`/`indices` counts and values as the
    pre-refactor `_buildTerrain()` did for a small fixed `WorldGrid` fixture
    (regression guard against silently diverging visual/physics buffers in
    the future).
- **E2e (Playwright)**, extending the existing dev-hook pattern
  (`window.__game`):
  - Teleport the player toward a known building's wall (from a spawned
    settlement or studio preview) and assert the player's resulting position
    stops short of the wall's inner face (collision blocks movement) rather
    than passing through to the building's center.
  - From just outside that same wall (within the new distance-to-surface
    threshold), assert `getNearestBuilding()` / the "press E" prompt still
    triggers.
  - Teleport the player near a known elevation transition (cliff edge) and
    assert they don't fall through or embed into the terrain — read back
    player Y position and compare against the expected stepped elevation
    (not an interpolated in-between value).

## Files Touched (expected)

- `src/scene/OverworldScene.ts` — extract terrain geometry-building helper;
  add building colliders at both placement sites; store `rotationY` in
  `_buildingData`; update `getNearestBuilding()`.
- `src/physics/PhysicsWorld.ts` — add `createStaticTrimesh()`.
- `src/world/buildings/BuildingCollision.ts` (new) — the closest-point helper.
- `tests/world/BuildingCollision.test.ts` (new) — unit tests.
- `tests/scene/OverworldScene-terrain.test.ts` or similar (new, small) —
  geometry-extraction characterization test.
- `tests/e2e/outdoor-collision.spec.ts` (new) — e2e verification.
