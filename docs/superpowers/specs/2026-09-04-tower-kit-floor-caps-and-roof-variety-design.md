# Tower-Kit Floor Caps & Residential Roof Variety — Design

**Status:** Approved (direct user feedback on the shipped elven treehouse
home, round 9)
**Scope:** `src/world/buildings/StoneTowerKit.ts` and its family
(`ElvenTreehouseKit.ts`), both consumers of `buildTowerKitCore()`.

## Problem

Live in-game screenshot feedback on the elven house/villa/terraced/inn/
blacksmith buildings (all built by `ElvenTreehouseKit.ts` on top of
`StoneTowerKit.ts`'s shared `buildTowerKitCore()`):

1. **"some parts are broken though or very seethrough as there are no
   ground there"** — several buildings show a visible dark/see-through
   gap right where the trunk (wall rings) meets the living-canopy roof
   cap. Root cause: `StoneTowerWallSurface.ts`'s Strategy G wall is a
   genuinely hollow shell — each course is built from individual
   protruding `BoxGeometry` blocks with small mortar gaps between them
   and **no backing wall or floor disc anywhere**. `buildTowerKitCore()`
   never places any solid horizontal surface between rings, so wherever
   the shape ABOVE a ring is narrower than the ring itself, the wider
   ring's own top rim is left as an unfloored ledge — looking through
   the block gaps there reveals the pitch-black hollow interior instead
   of a floor. This is worst at the roof transition specifically because
   `buildLivingRoofCap()`'s "neck" tier starts at `tierRadiusFrac(0) =
   0.5` — literally half the radius of the wall ring it sits on — but the
   same defect exists (to a smaller degree) at every floor boundary
   (every silhouette profile narrows at least slightly floor-to-floor)
   and between the flared base/plinth (`radius * 1.2`) and floor 0
   (`radius`).
2. **"the roofs can be more like the tower design roofs or we could go
   with like a watch tower type roof design of various types"** —
   `ElvenTreehouseKit.ts` currently forces `buildLivingRoofCap()` on
   every single building, unconditionally (see its own doc comment: "a
   residential tree home should always end in a living canopy"). With 7
   buildings visible in one settlement screenshot, that reads as
   monotonous — every roof is the same green-canopy silhouette. The
   sibling `buildElvenStoneTower()` already has 3 structurally distinct
   roof archetypes (`buildClassicRoofCap`, `buildPagodaRoofCap`,
   `buildLivingRoofCap`, dispatched by `pickRoofArchetype()`) that the
   user has already approved for the tower. The user is asking for that
   SAME variety to reach the treehouse family too.

## Fix 1: Floor caps (solid decking at every ring boundary)

Add a new small, focused module (matching this kit's existing
one-concern-per-file convention: `StoneTowerQuoins.ts`,
`StoneTowerBalcony.ts`, `StoneTowerWindows.ts`, etc.):

**`src/world/buildings/StoneTowerFloorCap.ts`** — `buildFloorCap(radius,
material, vertexScales?)`: a flat, filled octagon disc (a triangle fan
from the ring's own center to its 8 `octagonPoints()` corners, verified
by direct computation to already produce a +Y-facing normal with this
winding order — no rotation needed), lying at local `y = 0`. Reuses
`StoneTowerShape.ts`'s existing `octagonPoints()` so a capped floor's
disc always matches that floor's own (possibly jittered) octagon
outline exactly, including any `vertexScales` perturbation.

**Wiring (`buildTowerKitCore()` in `StoneTowerKit.ts`):**
- `buildTowerBase()` gets a floor cap at its own top (`y = plinthHeight`,
  radius = `plinthRadius`), added as a child of the base's own returned
  group — closes the base/floor-0 seam.
- `buildTowerWallRing()` gets a floor cap at its own top (`y =
  ringHeight` LOCAL to that ring's group, radius = that floor's own
  `combinedRadius` + `vertexScales`), added as a child of the ring's own
  returned group — closes every floor-to-floor seam AND the last
  floor's seam into the roof (since the roof is positioned at exactly
  that same world Y).

Both caps are added **inside** the existing returned groups (not as new
top-level siblings in `buildTowerKitCore()`'s own `g`), so no code that
indexes `g.children` by position (an existing test in
`ElvenTreehouseKit.test.ts` explicitly does: `roof = g.children[dna.
floors + 1]`) needs to change — this is a purely internal, additive
change to two already-existing group-building functions.

This fix is shared automatically by BOTH `buildElvenStoneTower()` (the
tower) and `buildElvenTreehouseHome()` (the house family), since both go
through the same `buildTowerKitCore()` → `buildTowerBase()` /
`buildTowerWallRing()` calls. No tower-specific or treehouse-specific
code needed.

**Material choice:** the floor cap reuses `palette.stone` (tower) /
`palette.stone` = the wood material (treehouse) — the same material
already used for that ring's own walls, so a cap reads as "the floor of
this level," not a new decorative material players would notice as
out-of-place.

## Fix 2: Weighted roof variety for the treehouse family

`StoneTowerRoofCap.ts`'s `pickRoofArchetype(seed)` and
`buildTowerRoofCap(seed, radius, coneHeight, palette)` currently
hard-code the tower's own weights (classic 40% / pagoda 35% / living
25%). Both get an optional trailing `weights` parameter (default = the
existing tower table, so `buildElvenStoneTower()`'s call site and its
30 existing tests are untouched):

```ts
export type RoofArchetypeWeights = [RoofArchetype, number][];
export const TOWER_ROOF_ARCHETYPE_WEIGHTS: RoofArchetypeWeights = [
  ['classic', 0.4], ['pagoda', 0.35], ['living', 0.25],
];
export const RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS: RoofArchetypeWeights = [
  ['living', 0.45], ['classic', 0.30], ['pagoda', 0.25],
];
export function pickRoofArchetype(seed: number, weights = TOWER_ROOF_ARCHETYPE_WEIGHTS): RoofArchetype { ... }
export function buildTowerRoofCap(seed, radius, coneHeight, palette, weights = TOWER_ROOF_ARCHETYPE_WEIGHTS): THREE.Group { ... }
```

`RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS` keeps `living` as the plurality
choice (preserves the "living tree home" identity as the MOST common
outcome, per the theme) while giving genuine, already-user-approved
variety via the same `classic`/`pagoda` archetypes the tower uses — this
directly answers "the roofs can be more like the tower design roofs":
they now literally ARE the tower's own roof-building code, just
reweighted. No new 4th archetype is invented — the "watch tower type
roof design of various types" ask is satisfied by reusing the tower's
existing classic/pagoda designs (which already read as watchtower-style
peaked roofs) rather than adding a bespoke fourth structure, keeping
scope tight and reusing already-approved, tested code.

`ElvenTreehouseKit.ts`'s `buildElvenTreehouseHome()` changes its roof
closure from an unconditional `buildLivingRoofCap()` call to:

```ts
(seed, r, h, p) => buildTowerRoofCap(seed, r, h, { shingle: p.shingle, leaf: p.leaf, bark: p.bark }, RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS)
```

Since `palette.shingle` is already populated with the same wood material
as `palette.stone` (see that file's own doc comment: "`shingle` is
unused... but still populated to satisfy the shared interface" — no
longer true after this change, it becomes genuinely used), the
classic/pagoda roof bands render in the same wood tone as the walls
below — a wood-shingled roof, thematically consistent with a tree home,
requiring no new material.

## Test impact (existing tests that must change)

`ElvenTreehouseKit.test.ts`'s `'always ends in a living-canopy roof cap,
never a classic shingle or pagoda roof'` test is now testing removed
behavior — it must be replaced with a seed-sweep test asserting the
OPPOSITE: across enough seeds, at least one of each of the 3 archetypes
appears (proving real variety), using the exact same apex-ball
`SphereGeometry` discriminator the old test already established as
reliable (present for classic/pagoda, absent for living).

## Out of scope

- No change to `buildElvenStoneTower()`'s own behavior (weights default
  to the existing table; the floor-cap fix is a pure visual bugfix that
  also silently benefits it, which is desirable, not a scope increase).
- No interior/walkable-floor gameplay implication — these buildings
  remain decorative exterior-only meshes; the floor cap is a rendering
  fix, not a new gameplay surface.
