# Phase 4 Design: Night Lighting (Lamps Along Settlement Roads)

## Problem

The overworld's night phase (`DayNightSystem`'s `night` phase, hours 22–5) makes the whole scene
uniformly dark — a flat dim ambient/hemisphere wash with a low-intensity directional key light, no
local light sources anywhere in the world except the tower's window-glow point lights (`__window_light`,
wired via `updateTowerDetails`). Settlement roads and building fronts vanish into darkness at night,
making it hard to see or feel any place-identity after dark, and there's no lamp/brazier prop at all.

## Goals

1. Place lamp-post props along settlement road tiles (`SettlementGenerator.ts`'s `RoadSegment[]`),
   spaced so roads read as lit paths without every single road tile getting its own lamp.
2. Each lamp has a small flickering `THREE.PointLight` that is off during the day and fades in
   smoothly as `DayNightSystem`'s night phase approaches/recedes (reusing the existing per-frame
   `hour` value already piped into `OverworldScene.update()` as `this._timeHour`).
3. Lamps should look reasonably distinct from other props (a simple post + lantern-head silhouette),
   sized appropriately given the "animal-crossing" building scale established in Phase 3/prior
   branch work (buildings are already small — lamps must match, not tower-sized).
4. No physics collider needed (decorative prop, like Phase 2's bushes) — but must not visually
   overlap/clip through buildings; use existing road-tile-adjacency placement (only on road tiles,
   which are already guaranteed clear of building footprints).

## Non-goals (explicitly out of scope for this phase)

- Lighting outside settlements (open-wilderness lamps, campfires at enemy camps) — settlements only,
  per the user's specific ask ("lamps or fires... along roads").
- Changing `DayNightSystem`'s ambient/fog/sky phase values — this phase only adds local point
  lights, not global lighting changes.
- Shadow-casting from lamp lights (performance: many lamps × shadow maps is expensive; Three.js
  `PointLight.castShadow` defaults to `false` and we leave it that way, consistent with the tower's
  existing window lights which also don't cast shadows).

## Current codebase state (confirmed by direct inspection)

- `SettlementGenerator.ts` produces `SettlementPlan.roads: RoadSegment[]` (`{ col, row }` grid
  cells) per settlement, already rasterized into continuous paths (Bresenham-line-connected, per
  the file's own module doc comment).
- `OverworldScene.ts`'s settlement-building loop (~line 1958–1992) already iterates
  `entry.plan.roads` once per settlement to build the flat road-tile `InstancedMesh` — this is the
  natural place to also collect lamp placement candidates, since road-tile world positions are
  already being computed there (`wx`, `wz`, `centreElev`).
- `updateTowerDetails(hour, playerPos)` (called every frame from `OverworldScene.update()`,
  ~line 373) is the existing precedent for "hour-driven point light intensity fade" — night lamps
  will follow the exact same `isNight` + sine-flicker pattern for visual/behavioral consistency,
  but as a NEW method (`updateNightLighting(hour)`) rather than folding into `updateTowerDetails`
  (keeps concerns separated: tower details vs. settlement lamp network).
- `_clutter: THREE.Group[]` (reused in Phase 2 for bushes) is NOT reused here — lamps need their
  own tracked array (`_lampGroups: THREE.Group[]`) because each lamp's point light needs per-frame
  intensity updates, unlike bushes which are purely static decoration. Follows the same
  `__window_light`-named-child-traversal pattern as the tower, OR (simpler, chosen here) each lamp
  group directly exposes its `PointLight` via a stored parallel array `_lampLights: THREE.PointLight[]`
  — avoids a `traverse()` call every frame across every lamp (there could be dozens across all
  settlements; direct array indexing is cheaper and simpler than repeated tree walks).

## Design

### New module: none needed — this stays entirely within `OverworldScene.ts`

Given the scope (single new mesh type + one per-frame update method, no new deterministic-variety
selection logic needed — lamps don't need archetype variety, just consistent placement), no new
`NatureAssetDNA`-style module is warranted. This keeps the phase simple and avoids
over-engineering a single-archetype prop.

### Lamp placement algorithm

Inside the existing settlement-building loop (where `plan.roads` is already iterated for the flat
road-tile mesh), collect lamp candidate positions using **every Nth road tile** (simple modulo
stride, e.g. every 4th tile in iteration order) rather than a Poisson-disk pass — road tiles are
already a curated, non-random path graph (unlike Phase 2's dense random terrain scatter), so even
positional sampling along the path is both simpler and gives a more natural "lamp-post interval"
look than random jitter would.

To avoid lamps directly blocking a walking path down the center of a road tile, offset each chosen
lamp's world position slightly to one side (perpendicular offset derived from whether the road tile
has more neighbors along X or Z — reuses a simple heuristic: check the road tile's `col`/`row`
neighbors already present in the plan's road set to infer local road orientation; if inconclusive,
default offset along +X).

### Lamp mesh (single archetype, small animal-crossing-appropriate scale)

- Post: thin cylinder, ~1.4 WU tall (shorter than trees' trunks, taller than bushes — a human-scale
  street lamp given the small building scale established in the prior branch).
- Lantern head: small box or octahedron at the top, emissive material (warm amber/orange,
  `0xffaa44`-ish) so it reads as "lit" even before the point light kicks in visually.
- A `THREE.PointLight` (warm color ~`0xffaa55`, small radius ~4–5 WU, matching the tower window
  lights' radius-5 precedent) parented at the lantern head position, starting at intensity 0 (day).

### Night-driven intensity update

New method `updateNightLighting(hour: number): void`, called once per frame from `update()`
alongside the existing `updateTowerDetails` call, using the identical `isNight` threshold (`hour >=
18 || hour < 6`) for visual consistency with the tower windows, and the same
`0.7 + 0.1 * Math.sin(Date.now() * 0.001)` flicker formula (reused verbatim — this is deliberate:
users perceive inconsistent flicker timing between different light sources as visually "off", so
the tower and the settlement lamps should flicker in the same rhythm).

## Data flow / lifecycle

- `_lampGroups: THREE.Group[]` and `_lampLights: THREE.PointLight[]` — both populated once in the
  constructor's settlement-building pass, parallel arrays (same index = same lamp).
- `enter()`/`exit()`: add/remove all `_lampGroups` to/from `scene`, mirroring `_clutter`'s existing
  pattern.
- `dispose()`: dispose each lamp's geometries/materials (post + lantern-head + the point light
  itself, calling `.dispose()` where applicable — `THREE.Light` doesn't hold GPU geometry so only
  the two meshes' geometry/material need explicit disposal).

## Testing strategy

- Unit test: a pure placement-selection helper extracted as a small function (e.g.
  `selectLampRoadTiles(roads: RoadSegment[], stride: number): RoadSegment[]`) — deterministic,
  easily unit-testable in isolation without needing to construct a full `OverworldScene`. This
  mirrors the Phase 1/2 pattern of extracting pure logic into small, directly-testable functions
  rather than only testing via the full scene class.
- E2e: re-run the full `tests/e2e/exterior.test.ts` suite (15 tests) to confirm no regressions —
  lamps are non-colliding decoration so should not affect any existing collision/movement assertion.
- Visual verification: live Playwright screenshot at night hour (teleport near a settlement,
  force/verify `_timeHour` via existing dev hooks or by waiting through the day/night cycle — check
  `TimeSystem` for a way to jump directly to a night hour for fast verification) confirming lamps
  are visible and lit.

## Risks / open questions

- **Stride tuning**: "every 4th road tile" is a starting guess; may need adjustment after visual
  verification if lamps look too sparse or too dense. Not a blocking design question — easily
  tunable as a single constant.
- **TimeSystem hour-jump**: need to confirm whether `TimeSystem` exposes a way to directly set
  `hour` for fast Playwright verification (checked in the implementation plan's verification task).
