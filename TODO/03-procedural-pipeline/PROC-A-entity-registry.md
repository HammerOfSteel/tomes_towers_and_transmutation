# PROC-A — Entity Registry
> Central registry mapping entity type → procedural builder. Game systems import through here.

## Status: ✅ Done (2026-07-18)

## What was built
- `src/procedural/EntityRegistry.ts` — registry map for all entity types
- `src/procedural/ProceduralDNA.ts` — shared base DNA (`v`, `seed`, `name`, `kind`)
- `src/procedural/builder/BaseBuilder.ts` — abstract builder interface
- Share code system: `P2.` (princess), `N2.` (NPC), `E2.` (enemy), `B2.` (building)
- `src/procedural/WorldGen.ts` — top-level world generation coordinator
- Tests: `EntityRegistry.test.ts` + `WorldGen.test.ts` ✅

## Notes
- All new builders must register through `EntityRegistry`
- The `WorldGen.ts` coordinator uses the registry to build placement plans
