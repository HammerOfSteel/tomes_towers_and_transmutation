# Design: Land-Biome Dual-Grid Borders & Texture Richness

**Date:** 2026-09-20
**Initiative:** Overworld/Outdoor Polish, Phase 1, Sub-task 1.1 (tile/subtile/sub-subtile
variety and organic texture richness)
**Process:** written per the `research-driven-world-polish` skill; research doc for this
sub-task lives in this session's workspace as `research-1.1-tile-subtile-variety.md` (not
committed to the repo — a scratch artifact per that skill's own guidance to leave the
research trail somewhere durable before the spec step).

## 1. Problem statement

This project already has real dual-grid corner-typed geometry for water/land shorelines
(`ShorelineCornerField.ts`) and a shipped sub-tile height-bump + micro-patch texture system
for uniform-biome ground tiles (`TerrainGeometryBuilder.ts`'s 4×4 sub-tile grid). Both are
already the right family of technique per this project's Townscaper-derived research
(`TODO/organic_world_tiles_todo.md`). The concrete remaining gap: **land-biome-to-land-biome
borders** (e.g. grassland↔desert, forest↔tundra) only get texture-level border dithering —
a discrete, stippled variant swap along the original straight tile-edge line — never a real
curved geometric boundary the way shorelines have. There is also no large-scale
within-biome texture variation technique yet, so a big single-biome region can read as a
visibly repeating texture at a distance.

## 2. Scope

**In scope:**
- A geometric dual-grid corner-pull for land-biome borders, generalizing
  `ShorelineCornerField.ts`'s existing water/land technique to any two-group
  classification.
- Height-based texture blending at biome borders, replacing today's hard micro-patch swap
  for bordering sub-tiles.
- Region-scale (multi-tile) texture variant selection per biome, plus a lightweight
  per-tile UV jitter/rotation ("hex-bombing-lite") to hide periodic texture tiling at
  distance.

**Explicitly out of scope (deferred):**
- Moving the underlying logic grid to an irregular relaxed mesh (`RelaxedMeshGrid.ts`
  stays unwired) — confirmed with the user: keep the square logic grid so sub-task 1.3's
  elevation work has one settled grid convention to build on.
- Multi-tile elevation/slope continuity — sub-task 1.3's problem.
- Ramp-shaped tiles and water tiles — untouched, exactly as today's sub-tile system
  already restricts itself to flat/edge land tiles with a real texture variant.
- Settlement/building architecture — untouched.

## 3. Architecture

Three additive pieces, all operating on today's square logic grid:

1. **Generalized corner-pull.** Extract `ShorelineCornerField.ts`'s "pull the shared
   vertex toward the odd-one-out tile" logic into a reusable helper parameterized by an
   equality predicate, instead of the current hardcoded water-vs-land check. Shape only
   ever depends on the corners' *equality pattern* (which of the 4 touching tiles agree vs.
   differ), never on which specific biomes are involved — so this reuses Phase 0's existing
   binary `DualGridCaseTable` case table unchanged; no N-biome case table is built (that
   would combinatorially explode: 13 biomes⁴ raw configs vs. 6 canonical shapes for the
   binary case). Land-biome borders reuse the same helper with
   `isSameGroup = (a, b) => a.biome === b.biome`.
2. **Height-based texture blend at borders.** The sub-tile system's existing
   border-proximity calculation (used today to decide micro-patch swap probability) instead
   drives a blend weight between the two bordering tiles' textures, combined with a
   per-texel height compare, so the transition reads as organic mixing rather than a
   stippled hard cut.
3. **Region-scale texture variation.** Each biome gets 2-3 large-source texture variants.
   A tile's variant is chosen by a low-frequency spatial noise field (region scale, ~8-16
   tiles), not per-tile — giving patchier/lusher sub-regions within one biome — paired with
   a deterministic per-tile UV jitter/rotation to hide periodic tiling of the underlying
   256×256 canvas texture at a distance.

## 4. Integration into `TerrainGeometryBuilder.ts`

Order of operations per tile, top to bottom:

1. **Corner-pull runs first** (coarse shape) — displaces shared `WorldGrid` tile-corner
   vertices for both water/land (existing) and land-biome (new) borders, through the same
   unified function used at every geometry call site (top-surface, walls, collider), so
   visual and physics geometry can never disagree — matching the existing "one function,
   three call sites" convention.
2. **Sub-tile grid builds on the pulled corners**, not the original square ones — the
   existing 4×4 bilinear interpolation applies across the now-organic quad unchanged.
3. **Border-dithering's existing distance calculation** keeps deciding which sub-tiles
   count as "near the border", but drives a blend weight (height-based, per §3.2) instead
   of a hard variant swap.
4. **Region-scale variant selection and hex-bombing-lite UV jitter** run upstream, when
   first resolving which texture(s) a tile blends between — this is the same mechanism for
   both biome-border blending and within-biome variant blending (a tile bordering another
   biome, and a tile whose own region-noise variant differs from its neighbour's, both flow
   through the same blend-weight step; no special-casing needed).

**Scope guard:** corner-pull and blending apply only to flat/edge land tiles with a real
`_groundTextureVariant()` — ramp shapes, water tiles, and uncovered biomes are untouched.

## 5. Edge cases

**N-biome ambiguity at a single vertex.** The existing case table assumes exactly 2 states
per corner. A vertex touching 3+ distinct biomes has no natural binary split. Resolution:
classify each of the vertex's 4 touching tiles as `matches-plurality` vs. `not`, where
"plurality" is whichever biome appears most often among the 4 (ties broken by a fixed
biome-id order, deterministic). This always reduces to a well-defined pattern (3-vs-1,
2-vs-2 adjacent, 2-vs-2 diagonal) that feeds the existing case table unchanged — a
many-to-2 reduction step ahead of it, not a new table.

**Determinism.** Region-scale variant noise and hex-bombing UV jitter both key off absolute
world position, using the same bit-mixing hash convention already established by
`subTileBumpJitter()`/`cornerHeightJitter()` — same seed always produces the same world.

## 6. Testing strategy

- Unit tests for the generalized corner-pull helper, reusing `ShorelineCornerField.test.ts`'s
  existing pattern, plus new cases for the plurality-reduction rule: 3-vs-1, 2-vs-2 adjacent,
  2-vs-2 diagonal, and 4-distinct-biomes-at-one-vertex.
- Unit tests for the height-blend weight function and the region-noise variant selector
  (determinism; no seams at region-noise transition boundaries).
- A `TerrainGeometryBuilder.test.ts` case confirming adjacent tiles share identical pulled
  corner positions (no geometric cracks introduced).
- A Playwright pass belongs in the implementation plan (not this spec) — this codebase has
  repeatedly caught real regressions (seams, wrong blending, dropped geometry) only via live
  screenshots, never from unit tests alone.

## 7. Performance

Corner-pull is O(vertices), matching the existing shoreline pass's cost. Region-noise
variant selection is O(tiles) — one extra deterministic hash per tile, negligible next to
the existing sub-tile system's O(16 × tiles) work.

## 8. Open questions resolved during brainstorming

- Geometric shape vs. texture-only for land-biome borders → **both, layered** (user
  decision).
- Square grid vs. irregular relaxed mesh → **keep the square grid** (user decision, so 1.3
  inherits one settled convention).
- Large-scale within-biome texture variation → **included in this sub-task's scope** (user
  decision).
- Integration order (corner-pull before or independent of the sub-tile grid) → **corner-pull
  first, sub-tile grid builds on the pulled corners** (user-confirmed in review).

No open questions remain blocking the implementation plan.
