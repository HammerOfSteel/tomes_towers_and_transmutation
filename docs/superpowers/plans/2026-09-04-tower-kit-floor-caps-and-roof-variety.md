# Tower-Kit Floor Caps & Residential Roof Variety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the visible "no ground / seethrough" gap at every tower-kit
ring boundary (worst at the treehouse's roof transition), and give the
elven house/villa/terraced/inn/blacksmith family the same roof-archetype
variety (classic/pagoda/living) the tower already has, instead of always
forcing a living canopy.

**Architecture:** A new `buildFloorCap()` helper builds a flat filled
octagon disc from `StoneTowerShape.ts`'s existing `octagonPoints()`.
`buildTowerBase()` and `buildTowerWallRing()` (both in
`StoneTowerKit.ts`) each add one to the top of their own returned group,
so every ring-to-ring and ring-to-roof seam gets solid decking, with
zero changes to `buildTowerKitCore()`'s own top-level child ordering.
Separately, `StoneTowerRoofCap.ts`'s `pickRoofArchetype()` /
`buildTowerRoofCap()` take an optional weight-table parameter (default =
existing tower weights, so the tower itself is unaffected), and
`ElvenTreehouseKit.ts` switches from unconditionally calling
`buildLivingRoofCap()` to calling `buildTowerRoofCap()` with a new
residential-leaning weight table.

**Tech Stack:** TypeScript, Three.js, Vitest — matches the existing
tower-kit family exactly, no new dependencies.

## Global Constraints

- Baseline (established fresh on this branch immediately before this
  plan's changes): `npx vitest run` → 13 failed / 3226 passed (6 failed
  files, all pre-existing and unrelated: `WaterMaterial.test.ts` and 5
  others). `npx tsc --noEmit` → 144 errors, all pre-existing. Any NEW
  failures beyond these exact counts are real regressions that must be
  fixed before this plan is considered done.
- All new/modified files must have `castShadow`/`receiveShadow` set
  consistent with sibling meshes in the same file (see existing
  convention throughout `StoneTowerKit.ts`/`StoneTowerBalcony.ts`).
- Preserve `buildElvenStoneTower()`'s exact existing behavior (all 30
  `StoneTowerKit.test.ts` tests must pass unchanged) — the floor-cap
  addition is additive-only, and the roof-weight parameter must default
  to the tower's own existing weights.
- Reuse `StoneTowerShape.ts`'s `octagonPoints()` — do not reimplement
  octagon-corner math.

---

### Task 1: `buildFloorCap()` — filled octagon disc primitive

**Files:**
- Create: `src/world/buildings/StoneTowerFloorCap.ts`
- Test: `tests/world/buildings/StoneTowerFloorCap.test.ts`

**Interfaces:**
- Consumes: `octagonPoints(radius, vertexScales?)` from
  `src/world/buildings/StoneTowerShape.ts` (existing, unchanged).
- Produces: `buildFloorCap(radius: number, material: THREE.Material,
  vertexScales?: number[]): THREE.Mesh` — a mesh named
  `'elven-tower-floor-cap'`, lying flat in the local XZ plane at local
  `y = 0`, with a face normal pointing +Y. Consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Create `tests/world/buildings/StoneTowerFloorCap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildFloorCap } from '@/world/buildings/StoneTowerFloorCap';

function mat(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#888' });
}

describe('buildFloorCap', () => {
  it('builds a mesh named elven-tower-floor-cap with a face normal pointing +Y', () => {
    const cap = buildFloorCap(2, mat());
    expect(cap.name).toBe('elven-tower-floor-cap');
    cap.geometry.computeVertexNormals();
    const normals = cap.geometry.attributes.normal;
    expect(normals).toBeDefined();
    for (let i = 0; i < normals.count; i++) {
      expect(normals.getY(i)).toBeGreaterThan(0.9);
    }
  });

  it('lies flat at y=0 with all vertices within the given radius', () => {
    const cap = buildFloorCap(3, mat());
    const pos = cap.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBe(0);
      const dist = Math.hypot(pos.getX(i), pos.getZ(i));
      expect(dist).toBeLessThanOrEqual(3 + 1e-6);
    }
  });

  it('has no NaN vertices and at least 8 triangles (one per octagon edge)', () => {
    const cap = buildFloorCap(1.5, mat());
    const pos = cap.geometry.attributes.position;
    for (let i = 0; i < pos.count * 3; i++) {
      expect(Number.isFinite(pos.array[i])).toBe(true);
    }
    const index = cap.geometry.getIndex();
    expect(index).not.toBeNull();
    expect(index!.count / 3).toBeGreaterThanOrEqual(8);
  });

  it('follows per-corner vertexScales jitter, matching octagonPoints()', () => {
    const scales = [1, 1, 1, 1, 1, 1, 1, 1.5]; // corner 7 pushed further out
    const cap = buildFloorCap(2, mat(), scales);
    const pos = cap.geometry.attributes.position;
    let maxDist = 0;
    for (let i = 0; i < pos.count; i++) {
      maxDist = Math.max(maxDist, Math.hypot(pos.getX(i), pos.getZ(i)));
    }
    expect(maxDist).toBeGreaterThan(2.9); // corner 7 at radius*1.5 = 3.0
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/buildings/StoneTowerFloorCap.test.ts`
Expected: FAIL with a module-not-found error for
`@/world/buildings/StoneTowerFloorCap` (the file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/world/buildings/StoneTowerFloorCap.ts`:

```ts
/**
 * StoneTowerFloorCap.ts — solid octagonal floor/ceiling discs bridging
 * every floor-ring transition in the tower-kit family (docs/superpowers/
 * specs/2026-09-04-tower-kit-floor-caps-and-roof-variety-design.md):
 * fixes a real visible bug where a narrower ring/roof sitting on a wider
 * ring below left an exposed, unfloored "shelf" -- since
 * StoneTowerWallSurface.ts's per-course block walls are a genuinely
 * hollow shell (individual protruding blocks with mortar gaps, no
 * backing wall), any such step exposed the pitch-black hollow interior
 * through the gaps between blocks, most visibly where a living-canopy
 * roof cap's much-narrower "neck" sits on the full-width top floor ring.
 */

import * as THREE from 'three';
import { octagonPoints } from './StoneTowerShape';

/**
 * Builds a flat, filled octagon disc (matching StoneTowerShape.ts's
 * shared octagon cross-section, including any per-corner `vertexScales`
 * jitter) lying in the local XZ plane at y=0 -- callers position/parent
 * it at whichever ring-top height needs a floor. Built as a plain
 * triangle fan from the center to each of the 8 boundary points; this
 * exact winding order (0, a, b) was verified by direct computation to
 * already produce a +Y-facing normal, so no extra rotation step is
 * needed (unlike THREE.ShapeGeometry, which builds in the XY plane and
 * would need an explicit rotateX).
 */
export function buildFloorCap(radius: number, material: THREE.Material, vertexScales?: number[]): THREE.Mesh {
  const pts = octagonPoints(radius, vertexScales);
  const positions: number[] = [0, 0, 0]; // center vertex, index 0
  for (const [x, z] of pts) positions.push(x, 0, z);

  const indices: number[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % n);
    indices.push(0, a, b);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'elven-tower-floor-cap';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/buildings/StoneTowerFloorCap.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/StoneTowerFloorCap.ts tests/world/buildings/StoneTowerFloorCap.test.ts
git commit -m "feat: add buildFloorCap -- filled octagon disc for tower-kit ring boundaries"
```

---

### Task 2: Wire floor caps into `buildTowerBase()` and `buildTowerWallRing()`

**Files:**
- Modify: `src/world/buildings/StoneTowerKit.ts`
- Test: `tests/world/buildings/StoneTowerKit.test.ts` (add new cases;
  do not remove any existing test)

**Interfaces:**
- Consumes: `buildFloorCap(radius, material, vertexScales?)` from Task 1.
- Produces: `buildTowerBase()` and `buildTowerWallRing()` keep their
  EXACT existing signatures and return types (`THREE.Group`) — only
  their internal contents gain one extra named child mesh each. No
  caller of either function needs to change.

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/buildings/StoneTowerKit.test.ts` (open the file
first to see its existing imports/helpers — reuse its existing `mat()`/
palette helpers rather than redefining them; the exact helper names are
already established in that file):

```ts
describe('floor caps (fixes the "seethrough, no ground" bug)', () => {
  it('buildTowerBase includes a floor-cap mesh at its own top', () => {
    const g = buildTowerBase(2, 0.6, 5, testPalette());
    let found: THREE.Object3D | undefined;
    g.traverse((o) => { if (o.name === 'elven-tower-floor-cap') found = o; });
    expect(found).toBeDefined();
    expect(found!.position.y).toBeCloseTo(0.6, 5);
  });

  it('buildTowerWallRing includes a floor-cap mesh at its own top (local y = ringHeight)', () => {
    const g = buildTowerWallRing(2, 3, 5, testPalette(), false);
    let found: THREE.Object3D | undefined;
    g.traverse((o) => { if (o.name === 'elven-tower-floor-cap') found = o; });
    expect(found).toBeDefined();
    expect(found!.position.y).toBeCloseTo(3, 5);
  });

  it('does not change buildTowerKitCore\'s top-level child ordering (base, rings, roof, optional balcony)', () => {
    const dna = testDna(5, 3);
    const g = buildElvenStoneTower(dna);
    // Existing convention already relied on elsewhere in this file/
    // ElvenTreehouseKit.test.ts: children are [base, ring0..ringN-1, roof, balcony?].
    // Floor caps must live INSIDE base/ring groups, not as new top-level siblings.
    expect(g.children.length).toBeGreaterThanOrEqual(1 + 3 + 1); // base + >=3 floors + roof (floor count is seed-random 3-6)
  });
});
```

If `testPalette()` / `testDna()` helper names don't already exist in
this file under those exact names, use whatever equivalent helpers the
file already defines (open the file and check first) — do not
redefine duplicate helpers.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/buildings/StoneTowerKit.test.ts`
Expected: FAIL on the two new floor-cap tests (no `elven-tower-floor-cap`
child found yet). The third test may already pass (it's a guard, not
new behavior) — that's fine, it still must pass after Step 3.

- [ ] **Step 3: Write minimal implementation**

In `src/world/buildings/StoneTowerKit.ts`, add the import:

```ts
import { buildFloorCap } from './StoneTowerFloorCap';
```

In `buildTowerBase()`, right before the final `return g;`:

```ts
  const floorCap = buildFloorCap(plinthRadius, palette.stone);
  floorCap.position.y = plinthHeight;
  g.add(floorCap);

  return g;
```

In `buildTowerWallRing()`, right before `g.position.x = offsetX;`:

```ts
  const floorCap = buildFloorCap(radius, palette.stone, vertexScales);
  floorCap.position.y = ringHeight;
  g.add(floorCap);

  g.position.x = offsetX;
```

(Keep the rest of that function unchanged — the floor cap is added to
the LOCAL group before the group's own position/rotation offsets are
applied, so it inherits them automatically, exactly matching how the
window/prop decorations already work in this same function.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/buildings/StoneTowerKit.test.ts`
Expected: PASS, all tests including the pre-existing 30.

- [ ] **Step 5: Run the full elven building slice to confirm no regressions**

Run: `npx vitest run tests/world/buildings/`
Expected: all pass except any files already failing in the baseline
(there should be none in this directory — the 13 baseline failures are
in `tests/world/WaterMaterial.test.ts` and 5 other unrelated files, not
under `tests/world/buildings/`).

- [ ] **Step 6: Commit**

```bash
git add src/world/buildings/StoneTowerKit.ts tests/world/buildings/StoneTowerKit.test.ts
git commit -m "fix: cap every tower-kit ring boundary with a solid floor disc

Fixes a real live-verified bug: StoneTowerWallSurface.ts's per-course
block walls are a hollow shell with no backing wall or floor anywhere,
so any ring narrower than the one below it (worst case: the living
roof cap's neck, which starts at half the top floor's radius) left an
unfloored, seethrough ledge revealing the pitch-black hollow interior.
buildTowerBase() and buildTowerWallRing() each now add a buildFloorCap()
disc at their own top, closing every base/floor and floor/floor seam
(and, since the roof sits at the same Y as the last floor's own cap,
the floor/roof seam too) automatically for both buildElvenStoneTower()
and buildElvenTreehouseHome()."
```

---

### Task 3: Weighted roof-archetype variety for the residential family

**Files:**
- Modify: `src/world/buildings/StoneTowerRoofCap.ts`
- Modify: `src/world/buildings/ElvenTreehouseKit.ts`
- Test: `tests/world/buildings/StoneTowerRoofCap.test.ts` (add cases)
- Test: `tests/world/buildings/ElvenTreehouseKit.test.ts` (replace the
  now-obsolete "always living" test)

**Interfaces:**
- Consumes: nothing new.
- Produces: `RoofArchetypeWeights` type, `TOWER_ROOF_ARCHETYPE_WEIGHTS`,
  `RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS` (all exported from
  `StoneTowerRoofCap.ts`); `pickRoofArchetype(seed, weights =
  TOWER_ROOF_ARCHETYPE_WEIGHTS)`; `buildTowerRoofCap(seed, radius,
  coneHeight, palette, weights = TOWER_ROOF_ARCHETYPE_WEIGHTS)` — both
  keep their existing call signature as a prefix, so every existing call
  site (including `StoneTowerKit.ts`'s `buildElvenStoneTower()`, which
  calls `buildTowerKitCore(..., buildTowerRoofCap, ...)` via a bare
  function reference) keeps working unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/buildings/StoneTowerRoofCap.test.ts`:

```ts
import { RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS, pickRoofArchetype } from '@/world/buildings/StoneTowerRoofCap';

describe('weighted roof-archetype tables', () => {
  it('pickRoofArchetype defaults to the tower weights (existing behavior unchanged)', () => {
    // Same seed sweep the existing pickRoofArchetype tests already use --
    // just confirms the new optional parameter doesn't change the default.
    const seenWithDefault = new Set<string>();
    const seenExplicit = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      seenWithDefault.add(pickRoofArchetype(seed));
    }
    for (let seed = 0; seed < 50; seed++) {
      seenExplicit.add(pickRoofArchetype(seed, undefined as any ?? require('@/world/buildings/StoneTowerRoofCap').TOWER_ROOF_ARCHETYPE_WEIGHTS));
    }
    expect(seenWithDefault).toEqual(seenExplicit);
  });

  it('RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS produces all 3 archetypes across a seed sweep, with living as plurality', () => {
    const counts: Record<string, number> = { classic: 0, pagoda: 0, living: 0 };
    for (let seed = 0; seed < 200; seed++) {
      const archetype = pickRoofArchetype(seed, RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS);
      counts[archetype]!++;
    }
    expect(counts.classic).toBeGreaterThan(0);
    expect(counts.pagoda).toBeGreaterThan(0);
    expect(counts.living).toBeGreaterThan(0);
    expect(counts.living).toBeGreaterThan(counts.classic);
    expect(counts.living).toBeGreaterThan(counts.pagoda);
  });
});
```

(Drop the awkward `require(...)` line if it causes lint/type friction —
simplify that first test to just: call `pickRoofArchetype(seed)` and
`pickRoofArchetype(seed, TOWER_ROOF_ARCHETYPE_WEIGHTS)` after importing
`TOWER_ROOF_ARCHETYPE_WEIGHTS` normally at the top of the file, and
assert the two results are `===` for every seed in the sweep — this is
simpler and avoids the dynamic require entirely:

```ts
import { TOWER_ROOF_ARCHETYPE_WEIGHTS, RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS, pickRoofArchetype } from '@/world/buildings/StoneTowerRoofCap';
// ...
it('pickRoofArchetype defaults to the tower weights (existing behavior unchanged)', () => {
  for (let seed = 0; seed < 50; seed++) {
    expect(pickRoofArchetype(seed)).toBe(pickRoofArchetype(seed, TOWER_ROOF_ARCHETYPE_WEIGHTS));
  }
});
```

Use this simpler version, not the `require()` one above.)

Replace `ElvenTreehouseKit.test.ts`'s existing test named `'always ends
in a living-canopy roof cap, never a classic shingle or pagoda roof'`
with:

```ts
  it('varies its roof archetype across seeds (living/classic/pagoda), unlike the old always-living behavior', () => {
    let sawApexBall = false;
    let sawNoApexBall = false;
    for (let seed = 0; seed < 30; seed++) {
      const dna = makeDna('house', seed, 2);
      const g = buildElvenTreehouseHome(dna);
      const roof = g.children[dna.floors + 1]!;
      let hasApexBall = false;
      roof.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') hasApexBall = true; });
      if (hasApexBall) sawApexBall = true; else sawNoApexBall = true;
    }
    // sawApexBall true means at least one seed produced classic/pagoda
    // (both always end in an apex-ball finial); sawNoApexBall true means
    // at least one seed produced the living canopy (never an apex ball).
    expect(sawApexBall).toBe(true);
    expect(sawNoApexBall).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/buildings/StoneTowerRoofCap.test.ts tests/world/buildings/ElvenTreehouseKit.test.ts`
Expected: FAIL — `RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS`/
`TOWER_ROOF_ARCHETYPE_WEIGHTS` don't exist yet (module export error),
and the new treehouse test fails because every seed still produces the
living canopy (no apex ball ever seen).

- [ ] **Step 3: Write minimal implementation**

In `src/world/buildings/StoneTowerRoofCap.ts`, replace the existing
`ROOF_ARCHETYPE_WEIGHTS` constant and `pickRoofArchetype`/
`buildTowerRoofCap` functions with:

```ts
export type RoofArchetypeWeights = [RoofArchetype, number][];

/** Existing tower weights, now named/exported so other callers (the
 * residential family) can pass their own table while this stays the
 * default. */
export const TOWER_ROOF_ARCHETYPE_WEIGHTS: RoofArchetypeWeights = [
  ['classic', 0.4], ['pagoda', 0.35], ['living', 0.25],
];

/** Residential (elven house/villa/terraced/inn/blacksmith) weights:
 * `living` stays the plurality choice (preserves the "living tree home"
 * identity as the most common outcome) while giving genuine variety via
 * the SAME already-approved classic/pagoda tower roof archetypes,
 * directly answering user feedback that every treehouse roof looked
 * identical. */
export const RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS: RoofArchetypeWeights = [
  ['living', 0.45], ['classic', 0.30], ['pagoda', 0.25],
];

/** Deterministic seeded weighted choice among the 3 roof archetypes,
 * using `weights` (default: the tower's own table). */
export function pickRoofArchetype(seed: number, weights: RoofArchetypeWeights = TOWER_ROOF_ARCHETYPE_WEIGHTS): RoofArchetype {
  const rand = mulberry32(seed);
  const roll = rand();
  let acc = 0;
  for (const [archetype, weight] of weights) {
    acc += weight;
    if (roll < acc) return archetype;
  }
  return weights[weights.length - 1]![0];
}

/**
 * Picks a roof-cap archetype (classic conical shingle, living canopy,
 * or pagoda) from `seed` via `pickRoofArchetype(seed, weights)` and
 * builds it. `weights` defaults to the tower's own table.
 */
export function buildTowerRoofCap(seed: number, radius: number, coneHeight: number, palette: RoofCapPalette, weights: RoofArchetypeWeights = TOWER_ROOF_ARCHETYPE_WEIGHTS): THREE.Group {
  const archetype = pickRoofArchetype(seed, weights);
  switch (archetype) {
    case 'living': return buildLivingRoofCap(seed ^ 0x1DEA, radius, { leaf: palette.leaf, bark: palette.bark });
    case 'pagoda': return buildPagodaRoofCap(radius, coneHeight, palette);
    case 'classic': return buildClassicRoofCap(radius, coneHeight, palette.shingle);
  }
}
```

Delete the old un-named `ROOF_ARCHETYPE_WEIGHTS` constant entirely (it's
fully superseded by `TOWER_ROOF_ARCHETYPE_WEIGHTS`).

In `src/world/buildings/ElvenTreehouseKit.ts`, change the import and the
roof-building closure:

```ts
import { buildTowerRoofCap, RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS } from './StoneTowerRoofCap';
```

(remove the old `buildLivingRoofCap` import), and change:

```ts
  const rand = mulberry32(dna.seed ^ 0xE15E70);
  return buildTowerKitCore(
    dna, radius, floors, coneHeight, palette,
    (seed, r, h, p) => buildTowerRoofCap(seed, r, h, { shingle: p.shingle, leaf: p.leaf, bark: p.bark }, RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS),
    rand,
  );
```

Update this file's own doc comment (the block describing `shingle` as
"unused... but still populated to satisfy the shared interface") to
reflect that `shingle` is now genuinely used by the classic/pagoda
archetypes' roof bands.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/buildings/StoneTowerRoofCap.test.ts tests/world/buildings/ElvenTreehouseKit.test.ts tests/world/buildings/StoneTowerKit.test.ts`
Expected: PASS, all tests (including the pre-existing 30
`StoneTowerKit.test.ts` tests, proving the default-parameter change
didn't alter `buildElvenStoneTower()`'s behavior).

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/StoneTowerRoofCap.ts src/world/buildings/ElvenTreehouseKit.ts tests/world/buildings/StoneTowerRoofCap.test.ts tests/world/buildings/ElvenTreehouseKit.test.ts
git commit -m "feat: give the treehouse family the tower's own roof-archetype variety

ElvenTreehouseKit.ts no longer forces buildLivingRoofCap() on every
building -- it now calls the shared buildTowerRoofCap() with a new
RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS table (living 45% / classic 30% /
pagoda 25%), reusing the tower's own already-approved classic/pagoda
roof assemblies instead of inventing a new archetype. living stays the
plurality choice to preserve the 'living tree home' identity while
giving genuine per-building roof variety, directly per user feedback
that every treehouse roof looked identical."
```

---

### Task 4: Full regression, live Playwright verification, docs, push

**Files:**
- Modify: `TODO/organic_world_tiles_todo.md` (Phase 6 section — add a
  new sub-entry, e.g. `6.6d`, documenting this round)
- Modify: `TODO/TODO_OVERVIEW.md` (G16 row)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: exactly the same 13 failed / rest passed as the fresh baseline
recorded at the top of this plan (6 pre-existing failing files, none
newly broken).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exactly 144 errors (the fresh baseline), no new ones.

- [ ] **Step 3: Live Playwright verification**

Start a dev server on an unused port (check none of 5176-5178 are
already bound first), open the Settlement Lab, select faction `elven`,
confirm the POC kind override is `house` (or switch it there
temporarily), regenerate several seeds, and take screenshots zoomed in
on: (a) the trunk-to-roof transition (confirm the gap/seethrough hole
is gone, solid decking visible), (b) at least one classic-roof house,
one pagoda-roof house, and one living-canopy house across different
seeds (confirm genuine visual variety, not just the same canopy every
time). Delete the dev server, any throwaway `verify_*.cjs` scripts, and
`/tmp/*.png` screenshots afterward, per this project's established
convention.

- [ ] **Step 4: Update TODO docs**

Add a new sub-entry to `TODO/organic_world_tiles_todo.md`'s Phase 6
section (following the exact format of the existing `6.6`/`6.6b`/`6.6c`
entries) describing: the floor-cap bugfix (root cause + fix), the
residential roof-variety feature, verification results, and files
touched. Mirror the status in `TODO/TODO_OVERVIEW.md`'s G16 row.

- [ ] **Step 5: Commit and push**

```bash
git add TODO/organic_world_tiles_todo.md TODO/TODO_OVERVIEW.md
git commit -m "docs: record floor-cap fix + residential roof variety round in the organic-world-tiles roadmap"
git push
```

- [ ] **Step 6: Update PR #46**

Add a new "Round 9" section to PR #46's body (via `gh pr edit` or the
`update_pull_request` tool) summarizing this round, matching the format
of the existing Round 1-8 sections. Do NOT merge the PR.
