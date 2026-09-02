# Dungeon wall-corner pilaster dual-grid fix (Phase 4) — design spec

Status: drafted autonomously (background/autopilot mission, no interactive
user for the brainstorming Q&A — same precedent as Phases 1–3's design
specs). Ready for review before implementation.

## Origin

`TODO/organic_world_tiles_todo.md` Phase 4 is explicitly marked
speculative, requiring a scope check before starting: *"is procedural
dungeon room-shape generation actually wanted, or should Phase 4 instead
be narrower — e.g. only 'make hand-authored rectangular room corners read
as organic via the dual-grid chamfer trick' (much closer to a Phase 2
extension than a new generation system)?"* This spec documents that
investigation and the resulting scope decision.

## Investigation: is there a clean, small, additive hook point?

- Confirmed the roadmap's own prior finding still holds: `src/levels/`'s
  dungeon system (`DungeonGenerator.ts`, `TowerGenerator.ts`,
  `blueprint.ts`, `BlueprintRenderer.ts`) is entirely hand-authored JSON
  room blueprints (`blueprints/*.json`) with a generator that only decides
  **topology** (how many corridors, which rooms connect to which door) —
  `DungeonGenerator.ts`'s own header comment confirms each room's actual
  tile layout comes from a fixed JSON file, never algorithmically
  generated. Building genuine procedural room-*shape* generation from
  scratch would indeed be a much bigger, riskier lift than Phases 1–3, as
  the roadmap already flagged — that larger scope is **not** what this
  phase does.
- **However, `BlueprintRenderer.ts` (the room-rendering code, not the
  topology generator) already contains a "corner pilasters" system**
  (its own comment: *"softens the inner silhouette of circular walls...
  A low-poly (6-sided) cylinder at each such joint rounds the sharp
  angle"*) that does almost exactly what the roadmap's narrower
  alternative describes — it just does it with an incomplete ad-hoc
  neighbour rule instead of Phase 0's dual-grid case table. This is a
  genuine, small, additive fix to **existing, already-tile-grid-based
  rendering code**, not a new generation system.

### The existing rule, and the bug in it

For a wall tile, the existing code checks each of its 4 diagonal
neighbours; if that diagonal is *also* wall, it checks the 2 "bridge"
tiles (the tile's orthogonal neighbours toward that diagonal) and places
a pilaster **only if exactly one bridge is wall** (its own comment: "skip
buried interior corners [both bridges wall] and degenerate floating
corners [both bridges floor]").

Mapped onto the dual-grid vertex-classification framework this whole
roadmap uses (a "corner" is the vertex shared by 4 cells — here, the wall
tile itself, its diagonal neighbour, and the 2 bridge tiles): the existing
rule requires **diagonal = wall** as a hard prerequisite before even
checking the bridges. But `inner_corner` (exactly 3 of the 4 surrounding
cells occupied) is reachable **two structurally-symmetric ways** given the
wall tile itself is always one of the 3: either (a) diagonal + one bridge
are the other 2 occupied cells (the currently-handled case), **or** (b)
both bridges are occupied and the diagonal is the one empty cell — a
mirror-image configuration that is geometrically identical in spirit (a
wall mass forming an "L" around this vertex, with exactly one of the 4
surrounding cells being the open floor notch) but is **never reached by
the existing code**, since it returns early whenever the diagonal isn't
wall. Worked example: wall at `(0,0)`, `(1,0)`, `(0,1)`, floor at `(1,1)`
— a genuine concave floor notch at `(1,1)` that should get the same
softening pilaster as the currently-handled mirror case, but doesn't.

This is the same class of bug Phase 2 found and fixed in `BlockKit.ts`'s
`getChamferFlags()` (an ad-hoc partial-neighbour rule silently missing a
symmetric case a full dual-grid classification would catch) — verified by
hand for every one of the case table's 6 shapes against the existing
code's own stated intent (see "Testing plan" below), not just the one
newly-caught case.

## Chosen approach

Extract the corner-detection logic (currently inlined inside
`BlueprintRenderer.ts`'s large rendering function, using THREE.js
directly) into a new pure, testable module,
`src/levels/WallCornerPilasters.ts`, mirroring this whole roadmap's
established pattern (`ShorelineCornerField.ts`, `BlockKit.ts`'s
`getChamferFlags()`): `findWallCornerPilasterPoints(wallTileSet)` takes
the same `Set<string>` of `"x,z"` wall-cell keys `BlueprintRenderer.ts`
already builds (already excluding door and staircase-backing tiles,
preserving that existing filtering exactly), looks up each of a wall
tile's 4 corner vertices against Phase 0's `buildDualGridCaseTable(2)`,
and returns every vertex classified as `inner_corner` — regardless of
rotation, since the case table's classification is inherently
rotation-invariant, both currently-handled and previously-missed
sub-cases are caught by the identical lookup. `BlueprintRenderer.ts`'s
own pilaster-mesh-creation code is unchanged; only the corner-*detection*
loop is replaced with a call to this new function, converting each
returned grid-space point through the existing `cellToWorld()` helper
(confirmed to accept fractional cell coordinates, so no new conversion
math is needed — `cellToWorld(x + dx*0.5, z + dz*0.5, bp)` reproduces the
existing code's own `wx + dx*cellSize*0.5` world-position formula
exactly).

### Rejected alternative: full procedural dungeon room-shape generation

Rejected, per the roadmap's own explicit caveat and this investigation's
confirmation that no procedural shape generation exists to extend —
building one from scratch would be "build procedural dungeon generation
from scratch AND make it organic," a much larger, riskier, and more
speculative undertaking than this project's existing hand-authored
blueprint workflow may even want (the roadmap itself notes this may be a
*deliberate* choice for narrative/pacing reasons, not a gap). Not
attempted.

### Rejected alternative: leave the existing pilaster rule as-is

Rejected once the missed mirror-image case was found — this is a genuine,
concrete, low-risk bug fix using infrastructure this whole roadmap already
established, not a speculative "might be nice" addition.

## Scope

- New file: `src/levels/WallCornerPilasters.ts` (pure function, no
  THREE.js dependency).
- `BlueprintRenderer.ts`: only the corner-*detection* loop inside the
  existing "Corner pilasters" block is replaced with a call to the new
  function; the pilaster mesh/geometry creation itself, the wall
  rendering above it, and every other part of the file are untouched.
- No change to `DungeonGenerator.ts`, `TowerGenerator.ts`,
  `blueprint.ts`, or any hand-authored `blueprints/*.json` file — room
  topology and tile layouts are completely unaffected; only where
  decorative pilasters get placed on top of the existing wall geometry
  changes (strictly additive — more corners now correctly get a pilaster,
  none that previously got one lose it).
- The `outer_corner` case (a single, fully-isolated wall tile with floor
  on all 3 other surrounding cells) is deliberately **not** handled here,
  matching the existing code's own scope (its comment only ever discusses
  softening concave/"inner" silhouette steps of circular/stepped walls,
  never isolated free-standing wall pillars) — flagged as a possible, but
  unconfirmed-as-needed, future extension rather than assumed in scope.

## Testing plan

- New `tests/levels/WallCornerPilasters.test.ts`: hand-verify every one
  of the 6 dual-grid shapes against the existing code's own stated intent
  — `empty`/`full`/`edge`/`diagonal` never trigger a pilaster (matching
  today's "buried"/"degenerate" skip logic exactly); `inner_corner`
  always triggers one, for **both** the previously-handled sub-case
  (diagonal occupied, one bridge occupied) and the previously-missed
  mirror sub-case (diagonal empty, both bridges occupied) — this second
  assertion is the actual regression/bug-fix proof. `outer_corner`
  explicitly does NOT trigger a pilaster (confirms the deliberate scope
  boundary above, not an oversight). Determinism and no-duplicate-point
  dedup (matching the existing code's own `placedCorners` de-duplication)
  are also verified.
- Full regression suite + `tsc --noEmit` against the mission baseline —
  zero new failures permitted.
- Live verification: render a room whose blueprint has a stepped/circular
  wall boundary (the tower's circular floors, via `TowerGenerator.ts`,
  are the most natural candidate) and confirm pilasters now also appear
  at the previously-missed mirror-image notches, with no visual
  regression at the already-handled corners.

## Live verification finding (2026-09-02)

Ran both the old and new detection logic side-by-side (old logic
reimplemented inline, matching the pre-fix code exactly) against every
room in `generateTower(seed)`'s output, across 50 seeds. **Result: the
old and new logic produced byte-identical pilaster counts and positions
for every room, every seed tried — the previously-missed mirror-image
`inner_corner` sub-case never actually occurs in any currently-generated
tower chamber.** This is recorded transparently rather than glossed over:
the fix is proven **correct** by the targeted unit tests (a minimal
hand-constructed 3-tile configuration directly demonstrates the old code
misses a case the new code catches), but its real-world visual impact on
*currently-shipped* room geometry is not confirmed to be observable —
likely because `TowerGenerator.ts`'s specific circular-chamber
rasterization approach happens to only ever produce the previously-
handled sub-case's winding, not its mirror. The fix is still worth
keeping: it makes the classification correct *by construction* rather
than "correct by coincidence of what's been generated so far," and any
future room-shape change (a new hand-authored blueprint, a generator
tweak, or Phase 3's eventual settlement-plot work if it ever touches
interior spaces) could readily produce the previously-missed
configuration.

## Explicitly out of scope

- Procedural dungeon room-shape/layout generation (rejected above).
- The `outer_corner` case for isolated wall pillars (documented
  limitation, matching the pre-existing code's own scope).
- Any change to dungeon topology, room connectivity, or blueprint JSON
  content.
