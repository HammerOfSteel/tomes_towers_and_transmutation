# Environment Art System (Phase 5)
> Two-track rendering: Code-First (procedural) OR Kenney asset packs. Toggle in Settings.

## Status: 🔲 Not started (WorldGenConfig.assetMode field exists ✅)

## Track A — Code-First (Procedural) — DEFAULT
Every visual is Three.js geometry + canvas shaders. Zero external files.

### 5.0 — Asset Inventory & Slot Mapping
- [ ] Map every world slot (tree, rock, grass clump, dungeon wall, etc.) to a `buildXxx(dna)` function
- [ ] Document in `game-inventory.md` which slots have builders vs which are missing

### 5.1 — Tower Room Asset Renderer
- [ ] All 11 floors have complete prop sets ✅ (from Floor Design Pass)
- [ ] Verify no GLB loading in tower floors
- [ ] Add: missing floor-specific ambient light colour

### 5.2 — Dungeon Asset Renderer
- [ ] Dungeon wall/floor tiles procedural (currently basic geometry — needs texture variants)
- [ ] Pillar, crate, barrel, chest props: `buildDungeonProp(type)`
- [ ] Door frames (locked/unlocked variants)
- [ ] Torch sconces (already done ✅), add: chandelier, magic orb

### 5.3 — Overworld Terrain Tiles
- [ ] See `tile-designer.md` for full variant list
- [ ] Priority: grassland, forest, desert, tundra
- [ ] Water shader (animated noise)

### 5.4 — Overworld Nature & Props
- [ ] Trees: 3 variants per biome (sapling/medium/large)
- [ ] Rocks: 3 variants (small/medium/boulder)
- [ ] Grass clumps: 2 variants (short/tall)
- [ ] All via `buildNature(dna)` function
- [ ] Instanced rendering: `THREE.InstancedMesh` for same-DNA props

### 5.5 — Settings Toggle & Persistence
- [ ] Settings → Environment Art: "Code-First" / "Kenney Packs"
- [ ] `WorldGenConfig.assetMode` already exists ✅
- [ ] On toggle: reload active scene with new mode

### 5.6 — World Editor Integration  
- [ ] World editor can preview both art modes
- [ ] Paint mode: paint tiles/props in code-first mode

## Track B — Kenney Asset Mode (optional, post-demo)
- [ ] KayKit/Kenney GLB packs for trees, rocks, buildings
- [ ] Loaded via `GLTFLoader` only when `assetMode = 'kenney'`
- [ ] Not required for demo release

## Dependencies
- Requires: PROC-B builders (slot implementations)
- Feeds: `02-game-world-integration/realm-integration.md`
