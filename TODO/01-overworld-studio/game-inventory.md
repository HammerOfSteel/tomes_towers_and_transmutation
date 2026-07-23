# Game Asset Inventory
> **Master content catalogue** — every procedural asset type the complete game needs.
> Use this to drive what each generator tool in Overworld Studio must produce.
> Status symbols: ✅ generated/in-game · 🔲 not yet built · ⚙ generator exists, variants incomplete

---

## How to use this file
Each section maps to a generator in the Overworld Studio sidebar.  
The **Generator Coverage** column tells you which Studio tool produces that asset type.  
When a row is fully ✅ it means the generator can produce it *and* it appears in the game world.

---

## 1 · WORLD STRUCTURE (top-down scope)

The game world nests: **Solar System → Planet → Realm → City/Settlement → Building → Room**

| Level | Generator | Notes |
|---|---|---|
| Solar System | `solar-controls` | 1–4 planets, star type, asteroid belts |
| Planet | `solar-controls` + planet click | Type: terrestrial / ocean / desert / ice / lava / gas giant |
| Realm (continent slice) | `realm-controls` | Climate, shape, roughness, settlement count |
| Settlement (city/village/hamlet) | `settlement-controls` | Ward layout, faction, size |
| Building (inn/forge/temple…) | Building modal → `building-viewer` | Per ward, per floor |
| Room (dungeon room) | `dungeon-controls` | Room type, connections, props |
| Cave / Glade | `cave-controls` | Biome, density, size |
| Dungeon entrance | embedded in realm | Marked on realm map, leads to `dungeon-controls` output |

> **Nine towers** exist in the lore. All nine should be generatable with the same dungeon pipeline, differentiated by seed + faction.

---

## 2 · SETTLEMENTS

### 2a — Settlement Sizes

| Size | Ward count | Building count | Factions possible |
|---|---|---|---|
| Hamlet | 1–2 | 4–8 | Human, Elf, Dwarf |
| Village | 3–4 | 10–18 | Human, Elf, Dwarf, Orcish |
| Town | 5–7 | 20–35 | All |
| City | 8–12 | 40–80 | All |
| Capital | 12–20 | 80–150 | Human, Elven, Dwarven |

Generator status: ⚙ Settlement generator exists — sizes partially varied, faction styling 🔲

### 2b — Ward Types

| Ward | Purpose | Required buildings |
|---|---|---|
| Market | Trade hub | Market stalls ×3, Inn, Merchant houses |
| Residential | Housing | Small houses ×6, Large houses ×2, Well |
| Religious | Spiritual | Temple or shrine ×1, Graveyard (Undead/Human), Garden (Elven/Fae) |
| Military | Defence | Guard post ×2, Barracks, Armoury, Watch tower |
| Industrial | Production | Blacksmith, Tanner, Mill, Warehouse |
| Scholar | Knowledge | Library, Alchemist shop, Scribe's office |
| Noble | Wealth | Manor ×1, Formal garden, Carriage house |
| Slum | Poverty | Shacks ×8, Pawn shop, Soup kitchen |
| Harbour | Coastal only | Dock, Chandlery, Fishmonger ×2 |
| Fae Quarter | Fae/Elf only | Treehouse ×3, Mushroom ring, Glade shrine |

Generator status: 🔲 Ward type differentiation not yet in generator

### 2c — Building Types × Faction Palette

| Building | Human | Elven | Dwarven | Orcish | Fae | Undead | Notes |
|---|---|---|---|---|---|---|---|
| Inn | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | Faction sets palette + roof shape |
| Blacksmith | 🔲 | — | ✅ concept | 🔲 | — | — | Dwarven = stone, Human = timber frame |
| Market stall | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | — | Open-front canopy structures |
| House small | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 1 floor |
| House large | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 2–3 floors |
| Temple | 🔲 | 🔲 | 🔲 | — | 🔲 | 🔲 | Human=stone columns, Elven=living wood arch |
| Shrine (roadside) | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | Single-tile outdoor prop |
| Guard post | 🔲 | 🔲 | 🔲 | 🔲 | — | 🔲 | |
| Barracks | 🔲 | — | 🔲 | ✅ concept | — | — | |
| Library | 🔲 | 🔲 | 🔲 | — | — | 🔲 | |
| Alchemist shop | 🔲 | 🔲 | — | — | 🔲 | 🔲 | |
| Watchtower | 🔲 | 🔲 | 🔲 | 🔲 | — | 🔲 | Tall narrow |
| Well | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | — | Courtyard prop |
| Manor | 🔲 | 🔲 | 🔲 | — | 🔲 | 🔲 | Noble ward only |
| Baron's Keep | 🔲 | — | — | — | — | — | Story-specific, one per world |
| Greenhouse/Ruin | ✅ exterior | — | — | — | — | — | GreenhouseGenerator exists |
| Mill | 🔲 | — | 🔲 | — | — | — | |
| Dock / Pier | 🔲 | 🔲 | — | — | — | — | Coastal only |
| Treehouse | — | 🔲 | — | — | 🔲 | — | Fae Quarter |
| Shack | 🔲 | — | — | 🔲 | — | 🔲 | Slum ward |

**Generator target:** `settlement-controls` + `building-viewer` pipeline should generate any building type × faction combination from a (type, faction, seed) tuple.

---

## 3 · DUNGEONS & THE TOWER

### 3a — Dungeon Types

| Type | Description | Generator |
|---|---|---|
| The Tower (main) | 11-floor wizard's tower — unique, story-critical | `TowerGenerator` ✅ |
| Ruined Keep | Fortification dungeon, military aesthetic, 4–6 floors | `dungeon-controls` 🔲 |
| Barrow / Tomb | Underground burial, Undead faction, narrow corridors | `dungeon-controls` 🔲 |
| Alchemy Vault | Hidden research complex, puzzle rooms, 3–5 floors | `dungeon-controls` 🔲 |
| Dwarven Mine | Shaft-based layout, industrial rooms, resource nodes | `dungeon-controls` 🔲 |
| Fae Hollow | Organic geometry, puzzle emphasis, no straight corridors | `dungeon-controls` 🔲 |
| Dragon Lair | Single large chamber + 3–4 side caves, boss room | `dungeon-controls` 🔲 |
| The Nine Towers | 8 additional Solmor towers, same structure, different seed/faction | `TowerGenerator` 🔲 (seed param only) |

### 3b — Floor / Room Types

Each room type needs: geometry variant, prop set, lighting rig, enemy weight.

| Room Type | Floor theme | Key props | Enemy weight |
|---|---|---|---|
| Cell / Prison | B1, F1 | Iron bars, pallet bed, bucket | Low |
| Library / Study | F1, F2 | Bookshelf ✅, lectern ✅, globe ✅, reading table ✅ | Medium |
| Alchemy Lab | F1, B1 | Potion rack ✅, vats ✅, coil ✅, reagent shelf 🔲 | Low |
| Workshop | F2, F3 | Workbench 🔲, tool rack 🔲, blueprints scroll 🔲 | Low |
| Observatory | F9, F11 | Astrolabe ✅, globe ✅, telescope 🔲, star chart 🔲 | None (story) |
| Guard Barracks | F3–F7 | Bunk ✅, mess table ✅, locker 🔲, weapon rack 🔲 | High |
| Armory | F4–F8 | Weapon display 🔲, shield rack 🔲, chest 🔲, coal pile 🔲 | Medium |
| Forge | F4, F6 | Anvil ✅, cooling trough ✅, weapon display 🔲, coal pile 🔲 | Medium |
| Ritual Chamber | Any | Circle geometry, candles, summoning diagram 🔲 | Very high (boss) |
| Corridor | Linking | Torch sconces ✅, arrow slit windows 🔲 | Low–medium |
| Boss Chamber | Top floor | Throne 🔲, dramatic backdrop, floor rune 🔲 | Boss only |
| Hidden Room | Any | Behind breakable wall; rare loot chest 🔲 | None |
| Basement Records | B1 | Filing shelves 🔲, journals ✅ concept, candidate profiles 🔲 | None |

### 3c — Dungeon Props Master List

Grouped by category; needed across all dungeon types:

**Furniture**
| Prop | Status | Used in |
|---|---|---|
| Bookshelf (tall) | ✅ | Library, Study |
| Bookshelf (half, overflowing) | 🔲 | Library, Basement |
| Lectern | ✅ | Library, Ritual |
| Reading table | ✅ | Library, Workshop |
| Workbench | 🔲 | Workshop, Forge |
| Bunk bed | ✅ | Barracks |
| Mess table + benches | ✅ | Barracks |
| Locker (metal) | 🔲 | Barracks, Armory |
| Throne (ornate) | 🔲 | Boss Chamber |
| Filing shelf | 🔲 | Basement |
| Chest (open / closed) | 🔲 | Any loot room |
| Barrel cluster | 🔲 | Corridor, Armory |

**Equipment & Display**
| Prop | Status | Used in |
|---|---|---|
| Anvil | ✅ | Forge |
| Cooling trough | ✅ | Forge |
| Weapon display (swords/axes) | 🔲 | Armory, Forge |
| Shield rack | 🔲 | Armory |
| Coal pile | 🔲 | Forge |
| Tool rack | 🔲 | Workshop |
| Weapon rack variant (spears) | 🔲 | Barracks, Armory |

**Science / Magic**
| Prop | Status | Used in |
|---|---|---|
| Potion rack | ✅ | Alchemy |
| Vats (large) | ✅ | Alchemy |
| Distillation coil | ✅ | Alchemy |
| Reagent shelf | 🔲 | Alchemy |
| Astrolabe | ✅ | Observatory |
| Globe (world) | ✅ | Library, Observatory |
| Telescope | 🔲 | Observatory |
| Star chart scroll (wall) | 🔲 | Observatory |
| Summoning diagram (floor) | 🔲 | Ritual Chamber |
| Floor rune (emissive) | 🔲 | Boss Chamber, Ritual |

**Structural / Atmosphere**
| Prop | Status | Used in |
|---|---|---|
| Torch sconce | ✅ | All |
| Iron bars (cell) | 🔲 | Cell/Prison |
| Pallet bed | 🔲 | Cell/Prison |
| Arrow slit window | 🔲 | Corridor, Barracks |
| Breakable wall section | 🔲 | Hidden room entrance |
| Loot chest (rare) | 🔲 | Hidden rooms |
| Candle grouping | 🔲 | Ritual, Library |

---

## 4 · CAVES & GLADES

### 4a — Cave Biomes

| Biome | Atmosphere | Key props | Generator |
|---|---|---|---|
| Crystal Cave | Cool, glowing, blue-white | Crystal formation small/med/large 🔲, glowing pool 🔲 | `cave-controls` ⚙ |
| Lava Cave | Hot, red-orange, dangerous | Lava flow 🔲, scorched rock pillar 🔲, ember particles 🔲 | `cave-controls` ⚙ |
| Fungus Cave | Damp, bioluminescent, eerie | Giant mushroom small/med/large 🔲, spore cloud VFX 🔲 | `cave-controls` ⚙ |
| Ice Cave | Cold, brittle, silent | Ice stalactite 🔲, ice stalagmite 🔲, frozen pond 🔲 | `cave-controls` ⚙ |
| Ancient Cave | Dusty, carved, story | Stone pillar 🔲, carved glyph wall 🔲, altar 🔲 | `cave-controls` ⚙ |
| Bog Hollow | Murky, wet, smells bad | Dead tree 🔲, mud pool 🔲, will-o-wisp VFX 🔲 | `cave-controls` 🔲 |

### 4b — Glade Props (outdoor equivalent)

| Prop | Status |
|---|---|
| Standing stone circle | 🔲 |
| Fairy ring (mushrooms) | 🔲 |
| Ancient tree (massive, hollow) | 🔲 |
| Ruined arch | 🔲 |
| Ritual bonfire (extinguished) | 🔲 |

---

## 5 · OVERWORLD TERRAIN

### 5a — Biomes

| Biome | Noise range | Ground colour | Feature props | Transition tiles |
|---|---|---|---|---|
| Bog | < 0.2 | Dark brown-green | Dead tree ✅ concept, mud pool 🔲, twisted shrub 🔲 | 🔲 |
| Forest | 0.2–0.5 | Mid green | Cone tree ✅, rock cluster ✅ | 🔲 |
| Highland | 0.5–0.8 | Yellow-green | Boulder 🔲, sparse shrub 🔲 | 🔲 |
| Cliffside | > 0.8 | Grey-brown | No spawns, cliff face geometry 🔲 | 🔲 |
| Grassland | extended | Bright green | Flower patch 🔲, lone tree 🔲 | 🔲 |
| Desert | climate variant | Tan-orange | Cactus 🔲, sand dune 🔲 | 🔲 |
| Tundra | climate variant | White-grey | Snow drift 🔲, ice patch 🔲 | 🔲 |
| Ocean shore | coastal | Blue-sand | Dock ✅ concept, drift wood 🔲, pier 🔲 | 🔲 |
| Mountain | elevation | Slate grey | Boulder 🔲, cliff face 🔲, cave mouth marker 🔲 | 🔲 |

### 5b — Road Types

| Type | Visual | Status |
|---|---|---|
| Dirt track | Worn brown path, no kerb | ✅ road mesh exists |
| Cobble road | Stone texture, town interior | 🔲 |
| Bridge (river crossing) | Wooden planks, rope rails | 🔲 |

### 5c — Water Features

| Feature | Status |
|---|---|
| River (flowing, animated) | ✅ HydrologyGenerator |
| Lake basin | ✅ HydrologyGenerator |
| Waterfall (cliff edge) | 🔲 |
| Coastal shore (wave shader) | 🔲 |

### 5d — World Feature Markers (placed by realm generator)

| Marker | Purpose | Status |
|---|---|---|
| Dungeon entrance (stone arch) | Leads into dungeon | ✅ DungeonPlacer |
| Settlement gate | Leads into settlement | ✅ BuildingGenerator |
| Tower entrance | Main story entry | ✅ OverworldScene |
| Cave mouth | Leads into cave | 🔲 |
| Resource node (ore/herb/wood) | Phase 7 crafting | 🔲 |
| Enemy camp marker | Visual anchor for camp | 🔲 |

---

## 6 · ENEMIES & CREATURES

### 6a — Tower Enemies

| Enemy | Geometry | Tier | Phase | Status |
|---|---|---|---|---|
| Slime Guard | Flattened sphere, wobble shader | 1 | 2 | 🔲 (AI concept only) |
| Stone Automaton | Compound box primitives, orange crack glow | 2 | 3 | 🔲 |
| Spell Wisp | Octahedron + particle ring, hue-shift shader | 2 | 5 | 🔲 |
| Runic Sentinel | Tall cylinder + floating torus shoulders | 3 | 5/6 | 🔲 |
| Bone Warrior | Segmented cylinder bones, emissive eyes | 1 | 3 | DNA defined 🔲 |
| Shadow Caster | Dark sphere, smoke trail | 2 | 4 | 🔲 |
| Drake Whelp | Boss — compound body, wing quads | 3 | 7 | 🔲 |

### 6b — Exterior Enemies

| Enemy | Geometry | Tier | Phase | Status |
|---|---|---|---|---|
| Forest Sprite | Irregular icosahedron, semi-transparent | 1 | 6 | 🔲 |
| Highland Brute | Oversized capsule + small sphere head | 3 | 6 | 🔲 |
| Forest Troll | Large lumpy compound, moss texture | 2 | 6 | 🔲 |
| Bog Wraith | Wispy elongated sphere, fog particles | 2 | 6 | 🔲 |
| Stone Golem | Large boulder body + arm slabs | 3 | 7 | DNA defined 🔲 |

### 6c — Elite Variants

Every enemy type needs an Elite version:
- 2× HP, 1.3× damage
- Crown geometry floating above head (emissive gold)
- Unique guaranteed loot drop
- Status: 🔲 all elites unbuilt

### 6d — Boss Creatures

| Boss | Location | Status |
|---|---|---|
| Drake Whelp | Tower top floor / Dragon Lair | 🔲 |
| Ancient Golem | Dwarven Mine final chamber | 🔲 |
| Lich Archon | Barrow Tomb | 🔲 |
| Grove Sentinel | Fae Hollow | 🔲 |

### 6e — Creature Creator Output (Procedural Creature System)

The creature-lab generates creatures from DNA. Each DNA yields a unique creature with:
- Procedural body segments (torso, limbs, head variants)
- Colour palette from biome/faction DNA
- Stat block derived from tier + DNA values
- Animation rig (idle, walk, attack, die)

| DNA type | Generator | Status |
|---|---|---|
| Biped (humanoid) | `creature-lab` | ⚙ partial |
| Quadruped | `creature-lab` (IK POC) | ⚙ POC exists |
| Flying | `creature-lab` | 🔲 |
| Aquatic | `creature-lab` | 🔲 |
| Amorphous (slime/wisp) | `creature-lab` | 🔲 |

---

## 7 · PLAYER CHARACTERS (Playable Species)

| Species | Visual style | Unique geometry features | Status |
|---|---|---|---|
| Human | Modest humanoid, practical colours | Cape/cloak toggle | ✅ princess model |
| Undead | Desaturated, hollow eyes, visible bones | Jaw gap, exposed rib | 🔲 |
| Vulperia | Anthropomorphic fox, ear geometry | Ears + tail procedural | 🔲 |
| Slime | Amorphous blob that holds a vaguely humanoid shape | Vertex wobble shader | 🔲 |
| Elf | Tall, angular, leaf-motif details | Pointed ears, elongated limbs | 🔲 |
| Celestial | Glowing, slightly translucent, star-dust particles | Halo ring, light-emit shader | 🔲 |
| Draconic | Scaled, horned, tail | Horn pair, tail, scale pattern shader | 🔲 |

Each species needs: idle, walk, run, attack, cast, dodge, death animations.

---

## 8 · NPCs

### 8a — Settlement NPCs

| Role | Factions | Dialogue | Quest | Status |
|---|---|---|---|---|
| Merchant | Human/Elf/Dwarf | Trading lines | Supply Line quest | 🔲 |
| Guard | Human/Orc | Challenge / dismiss lines | — | 🔲 |
| Quest giver | All factions | Quest briefing | Various | 🔲 |
| Wanderer | All | Rumour lines | — | 🔲 |
| Alchemist | Human/Elf | Shop lines | Ruined Greenhouse | 🔲 |
| Innkeeper | Human/Dwarf | Welcome lines, rest mechanic | — | 🔲 |
| Librarian | Elf/Human/Undead | Lore lines | The Ninth Tower | 🔲 |

### 8b — Story NPCs

| Character | Location | Status |
|---|---|---|
| Arcanist Solmor | Tower exterior / cutscene | ✅ encounter stages 1–3 scripted |
| The Missing Familiar (cat-construct) | Overworld | 🔲 geometry + quest hook |
| Baron (Baron's Keep) | Baron's Keep | 🔲 |
| Previous Candidate references | Basement journals | 🔲 narrative only |

---

## 9 · SPELLS & MAGIC VFX

Each spell needs: projectile/effect mesh, shader, impact burst particles, cooldown indicator VFX.

### 9a — Active Spells

| Spell | Tier | Visual | Shader colour | Status |
|---|---|---|---|---|
| Magic Bolt | 1 | Small sphere + trail | `#88CCFF` pale blue | ✅ basic |
| Flame Dart | 1 | Elongated sphere + heat distortion | `#FF6600` | 🔲 shader incomplete |
| Arcane Ward | 1 | Translucent bubble, ripple on hit | `#AAFFDD` teal | 🔲 |
| Chain Lightning | 2 | Jitter line geometry, arc to 3 targets | `#FFFF44` | 🔲 |
| Gravity Well | 2 | Dark sphere + swirling torus particles | `#660099` | 🔲 |
| Nova Burst | 3 | Expanding torus mesh, 0→30 units radius | `#FFFFFF`→`#FF88FF` | 🔲 |
| Mass Animate (Ultimate) | 3 | Purple pillar per resurrected enemy | `#9900CC` | 🔲 |

### 9b — Passive Spell VFX

| Effect | Trigger | Visual | Status |
|---|---|---|---|
| Familiar Bond aura | On recruit | Faint rune-glow additive pass | 🔲 |
| Burn DoT tick | On hit, 2s | Orange ember burst | 🔲 |
| Zombie resurrection | Mass Animate | Purple particle pillar (per enemy) | 🔲 |
| Projectile pierce | Footnote unlock | Trail continues through mesh | 🔲 |

### 9c — Book Items (readable, unlock spells)

| Book | Spell unlocked | Visual style | Status |
|---|---|---|---|
| *Arcane for Dummies Vol. 1* | Magic Bolt | Battered brown cover | 🔲 |
| *Introductory Pyromancy* | Flame Dart | Singed red cover | 🔲 |
| *Defensive Theory and Practice* | Arcane Ward | Blue leather, gold clasp | 🔲 |
| *On the Conductivity of Aetheric Energy* | Chain Lightning | Yellow-white crackled | 🔲 |
| *Captor's Personal Notes — "DO NOT READ"* | Gravity Well | Plain journal, "DO NOT READ" | 🔲 |
| *Advanced Transmutation* | Nova Burst | Heavy tome, crystal inlay | 🔲 |
| *The Complete Works* | Mass Animate (Ultimate) | Top floor only, enormous | 🔲 |

---

## 10 · ITEMS & LOOT

| Item | Type | Dropped by | Status |
|---|---|---|---|
| Spell book | Unlock | Bookcases, hidden rooms | 🔲 visual only |
| Tower key | Quest | Elite enemies, Solmor's desk | 🔲 |
| Reagent bundle (herb) | Crafting | Overworld gather, Alchemist | 🔲 |
| Ore chunk | Crafting | Resource node (Phase 7) | 🔲 |
| Rare book (lore) | Lore | Elite enemies | 🔲 |
| Captor's journal entry | Story | Basement only | 🔲 |
| Minion recall beacon | Utility | Crafted (Phase 7) | 🔲 |

---

## 11 · UI & HUD ELEMENTS

| Element | Description | Status |
|---|---|---|
| Health bar | Player HP, faction-coloured | ✅ |
| Spell hotbar | 5 slots, cooldown ring, icon per spell | 🔲 |
| Minimap | 128×128 canvas, fog-of-war | 🔲 |
| Recruitment roster | Party panel, minion portraits | 🔲 |
| Dialogue box | Speaker portrait + text scroll + choice buttons | ✅ Solmor dialogue |
| Seed display | Current world seed, copy-to-clipboard | ✅ |
| Floor title toast | "Floor N — [name]" fade-in | ✅ |
| Book read overlay | Full-screen book UI, page turn | 🔲 |
| Quest tracker | Top-right corner, active quest + objective | 🔲 |
| Rest/save prompt | Campfire or inn trigger | 🔲 |

---

## 12 · GENERATOR TOOL COVERAGE MAP

This maps each Overworld Studio generator to the asset types it must produce. **This is the specification for building each generator.**

| Generator | Produces | Inputs | Output saved as |
|---|---|---|---|
| `settlement-controls` | Settlement ward layout (2D map), building footprints | faction, size, seed | `LibraryEntry` type=`settlement` |
| `building-viewer` pipeline | Full 3D building interior, room-by-room | buildingType, faction, floors, seed | `LibraryEntry` type=`building` |
| `dungeon-controls` | Dungeon floor plan (all floors), room connections | dungeonType, complexity, seed | `LibraryEntry` type=`dungeon` |
| `cave-controls` | Cave map (2D noise), biome, prop placements | biome, size, density, seed | `LibraryEntry` type=`cave` |
| `realm-controls` | Realm geography, settlement positions, dungeon markers | climate, shape, roughness, seed | (not yet saved to library) |
| `solar-controls` | Solar system with planet types, star | starType, planetCount, seed | (not yet saved to library) |
| **MISSING** | Enemy / creature DNA → 3D mesh preview | DNA params | `LibraryEntry` type=`creature` 🔲 |
| **MISSING** | NPC profile → portrait + stat block | role, faction, seed | `LibraryEntry` type=`npc` 🔲 |
| **MISSING** | Spell VFX preview | spellId, tier, colour | (preview only, no save needed) 🔲 |
| **MISSING** | Biome tile set preview | biome, climate | `LibraryEntry` type=`terrain` 🔲 |

### New generators to build (priority order)

1. **Creature/Enemy generator** — DNA → mesh preview in Studio (feeds `creature-lab` system)  
2. **NPC generator** — role + faction + seed → portrait geometry + stat block card  
3. **Terrain tile preview** — biome + climate → tile swatch grid  
4. **Spell VFX sandbox** — select spell, see full shader preview with impact test  

---

## 13 · CONTENT COMPLETION GATE (per game phase)

| Phase | Required new assets |
|---|---|
| Phase 2 (tower combat basics) | Slime Guard + Stone Automaton meshes, torch sconces ✅, cell props |
| Phase 3 (recruitment) | Stone Automaton, Bone Warrior, crown (elite marker) |
| Phase 4 (mid-tower) | Forge props, Armory props, Shadow Caster |
| Phase 5 (spells) | All Tier 1 spell VFX + books, Spell Wisp, Runic Sentinel |
| Phase 6 (overworld) | Exterior enemy meshes, biome feature props, cave props, settlement buildings basic set, NPCs basic set |
| Phase 7 (power fantasy) | Tier 3 spell VFX, boss creatures, all elite variants, crafting items |
| Phase 8 (all species) | 6 additional character meshes + animation rigs, species-specific building variants |
| Content complete | All rows above fully ✅ |

---

## 14 · QUICK GAPS SUMMARY

**Most blocking (Phase 2–5 gated):**
- All enemy meshes (every single enemy is 🔲 mesh-unbuilt)
- Remaining dungeon props: locker, weapon display, coal pile, telescope, star chart, chest, breakable wall
- Tier 1 spell VFX for Flame Dart, Arcane Ward

**Next priority (Phase 6):**
- Settlement buildings basic set (Inn × factions, House × factions)
- NPC characters (Merchant, Guard, Quest Giver at minimum)
- Overworld biome features (desert/tundra variants, cliff face geometry)
- Cave biome prop sets (crystal, lava, fungus, ice)

**Generator gaps (no generator exists yet):**
- Creature/Enemy DNA → mesh preview
- NPC profile generator
- Terrain tile preview
- Spell VFX sandbox


---
