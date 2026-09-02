# Rounded building corners (post-Phase-2 follow-up) — design spec

Status: drafted autonomously (user confirmed "organic/rounded corners" was
expected broadly across buildings/towns, not just water edges, then went
unavailable and asked me to work autonomously — same precedent as the
Phase 1–5 design specs in this same effort).
Ready for review before implementation.

## Origin

User feedback after PR #44 (`organic_world_tiles_todo.md` Phases 1–5)
merged to `main`: shorelines/lakes/rivers look much better, **but** the
user clarified they expected the rounded/organic/"snap together" treatment
applied generally — to buildings and towns, not only water. They also
pointed at Overworld Studio's Settlement tab "Play in 3D" button
(`SettlementLabScene`) as a fast way to test building/town changes without
going through character creation.

Investigating `SettlementRenderer.ts` → `buildBuilding()` →
`FactionBuildingVariants.ts`/`BuildingBuilder.ts` found the real gap this
spec addresses (see below). This is a genuinely separate subsystem from
settlement/road *layout* organic-ness (Phase 3's deferred live wiring),
which will get its own follow-up spec after this one ships.

## Investigation findings

**Two different building-construction families exist today:**

1. **BlockKit-driven bodies** (`src/world/buildings/BlockKit.ts`'s
   `meshBlockGrid()`) — used by 8 factions' primary building mass
   (dwarven, vulperia, elven, orcish, vampire, fae, slime, undead_common;
   see `FactionBuildingVariants.ts`'s `FACTION_BUILDING_VARIANTS` table).
   Phase 2 (already shipped) fixed `getChamferFlags()`'s classification bug,
   so these buildings correctly chamfer isolated/outer-corner cells. But
   the chamfer itself is a **flat diagonal cut** (`cornerPoints()` returns
   exactly 2 points bridged by one straight edge) — visually an octagon,
   not a curve. Still boxy at close range, just an 8-sided box instead of
   a 4-sided one.

2. **Plain box-panel bodies** (`src/world/buildings/BuildingBuilder.ts`) —
   used by any faction/kind with **no** `FACTION_BUILDING_VARIANTS` entry.
   Notably: **the `human` faction has no entry in that table at all**, so
   every human building falls through to `KIND_BUILDERS`, and the most
   common residential kinds (`house`, `shop`, `inn`, `guild`) all resolve
   to `buildHouseOrShop()` — built entirely from plain `THREE.BoxGeometry`
   wall panels. **Zero corner treatment whatsoever**, not even Phase 2's
   flat chamfer. Since `human` is very likely the most common/default
   faction, this is probably the single largest visible source of "still
   looks blocky."

**Not every sharp corner is an oversight, though** — `buildVilla()`
deliberately adds Georgian "stone quoins" (alternating-width corner
blocks) at its 4 corners as an intentional style detail; rounding those
corners would fight the existing design rather than fix a gap. Similarly,
`dwarvenBlock()`'s own header comment explains its un-chamfered corners
are a deliberate "contrasting structural material" read. So this spec
targets only genuine gaps, not every corner in the codebase.

**Key implementation insight:** `blockGeometry()`'s meshing helpers
(`pushSideQuad`, `pushFanCap`) already iterate over an outline of
arbitrary point count — they don't assume exactly 4 or 8 points. So
`cornerPoints()`/`buildOutlinePoints()` can be generalized to emit an
N-segment arc instead of a 2-point flat chamfer with **zero changes** to
the actual mesh-building code. This makes the fix small and low-risk.

## Chosen approach

### A1 — BlockKit: flat chamfer → true rounded arc

Generalize the existing chamfer math (already centered at an inset point
`r` back from the true corner along both axes) from "2 tangent points
joined by 1 straight edge" to "N+1 points sampled along the connecting
90° arc, joined by N straight edges." The math:

- Per corner, the arc center is the same inset point already implied by
  today's 2-point formula (e.g. NW: `(-s+r, -s+r)`), and the arc sweeps
  90° between the same two existing tangent points (e.g. NW: from 180° to
  270°). This is verified algebraically to reduce to **exactly today's
  2-point output when `segments = 1`** — the single new parameter's
  degenerate case is the current shipped behavior, so this is provably a
  pure superset generalization, not a behavior change in the `segments=1`
  case.
- `buildOutlinePoints()` currently special-cases "2 points" vs "1 point"
  per corner; generalize to "loop over however many points
  `cornerPoints()` returns," tagging every internal arc-to-arc segment
  with the existing `${corner}_diag`-suffixed tag (so `blockGeometry()`'s
  `tag.endsWith('_diag')` "always visible" check needs **no changes at
  all**) and only the final arc point's outgoing edge keeps the original
  `OUTGOING_EDGE[corner]` face-visibility tag.
- New `chamferSegments` option threaded through `BlockGeometryOptions` and
  `MeshBlockGridOptions` (both currently plain option bags with optional
  fields — this is an additive, backward-compatible field). Default at
  the `blockGeometry()`/`meshBlockGrid()` layer: **3** (4 arc points per
  chamfered corner) — a visually-rounded curve without an unreasonable
  triangle-count increase, since only cells actually classified as
  `outer_corner` chamfer at all (most cells are `edge`/`inner_corner`/
  `full` and pay zero extra cost). `buildBlockOutline()`/`cornerPoints()`
  themselves default `segments` to **1** (preserving every existing direct
  unit test of those two functions unchanged) — the rounder default only
  takes effect at the `blockGeometry`/`meshBlockGrid` call layer that
  actually backs live rendering.
- No call site in `FactionBlockProfiles.ts`/`FactionBuildingVariants.ts`
  needs to change — they call `meshBlockGrid(grid, palette, opts)` with
  whatever `opts` they already pass (usually just `chamferRadius`/
  `suppressChamfer`), and will pick up the new rounder default
  automatically.

### A2 — Rounded corner posts for `buildHouseOrShop()`

New small file `src/world/buildings/RoundedCornerPosts.ts` exporting:

```ts
export function addRoundedCornerPosts(
  group: THREE.Group,
  w: number, d: number,
  yBase: number, height: number,
  radius: number,
  material: THREE.Material,
): void
```

Adds 4 quarter-cylinder `THREE.Mesh` posts (using `THREE.CylinderGeometry`'s
built-in `thetaStart`/`thetaLength` partial-arc support — no custom
geometry math needed here, unlike A1) at each of the 4 building corners,
each tangent to both adjacent wall faces (post center inset by `radius`
from the true corner along both axes, matching A1's inset-arc-center
convention so both fixes read as the same visual language). `radialSegments`
directly equals the segment count actually drawn across the quarter arc
in three.js's `CylinderGeometry` (it does not scale down proportionally
for a partial `thetaLength`), so it's set to `8` straight segments per
quarter — comparably smooth to A1's default 3-segment/4-point chamfer
arc, for a larger, more visually prominent standalone feature. Radius
fixed at `0.14` in the call site (matching
`buildHouseOrShop`'s existing wall-panel half-thickness exactly, so the
post is exactly tangent to both wall outer faces with no gap or overlap).
Height/yBase match the existing wall panels' span (`plinthH` to
`plinthH + wallH`) — the plinth's own (larger, `w+0.5` × `d+0.5`) corner
stays sharp, since it's a ground-course architectural detail (a course
line, not a smooth silhouette edge) and rounding it would require a
second, differently-sized post purely for the plinth band — out of scope
for this pass.

Wired into `buildHouseOrShop()` only (covers `house`/`shop`/`inn`/`guild`
— the generic default/human fallback). **Deliberately not** wired into
`buildVilla()` (existing quoins already serve as its corner language),
`buildTerraced()`/`buildCottage()` (share the same simple box-core pattern
and would be cheap same-helper follow-ups, but kept out of this round to
bound the diff/regression surface), or any of the ~12 other specialty
builders (tavern, tower, gate, blacksmith, chapel, tent, market_stall,
apothecary, ruin, well, barn — each either already non-box-shaped or needs
bespoke per-building geometry analysis).

## Alternatives considered

- **Full kit-of-parts (6 authored meshes per faction)** — this is Phase
  2's originally-deferred larger effort. Still not attempted here: it's a
  much bigger, higher-risk lift (art assets, blending/LOD work) for a
  bigger payoff than the current ask needs. The rounded-arc approach
  above is a lighter-weight way to get a genuinely curved (not just
  beveled) look using only procedural geometry, consistent with
  everything else in `BlockKit.ts`.
- **Replacing `buildHouseOrShop`'s 4 box panels with one rounded-rect
  extruded profile** (proper superellipse cross-section) — rejected as
  higher risk: it would require rewriting UV mapping, window/door
  placement math (currently keyed to flat panel-local coordinates), and
  the "core shadow volume" box, for a result no more visually distinct at
  this radius than the additive corner-post approach. The additive posts
  keep every existing panel/window/door/roof line of code completely
  untouched.
- **Rounding every builder's corners uniformly** — rejected; several
  builders have deliberate sharp-corner style details (villa's quoins,
  dwarven's un-chamfered structural corners) that a blanket rule would
  visually clash with. Scoped to genuine no-treatment gaps only.

## Testing plan

- `tests/world/BlockKit.test.ts`: new tests for `cornerPoints`/
  `buildOutlinePoints`/`buildBlockOutline` with `segments > 1` — arc point
  count (`segments + 1` per chamfered corner), first/last arc point
  matching today's existing 2-point tangent positions exactly (proves the
  generalization is a superset), all arc points staying within the
  existing half-size bound check, and a `segments = 1` call reproducing
  today's exact existing outputs byte-for-byte (explicit regression
  proof). New `blockGeometry`/`meshBlockGrid` tests confirming
  `chamferSegments` increases vertex count for a chamfered block and stays
  NaN-free/deterministic.
- New `tests/world/buildings/RoundedCornerPosts.test.ts`: post count (4),
  no-NaN geometry, tangency (post outer edge touches both adjacent wall
  planes, verified via bounding-box math), determinism.
- Full existing `BlockKit.test.ts` + `FactionBuildingVariants`-adjacent
  suites must stay green (they exercise the changed code paths already).
- Live verification via `SettlementLabScene` ("Play in 3D"): generate
  settlements across several factions/seeds/layouts and visually confirm
  BlockKit-driven buildings (dwarven/vulperia/elven/etc.) show visibly
  rounded corners and human houses/shops/inns/guildhalls show rounded
  corner posts, with no visible seams/gaps/z-fighting at the post-to-wall
  junction.
- Full regression suite + `npx tsc --noEmit`, compared against a freshly
  re-established baseline (main has moved since PR #44 merged).

## Non-goals for this spec

- Settlement/road *layout* organic-ness (Phase 3's live wiring) — separate
  follow-up spec after this one ships.
- Extending corner rounding to every remaining builder — explicitly listed
  as deferred above; can be picked up later using the same
  `addRoundedCornerPosts()` helper this spec adds.
