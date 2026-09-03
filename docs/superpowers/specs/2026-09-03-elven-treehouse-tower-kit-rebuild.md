# Elven living-tree home — rebuild on the stone-tower kit's real block-course construction

Status: user feedback after seeing the living-tree home kit-of-parts round live: "these are
nice designs but we dont go with that old block design... We have the brick foundation now
remember? So more in style with the tower for building the structure but I like you effort
and idea for the general design. Just lets keep working with that nice brick work the tower
uses." This is a **construction-technique swap, not a design change** — the windows/entrance-
style/floor/canopy-variety *feature set* from the previous round stays; only *how the walls,
windows, entrance, and floor rings are physically built* changes, from `BlockKit`'s voxel-
occupancy grid to the same real-per-course-block/carved-recessed-opening technique already
proven and approved on the elven stone-tower kit. No fresh research pass is needed — the
technique is already researched, built, tested, and explicitly liked by the user; this is a
reuse/adaptation task.

## What's wrong with the current approach (per the feedback)

`buildElvenVilla()` (last round) builds the entire trunk — walls, windows, door, floors — as
one `BlockKit` occupancy grid: a heightfield of small `BLOCK_UNIT` cubes, with openings carved
by *removing* grid cells. This reads as visibly different (chunkier, more voxel-like) from the
stone tower's `StoneTowerWallSurface.ts` "Strategy G" wall (individual real, slightly-jittered,
protruding `BoxGeometry` blocks in running-bond coursing around an octagon cross-section) and
`StoneTowerOpenings.ts`'s carved-recessed-arch technique (a proud stone frame around a
genuinely receded dark cavity via `ExtrudeGeometry`). The user wants the house's *construction
method* unified with the tower's, not a second divergent technique.

## Reuse plan — the stone-tower kit is already almost entirely composable

Auditing `StoneTowerKit.ts` and its sibling files, nearly every piece the tower already ships
is generic enough to reuse directly for a residential building, just with a wood/bark palette
instead of stone:

| Piece | Reuse plan |
|---|---|
| `StoneTowerShape.ts` (octagon math) | Used as-is (already shape-agnostic). |
| `StoneTowerWallSurface.ts`'s `buildWallSurfaceBlocks` (Strategy G) | Used as-is — takes any `THREE.Material`, so passing a bark-textured wood material gives genuine real-block "log course" walls. |
| `StoneTowerWindows.ts` / `StoneTowerEntrance.ts` | Used as-is — both are palette-driven (`StoneTowerPalette.stone`/`.moonstone`), no stone-specific geometry. |
| `StoneTowerQuoins.ts` | Used as-is — reinterpreted as corner "growth ridges" rather than stone pilasters (same geometry, different material/context). |
| `buildTowerBase()` (root tendrils + rock + entrance + quoins) | Used as-is, unmodified — its root-tendril decoration is already MORE thematically apt for a tree home than a stone tower. |
| `buildTowerWallRing()` (wall + quoins + window + wall-prop) | Used as-is, unmodified — its vine/moss-patch/banner prop catalog is already tree-themed. |
| `StoneTowerSilhouette.ts` (profiles, per-floor jitter) | Used as-is for organic per-floor variety. |
| `StoneTowerRoofCap.ts`'s `buildLivingRoofCap` | Used as-is, called directly (bypassing the classic/pagoda/living random dispatch) — a residential tree home should ALWAYS end in a living canopy, never a shingled spire, matching this function's own existing "stone shaft transitions into actual foliage" design intent exactly.
| `StoneTowerBalcony.ts` (open rib gallery) | Used as-is for an optional top-floor lookout gallery, same ~40% seeded chance as the tower. |
| Per-floor ring-beam + knee-brace (`addPlankRing`/`addRingBraces`) | **Already real `BoxGeometry` primitives, not `BlockKit`** — not part of the complaint, kept unchanged, reused per floor (this is the one piece from last round that was never the problem). |

## What's genuinely new

- **A shared internal core**, extracted from `buildElvenStoneTower()`'s existing body
  (`_buildTowerKitCore(dna, floors, buildRoof, palette)` in `StoneTowerKit.ts`): stacks a base,
  N wall rings (via the already-exported `buildTowerWallRing`), and a caller-supplied roof-cap
  builder. `buildElvenStoneTower()` becomes a thin wrapper (own 3-6 random floor count, calls
  `buildTowerRoofCap`'s classic/pagoda/living dispatch) — **its existing 30 tests must all
  still pass unchanged**, proving this is a behavior-preserving refactor, not a rewrite.
- **`ElvenTreehouseKit.ts`** (new file): `buildElvenTreehouseHome(dna)`, the new public entry
  point for house/terraced/villa/inn/blacksmith. Calls the shared core with: `floors =
  Math.max(1, dna.floors)` (respects the settlement generator's actual floor assignment,
  unlike the tower's own fixed 3-6-regardless-of-dna.floors convention — houses are 1-3
  floors, not heroic 3-6), a wood palette (bark-textured wall/quoin/entrance/window material,
  real bark material for roots, leaf material for the canopy), and `buildLivingRoofCap` as the
  always-used roof builder (no random archetype dispatch — see table above).
- **Export the 3 private wall-prop builder functions** (`_buildVineProp`/`_buildMossPatchProp`/
  `_buildBannerProp`) from `StoneTowerKit.ts` — currently un-exported, needed so
  `buildTowerWallRing` (which calls them internally) works unchanged; no new file needs to
  call them directly, so this is only needed if a future file wants its own prop selection —
  **not actually needed for this round since `buildTowerWallRing` is reused whole**, removing
  this item.
- A wood palette needs its OWN texture — reuse the existing `barkTexture()` (already used by
  the old elven trunk code) for the wall's Strategy-G blocks, giving real bark-grain detail on
  each individual block, the direct wood equivalent of the tower's `ashlarTexture()` stone
  blocks.

## What gets removed

`buildElvenVilla()`, its per-floor ring-beam loop, and the `elvenRadiusAtHeight`/
`elvenHeightAtFrac` helpers added last round become dead code once house/terraced/villa/inn/
blacksmith are repointed to `buildElvenTreehouseHome` — **deleted**, not left as unused code.
`addBlockElvenTrunk`/`buildElvenTrunkGrid`/`ElvenTrunkWindows.ts` are KEPT (still used by
`buildElvenShop`, a different elven building kind not in this round's scope — shop's own
BlockKit-vs-tower-kit question is deferred to when shop is reached in the race-by-race cycle,
matching this project's established "one building type at a time" pattern). This is called
out explicitly so it doesn't read as an oversight.

## Testing strategy

Strict TDD: (1) confirm `StoneTowerKit.test.ts`'s existing 30 tests pass before touching
anything (baseline); (2) refactor `buildElvenStoneTower` into core+wrapper, re-run the same 30
tests, confirm still 30/30 passing (behavior-preserving proof); (3) new tests for
`buildElvenTreehouseHome` in a new `ElvenTreehouseKit.test.ts`: uses real block-course
geometry (no `BlockKit` grid — assert `getMaterialKey`/`BlockGrid`-shaped output is absent,
assert `BoxGeometry`/`ExtrudeGeometry` meshes are present instead), respects `dna.floors`
exactly (not a random 3-6), always produces a living-canopy top (no classic/pagoda shingle
roof ever appears), and produces valid non-NaN geometry across a seed sweep. (4) Update/
remove `FactionBuildingVariants.test.ts` assertions that exercised the now-deleted
`buildElvenVilla`.

## Non-goals

- Rebuilding `buildElvenShop`/`buildElvenChapel` on the tower-kit technique — out of scope,
  deferred to their own future round in the race-by-race cycle (chapel already uses a
  different, non-BlockKit technique — standing tree-stones — and isn't part of this feedback
  at all).
- Any change to the tower's own `watchtower`/`tower` behavior, tests, or visual output.
