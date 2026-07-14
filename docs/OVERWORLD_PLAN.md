# Overworld Expansion Plan

> **Branch:** `improve_and_extend_overworld`
> **Starting from:** The 51×51 tile (100×100 world-unit) heightmap in `OverworldScene.ts`
>
> The overworld is currently a single small sandbox: a procedural terrain with three biomes,
> some trees, rocks, an enemy camp, the tower, and a ruined greenhouse. This plan expands it
> into a full explorable world with rivers, lakes, dungeon entrances, villages, a city, and
> NPC inhabitants generated using the creature creator system.

---

## What Exists Today (Baseline)

| System | File | Notes |
|--------|------|-------|
| 51×51 tile heightmap terrain | `OverworldScene.ts` | GW=51, T=2 → 100×100 world units |
| Simplex noise + fbm | `SimplexNoise.ts` | Seeded 2D noise for elevation |
| Poisson-disk sampling | `poissonDisk.ts` | Bridson algorithm, deterministic |
| mulberry32 PRNG | `prng.ts` | All deterministic generation |
| Biome vertex colors (bog/grass/forest/highland/rocky) | `OverworldScene.ts` | 5 levels, 0–4 |
| Procedural trees + rocks | `OverworldScene.ts` | Cone canopy + cylinder trunk |
| Enemy camps (slime groups) | `OverworldScene.ts` | Poisson-disk spaced |
| Tower entrance | `OverworldScene.ts` | Single dungeon entrance, goes to TowerGenerator |
| Ruined greenhouse exterior | `OverworldScene.ts` | Single building, uses GreenhouseGenerator |
| GreenhouseGenerator | `GreenhouseGenerator.ts` | Template for dungeon-behind-entrance |
| DungeonGenerator | `DungeonGenerator.ts` | General dungeon rooms + connectors |
| TowerGenerator | `TowerGenerator.ts` | 11-floor tower-specific dungeon |

**What is missing:**
- World is too small to feel explorable (100×100 units ≈ a few screens)
- No rivers or lakes
- No dungeon entrances other than the tower
- No buildings beyond the greenhouse ruin
- No settlements (villages, towns, city)
- No NPC inhabitants
- No world generation configuration UI
- No minimap or exploration tracking

---

## Architecture: The World Generation Pipeline

Inspired by Gemini's research and Amit Patel's (RedBlobGames) waterfall model:

```
[ Step 1 — Macro Terrain ]    Seeded simplex noise → elevation grid → biome assignment
           │
[ Step 2 — Hydrology ]        Downhill drainage paths → rivers → lake basins
           │
[ Step 3 — Feature Placement ] Poisson-disk → dungeon entrances, settlement seeds,
                                               resource node sites
           │
[ Step 4 — Settlement Layout ] BFS road growth from settlement center → building
                                footprints along roads (WFC-lite road adjacency rules)
           │
[ Step 5 — Content Seeding ]   Per-dungeon seeds, per-settlement NPC pool,
                                world history simulation (50 turns)
           │
[ Step 6 — GPU Render ]        Data grid → THREE.InstancedMesh per tile type;
                                buildings as merged BufferGeometry groups
```

**Key architectural principles (from Gemini research):**
- **Logic grid is separate from 3D render.** `WorldGrid` is a pure TypeScript data structure
  (a typed array of `WorldCell`). The renderer reads from it — never the reverse.
- **InstancedMesh is non-negotiable for tiles.** A 256×256 world has 65,536 tiles.
  Individual `THREE.Mesh` per tile will crash the browser. All tile types (grass, road, water,
  etc.) use `THREE.InstancedMesh` with matrix-based positioning.
- **Chunked loading for large worlds.** Only the 9-chunk neighbourhood around the player
  is loaded at any time. Chunks are generated once (seeded), cached in a `Map<string, Chunk>`,
  and loaded/unloaded as the player moves.
- **Generate then cache.** World generation runs once when a new game starts, serializes the
  `WorldGrid` to localStorage, and is reloaded on subsequent sessions. Generation is not
  repeated per session.

---

## Current State Gap Table

| Gap | Impact | Phase |
|-----|--------|-------|
| World is 100×100 world-units — one glance covers it all | Player has nowhere to explore | OW-1 |
| No generator config — every new game is identical (same seed hardcoded) | No replayability | OW-1 |
| No world gen dev settings in main menu | Can't tune parameters for testing | OW-1 |
| No rivers or lakes — terrain feels sterile | Missing landmark navigation | OW-2 |
| Only one dungeon entrance (the tower) | Nothing to discover | OW-3 |
| No village/city buildings | World feels uninhabited | OW-4 / OW-5 |
| No settlements — nowhere to be "somewhere" | No sense of civilization | OW-5 |
| No NPC inhabitants | World feels dead | OW-6 |
| No minimap | Player gets lost, can't track discoveries | OW-7 |
| World history is blank — NPCs have nothing to say | Dialogue system has no context | OW-8 |

---

## Implementation Phases

### Phase OW-1 — World Scale, Architecture & Gen Config

**Goal:** Establish the parametric `WorldGenConfig` system, expand the world to an
explorable scale, formalize the logic-grid-first architecture, and add a World Gen
settings tab to the main menu dev panel.

#### Research checkpoint
- [ ] **Research:** RedBlobGames — "Making maps with noise functions"
  (`redblobgames.com/maps/terrain-from-noise/`). Read the section on using multiple
  octaves of noise for terrain. Understand the difference between elevation-only biomes
  (height → color) and the more realistic approach of using a second moisture noise map
  to produce biome variety independent of height (e.g. high + dry = desert, high + wet =
  snow).
- [ ] **Research:** Chunked world loading patterns in browser games. Search "three.js
  infinite world chunks" and "chunked terrain three.js". The key decision: should chunks
  be pre-generated to a data array (serializable) or lazily generated on demand? Pro
  of pre-gen: deterministic, serializable, no stutter. Pro of lazy: unlimited world size.
  **Decision: pre-generate a fixed-size world at new-game time and serialize it.**

#### Tasks

**`src/world/WorldGenConfig.ts`** — new file, the DNA of the overworld:
```typescript
export interface WorldGenConfig {
  seed:          number;
  worldSize:     128 | 256 | 512;   // tile count per side; default 256
  tileUnit:      2;                  // world-units per tile (keep as 2, matches interior)
  elevationOctaves: number;          // 4–8, more = more detail; default 6
  riverCount:    number;             // 2–8; default 4
  lakeCount:     number;             // 1–4; default 2
  dungeonCount:  number;             // 4–12; default 6
  villageCount:  number;             // 2–6; default 3
  townCount:     number;             // 1–3; default 1
  hasCity:       boolean;            // one major city; default true
  enemyCampCount: number;            // 8–24; default 12
  resourceDensity: 0.5 | 1.0 | 2.0; // multiplier on ore/timber/essence node count
}
export const DEFAULT_WORLD_GEN_CONFIG: WorldGenConfig;
export function worldGenConfigToBase64(cfg: WorldGenConfig): string;
export function base64ToWorldGenConfig(s: string): WorldGenConfig;
```

**`src/world/WorldGrid.ts`** — new file, the data layer:
```typescript
export type BiomeId = 'bog' | 'grass' | 'forest' | 'highland' | 'rocky' | 'water' | 'snow';
export type TileFeature = 'none' | 'river' | 'river_bank' | 'road' | 'road_dirt';
export type TileContent  =
  | 'empty' | 'tree' | 'rock' | 'building' | 'ruin'
  | 'dungeon_entrance' | 'tower' | 'resource_ore' | 'resource_timber' | 'resource_essence';

export interface WorldCell {
  elevation:  number;    // 0.0–1.0 normalised (not the integer level)
  biome:      BiomeId;
  feature:    TileFeature;
  content:    TileContent;
  buildingId: number;    // 0 = none; >0 = index into WorldData.buildings
  dungeonId:  number;    // 0 = none; >0 = index into WorldData.dungeons
  settlementId: number;  // 0 = none; >0 = index into WorldData.settlements
  walkable:   boolean;
}

export class WorldGrid {
  readonly width:  number;
  readonly height: number;
  readonly cells:  WorldCell[];   // row-major: cells[row * width + col]

  get(col: number, row: number): WorldCell;
  set(col: number, row: number, cell: Partial<WorldCell>): void;
  worldToGrid(wx: number, wz: number): { col: number; row: number };
  gridToWorld(col: number, row: number): { wx: number; wz: number };
}
```

**`src/world/WorldData.ts`** — companion to WorldGrid, holds metadata lists:
```typescript
export interface DungeonEntry {
  id: number; seed: number; type: DungeonType; col: number; row: number;
  name: string; discovered: boolean;
}
export interface SettlementEntry {
  id: number; seed: number; type: 'village' | 'town' | 'city';
  name: string; col: number; row: number; buildingIds: number[];
}
export interface BuildingEntry {
  id: number; type: BuildingType; col: number; row: number;
  settlementId: number; interiorSeed?: number;
}
export interface WorldData {
  config: WorldGenConfig;
  grid:   WorldGrid;
  dungeons:    DungeonEntry[];
  settlements: SettlementEntry[];
  buildings:   BuildingEntry[];
  serialize():   string;
  static deserialize(s: string): WorldData;
}
```

**`OverworldScene.ts` refactor:**
- [ ] Replace hardcoded `GW=51, GH=51` with values read from `WorldGenConfig.worldSize`.
- [ ] Terrain reads from `WorldGrid` instead of building its own internal `_grid` array.
- [ ] Keep existing biome vertex-colour approach, add 'water' biome (flat blue-grey).
- [ ] Existing `PhysicsWorld.createHeightfield()` stays unchanged — feeds from grid elevation.

**World Gen dev settings panel** (`src/ui/MainMenu.ts` additions):
- [ ] Add "World Gen" tab to the Settings modal.
- [ ] Sliders for: `worldSize` (128/256/512 radio), `riverCount`, `dungeonCount`,
  `villageCount`, `townCount`, `hasCity` toggle.
- [ ] Seed field (number input) + `🎲 Random Seed` button (fills with `Date.now()`).
- [ ] "Share Config" copies `worldGenConfigToBase64(cfg)` to clipboard.
- [ ] "Load Config" text input to paste a base64 config string.
- [ ] Live 2D canvas minimap preview (80×80px canvas) showing a fast noise pass of the
  configured world so the player can see what they're generating before committing.

---

### Phase OW-2 — Hydrology: Rivers & Lakes

**Goal:** Rivers flow from high ground to low ground across the terrain. Lakes form
in low-lying basins where rivers drain. Both are visually distinct water surfaces.

> **Gemini insight:** "Rivers are notoriously difficult to generate with pure random noise
> because they must flow downhill and never loop. Best Practice: Generate a heightmap grid.
> Pick a high-elevation tile. Look at its neighbors and move to the lowest adjacent tile.
> Repeat until you hit sea level or the edge of the map. Mark those visited tiles as River tiles."

#### Research checkpoint
- [ ] **Research:** Amit Patel's interactive river generation demo on RedBlobGames.
  Understand the "downhill flow" algorithm and why it's better than noise-based rivers
  (noise rivers can flow uphill or loop). Specifically, look at: source selection
  heuristics (randomize among top 20% elevation tiles), mouth detection (river terminates
  at elevation 0 or map edge), and branch probability (rivers merge, never split).
- [ ] **Research:** Three.js water rendering options at low cost. The water shader in
  TODO.md Phase 7.5g is the full solution. For this phase: a flat `PlaneGeometry` with
  `MeshStandardMaterial` (color: `#2255aa`, metalness: 0.2, roughness: 0.1, transparent:
  true, opacity: 0.75) gives a good placeholder at near-zero cost. No shader needed yet.
- [ ] **Research:** River mesh tessellation strategies — a simple approach is to walk the
  river path and emit a segment-pair of quads (each ~2 units wide). Connecting quads at
  bends requires mitred joins to avoid gaps.

#### Tasks

**`src/world/HydrologyGenerator.ts`** — new file:
```typescript
// Returns river path arrays and lake basin arrays, written directly into the WorldGrid.
export function generateHydrology(grid: WorldGrid, config: WorldGenConfig, rand: () => number): void;

// Internal helpers
function _pickRiverSources(grid: WorldGrid, count: number, rand: () => number): {col: number; row: number}[];
function _flowDownhill(grid: WorldGrid, source: {col: number; row: number}): {col: number; row: number}[];
function _detectLakeBasins(grid: WorldGrid, rivers: {col: number; row: number}[][]): {col: number; row: number; radius: number}[];
function _applyRiversToGrid(grid: WorldGrid, rivers: ..., lakes: ...): void;
```

**River algorithm:**
1. Select `config.riverCount` source tiles from the top 20% elevation zone, spaced
   at least 30 tiles apart (Poisson-disk on the high-elevation subset).
2. For each source, walk to the lowest unvisited adjacent tile at each step.
   Tie-breaking: prefer tiles not already a river (avoids parallel rivers).
   Walk terminates when: tile elevation < 0.05 (near-bog level) or tile is already water.
3. Mark all walked tiles as `feature: 'river'`. Mark their immediate orthogonal
   neighbors as `feature: 'river_bank'` (for visual transition).
4. Lakes: any tile that is low-elevation (`< 0.08`) AND surrounded by ≥4 river or
   river_bank tiles is marked `biome: 'water'` and flood-filled up to a radius
   determined by the local depression size.

**`src/scene/OverworldScene.ts` additions:**
- [ ] After building the terrain mesh, call a new `_buildWaterMesh()` method that:
  - Collects all `WorldCell` where `biome === 'water' || feature === 'river'`.
  - Groups contiguous water cells. Each group gets a merged flat `PlaneGeometry`
    at `y = 0.05` (just above ground) using `THREE.BufferGeometryUtils.mergeGeometries`.
  - All groups share one `MeshStandardMaterial` (water material, transparent, blue-grey).
  - Result is one or a few draw calls for all water surfaces.
- [ ] `walkable: false` for all water cells (physics collision: static box collider
  above water prevents player wading in).
- [ ] Visual: river cells slightly darker than lake cells (brightness tweak in material).
- [ ] Bank cells get a sandy/muddy vertex-colour overlay (mix the bog biome color in).

---

### Phase OW-3 — Dungeon & Cave Entrances

**Goal:** Scatter 4–12 dungeon entrances across the world, each a visually distinct
portal into a procedurally generated underground. Different dungeon types produce
different interior aesthetics. The greenhouse entrance already exists as a template.

> **Design principle:** Every dungeon entrance in the world is unique — unique seed,
> unique name, unique type. A 'cave' entrance looks like a rocky archway. A 'crypt'
> looks like a stone sarcophagus lid. A 'ruins' looks like collapsed columns.
> The interior generator matches the aesthetic of the entrance.

#### Research checkpoint
- [ ] **Research:** How Minecraft structures its "structure types" (dungeon, stronghold,
  mineshaft, village) — each has a defined generator with its own parameters. Our
  `DungeonType` enum maps to generator parameter presets, not separate generator files.
  Study `DungeonGenerator.ts` to understand what parameters it already accepts.
- [ ] **Research:** Procedural dungeon naming. Search "procedural fantasy dungeon names
  generator". Simple approach: seeded word tables — `[adjective] + [noun] + ['Dungeon'|
  'Cavern'|'Crypt'|'Ruin'|'Mine']`. Tables of ~20 adjectives and ~20 nouns give 400+
  unique names.

#### Tasks

**`src/world/DungeonType.ts`** — new file:
```typescript
export type DungeonType = 'cave' | 'crypt' | 'ruins' | 'mine' | 'library_ruin' | 'lair';

export interface DungeonTypeConfig {
  displayName:     string;
  floorType:       FloorType;          // grass, stone, dirt, wood
  wallHeight:      number;             // 0.8–1.4
  roomCount:       [min: number, max: number];
  enemyVariant:    'slime' | 'undead' | 'construct';
  ambiance:        'dim_orange' | 'cold_blue' | 'green_glow' | 'dark';
  entranceMeshKey: 'cave_arch' | 'crypt_door' | 'ruin_pillars' | 'mine_shaft' | 'book_portal';
}

export const DUNGEON_TYPE_CONFIGS: Record<DungeonType, DungeonTypeConfig>;
```

**Entrance mesh vocabulary** (`src/scene/OverworldScene.ts` additions):
- `cave_arch`: Two `SphereGeometry` halves flanking a `CylinderGeometry` opening; rough grey.
- `crypt_door`: Flat slab `BoxGeometry` lid leaning against a buried stone frame. Dark grey.
- `ruin_pillars`: 2–4 broken `CylinderGeometry` columns at varying heights, tilted, crumbled base.
- `mine_shaft`: Rectangular `BoxGeometry` frame with timber cross-beam; dark interior.
- `book_portal`: Floating open `PlaneGeometry` book (existing greenhouse logic, reused).

**`src/world/DungeonNameGenerator.ts`** — new file:
```typescript
export function generateDungeonName(seed: number, type: DungeonType): string;
// Uses seeded mulberry32 to pick from adjective + noun + suffix tables.
// Examples: "The Sunken Cavern", "Mirefall Crypt", "Ashwick Ruins", "The Deep Mine"
```

**`OverworldScene.ts` dungeon entrance integration:**
- [ ] Read `WorldData.dungeons[]` and place the appropriate entrance mesh at each entry's
  `gridToWorld(col, row)` position.
- [ ] `[E]` proximity trigger on each entrance: call `SceneManager.loadDungeon(entry.seed, entry.type)`.
  `DungeonGenerator` receives `type` and uses `DUNGEON_TYPE_CONFIGS[type]` for room parameters.
- [ ] Entrance label (floating text `PlaneGeometry` billboard at y+2): shows dungeon name on
  proximity (within 5u), hides otherwise. `dungeonEntry.discovered = true` on first approach.
- [ ] `DungeonGenerator.ts` additions: accept optional `DungeonTypeConfig` that overrides
  `floorType`, `wallHeight`, `roomCount` defaults.

---

### Phase OW-4 — Building Vocabulary (Modular Structures)

**Goal:** A set of procedural building types built entirely from Three.js primitives +
`LatheGeometry` roofs. Buildings are self-contained generators that emit a `THREE.Group`
at a given position. They use `THREE.InstancedMesh` internally for their wall tiles.

> **Gemini insight:** "THREE.InstancedMesh. This tells the GPU to render thousands of identical
> tiles in a single draw call. You update their positions, rotations, and colors via a
> transformation matrix."

#### Research checkpoint
- [ ] **Research:** Read the Three.js `THREE.InstancedMesh` docs and specifically how
  `setMatrixAt(index, matrix)` and `instanceMatrix.needsUpdate = true` work.
  Understand the tradeoff: InstancedMesh requires identical geometry — good for repeated
  wall tiles, but each building type needs its own InstancedMesh pool.
- [ ] **Research:** Watch Oskar Stålberg's Townscaper/Bad North talk on YouTube. He describes
  how "tile adjacency rules" (WFC-lite) allow organic-looking medieval villages from a small
  set of tile pieces. His key insight: buildings don't need perfect tiling — slightly
  randomised rotations and scale on each piece produce an organic look.
- [ ] **Research:** `THREE.LatheGeometry` for roofs — specifically how to create a pointed
  tower roof and a thatched dome. `LatheGeometry` takes `Vector2[]` profile points and
  `phiLength` (default full 2π). A triangular profile gives a cone; a curved profile gives
  a dome. Practice making 3 roof profiles before building the full system.

#### Tasks

**`src/world/buildings/BuildingTypes.ts`** — types and registry:
```typescript
export type BuildingType =
  | 'cottage'      // small 1-room dwelling, thatched roof
  | 'inn'          // larger L-shaped, pitched roof, sign prop
  | 'market_stall' // open-sided awning, vendor counter
  | 'smithy'       // rectangular, chimney prop, forge glow
  | 'tavern'       // wide building, barrel prop outside
  | 'temple'       // columns + dome roof, emissive interior
  | 'city_hall'    // large, tall, multi-window facade
  | 'guard_tower'  // tall narrow cylinder + battlements
  | 'well'         // small cylinder surround + rope prop (not a building, a feature)
  | 'market_cross' // central column + cross-arm (town square focal point);

export interface BuildingSpec {
  type:      BuildingType;
  footprint: [cols: number, rows: number];  // in grid tiles
  minFloors: number;
  maxFloors: number;
  roofStyle: 'thatched_dome' | 'pointed' | 'flat_parapet' | 'spire';
  allowsInterior: boolean;  // if true, [E] on door opens interior generator
}
export const BUILDING_SPECS: Record<BuildingType, BuildingSpec>;
```

**`src/world/buildings/BuildingGenerator.ts`** — new file:
```typescript
// Returns a THREE.Group positioned at origin (caller positions it in world space).
export function generateBuilding(type: BuildingType, seed: number): THREE.Group;

// Private roof builders:
function _buildThatchedDomeRoof(radius: number, height: number, mat: THREE.Material): THREE.Mesh;
function _buildPointedRoof(radius: number, height: number, mat: THREE.Material): THREE.Mesh;
function _buildFlatParapet(width: number, depth: number, mat: THREE.Material): THREE.Group;
function _buildSpire(baseRadius: number, height: number, mat: THREE.Material): THREE.Mesh;

// Wall tiles via InstancedMesh:
function _buildWalls(footprint: [number, number], floors: number, wallMat, windowMat): THREE.InstancedMesh[];
```

**Per building-type details:**

| Type | Walls | Roof | Notable Props |
|------|-------|------|---------------|
| `cottage` | 4×4 tile footprint, 1 floor BoxGeometry | Thatched dome (LatheGeometry) | Flower boxes on sill (SphereGeometry row) |
| `inn` | 6×8 footprint, 2 floors | Pitched (LatheGeometry triangular profile) | Hanging sign (PlaneGeometry + string line) |
| `market_stall` | 4 CylinderGeometry poles + flat roof | Awning (BoxGeometry, angled) | Counter (BoxGeometry) |
| `smithy` | 5×5, 1 floor | Flat parapet | Chimney (cylinder), PointLight ember glow |
| `tavern` | 8×6, 2 floors | Pitched | Barrel cluster (TorusGeometry + caps outside) |
| `temple` | 8×8, circular columns | Dome (LatheGeometry hemispherical) | CylinderGeometry columns, emissive altar |
| `city_hall` | 12×8, 3 floors | Flat parapet + central spire | Arched windows (LatheGeometry arches) |
| `guard_tower` | 3×3 cylinder, 4 floors | Flat battlement | 4 BoxGeometry battlements at top |
| `well` | CylinderGeometry surround | Pitched mini-roof | Bucket on string |
| `market_cross` | Single column | Cross-arm | Stone plinth base |

**Material palette for buildings:**
```typescript
// Seeded slight hue variation per settlement so each village has its own character
const WALL_STONE  = new THREE.MeshStandardMaterial({ color: 0x9a8870, roughness: 0.9 });
const WALL_TIMBER = new THREE.MeshStandardMaterial({ color: 0x7a5c3a, roughness: 0.85 });
const ROOF_THATCH = new THREE.MeshStandardMaterial({ color: 0xc8a860, roughness: 0.95 });
const ROOF_SLATE  = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.8 });
```

---

### Phase OW-5 — Settlements: Villages, Towns & the City

**Goal:** Place 2–6 villages, 1–3 towns, and one city in the world. Each settlement
has a distinct road layout, building mix, and a named identity. Roads connect buildings
to a central focal point. Settlements avoid water tiles, steep terrain, and each other.

> **Gemini insight:** "Use a Poisson Disk Sampling algorithm to generate evenly spaced
> town center coordinates. From that center, use a BFS or A* to snake roads outward and
> place house tiles along those roads."
> **Oskar Stålberg (Townscaper):** "Small rule sets on how tiles connect produce
> organic-looking results that would be impossible to hand-author."

#### Research checkpoint
- [ ] **Research:** A* pathfinding for road generation between building slots. The terrain
  grid already has `walkable` flags — run A* from settlement center outward to each planned
  building slot. Flatten the cost of moving through existing road tiles (cost = 0.5×) to
  encourage roads to share paths (producing the natural "main street + side alleys" topology
  of real villages).
- [ ] **Research:** "Procedural fantasy village/city names". Look at Donjon.bin.sh's name
  generator source and Watabou's Fantasy City Generator for naming conventions. Key insight:
  language-feel names come from phoneme tables, not word tables. Build a small phoneme list
  (consonants, vowels, endings) and combine via PRNG for distinct-sounding names.
- [ ] **Research:** Martin O'Leary "Generating Fantasy Maps" (`mewo2.com/code/terrain`).
  Read specifically the section on town placement — towns appear at coastal meeting points,
  river fords, and road intersections. Our terrain doesn't have coasts but we can use
  *river fords* (flat-elevation river-crossing points) and *biome boundaries* as preferred
  settlement locations.

#### Tasks

**`src/world/SettlementGenerator.ts`** — new file:
```typescript
export type SettlementType = 'village' | 'town' | 'city';

export interface SettlementPlan {
  type:        SettlementType;
  name:        string;
  centerCol:   number;
  centerRow:   number;
  buildings:   PlacedBuilding[];  // { type, col, row, rotation, seed }
  roads:       RoadSegment[];     // { col, row, direction: N|S|E|W }
  population:  number;            // affects NPC count in OW-6
}

export function planSettlement(
  type: SettlementType, centerCol: number, centerRow: number,
  seed: number, grid: WorldGrid
): SettlementPlan;

export function applySettlementToGrid(plan: SettlementPlan, grid: WorldGrid): void;
```

**Settlement size rules:**

| Type | Buildings | Road pattern | Focal feature | NPC count |
|------|-----------|-------------|---------------|-----------|
| Village | 5–10 | Ring road + central well | `well` or `market_cross` | 6–12 |
| Town | 15–25 | Grid of 2–3 streets | Tavern + `market_cross` | 20–40 |
| City | 50–80 | District blocks with plazas | `city_hall` + `temple` + inner walls | 80–150 |

**Settlement placement algorithm:**
1. Filter `WorldGrid` cells to find flat (`elevation 0.2–0.5`), non-water, biome
   `'grass' | 'forest'` cells at least 60 tiles from the world edge.
2. Prefer cells adjacent to a river tile (ford crossing points). Weight: adjacent
   river cell → placement weight ×2.5.
3. Run Poisson-disk on qualifying cells with `minDist = 80 tiles` for city,
   `50 tiles` for towns, `30 tiles` for villages. Ensures settlements don't crowd.
4. For each selected center, call `planSettlement()`.

**Road generation algorithm:**
1. For each building slot in the settlement plan, run A* from the settlement center
   to the building grid position, using `WorldCell.elevation` as traversal cost (prefer flat).
2. Mark all tiles along A* paths as `feature: 'road'`.
3. Road tiles get a flat `BoxGeometry` quad 2u wide, slightly above terrain, rendered via
   `THREE.InstancedMesh` (all road tiles share one instance draw).

**Settlement naming:**
```typescript
// phoneme-table approach: 3 consonant tables + 2 vowel tables + 4 suffix tables
// e.g. "Veln" + "ast" = "Velnast" (village), "Mar" + "haven" = "Marhaven" (town)
// city always gets a grander name: "The" + adjective + noun ("The Silver Gate", "Dawnreach")
```

**`OverworldScene.ts` additions:**
- [ ] Read `WorldData.settlements` and for each `SettlementEntry`, call
  `planSettlement()` → `applySettlementToGrid()` during world build.
- [ ] For each `PlacedBuilding` in settlement plans: call `generateBuilding(type, seed)`,
  position the returned `THREE.Group` at `gridToWorld(col, row)`, add to scene.
- [ ] Settlement name billboard: a `PlaneGeometry` text-plane floats above the settlement
  center at y+6, visible from 30u away, fades out on approach below 8u.
- [ ] Road `THREE.InstancedMesh`: one instance pool for all road tiles in the world, updated
  once after all settlements are generated.

---

### Phase OW-6 — NPC Inhabitants

**Goal:** Each settlement is inhabited by NPCs that move around, have creature-creator
DNA-generated appearances, and respond to the player with template dialogue referencing
actual world data (nearest river, settlement name, faction, events).

> **Gemini insight:** "Component-Based Dialogue — Break dialogue down into structural strings
> that pull variables directly from your generated world grid and NPC traits:
> 'Greetings, traveler. I am [Name], a humble [Occupation] of [VillageName]. Ever since
> the [Faction] blocked the [NearestRiverName] to the [Direction], we have been desperate.'"
>
> **Creature creator bridge:** NPCs use the same `buildCreature(dna, scene)` pipeline
> already in `CreatureBuilder.ts`. Their DNA is seeded from their position hash,
> filtered by their settlement type (city NPCs look more elaborate; village NPCs simpler).

#### Research checkpoint
- [ ] **Research:** Simple procedural NPC schedules in browser games. A minimal schedule
  system needs only 3 states: `wander` (pick random waypoint within home radius, walk to it),
  `idle` (stand 3–5 seconds), `interact` (face player, play dialogue). No calendar needed
  for OW-6. Search "simple NPC wander state machine javascript game".
- [ ] **Research:** Name generation for NPCs. Look at `tracery.io` — Kate Compton's grammar
  expansion library (JavaScript, ~3KB). It supports recursive substitution: `{first_name}`
  → picks from a list, `{occupation}` → picks from a role list. This is the right tool
  for NPC name + greeting generation. Evaluate adding it as a dependency vs rolling a
  simpler table-based version (200 lines of code vs a dependency).

#### Tasks

**`src/world/NPCDnaGenerator.ts`** — new file:
```typescript
import type { CreatureDNA } from '@/creatures/CreatureDNA';

export type NPCRole = 'merchant' | 'guard' | 'citizen' | 'scholar' | 'innkeeper' | 'blacksmith';

// Generates a CreatureDNA seeded from the NPC's position + settlement seed.
// Role affects allowed props and face types (guard → armor_light, angry face;
// scholar → robe, gaunt/ancient face; merchant → crown, neutral; etc.)
export function npcDna(col: number, row: number, settlementSeed: number, role: NPCRole): CreatureDNA;

// Generates a display name for an NPC from seeded phoneme tables.
export function npcName(seed: number): string;
```

**`src/world/NPCDialogue.ts`** — new file:
```typescript
export interface DialogueContext {
  npcName:        string;
  npcRole:        NPCRole;
  settlementName: string;
  settlementType: SettlementType;
  nearestRiverDir?: 'north' | 'south' | 'east' | 'west';
  nearestDungeonName?: string;
  nearestDungeonDir?: string;
  worldEventGossip?:  string;  // from OW-8 world history
}

// Returns 1–3 sentences of dialogue from template tables, filled with context.
export function generateGreeting(ctx: DialogueContext, seed: number): string;
export function generateQuestHint(ctx: DialogueContext, seed: number): string;
```

Dialogue template examples:
```
Greeting (merchant):
  "Fine goods today, traveler! I come from {settlementName} and rarely venture far from
  {nearest river or road}. Watch your coin purse near {nearest dungeon name} though."

Greeting (guard):
  "Move along. {settlementName} has enough trouble without strangers lurking about.
  Heard there's something stirring in {dungeon name} to the {direction}."

Greeting (citizen):
  "Oh! A visitor! We don't get many this far {direction}. Have you come from the {biome} lands?"
```

**`src/world/NPCEntity.ts`** — new file:
```typescript
export class NPCEntity {
  readonly dna:  CreatureDNA;
  readonly name: string;
  readonly role: NPCRole;
  readonly settlementId: number;

  // Position + home radius
  private _homeCol:  number;
  private _homeRow:  number;
  private _wanderRadius: number;  // tiles

  // FSM
  private _state:   'wander' | 'idle' | 'interact';
  private _target:  THREE.Vector3 | null;
  private _idleTimer: number;

  // Three.js
  private _group:   THREE.Group;  // from buildCreature(dna)
  private _label:   THREE.Mesh;   // name billboard, shows on proximity

  enter(scene: THREE.Scene, physics: PhysicsWorld): void;
  exit(scene: THREE.Scene, physics: PhysicsWorld): void;
  update(dt: number, playerPos: THREE.Vector3): void;

  // Called when player presses [E] within 2.5u
  interact(): string;  // returns dialogue string
}
```

**`NPCEntity.update()` FSM:**
- `wander`: if no target or target reached, pick a new random tile within `_wanderRadius`
  of home. Walk toward it at 0.8 u/s using simple `position.lerp(target, 0.015)`.
  If player within 6u → switch to `interact`.
- `idle`: wait `idleTimer` seconds (2.5–5.0, seeded), then pick `wander` or remain `idle`.
- `interact`: face player (`lookAt(playerPos)` on Y-axis only), show label, wait for
  `[E]` press (within 2.5u). On `[E]`: open dialogue panel. If player moves > 6u → back
  to `wander`.

**`OverworldScene.ts` additions:**
- [ ] For each settlement in `WorldData.settlements`, instantiate `NPCEntity` objects
  based on `SettlementEntry.population`. Split roles by type: village = 70% citizen,
  20% merchant, 10% guard; town = 50% citizen, 20% merchant, 15% guard, 15% innkeeper;
  city = 40% citizen, 20% merchant, 20% guard, 10% scholar, 10% innkeeper.
- [ ] NPC `Three.Group` from `buildCreature(dna)` — NPCs are full 3D creatures from the
  creature creator. Keep `global` proportion at `0.7×` for NPCs (slightly shorter than
  player character so the player reads as heroic).
- [ ] Dialogue panel: reuse existing `InteractableSystem.ts` proximity detection (`[E]` at 2.5u).
  Open a simple parchment panel (reuse `BookReader.ts` styling) with the NPC name header
  and 2–3 lines of generated dialogue.
- [ ] Distance culling: NPCs beyond 80u from player are updated at 10Hz instead of 60Hz
  (skip `update()` calls via frame-count modulo). NPCs beyond 150u are frozen entirely
  (no position updates, no physics).

---

### Phase OW-7 — Minimap & Discovery Tracking

**Goal:** A 2D minimap in the HUD shows the world at a glance: explored regions,
dungeon entrance markers, settlement markers, the player position. Unexplored areas
are dark (fog of war).

#### Research checkpoint
- [ ] **Research:** Canvas-based minimap patterns in browser games. The canonical approach:
  maintain an `OffscreenCanvas` matching the world grid dimensions (1px per tile). Paint
  biome colors per tile on generation. Draw a circle of "revealed" pixels around the player's
  position each frame (using `ctx.arc` + composite fill). Render this canvas as a
  `THREE.CanvasTexture` on a billboard `PlaneGeometry` in screen space, OR as an HTML
  `<canvas>` element overlaid on the 3D canvas with `position: absolute`.
  **Decision: HTML overlay canvas** — simpler, zero GPU cost, no shader needed.

#### Tasks

**`src/ui/Minimap.ts`** — new file:
```typescript
export class Minimap {
  private readonly _canvas:  HTMLCanvasElement;  // 200×200px HTML overlay
  private readonly _ctx:     CanvasRenderingContext2D;
  private readonly _fogMap:  Uint8Array;         // [row * worldSize + col] → 0–255 opacity
  private readonly _baseImg: ImageData;          // baked biome colors

  constructor(grid: WorldGrid, container: HTMLElement);

  // Call once per frame with player world position
  update(playerWorldX: number, playerWorldZ: number, discoveries: DiscoveryTracker): void;

  // Mark a circular region as revealed (called by OverworldScene on player move)
  reveal(col: number, row: number, radiusTiles: number): void;

  dispose(): void;
}
```

**`src/world/DiscoveryTracker.ts`** — new file:
```typescript
// Persisted to localStorage
export class DiscoveryTracker {
  discoveredDungeons:   Set<number>;   // by DungeonEntry.id
  discoveredSettlements: Set<number>;  // by SettlementEntry.id
  revealedCols: Uint8Array;            // bitfield: 1 = column range revealed

  markDungeonFound(id: number): void;
  markSettlementFound(id: number): void;
  serialize(): string;
  static deserialize(s: string): DiscoveryTracker;
}
```

**Minimap rendering:**
- Bake world grid to `ImageData` on world load (1px per tile, biome color).
- Water = `#2255aa`; grass = `#5a9a40`; forest = `#2a5a20`; highland = `#8a8060`;
  road = `#c0a870`; bog = `#3a4a20`.
- Fog of war: unreveal tiles draw at 15% opacity.
- Player dot: white 3px circle at player tile position.
- Dungeon markers: red `×` at each entrance; turns gold after discovery.
- Settlement markers: white diamond `◇`; turns bright white after discovery.
- Minimap frame: circular clip mask, dark border, positioned bottom-left of HUD.

**HUD integration (`src/ui/HUD.ts`):**
- [ ] Add minimap canvas element to the existing HUD container.
- [ ] Call `minimap.update()` each frame from `HUD.update()`.
- [ ] `[M]` key toggles minimap between small (100px) and large (300px) overlay modes.
- [ ] Minimap hidden during dungeon interiors (replaced by floor-plan view TBD).

---

### Phase OW-8 — World History & NPC Lore

**Goal:** When the world is generated, simulate 50 turns of history that produce named
factions, events, and local knowledge. NPCs near those events know about them and
reference them in dialogue — making the world feel like it has a past.

> **Gemini insight:** "When your world generator finishes creating the map, simulate 50 turns
> of history via code. Generate a World History State. Distribute Knowledge: populate NPCs
> with local knowledge based on their position. An NPC in Village B will have a high Anger
> trait toward Village A and might offer a quest to sabotage their crop tiles.
> Dynamic Dialogue Injection: when the player talks to any NPC in the region, the dialogue
> script queries the global event log to inject local gossip."

#### Research checkpoint
- [ ] **Research:** Caves of Qud world history generation (its "history" system generates
  cults, historical figures, and ruins). Search for "caves of qud procedural history algorithm"
  or watch Brian Bucklew's GDC talk. The key technique: each "turn" of simulation, each
  faction takes one action; actions write to a persistent event log; NPCs query the log
  for events near their home position.
- [ ] **Research:** `tracery` library (Kate Compton, GitHub: galaxykate/tracery). It's a
  grammar expansion library (~6KB minified) that produces varied text from nested rule tables.
  Perfect for faction names, event descriptions, and NPC gossip lines.
  Evaluate: add as npm dependency vs inline a minimal version (50 lines for basic expansion).

#### Tasks

**`src/world/WorldHistory.ts`** — new file:
```typescript
export type FactionType = 'mages_guild' | 'merchants' | 'bandits' | 'forest_spirits' | 'undead_cult';

export interface WorldFaction {
  id:       number;
  name:     string;  // e.g. "The Crimson Sigil" (seeded name from phoneme tables)
  type:     FactionType;
  homeSettlementId: number;
  strength: number;  // 0.0–1.0
}

export type HistoryEventType =
  | 'settlement_founded'
  | 'dungeon_discovered'
  | 'faction_raid'
  | 'monster_sighting'
  | 'river_flooding'
  | 'trade_route_established'
  | 'magical_anomaly';

export interface HistoryEvent {
  turn:       number;   // 0–49
  type:       HistoryEventType;
  col:        number;   // location on grid
  row:        number;
  factionA?:  number;   // faction id, if applicable
  factionB?:  number;
  description: string;  // pre-generated prose snippet
}

export function simulateWorldHistory(data: WorldData, seed: number): { factions: WorldFaction[]; events: HistoryEvent[] };
```

**History simulation algorithm (50 turns):**
1. **Turn 0–5 (Founding):** For each settlement, emit `settlement_founded` events.
   For each dungeon, emit `dungeon_discovered` by a random nearby faction.
2. **Turn 6–25 (Early Conflict):** Each faction with strength > 0.5 has a 20% chance
   per turn to raid a neighboring settlement (distance < 60 tiles). Raided settlement
   loses 0.1 strength. Emit `faction_raid` event with location.
3. **Turn 26–40 (Trade):** Random pairs of settlements within 80 tiles establish
   `trade_route_established` events. Mark road tiles between them as upgraded.
4. **Turn 41–49 (Anomaly):** 3 random dungeon sites get `magical_anomaly` events
   (increases dungeon "danger" rating, mentioned by nearby NPCs).
5. **River flooding:** Any river that grew by >4 tiles this turn emits `river_flooding`
   affecting nearby bog-biome tiles.

**Wiring history into NPCs:**
- Each `NPCEntity` is assigned a radius of historical "knowledge" (guards: 60 tiles,
  citizens: 40 tiles, scholars: 80 tiles) when created.
- `generateGreeting()` and `generateQuestHint()` in `NPCDialogue.ts` accept a
  filtered list of `HistoryEvent[]` within the NPC's knowledge radius.
- Gossip injection: if a `faction_raid` event happened within 40 tiles in the last
  20 turns → NPC mentions it. If a `magical_anomaly` within 60 tiles → NPC warns of danger.

---

### Phase OW-9 — Procedural Quests (Foundation)

**Goal:** Lay the groundwork for content-connected quests that emerge from the world
state rather than being hardcoded. Quests reference actual world locations and factions.

> **Gemini insight:** "Use Goal-Oriented Action Planning (GOAP). Give an NPC a Desire
> (has_food: true) and a world state (village_is_starving: true). The code looks at available
> actions (Hunt, Trade, Steal) and maps out a sequence of objectives for the player.
> Context Awareness: if the algorithm chooses Hunt, it queries your terrain grid for the
> nearest 'Forest' tile, spawning quest targets there."

**Note:** Full GOAP implementation is a large system. This phase covers the data schema
and basic quest types only. Complex GOAP planning is deferred to a future phase.

#### Tasks
- [ ] `src/world/QuestDef.ts` — quest data schema:
  ```typescript
  export type QuestType = 'clear_dungeon' | 'deliver_item' | 'escort_npc' | 'find_location' | 'investigate';
  export interface QuestDef {
    id: string; title: string; type: QuestType;
    giver: number;  // NPCEntity id
    target: { type: 'dungeon' | 'settlement' | 'grid_cell'; id: number; col: number; row: number; };
    reward: { gold: number; xp: number; reputationFactionId?: number; };
    description: string;  // template-filled from WorldHistory + NPC context
  }
  ```
- [ ] Quest generation: on first interaction with any `NPCRole.guard`, `NPCRole.merchant`,
  or `NPCRole.scholar`, generate 1 available quest for that NPC from world state.
  - `guard` → `clear_dungeon` for nearest undiscovered dungeon within 100 tiles.
  - `merchant` → `deliver_item` to nearest other settlement along an established trade route.
  - `scholar` → `find_location` for nearest `magical_anomaly` event site.
- [ ] `src/ui/QuestLog.ts` — `[Q]` key opens parchment panel listing active quests with
  their target locations. Each quest shows a small minimap pin.
- [ ] Quest completion detection: on dungeon cleared / settlement reached / anomaly cell
  stepped on → fire `QuestSystem.checkCompletion(questId)`.
- [ ] Quest reward delivery: add gold to `Inventory.ts`, XP to `ProgressionSystem.ts`.

---

## Implementation Order

```
OW-1 (World scale + config + dev UI)   ← Do first — foundational architecture
OW-2 (Rivers + lakes)                  ← Do second — depends on WorldGrid from OW-1
OW-3 (Dungeon entrances)               ← Can start alongside OW-2 (uses WorldGrid)
OW-4 (Building vocabulary)             ← Parallel with OW-2/OW-3 (no dependencies)
OW-5 (Settlements)                     ← After OW-4 (needs building generators)
OW-6 (NPC inhabitants)                 ← After OW-5 (needs settlement plans + creature creator)
OW-7 (Minimap + discovery)             ← After OW-1 (needs WorldGrid); can do early
OW-8 (World history + lore)            ← After OW-5 + OW-6 (needs settlements + NPCs)
OW-9 (Procedural quests foundation)    ← After OW-6 + OW-8 (needs NPCs + history)
```

---

## Design Principles

1. **Logic grid first, render second.** All world generation produces a `WorldGrid` (pure
   data). Rendering reads from that grid. Nothing in Three.js mesh code should contain
   generation logic.
2. **Generate once, reuse always.** `WorldData` is generated once at new-game time and
   serialized to the save slot. No regeneration between sessions. The world is persistent.
3. **Seed everything.** Every random decision — terrain, river paths, settlement positions,
   building layouts, NPC DNA, history events, names — is derived from the master seed.
   The same seed always produces the same world.
4. **InstancedMesh for tiles.** Any tile type with more than 50 instances uses
   `THREE.InstancedMesh`. Never create individual `THREE.Mesh` objects for terrain tiles,
   road tiles, or uniform building wall segments.
5. **Chunk-load for performance.** Only the 9-tile-chunk neighbourhood around the player
   is rendered. Chunks beyond the render radius have their meshes disposed. NPC updates
   are distance-throttled.
6. **No blocking generation.** World gen must complete in < 500ms for a 256×256 world.
   Profile during OW-1 implementation and use `requestIdleCallback` slicing if needed.
7. **Buildings are not dungeons yet.** For OW-4/OW-5, buildings are exterior-only shell
   meshes. Interior generation for buildings (inn rooms, tavern interior) is a Phase 8
   living world concern.
8. **NPCs are creatures.** They use `buildCreature(dna)` from the existing creature creator
   pipeline. No separate NPC mesh system. This keeps visual consistency and lets the creature
   creator system justify its existence in gameplay terms.
9. **Don't duplicate TODO.md scope.** Resource nodes (ore/timber/essence), base building,
   crafting, and the talent system all live in TODO.md Phase 7. This plan adds world-level
   structure (rivers, settlements, dungeons, NPCs) but does not define resource node
   placement (leave that for Phase 7e to add on top of the WorldGrid).
10. **History is flavor, not constraint.** World history events generate gossip and quest
    hooks but do not hard-gate gameplay. A player can ignore all lore and still play normally.

---

## Key References & Libraries (from Gemini research consultation)

### World Generation
| Reference | Relevance |
|-----------|----------|
| RedBlobGames — "Making maps with noise functions" (`redblobgames.com`) | OW-1 terrain biomes, elevation octaves |
| RedBlobGames — River generation + hexagonal grids | OW-2 hydrology |
| Martin O'Leary "Generating Fantasy Maps" (`mewo2.com/code/terrain`) | OW-5 settlement placement at terrain features |
| Oskar Stålberg — Townscaper / Bad North talks (YouTube) | OW-4/OW-5 building tile adjacency, WFC-lite roads |
| `mxgmn/WaveFunctionCollapse` (GitHub) | OW-5 road tile connectivity rules |
| `BorisTheBrave/DeBroglie` (GitHub, C# — concepts apply) | OW-5 advanced WFC with path constraints |
| Paul Bourke — Marching Cubes reference | OW-2 (lake boundary smoothing, optional) |

### NPC & Quest Systems
| Reference | Relevance |
|-----------|----------|
| `galaxykate/tracery` (npm) | OW-6/OW-8 dialogue + name generation |
| `bkaradzic/goap` (GitHub, C++ — concepts apply) | OW-9 quest generation via GOAP |
| "Missions and Spaces" — Joris Dormans (paper) | OW-9 quest graph → dungeon layout relationship |
| Caves of Qud procedural history (GDC talk, Brian Bucklew) | OW-8 history simulation |

### Three.js / Performance
| Library | Use |
|---------|-----|
| `THREE.InstancedMesh` (built-in) | OW-1/OW-4/OW-5 tile rendering — non-negotiable |
| `THREE.BufferGeometryUtils.mergeGeometries()` (built-in) | OW-2 water mesh, OW-4 building wall merging |
| `THREE.LatheGeometry` (built-in) | OW-4 building roofs (already planned in CC-11) |
| `OffscreenCanvas` + `THREE.CanvasTexture` (built-in) | OW-7 minimap base image |
| `poissonDisk.ts` (existing) | OW-1/OW-3/OW-5 feature placement |
| `prng.ts` `mulberry32` (existing) | All seeded generation |
| `SimplexNoise.ts` + `fbm()` (existing) | OW-1 terrain, OW-2 river source selection |
