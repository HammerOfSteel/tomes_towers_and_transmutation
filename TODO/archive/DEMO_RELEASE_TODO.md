# Demo Release Plan — Tomes, Towers & Transmutation
> **Sub-tracker** — detailed phase tracking for the demo release.
> **Master TODO:** `TODO.md` is the single source of truth. Add new tasks there, not here.
> Branch: `DEMO_RELEASE`
> Goal: A **complete, polished alpha build** ready for public playtesting, a Kickstarter campaign, and an itch.io/Steam early-access launch.
> Last updated: 2026-07-18 (princess creator integrated from feature/princess-creator)

---

## PHASE PC — Princess Creator Game Integration
> **Goal:** The Spore-style Princess Atelier becomes a first-class way to start a new game.
> The existing real-model picker remains; a toggle on the new-game card switches between modes.

### PC1 — Base Templates (4 playable species)
Pre-built DNA for the 4 main species so there's always something in the library even on first launch.

- [x] `src/princess-creator/defaults/human.princess.json` — `PrincessDefaults.ts` contains HUMAN default DNA
- [x] `src/princess-creator/defaults/undead.princess.json` — UNDEAD default in PrincessDefaults.ts
- [x] `src/princess-creator/defaults/foxling.princess.json` — FOXLING default in PrincessDefaults.ts
- [x] `src/princess-creator/defaults/slime.princess.json` — SLIME default in PrincessDefaults.ts
- [x] `PrincessDefaults.ts`: exports `DEFAULT_PRINCESSES` + `PRINCESS_SPECIES_MAP`; `seedGalleryIfEmpty()` seeds on first launch

### PC2 — Princess Library UI
Shown in the new-game flow when custom mode is enabled.

- [x] `PrincessLibraryPanel.ts` — 3-column grid, thumbnail/name/species badge, Play/Edit/Delete, Create New button, seeded from defaults
- [x] Seeded with `DEFAULT_PRINCESSES` on first launch via `seedGalleryIfEmpty()`
- [x] "Edit" deep-links into the Atelier via `princess-creator.html#code=P2.xxx`

### PC3 — New-Game Custom Princess Toggle
- [x] `customPrincess: boolean` toggle on new-game card (default off, persists to `ttt_custom_princess_mode`)
- [x] `CharacterConfig.princessDna?: PrincessDNA` + `princessSpecies?` — set when custom mode on
- [x] New game flow: `princessDna` → `player.applyPrincess(dna)`, bypassing GLB model
- [x] Species mapping: `PRINCESS_SPECIES_MAP` routes all 21 princess species to 7 game species

### PC4 — Wire `buildPrincess` into Player Model
- [x] `PlayerController.applyPrincess(dna)` — dynamic import `buildPrincess`, attaches root, positions at capsule bottom
- [x] Game loop: `player.updatePrincess(t, dt)` each frame when `hasPrincess`
- [x] On new game: `princessDna` path routes before assetModel/DNA
- [x] Species mapping applied; abilities/talent/story use mapped game species

### PC5 — Atelier Dev Lab Entry
- [x] Dev Labs menu: "👸 Princess Atelier" → opens `princess-creator.html` in new tab (PauseMenu.ts)
- [x] Creative mode skin picker: show custom-princess gallery entries as "👸 Custom" tab — loads gallery, apply via `player.applyPrincess()`
- [x] `window.__game.buildPrincess(dna|code)` — exposed on debug object

### PC6 — Unit Tests
- [x] `tests/princess-creator/defaults.test.ts` — 16 tests: 4 defaults × sanitizeDna/buildPrincess/height
- [x] Run all existing `src/princess-creator/__tests__/` — 182 passing

---


> **⚠️ NO EXTERNAL MODELS — EVER.** This game is code-first, procedural-only. Zero GLB/FBX/OBJ files will be used in any game path. All geometry is `THREE.BufferGeometry` primitives via the DNA builder system. See **PROC-E** for the retirement plan for any legacy loading code.

---

## PHASE B — Enemy Expansion
> **Goal:** Meaningful enemy variety per zone/dungeon, Zelda-style encounter design. All enemies use `buildEnemy(dna)` — no GLB models, no external packs.

### B1 — Procedural Enemy System (replaces old model loading)
- [x] `src/enemy-creator/types.ts` — `EnemyDNA` with species, combatRole, tier, colors, weapon, movement
- [x] `src/enemy-creator/builder.ts` — `buildEnemy(dna)` → procedural rig, zero GLB dependency
- [x] `src/enemy-creator/defaults/EnemyDefaults.ts` — default enemies per floor tier + boss defaults
- [x] `src/enemy/EnemyLoader.ts` — `loadEnemyById()` falls back to `buildProceduralEnemyRig(dna)` for all IDs
- [ ] **PROC-E2:** Remove `ENEMY_MANIFEST`, `charManifest.ts` enemy entries, all `loadEnemyModel()` / GLB load paths (tracked in PROC-E)

### B2 — Enemy Roster by Zone
> All enemies built procedurally via `buildEnemy(dna)`. DNA specifies species, combatRole, tier, colors, movement — no external models.

#### Tower Dungeon (Floors B1–9)
| Enemy | Species DNA | Floor Range | Tier | Notes |
|---|---|---|---|---|
| **Bone Warrior** | undead · melee | B1–2 | 1 | Basic melee, telegraphed swing |
| **Bone Archer** | undead · ranged | B1–3 | 1 | Ranged, seeks cover |
| **Rot Walker** | undead · melee | B1–2 | 1 | Slow, heavy hit, fear aura |
| **Imp Skulk** | draconic · swarm | 2–4 | 1 | Fast, low HP, swarms |
| **Slime Cube** | slime · melee | 1–3 | 1 | Splits on death |
| **Stone Golem** | draconic · tank | 4–6 | 2 | High HP, slow, area stomp |
| **Gargoyle** | draconic · melee | 5–7 | 2 | Dive bomb, perch behaviour |
| **Shadow Caster** | undead · caster | 5–8 | 2 | Ranged spells, teleports |
| **Fae Wraith** | fae · caster | 7–8 | 2 | Teleports, charm debuff |
| **Vampire Skulk** | vampire · caster | 8–9 | 3 | Life-steal, mist form |
| **Brute** | orcish · melee | 6–8 | 2 | Charge attack, cleave |
| **Spectral Knight** | undead · tank | 8–9 | 3 | Phase, reflects spells |
| **Drake Whelp** | draconic · caster | 9 | 3 | Fire cone, boss encounter |

#### Overworld (Exterior)
| Enemy | Species DNA | Biome | Tier | Notes |
|---|---|---|---|---|
| **Scout** | orcish · melee | Forest | 1 | Patrol path, flees at low HP |
| **Troll** | orcish · tank | Forest/Highland | 2 | Regenerates, stunned by fire |
| **Spider** | draconic · swarm | Bog | 1 | Webs player (slow debuff) |
| **Bat Swarm** | fae · swarm | Cave/Dungeon entry | 1 | Multi-hit, spread formation |
| **Bog Wraith** | undead · caster | Bog | 2 | Invisible until 10u range |
| **Bandit** | human · melee | Road/Camp | 1 | Ranged + melee, has camp |
| **Baron Guard** | human · tank | Baron's Keep | 2 | Organised formation, shielded |

### B3 — Dungeon Encounter Design (Zelda-style)
> Each room has a designed encounter archetype. Rooms clear (enemies stop spawning) once all enemies die.

| Room Type | Encounter Pattern | Enemy Combo Example |
|---|---|---|
| **Entry room** | 2–3 tier-1 enemies, spread placement | 2× Skeleton Warrior |
| **Patrol room** | 4 enemies on patrol paths, alert on sight | 2× Skeleton + 2× Imp |
| **Ambush room** | Room appears empty; enemies spawn from corners on entry | 4× Zombie rise from floor |
| **Ranged gauntlet** | 2 archers elevated + 2 melee blocking path | 2× Skeleton Archer + 2× Slime |
| **Elite room** | 1 tier-2 enemy + 2 tier-1 support | Golem + 2× Skeleton |
| **Swarm room** | 8–12 tier-1 enemies spawn in waves | 3 waves of 4× Imp |
| **Puzzle room** | Enemies locked behind pressure-plate gates, must be activated in order | — |
| **Boss room** | 1 tier-3 boss + periodic minion spawns | Dragon Whelp + wave Skeletons |

- [x] `RoomEncounterDef.ts`: typed structure `{pattern, tier, enemies[], waveCount?, spawnPositions?}` — **done.** 8 encounter pools (floors 1–2, 4–9) with all archetypes from the table above.
- [x] `TowerFloorDef.ts`: each floor gets `encounterPool: RoomEncounterDef[]` — **done.** All combat floors wired.
- [x] `SceneManager.ts`: on room enter, reads encounter def → seeds enemy selection by room ID → spawns enemies (currently falls back to SlimeEnemy stand-in until `EnemyLoader.ts` lands)
- [x] Wave spawner: for swarm rooms, spawn next wave after N kills (configurable `waveKillThreshold`) — `_waveState` in `SceneManager.ts`, validated in `RoomEncounterDef.ts`, 7 unit tests in `tests/levels/waveSpawner.test.ts`
- [x] Room-cleared reward: glowing orb spawned at room centre on all-enemies-dead — `_spawnClearReward()` in `SceneManager.ts`; proximity pickup (1.2 WU) fires `onRewardOrbPickup` callback
- [x] Room-cleared reward: glowing orb spawned at room centre — `SceneManager._spawnClearReward()`, proximity pickup (1.2 WU), `onRewardOrbPickup` callback, auto-removes after 18s
- [x] **Unit test:** `tests/levels/encounterDef.test.ts` — 32 tests: all pools valid, wave counts sensible, boss on floor 9 only, TowerFloorDef wiring
- [ ] **Playwright:** Enter ambush room → all enemies spawn → kill all → room-cleared chest appears → interact → loot

### B4 — Enemy AI Pass
- [x] Tier-1 melee: `PatrolThenChase` FSM (`src/enemy/PatrolBehavior.ts`) — patrol waypoints → 8u detect → alert (shout) → chase → melee attack with cooldown. `setPatrolBehavior(opts)` on `SlimeEnemy` enables patrol for an encounter.
- [x] Tier-1 ranged: `StationaryShootBehavior` (`src/enemy/PatrolBehavior.ts`) — alert → aim → shoot on cooldown (foundation; full projectile hookup in D-phase).
- [x] Tier-2: `TacticalBrute` — melee + special ability (25s CD stomp), retreat-to-heal at <20% HP — `TacticalBrute` class in `PatrolBehavior.ts`
- [ ] Elite/Boss: bespoke per-enemy behaviour tree (see game-ai skill)
- [x] Death model fade: `_modelFadeTimer` on SlimeEnemy drives attached `EnemyRig` mesh opacity from 1→0 over 1.5s via `_driveRigAnimation` in SceneManager. Death also plays `rig.clips.death` clip.
- [x] Aggro system: `AggroSystem` singleton (`src/enemy/AggroSystem.ts`) — enemies register on spawn, unregister on death. `shout(shouter)` broadcasts detection to all listeners within 8u radius, rate-limited to 1 shout per 2s per enemy.
- [x] EnemyRig animation driven by SlimeEnemy FSM state: idle→`idle`, chase→`run`, attack→`attack`, dead→`death` (fuzzy clip-name matching, graceful null fallback).
- [x] SceneManager: patrol encounters generate room-corner waypoints; patrol enemies spawn with offset waypoint start for varied patrol loops. AggroSystem cleared on room teardown.
- [x] **Unit test:** `tests/enemy/enemyAI.test.ts` — 21 tests: all FSM state transitions with mocked player distances, AggroSystem broadcast radius + rate-limit + clearAll

---

## PHASE C — Quest Lines (Species + General)
> **Goal:** 5 fully implemented, lore-correct, non-generic quests per species + 5 general quests. Each has: intro dialogue, 2–4 beats, unique reward, resolution text.

### C1 — Quest Architecture
- [x] Extend `StoryQuestLine.ts` beat types: `read_lore` ✅, `talk_to_npc` ✅, `defeat_elite` ✅, `reach_location` ✅, `craft_item` ✅
- [x] `QuestReward` type: `{xp, itemId?, spellId?, statBonus?, unlockZone?, label}` — added to `StoryQuestLine.ts`
- [x] `StoryRunner.ts`: `StoryTickState` extended with `completedNpcDialogues: ReadonlySet<string>` and `eliteEnemiesKilled: ReadonlySet<string>`; all beat types handle the new objectives
- [x] `QuestJournal.ts`: extends `QuestLog` — separate species-quests tab (story_ prefix) from world-quests tab; `[J]` key opens, click tab to switch, `setSpeciesTitle()` sets the story arc name
- [x] Quest-giver NPCs: 3 archetypes placed procedurally — `quest_giver` in VILLAGE/TOWN/CITY role lists, `settlement_elder` in TOWN/CITY, `mysterious` auto-spawns at each ruin with dedicated greeting + quest-hint banks

### C2 — Human Princess Quests (5 quests)

| # | Title | Lore Hook | Beats | Reward | Difficulty |
|---|---|---|---|---|---|
| H1 | **The Forsworn Garrison** | A ruined guard post near the tower once belonged to her kingdom — its banner still flies. | (1) Reach ruined post → (2) Defeat 8 guards-turned-bandit → (3) Raise her kingdom's banner | `+25% melee damage`, `banner wall decoration` | Easy |
| H2 | **The Debt of Iron** | A blacksmith in the settlement is being extorted by a gang. She recognises the extortion tactic — it's her captor's signature. | (1) Talk to blacksmith → (2) Find gang camp, defeat gang leader → (3) Return, receive custom sword (procedural prop) | `unique melee weapon skin: Forgeborn Blade` | Medium |
| H3 | **Letters Never Sent** | She finds a bundle of letters addressed to the baron — in Solmor's handwriting, apologising for "the incident involving the candidate." | (1) Read letters in archive → (2) Reach Baron's Keep outpost → (3) Deliver letters, gain baron's grudging respect or refuse and fight | `unlock Baron's Keep merchant NPC` OR `+20% attack vs Baron guards` | Medium |
| H4 | **The Binding Circle** | The circle under the rug on floor 0 is still active — she can feel it pulling at her agency. Destroying it requires three reagents. | (1) Identify circle (read lore book) → (2) Gather 3 reagents from overworld nodes → (3) Craft Disruption Reagent → (4) Apply to circle | `permanent passive: Unbound — +15% movement speed`, `circle decoration removed` | Hard |
| H5 | **Heir Apparent** | Rumour: the kingdom she was taken from has fallen. She can reclaim it or let it go. A wandering knight carries the royal seal. | (1) Find knight NPC → (2) 3 beats: defeat claimants at 3 camps → (3) Plant her banner at the ruined castle spire | `title: Heir Reclaimed`, `full-tower banner decoration set`, `+1 party capacity` | Very Hard |

### C3 — Undead Princess Quests (5 quests)

| # | Title | Lore Hook | Beats | Reward | Difficulty |
|---|---|---|---|---|---|
| U1 | **The Bones That Know** | Her own skeleton keeps finding north — an old compass enchantment from before she died. Something is buried there. | (1) Follow compass direction to marked dig site → (2) Defeat burial guardians → (3) Unearth memory crystal (read lore) | `unique passive: Bone Compass — reveals nearest chest on map` | Easy |
| U2 | **A Decent Grave** | She finds another undead wandering the bog — someone else Solmor woke up and abandoned. They want peace. | (1) Talk to lost undead NPC → (2) Find their original grave in the graveyard biome → (3) Return and escort back → (4) Ritual dismiss | `+1 undead follower slot`, `gain follower: The Wanderer (ghost)` | Easy |
| U3 | **The Necromancer's Notes** | Solmor's basement has research notes on "controlled ascension suppression" — someone was trying to stop the undead from ascending again. Her? | (1) Read specific archive book → (2) Find the suppression artefact in dungeon room 8 → (3) Destroy or keep it | `destroy: +30% max HP` OR `keep: unlock Suppression spell (debuff)` | Medium |
| U4 | **What I Was** | A portrait in the manor basement shows her — alive, human, a century ago. Solmor painted it. | (1) Find portrait (read lore) → (2) Track down the village she came from (overworld zone) → (3) Confront the ruins → (4) Read the last village record | `unlock memory-flash cutscene`, `permanent passive: Recalled — spells deal +10% damage` | Hard |
| U5 | **The Final Death** | She can choose to end her own undead state — but only if she defeats the lich that sustains this entire region's undead field. | (1) Find lich lair entry (lore clue chain) → (2) Three-phase lich boss fight → (3) Binary choice: absorb power or release it | `absorb: unlock Lich Form ability (boss-tier power)` OR `release: restore humanity, swap model to human_warrior` | Very Hard |

### C4 — Vulperia Princess Quests (5 quests)

| # | Title | Lore Hook | Beats | Reward | Difficulty |
|---|---|---|---|---|---|
| V1 | **Scent Trail** | There was another Vulperia here before her. She can smell it — weeks old, heading east. | (1) Follow scent trail (interact 5 trail markers) → (2) Find camp → (3) Read their abandoned journal | `unlock new overworld camp site`, `+5 stealth base` | Easy |
| V2 | **The Information Market** | A hooded merchant NPC knows something about the tower's history — but they want a piece of intel first. | (1) Talk to merchant → (2) Infiltrate Baron's outpost, read patrol schedule (steal document) → (3) Trade it | `unlock rare item merchant`, `+10% loot gold rate` | Medium |
| V3 | **Contracts and Consequences** | A hunters' guild (procedural NPC guards built with `buildNpc(dna)`) has a bounty on her — placed anonymously. | (1) Intercept bounty hunter encounter → (2) Track back to guild hall → (3) Discover Solmor placed the bounty → (4) Confront guildmaster | `guild becomes neutral`, `unlock Hunter's Contract board (daily challenges)` | Medium |
| V4 | **The Locked Room** | Floor 3 of the wizard's tower has a room with no key listed anywhere. Her nose says someone has been in there recently. | (1) Find hidden door (interact correct wall tile) → (2) Solve 3-pressure-plate puzzle → (3) Discover Solmor's personal trophy room | `unlock Solmor's Sanctum side room`, `unique staff weapon prop`, `lore document: The Previous Candidates` | Hard |
| V5 | **The Long Game** | She's been playing the wizard's game since day one. Now she can flip it — place her own agent in his tower's automated warning system. | (1) Find warning glyphs on all 4 tower corners → (2) Deactivate each (combat + puzzle) → (3) Reprogram with her own sigil | `tower alert system disabled (enemies don't reinforce)`, `title: The Architect` | Very Hard |

### C5 — Slime Princess Quests (5 quests)

| # | Title | Lore Hook | Beats | Reward | Difficulty |
|---|---|---|---|---|---|
| S1 | **The Original Sample** | There's a jar in the alchemy lab labelled "Original Culture — DO NOT OPEN." It smells like home. | (1) Interact with jar (read lore) → (2) Choose: open it → discover it's a relative → (3) Talk to released slime NPC | `gain follower: Elder Slime (tank companion)` | Easy |
| S2 | **Consistent Mass** | She keeps losing parts of herself in certain dungeon rooms — something is absorbing her. A counter-absorption ritual requires 5 dungeon herbs. | (1) Read relevant lore book → (2) Gather 5 specific herbs across floors → (3) Craft Mass Stabiliser → (4) Apply in affected room | `permanent passive: Stable Form — no HP loss in environmental hazards` | Easy |
| S3 | **The Philosophy of Violence** | A bound elemental in the dungeon challenges her: why fight? She can argue, absorb, or free it. | (1) Reach room with bound elemental → (2) Choose: debate (intelligence check dialogue) / absorb (combat) / free (altruism) | `debate: +15 intelligence`, `absorb: unlock Elemental Absorption spell`, `free: +1 slime follower cap` | Medium |
| S4 | **Dissolution Theory** | Old alchemical notes suggest a slime of her size could dissolve the tower's foundation wards — accidentally or on purpose. | (1) Collect 4 ward stones from boss rooms → (2) Read dissolution theory book → (3) Binary: dissolve wards (aggressive route) or stabilise them | `dissolve: tower unlocks secret sub-floor B2`, `stabilise: +25% max HP`, both give unique lore text | Hard |
| S5 | **What Is A Princess** | The wizard's own philosophical notes address the question. His answer is wrong. She can prove it. | (1) Complete all 4 other slime quests → (2) Read Solmor's treatise (final archive lore doc) → (3) Final monologue choice: 4 species-aware responses | `unlock title: Self-Defined`, `personal-canon cutscene`, `unique UI colour skin` | Very Hard |

### C6 — General Quests (5 quests, available to all species)

| # | Title | Available | Beats | Reward | Difficulty |
|---|---|---|---|---|---|
| G1 | **The Missing Familiar** | Post-tutorial | A cat-sized constructs wanders the overworld. Talk to it, escort it back to the tower, it becomes a permanent companion. | `Cat Familiar follower: grants map reveal in 15u radius` | Easy |
| G2 | **Supply Line** | After settlement discovered | Settlement needs medicine plants. Gather 8 medicinal herbs from forest biome. Return. Town becomes friendly. | `Settlement merchant discount 20%`, `+1 alchemy recipe` | Easy |
| G3 | **The Ruined Greenhouse** | After overworld unlocked | Full restoration: defeat guardians, gather 5 rare seeds from different biomes, plant them. | `Greenhouse restored: produces 1 rare reagent/in-game day`, `new biome area visual` | Medium |
| G4 | **The Baron's Complaint** | After Baron's Keep visible | The Baron has been writing strongly-worded letters about the wizard. He'll stop fighting her if she delivers them to Solmor's door. | `Baron's Keep becomes neutral territory`, `unlock Baron's merchant (sells unique armour)` | Medium |
| G5 | **The Ninth Tower** | After floor 9 cleared | Evidence in the observatory suggests this is the *ninth* tower Solmor has built. The others are ruins. Maps to them exist in his archive. | `Unlock 3 ruin dungeons on overworld (endgame content)`, `lore document: The Eight Failures` | Very Hard |

---

## PHASE D — Abilities, Spells & Talent Trees (Species + Subspecies)
> **Goal:** Each species feels mechanically distinct. Each subspecies specialisation doubles down on one playstyle. Progression is satisfying and non-obvious.

### D1 — Combat Architecture
- [x] `AbilitySystem.ts`: `ManaPool` (100 max, 8/s regen), `AbilitySystem` (4 slots, trycast pipeline, CD tracker, mana check), `AbilityCastContext` interface, `applyCharacterAbilities()` registry
- [x] `TalentTree.ts` (existing star-map UI ✓) + `TalentSystem.ts` (existing 26 nodes ✓)
- [x] `InputManager.ts`: `ability1` Q, `ability2` R, `ability3` Z, `ability4` X added to `InputState`
- [x] `main.ts`: `AbilitySystem` created alongside `SpellSystem`; Q/R/Z/X trigger `abilities.trycast(0..3, ctx)` in game loop
- [x] HUD ability bar: cooldown fill + mana bar display for Q/R slots — `HUD.ts` ability bar section (Q/R/Z/X glyphs, cooldown arcs, mana bar)
- [ ] Melee weapon flavour: species default weapon from charManifest

### D2 — Human Abilities & Talent Tree

**Species passive:** `Iron Will` — HP below 25%: all damage reduced by 20%

| Subspecies | Combat Style | Unique Abilities |
|---|---|---|
| `human_warrior` | Melee tank | `Shield Bash` (stun), `War Cry` (AoE taunt), `Fortify` (damage shield) |
| `human_mage` | Ranged spell-caster | `Arcane Bolt` (fast single), `Mana Shield` (converts HP to barrier), `Ley Tap` (restore mana from environment) |
| `human_ranger` | Mobile skirmisher | `Trick Shot` (ricochets x2), `Smoke Bomb` (invisibility 3s), `Eagle Eye` (range +40%) |
| `human_noble` | Support/buffer | `Rally` (heal AoE), `Denounce` (enemy defence down), `Command` (follower acts independently) |

**Human Talent Tree (26 nodes, 3 paths):**
- **Path: Steel** — Warrior nodes: +HP, +melee dmg, unlocks `Whirlwind`, `Parry`, `Execute` (instakill <10% HP)
- **Path: Arcana** — Mage nodes: +mana, +spell power, unlocks `Amplify` (next spell x2 dmg), `Counterspell`, `Spell Surge`
- **Path: Crown** — Noble/ranger nodes: +party capacity, +follower buff, unlocks `Inspiration` (party attack buff), `Decree` (pacify 1 enemy)

### D3 — Undead Abilities & Talent Tree

**Species passive:** `Undying Hunger` — On kill, restore 5% max HP

| Subspecies | Combat Style | Unique Abilities |
|---|---|---|
| `undead_lich` | Spell-caster (death magic) | `Death Bolt`, `Curse of Frailty` (defence shred), `Soul Harvest` (kill = bonus damage stack) |
| `undead_vampire` | Life-drain melee | `Drain Life` (melee heals), `Bat Form` (move speed dash), `Blood Frenzy` (+damage per 5% HP missing) |
| `undead_skeleton` | Fragile fast melee | `Bone Rattle` (fear aura 2s), `Brittle Armour` (sacrifice defence for attack), `Reassemble` (full HP once per battle) |
| `mystery_undead` | Spectral wild-card | `Phase Shift` (intangible 1.5s), `Possession` (control weak enemy 8s), `Spectral Scream` (AoE stagger) |

**Undead Talent Tree (3 paths):**
- **Path: Death** — +spell power, +curse duration, unlocks `Death Coil`, `Animate Dead` (revive 1 fallen enemy as ally), `Lich Form` (temporary boss-tier buff)
- **Path: Blood** — +life steal, +movement, unlocks `Feral Leap`, `Crimson Veil` (invis when HP full), `Exsanguinate` (AoE drain)
- **Path: Bone** — +armour while low HP, +fear proc chance, unlocks `Bone Shield`, `Skeletal Army` (summon 3 skeletons), `Undying` (revive once per zone)

### D4 — Vulperia Abilities & Talent Tree

**Species passive:** `Predator's Eye` — First hit on each new enemy always crits

| Subspecies | Combat Style | Unique Abilities |
|---|---|---|
| `fox_rogue` | Burst stealth assassin | `Shadow Step` (teleport behind target), `Eviscerate` (bleed DoT), `Vanish` (enter stealth mid-combat) |
| `fox_ranger` | Kiting ranged | `Scatter Shot` (pierces 3 enemies), `Trap` (places snare), `Hunter's Mark` (+25% damage vs marked) |
| `fox_mage` | Illusion/tricks | `Illusion Clone` (decoy draws aggro), `Fox Fire` (persistent homing orb), `Mirage` (reflect one projectile) |
| `fox_mysterious` | Adaptable hybrid | `Read the Room` (reveals all enemy health bars), `Borrowed Time` (slow time 2s), `Wild Card` (random powerful effect) |

**Vulperia Talent Tree (3 paths):**
- **Path: Shadow** — +stealth duration, +crit damage, unlocks `Marked for Death`, `Assassinate`, `Ghost Step` (no aggro radius)
- **Path: Hunt** — +trap effectiveness, +range, unlocks `Multi-trap`, `Predator's Patience` (damage scales with time since last hit), `Pack Hunter` (followers deal +30% damage)
- **Path: Cunning** — +effect proc chance, +dodge roll distance, unlocks `Smoke Screen`, `Counterfeit` (copy an enemy's own ability once), `The Long Con` (passive +10% all rewards)

### D5 — Slime Abilities & Talent Tree

**Species passive:** `Amorphous` — Immune to knockback; take 15% reduced fall damage

| Subspecies | Combat Style | Unique Abilities |
|---|---|---|
| `slime_young` | Generalist fluid combatant | `Acid Spit` (DoT ranged), `Engulf` (hold enemy briefly), `Split` (create small slime ally that fights for 10s) |
| `slime_ancient` | Heavy area-denial | `Slick Floor` (slowing terrain 8s), `Corrosive Aura` (constant AoE dmg around player), `Reforming` (regenerate 3% HP/s out of combat → 8s) |
| `slime_crystal` | Ranged crystal-type | `Crystal Shard` (projectile bounces), `Prismatic Burst` (multi-direction), `Crystallise` (freeze one enemy solid 4s) |
| `slime_shadow` | Stealth/trap | `Mimic` (disguise as prop for 6s), `Slime Mine` (place invisible trap), `Dissolve` (pass through locked doors) |

**Slime Talent Tree (3 paths):**
- **Path: Acid** — +DoT damage, +AoE radius, unlocks `Melt Armour`, `Acid Rain` (zone), `Dissolution` (boss executes <5% HP)
- **Path: Mass** — +HP, +engulf damage, unlocks `Consume` (absorb small enemies permanently for HP), `Great Maw` (larger engulf), `Apex Predator` (+1% max HP per kill this zone)
- **Path: Form** — +split clone power, +mimic duration, unlocks `Twin Body` (permanent small clone companion), `Polymorphic` (change appearance to any absorbed enemy type), `Void Form` (true invisibility 5s)

### D6 — Implementation Tasks
- [x] `AbilitySystem.ts`: cast pipeline, cooldown tracker, mana check, `applyCharacterAbilities()` dispatcher
- [x] TalentSystem wiring to per-species signature nodes — `allowedSpecies` field on `TalentNode`, `activeSpecies` on `TalentSystem`, wired from `main.ts` after character creation; 4 species-gated cross-tier nodes added (`sp_human_iron_will`, `sp_undead_undying`, `sp_vulperia_predator`, `sp_slime_amorphous`)
- [x] Alpha abilities — 2 per species (8 total): **Human** Shield Bash + War Cry | **Undead** Death Bolt + Phase Shift | **Vulperia** Shadow Step + Scatter Shot | **Slime** Acid Spit + Engulf — all with geometry VFX
- [x] Species passives stubs: `getSpeciesPassive(characterId)` returns correct passive handler
- [x] HUD ability bar (Q/R glyphs, cooldown arcs, mana fill bar) — `HUD.ts` ability bar, `main.ts` updates each frame
- [ ] Talent tree screen: integrate with species-specific paths (D2–D5 data → UI)
- [x] **Unit test:** `tests/combat/abilitySystem.test.ts` — 24 tests covering ManaPool, trycast pipeline, species assignments
- [ ] **Playwright:** Open talent tree, spend 3 points, close, verify passive bonuses on stat display

---

## PHASE E — Act I Story Arcs + Solmor Encounter
> **Selected from TODO.md as the 2 most gameplay-impactful pending phases.**
> These two complete the narrative backbone that turns the alpha into a *game* rather than a demo.

### E1 — Act I Species Story Arcs (full implementation)

Each Act I arc is 4 beats (same beat infra as prologue) with a proper dramatic arc and species-specific flavour. Uses the new beat types from Phase C1.

| Species | Arc Title | Arc Summary | New Beat Types Used |
|---|---|---|---|
| Human | **Raiders on the Rise** | A war band has been raiding settlements. She realises they're following orders from someone with access to tower knowledge. The trail leads to one of Solmor's "previous candidates" gone rogue. | `defeat_elite`, `reach_location`, `talk_to_npc` |
| Undead | **Why Am I Moving?** | She finds a lore-book in a dungeon that describes the mechanism of her own undeath. The mechanism has a maintenance point — down in the bog shrine. | `read_lore`, `reach_location`, `survive_wave` |
| Vulperia | **Someone Wants You Dead** | A bounty hunter finds her on floor 3. The contract originated from within the Baron's Keep. She must infiltrate, find the issuer, and decide: kill, blackmail, or expose. | `reach_location`, `defeat_elite`, `talk_to_npc` |
| Slime | **What Is This?** | She absorbs something she shouldn't. A dormant personality fragment of the previous slime candidate surfaces. The fragment knows a way out that isn't the front door. | `read_lore`, `interact_key` (secret door), `survive_wave` |

- [x] Write full beat dialogue + completion text for all 4 arcs — **existing content in `StoryQuestLine.ts`** covers all 4 species with Act I–IV beats each
- [x] `read_lore` beat type: `BookReader.ts` fires → `_booksReadCount` increments → `StoryRunner.tick()` checks delta since beat start ✓
- [x] `talk_to_npc` beat type: `NPCEntity.ts` wired → `completedNpcDialogues` set → `StoryRunner.tick()` checks ✓ (E1/C1)
- [x] `defeat_elite` beat type: enemy `group.userData['enemyId']` → `_eliteEnemiesKilled` set (populated each frame when kills increase) → `StoryRunner.tick()` checks ✓
- [x] Place 4 Act I lore books in appropriate dungeon rooms via `chamberScatter` lecterns:
  - Human arc ledger: Floor 3 (Wizard's Chambers) — raiders with inside info
  - Vulperia arc contract: Floor 4 (Runic Forge) — bounty on fox-eared candidate
  - Undead arc maintenance notes: Floor 5 (Minion Barracks) — suppression ward degrading
  - Slime arc incident report: Floor 7 (Botanical Lab) — previous slime absorbed a personality fragment
- [x] Place 2 NPC encounter triggers in overworld — `characterSpecies` on `OverworldScene`; vulperia → bounty hunter south-east of tower; undead → wandering scholar west of tower; both tagged with `_isSpeciesEncounter` for StoryRunner

### E2 — Arcanist Solmor — The Return
- [x] `SolmorDialogueTree.ts`: 3-stage species-aware dialogue tree with full written content, localStorage stage tracking, `showSolmorEncounter(stage, species, onComplete)` modal with E-to-advance keyboard, Stage 3 choice buttons → stores `tt3_solmor_choice_s3`
- [x] `main.ts`: `onExitTrigger` checks `_towerPrologueDone && getSolmorStage() < 1` → fires Stage 1 on first tower exit; resets on new game. Stage 1 dialogue: surprised-businesslike, tries to hire, reveals he's been watching.
- [x] Stage 2 dialogue: candid, explains ascension cycle research, acknowledges failures. Stage 3 dialogue: full vulnerability, the "what do you want to do with what you are?" choice.
- [x] Solmor 3D character spawned at tower entrance — `SolmorPresence.ts` loads `wizards/toad/mesh.glb`, shown after prologue, bobs + idles in exterior scene
- [x] Advance Solmor to Stage 2 when Act I begins (onActBegin hook in main.ts); Stage 3 when onStoryComplete fires

### E3 — Interactable System Completion
- [x] `locked_door` added to `InteractableType` and `VALID_INTERACTABLE_TYPES` in `blueprint.ts`
- [x] `InteractableSystem.onLockedDoor` callback added; handler in main.ts can check inventory and toast accordingly
- [x] Per-species staircase flavour text: `STAIR_FLAVOUR` object covers all 4 species × floors -1/1/2/3 ✓ (already implemented)
- [x] Binding circle on Floor 0 (undead species only): glowing rune disc at room centre, proximity triggers lore toast about suppression ward — `_spawnBindingCircle()` in `main.ts`
- [x] **Unit test:** `LockedDoor` — `tests/interactables/lockedDoor.test.ts` (4 tests: callback fires, out-of-range, multi-door nearest, missing content defaults)

---

## PHASE F — Testing Suite
> **Goal:** Every phase's work is covered by automated tests. Alpha ships with a fully green test suite.

### F1 — Unit Tests (`vitest`)
- [x] All new `RoomEncounterDef` pools validate correctly — existing `tests/levels/encounterDef.test.ts` (32 tests)
- [x] `AbilitySystem`: cooldown tracking, mana deduction, cast pipeline — `tests/combat/abilitySystem.test.ts` (24 tests)
- [x] `TalentTree`: node unlocking, prerequisite graph, point costs — `tests/progression/talentSystem.test.ts`
- [x] `QuestReward` + `StoryQuestLine` beat types — `tests/combat/storyRunner.test.ts` (30 tests: all 4 species lines, C1 beat types)
- [x] `StoryQuestLine`: `read_lore`, `talk_to_npc`, `defeat_elite` transitions — covered in storyRunner.test.ts
- [ ] `HouseBuilder`: all 3 archetypes build without Three.js errors in jsdom (HouseBuilder.ts not yet implemented)
- [x] `EnemyLoader`: manifest entries validated — `tests/levels/enemyLoader.test.ts` (11 tests)
- [x] `SolmorDialogueTree`: all 3 stage transitions — `tests/combat/solmorDialogue.test.ts`
- [x] Maintain baseline: 4 failing (2×towerGenerator .ts/.js — pre-existing)

### F2 — Smoke Tests (existing + new)
- [x] `main.startup.smoke.test.ts` stays green
- [x] New smoke: `overworld.startup.smoke.test.ts` — WorldGenerator + OWMinimap + OverworldScene modules import without throw
- [x] New smoke: `dungeon.startup.smoke.test.ts` — BlueprintRenderer + SceneManager construct without throw

### F3 — Playwright Playtests (automated E2E)
> Playwright runs against `vite preview` on localhost; screenshots saved to `test-results/screenshots/`

- [x] `tests/e2e/startup.spec.ts` — 7 tests: page loads without errors, canvas visible, __game present, startGame works, getPlayerPos/getGameMode/setGameSpeed APIs
- [x] `tests/e2e/campfire-intro.spec.ts` — 8 tests: overlay opens, char grid, state API, 4-species startGame, boon cards, name input, stress open/close, deterministic seed
- [ ] `tests/e2e/campfire-intro.spec.ts` — Full 4 species × 4 choice branches (needs campfire flow wiring)
- [x] `tests/e2e/tower-prologue.spec.ts` — 7 tests: game starts on F0, teleport, room transition, getCurrentFloor, story beat, Escape pause, HUD visible, no errors during movement
- [x] `tests/e2e/dungeon-room.spec.ts` — 7 tests: interior mode, floor transitions, getCurrentFloor, HUD kill counter, reward orb, movement, F9 boss floor no errors
- [x] `tests/e2e/talent-tree.spec.ts` — 7 tests: talent DOM exists, ability bar, mana bar, Q key, spell cast, dev mode no errors
- [x] `tests/e2e/quest-journal.spec.ts` — 6 tests: J key opens, 2 tabs, Escape closes, tab switch, close button, stress toggle
- [x] `tests/e2e/save-load.spec.ts` — 5 tests: localStorage round-trip, autoSave on floor transition, reload restores __game, multi-floor state
- [ ] `tests/e2e/house-interior.spec.ts` — Walk into settlement house; interior renders; walk out; no physics issues
- [x] All specs: `page.on('pageerror')` capture baked in

### F4 — Browser Dev Console Feedback
- [x] `vite.config.ts`: `logLevel: 'warn'` for production builds, `'info'` for dev (uses `defineConfig(({ mode }) => ...)`)
- [x] Playwright specs: each test captures `page.on('pageerror')` + `console.error` — `attachErrorCapture(page)` + `screenshotAndAssertClean()` added to `tests/e2e/helpers.ts`; startup spec migrated
- [x] `window.onerror` handler in `index.html` — posts to `/_dev/error` in dev; Vite plugin handles the endpoint
- [ ] Weekly: run `npx vite build && npx vite preview` + full Playwright suite on CI

---

## PHASE G — Polish, Performance & UI/UX HUD
> **Goal:** The alpha feels finished. Controls are crisp. HUD communicates clearly. Framerate is smooth on mid-range hardware.

### G1 — Performance
- [ ] **Frame budget audit:** Profile with Chrome DevTools. Target: 60fps on M1 / GTX 1060 equivalent
- [ ] `InstancedMesh` for all repeated environment (trees, rocks, dungeon tiles): batch count per scene ≤ 300 draw calls
- [ ] LOD system: procedural building/tree geometry gets simplified LOD at 50u+ — lower polygon counts via `THREE.LOD` at coarse `BuildingDNA.size`
- [ ] Texture atlasing: pack all small dungeon prop textures into a 2048×2048 atlas, reduce material count
- [x] Physics culling: `PhysicsWorld.ts` — `cullingRadius`/`cullingOrigin`; `step()` disables fixed bodies beyond 30u before Rapier solve, re-enables after; wired in `main.ts`
- [x] Spawn pooling: enemy `THREE.Group` objects pooled (max 30 live) — `SceneManager._acquireEnemy()` + `_returnToPool()` + `SlimeEnemy.revive()`
- [ ] Memory leak audit: run Chrome heap snapshot before and after 5-minute play session; diff > 50MB = fix
- [ ] **Unit test (perf guard):** `OverworldScene` with 500 instanced trees renders in < 16ms (mocked RAF)

### G2 — UI/UX Pass
- [x] HUD health bar: animated HP tick-down — `HUD.ts` `_displayedHp` lerp (200ms delay + smooth fill)
- [x] HUD spell glyphs: cooldown fill animation + number countdown — ability bar handles all 4 slots
- [x] Minimap: overworld only — `OWMinimap.ts`, canvas minimap in top-right, player dot + explored fog-of-war, toggle [M]
- [x] Quest tracker: show active quest name + current beat objective in bottom-right (collapsible) — `HUD.setQuestTracker({ title, beat })`, click to collapse, `null` to hide
- [x] Damage numbers: floating text pops on hit — `DamageNumbers.ts`, wired in `main.ts` (damage=red, heal=green, crit=large yellow)
- [x] Enemy health bars: thin bar above enemy head, visible within 15u — `EnemyHealthBars.ts`, wired in `main.ts`
- [x] Interaction prompt: `[E] Interact` label — `InteractableSystem.ts` world prompt; `NPCEntity.ts` interact-range detection
- [x] Screen-space hit flash: brief white vignette when player takes damage — `hud.flashHit()` CSS pulse in `HUD.ts`
- [x] Low HP warning: HUD border pulses red below 25% HP — `hud-low-hp-overlay` CSS keyframe in `HUD.ts`
- [x] Death screen: full-screen fade + "You Fell" text + Respawn / Load buttons — `DeathScreen.ts`, wired in `main.ts`
- [x] Loading screen: floor name title card shown at peak-black during room transitions — `SceneManager.ts` floor title card with Solmor quote slot

### G3 — Game Feel Polish
> Uses game-feel skill techniques

- [x] Screen shake on heavy melee hit + explosion + player death — `CameraRig.shake()`, called in `main.ts` at all impact events
- [x] Hit stop: 3-frame freeze on heavy hits — `gameLoop.freeze(2)` called in `main.ts` on hit events
- [x] Dodge roll: squash on launch (scale Y: 0.7), stretch at peak speed (scale Z: 1.3), land bounce — `PlayerController.ts` squash/stretch system on `bodyMesh`
- [x] Spell cast: camera FOV / zoom punch on fire — `CameraRig.zoomPunch()` called in `main.ts` on spell cast
- [x] Enemy death: dissolve shader (opacity 1→0 over 1.5s) + death clip — `_modelFadeTimer` on `SlimeEnemy`, driven in `SceneManager.ts` (knockback impulse pending)
- [x] Floor transition: wipe fade (0.4s) + floor name title card + ambient sound crossfade — `SceneManager.ts` fade transition with title card
- [x] Item pickup: radial glow pulse + pop scale animation — `src/ui/PickupVFX.ts` `spawnPickupVFX(scene, pos)`
- [x] Talent point unlock: particle burst + chime SFX — `src/ui/TalentUnlockVFX.ts`, wired into `TalentTree._tryBuy()`
- [ ] All SFX: final pass on timing, pitch variation ±8%, volume mix

### G4 — Controls & Accessibility
- [x] Keyboard rebinding: Settings → Controls tab — `InputManager.rebind()` wired to MainMenu `rebindControls` callbacks; persists to localStorage via `LS_BINDINGS_KEY`
- [ ] Gamepad support: left stick → WASD, right stick → look/aim, A/B/X/Y → action/dodge/interact/spell
- [x] Colour-blind mode: Settings toggle — `applyColourBlindMode()` in MainMenu replaces red/green with orange/blue; persists to localStorage
- [x] Text scale: Settings slider (80%–140%) — `applyTextScale()` in MainMenu; persists to localStorage
- [x] Subtitle captions for campfire dialogue — `FloatingDialogue3D._captionEl` DOM bar; on by default; `setCaptionsEnabled(bool)` toggle; persists to localStorage
- [ ] **Playwright:** Rebind one key, restart session, verify rebind persisted

---

## PHASE H — Documentation Update & Fundraising

### H1 — Update All .md Docs
- [x] `GDD.md` — updated: DEMO_RELEASE alpha status, 4-species table with passives, talent trees, species story arcs, general quests sections
- [x] `ARCHITECTURE.md` — updated: asset pipeline replaces No-Asset-Rule; full module tree for current src/; data flow diagram
- [ ] `STORY_DESIGN.md` — add all 5×4+5 quest summaries; add Solmor Stage 2+3 dialogue outlines
- [ ] `TODO.md` — tick completed items; add Phase A–G items as new sections
- [x] `README.md` — full rewrite: what you can do, highlights table, updated tech stack, controls, dev commands, bot scenarios, project structure
- [ ] `TESTING_AND_TOOLS.md` — document all new Playwright tests; add CI setup instructions
- [ ] `asset_models_todo.md` + `ASSETS_TODO.md` — update with inventory from Phase A1 manifest

### H2 — `fundraising_campaign.md`
> See companion file `fundraising_campaign.md` (created alongside this document).

---

## Delivery Milestones

| Milestone | Phases Complete | Target |
|---|---|---|
| M1 — Content Alpha | A + B + C | Environment/enemies/quests all in |
| M2 — Systems Alpha | D + E | Full abilities + Act I arcs + Solmor |
| M3 — Verified Alpha | F | Full test suite green |
| M4 — Polished Alpha | G | 60fps, polished UX, game feel |
| M5 — Launch Ready | H | Docs updated, campaign live |

---

## PHASE NS — New Species Expansion (Princess Creator Integration)
> **Goal:** The 21 princess-creator species become meaningful game choices, not just skins.
> Three species get **full Tier-1 treatment** (unique story arc, abilities, talent tree, lore).
> All 21 map correctly to a game species for abilities/story/talents.
> Campfire intro, Solmor dialogue, and staircase flavour text acknowledge every form.

---

### NS0 — Species Mapping & Infrastructure

**Current game species (4):** `human`, `undead`, `vulperia`, `slime`
**New Tier-1 species (3):** `elf`, `celestial`, `draconic`
**All 21 princess-creator species → game species map:**

| Princess Species | Game Species | Notes |
|---|---|---|
| `human`, `gnome`, `goblin`, `verdant`, `pixie` | `human` | |
| `elf`, `high_elf`, `fae` | `elf` *(new)* | Share Elf story arc |
| `celestial`, `naiad`, `moonborn` | `celestial` *(new)* | Share Celestial story arc |
| `draconic`, `ignis` | `draconic` *(new)* | Share Draconic story arc |
| `foxling`, `orc`, `troll`, `lamia` | `vulperia` | Existing Vulperia arc |
| `undead`, `specter`, `skeleton` | `undead` | Existing Undead arc |
| `slime` | `slime` | Existing Slime arc |

- [x] `SpeciesId` in `StoryQuestLine.ts` expanded: add `'elf' | 'celestial' | 'draconic'`
- [x] `SPECIES_MAP` in `StoryQuestLine.ts` extended for all 21 princess-creator species (via `princessSpecies` field on `CharacterConfig`)
- [x] `CharacterConfig.princessSpecies?: string` — set when custom princess mode is active, maps via `PRINCESS_SPECIES_MAP` in `PrincessDefaults.ts`
- [x] `speciesForCharacter()` extended to accept `princessSpecies` override
- [x] `applyCharacterAbilities()` routes to correct species ability set for princess characters — wired via `princessSpecies` → `_characterSpecies`
- [x] `TalentSystem.activeSpecies` works for all 7 game species

---

### NS1 — New Story Arcs (3 × 4-act, 16 beats each)

#### 🧝 Elf Arc — *"The Second Time Around"*
She has been here before. Not this tower — a different one. A different wizard. A different century. She is less surprised than she should be, which says something.

| Act | Title | Summary | Beat Types |
|---|---|---|---|
| Prologue | *The Tower, Again* | The staircase layout is different. The books are in the wrong order. These are the only comforts. | `explore_floor`, `interact_key` |
| Act I | *Something Familiar* | A book in the library is annotated in her own handwriting. She doesn't remember writing it. | `read_lore`, `talk_to_npc` |
| Act II | *The Previous Candidate* | Evidence suggests Solmor has imprisoned an elf before — centuries ago. The records were sealed. She unseals them. | `reach_location`, `defeat_elite` |
| Act III/IV | *The Graceful Exit* | She could leave with the knowledge she came for. She chooses to stay long enough to make it inconvenient. | All types |

- [x] Write full beat dialogue + completion text for Elf Act I–IV (16 beats)
- [x] Elf staircase flavour text: 4 floors (basement/lib/brew/chambers)
- [x] Elf Solmor Stage 1/2 dialogue variants — politely unsurprised, annotated book question
- [x] Elf lore book placed in Floor 2 (Brewing) — recipe in her handwriting, 3 centuries old

#### ⭐ Celestial Arc — *"Atmospheric Re-entry"*
She fell. This happens. The tower was just where she landed. She has filed a formal complaint with the relevant cosmic authority and is waiting for a response.

| Act | Title | Summary | Beat Types |
|---|---|---|---|
| Prologue | *The Landing* | The tower is cold. The ceiling has three cracks. She has counted them. | `explore_floor`, `interact_key` |
| Act I | *Gravity* | Something about the tower's wards is specifically suppressing her celestial connection. This is unusual. This is personal. | `read_lore`, `talk_to_npc` |
| Act II | *The Anchor* | A ward stone on floor 7 is the source. It was placed within the last fifty years. By someone who knew exactly what it would do. | `reach_location`, `defeat_elite` |
| Act III/IV | *Reconnection* | Destroy the anchor, feel the stars again. Then decide how to handle Solmor. | All types |

- [x] Write full beat dialogue + completion text for Celestial Act I–IV (16 beats)
- [x] Celestial staircase flavour text (4 floors)
- [x] Celestial Solmor Stage 1/2 variants — light discomfort, ward paper page 14
- [x] Celestial lore book placed in Floor 8 (Archive) — ward paper with her gold-star addendum

#### 🐉 Draconic Arc — *"The Fire That Stays"*
She isn't angry. She is very patient. The scales absorbing the wizard's ambient spellwork are a side effect; so is the faint smell of ozone. She has decided not to explain either.

| Act | Title | Summary | Beat Types |
|---|---|---|---|
| Prologue | *Heat Retention* | The tower is cooler than expected. The books are not fire-resistant. She adjusts. | `explore_floor`, `interact_key` |
| Act I | *The Hoard Instinct* | She keeps finding rooms she wants to claim. This is apparently cultural. She is documenting it. | `read_lore`, `reach_location` |
| Act II | *Old Claim* | The land the tower stands on was once draconic territory — several centuries ago. There are plaques. | `talk_to_npc`, `defeat_elite` |
| Act III/IV | *Reclamation* | She does not want the tower. She wants it acknowledged that she could take the tower. These are different. | All types |

- [x] Write full beat dialogue + completion text for Draconic Act I–IV (16 beats)
- [x] Draconic staircase flavour text (4 floors)
- [x] Draconic Solmor Stage 1/2 variants — sign suggestion, 3-day observation
- [x] Draconic lore book placed in Floor 4 (Runic Forge) — territorial treatise + sealed Appendix D

---

### NS2 — New Species Passives & Abilities

#### 🧝 Elf
**Passive:** `Long Memory` — Has seen this before. +10% XP from all sources. First encounter with each enemy type deals +20% damage (surprise advantage, only once per run per enemy type).

| Subspecies | Combat Style | Abilities |
|---|---|---|
| `elf_scholar` | Ranged / support | `Recall` (briefly replay last spell at no cost), `Arcane Library` (cycle through 3 equipped spells instantly), `Memory Palace` (reveal all lore in current floor) |
| `elf_wanderer` | Mobile / evasive | `Graceful Step` (dodge leaves a temp. root trap), `Centuries of Practice` (+20% damage when HP > 75%), `Slip Away` (disengage + 2s invis) |
| `elf_sage` | AoE crowd control | `Time Worn` (slow enemies within 6u for 3s), `Studied Weakness` (reveal enemy resistances on first hit), `Elder's Patience` (charge a 3x damage shot over 2s) |

- [x] Add `elf` to `AbilitySystem` routing in `applyCharacterAbilities()`
- [x] Implement `Recall` spell — mirrors last cast spell (calls existing SpellSystem cast with stored last-cast params)
- [x] Implement `Arcane Library` ability — cycle through equipped spells without cooldown penalty
- [x] Elf talent tree: Memory/Grace/Sage paths (6 nodes: elf_mem_1/2, elf_grace_1/2, elf_sage_1/2) + Long Memory signature
  - [ ] Add nodes to `TalentSystem.ts` with `allowedSpecies: ['elf']`

#### ⭐ Celestial
**Passive:** `Star-Touched` — Emits a faint light aura (3u radius, always on). Enemies within the aura have −10% hit rate. At night, all spells deal +15% damage and cost 10% less mana.

| Subspecies | Combat Style | Abilities |
|---|---|---|
| `celestial_dawn` | Burst ranged | `Starburst` (5-projectile spread), `Solar Flare` (brief blind all enemies), `Light Beam` (piercing beam, max range) |
| `celestial_dusk` | Defensive / debuff | `Moonveil` (3s damage immunity bubble), `Eclipse` (reduce enemy damage dealt by 30% for 5s), `Gravity Well` (pull enemies into cluster 4u) |
| `celestial_void` | Blink / repositioning | `Stellar Jump` (blink 8u toward cursor), `Void Touch` (next melee hit phases through armour), `Singularity` (summon point that auto-absorbs nearby projectiles) |

- [x] Add `celestial` to `AbilitySystem` routing
- [x] Implement `Starburst` — 5-projectile spread (reuse existing projectile system with angle offsets)
- [x] Implement `Moonveil` — damage immunity window (extend existing i-frames system duration)
- [x] Celestial talent tree: Dawn/Dusk/Void paths (6 nodes: cel_dawn_1/2, cel_dusk_1/2, cel_void_1/2) + Star-Touched signature
  - [ ] Add nodes with `allowedSpecies: ['celestial']`

#### 🐉 Draconic
**Passive:** `Scale Armour` — Takes 15% reduced physical damage. Deals +20% damage when above 75% HP. Fire-type spells cost 20% less mana.

| Subspecies | Combat Style | Abilities |
|---|---|---|
| `draconic_fire` | Aggressive burst | `Breath` (cone fire attack, 3u range), `Ignite` (apply burn DoT, 5s), `Dragon Rage` (15s buff: +40% damage, −20% defence) |
| `draconic_scale` | Melee tank | `Harden` (block next 3 hits completely), `Tail Sweep` (360° knockback), `Roar` (AoE fear 2s, enemies flee) |
| `draconic_void` | Debuff / drain | `Acid Scale` (shed scales that deal DoT on contact), `Corrode` (reduce enemy armour 50% for 4s), `Ancient Fire` (slow-moving large orb that phases through enemies) |

- [x] Add `draconic` to `AbilitySystem` routing
- [x] Implement `Breath` — cone hitbox (new geometry hitbox, fan-shaped, 3u × 45°)
- [x] Implement `Harden` — block counter (integrate into PlayerController.takeDamage())
- [x] Draconic talent tree: Fire/Scale/Void paths (6 nodes: dra_fire_1/2, dra_scale_1/2, dra_void_1/2) + Scale Armour signature
  - [ ] Add nodes with `allowedSpecies: ['draconic']`

---

### NS3 — Campfire Intro Dialogue (New Species)

The campfire wizard familiar conversation needs species-aware opening lines for all 7 game species. Currently only 4 are distinguished.

- [x] **Elf intro** — Familiar: *"Oh. You've been in a tower before, haven't you."* / She: *"Several. Though usually more intentionally."*
- [x] **Celestial intro** — Familiar: *"You're giving off a faint light. I find that either impressive or alarming."* / She: *"Both is acceptable."*
- [x] **Draconic intro** — Familiar: *"...your scales are absorbing the ambient magical field."* / She: *"I noticed. Is that a problem?"* / Familiar: *"For the tower, possibly."*
- [x] `CharacterDecisionTree.ts` extended: add `elf_scholar`, `elf_wanderer`, `celestial_dawn`, `celestial_dusk`, `draconic_fire`, `draconic_scale` as selectable `CharacterId`s
- [x] `NewGameFlow.ts` / `CharacterDecisionTree.ts`: species-aware choice branch flavour (the familiar's assessment of each species form — e.g., skeptical for elf, genuinely uncertain for celestial, slightly alarmed for draconic)
- [x] Character creation UI: show 3 new species sections in the model picker (Elf / Celestial / Draconic) with 2 subspecies each
- [x] Default DNA for each new species added to `PrincessDefaults.ts` (6 more entries: elf_scholar, elf_wanderer, celestial_dawn, celestial_dusk, draconic_fire, draconic_scale)

---

### NS4 — New Starting Boons (from CHARACTER_DESIGN.md)

| Boon | Effect | Fits Species |
|---|---|---|
| 🌿 **Herbalist's Gift** | Start with Minor Heal spell, herb yield +25% | Human / Verdant |
| 🌑 **Night-Touched** | +15% damage 18:00–06:00, passive: enemies can't detect you at range >12u at night | Undead / Moonborn / Specter |
| ⚡ **Static Charge** | Start with Lightning Bolt, +10% AoE radius on all spells | Any / Ignis |
| 🎭 **Silver Tongue** | NPCs give 2 extra dialogue options; merchants sell at −15% | Elf / Foxling / Goblin |
| 🔮 **Resonant Mind** | Spell cooldowns −20%, starting mana +30 | Celestial / High Elf / Mage |
| 🛡 **Tower-Trained** | Start with +20 HP, first hit in each new room deals 0 damage | Human Warrior / Draconic |

- [x] Add 6 new `BoonDef` entries to `DNACreator.ts` BOONS array — herbalist/night_touched/static_charge/silver_tongue/resonant_mind/tower_trained
- [x] `applyBoon()` in `main.ts` handles all 6 new boon effects
- [x] Night-touched runtime: `spellDamageMult` boosted to 1.15 at hours 18-6 via DayNightSystem loop
  - Herbalist's Gift → grant `minor_heal` spell + set `herbYieldMult` modifier
  - Night-Touched → register `DayNightSystem` listener that sets `mods.nightDamageBonus`
  - Static Charge → grant `lightning_bolt` spell + set `mods.aoeRadiusMult *= 1.1`
  - Silver Tongue → set `mods.silverTongue = true` (checked in NPCEntity dialogue)
  - Resonant Mind → set `mods.spellCooldownMult = 0.8` + grant 30 starting mana
  - Tower-Trained → apply +20 max HP + set `mods.firstHitImmune = true`

---

### NS5 — Species-Aware Solmor Encounters

The 3-stage Solmor dialogue tree needs branches for the 3 new Tier-1 species.

- [ ] **Elf — Stage 1:** He is confused — she seems completely unsurprised. She isn't. *"This is the third tower. The second wizard. You're the first to notice, which is either encouraging or more concerning."*
- [ ] **Celestial — Stage 1:** He is physically uncomfortable. She emits light. He tries to pretend this is normal. *"You're not what I was expecting."* / *"I know. I rarely am."*
- [ ] **Draconic — Stage 1:** He is trying to be professional but her scales have been absorbing his ambient spellwork for a week. *"You've been... uh... would you mind—"* / *"I'll stop absorbing it when you stop leaking it."*
- [x] `SolmorDialogueTree.ts` `showSolmorEncounter()` extended: accepts `species: SpeciesId` parameter (currently only uses 4 variants) — add `elf`, `celestial`, `draconic` branches for Stage 1/2/3
- [ ] Stage 3 choice text (the "what do you want to do with what you are?" question) gets species-specific answer options for all 7 species

---

### NS6 — New Lore Books & Environmental Storytelling

Each new Tier-1 species gets a species-specific lore book in the tower, distinct from the 4 currently placed.

- [ ] **Elf** — Floor 1 (Library): An annotated spellbook in her own handwriting from "about three hundred years ago." The handwriting is better. The margin notes are not.
- [ ] **Celestial** — Floor 7 (Botanical Lab, already has slime book): A paper titled *"Interim Report: Celestial Binding Efficacy at Ground Level"* with results marked **INCONCLUSIVE** in large letters.
- [ ] **Draconic** — Floor 9 (Observatory): A star chart with handwritten notes identifying three constellations as historically draconic territory claims. The notes are defensive.
- [ ] Implement via `chamberScatter` lectern entries on appropriate floors (matching the 3 new arcs)

---

### NS7 — Unit Tests (New Species)

- [ ] `tests/combat/storyRunner.test.ts` — extend: Elf/Celestial/Draconic story lines validated (acts.length, beat types, completionText, npcId/enemyId where required)
- [ ] `tests/combat/abilitySystem.test.ts` — extend: `applyCharacterAbilities()` returns correct sets for `elf_scholar`, `celestial_dawn`, `draconic_fire`
- [ ] `tests/princess-creator/defaults.test.ts` — PC1 tests: all 10 defaults (4 original + 6 new) produce valid `PrincessInstance` at `targetHeight: 1.6`
- [ ] `tests/princess-creator/speciesMapping.test.ts` — all 21 princess-creator species map to a valid game species via `PRINCESS_SPECIES_MAP`
- [ ] Existing `src/princess-creator/__tests__/` — run clean baseline (currently passing)

---

### NS8 — Creative Mode & Bot Updates for New Species

- [ ] Creative mode skin picker: show all 21 princess species organised by group (human/elf/celestial/draconic/vulperia/undead/slime) when custom princess mode is available
- [ ] Bot scenario `tests/bot/scenarios/princess-creator.ts`:
  - Open princess library, select "Maribel" (foxling default), start game
  - Verify foxling princess model spawns (height ≈ 1.6 WU)
  - Walk to floor 1, verify staircase toast is foxling-flavoured
  - Screenshot and close
- [ ] Register `princess-creator` scenario in `BotLauncher.ts`

---

## PHASE PC continued — Remaining Integration Items
*(from Phase PC above — moved here for ordering clarity)*

- [ ] PC3: `customPrincess: boolean` toggle on new-game card (default off)
- [x] PC3: `CharacterConfig.princessDna?: PrincessDNA` — set when custom mode on
- [ ] PC3: Persist toggle to `localStorage` key `ttt_custom_princess_mode`
- [ ] PC4: `PlayerController.applyPrincess(dna)` — `buildPrincess({targetHeight:1.6})`, attach `instance.root`, store for frame updates
- [ ] PC4: Game loop — `_princessInstance?.update(elapsedTime, dt)` each frame
- [x] PC4: On species selection, map princess species → game species via `PRINCESS_SPECIES_MAP`
- [ ] PC5: Dev Labs → "👸 Princess Atelier" opens `princess-creator.html` in new tab
- [x] PC5: Creative skin picker — princess creator gallery entries shown; no GLB skins
- [ ] PC5: `window.__game.buildPrincess(dna)` exposed for bot/test access
- [ ] PC6: `tests/princess-creator/defaults.test.ts` — 4 base defaults validate + build
- [ ] PC6: `tests/princess-creator/integration.test.ts` — `buildPrincess` height + non-empty clips per species

---

## Test Commands (reference)

```bash
# Unit + smoke tests
npx vitest run

# Playwright E2E (requires running dev server)
npx vite preview &
npx playwright test

# TypeScript check
npx tsc --noEmit

# Performance build check
npx vite build && npx vite preview
```

---

## Phase PROC — Full Procedural Pivot: Retire External Assets, Build Creator Ecosystem

> **Decision (2026-07-18):** Move completely away from external asset packs. Code-first only. The procedural princess rig already proves the aesthetic works.
> We will build dedicated procedural tools for every entity type, plus a full modular
> world-building system, then retire the old GLB pipeline.

### Two consumers of every builder — this is the core principle

Every builder (NPC, Enemy, Prop, Building) serves **two equally important consumers**:

1. **The game itself** — the runtime procedural world generator uses these builders
   to populate settlements, generate dungeon rooms, spawn NPC crowds, place enemies
   in encounters, fill interiors with furniture, and decorate every space.
   No human involvement needed. The game runs `buildBuilding(dna)` and `buildNpc(dna)`
   automatically from world-gen scripts exactly like it already runs `buildPrincess(dna)`.

2. **The designer** — creative mode and the standalone atelier tools let a human
   author custom blueprints, tweak them in the visual editor, save them to a gallery,
   and place them in specific world locations. Custom blueprints override the
   procedural defaults for named locations (e.g. "the inn in Ravenport" is always
   Mirabel's custom inn blueprint, not a random one).

**The builder code is shared.** The atelier tools and the game runtime call the exact
same `build*(dna)` function. The atelier just adds a UI layer around it.

> **Implementation order:** PROC-A (foundation) → PROC-B (creator tools + game runtime wiring)
> → PROC-C (world gen system) → PROC-D (creative mode integration)
> → PROC-E (asset pipeline removal)

---

### PROC-A: Procedural Foundation & Registry

**Goal:** Single registry that maps entity type → procedural builder. Both the game runtime
and the atelier tools resolve builders through the same registry.

- [x] A1: `src/procedural/EntityRegistry.ts` — central map: `'princess' | 'npc' | 'enemy' | 'prop' | 'building'` → builder factory; game systems import from here, not directly from builders
- [x] A2: `src/procedural/ProceduralDNA.ts` — shared base DNA interface with `v`, `seed`, `name`, `kind` fields; species-specific DNA extends it
- [x] A3: `src/procedural/builder/BaseBuilder.ts` — abstract builder with `build(dna): THREE.Group`, `update(t, dt)`, `dispose()`
- [x] A4: Share code system extended to all entity types (`P2.` prefix for princess, `N2.` for NPC, `E2.` for enemy, `B2.` for building)
- [x] A5: `src/procedural/WorldGen.ts` — top-level world generation coordinator: given a world `seed`, produces a deterministic placement plan for all buildings, NPCs, enemies, and props in a region
- [x] A6: `tests/procedural/EntityRegistry.test.ts` — registry resolves all known types without error
- [x] A7: `tests/procedural/WorldGen.test.ts` — same seed → identical placement plan every run

---

### PROC-B: Creator Tool Ecosystem

**Goal:** Each builder has two entry points:
- A **standalone atelier** (HTML tool) for human authoring and blueprint saving
- A **game-runtime API** called by the world generator and scene loading code

Both call the same underlying `build*(dna)` function.

#### B1: NPC Creator Atelier + Game Runtime (`npc-creator.html`)

**Atelier:** designer opens tool, chooses species/role/personality, tweaks appearance,
saves blueprint to gallery. Named NPCs in specific towns can be locked to a blueprint.

**Game runtime:** `NPCSpawner.spawnForSettlement(settlement, seed)` reads the settlement
DNA, picks NPC roles from the population table, resolves each role to either a named
blueprint (if one exists for that location) or generates one procedurally from the role
+ species defaults. Calls `buildNpc(dna)` and places the result in the scene.

- [x] B1a: `src/npc-creator/types.ts` — `NpcDNA` with fields: `species`, `role` (merchant | elder | quest_giver | scholar | guard | innkeeper | mysterious), `personality` (friendly | wary | eccentric | formal | cheerful), `bodyPreset`, `colors`, `accessory`, `dialogue_seed`
- [x] B1b: `src/npc-creator/builder.ts` — `buildNpc(dna)` → `NpcInstance` with `.root`, `.update(t,dt)`, `.speak(text)`, `.idle()`; called by BOTH the atelier preview AND the game's NPCSpawner
- [x] B1c: `src/npc-creator/archetypes/` — 6 species archetypes (human, undead, foxling, slime, elf, draconic) each with 3 role variants
- [x] B1d: `src/npc-creator/ui.ts` — Atelier UI: role picker, species wheel, color swatches, name generator, accessory slots (hat, badge, bag, tool)
- [x] B1e: `npc-creator.html` — standalone entry point; save to `ttt.npcCreator.gallery.v1` localStorage
- [x] B1f: `src/npc-creator/gallery.ts` — load/save/delete NPC blueprints, share codes
- [x] B1g: `src/npc-creator/defaults/NpcDefaults.ts` — 6 default NPC blueprints (one per species, role=merchant); used by NPCSpawner when no custom blueprint exists
- [x] B1h: `src/world/NPCSpawner.ts` refactor — `spawnForSettlement(settlementDna, seed)` resolves NPC list from population tier; calls `buildNpc(dna)` for every NPC; no more `loadCharModel()`
- [x] B1i: `src/world/NPCSpawner.ts` — named NPC override system: `NAMED_NPCS: Record<locationId, NpcDNA>` allows specific blueprint per named location
- [x] B1j: Tests — `tests/npc-creator/defaults.test.ts`, `tests/npc-creator/builder.test.ts`, `tests/npc-creator/spawner.test.ts`

#### B2: Enemy Creator Atelier + Game Runtime (`enemy-creator.html`)

**Atelier:** designer creates enemy blueprints by tier and role, tests them in a built-in
combat arena with a dummy player. Saves to enemy gallery.

**Game runtime:** `EnemyLoader.loadForEncounter(encounterId, floor, seed)` reads the
encounter definition, resolves enemy types to blueprints (named boss blueprints for
boss rooms, procedural tier-appropriate blueprints for random encounters), calls
`buildEnemy(dna)`, and hands the result to the combat system.

- [x] B2a: `src/enemy-creator/types.ts` — `EnemyDNA` with: `species`, `combatRole` (melee | ranged | caster | support | tank | swarm), `tier` (1–3), `bodyPreset`, `colors`, `weapon`, `ability`, `movementStyle` (patrol | charge | circle | ambush), `aggroRange`, `attackRange`
- [x] B2b: `src/enemy-creator/builder.ts` — `buildEnemy(dna)` → `EnemyInstance`; called by BOTH the atelier preview arena AND the game's EnemyLoader at room load time
- [x] B2c: `src/enemy-creator/archetypes/` — 5 combat archetypes: Brute, Skulk, Hexer, Warden, Swarmling — each buildable for any species
- [x] B2d: `src/enemy-creator/ui.ts` — Atelier UI: combat role picker, tier dial, weapon slot, ability slot, test arena with dummy player
- [x] B2e: `enemy-creator.html` — standalone entry; save to `ttt.enemyCreator.gallery.v1`
- [x] B2f: `src/enemy-creator/defaults/EnemyDefaults.ts` — default enemies per floor tier (floors 0–9 + basement); used by EnemyLoader for random encounters when no custom blueprint specified
- [x] B2g: `src/enemy/EnemyLoader.ts` refactor — `loadForEncounter()` reads encounter definition, resolves enemy list, calls `buildEnemy(dna)`; fully replaces old KayKit skeleton/zombie model loading
- [x] B2h: Boss enemies — `EnemyDNA.tier = 4` flag; boss creator tab in enemy atelier; boss blueprints stored as named entries (`boss_floor3`, `boss_floor7`, etc.)
- [x] B2i: Tests — `tests/enemy-creator/defaults.test.ts`, `tests/enemy-creator/builder.test.ts`, `tests/enemy-creator/encounter.test.ts`

#### B3: Prop & Item Creator + Game Runtime (`prop-creator.html`)

**Atelier:** designer creates prop blueprints (chests, furniture, dungeon dressing),
previews them in 3D, saves to gallery.

**Game runtime:** `PropPlacer.decorateRoom(roomDna, seed)` reads the room's floor theme,
queries the prop gallery for theme-appropriate blueprints, calls `buildProp(dna)` for
each, and scatters them within the room bounds using the room's placement grid.
This runs automatically every time a dungeon room is loaded.

- [x] B3a: `src/prop-creator/types.ts` — `PropDNA` with: `kind` (chest | bookshelf | table | chair | cauldron | lantern | pillar | rug | door | statue | barrel | crate), `material` (stone | wood | bone | crystal | iron | clay), `size`, `colors`, `glow`, `interactive`, `theme` (dungeon | library | alchemy | overworld | residential)
- [x] B3b: `src/prop-creator/builder.ts` — `buildProp(dna)` → `THREE.Group` with collision metadata + optional interaction zone; called by BOTH atelier preview AND PropPlacer at room-load time
- [x] B3c: 12 base prop archetypes with material and theme variants
- [x] B3d: `prop-creator.html` — standalone tool; drag-and-drop placement preview
- [x] B3e: `src/levels/PropPlacer.ts` — `decorateRoom(roomDna, seed)` queries prop gallery by theme, places props using seeded RNG; called by SceneManager after room geometry is built
- [x] B3f: Room floor themes drive prop palette: ground=study, 1=library, 2=lab, 3=observatory, basement=alchemy, settlement=residential
- [x] B3g: Tests — `tests/prop-creator/builder.test.ts`, `tests/levels/PropPlacer.test.ts`
- [x] B1g: `src/npc-creator/defaults/NpcDefaults.ts` — 6 default NPC blueprints (one per species, role=merchant)
- [x] B1h: `src/world/NPCSpawner.ts` updated — reads NPC blueprints from registry; `buildNpc(dna)` replaces old procedural DNA creature rig for all NPCs
- [x] B1i: Tests — `tests/npc-creator/defaults.test.ts`, `tests/npc-creator/builder.test.ts`

#### B2: Enemy Creator Atelier (`enemy-creator.html`)

The enemy creator focuses on combat role, threat level, and attack patterns — not story.

- [x] B2a: `src/enemy-creator/types.ts` — `EnemyDNA` with: `species`, `combatRole` (melee | ranged | caster | support | tank | swarm), `tier` (1–3), `bodyPreset`, `colors`, `weapon`, `ability`, `movementStyle` (patrol | charge | circle | ambush), `aggroRange`, `attackRange`
- [x] B2b: `src/enemy-creator/builder.ts` — `buildEnemy(dna)` → `EnemyInstance` with `.root`, `.update(t,dt)`, `.attack()`, `.takeDamage(n)`, `.die()`
- [x] B2c: `src/enemy-creator/archetypes/` — 5 combat archetypes: Brute, Skulk, Hexer, Warden, Swarmling — each buildable for any species
- [x] B2d: `src/enemy-creator/ui.ts` — Atelier UI: combat role picker, tier dial, weapon slot, ability slot, test arena with dummy player
- [x] B2e: `enemy-creator.html` — standalone entry; save to `ttt.enemyCreator.gallery.v1`
- [x] B2f: `src/enemy-creator/defaults/EnemyDefaults.ts` — default enemies per floor tier (floors 0–9 + basement)
- [x] B2g: `src/enemy/EnemyLoader.ts` updated — `loadEnemyById()` reads from enemy gallery + defaults; fully replaces old KayKit skeleton/zombie models
- [x] B2h: Boss enemies — `EnemyDNA.tier = 4` flag; boss creator tab in enemy atelier with custom phase definitions
- [x] B2i: Tests — `tests/enemy-creator/defaults.test.ts`, `tests/enemy-creator/builder.test.ts`, `tests/enemy-creator/combat.test.ts`

#### B3: Prop & Item Creator (`prop-creator.html`)

Furniture, interactables, treasure, dungeon dressing — all procedural.

- [x] B3a: `src/prop-creator/types.ts` — `PropDNA` with: `kind` (chest | bookshelf | table | chair | cauldron | lantern | pillar | rug | door | statue | barrel | crate), `material` (stone | wood | bone | crystal | iron | clay), `size`, `colors`, `glow`, `interactive`
- [x] B3b: `src/prop-creator/builder.ts` — `buildProp(dna)` → `THREE.Group` with collision metadata
- [x] B3c: 12 base prop archetypes with material variants
- [x] B3d: `prop-creator.html` — standalone tool; drag-and-drop placement preview
- [x] B3e: Room encounter definitions updated to reference prop blueprints instead of hardcoded geometry

---

### PROC-C: Procedural World Building System

**Goal:** Houses, buildings, dungeons, and interiors generated from modular DNA blueprints
at **runtime by the game** — not hand-placed. The same `buildBuilding(dna)` function
powers both the game's automatic world generation and the designer's creative mode placement.

When the game generates a new overworld region it calls:
```
WorldGen.generateSettlement(seed, settlementDna)
  → BuildingBuilder.build(buildingDna)          // exterior mesh
  → InteriorGenerator.build(interiorLayoutDna)  // interior rooms
  → PropPlacer.decorateRoom(roomDna, seed)       // furniture + props
  → NPCSpawner.spawnForSettlement(...)           // NPC crowd
```
All of this runs automatically from seeds — no human input required.
A designer using creative mode calls the same chain, but picks the DNAs manually.

#### C1: Modular Building Grammar

- [x] C1a: `src/world/buildings/BuildingDNA.ts` — `BuildingDNA` with: `kind` (house | shop | inn | guild | tower | ruin | barn | well | gate), `size` (tiny | small | medium | large), `floors` (1–3), `style` (thatched | stone | timber | arcane), `condition` (pristine | weathered | damaged | ruined), `has_interior: boolean`, `interior_layout`
- [x] C1b: `src/world/buildings/ModularSet.ts` — vocabulary of reusable geometry pieces: wall segment, door frame, window, roof pitch, corner post, chimney, step, arch — all built from `THREE.BufferGeometry` primitives with material variants
- [x] C1c: `src/world/buildings/BuildingBuilder.ts` — `buildBuilding(dna): BuildingInstance` with `.exteriorGroup`, `.interiorGroup`, `.doorTrigger`, `.bounds`
- [x] C1d: Roof system — hip / gable / thatched variants, auto-fit to footprint
- [x] C1e: Window and door placement — rule-based: one door per street-facing wall, windows every N units
- [x] C1f: Facade decoration — shutters, hanging signs, flower boxes, barrels at door — driven by `style` + `condition`

#### C2: Settlement Generator

- [x] C2a: `src/world/SettlementGenerator.ts` refactor — replaces current placeholder; lays out buildings on a grid using BuildingDNA, respects roads/paths
- [x] C2b: `SettlementDNA` — `{ size: 'hamlet'|'village'|'town'|'city', style, factionId, populationTier }`; generates building mix from population tier
- [x] C2c: Road system — stone/dirt path procedural geometry connecting all buildings
- [x] C2d: Public spaces — market square, well, notice board, fountain — placed by role
- [x] C2e: Lighting — procedural lantern placement along roads + building windows at night

#### C3: Interior Generation

- [x] C3a: `src/world/buildings/InteriorGenerator.ts` — takes `BuildingDNA.interior_layout` and generates: floor plan, room dividers, furniture placement (using PropDNA blueprints), lighting
- [x] C3b: Interior layouts by building kind:
  - House: main room + bedroom + optional cellar
  - Inn: common room + bar + 4–8 sleeping rooms upstairs
  - Shop: counter + display shelves + back storage
  - Guild: hall + meeting room + armoury/library
  - Ruin: collapsed walls, debris, loot spawn points
- [x] C3c: Furniture density by `condition` — pristine rooms are tidy, ruined rooms have overturned/destroyed versions
- [x] C3d: Door trigger → load interior scene (reuses SceneManager room system)
- [x] C3e: Interior ambient: candles, fireplace, dust particles — all procedural

#### C4: Dungeon Generation Enhancement

- [ ] C4a: Tile vocabulary expanded — corridor segment, junction, dead end, alcove, large chamber, trapped floor, magical circle — all procedural geometry
- [ ] C4b: Wall decoration system — torches, chains, reliefs, carvings — placed by floor theme and condition
- [ ] C4c: Floor themes per tower level (ground=study, 1=library, 2=laboratory, 3=observatory, basement=workshop) drive prop palette selection
- [ ] C4d: Procedural ceiling system — arches, vaulted, flat — vary by room type
- [ ] C4e: Loot container placement — chests, crates, shelves — rule-based by room type

---

### PROC-D: Creative Mode Integration

**Goal:** All creator tools accessible from creative mode. World editor gains building placement.

- [ ] D1: Creative mode sidebar — new "🧪 Creators" section with links to NPC, Enemy, Prop creator tools
- [ ] D2: World editor — "🏠 Place Building" mode: pick building blueprint from gallery, click to place in overworld, auto-generates interior
- [ ] D3: World editor — "👤 Place NPC" mode: pick NPC blueprint, click to place, set patrol route
- [ ] D4: World editor — "💀 Place Enemy" mode: pick enemy blueprint, click to place, set encounter zone
- [ ] D5: Prop placement in interiors — creative mode within interior scenes lets designers place props from gallery
- [ ] D6: Blueprint export — save entire settlement as a JSON "world blueprint" that the procedural generator can replay deterministically
- [ ] D7: Test arena — enemy creator has built-in arena: place a player dummy, place enemy blueprints, run combat simulation

---

### PROC-E: Asset Pipeline Retirement

**Goal:** Surgically remove all GLB/FBX/asset-loader code paths. The game ships with zero binary model files. Every visual is generated from `THREE.BufferGeometry` primitives at runtime.

> **Audit result (2026-07-18):** The following source files contain asset/model references that need retirement.
> Completed PROC-A through PROC-C3 means all game systems now have procedural equivalents.

#### E1: Delete Dead HTML Tools

- [ ] E1a: Delete `src/model-review.ts` + `model-review.html` — KayKit/GLB inspector, no longer needed
- [ ] E1b: Delete `src/assetViewer.ts` + `asset-viewer.html` — asset browser, replaced by showroom
- [ ] E1c: Remove both from `vite.config.ts` `input` map
- [ ] E1d: `src/sandbox.ts` — remove all `assembleBuilding()` / `AssetBuildingAssembler` / `generateBuilding()` calls; replace building spawn with `buildBuilding(dna)` only
- [ ] **Test:** `npx vitest run` still passes; dev server starts without errors

#### E2: Retire Enemy Model Pipeline

- [ ] E2a: `src/characters/charManifest.ts` — remove all entries with `roles: ['enemy']` (replaced by `EnemyDefaults.ts`)
- [ ] E2b: `src/enemy/EnemyLoader.ts` — delete `ENEMY_MANIFEST`, `loadEnemyModel()`, `loadEnemyById()` GLB path; keep only the `buildProceduralEnemyRig(dna)` path
- [ ] E2c: `src/levels/RoomEncounterDef.ts` — remove `enemyId` strings that map to GLB charManifest entries; replace with `EnemyDNA` references
- [ ] E2d: `src/creative/backroomScenes.ts` — remove any enemy GLB spawn calls
- [ ] **Test:** `tests/levels/enemyLoader.test.ts` — update to cover procedural-only path; no 404s on any enemy ID

#### E3: Retire Player/NPC Asset Pipeline

- [ ] E3a: `src/characters/CharacterLoader.ts` — entire file retires after E2/E3; delete once no remaining callers
- [ ] E3b: `src/characters/CharacterController.ts` — KayKit animation bridge; retires with CharacterLoader
- [ ] E3c: `src/characters/AnimationRetargeter.ts` — GLB animation retargeting; delete after E3b
- [ ] E3d: `src/characters/charManifest.ts` — remove all player/NPC GLB entries (princess rig = procedural); file can be deleted once empty
- [ ] E3e: `src/characters/wizardManifest.ts` + `src/characters/WizardLoader.ts` — Solmor 3D presence; replace with procedural NPC rig (`buildNpc(dna)`)
- [ ] E3f: `src/player/PlayerController.ts` — remove `applyAssetModel()`, `_charController`, `_charLoader` fields; keep only `applyPrincess()` path
- [ ] E3g: `src/world/SolmorPresence.ts` — refactor to use `buildNpc(dna)` instead of GLB loading
- [ ] **Test:** `tests/player/PlayerController.test.ts` passes; no GLB imports in player code

#### E4: Retire Building / World Asset Pipeline

- [ ] E4a: `src/world/buildings/AssetBuildingAssembler.ts` — entire file retires; `buildBuilding(dna)` is the only building path
- [ ] E4b: `src/scene/OverworldScene.ts` — remove `upgradeBuildingsWithAssets()`, `upgradeDungeonEntrancesWithAssets()`, `upgradeTreesWithAssets()`, `upgradeRocksWithAssets()` and all `assetLoader` references
- [ ] E4c: `src/assets/AssetLoader.ts` — retire entirely once above callers are removed
- [ ] E4d: `src/assets/envManifest.ts` — retire (KayKit environment kit manifest)
- [ ] E4e: `src/world/WorldGenConfig.ts` — remove `KENNEY_PACKS`, `ASSET_PACKS`, asset pack toggle settings
- [ ] E4f: `src/rendering/KayKitDungeonProps.ts` — retire; dungeon props come from `buildProp(dna)` only
- [ ] **Test:** `OverworldScene` constructs without any async asset loads; world generates in < 100ms

#### E5: Retire Creative / Editor Asset Paths

- [ ] E5a: `src/creative/CreativeAssetBrowser.ts` — entire file retires; creative mode uses PROC-D creator tools
- [ ] E5b: `src/creative/CreativePlacementSystem.ts` — remove GLB placement path; keep procedural `buildBuilding(dna)` path only
- [ ] E5c: `src/creative/CreativeMode.ts` — remove asset loader initialization, `BUILDING_PRELOAD_PATHS`, all GLB preload calls
- [ ] E5d: `src/editor/BuildingEditor.ts`, `DungeonEditor.ts`, `EditorCore.ts` — remove all GLB/asset references; editors work with DNA blueprints only
- [ ] E5e: `src/ui/AssetCharBrowser.ts` — retire; character selection is princess creator + procedural NPCs
- [ ] E5f: `src/creative/Backrooms.ts` + `backroomScenes.ts` — remove the `asset_showcase` backroom; keep all procedural backrooms
- [ ] **Test:** Creative mode opens and all tools function without any model loading

#### E6: Wipe Public Asset Directories

- [ ] E6a: `public/assets/characters/` — delete all GLB/binary model files; keep only audio files if any
- [ ] E6b: `public/assets/environment/` — delete all GLB environment packs
- [ ] E6c: `public/draco/` — delete DRACO decoder (no longer needed without GLB)
- [ ] E6d: `public/assets/` — keep ONLY: `public/music/` (audio), `public/draco/` if still needed for something else
- [ ] E6e: Run `npm run build` — verify bundle size reduced by >50%; no 404 errors in Playwright tests
- [ ] **Test:** Full e2e suite passes; no console errors; `public/` < 10 MB total

#### E7: Final Architecture Cleanup

- [ ] E7a: `src/assetManifest.ts` — retire; replace any remaining callers with PROC registry
- [ ] E7b: `src/scene/CharacterDecisionTree.ts` — remove any `assetModel` path references
- [ ] E7c: `src/scene/NewGameFlow.ts` — remove GLB character loading from new game flow
- [ ] E7d: `src/ui/CharacterCreation.ts`, `CharacterCreationV2.ts`, `DNACreator.ts` — remove all GLB model preview/loading; use `buildPrincess(dna)` preview only
- [ ] E7e: `ARCHITECTURE.md` — rewrite character/enemy/NPC architecture section: DNA → builder → THREE.Group; remove all mentions of GLB pipeline
- [ ] E7f: All scripts in `scripts/` — delete `gen-char-manifest.mjs`, `gen-manifest.mjs`, `extract-char-assets.mjs`, `extract-wizards.mjs` (all GLB manifest generators)
- [ ] **Test:** `npx tsc --noEmit` clean; zero `import.*GLTFLoader` in `src/`

---

### PROC-F: Polish & Visual Upgrade (post-retirement)

**Goal:** With external assets gone, invest in procedural quality — the game should look *better*, not just different.

- [ ] F1: Princess rig — add more body shape presets, more dress variants, richer material system
- [ ] F2: NPC diversity — crowd-level variation: hat variants, cloak, apron, tool variety, 40+ combinations per role
- [ ] F3: Enemy visual tier — tier 1 enemies look scrappy, tier 2 look organised, tier 3 look terrifying — material + size + glow variation
- [ ] F4: Procedural ambient particles — dust motes, firefly-glow, ash, leaves, snow — environment-driven
- [ ] F5: Procedural lighting upgrade — every prop casts appropriate light; candle flicker, cauldron glow, moonlight through windows
- [ ] F6: Day/night visual transition — overworld buildings lit at night via procedural lantern system
- [ ] F7: Weather system (visual only) — rain particles, overcast sky, fog density — no gameplay impact

---

### PROC Asset Inventory — Everything the Game Needs

> Full inventory so nothing gets missed during the procedural rebuild.

#### Player Characters (all → princess rig, ✓ done)
| Character | Current | Procedural Status |
|---|---|---|
| Human variants (warrior/paladin/bard/rogue/mage) | procedural `buildPrincess(dna)` | ✓ → `getDefaultPrincessForCharId()` |
| Undead variants | procedural `buildPrincess(dna)` | ✓ → UNDEAD blueprint |
| Vulperia/Fox | fox.glb | ✓ → FOXLING blueprint |
| Slime | slime.glb | ✓ → SLIME blueprint |
| Elf | — | ✓ → ELF blueprint |
| Celestial | — | ✓ → CELESTIAL blueprint |
| Draconic | — | ✓ → DRACONIC blueprint |

#### Enemies (all → enemy-creator, PROC-B2)
| Enemy Type | Current | Status |
|---|---|---|
| Skeleton Mage (Bone Caster) | `buildEnemy(dna)` undead·caster | ⏳ PROC-E2 wiring |
| Bone Rogue | `buildEnemy(dna)` undead·melee | ⏳ PROC-E2 wiring |
| Rot Walker | `buildEnemy(dna)` undead·melee | ⏳ PROC-E2 wiring |
| Specter | `buildEnemy(dna)` undead·caster | ⏳ PROC-E2 wiring |
| Undead Scholar | `buildEnemy(dna)` undead·caster | ⏳ PROC-E2 wiring |
| Vulperia Bounty Hunter | fox.glb | ⏳ PROC-B2 |
| Floor Boss (per floor) | none | ⏳ PROC-B2 tier 4 |

#### NPCs (all → npc-creator, PROC-B1)
| NPC Type | Current | Status |
|---|---|---|
| Merchant | procedural DNA creature | ⏳ PROC-B1 |
| Elder / Quest Giver | procedural DNA creature | ⏳ PROC-B1 |
| Scholar | procedural DNA creature | ⏳ PROC-B1 |
| Guard | procedural DNA creature | ⏳ PROC-B1 |
| Mysterious | procedural DNA creature | ⏳ PROC-B1 |
| Solmor (wizard) | `buildNpc(dna)` scholar role | ⏳ PROC-E3 (SolmorPresence refactor) |

#### World Props (all → prop-creator, PROC-B3)
| Category | Items Needed |
|---|---|
| Dungeon dressing | torch, chain, shelf, crate, barrel, rug, lectern, ritual circle, cauldron, brazier, sarcophagus, locked chest |
| Library/study | bookshelf (full/empty/ransacked), desk, chair, scroll pile, candelabra, inkwell, map table |
| Alchemical (basement) | cauldron, reagent shelf, distillation apparatus, ingredient crates, experiment table |
| Overworld vegetation | tree (3 variants), bush, rock (5 sizes), mushroom cluster, fallen log |
| Settlement props | market stall, well, bench, sign post, fence, gate, hay bale, cart |
| Building interiors | bed, wardrobe, fireplace, cooking pot, dining table, hearth |

#### Buildings (all → PROC-C)
| Building Type | Interior | Exterior |
|---|---|---|
| House (small/medium/large) | living room + bedroom | thatched / timber |
| Inn | common room + bar + rooms | large, sign, stable |
| General store | counter + shelves | shop front window |
| Blacksmith | forge + display | chimney, anvil outside |
| Library / Scholar | shelves + reading room | stone, arched windows |
| Temple / Shrine | altar + prayer space | decorated roof |
| Guild hall | meeting hall + armoury | banner, large door |
| Ruin (3 sizes) | collapsed partial interior | crumbled walls |
| Tower sections | per-floor interior (already built) | exterior facade |

#### Environments (PROC-C / world gen)
| Feature | Status |
|---|---|
| Overworld terrain (heightfield) | ✓ existing Rapier heightfield |
| River / water | partial — PROC-C needed |
| Roads / paths | ⏳ PROC-C2 |
| Settlement layout | partial — PROC-C2 refactor |
| Day/night sky | ✓ existing DayNight system |
| Weather (visual) | ⏳ PROC-F7 |

