# Tomes, Towers & Transmutation — Story, Quests, and Mechanics Bible

This folder defines the **coherent gameplay and narrative spine** for *Tomes, Towers & Transmutation* so that the title itself becomes the game's structure:

- **Tomes** = discovery, study, grimoires, forbidden knowledge, spell unlocks, and magical specialization
- **Towers** = reclamation of Solmor's tower, defense of the princess's growing domain, and companion-led siege events in the overworld
- **Transmutation** = alchemy, research, potion brewing, material conversion, spell mutation, and long-term build expression

The purpose of this document set is to align:

1. **Story**
2. **Quest structure**
3. **Procedural dungeon progression**
4. **Companion and taming systems**
5. **Crafting / alchemy / research**
6. **Spell progression and spellcrafting**
7. **Tower-defense event design**
8. **Future implementation phases in `TODO/`**

---

## Folder Structure

### 01 — Vision and Pillars
Defines the game-wide fantasy, emotional arc, and the design pillars that all systems must support.

### 02 — Core Progression Loop
Explains the full macro loop from tower study to dungeon runs, overworld expeditions, research, crafting, and defense events.

### 03 — Tomes and Grimoire Progression
Defines how books, grimoires, annotations, spell schools, and magical mastery should work.

### 04 — Transmutation, Alchemy, and Spellcrafting
Defines the long-term build-expression layer: research, potion brewing, reagent processing, spell mutation, and spell synthesis.

### 05 — Dungeon, Loot, and Resource Ecology
Defines what dungeon-delving contributes to progression, what loot categories exist, and how dungeon content feeds the rest of the game.

### 06 — Towers, Companions, and Defense Events
Defines the “tower” pillar as domain defense using companions, tamed creatures, and prepared magical infrastructure rather than RTS-style building placement.

### 07 — Story and Quest Integration
Explains how species arcs, general quests, Solmor’s manipulation, faction pressure, and world events should tie directly into mechanics.

### 08 — Implementation Roadmap Mapping
Maps this design into the existing `TODO/` structure and identifies which parts belong in current files vs. new planning files.

---

## Design Goals

This documentation set must make the game feel like:

- an **RPG first**
- a **magical progression fantasy**
- a **procedural dungeon crawler with authored narrative meaning**
- a **companion-and-domain strategy game in bursts**
- a **crafting / alchemy / research sandbox** with strong world logic

It must **not** drift into:

- a pure roguelite
- a pure survival-crafting game
- a pure tower defense game
- a disconnected “feature list” where story and mechanics do not reinforce each other

---

## Core Design Statement

The princess does not merely escape the tower.

She **studies its books**, **reclaims its rooms**, **masters transmutation**, **binds allies and monsters to her cause**, **delves into dangerous procedural ruins for knowledge and reagents**, and eventually **defends the tower as the beating heart of her new magical domain**.

Every major system should answer one of these fantasies:

- **What did she learn?**
- **What did she reclaim?**
- **What did she transform?**
- **Who now follows her?**
- **What power did she bring back to the tower?**

---

## Canonical Mechanical Spine

The intended medium-to-long-term player flow is:

1. **Read / discover a tome**
2. **Unlock or deepen a spell school**
3. **Enter a procedural dungeon or overworld point of danger**
4. **Return with loot, reagents, monster intel, and potential recruits**
5. **Research and transmute materials in reclaimed tower spaces**
6. **Craft potions, catalysts, wards, and spell mutations**
7. **Strengthen companions / follower roster / defensive doctrines**
8. **Resolve quests and story beats that react to this growth**
9. **Defend the tower during event-based assaults**
10. **Push farther outward to find rarer books, stranger materials, and higher magical stakes**

---

## Non-Negotiable Thematic Rules

### 1. Books must matter materially
A tome cannot be just lore flavor. It must unlock one or more of:
- a spell
- a spell modifier
- a research branch
- a new alchemical recipe family
- a dungeon key / access rule
- a story truth that changes quest options

### 2. The tower must be a living hub
The tower is not just a menu space. Reclaimed floors should become:
- study spaces
- research labs
- follower quarters
- potion production rooms
- ritual chambers
- defense preparation spaces
- quest-state displays of the princess’s growing rule

### 3. Transmutation must unify multiple systems
Transmutation should connect:
- loot
- gathering
- potion brewing
- spell mutation
- crafting
- quest resolution
- defense preparation

### 4. Defense must be companion-centric
Defense events should emphasize:
- party composition
- follower assignments
- tamed creature roles
- magical preparations
- room/floor defense doctrines

They should **not** become a separate base-building genre of placing walls and turrets by hand.

### 5. Story beats must justify mechanics
When the player gains a new spell system, dungeon tier, defense event type, or transmutation layer, the story should explain:
- why it exists in Solmor’s tower
- why the princess is now capable of using it
- why the world reacts to it

---

## Relationship to Existing Docs

This folder does **not** replace:
- `docs/GDD.md`
- `docs/MAGIC_SYSTEM.md`
- `docs/STORY_DESIGN.md`
- `docs/ENEMY_DESIGN.md`
- `docs/OVERWORLD_PLAN.md`

Instead, it acts as the **design bridge** that binds those documents into one coherent product direction.

---

## Expected Outcome

After this folder is completed:

- the title fantasy should be explicit and mechanically grounded
- the story and species arcs should point toward the same gameplay spine
- procedural dungeons should clearly feed research and tower growth
- taming and companions should have a concrete strategic role
- TODO planning should be updated so implementation can happen in the correct phases