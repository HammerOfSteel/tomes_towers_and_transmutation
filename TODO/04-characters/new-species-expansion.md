# New Species Expansion (Phase NS)
> 3 new Tier-1 species: Elf, Celestial, Draconic. All 21 princess-creator species mapped.

## Status: 🚧 Story/dialogue done, talent tree nodes + lore books remaining

## ✅ Done
- `SpeciesId` expanded: elf/celestial/draconic added
- All 21 species mapped to 7 game species via `PRINCESS_SPECIES_MAP`
- Full story arcs (4 acts each) written for Elf/Celestial/Draconic
- Abilities implemented: Recall, Arcane Library, Starburst, Moonveil, Breath, Harden
- `CharacterDecisionTree.ts` extended with 6 new subspecies
- 6 new boon types added + applied in `main.ts`
- Campfire intro dialogue for all 3 new species
- Solmor Stage 1/2 variants for Elf/Celestial/Draconic

## 🔲 Remaining

### Talent Trees
- [ ] Elf nodes added to `TalentSystem.ts` (Memory/Grace/Sage paths, 6 nodes)
- [ ] Celestial nodes (Dawn/Dusk/Void paths, 6 nodes)
- [ ] Draconic nodes (Fire/Scale/Void paths, 6 nodes)
- [ ] Talent tree screen shows species-specific paths (D2-D5 data → UI)

### Solmor Stage 3
- [ ] Stage 3 choice options for Elf / Celestial / Draconic
- [ ] Species-specific "what do you want to do with what you are?" answers

### Lore Books
- [ ] Elf lore book placed Floor 1 (Library) — annotated spellbook from 300 yrs ago
- [ ] Celestial lore book placed Floor 7 (Botanical Lab) — Celestial Binding Efficacy paper
- [ ] Draconic lore book placed Floor 9 (Observatory) — star chart with territorial claims

### Tests
- [ ] Extend `storyRunner.test.ts` for Elf/Celestial/Draconic lines
- [ ] Extend `abilitySystem.test.ts` for 3 new species
- [ ] `speciesMapping.test.ts` — all 21 species map cleanly

> Full task list: `DEMO_RELEASE_TODO.md` Phase NS
