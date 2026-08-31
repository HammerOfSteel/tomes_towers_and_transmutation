# Lantern Spell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggleable "lantern" utility spell that attaches a warm point light + a small
visible held-lantern prop to the player, unlocked and equipped by default, reusing the existing
`fly`-spell true on/off toggle plumbing.

**Architecture:** `SpellSystem.ts` gains a new `movement`-type spell definition plus a
`CastOptions.onLanternToggle` callback fired from a new `_fireMovement()` branch. `main.ts` wires
that callback to flip `player.isLanternOn` and stash the new value on `group.userData`, exactly
mirroring the existing `onFlyBurst` → `flySpellMode` wiring. `PlayerController.update()` consumes
that one-shot userData flag (mirroring the existing `_flySpellMode` consumption block) to toggle
visibility of a `THREE.PointLight` + a small primitive-composition prop group, both attached as
children of `this.group` at construction. `ProgressionSystem` seeds `lantern` into
`_unlockedSpells` and equips it into slot 1 by default, alongside the existing `magic_bolt`
starter-spell seeding.

**Tech Stack:** TypeScript, Three.js, Vitest (existing project stack — no new dependencies).

## Global Constraints

- `cooldown: 0.3` on the lantern spell definition — pure input debounce, not a gameplay limiter.
- Light: `THREE.PointLight(0xffaa55, 1.1, 6)` — warm color, intensity 1.1, distance 6 WU.
- Prop: hollow cylinder "cage" (`CylinderGeometry(0.09, 0.09, 0.18, 8, 1, true)`, material
  `0x2a2420`) + emissive sphere "flame" (`SphereGeometry(0.055, 8, 8)`, emissive `0xffaa44` at
  intensity 1.2), both parented at a fixed hip-height offset `(0.4, 1.0, 0.3)` relative to
  `this.group`.
- No mana cost, no swim/underwater interaction, no bespoke HUD, no dungeon-specific lighting —
  all explicitly out of scope per the approved design spec
  (`docs/superpowers/specs/2026-08-31-lantern-spell-design.md`).
- Every task must leave `npx tsc --noEmit` at the pre-existing baseline of 144 errors (do not
  introduce new ones; do not attempt to fix pre-existing ones).
- Every task's new/changed tests must pass via `npx vitest run <file>` before moving to the next
  task's Step 1.

---

### Task 1: Spell definition + toggle plumbing in `SpellSystem.ts`

**Files:**
- Modify: `src/combat/SpellSystem.ts`
  - `SPELL_DEFS` object (line 33-46, insert new line after the existing `fly:` entry at line 45)
  - `CastOptions` interface (line 60-72, insert new optional field after `onFlyBurst`)
  - `_fireMovement()` method (line 1503-1523, insert new `else if` branch after the existing
    `fly` branch, before the closing `}`)
- Test: `tests/combat/spellSystem.test.ts` (insert new tests after the `battleHymnActive` block,
  before the final `});` closing the top-level `describe('SpellSystem', ...)` at line 251)

**Interfaces:**
- Consumes: nothing new — this task only adds to existing `SpellSystem` internals.
- Produces: `SPELL_DEFS.lantern` (a valid `SpellDef` with `type: 'movement'`), the
  `CastOptions.onLanternToggle?: () => void` field (consumed by Task 4's `main.ts` wiring), and
  the `_fireMovement()` branch that invokes it when `sys.cast('lantern', ...)` is called
  (consumed by this task's own test).

- [ ] **Step 1: Write the failing tests**

Open `tests/combat/spellSystem.test.ts`. Insert the following directly before the file's final
`});` (i.e. right after the existing `battleHymnActive becomes true after casting battle_hymn`
test block, which currently ends at line 250):

```ts
  // ── lantern toggle ─────────────────────────────────────────────────────
  it('lantern spell def exists with movement type and a low cooldown', () => {
    // SPELL_DEFS is module-private; assert indirectly via cast() + isReady()/cooldownFraction()
    expect(sys.isReady('lantern')).toBe(true);
    sys.cast('lantern', origin, aim, [], scene);
    expect(sys.isReady('lantern')).toBe(false);
    expect(sys.cooldownFraction('lantern')).toBeLessThanOrEqual(1);
  });

  it('lantern cast invokes onLanternToggle exactly once', () => {
    const onLanternToggle = vi.fn();
    sys.cast('lantern', origin, aim, [], scene, undefined, { onLanternToggle });
    expect(onLanternToggle).toHaveBeenCalledTimes(1);
  });

  it('lantern cast does not throw when onLanternToggle is omitted', () => {
    expect(() => sys.cast('lantern', origin, aim, [], scene)).not.toThrow();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/combat/spellSystem.test.ts`
Expected: FAIL — `lantern spell def exists...` and `lantern cast invokes onLanternToggle...`
fail because `'lantern'` is not a key in `SPELL_DEFS`, so `cast()` falls back to `FALLBACK_DEF`
(`magic_bolt`, a `projectile` type) and `onLanternToggle` is never called.

- [ ] **Step 3: Add the spell definition**

In `src/combat/SpellSystem.ts`, find the `SPELL_DEFS` object (starts at line 33). Change:

```ts
  // ── Movement spells ──────────────────────────────────────────────────────
  blink:        { type: 'movement',   color: 0xaa44ff, emissive: 0x660099, damage: 0, speed: 0,  radius: 0,    cooldown: 8  },
  levitate:     { type: 'movement',   color: 0x88ddff, emissive: 0x224455, damage: 0, speed: 0,  radius: 0,    cooldown: 1  },
  fly:          { type: 'movement',   color: 0xffdd44, emissive: 0x886600, damage: 0, speed: 0,  radius: 0,    cooldown: 12 },
};
```

to:

```ts
  // ── Movement spells ──────────────────────────────────────────────────────
  blink:        { type: 'movement',   color: 0xaa44ff, emissive: 0x660099, damage: 0, speed: 0,  radius: 0,    cooldown: 8  },
  levitate:     { type: 'movement',   color: 0x88ddff, emissive: 0x224455, damage: 0, speed: 0,  radius: 0,    cooldown: 1  },
  fly:          { type: 'movement',   color: 0xffdd44, emissive: 0x886600, damage: 0, speed: 0,  radius: 0,    cooldown: 12 },
  lantern:      { type: 'movement',   color: 0xffaa55, emissive: 0xcc7733, damage: 0, speed: 0,  radius: 0,    cooldown: 0.3 },
};
```

- [ ] **Step 4: Add the `CastOptions` field**

Find `CastOptions` (line 60-72). Change:

```ts
  /** Fly burst: launch player in facing direction for given duration/speed. */
  onFlyBurst?: (facingAngle: number) => void;
}
```

to:

```ts
  /** Fly burst: launch player in facing direction for given duration/speed. */
  onFlyBurst?: (facingAngle: number) => void;
  /** Lantern: toggle the player's carried light on/off. */
  onLanternToggle?: () => void;
}
```

- [ ] **Step 5: Add the `_fireMovement()` branch**

Find `_fireMovement()` (line 1503-1523). Change:

```ts
    } else if (spellId === 'fly') {
      // Burst of speed in facing direction
      this._addSpark(origin, def.color, 5.0, scene);
      opts.onFlyBurst?.(0 /* facingAngle from player */);
    }
  }
```

to:

```ts
    } else if (spellId === 'fly') {
      // Burst of speed in facing direction
      this._addSpark(origin, def.color, 5.0, scene);
      opts.onFlyBurst?.(0 /* facingAngle from player */);
    } else if (spellId === 'lantern') {
      // Toggle the player's carried lantern light on/off
      this._addSpark(origin, def.color, 2.0, scene);
      opts.onLanternToggle?.();
    }
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/combat/spellSystem.test.ts`
Expected: PASS — all tests in the file, including the 3 new ones.

- [ ] **Step 7: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: error count still 144 (no new errors).

- [ ] **Step 8: Commit**

```bash
git add src/combat/SpellSystem.ts tests/combat/spellSystem.test.ts
git commit -m "feat: add lantern spell definition + toggle plumbing to SpellSystem

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: `PlayerController` — light, visible prop, and toggle consumption

**Files:**
- Modify: `src/player/PlayerController.ts`
  - New field block near `flySpellMode = false;` (line 311)
  - Constructor: new attachment lines near `this.group.add(this._levitateEffect.group);`
    (line 700)
  - `update()`: new consumption block near the existing `_flySpellMode` block (lines 773-776)
  - New `private static buildLanternProp(): THREE.Group` method, placed next to the existing
    `private static buildMesh()` (line 1348) and `private static buildShadow()` (line 1370)
    methods
- Test: Create `tests/player/PlayerControllerLantern.test.ts`

**Interfaces:**
- Consumes: `SpellSystem.CastOptions.onLanternToggle` is NOT consumed here — that's Task 4's
  `main.ts` glue. This task only consumes the `group.userData['_lanternToggle']` boolean flag
  that Task 4's callback will set (mirroring the existing `_flySpellMode` flag).
- Produces: `PlayerController.isLanternOn: boolean` (public field, starts `false`), read/written
  by Task 4's `main.ts` callback. Internal-only: `_lanternLight`, `_lanternProp`,
  `buildLanternProp()`.

- [ ] **Step 1: Write the failing test**

Create `tests/player/PlayerControllerLantern.test.ts`:

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

describe('PlayerController lantern toggle', () => {
  let physics: PhysicsWorld;
  let player: PlayerController;

  beforeEach(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
  });

  it('isLanternOn starts false', () => {
    expect(player.isLanternOn).toBe(false);
  });

  it('setting the _lanternToggle userData flag flips isLanternOn on next update()', () => {
    player.group.userData['_lanternToggle'] = true;
    physics.step(1 / 60);
    player.update(neutralInput(), 1 / 60, 'isometric');
    expect(player.isLanternOn).toBe(true);
  });

  it('consumes the _lanternToggle flag exactly once (deleted after read)', () => {
    player.group.userData['_lanternToggle'] = true;
    physics.step(1 / 60);
    player.update(neutralInput(), 1 / 60, 'isometric');
    expect(player.group.userData['_lanternToggle']).toBeUndefined();
    // Flip isLanternOn back off directly (simulating something else changing it) —
    // a second update() with no flag re-set must NOT touch it.
    player.isLanternOn = false;
    physics.step(1 / 60);
    player.update(neutralInput(), 1 / 60, 'isometric');
    expect(player.isLanternOn).toBe(false);
  });

  it('toggling on makes the lantern light and prop visible; toggling off hides them', () => {
    // Access private fields via `as any`, matching the existing codebase test convention
    // (see PlayerControllerSwimming.test.ts's `(player as any).velocity.x` usage) — TypeScript
    // `private` is compile-time only, so this is safe and avoids a fragile "find the first
    // PointLight in group.children" search (the player group also holds an unrelated
    // `_swimGlowLight` PointLight).
    const light = (player as unknown as { _lanternLight: THREE.PointLight })._lanternLight;
    const prop = (player as unknown as { _lanternProp: THREE.Group })._lanternProp;
    expect(light.visible).toBe(false);
    expect(prop.visible).toBe(false);

    player.group.userData['_lanternToggle'] = true;
    physics.step(1 / 60);
    player.update(neutralInput(), 1 / 60, 'isometric');
    expect(light.visible).toBe(true);
    expect(prop.visible).toBe(true);

    player.group.userData['_lanternToggle'] = false;
    physics.step(1 / 60);
    player.update(neutralInput(), 1 / 60, 'isometric');
    expect(light.visible).toBe(false);
    expect(prop.visible).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/player/PlayerControllerLantern.test.ts`
Expected: FAIL — `player.isLanternOn` is `undefined` (property does not exist yet), causing the
first assertion (`expect(player.isLanternOn).toBe(false)`) to fail.

- [ ] **Step 3: Add the `isLanternOn` field, light, and prop fields**

In `src/player/PlayerController.ts`, find the `flySpellMode` field (line 311):

```ts
  flySpellMode = false;
```

Change to:

```ts
  flySpellMode = false;
  /**
   * Lantern spell — toggles a warm point light + visible held-lantern prop.
   * True on/off toggle, mirrors flySpellMode's userData-flag plumbing.
   */
  isLanternOn = false;
  /** Lantern light, attached as a child of `group`, fixed hip-height offset. */
  private readonly _lanternLight = new THREE.PointLight(0xffaa55, 1.1, 6);
  /** Small visible lantern prop (cage + glow), attached alongside the light. */
  private readonly _lanternProp = PlayerController.buildLanternProp();
```

- [ ] **Step 4: Attach the light + prop in the constructor**

Find the constructor's levitate-effect attachment (line 699-700):

```ts
    // Attach cloud-puff levitate effect (hidden until buff is active)
    this.group.add(this._levitateEffect.group);
```

Change to:

```ts
    // Attach cloud-puff levitate effect (hidden until buff is active)
    this.group.add(this._levitateEffect.group);

    // Attach lantern light + prop (hidden until the lantern spell is toggled on)
    this._lanternLight.position.set(0.4, 1.0, 0.3); // fixed hip-height offset, tunable
    this._lanternProp.position.copy(this._lanternLight.position);
    this._lanternLight.visible = false;
    this._lanternProp.visible = false;
    this.group.add(this._lanternLight);
    this.group.add(this._lanternProp);
```

- [ ] **Step 5: Consume the toggle flag in `update()`**

Find the existing `_flySpellMode` consumption block (lines 772-776):

```ts
    // Fly spell toggle (replaces old fly burst system)
    if (typeof this.group.userData['_flySpellMode'] === 'boolean') {
      this.flySpellMode = this.group.userData['_flySpellMode'] as boolean;
      delete this.group.userData['_flySpellMode'];
    }
```

Change to:

```ts
    // Fly spell toggle (replaces old fly burst system)
    if (typeof this.group.userData['_flySpellMode'] === 'boolean') {
      this.flySpellMode = this.group.userData['_flySpellMode'] as boolean;
      delete this.group.userData['_flySpellMode'];
    }
    // Lantern spell toggle
    if (typeof this.group.userData['_lanternToggle'] === 'boolean') {
      this.isLanternOn = this.group.userData['_lanternToggle'] as boolean;
      delete this.group.userData['_lanternToggle'];
      this._lanternLight.visible = this.isLanternOn;
      this._lanternProp.visible = this.isLanternOn;
    }
```

- [ ] **Step 6: Add the `buildLanternProp()` static method**

Find `private static buildShadow()` (line 1370). Immediately before it, insert a new static
method (placed after `buildMesh()` ends and before `buildShadow()` begins):

```ts
  /** Small primitive-composition lantern prop: hollow "cage" + emissive "flame" sphere. */
  private static buildLanternProp(): THREE.Group {
    const g = new THREE.Group();
    const cageMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.6, metalness: 0.4 });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xffcc66, emissive: 0xffaa44, emissiveIntensity: 1.2, roughness: 0.4,
    });
    // openEnded: true gives a hollow "cage" look — the glow sphere shows through top/bottom.
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.18, 8, 1, true), cageMat);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), glowMat);
    g.add(cage, glow);
    return g;
  }

```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/player/PlayerControllerLantern.test.ts`
Expected: PASS — all 4 new tests.

Then run the full pre-existing swim test file to confirm no regression from the constructor/
update() edits:

Run: `npx vitest run tests/player/PlayerControllerSwimming.test.ts`
Expected: PASS — all pre-existing tests still pass unchanged.

- [ ] **Step 8: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: error count still 144.

- [ ] **Step 9: Commit**

```bash
git add src/player/PlayerController.ts tests/player/PlayerControllerLantern.test.ts
git commit -m "feat: add lantern light/prop toggle to PlayerController

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: `ProgressionSystem` — default starting spell

**Files:**
- Modify: `src/progression/ProgressionSystem.ts`
  - `_equippedSlots` initial array (line 81)
  - Constructor (line 98-101)
- Modify: `tests/progression/ProgressionSystem.test.ts` (5 existing assertions need their
  expected arrays updated to include `'lantern'`; 1 new test added)

**Interfaces:**
- Consumes: nothing new.
- Produces: a fresh `ProgressionSystem` instance now has `'lantern'` unlocked (verified via
  `isSpellUnlocked('lantern')` / `getUnlockedSpells()`) and equipped in slot 1 (verified via
  `getEquippedSlots()[1] === 'lantern'`).

- [ ] **Step 1: Update the existing tests' expected arrays and write the new test**

`getUnlockedSpells()` returns a sorted array (line 229-231:
`return [...this._unlockedSpells].sort();`). Alphabetically, `'flame_dart' < 'lantern' <
'magic_bolt'`. Open `tests/progression/ProgressionSystem.test.ts` and make these 5 changes:

Change (line 38):
```ts
    expect(ps.getUnlockedSpells()).toEqual(['flame_dart', 'magic_bolt']);
```
to:
```ts
    expect(ps.getUnlockedSpells()).toEqual(['flame_dart', 'lantern', 'magic_bolt']);
```

Change (line 53, inside `it('does not unlock spell when no spellUnlock arg is passed', ...)`):
```ts
    // Only magic_bolt is pre-unlocked from constructor
    expect(ps.getUnlockedSpells()).toEqual(['magic_bolt']);
```
to:
```ts
    // magic_bolt and lantern are both pre-unlocked from constructor
    expect(ps.getUnlockedSpells()).toEqual(['lantern', 'magic_bolt']);
```

Change (line 59):
```ts
    expect(ps.getUnlockedSpells()).toEqual(['flame_dart', 'magic_bolt']);
```
to:
```ts
    expect(ps.getUnlockedSpells()).toEqual(['flame_dart', 'lantern', 'magic_bolt']);
```

Change (line 97):
```ts
    expect(ps.getUnlockedSpells()).toEqual(['flame_dart', 'magic_bolt']);
```
to:
```ts
    expect(ps.getUnlockedSpells()).toEqual(['flame_dart', 'lantern', 'magic_bolt']);
```

Change (lines 100-102):
```ts
  it('getUnlockedSpells returns [magic_bolt] on fresh instance (starter spell)', () => {
    expect(ps.getUnlockedSpells()).toEqual(['magic_bolt']);
  });
});
```
to:
```ts
  it('getUnlockedSpells returns [lantern, magic_bolt] on fresh instance (starter spells)', () => {
    expect(ps.getUnlockedSpells()).toEqual(['lantern', 'magic_bolt']);
  });

  // ── lantern default equip ────────────────────────────────────────────────

  it('lantern is unlocked and equipped in slot 1 by default on a fresh instance', () => {
    expect(ps.isSpellUnlocked('lantern')).toBe(true);
    expect(ps.getEquippedSlots()).toEqual(['magic_bolt', 'lantern', null, null]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/progression/ProgressionSystem.test.ts`
Expected: FAIL — the 5 updated assertions fail because `'lantern'` is not yet unlocked by the
constructor (actual arrays omit it), and the new slot-equip test fails because slot 1 is still
`null`.

- [ ] **Step 3: Update `_equippedSlots` and the constructor**

In `src/progression/ProgressionSystem.ts`, change (line 80-81):

```ts
  /** 4 equipped spell slots (0–3). Slot 0 always holds magic_bolt. */
  private readonly _equippedSlots: (string | null)[] = ['magic_bolt', null, null, null];
```

to:

```ts
  /** 4 equipped spell slots (0–3). Slot 0 always holds magic_bolt, slot 1 holds lantern. */
  private readonly _equippedSlots: (string | null)[] = ['magic_bolt', 'lantern', null, null];
```

Change (line 98-101):

```ts
  constructor() {
    // magic_bolt is the starter spell — always unlocked, no book required.
    this._unlockedSpells.add('magic_bolt');
  }
```

to:

```ts
  constructor() {
    // magic_bolt is the starter spell — always unlocked, no book required.
    this._unlockedSpells.add('magic_bolt');
    // lantern is a default utility spell — always unlocked and pre-equipped in slot 1,
    // no book/loot required (matches magic_bolt's direct-seed treatment above).
    this._unlockedSpells.add('lantern');
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/progression/ProgressionSystem.test.ts`
Expected: PASS — all tests in the file, including the updated and new ones.

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: error count still 144.

- [ ] **Step 6: Commit**

```bash
git add src/progression/ProgressionSystem.ts tests/progression/ProgressionSystem.test.ts
git commit -m "feat: unlock and equip lantern as a default starting spell

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: `main.ts` wiring

**Files:**
- Modify: `src/main.ts` — cast-options block (around line 3115-3204)

**Interfaces:**
- Consumes: `SpellSystem.CastOptions.onLanternToggle` (Task 1), `PlayerController.isLanternOn`
  and `group.userData['_lanternToggle']` (Task 2).
- Produces: nothing new for later tasks — this is the final glue step. No automated test exists
  for `main.ts`'s cast-options wiring block (it's a thin closure with no exported unit and no
  existing test coverage for its sibling `onBlink`/`onLevitateToggle`/`onFlyBurst` callbacks
  either) — verified instead via `tsc` (catches signature mismatches) and a manual in-game check
  documented in Step 3 below.

- [ ] **Step 1: Add the `onLanternToggle` callback**

In `src/main.ts`, find the `onFlyBurst` callback block (lines 3194-3203):

```ts
              onFlyBurst: (_angle) => {
                // Toggle sustained fly spell mode (WoW-style free flight)
                const wasFlying = player.flySpellMode;
                player.flySpellMode = !wasFlying;
                player.group.userData['_flySpellMode'] = player.flySpellMode;
                particles.burst(player.group.position, 0xffdd44, wasFlying ? 8 : 20, wasFlying ? 2.0 : 4.5, 0.4);
                if (!wasFlying) {
                  lighting.addSpellPulse(player.group.position, 0xffdd44);
                }
              },
            },
          );
```

Change to:

```ts
              onFlyBurst: (_angle) => {
                // Toggle sustained fly spell mode (WoW-style free flight)
                const wasFlying = player.flySpellMode;
                player.flySpellMode = !wasFlying;
                player.group.userData['_flySpellMode'] = player.flySpellMode;
                particles.burst(player.group.position, 0xffdd44, wasFlying ? 8 : 20, wasFlying ? 2.0 : 4.5, 0.4);
                if (!wasFlying) {
                  lighting.addSpellPulse(player.group.position, 0xffdd44);
                }
              },
              onLanternToggle: () => {
                // Toggle the carried lantern light + prop on/off
                const wasOn = player.isLanternOn;
                player.isLanternOn = !wasOn;
                player.group.userData['_lanternToggle'] = player.isLanternOn;
              },
            },
          );
```

- [ ] **Step 2: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: error count still 144. This is the primary verification for this task — `tsc` will
fail if `onLanternToggle` doesn't match the `CastOptions` field added in Task 1, or if
`player.isLanternOn` doesn't match the field added in Task 2.

- [ ] **Step 3: Manual in-game verification**

Run: `npm run dev` (or the project's existing dev-server command), then in the running game:
1. Confirm the lantern spell icon appears in mouse-slot 1 of the hotbar from game start (no
   book pickup required).
2. Press the slot-1 cast key/click. Confirm a warm-colored spark burst appears at the player and
   a small warm point light + visible lantern prop appear near the player's hip, staying attached
   as the player moves.
3. Cast slot 1 again. Confirm the light and prop disappear (toggled off).
4. Move into a dark area (night, or a dungeon interior) with the lantern on. Confirm the
   surrounding area is visibly lit compared to lantern-off.

Document the outcome (pass/fail + any visual tuning notes) before moving to Task 5. If step 4's
light radius/intensity feels wrong, tune `_lanternLight`'s constructor args in
`PlayerController.ts` (Task 2) — this is a value tweak, not a structural change, and does not
require redoing Task 2's tests.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire lantern spell toggle into main.ts cast options

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Full regression + ship

**Files:** none new — this task only runs verification and pushes.

**Interfaces:** N/A (verification-only task).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: the same 12 pre-existing baseline failures as documented in the project's ongoing
verification history (`main.startup.smoke.test.ts`×3, `enemyLoader.test.ts`×3,
`towerGenerator.test.ts`×2, `talentSystem.test.ts`×3, `WaterMaterial.test.ts`×1), plus all new
lantern tests passing, and zero new failures. If `OverworldScene.chunk-scatter-alignment.test.ts`
or `ResourceNodePlacer.test.ts` fail, re-run just those two files in isolation to confirm they're
the known sandbox-contention flakes, not a real regression, before proceeding.

- [ ] **Step 2: Final `tsc` check**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: error count still 144.

- [ ] **Step 3: Push to `main`**

```bash
git push origin HEAD:main
```

- [ ] **Step 4: Update session todo tracking**

Mark this feature's todo (if one exists in the `todos` table) as `done`. If no todo row exists
for the lantern spell yet, this step is a no-op — the feature was tracked via chat, not the
todo table.
