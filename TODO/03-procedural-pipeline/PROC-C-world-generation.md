# PROC-C — World Generation System
> Seeded deterministic placement plan for all entities in a region. **Depends on PROC-B builders.**

## Status: 🔲 Not started (WorldGen.ts stub exists from PROC-A)

## Goal
`generateWorld(seed, realmData)` → deterministic placement plan:
- All building DNAs at settlement positions
- All NPC DNAs per ward
- All enemy DNAs per dungeon floor
- All prop/feature DNAs per room/biome
- All ambient creature DNAs per biome

## Tasks

### WG-1 — Settlement Population Plan
- [ ] `generateSettlementPlan(settlementRecord, seed)` → `SettlementPlan`
- [ ] Ward → building type assignment (market ward gets market+stalls, etc.)
- [ ] Population count by size: village 5-8 NPCs, town 12-20, city 25-40
- [ ] Named NPCs: each settlement gets 1 innkeeper, 1 blacksmith, 1 merchant with fixed seed names

### WG-2 — Dungeon Population Plan
- [ ] `generateDungeonPlan(dungeonSeed, faction, floors)` → `DungeonPlan`
- [ ] Uses `RoomEncounterDef.ts` already built ✅
- [ ] Adds: chest loot tables, key item placement, boss room prep

### WG-3 — Overworld Ambient Plan
- [ ] `generateOverworldAmbient(realmData)` → per-biome ambient spawn lists
- [ ] Forest: deer/rabbit/bird flocks
- [ ] Bog: frogs/will-o-wisps
- [ ] Mountain: eagles/goats
- [ ] All ambient creatures from `buildCreature(dna)` via PROC-B5

### WG-4 — World Package Export
- [ ] `exportWorldPackage(seed)` → JSON bundle containing all plans
- [ ] Can be imported by game runtime directly (no re-generation needed at runtime)
- [ ] Used by OW-F4 "Export World Package" button

## Dependencies
- Requires: PROC-B all builders 🔲
- Requires: `02-game-world-integration` integration layer 🔲
