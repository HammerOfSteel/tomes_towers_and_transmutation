# Water Floor Texture Variety + Shoreline Softening Design Spec

Status: approved autonomously as the final item in the nature/terrain-polish backlog
(wildlife height fix → road sub-tile reuse → settlement placement fix → this). User
flagged this specific item as the biggest, most creative-decision-heavy piece and
said it would "benefit from more back-and-forth" — but is currently unavailable, with
a standing "work autonomously and make good decisions" authorization from earlier in
this session. Proceeding with documented, conservative scoping decisions rather than
guessing at open-ended creative choices; flagging anything speculative for later
review.

## 1. Problem (user feedback, verbatim pieces)

> "shorelines and rivers and lakes edges looks very blocky... working more on the
> water and making it have more variety and look better and the bottom of rivers and
> lakes and the sea... looks pretty blocky too so it could also have sub and
> subsubtiles etc and perhaps some texture variety on the lake, river and ocean
> floors and maybe a variety of props etc that work well in those areas"

Investigated (background research agent) and confirmed three root causes:

1. **Water tiles are explicitly excluded from the ground sub-tile system.**
   `_groundTextureVariant()` in `TerrainGeometryBuilder.ts` returns `null` for any
   ocean/deep_ocean/river/lake tile, routing them to the plain single-quad,
   flat-vertex-color base buffer instead of the textured, bump-jittered,
   border-dithered `groundGeometry` path every LAND biome already uses (shipped
   2026-08-30/2026-09-01). This is *why* the floor looks like a flat colored plane —
   it's the exact same "before Phase 4a" rendering every other biome used to have.
2. **No water floor texture exists at all** — only a flat vertex-color tint
   (`BIOME_WATER`/`BIOME_WATER_SHALLOW`/`BIOME_RIVER`/`BIOME_LAKE`).
3. **The shoreline itself is a hard, tile-grid-aligned boundary** (a "zigzag"
   staircase following square tile corners) — this is a separate, harder problem from
   #1/#2 (see §4 for why it's scoped out this pass).

## 2. Approach

### 2a. Route water tiles through the EXISTING ground sub-tile system (not a new one)

Extend `_groundTextureVariant()` to return a texture variant for water tiles instead
of `null`:

```ts
const _groundTextureVariant = (cell: WorldCell): string | null => {
  if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') return 'ocean_floor';
  if (cell.feature === 'river')       return 'river_floor';
  if (cell.feature === 'lake')        return 'lake_floor';
  if (cell.feature === 'river_ford')  return null; // unchanged — a dry, walkable
                                                    // road crossing, not a floor
  if (cell.feature === 'river_bank')  return 'river_bank';
  if (cell.biome === 'beach')         return 'beach';
  return (GROUND_TERRAIN_VARIANTS as readonly string[]).includes(cell.biome) ? cell.biome : null;
};
```

Because `buildTerrainGeometryData()` already branches on "does this cell have a
texture variant?" to decide between `emitGroundSubTiles()` (textured, bump-jittered,
border-dithered 4×4 sub-tile grid) and a plain single `addFace()` quad, this ONE
change automatically gives every water tile:

- A real tileable texture (see §2b) instead of a flat color.
- The exact same `subTileBumpJitter()` per-sub-tile-lattice-point height variation
  ground tiles get — the water floor stops being a perfectly flat plane.
- Border-dithering at the coastline for free: `_subTileGroundVariant()`'s existing
  neighbor-peek logic will now see a REAL variant (`ocean_floor`/`river_floor`/etc.)
  on the water side of a beach/river_bank boundary (previously it saw `null`, which
  never participates in border-dithering), so beach sub-tiles right at the waterline
  will occasionally pull toward the water floor's texture and vice versa — softening
  the color/texture transition exactly the way two adjacent land biomes already blend
  into each other. This does NOT change the literal geometric edge (see §4) but
  meaningfully reduces how "hard" that edge reads visually.

Ramp classification (`_isRampEligible`/`_isWaterTile`) and wall generation are
untouched by this — both operate on raw corner heights independent of
`_groundTextureVariant()`, confirmed by reading `buildTerrainGeometryData()` in full.

### 2b. Three new water floor textures (`TerrainTextures.ts`)

Following the exact same canvas-based procedural-texture pattern as the 10 existing
land variants:

- **`river_floor`**: sandy/pebbly riverbed — light tan-brown base with small rounded
  pebble/rock speckles and subtle current-ripple streaks (reusing the streak-drawing
  technique `_buildSavannaCanvas()`/`_buildGrasslandCanvas()` already use, oriented
  along one axis to suggest flow direction).
- **`lake_floor`**: silty/muddy lakebed — darker olive-brown base, calmer/no directional
  streaks (still water), occasional small dark patches suggesting sediment/algae.
- **`ocean_floor`**: pale sandy base with small light-colored shell/rock fleck detail —
  the existing `BIOME_WATER`/`BIOME_WATER_SHALLOW` vertex-color tint (already computed
  per-tile via the existing shallow/deep threshold) multiplies over this same texture,
  so shallow vs. deep ocean floor differ in color for free via the pipeline every land
  biome already uses (tint × texture), no separate deep/shallow texture needed.

All three added to `GROUND_TERRAIN_VARIANTS` and `_canvasFor()`'s switch, following the
identical registration pattern as every existing variant. No new rendering pipeline,
material type, or shader — same `MeshStandardMaterial({ map, vertexColors: true,
roughness, metalness: 0 })` mesh-per-variant approach already used for every other
`groundGeometry` variant.

### 2c. Underwater props — small, deferred to a light pass, not a full system

The user's own phrasing ("perhaps a variety of props etc... maybe") is softer/more
exploratory than the floor-texture ask. Given this pass's primary deliverable (2a/2b)
is the well-scoped, high-confidence fix directly matching "looks blocky," underwater
props are treated as a stretch addition attempted AFTER 2a/2b ship cleanly, not a
blocking requirement. If time/scope allows: a minimal scatter pass (reusing the
existing `poissonDisk`/scatter-rules pattern already used for trees/rocks/ambient
wildlife) placing a small number of simple, purely-decorative low-poly props (e.g. a
rock cluster, a seaweed/kelp blade billboard-style mesh) on river/lake/ocean floor
tiles only, gated by `isScatterAllowed`-style rules, with zero collision (matching
`AmbientWildlife`'s "purely cosmetic" precedent) — deferred to its own design note if
it turns out to need more than a small, mechanical addition once 2a/2b are verified.

## 3. Why this reuses infrastructure instead of a new water-specific system

The ENTIRE reason this is tractable in one pass is that `TerrainGeometryBuilder.ts`'s
sub-tile/texture-variant machinery is generic over "any cell with a texture variant
key," not land-specific — water tiles were excluded by an explicit early-return, not
because the underlying system couldn't handle them. Removing that one early-return
(and supplying 3 new textures) is a data change, not an architecture change — this is
the single highest-leverage fix available for this ask.

## 4. Non-goals (this pass)

- **Literal shoreline edge-line reshaping** (making the water/land BOUNDARY itself a
  non-grid-aligned, wobbly line instead of following tile corners exactly). This is a
  fundamentally harder problem than §2a: it requires the WATER surface mesh and the
  bordering LAND mesh to agree on laterally-shifted (not just height-jittered) shared
  boundary vertex positions, or the two meshes will show visible gaps/overlaps at the
  coastline. The water surface mesh today is *also* a single flat quad per tile
  (`OverworldScene._buildWaterMesh()`, separate from the ground/floor mesh entirely) —
  correctly reshaping its edges is a substantial, risk-bearing effort deserving its
  own focused design/implementation pass with careful gap/z-fighting testing, not a
  side effect bolted onto the floor-texture fix. §2a's border-dithering color/texture
  feathering (a byproduct of reusing the existing system) is the practical, safe
  improvement shipped instead — it softens the visual impression of blockiness without
  touching mesh topology at the boundary.
- No change to `WaterMaterial.ts`'s surface shader/wave animation.
- No change to swim depth/collision behavior (`WaterDepthConfig.ts`/`WaterDetection.ts`)
  — purely a rendering change to the floor beneath.
- No underwater prop COLLISION or gameplay interaction (if shipped at all, per §2c).
- No change to `river_ford` tiles' rendering (still the flat/bridge-deck path,
  unaffected).

## 5. Testing

- `TerrainTextures.ts`: 3 new variants produce distinct, cached `CanvasTexture`s
  (mirrors every existing `terrainVariantTexture()` test); `GROUND_TERRAIN_VARIANTS`
  grows from 10 to 13 entries (existing "lists exactly the 10" test updated to 13).
- `TerrainGeometryBuilder.ts`: a river/lake/ocean tile's top face now routes into
  `groundGeometry['river_floor'|'lake_floor'|'ocean_floor']` instead of the plain base
  buffer — extends the exact test-migration pattern already established for Phase 4a
  (`totalPositionsLength()`/`totalIndicesLength()`/`allNormals()` helpers already sum
  across both buffers, so most existing water-tile tests asserting *total* geometry
  continue to pass unchanged; tests asserting water specifically lands in the base
  buffer need updating to point at the new `groundGeometry` entry instead).
  `river_ford` continues to land in the base buffer, unchanged.
- Confirm a water tile now participates in bump jitter (reuse the same
  `subTileBumpJitter()` exact-value test pattern used for the road sub-tile fix).
- Confirm a beach/river_bank tile bordering a water tile can now border-dither toward
  the water floor's variant (extends `_subTileGroundVariant()`'s existing neighbor
  tests with a water-tile neighbor case).
- Manual visual verification (screenshot comparison at a real coastline/riverbank)
  — same established pattern as every other shader/geometry-visible change this
  session.
