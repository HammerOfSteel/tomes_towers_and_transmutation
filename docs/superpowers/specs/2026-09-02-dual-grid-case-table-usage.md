# DualGridCaseTable — worked example (Phase 0 of organic-world-tiles)

> Short usage note, not a full design spec — see
> `TODO/organic_world_tiles_todo.md` (Phase 0) for the roadmap this
> supports, and `src/world/DualGridCaseTable.ts`'s own header comment for
> the algorithm. This note exists purely so Phase 1/2 don't have to
> reverse-engineer the intended calling convention from the test suite.

## The contract

```ts
import { buildDualGridCaseTable, rotateMask } from '@/world/DualGridCaseTable';

const table = buildDualGridCaseTable(2); // binary: e.g. water=0, land=1
// table.tiles.length === 6
// table.mapping["0,1,0,0"] === { tile: <index of the 'outer_corner' tile>, steps: <0-3> }
```

`buildDualGridCaseTable()` is called **once, at startup** (its result never
changes for a fixed `states` value — it's pure data, not per-world-seed
content) and cached by the caller. It is not meant to be rebuilt per tile.

## Worked example: Phase 1 (shoreline corners)

For a shoreline pass, a "corner" is a `WorldGrid` tile-grid vertex, shared by
up to 4 tiles. Given a corner's 4 touching tiles' water/land classification
(order: `[NW tile, NE tile, SE tile, SW tile]` — matching `DualGridCaseTable`'s
own `[NW, NE, SE, SW]` winding, so no index-remapping is needed at the call
site), look up which of the 6 canonical shoreline meshes to place and how to
rotate it:

```ts
const table = buildDualGridCaseTable(2); // built once, cached

function shorelineTileFor(nwLand: boolean, neLand: boolean, seLand: boolean, swLand: boolean) {
  const config = [nwLand ? 1 : 0, neLand ? 1 : 0, seLand ? 1 : 0, swLand ? 1 : 0];
  const { tile, steps } = table.mapping[config.join(',')]!;
  const canonicalMesh = SHORELINE_MESHES[table.tiles[tile]!.label]; // 'empty'|'outer_corner'|'edge'|'diagonal'|'inner_corner'|'full'
  const rotationRadians = steps * (Math.PI / 2); // clockwise, matching rotateMask()
  return { mesh: canonicalMesh, rotationRadians };
}
```

The 6 authored (or procedurally-generated) meshes are keyed by
`DualGridCaseTile.label` (only populated for the binary case) rather than by
raw tile index, since the label is stable/human-readable while the tile
index ordering is an implementation detail of `buildDualGridCaseTable()`'s
enumeration order (not guaranteed stable across states values, though it IS
deterministic for a fixed `states` — see the "is deterministic" test).

## Worked example: Phase 2 (building corners)

Same shape, different domain: a "corner" is one of a `BlockGrid` cell's 4
horizontal corners (matching `BlockKit.ts`'s existing `CornerId` type and
winding — `NW/NE/SE/SW`, clockwise from above), and "on" means "the tile
touching this corner from that diagonal direction is occupied" (generalizing
`getChamferFlags()`'s existing "both orthogonal neighbours empty" rule from
a binary chamfer/sharp flag to a full 6-shape lookup):

```ts
const table = buildDualGridCaseTable(2);

function buildingCornerTileFor(grid: BlockGrid, bx: number, by: number, bz: number) {
  const config = [
    hasBlock(grid, bx - 1, by, bz - 1) ? 1 : 0, // NW-diagonal neighbour
    hasBlock(grid, bx + 1, by, bz - 1) ? 1 : 0, // NE
    hasBlock(grid, bx + 1, by, bz + 1) ? 1 : 0, // SE
    hasBlock(grid, bx - 1, by, bz + 1) ? 1 : 0, // SW
  ];
  const { tile, steps } = table.mapping[config.join(',')]!;
  return { pieceLabel: table.tiles[tile]!.label, rotationSteps: steps };
}
```

`pieceLabel` then selects from a per-faction kit of 6 authored meshes (Phase
2.2), instead of BlockKit's current immediate-procedural-outline generation.

## What Phase 0 deliberately does NOT decide

Per `organic_world_tiles_todo.md`'s own Phase 0 scope, this utility is pure
corner-topology math — it has no opinion on:
- Where the 6 canonical meshes/pieces actually live or how they're authored
  (Phase 1.2 / 2.2's job).
- How a domain-specific "corner state" is derived from that domain's own
  data model (the two worked examples above show *a* reasonable derivation
  each, not *the* mandated one — Phase 1/2's own design specs should
  confirm the exact rule against real `WorldGrid`/`BlockGrid` data, the same
  way this session's `ShorelineWobble.ts` needed its own investigation into
  `TerrainGeometryBuilder.ts`'s exact wall/corner conventions before wiring
  anything in).
