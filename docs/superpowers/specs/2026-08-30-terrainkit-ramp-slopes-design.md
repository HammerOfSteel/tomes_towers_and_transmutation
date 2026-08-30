# TerrainKit: Ramp/Slope Terrain Geometry — Design Spec

**Date:** 2026-08-30
**Parent roadmap:** `docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md`, Phase 2's
still-outstanding "generic corner-height ramp/slope terrain geometry" sub-item (Phase 2's
"roads as a first-class terrain surface" sub-item already shipped separately and is unaffected
by this work).

## 1. Problem statement

Today's terrain (`TerrainGeometryBuilder.ts`) renders every elevation transition as a flat top
face plus a **vertical wall face** down to the lower neighbour — a "blocky staircase" look with
no real slopes, regardless of how many discrete elevation levels exist (Phase 1 widened this to
8 levels, which only made the staircase finer-grained, not smoother). The user has repeatedly
asked for real hills/valleys/slopes, explicitly invoking the "small lego-like building blocks"
technique already proven out for settlement buildings (`BlockKit.ts`) as the model to follow for
terrain too.

## 2. Scope for this pass

**In scope:**
- Replace vertical-wall elevation transitions with real sloped ramp geometry, for **dry land
  tiles only**.
- A new canonical shape-classification system (`TerrainKit.ts`), matching the plan doc's
  original ambition rather than a simpler ad-hoc bilinear blend (see §6 for why the simpler
  alternative was considered and rejected for this pass).
- Both the visual mesh and the Rapier physics collider must be rebuilt from the exact same
  buffers (no separate collider geometry, matching the existing "one buffer, two consumers"
  pattern that already fixed the original terrain-clipping bug).

**Explicitly out of scope for this pass** (deferred to later follow-up work, tracked in the
parent roadmap doc):
- Sub-tile subdivision (finer N×N detail density within a tile) — this pass only changes how a
  *single* tile's top face is shaped, not how many pieces it's split into.
- River/lake bank ramping — water tiles keep today's flat-carved-height + vertical-wall
  treatment. `WaterDetection.ts`'s per-tile flat-height swim query is **not touched at all** by
  this pass, since ramps never apply to a tile with `waterDepth > 0`.
- Ramp-aware road-subtile height blending — a road rendered on a ramped tile still uses the
  tile's flat pre-ramp physical height for now (roads today only exist on already-flattened
  settlement/inter-settlement tiles, which rarely coincide with steep terrain, so this is not a
  visible regression, just an unaddressed edge case for a future pass).
- Any change to how elevation itself is generated/quantized (still 8 discrete per-cell levels,
  set by Phase 1 — this pass only changes how a *transition between* two cell levels is
  rendered).

## 3. Corner-height derivation

Each grid **corner** (a lattice point shared by up to 4 tiles, using the same lattice
coordinate convention `cornerHeightJitter()` already uses for cosmetic jitter) gets a
render-height derived from its surrounding tiles' elevation levels:

```
rawCornerElevation(cornerCol, cornerRow) =
  min(elevation of every tile among the up-to-4 tiles sharing this corner)
```

Out-of-bounds tiles (grid edges) are treated as having the current tile's own elevation, so map
edges never spuriously ramp toward an undefined value.

For a given tile with its own elevation `E`, that tile's **rendered** corner height is:

```
cornerHeight(tile, corner) = clamp(rawCornerElevation(corner), E - 1, E)
```

This means:
- A corner touching only tiles at `E` (or higher) stays at `E` — a tile's own corner can never
  render *above* its true elevation (the higher neighbour is responsible for ramping down
  toward this tile, not vice versa).
- A corner touching a neighbour at exactly `E - 1` renders at `E - 1` — the ramp reaches exactly
  down to the lower neighbour's own flat height at that shared point, which is watertight by
  construction (the neighbour tile computes the *same* corner using the same rule, so both
  sides agree).
- A corner touching a neighbour 2+ levels lower still clamps to `E - 1` — the ramp only ever
  encodes one level of slope; anything beyond that is covered by a **residual wall face** below
  the ramp's lowest edge (§5), exactly matching today's wall-face behaviour for that remaining
  drop. This case is measured to be extremely rare (~0.006% of adjacent-tile-pairs across a
  40-world-generation sample spanning all 4 realm shapes) so it does not need first-class ramp
  geometry of its own.

Jitter (`cornerHeightJitter()`) is unchanged and continues to apply as a small cosmetic offset
layered on top of whichever base corner height a corner resolves to (structural ramp height
first, cosmetic jitter second) — the two compose exactly as they do today for flat tiles.

## 4. Shape taxonomy

A tile's shape is classified by which of its 4 corners are "low" (i.e. resolved to `E - 1`
rather than `E`) — 4 binary corners = 16 combinations, all covered by 5 named shapes below
(`1 + 4 + 6 + 4 + 1 = 16`, matching the plan doc's own "exhaustive 16-combination" test bar):

| Shape | Low-corner count | Geometry | Rotations/orientations |
|---|---|---|---|
| **Flat** | 0 | Unchanged flat quad (today's exact behaviour, zero perf cost) | 1 |
| **Single-corner** | 1 | A dip at one corner | 4 |
| **Edge** | 2 (adjacent, sharing an edge) | One whole side ramps down — the common "hillside facing one direction" case | 4 |
| **Saddle** | 2 (opposite/diagonal) | Ambiguous/twisted as a single quad — split into 2 triangles along the diagonal that keeps both low corners on the same triangle | 2 |
| **Outer-corner** | 3 | Inverse of single-corner — a raised spur/point (e.g. a peninsula tip) | 4 |
| **All-four-down** (degenerate) | 4 | Falls back to today's flat-quad-plus-full-wall behaviour rather than inventing pyramid/apex geometry for an edge case that is statistically near-impossible with smooth fBm-noise terrain (would require a lone single-tile pillar surrounded on all 8 sides by lower terrain) | n/a |

Single-corner and Outer-corner shapes render as 2 triangles split along the diagonal that runs
*through* the odd-one-out corner (the lone low corner, or the lone high corner respectively) —
unlike Saddle, this diagonal choice is unambiguous (only one corner differs from the other
three, so either diagonal choice produces a valid non-self-intersecting surface; splitting
through the odd corner is simply the natural/conventional choice). Saddle is the only shape
where the diagonal choice actually matters, since it must keep the two low corners on the same
triangle to avoid a twisted/self-intersecting surface.

## 5. Module boundary & integration

**New module `src/world/TerrainKit.ts`** (naming mirrors `BlockKit.ts`'s role for buildings):
- `classifyTileShape(corners: [n, n, n, n]) → { shape: RampShape; rotation: number }` — pure
  function, given the tile's own elevation and its 4 clamped corner heights (or equivalently,
  the 4 booleans "is this corner low"), returns which canonical shape and rotation/orientation
  applies. No THREE.js/Rapier dependency.
- `buildRampTopFace(shape, rotation, cornerHeights, tileWorldX, tileWorldZ, tileSize) →
  { positions: number[]; normals: number[] }` — emits 1 quad (2 triangles) for
  flat/single-corner/edge/outer-corner shapes, 2 differently-diagonal-split triangles for
  saddle. Pure geometry in, buffers out — unit-testable standalone exactly like
  `RoadPathSampler.ts`.

**`TerrainGeometryBuilder.ts` integration:** the existing unconditional flat top-face
`addFace()` call for a tile's top face is replaced by: compute the tile's 4 corner heights (§3)
→ classify via `TerrainKit.classifyTileShape()` → emit the shape's triangulation via
`TerrainKit.buildRampTopFace()`. Colour/UV selection logic is unchanged — it already resolves
per-tile from `cell.biome`/`elevation` before any face is emitted, so it applies identically to
the new (possibly non-flat) vertex positions. No new parameters are added to
`buildTerrainGeometryData()`'s public signature — this is a strictly-better implementation of
the same top-face + wall computation, not a new opt-in feature, so every existing caller gets
ramps automatically.

**Wall-face adjustment:** for each of the 4 sides, the wall only needs to span the *residual*
gap between where the ramp's own corners on that side already reach and the neighbour's actual
physical height:

```
wallTopY    = min(the tile's two corner heights on this side)
wallBottomY = neighbour's physical height
```

The wall is skipped entirely when `wallTopY <= wallBottomY` (the ramp already reaches the
neighbour — watertight, no wall needed; this is the common case once a neighbour is exactly 1
level lower and the shape has both of that side's corners lowered, e.g. the Edge shape facing
that direction). For shapes where only *one* of a side's two corners is lowered
(Single-corner, Outer-corner, Saddle), this produces a **triangular partial wall** rather than a
uniform rectangle spanning the full tile width — this is the trickiest geometry in the whole
pass and will be finalised via the exhaustive per-shape test suite (§7) rather than fully
hand-derived on paper first.

**Collider:** identical position/index buffers feed both the visual mesh and the Rapier
trimesh, exactly matching the existing pattern (no separate collider geometry is ever authored
or maintained).

## 6. Alternative considered and rejected

A simpler "bilinear corner-height blend" alternative was considered: skip shape classification
entirely and always render a tile's top face as a single quad using its 4 (independently
computed) corner heights directly, reusing the exact bilinear-interpolation code path the
road-subtile system already uses for jitter. This was rejected in favour of the canonical-shape
system above per explicit user preference: a shape-classified system gives crisper, more
intentional-looking geometry for the corner cases (in particular Saddle, which the bilinear
approach would render as an arbitrary twisted warp rather than an intentional diagonal fold),
at the cost of more implementation surface area (shape enum, per-shape triangulation, the
16-combination test matrix). Both approaches share the same corner-height derivation rule (§3);
the shape classifier is a "smarter" consumer of the same input data.

## 7. Testing strategy

- **`TerrainKit.ts` unit tests:** all 16 corner-height-combination cases, confirming correct
  shape classification (including all rotations/orientations) and watertight geometry — shared
  corners between adjacent tiles must always produce identical world-space Y, reusing the same
  verification pattern already proven for `cornerHeightJitter()`.
- **`TerrainGeometryBuilder.ts` regression tests:** every existing flat-terrain test must stay
  byte-identical (zero change when all 4 neighbours agree with a tile's own elevation — this is
  the overwhelming majority case, ~94% of adjacent-tile-pairs measured). New tests per shape:
  correct vertex count/winding/normals; wall-suppression tests (ramp already reaches neighbour →
  zero-height wall, confirmed via vertex/index count); residual-wall tests (the rare 2-level-jump
  case still produces a small wall).
- **Collider parity test:** same buffer feeds both mesh and trimesh (mirrors the existing
  pattern's own test coverage for this guarantee).
- **Live visual verification:** Overworld Lab teleport to a known hill/mountain area,
  before/after screenshot comparison, once implemented — same rhythm as every other phase this
  session.

## 8. Performance

Benchmark chunk-build time before/after on `worldSize: 512` (the parent roadmap's deferred RI-5
perf-test item). Ramps only add triangles at elevation *boundaries* — they replace today's
existing wall-face geometry rather than adding to the vast flat-interior tile majority — so the
triangle-count increase should scale with today's existing wall-face count, not total tile
count. If the benchmark shows an unacceptable regression, the fallback is to only ramp tiles
above a configurable minimum elevation level (e.g. only `mountain`/`hills`-tier terrain), leaving
lower/flatter biomes with today's cheaper flat+wall rendering — not designed in detail here
since the measured-`ratio` case is expected to make this unnecessary, but noted as a safety
valve.

## 9. Rollout

1. Implement `TerrainKit.ts` in full isolation (pure functions, fully unit-tested via the
   16-combination matrix) — no engine wiring yet.
2. Wire into `TerrainGeometryBuilder.ts`'s existing single entry point.
3. Full regression suite + `tsc --noEmit` baseline check + perf benchmark.
4. Live Overworld Lab visual verification (before/after screenshots of the same seed's
   hill/mountain terrain).
5. Commit, push to `main` for live testing, per this session's established rhythm.
