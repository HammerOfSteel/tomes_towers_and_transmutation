# Phase 4 Implementation Plan: Night Lighting (Settlement Lamp Posts)

Design doc: `docs/superpowers/specs/2026-08-01-night-lighting-design.md`

## Task 1: Lamp road-tile selection helper (pure, unit-testable)

**Files:**
- Create: `src/world/LampPlacement.ts`
- Create: `tests/world/LampPlacement.test.ts`

**Interfaces:**
- `selectLampRoadTiles(roads: RoadSegment[], stride: number): RoadSegment[]` — deterministic,
  order-preserving stride sample of the input road-tile array (every `stride`-th element, always
  including index 0 if `roads.length > 0`).

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { selectLampRoadTiles } from '@/world/LampPlacement';

describe('selectLampRoadTiles', () => {
  it('returns every Nth road tile starting from index 0', () => {
    const roads = Array.from({ length: 10 }, (_, i) => ({ col: i, row: 0 }));
    const result = selectLampRoadTiles(roads, 4);
    expect(result).toEqual([{ col: 0, row: 0 }, { col: 4, row: 0 }, { col: 8, row: 0 }]);
  });

  it('returns an empty array for an empty input', () => {
    expect(selectLampRoadTiles([], 4)).toEqual([]);
  });

  it('returns just the first tile when stride exceeds array length', () => {
    const roads = [{ col: 1, row: 2 }, { col: 3, row: 4 }];
    expect(selectLampRoadTiles(roads, 10)).toEqual([{ col: 1, row: 2 }]);
  });

  it('is deterministic across repeated calls with the same input', () => {
    const roads = Array.from({ length: 17 }, (_, i) => ({ col: i, row: i * 2 }));
    expect(selectLampRoadTiles(roads, 4)).toEqual(selectLampRoadTiles(roads, 4));
  });

  it('throws for a non-positive stride', () => {
    expect(() => selectLampRoadTiles([{ col: 0, row: 0 }], 0)).toThrow();
  });
});
```

Run: `npx vitest run tests/world/LampPlacement.test.ts` — expect failure (module doesn't exist).

- [ ] **Step 2: Implement**

```typescript
/**
 * LampPlacement.ts — pure helper selecting which settlement road tiles get a
 * lamp post prop, given the full rasterized road-tile list for a settlement.
 *
 * Road tiles are already a curated, connected path graph (not random terrain
 * scatter), so a simple positional stride is sufficient and gives a natural
 * "lamp-post interval" look without needing Poisson-disk sampling.
 */
import type { RoadSegment } from './SettlementGenerator';

export function selectLampRoadTiles(roads: RoadSegment[], stride: number): RoadSegment[] {
  if (stride <= 0) throw new Error('selectLampRoadTiles: stride must be a positive integer');
  const out: RoadSegment[] = [];
  for (let i = 0; i < roads.length; i += stride) {
    out.push(roads[i]!);
  }
  return out;
}
```

- [ ] **Step 3: Run test, confirm pass**

Run: `npx vitest run tests/world/LampPlacement.test.ts` — expect all 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/world/LampPlacement.ts tests/world/LampPlacement.test.ts
git commit -m "feat: add deterministic lamp-post road-tile selection helper"
```

---

## Task 2: Lamp mesh + placement wiring in `OverworldScene.ts`

**Files:**
- Modify: `src/scene/OverworldScene.ts`

**Interfaces:**
- Consumes: `selectLampRoadTiles` (Task 1).
- Produces: `_lampGroups: THREE.Group[]`, `_lampLights: THREE.PointLight[]` (new private fields);
  `_buildSettlementLamps(plan, GHW, GHH): void` (new private method, called once per settlement
  from the same loop that currently builds settlement roads); `_makeLampPost(): { group: THREE.Group;
  light: THREE.PointLight }` (new private method).

- [ ] **Step 1: Add import**

Find (top of file, alongside other `@/world/*` imports — e.g. near the `RockEntry`/`ResourceNodeRecord`
imports):
```typescript
import type { ResourceNodeRecord }      from '@/world/ResourceNodePlacer';
```
Add directly after it:
```typescript
import { selectLampRoadTiles } from '@/world/LampPlacement';
```

- [ ] **Step 2: Add new private fields**

Find:
```typescript
  private _roadMeshes: THREE.Mesh[] = [];
```
Add directly after it:
```typescript
  /** Settlement lamp-post props (post + lantern mesh) — decorative, no collider. */
  private _lampGroups: THREE.Group[] = [];
  /** Parallel array to _lampGroups — each lamp's point light, for per-frame intensity updates. */
  private _lampLights: THREE.PointLight[] = [];
```

- [ ] **Step 3: Wire lamp building into the settlement loop**

Find (inside the settlement-building loop, right after the road-tile collection block that pushes
into `sqPositions`):
```typescript
      // Collect settlement road tiles — all at centre elevation for a flat pavement
      const centreElev = this._wg.get(plan.centerCol, plan.centerRow).elevation;
      for (const r of plan.roads) {
        const k = `${r.col},${r.row}`;
        if (sqSeen.has(k)) continue;
        sqSeen.add(k);
        const wx = (r.col - GHW) * T;
        const wz = (r.row - GHH) * T;
        sqPositions.push(new THREE.Vector3(wx, centreElev * SH + 0.02, wz));
      }
    }
```
Replace with:
```typescript
      // Collect settlement road tiles — all at centre elevation for a flat pavement
      const centreElev = this._wg.get(plan.centerCol, plan.centerRow).elevation;
      for (const r of plan.roads) {
        const k = `${r.col},${r.row}`;
        if (sqSeen.has(k)) continue;
        sqSeen.add(k);
        const wx = (r.col - GHW) * T;
        const wz = (r.row - GHH) * T;
        sqPositions.push(new THREE.Vector3(wx, centreElev * SH + 0.02, wz));
      }

      // Place lamp posts along a stride-sampled subset of this settlement's roads.
      const lampTiles = selectLampRoadTiles(plan.roads, 4);
      for (const t of lampTiles) {
        const wx = (t.col - GHW) * T + 0.6; // small perpendicular offset so the post
        const wz = (t.row - GHH) * T;       // doesn't sit dead-center of the walking path
        const { group, light } = this._makeLampPost();
        group.position.set(wx, centreElev * SH, wz);
        this._lampGroups.push(group);
        this._lampLights.push(light);
      }
    }
```

- [ ] **Step 4: Add `_makeLampPost` method**

Add directly after the `_buildResourceNodes`/`_makeNodeMesh` methods (find the end of
`_makeNodeMesh` — it ends with `return grp;` followed by the method's closing brace — insert a new
method after that closing brace):

```typescript
  // ── Settlement lamp posts (Phase 4 — night lighting) ───────────────────────

  private _makeLampPost(): { group: THREE.Group; light: THREE.PointLight } {
    const g = new THREE.Group();

    const postMat = new THREE.MeshLambertMaterial({ color: 0x2a2620 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.4, 6), postMat);
    post.position.y = 0.7;
    g.add(post);

    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xffcc77,
      emissive: 0xffaa44,
      emissiveIntensity: 0.6,
      roughness: 0.4,
    });
    const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), lanternMat);
    lantern.position.y = 1.42;
    g.add(lantern);

    const light = new THREE.PointLight(0xffaa55, 0, 5); // starts off — day
    light.position.y = 1.42;
    g.add(light);

    return { group: g, light };
  }
```

- [ ] **Step 5: Wire lamps into `enter()`/`exit()`**

Find (in `enter()`):
```typescript
    for (const cl of this._clutter)       this.scene.add(cl);
```
Add directly after it:
```typescript
    for (const lg of this._lampGroups)    this.scene.add(lg);
```

Find (in `exit()`):
```typescript
    for (const cl of this._clutter)        this.scene.remove(cl);
```
Add directly after it:
```typescript
    for (const lg of this._lampGroups)     this.scene.remove(lg);
```

- [ ] **Step 6: Wire lamps into `dispose()`**

Find:
```typescript
    for (const cl of this._clutter)       this._freeGroup(cl);
    this._clutter = [];
```
Replace with:
```typescript
    for (const cl of this._clutter)       this._freeGroup(cl);
    this._clutter = [];
    for (const lg of this._lampGroups) {
      lg.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }
    this._lampGroups = [];
    this._lampLights = [];
```

- [ ] **Step 7: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: same baseline count as before this task (136 lines, per the running baseline established
in Phase 1/2 — re-verify via `git stash`/`git stash pop` if unsure of the current baseline number).

- [ ] **Step 8: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "feat: place lamp-post props along settlement roads"
```

---

## Task 3: Night-driven lamp intensity update

**Files:**
- Modify: `src/scene/OverworldScene.ts`

**Interfaces:**
- Produces: `updateNightLighting(hour: number): void` (new public method), called once per frame
  from `update()` alongside the existing `updateTowerDetails` call.

- [ ] **Step 1: Add the method**

Add directly after the existing `updateTowerDetails` method (find its closing brace — it's the
method starting `updateTowerDetails(hour: number, playerPos: THREE.Vector3): void {` — insert the
new method right after its closing brace):

```typescript
  /** Phase 4: fade all settlement lamp-post lights on/off based on game hour.
   *  Uses the same isNight threshold + flicker formula as updateTowerDetails
   *  so all of the overworld's night light sources pulse in the same rhythm. */
  updateNightLighting(hour: number): void {
    const isNight = hour >= 18 || hour < 6;
    const intensity = isNight ? 0.7 + 0.1 * Math.sin(Date.now() * 0.001) : 0;
    for (const light of this._lampLights) light.intensity = intensity;
  }
```

- [ ] **Step 2: Call it from `update()`**

Find:
```typescript
    // A5: update tower window lights + portcullis gate
    const hour = (this as any)._timeHour ?? 12;   // set by DayNightSystem if wired
    this.updateTowerDetails(hour, pos);
```
Replace with:
```typescript
    // A5: update tower window lights + portcullis gate
    const hour = (this as any)._timeHour ?? 12;   // set by DayNightSystem if wired
    this.updateTowerDetails(hour, pos);
    // Phase 4: update settlement lamp-post lights (same hour value, same day/night rhythm)
    this.updateNightLighting(hour);
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit` — expect same baseline as Task 2's Step 7.

- [ ] **Step 4: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "feat: fade settlement lamp lights on/off with the day/night cycle"
```

---

## Task 4: Full regression + live visual verification (night)

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full unit test suite**

Run: `npx vitest run`
Expected: all previously-passing tests still pass, plus 5 new tests from Task 1. Same 8
pre-existing failing tests (unrelated baseline, confirmed in Phase 1/2).

- [ ] **Step 2: Run the full exterior e2e suite**

Run: `npx playwright test tests/e2e/exterior.test.ts`
Expected: all 15 tests pass (lamps are non-colliding decoration, like Phase 2's bushes/trees/rocks
— should not affect any collision/movement assertion). Note from Phase 2: this suite has ~20-40min
runtime and occasional single-test timeout flakes under load — if a test fails, re-run that single
test in isolation via `-g "<test name>"` before concluding it's a real regression.

- [ ] **Step 3: Run `npm run doctor`**

Run: `npm run doctor` — expect clean output.

- [ ] **Step 4: Live visual verification (forced night hour)**

Start a fresh dev server on a free port (check with `lsof -ti:<port>`, kill if occupied with
`kill <PID>` — never `pkill`/`killall`):
```bash
npm run dev -- --port 5187 > /tmp/dev-server-lighting.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5187/
```
Expected: HTTP 200.

Write a throwaway script `verify_night_lighting.mjs` at repo root (delete after use), following the
proven pattern from Phase 2's verification script, with ONE addition: after `__game.startGame(seed)`
and before `__game.switchToExterior()`, force the game clock to a night hour. Since `TimeSystem.hour`
is a plain public mutable field (confirmed by reading `src/world/TimeSystem.ts` — no setter method
needed), this can be done directly in the page context if `TimeSystem` or its instance is reachable
from `window` (check what's exposed via `window.__game` first — if `TimeSystem.instance` isn't
directly reachable, an acceptable fallback is `page.waitForTimeout(...)` long enough for real-time
cycling to reach night, OR temporarily expose `TimeSystem.instance` via a `window.__timeSystem =
TimeSystem.instance;` one-line dev-only addition in `main.ts` if no existing hook exists — check
first before adding new code, since a debug hook may already exist given `_timeHour` is read via
`(this as any)._timeHour` in `OverworldScene.ts`).

Then follow the proven pattern: `page.goto()` → wait for `#game-canvas` → wait for `window.__game`
→ `startGame(seed)` → force night hour → `waitForTimeout(600)` → `switchToExterior()` →
`waitForTimeout(1500)` → `teleportPlayer(x, y, z)` to a position INSIDE a settlement (not the open
wilderness — lamps only exist on settlement road tiles) → `waitForTimeout(1000)` →
`page.screenshot(...)` to `/tmp/settlement-before-after/night-lighting-AFTER.png`.

Run: `node verify_night_lighting.mjs`
Expected: no page errors; screenshot created.

- [ ] **Step 5: Visually inspect the screenshot**

Use the `view` tool. Confirm: the scene is visibly dark (night sky/fog per `DayNightSystem`), and
at least one small glowing lamp-post is visible along a settlement road. If no settlement is in
frame, adjust the teleport coordinates to a known settlement position (check
`overworld.getSettlementPositions()` or similar existing accessor, or reuse coordinates from
Phase 2/3's settlement screenshots if available) and re-screenshot.

- [ ] **Step 6: Clean up**

```bash
rm -f verify_night_lighting.mjs
```
Revert any temporary debug hook added to `main.ts` in Step 4 if it was added ONLY for this
verification and isn't otherwise useful — or keep it if it's a reasonable, harmless permanent dev
convenience (judgment call at implementation time; note the decision either way).

Kill the dev server process using its specific PID (`lsof -ti:5187`, then `kill <PID>`).

- [ ] **Step 7: Push**

```bash
git push origin cline_work-04_overworld_feel
```

- [ ] **Step 8: Update todos**

Mark `phase4-night-lighting` done in the SQL todos table.
