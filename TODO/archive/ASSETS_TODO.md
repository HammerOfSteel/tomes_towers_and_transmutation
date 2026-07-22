# Assets v1 — Environment Asset Integration

> **Superseded by `TODO.md`** (2026-07-16)
> Character asset infrastructure (charManifest, WizardLoader, CharacterLoader) is done.
> Overworld asset replacement (trees, rocks, buildings from Kenney packs) is preserved in
> `TODO.md` under "Overworld Asset Pass" as a low-priority deferred item.
> Do not create new todo items here.

---

## Strategy

The codebase uses procedural `THREE.BufferGeometry` throughout. The asset integration strategy is **additive, not destructive**:

1. Unzip target packs into a `public/assets/` directory tree (GLB files served statically).
2. Build a lightweight `AssetLoader` service (`src/assets/AssetLoader.ts`) that caches GLTFLoader results by path.
3. Replace procedural geometry call-sites one system at a time, keeping fallbacks so the game never goes dark.
4. Test each phase in-game before moving to the next.

---

## Phase 0 — Infrastructure (Research + Setup)

**Goal**: Pipeline exists, first GLB loads in-game.

### R0.1 — Unzip priority packs to `public/assets/`
- [ ] Create `public/assets/` directory structure
- [ ] Unzip `kenney_modular-dungeon-kit_1.0` → `public/assets/dungeon/`
- [ ] Unzip `kenney_nature-kit` → `public/assets/nature/`
- [ ] Unzip `kenney_retro-fantasy-kit` → `public/assets/buildings/`
- [ ] Unzip `kenney_fantasy-town-kit_2.0` → `public/assets/town/`
- [ ] Unzip `kenney_castle-kit` → `public/assets/castle/`
- [ ] Decide: unzip all GLBs flat into category folders, or keep Kenney's `Models/GLB format/` subfolder structure?

### R0.2 — Research: GLTFLoader integration in three.js/Vite
- [ ] Read `threejs-gltf-loading` skill (`.agents/skills/threejs-gltf-loading/SKILL.md`)
- [ ] Understand Vite static asset serving (files in `/public/` are served from `/`)
- [ ] Confirm GLB loads cleanly in the existing renderer (shadows, fog, material compatibility)
- [ ] Check if DRACOLoader or MeshoptDecoder is needed (Kenney packs probably aren't compressed)

### R0.3 — Build `AssetLoader` service
- [ ] `src/assets/AssetLoader.ts` — singleton cache wrapping GLTFLoader
  - `load(path: string): Promise<THREE.Group>` — returns cloned scene root
  - `loadAll(paths: string[]): Promise<Map<string, THREE.Group>>` — batch preload
  - Internal LRU cache by path (dispose on eviction)
- [ ] Wire into Vite build: ensure `public/assets/` is excluded from TypeScript but included in bundle

### R0.4 — Proof-of-concept: replace one tree
- [ ] Swap one procedural `ConeGeometry` tree in `OverworldScene` with `kenney_nature-kit/tree_default.glb`
- [ ] Confirm it renders correctly with the existing fog, lighting and shadow setup
- [ ] Confirm InstancedMesh is feasible (trees need thousands of instances)

---

## Phase 1 — Overworld Terrain Decoration

**Goal**: Overworld trees, rocks, and ground props look like real assets instead of primitive geometry.

### 1.1 — Tree replacement
- [ ] Research: Kenney nature-kit trees in InstancedMesh — do they share the same colormap? If yes, use InstancedMesh for all same-model trees.
- [ ] Map existing `_buildTrees()` cone+cylinder trees → `tree_default` / `tree_oak` / `tree_pine*` / `tree_cone` by biome
- [ ] Implement `AssetInstanceBatch` helper: takes a GLB, extracts geometry+material, creates InstancedMesh with N slots
- [ ] Replace tree generation in `OverworldScene._buildTrees()` using batch instancing
- [ ] Tune scale + Y offset to sit on terrain correctly (use heightfield elevation)

### 1.2 — Rock replacement
- [ ] Map existing `DodecahedronGeometry` rocks → `rock_largeA-F`, `rock_tallA-J`, `rock_smallA-I`
- [ ] Vary rock model by size/seed for visual diversity
- [ ] Replace `OverworldScene._buildRocks()`

### 1.3 — Ground clutter
- [ ] Add scattered mushrooms (`mushroom_red`, `mushroom_tan`) in forest-elevation zones
- [ ] Add flowers (`flower_red/purple/yellow`) in low-elevation zones
- [ ] Add grass tufts (`grass.glb`, `grass_large.glb`) procedurally
- [ ] Keep density low enough for performance (max 500 small props total on 128×128 world)

### 1.4 — Water features
- [ ] Replace procedural water mesh with `kenney_nature-kit/ground_riverStraight.glb` + bend/corner tiles
- [ ] Map river grid cells from `HydrologyGenerator` → appropriate river tile type (straight/bend/cross/end)
- [ ] Add `lily_large` and `lily_small` props on water surface near river banks

### 1.5 — Paths
- [ ] Road tiles in settlements: `kenney_fantasy-town-kit_2.0/road.glb` + bend/corner
- [ ] Rural dirt paths: `kenney_nature-kit/ground_pathStraight` + variants
- [ ] Map settlement grid zone → road tiles; inter-settlement roads → path tiles

---

## Phase 2 — Buildings (Settlements)

**Goal**: Procedural box-buildings replaced with modular-kit buildings using real assets.

### 2.1 — Research: Kenney modular building grid
- [ ] Study `kenney_retro-fantasy-kit` and `kenney_fantasy-town-kit_2.0` tile dimensions
- [ ] Confirm their wall/floor modules align with our T=2 WU grid
- [ ] Sketch 3-4 building "recipes" (small house, tavern, merchant stall, watchtower) as module combinations

### 2.2 — Building assembler
- [ ] `src/world/buildings/AssetBuildingAssembler.ts`
  - Takes a `BuildingPlan` (from existing `BuildingGenerator.ts`) and assembles from GLB modules
  - `buildHouse(plan, scene)`, `buildTavern(plan, scene)`, `buildShop(plan, scene)` etc.
  - Reuses `AssetLoader` cache for GLB modules
- [ ] Test with one settlement type (village)

### 2.3 — Town + city buildings
- [ ] Scale up to town/city buildings using more elaborate modules from `fantasy-town-kit`
- [ ] Add town-specific features: market stalls, fountains, hedges, lanterns

### 2.4 — Ruins POIs
- [ ] **FBX conversion task**: batch convert `Ultimate Modular Ruins Pack` FBX → GLB using Blender scripted export
  - Script: `tools/convert_fbx_to_glb.py` or Blender CLI
  - Output: `public/assets/ruins/`
- [ ] Replace `OverworldScene._buildRuins()` circular-pillar geometry with actual ruin modules
  - `Wall_Broken.fbx`, `Wall_Overgrown.fbx`, `Column_Round.fbx`, `Floor_Tree.fbx`, `Statue_Fox/Stag.fbx`

### 2.5 — Fences + hedges
- [ ] Wire kenney fence tiles around settlement perimeters
- [ ] Add hedges around town squares

---

## Phase 3 — Tower Visual Upgrade

**Goal**: The player's home tower looks like a real castle tower.

### 3.1 — Research: castle-kit + retro-fantasy-kit tower modules
- [ ] Map current `_buildTower()` procedural sections to Kenney castle/retro-fantasy pieces
- [ ] Foundation → `tower-square-base.glb`
- [ ] Floor sections → `tower-square-mid.glb` / `tower.glb` stacked
- [ ] Battlements → `battlement.glb` + `battlement-corner.glb`
- [ ] Spire → `tower-hexagon-roof.glb` or `tower-slant-roof.glb`
- [ ] Door arch → `wall-fortified-gate.glb` or `gate.glb`

### 3.2 — Tower assembly
- [ ] Build `src/world/AssetTowerAssembler.ts` using loaded tower modules
- [ ] Keep existing physics collider (cylinder) — only replace visual geometry
- [ ] Confirm entrance trigger position still works with new door model

### 3.3 — Tower interior door
- [ ] Replace interior door mesh with `kenney_mini-dungeon/gate-door.glb`

---

## Phase 4 — Dungeon Interior

**Goal**: Dungeon rooms and corridors use Kenney modular dungeon kit tiles.

### 4.1 — Research: dungeon kit tile system
- [ ] Understand `kenney_modular-dungeon-kit_1.0` tile dimensions and pivot points
- [ ] Map to our dungeon grid: 1 dungeon cell = how many dungeon tiles?
- [ ] Identify room vs corridor placement rules (wall/floor/ceiling orientation)

### 4.2 — Dungeon tile renderer
- [ ] `src/levels/AssetDungeonRenderer.ts`
  - Walks `DungeonPlan.rooms` and places corridor/room tiles
  - Uses `AssetLoader` + InstancedMesh for repeated floor/wall tiles
  - Room type → `room-small`, `room-wide`, `room-large` selection by room size
  - Corridors → `corridor`, `corridor-wide` + corner/junction/end caps
  - Gates → `gate-door.glb` / `gate-metal-bars.glb` at connections
- [ ] Test with generated dungeon plan

### 4.3 — Cave dungeon variant
- [ ] Toggle between dungeon-kit and cave-kit based on dungeon type (`DungeonType`)
- [ ] Cave type dungeons use `kenney_modular-cave-kit_1.0`

### 4.4 — Dungeon props
- [ ] Scatter kenney props: barrels, chests, torches, skulls, traps from `kenney_mini-dungeon`
- [ ] Wire chest placement to existing loot/chest spawn points in `DungeonPlan`

---

## Phase 5 — Polish + Optimisation

**Goal**: Stable frame rate, consistent look, no obvious seams.

### 5.1 — LOD system
- [ ] Trees: swap to billboard sprite beyond 60 WU (or use simpler kenney tree variant)
- [ ] Building detail props (barrels, lanterns): only render within 40 WU

### 5.2 — Shadow budget
- [ ] Audit which asset meshes cast/receive shadows
- [ ] Limit shadow casting to large structural pieces only (walls, towers, cliffs)
- [ ] Reduce shadow map size if frame time spikes

### 5.3 — Material pass
- [ ] Ensure all Kenney models use `MeshStandardMaterial` (they default to it in GLB)
- [ ] Apply game fog to asset materials — confirm fog uniforms work
- [ ] Tweak roughness/metalness for consistency with game's dark aesthetic

### 5.4 — InstancedMesh audit
- [ ] Profile draw calls before/after asset integration
- [ ] Group all trees, rocks, ground props into InstancedMesh batches
- [ ] Target: < 200 draw calls in overworld

---

## Phase 6 — Enemy & NPC Visual Assets (deferred)

*Only after phases 1–5 are stable and the world looks good.*

### 6.1 — FBX conversion: Quaternius monsters
- [ ] Convert `Animated Monster Pack @Quaternius` FBX → GLB (Blender batch export)
  - `Slime.fbx`, `Skeleton.fbx`, `Bat.fbx`, `Dragon.fbx`
- [ ] Verify animation clips export correctly (walk, attack, death)

### 6.2 — Wire monster GLBs into SlimeEnemy + future enemies
- [ ] `SlimeEnemy` currently uses `SphereGeometry` — replace mesh with Slime GLB
- [ ] Use `THREE.AnimationMixer` for animation playback (walk/idle/attack/death clips)
- [ ] Map existing `EnemyState` FSM states to animation clips

### 6.3 — NPC visual upgrade
- [ ] Options: Kenney blocky characters (GLB, easy) vs Quaternius animated humans (FBX, richer)
- [ ] Replace `npcDna()` DNA-based creature with loaded character model
- [ ] Wire existing NPC animations to `AnimationMixer`

### 6.4 — Wildlife
- [ ] Add passive wildlife (deer, rabbits, birds) using `kenney_cube-pets` or `Cute Fish Pack`
- [ ] Simple wander AI (reuse NPCEntity wander FSM)

---

## Notes & Decisions Log

| Date | Decision |
|---|---|
| 2026-07-15 | Branch created from main after merging improve_and_extend_overworld |
| 2026-07-15 | Kenney packs chosen as priority (GLB, CC0, atlas texture = good batching) |
| 2026-07-15 | FBX packs (Quaternius, Retro Dungeons, Ruins) deferred to later phases |
| TBD | Decide on `public/assets/` flat vs subfolder layout |
| TBD | Confirm Kenney dungeon tile size vs our T=2 WU grid |
