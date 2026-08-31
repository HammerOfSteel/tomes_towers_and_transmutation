# Race-Specific Biome Territory Dressing (Phase 6) — Design

## 1. Context

`docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md`'s Phase 6 — "the big thematic
payoff" — calls for unique environment dressing specific to each race's *territory* (the land
around a settlement, not the settlement itself), extending the "no shared assets between races"
principle `docs/superpowers/plans/2026-08-29-settlement-visual-fidelity.md` already established
for buildings out into the surrounding wilderness. Depends on Phase 5 (faction-biome affinity),
already shipped — settlements now carry a real faction assignment biased by biome.

**Scope, confirmed with the user:** this spec designs the shared system once (works for every
faction) plus a lightweight concept list for all 9 factions, but only *fully* designs and
implements the first batch — **vulperia, undead, fae** (the three the roadmap itself calls out
with concrete examples: warren mounds, gravestones, mushroom rings). The remaining 6 factions get
their own short design/research pass when their batch begins, mirroring exactly how
`2026-08-29-settlement-visual-fidelity.md`'s building work rolled out increment by increment
rather than one giant upfront design.

## 2. Shared Architecture

### 2.1 Territory radius

Every settlement already has a real boundary radius (`SettlementBoundary.ts`'s
`settlementBoundaryRadius()` — farthest building from centre + a margin — also cached per
settlement in `OverworldScene._settlementPositions` as `radius`). A settlement's **territory
radius** is that same value × `TERRITORY_RADIUS_MULTIPLIER = 2.5` — a meaningful ring of
surrounding wilderness that scales naturally with settlement size, reusing existing data rather
than inventing a new one.

### 2.2 Gradient placement

Within a settlement's territory, each *existing* tree/rock scatter candidate point (no new
Poisson-disk sampling — reuses `_buildChunkScatter()`'s already-computed `treePts`/`rockPts`) has
a chance of being replaced by a territory-dressing prop instead of the normal tree/rock, with
probability highest near the settlement centre and fading to zero at the territory edge (an
organic gradient, not an abrupt prop wall):

```ts
export const TERRITORY_RADIUS_MULTIPLIER = 2.5;
const MAX_TERRITORY_PLACEMENT_PROBABILITY = 0.7;

/** Probability that a scatter point at `distanceFromCenter` (world units)
 *  from a settlement centre, within a territory of `territoryRadius`, gets
 *  replaced by a faction territory-dressing prop instead of the normal
 *  tree/rock. 0 at/beyond the radius, up to MAX_TERRITORY_PLACEMENT_PROBABILITY
 *  at the centre — a linear gradient, not a hard on/off wall. */
export function territoryPlacementProbability(distanceFromCenter: number, territoryRadius: number): number {
  if (territoryRadius <= 0 || distanceFromCenter >= territoryRadius) return 0;
  const t = distanceFromCenter / territoryRadius; // 0 at centre, 1 at edge
  return MAX_TERRITORY_PLACEMENT_PROBABILITY * (1 - t);
}

/** Which settlement's territory (if any) contains `point`, and that
 *  settlement's faction — null if the point falls outside every
 *  settlement's territory. When multiple territories overlap, the
 *  nearest settlement (by centre distance) wins. */
export function findTerritoryFaction(
  point: { x: number; z: number },
  settlements: readonly { worldPos: { x: number; z: number }; radius: number; faction: SettlementFaction }[],
): { faction: SettlementFaction; distanceFromCenter: number; territoryRadius: number } | null {
  let best: { faction: SettlementFaction; distanceFromCenter: number; territoryRadius: number } | null = null;
  for (const s of settlements) {
    const territoryRadius = s.radius * TERRITORY_RADIUS_MULTIPLIER;
    const d = Math.hypot(point.x - s.worldPos.x, point.z - s.worldPos.z);
    if (d >= territoryRadius) continue;
    if (!best || d < best.distanceFromCenter) best = { faction: s.faction, distanceFromCenter: d, territoryRadius };
  }
  return best;
}
```

Both functions are pure, exported from a new `src/world/TerritoryDressing.ts`, directly
unit-testable without any THREE.js/scene dependency.

### 2.3 `_settlementPositions` gains a `faction` field

`OverworldScene.ts`'s `_settlementPositions: Array<{ name; worldPos; radius }>` (used today for
fast-travel and boundary-crossing detection) gains a `faction: SettlementFaction` field, populated
from the same `plan.faction` already available at both push sites — purely additive, no existing
consumer reads a fixed shape that would break.

### 2.4 Wiring into `_buildChunkScatter()`

For each `treePts`/`rockPts` candidate already sampled in `_buildChunkScatter()`: call
`findTerritoryFaction()` with the point's world position and `this._settlementPositions`. If it
returns a match, roll `territoryPlacementProbability(...)` — on a hit, place a territory-dressing
prop for that faction (see §2.5) at this position **instead of** the normal `_makeTree()`/
`_makeRock()` call; otherwise fall through to today's normal biome-based tree/rock exactly as now.
Bush/beach-decor scatter passes are untouched in this pass (kept in scope to trees/rocks, the
dominant visual scatter elements — a deliberate, documented scoping choice, not an oversight).

### 2.5 Prop construction: `BlockGrid` + a small pre-built pool

Territory props are built with the same voxel `BlockGrid`/chamfered-block construction system
(`BlockKit.ts`) already used for building walls — reusing existing faction-appropriate canvas
textures from `FactionBlockTextures.ts` (`earthTexture` for vulperia, `ashStoneTexture` for
undead, `toadstoolTexture` for fae — all three **already used by those same factions' own
buildings** in `FactionBuildingVariants.ts`, so territory dressing visually matches the
architecture it surrounds) via the same `mat(color, { roughness, map: texture() })` material
pattern already established there.

Since scatter needs many instances cheaply (unlike the handful of buildings per settlement), each
prop type gets a small pool of **pre-built** `THREE.Group` variants (2-3 each) built once, at
scene construction, in a new `src/world/buildings/FactionTerritoryProps.ts`. At each qualifying
scatter point, `_buildChunkScatter()` picks one via `rand()` and `.clone()`s it (THREE's default
`Object3D.clone()` deep-clones the transform hierarchy but shares geometry/material references —
no per-instance geometry rebuild), then positions/rotates it like any other scatter object.

## 3. Full Concept List (all 9 factions, 3 props each)

| Faction | Props |
|---|---|
| elven | root archway, moss-covered standing stone, woven-branch shrine |
| dwarven | granite cairn marker, ore-cart prop, iron-banded waypost |
| orcish | bone/skull totem pole, spike/palisade cluster, tarp-covered supply pile |
| vampire | wrought-iron gothic marker, bramble/rose cluster, gargoyle-topped pillar |
| **undead** *(batch 1, detailed below)* | gravestone, bone-pile marker, crumbling ashen burial mound |
| **vulperia** *(batch 1, detailed below)* | warren mound w/ burrow, smaller burrow-hole cluster, woven-twig den marker |
| slime | ooze puddle patch, stacked-goo mound, glistening slime-trail rocks |
| **fae** *(batch 1, detailed below)* | small luminous mushroom, large luminous mushroom, luminous mushroom ring |
| human | wooden waypost/signpost, hay bale stack, humble stone cairn |

Only vulperia/undead/fae are implemented in this pass; the other 6 rows are concept-only
descriptions for a future batch, to be fully designed (mirroring this same process) when their
batch begins — not implementable from this spec alone.

## 4. Batch 1 Detailed Design

All props use `BLOCK_UNIT = 0.5` WU blocks (from `BlockKit.ts`), so a "4×3×4" prop is roughly
2×1.5×2 world units — small, cheap, scatter-appropriate.

**Vulperia** (`earthTexture`, default chamfering — soft, organic look):
- *Warren mound* — a rounded dirt dome, roughly 4×3×4 blocks tapering upward, with 1-2 base-layer
  blocks omitted at the front to form a dark burrow-entrance gap.
- *Burrow-hole cluster* — a smaller, flatter mound (~2×1×2 blocks), a secondary den entrance —
  same texture, a visibly smaller/lower silhouette than the warren mound.
- *Den marker* — a short vertical stack (~1×2×1 blocks, `barkTexture` instead of earth) topped
  with one wider "woven" block, reading as a twig/branch marker rather than a mound.

**Undead** (`ashStoneTexture`, `suppressChamfer: () => true` — deliberately jagged/decayed,
contrasting with vulperia's soft mounds even though both use the same underlying block-kit engine):
- *Gravestone* — a vertical slab, ~1×3×1 blocks, standing upright, taller than it is wide.
- *Bone-pile marker* — a low, irregular pile, ~2×1×2 blocks, lighter-tinted material.
- *Crumbling burial mound* — same rough silhouette family as vulperia's warren mound (a mound
  shape) but forced-jagged via `suppressChamfer` and ash-coloured — deliberately showing the same
  shared engine producing a very different read purely from chamfer settings + palette.

**Fae** (`toadstoolTexture` for the cap, emissive material for a night-readable glow — same
stalk/cap material pattern `FactionBuildingVariants.ts` already uses for the Fae Court building):
- *Small luminous mushroom* — a thin stalk (~1×2×1 blocks) topped by a single wider cap block.
- *Large luminous mushroom* — a taller/wider variant (~1×3×1 stalk, ~3×1×3 cap layer).
- *Mushroom ring* — **not a single `BlockGrid`**: a composite `THREE.Group` that clones the
  *small luminous mushroom* template 5-6 times, arranged in a ~1.5-2 WU-radius circle around the
  scatter point — the classic "fairy ring" read. Documented explicitly as the one prop built by
  arranging clones of another prop, not its own block layout.

## 5. Testing

- `TerritoryDressing.ts`: `territoryPlacementProbability()` — determinism, `0` at/beyond the
  radius, `MAX_TERRITORY_PLACEMENT_PROBABILITY` exactly at the centre, monotonically decreasing
  with distance. `findTerritoryFaction()` — correct faction for a point inside one territory,
  `null` outside every territory, nearest-settlement-wins for overlapping territories.
- `FactionTerritoryProps.ts`: each builder returns a `BlockGrid` — test block-count sanity (not
  empty, roughly matches the described footprint), the warren mound/burrow-hole cluster's
  burrow-gap actually exists (a specific block coordinate is absent), the gravestone is taller
  than it is wide, the mushroom ring composite contains multiple clones of the small-mushroom
  template.
- `OverworldScene.ts` wiring: covered by the existing scene-level regression suite (chunk-scatter
  tests, draw-call batching tests already exercise `_buildChunkScatter()`) — no new dedicated
  scene-level test needed beyond confirming those keep passing.

## 6. Explicitly Out of Scope

- The remaining 6 factions' props (elven, dwarven, orcish, vampire, slime, human) — concept-only
  in this pass, full design deferred to their own implementation batch.
- Bush/beach-decor scatter passes — territory replacement only applies to tree/rock scatter
  points in this pass.
- Dungeon/cave territory dressing — Phase 5 already confirmed dungeons/caves are faction-agnostic
  today; extending that concept there is out of scope here too.
- Tuning `TERRITORY_RADIUS_MULTIPLIER`/`MAX_TERRITORY_PLACEMENT_PROBABILITY` beyond one reasonable
  starting value — per this project's established "tune via playtesting" precedent.
