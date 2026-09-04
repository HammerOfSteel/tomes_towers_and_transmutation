# Modular Building Kit Doctrine — Cross-Race Architecture & Quality Bar

**Date:** 2026-09-04
**Status:** Foundation document. Copied verbatim into every `race/*-buildings` branch.
**Applies to:** all 9 playable races' settlement buildings.

---

## Why this document exists

The elven race is four building kits in (stone tower, living-tree residential,
market stall, chapel). Two of those four have now been explicitly rejected by
the user:

> "there two buildings, dont meet the standards at all - they are not good. The
> elven church we can have more like a brick build old church ruin. ... The
> church and stall will need to be not just improved but made from scratch
> again."

And the standing quality bar for everything that follows was stated as:

> "use modular methods of buildings like with the bricks etc, research different
> methods used and learn from them and lets them follow blueprints closely tied
> to the reference art and make sure it can have procedural variety for each
> building and ABSOLUTELY NO BASE GEOMETRY BS! NO BLOBS OR SQUARES FOR WINDOWS
> OR SUCH! Details and smart mesh construction and like I said modular building
> pieces etc."

Eight rounds of building work have shown the same pattern: each round invents its
own one-off geometry, and the failures repeat. Rather than start race #2 the same
way, this document fixes **the shared kit, the shared quality bar, and the shared
process** first. Every race spec and plan in `race/*-buildings` branches is
written against this document and reuses its primitive library.

Full external research report backing this document:
`docs/superpowers/research/2026-09-04-modular-building-techniques-research.md`.

---

## Part 1 — Root-cause analysis: why the rejected buildings failed

Both rejected buildings were built from the *correct* technique family but with
specific pieces that were never brought up to that standard. The failure is
localised and diagnosable, not diffuse.

### 1.1 The chapel

| Symptom in the screenshot | Root cause | Location |
|---|---|---|
| A large, featureless black roof plane dominating the whole building | `buildGableRoofCap()` builds the roof as **two flat slope planes** plus a ridge box. No tiles, no courses, no thickness at the eaves, no fascia, no rafter tails. | `StoneTowerGableRoof.ts:78-106` |
| A pile of white cubes on the apse | `buildLivingRoofCap()` is a **BlockKit voxel grid blob** (`createBlockGrid`/`setBlock`/`meshBlockGrid`) — the exact voxel technique already rejected for walls in round 6.6b, which survived here because it was never revisited. | `StoneTowerRoofCap.ts:98-133` |
| The nave reads as a plain box with dark slots | Wall blocks are correct, but every opening is a **hollow dark extrusion** — no sill, no mullion, no tracery, no glazing. | `StoneTowerOpenings.ts:92-98` |

### 1.2 The market stall

| Symptom | Root cause |
|---|---|
| "Small gray round and rectangular things" | Openings again: the counter cutout and window are bare recessed cavities with no sill/mullion/frame articulation, so they read as grey blobs pasted on. |
| Reads as a pile of sticks | The stall is an assembly of thin boxes with no shared structural logic — no plinth, no ground contact, no silhouette hierarchy. |
| Doesn't look elven | It shares almost no vocabulary with the tower kit beyond the wall blocks. |

### 1.3 The single generalisable lesson

The block-course wall technique (`buildWallSurfaceBlocks()`) is **good and must be
kept** — the user has praised it repeatedly ("we have the brick foundation now",
"I like these"). Everything that was rejected is a piece that was *not* built to
that same standard: **roofs, openings, and caps**. The fix is not a new technique.
The fix is to bring roofs, openings and caps up to the standard the walls already
meet, and to make that standard explicit and enforceable so it stops regressing.

---

## Part 2 — The non-negotiable quality bar

These rules are binding on every race, every building kind, every round. A plan
that violates them is wrong regardless of how good it looks in isolation.

### Rule 1 — The depth ladder

**Nothing on a facade may be coplanar with anything else.** Every element sits at
a distinct, quantised depth relative to the wall face (world units):

```
+0.30  buttress face
+0.12  chimney breast / pilaster
+0.08  quoin, string course, hood mould, sill nose
+0.04  frame / surround / door architrave
 0.00  wall face
-0.06  blind arcade recess, panel recess
-0.12  window/door reveal (jambs, head, sill top)
-0.20  glazing plane / door face
```

Rationale: openings are read by the eye from **shading discontinuity**, not from
albedo. Two coplanar surfaces at different colours read as *paint*. Quantising to
a ladder guarantees no z-fighting, makes the shadow structure consistent across a
whole settlement, and is machine-checkable.

**Enforcement:** a shared dev assertion flags any two surfaces within 0.005 WU of
coplanar. See Part 4, `DepthLadder.ts`.

### Rule 2 — The five-piece opening minimum

No window or door may ship without all five of these. ~60-90 triangles total.

| # | Piece | Spec |
|---|---|---|
| 1 | **Recess** | cavity depth ≥ 1 × wall block depth (≥ 0.12 WU) |
| 2 | **Proud surround** | frame projects ≥ 0.3 × recess depth past the wall face |
| 3 | **Sill** | projects *past the frame* by 0.03-0.06 WU, chamfered top, drip underside |
| 4 | **≥ 1 internal division** | a real mullion, transom or cross bar crossing the aperture |
| 5 | **Set-back glazing** | dark, rough, slightly emissive at night — **never transparent** |

Piece 3 (the sill) is the single most legible window part at isometric distance:
a hard horizontal highlight above a hard horizontal shadow. Pieces 1 and 2 already
exist in `buildRecessedArchOpening()`. **Pieces 3, 4 and 5 are the gap**, and they
are precisely what makes the current openings read as "gray rectangular things".

Doors additionally require: a threshold step, strap ironwork (3-5 thin bars across
the face — reads at distance, unlike a doorknob), and planked construction (5-7
vertical boards with gaps, not one flat panel).

### Rule 3 — No banned primitives

| Banned | Use instead |
|---|---|
| Flat untextured plane as a visible surface | Extruded thickness + chamfer/return on every free edge |
| A darker box standing in for a window/door | Rule 2's five-piece opening |
| Voxel-grid blobs as organic form (`meshBlockGrid` for canopies/caps) | Real rib/lattice/shell construction (Part 4 `LatticeDome`, `ShingleSurface`) |
| Smooth cone or flat plane as a roof surface | Real tile courses; minimum stepped bands + thickened eave with visible tile butts |
| `IcosahedronGeometry` rubble | Same block geometry + same material as the wall, scaled and rotated |
| Sub-pixel detail (doorknobs, tiny bolts) | Spend that budget on sills, string courses and silhouette |
| Cloned materials for colour variation | `instanceColor` / baked vertex colours (cloning breaks merge bucketing) |
| CSG boolean carving of openings | The existing occupancy-carve (see Part 3) |

### Rule 4 — Variety comes from module swapping, not parametric scaling

Scaling one shape by 1.6× also scales its mouldings by 1.6×, which is the
signature of generated content. Variety must come from:

- a **library of fixed-size modules** selected by weight,
- a **split grammar** that divides a facade into bays and absorbs the leftover in
  floating filler (so a 7.3 WU and a 9.1 WU facade both get correct mouldings),
- **per-instance jitter** (±0.5-1.5° rotation, ±2% size) on top,
- and **one deliberate "special" bay per facade** (a door, an oriel, a blocked-up
  window) to break repetition.

### Rule 5 — Silhouette is ~80% of readability at isometric distance

Every building must break its own skyline: chimneys, finials, ridge cresting,
weathervanes, banner poles, dormers, a broken shutter. A clean rectangular
silhouette reads as generated no matter how good the facade is.

### Rule 6 — Ground contact

Every building gets a plinth course and a base skirt (rubble/soil/grass). A
building with a flat bottom edge appears to float or to be stuck into the terrain.

### Rule 7 — Asymmetry

No perfect bilateral symmetry. Off-centre door, one chimney, an asymmetric wing,
one different window.

---

## Part 3 — What already exists (audit)

### 3.1 KEEP — proven, reference-grade, reuse everywhere

| Primitive | File | Notes |
|---|---|---|
| `buildWallSurfaceBlocks()` | `StoneTowerWallSurface.ts` | **The core technique.** Per-course individual blocks, running bond, size/protrusion jitter, single shared material so the whole ring merges to one draw call. `facesOverride` already decouples it from octagons — it works on any face list. |
| `buildRecessedArchOpening()` | `StoneTowerOpenings.ts` | Proud frame + genuinely recessed cavity. Structure is right; needs Rule 2 pieces 3-5 added. |
| `octagonPoints/Faces`, `rectanglePoints/Faces`, `facePointAt` | `StoneTowerShape.ts` | Footprint math + face interpolation for placing openings. |
| `buildQuoins()`, `buildFloorCap()` | `StoneTowerQuoins.ts`, `StoneTowerFloorCap.ts` | Both already take `pointsOverride`, so they work on arbitrary footprints. |
| `buildTowerKitCore()` | `StoneTowerKit.ts` | base + rings + roof assembly shared by tower and treehouse families. |
| Silhouette system | `StoneTowerSilhouette.ts` | Per-floor vertex scales, named profiles (tapering/tiered/leaning/waisted). |
| `mergeGroupMeshesByMaterial()` | `MeshMergeUtils.ts` | Draw-call bucketing keyed on material *identity*. Never clone materials. |

### 3.2 REBUILD — right idea, wrong execution

| Primitive | Problem | Target |
|---|---|---|
| `buildGableRoofCap()` | Two flat planes | Real tiled roof surface on a straight-skeleton or explicit slope, with eave/verge/ridge trim |
| `buildLivingRoofCap()` | Voxel blob | Rib-and-shell canopy or lattice dome |
| `buildClassicRoofCap()` | Stacked smooth cylinder bands | Real tile courses (keep bands as LOD1) |
| `buildArchShape()` | Two-straight-line "point" | True two-centred Gothic arc parameterised by `archRatio` |

### 3.3 RETIRE — live instances of exactly what was rejected

| Primitive | File |
|---|---|
| `ModularSet.windowPanel()` / `doorPanel()` | `ModularSet.ts:42-76` — box frame + box door + sub-pixel sphere handle |
| `BuildingBuilder.buildRuin()`'s icosahedron rubble | `BuildingBuilder.ts:413-416` — a *rock*, not a *broken building* |

### 3.4 MISSING — required by the reference art, does not exist at all

Shingle/scale roof surfaces · ridge & hip tiles · window tracery (mullions, cusps,
foils, rose windows) · lattice glazing · carved bargeboards & interlace · columns
with capitals/bases · arcades · buttresses · string courses · corbels ·
crenellations with coping · dormers · chimneys with corbelled caps · multi-mass
composition (L/T plans, cross wings, porches) · stepped plinths · lattice/vine
domes · a ruin system.

---

## Part 4 — The shared primitive library to build

New modules under `src/world/buildings/kit/`. Each is race-agnostic and
parameterised; races supply materials, weights and constants, never their own
copy of the geometry.

### Tier 1 — highest impact ÷ cost. Build first, benefits every race immediately.

| Module | Provides | Notes |
|---|---|---|
| `GothicArch.ts` | True two-centred arch shape, parameterised by `archRatio = R/S` | `0.5` Romanesque (dwarven, orcish) · `1.0` equilateral (human, undead) · `1.6+` lancet (elven, vampire, fae). One function; every downstream consumer gets per-race arch character free. |
| `OpeningParts.ts` | Sill, mullion/transom, set-back glazing, threshold, strap ironwork, planked door leaf | Completes Rule 2. **The single largest readability win available.** |
| `VoussoirArch.ts` | Arch built from wedge blocks + keystone | The block-course technique applied to arches — matches walls exactly (same jitter, material, merge bucket). Gives ruined arches free by stopping emission early. |
| `StringCourse.ts` | Swept chamfered profile along a closed footprint curve; plinth courses with weathered top | Highest-value detail per triangle. Creates the horizontal shadow lines that separate floors and kill the "one tall box" reading. Also satisfies Rule 6. |
| `DepthLadder.ts` | The Rule 1 constants + a dev assertion for coplanarity | Makes the quality bar enforceable rather than aspirational. |
| `Bevels.ts` | Shared extrude settings with bevels on + `toCreasedNormals` in the merge bake | Chamfered arrises are the difference between "cut stone" and "extruded cardboard". Currently `bevelEnabled: false` everywhere. |

### Tier 2 — structural upgrades

| Module | Provides |
|---|---|
| `FacadeGrammar.ts` | `split`/`repeat` with absolute/relative/floating sizes. ~150 lines. **The highest-leverage architectural addition** — it is what lets any facade width produce correctly-proportioned bays with unstretched mouldings. One grammar, 9 module libraries. |
| `ModuleSocket.ts` | Module prototypes with per-face connector IDs, symmetry flags, excluded-neighbour blacklist, probability weights. Snap to `W = 2.0 WU`, floor `F = 3.0 WU`. Gives interchangeability + auto-derived rotations without WFC's failure modes. |
| `ShingleSurface.ts` | Individual tiles on a gauge lattice, running-bond stagger, 2-5° kick (the kick is what produces the per-course shadow line), ridge/hip/verge/eave trim. Diamond & fish-scale variants for elven/fae, plain slate for human/undead, thatch for orcish, hex metal plate for dwarven. |
| `RoofMassing.ts` | Gable/hip/pitched roofs on arbitrary footprints, eaves outset applied *before* skeletonising, fascia + rafter tails. Optional `straight-skeleton` (MIT) with fallback to explicit slopes on failure. |
| `Ruinate.ts` | Shared ruin post-pass: jagged block-quantised wall breaks, two-leaf walls with decorrelated break heights, exposed rafter sets with ~50% deletion, same-material rubble sized from lost volume, partial vaults, cracks — driven by a structural damage field that exempts corners and buttresses. |
| `MassComposer.ts` | Multi-mass building composition: main block + cross wing + porch + dormers + chimney, L/T/cruciform plans. Fixes the "single box" reading at the massing level. |
| `BatchedDetail.ts` | One `BatchedMesh` per settlement chunk for roof tiles / rubble / foliage — heterogeneous geometry in one draw call with per-object frustum culling, which `InstancedMesh` cannot do. |

### Tier 3 — race signature features

| Module | Primary races |
|---|---|
| `Tracery.ts` — `Shape` + `holes` + extrude; n-foil tangency `a = R_c/(1+sin(π/n))`, `r = a·sin(π/n)` for trefoils/quatrefoils; rose windows | undead, vampire, human, elven |
| `Interlace.ts` — periodic 3-strand plait as tube-along-curve **with normal-direction relief** (a flat knot reads as a texture no matter how much geometry it has); trefoil terminal knots | elven (flowing), dwarven (angular chevron variant) |
| `LatticeDome.ts` — two helical families `θ(s) = θ₀ ± k·s` at radii `R ± Δ` giving an intertwined diamond lattice with correct over/under; tapered tube radii; knuckle spheres at crossings | fae, elven (gazebo/canopy) |
| `LatheColumn.ts` — columns with entasis `r(y) = r_top + (r_base − r_top)·cos((π/2)(y/H))` (never a straight taper); fluting by lobed cross-section, **not** CSG; impost blocks at springing | dwarven, human, elven arcades |
| `Buttress.ts` — stepped piers with weathered set-offs, gablet/pinnacle caps; flying buttresses with segmental voussoir arches (the pinnacle is structurally the point — omit it and it reads as scaffolding) | undead, vampire, human, elven ruins |

### Explicit non-goals

- **No CSG for carving openings.** The occupancy-carve is not merely adequate, it
  is *aesthetically superior*: it preserves whole-block reveals with running-bond
  stagger, whereas a boolean cut produces a smooth planar face through the middle
  of blocks — the exact "base geometry" look that was rejected. It is also O(1),
  deterministic, and cannot fail.
- **No `three-csg-ts`** (dormant since 2024-05, BSP-based, ~100× slower).
- **No `three-subdivide` on masonry** — it smooths away exactly the arrises that
  make stone read as stone.
- **No search for a JS procedural-architecture library** — verified: none exists.
  Budget for building the kit; use Blender `building_tools` (MIT, readable Python)
  as the reference implementation for split→inset→extrude.

---

## Part 5 — The canonical per-race roster

`WARD_TO_KIND` (`src/buildingToDungeonPlan.ts`) means exactly **7 building kinds
are reachable** in a generated settlement, from 10 ward types:

| Ward | Kind | Size |
|---|---|---|
| market, craftsmen | `shop` | small |
| church | `chapel` | medium |
| inn | `inn` | large |
| smithy | `blacksmith` | medium |
| merchant, patriciate | `villa` | medium / large |
| slum | `terraced` | tiny |
| gateward, farm | `house` | small |
| park | *(none)* | — |

Plus `watchtower`/`tower`, which have **no ward mapping** and can only be reached
via a dev override. Every race therefore targets the same **canonical 8-kind
roster**:

`house` · `terraced` · `villa` · `inn` · `shop` · `blacksmith` · `chapel` · `watchtower`

**Reachability caveat (open, cross-race):** `watchtower`/`tower` never spawn
naturally. The Settlement Lab showcase override (round 6.6f) forces one per
settlement so it can be reviewed, but this remains a live gap in real settlement
generation. Each race plan must note it; a cross-race fix (giving `watchtower` a
ward, or a settlement-level landmark slot) should be decided once, not nine times.

### Sharing within a roster

Kinds may share a builder where the reference art supports it, provided the
builder is footprint-dynamic via `getFootprint(dna.buildingKind, dna.size)`. What
is **not** acceptable is the current situation where five kinds silently collapse
to one identical building. Each race plan must state, per kind, whether it is a
distinct assembly or a documented variant of another — and if a variant, what
actually differs (massing, roof archetype, opening set, props).

---

## Part 6 — Per-race deliverable template

Each `race/<race>-buildings` branch contains exactly two documents.

### 6.1 `docs/superpowers/specs/2026-09-04-<race>-buildings-design.md`

1. **Reference art inventory** — every file in
   `concept_art/reference/buildings/<race>/`, what it shows, and what is taken
   from it. Cite specific images per design decision.
2. **Race design language** — the 5-10 rules that make a building read as this
   race: massing, roof form, wall material, opening shape (`archRatio`), ornament
   motif, palette, silhouette signature, ground treatment. This is the section
   that must be *closely tied to the reference art*.
3. **Real-world & game-dev basis** — how these buildings are actually built IRL,
   how the genre handles them, what procedural approach fits.
4. **Per-kind blueprint** — for all 8 kinds: footprint & massing, floor count,
   wall system, opening schedule, roof archetype(s), ornament, props, and the
   **procedural variation axes** with their weights.
5. **Kit modules consumed** — which Part 4 primitives, and any race-specific
   module this race must add.
6. **Quality-bar compliance** — an explicit checklist against Part 2's seven
   rules.
7. **Current-state delta** — what exists today for this race, what is rebuilt from
   scratch, what is retired as dead code.
8. **Out of scope / deferred**, with reasons.

### 6.2 `docs/superpowers/plans/2026-09-04-<race>-buildings.md`

Bite-sized TDD tasks in dependency order, matching the precedent set by
`docs/superpowers/plans/2026-09-04-elven-chapel-rebuild.md`:

- each task states the failing test to write first, the implementation, and the
  verification command;
- shared-kit tasks come before race-specific tasks;
- the final tasks are always: wire into `FACTION_BUILDING_VARIANTS`, delete
  superseded builders as dead code, full regression, **live Playwright
  verification**, TODO doc updates, commit.

### 6.3 Verification standard (unchanged from prior rounds, restated because it caught real bugs)

- TDD: failing test → confirm it fails → implement → confirm it passes.
- Fresh baseline before each phase; treat only *new* failures as regressions.
  Baseline at time of writing: **144 `tsc --noEmit` errors, ~13 vitest failures.**
- `npx vitest run` + `npx tsc --noEmit` before any completion claim.
- **Live Playwright verification is mandatory.** Every visual bug this session
  that mattered — the market stall's counter facing the wrong way, the chapel's
  bellcote hidden inside its own gable wall, the floor cap's missing `uv`
  attribute silently destroying whole material buckets — passed its unit tests
  and was caught only by looking at a screenshot.
- Run the dev server **from the session worktree**, not the main checkout. A
  server already running from `~/Documents/GitHub/.../tomes_towers_and_transmutation`
  serves stale code and will silently show you the old build.

---

## Part 7 — Sequencing

1. **Shared kit first.** Tier 1 modules are built once, on the first race branch
   to need them, and land on `main` before other races consume them. Tier 2/3
   modules land as the first race that needs them reaches them.
2. **One race per branch.** `race/<race>-buildings`, branched from `main`.
3. **Per race:** spec → plan → TDD implementation → wire into
   `FACTION_BUILDING_VARIANTS` → **hook up to Settlement Lab "Play in 3D" so all
   8 kinds are visible together** (generalise round 6.6f's showcase override to
   be per-race rather than elven-only) → full regression → live verification →
   TODO updates → merge to `main`.
4. **Race order** (elven first because two of its buildings are actively
   rejected; then by reference-art richness):
   `elven → dwarven → human → fae → undead → orcish → vampire → vulperia → slime`
5. **`slime` has no reference art.** Its plan is derived from the existing slime
   style plus this doctrine, and must flag the missing-reference gap for the user
   rather than silently inventing a direction.

---

## Part 8 — Decisions taken in this document

| # | Decision | Rationale |
|---|---|---|
| D1 | Keep the block-course wall technique; do not replace it | Repeatedly praised by the user; the failures are all in roofs/openings/caps, not walls |
| D2 | Fix roofs, openings and caps to the walls' standard rather than inventing a new system | The gap is localised and diagnosable (Part 1) |
| D3 | One shared kit under `kit/`, not per-race geometry | Nine one-off implementations is how the current inconsistency happened |
| D4 | One facade grammar, nine module libraries | Grammar is race-agnostic; character comes from modules, weights and constants |
| D5 | Occupancy-carve over CSG | Superior look, O(1), deterministic, cannot fail |
| D6 | Enforce the depth ladder with a dev assertion | An unenforced style rule regresses; this one already has |
| D7 | Canonical 8-kind roster per race | Matches `WARD_TO_KIND` reachability; prevents scope drift |
| D8 | Research + spec + plan for **all** races before implementing any | The user asked for this explicitly and will review before implementation starts |
