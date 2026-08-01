# Quests (Phase C)
> 5 species-specific quests × 4 species + 5 general quests = 25 total, now expanding into tower-return beats, transmutation solutions, follower rewards, and defense-prep escalations. All written, none implemented in-game yet.

## Status: 🔲 Architecture done, all 25 quests designed but not placed/triggered in-game; reward-schema work must land before non-gold/xp quest rewards can be safely authored, and tower-return / transmutation / follower strategy integration remains newly planned

## ✅ Done
- Quest architecture: all beat types implemented (read_lore, talk_to_npc, defeat_elite, reach_location, craft_item)
- `QuestJournal.ts` — species tab + world quests tab
- All quest designs written (see `DEMO_RELEASE_TODO.md` Phase C2-C6)
- Quest-giver NPC archetypes: quest_giver, settlement_elder, mysterious

## 🔲 Remaining (implementation)

### Quest Triggers Placement
- [ ] Human H1: Place ruined garrison at correct overworld position
- [ ] Human H2: Place blacksmith NPC in settlement with extortion trigger
- [ ] Human H3: Place archive lore book + Baron outpost trigger
- [ ] Human H4: Place binding circle interaction on Floor 0 + 3 reagent nodes
- [ ] Human H5: Place wandering knight NPC + 3 claimant camps
- [ ] (Repeat for Undead U1-U5, Vulperia V1-V5, Slime S1-S5)
- [ ] General G1-G5: familiar wandering, settlement requests, greenhouse, Baron letters

### Reward Implementation

#### Prerequisite: Reward Schema
- [ ] Extend `src/world/QuestDef.ts` so `QuestReward` stops being only `{ gold: number; xp: number }` and becomes a discriminated union before 05-content starts referencing non-gold/xp rewards in authored quest defs.
- [ ] Cover all authored reward families already named in this file: `item`, `spell_unlock`, `passive_bonus`, `follower`, `zone_unlock`, `decoration`, `book`, `research`, `defense`, and `tower_state`.
- [ ] Keep **schema definition** separate from **reward delivery**: content can only safely reference typed reward payloads after the union exists, while grant logic stays blocked on the owning runtime/system work below.

| Reward family | Schema must exist first | Delivery blocker after schema exists |
| --- | --- | --- |
| `item` | `QuestReward` union arm + stable item/recipe/material payload shape | Item granting is blocked on the concrete item contract; transmutation-specific items also depend on `TODO/06-game-systems/alchemy-transmutation-crafting.md` Phase 0/later runtime |
| `spell_unlock` | `QuestReward` union arm + spell ID payload | Final delivery still has to wire reward IDs into `AbilitySystem` |
| `passive_bonus` | `QuestReward` union arm + modifier payload | Final delivery still has to map reward payloads onto persistent player modifiers |
| `follower` | `QuestReward` union arm + companion/follower payload | `TODO/06-game-systems/follower-companion-system.md` must define `CompanionDef`/roster schemas and later runtime grant flow |
| `zone_unlock` | `QuestReward` union arm + zone/flag payload | Final delivery still has to persist unlock flags in world state |
| `decoration` | `QuestReward` union arm + tower-decoration payload | Final delivery still has to place/persist tower-room state |
| `book` | `QuestReward` union arm + book/archive/manual payload | `TODO/06-game-systems/tomes-research-spellcraft.md` must define `BookDef`/`KnowledgeDef` before authored book rewards are safe |
| `research` | `QuestReward` union arm + research-project payload | `TODO/06-game-systems/tomes-research-spellcraft.md` must define `ResearchProjectDef` before authored research rewards are safe |
| `defense` | `QuestReward` union arm + doctrine/forecast/privilege payload | `TODO/06-game-systems/tower-defense-domain-events.md` must define doctrine/event/forecast schemas before authored defense rewards are safe |
| `tower_state` | `QuestReward` union arm + room/banner/facility-state payload | Final delivery depends on the relevant owning system; defense/tower-pressure variants specifically need `tower-defense-domain-events.md` Phase 0 first |

- [ ] Reward schema pass in `src/world/QuestDef.ts`: add the discriminated union and lock payload shapes before any of the reward bullets below move forward.
- [ ] Item rewards: procedural weapon skins via `BuildingDNA` extension
- [ ] Spell unlock rewards: wire to `AbilitySystem`
- [ ] Passive bonus rewards: via `mods` object in PlayerController
- [ ] Follower rewards: wire to `06-game-systems/follower-companion-system.md` after its Phase 0 schema exists
- [ ] Zone unlock rewards: add flag to `WorldOverrides`
- [ ] Decoration rewards: placed prop in tower rooms
- [ ] Book rewards: direct tome/manual/archive unlocks for key quest completions after `tomes-research-spellcraft.md` Phase 0
- [ ] Research rewards: unlock theory branches, facility processes, or doctrine manuals after `tomes-research-spellcraft.md` Phase 0
- [ ] Defense rewards: doctrine unlocks, forecast bonuses, or assigned companion privileges after `tower-defense-domain-events.md` Phase 0
- [ ] Tower-state rewards: visible room changes, banners, greenhouse upgrades, archive recovery once their owning room/tower-state schemas exist

### Tower-Return Quest Beats (new integration layer)
- [ ] Add quest steps that require returning to the tower to:
  - read/interpet newly found texts
  - analyze recovered materials
  - craft a required reagent or stabilizer
  - assign a follower to a room/task
  - prepare a defense response before the next outbound step
- [ ] Mark which existing quests gain tower-return beats first:
  - Human H4 (binding circle reagent craft)
  - Undead U3/U4 (archive interpretation, suppression choice)
  - Slime S2/S4 (stabiliser craft, dissolution theory)
  - General G3 (greenhouse restoration)
  - General G5 / Ninth Tower follow-ups (observatory interpretation)
- [ ] Add quest journal copy/state for “return to tower” objectives so the loop is explicit

### Transmutation-Solution Quests
- [ ] Tag quests that can be solved through crafted outputs:
  - disruption reagent
  - ritual solvent
  - stabilisation tonic
  - anti-corruption formula
  - defense-prep consumables for siege/story beats
- [ ] Add at least one species quest per original species that requires a tower-side transmutation step
- [ ] Add at least one general quest that permanently upgrades transmutation capacity or reagent income

### Follower & Companion Rewards (moved to dedicated systems plan)
- [ ] Integrate quest rewards with `06-game-systems/follower-companion-system.md`
- [ ] Convert follower rewards from “extra body” into strategic unlocks:
  - field role unlock
  - tower role unlock
  - unique signature companion
  - roster cap increase
  - morale/support utility unlock
- [ ] Revisit current follower reward beats and classify them by companion taxonomy:
  - familiar
  - follower ally
  - recruited monster
  - elite/signature companion

### Defense-Prep & Domain Escalation Beats
- [ ] Add quest beats that explicitly prepare or trigger tower/domain events:
  - `prepare_defense`
  - `assign_followers`
  - `restore_facility`
  - `stabilize_anomaly`
- [ ] Identify which questlines should escalate into defense pressure:
  - Human legitimacy / claimant outcomes
  - Undead archive / memory breaches
  - Slime instability / dissolution theory
  - Celestial signal restoration
  - Draconic territorial assertion
- [ ] Add at least one general-quest defense prep reward path (manual, doctrine, or consumable unlock)

> Full quest designs: `DEMO_RELEASE_TODO.md` Phase C2-C6
> Companion runtime details now tracked in `06-game-systems/follower-companion-system.md`
