# Phase 2 — Nature Asset Variety (Trees / Bushes / Rocks)

**Branch:** `cline_work-04_overworld_feel`
**Parent doc:** `2026-08-01-overworld-feel-decomposition.md`
**Status:** Approved autonomously (user unavailable this session, explicit "work autonomously"
authorization). Investigated current renderer directly before designing.

## Problem

Current overworld nature assets (`OverworldScene.ts`):
- `_makeTree()` — exactly ONE tree archetype: cylinder trunk + two stacked cones, only randomized
  by scalar size and a narrow green-hue offset. Every tree in the game looks like the same pine.
- `_placeRocks()` — exactly ONE rock archetype: `DodecahedronGeometry` with random scale/rotation/
  grey tint. No boulder/angular/flat-slab variety.
- No bush/shrub asset at all — `game-inventory.md`'s "Overworld Terrain" section (5a) lists
  `flower patch 🔲`, `sparse shrub 🔲`, `twisted shrub 🔲` as not-yet-built feature props for
  several biomes.
- All materials are flat `MeshLambertMaterial` single colors — no procedural surface texture at
  all (not even the canvas-texture approach already used elsewhere in the project, e.g.
  `src/showroom.ts`'s checkerboard floor, `FloatingDialogue3D.ts`'s text canvases).

User's ask: "more variety of various types of grass and ground and dirt and stone tiles... We have
some more trees and pushes and nature assets now but we want more there also and better texture
too to make it come alive."

## Approach

**Chosen: extract deterministic archetype-selection + geometry-shape logic into a new pure,
testable module (`NatureAssetDNA.ts` for archetype selection + `NatureAssetBuilder.ts` for
THREE.js mesh construction), mirroring the `TerrainGeometryBuilder.ts` extraction pattern from
Phase 1 and the project's existing `TileDNA`/`BuildingDNA` "DNA" naming convention the user
explicitly asked to follow ("think like DNA modular style").**

1. **Tree archetypes (3 types)** — `conifer` (today's cone-stack, kept as-is for compatibility),
   `deciduous` (rounded/lumpy canopy built from 3 overlapping `IcosahedronGeometry` blobs instead
   of cones, broader trunk), `sparse`/`dead` (thin trunk, few small angular canopy fragments or
   bare branches — matches the `game-inventory.md` "Dead tree" bog-biome entry). Archetype chosen
   deterministically per-tree from a hash of its world position (reusing the same integer-hash
   technique as Phase 1's `cellVariantIndex`, extracted to a small shared home since both this file
   and `TerrainGeometryBuilder.ts` need "deterministic index from 2 coordinates" — see File
   Structure below) so archetype choice is stable across sessions for a given seed.
2. **Bush/shrub prop** — new `_makeBush()` builder: a cluster of 2-4 small flattened
   `IcosahedronGeometry` blobs in a low mound, using the same canopy-color-variation approach as
   trees. Placed via a new lightweight Poisson-disk pass at a tighter spacing than trees (bushes
   are meant to be denser undergrowth), same biome/road/settlement exclusion rules as
   `_plantTrees`/`_placeRocks`.
3. **Rock shape variety (2 additional archetypes)** — alongside the existing dodecahedron
   "boulder," add a `slab` archetype (flattened `BoxGeometry` with random per-vertex-free bevel via
   non-uniform scale, mimicking a flat outcrop) and a `cluster` archetype (2-3 small dodecahedra
   grouped together, like a scattered rock pile) — selected via the same deterministic hash.
4. **Procedural canopy/foliage texture** — a small shared canvas-texture generator (mottled
   green/brown noise blobs, following the exact pattern already used in `src/showroom.ts`'s
   `makeCheckerFloor`) applied to tree canopy and bush materials as a subtle
   normal-map-free "roughness/color variation" `CanvasTexture`, giving foliage a less flat-shaded
   look without introducing any external asset files (consistent with the zero-external-asset
   Code-First policy). Rocks get a lighter version of the same treatment (speckled grey noise) for
   a less flat-shaded stone look.

**Rejected alternatives:**
- *Wire nature assets through the `TileDNA`/`ProceduralProps` prop-creator pipeline* — that system
  targets Studio-authored "designed" props (buildings, dungeon furniture) with a save/library
  workflow; trees/rocks/bushes are placed procedurally at world-generation time in bulk (hundreds
  per world) and don't need individual designer authoring — extending the lighter existing
  `_makeTree`/`_placeRocks` pattern in `OverworldScene.ts` is proportionate and consistent with how
  the codebase already treats these two different asset classes.
- *Load external tree/rock textures (Kenney packs)* — explicitly deferred to "Track B" in
  `environment-art-system.md` and out of scope; the Code-First procedural approach is the project's
  current default.

## Data flow / component changes

- New file `src/world/NatureAssetDNA.ts`: exports `hashIndex(a: number, b: number, count: number): number`
  (generalizes Phase 1's `cellVariantIndex` for reuse — a pure, tested, deterministic 2-coordinate
  hash-to-bucket function) plus `TreeArchetype = 'conifer' | 'deciduous' | 'sparse'`,
  `RockArchetype = 'boulder' | 'slab' | 'cluster'`, and `pickTreeArchetype(wx, wz): TreeArchetype`
  / `pickRockArchetype(wx, wz): RockArchetype` (deterministic selection from world position).
- New file `src/world/NatureAssetBuilder.ts`: exports `makeMottledCanvasTexture(baseColorHex, variance, seed): THREE.CanvasTexture`
  (shared foliage/stone noise texture factory, following `showroom.ts`'s canvas pattern) — pure
  function taking a numeric seed so results are deterministic and testable (texture pixel content
  is inspectable via the canvas 2D context in a jsdom/happy-dom test environment, or the function
  can be tested for not-throwing + correct canvas dimensions if full pixel inspection isn't
  practical in the test environment — verified during implementation).
- Modify `src/scene/OverworldScene.ts`:
  - `_makeTree(rand, wx, wz)` gains an `archetype` selection step via `pickTreeArchetype`, branches
    into 3 private helper builders (`_buildConiferTree`, `_buildDeciduousTree`, `_buildSparseTree`),
    each applying `makeMottledCanvasTexture` to canopy materials.
  - `_placeRocks` gains archetype branching similarly (`_buildBoulderRock`, `_buildSlabRock`,
    `_buildClusterRock`), texture applied via `makeMottledCanvasTexture`.
  - New `_plantBushes(rand)` method + `_makeBush(rand)` builder, called from the same place in the
    constructor as `_plantTrees`/`_placeRocks`. Bushes are pushed into the EXISTING
    `_clutter: THREE.Group[]` field (already declared, already fully wired into `enter()`/`exit()`/
    `dispose()` via `this._freeGroup(cl)`, but currently never populated by anything) rather than a
    new array — this reuses working lifecycle code instead of duplicating it. Bushes are purely
    decorative with no physics collider, consistent with `_clutter`'s existing "ground-clutter
    props" doc-comment intent, so no new collider code path is introduced.

## Testing

- `NatureAssetDNA.ts` — determinism, bounded-range, and multi-value unit tests (same pattern as
  Phase 1's `cellVariantIndex`/`cornerHeightJitter` tests).
- `NatureAssetBuilder.ts` — `makeMottledCanvasTexture` returns a `THREE.CanvasTexture` with the
  expected canvas dimensions and doesn't throw for a range of seeds/colors; determinism verified by
  comparing two textures built with the same seed produce byte-identical canvas pixel data (via
  `getImageData` on the underlying canvas, available in the project's jsdom-based Vitest
  environment — confirmed available since `showroom.ts`'s canvas usage already implies canvas
  support in this codebase's tooling; if `getImageData` isn't available in the test environment,
  fall back to asserting canvas width/height/existence only, documented inline in the test).
- Live Playwright visual verification (same proven pattern as Phase 1: `startGame` →
  `switchToExterior` → screenshot of an open natural area) confirming visibly varied tree/rock
  silhouettes and the presence of bushes, before/after comparison optional given no exact "before"
  reference exists for this specific framing.
- Existing e2e suite (`exterior.test.ts`) re-run in full to catch any collider regressions, since
  tree-trunk and rock colliders are created from the same `_trees`/`_rocks` arrays this phase
  modifies (bush entries deliberately have NO physics collider, so no new collider code path is
  introduced — verified against the design's scope).

## Scope boundaries

- This phase does **not** add gatherable-resource visuals (that's Phase 3, which will likely reuse
  this phase's bush/rock archetype infrastructure for ore-vein/timber-log dressing).
- This phase does **not** add new biome types to the world generator — archetype variety applies
  within the existing biome/elevation system, consistent with Phase 1's scope boundary.
- Flower patches / cactus / snow drift (biome-specific props from `game-inventory.md` section 5a)
  are explicitly deferred — those are biome-specific props for biomes (desert, tundra, grassland)
  that aren't yet generated in the actual overworld content pipeline (a `WorldGenerator`/
  `RealmGenerator` content question, same boundary noted in Phase 1's doc); this phase focuses on
  the tree/bush/rock variety that's usable across the biomes that already appear in gameplay today.
