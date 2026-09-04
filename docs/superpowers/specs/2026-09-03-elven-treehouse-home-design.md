# Elven living-tree home ("treehouse") — kit-of-parts design

Status: next building type in the race-by-race procedural rollout (`TODO/
organic_world_tiles_todo.md` Phase 6), following the same research → learn → plan →
build → test → confirm cycle established for the elven stone-tower kit. Session ran
under user-enabled autopilot for this cycle ("I would like to see how you handle doing
the process again with another building type") — design decisions below were made
autonomously per that instruction, documented for review rather than gated on
per-question approval, matching the mission's "decide, don't ask" autopilot directive.

## Why this building type, next

Elven's `FACTION_BUILDING_VARIANTS` table routes **5 of its ~9 building kinds** —
`house` (gateward/farm wards), `terraced` (slum ward), `villa` (merchant/patriciate
wards), `inn`, and `blacksmith` — through a single function, `buildElvenVilla()`, which
builds a living-tree trunk+canopy via `buildElvenTrunkGrid()`. `house`/`terraced` in
particular are the *highest-frequency* buildings in any elven settlement (every
gateward/farm/slum-ward building uses one of these two). Fixing this one shape
therefore has more visual leverage on "does an elven settlement look good" than any
other single building kind — more than the tower, which is comparatively rare
(watchtower/tower aren't even reachable in a normal settlement yet, per Phase 6.5's
open item). This is the natural next target per the user's stated goal: "once we have
a fully working good looking elven race settlement we can learn from how all this was
done."

## Current-state audit (confirmed via code read + live screenshot)

`buildElvenTrunkGrid()` (`FactionBlockProfiles.ts`) is already a genuinely sophisticated
occupancy-grid generator, well ahead of the "basic stacking blocks" the user has
criticized elsewhere:
- A per-level radius curve tapers from a flared root to a slender "waist," using a
  zero-derivative (smoothstep) landing so the canopy grafts on without a visible collar.
- The canopy is a central crown lobe + 3-4 satellite foliage lobes, each reached by its
  own visible tapered branch — not one axisymmetric blob.
- One door opening is already carved using real block-occupancy (not a separate mesh):
  a genuine round arch whose half-width narrows with height following a circular arc,
  with promoted "facade" jamb-post blocks — and it's *clamped* against the trunk's own
  (narrowing) radius at that height so the frame never outruns the receded trunk surface
  behind it.
- One plank-ring balcony (`addPlankRing` + `addRingBraces` in `FactionBuildingVariants.
  ts`) sits at the trunk/canopy neck, with radial planks and diagonal braces.

Live-verified via Playwright screenshot (`showroom.html`, house/villa, seed 3): despite
the above, the trunk's **entire vertical surface below the neck is completely blank** —
no windows, no floor delineation, one door, always the same proportions. A 2-3 floor
building reads as one undifferentiated stepped cone with a single door and a ring at the
top. This is the concrete gap this design closes.

## Research summary (full report kept in this session's transcript; key findings only)

1. **Real-world treehouse engineering** gives directly-usable *design rules* (not
   code): ring beams (a collar wrapping most/all the way around the trunk) + triangulated
   diagonal knee braces carry a platform's load, rather than many nails into thin
   branches — this is almost exactly what `addPlankRing`/`addRingBraces` already do, just
   only once per building instead of once per floor. Real treehouse roofs are
   conventional shingle/thatch far more often than "living roof" (too much dead load
   this high up) — validates keeping our existing leaf-canopy as the *fantasy* roof, not
   pursuing a "living roof over conventional walls" hybrid.
2. **The Elder Scrolls' Bosmer/Valenwood tree-cities (Falinesti)** is the standout
   in-fiction precedent for "buildings grown into/onto a living tree": platforms linked
   by vines, and — most usefully — **"curled webs of moss hang unevenly over the
   streets, forming a shared roof for several dozen small buildings."** This gives a
   second, genuinely-different canopy archetype idea (a denser, mossier, more
   "woven-together" crown) distinct from our existing "separated satellite lobes" one,
   mirroring the tower's classic/pagoda/living archetype split.
3. **No public precedent applies Townscaper's technique to tree/organic structures** —
   confirmed by search; our own `BlockKit.ts` (dual-grid corner chamfering on an
   occupancy grid) is already ahead of any public example here, so no new algorithmic
   base is needed.
4. **Procedural tree algorithms** (L-systems, space-colonization, Weber-Penn/EZ-Tree) all
   target *decorative background trees* — none reason about flat walkable floors, door/
   window openings, or "a person could live here." Confirms the right architecture is
   what we already have: a tapered-radius *skeleton* curve driving heightfield occupancy,
   with floors/doors/windows carved into that occupancy afterward as a separate concern
   — not a tree-growth algorithm that's itself aware of architecture.
5. **Libraries considered and NOT adopted this round**: `three-bvh-csg` (real, MIT-ish,
   BVH-accelerated CSG with a `HOLLOW_SUBTRACTION` op well-suited to carving curved
   openings) would let windows be carved as true curved cuts into a merged mesh instead
   of block-occupancy notches. Rejected for now: it's a new runtime dependency, CSG
   boolean ops are "not built for real-time/per-frame regeneration at scale" per its own
   README, and — critically — **our existing occupancy-carving technique already
   produces a genuine round arch** (proven on the door) at zero extra cost and zero new
   dependencies, fully consistent with how every other faction profile in this codebase
   works. `proc-tree.js` was found but has no LICENSE file (all-rights-reserved) — not
   shippable. `EZ-Tree` (MIT, TS, three.js-native) is a clean reference for parameter-
   schema design but its output is smooth tube-mesh branches, which would visually clash
   with BlockKit's deliberately blocky-but-organic style if mixed in — not adopted, but
   worth knowing about if a fully-separate "background tree" system is ever built.
   `LatticeDeform.ts` (already in this repo, Phase 5 of the organic-world-tiles roadmap)
   is a real fit for "bend a straight module onto a curved surface" but only implements
   2D bilinear cage deform; extending it to 3D is flagged in its own doc as unimplemented
   future work — out of scope for this round, noted as a possible future upgrade path for
   window-frame fitting.

## Chosen design — 4 additive pieces, extending the existing engine (no new dependencies)

### 1. Ring-beam + knee-brace bands at *every* floor, not just the neck

Generalizes the existing `addPlankRing`/`addRingBraces` (currently called once, at the
neck) into a loop over `dna.floors` bands. New helper `elvenRadiusAtHeight(w, d,
heightFrac, opts)` in `FactionBlockProfiles.ts` (sibling to the existing
`elvenWaistRadius`, which becomes a thin wrapper calling it at the neck's height
fraction) computes the trunk's real constructed radius at an arbitrary height fraction,
so each floor's ring sits flush against the actual tapered surface there instead of a
guessed radius. This is both the single biggest fix for "reads as one shape, not N
floors" and a direct application of the real-world ring-beam/knee-brace research finding.

### 2. `ElvenTrunkWindows.ts` (new file) — carved window openings, multiple per floor

Extends the door's proven occupancy-carving technique (round arch, narrowing with
height, clamped against the trunk's own radius) to smaller **window** openings placed
at several angles around the trunk's circumference, one band per floor (between that
floor's ring-beam and the next). A new `'window'` material key (dark, slightly
emissive-blue glass) and `'window_frame'` key (promoted jamb blocks, mirroring
`'facade'`) are added. `pickWindowCount(seed, floors)` picks 2-4 window angles per floor
band (concretely: `2 + floor(rand()*3)`, so 2/3/4 with equal weight, re-rolled per floor
band so a single building's floors don't all show the same count), jittered off an even
spacing (±20% of the angular gap) so it doesn't read as a perfectly regular grid.
Exported as a pure function operating on a `BlockGrid` (`carveTrunkWindows(grid, ...)`)
so it's unit-testable in isolation from the rest of `buildElvenTrunkGrid`, matching this
repo's small-single-responsibility-file convention.

### 3. Two entrance styles, picked by seed

Currently the door is always the same round-arch proportions. Add
`pickElvenEntranceStyle(seed): 'ground_arch' | 'raised_platform'` (exported from
`FactionBlockProfiles.ts`, alongside the existing carving code it's tightly coupled to
via the trunk's own per-level radius closure — extracting the carving itself to a new
file isn't worth the coupling cost this round, noted as a scope decision). Weighted
60% `ground_arch` / 40% `raised_platform` (ground-level entry is the more common real-
world default; raised is the distinct-but-rarer variant, mirroring the tower's uneven
archetype weighting precedent). `ground_arch`
is the existing round arch, unchanged. `raised_platform` carves a smaller, slightly
higher-set arch reached by a short external switchback of 3-4 step blocks (a real
treehouse-precedent detail: entrances often sit above ground level on a stilted/root-
flared base) plus a small landing platform — a genuinely different silhouette at the
building's base, not a parameter tweak.

### 4. Second canopy archetype: "woven moss crown," Falinesti-inspired

`pickElvenCanopyArchetype(seed): 'satellite_lobes' | 'moss_crown'` (also in
`FactionBlockProfiles.ts`, since both archetypes are alternate branches inside the same
occupancy-fill loop and share the lobe/branch distance-field machinery). Weighted 55%
`satellite_lobes` / 45% `moss_crown` (close to even — both are equally "valid" looks,
unlike the entrance's more/less-common split).
`satellite_lobes` is the existing separated-lobes-plus-branches canopy, unchanged.
`moss_crown` is a single denser, wider, lower-profile mass (no separate satellite lobes
or branches) with a mottled two-tone leaf/moss material mix at its surface — reads as
the Falinesti "shared mossy roof" motif, distinct enough from the lobed canopy to be
tellable apart at a glance, matching the tower's "structurally distinct assembly, not a
parameter tweak" bar.

## Testing strategy

Strict TDD per existing convention: a failing test written first for each new/changed
function, confirmed failing, then implemented. `elvenRadiusAtHeight()` gets a direct
numeric test (matches `elvenWaistRadius`'s existing value at the neck fraction, differs
at other fractions). `carveTrunkWindows()` gets occupancy-based tests (a window cell is
absent from `bark`, present as `window`/`window_frame`; windows never appear below floor
1 or above the canopy start; window count scales sanely with floor count). Ring-beam/
knee-brace-per-floor gets a mesh-count test (N floors → N ring assemblies, radii
decreasing with height matching the taper). Entrance style and canopy archetype each get
a `pick*(seed)` distribution test (all values reachable across a seed sweep, matching the
tower's `pickRoofArchetype` precedent) plus a geometry test proving the two branches are
actually structurally different (mesh count or radius-profile comparison, matching the
lesson learned from the tower's pagoda false-positive: **assert on radius/geometry
directly, not on a Y-proximity heuristic that can silently match the wrong ring**).

## Non-goals / explicitly deferred (documented, not silently dropped)

- **Multi-tree bridges/linked settlements** (Ewok-village precedent) — a settlement-
  layout feature, not a single-building one; out of scope here, worth revisiting if/when
  Phase 3 (organic settlement plots) gets another pass.
- **Spiral staircase wrapping the trunk exterior** — a real, good treehouse-precedent
  idea, and a plausible future `CurveModifier`/simple-helix-placement addition, but adds
  real scope (new geometry, new collision considerations) beyond this round's four
  pieces; deferred to a possible follow-up round if the user wants more variety after
  seeing this pass.
- **CSG-based curved window carving** (`three-bvh-csg`) — see library assessment above;
  the occupancy-carving technique already proven on the door is preferred for
  consistency, zero new dependencies, and zero real-time cost.
- **Party-wall-aware window suppression for `terraced` buildings** — `BuildingDNA.
  terrace: TerraceSide` exists for exactly this, but is never set to anything but
  `'none'` anywhere in the current codebase (confirmed via search) — building logic
  against a field nothing ever populates would be dead code; flagged here as a
  pre-existing gap in a different subsystem, not something this round should try to
  fix.
- **`chapel` and `shop`** (elven's other 2 kinds) already have their own bespoke,
  distinct builders (`buildElvenChapel`, `buildElvenShop`) — not touched by this design.

## Files touched

- `src/world/buildings/FactionBlockProfiles.ts` — `elvenRadiusAtHeight()` (new, exported),
  `elvenWaistRadius()` becomes a thin wrapper over it, `pickElvenEntranceStyle()` (new,
  exported), `pickElvenCanopyArchetype()` (new, exported), canopy-fill loop gains the
  `moss_crown` branch, entrance carving gains the `raised_platform` branch.
- `src/world/buildings/ElvenTrunkWindows.ts` (new) — `carveTrunkWindows()`,
  `pickWindowCount()`.
- `src/world/buildings/FactionBuildingVariants.ts` — `buildElvenVilla()` loops
  `addPlankRing`/`addRingBraces` per floor instead of once at the neck; palette gains
  `window`/`window_frame` materials.
- Test files mirroring each of the above.
