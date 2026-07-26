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
- [ ] Add site-family metadata to dungeon plans:
  - `tower_floor`
  - `library_ruin`
  - `alchemy_vault`
  - `tomb_barrow`
  - `beast_lair`
  - `mine_works`
  - `observatory_ruin`
  - `surface_threat`
- [ ] Add reward-bias tags to dungeon plans:
  - `knowledge_rich`
  - `volatile_materials`
  - `beast_capture_opportunity`
  - `defense_intel`
  - `candidate_archive`
  - school bias tags where relevant
- [ ] Add weighted placement support for:
  - guaranteed core books
  - school-deepening texts
  - reagent/material family drops
  - elite recruit opportunities
  - defense-intel nodes / archive clues

### WG-3 — Overworld Ambient Plan
- [ ] `generateOverworldAmbient(realmData)` → per-biome ambient spawn lists
- [ ] Forest: deer/rabbit/bird flocks
- [ ] Bog: frogs/will-o-wisps
- [ ] Mountain: eagles/goats
- [ ] All ambient creatures from `buildCreature(dna)` via PROC-B5

### WG-4 — Reward Ecology, Recruit Sources & Pressure Hooks
- [ ] Add worldgen support for material family distribution by site/biome:
  - botanical reagents
  - mineral / structural matter
  - monster-derived components
  - arcane residues
  - knowledge artifacts
- [ ] Add recruit ecology hooks so site families can bias:
  - tower defenders
  - beasts
  - constructs
  - spectral/undead units
  - elite/signature companion opportunities
- [ ] Add regional pressure contribution tags so generated sites can later feed:
  - tower-domain threat buildup
  - defense forecasts
  - faction hostility / anomaly spread
- [ ] Ensure worldgen output can answer:
  - what this site is good for
  - what book/material families it likely contains
  - whether it can produce defense intel
  - whether it can produce a meaningful recruit

### WG-5 — World Package Export
- [ ] `exportWorldPackage(seed)` → JSON bundle containing all plans
- [ ] Include site-family, reward-bias, recruit-ecology, and pressure metadata
- [ ] Can be imported by game runtime directly (no re-generation needed at runtime)
- [ ] Used by OW-F4 "Export World Package" button

## Dependencies
- Requires: PROC-B all builders 🔲
- Requires: `02-game-world-integration` integration layer 🔲
