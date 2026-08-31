# Procedural Grass Shader (Batch 2: Savanna/Forest/Taiga/Tundra) — Design

## 0. Process Note

The user confirmed (via `ask_user`, unavailable to answer interactively this round) they want
autonomous progress: "The user is not available to respond and will review your work later.
Work autonomously and make good decisions." This spec makes the batch-scoping decision the user
would normally answer, with rationale documented below, following the exact same process used
for the fully-approved lantern spell and grass batch 1 specs earlier this session.

**Decision — single batch covering all 4 remaining biomes** (savanna, forest, taiga, tundra),
rather than splitting into two smaller batches. Rationale: batch 1
(`docs/superpowers/specs/2026-08-31-procedural-grass-grassland-design.md`) already proved out
every piece of real engineering risk — placement/exclusion logic, instanced-mesh rendering,
wind/SSS/AO shading, the rebuild-hysteresis update cadence, and (after the just-shipped
`uFadeCenter` fix) the distance-fade model. Extending to 4 more biomes is now primarily
per-biome *visual tuning* (blade dimensions, colors, density) plus mechanical parametrization of
already-tested code — not new architecture. Splitting that into two batches would just delay
shipping half the already-designed presets for no risk-reduction benefit.

## 1. Context

Batch 1 shipped wind-animated grass blades for the `grassland` biome only, deliberately scoped
that way (see batch 1 spec §2/§9). The roadmap's "grass-bearing" biome set (per the terrain
system's 11-biome taxonomy in `WorldGrid.ts`) is `grassland | savanna | forest | taiga | tundra`
— the other 6 biomes (`deep_ocean`, `ocean`, `beach`, `desert`, `snow`, `mountain`) are correctly
grass-free (water, sand, arid rock/sand, snowpack, and bare rock respectively).

Each remaining biome already has an established baked ground-texture color in
`TerrainTextures.ts` that the new grass tint should read as a natural, not jarring, addition to:

| Biome | Ground base color | Character |
|---|---|---|
| savanna | `#b8a05c` (tan/gold) | dry, sparse, sun-baked |
| forest | `#3e5a2c` (dark green) | shaded floor, canopy-blocked light |
| taiga | `#374a34` (dark cool green) | coniferous floor, sparse understory |
| tundra | `#8a978c` (gray-green) | short, hardy, cold-climate groundcover |

## 2. Architecture — Parametrize, Don't Duplicate

`GrassField.ts`'s `GrassField` class and `selectGrassPlacements()` currently hardcode the
`grassland` biome filter and a single set of blade/shader tuning constants
(`BLADE_SEGMENTS`/`BLADE_WIDTH`/etc., `createGrassMaterial()`'s fixed color uniforms). This batch
generalizes both to accept a `GrassPreset` (visual tuning) and a target `BiomeId` (placement
filter), so **one instance of the same class serves each biome** — mirroring how Phase 6's
territory-dressing system parametrized one shared placement/probability engine across 9
factions, rather than writing per-faction placement code.

```ts
export interface GrassPreset {
  biome: BiomeId;
  segments: number; width: number; height: number; curvature: number;
  baseColor: number; tipColor: number; dryColor: number; dryAmount: number;
  densityPerUnit2: number;
  windBase: number; windGust: number; windGustFreq: number;
  maxBlades: number; // see §4's per-preset sizing rationale
}
```

`OverworldScene.ts` replaces its single `_grassField: GrassField` field with
`_grassFields: GrassField[]` (5 entries, one per grass-bearing biome), looping over the array
everywhere the singleton was previously touched (constructor, `enter()`, `exit()`, `update()`,
`dispose()`) — a mechanical, low-risk change since every call site already treats `GrassField` as
an opaque `{ mesh, update, tickWind, dispose }` unit.

**Why 5 separate `InstancedMesh`es instead of 1 combined multi-biome mesh:** a shared mesh would
need a per-instance "which biome" attribute driving in-shader color/height lookups from a small
uniform array — real added shader complexity for a reward that's purely cosmetic (saving at most
4 draw calls, when 5 draw calls total is already negligible against this scene's existing
hundreds). Keeping one preset per `GrassField` instance keeps each biome's tuning independently
readable, testable, and tweakable without touching the others — the same "smaller, well-bounded
units" principle used throughout this session's other multi-variant systems (Phase 5's
`BIOME_AFFINITY` table, Phase 6's per-faction builders).

**Total blade-count ceiling is unchanged from batch 1's budget analysis:** because a single world
tile can only ever be ONE biome, a given player position's union across all 5 fields' actual
placed blade counts is bounded by whichever single biome's max theoretical count is highest
(grassland's ~80,640 for a fully-grassland 48×48 WU window) — running 5 fields simultaneously
does NOT mean 5× the peak blade count in practice, only 5× the (mostly near-zero) idle draw-call
overhead when a player is nowhere near that biome.

## 3. Per-Biome Presets

Each preset's `baseColor`/`tipColor` is chosen to read as a natural tint of that biome's ground
texture (not the same hue, since blades should read as distinct vegetation, but the same
lightness/warmth family so it doesn't look pasted-on); density/height follow each biome's
real-world groundcover character. Savanna and tundra reuse the `procedural-grass-threejs`
skill's own authored presets directly (already tuned for exactly this look); forest and taiga
have no ready-made preset in that reference material, so their values are new, derived from the
same logic the skill applies elsewhere (shorter+sparser for shade-blocked/harsh biomes) and
cross-checked against each biome's ground color above.

| Biome | segments | width | height | curvature | density/unit² | baseColor | tipColor | dryAmount | windBase | windGust | windGustFreq | maxBlades |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grassland *(batch 1, unchanged)* | 4 | 0.06 | 0.9 | 0.28 | 35 | `0x3a7d2c` | `0x8bbf40` | 0 | 0.4 | 0.8 | 0.3 | 100,000 |
| savanna | 4 | 0.05 | 0.8 | 0.2 | 15 | `0x9b8b4a` | `0xd4c078` | 0.6 | 0.3 | 0.5 | 0.3 | 44,000 |
| tundra | 2 | 0.04 | 0.2 | 0.05 | 25 | `0x6b7d4a` | `0x8b9d5a` | 0.3 | 0.6 | 1.2 | 0.3 | 72,000 |
| forest | 4 | 0.05 | 0.6 | 0.22 | 12 | `0x2e4a22` | `0x5a7d3a` | 0.1 | 0.25 | 0.4 | 0.25 | 35,000 |
| taiga | 3 | 0.04 | 0.35 | 0.15 | 8 | `0x2f3d2c` | `0x4a5d42` | 0.15 | 0.2 | 0.35 | 0.25 | 24,000 |

All 5 presets share the same `dryColor` (`0xc4a84b`, batch 1's existing "straw" tint) — only
`dryAmount` (how visible that tint is) varies per biome; a distinct dry-tint hue per biome isn't
worth the added tuning surface for a secondary variation effect.

- **Savanna**: sparse, dry, sun-bleached — the skill's own `savanna` preset values verbatim
  (including `windBase`/`windGust`). `dryAmount: 0.6` (high) gives visible tan/gold dryness
  variation matching the arid ground tone.
- **Tundra**: very short (`height: 0.2`), low-segment (2 — barely-curved stubby blades, cheapest
  to render), moderate density (hardy groundcover can form fairly continuous low mats even in a
  harsh climate), and the strongest wind response of any preset (`windBase: 0.6`,
  `windGust: 1.2`) — the skill's own `tundra` preset values verbatim, reflecting how exposed,
  treeless tundra is typically the windiest of these biomes.
- **Forest**: shorter and noticeably sparser than grassland (`density: 12` vs `35`) — canopy
  shade limits undergrowth, and forest tiles already carry the heaviest tree-scatter load in this
  game, so keeping forest floor grass light avoids compounding visual/GPU cost on already-busy
  tiles. Dark, cool-toned color family tied to the forest ground texture's `#3e5a2c`. Low
  `dryAmount` (0.1) — forest floors don't dry out as visibly as open grassland/savanna. Calmer
  wind (`windBase: 0.25`, `windGust: 0.4`) than open grassland — a forest canopy blocks most
  direct wind from reaching floor-level undergrowth.
- **Taiga**: the sparsest and shortest of all four (`density: 8`, `height: 0.35`) — coniferous
  floor is dominated by needle-litter/moss, with only sparse grass/sedge tufts, matching real
  taiga groundcover and this game's darkest, most saturated-shade ground texture (`#374a34`). The
  calmest wind of all 5 presets (`windBase: 0.2`, `windGust: 0.35`) — the densest, most sheltered
  canopy of any of these biomes.

**`maxBlades` sizing** (new — batch 1's flat `100_000` was sized specifically for grassland's
density): `ceil(2304 * densityPerUnit2 * 1.25)`, rounded up to a clean thousand, where `2304` is
the worst-case fully-covered 48×48 WU window area and `1.25` matches batch 1's own headroom
ratio. This keeps each biome's GPU buffer allocation (`Float32Array(maxBlades * 4)` × 2 buffers)
proportional to what that biome could realistically place, instead of over-allocating ~4× more
memory than sparse biomes (taiga, forest) will ever use.

## 4. `selectGrassPlacements()` and `GrassField` — Add a `biome` Parameter

```ts
export function selectGrassPlacements(
  wg: WorldGrid, centerX: number, centerZ: number, radius: number, seed: number,
  biome: BiomeId,   // NEW — was hardcoded to 'grassland'
): GrassPlacement[]
```

`GrassField`'s constructor gains a `preset: GrassPreset` parameter (replacing the module-level
`BLADE_SEGMENTS`/`BLADE_WIDTH`/etc. constants and `createGrassMaterial()`'s fixed uniform
values), and passes `preset.biome` through to `selectGrassPlacements()` and `preset.maxBlades`
in place of the hardcoded `GrassField.MAX_BLADES`. `createGrassBladeGeometry()` and
`createGrassMaterial()` both already accept their tuning as function parameters (batch 1 already
designed them this way for exactly this reason) — this batch just threads a `GrassPreset` object
through instead of separate positional args, and removes the module-scope hardcoded defaults in
favor of a `GRASS_PRESETS: Record<'grassland'|'savanna'|'forest'|'taiga'|'tundra', GrassPreset>`
lookup table (mirroring Phase 5's `BIOME_AFFINITY` table pattern) that `OverworldScene.ts`
iterates over to build its 5 `GrassField` instances.

**Note on the fade radius/hysteresis:** `GRASS_RADIUS` (24 WU) and `REBUILD_HYSTERESIS` (8 WU)
stay biome-agnostic module constants, shared by all 5 fields — differentiating them per biome
would add tuning surface with no clear player-facing benefit (the placement *radius* isn't a
visual-density knob, density already is), so this is a deliberate YAGNI call, not an oversight.

## 5. `OverworldScene.ts` Wiring

```ts
private _grassFields!: GrassField[]; // one per entry in GRASS_PRESETS, built in the constructor
```

Constructor: `this._grassFields = Object.values(GRASS_PRESETS).map(p => new GrassField(this._wg, this._seed, p));`
`enter()`/`exit()`: loop `for (const gf of this._grassFields) this.scene.add/remove(gf.mesh);`
`update()`: loop calling `gf.update(pos.x, pos.z)` and `gf.tickWind(dt)` for each field.
`dispose()`: loop calling `gf.dispose()`.

`getGrassDebugInfo()` (the existing test/dev hook) is extended to report per-biome blade counts
(`Record<BiomeId, number>`) instead of a single `bladeCount`, so the e2e verification spec can
assert each new biome actually placed blades independently — a stronger regression guard than
just checking a combined total.

## 6. Testing

- **`GRASS_PRESETS` table**: a lightweight test asserting all 5 expected biome keys are present,
  each with `densityPerUnit2 > 0` and `maxBlades` matching the `ceil(2304*density*1.25)` formula
  (rounded to the nearest thousand) from §3.
- **`selectGrassPlacements(..., biome)`**: extend the existing grassland-only test suite to
  parametrize over all 5 biomes — a window of one biome's cells produces placements when queried
  with that biome, and zero placements when queried with any *other* biome (no cross-biome
  bleed) — this is the direct regression guard for the new `biome` parameter actually filtering.
- **`GrassField` with a non-grassland preset**: re-run batch 1's existing `GrassField` behavioral
  tests (places blades on first `update()`, rebuild-hysteresis, fade-center tracking, `tickWind`,
  `dispose`) parametrized against at least one new preset (e.g. `tundra`) to confirm the
  generalization didn't silently keep any grassland-specific hardcoding.
- **`createGrassMaterial(preset)`**: confirm the returned material's uniforms reflect the passed
  preset's colors (e.g. `uBaseColor.value` equals the savanna preset's tan, not grassland's
  green) — catches an accidental "preset ignored, defaults used" regression.
- **`OverworldScene` wiring**: extend `OverworldScene.drawcall-batching.test.ts`'s existing
  mesh-count assertion context (already watches for exactly this class of regression) to confirm
  going from 1 to 5 `GrassField` instances only adds +4 to the scene's mesh count, not something
  larger — and re-run the full existing `OverworldScene.*.test.ts` suite for regressions.
- **e2e verification**: extend `tests/e2e/procedural-grass.spec.ts` (or add a sibling spec) with
  a per-biome check — find one tile of each of the 4 new biomes (extending `findFirstGrasslandTile()`'s
  pattern to a generic `findFirstBiomeTile(biome)`), teleport there, confirm that specific
  biome's `GrassField` placed blades and all others didn't, with zero console/page errors.

## 7. Explicitly Out of Scope (This Batch)

- Any further biome expansion beyond the roadmap's 5 grass-bearing biomes (desert/beach/
  ocean/snow/mountain correctly stay grass-free).
- Interactive push-displacement, multi-ring geometry LOD, WebGPU/TSL — unchanged from batch 1's
  own out-of-scope list; none of that changes by adding more biome presets.
- Per-biome fade radius/rebuild-hysteresis tuning (see §4's YAGNI note) — one shared radius/
  hysteresis for all 5 fields.
- Seasonal color transitions or any runtime `dryAmount` animation — presets set a fixed
  `dryAmount` per biome, matching batch 1's static `dryAmount: 0` precedent for grassland.
