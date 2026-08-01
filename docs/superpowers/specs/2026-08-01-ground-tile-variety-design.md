# Phase 1 — Ground Tile Texture & Mesh Variety

**Branch:** `cline_work-04_overworld_feel`
**Parent doc:** `2026-08-01-overworld-feel-decomposition.md`
**Status:** Approved autonomously (user unavailable, explicit "work autonomously" authorization
for this session) based on direct investigation of the current renderer. Flagged for user review
once they're back.

## Problem

The user's complaint: gameplay ground tiles look flat, textureless, and geometrically identical —
no grass/dirt/stone variety, no organic "Townscaper" mesh variation. Investigation confirms this
is real and has a specific root cause:

- The actual gameplay terrain is rendered by `TerrainGeometryBuilder.ts` — a single merged
  `BufferGeometry` (`buildTerrainGeometryData`) with **flat per-tile top faces**, vertex-colored
  from a fixed 5-entry `BIOME` palette array indexed only by *elevation level* (0–4), plus a tiny
  per-tile brightness jitter (`0.92 + (col*29+row*19)%18/200`). There is no dirt/stone/grass
  *category* distinction at all — elevation level is the only signal, and geometry is always a
  perfectly flat quad.
- The separate `TileDNA`/`TileBuilder`/`TileRegistry` system (`src/procedural/`) is a genuinely
  richer DNA-driven variant system (8 biomes × 2-4 variants each, deterministic seeding) but it
  only powers the standalone Overworld Studio **Tile Designer preview tool**
  (`tile-creator.html`) — it was never wired into the actual world-generation terrain renderer.
  This gap is explicitly called out as still-open in `TODO/01-overworld-studio/procedural-designer/tile-designer.md`
  ("TV-4 registry... blocked on 02-game-world-integration's terrain renderer existing").

So the fix is squarely in `TerrainGeometryBuilder.ts`: add real per-tile variant selection (grass /
dirt / stone-ish sub-variants within each elevation band) and organic mesh variety (soft vertex
displacement so tiles aren't perfectly flat/identical), while reusing `TileDNA`'s naming/seeding
conventions so the two systems share a vocabulary (paving the way for the Studio tool to eventually
preview real gameplay tiles, and for future biome types to plug in cleanly) — without a large
architectural rewrite.

## Approach

**Chosen: extend `TerrainGeometryBuilder.ts` in place, deterministic per-cell variant + jitter,
zero new draw calls.**

1. **Variant selection per cell** — derive a deterministic per-tile variant index from
   `(col, row, elevation, biome/feature)` via a cheap hash (reusing the existing
   `mulberry32`-style approach already used elsewhere in the codebase, e.g. `ResourceNodePlacer.ts`
   / `TileDNA.ts` seeding pattern) instead of the current `(col*29+row*19)%18` ad hoc jitter. This
   picks one of 3 "ground look" sub-variants per elevation band (e.g. grass band → short/lush/patchy;
   highland/rocky band → dry/mossy/pebbly), each with its own small color range and roughness-like
   brightness curve — giving visually distinct patches without needing textures or new geometry
   categories. This directly extends `TILE_VARIANTS` naming from `TileDNA.ts` (reusing
   `grassland: ['short','lush','patchy']` etc.) so the vocabulary matches the Studio tool.
2. **Organic mesh variety ("Townscaper" feel)** — apply small, deterministic per-vertex Y jitter to
   the four corners of each tile's top face (not the whole tile height — just a few centimeters of
   organic waviness on top of the existing stepped elevation), using the same per-cell hash so
   neighbouring tiles' shared corners jitter consistently (no seams/gaps — corner jitter must be
   computed from *corner* coordinates, not per-tile, so adjacent tiles agree on their shared edge
   vertices). This gives the ground a soft, hand-crafted, non-uniform look instead of perfectly flat
   quads, without touching wall faces (which must stay flat for collision correctness — physics
   collider geometry is intentionally still driven by the exact same `buildTerrainGeometryData`
   function per the file's own header comment, so jitter must be tiny enough not to meaningfully
   affect traversal, and applied identically to both the visual and physics-collider call sites since
   they share this one function).
3. **Texture-like richness without files** — increase the per-tile brightness/color noise
   octaves (cheap fbm-style layering: coarse patch-level color variation + fine per-tile grain)
   instead of the current single-frequency modulo jitter, to break up the flat single-color look
   perceptually, consistent with the project's zero-external-asset Code-First policy.

**Rejected alternatives:**
- *Wire the full `TileDNA`/`TileBuilder` system into the terrain renderer* — would require
  per-tile individual meshes or per-tile UV atlasing to keep one draw call, a much larger and
  riskier change than the scope of "fix flat/textureless ground," and the existing merged-geometry
  approach already solves the real perf-sensitive constraint (one draw call for the whole terrain).
  Revisit only if a future phase needs the Studio tool to preview live gameplay tiles pixel-for-pixel.
- *Add actual texture/normal maps* — contradicts the documented zero-external-file Code-First
  policy (`environment-art-system.md`); canvas-procedural noise achieves a similar perceptual
  richness without introducing asset files or loader dependencies.

## Data flow / component changes

- `src/world/TerrainGeometryBuilder.ts`:
  - New internal helper `cellVariantHash(col, row): number` (deterministic 0..1 per cell, mulberry32-style).
  - New internal helper `cornerJitter(cornerCol, cornerRow): number` — small Y offset (±0.03 WU)
    computed from *corner grid coordinates* (not cell) so shared corners between adjacent tiles agree.
  - `BIOME` palette entries become `BIOME_VARIANTS: [level][variantIndex] → [r,g,b]`, 3 variants
    per elevation level (extends, doesn't replace, the existing 5-level structure).
  - `addFace` top-face call sites get corner jitter applied to the 4 Y coordinates.
  - Wall faces are unaffected (flat, as today) — collision-critical.
- No changes to `OverworldScene.ts` call sites — `buildTerrainGeometryData`'s signature and return
  shape are unchanged, so both the visual mesh and physics collider pick up the improvement for free.
- No changes to `TileDNA.ts`/`TileBuilder.ts`/`TileRegistry.ts` — Studio tool untouched, its naming
  vocabulary (`TILE_VARIANTS['grassland']` etc.) is *referenced* for naming consistency only.

## Testing

- Existing terrain/physics collider tests (`tests/**/*Terrain*`, `tests/e2e/exterior.test.ts`
  collision tests) must continue to pass unchanged — corner jitter is small enough that player
  collision math (which uses the same geometry) shouldn't need updated expectations, but this will
  be verified empirically, not assumed; if jitter breaks any exact-position assertion, jitter
  magnitude will be reduced rather than updating test expectations, since exact flatness is not the
  jitter's purpose and shouldn't leak into gameplay-affecting collision precision.
- New unit test: `buildTerrainGeometryData` called twice with the same `WorldGrid`/seed produces
  identical output (determinism regression guard).
- New unit test: shared corner vertices between two adjacent cells have identical jittered Y values
  (no-seam regression guard) — sample a few (col,row) pairs and assert equality directly from the
  returned position buffer.
- Visual verification via Playwright screenshot comparison (elevated top-down view of a grass patch)
  showing visible color patchiness and non-uniform ground silhouette, consistent with prior
  sessions' verification pattern for this branch.

## Scope boundaries

- This phase does **not** add new biome types (desert/tundra/etc. groundwork) — only enriches the
  variety *within* the existing biome/elevation bands already rendered in gameplay. Full biome
  variety (desert, tundra, etc. actually appearing in the overworld) is a `WorldGenerator`/
  `RealmGenerator` content question, out of scope here; this phase only ensures the *tile rendering
  layer* is ready to support more variants when that content work happens later (extensible
  `BIOME_VARIANTS` table).
- This phase does **not** touch settlement cobble tiles or dungeon/cave tile rendering — scoped
  strictly to the open-overworld terrain top faces described in the user's complaint.
