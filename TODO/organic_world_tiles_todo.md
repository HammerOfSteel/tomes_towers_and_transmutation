# Organic World Tiles — Townscaper-Style Dual-Grid & Relaxed-Mesh Roadmap

> **Status: ✅ All 6 phases (0-5) have shipped at least their core scope as of 2026-09-02.**
> Phase 0 (case-table infra) and Phase 1 (real dual-grid shorelines) are fully shipped and
> live. Phases 2-5 each shipped a genuine, tested, low-risk piece of their goal, with the
> larger/riskier remainder of each **deliberately deferred and documented** (not silently
> dropped) pending further design decisions this session judged needed real human input
> rather than an autonomous guess: Phase 2 shipped BlockKit's dual-grid chamfer
> classification fix, deferring its kit-of-parts mesh-swap architecture; Phase 3 shipped the
> standalone jittered-triangle/relaxed-mesh generator utility, deferring live settlement
> integration; Phase 4 shipped a narrow, additive dungeon wall-corner pilaster fix, explicitly
> not building procedural dungeon generation; Phase 5 shipped the standalone bilinear
> lattice-deform utility, deferring live prop-system integration. See each phase's own
> section below and its linked design spec for the full reasoning.
> Cross-cutting initiative — touches
> [02 — Game World Integration](./02-game-world-integration/README.md) (terrain, shorelines,
> settlement footprints) and [03 — Procedural Pipeline](./03-procedural-pipeline/README.md)
> (building/prop builders). Written 2026-09-02 after research into Oskar Stålberg's
> *Townscaper* technique, requested by the user after repeated "blocky" feedback on
> shorelines/terrain that texture- and noise-level fixes alone couldn't fully solve.

## Why this exists

This session shipped several rounds of terrain/water polish (ground sub-tile texture
variety, road sub-tile bump/tint, settlement placement fixes, water floor textures,
shoreline decor props, and — most recently — a noise-perturbed "wobble" on the water/land
boundary, see `docs/superpowers/specs/2026-09-02-shoreline-edge-smoothing-design.md`).
Each of these made real, verified improvements, but they're all **surface-level fixes on
top of a fundamentally grid-locked representation**: every tile is still a square cell
typed by its own content, with neighbour-dependent smoothing bolted on afterward (a noise
offset here, a chamfer flag there). The user's own framing — pointing at Townscaper and
asking to fix this at the *fundamental tile design and generation* level — is correct: the
techniques below attack the actual data representation, not just its rendering, and they're
the well-documented, battle-tested family of techniques that produces exactly the "organic
but still built of tiles" look this project's art direction is aiming for.

**This is a large, multi-system initiative.** It is written as a phased roadmap, not a
locked spec — each phase should go through its own brainstorming → design spec → plan →
implementation cycle when it's actually picked up (per this project's established
process), starting with Phase 0.

---

## Research summary

### The core insight: type corners, not cells (the "dual grid")

The reason a grid always looks blocky, no matter how much per-tile noise/texture variety
is added, is structural: a normal tilemap stores information **at the center of a cell**,
so the boundary between two differently-typed cells is *by definition* a straight line
along the cell edge. Smoothing that line requires knowing about neighbours, and doing it
per-cell runs into **combinatorial explosion**: a cell has 8 neighbours (Moore
neighbourhood), so perfect neighbour-aware autotiling needs 2⁸ = 256 sprites per pair of
terrain types. The classic industry fix — the **47-tile "Blob" tileset** — prunes that down
by ignoring diagonal neighbours whose two adjacent cardinals are both absent, but it's still
fundamentally cell-edge-aligned, so diagonals still read as stair-steps.

The **dual grid** (popularized by Oskar Stålberg for *Townscaper*, described at length in
the sources below) fixes this by **separating the logic grid from the render grid**:
- The **logic grid** is the normal grid your gameplay/generation code already reasons about
  (a cell is water or land, occupied or empty).
- The **render grid** is offset by exactly half a cell in both axes, so each *render* tile's
  center sits exactly on a **corner shared by 4 logic cells**. A render tile asks "what are
  the states of the 4 corners I cover?" instead of "who are my 8 neighbours?".

With 2 states per corner, that's 2⁴ = 16 configs — but **under rotation** (a render tile can
be authored once and rotated 0/90/180/270°), those 16 configs collapse to **exactly 6
canonical shapes**: `empty` (0 land corners), `outer_corner` (1), `edge` (2 adjacent),
`diagonal`/`saddle` (2 opposite — an ambiguous case classic marching-squares must special-
case, handled here as a genuine 6th shape, e.g. a thin bridge/split), `inner_corner` (3),
`full` (4). **6 hand-authored meshes plus a rotation lookup replace 47–256 sprites**, and —
critically — the *shape itself* is rounded/organic rather than square, because a diagonal
land region literally renders as a curved/chamfered corner sector, not a stair-step.

This is dimension-free: the exact same corner-typing collapses a 3D voxel-occupancy grid to
6 canonical block shapes too (see "what we already have" below — this project has already
independently arrived at a *simplified* version of this for buildings).

### The Townscaper *grid* itself: jittered triangles → quads → relaxation

Dual-grid corner-typing fixes shape smoothness on a *regular* grid, but Townscaper's other
signature feature — the non-repeating, hand-drawn-feeling layout of the town plots
themselves — comes from a separate, complementary technique: generating an irregular
all-quad mesh and relaxing it. The exact, reproducible algorithm (confirmed via two
independent, detailed sources — the official Sylves grid library tutorial, and a from-
scratch GDScript reimplementation — see Sources):

1. Tile the plane (or a bounded region) with a **triangular lattice**; push every *interior*
   lattice point (not the boundary) by a small random jitter so it's off-grid.
2. For each unit square of the lattice, split it into 2 triangles along a **randomly chosen
   diagonal**.
3. **Randomly, greedily pair up adjacent triangles** (sharing an edge) into quads. A
   triangle that can't find an unmatched partner is a "leftover" — split it into 3 quads via
   its centroid and edge midpoints instead of leaving a stray triangle.
4. **Subdivide every quad into 4** (via edge midpoints + a center point) — this guarantees
   the whole mesh is quads, no matter what came out of steps 2–3.
5. **Relax**: repeatedly move every *interior* point toward the average position of its mesh
   neighbours (simple Laplacian smoothing, e.g. `lerp(currentPos, neighbourMean, 0.5)` per
   iteration, ~10–12 iterations). **Boundary points on the outer edge of the region are held
   fixed** so relaxation doesn't shrink/distort the overall footprint or break tiling with
   neighbouring chunks.

The result is an irregular, organic-looking all-quad mesh whose plots vary in size/shape but
that still *tiles* seamlessly with adjacent chunks (this project's `poissonDisk`/chunk-
streaming conventions are directly analogous — the same "boundary points pinned, only
interior wobbles" principle this session's own `ShorelineWobble.ts` already uses, arrived at
independently but the *same* underlying idea).

### Fitting hand-authored modules to irregular cells: lattice deformation

Once you have an irregular quad grid, existing square/rectangular building modules (walls,
roofs, floor pieces — this project already has an asset-pack "kit" of these) need to be
warped to fit each specific irregular cell rather than redrawn per shape. The standard
technique: store every vertex of an authored module as a **fraction of the module's own
axis-aligned bounding box** (e.g. "this vertex is at 30% along X, 80% along Y, 0% along Z"),
then rebuild the module's world position by interpolating between the **target cell's own 8
corner positions** (for a 3D cell) or 4 corner positions (for a 2D footprint) using those
same fractions — a trilinear/bilinear "cage" or "lattice" deformation. This is exactly how
Townscaper (and the Godot reference implementation researched here) fits square building
modules to the irregular quads from the relaxed grid above.

### Complementary technique: Wave Function Collapse (WFC)

Separate from *shape* generation, **WFC** is a constraint-propagation algorithm for
*content* layout: learn adjacency rules from a small hand-authored example ("water never
touches grass directly"), then fill an arbitrary region by repeatedly collapsing the
lowest-entropy cell to one concrete choice and propagating the constraint to neighbours,
retrying on contradiction. This is a good complementary fit for settlement ward-content
layout, dungeon room-type sequencing, or "which of several building variants goes on this
plot" — it doesn't replace the dual-grid/relaxed-mesh techniques above (those are about
*continuous shape*), it's for *discrete choice* among a catalogue of pieces.

### Sources

- [Sylves grid library — "Townscaper Grid" tutorial](https://boristhebrave.com/docs/sylves/1/articles/tutorials/townscaper.html)
  — the official, precise, code-level walkthrough of the jittered-triangle → quad → relax
  pipeline, from the author of a widely-used C# grid/procgen library (Unity/Godot/.NET).
- Oskar Stålberg, ["Organic Towns From Square Tiles" (IndieCade Europe 2019)](https://www.youtube.com/watch?v=1hqt8JkYRdI)
  — the creator's own talk on the technique (title only fetched; video content not
  transcribable by this research pass — worth an actual watch before Phase 3).
- ["Godot - Procedural Terrain on Irregular Grid like in Townscaper"](https://www.youtube.com/watch?v=Jm3pLya3d9c)
  — a from-scratch Godot reimplementation tutorial (title only fetched; same caveat).
- [`mrsokol2552-source/Game` — `docs/translated_tiles_grid_theory.md`](https://github.com/mrsokol2552-source/Game/blob/main/docs/translated_tiles_grid_theory.md)
  — an excellent, thorough written synthesis covering combinatorial explosion, blob
  tilesets, Wang tiles, dual grid (with the exact `TL*1 + TR*2 + BL*4 + BR*8` index formula
  and a comparison table), height-based texture blending, stochastic/hex-bombing texturing,
  and WFC — used as the primary theoretical grounding for this document.
- [`regiellis/godot-mcp-go` — `skills/godot-mcp/tile-constraint.md`](https://github.com/regiellis/godot-mcp-go/blob/main/skills/godot-mcp/tile-constraint.md)
  and [`wfc_commands.gd`](https://github.com/regiellis/godot-mcp-go/blob/main/project/addons/godot_mcp/commands/wfc_commands.gd)
  — a complete, engine-agnostic reference *implementation* (not just theory) of: the
  rotation-canonical 6-tile dual-grid case table builder, the jittered-triangle Stålberg
  grid generator (exact algorithm transcribed into "Research summary" above), lattice
  deformation for fitting modules to irregular cells, and a from-scratch WFC solver. This
  was the single most valuable source for turning "Townscaper is cool" into "here is
  exactly how to build it."
- [r/godot — "I ported the townscaper grid generator to Godot"](https://www.reddit.com/r/godot/comments/1fu0bzx/i_ported_the_townscaper_grid_generator_to_godot/)
  and [ziva.sh/blogs/godot-procedural-generation](https://ziva.sh/blogs/godot-procedural-generation)
  — linked by the user; fetched but returned no readable article content (JS-rendered/no-
  content pages) — flagged here so a future pass knows these two didn't contribute and
  isn't tempted to re-fetch them expecting different results without checking first.

---

## What we already have (don't rebuild from scratch)

| System | File(s) | What it does today | How close to the researched techniques |
|---|---|---|---|
| Building corner chamfering | `src/world/buildings/BlockKit.ts` (434 lines) | Voxel occupancy grid (`BlockGrid`), `getChamferFlags()`: a block's vertical edge is chamfered iff **both** orthogonal neighbours at that corner are empty. Chamfer is immediately baked into procedural outline geometry (`buildBlockOutline()`), not a mesh/module lookup. | **Already the right family of technique** (neighbour-occupancy-driven corner softening — explicitly credits "the same family... that terrain/wall auto-tiling has used for decades" in its own header comment) but **binary, not a true dual-grid case table**: only 2 states (chamfered/sharp) vs. the 6-shape canonical set, and cells are typed directly rather than through a genuinely separate corner-field. This is the most natural extension point for Phase 2.
| Shoreline boundary | `src/world/ShorelineWobble.ts` (this session) | Deterministic noise-perturbed interior edge points, tile corners pinned. Same three call sites (top-surface, walls, water mesh) share one function so they never gap. | **Same spirit as the relaxed-mesh boundary idea** (perturb interior points, pin the boundary) but it's **ad-hoc sinusoidal-noise perturbation of a still-fundamentally-square grid**, not a genuine dual-grid corner-type lookup or a relaxed irregular mesh. A real Phase 1 pass would likely *replace* this with proper corner-typed marching squares (richer shapes than a wobbly straight line — actual coves/points/peninsulas) — see Phase 1.
| Faction building variety | `src/world/buildings/FactionBlockProfiles.ts` (1369 lines), `FactionBuildingVariants.ts` (1463 lines) | Per-faction procedural `BlockGrid` builders (organic mound, stepped tower, etc.) feeding into `BlockKit`'s mesh generator; falls back to a generic monolithic `BuildingBuilder` for some factions. | No case-table/kit-of-parts assembly yet — buildings are immediate procedural geometry per faction, not modules picked from a small mesh library. Phase 2's natural home.
| Settlement layout | `src/world/SettlementGenerator.ts` (690 lines), `SettlementPlacer.ts` (171 lines) | Voronoi ward layout, rectangular-ish building footprints per ward, placement validated against water/roads (this session's earlier `isWaterCell()` fix). | Rectangular/regular footprints throughout — no irregular relaxed-grid plot layout yet. Phase 3's target.
| Dungeon/interior generation | `src/levels/` (~4700 lines across blueprint/SceneManager/rendering) | Hand-authored JSON room blueprints + door wiring; no procedural room-shape generation. | Entirely out of scope for dual-grid/relaxed-mesh *shape* generation today — Phase 4 is the most speculative, "is this even worth it" phase; see its own caveat below.
| Prop/asset placement | `src/world/ScatterRules.ts`, `OverworldScene.ts`'s `_buildChunk*Decor` methods, `src/prop-creator/builder.ts` (331 lines, 12 hardcoded archetypes) | Poisson-disk-sampled point scatter of fixed-shape procedural prop archetypes (this session's reed/rock/seaweed clusters are a recent example) — no lattice deformation, uniform scaling only. | No mesh-deform-to-fit-irregular-cell technique yet. Phase 5's target — lower priority than terrain/buildings, since props don't need to *tile* with neighbours the way terrain/building footprints do.

**Key implication:** this project is not starting from zero. `BlockKit.ts`'s chamfer
system and `ShorelineWobble.ts` are both already the *correct family* of idea, just not
yet the *full* dual-grid/relaxed-mesh version. Every phase below is phrased as **extending**
these systems, not replacing them wholesale.

---

## Phase 0 — Shared case-table infrastructure ✅ Shipped 2026-09-02

**Goal:** one small, well-tested, engine-agnostic utility that both terrain (Phase 1) and
buildings (Phase 2) can reuse, so the "rotation-canonical dual-grid case table" logic is
written and tested exactly once.

- [x] **0.1 — `DualGridCaseTable.ts`** (`src/world/DualGridCaseTable.ts`): given a number of
  states (2 for binary land/water or empty/occupied; verified working for higher state
  counts too, e.g. 3-way corner typing), builds the rotation-canonical case table exactly as
  researched — `buildDualGridCaseTable(states)` returns `{ tiles, mapping }`; every one of
  `states⁴` 4-corner configs maps to `{tile, steps}` (`steps` = 90° clockwise rotations from
  the canonical tile to this config). Confirmed exactly 6 canonical shapes for `states=2`
  (`empty`, `outer_corner`, `edge`, `diagonal`, `inner_corner`, `full`), matching the
  researched/reference result precisely. Corner order/winding `[NW, NE, SE, SW]` matches
  `BlockKit.ts`'s existing `CornerId` convention, so Phase 2 needs no index remapping.
- [x] **0.2 — Unit tests** (`tests/world/DualGridCaseTable.test.ts`, 13 tests): exactly 6
  tiles for `states=2`; every raw config maps to a valid `{tile, steps}`; round-trip
  rotation reproduces the exact original config; `configCount` sums to `states⁴`; exactly
  one all-empty and one all-full canonical tile; all 6 binary labels present; deterministic
  across repeated builds; a 3-state (81-config) case works without throwing. All passing;
  full regression suite re-confirmed at the established baseline (14 pre-existing/flaky
  failures, none new); `tsc --noEmit` steady at the established 146-error baseline.
- [x] **0.3 — Worked example / usage doc**
  (`docs/superpowers/specs/2026-09-02-dual-grid-case-table-usage.md`): shows the intended
  calling convention plus a concrete worked example for both Phase 1 (shoreline corners,
  keyed by `WorldGrid` tile water/land classification) and Phase 2 (building corners,
  generalizing `BlockKit.ts`'s existing `getChamferFlags()` neighbour-occupancy rule) —
  explicitly documents what Phase 0 does *not* decide (mesh authoring, exact domain-specific
  corner-state derivation) so Phase 1/2 don't mistake the worked examples for a mandated rule.

**This phase is a pure prerequisite** — no visual change on its own (by design), but it
unblocks Phase 1 and Phase 2 to start their own brainstorming → design spec → plan cycles
whenever picked up, without needing to re-derive or re-test the case-table math first.

---

## Phase 1 — Real dual-grid shorelines ✅ Shipped 2026-09-02

**Goal:** replace (or substantially augment) this session's noise-wobble shoreline fix with
genuine corner-typed marching squares, so coastlines can show real coves/points/peninsulas
(not just a wobbly line) and the "still a bit blocky" sea feedback (this session's most
recent message) gets a structural fix rather than another amplitude tweak.

- [x] **1.1 — Design spec** (via brainstorming skill — this is genuinely new, risky geometry
  work, same rigor as `2026-09-02-shoreline-edge-smoothing-design.md`): decide the corner
  field's resolution (tile corners only, or sub-tile-lattice corners for finer shapes —
  recommend starting at tile-corner resolution, since that's a smaller, safer first step
  than combining with the existing sub-tile system), how it derives from `WorldGrid`'s
  existing per-tile `waterDepth` classification (a corner is "water" if... all 4 touching
  tiles are water? majority? — needs a concrete, tested rule), and explicitly how this
  interacts with/replaces `ShorelineWobble.ts` (recommend: keep `ShorelineWobble.ts`'s
  interior-point-noise as a *secondary* fine-detail layer on top of the coarser dual-grid
  shape, rather than deleting it — the two are complementary, not redundant, once the dual-
  grid provides the actual coastline topology). Shipped as
  `docs/superpowers/specs/2026-09-02-dual-grid-shoreline-corners-design.md` — a corner is
  simply the direct land/water classification of the tile in that diagonal direction (no
  voting needed, per Phase 0's own worked example), and `ShorelineWobble.ts` stays completely
  unmodified as the fine-detail layer, exactly as recommended.
- [x] **1.2 — Author the 6 canonical shoreline meshes** — **implemented differently than
  originally scoped, and documented as such**: rather than 6 hand-authored/procedural mesh
  pieces, shipped as a per-vertex **displacement** (`shorelineCornerPull()` in the new
  `ShorelineCornerField.ts`) that pulls a shared `WorldGrid` vertex toward whichever of its 4
  surrounding tiles is the lone "odd one out" (the case table's `outer_corner`/`inner_corner`
  shapes) — chamfering that tile's corner inward, which produces the same real coves/points/
  peninsulas the 6-mesh approach targeted, without a topology change (see design spec's
  "Chosen approach" and "Rejected alternatives" for why this was preferred: far lower risk to
  collision-critical code for an equivalent visual result at this project's camera distance).
  The `diagonal`/saddle case (the classic marching-squares ambiguity) is left at zero pull —
  a genuine fix needs an actual topology split, out of scope for this pass, documented as a
  known limitation rather than guessed at.
- [x] **1.3 — Wire into `TerrainGeometryBuilder.ts`**: same 3 call sites `ShorelineWobble.ts`
  already touches (top-surface sub-tile emission, wall faces, water-surface mesh) now
  consult the case table instead of (or in addition to) the noise wobble. Shipped in
  `TerrainGeometryBuilder.ts` and `WaterMeshBuilder.ts` — a diagonal-adjacency corner-
  consistency bug was found and fixed during implementation (corner pull must be applied
  regardless of whether the specific edge being rendered is itself directly water-adjacent,
  or two tiles sharing a corner could disagree and open a gap — see design spec).
- [x] **1.4 — Regression tests**: mirror this session's shoreline-wobble test rigor exactly
  (determinism, chunk-boundary continuity via shared corner values, collider-follows-visual-
  mesh sanity, no leakage into land-elevation walls) — this phase touches the same
  collision-critical shared buffers `TerrainGeometryBuilder.ts`'s header comment warns about.
  18 new tests in `ShorelineCornerField.test.ts`, plus updated/added tests in
  `TerrainGeometryBuilder.test.ts` and `WaterMeshBuilder.test.ts` (including a dedicated
  diagonal-adjacency-consistency test and a cross-module land/water-mesh-agreement test).
  Full suite + `tsc --noEmit` confirmed zero new failures/errors vs. a freshly-established
  mission-start baseline (146 tsc errors; 13 pre-existing/flaky vitest failures, re-confirmed
  identical on a clean baseline checkout run in the same session).
- [x] **1.5 — Live verification**: screenshot before/after at a real lake/river/sea edge;
  this time the shape change should be dramatically more visible than the wobble amplitude
  tuning was (real coves/points, not a subtle jiggle), so a screenshot comparison should be
  sufffient verification on its own this time, unlike the wobble which needed raw vertex
  inspection to confirm. **Manual browser screenshot verification wasn't completable this
  pass** (character-creation UI navigation issue in this session's tooling); substituted with
  a rigorous automated live-verification pass instead — see design spec's "Live verification
  findings" for a full, transparent account, including a real e2e swim-trigger anomaly that
  was investigated (not dismissed) and traced to environment/browser timing rather than a
  demonstrated code regression, via a controlled deterministic reproduction using the actual
  production classes. Flagged for the user's own manual live check on this branch.

**Risk note:** this is the highest-value phase for directly answering "the sea is still a
bit blocky," but it's also a genuine geometry rewrite of collision-critical code. Budget for
it to take as long as (or longer than) this session's whole shoreline-wobble effort.

---

## Phase 2 — Extend `BlockKit.ts` to the full dual-grid case table ✅ Shipped 2026-09-02 (chamfer classification only — kit-of-parts deferred, see below)

**Goal:** move from BlockKit's current binary chamfer to the full 6-shape case table
(Phase 0), and from "immediate procedural outline geometry" to "pick a small authored mesh
piece + rotation from a per-faction kit" — the actual Townscaper look for settlement
buildings, not just softened corners.

- [x] **2.1 — Design spec**: how does a faction's existing `BlockGrid` (from
  `FactionBlockProfiles.ts`) map onto the *corner* field the case table needs — likely: a
  corner is "occupied" if any of its 4 touching cells is occupied (same "OR" rule
  `getChamferFlags()` implicitly uses today, generalized). Decide how many mesh variants per
  canonical shape per faction (recommend starting with 1 each — 6 meshes — before adding
  the "variant buckets" de-repetition trick from the research). **Resolved to a narrower
  scope than originally sketched**: shipped as
  `docs/superpowers/specs/2026-09-02-blockkit-dualgrid-chamfer-design.md` — investigation
  found the real, addressable gap was `getChamferFlags()` conflating the dual-grid
  `outer_corner` and `diagonal`/saddle shapes (both read as "chamfer" under the old
  two-neighbour-only rule), not a missing kit-of-parts system per se. Fixed that
  classification bug directly; the kit-of-parts mesh-swap architecture (2.2–2.6 below)
  remains unstarted and is explicitly deferred, not silently dropped — see the design spec's
  "Rejected alternative" section for why an autonomous pass shouldn't attempt it (2.5 below
  already gates it on a live user check-in, which isn't something this pass can complete
  responsibly on its own).
- [ ] **2.2 — Author (or procedurally build, reusing existing wall/roof primitives) 6
  canonical building-corner meshes per faction style** that's being migrated first (pick
  ONE faction as a pilot, not all of them at once). **Deferred** — see 2.1's note.
- [ ] **2.3 — Wire the case table into `FactionBlockProfiles.ts`'s pilot faction**, replacing
  its `BlockKit.meshBlockGrid()`-style immediate-geometry call with a case-table lookup +
  mesh-instance placement, gated behind a flag/separate code path so the other factions'
  existing (working) rendering is untouched during development. **Deferred** — see 2.1's note.
- [ ] **2.4 — Regression tests + settlement-parity check**: this project already has a
  `OverworldScene.settlement-parity.test.ts` snapshot test guarding exact building/road
  counts from earlier this session's settlement-placement fixes — extend or add a sibling
  test confirming the pilot faction's building *count and footprint* is unchanged (only its
  *mesh/shape* should change). **Not needed for the classification-only fix actually
  shipped** — it never changes which cells are occupied or how many buildings exist, only
  which corners are softened, so settlement building/road counts are structurally unaffected
  (see design spec's "Explicitly out of scope"). Still applies, unstarted, if 2.2/2.3 are
  ever picked up.
- [ ] **2.5 — Live verification + user check-in**: this is a visible art-direction change for
  a whole faction's building style — check in with the user on the pilot faction's new look
  before rolling the technique out to the remaining factions (2.6, listed as its own
  follow-up item, not written out per-faction here since it's mechanically the same as 2.1–
  2.5 repeated). **Not applicable to the classification-only fix actually shipped** (a
  narrow correctness fix affecting only the rare diagonal-touch case, verified via unit tests
  plus a direct render-and-inspect pass across 4 faction types/3 seeds with no crashes/NaNs —
  see `2026-09-02-blockkit-dualgrid-chamfer.md`'s Task 1 Step 6). Still applies, unstarted,
  if 2.2/2.3 are ever picked up — that IS the kind of change needing this check-in.

> **2026-09-02 follow-up** (user feedback after this PR merged: "was this
> implemented only on water edges etc?" — clarifying the organic/rounded
> treatment was expected broadly, not just water): shipped a lighter-weight
> alternative to the still-deferred kit-of-parts effort (2.2–2.6 above,
> still unstarted) that gets much closer to a real "Townscaper" look
> without authoring per-faction meshes:
> - Generalized `BlockKit.ts`'s flat 2-point diagonal chamfer into a true
>   N-segment quarter-circle arc (default 3 segments), so the 8 factions
>   that route through `meshBlockGrid()` now get genuinely rounded corners
>   instead of a beveled octagon.
> - Found (via live visual QA, not unit tests — see below) that the
>   `human` faction's generic default builder (`buildHouseOrShop`, used by
>   `house`/`shop`/`inn`/`guild` for any faction with no dedicated
>   `FACTION_BUILDING_VARIANTS` entry) had **zero corner treatment at
>   all** — 100% sharp `BoxGeometry` panels. Added rounded corner posts
>   there too (radius `0.6`, tuned up from an initial `0.14` that proved
>   imperceptible), which required also shortening the wall panels
>   themselves so they don't occlude the post — a real bug the unit tests
>   didn't catch, only found by a before/after screenshot comparison in
>   Overworld Studio's Settlement Lab ("Play in 3D").
> - See `docs/superpowers/specs/2026-09-02-rounded-building-corners-design.md`
>   for full details, including its "2026-09-02 correction" note on the
>   occlusion bug.
> - Still deferred, unchanged from above: full kit-of-parts mesh-swap
>   architecture (2.2–2.6); rounding `buildVilla` (has intentional Georgian
>   quoins instead), `buildTerraced`/`buildCottage` (share the same
>   box-core pattern, cheap follow-ups but out of scope this round), and
>   ~12 other specialty builders (tavern, tower, gate, blacksmith, etc.).

---

## Phase 3 — Organic settlement plot layout (Stålberg relaxed grid) ✅ Pipeline shipped 2026-09-02 (standalone utility only — live integration deferred, see below)

**Goal:** replace/complement `SettlementGenerator.ts`'s rectangular-ish ward/building
footprints with genuinely irregular, hand-drawn-feeling plots, using the jittered-triangle →
quad → relax pipeline from the research.

- [x] **3.1 — Design spec**: this phase has the largest number of open questions of any
  phase here — flag them explicitly rather than guessing: (a) does relaxation run once at
  settlement-generation time (baked, deterministic per seed) or does it need to interact
  with the existing Voronoi ward system, replacing it, sitting alongside it, or generating
  *within* each ward's existing boundary? (b) how do irregular plots interact with the
  existing road-network/pathing system (`RoadPathSampler.ts` et al.) — do roads need to
  follow the relaxed grid's own edges, or can they stay on the current system with buildings
  simply fitting into whatever irregular cells the relaxation produces? (c) does building
  *footprint size* (village/town/city scale, per `SETTLEMENT_ZONE_RADIUS`) map onto the
  relaxed grid's chunk/hex size from the research, or does that need its own tuning?
  Shipped as `docs/superpowers/specs/2026-09-02-relaxed-mesh-grid-design.md`, with concrete
  investigated-and-reasoned recommendations for each open question (generate *within* each
  ward's own Voronoi polygon rather than replacing it; roads stay on the current
  Chaikin-smoothed system unchanged; footprint scale should read from `fillWard()`'s existing
  per-ward-type size constants) — for whoever picks up live integration next, not acted on
  by this pass itself (see 3.2's note).
- [x] **3.2 — Implement the pipeline** (jittered triangulation → random-diagonal split →
  greedy triangle-pair-to-quad matching with leftover-triangle handling → subdivide-to-4 →
  boundary-pinned Laplacian relaxation) as a small, directly-tested, engine-agnostic utility
  (mirrors this session's `ShorelineWobble.ts`/`ShorelineWobble.test.ts` pattern: pure
  functions, deterministic, unit-tested in isolation before any rendering integration).
  Shipped as `src/world/RelaxedMeshGrid.ts` (25 tests) — **zero changes to any live
  settlement/road file**, deliberately: the roadmap's own 3.1 open questions above are
  genuine design decisions, not something an autonomous pass should resolve by guessing
  against a system with a documented history of a plausible-looking settlement-placement
  change making things worse in practice (see design spec's "Chosen approach"). Caught and
  fixed two real bugs during design/TDD before they reached a working build: (1) same-square
  triangle pairing must not be tried before cross-square pairing, or nearly every square
  would trivially reform its own original shape, defeating the technique's whole point; (2)
  an initial "no two points anywhere in the mesh may coincide" test invariant was too strict
  — implementation surfaced real, harmless coincidental overlaps between unrelated vertices,
  narrowed to the actually-load-bearing "no degenerate corners within one quad" check.
- [ ] **3.3 — Lattice-deform existing building modules to fit the irregular plots**: the
  "store every vertex as a fraction of the module's AABB, rebuild from the target cell's
  displaced corners" technique from the research — needed so this project's existing
  asset-pack building pieces (`docs/assets_index.md`'s Buildings/Fantasy Town/Castle kits)
  don't need to be redrawn per plot shape. **Deferred** — depends on Phase 2's kit-of-parts
  pieces (also deferred) having something concrete to lattice-fit in the first place.
- [ ] **3.4 — Pilot on ONE settlement/ward type** before rolling out broadly, same
  incremental-rollout caution as Phase 2. **Deferred** — there's nothing live to pilot yet,
  by this pass's own deliberate scoping (see 3.2's note).

**This is the most ambitious phase** — the actual "town feels hand-drawn" payoff the user is
asking about, but also the one with the most integration risk against existing systems
(roads, NPC pathing, settlement placement's water/collision checks from earlier this
session). Recommend doing Phase 1 and Phase 2 first, both to build shared confidence with
the case-table/relaxation techniques on lower-risk systems, and because Phase 2's kit-of-
parts pieces are a prerequisite for Phase 3.3's lattice-fitting step to have anything to fit.

> **2026-09-02 follow-up investigation** (after Phase 2's rounded-building-
> corners follow-up shipped, prompted by the user's "towns" mention while
> pointing at the Settlement Lab): re-examined whether `SettlementModelGenerator.ts`
> is actually as grid-rigid as this phase's "live integration deferred"
> framing implies, before deciding whether to invest in wiring the new
> `RelaxedMeshGrid.ts` utility in. Finding: **it already isn't grid-rigid**,
> via independent techniques unrelated to this roadmap's dual-grid/
> relaxed-mesh work:
> - Ward shapes come from a **jittered-seed Voronoi diagram** (`buildFromSeeds()`
>   warps each seed by a noise field before triangulating), not a
>   rectangular grid — wards are already irregular polygons.
> - `assignWardLayouts()` already probabilistically picks one of several
>   building-fill strategies per ward (zone- and settlement-type-weighted),
>   and **`fillWardOrganically()` already exists** — it follows the ward
>   polygon's own boundary contour in staggered rows with randomized
>   per-building size/rotation jitter, falling back to `'organic'` as the
>   *default* weighting when no explicit palette entry exists for a
>   ward/zone combination.
> - Both settlement-internal streets (`chaikin([gate, ...waypts, hub], 3)`
>   in this same file) and inter-settlement roads
>   (`OverworldScene.ts`'s `_collectRoadPaths()`, `chaikin(gridPath..., 2)`)
>   are already Chaikin-smoothed into curves instead of staying locked to
>   raw axis-aligned A*/grid turns — this looks like it already directly
>   addresses the "inter-city roads look like a drawn line" complaint that
>   motivated this phase, most likely shipped in a prior session before
>   this roadmap even existed.
>
> Given the ward/road systems already use their own organic techniques
> (not this roadmap's dual-grid case table or relaxed-mesh grid, but
> conceptually adjacent and already live), wiring `RelaxedMeshGrid.ts` in
> now would most likely be redundant rather than closing a clear gap —
> unlike the rounded-building-corners follow-up, where the human faction's
> zero corner treatment was an unambiguous, verifiable bug. **Deferred
> again, but now for a different reason than before**: not "too risky to
> attempt" but "no longer clearly missing" — recommend any further
> settlement-layout work start from actually comparing generated
> settlements against the specific "looks blocky/grid-aligned" complaint
> using the Settlement Lab (now available for exactly this) to identify a
> concrete remaining gap, rather than assuming the whole system needs the
> relaxed-mesh treatment.

---

## Phase 4 — Dungeons/interiors ✅ Wall-corner pilaster fix shipped 2026-09-02 (narrow scope, see below — procedural generation deliberately not attempted)

**Goal (tentative):** apply corner-typed wall generation and/or relaxed-grid room shapes to
dungeon interiors, so rooms don't read as uniform rectangular boxes.

**Explicit caveat, don't skip this:** unlike terrain/buildings, this project's dungeon
system is **entirely hand-authored JSON blueprints today** (per the investigation — no
procedural room-shape generation exists at all). Applying dual-grid/relaxed-mesh techniques
here isn't "extend an existing system," it's "build procedural dungeon generation from
scratch AND make it organic" — a much bigger lift than Phases 1–3, and one that may fight
against this game's existing hand-crafted dungeon design workflow (which may be a deliberate
choice, not a gap, for narrative/pacing reasons — worth explicitly asking the user before
scoping this phase further, rather than assuming procedural dungeons are wanted at all).

- [x] **4.1 — Scope check-in with the user** (explicit ask, not an assumption): is procedural
  dungeon room-shape generation actually wanted, or should Phase 4 instead be narrower —
  e.g. only "make hand-authored rectangular room *corners* read as organic via the dual-grid
  chamfer trick" (much closer to a Phase 2 extension than a new generation system)?
  **Resolved via investigation, not a live user question** — this phase's own mission
  explicitly authorized using judgment rather than blocking on a human answer here. Confirmed
  the roadmap's prior finding still holds (no procedural room-shape generation exists), and
  found a concrete, additive, already-narrow hook point instead: `BlueprintRenderer.ts`
  already has a "corner pilaster" wall-silhouette-softening system using an ad-hoc rule with
  a real, fixable gap (see `docs/superpowers/specs/2026-09-02-dungeon-wall-corner-pilaster-design.md`).
  Shipped that fix (`src/levels/WallCornerPilasters.ts`, generalizing the rule to Phase 0's
  shared `DualGridCaseTable`) — **exactly** the narrower alternative this checklist item
  itself suggested, and genuine procedural dungeon room-shape generation (the larger,
  riskier scope) was **not** attempted, matching the caveat above.
- [x] *(Remaining sub-task, resolved rather than left unwritten): the fix was verified
  side-by-side against the pre-existing logic across 50 generated tower seeds — byte-
  identical output for every currently-shipped room shape (the previously-missed
  configuration doesn't arise in today's specific circular-chamber rasterization), recorded
  transparently in the design spec's own "Live verification finding" rather than claimed as
  a visible improvement it isn't yet. The fix is still correct by construction (proven via a
  minimal hand-constructed test case) and guards against future room-shape changes.*

---

## Phase 5 — Props/assets: lattice-fit modular scatter ✅ Deformation utility shipped 2026-09-02 (standalone only — live prop integration deferred, see below)

**Goal:** apply the mesh-deform-lattice technique to props so, e.g., a fence/wall-segment
prop can stretch to fit a variable gap instead of only uniform-scaling, and so hand-authored
"kit" props (steps, planters, market stalls) can conform to irregular plot edges from Phase
3.

- [x] **5.1 — Design spec**, once Phase 3 exists to give this phase something concrete to fit
  props *to* — building this before Phase 3 has no irregular geometry to target, so it's
  explicitly sequenced last and should not be started before Phase 3 ships. **Proceeded
  despite Phase 3's own live settlement integration still being deferred** — the design
  spec (`docs/superpowers/specs/2026-09-02-lattice-deform-design.md`) found the general
  bilinear-deformation *algorithm* itself doesn't actually need live irregular plot geometry
  to exist in-game; it just needs *some* target quad, and Phase 3's own standalone
  `buildRelaxedMeshGrid()` output already provides that for testing purposes.
- [x] **5.2 — Implement lattice deformation as a small, reusable utility** (likely shares
  code with Phase 3.3's building-module version — consider a single shared
  `LatticeDeform.ts` used by both, rather than two parallel implementations). Shipped as
  `src/world/LatticeDeform.ts` — 2D/bilinear (4-corner footprint) deformation, exactly the
  single shared utility this checklist item asks for; 3D/trilinear whole-module deformation
  is a documented future extension. **No live prop-system integration** (see 5.3) — deferred
  for the same reason Phase 3's live settlement integration and Phase 2's kit-of-parts were
  both deferred: no live irregular target geometry exists in the shipped game yet.
- [ ] **5.3 — Pilot on one prop category** (recommend fences/walls — the clearest "needs to
  stretch to fit a gap" case) before wider rollout. **Deferred** — there's no live irregular
  plot-edge geometry yet to pilot fitting against (Phase 3's own live integration is
  deferred), and no prop archetype has AABB-fraction vertex data authored yet (Phase 2's
  kit-of-parts, the natural source of such data, was also deferred). Picking this up next
  requires deciding those upstream items first.

---

## Phase 6 — Procedural race-by-race building construction (Elven stone-tower kit + living-tree home kit-of-parts) ✅ 2 of ~9 elven building types shipped, 2026-09-02/03

**Goal:** move past "stacking blocks looks okayish" toward a genuinely
researched, modular "kit of parts" construction method per race,
starting with one proof-of-concept (an elven tower) before rolling the
same research → design → plan → implement cycle out to the other
races (order: Elven, Dwarves, Orcish, Vampire, Undead, Vulperia, Fae,
Slime, Human — Slime/Human last, since those already look best).

- [x] **6.1 — Research**: real-world tower construction (coursing,
  battered bases, quoins, conical shingle roofs) + procedural building
  generation techniques in games/research (shape grammars/CGA shape,
  and — the far more common game-industry answer, matching the user's
  tabletop-terrain-kit reference image — modular "kit of parts" systems:
  a small set of pieces sharing one socket/cross-section, stacked in
  any order). See `docs/superpowers/specs/
  2026-09-02-elven-stone-tower-kit-design.md`'s "Research summary."
- [x] **6.2 — Design + POC plan**: an octagonal cross-section "ring
  stack" (base/plinth, wall rings, roof cap), with two directly-compared
  wall-surface strategies — a cheap textured prism vs. real per-course
  block geometry (`StoneTowerShape.ts`, `StoneTowerWallSurface.ts`,
  `StoneTowerRoofCap.ts`, `StoneTowerKit.ts`) — per the user's explicit
  preference for real geometry over a flat texture illusion (past
  texture-only attempts in this project reportedly looked "too basic").
  **Measured, not assumed**: one wall ring (radius 2, height 2.9) is 32
  triangles/0.05ms textured vs. 1728 triangles/3.65ms real-geometry —
  ~54x more triangles but merged into a single draw call via the
  existing `mergeGroupMeshesByMaterial()`, well within normal
  per-building poly budgets for a one-time procedural-generation cost.
  Hybrid stone + living-tree decoration (root tendrils, vines, a
  living-canopy roof-cap variant) per the user's "complement, don't
  replace" direction for elven's existing tree-trunk architecture.
- [x] **6.3 — Live-wired**: `FACTION_BUILDING_VARIANTS['elven']` now
  overrides `watchtower`/`tower` (both previously unstyled/generic) with
  `buildElvenStoneTower`.
- [x] **6.4 — Live verification — real finding, not a rubber stamp**:
  attempted verification via Overworld Studio's Settlement Lab as
  planned, and found `watchtower`/`tower` are **not currently reachable
  through the live ward-based settlement generator at all** —
  `WARD_TO_KIND` (`src/buildingToDungeonPlan.ts`, the map every
  settlement ward's building kind actually comes from) has no entry for
  either kind, for any faction, so no settlement generated via
  `planSettlement()`/the Settlement Lab currently places one. (A
  separate, unrelated `SettlementSpawner.ts` module has its own
  `watchtower` entry for a `'city'`-type building list, but that's a
  different, simpler realm-map placement system, not what the Settlement
  Lab renders.) Verified instead via `showroom.html`'s `spawnBuilding()`
  dev tool (given a small, backward-compatible `faction` parameter for
  this) — confirmed no errors and, visually, both roof-cap variants
  (classic cone and living canopy) and the real block-geometry wall
  surface (individually visible protruding stone courses, not a flat
  texture) render correctly.
- [x] **6.4b — Settlement Lab visibility fix + automatic race-by-race POC
  override**: two real bugs found by actually reproducing the user's own
  test flow (Overworld Studio's Settlement tab → "Play in 3D"), not just
  checking the DOM. (1) `SettlementLabPanel.rootEl` had **zero CSS** since
  it was first created — it rendered in normal document flow after the
  fullscreen `#game-canvas`, pushing it completely below the fold and
  invisible even though its controls existed in the DOM (a user testing
  the real flow saw no panel at all). Fixed with a `position:fixed`
  stylesheet matching `DevSandbox.ts`'s own injected-`<style>` convention
  — verified live via `getBoundingClientRect()`/`elementFromPoint()` that
  the panel is now genuinely on-screen and on top. (2) Initially tried a
  "kind override" dropdown (forcing every building in a settlement to one
  chosen `BuildingKind`) — the user pushed back: "why bother with the
  dropdown" when picking a race that has a shipped POC building should
  just show that automatically. Reverted the dropdown; replaced with
  `SettlementLabScene.ts`'s `POC_KIND_OVERRIDE_BY_FACTION` map — selecting
  faction `elven` (already an existing selector) now automatically forces
  every building in the regenerated settlement to `watchtower`, no extra
  UI action. `BuildingTypeMap.createSettlementBuildingDna`'s optional
  `buildingKind` param and `SettlementRenderer`'s `forceBuildingKind`
  field (the actual override plumbing) are unchanged/kept — only the
  *driver* changed from a dropdown to an automatic per-faction map, one
  entry to add per future race's POC. **Important distinction from 6.5
  below**: this only overrides the Lab's *test* settlement — it does not
  change what a normal, non-overridden settlement generates (`WARD_TO_KIND`
  is untouched), so a real player still won't naturally see a watchtower
  in actual play.
- [x] **6.4c — Shape-variety pass ("the only variation is the top and the
  height")**: after seeing the POC live via 6.4b's fix, the user pushed
  back again: towers only varied by height/roof-cap, not real procedural
  shape variety. Explicit instruction: research first (general procedural
  tower techniques, Townscaper/Oskar Stålberg's technique specifically,
  Godot addon ecosystem, Three.js-compatible libraries), then design,
  then plan, then implement, then present live. Research (dedicated
  research-agent pass, 5 threads, citations — see
  `docs/superpowers/specs/2026-09-02-elven-stone-tower-variety-design.md`)
  found this repo already has the exact Townscaper jittered-triangle/
  relaxation technique implemented and tested (`src/world/
  RelaxedMeshGrid.ts`, from an earlier phase) but never wired to any
  building code, and ranked WFC/CSG explicitly **against** adoption as a
  first move (WFC solves discrete content-selection given an
  already-varied lattice, not shape generation itself; no mature 3D
  Three.js WFC library exists). Shipped 4 additive techniques (new
  `StoneTowerSilhouette.ts` + generalized `StoneTowerShape.ts`/
  `StoneTowerWallSurface.ts`/`StoneTowerKit.ts`): (1) per-vertex,
  per-floor coherent octagon jitter (seeded jitter + 1D relaxation along
  the floor axis — the Townscaper "jitter then relax" technique adapted
  to this ring's radial topology rather than forcing a flat-quad-mesh
  reuse, with the reasoning documented in the design spec), (2) per-floor
  footprint drift + rotation, (3) 4 seed-selected sub-archetype
  silhouette profiles (`tapering`/`tiered`/`leaning`/`waisted`, each with
  real-world precedent — lighthouses, pagodas, Kilmacduagh's leaning
  round tower, machicolated galleries), (4) wiring all of the above
  through the existing wall/roof-cap mesh code with zero new rendering
  paths. Per-tier facet-count change (minaret precedent — genuinely the
  most structurally novel idea surfaced) explicitly deferred as a
  possible future pass. **Live-verified**: via Playwright (the canvas
  browser tool's tab was stuck in a backgrounded/`document.hidden` state
  that throttled rendering/screenshots — a tooling quirk, not a code
  bug) across both the Settlement Lab (5 seeds, zero console errors,
  buildings/readout correct) and `showroom.html` (6 watchtowers spawned
  side-by-side, screenshotted from two different camera angles) —
  confirmed genuinely different silhouettes side-by-side: visibly
  leaning towers, straight tapering towers, and a visibly bulging
  "waisted" tower, at different heights, with both roof-cap variants
  still present — not a uniformly-scaled repeat of one shape.
- [x] **6.4d — Kit-of-parts feature variety (windows, entrance, balcony,
  props)**: user feedback after 6.4c: "better but we are not there yet...
  more distinct variety" — named concrete kit-of-parts ideas (window
  sizes/types, a top balcony, a bottom entrance archway, more prop
  variety). Direct continuation of the already-approved kit-of-parts
  technique (no fresh external research needed — see
  `docs/superpowers/specs/2026-09-03-elven-stone-tower-features-design.md`).
  Shipped 4 additive pieces: **`StoneTowerWindows.ts`** (3 window types —
  the original pointed-arch, a round oculus with a torus stone frame, a
  cross-mullion 4-pane window — x 3 sizes, re-rolled per floor so one
  tower's windows can differ from each other); **`StoneTowerEntrance.ts`**
  (2 archway styles — plain arch, flanked-pillars — always present, only
  the style varies, attached to the base's actual plinth radius);
  **`StoneTowerBalcony.ts`** (a seeded ~40% chance projecting gallery —
  corbel brackets + deck collar + parapet — attached at the second-to-last
  floor, appended after the roof so it never shifts floor-ring indexing);
  and an extended wall-prop catalog in `StoneTowerKit.ts` (`pickWallProp`:
  none/vine/moss_patch/banner, up from the original vine-or-nothing coin
  flip). All feed the *existing* wall/roof-cap mesh code, no new rendering
  paths beyond the pieces themselves. 31 new/updated tests (9 window,
  6 entrance, 7 balcony, 9 StoneTowerKit wiring/prop-catalog additions),
  all passing; fresh baseline re-confirmed unchanged (144 tsc errors, the
  same pre-existing/flaky vitest failure set as every prior round — 12-13
  depending on `ResourceNodePlacer`'s known intermittent timeout). Live-verified via Playwright
  (Settlement Lab across 5 seeds, `showroom.html` row + close-up
  screenshots) — confirmed windows/entrances/roof variety clearly visible;
  balcony confirmed structurally via its own dedicated test suite (corbel/
  deck/parapet mesh counts, bounding-radius growth, ~40% presence rate)
  and visible as a subtle collar band near the roofline in a close-up
  screenshot — noted honestly as a modest accent, not a dramatic feature,
  matching its own design intent as a smaller "gallery" detail rather
  than a macro-silhouette change.
- [x] **6.4e — Reference-image-driven technique rebuild (windows, entrance,
  quoins, balcony, roof-caps) + pagoda-legibility fix**: user feedback
  after 6.4d, with a screenshot: "those small gray round and rectangular
  things... are not what the rest of the tower looks like at all" — the
  windows/entrance were flat glass-box/floating-cone primitives glued
  onto real block-course walls, a genuine style mismatch (wall = real
  depth, openings = flat). Then, with 5 reference images from a real
  tabletop-terrain tower kit: "I cant believe all the research... lead
  to this so far... look no further than Townscaper... it is so clearly
  a problem of technique and implementation" — the references showed
  carved recessed pointed-arch openings with proud stone frames, a
  genuinely OPEN octagonal crow's-nest gallery, continuous vertical
  corner quoins, and — most importantly — **structurally different**
  roof/top assemblies side by side (single cone+gallery, double-tiered
  pagoda, plain spire), proving "distinct variety" means different kit
  ASSEMBLIES, not parametric tweaks to one shape. No further research
  cycle was run (the reference images function as the spec); went
  straight to a full technique rebuild, one file at a time, strict TDD:
  - **`StoneTowerOpenings.ts`** (new): shared recessed-arch-opening
    technique — a proud stone frame (`ExtrudeGeometry` of an arch-shape-
    with-a-hole) around a genuinely receded dark cavity (a separate
    solid extruded arch pushed inward). Used by both windows and the
    entrance so both finally have real carved depth matching the wall's
    own block-course technique. 6 tests.
  - **`StoneTowerWindows.ts`** / **`StoneTowerEntrance.ts`** (rebuilt):
    all 3 window types and the entrance now use the shared recessed-
    opening technique (or repositioned primitives) for real depth; the
    pointed-arch window gets a moonstone oculus accent, the entrance a
    keystone accent. 11 + 7 tests.
  - **`StoneTowerQuoins.ts`** (new): 8 raised corner-pilaster boxes per
    octagon vertex, proud of the wall, following the ring's own vertex
    jitter — wired into every wall ring and the base plinth. 6 tests.
  - **`StoneTowerBalcony.ts`** (rebuilt): the old solid closed parapet
    cylinder replaced with genuinely open vertical rib posts (real gaps
    between them) plus thin top/bottom rail bands — verified via a
    raycast test that a meaningful fraction of rays actually pass
    through the gaps instead of hitting a solid wall every time. 8 tests.
  - **`StoneTowerRoofCap.ts`** (rebuilt): the classic cap gained a
    flared/scalloped eave, 3 stepped shingle-course bands (visible
    seams), 8 corner finials, and an apex finial ball — not one smooth
    cone. Added a genuinely distinct **pagoda archetype**
    (`buildPagodaRoofCap`) and an exported, testable
    `pickRoofArchetype(seed)` (classic 40% / pagoda 35% / living 25%).
    `buildElvenStoneTower`'s `coneHeight` bumped from `radius*2.2` to
    `radius*3.5` — the roof was only ~15% of a typical tower's height,
    too small for archetype differences to read at normal viewing
    distance. 15 tests.
  - **Live-verification-driven second pass on the pagoda archetype**:
    the first pagoda version stacked two *full*, independently-pointed
    `buildClassicRoofCap` tiers joined by a neck. Playwright screenshots
    (both wide framing and a close, cropped framing matching the
    isometric camera's real default zoom — `CameraRig.FRUSTUM_HEIGHT`)
    showed this reads as one ambiguous blob: the lower tier's own point
    sits flush against the neck, visually blending the two tapers into
    a single cone, even though the underlying geometry was genuinely
    different (27 vs 13 meshes) and passed its own "waist" unit test.
    Root cause of the false-positive test: it sampled "max radius near
    a Y coordinate" across the whole group, but the neck's own rings
    sit at the *exact same Y* as the wider rings they connect to
    (flush-stacked), so the query always picked the wider neighbor,
    never the neck's own narrower radius — the test never actually
    exercised the failure mode. Fixed by making the lower tier a
    bespoke *truncated* eave+body (no point of its own — the upper
    tier is the only apex in the assembly, removing the double-point
    ambiguity), naming the neck mesh so tests can read its own radius
    directly, and rewriting the waist test to compare the neck's radius
    against the widest radius strictly below/above it. Re-verified with
    cropped screenshots at realistic zoom: a clear, unambiguous
    wide → narrow → wide → point pagoda silhouette, visibly distinct
    from the classic archetype's single monotonic taper.
  - **Verification**: 278 tests across `tests/world/buildings/` all
    green; fresh full-suite regression re-confirmed unchanged from
    baseline both before and after the pagoda second pass (144 tsc
    errors, the same 13 pre-existing/flaky vitest failures — `main.
    startup.smoke`×3, `enemyLoader`×3, `towerGenerator`×2, `talentSystem`
    ×3, `WaterMaterial`×1, `ResourceNodePlacer`×1 — no new regressions).
    Live-verified via Playwright screenshots at both a wide framing and
    a close, cropped framing calibrated to the isometric camera's actual
    default zoom (not an arbitrary close-up) for every fix in this round.
- [ ] **6.5 — Make the tower actually reachable in a *normal* (non-
  overridden) live settlement, i.e. real play, not just the Lab's test
  override above**: needs either a `WARD_TO_KIND` entry pointing some
  ward type at `watchtower`/`tower` (cross-faction change, out of this
  POC's elven-only scope — needs its own small design decision about
  which ward and whether other factions should get a matching override
  first) or a different placement mechanism (e.g. a landmark/gate slot
  outside the normal ward-fill loop). **Not started** — deliberately
  deferred; the 6.4b tool above already unblocks visual testing/rollout
  of new building kinds in the meantime, so this isn't a hard blocker
  for continuing race-by-race work.
- [x] **6.6 — Second elven building type: the living-tree home ("house"/
  "terraced"/"villa"/"inn"/"blacksmith", all routed through
  `buildElvenVilla()`) — highest-frequency elven building type, kit-of-
  parts round**: user asked to move to "the next building type" in the
  same research → learn → plan → build → test → confirm cycle used for
  the tower, running under user-enabled autopilot for this cycle. Design
  spec: `docs/superpowers/specs/2026-09-03-elven-treehouse-home-design.
  md`. Plan: `docs/superpowers/plans/2026-09-03-elven-treehouse-home.md`.
  Research summary (full report in session transcript): real treehouse
  engineering gives directly-usable *design rules* (ring beams +
  triangulated knee braces carry platform load, not many nails into thin
  branches — real treehouse roofs are conventional shingle/thatch far
  more often than a true "living roof," validating keeping the leaf
  canopy as the fantasy roof rather than pursuing a hybrid); The Elder
  Scrolls' Bosmer/Valenwood (Falinesti) is the standout in-fiction
  precedent for "buildings grown into a living tree" — "curled webs of
  moss... forming a shared roof for several dozen small buildings" gave
  the second canopy archetype idea; confirmed no public precedent
  applies Townscaper's technique to organic/tree structures (this
  codebase's `BlockKit.ts` is already ahead of any public example);
  confirmed procedural tree algorithms (L-systems, space colonization,
  Weber-Penn/EZ-Tree) all target decorative background trees, none
  reason about floors/doors — validating the existing architecture
  (tapered-radius skeleton curve driving heightfield occupancy, with
  floors/doors/windows carved in afterward as a separate concern);
  `three-bvh-csg` was found and considered for curved window carving but
  NOT adopted (new dependency, CSG not built for this kind of
  regeneration scale, and the existing occupancy-carving technique
  already proven on the door achieves the same "genuine round arch"
  result at zero extra cost). Shipped 4 additive pieces, all extending
  the existing engine (no new dependencies): **ring-beam + knee-brace
  bands at every floor** (previously only one, fixed at the neck,
  regardless of floor count — new `elvenRadiusAtHeight()`/
  `elvenHeightAtFrac()` helpers in `FactionBlockProfiles.ts` let each
  floor's ring size itself against the trunk's own real tapered radius
  at that height); **`ElvenTrunkWindows.ts`** (new file) — carved window
  openings extending the door's proven occupancy-carving technique (a
  genuine removed-block notch, not a flat recolor) to 2-4 window angles
  per floor band around the trunk's circumference; **2 entrance styles**
  (`pickElvenEntranceStyle`: 60% `ground_arch` unchanged / 40%
  `raised_platform`, the doorway carved starting 2 blocks above ground
  level); **2 canopy archetypes** (`pickElvenCanopyArchetype`: 55%
  `satellite_lobes` unchanged / 45% `moss_crown`, a denser wider fused
  mass with a mottled two-tone leaf/moss material, no separate lobes or
  branches — the Falinesti-inspired motif). 12 commits, strict TDD
  throughout. **Real bug found and fixed during live-verification prep**:
  the 2 picker functions and their carving logic were fully implemented
  and unit-tested in isolation against `buildElvenTrunkGrid` directly,
  but `buildElvenVilla()` never actually called them — every live
  building always silently defaulted to `ground_arch`/`satellite_lobes`
  regardless of seed. Fixed by wiring `pickElvenEntranceStyle(dna.seed)`/
  `pickElvenCanopyArchetype(dna.seed)` into `buildElvenVilla()`; verified
  via a spy on the real exported picker functions (an earlier attempt at
  a raycast-based geometric proxy for this same proof turned out to be
  too fragile to reliably discriminate sub-block-sized geometry
  differences in the merged mesh and was replaced). Verification: 253
  tests passing across the elven-related test slice (`BlockKit`,
  `FactionBlockProfiles`, `FactionBuildingVariants`, `ElvenTrunkWindows`,
  `SettlementLabScene`); fresh full-suite regression re-confirmed
  unchanged (144 tsc errors, the same 13 pre-existing/flaky vitest
  failures as every prior round — 2 additional timeouts seen on one run
  in unrelated terrain/overworld-streaming tests were confirmed flaky by
  re-running them in isolation, not caused by this round's changes).
  Live-verified via Playwright screenshots: ring-beam bands genuinely
  scale 1/2/3 per floor count; a raking-light close-up confirmed the
  carved windows show real removed-block depth (visible dark gaps behind
  a proud frame), not a flat recolor; both entrance styles and both
  canopy archetypes are visually distinguishable side-by-side, though
  the canopy archetype difference reads as a modest, not dramatic,
  distinction at small building scale (noted honestly, matching the
  tower's own balcony precedent). Settlement Lab's `POC_KIND_OVERRIDE_BY_
  FACTION.elven` switched from `'watchtower'` to `'house'` so "Play in
  3D" now isolates the new building type for user testing, per the
  established per-round testing pattern.

**Non-goal for this phase**: applying lessons learned here back to
terrain/nature tile-connection — explicitly a *future* step the user
named, after all races' buildings are done.

---

## Cross-cutting notes for whoever picks this up

- **Every phase should go through brainstorming → design spec → writing-plans → TDD
  implementation**, exactly as this session's shoreline-wobble and time-warp-spell features
  did — this document is a *roadmap*, not a substitute for that per-phase process. Do not
  skip straight to implementation off this TODO alone.
- **Sequencing matters**: Phase 0 is a hard prerequisite for Phases 1 and 2. Phase 2 is a
  soft prerequisite for Phase 3 (kit-of-parts pieces to lattice-fit). Phase 3 is a hard
  prerequisite for Phase 5. Phase 1 has no hard dependency on the others and could be done
  first, in parallel with Phase 0 being built out, or entirely independently — it's the
  most self-contained, lowest-risk-to-existing-systems phase and the most direct answer to
  the most recent, most specific feedback ("the sea is still a bit blocky").
- **Every phase touches collision-critical or gameplay-critical shared buffers**
  (`TerrainGeometryBuilder.ts`'s visual-mesh-equals-collider guarantee, settlement
  placement's water/road checks, dungeon blueprint loading) — carry forward this session's
  verification discipline (regression suite re-runs, settlement-parity snapshot checks, live
  browser verification, no unverified completion claims) into every phase, not just the
  first one.
- **Incremental, single-faction/single-settlement/single-prop-category pilots before wide
  rollout** is a repeated theme above deliberately — this session's own settlement-placement
  work found a real example of a plausible-looking fix (the area-based site-suitability
  check) that empirically made things worse once tested against real data; the dual-grid/
  relaxed-mesh techniques are well-proven in general, but *this specific codebase's*
  integration of them should still be verified incrementally, not assumed correct because
  the literature says so.
