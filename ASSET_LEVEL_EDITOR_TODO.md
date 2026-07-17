# Asset Level Editor — Implementation Plan
> Branch: `feature/asset-level-editor`
> Merge target: `demo/alpha-release`
> Entry point: **http://localhost:5174/model-review.html** → new **✏️ Editor** tab
> All editors share the same 3D viewport, asset panel, and property inspector.

---

## Git Branch Setup
```
git checkout demo/alpha-release
git checkout -b feature/asset-level-editor
# ... implement all phases ...
git checkout demo/alpha-release
git merge --no-ff feature/asset-level-editor
```

---

## Architecture Overview

```
model-review.html          ← host page (existing)
  tabs:
    🧙 Characters          ← existing
    🌳 Environment         ← implemented
    ✏️ Editor              ← NEW (this plan)
      sub-tabs:
        🏰 Tower Floor
        🌍 Overworld
        🏠 Building Exterior
        🪑 Building Interior
        ⚔️  Dungeon

src/
  model-review.ts          ← existing (add Editor tab bootstrap)
  assets/
    envManifest.ts         ← existing
  editor/
    EditorCore.ts          ← shared 3D editor engine (Phase L0)
    EditorSerializer.ts    ← save/load/export JSON (Phase L0)
    EditorHistory.ts       ← undo/redo stack (Phase L0)
    TowerFloorEditor.ts    ← Phase L1
    OverworldEditor.ts     ← Phase L2
    BuildingEditor.ts      ← Phase L3
    BuildingInteriorEditor.ts ← Phase L4
    DungeonEditor.ts       ← Phase L5
  types/
    EditorSchema.ts        ← JSON schema types shared across all editors
```

### Saved File Format
All editors export `.ttt-level.json` files. Example tower floor:
```json
{
  "schema": 1,
  "type": "tower_floor",
  "id": "floor_library",
  "name": "The Grand Library",
  "floorIndex": 1,
  "gridSize": 2,
  "size": { "w": 12, "d": 12 },
  "objects": [
    { "id": "obj_001", "asset": "/assets/kaykit_dungeon/wall.gltf", "x": 0, "y": 0, "z": 0, "ry": 0, "scale": 2.0, "meta": {} }
  ],
  "spawns": [
    { "id": "spawn_001", "type": "enemy", "enemyId": "skeleton_warrior", "x": 4, "y": 0, "z": 4 }
  ],
  "exits": [
    { "id": "exit_up",   "type": "stair_up",   "x": 10, "y": 0, "z": 5, "targetFloorIndex": 2 },
    { "id": "exit_down", "type": "stair_down",  "x":  2, "y": 0, "z": 5, "targetFloorIndex": 0 }
  ],
  "properties": {
    "lightPreset": "dungeon",
    "ambientQuote": "The books here are organised by a system you cannot immediately decode."
  }
}
```

---

## PHASE L0 — Editor Foundation (shared infrastructure)
> All editors depend on this phase. Build this first.

### L0.1 — EditorCore.ts
- [ ] 3D editor viewport that takes over the model-review canvas when Editor tab is active
- [ ] **Grid plane** — configurable cell size (default 2 WU = 1 tower tile). Toggle [G] key.
- [ ] **Object placement** — click asset in panel → ghost mesh follows mouse → click to place
- [ ] **Selection** — click placed object to select (orange outline via `OutlinePass`); Shift+click for multi-select
- [ ] **Transform gizmo** — translate (W key), rotate (E key), scale (R key) via `TransformControls` from Three.js addons
- [ ] **Snap-to-grid** — toggle [S] key; snaps translate and scale to grid cell size
- [ ] **Snap-to-grid rotation** — snap rotation to 90° / 45° increments when enabled
- [ ] **Delete** — Delete/Backspace key removes selected objects
- [ ] **Duplicate** — Ctrl+D duplicates selected
- [ ] **Frame** — F key frames camera on selection
- [ ] **Orbit camera** — right-drag to orbit, scroll to zoom, middle-drag to pan
- [ ] **Top-down mode** — T key switches to orthographic top-down (useful for placement)
- [ ] **Height movement** — Q/E keys raise/lower selected object by one grid unit; also numeric Y input in panel

### L0.2 — EditorSerializer.ts
- [ ] `serialize(editorState) → JSON string` — converts scene to `.ttt-level.json`
- [ ] `deserialize(json) → editorState` — reconstructs scene from saved JSON
- [ ] `exportToGame(json) → Blueprint/OverworldPatch/BuildingDef` — converts editor output to game-ready format
- [ ] **Auto-save** — localStorage auto-save every 30s with timestamp
- [ ] **Save** — Ctrl+S → browser `<a download>` saves `.ttt-level.json`
- [ ] **Load** — file picker `<input type=file>` loads any `.ttt-level.json` matching the current editor type
- [ ] **Export to code** — "Export → TypeScript" generates a const suitable for pasting into game source
- [ ] **Template library** — bundled read-only templates the user can "Fork" to make editable copies

### L0.3 — EditorHistory.ts
- [ ] `EditorHistory` class — command pattern undo/redo stack (max 100 operations)
- [ ] Commands: `PlaceObject`, `DeleteObject`, `MoveObject`, `RotateObject`, `ScaleObject`, `SetProperty`
- [ ] **Undo** — Ctrl+Z
- [ ] **Redo** — Ctrl+Shift+Z / Ctrl+Y
- [ ] Undo history shown in a small overlay (`3 actions undoable`)

### L0.4 — Property Inspector Panel
- [ ] Shared right-side panel shown when an object is selected
- [ ] Fields auto-generated from object type:
  - **Position** X/Y/Z (number inputs, step = grid size when snap on)
  - **Rotation** Y (degrees, step = 45° when snap on)
  - **Scale** (slider 0.1–8 + numeric input, with "Apply to game manifest" button)
  - **Asset path** (read-only display)
  - **Object ID** (auto-generated, editable)
  - **Object name** (free text label, shown in scene as billboard at low opacity)
- [ ] **Type-specific fields** — see each editor phase for additional fields
- [ ] **Copy transform** — button copies position/rotation/scale as JSON

### L0.5 — Asset Browser Panel
- [ ] Left panel: same category tree as Environment tab (reuses `envManifest.ts`)
- [ ] Search/filter as in the Environment tab
- [ ] Click asset → enters "placement mode" (ghost mesh appears)
- [ ] Drag asset from panel into viewport → places at dropped position
- [ ] **Recent assets** strip at the top (last 8 used)
- [ ] **Favourites** — star button on any asset saves to localStorage

### L0.6 — Editor Tab Bootstrap
- [ ] Add `✏️ Editor` tab to model-review.html (next to 🌳 Environment)
- [ ] Sub-tab bar: Tower Floor | Overworld | Building Ext. | Building Int. | Dungeon
- [ ] Sub-tab switches EditorCore to the appropriate editor mode
- [ ] Status bar at bottom: selected object count, grid size, snap state, undo count

---

## PHASE L1 — Tower Floor Editor
> Design dungeon floor layouts using KayKit/Kenney assets. Output replaces the procedural BlueprintRenderer.

### L1.1 — Floor Setup
- [ ] **New floor dialog**: name, floor index (-1 basement → 9 observatory), size (WxD in tiles), grid cell size (default 2 WU)
- [ ] **Load existing template** — ships with one pre-built template per floor index matching current game design:
  - Floor -1: Alchemical Workshop
  - Floor 0: Grand Entrance Hall
  - Floor 1: The Archive
  - Floor 2: Distillation Hall
  - Floor 3: Wizard's Sanctum
  - Floors 4–9: combat/exploration floors
- [ ] Floor index list in sidebar — drag to reorder, click to switch active floor
- [ ] Add/remove floors; floor index can be negative (basement)
- [ ] Floor switcher with visual thumbnail (rendered to an offscreen canvas)

### L1.2 — Structural Elements
- [ ] **Wall placement** — place KayKit dungeon walls (`wall.gltf`, `wall_corner.gltf`, `wall_arched.gltf`)
- [ ] **Floor tile placement** — `floor_tile_large.gltf`, `floor_tile_small.gltf`, `floor_dirt_*.gltf`
- [ ] **Ceiling tiles** — `ceiling_tile.gltf` (optional; toggled visible with C key)
- [ ] **Columns / pillars** — `column.gltf`, `pillar.gltf`, `pillar_decorated.gltf`
- [ ] **Wall auto-complete** — hold Shift and drag to place a row/column of wall tiles

### L1.3 — Props & Interactables
- [ ] **Prop placement** — any KayKit dungeon prop: torches, barrels, crates, chests, candles, banners
- [ ] **Bookshelf / lectern property fields** (shown in inspector when selected):
  - `contentText` — lore text shown when player reads
  - `spellUnlock` — optional spell ID unlocked on first read
  - `firstReadOnly` — boolean: show only once
- [ ] **Chest property fields**:
  - `contents[]` — array of `{itemId, quantity}` (e.g. `[{itemId:"gold",quantity:50}]`)
  - `requiresKey` — boolean + optional key item ID
  - `glbVariant` — `chest` vs `chest_gold`
- [ ] **Cauldron / forge / lectern** — mark as interactable type (`alchemy`, `forge`, `enchanting`)
- [ ] **Candelabra** — decorative (no interaction), placed with `candelabra` type
- [ ] **Quest board** — `quest_board` interactable type

### L1.4 — Exits & Spawns
- [ ] **Staircase Up** — visual marker (blue ↑ arrow disc) at placement position; property: target floor index
- [ ] **Staircase Down** — visual marker (orange ↓ arrow disc); property: target floor index
- [ ] **Tower Exit** — visual marker (green ➤ arrow disc) for the exterior front door
- [ ] **Door trigger** — visual marker (yellow rectangle) for flat doorway transitions between side rooms
- [ ] **Enemy spawn** — visual marker (red ⚔ sphere); properties: `enemyId`, `tier`, `count`, `patrolRadius`
- [ ] **NPC spawn** — visual marker (cyan 👤 sphere); properties: `npcName`, `npcType`, `dialogue`
- [ ] **Spawn group** — multi-spawn that fires simultaneously (for encounter design)
- [ ] **Player start** — green circle marking where player teleports on floor entry

### L1.5 — Floor Properties Panel
- [ ] Floor name (free text)
- [ ] Light preset dropdown: `dungeon`, `library`, `lab`, `observatory`
- [ ] Ambient Solmor quote (text area, used in floor title card during transitions)
- [ ] Encounter pool — select which `RoomEncounterDef` pool to use for auto-spawned enemies
- [ ] Key fixture — select interactable type placed at key location for prologue
- [ ] Boss room toggle — enables ornate floor border overlay

### L1.6 — Export
- [ ] "Export Blueprint" → generates a `Blueprint` TypeScript const compatible with existing `BlueprintRenderer`
- [ ] "Export Encounter Def" → generates `RoomEncounterDef[]` for the spawn positions
- [ ] "Export Floor Def" → generates `TowerFloorDef` TypeScript const

---

## PHASE L2 — Overworld Editor
> Load the generated overworld and decorate it. All changes are stored as a patch layer on top of the procedural generation.

### L2.1 — Overworld Loading
- [ ] "Load current world" button — deserializes last saved `WorldData` from localStorage
- [ ] World renders in the editor viewport at reduced detail (no physics, no enemies)
- [ ] Tile grid overlay (toggle G) — shows the 2-WU grid aligned to tile edges
- [ ] Biome colour map toggle — shows biome-coloured overlay to identify zones

### L2.2 — Nature Asset Placement
- [ ] Place any tree/rock/grass/clutter from the environment panel over the overworld terrain
- [ ] **Terrain-following** — placed objects snap to the heightfield surface automatically
- [ ] **Brush tool** — hold B + drag to scatter selected asset across an area (density control)
- [ ] **Erase brush** — E + drag removes placed assets in radius
- [ ] **Biome paint** — paint biome zones by colour to override procedural generation
- [ ] Road tile placement — drag to paint cobblestone paths (auto-connects tiles)
- [ ] River tile placement — drag to paint river paths (auto-connects with river pieces)

### L2.3 — Settlements
- [ ] Place settlement anchor point → opens "Settlement Properties" dialog:
  - Name (e.g. "Millhaven")
  - Building count (4–12)
  - Settlement type: `village`, `town`, `fortified_town`
  - Unique ID (auto-generated, used by interior editor to reference rooms)
- [ ] Each settlement shows a bounding circle overlay
- [ ] Within settlement: place individual building footprints and name them
- [ ] Building footprint has:
  - Unique ID (reference to Building Exterior editor output)
  - `buildingType` (cottage, inn, smithy, etc.)
  - Entry door facing direction (N/S/E/W)
  - Entry point world position (for `[E] Enter` interaction)
  - Interior scene ID (reference to Building Interior editor output)

### L2.4 — Dungeon Entrances
- [ ] Place dungeon entrance marker (red arch icon)
- [ ] Properties:
  - Name (e.g. "The Catacombs")
  - Dungeon scene ID (reference to Dungeon editor output)
  - Entrance spawn point (world position where player appears when exiting)
  - Exit spawn point (world position where player appears when entering)
  - Associated floor range (which floors the dungeon spans)
  - Visual asset override (which GLB to use for the entrance arch)

### L2.5 — NPCs & Enemies
- [ ] Place NPC spawn (cyan sphere); properties: npcName, npcType, dialogue reference ID
- [ ] Place enemy camp (red tent); properties: enemyCount, enemyIds[], campRadius, respawnTime
- [ ] Place boss encounter anchor (skull icon); ties to a dungeon entrance
- [ ] Patrol path editor — place waypoints connected by lines; assign to a patrol enemy group

### L2.6 — Export
- [ ] "Export World Patch" → JSON with all placed objects as an overlay layer
- [ ] "Export Settlement Data" → `SettlementEntry[]` for `WorldData.settlements`
- [ ] "Export Dungeon Data" → `DungeonEntry[]` for `WorldData.dungeons`
- [ ] Patch is auto-applied in `OverworldScene` constructor when present

---

## PHASE L3 — Building Exterior Editor
> Design the outside appearance of any building using modular Kenney town/building-kit pieces.

### L3.1 — Building Canvas
- [ ] Fixed footprint grid (user defines WxD in tiles, 1–4 tiles)
- [ ] Floor count selector (1–3 floors, matches A3 archetypes)
- [ ] **Floor layer view** — click floor index to show/hide upper floors (like Photoshop layers)
- [ ] Ground-plane shows building footprint outline

### L3.2 — Wall System
- [ ] Place wall pieces: `wall.glb`, `wall-window-glass.glb`, `wall-door.glb`, `wall-wood.glb`, `wall-corner.glb`
- [ ] Place `wall-half.glb` for half-height sections
- [ ] Walls snap to grid edges automatically
- [ ] **Style selector**: Stone | Wood | Mixed — filters wall variants shown in panel
- [ ] Corner pieces auto-suggest when two walls meet at 90°

### L3.3 — Roof System
- [ ] Roof layer placed above top floor walls
- [ ] Pieces: `roof.glb`, `roof-corner.glb`, `roof-gable.glb`, `roof-high.glb`
- [ ] **Roof style dropdown**: Flat | Gabled | High-gabled | Pointed
- [ ] Auto-generate roof button — fills roof outline automatically based on wall footprint

### L3.4 — Decoration
- [ ] Place chimney, windows (additional detail), shutters, balconies, signs
- [ ] Place town props around the building: lantern, hedge, fence, cart, stall
- [ ] Door placement sets entry point (synced to overworld editor building entry)
- [ ] Place barrel/crate clusters for exterior flavour

### L3.5 — Properties
- [ ] Building name (e.g. "The Rusty Cauldron Inn")
- [ ] Building type (cottage / inn / smithy / manor / tower)
- [ ] Unique ID (referenced by overworld editor)
- [ ] Interior scene ID (link to building interior editor output)
- [ ] Has interior? toggle — if false, the door is decorative only

### L3.6 — Export
- [ ] "Export Building Def" → TypeScript `BuildingDef` compatible with `AssetBuildingAssembler.ts`
- [ ] "Export Preview GLB" → bakes all pieces into a single GLB for use as a static prop

---

## PHASE L4 — Building Interior Editor
> Design rooms inside any building. Linked to a specific building ID from L3.

### L4.1 — Room Canvas
- [ ] Load building footprint from linked exterior (or define manually)
- [ ] Floor count matches exterior building
- [ ] Each floor is a separate layer (F1, F2, F3 tabs)
- [ ] Wall outlines from exterior are shown as ghost overlay for alignment

### L4.2 — Floor Props (Kenney Furniture Kit)
- [ ] Place furniture from `kenney_furniture` pack:
  - Tables, chairs, benches, shelves, beds, wardrobes, desks
  - Barrels, crates, chests (with loot contents property)
- [ ] **Room type presets** (one-click fill):
  - `tavern_common_room` — tables + chairs + bar counter
  - `bedroom` — bed + wardrobe + small desk
  - `library` — bookshelves lining walls + reading table
  - `storage` — crates + barrels scattered
  - `smithy_interior` — forge + anvil + tool racks
- [ ] Each bookshelf shows a `contentText` field in the inspector

### L4.3 — Lighting & Atmosphere
- [ ] Place light source markers: candle, lantern, fireplace, window light
- [ ] Each light has: colour, intensity, radius
- [ ] "Light preview" toggle — disables ambient and shows only placed lights

### L4.4 — NPCs & Interactables
- [ ] NPC spawn: `innkeeper`, `shopkeeper`, `quest_giver` types with name field
- [ ] Merchant inventory definition: `{itemId, price, stock}[]`
- [ ] Door markers: exterior door (linked to overworld entry) + internal doors between rooms
- [ ] Staircase markers between interior floors (linked by floor index)

### L4.5 — Export
- [ ] "Export Interior Def" → JSON compatible with a new `BuildingInteriorRenderer` (future)
- [ ] Each room exports as a `Blueprint`-compatible object usable by the existing `BlueprintRenderer`

---

## PHASE L5 — Dungeon Editor
> Design multi-room dungeon complexes. Similar to tower floor editor but supports branching layouts.

### L5.1 — Dungeon Map View
- [ ] **Node graph** — rooms shown as rectangles connected by lines (like a dungeon map)
- [ ] Add room node: click → names it, assigns a template or blank
- [ ] Connect rooms: drag from room edge → creates doorway connection
- [ ] Delete connection: click the connector line
- [ ] Set entrance room (green ➤) and exit room (orange ➤)
- [ ] Toggle to 3D room view for detailed editing (same as tower floor L1.x)

### L5.2 — Room Templates
- [ ] Blank room (define WxD)
- [ ] Pre-built templates:
  - `entry_chamber`, `corridor_narrow`, `corridor_wide`, `side_room`, `treasure_vault`, `boss_arena`
- [ ] Load any previously saved Tower Floor or Dungeon room as a template

### L5.3 — Dungeon-Specific Structural Elements
- [ ] Wall pieces from KayKit Dungeon Remastered (same as Tower Floor Editor L1.2)
- [ ] **Trap tiles**: `floor_tile_big_spikes.gltf`, `floor_tile_grate.gltf` — animated property: `trapActive`
- [ ] **Secret wall** — marks a normal-looking wall as a secret door (hidden indicator visible in editor)
- [ ] **Barrier / gate** — `barrier.gltf`, `gate-metal-bars.gltf` — links to a pressure plate trigger

### L5.4 — Encounter Design
- [ ] Place enemy spawns with encounter pattern: `static`, `patrol`, `ambush`, `wave`
- [ ] For `wave` spawns: define wave count + kill threshold
- [ ] Place room-clear trigger zone (marks the area that triggers room-cleared state)
- [ ] Place chest reward — auto-spawns when room is cleared (links to chest properties)
- [ ] Boss marker — special large spawn with custom AI reference

### L5.5 — Export
- [ ] "Export Dungeon Plan" → `DungeonPlan` compatible with existing `DungeonGenerator.ts` output format
- [ ] "Export Room Blueprints" → array of `Blueprint` objects, one per room
- [ ] "Export Encounter Pools" → `RoomEncounterDef[]` array for the dungeon

---

## PHASE L6 — Polish & Integration
> Make the editor production-quality and wire all exports into the game runtime.

### L6.1 — UI Polish
- [ ] Dark theme consistent with model-review existing style
- [ ] Tooltips on all toolbar buttons
- [ ] Keyboard shortcut overlay (? key)
- [ ] Minimap in top-right showing full level overview
- [ ] Object count + file size indicator in status bar
- [ ] Unsaved-changes indicator (• dot in tab title)

### L6.2 — Game Integration
- [ ] `SceneManager` reads exported Tower Floor blueprints from localStorage → uses them instead of procedural defaults
- [ ] `OverworldScene` applies exported overworld patch on construction
- [ ] `AssetBuildingAssembler` uses Building Exterior editor output
- [ ] Hot-reload: in dev mode, `vite.config.ts` watches `public/editor-output/` → triggers scene rebuild on save

### L6.3 — Playwright Tests
- [ ] `tests/e2e/editor-tower.spec.ts` — load floor template, place 3 assets, export; validate JSON schema
- [ ] `tests/e2e/editor-overworld.spec.ts` — load world, place settlement, export patch
- [ ] `tests/e2e/editor-building.spec.ts` — place walls + roof, export BuildingDef
- [ ] `tests/e2e/editor-dungeon.spec.ts` — create 2-room dungeon, connect, export plan
- [ ] Each test takes a screenshot for visual regression

### L6.4 — Scale Calibration Workflow
- [ ] "Calibrate Scale" mode in Environment tab:
  - Load asset → adjust slider until it matches the 2m reference figure correctly
  - One-click "Save to manifest" → writes the new `gameScale` to `envManifest.ts` via the Vite dev plugin endpoint
- [ ] Scale changes auto-propagate to `OverworldScene.ts` upgrade methods via the manifest
- [ ] "Scale audit report" — lists all assets with `gameScale !== 1.0` for review

---

## Delivery Milestones

| Milestone | Phases | What You Get |
|---|---|---|
| **E0 — Foundation** | L0 | Shared editor engine: place/select/transform/undo/save works in all editors |
| **E1 — Tower Floor** | L0 + L1 | Design and export tower floors; replaces procedural interior |
| **E2 — Overworld** | L0 + L2 | Decorate the overworld; place settlements and dungeons |
| **E3 — Buildings** | L0 + L3 + L4 | Build and furnish houses; settlements have real buildings |
| **E4 — Dungeons** | L0 + L5 | Design dungeon complexes; supports full encounter placement |
| **E5 — Full Polish** | L6 | Integration, Playwright tests, scale calibration workflow |

---

## Technical Notes

### Scale Reference Standard
> **1 game tile = 2 World Units (WU)**
> **Player height ≈ 2 WU**
> All assets should be scaled so a standard tile piece fills a 2×2 WU footprint.
> The 2m reference figure in the environment viewer shows this height.

### Asset Scale Quick Reference (from envManifest.ts)
| Asset type | Pack | Recommended scale |
|---|---|---|
| KayKit trees (broadleaf) | kaykit_nature | 2.5 |
| KayKit trees (pine) | kaykit_nature | 2.8 |
| KayKit trees (bare/bog) | kaykit_nature | 2.2 |
| Kenney nature trees | kenney_nature | 3.0 |
| Kenney rocks (small) | kenney_nature | 2.0 |
| KayKit dungeon walls | kaykit_dungeon | 2.0 (needs verification) |
| KayKit dungeon props | kaykit_dungeon | 0.8–0.9 |
| Kenney town props | kenney_town | 2.2 |
| Kenney town walls/roofs | kenney_town | 2.0 |
| Kenney castle tower | kenney_castle | 2.0 |
| Kenney furniture | kenney_furniture | 1.8 |
> **Use the Environment tab scale slider to verify all values above before E0 ships.**

### Data Flow
```
Editor (browser) → .ttt-level.json → public/editor-output/{type}/{id}.json
                                             ↓
                                    Game runtime reads JSON on startup
                                    (SceneManager, OverworldScene, etc.)
```

### Vite Dev Plugin (for hot-reload integration)
```
vite.config.ts → add custom plugin that:
  - serves POST /api/save-level  (writes to public/editor-output/)
  - sends HMR invalidation to the game page on file change
```
