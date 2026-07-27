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
- [x] Smooth transition flash effect between realm view switches / drill-down transitions

### OW-E6 — OverworldScene Integration
- [x] Studio export button: `🎮 Preview in Overworld 3D`
- [x] Studio writes `ttt_overworld_settlement_preview` payload to `localStorage`
- [x] `main.ts` consumes preview handoff, auto-starts, and jumps to exterior
- [x] `OverworldScene.ts` reads preview payload and places 3D buildings at ward centres
- [x] Faction drives 3D building style via runtime building DNA helpers
- [x] Focused Playwright coverage added for Studio → game popup preview flow

## Validation
- [x] `tests/e2e/overworld-studio-layer-navigation.spec.ts`
- [x] `tests/e2e/overworld-studio-overworld-preview.spec.ts`

## Dependencies
- Requires: OW-A/B/C/D all done ✅
