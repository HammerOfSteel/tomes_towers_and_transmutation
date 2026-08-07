# Water Lab: Swim/Dive Physics & Visual Water (Phase 2A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Water Lab dev room real SM64/Zelda-style swim-and-dive physics (hold Space to sink, release to float up, no oxygen limit), a deepened basin to dive in, splash VFX, two selectable higher-fidelity water-surface visuals (three.js `Water`/`Water2`) with a live A/B toggle, and an underwater screen tint/fog effect driven by the player's dive depth.

**Architecture:** All changes are additive to the existing swim system in `PlayerController` (diving is a second branch of the existing per-frame buoyancy override, not a new state machine) and to `WaterLabScene` (which already owns depth computation and now also owns splash detection and the water-surface object). The underwater screen effect lives in `main.ts` since post-processing/fog are app-level concerns, driven by a new `player.underwaterDepthFraction` getter so it needs no changes when this system later ports to the Overworld (a separate future phase, out of scope here).

**Tech Stack:** three.js `Water`/`Water2` (from `three/examples/jsm/objects/`, already available via the installed `three@^0.170.0` package and its bundled `@types/three` declarations), the existing `postprocessing` npm package (`Effect`/`BlendFunction`, alongside the existing `BloomEffect`), the existing `ParticleSystem` (`emit()`), vitest for unit tests.

## Global Constraints

- Free diving only — no oxygen/breath meter or drowning mechanic (per spec Non-Goals).
- One global underwater horizontal speed cap (`SWIM_SPEED`) — diving does not get its own, separate speed.
- Scope is the Water Lab dev room only. Do not touch `OverworldScene.ts`'s water handling or `WaterMaterial.ts` (the procedural shader `OverworldScene` still uses) — those are explicitly out of scope (Phase 2B).
- No new Playwright e2e test this phase — dive/visual feel is manually verified in the dev room (per spec Testing section). Existing Water Lab e2e coverage (`tests/e2e/water-lab.spec.ts`, `tests/e2e/overworld-studio-water-lab-launch.spec.ts`) must keep passing unmodified.
- New binary asset: `public/assets/textures/water/waternormals.jpg`, fetched from `https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/textures/waternormals.jpg` (three.js's own MIT-licensed example texture, 1024×1024 JPEG).
- **Import gotcha (verified against installed package, differs from casual naming):** both `three/examples/jsm/objects/Water.js` and `.../Water2.js` export their class under the **same name, `Water`** (not `Water2`). Any file importing both must alias one on import, e.g. `import { Water as Water2 } from 'three/examples/jsm/objects/Water2.js';`. Verified via `node -e "require('three/examples/jsm/objects/Water2.js')"` — exports `{ Water }`, a distinct class from `Water.js`'s `Water`.
- `Water2`'s underwater flow animation self-advances via its own internal `THREE.Clock` inside `onBeforeRender` (called automatically by the renderer every frame it's in the scene) — it does **not** expose a `time` uniform to drive manually, unlike `Water.js`. Only `Water.js`'s variant needs an explicit `material.uniforms.time.value += dt` call in `WaterLabScene.update()`.

---

## File Structure

- **Modify:** `src/player/PlayerController.ts` — add dive constants, extend the existing swim gravity-override branch, add `underwaterDepthFraction` getter.
- **Modify:** `src/levels/WaterLab.ts` — add a 4th `'abyss'` tier.
- **Modify:** `src/scene/WaterLabScene.ts` — add splash-on-crossing detection (needs a `ParticleSystem` reference), swap the single static water mesh for a variant-switchable object, add an `'abyss'` tier color.
- **Create:** `src/world/WaterVariants.ts` — factory functions wrapping three.js's `Water`/`Water2`, plus the shared normal-map texture loader.
- **Create:** `src/rendering/UnderwaterEffect.ts` — a `postprocessing` `Effect` subclass for the underwater color-grade.
- **Modify:** `src/ui/DevSandbox.ts` — add two toggle buttons for the water-variant A/B switch.
- **Modify:** `src/main.ts` — pass `particles` into `WaterLabScene`'s constructor, wire the new `onSetWaterVariant` DevSandbox callback, add `UnderwaterEffect` to the existing composer pass, add per-frame fog lerp driven by dive depth, fix `enterWaterLab()` to leave a real `THREE.Fog` object in place (previously set to `null`, which would make the new fog-lerp code a no-op inside the Lab).
- **Create:** `public/assets/textures/water/waternormals.jpg` — fetched binary asset.
- **Modify:** `tests/levels/WaterLab.test.ts` — update for the new 4-tier list.
- **Create:** `tests/player/PlayerControllerDive.test.ts` — new dive-branch and `underwaterDepthFraction` unit tests.

---

### Task 1: PlayerController dive mechanics

**Files:**
- Modify: `src/player/PlayerController.ts:49-51` (constants), `src/player/PlayerController.ts:308-310` (getters area), `src/player/PlayerController.ts:859-877` (gravity-override branch)
- Test: `tests/player/PlayerControllerDive.test.ts` (create)

**Interfaces:**
- Consumes: existing `PlayerController` fields `_swimming: boolean`, `_swimSurfaceY: number`, `_pos: THREE.Vector3` (private), existing constants `SWIM_FLOAT_DEPTH = 0.35`, `SWIM_VERTICAL_EASE = 6`, existing `lerp(a, b, t)` helper (`PlayerController.ts:151`), existing `setSwimming(isSwimming: boolean, waterSurfaceY = 0): void` (unchanged signature).
- Produces: `get underwaterDepthFraction(): number` on `PlayerController` — consumed by Task 5's `main.ts` wiring (`player.underwaterDepthFraction`). Returns `0` when not swimming; ramps `0`→`1` as depth below `_swimSurfaceY` approaches `DIVE_TARGET_DEPTH` (3.0 WU), clamped to `[0, 1]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/player/PlayerControllerDive.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { DEFAULT_PLAYER_DNA } from '@/creatures/CreatureDNA';
import type { InputState } from '@/core/InputManager';

function neutralInput(): InputState {
  return {
    moveForward: false, moveBackward: false, moveLeft: false, moveRight: false,
    jump: false, run: false, dodge: false, interact: false,
    turnDragHeld: false,
  } as InputState;
}

describe('PlayerController dive mechanics', () => {
  let physics: PhysicsWorld;
  let player: PlayerController;

  beforeEach(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
  });

  it('holding jump while swimming eases the player down toward DIVE_TARGET_DEPTH (3.0 WU) below the surface', () => {
    player.setSwimming(true, 0); // water surface at world Y = 0
    const diveInput = { ...neutralInput(), jump: true };
    for (let i = 0; i < 600; i++) {
      physics.step(1 / 60);
      player.update(diveInput, 1 / 60, 'isometric');
    }
    const y = (player as any)._pos.y;
    expect(y).toBeLessThan(-2.5);
    expect(y).toBeGreaterThan(-3.5);
  });

  it('releasing jump after diving eases the player back up toward the surface float depth (SWIM_FLOAT_DEPTH = 0.35 WU)', () => {
    player.setSwimming(true, 0);
    const diveInput = { ...neutralInput(), jump: true };
    for (let i = 0; i < 600; i++) {
      physics.step(1 / 60);
      player.update(diveInput, 1 / 60, 'isometric');
    }
    const floatInput = neutralInput();
    for (let i = 0; i < 600; i++) {
      physics.step(1 / 60);
      player.update(floatInput, 1 / 60, 'isometric');
    }
    const y = (player as any)._pos.y;
    expect(y).toBeGreaterThan(-1.0);
    expect(y).toBeLessThan(0.5);
  });

  it('underwaterDepthFraction is 0 when not swimming', () => {
    expect(player.underwaterDepthFraction).toBe(0);
    player.setSwimming(true, 0);
    player.setSwimming(false);
    expect(player.underwaterDepthFraction).toBe(0);
  });

  it('underwaterDepthFraction ramps from 0 toward 1 as the player dives, capped at 1', () => {
    player.setSwimming(true, 0);
    expect(player.underwaterDepthFraction).toBe(0); // spawned above the surface (y=5)
    const diveInput = { ...neutralInput(), jump: true };
    for (let i = 0; i < 600; i++) {
      physics.step(1 / 60);
      player.update(diveInput, 1 / 60, 'isometric');
    }
    expect(player.underwaterDepthFraction).toBeGreaterThan(0.8);
    expect(player.underwaterDepthFraction).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/player/PlayerControllerDive.test.ts`
Expected: FAIL — `underwaterDepthFraction` does not exist on `PlayerController`, and the dive-branch tests fail because holding jump currently has no effect while swimming (both the dive-input and released-input cases converge to the same `SWIM_FLOAT_DEPTH` target).

- [ ] **Step 3: Add the dive constants**

In `src/player/PlayerController.ts`, near the existing swim constants (around line 49-51):

```ts
const SWIM_SPEED = 3.5;          // world units/sec — slower than WALK_SPEED (5)
const SWIM_FLOAT_DEPTH = 0.35;   // WU below water surface the player floats toward while swimming
const SWIM_VERTICAL_EASE = 6;    // per-second lerp factor toward the float target
const DIVE_TARGET_DEPTH = 3.0;   // WU below surface the player eases toward while diving
const DIVE_VERTICAL_EASE = 4;    // per-second lerp factor toward the dive target (slower than surfacing)
```

- [ ] **Step 4: Extend the gravity-override branch to add diving**

In `src/player/PlayerController.ts`, replace the existing swim branch (around line 859-865):

```ts
    // ── 4. GRAVITY ─────────────────────────────────────────────────────────
    if (this._swimming) {
      // Buoyant float: ease velocity.y so _pos.y approaches a fixed depth
      // below the water surface, instead of falling under normal gravity.
      const targetY = this._swimSurfaceY - SWIM_FLOAT_DEPTH;
      const yDelta = targetY - this._pos.y;
      this.velocity.y = lerp(this.velocity.y, yDelta * SWIM_VERTICAL_EASE, SWIM_VERTICAL_EASE * dt);
```

with:

```ts
    // ── 4. GRAVITY ─────────────────────────────────────────────────────────
    if (this._swimming) {
      // Buoyant float / dive: ease velocity.y so _pos.y approaches a target
      // depth below the water surface, instead of falling under normal
      // gravity. Holding jump (input.jump) is repurposed as "dive" — jump's
      // on-land execution branch already excludes swim mode (see the
      // `!this._swimming` guard above), so this is conflict-free.
      const targetY = input.jump
        ? this._swimSurfaceY - DIVE_TARGET_DEPTH   // holding jump: ease down toward dive depth
        : this._swimSurfaceY - SWIM_FLOAT_DEPTH;   // released: ease up toward surface float depth
      const ease = input.jump ? DIVE_VERTICAL_EASE : SWIM_VERTICAL_EASE;
      const yDelta = targetY - this._pos.y;
      this.velocity.y = lerp(this.velocity.y, yDelta * ease, ease * dt);
```

(The line after — `} else if (!wasGrounded || justJumped) {` — and everything below it is unchanged.)

- [ ] **Step 5: Add the `underwaterDepthFraction` getter**

In `src/player/PlayerController.ts`, right after the existing `isSwimming` getter (around line 308-310):

```ts
  get isSwimming(): boolean {
    return this._swimming;
  }

  /** 0 when swimming at/near the surface, ramping to 1 as the player dives
   *  toward DIVE_TARGET_DEPTH. Used by the underwater screen effect; 0 when
   *  not swimming at all. */
  get underwaterDepthFraction(): number {
    if (!this._swimming) return 0;
    const depth = this._swimSurfaceY - this._pos.y;
    return Math.max(0, Math.min(1, depth / DIVE_TARGET_DEPTH));
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/player/PlayerControllerDive.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 7: Run the full existing PlayerController swim/submersion test suites for regressions**

Run: `npx vitest run tests/player/PlayerControllerSwimming.test.ts tests/player/PlayerControllerSubmersion.test.ts tests/player/movement.test.ts`
Expected: PASS (no regressions — the `input.jump` branching only changes behavior while `this._swimming` is true, and existing swim tests use `neutralInput()` which has `jump: false`, hitting the unchanged "released" branch).

- [ ] **Step 8: Commit**

```bash
git add src/player/PlayerController.ts tests/player/PlayerControllerDive.test.ts
git commit -m "feat(player): add hold-to-dive swim mechanic and underwaterDepthFraction

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Basin deepening (new `abyss` tier)

**Files:**
- Modify: `src/levels/WaterLab.ts` (full file)
- Modify: `src/scene/WaterLabScene.ts:35-39` (`TIER_COLORS`)
- Modify: `tests/levels/WaterLab.test.ts` (full file)

**Interfaces:**
- Consumes: nothing new.
- Produces: `WaterLabTier['name']` now includes `'abyss'`; `buildWaterLabTiers()` returns 4 tiers instead of 3, with the new `abyss` tier at `y: -5.0, halfExtent: 2, centerX: 0, centerZ: 0`. Consumed by Task 3/4's `WaterLabScene` (already iterates `this._tiers` generically — no logic changes needed there beyond the color map).

- [ ] **Step 1: Write the failing tests**

Replace `tests/levels/WaterLab.test.ts` in full:

```ts
import { describe, it, expect } from 'vitest';
import { buildWaterLabTiers, WATER_LAB_ROOM_SIZE, WATER_LAB_SURFACE_Y } from '@/levels/WaterLab';

describe('buildWaterLabTiers', () => {
  it('returns exactly 4 tiers: bank, shallow, deep, abyss, in that depth order', () => {
    const tiers = buildWaterLabTiers();
    expect(tiers).toHaveLength(4);
    expect(tiers.map(t => t.name)).toEqual(['bank', 'shallow', 'deep', 'abyss']);
  });

  it('has decreasing Y as tiers go from bank to abyss', () => {
    const tiers = buildWaterLabTiers();
    const [bank, shallow, deep, abyss] = tiers;
    expect(bank.y).toBe(0);
    expect(shallow.y).toBe(-0.3);
    expect(deep.y).toBe(-1.2);
    expect(abyss.y).toBe(-5.0);
    expect(bank.y).toBeGreaterThan(shallow.y);
    expect(shallow.y).toBeGreaterThan(deep.y);
    expect(deep.y).toBeGreaterThan(abyss.y);
  });

  it('every tier fits within the room bounds', () => {
    const tiers = buildWaterLabTiers();
    for (const t of tiers) {
      expect(Math.abs(t.centerX) + t.halfExtent).toBeLessThanOrEqual(WATER_LAB_ROOM_SIZE / 2);
      expect(Math.abs(t.centerZ) + t.halfExtent).toBeLessThanOrEqual(WATER_LAB_ROOM_SIZE / 2);
    }
  });

  it('each tier is nested (smaller or equal footprint) inside the previous one', () => {
    const tiers = buildWaterLabTiers();
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]!.halfExtent).toBeLessThanOrEqual(tiers[i - 1]!.halfExtent);
    }
  });

  it('WATER_LAB_SURFACE_Y matches the bank tier height (basin cut into the bank)', () => {
    const tiers = buildWaterLabTiers();
    expect(WATER_LAB_SURFACE_Y).toBe(tiers[0].y);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/levels/WaterLab.test.ts`
Expected: FAIL — `buildWaterLabTiers()` currently returns only 3 tiers, no `'abyss'` name exists on the type.

- [ ] **Step 3: Add the `abyss` tier**

Replace `src/levels/WaterLab.ts` in full:

```ts
// ── WaterLab ────────────────────────────────────────────────────────────────
//
//  Pure tier-data for the "Water Lab" dev-sandbox scene: a 24×24 world-unit
//  basin with 4 stepped elevations (dry bank → shallow shelf → deep floor →
//  abyss) cut into one side of a flat room, so a player can walk from dry
//  land into progressively deeper water and test wading vs. swimming vs.
//  diving without needing the full overworld.
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
  name: 'bank' | 'shallow' | 'deep' | 'abyss';
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
 * Returns the 4 stepped tiers of the basin, ordered from shallowest
 * (dry bank) to deepest (abyss floor). Each successively deeper tier is
 * nested (smaller footprint, centered the same) inside the previous one,
 * like a stepped pyramid dug into the ground. The abyss tier gives real
 * vertical room (3.8 WU below the deep floor, 5.0 WU below the surface) for
 * the dive mechanic (DIVE_TARGET_DEPTH = 3.0 WU, see PlayerController.ts).
 */
export function buildWaterLabTiers(): WaterLabTier[] {
  return [
    { name: 'bank',    y: 0,     halfExtent: 11, centerX: 0, centerZ: 0 },
    { name: 'shallow', y: -0.3,  halfExtent: 7,  centerX: 0, centerZ: 0 },
    { name: 'deep',    y: -1.2,  halfExtent: 4,  centerX: 0, centerZ: 0 },
    { name: 'abyss',   y: -5.0,  halfExtent: 2,  centerX: 0, centerZ: 0 },
  ];
}
```

(Note: `deep`'s `halfExtent` also changes from `3` to `4` here to keep it a bit roomier now that a 4th tier nests inside it — still `<=` the `shallow` tier's `7`, satisfying the "nested" test.)

- [ ] **Step 4: Add the `abyss` tier color**

In `src/scene/WaterLabScene.ts`, replace the `TIER_COLORS` map (around line 35-39):

```ts
const TIER_COLORS: Record<WaterLabTier['name'], number> = {
  bank:    0x6b5a3c,
  shallow: 0x4a6b4a,
  deep:    0x2f4a52,
  abyss:   0x15242b,
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/levels/WaterLab.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 6: Run the full vitest suite for regressions**

Run: `npx vitest run`
Expected: PASS, same pre-existing unrelated failures as before this work (if any were noted in `enemyLoader`/`towerGenerator`/`talentSystem` — confirm no *new* failures were introduced).

- [ ] **Step 7: Commit**

```bash
git add src/levels/WaterLab.ts src/scene/WaterLabScene.ts tests/levels/WaterLab.test.ts
git commit -m "feat(waterlab): add abyss tier for deeper basin, room to dive

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Splash VFX on water entry/exit

**Files:**
- Modify: `src/scene/WaterLabScene.ts` (constructor, `update()`, new private method)
- Modify: `src/main.ts:991` (the one `WaterLabScene` construction call site)

**Interfaces:**
- Consumes: `ParticleSystem.emit(pos: THREE.Vector3, color: number, vx?: number, vy?: number, vz?: number, lifetime?: number, gravity?: boolean): void` (existing, unchanged, from `src/rendering/ParticleSystem.ts`). Existing module-scope `particles` instance in `main.ts` (`const particles = new ParticleSystem(scene)`, line ~173).
- Produces: `WaterLabScene`'s constructor now takes a 4th parameter, `particles: ParticleSystem`. No other public API changes — `enter()`, `exit()`, `update(dt)`, `dispose()` keep their existing signatures.

- [ ] **Step 1: Add the `particles` constructor parameter and splash-tracking field**

In `src/scene/WaterLabScene.ts`, add the import and change the constructor (around line 18-55):

```ts
import * as THREE from 'three';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { PlayerController } from '@/player/PlayerController';
import type { ParticleSystem } from '@/rendering/ParticleSystem';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  buildWaterLabTiers,
  WATER_LAB_ROOM_SIZE,
  WATER_LAB_SURFACE_Y,
  type WaterLabTier,
} from '@/levels/WaterLab';
import { createWaterMaterial } from '@/world/WaterMaterial';
```

```ts
export class WaterLabScene {
  private readonly _tiers = buildWaterLabTiers();
  private readonly _tierMeshes: THREE.Mesh[] = [];
  private readonly _tierBodies: RAPIER.RigidBody[] = [];
  private _waterMesh: THREE.Mesh | null = null;
  private _waterMaterial: THREE.ShaderMaterial | null = null;
  private _ambientLight: THREE.AmbientLight | null = null;
  private _dirLight: THREE.DirectionalLight | null = null;
  private _entered = false;

  /** Previous frame's depthBelowSurface, used to detect entry/exit crossings
   *  for splash VFX. -Infinity so the very first frame never counts as a
   *  crossing (nothing to compare against yet). */
  private _prevDepthBelowSurface = -Infinity;

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _physics: PhysicsWorld,
    private readonly _player: PlayerController,
    private readonly _particles: ParticleSystem,
  ) {}
```

(`_waterMesh`/`_waterMaterial` fields are replaced in Task 4 — leave them as-is for this task.)

- [ ] **Step 2: Add splash detection to `update()` and the `_spawnSplash` method**

In `src/scene/WaterLabScene.ts`, replace the `update(dt)` method (around line 128-146):

```ts
  /** Advances the water shader animation and applies swim/wading state to
   *  the player based on their live depth below the water surface. Also
   *  detects the player crossing the water surface (either direction) to
   *  trigger a one-shot splash VFX burst. */
  update(dt: number): void {
    if (this._waterMaterial) this._waterMaterial.uniforms.uTime.value += dt;

    const playerY = this._player.group.position.y;
    const depthBelowSurface = WATER_LAB_SURFACE_Y - playerY;

    const enteredWater = this._prevDepthBelowSurface <= 0 && depthBelowSurface > 0;
    const exitedWater  = this._prevDepthBelowSurface > 0 && depthBelowSurface <= 0;
    if (enteredWater || exitedWater) {
      const pos = this._player.group.position;
      this._spawnSplash(pos.x, pos.z, enteredWater);
    }
    this._prevDepthBelowSurface = depthBelowSurface;

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

  /** Fires a one-shot radial burst of pale-blue/white particles at
   *  (x, WATER_LAB_SURFACE_Y, z) — a bigger, more energetic burst on entry
   *  than on exit, matching how a body displaces more water diving in than
   *  climbing out. */
  private _spawnSplash(x: number, z: number, isEntry: boolean): void {
    const count = isEntry ? 12 : 8;
    const origin = new THREE.Vector3(x, WATER_LAB_SURFACE_Y, z);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const radialSpeed = (isEntry ? 2.5 : 1.6) * (0.6 + Math.random() * 0.6);
      const vx = Math.cos(angle) * radialSpeed;
      const vz = Math.sin(angle) * radialSpeed;
      const vy = (isEntry ? 3.0 : 2.0) * (0.7 + Math.random() * 0.5);
      const lifetime = 0.4 + Math.random() * 0.25;
      this._particles.emit(origin, 0xdff3ff, vx, vy, vz, lifetime, true);
    }
  }
```

- [ ] **Step 3: Update the one call site in `main.ts`**

In `src/main.ts`, around line 991:

```ts
    if (!waterLab) waterLab = new WaterLabScene(scene, physics, player);
```

replace with:

```ts
    if (!waterLab) waterLab = new WaterLabScene(scene, physics, player, particles);
```

- [ ] **Step 4: Verify it compiles and the app boots into the Water Lab correctly**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

Run: `npx vitest run`
Expected: PASS, same baseline as before (no unit tests target `WaterLabScene` directly today — this task's correctness is verified manually below and via the existing e2e coverage, per the design spec's Testing section).

Run: `npm run test:e2e -- tests/e2e/water-lab.spec.ts tests/e2e/overworld-studio-water-lab-launch.spec.ts`
Expected: PASS (these exercise boot-into-Water-Lab and basic wading/swimming screenshots; they don't assert on particles, but confirm the constructor change didn't break the boot path).

- [ ] **Step 5: Manual verification**

Launch the dev sandbox (`npm run dev`, open the Dev panel, Proc-Gen tab, "🌊 Water Lab" button), walk from the dry bank down into the pool, and confirm a small particle burst appears the moment you cross into the water and again when you climb back out.

- [ ] **Step 6: Commit**

```bash
git add src/scene/WaterLabScene.ts src/main.ts
git commit -m "feat(waterlab): add splash VFX on water entry/exit

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Dual water visuals (`Water`/`Water2`) with A/B toggle

**Files:**
- Create: `src/world/WaterVariants.ts`
- Modify: `src/scene/WaterLabScene.ts` (`enter()`, `exit()`, `dispose()`, `update()`, new `_buildWater()`/`setWaterVariant()`)
- Modify: `src/ui/DevSandbox.ts` (new toggle buttons + `onSetWaterVariant` option)
- Modify: `src/main.ts` (wire `onSetWaterVariant`)
- Create: `public/assets/textures/water/waternormals.jpg` (fetched binary asset)

**Interfaces:**
- Consumes: `WaterLabScene`'s existing `_tiers[1].halfExtent` (the `shallow` tier footprint, unchanged by Task 2's abyss addition) to size the water plane.
- Produces: `WaterVariantKind = 'reflective' | 'flow-refractive'` and `createReflectiveWater(size: number): Water` / `createFlowRefractiveWater(size: number): Water2Class` from `src/world/WaterVariants.ts`. `WaterLabScene.setWaterVariant(kind: WaterVariantKind): void` (new public method) — consumed by `DevSandbox`'s new toggle buttons via `main.ts`'s new `onSetWaterVariant` callback.

- [ ] **Step 1: Fetch the water normal-map texture asset**

```bash
mkdir -p public/assets/textures/water
curl -sSL -o public/assets/textures/water/waternormals.jpg \
  https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/textures/waternormals.jpg
```

Verify it downloaded correctly:

```bash
file public/assets/textures/water/waternormals.jpg
```

Expected: `JPEG image data, ... 1024x1024, ...` (not an HTML error page — if the output says `HTML document`, the URL/tag is wrong; double-check the `r170` tag exists on `mrdoob/three.js` before retrying).

- [ ] **Step 2: Create `src/world/WaterVariants.ts`**

```ts
/**
 * WaterVariants — factory functions for the Water Lab's two selectable
 * higher-fidelity water-surface visuals, both built on three.js's official
 * example objects:
 *
 *   - createReflectiveWater()     → Water.js:    full planar reflection,
 *                                    tinted by sunDirection/waterColor.
 *   - createFlowRefractiveWater() → Water2.js:   flow-map-driven refraction
 *                                    and normal distortion, no separate
 *                                    reflection render target — cheaper,
 *                                    different look.
 *
 * IMPORTANT: both Water.js and Water2.js export their class under the same
 * name, `Water` — Water2.js's export is aliased below to avoid a collision.
 *
 * Both share a single lazily-loaded, cached normal-map texture (tiled via
 * RepeatWrapping) rather than loading it twice.
 */
import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { Water as Water2 } from 'three/examples/jsm/objects/Water2.js';

const NORMAL_MAP_URL = '/assets/textures/water/waternormals.jpg';

export type WaterVariantKind = 'reflective' | 'flow-refractive';

let _loader: THREE.TextureLoader | null = null;
let _normalMapCache: THREE.Texture | null = null;

/** Lazily loads and caches the shared water normal-map texture, tiling via
 *  RepeatWrapping on both axes so it repeats across the basin's footprint. */
function loadNormalMap(): THREE.Texture {
  if (_normalMapCache) return _normalMapCache;
  _loader ??= new THREE.TextureLoader();
  const tex = _loader.load(NORMAL_MAP_URL);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  _normalMapCache = tex;
  return tex;
}

/** three.js Water: full planar-reflection water with wave normal distortion.
 *  `size` is the plane's width/depth in world units (square footprint). */
export function createReflectiveWater(size: number): Water {
  const geometry = new THREE.PlaneGeometry(size, size);
  return new Water(geometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: loadNormalMap(),
    sunDirection: new THREE.Vector3(0.70707, 0.70707, 0),
    sunColor: 0xffffff,
    waterColor: 0x1a3a4a,
    distortionScale: 2.0,
    fog: false,
  });
}

/** three.js Water2: flow-map-driven refraction/normal distortion — cheaper,
 *  no separate reflection render target. `size` is the plane's width/depth
 *  in world units (square footprint). */
export function createFlowRefractiveWater(size: number): Water2 {
  const geometry = new THREE.PlaneGeometry(size, size);
  return new Water2(geometry, {
    color: 0x1a3a4a,
    scale: 2,
    textureWidth: 512,
    textureHeight: 512,
    flowDirection: new THREE.Vector2(1, 0),
    flowSpeed: 0.15,
    reflectivity: 0.3,
    normalMap0: loadNormalMap(),
    normalMap1: loadNormalMap(),
  });
}
```

- [ ] **Step 3: Replace `WaterLabScene`'s water mesh with the variant-switching setup**

In `src/scene/WaterLabScene.ts`, add the import:

```ts
import {
  createReflectiveWater,
  createFlowRefractiveWater,
  type WaterVariantKind,
} from '@/world/WaterVariants';
import type { Water } from 'three/examples/jsm/objects/Water.js';
```

Replace the `_waterMesh`/`_waterMaterial` fields (added in Task 3's Step 1 block) with:

```ts
  private _waterVariant: WaterVariantKind = 'reflective';
  private _waterObject: THREE.Object3D | null = null; // Water | Water2 instance
```

(Remove `private _waterMesh: THREE.Mesh | null = null;` and `private _waterMaterial: THREE.ShaderMaterial | null = null;` entirely — nothing else in the class references the old procedural `createWaterMaterial()` import once this step is done, so also remove the now-unused `import { createWaterMaterial } from '@/world/WaterMaterial';` line.)

In `enter()`, replace the water mesh block (around line 80-88):

```ts
    // ── Water mesh (covers the shallow+deep footprint, sits at bank height) ──
    // shallow tier footprint (deep tier is nested inside it, so this fully covers both)
    const poolHalfExtent = this._tiers[1]!.halfExtent;
    const waterGeo = new THREE.PlaneGeometry(poolHalfExtent * 2, poolHalfExtent * 2, 1, 1);
    waterGeo.rotateX(-Math.PI / 2);
    this._waterMaterial = createWaterMaterial();
    this._waterMesh = new THREE.Mesh(waterGeo, this._waterMaterial);
    this._waterMesh.position.set(0, WATER_LAB_SURFACE_Y + 0.05, 0);
    this._scene.add(this._waterMesh);
```

with:

```ts
    // ── Water surface (covers the shallow+deep+abyss footprint, at bank height) ──
    this._buildWater();
```

Add the new private method and public `setWaterVariant()` (anywhere inside the class, e.g. just above `enter()`):

```ts
  /** (Re)builds the water surface object for the current `_waterVariant`,
   *  disposing whichever one was there before. Sized to the `shallow` tier's
   *  footprint (deep/abyss tiers nest inside it, so this fully covers all
   *  of them). */
  private _buildWater(): void {
    if (this._waterObject) {
      this._scene.remove(this._waterObject);
      const obj = this._waterObject as unknown as { geometry: THREE.BufferGeometry; material: THREE.Material };
      obj.geometry.dispose();
      obj.material.dispose();
    }
    const poolHalfExtent = this._tiers[1]!.halfExtent;
    const size = poolHalfExtent * 2;
    this._waterObject = this._waterVariant === 'reflective'
      ? createReflectiveWater(size)
      : createFlowRefractiveWater(size);
    this._waterObject.position.set(0, WATER_LAB_SURFACE_Y + 0.05, 0);
    this._waterObject.rotation.x = -Math.PI / 2;
    this._scene.add(this._waterObject);
  }

  /** Switches the water-surface visual between 'reflective' (Water.js) and
   *  'flow-refractive' (Water2.js). No-op if already on the requested kind.
   *  If the room isn't currently entered, just remembers the preference for
   *  the next enter() call. */
  setWaterVariant(kind: WaterVariantKind): void {
    if (kind === this._waterVariant) return;
    this._waterVariant = kind;
    if (this._entered) this._buildWater();
  }
```

In `update(dt)`, replace the first line (the old `uTime` advance):

```ts
    if (this._waterMaterial) this._waterMaterial.uniforms.uTime.value += dt;
```

with:

```ts
    // Water2's flow animation self-advances via its own internal clock in
    // onBeforeRender (called automatically by the renderer each frame it's
    // in the scene) — only Water.js's `time` uniform needs manual ticking.
    if (this._waterObject && this._waterVariant === 'reflective') {
      (this._waterObject as Water).material.uniforms.time!.value += dt;
    }
```

In `exit()`, replace:

```ts
    if (this._waterMesh) this._scene.remove(this._waterMesh);
```

with:

```ts
    if (this._waterObject) this._scene.remove(this._waterObject);
```

In `dispose()`, replace:

```ts
  dispose(): void {
    if (this._tierMeshes.length === 0 && !this._waterMesh) return;
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
```

with:

```ts
  dispose(): void {
    if (this._tierMeshes.length === 0 && !this._waterObject) return;
    this.exit();
    for (const m of this._tierMeshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this._tierMeshes.length = 0;
    if (this._waterObject) {
      const obj = this._waterObject as unknown as { geometry: THREE.BufferGeometry; material: THREE.Material };
      obj.geometry.dispose();
      obj.material.dispose();
      this._waterObject = null;
    }
  }
```

- [ ] **Step 4: Add the toggle buttons to `DevSandbox.ts`**

In `src/ui/DevSandbox.ts`, add to `DevSandboxOptions` (near the existing `onEnterWaterLab`, around line 36-37):

```ts
  /** Teleport into the Water Lab scene. */
  onEnterWaterLab: () => void;
  /** Switch the Water Lab's water-surface visual ('reflective' = Water.js
   *  planar reflection, 'flow-refractive' = Water2.js flow-map refraction). */
  onSetWaterVariant: (kind: 'reflective' | 'flow-refractive') => void;
```

Add the buttons right after the existing `waterLabBtn` block (around line 614-620):

```ts
    // "Water Lab" button — always visible, independent of the proc-gen type
    // selector, since it's a fixed hand-built room (not a generated dungeon).
    const waterLabBtn = document.createElement('button');
    waterLabBtn.className = 'ds-btn ds-btn--accent';
    waterLabBtn.textContent = '🌊 Water Lab';
    waterLabBtn.style.marginTop = '4px';
    waterLabBtn.onclick = () => this._opts.onEnterWaterLab();

    // Water Lab visual A/B toggle — 'reflective' (Water.js) starts active,
    // matching WaterLabScene's default _waterVariant.
    const waterVariantReflectiveBtn = document.createElement('button');
    waterVariantReflectiveBtn.className = 'ds-btn ds-btn--accent';
    waterVariantReflectiveBtn.textContent = '🪞 Reflective';
    waterVariantReflectiveBtn.style.marginTop = '4px';

    const waterVariantFlowBtn = document.createElement('button');
    waterVariantFlowBtn.className = 'ds-btn';
    waterVariantFlowBtn.textContent = '🌊 Flow';
    waterVariantFlowBtn.style.marginTop = '4px';

    const setActiveWaterVariantBtn = (kind: 'reflective' | 'flow-refractive') => {
      waterVariantReflectiveBtn.classList.toggle('ds-btn--accent', kind === 'reflective');
      waterVariantFlowBtn.classList.toggle('ds-btn--accent', kind === 'flow-refractive');
    };
    waterVariantReflectiveBtn.onclick = () => {
      this._opts.onSetWaterVariant('reflective');
      setActiveWaterVariantBtn('reflective');
    };
    waterVariantFlowBtn.onclick = () => {
      this._opts.onSetWaterVariant('flow-refractive');
      setActiveWaterVariantBtn('flow-refractive');
    };
```

Update the `genSec.append(...)` call (around line 641) to include the two new buttons:

```ts
    genSec.append(genTitle, typeRow, seedRow, runBtn, overworldBtn, waterLabBtn, waterVariantReflectiveBtn, waterVariantFlowBtn);
```

- [ ] **Step 5: Wire `onSetWaterVariant` in `main.ts`**

In `src/main.ts`, add next to the existing `onEnterWaterLab: enterWaterLab,` line (around line 1262):

```ts
      onEnterWaterLab: enterWaterLab,
      onSetWaterVariant: (kind) => waterLab?.setWaterVariant(kind),
```

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors. (If TypeScript complains about the `Water2` type import name in `WaterVariants.ts`'s return type conflicting with the local `Water2` alias, double check the alias-import syntax matches exactly: `import { Water as Water2 } from 'three/examples/jsm/objects/Water2.js';` — the return type annotation `Water2` then refers to this aliased class, which is valid TS.)

- [ ] **Step 7: Run the full vitest suite for regressions**

Run: `npx vitest run`
Expected: PASS, same baseline as before.

- [ ] **Step 8: Run the existing Water Lab e2e tests**

Run: `npm run test:e2e -- tests/e2e/water-lab.spec.ts tests/e2e/overworld-studio-water-lab-launch.spec.ts`
Expected: PASS.

- [ ] **Step 9: Manual verification**

Launch the Water Lab, confirm the water now renders with a reflective wavy surface (not the old flat procedural shader) by default. Click "🌊 Flow" and confirm the water visual changes to the flow-refractive look and the button highlight moves. Click "🪞 Reflective" to switch back. Watch for reflection artifacts near the water plane's edges (the known `clipBias`/orthographic-camera risk flagged in the design doc) — if visible, note it for a quick follow-up tuning pass (not a blocker for this task).

- [ ] **Step 10: Commit**

```bash
git add src/world/WaterVariants.ts src/scene/WaterLabScene.ts src/ui/DevSandbox.ts src/main.ts public/assets/textures/water/waternormals.jpg
git commit -m "feat(waterlab): add Water.js/Water2.js visual variants with A/B toggle

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Underwater screen effect (fog + color grade)

**Files:**
- Create: `src/rendering/UnderwaterEffect.ts`
- Modify: `src/main.ts` (composer pass, fog constants, per-frame update, `enterWaterLab()` fog fix)

**Interfaces:**
- Consumes: `player.underwaterDepthFraction` (from Task 1), the existing `composer`/`EffectPass`/`BloomEffect` setup in `main.ts` (~line 113-118), the existing `gameLoop.onTick((dt) => { ... })` callback (~line 2296), the existing `scene.fog` (`THREE.Fog`) usages throughout `main.ts`.
- Produces: `UnderwaterEffect` class (extends `postprocessing`'s `Effect`) — a single instance created once in `main.ts` and added to the existing `EffectPass`. No other module needs to reference it.

- [ ] **Step 1: Create `src/rendering/UnderwaterEffect.ts`**

```ts
/**
 * UnderwaterEffect — a postprocessing Effect that blends a blue-green tint
 * and mild vignette darkening over the frame, standing in for the visual
 * change of being underwater. Opacity is driven every frame by the caller
 * from player.underwaterDepthFraction (0 = dry/at surface, 1 = full dive
 * depth) — at 0 opacity the effect is fully transparent (no visible change).
 *
 * Uses BlendFunction.NORMAL (straight alpha-blend by opacity) rather than
 * the Effect base class's default SCREEN blend, since mainImage() below
 * already computes the final blended color itself — SCREEN would double up
 * the brightening on top of that.
 */
import { Effect, BlendFunction } from 'postprocessing';

export class UnderwaterEffect extends Effect {
  constructor() {
    super(
      'UnderwaterEffect',
      /* glsl */ `
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 tint = vec3(0.05, 0.25, 0.35);
        float vignette = smoothstep(0.9, 0.35, distance(uv, vec2(0.5)));
        vec3 color = mix(inputColor.rgb, tint, 0.35) * mix(1.0, vignette, 0.4);
        outputColor = vec4(color, inputColor.a);
      }
    `,
      { blendFunction: BlendFunction.NORMAL },
    );
  }
}
```

- [ ] **Step 2: Add the composer pass, fog constants, and per-frame wiring in `main.ts`**

Add the import near the top of `src/main.ts` (alongside the existing `postprocessing` import, line 2):

```ts
import { EffectComposer, EffectPass, RenderPass, BloomEffect, KernelSize } from 'postprocessing';
import { UnderwaterEffect } from '@/rendering/UnderwaterEffect';
```

Replace the composer setup (around line 112-118):

```ts
  // ── Camera (isometric) ────────────────────────────────────────────────────
  const cameraRig = new CameraRig(window.innerWidth / window.innerHeight);
  // ── Post-processing — bloom/glow for all emissive + additive VFX ──────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cameraRig.camera));
  composer.addPass(new EffectPass(
    cameraRig.camera,
    new BloomEffect({ intensity: 2.2, luminanceThreshold: 0.12, kernelSize: KernelSize.MEDIUM }),
  ));
```

with:

```ts
  // ── Camera (isometric) ────────────────────────────────────────────────────
  const cameraRig = new CameraRig(window.innerWidth / window.innerHeight);
  // ── Post-processing — bloom/glow for all emissive + additive VFX ──────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cameraRig.camera));
  const underwaterEffect = new UnderwaterEffect();
  underwaterEffect.blendMode.opacity.value = 0; // dry by default; driven each frame below
  composer.addPass(new EffectPass(
    cameraRig.camera,
    new BloomEffect({ intensity: 2.2, luminanceThreshold: 0.12, kernelSize: KernelSize.MEDIUM }),
    underwaterEffect,
  ));

  // ── Underwater fog targets — lerped toward by fraction each frame below ──
  const BASE_FOG_COLOR = new THREE.Color(0x0a0a0f);
  const UNDERWATER_FOG_COLOR = new THREE.Color(0x0a2a3a);
  const BASE_FOG_NEAR = 30;
  const BASE_FOG_FAR = 60;
  const UNDERWATER_FOG_NEAR = 2;
  const UNDERWATER_FOG_FAR = 14;
```

- [ ] **Step 3: Fix `enterWaterLab()` to leave a real `THREE.Fog` object in place**

In `src/main.ts`, inside `enterWaterLab()` (around line 995), replace:

```ts
    scene.fog = null;
```

with:

```ts
    // A real (dry-default) Fog object, not null, so the per-frame underwater
    // fog lerp below (driven by player.underwaterDepthFraction) has
    // something to lerp — the Lab previously disabled fog entirely here.
    scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
```

- [ ] **Step 4: Add the per-frame underwater effect + fog lerp**

In `src/main.ts`, inside `gameLoop.onTick((dt) => { ... })`, right before the render step (around line 3037-3039):

```ts
    // 10. Render  (occlusion update runs here — single call, all modes)
    _occlusionMgr?.update(cameraRig.camera, player.group.position, dt);
    composer.render(dt);
```

replace with:

```ts
    // 9b. Underwater screen effect + fog — driven by the player's own dive
    // depth (not camera position, since the fixed iso/orbit camera rarely
    // dips below the water surface). Runs every mode; underwaterDepthFraction
    // is always 0 outside the Water Lab today (Phase 2B ports this to the
    // Overworld later), so this is a no-op elsewhere.
    const _underwaterFrac = player.underwaterDepthFraction;
    underwaterEffect.blendMode.opacity.value = _underwaterFrac;
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(BASE_FOG_COLOR).lerp(UNDERWATER_FOG_COLOR, _underwaterFrac);
      scene.fog.near = THREE.MathUtils.lerp(BASE_FOG_NEAR, UNDERWATER_FOG_NEAR, _underwaterFrac);
      scene.fog.far = THREE.MathUtils.lerp(BASE_FOG_FAR, UNDERWATER_FOG_FAR, _underwaterFrac);
    }

    // 10. Render  (occlusion update runs here — single call, all modes)
    _occlusionMgr?.update(cameraRig.camera, player.group.position, dt);
    composer.render(dt);
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 6: Run the full vitest suite for regressions**

Run: `npx vitest run`
Expected: PASS, same baseline as before.

- [ ] **Step 7: Run the existing Water Lab e2e tests**

Run: `npm run test:e2e -- tests/e2e/water-lab.spec.ts tests/e2e/overworld-studio-water-lab-launch.spec.ts`
Expected: PASS.

- [ ] **Step 8: Manual verification**

Launch the Water Lab, swim into the pool, hold Space to dive toward the abyss floor, and confirm the screen gradually tints blue-green with a mild vignette and the fog thickens/closes in as depth increases, then clears back to normal as you release Space and resurface. Confirm dry-land gameplay elsewhere (e.g. the sandbox arena) is completely unaffected (fraction stays 0).

- [ ] **Step 9: Commit**

```bash
git add src/rendering/UnderwaterEffect.ts src/main.ts
git commit -m "feat(waterlab): add depth-driven underwater screen tint + fog

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-Review Notes

- **Spec coverage:** Swim/dive mechanics (Task 1), basin deepening (Task 2), splash VFX (Task 3), dual water visuals + A/B toggle (Task 4), underwater screen effect (Task 5) — all 5 design sections have a task. The design's "Testing" section's exact two unit-test targets (`PlayerController` dive branch, `buildWaterLabTiers()`) are Tasks 1 & 3's Step 1/Step 3 tests respectively (2 test files, 8 tests total); everything else is manual-verification-only per the design, matched by "Manual verification" steps in Tasks 3-5.
- **Placeholder scan:** no TBD/TODO; every step has literal, complete code.
- **Type consistency:** `WaterVariantKind` defined once in `WaterVariants.ts`, consumed identically by `WaterLabScene.setWaterVariant()`, `DevSandboxOptions.onSetWaterVariant`, and `main.ts`'s wiring (all use the string union `'reflective' | 'flow-refractive'` or the exported alias). `underwaterDepthFraction` (Task 1) is the sole and consistently-named source read by Task 5.
- **Corrections made vs. the original design doc during planning** (all backward-compatible with the approved design, just implementation-accurate): (1) `Water2.js` actually exports its class as `Water`, requiring an aliased import — verified against the installed package, documented in Global Constraints; (2) `Water2` self-advances its flow animation via an internal clock and has no `time` uniform to drive manually, unlike `Water.js` — `WaterLabScene.update()` only ticks `Water.js`'s uniform; (3) `enterWaterLab()` previously set `scene.fog = null`, which would silently no-op the new underwater fog lerp while inside the Lab — fixed to assign a real base `THREE.Fog` instead; (4) the `UnderwaterEffect`'s `blendFunction` is explicitly set to `BlendFunction.NORMAL` (the design's snippet didn't specify one, which would default to `SCREEN` and double-brighten on top of the shader's own blending).
