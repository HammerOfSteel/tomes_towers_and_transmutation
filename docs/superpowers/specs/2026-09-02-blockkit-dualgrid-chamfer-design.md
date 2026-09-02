# BlockKit dual-grid chamfer classification (Phase 2) — design spec

Status: drafted autonomously (background/autopilot mission, no interactive
user for the brainstorming Q&A — same precedent as Phase 1's design spec).
Ready for review before implementation.

## Origin

`TODO/organic_world_tiles_todo.md` Phase 2: generalize `BlockKit.ts`'s
existing binary `getChamferFlags()` chamfer/sharp decision into the full
6-shape dual-grid case table (Phase 0's `DualGridCaseTable.ts`), the same
family of fix Phase 1 applied to shorelines.

## Investigation findings

- `getChamferFlags()`'s current rule: a cell's corner chamfers **iff both
  of its two orthogonal neighbour cells are empty** (e.g. the NW corner
  chamfers iff the N and W neighbours are both empty) — it never looks at
  the **diagonal** neighbour at all.
- Mapping this onto the dual-grid case table (treating the corner as a
  `WorldGrid`-style vertex shared by 4 cells — the diagonal cell, the two
  orthogonal cells, and the cell itself, which is always "occupied" since
  `getChamferFlags` is only ever asked about an occupied cell) shows the
  current rule **conflates two different dual-grid shapes**:
  - `outer_corner` (only the self cell occupied, diagonal AND both
    orthogonals empty) — a genuinely isolated tip. Chamfering this is
    correct and is the case the current rule was designed for.
  - `diagonal`/saddle (self AND the diagonal cell occupied, both
    orthogonals empty — two separate structures touching only at a single
    shared point). The current rule **also chamfers this**, since it only
    checks the two orthogonals — but chamfering here visually *pulls the
    two diagonally-touching structures apart* at the one point they'd
    otherwise share, which is a different (and arguably wrong, or at least
    undeliberate) visual outcome from the true isolated-tip case.
  - The other two reachable shapes (`edge`: one orthogonal occupied,
    read as a plain wall corner; `inner_corner`: both orthogonals
    occupied, only the diagonal differs) are **already handled correctly
    today** — both never chamfer under the current rule, which matches
    what a full dual-grid classification would also conclude (an `edge`
    corner isn't a convex tip; an `inner_corner`'s exposed faces are
    already occluded by its two solid orthogonal neighbours regardless of
    chamfer state, since face culling removes those sides entirely for
    the fully-occluded sub-case, and reads as a plain edge for the
    partially-occluded sub-case). `empty`/`full` are unreachable (the
    self cell is always occupied, ruling out `empty`; `full` needs both
    orthogonals occupied too, which — same as `inner_corner`'s fully-
    occluded sub-case — has both relevant faces culled, so its chamfer
    state was already invisible either way).
- **Net finding: the only real, user-visible gap is `outer_corner` vs.
  `diagonal` conflation.** No existing `BlockKit.test.ts` case exercises
  a diagonal-occupied + both-orthogonals-empty configuration, so this is
  a genuine untested/unaddressed corner (confirmed by hand-checking every
  existing chamfer test against the proposed new rule below — all 5
  pass unchanged; see "Testing plan").
- `getChamferFlags()` is only called internally within `BlockKit.ts`
  (`meshBlockGrid()`); no other module calls it directly, so this is a
  self-contained, signature-preserving change.

## Chosen approach

Generalize `getChamferFlags()`'s per-corner test to consult
`buildDualGridCaseTable(2)` (built once, module-level, mirroring
`ShorelineCornerField.ts`'s own pattern) instead of its current inline
two-neighbour check. For each corner, build the vertex's 4-cell config —
`[the corner's own diagonal neighbour, the two orthogonal neighbours,
the self cell]`, arranged in the case table's `[NW, NE, SE, SW]` winding
(the self cell always lands in whichever slot is diagonally opposite that
corner's own diagonal neighbour, by the same geometric fact Phase 1's
design spec already established: a shared vertex's "self" cell is always
opposite the diagonal cell and adjacent to both orthogonals, regardless of
which of the 4 corners is being evaluated) — and chamfer **iff the
resulting canonical shape is exactly `outer_corner`**.

This requires no direction/pull-vector math (unlike Phase 1's shoreline
corners) — buildings only need the yes/no chamfer decision, not a
displacement, so consuming just `DualGridCaseTable`'s `label` is
sufficient. `suppressChamfer` keeps its existing behaviour (checked first,
short-circuits to all-sharp) since it's a semantically separate concept
("this cell's style is deliberately hard-edged regardless of geometry"),
not a case-table decision.

### Rejected alternative: full kit-of-parts (6 authored/procedural meshes per canonical shape, replacing `blockGeometry()`'s outline generation)

This is the roadmap's originally-sketched Phase 2 shape (2.2–2.6: author
6 meshes per faction, wire a pilot faction behind a flag, live-verify with
the user before wider rollout). Rejected for this pass, same reasoning
Phase 1 used to reject a full render-grid restructuring: it's a much
larger, riskier rewrite (new mesh-instancing/rotation-placement
architecture replacing the existing, working, well-tested procedural
outline generator) for a payoff that the roadmap's own Phase 2.5 already
flags as needing **user sign-off before wider rollout** — not something
an autonomous pass can responsibly complete end-to-end anyway, since the
roadmap explicitly gates it on a live art-direction check-in. The
classification fix above is a strict, unconditional improvement
(fixes a real, previously-unaddressed visual ambiguity) that stands on its
own regardless of whether a future pass ever attempts the kit-of-parts
architecture — flagged explicitly as deferred future work, not silently
dropped.

## Scope

- Only `getChamferFlags()`'s internal classification logic changes.
  `blockGeometry()`, `buildBlockOutline()`, `meshBlockGrid()`, and every
  other export keep their exact existing signatures/behaviour.
- Applies uniformly to every faction's `BlockGrid` (all go through the
  same shared `meshBlockGrid()` → `getChamferFlags()` path) — no
  per-faction pilot/flag needed, since this is a strict correctness fix
  to the classification rule itself, not a new rendering style being
  introduced gradually.
- `suppressChamfer` is unaffected — still checked first, still forces
  all-sharp when it returns true.

## Testing plan

- Hand-verified every existing `BlockKit.test.ts` chamfer test against
  the new rule before writing any code (see "Investigation findings" —
  all 5 existing cases resolve identically under the new classification).
- New tests in `BlockKit.test.ts`: a genuine `diagonal`/saddle
  configuration (self + diagonal-only neighbour occupied, both
  orthogonals empty) must NOT chamfer under the new rule (this is the one
  behaviour change); confirm each of the 4 corners' diagonal neighbour is
  read from the correct cell (a full 3x3x1 sweep matching the case
  table's 6-shape enumeration, cross-checked against
  `buildDualGridCaseTable(2)`'s own already-tested output rather than
  hand-duplicating the classification logic).
- Full regression suite + `tsc --noEmit` against the mission baseline —
  zero new failures permitted, per this mission's established discipline.
- Live verification: this changes rendered building geometry only in the
  narrow diagonal-touching case, which is expected to be rare in existing
  faction profiles (most are stepped/mound/tiered shapes without isolated
  diagonal-only touches) — a full settlement screenshot before/after is
  the practical verification (rather than hunting for a specific
  diagonal-touch instance in a live world), confirming no unexpected
  building-silhouette regressions across the existing faction styles.

## Explicitly out of scope

- The kit-of-parts mesh-swap architecture (rejected above; deferred,
  documented future work — Phase 2's own roadmap items 2.2–2.6 remain
  unstarted and are not reinterpreted as "done" by this pass).
- Any change to `FactionBlockProfiles.ts`/`FactionBuildingVariants.ts`'s
  own procedural `BlockGrid` construction — this pass only touches how an
  already-built grid's corners are classified for chamfering.
- Settlement-parity/building-count regression testing beyond the existing
  suite — this change alters *mesh shape* only (which corners are
  softened), never which cells are occupied or how many buildings exist,
  so `OverworldScene.settlement-parity.test.ts`'s existing building/road
  count assertions are structurally unaffected and don't need a new
  sibling test (unlike the roadmap's original 2.4, written before this
  scope narrowing made a parity risk moot).
