# Design: Nature Asset Biome Correctness (Biome/Terrain Overhaul Phase 7, partial)

Status: approved for implementation
Roadmap: `docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md` (Phase 7 — "Nature asset
variety per biome")

## 1. Problem statement

`NatureAssetDNA.ts`'s `pickTreeArchetype(wx, wz)`/`pickRockArchetype(wx, wz)` select an
archetype purely from a deterministic position hash — no biome input at all, even though
`cell.biome` is already available at both call sites (`OverworldScene._buildChunkScatter()`).
This means a "conifer" (pine-style) and "deciduous" (broadleaf) tree can land right next to
each other regardless of biome — a pine forest tree next to an oak-style tree next to (if the
world happened to place a desert cell nearby) another pine tree, all by pure chance. Deserts and
savannas in particular get whichever of the 3 existing archetypes the position hash happens to
pick, none of which read as remotely correct for those biomes.

Separately (discovered while investigating): `ScatterRules.ts`'s `isScatterAllowed()` only
excludes `ocean`/`deep_ocean` **biome** tiles from tree/rock/bush placement — it never checks
`waterDepth > 0`, so a river or lake tile (which sits on an ordinary land biome, not a special
water biome, since Phase 3) is not excluded. Trees/rocks/bushes can currently spawn directly on
top of a river or lake.

## 2. Scope

- Give trees real per-biome archetype **selection** (which of the existing 3 archetypes, plus 2
  new ones, a biome is allowed to pick from) — closing the "biome look mismatch" complaint.
- Add exactly 2 new tree archetypes, matching the roadmap's own note that new geometry should be
  "prioritized for the biomes that read most wrong today" — `cactus` (desert) and `acacia`
  (savanna, a wide flat-canopy silhouette), both built with the same simple primitive-combination
  style as the existing 3 archetypes (no new asset pipeline).
- Fix `isScatterAllowed()` to also exclude `waterDepth > 0` tiles, closing the river/lake
  scatter-placement gap found during investigation.

**Explicitly out of scope for this pass:**
- Rock archetype biome-differentiation. A boulder/slab/cluster rock pile doesn't read as "wrong"
  in any biome the way a pine tree does in a desert — `pickRockArchetype()` stays
  position-hash-only, unchanged.
- Bush archetype variety (bushes currently have no archetype concept at all — a single visual
  style; adding bush archetypes is a separate, smaller follow-on not requested here).
- Grass clumps. The roadmap's own note about a "2-variant (short/tall) grass clump" system refers
  to `tile-designer.md`'s Studio-only `TileDNA`/`TileBuilder` system, which is not wired into the
  live game at all today (confirmed — no `grass clump`/similar scatter kind exists in
  `OverworldScene.ts`). Wiring a whole new live scatter category is a larger, separate effort.
- Snow/tundra/beach/ocean tree archetype tuning beyond reusing the existing `sparse` archetype —
  these biomes place few or no trees today (beach/ocean excluded by `isScatterAllowed` entirely;
  snow/tundra are cold, sparse biomes where reusing `sparse` already reads correctly without new
  geometry).

## 3. Architecture

### 3.1 `NatureAssetDNA.ts` changes

`TreeArchetype` gains 2 new values: `'conifer' | 'deciduous' | 'sparse' | 'cactus' | 'acacia'`.

New per-biome archetype table (a `Record<BiomeId, readonly TreeArchetype[]>`), each biome
listing which archetypes it may pick from (more than one where mixed variety is correct, exactly
one where a biome should look uniform):

- `grassland`: `['deciduous', 'sparse']` — mixed light woodland, matches the existing default look.
- `forest`: `['conifer', 'deciduous']` — mixed forest (unchanged visual mix from today).
- `taiga`: `['conifer']` — dense conifer-only, per the roadmap's "dense conifer" note.
- `tundra`: `['sparse']` — sparse bare, per the roadmap's "sparse bare/frost-crusted" note.
- `mountain`: `['sparse']` — sparse alpine scrub, per the roadmap's note.
- `snow`: `['sparse']` — cold and sparse, same reasoning as tundra.
- `desert`: `['cactus']` — the new archetype; closes the roadmap's most-cited gap.
- `savanna`: `['acacia']` — the new archetype; closes the roadmap's second-most-cited gap.
- `beach`, `ocean`, `deep_ocean`: `['sparse']` — never actually reached in practice
  (`isScatterAllowed()` already excludes trees from these biomes entirely), included only so the
  table is total over `BiomeId` and the function never needs an unsafe fallback.

`pickTreeArchetype(biome: BiomeId, wx: number, wz: number): TreeArchetype` — looks up the
biome's archetype list, then picks within it via the existing `hashIndex()` technique
(deterministic, same position always yields the same archetype for a given biome; a different
biome at the same position yields a different archetype where the two biomes' sets differ).

`pickRockArchetype(wx, wz)` is unchanged (no signature change, no behavior change).

### 3.2 New tree archetypes (`OverworldScene.ts`)

Both follow the exact same style as the existing 3 builders (`_buildConiferTree()` etc.): a
`THREE.Group` of simple primitive meshes, `_pooledMaterial()` for shared/cached materials with a
handful of color variants, dimensions randomized within a range via the passed-in `rand()`.

- `_buildCactusTree(rand)`: a vertical cylinder "trunk" (green-toned material) plus 0-2 shorter
  vertical cylinder "arms" offset to either side partway up the trunk — a simple saguaro-style
  silhouette using only cylinder primitives, no new geometry types.
- `_buildAcaciaTree(rand)`: a short, thin trunk topped by a single wide, shallow cone (much wider
  than tall) — a flat "umbrella canopy" silhouette, distinct from conifer's tall narrow cone
  stack and deciduous's rounded lumpy canopy.

`_makeTree(rand, biome, wx, wz)` gains a `biome: BiomeId` parameter (threaded from
`_buildChunkScatter()`'s already-available `cell.biome`), passes it to `pickTreeArchetype()`,
and dispatches to the 2 new builders alongside the existing 3.

### 3.3 `ScatterRules.ts` fix

`isScatterAllowed()` gains a `cell.waterDepth > 0` check alongside the existing
`ocean`/`deep_ocean` biome check, for all kinds (tree/bush/rock) — a river or lake tile is
excluded from scatter placement exactly like an ocean tile already is, regardless of which
ordinary land biome it happens to sit on.

## 4. Testing strategy

- `tests/world/NatureAssetDNA.test.ts`: update `pickTreeArchetype` tests for the new `(biome,
  wx, wz)` signature — determinism per biome, "only picks from that biome's own allowed set"
  (the key new correctness property), "different biome at the same position can yield a
  different archetype where the sets differ". `pickRockArchetype` tests unchanged.
- `tests/world/ScatterRules.test.ts` (check if this file exists; if not, add a new one following
  the file's existing doc-comment conventions): a river/lake tile (`waterDepth > 0`, ordinary
  land biome) is excluded from tree/bush/rock placement, mirroring the existing ocean-exclusion
  test.
- Manual/live verification: generate a world, visually confirm desert shows cacti (not pines),
  savanna shows acacia-style trees, taiga reads as uniformly conifer, and no trees appear inside
  visible rivers/lakes. Same Playwright + dev server fallback discipline as every prior phase.

## 5. Non-goals / explicitly deferred

See §2's "explicitly out of scope" list — rock/bush archetype variety, grass clumps, and further
snow/tundra/beach tree tuning are all deferred, not silently dropped.
