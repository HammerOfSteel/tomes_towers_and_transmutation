# OW-F4 — Full Drill-Down Chain
> Complete the chain: ☀ Solar System → 🌍 Planet → 🗺 Realm → 🏙 City → ⚔ Dungeon

## Status: ✅ Shipped (F4-1 to F4-5 done; F4-6 deferred)
## Depends on: OW-E (layer navigation), OW-F2/F3 (planet DNA + solar system)

## Chain Map
```
☀ Solar System
  └── click planet → 🌍 Planet view (load that planet's DNA) ✅
       └── 🗺 Map pill → Realm Map ✅
            ├── click settlement → 🏙 Settlement view ✅
            │    └── double-click building → 🏠 Dwelling (OW-D) ✅
            ├── click dungeon icon → ⚔ Dungeon view ✅
            └── click cave icon → 🌿 Cave view (deferred)
```

## Tasks

### F4-1 — Breadcrumb State Machine ✅
- [x] `_navStack` array: push/pop views with metadata (seed, label, mode)
- [x] Breadcrumb bar rendered above canvas
- [x] Each breadcrumb item clickable → restores that view with original seed

### F4-2 — Solar System → Planet ✅
- [x] Click planet in solar view → set `currentPlanetType` + derive planet seed
- [x] Switch to Realm tab, set planet type pill, shape/climate/roughness/settlements from planet type
- [x] Tower planet always generates terran realm
- [x] Gas giants skipped (no surface)

### F4-3 — Planet → Realm Surface ✅
- [x] View pills (🗺 Map / 🌍 Planet / 🌐 Hex) wired to `realmViewMode`
- [x] Switching to Map pill shows 2D realm surface

### F4-4 — Realm → Settlement ✅
- [x] Settlement dots on 2D realm map are clickable (cursor changes on hover)
- [x] Click → switch to Settlement tab, load that settlement with deterministic seed + faction

### F4-5 — Realm → Dungeon ✅
- [x] Dungeon entrance markers generated on realm map (3–6 per realm)
- [x] Click → switch to Dungeon tab, load seeded from realm position

### F4-6 — Export Chain
- [ ] "Export World Package" button: ZIP of realm JSON + all settlement JSONs + dungeon blueprints
- [ ] Can be imported into the game's world generator directly

## Chain Map
```
☀ Solar System
  └── click planet → 🌍 Planet view (load that planet's DNA)
       └── "View Surface" button → 🗺 Realm Map
            ├── click settlement → 🏙 Settlement view
            │    └── click building → 🏠 Dwelling (OW-D)
            ├── click dungeon icon → ⚔ Dungeon view
            └── click cave icon → 🌿 Cave view
```

## Tasks

### F4-1 — Breadcrumb State Machine
- [ ] `DrillDownStack` class: push/pop views with metadata (seed, label, type)
- [ ] Breadcrumb UI component rendered below studio tabs
- [ ] Each breadcrumb clickable → restores that view

### F4-2 — Solar System → Planet
- [ ] Click planet in solar view → store `selectedPlanetDNA` + `selectedPlanetType`
- [ ] Switch to Realm tab, set planet type pill, generate matching realm
- [ ] Tower planet always generates habitable realm (terran/verdant/ocean type)

### F4-3 — Planet → Realm Surface
- [ ] "🗺 View Surface" button on planet/hex view
- [ ] Switches to map view for current realm data (already generated)

### F4-4 — Realm → Settlement
- [ ] Settlement dots on 2D realm map are clickable (currently visual only)
- [ ] Click → switch to Settlement tab, load that settlement

### F4-5 — Realm → Dungeon/Cave
- [ ] Dungeon entrance icons on realm map are clickable
- [ ] Click → switch to Dungeon or Cave tab, load seeded from map position

### F4-6 — Export Chain
- [ ] "Export World Package" button: ZIP of realm JSON + all settlement JSONs + dungeon blueprints
- [ ] Can be imported into the game's world generator directly
