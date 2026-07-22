# Quests (Phase C)
> 5 species-specific quests × 4 species + 5 general quests = 25 total. All written, none implemented in-game yet.

## Status: 🔲 Architecture done, all 25 quests designed but not placed/triggered in-game

## ✅ Done
- Quest architecture: all beat types implemented (read_lore, talk_to_npc, defeat_elite, reach_location, craft_item)
- `QuestReward` type with all fields
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
- [ ] Item rewards: procedural weapon skins via `BuildingDNA` extension
- [ ] Spell unlock rewards: wire to `AbilitySystem`
- [ ] Passive bonus rewards: via `mods` object in PlayerController
- [ ] Follower rewards: `FollowerSystem.ts` (new — 🔲)
- [ ] Zone unlock rewards: add flag to `WorldOverrides`
- [ ] Decoration rewards: placed prop in tower rooms

### FollowerSystem (new — not planned anywhere)
- [ ] `FollowerSystem.ts` — manages active followers, max capacity
- [ ] Follower behaviours: combat (melee/ranged), passive (buff aura), map (reveal)
- [ ] Max 1 follower (village), 2 (town quest), 3 (H5 reward)
- [ ] Save/load follower state

> Full quest designs: `DEMO_RELEASE_TODO.md` Phase C2-C6
