# Demo Release Plan — Tomes, Towers & Transmutation
> Branch: `demo/alpha-release`
> Goal: A **complete, polished alpha build** ready for public playtesting, a Kickstarter campaign, and an itch.io/Steam early-access launch.
> Last updated: 2026-07-17

---

## Asset Inventory (what we have)

### Enemy Packs (in `assets/characters/enimies/`)
| Pack | Contents | Status |
|---|---|---|
| `Ultimate Monsters` (large Google Drive ZIP) | ~80+ monster meshes (dragons, demons, undead, beasts, elementals) | ⬜ Needs unzip + GLB extraction |
| `Monster Pack Animated by Quaternius.zip` | 20+ fully animated low-poly monsters — skeleton, golem, dragon, slime, imp, etc. | ⬜ Needs integration |
| `Easy Animated Enemy Pack` (Quaternius 2019) | ~15 classic fantasy enemies — bat, ghost, spider, troll, zombie, mage, etc. | ⬜ Needs integration |
| `kenney_cube-pets_1.0.zip` | ~30 cube-style pets/familiar-type creatures | ⬜ Use as summons/minions |
| `meshy_dark_fay.zip` | Dark fairy — custom high-quality 3D mesh | ⬜ Boss or elite enemy |
| `meshy_mutated_pig_man.zip` | Mutated pig-man — custom high-quality 3D mesh | ⬜ Dungeon elite |
| `meshy_vampire_fay.zip` | Vampire fairy — custom high-quality 3D mesh | ⬜ Boss or Act II antagonist |

### KayKit Environment Packs (in `assets/environment/overworld_etc/KayKit/`)
| Pack | Contents | Use |
|---|---|---|
| `KayKit_Forest_Nature_Pack_1.0_FREE.zip` | Trees (oak, pine, dead), rocks, stumps, mushrooms, ferns, grass clumps, rivers | Overworld biomes: forest, bog |
| `KayKit_DungeonRemastered_1.1_FREE.zip` | Stone tiles, walls, arches, doors, torches, pillars, traps, chests | Dungeon rooms + tower exterior |
| `KayKit_City_Builder_Bits_1.0_FREE.zip` | Modular buildings, roads, walls, market stalls, fountains | Settlement rendering |
| `KayKit_BlockBits_1.0_FREE.zip` | Generic block-style geometry pieces | Procedural fill |
| `KayKit_HalloweenBits_1.0_FREE.zip` | Gravestones, pumpkins, spooky gates, dead trees, cauldrons | Graveyard biome / undead zone |
| `KayKit_Medieval_Hexagon_Pack_1.0_FREE.zip` | Hexagonal terrain tiles, castles, towers, moats | Overworld hex-map option |

### Kenney Environment Packs (in `assets/environment/overworld_etc/kenney/`)
| Pack | Contents | Use |
|---|---|---|
| `kenney_fantasy-town-kit_2.0.zip` | Houses, inns, shops, churches, market stalls, town walls | Settlement buildings |
| `kenney_castle-kit.zip` | Castle walls, towers, gates, battlements, drawbridge | Wizard tower exterior / Baron's Keep |
| `kenney_modular-dungeon-kit_1.0.zip` | Full dungeon tile set: corridors, rooms, doors, traps, stairs | Dungeon zone rendering |
| `kenney_modular-cave-kit_1.0.zip` | Cave tiles, stalactites, underground water | Bog shrine / mine dungeon |
| `kenney_nature-kit.zip` | Trees, rocks, cliffs, water tiles, flowers, grass variants | Overworld biomes |
| `kenney_furniture-kit.zip` | Tables, chairs, beds, shelves, barrels, chests — all 3D | House interiors |
| `kenney_modular-buildings.zip` | Modular house walls, floors, roofs, windows, doors | House construction system |
| `kenney_building-kit.zip` | Additional generic building parts | Supplement modular buildings |
| `kenney_survival-kit.zip` | Campfires, tents, axes, logs, crates | Overworld camps |
| `kenney_hexagon-kit.zip` | Hex terrain tiles (grass, sand, water, snow, forest) | Overworld hex grid option |
| `kenney_retro-fantasy-kit.zip` | Fantasy props: potions, scrolls, gems, equipment, altars | Dungeon loot props |
| `kenney_mini-dungeon.zip` | Mini-sized dungeon tiles for tight corridors | Sub-dungeon zones |
| `kenney_tower-defense-kit.zip` | Towers, walls, gates, defensive structures | Tower exterior / outpost zones |
| `kenney_3d-road-tiles.zip` | Road tiles (dirt, cobblestone, intersections) | Overworld paths |
| `kenney_pirate-kit.zip` | Port, ship pieces, barrels, ropes | Coastal settlement (future) |

### House & Structure Packs
| Pack | Contents | Use |
|---|---|---|
| `craftpix-net-649323-free-medieval-houses-3d-low-poly-pack.zip` | Pre-built medieval houses (thatched, stone, half-timber), various sizes | Settlements, villages |
| `craftpix-891176-free-environment-props-3d-low-poly-models.zip` | Environment props: fences, signs, wells, barrels, carts | Overworld dressing |
| `craftpix-net-539977-free-defence-tower-3d-low-poly-models.zip` | Defence towers: arrow towers, mage towers, cannon towers | Outpost / Baron's Keep |
| `FantasyStylizedPack.rar` | Fantasy stylized pack (needs inventory after unrar) | Mixed use |

---

## PHASE A — Asset Integration Pipeline
> **Goal:** Replace all major procedural placeholders with real 3D assets from the packs. Every screen in the alpha should look deliberate and polished.

### A1 — Unpack & Catalogue All Assets
- [ ] Write a Node.js script `scripts/unpack-assets.js` that unzips all `.zip`/`.rar` packs into `public/assets/` mirrored directories
- [ ] Script outputs a `ASSET_MANIFEST.json` listing every GLB with: `path`, `category`, `pack`, `animationClips[]`, `boundingBoxApprox`
- [ ] Review manifest — tag each GLB as: `nature`, `building-exterior`, `building-interior`, `dungeon`, `prop`, `creature`, `character`
- [ ] Git LFS track all new GLBs (add patterns to `.gitattributes`)
- [ ] **Unit test:** `scripts/verify-manifest.test.ts` — manifest has no broken paths, all GLBs are loadable by Three.js GLTFLoader in jsdom

### A2 — Overworld Nature & Terrain (KayKit Forest + Kenney Nature)
> Target: bog → forest → highland biomes feel alive and distinct

- [ ] `OverworldScene.ts`: create `KayKitTreeRenderer` using `InstancedMesh` — oak, pine, dead tree variants from KayKit Forest pack
- [ ] Replace procedural rock geometry with Kenney nature-kit rock variants (3 sizes) using `InstancedMesh`
- [ ] Add river tiles using Kenney water tiles — animated UV scroll shader on water surfaces
- [ ] Add biome-specific ground cover: mushrooms + ferns (bog), flowers (meadow), snow rocks (highland) from KayKit Forest
- [ ] Graveyard biome patch using KayKit HalloweenBits (gravestones, dead trees, pumpkins) — appears near undead-themed dungeon
- [ ] Campfire clearings use Kenney survival-kit props (logs, tent, crates)
- [ ] Cobblestone path tiles from Kenney 3D-road-tiles connecting settlements
- [ ] **Unit test:** `OverworldScene` renders within 16ms frame budget with 500+ instanced trees (performance guard)
- [ ] **Playwright:** Overworld loads, camera can pan to all biome zones, screenshots for visual review

### A3 — House & Settlement System
> Target: 3-floor maximum modular houses that look genuinely good

**Design Principle:** Houses are built from Kenney `modular-buildings` pieces (floor tiles, walls, windows, door frames, roof pieces). Pre-designed templates for 3 house archetypes; randomised façade variation within each type.

| Archetype | Floors | Style | Pack Source |
|---|---|---|---|
| Peasant Cottage | 1 | Wattle & daub + thatched roof | craftpix medieval houses |
| Merchant House | 2 | Stone ground + timber upper + tile roof | kenney_modular-buildings |
| Manor | 3 | Full stone, arched windows, slate roof | kenney_fantasy-town-kit + kenney_castle-kit battlements |

- [ ] `HouseBuilder.ts`: accepts `{type, seed, position}` → places modular wall/floor/roof GLB pieces, returns `THREE.Group`
- [ ] Floor 1 (ground): shop or living space — kenney_furniture-kit props: counter, barrels, shelves
- [ ] Floor 2 (upper): bedroom — bed, wardrobe, small desk, window with curtain plane
- [ ] Floor 3 (attic/manor study): open roof beams, crates, optional library shelves
- [ ] Interior is revealed when player enters (use `CameraInterior` mode that removes roof layer)
- [ ] Settlement generator: 4–12 houses + market stalls + inn (Kenney fantasy-town-kit inn mesh) + well + notice board
- [ ] **Playwright:** Walk into a house, interior props visible, walk out, no physics tunnelling

### A4 — Dungeon Visual Pass (KayKit Dungeon Remastered + Kenney Modular Dungeon)
> Target: dungeon rooms feel like KayKit quality, not code-only geometry

- [ ] `DungeonRenderer.ts` (new or extended `BlueprintRenderer.ts` path for `assetMode='kenney'`): replaces cube walls with KayKit dungeon stone tile set
- [ ] Dungeon wall pieces: straight wall, corner, T-junction, archway, door frame from KayKit DungeonRemastered
- [ ] Floor tiles: KayKit stone floor, cracked variant, mossy variant — assigned by room type
- [ ] Dungeon props from KayKit: wall torch brackets, hanging chains, cracked pillars, iron gates
- [ ] Boss room variant: larger tiles, ornate floor border, dramatic central fixture (altar, throne, ritual circle)
- [ ] Trap tiles: pressure plate + spike trap from KayKit dungeon kit — animated (up/down cycle, 2s period)
- [ ] Chest spawns use KayKit chest GLB with open/close animation state
- [ ] **Unit test:** `DungeonRenderer` with `assetMode='kenney'` loads all referenced GLBs without 404s
- [ ] **Playwright:** Enter dungeon, all wall faces covered, no gaps, chests interactable

### A5 — Tower Exterior Visual Pass (Kenney Castle-Kit)
> The wizard's tower should look like a proper imposing structure from the overworld

- [ ] Build `TowerExteriorMesh.ts` using Kenney castle-kit: base tower cylinder walls, crenellated battlements, pointed roof piece, narrow windows, arched entrance
- [ ] LOD strategy: detailed version when within 40u, simplified instanced mesh beyond
- [ ] Tower emits amber window glow at night (PointLight behind window plane)
- [ ] Entry portal: iron portcullis gate that raises on approach
- [ ] **Playwright:** Screenshot tower from overworld at 3 distances, validate no Z-fighting

---

## PHASE B — Enemy Expansion
> **Goal:** Meaningful enemy variety per zone/dungeon, Zelda-style encounter design in dungeon rooms, distinct difficulty tiers.

### B1 — Enemy Pack Extraction & Integration
- [ ] Unpack and catalogue all enemy packs (see Asset Inventory above) into `ENEMY_MANIFEST.json`:
  - Each entry: `id`, `displayName`, `glbPath`, `animations: ['idle','walk','attack','death','hurt']`, `tier: 1|2|3|boss`, `species: undead|beast|elemental|fae|humanoid|construct`
- [ ] `EnemyLoader.ts`: loads GLB + wires AnimationMixer clips to a standard `EnemyAnimState` interface (same as charManifest pattern)
- [ ] DNA rig fallback: if a pack enemy has no KayKit-compatible rig, wrap in `CreatureBuilder` DNA mesh with the pack texture applied as a skin

### B2 — Enemy Roster by Zone

#### Tower Dungeon (Floors B1–9)
| Enemy | Source | Floor Range | Tier | Notes |
|---|---|---|---|---|
| **Skeleton Warrior** | Quaternius Monster Pack | B1–2 | 1 | Basic melee, telegraphed swing |
| **Skeleton Archer** | Quaternius Monster Pack | B1–3 | 1 | Ranged, seeks cover |
| **Zombie** | Easy Animated Pack | B1–2 | 1 | Slow, heavy hit, fear aura |
| **Imp** | Quaternius Monster Pack | 2–4 | 1 | Fast, low HP, swarms |
| **Slime Cube** | Kenney Cube-Pets | 1–3 | 1 | Splits on death (2 small slimes) |
| **Golem (stone)** | Quaternius Monster Pack | 4–6 | 2 | High HP, slow, area stomp |
| **Gargoyle** | Ultimate Monsters | 5–7 | 2 | Flying, dive bomb, perch on walls |
| **Dark Mage** | Easy Animated Pack | 5–8 | 2 | Ranged spells, teleports |
| **Dark Fay** | meshy_dark_fay | 7–8 | 2 | Teleports, charm debuff |
| **Vampire Fay** | meshy_vampire_fay | 8–9 | 3 | Life-steal, mist form |
| **Pig-Man Brute** | meshy_mutated_pig_man | 6–8 | 2 | Charge attack, cleave |
| **Spectral Knight** | Quaternius Monster Pack | 8–9 | 3 | Phase through walls, reflects spells |
| **Dragon Whelp** | Quaternius Monster Pack | 9 | 3 | Fire breath cone |

#### Overworld (Exterior)
| Enemy | Source | Biome | Tier | Notes |
|---|---|---|---|---|
| **Goblin Scout** | Easy Animated Pack | Forest | 1 | Patrol path, flees at low HP |
| **Forest Troll** | Quaternius Monster Pack | Forest/Highland | 2 | Regenerates, stunned by fire |
| **Giant Spider** | Easy Animated Pack | Bog | 1 | Webs player (slow debuff) |
| **Bat Swarm** | Easy Animated Pack | Cave/Dungeon entry | 1 | Multi-hit, spread formation |
| **Bog Wraith** | Ultimate Monsters | Bog | 2 | Invisible until 10u range |
| **Bandit** | Kenney Mini-Characters (custom DNA) | Road/Camp | 1 | Uses ranged + melee, has camp |
| **Baron's Guard** | Kenney Mini-Characters | Baron's Keep | 2 | Organised formation, shielded |

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

- [ ] `RoomEncounterDef.ts`: typed structure `{pattern, tier, enemies[], waveCount?, spawnPositions?}`
- [ ] `TowerFloorDef.ts`: each floor gets `encounterPool: RoomEncounterDef[]` replacing raw `enemiesPerRoom`
- [ ] `SceneManager.ts`: on room enter, read encounter def → spawn enemies → track kill count → fire `onRoomCleared` when all dead
- [ ] Wave spawner: for swarm rooms, spawn next wave after N seconds or N kills (configurable)
- [ ] Room-cleared reward: emit chest spawn event or stat-restore orb at room centre
- [ ] **Unit test:** All encounter defs in all floor pools are valid (enemy IDs exist in manifest, wave counts sensible)
- [ ] **Playwright:** Enter ambush room → all enemies spawn → kill all → room-cleared chest appears → interact → loot

### B4 — Enemy AI Pass
- [ ] Tier-1 melee: `PatrolThenChase` FSM — patrol waypoints → player detected (8u range) → chase → melee when in range
- [ ] Tier-1 ranged: `StationaryShoot` — find cover position → shoot projectile on cooldown → reposition if flanked
- [ ] Tier-2: `TacticalBrute` — close to melee range, use special ability on 25s cooldown, retreat to heal at <20% HP
- [ ] Elite/Boss: bespoke per-enemy behaviour tree (see game-ai skill)
- [ ] All enemies: death animation → ragdoll 1.5s → fade → loot drop
- [ ] Aggro system: enemies share aggro state — if one detects player, nearby enemies alert (8u radius shout)
- [ ] **Unit test:** FSM state transitions tested with mocked player distance values

---

## PHASE C — Quest Lines (Species + General)
> **Goal:** 5 fully implemented, lore-correct, non-generic quests per species + 5 general quests. Each has: intro dialogue, 2–4 beats, unique reward, resolution text.

### C1 — Quest Architecture
- [ ] Extend `StoryQuestLine.ts` beat types: add `read_lore` (BookReader fires on specific book ID), `talk_to_npc` (NPC dialogue completion), `defeat_elite` (specific enemy ID killed), `reach_location` (zone/biome reached), `craft_item` (recipe completed)
- [ ] `QuestReward` type: `{xp, itemId?, spellId?, statBonus?, unlockZone?}`
- [ ] `QuestJournal.ts`: extends current QuestLog — separate species-quests tab from general-quests tab; shows all quest flavour text in readable format
- [ ] Quest-giver NPCs: 3 archetypes (wandering merchant, settlement elder, mysterious figure at ruins) — placed procedurally near settlements

### C2 — Human Princess Quests (5 quests)

| # | Title | Lore Hook | Beats | Reward | Difficulty |
|---|---|---|---|---|---|
| H1 | **The Forsworn Garrison** | A ruined guard post near the tower once belonged to her kingdom — its banner still flies. | (1) Reach ruined post → (2) Defeat 8 guards-turned-bandit → (3) Raise her kingdom's banner | `+25% melee damage`, `banner wall decoration` | Easy |
| H2 | **The Debt of Iron** | A blacksmith in the settlement is being extorted by a gang. She recognises the extortion tactic — it's her captor's signature. | (1) Talk to blacksmith → (2) Find gang camp, defeat gang leader → (3) Return, receive custom sword GLB prop | `unique melee weapon skin: Forgeborn Blade` | Medium |
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
| V3 | **Contracts and Consequences** | A hunters' guild (using Kenney mini-characters as NPCs) has a bounty on her — placed anonymously. | (1) Intercept bounty hunter encounter → (2) Track back to guild hall → (3) Discover Solmor placed the bounty → (4) Confront guildmaster | `guild becomes neutral`, `unlock Hunter's Contract board (daily challenges)` | Medium |
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
- [ ] `AbilitySystem.ts`: `Ability` type with `{id, name, cooldown, manaCost, cast: (ctx) => void, animation: string, icon: SVG}`
- [ ] `TalentTree.ts`: `TalentNode` type with `{id, requires: string[], effect: StatBonus | AbilityUnlock, cost: TalentPoint}`
- [ ] HUD wires: spell bar slots 1–5 are `active abilities`; passive talents auto-apply on unlock
- [ ] Melee weapon flavour: each species has a default weapon model (human sword, undead bone blade, vulperia daggers, slime pseudopod) from charManifest or procedural ProceduralProps

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
- [ ] `AbilitySystem.ts`: base class, cast pipeline, cooldown tracker, mana check
- [ ] `TalentTree.ts`: node graph data structure, point allocation, prerequisite validation
- [ ] Per-species ability implementations (16 active abilities total — 4 per species × 4 subspecies, pick 2 to implement per subspecies for alpha)
- [ ] HUD spell bar wired to active abilities 1–5 (keyboard 1–5 or Q/E/R/F)
- [ ] Talent tree screen: tabbed modal (Game Menu → Talents), visual node graph with SVG lines
- [ ] **Unit test:** All talent nodes have valid prerequisites, no circular dependencies
- [ ] **Unit test:** Each ability `cast()` function fires without throwing against mocked scene context
- [ ] **Playwright:** Open talent tree, spend 3 points, close, verify passive bonuses applied to stat display

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

- [ ] Write full beat dialogue + completion text for all 4 arcs in `StoryQuestLine.ts`
- [ ] Implement `read_lore` beat type: `BookReader.ts` fires `onLoreRead(bookId)` → `StoryRunner.tick()` checks
- [ ] Implement `talk_to_npc` beat type: `NPCEntity.ts` fires `onDialogueComplete(npcId)` → `StoryRunner.tick()` checks
- [ ] Implement `defeat_elite` beat type: enemy kill event carries `enemyId`, story runner pattern-matches against beat target
- [ ] Place 4 Act I lore books in appropriate dungeon rooms (one per species arc) via `chamberExtraFixture`
- [ ] Place 2 NPC encounter triggers in overworld (bounty hunter for vulperia, wandering scholar for undead)

### E2 — Arcanist Solmor — The Return
> The moment the player exits the tower with the master key, the game's central relationship begins.

- [ ] `WizardManifest.ts`: add `solmor` entry — model: `old_toad_wizard.zip` (unpack + integrate GLB)
- [ ] `SolmorDialogueTree.ts`: new dialogue tree (separate from `CharacterDecisionTree`) — 3 conversation stages:
  - **Stage 1 (first meeting):** Surprised, businesslike, immediately pivots to trying to hire her
  - **Stage 2 (after Act I arc):** More candid; drops one genuine piece of lore about the ascension cycle
  - **Stage 3 (after completing all 4 species quests):** Full vulnerability; offers a choice that becomes the true ending gateway
- [ ] `NewGameFlow.ts` / `main.ts`: after `_towerPrologueDone` flag triggers and player exits, queue `SolmorEncounter` event
- [ ] Solmor appears at tower entrance (outside), blocking path, initiating `FloatingDialogue3D` conversation
- [ ] After conversation: Solmor "leaves to fetch something" (despawns), tower front gate stays open
- [ ] **Playwright:** Complete prologue, exit tower, Solmor dialogue triggers, choice made, world opens

### E3 — Interactable System Completion
- [ ] `read_lore` beat type (see E1 above)
- [ ] `LockedDoor` interactable: requires `namedKey` item; door rattle SFX on approach without key; open animation on key use
- [ ] Per-species staircase flavour text: `onFloorTransition` callback checks species → shows 1-line toast (e.g. undead: "The upper floor smells of old magic. You find this comforting.")
- [ ] Binding circle on Floor 0 (undead species only): interactable with lore text about the ward
- [ ] **Unit test:** `LockedDoor` blocks passage with wrong key, opens with correct key, state persists across save/load

---

## PHASE F — Testing Suite
> **Goal:** Every phase's work is covered by automated tests. Alpha ships with a fully green test suite.

### F1 — Unit Tests (`vitest`)
- [ ] All new `RoomEncounterDef` pools validate correctly (Phase B3)
- [ ] `AbilitySystem`: cooldown tracking, mana deduction, cast returns expected effect
- [ ] `TalentTree`: node unlocking, prerequisite graph, point costs
- [ ] `QuestReward` types: all quest reward IDs reference real items/spells
- [ ] `StoryQuestLine`: all new beat types (`read_lore`, `talk_to_npc`, `defeat_elite`) transition correctly
- [ ] `HouseBuilder`: all 3 archetypes build without Three.js errors in jsdom
- [ ] `EnemyLoader`: manifest entries load GLB without 404 (mock fetch, check path structure)
- [ ] `SolmorDialogueTree`: all 3 stage transitions produce expected characterId/reward payloads
- [ ] Maintain baseline: **0 new failures** on top of the 2 pre-existing known failures

### F2 — Smoke Tests (existing + new)
- [ ] `main.startup.smoke.test.ts` stays green (currently ✅ 606 passing)
- [ ] New smoke: `overworld.startup.smoke.test.ts` — OverworldScene initialises without throw
- [ ] New smoke: `dungeon.startup.smoke.test.ts` — DungeonRenderer loads with `assetMode='kenney'` without throw

### F3 — Playwright Playtests (automated E2E)
> Playwright runs against `vite preview` on localhost; screenshots saved to `test-results/screenshots/`

- [ ] `tests/e2e/startup.spec.ts` — Main menu present, settings toggles work, new game button visible
- [ ] `tests/e2e/campfire-intro.spec.ts` — All 4 species × all 4 choice branches complete without UI errors; screenshot Phase 3 for each species
- [ ] `tests/e2e/tower-prologue.spec.ts` — All 4 beats of prologue complete; master key picked up; front door unlocks; Solmor dialogue triggers
- [ ] `tests/e2e/dungeon-room.spec.ts` — Enter ambush room; all enemies spawn; room clears after kill; chest spawns; interact for loot
- [ ] `tests/e2e/talent-tree.spec.ts` — Open talent tree; spend points; close; stat display updated
- [ ] `tests/e2e/quest-journal.spec.ts` — All 5 species quests visible in journal; first general quest completable
- [ ] `tests/e2e/save-load.spec.ts` — Save in tower; reload main menu; continue loads correct character model + floor
- [ ] `tests/e2e/house-interior.spec.ts` — Walk into settlement house; interior renders; walk out; no physics issues
- [ ] All specs: capture `screenshot` at end of each test case for visual diff review

### F4 — Browser Dev Console Feedback
- [ ] `vite.config.ts`: add `logLevel: 'warn'` for production build, `'info'` for dev
- [ ] Playwright specs: each test captures `page.on('console')` errors + warnings → test fails if any `console.error` fires
- [ ] Playwright specs: capture `page.on('pageerror')` → attach to test report
- [ ] `window.onerror` handler in `index.html` posts error details to `/_dev/error` endpoint in dev mode
- [ ] Weekly: run `npx vite build && npx vite preview` + full Playwright suite on CI

---

## PHASE G — Polish, Performance & UI/UX HUD
> **Goal:** The alpha feels finished. Controls are crisp. HUD communicates clearly. Framerate is smooth on mid-range hardware.

### G1 — Performance
- [ ] **Frame budget audit:** Profile with Chrome DevTools. Target: 60fps on M1 / GTX 1060 equivalent
- [ ] `InstancedMesh` for all repeated environment (trees, rocks, dungeon tiles): batch count per scene ≤ 300 draw calls
- [ ] LOD system: KayKit/Kenney GLBs get simplified LOD at 50u+ (Three.js `LOD` object, load detail-1 mesh)
- [ ] Texture atlasing: pack all small dungeon prop textures into a 2048×2048 atlas, reduce material count
- [ ] Physics culling: `PhysicsWorld.ts` — only simulate Rapier bodies within 30u of player; cull distant static bodies
- [ ] Spawn pooling: enemy `THREE.Group` objects are pooled (max 30 live, recycle on death)
- [ ] Memory leak audit: run Chrome heap snapshot before and after 5-minute play session; diff > 50MB = fix
- [ ] **Unit test (perf guard):** `OverworldScene` with 500 instanced trees renders in < 16ms (mocked RAF)

### G2 — UI/UX Pass
- [ ] HUD health bar: animated HP tick-down (value changes after 200ms delay with smooth lerp)
- [ ] HUD spell glyphs: show cooldown fill animation + number countdown
- [ ] Minimap: overworld only — canvas minimap in top-right showing player dot + explored fog-of-war
- [ ] Quest tracker: show active quest name + current beat objective in bottom-right (collapsible)
- [ ] Damage numbers: floating text pops on hit (damage dealt, red; heal received, green; crit, large yellow)
- [ ] Enemy health bars: thin bar above enemy head, visible within 15u only
- [ ] Interaction prompt: `[E] Interact` label appears when within range of interactable
- [ ] Screen-space hit flash: brief white vignette when player takes damage
- [ ] Low HP warning: HUD border pulses red below 25% HP
- [ ] Death screen: full-screen fade + "You Fell" text + Respawn / Load buttons
- [ ] Loading screen: per-floor loading screen with floor name + ambient quote from Solmor's notes

### G3 — Game Feel Polish
> Uses game-feel skill techniques

- [ ] Screen shake on: heavy melee hit (0.15s, 0.06u magnitude), explosion (0.4s), player death (0.8s)
- [ ] Hit stop: 3-frame freeze on heavy hits (targets + attacker pause)
- [ ] Dodge roll: squash on launch (scale Y: 0.7), stretch at peak speed (scale Z: 1.3), land bounce
- [ ] Spell cast: camera FOV kicks from 55° → 50° → 55° over 180ms on fire
- [ ] Enemy death: brief knockback impulse + dissolve shader (opacity 1→0 over 0.8s)
- [ ] Floor transition: wipe fade (0.4s) + floor name title card + ambient sound crossfade
- [ ] Item pickup: radial glow pulse on item, brief "pop" scale animation on pickup
- [ ] Talent point unlock: particle burst + chime SFX
- [ ] All SFX: final pass on timing, pitch variation ±8%, volume mix

### G4 — Controls & Accessibility
- [ ] Keyboard rebinding: Settings → Controls tab with full rebind support (persists to localStorage)
- [ ] Gamepad support: left stick → WASD, right stick → look/aim, A/B/X/Y → action/dodge/interact/spell
- [ ] Colour-blind mode: Settings toggle — replaces red/green HP/mana with orange/blue
- [ ] Text scale: Settings slider (80%–140%)
- [ ] Subtitle captions for all campfire dialogue choices (on by default)
- [ ] **Playwright:** Rebind one key, restart session, verify rebind persisted

---

## PHASE H — Documentation Update & Fundraising

### H1 — Update All .md Docs
- [ ] `GDD.md` — update species table, tower floor table, tech stack; add current feature list vs out-of-scope
- [ ] `ARCHITECTURE.md` — update asset pipeline section; document new `assetMode` routing; update file map
- [ ] `STORY_DESIGN.md` — add all 5×4+5 quest summaries; add Solmor Stage 2+3 dialogue outlines
- [ ] `TODO.md` — tick completed items; add Phase A–G items as new sections
- [ ] `README.md` — rewrite for public-facing clarity: what the game is, how to run it, controls, screenshots
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
