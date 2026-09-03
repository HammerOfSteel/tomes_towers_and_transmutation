# Elven market stall ("Moonlit Exchange") — rebuild on the tower kit's real construction

Status: next elven building type in the race-by-race cycle (`TODO/organic_world_tiles_todo.md`
Phase 6), following the same research → learn → plan → build → test cycle as the tower and the
treehouse home. The construction TECHNIQUE question is already settled (real per-course block
walls + carved recessed openings, from the stone-tower kit) — this round's real design question
is "what makes a good elven market stall *distinct from a house*," since `buildElvenShop()`
(the "Moonlit Exchange") is currently the same offender as the old villa: a `BlockKit`
voxel-occupancy sapling trunk, and simply shrinking the treehouse-home kit would just produce a
smaller house, not a shop.

## Research summary (full report in session transcript; key findings only)

1. **Real market stalls are 1-2 walls, not 4** — a back wall (lockable storage) plus an open
   counter facing the street, under a roof/awning overhang. Pre-1850s shops (the period this
   game evokes) did NOT have large glass display windows — awning + open counter *is* the
   period-correct silhouette, not a compromise.
2. **Historical hanging signs used carved/painted trade symbols, not text** — legally codified
   in England in 1393; medieval illiteracy made pictorial trade symbols the norm. Directly
   motivates a glowing carved symbol (leaf/moonstone) on the shop's sign instead of lettering.
3. **Zelda BOTW's Great Deku Tree literally nests a "General Shop" and "Spore Store" into a
   giant living tree** — a verified, on-point precedent for "a small commercial stall built
   into/beneath a tree," validating the existing "Moonlit Exchange" concept (trading platform
   under a sapling) at the *design* level even though its *construction* needs rebuilding.
4. **This repo already has real, reusable precedent** for every piece needed:
   - `BuildingBuilder.ts`'s generic `buildMarketStall()` — 4 corner posts, a waist-height
     counter, and a **striped sloped-panel awning** (6 flat alternating-color `PlaneGeometry`
     panels, `rotation.x = -0.28`). Exactly the "flat panels, no cloth sim" technique needed —
     reused with an elven wood/leaf palette, not reinvented.
   - The tavern's hanging sign (`BuildingBuilder.ts` ~line 807) — a rigid bracket + board +
     short chain, no physics. Reused with a bark-textured bracket + a glowing trade-symbol
     accent instead of lettering.
   - `StoneTowerBalcony.ts`'s corbel-bracket + open-rib-post + deck technique — the ideal
     tower-kit-consistent skeleton for something genuinely OPEN (no solid wall), already proven
     and tested.
   - `StoneTowerOpenings.ts`'s `buildRecessedArchOpening()` — reused at a wide/short aspect
     ratio for a genuinely carved counter-opening (not a tall door), instead of a flat cutout.
   - `buildLivingRoofCap()` — reused at a small scale for the sapling canopy on top, instead of
     a bespoke `BlockKit` grid.

## Chosen design

A small structure with a genuinely partial (not full-ring) enclosed back wall, an open
counter-facing front, a fabric awning, a small living sapling on top, and a hanging trade-sign —
built entirely from tower-kit-family real geometry, no `BlockKit`.

1. **Partial back wall** (NOT a full octagon ring — the single biggest fix, directly addressing
   "a shop is 1-2 walls, not 4"): generalizes `StoneTowerWallSurface.ts`'s `buildWallSurfaceBlocks()`
   with a new optional `facesOverride?: OctagonFace[]` option (defaults to `undefined` — every
   existing caller/test that omits it is byte-for-byte unchanged) so a caller can build real
   per-course blocks for only a SUBSET of the octagon's 8 faces. The shop uses the back 3 faces
   (roughly half the circumference facing away from the "street"), leaving the front genuinely
   open — no wall mesh there at all.
2. **Carved counter-opening**: `buildRecessedArchOpening()` reused at a wide/short aspect ratio
   (wide straight span, small point height) carved into the back wall's center face, instead of
   a tall door arch — the same "genuinely carved, not a flat box" technique, sized for a counter.
3. **Counter + posts**: a waist-height counter slab in front of the opening (matching
   `buildMarketStall`'s existing counter shape) and 2 corner posts (bark-textured cylinders,
   thematically "small tree-limb posts" rather than plain iron/wood poles).
4. **Awning**: N flat, alternating wood/leaf-toned sloped panels radiating from a ridge beam
   above the counter (directly reusing `buildMarketStall`'s proven technique/proportions with an
   elven palette swap) — named `buildStallAwning()` (NOT `canopy`, already claimed by the
   foliage roof, per the research's explicit naming flag).
5. **Sapling canopy**: `buildLivingRoofCap()` at a small radius, sitting on a short central
   trunk stub above the back wall — the exact same "living tree" top the treehouse home uses,
   just miniature, keeping the "grown from a tree" identity consistent across elven buildings.
6. **Hanging trade-sign**: a small bark-textured bracket + board (reusing the tavern's rigid
   bracket+board+chain shape) with a glowing moonstone accent shape standing in for a carved
   trade symbol (leaf silhouette), mounted on one of the front posts.
7. **Goods + glow-motes**: kept from the current implementation (goods-on-counter spheres,
   hanging glow-motes) — these already work and aren't part of the complaint.

## Files touched

- `src/world/buildings/StoneTowerWallSurface.ts` — add `facesOverride?: OctagonFace[]` to
  `WallBlockOptions` (additive, backward-compatible; existing tests must pass unchanged).
- `src/world/buildings/ElvenMarketStallKit.ts` (new) — `buildElvenMarketStall(dna)`, the new
  public entry point, plus `buildStallAwning()`.
- `src/world/buildings/FactionBuildingVariants.ts` — elven's `shop` kind repointed to the new
  builder; old `buildElvenShop()` deleted once nothing references it.
- Test files for the above.

## Testing strategy

Strict TDD, matching the tower/treehouse precedent. Key assertions: the back wall covers only
a subset of the full circumference (fewer occupied angular positions than a full ring, verified
by comparing against a full-ring build of the same radius/height/seed), a genuine carved
counter-opening exists (`ExtrudeGeometry` present, matching the door/window technique), the
front remains open (no wall mesh spans the front-facing angle), a living sapling canopy is
always present (reusing the tower's own "no `SphereGeometry` apex ball" living-cap
discriminator), valid non-NaN geometry across a seed sweep, and determinism.

## Non-goals

- Rebuilding `buildElvenChapel` — untouched, uses its own distinct standing-tree-stones
  technique that was never part of the "old block design" complaint.
- A true cloth-simulated or vertex-sagged awning — the research confirms real awnings are
  taut/near-flat, so flat panels are period-accurate, not a shortcut. A sag variant is noted as
  a possible future stretch, not needed here.
