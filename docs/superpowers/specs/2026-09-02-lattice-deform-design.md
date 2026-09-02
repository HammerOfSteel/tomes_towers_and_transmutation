# Lattice deformation for props (Phase 5) — design spec

Status: drafted autonomously (background/autopilot mission, no interactive
user for the brainstorming Q&A — same precedent as Phases 1–4's design
specs). Ready for review before implementation.

## Origin

`TODO/organic_world_tiles_todo.md` Phase 5: apply the "store every vertex
as a fraction of the module's own bounding box, then rebuild from a
target cell's own (possibly irregular) corner positions" lattice/cage
deformation technique to props, so e.g. a fence segment can stretch to
fit a variable gap instead of only uniform-scaling.

## Investigation findings

- The roadmap's own 5.1 explicitly says this phase is "sequenced last...
  should not be started before Phase 3 ships," reasoning that building it
  earlier "has no irregular geometry to target." Phase 3 shipped
  (`src/world/RelaxedMeshGrid.ts`) — but, per its own design spec's
  deliberate scoping, as **standalone infrastructure with no live
  settlement integration** (no irregular plot geometry exists in the
  live game yet, by design, pending the roadmap's own still-open
  questions). Phase 2's kit-of-parts (hand-authored building/prop pieces
  with AABB-fraction vertex data ready to deform) was similarly deferred.
  So, exactly as with Phase 3 and Phase 4, there is **no live target to
  fit props to yet** — the roadmap's own sequencing precondition for 5.1
  isn't literally met in the live game, only in the form of Phase 3's
  standalone, pure `buildRelaxedMeshGrid()` output.
- Confirmed via `src/prop-creator/builder.ts` (the live prop system,
  `buildProp(dna)`): props are built directly as THREE.js primitive
  geometry (boxes, cylinders) per archetype, with no AABB-fraction vertex
  representation at all today — matching the roadmap's own "what we
  already have" audit ("no lattice-deform technique yet... uniform
  scaling only").
- Given this, the same reasoning Phases 3 and 4 already used applies
  again: the **general-purpose lattice-deformation algorithm itself**
  (roadmap 5.2, "a small, reusable utility... likely shares code with
  Phase 3.3's building-module version") is genuinely standalone,
  well-defined infrastructure that doesn't require live prop-system
  integration to implement and test correctly — it just needs *some*
  target quad to deform into, and Phase 3's own `buildRelaxedMeshGrid()`
  output (or any hand-constructed test quad) already provides exactly
  that for testing purposes, without touching the live prop pipeline.

## Chosen approach: ship the bilinear lattice-deform utility standalone; defer live prop integration

Ships `src/world/LatticeDeform.ts` — a small, pure, engine-agnostic
utility implementing 2D (bilinear) cage deformation: given a "module"
(a flat list of vertices, each expressed as `[fx, fz]` fractions of its
own axis-aligned bounding box, `fx, fz` each typically in `[0, 1]`) and a
target quad's own 4 corner world positions (`[NW, NE, SE, SW]`, matching
this whole roadmap's established corner-order convention), computes each
vertex's deformed world position via bilinear interpolation of the target
quad using that vertex's own `(fx, fz)` as interpolation weights —
exactly the roadmap's own described technique, scoped to the 2D
(footprint) case first (roadmap's own phrasing: *"4 corner positions for
a 2D footprint... 8 corner positions for a 3D cell"* — 2D is the simpler,
narrower, and more directly useful starting scope for irregular *plot
footprints*, which is what Phase 3 actually produces; full 3D/trilinear
cage deformation for a whole 3D module is flagged as a natural, documented
future extension, not attempted here).

**No live integration** — mirrors Phases 3 and 4's own precedent: no
change to `src/prop-creator/builder.ts`, `ScatterRules.ts`, or any other
live prop/settlement file. This is deliberate, not an oversight: wiring
this into the live prop system would require *also* deciding which
specific props get deformed, sourcing real target quads from a live
(currently nonexistent) irregular-plot-edge pipeline, and probably
authoring genuinely new AABB-fraction vertex data for at least one prop
archetype — several more open design decisions than an autonomous pass
should resolve by guessing, exactly the same reasoning already applied to
Phase 3's live settlement integration and Phase 2's kit-of-parts.

### Rejected alternative: wire into `src/prop-creator/builder.ts` now, picking a "pilot" prop

Rejected for the reasons above — there is no live irregular target
geometry to deform into yet (Phase 3's own live integration is deferred),
so a "pilot" integration here would necessarily invent both ends of the
pipeline (fake target quads *and* a new prop authoring convention)
speculatively, which is a materially bigger and riskier scope than
"implement and test the interpolation math in isolation."

## Scope

- New file only: `src/world/LatticeDeform.ts` (pure functions, no
  THREE.js/prop/settlement dependency).
- 2D (bilinear, 4-corner) deformation only — 3D/trilinear cage
  deformation for full modules (not just footprints) is a documented,
  natural future extension, not attempted here.
- No changes to `src/prop-creator/builder.ts`, `ScatterRules.ts`, or any
  other live prop/scatter file.

## Testing plan

- A module's own 4 AABB-corner vertices (`fx, fz` each exactly 0 or 1)
  deform to *exactly* the target quad's own 4 corners, for any target
  quad shape (including a skewed/irregular one, e.g. one row of Phase
  3's own `buildRelaxedMeshGrid()` output) — this is the core "fits the
  cell exactly at its corners" guarantee the whole technique promises.
- A module's own center vertex (`fx=0.5, fz=0.5`) deforms to the target
  quad's own bilinear-interpolated center (the average of its 4 corners,
  for a quad where that average is well-defined/meaningful) — confirms
  interior points genuinely warp with the cage, not just snap to nearest
  corner.
- Deforming into a perfectly regular unit-square target quad reproduces
  the module's own original (pre-deform) local coordinates exactly
  (identity case) — a strong sanity check that the interpolation math
  itself is correct, independent of any irregular-quad edge cases.
- Determinism: same module + same target quad -> byte-identical output.
- No NaN/infinite output for a reasonably-irregular (but non-degenerate)
  target quad, including target quads sourced directly from
  `buildRelaxedMeshGrid()`'s own output (exercising the "shares code with
  Phase 3" reuse story the roadmap's own 5.2 suggests, at least at the
  test level).

## Explicitly out of scope

- Live prop-system integration (deferred, see "Chosen approach").
- 3D/trilinear cage deformation for whole modules (documented future
  extension).
- Piloting on one prop category (roadmap 5.3) — there's nothing live to
  pilot yet, by design, same as Phase 3.4/Phase 2's remaining rollout.
- Authoring new AABB-fraction vertex data for any real prop archetype.
