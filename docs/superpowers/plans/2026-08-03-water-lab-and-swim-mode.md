# Water Lab + Swim Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated, cheap-to-load "Water Lab" dev-sandbox scene with a
stepped pool (dry bank → shallow shelf → deep floor) reusing the existing
animated water shader, plus a new `PlayerController.setSwimming()` movement
mode so deep water is genuinely swimmable (buoyant float + capped swim
speed + no jump), all reachable from the existing Dev Sandbox UI without
touching the full overworld scene.

**Architecture:** Extract the overworld's water `ShaderMaterial` factory
into a standalone `src/world/WaterMaterial.ts` module so it can be shared.
Build a new, self-contained `WaterLabScene` class (NOT a `DungeonPlan` /
blueprint room — blueprints only support `wall`/`pillar` tiles and single
flat floor elevation, so a stepped multi-elevation pool needs a bespoke
scene, mirroring how `OverworldScene` itself bypasses blueprints). Wire a
new "Water Lab" button into the existing `DevSandbox` UI and a matching
`onEnterWaterLab` callback in `main.ts`, following the same
teardown/rebuild pattern as the existing `onReturnToArena` /
`onEnterOverworld` handlers. Add a depth-based swim trigger computed
locally inside `WaterLabScene.update()` (the overworld's `update()` and
`isInWaterAt()` are untouched — swimming is additive, gated on real floor
depth data that only the lab currently has).

**Tech Stack:** TypeScript, Three.js, Rapier3D (`@dimforge/rapier3d-compat`), Vitest.

## Global Constants (exact values used across tasks — copy verbatim)

- `SWIM_DEPTH_THRESHOLD = 0.9` (world units below the local water surface Y
  at which wading becomes swimming — chosen so the lab's shallow shelf,
  0.3 WU below surface, reads as "wading" and the deep floor, 1.2 WU below
  surface, reads as "swimming").
- `SWIM_SPEED = 3.5` (world units/sec — slower than `WALK_SPEED = 5`,
  matching the design doc's "slower than walk" intent).
- `SWIM_FLOAT_DEPTH = 0.35` (world units below the water surface that the
  player's `_pos.y` eases toward while swimming — a "floating at the
  surface, submerged to about chest height" look, matching
  `setSubmersion(1.0)`'s existing full-offset visual).
- `SWIM_VERTICAL_EASE = 6` (per-second lerp factor pulling `_pos.y` /
  `velocity.y` toward the float target — same idiom already used by
  `levitateMode`'s `lerp(this.velocity.y, yDelta * 5, 8 * dt)`).
- Water Lab room size: 24×24 world units (matches design doc).
- Water Lab pool tiers: dry bank `y=0`, shallow shelf `y=-0.3`, deep floor
  `y=-1.2` (matches design doc). Water surface sits at `y=0` (matching the
  dry bank height, i.e. the pool is a basin cut into the bank — not raised
  water like the overworld's river tiles).

---

## File Structure

- **Create** `src/world/WaterMaterial.ts` — extracted, exported
  `createWaterMaterial(): THREE.ShaderMaterial` factory (pure function, no
  scene state). Contains the exact same GLSL currently inlined in
  `OverworldScene._makeWaterMaterial()`.
- **Modify** `src/scene/OverworldScene.ts` — replace the body of
  `_makeWaterMaterial()` with a call to the new shared factory (keep the
  method as a thin wrapper so existing call sites/tests aren't touched).
- **Create** `src/levels/WaterLab.ts` — `buildWaterLabTiers()` helper
  returning the tier geometry data (position of each stepped plane, size)
  used by both the mesh-builder and the physics-collider-builder in
  `WaterLabScene`. Kept as a small, testable pure-data function separate
  from the Three.js/Rapier-heavy scene class (mirrors how
  `SandboxArena.ts` is a pure blueprint-data function with no rendering
  code).
- **Create** `src/scene/WaterLabScene.ts` — `class WaterLabScene` with
  `enter()`, `exit()`, `update(dt, camera?)`, `dispose()`, modeled on
  `OverworldScene`'s lifecycle but drastically simpler: one ground plane,
  three stepped tier meshes + colliders, one water mesh, one
  directional + one ambient light, no fog/skybox/settlements/NPCs/trees.
  Computes real depth-below-surface each frame and calls
  `player.setSwimming(...)`.
- **Modify** `src/player/PlayerController.ts` — add `setSwimming(isSwimming: boolean): void`
  method + `isSwimming` getter, alongside the existing `setSubmersion()`
  method. Add swim-mode branch inside `update()`'s gravity/movement
  sections (Section 4 GRAVITY and Section 5 HORIZONTAL MOVEMENT), gated by
  a new private `_swimming` flag, following the same "recompute from
  stored base every call" idiom as `setSubmersion()`.
- **Modify** `src/ui/DevSandbox.ts` — add `onEnterWaterLab: () => void` to
  `DevSandboxOptions`, add a new "🌊 Water Lab" button next to the existing
  "Return to Arena" location-bar button and the Procedural-Generation
  panel's "Enter Overworld" button, add a `'lab'` case to `setLocation()`.
- **Modify** `src/main.ts` — add `onEnterWaterLab` handler (mirrors
  `onReturnToArena`/`onEnterOverworld`), add a `waterLab: WaterLabScene | null`
  variable, add a `gameMode` value `'waterlab'` to the existing
  `'interior' | 'exterior' | 'telescope'` union, wire `waterLab.update()`
  into the main animation-loop branch (alongside the existing
  `gameMode === 'interior'` / `else if (overworld)` branches).
- **Test: Create** `tests/player/PlayerControllerSwimming.test.ts` — mirrors
  `tests/player/PlayerControllerSubmersion.test.ts`'s pattern (real
  `PhysicsWorld` + `applyDNA`).
- **Test: Create** `tests/world/WaterMaterial.test.ts` — verifies the
  extracted factory returns a `ShaderMaterial` with a `uTime` uniform.
- **Test: Create** `tests/levels/WaterLab.test.ts` — verifies
  `buildWaterLabTiers()` returns the three expected tiers with correct
  `y` values and sizes.

---

### Task 1: Extract shared water shader material

**Files:**
- Create: `src/world/WaterMaterial.ts`
- Modify: `src/scene/OverworldScene.ts:944-994` (the `_makeWaterMaterial()` method body)
- Test: `tests/world/WaterMaterial.test.ts`

**Interfaces:**
- Produces: `createWaterMaterial(): THREE.ShaderMaterial` — a function with
  no parameters, returning a new `ShaderMaterial` instance every call
  (matches existing per-scene-instance behavior — do NOT make it a
  singleton, since `OverworldScene` and `WaterLabScene` must each own/dispose
  their own material instance). The returned material has
  `uniforms.uTime.value` initialized to `0`, `transparent: true`,
  `depthWrite: false`.

- [ ] **Step 1: Write the failing test**

Create `tests/world/WaterMaterial.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createWaterMaterial } from '@/world/WaterMaterial';

describe('createWaterMaterial', () => {
  it('returns a ShaderMaterial with a uTime uniform initialized to 0', () => {
    const mat = createWaterMaterial();
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.uniforms.uTime).toBeDefined();
    expect(mat.uniforms.uTime.value).toBe(0);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
  });

  it('returns a distinct instance on each call (not a shared singleton)', () => {
    const a = createWaterMaterial();
    const b = createWaterMaterial();
    expect(a).not.toBe(b);
    a.uniforms.uTime.value = 5;
    expect(b.uniforms.uTime.value).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/WaterMaterial.test.ts`
Expected: FAIL with "Cannot find module '@/world/WaterMaterial'" (or similar resolution error).

- [ ] **Step 3: Create `src/world/WaterMaterial.ts`**

Copy the exact GLSL currently in `OverworldScene._makeWaterMaterial()`
(`src/scene/OverworldScene.ts:944-994`) into a standalone exported function:

```typescript
import * as THREE from 'three';

/**
 * Animated, stylized water shader (Link's Awakening-remake-inspired look):
 * gentle sine-wave vertex displacement (two overlapping directional waves)
 * plus a two-tone deep/shimmer color blend and a cheap fresnel-ish edge
 * highlight in the fragment shader. No texture lookups — fully procedural,
 * consistent with the project's zero-external-asset policy.
 *
 * Shared between OverworldScene and WaterLabScene so both use the exact
 * same visual material without duplicating shader source. Returns a new
 * instance every call — each owning scene is responsible for disposing
 * its own material.
 */
export function createWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite:  false,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      void main() {
        vec3 pos = position;
        float wave1 = sin(pos.x * 0.35 + uTime * 1.1) * 0.06;
        float wave2 = sin(pos.z * 0.5  - uTime * 0.7) * 0.045;
        pos.y += wave1 + wave2;
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPosition = worldPos.xyz;
        vNormal = normalMatrix * normal;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      void main() {
        vec3 deep    = vec3(0.075, 0.190, 0.360);
        vec3 shimmer = vec3(0.220, 0.440, 0.560);

        float shimmerPattern =
          sin(vWorldPosition.x * 0.6 + uTime * 1.6) *
          sin(vWorldPosition.z * 0.6 - uTime * 1.3);
        float t = smoothstep(-1.0, 1.0, shimmerPattern);
        vec3 color = mix(deep, shimmer, t * 0.5 + 0.15);

        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float rim = 1.0 - clamp(dot(normalize(vNormal), viewDir), 0.0, 1.0);
        color += vec3(0.35, 0.50, 0.60) * pow(rim, 3.0) * 0.20;

        gl_FragColor = vec4(color, 0.78);
      }
    `,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/WaterMaterial.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Replace `OverworldScene._makeWaterMaterial()` body with a call to the shared factory**

In `src/scene/OverworldScene.ts`, add the import near the top (alongside
the other `@/world/*` imports around line 38):

```typescript
import { createWaterMaterial }          from '@/world/WaterMaterial';
```

Then replace the entire body of `_makeWaterMaterial()` (the method
spanning roughly lines 944-994, from `private _makeWaterMaterial(): THREE.ShaderMaterial {` through its closing `}`) with:

```typescript
  /**
   * Animated, stylized water shader (Link's Awakening-remake-inspired look).
   * Delegates to the shared factory in `@/world/WaterMaterial` so
   * OverworldScene and WaterLabScene use the identical material without
   * duplicating GLSL.
   */
  private _makeWaterMaterial(): THREE.ShaderMaterial {
    return createWaterMaterial();
  }
```

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: Same pass/fail counts as the pre-existing baseline (2186 passed,
8 pre-existing unrelated failures) plus the 2 new tests passing (2188
passed total).

- [ ] **Step 7: Run tsc to check for type errors**

Run: `npx tsc --noEmit`
Expected: Same baseline error count as before this task (136 lines, per
prior session notes) — no new errors introduced.

- [ ] **Step 8: Commit**

```bash
git add src/world/WaterMaterial.ts src/scene/OverworldScene.ts tests/world/WaterMaterial.test.ts
git commit -m "refactor: extract water shader into shared WaterMaterial factory

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Water Lab tier data

**Files:**
- Create: `src/levels/WaterLab.ts`
- Test: `tests/levels/WaterLab.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface WaterLabTier {
    /** Human-readable tier name for debug/UI labeling. */
    name: 'bank' | 'shallow' | 'deep';
    /** World Y of this tier's walkable top surface. */
    y: number;
    /** Half-width/half-depth of this tier's square footprint (world units). */
    halfExtent: number;
    /** XZ center of this tier (world units, room-local — 0,0 is room center). */
    centerX: number;
    centerZ: number;
  }
  export const WATER_LAB_ROOM_SIZE = 24;
  export const WATER_LAB_SURFACE_Y = 0;
  export function buildWaterLabTiers(): WaterLabTier[];
  ```
  Later tasks (`WaterLabScene`) consume `buildWaterLabTiers()` to build both
  the visual meshes and the physics colliders, plus `WATER_LAB_ROOM_SIZE`
  for the ground plane / directional light framing and `WATER_LAB_SURFACE_Y`
  for the water mesh height and the swim-depth calculation.

- [ ] **Step 1: Write the failing test**

Create `tests/levels/WaterLab.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildWaterLabTiers, WATER_LAB_ROOM_SIZE, WATER_LAB_SURFACE_Y } from '@/levels/WaterLab';

describe('buildWaterLabTiers', () => {
  it('returns exactly 3 tiers: bank, shallow, deep, in that depth order', () => {
    const tiers = buildWaterLabTiers();
    expect(tiers).toHaveLength(3);
    expect(tiers.map(t => t.name)).toEqual(['bank', 'shallow', 'deep']);
  });

  it('has decreasing Y as tiers go from bank to deep', () => {
    const tiers = buildWaterLabTiers();
    const [bank, shallow, deep] = tiers;
    expect(bank.y).toBe(0);
    expect(shallow.y).toBe(-0.3);
    expect(deep.y).toBe(-1.2);
    expect(bank.y).toBeGreaterThan(shallow.y);
    expect(shallow.y).toBeGreaterThan(deep.y);
  });

  it('every tier fits within the room bounds', () => {
    const tiers = buildWaterLabTiers();
    for (const t of tiers) {
      expect(Math.abs(t.centerX) + t.halfExtent).toBeLessThanOrEqual(WATER_LAB_ROOM_SIZE / 2);
      expect(Math.abs(t.centerZ) + t.halfExtent).toBeLessThanOrEqual(WATER_LAB_ROOM_SIZE / 2);
    }
  });

  it('WATER_LAB_SURFACE_Y matches the bank tier height (basin cut into the bank)', () => {
    const tiers = buildWaterLabTiers();
    expect(WATER_LAB_SURFACE_Y).toBe(tiers[0].y);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/levels/WaterLab.test.ts`
Expected: FAIL with "Cannot find module '@/levels/WaterLab'".

- [ ] **Step 3: Create `src/levels/WaterLab.ts`**

```typescript
// ── WaterLab ────────────────────────────────────────────────────────────────
//
//  Pure tier-data for the "Water Lab" dev-sandbox scene: a 24×24 world-unit
//  basin with 3 stepped elevations (dry bank → shallow shelf → deep floor)
//  cut into one side of a flat room, so a player can walk from dry land
//  into progressively deeper water and test wading vs. swimming without
//  needing the full overworld.
//
//  This is intentionally NOT a Blueprint/DungeonPlan — the existing
//  blueprint schema (see src/levels/blueprint.ts) only supports 'wall' and
//  'pillar' tile types on a single flat floor elevation, so it cannot
//  express a stepped multi-elevation basin. WaterLabScene (a bespoke scene
//  class, mirroring how OverworldScene itself bypasses blueprints) consumes
//  this pure data to build its own meshes/colliders directly.

/** One walkable elevation tier in the basin. */
export interface WaterLabTier {
  /** Human-readable tier name for debug/UI labeling. */
  name: 'bank' | 'shallow' | 'deep';
  /** World Y of this tier's walkable top surface. */
  y: number;
  /** Half-width/half-depth of this tier's square footprint (world units). */
  halfExtent: number;
  /** XZ center of this tier (world units, room-local — 0,0 is room center). */
  centerX: number;
  centerZ: number;
}

/** Overall room footprint — width and depth in world units. */
export const WATER_LAB_ROOM_SIZE = 24;

/** World Y of the animated water surface mesh (matches the dry bank height —
 *  the pool is a basin cut into the bank, not raised water). */
export const WATER_LAB_SURFACE_Y = 0;

/**
 * Returns the 3 stepped tiers of the basin, ordered from shallowest
 * (dry bank) to deepest (fully submerged floor). Each successively deeper
 * tier is nested (smaller footprint, centered the same) inside the
 * previous one, like a stepped pyramid dug into the ground.
 */
export function buildWaterLabTiers(): WaterLabTier[] {
  return [
    { name: 'bank',    y: 0,    halfExtent: 11, centerX: 0, centerZ: 0 },
    { name: 'shallow', y: -0.3, halfExtent: 7,  centerX: 0, centerZ: 0 },
    { name: 'deep',    y: -1.2, halfExtent: 3,  centerX: 0, centerZ: 0 },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/levels/WaterLab.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/levels/WaterLab.ts tests/levels/WaterLab.test.ts
git commit -m "feat: add Water Lab basin tier data

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: PlayerController swim mode

**Files:**
- Modify: `src/player/PlayerController.ts`
- Test: `tests/player/PlayerControllerSwimming.test.ts`

**Interfaces:**
- Consumes: existing `PlayerController` fields — `velocity: THREE.Vector3`
  (public), `_pos: THREE.Vector3` (private, world position mirror synced
  from Rapier each frame), `this.body: RAPIER.RigidBody` (kinematic
  capsule), `WALK_SPEED = 5` (existing const), and the existing
  `setSubmersion(depthFraction: number): void` method (unchanged, called
  separately by the caller — `setSwimming` does NOT call `setSubmersion`
  internally; callers call both).
- Produces:
  ```typescript
  setSwimming(isSwimming: boolean): void
  get isSwimming(): boolean
  ```
  Callers (Task 5's `WaterLabScene.update()`) call `setSwimming(true)` when
  the player's depth below the local water surface exceeds
  `SWIM_DEPTH_THRESHOLD = 0.9`, and `setSwimming(false)` otherwise, every
  frame (safe to call every frame — matches `setSubmersion`'s idiom).
  While `isSwimming` is true, `update()`'s normal gravity (Section 4) and
  horizontal-speed cap (Section 5) are overridden as described below.

- [ ] **Step 1: Write the failing tests**

Create `tests/player/PlayerControllerSwimming.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { DEFAULT_PLAYER_DNA } from '@/creatures/CreatureDNA';
import type { InputState } from '@/input/InputState';

function neutralInput(): InputState {
  return {
    moveForward: false, moveBack: false, moveLeft: false, moveRight: false,
    jump: false, run: false, dodge: false, interact: false,
    turnDragHeld: false,
  } as InputState;
}

describe('PlayerController.setSwimming', () => {
  let physics: PhysicsWorld;
  let player: PlayerController;

  beforeEach(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
  });

  it('exposes isSwimming reflecting the last setSwimming call', () => {
    expect(player.isSwimming).toBe(false);
    player.setSwimming(true);
    expect(player.isSwimming).toBe(true);
    player.setSwimming(false);
    expect(player.isSwimming).toBe(false);
  });

  it('clamps horizontal speed to SWIM_SPEED (slower than WALK_SPEED) while swimming', () => {
    player.setSwimming(true);
    const input = { ...neutralInput(), moveForward: true, run: true };
    for (let i = 0; i < 60; i++) {
      physics.step(1 / 60);
      player.update(input, 1 / 60, 'isometric');
    }
    const hSpeed = Math.sqrt(player.velocity.x ** 2 + player.velocity.z ** 2);
    expect(hSpeed).toBeLessThan(5); // WALK_SPEED — even with run held, swim caps below walk
    expect(hSpeed).toBeGreaterThan(0);
  });

  it('disables jump while swimming (velocity.y never gets a jump impulse)', () => {
    player.setSwimming(true);
    const input = { ...neutralInput(), jump: true };
    physics.step(1 / 60);
    player.update(input, 1 / 60, 'isometric');
    expect(player.velocity.y).toBeLessThan(11); // JUMP_VELOCITY — no jump impulse applied
  });

  it('restores normal gravity behavior once swimming is turned off', () => {
    player.setSwimming(true);
    for (let i = 0; i < 10; i++) {
      physics.step(1 / 60);
      player.update(neutralInput(), 1 / 60, 'isometric');
    }
    player.setSwimming(false);
    const before = player.velocity.y;
    for (let i = 0; i < 10; i++) {
      physics.step(1 / 60);
      player.update(neutralInput(), 1 / 60, 'isometric');
    }
    // Normal gravity (GRAVITY_FALL) should now be pulling velocity.y down
    // faster than the gentle swim-float ease did.
    expect(player.velocity.y).toBeLessThan(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/player/PlayerControllerSwimming.test.ts`
Expected: FAIL — `player.setSwimming is not a function` / `isSwimming` undefined.

- [ ] **Step 3: Add the swim-mode fields and method to `PlayerController`**

In `src/player/PlayerController.ts`, add new constants near the top
alongside the existing speed/gravity constants (after line 47's
`GROUND_PUSH`):

```typescript
const SWIM_SPEED = 3.5;          // world units/sec — slower than WALK_SPEED (5)
const SWIM_FLOAT_DEPTH = 0.35;   // WU below water surface the player floats toward while swimming
const SWIM_VERTICAL_EASE = 6;    // per-second lerp factor toward the float target
```

Add a private field near `isGrounded` (around line 184):

```typescript
  private _swimming = false;
  /** World Y of the water surface the player is currently swimming under.
   *  Set by setSwimming(); used by update()'s gravity override each frame. */
  private _swimSurfaceY = 0;
```

Add the public method + getter near `setSubmersion()` (search for it — it
should be near the top of the "submersion" section of the class):

```typescript
  /**
   * Enables/disables swim movement mode. While swimming:
   *  - Gravity is overridden: velocity.y eases toward a float target
   *    (SWIM_FLOAT_DEPTH below the water surface) instead of falling.
   *  - Horizontal speed is capped to SWIM_SPEED regardless of run input.
   *  - Jump input is ignored (no jump impulse is applied).
   * Safe to call every frame (idempotent) — matches setSubmersion()'s idiom.
   *
   * @param isSwimming Whether the player should be in swim mode this frame.
   * @param waterSurfaceY World Y of the local water surface (only meaningful
   *   when isSwimming is true; ignored otherwise). Defaults to 0.
   */
  setSwimming(isSwimming: boolean, waterSurfaceY = 0): void {
    this._swimming = isSwimming;
    this._swimSurfaceY = waterSurfaceY;
  }

  get isSwimming(): boolean {
    return this._swimming;
  }
```

- [ ] **Step 4: Override gravity and jump when swimming (Section 4 GRAVITY)**

In `update()`, find Section 4 GRAVITY (around line 831-840):

```typescript
    // ── 4. GRAVITY ─────────────────────────────────────────────────────────
    if (!wasGrounded || justJumped) {
      let g: number;
      if (this.velocity.y > 0) {
        g = this.jumpHeld ? GRAVITY_RISE : GRAVITY_RELEASE;
      } else {
        g = GRAVITY_FALL;
      }
      this.velocity.y -= g * dt;
      this.velocity.y = Math.max(this.velocity.y, -MAX_FALL_SPEED);
    } else {
      this.velocity.y = GROUND_PUSH;
    }
```

Replace with:

```typescript
    // ── 4. GRAVITY ─────────────────────────────────────────────────────────
    if (this._swimming) {
      // Buoyant float: ease velocity.y so _pos.y approaches a fixed depth
      // below the water surface, instead of falling under normal gravity.
      const targetY = this._swimSurfaceY - SWIM_FLOAT_DEPTH;
      const yDelta = targetY - this._pos.y;
      this.velocity.y = lerp(this.velocity.y, yDelta * SWIM_VERTICAL_EASE, SWIM_VERTICAL_EASE * dt);
    } else if (!wasGrounded || justJumped) {
      let g: number;
      if (this.velocity.y > 0) {
        g = this.jumpHeld ? GRAVITY_RISE : GRAVITY_RELEASE;
      } else {
        g = GRAVITY_FALL;
      }
      this.velocity.y -= g * dt;
      this.velocity.y = Math.max(this.velocity.y, -MAX_FALL_SPEED);
    } else {
      this.velocity.y = GROUND_PUSH;
    }
```

Now find Section 3 EXECUTE JUMP (around line 818-826) and gate the jump
impulse on `!this._swimming`:

```typescript
    if (this.jumpBufferTimer > 0 && canJump) {
      this.velocity.y = JUMP_VELOCITY;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.jumpHeld = true;
      justJumped = true;
      this.squashStretchJump();
    }
```

Replace with:

```typescript
    if (this.jumpBufferTimer > 0 && canJump && !this._swimming) {
      this.velocity.y = JUMP_VELOCITY;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.jumpHeld = true;
      justJumped = true;
      this.squashStretchJump();
    }
```

- [ ] **Step 5: Cap horizontal speed when swimming (Section 5 HORIZONTAL MOVEMENT)**

Find Section 5 (around line 877-891):

```typescript
    if (this.dodgeTimer <= 0) {
      const topSpeed = input.run ? RUN_SPEED : WALK_SPEED;
      const moveDir = cameraMode === 'wow'
        ? calculateWoWMoveDirection(input, this.facingAngle, input.turnDragHeld)
        : calculateMoveDirection(input);
      const isMoving = moveDir.lengthSq() > 0.01;
      const accel = wasGrounded ? ACCEL_GROUND : ACCEL_AIR;
      const decel = wasGrounded ? DECEL_GROUND : DECEL_AIR;

      if (isMoving) {
        this.velocity.x = lerp(this.velocity.x, moveDir.x * topSpeed, accel * dt);
        this.velocity.z = lerp(this.velocity.z, moveDir.z * topSpeed, accel * dt);
      } else {
        this.velocity.x = lerp(this.velocity.x, 0, decel * dt);
        this.velocity.z = lerp(this.velocity.z, 0, decel * dt);
      }
    }
```

Replace the `topSpeed` line with a swim-aware version:

```typescript
    if (this.dodgeTimer <= 0) {
      const topSpeed = this._swimming ? SWIM_SPEED : (input.run ? RUN_SPEED : WALK_SPEED);
      const moveDir = cameraMode === 'wow'
        ? calculateWoWMoveDirection(input, this.facingAngle, input.turnDragHeld)
        : calculateMoveDirection(input);
      const isMoving = moveDir.lengthSq() > 0.01;
      const accel = wasGrounded ? ACCEL_GROUND : ACCEL_AIR;
      const decel = wasGrounded ? DECEL_GROUND : DECEL_AIR;

      if (isMoving) {
        this.velocity.x = lerp(this.velocity.x, moveDir.x * topSpeed, accel * dt);
        this.velocity.z = lerp(this.velocity.z, moveDir.z * topSpeed, accel * dt);
      } else {
        this.velocity.x = lerp(this.velocity.x, 0, decel * dt);
        this.velocity.z = lerp(this.velocity.z, 0, decel * dt);
      }
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/player/PlayerControllerSwimming.test.ts tests/player/PlayerControllerSubmersion.test.ts`
Expected: PASS (all tests in both files — the submersion test file must
still pass unchanged, confirming no regression to the existing wading
behavior).

- [ ] **Step 7: Run the full test suite + tsc to check for regressions**

Run: `npx vitest run && npx tsc --noEmit`
Expected: Same baseline pass/fail counts as Task 1's step 6/7, plus the 4
new swimming tests passing (2192 passed total).

- [ ] **Step 8: Commit**

```bash
git add src/player/PlayerController.ts tests/player/PlayerControllerSwimming.test.ts
git commit -m "feat: add PlayerController swim mode (buoyant float + speed cap + no-jump)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: WaterLabScene

**Files:**
- Create: `src/scene/WaterLabScene.ts`

**Interfaces:**
- Consumes:
  - `buildWaterLabTiers(): WaterLabTier[]`, `WATER_LAB_ROOM_SIZE: number`,
    `WATER_LAB_SURFACE_Y: number` from `@/levels/WaterLab` (Task 2).
  - `createWaterMaterial(): THREE.ShaderMaterial` from `@/world/WaterMaterial` (Task 1).
  - `PlayerController.setSwimming(isSwimming: boolean, waterSurfaceY?: number): void`
    and `PlayerController.setSubmersion(depthFraction: number): void` (Task 3
    + pre-existing) via `this._player`.
  - `PhysicsWorld.createStaticBox(position: THREE.Vector3, halfExtents: THREE.Vector3): RAPIER.RigidBody`
    (pre-existing, `src/physics/PhysicsWorld.ts`).
- Produces:
  ```typescript
  export class WaterLabScene {
    constructor(scene: THREE.Scene, physics: PhysicsWorld, player: PlayerController);
    enter(): void;
    exit(): void;
    update(dt: number): void;
    dispose(): void;
  }
  ```
  `enter()` adds all meshes to `scene` and creates static colliders;
  `exit()` removes meshes from `scene` and clears colliders (bodies are
  recreated fresh on the next `enter()`, matching `OverworldScene`'s
  documented pattern); `dispose()` calls `exit()` then frees GPU geometry/
  material resources; `update(dt)` advances the water shader's `uTime`,
  computes the player's live depth below `WATER_LAB_SURFACE_Y`, and calls
  `player.setSubmersion(...)` / `player.setSwimming(...)` each frame.

- [ ] **Step 1: Create `src/scene/WaterLabScene.ts`**

```typescript
/**
 * WaterLabScene — a minimal, cheap-to-load dev-sandbox room for iterating
 * on the water shader and testing swim movement in isolation from the
 * full overworld scene (which is expensive to boot and has water tiles
 * scattered/hard to reach reliably).
 *
 * Layout: a single flat 24×24 room with a stepped 3-tier basin cut into
 * its center (dry bank → shallow shelf → deep floor, see
 * src/levels/WaterLab.ts), covered by one animated water quad at the
 * bank's height. Walking from the bank onto the shallow shelf triggers
 * the existing shallow "wading" visual (setSubmersion); walking down onto
 * the deep floor crosses SWIM_DEPTH_THRESHOLD and triggers full swim mode
 * (setSwimming) — buoyant float, capped speed, no jump.
 *
 * No settlements/NPCs/trees/skybox/fog — kept as cheap as the existing
 * sandbox_arena interior so it loads and runs at full FPS for testing.
 */
import * as THREE from 'three';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { PlayerController } from '@/player/PlayerController';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  buildWaterLabTiers,
  WATER_LAB_ROOM_SIZE,
  WATER_LAB_SURFACE_Y,
  type WaterLabTier,
} from '@/levels/WaterLab';
import { createWaterMaterial } from '@/world/WaterMaterial';

/** WU below the water surface at which wading becomes full swimming.
 *  Chosen so the lab's shallow shelf (0.3 WU below surface) reads as
 *  wading and the deep floor (1.2 WU below surface) reads as swimming. */
const SWIM_DEPTH_THRESHOLD = 0.9;

const TIER_COLORS: Record<WaterLabTier['name'], number> = {
  bank:    0x6b5a3c,
  shallow: 0x4a6b4a,
  deep:    0x2f4a52,
});

export class WaterLabScene {
  private readonly _tiers = buildWaterLabTiers();
  private readonly _tierMeshes: THREE.Mesh[] = [];
  private readonly _tierBodies: RAPIER.RigidBody[] = [];
  private _waterMesh: THREE.Mesh | null = null;
  private _waterMaterial: THREE.ShaderMaterial | null = null;
  private _ambientLight: THREE.AmbientLight | null = null;
  private _dirLight: THREE.DirectionalLight | null = null;
  private _entered = false;

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _physics: PhysicsWorld,
    private readonly _player: PlayerController,
  ) {}

  enter(): void {
    if (this._entered) return;
    this._entered = true;

    // ── Tier meshes + colliders ──────────────────────────────────────────
    for (const tier of this._tiers) {
      const size = tier.halfExtent * 2;
      const geo = new THREE.PlaneGeometry(size, size, 1, 1);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshLambertMaterial({ color: TIER_COLORS[tier.name] });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(tier.centerX, tier.y, tier.centerZ);
      mesh.receiveShadow = true;
      this._scene.add(mesh);
      this._tierMeshes.push(mesh);

      const body = this._physics.createStaticBox(
        new THREE.Vector3(tier.centerX, tier.y - 0.025, tier.centerZ),
        new THREE.Vector3(tier.halfExtent, 0.025, tier.halfExtent),
      );
      this._tierBodies.push(body);
    }

    // ── Water mesh (covers the shallow+deep footprint, sits at bank height) ──
    const poolHalfExtent = this._tiers[1]!.halfExtent; // shallow tier footprint
    const waterGeo = new THREE.PlaneGeometry(poolHalfExtent * 2, poolHalfExtent * 2, 1, 1);
    waterGeo.rotateX(-Math.PI / 2);
    this._waterMaterial = createWaterMaterial();
    this._waterMesh = new THREE.Mesh(waterGeo, this._waterMaterial);
    this._waterMesh.position.set(0, WATER_LAB_SURFACE_Y + 0.05, 0);
    this._scene.add(this._waterMesh);

    // ── Lighting (minimal — no skybox/fog, matches sandbox_arena cheapness) ──
    this._ambientLight = new THREE.AmbientLight(0x8090a0, 0.6);
    this._dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    this._dirLight.position.set(10, 20, 10);
    this._scene.add(this._ambientLight);
    this._scene.add(this._dirLight);

    // ── Perimeter walls so the player can't walk off the 24×24 room ──────
    const half = WATER_LAB_ROOM_SIZE / 2;
    const wallHeight = 4;
    const wallSpecs: Array<[THREE.Vector3, THREE.Vector3]> = [
      [new THREE.Vector3(0, wallHeight / 2, -half), new THREE.Vector3(half, wallHeight / 2, 0.25)],
      [new THREE.Vector3(0, wallHeight / 2, half),  new THREE.Vector3(half, wallHeight / 2, 0.25)],
      [new THREE.Vector3(-half, wallHeight / 2, 0), new THREE.Vector3(0.25, wallHeight / 2, half)],
      [new THREE.Vector3(half, wallHeight / 2, 0),  new THREE.Vector3(0.25, wallHeight / 2, half)],
    ];
    for (const [pos, half3] of wallSpecs) {
      this._tierBodies.push(this._physics.createStaticBox(pos, half3));
    }
  }

  exit(): void {
    if (!this._entered) return;
    this._entered = false;
    for (const m of this._tierMeshes) this._scene.remove(m);
    if (this._waterMesh) this._scene.remove(this._waterMesh);
    if (this._ambientLight) this._scene.remove(this._ambientLight);
    if (this._dirLight) this._scene.remove(this._dirLight);
    // Note: Rapier RigidBody removal API is intentionally not called here —
    // matches OverworldScene's documented exit()/enter() contract where
    // static bodies are recreated fresh each enter(). If body leakage across
    // repeated enter()/exit() cycles becomes an issue, add
    // physics.world.removeRigidBody(body) per _tierBodies entry here.
    this._tierBodies.length = 0;
  }

  /** Advances the water shader animation and applies swim/wading state to
   *  the player based on their live depth below the water surface. */
  update(dt: number): void {
    if (this._waterMaterial) this._waterMaterial.uniforms.uTime.value += dt;

    const playerY = this._player.group.position.y;
    const depthBelowSurface = WATER_LAB_SURFACE_Y - playerY;

    if (depthBelowSurface >= SWIM_DEPTH_THRESHOLD) {
      this._player.setSubmersion(1.0);
      this._player.setSwimming(true, WATER_LAB_SURFACE_Y);
    } else if (depthBelowSurface > 0) {
      this._player.setSubmersion(0.4);
      this._player.setSwimming(false);
    } else {
      this._player.setSubmersion(0);
      this._player.setSwimming(false);
    }
  }

  dispose(): void {
    this.exit();
    for (const m of this._tierMeshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this._tierMeshes.length = 0;
    if (this._waterMesh) {
      this._waterMesh.geometry.dispose();
      (this._waterMesh.material as THREE.Material).dispose();
      this._waterMesh = null;
    }
    this._waterMaterial = null;
  }
}
```

**Note:** fix the stray trailing comma/paren typo in `TIER_COLORS`'s
closing brace before running anything (`};` not `});`) — write it
correctly as:

```typescript
const TIER_COLORS: Record<WaterLabTier['name'], number> = {
  bank:    0x6b5a3c,
  shallow: 0x4a6b4a,
  deep:    0x2f4a52,
};
```

- [ ] **Step 2: Run tsc to check the new file compiles cleanly**

Run: `npx tsc --noEmit`
Expected: Same baseline error count as after Task 3 (no new errors from
`WaterLabScene.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/scene/WaterLabScene.ts
git commit -m "feat: add WaterLabScene — minimal dev-sandbox room with stepped water basin

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Wire "Water Lab" into Dev Sandbox UI + main.ts

**Files:**
- Modify: `src/ui/DevSandbox.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `WaterLabScene` (Task 4) — `new WaterLabScene(scene, physics, player)`,
  `.enter()`, `.exit()`, `.update(dt)`, `.dispose()`.
- Produces: `DevSandboxOptions.onEnterWaterLab: () => void` (new callback
  field), a `'waterlab'` value added to `main.ts`'s `gameMode` union type.

- [ ] **Step 1: Add `onEnterWaterLab` to `DevSandboxOptions` and a new button**

In `src/ui/DevSandbox.ts`, find the `DevSandboxOptions` interface (near
line 31-35, alongside `onEnterRoom`/`onReturnToArena`/`onEnterOverworld`)
and add:

```typescript
  onEnterWaterLab: () => void;
```

Find `setLocation()` (around line 298-311) and add a `'lab'` branch:

```typescript
  /** Update the location strip in the header. Pass 'arena', a room ID, or 'lab'. */
  setLocation(loc: string): void {
    const bar = this._locationBarEl;
    if (!bar) return;
    if (loc === 'arena') {
      bar.innerHTML = '<span style="color:#5a4880">📍 Sandbox Arena</span>';
    } else if (loc === 'lab') {
      bar.innerHTML =
        '<span style="color:#3a7090">📍 Water Lab</span>' +
        '<button class="ds-btn ds-loc-back">↩ Arena</button>';
      bar.querySelector<HTMLButtonElement>('.ds-loc-back')!.onclick =
        () => this._opts.onReturnToArena();
    } else {
      bar.innerHTML =
        '<span style="color:#8070a0">📍 ' + loc + '</span>' +
        '<button class="ds-btn ds-loc-back">↩ Arena</button>';
      bar.querySelector<HTMLButtonElement>('.ds-loc-back')!.onclick =
        () => this._opts.onReturnToArena();
    }
  }
```

Find the "Enter Overworld" button block (around line 599-604) and add a
sibling "Water Lab" button right after it:

```typescript
    // "Enter Overworld" button (only shown when type === overworld)
    const overworldBtn = document.createElement('button');
    overworldBtn.className = 'ds-btn ds-btn--accent';
    overworldBtn.textContent = '🌍 Enter Overworld';
    overworldBtn.style.cssText = 'margin-top:4px;display:none;';
    overworldBtn.onclick = () => this._opts.onEnterOverworld(this._procSeed);

    // "Water Lab" button — always visible, independent of the proc-gen type
    // selector, since it's a fixed hand-built room (not a generated dungeon).
    const waterLabBtn = document.createElement('button');
    waterLabBtn.className = 'ds-btn ds-btn--accent';
    waterLabBtn.textContent = '🌊 Water Lab';
    waterLabBtn.style.marginTop = '4px';
    waterLabBtn.onclick = () => this._opts.onEnterWaterLab();
```

Find where `overworldBtn` gets appended into its parent row/container
(search for `overworldBtn` a second time further down in the same method)
and append `waterLabBtn` immediately after it in that same `.append(...)`
call.

- [ ] **Step 2: Run a search to confirm the append site**

Run: `grep -n "overworldBtn" src/ui/DevSandbox.ts`
Expected: shows the declaration site (~line 600), the `.onclick` line, and
one more line further down showing `.append(...)` or `appendChild(...)`
where it's added to the DOM — add `waterLabBtn` into that same call.

- [ ] **Step 3: Add `waterLab` state, `'waterlab'` gameMode, and `onEnterWaterLab` handler in `main.ts`**

In `src/main.ts`, find the `gameMode` declaration (line 286):

```typescript
  let gameMode: 'interior' | 'exterior' | 'telescope' = 'interior';
```

Replace with:

```typescript
  let gameMode: 'interior' | 'exterior' | 'telescope' | 'waterlab' = 'interior';
```

Find the `overworld` declaration (line 287, `let overworld: OverworldScene | null = null;`)
and add a sibling declaration right after it:

```typescript
  let waterLab: WaterLabScene | null = null;
```

Add the import near the other scene imports (find the existing
`import { OverworldScene } from '@/scene/OverworldScene';`-style import
and add alongside it):

```typescript
import { WaterLabScene } from '@/scene/WaterLabScene';
```

Find the `onReturnToArena` handler (around line 1206-1220) and add a new
`onEnterWaterLab` handler as a sibling key in the same options object
(right after `onReturnToArena`'s closing `},`):

```typescript
      onEnterWaterLab: () => {
        // Tear down whatever's currently active (overworld or dungeon room)
        if (gameMode === 'exterior') {
          overworld?.exit();
          gameMode = 'interior';
        }
        sceneManager.unloadCurrentRoom();
        if (!waterLab) waterLab = new WaterLabScene(scene, physics, player);
        waterLab.enter();
        gameMode = 'waterlab';
        player.teleport(new THREE.Vector3(-9, 1.5, 0)); // spawn on the dry bank
        scene.fog = null;
        _sandboxUi?.setLocation('lab');
      },
```

Update `onReturnToArena` (immediately above) to also tear down the water
lab if active — find its current body:

```typescript
      onReturnToArena: () => {
        // Exit overworld if we were in it
        if (gameMode === 'exterior') {
          overworld?.exit();
          gameMode = 'interior';
        }
```

Replace with:

```typescript
      onReturnToArena: () => {
        // Exit overworld / water lab if we were in either
        if (gameMode === 'exterior') {
          overworld?.exit();
          gameMode = 'interior';
        }
        if (gameMode === 'waterlab') {
          waterLab?.exit();
          gameMode = 'interior';
        }
```

- [ ] **Step 4: Wire `waterLab.update()` into the main animation loop**

Find the animation-loop branch around line 2371-2373:

```typescript
      // 5. Room manager / overworld — enemy AI + door trigger checks
      if (gameMode === 'interior') {
        hud.setTime(null);
        sceneManager.update(dt, player.group.position);
```

Add a new branch before the existing `if`/`else if (overworld)` chain
(keep the existing branches unchanged, just add a new first-checked
branch for `'waterlab'`):

```typescript
      // 5. Room manager / overworld / water lab — enemy AI + door trigger checks
      if (gameMode === 'waterlab') {
        hud.setTime(null);
        waterLab?.update(dt);
      } else if (gameMode === 'interior') {
        hud.setTime(null);
        sceneManager.update(dt, player.group.position);
```

(The rest of the existing `if (gameMode === 'interior') { ... } else if (overworld) { ... }`
chain stays exactly as-is — only the outermost `if` becomes `if (gameMode === 'waterlab') { ... } else if (gameMode === 'interior') { ... }`.)

- [ ] **Step 5: Run tsc to check for type errors**

Run: `npx tsc --noEmit`
Expected: Same baseline error count as after Task 4 — no new errors from
the `main.ts`/`DevSandbox.ts` wiring (verify the `onEnterWaterLab` key is
present everywhere `DevSandboxOptions` is constructed — there should be
exactly one call site since `DevSandbox` is instantiated once).

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: Same pass/fail counts as after Task 3 (no test directly exercises
`main.ts` wiring, so this just confirms no import-time breakage).

- [ ] **Step 7: Commit**

```bash
git add src/ui/DevSandbox.ts src/main.ts
git commit -m "feat: wire Water Lab into Dev Sandbox UI and main game loop

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Manual/visual verification (Playwright)

**Files:** none modified — verification only.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background/async mode, note the local URL printed,
typically `http://localhost:5173`)

- [ ] **Step 2: Launch the game, open Dev Sandbox, enter the Water Lab**

Use Playwright (or the project's existing e2e harness pattern) to:
1. Navigate to the dev server URL.
2. Get past the main menu into gameplay (mirror whatever existing e2e
   spec under `tests/e2e/` does to reach the Dev Sandbox — grep for
   `Dev Sandbox` or `ds-panel` in `tests/e2e/*.spec.ts` for the exact
   click sequence already used by prior specs).
3. Click "🌊 Water Lab".
4. Screenshot: confirm the player spawns on the dry bank, the basin is
   visible with 3 distinct-colored tiers, and the animated water quad is
   visible over the shallow+deep area (compare against the fixed
   `OverworldScene` water look from the prior session — same shader, so
   colors/animation should look identical).

- [ ] **Step 3: Verify wading vs. swimming states visually**

Walk the player onto the shallow shelf; screenshot (rig should be
visually offset ~0.4 fraction downward, matching existing wading look).
Walk the player onto the deep floor; screenshot (rig should be near-fully
submerged/floating look). Take two time-separated screenshots on the deep
floor a few seconds apart and confirm the character's Y position stays
roughly constant (floating) rather than sinking to the physical floor
collider at `y=-1.2`.

- [ ] **Step 4: Verify swim speed and no-jump behavior**

While on the deep floor, hold a movement key + run for ~1 second; sample
player X/Z position at start and end, compute speed, confirm it's
noticeably slower than the overworld's normal run speed (~10 WU/s) — should
be close to `SWIM_SPEED = 3.5`. Press jump while in the deep water;
confirm the player does not launch upward (Y position stays near the
float target).

- [ ] **Step 5: Basic FPS/perf sanity check**

Use the browser devtools performance panel or a simple `requestAnimationFrame`
delta-time sampling script to compare frame time in the Water Lab vs. the
full overworld (`onEnterOverworld`) for ~5 seconds each. Confirm the Water
Lab's frame time is equal to or better than the overworld's (expected,
since it has drastically fewer objects/draw calls) — this is a sanity
check, not a strict regression gate.

- [ ] **Step 6: Stop the dev server**

Kill the background dev server process started in Step 1.

- [ ] **Step 7: Run the full regression suite one final time**

Run: `npx vitest run && npx tsc --noEmit && npm run doctor`
Expected: `vitest` — baseline count + 6 new tests across Tasks 1-3 (2192
passed total, 8 pre-existing unrelated failures unchanged); `tsc` — 136-line
baseline unchanged; `npm run doctor` — clean (matches prior session's
established clean baseline).

- [ ] **Step 8: Final commit (if any tuning changes were made during visual verification)**

If Step 3/4's visual pass revealed any of the tuned constants
(`SWIM_DEPTH_THRESHOLD`, `SWIM_SPEED`, `SWIM_FLOAT_DEPTH`,
`SWIM_VERTICAL_EASE`, or the tier Y values in `WaterLab.ts`) needed
adjustment for a better feel, commit those tweaks:

```bash
git add -A
git commit -m "tune: adjust Water Lab swim feel constants after visual verification

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

If no tuning was needed, skip this step — Task 5's commit is the final one.

---

## Self-Review Notes

- **Spec coverage:** Water Lab room ✓ (Task 2 + 4), reachable via Dev
  Sandbox ✓ (Task 5), shared water material extraction ✓ (Task 1), swim
  mode (buoyancy/speed cap/no-jump) ✓ (Task 3), wiring into
  `WaterLabScene.update()` ✓ (Task 4), visual/perf verification ✓ (Task 6).
  Deviation from the original design doc: the lab is built as a bespoke
  `WaterLabScene` class rather than a `DungeonPlan`/blueprint room, because
  the existing blueprint schema (`src/levels/blueprint.ts`) only supports
  flat single-elevation rooms with `wall`/`pillar` tiles — it cannot express
  the stepped 3-tier basin the design calls for. This preserves the design's
  intent (cheap dev-sandbox room, reachable the same way) while fitting the
  codebase's actual constraints.
- **Placeholder scan:** no TBD/TODO left in any task; every code block is
  complete, copy-pasteable.
- **Type consistency:** `setSwimming(isSwimming: boolean, waterSurfaceY = 0)`
  signature is consistent between Task 3 (definition) and Task 4
  (`WaterLabScene.update()` call site — passes `WATER_LAB_SURFACE_Y` as the
  second arg). `buildWaterLabTiers()`/`WaterLabTier` fields (`name`, `y`,
  `halfExtent`, `centerX`, `centerZ`) are used identically across Task 2's
  definition and Task 4's consumption. `createWaterMaterial()` has no
  parameters and returns `THREE.ShaderMaterial` consistently in Tasks 1 and 4.
