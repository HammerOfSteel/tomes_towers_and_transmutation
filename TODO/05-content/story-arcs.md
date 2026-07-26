# Story Arcs (Phase E1)
> Act I arcs for all 4 original species + 3 new species, now expanding toward tower-domain escalation, species/system identity, and defense-event consequences across later acts. Beats implemented, placement/trigger wiring remaining.

## Status: 🚧 Dialogue written, in-game wiring 80% done; domain-pressure and defense-escalation integration newly planned

## ✅ Done
- All 4 Act I arc dialogues + beat content written
- `read_lore`, `talk_to_npc`, `defeat_elite`, `reach_location` beat types
- 4 lore books placed in dungeon rooms (floors 3/4/5/7)
- 2 NPC encounter triggers in overworld (bounty hunter, wandering scholar)

## 🔲 Remaining

### Wiring Gaps
- [ ] Human arc: bounty-hunter-gone-rogue elite enemy placed + tagged with `enemyId`
- [ ] Slime arc: `interact_key` beat type for secret door (Floor 3)
- [ ] `survive_wave` beat type missing — needed for Undead + Slime arcs
- [ ] Act I completion → Solmor Stage 2 advance working for all 4 species

### New Species Act I (NS)
- [ ] Elf arc lore book placed Floor 1 (annotated spellbook)
- [ ] Celestial arc ward stone placed Floor 7 + defeat trigger
- [ ] Draconic arc lore book placed Floor 4 (territorial treatise)

### Act II-IV (future — post-demo)
- [ ] Acts II-IV written but not implemented for any species
- [ ] Blocked on: overworld zone access (Baron's Keep, ruin dungeons)

### Species/System Emphasis Pass (new integration layer)
- [ ] Add per-species system emphasis notes so each arc pushes a distinct play fantasy:
  - Human → rulership, command, morale, banner legitimacy
  - Undead → memory, suppression vs empowerment, archive breaches
  - Vulperia → leverage, stealth, political evidence, opportunistic allies
  - Slime → transmutation, instability, adaptation, menagerie synergy
  - Elf → recursion, prior-candidate traces, deep archive identity
  - Celestial → signal, omens, observatory intelligence, forecast play
  - Draconic → claim, territory, intimidation, high-pressure retaliation
- [ ] Ensure each species arc touches at least one of:
  - tome family
  - research branch
  - companion/recruit identity
  - tower-domain consequence
  - defense-event escalation

### Defense Events as Arc Escalators
- [ ] Plan where story arcs should provoke tower/domain events rather than only overworld follow-ups:
  - Human → claimant / legitimacy retaliation
  - Undead → memory archive breach
  - Vulperia → contract raid / targeted infiltration
  - Slime → dissolution or instability spillover
  - Elf → legacy/candidate disturbance
  - Celestial → signal-trace assault
  - Draconic → territorial challenge / siege
- [ ] Add authored trigger notes for which act milestones should:
  - forecast a defense
  - force tower preparation
  - alter tower room presentation after the event
- [ ] Add at least one mid-arc “return to tower before continuing” escalation per species family

### Prior-Candidate & Tower-State Integration
- [ ] Add prior-candidate hook notes to later acts where appropriate
- [ ] Add tower-state consequences per major arc milestone:
  - banners / rulership symbols
  - recovered journals or archives
  - room styling tied to doctrine/species
  - visible ward damage / recovery after failed defense
  - new companion presence in relevant rooms
- [ ] Ensure Solmor-stage progression can reference these visible changes

> Full arc content: `DEMO_RELEASE_TODO.md` Phase E1
> Story/mechanics bridge defined in `story_quests_mechanics/07-story-and-quest-integration.md`
