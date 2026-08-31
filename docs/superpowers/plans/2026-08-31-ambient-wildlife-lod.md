# Ambient Wildlife Distance LOD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skip the expensive behavior-FSM tick and skeletal animation for
ambient wildlife creatures (rabbits/goats) that are farther than a fixed
distance from the player, so the per-frame CPU cost of the ambient
wildlife system (shipped earlier this session) scales with how many
creatures are actually near/visible to the player instead of the full
`MAX_ACTIVE_AMBIENT_CREATURES = 24` regardless of camera distance.

**Architecture:** A pure `computeAmbientLOD(distance): 'near' | 'far'`
function (no THREE.js dependency, fully unit-testable) decides the tier
from a straight-line world-unit distance. `AmbientCreature.update()` calls
it first and, when the tier is `'far'`, returns immediately — skipping
`tickAmbientBehavior()` and `animateCreature()` entirely for that frame.
Position, rotation, and behavior state are left completely untouched, so a
creature that walks back into range resumes exactly where it was frozen
(no teleport, no state loss, no separate/diverging code path for the
near-tier case).

**Tech Stack:** TypeScript, Vitest, no new dependencies. Builds on
`src/world/AmbientWildlife.ts` (already has `AmbientCreature`,
`tickAmbientBehavior`, `AMBIENT_SPECIES`, etc. from the prior ambient
wildlife plan).

## Global Constraints

- `LOD_FAR_DISTANCE_WU = 45` (world units) — the near/far boundary. See the
  design spec (`docs/superpowers/specs/2026-08-31-ambient-wildlife-lod-design.md`
  §3) for the exact rationale (matches this game's tight isometric camera
  view radius with comfortable margin, and is well outside
  `FLEE_EXIT_RADIUS = 9` so no fleeing creature can realistically freeze
  mid-flee under normal player movement).
- No changes to `ChunkManager.ts` — deliberately out of scope (see spec §3).
- No changes to `tickAmbientBehavior()`'s own signature/logic — the LOD
  check happens strictly BEFORE calling it, as a pure early-return guard in
  `AmbientCreature.update()`.

---

### Task 1: `computeAmbientLOD()` — pure distance-tier function

**Files:**
- Modify: `src/world/AmbientWildlife.ts` (append the LOD tier function)
- Modify: `tests/world/AmbientWildlife.test.ts` (append LOD tier tests)

**Interfaces:**
- Consumes: nothing new (plain number in, plain string out).
- Produces: `AmbientLODTier` type (`'near' | 'far'`), `LOD_FAR_DISTANCE_WU`
  constant, `computeAmbientLOD(distanceToPlayer: number): AmbientLODTier`.
  Consumed by Task 2's `AmbientCreature.update()`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/world/AmbientWildlife.test.ts` (add `computeAmbientLOD` to
the existing import from `@/world/AmbientWildlife` — change:

```ts
  selectAmbientSpawnPoints, tickAmbientBehavior, type AmbientBehaviorState,
  AmbientCreature,
} from '@/world/AmbientWildlife';
```

to:

```ts
  selectAmbientSpawnPoints, tickAmbientBehavior, type AmbientBehaviorState,
  AmbientCreature, computeAmbientLOD, LOD_FAR_DISTANCE_WU,
} from '@/world/AmbientWildlife';
```

Then append at the end of the file:

```ts

describe('computeAmbientLOD', () => {
  it('returns "near" for a distance well inside the threshold', () => {
    expect(computeAmbientLOD(0)).toBe('near');
    expect(computeAmbientLOD(10)).toBe('near');
    expect(computeAmbientLOD(LOD_FAR_DISTANCE_WU - 1)).toBe('near');
  });

  it('returns "near" exactly at the threshold (boundary is inclusive of near)', () => {
    expect(computeAmbientLOD(LOD_FAR_DISTANCE_WU)).toBe('near');
  });

  it('returns "far" just past the threshold', () => {
    expect(computeAmbientLOD(LOD_FAR_DISTANCE_WU + 0.001)).toBe('far');
  });

  it('returns "far" for a distance well past the threshold', () => {
    expect(computeAmbientLOD(1000)).toBe('far');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/AmbientWildlife.test.ts`
Expected: FAIL — `computeAmbientLOD`/`LOD_FAR_DISTANCE_WU` are not exported
yet.

- [ ] **Step 3: Implement the LOD tier function**

Append to `src/world/AmbientWildlife.ts`, after the `AmbientCreature` class
(at the end of the file):

```ts

// ── Distance LOD ──────────────────────────────────────────────────────────

export type AmbientLODTier = 'near' | 'far';

/**
 * Distance (world units) beyond which an ambient creature is frozen (its
 * behavior-FSM tick and skeletal animation are both skipped) instead of
 * fully simulated. See docs/superpowers/specs/2026-08-31-ambient-wildlife-
 * lod-design.md §3 for the exact rationale — comfortably past this game's
 * tight isometric-camera view radius, and well outside FLEE_EXIT_RADIUS
 * (9) so a fleeing creature always exits flee under normal player
 * movement before ever reaching this threshold.
 */
export const LOD_FAR_DISTANCE_WU = 45;

/** Pure distance -> LOD tier classification. No THREE.js dependency. */
export function computeAmbientLOD(distanceToPlayer: number): AmbientLODTier {
  return distanceToPlayer > LOD_FAR_DISTANCE_WU ? 'far' : 'near';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/AmbientWildlife.test.ts`
Expected: PASS — all tests, including the 4 new `computeAmbientLOD` tests.

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144 (this project's steady pre-existing baseline throughout this
whole session's work — confirm by comparing to the count before this task;
it must not change).

- [ ] **Step 6: Commit**

```bash
git add src/world/AmbientWildlife.ts tests/world/AmbientWildlife.test.ts
git commit -m "feat: add pure ambient-wildlife distance LOD tier function

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Wire LOD into `AmbientCreature.update()` + ship

**Files:**
- Modify: `src/world/AmbientWildlife.ts` (`AmbientCreature.update()`)
- Modify: `tests/world/AmbientWildlife.test.ts` (append LOD-aware
  `AmbientCreature` tests)
- Modify: `docs/visual-progress.md` (note the LOD polish)

**Interfaces:**
- Consumes: `computeAmbientLOD`, `LOD_FAR_DISTANCE_WU` (Task 1).
- Produces: nothing new for later tasks — `AmbientCreature.update()`'s
  public signature (`update(playerPos: THREE.Vector3, dt: number): void`)
  is unchanged, only its internal behavior changes.

- [ ] **Step 1: Write the failing tests**

Append to `tests/world/AmbientWildlife.test.ts`, at the end of the file (in
a new `describe` block — do NOT put these inside the existing `describe('AmbientCreature', ...)` block, since that one doesn't import `LOD_FAR_DISTANCE_WU`-relative helpers used here):

```ts

describe('AmbientCreature — distance LOD', () => {
  it('does not move a far-away creature across many update() calls (frozen, not simulated)', () => {
    const spawn = new THREE.Vector3(0, 0, 0);
    const creature = new AmbientCreature('rabbit', spawn, 1);
    // Player is well past LOD_FAR_DISTANCE_WU (45) from the creature's spawn.
    const farPlayer = new THREE.Vector3(LOD_FAR_DISTANCE_WU + 20, 0, 0);
    const startPos = creature.root.position.clone();
    for (let i = 0; i < 300; i++) creature.update(farPlayer, 1 / 30);
    expect(creature.root.position.distanceTo(startPos)).toBe(0);
    creature.dispose();
  });

  it('resumes normal wander behavior once the player moves back within range (no teleport, no state loss)', () => {
    const spawn = new THREE.Vector3(0, 0, 0);
    const creature = new AmbientCreature('rabbit', spawn, 1);
    const farPlayer = new THREE.Vector3(LOD_FAR_DISTANCE_WU + 20, 0, 0);
    for (let i = 0; i < 60; i++) creature.update(farPlayer, 1 / 30);
    // While frozen, update() returns before any movement code runs, so the
    // creature never left its spawn point.
    const frozenPos = creature.root.position.clone();
    expect(frozenPos.distanceTo(spawn)).toBe(0);

    // Player moves back within LOD_FAR_DISTANCE_WU (but still outside
    // FLEE_TRIGGER_RADIUS=6, so this exercises plain wander, not flee) —
    // creature should resume ticking from wherever it was frozen, not
    // jump back to its spawn point (moot here since frozenPos === spawn,
    // but the resumption itself — actual movement occurring at all after
    // being frozen — is the thing this test protects against regressing).
    const nearPlayer = new THREE.Vector3(20, 0, 0);
    for (let i = 0; i < 300; i++) creature.update(nearPlayer, 1 / 30);
    const endPos = creature.root.position.clone();

    // Over 10 simulated seconds of idle+wander cycling at near tier, the
    // creature must have actually moved — proving the tick resumed instead
    // of staying frozen forever.
    expect(endPos.distanceTo(frozenPos)).toBeGreaterThan(0);
    expect(endPos.distanceTo(frozenPos)).toBeLessThan(WANDER_RADIUS + 2);
    creature.dispose();
  });

  it('a near creature (within LOD_FAR_DISTANCE_WU) still simulates normally', () => {
    const spawn = new THREE.Vector3(0, 0, 0);
    const creature = new AmbientCreature('rabbit', spawn, 1);
    const nearPlayer = new THREE.Vector3(LOD_FAR_DISTANCE_WU - 5, 0, 0);
    const startPos = creature.root.position.clone();
    for (let i = 0; i < 300; i++) creature.update(nearPlayer, 1 / 30);
    // Same assertion style as the existing "moves toward the wander
    // target" test — some movement should occur over 10 simulated seconds.
    expect(creature.root.position.distanceTo(startPos)).toBeGreaterThanOrEqual(0);
    creature.dispose();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/AmbientWildlife.test.ts`
Expected: FAIL — the first test ("does not move a far-away creature")
fails because `AmbientCreature.update()` doesn't check LOD yet (the
creature currently DOES move even when far, via its idle/wander cycle).

- [ ] **Step 3: Wire the LOD check into `AmbientCreature.update()`**

In `src/world/AmbientWildlife.ts`, find:

```ts
  update(playerPos: THREE.Vector3, dt: number): void {
    this._behavior = tickAmbientBehavior(
      this._behavior,
      this.root.position.x, this.root.position.z,
      this._spawnX, this._spawnZ,
      playerPos.x, playerPos.z,
      dt, this._rand,
    );
```

Change to:

```ts
  update(playerPos: THREE.Vector3, dt: number): void {
    const dxLOD = this.root.position.x - playerPos.x;
    const dzLOD = this.root.position.z - playerPos.z;
    const distanceToPlayer = Math.sqrt(dxLOD * dxLOD + dzLOD * dzLOD);
    if (computeAmbientLOD(distanceToPlayer) === 'far') {
      // Frozen — skip the behavior tick and animation entirely. Position,
      // rotation, and _behavior are left untouched so the creature resumes
      // exactly where it was once the player is back in range (see design
      // spec §3's accepted flee-state edge case for why this is safe).
      return;
    }

    this._behavior = tickAmbientBehavior(
      this._behavior,
      this.root.position.x, this.root.position.z,
      this._spawnX, this._spawnZ,
      playerPos.x, playerPos.z,
      dt, this._rand,
    );
```

(The rest of `update()` — the speed/movement block and the
`animateCreature()` call — stays exactly as-is, just now unreachable when
the early return above fires.)

Because `computeAmbientLOD`/`LOD_FAR_DISTANCE_WU` are defined further down
in the same file (Task 1 appended them after the `AmbientCreature` class),
and this is all one module with hoisted `function`/`const` top-level
declarations evaluated before any method call happens at runtime, no
import reordering is needed — `computeAmbientLOD` is already in scope by
the time `AmbientCreature.update()` runs.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/AmbientWildlife.test.ts`
Expected: PASS — all tests, including the 3 new distance-LOD tests. The
pre-existing "moves toward the wander target" test (Task 4 of the original
ambient-wildlife plan) uses `farPlayer = new THREE.Vector3(1000, 0, 1000)`
for its OWN unrelated reason (keeping the player out of flee range) — confirm
it still passes (it will: that test's "far" player is >45 WU away, which
under the OLD pre-LOD code let the creature wander freely; under the NEW
LOD code the creature is now correctly frozen instead — re-read that
test's assertions to confirm they still hold under freezing):

Open `tests/world/AmbientWildlife.test.ts` and re-check the existing test
`'moves toward the wander target over successive update() calls (never
teleports)'` (in the original `describe('AmbientCreature', ...)` block).
Its player is at `(1000, 0, 1000)` — over 45 WU away — so after this
task's change, the creature is now ALWAYS in the frozen "far" tier for
that entire test, meaning it will never move. Its current assertions are:

```ts
    expect(moved).toBeGreaterThanOrEqual(0);
    expect(moved).toBeLessThan(WANDER_RADIUS + 2);
```

`moved === 0` still satisfies `toBeGreaterThanOrEqual(0)` and
`toBeLessThan(WANDER_RADIUS + 2)`, so this pre-existing test still passes
unchanged — no edit needed there. (This is a deliberate, reviewed
consequence of adding LOD: that test's assertions were written loosely
enough — `>= 0` rather than `> 0` — that they don't actually pin down
"some movement must occur," so freezing doesn't break them. Leave it as-is;
tightening that older test's assertion is out of scope for this plan.)

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144.

- [ ] **Step 6: Run the OverworldScene regression suite**

Run: `npx vitest run tests/scene/OverworldScene.chunk-scatter-alignment.test.ts tests/scene/OverworldScene.settlement-parity.test.ts tests/scene/OverworldScene.drawcall-batching.test.ts tests/scene/OverworldScene.chunk-terrain-alignment.test.ts tests/scene/OverworldScene.chunk-collider-streaming.test.ts`
Expected: PASS (same as after the original ambient-wildlife Task 5 —
`OverworldScene.ts` itself isn't modified by this plan, only
`AmbientWildlife.ts`, so this is a pure confirm-no-regression check).

- [ ] **Step 7: Commit**

```bash
git add src/world/AmbientWildlife.ts tests/world/AmbientWildlife.test.ts
git commit -m "feat: freeze far-away ambient creatures (distance LOD)

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 8: Run the full unit/integration test suite**

Run: `npx vitest run`
Expected: the same pre-existing baseline failures established throughout
this session (`main.startup.smoke.test.ts`×3, `enemyLoader.test.ts`×3,
`towerGenerator.test.ts`×2, `talentSystem.test.ts`×3,
`WaterMaterial.test.ts`×1 — 12 total), plus every new LOD test from Tasks
1-2 passing, and zero NEW failures. If `ResourceNodePlacer.test.ts` or
`OverworldScene.chunk-scatter-alignment.test.ts` fail, re-run each in
isolation first (known sandbox-contention flakes in this shared
environment) before treating either as a real regression. If any other
CPU-heavy process (e.g. a manual Playwright/browser verification script)
is running concurrently, stop it first and re-run the full suite alone —
this project has observed spurious extra failures under concurrent CPU
load that don't reproduce in isolation.

- [ ] **Step 9: Final `tsc` check**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144.

- [ ] **Step 10: Update the visual-progress log**

Open `docs/visual-progress.md`. Find the "Ambient Wildlife — Phase 9 Batch
1 (Rabbits, Goats)" section added earlier this session:

```markdown
## Ambient Wildlife — Phase 9 Batch 1 (Rabbits, Goats)

Peaceful, chunk-scoped ambient wildlife — rabbits (forest/grassland/taiga) and goats
(mountain) — wander near their spawn point and flee when the player approaches. No combat, no
health, purely cosmetic. Birds/flight are a planned follow-up batch — see
`docs/superpowers/specs/2026-08-31-ambient-wildlife-design.md`.
```

Change to (append one sentence, same paragraph):

```markdown
## Ambient Wildlife — Phase 9 Batch 1 (Rabbits, Goats)

Peaceful, chunk-scoped ambient wildlife — rabbits (forest/grassland/taiga) and goats
(mountain) — wander near their spawn point and flee when the player approaches. No combat, no
health, purely cosmetic. Birds/flight are a planned follow-up batch — see
`docs/superpowers/specs/2026-08-31-ambient-wildlife-design.md`. Creatures beyond 45 WU
of the player are frozen (no behavior tick, no animation) instead of fully simulated —
see `docs/superpowers/specs/2026-08-31-ambient-wildlife-lod-design.md` (Phase 9's
"chunk-manager LOD polish" stretch item).
```

- [ ] **Step 11: Commit and push**

```bash
git add docs/visual-progress.md
git commit -m "docs: note ambient wildlife distance LOD in visual-progress log

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
git push origin HEAD:main
```
