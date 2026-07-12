# Magic System Design

## Overview

Magic is the central mechanic of *Tomes, Towers & Transmutation*. The princess begins with zero abilities. Every spell she gains is tied to a specific book she reads — magic is **earned through narrative, not through combat XP**.

This document covers: the spell catalogue, the progression pathway, the projection (combat) system, and the shader design conventions for magic visuals.

---

## Design Philosophy

- **Diegetic learning:** Spells come from in-world books. No skill tree menus.
- **Power should *feel* illegal:** By Phase 7, the player should be clearing rooms before enemies finish their aggro animation.
- **Visual clarity first:** Every spell has a distinct color signature and particle profile. Players should never mistake one spell for another.

---

## Progression Pathway

```
[Read Book] → [Unlock Spell] → [Assign to Hotkey] → [Use in Combat]
```

Books are placed by the procedural generator in bookcases, lecterns, and hidden alcoves. Some are locked behind doors the player can only open once strong enough. The captor's personal footnotes (margin annotations in his own books) serve as environmental storytelling and occasionally unlock passive upgrades.

### Spell Slots

| Phase Unlocked | Slots Available |
|---|---|
| Phase 1 (start) | 0 — no spells |
| Phase 5 | 2 active, 1 passive |
| Phase 6 | 3 active, 2 passive |
| Phase 7 | 5 active, 3 passive + 1 "ultimate" |

---

## Spell Catalogue

### Tier 1 — Foundational (Phase 5)

#### Magic Bolt
- **Book:** *Arcane for Dummies, Vol. 1 — Projecting Force*
- **Type:** Active, projectile
- **Mechanic:** Mouse-aimed sphere. Travels in a straight line. Detonates on contact dealing moderate damage.
- **Visual:** Small glowing sphere, pale blue. Faint trail shader (stretched quads along velocity vector).
- **Shader color:** `#88CCFF`

#### Flame Dart
- **Book:** *Introductory Pyromancy (Annotated Edition)*
- **Type:** Active, projectile
- **Mechanic:** Slightly faster than Magic Bolt. Applies a 2-second burn DoT on hit.
- **Visual:** Orange-red elongated sphere with a heat-distortion shader on the trailing edge.
- **Shader color:** `#FF6600`

#### Arcane Ward
- **Book:** *Defensive Theory and Practice*
- **Type:** Active, self
- **Mechanic:** 1.5-second invulnerability bubble. Short cooldown. Replaces/augments the dodge-roll.
- **Visual:** Translucent sphere around the player; vertex displacement shader causes it to "ripple" on impact.
- **Shader color:** `#AAFFDD` (rim-lit teal)

---

### Tier 2 — Escalation (Phase 6)

#### Chain Lightning
- **Book:** *On the Conductivity of Aetheric Energy*
- **Type:** Active, projectile
- **Mechanic:** Arcs to up to 3 enemies within range of the primary target.
- **Visual:** Procedural line geometry between targets; randomized per-frame "jitter" on vertex positions creates a crackling effect.
- **Shader color:** `#FFFF44`

#### Gravity Well
- **Book:** *Captor's Personal Notes — "DO NOT READ" (she reads it)*
- **Type:** Active, AOE
- **Mechanic:** Creates a pulling force field for 3 seconds. Enemies inside are slowed and pulled to the center.
- **Visual:** Dark sphere with a swirling torus of particles orbiting it. Particle positions driven by a spiral equation in the vertex shader.
- **Shader color:** `#660099`

#### Familiar Bond (Passive)
- **Book:** *A Bestiary of Mundane Creatures and Their Susceptibility to Enchantment*
- **Type:** Passive
- **Mechanic:** Recruited minions deal +20% damage and have +30% HP.
- **Visual:** Recruited minions gain a faint rune-glow aura (additive shader pass).

---

### Tier 3 — Power Fantasy (Phase 7)

#### Nova Burst
- **Book:** *Advanced Transmutation — Matter as Merely a Suggestion*
- **Type:** Active, AOE
- **Mechanic:** Full-screen shockwave centered on the player. Massive damage, 15-second cooldown.
- **Visual:** Expanding torus mesh that scales from 0 to ~30 units radius over 0.5 seconds, then fades. Every enemy hit spawns an impact particle burst.
- **Shader color:** `#FFFFFF` → `#FF88FF` fade

#### Mass Animate (Ultimate)
- **Book:** *The Complete Works — found only on the top floor*
- **Type:** Ultimate, field
- **Mechanic:** All defeated enemies in the current room rise as temporary minions for 20 seconds.
- **Visual:** Each resurrected enemy emits a pillar of purple particles on rise. Zombie-state indicated by pulsing dark-purple aura.

---

## Passive Upgrades (Captor Footnotes)

These are permanent unlocks that require no slot:

| Footnote Location | Effect |
|---|---|
| *Vol. 1*, margin p. 7 | Projectiles pierce through one enemy |
| *Vol. 3*, back cover | Spell cooldowns reduced by 10% |
| *Pyromancy* foreword | Burn DoT stacks up to 3 times |
| *Captor's Notes*, p. 1 | "Why is she reading this?" — unlocks Gravity Well |

---

## Shader Implementation Notes

All spell visuals are GLSL fragment or vertex shaders applied to Three.js `ShaderMaterial`.

### Projectile trail convention
```glsl
// Stretch UVs along the velocity vector, fade alpha toward the tail
float trailFade = 1.0 - vUv.x; // x = 0 at tip, 1 at tail
gl_FragColor = vec4(spellColor, trailFade * brightness);
```

### Glow / bloom
The game uses a post-processing `UnrealBloomPass` (Three.js postprocessing). Spell materials set `material.toneMapped = false` and emit HDR-range values to feed the bloom pass.

### Impact bursts
Impact particles use a `Points` geometry. Position is animated in the vertex shader using a simple radial expansion equation:
```glsl
vec3 pos = aPosition + aNormal * uTime * uSpeed;
pos.y += uTime * uTime * -4.9; // gravity
```

---

## Open Questions

- [ ] Should the player be able to combine spells (e.g., Flame Dart + Chain Lightning = Chain Fire)?
- [ ] How many books should be guaranteed spawns vs. purely random? Consider a "seed pity" system.
- [ ] Does the Arcane Ward feel redundant next to dodge-roll? Consider making them separate tools (Ward = defensive, Roll = repositioning).
