# Procedural Grass Shader (Batch 1: Grassland) — Design

## 0. Process Note

The user is temporarily unavailable to answer brainstorming questions interactively (confirmed
via `ask_user`: "The user is not available to respond and will review your work later. Work
autonomously and make good decisions."). Per the user's explicit instruction, this spec makes
autonomous decisions on every open question a normal brainstorming session would have raised,
with each decision's rationale documented inline below. The user asked for procedural grass
multiple times this session and pointed at the installed `procedural-grass` skill
(`.agents/skills/procedural-grass-threejs/`) and its sibling CK42BB reference repos as directly
relevant — this spec follows that skill's WebGL2 path (this project's renderer, per
`src/main.ts`'s `new THREE.WebGLRenderer(...)`, has no WebGPU path at all).

## 1. Context

**What exists today:** overworld ground tiles render a flat baked texture per biome
(`TerrainTextures.ts`'s `_buildGrasslandCanvas()` etc.) — no 3D grass geometry, confirmed by
grepping the codebase for grass blade/InstancedMesh code (none found). The user asked directly:
"Did we do any procedural grass shader yet? I cant really tell currently but doesnt look like
it" — confirmed correct.

**What this batch adds:** real 3D grass blades (bezier-curved instanced geometry, wind-animated,
subsurface-scattering-ish shaded) rendered on `grassland`-biome tiles in the live
`OverworldScene`, within a bounded radius around the player — NOT tied to the full chunk-
streaming system (see §4 for why).

## 2. Scope Decision — Autonomous, Batch 1 of N

**Decision:** this pass covers ONLY the `grassland` biome. `savanna`, `forest`, `taiga`,
`tundra` (the other biomes where real-world grass/groundcover would exist) are explicitly
deferred to a follow-up batch.

**Rationale:** this mirrors the exact "batch 1 of a planned multi-batch rollout" pattern already
used and shipped this session for Phase 6's race-territory-dressing feature — prove out the full
pipeline (geometry, placement, shading, wind, performance budget, testing approach) on one biome
before committing the same pattern to the rest. `grassland` is chosen as batch 1 because it's
the primary, most grass-dominant biome (the skill's own preset table calls its closest match
`meadow`), so it's the best test of visual quality and performance headroom.

## 3. Architecture

New file `src/world/GrassField.ts`, alongside the existing `ScatterRules.ts`/
`TerritoryDressing.ts` world-content modules, split into a **pure/testable layer** and a
**THREE-dependent rendering layer** (the same separation this codebase already uses for
`TerritoryDressing.ts`):

- **Pure logic** (no THREE import, directly unit-testable):
  - `selectGrassPlacements(wg, dims, centerX, centerZ, radius, seed): GrassPlacement[]` — walks
    a square window of tiles around `(centerX, centerZ)`, keeps only tiles where
    `isScatterAllowed(cell, 'grass')` (a new `ScatterRules.ts` kind, see §5) AND
    `cell.biome === 'grassland'`, and for each qualifying tile scatters multiple blade points
    (jittered sub-tile grid, not one blade per tile) using a seeded PRNG. Returns plain data:
    `{ x, y, z, rotation, scaleX, scaleY, tilt, colorVar }[]`.
  - `packGrassInstanceBuffers(placements): { positionRotation: Float32Array, scaleAndVariation: Float32Array }`
    — pure array-packing, mirrors the skill's `createGrassInstanceData`/`buildGrassField` split.
- **Rendering layer** (`GrassField` class, THREE-dependent):
  - Owns one `THREE.InstancedMesh` (one blade geometry, one shader material, one draw call).
  - `constructor(wg, seed)` builds the blade geometry + material once.
  - `update(playerX, playerZ)`: rebuilds the instance buffer only when the player has moved
    more than `REBUILD_HYSTERESIS` world units from the center the mesh was last built around
    (see §4) — NOT every frame.
  - `tickWind(dt, cameraPos)`: per-frame, cheap — just updates shader uniforms (time, camera
    position), no CPU instance-data work.
  - `dispose()`: geometry/material cleanup, mirrors every other disposable in this codebase.

## 4. Placement Radius — Player-Centered, Independent of Chunk Streaming

**Decision:** grass is NOT tied to `ChunkManager`'s terrain streaming (`LOAD_RADIUS_CHUNKS = 3`,
i.e. 7×7 chunks of `CHUNK_SIZE=16` tiles at `T=2` WU/tile = a 224×224 WU loaded terrain area).
Instead, `GrassField` maintains its own much smaller **player-centered square window**:

- `GRASS_RADIUS = 24` world units (a 48×48 WU square, comfortably inside the smallest loaded
  chunk ring so grass never tries to sample ungenerated terrain).
- `REBUILD_HYSTERESIS = 8` world units — the instance buffer is only rebuilt once the player has
  moved 8+ WU from the last build center, avoiding a rebuild every frame while still keeping the
  field visually centered on the player as they walk.
- Distance-based **alpha fade** in the fragment shader (not a hard cutoff) over the outer ~6 WU
  of the radius, so blades don't visibly pop at the boundary — reusing the skill's
  `fadeStart`/`fadeEnd` uniform pattern directly.

**Rationale:** the skill's own multi-ring LOD system (near/mid/far density rings, rebuilt as the
camera moves) is real infrastructure this game's tree/rock scatter does NOT need (trees/rocks are
sparse, ~1 per 5.5-8 WU spacing via Poisson-disk, cheap regardless of count). Grass is 1-2 orders
of magnitude denser per unit area, so applying it across the FULL chunk-streamed terrain area
(224×224 WU = ~50,000 unit²) at even a modest density would be 500K+ blades just from one biome,
eating the entire desktop blade budget the skill itself documents (200K-500K) before any other
draw calls. A small, player-centered, non-chunk-tied window keeps the system bounded and simple
for this first batch — this is a deliberate scope-narrowing choice, not an oversight; expanding
the radius (or switching to a chunk-tied model with LOD rings) is a natural, isolated follow-up
if the visual "grass draw distance" ever feels too short once shipped.

**Budget math:** 48×48 WU window = 2304 unit². At the skill's `meadow` preset density (35
blades/unit²) that's ~80,640 blades in the worst case (100% grassland coverage, no
tree/rock/road/building exclusions). Real coverage will be lower once `isScatterAllowed`
exclusions apply. This sits well inside the skill's documented desktop budget (200K-500K) with
headroom for the biome expansion batches later.

## 5. Placement Rules — Extend `ScatterRules.ts`

Add `'grass'` to `ScatterKind`:

```ts
export type ScatterKind = 'tree' | 'bush' | 'rock' | 'camp' | 'ruin' | 'grass';
```

`isScatterAllowed(cell, 'grass')` reuses the existing shared exclusions (water, settlement) via
the function's existing top-of-function checks, and additionally excludes roads and non-empty
content — identical to the `tree`/`bush`/`rock` branch, since grass shouldn't render through a
road surface, a building footprint, or a dungeon/cave entrance prop:

```ts
if (kind === 'tree' || kind === 'bush' || kind === 'rock' || kind === 'grass') {
  if (cell.feature === 'road' || cell.feature === 'road_dirt') return false;
  if (cell.content !== 'empty') return false;
}
```

The `grassland`-only biome restriction for this batch is intentionally NOT baked into
`ScatterRules.ts` (which has no per-specific-biome-name allowlist concept today — its `beach`
exclusion for trees/bushes is the closest precedent, and that's a hardcoded exclusion, not an
allowlist). Instead `GrassField.ts`'s `selectGrassPlacements()` checks
`cell.biome === 'grassland'` directly, matching this batch's explicitly narrow scope; expanding
to more biomes later is then a one-line change in `GrassField.ts` (turning the equality check
into a `GRASS_BIOMES.has(cell.biome)` set lookup) without touching `ScatterRules.ts` again.

**Map-edge guard (found during spec self-review):** `WorldGrid.get(col, row)` is documented as a
"safe read — returns a default cell for out-of-bounds queries" (`WorldGrid.ts`), and that default
cell's `biome` field is `'grassland'` (used elsewhere so freshly-initialized, not-yet-generated
cells read as ordinary buildable land rather than water/mountain). Left unguarded, this would let
`selectGrassPlacements()` spuriously place grass just past the map's real edge. `GrassField.ts`
must therefore check `col >= 0 && col < wg.width && row >= 0 && row < wg.height` itself before
calling `.get()` for a placement candidate, rather than trusting `.get()`'s fallback value —
mirroring the same explicit bounds check `WorldGrid.get()`/`.set()` already perform internally.

## 6. Blade Geometry & Material

Directly adapted from the `procedural-grass-threejs` skill's WebGL2 reference (bezier-curved
tapered triangle strip blade + `ShaderMaterial` with wind/SSS/AO/distance-fade), using the
skill's `meadow` preset as this batch's starting tuning (already close to this game's existing
grassland ground-texture colors in `TerrainTextures.ts`):

- Blade geometry: `segments=4` (lower than the skill's close-up `5` since this is scatter-scale
  vegetation viewed from a gameplay camera distance, not a hero-asset showcase — matches this
  project's established "cheap and simple, matching this project's established restraint"
  principle from the lantern spell prop), `width=0.06`, `height=0.9`, `curvature=0.28`.
- Material colors: `baseColor=0x3a7d2c`, `tipColor=0x8bbf40` (skill's `meadow` preset values,
  chosen because they sit within the same green family as `_buildGrasslandCanvas()`'s baked
  ground texture, avoiding a jarring color mismatch between blade and ground).
- `dryAmount=0` (this batch has no seasonal/dry-season system — pure YAGNI deferral, not a design
  gap; the `dryColor` uniform still exists in the material for a future hook).
- Wind: the skill's standalone `WindSystem` class (global sway + gust waves + per-blade
  turbulence), NOT reusing the existing tree procedural-sway code (trees use skeletal/bone
  animation via `CreatureAnimator.ts`; grass blades are unskinned vertex-shader-displaced
  instances — a fundamentally different animation mechanism, so sharing code would need an
  artificial shared interface with no real reuse benefit).
- LOD: **shader-based alpha distance fade only** (per §4) — no geometry-swap LOD rings in this
  batch. `frustumCulled = false` on the InstancedMesh (per skill guidance — wind displacement can
  push blades outside their static bounding box).
- No interactive push-displacement in this batch (the skill's `GrassInteraction` class) — YAGNI;
  the player/NPCs walking through grass with no visual displacement is an acceptable batch-1
  limitation, explicitly listed in §9's out-of-scope section.

## 7. Integration — `OverworldScene.ts`

- Constructed once, in the constructor, alongside other world-content builders (mirroring
  `_buildTerritoryPropPool()`'s "built once, used every frame" pattern from Phase 6):
  ```ts
  private readonly _grassField = new GrassField(this._wg, this._seed);
  ```
  Added to the scene graph once (its `InstancedMesh` is a single persistent object, not rebuilt
  as a new mesh each time — `update()` mutates its existing instance buffer in place and bumps
  `instanceMatrix.needsUpdate`, matching the `_syncSlimeIM()` pattern already used for the slime
  `InstancedMesh` in this same file's `update()` loop).
- Wired into `OverworldScene.update(dt, inputE, camera)` (existing method, §above) alongside the
  existing `_syncSlimeIM()` call:
  ```ts
  this._grassField.update(pos.x, pos.z);
  this._grassField.tickWind(dt, camera?.position ?? pos);
  ```
- Gated the same way chunk/scatter content already is: only touches the scene graph once
  (`scene.add()` in the constructor, gated by `this._isInScene` exactly like `_buildChunkScatter`
  does), so no dungeon-interior grass leakage.

## 8. Testing

- **`selectGrassPlacements()`** (pure, no THREE): fake `WorldCell`-returning `wg` stub (matching
  `ScatterRules.test.ts`'s `makeCell()` helper style) —
  - returns 0 placements for a window with no grassland cells,
  - returns >0 placements for an all-grassland window,
  - excludes cells with `feature==='road'`, `content!=='empty'`, `waterDepth>0`,
    `settlementId>0` (delegated to `isScatterAllowed`, but verified end-to-end here too since
    that's the actual contract this function exposes),
  - excludes out-of-bounds candidate tiles even though `WorldGrid.get()`'s default fallback cell
    reports `biome: 'grassland'` (the map-edge guard from §5) — a window placed at/near
    `(0,0)`/`(width-1,height-1)` must not place grass past the grid's real bounds,
  - is deterministic for a fixed seed (same seed + same window → identical output array).
- **`packGrassInstanceBuffers()`** (pure): given N placements, returns `Float32Array`s of the
  expected length (`N*4` each) with values at the expected packed offsets.
- **`isScatterAllowed(cell, 'grass')`** — new cases added to the existing
  `tests/world/ScatterRules.test.ts` (extends the existing `for (const kind of [...])` iteration
  arrays to include `'grass'` where the shared exclusions apply, plus one dedicated test mirroring
  the existing tree/bush road-exclusion test).
- **`GrassField` rebuild-threshold logic**: a lightweight test using a real (not mocked) `THREE`
  import (matching `PlayerControllerLantern.test.ts`'s convention of using real THREE in a jsdom
  environment) with a minimal fake `WorldGrid`-shaped object — asserts `update()` does NOT touch
  the instance buffer when called twice with the player at the same position, but DOES rebuild
  once the player has moved past `REBUILD_HYSTERESIS`.
- **Material/shader construction**: mirrors `tests/world/WaterMaterial.test.ts`'s existing
  pattern of regex-asserting on `material.fragmentShader`/`vertexShader` string content (e.g.
  confirming the wind-uniform name appears in the vertex shader, confirming the fade uniforms
  appear in the fragment shader) — the same "shader source is data we can assert on" convention
  already established in this codebase for `WaterMaterial`.
- **End-to-end visual verification**: a one-off Playwright spec
  `tests/e2e/procedural-grass.spec.ts` (not part of CI regression, matching the established
  `river-lake-swim.spec.ts`/`lantern-spell.spec.ts` convention) — boots the game, goes exterior,
  teleports the player to a known-grassland tile (reusing/extending the existing
  `window.__game` debug-hook pattern with a new `findGrasslandTile()` hook mirroring the existing
  `findWaterTile()` hook), confirms zero console/page errors, and asserts `getPerfStats().drawCalls`
  stays within a sane bound (a regression guard against the "un-merged scatter caused sub-7fps"
  class of bug this project has hit before).

## 9. Explicitly Out of Scope (This Batch)

- The other 4 grass-bearing biomes (`savanna`, `forest`, `taiga`, `tundra`) — deferred to a
  follow-up batch, exactly like Phase 6's territory-dressing rollout.
- Interactive push-displacement (grass visibly parting around the player/NPCs/enemies).
- Multi-ring geometry LOD (only shader-based alpha distance fade in this batch).
- WebGPU/TSL compute-shader placement path — this project has no WebGPU renderer at all.
- Any change to the existing baked ground texture system (`TerrainTextures.ts`) — grass blades
  render as an additive 3D layer on top of the existing textured ground, not a replacement for it.
- Seasonal/dry-season color variation (the `dryAmount`/`dryColor` uniform exists but stays at 0
  this batch).
- Any Overworld Studio / dev-sandbox wiring — this batch targets the live `OverworldScene` only,
  matching the user's own repeated framing of "the live overworld" as the target throughout this
  session's earlier swim-collision and biome-overhaul work.
