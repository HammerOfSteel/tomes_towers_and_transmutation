# OW-D — Dwelling Layer
> 2D floor plan renderer for individual buildings (houses, inns, shops). Adds a 4th drill-down level: Realm → City → Building interior.

## Status: 🔲 Not started

## Tasks

### OW-D1 — Floor Plan Generator
- [ ] `src/overworld/DwellingGenerator.ts` — procedural floor plan from `DwellingDNA` (size, archetype, faction)
- [ ] Archetypes: `house_small`, `house_large`, `inn`, `shop`, `forge`, `alchemist`, `guard_post`, `manor`
- [ ] Room placement: BSP subdivision within building footprint
- [ ] Furniture scatter: per-archetype furniture pools (reuse existing `buildProp()` calls)
- [ ] Doors: connect rooms + exterior door facing street

### OW-D2 — Renderer (`DwellingRenderer.ts`)
- [ ] Canvas 2D renderer (same approach as dungeon tab)
- [ ] Wall lines, door arcs, furniture symbols
- [ ] Floor texture fill per room type
- [ ] Scale: 1 cell = 1 WU (walkable in game)
- [ ] CSS2D labels for room names on hover

### OW-D3 — Overworld Studio Tab
- [ ] Add "🏠 Dwelling" as sub-view inside Settlement tab (or separate tab)
- [ ] Controls: archetype pills, faction pills, Size slider
- [ ] Preview canvas
- [ ] Export: PNG + JSON blueprint

### OW-D4 — Multi-Floor Navigation
- [ ] Buildings > 1 floor: floor selector buttons (up/down arrows)
- [ ] Staircase placement connects floors

## Dependencies
- Requires: settlement data (OW-A ✅)
- Feeds: `02-game-world-integration/settlement-integration.md` (blueprint placed in 3D world)
