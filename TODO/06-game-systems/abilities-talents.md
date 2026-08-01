# Abilities & Talent Trees (Phase D)
> Full ability sets for all 7 species + complete talent trees. Architecture done, most ability implementations and tree UI remaining.

## Status: 🚧 Architecture + alpha abilities done, full sets + talent UI remaining

## ✅ Done
- `AbilitySystem.ts`: cast pipeline, CD, mana, 4 slots
- Alpha abilities (2 per species × 7 = 14 abilities) with geometry VFX
- Species passives stubs
- HUD ability bar (Q/R/Z/X glyphs, CD arcs, mana bar)
- `TalentSystem.ts` with species-gated signature nodes

## 🔲 Remaining

### Full Ability Sets (3rd + 4th abilities per species)
- [ ] Human: Fortify (warrior), Ley Tap (mage), Eagle Eye (ranger), Command (noble)
- [ ] Undead: Curse of Frailty, Soul Harvest, Bat Form, Blood Frenzy + Bone Rattle, Reassemble
- [ ] Vulperia: Eviscerate, Vanish + Scatter Shot, Trap, Hunter's Mark + Illusion Clone, Fox Fire
- [ ] Slime: Engulf, Split + Slick Floor, Corrosive Aura + Crystal Shard, Prismatic Burst + Mimic
- [ ] Elf: Arcane Library, Memory Palace + Graceful Step, Slip Away + Time Worn, Elder's Patience
- [ ] Celestial: Solar Flare, Light Beam + Eclipse, Gravity Well + Stellar Jump, Void Touch
- [ ] Draconic: Ignite, Dragon Rage + Harden, Tail Sweep, Roar + Acid Scale, Corrode

### Talent Tree Screen (UI)
- [ ] Talent tree screen shows species-specific paths (D2-D5 + NS2 data wired to UI)
- [ ] 3 path layout per species, node unlock animation
- [ ] Point spend → HUD stat update
- [ ] Playwright: open tree, spend 3 points, verify passive bonuses

### New Species Talent Nodes
- [ ] Elf: Memory/Grace/Sage paths (6 nodes) added to `TalentSystem.ts`
- [ ] Celestial: Dawn/Dusk/Void paths (6 nodes)
- [ ] Draconic: Fire/Scale/Void paths (6 nodes)

### Melee Weapon
- [ ] Species default weapon from `charManifest` (currently placeholder)

> Full ability designs: `DEMO_RELEASE_TODO.md` Phase D2-D5
