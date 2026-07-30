# Follower & Companion System
> Full companion strategy layer for *Tomes, Towers & Transmutation*. Covers familiars, followers, recruited monsters, field roles, tower roles, assignment logic, recovery, morale, and save-state implications. Depends on quest/content rewards in 05 and enemy/species support in 04.

## Status: ⚠️ GAP — partially referenced in quests and enemy docs; Phase 0 schema unblocking is now defined, later runtime phases still need dedicated production implementation

## Goals
- Turn followers into a **core strategic pillar**, not a side reward
- Unify familiars, quest followers, and recruited monsters under one system language
- Support meaningful differences between **active field party** and **tower assignments**
- Give companions clear value in:
  - exploration
  - combat
  - tower defense
  - domain identity
- Support recovery, morale, and persistence so companions feel like real assets

## Scope
This file covers:
- companion taxonomy
- party capacity and roster state
- field/tower roles
- assignment and recovery logic
- recruit source mapping
- save/load requirements

This file does **not** cover:
- book/research systems → see `tomes-research-spellcraft.md`
- material conversion → see `alchemy-transmutation-crafting.md`
- forecast/assault event loop → see future `tower-defense-domain-events.md`

---

## Phase 0 — Data Schema (content unblocker)

> Must ship before `TODO/05-content/quests.md` and `story-arcs.md` can safely reference follower recruits, companion rewards, roster roles, or tower-companion presence. This is the schema-first step that unblocks content before any AI/runtime work exists.

### Goals
- Define the minimum companion/recruit contracts that authored content can target
- Establish one roster language before quests/story arcs invent incompatible follower labels
- Separate schema unblocking from later acquisition/assignment/runtime implementation

### Tasks
- [ ] Define the minimal `CompanionDef` schema for quest/story rewards:
  - `id`
  - `displayName`
  - `taxonomy` (`familiar | follower_ally | recruited_monster | signature_companion`)
  - `sourceType`
  - `speciesAffinity?`
  - `fieldRoleIds[]`
  - `towerRoleIds[]`
  - `signatureTags[]`
- [ ] Define the minimal roster/save-state shape content will rely on:
  - active party IDs
  - reserve roster IDs
  - assignment entries by room/floor/role
  - unavailable/recovering state
- [ ] Define the shared enums/ID namespaces content needs first:
  - field role enum
  - tower role enum
  - bond/morale/wound state enums
  - acquisition/source tags for quest/story references
- [ ] Define the reward/reference payloads 05 content will need to point at:
  - direct companion recruit reward
  - roster-cap increase reward
  - role unlock reward
  - signature-companion unlock reward
- [ ] Document which 05-content references must wait on these schemas:
  - follower rewards in quests
  - companion/recruit identity notes in story arcs
  - tower-room companion presence outcomes
  - defense-assignment privilege rewards

### Done means
- 05-content can reference stable companion IDs/roles instead of prose-only recruit promises
- later companion runtime phases can implement against one roster contract

---

## Phase FCS-1 — Taxonomy, Data Model & Roster State

> Needs Phase 0 first.

### Goals
- Create one model that can represent all meaningful companion types
- Prevent followers from being split across ad hoc quest, enemy, and pet logic
- Track ownership, roles, and lifecycle cleanly

### Tasks
- [ ] Define companion taxonomy:
  - Familiar
  - Follower Ally
  - Recruited Monster
  - Elite / Signature Companion
- [ ] Add `CompanionDef` / `CompanionInstance` schema with:
  - `id`
  - `sourceType`
  - `sourceQuestId?`
  - `enemyArchetype?`
  - `speciesAffinity?`
  - `fieldRoles[]`
  - `towerRoles[]`
  - `rarity`
  - `bondState`
  - `moraleState`
  - `woundState`
  - `assignmentState`
- [ ] Add roster state:
  - active field party
  - tower reserve
  - room/floor assignments
  - unavailable / recovering
- [ ] Define initial capacity rules:
  - active party cap
  - total tower roster cap
  - special exceptions for signature companions if desired
- [ ] Add validation tests:
  - every companion has at least one legal role
  - active/tower state transitions are legal
  - duplicate-instance edge cases are blocked

### Done means
- the game can represent companions as one coherent systemic family
- later quest and defense logic has a stable target structure

---

## Phase FCS-2 — Acquisition Paths

### Goals
- Make companion acquisition legible and exciting
- Support different emotional tones for different companion types
- Link companions to site families, story arcs, and moral style

### Tasks
- [ ] Define acquisition methods:
  - scripted quest reward
  - spared/recruited enemy
  - elite capture
  - familiar rescue
  - candidate/legacy unlock
  - settlement ally
- [ ] Add recruit source tags aligned to site ecology:
  - tower defenders
  - beast lairs
  - tomb / spectral sites
  - mines / constructs
  - faction raid survivors
- [ ] Add capture/recruit metadata:
  - required HP threshold
  - capture window modifiers
  - incompatible recruitment cases
  - special item or formula support hooks
- [ ] Define how quest followers differ from monster recruits:
  - stronger narrative persistence
  - fewer disposable states
  - more unique utility roles
- [ ] Add tests:
  - recruitable enemies can become valid companion instances
  - quest companions enter roster cleanly
  - elite recruits keep signature tags and rarity

### Done means
- players can understand where different companion types come from
- recruitment becomes a route-planning motivation, not an incidental perk

---

## Phase FCS-3 — Field Roles & Combat Value

### Goals
- Give companions distinct combat and exploration functions
- Avoid generic “more bodies = always better” tuning
- Let builds care about team composition

### Tasks
- [ ] Define field roles:
  - Vanguard
  - Skirmisher
  - Artillery
  - Controller
  - Scout
  - Harvester
  - Capture Support
- [ ] Map current/planned enemy families and quest followers into these roles
- [ ] Add behavioral expectation notes per role:
  - target priority
  - preferred distance
  - mobility expectation
  - survivability expectation
- [ ] Add support hooks for formulas/buffs by role
- [ ] Add role-driven UI summaries so the player understands who does what
- [ ] Add tests:
  - each field role has at least one roster source
  - role tags persist through save/load
  - active party validation enforces cap and uniqueness rules

### Done means
- companions become build pieces, not clutter
- expedition planning can ask “who should come with me and why?”

---

## Phase FCS-4 — Tower Roles & Assignment System

### Goals
- Make companions useful when not in the active party
- Connect the roster to the tower-domain fantasy
- Support defense and domain growth without RTS micromanagement

### Tasks
- [ ] Define tower roles:
  - Gate Guard
  - Floor Anchor
  - Reserve Response
  - Archive Sentinel
  - Workshop Defender
  - Menagerie Handler
  - Signal Watch
  - Recovery Support
- [ ] Add assignment model:
  - unassigned
  - active party
  - assigned to room/floor/role
  - recovering
- [ ] Add compatibility scoring/notes per role:
  - automata strong Gate Guard
  - wisps strong Signal Watch
  - beasts strong chokepoint/floor anchor
  - scholars/support units strong Archive or Recovery roles
- [ ] Add assignment UI stub requirements:
  - quick assign
  - role filter
  - room/floor view
- [ ] Add tower-state dependencies so some roles only unlock after reclaiming certain floors
- [ ] Add tests:
  - role assignment legality
  - incompatible assignment rejection
  - role state persistence across save/load

### Done means
- tower companions matter even when not traveling with the player
- assignments become a visible expression of domain management

---

## Phase FCS-5 — Morale, Wounds & Recovery

### Goals
- Give companion management stakes without making it punitive
- Preserve identity and continuity
- Support post-defense and post-expedition consequences

### Tasks
- [ ] Define recovery states:
  - healthy
  - wounded
  - exhausted
  - shaken
  - corrupted (for restricted/late systems only)
- [ ] Define morale states:
  - loyal
  - steady
  - uncertain
  - demoralized
- [ ] Define what can affect morale/recovery:
  - repeated defeat
  - successful defenses
  - lack of rest
  - tower room loss
  - specific quest outcomes
  - special formulas / tonics
- [ ] Add recovery paths:
  - time/rest
  - recovery support assignment
  - crafted formulas
  - story intervention in some cases
- [ ] Decide whether death exists for all companion classes or only some
- [ ] Add tests:
  - wound transitions legal
  - morale does not silently desync
  - recovery items and rest resolve state properly

### Done means
- companions feel persistent and worth caring about
- defense outcomes can matter without destroying the campaign

---

## Phase FCS-6 — Quest, Species & System Integration

### Goals
- Ensure companions are deeply woven into story and other systems
- Align species arcs with preferred companion fantasies
- Avoid the follower system becoming detached from content

### Tasks
- [ ] Update quest reward planning to bias rewards toward:
  - followers
  - signature companions
  - companion capacity expansions
  - new role unlocks
- [ ] Define species/system emphases:
  - Human → command, morale, retainers
  - Undead → spectral or memory-linked allies
  - Vulperia → opportunistic scouts / precision allies
  - Slime → adaptive companions / chokepoint resilience
  - Elf → legacy-linked signature followers
  - Celestial → forecast/signal specialists
  - Draconic → territorial, fear, and heavy-presence allies
- [ ] Add hooks for alchemy support:
  - taming aids
  - rally brews
  - recovery tonics
  - anti-corruption cleanses
- [ ] Add hooks for tome/research support:
  - doctrine manuals affecting assignments
  - archive texts unlocking special role behaviors
- [ ] Add content audits ensuring each species arc touches the companion system in a meaningful way

### Done means
- companions reinforce species fantasy and tower identity
- companion progress is not just a generic subsystem

---

## Phase FCS-7 — Verification

### Unit
- [ ] taxonomy/state tests
- [ ] acquisition tests
- [ ] active party cap tests
- [ ] tower assignment legality tests
- [ ] morale/wound transition tests
- [ ] save/load tests for full roster state

### E2E
- [ ] recruit an enemy → confirm roster entry appears
- [ ] earn a quest follower → assign to tower role
- [ ] move follower from tower role to active party and back
- [ ] recover a wounded follower using rest or formula support
- [ ] verify role-filtered UI summaries show accurate statuses

### Bot / content audits
- [ ] audit all recruitable enemies map to a legal role set
- [ ] audit all follower quest rewards reference valid companion definitions
- [ ] audit signature companions are unique and not generated as generic duplicates

---

## Dependencies
- `TODO/05-content/quests.md`
- `TODO/05-content/story-arcs.md`
- `TODO/04-characters/enemy-system.md`
- `TODO/04-characters/new-species-expansion.md`
- future `tower-defense-domain-events.md`
- `TODO/06-game-systems/alchemy-transmutation-crafting.md`

## Related design docs
- `story_quests_mechanics/06-towers-companions-and-defense-events.md`
- `story_quests_mechanics/07-story-and-quest-integration.md`
- `story_quests_mechanics/05-dungeon-loot-and-resource-ecology.md`

## Success Criteria
The system is successful when a player can:
- understand the difference between familiars, followers, and monster recruits
- build a party for expeditions intentionally
- assign non-active companions meaningful tower roles
- feel real consequence when companions are wounded or thrive
- clearly feel that **Companions** are a primary gameplay pillar rather than quest garnish