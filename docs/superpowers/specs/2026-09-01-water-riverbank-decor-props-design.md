# Water/Riverbank Decorative Props Design Note

Status: approved autonomously, continuing directly from the water floor texture
variety work — user re-confirmed after that shipped: "lakes, rivers and sea still
no more assets and blocky." Re-reading this alongside the original ask ("maybe a
variety of props etc that work well in those areas"), the actual highest-leverage
fix is real 3D props, not further texture tuning — a subtle 2D noise texture
blended at 28-45% alpha through a semi-transparent, tinted water surface is
inherently hard to perceive (confirmed by inspecting the raw textures directly:
they look fine on their own, similar contrast to existing land textures, but get
washed out by the compounding tint+blend). Actual opaque 3D geometry (real
shading, real silhouettes) reads far more clearly through the same water surface,
the same way the floor mesh itself already does — and directly answers "no more
assets" literally. No full brainstorm cycle — this reuses an already-proven,
already-shipped pattern (`_buildChunkBeachDecor()`) end-to-end.

## 1. What already exists (and its exact gap)

`OverworldScene._buildChunkBeachDecor()` already scatters driftwood, dune-grass
tufts, and pebbles — but ONLY on `cell.biome === 'beach'` tiles. Two gaps:

1. **River banks get nothing.** `river_bank` tiles (the dry strip directly beside
   a river, distinct from `beach`) currently have zero decor at all.
2. **Nothing is ever placed on actually-submerged tiles.** `isScatterAllowed()`
   (the shared gate used by every OTHER scatter kind — trees/rocks/bushes/
   grass/ambient wildlife) unconditionally excludes any tile with
   `waterDepth > 0` — correct for those kinds (a tree floating on water would be
   a bug), but means there is currently no path for anything to intentionally
   place UNDERWATER.

## 2. Approach

### 2a. New `isWaterDecorAllowed()` gate (testable, `ScatterRules.ts`)

```ts
export type WaterDecorKind = 'reed' | 'underwater';

export function isWaterDecorAllowed(cell: WorldCell, kind: WaterDecorKind): boolean {
  if (cell.settlementId > 0) return false;
  if (cell.content !== 'empty') return false;
  if (kind === 'reed') return cell.feature === 'river_bank';
  return cell.waterDepth > 0; // 'underwater'
}
```

A deliberate SEPARATE function from `isScatterAllowed()`, not a new case added to
it — `isScatterAllowed()`'s whole reason for existing (per its own doc comment) is
that EVERY kind it already covers must never be placed on water; inverting that
for one new kind inside the same function would be a confusing, easy-to-misread
special case. A parallel, purpose-built gate for "things that specifically WANT
water" is clearer and keeps `isScatterAllowed()`'s existing guarantee airtight.

### 2b. Two new decor kinds, following `_buildChunkBeachDecor()`'s exact pattern

- **Reeds** (`river_bank` tiles): a tall, narrow blade cluster — visually similar
  construction to the existing `_makeDuneGrassTuft()` (a small radial cluster of
  cone "blades") but taller and a cooler, wetter green, reading as riverside
  reeds/rushes rather than dry dune grass. Denser spacing (~2.4 WU, matching
  beach decor's own reasoning: riverbank strips are narrow, a wider spacing would
  mostly miss the strip).
- **Underwater props** (any submerged ocean/river/lake tile): a 50/50 roll
  between a small dark wet-rock cluster (near-identical construction to the
  existing `_makeBeachPebbles()`, darker/more saturated coloring) and a simple
  seaweed/kelp blade (a few tall, gently curved thin planes anchored at the
  floor, swaying via the same per-instance-hash static-but-varied bend already
  used elsewhere — no new animation system). Sparser spacing (~5 WU) than reeds,
  since open water areas are much larger than a narrow bank strip and a denser
  pass would read as visually cluttered.
- Both positioned at the correct height for their surface: reeds at the tile's
  normal dry elevation (`cell.elevation * SH`, same as every other land-surface
  decor); underwater props at the CARVED floor height (`cell.elevation * SH -
  cell.waterDepth`, the exact same value `physicalHeightWU()`/the terrain mesh's
  own carved top face already use) — sitting flush with the floor mesh, not
  floating at the dry logical elevation.
- Both purely decorative (no collider), reusing `_pooledMaterial()` for the
  same texture-sharing/draw-call-reduction benefit every other scatter kind gets,
  and folded into the SAME `mergeGroupMeshesByMaterial(group)` pass already
  applied to the whole chunk scatter group — no new merge/render-order code.

### 2c. Wiring: one new method, called from the existing `_buildChunkScatter()`

`_buildChunkWaterDecor(coord, group)` — same signature/call convention as
`_buildChunkBeachDecor(coord, group)`, called right alongside it. Two independent
`poissonDisk` passes (reeds, underwater) inside this one method, each with its
own seed offset (mirroring how tree/rock/beach-decor scatter each already use a
distinct XOR salt on the shared chunk seed, so their point sets don't correlate).

## 3. Why this doesn't also fix the shoreline edge shape

Scattering props densely enough to visually mask the tile-grid-aligned zigzag
edge line was considered, but explicitly not attempted here: reed/rock/seaweed
density tuned for "looks like natural undergrowth" is far too sparse to reliably
obscure a hard geometric edge (that would require an almost-solid decorative
border, reading as a hedge, not a natural riverbank/coastline). The edge LINE
shape itself remains the documented non-goal from the water floor texture
variety pass — still a separate, larger effort if revisited.

## 4. Testing

- `isWaterDecorAllowed()`: reed only true on `river_bank`; underwater only true
  when `waterDepth > 0`; both false inside a settlement zone or on a non-empty
  tile (dungeon entrance, etc.) — mirrors `ScatterRules.test.ts`'s existing style
  for `isScatterAllowed()`.
- Manual/live verification (screenshot comparison at a real riverbank/lake) —
  same established pattern as every other visual change this session, since
  jsdom/vitest cannot render real Three.js geometry, and this specific system
  (`_buildChunkBeachDecor()`'s own precedent) has never had deeper unit coverage
  than its gating logic either.
