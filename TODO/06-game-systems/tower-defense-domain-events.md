# Tower Defense & Domain Events
> Companion-centered tower defense for *Tomes, Towers & Transmutation*. Covers forecast → preparation → assault → consequence flow, doctrine selection, tower assignments, floor-specific stakes, and story/system trigger sources. Depends on followers/companions, transmutation support items, and world threat hooks.

## Status: ⚠️ GAP — design defined in `story_quests_mechanics/06-towers-companions-and-defense-events.md`; Phase 0 schema unblocking is now defined, later runtime phases still need production implementation

## Goals
- Make the **Towers** pillar a real gameplay loop without drifting into RTS construction
- Center defense around:
  - companion assignments
  - doctrine choices
  - transmutation prep
  - reclaimed floor identity
  - story-driven pressure
- Ensure assaults feel like consequences of player growth and world tension
- Support partial failure and recovery without campaign collapse

## Scope
This file covers:
- defense event families
- forecast/prep/assault/consequence flow
- doctrine selection
- tower assignment hooks
- floor-specific stakes
- trigger sources and escalation
- persistence and testing expectations

This file does **not** cover:
- core follower roster logic → see `follower-companion-system.md`
- potion/material crafting → see `alchemy-transmutation-crafting.md`
- book/school progression → see `tomes-research-spellcraft.md`

---

## Phase 0 — Data Schema (content unblocker)

> Must ship before `TODO/05-content/quests.md` and `story-arcs.md` can safely reference defense escalation, doctrine unlocks, forecast bonuses, tower-pressure events, or tower-state aftermath. This is the schema-first step that unblocks content before any assault runtime exists.

### Goals
- Define the minimum event/doctrine/forecast contracts authored content can safely reference
- Give quests and story arcs stable IDs for tower pressure without implying a working defense runtime
- Separate naming/taxonomy work from later prep/assault/consequence implementation

### Tasks
- [ ] Define the minimal `TowerEventDef` / defense-event taxonomy:
  - `id`
  - `family`
  - `triggerSource`
  - `threatLevel`
  - `forecastLeadTime`
  - `targetScope` (room/floor/domain)
  - `counterTags[]`
- [ ] Define the minimal `DefenseDoctrineDef` shape for authored unlock rewards:
  - `id`
  - `name`
  - `focus`
  - `allowedTargetScopes[]`
  - `bonusSummary`
- [ ] Define the minimal `TowerForecastState` / escalation-state shape:
  - `eventId`
  - `state` (`dormant | brewing | forecasted | active | resolved | aftermath`)
  - `eta`
  - `confidence`
  - `targetRefs[]`
- [ ] Define the shared enums/ID namespaces content needs first:
  - event family IDs
  - trigger source IDs
  - doctrine IDs
  - forecast/escalation-state enum
  - tower target-scope IDs
- [ ] Document which 05-content references must wait on these schemas:
  - defense reward payloads
  - tower/domain escalation beats in story arcs
  - forecast/pressure notes attached to quests
  - tower-state aftermath references

### Done means
- 05-content can reference stable defense/doctrine/forecast IDs without inventing ad hoc event names
- later tower-defense phases can implement against one shared taxonomy

---

## Phase TDE-1 — Event Taxonomy & Trigger Model

> Needs Phase 0 first.

### Goals
- Define what kinds of assaults and crises can happen
- Make events understandable consequences rather than random interruptions
- Support authored and systemic triggers

### Tasks
- [ ] Define defense event families:
  - Beast Pressure
  - Construct Breach
  - Faction Raid
  - Arcane Instability
  - Candidate / Legacy Event
  - Siege Forecast Event
- [ ] Define trigger sources:
  - growth triggers
  - neglect triggers
  - quest triggers
  - experiment triggers
  - scheduled narrative triggers
- [ ] Add per-event metadata:
  - `family`
  - `threatLevel`
  - `forecastLeadTime`
  - `preferredTargets` (floors/rooms)
  - `counterTags`
  - `storyHooks`
- [ ] Define escalation state model:
  - dormant
  - brewing
  - forecasted
  - active
  - resolved
  - aftermath
- [ ] Add validation tests:
  - every event family has legal trigger sources
  - forecast-only events cannot skip directly to aftermath
  - target floors/rooms reference legal tower spaces

### Done means
- the game can represent tower events as structured content
- future content and runtime systems share one event vocabulary

---

## Phase TDE-2 — Forecast & Warning Layer

### Goals
- Let the player anticipate danger
- Make planning a form of skill
- Connect observatory, familiars, rumors, and recovered intel to real outcomes

### Tasks
- [ ] Define warning sources:
  - familiar alerts
  - observatory omens
  - settlement rumors
  - archive notices
  - site-derived defense intel
- [ ] Add forecast data:
  - time until event
  - likely attacker family
  - likely target floor/room
  - uncertainty / confidence level
- [ ] Add event board / warning UI requirements in tower hub
- [ ] Support “respond in the field first” opportunities for some forecasted events
- [ ] Define how books/manuals can improve warning quality
- [ ] Add tests:
  - forecast sources generate legal event previews
  - confidence improves when relevant intel exists
  - warning state persists across save/load

### Done means
- players can prepare rather than being ambushed by arbitrary mode switches
- observatory and familiar systems gain strategic meaning

---

## Phase TDE-3 — Preparation Layer

### Goals
- Give the player meaningful pre-defense choices without heavy micromanagement
- Make reclaimed tower spaces, formulas, companions, and spell loadouts matter
- Keep preparation lightweight but high-impact

### Tasks
- [ ] Define doctrine selection system with starter doctrines:
  - Hold the Gate
  - Protect the Archive
  - Layered Response
  - Hunter’s Net
  - Ground the Storm
  - Royal Muster
- [ ] Define how doctrines modify:
  - room/floor bonuses
  - morale
  - target priorities
  - reserve behavior
  - resistances or counters
- [ ] Define prep inputs:
  - companion assignments
  - defense consumables
  - active spell loadout
  - temporary floor focus
- [ ] Add “limited readiness budget” or similar guardrail if needed
- [ ] Support defense-prep consumables from transmutation:
  - anti-swarm smoke
  - construct disruption salts
  - corridor resin
  - ward refresh phials
  - rally draughts
- [ ] Add tests:
  - doctrine selection legality
  - prep state composition
  - required dependencies surface correctly in UI state

### Done means
- defense prep becomes a meaningful domain loop
- the player’s build affects the tower before combat starts

---

## Phase TDE-4 — Assault Runtime Structure

### Goals
- Define how defense events play in moment-to-moment gameplay
- Keep them action-RPG-first
- Let the tower and its inhabitants feel involved

### Tasks
- [ ] Define supported assault runtime patterns:
  - direct foyer hold
  - multi-room response
  - defend key room / station
  - kill elite while followers hold line
  - contain anomaly while surviving adds
- [ ] Add event-stage model:
  - entry breach
  - pressure escalation
  - special objective
  - resolution
- [ ] Define how assigned companions participate:
  - hold position
  - reserve response
  - protect room target
  - support player in active space
- [ ] Define how spell mutations can matter in defense:
  - beacon mark effects
  - sanctuary/anchor zone effects
  - anti-swarm/anti-construct tags
- [ ] Add tests for:
  - legal stage transitions
  - event completion/failure states
  - assignment participation hooks firing as expected

### Done means
- tower defense exists as a real-time RPG sequence, not a detached minigame
- companions and doctrine visibly matter during resolution

---

## Phase TDE-5 — Floor Stakes & Consequence Model

### Goals
- Make room/floor choice and protection emotionally meaningful
- Ensure partial failure changes the campaign without ending it
- Let the tower feel vulnerable in specific, thematic ways

### Tasks
- [ ] Define key tower spaces with event relevance:
  - Grand Foyer / Entry
  - Library / Archive
  - Alchemical Workshop / Brewing Chamber
  - Living Quarters / Royal Space
  - Menagerie / Followers’ Den
  - Observatory / High Arcane Chamber
- [ ] Define consequence types:
  - room damage
  - temporary station lockout
  - lost/spoiled materials
  - wounded followers
  - morale shifts
  - threat escalation
  - symbolic/story presentation changes
- [ ] Define success bonuses:
  - morale gain
  - legitimacy gain
  - new books/manuals
  - captured elite recruits
  - reduced regional pressure
- [ ] Add recovery rules:
  - repair/stabilize room
  - clear corruption
  - restore production
  - heal/recover assigned followers
- [ ] Add tests:
  - floor-targeted outcomes map correctly
  - partial failure persists and recovers legally
  - no single event can catastrophically soft-lock the campaign

### Done means
- the tower feels like a lived space with stakes
- failures create new goals instead of dead ends

---

## Phase TDE-6 — Story & Arc Integration

### Goals
- Ensure defense events are narrative escalators, not detached content
- Connect species arcs, prior candidates, and Solmor’s infrastructure to domain pressure
- Make player growth provoke believable backlash

### Tasks
- [ ] Add species arc event hooks, for example:
  - Human → banner / rulership retaliation
  - Undead → memory archive breach
  - Vulperia → faction contract raid
  - Slime → unstable dissolution incident
  - Elf → legacy archive disturbance
  - Celestial → signal-trace assault
  - Draconic → territorial challenge event
- [ ] Add prior-candidate / legacy event planning hooks
- [ ] Add Solmor-stage integration points for mid/late story pressure
- [ ] Add authored trigger support from quests and lore-book discoveries
- [ ] Ensure some events reward:
  - books/manuals
  - doctrine unlocks
  - signature companions
  - room-state changes
- [ ] Add content audits ensuring major arcs reference tower/domain stakes meaningfully

### Done means
- defense is visibly part of the story spine
- the tower becomes the clearest proof of the princess’s growing importance

---

## Phase TDE-7 — Verification

### Unit
- [ ] event taxonomy/trigger tests
- [ ] forecast state tests
- [ ] doctrine/prep legality tests
- [ ] assault stage transition tests
- [ ] floor consequence tests
- [ ] save/load tests for event and aftermath state

### E2E
- [ ] forecast appears → player prepares doctrine/assignments → event resolves
- [ ] failed defense damages a floor function → recovery path clears it
- [ ] defense consumable crafted beforehand becomes available in prep flow
- [ ] assigned companions visibly affect outcome of targeted defense room

### Bot / content audits
- [ ] audit each event family has at least one valid trigger source
- [ ] audit each key floor has at least one possible defense stake
- [ ] audit all doctrine IDs referenced by content are defined

---

## Dependencies
- `TODO/06-game-systems/follower-companion-system.md`
- `TODO/06-game-systems/alchemy-transmutation-crafting.md`
- `TODO/06-game-systems/tomes-research-spellcraft.md`
- `TODO/05-content/story-arcs.md`
- `TODO/05-content/quests.md`
- `TODO/02-game-world-integration/dungeon-integration.md`
- `TODO/03-procedural-pipeline/PROC-C-world-generation.md`

## Related design docs
- `story_quests_mechanics/06-towers-companions-and-defense-events.md`
- `story_quests_mechanics/07-story-and-quest-integration.md`
- `story_quests_mechanics/08-implementation-roadmap-mapping.md`

## Success Criteria
The system is successful when a player can:
- see why an assault is happening
- prepare the tower through doctrine, assignments, and formulas
- feel companions and reclaimed rooms matter during defense
- survive failure without campaign collapse but with meaningful consequences
- clearly feel that **Towers** is a primary gameplay pillar rather than a backdrop