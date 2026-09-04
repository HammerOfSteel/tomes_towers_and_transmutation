# Procedural 3D Building Generation for a Three.js Isometric Fantasy RPG

**Date:** 2026-09-04
**Purpose:** External research commissioned to underpin the multi-race modular
building programme (see
`docs/superpowers/specs/2026-09-04-modular-building-kit-doctrine.md`), after the
user rejected the elven chapel and market stall for looking like "base geometry"
— "NO BLOBS OR SQUARES FOR WINDOWS".

**Assembly note:** this report was delivered in three parts because of response
size limits, and has been reassembled here in logical section order (§1 → §7).
One artefact of that truncation survives: **the opening prose and table header of
§3.6 were lost** and the section resumes mid-table, at the buttress row. Nothing
else is missing. Section numbering is the researcher's own.

**Contents**
- §1 Scope and method
- §2 Kit-of-parts and modular building generation (module/socket model, grid
  conventions, facade split grammar, where variety comes from, avoiding the
  "same building at different scales" tell)
- §3.1.1 The true two-centred Gothic arch
- §3.1.2 Voussoir ring, jambs, sill, hood mould, and foils
- §3.1.3 Mullions and light layout
- §3.2 Roof shingles, slates and scales
- §3.3 Carved trim, bargeboards and friezes with interlace / knotwork
- §3.4 Columns, capitals, bases and arcades
- §3.5 Ruins and damage
- §3.6 Masonry vocabulary *(partial — see assembly note)*
- §3.7 Lattice / trellis / vine domes
- §4 Three.js-specific implementation guidance
- §5 Anti-patterns: why procedural buildings look cheap, and the fixes
- §6 Recommendations for this project
- §7 Gaps, uncertainties, and unverified claims

---


> Self-contained. §3.1.3 onward (mullions, tracery strategies, roofs, knotwork, columns, ruins) and §3.6–§7 were delivered previously.
> **Note on ordering:** I have kept the requested order, but §2 is deliberately table-dense to protect the §3.1.1/§3.1.2 priority content at the end. Nothing is deferred.

---

## 1. Scope and method

**Question.** How do professional procedural building systems decompose buildings into reusable modular parts, drive them with facade grammars, and generate the *real* architectural detail (arches, tracery, tiles, carving, ruins) that separates a convincing building from a placeholder — and which of those techniques transfer to a Three.js r170 codebase that already builds walls from individual block meshes on an occupancy grid.

**Method and evidence grading.**

| Grade | Meaning | Used for |
|---|---|---|
| **Verified primary** | Fetched from the authoritative source during this research | three.js r170 API signatures (fetched from `mrdoob/three.js` at `refs/tags/r170`, matching `package.json:39` `"three": "^0.170.0"`); Esri CGA operator semantics (live docs); `ranjian0/building_tools` source; `marian42/wavefunctioncollapse` source; all library maintenance data (GitHub + npm registry APIs, 2026-09-04); all citations into this working tree |
| **Verified bibliographic** | DOI/record confirmed, full text **not** retrieved | Wonka et al. 2003 (Crossref, DOI `10.1145/882262.882324`); Havemann & Fellner 2004 (Semantic Scholar, DOI `10.2312/VAST/VAST04/193-201`) |
| **Verified + full text** | Record confirmed and PDF reachable | Müller et al. 2006 (Crossref DOI `10.1145/1141911.1141931`; PDF at `peterwonka.net/Publications/pdfs/2006.SG.Mueller.ProceduralModelingOfBuildings.final.pdf`) |
| **Derived** | Worked out from first principles and checked numerically here | All geometric construction math in §3 (two-centred arch, segmental arch, chord budgets, n-foil tangency, voussoir layout, sill sections) |
| **Practice-derived opinion** | No citable source found; synthesised from failure modes and standard art practice | §3.5 (ruins), the anti-pattern catalogue, the detail budgets |

**Grounding.** All recommendations were written *after* reading the existing implementation, so they extend rather than replace the technique already in place: `src/world/buildings/BlockKit.ts` (occupancy grid, `BLOCK_UNIT = 0.5`, chamfer rules, `FaceVisibility`), `StoneTowerWallSurface.ts` ("Strategy G" coursed blocks, running bond, single shared material), `StoneTowerOpenings.ts` (proud frame + recessed cavity), `StoneTowerRoofCap.ts`, `FactionBlockProfiles.ts`, `ModularSet.ts`, `BuildingBuilder.ts`, and `src/scene/MeshMergeUtils.ts`.

**Explicit negative finding (verified).** npm and GitHub searches for a JavaScript/TypeScript library for procedural architecture, greebling, or modular kit assembly return **nothing**. Unlike Houdini (SideFX Labs), Blender (`building_tools`, Archipack) and Unreal (PCG), the JS ecosystem has no equivalent. This system must be built in-house; the value of external repos here is as *readable reference implementations*, not as dependencies.

---

## 2. Kit-of-parts and modular building generation

### 2.1 The module / socket / connector model

The pattern all production systems converge on: **a building is not a shape; it is a graph of slots filled from a library of interchangeable pieces, where fill-legality is decided by matching connector IDs on the pieces' faces.**

The clearest source-readable data model is Marian Kleineberg's WFC city (https://marian42.de/article/wfc/):

```csharp
// marian42/wavefunctioncollapse:Assets/Code/WaveFunctionCollapse/ModulePrototype.cs:9-40
abstract class FaceDetails {
    bool Walkable;
    int  Connector;                        // THE socket ID
    ModulePrototype[] ExcludedNeighbours;  // blacklist on top of ID matching
    bool EnforceWalkableNeighbor;
    bool IsOcclusionPortal;
}
class HorizontalFaceDetails : FaceDetails { bool Symmetric; bool Flipped; }
class VerticalFaceDetails   : FaceDetails { bool Invariant; int Rotation; }  // 0..3
float Probability = 1.0f;
bool  Spawn;  bool IsInterior;
// six faces: Left, Down, Back, Right, Up, Forward
```

**Matching rules** (from the article and enforced in source):

| Face type | Matches when |
|---|---|
| **Horizontal** (4 sides) | connector IDs equal **AND** (both `Symmetric`, **or** they form a `Flipped`/not-`Flipped` **pair**) |
| **Vertical** (top/bottom) | connector IDs equal **AND** (both `Invariant`, **or** `Rotation` indices equal) |

The `Flipped` pair mechanic is what solves asymmetry: a wall segment whose left edge ends in a half-pilaster mates **only** with a segment whose right edge ends in the complementary half. One boolean, and the whole class of "pieces that only fit one way round" is handled.

`ExcludedNeighbours` exists because, in the author's words, *"some blocks with matching connectors just don't look nice next to each other."* Pure ID matching is necessary but never sufficient — budget for a blacklist from day one.

**Rotation variants are derived, not authored.** `CompareRotatedVariants(r1, r2)` (`ModulePrototype.cs:~180-200`) generates all four Y-rotations of each prototype and deduplicates rotationally-identical ones (redundant iff both vertical faces are `Invariant` and all four horizontal connectors match under rotation). Author one piece, get up to four placements free.

**Three socket families are sufficient for a building kit:**

| Family | Where | Encodes | Example IDs |
|---|---|---|---|
| **Horizontal / run** | left & right edges of a wall segment | wall thickness, coursing phase, any moulding profile that must run through, material | `stone_2.0_courseA_plain`, `stone_2.0_courseA_pilasterL` |
| **Vertical / stack** | top & bottom of a floor module | floor-plate depth, string-course profile, load-bearing or not | `floorplate_std`, `floorplate_corbelled` |
| **Attachment** | discrete *points*, not faces — gable apex, buttress cap, string-course × bay intersection, parapet corner | what ornament may hang here | `socket_finial`, `socket_corbel`, `socket_gargoyle` |

The attachment family is the cheapest source of visual richness and is usually forgotten. A socket at every gable apex and buttress cap, filled from a weighted table of finials/pinnacles/statues/nesting birds, transforms the **silhouette** — which is roughly 80% of readability at isometric distance — for almost no triangles.

### 2.2 Grid conventions (derived from what you already have)

Interchangeability collapses the moment the grid is inconsistent. These are the non-negotiables:

| Rule | Value for this project | Rationale |
|---|---|---|
| One base unit, everything an integer multiple | `BLOCK_UNIT = 0.5` WU — already 1/8 of the 4 WU terrain tile (`src/world/buildings/BlockKit.ts:32-33`) | the whole kit snaps to the occupancy grid for free |
| Module width | `W = 4 × BLOCK_UNIT = 2.0 WU` (half-module `1.0` for fillers/corners) | |
| Floor height | `F = 6 × BLOCK_UNIT = 3.0 WU`, **one value per race, never per building** | varying floor height forces every string course, sill height and door height to be re-derived, and mouldings end up scaled. Vary the *number* of floors instead |
| Wall thickness | `T = 1 or 2 × BLOCK_UNIT` | |
| Corner budget | a corner piece consumes **either** `W/2` on each of two faces **or** a full `W` — pick one per kit and never mix | mixing is the #1 cause of gaps/overlaps in hand-built modular sets |
| Pivot convention | local origin at bottom-centre of the outward face; `X` along the run, `Y` up, `Z` outward | makes `insert()` a single `Matrix4.compose()` and rotation-variant derivation trivial |
| Boundary discipline | geometry must not cross the module boundary unless a connector explicitly declares it | |
| Sockets carry the *profile*, not just the size | two modules of equal width but different string-course sections are **not** interchangeable | otherwise a moulding visibly steps mid-run |
| One shared material object per material class, never cloned | already documented: *"All blocks share ONE material object reference (never cloned) … visual variation comes from geometry … not per-block material cloning"* (`StoneTowerWallSurface.ts:73-76`) | `mergeGroupMeshesByMaterial()` buckets by material **object identity** (`src/scene/MeshMergeUtils.ts:26-27`) |

### 2.3 The facade split grammar

**Primary sources.**
* **Wonka, Wimmer, Sillion & Ribarsky, "Instant architecture," *ACM TOG* 22(3):669–677, 2003, DOI `10.1145/882262.882324`** *(record + abstract verified via Crossref; PDF not retrievable — three peterwonka.net URL patterns 404'd)*. Introduces the **split grammar** (a set-grammar restricted to shape *splitting*, so the design space is bounded and always yields valid buildings), a separate **control grammar** that propagates *attributes* through the derivation, and **attribute matching** for rule selection. The split/control separation is the key idea: geometry rules stay generic, and the control grammar enforces "ground floor differs from upper floors" and "windows align vertically."
* **Müller, Wonka, Haegler, Ulmer & Van Gool, "Procedural modeling of buildings," *ACM TOG* 25(3):614–623, 2006, DOI `10.1141911.1141931`** → correctly `10.1145/1141911.1141931` *(verified, PDF reachable)*. Introduces **CGA shape**, adds context-sensitive rules (occlusion queries, snapping), demonstrates mass-model → facade at Pompeii scale. Direct ancestor of CityEngine.
* **Stiny & Gips (1971)** — the original shape grammars.
* **Esri CityEngine CGA reference** — https://doc.arcgis.com/en/cityengine/latest/cga/ — the productised operator set; semantics below read from the live docs.

**The scope** is the central object: an oriented box `{ position P, axes X/Y/Z, sizes (sx,sy,sz) }`. Every operator transforms it and/or emits children.

**`split`** — https://doc.arcgis.com/en/cityengine/latest/cga/cga-split.htm
```
split(axis) { size : operations | size : operations | ... }
split(axis, adjustMode) { ... }
axis       ∈ { x, y, z }
adjustMode ∈ { adjust (default: refits child scope to child geometry bbox),
               noAdjust (children exactly fill the parent scope, no gaps) }
```
Use `noAdjust` for facade subdivision.

**Size prefixes — the single most important idea in this section:**

| Prefix | Name | Meaning |
|---|---|---|
| *(none)* | **absolute** | `1.2` = exactly 1.2 world units regardless of parent |
| `'` | **relative** | `'0.25` = 25% of the parent scope's size on that axis |
| `~` | **floating** | *"the remaining spaces between the absolute parts are automatically adapted; multiple floating parts are weighed proportionally"* |

**Trailing `*` — the repeat switch:** *"the repetition … as many times as possible. The number of repetitions and floating dimensions are adapted to the best solution (best number of repetitions and least stretching)."*

So `split(x){ 0.5 : Quoin | { ~2.0 : Bay }* | 0.5 : Quoin }` on a **9.1 WU** facade yields two 0.5 WU quoins (absolute, never stretched) and **four** bays of 2.025 WU; on a **7.3 WU** facade, **three** bays of 2.1 WU. **This is the entire mechanism that makes fixed-size mouldings work on arbitrary facade widths, and it is precisely why "just scale the shape" is the wrong answer.**

**UV split** — same page, second form:
```
split(direction, surfaceParameterization, uvSet) { ... }
direction               ∈ { u, v }
surfaceParameterization ∈ { uvSpace, unitSpace }
```
`unitSpace` = *"the 2d space on the 3d geometry surface, measured in units (e.g. meters)."* This is the canonical **roof-shingle-course operator**: split a pitch in `unitSpace` along `v` at the gauge, then each course along `u` at the tile width.

**`comp`** — https://doc.arcgis.com/en/cityengine/latest/cga/cga-comp.htm
```
comp(componentSelector) { selector operator ops | ... }
componentSelector ∈ { f (faces), e (edges), fe (face edges),
                      v (vertices), fv (face vertices),
                      g (groups), m (materials), h (holes) }
scopeAlignment    ∈ { zUp (default), noAlign }
```
`comp(f)` with semantic selectors (`front`, `side`, `top`, `bottom`, `vertical`, `horizontal`, `all`, `index`) decomposes a mass into facades. `h` (holes) recurses into a pierced face — directly relevant to tracery.

**Minimum implementable operator set** (~150 lines of TypeScript):

| # | Operator | Notes |
|---|---|---|
| 1 | `split(axis, parts[], noAdjust)` | three-pass solve: sum absolutes → resolve relatives → distribute remainder over floating parts by weight. For a floating part with `repeat`, `n = round(remaining / nominal)`, then `actual = remaining / n` |
| 2 | `repeat(axis, nominal, symbol)` | sugar for `split(axis){ {~nominal : symbol}* }` |
| 3 | `comp(faces)` | mass → `front/back/left/right/top/bottom` with correct outward Z |
| 4 | `extrude(d)` | |
| 5 | `inset(dx,dy,dz)` | the reveal operator |
| 6 | `offset(d)` | the depth-ladder operator |
| 7 | `insert(assetKey \| moduleSet)` | **fit, do not stretch** — pick the module whose native size best matches, centre it, let *filler* absorb the difference. Allow uniform scale only within ±4%, and only on modules flagged `scalable` |
| 8 | `select(weightTable, rng)` | weighted draw conditioned on `attrs` |
| 9 | `when(pred, then, else)` | the control-grammar hook |
| 10 | `setAttr(k, v)` | children inherit — Wonka's attribute propagation |
| 11 | `NIL` | terminate, emit nothing |
| 12 | `emit(symbol)` | recurse |

Two worthwhile extras: **`occlusion(dir)`** (raycast outward; suppress windows if blocked within ~1.5 WU — `three-mesh-bvh`, MIT, v0.9.14, 2026-08-01 is the right tool) and **`snapToGrid(0.5)`** applied to every split boundary so grammar output lands exactly on the occupancy grid.

**Worked facade rule** (pseudo-grammar, not code):
```
Building  → comp(f){ front|back|left|right : Facade | top : Roof | bottom : NIL }
Facade    → split(y, noAdjust){ 0.6 : Plinth | ~F : GroundFloor
                              | { ~F : UpperFloor }* | 0.5 : Cornice }
BayGrid   → split(x, noAdjust){ 0.5 : Quoin | { ~W : Bay }* | 0.5 : Quoin }
GroundBay → select{ 0.15 Door | 0.55 WindowBay | 0.30 SolidBay }
UpperBay  → select{ 0.70 WindowBay | 0.25 SolidBay | 0.05 OrielBay }
WindowBay → split(x){ ~0.5 : Wall | 1.0 : WindowUnit | ~0.5 : Wall }
WindowUnit→ split(y){ 0.35 : SillCourse | ~1 : Aperture | 0.30 : HoodMould }
Aperture  → inset(0.12) → { Reveal, Mullions, TraceryHead, Glazing }
```

**Coherence rules — these, not the operators, are what make it read as architecture:**

1. **Split X *once*, at the facade level, and pass the bay boundaries down to every floor.** Do not re-split per floor. This one rule is responsible for most of the difference between "coherent building" and "random noise," because vertical alignment of openings is the strongest cue the eye uses.
2. **Floor hierarchy.** Ground floor taller, heavier rustication, fewer/smaller openings. Floor 1 (*piano nobile*) gets the tallest windows and richest surrounds. Top floor squattest. Never identical floors.
3. **One focal bay, then break the symmetry once.** Mirror around it, then change exactly one bay away from its mirror partner.
4. **Corners are absolute.** Quoins, buttresses, end piers take fixed absolute widths. Never relative, never floating.
5. **Openings never straddle structure.** After solving, veto any window whose scope overlaps a buttress or quoin cell; downgrade to `SolidBay`.
6. **Damage/wear is an inherited attribute** set at facade level and modulated per bay, so it correlates spatially instead of flickering.

### 2.4 Where variety actually comes from

Ranked by value per unit of effort. **Parametric scaling of one shape is deliberately absent** — it is the primary anti-pattern, because mouldings scale with the element and a 1.6× window gets 1.6× mullions.

| | Mechanism | Contribution |
|---|---|---|
| **(a)** | **Weighted selection** from the connector-compatible set (`ModulePrototype.Probability`), drawn with a **seeded PRNG derived from slot world-coords + building DNA hash** so results are deterministic and regenerable | ~70% of perceived variety |
| **(b)** | **Context-conditioned weight tables**: `w(module │ floorIndex, isCorner, isStreetFacing, isGableEnd, damage, race)`. Doors weight > 0 only on floor 0; oriels only floor ≥ 1; chimney breasts only on gable ends; boarded windows' weight rises with damage | turns "random" into "plausible" for one extra function argument |
| **(c)** | **Grammar rules for the layout itself** (§2.3). Weighted selection decides *what fills a slot*; the grammar decides *what slots exist* | you need both |
| **(d)** | **Constraint propagation / WFC** — reserve it for genuinely 3D, non-local adjacency (elven treehouses spanning branches, stacked vampire tiers, cave-embedded dwarven halls). marian42's own conclusion is that backtracking cost *"makes the WFC approach for infinite worlds unsuitable for commercial games"* — but that caveat is about **unbounded** solves. A bounded single-building solve of a few hundred cells, with a fallback module that accepts any connector, is entirely tractable. Reference: `mxgmn/WaveFunctionCollapse` (verified live, MIT) | situational |
| **(e)** | **Per-instance micro-variation**: ±0.5–1.5° rotation, ±2% size, 3–6% value jitter via `instanceColor` | the last 10%, and the difference between "generated" and "built" |
| **(f)** | **Exactly one focal element per facade**, chosen *before* the repeating bays are filled | cheapest single fix for "it looks procedural" |

### 2.5 Avoiding the "same building at different scales" tell

This is a distinct failure from "looks placeholder," and it is what makes a settlement of 40 procedurally-generated buildings read as 3 buildings repeated. The fixes, in order of impact:

| # | Tell | Fix |
|---|---|---|
| 1 | **Uniform mesh scaling** — mouldings, sills, quoins, tile sizes all scale together | Absolute-sized modules + floating filler (`~` semantics, §2.3). Detail size must be **invariant across the whole settlement**. If a sill is 0.35 WU tall on one building it is 0.35 WU on every building |
| 2 | **Non-uniform (aspect) scaling** — a "wide" building is a stretched "narrow" one | Never scale on an axis. Change **bay count** in X and **floor count** in Y |
| 3 | **Identical massing / silhouette** — every building is a box | Vary the **massing before the facade**: footprint class (rectangle / L / T / U / octagon), attached wings, upper-floor jetties and setbacks, an attached stair turret or tower, and a **projecting entrance porch**. Massing variety is worth more than facade variety because silhouette dominates at isometric distance |
| 4 | **Identical roof** | Vary roof *form* (gable / hip / half-hip / gambrel / pyramidal / catslide), **ridge orientation** (parallel vs. perpendicular to the street), pitch class (35° / 45° / 55°), and dormer count. Two buildings with the same footprint and different ridge orientation read as different buildings |
| 5 | **Same bay rhythm** | Vary bay count *and* focal-bay position (`floor(n/2)` is the tell — offset it) |
| 6 | **Same height** | Vary floor *count*, never floor *height* (see §2.2) |
| 7 | **Same palette** | One material variant per building drawn from a per-race palette of 3–5, plus an independent weathering level |
| 8 | **Same ground contact** | Vary plinth height by whole courses; step the plinth on sloped terrain; add an external stair, ramp, or cellar hatch |
| 9 | **No memorable features** | A **signature-element pool**: each building draws 1–2 unique items — oriel, external stair, chimney stack, dormer, arcade porch, gallery, well, sign bracket, dovecote. This is what makes buildings individually *recognisable*, which is the actual goal |
| 10 | **Unstable regeneration** | Seed everything from `hash(worldX, worldZ, race)` so the same building regenerates identically across sessions and LOD transitions |

The compact statement of the whole section: **vary topology (how many of what, arranged how), never geometry (how big is the one shape).**

---

## 3. Element-by-element construction

### 3.1 Openings — arches, voussoirs, jambs, sills, tracery

#### 3.1.1 The true two-centred Gothic arch

Work in the arch's local 2D plane. Springing line at `y = y_s`, opening centred on `x = 0`, clear span `S` (springing points at `(±S/2, y_s)`), arc radius `R`. Define `archRatio = R / S`.

### Core construction

```
d = R − S/2                              (horizontal offset of each centre from the axis)
h = √(R² − d²) = √(R·S − S²/4)           (rise: apex height above the springing line)
θ = atan2(h, d)                          (half-sweep of each arc)
```

**Right-hand arc** — struck from `C_R = (−d, y_s)`:
* right springing `(S/2, y_s)`: vector from `C_R` is `(S/2 + d, 0) = (R, 0)` ⟹ **angle 0**
* apex `(0, y_s + h)`: vector from `C_R` is `(d, h)` ⟹ **angle θ**

**Left-hand arc** — struck from `C_L = (+d, y_s)`, the mirror:
* left springing `(−S/2, y_s)`: vector from `C_L` is `(−R, 0)` ⟹ **angle π**
* apex: vector from `C_L` is `(−d, h)` ⟹ **angle π − θ**

### Variants — one scalar controls the whole vocabulary

| `archRatio = R/S` | `d/S` | rise `h/S` | `θ` | Name | Race |
|---|---|---|---|---|---|
| **0.5** | 0 | 0.5000 | **90°** | semicircular / Romanesque | dwarven, orcish |
| 0.6 | 0.10 | 0.5916 | 80.4° | shallow drop | |
| 0.75 | 0.25 | 0.7071 | 70.5° | drop arch | vulperia |
| **1.0** | 0.50 | **0.8660** | **60°** | **equilateral** — the classic Gothic | human |
| 1.3 | 0.80 | 1.0724 | 53.3° | lancet | undead |
| **1.6** | 1.10 | **1.2288** | **48.2°** | tall lancet | elven, vampire |
| 2.0 | 1.50 | 1.3229 | 41.4° | severe lancet | vampire hero buildings |

*(Checks: `R/S = 0.5 ⟹ d = 0, h = √(S²/4) = S/2, θ = atan2(S/2, 0) = 90°` ✓. `R/S = 1 ⟹ d = S/2, h = √(S² − S²/4) = S√3/2 = 0.8660S, θ = atan2(0.866, 0.5) = 60°` ✓ — an equilateral arch's two centres are the opposite springing points, and each arc sweeps exactly 60°.)*

`src/world/buildings/StoneTowerOpenings.ts:20-25` already documents its own approximation as *"a simple, stylized two-straight-line point … rather than a true two-centered Gothic arc."* Replacing the `lineTo()` pair in `buildArchShape()` with the two `absarc()` calls below is roughly 20 lines and gives per-race arch character from a single scalar, feeding every downstream consumer (`StoneTowerWindows`, doors, blind arcading, arcades) without touching them.

### Emitting it as a `THREE.Shape`

`Shape` extends `Path`; `absarc(aX, aY, aRadius, aStartAngle, aEndAngle, aClockwise)` appends an arc in **absolute** coordinates (as opposed to `arc()`, which is relative to the current point). Walking the outline from bottom-left, up the left jamb, over the head, down the right jamb:

```
s.moveTo(-S/2, 0)
s.lineTo(-S/2, y_s)                            // left jamb
s.absarc(+d, y_s, R, π,     π - θ, true)       // left arc  → apex   (clockwise)
s.absarc(-d, y_s, R, θ,     0,     true)       // right arc → springing (clockwise)
s.lineTo(+S/2, 0)                              // right jamb
s.closePath()
```

**r170 caveats:**
* Both `absarc` calls sweep with **decreasing angle**, so `aClockwise = true` for both. The second arc's start point coincides exactly with the first's end point (the apex), so the implicit `lineTo` three.js inserts between curves is a no-op.
* **Winding is normalised for you.** `ExtrudeGeometry` calls `ShapeUtils.isClockWise()` on the outer contour and reverses it if needed, then forces holes to the opposite winding. You do not have to get the traversal direction right — but holes *are* assumed to be genuinely inside the contour and non-self-intersecting.
* `ExtrudeGeometry`'s **`curveSegments` (default 12)** controls the point count per curve. Each `absarc` is one curve, so the default gives 12 chords per half-arch — over-tessellated for a 48–90° sweep (see budget below). Set it explicitly.
* Bevels: `bevelEnabled` (default **true**), `bevelThickness` 0.2, `bevelSize` = `bevelThickness − 0.1`, `bevelSegments` 3. Your current calls pass `bevelEnabled: false` (`StoneTowerOpenings.ts:84,93`). For frames and trim, switching to `{ bevelEnabled: true, bevelSize: 0.15 × frameWidth, bevelThickness: same, bevelSegments: 1 }` is a parameter change that turns "extruded cardboard" into "cut stone" under a low sun.
* If you extrude along a path instead (`extrudePath`), **bevels are not supported** — the profile must contain its own chamfers.

### Chord budget — how many segments an arc actually needs

For a chord subtending half-angle `φ`, the **sagitta** (max deviation from the true arc) is `ε = R(1 − cos φ)`, so:
```
φ = acos(1 − ε/R)
chords per arc = ceil( θ / 2φ )
```

Worked, `R = 1.2 WU` (a typical window head, span 1.2 WU at `archRatio = 1.0`):

| tolerance `ε` | `φ` | chord angle `2φ` | chords per half-arc (θ = 60°) | total for the head |
|---|---|---|---|---|
| 0.020 WU | 10.5° | 21.0° | 3 | **6** |
| 0.010 WU | 7.40° | 14.8° | 5 | **10** |
| 0.005 WU | 5.23° | 10.5° | 6 | **12** |

At `BLOCK_UNIT = 0.5`, a 0.01 WU deviation is 2% of a block and is invisible at isometric distance. **Use `curveSegments: 5` for window heads and `8` for large arcade/door arches.** The three.js default of 12 more than doubles the cost of every arch on every building for no visible benefit — at 40 buildings × 12 openings that is a real saving.

### Related arch families (same tangency logic)

**Segmental arch** (shallow — flying buttresses, relieving arches, cellar heads). Given span `S` and rise `f < S/2`, the single centre lies **below** the springing line:
```
R = (S²/4 + f²) / (2f)
C = (0, y_s + f − R)
sweep: from  atan2(R − f, S/2)  through  π/2 (apex)  to  π − atan2(R − f, S/2)
```
*(Check: `f = S/2 ⟹ R = (S²/4 + S²/4)/S = S/2`, `C = (0, y_s)` — the semicircle. ✓)*

**Ogee arch** (fae, elven — S-curved, concave near the apex). Lower arcs as the two-centred construction, radius `R₁`. The upper reversed-curvature arcs of radius `R₂` must be **externally tangent** at the junction `J`: the centre `C₂` lies on the ray from `C₁` through `J`, at distance `R₁ + R₂` from `C₁`. Place `J` at 60–70% of the lower arc's sweep, choose `R₂`, and `C₂` is determined. The two upper arcs meet in a sharp point — put a finial there.

**Four-centred (Tudor) arch** (dwarven halls, low doorways). Same tangency rule applied with the *same* curvature sense: small radius `R₁` at the springing, large `R₂` to the apex, `C₂` on the line `C₁J` at distance `R₂ − R₁` (internal tangency).

**Academic prior art (sourcing caveat).** Havemann & Fellner, *"Generative parametric design of Gothic window tracery,"* VAST 2004, DOI `10.2312/VAST/VAST04/193-201` — existence, authors, venue and DOI **verified** via the Semantic Scholar Graph API (paper ID `41e26bf0c36d3366f7bfc66387a36afd42721386`; DBLP `conf/smi/HavemannF04`), but **full text was not retrievable**. All math in §3.1.1 and §3.1.2 is **derived and numerically checked here**, not transcribed. Attribute to Havemann only the general idea of generative parametric tracery. Also relevant, metadata-verified only: Takayama (2013), *"Computer-generated Gothic Tracery with a Motif-oriented Approach"* (tracery as composition of reusable motifs — a kit-of-parts framing); Charbonneau, Miyata et al. (2006), on rose windows.

---

#### 3.1.2 Voussoir ring, jambs, sill, hood mould, and foils

This is the section that matters most for your project, because **every construction here is philosophically identical to the block-course wall you already build** — it is the block course, curved.

### A. The voussoir ring

For one half-arch swept about centre `C` from `θ₀` to `θ₁`, intrados radius `R_i = R`, ring depth `d_ring`, `N` voussoirs:
```
Δθ  = (θ₁ − θ₀) / N
θ_k = θ₀ + k·Δθ                    k = 0 … N
R_o = R_i + d_ring
δ   = joint half-angle ≈ 0.006 rad  (a real mortar joint, not a texture)
```
Voussoir `k` is a 4-point `THREE.Shape` in the arch plane:
```
A = ( R_i·cos(θ_k + δ),      R_i·sin(θ_k + δ) )
B = ( R_o·cos(θ_k + δ),      R_o·sin(θ_k + δ) )
C'= ( R_o·cos(θ_{k+1} − δ),  R_o·sin(θ_{k+1} − δ) )
D = ( R_i·cos(θ_{k+1} − δ),  R_i·sin(θ_{k+1} − δ) )
```
`ExtrudeGeometry` to the wall thickness (`bevelEnabled: true, bevelSize: 0.012, bevelSegments: 1` — the chamfered arris is what makes it read as a dressed stone), then transform into the wall plane.

**Sizing.** Target an intrados face length of about one block: `R·Δθ ≈ BLOCK_UNIT`. But for Gothic work, oversample — real voussoirs are finer than the wall coursing. **Use `N = 7 … 11` per half.** Ring depth `d_ring = 1–2 × BLOCK_UNIT`.

**Note the two-centre subtlety:** for a pointed arch, the right-half voussoirs rotate about `C_R = (−d, y_s)` and the left-half about `C_L = (+d, y_s)`. They are *not* one continuous ring; the joint pattern is genuinely V-shaped at the apex, which is architecturally correct and visually distinctive.

**Radial extrusion depth — three refinements, cheap:**
* **Rough extrados.** Jitter each voussoir's `R_o` by `±0.06 × d_ring` so the outer edge of the ring is stepped rather than a perfect curve. Real arch rings built into rubble walling look like this.
* **Alternating voussoir depth.** Every second voussoir gets `R_o + 0.03` — reads as banded/polychrome work (very Romanesque, excellent for dwarven).
* **Orders.** A Romanesque or Gothic doorway has **2–3 concentric arch rings**, each recessed `0.10–0.15 WU` behind the one outside it, each with its own `N`, and each springing from its own jamb shaft. **This is the single highest-richness-per-line-of-code feature in this whole section** — it is a `for` loop around the ring you already built, and it turns a plain arch into a cathedral doorway.

**Keystone.** In a true pointed arch the apex is naturally a joint; both of these are correct:
* *Jointed apex* (more authentically Gothic): both halves end at the apex; no keystone. Put a small carved boss on the face instead.
* *Keystone* (reads better at low resolution, and is what players expect): reserve a wedge of `Δθ_key ≈ 1.4 × Δθ` centred on the apex, give it `d_key = 1.3 × d_ring` (projecting above the extrados), and push it **0.03 WU proud of the wall face**. The proud offset is what makes it read as a keystone rather than as one more voussoir.

**Springers.** The bottom voussoir at each springing must be **bonded into the wall**: extend it laterally by one block so it interlocks with the wall coursing. Two payoffs — the arch looks structurally attached rather than glued on, and you get correct ruined arches for free (stop emitting past index `k_keep`; the surviving springer stub is the signal that reads as "collapsed" rather than "never built").

**Triangle budget.** 12 tris per voussoir as a 4-sided prism (2 faces × 2 + 4 sides × 2), or ~20 with a 1-segment bevel. `2 × 9 + keystone = 19 blocks ≈ 230–380 tris` per arch. With three orders, ~1.0k. Entirely affordable.

### B. Jamb, reveal and splay

The **reveal** is the returned face of the opening (depth = wall thickness); the **jamb** is the vertical stone of the reveal; a **splay** angles the jambs outward so more light enters.

**The stepped splay is the technique to use, because it is native to your block grid.** Rather than a smooth bevel, widen the carved opening by one block every `n` courses:
```
for course c:
    openingHalfWidth(c) = w0 + floor(c / n) · BLOCK_UNIT
```
with `n = 2` or `3`. This produces a stair-stepped splay that reads unmistakably as *masonry*, not as a chamfer — and it costs nothing, because it is a change to the `clearBlock()` predicate in the existing carve (`src/world/buildings/BlockKit.ts:58-63`). A smooth CSG-cut splay would produce a planar face through the middle of blocks, which is the "base geometry" look. **This is a concrete case where the occupancy-carve approach is aesthetically superior to a boolean, not merely a cheaper substitute.**

Typical splay: 15–30° overall, achieved by 3–5 steps over the opening height.

**Other jamb treatments, cheapest first:**

| Feature | Construction | Cost |
|---|---|---|
| **Chamfered jamb** | replace the outer arris block of each jamb course with a chamfered variant (your dual-grid chamfer logic already handles this class — `BlockKit.ts:80-120`) | free |
| **Rebate / check** | step the jamb back by `0.5 × BLOCK_UNIT` for the last `0.5 × BLOCK_UNIT` of depth, so the door leaf or shutter sits in a rebate rather than flush | free (grid) |
| **Nook shafts** | a small colonnette (a `LatheGeometry`, 8 segments, ~120 tris) set in the angle of each order of a stepped jamb, with its own base and cap | ~150 tris each, very Gothic |
| **Roll-moulded jamb** | sweep a moulded section down the jamb; the section must **match the arch order's section** so the moulding runs continuously from jamb into arch | ~200 tris |
| **Continuous moulding** | the highest-quality option: the same profile runs up the jamb, round the arch, and back down — no impost. Later Gothic (Perpendicular) does this | requires §3.1.3 swept sections |

**Depth ladder for the opening** (recap of the rule from §5): buttress `+0.30` > quoin/string course `+0.08` > hood mould `+0.06` > frame/surround `+0.04` > **wall face `0.00`** > blind recess `−0.06` > reveal `−0.12` > glazing `−0.20`. Nothing coplanar, ever. Your `buildRecessedArchOpening()` already implements the frame/cavity pair correctly with a documented anti-z-fighting inset (cavity at 0.94/0.96/0.9 of the frame hole so its edge tucks behind the frame lip — `StoneTowerOpenings.ts:77-103`).

### C. The sill — the most legible piece at distance

**Why it dominates.** At isometric distance you are not reading detail, you are reading **value contrast at high-contrast edges**. The sill is the only element of an opening that:
1. is **horizontal** in a field of verticals, so it is orthogonal to the dominant rhythm;
2. **projects into direct light** along its whole length, producing a continuous bright line;
3. **casts a hard shadow** on the wall immediately below it, producing a continuous dark line directly beneath that bright line.

A bright line stacked on a dark line is the highest-contrast signal a facade can produce, and it survives to very small pixel sizes. This is why a window with a sill reads as a window at 3 pixels tall and a window without one does not.

**Section** (in the vertical plane perpendicular to the wall; `x` = outward from wall face, `y` = up). An 8-point closed `Shape`, extruded along the sill length:

```
P0 (-T_bed,        0.00)     back bottom (bedded into the wall)
P1 ( nose,         0.00)     front bottom, at the nose
P2 ( nose,         0.020)    up the nose face
P3 ( nose - 0.020, 0.020)    → into the DRIP GROOVE
P4 ( nose - 0.020, 0.035)    drip groove back face
P5 ( nose - 0.040, 0.035)    drip groove inner
P6 ( nose - 0.040, 0.048)    out of the groove, onto the underside
P7 (-T_bed,        H_sill)   back top
     ... with P6→P7 being the WEATHERING SLOPE
```

**Numbers that work at this scale:**

| Parameter | Value | Note |
|---|---|---|
| **Nose** (projection past the frame face) | `0.03 – 0.06 WU` | past the *frame*, not the wall — so `frame(+0.04) + 0.04 = +0.08` on the depth ladder |
| **Weathering slope** | `10° – 15°` | the top surface must shed water. A flat sill top reads as a shelf; a sloped one reads as architecture. **This is the second most important sill parameter** |
| **Drip / throating groove** | `0.02 × 0.013 WU`, set back `0.02` from the nose, on the **underside** | throws water clear of the wall. Visually it creates a *second* hard shadow line under the nose, doubling the sill's contrast for 4 extra triangles |
| **Sill height** `H_sill` | `0.10 – 0.16 WU` (one third of a block) | |
| **Bedding depth** `T_bed` | ≥ `1 × BLOCK_UNIT` into the wall | so it visibly *is* a stone, not a shelf |
| **Stooling / ears** | extend the sill `0.5 × BLOCK_UNIT` past each jamb, and step the outer `0.3 WU` of each end up to full height | real sills have raised ends where they bed into the jambs. Two extra boxes, and it stops the sill looking like a plank laid across the hole |

**Triangle budget.** An 8-point extruded shape is `4N − 4 = 28` triangles. With two stooled ends: ~52 triangles. **Fifty-two triangles for the single largest readability gain available on the whole facade.**

**Sill course.** For a facade with several windows at the same level, run a **continuous sill course** (a `string course` at sill height) through all of them rather than individual sills. Same section, swept along a closed `CurvePath` of the footprint. This costs less than individual sills, and it produces a continuous horizontal shadow line across the whole building — which is the strongest possible cue that the floors are separated.

### D. Hood mould and label stops

The **hood mould** (or **label**, when it is square-headed) is a projecting moulding above the arch head that throws water clear of the opening. Visually it is the piece that *caps* the window and stops it looking like a hole.

**Construction** — a second, thinner voussoir-style ring, or a swept section:
* follows the extrados at `R_o + gap`, `gap = 0.03 – 0.05 WU`
* projects **`+0.06 WU`** on the depth ladder — i.e. proud of the frame, behind the buttresses
* section: a roll (semicircular, 4–5 chords), a hollow-chamfer, or a simple 45° chamfer with a fillet — 5–7 points
* build **either** as ~8 curved block segments (matches your coursed philosophy, ~100 tris) **or** swept: `ExtrudeGeometry(section, { extrudePath: arcCurve, steps: 10, bevelEnabled: false })` — remember bevels are unavailable with `extrudePath`, so the section must contain its own chamfers (~140 tris)

**Label stops** are the terminations, and they are mandatory — **a hood mould that just stops in mid-air is worse than no hood mould at all.** Three options:
1. **Return** — the mould turns horizontal for `0.15–0.25 WU` at springing level and stops with a chamfered end. Cheapest, always correct. ~20 tris.
2. **Carved head** — a small human/beast head corbel. ~60 tris, high character, the classic medieval choice. Perfect as an *attachment socket* (§2.1) filled from a per-race table: human heads, elven leaf-masks, dwarven runic bosses, undead skulls, vampire bat-heads.
3. **Foliate boss** — a small ball-flower or leaf cluster. ~40 tris.

For a **square-headed** (label) version — right for dwarven and orcish work, and for domestic human buildings — the mould runs horizontally above the lintel and turns down at each end for `0.2 WU`. Even simpler, equally effective.

### E. Foils — trefoil, quatrefoil, cinquefoil

A **foil** is a lobe; a **cusp** is the sharp re-entrant point between two lobes. These appear in tracery heads, spandrels, blind panels, parapet pierced work, and rose-window sectors — a single well-parameterised foil generator gets used everywhere.

**Construction A — tangent lobes (soft foil).** `n` lobes inscribed in an enclosing circle of radius `R_c`, each internally tangent to that circle **and** to its two neighbours. Let `a` = lobe-centre orbit radius, `r` = lobe radius.

* internal tangency to the enclosing circle: `a + r = R_c`
* adjacent lobe centres are `2a·sin(π/n)` apart; mutual tangency ⟹ `r = a·sin(π/n)`

```
a = R_c / (1 + sin(π/n))
r = R_c · sin(π/n) / (1 + sin(π/n)) = a · sin(π/n)
```

| `n` | `sin(π/n)` | `a / R_c` | `r / R_c` | waist radius `a·cos(π/n) / R_c` |
|---|---|---|---|---|
| **3** trefoil | 0.86603 | **0.53590** | **0.46410** | 0.26795 |
| **4** quatrefoil | 0.70711 | **0.58579** | **0.41421** ( = √2 − 1) | 0.41421 |
| **5** cinquefoil | 0.58779 | **0.62980** | **0.37020** | 0.50946 |
| **6** sexfoil | 0.50000 | **0.66667** | **0.33333** | 0.57735 |

Lobe centres sit at `θ_k = θ₀ + 2πk/n`. **But with Construction A the lobes meet *tangentially* — the junction is smooth, so there is no cusp, and it reads as a clover, not as Gothic tracery.**

**Construction B — overlapping lobes (sharp cusp). Use this one.** Keep internal tangency to the enclosing circle (`a + r = R_c`) but make `r` slightly *larger* than the tangent value so adjacent lobes **intersect**. Their outer boundary then has a genuine re-entrant vertex — the cusp.

Two circles of radius `r` whose centres are `D = 2a·sin(π/n)` apart intersect on the perpendicular bisector at `±√(r² − D²/4)` from its midpoint, and that midpoint lies at radius `a·cos(π/n)`. So:
```
R_cusp = a·cos(π/n) − √( r² − a²·sin²(π/n) ),      a = R_c − r
```

**Drive it from `R_cusp` and solve for `r`** (much more controllable). With `c = cos(π/n)`:
```
        R_c² − 2·c·R_cusp·R_c + R_cusp²
r  =  ──────────────────────────────────  ,      a = R_c − r
              2·R_c − 2·c·R_cusp
```
*Worked check — quatrefoil (`n = 4`, `c = 0.70711`), target `R_cusp = 0.30 R_c`:*
`r = (1 − 0.42426 + 0.09) / (2 − 0.42426) = 0.66574 / 1.57574 = 0.42250 R_c`; `a = 0.57750 R_c`.
Verify: `a·c = 0.40835`; `√(0.42250² − (0.57750 × 0.70711)²) = √(0.178506 − 0.166750) = 0.108425`; `R_cusp = 0.40835 − 0.10843 = 0.2999 R_c` ✓

**Sensitivity warning.** Because of the square root, `R_cusp` moves extremely fast with small changes in `r`. On a quatrefoil, going from `r = 1.01 × r_tangent` to `r = 1.15 × r_tangent` drives the cusp from `0.335 R_c` all the way in to `0.070 R_c`. **Always parameterise by `R_cusp`, never by an overlap epsilon.** Usable ranges: `R_cusp ∈ [0.24, 0.36] R_c` for a quatrefoil; `[0.14, 0.26] R_c` for a trefoil; `[0.36, 0.48] R_c` for a cinquefoil.

**Emitting the outline as a `THREE.Path`.** Walk `k = 0 … n−1`; for each lobe emit one `absarc` about `(a·cos θ_k, a·sin θ_k)` with radius `r`, running between the two flanking cusp points. Measured *at the lobe centre*, those angles are:
```
α± = atan2( R_cusp·sin(θ_k ± π/n) − a·sin θ_k ,
            R_cusp·cos(θ_k ± π/n) − a·cos θ_k )
```
Consecutive arcs share their endpoints exactly, so the path closes with no gaps and no cleanup pass. Chord budget per lobe: by the same sagitta formula as §3.1.1, **4–6 chords per lobe** at `ε = 0.008 WU` for a typical `R_c ≈ 0.35 WU` foil — so a quatrefoil is 16–24 chords total.

**Two cheap upgrades:**
* **Sprung cusp** — push each cusp tip inward another 10–15% and terminate it with a tiny 3-point spearhead. This is the cusp form of Decorated Gothic and it catches light beautifully.
* **Cusp bosses** — an instanced ~20-tri bud/ball-flower on each cusp tip. One attachment socket per cusp (§2.1).

**Using foils.** As a **hole** in a `THREE.Shape` (`Shape.holes` is documented as *"An array of paths that define the holes in the shape"*) for pierced tracery, parapets and spandrel panels; as a **shallow recess** (`−0.05 WU`) for blind panels on otherwise-empty dwarven/undead walls; as a **sunk carving** in a spandrel between arcade arches. The `Shape` + `holes` + `ExtrudeGeometry` route covers all three **natively — no CSG required**, which is the technical reason the CSG question resolves against adopting a boolean library at runtime. The machinery is already proven in your `_buildFrameShape()` (`src/world/buildings/StoneTowerOpenings.ts:43-49`); a foil is the same call with more holes.

**Triangle budget.** A quatrefoil as a pierced plate with 5 chords per lobe: outer contour + 4 lobe holes ≈ 20 boundary points → roughly `4 × 20 − 4 = 76` triangles plus caps, call it **~120 tris** with a 1-segment bevel. A trefoil head on a window light: ~90 tris. These are nothing, and they are the difference between a window that reads as *Gothic* and one that reads as *an arched hole*.

---

*End of Part 2. Combined with the previously-delivered Part 1 (§3.1.3–§3.5) and the original delivery (§3.6, §3.7, §4, §5, §6, §7), the report is now complete.*
---

#### 3.1.3 Mullions and light layout *(continued)*

Aperture of clear width `W_a` divided into `k` **lights** (glazed panels) by `k − 1` **mullions** of width `m`:
```
lightWidth  w_l = (W_a − (k − 1)·m) / k
mullion j sits at  x_j = −W_a/2 + j·(w_l + m) + w_l,   j = 1 … k−1
```
Typical values: `m = 0.08–0.12 WU`, `w_l = 0.35–0.55 WU`, `k = 1` (lancet), `2` (couplet), `3` (triplet), `4–5` (a large church window). A `k = 1` light with no mullion is fine *only* if it also has a transom or a foiled head — otherwise it's a plain dark rectangle (anti-pattern #2).

**Transoms** (horizontal bars) are placed at `0.55–0.65` of the light height for windows taller than ~2.2 WU. Below the transom, add a **blind panel** with a small carved quatrefoil rather than glass — this is both historically correct and a cheap way to fill an otherwise-empty lower area.

**Mullions must have a moulded cross-section, not be boxes.** This is the exact distinction the user drew. The section is a small closed `Shape` of 8–14 points — the standard Gothic profile is a **roll-and-hollow**: a central convex roll flanked by two concave hollows and two flat fillets. For low-poly, approximate the roll with 3 chords and each hollow with 2 chords. Sweep it:
* straight mullions: `ExtrudeGeometry(section, { depth: mullionLength, bevelEnabled: false })`, then rotate to vertical;
* mullions that continue into the tracery head as curved bars: `ExtrudeGeometry(section, { extrudePath: arcCurve, steps: 12 })` — remember the verified constraint that **bevels are not supported with `extrudePath`** (three.js r170 `ExtrudeGeometry` docs), so the section itself must contain the chamfers.

Triangle cost: a 12-point section swept over 12 steps = `12 × 12 × 2 = 288` tris per mullion. Three mullions ≈ 900 tris. If that's too much, drop to an 8-point section and 6 steps (`96` tris each) — still visibly moulded at isometric distance, and still not a box.

**Mullion continuation into the head is the "tracery" part of tracery.** In real bar tracery, the mullions do not stop at the springing — they *branch*: each mullion continues upward and curves to become one of the arch-bars that frames the foils. A cheap and convincing rule:
* mullion `j` continues from the springing line as an arc of radius `R_j` struck from a centre on the springing line, chosen so the arc is tangent to the vertical at the springing (i.e. centre is at `(x_j ± R_j, y_springing)`);
* it terminates where it meets the main arch curve or a foil circle.

The tangency-at-springing condition is what makes the branch look grown rather than glued.

#### 3.1.4 Cusping and foils — the exact tangency math

A **foil** is a lobe; a **cusp** is the sharp re-entrant point between two lobes. Trefoil = 3 foils, quatrefoil = 4, cinquefoil = 5, sexfoil = 6.

**Construction A — tangent lobes (soft foil).** `n` lobes inscribed in an enclosing circle of radius `R_c`, each internally tangent to the enclosing circle **and** tangent to its two neighbours. Let `a` = lobe-centre distance from the foil centre, `r` = lobe radius.

* Internal tangency to the enclosing circle: `a + r = R_c`
* Adjacent lobe centres are `2a·sin(π/n)` apart; mutual tangency requires that to equal `2r`, so `r = a·sin(π/n)`

Solving:
```
a = R_c / (1 + sin(π/n))
r = R_c · sin(π/n) / (1 + sin(π/n))
```

| `n` | `sin(π/n)` | `a / R_c` | `r / R_c` | waist radius `a·cos(π/n) / R_c` |
|---|---|---|---|---|
| 3 (trefoil) | 0.86603 | **0.53590** | **0.46410** | 0.26795 |
| 4 (quatrefoil) | 0.70711 | **0.58579** | **0.41421** ( = √2 − 1) | 0.41421 |
| 5 (cinquefoil) | 0.58779 | **0.62980** | **0.37020** | 0.50946 |
| 6 (sexfoil) | 0.50000 | **0.66667** | **0.33333** | 0.57735 |

Lobe centres sit at angles `θ_k = θ₀ + 2πk/n`. With Construction A the lobes meet *tangentially*, so the junction is smooth — there is no sharp cusp. That reads as a clover, not as Gothic tracery.

**Construction B — overlapping lobes (sharp cusp). This is the one you want.** Keep internal tangency to the enclosing circle (`a + r = R_c`) but make `r` slightly *larger* than the tangent value so adjacent lobes **intersect**. Their outer boundary then has a genuine re-entrant vertex — the cusp.

Two circles of radius `r` whose centres are `D = 2a·sin(π/n)` apart intersect on the perpendicular bisector, at `±√(r² − D²/4)` from the midpoint. The midpoint lies at radius `a·cos(π/n)` along the bisector direction, so:
```
R_cusp = a·cos(π/n) − √( r² − a²·sin²(π/n) ),      a = R_c − r
```

It is far more useful to **specify `R_cusp` and solve for `r`.** Let `c = cos(π/n)`:
```
        R_c² − 2·c·R_cusp·R_c + R_cusp²
r  =  ──────────────────────────────────
              2·R_c − 2·c·R_cusp
a  =  R_c − r
```
*Worked check, quatrefoil (`n = 4`, `c = 0.70711`), target `R_cusp = 0.30·R_c`:*
`r = (1 − 0.42426 + 0.09) / (2 − 0.42426) = 0.66574 / 1.57574 = 0.42250·R_c`, `a = 0.57750·R_c`.
Verify: `a·c = 0.40835`; `√(0.42250² − (0.57750·0.70711)²) = √(0.178506 − 0.166750) = 0.108425`; `R_cusp = 0.40835 − 0.10843 = 0.2999·R_c` ✓

**Sensitivity warning:** because of the square root, `R_cusp` moves very fast with small changes in `r`. Going from `r = 1.01 × r_tangent` to `r = 1.15 × r_tangent` on a quatrefoil moves the cusp from `0.335·R_c` all the way in to `0.070·R_c`. **Always drive the construction from `R_cusp`, never from an overlap epsilon.** Sensible ranges: `R_cusp ∈ [0.24, 0.36]·R_c` for a quatrefoil, `[0.14, 0.26]·R_c` for a trefoil.

**Cusp points** (the re-entrant vertices) sit at radius `R_cusp`, angles `θ₀ + π/n + 2πk/n`. Two nice-to-haves: (a) push the cusp tip inward another 10–15% and terminate it with a tiny 3-point spearhead — this is the "sprung cusp" of later Gothic and it catches light beautifully; (b) drop a small carved boss/bud on each cusp tip (an instanced 20-tri blob) for Decorated-style work.

**Generating the foil outline as a `THREE.Path`:** walk `k = 0 … n−1`; for each lobe, `absarc(a·cos θ_k, a·sin θ_k, r, α_start, α_end, false)` where `α_start` and `α_end` are the angles (measured at the lobe centre) of the two cusp points flanking that lobe. Those are:
```
α = atan2( R_cusp·sin(θ_k ± π/n) − a·sin θ_k ,  R_cusp·cos(θ_k ± π/n) − a·cos θ_k )
```
Consecutive arcs share their endpoints exactly, so the path closes without gaps.

#### 3.1.5 Rose windows

A rose is a radial split grammar, and it is the single highest-impact landmark feature for undead/vampire/human cathedrals.

**Plate tracery rose (Romanesque, early — dwarven, early human, cheap).** Outer circle `R`. Pierce `N` circular lights (`N = 8` or `12`) of radius `r_p ≈ 0.20·R` at orbit radius `a_p ≈ 0.62·R`, plus one central circle of radius `≈ 0.22·R`. That's it — a single `Shape` (the outer circle) with `N + 1` circular `holes`, extruded to the wall thickness with a bevel. **~15 lines, ~400 triangles, and it reads correctly.**

**Bar tracery rose (Gothic — the real thing).**
```
R           outer radius
R_hub       central boss/oculus,  0.16–0.25 · R
N           spokes, use 8 / 12 / 16 (divisible by 4 keeps the symmetry legible)
R_ring      optional intermediate ring at ~0.60 · R  → two orders of lights
barWidth    0.05–0.08 · R
```
Construction:
1. `N` radial mullions from the hub circle to the outer ring at angles `2πk/N`, each a swept moulded section (§3.1.3).
2. The outer ring and the hub ring are annular swept profiles.
3. Each of the `N` sectors between spokes is a light: a trapezoid bounded by two radial bars and two concentric arcs, **with a foiled head** — apply §3.1.4 with `n = 3` in a circle inscribed in the outer part of the sector.
4. Optionally, subdivide alternate sectors again (giving `N` large + `N` small lights) — this is what makes the great roses look intricate rather than like a wagon wheel.
5. Central boss: a small foiled circle (a sexfoil at `n = 6`) or a carved rosette.

**Cost check.** `N = 12`, two orders, trefoil heads: roughly 1,400–2,200 triangles as a pierced plate. Entirely affordable as a once-per-settlement landmark; do not put one on every building.

#### 3.1.6 The three construction strategies — A, B, C

| | **A — bar assembly** | **B — swept along a CurvePath** | **C — pierced plate** |
|---|---|---|---|
| **What** | Every tracery member (mullion, arch bar, foil arc, cusp) is a separate moulded section swept along its own curve | One `THREE.CurvePath` for the whole tracery skeleton, `ExtrudeGeometry` with `extrudePath` | The whole tracery head is **one** `THREE.Shape` (the arch outline) with **one hole per light and per foil**, extruded to the stone thickness |
| **Fidelity** | Highest — each member has a true moulded profile, correct undercuts, correct depth ladder | Medium | High silhouette fidelity; members are prismatic (chamfered but not fully moulded) |
| **Triangles** | 2,000–5,000 per window | 800–2,000 | **400–900** |
| **Robustness** | Branching joints must be hand-mitred or covered with a small boss | **Poor at branches** — a swept profile cannot fork; and bevels are unsupported with `extrudePath` (verified, r170 docs) | **Excellent** — `Shape.holes` triangulation is deterministic, no booleans, no manifold issues |
| **Depth** | Real, per-member | Real | Uniform (one thickness) — mitigate by extruding in 2 passes at different depths |
| **Verdict** | For hero windows only | **Avoid for tracery**; keep it for *single* curved runs (hood moulds, string courses, arch bars) | **Default choice** |

**Recommended hybrid — this is what to actually build:**

1. **Head** = Strategy **C**. Outer boundary = the two-centred arch (§3.1.1) plus the springing verticals. Holes = the lights (trapezoids with pointed heads) and the foils (§3.1.4). Extrude to `wallThickness × 0.45`, `bevelEnabled: true`, `bevelSize ≈ 0.15 × barWidth`, `bevelSegments: 1`. The bevel is what makes the bars read as *moulded* rather than *cut from card*.
2. **Second, thinner plate** at `−0.05 WU` (recessed) with slightly *larger* holes → gives every bar a visible two-step reveal for ~60% extra triangles. Cheaper and more robust than modelling real mouldings.
3. **Mullions below the springing** = Strategy **A** (real swept moulded sections). These are the closest, largest, most-looked-at members, so they earn their triangles.
4. **Voussoir surround** = §3.1.2 — the arch ring around the whole thing, in blocks, matching your wall coursing exactly.
5. **Glazing** = one dark, rough, faintly-emissive plane at `−0.20 WU` on the depth ladder. Not transparent. Optionally split it into per-light quads with slightly different tints (leaded glass reads as patchwork).

`Shape` + `holes` + `ExtrudeGeometry` covers all of this **natively — no CSG required**, which is why the CSG question (in §4.3 of the earlier delivery) resolves against adopting a boolean library. The machinery is already proven in your `_buildFrameShape()` (`src/world/buildings/StoneTowerOpenings.ts:43-49`); tracery is the same call with more holes.

#### 3.1.7 Academic prior art

* **Havemann & Fellner, "Generative parametric design of Gothic window tracery," *VAST 2004*. DOI `10.2312/VAST/VAST04/193-201`.** Existence, authors, venue and DOI **verified** via the Semantic Scholar Graph API (paper ID `41e26bf0c36d3366f7bfc66387a36afd42721386`; DBLP `conf/smi/HavemannF04`). **Full text was not retrievable**, so the math in §3.1.1–§3.1.5 is derived from first principles and standard architectural geometry, not transcribed from this paper. I verified the n-foil tangency algebra myself (worked check above). Attribute to Havemann only the general idea of *generative parametric tracery*.
* **Takayama, "Computer-generated Gothic Tracery with a Motif-oriented Approach" (2013)** — treats tracery as composition of reusable *motifs* rather than as pure geometry, which maps directly onto a kit-of-parts approach (a library of foil-heads, a library of light-shapes).
* **Charbonneau, Miyata et al., "…the gothic rose window" (2006)** — radial-subdivision approach to roses, consistent with §3.1.5.

---

### 3.2 Roof shingles, slates and scales

Roofs are the second-biggest tell after windows. Your current approach — stacked `CylinderGeometry` bands where each band seam reads as a course line (`src/world/buildings/StoneTowerRoofCap.ts:20-52,174-192`) — is a genuinely good LOD1. What follows is LOD0.

#### 3.2.1 The gauge lattice

Notation for one planar roof pitch:
* `û` — unit vector **up the slope** (perpendicular to the eave, in the roof plane)
* `v̂` — unit vector **along the eave**
* `n̂` — outward roof normal (`= û × v̂`)
* `O` — the eave corner (origin of the lattice), already offset by the eaves overhang
* `L` — tile length (up-slope), `w` — tile width (along-eave), `t` — tile thickness

**Gauge (= exposure) — the visible up-slope repeat:**
```
double-lap slate:   g = (L − headlap) / 2        headlap ≈ 0.25 … 0.35 · L
single-lap tile:    g = L − headlap              headlap ≈ 0.25 · L
```
Double lap means every point on the roof is covered by ≥ 2 tiles (true slate and plain-tile roofs); single lap is pantiles/interlocking tiles. For a stylised fantasy game **use double-lap numbers** — the tighter course spacing is what makes a roof read as slate rather than as corrugated panels.

**Tile placement:**
```
p(k, i) = O  +  û·(k·g)
             +  v̂·( i·w  +  (k mod 2)·(w/2)  −  w/2 )
             +  n̂·(t/2)
```
* `k` = course index from the eave, `0 … ceil(slopeLength / g)`
* `i` = tile index along the course, `−1 … ceil(eaveLength / w) + 1` (over-run by one at each end so the stagger doesn't leave a notch at the verge; clip later)
* `(k mod 2)·(w/2)` is the **running-bond stagger** — identical in principle to the half-block shift already used on your walls (`StoneTowerWallSurface.ts:63-90`). Without it the roof reads as a grid, which is the single most common failure.

**Orientation:** tile local `+Y` along `û`, local `+Z` along `n̂`, then apply the kick and jitter below.

**THE KICK — the most important single parameter.** Rotate each tile by `+2° … +5°` about `v̂`, so its butt (lower edge) lifts off the roof plane by `sin(kick) × L ≈ 0.01–0.03 WU`. Real tiles do this because each course rides over the head of the course below. **This is what creates the horizontal shadow line under every course.** With `kick = 0` you have a flat mosaic and the roof reads as a texture even though it is 1,400 real meshes. With `kick = 3°` it reads instantly as a tiled roof. If you implement only one thing from this section, implement the kick.

**Jitter** (per tile, seeded):
* `±1.5°` yaw about `n̂`
* `±0.5°` roll about `û`
* `±0.02·g` along `û`, `±0.015·w` along `v̂`
* `±0.5°` extra kick variance
* **4–8% value spread via `instanceColor`** — slate and clay roofs are strongly variegated; a uniform-colour tile roof looks synthetic even with perfect geometry.
* With probability ~0.02, drop a tile entirely (a gap showing dark batten beneath) and with ~0.01 rotate one by 25° (a slipped slate). Two lines; enormous character.

#### 3.2.2 The tile mesh — use 4 triangles, not a box

A `BoxGeometry` tile is 12 triangles, and 8 of those triangles are never seen (the underside, the two sides buried under neighbours, and the head buried under the course above).

**The 4-triangle tile:**
* **top quad** (2 tris) — the visible face, size `w × L`, normal `n̂`
* **butt quad** (2 tris) — the exposed lower edge, size `w × t`, normal roughly `−û` — this is what catches the course shadow

Nothing else. 3× cheaper than a box for identical appearance from above.

**Exception:** the **eave course** (`k = 0`) *can* be seen from below at close range, so give the eave course (and any course overhanging a verge) the full 8-triangle version with sides and underside. That's one course out of ~20.

#### 3.2.3 Diamond and fish-scale variants

**Diamond / lozenge (elven).** Tile is a rhombus with vertices at `(0, +L/2)`, `(+w/2, 0)`, `(0, −L/2)`, `(−w/2, 0)`. **2 triangles** for the face (plus 2 for a butt chevron if you want the shadow, giving 4). Gauge `g = L/2`, stagger `w/2` as usual. At `g = L/2` each diamond's waist sits exactly at the point where four neighbours meet, producing the classic lattice. Alternate two or three tints in a repeating pattern (`(k + i) mod 3`) for the banded-diamond look — via `instanceColor`, free.

**Fish-scale / scalloped (fae, vulperia, dragon-scale).** Tile is a rectangle of `w × (L − R)` topped… no: the round end is at the **butt** (downslope). Tile = rectangle `w × (L − R)` with a semicircular lower end of radius `R = w/2`. Use **4–6 arc segments**, not 16 — a slightly faceted scale reads as *carved* and costs 5–7 tris total instead of 18. Gauge `g = L − headlap` with `headlap ≈ 0.5·L`, so the visible part is essentially the round butt.

**Thatch (orcish).** Not tiles. Build as 4–6 stacked, slightly-scalloped bands along the eave (extruded profiles with a wavy lower edge), plus ~60 instanced straw wisps (2-tri quads) sticking out at the eave and ridge. The ridge gets a woven cap and pegged spars (thin crossed boxes) — the spars are the readable detail.

**Hexagonal metal plate (dwarven).** Regular hexagon, 4 tris (fan from centre with the far vertices merged) or 6 tris (full fan). Gauge `g = 1.5·R_hex`, stagger `√3·R_hex/2`. Add a rivet (a 6-tri instanced disc) at each of three corners — reads as riveted plate at distance.

#### 3.2.4 Ridge, hip, verge, eave, valley

These are the pieces that convert "a field of tiles" into "a roof."

**Ridge tiles.** A half-round (semi-cylinder, 6–8 radial segments, 2 length segments — 24–32 tris) or an angular two-plane cap. Laid along the ridge line at a pitch of `0.35–0.50 WU`, overlapping the previous by ~15%. **The ridge tile must overhang both pitches by ~0.6× its own width** so it visually swallows the top course on each side; if it doesn't, you see the ragged top course and it reads as unfinished. Optional: a **ridge crest / comb** (a repeating pierced or scalloped fin, `ExtrudeGeometry` of a small `Shape`) for elven, undead and vampire.

**Hip tiles.** Same section as the ridge, laid along the hip line. **Do not attempt to cut the field tiles to the hip.** The practical procedural trick: clip by *rejection* — for each candidate tile, test whether its centre lies inside the roof-plane polygon; if not, skip it. Then lay the hip roll over the resulting ragged edge, which covers it completely. Same trick for valleys, plus a V-section valley trough (an extruded strip) beneath.

**Verge (the gable edge).** Two options, both correct:
* a **bargeboard** (§3.3) — a chamfered plank following the rake, optionally carved;
* a **verge course**: tiles overhanging by `0.05–0.08 WU`, with a chamfered mortar fillet strip (one extruded profile) tucked underneath.
Never leave a raw tile edge at a gable.

**Eave.** Three pieces, all cheap, all necessary:
1. **Double eave course** — the first course is doubled (a short under-tile course of length `g` beneath course 0). This is why real roofs have a thick, shadowed bottom edge.
2. **Tilting fillet** — a thin triangular-section strip under the eave course that sets the kick. Visible as a shadow line; one extruded triangle profile.
3. **Fascia + rafter tails** — a board along the eave with 8–14 small projecting box ends beneath it at the rafter pitch. Rafter tails are among the highest readability-per-triangle details on a whole building.

**The eaves overhang itself is non-negotiable** (anti-pattern #9): `0.3–0.6 WU`. In `building_tools` this is done by insetting/outsetting the footprint polygon *before* skeletonising, in `extrude_and_outset()` (`ranjian0/building_tools:btools/building/roof/roof_types.py:390-419`). Do the same: outset the footprint, *then* build the roof planes.

#### 3.2.5 Non-rectangular roofs: the straight skeleton

For an arbitrary footprint polygon, the roof planes are the faces of the **straight skeleton** of that polygon. `building_tools` does exactly this:

```python
# ranjian0/building_tools:btools/building/roof/roof_types.py:104-141
skeleton = skeletonize(points, [])                        # HIP roof
skeleton = skeletonize(points, [], zero_gradient=True)    # GABLE roof
```
**That single `zero_gradient` flag is the entire hip-vs-gable difference.** Everything else — the ridge, the hips, the valleys — falls out of the skeleton's arcs.

Library: **`straight-skeleton`** (StrandedKitty) — https://github.com/StrandedKitty/straight-skeleton — MIT, ★88, **v3.0.0 published 2026-03-24**, last push 2026-03-24, not archived. CGAL compiled to WASM. Input contract is strict: `init()` once (async), outer ring CCW, inner rings (holes) CW, first vertex duplicated at the end. Returns `null` on failure — **always** have a fallback to your existing `pitchedRoof`/`hippedRoof`. A pure-TypeScript v1 lives on the `v1` branch if you want to avoid the WASM payload.

#### 3.2.6 Budget

Worked example — a `6 × 8 WU` gable roof at 40° pitch:
```
slope length per side = 3.0 / cos 40° = 3.92 WU
one pitch             = 8.0 × 3.92    = 31.3 WU²
two pitches + eaves   ≈ 70 WU²
tiles per WU²         = 1 / (g · w)
at g = 0.18, w = 0.28 → 19.8 tiles/WU²
total tiles           ≈ 1,390
```

| Tile mesh | tris/tile | roof total | × 40 buildings |
|---|---|---|---|
| **4-tri tile (recommended)** | 4 | **5,560** | **222k** |
| 8-tri tile | 8 | 11,100 | 445k |
| `BoxGeometry` | 12 | 16,700 | **668k** ✗ |

The 4-triangle tile is the difference between "affordable" and "not." Tune `g` and `w` up for a chunkier, cheaper, more stylised roof (`g = 0.25, w = 0.35` halves the count to ~700 tiles).

**Instancing:** one `BatchedMesh` (or `InstancedMesh` per tile type) **per settlement chunk**, not per roof — you want the per-instance frustum culling, and you want 40 roofs in one draw call, not 40. Use `setColorAt`/`instanceColor` for the value spread. `InstancedMesh.count` is mutable in `[0, maxCount]`, which gives you free LOD: drop the tile count and let the underlying textured roof plane show through.

**LOD ladder:** LOD0 = individual tiles; LOD1 = your existing stacked-band technique (`StoneTowerRoofCap.ts:20-52`) which already reads as courses; LOD2 = `slateTexture()` on a plain pitch. The transition between LOD0 and LOD1 is nearly invisible because both produce the same horizontal course rhythm.

---

### 3.3 Carved trim, bargeboards and friezes with interlace / knotwork

#### 3.3.1 The periodic plait — the practical construction

You do **not** need a general knot solver for a bargeboard run. A periodic `m`-strand plait is three lines of trigonometry and is visually indistinguishable from hand-drawn interlace at isometric distance.

Let the run go along local `x` from `0` to `Λ`. For strand `j = 0 … m−1`:
```
x_j(t) = t
y_j(t) = A · sin(ω t + 2π j / m)          // lateral position within the band
z_j(t) = Δ · cos(ω t + 2π j / m)          // relief, perpendicular to the board
ω = 2π / λ
```

**Why this gives correct, automatic, continuous over/under — the key insight:**

`z_j ∝ dy_j/dt`. A crossing between strands `j` and `k` happens where `y_j = y_k`; at any such point their lateral velocities are opposite (one is moving `+y`, the other `−y`), so their `z` values are opposite — one strand is in front, the other behind. **And because velocity reverses between consecutive crossings of the same pair, the over/under alternates automatically.** No crossing table, no bookkeeping, no special cases. A common mistake (which I want to flag explicitly, having initially mis-stated it) is to use a *doubled* frequency for `z` — that produces a **twist** (strand 0 always on top), not a plait. Same frequency, quarter-period phase offset, is the correct relation.

**Parameters:**

| | Value | Note |
|---|---|---|
| `λ` (period) | 0.55 – 0.70 WU | ~5–8 periods along a 4 WU bargeboard |
| `A` (half band width) | 0.10 – 0.14 WU | |
| `Δ` (relief) | `0.25 – 0.35 × A` ≈ 0.030 – 0.045 WU | **must be ≥ ~1.1 × cord radius** |
| `r` (cord radius) | 0.025 – 0.035 WU | |
| `m` (strands) | 3 | 2 gives a rope; 3 is the classic Celtic band; 4+ gets mushy at distance |

**The relief `Δ` is non-negotiable.** A knot drawn flat on a board reads as a *texture* regardless of how much geometry is in it (anti-pattern #21). Real normal-direction displacement is what lets the strands self-shadow and occlude each other, and that is the whole point of building it as geometry.

**Building it in three.js:**
```
pts   = sample x_j, y_j, z_j at 8–12 samples per period
curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5)
geo   = new THREE.TubeGeometry(curve, tubularSegments, r, radialSegments, false)
```
* **`radialSegments: 4`** gives a square-section cord. This is *historically correct* — carved (chip-cut) interlace on wood and stone has flat facets, not round cords. It also halves the triangle count versus the default 8. Use `5` for a slightly rounder cord on stone.
* `tubularSegments = 8 × periods` is plenty.

**Cost:** at 8 samples/period × 6 periods = 48 tubular segments × 4 radial × 2 tris = **384 tris per strand**; × 3 strands = **~1,150 tris per bargeboard**. Two bargeboards per gable = 2.3k. That is affordable on hero elven buildings, and should be LOD'd out beyond ~30 WU (replace with a plain chamfered board).

#### 3.3.2 The general grid algorithm (for terminal knots and panels)

When you need a genuine closed knot — a terminal medallion, a door-head panel, a shield boss — use the classic grid construction:

1. **Lattice.** Lay a rectangular grid over the panel. The knot lives on the **diagonal** lattice: strands travel at 45° through cell centres, bouncing off the panel boundary.
2. **Break set.** Choose a subset of the grid's *edge midpoints* to be "walls." At a wall, a strand **reflects** instead of crossing. The break set is the entire design vocabulary — different break sets give different knots from the same grid.
3. **Trace.** Pick an untraced (point, direction) pair. Step diagonally. On hitting the panel boundary or a break, reflect through the 45° mirror. Continue until you return to the start with the same direction — that closes one strand. Repeat until every lattice point is traced. The number of closed strands is emergent from the break set.
4. **Over/under is automatic and globally consistent.** Colour the diagonal lattice like a checkerboard: a strand travelling NE/SW passes **over** at cells where `(i + j)` is even and **under** where it is odd. This is guaranteed consistent because the diagram is 4-valent and alternating — it is a mathematical property, not a heuristic, so you never need to resolve conflicts.
5. **Displace.** For each traced polyline point, offset along the panel normal by `+Δ` at over-crossings and `−Δ` at under-crossings, with a smooth blend in between (a cosine ramp over ~half a cell). `Δ ≈ 1.1 × r`.
6. **Sweep.** `CatmullRomCurve3(pts, /*closed*/ true)` → `TubeGeometry(curve, segs, r, 4, /*closed*/ true)`.

#### 3.3.3 Terminals and mounting

**Terminal knots.** A plait that just stops mid-run looks broken. Options, cheapest first:
* **Loop-back:** at each end, bend the outer strands' phases so all `m` strands converge and loop back into each other over one extra half-period. Two extra sample points per strand.
* **Trefoil terminal:** drop a separate small closed 3-lobed knot mesh at each end (parametric trefoil: `r(θ) = R(1 + 0.3 cos 3θ)` on a torus, or just run the §3.3.2 algorithm on a 3×3 grid once at build time and reuse the geometry).
* **Zoomorphic head:** the elven/Norse option — a small carved head (a 40-tri primitive) that the strands enter. Highest character, needs an authored asset.

**Mounting — the backboard.** Interlace must sit **on** something. Build a **bargeboard** as an extruded `Shape`:
* the board follows the roof rake (an oriented plank, `0.10–0.15 WU` thick, `0.30–0.45 WU` deep);
* the **lower edge is shaped** — scalloped (a repeating semicircular scallop of radius `0.08 WU`), cusped, or a repeating cyma. A straight-edged bargeboard is a plank; a shaped one is architecture. This is nearly free (it's just extra points in the `Shape`);
* chamfer all arrises (`bevelEnabled: true`, `bevelSize ≈ 0.015`);
* the plait sits at `+Δ + r` off the board face;
* the two bargeboards meet at the gable apex — cover the mitre with a **finial** (a lathed spike, §3.4) or a carved boss. Never leave the mitre visible.

**Friezes and string courses** use the same construction laid horizontally: a swept moulded band with interlace, dogtooth (a repeating pyramid — 4 tris each, instanced), billet, chevron, or ball-flower. Dogtooth in particular is absurdly cheap and instantly reads as Romanesque/Norman carving — a good dwarven signature.

---

### 3.4 Columns, capitals, bases and arcades

#### 3.4.1 The lathe profile

`THREE.LatheGeometry(points: Vector2[], segments = 12, phiStart = 0, phiLength = 2π)` — verified r170 signature. Constraint: **the `x` coordinate of every point must be > 0** (it revolves about `Y`).

A column profile, bottom to top, as a list of `(radius, height)` points:

| Member | Radius behaviour | Height |
|---|---|---|
| **Plinth** | *not lathed* — a square box | `0.15–0.25 × D_base` |
| **Base — lower torus** | bulge out to `1.25 × r_base`, back in | `0.10 × D` |
| **Base — scotia** | concave hollow, in to `1.05 × r_base` | `0.08 × D` |
| **Base — upper torus** | bulge to `1.15 × r_base` | `0.07 × D` |
| **Apophyge** | concave flare into the shaft | `0.05 × D` |
| **Shaft** | **entasis curve**, 6–10 samples | `H` |
| **Astragal** | small roll, `1.06 × r_top` | `0.04 × D` |
| **Capital — echinus** | convex quarter-round out to `1.5 × r_top` | `0.18 × D` |
| **Abacus** | *not lathed* — a square slab | `0.10 × D` |

Total: ~20 profile points. At `segments = 10` that's `19 × 10 × 2 = 380` triangles for the lathed portion, plus two boxes. Very cheap for how much it reads.

#### 3.4.2 Entasis — the non-negotiable shaft curve

```
r(y) = r_top + (r_base − r_top) · cos( (π/2) · (y / H) )
```
Check: `y = 0 → cos 0 = 1 → r_base` ✓; `y = H → cos(π/2) = 0 → r_top` ✓. The curve is steepest near the top and nearly flat near the base, which is exactly the classical profile.

`r_top / r_base ≈ 0.80 – 0.85` for classical proportions; `0.88–0.92` for a heavier dwarven order; `0.72–0.78` for a slender elven shaft.

**Why this matters:** a cylinder with constant radius reads as a **pipe**. A cylinder with a straight linear taper reads as a **traffic cone**. Only the entasis curve reads as a *column*. It is a one-line change from `lerp` to the cosine above.

**Segment count:** use **8–12**, not 32. An octagonal or decagonal shaft reads as *carved stone* at isometric distance; a 32-segment shaft reads as *CAD*, and costs 3× as much. This is the same principle as the 4–6-segment fish-scale arc.

#### 3.4.3 Fluting without CSG

Do **not** subtract cylinders. Instead, build the shaft from a **lobed cross-section swept with the entasis scale**.

The section for `N` flutes is a closed `Shape`:
* `N` concave arcs (the flutes), each spanning `2π/N × 0.85` of the circle
* `N` narrow convex fillets or sharp arrises between them
* For low-poly, approximate each flute with **2–3 straight chords** and each fillet with 1 → `3N` to `4N` section vertices. At `N = 10`, that's 30–40 vertices.

Then build the shaft manually (not with `LatheGeometry`, which revolves a profile rather than sweeping a section):
```
for k in 0 … K:                       // K = 6–8 height rings
    y_k = k·H/K
    s_k = r(y_k) / r_base              // entasis scale from §3.4.2
    emit section vertices scaled by s_k, translated to y_k
connect consecutive rings with a quad strip
```
Cost: `K × sectionVerts × 2` triangles = `6 × 36 × 2 = 432` tris. Cheaper than a 32-segment smooth lathe, and *fluted*.

Historical detail worth having: **Doric flutes meet in sharp arrises** (20 flutes, no fillet); **Ionic/Corinthian flutes are separated by flat fillets** (24 flutes). For fantasy low-poly use `N = 8–12` either way.

**Twisted / Solomonic columns** (fae, vampire): rotate each ring's section by `β · y_k / H` with `β = 90°–180°`. One extra rotation per ring — completely free, and dramatic.

**Spiral-banded and chevron-carved shafts** (Norman/dwarven): same trick with `β` and a chunkier section.

#### 3.4.4 Capitals

* **Cushion / block capital** (Romanesque, dwarven): a cube with its four lower edges rounded into semicircular lunettes. Build as a box with a lathed quarter-round subtracted *by construction* — i.e. build the four faces as flat semicircular-topped panels and the corners as spherical-ish patches. ~80 tris.
* **Scalloped capital**: the cushion, but with 3 lunettes per face instead of 1. Very Norman. ~140 tris.
* **Foliate capital** (elven, Corinthian-ish): a lathed **bell** (an inverted cone with a concave profile) + 8–16 **instanced leaf shapes** wrapped around it in two ranks, each leaf a 6–10-tri curved quad splayed outward at the top. This is the kit-of-parts approach applied at the ornament scale, and it's why it's cheap.
* **Volutes** (Ionic, and for scroll ornament generally): a **logarithmic spiral**
  ```
  r(θ) = a · e^(b θ),     b ≈ 0.17,     θ ∈ [0, 4π]
  ```
  swept as a `TubeGeometry` with a **tapering radius** (see §3.7 for the taper technique), from `r_start` down to `0.35 × r_start`. Two volutes per face, mirrored. The taper is what makes it read as a carved scroll rather than a bent wire.

#### 3.4.5 Impost blocks and springing

**An arch springing directly from a column shaft reads as a cartoon** (anti-pattern #18). Real arches land on an **impost** — a rectangular block, wider than the shaft, that transitions from round to square and gives the arch something to sit on.

* width `1.15 – 1.30 × shaft diameter`
* height `0.25 – 0.40 × shaft diameter`
* **chamfered or moulded underside** — a simple 45° chamfer works; a cyma is better
* for a wall-mounted arch (no column), the impost becomes a **springer corbel** projecting `0.12–0.20 WU` from the wall face

One box plus a chamfer. It is the single cheapest fix on this list.

#### 3.4.6 Arcade bay repetition

An arcade is the split grammar (§2) applied horizontally:
```
Arcade  →  split(x, noAdjust){
               respondWidth : ResponsePier          // absolute, solid
             { ~P           : ArcadeBay }*          // integer bays
               respondWidth : ResponsePier          // absolute, solid
           }
ArcadeBay → split(x){ colWidth : Column | ~S : ArchOpening }
```
where `P` = bay pitch, `S = P − colWidth` = arch span, and the arch is built per §3.1.1 + §3.1.2.

**Vertical composition** of one bay, bottom to top: stylobate step → plinth → base → shaft (`H_shaft`) → capital → **impost** → springing line → arch (rise `h` from §3.1.1) → extrados → **spandrel** → string course → next storey.

Springing height `H_s = H_shaft + baseH + capH + impostH`. Total arcade height `= H_s + h + ringDepth`.

**Three details that carry an arcade:**
1. **End responds must be solid piers, not half-columns floating in air.** Real arcades terminate against a wall or a heavy pier. Absorb all the split slack here (absolute-width piers, floating bays) rather than by stretching the bays.
2. **Spandrels** — the roughly-triangular area between two adjacent arches — are the natural home for a roundel, a blind quatrefoil (§3.1.4 as a shallow recess), a carved boss, or a shield. Cheap, and they fix the "blank wall above the arches" problem.
3. **Alternating pier rhythm** (`A-B-A-B`: a compound pier, then a round column, then a compound pier) is a hallmark of real Romanesque and Norman work and gives you variety from a two-module library. Perfect fit for weighted selection with a deterministic alternating rule.

---

### 3.5 Ruins and damage

This is the least externally-sourced section in the report — see the caveat at the end. It is synthesised from the failure modes visible in the existing `buildRuin()` implementation plus standard environment-art practice, and each signal is independently testable.

**The core question is: what makes a ruin read as *collapsed* rather than as *unfinished*?** The answer is that a ruin must show **evidence of a process**: material that used to be up there is now down here; the break follows structural logic; and time has passed. An unfinished model shows a clean boundary with no consequence.

#### 3.5.1 Signal 1 — jagged, block-quantised break lines

For each wall column `(x, z)` sample a break height:
```
h(x, z) = h_base + amp · noise1D(runDistance / featureScale, seed)
h(x, z) = snapToUnit(h, BLOCK_UNIT)          // ← quantise to the block grid
```
Delete every block above `h`. Then, for the topmost surviving block in each column, with probability `≈ 0.35` make it a **loose survivor**:
* rotation `±6°` on all three axes
* position offset `±0.15 × BLOCK_UNIT`

Two things matter enormously here:

* **The break must be quantised to `BLOCK_UNIT`.** A smooth analogue break line cuts through blocks, which is exactly the "smooth cut face" problem that makes CSG the wrong tool. A quantised break steps between whole blocks and reads as masonry that *fell apart at the joints* — which is what real masonry does.
* **`featureScale` must be 2–5 blocks.** Pure per-column white noise reads as a **comb** (a regular sawtooth). Correlated noise at 2–5 blocks reads as collapse, because real walls fail in chunks.

A flat horizontal cut across a wall top is anti-pattern #14 and is the most common single failure in procedural ruins.

#### 3.5.2 Signal 2 — two leaves and a rubble core, with **decorrelated** break heights

**This is the #1 tell, and it is the one that most reliably converts "unfinished" into "collapsed."**

Real medieval walls are **two skins of dressed stone with a rubble fill between them**. When a wall breaks, the two skins almost never break at the same height — one leaf peels away lower, exposing the loose core behind it. That exposed core is the single most legible "this collapsed" signal available.

Implementation against your occupancy grid:
```
h_outer(x) = breakNoise(x, seedA)
h_inner(x) = breakNoise(x, seedB)              // DIFFERENT seed — this is the whole point
                                                // (or the same noise offset by λ/2)
coreTop(x) = min(h_outer, h_inner) − BLOCK_UNIT
```
* Fill the cells between the two leaves, up to `coreTop(x)`, with **smaller, randomly-oriented core fragments** (scale `0.4–0.7 × BLOCK_UNIT`, full random rotation, darker/rougher material variant via `instanceColor`).
* Where `h_outer < h_inner`, the core is visible from outside; where the reverse, from inside. Both are good.
* Bias the difference: make the **outer** leaf more likely to be the lower one (weathering and spoliation both attack the outer face first).

This requires the wall to have real thickness — which your block grid already gives you for free. It is the highest-value ruin signal per line of code, and it is essentially impossible to fake with a CSG cut or a texture.

#### 3.5.3 Signal 3 — exposed rafters and roof timbers

**Highest readability-per-triangle of any ruin signal.** A ruin with no roof and no rafters reads as "the roof was never modelled" (anti-pattern #15). A ruin with a half-collapsed rafter set reads instantly and unambiguously.

Generate the **full rafter set the intact roof would have had** — that's the trick; you build the intact structure and then destroy it, rather than trying to author "broken" directly:
* `~20–30` rafters, pitch `0.4–0.6 WU`, section `0.10 × 0.15 WU`, running from wall-plate to ridge
* 1 ridge beam, 2–3 purlins, and (for a hall) 2–4 tie beams

Then destroy:

| Operation | Probability | Detail |
|---|---|---|
| Delete | ~50% | **Delete in runs, not singletons.** Pick 3–5 gap centres and delete a contiguous run of 3–7 rafters around each. Uniformly-random deletion reads as noise. |
| Slip | ~25% | Rotate `15°–50°` **about the wall-plate end** (the foot stayed, the head fell). This is the pose that reads as collapse. |
| Drop | ~10% | Fell entirely — lying on the floor at a random angle, one end resting on rubble |
| Survive intact | remainder | Keep a few complete ones, ideally clustered at one gable — a partially-surviving bay is more legible than uniform destruction |

Add a wall-plate (a continuous beam along the wall top) which usually survives, and **corbels or joist sockets** — small rectangular holes in the wall face at the old floor level. Empty joist sockets in a bare wall are an extremely strong "there was a floor here" signal for about 6 triangles each.

For a burned ruin, darken the timber ends with `instanceColor` and add a few charred stubs still socketed in the wall.

#### 3.5.4 Signal 4 — rubble made from the *same* block geometry and material

`src/world/buildings/BuildingBuilder.ts:413-416` currently uses `IcosahedronGeometry(s, 0)` for rubble. **An icosahedron is a rock, not a piece of a building.** This is anti-pattern #13 and it is the most visible instance of "base geometry" in the current code.

Correct construction:
* **Same `BoxGeometry` block, same material object** as the wall (so it merges/batches into the same bucket).
* Fragment scale `0.55 – 1.0 × BLOCK_UNIT`, with occasional `1.0 × 1.0 × 0.4` slabs (a spalled facing stone).
* **Conservation of volume.** For a wall segment that lost height `Δh` over run length `ℓ`:
  ```
  debrisVolume ≈ wallThickness · ℓ · Δh · 0.6        // 0.6 accounts for material lost/robbed
  fragmentCount = debrisVolume / meanFragmentVolume
  ```
  A ruin with a 4 WU-high break and a thin scatter of 12 rocks at its foot is instantly wrong. The pile must be big enough to have plausibly come from the missing wall.
* **Pile distribution.** At distance `d` from the wall foot:
  ```
  R          = 1.4 · wallThickness + 0.45 · fallHeight     // spread radius
  density(d) ∝ exp( −(d/R)² )
  pileTop(d) = h_pile · max(0, 1 − d/R)^1.5                // convex talus profile
  ```
  The `^1.5` exponent gives a slightly convex talus, which is what real debris cones look like; a linear cone looks like a pyramid.
* **Resting orientation.** Bias ~60% of fragments to rest on a **face** — snap their rotation to the nearest axis-aligned orientation with `±12°` of jitter. A pile of uniformly-random-rotated boxes reads as static/frozen; a pile where most fragments lie flat and a minority are propped at angles reads as *settled*. This is a two-line change with a disproportionate effect.
* **Spill direction.** Debris goes on **both** sides of a breach, but ~70/30 in favour of the direction the wall fell.
* Mix in a few non-block fragments for interest: a broken voussoir (from §3.1.2 — you already have the geometry), a fallen capital, a section of string course, a shattered mullion. These are the pieces that tell you *what* fell.

#### 3.5.5 Signal 5 — partial vaults and broken arches

**Keep the springers.** In a real ruin, the first one to three voussoirs at each springing survive, because they are bonded into the pier masonry and carry no load once the crown is gone. The crown falls first.

```
for k in 0 … N:                     # voussoirs from springing to crown
    survives = (k < k_keep)  ||  (rng() < 0.12)
k_keep ∈ {1, 2, 3}
```
This is trivially easy given §3.1.2 (just stop emitting past index `k_keep`), and the result is unmistakable: a stub of curved masonry springing out of a pier and stopping in mid-air. **A cleanly-missing arch reads as "never built"; a surviving springer reads as "fell."**

**Vaults:** keep the diagonal ribs at the springing, delete the webbing entirely, and — crucially — leave **one complete rib arch out of four**. A single surviving rib spanning the void is one of the most iconic ruin images there is, and it costs one flag.

**Windows:** the tracery goes before the surround. Order of survival, most to least likely: voussoir arch ring → jambs → sill → mullions → tracery head → glass. So a good ruined window is a complete stone surround with **one or two mullion stubs** rising from the sill and nothing above. Snapping mullions off at `0.2–0.4` of their height (rather than deleting them) is the detail that sells it.

#### 3.5.6 Signal 6 — cracks, without CSG

Never boolean a crack. Instead:

1. **Choose a crack path** that runs **through the joints**, not through the stones — real masonry cracks follow the mortar. On your grid this is a stair-step path: from a seed block, walk upward, at each step choosing to go up, up-left, or up-right with weights biased by a noise field.
2. **Displace the neighbours.** For blocks adjacent to the path, apply:
   * a lateral offset of `0.02 – 0.05 WU` perpendicular to the crack, sign depending on which side
   * a rotation of `1° – 3°`
   * both **scaled by height** — a settlement crack opens toward the top, so scale by `(y − y_seed) / wallHeight`
3. Optionally drop 1–3 blocks out of the crack entirely near the top.

Result: a real dark line with genuine parallax and self-shadowing, at **zero** geometric cost (you're only changing transforms of blocks you were already emitting). This is strictly better than a CSG cut, which would produce a smooth-walled slot.

**Bulging** uses the same trick at larger scale: displace a lens-shaped region of the wall outward by up to `0.15 WU` with a smooth falloff. A bulging wall reads as *about to fail*, which is more interesting than one that already has.

#### 3.5.7 Signal 7 — vegetation as the decay clock

Vegetation is what tells the viewer **how long** it has been a ruin, and it is the cheapest signal on the list (instanced quads and clusters).

* **Moss/lichen** — vertex-colour tinting on north-facing and horizontal surfaces. Free.
* **Grass tufts** — instanced on every horizontal surface: broken wall tops, embrasure floors, rubble pile tops, the old floor level.
* **Ivy** — instanced leaf clusters following a set of upward random-walk curves on the wall face, with density falling off with height. A simple 2D random walk on the block grid, sampled into a `CatmullRomCurve3`, with leaf clusters instanced along it.
* **A sapling or two** — one growing out of the nave floor, one out of a broken wall top. A tree *inside* a building is an unmistakable time signal.
* **Root damage** — where a sapling grows out of a wall, displace the surrounding blocks outward (reuse the crack machinery from §3.5.6). This connects the vegetation causally to the damage, which is the difference between decoration and storytelling.

#### 3.5.8 The structural damage field — the thing that ties it all together

**Damage must not be uniform noise.** Real buildings fail at their weakest members, and the eye knows this even when the viewer can't articulate it. Define `damage(x, z, y) ∈ [0, 1]` as a weighted sum:

| Term | Sign | Rationale |
|---|---|---|
| distance from nearest corner or buttress | **+** | long unbuttressed mid-spans buckle first |
| height above ground | **+** | upper courses fall first; the plinth almost always survives |
| proximity to a large opening | **+** | a wide window head is a structural weak point |
| cell tagged `'buttress'` | **−−** | buttresses are the most robust elements — you already tag these at `src/world/buildings/FactionBlockProfiles.ts:195,221` |
| cell is a quoin | **−−** | corners are the strongest part of any masonry building (`src/world/buildings/StoneTowerQuoins.ts`) |
| low-frequency "event" field | **+** | one localised catastrophe rather than uniform decay |
| gable geometry | **−** | gables are self-bracing triangles and frequently survive as freestanding walls |

Then:
```
h_break(x, z) = wallHeight · (1 − damage(x, z))
```

**Two compositional rules that matter more than the field itself:**

1. **One dramatic breach beats uniform 50% decay.** Pick a single wall segment, drive `damage → 1.0` across `2–4 WU`, and put a large rubble spill on both sides. Everything else gets moderate decay. A ruin with a story (a siege breach, a collapse) reads far better than one that is evenly eroded.
2. **A surviving gable wall with an empty window opening and no roof is the single most iconic ruin silhouette there is.** Bias the gable-end walls to survive to near-full height. Since silhouette is ~80% of isometric readability, this one bias does more work than any amount of surface detail.

**Order of collapse** (use this to drive a single `ruinLevel ∈ [0,1]` parameter, which is much easier to author than seven independent knobs):

| `ruinLevel` | State |
|---|---|
| 0.0 – 0.2 | intact; a few slipped slates, moss, a crack |
| 0.2 – 0.4 | roof holes, some rafters exposed, glass gone, shutters hanging |
| 0.4 – 0.6 | roof gone entirely, rafter stubs, upper courses broken, tracery lost |
| 0.6 – 0.8 | walls down to ~half height, two-leaf breaks exposing core, arches broken to springers, large rubble piles, gables surviving |
| 0.8 – 1.0 | foundations, plinth course, stumps of piers, one surviving arch or gable, heavy vegetation, rubble everywhere |

#### 3.5.9 Sourcing caveat

**No academic primary source underpins §3.5.** OpenAlex and Semantic Scholar searches for procedural generation of ruins / damaged buildings / architectural weathering returned only HBIM and heritage-documentation surveys, nothing in graphics; Semantic Scholar rate-limited (HTTP 429) after the first query. Treat this section as **falsifiable engineering opinion** — each of the seven signals is independently testable by toggling it and asking whether the result reads as "collapsed" or "unfinished." My confidence is highest on signals 2 (two-leaf decorrelated breaks) and 3 (exposed rafters), which I would expect to survive any A/B test, and lowest on the specific numeric constants (`0.6` bulking factor, `^1.5` talus exponent, the 50/25/10 rafter split), which are plausible starting values rather than measured ones.

---


---

## 3.6 Masonry vocabulary

> **Truncation gap:** the opening prose and the table header of this section
> were lost in the original delivery. The section resumes mid-table, at the
> buttress row. The columns are: *element* | *how it is built* | *dimensions &
> existing code reference*.

| Element | Construction | Dimensions / existing code |
|---|---|---|
| **Buttress** | Projecting pier at each bay division, stepped back in 2–3 stages. Each set-off gets a **weathering** (a sloped top block, 30–45°) so water sheds. Cap with a gablet or pinnacle. Build from the same block courses as the wall so coursing lines continue across it | Width `0.8–1.2 WU`, projection at base `0.6–0.9 WU`, reducing `0.2 WU` per stage. Existing: `BuildingBuilder.ts:1057` |
| **Flying buttress** | Free-standing pier + a **segmental arch** (voussoirs, §3.1.1, with `R > span` so it's shallow) reaching the clerestory wall, + a **pinnacle** loading the pier top | Pier stands `1.5–2.5 WU` clear of the wall. The pinnacle is structurally the point — omit it and the buttress reads as scaffolding. Existing stub: `BuildingBuilder.ts:1491-1499` |
| **Cornice / eaves table** | Same technique as string course but with a larger, multi-member profile (fillet + cavetto + corona + cyma) and a `0.25–0.4 WU` projection, plus corbels beneath at regular intervals | This is the roofline shadow; combined with the plinth it brackets the facade top and bottom |
| **Blind arcading** | A run of shallow (`0.06 WU` deep) recessed arches on a blank wall. Cheap way to make an otherwise-empty dwarven/undead wall read as designed | Bay pitch `1.0–1.5 WU` |

The unifying principle: **every one of these is a *projection or recession relative to the wall face*, and each occupies a distinct depth.** See the depth-ladder rule in §5.

### 3.7 Lattice / trellis / vine domes

**Surface parameterisation.** Dome of radius `R`, `φ ∈ [0, π/2]` from pole to equator:
```
p(θ, φ) = ( R·sinφ·cosθ,  R·cosφ,  R·sinφ·sinθ )
n̂(θ, φ) = p / R                                      // outward normal (sphere ⇒ radial)
```
For an ogee/onion dome (fae, elven), replace `R` with a profile function `R(φ)` — or better, define the dome by a `LatheGeometry`-style profile `(r(s), y(s))` and generate ribs on *that* surface of revolution:
```
p(θ, s) = ( r(s)·cosθ,  y(s),  r(s)·sinθ )
```

**Rib families.** Three options, increasing in "grown/wrought" character:

1. **Meridians + hoops** (a birdcage). `N` meridian curves at `θ_i = 2πi/N`, `K` hoop rings at `s_j`. Reads as architecture, not as growth.
2. **Helical / rhumb double family** (recommended — this is what wrought-iron gazebos and grown-branch domes actually look like):
   ```
   family A:  θ(s) = θ₀ᵢ + k·s          i = 0..N-1,  θ₀ᵢ = 2πi/N
   family B:  θ(s) = θ₀ᵢ − k·s
   ```
   with `k ≈ 2.5–4.0` radians over the full `s` range. The two families cross in a **diamond lattice** whose cell size shrinks toward the pole — exactly the correct organic behaviour. For a true loxodrome (constant-bearing spiral) on a sphere: `θ(φ) = θ₀ + c·ln(tan(φ/2))`.
3. **Branching (grown-branch)**: start with `N` ribs at the base; at `s = 0.4` and `s = 0.7`, split a rib into two that diverge by `±8°` in `θ` and re-converge at the apex. Add short non-structural twigs that terminate mid-surface. This is what makes it read as *grown* rather than *built*.

**Weave / over-under.** At every crossing one rib must pass in front of the other. Cheapest correct implementation: offset the two families radially,
```
family A rides at  R + Δ
family B rides at  R − Δ,        Δ ≈ 1.05 × ribRadius
```
This is a two-line change and is visually correct at isometric distance. For a genuine alternating weave, modulate: `R(s) = R + Δ·sin(2π · crossingIndex(s))`, where `crossingIndex(s)` counts lattice cells traversed — this makes each rib genuinely alternate over/under, which is what a woven willow dome does.

**Thickening into tubes.**
```ts
const pts = sampleRib(θ₀, k, /*M=*/24);              // Vector3[]
const curve = new THREE.CatmullRomCurve3(pts, /*closed*/ false, 'catmullrom', 0.5);
const geo = new THREE.TubeGeometry(curve, 24, ribRadius, /*radialSegments*/ 5, false);
```
`radialSegments: 5` gives a pentagonal cross-section that reads as a hand-hewn branch and costs 5/8 of the default. Verified defaults: `TubeGeometry(path, tubularSegments = 64, radius = 1, radialSegments = 8, closed = false)` (r170 docs).

**Tapering the ribs** (essential for the "branch" reading — a constant-radius tube reads as pipe). `TubeGeometry` has a single radius, so:
- **Option A (post-process):** build the tube, then walk the position attribute. `TubeGeometry` lays out vertices as `(tubularSegments+1) × (radialSegments+1)` rings; for ring `t`, scale each vertex about the ring's centre `curve.getPointAt(t/T)` by `taper(t/T) = 1 − 0.55·(t/T)^1.3`.
- **Option B (build it yourself):** `const frames = curve.computeFrenetFrames(T, false)` gives `.normals[t]` and `.binormals[t]`; emit ring vertices as `P(t) + r(t)·(cos(α)·normals[t] + sin(α)·binormals[t])`. `TubeGeometry` also *exposes* `.tangents/.normals/.binormals` after construction (verified in r170 docs), so you can reuse its frames.

**Junctions.** Place a small `IcosahedronGeometry(ribRadius·1.6, 0)` or a short thick tube segment at each crossing — a "knuckle." Without knuckles the ribs visibly interpenetrate and read as a wireframe. ~40 tris each, instanced.

**Dressing.** Instanced leaf quads (or 3-quad leaf clusters) scattered along the ribs with density increasing toward the base; a few hanging tendrils (`TubeGeometry` on a short catenary); flowers at the apex. For a wrought-iron variant, replace leaves with instanced scroll ornaments (log-spiral tubes, §3.4).

**Budget.** `N = 12` ribs per family × 2 families = 24 ribs × (24 tubular × 5 radial × 2 tris) = **~5,760 tris**, plus ~140 knuckles at 20 tris = 2.8k. Roughly **9k tris per dome** — fine as a landmark structure, too heavy to put on 40 buildings.

---

## 4. Three.js-specific implementation guidance

### 4.1 InstancedMesh vs merged BufferGeometry vs BatchedMesh

All three verified against three.js **r170** docs (the version pinned in `package.json:39`).

| | `InstancedMesh` | `mergeGeometries` | `BatchedMesh` |
|---|---|---|---|
| Requires | same geometry, same material | same material (geometries may differ) | same material (geometries may differ) |
| Draw calls | 1 | 1 per material bucket | 1 (via `WEBGL_multi_draw`, with fallback) |
| Per-item transform | yes (`setMatrixAt`) | no — baked | yes (`setMatrixAt`) |
| Per-item colour | yes (`instanceColor` / `setColorAt`) | vertex-colour attribute only | yes (`setColorAt`) |
| Per-item culling | **no** (whole mesh culled as one) | no | **yes** (`perObjectFrustumCulled = true` default) |
| Per-item visibility | via degenerate matrix hack | no | **yes** (`setVisibleAt`) |
| Depth sorting | no | no | **yes** (`sortObjects = true` default, `setCustomSort`) |
| Memory | 1 geometry + N×16 floats | N copies of vertex data | 1 copy per unique geometry + N×16 floats |
| Mutable after build | yes | no (rebuild) | yes (`addInstance`/`deleteInstance`/`setGeometryAt`) |
| Constraint | — | — | pre-allocated `maxVertexCount`/`maxIndexCount`; `optimize()` to repack |

**Decision rules for this project:**

- **Roof tiles, wall blocks of one size, balusters, merlons, fence pickets, leaves, rubble** → `InstancedMesh` if you keep them per-building, or **`BatchedMesh` if you pool them settlement-wide** (which you should, for the per-instance frustum culling).
- **A whole finished building** → `mergeGeometries` per material bucket, exactly as `mergeGroupMeshesByMaterial()` already does (`src/scene/MeshMergeUtils.ts:32-47`). Static, minimum CPU, one draw call per material.
- **A kit-of-parts library placed many times with different parts** → this is the textbook `BatchedMesh` case: `addGeometry()` once per kit part, `addInstance()` per placement. You get instancing-level draw calls with a *heterogeneous* library. **This is the single biggest architectural win available and it is already in r170.**

**Gotchas verified in the docs:**
- `InstancedMesh`: *"Bounding boxes aren't computed by default… You may need to recompute the bounding sphere if an instance is transformed via `setMatrixAt()`"* — if you never call `computeBoundingSphere()`, distant buildings can pop or get wrongly culled.
- `InstancedMesh.count` is mutable in `[0, maxCount]` — use it for cheap LOD (drop tile count) without reallocating.
- `mergeGeometries(geos, useGroups)` requires *"All geometries must have compatible attributes."* The codebase already handles the classic trap: some primitives are indexed and some aren't, so it forces `toNonIndexed()` before bucketing (`MeshMergeUtils.ts:17-25`). Keep that.
- `BatchedMesh` throws if you exceed reserved vertex/index space; call `setGeometrySize()`/`setInstanceCount()` to grow, or `optimize()` to repack after deletions.
- **Material identity matters.** The codebase's merge buckets by material *object reference*, and `StoneTowerWallSurface.ts:73-76` documents the rule: *"All blocks share ONE material object reference (never cloned) … visual variation comes from geometry (size/protrusion jitter), not per-block material cloning."* Extend this: get colour variation from `instanceColor` or a baked vertex-colour attribute, **never** from cloned materials.

### 4.2 Swept and turned geometry — verified APIs (r170)

**`ExtrudeGeometry(shapes, options)`** — `docs/api/en/geometries/ExtrudeGeometry.html:57-75`
```
curveSegments  int   = 12    points per curve
steps          int   = 1     subdivisions along the extrusion depth
depth          float = 1
bevelEnabled   bool  = true
bevelThickness float = 0.2   how deep into the shape the bevel goes
bevelSize      float = bevelThickness − 0.1
bevelOffset    float = 0
bevelSegments  int   = 3
extrudePath    THREE.Curve   3D spline to extrude along — BEVELS NOT SUPPORTED with this
UVGenerator    object
```
Notes:
- Multi-material: *"if you'd like to have a separate material used for its face and its extruded sides, you can use an array of materials. The first material will be applied to the face; the second… to the sides."* Useful for tracery (dressed face / rough reveal) — **but** an array-material mesh will be skipped by `mergeGroupMeshesByMaterial()` (`MeshMergeUtils.ts:13-14` explicitly `return`s on `Array.isArray(mat)`). Either extend that function or split into two meshes.
- `bevelSegments: 1` + small `bevelSize` is the cheap way to chamfer every arris on tracery, string courses, and copings. Chamfers are what make procedural stone read as *cut* stone; the codebase currently passes `bevelEnabled: false` everywhere (`StoneTowerOpenings.ts:84,93`). **Turning this on for frames/trim is a one-line, high-impact change.**
- `steps` must be > 1 when using `extrudePath` on a curved path, or the sweep will be faceted between control points.

**`LatheGeometry(points, segments = 12, phiStart = 0, phiLength = 2π)`** — x must be > 0; rotates about Y. `phiLength < 2π` gives a partial lathe — useful for half-columns / pilasters engaged in a wall (build a half-lathe and cap it, rather than burying a full column).

**`TubeGeometry(path, tubularSegments = 64, radius = 1, radialSegments = 8, closed = false)`** — exposes `.tangents/.normals/.binormals`.

**`THREE.Shape` + `.holes`** — *"An array of paths that define the holes in the shape."* Already the pattern in `StoneTowerOpenings.ts:43-49`. Combine with `Path.absarc()` for the Gothic arcs of §3.1.1.

**`BufferGeometryUtils`** (`docs/examples/en/utils/BufferGeometryUtils.html`), import as `three/addons/utils/BufferGeometryUtils.js`:
- `mergeGeometries(geometries, useGroups)`
- `mergeVertices(geometry, tolerance = 1e-4)` — run this on merged block walls; adjacent blocks share vertices and this reclaims 20–40%
- **`toCreasedNormals(geometry, creaseAngle)`** — *"Returns the geometry with smooth normals everywhere except faces that meet at an angle greater than the crease angle."* This is the correct shading fix for merged, chamfered stone: crease at ~40° and your chamfers catch light as chamfers instead of smearing.
- `estimateBytesUsed(geometry)` — use this in a dev overlay to police the budget.

### 4.3 CSG: assessment and verdict

**`three-bvh-csg`** — https://github.com/gkjohnson/three-bvh-csg
- MIT · ★943 · **v0.0.18 published 2026-02-17** · last push **2026-08-20** · not archived · **actively maintained**
- npm: 131.6k weekly downloads, 34 dependents
- API: `Brush`, `Evaluator`, ops `ADDITION / SUBTRACTION / REVERSE_SUBTRACTION / DIFFERENCE / INTERSECTION / HOLLOW_SUBTRACTION / HOLLOW_INTERSECTION`
- Self-described in its own README as **"An _experimental, in progress_… CSG implementation"**, *"More than 100 times faster than other BSP-based three.js CSG libraries in complex cases."*
- **Documented constraints:**
  - *"All brush geometry must be two-manifold — or water tight with no triangle interpenetration."*
  - *"⚠ Due to numerical precision and corner cases resulting geometry may not be correctly completely two-manifold."*
  - README's own roadmap lists open bugs: *"Fix triangle splitting / missing triangle issues (#73, #68)"*, *"Polygon splitting & triangulation (#51)"*, *"Worker Support (#14)"* — i.e. **no worker offload today**, so every boolean blocks the main thread.
  - *"CSG results use `Geometry.drawRange`… which can cause three.js exporters to fail."*
  - Points at Manifold (https://github.com/elalish/manifold) *"for CAD operations with more robust numerical solutions."*
- `HOLLOW_SUBTRACTION` is genuinely interesting: brush A may be **non-manifold**; only B must be watertight. That is a real fit for "punch a hole in a wall surface."

**`three-csg-ts`** — https://github.com/samalexander/three-csg-ts
- MIT · ★589 · **v3.2.0 published 2024-05-28** · last code push **2024-05-28** (repo `updated_at` 2026-08-01 is metadata only)
- BSP-based — the ~100× slower family per three-bvh-csg's benchmark claim
- **Effectively dormant (~2¼ years since last publish).** Not recommended for new work.

**`@react-three/csg`** — v4.0.0, published 2025-03-02, MIT (pmndrs). A React-Three-Fiber wrapper *around* three-bvh-csg. Irrelevant here — this project is imperative three.js, not R3F.

**Verdict: keep the occupancy-carve approach. Do not adopt CSG for openings.** Reasons, in order:

1. **Aesthetic, not just technical.** A CSG cut through a coursed wall produces a *smooth planar cut face* through the middle of blocks. That is precisely the "base geometry" look the user rejected. The occupancy carve produces a reveal whose sides are **whole block faces with running-bond stagger** — the opening reads as *built around*, which is how real masonry openings are made. The current technique is not a compromise; it is the correct one.
2. **Robustness.** `clearBlock()` (`BlockKit.ts:58-63`) is O(1), deterministic, seed-stable, and cannot fail. three-bvh-csg's own README warns results may not be manifold and lists open triangle-loss bugs.
3. **Performance.** 40 buildings × ~12 openings = ~480 boolean evaluations at generation time, on the main thread, with no worker support. That is a guaranteed frame-time spike. The occupancy carve is a few hundred `Map.delete()` calls.
4. **You already have the one thing CSG would buy you.** Pierced panels (tracery) are handled natively by `Shape.holes` + `ExtrudeGeometry` — no boolean needed.

**Where CSG *would* earn its keep:** an **offline/one-time asset-baking step** (e.g. a build script that pre-generates a canonical library of tracery plates, corbel brackets, or fluted column shafts and exports them as compact `BufferGeometry` JSON). There, robustness matters less because a human inspects the output, and cost is amortised to zero at runtime. If you go that route, use `three-bvh-csg` (active, fast, MIT), not `three-csg-ts`.

### 4.4 Actively-maintained JS/three.js libraries relevant to procedural architecture

I searched npm and GitHub for procedural-architecture / greebling / modular-kit libraries. **Finding: no such library exists in the JS ecosystem.** npm searches for `greeble`, `procedural architecture three`, and `building generator threejs` return only the generic three ecosystem (`three`, `three-mesh-bvh`, `@react-three/*`) plus unrelated packages. Compare Houdini (SideFX Labs), Blender (`building_tools`, Archipack), and Unreal (PCG) — the JS ecosystem simply has nothing equivalent. **You are building this yourself; there is no library to adopt.** That's a real finding, not a gap in the search.

What *does* exist and is worth adopting:

| Package | Repo | License | Latest | Published | Health | Use here |
|---|---|---|---|---|---|---|
| `three` | mrdoob/three.js | MIT | 0.185.1 | 2026-07-01 | very active | project is on `^0.170.0`; `BatchedMesh` already present in r170 |
| **`straight-skeleton`** | StrandedKitty/straight-skeleton | MIT | **3.0.0** | **2026-03-24** | ★88, active, not archived | **Hip/gable/mansard roofs on arbitrary footprints** (CGAL via WASM). Direct analogue of what `building_tools` uses. Requires `init()` once (async WASM), CCW outer ring, CW inner rings, duplicated first vertex. A pure-TS v1 exists on the `v1` branch if you want to avoid WASM |
| `three-bvh-csg` | gkjohnson/three-bvh-csg | MIT | 0.0.18 | 2026-02-17 | ★943, active | **offline asset baking only** (see §4.3) |
| `three-mesh-bvh` | gkjohnson/three-mesh-bvh | MIT | 0.9.14 | 2026-08-01 | ★ very active, 4.2M weekly dl | fast spatial queries — useful for placement/occlusion tests (CGA's `occlusion()`), prop snapping, "is this bay blocked?" |
| `three-subdivide` | stevinz/three-subdivide | MIT | 1.1.5 | 2023-08-03 | maintenance-mode | Loop subdivision. Occasionally useful for organic fae/slime forms; **not** for masonry (it will round off exactly the arrises you want sharp) |
| `three-csg-ts` | samalexander/three-csg-ts | MIT | 3.2.0 | 2024-05-28 | dormant | **not recommended** |
| `@react-three/csg` | pmndrs/react-three-csg | MIT | 4.0.0 | 2025-03-02 | active | R3F-only; N/A here |
| Archipack | s-leger/archipack | GPL-3.0 | — | — | **legacy (Blender 2.79)** | reference reading only; ★381, 134 open issues |
| Building Tools | ranjian0/building_tools | MIT | v1.0.13 | push 2025-05-17 | ★1505, active, Blender 4.0 | **best readable reference implementation** for split→inset→extrude window/door/roof generation |

### 4.5 Performance budget for 30–60 visible buildings

**Draw calls.** Target **2–4 per building** at LOD0:
1. opaque stone/wood (all block courses + trim + tracery, merged by material)
2. roof tiles (or one settlement-wide `BatchedMesh`)
3. glass / emissive
4. foliage (instanced, settlement-wide)

At 60 buildings with per-building merging that's 120–240 calls; with settlement-wide `BatchedMesh` pooling for tiles and foliage it drops to ~130. Both are comfortable.

**Triangles.**

| LOD | Distance | Content | Budget |
|---|---|---|---|
| LOD0 | < 25 WU | individual tiles, full tracery, voussoir arches, all trim | **8–15k tris** |
| LOD1 | 25–60 WU | stepped shingle bands (existing `StoneTowerRoofCap` technique), tracery → pierced plate only, arches → smooth extruded band, wall → merged with interior faces culled | **2–4k tris** |
| LOD2 | > 60 WU | textured box massing + roof, silhouette props only | **300–600 tris** |

60 × 15k = **900k tris** worst case (everything at LOD0) — acceptable on desktop WebGL2, marginal on integrated GPUs. With a realistic LOD mix (≈8 at LOD0, 20 at LOD1, 32 at LOD2) you land around **220k tris**, which is very comfortable.

**Shadows.** Shadow rendering re-draws the scene. **Never set `castShadow` on individual blocks** — set it only on the *merged* building mesh. The codebase currently sets `mesh.castShadow = true` per block (`ModularSet.ts:35`, `StoneTowerWallSurface.ts` blocks) which is harmless *only because* they get merged; if any path skips the merge you'll pay 5,000 shadow draws. Additionally: cast shadows from LOD0/LOD1 only; use a tight shadow camera frustum around the settlement.

**Generation-time CPU — this is the real risk, not render cost.** Building 3,000–6,000 blocks per building as individual `THREE.Mesh` + `BoxGeometry` objects means thousands of allocations and a GC storm. Mitigations, in order of impact:

1. **Don't allocate a `BoxGeometry` per block.** Write vertices directly into a preallocated `Float32Array`. For a block-course wall you know the count up front: `courses × blocksPerCourse × faces × 4 verts`. One allocation instead of 5,000 objects. This alone is typically a 10–20× generation speedup.
2. **Cull interior faces before emitting.** `BlockKit.ts:73` already computes `FaceVisibility {N,S,E,W,U,D}`. Emit only visible faces. On a solid wall this removes ~55% of triangles *and* ~55% of the generation work. This is the greedy-meshing insight from voxel engines and it is already half-implemented.
3. **Cache by DNA hash.** Two "human_common" houses with the same seed-derived DNA should share one `BufferGeometry` and differ only by transform/instance colour. In a settlement of 60 buildings across 9 races you will get heavy reuse.
4. **Amortise across frames.** Generate on `requestIdleCallback` / a frame-budgeted queue (e.g. ≤ 4 ms/frame), streaming buildings in as the player approaches. The codebase already streams terrain chunks (`OverworldScene.ts:487` `_loadTerrainChunk()`), so the pattern exists.
5. **Scratch-object pools.** One reused `Matrix4`, `Vector3`, `Quaternion`, `Euler` per builder — the codebase already does this for slimes (`SlimeEnemy.ts:66-74` "reused every frame, no GC"). Apply the same discipline to building generation.
6. **`mergeVertices(geo, 1e-4)` then `toCreasedNormals(geo, ~0.7 rad)`** as the final bake step per building. Reclaims memory and fixes shading on chamfers.

---

## 5. Anti-patterns: why procedural buildings look cheap, and the fixes

### 5.1 The headline case — "a box with a darker box for a window"

**Why it fails, mechanically (three independent reasons):**

1. **Identical normals ⇒ identical shading.** The dark box's front face is coplanar-parallel with the wall face, so under any light both receive the same `N·L`. The eye reads a value difference at the *same* orientation as **paint**, not as an **opening**. Openings are read from *shading discontinuity*, not from albedo.
2. **No cast shadow, no self-shadow.** A real opening produces (a) a shadow cast by the head/lintel onto the reveal, (b) a bright top edge on the sill, (c) an ambient-occlusion gradient darkening into the recess. A flat dark box produces none of these at any light angle.
3. **No silhouette break.** At an isometric camera you see two faces of the building. A flush window contributes nothing to the silhouette or to the profile of the wall face. Real windows break the wall profile at the sill and the hood mould.

Secondary failure: near-coplanar geometry z-fights, which forces a small offset, which reads as a **decal floating on the wall**.

### 5.2 Minimum viable window/door at isometric distance

Five pieces, ~60–90 triangles, and it reads correctly at any distance:

| # | Element | Spec | Why |
|---|---|---|---|
| 1 | **Recess** | cavity depth ≥ **1 × wall block depth** (`≥ BLOCK_UNIT = 0.5 WU` here, or ≥ 0.12 WU minimum) | genuine occlusion; the interior goes dark on its own |
| 2 | **Proud surround** | frame projects ≥ **0.3 × recess depth** past the wall face | catches a bright top edge and casts a hard shadow onto the reveal |
| 3 | **Sill** | projects **past the frame** by 0.03–0.06 WU, with a **chamfered/weathered top** and a drip on the underside | **the single most legible window part at distance** — a hard horizontal highlight above a hard horizontal shadow. If you add only one thing, add the sill |
| 4 | **≥ 1 internal division** | a mullion, a transom, or a cross bar — real geometry crossing the aperture | breaks the "plain dark rectangle" reading; gives the eye a scale reference |
| 5 | **Glazing set back** | a plane at recess depth − 0.02, **dark and rough**, slightly emissive at night; *not* transparent | transparency reveals there's no interior; dark rough glass reads correctly and costs nothing |

The codebase's `buildRecessedArchOpening()` (`StoneTowerOpenings.ts:77-103`) already implements **1** and **2** correctly — its doc comment explicitly calls out the fix: *"real depth between the two pieces, not two coplanar decals."* **The gaps are 3 (sill) and 4 (mullion).** `StoneTowerWindows.ts:70-76` adds a moonstone oculus accent near the arch point, which is a nice motif but is not a substitute for a sill.

Doors additionally need: a **threshold step** (one block, projecting), **hinges/strap ironwork** (3–5 thin boxes across the door face — reads at distance, unlike a doorknob), and **planked construction** (5–7 vertical boards with 0.01 WU gaps, not one flat panel). `ModularSet.ts:65-76` currently gives a box frame, a box door, and a `SphereGeometry(0.06, 5, 5)` handle — the handle is sub-pixel at isometric distance and the flat panel reads as plastic.

### 5.3 The depth ladder — the single most useful rule

Every element on a facade must sit at a **distinct, quantised depth relative to the wall face.** Nothing coplanar, ever.

```
+0.30  buttress face
+0.12  chimney breast / pilaster
+0.08  quoin, string course, hood mould, sill nose
+0.04  frame / surround / door architrave
 0.00  wall face
−0.06  blind arcade recess, panel recess
−0.12  window/door reveal (jambs, head, sill top)
−0.20  glazing plane / door face
```

Quantising to a ladder (rather than arbitrary offsets) does three things: it guarantees no z-fighting; it makes the shadow structure legible and consistent across the whole settlement; and it gives you a machine-checkable invariant. **Add a dev assertion that flags any two coplanar surfaces within 0.005 WU.**

### 5.4 The full anti-pattern catalogue

| # | Anti-pattern | Why it reads as placeholder | Fix |
|---|---|---|---|
| 1 | Flat untextured plane | zero silhouette thickness; edge-on it vanishes | every plane gets extruded thickness + a chamfer/return on every free edge |
| 2 | Box-with-darker-box window | §5.1 | §5.2 five-piece minimum |
| 3 | **Parametric scaling instead of module swapping** | mouldings scale with the element; a 1.6× window has 1.6× mullions | fixed-size modules + floating filler (CGA `~`, §2) |
| 4 | Uniform module repetition | reads as tiling, not as building | weighted variants + per-instance jitter + **one "special" bay per facade** (a door, an oriel, a blocked-up window) |
| 5 | **Everything coplanar** | no shadow hierarchy; the facade is a flat picture | §5.3 depth ladder |
| 6 | Perfectly true verticals/horizontals | reads as CAD | ±0.5–1.5° rotation jitter, ±2% size jitter per block (already in `StoneTowerWallSurface`) |
| 7 | Uniform colour across all blocks | reads as a single extruded solid | 3–6% per-block value spread via `instanceColor`/vertex colours — **never** cloned materials (breaks merge bucketing) |
| 8 | Smooth cone/plane roof | after windows, the biggest tell | real tile courses (§3.2); at minimum stepped bands + a real thickened eave with visible tile butts |
| 9 | **No eaves overhang** | roof flush with the wall reads as a CAD extrusion | overhang **0.3–0.6 WU** with a visible fascia and rafter tails. `building_tools` does this via `extrude_and_outset()` *before* skeletonising (`roof_types.py:390-419`) |
| 10 | No plinth / no ground contact | building appears to float or to be stuck into the terrain | plinth course + a skirt of rubble/soil/grass at the base |
| 11 | Perfect bilateral symmetry | reads as generated | off-centre door, one chimney, asymmetric wing, one different window |
| 12 | Clean silhouette against sky | silhouette is ~80% of readability at isometric distance | chimneys, finials, weathervanes, banner poles, ridge cresting, a nest, a broken shutter |
| 13 | Rubble made of different primitives | `IcosahedronGeometry` is a *rock*, not a *broken building* — currently in `BuildingBuilder.ts:413-416` | rubble = the **same block geometry + same material**, scaled and rotated (§3.5.4) |
| 14 | Flat horizontal cut across a ruined wall top | reads as "unfinished," not "collapsed" | jagged block-quantised break + loose rotated top blocks + visible wall thickness (§3.5.1–2) |
| 15 | Missing roof with no rafters | reads as "roof was never modelled" | keep the rafter set, delete 50%, drop a few (§3.5.3) |
| 16 | Uniform damage everywhere | real structures fail at their weakest members | drive damage from a structural field: high at long unbuttressed mid-spans, low at corners/buttresses |
| 17 | Crenellations without coping | merlons read as teeth on a box | chamfered coping course on every merlon top and every embrasure floor |
| 18 | Arch springing directly from a shaft | reads as a cartoon | insert an **impost block** at springing height (§3.4) |
| 19 | Sub-pixel detail (doorknobs, tiny bolts) | costs triangles, contributes nothing | at isometric distance the smallest readable feature is ~0.08 WU. Spend that budget on sills, string courses, and silhouette instead |
| 20 | Constant-radius tubes for organic ribs | reads as pipework | taper the radius along the curve (§3.7) |
| 21 | Knotwork drawn flat | reads as a texture even when it's geometry | ±1 cord-radius of real normal-direction relief so it self-shadows (§3.3.1 step 5) |

---

## 6. RECOMMENDATIONS FOR THIS PROJECT

Ordered by **(visual impact) ÷ (implementation cost)**, and chosen specifically to *extend* the existing block-course technique rather than replace it.

### Tier 1 — do these first (high impact, low cost, no architectural change)

**R1. True two-centred Gothic arch, replacing the two-straight-line point.**
`StoneTowerOpenings.ts:20-25` already documents this as a known stylisation. Replace `buildArchShape()`'s `lineTo(0, straightHeight + pointHeight)` with two `Path.absarc()` calls using the exact construction in §3.1.1, parameterised by a single `archRatio = R/S`. **Why:** one function, ~20 lines, and it immediately gives you per-race arch character for free — `0.5` Romanesque (dwarven, orcish), `1.0` equilateral (human, undead), `1.6+` lancet (elven, vampire). It also feeds every downstream consumer (`StoneTowerWindows`, doors, blind arcading) without touching them.

**R2. Add the sill and one mullion to every opening.**
§5.2 items 3 and 4 are the two missing pieces from an otherwise-correct opening. A sill is one chamfered box projecting past the frame; a mullion is one thin box crossing the aperture. **~20 triangles for the largest single readability gain available.** The frame/cavity depth machinery already exists (`buildRecessedArchOpening`).

**R3. Turn on bevels for all trim and frames.**
`StoneTowerOpenings.ts:84,93` pass `bevelEnabled: false`. Switch frames, sills, copings, and string courses to `{ bevelEnabled: true, bevelSize: 0.15*frameWidth, bevelThickness: 0.15*frameWidth, bevelSegments: 1 }`. Then run `toCreasedNormals(geo, 0.7)` in the merge bake. **Chamfered arrises are the difference between "cut stone" and "extruded cardboard" under a low sun**, and this is a parameter change.

**R4. Voussoir arches instead of smooth extruded arch bands.**
§3.1.1. This is the block-course technique applied to arches, so it will match the existing walls *exactly* — same jitter, same material, same merge bucket. `N = 7..11` wedge blocks per half-arch, keystone 1.3× depth and 0.03 WU proud. Use for doorways, window heads, arcades, and bridge spans. It also gives you ruined arches for free (stop emitting past index `k`, §3.5.5).

**R5. Continuous string course + plinth on every building.**
§3.6. Sweep a small chamfered profile along a closed `CurvePath` of the footprint at each floor line, plus a 2–3 course plinth with a weathered top. **Per triangle spent, this is the highest-value detail on any facade** — it creates the horizontal shadow lines that separate floors and kills the "one tall box" reading. It also fixes anti-pattern #10 (ground contact).

**R6. Retire `ModularSet.windowPanel()` / `doorPanel()` and `BuildingBuilder.buildRuin()`'s icosahedron rubble.**
These are the two live instances of exactly what the user rejected (`ModularSet.ts:42-76`; `BuildingBuilder.ts:413-416`). Route all openings through `buildRecessedArchOpening()` and all rubble through same-material block fragments (§3.5.4). Even if these code paths are legacy, they are the ones that will surface as "base geometry BS" in a screenshot.

### Tier 2 — the structural upgrades

**R7. Introduce a formal socket/connector layer over the existing block grid.**
Adopt marian42's model verbatim (`ModulePrototype.cs:9-72`): 6 faces per module, integer `Connector` ID, `Symmetric`/`Flipped` for horizontal, `Invariant`/`Rotation` for vertical, `ExcludedNeighbours` blacklist, `Probability` weight. Snap everything to `W = 4·BLOCK_UNIT = 2.0 WU` and `F = 6·BLOCK_UNIT = 3.0 WU`. **Why this and not WFC:** you get the interchangeability and auto-derived rotations without the backtracking/failure complexity, and you keep the octagonal footprints the kit already uses. Reserve full WFC for genuinely 3D-adjacent structures (elven treehouses spanning branches, stacked vampire tiers).

**R8. Implement the split-grammar solver (`split`/`repeat` with abs/rel/float sizes).**
§2.3. This is maybe 150 lines of TypeScript and it is the highest-leverage architectural addition in this report. It is what makes a 7.3 WU facade and a 9.1 WU facade both produce correctly-proportioned bays with unstretched mouldings — the exact problem that parametric scaling cannot solve. Keep **one grammar** and swap the module library, weight table, and constants per race (9 libraries, 1 grammar).

**R9. Real roof tiles as instanced 4-triangle tiles.**
§3.2.2. Replace `slateTexture()` at LOD0 with individual tiles laid on the gauge lattice with running-bond stagger and a 2–5° kick. **The kick is the critical parameter** — it produces the per-course shadow line. Budget check: 4 tris/tile × ~1,580 tiles = 6.3k tris/roof; at 40 buildings = 252k tris. Use the existing `StoneTowerRoofCap.ts:20-52` stepped-band technique as LOD1 and `slateTexture()` as LOD2. Diamond/fish-scale silhouettes for elven, plain slate for human/undead, thatch for orcish, hex-plate metal for dwarven.

**R10. Adopt `BatchedMesh` for settlement-wide instanced detail.**
It's already in r170 (`docs/api/en/objects/BatchedMesh.html`). One `BatchedMesh` per settlement chunk for roof tiles, one for foliage, one for rubble. You get `perObjectFrustumCulled` (default `true`) and `sortObjects` (default `true`) with a single draw call, across a *heterogeneous* geometry library — which is exactly the kit-of-parts case and which `InstancedMesh` cannot do. Keep `mergeGroupMeshesByMaterial()` for the per-building static shell.

**R11. Adopt `straight-skeleton` for roofs on non-rectangular footprints.**
https://github.com/StrandedKitty/straight-skeleton — MIT, v3.0.0 (2026-03-24), CGAL via WASM. This is the same algorithm `building_tools` uses (`roof_types.py:104,141`), and the hip/gable distinction is a single flag. Mind the input contract (CCW outer ring, CW holes, first vertex duplicated at the end, `init()` once) and the `null` return on failure — fall back to the existing `pitchedRoof`/`hippedRoof` on `null`. **Do the eaves outset on the footprint polygon *before* skeletonising**, per `extrude_and_outset()`.

**R12. A reusable `ruinate(grid, params)` pass.**
§3.5. Generalise the existing undead crumbled-crenellation pass (`FactionBlockProfiles.ts:1399-1402`) into a shared post-pass with the seven signals. Priority order within it: (1) jagged block-quantised break with loose rotated top blocks, (2) two-leaf walls with decorrelated break heights, (3) exposed rafter set with 50% deletion and a few dropped, (4) same-material rubble piles sized from the lost volume. Items 1–3 are cheap; item 2 is the one that most reliably converts "unfinished" into "collapsed." Drive `damage(x,z)` from a structural field, exempting cells tagged `'buttress'` (`FactionBlockProfiles.ts:195,221`).

### Tier 3 — race-specific signature features

**R13. Gothic tracery via `Shape` + `holes` + `ExtrudeGeometry`** (§3.1.3 strategy C) for undead/vampire/human churches. The `Shape.holes` machinery is already proven in `_buildFrameShape()` (`StoneTowerOpenings.ts:43-49`) — this is the same technique with more holes. Use the exact n-foil formula (`a = R_c/(1+sin(π/n))`, `r = a·sin(π/n)`) for trefoils and quatrefoils.

**R14. Celtic interlace bargeboards** (§3.3) for elven. Start with the cheap periodic 3-strand plait — it is visually indistinguishable at isometric distance from a full knot solver and is ~30 lines. **Do not skip the normal-direction `z` displacement**; a flat knot reads as a texture no matter how much geometry is in it. Add trefoil terminal knots at each end of the run.

**R15. Helical double-family lattice domes** (§3.7) for fae gazebos and elven canopies. Two families of `θ(s) = θ₀ ± k·s` at radii `R ± Δ` gives the intertwined diamond lattice with correct over/under for two lines of code. Taper the tube radii (post-process the position attribute or use `computeFrenetFrames`), and add knuckle spheres at crossings.

**R16. Lathe columns with entasis + fluting-by-lobed-extrusion** (§3.4) for dwarven halls and human temples. `r(y) = r_top + (r_base − r_top)·cos((π/2)(y/H))` — never a straight taper. Flute by lobed cross-section, **not** by CSG subtraction.

### Explicit non-recommendations

- **Do not adopt CSG for carving openings.** §4.3. The occupancy carve is not merely adequate — it is *aesthetically superior* here, because it preserves whole-block reveals with running-bond stagger, whereas a boolean cut produces a smooth planar face through the middle of blocks (i.e. the exact "base geometry" look that was rejected). It is also O(1), deterministic, and cannot fail, versus a library whose own README says results "may not be correctly completely two-manifold" and which has no worker support.
- **Do not adopt `three-csg-ts`** (dormant since 2024-05-28, BSP-based, ~100× slower).
- **Do not go looking for a JS procedural-architecture library.** Verified: none exists. Budget for building the kit system yourself; use `building_tools` (MIT, readable Python) as the reference implementation for split→inset→extrude.
- **Do not use `three-subdivide` on masonry.** It will smooth away exactly the arrises that make stone read as stone.
- **Do not clone materials for colour variation.** It breaks merge bucketing, which is keyed on material object identity (`MeshMergeUtils.ts:26-27`; documented in `StoneTowerWallSurface.ts:73-76`). Use `instanceColor` or a baked vertex-colour attribute.

---

## 7. Gaps, uncertainties, and unverified claims

**Could not retrieve (all attempted, all failed):**
- **Havemann & Fellner, "Generative parametric design of Gothic window tracery" (2004)** — existence, authors, venue, and DOI `10.2312/VAST/VAST04/193-201` were **verified** via the Semantic Scholar Graph API (paper ID `41e26bf0c36d3366f7bfc66387a36afd42721386`, DBLP `conf/smi/HavemannF04`). I could **not** retrieve the full text, so my tracery construction math in §3.1 is derived from first principles and standard architectural geometry, **not** from that paper. Treat the math as correct-by-derivation (I verified the n-foil tangency algebra) but the *attribution* to Havemann is for the general "generative parametric tracery" idea only.
- **Wonka et al. 2003 "Instant Architecture" PDF** — three peterwonka.net URL patterns all 404'd. The **bibliographic record and abstract were verified via Crossref** (DOI `10.1145/882262.882324`), which is where the split-grammar / control-grammar / attribute-matching quotes come from. Müller 2006 both resolved (Crossref DOI `10.1145/1141911.1141931`) **and** has a working PDF mirror at `peterwonka.net/Publications/pdfs/2006.SG.Mueller.ProceduralModelingOfBuildings.final.pdf` (HTTP 200).
- **Unreal's PCG *Building Generator*** — the dedicated docs page (`.../pcg-building-generator-in-unreal-engine`) returns an un-hydrated Angular shell. Only the general **PCG overview** page rendered, which is what I cited. My characterisation of Epic's approach as "point-cloud + attribute-driven mesh resolution" comes from that overview page and is a reasonable inference, **not** a verified description of the Building Generator tool specifically.
- **Houdini / SideFX Labs Building Generator** — three URL patterns under `sidefx.com/docs/houdini/nodes/sop/` returned 404, and the SOP index is too large to page through economically. **No Houdini claims are made in this report.**
- **Townscaper technical detail** — `oskarstalberg.com` redirects to a tumblr; `oskarstalberg.com/game/townscaper/` 404s; Wikipedia's article is non-technical (verified: describes it only as a low-poly city builder by Oskar Stålberg, 2021). Web search was unusable (DuckDuckGo returned a rate-limit code; Bing's RSS endpoint returned unrelated spam for all three queries). **I therefore cite marian42's WFC city instead** — it is a fully open, source-verifiable implementation of the same module/connector/WFC pattern, with the data structures readable in `ModulePrototype.cs`. The codebase's own comment invoking Townscaper (`BlockKit.ts:10-13`) is a reasonable characterisation but I could not independently verify Townscaper's internals.
- **Procedural ruins literature** — OpenAlex and Semantic Scholar searches for "procedural generation of ruins / damaged buildings / weathering" returned nothing on-topic (results were HBIM/heritage-documentation surveys). Semantic Scholar rate-limited (HTTP 429) after the first query. **§3.5 is therefore practice-derived, not paper-derived** — it is synthesised from the failure modes visible in the existing `buildRuin()` implementation plus standard environment-art practice. It is the least externally-sourced section of this report and should be treated as opinion, albeit falsifiable opinion (each of the seven signals is independently testable).

**Verified-and-solid:** all three.js API details (fetched from `mrdoob/three.js` at `refs/tags/r170`, matching `package.json`); all library maintenance data (GitHub + npm registry APIs, 2026-09-04); CGA `split`/`comp` operator semantics (live Esri docs); the Wonka 2003 and Müller 2006 bibliographic records (Crossref); `building_tools` source excerpts (fetched from the repo); `marian42/wavefunctioncollapse` source and article; and every citation into this repository (read directly from the working tree).

**Two claims I'd flag as engineering judgment rather than fact:**
1. The triangle/draw-call budgets in §4.5 are estimates from arithmetic, not from profiling this project. Validate against the existing sandbox HUD (`src/sandbox.ts:1718` already displays draw-call counts).
2. The "4-triangle tile" recommendation assumes tiles are never viewed from below or edge-on at close range. If the camera can get inside a building or under an eave, you'll need the butt-and-side faces too (8 tris) — still far better than a 12-tri box.

**Suggested follow-ups if more depth is needed:** retrieve the Havemann & Fellner 2004 paper through an institutional/Eurographics DL route to validate the tracery parameterisation; find the Unreal PCG Building Generator page through a non-JS mirror; and locate Oskar Stålberg's EPC talk (video, so it would need a transcript source) for the irregular-quad-grid detail that the `BlockKit.ts` comment alludes to.