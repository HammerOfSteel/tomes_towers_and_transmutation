# Realm Integration
> Generate the 3D playable overworld terrain directly from the OW-A realm map.

## Status: 🚧 In Progress — RI-1 (realm → terrain placement + height smoothing) and RI-2 (biome → tile mapping) shipped as a pure data-transform module; river mesh (RI-3), chunk streaming (RI-4), and renderer wiring remain

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
- [ ] Rivers from `RealmData.rivers[]` → spline path → `THREE.TubeGeometry` at water level
- [ ] River width scales with length (headwaters narrow → mouth wide)
- [ ] Collider: passable by swimming (future) / impassable on foot except at fords

### RI-4 — Region Chunking
- [ ] World divided into 16×16 tile chunks
- [ ] Only load chunks within 3-chunk radius of player
- [ ] Unload chunks beyond 5-chunk radius (dispose geometry + textures)
- [ ] `ChunkManager.ts`: tracks loaded chunks, listens to player position

### RI-5 — Tests
- [x] `tests/world/RealmToTerrain.test.ts`: same realm seed → identical terrain layout (determinism test), `BIOME_TILE_MAP` completeness, height-smoothing math, transition-flag correctness, full-placement `TileDNA` validity — 12 tests, all passing
- [ ] Performance: 16×16 chunk (256 tiles) generates in < 4ms — deferred until RI-4's chunking exists to benchmark against realistically

## Architecture note
`RealmData`/`RealmBiome` live in `src/overworld-studio.ts` (the Studio page), which wires up DOM elements at module scope — unsafe to import at runtime from game code. `RealmToTerrain.ts` only takes `import type { RealmBiome, RealmData }` from it (erased at compile time, zero runtime coupling) and otherwise operates on a minimal structural `RealmTerrainInput` shape, so it's safe to import from `OverworldScene.ts` or anywhere else in the game runtime.

## Dependencies
- Requires: OW-A realm generator ✅
- Requires: Tile variant system (`tile-designer.md`) ✅
- Requires: `ChunkManager` (new) — still needed for RI-4

