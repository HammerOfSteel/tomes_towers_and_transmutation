# OW-F4 — Full Drill-Down Chain
> Complete the chain: ☀ Solar System → 🌍 Planet → 🗺 Realm → 🏙 City → ⚔ Dungeon

## Status: 🔲 Not started
## Depends on: OW-E (layer navigation), OW-F2/F3 (planet DNA + solar system)

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
