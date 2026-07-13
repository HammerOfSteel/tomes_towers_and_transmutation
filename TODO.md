# Project Roadmap: Phased Implementation

## Completion Rule

> **A phase is complete only when:**
> 1. All automated unit tests for core logic pass (`npm test`).
> 2. A successful, documented manual playtest is performed.
> 3. `ARCHITECTURE.md` is updated if any architectural decision changed.

Shipping a phase without all three is not shipping.

---

## Phase Status

| Phase | Goal | Status |
|---|---|---|
| 1 | Isometric Sandbox & Physics | ✅ Complete |
| 2 | ALttP Action Combat | ✅ Complete |
| 3 | Modular Blueprint System | ✅ Complete |
| 4 | Level Designer (Dev Tool) | ✅ Complete |
| 4.5 | UI Suite (Main Menu + All Game Screens) | ✅ Complete |
| 5 | Procedural Generation & Discovery | ✅ Complete |
| 6 | Overworld & Monster Minions | 🔄 In Progress |
| 7 | The OP Power Fantasy | ⬜ Not started |
| 8 | Asset Replacement & Final Boss | ⬜ Not started |

---

## Phase 1: The Isometric Sandbox & Physics ✅

**Goal:** Establish the Three.js environment, the isometric camera, and character physics.

**Completed:**
- [x] Initialize Vite + Three.js + TypeScript project with ESLint/Prettier config.
- [x] Implement `GameLoop.ts` (rAF loop, delta time, physics step).
- [x] Implement `InputManager.ts` (WASD, mouse position, action keys).
- [x] Set up `OrthographicCamera` locked to isometric angle; follows player via translation only.
- [x] Integrate Rapier3D; create `PhysicsWorld.ts` wrapper.
- [x] Create `PlayerController.ts`: procedural capsule geometry, WASD movement via `KinematicCharacterController`, wall-sliding.

**Tests:** ✅ Input mapping, physics velocity clamping.

---

## Phase 2: ALttP Action Combat ✅

**Goal:** Implement real-time combat mechanics, hitboxes, and damage states.

**Completed:**
- [x] Define `Health` and `Damageable` interfaces; implemented on player and enemies.
- [x] `CombatSystem.ts`: melee sweep arc (procedural arc geometry, 0.2s lifetime).
- [x] `SpellSystem.ts`: mouse-aimed magic bolt projectile with emissive glow.
- [x] Enemy prototype: `SlimeEnemy` — bounce locomotion + pounce state machine.
- [x] i-frames: 0.5s invulnerability window on taking damage.
- [x] Dodge-roll: directional dash with i-frames, short cooldown.
- [x] HUD: HP bar + kill counter (HTML overlay).

**Tests:** ✅ Hitbox overlap, damage math, i-frame window, FSM transitions.

---

## Phase 3: The Modular Blueprint System ✅

**Goal:** Build the underlying data structure for rooms and towers.

**Completed:**
- [x] JSON blueprint schema v1.0 — walls, floors, doors, staircases, spawns, interactables, floorType, rotation.
- [x] `BlueprintRenderer.ts`: parses JSON → Three.js geometry + Rapier static bodies. Staircase steps with 7 colliders.
- [x] 5 hand-crafted blueprints: `cell_start`, `corridor_ns`, `corridor_ew`, `library_small`, `library_large`.
- [x] Door/portal trigger volumes with fade transitions.
- [x] `SceneManager.ts`: room loading/unloading, enemy state, floor tracking, staircase traversal.

**Tests:** ✅ Schema validation, renderer accuracy, serialization round-trip, door transitions.

---

## Phase 4: The Level Designer (Dev Tool) ✅

**Goal:** A UI overlay to build rooms visually.

**Completed:**
- [x] `EditMode.ts`: toggleable via `~` hotkey. Pauses game loop; activates editor input mode.
- [x] `EditorGrid.ts`: mutable blueprint state, `fromBlueprint`/`toBlueprint` round-trip.
- [x] Entity palette: wall/floor/door/staircase/bookshelf/lectern/spawn; place by click; remove by right-click.
- [x] `R` to cycle rotation; `Tab` to cycle tile type. Live preview with spawn/orientation markers.
- [x] Export: downloads blueprint JSON; Import: loads from JSON file.
- [x] `PauseMenu.ts`: Escape → pause overlay with Resume / Level Editor buttons.
- [x] Outdoor floor types (grass/dirt/wood) + rotation support on all tile types.

**Tests:** ✅ Export/import round-trip, grid snapping, validation.

---

## Phase 4.5: UI Suite — Main Menu & All Game Screens ✅

**Goal:** All game-facing UI screens polished and accessible, establishing the final aesthetic.

**Completed:**
- [x] `MainMenu.ts`: full-screen animated masonry gallery + title + nav buttons.
  - [x] Concept art masonry grid — 8 tiles, staggered cross-fade, no duplicate images.
  - [x] Play modal with 3 save slots (localStorage).
  - [x] Settings modal: master volume slider + fullscreen toggle + **Dev Mode toggle (amber)**.
  - [x] Credits modal.
  - [x] Controls modal.
- [x] `HUD.ts` polish pass: 4-slot spell bar, run indicator, dodge cooldown pip.
- [x] `DeathScreen.ts`: "The Ritual Failed" with restart/menu options.
- [x] `VictoryBanner.ts`: floor-clear banner (auto-dismisses 3.2 s).
- [x] `SpellBook.ts`: Grimoire overlay — equip/unequip spells to action bar slots. `[K]` key.
- [x] `DevPanel.ts`: cheat panel — god mode, fill HP, all spells, kill all, teleport (amber UI).
- [x] `PauseMenu.ts`: dev panel button when dev mode active.
- [x] Tooltip system: hover any HUD element to see description; dynamic spell-slot tooltips.

---

## Phase 5: Procedural Generation & Discovery ✅

**Goal:** Let the algorithm build the tower, and let the princess learn magic.

**Completed:**
- [x] `InteractableSystem.ts`: proximity (2.5u) detection, `[E]` prompt.
- [x] `BookReader.ts`: parchment UI overlay + spell discovery banner on first read.
- [x] `ProgressionSystem.ts`: spell unlock tracking, 4 equip slots, `grantSpell()` cheat.
- [x] `SpellSystem.ts` rewrite: `SpellDef` map, per-spell damage/speed/radius/colour.
- [x] WoW-style spell bar (slots 1–4), `[K]` Grimoire, right-click to cast.
- [x] `DungeonGenerator.ts`: seed + floorCount → connected room chain (`mulberry32` PRNG).
- [x] Seed-safe PRNG (`src/core/prng.ts`): `mulberry32`, `randInt`, `randPick`.
- [x] `flame_dart` unlock gate: `ProgressionSystem.isSpellUnlocked` checked before cast.
- [x] `magic_bolt` pre-unlocked at start (starter spell, no book required).

**Tests:** 145 passing — generator determinism, connectivity, symmetry, 1000-seed stability.

---

## Phase 6: Overworld & Monster Minions 🔄

**Goal:** Leave the tower, explore the wilds, build the monster army.

### 6a — Exterior World Foundation
- [x] `src/core/SimplexNoise.ts`: seeded 2D simplex noise + `fbm()` (fractal brownian motion).
- [x] `src/core/poissonDisk.ts`: Bridson Poisson-disk sampling (deterministic, rand-injected).
- [x] `src/scene/OverworldScene.ts`: heightmap terrain (vertex-coloured biomes: bog/forest/highlands),
       procedural trees, procedural rocks, enemy camps, tower entrance trigger, ruined greenhouse.
- [x] `PhysicsWorld.createGroundPlane(y)`: large static flat plane for exterior movement.
- [x] Scene-mode switching in `main.ts`: `'interior' | 'exterior'` flag;
       null door → exit to overworld; `[E]` near tower entrance → return to dungeon.
- [x] `SceneManager.onExitTrigger`: callback fired when player hits a null-target door.

### 6b — Tame & Recruit
- [x] `SlimeEnemy`: `'flee'` FSM state (HP ≤ 15% → flee away from player).
- [x] `SlimeEnemy.isRecruitable`: true when in flee state and in exterior scene.
- [x] `SlimeEnemy.recruit()`: transitions to `'recruited'`; colour changes to signal allegiance.
- [x] `PartyManager.ts`: tracks recruited minions, enforces Phase 6 cap (5).

### 6c — Follower Behaviour ⬜
- [ ] Recruited slimes follow player at a comfortable distance (simple steering, no NavMesh).
- [ ] Followers automatically attack enemies within aggro range.
- [ ] `PartyManager.pruneDead()` removes fallen followers.

### 6d — Editor Improvements
- [x] `EditMode`: "Load Room" button loads the active SceneManager blueprint into the editor
       so generated rooms can be hand-tweaked and re-exported.
- [ ] Overworld editor: place enemy camps, building entrances, resource nodes and export to JSON.

### 6e — Tower Interior: 10-Floor Procedural Generation ⬜

#### Research Summary (completed 2026-07-13)

**Algorithms evaluated:**
- *Dungeon-Building Algorithm* (Mike Anderson / Tyrant): grow outward from a seed room — pick a
  wall, attempt to attach a new feature (room/corridor/arena), retry on collision. Guarantees
  connectivity because every feature is added through an existing wall. Best fit for our tower:
  each floor starts from a fixed circular central chamber and side rooms grow out from it.
- *Rooms-and-Mazes* (Bob Nystrom / Hauberk): place rooms → flood-fill gaps with maze →
  spanning-tree connect all regions → prune dead ends. Produces imperfect (loopy) dungeons.
  Relevant for basement / more organic floors.
- *Cellular Automata*: organic cave shapes; documented on RogueBasin. Useful for the experimental
  garden floor or the alchemy workshop.

**rot-js (`npm install rot-js`)** — the standard JS roguelike toolkit (TypeScript, BSD-3, 2.7k★).
  Provides Map.Digger, Map.Cellular, Map.Uniform generators; FOV; pathfinding; RNG.
  *Verdict: skip for now.* rot-js outputs ASCII tile callbacks `(x, y, value) => void`; converting
  those to our Blueprint JSON format (wall objects, door positions, spawns) needs a non-trivial
  adapter layer, and our existing SimplexNoise + mulberry32 + DungeonGenerator infrastructure
  already covers the fundamentals. Re-evaluate if we need A* pathfinding for minion AI (Phase 6c).

---

#### Floor Manifest (replaces GDD §9 — 10 floors + basement)

| Level | ID | Name | Central Fixture | Side Rooms (pool) | Player start? |
|---|---|---|---|---|---|
| B | `floor_alchemy` | Alchemical Workshop | Distillation rig | Ingredient store, Experiment chamber, Dangerous materials vault | — |
| 0 | `floor_foyer` | Grand Foyer | Quest board + world exit door | Guard post, Waiting room, Trophy niche | — |
| 1 | `floor_library` | Library of Accumulated Arrogance | Giant book stacks + reading lectern | Restricted section, Manuscript alcove, Candlelit reading nook | — |
| 2 | `floor_brewing` | The Brewing Chamber | Enormous cauldron (centrepiece) | Ingredient prep, Bottling room, Reagent storage | — |
| 3 | `floor_quarters` | Living Quarters | Communal lounge / kitchen | Bedroom, Dressing room, Private study | **YES** |
| 4 | `floor_smithy` | The Arcane Smithy | Runic forge | Enchanting bench, Materials store, Display gallery | — |
| 5 | `floor_menagerie` | Followers' Den | Minion common room | Slime pool, Goblin corner, Undead rest alcove, Construct bay | — |
| 6 | `floor_trophies` | Trophy Hall / War Room | Map table + mounted trophies | Vault (locked), Tactical briefing room, Comms alcove | — |
| 7 | `floor_garden` | Experimental Garden | Floating-orb greenhouse floor | Propagation lab, Seed vault, Distillation prep | — |
| 8 | `floor_archive` | The Forbidden Archive | Sealed magical cabinets | Dangerous knowledge wing, Artefact storage, Quarantine cell | — |
| 9 | `floor_observatory` | The Observatory Rooftop | Telescope (interactable) | Star-chart alcove, Instrument room, Observation decks ×4 | — |

#### Initial enemies (cleared-on-first-run, no respawn)
Every floor except F3 (player quarters) starts with a small group of slimes/constructs.
Cleared state is stored in the save slot; enemies are not re-spawned on subsequent visits.
Boss-lite variant (higher HP) guards the staircase up on floors B, 2, 4, 6, 8.

---

#### Implementation Plan

**Step 1 — Floor Theme Definitions** (`src/levels/TowerFloorDef.ts`)
- Define `TowerFloorTheme` interface:
  ```ts
  interface TowerFloorTheme {
    id: string;               // e.g. 'floor_brewing'
    floorIndex: number;       // B=-1, F0=0 … F9=9
    name: string;
    chamberRadius: number;    // tile-radius of circular main hall (default 7)
    sideRoomPool: string[];   // blueprint IDs eligible for this floor
    sideRoomCount: [number, number]; // [min, max] per seed
    keyFixture: FixtureDef;   // placed at (0, 0) of chamber
    initialEnemyCount: number;
    hasBossVariant: boolean;
  }
  ```
- Export `TOWER_FLOORS: TowerFloorTheme[]` (array index = floor, B=index 0).

**Step 2 — Circular Chamber Generator** (add to `src/levels/DungeonGenerator.ts`)
- `buildCircularChamber(radius: number, rand): BlueprintTile[][]`
  - Mark every tile (col, row) within `radius` of centre as `floor`.
  - Walk the perimeter; mark tiles just outside the circle as `wall`.
  - Place staircase-down at due-south wall, staircase-up at due-north wall.
  - Place door sockets evenly around the perimeter: E, W, and 2–4 random spots.
  - Key fixture is injected as an `interactable` at centre.
- Algorithm: scan all tiles; `if (col² + row² <= radius²) → floor, else wall`.
  Inner-edge detection: a wall tile adjacent to ≥1 floor tile = door-eligible wall.

**Step 3 — Side-Room Attachment** (new `TowerFloorGenerator` in `DungeonGenerator.ts`)
Follows the *Dungeon-Building Algorithm*:
1. Start with the generated circular chamber.
2. For each side-room slot (seeded count, min-max from FloorTheme):
   a. Pick a random door-eligible wall section (use `mulberry32` PRNG).
   b. Select a blueprint ID from `sideRoomPool` (seeded pick).
   c. Check that a `T×2` corridor + room bounding box doesn't overlap existing geometry.
   d. If clear: place a `corridor_ns` or `corridor_ew` connector + attach the room blueprint.
   e. If collision: try up to 10 other wall sections; skip if none found.
3. After all rooms placed, add initial enemies (seeded Poisson spread within the chamber floor).

**Step 4 — Blueprint Library Expansion** (`src/levels/blueprints/`)
New blueprint files needed (add using the Level Editor tool):
- `room_ingredient_store.json`, `room_experiment_chamber.json` (alchemy)
- `room_restricted_section.json`, `room_manuscript_alcove.json` (library)
- `room_ingredient_prep.json`, `room_bottling_room.json` (brewing)
- `room_bedroom.json`, `room_dressing_room.json` (quarters)
- `room_enchanting_bench.json`, `room_smithy_gallery.json` (smithy)
- `room_slime_pool.json`, `room_goblin_corner.json`, `room_undead_alcove.json` (menagerie)
- `room_vault.json`, `room_briefing.json` (trophies)
- `room_propagation_lab.json`, `room_seed_vault.json` (garden)
- `room_dangerous_wing.json`, `room_quarantine.json` (archive)
- `room_star_chart.json`, `room_observation_deck.json` (observatory)

Each room blueprint includes floor-appropriate procedural props (bookcases, cauldron props,
forge geometry, planters, etc.) via the existing `BlueprintRenderer` prop system.

**Step 5 — Key Fixtures (procedural geometry, no assets)**
Fixtures rendered in `BlueprintRenderer.ts` by new `interactable` subtypes:
- `cauldron`: large sphere (r=1.2) on a tripod frame, emissive glow, emits particle steam.
- `telescope`: cylinder + angled tube geometry, `[E]` → shows aerial render of exterior.
- `runic_forge`: box with emissive fire-glow material inside, tongs geometry.
- `quest_board`: flat plane with canvas-texture grid marks, cork-board colour.
- `greenhouse_orb`: floating sphere (MeshBasicMaterial, light-emissive) × N scattered.

**Step 6 — SceneManager / main.ts Integration**
- Remove hardcoded `cell_start` as initial room.
- `startGame()` → generate tower with seed → `sceneManager.loadRoomImmediate('floor_quarters')`.
- Each floor's staircase-down triggers `sceneManager.loadFloor(floorIndex - 1)`.
- Each floor's staircase-up triggers `sceneManager.loadFloor(floorIndex + 1)`.
- Exit door on F0 triggers `switchToExterior()` (already wired).

**Step 7 — Telescope Interaction**
- On `[E]` at F9 telescope: render the exterior `OverworldScene` top-down (orthographic camera
  directly overhead, zoom-out) into an offscreen `THREE.WebGLRenderTarget`.
- Display the render target texture in a canvas overlay (like `BookReader`).
- Overlay shows a zoomed-out map of the exterior including tower, camps, greenhouse.

**Step 8 — Cleared-Enemy State**
- `GameState` (new or extend save-slot object): `clearedFloors: Set<string>` keyed by floor ID.
- When `floor_brewing` is loaded for the first time, enemies spawn (initial seed).
- On second load, `clearedFloors.has('floor_brewing')` → skip enemy spawn.
- Persist to `localStorage` with the save slot.

---

#### Task Checklist

- [ ] `TowerFloorDef.ts`: define all 11 `TowerFloorTheme` entries.
- [ ] `buildCircularChamber()`: tile-scan circle algorithm; perimeter doors; staircase positions.
- [ ] `TowerFloorGenerator`: dungeon-building side-room attachment loop.
- [ ] Populate `src/levels/blueprints/` with the 20+ new room blueprints (use Level Editor).
- [ ] `BlueprintRenderer`: add `cauldron`, `telescope`, `runic_forge`, `quest_board`, `greenhouse_orb` fixture renderers.
- [ ] `SceneManager`: `loadFloor(index)` replaces hardcoded room chain; inter-floor staircase triggers.
- [ ] `main.ts`: `startGame()` spawns player at `floor_quarters` centre.
- [ ] Telescope interaction: offscreen render → canvas overlay.
- [ ] `GameState`: `clearedFloors` set; persist to save slot; skip enemy spawn on reload.
- [ ] Update `DungeonGenerator` tests: cover circular chamber connectivity, side-room overlap-free placement, 50-seed determinism across all 11 floors.
- [ ] Manual playtest: descend from F9 to B, clearing each floor; confirm enemies don't respawn; confirm telescope shows exterior.

**Tests (Phase 6e):**
- Circular chamber: all floor tiles reachable from centre (flood-fill check).
- Side rooms: zero overlap across 100 seeds per floor theme.
- Staircase chain: loadFloor(-1) through loadFloor(9) produces valid rooms for all seeds.
- Cleared state: enemies absent on second load; enemies present on first load.
- Telescope: render target produced without errors; overlay displays.

### 6f — Outdoor Location Interiors ⬜
- [ ] Ruined Greenhouse blueprint: round floor plan, enemies only, once cleared = safe space.
- [ ] Greenhouse uses a separate seed from the tower dungeon.

**Tests (Phase 6):**
- Poisson-disk: no two points closer than `minDist` across 50 seeds.
- Party: recruit beyond limit → false; dismiss shrinks array; pruneDead removes dead members.
- Flee threshold: flee only entered at ≤ 15% HP.

**Playtest 6:**
Exit tower → exterior. Find enemy camp. Reduce slime below 15% HP, recruit it. Party counter updates.
Explore to find ruined greenhouse. Confirm scene transitions are smooth in both directions.

---

## Phase 7: The OP Power Fantasy

**Goal:** Scale the player's power to ridiculous heights and implement base building.

**Tasks:**
- [ ] XP + level-up system: simple scaling multiplier on spell damage and HP.
- [ ] Nova Burst spell: full-screen AOE, 15s cooldown, screen-fill expanding torus VFX.
- [ ] Mass Animate ultimate: resurrect all defeated enemies in room as temporary minions.
- [ ] Party limit raised to 20.
- [ ] Resource gathering: mine procedural rocks/trees; currency feeds upgrades.
- [ ] Base building (lite): player commands minions to construct/guard tower defenses (barrier walls, archer perches).
- [ ] Performance pass: profile and optimize for 100-minion stress test.

**Tests:**
- Load test: 100 simultaneous minions, all pathfinding and attacking, maintain ≥ 30fps.
- AOE accuracy: Nova Burst hits all enemies within radius, misses all outside.
- Resource system: mining increments counter; spending decrements correctly, cannot go negative.
- Level scaling: damage formula produces expected output at levels 1, 10, 20.

**Playtest 7:**
Achieve a party of 20 minions. Cast Nova Burst on a horde of 15 enemies. All must die. Confirm frame rate holds.

---

## Phase 8: Asset Replacement & The Final Boss

**Goal:** Turn the "greybox" into a finished game.

**Tasks:**
- [ ] Define Phase 8 asset brief (see [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) — forward reference section).
- [ ] Asset pipeline: swap procedural primitives for `.gltf` models + `.png` textures.
- [ ] Character animations: Idle, Walk, Attack, Hurt, Die (mixamo/Blender) replacing kinematic sliding.
- [ ] Audio: Web Audio API — ambient, footsteps, spell SFX, impact sounds.
- [ ] UI polish: styled HTML/CSS to match final art style.
- [ ] Final boss room: hand-crafted blueprint, scripted encounter, victory sequence.
- [ ] Memory leak audit: profile scene transitions, ensure geometry/material disposal is correct.
- [ ] End-to-end playtest & bug fix sprint.

**Tests:**
- Asset loading: no memory leak on 10 consecutive scene transitions (heap measured before/after).
- Animation blending: transitions between all animation states play without popping.
- Boss encounter: scripted events fire in correct order; cannot be skipped.

**Playtest 8:**
Full end-to-end speedrun. Observe all 8 phases' content. End with the defeat of the Wizard Captor. The final boss fight should feel intentionally anticlimactic.


---

## Phase 1: The Isometric Sandbox & Physics

**Goal:** Establish the Three.js environment, the isometric camera, and character physics.

**Tasks:**
- [ ] Initialize Vite + Three.js + TypeScript project with ESLint/Prettier config.
- [ ] Implement `GameLoop.ts` (rAF loop, delta time, physics step).
- [ ] Implement `InputManager.ts` (WASD, mouse position, action keys).
- [ ] Set up `PerspectiveCamera` locked to isometric angle; follows player via translation only.
- [ ] Integrate Rapier3D; create `PhysicsWorld.ts` wrapper.
- [ ] Create `PlayerController.ts`: procedural capsule geometry, WASD movement via `KinematicCharacterController`, wall-sliding.
- [ ] Generate a flat procedural grid plane with stone-floor noise shader.
- [ ] Place several procedural box obstacles with static Rapier colliders.

**Tests:**
- Input mapping: each key produces the correct velocity vector.
- Physics: player velocity is clamped correctly on collision, wall-slide angle is within expected range.
- Camera: player world position correctly translates to camera offset position.

**Playtest 1:**
Walk the capsule around the grid. Collide smoothly with boxes (no tunnelling, no jitter). Camera tracks without stutter. Achieve a stable 60fps in a Chromium browser on target hardware.

---

## Phase 2: ALttP Action Combat

**Goal:** Implement real-time combat mechanics, hitboxes, and damage states.

**Tasks:**
- [ ] Define `Health` and `Damageable` interfaces; implement on player and enemies.
- [ ] `CombatSystem.ts`: melee sweep arc (procedural `TorusGeometry` partial arc, brief stun, 0.2s lifetime).
- [ ] `SpellSystem.ts`: mouse-aimed projectile — physics sphere + emissive shader, basic glow.
- [ ] Enemy prototype: procedural slime (flattened sphere). State machine: `Idle → Alert → Chase → Attack`.
- [ ] i-frames: 0.5s invulnerability window on taking damage (visual flash on player mesh).
- [ ] Dodge-roll: directional dash with i-frames, short cooldown.
- [ ] Basic HUD: HP bar (HTML overlay).

**Tests:**
- Hitbox overlap: arc hitbox correctly reports overlap with enemy collider (not with walls).
- Damage math: HP reduction is correct, does not go below 0, triggers death state.
- i-frame window: damage during i-frame period is ignored; damage after is applied.
- FSM transitions: each state transition fires the correct callback.

**Playtest 2:**
Standalone arena (no rooms). Player must defeat 3 slime enemies using both melee and projectile attacks. Verify i-frames feel "correct" (not too long, not too short). Verify melee arc visual matches the hitbox.

---

## Phase 3: The Modular Blueprint System

**Goal:** Build the underlying data structure for rooms and towers.

**Tasks:**
- [ ] Define JSON blueprint schema v1.0 (see [docs/BLUEPRINT_SCHEMA.md](docs/BLUEPRINT_SCHEMA.md)).
- [ ] `BlueprintRenderer.ts`: parses blueprint JSON → Three.js geometry + Rapier static bodies.
- [ ] Author 5 hand-crafted blueprints (cell, library ×2, corridor ×2) as JSON.
- [ ] Door/portal trigger volumes: player enters trigger → fade transition → load next room.
- [ ] `SceneManager.ts`: manages room loading/unloading, preserves enemy state.

**Tests:**
- Schema validation: malformed blueprints throw descriptive errors.
- Renderer accuracy: parsing a known blueprint produces geometry at exact expected 3D coordinates.
- Serialization round-trip: a blueprint object serialized to JSON and re-parsed is identical to the original.
- Door transition: triggering a door correctly unloads room A and loads room B.

**Playtest 3:**
Walk through a hard-coded sequence of 3 different connected rooms. Doors open correctly. No geometry clipping between rooms. Room transitions feel seamless (fade ≤ 0.3s).

---

## Phase 4: The Level Designer (Dev Tool)

**Goal:** A UI overlay to build rooms visually, saving time on future development.

**Tasks:**
- [ ] `EditMode.ts`: toggleable via hotkey (default: `~`). Pauses game loop; activates editor input mode.
- [ ] `EditorUI.ts`: grid-snapping placement tool. Mouse raycasts to grid plane; highlights tile under cursor.
- [ ] Entity palette: select wall/floor/door/spawn/interactable; place by clicking; remove by right-click.
- [ ] Live preview: placed elements render immediately using `BlueprintRenderer`.
- [ ] Export: current layout serializes to blueprint JSON and downloads as a file.
- [ ] Import: load an existing blueprint JSON and populate the editor grid.

**Tests:**
- Export/import round-trip: `Editor state → JSON → Editor state` produces byte-identical JSON.
- Grid snapping: placed elements are within 0.001 units of the nearest grid coordinate.
- Validation: editor prevents exporting a blueprint that fails schema validation (e.g., no doorways).

**Playtest 4:**
Open the game, toggle Edit Mode, build a small library room (floor, 4 walls, 1 door, 2 bookcases), export it, cold-load the game using that blueprint as the starting room, and walk around it.

---

## Phase 5: Procedural Generation & Discovery

**Goal:** Let the algorithm build the tower, and let the princess learn magic.

**Tasks:**
- [ ] `DungeonGenerator.ts`: takes a seed + floor count; stitches blueprints together by matching doorways.
- [ ] Seed-safe PRNG: replace any `Math.random()` calls with `mulberry32(seed)` equivalent.
- [ ] `InteractableSystem.ts`: raycast to bookcase/lectern; trigger "read" prompt.
- [ ] `BookReader.ts` UI overlay: display book text (flavour + spell description); close on `Escape`.
- [ ] `ProgressionSystem.ts`: reading a specific book unlocks its associated spell/passive; persists per run.
- [ ] Spell slots UI: display available spells and their hotkeys on HUD.
- [ ] Hook up Flame Dart and Magic Bolt to `SpellSystem` (now with book unlock gates).

**Tests:**
- Generator stability: 1000 random seeds never produce overlapping rooms or disconnected floors (no doorway left unmatched).
- Generator determinism: same seed always produces identical floor layouts.
- Progression: reading a book fires the unlock event exactly once; re-reading does not re-unlock.
- PRNG: `mulberry32` output sequence matches expected values for known seeds.

**Playtest 5:**
Spawn in a procedurally generated 5-floor tower. Navigate to floor 3, find the "Fireball" book, read it, then use it to destroy a door obstacle. Verify procedural generation produces distinct-feeling floors.

---

## Phase 6: Overworld & Monster Minions

**Goal:** Leave the tower and build the army.

**Tasks:**
- [ ] Exterior scene: Simplex noise heightmap terrain, biome shader (bog/forest/highlands).
- [ ] Procedural trees: tapered `CylinderGeometry` trunk + vertex-displaced `SphereGeometry` canopy.
- [ ] Procedural rocks: `DodecahedronGeometry`, randomized scale/rotation (also resource nodes).
- [ ] Enemy camp placement: Poisson disk sampling for spacing, 3–8 enemies per camp + elite.
- [ ] Tame/Recruit mechanic: at HP < 10%, enemy enters `Flee` state; player "Spare" action → `Recruit`.
- [ ] `PartyManager.ts`: tracks recruited minions, enforces party limit (Phase 6 cap: 5).
- [ ] Follower AI: minions use NavMesh (recast.js or hand-baked) to follow player and attack target.
- [ ] Tower entrance trigger: smooth transition between exterior and tower interior.

**Tests:**
- NavMesh path calculation: given start/end points on valid terrain, path is found and has no off-mesh steps.
- Party management: recruiting beyond the limit prompts dismissal; dismissed minions are removed from party array.
- Tame threshold: `Spare` action is only available when enemy HP ≤ 10% of max.
- Camp spawning: Poisson disk ensures no two camps are within minimum distance.

**Playtest 6:**
Exit the tower to the exterior. Find an enemy camp. Reduce one enemy below 10% HP and recruit them. Use the recruit to help clear the remaining camp enemies. Confirm follower pathfinding works (no getting stuck).

---

## Phase 7: The OP Power Fantasy

**Goal:** Scale the player's power to ridiculous heights and implement base building.

**Tasks:**
- [ ] XP + level-up system: simple scaling multiplier on spell damage and HP.
- [ ] Nova Burst spell: full-screen AOE, 15s cooldown, screen-fill expanding torus VFX.
- [ ] Mass Animate ultimate: resurrect all defeated enemies in room as temporary minions.
- [ ] Party limit raised to 20.
- [ ] Resource gathering: mine procedural rocks/trees; currency feeds upgrades.
- [ ] Base building (lite): player commands minions to construct/guard tower defenses (barrier walls, archer perches).
- [ ] Performance pass: profile and optimize for 100-minion stress test.

**Tests:**
- Load test: 100 simultaneous minions, all pathfinding and attacking, maintain ≥ 30fps.
- AOE accuracy: Nova Burst hits all enemies within radius, misses all outside.
- Resource system: mining increments counter; spending decrements correctly, cannot go negative.
- Level scaling: damage formula produces expected output at levels 1, 10, 20.

**Playtest 7:**
Achieve a party of 20 minions. Cast Nova Burst on a horde of 15 enemies. All must die. Confirm frame rate holds.

---

## Phase 8: Asset Replacement & The Final Boss

**Goal:** Turn the "greybox" into a finished game.

**Tasks:**
- [ ] Define Phase 8 asset brief (see [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) — forward reference section).
- [ ] Asset pipeline: swap procedural primitives for `.gltf` models + `.png` textures.
- [ ] Character animations: Idle, Walk, Attack, Hurt, Die (mixamo/Blender) replacing kinematic sliding.
- [ ] Audio: Web Audio API — ambient, footsteps, spell SFX, impact sounds.
- [ ] UI polish: styled HTML/CSS to match final art style.
- [ ] Final boss room: hand-crafted blueprint, scripted encounter, victory sequence.
- [ ] Memory leak audit: profile scene transitions, ensure geometry/material disposal is correct.
- [ ] End-to-end playtest & bug fix sprint.

**Tests:**
- Asset loading: no memory leak on 10 consecutive scene transitions (heap measured before/after).
- Animation blending: transitions between all animation states play without popping.
- Boss encounter: scripted events fire in correct order; cannot be skipped.

**Playtest 8:**
Full end-to-end speedrun. Observe all 8 phases' content. End with the defeat of the Wizard Captor. The final boss fight should feel intentionally anticlimactic.
