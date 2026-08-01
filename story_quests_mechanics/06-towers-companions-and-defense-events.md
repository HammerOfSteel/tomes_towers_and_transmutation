# 06 — Towers, Companions, and Defense Events

## Purpose

This document formalizes the **Towers** pillar as a companion-centered RPG domain system.

The existing project already supports or implies:
- Solmor’s tower as the central hub
- reclaimed floors with strong thematic identities
- recruitable enemies
- followers from quests
- minion army fantasy
- event / wave encounter logic
- overworld factions and danger sites

What is still missing is a clear definition of what “tower defense” means in this game.

This document defines it.

---

## Core Principle

Tower defense in *Tomes, Towers & Transmutation* should **not** mean:
- building maze walls
- placing anonymous turrets
- switching into a separate RTS

Instead, it should mean:

- preparing the tower as a magical fortress
- assigning companions and followers to roles
- using reclaimed spaces as tactical assets
- anticipating assault types
- solving crises with doctrine, preparation, and selective direct intervention

The player should feel:

**“This is my tower, these are my creatures, and this defense reflects the kind of ruler-mage I have become.”**

---

## What the Tower Must Be

The tower is simultaneously:

- home
- archive
- laboratory
- barracks
- political symbol
- magical beacon
- assault target

Its importance must grow as the player grows.

### Design requirement
A reclaimed floor should never feel like a decorative checkbox.

Every reclaimed floor should eventually support at least one of:
- a system unlock
- a companion role
- a story state
- a defense interaction
- a visible expression of rule

---

## The Tower as Domain

The tower should function as a **domain**, not only a location.

A domain has:
- assets
- weaknesses
- personnel
- responsibilities
- reputation
- consequences

### Domain outputs
The tower-domain should provide:
- crafting and research capacity
- spell mutation infrastructure
- follower housing and role assignment
- quest staging and display
- assault preparedness
- social/narrative proof that the princess is no longer merely captive

---

## Companion Taxonomy

To make defense strategic, companion types need clear identities.

## 1. Familiar Companions
Examples:
- cat-construct familiar
- spectral guide
- archive sprite
- survey beast

Typical strengths:
- scouting
- map reveal
- small utility buffs
- trigger warnings
- lore or interaction support

Defense role:
- early warning
- courier / signal relay
- support auras

---

## 2. Follower Allies
Examples:
- rescued NPCs
- story companions
- knightly claimant ally
- scholar aide
- settlement-linked assistants

Typical strengths:
- persistent identity
- quest interactions
- specialized noncombat and support roles
- stronger narrative presence than generic recruits

Defense role:
- command roles
- floor-specific assignments
- logistics or morale stabilization
- targeted specialist support

---

## 3. Recruited Monsters
Examples:
- automata
- wisps
- sprites
- brutes
- elite beasts
- tower-servitor creatures

Typical strengths:
- high tactical specialization
- numerous role options
- strong fantasy payoff from sparing enemies

Defense role:
- frontliners
- swarm clear
- choke-point holding
- ranged suppression
- anti-armor or anti-beast utility

---

## 4. Elite / Signature Companions
Examples:
- Elder Slime
- unique spectral follower
- reclaimed sentinel
- special candidate-linked entities

Typical strengths:
- unusual mechanics
- cross-system synergies
- build-defining defensive roles

Defense role:
- doctrine anchors
- rare counters to special wave types
- floor captain equivalents

---

## Companion Role Model

Every meaningful companion should lean toward one or more roles.

## Field roles
- Vanguard
- Skirmisher
- Artillery
- Controller
- Scout
- Harvester
- Capture Support

## Tower roles
- Gate Guard
- Floor Anchor
- Reserve Response
- Archive Sentinel
- Workshop Defender
- Menagerie Handler
- Signal Watch
- Recovery Support

This dual-role model is important because it gives followers value both outside and inside assaults.

---

## Defense Philosophy

A defense event should test four things:

1. **What the player knew**
2. **What the player prepared**
3. **Whom the player brought into their domain**
4. **Which part of the tower matters most right now**

It should not only test raw DPS.

---

## Defense Event Types

To keep assaults story-rich and mechanically distinct, the game should support multiple defense archetypes.

## 1. Beast Pressure Event
Cause:
- wild fauna agitated by magical disturbance
- shrine corruption
- neglected surface threat nodes

Defense feel:
- swarm control
- lane shaping
- lure management
- companion positioning

Good counters:
- beast-handling followers
- fear smoke
- corridor denial resin
- anti-swarm spells

---

## 2. Construct Breach Event
Cause:
- old tower systems reactivating
- automaton factions tracing Solmor’s signatures
- awakened industrial ruins

Defense feel:
- durable enemies
- structural pressure
- anti-armor priorities
- protecting fragile stations

Good counters:
- conductive salts
- stormcraft doctrines
- tank companions
- anti-construct manuals

---

## 3. Faction Raid Event
Cause:
- Baron forces, rogue claimants, anti-wizard factions, rival scavengers

Defense feel:
- coordinated attackers
- elite enemies
- story weight
- political consequences

Good counters:
- command-oriented followers
- strong gate defense
- targeted kill zones
- rally buffs and command magic

---

## 4. Arcane Instability Event
Cause:
- failed or risky transmutation
- forbidden studies
- grimoires opened too early
- ascension residue interaction

Defense feel:
- magical anomalies
- strange spawning behavior
- environmental hazards
- defending the tower from its own power

Good counters:
- ward experts
- stabilizers
- archive knowledge
- precise containment spells

---

## 5. Candidate / Legacy Event
Cause:
- another prior candidate’s actions
- a sealed archive unbound
- Solmor’s old systems recognizing a successor state

Defense feel:
- story-heavy
- unique enemies or conditions
- less common, more memorable
- often tied to revelations

Good counters:
- specific archive truths
- prepared doctrine
- signature companions
- meaningful quest completion state

---

## 6. Siege Forecast Event
Cause:
- observatory warning
- settlement rumors
- defense intel recovered in dungeons

Defense feel:
- more preparation lead time
- strategic assignment phase
- player agency before impact

Good counters:
- right preparation itself
- choosing what to defend hardest
- proper reserve placement

This type is especially important because it reinforces planning as a form of power.

---

## Defense Event Structure

A defense event should typically have three phases.

## Phase 1 — Forecast
The tower learns something is coming.

Sources:
- familiar warnings
- observatory reading
- faction rumor
- archive notice
- regional threat meter crossing a threshold

Player decisions:
- whether to respond in the field first
- whether to prepare the tower immediately
- which formulas, followers, and spells to ready

---

## Phase 2 — Preparation
The player allocates limited readiness.

Possible decisions:
- assign defenders to floors or rooms
- choose reserve squad
- craft limited-use defense consumables
- choose one or more active defense doctrines
- choose own active spell loadout for likely threat type

This phase must be meaningful without becoming a separate management game.

---

## Phase 3 — Assault / Resolution
The event occurs.

Possible gameplay modes:
- direct real-time defense inside the tower
- multi-room response sequence
- protect-and-stabilize objective
- kill-elite + contain-adds structure
- defend a key room while followers hold another

The player should feel like they are fighting **with** the tower and its inhabitants, not alone in a generic arena.

---

## Defense Preparation Systems

Preparation should be based on **doctrines**, **assignments**, and **consumables**.

## A. Doctrine Selection
A doctrine is a pre-committed strategic posture.

Examples:
- **Hold the Gate** — stronger entrance defense, weaker deeper-room response
- **Protect the Archive** — buffs library/record rooms, weaker outer ring
- **Layered Response** — generalist plan, fewer spikes, better flexibility
- **Hunter’s Net** — better against beasts and fast movers
- **Ground the Storm** — better against magical or construct threats
- **Royal Muster** — follower morale and rally strength improved

The player should not place 40 individual objects.
They should make a few meaningful doctrine choices.

---

## B. Companion Assignment
Assignments determine where and how followers contribute.

Examples:
- Gate Guard
- Library Watch
- Workshop Detail
- Menagerie Hold
- Mobile Reserve
- Signal Watch
- Recovery Team

Each assignment should favor certain companion types.

### Example
Automaton tank:
excellent Gate Guard, poor Signal Watch

Wisp:
excellent Signal Watch or Mobile Reserve, poor Gate Guard

Elder Slime:
excellent chokepoint hold, decent Menagerie Hold, weak Archive precision defense

---

## C. Defense Consumables
Prepared through transmutation.

Examples:
- anti-swarm smoke
- shock salts
- morale rally draught
- corridor resin
- ward refresh phial
- beast lure bundle
- corruption cleanser

Consumables are how crafting directly participates in defense without turning into structure placement.

---

## D. Spell Loadout Preparation
Some spells or mutations should gain extra relevance in defense.

Examples:
- Beacon Dart marks priority targets for defenders
- Sanctum Well creates defender-friendly kill zones
- Shepherd Ward helps clustered allies
- Signal Arc coordinates ranged companions
- Anchor Ward protects a key room or station

This is how spellcrafting and defense naturally connect.

---

## Reclaimed Floors as Tactical Identity

Each major floor should become a specific defense concern.

## Grand Foyer / Entry
Meaning:
first point of impact, symbolic front, triage zone

Defense value:
- gate hold
- broad interception
- morale visuals
- strongest place for command builds

## Library / Archive
Meaning:
knowledge heart of the tower

Defense value:
- must be protected in archive-centered events
- books and grimoires can be temporarily endangered
- ideal for arcane or scholar defense doctrine

## Alchemical Workshop / Brewing Chamber
Meaning:
production and chemical risk zone

Defense value:
- defense consumable staging
- volatility hazard during arcane breach events
- ideal for alchemy-focused builds

## Living Quarters / Royal Space
Meaning:
personal claim, legitimacy, emotional stakes

Defense value:
- high story value
- sometimes symbolic rather than mechanically dominant
- can affect morale and narrative consequences

## Menagerie / Followers’ Den
Meaning:
companion heart of the domain

Defense value:
- if compromised, companion systems suffer
- important in beast or corruption events
- strong staging area for recruit-heavy builds

## Observatory / High Arcane Chamber
Meaning:
future sight, omen reading, outer awareness

Defense value:
- warning generation
- threat forecasting
- often target in celestial or anomaly events

This makes the tower feel spatially meaningful.

---

## Pressure Sources and Event Triggers

Defense events should come from understandable sources.

## Trigger families

### 1. Growth triggers
The player became more visible or powerful.
Examples:
- new grimoire studied
- major tower floor restored
- forbidden research crossed threshold

### 2. Neglect triggers
The player ignored rising threats.
Examples:
- too many active camps nearby
- anomaly site left unresolved
- faction hostility left unchecked

### 3. Quest triggers
Story beats naturally provoke backlash.
Examples:
- exposing a faction
- claiming a symbol of rulership
- freeing or seizing a powerful entity

### 4. Experiment triggers
The player caused it.
Examples:
- unstable transmutation
- dangerous spell mutation branch
- archive breach

### 5. Scheduled narrative triggers
Major milestone events.
Examples:
- Solmor stage advances
- candidate revelations
- territorial recognition moments

These sources help defenses feel narratively justified.

---

## Consequences of Defense Outcomes

Defense should matter, but not be catastrophically punishing.

## Success outcomes
- preserve rooms
- gain morale or legitimacy
- unlock new doctrine text or books
- recruit survivors / captured elites
- reduce local threat
- deepen follower loyalty

## Partial failure outcomes
- room damage
- temporary station lockout
- wounded followers
- stolen or spoiled materials
- narrative embarrassment or faction boldness

## Major failure outcomes
- temporary loss of a floor function
- loss of rare materials
- follower death or departure risk
- stronger next threat chain

But not:
- campaign collapse
- full base reset
- total restart spiral

The system must invite engagement, not avoidance.

---

## Story Integration

Defense events are one of the best ways to make the tower feel like a lived narrative space.

Examples:
- a Human rulership arc event tests whether she can defend the banner she claimed
- an Undead event turns memory archives into a battleground
- a Slime event is triggered by dissolution research gone too far
- a Celestial event follows a signal flare seen across the region
- a Draconic event is caused by reclaiming disputed territory revealed in star charts

Defense should not sit outside the story. It should be one of the story’s clearest proof-of-power moments.

---

## Why Defense Must Be Companion-Centered

Companion-centered defense solves multiple design needs at once.

It:
- gives recruits a strategic use beyond field combat
- makes spared enemies meaningful long-term
- reinforces the tower-domain fantasy
- creates build diversity beyond solo spell loadouts
- lets quests reward followers without feeling ornamental
- avoids genre drift into construction-heavy RTS design

### Final defense identity statement
The player does not defend the tower with furniture.

The player defends the tower with:
- knowledge
- assignments
- preparations
- creatures
- allies
- doctrine
- personally chosen magical expression

---

## Implementation Implications

This design implies the following production needs:

1. **Follower role metadata**
   Companions need defense-capable role definitions.

2. **Assignment system**
   Followers need tower assignments, not only active-party states.

3. **Doctrine system**
   Defense posture choices need lightweight but meaningful data structures.

4. **Threat forecasting**
   The game needs warning and escalation visibility.

5. **Floor consequence tracking**
   Events need room/floor-specific outcomes.

6. **Defense-ready spell variants**
   Some spell mutations should explicitly reference tower defense use.

7. **Companion recovery logic**
   Followers need post-defense wound/recovery handling.

---

## Final Rule

A tower defense event is successful only if it expresses all three of the following:

- **what the player built**
- **who the player gathered**
- **what the player understood**

If it only tests combat damage, it is not yet a true *Tomes, Towers & Transmutation* defense event.