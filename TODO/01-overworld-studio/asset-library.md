# Asset Library
> ⚠️ GAP — Not tracked anywhere. A browsable, searchable gallery of all generated entity types.

## Status: ⚠️ Not planned, needs design decision first

## Problem
The game generates NPCs, buildings, enemies, props, and creatures procedurally. Right now:
- Each builder exists in isolation
- There is no way to browse "all generated buildings for this world seed"
- Designers can't review/approve/override what the world generator produces
- There is no persistence layer between the studio generators and the game runtime

## Proposed Solution: Asset Library Panel

### AL-1 — Library Data Model
- [ ] `AssetLibrary` singleton: stores named blueprints per type (`NpcBlueprint[]`, `BuildingBlueprint[]`, etc.)
- [ ] Each entry: `{ id, type, name, dna, seed, createdAt, tags, isCustom }`
- [ ] Persists to localStorage (studio) and exported to game world package
- [ ] `isCustom = true` → overrides the procedural default for that named location

### AL-2 — Library UI Panel (in Overworld Studio)
- [ ] New "📚 Library" tab in Overworld Studio sidebar
- [ ] Tabs: NPCs | Buildings | Enemies | Props | Creatures
- [ ] Grid view: thumbnail (rendered mini-canvas) + name + type badge
- [ ] Click entry → preview in main canvas area
- [ ] Actions: Duplicate, Edit DNA, Delete, Export JSON, Pin to map location

### AL-3 — Studio Generator → Library Integration
- [ ] Each generator (Settlement, Dungeon, Cave) offers "Save to Library" on generated entities
- [ ] Settlement generator: "Save all NPCs from this settlement"
- [ ] Dungeon generator: "Save room layouts from this dungeon"

### AL-4 — Library → Game Runtime
- [ ] `WorldGen.ts` checks library before generating: if a named location has a custom blueprint, use it
- [ ] Custom blueprints exported in the World Package ZIP (see OW-F4)

## Dependencies
- Requires: PROC-B creator tools (to have something to save)
- Feeds: PROC-C world generation (custom overrides)
