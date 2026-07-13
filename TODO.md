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
| 4.5 | UI Suite (Main Menu + All Game Screens) | 🔄 In Progress |
| 5 | Procedural Generation & Discovery | 🔄 In Progress |
| 6 | Overworld & Monster Minions | ⬜ Not started |
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

## Phase 4.5: UI Suite — Main Menu & All Game Screens 🔄

**Goal:** All game-facing UI screens polished and accessible, establishing the final aesthetic.

**Tasks:**
- [x] `MainMenu.ts`: full-screen animated masonry gallery + title + nav buttons.
  - [x] Concept art masonry grid — 8 tiles, staggered cross-fade, no duplicate images.
  - [x] Play modal with 3 save slots (localStorage).
  - [x] Settings modal: master volume slider + fullscreen toggle.
  - [x] Credits modal.
  - [x] Controls modal.
- [ ] `HUD.ts` polish pass: spell slot display, run indicator, dodge cooldown pip.
- [ ] In-game death screen: "The Ritual Failed" with restart/menu options.
- [ ] Victory / floor-clear banner.
- [ ] Tooltip system: hover any HUD element to see description.

**Design rules:**
- Fonts: Cinzel (titles/buttons), IM Fell English (body/lore text).
- Colour palette: bg `#1a1820`, text `#e2d9c8`, accent `#9d7cce`, frame border `#4a4158`.
- Decorative corners: `✥` glyph at each frame corner.
- All modals: dark glass card with slide-up entrance, click-outside-to-close.

**Tests:**
- Save slot CRUD: create/delete/re-read persists correctly in localStorage.
- Menu navigation: all buttons open correct modals; Escape closes topmost modal.

---

## Phase 5: Procedural Generation & Discovery 🔄

**Goal:** Let the algorithm build the tower, and let the princess learn magic.

**Completed so far:**
- [x] `InteractableSystem.ts`: proximity (2.5u) detection, `[E]` prompt, context-sensitive E key.
- [x] `BookReader.ts`: parchment UI overlay with content + spell discovery banner on first read.
- [x] `ProgressionSystem.ts`: tracks read books + spell unlocks (Set-based, session-scoped).
- [x] `blueprint.ts`: `InteractableEntry.spellUnlock?` field.
- [x] `SceneManager.getActiveInteractables()`: exposes room interactables to game loop.
- [x] `library_large` lectern: unlocks `flame_dart` on first read.

**Remaining:**
- [ ] `DungeonGenerator.ts`: takes a seed + floor count; stitches blueprints by matching doorways.
- [ ] Seed-safe PRNG: replace any `Math.random()` calls with `mulberry32(seed)` equivalent.
- [ ] Hook `flame_dart` into `SpellSystem` (now with book unlock gate — `ProgressionSystem.isSpellUnlocked`).
- [ ] Spell slots UI: display available spells + hotkeys on HUD.

**Tests:**
- Generator stability: 1000 random seeds never produce overlapping or disconnected rooms.
- Generator determinism: same seed → identical layout.
- Progression: `markRead` fires unlock exactly once; re-reading does not re-unlock. ✅ (15 tests)
- PRNG: `mulberry32` output matches expected sequence for known seeds.

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
