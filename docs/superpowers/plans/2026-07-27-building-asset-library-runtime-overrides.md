# Building Asset Library Runtime Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow custom `building` Asset Library entries to override procedural settlement building generation at runtime.

**Architecture:** Reuse the existing `WorldGen.ts` asset-library override pattern used for custom settlement NPCs. Add a parallel building override reader in `WorldGen`, enrich the Overworld Studio building save path with settlement/building identity metadata, and lock the behavior with focused `WorldGen` tests. Keep the slice narrow and data-driven: no new UI, no generic override framework, no room-level override logic.

**Tech Stack:** TypeScript, mirrored JavaScript outputs in `src/`, Vitest, localStorage-backed Asset Library data

## Global Constraints

- Scope is limited to **building runtime overrides only**
- Reuse the existing NPC override pattern in `src/procedural/WorldGen.ts`
- No new Asset Library UI or editor workflows
- No room blueprint overrides
- No generic named-location abstraction
- No world-package export work
- Existing behavior must remain unchanged when no building overrides exist
- Update mirrored `.js` files alongside `.ts` files
- Keep commits narrow and frequent

---

### Task 1: Add failing `WorldGen` tests for custom settlement building overrides

**Files:**
- Modify: `tests/procedural/WorldGen.test.ts`
- Modify: `tests/procedural/WorldGen.test.js`

**Interfaces:**
- Consumes: `generateWorldPlan(seed: number, opts?: { settlementCount?: number; wildEnemyCount?: number; worldRadius?: number }): PlacementPlan`
- Produces: failing coverage for:
  - custom settlement building override consumption
  - fallback when no matching override exists
  - malformed building override rejection

- [ ] **Step 1: Write the failing TypeScript tests**

```ts
it('uses custom settlement building overrides from the asset library when present', () => {
  localStorage.removeItem('ttt_asset_library');

  const baseline = generateWorldPlan(SEED_A, { settlementCount: 1 });
  const settlement = baseline.settlements[0]!;

  const customBuilding = {
    buildingId: 'bld-custom-1',
    settlementId: settlement.id,
    kind: 'inn',
    style: 'arcane',
    floors: 3,
    rotation: 1.25,
    seed: 424242,
    hasInterior: true,
    pos: { x: 21, y: 0, z: -13 },
  };

  localStorage.setItem('ttt_asset_library', JSON.stringify({
    version: 1,
    entries: [
      {
        id: 'library_building_custom_1',
        type: 'building',
        name: 'Custom Arcane Inn',
        seed: settlement.seed,
        createdAt: 1,
        tags: [`settlement:${settlement.id}`, 'building:bld-custom-1', 'dtype:building'],
        isCustom: true,
        thumbnail: null,
        data: customBuilding,
      },
    ],
  }));

  const overridden = generateWorldPlan(SEED_A, { settlementCount: 1 });
  const buildings = overridden.settlements[0]!.buildings;

  expect(buildings).toHaveLength(1);
  expect(buildings[0]!.id).toBe('bld-custom-1');
  expect(buildings[0]!.kind).toBe('inn');
  expect(buildings[0]!.style).toBe('arcane');
  expect(buildings[0]!.floors).toBe(3);
  expect(buildings[0]!.rotation).toBe(1.25);
  expect(buildings[0]!.seed).toBe(424242);
  expect(buildings[0]!.hasInterior).toBe(true);
  expect(buildings[0]!.pos).toEqual({ x: 21, y: 0, z: -13 });

  localStorage.removeItem('ttt_asset_library');
});

it('falls back to procedural building generation when no matching building overrides exist', () => {
  localStorage.setItem('ttt_asset_library', JSON.stringify({
    version: 1,
    entries: [
      {
        id: 'library_building_other_settlement',
        type: 'building',
        name: 'Other Settlement Building',
        seed: 999999,
        createdAt: 1,
        tags: ['settlement:not-the-right-one', 'dtype:building'],
        isCustom: true,
        thumbnail: null,
        data: {
          buildingId: 'bld-other-1',
          settlementId: 'not-the-right-one',
          kind: 'shop',
          style: 'stone',
          floors: 2,
          pos: { x: 5, y: 0, z: 5 },
        },
      },
    ],
  }));

  const plan = generateWorldPlan(SEED_A, { settlementCount: 1 });
  expect(plan.settlements[0]!.buildings.length).toBeGreaterThan(1);

  localStorage.removeItem('ttt_asset_library');
});

it('ignores malformed custom building overrides', () => {
  localStorage.setItem('ttt_asset_library', JSON.stringify({
    version: 1,
    entries: [
      {
        id: 'library_building_bad_1',
        type: 'building',
        name: 'Broken Building',
        seed: SEED_A,
        createdAt: 1,
        tags: ['dtype:building'],
        isCustom: true,
        thumbnail: null,
        data: {
          settlementId: 'broken',
          kind: 'not-a-kind',
          floors: 'bad',
          pos: { x: 'bad', z: null },
        },
      },
    ],
  }));

  expect(() => generateWorldPlan(SEED_A, { settlementCount: 1 })).not.toThrow();

  localStorage.removeItem('ttt_asset_library');
});
```

- [ ] **Step 2: Mirror the same failing cases in the JavaScript test file**

```js
it('uses custom settlement building overrides from the asset library when present', () => {
  localStorage.removeItem('ttt_asset_library');

  const baseline = generateWorldPlan(SEED_A, { settlementCount: 1 });
  const settlement = baseline.settlements[0];

  const customBuilding = {
    buildingId: 'bld-custom-1',
    settlementId: settlement.id,
    kind: 'inn',
    style: 'arcane',
    floors: 3,
    rotation: 1.25,
    seed: 424242,
    hasInterior: true,
    pos: { x: 21, y: 0, z: -13 },
  };

  localStorage.setItem('ttt_asset_library', JSON.stringify({
    version: 1,
    entries: [
      {
        id: 'library_building_custom_1',
        type: 'building',
        name: 'Custom Arcane Inn',
        seed: settlement.seed,
        createdAt: 1,
        tags: [`settlement:${settlement.id}`, 'building:bld-custom-1', 'dtype:building'],
        isCustom: true,
        thumbnail: null,
        data: customBuilding,
      },
    ],
  }));

  const overridden = generateWorldPlan(SEED_A, { settlementCount: 1 });
  const buildings = overridden.settlements[0].buildings;

  expect(buildings).toHaveLength(1);
  expect(buildings[0].id).toBe('bld-custom-1');
  expect(buildings[0].kind).toBe('inn');
  expect(buildings[0].style).toBe('arcane');

  localStorage.removeItem('ttt_asset_library');
});
```

- [ ] **Step 3: Run the targeted tests to verify failure**

Run: `npx vitest run tests/procedural/WorldGen.test.ts`
Expected: FAIL in the new building override cases because `WorldGen` does not yet read custom `building` entries

- [ ] **Step 4: Commit the red test state only if the repo workflow explicitly allows red commits; otherwise keep local and proceed**

```bash
git add tests/procedural/WorldGen.test.ts tests/procedural/WorldGen.test.js
git commit -m "test: add failing building override coverage for worldgen"
```

Expected: In most flows, **skip this commit** and continue directly to Task 2 so mainline stays green.

---

### Task 2: Implement `WorldGen` building override lookup

**Files:**
- Modify: `src/procedural/WorldGen.ts`
- Modify: `src/procedural/WorldGen.js`
- Test: `tests/procedural/WorldGen.test.ts`
- Test: `tests/procedural/WorldGen.test.js`

**Interfaces:**
- Consumes:
  - localStorage key `ttt_asset_library`
  - `PlacedBuilding`
  - `generateSettlementBuildings(settlementSeed, centerX, centerZ, count)`
- Produces:
  - `readCustomSettlementBuildingOverrides(settlementId: string, settlementSeed: number): PlacedBuilding[] | null`
  - updated `generateSettlementBuildings(settlementId: string, settlementSeed: number, centerX: number, centerZ: number, count: number): PlacedBuilding[]`

- [ ] **Step 1: Add helper validators to TypeScript `WorldGen.ts`**

```ts
function isBuildingKind(value: unknown): value is PlacedBuilding['kind'] {
  return value === 'house'
    || value === 'inn'
    || value === 'shop'
    || value === 'guild'
    || value === 'ruin'
    || value === 'well'
    || value === 'barn';
}

function isBuildingStyle(value: unknown): value is PlacedBuilding['style'] {
  return value === 'thatched'
    || value === 'stone'
    || value === 'timber'
    || value === 'arcane';
}

function isBuildingFloors(value: unknown): value is PlacedBuilding['floors'] {
  return value === 1 || value === 2 || value === 3;
}
```

- [ ] **Step 2: Add the TypeScript building override reader beside the NPC override reader**

```ts
function readCustomSettlementBuildingOverrides(
  settlementId: string,
  settlementSeed: number,
): PlacedBuilding[] | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    const raw = localStorage.getItem('ttt_asset_library');
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { entries?: unknown[] } | null;
    if (!parsed || !Array.isArray(parsed.entries)) return null;

    const matches: PlacedBuilding[] = [];

    for (const entry of parsed.entries) {
      if (!isPlainObject(entry)) continue;
      if (entry.type !== 'building' || entry.isCustom !== true) continue;

      const data = entry.data;
      if (!isPlainObject(data)) continue;

      const dataSettlementId = typeof data.settlementId === 'string' ? data.settlementId : null;
      const entrySeed = typeof entry.seed === 'number' ? entry.seed : null;
      const taggedToSettlement = Array.isArray(entry.tags)
        && entry.tags.some(tag => typeof tag === 'string' && tag === `settlement:${settlementId}`);

      if (dataSettlementId !== settlementId && !taggedToSettlement && entrySeed !== settlementSeed) continue;
      if (!isBuildingKind(data.kind) || !isBuildingStyle(data.style) || !isBuildingFloors(data.floors)) continue;
      if (!isPlainObject(data.pos)) continue;

      const px = typeof data.pos.x === 'number' ? data.pos.x : null;
      const py = typeof data.pos.y === 'number' ? data.pos.y : 0;
      const pz = typeof data.pos.z === 'number' ? data.pos.z : null;
      if (px === null || pz === null) continue;

      matches.push({
        id: typeof data.buildingId === 'string'
          ? data.buildingId
          : (typeof entry.id === 'string' ? entry.id : `bld-${settlementSeed}-custom-${matches.length}`),
        kind: data.kind,
        style: data.style,
        floors: data.floors,
        pos: { x: px, y: py, z: pz },
        rotation: typeof data.rotation === 'number' ? data.rotation : 0,
        seed: typeof data.seed === 'number'
          ? data.seed
          : (typeof entry.seed === 'number' ? entry.seed : ((settlementSeed ^ (matches.length * 0x9E3779B9)) >>> 0)),
        hasInterior: typeof data.hasInterior === 'boolean' ? data.hasInterior : data.kind !== 'well',
      });
    }

    if (matches.length === 0) return null;
    matches.sort((a, b) => a.seed - b.seed || a.id.localeCompare(b.id));
    return matches;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Apply the new override path in TypeScript building generation**

```ts
function generateSettlementBuildings(
  settlementId: string,
  settlementSeed: number,
  centerX: number,
  centerZ: number,
  count: number,
): PlacedBuilding[] {
  const overrides = readCustomSettlementBuildingOverrides(settlementId, settlementSeed);
  if (overrides && overrides.length > 0) return overrides;

  const r = mulberry32(settlementSeed ^ 0xBEEF_1234);
  const buildings: PlacedBuilding[] = [];

  for (let i = 0; i < count; i++) {
    const angle  = r() * Math.PI * 2;
    const radius = 8 + r() * 20;
    const kind   = BUILDING_KINDS[Math.floor(r() * BUILDING_KINDS.length)];
    const style  = BUILDING_STYLES[Math.floor(r() * BUILDING_STYLES.length)];
    const floors = ([1, 1, 1, 2, 2, 3][Math.floor(r() * 6)] ?? 1) as 1 | 2 | 3;

    buildings.push({
      id: `bld-${settlementSeed}-${i}`,
      kind,
      style,
      floors,
      pos: { x: centerX + Math.cos(angle) * radius, y: 0, z: centerZ + Math.sin(angle) * radius },
      rotation: r() * Math.PI * 2,
      seed: (settlementSeed ^ (i * 0x9E3779B9)) >>> 0,
      hasInterior: kind !== 'well',
    });
  }

  return buildings;
}
```

- [ ] **Step 4: Update the TypeScript call site that constructs each settlement**

```ts
const buildings = generateSettlementBuildings(
  settlementId,
  settlementSeed,
  settlementPos.x,
  settlementPos.z,
  buildingCount,
);
```

- [ ] **Step 5: Mirror the same behavior in `src/procedural/WorldGen.js`**

```js
function isBuildingKind(value) {
  return value === 'house'
    || value === 'inn'
    || value === 'shop'
    || value === 'guild'
    || value === 'ruin'
    || value === 'well'
    || value === 'barn';
}

function isBuildingStyle(value) {
  return value === 'thatched'
    || value === 'stone'
    || value === 'timber'
    || value === 'arcane';
}
```

```js
function generateSettlementBuildings(settlementId, settlementSeed, centerX, centerZ, count) {
  const overrides = readCustomSettlementBuildingOverrides(settlementId, settlementSeed);
  if (overrides && overrides.length > 0) return overrides;

  const r = mulberry32(settlementSeed ^ 0xBEEF_1234);
  const buildings = [];
  // existing generation loop unchanged
  return buildings;
}
```

- [ ] **Step 6: Run the targeted tests to verify the new behavior passes**

Run: `npx vitest run tests/procedural/WorldGen.test.ts`
Expected: PASS, including the new building override cases and the existing NPC override coverage

- [ ] **Step 7: Commit the runtime override implementation**

```bash
git add src/procedural/WorldGen.ts src/procedural/WorldGen.js tests/procedural/WorldGen.test.ts tests/procedural/WorldGen.test.js
git commit -m "feat: support custom building overrides in worldgen"
```

---

### Task 3: Enrich Overworld Studio building library saves with settlement/building identity metadata

**Files:**
- Modify: `src/overworld-studio.ts`
- Modify: `src/overworld-studio.js`
- Test: `tests/procedural/WorldGen.test.ts` (indirect coverage remains here)
- Optional docs: `TODO/01-overworld-studio/asset-library.md`

**Interfaces:**
- Consumes:
  - `_saveToLibrary(type, name, seed, data, tags?)`
  - current building modal state: `_bModalPlan`, `_bModalTitle`, `_bModalTags`
- Produces:
  - saved `building` entries that include settlement/building identity metadata usable by `WorldGen`

- [ ] **Step 1: Add modal-scoped building identity state in TypeScript**

```ts
let _bModalSettlementId: string | null = null;
let _bModalBuildingId: string | null = null;
let _bModalWardType: string | null = null;
```

- [ ] **Step 2: Extend the TypeScript building save payload**

```ts
saveBtn.addEventListener('click', () => {
  if (!_bModalPlan) return;

  const data = {
    ..._bModalPlan,
    settlementId: _bModalSettlementId,
    buildingId: _bModalBuildingId,
    wardType: _bModalWardType,
  };

  const tags = [..._bModalTags];
  if (_bModalSettlementId) tags.push(`settlement:${_bModalSettlementId}`);
  if (_bModalBuildingId) tags.push(`building:${_bModalBuildingId}`);
  if (_bModalWardType) tags.push(`ward:${_bModalWardType}`);

  _saveToLibrary('building', _bModalTitle, _bModalPlan.seed, data, tags);
});
```

- [ ] **Step 3: Extend the TypeScript modal entry point to accept identity context**

```ts
function showBuildingModal(
  plan: DungeonPlan,
  title: string,
  floors: number,
  opts: { settlementId?: string | null; buildingId?: string | null; wardType?: string | null } = {},
): void {
  _bModalSetup();
  if (!_bModal || !_bModalCanvas) return;

  _bModalPlan = plan;
  _bModalTitle = title;
  _bModalSettlementId = opts.settlementId ?? null;
  _bModalBuildingId = opts.buildingId ?? null;
  _bModalWardType = opts.wardType ?? null;
  _bModalTags = [
    'dtype:building',
    `floors:${floors}`,
    `startRoom:${plan.startRoomId}`,
  ];

  if (_bModalSettlementId) _bModalTags.push(`settlement:${_bModalSettlementId}`);
  if (_bModalBuildingId) _bModalTags.push(`building:${_bModalBuildingId}`);
  if (_bModalWardType) _bModalTags.push(`ward:${_bModalWardType}`);
}
```

- [ ] **Step 4: Update the TypeScript call site that opens the building modal**

```ts
showBuildingModal(plan, title, floors, {
  settlementId: currentModel?.id ?? null,
  buildingId: selectedBuilding?.id ?? null,
  wardType: selectedBuilding?.kind ?? null,
});
```

If the exact caller names differ, use the nearest existing settlement/building identity values already available at the modal launch point. Do **not** invent new global state if the caller already has the IDs.

- [ ] **Step 5: Mirror the same metadata changes in `src/overworld-studio.js`**

```js
let _bModalSettlementId = null;
let _bModalBuildingId = null;
let _bModalWardType = null;
```

```js
const data = {
  ..._bModalPlan,
  settlementId: _bModalSettlementId,
  buildingId: _bModalBuildingId,
  wardType: _bModalWardType,
};
```

- [ ] **Step 6: Optionally update the Asset Library TODO contract if the slice is now fully true**

```md
- [x] Extend runtime override lookup beyond settlement NPCs (buildings / rooms / broader named locations)
```

If only **buildings** are implemented, prefer this exact narrower wording instead:

```md
- [x] Extend runtime override lookup to custom settlement buildings
- [ ] Extend runtime override lookup beyond buildings to rooms / broader named locations
```

- [ ] **Step 7: Run focused tests plus a type-safe smoke check**

Run: `npx vitest run tests/procedural/WorldGen.test.ts`
Expected: PASS

Run: `npm test -- --runInBand tests/procedural/WorldGen.test.ts`
Expected: project-local test wrapper passes if configured; if not configured, document and skip

- [ ] **Step 8: Commit the studio metadata enrichment**

```bash
git add src/overworld-studio.ts src/overworld-studio.js TODO/01-overworld-studio/asset-library.md
git commit -m "feat: tag building library entries for runtime overrides"
```

---

### Task 4: Final verification and slice cleanup

**Files:**
- Verify: `src/procedural/WorldGen.ts`
- Verify: `src/procedural/WorldGen.js`
- Verify: `src/overworld-studio.ts`
- Verify: `src/overworld-studio.js`
- Verify: `tests/procedural/WorldGen.test.ts`
- Verify: `tests/procedural/WorldGen.test.js`
- Optional docs: `TODO/01-overworld-studio/asset-library.md`

**Interfaces:**
- Consumes: all previous tasks
- Produces: a clean, verified implementation slice ready for review

- [ ] **Step 1: Run the exact final verification commands**

Run: `npx vitest run tests/procedural/WorldGen.test.ts`
Expected: PASS

Run: `git status --short`
Expected: only the intended files for this slice are modified or newly committed

- [ ] **Step 2: Inspect the final diff for accidental scope growth**

Run: `git --no-pager diff --stat HEAD~2..HEAD`
Expected: changes limited to `WorldGen`, `overworld-studio`, tests, and optional asset-library doc

- [ ] **Step 3: Make the final green commit if earlier tasks were squashed locally**

```bash
git add src/procedural/WorldGen.ts src/procedural/WorldGen.js src/overworld-studio.ts src/overworld-studio.js tests/procedural/WorldGen.test.ts tests/procedural/WorldGen.test.js TODO/01-overworld-studio/asset-library.md
git commit -m "feat: support building asset-library runtime overrides"
```

- [ ] **Step 4: Record verification output in the PR/handoff note**

```md
Verified with:
- `npx vitest run tests/procedural/WorldGen.test.ts`
- custom settlement NPC override test still passing
- custom settlement building override tests passing
```

---

## Self-Review

### Spec coverage
- Runtime override reader for buildings: covered in Task 2
- Matching strategy and reconstruction rules: covered in Task 2
- Studio metadata/tag enrichment: covered in Task 3
- Focused tests: covered in Task 1 and Task 2
- Narrow scope/no UI expansion: preserved across all tasks

### Placeholder scan
- No `TBD`, `TODO`, or “implement later” placeholders remain
- Commands are explicit
- Code snippets are concrete
- Optional doc update is constrained with exact wording

### Type consistency
- `readCustomSettlementBuildingOverrides(...)` signature is consistent
- `generateSettlementBuildings(...)` widened signature is referenced consistently
- Produced building payload fields match the spec: `buildingId`, `settlementId`, `kind`, `style`, `floors`, `pos`, `rotation`, `seed`, `hasInterior`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-27-building-asset-library-runtime-overrides.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?