# TODO — Tomes, Towers & Transmutation
> Last updated: 2026-07-16

---

## Architectural Decisions (locked)

| Decision | Detail |
|---|---|
| Playable character | Asset GLB only — determined by campfire conversation, never DNA builder |
| NPC / Enemy appearance | DNA Creature Builder repurposed as a generator tool inside DevLab |
| Sandbox + DevLab | One unified tool — extend `DevSandbox` with the lab/cheat capabilities |
| Overworld generation | Code-first procedural; Kenney tile assets optional later, not priority |
| Character creation UX | Campfire intro only — no UI panel labelled "Choose Your Character" |
| Git LFS | All GLB / FBX / ZIP / MP3 tracked via LFS |

---

## Done ✅

### Core Game (Phases 1–7)
- Isometric sandbox, physics, WASD movement (Phase 1)
- Real-time combat — melee sweep, spells, dodge roll, i-frames (Phase 2)
- Modular room blueprint system + JSON schema (Phase 3)
- Level editor (`~` key), export/import blueprints (Phase 4)
- Full UI suite: main menu, HUD, death screen, pause menu, spell book, dev panel (Phase 4.5)
- Procedural dungeon generation + seeded PRNG + spell discovery (Phase 5)
- Overworld terrain with biomes, rivers, lakes, settlements, resource nodes (Phases 6a + OW-1–8)
- Slime taming mini-game — 3-round personality song system (Phase 6b)
- Follower AI — follow + auto-aggro (Phase 6c)
- 11-floor procedural tower with named rooms, fixtures, telescope, observatory (Phase 6e)
- Ruined greenhouse interior (Phase 6f)
- XP / levelling / stat points (Phase 7b)
- 26-node talent constellation system (Phase 7c)
- 9 spells total (Phase 7d)
- Resource gathering + economy (Phase 7e)
- Crafting system — potions, equipment, enchanting (Phase 7f)
- Base building — 4 structure types, construction mode `[B]` (Phase 7g)
- Performance pass — InstancedMesh slimes, SpatialHash follower aggro (Phase 7h)

### Campfire Intro / Character Creation
- `FloatingDialogue3D.ts` — 3D canvas-texture speech planes + choice planes, shatter particles
- `NewGameFlow.ts` — full campfire scene orchestration (fade-in, wizard enter/exit, music)
- `CharacterDecisionTree.ts` — 4-species × 4-branch conversation tree → locks character + stats
- Campfire music fade-in/out (`campfire_lullaby.mp3` via LFS)
- `WizardLoader.ts` — 3 wizard models (toad, elf, lizard), randomly selected per new game
- `CharacterLoader.ts` + `charManifest.ts` — typed manifest for all character GLBs
- Stat bonuses from conversation applied to progression at game start
- Sentence-per-line text formatting; `\n` hard line-breaks in `_wrap()`

### Infrastructure
- Git LFS migration — all GLBs / FBXs / ZIPs / MP3s tracked; force-pushed to GitHub
- `vite-env.d.ts` — Vite `?url` import types
- `asset_characters` branch merged to `main`

---

## In Progress 🔄

### Phase 6d — Overworld Editor ✅
- [x] Toolbar to place enemy camps, building entrances, resource nodes on overworld map
- [x] Export overworld layout to JSON (same pattern as dungeon blueprint export)
- [x] Load / apply saved overworld layouts in `OverworldScene`
- [x] Wire `OverworldEditor` into `main.ts` — `\` key toggles (dev mode only, exterior only)

---

## Next Up 📋

### DevLab Unification
`DevSandbox` is the home. Absorb `DevPanel` into it and add:
- [ ] **NPC / Enemy Generator tab** — repurposed `CharacterCreation` DNA builder; outputs a
      creature config that can be saved, loaded, and spawned as a live enemy in the arena
- [ ] **Creature test-drive** — spawn the generated enemy in sandbox and observe AI / animations
- [ ] **Wave spawner** — configure enemy type, count, and timing; run a wave in the sandbox arena
- [ ] **Asset browser** — browse all `charManifest.ts` GLBs; click to preview and swap player model
- [x] **Unified sidebar** — Cheats tab added to DevSandbox with full DevPanel parity (god mode, HP, instant cooldowns, kill all, force flee, teleport, fly mode, fast travel)
- [ ] Remove `DevPanel` as a separate floating overlay once sidebar has parity

### Playable Character Roster
The campfire conversation produces a `CharacterId`. Several IDs use placeholder models:
- [ ] `human_warrior`, `human_paladin`, `human_bard` → assign proper KayKit GLBs (Barbarian, Knight, Mage/Ranger)
- [ ] `fox_rogue`, `fox_ranger`, `fox_mage`, `fox_mysterious` → real Vulperia model (fox pack or new Meshy.ai asset)
- [ ] `zombie`, `ghost`, `mystery_undead` → dedicated models or creative reuse of skeleton pack
- [ ] Verify all 19 `CharacterId`s animate correctly (idle, walk) via shared KayKit rig
- [ ] Replace the two placeholder `[E]` prompt scripts with proper model files in `CHAR_MANIFEST_MAP`

### Campfire Scene Polish
- [ ] Actual animated fire mesh / particle system in the 3D intro scene (currently geometry only)
- [ ] Ambient firefly / ember particles floating around the campfire
- [ ] Subtle camera drift during wizard speech (lazy follow, no snap)
- [ ] Wizard gestures on key speech moments (idle anim swap or FK nudge)

### Visual Quality Pass (Phase 7.5 — abbreviated scope)
Full 7.5 spec is preserved below for reference; prioritised subset:
- [ ] `ACESFilmicToneMapping` + exposure 1.2 on the main renderer (zero cost, high impact)
- [ ] `HemisphereLight` warm/cool split replacing flat ambient in dungeon + overworld
- [ ] Per-torch `PointLight` flicker in tower rooms
- [ ] `EffectComposer`: bloom on emissives + subtle vignette (settings toggle, off by default)
- [ ] Procedural skybox for the overworld night sky (stars, moon, no external textures)
- [ ] Slime velocity-stretch shader (squash-and-stretch on landing)
- [ ] Idle breathing on all FK-rigged characters

### Living World (Phase 8)
- [ ] NPC daily schedules: home / work / wander states driven by a world clock
- [ ] Merchant: buy / sell items at settlement market stall
- [ ] Quest board: procedural fetch / slay quests from the `quest_board` fixture
- [ ] In-game day / night cycle — lighting preset swaps at dawn / dusk
- [ ] Persistent overworld state: cleared camps stay cleared between sessions

### Emergent Spell Crafting (Phase 9)
- [ ] Combine two known spells at a Cauldron to discover a hybrid spell
- [ ] Spell properties (damage, speed, radius, colour) emerge from ingredients
- [ ] 3-slot reagent UI: base spell + modifier + catalyst

### Overworld Asset Pass (lower priority — after gameplay content)
- [ ] Replace procedural trees with KayKit nature-kit GLBs (`InstancedMesh`)
- [ ] Replace procedural rocks with Kenney rock variety set
- [ ] Water / river tiles from Kenney nature kit
- [ ] Settlement buildings from Kenney fantasy-town / retro-fantasy kits

---

## Cancelled / Out of Scope ~~

- ~~Code-first playable character (DNA builder for player)~~ → player is always a conversation-determined asset GLB
- ~~"Character Mode" settings toggle (Code / Asset)~~ → no toggle needed; asset mode is the only player mode
- ~~Phase 10: The Destructible World~~ → deferred indefinitely; Rapier soft-body not mature
- ~~`CharacterCreation` UI for player~~ → repurposed as NPC/enemy generator in DevLab

---

## Key Source Files

| Area | Files |
|---|---|
| Campfire intro | `src/scene/NewGameFlow.ts`, `src/scene/NewGameScene.ts`, `src/scene/CharacterDecisionTree.ts` |
| 3D dialogue | `src/ui/FloatingDialogue3D.ts`, `src/ui/IDialogue.ts` |
| Character loading | `src/characters/CharacterLoader.ts`, `src/characters/WizardLoader.ts`, `src/characters/charManifest.ts` |
| Overworld | `src/scene/OverworldScene.ts`, `src/world/WorldGenConfig.ts` |
| Tower | `src/levels/TowerGenerator.ts`, `src/levels/TowerFloorDef.ts` |
| DNA / Creature builder | `src/creatures/CreatureDNA.ts`, `src/creatures/CreatureBuilder.ts`, `src/ui/CharacterCreation.ts` |
| DevLab / Sandbox | `src/ui/DevSandbox.ts`, `src/ui/DevPanel.ts` |
| Core systems | `src/core/GameLoop.ts`, `src/core/InputManager.ts`, `src/physics/PhysicsWorld.ts` |

---

## Full Phase 7.5 Spec (reference — do not delete)

> The abbreviated Visual Quality items above are the immediate targets.
> The full spec below is preserved for when we return to a dedicated polish sprint.

### Phase 7.5: Procedural Visual Quality — Making the World Come Alive

**Goal:** Dramatically improve visual fidelity using only procedural geometry, shaders, and canvas-generated textures — no external asset files. The world should feel alive and handcrafted despite being entirely code-generated.

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
| 7 | The OP Power Fantasy | ✅ Complete (7a–7h all done) |
| 7.5 | Procedural Visual Quality | ⬜ Not started |
| 8 | The Living World | ⬜ Not started |
| 9 | Emergent Spell Crafting | ⬜ Not started |
| 10 | The Destructible World | ⬜ Not started |

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

**Goal:** Escalating player power through a deep talent system, new spells, resource economy, crafting, and base building — culminating in a 20-minion army demolishing everything in sight.

### 7a — Research Sprint ✅
- [x] Research XP curve formulas, talent tree architectures, cross-path synergy design.
- [x] Evaluate JS-friendly approaches for star-map constellation graph rendering.
- [x] Draft design doc covering stat names, level cap, talent paths, crafting stations.

### 7b — XP & Levelling System ✅
- [x] Extended `ProgressionSystem.ts`: `xp`, `level` (cap 30), `statPoints`, `grantXP()`.
- [x] XP sources: slime kill +20, spell discovery +50, new room visited +10, boss +200.
- [x] Level threshold `100 × level²`. 6 core stats (Power, Attunement, Vitality, Swiftness, Dominion, Cunning).
- [x] `[P]` opens stat allocation panel.
- [x] Level-up banner with golden glow overlay.

**Tests:** ✅ XP/level/stat tests passing.

### 7c — Talent Constellation System ✅
- [x] 26-node registry (7 paths × 3 tiers + 5 cross-path junctions).
- [x] `TalentSystem.ts`: `buyNode()`, prerequisite validation, localStorage persistence.
- [x] `TalentTree.ts`: SVG constellation UI, `[T]` hotkey.

**Tests:** ✅ Cross-path prereq, spend deduction, death pact callback.

### 7d — New Spells ✅
- [x] Nova Burst, Mass Animate, Void Rift, Battle Hymn, Chain Arc.
- [x] All wired into `SpellBook.ts`, `SpellSystem.ts`, `HUD.ts`.

**Tests:** ✅ Radial hit, bounce count, DoT ticks.

### 7e — Resource Gathering & Economy ✅
- [x] `src/core/Inventory.ts` — gold/ore/timber/essence with localStorage persistence.
- [x] `src/world/ResourceNodePlacer.ts` — 30 nodes per map (Poisson-disk).
- [x] `OverworldScene.ts` — ore/timber/essence meshes + harvest hold mechanic (1.5s SVG ring).
- [x] HUD resource strip (bottom-left icons + counts).
- [x] Node respawn 180s.

**Tests:** ✅ 15 Inventory tests passing.

### 7f — Crafting Systems ✅
- [x] `src/interactables/CraftingRecipes.ts` — 20 recipes across 4 station types.
- [x] `src/interactables/CraftingUI.ts` — shared HTML panel, ingredient slots, craft animation.
- [x] `InteractableSystem.onCraftingStation` hook — cauldron→alchemy, forge→forge, enchanting lectern→enchanting.
- [x] `main.ts` wired: CraftingUI instantiated, ESC closes, blueprint results tracked.

**Tests:** ✅ 17 CraftingUI tests passing.

### 7g — Base Building (Lite) ✅
- [x] `PartyManager` hard cap raised to 20.
- [x] `src/scene/BaseScene.ts` — barrier_wall, watch_perch, healing_fountain, ward_stone + localStorage persistence.
- [x] Construction Mode `[B]` — ghost mesh, radial menu, left-click to place, resource deduction, ESC exits.

**Tests:** ✅ 13 BaseScene tests passing.
**Tests:** Known recipe → correct output. Missing ingredient → button disabled, no deduction. Mystery potion outcome deterministic per attempt seed. Equipment token applies stat delta. Enchant chip serialises to save.

### 7g — Base Building (Lite) ✅
- [x] `PartyManager` hard cap raised to 20.
- [x] Construction Mode `[B]` — ghost mesh, radial menu 4 options, left-click places (deducts resources), ESC exits.
- [x] 4 buildable structures: Barrier Wall, Watch Perch, Healing Fountain, Ward Stone.
- [x] `src/scene/BaseScene.ts` — localStorage persistence under `'ttt-base-structures'`.
- [ ] *(Pending)* Minion guard command: `[E]` near Watch Perch → nearest minion enters `guard` FSM state (stops follow AI).

**Tests:** ✅ 13 BaseScene tests passing.

### 7h — Performance Pass ✅
- [x] Profile 100-minion scenario; identify top bottleneck (SpatialHash + IM approach).
- [x] `src/enemy/SlimeEnemy.ts` — `writeToIM()` + `createSlimeBodyIM()`: shared `THREE.InstancedMesh` for all slime bodies (1 draw call for N slimes).
- [x] `src/scene/OverworldScene.ts` — owns `_slimeIM`, syncs matrices/colours each frame via `_syncSlimeIM()`.
- [x] `src/core/SpatialHash.ts` — uniform grid spatial hash replacing O(n²) follower aggro scans.
- [x] Physics simplification: `FOLLOWER_SIMPLIFIED_DIST=30` — skip Rapier KCC for followers >30u from player; direct kinematic steering.
- [x] Particle budget: `MAX_SPARK_BURSTS=23` (=512 pts); oldest SparkBurst evicted in `SpellSystem._addSpark()`.

**Tests:** Spatial hash query = brute-force result across 100 random layouts. 344 passing, 0 tsc errors.

---

**Phase 7 Playtest:**  
Reach level 10. Spend stat points. Buy 5 talent nodes across ≥2 paths; trigger one cross-path node. Gather all 3 resource types. Craft a potion + one equipment token. Build a Watch Perch and assign a minion. Achieve 20-minion party. Cast Nova Burst on a horde — all 15 must die. Confirm ≥30fps throughout.

---

## Phase 7.5: Procedural Visual Quality — Making the World Come Alive

**Goal:** Dramatically improve visual fidelity using only procedural geometry, shaders, and canvas-generated textures — no external asset files. The world should feel alive and handcrafted despite being entirely code-generated.

### 7.5a — Research & Planning Sprint
- [ ] Survey Three.js material options: `MeshLambertMaterial` (current) vs `MeshStandardMaterial` (PBR, roughness/metalness) vs `MeshPhysicalMaterial` (clearcoat/transmission) vs custom `ShaderMaterial`. Benchmark frame-time cost of each upgrade path.
- [ ] Research canvas-based procedural texture generation (`OffscreenCanvas` 256×256 → `THREE.CanvasTexture`) for: stone, wood grain, moss, cloth, and sky.
- [ ] Evaluate `THREE.EffectComposer` post-processing passes (bloom on emissives, SSAO, subtle vignette, film grain). Gate behind a settings toggle — off by default for performance. Research SSAO specifically — it is the single highest-impact pass for making procedural primitives read as physical objects (soft contact shadows in corners where objects touch the ground).
- [ ] Research `BokehPass` (DoF/tilt-shift) for the miniature diorama aesthetic: heavy foreground/background blur with a narrow sharp band forces the eye to perceive the scene as a toy. Benchmark GPU cost — gate behind its own settings toggle.
- [ ] Research `THREE.ACESFilmicToneMapping` + exposure boost as a zero-cost colour-grading step (produces punchy, saturated colours like the concept art).
- [ ] Research CSG libraries (`three-csg-ts`): subtract/union basic primitives to generate cauldrons, arched doorways, goblets in code. Evaluate cost model — generate once at level load and cache the `BufferGeometry` result.
- [ ] Research Forward Kinematics rig patterns for Three.js: nested `THREE.Group` hierarchy as joints; rotating a parent group moves all child meshes. Document pivot-offset convention (shift mesh so rotation origin is at the joint, not mesh centre).
- [ ] Search terms to cover: *Forward Kinematics Three.js*, *Procedural Walk Cycles Math*, *three-csg-ts*, *THREE.InstancedMesh BufferGeometry optimisation*, *MeshPhysicalMaterial clearcoat*, *SSAO Three.js EffectComposer*, *Dynamic CanvasTexture Three.js*, *Builder Pattern TypeScript game dev*.
- [ ] Compile findings + upgrade plan into ARCHITECTURE.md visual section.

### 7.5b — Geometry & Material Pipeline
- [ ] `src/rendering/MaterialLibrary.ts`: singleton factory — `MaterialLibrary.get('stone_wall')` returns a cached instance. All game code calls this instead of inline `new THREE.Mesh*Material`.
- [ ] `src/rendering/GeometryCache.ts`: singleton cache for expensive procedural geometry. `GeometryCache.get(key, buildFn)` — calls `buildFn()` once, stores the `BufferGeometry`, returns same reference on subsequent calls. Used by CSG results, lathe spires, and rounded furniture so the generation cost is paid once at level load only.
- [ ] **`RoundedBoxGeometry` utility** (`src/rendering/RoundedBoxGeometry.ts`): bevelled box with configurable `bevelRadius` and `bevelSegments`. Replace all raw `BoxGeometry` walls, furniture, and props — eliminates the sharp digital-edge look that makes primitives read as computer graphics rather than toy miniatures.
- [ ] **CSG integration** (`three-csg-ts`): write `src/rendering/ProceduralProps.ts` with factory functions for complex shapes built via subtract/union. Initial props: `buildCauldron()` (cylinder − sphere for the hollow bowl + torus rim), `buildGoblet()` (lathe spline + cylinder stem), `buildArch()` (box − cylinder for archway opening). All results stored in `GeometryCache`.
- [ ] Upgrade interior wall/floor/pillar materials to `MeshStandardMaterial` (roughness 0.85, metalness 0.05 for stone; roughness 0.7, metalness 0.0 for wood).
- [ ] **Procedural stone texture** (OffscreenCanvas 256×256): Voronoi-ish cell boundaries drawn as dark cracks on a mid-grey base; random hue ±5° per cell; output as `CanvasTexture` used as `map`.
- [ ] **Procedural wood grain** (OffscreenCanvas 256×256): stacked sine-wave stripes + circular knot rings; warm brown palette.
- [ ] **Moss overlay**: second canvas pass with stipple green spots; intensity controlled by `moistness` param (higher for lower floors + greenhouse).
- [ ] **Emissive rune glyphs**: cauldron + lectern get an `emissiveMap` canvas with procedurally drawn angular rune shapes (jagged polylines), colour-tinted per fixture type.

### 7.5c — Lighting, Tonemapping & Post-Processing
- [ ] `src/rendering/LightingSystem.ts`: manages all dynamic light creation/update/disposal. Register lights by type (torch, ambient, spell, boss).
- [ ] Replace flat ambient with `THREE.HemisphereLight` (warm sky / cool ground split) + `THREE.DirectionalLight` per scene. Warm directional key light (`#ffe5b4`) + cool blue-purple hemisphere fill — dual-tone lighting mimics cozy sunlight in a dusty tower room.
- [ ] **ACESFilmic tonemapping**: set `renderer.toneMapping = THREE.ACESFilmicToneMapping` and `renderer.toneMappingExposure = 1.2`. Zero-cost pass that gives rich punchy colours matching the concept art.
- [ ] Per-room torch `THREE.PointLight` (intensity 1.2, distance 8, decay 2): positioned at each torch fixture; flicker via `sin(t × flickerFreq + phaseOffset) × 0.18` where freq and phase are per-torch values from mulberry32.
- [ ] Spell-cast light pulse: on any cast, spawn `PointLight` at origin, decay intensity 2→0 over 0.4s. Color = spell's visual color.
- [ ] Scene ambiance presets: dungeon = dim orange; library = warm amber; observatory = cold blue-white; exterior night = near-black + moonblue; greenhouse = soft green.
- [ ] **`EffectComposer` pipeline** (settings toggle, off by default):
  - **SSAOPass**: screen-space ambient occlusion — adds soft dark contact shadows where objects touch the ground and in corners. Radius 0.4, bias 0.01. This is the single highest-impact pass for the toy/clay aesthetic.
  - **BloomPass**: bloom on emissive surfaces (strength 0.4, threshold 0.8).
  - **Vignette pass**: subtle edge darkening.
  - **BokehPass** (separate toggle, off by default): DoF tilt-shift — blur foreground/background sharply, keep a narrow focus band at the play-field level. Forces the brain to read the scene as a miniature diorama.

### 7.5d — Particle System
- [ ] `src/rendering/ParticleSystem.ts`: pooled `THREE.Points` emitter. `emit(config: ParticleConfig)` — position, velocity spread (cone angle + speed), color (start/end), lifetime, size. Pool capped at 1 024 particles; oldest recycled.
- [ ] Spell trail: active projectile emits 12 particles/frame behind it; size 0.04; lifetime 0.3s.
- [ ] Hit burst: 20 spark particles at collision point; velocity radial outward; color = spell color.
- [ ] Slime death dissolve: 40 green droplets explode outward; gravity 4 u/s²; fade over 0.8s.
- [ ] Ambient room dust: 200 very slow motes (velocity ≈0.02 u/s random) per interior room; alpha 0.15.
- [ ] Torch fire: 8 orange/yellow rising particles per torch per frame; lifetime 0.5s, upward drift.

### 7.5e — Character & Enemy Visual Polish
- [ ] **Forward Kinematics bone rig** (`src/rendering/CharacterRig.ts`): `createBone(geometry, material, pivotOffset: THREE.Vector3)` helper — wraps a mesh in a `THREE.Group` and offsets the mesh so rotating the group acts as a proper joint. Build full skeleton hierarchy: `Root (Group) → Torso → [Head, L_Shoulder → L_Elbow, R_Shoulder → R_Elbow, Hips → L_Thigh → L_Shin, R_Thigh → R_Shin]`. Each joint is a `THREE.Group`; attach `RoundedBoxGeometry` / `SphereGeometry` limb meshes as children. Rapier capsule drives `Root.position` each frame; internal bones remain free for animation.
- [ ] `src/rendering/CharacterBuilder.ts`: modular mesh-layering system built on top of `CharacterRig`. Character = rig skeleton + `MaterialLibrary` entries per segment + optional accessory slots. Target API: `new CharacterBuilder().torso('rounded').head('anime_round').weapon('wand').build()`.
- [ ] **Canvas face pipeline** (`src/rendering/FaceCanvas.ts`): create a hidden 256×256 `OffscreenCanvas`. Write `drawEyes(ctx, state)` and `drawMouth(ctx, state)` using arcs, paths, and filled bezier curves. Apply as `THREE.CanvasTexture` on the head geometry's `map`. `Expression` component with states `idle | walking | hurt | casting | surprised` — on state change redraw the canvas and set `texture.needsUpdate = true`. Keep canvas size ≤ 256×256 to avoid frame stutter.
- [ ] **Character Creation Screen** (Main Menu → New Game): adjust body proportions (height scale, width slider), head shape (round / angular / elongated — different `SphereGeometry` detail params), skin color (HSL picker → MaterialLibrary hue), robe color, hair (procedural spline curves as `TubeGeometry` from scalp control points). Live preview uses the FK rig.
- [ ] **Velocity-driven slime vertex shader**: replace static `SphereGeometry` with a high-vertex-density sphere and a custom `ShaderMaterial`. Uniform `uVelocity: Vector3` fed from Rapier rigid body each frame. Fragment: reads velocity magnitude → displaces vertices in the velocity direction (stretch) and orthogonally contracts (squish conservation). Squish on landing: spike `uVelocity` to −Y for one frame on ground contact. Cached base geometry via `GeometryCache`.
- [ ] **`LatheGeometry` prop generator** (`src/rendering/LatheProps.ts`): define 2D spline control points as arrays of `[r, y]` pairs; pass to `THREE.LatheGeometry` to spin into revolution solids. Initial shapes: `buildPotion(color)` (bulbous bottle + narrow neck + cork), `buildVase()` (wide belly taper), `buildSpire()` (tower turret tip). Results cached in `GeometryCache`. Replace placeholder cylinder props in BlueprintRenderer.
- [ ] **Slime personality variants**: `bold` = two small spike `ConeGeometry` protrusions; `gentle` = slightly translucent material (opacity 0.85) + softer pastel; `curious` = two small extra eye-sphere bulges on the body surface; `lonely` = darker hue + thin dragging tendril `TubeGeometry`.
- [ ] Enemy biome tinting: slimes in bog = muddy brown lerp; forest = mossy green; highlands = grey-blue. Applied in `SlimeEnemy` based on spawn biome tag from `OverworldScene`.

### 7.5f — Procedural Animation Math

**Goal:** Make characters breathe, walk, and act using only math — no keyframe data or external animation libraries.

- [ ] **Idle breather**: in the render loop, apply `Math.sin(t × 1.2) × 0.025` to `Torso.scale.y` and `Math.sin(t × 1.2) × 0.012` to `Root.position.y`. Shoulder bones get a gentle counter-oscillation at half amplitude to simulate breathing weight. Frequency and phase offset seeded per character from mulberry32 so no two characters breathe in sync.
- [ ] **Procedural walk cycle**: read `PlayerController` velocity magnitude from Rapier KCC each frame. If `|velocity| > 0.1`, compute `walkPhase = t × walkFreq` where `walkFreq` scales linearly with speed. Apply: `L_Thigh.rotation.x = Math.sin(walkPhase) × strideAmp; R_Thigh.rotation.x = Math.sin(walkPhase + Math.PI) × strideAmp` (opposing legs). Arm bones get counter-phase swing: `L_Shoulder.rotation.x = Math.sin(walkPhase + Math.PI) × armAmp`. When velocity drops below 0.1, lerp all bone rotations back to 0 at a damping rate of `8 × delta`.
- [ ] **Cast pose**: on spell cast start, tween the casting arm shoulder from `rotation.x = 0` to `rotation.x = −1.1` (raised) over 0.12s; on cast end, tween back over 0.25s. Implement as a self-contained micro-tween: `{ from, to, duration, elapsed, bone, axis, onDone }` updated in the render loop. No external dependency needed (~30 lines).
- [ ] **Melee swing**: on melee attack, tween the weapon arm from `rotation.z = 0` to `rotation.z = 1.8` (full horizontal sweep) over `0.18s`, then return over `0.12s`.
- [ ] **Hurt flinch**: on taking damage, apply an immediate `Root.rotation.y += randSign × 0.3`; decay rotation back to 0 over `0.3s` (exponential: `rot × 0.85` per frame). Simultaneously trigger `Expression` → `hurt`.
- [ ] Apply the same idle-breath and walk-cycle math to recruited slime followers using their existing `updateAsFollower()` velocity — slimes should wobble and stretch as they run.

### 7.5g — Environment & Sky
- [ ] **Procedural skybox** (`THREE.SphereGeometry` large inverted): canvas-drawn sky dome — gradient `#0a0018` to `#000008`; 800 seeded star points (mulberry32) of varying brightness; per-star twinkle via `sin(t × freq + phase)` where freq/phase seeded per star index.
- [ ] **Moon billboard**: procedural canvas circle with crater pockmarks (dark filled arcs); rendered as `PlaneGeometry` that always faces camera (`mesh.lookAt(camera.position)` each frame).
- [ ] **Foliage sway shader**: trees use `ShaderMaterial` with uniform `uTime`; vertex X/Z offset += `sin(uTime × 0.8 + worldPos.x × 0.4) × 0.06` for vertices above a height threshold.
- [ ] **Fog system**: `THREE.FogExp2` configured per scene — thick in bog (density 0.08), thin in highlands (0.02), interior dungeon = ground fog only (low far-plane adjustment), none in library/observatory.
- [ ] **Water shader** (bog biome patches): `ShaderMaterial` — scrolling UV `sin/cos` distortion + fresnel rim highlight + dark reflective colour.

**Phase 7.5 Tests:**
- `MaterialLibrary.get('stone_wall')` twice → same object reference (singleton).
- `GeometryCache.get('cauldron', buildFn)` twice → same `BufferGeometry` reference; `buildFn` called exactly once.
- `RoundedBoxGeometry`: all vertex normals point within the outer bounding volume (no sharp normals at corners from raw box seam).
- CSG `buildCauldron()`: returns a valid `BufferGeometry` with >0 vertices; no NaN in position attributes.
- Canvas face texture: `drawEyes` and `drawMouth` execute without throwing; `texture.needsUpdate` is set to `true` after an `Expression` state change.
- Walk cycle: at velocity 0.0, all bone rotations ≈ 0 after damping settles. At velocity 5.0, `L_Thigh.rotation.x` and `R_Thigh.rotation.x` have opposing signs.
- Micro-tween: tween from 0→1 over 0.5s — after 0.25s elapsed, value is within ±0.05 of 0.5 (easing tolerance).
- Particle pool: emitting 1025 particles recycles oldest, no crash, pool.length stays at 1024.
- Sky stars: positions deterministic — same seed produces identical star positions on two runs.
- Foliage shader: GLSL compiles without error; mesh appears in render (visual assertion).

**Phase 7.5 Playtest:**  
Walk through all 11 tower floors, greenhouse, and all 3 exterior biomes. Every surface must have visible texture detail. Torches flicker visibly. Spell casts leave a light trace. Slime deaths produce satisfying particle bursts. Character creation screen must show live preview of all adjustments. Player character visibly breathes at rest. Walk cycle animates clearly on movement. Character raises casting arm on spell cast. Slimes stretch visibly on fast movement and squish on landing. Potion props have recognisable lathe-curve silhouettes. Toggle DoF in settings — scene reads as miniature diorama. Toggle SSAO — objects gain contact shadow weight.

---

## Phase 8: The Living World

**Goal:** Add time, weather, seasons, biological systems (gardening, herbalism, alchemy), procedural audio, and a final boss. Turn the world from a backdrop into something that breathes.

### 8a — Time System & Day/Night Cycle
- [ ] Research Three.js sun-position techniques and benchmark dynamic `DirectionalLight` shadow map performance. Decide shadow map resolution (512 or 1024) or baked-only approach.
- [ ] `src/world/TimeSystem.ts`: game clock (1 real second = 2 in-game minutes, configurable in settings). Broadcasts `'timeOfDay'` event each in-game hour. Persisted to localStorage.
- [ ] `THREE.DirectionalLight` angle tracks in-game hour: sunrise at hour 6, noon at 12, sunset at 18, midnight at 0. Smooth per-frame interpolation.
- [ ] Sky/ambient color lerps through: dawn (orange-pink), noon (white), dusk (coral-purple), midnight (deep blue-black). `HemisphereLight` sky/ground colors also lerp.
- [ ] Stars + moon appear from hour 19; fade at hour 5.
- [ ] HUD clock widget: small top-right display showing in-game hour + sun/moon icon. Tooltip on hover: current date from Calendar.

### 8b — Weather System
- [ ] `src/world/WeatherSystem.ts`: FSM — Clear → Cloudy → Rain → Storm → Clear. Probabilistic transitions per in-game hour; seed derived from in-game day number so weather is consistent per day.
- [ ] **Rain**: `THREE.Points` sheet (2000 particles, downward velocity 18 u/s, cylindrical spawn volume around player R=30). Render as thin white streaks (set `size` small, `sizeAttenuation` false).
- [ ] **Fog**: `FogExp2` density lerp to 0.12 during heavy rain/storm.
- [ ] **Storm**: lightning flash (white `DirectionalLight` spike 0→3→0 over 0.08s + screen white `HTMLElement` overlay flash); thunder (low-freq oscillator burst via AudioSystem, 1–4s delay after flash).
- [ ] **Wind**: uniform `uWind` in foliage shader increases during storm; rain particle velocity gains X component.
- [ ] Non-cosmetic effects: rain reduces outdoor torch intensity to 0.3; storm combat grants +10% XP (adrenaline bonus).

### 8c — Seasons & Calendar
- [ ] `src/world/Calendar.ts`: 30 in-game days per month, 4 seasons (Spring/Summer/Autumn/Winter), 12 months = 1 in-game year. Display: `{ season, month, day }`. Persisted to localStorage.
- [ ] Season visual effects: foliage vertex color lerps (Spring = bright green, Summer = deep green, Autumn = orange/red/yellow random per tree, Winter = bare grey + snow-white accumulation on top surfaces).
- [ ] Season gameplay effects: herbalism yield modifier (+50% Spring, normal Summer, ×2 rare herb chance in Autumn, −75% Winter); day length (Summer 16h day, Winter 8h day).
- [ ] Season/date display in pause menu sidebar.

### 8d — Gardening & Herbalism
- [ ] `src/interactables/GardenPlot.ts`: placeable 2×2 dirt patch (base building, costs ore×1). Holds 4 plant slots. Persisted in `BaseScene` structure list.
- [ ] 4 plant growth stages: Seed → Sprout → Mature → Withered. Advances one stage per N in-game days (varies per plant). Mesh grows per stage (scale lerp).
- [ ] `[E]` when Mature → harvest (add to Inventory). Past-peak → withers (yields nothing).
- [ ] **8 plant types**: Brightleaf (→ essence), Ironroot (→ ore supplement), Voidcap (Warlock DoT component), Flameblossom (fire spell amplifier chip), Coldmoss (frost effect component), Hearthweed (instant 15 HP restore consumable), Whispergrass (10s stealth buff — nearby enemies lose aggro), Glowpetal (portable light-source item, 60s glow aura).
- [ ] Greenhouse interior auto-contains 4 pre-built garden plots on first entry (seeded from greenhouse seed).

### 8e — Potion Making & Alchemy
- [ ] `src/interactables/AlchemyStation.ts`: full crafting UI at cauldron (see 7f for shared `CraftingUI`). 3 ingredient slots; `Brew` triggers 3s cauldron animation; produces 1 potion token added to Inventory.
- [ ] 20 defined recipes + mystery fallback table (unknown combo → `mystery_potion`, effect seeded per attempt for determinism).
- [ ] **Potion effects** (sample): instant +30 HP, +50% speed 15s, 5s invulnerability, minion berserk 30s (+100% damage), XP double 60s, growth accelerant (plant advances 1 stage), ore→essence transmutation (×5), stealth 20s, full HP restore (expensive recipe), plus several mystery side-effects.
- [ ] Potion inventory: carry up to 6. `[Q]` drinks equipped (first slot) potion. HUD shows potion slot with count. Slot cycles on Shift+Q.

### 8f — Audio System
- [ ] `src/audio/AudioSystem.ts`: Web Audio API singleton. Gain nodes per category: `music`, `sfx`, `ambient`, `ui`. Categories independently controllable by Settings sliders (already wired up in Settings modal — now functional).
- [ ] **Procedural ambient tones**: interior dungeon = deep sine drone (80Hz, slow tremolo); library = warm chord (harmonics of 220Hz); exterior = layered wind noise (filtered white noise with LFO cutoff sweep); greenhouse = airier open-fifth chord.
- [ ] **Footstep rhythm**: `AudioSystem.footstep(surface)` — short staccato click generated from decaying sine burst; pitch-shifted by surface type (stone +0, wood +200c, grass −300c).
- [ ] **Spell SFX**: magic bolt = brief high ping (3000Hz → 6000Hz sweep 0.1s); flame dart = FM-synthesised crackle; Nova Burst = deep 60Hz boom + rising harmonic sweep 0.6s; Void Rift = low-pass filtered noise swell.
- [ ] **Combat**: melee impact = mid thud (filtered noise 200–800Hz, 0.08s); slime death = wet pop (noise burst through resonant filter, 0.12s).
- [ ] **Procedural generative music**: layered sine arpeggios (minor pentatonic scale, root varies by floor depth); notes trigger on a slow clock (every 2–4s per layer); new notes fade in, old fade out. Evolves over time without looping.
- [ ] Settings sliders for master/music/sfx/ambient now update `AudioSystem` gain nodes in real time.

### 8g — UI & HUD Polish Pass
- [ ] Shared CSS custom properties file (`src/styles/theme.css`): `--panel-bg`, `--border-glow`, `--font-primary`, `--accent-purple`, `--accent-gold`. All overlay panels import and use these.
- [ ] Spell bar: equip flash animation (brief rune-seal expanding ring); cast drain pulse (slot dims then refills); cooldown sweep overlay (conic-gradient progress).
- [ ] **Floating damage numbers**: world→screen projection (same technique as taming reaction text); colour-coded by damage type (white physical, orange fire, blue ice, purple void).
- [ ] Boss health bar: wide centered bar that fades in at encounter start; segmented at phase boundaries (50% and 25% markers); pulses red when boss enters a new phase.
- [ ] Memory leak audit: `dispose()` on all `Geometry`, `Material`, `Texture` on scene unload. Profile heap before/after 10 scene transitions (Chrome memory snapshot).

### 8h — Final Boss Encounter
- [ ] Hand-craft final boss room blueprint (top of tower or sealed room unlocked by collecting 3 floor key items).
- [ ] `src/enemy/WizardBoss.ts`: multi-phase FSM.
  - **Phase 1** (full HP): teleport strikes — blinks to random position, fires magic bolt barrage.
  - **Phase 2** (≤50% HP): summons temporary slime minions (8 per wave, 2 waves); AOE circle patterns.
  - **Phase 3** (≤25% HP): desperate barrage (rapid-fire bolts from all 4 cardinal directions); 3s vulnerability window between volleys.
- [ ] Scripted moments: camera pan on room entry (2s cinematic); short dialogue text overlay at phase transitions; death sequence (slow dissolve + particle explosion + screen fade).
- [ ] Victory sequence: portal appears at room center; entering it triggers credits-style scrolling overlay, then returns to main menu.
- [ ] With 20 minions + high talent investment, the boss should fall embarrassingly quickly — that's the power fantasy payoff.

**Phase 8 Tests:**
- Time: in-game hour advances at correct real-time rate; ambient color at hour 6 is in dawn-orange HSL range.
- Weather: seeded day-weather transitions match expected FSM path over 30-day simulation.
- Alchemy: 5 known recipes produce correct output tokens; unknown combo falls back to mystery table.
- AudioSystem: `gainNode.gain.value` responds to volume slider change within one frame.
- Boss FSM: phase transitions fire at correct HP thresholds; scripted events cannot be skipped by fast damage.

**Phase 8 Playtest:**  
Full end-to-end: new game → tower → overworld → gather resources → garden → brew 3 potions → 20-minion army → all talent paths sampled → Nova Burst horde wipe → Final Boss. Observe dawn/dusk transition and one full rain storm. Boss should feel epic then anticlimactic.

---

## Phase 9: Emergent Spell Crafting

**Goal:** A modular spell assembly system enabling thousands of combinatorially unique spells — some procedurally generated, some player-crafted. Spells become the primary creative expression of the game.

### 9a — Research & Design
- [ ] Research spell crafting systems: Magicka's combinatorial casting, Noita's spell modification chain, Arcanist's per-spell modifier approach. Document what makes each fun vs frustrating.
- [ ] Design component taxonomy: **Delivery** × **Effect** × **Modifier** × **Visual** = spell. Define how interactions resolve (valid, clamped, emergent bonus, forbidden).
- [ ] Define balance constraints: each component has a `manaCost` and `craftCost` (materials); total spell cost = sum + interaction modifiers. Max total budget per spell = 100 mana.
- [ ] Write full component registry spec in ARCHITECTURE.md before writing code.

### 9b — Component System
- [ ] `src/spells/SpellComponent.ts`: `interface SpellComponent { id, category, manaCost, craftCost, apply(context): void, visualConfig }`.
- [ ] **Delivery**: Projectile, Beam, Nova (centered AOE), Touch (melee range), Totem (stationary emitter 8s), Chain (auto-bounces to nearby enemy).
- [ ] **Effect**: Damage (physical/fire/ice/void/nature/lightning subtypes), Heal (self or targeted ally), DoT (tick rate + duration), Stun (duration), Slow, Push (impulse), Pull, Transmute (type-change on enemy for 5s — changes their colour and vulnerability).
- [ ] **Modifier**: Multishot (×2–5), Bounce (≤4 ricochets), Delay (fuse timer), SizeGrow (radius expands over duration), Penetrate (pass through enemies), Homing (gentle tracking), Echo (re-fires at 50% power 0.5s later), Linger (DoT zone left on impact).
- [ ] **Visual** (cosmetic + minor flavor): Flame, Frost, Arcane, Void, Nature, Lightning. Each sets the projectile color, particle system config, and impact sound category.
- [ ] Interaction rules table: valid combos → apply normally; emergent combos → bonus modifier applied (e.g. Projectile+Bounce+Homing = "Seeking" tag +20 mana); forbidden combos (Nova+Bounce) → silently drop Bounce.

### 9c — Spell Forge UI
- [ ] `src/ui/SpellForge.ts`: assembly workspace overlay (`[F]` key, requires Arcanist or Artificer tier 1). Left panel: component library (unlocked components only). Center: assembly frame — 1 Delivery slot + up to 3 Effect slots + up to 3 Modifier slots + 1 Visual slot. Right panel: live preview — generated name, stat block, mana cost, craft cost, effect description.
- [ ] **Procedural name generator**: delivery adjective (`Seeking`, `Erupting`, `Whispering`) + effect noun (`Bolt`, `Rift`, `Cascade`, `Tendril`) + modifier flavor (`of Echoes`, `of the Void`, `Eternal`) + visual suffix (`Flame`, `Frost`, `Arcane`). Table-driven; deterministic per component combination.
- [ ] Save up to 12 custom spells (`SpellForge` saves to `ProgressionSystem` custom spell list). Any custom spell assignable to bar via Grimoire.
- [ ] Validation: assembly frame rejects invalid combos with a red flash + tooltip explaining why.

### 9d — Procedural Spell Generation
- [ ] `src/spells/SpellGenerator.ts`: `generateRandom(seed, rarity: 'common'|'rare'|'legendary'): SpellDef`. Picks valid component combinations within rarity's budget (Common ≤ 40 mana, Rare ≤ 70, Legendary ≤ 100) using mulberry32 seeded selection.
- [ ] **Spell scroll drops**: enemies have a kill-based drop chance (Common 3%, Rare 0.5%, Legendary 0.05%); chance multiplied by enemy level. Drop spawns a scroll pickup entity in the scene. `[E]` to collect → spell added to custom list.
- [ ] **3 hidden Legendary spells**: each requires a specific talent node combination + specific components assembled. Easter-egg discovery system — a faint shimmer effect appears in the Forge when you're one component away.

### 9e — Talent Integration
- [ ] Talent nodes unlock components (Warlock tier 2 → DoT + Void visual; Conductor apex → Totem delivery; Arcanist Precision → Penetrate + Homing; Blade Dancer mid → Touch + Push; Artificer → Linger + Totem).
- [ ] Cross-path node "Void Weave" passive: all player-cast spells automatically gain a free Void Mark DoT modifier (Warlock + Arcanist junction).
- [ ] Apothecary apex "Grand Elixir" reuses the Spell Forge's `SpellGenerator` internally to produce a uniquely named potion each in-game day.

**Phase 9 Tests:**
- Valid combo: mana cost = sum of components + interaction bonus (verified for 10 combos).
- Invalid combo: forbidden pair silently drops extra component; no crash; spell still functional.
- Name generator: deterministic per component set; no empty strings; no duplicates in 1000-seed run.
- `generateRandom`: all rarity tiers produce spells within their budget across 500-seed sweep.
- Scroll drop: kill event triggers drop at correct probability (mocked RNG).

**Phase 9 Playtest:**  
Craft 5 custom spells, at least one from each major delivery type. Fire all in combat. Kill enemies until a scroll drops. Collect it. Confirm a Legendary spell triggers its easter-egg shimmer in the Forge when prerequisites met. Equip 4 custom spells to bar and clear a dungeon floor.

---

## Phase 10: The Destructible World

**Goal:** Break the environment with spells. Rebuild it tactically. Fight massive clan battles as walls shatter and debris flies. Physics-based destruction with satisfying VFX and strict performance guardrails.

### 10a — Destructible Tile Architecture
- [ ] Add `"destructible": true` flag + `"hp": number` to blueprint wall/prop entity schema.
- [ ] `src/world/DestructibleTile.ts`: tracks current HP; damage API; shard geometry cache per tile-type key.
- [ ] **Shard geometry generation**: at scene load, for each destructible tile type generate 4–8 convex-fragment geometries via 3D Voronoi cell splitting of the tile's bounding box (implemented procedurally — mulberry32 seeded per tile-type key, no external library). Cache result; reuse across all instances of the same type.
- [ ] **Damage-state visuals**: at 50% HP, overlay a `LineSegments` crack pattern on the tile face (procedural jagged polyline seeded by world position hash). Crack intensity increases toward 0 HP.
- [ ] Tile damage sources: melee attack, spell projectile impact, Nova Burst radius, Clan Battle explosions.

### 10b — Physics Debris System
- [ ] `src/world/DebrisSystem.ts`: fixed object pool of **64** `{ rigidBody: RapierRigidBody, mesh: THREE.Mesh, timeLeft: number, active: boolean }` pairs. No allocation at runtime.
- [ ] `spawn(position, shardGeometry, material, velocityImpulse)`: claims next inactive slot; sets body translation + velocity; starts `timeLeft` at 4.0s. If pool exhausted → silently skips. No crash.
- [ ] On tile HP → 0: spawn 4–8 shard debris entries from tile center with mulberry32-seeded radial velocity impulses (speed 3–10 u/s, upward component 2–6 u/s).
- [ ] Lifetime: `timeLeft` decrements each frame; at 2.0s remaining, `mesh.material.opacity` lerps 1→0 (transparent `MeshStandardMaterial`). At 0 → return to pool (set inactive, remove mesh from scene, reset body).
- [ ] Shards collide with terrain via dynamic Rapier `RigidBody` + convex-hull `Collider`; bounce and settle naturally.

### 10c — Destruction VFX
- [ ] **Shockwave ring**: `THREE.RingGeometry` centered on destroyed tile; expands at 8 u/s for 0.3s; opacity 1→0; color = tile material tinted orange. Disposed after animation.
- [ ] **Dust cloud**: expanding `THREE.SphereGeometry` mesh; `MeshBasicMaterial` opacity 0.6→0 over 0.5s; scale 0.2→2.0 over 0.5s.
- [ ] **Screen shake**: `cameraRig` offset by random-direction impulse (max 0.3 units); decays exponentially (`shake × 0.85` per frame) over ~0.3s. Magnitude proportional to tile HP (bigger tiles = bigger shake).
- [ ] **Spell-flavored destruction**: fire → orange+red ring + flame particles; ice → blue ring + crystalline spike particles (thin `CylinderGeometry` shards ejected outward); void → implosion (ring shrinks inward) then deferred outward debris; physical → plain grey dust.
- [ ] AudioSystem: tile destruction plays impact crack SFX; large tile (wall) plays low rumble underneath.

### 10d — Reconstruction Spells
- [ ] **Reconstruct** (Phase 7d stub, now fully implemented): aim at broken tile site `[RClick]`; hold 2s cast bar; site glows white; shards fly back to origin and merge (physics bodies disabled, mesh scales+translates back, then tile entity restored). Costs `ore×1`.
- [ ] **Fortify** variant: same cast, but reconstructed tile spawns with ×2 HP and a darker metallic material. Costs `ore×3`. Only available with Artificer tier 2.
- [ ] Broken tile sites stored as `{ position, type, broken: true }` in scene structure list (persisted). Reconstruction removes the `broken` flag.
- [ ] Tactical use: destroy a wall to create a passage → herd enemies through → reconstruct to trap them → Nova Burst.

### 10e — Clan Battle Scenarios
- [ ] `src/world/ClanBattle.ts`: triggered when player enters a clan camp marker (already in `OverworldScene`). Spawns **8–16 clan slimes** (mixed personalities, 2–4 with leader-tier stats: ×1.5 HP and damage). Clan enemies are flagged `clan` — they never flee; fight until dead.
- [ ] Battle arena: procedurally generated outdoor clearing (40×40 unit zone); scattered 6–12 destructible boulder and barrier-wall props.
- [ ] Player minions engage automatically via existing follower aggro AI (no new code needed for combat).
- [ ] Battle-end condition: all clan enemies dead → victory reward (XP bonus + 3–6 ore/timber/essence + scroll drop chance). Player death → respawn at tower entrance, camp resets.
- [ ] Clan camp respawn: 5 in-game days after defeat.
- [ ] **Stress test target**: 20 player minions vs 16 clan enemies + 64 debris shards active → must maintain ≥30fps.

### 10f — Terrain Deformation (Stretch Goal)
- [ ] Nova Burst leaves a persistent crater: on detonation, depress terrain `BufferGeometry` vertices within 4u of impact center by 0.4 units; smooth edges (weighted average of neighbors); recompute normals.
- [ ] Craters are cosmetic only (collision is the flat Rapier ground plane — unchanged).
- [ ] Up to 8 craters persist per session; 9th overwrites oldest (ring buffer). Reset on new game.
- [ ] Each crater has a subtle dark-scorched vertex-color tint radiating outward.

**Phase 10 Tests:**
- Destructible tile: HP reduces correctly on damage; shard spawn on HP=0 (4–8 shards).
- Debris pool: pool of 64 — spawning 65 skips without crash; pool.activeCount never exceeds 64.
- Shard lifetime: at `timeLeft=2.0` opacity begins decaying; at `timeLeft=0` slot returns to pool and mesh is removed from scene.
- Reconstruct: broken site restored to full HP; `broken` flag cleared in structure list.
- Fortify: HP exactly 2× base tile HP; material metalness elevated.
- Clan battle: spawns in range [8, 16]; ends condition fires correctly; rewards granted exactly once.
- Stress test: 20+16 entities + 64 shards simultaneously active — no crash, no pool overflow, assert ≥30fps median.

**Phase 10 Playtest:**  
Find a clan camp. Engage with 15+ minions. Fire Nova Burst — walls and boulders must visibly shatter, craters appear in terrain. Use Reconstruct to seal off a side passage trapping 3 enemies; use Fortify on a crumbling wall. Watch debris settle. Confirm ≥30fps throughout. Observe spell-flavored destruction differences between fire, ice, and void spells on destructibles.

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
