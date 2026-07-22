# Game Inventory
> ⚠️ GAP — What procedural assets does the complete game world actually need?

## Status: ⚠️ Partially tracked (ASSETS_TODO.md + asset_models_todo.md) but not unified

## Why This Matters
The procedural pipeline (PROC-B) builds creators. But we need to know exactly what types and variants are required before we can call the game "content complete". This file is that master list.

---

## 🏙 Settlement Assets

### Building Types (per faction)
| Type | Human | Elven | Dwarven | Orcish | Fae | Needed |
|---|---|---|---|---|---|---|
| Inn | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 5 variants |
| Blacksmith | 🔲 | 🔲 | 🔲 | 🔲 | — | 4 variants |
| Market stall | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 5 variants |
| House small | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 5 variants |
| House large | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 5 variants |
| Temple/shrine | 🔲 | 🔲 | — | 🔲 | 🔲 | 4 variants |
| Guard post | 🔲 | — | 🔲 | 🔲 | — | 3 variants |

### NPCs (per faction, per role)
| Role | Species | Count needed |
|---|---|---|
| Merchant | Human/Elf/Dwarf | 3 per settlement |
| Guard | Human/Orc | 2 per settlement |
| Quest giver | All | 1-2 per settlement |
| Wanderer | All | 2-4 per settlement |
| Alchemist | Human/Elf | 1 per town+ |

---

## ⚔ Dungeon Assets

### Room Props (per floor type)
| Floor | Props needed |
|---|---|
| Alchemy (B1/-1) | Potion rack ✅, vats ✅, coil ✅ |
| Library (1) | Bookshelf ✅, reading table ✅, globe ✅ |
| Forge (4) | Anvil ✅, cooling trough ✅ — needs: weapon display, coal pile |
| Barracks (5) | Bunk ✅, mess table ✅ — needs: locker, weapon rack variant |
| Observatory (9) | Astrolabe ✅, globe ✅ — needs: telescope, star chart scroll |

---

## 🌍 Overworld Terrain

### Biome Tile Variants needed
| Biome | Ground tile | Feature tiles | Transition tiles |
|---|---|---|---|
| Forest | 🔲 | Trees (3 sizes) | 🔲 |
| Desert | 🔲 | Cacti, dunes | 🔲 |
| Tundra | 🔲 | Snow drift, ice patch | 🔲 |
| Grassland | 🔲 | Rocks, bushes | 🔲 |
| Ocean shore | 🔲 | Dock, pier | 🔲 |
| Mountain | 🔲 | Boulder, cliff face | 🔲 |
| Bog | 🔲 | Dead tree, mud pool | 🔲 |

> See: `03-procedural-pipeline/environment-art-system.md` for implementation

---

## 🌿 Cave / Glade Assets

### Cave Biome Props
| Biome | Needs |
|---|---|
| Crystal Cave | Crystal formations (3 sizes), glowing pool |
| Lava Cave | Lava flow, scorched rock pillar |
| Fungus Cave | Giant mushroom (3 sizes), spore cloud |
| Ice Cave | Ice stalactite/stalagmite, frozen pond |
| Ancient Cave | Stone pillar, carved glyph wall |

---

## 🧙 Creature Assets

| Creature | Tier | Builder status |
|---|---|---|
| Bone Warrior | 1 | DNA defined 🔲 build needed |
| Stone Golem | 2 | DNA defined 🔲 build needed |
| Shadow Caster | 2 | 🔲 |
| Drake Whelp (boss) | 3 | 🔲 |
| Forest Troll | 2 | 🔲 |
| Bog Wraith | 2 | 🔲 |

> Full list: `04-characters/enemy-system.md`

---

## Priority Order
1. Overworld terrain tiles (blocking game world integration)
2. Settlement buildings basic set (blocking settlement integration)
3. NPCs basic set (blocking quest givers)
4. Remaining dungeon props (polish)
5. Cave biome props (polish)
