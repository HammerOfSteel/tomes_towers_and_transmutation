# Game Design Document: Tomes, Towers & Transmutation

**Working Title:** Captive Ascendant
**Genre:** Isometric Action-RPG
**Platform:** Browser (WebGL)
**Status:** Pre-production (design phase)

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

- **Movement:** WASD, isometric camera lock. Smooth movement with kinematic character controller; wall-sliding on collision.
- **Combat (melee):** Sweeping arc hitbox attack with brief stun. Short range.
- **Combat (ranged):** Mouse-aimed spell projectiles. Unlocked progressively via books.
- **Defense:** Dodge-roll (i-frames + repositioning). Arcane Ward spell (brief invulnerability bubble).
- **Stats:** HP, basic damage multiplier, spell slots, party limit. Scaled by phase.

---

## 5. Progression Systems

### Spell Progression
Books are the primary progression driver. See [docs/MAGIC_SYSTEM.md](docs/MAGIC_SYSTEM.md) for the full spell catalogue.

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

For architectural constraints, branch rules, and the No-Asset rule, see [ARCHITECTURE.md](ARCHITECTURE.md).

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