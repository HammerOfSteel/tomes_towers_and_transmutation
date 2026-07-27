# Asset Library
> ⚠️ GAP — Not tracked anywhere. A browsable, searchable gallery of all generated entity types.

## Status: 🚧 In Progress — core persistence, preview, export, import, delete, and duplicate flow shipped for current Overworld Studio asset types

## Problem
The game generates NPCs, buildings, enemies, props, and creatures procedurally. Right now:
- Each builder exists in isolation
- There is no way to browse "all generated buildings for this world seed"
- Designers can't review/approve/override what the world generator produces
- There is no persistence layer between the studio generators and the game runtime

## Proposed Solution: Asset Library Panel

### AL-1 — Library Data Model
- [x] `AssetLibrary` singleton exists for current Studio asset types (`settlement`, `dungeon`, `building`, `cave`)
- [x] Each entry stores `{ id, type, name, seed, createdAt, tags, isCustom, data, thumbnail }`
- [x] Persists to localStorage in studio
- [x] Export supports JSON-safe serialization for non-plain runtime data (notably `Map`)
- [x] Import supports restoring JSON-safe serialized runtime data back into live entries
- [x] `isCustom = true` is now used for duplicated/imported entries as an override/editing starting point

### AL-2 — Library UI Panel (in Overworld Studio)
- [x] New "📚 Library" panel is available in the Overworld Studio sidebar
- [x] Current type filters support shipped Studio asset classes: All | Buildings | Dungeons | Settlements | Caves
- [x] Grid view shows thumbnail + name
- [x] Click entry → preview in main canvas area
- [x] Actions shipped: Duplicate, Delete, Export JSON
- [ ] Actions remaining: Edit DNA, Pin to map location
- [ ] Future expansion: NPC / Enemy / Prop / Creature categories once those generators feed the library

### AL-3 — Studio Generator → Library Integration
- [x] Settlement, Dungeon, and Cave generators offer "Save to Library"
- [x] Persisted entries survive reload and can be previewed back into the studio
- [ ] Settlement generator: "Save all NPCs from this settlement"
- [ ] Dungeon generator: "Save room layouts from this dungeon" as separate reusable sub-assets

### AL-4 — Library → Game Runtime
- [ ] `WorldGen.ts` checks library before generating: if a named location has a custom blueprint, use it
- [ ] Custom blueprints exported in the World Package ZIP (see OW-F4)
- [ ] Runtime override path for duplicated/custom library entries

## Dependencies
- Requires: PROC-B creator tools (to have something to save)
- Feeds: PROC-C world generation (custom overrides)
