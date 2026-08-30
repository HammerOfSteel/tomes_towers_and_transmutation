# Design: Ground-Tile Sub-Tile Texture Variety (Biome/Terrain Overhaul Phase 4a)

Status: approved for implementation
Roadmap: `docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md` (folds in Phase 8's
"Ground texture wiring" item, pulled forward per user request; supersedes the road-only scope
of Phase 2's sub-tile system where it applies to plain ground)

## 1. Problem statement

Every ground (non-road) top face renders as a single flat-colored quad — one vertex color per
tile, no surface texture at all. `TerrainGeometryBuilder.ts`'s `addFace()` (the ground buffer)
carries `positions/normals/colors` only, no `uv`. This is what reads as "blocky patchwork": at
typical camera distance, a whole biome region is visibly a grid of uniformly-colored 2×2 WU
squares with only a subtle per-cell hue jitter (`cellVariantIndex`) breaking up the monotony —
there is no actual surface detail (grass blade texture, sand grain, bark/leaf litter, rock
texture) the way buildings already have via `BlockKit.ts`/`FactionBlockTextures.ts`, and the way
roads already have via `RoadPathSampler.ts`/`RoadTextures.ts`.

Separately (tracked as the second half of this "phase 4" push, its own follow-on design):
`NatureAssetDNA.ts`'s `pickTreeArchetype()`/`pickRockArchetype()` select purely from a position
hash with no biome input, so a "conifer" and "deciduous" tree can land next to each other
regardless of biome even though `cell.biome` is already available at every scatter call site.

## 2. Scope decision (confirmed with user)

Two possible directions were weighed:
- **Texture-only variety** (chosen): reuse `BlockKit.ts`'s world-space-projected UV technique —
  UV derived from world position (not per-tile 0-1 coordinates) — on the *existing* single quad
  per tile, so a tileable texture reads as continuous detail across every tile boundary with
  **zero new geometry**. This is expected to resolve most of the "blocky/patchwork" complaint at
  near-zero performance cost, matching the exact technique already proven for buildings and roads.
- **Literal geometric sub-tile subdivision** (rejected for this pass): split every ground tile
  into an N×N grid of independent small quads (mirroring `computeTileRoadCoverage()`'s road
  sub-tile classification), each able to pick its own micro-variant. Rejected because it
  multiplies vertex/triangle count by 4-16× for *every* tile in the world, not just roads — a
  real cost on top of Phase 2's already-measured ~2.6× chunk-build-time increase, and the user
  has already flagged FPS on large worlds as a live concern. May be revisited later as an
  explicit LOD-gated (near-camera-only) feature if texture-only variety doesn't go far enough,
  but is out of scope here.

"Sub-tile"/"sub-sub-tile" visual granularity in this design comes from the texture's own pixel
resolution (a 256×256 canvas tiled at ~1 repeat per tile carries far more visual detail than a
single flat color, without adding a single new vertex) rather than from additional mesh geometry.

## 3. Architecture

### 3.1 New module: `src/world/TerrainTextures.ts`

Mirrors `RoadTextures.ts`'s exact structure (lazy per-texture canvas cache, `_wrap(tex, repX,
repY)` helper, one exported `terrainVariantTexture(variant: string): THREE.CanvasTexture`
lookup function) and reuses `FactionBlockTextures.ts`'s established canvas-drawing techniques
(base fill + `_jitterPixels()` grain + procedural blob/tendril/speckle overlays via random
ellipses/strokes on a 256×256 canvas) rather than any new asset pipeline or external image
files.

Ten variant keys, one real texture each:
- `beach` — pale sand with speckled grain + a few darker shell/pebble flecks.
- `desert` — warm ochre sand with cracked-dune squiggle lines (adapts the earth texture's
  tendril technique, lighter/warmer palette).
- `savanna` — dry tan grass with sparse darker tuft strokes.
- `grassland` — green grass blade texture (short vertical stroke field), the most common biome,
  gets the most tuning attention.
- `forest` — leaf-litter/moss: mottled green-brown with small irregular leaf-shaped blobs.
- `taiga` — dense needle litter: darker green-brown with fine short diagonal strokes.
- `tundra` — sparse frost-crusted ground: pale grey-green with faint white speckle.
- `snow` — bright white with subtle blue-grey shadow speckle (adapts the existing
  `_jitterPixels` grain technique at low amplitude so it doesn't look noisy).
- `mountain` — bare rock, adapts `graniteTexture()`'s existing granite-speckle technique
  directly (already built, just needs re-exporting/reusing at ground scale).
- `river_bank` — damp packed earth, darker and slightly desaturated versus `desert`'s dry look
  (adapts the earth texture technique with a cooler, damper palette).

Ocean/deep_ocean, river, lake, and river_ford tiles are **not** given a new texture in this
pass — they keep today's solid-color treatment (`BIOME_WATER`/`BIOME_WATER_SHALLOW`/
`BIOME_RIVER`/`BIOME_LAKE`/`BIOME_FORD`), since ocean/river/lake ground sits under the opaque-ish
water surface plane and is rarely fully visible, and fords are a narrow, already-visually-
distinct special case.

`GROUND_UV_TILE_WU` constant (tuned during implementation, starting estimate ~2.5 WU — close to
one tile's own 2×2 WU footprint so the texture shows real per-tile detail without an obviously-
repeating wallpaper look at typical camera distance).

### 3.2 `TerrainGeometryBuilder.ts` changes

New sibling output alongside the existing `roadGeometry`:

```ts
export interface GroundVariantGeometry {
  positions: number[]; normals: number[]; colors: number[]; uvs: number[]; indices: number[];
}
```

(Same shape as `RoadVariantGeometry` plus a `colors` array — ground needs per-vertex color
preserved for the tint-preserving `color * map` multiply; roads don't carry per-vertex color
today and this pass doesn't change that.)

New `addGroundFace(variant, v0, v1, v2, v3, nx, ny, nz, r, g, b)` helper, structurally identical
to the existing `addRoadFace()` but also pushing the tile's vertex color (matching `addFace()`'s
color handling) and computing UV via world-space projection: `uv = (vx / GROUND_UV_TILE_WU, vz /
GROUND_UV_TILE_WU)`.

A new `_groundTextureVariant(cell): string | null` helper returns the texture variant key for a
cell, mirroring the exact same biome/feature-priority chain already used for `biomeRgb`
selection just above it in the file, evaluated in this order:

1. `cell.biome === 'ocean' || cell.biome === 'deep_ocean'` → `null` (untextured, unchanged).
2. `cell.feature === 'river' || cell.feature === 'lake' || cell.feature === 'river_ford'` →
   `null` (untextured, unchanged).
3. `cell.feature === 'river_bank'` → `'river_bank'`.
4. `cell.biome === 'beach'` → `'beach'`.
5. Otherwise → `cell.biome` if it's one of the 9 covered land biomes (desert, savanna,
   grassland, forest, taiga, tundra, snow, mountain, plus beach already covered by rule 4), else
   `null` (untextured fallback for any future biome added later without a texture yet).

All 3 existing top-face branches (flat/all-four-down cheap path, edge cheap-path-with-real-
normal, and single-corner/outer-corner/saddle's explicit 2-triangle path) gain a variant lookup:
when `_groundTextureVariant(cell)` returns non-null, the face is emitted via `addGroundFace()`
into the per-variant buffer instead of via `addFace()`/direct buffer pushes into the base
buffer — same geometry, same vertex positions/normals/colors as today, just routed to a
different (textured) buffer. When it returns `null`, behavior is byte-identical to today
(unchanged code path, zero risk to already-passing ramp/wall tests for water-adjacent tiles).
Walls are **not** changed — always emitted via the existing `addFace()` into the base buffer,
untextured, regardless of the tile's ground-texture-variant.

### 3.3 `OverworldScene._loadTerrainChunk()` changes

After the existing `roadGeometry` mesh-creation loop, an identical loop over `groundGeometry`
entries: for each present variant, build a `THREE.BufferGeometry` (position/normal/color/uv
attributes), a `THREE.MeshStandardMaterial({ map: terrainVariantTexture(variant), vertexColors:
true, roughness: 0.95, metalness: 0 })` (matte, non-metallic — grass/sand/rock all read as rough
matte surfaces; `vertexColors: true` + `map` set together gives the established `color * map`
tint-preserving multiply, same as buildings/roads), and a mesh added to the scene under the
same `_isInScene` gating as the existing ground/road meshes. Typically 1-4 extra draw calls per
chunk (biome patches are usually much larger than one 16×16-tile chunk; only border-heavy
chunks see more), matching the same bounded cost already accepted for road-variant meshes.

The collider-merge loop (`colliderPositions`/`colliderIndices`, currently merging the base
ground buffer + every `roadGeometry` variant) gains a third merge step: fold in every
`groundGeometry` variant's positions/indices too, exactly mirroring the existing road-variant
merge — physics must cover the textured ground faces exactly like it already covers the
untextured ones and road sub-tiles.

## 4. Testing strategy

- `tests/world/TerrainTextures.test.ts`: same structural-only convention as
  `FactionBlockTextures.test.ts`/`RoadTextures.test.ts` (a jsdom canvas-stub environment; assert
  each variant returns a distinct, cached, correctly-`repeat`-configured `THREE.CanvasTexture` —
  not pixel-content assertions).
- `tests/world/TerrainGeometryBuilder.test.ts`: new tests asserting (a) a tile whose biome has a
  covered texture variant produces geometry in `groundGeometry[variant]` instead of the base
  `positions` buffer, with correct UV values at its 4 corners; (b) a tile whose biome/feature is
  *not* covered (ocean, river, lake, river_ford, any uncovered biome) is byte-identical to
  today's output (regression guard on the existing ~45 tests in this suite, all of which must
  continue passing unchanged); (c) ramp-shaped (non-planar) tiles with a covered biome still
  produce correct per-triangle geometry in the right variant buffer; (d) walls are never routed
  into `groundGeometry` regardless of the tile's variant.
- `OverworldScene`-level test (extending the existing chunk-alignment/collider test pattern):
  confirm the collider trimesh still includes every ground-variant triangle (a teleport-into-
  textured-ground-tile-and-check-no-fall-through style assertion, mirroring the existing swim/
  collision e2e coverage).
- Perf check: honest before/after chunk-build-time comparison (same methodology as Phase 2 —
  temporary git worktree at the pre-change commit), reported without downplaying, same as every
  prior phase.
- Manual/live verification: Playwright + dev server screenshot comparison of a generated world
  before/after, confirming visible surface texture detail on grass/forest/desert/etc. tiles and
  no new console errors; explicit fallback to automated-test-only verification if browser
  automation hangs, per this project's established precedent.

## 5. Non-goals / explicitly deferred

- Literal geometric sub-tile subdivision for ground tiles (see §2's rejected alternative).
- Biome-transition blending at borders (smooth color/texture blend between two neighboring
  biomes) — a natural follow-on once this base texture system exists, but not required here;
  tracked separately in the roadmap's Phase 4 "organic biome transitions" item.
- Textured walls (vertical elevation-step faces) — stay vertex-color-only.
- Textured water-biome ground (ocean/deep_ocean seafloor, river/lake basin floor, river_ford
  surface) — stay solid-color, unchanged.
- Nature asset (tree/rock) variety and biome-correct archetype selection — a separate, already-
  agreed next design (Phase 4b), covered by its own spec after this one ships.
