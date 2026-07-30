# Realm/Terrain Unification (P0) — Design

> Part of the Studio↔live-game parity work. See
> `TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md` for the full audit
> and sequencing (this is P0 — the foundation everything else in that
> roadmap depends on).

## Goal & scope

When a player enters the overworld for seed `S`, the terrain (land/water,
elevation, biome layout) must match what seed `S` produces in Overworld
Studio's realm-map preview. Today it doesn't: `buildWorldGrid()`
(`src/world/WorldGenerator.ts`) runs its own independent FBM-noise
algorithm, completely unrelated to `generateRealmData()`
(`src/overworld-studio.ts`).

**In scope for this slice:** elevation + biome terrain layout only.

**Explicitly out of scope** (documented follow-up work, not silently
dropped):
- River generation — `HydrologyGenerator.ts`'s existing algorithm keeps
  running as-is. True parity (rasterizing `RealmData.rivers[]` onto the
  grid) is its own chunk of work, tracked as a follow-up under P0 in
  `STUDIO-LIVE-PARITY.md`.
- Settlement/dungeon/cave *placement* algorithms — `SettlementPlacer.ts`,
  `DungeonPlacer.ts`, `CaveGladeWorldPlacer.ts` are unchanged; they keep
  placing entities using their existing Poisson-disk approach, just against
  realm-derived terrain instead of FBM terrain. Their own unification with
  Studio's placement is P1/P3.
- Full biome-taxonomy fidelity — Studio's 10 `RealmBiome` values are mapped
  down to `WorldGrid`'s existing `BiomeId` enum (6 values; some flavor is
  lost: e.g. "desert" and "grassland" both become `grass`). A future phase
  could migrate `WorldGrid` to the full 10-value taxonomy; not done here to
  keep this slice's blast radius small.

## Architecture

Three pieces:

1. **`src/world/RealmGenerator.ts`** (new, pure, no DOM coupling) —
   `generateRealmData()`'s implementation is extracted here verbatim from
   `overworld-studio.ts`. `overworld-studio.ts` imports and re-exports it
   from this new location so existing Studio callers/tests are unaffected.
   This is what makes it possible for the live game to call the *same*
   function Studio uses, rather than a DOM-coupled module.

2. **`src/world/RealmToWorldGrid.ts`** (new, pure) —
   `realmToWorldGrid(realm: RealmData, worldSize: WorldSize): WorldGrid`.
   Resamples the realm's `cells[][]` onto a `WorldGrid` of the requested
   size:
   - **Resampling:** nearest-neighbor lookup. For target `WorldGrid`
     position `(col, row)`, sample realm cell at
     `(floor(col / worldSize * realm.W), floor(row / worldSize * realm.H))`.
     Simple and deterministic; realm dimensions (96×72 by default) and
     `worldSize` (128 or 256, always square) don't match, so some
     stretching is unavoidable and acceptable for this slice.
   - **Biome mapping** (10 realm biomes → `WorldGrid`'s `BiomeId`, which is
     `'bog' | 'grass' | 'forest' | 'highland' | 'rocky' | 'water'` — note
     `'water'` already exists in the type and is actively checked by
     `DungeonPlacer.ts`, `SettlementPlacer.ts`, `RoadGenerator.ts`,
     `SettlementGenerator.ts`, and `TerrainGeometryBuilder.ts` to avoid
     placing things in the ocean / render it differently; today's FBM
     generator simply never produces it, so nothing has ever generated
     ocean. Mapping realm oceans to `'water'` — rather than collapsing them
     into `'bog'` — means those existing checks start working correctly
     for the first time instead of silently never triggering):

     | Realm biome | → WorldGrid biome |
     |---|---|
     | `deep_ocean`, `ocean` | `water` |
     | `beach` | `grass` |
     | `desert`, `savanna`, `grassland` | `grass` |
     | `forest`, `taiga` | `forest` |
     | `tundra` | `highland` |
     | `snow` | `rocky` |

   - **Elevation quantization:** realm `elevation` is continuous (0–1).
     Quantize into `WorldGrid`'s existing 0–4 levels via
     `clamp(floor(elevation * 5), 0, 4)`.

3. **`buildWorldGrid(seed, config)`** (`WorldGenerator.ts`, modified) —
   internals change from "run FBM noise directly" to:
   ```
   const realm = generateRealmData(seed, ...dimensions derived from config...);
   const grid  = realmToWorldGrid(realm, config.worldSize);
   // existing tower flat-zone + rim-bias post-processing still applied here,
   // directly on the resampled grid — unchanged from today's behavior.
   generateHydrology(grid, config, seed); // unchanged, out of scope
   return grid;
   ```
   The function's external signature and return type (`WorldGrid`) are
   unchanged, so `buildWorldData()`, `main.ts`, and `BlueprintLayer.ts`
   need zero changes.

   **Tower flat-zone is kept as post-processing, not removed.** Realm data
   has no guarantee of flat, buildable land at the live game's tower
   position — the existing flatness/rim-bias math (which forces a flat
   zone near grid center and raises elevation near the rim) is a gameplay
   requirement, independent of fidelity to Studio's preview, and stays
   exactly as it works today, just applied on top of the resampled
   elevation instead of raw FBM elevation.

## Data flow

```
generateRealmData(seed) ──► RealmData (cells, biomes, elevation)
                                  │
                                  ▼
                      realmToWorldGrid(realm, worldSize)
                                  │
                                  ▼
                          WorldGrid (biome, elevation)
                                  │
                    tower flat-zone / rim-bias post-process (unchanged)
                                  │
                                  ▼
                      generateHydrology (unchanged, out of scope)
                                  │
                                  ▼
                         buildWorldGrid() returns WorldGrid
                                  │
                    (buildWorldData, placeDungeons, placeSettlements,
                     placeCavesAndGlades — all unchanged, consume WorldGrid
                     exactly as they do today)
```

## Error handling / edge cases

- Realm dimensions of 0 or negative (shouldn't happen given
  `generateRealmData`'s existing defaults, but guard anyway) — resampling
  falls back to `(0, 0)` lookup rather than dividing by zero.
- `worldSize` smaller than realm dimensions (down-sampling) and larger
  (up-sampling) both handled by the same nearest-neighbor formula — no
  special-casing needed.

## Testing

- **`tests/world/RealmGenerator.test.ts`** (new) — confirms the extracted
  `generateRealmData()` produces identical output to its pre-extraction
  behavior (determinism, existing Studio test coverage should still pass
  unchanged since it's a pure move).
- **`tests/world/RealmToWorldGrid.test.ts`** (new) — biome mapping table
  correctness (every `RealmBiome` maps to a valid `WorldGrid` biome),
  elevation quantization boundaries (0, 0.2, 0.4, ..., 1.0 map to the
  correct 0–4 levels), resampling correctness at a few worldSize/realm-size
  ratios (128 vs 96×72, 256 vs 96×72), determinism (same seed twice →
  identical grid).
- **Existing tests** (`WorldGenerator.test.ts` if present,
  `DungeonPlacer.test.ts`, `CaveGladeWorldPlacer.test.ts`,
  `overworld.startup.smoke.test.ts`) — re-run as regression checks. None of
  them assert exact biome/elevation values (confirmed: they check
  determinism and structural validity, not snapshotted terrain data), so
  they should pass unchanged against the new terrain source.
- **Manual live verification:** generate the same seed in Studio's realm
  tab and in a fresh in-game overworld; confirm land/water/mountain layout
  visually corresponds (not pixel-identical, given resampling, but
  recognizably the same coastline/mountain shapes).

## Follow-ups (not this slice, tracked in STUDIO-LIVE-PARITY.md)

- River rasterization for true river-shape parity.
- Full 10-value biome taxonomy migration (retiring the lossy 5-value map).
- P1 (Settlement unification) and P3 (Cave/Glade unification), which build
  on this slice's realm-derived terrain.
