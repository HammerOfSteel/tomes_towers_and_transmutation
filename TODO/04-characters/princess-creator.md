# Princess Creator Integration (Phase PC)
> Full detail in `DEMO_RELEASE_TODO.md` Phase PC + PC-continued. Summary here.

## Status: 🚧 Mostly done, integration pieces remaining; `customPrincess` new-game toggle was previously miscategorized as done but is not implemented in code

## ✅ Done
- Default DNA for 4 species (human/undead/foxling/slime) in `PrincessDefaults.ts`
- `PrincessLibraryPanel.ts` — 3-column grid, play/edit/delete, seeded from defaults
- `PlayerController.applyPrincess(dna)` — attaches rig to player
- `applyCharacterAbilities()` routes via princess species
- 16 unit tests + 182 existing tests passing

## 🔲 Remaining
- [ ] PC-7 — `customPrincess` mode toggle on the new-game card: add the missing UI/control, persist to `localStorage` key `ttt_custom_princess_mode`, survive restart, and gate advanced features correctly
  - Note: this was previously listed as done in this file, but code audit/grep found no implementation
- [ ] Princess atelier → Dev Labs link (opens `princess-creator.html`)
- [ ] `window.__game.buildPrincess(dna)` exposed for bot access
- [ ] `tests/princess-creator/integration.test.ts` — height + non-empty clips per species

## PC + New Species (NS)
- [ ] Default DNA for 6 new subspecies added to `PrincessDefaults.ts`
- [ ] All 21 princess species confirm map to valid game species via `PRINCESS_SPECIES_MAP`
- [ ] Creative mode: show all 21 species grouped by game species

> Full task list: `DEMO_RELEASE_TODO.md` Phase PC + Phase NS3/NS8
