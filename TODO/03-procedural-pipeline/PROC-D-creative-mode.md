# PROC-D — Creative Mode Integration
> Expose all procedural builders in the DevLab sandbox. Custom blueprints override world gen defaults.

## Status: 🔲 Not started (Creative mode + DevLab exist separately)

## Tasks

### CD-1 — DevLab Route (/sandbox)
- [ ] Unified tool: map editor + DNA creator + spawner + asset browser + cheats
- [ ] Tabs: 🗺 World | 👤 Characters | 🏠 Buildings | 👾 Enemies | 🎭 Creatures | 📚 Library

### CD-2 — In-Game Creative Mode
- [ ] Settings → Enable Creative Mode
- [ ] Shows creative toolbar in main game
- [ ] Spawn any entity at cursor position (places from registry)
- [ ] Pick entity → shows its DNA in sidebar panel
- [ ] Edit DNA live → entity updates in real time

### CD-3 — Custom Blueprint Overrides
- [ ] Library entries with `isCustom = true` override world gen for named locations
- [ ] Example: "The inn in Pineholm" → always uses `custom_inn_mirabel` blueprint
- [ ] Override stored in `WorldOverrides.json` per world seed

### CD-4 — Skin Picker (already partially done)
- [x] Creative mode skin picker: princess gallery entries as "👸 Custom" tab
- [ ] All 21 princess species visible grouped by game species
- [ ] NPC skin picker: apply any NPC DNA to player for testing

## Dependencies
- Requires: PROC-B all builders
- Requires: Asset Library (`asset-library.md`)
- References: `CREATIVE_MODE_TODO.md` for full detail
