# Procedural Tile Designer
> Planned tile-variant design surface for procedural terrain, dungeon, cave, and settlement tiles.

## Status: 🚧 In Progress — TileDNA schema + TileRegistry data layer shipped (TV-1, TV-4); designer UI (TV-3) and variant sets (TV-2) still pending

## What Tiles Are
Tiles are the repeatable ground/wall/feature units that compose:
- Overworld terrain (grass, forest, sand, snow, etc.)
- Dungeon floors and walls (stone, scorched, damp, etc.)
- Cave biome terrain (crystal, lava, ice, etc.)
- Settlement ground (cobble, dirt, wood planks, etc.)

Currently these are scattered rendering/building helpers with no systematic tile DNA, registry, or designer workflow.

## Proposed: Tile Variant System

### TV-1 — Tile DNA
- [x] `TileDNA` interface: `{ v, category, biome, variant, seed, size, colorOverride? }` (`src/procedural/TileDNA.ts`)
- [x] Categories: `ground | wall | ceiling | feature | transition`
- [x] Validation (`validateTileDNA`) + deterministic construction (`makeTileDNA`)
- [ ] `buildTile(dna): THREE.Group` — consistent builder pattern (deferred to TV-3, needs mesh/material work)

### TV-2 — Tile Variant Sets (what we need)
| Biome/Type | Variants needed |
|---|---|
| Grassland | 3 (short, lush, patchy) |
| Forest floor | 3 (leaf litter, moss, roots) |
| Desert | 3 (sand, cracked, dune) |
| Tundra | 3 (snow, ice patch, frozen ground) |
| Dungeon stone | 4 (plain, mossy, cracked, scorched) |
| Cave rock | 4 (wet, dry, crystal-veined, lava-rimmed) |
| Settlement cobble | 3 (worn, new, decorated) |
| Water | 2 (shallow, deep) |

### TV-3 — Tile Designer Tool (in Overworld Studio or standalone)
- [ ] Category/biome/variant selector
- [ ] Colour override picker
- [ ] Roughness/detail sliders
- [ ] Live preview (canvas, top-down and isometric)
- [ ] "Generate variations" button — seeds N random variants
- [ ] Save variant to tile library
- [ ] Export: JSON DNA + PNG thumbnail

### TV-4 — Tile Registry
- [x] `TileRegistry.ts` — maps `(biome, variant)` → `TileDNA`, singleton `tileRegistry` export
- [x] Allows designer overrides for specific named locations (`registerForLocation`/`resolveForLocation`)
- [ ] Used by world generator to select correct tile per cell (blocked on TV-3 builder existing)

## Dependencies
- Requires: PROC-A entity registry pattern ✅ (apply same pattern)
- Feeds: `02-game-world-integration/realm-integration.md` (terrain tiles)
