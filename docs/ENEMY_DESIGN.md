# Enemy Design

## Overview

Enemies in *Tomes, Towers & Transmutation* serve three roles:
1. **Obstacles** — they guard books, doors, and staircases.
2. **Resources** — defeated enemies drop loot; spared enemies become minions.
3. **Comedy** — the overarching power fantasy arc requires the player to eventually smash through enemies that once felt threatening.

All enemies are constructed from procedural primitive geometry. No sprite sheets or 3D model assets until Phase 8.

---

## Design Principles

- **State-machine AI:** Every enemy operates on a simple FSM. Complexity comes from mixing enemy types, not from complex individual AI.
- **Readable telegraphs:** Every enemy attack has a 0.3–0.5s wind-up visual (color change, particle burst) before dealing damage.
- **Recruitment incentive:** Sparing enemies is actively rewarded. Killing everything is valid but suboptimal.
- **Difficulty via density, not HP bloat:** Later floors/zones add more enemies and faster AI transitions, not just bigger health bars (until Phase 7's intentional parody of that trope).

---

## AI State Machine (Base)

All enemies use this base FSM. Individual types extend or override transitions.

```
[IDLE]
  │  player enters detection radius
  ▼
[ALERT]   (0.5s pause, look-at animation)
  │  player remains in range
  ▼
[CHASE]
  │  player enters attack range
  ▼
[ATTACK]  → [COOLDOWN] → [CHASE / IDLE depending on player position]
  │
  ▼ (HP < 10% threshold)
[FLEE]    ← optional; required for recruitment mechanic
```

---

## Enemy Catalogue

### Tower Enemies

#### Slime Guard
- **Phase introduced:** Phase 2
- **Geometry:** Single flattened `SphereGeometry` with vertex displacement (wobbly noise shader)
- **Color:** Sickly green (`#44AA44`), glow on attack (`#AAFFAA`)
- **Stats:** Low HP, low damage, medium move speed
- **AI:** Base FSM. No Flee state — not recruitable.
- **Attack:** Melee only. Short lunge toward player.
- **Design note:** Tutorial enemy. Designed to teach dodge-roll and melee range.

#### Stone Automaton
- **Phase introduced:** Phase 3
- **Geometry:** Compound box primitives (torso, limbs). Blocky, angular silhouette.
- **Color:** Grey (`#888888`), cracks glow orange when damaged
- **Stats:** High HP, medium damage, slow move speed
- **AI:** Base FSM + **ARMORED** state: first 40% of HP, ranged projectiles pass through (reflected). Must close to melee range.
- **Attack:** Slow slam with large AOE hitbox. Telegraphed by raising arms (scale up limb mesh on y-axis).
- **Recruitable:** Yes. Recruited Automatons act as tanks in the party.

#### Spell Wisp
- **Phase introduced:** Phase 5
- **Geometry:** Small `OctahedronGeometry` + orbiting particle ring
- **Color:** Shifting hue (HSL animation in shader over time)
- **Stats:** Very low HP, medium damage, high move speed
- **AI:** CHASE → ATTACK uses ranged projectile. Strafe behavior during COOLDOWN (moves perpendicular to player).
- **Attack:** Fires a Magic Bolt clone (same shader, different color). 0.4s charge-up visual before firing.
- **Recruitable:** Yes. Recruited Wisps provide ranged support.

#### Runic Sentinel
- **Phase introduced:** Phase 5 (rare) / Phase 6 (common)
- **Geometry:** Tall cylinder torso with floating torus "shoulders" and a conical helmet shape
- **Color:** Deep navy with gold rune markings (emissive texture generated via Canvas API)
- **Stats:** High HP, high damage, medium move speed
- **AI:** Base FSM + **PATROL** behavior in IDLE (walks a fixed path until player detected).
- **Attack:** Two-hit melee combo (first hit slow, second hit fast). Telegraphed by weapon-glow (emissive uniform spike).
- **Recruitable:** Yes. Elite encounter — must reduce to <10% HP without killing.

---

### Exterior Enemies

#### Forest Sprite
- **Phase introduced:** Phase 6
- **Geometry:** Irregular `IcosahedronGeometry`, semi-transparent
- **Color:** Woodland green/brown
- **Stats:** Low HP, low damage, very high move speed
- **AI:** Pack behavior — 3+ Sprites share a threat target. When one enters CHASE, nearby Sprites also transition.
- **Recruitable:** Yes. Cheap recruits, useful for swarming.

#### Highland Brute
- **Phase introduced:** Phase 6
- **Geometry:** Oversized capsule body + small sphere head
- **Color:** Muddy red (`#883322`)
- **Stats:** Very high HP, very high damage, slow move speed. Knock-back on hit.
- **AI:** Enters CHARGE state when player is far — straight-line sprint (fast) that can be dodged. Transitions to ATTACK if charge connects.
- **Recruitable:** Yes. Highest individual DPS in the minion pool.

---

## Elite Enemies

Each enemy camp in the exterior has one Elite. Elites are the same type as their camp but with:
- 2x HP
- 1.3x damage
- A unique visual indicator (crown geometry floating above head)
- Guaranteed rare loot drop

---

## Recruitment System

A unit can be recruited when:
1. Their HP drops below **10% of max**.
2. The player triggers the "Spare" action (hold interact key while in range of a fleeing/downed enemy).
3. The unit transitions to **RECRUIT** state, stops hostility, and joins the party.

Recruited units:
- Follow the player using NavMesh pathfinding.
- Target whatever the player is targeting (last hit).
- Use their normal attack patterns against enemies.
- Are visually marked with the rune-glow aura (teal additive shader).

### Party Limits

| Phase | Max Party Size |
|---|---|
| 5 | 1 |
| 6 | 5 |
| 7 | 20 |

Exceeding the cap: the player is prompted to dismiss an existing minion.

---

## The Wizard Captor (Final Boss)

**Phase 8 only.**

The Wizard Captor is the narrative payoff — not a mechanical challenge. He is intentionally designed to be anticlimactic.

- **HP:** Low (equivalent to a standard Tier 1 enemy)
- **Attack:** One slow magic bolt per 3 seconds
- **AI:** Stands in place, fires a single bolt, looks confused
- **Defeat:** Triggers a cutscene/dialogue sequence
- **Design note:** The joke is that after all the player's accumulated power, he takes exactly 1 Nova Burst to kill. The challenge was getting here — not him.

---

## Open Questions

- [ ] Should enemies have loot tables or drop only currency/resources?
- [ ] Fleeing AI — do enemies actually pathfind away from the player, or just run in the opposite direction? NavMesh-based flee is expensive.
- [ ] Should there be a "surrender" dialogue for Elites to add character to the world?
