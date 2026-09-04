# Elven stone-tower kit (Phase 6 POC) — design spec

Status: brainstormed interactively with the user (not an autonomous/
unavailable-user pass — every section below was presented and approved
in conversation before writing this doc). Ready for the user's file
review before moving to the implementation plan.

## Origin

User feedback after the rounded-building-corners follow-up (PR #45,
merged): buildings still look "kind of like stacking blocks... okayish
I guess," and the user wants to go back to first principles for
procedural building construction — starting with a proof-of-concept for
one race (elven), one representative structure (a tower), before
rolling the same process out race-by-race (order: Elven, Dwarves,
Orcish, Vampire, Undead, Vulperia, Fae, Slime, Human — Slime/Human
last, since those already look best). The user provided a reference
image: a tabletop-wargame terrain kit (Txarli Factory "Battle Builder
Tech" style) — grey coursed-stone towers with conical shingled roofs,
rock outcroppings at the base, and stone stairs — as the target
"feel and architecture."

This spec covers **only the POC**: one new procedural tower-construction
system, wired into elven's `watchtower`/`tower` building kinds, verified
live via Overworld Studio's Settlement Lab. It is explicitly the first
of a planned series (one per race) — later races are out of scope here
and will each get their own research → design → plan cycle once this
POC validates the approach.

## Research summary

**Real-world tower construction:** built in horizontal courses of
roughly-uniform-height dressed stone blocks; often "battered" (wider at
the base, tapering upward) for stability; corners reinforced with
alternating long/short quoins; conical roofs are timber-framed and
shingled; crenellations/arrow-slits/corbelled balconies sit at specific
height bands, not scattered randomly.

**Procedural building generation, games & research:** two genuinely
separate concerns, solved differently in every reference found:
- **Shape/silhouette** — shape grammars (Müller et al.'s CGA shape,
  commercialized in CityEngine) recursively subdivide a building mass
  into terminal pieces. The far more common game-industry version, and
  what the user's reference image's physical kit actually is, is a
  **modular "kit of parts"**: a small set of interchangeable pieces
  sharing one socket/cross-section (base, several wall-ring variants,
  roof cap) that stack in any order.
- **Surface detail** (the bricks/stones themselves) — essentially never
  separate geometry in production; it's a repeating texture or shallow
  relief baked onto the wall surface. Confirmed this codebase already
  has exactly this working technique: `TextureFactory.ts`'s
  `stoneTexture()`/`brickTexture()` (generic builders) and
  `FactionBlockTextures.ts`'s `graniteTexture()` (dwarven) both
  procedurally paint a coursed-stone pattern onto a canvas at runtime.

**User's explicit override on the surface-detail question:** past
texture-only attempts in this project have "ended up very basic" —
the user wants real 3D geometry for the visible stonework, not a flat
texture illusion, and wants both approaches actually built so the
triangle-count cost can be measured rather than assumed. This spec
therefore designs the wall-ring as **two swappable strategies behind
the same interface** (see below), not a single texture-only approach.

## Current-state findings (what exists today)

- Elven buildings (`buildElvenVilla`/`buildElvenChapel`/`buildElvenShop`
  in `FactionBuildingVariants.ts`) are "living tree" architecture — an
  organic curved wooden trunk (`buildElvenTrunkGrid()` in
  `FactionBlockProfiles.ts`, a `BlockKit` heightfield grid) topped with
  a leaf canopy. No stone anywhere. **Confirmed with the user this stays
  as-is** — the new stone-tower system *complements* it (hybrid stone +
  living-tree elements), it does not replace elven's existing look.
- `FACTION_BUILDING_VARIANTS['elven']` has **no entry for `watchtower`
  or `tower`** — both currently fall through to the generic,
  square/box-stacked `buildWatchtower()`/`buildTower()` in
  `BuildingBuilder.ts` (only elven's `STYLE_COLORS` palette applies, no
  elven geometry at all). This is the safest possible integration
  point: purely additive, nothing existing to regress.
- Reusable materials already exist for the hybrid look: `barkTexture()`
  (`FactionBlockTextures.ts`), the elven palette's moonstone/glow
  `MeshStandardMaterial`s already defined inline in
  `addBlockElvenTrunk()`. `graniteTexture()` exists but is dwarven's
  (rougher, salt-and-pepper speckle) — reusing it for elven would blur
  faction identity, so this spec adds a new, more refined texture
  instead (see Strategy T below).
- `getFootprint('watchtower', size)` is a fixed `KIND_FOOTPRINT`
  override (`{w:2,d:2}`, size-independent); `getFootprint('tower',
  size)` falls through to `SIZE_FOOTPRINT[size]` (3×3 up to 7×5) — the
  new builder derives its cross-section radius from whichever footprint
  it's given, the same pattern every existing builder already follows,
  so it automatically scales to both kinds without special-casing.
- No existing "conical roof" helper — `ModularSet.ts` has
  `pitchedRoof()`/`hippedRoof()`/`thatchedRoof()`, all gabled-house
  shapes, not tower cones. A new helper is needed.

## Chosen approach

### Shared shape: octagonal ring stack

New file `src/world/buildings/StoneTowerKit.ts`. A tower's cross-section
is a regular **octagon** (8 sides — matches the reference image's
faceted-round silhouette; also cheap: 8 wall faces per ring, not a
high-poly true circle), with radius derived from `getFootprint()`.
Built as a stack of ring pieces sharing that same footprint:

- `buildTowerBase(...)` — wider plinth ring (slightly battered/flared,
  per real-world tower construction), with rock outcropping + tree-root
  tendrils blended in (root tendrils reuse the trunk's bark material and
  curve technique already established in `addBlockElvenTrunk()`'s
  surrounding code, at a small scale — a few tapering shapes wrapping
  the plinth, not a full trunk).
- `buildTowerWallRing(...)` — one floor's height of shaft; a `hasWindow`
  flag selects between a plain ring and a ring with a pointed-arch
  window insert (with a small moonstone/glow accent at the arch's
  point, reusing the existing elven "moonstone"/"glow" `MeshStandardMaterial`
  definitions for palette consistency). Occasional vine growth (thin
  curved tube + small leaf clusters, sparse — the stone must stay the
  primary read) is added independently of the window flag.
- `buildTowerRoofCap(...)` — terminates the stack. Two variants, chosen
  by weighted random per `dna.seed`:
  - *Classic*: a new conical-shingle-roof helper (radial fan of
    overlapping shingle wedges around a cone, using `slateTexture()` or
    a new elven-toned shingle texture).
  - *Living cap*: a small dedicated `BlockKit` grid (a new, small,
    purpose-built canopy shape using `createBlockGrid()`/`setBlock()`/
    `meshBlockGrid()` directly — **not** a call into the full
    `buildElvenTrunkGrid()`, which is coupled to being an entire
    trunk-to-canopy shape and isn't designed to be composed as a cap
    sitting on a separate stone shaft) — a few wide, chamfered tiers
    using the existing leaf/bark materials, deliberately avoiding the
    previously-shipped "sphere-cluster canopy" mistake documented in
    this same file (which read as "a muddy brown blob").

`buildElvenStoneTower(dna: BuildingDNA): THREE.Group` is the public
entry point: derives footprint via `getFootprint()`, picks floor count
(3-6), roof style, and per-ring window/vine placement from
`mulberry32(dna.seed ^ <salt>)` (the same PRNG convention every other
builder in this file already uses), and stacks
`[base, ...wallRings, roofCap]`.

### Wall-surface strategy (the "brick" question)

Both strategies implement the same signature —
`buildWallRingSurface(octagonRadius, ringHeight, seed, palette): THREE.Group`
— so the tower-assembly code above is agnostic to which one is active
(a single `WALL_STRATEGY` flag for the POC, not a per-building runtime
choice — see Testing section for how both get compared):

- **Strategy T (textured):** a plain 8-sided extruded prism (one ring =
  16 triangles: 8 side quads), material uses a **new**
  `ashlarTexture()` canvas generator (added to `FactionBlockTextures.ts`
  alongside the existing granite/bark/etc. generators) — larger, more
  uniform, cooler-grey coursed blocks than dwarven's rougher granite or
  the generic castle `stoneTexture()`, tuned to read as "dressed
  elven-refined ashlar" rather than "rough dwarven-hewn stone."
- **Strategy G (real geometry):** each course (a horizontal band,
  roughly 1 WU tall, several courses per ring) is built from individual
  slightly-protruding stone blocks arranged around the octagon's
  circumference — a polar-coordinate sibling of `BlockKit`'s own "many
  small solid pieces read as hand-built" philosophy, but using plain
  `THREE.BoxGeometry` positioned/rotated around the ring rather than a
  Cartesian voxel grid (an octagon-ring occupancy grid isn't the same
  shape as BlockKit's axis-aligned cells, so this is new, purpose-built
  geometry code, not a `BlockKit` extension). Each block gets small
  per-block jitter (size, radial protrusion, color) via the ring's
  seeded PRNG. All blocks across one tower are added to one
  `THREE.Group` and merged via the existing `mergeGroupMeshesByMaterial()`
  (already used everywhere in this codebase) before being added to the
  tower's own group, so draw-call count stays low regardless of block
  count — the cost that actually needs measuring is triangle count and
  CPU-side generation time, both covered explicitly in Testing below.

### Wiring

`FACTION_BUILDING_VARIANTS['elven'].watchtower = buildElvenStoneTower`
and `.tower = buildElvenStoneTower` in `FactionBuildingVariants.ts` —
two new lines in the existing per-faction table, no changes to any
other faction or any existing elven kind (villa/chapel/shop/house/
terraced/inn/blacksmith all keep their current tree-trunk builders
untouched).

## Testing plan

- Shape math unit tests (`StoneTowerKit.test.ts`): octagon vertex
  generation is correct (8 points, correct radius, no NaN); ring
  stacking produces the right total height for N floors; both wall
  strategies produce finite, non-NaN, deterministic geometry for
  identical seeds; `buildElvenStoneTower()` end-to-end produces a
  non-empty group for both `watchtower` and `tower` kinds across
  several sizes/seeds.
- **Direct T vs. G comparison test**: build the same tower shape with
  both strategies and assert/record triangle count and wall-clock
  generation time for each, so "is real geometry too expensive" gets an
  actual measured answer in the test output, not a guess — this
  directly answers the user's explicit ask.
- Live verification via Settlement Lab: generate elven settlements
  across multiple seeds, screenshot both `watchtower` and `tower`
  instances, confirm no console errors and the reference image's
  "feel" (faceted stone shaft, banded coursing, conical or living-canopy
  cap) is actually visible at normal camera distance — following the
  same rigor as the rounded-corners round (which caught a real
  occlusion bug that unit tests alone missed).
- Full regression suite + `npx tsc --noEmit` against a freshly
  re-established baseline (main has moved since the last round).

## Non-goals for this spec

- Any race other than elven — this is explicitly the POC; later races
  get their own research → design → plan cycle once this validates.
- Any elven building kind other than `watchtower`/`tower` — villa/
  chapel/shop/house/terraced/inn/blacksmith are untouched.
- Settlement/road layout work (already investigated and deferred in the
  previous round's follow-up, see `organic_world_tiles_todo.md`'s Phase
  3 section).
- Applying lessons learned back to terrain/nature tile-connection —
  explicitly a *future* step the user named, after all races' buildings
  are done, not part of this POC.
