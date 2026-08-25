# Water Lab Swim Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the princess's alternating-freestyle `swim` animation clip with a symmetric breaststroke cycle, and add a particle-based wake trail that follows her while she swims near the surface, per the approved design spec (`docs/superpowers/specs/2026-08-25-water-lab-swim-polish-design.md`).

**Architecture:** Two independent, self-contained changes with no shared interfaces: (1) pure animation-data edit to the existing `CLIPS.swim` clip definition in `src/princess-creator/anim/clips.ts` — no runtime/gameplay code changes, just new keyframe poses; (2) a new private per-frame method on `WaterLabScene` that creates/moves/stops a continuous `ParticleSystem` emitter based on the player's existing public swim state (`isSwimming`, `underwaterDepthFraction`) plus locally-tracked frame-to-frame horizontal displacement (since `PlayerController`'s internal velocity isn't exposed).

**Tech Stack:** TypeScript, Three.js, Vitest, the existing hand-authored keyframe animation system (`src/princess-creator/anim/clips.ts`), the existing pooled `ParticleSystem` (`src/rendering/ParticleSystem.ts`).

## Global Constraints

- Do not change `CLIPS.swim`'s `id`, `duration` (0.9s), `loop` (true), or its two `stroke` events — only the keyframe pose data may change (per the approved spec).
- `CLIPS.swim_idle` (the treading-water clip) is unchanged — out of scope.
- The wake trail must use the project's established water-particle color `0xdff3ff` (same color `_spawnSplash()` already uses), for visual consistency.
- No new dependencies. Reuse `ParticleSystem.addEmitter()` — do not modify `ParticleSystem.ts`.
- Every new/changed joint pose value must be a finite number (existing `anim.test.ts` invariants already assert this project-wide; do not introduce `NaN`/`Infinity`).

---

### Task 1: Breaststroke `swim` clip

**Files:**
- Modify: `src/princess-creator/anim/clips.ts:181-224` (the `swim` clip definition)
- Test: `src/princess-creator/__tests__/anim.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: existing `k(t, key)` helper (clips.ts:82), existing `bakeClip(def: ClipDef): BakedClip` (clips.ts:556), existing `CLIPS.swim: ClipDef` shape (`id`, `label`, `group`, `duration`, `loop`, `events`, `keys`).
- Produces: nothing new — this task only changes data inside the existing `CLIPS.swim` entry. No other task depends on its internals.

- [ ] **Step 1: Write the failing tests**

Open `src/princess-creator/__tests__/anim.test.ts` and add this new `describe` block at the end of the file (after the last existing `describe`/`it` block, still inside the file — do not nest it inside another `describe`):

```typescript
describe('swim clip (breaststroke)', () => {
  it('moves both arms as a mirrored pair, not alternating (regression guard: the old freestyle stroke had each arm on an opposite phase, with very different rotation values between shoulderL/shoulderR at any given key)', () => {
    const baked = bakeClip(CLIPS.swim);
    for (const key of baked.keys) {
      expect(key.joints.shoulderL[0]).toBeCloseTo(key.joints.shoulderR[0], 5);
      expect(key.joints.shoulderL[2]).toBeCloseTo(-key.joints.shoulderR[2], 5);
      expect(key.joints.elbowL[0]).toBeCloseTo(key.joints.elbowR[0], 5);
      expect(key.joints.elbowL[2]).toBeCloseTo(-key.joints.elbowR[2], 5);
    }
  });

  it('kicks both legs together (frog-kick), not alternating', () => {
    const baked = bakeClip(CLIPS.swim);
    for (const key of baked.keys) {
      expect(key.joints.hipL[0]).toBeCloseTo(key.joints.hipR[0], 5);
      expect(key.joints.hipL[1]).toBeCloseTo(-key.joints.hipR[1], 5);
      expect(key.joints.kneeL[0]).toBeCloseTo(key.joints.kneeR[0], 5);
    }
  });

  it('still loops and keeps its id, duration, and the two stroke events', () => {
    expect(CLIPS.swim.id).toBe('swim');
    expect(CLIPS.swim.duration).toBe(0.9);
    expect(CLIPS.swim.loop).toBe(true);
    expect(CLIPS.swim.events?.filter((e) => e.id === 'stroke').length).toBe(2);
  });
});
```

Check the top of the file already imports `CLIPS` and `bakeClip` from `@/princess-creator/anim/clips` (it does, since earlier tests in the same file already use both) — no new imports needed.

- [ ] **Step 2: Run the tests to verify the first two fail**

Run: `npx vitest run src/princess-creator/__tests__/anim.test.ts -t "swim clip (breaststroke)"`
Expected: the "mirrored pair" and "frog-kick" tests FAIL (the current clip is an alternating freestyle stroke, e.g. `shoulderL[0]` = -1.7 vs `shoulderR[0]` = -2.7 at t=0 — not equal). The third test ("still loops...") passes already since it only checks metadata that isn't changing.

- [ ] **Step 3: Replace the `swim` clip with a breaststroke cycle**

In `src/princess-creator/anim/clips.ts`, replace the entire `swim:` entry (currently lines 181-224, from `swim: {` through its closing `},`) with:

```typescript
  swim: {
    id: 'swim', label: 'Swim (stroke)', group: 'locomotion', duration: 0.9, loop: true,
    events: [{ t: 0.15, id: 'stroke' }, { t: 0.55, id: 'stroke' }],
    keys: [
      // GLIDE — arms extended forward together, legs together and
      // streamlined. The longest-held pose in the cycle (0.55 → 1.0 → 0),
      // matching how a real breaststroke spends most of its time gliding.
      k(0, { rootY: -0.05, joints: {
        shoulderL: [-2.6, 0, 0.15], shoulderR: [-2.6, 0, -0.15],
        elbowL: [-0.15, 0, -0.05], elbowR: [-0.15, 0, 0.05],
        hipL: [0.1, 0.05, 0.02], hipR: [0.1, -0.05, -0.02],
        kneeL: [0.05, 0, 0], kneeR: [0.05, 0, 0],
        torso: [0.02, 0, 0.01], neck: [0.02, 0, 0],
      } }),
      // CATCH / OUT-SWEEP — both arms sweep outward together into a
      // wide "Y", legs start drawing up. Head lifts slightly (a
      // breaststroke breath happens during the pull).
      k(0.15, { rootY: 0.05, joints: {
        shoulderL: [-1.3, 0, 0.9], shoulderR: [-1.3, 0, -0.9],
        elbowL: [-0.5, 0, -0.2], elbowR: [-0.5, 0, 0.2],
        hipL: [0.3, 0.08, 0.03], hipR: [0.3, -0.08, -0.03],
        kneeL: [0.35, 0, 0], kneeR: [0.35, 0, 0],
        torso: [0.08, 0, 0.02], neck: [0.05, 0, -0.02],
      } }),
      // IN-SWEEP / RECOVERY — hands drawn together under the chin,
      // knees pulled up and splayed wide (the coiled "whip kick" setup
      // pose). Most compressed point of the cycle.
      k(0.35, { rootY: -0.02, joints: {
        shoulderL: [-2.0, 0, 0.3], shoulderR: [-2.0, 0, -0.3],
        elbowL: [-1.6, 0, -0.3], elbowR: [-1.6, 0, 0.3],
        hipL: [0.7, 0.18, 0.05], hipR: [0.7, -0.18, -0.05],
        kneeL: [1.5, 0, 0], kneeR: [1.5, 0, 0],
        torso: [0.1, 0, 0.03], neck: [-0.05, 0, 0],
      }, torsoScale: 0.97 }),
      // KICK + REACH — legs snap back together and extend (the whip
      // kick's power stroke) while the arms shoot forward into the next
      // glide. Snappier arrival than the surrounding keys.
      k(0.55, { ease: 'snap', rootY: 0.1, joints: {
        shoulderL: [-2.4, 0, 0.2], shoulderR: [-2.4, 0, -0.2],
        elbowL: [-0.4, 0, -0.1], elbowR: [-0.4, 0, 0.1],
        hipL: [0.15, 0.05, 0.02], hipR: [0.15, -0.05, -0.02],
        kneeL: [0.1, 0, 0], kneeR: [0.1, 0, 0],
        torso: [0.04, 0, 0.01], neck: [0.02, 0, 0],
      }, torsoScale: 1.02 }),
      // Back to GLIDE — identical to t=0 so the loop closes cleanly.
      k(1, { rootY: -0.05, joints: {
        shoulderL: [-2.6, 0, 0.15], shoulderR: [-2.6, 0, -0.15],
        elbowL: [-0.15, 0, -0.05], elbowR: [-0.15, 0, 0.05],
        hipL: [0.1, 0.05, 0.02], hipR: [0.1, -0.05, -0.02],
        kneeL: [0.05, 0, 0], kneeR: [0.05, 0, 0],
        torso: [0.02, 0, 0.01], neck: [0.02, 0, 0],
      } }),
    ],
  },
```

Also update the doc comment directly above the `swim:` entry (currently the 4 lines starting `// Active swimming (moving through water) — an alternating freestyle-style`) to:

```typescript
  // Active swimming (moving through water) — a symmetric breaststroke
  // cycle: both arms sweep out and pull in together (catch → recovery),
  // legs perform a synchronized frog/whip-kick, and the torso undulates
  // forward/back (not side-to-side), faster and bigger than swim_idle's
  // gentle tread.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/princess-creator/__tests__/anim.test.ts`
Expected: all tests in the file PASS, including the 3 new ones (the existing generic clip-library invariants — finite keys, sane loop behavior — also still pass since every joint at every key above is a finite, well-formed `V3`).

- [ ] **Step 5: Commit**

```bash
git add src/princess-creator/anim/clips.ts src/princess-creator/__tests__/anim.test.ts
git commit -m "Replace alternating freestyle swim clip with a breaststroke cycle

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Wake-trail particle VFX in Water Lab

**Files:**
- Modify: `src/scene/WaterLabScene.ts`
- Test: `tests/scene/WaterLabScene.test.ts`

**Interfaces:**
- Consumes: `PlayerController.isSwimming: boolean` (getter, `src/player/PlayerController.ts:388`), `PlayerController.underwaterDepthFraction: number` (getter, `src/player/PlayerController.ts:395`), `PlayerController.group.position: THREE.Vector3` (existing), `ParticleSystem.addEmitter(pos: THREE.Vector3, cfg: Partial<EmitterConfig>): EmitterHandle` and the `EmitterHandle` interface (`setPos(x,y,z): void`, `stop(): void`, `readonly active: boolean`) from `src/rendering/ParticleSystem.ts`.
- Produces: a new private method `WaterLabScene._updateWake(dt: number): void` and private fields `_wakeEmitter`, `_prevWakeX`, `_prevWakeZ` — internal to `WaterLabScene`, not consumed by any other task/file.

- [ ] **Step 1: Write the failing test**

Open `tests/scene/WaterLabScene.test.ts`. Find the existing `describe`/`it` blocks that drive frame loops via `physics.step(1/60); lab.update(1/60); player.update(input, 1/60, 'isometric');` (used by the swim/wade hysteresis tests) and add a new `it` block in the same top-level `describe`, right after the existing swim-hysteresis tests:

```typescript
  it('starts a wake-trail emitter while swimming and moving near the surface, and stops it once she comes to a stop', () => {
    player.teleport(new THREE.Vector3(0, -1.2, 0));
    const stationaryInput = { moveForward: false, moveBackward: false, moveLeft: false, moveRight: false, jump: false, run: false, dodge: false, interact: false, turnDragHeld: false } as any;

    // Let her settle into a stable swim float, not moving — no wake yet.
    for (let i = 0; i < 60; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(stationaryInput, 1 / 60, 'isometric');
    }
    expect(player.isSwimming).toBe(true);
    expect((lab as unknown as { _wakeEmitter: { active: boolean } | null })._wakeEmitter?.active ?? false).toBe(false);

    // Swim forward with no dive input, so she stays near SWIM_FLOAT_DEPTH
    // (near the surface) — the wake trail should start.
    const forwardInput = { moveForward: true, moveBackward: false, moveLeft: false, moveRight: false, jump: false, run: false, dodge: false, interact: false, turnDragHeld: false } as any;
    for (let i = 0; i < 30; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(forwardInput, 1 / 60, 'isometric');
    }
    expect(player.isSwimming).toBe(true);
    expect((lab as unknown as { _wakeEmitter: { active: boolean } | null })._wakeEmitter?.active).toBe(true);

    // Stop moving again — the wake should turn back off.
    for (let i = 0; i < 30; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(stationaryInput, 1 / 60, 'isometric');
    }
    expect((lab as unknown as { _wakeEmitter: { active: boolean } | null })._wakeEmitter?.active ?? false).toBe(false);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/scene/WaterLabScene.test.ts -t "wake-trail"`
Expected: FAIL — `_wakeEmitter` is `undefined` on `lab` (property doesn't exist yet), so `(lab as ...)._wakeEmitter?.active ?? false` evaluates to `false` for every assertion, making the middle assertion (`toBe(true)`) fail.

- [ ] **Step 3: Add the wake-trail fields, update hook, and helper method**

In `src/scene/WaterLabScene.ts`, change the `ParticleSystem` type import (currently `import type { ParticleSystem } from '@/rendering/ParticleSystem';`) to also import `EmitterHandle`:

```typescript
import type { ParticleSystem, EmitterHandle } from '@/rendering/ParticleSystem';
```

Add two new constants near the existing `SWIM_ENTER_DEPTH_THRESHOLD`/`SWIM_EXIT_DEPTH_THRESHOLD` constants (right after `const SWIM_EXIT_DEPTH_THRESHOLD = 0.45;`):

```typescript
/** Fraction of underwaterDepthFraction (0=surface, 1=full dive depth) below
 *  which the player counts as "near the surface" for the wake-trail VFX.
 *  0.3 of DIVE_TARGET_DEPTH (3.0 WU) is 0.9 WU, matching
 *  SWIM_ENTER_DEPTH_THRESHOLD's own depth — so the wake persists through
 *  the normal SWIM_FLOAT_DEPTH (0.55) float-idle bobbing but cuts off once
 *  she's genuinely diving down, not just swimming at the surface. */
const WAKE_NEAR_SURFACE_DEPTH_FRACTION = 0.3;

/** Minimum horizontal speed (world units/second) — measured directly from
 *  frame-to-frame player XZ displacement, since PlayerController doesn't
 *  expose its internal velocity — below which the player counts as "not
 *  really moving" for the wake VFX (treading water in place shouldn't
 *  leave a trail). */
const WAKE_MIN_SPEED = 0.3;
```

Add three new private fields directly after the existing `private _playerIsSwimming = false;` field:

```typescript

  /** Continuous wake-trail emitter handle while swimming+moving near the
   *  surface — see _updateWake(). null when no wake is currently active
   *  (or before the room has ever been entered). A stopped EmitterHandle
   *  can never be restarted (see ParticleSystem.EmitterHandle.stop()'s
   *  doc), so re-activating the wake always creates a fresh handle. */
  private _wakeEmitter: EmitterHandle | null = null;

  /** Previous frame's player X/Z, used by _updateWake() to measure
   *  horizontal speed directly. Seeded from the player's actual position
   *  in enter() so the very first frame after entering never reads as a
   *  spurious large jump. */
  private _prevWakeX = 0;
  private _prevWakeZ = 0;
```

At the end of `enter()` (right before its closing `}`, after the perimeter-walls `for` loop), add:

```typescript

    // Wake-trail VFX bookkeeping (see _updateWake()) — seed with the
    // player's actual current position so the very first frame after
    // entering doesn't read as a spurious large jump.
    const startPos = this._player.group.position;
    this._prevWakeX = startPos.x;
    this._prevWakeZ = startPos.z;
```

In `exit()`, add this right before its closing `}` (after `this._tierBodies.length = 0;`):

```typescript
    if (this._wakeEmitter) {
      this._wakeEmitter.stop();
      this._wakeEmitter = null;
    }
```

At the end of `update(dt)` (right before its closing `}`, after the swim/wade `if (this._playerIsSwimming) { ... } else if (...) { ... } else { ... }` chain), add:

```typescript

    this._updateWake(dt);
```

Add a new private method right after `update(dt)`'s closing `}` (before the existing `_spawnSplash` method's doc comment):

```typescript
  /** Starts/updates/stops a continuous wake-trail particle emitter that
   *  follows the player while she's swimming, near the surface (not
   *  diving deep), and actually moving (not treading water in place) — a
   *  subtle continuous trail behind a surface swimmer, distinct from the
   *  one-shot splash burst in _spawnSplash(). Turns off automatically the
   *  instant any of the three conditions stops holding. */
  private _updateWake(dt: number): void {
    const pos = this._player.group.position;
    const horizSpeed = dt > 0
      ? Math.hypot(pos.x - this._prevWakeX, pos.z - this._prevWakeZ) / dt
      : 0;
    this._prevWakeX = pos.x;
    this._prevWakeZ = pos.z;

    const nearSurface = this._player.underwaterDepthFraction < WAKE_NEAR_SURFACE_DEPTH_FRACTION;
    const shouldWake = this._player.isSwimming && nearSurface && horizSpeed > WAKE_MIN_SPEED;

    if (shouldWake) {
      if (this._wakeEmitter && this._wakeEmitter.active) {
        this._wakeEmitter.setPos(pos.x, WATER_LAB_SURFACE_Y, pos.z);
      } else {
        this._wakeEmitter = this._particles.addEmitter(
          new THREE.Vector3(pos.x, WATER_LAB_SURFACE_Y, pos.z),
          {
            color:    0xdff3ff, // same pale blue/white as the splash burst
            rate:     10,
            speed:    0.4,
            lifetime: 0.5,
            upBias:   0,
            spread:   Math.PI,
            gravity:  false,
          },
        );
      }
    } else if (this._wakeEmitter && this._wakeEmitter.active) {
      this._wakeEmitter.stop();
    }
  }

```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/scene/WaterLabScene.test.ts`
Expected: all tests in the file PASS, including the new wake-trail test.

- [ ] **Step 5: Run the broader scene/levels suite for regressions**

Run: `npx vitest run tests/levels tests/scene`
Expected: same pass/fail counts as the pre-existing baseline (5 failures in `enemyLoader.test.ts`/`towerGenerator.test.ts`, unrelated to this change) — no new failures.

- [ ] **Step 6: Commit**

```bash
git add src/scene/WaterLabScene.ts tests/scene/WaterLabScene.test.ts
git commit -m "Add particle wake-trail VFX for surface swimming in Water Lab

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Full regression run and live verification

**Files:** none (verification only).

**Interfaces:** none — this task only runs commands and observes the running app.

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: only pre-existing baseline errors remain (grep the output for `clips.ts`/`WaterLabScene.ts`/`anim.test.ts`/`WaterLabScene.test.ts` — none should appear).

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: same failure count/files as the established pre-existing baseline (9 failures / 4 files, per this project's history) — no new failures introduced by either task.

- [ ] **Step 3: Live verification in the browser**

With the dev server running (confirm the correct port first, e.g. `curl -sf http://127.0.0.1:5175 >/dev/null && echo up`), open Water Lab (`?devroom=water-lab` or via the Overworld Studio's Water Lab button) and manually confirm:
- Swimming forward now shows a symmetric breaststroke stroke (both arms sweep out and pull in together, legs kick together) instead of the old alternating freestyle stroke.
- A faint pale-blue particle trail follows the princess while she swims forward near the surface, and stops when she stops moving or dives deep.

- [ ] **Step 4: Report results to the user**

Summarize the verification results (test counts, live-check observations) before considering the plan complete.
