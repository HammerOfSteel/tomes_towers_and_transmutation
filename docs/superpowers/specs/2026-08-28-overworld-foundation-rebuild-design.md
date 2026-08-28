# Overworld Foundation Rebuild — Design Spec

> Sub-project 1 of 3 in the "rework the live overworld around Overworld
> Studio" initiative (see chat history / TODO/02-game-world-integration/
> STUDIO-LIVE-PARITY.md for the other two: settlement/road placement
> rebuild, and biome asset diversity — each gets its own spec/plan later).

## Why

Playtesting the just-merged settlement/interior polish branch surfaced two
symptoms:
1. Very low framerate in the live overworld — effectively unplayable.
2. Walking into a generated settlement showed **no buildings at all**.

Root-cause investigation (see chat history) found these aren't isolated
bugs — they're symptoms of the live overworld's actual architecture never
having been finished per the Studio↔live parity roadmap
(`STUDIO-LIVE-PARITY.md`, `TODO/02-game-world-integration/realm-integration.md`
RI-4):

- **`OverworldScene.ts` builds the entire world grid eagerly** on scene
  entry (double for-loops over every one of 128×128 or 256×256 cells,
  building individual meshes with no LOD). `ChunkManager.ts` — a generic,
  tested, chunk load/unload tracker built specifically for this (RI-4) —
  was **never wired into the scene**. This is the direct cause of symptom 1.
- **The live world is a lossy-resampled copy of Studio's realm map.**
  `RealmToWorldGrid.ts` nearest-neighbor-stretches Studio's 96×72 realm
  cells onto a 128×128 (or 256×256) `WorldGrid` — the live world is a
  blurry downscale of what Studio actually designed, not a native
  rendering of it.
- **Biome taxonomy is collapsed 10→6** on the way in
  (`REALM_BIOME_TO_WORLD_BIOME`), throwing away desert/savanna/tundra/snow
  distinctness that Studio's realm generator produces.
- Symptom 2 (empty settlement) is very likely a knock-on effect of the
  small resampled grid combined with this branch's road-widening fix
  crowding out building placement — but that logic (settlement/road
  placement) is explicitly **out of scope for this sub-project** and will
  be properly re-examined in sub-project 2, once it's running on top of a
  correctly-sized, chunked, native-resolution world instead of the old one.

## Goal

Replace the live overworld's terrain/biome/streaming foundation so that:
- The world the player walks through is a native-resolution rendering of
  Studio's actual realm generator output — not a downsampled copy — at a
  size that can plausibly hold Studio-realm-scale settlements with real
  distance between them.
- Only nearby chunks are ever built into meshes; the game does not pay
  rendering cost for the whole world at once.
- All 10 of Studio's biomes are visually distinct in the live game.

Explicitly **not** this sub-project's job: settlement/road placement logic
(sub-project 2), tree/rock/ground-texture asset variety per biome
(sub-project 3). Both will run on top of this sub-project's output, mostly
unchanged in this pass except where the data shape they read (`WorldGrid`)
changes.

## Approaches considered

1. **Full rewrite from zero.** Rejected — `RealmToTerrain.ts`,
   `RealmRiverMesh.ts`, and `ChunkManager.ts` already exist, are pure,
   unit-tested, and were purpose-built for this exact job (RI-1/RI-3/RI-4).
   Discarding them wastes real, correct, working code.
2. **Patch the current pipeline in place** (e.g. just add some
   `InstancedMesh`/LOD calls to the existing eager-build loop). Rejected —
   the actual defects (eager whole-grid build, lossy resample, collapsed
   biomes) are structural. Patching around them either doesn't fix the
   framerate problem (still building everything, just cheaper per-item) or
   requires so much surgery it becomes a rewrite anyway.
3. **Rewire onto the already-built Studio-native modules, replacing the
   old `WorldGenerator.ts`/lossy-resample path.** ✅ Chosen. Reuses correct
   existing work, directly targets the two reported symptoms, and keeps
   the change bounded (data source + one renderer's build strategy, not
   every consumer of `WorldGrid`).

## Design

### 1. Native-resolution realm generation (replaces lossy resampling)

`generateRealmData(seed, W, H, nSettlements, shape, climate, roughness)`
already accepts arbitrary `W`/`H` (`src/world/RealmGenerator.ts:53`) — the
96×72 default is just Studio's own preview convenience, not a hard limit.

Instead of always generating at 96×72 and nearest-neighbor-stretching the
result onto `WorldGrid`'s shape (`RealmToWorldGrid.ts`'s current
behaviour), `WorldGenerator.buildWorldGrid()` will call
`generateRealmData(seed, worldSize, worldSize, ...)` directly — one realm
cell per world tile, no resampling step, no stretch artifacts. This makes
`RealmToWorldGrid.ts`'s `sampleRealmCell()`/nearest-neighbor logic dead
code to remove; the rest of the file (biome mapping, elevation
quantization, ocean depth tiering) stays and operates 1:1 per cell instead
of per-resampled-cell.

**Determinism/perf check required before this ships:** confirm
`generateRealmData` at the new larger `W`×`H` (see size decision below)
still generates in an acceptable one-time cost (target: under ~2s at
worldgen time, this runs once at world creation, not per frame) and that
its Simplex-noise-based algorithm doesn't produce visibly different
macro-structure at higher resolution than Studio's preview shows at 96×72
(same seed, same shape function — only sampling density changes, so
macro-shape should hold; verify with a determinism/visual-consistency test
rather than assuming).

### 2. Full 10-value biome fidelity

`WorldGrid`'s `BiomeId` (`src/world/WorldGrid.ts:9`) widens from:
```ts
type BiomeId = 'bog' | 'grass' | 'forest' | 'highland' | 'rocky' | 'water' | 'sand';
```
to carry all 10 of Studio's `RealmBiome` values used in
`overworld-studio.ts:2628`:
```ts
type BiomeId =
  | 'deep_ocean' | 'ocean' | 'beach'
  | 'desert' | 'savanna' | 'grassland'
  | 'forest' | 'taiga'
  | 'tundra' | 'snow';
```
(Renaming rather than keeping the old 6 alongside new ones — every
existing consumer already switches on specific `BiomeId` string literals,
so this is a mechanical widen-and-update, not a parallel taxonomy.)

Consumers requiring updates (grepped, bounded list):
- `RealmToWorldGrid.ts` — `REALM_BIOME_TO_WORLD_BIOME` mapping table
  becomes the identity mapping (Studio's `RealmBiome` and `WorldGrid`'s
  `BiomeId` become the same 10 values) — table can be deleted entirely,
  one less indirection.
- `ScatterRules.ts` — `cell.biome === 'water'` / `'sand'` checks become
  `cell.biome === 'deep_ocean' || cell.biome === 'ocean'` /
  `cell.biome === 'beach'`.
- `TerrainGeometryBuilder.ts` — same water/sand checks, same fix.
- `OverworldScene.ts` — the handful of `cell.biome === 'water'`/`'sand'`
  checks (river/water mesh gathering, sand-tile gathering, tree biome
  tagging, cave-entrance biome lookup) get the same treatment.
- `SettlementGenerator.ts`/`SettlementPlacer.ts`/`DungeonPlacer.ts`/
  `CaveGladeWorldPlacer.ts`/`RoadGenerator.ts`/`HydrologyGenerator.ts` — all
  currently check `cell.biome === 'water'` for passability; same
  water-set-widening fix, otherwise untouched (their placement *logic*
  is sub-project 2/3 territory, not this one — this pass only touches the
  literal string comparisons needed to keep them correct against the wider
  enum).
- `RealmToTerrain.ts`'s `BIOME_TILE_MAP` already maps all 10 `RealmBiome`
  values to `TileDNA` variants (RI-2 already shipped this) — no change
  needed there, but this sub-project is what finally makes that mapping
  reachable from the live scene instead of only Studio's preview.

### 3. Chunked streaming renderer (the framerate fix)

Wire the existing `ChunkManager<T>` (`src/world/ChunkManager.ts`,
`CHUNK_SIZE=16` tiles, `LOAD_RADIUS_CHUNKS=3`, `UNLOAD_RADIUS_CHUNKS=5` —
already-tuned constants, kept as-is) into `OverworldScene.ts`:

- A new `TerrainChunkBuilder` module (name TBD in plan) takes a
  `WorldGrid` slice for one chunk's `(col, row)` range and returns a
  `THREE.Group` — terrain tiles (via `buildTile()` from
  `TileDNA`/`RealmToTerrain.ts`'s per-cell mapping), scatter props
  (trees/rocks — same eligibility rules as today via `ScatterRules.ts`,
  just evaluated per-chunk-on-load instead of globally-on-scene-enter),
  and any buildings whose tile falls in this chunk.
- `OverworldScene`'s per-frame update calls
  `chunkManager.update(player.x, player.z)`; the injected `load(coord)`
  builds and `scene.add()`s that chunk's group, `unload(coord, group)`
  calls `scene.remove(group)` and disposes every geometry/material/texture
  in it (per `performance.md`'s GP-4 dispose checklist — this sub-project
  is also where that checklist item gets its first real exercise, since
  today nothing is ever unloaded).
- River/water meshes, lamp posts, and settlement road tiles currently
  built as one giant scene-wide `InstancedMesh`/group in
  `_buildSettlements()`/water-mesh-gathering code move to being built
  per-chunk alongside terrain, for the same reason.
- Buildings keep using `buildBuilding(dna)` per-instance as today (no
  change to building construction) — only *when* they're constructed
  (on chunk load vs. eagerly) changes.
- `THREE.LOD` for buildings/trees (`performance.md` GP-3) is a reasonable
  follow-on but is **not required to close symptom 1** — chunking alone
  (not building the ~95% of the world the player isn't near) is the
  primary fix. Tracked as a stretch task in the plan, not a blocking one.

### 4. World size

`WorldGenConfig.worldSize` (`src/world/WorldGenConfig.ts:9`,
`type WorldSize = 128 | 256`) gains a new `512` tier, and the default
becomes `512` (`DEFAULT_WORLD_GEN_CONFIG.worldSize`). Chunking (item 3)
is what makes this affordable — without it, 512×512 would be catastrophic
for the exact reason 128×128/256×256 already are (symptom 1). `768`/`1024`
are left as easy follow-on tiers once 512 is proven out, rather than
jumping straight to the largest number that might work — this keeps the
generation-time/visual-consistency check in item 1 tractable to validate
first.

### 5. What does not change in this sub-project

- `WorldGrid`'s cell shape (`elevation`, `feature`, `content`, `dungeonId`,
  `buildingId`, `settlementId`, `walkable`, `waterDepth`) is unchanged —
  only `biome`'s allowed values widen. Every non-biome consumer keeps
  working unmodified.
- Settlement/road placement algorithm (`SettlementPlacer.ts`,
  `SettlementGenerator.ts`) is unchanged in this pass beyond the
  mechanical biome-string-widening fix in item 2. The "no buildings in the
  settlement I visited" report will be re-investigated fresh in
  sub-project 2, against the new correctly-sized/chunked world — it may
  simply not reproduce once settlements aren't fighting for space in a
  lossy-resampled small grid, but that's a hypothesis to verify, not an
  assumption to build on.
- Tree/rock/ground-texture variety per biome (sub-project 3) — this pass
  only makes the 10 biomes *addressable*; populating them with diverse
  assets is separate work.
- Dungeon/cave/glade placement logic — unaffected beyond the same
  biome-string-widening mechanical fix.

## Testing approach

- Unit tests (existing pattern, `tests/world/*.test.ts`): `RealmToWorldGrid`
  determinism now covers native-resolution generation (no more resample
  step to test — instead test that a given seed + worldSize always
  produces the same grid); biome-mapping completeness test asserts all 10
  `RealmBiome` values map to valid `WorldGrid` `BiomeId`s (should be the
  identity function once the mapping table is removed — test guards
  against someone re-introducing a lossy mapping); `ChunkManager`
  wiring tested via a scene-level integration test asserting chunk
  load/unload actually adds/removes THREE objects from the scene graph
  and disposal is called (extends the existing pure `ChunkManager.test.ts`
  which only tested the tracker's bookkeeping, not real wiring).
- Manual/Playwright playtest: walk from spawn toward a distant settlement,
  confirm chunks load/unload as expected (no pop-in worse than today,
  memory doesn't grow unbounded — heap snapshot before/after a few
  minutes of walking per `performance.md` GP-4), confirm framerate is
  materially improved (rough before/after frame-time comparison via
  `renderer.info`), confirm all 10 biomes are visually distinguishable in
  a single playthrough across a couple of seeds.
- Regression: full existing suite must stay green (same pre-existing
  failure baseline as documented in the previous branch's work).

## Open questions carried into the plan (not blocking design approval, but explicit)

- Exact new `TerrainChunkBuilder` module name/location and whether scatter
  prop placement needs its own seeded-per-chunk determinism test (almost
  certainly yes — will be a plan task, not a design question).
- Whether `generateRealmData` at 512×512 needs a performance guard test
  added to `performance.md`'s GP-6 test list, or whether the existing
  perf budget items already cover it — will confirm empirically once the
  change lands and decide in the plan.
