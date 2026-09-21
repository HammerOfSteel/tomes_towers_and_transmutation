# Research Notes — Sub-task 1.2: Procedural Overworld/Outdoor Asset Blueprints

**Initiative:** Overworld/Outdoor Polish, Phase 1, sub-task 1.2 (per the
`research-driven-world-polish` skill — research step only; no spec/plan/code
in this document).

**Problem restated (from the user's brief):** trees and other outdoor nature
props currently look basic and repeat too much. Need modular, procedural-first
"kit-of-parts" blueprints so each generated asset (per category: trees, rocks,
bushes, etc.) varies genuinely in geometry, texture, and style while reading
as coherent/beautiful, and the category/sub-category inventory is thin and
should expand.

---

## 1. What already exists in this codebase (read before designing anything)

This project has iterated on nature assets twice before (`2026-08-01-nature-
asset-variety-design.md`, `2026-08-30-nature-asset-biome-correctness-design.md`
— both fully read this session). Summary of the current live system:

- **`NatureAssetDNA.ts`** — deterministic **DNA-style archetype selection**:
  `hashIndex(a, b, count)` (position → bucket hash, reused from
  `TerrainGeometryBuilder.ts`'s `cellVariantIndex` technique) drives
  `pickTreeArchetype(biome, wx, wz)` and `pickRockArchetype(wx, wz)`. Per-biome
  archetype tables (`BIOME_TREE_ARCHETYPES`) already exist and are correctly
  biome-gated (desert → cactus family, savanna → acacia, taiga → conifer-only,
  etc.) — **this part of the "DNA" idea already works well and should be kept,
  not replaced.**
- **`OverworldScene.ts`'s builder methods** (`_buildConiferTree`,
  `_buildDeciduousTree`, `_buildSparseTree`, `_buildCactusTree` →
  saguaro/barrel/pricklypear, `_buildAcaciaTree`, `_buildJoshuaTree`,
  `_makeRock` → boulder/slab/cluster, `_makeBush`) — **6 tree archetypes, 3
  rock archetypes, 1 bush style.** Every single one is built the same way:
  a small, fixed number of THREE.js primitive geometries
  (`ConeGeometry`/`CylinderGeometry`/`IcosahedronGeometry`/`DodecahedronGeometry`/
  `BoxGeometry`/`SphereGeometry`), randomized only in **scalar** dimensions
  (height, radius, count, position jitter) via the passed-in `rand()`. There
  is **no part library, no branching structure, no combinatorial assembly** —
  it's "one hardcoded shape recipe per archetype, randomized in scale," which
  is exactly why, per the user's report, they still read as repetitive at
  scale: with only 6 tree "recipes" total (across ALL biomes), a mid/large
  world's hundreds-to-thousands of trees are guaranteed heavy silhouette reuse
  no matter how much per-tree scalar jitter is applied.
- **`NatureAssetBuilder.ts`'s `makeMottledCanvasTexture()`** — a single texture
  technique (blobby noise on a flat base color) shared by canopy/rock
  materials via `OverworldScene._pooledMaterial()`'s small (4-6 variant) pool
  per archetype-part. Texture variety is real but shallow: it's the same
  "mottled blob" algorithm for every material, just re-seeded — no distinct
  *texture families* (e.g. bark-grain vs. leaf-cluster vs. rock-facet look).
- **Explicitly deferred/out-of-scope in the prior two specs** (so NOT already
  solved, don't assume otherwise): bush archetype variety (still 1 style),
  rock biome-differentiation, flower patches, snow drift/ice patch, twisted
  shrub, sparse shrub, mud pool, fairy-ring mushrooms — all still `🔲` in
  `TODO/01-overworld-studio/game-inventory.md` §5a. **This confirms the user's
  "category/sub-category inventory is thin" complaint is accurate and
  previously acknowledged, not new.**
- **Performance-critical existing machinery, directly relevant to 1.2's
  design constraints (found via `1.1`'s FPS investigation, still open at
  "middle-size world is slow"):**
  - `MeshMergeUtils.ts`'s `mergeGroupMeshesByMaterial()` — **static CPU merge**
    of every scatter mesh in a chunk into one mesh per shared material. This
    was "the dominant cause of sub-7fps" before it existed (comment in
    `OverworldScene.ts`: 3000+ draw calls at default settings). It solves
    **draw-call count**, not **triangle count** — merging doesn't reduce
    total vertices; a richer per-tree part kit that adds more triangles per
    tree will still cost real GPU time even after merging. Any 1.2 design
    must budget triangle count per prop instance, not just rely on "it'll get
    merged so it's free."
  - **`THREE.InstancedMesh` is already a proven, live pattern in this
    codebase** — `GrassField.ts` (blade instancing + wind-shader), enemy
    `SlimeEnemy.ts`/`OverworldScene._slimeIM`, `BlueprintLayer.ts` (biome floor
    tiles). It is **NOT currently used for trees/rocks/bushes** — those use
    the static-merge approach instead. This is the single most relevant
    **unwired-for-this-purpose** existing technique: instancing a shared
    "part" geometry (e.g. one canopy-blob geometry, one trunk-segment
    geometry) across every place it's used in the visible world would let a
    kit-of-parts design add real part variety while *reducing* GPU cost
    versus today's per-object-unique-geometry + CPU-merge approach (one GPU
    buffer per part type, only a transform+color varies per instance,
    instead of duplicating vertex data across thousands of merged triangles).
    This is a strong architecture candidate to carry into the design/spec
    step, and directly answers part of the ongoing FPS complaint from 1.1.
  - `ScatterRules.ts`'s `isScatterAllowed()`/`isWaterDecorAllowed()`/
    `isNearWaterTile()` are the single source of truth for "can this prop
    kind go here" — any new categories (flower patch, shrub variants, etc.)
    should route through this, not duplicate placement logic.

**Conclusion: nothing needs to be built twice.** The DNA/archetype-selection
layer, the biome-gating table, the placement/scatter-rules layer, and the
canvas-texture factory are all solid, tested, and should be *extended*, not
replaced. What's missing is entirely inside the **builder** layer: today's
"one fixed shape recipe per archetype" needs to become genuine **kit-of-parts
composition** (a library of interchangeable trunk/branch/canopy/rock-chunk
parts combined by rules, not one hardcoded shape per archetype), plus wiring
`InstancedMesh` under that composition instead of per-object unique geometry.

---

## 2. Named external techniques (with citations) and how each maps here

### 2.1 Trees — already partially researched in this codebase for a different purpose

`TODO/organic_world_tiles_todo.md`'s elven-treehouse research (2026-09-03,
building architecture, not decorative trees) already investigated and named
the standard procedural-tree literature and **explicitly concluded**: *"L-
systems, space colonization, Weber-Penn/EZ-Tree all target decorative
background trees, none reason about floors/doors"* — i.e. that research
correctly ruled these out for *building* generation but, read the other way,
is direct confirmation from this project's own prior investigation that these
are the right named techniques for exactly 1.2's problem (decorative
background trees, not architecture):

- **L-systems (Lindenmayer systems)** — Prusinkiewicz & Lindenmayer, *The
  Algorithmic Beauty of Plants* (1990). A grammar of rewrite rules
  (`F → F[+F]F[-F]F`-style) expands a short axiom into a branching skeleton;
  each symbol maps to a turtle-graphics operation (move-forward, push/pop
  stack, rotate). Strength: a handful of grammar rules can produce large
  structural variety (different species-like silhouettes) from different
  rule sets/angles, and stochastic L-systems (randomized rule choice/angle
  jitter per production) give per-instance variety from ONE grammar. Fits
  this project's "DNA" naming convention well — a grammar *is* a compact,
  data-driven "species genome."
- **Space colonization algorithm** — Runions, Lane & Prusinkiewicz, *Modeling
  Trees with a Space Colonization Algorithm* (Eurographics Workshop on
  Natural Phenomena, 2007). Branches grow iteratively toward a cloud of
  randomly-scattered "attraction points" inside a target canopy volume,
  pruning points as branches reach them — produces organic, non-repetitive,
  volume-filling branch structures without hand-written grammar rules; the
  *shape of the attraction-point volume* (sphere, flattened ellipsoid, cone)
  directly controls canopy silhouette per archetype (round deciduous vs. flat
  acacia vs. narrow conifer) which maps cleanly onto this project's existing
  per-biome archetype concept.
- **Weber & Penn parametric tree model** — Weber & Penn, *Creation and
  Rendering of Realistic Trees* (SIGGRAPH 1995) — the basis of Blender's
  "Sapling"/many "proc-tree" implementations. A tree is described by a small
  set of named numeric parameters per recursive level (branch count, length,
  taper, curvature, split-angle) rather than a grammar string or attraction
  points — arguably the easiest of the three to expose as tunable "DNA"
  fields and the most similar in spirit to this project's existing
  `CreatureDNA`/`BuildingDNA` parametric-record convention (a plain data
  object, not a grammar or point cloud).

**Assessment for this project specifically:** given the codebase's established
preference for hand-rolled, dependency-light, "DNA as a plain typed data
record" code (matching `CreatureDNA`, `TileDNA`, the existing
`NatureAssetDNA.ts` naming), a **Weber-Penn-style parametric recursive branch
generator** (small numeric parameter set per branch level, expanded
recursively into instanced trunk/branch cylinder segments + instanced canopy
blobs at branch tips) is the best-fit starting point: it directly extends
today's "cone stack"/"blob cluster" primitive-combination style into genuine
branching structure, stays fully deterministic/seedable, needs no new
runtime dependency, and composes naturally with instancing (every trunk
segment across every tree of one archetype can share one `InstancedMesh`).
Space colonization is worth keeping in mind as a follow-up upgrade for
canopy-fill quality specifically (it's the more "organic-looking" of the two
for leaf-cluster placement) but is a bigger implementation lift (requires an
attraction-point/iterative-growth solver, not just recursive parameter
expansion) — a call worth surfacing explicitly at the spec stage rather than
deciding unilaterally now.

### 2.2 Rocks — kit-of-parts + procedural surface detail

- **Modular kitbashing** (a standard game-dev technique, not a single paper —
  see any GDC "environment art" talk on kit-of-parts rock/cliff assembly,
  e.g. the well-known Blizzard/Naughty Dog "rock kit" approach): author a
  small library of base rock-chunk shapes (a handful of low-poly
  displaced/faceted forms) and assemble scenes by combining, rotating,
  scaling, and overlapping instances of that small library — the exact
  "kit-of-parts" idea the user is asking for, just applied to rocks instead
  of trees. This project's `_makeRock`'s `cluster` archetype already does a
  primitive version of this (3 dodecahedra grouped) — the research finding
  here is that this same idea should become the *general* rock-building
  strategy (a small shared part library reused across ALL rock archetypes,
  not one bespoke shape recipe per archetype).
- **Displaced/faceted low-poly geometry** — perturbing a base
  icosphere/dodecahedron's vertices along their normals with value noise
  (`core/prng.ts`'s existing mulberry32, or a lightweight value-noise
  function) before flat-shading, a well-established "low-poly rock" technique
  (used broadly in stylized/low-poly game art, e.g. countless "low poly rock
  generator" Unity/Blender tutorials built on this exact idea) — gives each
  rock instance a genuinely unique silhouette from vertex displacement alone,
  not just uniform non-uniform scaling (which is all `_makeRock` does today).
  This is a small, cheap, dependency-free addition (mutate an existing
  `IcosahedronGeometry`/`DodecahedronGeometry`'s position attribute) that
  meaningfully increases per-rock uniqueness without a new part-authoring
  system.
- **Voronoi/fracture-based shatter** (e.g. Blender's Cell Fracture, or
  "Voronoi shattering" as used for boulder/debris variety in many procedural
  rock tools) — considered but likely **overkill** for this project's scope:
  it's the right technique for a *destructible* rock (shatter-into-pieces
  gameplay), not for static decorative boulders/slabs/clusters. Noted here so
  it isn't silently missed, but flagged as probably not worth the complexity
  unless a future gameplay feature (rock destruction) needs it.

### 2.3 Bushes/shrubs and the thin "other outdoor assets" inventory

No single famous named algorithm dominates "shrub" generation the way L-
systems/space-colonization do for trees — in practice, games treat shrubs as
either (a) a smaller-scale application of the same tree-branching technique
(fewer/shorter branches, no single dominant trunk), or (b) a pure
foliage-cluster technique with no branch skeleton at all (a cloud of small
leaf/blob instances directly around a root point). Given this project's
existing `_makeBush()` is already style (b) (a cluster of flattened
icosahedra, no trunk), extending it toward genuine variety means: (1) a small
part library of blob "shapes" (round mound, flattened mat, upright tuft) it
can compose from instead of one fixed shape, and (2) — directly addressed by
`game-inventory.md`'s explicit backlog — actually building the **already-
named-but-missing categories**: flower patch (small billboard/blob clusters
with bright accent color, grassland), twisted shrub (bog), sparse shrub
(highland/tundra), snow drift (tundra, likely a flattened white blob/mound
reusing the bush "mound" part shape with a snow material), driftwood/pier
decor (partially covered already by `_buildChunkBeachDecor`'s existing
driftwood — verify exact coverage at spec time), and mud pool (bog, likely a
flat dark decal/plane, not a 3D prop at all — closer to `GrassField`'s
ground-plane technique than to bush/rock geometry).

---

## 3. Open questions to carry into the design/spec step (brainstorming)

These are flagged, not answered, here — per the skill, art-direction/scope
choices go to the user via `brainstorming`, not decided silently in research:

1. **Scope of "genuine variety" for 1.2** — full Weber-Penn-style recursive
   branch generator (bigger lift, most genuine fix) vs. a smaller
   part-library extension of today's primitive-combination style (faster,
   less risk, still a real improvement)? Given 1.1's still-open FPS
   complaint on a middle-size world, this should be weighed against
   performance risk explicitly, not assumed.
2. **Instancing adoption** — should 1.2 also migrate tree/rock/bush rendering
   from today's "unique geometry per object + CPU merge-by-material" to
   `InstancedMesh` per shared part (the existing grass/slime/floor-tile
   pattern)? This is likely necessary if part complexity goes up at all, to
   avoid making the known FPS problem worse — but it's also a bigger,
   somewhat separate refactor from "add more part variety," worth scoping
   explicitly.
3. **Which new categories are actually in-scope for 1.2** vs. deferred again
   — the full `game-inventory.md` backlog (flower patch, twisted/sparse
   shrub, snow drift, mud pool, fairy-ring mushrooms, driftwood/pier) is
   larger than "trees and rocks got richer"; the user's brief says "expand
   the category/sub-category inventory... currently thin" but didn't
   enumerate an exact list.
4. **Texture-family variety** — should canopy/bark/rock-facet materials each
   get a distinct procedural-texture algorithm (not just re-seeded mottled
   blobs), per the user's "texture" ask? This has direct precedent already
   proven in 1.1 (the ramp micro-patch texture-variant mechanism).

---

## 4. Sources consulted

- This codebase: `NatureAssetDNA.ts`, `NatureAssetBuilder.ts`,
  `OverworldScene.ts` (tree/rock/bush builder methods,
  `mergeGroupMeshesByMaterial` usage), `ScatterRules.ts`,
  `MeshMergeUtils.ts`, `GrassField.ts`, `SlimeEnemy.ts`, `BlueprintLayer.ts`,
  `docs/superpowers/specs/2026-08-01-nature-asset-variety-design.md`,
  `docs/superpowers/specs/2026-08-30-nature-asset-biome-correctness-design.md`,
  `TODO/organic_world_tiles_todo.md` (§6.6 elven-treehouse research summary),
  `TODO/01-overworld-studio/game-inventory.md` §5a.
- Prusinkiewicz & Lindenmayer, *The Algorithmic Beauty of Plants* (1990) —
  L-systems.
- Runions, Lane & Prusinkiewicz, *Modeling Trees with a Space Colonization
  Algorithm*, Eurographics Workshop on Natural Phenomena (2007).
- Weber & Penn, *Creation and Rendering of Realistic Trees*, SIGGRAPH (1995).
- General game-dev "kitbashing"/modular environment-art practice and
  "low-poly rock generator" vertex-displacement technique (standard,
  widely-documented practice, no single canonical paper).
