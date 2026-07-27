# OW-D — Dwelling Layer
> 2D floor plan renderer for individual buildings (houses, inns, shops). Adds a 4th drill-down level: Realm → City → Building interior.

## Status: ✅ Shipped

## What shipped
- `src/buildingToDungeonPlan.ts` — per-room Blueprint generator from `BuildingDNA` (all major archetypes)
- `src/world/buildings/InteriorGenerator.ts` — procedural floor plan with room purposes, passages, furniture
- Building floor plan modal in Settlement tab — double-click a ward to see connected room layout with zoom/pan
- `building-viewer.html` + `src/building-viewer.ts` — isolated 3D preview page (fly mode, wall occlusion, door transitions)
- Overworld Studio “🎮 Play in 3D” button — opens `building-viewer.html` with the selected building
- Multi-floor buildings connected via stair doors (BFS traversal in floor plan view)
- 52 unit tests in `tests/levels/buildingToDungeonPlan.test.ts`

## Deferred / not done
- OW-D3 dedicated controls (archetype/faction/size pills) — currently driven by ward type in settlement
- OW-D4 multi-floor navigation UI in floor plan modal (floor selector buttons)

## Task Breakdown

### OW-D1 — Floor Plan Generator
- [x] Building blueprint generation shipped via `src/buildingToDungeonPlan.ts` + `src/world/buildings/InteriorGenerator.ts`
- [x] Major archetypes are covered through the current building/ward blueprint pipeline
- [x] Room placement and passage connectivity ship in the current procedural interior generator
- [x] Furniture scatter ships in the current interior generator
- [x] Exterior/inter-room door connectivity ships in the current blueprint output
- [ ] Follow-up: consolidate this into a cleaner explicit `DwellingDNA`/generator contract if OW-D is revisited

### OW-D2 — Renderer / Viewer Surface
- [x] 2D floor plan rendering ships in the settlement building modal
- [x] Room/wall/door/furniture visualization ships in the current modal renderer
- [x] `building-viewer.html` + `src/building-viewer.ts` provide the isolated 3D exploration surface
- [ ] Follow-up: formalize a dedicated `DwellingRenderer.ts` contract if the renderer is split out from current building-viewer/modal code

### OW-D3 — Overworld Studio Controls
- [x] Building preview flow ships as a settlement-driven modal drill-down
- [x] “🎮 Play in 3D” handoff ships for the selected building blueprint
- [ ] Dedicated archetype/faction/size controls are still missing
- [ ] Explicit PNG/JSON export controls for the dwelling surface are still missing as a first-class UI

### OW-D4 — Multi-Floor Navigation
- [x] Multi-floor building connectivity ships through stair-door linking / BFS traversal
- [ ] Dedicated floor selector buttons remain deferred

## Dependencies
- Requires: settlement data (OW-A ✅)
- Feeds: `02-game-world-integration/settlement-integration.md` (blueprint placed in 3D world)
