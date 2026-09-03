# Elven living-tree home — kit-of-parts implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the elven living-tree home (`buildElvenVilla()`, used by `house`/
`terraced`/`villa`/`inn`/`blacksmith` — elven's highest-frequency building type) real
per-floor delineation, carved window openings, 2 entrance styles, and a second canopy
archetype, matching the design in `docs/superpowers/specs/
2026-09-03-elven-treehouse-home-design.md`.

**Architecture:** Extends the existing occupancy-grid engine (`BlockKit.ts` +
`FactionBlockProfiles.ts`'s `buildElvenTrunkGrid()`) with more carving/branching logic
inside the same proven technique (no new mesh-based/CSG machinery). One new small file
(`ElvenTrunkWindows.ts`) for window carving; everything else extends existing functions
in place per the design doc's stated coupling reasoning.

**Tech Stack:** TypeScript, Three.js, vitest. No new dependencies.

## Global Constraints

- Strict TDD: write the failing test first, run it, confirm it fails, implement, confirm
  it passes.
- No new runtime dependencies (per design doc's library-adoption decision).
- Don't change `dna.floors`/footprint/height formulas — only add detail within the
  existing shape.
- Every new/changed geometry function gets a test asserting on radius/geometry/material
  directly (not a Y-proximity heuristic) — this is the explicit lesson from the tower's
  pagoda false-positive bug (`StoneTowerRoofCap.test.ts`'s "waist" test rewrite).
- Establish a fresh baseline (`npx vitest run`, `npx tsc --noEmit`) before starting, and
  again at the end — compare against it, don't assume the last-known baseline from the
  tower work is still exactly current.

---

### Task 1: `clearBlock()` — small additive export on `BlockKit.ts`

**Files:**
- Modify: `src/world/buildings/BlockKit.ts` (add function near `setBlock`/`hasBlock`,
  around line 56)
- Test: `tests/world/BlockKit.test.ts`

**Interfaces:**
- Produces: `clearBlock(grid: BlockGrid, bx: number, by: number, bz: number): void` —
  removes a cell from the grid (used by window-carving to genuinely open a notch in an
  already-built grid, the same "hole" effect the door achieves during initial fill, but
  as a post-pass).

- [ ] **Step 1: Write the failing test**

Add to `tests/world/BlockKit.test.ts` (find its `describe('BlockKit'...)` block or
similar and add a new one if none exists near the top):

```typescript
describe('BlockKit — clearBlock', () => {
  it('removes a previously-set block so hasBlock reports false', () => {
    const grid = createBlockGrid();
    setBlock(grid, 1, 2, 3, 'bark');
    expect(hasBlock(grid, 1, 2, 3)).toBe(true);
    clearBlock(grid, 1, 2, 3);
    expect(hasBlock(grid, 1, 2, 3)).toBe(false);
  });

  it('is a safe no-op on a cell that was never set', () => {
    const grid = createBlockGrid();
    expect(() => clearBlock(grid, 9, 9, 9)).not.toThrow();
    expect(hasBlock(grid, 9, 9, 9)).toBe(false);
  });
});
```

Add `clearBlock` to the existing import line at the top of the test file (alongside
`createBlockGrid`, `setBlock`, `hasBlock`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/BlockKit.test.ts`
Expected: FAIL — `clearBlock is not defined` / `clearBlock is not exported`.

- [ ] **Step 3: Write minimal implementation**

In `src/world/buildings/BlockKit.ts`, right after `hasBlock`'s definition:

```typescript
export function clearBlock(grid: BlockGrid, bx: number, by: number, bz: number): void {
  grid.cells.delete(key(bx, by, bz));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/BlockKit.test.ts`
Expected: PASS (all tests in the file, not just the new ones — confirms no regression).

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/BlockKit.ts tests/world/BlockKit.test.ts
git commit -m "feat: add clearBlock() to BlockKit for post-pass occupancy carving"
```

---

### Task 2: Shared trunk-taper helper + `elvenRadiusAtHeight`/`elvenHeightAtFrac`

**Files:**
- Modify: `src/world/buildings/FactionBlockProfiles.ts` (near `elvenWaistRadius`/
  `elvenNeckY`, lines ~373-395, and inside `buildElvenTrunkGrid`'s `trunkRadiusFracAt`
  closure, lines ~443-446)
- Test: `tests/world/FactionBlockProfiles.test.ts`

**Interfaces:**
- Produces: `elvenTrunkRadiusFracAt(t: number, canopyStartFrac: number, waistFrac:
  number): number` (pure, module-level — the single shared taper-curve formula),
  `elvenHeightAtFrac(h: number, frac: number): number` (world-Y at an arbitrary height
  fraction), `elvenRadiusAtHeight(w: number, d: number, heightFrac: number, opts?:
  ElvenTrunkOptions): number` (world-unit radius at an arbitrary height fraction).
  `elvenNeckY`/`elvenWaistRadius` keep their exact existing signatures and return
  values (become thin wrappers — no behavior change, verified by existing tests still
  passing unmodified).
- Consumes: nothing new — reuses the already-exported `smoothTaperRadiusFrac`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/FactionBlockProfiles.test.ts` (add a new `describe` block right
after the existing `'FactionBlockProfiles — elven tapering living-wood trunk'` block,
before the `smoothTaperRadiusFrac` one):

```typescript
describe('FactionBlockProfiles — elvenRadiusAtHeight / elvenHeightAtFrac', () => {
  it('elvenRadiusAtHeight at the neck height fraction matches elvenWaistRadius exactly', () => {
    const w = 6, d = 6;
    const atNeck = elvenRadiusAtHeight(w, d, 0.6, { canopyStartFrac: 0.6, waistFrac: 0.4 });
    const waist = elvenWaistRadius(w, d, { canopyStartFrac: 0.6, waistFrac: 0.4 });
    expect(atNeck).toBeCloseTo(waist, 10);
  });

  it('elvenRadiusAtHeight at height fraction 0 returns the full base radius (waistFrac=1 equivalent)', () => {
    const w = 6, d = 6;
    const atBase = elvenRadiusAtHeight(w, d, 0, { canopyStartFrac: 0.6, waistFrac: 0.4 });
    const atNeck = elvenRadiusAtHeight(w, d, 0.6, { canopyStartFrac: 0.6, waistFrac: 0.4 });
    expect(atBase).toBeGreaterThan(atNeck); // base is wider than the tapered neck
  });

  it('elvenRadiusAtHeight decreases monotonically from base to neck', () => {
    const w = 8, d = 8;
    const opts = { canopyStartFrac: 0.6, waistFrac: 0.35 };
    const r0 = elvenRadiusAtHeight(w, d, 0.0, opts);
    const r1 = elvenRadiusAtHeight(w, d, 0.2, opts);
    const r2 = elvenRadiusAtHeight(w, d, 0.4, opts);
    const r3 = elvenRadiusAtHeight(w, d, 0.6, opts);
    expect(r0).toBeGreaterThanOrEqual(r1);
    expect(r1).toBeGreaterThanOrEqual(r2);
    expect(r2).toBeGreaterThanOrEqual(r3);
  });

  it('elvenHeightAtFrac at the default canopyStartFrac matches elvenNeckY exactly', () => {
    const h = 9;
    expect(elvenHeightAtFrac(h, 0.6)).toBeCloseTo(elvenNeckY(h), 10);
  });

  it('elvenHeightAtFrac increases with height fraction', () => {
    const h = 10;
    expect(elvenHeightAtFrac(h, 0.2)).toBeLessThan(elvenHeightAtFrac(h, 0.5));
  });
});
```

Add `elvenRadiusAtHeight`, `elvenHeightAtFrac` to the existing import line at the top of
the test file (alongside `elvenWaistRadius`... — note: `elvenWaistRadius`/`elvenNeckY`
aren't currently imported in this test file either; add both plus the two new names to
the `import { ... } from '@/world/buildings/FactionBlockProfiles';` line).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/FactionBlockProfiles.test.ts`
Expected: FAIL — `elvenRadiusAtHeight`/`elvenHeightAtFrac` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/world/buildings/FactionBlockProfiles.ts`, replace the existing `elvenNeckY` and
`elvenWaistRadius` functions (and the block right before them) with:

```typescript
/**
 * Trunk-phase radius fraction (of the base radius) at a normalized *total*-height
 * fraction `t` (0..1) -- the single shared taper-curve formula used by
 * `buildElvenTrunkGrid()`'s own fill loop, `elvenRadiusAtHeight()`, and
 * `ElvenTrunkWindows.ts`'s window carving, so all three always agree on exactly the
 * same curve (no risk of a window/ring being placed against a radius the trunk's own
 * fill loop wouldn't actually build).
 */
export function elvenTrunkRadiusFracAt(t: number, canopyStartFrac: number, waistFrac: number): number {
  const u = canopyStartFrac > 0 ? t / canopyStartFrac : 1;
  return smoothTaperRadiusFrac(u, 1, waistFrac);
}

/**
 * World-space Y (matching the trunk mesh's own centring convention — see
 * `elvenCanopyTopY()` in FactionBuildingVariants.ts) at an arbitrary normalized
 * total-height fraction `frac` (0..1) — generalizes what `elvenNeckY()` used to compute
 * only for the fixed neck fraction, so per-floor ring/window placement can ask for any
 * height along the trunk.
 */
export function elvenHeightAtFrac(h: number, frac: number): number {
  const bh = elvenTrunkBlocksTall(h);
  const by = Math.round(bh * frac);
  return by * BLOCK_UNIT + BLOCK_UNIT / 2;
}

/**
 * World-space Y of the trunk's actual "neck": the level where the taper stops and the
 * canopy begins. Callers placing a balcony/platform ring flush against the trunk
 * (not floating above or sunk into it) should anchor at this height, not an arbitrary
 * fraction of the total trunk height.
 */
export function elvenNeckY(h: number, canopyStartFrac = 0.6): number {
  return elvenHeightAtFrac(h, canopyStartFrac);
}

/**
 * World-unit radius of the trunk's actual constructed surface at an arbitrary
 * normalized total-height fraction `heightFrac` (0..1) — generalizes what
 * `elvenWaistRadius()` used to compute only at the fixed neck fraction, so per-floor
 * ring/window placement can size itself against the trunk's real tapered surface at
 * any height, not just the neck.
 */
export function elvenRadiusAtHeight(w: number, d: number, heightFrac: number, opts: ElvenTrunkOptions = {}): number {
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
  const maxR = Math.max(cx, cz) + 0.5;
  const waistFrac = opts.waistFrac ?? ELVEN_DEFAULT_WAIST_FRAC;
  const canopyStartFrac = opts.canopyStartFrac ?? 0.6;
  const radiusFrac = elvenTrunkRadiusFracAt(heightFrac, canopyStartFrac, waistFrac);
  return radiusFrac * maxR * BLOCK_UNIT;
}

/**
 * World-unit radius of the trunk's actual constructed surface at the neck
 * (where the taper stops and the canopy begins) — i.e. `waistFrac` of the
 * base radius, converted out of the normalized (÷maxR) space
 * `buildElvenTrunkGrid()` works in and into real world units. Callers
 * sizing a balcony/platform ring should use this (plus a small overhang)
 * so the ring sits flush against the trunk's real surface instead of
 * floating at an arbitrary, possibly much wider or narrower, radius.
 */
export function elvenWaistRadius(w: number, d: number, opts: ElvenTrunkOptions = {}): number {
  const canopyStartFrac = opts.canopyStartFrac ?? 0.6;
  return elvenRadiusAtHeight(w, d, canopyStartFrac, opts);
}
```

Then, inside `buildElvenTrunkGrid()`, find the `trunkRadiusFracAt` closure:

```typescript
  function trunkRadiusFracAt(t: number): number {
    const u = canopyStartFrac > 0 ? t / canopyStartFrac : 1;
    return smoothTaperRadiusFrac(u, 1, waistFrac);
  }
```

Replace its body to delegate to the new shared function (removing the duplication):

```typescript
  function trunkRadiusFracAt(t: number): number {
    return elvenTrunkRadiusFracAt(t, canopyStartFrac, waistFrac);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/FactionBlockProfiles.test.ts`
Expected: PASS — including all pre-existing tests in the file (confirms the
`elvenWaistRadius`/`elvenNeckY` refactor is behavior-preserving).

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/FactionBlockProfiles.ts tests/world/FactionBlockProfiles.test.ts
git commit -m "refactor: extract shared elven taper-curve helper, add height-at-fraction lookups"
```

---

### Task 3: `pickElvenEntranceStyle()` + `raised_platform` carving

**Files:**
- Modify: `src/world/buildings/FactionBlockProfiles.ts` (add export near
  `ElvenTrunkOptions`, extend `buildElvenTrunkGrid`'s facade-carving section)
- Test: `tests/world/FactionBlockProfiles.test.ts`

**Interfaces:**
- Produces: `ElvenEntranceStyle = 'ground_arch' | 'raised_platform'`,
  `pickElvenEntranceStyle(seed: number): ElvenEntranceStyle` (60% ground_arch / 40%
  raised_platform, per the design doc's weighting decision).
- `ElvenTrunkOptions` gains an optional `entranceStyle?: ElvenEntranceStyle` (defaults to
  `'ground_arch'` — i.e. today's exact existing behavior when omitted, so every existing
  caller/test that doesn't pass it keeps working unchanged).

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/FactionBlockProfiles.test.ts`, right after the elven trunk
`describe` block:

```typescript
describe('FactionBlockProfiles — pickElvenEntranceStyle', () => {
  it('is deterministic per seed', () => {
    expect(pickElvenEntranceStyle(11)).toBe(pickElvenEntranceStyle(11));
  });

  it('produces both styles across a seed sweep (proof raised_platform is reachable)', () => {
    const styles = new Set<string>();
    for (let seed = 0; seed < 60; seed++) styles.add(pickElvenEntranceStyle(seed));
    expect(styles).toEqual(new Set(['ground_arch', 'raised_platform']));
  });

  it('raised_platform carves the doorway starting above ground level, unlike ground_arch', () => {
    const W = 6, D = 6, H = 6;
    const bw = Math.max(3, Math.round(W / BLOCK_UNIT));
    const bd = Math.max(3, Math.round(D / BLOCK_UNIT));
    const cx = Math.round(bw / 2);
    const frontZ = bd - 1;
    const groundGrid = buildElvenTrunkGrid(1, W, D, H, { facade: true, entranceStyle: 'ground_arch' });
    const raisedGrid = buildElvenTrunkGrid(1, W, D, H, { facade: true, entranceStyle: 'raised_platform' });
    // ground_arch: carved open at by=0 (existing behavior, unchanged).
    expect(hasBlock(groundGrid, cx, 0, frontZ)).toBe(false);
    // raised_platform: by=0 is NOT carved (still solid trunk/root), the notch starts
    // higher up instead.
    expect(hasBlock(raisedGrid, cx, 0, frontZ)).toBe(true);
  });
});
```

Add `pickElvenEntranceStyle` to the test file's import line.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/FactionBlockProfiles.test.ts`
Expected: FAIL — `pickElvenEntranceStyle` not exported / `entranceStyle` option has no
effect (raised_platform test fails because by=0 is still carved same as ground_arch).

- [ ] **Step 3: Write minimal implementation**

Add the type + picker function right after `ElvenTrunkOptions`'s closing brace in
`FactionBlockProfiles.ts`:

```typescript
export type ElvenEntranceStyle = 'ground_arch' | 'raised_platform';

/**
 * Picks one of 2 entrance styles per building, weighted 60% ground_arch (the more
 * common real-world default) / 40% raised_platform (the distinct-but-rarer variant —
 * a real treehouse-precedent detail: entrances often sit above ground level on a
 * stilted/root-flared base).
 */
export function pickElvenEntranceStyle(seed: number): ElvenEntranceStyle {
  const rand = mulberry32(seed ^ 0xE1F3_D002);
  return rand() < 0.6 ? 'ground_arch' : 'raised_platform';
}
```

Add `entranceStyle?: ElvenEntranceStyle;` to `ElvenTrunkOptions` (right after the
`facadeHeightFrac` doc comment/field).

Now find the facade-carving setup block inside `buildElvenTrunkGrid` (right before the
main `for (let bx = 0; bx < bw; bx++)` loop):

```typescript
  const notchWidth = opts.facade ? Math.max(2, Math.round(bw * (opts.facadeWidthFrac ?? 0.32))) : 0;
  const requestedNotchHeight = opts.facade ? Math.max(3, Math.round(canopyStartBy * (opts.facadeHeightFrac ?? 0.36))) : 0;
```

Add, right after those two lines:

```typescript
  const entranceStyle = opts.entranceStyle ?? 'ground_arch';
  // raised_platform: the doorway starts a couple of blocks above ground level (a
  // stilted/root-flared entry, per the real treehouse research), so shift the carve
  // range's floor up instead of starting at by=0.
  const entranceRaiseBy = entranceStyle === 'raised_platform' ? 2 : 0;
```

Then find the frame-corner safety-clamp loop right below (which currently starts its
scan at `by = 0`):

```typescript
  let notchHeight = requestedNotchHeight;
  if (opts.facade) {
    notchHeight = requestedNotchHeight;
    for (let by = 0; by < requestedNotchHeight; by++) {
      const t = bh > 1 ? by / (bh - 1) : 0;
      if (trunkRadiusFracAt(t) < frameCornerDist * 1.08) { notchHeight = Math.max(2, by); break; }
    }
  }
```

Replace with (scanning starting from the raised floor, and reporting notch height
relative to that floor so the carve-loop math below stays a simple `by < notchHeight`
comparison against a *local* row index):

```typescript
  let notchHeight = requestedNotchHeight;
  if (opts.facade) {
    notchHeight = requestedNotchHeight;
    for (let localBy = 0; localBy < requestedNotchHeight; localBy++) {
      const by = localBy + entranceRaiseBy;
      const t = bh > 1 ? by / (bh - 1) : 0;
      if (trunkRadiusFracAt(t) < frameCornerDist * 1.08) { notchHeight = Math.max(2, localBy); break; }
    }
  }
```

Finally, find the actual carve condition inside the main fill loop:

```typescript
          let material = 'bark';
          if (opts.facade && by < notchHeight && bz >= bd - notchDepth) {
```

Replace with (comparing against a local row index measured from the raised floor, and
requiring `by >= entranceRaiseBy` so rows below the raised floor are never carved):

```typescript
          let material = 'bark';
          const localBy = by - entranceRaiseBy;
          if (opts.facade && by >= entranceRaiseBy && localBy < notchHeight && bz >= bd - notchDepth) {
```

...and inside that same block, the arch-narrowing math currently reads `by /
notchHeight` — update it to use `localBy` instead:

```typescript
            const frac = localBy / notchHeight;
```

(Everything else inside that block — `halfWidthHere`, `inNotchX`, `inFrameX` — stays
exactly as-is, since they don't reference `by` directly.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/FactionBlockProfiles.test.ts`
Expected: PASS — all tests, including the pre-existing "carves an arched doorway"
test (which doesn't pass `entranceStyle`, so defaults to `'ground_arch'` = unchanged
behavior).

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/FactionBlockProfiles.ts tests/world/FactionBlockProfiles.test.ts
git commit -m "feat: add raised_platform entrance style alongside the existing ground arch"
```

---

### Task 4: `pickElvenCanopyArchetype()` + `moss_crown` canopy branch

**Files:**
- Modify: `src/world/buildings/FactionBlockProfiles.ts` (add export, extend the
  canopy-fill section of `buildElvenTrunkGrid`)
- Test: `tests/world/FactionBlockProfiles.test.ts`

**Interfaces:**
- Produces: `ElvenCanopyArchetype = 'satellite_lobes' | 'moss_crown'`,
  `pickElvenCanopyArchetype(seed: number): ElvenCanopyArchetype` (55%/45% split per the
  design doc).
- `ElvenTrunkOptions` gains an optional `canopyArchetype?: ElvenCanopyArchetype`
  (defaults to `'satellite_lobes'` — today's exact existing behavior when omitted).

- [ ] **Step 1: Write the failing tests**

```typescript
describe('FactionBlockProfiles — pickElvenCanopyArchetype', () => {
  it('is deterministic per seed', () => {
    expect(pickElvenCanopyArchetype(7)).toBe(pickElvenCanopyArchetype(7));
  });

  it('produces both archetypes across a seed sweep', () => {
    const archetypes = new Set<string>();
    for (let seed = 0; seed < 60; seed++) archetypes.add(pickElvenCanopyArchetype(seed));
    expect(archetypes).toEqual(new Set(['satellite_lobes', 'moss_crown']));
  });

  it('moss_crown has no separate branch-connector cells (a single fused mass), unlike satellite_lobes', () => {
    const W = 8, D = 8, H = 9;
    const lobesGrid = buildElvenTrunkGrid(1, W, D, H, { canopyArchetype: 'satellite_lobes' });
    const mossGrid = buildElvenTrunkGrid(1, W, D, H, { canopyArchetype: 'moss_crown' });
    // The moss crown's material palette never includes 'bark' cells above the neck
    // (satellite_lobes' branches are 'bark' cells reaching up into the canopy band —
    // moss_crown has no branches, so no bark cells should appear once inside the
    // canopy-only Y range).
    const bh = Math.max(6, Math.round(H / BLOCK_UNIT));
    const canopyStartBy = Math.round(bh * 0.6);
    let lobesHasBarkInCanopy = false, mossHasBarkInCanopy = false;
    for (const [k, matKey] of lobesGrid.cells.entries()) {
      const by = Number(k.split(',')[1]);
      if (by > canopyStartBy + 1 && matKey === 'bark') lobesHasBarkInCanopy = true;
    }
    for (const [k, matKey] of mossGrid.cells.entries()) {
      const by = Number(k.split(',')[1]);
      if (by > canopyStartBy + 1 && matKey === 'bark') mossHasBarkInCanopy = true;
    }
    expect(lobesHasBarkInCanopy).toBe(true); // satellite_lobes has branches (existing behavior)
    expect(mossHasBarkInCanopy).toBe(false); // moss_crown has no branches
  });

  it('moss_crown still produces valid, non-empty canopy geometry', () => {
    const grid = buildElvenTrunkGrid(2, 8, 8, 9, { canopyArchetype: 'moss_crown' });
    let leafCount = 0;
    for (const matKey of grid.cells.values()) if (matKey === 'leaf' || matKey === 'moss') leafCount++;
    expect(leafCount).toBeGreaterThan(0);
  });
});
```

Add `pickElvenCanopyArchetype` to the test file's import line.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/FactionBlockProfiles.test.ts`
Expected: FAIL — `pickElvenCanopyArchetype` not exported / `canopyArchetype` option has
no effect (moss_crown tests fail because the branch/bark-in-canopy logic is unchanged).

- [ ] **Step 3: Write minimal implementation**

Add the type + picker right after `pickElvenEntranceStyle`:

```typescript
export type ElvenCanopyArchetype = 'satellite_lobes' | 'moss_crown';

/**
 * Picks one of 2 canopy archetypes per building, weighted 55% satellite_lobes (the
 * existing separated-lobes-plus-branches crown) / 45% moss_crown (a denser, wider,
 * lower-profile single mass with no separate lobes/branches -- the Falinesti "curled
 * webs of moss... forming a shared roof" motif from this round's research). Close to
 * even, unlike the entrance's more/less-common split, since both are equally "valid"
 * looks.
 */
export function pickElvenCanopyArchetype(seed: number): ElvenCanopyArchetype {
  const rand = mulberry32(seed ^ 0xE1F3_C003);
  return rand() < 0.55 ? 'satellite_lobes' : 'moss_crown';
}
```

Add `canopyArchetype?: ElvenCanopyArchetype;` to `ElvenTrunkOptions`.

Now find the lobe-construction section inside `buildElvenTrunkGrid` (the block building
`const lobes: CanopyLobe[] = [...]` and the `for (let i = 0; i < numSatellites; i++)`
loop that also pushes into `branches`). Wrap that whole satellite/branch-building loop
so it only runs for the `satellite_lobes` archetype, and add a `moss_crown` alternative
right after it:

```typescript
  const canopyArchetype = opts.canopyArchetype ?? 'satellite_lobes';
  const lobes: CanopyLobe[] = [
    { cx, cy: canopyStartBy + mainRy * 0.7, cz, rxz: mainRxz, ry: mainRy },
  ];
  const branches: BranchSeg[] = [];
  if (canopyArchetype === 'satellite_lobes') {
    const numSatellites = 3 + Math.floor(lobeRng() * 2); // 3-4 satellite foliage masses
    for (let i = 0; i < numSatellites; i++) {
      const ang = (i / numSatellites) * Math.PI * 2 + lobeRng() * 0.8;
      const offsetFrac = 0.95 + lobeRng() * 0.45;
      const satRxz = mainRxz * (0.62 + lobeRng() * 0.3);
      const satRy = mainRy * (0.75 + lobeRng() * 0.4);
      const heightFrac = 0.25 + lobeRng() * 0.65;
      const satCy = canopyStartBy + canopyRadiusY * heightFrac;
      const lobeCx = cx + Math.cos(ang) * offsetFrac * maxR;
      const lobeCz = cz + Math.sin(ang) * offsetFrac * maxR;
      lobes.push({ cx: lobeCx, cy: satCy, cz: lobeCz, rxz: satRxz, ry: satRy });
      const branchStartBy = canopyStartBy - Math.round(lobeRng() * 3);
      branches.push({ ax: cx, ay: branchStartBy, az: cz, bx: lobeCx, by: satCy, bz: lobeCz });
    }
  } else {
    // moss_crown: one wide, dense, fused mass -- no satellite lobes, no branches. The
    // single central lobe above is widened/flattened in place instead of surrounded by
    // separate smaller masses.
    lobes[0]!.rxz = mainRxz * 1.55;
    lobes[0]!.ry = mainRy * 0.85;
  }
```

(This replaces the existing inline `const lobes: CanopyLobe[] = [...]` declaration, the
existing `const branches: BranchSeg[] = [];` declaration, and the existing `for (let i =
0; i < numSatellites; i++) { ... }` loop as one unit — the `numSatellites` declaration
moves inside the `if` branch since it's now only used there.)

Finally, `moss_crown`'s surface should read as "mossy," not identical foliage green —
find the canopy-fill occupancy test:

```typescript
          if (best <= 1 + n * (jitterAmt * 1.3)) {
            setBlock(grid, bx, by, bz, 'leaf');
            continue;
          }
```

Replace with (moss_crown gets a mottled two-tone leaf/moss surface via the same noise
value already in scope, satellite_lobes keeps its existing uniform leaf material):

```typescript
          if (best <= 1 + n * (jitterAmt * 1.3)) {
            const useMoss = canopyArchetype === 'moss_crown' && n > 0.15;
            setBlock(grid, bx, by, bz, useMoss ? 'moss' : 'leaf');
            continue;
          }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/FactionBlockProfiles.test.ts`
Expected: PASS — all tests, including every pre-existing elven-trunk test (none pass
`canopyArchetype`, so all default to `'satellite_lobes'` = unchanged behavior).

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/FactionBlockProfiles.ts tests/world/FactionBlockProfiles.test.ts
git commit -m "feat: add moss_crown canopy archetype alongside satellite_lobes"
```

---

### Task 5: `ElvenTrunkWindows.ts` — carved window openings (new file)

**Files:**
- Create: `src/world/buildings/ElvenTrunkWindows.ts`
- Test: `tests/world/buildings/ElvenTrunkWindows.test.ts` (new file — note this test
  lives under `tests/world/buildings/`, matching where the tower's per-feature test
  files live, not `tests/world/` where `FactionBlockProfiles.test.ts` lives)

**Interfaces:**
- Consumes: `BlockGrid`, `hasBlock`, `clearBlock`, `setBlock` from `./BlockKit`;
  `elvenTrunkRadiusFracAt` from `./FactionBlockProfiles`; `mulberry32` from
  `@/core/prng`.
- Produces: `pickWindowCount(seed: number, floorIndex: number): number` (2, 3, or 4),
  `carveTrunkWindows(grid: BlockGrid, w: number, d: number, h: number, floors: number,
  seed: number, opts?: { canopyStartFrac?: number; waistFrac?: number }): void` — called
  as a post-pass on an already-built trunk grid (from `addBlockElvenTrunk` in
  `FactionBuildingVariants.ts`, wired in Task 6).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { createBlockGrid, setBlock, hasBlock, getMaterialKey, BLOCK_UNIT } from '@/world/buildings/BlockKit';
import { carveTrunkWindows, pickWindowCount } from '@/world/buildings/ElvenTrunkWindows';

describe('pickWindowCount', () => {
  it('is deterministic per seed+floorIndex', () => {
    expect(pickWindowCount(5, 0)).toBe(pickWindowCount(5, 0));
  });

  it('always returns 2, 3, or 4', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (let floorIndex = 0; floorIndex < 3; floorIndex++) {
        const n = pickWindowCount(seed, floorIndex);
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(4);
      }
    }
  });

  it('different floor indices on the same seed can produce different counts (re-rolled per floor)', () => {
    const counts = new Set<number>();
    for (let floorIndex = 0; floorIndex < 20; floorIndex++) counts.add(pickWindowCount(1, floorIndex));
    expect(counts.size).toBeGreaterThan(1);
  });
});

describe('carveTrunkWindows', () => {
  /** Fills a solid cylinder of 'bark' blocks across the whole trunk phase, matching
   *  the shape buildElvenTrunkGrid would have already produced, so carving can be
   *  tested in isolation without depending on the full trunk generator. */
  function buildSolidTrunk(w: number, d: number, h: number): { grid: ReturnType<typeof createBlockGrid>; bw: number; bd: number; bh: number } {
    const grid = createBlockGrid();
    const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
    const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
    const bh = Math.max(6, Math.round(h / BLOCK_UNIT));
    const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
    const maxR = Math.max(cx, cz) + 0.5;
    const canopyStartBy = Math.round(bh * 0.6);
    for (let bx = 0; bx < bw; bx++) {
      for (let bz = 0; bz < bd; bz++) {
        const dNorm = Math.hypot(bx - cx, bz - cz) / maxR;
        if (dNorm > 1) continue;
        for (let by = 0; by < canopyStartBy; by++) setBlock(grid, bx, by, bz, 'bark');
      }
    }
    return { grid, bw, bd, bh };
  }

  it('carves at least one window (a bark cell becomes absent) somewhere in the trunk', () => {
    const { grid } = buildSolidTrunk(8, 8, 9);
    let barkCountBefore = 0;
    for (const m of grid.cells.values()) if (m === 'bark') barkCountBefore++;
    carveTrunkWindows(grid, 8, 8, 9, 2, 3);
    let barkCountAfter = 0;
    for (const m of grid.cells.values()) if (m === 'bark') barkCountAfter++;
    expect(barkCountAfter).toBeLessThan(barkCountBefore);
  });

  it('promotes some cells to window_frame material', () => {
    const { grid } = buildSolidTrunk(8, 8, 9);
    carveTrunkWindows(grid, 8, 8, 9, 2, 3);
    let sawFrame = false;
    for (const m of grid.cells.values()) if (m === 'window_frame') { sawFrame = true; break; }
    expect(sawFrame).toBe(true);
  });

  it('never carves at by=0 (ground level stays solid -- windows are floor-band features, not ground-level)', () => {
    const { grid, bw, bd } = buildSolidTrunk(8, 8, 9);
    carveTrunkWindows(grid, 8, 8, 9, 2, 3);
    let groundStillFullyBark = true;
    for (let bx = 0; bx < bw; bx++) {
      for (let bz = 0; bz < bd; bz++) {
        const m = getMaterialKey(grid, bx, 0, bz);
        if (m !== undefined && m !== 'bark') groundStillFullyBark = false;
      }
    }
    expect(groundStillFullyBark).toBe(true);
  });

  it('is deterministic per seed', () => {
    const a = buildSolidTrunk(8, 8, 9);
    carveTrunkWindows(a.grid, 8, 8, 9, 2, 7);
    const b = buildSolidTrunk(8, 8, 9);
    carveTrunkWindows(b.grid, 8, 8, 9, 2, 7);
    expect([...a.grid.cells.entries()]).toEqual([...b.grid.cells.entries()]);
  });

  it('more floors produce at least as many carved window cells as fewer floors (same seed)', () => {
    const one = buildSolidTrunk(8, 8, 9);
    carveTrunkWindows(one.grid, 8, 8, 9, 1, 4);
    const three = buildSolidTrunk(8, 8, 9);
    carveTrunkWindows(three.grid, 8, 8, 9, 3, 4);
    function barkCount(grid: ReturnType<typeof createBlockGrid>): number {
      let n = 0;
      for (const m of grid.cells.values()) if (m === 'bark') n++;
      return n;
    }
    expect(barkCount(three.grid)).toBeLessThanOrEqual(barkCount(one.grid));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/buildings/ElvenTrunkWindows.test.ts`
Expected: FAIL — module `@/world/buildings/ElvenTrunkWindows` does not exist.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * ElvenTrunkWindows.ts — carved window openings for the elven living-tree home
 * (`buildElvenVilla()` in FactionBuildingVariants.ts). Extends the exact same
 * occupancy-carving technique already proven on the trunk's front doorway (a genuine
 * removed-block notch, not a separate mesh or a flat material recolor) to smaller
 * window openings placed at several angles around the trunk's circumference, one band
 * per floor. See docs/superpowers/specs/2026-09-03-elven-treehouse-home-design.md.
 */

import { mulberry32 } from '@/core/prng';
import { hasBlock, clearBlock, setBlock, type BlockGrid, BLOCK_UNIT } from './BlockKit';
import { elvenTrunkRadiusFracAt, elvenTrunkBlocksTall } from './FactionBlockProfiles';

/** Picks how many window openings to carve for one floor band (2, 3, or 4, evenly
 *  weighted, re-rolled per floor so a single building's floors don't all match). */
export function pickWindowCount(seed: number, floorIndex: number): number {
  const rand = mulberry32((seed ^ (0xC0FF33 + floorIndex * 0x1000)) >>> 0);
  return 2 + Math.floor(rand() * 3);
}

export interface TrunkWindowOptions {
  canopyStartFrac?: number;
  waistFrac?: number;
}

const DEFAULT_CANOPY_START_FRAC = 0.6;
const DEFAULT_WAIST_FRAC = 0.38;

/**
 * Carves window openings into an already-built trunk grid (called as a post-pass,
 * after `buildElvenTrunkGrid()` returns, from `addBlockElvenTrunk()`). One floor band
 * per `floors`, evenly spaced within the trunk phase (`[0, canopyStartFrac]` of total
 * height); each band gets 2-4 window angles around the trunk's circumference (skipping
 * the doorway's own +Z-facing angle on the ground floor, so windows never overlap the
 * entrance).
 */
export function carveTrunkWindows(
  grid: BlockGrid, w: number, d: number, h: number, floors: number, seed: number,
  opts: TrunkWindowOptions = {},
): void {
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  const bh = elvenTrunkBlocksTall(h);
  const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
  const maxR = Math.max(cx, cz) + 0.5;
  const canopyStartFrac = opts.canopyStartFrac ?? DEFAULT_CANOPY_START_FRAC;
  const waistFrac = opts.waistFrac ?? DEFAULT_WAIST_FRAC;
  const canopyStartBy = Math.round(bh * canopyStartFrac);
  const DOOR_ANGLE = Math.PI / 2; // matches the door's own +Z-facing convention

  for (let floorIdx = 0; floorIdx < floors; floorIdx++) {
    const centerFrac = ((floorIdx + 0.5) / floors) * canopyStartFrac;
    const centerBy = Math.round(bh * centerFrac);
    if (centerBy < 2 || centerBy >= canopyStartBy - 1) continue; // stay clear of root flare & neck
    const windowCount = pickWindowCount(seed, floorIdx);
    const angleRand = mulberry32((seed ^ (0xF00D + floorIdx * 0x777)) >>> 0);
    for (let wIdx = 0; wIdx < windowCount; wIdx++) {
      const baseAngle = (wIdx / windowCount) * Math.PI * 2;
      const gap = (Math.PI * 2) / windowCount;
      const angle = baseAngle + (angleRand() - 0.5) * gap * 0.4;
      if (floorIdx === 0) {
        let diff = Math.abs(angle - DOOR_ANGLE);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 0.5) continue; // too close to the doorway, skip this window
      }
      carveOneWindow(grid, bw, bd, bh, cx, cz, maxR, canopyStartFrac, waistFrac, centerBy, angle);
    }
  }
}

function carveOneWindow(
  grid: BlockGrid, bw: number, bd: number, bh: number,
  cx: number, cz: number, maxR: number,
  canopyStartFrac: number, waistFrac: number,
  centerBy: number, angle: number,
): void {
  const halfHeight = 1; // window spans centerBy-1 .. centerBy+1 (3 rows tall)
  const halfWidthAngle = 0.35; // radians (~20deg half-width)
  const frameMargin = 0.15; // extra radians around the notch that become window_frame
  const notchDepth = 1; // shallower than the door's notchDepth=2 -- windows are smaller features

  for (let by = centerBy - halfHeight; by <= centerBy + halfHeight; by++) {
    if (by < 0 || by >= bh) continue;
    const t = bh > 1 ? by / (bh - 1) : 0;
    const radiusFrac = elvenTrunkRadiusFracAt(t, canopyStartFrac, waistFrac);
    const surfaceR = radiusFrac * maxR;
    const heightFracLocal = (by - (centerBy - halfHeight)) / (2 * halfHeight);
    const widthScale = heightFracLocal < 0.5 ? 1 : Math.max(0, 1 - (heightFracLocal - 0.5) * 2);
    const thisHalfWidthAngle = halfWidthAngle * widthScale;
    if (thisHalfWidthAngle <= 0) continue;

    for (let bx = 0; bx < bw; bx++) {
      for (let bz = 0; bz < bd; bz++) {
        const dx = bx - cx, dz = bz - cz;
        const dist = Math.hypot(dx, dz);
        const dNorm = dist / maxR;
        if (dNorm > radiusFrac + 0.05) continue;
        const depthFromSurface = surfaceR - dist;
        if (depthFromSurface < 0 || depthFromSurface > notchDepth) continue;
        let angleDiff = Math.abs(Math.atan2(dz, dx) - angle);
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
        if (angleDiff > thisHalfWidthAngle + frameMargin) continue;
        if (!hasBlock(grid, bx, by, bz)) continue; // only carve into actual built wall
        if (angleDiff <= thisHalfWidthAngle) {
          clearBlock(grid, bx, by, bz); // genuine open notch, matching the door's technique
        } else {
          setBlock(grid, bx, by, bz, 'window_frame');
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/buildings/ElvenTrunkWindows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/ElvenTrunkWindows.ts tests/world/buildings/ElvenTrunkWindows.test.ts
git commit -m "feat: add ElvenTrunkWindows carved window openings"
```

---

### Task 6: Wire windows + floors + palette into `addBlockElvenTrunk`

**Files:**
- Modify: `src/world/buildings/FactionBuildingVariants.ts` (`addBlockElvenTrunk`,
  ~line 656; `buildElvenVilla`, ~line 724)
- Test: `tests/world/FactionBuildingVariants.test.ts`

**Interfaces:**
- Consumes: `carveTrunkWindows` from `./ElvenTrunkWindows`; `elvenTrunkBlocksTall` (for
  the test) from `./FactionBlockProfiles`.
- `addBlockElvenTrunk`'s existing signature gains one new optional trailing field on its
  `opts` parameter: `floors?: number` (default 1 — i.e. today's exact existing behavior,
  ONE floor band, when omitted).

- [ ] **Step 1: Write the failing test**

Add to `tests/world/FactionBuildingVariants.test.ts` (find the existing elven-villa
`describe` block, or add a new one):

```typescript
describe('FactionBuildingVariants — elven villa window carving', () => {
  it('the merged trunk mesh uses a distinct window_frame material not present before this wiring', () => {
    const dna = { ...makeDna('house', 'elven', 5), size: 'medium' as const, floors: 2 as const };
    const g = getFactionBuildingVariant('elven', 'house')!(dna);
    const materials = new Set<THREE.Material>();
    g.traverse((o) => { if (o instanceof THREE.Mesh) materials.add(o.material as THREE.Material); });
    // Direct proof window_frame exists as its own material: addBlockElvenTrunk creates
    // 'facade' and 'window_frame' as two SEPARATE mat() calls using the same input
    // color (colors.trim), so they're distinct THREE.Material object identities even
    // though they resolve to the same rendered color. Counting how many distinct
    // material OBJECTS (not colors) match colors.trim is a robust proxy: before this
    // task only 'facade' exists (count 1); after wiring, 'window_frame' also exists
    // (count 2) -- proving carveTrunkWindows() actually ran and its output actually
    // got meshed, not just that the trunk grew taller (floors already did that before
    // this task, so a vertex-count-only comparison wouldn't actually prove anything).
    let trimColoredMaterialCount = 0;
    const trimHex = new THREE.Color(dna.colors.trim).getHexString();
    for (const m of materials) {
      if (m instanceof THREE.MeshStandardMaterial && m.color.getHexString() === trimHex) trimColoredMaterialCount++;
    }
    expect(trimColoredMaterialCount).toBeGreaterThanOrEqual(2);
  });
});
```

This reuses the file's existing `makeDna(kind, faction, seed)` helper (defined near the
top of `tests/world/FactionBuildingVariants.test.ts`, already returns a complete, valid
`BuildingDNA`) with a spread-override for `size`/`floors`, matching how other tests in
this file already do it. `THREE` and `getFactionBuildingVariant` are already imported at
the top of this file — no new imports needed. Note this test asserts on *material
identity/count*, not vertex counts — vertex counts alone can't discriminate "windows are
wired in" from "the trunk is just taller," since floor count already affected trunk
height before this task (the lesson from the tower's pagoda false-positive test:
assert on the actual discriminating signal, not a proxy that could pass for the wrong
reason).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/FactionBuildingVariants.test.ts`
Expected: FAIL — `trimColoredMaterialCount` is 1 (only `facade` exists; `window_frame`
doesn't exist yet, so nothing else shares its color).

- [ ] **Step 3: Write minimal implementation**

In `FactionBuildingVariants.ts`, add the import at the top of the file (alongside the
other `./FactionBlockProfiles` / local imports):

```typescript
import { carveTrunkWindows } from './ElvenTrunkWindows';
```

Update `ElvenTrunkOptions`'s usage site — `addBlockElvenTrunk`'s `opts` parameter is
typed as `ElvenTrunkOptions` (imported from `FactionBlockProfiles`), so add `floors?:
number;` to that same interface in `FactionBlockProfiles.ts` (not a new type here) right
after the `canopyArchetype` field added in Task 4.

Then update `addBlockElvenTrunk` in `FactionBuildingVariants.ts`:

```typescript
function addBlockElvenTrunk(
  g: THREE.Group,
  seed: number, w: number, d: number, h: number,
  barkColor: string, leafColor: string, facadeColor: string,
  opts: ElvenTrunkOptions = {},
): void {
  const grid = buildElvenTrunkGrid(seed, w, d, h, opts);
  carveTrunkWindows(grid, w, d, h, opts.floors ?? 1, seed ^ 0xE1F3_W1ND, {
    canopyStartFrac: opts.canopyStartFrac,
    waistFrac: opts.waistFrac,
  });
  const palette = {
    bark:      mat(barkColor, { roughness: 0.9, map: barkTexture() }),
    leaf:      mat(leafColor, { roughness: 0.75 }),
    moss:      mat('#5a7a48', { roughness: 0.95 }),
    facade:    mat(facadeColor, { roughness: 0.8 }),
    window_frame: mat(facadeColor, { roughness: 0.7 }),
    moonstone: mat('#d8e8f0', { roughness: 0.5, metalness: 0.05 }),
    glow:      new THREE.MeshStandardMaterial({ color: new THREE.Color('#c0f0ff'), emissive: new THREE.Color('#80e0ff'), emissiveIntensity: 0.9, roughness: 0.5 }),
  };
  const mesh = meshBlockGrid(grid, palette);
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  mesh.position.x -= ((bw - 1) / 2) * BLOCK_UNIT;
  mesh.position.z -= ((bd - 1) / 2) * BLOCK_UNIT;
  g.add(mesh);
}
```

Note `seed ^ 0xE1F3_W1ND` isn't valid hex (contains non-hex digits `W`, `N`, `D`) — use
`seed ^ 0xE1F3_11D0` instead (a plain hex constant, distinct from the trunk grid's own
`seed` and other reserved offsets already used elsewhere in this file like
`0xE1F3_0010`/`0xE1F3_0013`/`0xE1F3_0015`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/FactionBuildingVariants.test.ts`
Expected: PASS.

Also run the full elven-related test files together to catch any cross-file breakage
from the `ElvenTrunkOptions` interface change:

Run: `npx vitest run tests/world/FactionBlockProfiles.test.ts tests/world/FactionBuildingVariants.test.ts tests/world/buildings/ElvenTrunkWindows.test.ts`
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/FactionBuildingVariants.ts src/world/buildings/FactionBlockProfiles.ts tests/world/FactionBuildingVariants.test.ts
git commit -m "feat: wire window carving + floors option into addBlockElvenTrunk"
```

---

### Task 7: Ring-beam + knee-brace bands at every floor

**Files:**
- Modify: `src/world/buildings/FactionBuildingVariants.ts` (`buildElvenVilla`, ~line
  724)
- Test: `tests/world/FactionBuildingVariants.test.ts`

**Interfaces:**
- Consumes: `elvenRadiusAtHeight`, `elvenHeightAtFrac` from `./FactionBlockProfiles`
  (Task 2).
- `buildElvenVilla`'s external signature (`(dna: BuildingDNA) => THREE.Group`) is
  unchanged — this task only changes its internal body.

- [ ] **Step 1: Write the failing test**

```typescript
describe('FactionBuildingVariants — elven villa per-floor ring beams', () => {
  it('a 3-floor building has 3 named ring-beam groups; a 1-floor building has 1', () => {
    function countRings(g: THREE.Group): number {
      let count = 0;
      g.traverse((o) => { if (o.name === 'elven-trunk-ring-beam') count++; });
      return count;
    }
    const oneFloor = getFactionBuildingVariant('elven', 'house')!({ ...makeDna('house', 'elven', 9), size: 'medium', floors: 1 });
    const threeFloor = getFactionBuildingVariant('elven', 'house')!({ ...makeDna('house', 'elven', 9), size: 'medium', floors: 3 });
    expect(countRings(oneFloor)).toBe(1);
    expect(countRings(threeFloor)).toBe(3);
  });

  it('ring beams sit at strictly increasing heights, one per floor bottom to top', () => {
    const dna = { ...makeDna('house', 'elven', 9), size: 'medium' as const, floors: 3 as const };
    const g = getFactionBuildingVariant('elven', 'house')!(dna);
    g.updateMatrixWorld(true);
    const ringYs: number[] = [];
    g.traverse((o) => { if (o.name === 'elven-trunk-ring-beam') ringYs.push(o.position.y); });
    ringYs.sort((a, b) => a - b);
    expect(ringYs.length).toBe(3);
    expect(ringYs[1]).toBeGreaterThan(ringYs[0]!);
    expect(ringYs[2]).toBeGreaterThan(ringYs[1]!);
  });
});
```

Again reuses the file's existing `makeDna` helper with spread-overrides, matching this
file's established convention.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/FactionBuildingVariants.test.ts`
Expected: FAIL — only 1 `'elven-trunk-ring-beam'`-named group exists regardless of
floor count (today's ring/braces aren't even named yet — this also surfaces as "found 0"
since the existing code doesn't set `.name` on the ring group at all).

- [ ] **Step 3: Write minimal implementation**

Find `buildElvenVilla` in `FactionBuildingVariants.ts`:

```typescript
function buildElvenVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 1.5; // tall, reaching into canopy
  const g = new THREE.Group();
  addBlockElvenTrunk(g, dna.seed ^ 0xE1F3_0010, fp.w, fp.d, h, dna.colors.walls, dna.colors.roof, dna.colors.trim, {
    facade: true,
  });
  const woodMat = mat(dna.colors.trim, { roughness: 0.85 });
  const neckY = elvenNeckY(h);
  const trunkRadiusAtNeck = elvenWaistRadius(fp.w, fp.d);
  const ringRadius = trunkRadiusAtNeck * 1.25;
  addPlankRing(g, dna.seed ^ 0xE1F3_0013, neckY, ringRadius, woodMat, 14);
  addRingBraces(g, dna.seed ^ 0xE1F3_0015, neckY, trunkRadiusAtNeck, ringRadius, woodMat, 6);
  return g;
}
```

Replace with:

```typescript
function buildElvenVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 1.5; // tall, reaching into canopy
  const floors = Math.max(1, dna.floors);
  const g = new THREE.Group();
  addBlockElvenTrunk(g, dna.seed ^ 0xE1F3_0010, fp.w, fp.d, h, dna.colors.walls, dna.colors.roof, dna.colors.trim, {
    facade: true,
    floors,
  });
  const woodMat = mat(dna.colors.trim, { roughness: 0.85 });
  const canopyStartFrac = 0.6;
  // One ring-beam + knee-brace band per floor, sized against the trunk's own real
  // (tapered) radius at that floor's height -- a direct application of the real
  // treehouse "ring beam + triangulated knee brace" research finding, replacing the
  // single fixed neck-height ring with one per floor so a multi-floor building reads
  // as N distinct stories, not one undifferentiated stepped cone.
  for (let floorIdx = 0; floorIdx < floors; floorIdx++) {
    const heightFrac = ((floorIdx + 1) / floors) * canopyStartFrac;
    const ringY = elvenHeightAtFrac(h, heightFrac);
    const trunkRadiusHere = elvenRadiusAtHeight(fp.w, fp.d, heightFrac);
    const ringRadius = trunkRadiusHere * 1.25;
    const ringGroup = new THREE.Group();
    ringGroup.name = 'elven-trunk-ring-beam';
    ringGroup.position.y = ringY;
    addPlankRing(ringGroup, dna.seed ^ (0xE1F3_0013 + floorIdx), 0, ringRadius, woodMat, 14);
    addRingBraces(ringGroup, dna.seed ^ (0xE1F3_0015 + floorIdx), 0, trunkRadiusHere, ringRadius, woodMat, 6);
    g.add(ringGroup);
  }
  return g;
}
```

Note `addPlankRing`/`addRingBraces` both take a `y` parameter and use it as an absolute
world Y for their own child meshes — since we're now nesting them inside a `ringGroup`
whose own `position.y` is already set to `ringY`, pass `0` for their `y` parameter (so
their internal meshes are positioned relative to the group, which itself carries the
real offset) instead of the previously-absolute `neckY`.

Add `elvenRadiusAtHeight`, `elvenHeightAtFrac` to the existing
`FactionBlockProfiles` import line in `FactionBuildingVariants.ts` (find the long import
list starting `import { buildVulperiaDenMoundGrid, ... } from './FactionBlockProfiles';`
and add both names to it). `elvenNeckY`/`elvenWaistRadius` are no longer called by
`buildElvenVilla` after this change — check whether they're still used elsewhere in this
file (e.g. `buildElvenShop`) before removing their import; if still used elsewhere, leave
them in the import list.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/FactionBuildingVariants.test.ts`
Expected: PASS.

Run the full elven test slice again to confirm nothing else broke:

Run: `npx vitest run tests/world/FactionBlockProfiles.test.ts tests/world/FactionBuildingVariants.test.ts tests/world/buildings/ElvenTrunkWindows.test.ts tests/world/BlockKit.test.ts`
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/FactionBuildingVariants.ts tests/world/FactionBuildingVariants.test.ts
git commit -m "feat: one ring-beam + knee-brace band per floor instead of one at the neck"
```

---

### Task 8: Settlement Lab override — isolate the new building type for testing

**Files:**
- Modify: `src/scene/SettlementLabScene.ts` (~line 66-68)

**Interfaces:** None (internal constant change only).

- [ ] **Step 1: Make the change**

Find:

```typescript
const POC_KIND_OVERRIDE_BY_FACTION: Partial<Record<string, BuildingKind>> = {
  elven: 'watchtower',
};
```

Replace with:

```typescript
// Race-by-race POC override: picking a faction with a shipped POC building
// automatically shows ONLY that building in Settlement Lab's "Play in 3D," no separate
// UI action needed (see FactionBuildingVariants.ts's elven entry for what's shipped so
// far). Updated to 'house' for the living-tree-home kit-of-parts round (2026-09-03) --
// was 'watchtower' during the stone-tower kit round. Switch back to 'watchtower' (or
// add more entries) if you need to re-isolate the tower for comparison.
const POC_KIND_OVERRIDE_BY_FACTION: Partial<Record<string, BuildingKind>> = {
  elven: 'house',
};
```

- [ ] **Step 2: Verify no test depends on the old value**

Run: `npx vitest run --reporter=basic 2>&1 | grep -i "settlementlab\|watchtower"`
Expected: no failing test references this constant's specific value (it's a UI/dev-tool
convenience default, not something asserted on in tests).

- [ ] **Step 3: Commit**

```bash
git add src/scene/SettlementLabScene.ts
git commit -m "chore: switch Settlement Lab elven POC override from watchtower to house"
```

---

### Task 9: Fresh baseline, full regression, live verification, docs, push

**Files:** None new — verification + documentation task.

- [ ] **Step 1: Establish fresh baseline was already taken before Task 1** (if not
  already done, run now for comparison purposes — see note below).

Note: since this plan built directly on top of the already-verified-clean tree from the
prior tower rework round (144 tsc errors / 13 pre-existing vitest failures, confirmed
immediately before this plan's Task 1 began), a full fresh-checkout baseline re-run
isn't strictly necessary if no other work has landed on `main` in the interim — but
re-run both commands now regardless, to catch any drift:

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144 (same as established baseline) — investigate any new count.

Run: `npx vitest run 2>&1 | tail -20`
Expected: same "13 failed" pre-existing/flaky set as documented in this session's prior
rounds (`main.startup.smoke`×3, `enemyLoader`×3, `towerGenerator`×2, `talentSystem`×3,
`WaterMaterial`×1, `ResourceNodePlacer`×1) — investigate any new failures beyond this set.

- [ ] **Step 2: Live-verify via Playwright screenshots**

Start the dev server if not already running (`npx vite --port 5175` or similar, check
first with `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5175/showroom.html`
— reuse whatever port is actually serving). Write a throwaway script (delete after use,
per this project's convention) that:
1. Imports `getFactionBuildingVariant('elven', 'house')` and spawns houses at seeds 1-4
   with `floors: 1`, `floors: 2`, and `floors: 3` to confirm ring-beam bands/windows are
   visually present and scale with floor count.
2. Spawns a handful of seeds and screenshots close-up to confirm both entrance styles
   (`ground_arch` vs `raised_platform`) and both canopy archetypes (`satellite_lobes` vs
   `moss_crown`) are visually distinguishable — cross-reference against
   `pickElvenEntranceStyle`/`pickElvenCanopyArchetype`'s actual output for those seeds
   (compute offline, matching the tower round's `check_seeds.mjs` pattern, run from the
   repo root so `@/` path aliases resolve) rather than guessing which seed produces which
   style.
3. Frames the camera at a distance matching the isometric camera's real default zoom
   (`CameraRig.FRUSTUM_HEIGHT = 22`), per the lesson learned from the tower's pagoda
   legibility bug — don't judge "is this visible" from an arbitrarily-close or
   arbitrarily-far screenshot.

Also load the actual Settlement Lab flow (Overworld Studio → Settlement tab → select
elven → "Play in 3D") if reachable via the showroom/studio dev entry point, matching how
prior rounds verified the tower.

- [ ] **Step 3: Update `TODO/organic_world_tiles_todo.md` and `TODO/TODO_OVERVIEW.md`**

Add a new sub-entry under Phase 6 (following the `6.4`/`6.4b`-`6.4e` numbering pattern —
this is the first entry for a *different building kind*, so consider a new top-level
sub-heading like `6.6` rather than continuing the `6.4x` tower-specific series) describing:
what shipped (ring-beams-per-floor, carved windows, 2 entrance styles, 2 canopy
archetypes), the research summary, verification results (test counts, tsc/vitest
baseline comparison, live-screenshot findings), and the Settlement Lab override switch.
Mirror the summary in `TODO_OVERVIEW.md`'s G16 entry.

- [ ] **Step 4: Clean up throwaway verification scripts/screenshots**

Delete any `verify_*.cjs`/`.mjs` scripts and `/tmp/*.png` screenshots created during Step
2, per this project's established convention.

- [ ] **Step 5: Push and update the PR**

```bash
git push origin terrygoleman-organic-world-tiles-phases-1-5
```

Update PR #46's body with a new "Round 6" section (following the existing Round 1-5
pattern already in the PR body) summarizing this round.

- [ ] **Step 6: Report to the user**

Summarize what shipped, verification results, and ask for their live feedback via the
Settlement Lab "Play in 3D" flow (matching how every prior round in this session ended).
