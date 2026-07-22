# OW-E — Layer Navigation + WorldGen Integration
> Click-through navigation between studio layers. Click settlement on realm map → load city view. Click dungeon entrance → load dungeon view.

## Status: 🔲 Not started

## Tasks

### OW-E1 — Tab Strip Navigation
- [ ] Breadcrumb bar at top of studio: `🌍 Realm > 🏙 Pineholm > ⚔ Dungeon`
- [ ] Back button at each level clears current view and returns to parent
- [ ] State stack: `viewStack: Array<{mode, seed, label}>` — push on drill-down, pop on back

### OW-E2 — Realm → City Drill-Down
- [ ] Click settlement dot on realm 2D map → switch to Settlement tab, load that settlement's seed
- [ ] Settlement seed = `hash(realmSeed, settlementIndex)` — deterministic
- [ ] City view shows the generated settlement for that location

### OW-E3 — City → Dwelling Drill-Down
- [ ] Click a building in the city view → load Dwelling tab with that building's blueprint
- [ ] Building seed = `hash(settlementSeed, buildingIndex)`

### OW-E4 — Realm → Dungeon Drill-Down
- [ ] Click dungeon entrance marker on realm map → switch to Dungeon tab, load that dungeon
- [ ] Dungeon seed derived from realm position

### OW-E5 — 3D Planet → Realm Surface
- [ ] "View Surface Map" button on Planet/Hex view → switch to 🗺 Map view for same realm data
- [ ] Smooth transition: flash effect, not instant

### OW-E6 — OverworldScene Integration (future)
- [ ] `OverworldScene.ts` reads `SettlementModel` JSON → places 3D buildings at ward centres via `BuildingDNA`
- [ ] Faction drives 3D building style

## Dependencies
- Requires: OW-A/B/C/D all done
- Requires: breadcrumb component (new UI)
