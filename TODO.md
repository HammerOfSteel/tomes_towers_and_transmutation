# TODO — Tomes, Towers & Transmutation
> Last updated: 2026-07-16

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
- [ ] Make the toggle label clearer: "Environment Art: Procedural / KayKit Assets"
- [ ] Persist `assetMode` to localStorage on every change (currently only saved when Settings closes)

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
| tower_p4 — Explore the basement | `clear_dungeon` | Clear any dungeon floor | ✅ Works |

### What works
- [x] Story runner fires prologue intro as a centered toast on game start
- [x] Beat completion text shown after each beat
- [x] Quest log shows all 4 prologue beats with correct species flavor
- [x] RNG character name generated from species/class pool

### Gaps (blocking or near-blocking)
- [x] **Intro toast duration** — now 9 s (fades at 9 s, removed at 10.2 s)
- [x] **`explore_floor` beat type** — fulfils when player visits a new floor index; SceneManager tracks unique floors visited; all 12 prologue beats (p1/p2/p3 across 4 species) now use `explore_floor`
- [ ] **Tower starting room** — player spawns in `cell_start` (a generic cell); story says "you wake in a study"; `floor_foyer` would be a better start room for new games from the campfire intro
- [x] **Locked front door** — `_towerPrologueDone` flag blocks `onExitTrigger` during prologue; unlocks when Act I begins (`onActBegin` title ≠ prologue)
- [ ] **Master key item** — no item system for keys yet; `clear_dungeon` is used as a proxy; needs an `interact_key` beat type + key item in basement

### Nice-to-have (not blocking)
- [x] Wizard's note on library telescope fixture: "Do not go to the basement" — `chamberExtraFixture` on `floor_library`; signed Arcanist Solmor
- [ ] Binding circle decal on ground floor (undead species: special lore message on interact)
- [ ] Candidate profile page readable in basement (wizard's journals as bookshelf content)
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
- [ ] `interact_key` beat type — pickup interactable spawns a key item, beat fulfils on pickup
- [x] `explore_floor` beat type — fulfils on staircase use (floor index change in SceneManager)
- [ ] `read_lore` beat type — fulfils when a specific book is read (BookReader fires)
- [ ] Locked door fixture — requires named key item to open; `LockedDoor` interactable

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

## Completed ✅

### HUD Overhaul (Phases A–F)
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
