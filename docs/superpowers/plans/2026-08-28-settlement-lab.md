# Settlement Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a "Settlement Lab" dev-room — a small, self-contained sandbox scene reachable from the Overworld Studio — where settlement generation (buildings, roads, lamps, faction/layout variety) can be iterated on and playtested in isolation from the live, currently-broken overworld.

**Architecture:** Extract the settlement-rendering logic that currently lives inline inside `OverworldScene._buildSettlements()` into a new, stateless, reusable `SettlementRenderer.ts` module (plus three smaller free-function extractions it depends on). Build a new `SettlementLabScene.ts` — modeled directly on the existing, working `WaterLabScene.ts` — that uses a synthetic flat `WorldGrid` and a single flat terrain collider (no chunk streaming) to host `SettlementRenderer` output. Wire it into the existing dev-room launch machinery (`DevRoomHandoff.ts`, `main.ts`, `overworld-studio.ts`/`.html`) by generalizing the current Water-Lab-only single-value logic to support multiple dev rooms.

**Tech Stack:** TypeScript, Three.js, Rapier physics (`PhysicsWorld.ts`), Vitest for unit tests, Playwright for e2e dev-room-launch smoke tests. No new dependencies.

## Global Constraints

- Reuse existing, already-tested machinery — do not rebuild the settlement generator, building builder, or physics wrapper. Only extract/reuse.
- `OverworldScene._buildSettlements()`'s visual/collider output must be byte-for-byte equivalent before and after its refactor to call `SettlementRenderer` (parity test required).
- The lab uses a small synthetic flat terrain (single mesh + one `PhysicsWorld.createStaticBox()` collider) — do NOT depend on `TerrainGeometryBuilder`/chunk-streaming terrain.
- Faction selection in the lab always uses the lab's own dropdown selection (ignore the plan's stored faction) — resolves spec Open Question 3.
- `layout` becomes an additive, optional, backward-compatible parameter on `SettlementGenerator.planSettlement()` — existing callers must be unaffected (default `'auto'`).
- Follow TDD: write the failing test first for every code step, per project norm.
- No unverified completion claims — every task ends with a real test run whose output is shown, and the final task requires a manual playtest before being marked done.

---

### Task 1: Extract `mergeGroupMeshesByMaterial()` into `MeshMergeUtils.ts`

**Files:**
- Create: `src/scene/MeshMergeUtils.ts`
- Modify: `src/scene/OverworldScene.ts:1259-1311` (delete method body, replace call sites), and call sites at lines `1210`, `2562`, `2651`
- Test: `tests/scene/MeshMergeUtils.test.ts`

**Interfaces:**
- Produces: `export function mergeGroupMeshesByMaterial(group: THREE.Group): void` — mutates the group in place, merging child meshes that share a material into fewer draw calls (identical behavior to the current private method).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/scene/MeshMergeUtils.test.ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mergeGroupMeshesByMaterial } from '../../src/scene/MeshMergeUtils';

describe('mergeGroupMeshesByMaterial', () => {
  it('merges multiple meshes sharing one material into a single mesh', () => {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
      mesh.position.set(i, 0, 0);
      group.add(mesh);
    }
    mergeGroupMeshesByMaterial(group);
    const meshes = group.children.filter((c) => (c as THREE.Mesh).isMesh);
    expect(meshes.length).toBe(1);
  });

  it('leaves meshes with different materials unmerged', () => {
    const group = new THREE.Group();
    const matA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const matB = new THREE.MeshStandardMaterial({ color: 0x0000ff });
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matA));
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matB));
    mergeGroupMeshesByMaterial(group);
    const meshes = group.children.filter((c) => (c as THREE.Mesh).isMesh);
    expect(meshes.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scene/MeshMergeUtils.test.ts`
Expected: FAIL with "Cannot find module '../../src/scene/MeshMergeUtils'"

- [ ] **Step 3: Create `src/scene/MeshMergeUtils.ts` with the extracted body**

Copy the exact current body of `OverworldScene._mergeGroupMeshesByMaterial()` (lines 1259-1311 of `src/scene/OverworldScene.ts`) into the new file as a named export, changing `private _mergeGroupMeshesByMaterial(group: THREE.Group)` to `export function mergeGroupMeshesByMaterial(group: THREE.Group): void`, and adding the necessary `import * as THREE from 'three';` at the top. Do not alter any logic inside the body — this is a pure extraction.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scene/MeshMergeUtils.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Update call sites in `OverworldScene.ts`**

Delete the old `_mergeGroupMeshesByMaterial()` private method body (lines 1259-1311) and replace with nothing (remove the method entirely). Add `import { mergeGroupMeshesByMaterial } from './MeshMergeUtils';` near the top of `OverworldScene.ts`. Replace each call site:
- Line 1210: `this._mergeGroupMeshesByMaterial(group)` → `mergeGroupMeshesByMaterial(group)`
- Line 2562: `this._mergeGroupMeshesByMaterial(group)` → `mergeGroupMeshesByMaterial(group)`
- Line 2651: `this._mergeGroupMeshesByMaterial(group)` → `mergeGroupMeshesByMaterial(group)`

(Adjust the exact argument name at each call site to match what is actually passed there — inspect each line before editing.)

- [ ] **Step 6: Run full scene test suite to confirm no regression**

Run: `npx vitest run tests/scene/`
Expected: PASS, same pass count as before this task (no new failures)

- [ ] **Step 7: Commit**

```bash
git add src/scene/MeshMergeUtils.ts src/scene/OverworldScene.ts tests/scene/MeshMergeUtils.test.ts
git commit -m "refactor: extract mergeGroupMeshesByMaterial to MeshMergeUtils"
```

---

### Task 2: Extract `makeLampPost()` into `LampPostFactory.ts`

**Files:**
- Create: `src/scene/LampPostFactory.ts`
- Modify: `src/scene/OverworldScene.ts:2916-2939` (delete method, replace call site at line `2675`)
- Test: `tests/scene/LampPostFactory.test.ts`

**Interfaces:**
- Produces: `export function makeLampPost(): THREE.Group` — identical behavior to the current private method, returns a new lamp-post mesh group each call.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/scene/LampPostFactory.test.ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeLampPost } from '../../src/scene/LampPostFactory';

describe('makeLampPost', () => {
  it('returns a THREE.Group with at least one mesh child', () => {
    const lamp = makeLampPost();
    expect(lamp).toBeInstanceOf(THREE.Group);
    const meshCount = lamp.children.filter((c) => (c as THREE.Mesh).isMesh).length;
    expect(meshCount).toBeGreaterThan(0);
  });

  it('returns a fresh, independent group on each call', () => {
    const lampA = makeLampPost();
    const lampB = makeLampPost();
    expect(lampA).not.toBe(lampB);
    lampA.position.set(5, 0, 0);
    expect(lampB.position.x).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scene/LampPostFactory.test.ts`
Expected: FAIL with "Cannot find module '../../src/scene/LampPostFactory'"

- [ ] **Step 3: Create `src/scene/LampPostFactory.ts` with the extracted body**

Copy the exact current body of `OverworldScene._makeLampPost()` (lines 2916-2939 of `src/scene/OverworldScene.ts`) into the new file as `export function makeLampPost(): THREE.Group { ... }`, with the required `import * as THREE from 'three';`. Pure extraction — no logic changes. If the original method references `this` for anything (e.g. a shared texture/material cache), inline that dependency into the function body instead (read the method body first to confirm whether it is fully self-contained; the design spec assumed it is).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scene/LampPostFactory.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Update call site in `OverworldScene.ts`**

Delete the `_makeLampPost()` private method. Add `import { makeLampPost } from './LampPostFactory';`. Replace the call at line 2675 (`this._makeLampPost()`) with `makeLampPost()`.

- [ ] **Step 6: Run full scene test suite to confirm no regression**

Run: `npx vitest run tests/scene/`
Expected: PASS, same pass count as Task 1's baseline

- [ ] **Step 7: Commit**

```bash
git add src/scene/LampPostFactory.ts src/scene/OverworldScene.ts tests/scene/LampPostFactory.test.ts
git commit -m "refactor: extract makeLampPost to LampPostFactory"
```

---

### Task 3: Extract `mapStudioFactionToRuntimeFaction()` into `BuildingTypeMap.ts`

**Files:**
- Create: nothing new — add to existing `src/world/buildings/BuildingTypeMap.ts`
- Modify: `src/scene/OverworldScene.ts:2490-2503` (delete method, replace call sites at lines `2518`, `2639`)
- Test: `tests/world/buildings/BuildingTypeMap.test.ts` (extend if it exists, else create)

**Interfaces:**
- Consumes: `Faction` type and `FACTION_PRESETS` from `src/world/buildings/BuildingDNA.ts` (already imported by `BuildingTypeMap.ts`).
- Produces: `export function mapStudioFactionToRuntimeFaction(studioFaction: string): Faction` — identical behavior to the current private method, placed alongside the existing `settlementTypeToFaction` free function in `BuildingTypeMap.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/world/buildings/BuildingTypeMap.test.ts (add to existing file, or create if absent)
import { describe, it, expect } from 'vitest';
import { mapStudioFactionToRuntimeFaction } from '../../../src/world/buildings/BuildingTypeMap';

describe('mapStudioFactionToRuntimeFaction', () => {
  it('maps a known studio faction string to a valid runtime Faction', () => {
    // Use one concrete studio faction id verified from OverworldScene's current
    // call sites/tests before writing — inspect an existing OverworldScene test
    // that exercises _mapStudioFactionToRuntimeFaction for a real example value.
    const result = mapStudioFactionToRuntimeFaction('empire');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('falls back to a default Faction for an unrecognized studio faction string', () => {
    const result = mapStudioFactionToRuntimeFaction('totally-unknown-faction-xyz');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/buildings/BuildingTypeMap.test.ts`
Expected: FAIL with "mapStudioFactionToRuntimeFaction is not a function" (or "Cannot find module" if the test file is new)

- [ ] **Step 3: Add the extracted function to `BuildingTypeMap.ts`**

Copy the exact current body of `OverworldScene._mapStudioFactionToRuntimeFaction()` (lines 2490-2503) into `src/world/buildings/BuildingTypeMap.ts` as `export function mapStudioFactionToRuntimeFaction(studioFaction: string): Faction { ... }`. Before writing, open both the method body and the two real call sites (lines 2518, 2639) to confirm the exact input type/shape passed in (it may be a studio settlement object field rather than a bare string — adjust the function signature and the test's input value to match exactly what is read from the real code, not the placeholder `'empire'` string above).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/buildings/BuildingTypeMap.test.ts`
Expected: PASS

- [ ] **Step 5: Update call sites in `OverworldScene.ts`**

Delete the `_mapStudioFactionToRuntimeFaction()` private method. Add `mapStudioFactionToRuntimeFaction` to the existing `BuildingTypeMap` import in `OverworldScene.ts`. Replace both call sites (lines 2518, 2639) from `this._mapStudioFactionToRuntimeFaction(...)` to `mapStudioFactionToRuntimeFaction(...)`.

- [ ] **Step 6: Run full scene + world test suites to confirm no regression**

Run: `npx vitest run tests/scene/ tests/world/`
Expected: PASS, no new failures vs. Task 2's baseline

- [ ] **Step 7: Commit**

```bash
git add src/world/buildings/BuildingTypeMap.ts src/scene/OverworldScene.ts tests/world/buildings/BuildingTypeMap.test.ts
git commit -m "refactor: extract mapStudioFactionToRuntimeFaction to BuildingTypeMap"
```

---

### Task 4: Add optional `layout` parameter to `SettlementGenerator.planSettlement()`

**Files:**
- Modify: `src/world/SettlementGenerator.ts:66-105`
- Test: `tests/world/SettlementGenerator.test.ts` (extend existing)

**Interfaces:**
- Consumes: existing `LayoutType` type already defined/imported in `SettlementGenerator.ts` (used internally by `buildSettlement()`).
- Produces: `planSettlement(params: { seed: number; type: SettlementType; faction?: string; layout?: LayoutType; /* ...existing fields unchanged... */ }): SettlementPlan` — `layout` is optional and defaults to `'auto'`, fully backward compatible with every existing call site.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/world/SettlementGenerator.test.ts (add to existing describe block)
import { planSettlement } from '../../src/world/SettlementGenerator';

it('defaults to auto layout when layout is omitted (backward compatible)', () => {
  const plan = planSettlement({ seed: 42, type: 'village' /* ...other existing required fields, matching current tests in this file... */ });
  expect(plan).toBeDefined();
});

it('accepts an explicit layout override and produces a plan without throwing', () => {
  const plan = planSettlement({ seed: 42, type: 'village', layout: 'grid' /* ...other existing required fields... */ });
  expect(plan).toBeDefined();
});
```

Before finalizing this test, open `tests/world/SettlementGenerator.test.ts` to copy the exact full set of required fields an existing passing test already uses for `planSettlement(...)`, and use that same full parameter object (with `layout` added) rather than the abbreviated placeholder above — the goal is a real, runnable test matching the current call signature exactly.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/SettlementGenerator.test.ts`
Expected: FAIL (TypeScript error or thrown error) because `layout` is not yet accepted as an input param that flows through to `buildSettlement()`

- [ ] **Step 3: Add the parameter**

In `src/world/SettlementGenerator.ts`, add `layout?: LayoutType;` to `planSettlement()`'s params type/interface. Inside the function body (around line 78), change the hardcoded `layout: 'auto'` in the internal `buildSettlement({ seed, type, layout: 'auto', faction: planFaction, warp: 0.35, ...params })` call to `layout: params.layout ?? 'auto'` (adjust the exact destructured variable name to match what the real function body uses — reread lines 66-105 before editing to get the precise local variable names right).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/SettlementGenerator.test.ts`
Expected: PASS

- [ ] **Step 5: Run full world test suite to confirm no regression**

Run: `npx vitest run tests/world/`
Expected: PASS, no new failures

- [ ] **Step 6: Commit**

```bash
git add src/world/SettlementGenerator.ts tests/world/SettlementGenerator.test.ts
git commit -m "feat: add optional layout parameter to planSettlement"
```

---

### Task 5: Create `SettlementRenderer.ts`

**Files:**
- Create: `src/scene/SettlementRenderer.ts`
- Test: `tests/scene/SettlementRenderer.test.ts`

**Interfaces:**
- Consumes:
  - `createSettlementBuildingDna(b, settlementType, faction): BuildingDNA | null` from `src/world/buildings/BuildingTypeMap.ts`
  - `settlementTypeToFaction(type): Faction` and `mapStudioFactionToRuntimeFaction(studioFaction): Faction` from `src/world/buildings/BuildingTypeMap.ts` (the latter added in Task 3)
  - `selectLampRoadTiles(roads, stride): RoadSegment[]` from `src/world/LampPlacement.ts`
  - `mergeGroupMeshesByMaterial(group: THREE.Group): void` from `src/scene/MeshMergeUtils.ts` (Task 1)
  - `makeLampPost(): THREE.Group` from `src/scene/LampPostFactory.ts` (Task 2)
  - `buildBuilding(dna): BuildingInstance` from `src/world/buildings/BuildingBuilder.ts`, where `BuildingInstance` has `{ exteriorGroup: THREE.Group; bounds: BuildingBounds; dna: BuildingDNA; dispose(): void }`
  - A `SettlementPlan` value (return type of `planSettlement()`, from `src/world/SettlementGenerator.ts`)
- Produces:
  ```typescript
  export interface SettlementRenderContext {
    scene: THREE.Scene;
    registerBuildingCollider: (building: BuildingInstance, worldX: number, worldZ: number, rotationY: number) => void;
    mapFaction: (studioFaction: string) => Faction;
  }
  export interface SettlementRenderResult {
    group: THREE.Group;          // parent group added to ctx.scene, holds all building/road/lamp meshes
    buildings: BuildingInstance[];
    roadTileCount: number;
    lampCount: number;
    dispose: () => void;         // removes group from scene, disposes every BuildingInstance
  }
  export function renderSettlementPlan(plan: SettlementPlan, ctx: SettlementRenderContext): SettlementRenderResult;
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// tests/scene/SettlementRenderer.test.ts
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { renderSettlementPlan } from '../../src/scene/SettlementRenderer';
import { planSettlement } from '../../src/world/SettlementGenerator';

describe('renderSettlementPlan', () => {
  it('renders a settlement plan into a group with at least one building', () => {
    const plan = planSettlement({ seed: 7, type: 'village' /* ...match real required fields from SettlementGenerator.test.ts... */ });
    const scene = new THREE.Scene();
    const registerBuildingCollider = vi.fn();
    const mapFaction = vi.fn(() => 'empire' as const);

    const result = renderSettlementPlan(plan, { scene, registerBuildingCollider, mapFaction });

    expect(result.buildings.length).toBeGreaterThan(0);
    expect(scene.children).toContain(result.group);
    expect(registerBuildingCollider).toHaveBeenCalledTimes(result.buildings.length);
  });

  it('dispose() removes the group from the scene and disposes every building', () => {
    const plan = planSettlement({ seed: 7, type: 'village' /* ...match real required fields... */ });
    const scene = new THREE.Scene();
    const registerBuildingCollider = vi.fn();
    const mapFaction = vi.fn(() => 'empire' as const);

    const result = renderSettlementPlan(plan, { scene, registerBuildingCollider, mapFaction });
    const disposeSpies = result.buildings.map((b) => vi.spyOn(b, 'dispose'));

    result.dispose();

    expect(scene.children).not.toContain(result.group);
    disposeSpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  });
});
```

Before finalizing, copy the exact required `planSettlement()` params from `tests/world/SettlementGenerator.test.ts` (Task 4's file) rather than the abbreviated placeholder shown.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scene/SettlementRenderer.test.ts`
Expected: FAIL with "Cannot find module '../../src/scene/SettlementRenderer'"

- [ ] **Step 3: Implement `SettlementRenderer.ts`**

Before writing this file, re-open `src/scene/OverworldScene.ts:2589-2696` (the current `_buildSettlements()` body) side-by-side and port its building/road/lamp construction logic line-for-line into `renderSettlementPlan()`, replacing:
- every `this.registerBuildingCollider(...)` call with `ctx.registerBuildingCollider(...)`
- every `this._mapStudioFactionToRuntimeFaction(...)` / faction-lookup call with `ctx.mapFaction(...)`
- every `this._mergeGroupMeshesByMaterial(group)` with the imported `mergeGroupMeshesByMaterial(group)`
- every `this._makeLampPost()` with the imported `makeLampPost()`
- `this.scene.add(...)` with `ctx.scene.add(...)`

Accumulate every created `BuildingInstance` into a `buildings: BuildingInstance[]` array, count road tiles processed and lamps placed into `roadTileCount`/`lampCount`, and create one top-level `THREE.Group` (add all building/road/lamp meshes as children of it, add it to `ctx.scene` once at the end). Implement `dispose()` to call `ctx.scene.remove(group)` then `buildings.forEach((b) => b.dispose())`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scene/SettlementRenderer.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/scene/SettlementRenderer.ts tests/scene/SettlementRenderer.test.ts
git commit -m "feat: add SettlementRenderer for reusable settlement rendering"
```

---

### Task 6: Refactor `OverworldScene._buildSettlements()` to call `SettlementRenderer`

**Files:**
- Modify: `src/scene/OverworldScene.ts:2589-2696`
- Test: `tests/scene/OverworldScene.settlement-parity.test.ts` (new)

**Interfaces:**
- Consumes: `renderSettlementPlan` and its types from Task 5.

- [ ] **Step 1: Write the failing parity test**

```typescript
// tests/scene/OverworldScene.settlement-parity.test.ts
// Modeled on tests/scene/OverworldScene.drawcall-batching.test.ts's construction pattern
// (PhysicsWorld + PlayerController + DEFAULT_PLAYER_DNA + buildWorldData() + DEFAULT_WORLD_GEN_CONFIG).
import { describe, it, expect } from 'vitest';
// ... import the same setup helpers as OverworldScene.drawcall-batching.test.ts uses ...

describe('OverworldScene settlement rendering parity', () => {
  it('produces the same building and road/lamp counts before and after the SettlementRenderer refactor, for a fixed seed', () => {
    // Build an OverworldScene instance the same way OverworldScene.drawcall-batching.test.ts does,
    // with a fixed world-gen seed known to place at least one settlement.
    // Record: number of registered building colliders, number of meshes in the settlement group,
    // number of lamp posts placed.
    // This test is written BEFORE the refactor (Step 1) to capture the CURRENT (pre-refactor) counts
    // as the expected baseline, then re-run unchanged AFTER the refactor (Step 3) to prove parity.
  });
});
```

Before writing this test's body for real, open `tests/scene/OverworldScene.drawcall-batching.test.ts` in full and copy its exact scene-construction boilerplate (imports, `PhysicsWorld`, `PlayerController`, `DEFAULT_PLAYER_DNA`, `buildWorldData()`, `DEFAULT_WORLD_GEN_CONFIG`) so this test actually runs, then call whatever `OverworldScene` method/constructor triggers settlement building for a seed confirmed (via that same reference test or a quick manual `console.log` of `worldData.settlements`) to contain at least one settlement.

- [ ] **Step 2: Run test to record the pre-refactor baseline**

Run: `npx vitest run tests/scene/OverworldScene.settlement-parity.test.ts`
Expected: PASS — this run establishes the current (pre-refactor) counts as the recorded baseline values; hardcode those observed counts as the test's assertions if the test doesn't already compute an internal before/after comparison.

- [ ] **Step 3: Refactor `_buildSettlements()` to delegate to `renderSettlementPlan()`**

In `src/scene/OverworldScene.ts`, replace the body of `_buildSettlements()` (lines 2589-2696) with a call to `renderSettlementPlan(plan, { scene: this.scene, registerBuildingCollider: (b, x, z, rot) => this.registerBuildingCollider(b, x, z, rot), mapFaction: (f) => mapStudioFactionToRuntimeFaction(f) })`, storing the returned `SettlementRenderResult` on an instance field (e.g. `this._settlementRenderResults: SettlementRenderResult[] = []`) so it can later be disposed if settlements are ever torn down/rebuilt. Preserve any existing per-settlement loop structure (if `_buildSettlements()` iterates multiple settlements, call `renderSettlementPlan()` once per settlement plan, matching the current loop).

- [ ] **Step 4: Run test to verify parity holds after the refactor**

Run: `npx vitest run tests/scene/OverworldScene.settlement-parity.test.ts`
Expected: PASS — same counts as the Step 2 baseline

- [ ] **Step 5: Run full scene test suite to confirm no other regression**

Run: `npx vitest run tests/scene/`
Expected: PASS, no new failures vs. Task 3's baseline

- [ ] **Step 6: Commit**

```bash
git add src/scene/OverworldScene.ts tests/scene/OverworldScene.settlement-parity.test.ts
git commit -m "refactor: OverworldScene._buildSettlements delegates to SettlementRenderer"
```

---

### Task 7: Create `SettlementLabPanel.ts` control panel UI

**Files:**
- Create: `src/ui/SettlementLabPanel.ts`
- Test: `tests/ui/SettlementLabPanel.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface SettlementLabPanelOptions {
    initialSeed: number;
    settlementTypes: string[];   // e.g. every SettlementType value
    factions: string[];          // Object.keys(FACTION_PRESETS) from BuildingDNA.ts
    layouts: string[];           // every LayoutType value
    onRegenerate: (params: { seed: number; type: string; faction: string; layout: string }) => void;
  }
  export class SettlementLabPanel {
    constructor(options: SettlementLabPanelOptions);
    readonly rootEl: HTMLElement;   // attach this to document.body or a container
    setReadout(text: string): void; // updates a live status line, e.g. "12 buildings, 340 road tiles, 6 lamps"
    dispose(): void;                // removes rootEl from DOM, detaches listeners
  }
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ui/SettlementLabPanel.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SettlementLabPanel } from '../../src/ui/SettlementLabPanel';

describe('SettlementLabPanel', () => {
  it('calls onRegenerate with current seed/type/faction/layout when the regenerate button is clicked', () => {
    const onRegenerate = vi.fn();
    const panel = new SettlementLabPanel({
      initialSeed: 123,
      settlementTypes: ['village', 'town'],
      factions: ['empire', 'nomads'],
      layouts: ['auto', 'grid'],
      onRegenerate,
    });
    document.body.appendChild(panel.rootEl);

    const button = panel.rootEl.querySelector('button[data-action="regenerate"]') as HTMLButtonElement;
    button.click();

    expect(onRegenerate).toHaveBeenCalledWith(
      expect.objectContaining({ seed: 123, type: 'village', faction: 'empire', layout: 'auto' })
    );
    panel.dispose();
  });

  it('setReadout updates the visible readout text', () => {
    const panel = new SettlementLabPanel({
      initialSeed: 1,
      settlementTypes: ['village'],
      factions: ['empire'],
      layouts: ['auto'],
      onRegenerate: vi.fn(),
    });
    panel.setReadout('5 buildings, 20 road tiles, 2 lamps');
    const readoutEl = panel.rootEl.querySelector('[data-role="readout"]') as HTMLElement;
    expect(readoutEl.textContent).toContain('5 buildings');
    panel.dispose();
  });

  it('dispose removes rootEl from the DOM', () => {
    const panel = new SettlementLabPanel({
      initialSeed: 1,
      settlementTypes: ['village'],
      factions: ['empire'],
      layouts: ['auto'],
      onRegenerate: vi.fn(),
    });
    document.body.appendChild(panel.rootEl);
    panel.dispose();
    expect(document.body.contains(panel.rootEl)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/SettlementLabPanel.test.ts`
Expected: FAIL with "Cannot find module '../../src/ui/SettlementLabPanel'"

- [ ] **Step 3: Implement `SettlementLabPanel.ts`**

```typescript
export interface SettlementLabPanelOptions {
  initialSeed: number;
  settlementTypes: string[];
  factions: string[];
  layouts: string[];
  onRegenerate: (params: { seed: number; type: string; faction: string; layout: string }) => void;
}

export class SettlementLabPanel {
  readonly rootEl: HTMLElement;
  private _seedInput: HTMLInputElement;
  private _typeSelect: HTMLSelectElement;
  private _factionSelect: HTMLSelectElement;
  private _layoutSelect: HTMLSelectElement;
  private _readoutEl: HTMLElement;
  private _onRegenerate: SettlementLabPanelOptions['onRegenerate'];
  private _regenClickHandler: () => void;
  private _randomizeClickHandler: () => void;

  constructor(options: SettlementLabPanelOptions) {
    this._onRegenerate = options.onRegenerate;

    this.rootEl = document.createElement('div');
    this.rootEl.className = 'settlement-lab-panel';

    this._seedInput = document.createElement('input');
    this._seedInput.type = 'number';
    this._seedInput.value = String(options.initialSeed);
    this._seedInput.setAttribute('data-role', 'seed-input');

    const randomizeBtn = document.createElement('button');
    randomizeBtn.textContent = 'Randomize Seed';
    randomizeBtn.setAttribute('data-action', 'randomize');
    this._randomizeClickHandler = () => {
      this._seedInput.value = String(Math.floor(Math.random() * 1_000_000));
    };
    randomizeBtn.addEventListener('click', this._randomizeClickHandler);

    this._typeSelect = document.createElement('select');
    this._typeSelect.setAttribute('data-role', 'type-select');
    for (const t of options.settlementTypes) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      this._typeSelect.appendChild(opt);
    }

    this._factionSelect = document.createElement('select');
    this._factionSelect.setAttribute('data-role', 'faction-select');
    for (const f of options.factions) {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      this._factionSelect.appendChild(opt);
    }

    this._layoutSelect = document.createElement('select');
    this._layoutSelect.setAttribute('data-role', 'layout-select');
    for (const l of options.layouts) {
      const opt = document.createElement('option');
      opt.value = l;
      opt.textContent = l;
      this._layoutSelect.appendChild(opt);
    }

    const regenBtn = document.createElement('button');
    regenBtn.textContent = 'Regenerate';
    regenBtn.setAttribute('data-action', 'regenerate');
    this._regenClickHandler = () => {
      this._onRegenerate({
        seed: Number(this._seedInput.value),
        type: this._typeSelect.value,
        faction: this._factionSelect.value,
        layout: this._layoutSelect.value,
      });
    };
    regenBtn.addEventListener('click', this._regenClickHandler);

    this._readoutEl = document.createElement('div');
    this._readoutEl.setAttribute('data-role', 'readout');

    this.rootEl.appendChild(this._seedInput);
    this.rootEl.appendChild(randomizeBtn);
    this.rootEl.appendChild(this._typeSelect);
    this.rootEl.appendChild(this._factionSelect);
    this.rootEl.appendChild(this._layoutSelect);
    this.rootEl.appendChild(regenBtn);
    this.rootEl.appendChild(this._readoutEl);
  }

  setReadout(text: string): void {
    this._readoutEl.textContent = text;
  }

  dispose(): void {
    this.rootEl.remove();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/SettlementLabPanel.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/SettlementLabPanel.ts tests/ui/SettlementLabPanel.test.ts
git commit -m "feat: add SettlementLabPanel control UI"
```

---

### Task 8: Create `SettlementLabScene.ts`

**Files:**
- Create: `src/scene/SettlementLabScene.ts`
- Test: `tests/scene/SettlementLabScene.test.ts`

**Interfaces:**
- Consumes:
  - `WorldGrid` constructor `new WorldGrid(width: number, height: number)`, `tileUnit` public readonly field, from `src/world/WorldGrid.ts`
  - `PhysicsWorld.createStaticBox(...)` and `PhysicsWorld.removeBody(...)` from `src/physics/PhysicsWorld.ts` (exact signatures as used in `WaterLabScene.ts`)
  - `planSettlement()` (Task 4) and `renderSettlementPlan()` (Task 5)
  - `SettlementLabPanel` (Task 7)
  - `applySettlementToGrid()` — the existing function used by the live world generator to stamp a `SettlementPlan` onto a `WorldGrid` (locate its current module/signature in `src/world/` before use; it is referenced in the design spec as already existing for this exact purpose)
- Produces:
  ```typescript
  export class SettlementLabScene {
    constructor(scene: THREE.Scene, physics: PhysicsWorld, player: PlayerController);
    enter(): void;
    exit(): void;
    update(dt: number): void;
  }
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// tests/scene/SettlementLabScene.test.ts
// Modeled on any existing WaterLabScene test pattern (check tests/scene/ for one; if none exists,
// construct the same PhysicsWorld/PlayerController/DEFAULT_PLAYER_DNA setup used in
// tests/scene/OverworldScene.drawcall-batching.test.ts).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SettlementLabScene } from '../../src/scene/SettlementLabScene';
// ... import PhysicsWorld, PlayerController, DEFAULT_PLAYER_DNA as in the reference test ...

describe('SettlementLabScene', () => {
  it('enter() builds at least one building without throwing, exit() tears it down cleanly', () => {
    const scene = new THREE.Scene();
    // const physics = new PhysicsWorld(); const player = new PlayerController(...DEFAULT_PLAYER_DNA...);
    // const lab = new SettlementLabScene(scene, physics, player);
    // lab.enter();
    // expect(scene.children.length).toBeGreaterThan(0);
    // lab.exit();
    // expect(scene.children.length).toBe(0); // or back to pre-enter baseline count
  });
});
```

Before finalizing this test, open `src/scene/WaterLabScene.ts` in full (already re-read this session, lines 1-330) and mirror its exact constructor/enter/exit lifecycle test pattern if a `WaterLabScene.test.ts` exists; if none exists, base the test scaffolding directly on `tests/scene/OverworldScene.drawcall-batching.test.ts`'s `PhysicsWorld`/`PlayerController`/`DEFAULT_PLAYER_DNA` construction, since that is the confirmed-working pattern for constructing these dependencies in a unit test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scene/SettlementLabScene.test.ts`
Expected: FAIL with "Cannot find module '../../src/scene/SettlementLabScene'"

- [ ] **Step 3: Implement `SettlementLabScene.ts`**

Model the class shape exactly on `WaterLabScene.ts`: a `_entered: boolean` guard field, constructor storing `_scene`, `_physics`, `_player` (no `_particles` needed), and:
- `enter()`: guard on `_entered`; create `new WorldGrid(64, 64)` (a small fixed lab size); build a flat ground `THREE.Mesh` (e.g. `THREE.PlaneGeometry(64 * grid.tileUnit, 64 * grid.tileUnit)`) added to `_scene`; create one `physics.createStaticBox(...)` collider sized to match the ground plane, storing the returned body reference on an instance field (e.g. `this._groundBody`) for later removal; construct the `SettlementLabPanel` with `onRegenerate` wired to a private `_regenerate(params)` method; call `_regenerate()` once with default params to populate the initial settlement.
- `_regenerate(params)`: if a previous `SettlementRenderResult` exists on an instance field, call its `dispose()` first; call `planSettlement({ seed: params.seed, type: params.type, layout: params.layout, ... })`; call `applySettlementToGrid(this._grid, plan)` (confirm exact signature by reading its current definition before use); call `renderSettlementPlan(plan, { scene: this._scene, registerBuildingCollider: (b, x, z, rot) => { /* create a physics.createStaticBox or createStaticRotatedBox collider sized to b.bounds, matching how OverworldScene.registerBuildingCollider does it — read OverworldScene.ts:836-847 (_createOneBuildingCollider) to mirror the exact collider-creation call */ }, mapFaction: (_ignored) => params.faction as Faction })`; store the result on an instance field; call `this._panel.setReadout(...)` with the building/road/lamp counts from the result.
- `exit()`: guard on `!_entered`; dispose the current `SettlementRenderResult` if present; call `this._physics.removeBody(this._groundBody)`; remove the ground mesh from `_scene`; call `this._panel.dispose()`; set `_entered = false`.
- `update(dt)`: no-op or minimal per-frame logic (the lab has no water/tide simulation, unlike `WaterLabScene`) — leave as a no-op method matching the expected call signature from `main.ts`'s per-frame update loop.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scene/SettlementLabScene.test.ts`
Expected: PASS

- [ ] **Step 5: Run full scene test suite to confirm no regression**

Run: `npx vitest run tests/scene/`
Expected: PASS, no new failures vs. Task 6's baseline

- [ ] **Step 6: Commit**

```bash
git add src/scene/SettlementLabScene.ts tests/scene/SettlementLabScene.test.ts
git commit -m "feat: add SettlementLabScene dev room"
```

---

### Task 9: Wire Settlement Lab into dev-room launch machinery

**Files:**
- Modify: `src/overworld-studio/DevRoomHandoff.ts` (full file, widen `DevRoomId`, generalize `readPendingDevRoom()`)
- Modify: `src/main.ts` (line `304` `gameMode` union; `_exitCurrentSpecialMode()` lines `1014-1022`; new `enterSettlementLab()` modeled on `enterWaterLab()` lines `1024-1036`; camera-scroll condition ~line `2635`; boot-handoff case ~lines `3468-3489`; new `window.__game` hooks)
- Modify: `src/overworld-studio.ts` (~line `4419-4427`, add Settlement Lab button handler modeled on the Water Lab one)
- Modify: `overworld-studio.html` (repo root, `#dev-rooms-section` ~lines `35-47`, add a Settlement Lab button)
- Test: `tests/e2e/overworld-studio-settlement-lab-launch.spec.ts` (new, modeled on `tests/e2e/overworld-studio-water-lab-launch.spec.ts`)

**Interfaces:**
- Consumes: `SettlementLabScene` (Task 8).
- Produces: `window.__game.getGameMode()` can now return `'settlementlab'`; `window.__game.enterSettlementLab?: () => void` hook for e2e tests, mirroring the existing Water Lab hook.

- [ ] **Step 1: Write the failing e2e test**

```typescript
// tests/e2e/overworld-studio-settlement-lab-launch.spec.ts
// Copy tests/e2e/overworld-studio-water-lab-launch.spec.ts in full and adapt:
// - the button selector/text to the new Settlement Lab button
// - the polled globals to expect __tttDevRoomStage/__tttDevRoomBooted to report the settlement-lab room
// - the final assertion to expect window.__game.getGameMode() === 'settlementlab'
// - assert no console errors during the whole flow, exactly as the Water Lab spec does
import { test, expect } from '@playwright/test';

test('launching Settlement Lab from Overworld Studio boots into settlementlab game mode with no console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/overworld-studio.html');
  await page.click('button[data-dev-room="settlement-lab"]');

  const popup = await page.waitForEvent('popup');
  await popup.waitForFunction(() => (window as any).__tttDevRoomBooted === true, { timeout: 20000 });

  const gameMode = await popup.evaluate(() => (window as any).__game?.getGameMode?.());
  expect(gameMode).toBe('settlementlab');
  expect(consoleErrors).toEqual([]);
});
```

Before finalizing, open `tests/e2e/overworld-studio-water-lab-launch.spec.ts` in full and match its exact selector strategy, timeout values, and popup-handling pattern instead of the sketch above — reuse its proven structure verbatim, only substituting the Water-Lab-specific strings for Settlement-Lab ones.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/overworld-studio-settlement-lab-launch.spec.ts`
Expected: FAIL — no `button[data-dev-room="settlement-lab"]` exists yet

- [ ] **Step 3: Generalize `DevRoomHandoff.ts`**

Widen `export type DevRoomId = 'water-lab'` to `export type DevRoomId = 'water-lab' | 'settlement-lab';`. Change `readPendingDevRoom()`'s current hardcoded `=== 'water-lab'` string check(s) to a list-membership check, e.g. replace any `if (value === 'water-lab')` with `const validIds: DevRoomId[] = ['water-lab', 'settlement-lab']; if (validIds.includes(value as DevRoomId))`. Keep the rest of the read/write/localStorage-or-URL-param logic (whichever the file currently uses) unchanged — this is a pure generalization of the string-matching, not a redesign.

- [ ] **Step 4: Add `enterSettlementLab()` and mode wiring in `main.ts`**

- Widen the `gameMode` union at line 304 to include `'settlementlab'`.
- Add a new `let settlementLab: SettlementLabScene | null = null;` variable near the existing `waterLab` variable (line 306).
- Add an `enterSettlementLab()` function modeled directly on `enterWaterLab()` (lines 1024-1036): call `_exitCurrentSpecialMode()` first, instantiate `settlementLab = new SettlementLabScene(scene, physics, player)`, call `settlementLab.enter()`, set `gameMode = 'settlementlab'`.
- Add a branch in `_exitCurrentSpecialMode()` (lines 1014-1022) mirroring the existing `if (gameMode === 'waterlab' && waterLab) { waterLab.exit(); waterLab = null; }` block, for `'settlementlab'`/`settlementLab`.
- Update the camera-scroll condition (~line 2635) that currently checks `gameMode === 'waterlab'` (or similar) to also include `'settlementlab'` if the intent is to disable/adjust the same camera behavior in both labs (read the exact current condition first to confirm whether Settlement Lab needs the same treatment — the design spec assumes yes, since both are small fixed-camera-area labs).
- In the boot-handoff block (~lines 3468-3489) that currently checks `_pendingDevRoom === 'water-lab'`, add an `else if (_pendingDevRoom === 'settlement-lab') { enterSettlementLab(); }` branch.
- Add `window.__game.enterSettlementLab = enterSettlementLab;` alongside the existing `window.__game` hook assignments for Water Lab.

- [ ] **Step 5: Add the Settlement Lab button to `overworld-studio.html` and `overworld-studio.ts`**

In `overworld-studio.html`'s `#dev-rooms-section` (~lines 35-47), copy the existing Water Lab `<button>` element and change its `data-dev-room` attribute to `"settlement-lab"`, its id, and its label text to "Settlement Lab". In `overworld-studio.ts` (~lines 4405-4427), copy the existing Water Lab button's click-handler wiring block and change the button id/selector and the `writePendingDevRoom('water-lab')`-style call to `writePendingDevRoom('settlement-lab')` (matching whatever the exact current handoff-write call is named, per the file already read this session).

- [ ] **Step 6: Run the e2e test to verify it passes**

Run: `npx playwright test tests/e2e/overworld-studio-settlement-lab-launch.spec.ts`
Expected: PASS, zero console errors

- [ ] **Step 7: Run the existing Water Lab e2e test to confirm no regression**

Run: `npx playwright test tests/e2e/overworld-studio-water-lab-launch.spec.ts`
Expected: PASS (unchanged behavior)

- [ ] **Step 8: Commit**

```bash
git add src/overworld-studio/DevRoomHandoff.ts src/main.ts src/overworld-studio.ts overworld-studio.html tests/e2e/overworld-studio-settlement-lab-launch.spec.ts
git commit -m "feat: wire Settlement Lab into dev-room launch flow"
```

---

### Task 10: Full regression suite + manual playtest verification

**Files:** none created/modified — verification-only task.

- [ ] **Step 1: Run the full unit/component test suite**

Run: `npx vitest run`
Expected: PASS — same failure count as the pre-existing baseline (there are ~140 known pre-existing `tsc --noEmit` errors repo-wide, mostly `noUnusedLocals`, confirmed not a regression in prior work; this task only requires no *new* failures in files touched by this plan)

- [ ] **Step 2: Run the full e2e suite**

Run: `npx playwright test`
Expected: PASS — including both `overworld-studio-water-lab-launch.spec.ts` and the new `overworld-studio-settlement-lab-launch.spec.ts`

- [ ] **Step 3: Run `tsc --noEmit` and confirm no new errors in touched files**

Run: `npx tsc --noEmit`
Expected: same pre-existing error count/files as before this plan's changes; specifically zero new errors in any file created or modified by Tasks 1-9 (compare the error list before/after using `git stash`/`git stash pop` around the diff if needed to isolate).

- [ ] **Step 4: Manual playtest**

Start the dev server (`npm run dev` or the project's existing script) and manually:
1. Open Overworld Studio, click the new "Settlement Lab" button, confirm a popup window boots directly into the lab with a rendered settlement (buildings, roads, lamps) and a visible control panel.
2. Change the seed, type, faction, and layout dropdowns and click Regenerate — confirm the settlement visibly changes and the readout updates, with no console errors.
3. Confirm the player can walk around the lab's flat terrain and collide correctly with building exteriors (no clipping through walls).
4. Return to Overworld Studio and confirm the existing Water Lab button/flow still works unaffected.

Do not mark this task or the plan complete until this manual playtest has actually been performed and confirmed working — per project norm, no unverified completion claims.

- [ ] **Step 5: Commit any final fixups discovered during playtest**

```bash
git add -A
git commit -m "fix: address issues found in Settlement Lab manual playtest"
```
