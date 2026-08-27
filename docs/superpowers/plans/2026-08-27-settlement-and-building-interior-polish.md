# Settlement & Building Interior Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two confirmed, unrelated polish issues from `TODO/02-game-world-integration/*`: building interiors feel cramped (half-scale rooms), and live-overworld settlements/roads look visually "off" (undersized overlap padding, 1-tile-wide roads, single-room small houses).

**Architecture:** Both workstreams are small, targeted corrections to existing, already-live systems — no new subsystems, no new pipelines. Workstream 1 touches `buildingToDungeonPlan.ts` and `InteriorGenerator.ts` (the live building-interior scene generator, reached via `SceneManager.loadDungeon()`). Workstream 2 touches `SettlementGenerator.ts` (the live ward/Voronoi settlement placer, already wired into `OverworldScene.ts`). No changes to `PlayerController`, physics, or the not-yet-live `RealmToTerrain`/`RealmRiverMesh` pipeline.

**Tech Stack:** TypeScript, Vitest, Three.js (interiors only, not touched directly by these fixes).

## Global Constraints

- No new dependencies. No new subsystems. Every fix is a targeted change to an existing, already-shipped file.
- All existing tests in the touched files' test suites must keep passing; do not weaken or delete an existing assertion to make a change pass.
- Full regression suite (`npm test` / project's existing test command) must show no new failures beyond the pre-existing baseline (confirmed at branch start: 2251 passed, 12 pre-existing/unrelated failures) before this branch is considered done.
- Manual playtest is required before final completion claim for both workstreams (visual/feel changes cannot be fully verified by unit tests alone) — do not claim "done" without it.
- Follow TDD: write the failing test before the implementation in every task below.

---

## Workstream 1 — Building interiors

### Task 1: Fix building-interior `cellSize` (half-scale room bug)

**Files:**
- Modify: `src/buildingToDungeonPlan.ts:215`
- Test: `tests/levels/buildingToDungeonPlan.test.ts`

**Interfaces:**
- Consumes: nothing new — `buildingToDungeonPlan()`'s existing `rooms.set(id, {...})` call (around line 210-224), which builds one `Blueprint` per room.
- Produces: every `Blueprint` returned by `buildingToDungeonPlan()` now has `cellSize: 2` instead of `cellSize: 1.0`. `BlueprintRenderer`/`SceneManager` (unmodified) already read `cellSize` generically for wall/furniture/door/stair geometry and physics bounds, so this doubles every room's physical (world-unit) size with no other code changes.

- [ ] **Step 1: Write the failing test**

Add to `tests/levels/buildingToDungeonPlan.test.ts`, inside the existing `describe('buildingToDungeonPlan — core contract', ...)` block (after the `'each blueprint passes structural sanity checks'` test, around line 128-142):

```ts
  it('rooms use the same cellSize convention as other interior scenes (2 world units/tile)', () => {
    const plan = buildingToDungeonPlan('house', 'human', 1);
    for (const [id, bp] of plan.rooms) {
      expect(bp.cellSize, `${id}.cellSize`).toBe(2);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/levels/buildingToDungeonPlan.test.ts -t "cellSize convention"`
Expected: FAIL — `expected 1 to be 2`

- [ ] **Step 3: Fix the implementation**

In `src/buildingToDungeonPlan.ts`, line 215, inside the `rooms.set(id, {...})` object literal:

```ts
        cellSize:     2,
```

(replacing the existing `cellSize:     1.0,`)

- [ ] **Step 4: Run the new test and the full file's suite to verify no regressions**

Run: `npx vitest run tests/levels/buildingToDungeonPlan.test.ts`
Expected: all tests PASS (the file has no test that hardcodes `cellSize` to `1` — only `toBeGreaterThan(0)` sanity checks — so this should be a clean pass).

- [ ] **Step 5: Run the interior-adjacent e2e/integration suite**

Run: `npx vitest run tests/ -t "building-floors"` (or the equivalent existing e2e spec covering multi-floor buildings, e.g. `building-floors.spec.ts` if present under `tests/`)
Expected: PASS. If this spec asserts specific world-unit distances/positions that assumed the old scale, update those expected values to match the new `cellSize: 2` (do not weaken the assertion — recompute the expected number from the new scale).

- [ ] **Step 6: Commit**

```bash
git add src/buildingToDungeonPlan.ts tests/levels/buildingToDungeonPlan.test.ts
git commit -m "fix: building interiors use cellSize=2 (matches every other interior scene)

Building interiors were the only interior-scene generator using
cellSize: 1.0 — half the world-unit scale of TowerGenerator,
DungeonGenerator, GreenhouseGenerator, and SandboxArena (all cellSize: 2).
This made every room in every building half-area/quarter-floor-space
versus every other interior in the game, which is why they read as
cramped. BlueprintRenderer/SceneManager already read cellSize generically
for all geometry and physics bounds, so this is a pure scale fix."
```

---

### Task 2: Fix `getBuildingFootprint()`'s stale comment

**Files:**
- Modify: `src/world/buildings/InteriorGenerator.ts:248-249`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing functional — this is a documentation-only correction (no behavior change, no test needed).

**Context:** `getBuildingFootprint()`'s comment claims it uses "the same footprint logic as BuildingBuilder." It does not — `BuildingDNA.ts`'s `SIZE_FOOTPRINT`/`KIND_FOOTPRINT` tables (the real exterior footprint) are deliberately smaller (tiny 3×3 up to large 7×5) than this function's table (tiny 6×6 up to large 15×12). This divergence is intentional and desirable (compact exterior silhouette, spacious interior) — only the comment is wrong.

- [ ] **Step 1: Fix the comment**

In `src/world/buildings/InteriorGenerator.ts`, replace lines 248-249:

```ts
function getBuildingFootprint(dna: BuildingDNA): { w: number; d: number } {
  // Use the same footprint logic as BuildingBuilder
```

with:

```ts
function getBuildingFootprint(dna: BuildingDNA): { w: number; d: number } {
  // Deliberately larger than BuildingDNA's exterior SIZE_FOOTPRINT/KIND_FOOTPRINT
  // tables — interiors are intentionally more spacious than the compact
  // exterior silhouette, since they render as a fully separate scene
  // (see SceneManager.loadDungeon()), not a literal inside-the-mesh space.
```

- [ ] **Step 2: Commit**

```bash
git add src/world/buildings/InteriorGenerator.ts
git commit -m "docs: correct stale getBuildingFootprint() comment

It does not share BuildingBuilder's exterior footprint table — the
divergence (larger interior footprint than exterior) is intentional."
```

---

### Task 3: Always split house/cottage/terraced interiors into living+kitchen+bedroom

**Files:**
- Modify: `src/world/buildings/InteriorGenerator.ts:141-160`
- Test: `tests/world/InteriorGenerator.test.ts`

**Interfaces:**
- Consumes: `generatePlan(dna: BuildingDNA): HousePlan` (existing signature, unchanged) where `HousePlan.rooms: RoomDef[]`.
- Produces: for `dna.buildingKind` in `'house' | 'cottage' | 'terraced'`, `generatePlan(dna).rooms.length` is now `3` (living, kitchen, bedroom) for every `dna.size`, including `'tiny'` and `'small'` — previously `'tiny'` and `'small'` produced only `1` room (an undivided living room), because the back-room depth (`backD`) computation left no room to carve when `kd` (inner depth) was small.

**Context:** Currently `const ld = Math.ceil(kd * 0.55);` and `if (backD > 1) { ... }` (where `backD = kd - ld - 1`). For `BASE.tiny = {w:6,d:6}` (`kd=4`): `ld=3, backD=0` → no split. For `BASE.small = {w:9,d:7}` (`kd=5`): `ld=3, backD=1` → still no split (needs `>1`). Since `WARD_TO_SIZE` assigns `'small'` to the common `farm`/`gateward` wards, most starter houses in a settlement currently render as one big undivided room. Lowering the front-room proportion and the split threshold fixes this for every size without changing total floor area.

- [ ] **Step 1: Write the failing test**

Add to `tests/world/InteriorGenerator.test.ts`, inside the existing `describe('generatePlan', ...)` block:

```ts
  it('house/cottage/terraced always split into living+kitchen+bedroom, at every size', () => {
    for (const kind of ['house', 'cottage', 'terraced'] as const) {
      for (const size of ['tiny', 'small', 'medium', 'large'] as const) {
        const dna = factionBuildingDna(kind, 'human', 1, size, 1);
        const plan = generatePlan(dna);
        const purposes = plan.rooms.map(r => r.purpose).sort();
        expect(purposes, `${kind}/${size}`).toEqual(['bedroom', 'kitchen', 'living']);
      }
    }
  });
```

Check the top of `tests/world/InteriorGenerator.test.ts` for the existing import of `factionBuildingDna` (used elsewhere in the file for other kind/size matrices) — reuse it; add the import if it is not already present:

```ts
import { factionBuildingDna } from '@/world/buildings/BuildingDNA';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/InteriorGenerator.test.ts -t "always split into living"`
Expected: FAIL for `house/tiny` and `house/small` (and same for `cottage`/`terraced` tiny/small, if those sizes are reachable for those kinds) — `purposes` will be `['living']` instead of the expected 3-item array.

- [ ] **Step 3: Fix the implementation**

In `src/world/buildings/InteriorGenerator.ts`, replace lines 143 and 147 inside the `case 'house': case 'cottage': case 'terraced':` block:

```ts
      const ld = Math.ceil(kd * 0.55);
      fillRoom(1, 1, kw, ld, 'living');
      const bw = Math.floor(kw / 2);
      const backD = kd - ld - 1;
      if (backD > 1) {
```

with:

```ts
      const ld = Math.ceil(kd * 0.5);
      fillRoom(1, 1, kw, ld, 'living');
      const bw = Math.floor(kw / 2);
      const backD = kd - ld - 1;
      if (backD >= 1) {
```

(Only `0.55` → `0.5` and `backD > 1` → `backD >= 1` change; everything else in the block — the `fillRoom` calls for kitchen/bedroom, the 2-tile passage, the kitchen↔bedroom connector — is unchanged.)

- [ ] **Step 4: Run the new test and the file's full suite to verify it passes with no regressions**

Run: `npx vitest run tests/world/InteriorGenerator.test.ts`
Expected: all tests PASS, including the new one. (No existing test in this file asserts an exact room count or `ld`/`backD` value for house/cottage/terraced, so this should not require touching any other assertion.)

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/InteriorGenerator.ts tests/world/InteriorGenerator.test.ts
git commit -m "fix: tiny/small houses always split into living+kitchen+bedroom

Previously backD (back-room depth) was 0-1 tiles for tiny/small house
sizes, so the 'if (backD > 1)' guard skipped the kitchen/bedroom split
entirely — the common WARD_TO_SIZE='small' farm/gateward house rendered
as one big undivided room. Lowering the front-room share (0.55->0.5) and
the split threshold (>1 -> >=1) guarantees a 3-room split at every size,
without changing total floor area."
```

---

### Task 4: Bump furniture density to match doubled room scale

**Files:**
- Modify: `src/buildingToDungeonPlan.ts:51-60`
- Test: `tests/levels/buildingToDungeonPlan.test.ts`

**Interfaces:**
- Consumes: `PURPOSE_FURNITURE: Partial<Record<RoomPurpose, InteractableEntry['type'][]>>` (existing module-level const, lines 51-60).
- Produces: `placeFurniture(purpose, bw, bd, seed): InteractableEntry[]` (existing signature, unchanged) now places one more item per purpose that already had entries.

**Context:** Task 1 doubled every room's world-unit size but did not change furniture item counts, so rooms will read as sparser (same number of props, physically larger room). Bump each existing `PURPOSE_FURNITURE` list by one item, reusing item kinds already used elsewhere in the table (no new prop kinds needed).

- [ ] **Step 1: Write the failing test**

Add to `tests/levels/buildingToDungeonPlan.test.ts`, inside `describe('buildingToDungeonPlan — core contract', ...)`:

```ts
  it('rooms have at least 4 furniture items where furniture is defined for the purpose', () => {
    const plan = buildingToDungeonPlan('inn', 'human', 1, 'large', 2);
    const purposesSeen = new Set<string>();
    for (const bp of plan.rooms.values()) {
      if (bp.interactables.length > 0) {
        purposesSeen.add('has-furniture');
        expect(bp.interactables.length).toBeGreaterThanOrEqual(4);
      }
    }
    expect(purposesSeen.size).toBeGreaterThan(0); // sanity: this building actually has furnished rooms
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/levels/buildingToDungeonPlan.test.ts -t "at least 4 furniture items"`
Expected: FAIL — current lists are 2-3 items, so `toBeGreaterThanOrEqual(4)` fails for at least one room.

- [ ] **Step 3: Fix the implementation**

In `src/buildingToDungeonPlan.ts`, replace lines 51-60:

```ts
const PURPOSE_FURNITURE: Partial<Record<RoomPurpose, InteractableEntry['type'][]>> = {
  living:      ['bookshelf', 'candelabra', 'reading_table'],
  kitchen:     ['cauldron', 'barrel', 'barrel'],
  bedroom:     ['bed', 'chest', 'candelabra'],
  hall:        ['candelabra', 'candelabra'],
  bar:         ['barrel', 'barrel', 'mess_table'],
  storage:     ['crate', 'chest', 'barrel'],
  workshop:    ['anvil', 'weapon_stand', 'candelabra'],
  chapel_nave: ['candelabra', 'containment_ring', 'candelabra'],
};
```

with:

```ts
const PURPOSE_FURNITURE: Partial<Record<RoomPurpose, InteractableEntry['type'][]>> = {
  living:      ['bookshelf', 'candelabra', 'reading_table', 'bookshelf'],
  kitchen:     ['cauldron', 'barrel', 'barrel', 'crate'],
  bedroom:     ['bed', 'chest', 'candelabra', 'candelabra'],
  hall:        ['candelabra', 'candelabra', 'bookshelf', 'candelabra'],
  bar:         ['barrel', 'barrel', 'mess_table', 'barrel'],
  storage:     ['crate', 'chest', 'barrel', 'crate'],
  workshop:    ['anvil', 'weapon_stand', 'candelabra', 'crate'],
  chapel_nave: ['candelabra', 'containment_ring', 'candelabra', 'candelabra'],
};
```

- [ ] **Step 4: Run the new test and the file's full suite to verify it passes with no regressions**

Run: `npx vitest run tests/levels/buildingToDungeonPlan.test.ts`
Expected: all tests PASS. (`placeFurniture()`'s 20-attempt random-placement loop already tolerates duplicate item kinds and skips already-used tile coordinates, so adding one more item per list is safe — worst case an item silently fails to place if the room is extremely small, which the existing loop already handles gracefully.)

- [ ] **Step 5: Commit**

```bash
git add src/buildingToDungeonPlan.ts tests/levels/buildingToDungeonPlan.test.ts
git commit -m "fix: bump per-room furniture count to match doubled room scale

Task 1 doubled cellSize (room world-unit size) without changing prop
counts, which would read as sparser rooms. Add one more item per
PURPOSE_FURNITURE list, reusing existing prop kinds."
```

---

## Workstream 2 — Settlement / road placement

### Task 5: Fix `buildingHalfExtents()` to use `WARD_TO_SIZE` (correct overlap padding)

**Files:**
- Modify: `src/world/SettlementGenerator.ts:21, 200-205`
- Test: `tests/levels/settlementGenerator.test.ts`

**Interfaces:**
- Consumes: `WARD_TO_KIND: Partial<Record<string, BuildingKind>>` and `WARD_TO_SIZE: Partial<Record<string, BuildingSize>>` (both already exported from `@/buildingToDungeonPlan`, only `WARD_TO_KIND` currently imported in `SettlementGenerator.ts`); `getFootprint(kind: BuildingKind, size: BuildingSize): { w: number; d: number }` (already imported from `./buildings/BuildingDNA`).
- Produces: `buildingHalfExtents(b: Pick<PlacedBuilding, 'wardType' | 'isAnchor'>): { hw: number; hd: number }` (existing signature, unchanged) now returns the same half-extents the test file's own `overlaps()` helper (`tests/levels/settlementGenerator.test.ts:29-39`) already independently computes — i.e. source and test now agree on the correct sizing convention.

**Context:** `buildingHalfExtents()` currently estimates anchor-building size via ad-hoc `patriciate`/`church` string checks that ignore `WARD_TO_SIZE` — the same table `createSettlementBuildingDna()` actually uses to build the real building DNA/mesh. E.g. `WARD_TO_SIZE.inn = 'large'` but the current code falls through to `'medium'` for `inn`, under-padding overlap clearance by roughly a tile. The test file already has a correct reference implementation in its local `overlaps()` helper (used by the `'never overlaps buildings using ward-derived footprints'` test) — this task makes the source match it.

- [ ] **Step 1: Write the failing test**

Add to `tests/levels/settlementGenerator.test.ts`, inside a new `describe` block (add after the existing `describe('planSettlement', ...)` block, before `describe('applySettlementToGrid', ...)`):

```ts
describe('buildingHalfExtents (via overlap padding)', () => {
  it('pads inn/patriciate-sized anchors using their real WARD_TO_SIZE, not an ad-hoc guess', () => {
    // Build two adjacent inn anchors close enough to violate correct
    // (WARD_TO_SIZE-based) padding but not violate the current buggy
    // ad-hoc 'medium' estimate — this is only reachable if the source
    // under-pads relative to the real footprint.
    const innFootprint = getFootprint(WARD_TO_KIND['inn']!, WARD_TO_SIZE['inn'] ?? 'medium');
    const innHw = Math.ceil(innFootprint.w / 4);
    const innHd = Math.ceil(innFootprint.d / 4);
    const a: PlacedBuilding = { wardType: 'inn', isAnchor: true, col: 0, row: 0, rotation: 0, seed: 1 };
    const b: PlacedBuilding = { wardType: 'inn', isAnchor: true, col: innHw * 2, row: 0, rotation: 0, seed: 2 };
    // At this exact spacing (2x the correct half-width apart), correctly
    // sized anchors must be flagged as overlapping by the real padding
    // logic used elsewhere in this file's tests.
    expect(overlaps(a, b)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes for the right reason first**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts -t "pads inn/patriciate"`
Expected: this specific test uses the test file's own `overlaps()` helper (already correct), so it PASSES immediately — it is a scaffold to prove the "correct" calc flags this spacing as an overlap. This is expected; the real regression coverage for the *source* bug comes from Step 3's replacement making `_noOverlap`/`buildingHalfExtents` (source) agree with `overlaps()` (test helper). Proceed to Step 3.

- [ ] **Step 3: Fix the implementation**

In `src/world/SettlementGenerator.ts`, line 21, change the import:

```ts
import { WARD_TO_KIND } from '@/buildingToDungeonPlan';
```

to:

```ts
import { WARD_TO_KIND, WARD_TO_SIZE } from '@/buildingToDungeonPlan';
```

Then replace lines 200-205:

```ts
function buildingHalfExtents(b: Pick<PlacedBuilding, 'wardType' | 'isAnchor'>): { hw: number; hd: number } {
  const kind = WARD_TO_KIND[b.wardType]!;
  const size = b.isAnchor ? (b.wardType in { park:1 } ? 'medium' : undefined) : 'tiny';
  const resolvedSize = size ?? (b.wardType === 'patriciate' ? 'large' : b.wardType === 'church' ? 'medium' : 'medium');
  const fp = getFootprint(kind, resolvedSize as any);
  return { hw: Math.ceil(fp.w / 4), hd: Math.ceil(fp.d / 4) };
}
```

with:

```ts
function buildingHalfExtents(b: Pick<PlacedBuilding, 'wardType' | 'isAnchor'>): { hw: number; hd: number } {
  const kind = WARD_TO_KIND[b.wardType]!;
  const resolvedSize = b.isAnchor ? (WARD_TO_SIZE[b.wardType] ?? 'medium') : 'tiny';
  const fp = getFootprint(kind, resolvedSize);
  return { hw: Math.ceil(fp.w / 4), hd: Math.ceil(fp.d / 4) };
}
```

- [ ] **Step 4: Run the new test and the full settlement suite to verify no regressions**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts`
Expected: all tests PASS, including the pre-existing `'never overlaps buildings using ward-derived footprints'` test (now checking source and test helper against the same, matching logic) and the pre-existing `'snaps a building off invalid terrain'`/`'drops buildings gracefully'` tests (unaffected — they don't depend on exact half-extent values).

- [ ] **Step 5: Commit**

```bash
git add src/world/SettlementGenerator.ts tests/levels/settlementGenerator.test.ts
git commit -m "fix: buildingHalfExtents() uses WARD_TO_SIZE, not an ad-hoc size guess

Anchor overlap-avoidance padding previously estimated building size via
patriciate/church-only string checks that ignored WARD_TO_SIZE entirely
(e.g. inn = WARD_TO_SIZE.inn 'large' was estimated as 'medium', under-
padding clearance by ~1 tile). Use WARD_TO_SIZE directly, matching what
createSettlementBuildingDna() actually builds and what this test file's
own overlaps() helper already assumed."
```

---

### Task 6: Add a permanent flat-terrain 0%-building-drop regression guard

**Files:**
- Modify: `tests/levels/settlementGenerator.test.ts`

**Interfaces:**
- Consumes: `flatGrid(size?: number): WorldGrid` (existing test helper, line 12-19), `buildModelFor(type, seed, faction?): SettlementModel` (existing test helper, line 39-46), `fillWard`, `OccupancyGrid` (already imported from `@/world/SettlementModelGenerator`), `planSettlement`, `WARD_TO_KIND`.
- Produces: nothing new exported — this is a test-only guard confirming a previously-investigated (and found-to-be-non-reproducing) drop-rate concern stays at 0% on buildable terrain going forward.

**Context:** Investigation during planning (documented in the design spec, `docs/superpowers/specs/2026-08-27-settlement-and-building-interior-polish-design.md`, Finding B) measured 0% building-drop rate for village/town/city across 20 seeds each on fully flat, buildable terrain. This task encodes that measurement as a permanent regression test, so future changes to `snapBuildingTile()`/`MAX_BUILDING_SNAP_RADIUS`/`SETTLEMENT_MODEL_SCALE` can't silently reintroduce building loss without a test failure.

- [ ] **Step 1: Write the test**

Add to `tests/levels/settlementGenerator.test.ts`, inside `describe('planSettlement', ...)` (after the existing `'drops buildings gracefully when no valid tile exists in range'` test):

```ts
  it('drops zero requested buildings on flat, fully buildable terrain (village/town/city, 20 seeds each)', () => {
    for (const type of ['village', 'town', 'city'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const grid = flatGrid(256);
        const plan = planSettlement(type, 128, 128, seed, grid);
        const model = buildModelFor(type, seed);
        const occ = new OccupancyGrid(
          type === 'village' ? 320 : type === 'town' ? 360 : 420,
          type === 'village' ? 240 : type === 'town' ? 280 : 320,
        );
        let requested = 0;
        for (const ward of model.wards) {
          if (!ward.withinCity || !WARD_TO_KIND[ward.type]) continue;
          requested += fillWard(ward, occ, model.roads).length;
        }
        expect(plan.buildings.length, `${type} seed=${seed}`).toBe(requested);
      }
    }
  });
```

Ensure `OccupancyGrid` and `fillWard` are imported at the top of the file (they already are, per the existing `buildModelFor` helper's imports at line 7: `import { buildSettlement, type SettlementModel, type WardType } from '@/world/SettlementModelGenerator';` — extend this import to also bring in `fillWard` and `OccupancyGrid`):

```ts
import { buildSettlement, fillWard, OccupancyGrid, type SettlementModel, type WardType } from '@/world/SettlementModelGenerator';
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts -t "drops zero requested buildings"`
Expected: PASS (this mirrors the exact measurement done during planning — flat terrain, `params.width`/`params.height` matching `PARAMS_BY_TYPE` in `SettlementGenerator.ts`). If it fails, do not "fix" the test to pass — this would mean the drop-rate finding from planning does not hold under the exact params used here; stop and re-diagnose (check `params.width`/`height` values in this test against `PARAMS_BY_TYPE` in `src/world/SettlementGenerator.ts` for a mismatch first, since `OccupancyGrid` dimensions must match what `planSettlement()` actually uses internally).

- [ ] **Step 3: Commit**

```bash
git add tests/levels/settlementGenerator.test.ts
git commit -m "test: guard 0% building-drop rate on flat terrain (village/town/city)

Encodes the drop-rate measurement from planning as a permanent
regression test, so future changes to snapBuildingTile()/
MAX_BUILDING_SNAP_RADIUS/SETTLEMENT_MODEL_SCALE can't silently drop
buildings again without a test failure."
```

---

### Task 7: Widen rasterized road tiles so streets read as real streets

**Files:**
- Modify: `src/world/SettlementGenerator.ts:229-263`
- Test: `tests/levels/settlementGenerator.test.ts`

**Interfaces:**
- Consumes: existing `rasterizeRoads(roads: Road[], centerCol: number, centerRow: number, cx: number, cy: number): RoadSegment[]` (private function, unchanged signature).
- Produces: `rasterizeRoads()`'s output `RoadSegment[]` now includes each original center-line tile's 4 orthogonal neighbours in addition to the tile itself — i.e. roads are now ~3 tiles (6 world units) wide instead of 1 tile (2 world units) wide. `planSettlement()`'s `roads` field (consumed by `applySettlementToGrid()`'s road-tile-marking loop, line 171-173, and `OverworldScene.ts`'s road-tile-rendering loop, ~line 2237) requires **no changes** — both already iterate `plan.roads`/`SettlementPlan.roads` generically per-tile, so more tiles in the array automatically render/mark as more (wider) road.

**Context:** `model.roads[]` (from `SettlementModelGenerator.ts`) is a flat array of gate→hub arterial paths — there is no separate secondary/alley road network generated, so there's no natural "avenue vs. alley" width-tier data to key off (an older TODO reference to `SettlementRoadMesh.ts`'s anchor-kind width logic does not apply — that's a different, unused companion module with a different data shape). The real, simple fix: these are all primary streets, and they currently rasterize as a single Bresenham-line tile — widen the swath uniformly.

- [ ] **Step 1: Write the failing test**

Add to `tests/levels/settlementGenerator.test.ts`, inside `describe('planSettlement', ...)`:

```ts
  it('roads are wider than a single tile (each road tile has an orthogonal road neighbor)', () => {
    const grid = flatGrid(128);
    const plan = planSettlement('town', 64, 64, 555, grid, 'WideRoads', 'human');
    const roadSet = new Set(plan.roads.map(r => `${r.col},${r.row}`));
    expect(plan.roads.length).toBeGreaterThan(0);
    let tilesWithOrthogonalNeighbor = 0;
    for (const r of plan.roads) {
      const hasNeighbor =
        roadSet.has(`${r.col + 1},${r.row}`) || roadSet.has(`${r.col - 1},${r.row}`) ||
        roadSet.has(`${r.col},${r.row + 1}`) || roadSet.has(`${r.col},${r.row - 1}`);
      if (hasNeighbor) tilesWithOrthogonalNeighbor++;
    }
    // Every original center-line tile now has all 4 neighbours added, so
    // essentially every tile should have at least one orthogonal road
    // neighbour (a genuinely 1-tile-wide road would have none, since
    // Bresenham lines only touch diagonally at direction changes).
    expect(tilesWithOrthogonalNeighbor).toBe(plan.roads.length);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts -t "roads are wider than a single tile"`
Expected: FAIL — the current 1-tile Bresenham output only guarantees orthogonal-or-diagonal adjacency between consecutive line tiles, not that every tile has a strict orthogonal (non-diagonal) neighbor; many tiles will have 0.

- [ ] **Step 3: Fix the implementation**

In `src/world/SettlementGenerator.ts`, replace the final two lines of `rasterizeRoads()` (currently just `return [...out.values()];` at line 262, after the `for (const road of roads) { ... }` loop that ends at line 261):

```ts
  for (const road of roads) {
    if (road.points.length === 0) continue;
    let prev = toGrid(road.points[0]!);
    addTile(prev.col, prev.row);
    for (let i = 1; i < road.points.length; i++) {
      const cur = toGrid(road.points[i]!);
      bresenham(prev.col, prev.row, cur.col, cur.row);
      prev = cur;
    }
  }
  return [...out.values()];
}
```

with:

```ts
  for (const road of roads) {
    if (road.points.length === 0) continue;
    let prev = toGrid(road.points[0]!);
    addTile(prev.col, prev.row);
    for (let i = 1; i < road.points.length; i++) {
      const cur = toGrid(road.points[i]!);
      bresenham(prev.col, prev.row, cur.col, cur.row);
      prev = cur;
    }
  }
  // Widen the rasterized center-line into a real street: dilate every
  // center-line tile by its 4 orthogonal neighbours. model.roads[] are all
  // primary gate->hub arterials (no separate alley network exists in the
  // generator), so a uniform width for every road is the honest fix here.
  const centerLineTiles = [...out.values()];
  for (const { col, row } of centerLineTiles) {
    addTile(col + 1, row);
    addTile(col - 1, row);
    addTile(col, row + 1);
    addTile(col, row - 1);
  }
  return [...out.values()];
}
```

- [ ] **Step 4: Run the new test and the full settlement suite to verify no regressions**

Run: `npx vitest run tests/levels/settlementGenerator.test.ts`
Expected: all tests PASS, including the pre-existing `'marks road and building cells with the new placed-building shape'` test in `describe('applySettlementToGrid', ...)` (still passes — it iterates `plan.roads` generically, doesn't assert a count).

- [ ] **Step 5: Run the full regression suite to check for any test elsewhere that depends on road-tile count/positions**

Run: `npm test` (or the project's existing full-suite command)
Expected: no new failures beyond the pre-existing 12 unrelated ones. If any other test (e.g. minimap rendering, scatter/nature-spawn exclusion near roads) hardcodes an exact road-tile count, update its expected value to match the new wider count rather than reverting the fix.

- [ ] **Step 6: Commit**

```bash
git add src/world/SettlementGenerator.ts tests/levels/settlementGenerator.test.ts
git commit -m "fix: widen rasterized settlement roads from 1 tile to ~3 tiles wide

model.roads[] are all primary gate->hub arterials (no alley network
exists in the generator), so rather than inventing a fake avenue/alley
width hierarchy, dilate every rasterized center-line tile by its 4
orthogonal neighbours so streets read as real streets. Both
applySettlementToGrid() and OverworldScene's road-tile rendering already
iterate plan.roads generically per-tile, so no other file needs changes."
```

---

### Task 8: Correct stale Studio/live-parity documentation

**Files:**
- Modify: `TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md`
- Modify: `TODO/02-game-world-integration/settlement-integration.md`

**Interfaces:** None (documentation only, no code/tests).

**Context:** Both docs currently describe the live settlement building-layout system (P1-2) as "not started" and using an "independent concentric-ring" model. Neither is accurate: `SettlementGenerator.ts` already calls `SettlementModelGenerator.ts`'s ward/Voronoi (`d3-delaunay` + Chaikin-smoothed roads) model — the same class of algorithm as Overworld Studio's — via `planSettlement()`. The old concentric-ring description matches `SettlementSpawner.ts`, which is confirmed unused by `OverworldScene.ts` (only referenced by the Studio-preview dev feature `_buildStudioSettlementPreview()`).

- [ ] **Step 1: Find and read the exact current wording**

Run: `grep -n "P1-2\|P1(2)\|concentric" TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md TODO/02-game-world-integration/settlement-integration.md`

- [ ] **Step 2: Update `STUDIO-LIVE-PARITY.md`**

Find the P1-2 status section (matched by the grep above) and replace its status/description with (adapting surrounding markdown structure/heading level to match the file's existing style):

```markdown
**Status: substantially further along than previously recorded.** The
live `SettlementGenerator.ts` already calls `SettlementModelGenerator.ts`'s
ward/Voronoi model (`d3-delaunay` + Chaikin-smoothed roads) via
`planSettlement()` — the same class of algorithm as Overworld Studio's,
not an independent concentric-ring model. (`SettlementSpawner.ts`, which
does use a concentric-ring model, is confirmed unused by
`OverworldScene.ts` — it only backs the Studio-preview dev feature
`_buildStudioSettlementPreview()`.) Remaining known issues (anchor-building
overlap padding, road width) were fixed in the
2026-08-27-settlement-and-building-interior-polish branch. If settlements
still look meaningfully different from Studio's preview after those
fixes, that would indicate this item needs a fuller design cycle after
all — not that the ward-model integration itself is missing.
```

- [ ] **Step 3: Update `settlement-integration.md`**

Apply the same correction (same replacement text, adapted to fit the file's surrounding heading/structure) wherever it references the stale concentric-ring/not-started framing.

- [ ] **Step 4: Commit**

```bash
git add TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md TODO/02-game-world-integration/settlement-integration.md
git commit -m "docs: correct stale settlement-generator parity status

The live game already uses the ward/Voronoi model (SettlementModelGenerator.ts)
via SettlementGenerator.ts's planSettlement(), not an independent
concentric-ring model (that describes the unused SettlementSpawner.ts).
Docs previously described this as 'not started'."
```

---

## Final verification

### Task 9: Full regression suite + manual playtest

**Files:** None (verification only).

- [ ] **Step 1: Run the full existing test suite**

Run: `npm test` (or project's existing full-suite command)
Expected: same pass/fail counts as the pre-branch baseline (2251 passed / 12 pre-existing unrelated failures) plus all new tests from Tasks 1-7 passing. Any new failure must be root-caused and fixed (or the branch is not done) — do not claim completion with unexplained new failures.

- [ ] **Step 2: Manual playtest — building interiors**

Start the game locally (existing dev-server command for this project), enter at least: one `'tiny'`-or-`'small'`-sized house/cottage (confirm 3 distinct rooms: living/kitchen/bedroom, each large enough to walk around furniture without clipping), one `'large'` inn (confirm rooms read as spacious, furniture density feels reasonable, not sparse). Confirm no visual clipping between walls/furniture/player capsule at the new scale.

- [ ] **Step 3: Manual playtest — settlements/roads**

Walk through at least one village, one town, and one city in the live overworld. Confirm: buildings (especially inns/patriciates) no longer visually clip/crowd their neighbors; roads read as proper multi-tile streets rather than a thin 1-tile line; no new pathing/collision regressions (player can still walk on roads, buildings still block movement).

- [ ] **Step 4: Record playtest outcome**

If either playtest surfaces an issue, fix it (adjust constants like the road-dilation ring count or furniture list, following the same TDD-first pattern as the relevant task above) before proceeding — do not defer to a future branch silently; note any deliberately-deferred follow-up explicitly in the final summary to the user.

- [ ] **Step 5: Final commit (if any playtest-driven tuning was needed)**

```bash
git add -A
git commit -m "polish: playtest-driven tuning for interior/settlement scale changes"
```

(Skip this step entirely if no tuning was needed after Steps 2-3.)
