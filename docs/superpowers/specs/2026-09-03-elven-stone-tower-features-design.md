# Elven stone-tower kit — feature variety (windows, entrance, balcony, props) design + plan

Status: direct continuation of the shipped shape-variety pass (`docs/superpowers/specs/
2026-09-02-elven-stone-tower-variety-design.md`) — this is kit-of-parts *feature*
elaboration on an already-researched, already-approved technique (modular kit of parts,
per `docs/superpowers/specs/2026-09-02-elven-stone-tower-kit-design.md`'s research), not
a new algorithmic direction, so no fresh external research pass is needed here. Design and
implementation plan combined into one doc given the narrower, same-initiative scope.

## Origin

User feedback after seeing the shape-variety pass live: "better but we are not there
yet... we should improve the procedural generation more with more distinct variety." They
explicitly named concrete kit-of-parts feature ideas: varied window sizes/types, a
top-floor balcony, a bottom entrance archway, "other varieties" to shape the tower more
interestingly, and prop variety (vines, texture details) woven into the proceduality.

## What's already in place (don't duplicate)

- One hardcoded window "type" (a pointed-arch glass box + moonstone cone accent),
  one fixed size, applied per floor >0 with 70% probability.
- One hardcoded prop type (vine + 3 leaves) at 50% probability per ring.
- No entrance/doorway feature at all — the base/plinth is currently undifferentiated
  stone on all sides.
- No balcony/projecting-gallery feature.
- 4 silhouette profiles + per-vertex jitter (prior round) already vary the tower's
  *macro* shape; this round adds *kit-of-parts* variety — the individual pieces
  attached to that shape — which is the layer the user is now asking for.

## Chosen design — 4 additive pieces, each a small new file (this repo's established
single-responsibility-file convention)

### 1. `StoneTowerWindows.ts` — window type x size catalog

- `WindowType = 'pointed_arch' | 'oculus' | 'cross_mullion'` — pointed_arch is the
  existing glass-box-plus-cone shape (kept, unchanged visually); `oculus` is a round
  window (a stone-ring `TorusGeometry` frame around a disc of glass — a real
  Romanesque/Gothic feature, distinct silhouette from the pointed arch); `cross_mullion`
  is a squared window with a horizontal + vertical stone mullion bar splitting it into 4
  panes (a real late-medieval/early-modern window type, reads as more "civilized/
  furnished" than a plain arrow-slit-like arch).
- `WindowSize = 'small' | 'medium' | 'large'` — a scalar multiplier (0.7/1.0/1.35) on
  the existing size formula, applied to whichever type is chosen.
- `pickWindowStyle(seed): { type: WindowType; size: WindowSize }` — one seeded choice
  per window (i.e. re-rolled per floor, not fixed per tower, so a single tower's several
  windows can show different types/sizes — matches real hand-built towers where windows
  were added/replaced at different times).
- `buildWindow(style, radius, ringHeight, palette): THREE.Group` — dispatches to one of
  3 small private builder functions, all returning geometry already positioned at the
  ring's standard window slot (same `z = radius * 0.99` convention as today).

### 2. `StoneTowerEntrance.ts` — ground-floor archway

- `EntranceStyle = 'plain_arch' | 'flanked_pillars'` — `plain_arch` is a larger version
  of the pointed-arch window shape (recessed dark "open doorway" box + moonstone-accented
  point) sized for a person, not a window; `flanked_pillars` is the same arch plus two
  small cylindrical stone pillars flanking it, floor-to-lintel height (a real
  "important building" architectural cue distinguishing it from a plain door).
- `pickEntranceStyle(seed): EntranceStyle`, `buildEntrance(style, radius, seed, palette):
  THREE.Group` — built once per tower (not per floor) and attached to `buildTowerBase()`
  at the plinth's front face, y-centered on the plinth height.
- Always present (a tower always has a way in) — the *style* varies, not whether it
  exists at all.

### 3. `StoneTowerBalcony.ts` — optional top-floor projecting gallery

- A seeded ~40% chance per tower (independent of silhouette profile — even a `tiered`
  tower, whose own stepping already reads as tiers, can additionally get one true
  cantilevered balcony near the top for a "watch-post" reading).
- Built from: (a) a ring of small corbel-bracket wedges (`ConeGeometry`, apex pointing
  inward/down, matching real corbelling) protruding from the wall at the balcony floor's
  radius, (b) a thin projecting deck (a slightly-larger-radius, short `CylinderGeometry`
  "collar"), (c) a low parapet wall ring (a short `buildWallSurfaceTextured`-style
  cylinder shell at the collar's outer radius) — kept as 3 cheap primitives rather than
  full per-block geometry (Strategy G), since a balcony is a small accent feature, not a
  primary wall surface, and this keeps its triangle cost low regardless of which wall
  strategy the tower's main shaft uses.
- `buildBalcony(seed, radius, palette): THREE.Group`, attached at whichever floor index
  is second-to-last (so the roof cap still reads as sitting on top of a normal top
  floor, with the balcony as a distinct band below it, matching real "watchtower gallery
  below the cap" massing).

### 4. Prop catalog — extend (not replace) the existing per-ring decoration slot

Directly in `StoneTowerKit.ts`'s `buildTowerWallRing()` (small addition, not a new file,
since it's one weighted-choice function plus 2 new small prop builders alongside the
already-inline vine code): `pickWallProp(seed): 'none' | 'vine' | 'moss_patch' |
'banner'` (weighted: none 35%, vine 35% -- matches today's ~50%-of-remaining-65%
frequency closely enough, moss_patch 15%, banner 15%).
- `vine`: existing vine + 3 leaves code, unchanged.
- `moss_patch`: 2-3 flat, slightly-protruding dark-green `PlaneGeometry` decals
  positioned low on the ring (weathering/staining read, cheap, no new material needed —
  reuses `palette.leaf` at reduced opacity via a cloned material with `transparent`/
  `opacity` set, the one deliberate per-instance material clone in this kit, justified
  since decals need their own opacity and won't be merged by `mergeGroupMeshesByMaterial`
  anyway as they sit outside the wall-surface group).
- `banner`: a thin hanging cloth (a tall narrow `PlaneGeometry`, double-sided) on a small
  horizontal rod, hung from near the top of the ring on a different angular position
  than the window slot so they don't overlap.

## Integration points

- `StoneTowerKit.ts`: `buildTowerWallRing()` calls `pickWindowStyle()`/`buildWindow()`
  instead of its current inline window code when `hasWindow` (kept as a boolean gate —
  *whether* a floor has a window is unchanged logic, only *which* window varies now);
  calls the new `pickWallProp()`/prop builders instead of the current inline
  vine-or-nothing code. `buildTowerBase()` gains a `pickEntranceStyle()`/`buildEntrance()`
  call. `buildElvenStoneTower()` gains one `buildBalcony()` call (seeded chance) attached
  at the second-to-last floor's position/radius/offset.
- No changes to `StoneTowerShape.ts`, `StoneTowerWallSurface.ts`, `StoneTowerSilhouette.ts`,
  or `StoneTowerRoofCap.ts` — this round is purely additive kit-of-parts pieces riding on
  top of the already-shipped shape machinery, not a change to it.

## Testing plan

- Per new file: pure-function unit tests for the pick-functions (deterministic,
  produces all documented options across enough seeds, roughly even-ish distribution
  where relevant) + geometry tests for the build-functions (valid/non-NaN geometry,
  each type/style produces measurably different geometry from the others, so the variety
  is real not cosmetic).
- `StoneTowerKit.test.ts` additions: a tower's several windows (across its floors) are
  not all the same type/size for a large-enough floor count/seed sweep (proof the
  per-window re-roll actually reaches the built tower); the base always has exactly one
  entrance's geometry attached; a seed sweep finds towers both with and without a
  balcony (proof the ~40% chance is real, not always-on/always-off).
- Full regression + tsc, same discipline as every prior round this session.
- Live verification via the same Settlement Lab (faction=elven) + `showroom.html`
  side-by-side comparison technique used for the shape-variety pass.

## Non-goals this round

- Not touching any other race, not touching the silhouette-profile system itself.
- Not adding per-tier facet-count changes (still deferred from the prior round).
- Not adding a full material/texture-variant system beyond the moss-patch decal above —
  that's a bigger "weathering/condition" system that would want its own design pass if
  pursued further (the user's "varied texture details" phrase is only lightly addressed
  here via the moss decal, called out explicitly rather than silently under-delivered).
