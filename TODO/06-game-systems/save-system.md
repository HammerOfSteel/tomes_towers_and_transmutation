# Save System
> ⚠️ GAP — Basic localStorage save exists. No slots, versioning, or robust migration plan.

## Status: ⚠️ Basic auto-save works, full system not planned

## Current State
- `autoSave` triggered on floor transitions ✅
- `reload restores __game` ✅
- Single save slot, no export/import
- No versioning/migration

## Required for Demo

### SS-1 — Save Data Schema v1
- [ ] Define complete `SaveData` interface covering all game state:
  - Player: HP, mana, position, floor, inventory, spells, species, talents
  - Quests: completed beats, active quest + beat index
  - World: explored chunks, discovered settlements/dungeons, killed elites
  - Story: Solmor stage, completed arcs per species
  - Settings: volume, keybinds, colour-blind mode
- [ ] `SaveData.version: number` — increment on schema changes

### SS-2 — Save Slots (3 slots)
- [ ] `SaveManager.ts` — `save(slot)`, `load(slot)`, `deleteSave(slot)`, `listSaves()`
- [ ] Slot metadata: character name, species, floor, play time, last saved timestamp
- [ ] Slot picker UI on main menu (replace single-slot continue)

### SS-3 — Save Versioning + Migration
- [ ] `migrateV1toV2(data)` pattern — each version bump has a migration function
- [ ] On load: detect version mismatch → run migrations in sequence → save migrated
- [ ] Corrupt save handling: catch parse errors → offer "Start New Game"

### SS-4 — Export / Import
- [ ] "Export Save" → downloads JSON file
- [ ] "Import Save" → file picker → validates + loads
- [ ] Enables sharing save files between devices

### SS-5 — Auto-Save
- [ ] Auto-save on: floor transition, quest completion, zone entry
- [ ] "Auto-saved" toast notification

## Dependencies
- Feeds: G4 accessibility (carry settings across sessions)
- Feeds: F2 smoke tests (save/load round-trip)
