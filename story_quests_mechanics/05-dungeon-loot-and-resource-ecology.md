# 05 — Dungeon, Loot, and Resource Ecology

## Purpose

This document defines how procedural dungeons and overworld danger sites feed the rest of the game.

The project already has:
- tower floors
- dungeon generators
- planned cave, crypt, ruin, mine, and vault entrances
- enemy camps
- lore books
- recruitable enemies
- reagent-based quest hints
- worldgen support for varied destinations

What is missing is a clear answer to:

**“Why am I going into this dangerous place, and what exactly should I expect to bring back?”**

This document answers that question.

---

## Core Principle

A dungeon is not just a combat map.

A dungeon is a **knowledge-and-material extraction site** with narrative meaning.

Every dungeon or danger site should produce at least two of the following:
- knowledge
- materials
- recruits
- territory leverage
- quest progress
- defensive intelligence

If it produces only generic loot and XP-feeling progress, it will not support the game’s identity.

---

## Site Taxonomy

The world should contain several site families, each with a distinct reward ecology.

## 1. Tower Interior Floors
These are the most authored procedural spaces.

Primary outputs:
- Solmor notes
- key tower function unlocks
- early and mid-tier books
- archive truths
- room-specific restoration tools
- recruitable tower-specific enemies

Role in progression:
- teaches the core loop
- introduces reclaimed-space fantasy
- reveals the princess’s relationship to Solmor’s infrastructure

---

## 2. Library Ruins
Collapsed study halls, archive vaults, scriptoriums, buried book chambers.

Primary outputs:
- tomes
- grimoires
- school-deepening texts
- faction history
- hidden ciphers
- incomplete forbidden theories

Role in progression:
- strongest knowledge-site archetype
- supports build specialization
- supports story truth and research unlocks

---

## 3. Alchemy Vaults / Laboratories
Process-heavy spaces tied to failed experiments, sealed chambers, old distillation complexes.

Primary outputs:
- formulas
- process diagrams
- rare reagents
- unstable catalysts
- spell mutation theory
- volatile transmutation inputs

Role in progression:
- primary transmutation site
- links dungeons directly to research and potion systems

---

## 4. Tombs / Barrows / Grave Sites
Spaces of burial, memory, spirit-binding, or undeath.

Primary outputs:
- shadow and death-affinity texts
- memory artifacts
- moral choice relics
- spirit residues
- undead followers or summons
- identity-relevant story evidence

Role in progression:
- strongest for Undead and Slime arc crossover
- high story density
- supports choice-heavy quest content

---

## 5. Beast Lairs / Shrines / Wild Groves
Creature-centric spaces, corrupted glades, fungal caves, shrines reclaimed by magical fauna.

Primary outputs:
- taming data
- herbology resources
- creature parts
- beast resonance texts
- elite recruit opportunities
- growth or poison formulas

Role in progression:
- strongest companion-support ecology
- links gathering with recruitment

---

## 6. Mines / Industrial Ruins / Dwarven Works
Excavation, ore, mechanism, pressure, geometry, forgotten industry.

Primary outputs:
- mineral inputs
- conductors
- construct parts
- smithing/crafting bases
- anti-armor or anti-automaton knowledge
- environmental puzzle tools

Role in progression:
- strongest material-site archetype
- vital for defense consumables and certain mutation branches

---

## 7. Observatory / Celestial Ruins
Star charts, signal devices, altitude magic, broken sky machinery.

Primary outputs:
- gravity / void / celestial research
- omen-based defense intelligence
- predictive doctrine
- rare ritual catalysts
- species-specific revelations for Celestial and Draconic arcs

Role in progression:
- late-mid to late-game site family
- high-tier research and looming-threat content

---

## 8. Enemy Camps / Surface Threat Nodes
Short-form overworld danger sites rather than full dungeons.

Primary outputs:
- small materials
- recruit opportunities
- local safety
- faction or defense pressure reduction
- map information
- lane-threat data before assaults

Role in progression:
- quick response content
- supports world pressure loop
- lower commitment but high practical value

---

## Reward Ecology by Site

The player should learn that each site family has a “reward grammar.”

| Site type | Books | Reagents | Monster parts | Recruits | Story truth | Defense intel |
|---|---:|---:|---:|---:|---:|---:|
| Tower floors | High | Medium | Medium | Medium | Very high | High |
| Library ruins | Very high | Low | Low | Low | High | Medium |
| Alchemy vaults | High | Very high | Medium | Low | Medium | High |
| Tombs / barrows | Medium | Medium | High | Medium | High | Low |
| Beast lairs / groves | Low | High | Very high | Very high | Medium | Medium |
| Mines / works | Low | High | High | Medium | Low | High |
| Observatory ruins | High | Medium | Low | Low | High | Very high |
| Enemy camps | Low | Low | Medium | High | Low | Medium |

This makes destination choice strategic.

---

## Loot Categories

Loot must be legible enough that the player can plan around it.

## Category A — Immediate-use combat loot
Examples:
- potion ingredients
- throwable reagents
- charge crystals
- oil bases
- emergency cures

Purpose:
short-term expedition and combat prep.

## Category B — Research loot
Examples:
- diagrams
- annotated pages
- component sketches
- ward residue samples
- preserved monster organs
- archive fragments

Purpose:
feeds research, library, and transmutation branches.

## Category C — Structural loot
Examples:
- wardstone
- lock-seals
- arcane hardware
- relay pieces
- ritual housings
- observatory components

Purpose:
restores tower functions, unlocks facilities, prepares defense options.

## Category D — Companion-support loot
Examples:
- morale herbs
- taming scents
- beast salves
- command sigils
- follower rations
- role-specific enhancers

Purpose:
supports followers in field and defense loops.

## Category E — Signature relics
Examples:
- a grimoire anchor
- a preserved candidate focus
- a beast crown
- a phase crystal
- a royal sigil fragment
- a sealed appendix case

Purpose:
major build or story turning points.

---

## Loot Quality Philosophy

Loot quality should not simply be “common → rare → epic” in a generic RPG sense.

It should reflect **meaning**.

Recommended quality tags:
- **Practical** — broadly useful, stable
- **Specialized** — useful in specific schools or strategies
- **Dangerous** — strong, but unstable or costly
- **Historical** — tied to archives, story, legitimacy, or prior candidates
- **Sovereign** — tied to rulership, command, and tower-domain power
- **Forbidden** — late, risky, morally or narratively charged

This keeps itemization themed.

---

## Dungeon Objectives Beyond “Clear All Enemies”

To make site loops richer, dungeons should generate several objective modes.

## 1. Extraction
Goal:
retrieve a book, relic, or material and escape.

Good for:
- tome hunts
- stealth-leaning play
- risk/reward runs

## 2. Purge
Goal:
destroy or neutralize a threat source.

Good for:
- defense-pressure reduction
- faction or corruption problems
- story cleanup beats

## 3. Recovery
Goal:
repair, stabilize, or bring back an intact object.

Good for:
- tower restoration
- structural progression
- puzzle-heavy content

## 4. Capture
Goal:
spare or secure an elite, beast, or unstable specimen.

Good for:
- companion builds
- Menagerie loops
- Monster Theory research

## 5. Investigation
Goal:
understand what happened, interpret records, or confirm a narrative truth.

Good for:
- story arcs
- Solmor / candidate history
- hidden consequences

## 6. Containment
Goal:
prevent spread of anomaly, infestation, or wave pressure.

Good for:
- response expeditions
- defense intelligence
- transmutation-heavy utility play

This variety is important so procedural spaces do not all feel like room-clearing chores.

---

## Recruitment Ecology

Recruitment should be tied to site identity.

## Tower enemies
Give:
- familiarized tower defenders
- house-trained arcane creatures
- factionally meaningful servants or resentful staff-beasts

## Wild beasts
Give:
- mobility scouts
- swarm units
- gatherer helpers
- grove-linked specialists

## Constructs
Give:
- durable defenders
- anti-siege role units
- utility specialists
- ward maintenance synergy

## Undead or spectral entities
Give:
- story-ambiguous allies
- control, fear, or scouting roles
- morally charged quest consequences

## Elite site guardians
Give:
- rare high-impact followers
- unusual role combinations
- strong flavor identity
- species-arc or story significance

The player should eventually be able to look at a site and think:

**“This is where I go if I want a better ranged defender.”**

or

**“This site is worth doing because it may contain a tank-tier recruit.”**

---

## Dungeon-to-Tower Return Value

Every successful expedition should ideally return with something useful in at least two time horizons.

## Short-term return
- consumable ingredients
- immediate spell unlock
- one useful recruit
- quick quest turn-in

## Mid-term return
- research branch progress
- floor restoration materials
- catalyst accumulation
- defense preparation options

## Long-term return
- grimoire path
- new tower function
- story revelation
- future site unlock
- world pressure shift

This keeps expeditions from feeling one-note.

---

## Resource Ecology Across the World

The game should encourage different site choices by tying resource families to the world.

## Tower spaces
- arcane theory
- controlled apparatus
- latent ward matter
- Solmor-linked truth

## Forest / grove biomes
- botanical reagents
- beast-linked matter
- poison and restoration bases

## Bogs / grave regions
- decomposition chemistry
- spirit residue
- memory-linked and death-linked materials

## Highlands / ruins
- minerals
- structural fragments
- aerial or observatory-linked artifacts

## Settlements and faction zones
- processed trade goods
- refined versions of wild materials
- social or political access to recipes and manuals

This makes the overworld’s biome logic support the transmutation system.

---

## Site Difficulty and Reward Structure

Harder sites should not only give “more” rewards. They should give **different classes** of rewards.

## Easy sites
- stable practical materials
- low-tier tomes
- simple recruits
- early quest components

## Medium sites
- specialization materials
- school-deepening texts
- stronger recruits
- meaningful defense intel

## Hard sites
- dangerous catalysts
- grimoires
- signature relics
- elite followers
- narrative bombshells
- branch-defining research

This encourages bravery through desire, not just stat scaling.

---

## Procedural Generation Guidance

The procedural system should be informed by reward ecology.

A generated site should know:
- its primary family
- its secondary reward bias
- whether it is story-tagged
- whether it can host elite recruits
- whether it may contain a guaranteed knowledge object
- whether it contributes to active regional threat buildup

### Example tags
- `knowledge_rich`
- `volatile_materials`
- `beast_capture_opportunity`
- `defense_intel`
- `quest_locked`
- `candidate_archive`
- `school_pyromancy_bias`

These tags would let future generation and encounter systems remain coherent.

---

## Quest Integration

Quest content should leverage dungeon ecology rather than override it.

Examples:
- a species quest sends the player to a tomb not just for lore, but because that tomb also naturally supports memory-residue gathering
- a defense-prep quest points the player toward a mine because the mine’s normal output includes anti-construct salts
- a general greenhouse quest rewards future reagent income and changes the ecology of transmutation permanently

This keeps authored content aligned with system logic.

---

## Defense Integration

Certain sites should feed defense directly.

Examples:
- observatory ruins reveal likely approach vectors for future assaults
- beast shrines yield scents that reroute beast-heavy waves
- mines yield anti-armor charges
- alchemy vaults yield anti-swarm gas
- tower archive records reveal weak points in specific enemy doctrines

This is how dungeon delving should make the future defense game smarter.

---

## Failure Design

If the player aborts or fails a site, the site should still matter.

Possible retained outputs:
- partial map knowledge
- discovered entrance identity
- enemy family recognition
- likely resource bias
- revealed elite type
- story clue
- known future revisit target

The player should not feel a failed run was meaningless.

---

## Implementation Implications

This design implies the following production needs:

1. **Site-family metadata**
   Dungeons and overworld nodes need typed reward identities.

2. **Loot-category metadata**
   Items must express system role, not only rarity.

3. **Recruit-source mapping**
   Enemy families and site families should inform follower acquisition strategy.

4. **Knowledge-placement planning**
   Certain texts must be guaranteed by site family or quest state.

5. **Threat-intel rewards**
   Some destinations should explicitly produce defense-relevant information.

6. **Biome/resource coherence**
   Overworld generation and gathering need category-level identity.

---

## Final Rule

A dungeon or danger site is successful content only if it changes what the player can do back at the tower.

If a site does not meaningfully affect:
- knowledge
- transmutation
- companions
- tower restoration
- defense preparation
- story truth

then it is content-shaped noise and should be redesigned.