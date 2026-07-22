# Realm Integration
> ⚠️ GAP — Generate the 3D playable overworld terrain directly from the OW-A realm map.

## Status: ⚠️ Not planned

## Goal
When the player enters the overworld, the terrain they walk on matches the realm map exactly:
- Biome cells → terrain tile type + colour
- Elevation noise → actual height displacement
- Rivers → walkable-around water features
- Coastlines → beach transitions

## Tasks

### RI-1 — Realm → Terrain Mesh
- [ ] `RealmToTerrain.ts`: reads `RealmData.cells[y][x]` biome + elevation → places `TileDNA` at world position
- [ ] Tile size: 4 WU × 4 WU (each realm cell = one tile)
- [ ] Height: `elevation * TERRAIN_SCALE` (default scale TBD, ~0.5 WU per unit)
- [ ] Smooth height: average elevation with 8 neighbours (no jagged steps)
- [ ] LOD: 3 detail levels (full at <30u, medium at 30-80u, billboard at 80u+)

### RI-2 — Biome Visual Mapping
- [ ] `BIOME_TILE_MAP`: each biome → `TileDNA` variant (see `game-inventory.md` tile variants)
- [ ] Transition tiles at biome borders (blend textures over 1-tile edge)
- [ ] Water tiles: animated shader (shallow/deep variants)

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
- [ ] `tests/world/realmToTerrain.test.ts`: same realm seed → identical terrain layout
- [ ] Performance: 16×16 chunk (256 tiles) generates in < 4ms

## Dependencies
- Requires: OW-A realm generator ✅
- Requires: Tile variant system (`tile-designer.md`) 🔲
- Requires: `ChunkManager` (new)
