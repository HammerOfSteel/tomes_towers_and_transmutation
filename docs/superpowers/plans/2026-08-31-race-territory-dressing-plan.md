# Race Territory Dressing — Batch 1 (Vulperia/Undead/Fae) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give vulperia, undead, and fae settlements unique environment dressing (props scattered
in the wilderness around each settlement, not the settlement itself) so their surroundings read
as distinctly themed instead of generic biome-only scatter — the first implementation batch of
Phase 6.

**Architecture:** A new pure-logic module (`TerritoryDressing.ts`) computes territory radius and a
distance-based placement probability; a new `FactionTerritoryProps.ts` builds each faction's props
as `BlockGrid`s (the same voxel/chamfered-block system building walls already use, reusing
existing faction textures) meshed once into a small cached pool; `OverworldScene.ts`'s existing
per-chunk tree/rock scatter loop consults both to occasionally substitute a territory prop instead
of a normal tree/rock near a settlement.

**Tech Stack:** TypeScript, Three.js, Vitest, the existing `BlockKit.ts`/`FactionBlockProfiles.ts`
voxel-block construction system and `FactionBlockTextures.ts` canvas textures.

## Global Constraints

- `TERRITORY_RADIUS_MULTIPLIER = 2.5` (territory radius = settlement boundary radius × 2.5).
- `MAX_TERRITORY_PLACEMENT_PROBABILITY = 0.7` at the settlement centre, linearly fading to `0` at
  the territory radius edge.
- Only tree/rock scatter points are eligible for territory-prop substitution in this pass — bush/
  beach-decor scatter is untouched.
- Territory props are built via `BlockKit.ts`'s `BlockGrid`/`meshBlockGrid()`, reusing existing
  `FactionBlockTextures.ts` textures (`earthTexture`/`barkTexture` for vulperia, `ashStoneTexture`
  for undead, `toadstoolTexture` for fae) — no new texture assets.
- Each prop type gets a small pool (built once, at scene construction) of pre-built `THREE.Group`
  variants, cloned (not rebuilt) at each scatter point — never call `meshBlockGrid()` per scatter
  instance.
- Only vulperia, undead, and fae are implemented in this plan — the other 6 factions are
  out of scope (see design spec §6).

---

## Task 1: `TerritoryDressing.ts` — territory radius + gradient placement probability

**Files:**
- Create: `src/world/TerritoryDressing.ts`
- Test: `tests/world/TerritoryDressing.test.ts`

**Interfaces:**
- Consumes: nothing (pure, standalone).
- Produces: `TERRITORY_RADIUS_MULTIPLIER: number`, `territoryPlacementProbability(distanceFromCenter: number, territoryRadius: number): number`,
  `findTerritoryFaction(point: {x: number; z: number}, settlements: readonly {worldPos: {x: number; z: number}; radius: number; faction: SettlementFaction}[]): {faction: SettlementFaction; distanceFromCenter: number; territoryRadius: number} | null`.
  Consumed by Task 5's `OverworldScene.ts` wiring.

- [ ] **Step 1: Write the failing tests**

Create `tests/world/TerritoryDressing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TERRITORY_RADIUS_MULTIPLIER, territoryPlacementProbability, findTerritoryFaction } from '@/world/TerritoryDressing';

describe('territoryPlacementProbability', () => {
  it('is 0 at or beyond the territory radius', () => {
    expect(territoryPlacementProbability(50, 50)).toBe(0);
    expect(territoryPlacementProbability(60, 50)).toBe(0);
  });

  it('is at its maximum (0.7) exactly at the centre', () => {
    expect(territoryPlacementProbability(0, 50)).toBeCloseTo(0.7, 9);
  });

  it('decreases monotonically as distance increases', () => {
    const p0 = territoryPlacementProbability(0, 100);
    const p25 = territoryPlacementProbability(25, 100);
    const p50 = territoryPlacementProbability(50, 100);
    const p75 = territoryPlacementProbability(75, 100);
    expect(p0).toBeGreaterThan(p25);
    expect(p25).toBeGreaterThan(p50);
    expect(p50).toBeGreaterThan(p75);
  });

  it('returns 0 for a non-positive territory radius (defensive, avoids divide-by-zero)', () => {
    expect(territoryPlacementProbability(5, 0)).toBe(0);
    expect(territoryPlacementProbability(5, -10)).toBe(0);
  });
});

describe('findTerritoryFaction', () => {
  const settlements = [
    { worldPos: { x: 0, z: 0 }, radius: 20, faction: 'vulperia' as const },
    { worldPos: { x: 200, z: 0 }, radius: 10, faction: 'undead' as const },
  ];

  it('finds the faction for a point inside a settlement\'s territory', () => {
    // Territory radius = 20 * 2.5 = 50; point at distance 30 is inside.
    const result = findTerritoryFaction({ x: 30, z: 0 }, settlements);
    expect(result).not.toBeNull();
    expect(result!.faction).toBe('vulperia');
  });

  it('returns null for a point outside every settlement\'s territory', () => {
    const result = findTerritoryFaction({ x: 1000, z: 1000 }, settlements);
    expect(result).toBeNull();
  });

  it('picks the nearest settlement when territories overlap', () => {
    // undead territory radius = 10 * 2.5 = 25; a point at x=190 is distance 10
    // from undead (200,0) and distance 190 from vulperia (0,0) -- undead wins.
    const result = findTerritoryFaction({ x: 190, z: 0 }, settlements);
    expect(result!.faction).toBe('undead');
  });

  it('returns an empty-list-safe null (no settlements at all)', () => {
    expect(findTerritoryFaction({ x: 0, z: 0 }, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
npx vitest run tests/world/TerritoryDressing.test.ts
```

Expected: FAIL — `Cannot find module '@/world/TerritoryDressing'`.

- [ ] **Step 3: Implement `src/world/TerritoryDressing.ts`**

```ts
/**
 * TerritoryDressing.ts — Phase 6 (race-specific biome territory dressing).
 *
 * Pure geometry/probability helpers for "is this scatter point inside a
 * settlement's territory, and if so, how likely is a faction-themed prop
 * here instead of a normal tree/rock?" No THREE.js or scene dependency —
 * see docs/superpowers/specs/2026-08-31-race-territory-dressing-design.md §2.
 */
import type { SettlementFaction } from '@/overworld-studio';

/** Territory radius = settlement boundary radius (SettlementBoundary.ts's
 *  settlementBoundaryRadius()) x this multiplier — a meaningful ring of
 *  surrounding wilderness that scales with settlement size. */
export const TERRITORY_RADIUS_MULTIPLIER = 2.5;

/** Placement probability at the settlement centre (fades linearly to 0 at
 *  the territory radius edge). */
export const MAX_TERRITORY_PLACEMENT_PROBABILITY = 0.7;

/**
 * Probability that a scatter point at `distanceFromCenter` world units from
 * a settlement centre, within a territory of `territoryRadius`, gets
 * replaced by a faction territory-dressing prop instead of the normal
 * tree/rock. 0 at/beyond the radius, up to MAX_TERRITORY_PLACEMENT_PROBABILITY
 * at the centre — a linear gradient, not a hard on/off wall.
 */
export function territoryPlacementProbability(distanceFromCenter: number, territoryRadius: number): number {
  if (territoryRadius <= 0 || distanceFromCenter >= territoryRadius) return 0;
  const t = distanceFromCenter / territoryRadius; // 0 at centre, 1 at edge
  return MAX_TERRITORY_PLACEMENT_PROBABILITY * (1 - t);
}

export interface TerritorySettlement {
  worldPos: { x: number; z: number };
  radius: number;
  faction: SettlementFaction;
}

export interface TerritoryMatch {
  faction: SettlementFaction;
  distanceFromCenter: number;
  territoryRadius: number;
}

/**
 * Which settlement's territory (if any) contains `point`, and that
 * settlement's faction — null if the point falls outside every
 * settlement's territory. When multiple territories overlap, the nearest
 * settlement (by centre distance) wins.
 */
export function findTerritoryFaction(
  point: { x: number; z: number },
  settlements: readonly TerritorySettlement[],
): TerritoryMatch | null {
  let best: TerritoryMatch | null = null;
  for (const s of settlements) {
    const territoryRadius = s.radius * TERRITORY_RADIUS_MULTIPLIER;
    const d = Math.hypot(point.x - s.worldPos.x, point.z - s.worldPos.z);
    if (d >= territoryRadius) continue;
    if (!best || d < best.distanceFromCenter) best = { faction: s.faction, distanceFromCenter: d, territoryRadius };
  }
  return best;
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

```bash
npx vitest run tests/world/TerritoryDressing.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 5: Run `npx tsc --noEmit`, confirm the error count is still 144**

- [ ] **Step 6: Commit**

```bash
git add src/world/TerritoryDressing.ts tests/world/TerritoryDressing.test.ts
git commit -m "feat: add TerritoryDressing territory-radius + gradient placement logic"
```

---

## Task 2: `FactionTerritoryProps.ts` — vulperia props

**Files:**
- Create: `src/world/buildings/FactionTerritoryProps.ts`
- Test: `tests/world/FactionTerritoryProps.test.ts`

**Interfaces:**
- Consumes: `BlockGrid`/`createBlockGrid`/`setBlock`/`hasBlock`/`getMaterialKey`/`BLOCK_UNIT`/
  `meshBlockGrid` from `@/world/buildings/BlockKit`; `buildVulperiaDenMoundGrid` from
  `@/world/buildings/FactionBlockProfiles`; `earthTexture`/`barkTexture` from
  `@/world/buildings/FactionBlockTextures`.
- Produces: `buildVulperiaWarrenMoundGrid(seed: number): BlockGrid`,
  `buildVulperiaBurrowHoleGrid(seed: number): BlockGrid`, `buildVulperiaDenMarkerGrid(): BlockGrid`,
  consumed by Task 5's prop-pool construction.

- [ ] **Step 1: Write the failing tests**

Create `tests/world/FactionTerritoryProps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hasBlock, getMaterialKey, BLOCK_UNIT } from '@/world/buildings/BlockKit';
import {
  buildVulperiaWarrenMoundGrid, buildVulperiaBurrowHoleGrid, buildVulperiaDenMarkerGrid,
} from '@/world/buildings/FactionTerritoryProps';

describe('vulperia territory props', () => {
  it('warren mound has a carved burrow-entrance gap at the front, ground level', () => {
    const grid = buildVulperiaWarrenMoundGrid(1);
    // Warren mound uses w=2.5,d=2,h=1.2 internally (bw=5, bd=4) -- see
    // buildVulperiaWarrenMoundGrid's own implementation for these exact
    // dimensions, mirrored here only to locate the front-centre cell.
    const bw = Math.max(3, Math.round(2.5 / BLOCK_UNIT));
    const bd = Math.max(3, Math.round(2 / BLOCK_UNIT));
    const cx = Math.round(bw / 2);
    const frontZ = bd - 1;
    expect(hasBlock(grid, cx, 0, frontZ)).toBe(false);
  });

  it('burrow-hole cluster is grounded and non-empty', () => {
    // Uses the burrow-hole variant (facade: false) rather than the warren
    // mound (facade: true) for this check specifically to avoid ambiguity
    // with the carved doorway notch — at the warren mound's small
    // dimensions the notch can consume a column's entire height, which
    // this "every occupied column has a block at by=0" check isn't
    // designed to reason about. The doorway-gap property itself is
    // covered by the dedicated test above.
    const grid = buildVulperiaBurrowHoleGrid(2);
    expect(grid.cells.size).toBeGreaterThan(0);
    for (const k of grid.cells.keys()) {
      const [bx, , bz] = k.split(',').map(Number);
      expect(hasBlock(grid, bx!, 0, bz!)).toBe(true);
    }
  });

  it('burrow-hole cluster is smaller (fewer blocks) than the warren mound', () => {
    const mound = buildVulperiaWarrenMoundGrid(3);
    const hole = buildVulperiaBurrowHoleGrid(3);
    expect(hole.cells.size).toBeLessThan(mound.cells.size);
    expect(hole.cells.size).toBeGreaterThan(0);
  });

  it('den marker is a distinct shape: a narrow vertical stack topped by a wider "woven" cap, using bark material', () => {
    const grid = buildVulperiaDenMarkerGrid();
    expect(getMaterialKey(grid, 0, 0, 0)).toBe('bark');
    // Top layer (by=2) should be wider than a single column -- at least 3 blocks.
    let topLayerCount = 0;
    for (const k of grid.cells.keys()) {
      const [, by] = k.split(',').map(Number);
      if (by === 2) topLayerCount++;
    }
    expect(topLayerCount).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic for the same seed', () => {
    const a = buildVulperiaWarrenMoundGrid(42);
    const b = buildVulperiaWarrenMoundGrid(42);
    expect([...a.cells.entries()]).toEqual([...b.cells.entries()]);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
npx vitest run tests/world/FactionTerritoryProps.test.ts
```

Expected: FAIL — `Cannot find module '@/world/buildings/FactionTerritoryProps'`.

- [ ] **Step 3: Implement `src/world/buildings/FactionTerritoryProps.ts` (vulperia section)**

```ts
/**
 * FactionTerritoryProps.ts — Phase 6 (race-specific biome territory
 * dressing), batch 1: vulperia, undead, fae. Each faction's props are
 * built as `BlockGrid`s (same voxel/chamfered-block system building walls
 * use, see BlockKit.ts) at scatter scale (much smaller than a building),
 * reusing existing faction textures so dressing visually matches the
 * architecture it surrounds. See
 * docs/superpowers/specs/2026-08-31-race-territory-dressing-design.md §4.
 */
import * as THREE from 'three';
import {
  createBlockGrid, setBlock, meshBlockGrid, type BlockGrid, type MeshBlockGridOptions,
} from './BlockKit';
import { buildVulperiaDenMoundGrid } from './FactionBlockProfiles';
import { earthTexture, barkTexture, ashStoneTexture, toadstoolTexture } from './FactionBlockTextures';

function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...opts });
}

// ── Vulperia ──────────────────────────────────────────────────────────────────

/** Small grounded dirt dome (~2.5x2x1.2 WU) with a carved burrow entrance
 *  at the front — reuses the exact same heightfield-mound occupancy
 *  technique buildVulperiaDenMoundGrid() already uses for building-scale
 *  den mounds, just at scatter scale. */
export function buildVulperiaWarrenMoundGrid(seed: number): BlockGrid {
  return buildVulperiaDenMoundGrid(seed, 2.5, 2, 1.2, { facade: true });
}

/** Smaller, flatter secondary den entrance (~1.5x1.5x0.8 WU) -- same
 *  technique, no facade needed since the whole mound reads as a low
 *  burrow-hole cluster rather than a proper doorway. */
export function buildVulperiaBurrowHoleGrid(seed: number): BlockGrid {
  return buildVulperiaDenMoundGrid(seed, 1.5, 1.5, 0.8, { facade: false });
}

/** A short bark-textured post topped by a wider 3x3 "woven" cap layer --
 *  reads as a twig/den marker, visually distinct from the two mound
 *  shapes above. Fixed shape (no seed/variation needed -- a small,
 *  deliberately-designed marker, not a procedural silhouette). */
export function buildVulperiaDenMarkerGrid(): BlockGrid {
  const grid = createBlockGrid();
  setBlock(grid, 0, 0, 0, 'bark');
  setBlock(grid, 0, 1, 0, 'bark');
  for (let bx = -1; bx <= 1; bx++) {
    for (let bz = -1; bz <= 1; bz++) {
      setBlock(grid, bx, 2, bz, 'woven');
    }
  }
  return grid;
}

export function meshVulperiaWarrenMound(seed: number): THREE.Group {
  const grid = buildVulperiaWarrenMoundGrid(seed);
  const palette = { earth: mat('#6b4a2f', { map: earthTexture() }), grass: mat('#4a6b2f'), facade: mat('#3d2e1a') };
  return meshBlockGrid(grid, palette, {});
}

export function meshVulperiaBurrowHole(seed: number): THREE.Group {
  const grid = buildVulperiaBurrowHoleGrid(seed);
  const palette = { earth: mat('#6b4a2f', { map: earthTexture() }), grass: mat('#4a6b2f') };
  return meshBlockGrid(grid, palette, {});
}

export function meshVulperiaDenMarker(): THREE.Group {
  const grid = buildVulperiaDenMarkerGrid();
  const palette = { bark: mat('#5a4530', { map: barkTexture() }), woven: mat('#8a6d3f') };
  return meshBlockGrid(grid, palette, {});
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

```bash
npx vitest run tests/world/FactionTerritoryProps.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Run `npx tsc --noEmit`, confirm the error count is still 144**

- [ ] **Step 6: Commit**

```bash
git add src/world/buildings/FactionTerritoryProps.ts tests/world/FactionTerritoryProps.test.ts
git commit -m "feat: add vulperia territory props (warren mound, burrow hole, den marker)"
```

---

## Task 3: `FactionTerritoryProps.ts` — undead props

**Files:**
- Modify: `src/world/buildings/FactionTerritoryProps.ts`
- Modify: `tests/world/FactionTerritoryProps.test.ts`

**Interfaces:**
- Consumes: `buildVulperiaDenMoundGrid` (reused for the crumbling mound, Task 2's import already
  covers this), `MeshBlockGridOptions` from `BlockKit` (for `suppressChamfer`).
- Produces: `buildUndeadGravestoneGrid(): BlockGrid`, `buildUndeadBonePileGrid(seed: number): BlockGrid`,
  `buildUndeadCrumblingMoundGrid(seed: number): BlockGrid`, consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/FactionTerritoryProps.test.ts` (add the new imports to the existing import
line from `@/world/buildings/FactionTerritoryProps`):

```ts
describe('undead territory props', () => {
  it('gravestone is a vertical slab: taller than it is wide', () => {
    const grid = buildUndeadGravestoneGrid();
    let maxBy = -Infinity, minBy = Infinity;
    const xs = new Set<number>(), zs = new Set<number>();
    for (const k of grid.cells.keys()) {
      const [bx, by, bz] = k.split(',').map(Number);
      maxBy = Math.max(maxBy, by!); minBy = Math.min(minBy, by!);
      xs.add(bx!); zs.add(bz!);
    }
    const height = maxBy - minBy + 1;
    const footprint = Math.max(xs.size, zs.size);
    expect(height).toBeGreaterThan(footprint);
  });

  it('gravestone uses the ashstone material', () => {
    const grid = buildUndeadGravestoneGrid();
    expect(getMaterialKey(grid, 0, 0, 0)).toBe('ashstone');
  });

  it('bone-pile marker is low and irregular: shorter than the gravestone, more than 1 block footprint', () => {
    const pile = buildUndeadBonePileGrid(1);
    const grave = buildUndeadGravestoneGrid();
    let pileMaxBy = -Infinity, graveMaxBy = -Infinity;
    const footprint = new Set<string>();
    for (const k of pile.cells.keys()) {
      const [bx, by, bz] = k.split(',').map(Number);
      pileMaxBy = Math.max(pileMaxBy, by!);
      footprint.add(`${bx},${bz}`);
    }
    for (const k of grave.cells.keys()) {
      const [, by] = k.split(',').map(Number);
      graveMaxBy = Math.max(graveMaxBy, by!);
    }
    expect(pileMaxBy).toBeLessThan(graveMaxBy);
    expect(footprint.size).toBeGreaterThan(1);
  });

  it('crumbling burial mound shares the warren mound\'s silhouette family (grounded, dome-shaped) but is a different material', () => {
    const grid = buildUndeadCrumblingMoundGrid(1);
    expect(grid.cells.size).toBeGreaterThan(0);
    for (const k of grid.cells.keys()) {
      const [bx, , bz] = k.split(',').map(Number);
      expect(hasBlock(grid, bx!, 0, bz!)).toBe(true); // grounded, like the vulperia mound
    }
    expect(getMaterialKey(grid, 0, 0, 0)).not.toBe('earth'); // not vulperia's material
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
npx vitest run tests/world/FactionTerritoryProps.test.ts -t "undead territory props"
```

Expected: FAIL — the 4 new functions aren't exported yet.

- [ ] **Step 3: Add the undead section to `src/world/buildings/FactionTerritoryProps.ts`**

Append after the vulperia section:

```ts
// ── Undead ────────────────────────────────────────────────────────────────────

/** Upright ashstone slab, ~1x3x1 blocks -- taller than wide, reading as a
 *  simple standing tombstone. Fixed shape (no seed needed). */
export function buildUndeadGravestoneGrid(): BlockGrid {
  const grid = createBlockGrid();
  setBlock(grid, 0, 0, 0, 'ashstone');
  setBlock(grid, 0, 1, 0, 'ashstone');
  setBlock(grid, 0, 2, 0, 'ashstone');
  return grid;
}

/** Low, irregular 2x2 footprint pile, one block tall except a single
 *  randomly-chosen corner raised to 2 -- a scattered bone-pile read
 *  rather than a neat stack. */
export function buildUndeadBonePileGrid(seed: number): BlockGrid {
  const grid = createBlockGrid();
  const corners: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
  for (const [bx, bz] of corners) setBlock(grid, bx, 0, bz, 'bone');
  const raised = corners[Math.abs(seed) % corners.length]!;
  setBlock(grid, raised[0], 1, raised[1], 'bone');
  return grid;
}

/** Same grounded heightfield-mound technique as the vulperia warren mound
 *  (buildVulperiaDenMoundGrid) -- deliberately reusing the shared engine
 *  to show a very different read purely from chamfer settings (forced
 *  jagged, see meshUndeadCrumblingMound's suppressChamfer) and palette
 *  (ashstone, not earth) alone. No facade -- a decayed mound, not a
 *  proper burrow. */
export function buildUndeadCrumblingMoundGrid(seed: number): BlockGrid {
  return buildVulperiaDenMoundGrid(seed, 2.2, 2, 1.1, { facade: false, jitter: 0.3 });
}

export function meshUndeadGravestone(): THREE.Group {
  const grid = buildUndeadGravestoneGrid();
  const palette = { ashstone: mat('#8a8a85', { map: ashStoneTexture() }) };
  return meshBlockGrid(grid, palette, {});
}

export function meshUndeadBonePile(seed: number): THREE.Group {
  const grid = buildUndeadBonePileGrid(seed);
  const palette = { bone: mat('#d8d0b8') };
  return meshBlockGrid(grid, palette, {});
}

export function meshUndeadCrumblingMound(seed: number): THREE.Group {
  const grid = buildUndeadCrumblingMoundGrid(seed);
  const palette = { earth: mat('#6b6b60', { map: ashStoneTexture() }), grass: mat('#5a5a50') };
  // Force every edge sharp -- a decayed, broken silhouette rather than
  // the vulperia mound's soft organic chamfering (same suppressChamfer
  // mechanism FactionBuildingVariants.ts already uses for undead's
  // "deliberate decay" spire, see FactionBlockProfiles.ts's
  // buildUndeadTierGrid doc comment).
  const opts: MeshBlockGridOptions = { suppressChamfer: () => true };
  return meshBlockGrid(grid, palette, opts);
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

```bash
npx vitest run tests/world/FactionTerritoryProps.test.ts
```

Expected: all pass (9 tests: 5 vulperia + 4 undead).

- [ ] **Step 5: Run `npx tsc --noEmit`, confirm the error count is still 144**

- [ ] **Step 6: Commit**

```bash
git add src/world/buildings/FactionTerritoryProps.ts tests/world/FactionTerritoryProps.test.ts
git commit -m "feat: add undead territory props (gravestone, bone pile, crumbling mound)"
```

---

## Task 4: `FactionTerritoryProps.ts` — fae props

**Files:**
- Modify: `src/world/buildings/FactionTerritoryProps.ts`
- Modify: `tests/world/FactionTerritoryProps.test.ts`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `buildFaeSmallMushroomGrid(): BlockGrid`, `buildFaeLargeMushroomGrid(): BlockGrid`,
  `meshFaeSmallMushroom(): THREE.Group`, `meshFaeMushroomRing(seed: number): THREE.Group`,
  consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/FactionTerritoryProps.test.ts`:

```ts
describe('fae territory props', () => {
  it('small mushroom has a narrower stalk than its cap (classic toadstool silhouette)', () => {
    const grid = buildFaeSmallMushroomGrid();
    let stalkFootprint = 0, capFootprint = 0;
    for (const k of grid.cells.keys()) {
      const [, by] = k.split(',').map(Number);
      if (by === 0) stalkFootprint++;
      if (by === 2) capFootprint++; // cap is the top layer
    }
    expect(capFootprint).toBeGreaterThan(stalkFootprint);
  });

  it('small mushroom cap uses the toadstool material', () => {
    const grid = buildFaeSmallMushroomGrid();
    expect(getMaterialKey(grid, 0, 2, 0)).toBe('cap');
  });

  it('large mushroom is taller than the small mushroom', () => {
    const small = buildFaeSmallMushroomGrid();
    const large = buildFaeLargeMushroomGrid();
    function maxHeight(g: typeof small): number {
      let m = -Infinity;
      for (const k of g.cells.keys()) { const [, by] = k.split(',').map(Number); m = Math.max(m, by!); }
      return m;
    }
    expect(maxHeight(large)).toBeGreaterThan(maxHeight(small));
  });

  it('mushroom ring is a composite of multiple small-mushroom clones arranged in a circle', () => {
    const ring = meshFaeMushroomRing(1);
    // Each clone is its own child Group/Mesh subtree -- expect at least 5
    // top-level children (the "5-6 small mushrooms" from the design).
    expect(ring.children.length).toBeGreaterThanOrEqual(5);
    // Confirm they're actually arranged in a circle, not stacked at the
    // origin: at least two children have distinct (x, z) positions.
    const positions = ring.children.map(c => `${c.position.x.toFixed(3)},${c.position.z.toFixed(3)}`);
    expect(new Set(positions).size).toBeGreaterThan(1);
  });

  it('mushroom ring is deterministic for the same seed', () => {
    const a = meshFaeMushroomRing(7);
    const b = meshFaeMushroomRing(7);
    const posA = a.children.map(c => `${c.position.x.toFixed(6)},${c.position.z.toFixed(6)}`);
    const posB = b.children.map(c => `${c.position.x.toFixed(6)},${c.position.z.toFixed(6)}`);
    expect(posA).toEqual(posB);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
npx vitest run tests/world/FactionTerritoryProps.test.ts -t "fae territory props"
```

Expected: FAIL — the new functions aren't exported yet.

- [ ] **Step 3: Add the fae section to `src/world/buildings/FactionTerritoryProps.ts`**

Append after the undead section:

```ts
// ── Fae ───────────────────────────────────────────────────────────────────────

/** Small scatter-scale toadstool: a 1-block stalk column topped by a 3x3
 *  cap layer -- a genuinely small object (unlike buildFaeStalkGrid's
 *  building-scale minimum of 8 block-levels tall), purpose-built for
 *  ground-level scatter rather than reusing the Fae Court's own
 *  building-scale mushroom-hut profile. */
export function buildFaeSmallMushroomGrid(): BlockGrid {
  const grid = createBlockGrid();
  setBlock(grid, 0, 0, 0, 'stalk');
  setBlock(grid, 0, 1, 0, 'stalk');
  for (let bx = -1; bx <= 1; bx++) {
    for (let bz = -1; bz <= 1; bz++) {
      setBlock(grid, bx, 2, bz, 'cap');
    }
  }
  return grid;
}

/** Taller/wider variant: a 3-block stalk topped by a 5x5 cap layer. */
export function buildFaeLargeMushroomGrid(): BlockGrid {
  const grid = createBlockGrid();
  setBlock(grid, 0, 0, 0, 'stalk');
  setBlock(grid, 0, 1, 0, 'stalk');
  setBlock(grid, 0, 2, 0, 'stalk');
  for (let bx = -2; bx <= 2; bx++) {
    for (let bz = -2; bz <= 2; bz++) {
      setBlock(grid, bx, 3, bz, 'cap');
    }
  }
  return grid;
}

function faeMushroomPalette(): Record<string, THREE.MeshStandardMaterial> {
  return {
    stalk: mat('#d8d8c0', { roughness: 0.6, map: toadstoolTexture() }),
    cap: new THREE.MeshStandardMaterial({
      color: new THREE.Color('#c8ffb0'), map: toadstoolTexture(),
      emissive: new THREE.Color('#a0ff70'), emissiveIntensity: 0.6, roughness: 0.5,
    }),
  };
}

export function meshFaeSmallMushroom(): THREE.Group {
  return meshBlockGrid(buildFaeSmallMushroomGrid(), faeMushroomPalette(), {});
}

export function meshFaeLargeMushroom(): THREE.Group {
  return meshBlockGrid(buildFaeLargeMushroomGrid(), faeMushroomPalette(), {});
}

/** Composite "fairy ring": 5-6 clones of the small mushroom template
 *  arranged in a circle around the scatter point -- not its own BlockGrid,
 *  an arrangement of another prop's mesh (mirrors the Fae Court building's
 *  own "ring of smaller block-built toadstools clustered around the main
 *  one... each a reduced-scale instance of the same grid, not a separate
 *  primitive" pattern in FactionBuildingVariants.ts). Deterministic per
 *  seed via mulberry32 (project convention -- never Math.random()). */
export function meshFaeMushroomRing(seed: number): THREE.Group {
  const ring = new THREE.Group();
  const rand = mulberry32(seed);
  const count = 5 + Math.floor(rand() * 2); // 5 or 6
  const radius = 1.5 + rand() * 0.5; // 1.5-2.0 WU
  const template = meshFaeSmallMushroom();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.3;
    const clone = template.clone();
    clone.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    clone.rotation.y = rand() * Math.PI * 2;
    ring.add(clone);
  }
  return ring;
}
```

Add `import { mulberry32 } from '@/core/prng';` to the top of
`src/world/buildings/FactionTerritoryProps.ts` (alongside the existing `import * as THREE from
'three';` line).

- [ ] **Step 4: Run the tests, confirm they pass**

```bash
npx vitest run tests/world/FactionTerritoryProps.test.ts
```

Expected: all pass (14 tests: 5 vulperia + 4 undead + 5 fae).

- [ ] **Step 5: Run `npx tsc --noEmit`, confirm the error count is still 144**

- [ ] **Step 6: Commit**

```bash
git add src/world/buildings/FactionTerritoryProps.ts tests/world/FactionTerritoryProps.test.ts
git commit -m "feat: add fae territory props (small/large mushroom, mushroom ring)"
```

---

## Task 5: Wire territory dressing into `OverworldScene.ts`

**Files:**
- Modify: `src/scene/OverworldScene.ts`
- Test: `tests/scene/OverworldScene.chunk-scatter-alignment.test.ts` (regression, unmodified),
  `tests/scene/OverworldScene.drawcall-batching.test.ts` (regression, unmodified)

**Interfaces:**
- Consumes: `territoryPlacementProbability`, `findTerritoryFaction` from `@/world/TerritoryDressing`;
  `meshVulperiaWarrenMound`, `meshVulperiaBurrowHole`, `meshVulperiaDenMarker`,
  `meshUndeadGravestone`, `meshUndeadBonePile`, `meshUndeadCrumblingMound`,
  `meshFaeSmallMushroom`, `meshFaeLargeMushroom`, `meshFaeMushroomRing` from
  `@/world/buildings/FactionTerritoryProps`.
- Produces: nothing for later tasks — this is the final task in this plan.

- [ ] **Step 1: Add the `faction` field to `_settlementPositions`**

Find:

```ts
  private readonly _settlementPositions: Array<{ name: string; worldPos: THREE.Vector3; radius: number }> = [];
```

Replace with:

```ts
  private readonly _settlementPositions: Array<{ name: string; worldPos: THREE.Vector3; radius: number; faction: SettlementFaction }> = [];
```

Add `import type { SettlementFaction } from '@/overworld-studio';` to `OverworldScene.ts`'s import
block (alongside its other `@/overworld-studio` / `@/world/...` type imports).

Find the real-settlement push site (inside `_buildSettlements()`):

```ts
      this._settlementPositions.push({
        name:     plan.name,
        worldPos: new THREE.Vector3(wx, wy, wz),
        radius,
      });
```

Replace with:

```ts
      this._settlementPositions.push({
        name:     plan.name,
        worldPos: new THREE.Vector3(wx, wy, wz),
        radius,
        faction:  plan.faction,
      });
```

Find the dev-preview push site (inside `_buildStudioSettlementPreview()`):

```ts
    this._settlementPositions.push({
      name: `${payload.name} (Preview)`,
      worldPos: new THREE.Vector3(anchorWx, centreElev, anchorWz),
      radius: 16, // dev-preview only — no boundary-crossing gameplay hookup needed here
    });
```

Replace with:

```ts
    this._settlementPositions.push({
      name: `${payload.name} (Preview)`,
      worldPos: new THREE.Vector3(anchorWx, centreElev, anchorWz),
      radius: 16, // dev-preview only — no boundary-crossing gameplay hookup needed here
      faction: payload.faction,
    });
```

- [ ] **Step 2: Run `npx tsc --noEmit`, confirm the error count is still 144**

This step alone has no new tests (it's a type/field addition) — the compiler is the check that
both push sites now supply a real `faction` value.

- [ ] **Step 3: Add the territory prop pool**

Add this import near `OverworldScene.ts`'s other `@/world/buildings/...` imports:

```ts
import { territoryPlacementProbability, findTerritoryFaction } from '@/world/TerritoryDressing';
import {
  meshVulperiaWarrenMound, meshVulperiaBurrowHole, meshVulperiaDenMarker,
  meshUndeadGravestone, meshUndeadBonePile, meshUndeadCrumblingMound,
  meshFaeSmallMushroom, meshFaeLargeMushroom, meshFaeMushroomRing,
} from '@/world/buildings/FactionTerritoryProps';
```

Add this private field near `_settlementPositions`'s own declaration:

```ts
  /** Pre-built territory-dressing prop pool, one small set of variants per
   *  faction with a batch-1 implementation (vulperia/undead/fae) — built
   *  once at construction (see _buildTerritoryPropPool()), cloned (never
   *  rebuilt) at each qualifying scatter point in _buildChunkScatter().
   *  Phase 6 batch 1, see docs/superpowers/specs/2026-08-31-race-
   *  territory-dressing-design.md §2.5. */
  private readonly _territoryPropPool: Partial<Record<SettlementFaction, THREE.Group[]>> = {};
```

Add this new private method right after `_buildSettlements()`'s own closing brace:

```ts
  /** Builds the small pre-built pool of territory-dressing prop variants
   *  for every faction with a batch-1 implementation. Called once from
   *  the constructor — see the call site added in the constructor's
   *  init sequence just below _buildSettlements(). */
  private _buildTerritoryPropPool(): void {
    this._territoryPropPool.vulperia = [
      meshVulperiaWarrenMound(1), meshVulperiaWarrenMound(2),
      meshVulperiaBurrowHole(3), meshVulperiaDenMarker(),
    ];
    this._territoryPropPool.undead = [
      meshUndeadGravestone(), meshUndeadBonePile(4),
      meshUndeadBonePile(5), meshUndeadCrumblingMound(6),
    ];
    this._territoryPropPool.fae = [
      meshFaeSmallMushroom(), meshFaeSmallMushroom(),
      meshFaeLargeMushroom(), meshFaeMushroomRing(7),
    ];
  }
```

Find the constructor's init sequence (where `console.log('[OverworldScene] _buildSettlements...')`
/ `this._buildSettlements(worldData);` are called — see the earlier `_buildSettlements` call site)
and add the pool-build call right after it:

```ts
    console.log('[OverworldScene] _buildSettlements...');
    this._buildSettlements(worldData);
```

Replace with:

```ts
    console.log('[OverworldScene] _buildSettlements...');
    this._buildSettlements(worldData);
    this._buildTerritoryPropPool();
```

- [ ] **Step 4: Run `npx tsc --noEmit`, confirm the error count is still 144**

- [ ] **Step 5: Wire territory-prop substitution into `_buildChunkScatter()`**

Find the tree-scatter loop:

```ts
    const treePts = poissonDisk(chunkWorldSize, chunkWorldSize, 5.5, rand);
    for (const [px, pz] of treePts) {
      const wx = originX + px;
      const wz = originZ + pz;
      const d = Math.sqrt(wx * wx + wz * wz);
      if (d < FR * T + 5) continue; // tower clear-zone
      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const cell = this._wg.get(c, r);
      if (!isScatterAllowed(cell, 'tree')) continue;
      const tree = this._makeTree(rand, cell.biome, wx, wz);
      tree.position.set(wx, cell.elevation * SH, wz);
      tree.rotation.y = rand() * Math.PI * 2;
      tree.userData.scatterKind = 'tree';
      group.add(tree);
    }

    const rockPts = poissonDisk(chunkWorldSize, chunkWorldSize, 8, rand);
    for (const [px, pz] of rockPts) {
      const wx = originX + px;
      const wz = originZ + pz;
      const d = Math.sqrt(wx * wx + wz * wz);
      if (d < FR * T + 6) continue;
      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const cell = this._wg.get(c, r);
      if (!isScatterAllowed(cell, 'rock')) continue;
      const rock = this._makeRock(rand, wx, wz);
      rock.position.set(wx, cell.elevation * SH, wz);
      rock.userData.scatterKind = 'rock';
      group.add(rock);
    }
```

Replace with:

```ts
    const treePts = poissonDisk(chunkWorldSize, chunkWorldSize, 5.5, rand);
    for (const [px, pz] of treePts) {
      const wx = originX + px;
      const wz = originZ + pz;
      const d = Math.sqrt(wx * wx + wz * wz);
      if (d < FR * T + 5) continue; // tower clear-zone
      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const cell = this._wg.get(c, r);
      if (!isScatterAllowed(cell, 'tree')) continue;
      const territoryProp = this._tryPlaceTerritoryProp(wx, wz, cell.elevation * SH, rand);
      if (territoryProp) { group.add(territoryProp); continue; }
      const tree = this._makeTree(rand, cell.biome, wx, wz);
      tree.position.set(wx, cell.elevation * SH, wz);
      tree.rotation.y = rand() * Math.PI * 2;
      tree.userData.scatterKind = 'tree';
      group.add(tree);
    }

    const rockPts = poissonDisk(chunkWorldSize, chunkWorldSize, 8, rand);
    for (const [px, pz] of rockPts) {
      const wx = originX + px;
      const wz = originZ + pz;
      const d = Math.sqrt(wx * wx + wz * wz);
      if (d < FR * T + 6) continue;
      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const cell = this._wg.get(c, r);
      if (!isScatterAllowed(cell, 'rock')) continue;
      const territoryProp = this._tryPlaceTerritoryProp(wx, wz, cell.elevation * SH, rand);
      if (territoryProp) { group.add(territoryProp); continue; }
      const rock = this._makeRock(rand, wx, wz);
      rock.position.set(wx, cell.elevation * SH, wz);
      rock.userData.scatterKind = 'rock';
      group.add(rock);
    }
```

Add this new private method right before `_buildChunkScatter()`:

```ts
  /** Phase 6 batch 1: if (wx, wz) falls within a settlement's territory
   *  (a faction with a prop pool in this batch — vulperia/undead/fae),
   *  roll the distance-based gradient probability and, on a hit, return a
   *  cloned territory-dressing prop instead of the caller's normal
   *  tree/rock. Returns null (caller falls through to its normal scatter)
   *  when outside every territory, when the roll misses, or when the
   *  matched faction has no batch-1 prop pool yet. Cloning (not
   *  rebuilding) the pooled THREE.Group keeps this cheap per scatter
   *  point — see _buildTerritoryPropPool(). */
  private _tryPlaceTerritoryProp(wx: number, wz: number, wy: number, rand: () => number): THREE.Group | null {
    const match = findTerritoryFaction({ x: wx, z: wz }, this._settlementPositions);
    if (!match) return null;
    const pool = this._territoryPropPool[match.faction];
    if (!pool || pool.length === 0) return null;
    const probability = territoryPlacementProbability(match.distanceFromCenter, match.territoryRadius);
    if (rand() >= probability) return null;
    const template = pool[Math.floor(rand() * pool.length)]!;
    const prop = template.clone();
    prop.position.set(wx, wy, wz);
    prop.rotation.y = rand() * Math.PI * 2;
    prop.userData.scatterKind = 'territoryProp';
    return prop;
  }
```

- [ ] **Step 6: Run `npx tsc --noEmit`, confirm the error count is still 144**

- [ ] **Step 7: Run the scatter/settlement-related scene test suite**

```bash
npx vitest run tests/scene/OverworldScene.chunk-scatter-alignment.test.ts tests/scene/OverworldScene.chunk-terrain-alignment.test.ts tests/scene/OverworldScene.drawcall-batching.test.ts tests/scene/OverworldScene.chunk-collider-streaming.test.ts tests/scene/OverworldScene.settlement-parity.test.ts
```

Expected: all pass unmodified. If `OverworldScene.settlement-parity.test.ts`'s snapshot fails,
this is the same legitimate-shift pattern documented inline in that test (a new mesh category —
`scatterKind: 'territoryProp'` — sharing the `_buildingGroups`-adjacent merge/dispose array could
shift a merged-mesh-group count for seed 1); if it fails, update the snapshot with `npx vitest run
tests/scene/OverworldScene.settlement-parity.test.ts -u` and add a dated note to that test's
comment block (see how Phase 4/5's own plans documented their snapshot shifts for the exact
wording style) — but only after confirming the actual counts still look reasonable (not zeroed
out or wildly different), not a blind accept.

- [ ] **Step 8: Run the full project test suite**

```bash
npx vitest run
```

Expected: the same pre-existing baseline failures documented in
`docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md` (main.startup.smoke.test.ts×3,
enemyLoader.test.ts×3, towerGenerator.test.ts×2, talentSystem.test.ts×3, WaterMaterial.test.ts×1
— 12 total), zero new failures beyond a possible legitimate settlement-parity snapshot shift (Step
7). Re-run any suspicious failure in isolation before concluding it's a real regression (this
project's documented sandbox-contention flakes are `OverworldScene.chunk-scatter-alignment.test.ts`
and `tests/world/ResourceNodePlacer.test.ts` — both pass cleanly in isolation).

- [ ] **Step 9: Update the roadmap doc**

In `docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md`'s Phase 6 section, replace the
`- [ ]` checkboxes with a "🔶 BATCH 1 DONE (2026-08-31)" status write-up (matching the style of
prior phases' write-ups): what shipped (`TerritoryDressing.ts`, `FactionTerritoryProps.ts`'s
vulperia/undead/fae props, the `_buildChunkScatter()` wiring), the explicit note that elven/
dwarven/orcish/vampire/slime/human remain concept-only pending their own batch, and the actual
test/tsc results from Steps 7–8 above. Use "🔶 BATCH 1 DONE" rather than a plain "✅ DONE" so the
roadmap itself visibly signals this phase isn't fully complete yet.

- [ ] **Step 10: Commit and push to `main`**

```bash
git add src/scene/OverworldScene.ts docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md
git commit -m "feat: wire race territory dressing into overworld scatter (batch 1: vulperia/undead/fae)"
git push origin HEAD:main
```
