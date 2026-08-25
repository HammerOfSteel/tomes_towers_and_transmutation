# Realm Integration
> Generate the 3D playable overworld terrain directly from the OW-A realm map.

> ⚠️ **This is P0 in [STUDIO-LIVE-PARITY.md](./STUDIO-LIVE-PARITY.md)** — the
> foundation everything else (settlements, caves, dungeons) sits on top of.
> "Wiring RI-1–4 in" is not a small renderer hookup: it means replacing
> `WorldGenerator.ts`'s independent algorithm with actual Studio-generated
> realm data. Read the parity doc before starting here.

## Status: 🚧 In Progress — RI-1, RI-2, RI-3 (river mesh), and RI-4 (chunk streaming core) shipped as pure, unit-tested modules; only the actual `OverworldScene.ts` renderer wiring (LOD, textures, river colliders, chunk↔terrain integration) remains

## Goal
When the player enters the overworld, the terrain they walk on matches the realm map exactly:
- Biome cells → terrain tile type + colour
- Elevation noise → actual height displacement
- Rivers → walkable-around water features
- Coastlines → beach transitions

## Tasks

### RI-1 — Realm → Terrain Mesh
- [x] `RealmToTerrain.ts` (`src/world/RealmToTerrain.ts`): reads `RealmData.cells[y][x]` biome + elevation → places `TileDNA` at world position via `realmDataToTerrain(data)` / `realmToTerrain({cells, W, H, seed})`
- [x] Tile size: 4 WU × 4 WU (`TERRAIN_TILE_SIZE` constant, each realm cell = one tile)
- [x] Height: `elevation * TERRAIN_SCALE` (`TERRAIN_HEIGHT_SCALE = 0.5` WU per unit)
- [x] Smooth height: average elevation with up to 8 neighbours (no jagged steps) — `smoothedElevation()`
- [ ] LOD: 3 detail levels (full at <30u, medium at 30-80u, billboard at 80u+) — deferred; this is a renderer/camera-distance concern layered on top of the placement list, not part of the pure transform

### RI-2 — Biome Visual Mapping
- [x] `BIOME_TILE_MAP`: each `RealmBiome` → `TileDNA` variant (`src/world/RealmToTerrain.ts`) — deep_ocean/ocean → water deep/shallow, beach/desert → desert sand/cracked, savanna/grassland → grassland patchy/short, forest/taiga → forest_floor leaf_litter/moss, tundra/snow → tundra frozen_ground/snow
- [x] Transition tiles at biome borders — `isBiomeTransition` flag on each placement (true when an orthogonal neighbour maps to a different *tile* biome, e.g. grassland↔desert but not forest↔taiga since both map to `forest_floor`); DNA `category` is set to `'transition'` for flagged cells. Actual texture/geometry blending at those tiles is still TODO — this only supplies the correct signal for a renderer to act on.
- [ ] Water tiles: animated shader (shallow/deep variants) — deferred to renderer work

### RI-3 — River Mesh
- [x] Rivers from `RealmData.rivers[]` → spline path → width-varying ribbon mesh at water level (`src/world/RealmRiverMesh.ts`'s `buildRiverMesh()`) — a flat quad-strip surface rather than a literal `THREE.TubeGeometry`, since a river is a horizontal water plane following the path, not a cylinder through the ground; `makeHeightSampler()` bridges it to RI-1's `TerrainTilePlacement[]` so the ribbon sits at the (smoothed) terrain height + a small offset
- [x] River width scales with length — linear from `RIVER_MIN_WIDTH` (headwaters, `points[0]`) to `RIVER_MAX_WIDTH` (mouth, last point)
- [ ] Collider: passable by swimming (future) / impassable on foot except at fords — deferred; needs the physics/collision system, not just the mesh. **Unblocked (2026-08-25):** the Water Lab dev room (`src/scene/WaterLabScene.ts`) has now proven out real swim state end-to-end — depth-based `PlayerController.setSwimming()`/submersion, buoyancy, breaststroke animation, pool-wall collision, wake-trail VFX — but the *live* overworld currently only has a cosmetic boolean water check (`src/world/WaterDetection.ts`'s `isInWaterAt()`, wired into `OverworldScene.ts` purely for a visual submersion offset, no collision/depth/swim-state). Wiring real swim collision onto overworld rivers/lakes means extending `isInWaterAt()`/`WorldGrid` with an actual water-surface-height query (rivers/lakes don't have uniform depth like the Water Lab pool) and feeding that into `PlayerController`'s already-built swim state machine — see `docs/superpowers/plans/2026-08-03-water-lab-and-swim-mode.md` for why swim mode was deliberately kept additive/dev-lab-only up to now.

### RI-4 — Region Chunking
- [x] World divided into 16×16 tile chunks (`CHUNK_SIZE` in `src/world/ChunkManager.ts`)
- [x] Only load chunks within 3-chunk radius of player (`LOAD_RADIUS_CHUNKS`, Chebyshev/square distance)
- [x] Unload chunks beyond 5-chunk radius, dispose via injected `unload(coord, data)` handler (`UNLOAD_RADIUS_CHUNKS`)
- [x] `ChunkManager.ts`: generic `ChunkManager<T>` class — tracks loaded chunks in a `Map`, `update(playerX, playerZ)` loads/unloads based on player position, `dispose()` tears down everything. Generic over payload type `T` and takes `load`/`unload` as injected callbacks (zero THREE.js/DOM coupling), so it can drive terrain chunks, prop/decoration chunks, or anything else spatially streamed — not committed to a single content type at the core-logic layer.
- [ ] Actual wiring into `OverworldScene.ts` — call `chunkManager.update(player.x, player.z)` from the scene tick, with `load(coord)` building a `THREE.Group` of `buildTile()` instances from `realmToTerrain()`'s placements restricted to that chunk's cell range, `unload(coord, group)` doing `scene.remove(group)` + disposing each tile — deferred until there's an active terrain renderer to hook this into

### RI-5 — Tests
- [x] `tests/world/RealmToTerrain.test.ts`: same realm seed → identical terrain layout (determinism test), `BIOME_TILE_MAP` completeness, height-smoothing math, transition-flag correctness, full-placement `TileDNA` validity — 12 tests, all passing
- [x] `tests/world/RealmRiverMesh.test.ts`: ribbon vertex/index counts, width scaling from headwaters to mouth, custom width overrides, height-sampler placement, degenerate (0/1-point) river handling — 9 tests, all passing
- [x] `tests/world/ChunkManager.test.ts`: chunk-coordinate math, Chebyshev radius membership, load/unload lifecycle (idempotent re-update, partial in/out-of-range transitions, `dispose()`), constructor validation — 13 tests, all passing
- [ ] Performance: 16×16 chunk (256 tiles) generates in < 4ms — deferred until the `OverworldScene.ts` wiring exists to benchmark realistically (the pure `realmToTerrain()` transform itself is already O(cells) and trivially fast per the existing test run times, but a meaningful perf test needs the full load-chunk pipeline: cell slice → N × `buildTile()` → THREE group assembly)

## Architecture note
`RealmData`/`RealmBiome`/`RealmRiver`/`Vec2` live in `src/overworld-studio.ts` (the Studio page), which wires up DOM elements at module scope — unsafe to import at runtime from game code. `RealmToTerrain.ts` and `RealmRiverMesh.ts` only take `import type {...}` from it (erased at compile time, zero runtime coupling) and otherwise operate on minimal structural shapes, so both stay safe to import from `OverworldScene.ts` or anywhere else in the game runtime. `ChunkManager.ts` has no dependency on either file at all.

## Dependencies
- Requires: OW-A realm generator ✅
- Requires: Tile variant system (`tile-designer.md`) ✅
- Requires: `ChunkManager` (new) ✅ — core logic shipped; scene wiring still pending

