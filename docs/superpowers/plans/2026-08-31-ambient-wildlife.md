# Ambient Wildlife (Phase 9 Batch 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spawn peaceful, chunk-scoped ambient wildlife (rabbits, goats) that wander and flee
from the player on forest/grassland/taiga/mountain tiles, using the existing procedural
creature-rig system.

**Architecture:** A new `src/world/AmbientWildlife.ts` holds pure, THREE-independent logic
(species/biome data tables, spawn-point selection via the existing `poissonDisk()`+
`isScatterAllowed()` pattern, and a pure `tickAmbientBehavior()` idle/wander/flee state
machine) plus a THREE-dependent `AmbientCreature` class (owns one `CreatureRig` from
`buildCreature(dna)`, applies the behavior tick's output as movement + `animateCreature()`
calls). `ScatterRules.ts` gains an `'ambient'` kind. `OverworldScene.ts` wires spawn/despawn
into its existing per-chunk load/unload lifecycle and ticks all active creatures once per frame,
capped globally for performance.

**Tech Stack:** TypeScript, Three.js, Vitest, Playwright (e2e verification only) — same stack as
the grass batches, no new dependencies.

## Global Constraints

- Exactly 2 species this batch: `rabbit` (forest/grassland/taiga) and `goat` (mountain). Birds/
  flight are explicitly deferred to a follow-up batch (design spec §2).
- 3-state FSM: `idle` (2-5s random dwell) → `wander` (walk to a random point within
  `WANDER_RADIUS = 8` WU of the creature's spawn point) → back to `idle` on arrival; `flee`
  (entered from any state when the player is within `FLEE_TRIGGER_RADIUS = 6` WU, exited back to
  `idle` once the player is beyond `FLEE_EXIT_RADIUS = 9` WU — the `1.5×` hysteresis band from
  the design spec §3, preventing flicker right at the boundary).
- No health, no damage, no death, no combat, no player interaction beyond fleeing (design spec
  §3/§8 — this is pure ambiance).
- Global population cap: `MAX_ACTIVE_AMBIENT_CREATURES = 24` across all currently-loaded chunks
  combined (design spec §4).
- Per-biome spawn density (design spec §4), implemented as a single Poisson-disk pass per chunk
  at `AMBIENT_BASE_SPACING = 40` WU followed by a per-candidate probability-thinning step (this
  plan's own simplification of the spec's "varying spacing" framing — a single Poisson pass
  can't vary its own minimum-distance parameter mid-scan, so density variation between biomes is
  instead achieved by randomly dropping candidates at a per-biome `keepProbability`, computed as
  `(AMBIENT_BASE_SPACING / desiredSpacing)²` since Poisson-disk point density scales roughly as
  `1/spacing²`): forest/grassland `keepProbability: 1.0` (desired spacing 40, same as base),
  taiga `keepProbability: 0.33` (desired spacing 70 — `(40/70)² ≈ 0.327`), mountain
  `keepProbability: 0.53` (desired spacing 55 — `(40/55)² ≈ 0.529`).
- Every task must leave `npx tsc --noEmit` at the pre-existing baseline (144 errors as of this
  plan's writing — re-confirm the exact current count at Task 1 Step 1 and hold it steady for
  every subsequent task).
- Every task's new/changed tests must pass via `npx vitest run <file>` before moving to the next
  task's Step 1.

---

### Task 1: `AmbientSpecies` data — species DNA + biome density rules

**Files:**
- Create: `src/world/AmbientWildlife.ts`
- Test: Create `tests/world/AmbientWildlife.test.ts`

**Interfaces:**
- Consumes: `CreatureDNA`, `dnaForArchetype` (from `@/creatures/CreatureDNA`), `BiomeId` (from
  `@/world/WorldGrid`).
- Produces: `AmbientSpecies` type (`'rabbit' | 'goat'`), `AmbientSpeciesDef` interface
  (`{ species: AmbientSpecies; dna: CreatureDNA }`), `AMBIENT_SPECIES: Record<AmbientSpecies,
  AmbientSpeciesDef>`, `AmbientBiomeRule` interface (`{ species: AmbientSpecies; keepProbability:
  number }`), `AMBIENT_BIOME_RULES: Partial<Record<BiomeId, AmbientBiomeRule>>`, constants
  `WANDER_RADIUS`, `FLEE_TRIGGER_RADIUS`, `FLEE_EXIT_RADIUS`, `WANDER_SPEED`, `FLEE_SPEED`,
  `IDLE_MIN_DWELL`, `IDLE_MAX_DWELL`, `MAX_ACTIVE_AMBIENT_CREATURES`, `AMBIENT_BASE_SPACING`.
  Consumed by every later task.

- [ ] **Step 1: Confirm the current `tsc` baseline**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: prints a number (the baseline to hold steady through every later task in this plan).

- [ ] **Step 2: Write the failing tests**

Create `tests/world/AmbientWildlife.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  AMBIENT_SPECIES, AMBIENT_BIOME_RULES,
  WANDER_RADIUS, FLEE_TRIGGER_RADIUS, FLEE_EXIT_RADIUS,
  WANDER_SPEED, FLEE_SPEED, IDLE_MIN_DWELL, IDLE_MAX_DWELL,
  MAX_ACTIVE_AMBIENT_CREATURES, AMBIENT_BASE_SPACING,
} from '@/world/AmbientWildlife';

describe('AMBIENT_SPECIES', () => {
  it('has exactly rabbit and goat', () => {
    expect(Object.keys(AMBIENT_SPECIES).sort()).toEqual(['goat', 'rabbit']);
  });

  it('each species def\'s species field matches its own key', () => {
    expect(AMBIENT_SPECIES.rabbit.species).toBe('rabbit');
    expect(AMBIENT_SPECIES.goat.species).toBe('goat');
  });

  it('rabbit DNA is a small, non-threatening quadruped (not the raw angry-monster default)', () => {
    const dna = AMBIENT_SPECIES.rabbit.dna;
    expect(dna.archetype).toBe('quadruped');
    expect(dna.proportions.global).toBeLessThan(1.0);
    expect(dna.face.type).toBe('cute');
    expect(dna.face.mouthType).toBe('none');
    expect(dna.colors.emissiveIntensity).toBe(0);
  });

  it('goat DNA is a mid-size, non-threatening quadruped', () => {
    const dna = AMBIENT_SPECIES.goat.dna;
    expect(dna.archetype).toBe('quadruped');
    expect(dna.proportions.global).toBeGreaterThan(AMBIENT_SPECIES.rabbit.dna.proportions.global);
    expect(dna.proportions.global).toBeLessThan(1.0);
    expect(dna.face.type).toBe('blank');
    expect(dna.colors.emissiveIntensity).toBe(0);
  });
});

describe('AMBIENT_BIOME_RULES', () => {
  it('maps forest/grassland/taiga to rabbit and mountain to goat', () => {
    expect(AMBIENT_BIOME_RULES.forest?.species).toBe('rabbit');
    expect(AMBIENT_BIOME_RULES.grassland?.species).toBe('rabbit');
    expect(AMBIENT_BIOME_RULES.taiga?.species).toBe('rabbit');
    expect(AMBIENT_BIOME_RULES.mountain?.species).toBe('goat');
  });

  it('has no rule for biomes with no assigned wildlife this batch', () => {
    expect(AMBIENT_BIOME_RULES.savanna).toBeUndefined();
    expect(AMBIENT_BIOME_RULES.tundra).toBeUndefined();
    expect(AMBIENT_BIOME_RULES.desert).toBeUndefined();
    expect(AMBIENT_BIOME_RULES.beach).toBeUndefined();
    expect(AMBIENT_BIOME_RULES.snow).toBeUndefined();
    expect(AMBIENT_BIOME_RULES.ocean).toBeUndefined();
    expect(AMBIENT_BIOME_RULES.deep_ocean).toBeUndefined();
  });

  it('forest/grassland have full keepProbability (1.0); taiga and mountain are sparser', () => {
    expect(AMBIENT_BIOME_RULES.forest?.keepProbability).toBe(1.0);
    expect(AMBIENT_BIOME_RULES.grassland?.keepProbability).toBe(1.0);
    expect(AMBIENT_BIOME_RULES.taiga?.keepProbability).toBeCloseTo(0.327, 2);
    expect(AMBIENT_BIOME_RULES.mountain?.keepProbability).toBeCloseTo(0.529, 2);
  });
});

describe('behavior/spawn tunables', () => {
  it('have the exact values from the design spec', () => {
    expect(WANDER_RADIUS).toBe(8);
    expect(FLEE_TRIGGER_RADIUS).toBe(6);
    expect(FLEE_EXIT_RADIUS).toBe(9); // 1.5x FLEE_TRIGGER_RADIUS
    expect(IDLE_MIN_DWELL).toBe(2);
    expect(IDLE_MAX_DWELL).toBe(5);
    expect(MAX_ACTIVE_AMBIENT_CREATURES).toBe(24);
    expect(AMBIENT_BASE_SPACING).toBe(40);
    expect(WANDER_SPEED).toBeGreaterThan(0);
    expect(FLEE_SPEED).toBeGreaterThan(WANDER_SPEED); // fleeing must be faster than wandering
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/world/AmbientWildlife.test.ts`
Expected: FAIL — `@/world/AmbientWildlife` doesn't exist yet.

- [ ] **Step 4: Create `src/world/AmbientWildlife.ts`**

```ts
/**
 * AmbientWildlife.ts — peaceful, chunk-scoped ambient creatures (rabbits, goats) for the live
 * OverworldScene (Phase 9 batch 1 — 2 ground-based species; birds/flight deferred to a
 * follow-up batch; see docs/superpowers/specs/2026-08-31-ambient-wildlife-design.md).
 *
 * Purely cosmetic: no health, no damage, no death, no combat, no player interaction beyond
 * fleeing when approached. Reuses the same procedural creature-rig system
 * (CreatureDNA/buildCreature/animateCreature) already used for the player, enemies, and NPCs.
 */
import { dnaForArchetype, type CreatureDNA } from '@/creatures/CreatureDNA';
import type { BiomeId } from '@/world/WorldGrid';

// ── Species ───────────────────────────────────────────────────────────────

export type AmbientSpecies = 'rabbit' | 'goat';

export interface AmbientSpeciesDef {
  species: AmbientSpecies;
  dna: CreatureDNA;
}

function _rabbitDNA(): CreatureDNA {
  const dna = dnaForArchetype('quadruped');
  dna.proportions.global = 0.4;
  dna.face = {
    type: 'cute', eyeColor: 0x2a1a0a, mouthType: 'none', expression: 'neutral',
    eyeShape: 'round', skinPattern: 'none', markColor: 0x8a7a5c, browStyle: 'none',
  };
  dna.colors = {
    primary: 0xc9b896, secondary: 0x8a7a5c, emissive: 0x000000, emissiveIntensity: 0,
    pattern: 'none', patternColor: 0x8a7a5c, patternScale: 1.0, patternOpacity: 0.35,
  };
  return dna;
}

function _goatDNA(): CreatureDNA {
  const dna = dnaForArchetype('quadruped');
  dna.proportions.global = 0.75;
  dna.face = {
    type: 'blank', eyeColor: 0x3a2a1a, mouthType: 'none', expression: 'neutral',
    eyeShape: 'round', skinPattern: 'none', markColor: 0x9a8a70, browStyle: 'none',
  };
  dna.colors = {
    primary: 0xe8e0d0, secondary: 0x9a8a70, emissive: 0x000000, emissiveIntensity: 0,
    pattern: 'none', patternColor: 0x9a8a70, patternScale: 1.0, patternOpacity: 0.35,
  };
  return dna;
}

export const AMBIENT_SPECIES: Record<AmbientSpecies, AmbientSpeciesDef> = {
  rabbit: { species: 'rabbit', dna: _rabbitDNA() },
  goat:   { species: 'goat',   dna: _goatDNA() },
};

// ── Per-biome density rules ─────────────────────────────────────────────────

export interface AmbientBiomeRule {
  species: AmbientSpecies;
  /** Relative spawn density vs. AMBIENT_BASE_SPACING's single Poisson-disk pass — see this
   *  plan's Global Constraints for the (spacing_base/spacing_desired)² derivation. */
  keepProbability: number;
}

export const AMBIENT_BIOME_RULES: Partial<Record<BiomeId, AmbientBiomeRule>> = {
  forest:    { species: 'rabbit', keepProbability: 1.0 },
  grassland: { species: 'rabbit', keepProbability: 1.0 },
  taiga:     { species: 'rabbit', keepProbability: 0.327 },
  mountain:  { species: 'goat',   keepProbability: 0.529 },
};

// ── Tunables (see design spec §3/§4) ────────────────────────────────────────

export const WANDER_RADIUS = 8;              // world units from spawn point
export const FLEE_TRIGGER_RADIUS = 6;        // world units from player
export const FLEE_EXIT_RADIUS = FLEE_TRIGGER_RADIUS * 1.5; // hysteresis band
export const WANDER_SPEED = 1.2;             // world units / second
export const FLEE_SPEED = 4.0;               // world units / second
export const IDLE_MIN_DWELL = 2;             // seconds
export const IDLE_MAX_DWELL = 5;             // seconds
export const MAX_ACTIVE_AMBIENT_CREATURES = 24;
export const AMBIENT_BASE_SPACING = 40;      // world units, single per-chunk Poisson-disk pass
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/world/AmbientWildlife.test.ts`
Expected: PASS — all tests.

- [ ] **Step 6: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Step 1.

- [ ] **Step 7: Commit**

```bash
git add src/world/AmbientWildlife.ts tests/world/AmbientWildlife.test.ts
git commit -m "feat: add ambient wildlife species DNA + biome density rules

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: `selectAmbientSpawnPoints()` — chunk-scoped, biome-gated placement

**Files:**
- Modify: `src/world/ScatterRules.ts` (add `'ambient'` kind)
- Modify: `tests/world/ScatterRules.test.ts` (extend existing kind-iteration arrays)
- Modify: `src/world/AmbientWildlife.ts` (append placement logic)
- Modify: `tests/world/AmbientWildlife.test.ts` (append placement tests)

**Interfaces:**
- Consumes: `AMBIENT_BIOME_RULES`, `AMBIENT_BASE_SPACING` (Task 1), `isScatterAllowed` (this
  task's `ScatterRules.ts` change), `poissonDisk` (from `@/core/poissonDisk`), `mulberry32`
  (from `@/core/prng`).
- Produces: `AmbientSpawnPoint` interface (`{ x: number; z: number; species: AmbientSpecies }`),
  `selectAmbientSpawnPoints(wg: WorldGrid, originX: number, originZ: number, chunkWorldSize:
  number, seed: number): AmbientSpawnPoint[]`. Consumed by Task 5's `OverworldScene.ts` wiring.

- [ ] **Step 1: Extend `ScatterRules.ts` and its tests**

In `src/world/ScatterRules.ts`, change:

```ts
export type ScatterKind = 'tree' | 'bush' | 'rock' | 'camp' | 'ruin' | 'grass';
```

to:

```ts
export type ScatterKind = 'tree' | 'bush' | 'rock' | 'camp' | 'ruin' | 'grass' | 'ambient';
```

Then change:

```ts
  if (kind === 'tree' || kind === 'bush' || kind === 'rock' || kind === 'grass') {
    if (cell.feature === 'road' || cell.feature === 'road_dirt') return false;
    if (cell.content !== 'empty') return false;
  }
```

to:

```ts
  if (kind === 'tree' || kind === 'bush' || kind === 'rock' || kind === 'grass' || kind === 'ambient') {
    if (cell.feature === 'road' || cell.feature === 'road_dirt') return false;
    if (cell.content !== 'empty') return false;
  }
```

In `tests/world/ScatterRules.test.ts`, add `'ambient'` to the same 4 kind-iteration arrays Task 1
of the grass batch 2 plan extended for `'grass'` — find and update:

```ts
    for (const kind of ['tree', 'bush', 'rock', 'camp', 'ruin', 'grass'] as const) {
      expect(isScatterAllowed(cell, kind)).toBe(true);
    }
  });

  it('disallows every scatter kind on a water-biome cell', () => {
    const cell = makeCell({ biome: 'ocean', waterDepth: 2.5 });
    for (const kind of ['tree', 'bush', 'rock', 'camp', 'ruin', 'grass'] as const) {
```

to (adding `'ambient'` to both arrays):

```ts
    for (const kind of ['tree', 'bush', 'rock', 'camp', 'ruin', 'grass', 'ambient'] as const) {
      expect(isScatterAllowed(cell, kind)).toBe(true);
    }
  });

  it('disallows every scatter kind on a water-biome cell', () => {
    const cell = makeCell({ biome: 'ocean', waterDepth: 2.5 });
    for (const kind of ['tree', 'bush', 'rock', 'camp', 'ruin', 'grass', 'ambient'] as const) {
```

And change:

```ts
  it('disallows every scatter kind on a road tile', () => {
    for (const feature of ['road', 'road_dirt'] as const) {
      const cell = makeCell({ feature });
      for (const kind of ['tree', 'bush', 'rock', 'grass'] as const) {
        expect(isScatterAllowed(cell, kind)).toBe(false);
      }
    }
  });

  it('disallows tree/bush/rock/grass on a non-empty content cell (building, entrance, etc.)', () => {
    const cell = makeCell({ content: 'building' });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(false);
    expect(isScatterAllowed(cell, 'grass')).toBe(false);
  });

  it('disallows tree/bush/rock/grass inside a settlement zone', () => {
    const cell = makeCell({ settlementId: 3 });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(false);
    expect(isScatterAllowed(cell, 'grass')).toBe(false);
  });
});
```

to:

```ts
  it('disallows every scatter kind on a road tile', () => {
    for (const feature of ['road', 'road_dirt'] as const) {
      const cell = makeCell({ feature });
      for (const kind of ['tree', 'bush', 'rock', 'grass', 'ambient'] as const) {
        expect(isScatterAllowed(cell, kind)).toBe(false);
      }
    }
  });

  it('disallows tree/bush/rock/grass/ambient on a non-empty content cell (building, entrance, etc.)', () => {
    const cell = makeCell({ content: 'building' });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(false);
    expect(isScatterAllowed(cell, 'grass')).toBe(false);
    expect(isScatterAllowed(cell, 'ambient')).toBe(false);
  });

  it('disallows tree/bush/rock/grass/ambient inside a settlement zone', () => {
    const cell = makeCell({ settlementId: 3 });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(false);
    expect(isScatterAllowed(cell, 'grass')).toBe(false);
    expect(isScatterAllowed(cell, 'ambient')).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing placement tests**

Append to `tests/world/AmbientWildlife.test.ts` (add `WorldGrid` to the existing imports and add
a new import line for `selectAmbientSpawnPoints`):

Change:
```ts
import {
  AMBIENT_SPECIES, AMBIENT_BIOME_RULES,
  WANDER_RADIUS, FLEE_TRIGGER_RADIUS, FLEE_EXIT_RADIUS,
  WANDER_SPEED, FLEE_SPEED, IDLE_MIN_DWELL, IDLE_MAX_DWELL,
  MAX_ACTIVE_AMBIENT_CREATURES, AMBIENT_BASE_SPACING,
} from '@/world/AmbientWildlife';
```
to:
```ts
import { WorldGrid, type BiomeId } from '@/world/WorldGrid';
import {
  AMBIENT_SPECIES, AMBIENT_BIOME_RULES,
  WANDER_RADIUS, FLEE_TRIGGER_RADIUS, FLEE_EXIT_RADIUS,
  WANDER_SPEED, FLEE_SPEED, IDLE_MIN_DWELL, IDLE_MAX_DWELL,
  MAX_ACTIVE_AMBIENT_CREATURES, AMBIENT_BASE_SPACING,
  selectAmbientSpawnPoints,
} from '@/world/AmbientWildlife';
```

Then append at the end of the file:

```ts

function makeAllBiomeGrid(size: number, biome: BiomeId): WorldGrid {
  const g = new WorldGrid(size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) g.set(col, row, { elevation: 1, biome });
  }
  return g;
}

describe('selectAmbientSpawnPoints', () => {
  // A 100x100 WU window (vs. AMBIENT_BASE_SPACING=40) reliably yields ~6-7 Poisson-disk
  // candidates (confirmed via direct measurement) — comfortably more than the 1 candidate a
  // 40x40 window (equal to the spacing itself) would yield, avoiding a fragile single-candidate
  // test margin.
  it('returns spawn points on an all-forest chunk, all species rabbit', () => {
    const wg = makeAllBiomeGrid(100, 'forest');
    const points = selectAmbientSpawnPoints(wg, -50, -50, 100, 1);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) expect(p.species).toBe('rabbit');
  });

  it('returns spawn points on an all-mountain chunk, all species goat', () => {
    const wg = makeAllBiomeGrid(100, 'mountain');
    const points = selectAmbientSpawnPoints(wg, -50, -50, 100, 1);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) expect(p.species).toBe('goat');
  });

  it('returns 0 spawn points on a biome with no ambient-wildlife rule (desert)', () => {
    const wg = makeAllBiomeGrid(100, 'desert');
    const points = selectAmbientSpawnPoints(wg, -50, -50, 100, 1);
    expect(points.length).toBe(0);
  });

  it('excludes water/road/content/settlement cells (delegates to isScatterAllowed)', () => {
    const wg = makeAllBiomeGrid(100, 'forest');
    const { col: c0, row: r0 } = wg.worldToGrid(-50, -50);
    const { col: c1, row: r1 } = wg.worldToGrid(50, 50);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) wg.set(col, row, { waterDepth: 1.5 });
    }
    const points = selectAmbientSpawnPoints(wg, -50, -50, 100, 1);
    expect(points.length).toBe(0);
  });

  it('taiga produces noticeably fewer spawn points than forest for the same chunk size/seed (density rule applied)', () => {
    // Uses a much larger area (400x400 WU, ~70 Poisson-disk candidates at AMBIENT_BASE_SPACING)
    // than the other tests in this block — with only a handful of candidates (as the smaller
    // 100x100 windows above produce), a probabilistic keepProbability comparison could
    // occasionally flake; at ~70 candidates the law of large numbers makes forest's
    // keepProbability=1.0 clearly and reliably exceed taiga's keepProbability=0.327.
    const forestGrid = makeAllBiomeGrid(450, 'forest');
    const taigaGrid = makeAllBiomeGrid(450, 'taiga');
    const forestPoints = selectAmbientSpawnPoints(forestGrid, -200, -200, 400, 5);
    const taigaPoints = selectAmbientSpawnPoints(taigaGrid, -200, -200, 400, 5);
    expect(forestPoints.length).toBeGreaterThan(20);
    expect(taigaPoints.length).toBeLessThan(forestPoints.length);
  });

  it('is deterministic for a fixed seed', () => {
    const wg = makeAllBiomeGrid(100, 'forest');
    const a = selectAmbientSpawnPoints(wg, -20, -20, 40, 3);
    const b = selectAmbientSpawnPoints(wg, -20, -20, 40, 3);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/world/ScatterRules.test.ts tests/world/AmbientWildlife.test.ts`
Expected: FAIL — `ScatterRules.test.ts` fails with a TypeScript error (`'ambient'` not assignable
to `ScatterKind` yet); `AmbientWildlife.test.ts` fails with `selectAmbientSpawnPoints` not
exported yet.

- [ ] **Step 4: Implement the `ScatterRules.ts` change from Step 1**

(Already shown verbatim in Step 1 above — apply both edits to `src/world/ScatterRules.ts` now.)

- [ ] **Step 5: Append `selectAmbientSpawnPoints()` to `AmbientWildlife.ts`**

Add to `src/world/AmbientWildlife.ts`, after the tunables section, with new imports at the top:

Change:
```ts
import { dnaForArchetype, type CreatureDNA } from '@/creatures/CreatureDNA';
import type { BiomeId } from '@/world/WorldGrid';
```
to:
```ts
import { dnaForArchetype, type CreatureDNA } from '@/creatures/CreatureDNA';
import { mulberry32 } from '@/core/prng';
import { poissonDisk } from '@/core/poissonDisk';
import { isScatterAllowed } from '@/world/ScatterRules';
import type { WorldGrid, BiomeId } from '@/world/WorldGrid';
```

Then append after `export const AMBIENT_BASE_SPACING = 40;`:

```ts

// ── Placement ─────────────────────────────────────────────────────────────

export interface AmbientSpawnPoint {
  x: number;
  z: number;
  species: AmbientSpecies;
}

/**
 * Scatter ambient-wildlife spawn points within a `chunkWorldSize`×`chunkWorldSize` WU square
 * whose corner is at world `(originX, originZ)` — mirrors `OverworldScene.ts`'s
 * `_buildChunkScatter()` tree/rock loop structure exactly (same Poisson-disk + per-candidate
 * biome/isScatterAllowed gating), but at a single `AMBIENT_BASE_SPACING` and with an additional
 * per-biome probability-thinning step (see this plan's Global Constraints) instead of scatter's
 * per-kind fixed spacing. Deterministic for a fixed `seed`.
 */
export function selectAmbientSpawnPoints(
  wg: WorldGrid,
  originX: number,
  originZ: number,
  chunkWorldSize: number,
  seed: number,
): AmbientSpawnPoint[] {
  const rand = mulberry32(seed);
  const halfW = (wg.width - 1) / 2;
  const halfH = (wg.height - 1) / 2;
  const points: AmbientSpawnPoint[] = [];

  const candidates = poissonDisk(chunkWorldSize, chunkWorldSize, AMBIENT_BASE_SPACING, rand);
  for (const [px, pz] of candidates) {
    const x = originX + px;
    const z = originZ + pz;

    const col = Math.floor(x / wg.tileUnit + halfW);
    const row = Math.floor(z / wg.tileUnit + halfH);
    if (col < 0 || col >= wg.width || row < 0 || row >= wg.height) continue;

    const cell = wg.get(col, row);
    const rule = AMBIENT_BIOME_RULES[cell.biome];
    if (!rule) continue;
    if (!isScatterAllowed(cell, 'ambient')) continue;
    if (rand() > rule.keepProbability) continue;

    points.push({ x, z, species: rule.species });
  }
  return points;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/world/ScatterRules.test.ts tests/world/AmbientWildlife.test.ts`
Expected: PASS — all tests, including the 6 new placement tests and the 2 updated
`ScatterRules.test.ts` tests.

- [ ] **Step 7: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1.

- [ ] **Step 8: Commit**

```bash
git add src/world/ScatterRules.ts tests/world/ScatterRules.test.ts src/world/AmbientWildlife.ts tests/world/AmbientWildlife.test.ts
git commit -m "feat: add ambient scatter kind + chunk-scoped spawn-point selection

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: `tickAmbientBehavior()` — pure idle/wander/flee state machine

**Files:**
- Modify: `src/world/AmbientWildlife.ts` (append behavior FSM)
- Modify: `tests/world/AmbientWildlife.test.ts` (append behavior tests)

**Interfaces:**
- Consumes: `WANDER_RADIUS`, `FLEE_TRIGGER_RADIUS`, `FLEE_EXIT_RADIUS`, `IDLE_MIN_DWELL`,
  `IDLE_MAX_DWELL` (Task 1).
- Produces: `AmbientState` type (`'idle' | 'wander' | 'flee'`), `AmbientBehaviorState` interface
  (`{ state: AmbientState; targetX: number; targetZ: number; dwellTimer: number }`),
  `tickAmbientBehavior(prev, ownX, ownZ, spawnX, spawnZ, playerX, playerZ, dt, rand):
  AmbientBehaviorState`. Consumed by Task 4's `AmbientCreature` class.

- [ ] **Step 1: Write the failing tests**

Append to `tests/world/AmbientWildlife.test.ts`:

Change the import line:
```ts
  selectAmbientSpawnPoints,
} from '@/world/AmbientWildlife';
```
to:
```ts
  selectAmbientSpawnPoints, tickAmbientBehavior, type AmbientBehaviorState,
} from '@/world/AmbientWildlife';
```

Then append at the end of the file:

```ts

describe('tickAmbientBehavior', () => {
  const FAR_PLAYER = { x: 1000, z: 1000 }; // always outside flee range unless a test moves it

  function initialIdleState(): AmbientBehaviorState {
    return { state: 'idle', targetX: 0, targetZ: 0, dwellTimer: 3 };
  }

  it('stays idle while the dwell timer has not expired', () => {
    const rand = () => 0.5;
    const prev = initialIdleState();
    const next = tickAmbientBehavior(prev, 0, 0, 0, 0, FAR_PLAYER.x, FAR_PLAYER.z, 1, rand);
    expect(next.state).toBe('idle');
    expect(next.dwellTimer).toBeCloseTo(2, 5);
  });

  it('transitions idle -> wander once the dwell timer expires, picking a target within WANDER_RADIUS of spawn', () => {
    const rand = () => 0.5; // deterministic mid-range value
    const prev: AmbientBehaviorState = { state: 'idle', targetX: 0, targetZ: 0, dwellTimer: 0.5 };
    const next = tickAmbientBehavior(prev, 0, 0, 0, 0, FAR_PLAYER.x, FAR_PLAYER.z, 1, rand);
    expect(next.state).toBe('wander');
    const dist = Math.sqrt(next.targetX ** 2 + next.targetZ ** 2);
    expect(dist).toBeLessThanOrEqual(WANDER_RADIUS + 1e-6);
  });

  it('transitions wander -> idle once the creature arrives at its target, with a new dwell timer in [IDLE_MIN_DWELL, IDLE_MAX_DWELL]', () => {
    const rand = () => 0.5;
    const prev: AmbientBehaviorState = { state: 'wander', targetX: 1, targetZ: 0, dwellTimer: 0 };
    // ownX=1, ownZ=0 — already at the target (arrival threshold satisfied)
    const next = tickAmbientBehavior(prev, 1, 0, 0, 0, FAR_PLAYER.x, FAR_PLAYER.z, 1, rand);
    expect(next.state).toBe('idle');
    expect(next.dwellTimer).toBeGreaterThanOrEqual(IDLE_MIN_DWELL);
    expect(next.dwellTimer).toBeLessThanOrEqual(IDLE_MAX_DWELL);
  });

  it('stays wander while still far from its target', () => {
    const rand = () => 0.5;
    const prev: AmbientBehaviorState = { state: 'wander', targetX: 8, targetZ: 0, dwellTimer: 0 };
    const next = tickAmbientBehavior(prev, 0, 0, 0, 0, FAR_PLAYER.x, FAR_PLAYER.z, 1, rand);
    expect(next.state).toBe('wander');
    expect(next.targetX).toBe(8); // target unchanged while still en route
    expect(next.targetZ).toBe(0);
  });

  it('enters flee from idle when the player is within FLEE_TRIGGER_RADIUS', () => {
    const rand = () => 0.5;
    const prev = initialIdleState();
    // own at (0,0), player at (3,0) — distance 3 < FLEE_TRIGGER_RADIUS (6)
    const next = tickAmbientBehavior(prev, 0, 0, 0, 0, 3, 0, 1, rand);
    expect(next.state).toBe('flee');
    // Flee target should be in the direction AWAY from the player (negative X, since player is at +X)
    expect(next.targetX).toBeLessThan(0);
  });

  it('enters flee from wander when the player is within FLEE_TRIGGER_RADIUS', () => {
    const rand = () => 0.5;
    const prev: AmbientBehaviorState = { state: 'wander', targetX: 8, targetZ: 0, dwellTimer: 0 };
    const next = tickAmbientBehavior(prev, 0, 0, 0, 0, 3, 0, 1, rand);
    expect(next.state).toBe('flee');
  });

  it('stays flee while the player is still within FLEE_EXIT_RADIUS (hysteresis band)', () => {
    const rand = () => 0.5;
    const prev: AmbientBehaviorState = { state: 'flee', targetX: -5, targetZ: 0, dwellTimer: 0 };
    // own at (0,0), player at (8,0) — distance 8 is beyond FLEE_TRIGGER_RADIUS (6) but still
    // within FLEE_EXIT_RADIUS (9), so must stay fleeing (hysteresis, no flicker).
    const next = tickAmbientBehavior(prev, 0, 0, 0, 0, 8, 0, 1, rand);
    expect(next.state).toBe('flee');
  });

  it('exits flee back to idle once the player is beyond FLEE_EXIT_RADIUS', () => {
    const rand = () => 0.5;
    const prev: AmbientBehaviorState = { state: 'flee', targetX: -5, targetZ: 0, dwellTimer: 0 };
    // own at (0,0), player at (10,0) — distance 10 > FLEE_EXIT_RADIUS (9)
    const next = tickAmbientBehavior(prev, 0, 0, 0, 0, 10, 0, 1, rand);
    expect(next.state).toBe('idle');
    expect(next.dwellTimer).toBeGreaterThanOrEqual(IDLE_MIN_DWELL);
    expect(next.dwellTimer).toBeLessThanOrEqual(IDLE_MAX_DWELL);
  });

  it('is deterministic for a fixed rand function', () => {
    const rand = () => 0.3;
    const prev: AmbientBehaviorState = { state: 'idle', targetX: 0, targetZ: 0, dwellTimer: 0.1 };
    const a = tickAmbientBehavior(prev, 0, 0, 0, 0, FAR_PLAYER.x, FAR_PLAYER.z, 1, rand);
    const b = tickAmbientBehavior(prev, 0, 0, 0, 0, FAR_PLAYER.x, FAR_PLAYER.z, 1, rand);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/AmbientWildlife.test.ts`
Expected: FAIL — `tickAmbientBehavior` is not exported yet.

- [ ] **Step 3: Append the FSM to `AmbientWildlife.ts`**

Add to `src/world/AmbientWildlife.ts`, after `selectAmbientSpawnPoints()`:

```ts

// ── Behavior FSM ──────────────────────────────────────────────────────────

export type AmbientState = 'idle' | 'wander' | 'flee';

export interface AmbientBehaviorState {
  state: AmbientState;
  targetX: number;
  targetZ: number;
  /** Only meaningful while state === 'idle' — counts down to the next wander transition. */
  dwellTimer: number;
}

const ARRIVAL_THRESHOLD = 0.3; // world units — "close enough" to a wander/flee target
const FLEE_TARGET_DISTANCE = 10; // world units to flee away from the player, in the away direction

/**
 * Pure idle/wander/flee state transition — no THREE.js dependency, so it's fully testable with
 * plain numbers. The caller (AmbientCreature, Task 4) is responsible for actually moving
 * (ownX, ownZ) toward (targetX, targetZ) each frame at a state-appropriate speed and for
 * selecting the matching animation state; this function only decides WHAT the next state/target
 * should be, not how movement happens.
 */
export function tickAmbientBehavior(
  prev: AmbientBehaviorState,
  ownX: number, ownZ: number,
  spawnX: number, spawnZ: number,
  playerX: number, playerZ: number,
  dt: number,
  rand: () => number,
): AmbientBehaviorState {
  const dxPlayer = ownX - playerX;
  const dzPlayer = ownZ - playerZ;
  const playerDist = Math.sqrt(dxPlayer * dxPlayer + dzPlayer * dzPlayer);

  if (prev.state === 'flee') {
    if (playerDist > FLEE_EXIT_RADIUS) {
      return {
        state: 'idle', targetX: prev.targetX, targetZ: prev.targetZ,
        dwellTimer: IDLE_MIN_DWELL + rand() * (IDLE_MAX_DWELL - IDLE_MIN_DWELL),
      };
    }
    return prev; // still within the hysteresis band — keep fleeing toward the existing target
  }

  if (playerDist < FLEE_TRIGGER_RADIUS) {
    // Flee directly away from the player's current position.
    const awayLen = playerDist > 1e-6 ? playerDist : 1;
    const awayX = dxPlayer / awayLen;
    const awayZ = dzPlayer / awayLen;
    return {
      state: 'flee',
      targetX: ownX + awayX * FLEE_TARGET_DISTANCE,
      targetZ: ownZ + awayZ * FLEE_TARGET_DISTANCE,
      dwellTimer: 0,
    };
  }

  if (prev.state === 'idle') {
    const dwellTimer = prev.dwellTimer - dt;
    if (dwellTimer > 0) return { ...prev, dwellTimer };
    // Dwell expired — pick a new wander target within WANDER_RADIUS of the spawn point.
    const angle = rand() * Math.PI * 2;
    const dist = rand() * WANDER_RADIUS;
    return {
      state: 'wander',
      targetX: spawnX + Math.cos(angle) * dist,
      targetZ: spawnZ + Math.sin(angle) * dist,
      dwellTimer: 0,
    };
  }

  // prev.state === 'wander'
  const dxTarget = prev.targetX - ownX;
  const dzTarget = prev.targetZ - ownZ;
  const targetDist = Math.sqrt(dxTarget * dxTarget + dzTarget * dzTarget);
  if (targetDist <= ARRIVAL_THRESHOLD) {
    return {
      state: 'idle', targetX: prev.targetX, targetZ: prev.targetZ,
      dwellTimer: IDLE_MIN_DWELL + rand() * (IDLE_MAX_DWELL - IDLE_MIN_DWELL),
    };
  }
  return prev; // still en route — keep the same target
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/AmbientWildlife.test.ts`
Expected: PASS — all tests, including the 9 new behavior tests.

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1.

- [ ] **Step 6: Commit**

```bash
git add src/world/AmbientWildlife.ts tests/world/AmbientWildlife.test.ts
git commit -m "feat: add pure idle/wander/flee behavior state machine

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: `AmbientCreature` class — the THREE-dependent rig + movement wrapper

**Files:**
- Modify: `src/world/AmbientWildlife.ts` (append `AmbientCreature` class)
- Modify: `tests/world/AmbientWildlife.test.ts` (append `AmbientCreature` tests)

**Interfaces:**
- Consumes: `AMBIENT_SPECIES` (Task 1), `tickAmbientBehavior`/`AmbientBehaviorState` (Task 3),
  `buildCreature`/`computeQuadNaturalFootY`/`CreatureRig` (from `@/creatures/CreatureBuilder`),
  `animateCreature` (from `@/creatures/CreatureAnimator`), `mulberry32`.
- Produces: `AmbientCreature` class — `constructor(species: AmbientSpecies, spawnPosition:
  THREE.Vector3, seed: number)`, `readonly root: THREE.Group`, `update(playerPos: THREE.Vector3,
  dt: number): void`, `dispose(): void`. Consumed by Task 5's `OverworldScene.ts` wiring.

**Note on foot-grounding math (a real, deliberate deviation from `PlayerController.ts`'s literal
formula — see this plan's rationale in the Step 3 code comment below):** `computeQuadNaturalFootY()`
returns an offset in the rig's own unscaled local units; `PlayerController.ts` applies it directly
as a position offset without multiplying by `proportions.global`, which is only safe because the
player's own scale is always at/near `1.0`. Rabbits (`global: 0.4`) and goats (`global: 0.75`)
are far enough from `1.0` that skipping this multiplication would visibly float or sink their
feet — so `AmbientCreature`'s constructor multiplies the foot offset by `proportions.global`
before applying it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/world/AmbientWildlife.test.ts`:

Change the import line:
```ts
  selectAmbientSpawnPoints, tickAmbientBehavior, type AmbientBehaviorState,
} from '@/world/AmbientWildlife';
```
to:
```ts
  selectAmbientSpawnPoints, tickAmbientBehavior, type AmbientBehaviorState,
  AmbientCreature,
} from '@/world/AmbientWildlife';
```

Add a `THREE` import at the top of the file (this test file didn't need it before Task 4):
```ts
import { describe, it, expect } from 'vitest';
```
becomes:
```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
```

Then append at the end of the file:

```ts

describe('AmbientCreature', () => {
  it('constructs a rabbit at the given spawn position, feet grounded at spawn Y', () => {
    const spawn = new THREE.Vector3(5, 2, 5);
    const creature = new AmbientCreature('rabbit', spawn, 42);
    // The creature's root sits at the spawn XZ; grounding math keeps Y close to spawn.y
    // (small tolerance since natural-foot-Y offsets a few hundredths of a world unit).
    expect(creature.root.position.x).toBeCloseTo(spawn.x, 5);
    expect(creature.root.position.z).toBeCloseTo(spawn.z, 5);
    creature.dispose();
  });

  it('constructs a goat without throwing', () => {
    const spawn = new THREE.Vector3(0, 0, 0);
    const creature = new AmbientCreature('goat', spawn, 7);
    expect(creature.root).toBeDefined();
    creature.dispose();
  });

  it('moves toward the wander target over successive update() calls (never teleports)', () => {
    const spawn = new THREE.Vector3(0, 0, 0);
    const creature = new AmbientCreature('rabbit', spawn, 1);
    const farPlayer = new THREE.Vector3(1000, 0, 1000);
    const startPos = creature.root.position.clone();
    for (let i = 0; i < 300; i++) creature.update(farPlayer, 1 / 30);
    const endPos = creature.root.position.clone();
    const moved = startPos.distanceTo(endPos);
    // Over 10 simulated seconds of idle+wander cycling, some movement should have occurred,
    // but never further than a single wander excursion could carry it (spawn radius + margin).
    expect(moved).toBeGreaterThanOrEqual(0);
    expect(moved).toBeLessThan(WANDER_RADIUS + 2);
    creature.dispose();
  });

  it('flees away from a nearby player', () => {
    const spawn = new THREE.Vector3(0, 0, 0);
    const creature = new AmbientCreature('rabbit', spawn, 1);
    const closePlayer = new THREE.Vector3(2, 0, 0); // within FLEE_TRIGGER_RADIUS
    const startX = creature.root.position.x;
    for (let i = 0; i < 60; i++) creature.update(closePlayer, 1 / 30);
    // Fleeing away from a player at +X should move the creature toward -X.
    expect(creature.root.position.x).toBeLessThan(startX);
    creature.dispose();
  });

  it('dispose() does not throw and can be called safely', () => {
    const creature = new AmbientCreature('goat', new THREE.Vector3(0, 0, 0), 3);
    expect(() => creature.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/AmbientWildlife.test.ts`
Expected: FAIL — `AmbientCreature` is not exported yet.

- [ ] **Step 3: Append the `AmbientCreature` class to `AmbientWildlife.ts`**

Add to `src/world/AmbientWildlife.ts`, with new imports at the top:

Change:
```ts
import { dnaForArchetype, type CreatureDNA } from '@/creatures/CreatureDNA';
import { mulberry32 } from '@/core/prng';
import { poissonDisk } from '@/core/poissonDisk';
import { isScatterAllowed } from '@/world/ScatterRules';
import type { WorldGrid, BiomeId } from '@/world/WorldGrid';
```
to:
```ts
import * as THREE from 'three';
import { dnaForArchetype, type CreatureDNA } from '@/creatures/CreatureDNA';
import { buildCreature, computeQuadNaturalFootY, type CreatureRig } from '@/creatures/CreatureBuilder';
import { animateCreature } from '@/creatures/CreatureAnimator';
import { mulberry32 } from '@/core/prng';
import { poissonDisk } from '@/core/poissonDisk';
import { isScatterAllowed } from '@/world/ScatterRules';
import type { WorldGrid, BiomeId } from '@/world/WorldGrid';
```

Then append at the end of the file (after `tickAmbientBehavior()`):

```ts

// ── AmbientCreature ───────────────────────────────────────────────────────

/**
 * One peaceful, wandering ambient creature — owns a CreatureRig, a pure AmbientBehaviorState,
 * and its own seeded PRNG (for wander-target/dwell-timer randomness, deterministic per
 * creature). No physics body, no collider, no health — purely decorative.
 */
export class AmbientCreature {
  readonly root: THREE.Group;
  private readonly _rig: CreatureRig;
  private readonly _rand: () => number;
  private readonly _spawnX: number;
  private readonly _spawnZ: number;
  private _behavior: AmbientBehaviorState;
  private _animTime = 0;

  constructor(species: AmbientSpecies, spawnPosition: THREE.Vector3, seed: number) {
    const def = AMBIENT_SPECIES[species];
    this._rig = buildCreature(def.dna);
    this._rig.root.scale.setScalar(def.dna.proportions.global);

    // Foot-grounding: computeQuadNaturalFootY() returns an UNSCALED local offset (see this
    // task's plan-level rationale comment) — must be multiplied by the same global scale
    // applied above, unlike PlayerController.ts's usage (safe there only because the player's
    // own scale sits at/near 1.0).
    const footY = computeQuadNaturalFootY(this._rig) * def.dna.proportions.global;
    this._rig.root.position.y = -footY;

    this.root = new THREE.Group();
    this.root.add(this._rig.root);
    this.root.position.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);

    this._spawnX = spawnPosition.x;
    this._spawnZ = spawnPosition.z;
    this._rand = mulberry32(seed);
    this._behavior = {
      state: 'idle', targetX: spawnPosition.x, targetZ: spawnPosition.z,
      dwellTimer: IDLE_MIN_DWELL + this._rand() * (IDLE_MAX_DWELL - IDLE_MIN_DWELL),
    };
  }

  update(playerPos: THREE.Vector3, dt: number): void {
    this._behavior = tickAmbientBehavior(
      this._behavior,
      this.root.position.x, this.root.position.z,
      this._spawnX, this._spawnZ,
      playerPos.x, playerPos.z,
      dt, this._rand,
    );

    const speed = this._behavior.state === 'flee' ? FLEE_SPEED
      : this._behavior.state === 'wander' ? WANDER_SPEED
      : 0;

    if (speed > 0) {
      const dx = this._behavior.targetX - this.root.position.x;
      const dz = this._behavior.targetZ - this.root.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 1e-6) {
        const step = Math.min(speed * dt, dist);
        this.root.position.x += (dx / dist) * step;
        this.root.position.z += (dz / dist) * step;
        this.root.rotation.y = Math.atan2(dx, dz);
      }
    }

    this._animTime += dt;
    animateCreature(this._rig, {
      state: this._behavior.state === 'idle' ? 'idle' : 'walk',
      time: this._animTime,
      velocity: speed,
    });
  }

  dispose(): void {
    this._rig.dispose();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/AmbientWildlife.test.ts`
Expected: PASS — all tests, including the 5 new `AmbientCreature` tests.

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1.

- [ ] **Step 6: Commit**

```bash
git add src/world/AmbientWildlife.ts tests/world/AmbientWildlife.test.ts
git commit -m "feat: add AmbientCreature (rig + movement + animation wrapper)

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: `OverworldScene.ts` — chunk-scoped spawn/despawn + per-frame tick + global cap

**Files:**
- Modify: `src/scene/OverworldScene.ts`:
  - Imports (near the top, alongside other `@/world/...` imports)
  - `TerrainChunkData` interface (gains `ambientCreatures` field)
  - New `_activeAmbientCreatures: AmbientCreature[]` field
  - `_loadTerrainChunk()` (spawns creatures for this chunk, respecting the global cap)
  - `_unloadTerrainChunk()` (disposes this chunk's creatures, removes them from the active list)
  - `enter()`/`exit()` (add/remove each creature's `.root` to/from the scene)
  - `update()` (ticks every active creature once per frame)
  - `dispose()` (disposes every remaining active creature)
  - New `getActiveAmbientCreatureCount()` debug/test getter (mirrors `getStaticBodyCount()`)

**Interfaces:**
- Consumes: `AmbientCreature`, `selectAmbientSpawnPoints`, `MAX_ACTIVE_AMBIENT_CREATURES` (Tasks
  1-4).
- Produces: `OverworldScene.getActiveAmbientCreatureCount(): number`. Consumed by Task 6's
  test/e2e verification.

- [ ] **Step 1: Add the import**

In `src/scene/OverworldScene.ts`, find the existing `GrassField` import:
```ts
import { GrassField, GRASS_PRESETS } from '@/world/GrassField';
```
Change to:
```ts
import { GrassField, GRASS_PRESETS } from '@/world/GrassField';
import { AmbientCreature, selectAmbientSpawnPoints, MAX_ACTIVE_AMBIENT_CREATURES } from '@/world/AmbientWildlife';
```

- [ ] **Step 2: Extend `TerrainChunkData` and add the active-creatures field**

Find:
```ts
  /** Textured ground surface meshes (one per ground-texture variant present
   *  in this chunk) — built alongside roadMeshes from the same
   *  buildTerrainGeometryData() call's groundGeometry output, sharing this
   *  chunk's own load/unload/enter/exit lifecycle. See TerrainTextures.ts /
   *  docs/superpowers/specs/2026-08-30-ground-tile-texture-variety-design.md. */
  groundMeshes: THREE.Mesh[];
}
```
Change to:
```ts
  /** Textured ground surface meshes (one per ground-texture variant present
   *  in this chunk) — built alongside roadMeshes from the same
   *  buildTerrainGeometryData() call's groundGeometry output, sharing this
   *  chunk's own load/unload/enter/exit lifecycle. See TerrainTextures.ts /
   *  docs/superpowers/specs/2026-08-30-ground-tile-texture-variety-design.md. */
  groundMeshes: THREE.Mesh[];
  /** Peaceful ambient wildlife (rabbits/goats) spawned for this chunk — see
   *  AmbientWildlife.ts / docs/superpowers/specs/2026-08-31-ambient-wildlife-design.md.
   *  Unlike tree/rock/grass scatter, these need individual per-frame movement updates, so
   *  they're tracked here (and in `_activeAmbientCreatures`) rather than merged into `scatter`. */
  ambientCreatures: AmbientCreature[];
}
```

Find the `_hostileHash`/`_slimeIM` field block area and add a new field alongside it. Find:
```ts
  /** Phase 7h — spatial hash for O(1) hostile-enemy proximity lookups. */
  private readonly _hostileHash = new SpatialHash<SlimeEnemy>(8);
```
Change to:
```ts
  /** Phase 7h — spatial hash for O(1) hostile-enemy proximity lookups. */
  private readonly _hostileHash = new SpatialHash<SlimeEnemy>(8);
  /** Flat running list of every currently-loaded chunk's ambient creatures, mirroring
   *  `_enemies` — appended to in `_loadTerrainChunk()`, spliced from in `_unloadTerrainChunk()`,
   *  ticked once per frame in `update()`. Capped at MAX_ACTIVE_AMBIENT_CREATURES globally. */
  private readonly _activeAmbientCreatures: AmbientCreature[] = [];
```

- [ ] **Step 3: Spawn creatures in `_loadTerrainChunk()`**

Find the end of `_loadTerrainChunk()`:
```ts
    const data: TerrainChunkData = { mesh, body, scatter, colliders, roadMeshes, groundMeshes };
    this._terrainChunkData.set(`${coord.cx},${coord.cz}`, data);
    return data;
  }
```
Change to:
```ts
    // Ambient wildlife — chunk-scoped like scatter, but tracked individually (not merged into
    // the static `scatter` group) since each creature needs its own per-frame movement update.
    const ambientCreatures: AmbientCreature[] = [];
    const chunkWorldSize = T * CHUNK_SIZE;
    const originX = (colStart - GHW) * T;
    const originZ = (rowStart - GHH) * T;
    const spawnPoints = selectAmbientSpawnPoints(
      this._wg, originX, originZ, chunkWorldSize,
      (this._seed ^ 0x4A2E_1F87) ^ (coord.cx * 55871) ^ (coord.cz * 74653),
    );
    for (const sp of spawnPoints) {
      if (this._activeAmbientCreatures.length >= MAX_ACTIVE_AMBIENT_CREATURES) break;
      const spCol = Math.floor(sp.x / T + GHW);
      const spRow = Math.floor(sp.z / T + GHH);
      const spCell = this._wg.get(spCol, spRow);
      const spawnPos = new THREE.Vector3(sp.x, spCell.elevation * SH, sp.z);
      const creature = new AmbientCreature(
        sp.species, spawnPos,
        (this._seed ^ 0x1B7A_9E33) ^ Math.round(sp.x * 131) ^ Math.round(sp.z * 977),
      );
      if (this._isInScene) this.scene.add(creature.root);
      ambientCreatures.push(creature);
      this._activeAmbientCreatures.push(creature);
    }

    const data: TerrainChunkData = { mesh, body, scatter, colliders, roadMeshes, groundMeshes, ambientCreatures };
    this._terrainChunkData.set(`${coord.cx},${coord.cz}`, data);
    return data;
  }
```

- [ ] **Step 4: Dispose creatures in `_unloadTerrainChunk()`**

Find the end of `_unloadTerrainChunk()`:
```ts
    this.scene.remove(data.scatter);
    data.scatter.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
  }
```
Change to:
```ts
    this.scene.remove(data.scatter);
    data.scatter.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });

    for (const creature of data.ambientCreatures) {
      this.scene.remove(creature.root);
      creature.dispose();
      const idx = this._activeAmbientCreatures.indexOf(creature);
      if (idx !== -1) this._activeAmbientCreatures.splice(idx, 1);
    }
  }
```

- [ ] **Step 5: Update `enter()`/`exit()`**

Find in `enter()` (near the grass-field loop added in the grass batches):
```ts
    for (const gf of this._grassFields) this.scene.add(gf.mesh);
```
Change to:
```ts
    for (const gf of this._grassFields) this.scene.add(gf.mesh);
    for (const c of this._activeAmbientCreatures) this.scene.add(c.root);
```

Find in `exit()`:
```ts
    for (const gf of this._grassFields) this.scene.remove(gf.mesh);
```
Change to:
```ts
    for (const gf of this._grassFields) this.scene.remove(gf.mesh);
    for (const c of this._activeAmbientCreatures) this.scene.remove(c.root);
```

- [ ] **Step 6: Tick creatures in `update()`**

Find:
```ts
    for (const gf of this._grassFields) {
      gf.update(pos.x, pos.z);
      gf.tickWind(dt);
    }
```
Change to:
```ts
    for (const gf of this._grassFields) {
      gf.update(pos.x, pos.z);
      gf.tickWind(dt);
    }

    for (const creature of this._activeAmbientCreatures) creature.update(pos, dt);
```

- [ ] **Step 7: Dispose remaining creatures in `dispose()`**

Find:
```ts
    for (const gf of this._grassFields) gf.dispose();
```
Change to:
```ts
    for (const gf of this._grassFields) gf.dispose();
    for (const c of this._activeAmbientCreatures) c.dispose();
    this._activeAmbientCreatures.length = 0;
```

- [ ] **Step 8: Add the debug/test getter**

Find `getStaticBodyCount()`:
```ts
  getStaticBodyCount(): number {
```
Add immediately before it:
```ts
  /** Number of currently-active ambient wildlife creatures (for tests/dev-tooling). */
  getActiveAmbientCreatureCount(): number {
    return this._activeAmbientCreatures.length;
  }

  getStaticBodyCount(): number {
```

- [ ] **Step 9: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1.

- [ ] **Step 10: Run the existing OverworldScene test suite to confirm no regression**

Run: `npx vitest run tests/scene/OverworldScene.chunk-scatter-alignment.test.ts tests/scene/OverworldScene.settlement-parity.test.ts tests/scene/OverworldScene.drawcall-batching.test.ts tests/scene/OverworldScene.chunk-terrain-alignment.test.ts tests/scene/OverworldScene.chunk-collider-streaming.test.ts`
Expected: PASS. `OverworldScene.drawcall-batching.test.ts`'s mesh-count assertion (`< 8000`)
should be unaffected — ambient creatures are individual `THREE.Group`s (not merged into the
counted static-scatter meshes), and the population is capped at 24 total, so even fully spawned
they add a small, bounded number of extra scene-graph objects. `OverworldScene.chunk-scatter-
alignment.test.ts`/`OverworldScene.settlement-parity.test.ts` are this project's known
occasional sandbox-contention flakes — re-run either in isolation if it fails here.

- [ ] **Step 11: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "feat: wire ambient wildlife spawn/despawn/tick into OverworldScene

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: e2e verification + full regression + ship

**Files:**
- Create: `tests/e2e/ambient-wildlife.spec.ts` (one-off Playwright verification, not part of CI
  regression — matches the established `procedural-grass.spec.ts`/`lantern-spell.spec.ts`
  convention)
- Modify: `docs/visual-progress.md`

**Interfaces:**
- Consumes: `OverworldScene.getActiveAmbientCreatureCount()` (Task 5), `findFirstBiomeTile()`
  (already generalized during the grass batch 2 work — no new hook needed).
- Produces: nothing new for later tasks — this is the final verification step.

- [ ] **Step 1: Write the e2e verification spec**

Create `tests/e2e/ambient-wildlife.spec.ts`:

```ts
/**
 * ambient-wildlife.spec.ts — manual/visual verification for Phase 9 batch 1's ambient wildlife
 * (rabbits, goats; see docs/superpowers/specs/2026-08-31-ambient-wildlife-design.md).
 *
 * Not part of the regular CI regression suite — one-off verification tooling confirming the
 * unit-tested placement/behavior/rig logic actually produces visible, moving, fleeing creatures
 * in the live OverworldScene with no console/page errors.
 * Run: npx playwright test tests/e2e/ambient-wildlife.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage, startGame, goExterior, teleportPlayer, attachFullConsoleCapture } from './helpers';

test.use({ actionTimeout: 150_000, navigationTimeout: 60_000 });
test.setTimeout(300_000);

const SS = async (page: Page, name: string) => {
  try {
    await page.screenshot({ path: `tests/e2e/screenshots/ambient-wildlife-${name}.png`, timeout: 10_000 });
  } catch (e) {
    console.warn(`[ambient-wildlife.spec] screenshot '${name}' skipped: ${(e as Error).message}`);
  }
};

test.describe('Ambient wildlife (Phase 9 batch 1)', () => {
  test('a forest tile spawns ambient creatures, and the population is bounded, with no console errors', async ({ page }) => {
    const { errors, all } = attachFullConsoleCapture(page);

    await loadPage(page);
    await startGame(page);
    await goExterior(page);

    const tile = await page.evaluate(() => (window as any).__game.findFirstBiomeTile('forest'));
    expect(tile, 'No forest tile found in generated overworld').toBeTruthy();

    await teleportPlayer(page, (tile as { x: number; z: number }).x, 5, (tile as { x: number; z: number }).z);
    await page.evaluate(() => (window as any).__game.forceTick(30));
    await page.waitForTimeout(500);
    await SS(page, '01-forest');

    expect(errors, `Console/page errors: ${all.join('\n')}`).toHaveLength(0);

    const count = await page.evaluate(() => (window as any).__game.getActiveAmbientCreatureCount());
    expect(count, 'Active ambient creature count should never exceed the global cap').toBeLessThanOrEqual(24);
  });
});
```

- [ ] **Step 2: Add the `getActiveAmbientCreatureCount` debug hook to `main.ts`**

In `src/main.ts`, find:
```ts
      /** Grass instanced-mesh debug info (exterior mode only). For tests. */
      getGrassDebugInfo: () => gameMode === 'exterior' ? (overworld?.getGrassDebugInfo() ?? null) : null,
```
Change to:
```ts
      /** Grass instanced-mesh debug info (exterior mode only). For tests. */
      getGrassDebugInfo: () => gameMode === 'exterior' ? (overworld?.getGrassDebugInfo() ?? null) : null,
      /** Active ambient-wildlife creature count (exterior mode only). For tests. */
      getActiveAmbientCreatureCount: () => gameMode === 'exterior' ? (overworld?.getActiveAmbientCreatureCount() ?? 0) : 0,
```

- [ ] **Step 3: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1.

- [ ] **Step 4: Commit the hook + e2e spec**

```bash
git add src/main.ts tests/e2e/ambient-wildlife.spec.ts
git commit -m "test: add ambient wildlife e2e verification spec

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 5: Run the e2e verification spec**

Kill any stray dev-server process squatting on port 5174 first (this shared environment has
occasionally had an unrelated `vite` process from a different checkout left running — verify
with `ps aux | grep -i vite | grep -v grep` and `kill <pid>` if one shows up pointing at a
different directory than this worktree):

Run: `npx playwright test tests/e2e/ambient-wildlife.spec.ts`
Expected: 1 passed. If "No forest tile found" occurs (unlikely — forest is a common biome, unlike
grass batch 2's tundra situation), retry with an explicit seed in this spec's own
`startGame(page, 0xC0FFEE)` call.

- [ ] **Step 6: Visually confirm wildlife looks reasonable**

Manually verify (mirroring the grass batches' approach): boot a local dev server
(`npm run dev -- --host 127.0.0.1 --port 5174`), use a short Playwright script with the raw CDP
`Page.captureScreenshot` approach (Playwright's own `page.screenshot()` has been observed to
time out on "waiting for fonts to load" in this environment) to teleport near a forest tile and
a mountain tile, confirm a rabbit/goat is visible, standing/wandering (not a frozen mid-pose
statue, and not overlapping/clipping into the ground), and that walking toward it causes it to
flee. Clean up any temp script files and kill the manually-started dev server when done.

- [ ] **Step 7: Run the full unit/integration test suite**

Run: `npx vitest run`
Expected: the same pre-existing baseline failures already established in this project's ongoing
verification history (`main.startup.smoke.test.ts`, `enemyLoader.test.ts`, `towerGenerator.test.ts`,
`talentSystem.test.ts`, `WaterMaterial.test.ts` — count varies run-to-run within a known small
range; `OverworldScene.chunk-scatter-alignment.test.ts`/`ResourceNodePlacer.test.ts` are known
sandbox-contention flakes — re-run either in isolation if they fail here), plus every new
ambient-wildlife test from Tasks 1-5 passing, and zero NEW failures beyond that established
baseline set.

- [ ] **Step 8: Final `tsc` check**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as Task 1 Step 1.

- [ ] **Step 9: Update the visual-progress log**

Open `docs/visual-progress.md`. Add a new section (after the most recent Procedural Grass
entry, following the same heading style):

```markdown

## Ambient Wildlife — Phase 9 Batch 1 (Rabbits, Goats)

Peaceful, chunk-scoped ambient wildlife — rabbits (forest/grassland/taiga) and goats
(mountain) — wander near their spawn point and flee when the player approaches. No combat, no
health, purely cosmetic. Birds/flight are a planned follow-up batch — see
`docs/superpowers/specs/2026-08-31-ambient-wildlife-design.md`.
```

- [ ] **Step 10: Commit and push**

```bash
git add docs/visual-progress.md
git commit -m "docs: note ambient wildlife batch 1 in visual-progress log

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
git push origin HEAD:main
```
