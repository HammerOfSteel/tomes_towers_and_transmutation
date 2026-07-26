# 08 — Implementation Roadmap Mapping

## Purpose

This document maps the new *Tomes, Towers & Transmutation* design spine into the existing `TODO/` structure.

The goal is to avoid two common failures:

1. creating a new design layer that never affects implementation planning
2. scattering the new work randomly across existing TODO files without clear ownership

This document defines:
- which existing TODO files should absorb which concepts
- which gaps should become new planning files
- which features should be phased earlier or later
- what “done” should mean for each new system family

---

## Guiding Rule

The new design should **extend** the current TODO roadmap, not replace it.

That means:
- reuse existing phase buckets where they already fit
- add missing files only where there is a genuine planning gap
- keep authored story content in `05-content`
- keep systemic runtime mechanics in `06-game-systems`
- keep overworld dungeon/site generation in `02` and `03`
- keep tower-domain expression aligned with quest, story, and system phases rather than inventing a disconnected ninth subsystem bucket

---

## Mapping Summary

## 01 — Overworld Studio
Relevant because:
- game inventory must include site families, tower-domain assets, reagent nodes, and defense-relevant props
- future design tools may need metadata for reward ecology, dungeon family bias, and tower-linked content tags

### Should absorb
- site-family taxonomy from `05-dungeon-loot-and-resource-ecology.md`
- required prop/support inventory for:
  - alchemy spaces
  - archive/library spaces
  - menagerie/follower spaces
  - observatory omen spaces
  - defense preparation spaces

### Best fit files
- `TODO/01-overworld-studio/game-inventory.md`
- future procedural designer docs if site metadata editors are added

---

## 02 — Game World Integration
Relevant because:
- the new design depends on the world actually knowing what each dungeon/site is for
- the player needs dungeon entrances, site identity, and reward-bias logic to exist in runtime world data

### Should absorb
- site-family metadata
- reward-bias tags
- threat-intel capable sites
- reclaimed territory / tower-pressure relationships

### Best fit files
- `realm-integration.md`
- `dungeon-integration.md`
- `cave-glade-integration.md`
- possibly a new file for “regional threat and domain pressure” if world integration grows complex

---

## 03 — Procedural Pipeline
Relevant because:
- builders and generators need metadata support for books, reagents, site tags, follower-role identity, and defense logic hooks

### Should absorb
- dungeon/site metadata tags:
  - `knowledge_rich`
  - `volatile_materials`
  - `defense_intel`
  - `candidate_archive`
  - `beast_capture_opportunity`
- generated reward ecology support
- content seeding support for:
  - guaranteed core books
  - site-family weighted books
  - elite recruit opportunities
  - threat-pressure seeding

### Best fit files
- `PROC-C-world-generation.md`
- `PROC-B-creator-tools.md` where creature / enemy / prop metadata need support
- `environment-art-system.md` if site identity requires visual reinforcement

---

## 04 — Characters
Relevant because:
- species identity now drives system emphasis
- followers and companion roles need clearer planning
- enemy families now influence recruit ecology and defense roles

### Should absorb
- species/system alignment notes
- recruit-role metadata
- elite recruit identity planning
- companion role clarity for field and defense

### Best fit files
- `enemy-system.md`
- `new-species-expansion.md`
- `princess-creator.md` only where player fantasy or species presentation reflects these doctrines

### Likely new planning need
A dedicated character-side planning file for companion/follower roles may eventually be warranted, but for now the stronger fit is:
- follower acquisition in `05-content/quests.md`
- follower runtime logic in `06-game-systems`

---

## 05 — Content
Relevant because:
- quests and story arcs are the main authored delivery mechanism for the new spine
- books, followers, transmutation problems, and defense escalations should often enter through content

### Should absorb
- quest rewards biased toward books, followers, research, reagent access, doctrine unlocks
- tower-return quest steps
- transmutation-based quest solutions
- defense events as narrative escalation beats
- prior-candidate content as cross-system glue

### Best fit files
- `quests.md`
- `story-arcs.md`
- `lore-books.md`
- `solmor-encounters.md`

### Strong candidate for new file
- `tower-domain-events.md` or similarly named content-planning file if defense events are written primarily as story-content beats rather than pure runtime systems

If the team prefers fewer new files, the fallback is:
- story triggers and authored events in `story-arcs.md`
- runtime defense logic in `06-game-systems`

---

## 06 — Game Systems
Relevant because:
this is where the largest planning gaps currently live.

### Must absorb
- tome state model and school progression support
- research project system
- transmutation materials and refinement tiers
- potion / formula families
- spell mutation structure
- defense doctrine system
- follower assignment and recovery logic
- tower threat forecasting / event cadence support

### Existing best fit
- `abilities-talents.md`

### Existing files needing expansion or companion docs
- `audio.md` only later for defense/readiness feedback
- `save-system.md` later for research state, library state, assignment state, tower damage state

### Strong new planning files recommended
1. `tomes-research-spellcraft.md`
2. `alchemy-transmutation-crafting.md`
3. `tower-defense-domain-events.md`
4. `follower-companion-system.md`

These are genuine gaps, not optional niceties.

The current `abilities-talents.md` is too narrow to hold:
- book taxonomy
- research structure
- spell mutation ladders
- follower tower assignments
- doctrine-based defense event preparation

---

## 07 — Testing
Relevant because:
new systemic depth requires stronger coverage than “does spell cast” or “does quest trigger.”

### Must eventually test
- guaranteed book progression logic
- site reward bias behavior
- research unlock state
- spell mutation state and branch persistence
- follower assignment persistence
- defense forecast / preparation / resolution flows
- quest beats that require tower return steps
- consequences of defense success/failure on tower state

### Best fit files
- `unit-tests.md`
- `e2e-playwright.md`
- `bot-testing.md`

---

## 08 — Polish & Release
Relevant because:
the new spine creates UX/documentation needs.

### Must absorb later
- better library UI clarity
- alchemy / research / spell mutation readability
- defense preparation UX
- companion role readability
- tower-state visual storytelling
- updated docs and milestone framing for the actual game fantasy

### Best fit files
- `ui-ux.md`
- `documentation.md`
- `milestones.md`

---

## Recommended New TODO Files

These are the most justified additions based on current gaps.

## 1. `TODO/06-game-systems/tomes-research-spellcraft.md`
Purpose:
plan the knowledge progression layer.

Should cover:
- book taxonomy
- seen / learned / studied / transmuted states
- school progression structure
- personal library system
- research unlock bridge
- structured spell mutation ladders

Reason:
current magic docs describe spells, but not the full knowledge progression architecture.

---

## 2. `TODO/06-game-systems/alchemy-transmutation-crafting.md`
Purpose:
plan the material conversion and alchemy layer.

Should cover:
- reagent categories
- refinement tiers
- facility-gated crafting
- potion families
- monster-derived components
- transmutation risk and instability
- quest and defense formula uses

Reason:
this is one of the clearest design pillars and currently lacks a dedicated phased plan.

---

## 3. `TODO/06-game-systems/follower-companion-system.md`
Purpose:
plan followers as a full strategy system rather than scattered quest rewards.

Should cover:
- follower taxonomy
- field roles
- tower roles
- active party vs assigned tower roles
- recruitment sources
- recovery/wounds/morale
- save/load implications

Reason:
the TODO overview already flags this as a high-priority gap.

---

## 4. `TODO/06-game-systems/tower-defense-domain-events.md`
Purpose:
plan forecast → preparation → assault → consequence flow.

Should cover:
- event families
- doctrine selection
- assignment system
- forecast UI/state
- floor-specific consequences
- how companion roles and spells interact
- authored vs systemic triggers

Reason:
this is too large and too identity-defining to remain a note inside some unrelated file.

---

## Recommended Expansions to Existing TODO Files

## `TODO/05-content/quests.md`
Add phases/tasks for:
- tower-return quest steps
- transmutation-based quest solutions
- follower rewards as strategic unlocks
- defense-prep beats
- facility restoration beats
- capture-target quest structure

---

## `TODO/05-content/story-arcs.md`
Add phases/tasks for:
- defense events as arc escalators
- prior-candidate arc hooks
- species/system emphasis notes
- tower-state changes per arc milestone
- Act II–IV ties to domain growth and pressure

---

## `TODO/05-content/lore-books.md`
Add phases/tasks for:
- book taxonomy
- guaranteed core texts
- school-deepening series
- candidate journals
- defense doctrine manuals
- site-family book placement rules

---

## `TODO/06-game-systems/abilities-talents.md`
Keep focused on:
- active/passive abilities
- talent trees
- direct combat kits

Add only references/outbound dependencies for:
- tome-based unlock states
- spell mutation hooks
- doctrine tags
- research dependencies

Do **not** overload it with the full transmutation plan.

---

## `TODO/02-game-world-integration/dungeon-integration.md`
Add phases/tasks for:
- site-family identity in runtime world data
- dungeon reward-bias metadata
- elite recruit opportunity tags
- defense-intel sources
- quest-locked or candidate-tagged sites

---

## `TODO/03-procedural-pipeline/PROC-C-world-generation.md`
Add phases/tasks for:
- site taxonomy data
- weighted knowledge placement
- material family distribution
- region pressure contribution
- recruit ecology hooks

---

## Feature Ownership by Phase Family

To keep implementation sane, these system families should belong primarily to the following areas:

| Feature family | Primary owner | Secondary owner |
|---|---|---|
| Book taxonomy and library | 06 systems | 05 content |
| School progression and spell mutation | 06 systems | 05 lore/books |
| Reagent ecology and alchemy | 06 systems | 02/03 world generation |
| Site reward identity | 02/03 world + procedural | 05 content |
| Follower acquisition | 05 content | 04 characters |
| Follower runtime behavior | 06 systems | 04 characters |
| Tower defense authored beats | 05 content | 06 systems |
| Tower defense runtime loop | 06 systems | 05 content |
| Prior-candidate story glue | 05 content | 06 systems |

This should prevent the planning from becoming muddled.

---

## Recommended Implementation Sequence

Not code sequence — planning and production sequence.

## Sequence A — Foundations
1. Tome/research/spellcraft planning
2. Alchemy/transmutation planning
3. Follower/companion planning
4. Dungeon/site reward ecology integration

## Sequence B — Story Integration
5. Quest reward and tower-return rewrite
6. Story arc escalation and candidate integration
7. Lore-book placement and taxonomy expansion

## Sequence C — Domain Pressure
8. Tower-defense/domain-events planning
9. Overworld/dungeon threat-intel hooks
10. Save/testing implications

This order keeps identity systems clear before content explodes.

---

## Definition of “Integrated Successfully”

The new design is successfully integrated into the roadmap when:

- there is a dedicated TODO home for tomes/research/spellcraft
- there is a dedicated TODO home for alchemy/transmutation
- there is a dedicated TODO home for followers/companions
- there is a dedicated TODO home for tower defense/domain events
- quests and story arcs reference tower return, transmutation, and defense escalation
- world/dungeon planning knows what site families produce
- no single existing TODO file is overloaded with unrelated responsibilities

---

## Final Rule

If a major pillar from this document set does not have a visible TODO home, it does not yet truly exist in production planning.

For this project, the pillars that must have visible TODO homes are:

- **Tomes**
- **Transmutation**
- **Companions**
- **Tower Defense / Domain Events**

Anything less leaves the title fantasy only partially implemented.