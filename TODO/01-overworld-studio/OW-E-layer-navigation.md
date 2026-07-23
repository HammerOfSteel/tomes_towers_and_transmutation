# OW-E — Layer Navigation + WorldGen Integration
> Click-through navigation between studio layers. Click settlement on realm map → load city view. Click dungeon entrance → load dungeon view.

## Status: ✅ Shipped

## Tasks

### OW-E1 — Tab Strip Navigation
- [x] Breadcrumb bar at top of studio: `🌍 Realm > 🏙 Pineholm > ⚔ Dungeon`
- [x] Back button at each level clears current view and returns to parent
- [x] State stack: `_navStack: Array<{mode, seed, label}>` — push on drill-down, pop on back

### OW-E2 — Realm → City Drill-Down
- [x] Click settlement dot on realm 2D map → switch to Settlement tab, load that settlement's seed
- [x] Settlement seed = `(realmSeed ^ (x*73856093 + y*19349663)) >>> 0` — deterministic
- [x] City view shows the generated settlement for that location + faction carried over

### OW-E3 — City → Dwelling Drill-Down
- [x] Double-click a ward in city view → opens building floor plan modal
- [x] 🎮 Play in 3D button opens `building-viewer.html` with that building's blueprint

### OW-E4 — Realm → Dungeon Drill-Down
- [x] Click dungeon entrance marker (purple ⚔ dot) on realm map → switch to Dungeon tab
- [x] Dungeon seed derived from realm position: `(realmSeed ^ (x*48271 + y*16807)) >>> 0`
- [x] 3–6 dungeon entrances generated per realm, rendered as clickable markers

### OW-E5 — 3D Planet → Realm Surface
- [x] View pills (🗺 Map / 🌍 Planet / 🌐 Hex) wired to `realmViewMode` — switching to Map shows 2D realm
- [ ] Smooth transition flash effect — deferred

### OW-E6 — OverworldScene Integration (future)
- [ ] `OverworldScene.ts` reads `SettlementModel` JSON → places 3D buildings at ward centres via `BuildingDNA`
- [ ] Faction drives 3D building style

## Dependencies
- Requires: OW-A/B/C/D all done ✅

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
