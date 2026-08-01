# 01 — Vision and Pillars

## Purpose

This document defines the **authoritative product direction** for *Tomes, Towers & Transmutation*.

The current project already has strong ingredients:
- a trapped-princess power fantasy
- Solmor’s tower and ascension mystery
- species-specific story arcs
- procedural dungeons
- recruitable enemies and followers
- spell unlocks through books
- overworld exploration
- alchemy and workshop spaces
- future tower-defense and crafting ambitions

What has been missing is a **single coherent center of gravity**.

This document establishes that center of gravity.

---

## The One-Sentence Fantasy

**A captive princess reclaims a wizard’s tower by mastering forbidden books, transforming loot into ever-stranger magic, binding creatures to her cause, and surviving story-driven assaults on the magical domain she is building.**

---

## Title-to-Mechanics Alignment

The game title must describe the real game loop, not just its mood.

## TOMES
“Tomes” means:
- books as the primary vector of magical growth
- grimoires as rare, build-defining progression milestones
- magical schools as knowledge traditions rather than generic skill trees
- annotations, footnotes, and stolen research as both lore and mechanical unlocks
- dungeons and quests as the main sources of forbidden or specialized knowledge

### Tomes pillar promise
The player should constantly ask:

**“What book might be hidden here, and how will it change my build?”**

---

## TOWERS
“Towers” means:
- Solmor’s tower as the central home, laboratory, archive, barracks, and throne
- reclaimed floors becoming new forms of systemic power
- tower spaces representing progression, not just scenery
- event-based assaults and defensive crises that test the domain the player has built
- strategic use of followers, companions, and tamed monsters as the core of defense

### Towers pillar promise
The player should constantly ask:

**“What have I turned this tower into, and can it survive what my growing power is attracting?”**

---

## TRANSMUTATION
“Transmutation” means:
- alchemy as a serious system, not a side craft
- research as a conversion layer between raw loot and advanced magical options
- spell mutation and spellcrafting through catalysts, reagents, and learned theory
- material transformation as the link between dungeons, gathering, quests, and combat power
- magical experimentation that grows more unstable, ambitious, and identity-defining over time

### Transmutation pillar promise
The player should constantly ask:

**“What can I make from what I found, and what new form can my magic take?”**

---

## Primary Genre Statement

This game is a:

**Story-rich action RPG with procedural dungeons, companion strategy, magical research, and event-based domain defense.**

That phrasing matters.

It is **not** primarily:
- a survival game
- a base-building game
- a roguelite run-reset game
- a pure tower-defense game
- a sandbox with detached systems

Those may be influences or secondary layers, but the game must remain legible as an **RPG with a strong authored fantasy spine**.

---

## Core Emotional Arc

The player journey should feel like:

1. **Confined**
2. **Curious**
3. **Capable**
4. **Cunning**
5. **Arcane**
6. **Feared**
7. **In command**
8. **Inevitable**

This expands the existing GDD arc of helplessness → curiosity → competence → unstoppable into something more systemically useful.

### Emotional mapping to systems

| Emotional stage | System expression |
|---|---|
| Confined | Locked rooms, scarce tools, weak body, little knowledge |
| Curious | First books, first hidden notes, first strange rooms |
| Capable | First stable combat build, first potion craft, first recruit |
| Cunning | Build choices, quest choices, species identity becomes meaningful |
| Arcane | Research labs, grimoires, school specialization, material conversion |
| Feared | Enemies react, factions notice, tower events escalate |
| In command | Companion assignments, tower defense prep, strategic expedition planning |
| Inevitable | Spellcrafting dominance, full-domain control, narrative payoff with Solmor |

---

## Design Pillars

## Pillar 1 — Knowledge is Power, Literally
The player’s magical growth should come from **study**, not generic XP menus.

This means:
- spells come from books, grimoires, rituals, or research breakthroughs
- new schools require knowledge gates, not only level gates
- dungeon exploration is valuable because it can reveal doctrine, not just loot
- footnotes and marginalia should act as “micro-discoveries” with mechanical consequence

### Implication
If a combat system addition has no believable relationship to knowledge, it is probably off-theme.

---

## Pillar 2 — The Tower is the Character’s Second Body
Solmor’s tower is not just a hub. It is the externalized form of the princess’s growth.

As floors are reclaimed, the player should feel:
- safer
- more informed
- more productive
- more dangerous
- more responsible

The tower should visually and mechanically reflect:
- current allies
- current story progress
- unlocked systems
- current research projects
- active dangers and pending assaults

### Implication
Reclaiming tower rooms is equivalent to unlocking RPG infrastructure.

---

## Pillar 3 — Dungeons Feed the Domain
Procedural dungeons are not disconnected content loops. Their outputs must matter upstream.

A dungeon should potentially produce:
- books
- grimoires
- catalysts
- monster species data
- ritual components
- rare reagents
- relic tools
- faction evidence
- recruitable elites
- defensive intelligence

### Implication
If dungeon rewards are only gold or generic crafting parts, the dungeon loop will feel hollow.

---

## Pillar 4 — Companions are Strategy, Not Decoration
Followers, tamed creatures, spared elites, and familiars should each serve clear strategic roles.

The system should reward:
- sparing enemies at the right moment
- choosing which creatures belong in the active field party
- assigning followers to tower functions or defensive roles
- using species or follower synergies for both combat and events

### Implication
Companions should matter in three contexts:
1. exploration
2. combat
3. tower defense / domain management

If they matter in only one, the system will feel partial.

---

## Pillar 5 — Transmutation is the Great Unifier
Transmutation must bridge:
- loot
- gathering
- crafting
- alchemy
- spell mutation
- defense prep
- quest resolution

This is the “conversion fantasy” of the game:
the player takes messy, dangerous, magical world-material and turns it into order, advantage, and invention.

### Implication
Crafting should not be a flat recipe list. It should feel like applied magical theory.

---

## Pillar 6 — Story Must Pull the Systems Forward
The narrative should not sit beside the systems. It should justify, reveal, and escalate them.

Examples:
- a species quest reveals why a school of magic is unstable
- Solmor’s archives unlock a new research doctrine
- a reclaimed floor opens because the player understood a ritual, not because a checklist was completed
- a defense event is triggered because the player’s magical signature has become visible across the region

### Implication
Mechanics should arrive as consequences of story truth.

---

## Product Structure Recommendation

The game should be understood through **three concentric loops**.

## Loop A — Immediate Loop: Room-to-Room Action
Moment-to-moment gameplay:
- move
- cast
- dodge
- recruit/spare
- gather drops
- survive encounters

This is the action RPG layer.

## Loop B — Expedition Loop: Knowledge and Materials
Short-term planning:
- choose dungeon / biome / quest destination
- seek books, reagents, monster captures, or faction outcomes
- return to tower with new inputs

This is the adventure RPG layer.

## Loop C — Domain Loop: Research and Defense
Long-term progression:
- reclaim tower floors
- run research
- brew potions
- mutate spells
- assign companions
- prepare for threats
- defend the tower
- alter the world’s power balance

This is the high-level identity layer that makes the game distinct.

---

## Recommended Design Approach

There are three possible identity centers for the project:

### Option A — Story-first RPG
Story arcs define most progression and systems are subservient.
- Strong narrative cohesion
- Risk: procedural systems feel underused

### Option B — Systems-first sandbox RPG
Crafting, dungeons, and spell systems dominate; story reacts afterward.
- High replayability
- Risk: species arcs and Solmor premise feel ornamental

### Option C — Domain-first magical RPG
The tower is the center; story, dungeons, tomes, followers, and transmutation all feed back into reclaiming, empowering, and defending it.

### Recommendation: Option C
This is the strongest fit for the current project because it:
- honors the title most directly
- gives every major system a shared destination
- lets story and procedural content reinforce each other
- gives followers and defense mechanics a natural purpose
- creates a clear macro structure for future implementation planning

This document set therefore assumes:

**The tower-domain is the game’s central spine.**

---

## What Must Become More Coherent

The current design has several good systems that need stronger connective tissue.

## Existing strength
- Books unlock spells
- Species arcs exist
- Dungeons exist
- Recruits and followers are planned
- Overworld worldgen is rich
- Tower floors are thematic
- Alchemy spaces and reagent quests already exist in fragments

## Current weakness
- book progression is not yet tied to school mastery and research depth
- transmutation is implied more than designed
- defense exists as an idea but not yet as a clear RPG-domain loop
- dungeon loot ecology is not yet formally linked to tower growth
- followers are planned but not yet elevated into a core strategic axis
- story beats reference mechanics, but not yet consistently enough to define them

---

## Success Criteria

This design direction is successful if, after implementation, a player can clearly describe the game like this:

> “I explore dangerous dungeons and overworld ruins to find grimoires, reagents, and monsters worth sparing. I bring that knowledge back to the tower, use it to research and mutate my magic, strengthen my companions, and then defend the tower when the world pushes back.”

If the player instead describes it as:
- “a dungeon crawler with some books”
- “a spell game with crafting”
- “an RPG with a tower-defense mode”
then the systems are still too disconnected.

---

## Hard Scope Boundaries

To preserve coherence, the following boundaries should hold.

### Keep
- action-RPG combat
- species-specific narrative arcs
- procedural dungeon delving
- book-driven magical progression
- companion recruitment and assignment
- transmutation / alchemy / research
- event-based tower defense
- overworld settlements and factions as quest context

### Avoid
- freeform RTS construction
- infinite crafting material bloat
- disconnected loot rarity systems with no thematic meaning
- defense events so frequent they dominate the RPG
- separate progression currencies for every subsystem
- spellcrafting that becomes unreadable or impossible to balance
- tower management so abstract it feels like a different game

---

## Canonical Questions for Every Future Feature

Before adding or implementing a system, ask:

1. **Which pillar does this serve: Tomes, Towers, or Transmutation?**
2. **How does it feed back into the tower-domain loop?**
3. **How does story justify or reveal it?**
4. **What does dungeon delving contribute to it?**
5. **How do companions interact with it?**
6. **Why is this better than a simpler version?**

If a feature cannot answer these questions, it likely does not belong in the current design priority.