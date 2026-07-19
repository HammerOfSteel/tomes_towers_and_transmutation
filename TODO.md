# TODO — Tomes, Towers & Transmutation
> **This is the single master source of truth for all implementation tasks.**
> Last updated: 2026-07-19
>
> Sub-trackers (reference only, do not add new tasks there):
> - `DEMO_RELEASE_TODO.md` — demo release phase detail (PC, B, C, D phases)
> - `ASSETS_TODO.md` — asset inventory + GLB manifest work
> - `ASSET_LEVEL_EDITOR_TODO.md` — level editor feature detail
> - `CREATIVE_MODE_TODO.md` — creative/DevLab mode detail
> - `FEATURE_BOT_V1_TODO.md` — automated bot testing
>
> Design docs (architecture + research, not todos):
> - `docs/research_village_generation.md` — settlement + overworld gen research
> - `docs/OVERWORLD_PLAN.md` — overworld architecture reference
> - `GDD.md` — game design doc
> - `docs/WORLD_DESIGN.md` — world + lore design

---

## Floor Visual Design Pass ✅ COMPLETE
> Full per-floor plan → **[FLOOR_DESIGN_PLAN.md](FLOOR_DESIGN_PLAN.md)**

### Global systems
- [x] UV tiling fix + `makeFloorPlanksTexture` (wood floors 1, 3, 6)
- [x] Circular border ring in `BlueprintRenderer` (per-floor trim colours)
- [x] Torch fire mesh replacement (crossed PlaneGeometry quads + PointLight per candelabra)
- [x] Bookshelf rotation fix in TowerGenerator (face inward per wall arc)

### New textures
- [x] `makeAlchemyStoneTexture` (F-1) · `makeHeraldStoneTexture` (F0)
- [x] `makeDampStoneTexture` (F2) · `makeScorchedStoneTexture` (F4)
- [x] `makeGrassTexture` (F7) · `makeSealedStoneTexture` (F8) · `makeCelestialStoneTexture` (F9)

### New props
- [x] `buildPotionRack` · `buildDistillationCoil` · `buildReadingTable` · `buildGlobe`
- [x] `buildFermentingVat` · `buildHerbBundle` · `buildAnvil` · `buildCoolingTrough`
- [x] `buildBunk` · `buildMessTable` · `buildMapTable` · `buildWeaponStand`
- [x] `buildPlantPot` · `buildRaisedPlanter` · `buildAstrolabe`

### Floor passes
- [x] Floor -1 (Alchemy) — amber voronoi texture + potion rack × 2 + distillation coil + rug
- [x] Floor 0 (Foyer) — herald flag-stone tile + grand rug + banners × 2
- [x] Floor 1 (Library) — oak planks + reading tables × 2 + globe + rug
- [x] Floor 2 (Brewing) — damp stone + fermenting vats × 2 + distillation coil + herb bundles × 2
- [x] Floor 3 (Chambers) — warm planks + bed + wardrobe + writing desk + star rug
- [x] Floor 4 (Forge) — scorched stone (heat-crack glow) + anvils × 2 + cooling troughs × 2
- [x] Floor 5 (Barracks) — stone + bunks × 4 + mess table
- [x] Floor 6 (War Room) — wood + map table + weapon stands × 4 + banner
- [x] Floor 7 (Garden) — patchy grass texture + raised planters × 2 + plant pots × 6
- [x] Floor 8 (Archive) — sealed blue-grey stone + containment ring (glowing ward)
- [x] Floor 9 (Observatory) — celestial star-speck stone + astrolabe + globes × 2 + rug

---

## Guiding Principles (locked)

| Decision | Detail |
|---|---|
| Playable character | Always an asset GLB — determined by campfire conversation, never DNA editor |
| NPC / Enemy appearance | DNA Creator tool inside DevLab — procedural DNA rig, not an asset |
| Environment art | Two parallel tracks; toggle in Settings (see below) |
| Sandbox / DevLab route | `/sandbox` = map editor + DNA creator + spawner + asset browser + cheats |
| Overworld generation | Code-first procedural by default; Kenney packs optional via Settings |
| Git LFS | All GLB / FBX / ZIP / MP3 tracked via LFS |

---

## Art System — Two Tracks

The game runs two parallel rendering tracks simultaneously. The player (and developer) can toggle between them in **Settings → Environment Art**.

| Track | What it covers | How to enable |
|---|---|---|
| **Code-First (Procedural)** | Trees, rocks, buildings, dungeon walls, enemies — all Three.js geometry + canvas shaders. Zero external files needed. | Default |
| **Asset-Based (Kenney)** | KayKit / Kenney GLB packs replace procedural geometry for trees, rocks, settlements, tower, dungeon entrances. | `WorldGenConfig.assetMode = 'kenney'` |

`WorldGenConfig.charMode` controls **character** rendering (always `'asset'` for the player).
`WorldGenConfig.assetMode` controls **environment** rendering.

- [x] `assetMode` field exists in `WorldGenConfig` (`'kenney' | 'code'`)
- [x] MainMenu Settings has a toggle and pack checkboxes
- [x] Make the toggle label clearer: "Environment Art: Procedural / KayKit Assets"
- [x] Persist `assetMode` to localStorage on every change (already done via `saveWg()` in every `change` handler)

---

## /sandbox Route — DevLab (unified tool)

The `/sandbox` route is the developer and creator workspace. Not accessible during normal play.
Enabled by **Dev Mode** toggle in Settings (amber UI).

| Tab | Current status | Purpose |
|---|---|---|
| **Cheats** | ✅ Full parity with DevPanel | God mode, HP, spells, kill all, teleport, fly, fast travel |
| **Asset Browser** | ✅ Lists all 77 GLBs | Browse + equip player model |
| **DNA Creator** | ✅ (was CharacterCreation) | Build NPC/enemy DNA rigs, save presets, live preview |
| **Spawner** | ✅ Wave config, live arena | Spawn enemies from NPC Gen presets; test AI |
| **Map Editor** | ✅ Level editor in-world (`~`) | Place tiles, export/import blueprint JSON |
| **Procedural Gen** | ⬜ Not yet tabbed in sandbox | Tower + dungeon generator preview, seed browser, save blueprint |

**Cleanup needed:**
- [ ] Rename `CharacterCreation` class + file → `DNACreator` (see below)
- [ ] Add "Procedural Gen" tab to DevSandbox: seed input → preview generated tower/dungeon → export blueprint
- [ ] The level editor (`~` key) works in-world but should also be launchable from the sandbox tab

---

## Rename: CharacterCreation → DNACreator

`src/ui/CharacterCreation.ts` still says "CharacterCreation" but it's purely an NPC/enemy DNA editor now.

- [x] Rename file: `src/ui/CharacterCreation.ts` → `src/ui/DNACreator.ts`
- [x] Rename class: `CharacterCreation` → `DNACreator`
- [x] Update imports: `main.ts` imports `CharacterConfig` from it; `CharacterCreationV2.ts` imports types
- [x] Update DevSandbox if it references the old name
- [x] `CharacterConfig` and `StartingBoon` types can stay in the same file (or move to a shared types file)

---

## Current Focus: Tower Prologue — First Quest Playable

The prologue beats are implemented in `StoryQuestLine.ts` (4 beats per species).
The `StoryRunner` advances them automatically via `tick()`.

### Beat mechanics (current)

| Beat | Type | Fulfils when | Status |
|---|---|---|---|
| tower_p1 — Explore ground floor | `survive_wave` | 3 kills | ✅ Works |
| tower_p2 — Find upper floor key | `survive_wave` | 3 more kills | ✅ Works |
| tower_p3 — Find workshop key | `survive_wave` | 3 more kills | ✅ Works |
| tower_p4 — Find the master key | `interact_key` | Pick up the workbench_key interactable | ✅ Works |

### What works
- [x] Story runner fires prologue intro as a centered toast on game start
- [x] Beat completion text shown after each beat
- [x] Quest log shows all 4 prologue beats with correct species flavor
- [x] RNG character name generated from species/class pool

### Gaps (blocking or near-blocking)
- [x] **Intro toast duration** — now 9 s (fades at 9 s, removed at 10.2 s)
- [x] **`explore_floor` beat type** — fulfils when player visits a new floor index; SceneManager tracks unique floors visited; all 12 prologue beats (p1/p2/p3 across 4 species) now use `explore_floor`
- [x] **Tower starting room** — `PLAYER_START_FLOOR_INDEX = 0`; player now spawns in the Grand Entrance Hall (floor 0) matching "Explore the ground floor" beat 1
- [x] **Locked front door** — `_towerPrologueDone` flag blocks `onExitTrigger` during prologue; unlocks when Act I begins (`onActBegin` title ≠ prologue)
- [x] **Master key item** — `interact_key` beat type added; `keysPickedUp` counter wired into `StoryRunner.tick()`; all 4 species `tower_p4` beats now use `interact_key` objective → fulfils when player picks up the `workbench_key` interactable in the basement

### Nice-to-have (not blocking)
- [x] Wizard's note on library telescope fixture: "Do not go to the basement" — `chamberExtraFixture` on `floor_library`; signed Arcanist Solmor
- [ ] Binding circle decal on ground floor (undead species: special lore message on interact)
- [x] Candidate profile page readable in basement — `chamberExtraFixture` lectern on `floor_alchemy` with Solmor's candidate archive + "Spare master key is on the workbench" note
- [ ] Per-species flavour text on staircase transition ("You find the key. The upper floor smells of old paper.")

---

## Next Up (after first quest)

### Act I — Story Arcs (all 4 species)
The existing acts (`human_act1`, `undead_act1`, etc.) have `survive_wave` and `reach_location` beats.
These work but need the same quality pass as the prologue once the prologue is solid.

- [ ] Human Act I: "Raiders massing" arc — needs an overworld battle event trigger
- [ ] Undead Act I: "Why am I moving?" arc — needs a lore-book readable in a dungeon
- [ ] Vulperia Act I: "Someone wants you dead" — needs a bounty NPC encounter
- [ ] Slime Act I: "What is this?" — needs a philosophy book interactable

### Wizard Character (Arcanist Solmor)
- [ ] Add Solmor as a WizardManifest entry (design his appearance separately from the campfire wizards)
- [ ] Post-prologue encounter: Solmor returns to the tower (triggered when player exits via master key)
- [ ] Dialogue tree for first meeting: `FloatingDialogue3D` + new `WizardDialogueTree`

### Interactable System Improvements
- [x] `interact_key` beat type — fulfilled when player picks up the `workbench_key` interactable; wired via `onKeyPickup` callback
- [x] `explore_floor` beat type — fulfils on staircase use (floor index change in SceneManager)
- [ ] `read_lore` beat type — fulfils when a specific book is read (BookReader fires)
- [ ] Locked door fixture — requires named key item to open; `LockedDoor` interactable

---

## World Editor (world-editor.html)

A dedicated standalone editor accessible via Dev Lab → World Editor.

### Completed ✅
- [x] **Asset Studio** — pick category & type (furniture/props/structures/lighting), configure parameters via sliders, pick primary + secondary colors, Randomize, Preview in 3D viewport, Save to Library
- [x] **Tower Room Editor** — visualise chamber floor grid, click to place/remove interactable markers by type, export as `chamberScatter` JSON, Save room layout to Library
- [x] **Building Studio** — select building type, size sliders, seed input, Generate + Randomize using `generateBuilding()`, Save to Library
- [x] **Library tab** — localStorage card browser for Assets / Buildings / Rooms; Load, Export JSON, Delete; bulk Export All / Import JSON
- [x] **New ProceduralProps builders**: `buildBed`, `buildTable`, `buildChair`, `buildWardrobe`, `buildCampfire`, `buildTelescope`

### Pending ⬜
- [x] Asset Studio: thumbnail rendering (offscreen renderer captures 170×110 JPEG at save time; displayed in Library cards)
- [ ] Tower Room Editor: render actual BlueprintRenderer geometry instead of colored block markers
- [x] Tower Room Editor: rotation gizmo for placed items (R key rotates; Pitch/Yaw/Roll sliders in right panel)
- [x] Tower Room Editor: drag-to-move placed items (XZ drag + Shift-drag for Y height; orbit lock during drag; right-click only deletes on-item)
- [ ] Overworld Editor tab: integrate `OverworldEditor` camera + controls into world-editor page
- [ ] Building Studio: custom width/depth/floors parameters fed into `generateBuilding()`
- [ ] Save button on main menu (in-game) exports full tower layout as JSON
- [ ] DNA Creator / Creature Creator: Spore-like body part editor — full 3D with limb drag handles, DNA randomizer, mutation, part categories (head/body/limbs/tail/wings), animation preview, save to NPC/enemy library

---

## Backlog (important but not urgent)

### Playable Character Roster
- [ ] Verify all 19 `CharacterId`s animate correctly (idle + walk via KayKit shared rig)
- [ ] `fox_rogue/ranger/mage/mysterious` — all use the same `fox/fox` model; custom models needed
- [ ] `zombie` → `skeletons_free/Skeleton` and `mystery_undead` → `fantasy_heroes/Necromancer` are placeholders
- [ ] 3D model generation prompts ready in `3D_MODEL_PROMPTS.md` — pending external tool runs

### Overworld Asset Pass (after gameplay content is solid)
- [ ] Replace procedural trees with KayKit nature-kit GLBs (`InstancedMesh`)
- [ ] Replace procedural rocks with Kenney rock variety set
- [ ] Water / river tiles from Kenney nature kit
- [ ] Settlement buildings from Kenney fantasy-town / retro-fantasy kits

---

## Phase 5 — Environment Asset Modules (World Skin System)

> **Goal:** Replace every piece of code-generated Three.js geometry (box walls, cylinder trees, sphere rocks) with real 3D asset tiles from the KayKit / Kenney packs — while keeping the code-first procedural path fully functional. A single Settings toggle (`WorldGenConfig.assetMode`) switches between the two tracks. The World Editor lets you preview, curate, and test asset sets before they go live.

### Why this phase matters
The procedural geometry gives us correct *structure* (correct room radius, correct floor count, correct tree density) but looks like boxes. The KayKit/Kenney packs include sloped tiles, arched ceilings, detailed props, and lit lanterns — swapping them in will make every environment look finished without touching the gameplay logic.

### 5.0 — Asset Inventory & Slot Mapping

Define every "slot" in each environment — the named hooks where procedural geometry currently lives — and map each slot to the best-matching asset from the extracted packs.

**Environment types and their slots:**

| Environment | Slots |
|---|---|
| **Tower (interior)** | floor_tile, wall_straight, wall_corner, wall_inner_corner, ceiling_tile, doorway_arch, staircase, pillar, column_cap |
| **Dungeon** | floor_tile, wall_straight, wall_corner, wall_T, ceiling_tile, doorway, arch, column, pit_edge, staircase_down |
| **Overworld terrain** | ground_flat, ground_slope_N/S/E/W, ground_slope_corner, cliff_face, water_flat, water_edge, sand, snow |
| **Overworld nature** | tree_oak, tree_pine, tree_dead, bush_small, bush_large, rock_small, rock_large, log, mushroom, flower |
| **Settlement** | building_house, building_shop, building_inn, building_temple, fence_straight, fence_corner, road_straight, road_corner, market_stall |

**Tasks:**
- [ ] **5.0.1** Create `src/world/assetSlots.ts` — export an `AssetSlotMap` type: `Record<EnvironmentType, Record<SlotName, string | null>>` where the value is a `/assets/…` path or `null` (= use code geometry)
- [ ] **5.0.2** Write a World Editor tab "**Tile Catalog**" that renders every item in `public/assets/manifest.json` in a grid with a live 3D preview thumbnail, then lets you drag it onto a slot in the slot map and Save. This replaces manual JSON editing.
- [ ] **5.0.3** For each environment type, do a manual curation pass in the Tile Catalog: open the pack (e.g. KayKit — Dungeon → Modular), preview each wall/floor tile, assign it to the correct slot
- [ ] **5.0.4** Verify asset scale: most KayKit assets are sized for a 1 m grid cell. Check tower floor radius (`CELL = 1.0`) vs. asset bounding box. Note any assets that need a default scale override in the slot map
- [ ] **5.0.5** Write `src/__tests__/assetSlots.test.ts`: every slot map entry either points to a real file in `public/assets/` or is `null`; no dangling paths

### 5.1 — Tower Room Asset Renderer

Replace the procedural floor/wall/ceiling geometry in the tower chamber renderer with asset tiles when `assetMode === 'kenney'`.

- [ ] **5.1.1** Create `src/world/TowerAssetRenderer.ts` — exports `renderTowerFloor(scene, floorDef, slotMap)` that places asset GLBs in a grid pattern matching the chamber radius; falls back to procedural geometry for any slot with `null`
- [ ] **5.1.2** Hook into existing chamber rendering: in the procedural tower generator, after the chamber mesh is built, check `WorldGenConfig.assetMode`. If `'kenney'`, call `TowerAssetRenderer.renderTowerFloor` instead
- [ ] **5.1.3** Implement tile instancing: use `THREE.InstancedMesh` for floor and wall tiles (same mesh, many positions) — prevents draw call explosion when placing 50+ identical floor tiles
- [ ] **5.1.4** Sloped ceiling and arched doorways: KayKit Dungeon has arch tiles. Wire the `doorway_arch` slot to the chamber exit direction so arches face the correct staircase direction
- [ ] **5.1.5** Wall lighting: when `assetMode === 'kenney'`, place torch/brazier assets from the `Lighting` subcat at regular intervals on walls (same positions as the procedural point lights)
- [ ] **5.1.6** Write `src/__tests__/towerAssetRenderer.test.ts`: given a known floorDef and a slotMap with mocked paths, assert the correct number of InstancedMesh instances are created for floor and wall slots; assert no instances are created for `null` slots

### 5.2 — Dungeon Asset Renderer

Same approach as 5.1 but for the dungeon crawler floors.

- [ ] **5.2.1** Create `src/world/DungeonAssetRenderer.ts` — renders dungeon corridor/room tiles from KayKit Dungeon pack
- [ ] **5.2.2** KayKit Dungeon has many modular pieces (wall straight, wall corner, T-junction, pit edge). Map the dungeon grid cell type (from the BSP/random-walk generator) to the correct tile variant
- [ ] **5.2.3** Pit / water tiles: some dungeon floors have gaps; use KayKit pit edge tiles at the correct boundary cells
- [ ] **5.2.4** Test: given a 5×5 dungeon grid, assert correct tile variant is chosen for straight walls, corner walls, and T-junctions
- [ ] **5.2.5** Smoke test: dungeon scene with `assetMode === 'kenney'` loads without Three.js errors (no missing texture warnings)

### 5.3 — Overworld Terrain Tiles

Replace the procedural heightmap mesh with tiled terrain assets and slope tiles.

- [ ] **5.3.1** Catalog sloped tiles: KayKit Forest Nature Pack has slope variants (identify and list them in the slot map). Kenney Nature Kit has ground tile variants too
- [ ] **5.3.2** Implement a `TerrainTileSelector` that maps a cell's height delta to its neighbours → outputs a tile variant name: `flat | slope_N | slope_S | slope_E | slope_W | slope_corner_NE | …`
- [ ] **5.3.3** Create `src/world/OverworldAssetRenderer.ts` — iterates overworld heightmap grid, classifies each cell with `TerrainTileSelector`, places correct tile asset at world position
- [ ] **5.3.4** Blend zones: cells at biome boundaries (e.g. grass→snow) should use transition tiles if the pack has them; otherwise fall back to the code-first mesh
- [ ] **5.3.5** Water tiles: KayKit Nature + Kenney Nature both have water tiles. At cells below a water threshold, place water asset tiles; animate UV scroll on water material (shader)
- [ ] **5.3.6** Test: `TerrainTileSelector` returns correct variant for every combination of 4-neighbour height delta patterns
- [ ] **5.3.7** Visual QA: fly-over the overworld in the World Editor with `assetMode = 'kenney'`; verify no visible seams or z-fighting between tiles

### 5.4 — Overworld Nature & Props

Replace procedural trees, rocks, bushes with GLB assets using `InstancedMesh` for performance.

- [ ] **5.4.1** `NatureAssetPlacer`: given a list of world positions (same positions the procedural placer would use), instantiate the correct GLB asset. Use 3-4 variants per category (tree_oak_A/B/C, rock_small/med/large) selected by seeded RNG to avoid repetition
- [ ] **5.4.2** LOD (Level of Detail): beyond a distance threshold, replace full GLB with a billboard sprite (rendered from the GLB in the World Editor). Keeps performance on large overworlds
- [ ] **5.4.3** Settlement buildings from Kenney Fantasy Town / Castle packs: replace procedural building boxes with real building GLBs. Building type → GLB is controlled by slot map
- [ ] **5.4.4** Test: given 100 tree positions, assert `InstancedMesh.count === 100`; assert seeded variant selection is deterministic

### 5.5 — Settings Toggle & Persistence

Clean up the existing `assetMode` toggle and make it stick.

- [ ] **5.5.1** Settings → Environment Art toggle: label `"Procedural (code-first)"` / `"Asset Packs (KayKit / Kenney)"` — update `GameMenu.ts` label
- [ ] **5.5.2** Persist `assetMode` to `localStorage` immediately on every change (currently it may only save on Settings close)
- [ ] **5.5.3** On `WorldGenConfig` load, read `assetMode` from `localStorage`; default to `'code'` if not set (so new players see working procedural world)
- [ ] **5.5.4** When `assetMode` is toggled mid-session, trigger a scene reload for the current environment (not a full page reload — just re-run the renderer for the active floor/zone)
- [ ] **5.5.5** Test: toggling `assetMode` in isolation updates `WorldGenConfig.assetMode`; localStorage is written; reading back returns the persisted value

### 5.6 — World Editor Integration

Bring asset-module authoring into the World Editor so you can see results visually before committing.

- [ ] **5.6.1** World Editor — **Tile Catalog tab**: grid of all manifest entries with a 3D thumbnail, pack/subcat filter chips, a search box, and a slot-assignment panel on the right. Clicking an entry assigns it to the selected slot. Saves to `AssetSlotMap` JSON in `localStorage` (exported and checked in to source)
- [ ] **5.6.2** Tower Room Editor — **"Asset Preview" toggle**: renders the floor using the asset slot map instead of colored boxes. Lets you see exactly what the room looks like with the real tiles before playing
- [ ] **5.6.3** Tower Room Editor — keyboard shortcut `A` switches between asset preview and placement grid
- [ ] **5.6.4** World Editor — **Overworld tab**: a 2D minimap of the overworld grid with a 3D viewport inset; toggle between code-first and asset-based rendering in real time
- [ ] **5.6.5** All World Editor changes persist asset slot assignments to `localStorage` with a named preset system (e.g. "Dark Tower", "Forest Dungeon") and an Export JSON / Import JSON button

### 5.7 — Tests & Quality Gates

Before shipping this phase, all of the following must be green.

- [ ] **5.7.1** `src/__tests__/assetSlots.test.ts` — every mapped path resolves to a real file ✓
- [ ] **5.7.2** `src/__tests__/towerAssetRenderer.test.ts` — correct instance counts for floor/wall tiles; null-slot fallback ✓
- [ ] **5.7.3** `src/__tests__/dungeonAssetRenderer.test.ts` — correct tile variant for every grid cell type ✓
- [ ] **5.7.4** `src/__tests__/terrainTileSelector.test.ts` — all height-delta patterns return a valid tile name ✓
- [ ] **5.7.5** `src/__tests__/natureAssetPlacer.test.ts` — 100 positions → InstancedMesh.count 100; seed determinism ✓
- [ ] **5.7.6** `src/__tests__/worldGenConfig.test.ts` — `assetMode` persistence round-trip via localStorage mock ✓
- [ ] **5.7.7** World Editor smoke test (`worldEditor.smoke.test.ts`) remains passing after Phase 5 HTML changes ✓
- [ ] **5.7.8** `npx vitest run` passes with 0 new failures; `npx tsc --noEmit` clean ✓

### Phase 5 entry criteria (start when)
- Prologue first quest is playable end-to-end (tower → basement → key)
- Asset manifest has been reviewed and slot assignments made in the Tile Catalog

### Phase 5 exit criteria (done when)
- `assetMode = 'kenney'` renders tower, dungeon, and overworld with no code-geometry fallback visible
- All 5.7 tests pass
- Settings toggle works and persists correctly
- Performance: overworld with `assetMode = 'kenney'` renders at ≥ 60 fps on a modern laptop (profile with Chrome DevTools before marking done)


### Audio
- [ ] Tower ambient: low stone hum, distant wind through arrow slits
- [ ] Staircase transition: brief audio sting when ascending/descending
- [ ] Key pickup SFX
- [ ] Locked door rattle SFX (when trying to exit without key)

### Save System
- [ ] `onSave` in GameMenu is a placeholder — wire to actual save-slot localStorage write
- [ ] Save: current floor, kill count, inventory, progression state, story beat index
- [ ] Load: restore all of the above on continue-game

---

## Overworld Studio Expansion

> **Branch:** `feature/overworld-studio`
> **Design + Research:** `docs/research_village_generation.md` → "EXPANSION PLAN" section
> **Architecture:** `docs/OVERWORLD_PLAN.md`
> **Principle:** Code-first always — no FBX/GLB for world gen. Asset packs are opt-in overlay only.

### Shipped (v0.3 — OW-A through OW-C complete, 2026-07-19) ✅
- [x] 7 layout types: organic, grid, linear, radial, terraced, perimeter, cluster
- [x] 9 factions — ward label remapping, unique palettes, layout prefs, ward composition
- [x] Road clearance — buildings never placed on roads
- [x] **OW-A**: Realm tab — multi-continent, biomes (10 types), rivers (downhill gradient), settlements + roads, contour lines, compass rose, cartographic renderer
- [x] **OW-A**: World shapes (Island/Continents/Archipelago/Pangaea), Climate (Tropical/Temperate/Arctic), Roughness, XL size (220×164)
- [x] **OW-A Planet view**: Orthographic sphere projection, per-pixel ImageData renderer, day/night terminator, diffuse lighting, ocean specular, atmosphere limb, cloud layer, polar ice caps, city lights, star field
- [x] **OW-B**: Dungeon tab — BSP floor plan renderer, 8 typed room categories, colour-coded floors, rich procedural generator
- [x] **OW-C**: Cave/Glade tab — CA cave (6 biomes structural differences), glade (5 biomes), canvas legend, size + density params

### OW-D — Dwelling Layer
> `InteriorGenerator.ts` already exists — renderer only

- [ ] **OW-D1** 2D floor plan renderer: walls, doors, furniture symbols, stair positions
- [ ] **OW-D2** Multi-floor navigation (floor selector)
- [ ] **OW-D3** Dwelling tab in Overworld Studio UI

### OW-E — Layer Navigation + WorldGen Integration
- [ ] **OW-E1** Tab strip navigation: click settlement on Realm → City view; dungeon entrance → Dungeon view
- [ ] **OW-E2** `OverworldScene.ts` reads `SettlementModel` JSON → 3D buildings at ward centres via `BuildingDNA`
- [ ] **OW-E3** Faction drives 3D building style in `OverworldScene`

---

## OW-F: Planet Studio — Polish, DNA & Solar System

> **Research sources:** Three.js Journey Lesson 38 (Earth Shaders) · RedBlobGames planet-generation · Three.js TSL Earth (webgpu_tsl_earth.html)
> **Key insight:** Use Three.js ShaderMaterial + IcosahedronGeometry for the planet view — not canvas 2D. The biome data becomes a CanvasTexture (day map), city lights become a second CanvasTexture (night map). This gives drag rotation, real-time animation, and GLSL shader quality.
> **Code-first always** — no texture assets. All planet visuals procedurally generated.

### OW-F1 — Planet Renderer v3: Three.js Sphere + GLSL

**Research spike (do first):**
- [ ] **OW-F1-R1** Study Three.js Journey Lesson 38 shader structure: vertex (position, normal, UV), fragment (day/night mix, twilight, specular, atmosphere rim)
- [ ] **OW-F1-R2** Confirm OrbitControls import from `three/examples/jsm/controls/OrbitControls.js` works in standalone html entrypoint (no react, no vite plugin)
- [ ] **OW-F1-R3** Test: embed secondary `THREE.WebGLRenderer` in same page as existing canvas — confirm no GPU context conflicts

**Implementation:**
- [ ] **OW-F1-1** `PlanetRenderer` class:
  - `THREE.WebGLRenderer` → writes to a `<canvas id="planet-canvas">` (overlay on the map canvas, shown only in planet view)
  - `THREE.Scene` + `THREE.PerspectiveCamera(45, 1, 0.1, 100)`
  - `IcosahedronGeometry(2, 6)` for sphere mesh
  - `OrbitControls` for mouse drag rotation
  - `requestAnimationFrame` loop while planet view is active; stops on tab switch
- [ ] **OW-F1-2** Procedural planet textures (generated from `RealmData`):
  - `buildDayTexture(data)` → 512×256 CanvasTexture: biome colours + elevation shading + ridge noise texture
  - `buildNightTexture(data)` → 256×128: black + amber dots at settlement positions (city lights)
  - `buildSpecularCloudTexture(data, seed)` → 256×128: R=ocean mask (specularity), G=multi-octave fBm cloud noise
- [ ] **OW-F1-3** Planet GLSL shader (fragment):
  - Day/night mix: `mix(dayColor, nightColor, smoothstep(-0.1, 0.2, sunDot))`
  - Twilight band: orange-red tint where `sunDot ∈ [-0.1, 0.2]`
  - Ocean specular: Phong from specular texture R channel
  - Cloud layer: mix with white using texture G channel
  - Atmosphere rim: `pow(1 - max(0, dot(normal, viewDir)), 3.0)` * atmosphereColor
- [ ] **OW-F1-4** Cloud sphere: second `IcosahedronGeometry(2.02, 6)`, `MeshStandardMaterial` with `alphaMap=cloudTexture`, `transparent=true`, rotates `0.05×` faster than planet
- [ ] **OW-F1-5** Atmosphere sphere: `IcosahedronGeometry(2.1, 6)`, custom shader with additive blending for rim glow (blue-white)
- [ ] **OW-F1-6** Star field: `THREE.Points` with `BufferGeometry` (2000 stars), custom fragment shader:
  - Soft circular disc sprite: `1 - smoothstep(0.3, 0.5, distance(vUv, vec2(0.5)))`
  - Twinkle: `brightness * (0.85 + 0.15 * sin(uTime * twinkleFreq + starId))`
  - Color temperature: `mix(vec3(0.6,0.7,1.0), vec3(1.0,0.9,0.7), rand(starId))`
- [ ] **OW-F1-7** Sun: `THREE.PointLight` + small glowing sprite in background (lens flare approach from Three.js docs)
- [ ] **OW-F1-8** `resize()` handler keeps planet renderer canvas in sync with layout

### OW-F2 — Planet DNA System

- [ ] **OW-F2-1** `PlanetDNA` interface (in `src/overworld-studio.ts`):
  ```
  type PlanetType = 'rocky'|'ocean'|'gas_giant'|'ice'|'volcanic'|'toxic'|'desert'|'verdant'|'dead'|'ringed'
  interface PlanetDNA { seed, type, size, atmosphereDensity, atmosphereColor, oceanCoverage, cloudCoverage, ringSystem, moons: MoonDNA[], faction? }
  interface MoonDNA { seed, size, orbitRadius, orbitSpeed, color }
  ```
- [ ] **OW-F2-2** `generatePlanetDNA(seed, type?)` → deterministic DNA from seed
- [ ] **OW-F2-3** Per-type visual presets for `buildDayTexture`:
  - `gas_giant`: horizontal banded stripes (no solid surface render)
  - `ice`: mostly white/blue, minimal land
  - `volcanic`: dark base + red/orange lava seas replacing oceans
  - `toxic`: desaturated with green/purple tint on atmosphere
  - `ocean`: 90%+ water coverage, tiny island chains
  - `dead`: greyscale, high elevation variation (craters)
- [ ] **OW-F2-4** Moon rendering: small orbit circle per moon (drawn in planet 3D scene)
- [ ] **OW-F2-5** Ring system: `THREE.RingGeometry` with gradient alpha texture
- [ ] **OW-F2-6** Planet type pills in UI; 🎲 generates a random PlanetDNA

### OW-F3 — Solar System Tab

> **5th studio tab: ☀ Solar System**

- [ ] **OW-F3-R1** Research: Kepler orbital mechanics simplified for top-down 2D view (no physics sim needed — just orbital period formula for display)
- [ ] **OW-F3-R2** Research: How to render convincing gas giant band shader in Canvas 2D vs Three.js sphere (same per-pixel ImageData technique but with horizontal bands instead of biome lookup)

**Generator `generateSolarSystem(seed)`:**
- [ ] **OW-F3-1** Star DNA: spectral type (O/B/A/F/G/K/M) → size multiplier (0.3-4.0), color (blue→orange→red), luminosity; seeded from `seed`
- [ ] **OW-F3-2** Planet placement: Titius-Bode-inspired spacing `r[i] = 0.4 + 0.3 × 2^i` + seed jitter; 4-9 planets
- [ ] **OW-F3-3** Planet type by zone: inner (hot) = rocky/volcanic/desert; mid (habitable) = rocky/ocean/verdant; outer (cold) = ice/gas_giant/ringed
- [ ] **OW-F3-4** Tower planet: always at position 3-4 (habitable zone); its PlanetDNA drives the realm/settlement content
- [ ] **OW-F3-5** Asteroid belt: between inner and outer zones; ring of 80-200 tiny dots
- [ ] **OW-F3-6** Comet DNA: 1-3 comets with high eccentricity orbit (0.7-0.95); visible near perihelion

**Renderer `drawSolarSystem(data, canvas)`:**
- [ ] **OW-F3-7** Dark nebula background (fBm noise in soft pastels, very subtle)
- [ ] **OW-F3-8** Central star: multi-layer radial gradient (hot core → corona), animated flicker via `requestAnimationFrame`
- [ ] **OW-F3-9** Orbital paths: thin semi-transparent ellipses
- [ ] **OW-F3-10** Planet circles: sized by `PlanetDNA.size`, coloured by type palette, small glow
- [ ] **OW-F3-11** Gas giants: mini banded texture rendered into a circle (canvas ImageData in miniature)
- [ ] **OW-F3-12** Moons: tiny dots orbiting planet circles
- [ ] **OW-F3-13** Asteroid belt: ring of `Math.sin(angle + seed)*jitter` dots
- [ ] **OW-F3-14** Comets: tiny oval + animated tail gradient line
- [ ] **OW-F3-15** Tower planet highlighted: `⬡` symbol + golden ring
- [ ] **OW-F3-16** Animation loop: planets orbit in real-time at correct relative speeds
- [ ] **OW-F3-17** Click planet → switches to Planet view + loads that planet's DNA
- [ ] **OW-F3-18** Hover tooltip: planet name, type, distance from star

### OW-F4 — Full Drill-Down Chain

```
☀ Solar System  →  click planet
🌍 Planet view  →  click "Map" button
🗺 Realm map    →  click settlement dot
🏙 Settlement   →  click dungeon/cave entrance
⚔ Dungeon / 🌿 Cave
```

- [ ] **OW-F4-1** Breadcrumb nav bar (shows current level, back button at each level)
- [ ] **OW-F4-2** Solar System → Planet: stores selected `PlanetDNA` + generates matching `RealmData`
- [ ] **OW-F4-3** Planet → Realm: "View Surface Map" button; faction-coloured settlements from `PlanetDNA.faction`
- [ ] **OW-F4-4** Realm → Settlement: click settlement dot → run city generator with matching faction+seed

---

## Completed ✅
- [x] `hudTheme.ts` CSS variable design system
- [x] HUD spell glyphs, potion slots, buff bar, party strip
- [x] StatPanel, SpellBook, CraftingUI, MerchantUI
- [x] QuestLog split (story vs world quests)
- [x] ObjectiveTracker (bottom-right persistent objective)
- [x] QuestAcceptModal
- [x] NPCEntity dialogue theme + role badge + multi-page
- [x] ControlsOverlay (`[H]`)
- [x] GameMenu (ESC hub — WoW style, tabbed sidebar)

### Story
- [x] `StoryQuestLine.ts` — per-species 4-act narrative chains
- [x] Tower prologue act (4 beats) prepended to all 4 species
- [x] `STORY_DESIGN.md` — full wizard lore, Stockholm arc, Arcanist Solmor design
- [x] `NameGenerator.ts` — RNG names, per-class fragment pools, species helpers

### Campfire Intro
- [x] `FloatingDialogue3D.ts` — 3D canvas-texture speech + choice planes
- [x] `NewGameFlow.ts` — campfire scene orchestration
- [x] `CharacterDecisionTree.ts` — 4-species × 4-branch tree → locks character + stats
- [x] Campfire music, wizard gestures, ember particles, camera drift

### Core Game Systems (Phases 1–9)
- [x] Isometric sandbox, physics, WASD, combat, spells, dodge roll
- [x] Modular blueprint system + JSON schema + level editor
- [x] Procedural dungeon + tower generator (seeded)
- [x] Overworld terrain + biomes + settlements + resource nodes
- [x] Slime taming mini-game
- [x] Follower AI (follow + auto-aggro)
- [x] XP / levelling / stat points / talent tree (26 nodes)
- [x] 9 spells + SpellForge (hybrid spell crafting)
- [x] Resource gathering + crafting (potions, equipment, enchanting)
- [x] Base building (4 structure types, construction mode `[B]`)
- [x] NPC daily schedules, merchant, quest board, day/night cycle
- [x] Weather system (clear → cloudy → rain → storm, lightning)
- [x] AudioSystem (Web Audio API, 4 gain categories, procedural SFX)
- [x] Performance pass (InstancedMesh slimes, SpatialHash aggro)

---

## Cancelled / Deferred ~~

- ~~Code-first playable character (DNA builder for player)~~ → player is always a conversation-determined asset GLB
- ~~CharacterCreation as player UI~~ → repurposed as DNA Creator in DevLab; rename pending
- ~~Phase 10: The Destructible World~~ → deferred; Rapier soft-body not mature enough

---

## Key Source Files

| Area | Files |
|---|---|
| Campfire intro | `NewGameFlow.ts`, `NewGameScene.ts`, `CharacterDecisionTree.ts` |
| Story system | `StoryQuestLine.ts`, `StoryRunner.ts`, `NameGenerator.ts` |
| Story design | `STORY_DESIGN.md` |
| 3D model prompts | `3D_MODEL_PROMPTS.md` |
| 3D dialogue | `FloatingDialogue3D.ts`, `IDialogue.ts` |
| Character loading | `CharacterLoader.ts`, `WizardLoader.ts`, `charManifest.ts` |
| HUD / UI | `GameMenu.ts`, `QuestLog.ts`, `hudTheme.ts`, `ControlsOverlay.ts` |
| Overworld | `OverworldScene.ts`, `WorldGenConfig.ts` |
| Tower | `TowerGenerator.ts`, `TowerFloorDef.ts` |
| DNA / Creature builder | `CreatureDNA.ts`, `CreatureBuilder.ts`, `CharacterCreation.ts` (→ DNACreator) |
| DevLab / Sandbox | `DevSandbox.ts`, `DevPanel.ts` |
| Core systems | `GameLoop.ts`, `InputManager.ts`, `PhysicsWorld.ts` |
