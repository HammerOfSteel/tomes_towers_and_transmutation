# OW-F4 — Full Drill-Down Chain
> Complete the chain: ☀ Solar System → 🌍 Planet → 🗺 Realm → 🏙 City → ⚔ Dungeon

## Status: ✅ Shipped (F4-1 to F4-5 complete; F4-6 JSON slice shipped, ZIP/import deferred)
## Depends on: OW-E (layer navigation), OW-F2/F3 (planet DNA + solar system)

## Chain Map
```
☀ Solar System
  └── click planet → 🌍 Planet view (load that planet's DNA) ✅
       └── 🗺 Map pill / planet drill-down → Realm Map / Realm Surface ✅
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
- [x] `📦 World Package JSON` button added to Realm export controls
- [x] Exported package contains realm metadata + current `RealmData`
- [x] Exported package contains deterministic settlement descriptors with derived seeds
- [x] Exported package contains deterministic dungeon descriptors with derived seeds
- [x] Exported package bundles custom Asset Library entries under `customAssets` (`assetLibrary.exportCustomEntries()`)
- [x] `📥 Import World Package` restores `customAssets` into the local Asset Library (`src/overworld-studio/WorldPackage.ts`)
- [ ] ZIP packaging of realm JSON + per-settlement JSONs + dungeon blueprints
- [ ] Import should also restore realm config + regenerate the realm view
- [ ] Direct import into the game's world generator pipeline

## Validation
- [x] `tests/e2e/overworld-studio-world-package-export.spec.ts`

## Notes
- The current F4-6 implementation is intentionally a first integration slice:
  - single downloadable JSON package
  - truthful deterministic seed handoff for downstream settlement/dungeon generation
  - no ZIP bundling yet
  - importer currently restores custom Asset Library entries only (not realm regeneration)
