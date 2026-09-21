# Design: Procedural Nature-Asset Kit-of-Parts (Overworld/Outdoor Polish Phase 1, Sub-task 1.2)

**Status:** Approved for planning
**Initiative:** Overworld/Outdoor Polish, Phase 1, sub-task 1.2 (per the
`research-driven-world-polish` skill)
**Research:** `docs/superpowers/specs/2026-09-21-procedural-nature-asset-kit-research.md`
**Depends on:** Sub-task 1.1 (land-biome dual-grid borders + texture richness),
already implemented and playtest-approved.

## 1. Problem statement

Trees, rocks, and bushes in the live overworld (`OverworldScene.ts`) are each
built by one hardcoded THREE.js primitive-shape recipe per archetype (6 tree
archetypes, 3 rock archetypes, 1 bush style — ~10 recipes total), randomized
only in *scalar* dimensions (height, radius, blob count) via `rand()`. At
scale (a mid/large generated world with hundreds-to-thousands of scattered
props), this reads as repetitive — the user's exact complaint. Separately,
1.1's playtest surfaced an open FPS problem on a middle-size world; any
richer nature-asset geometry must not make that worse, and ideally helps fix
it, since today's tree/rock/bush rendering (unique geometry per object +
CPU static-merge-by-material) is not the performance-optimal approach this
codebase already uses elsewhere (grass, enemies, floor tiles all use
`THREE.InstancedMesh`).

## 2. Scope

**In scope:** make the existing 3 categories (trees, rocks, bushes)
genuinely richer in geometry *and* texture via a shared kit-of-parts system,
and migrate their visual rendering to `InstancedMesh` (mirroring
`GrassField.ts`'s proven radius-rebuild pattern) to keep/improve FPS as part
composition gets richer.

**Explicitly out of scope for 1.2** (deferred, not silently dropped — matches
this project's established practice of naming deferrals):
- New nature-asset **categories** not already live today (flower patch,
  twisted/sparse shrub, snow drift, mud pool, driftwood/fairy-ring mushroom,
  etc. — the `game-inventory.md` §5a backlog). A future sub-task/phase can
  reuse this design's part-pool/texture-family infrastructure for those.
- A full recursive branching tree generator (L-system / space-colonization /
  Weber-Penn-style). Considered in research and explicitly rejected for 1.2
  in favor of the lower-risk part-library extension, given 1.1's open FPS
  concern. Worth revisiting as a follow-up if the part-library approach
  turns out insufficient after playtest.
- Rock-destruction/fracture gameplay (Voronoi shatter etc.) — not a current
  gameplay feature; noted in research, not pursued.
- Any changes to `NatureAssetDNA.ts`'s biome→archetype selection tables or
  `ScatterRules.ts`'s placement-legality rules — both stay exactly as they
  are; this design only changes *how* an archetype is built and *how* it's
  rendered, never *which* archetype a biome/position picks or *where*
  scatter is allowed.
- Tree/rock physics colliders — unchanged; they stay on today's chunk-scoped
  `_loadTerrainChunk()` path (ball colliders from `scatterRadius`), which
  already works and isn't part of the reported problem.

## 3. Architecture

### 3.1 Part pools (new, shared across categories)

A **part** is one named shape-role (`trunk`, `branch-arm`, `canopy-blob`,
`rock-chunk`) with a small, fixed library of **geometry variants** — several
genuinely different `BufferGeometry` shapes per part-type, not just one
shape scaled differently. This is the core "kit-of-parts" fix: today's
richness comes only from continuous scalar jitter on ONE fixed shape per
archetype; going forward, richness comes from *discrete shape choice* (which
variant) **combined with** the existing scalar jitter (kept, unchanged).

- `canopy-blob`: 4-6 variants (round `IcosahedronGeometry`, lopsided/skewed
  variant, elongated/stretched variant, flattened/mat variant) — shared by
  trees (deciduous/sparse/acacia canopies) AND bushes (bushes already build
  from the same "cluster of blobs" idea at smaller scale — this is a direct,
  intentional DRY reuse, not a new bush-specific system).
- `trunk`: 3-4 variants (straight taper — today's default, gnarled/bent,
  thick/short, thin/tall) shared by every tree archetype.
- `branch-arm`: 3-4 variants (straight, curved, forked) — used by
  saguaro/joshuatree/acacia's arm-like structures.
- `rock-chunk`: 5-6 variants, each a base `IcosahedronGeometry`/
  `DodecahedronGeometry`/`BoxGeometry` with **one-time vertex-displacement
  noise baked in at pool-build time** (perturbing each vertex along its
  normal using a small deterministic value-noise function, seeded so pool
  construction itself is deterministic) — this is what makes rocks look
  like real faceted rock instead of a perfect dodecahedron, per the
  research's "low-poly rock" technique. Baked once per variant (not
  per-instance), consistent with instancing's "one shared geometry per
  variant" requirement.

Each part-type's variant pool is built once (lazily, on first use) and
cached for the `OverworldScene`'s lifetime — the same lifecycle
`_pooledMaterial()` already uses for materials, now extended to geometry.

### 3.2 Archetype recipes (replaces today's ~10 bespoke builder methods)

Each of today's archetypes (`conifer`, `deciduous`, `sparse`, `cactus`
[saguaro/barrel/pricklypear], `acacia`, `joshuatree`, `boulder`, `slab`,
`cluster`, `bush`) becomes a small **declarative recipe**: a list of
`{ partType, count, arrangement }` entries, where `arrangement` is one of a
few named layout rules (`stacked` — vertically along the trunk axis, like
conifer's 2 cones; `radial-ring` — N parts arranged in a ring at a given
radius/height, like acacia's canopy blobs or a rock cluster's pieces;
`side-arms` — offset left/right along a lean axis, like saguaro's arms).

A single generic `assembleFromRecipe(recipe, rand, geometryVariantPools,
materialPools)` function replaces the ~10 bespoke `_build*()` methods —
given a recipe, it picks a geometry variant per part slot (via `rand()`,
same determinism convention as today), picks a material variant (existing
`_pooledMaterial`, unchanged), and computes each part's local transform from
the arrangement rule + the existing scalar-jitter ranges (kept from today's
code, just parameterized per recipe instead of hardcoded per method). This
is a genuine reduction in code duplication (~10 near-identical builder
methods → 1 assembler + ~10 small data recipes), consistent with the
existing "DNA as data" convention.

**Combinatorial effect:** e.g. a deciduous tree recipe (1 trunk + 3 canopy
blobs) with 4 trunk variants × 6 canopy variants × today's existing scalar
jitter now has ~24 discrete shape combinations before jitter is even
applied, vs. 1 today — this is the actual fix for "looks basic and repeats
too much."

### 3.3 Texture families (extends `NatureAssetBuilder.ts`)

Three named procedural-texture generators, assigned by part-type (not by
archetype, so e.g. every trunk across every tree archetype shares one bark
algorithm):

- `makeBarkCanvasTexture(baseColorHex, variance, seed)` — vertical streaky
  noise (thin, mostly-vertical randomized-width bands of light/dark
  variation) instead of round blobs, reading as fibrous bark grain.
- `makeMottledCanvasTexture(...)` — **kept as-is**, reassigned conceptually
  as "the foliage/canopy texture family" (round mottled blobs already read
  correctly as leaf clusters — no change needed here, per research).
- `makeRockFacetCanvasTexture(baseColorHex, variance, seed)` — angular
  speckled noise (small randomly-oriented polygon-edge speckles rather than
  soft round blobs), reading as a harder, faceted stone surface.

### 3.4 Instanced rendering (new, mirrors `GrassField.ts`)

- **`NaturePropField`** (new class, one instance per unique `(partType,
  geometryVariantIndex, materialVariantIndex)` combination): owns one
  `THREE.InstancedMesh`, sized to a fixed `maxInstances` ceiling (mirrors
  `GrassPreset.maxBlades`). `.update(playerX, playerZ)` is hysteresis-gated
  exactly like `GrassField.update()` — only rebuilds the instance buffer
  once the player has moved past a threshold, otherwise a no-op.
- **`selectNaturePropPlacements(wg, playerX, playerZ, radius, seed,
  category)`** (new pure function per category — tree/rock/bush): mirrors
  `selectGrassPlacements()`'s existing poisson-disk + `ScatterRules` +
  biome/archetype-pick logic, but scans a player-centered radius directly
  from `WorldGrid` rather than being tied to loaded chunks. Fully
  unit-testable without WebGL, same as `selectGrassPlacements` today.
- **Recipe expansion:** for each placement (position, archetype, seed), the
  archetype's recipe (§3.2) expands deterministically into a list of
  `(partType, geometryVariantIndex, materialVariantIndex, localTransform)`
  entries. `NaturePropField.update()` collects all entries matching its own
  `(partType, geometryVariantIndex, materialVariantIndex)` across every
  current placement and writes them into its instance transform/color
  buffers.
- **`NaturePropManager`** (new, owned by `OverworldScene` exactly like
  today's `_grassFields: GrassField[]` array): constructs one
  `NaturePropField` per part-type×variant combination up front, adds every
  `.mesh` to the scene once, and calls `.update(playerX, playerZ)` each
  frame alongside the existing grass-field update loop.
- **Physics colliders are unaffected** — `_loadTerrainChunk()` keeps using
  the existing chunk-scoped tree/rock placement (unchanged `_trees`/`_rocks`
  arrays, `scatterRadius` ball colliders); this design only replaces how the
  *visual* mesh is produced.

## 4. Data flow summary

```
WorldGrid + playerX/Z + radius
        │  (selectNaturePropPlacements — per category, mirrors selectGrassPlacements)
        ▼
[ (position, archetype, seed) placements ]
        │  (recipe expansion — pure, per archetype)
        ▼
[ (partType, geometryVariant, materialVariant, localTransform) entries ]
        │  (NaturePropField.update() — groups by its own (partType, geoVariant, matVariant))
        ▼
InstancedMesh.setMatrixAt() / instance color buffer   →  scene (added once, never re-parented)
```

Chunk-scoped path (unchanged, physics only):
```
ChunkManager load/unload → _loadTerrainChunk() → existing _trees/_rocks arrays → Rapier ball colliders
```

## 5. Testing strategy

- **Part pools:** geometry-variant factories return the expected vertex
  count / are non-degenerate (no NaN positions) / are deterministic per
  seed (rock-chunk displacement).
- **Recipes:** `assembleFromRecipe()` unit-tested per archetype — given a
  fixed `rand()` sequence, asserts the exact expected list of part entries
  (type, count, arrangement-derived local transform), mirroring how
  `tickAmbientBehavior` and `_rampGroundVariant` are tested today (pure
  function, exact expected output, no rendering).
- **Placement:** `selectNaturePropPlacements()` tested exactly like
  `selectGrassPlacements()` today (determinism, radius bounds,
  `ScatterRules` exclusions honored, biome-gated archetype selection
  unchanged from `NatureAssetDNA.ts`'s existing tested behavior).
- **`NaturePropField`/`NaturePropManager`:** tested like `GrassField.test.ts`
  today — construct with a small `WorldGrid`, call `.update()`, assert
  `mesh.count` and instance-buffer contents; no live-rendering assertions.
- **Texture factories:** same pattern as existing `makeMottledCanvasTexture`
  tests (canvas dimensions, doesn't throw, determinism per seed).
- **Regression:** `NatureAssetDNA.test.ts` / `ScatterRules.test.ts` stay
  green unchanged (their contracts don't change under this design).
- **Live playtest gate (required, per the skill):** visual variety walk
  across forest/desert/grassland/savanna, plus an FPS spot-check on the same
  middle-size world 1.1 flagged as slow, to confirm the `InstancedMesh`
  migration helps rather than regresses. This is the sub-task's mandatory
  human checkpoint before 1.3 can start.

## 6. Risks / open implementation notes for the plan

- Recipe expansion + `NaturePropField` grouping must stay allocation-light
  per `update()` call (no per-frame array churn beyond what grass already
  accepts) — the plan should reuse grass's existing typed-array +
  `DynamicDrawUsage` conventions rather than inventing new ones.
- `maxInstances` per field needs a sane default (derived from expected
  density × radius², mirroring `GrassPreset.maxBlades`'s existing sizing
  logic) — the plan should size this from today's actual scatter density
  rather than guessing.
- This is a sizeable single sub-task (new part-pool module, recipe data,
  one assembler, 3 new texture generators, `NaturePropField`/
  `NaturePropManager`, migration of `_buildChunkScatter()`'s call sites) —
  the implementation plan should still land as incremental, independently
  testable tasks (e.g. part pools + recipes first, texture families second,
  instancing/`NaturePropField` third, `OverworldScene` wiring last) even
  though it's all one sub-task per the skill's "one plan per sub-task" rule.
