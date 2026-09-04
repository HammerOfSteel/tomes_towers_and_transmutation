# Elven Chapel Rebuild — Rectangular Nave + Apse + Bellcote Design

**Status:** Approved (autopilot — user explicitly delegated "same manner" continuation
for all remaining elven building types; design decisions below are made and
documented per that mandate, not gated on live re-confirmation).

**Target:** replace `buildElvenChapel()` (a ring of 6 standing tree-stone
monoliths + a central glowing octahedron "sacred crystal" — the elven
faction's LAST remaining building kind still not built on the tower-kit's
real block-course + carved-opening technique) with a genuine Gothic-elven
chapel built from that same technique family, reachable in live settlements
via the `church` ward (`WARD_TO_KIND.church = 'chapel'`).

## Problem: the core technical tension

Every prior tower-kit building (watchtower/tower, house/villa/terraced/
inn/blacksmith, shop) has a roughly square/near-circular footprint, and the
whole kit (`StoneTowerShape.ts`, `StoneTowerWallSurface.ts`,
`StoneTowerFloorCap.ts`, `StoneTowerQuoins.ts`, `StoneTowerRoofCap.ts`) is
built around a single-radius **regular octagon** cross-section.

`chapel`'s footprint is **fixed at 4×8** (`KIND_FOOTPRINT.chapel` in
`BuildingDNA.ts`) regardless of `dna.size` — a genuinely elongated 1:2
"long nave" rectangle. A single-radius octagon cannot represent this
without either badly distorting past recognizability, or being replaced
outright. Falling back to `BlockKit`'s Cartesian voxel grid (as
dwarven/vampire/orcish chapels already do) would trivially solve the
footprint mismatch, but would reintroduce the exact "muddy blob"/"basic
base geometry" quality regression the last two elven rounds (treehouse,
market stall) deliberately moved *away* from.

## Research findings (full report in session history; summarized here)

A dedicated research pass (real small-chapel/parish-church architecture,
elven/nature-integrated game precedent, procedural kit-of-parts technique
for compound buildings, and existing procedural-church tooling) found:

1. **A 4×8 (1:2) rectangle is already architecturally correct**, not a
   problem to fight: real single-cell Anglo-Saxon/Norman parish churches
   (one rectangular nave, no aisles/transept) run 2:1 to 3:1 — this game's
   footprint sits right at that range.
2. **The apse (altar end) is *literally* often polygonal in real
   architecture** ("semicircular or polygonal termination… at the
   liturgical east end") — this is a direct, no-compromise bridge back to
   the kit's existing radial technology: a small octagonal apse needs ZERO
   new geometry code.
3. **Small parish churches overwhelmingly use a cheap bell-gable/bellcote**
   (a pierced wall-slab over the entrance gable, 1-2 bells) instead of a
   full second bell tower — real, well-documented, and exactly proportionate
   to a fixed small 4×8 footprint (matching this game's own village-tier
   `docs/BUILDINGS.md` chapel spec, not its town/cathedral-tier full-tower
   spec).
4. **Round-tower churches are a direct, NAMED real-world precedent for "a
   round/faceted piece docking flush against a flat rectangular wall"** —
   the seam itself is the historically-attested detail, not a flaw to hide
   or blend away. This directly licenses docking the small octagonal apse
   flush against the nave's back gable wall.
5. **Lancet (pointed-arch) windows are the correct Gothic vocabulary** for
   a small single-cell nave — already exactly this kit's existing
   `pointed_arch` window type, no new window geometry needed.
6. **The vernacular default roof for a small rectangular nave is a simple
   gabled ridge roof** (two raked planes + ridge beam + a gable triangle at
   each end) — none of the kit's existing radial roof-caps
   (classic/pagoda/living, all `CylinderGeometry`/`ConeGeometry` stacks)
   can or should be stretched to fit a rectangle; a new roof primitive is
   required regardless of which wall-shape strategy is chosen.
7. **WoW's Temple of the Moon / moonwell** (a glowing focal object —
   there, a statue in a pool — sited at the far end of an axial hall, not
   scattered mid-room) is the closest fantasy precedent, and directly
   informs relocating this building's own "sacred crystal" from the
   current stone-ring's center to the new apse's own on-axis focal point.
8. **No public procedural-church-generator library/addon exists** (Godot,
   Unity, or Three.js) — confirmed via direct search, a genuine negative
   finding. The closest formal precedent is academic CGA shape grammar /
   CityEngine's "main mass + subordinate component masses" pattern — not
   an importable library, but validates the compound-building approach
   itself as the standard technique for this class of problem.
9. **Codebase-specific finding, the key unlock**: `buildWallSurfaceBlocks()`'s
   `facesOverride` option (added for the market stall) takes an arbitrary
   `OctagonFace[]` and has **no internal dependency on those faces coming
   from a regular octagon** — it just walks whatever face list it's given.
   This means the exact same real per-course block-and-mortar wall
   technique used everywhere else in the kit can be pointed at a **plain
   4-face rectangle** with **zero changes** to `buildWallSurfaceBlocks`
   itself. Only `buildFloorCap()`/`buildQuoins()` (which currently call
   `octagonPoints()` internally rather than accepting points directly)
   need a small, low-risk generalization to accept an explicit corner-point
   list.

## Decision: compound building, entirely within the tower-kit family (never BlockKit)

**Nave** — the 4×8 hall itself, built as a genuine rectangle:
- Walls: `buildWallSurfaceBlocks()` called with a new `rectangleFaces(halfW,
  halfD)` face list (4 faces, same `OctagonFace` shape) — **no changes**
  needed to `buildWallSurfaceBlocks()` itself.
- Quoins: `buildQuoins()` generalized to accept an optional
  `pointsOverride?: [number, number][]` — when given, used instead of
  calling `octagonPoints()` internally. A new `rectanglePoints(halfW,
  halfD)` supplies the nave's 4 real corners (right-angle quoins, matching
  what a rectangular chapel's buttresses/corners actually want — this is
  *more* architecturally correct than the octagon's chamfered corners, not
  a compromise).
- Floor cap: `buildFloorCap()` generalized the same way (optional
  `pointsOverride`), so the nave gets the same solid-decking fix as every
  other tower-kit building (no seethrough gaps).
- Windows: 2 `pointed_arch` (lancet) windows per long side wall (4 total),
  evenly spaced, using the existing `buildWindow()` unchanged — placed via
  a new small pure-math helper `facePointAt(face, t)` (linear interpolation
  along a face's own `a→b` segment, extracted from the same math already
  inline in `buildWallSurfaceBlocks()`) so multiple windows can be spaced
  along one long wall (previously every tower-kit window sat alone, centered
  on its own ring — this is a genuinely new placement capability, kept as a
  small, pure, well-tested utility).
- Entrance: existing `buildEntrance()` unchanged, centered on the front
  gable wall.
- Roof: **new** `buildGableRoofCap()` (see below) — the one genuinely new
  primitive this design requires.

**Apse** — a small octagonal altar-niche projection at the rear, built with
the kit's **existing, completely unmodified** radial machinery: a small
partial octagon ring (reusing the market stall's own proven
`facesOverride`-driven partial-wall technique — faces facing the nave's
interior are omitted, so the altar niche is open toward the congregation,
not a sealed room), topped with a small `buildLivingRoofCap()` (always
living, never randomized — a deliberate identity choice: the altar always
sits beneath a living canopy, echoing the tree-integration motif already
established for the treehouse/market-stall's own roofs, and visually
distinguishing the sacred apse from the nave's new plain gable roof). The
relocated sacred crystal (the existing emissive octahedron, unchanged
material) sits on a small pedestal at the apse's own focal point, on-axis
with the entrance — visible in sightline down the nave on entry, directly
mirroring the Temple-of-the-Moon precedent. Docks flush against the nave's
back gable wall (the round-tower-church precedent: this seam is the
historically-attested detail, not something to hide).

**Bellcote** — a small pierced wall-slab centered on the entrance gable's
ridge (a `BoxGeometry` slab with 1-2 small recessed arch openings, reusing
`buildRecessedArchOpening()` at a small scale — the same carved-cavity
technique as every other opening in the kit, not a new technique), each
opening containing a small bell (a simple cone+sphere silhouette). Chosen
over a second full tower-kit instance per the research's real-world cost/
proportion argument for small parish churches.

**Forecourt** — the current shrine's 6 standing tree-stone monoliths are
**relocated, not deleted**: repositioned outdoors, flanking the entrance
path as a small "sacred grove" approach avenue, preserving the existing
shrine's identity as context around the new real building.

## New/generalized pieces, file by file

- **`StoneTowerShape.ts`** (extend, existing file — shared shape math,
  matches its own stated scope): add `rectanglePoints(halfW: number, halfD:
  number): [number, number][]` (4 corners, same `[x,z]` tuple shape and
  sin/cos-derived winding convention as `octagonPoints()`) and
  `rectangleFaces(halfW: number, halfD: number): OctagonFace[]` (4 faces,
  reusing the existing `OctagonFace` interface verbatim — front/right/
  back/left, `normalAngle` computed the same way `octagonFaces()` already
  does: `Math.atan2(midX, midZ)`). Also add `facePointAt(face: OctagonFace,
  t: number): [number, number]` (linear interpolation along `a→b` for
  `t ∈ [0,1]`; a small, pure, generically reusable utility distinct from
  `buildWallSurfaceBlocks()`'s own inline per-block placement math, which
  additionally handles course-offset/jitter that a window-placement caller
  doesn't need).
- **`StoneTowerFloorCap.ts`** (extend): `buildFloorCap(radius, material,
  vertexScales?, pointsOverride?)` — when `pointsOverride` is given, used
  directly instead of `octagonPoints(radius, vertexScales)`; UV
  normalization falls back to the max absolute coordinate across the
  override points (instead of `radius`) so UVs stay in a sane range
  regardless of shape. Every existing caller (which never passes this new
  parameter) is byte-for-byte unaffected.
- **`StoneTowerQuoins.ts`** (extend): `buildQuoins(radius, ringHeight,
  vertexScales, material, pointsOverride?)` — identical generalization
  pattern. Existing callers unaffected.
- **`StoneTowerGableRoof.ts`** (NEW — a generically reusable rectangular-
  hall roof primitive, not elven-specific, analogous to how
  `StoneTowerRoofCap.ts` holds the radial archetypes): `buildGableRoofCap
  (halfWidth: number, halfDepth: number, ridgeHeight: number, material:
  THREE.Material): THREE.Group` — two raked rectangular roof planes (thin
  `BoxGeometry`, tilted, meeting at a central ridge line running the nave's
  full depth, with a small eave overhang past the wall footprint matching
  the tower kit's own flared-eave convention), a ridge-cap beam along the
  peak, 2 gable-end triangular fill panels (small hand-built 3-vertex
  `BufferGeometry` triangles, same "filled triangle fan" technique
  `buildFloorCap()` already established — closes the open ends under each
  roof plane), and 2 small ridge-end finials (reusing the tower kit's own
  corner-finial vocabulary at the gable peaks) for decorative continuity.
- **`ElvenChapelKit.ts`** (NEW — elven-specific top-level composer,
  matching the `ElvenTreehouseKit.ts`/`ElvenMarketStallKit.ts` naming and
  responsibility convention exactly): `buildElvenChapelShrine(dna:
  BuildingDNA): THREE.Group` — composes the nave (walls + quoins + floor
  cap + 4 lancet windows + entrance + gable roof), the apse (partial-ring
  altar niche + living roof cap + relocated sacred crystal), the bellcote,
  and the forecourt standing-stones, all seeded via `dna.seed` with
  distinct XOR sub-seed tags matching this kit's established convention
  (e.g. `dna.seed ^ 0xC4A9E1` for the nave's own wall seed, further XORed
  per piece).

## Wiring

`FactionBuildingVariants.ts`'s `elven.chapel` entry changes from
`buildElvenChapel` to `buildElvenChapelShrine`. The old `buildElvenChapel`
function is deleted as dead code (confirmed via grep: its only two
references in the whole repo are its own definition and this one wiring
line — safe to remove outright, no other caller/test depends on it
directly; the generic cross-faction sweep test in
`FactionBuildingVariants.test.ts` calls through the dispatch table by
`BuildingKind`, not by function name, so it needs no change beyond
whatever new assertions this round adds).

## Test impact

- New dedicated test files: `StoneTowerGableRoof.test.ts`,
  `ElvenChapelKit.test.ts` (following this session's established rigor:
  valid/non-NaN geometry across a seed sweep, determinism, real block-course
  construction proof via named-subtree `BoxGeometry` counts, a genuine
  carved `ExtrudeGeometry` entrance/bellcote-opening, presence of exactly 4
  windows across both long walls, a living (never classic/pagoda) apse
  roof, and the relocated crystal's on-axis position).
- Extended existing test files: `StoneTowerShape.test.ts` (new
  `rectanglePoints`/`rectangleFaces`/`facePointAt` cases), `StoneTowerFloorCap.
  test.ts` / `StoneTowerQuoins.test.ts` (new `pointsOverride` cases,
  including an explicit backward-compatibility case proving the
  no-override path is unchanged).
- `FactionBuildingVariants.test.ts`'s stale `'Elven — remaining BlockKit-
  adjacent bits (chapel unaffected by the tower-kit rebuild...)'` describe
  block is rewritten: chapel IS now affected, and
  `buildElvenTrunkGrid`/`carveTrunkWindows` remain the only genuinely
  untouched BlockKit-adjacent primitives (their own doc comments already
  say they're reusable-but-unwired, which stays true).

## Note: `docs/BUILDINGS.md` is stale relative to this entire session's shipped work

`docs/BUILDINGS.md` (a broad, unmaintained early "vision doc" catalog) has
its own elven chapel entry: *"chapel (woodland shrine) — No walls — open
pillared colonnade, living tree as central column — Sacred grove."* This
predates and conflicts with the design above. However, it is **not treated
as a binding constraint**: this same doc's elven `watchtower` entry says
*"spiralling form, no battlements, open platform top"* and its `villa`
entry says *"garden terrace"* — neither matches the octagonal stone-tower
kit or living-tree treehouse home actually shipped and user-approved across
this entire session's rounds 1-8. This doc has been drifting from reality
since before this rebuild lineage started; every prior round already
implicitly superseded it without objection. Per this codebase's
`code_change_instructions` ("update documentation if it is directly related
to the changes you are making"), this round's implementation plan updates
`docs/BUILDINGS.md`'s elven chapel row to describe what's actually shipping
— a small, scoped doc-sync task, not a full audit of every other stale row
in that document (out of scope for this round).

## Out of scope for this round

- No change to `buildElvenStoneTower()`'s, `buildElvenTreehouseHome()`'s,
  or `buildElvenMarketStall()`'s own behavior — the two generalized shared
  functions (`buildFloorCap`, `buildQuoins`) both default their new
  parameter to `undefined`, reproducing prior behavior exactly for every
  existing caller.
- No attempt to generalize `buildWallSurfaceBlocks()`'s wall-strategy
  dispatcher (`buildWallSurface()`) itself for non-octagon shapes — the
  nave calls `buildWallSurfaceBlocks()` directly (Strategy G only, which is
  what's shipped anyway per `WALL_STRATEGY = 'blocks'`), bypassing the
  dispatcher, since Strategy T (the textured-cylinder comparison strategy)
  has no rectangular equivalent and isn't the shipped path.
- No second full bell-tower option — the research's real-world argument
  for a bellcote at this fixed small footprint is decisive; a fuller tower
  variant is explicitly deferred, not silently dropped (documented here so
  a future round can revisit it if a bigger "cathedral" building type is
  ever added).
