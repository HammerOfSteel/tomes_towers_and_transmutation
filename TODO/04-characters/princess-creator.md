# Princess Creator Integration (Phase PC)
> Full detail in `DEMO_RELEASE_TODO.md` Phase PC + PC-continued. Summary here.

## Status: 🚧 Mostly done, integration pieces remaining

## ✅ Done
- Default DNA for 4 species (human/undead/foxling/slime) in `PrincessDefaults.ts`
- `PrincessLibraryPanel.ts` — 3-column grid, play/edit/delete, seeded from defaults
- `customPrincess` toggle on new-game card
- `PlayerController.applyPrincess(dna)` — attaches rig to player
- `applyCharacterAbilities()` routes via princess species
- 16 unit tests + 182 existing tests passing

## 🔲 Remaining
- [ ] `customPrincess` toggle: persist to `localStorage` key `ttt_custom_princess_mode`
- [ ] Princess atelier → Dev Labs link (opens `princess-creator.html`)
- [ ] `window.__game.buildPrincess(dna)` exposed for bot access
- [ ] `tests/princess-creator/integration.test.ts` — height + non-empty clips per species

## PC + New Species (NS)
- [ ] Default DNA for 6 new subspecies added to `PrincessDefaults.ts`
- [ ] All 21 princess species confirm map to valid game species via `PRINCESS_SPECIES_MAP`
- [ ] Creative mode: show all 21 species grouped by game species

> Full task list: `DEMO_RELEASE_TODO.md` Phase PC + Phase NS3/NS8
