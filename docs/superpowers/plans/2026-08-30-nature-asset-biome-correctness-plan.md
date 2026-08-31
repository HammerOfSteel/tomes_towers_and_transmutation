# Nature Asset Biome Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tree archetype selection biome-aware (closing the "pine tree next to oak tree
regardless of biome" mismatch), add 2 new tree archetypes (cactus for desert, acacia for
savanna) for the roadmap's most-cited visual gaps, and fix a related bug where trees/rocks/bushes
can currently spawn on top of rivers/lakes.

**Architecture:** `NatureAssetDNA.ts`'s `pickTreeArchetype()` gains a `biome: BiomeId` parameter
and a per-biome archetype table, so each biome only ever picks from its own correct archetype
set via the existing deterministic position-hash technique. `OverworldScene.ts` gains 2 new
tree-builder methods (same simple-primitive style as the existing 3) and threads `cell.biome`
through `_makeTree()`. `ScatterRules.ts`'s `isScatterAllowed()` gains a `waterDepth > 0` check
alongside its existing ocean-biome check.

**Tech Stack:** TypeScript, Vitest, Three.js (`CylinderGeometry`/`ConeGeometry` primitives,
consistent with the existing tree builders).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-30-nature-asset-biome-correctness-design.md`
  (approved 2026-08-30) — read this first; this plan implements it directly.
- `pickRockArchetype()` is **unchanged** — no biome parameter, no behavior change (rocks are
  explicitly scoped out, see spec §2).
- Grass clumps, bush archetype variety, and further snow/tundra/beach tree tuning beyond reusing
  `sparse` are explicitly out of scope (see spec §2/§5).
- After each task: run the task's targeted test file(s), then `npx tsc --noEmit` and confirm the
  error count matches the pre-existing baseline (144 errors) or better — never worse.

---

## File Structure

- **Modify** `src/world/NatureAssetDNA.ts` — new `TreeArchetype` values (`cactus`, `acacia`),
  new per-biome archetype table, `pickTreeArchetype()` gains a `biome` parameter.
- **Modify** `tests/world/NatureAssetDNA.test.ts` — update `pickTreeArchetype` tests for the new
  signature; add biome-correctness assertions.
- **Modify** `src/scene/OverworldScene.ts` — 2 new tree-builder methods (`_buildCactusTree()`,
  `_buildAcaciaTree()`), `_makeTree()` gains a `biome` parameter and dispatches to them,
  `_buildChunkScatter()`'s call site passes `cell.biome` through.
- **Modify** `src/world/ScatterRules.ts` — `isScatterAllowed()` gains a `waterDepth > 0` check.
- **Modify** `tests/world/ScatterRules.test.ts` — new test for the river/lake exclusion.

---

## Task 1: Biome-aware `pickTreeArchetype()` in `NatureAssetDNA.ts`

**Files:**
- Modify: `src/world/NatureAssetDNA.ts`
- Modify: `tests/world/NatureAssetDNA.test.ts`

**Interfaces:**
- Produces: `pickTreeArchetype(biome: BiomeId, wx: number, wz: number): TreeArchetype` (breaking
  signature change from `(wx, wz)`), consumed by Task 2's `OverworldScene.ts`.
- `TreeArchetype` gains `'cactus'` and `'acacia'`.

- [ ] **Step 1: Write failing tests for the new signature and biome correctness**

Replace the existing `describe('pickTreeArchetype', ...)` block in
`tests/world/NatureAssetDNA.test.ts` with:

```ts
describe('pickTreeArchetype', () => {
  it('is deterministic for the same biome and position', () => {
    for (let i = -20; i < 20; i++) {
      const a = pickTreeArchetype('forest', i * 3.3, -i * 1.9);
      expect(a).toBe(pickTreeArchetype('forest', i * 3.3, -i * 1.9));
    }
  });

  it('only ever picks from a biome\'s own allowed archetype set', () => {
    const allowed: Record<string, TreeArchetype[]> = {
      grassland: ['deciduous', 'sparse'],
      forest: ['conifer', 'deciduous'],
      taiga: ['conifer'],
      tundra: ['sparse'],
      mountain: ['sparse'],
      snow: ['sparse'],
      desert: ['cactus'],
      savanna: ['acacia'],
    };
    for (const [biome, set] of Object.entries(allowed)) {
      for (let i = -15; i < 15; i++) {
        const a = pickTreeArchetype(biome as BiomeId, i * 2.7, -i * 4.1);
        expect(set, `biome ${biome} produced unexpected archetype ${a}`).toContain(a);
      }
    }
  });

  it('produces more than one distinct archetype across many positions for a mixed biome', () => {
    const seen = new Set<TreeArchetype>();
    for (let i = -20; i < 20; i++) seen.add(pickTreeArchetype('forest', i * 3.3, -i * 1.9));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('always picks the single allowed archetype for a uniform biome', () => {
    for (let i = -20; i < 20; i++) {
      expect(pickTreeArchetype('taiga', i * 3.3, -i * 1.9)).toBe('conifer');
      expect(pickTreeArchetype('desert', i * 3.3, -i * 1.9)).toBe('cactus');
      expect(pickTreeArchetype('savanna', i * 3.3, -i * 1.9)).toBe('acacia');
    }
  });

  it('a different biome at the same position can yield a different archetype', () => {
    // Same coordinates, biomes whose sets don't overlap at all.
    expect(pickTreeArchetype('taiga', 5, 5)).toBe('conifer');
    expect(pickTreeArchetype('desert', 5, 5)).toBe('cactus');
  });
});
```

Add `BiomeId` to the test file's imports: find `import { ... } from '@/world/NatureAssetDNA';`
and add a sibling import line:

```ts
import type { BiomeId } from '@/world/WorldGrid';
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
npx vitest run tests/world/NatureAssetDNA.test.ts
```

Expected: FAIL — `pickTreeArchetype` still takes `(wx, wz)`, not `(biome, wx, wz)` (a
type/argument-count error at minimum, and `'cactus'`/`'acacia'` don't exist yet).

- [ ] **Step 3: Implement the biome-aware table in `src/world/NatureAssetDNA.ts`**

Replace the file's tree-archetype section:

```ts
export type TreeArchetype = 'conifer' | 'deciduous' | 'sparse' | 'cactus' | 'acacia';
export type RockArchetype = 'boulder' | 'slab' | 'cluster';

const ROCK_ARCHETYPES: readonly RockArchetype[] = ['boulder', 'slab', 'cluster'];

/** Which archetypes each biome is allowed to pick from — closes the "pine
 *  tree next to oak tree regardless of biome" mismatch (see
 *  docs/superpowers/specs/2026-08-30-nature-asset-biome-correctness-design.md §3.1).
 *  `beach`/`ocean`/`deep_ocean` are never actually reached in practice
 *  (ScatterRules.ts's isScatterAllowed() already excludes trees from these
 *  biomes) — included only so the table is total over BiomeId. */
const BIOME_TREE_ARCHETYPES: Record<BiomeId, readonly TreeArchetype[]> = {
  grassland:  ['deciduous', 'sparse'],
  forest:     ['conifer', 'deciduous'],
  taiga:      ['conifer'],
  tundra:     ['sparse'],
  mountain:   ['sparse'],
  snow:       ['sparse'],
  desert:     ['cactus'],
  savanna:    ['acacia'],
  beach:      ['sparse'],
  ocean:      ['sparse'],
  deep_ocean: ['sparse'],
};

/** Deterministic tree archetype for a tree placed at world position (wx, wz),
 *  restricted to the archetypes allowed for `biome`. */
export function pickTreeArchetype(biome: BiomeId, wx: number, wz: number): TreeArchetype {
  const set = BIOME_TREE_ARCHETYPES[biome];
  return set[hashIndex(wx, wz, set.length)]!;
}
```

Add the import at the top of the file:

```ts
import type { BiomeId } from './WorldGrid';
```

(Leave `pickRockArchetype()` and its `ROCK_ARCHETYPES` constant completely unchanged.)

- [ ] **Step 4: Run the tests, confirm they pass**

```bash
npx vitest run tests/world/NatureAssetDNA.test.ts
```

- [ ] **Step 5: Run `npx tsc --noEmit`** — expect it to show a new error at
  `OverworldScene.ts`'s existing `pickTreeArchetype(wx, wz)` call site (Task 2 fixes this) —
  confirm the error count is exactly baseline + 1 (a single new call-site mismatch), not more.

- [ ] **Step 6: Commit**

```bash
git add src/world/NatureAssetDNA.ts tests/world/NatureAssetDNA.test.ts
git commit -m "feat: make pickTreeArchetype biome-aware, add cactus/acacia archetypes"
```

---

## Task 2: New tree builders + `_makeTree()` biome threading in `OverworldScene.ts`

**Files:**
- Modify: `src/scene/OverworldScene.ts`

**Interfaces:**
- Consumes: `pickTreeArchetype(biome, wx, wz)` from Task 1.

- [ ] **Step 1: Add the 2 new tree-builder methods**

Find `_buildSparseTree()` (the last of the 3 existing tree builders) and add these 2 new
methods right after it:

```ts
  /** Saguaro-style cactus — a vertical trunk cylinder with 0-2 shorter
   *  vertical "arm" cylinders offset to either side. Desert's tree
   *  archetype (see NatureAssetDNA.ts's BIOME_TREE_ARCHETYPES). */
  private _buildCactusTree(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    const trunkH = 1.6 + rand() * 1.4;
    const trunkR = 0.16 + rand() * 0.07;
    const mat = this._pooledMaterial(
      'cactus',
      [0x3f7d32, 0x3f7d32 + 0x010100, 0x3f7d32 + 0x020200, 0x3f7d32 + 0x030300],
      rand,
      0.16,
    );

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR, trunkR * 1.1, trunkH, 8), mat);
    trunk.position.y = trunkH / 2;
    g.add(trunk);

    // 0-2 short vertical side arms, a classic saguaro silhouette.
    const armCount = Math.floor(rand() * 3);
    for (let i = 0; i < armCount; i++) {
      const armH = 0.5 + rand() * 0.5;
      const armR = trunkR * 0.7;
      const side = i % 2 === 0 ? 1 : -1;
      const armY = trunkH * (0.35 + rand() * 0.35);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(armR, armR * 1.05, armH, 6), mat);
      arm.position.set(side * (trunkR + armR + 0.02), armY + armH / 2, 0);
      g.add(arm);
    }

    return g;
  }

  /** Short gnarled trunk topped by a single wide, shallow "umbrella" canopy
   *  — savanna's tree archetype, distinct from conifer's tall narrow cone
   *  stack and deciduous's rounded lumpy canopy (see NatureAssetDNA.ts's
   *  BIOME_TREE_ARCHETYPES). */
  private _buildAcaciaTree(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    const trunkH = 1.4 + rand() * 0.8;
    const trunkR = 0.10 + rand() * 0.05;
    const canopyR = 1.6 + rand() * 0.9;
    const canopyH = 0.5 + rand() * 0.25;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 0.6, trunkR, trunkH, 6),
      this._pooledMaterial('acacia-trunk', [0x4a3820, 0x4a3820 + 0x010100], rand),
    );
    trunk.position.y = trunkH / 2;
    g.add(trunk);

    const canopyMat = this._pooledMaterial(
      'acacia-canopy',
      [0x5c7a2e, 0x5c7a2e + 0x010100, 0x5c7a2e + 0x020200, 0x5c7a2e + 0x030300],
      rand,
      0.2,
    );
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(canopyR, canopyH, 8), canopyMat);
    canopy.position.y = trunkH + canopyH * 0.3;
    g.add(canopy);

    return g;
  }
```

- [ ] **Step 2: Thread `biome` through `_makeTree()`**

Find:

```ts
  private _makeTree(rand: () => number, wx: number, wz: number): THREE.Group {
    const archetype = pickTreeArchetype(wx, wz);
    if (archetype === 'deciduous') return this._buildDeciduousTree(rand);
    if (archetype === 'sparse')    return this._buildSparseTree(rand);
    return this._buildConiferTree(rand);
  }
```

Replace with:

```ts
  private _makeTree(rand: () => number, biome: BiomeId, wx: number, wz: number): THREE.Group {
    const archetype = pickTreeArchetype(biome, wx, wz);
    if (archetype === 'deciduous') return this._buildDeciduousTree(rand);
    if (archetype === 'sparse')    return this._buildSparseTree(rand);
    if (archetype === 'cactus')    return this._buildCactusTree(rand);
    if (archetype === 'acacia')    return this._buildAcaciaTree(rand);
    return this._buildConiferTree(rand);
  }
```

- [ ] **Step 3: Update the call site in `_buildChunkScatter()`**

Find:

```ts
      const tree = this._makeTree(rand, wx, wz);
```

Replace with:

```ts
      const tree = this._makeTree(rand, cell.biome, wx, wz);
```

(`cell` is already in scope at this call site — it's read one line above via `const cell =
this._wg.get(c, r);` for the `isScatterAllowed(cell, 'tree')` check.)

- [ ] **Step 4: Confirm `BiomeId` is imported**

`OverworldScene.ts` already imports from `@/world/WorldGrid` for other purposes — check:

```bash
grep -n "from '@/world/WorldGrid'" src/scene/OverworldScene.ts
```

If `BiomeId` is not already part of that import list, add it to the existing import statement's
named imports (do not add a second, separate import line for the same module).

- [ ] **Step 5: Run `npx tsc --noEmit`, confirm error count is back at the 144 baseline**

- [ ] **Step 6: Run the existing scene test suite (regression check)**

```bash
npx vitest run tests/scene/
```

Confirm all tests still pass — this exercises full scatter placement end-to-end and would catch
any dispatch/threading mistake.

- [ ] **Step 7: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "feat: add cactus/acacia tree builders, thread biome through _makeTree"
```

---

## Task 3: Fix `ScatterRules.ts` river/lake exclusion

**Files:**
- Modify: `src/world/ScatterRules.ts`
- Modify: `tests/world/ScatterRules.test.ts`

**Interfaces:** none new — pure bugfix within the existing `isScatterAllowed()` signature.

- [ ] **Step 1: Write a failing test**

Add to `tests/world/ScatterRules.test.ts`, in the `describe('isScatterAllowed — widened biome
taxonomy', ...)` block (or a new sibling `describe`):

```ts
  it('disallows tree/bush/rock on a river/lake tile even though it sits on an ordinary land biome', () => {
    const riverCell = makeCell({ biome: 'grassland', feature: 'river', waterDepth: 2.0, walkable: false });
    const lakeCell  = makeCell({ biome: 'forest',    feature: 'lake',  waterDepth: 2.0, walkable: false });
    for (const cell of [riverCell, lakeCell]) {
      expect(isScatterAllowed(cell, 'tree')).toBe(false);
      expect(isScatterAllowed(cell, 'bush')).toBe(false);
      expect(isScatterAllowed(cell, 'rock')).toBe(false);
    }
  });
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
npx vitest run tests/world/ScatterRules.test.ts -t "river/lake tile"
```

Expected: FAIL — `isScatterAllowed` currently only checks `biome === 'ocean'/'deep_ocean'`, so a
`grassland`/`forest`-biome river/lake tile is not excluded.

- [ ] **Step 3: Fix `isScatterAllowed()`**

Find:

```ts
export function isScatterAllowed(cell: WorldCell, kind: ScatterKind): boolean {
  if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') return false;
  if (cell.settlementId > 0) return false;
```

Replace with:

```ts
export function isScatterAllowed(cell: WorldCell, kind: ScatterKind): boolean {
  if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') return false;
  // A river/lake tile sits on an ordinary land biome (not a special water
  // biome, since Phase 3's lakes) — waterDepth is the generic "is this
  // actually water" signal already used elsewhere (WaterDetection.ts,
  // TerrainGeometryBuilder.ts), so check it directly rather than
  // enumerating feature==='river'/'lake' by name.
  if (cell.waterDepth > 0) return false;
  if (cell.settlementId > 0) return false;
```

- [ ] **Step 4: Run the tests, confirm all pass**

```bash
npx vitest run tests/world/ScatterRules.test.ts
```

- [ ] **Step 5: Run `npx tsc --noEmit`, confirm baseline (144)**

- [ ] **Step 6: Commit**

```bash
git add src/world/ScatterRules.ts tests/world/ScatterRules.test.ts
git commit -m "fix: exclude river/lake tiles from tree/bush/rock scatter placement"
```

---

## Task 4: Full regression, live verification, ship

**Files:** none (verification + rollout only)

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Confirm the exact same 12 pre-existing baseline failures — zero new failures. If
`ResourceNodePlacer.test.ts` shows a failure, re-run it in isolation before concluding it's a
real regression (documented sandbox flakiness precedent from Phases 3/4a).

- [ ] **Step 2: Run `npx tsc --noEmit`, confirm error count is at or below the 144 baseline**

- [ ] **Step 3: Attempt live/manual verification**

Using the established Playwright + dev server workflow (check `ps aux | grep chrom` and kill
stale processes first): generate a world at a seed/config likely to include desert and savanna
biomes, confirm no console/page errors after `forceTick()`, and attempt a screenshot to visually
confirm cacti/acacia trees appear in their respective biomes and rivers/lakes have no trees
growing in them. If browser automation hangs or screenshot capture times out (a recurring
environment limitation this session), report the gap explicitly rather than blocking completion
on it, per established precedent.

- [ ] **Step 4: Update the roadmap doc**

In `docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md`'s Phase 7 section, mark the
tree-archetype-selection bullet DONE with a technical writeup (what shipped: biome-aware
selection + 2 new archetypes + the river/lake scatter fix; what's deferred: rock/bush archetype
variety, grass clumps, further snow/tundra/beach tuning — see spec §2/§5).

- [ ] **Step 5: Commit and push to `main`**

```bash
git add docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md
git commit -m "docs: mark nature-asset biome correctness DONE (Phase 7 partial)"
git push origin HEAD:main
```
