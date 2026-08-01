# Procedural Tile Designer
> Planned tile-variant design surface for procedural terrain, dungeon, cave, and settlement tiles.

## Status: ✅ TV-1/TV-2/TV-3/TV-4 all shipped — standalone Tile Designer (`tile-creator.html`) live with builder, generate-variations, and Asset Library integration

## What Tiles Are
Tiles are the repeatable ground/wall/feature units that compose:
- Overworld terrain (grass, forest, sand, snow, etc.)
- Dungeon floors and walls (stone, scorched, damp, etc.)
- Cave biome terrain (crystal, lava, ice, etc.)
- Settlement ground (cobble, dirt, wood planks, etc.)

Currently these are scattered rendering/building helpers with no systematic tile DNA, registry, or designer workflow.

## Proposed: Tile Variant System

### TV-1 — Tile DNA
- [x] `TileDNA` interface: `{ v, category, biome, variant, seed, size, colorOverride?, roughness? }` (`src/procedural/TileDNA.ts`)
- [x] Categories: `ground | wall | ceiling | feature | transition`
- [x] Validation (`validateTileDNA`) + deterministic construction (`makeTileDNA`)
- [x] `buildTile(dna): BuiltTile` — consistent builder pattern (`src/procedural/TileBuilder.ts`), dispatches on `category` to primitive geometry (plane/box), material color from `resolveTileColor`, roughness from `dna.roughness ?? 0.85`

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

- [x] `TILE_VARIANT_COLOR` — canonical default hex color for every biome+variant pair above (`src/procedural/TileColor.ts`)
- [x] `resolveTileColor(dna)` — resolves a TileDNA to a display color, honouring `colorOverride` first, falling back to the palette, then neutral grey for variants authored outside this table
- [x] Actual mesh/material variant construction — shipped in TV-3's `TileBuilder.ts` as flat-shaded primitive geometry (plane for ground/ceiling/transition, box for wall, plane+box for feature); textures/normal maps deferred to the future world-generator renderer (`02-game-world-integration`), which can swap in richer materials behind the same `TileDNA` contract

### TV-3 — Tile Designer Tool (in Overworld Studio or standalone)
- [x] Category/biome/variant selector — chip pickers in `tile-creator.html`, variant list re-renders reactively from `TILE_VARIANTS[biome]` (`src/tile-creator/main.ts`)
- [x] Colour override picker — `<input type=color>` + "Clear override" button reverting to the palette default
- [x] Roughness/detail sliders — roughness slider (size slider also included since `TileDNA.size` affects preview scale)
- [x] Live preview (canvas, top-down and isometric) — `btn-cam-iso`/`btn-cam-top` toggle switches `camera.position` between an isometric-angle vantage and a directly-overhead top-down vantage
- [x] "Generate variations" button — `generateVariationSeeds()` (`src/procedural/tileCreatorState.ts`) seeds 6 deterministic sibling DNAs from a base seed; rendered as clickable colour swatches, click adopts that variation as the active state
- [x] Save variant to tile library — wired to `AssetLibrary` via `toLibraryPayload()` → `type: 'tile'`
- [ ] Export: JSON DNA + PNG thumbnail — not yet implemented (same gap exists in the sibling NPC/Enemy/Building/Prop designers — `thumbnail` is saved as `null` throughout; a shared thumbnail-capture utility would be the efficient way to close this for all five designers at once, tracked as a follow-up rather than duplicated per-designer)

### TV-4 — Tile Registry
- [x] `TileRegistry.ts` — maps `(biome, variant)` → `TileDNA`, singleton `tileRegistry` export
- [x] Allows designer overrides for specific named locations (`registerForLocation`/`resolveForLocation`)
- [ ] Used by world generator to select correct tile per cell — blocked on `02-game-world-integration`'s terrain renderer existing, not on TV-3 (builder now exists)

## Dependencies
- Requires: PROC-A entity registry pattern ✅ (apply same pattern)
- Feeds: `02-game-world-integration/realm-integration.md` (terrain tiles)
