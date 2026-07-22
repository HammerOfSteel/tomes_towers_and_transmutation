# Game Design Document: Tomes, Towers & Transmutation

**Working Title:** Captive Ascendant
**Genre:** Isometric Action-RPG
**Platform:** Browser (WebGL)
**Status:** Active development — `DEMO_RELEASE` alpha targeting itch.io / Kickstarter
**Last updated:** 2026-07 (full system implementation, targeting M1 content alpha)

---

## 1. Core Concept

*Tomes, Towers & Transmutation* subverts the "princess in a tower" trope by giving the captive full agency and an exponentially escalating power fantasy.

A princess, imprisoned by an absent-minded wizard who has simply forgotten about her, discovers his library of arcane textbooks in her cell. Left completely unsupervised, she teaches herself magic from his own books, breaks out, claims the tower as her fortress, and ventures into the surrounding wilds to amass power, resources, and a monster army — all to deliver a spectacularly disproportionate act of revenge on the oblivious captor.

**Emotional arc:** *Helplessness → Curiosity → Competence → Unstoppable.*

**Tonal target:** Earnest action gameplay with a comedic payoff. The world takes itself seriously enough that the combat and exploration feel satisfying; the narrative winks at the player.

---

## 2. Narrative

### Setup
The princess wakes in a stone cell. The wizard is away (he always is). Her only company is a shelf of dense arcane textbooks and a window that overlooks a monster-filled forest.

### Progression Narrative
Each spell she learns is tied to a specific book. The captor's margin notes — scrawled reminders to himself — serve as environmental storytelling that reveals his character (pompous, oblivious, surprisingly mundane concerns) while also occasionally providing power-ups ("*Note to self: ward expires after 1.5 seconds.*").

### Climax
After clearing the tower, recruiting an army, and unlocking the most destructive spells in existence, she finally encounters the Wizard Captor. He is exactly as pathetic as expected. The game ends with her claiming his tower and his title.

---

## 3. Gameplay Loop

```
[Explore Floor] → [Find Book] → [Learn Spell] → [Use Spell in Combat]
                                                          ↓
                              [Spare Enemy] ← [Defeat Enemy at <10% HP]
                                    ↓
                             [Recruit Minion]
                                    ↓
                        [Exit Tower / Explore Wilds]
                                    ↓
                      [Gather Resources / Clear Camps]
                                    ↓
                       [Return, Upgrade, Repeat]
```

### Core Pillars

1. **Study & Learn** — Spells are diegetically unlocked by reading in-world books. No abstract skill trees.
2. **Explore & Conquer** — Procedurally generated tower interiors and open exterior wilds.
3. **Action Combat** — *A Link to the Past*-style real-time combat in isometric 3D: spacing, dodging, melee swings, aimed projectiles.
4. **Recruit & Build** — Spare enemies to recruit them as minions. Gather resources to upgrade the tower base.
5. **Progress to OP** — Power curve is intentionally exponential. The final boss is a narrative punchline.

---

## 4. Player Character

The player character is chosen at game start via a narrative campfire dialogue with the wizard's familiar. There are **4 species**, each with unique passives, abilities, a talent constellation, and a 4-act story arc.

| Species | Passive | Combat Style | Signature Ability |
|---|---|---|---|
| **Human** | Iron Will — 20% damage reduction below 25% HP | Melee/mage hybrid | Shield Bash, War Cry |
| **Undead** | Undying Hunger — restore 5% HP on kill | Life-drain / death magic | Death Bolt, Phase Shift |
| **Vulperia** (fox) | Predator's Eye — first hit on each enemy always crits | Burst assassin / kiting | Shadow Step, Scatter Shot |
| **Slime** | Amorphous — immune to knockback, 15% reduced fall damage | Area-denial / engulf | Acid Spit, Engulf |

- **Movement:** WASD, isometric camera lock. Smooth movement with kinematic character controller; wall-sliding on collision.
- **Combat (melee):** Sweeping arc hitbox attack with brief stun. Short range.
- **Combat (ranged):** Mouse-aimed spell projectiles. Unlocked progressively via books.
- **Defense:** Dodge-roll (i-frames + repositioning). Arcane Ward spell (brief invulnerability bubble).
- **Stats:** HP, basic damage multiplier, spell slots, party limit. Scaled by phase.

---

## 5. Progression Systems

### Spell Progression
Books are the primary progression driver. See [docs/MAGIC_SYSTEM.md](docs/MAGIC_SYSTEM.md) for the full spell catalogue. 12+ spells across 6 elements (fire, ice, lightning, arcane, shadow, nature).

### Talent Trees
Each species has a 30-node talent constellation with 7 paths (Blade Dancer, Arcanist, Warlock, Conductor, Artificer, Apothecary, Naturalist) plus 4 species-gated signature nodes. One talent point granted per level-up. See `src/progression/TalentSystem.ts`.

### Species Story Arcs
Each species has a unique 4-act story (16 beats total) with branching outcomes. Story objectives include `defeat_enemies`, `read_lore`, `talk_to_npc`, `defeat_elite`, `interact_key`. See `src/world/StoryQuestLine.ts` and `src/world/StoryRunner.ts`.

### General Quests (5)
Shared quests available to all species: Missing Familiar, Supply Line, Ruined Greenhouse, Baron's Complaint, The Ninth Tower.

### Minion Army
Recruited minions follow the player, attack the player's target, and have their own HP pools. They persist until dismissed or killed. See [docs/ENEMY_DESIGN.md](docs/ENEMY_DESIGN.md).

### Base Building (Phase 7)
After clearing the tower, the player can direct minions to gather resources and construct basic defenses. Intentionally kept "lite" — this is a power fantasy layer, not a full RTS.

---

## 6. Tech Stack (Code-First Approach)

| System | Technology | Rationale |
|---|---|---|
| Renderer | Three.js (WebGL) | Flexible, well-documented, browser-native |
| Physics | Rapier3D (WASM) | Fast, modern, JS-friendly |
| Build | Vite | Fast HMR, great TypeScript support |
| Art (phases 1–7) | Procedural primitives + GLSL shaders | No assets needed; forces stylistic consistency |
| Level data | JSON blueprints | Human-readable, version-controlled, editor-exportable |
| UI / Dialogue | HTML/CSS canvas overlay | No UI framework overhead |

For architectural constraints, branch rules, and the No-Asset rule, see [ARCHITECTURE.md](../ARCHITECTURE.md).

---

## 7. Tone & Feel Reference

| Aspect | Reference |
|---|---|
| Combat feel | *A Link to the Past* (precise, readable hitboxes) |
| Power curve | *One-Punch Man* (the build-up matters; the payoff is comedy) |
| Isometric perspective | *Hades*, *Bastion* (locked angle, readable geometry) |
| Procedural aesthetic | *Minecraft* (simple geometry, coherent world) |
| Narrative subversion | *Undertale* (trope awareness without being ironic-hollow) |

---

## 8. Out of Scope (Current Version)

- Multiplayer
- Mobile support
- Voice acting
- Save-to-cloud / leaderboards
- Endless/roguelite mode (post-launch consideration)
- Localization

---

## 9. Tower Architecture — Floor Purposes

The tower has seven distinct floors plus a basement, each designed by the Wizard for a specific
purpose and now being reclaimed by the princess, floor by floor.  Clearing a floor of enemies
makes it part of her permanent safe space.

| Floor | Name | Wizard's Original Use | Princess Reclaims It As |
|---|---|---|---|
| B1 | **The Alchemical Workshop** | Ingredient prep, distillation, volatile experiments. There is a stain on the floor he never explained. | Potion crafting station; reagent storage; upgrade bench. |
| 0 | **The Grand Foyer** | Where supplicants waited — sometimes for weeks — to petition him. He enjoyed that. | The home base. Door to the outside world. Board for tracking quests and recruited monsters. |
| 1 | **The Library of Accumulated Arrogance** | Dense arcane research, forbidden knowledge, and approximately four hundred unfinished manuscripts. | The source of her power. Every spell she learns came from his own bookshelf. |
| 2 | **The Brewing Chamber** | Industrial-scale potion production. He called it "optimised workflow". | Mass-production of combat consumables for the army. The central cauldron is enormous. |
| 3 | **The Living Quarters** | His private rooms, surprisingly austere given the ego. A diary that must never be read. | Her bedroom. She reads the diary immediately. It is worse than expected. |
| 4 | **The Menagerie / Followers' Den** | Where his monster "associates" were housed. They called him "the tall nervous one". Central hall plus individual wing rooms per monster type — slime pool, goblin corner, etc. | Party headquarters. Recruited minions settle here; their comfort affects morale. |
| 5 | **The Observatory** | Ostensibly for astronomy. Actually for spying on the Baron next door. Detailed surveillance notes. | Strategic overview. The telescope reveals the entire overworld. Used to plan expeditions. |

### Design Note — Clearing Sequence
The player starts in a cell on an unnumbered sub-floor (below B1) and fights upward.  Each floor
is procedurally generated around the thematic blueprint for that level but guarantees the key
fixture (cauldron, telescope, diary, etc.) is always present.

---

## 10. Outdoor Locations

The surrounding wilderness is procedurally generated on a heightmap (biome: bog → forest → highlands).
Structures found in the world initially contain enemies; clearing them permanently adds them to the
player's territory.

### Enemy Camps
Small clusters of 3–8 enemies with a tougher elite variant.  Spread via Poisson-disk sampling to
prevent crowding.  Can be cleared for resources.

### The Ruined Greenhouse
A circle of crumbling stone pillars partially swallowed by the forest, with an overgrown stone-slab
floor.  The Wizard grew rare magical ingredients here.  The floor plan is **round**, unlike the
tower's rectangular rooms.  Once cleared it becomes a source of rare crafting reagents.

### Other Structures (future phases)
- **The Watchtower Ruin** — highlands vantage point; restoring it extends the telescope's range.
- **The Bog Shrine** — submerged stone altar; clearing it unlocks a water-affinity spell.
- **The Abandoned Mine** — resource node for rare minerals used in advanced upgrades.
- **The Baron's Keep** — late-game location; the Baron is also annoyed at the Wizard.