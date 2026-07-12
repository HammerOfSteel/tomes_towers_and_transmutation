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
| 1 | Isometric Sandbox & Physics | ⬜ Not started |
| 2 | ALttP Action Combat | ⬜ Not started |
| 3 | Modular Blueprint System | ⬜ Not started |
| 4 | Level Designer (Dev Tool) | ⬜ Not started |
| 5 | Procedural Generation & Discovery | ⬜ Not started |
| 6 | Overworld & Monster Minions | ⬜ Not started |
| 7 | The OP Power Fantasy | ⬜ Not started |
| 8 | Asset Replacement & Final Boss | ⬜ Not started |

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
