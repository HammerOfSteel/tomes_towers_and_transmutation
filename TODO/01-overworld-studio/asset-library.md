# Asset Library
> ⚠️ GAP — Not tracked anywhere. A browsable, searchable gallery of all generated entity types.

## Status: 🚧 In Progress — core persistence, preview, export, import, rename, delete, and duplicate flow shipped for current Overworld Studio asset types

## Problem
The game generates NPCs, buildings, enemies, props, and creatures procedurally. Right now:
- Each builder exists in isolation
- There is no way to browse "all generated buildings for this world seed"
- Designers can't review/approve/override what the world generator produces
- There is no persistence layer between the studio generators and the game runtime

## Proposed Solution: Asset Library Panel

### AL-1 — Library Data Model
- [x] `AssetLibrary` singleton exists for current Studio asset types (`settlement`, `dungeon`, `building`, `cave`, `room`, `npc`, `realm`, `planet`, `solar`)
- [x] Each entry stores `{ id, type, name, seed, createdAt, tags, isCustom, data, thumbnail }`
- [x] Persists to localStorage in studio
- [x] Export supports JSON-safe serialization for non-plain runtime data (notably `Map`)
- [x] Import supports restoring JSON-safe serialized runtime data back into live entries
- [x] `isCustom = true` is now used for duplicated/imported entries as an override/editing starting point

### AL-2 — Library UI Panel (in Overworld Studio)
- [x] New "📚 Library" panel is available in the Overworld Studio sidebar
- [x] Current type filters support shipped Studio asset classes: All | Buildings | Dungeons | Room Layouts | NPCs | Settlements | Realms | Planets | Solar Systems | Caves
- [x] Grid view shows thumbnail + name
- [x] Click entry → preview in main canvas area
- [x] Actions shipped: Import JSON, Rename, Duplicate, Delete, Export JSON, Pin to location (`assetLibrary.pinToLocation()`/`unpinFromLocation()` — adds/removes a `<type>:<locationId>` tag matching the existing runtime override tag convention; click-to-unpin chips render in the preview panel)
- [ ] Actions remaining: Edit DNA
- [ ] Future expansion: Enemy / Prop / Creature categories once those generators feed the library

### AL-3 — Studio Generator → Library Integration
- [x] Settlement, Dungeon, Cave, Realm, Solar System, and drilled-into Planet views offer "Save to Library"
- [x] Building modal now offers "💾 Save to Library" for building blueprints as `AssetLibrary` type=`building`
- [x] Persisted entries survive reload and can be previewed back into the studio, including Solar → Planet drill-down saves previewed back into the realm canvas
- [x] Settlement generator: "Save all NPCs from this settlement"
- [x] Dungeon generator: "Save room layouts from this dungeon" as separate reusable sub-assets

### AL-4 — Library → Game Runtime
- [x] `WorldGen.ts` now checks library for custom settlement NPC entries and uses them instead of procedural settlement NPC generation when a matching custom override exists
- [x] Extend runtime override lookup to custom settlement buildings
- [x] Extend runtime override lookup to custom room layouts (`src/levels/customRoomOverrides.ts` → `generateDungeon`, matched by `room:<instanceId>` tag or blueprint id, footprint-guarded so generated door wiring stays valid)
- [x] Extend runtime override lookup to named overworld locations — custom `dungeon`/`cave` library entries override placed entrances (`src/world/customLocationOverrides.ts` → `placeDungeons`), matched by `dungeon:<id>`/`cave:<id>` tag or `data.dungeonId`; name/type/seed/floorCount are overridable, grid placement stays generator-owned
- [ ] Extend runtime override lookup to glades and other realm POIs once those placers exist
- [x] Custom blueprints exported in the World Package (see OW-F4) — `assetLibrary.exportCustomEntries()` embeds every `isCustom` entry (JSON-safe, Map-encoded) under `customAssets` in the exported world package JSON
- [x] World Package import path that restores `customAssets` back into a local library (`src/overworld-studio/WorldPackage.ts` + "📥 Import World Package" button in the Realm export panel; validates kind/version, imports each snapshot via `assetLibrary.importEntry()` so entries get fresh ids and stay `isCustom`)
- [ ] Runtime override path for additional duplicated/custom library entry classes

## Dependencies
- Requires: PROC-B creator tools (to have something to save)
- Feeds: PROC-C world generation (custom overrides)
