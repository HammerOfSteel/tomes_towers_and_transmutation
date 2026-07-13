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
| 6 | Overworld & Monster Minions | 🔄 In Progress (6d overworld-editor pending) |
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

### 6b — Tame & Recruit ✅
- [x] `SlimeEnemy`: `'flee'` FSM state (HP ≤ 15% → flee away from player).
- [x] `SlimeEnemy.isRecruitable`: true when in flee state and in exterior scene.
- [x] `SlimeEnemy.recruit()`: transitions to `'recruited'`; colour changes to signal allegiance.
- [x] `PartyManager.ts`: tracks recruited minions, enforces Phase 6 cap (5).
- [x] **"The Princess's Song"** taming mini-game (`src/interactables/TamingGame.ts`):
  3-round word-picking overlay; each slime has a hidden personality (bold/gentle/curious/lonely)
  derived from its spawn position hash; word scores trigger visual `tameReact()` animations
  (colour flash + scale bounce); resonance bar fills toward 45-pt threshold; success → purple
  recruit flash; failure → slime bolts. `[E]` near fleeing slime now opens the mini-game instead
  of instant-recruiting. 8 unit tests pass.

### 6c — Follower Behaviour ✅
- [x] Recruited slimes follow player at FOLLOW_DISTANCE=4.0 (simple steering via `updateAsFollower()`).
- [x] Followers automatically attack hostile enemies within FOLLOWER_AGGRO_RANGE=7.0 — scan for
  nearest non-recruited slime, chase at FOLLOWER_ATTACK_SPEED=4.5, melee on cooldown.
- [x] `OverworldScene.update()` dispatches `updateAsFollower()` for recruited enemies.
- [x] `PartyManager.pruneDead()` removes fallen followers (called every frame in main.ts).

### 6d — Editor Improvements
- [x] `EditMode`: "Load Room" button loads the active SceneManager blueprint into the editor
       so generated rooms can be hand-tweaked and re-exported.
- [ ] Overworld editor: place enemy camps, building entrances, resource nodes and export to JSON.

### 6e — Tower Interior: 10-Floor Procedural Generation ✅

#### Implementation (completed 2026-07-13)

Instead of the blueprint-library approach in the original plan, all 11 floors were implemented
as fully procedural rooms — no JSON blueprint files needed. Two new source files handle everything:

- **`src/levels/TowerFloorDef.ts`** — 11 `TowerFloorDef` entries (B + F0–F9), each carrying:
  name, floorType, keyFixture (type + content + optional spellUnlock), sideRoomCount [min,max],
  sideRoomProps, chamberPillars, chamberBookshelves, wallHeight (observatory = 1.2),
  exteriorExitSlot (foyer only → NW door fires onExitTrigger → overworld).
- **`src/levels/TowerGenerator.ts`** — `generateTower(seed)` builds all 11 chambers + side rooms
  into a `DungeonPlan` consumed by `SceneManager.loadDungeon()` unchanged. Circular chambers
  (radius=7, 17×17 cell grid), door slots, staircase chain, pillar rings, bookshelf rings.
- **`src/levels/BlueprintRenderer.ts`** — 5 new fixture renderers: `cauldron` (sphere + tripod +
  torus glow), `telescope` (cylinder pedestal + angled tube), `forge` (box + fire glow),
  `quest_board` (corkboard plane), `greenhouse_orb` (floating sphere + ring).
- **`src/levels/SceneManager.ts`** — staircase entry detection, `clearedRooms` Set (localStorage),
  Observatory sky ambiance (deep-space background + wide fog when floor=9).
- **`src/ui/TelescopeView.ts`** — 3D orbit camera remote-viewing mode: unloads interior, enters
  overworld, renders it through a free PerspectiveCamera. Mouse drag orbits, scroll zooms,
  arrows/WASD pan. ESC restores the previous interior room. `gameMode='telescope'` skips physics.
- **`src/ui/HUD.ts`** — `update()` now accepts optional `floorName?: string`; shows "The Reading
  Galleries" etc. instead of "Floor 1".

#### Playtesting fixes (2026-07-13)
- [x] HUD showed "Floor 1" — now shows actual floor name from TowerFloorDef
- [x] Telescope showed 2D canvas art — now full 3D orbit camera over real overworld
- [x] Bookshelves at (8,2) and (8,14) blocked staircase access — moved to (12,4) and (4,12)
- [x] No way to exit the tower — foyer now has a west-facing exit door (slot 2, `exteriorExitSlot`)

#### Task Checklist
- [x] `TowerFloorDef.ts`: all 11 `TowerFloorDef` entries with names, fixtures, decor flags
- [x] `TowerGenerator.ts`: circular chamber tile-scan, perimeter doors, staircase chain, side-room attachment loop
- [x] `BlueprintRenderer`: cauldron, telescope, forge, quest_board, greenhouse_orb fixture renderers
- [x] `SceneManager`: inter-floor staircase triggers, clearedRooms persistence (localStorage)
- [x] `main.ts`: `startGame()` → `generateTower(seed)` → player starts at floor_quarters (F3)
- [x] Telescope interaction: full 3D orbit camera over real overworld scene
- [x] `clearedRooms`: enemies absent on second visit, present on first (SceneManager)
- [x] 25 TowerGenerator unit tests + 182 total passing; 0 tsc errors
- [ ] **Manual playtest**: descend B→F9, clear each floor, confirm no enemy respawn, telescope works

### 6f — Outdoor Location Interiors ✅
- [x] `src/levels/GreenhouseGenerator.ts`: 11×11 circular chamber (radius=4), `greenhouse_orb` at
  centre, 2 lecterns with plant lore, 3 slime spawns, grass floorType, south exit door.
  `[E]` near the Ruined Greenhouse building loads this interior via `generateGreenhouse(seed)`.
- [x] Greenhouse uses seed `currentSeed ^ 0x67452341` — independent from tower dungeon.
- [x] 12 unit tests for GreenhouseGenerator pass.

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
- [ ] Do web research on best practices and if there are any libraries or such to use or base this upon: XP + level-up system, their spells and expressions, player alot stat points etc AND we want to make a talent progression system kind of like in game like elderscrolls with the charts etc and chosing a specialization (there are more melee focused trees, caster focused which brances of into like AOE or close combat, there are Warlock focused branches with DOTs like in WOW etc, there are less combat focused paths like being a healer almost and letting minions do the fighring, perhaps alchemy paths to focus more on alchemical stuff and you can think of many more and build a well developed deeo system that has niot just interaciton in branches but also cross-interactions and almost emergent seeming stuff etc to make this real fun - maybe we can even procedurally generate these types of things too given a modular like design). Then implement this fully and break down into smaller tasks if you need to.
- [ ] Research, breakdown and implement various crafting types and how they work and implement.
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

## Phase 7.5: Massively improve the procedurally generated assets and textures ll across the board and make new assets to make the world come alive much more
- [ ] web research on best practices and support libraries etc for this if any
- [ ] More assets of all kinds

- [ ] From previous task plan this phase task out and its tests
- [ ] Procedural character generation on modular base, we want to be able to have a charactert creation screen working with such an implementation and using 


---

## Phase 8: Asset improvements & The Final Boss

**Goal:** Turn the "greybox" into a finished game.

**Tasks:**
- [ ] Day night system and time (research, libraries if any and implementation)
- [ ] various types of weather etc (research, libraries if any and implementation)
- [ ] Seasons and calendar (research, libraries if any and implementation)
- [ ] gardening and hermlism system and harvesting etc (research, libraries if any and implementation)
- [ ] potion making system (research, libraries if any and implementation)
- [ ] alchemy system (research, libraries if any and implementation)
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

## Phase 9: Amazing custom spell craftingh system

**Goal:** Create a spell crafting system that enables seemingly endless various of spells that can also be procedurally generated

**Tasks:**
- [ ] web research on best practices and support libraries etc for this if any and plan the rest of the tasks and test and update this todo.md then implement accordingly.

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
