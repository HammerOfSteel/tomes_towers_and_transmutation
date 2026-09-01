# Trampled-Grass Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the player visibly flatten grass as they walk through it, with a soft,
fading trail behind them (not just instant bend-and-spring-back), reusing the exact
flattening formula (`VERTEX.y *= (1 - crush)`) verified in two independent real
open-source Godot grass shaders, adapted to a CPU-side decaying grid instead of a GPU
render-target (this project's test harness has no real WebGL context — see design spec
§3 for why).

**Architecture:** A new `src/world/GrassTrample.ts` module holds pure, fully unit-tested
math (decay, stamping, recentering, world→cell mapping) plus a thin `TrampleMap` class
that owns a `Float32Array` grid and pushes it into a `THREE.DataTexture` every frame
(mutate + `needsUpdate = true` — the same pattern `GrassField` already uses for its own
instanced buffers, so no extra render pass or renderer reference is needed).
`OverworldScene` owns one shared `TrampleMap`, passed into all 5 `GrassField` instances;
the grass vertex shader samples it per-blade (using the blade's root position, not the
wind-swayed vertex position) to flatten trampled blades toward the ground and damp their
wind sway proportionally.

**Tech Stack:** TypeScript, Three.js (`THREE.DataTexture`), Vitest (TDD for all pure
logic — the `TrampleMap` class itself gets light construction smoke tests only, matching
this session's established `AmbientCreature` precedent for THREE-dependent wrapper
classes; the actual visual flattening is verified manually in a real browser).

## Global Constraints

- `TRAMPLE_MAP_WORLD_SIZE = 48` (world units per side) — must cover the full grass
  placement window (`2 * GRASS_RADIUS` from `GrassField.ts`, i.e. 48).
- `TRAMPLE_MAP_RESOLUTION = 64` (cells per side → 0.75 WU/cell).
- `TRAMPLE_STAMP_RADIUS = 0.9` (world units).
- `TRAMPLE_DECAY_HALF_LIFE_S = 2.0` (seconds).
- `TRAMPLE_RECENTER_THRESHOLD_WU = 12` (world units).
- `createGrassMaterial(preset)`'s signature MUST stay 1-argument (existing tests call it
  directly with just a preset) — the new trample uniforms get harmless defaults there.
- `GrassField`'s constructor MUST stay backward-compatible with its existing 3-argument
  test call sites — the new `trampleMap` parameter is optional (4th, defaults to
  `undefined`).
- Scope: player-only trampling for this pass (no ambient wildlife/enemies) — see design
  spec §6.

---

### Task 1: Pure trample-grid math (`GrassTrample.ts`)

**Files:**
- Create: `src/world/GrassTrample.ts`
- Create: `tests/world/GrassTrample.test.ts`

**Interfaces:**
- Consumes: nothing new (plain numbers/typed arrays in, plain values out).
- Produces: `TRAMPLE_MAP_WORLD_SIZE`, `TRAMPLE_MAP_RESOLUTION`, `TRAMPLE_STAMP_RADIUS`,
  `TRAMPLE_DECAY_HALF_LIFE_S`, `TRAMPLE_RECENTER_THRESHOLD_WU` constants;
  `decayFactor(dt: number, halfLifeS: number): number`,
  `worldToTrampleCell(worldX: number, worldZ: number, centerX: number, centerZ: number, worldSize: number, resolution: number): { col: number; row: number } | null`,
  `stampInto(grid: Float32Array, resolution: number, cellWorldSize: number, centerCol: number, centerRow: number, stampRadiusWU: number): void`,
  `shouldRecenter(dx: number, dz: number, threshold: number): boolean`,
  `shiftGrid(grid: Float32Array, resolution: number, shiftCols: number, shiftRows: number): Float32Array`.
  Consumed by Task 2's `TrampleMap` class.

- [ ] **Step 1: Write the failing tests**

Create `tests/world/GrassTrample.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  decayFactor, worldToTrampleCell, stampInto, shouldRecenter, shiftGrid,
} from '@/world/GrassTrample';

describe('decayFactor', () => {
  it('returns exactly 0.5 when dt equals the half-life', () => {
    expect(decayFactor(2.0, 2.0)).toBeCloseTo(0.5, 10);
  });

  it('returns 1 when dt is 0 (no decay yet)', () => {
    expect(decayFactor(0, 2.0)).toBe(1);
  });

  it('returns 0.125 after 3 half-lives', () => {
    expect(decayFactor(6.0, 2.0)).toBeCloseTo(0.125, 10);
  });
});

describe('worldToTrampleCell', () => {
  const worldSize = 48;
  const resolution = 64; // cellSize = 0.75

  it('maps the exact center of the window to the middle cell', () => {
    const cell = worldToTrampleCell(0, 0, 0, 0, worldSize, resolution);
    expect(cell).toEqual({ col: 32, row: 32 });
  });

  it('maps the left/top edge of the window to cell 0', () => {
    const cell = worldToTrampleCell(-24, -24, 0, 0, worldSize, resolution);
    expect(cell).toEqual({ col: 0, row: 0 });
  });

  it('returns null exactly at the right/bottom edge (half-open window)', () => {
    const cell = worldToTrampleCell(24, 24, 0, 0, worldSize, resolution);
    expect(cell).toBeNull();
  });

  it('returns null for a position far outside the window', () => {
    const cell = worldToTrampleCell(1000, 1000, 0, 0, worldSize, resolution);
    expect(cell).toBeNull();
  });

  it('maps relative to a non-zero center', () => {
    const cell = worldToTrampleCell(100, 100, 100, 100, worldSize, resolution);
    expect(cell).toEqual({ col: 32, row: 32 });
  });
});

describe('stampInto', () => {
  it('sets the center cell to full intensity (~1)', () => {
    const resolution = 5;
    const grid = new Float32Array(resolution * resolution);
    stampInto(grid, resolution, 1, 2, 2, 1.5);
    expect(grid[2 * resolution + 2]).toBeCloseTo(1, 5);
  });

  it('falls off linearly with distance from the stamp center', () => {
    const resolution = 5;
    const grid = new Float32Array(resolution * resolution);
    stampInto(grid, resolution, 1, 2, 2, 1.5);
    // One cell to the right: distance 1, intensity = 1 - 1/1.5 = 0.3333...
    expect(grid[2 * resolution + 3]).toBeCloseTo(1 / 3, 5);
  });

  it('leaves cells beyond the stamp radius untouched (exactly 0)', () => {
    const resolution = 5;
    const grid = new Float32Array(resolution * resolution);
    stampInto(grid, resolution, 1, 2, 2, 1.5);
    // Two cells straight down: distance 2 > radius 1.5 — must stay untouched.
    expect(grid[4 * resolution + 2]).toBe(0);
  });

  it('never reduces an existing higher value (uses max, not overwrite/add)', () => {
    const resolution = 5;
    const grid = new Float32Array(resolution * resolution);
    grid[2 * resolution + 2] = 1;
    stampInto(grid, resolution, 1, 2, 2, 1.5);
    expect(grid[2 * resolution + 2]).toBe(1); // not doubled, not reduced
  });
});

describe('shouldRecenter', () => {
  it('is false when exactly at the threshold (strictly-greater boundary)', () => {
    expect(shouldRecenter(12, 0, 12)).toBe(false);
  });

  it('is true just past the threshold', () => {
    expect(shouldRecenter(12.001, 0, 12)).toBe(true);
  });

  it('is false when well within the threshold', () => {
    expect(shouldRecenter(0, 0, 12)).toBe(false);
  });

  it('measures distance diagonally (dx and dz both contribute)', () => {
    // sqrt(9^2 + 9^2) = 12.73 > 12
    expect(shouldRecenter(9, 9, 12)).toBe(true);
  });
});

describe('shiftGrid', () => {
  // 3x3 grid: row0=[1,2,3], row1=[4,5,6], row2=[7,8,9]
  const makeGrid = () => new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  it('shifts columns: result[row][col] = old[row][col + shiftCols], revealed edge is 0', () => {
    const result = shiftGrid(makeGrid(), 3, 1, 0);
    expect(Array.from(result)).toEqual([2, 3, 0, 5, 6, 0, 8, 9, 0]);
  });

  it('shifts rows: result[row][col] = old[row + shiftRows][col], revealed edge is 0', () => {
    const result = shiftGrid(makeGrid(), 3, 0, 1);
    expect(Array.from(result)).toEqual([4, 5, 6, 7, 8, 9, 0, 0, 0]);
  });

  it('a shift larger than the grid zeroes everything out', () => {
    const result = shiftGrid(makeGrid(), 3, 10, 10);
    expect(Array.from(result)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('a zero shift returns the grid unchanged', () => {
    const result = shiftGrid(makeGrid(), 3, 0, 0);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/GrassTrample.test.ts`
Expected: FAIL — `src/world/GrassTrample.ts` does not exist yet (import error).

- [ ] **Step 3: Implement the pure functions**

Create `src/world/GrassTrample.ts`:

```ts
/**
 * GrassTrample.ts — a decaying, player-trampled-grass "trail" grid, sampled by
 * GrassField.ts's shader to flatten recently-walked-on blades. See
 * docs/superpowers/specs/2026-09-01-trampled-grass-trail-design.md for the full design
 * and the real Godot prior-art this adapts (§2), and §3 for why this is a CPU-side
 * Float32Array grid + THREE.DataTexture rather than a literal GPU render-target: this
 * project's test suite runs under jsdom (no real WebGL context — confirmed via
 * vitest.config.ts), and no existing test anywhere constructs a THREE.WebGLRenderer, so a
 * render-to-texture pass would be both unplumbed (OverworldScene has no renderer
 * reference today) and entirely unit-untestable. This file's math is pure and
 * fully tested; only the thin TrampleMap class (Task 2) touches THREE.js.
 */

/** World units per side of the tracked square window — matches GrassField.ts's full
 *  placement-window width (2 * GRASS_RADIUS = 48), so the trample grid always covers
 *  everywhere grass can actually be rendered. */
export const TRAMPLE_MAP_WORLD_SIZE = 48;

/** Cells per side of the grid (-> 0.75 WU/cell) — fine enough for a soft ~0.9 WU-radius
 *  stamp to read as a smooth blob, coarse enough that a full-grid decay pass (4096
 *  cells) is trivially cheap every frame. */
export const TRAMPLE_MAP_RESOLUTION = 64;

/** World-unit radius of one footstep's soft stamp. */
export const TRAMPLE_STAMP_RADIUS = 0.9;

/** Seconds for a trampled cell's intensity to halve. ~3 half-lives (~6s) fades a
 *  footprint to ~12.5% — a "little faint trail," not a lasting scar. */
export const TRAMPLE_DECAY_HALF_LIFE_S = 2.0;

/** World units the player must move from the grid's current center before it recenters
 *  (shifting existing data rather than discarding it — see shiftGrid()). */
export const TRAMPLE_RECENTER_THRESHOLD_WU = 12;

/** Multiplicative decay factor to apply to every cell this frame. */
export function decayFactor(dt: number, halfLifeS: number): number {
  return Math.pow(0.5, dt / halfLifeS);
}

/**
 * Maps a world position into the grid's cell space, given the window's current world
 * center. Returns null if the position falls outside the tracked window (half-open: the
 * window spans [center - worldSize/2, center + worldSize/2), matching how a single grid
 * of `resolution` cells can only ever represent `resolution` distinct positions per axis).
 */
export function worldToTrampleCell(
  worldX: number, worldZ: number,
  centerX: number, centerZ: number,
  worldSize: number, resolution: number,
): { col: number; row: number } | null {
  const cellSize = worldSize / resolution;
  const localX = worldX - centerX + worldSize / 2;
  const localZ = worldZ - centerZ + worldSize / 2;
  const col = Math.floor(localX / cellSize);
  const row = Math.floor(localZ / cellSize);
  if (col < 0 || col >= resolution || row < 0 || row >= resolution) return null;
  return { col, row };
}

/**
 * Writes a soft radial "footstep" blob centered at grid cell (centerCol, centerRow) into
 * `grid` (flat, row-major, length resolution*resolution). Uses Math.max against any
 * existing value at each touched cell (never adds/overwrites), so overlapping footsteps
 * saturate toward 1.0 instead of accumulating past it, and stamping never REDUCES a
 * still-strong nearby trail. Cells beyond `stampRadiusWU` are left completely untouched.
 */
export function stampInto(
  grid: Float32Array, resolution: number, cellWorldSize: number,
  centerCol: number, centerRow: number, stampRadiusWU: number,
): void {
  const cellRadius = Math.ceil(stampRadiusWU / cellWorldSize);
  for (let dr = -cellRadius; dr <= cellRadius; dr++) {
    const row = centerRow + dr;
    if (row < 0 || row >= resolution) continue;
    for (let dc = -cellRadius; dc <= cellRadius; dc++) {
      const col = centerCol + dc;
      if (col < 0 || col >= resolution) continue;
      const dx = dc * cellWorldSize;
      const dz = dr * cellWorldSize;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > stampRadiusWU) continue;
      const intensity = 1 - dist / stampRadiusWU;
      const idx = row * resolution + col;
      grid[idx] = Math.max(grid[idx], intensity);
    }
  }
}

/** Pure distance gate — true once the player has moved past `threshold` WU from the
 *  grid's current center (mirrors this session's own shouldPlaceBrushPoint() pattern
 *  from the overworld-editor paint-mode work). */
export function shouldRecenter(dx: number, dz: number, threshold: number): boolean {
  return Math.sqrt(dx * dx + dz * dz) > threshold;
}

/**
 * Returns a NEW grid (same size as `grid`) with content copied from the shifted offset:
 * `result[row][col] = grid[row + shiftRows][col + shiftCols]` wherever that source index
 * is in bounds, else 0 (a "revealed" edge starts untrampled). Used when recentering the
 * window so already-decaying trail data isn't discarded outright — see TrampleMap.update()
 * (Task 2) for how shiftCols/shiftRows are derived from the player's actual movement.
 */
export function shiftGrid(
  grid: Float32Array, resolution: number, shiftCols: number, shiftRows: number,
): Float32Array {
  const result = new Float32Array(resolution * resolution);
  for (let row = 0; row < resolution; row++) {
    const srcRow = row + shiftRows;
    if (srcRow < 0 || srcRow >= resolution) continue;
    for (let col = 0; col < resolution; col++) {
      const srcCol = col + shiftCols;
      if (srcCol < 0 || srcCol >= resolution) continue;
      result[row * resolution + col] = grid[srcRow * resolution + srcCol]!;
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/GrassTrample.test.ts`
Expected: PASS — all tests (3 decayFactor + 5 worldToTrampleCell + 4 stampInto + 4
shouldRecenter + 4 shiftGrid = 20 tests).

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144 (this project's steady baseline throughout this whole session — confirm
the count before this task matches and doesn't change).

- [ ] **Step 6: Commit**

```bash
git add src/world/GrassTrample.ts tests/world/GrassTrample.test.ts
git commit -m "feat: add pure trampled-grass trail grid math

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: `TrampleMap` class (THREE.DataTexture wrapper)

**Files:**
- Modify: `src/world/GrassTrample.ts` (append `TrampleMap` class + fallback texture)
- Modify: `tests/world/GrassTrample.test.ts` (append light smoke tests)

**Interfaces:**
- Consumes: `decayFactor`, `worldToTrampleCell`, `stampInto`, `shouldRecenter`,
  `shiftGrid`, `TRAMPLE_MAP_WORLD_SIZE`, `TRAMPLE_MAP_RESOLUTION`, `TRAMPLE_STAMP_RADIUS`,
  `TRAMPLE_DECAY_HALF_LIFE_S`, `TRAMPLE_RECENTER_THRESHOLD_WU` (Task 1).
- Produces: `TrampleMap` class (`constructor()`, `readonly texture: THREE.DataTexture`,
  `readonly worldSize: number`, `getCenter(): { x: number; z: number }`,
  `update(playerX: number, playerZ: number, dt: number): void`, `dispose(): void`), and
  `FALLBACK_TRAMPLE_TEXTURE: THREE.DataTexture` (a shared, always-black 1×1 texture).
  Consumed by Task 3's `GrassField`/`createGrassMaterial`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/world/GrassTrample.test.ts` (add a `THREE` import at the top — change:

```ts
import { describe, it, expect } from 'vitest';
```

to:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
```

then change the existing import block:

```ts
import {
  decayFactor, worldToTrampleCell, stampInto, shouldRecenter, shiftGrid,
} from '@/world/GrassTrample';
```

to:

```ts
import {
  decayFactor, worldToTrampleCell, stampInto, shouldRecenter, shiftGrid,
  TrampleMap, FALLBACK_TRAMPLE_TEXTURE, TRAMPLE_MAP_WORLD_SIZE,
} from '@/world/GrassTrample';
```

Then append at the end of the file:

```ts

describe('FALLBACK_TRAMPLE_TEXTURE', () => {
  it('is a 1x1 texture (a harmless always-black default for GrassField instances with no TrampleMap)', () => {
    expect(FALLBACK_TRAMPLE_TEXTURE.image.width).toBe(1);
    expect(FALLBACK_TRAMPLE_TEXTURE.image.height).toBe(1);
  });
});

describe('TrampleMap', () => {
  it('constructs with a worldSize matching TRAMPLE_MAP_WORLD_SIZE and a center at the origin', () => {
    const map = new TrampleMap();
    expect(map.worldSize).toBe(TRAMPLE_MAP_WORLD_SIZE);
    expect(map.getCenter()).toEqual({ x: 0, z: 0 });
    map.dispose();
  });

  it('update() does not throw across many frames of simulated player movement', () => {
    const map = new TrampleMap();
    let x = 0, z = 0;
    for (let i = 0; i < 200; i++) {
      x += 0.3; z += 0.1; // simulate walking
      expect(() => map.update(x, z, 1 / 30)).not.toThrow();
    }
    map.dispose();
  });

  it('recenters after the player has moved past TRAMPLE_RECENTER_THRESHOLD_WU', () => {
    const map = new TrampleMap();
    map.update(0, 0, 1 / 30);
    expect(map.getCenter()).toEqual({ x: 0, z: 0 });
    map.update(20, 0, 1 / 30); // 20 > 12 WU threshold
    const center = map.getCenter();
    expect(center.x).toBeGreaterThan(0); // recentered toward the player
    map.dispose();
  });

  it('dispose() does not throw and can be called safely', () => {
    const map = new TrampleMap();
    expect(() => map.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/GrassTrample.test.ts`
Expected: FAIL — `TrampleMap`/`FALLBACK_TRAMPLE_TEXTURE` are not exported yet.

- [ ] **Step 3: Add the THREE import and implement `TrampleMap`**

In `src/world/GrassTrample.ts`, add at the very top of the file (before the existing doc
comment):

```ts
import * as THREE from 'three';

```

Then append at the end of the file:

```ts

// ── TrampleMap (THREE.js wrapper — not unit-tested beyond construction smoke checks;
// the actual shader-visible flattening is verified manually, see this feature's plan
// Task 5) ───────────────────────────────────────────────────────────────────────────

/** Shared, always-black 1x1 fallback for any GrassField constructed without a real
 *  TrampleMap (e.g. this file's own direct-construction tests) — sampling it always
 *  returns 0 ("never trampled"), a harmless no-op. */
export const FALLBACK_TRAMPLE_TEXTURE = new THREE.DataTexture(
  new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType,
);
FALLBACK_TRAMPLE_TEXTURE.needsUpdate = true;

/**
 * Owns the decaying player-trample grid and pushes it into a THREE.DataTexture every
 * `update()` call — mutate the backing Uint8Array + flag needsUpdate, exactly like
 * GrassField's own instanced attribute buffers, so no extra GPU render pass or
 * THREE.WebGLRenderer reference is ever needed (see this file's own doc comment / the
 * design spec §3 for why).
 */
export class TrampleMap {
  readonly texture: THREE.DataTexture;
  readonly worldSize = TRAMPLE_MAP_WORLD_SIZE;

  private readonly _grid = new Float32Array(TRAMPLE_MAP_RESOLUTION * TRAMPLE_MAP_RESOLUTION);
  private readonly _textureData = new Uint8Array(TRAMPLE_MAP_RESOLUTION * TRAMPLE_MAP_RESOLUTION * 4);
  private readonly _cellWorldSize = TRAMPLE_MAP_WORLD_SIZE / TRAMPLE_MAP_RESOLUTION;
  private _centerX = 0;
  private _centerZ = 0;

  constructor() {
    this.texture = new THREE.DataTexture(
      this._textureData, TRAMPLE_MAP_RESOLUTION, TRAMPLE_MAP_RESOLUTION,
      THREE.RGBAFormat, THREE.UnsignedByteType,
    );
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  getCenter(): { x: number; z: number } {
    return { x: this._centerX, z: this._centerZ };
  }

  /** Call once per frame with the player's current world position. */
  update(playerX: number, playerZ: number, dt: number): void {
    // 1. Age every existing trample value.
    const decay = decayFactor(dt, TRAMPLE_DECAY_HALF_LIFE_S);
    for (let i = 0; i < this._grid.length; i++) this._grid[i] *= decay;

    // 2. Recenter (shifting existing data, not discarding it) if the player has wandered
    // far enough. Snap the new center to a whole number of cells so the grid-to-world
    // mapping stays exact (at most half a cell — 0.375 WU — off from the player's literal
    // position, imperceptible for this soft-blob effect).
    const dx = playerX - this._centerX;
    const dz = playerZ - this._centerZ;
    if (shouldRecenter(dx, dz, TRAMPLE_RECENTER_THRESHOLD_WU)) {
      const shiftCols = Math.round(dx / this._cellWorldSize);
      const shiftRows = Math.round(dz / this._cellWorldSize);
      const shifted = shiftGrid(this._grid, TRAMPLE_MAP_RESOLUTION, shiftCols, shiftRows);
      this._grid.set(shifted);
      this._centerX += shiftCols * this._cellWorldSize;
      this._centerZ += shiftRows * this._cellWorldSize;
    }

    // 3. Stamp the player's current position (after decay/recenter, so a brand-new
    // footprint isn't immediately aged within the same frame it was placed).
    const cell = worldToTrampleCell(
      playerX, playerZ, this._centerX, this._centerZ,
      TRAMPLE_MAP_WORLD_SIZE, TRAMPLE_MAP_RESOLUTION,
    );
    if (cell) {
      stampInto(
        this._grid, TRAMPLE_MAP_RESOLUTION, this._cellWorldSize,
        cell.col, cell.row, TRAMPLE_STAMP_RADIUS,
      );
    }

    // 4. Push the float grid into the GPU-visible Uint8 texture.
    for (let i = 0; i < this._grid.length; i++) {
      this._textureData[i * 4] = Math.round(Math.min(1, this._grid[i]) * 255);
      this._textureData[i * 4 + 1] = 0;
      this._textureData[i * 4 + 2] = 0;
      this._textureData[i * 4 + 3] = 255;
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/GrassTrample.test.ts`
Expected: PASS — all tests, including the 4 new `TrampleMap` tests and the
`FALLBACK_TRAMPLE_TEXTURE` test.

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144.

- [ ] **Step 6: Commit**

```bash
git add src/world/GrassTrample.ts tests/world/GrassTrample.test.ts
git commit -m "feat: add TrampleMap (decaying trail grid -> DataTexture wrapper)

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Wire trample sampling into `GrassField.ts`'s shader

**Files:**
- Modify: `src/world/GrassField.ts`

**Interfaces:**
- Consumes: `TRAMPLE_MAP_WORLD_SIZE`, `FALLBACK_TRAMPLE_TEXTURE`, `TrampleMap` (Task 2).
- Produces: `GrassField`'s constructor gains an optional 4th parameter
  `trampleMap?: TrampleMap`. Consumed by Task 4's `OverworldScene` wiring.

This task has no NEW automated tests of its own beyond re-running the existing
`GrassField.test.ts` suite unchanged (the shader-visible flattening itself can only be
verified in a real browser — bundled into Task 5). The existing tests already construct
`createGrassMaterial(preset)` (1-arg) and `new GrassField(wg, seed, preset)` (3-arg)
directly — this task must keep both working exactly as before when no trample map is
given.

- [ ] **Step 1: Add the import**

In `src/world/GrassField.ts`, find:

```ts
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { LEVEL_HEIGHT } from '@/world/WaterDepthConfig';
import { isScatterAllowed } from '@/world/ScatterRules';
```

Change to:

```ts
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { LEVEL_HEIGHT } from '@/world/WaterDepthConfig';
import { isScatterAllowed } from '@/world/ScatterRules';
import { TRAMPLE_MAP_WORLD_SIZE, FALLBACK_TRAMPLE_TEXTURE, type TrampleMap } from '@/world/GrassTrample';
```

- [ ] **Step 2: Add the new uniforms to `createGrassMaterial()`**

Find:

```ts
      uWindTime:     { value: 0 },
      uWindDir:      { value: new THREE.Vector2(1, 0.3).normalize() },
      uWindBase:     { value: preset.windBase },
      uWindGust:     { value: preset.windGust },
      uWindGustFreq: { value: preset.windGustFreq },
      uBladeHeight:  { value: preset.height },
      uFadeStart:    { value: FADE_START },
      uFadeEnd:      { value: FADE_END },
      uFadeCenter:   { value: new THREE.Vector2(0, 0) },
```

Change to:

```ts
      uWindTime:     { value: 0 },
      uWindDir:      { value: new THREE.Vector2(1, 0.3).normalize() },
      uWindBase:     { value: preset.windBase },
      uWindGust:     { value: preset.windGust },
      uWindGustFreq: { value: preset.windGustFreq },
      uBladeHeight:  { value: preset.height },
      uFadeStart:    { value: FADE_START },
      uFadeEnd:      { value: FADE_END },
      uFadeCenter:   { value: new THREE.Vector2(0, 0) },
      uTrampleMap:       { value: FALLBACK_TRAMPLE_TEXTURE },
      uTrampleCenter:    { value: new THREE.Vector2(0, 0) },
      uTrampleWorldSize: { value: TRAMPLE_MAP_WORLD_SIZE },
```

- [ ] **Step 3: Declare the new uniforms in the vertex shader**

Find:

```ts
      uniform float uFadeStart;
      uniform float uFadeEnd;
      uniform vec2  uFadeCenter; // world XZ position to fade distance from (the player,
                                  // NOT cameraPosition — this game's fixed isometric camera
                                  // sits ~28 WU from the player (see CameraRig.ts's
                                  // ISO_OFFSET), so fading by camera distance made grass
                                  // right at the player's feet always fully discard).
```

Change to:

```ts
      uniform float uFadeStart;
      uniform float uFadeEnd;
      uniform vec2  uFadeCenter; // world XZ position to fade distance from (the player,
                                  // NOT cameraPosition — this game's fixed isometric camera
                                  // sits ~28 WU from the player (see CameraRig.ts's
                                  // ISO_OFFSET), so fading by camera distance made grass
                                  // right at the player's feet always fully discard).
      uniform sampler2D uTrampleMap;
      uniform vec2      uTrampleCenter;
      uniform float     uTrampleWorldSize;
```

- [ ] **Step 4: Sample the trample map and flatten trampled blades in `main()`**

Find:

```ts
      void main() {
        vUv = uv;
        vColorVar = aScaleVariation.w;

        vec3 pos = position;
        pos.x *= aScaleVariation.x;
        pos.y *= aScaleVariation.y;

        float tilt = aScaleVariation.z;
        float cosT = cos(tilt);
        float sinT = sin(tilt);
        float tiltedY = pos.y * cosT - pos.z * sinT;
        float tiltedZ = pos.y * sinT + pos.z * cosT;
        pos.y = tiltedY;
        pos.z = tiltedZ;

        float rot = aPositionRotation.w;
        float cosR = cos(rot);
        float sinR = sin(rot);
        vec3 rotated;
        rotated.x = pos.x * cosR - pos.z * sinR;
        rotated.y = pos.y;
        rotated.z = pos.x * sinR + pos.z * cosR;

        vec3 worldPos = rotated + aPositionRotation.xyz;

        float heightFactor = uv.y;
        vec2 windOffsetXZ = computeWind(worldPos, heightFactor);
        worldPos.x += windOffsetXZ.x;
        worldPos.z += windOffsetXZ.y;
```

Change to:

```ts
      void main() {
        vUv = uv;
        vColorVar = aScaleVariation.w;

        // Sample the trample map ONCE per blade using its planted ROOT position (NOT the
        // wind-swayed per-vertex worldPos below) so every vertex of one blade agrees on how
        // "crushed" it is — see docs/superpowers/specs/2026-09-01-trampled-grass-trail-design.md §4.3.
        vec2 trampleUV = (aPositionRotation.xz - uTrampleCenter) / uTrampleWorldSize + 0.5;
        float crush = 0.0;
        if (trampleUV.x >= 0.0 && trampleUV.x <= 1.0 && trampleUV.y >= 0.0 && trampleUV.y <= 1.0) {
          crush = texture2D(uTrampleMap, trampleUV).r;
        }

        vec3 pos = position;
        pos.x *= aScaleVariation.x;
        pos.y *= aScaleVariation.y;

        float tilt = aScaleVariation.z;
        float cosT = cos(tilt);
        float sinT = sin(tilt);
        float tiltedY = pos.y * cosT - pos.z * sinT;
        float tiltedZ = pos.y * sinT + pos.z * cosT;
        pos.y = tiltedY;
        pos.z = tiltedZ;

        float rot = aPositionRotation.w;
        float cosR = cos(rot);
        float sinR = sin(rot);
        vec3 rotated;
        rotated.x = pos.x * cosR - pos.z * sinR;
        rotated.y = pos.y;
        rotated.z = pos.x * sinR + pos.z * cosR;

        // Flatten toward the ground proportional to how trampled this blade currently is
        // — the same VERTEX.y *= (1 - crush) formula verified in two independent real
        // Godot grass shaders (see the design spec's §2 research notes).
        rotated.y *= (1.0 - crush);

        vec3 worldPos = rotated + aPositionRotation.xyz;

        float heightFactor = uv.y;
        // A fully-crushed blade is pinned down and doesn't sway in the wind.
        vec2 windOffsetXZ = computeWind(worldPos, heightFactor) * (1.0 - crush);
        worldPos.x += windOffsetXZ.x;
        worldPos.z += windOffsetXZ.y;
```

- [ ] **Step 5: Add the optional `trampleMap` constructor parameter to `GrassField`**

Find:

```ts
  constructor(
    private readonly _wg: WorldGrid,
    private readonly _seed: number,
    readonly preset: GrassPreset,
  ) {
    const geometry = createGrassBladeGeometry(preset);
    this._material = createGrassMaterial(preset);
```

Change to:

```ts
  constructor(
    private readonly _wg: WorldGrid,
    private readonly _seed: number,
    readonly preset: GrassPreset,
    private readonly _trampleMap?: TrampleMap,
  ) {
    const geometry = createGrassBladeGeometry(preset);
    this._material = createGrassMaterial(preset);
    if (this._trampleMap) {
      this._material.uniforms.uTrampleMap.value = this._trampleMap.texture;
    }
```

- [ ] **Step 6: Refresh `uTrampleCenter` every `update()` call**

Find:

```ts
  update(playerX: number, playerZ: number): void {
    (this._material.uniforms.uFadeCenter.value as THREE.Vector2).set(playerX, playerZ);

    const dx = playerX - this._lastBuildX;
```

Change to:

```ts
  update(playerX: number, playerZ: number): void {
    (this._material.uniforms.uFadeCenter.value as THREE.Vector2).set(playerX, playerZ);
    if (this._trampleMap) {
      const c = this._trampleMap.getCenter();
      (this._material.uniforms.uTrampleCenter.value as THREE.Vector2).set(c.x, c.z);
    }

    const dx = playerX - this._lastBuildX;
```

- [ ] **Step 7: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144.

- [ ] **Step 8: Run the existing GrassField test suite to confirm no regression**

Run: `npx vitest run tests/world/GrassField.test.ts`
Expected: PASS — all existing tests unchanged (they never pass a 4th constructor arg or
inspect the new uniforms, so this task must not break any of them).

- [ ] **Step 9: Commit**

```bash
git add src/world/GrassField.ts
git commit -m "feat: sample the trample map in the grass shader to flatten walked-on blades

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Wire `TrampleMap` into `OverworldScene.ts` + ship

**Files:**
- Modify: `src/scene/OverworldScene.ts`
- Modify: `docs/visual-progress.md`

**Interfaces:**
- Consumes: `TrampleMap` (Task 2), `GrassField`'s optional 4th constructor param
  (Task 3).
- Produces: nothing new for later tasks — this is the final integration + ship task.

- [ ] **Step 1: Add the import**

In `src/scene/OverworldScene.ts`, find:

```ts
import { AmbientCreature, selectAmbientSpawnPoints, MAX_ACTIVE_AMBIENT_CREATURES } from '@/world/AmbientWildlife';
```

Change to:

```ts
import { AmbientCreature, selectAmbientSpawnPoints, MAX_ACTIVE_AMBIENT_CREATURES } from '@/world/AmbientWildlife';
import { TrampleMap } from '@/world/GrassTrample';
```

- [ ] **Step 2: Add the shared `TrampleMap` field**

Find:

```ts
  private readonly _activeAmbientCreatures: AmbientCreature[] = [];
```

Change to:

```ts
  private readonly _activeAmbientCreatures: AmbientCreature[] = [];
  /** Shared, single trampled-grass trail grid sampled by every GrassField below — one
   *  instance, not one per biome, so a trail reads continuously as the player crosses
   *  biome boundaries. See docs/superpowers/specs/2026-09-01-trampled-grass-trail-design.md. */
  private readonly _trampleMap = new TrampleMap();
```

- [ ] **Step 3: Pass it into every `GrassField` construction**

Find:

```ts
    this._grassFields = Object.values(GRASS_PRESETS).map(
      preset => new GrassField(this._wg, this._seed, preset),
    );
```

Change to:

```ts
    this._grassFields = Object.values(GRASS_PRESETS).map(
      preset => new GrassField(this._wg, this._seed, preset, this._trampleMap),
    );
```

- [ ] **Step 4: Tick it once per frame, before the grass fields' own `update()` calls**

Find:

```ts
    // Procedural grass (batch 2: 5 biome presets): rebuild each field's instance buffer
    // only when the player has moved past REBUILD_HYSTERESIS; tick wind uniforms every
    // frame. A given tile is only ever one biome, so at most one field actually places
    // blades near the player at a time — the others just do a cheap no-op update() call.
    for (const gf of this._grassFields) {
      gf.update(pos.x, pos.z);
      gf.tickWind(dt);
    }
```

Change to:

```ts
    // Trampled-grass trail: tick the shared grid BEFORE the grass fields' own update()
    // calls below, so their uTrampleCenter refresh reads this frame's (possibly just-
    // recentered) center, not the previous frame's stale one.
    this._trampleMap.update(pos.x, pos.z, dt);

    // Procedural grass (batch 2: 5 biome presets): rebuild each field's instance buffer
    // only when the player has moved past REBUILD_HYSTERESIS; tick wind uniforms every
    // frame. A given tile is only ever one biome, so at most one field actually places
    // blades near the player at a time — the others just do a cheap no-op update() call.
    for (const gf of this._grassFields) {
      gf.update(pos.x, pos.z);
      gf.tickWind(dt);
    }
```

- [ ] **Step 5: Dispose it on scene teardown**

Find:

```ts
    for (const gf of this._grassFields) gf.dispose();
```

Change to:

```ts
    for (const gf of this._grassFields) gf.dispose();
    this._trampleMap.dispose();
```

- [ ] **Step 6: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144.

- [ ] **Step 7: Run the OverworldScene regression suite**

Run: `npx vitest run tests/scene/OverworldScene.chunk-scatter-alignment.test.ts tests/scene/OverworldScene.settlement-parity.test.ts tests/scene/OverworldScene.drawcall-batching.test.ts tests/scene/OverworldScene.chunk-terrain-alignment.test.ts tests/scene/OverworldScene.chunk-collider-streaming.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "feat: wire trampled-grass trail into OverworldScene

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 9: Manual browser verification**

Kill any stray dev-server process squatting on port 5174 first (`ps aux | grep -i vite |
grep -v grep`; only kill one pointing at THIS worktree's path — a process from a
different checkout on a different port, e.g. 5173, is not yours to touch). Then:

```bash
npm run dev -- --host 127.0.0.1 --port 5174
```

Using a short throwaway Playwright script (raw CDP `Page.captureScreenshot`, since this
environment's `page.screenshot()` has been observed to hang on font-loading — see this
session's own established workaround), or a headed browser if available:
1. Start the game, enter the overworld, teleport to a grassland tile.
2. Walk the player through a patch of grass in a straight line, then stop.
3. Screenshot immediately after stopping — confirm a visible flattened trail behind the
   player where they just walked, and the grass directly under/just-behind the player is
   noticeably lower/flatter than the surrounding untouched grass.
4. Wait ~7-8 seconds without moving, screenshot again — confirm the trail has faded back
   to looking like normal upright grass (matching the ~2s half-life / ~6s to ~12% design
   target).
5. Confirm zero console/page errors throughout.

Stop the manually-started dev server when done (`ps aux | grep -i "vite --host"`, `kill
<pid>` for the one matching THIS worktree's path).

- [ ] **Step 10: Run the full unit/integration test suite**

Run: `npx vitest run`
Expected: the same pre-existing baseline failures established throughout this session
(`main.startup.smoke.test.ts`×3, `enemyLoader.test.ts`×3, `towerGenerator.test.ts`×2,
`talentSystem.test.ts`×3, `WaterMaterial.test.ts`×1 — 12 total), plus every new
`GrassTrample.test.ts` test passing, and zero NEW failures. If
`ResourceNodePlacer.test.ts` or `OverworldScene.chunk-scatter-alignment.test.ts` fail,
re-run each in isolation first (documented sandbox-contention flakes in this shared
environment) before treating either as a real regression. Stop any concurrently-running
dev server/browser process first.

- [ ] **Step 11: Final `tsc` check**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144.

- [ ] **Step 12: Update the visual-progress log**

Open `docs/visual-progress.md`. Add a new section after the "Overworld Editor — Paint
Mode (Dev Tool)" section:

```markdown

## Trampled-Grass Trail

Walking through grass now visibly flattens it, leaving a soft trail that fades back to
upright over a few seconds (a decaying "trample" grid sampled by the grass shader — see
`docs/superpowers/specs/2026-09-01-trampled-grass-trail-design.md`). Player-only for now;
ambient wildlife/enemies don't yet leave trails.
```

- [ ] **Step 13: Commit and push**

```bash
git add docs/visual-progress.md
git commit -m "docs: note trampled-grass trail in visual-progress log

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
git push origin HEAD:main
```
