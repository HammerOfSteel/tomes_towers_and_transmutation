# Time-Skip Spell ("Time Warp") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new spellbar spell, `time_warp`, that lets the player fast-forward the day/night clock to a preset time of day (dawn/noon/dusk/midnight) via a non-modal bottom HUD strip and a spinning time-vortex VFX, styled after `TamingGame`'s presentation language.

**Architecture:** A new `TimeSkipUI` class (mirroring `TamingGame`'s `begin()`/`update(dt)`/`active`/`close()` shape) owns the picker UI and the eased, forward-only advancement of `TimeSystem.instance.hour`. It's triggered by a new `movement`-type spell (`time_warp`) through the existing `SpellSystem._fireMovement()` dispatch point and a new `CastOptions.onTimeSkip` callback — no new `SpellType`, no new input-gating anywhere in `main.ts`.

**Tech Stack:** TypeScript, Three.js (unmocked in interactable tests, mocked in `SpellSystem.test.ts`), Vitest + jsdom.

## Global Constraints

- Full design spec: `docs/superpowers/specs/2026-09-01-timeskip-spell-design.md`. Read it before starting — it documents *why* each decision below was made, including two rounds of corrections found while grounding the design against the actual codebase.
- `time_warp` reuses `SpellDef.type: 'movement'` — do NOT add a new `SpellType` variant.
- No input-gating changes anywhere in `main.ts` beyond the wiring itself — the existing 45s cooldown already prevents re-cast spam, and `TamingGame`'s precedent shows movement/casting should stay fully live during non-modal UI.
- `timeSkipUI.update(dt)` MUST be called after `TimeSystem.instance.update(dt)` and before `_dayNight.update(TimeSystem.instance.hour)` in the per-frame exterior-mode loop, or the warped hour will lag a frame behind the lighting update.
- The clock only ever moves **forward** (wrapping past 24 if needed) — never backward/rewinding.
- Run `npx tsc --noEmit` after every task and confirm the error count doesn't increase from whatever baseline `git stash` shows before you start (this codebase has pre-existing tsc errors unrelated to this feature — you're checking for *new* errors, not zero errors).

---

### Task 1: `TimeSystem.setHour()`

**Files:**
- Modify: `src/world/TimeSystem.ts:26-34` (between `hour` field and `update()`)
- Test: `tests/world/TimeSystem.test.ts` (new file)

**Interfaces:**
- Produces: `TimeSystem.instance.setHour(h: number): void` — wraps `h` into `[0, 24)` (handles negative and >=24 inputs) and writes through to `localStorage['ttt-time-hour']` immediately (unlike the existing probabilistic write in `update()`).

- [ ] **Step 1: Write the failing test**

Create `tests/world/TimeSystem.test.ts`:

```ts
// tests/world/TimeSystem.test.ts
//
//  Unit tests for TimeSystem.setHour() — the immediate, exact-value hour
//  setter used by TimeSkipUI's fast-forward animation. TimeSystem.instance
//  is a module-level singleton, so each test explicitly sets a known
//  starting hour rather than relying on constructor defaults.

import { describe, it, expect, beforeEach } from 'vitest';
import { TimeSystem } from '@/world/TimeSystem';

describe('TimeSystem.setHour', () => {
  beforeEach(() => {
    TimeSystem.instance.setHour(8); // deterministic baseline before each test
  });

  it('sets the hour to the given value', () => {
    TimeSystem.instance.setHour(14.5);
    expect(TimeSystem.instance.hour).toBe(14.5);
  });

  it('wraps a value >= 24 into [0, 24)', () => {
    TimeSystem.instance.setHour(25.5);
    expect(TimeSystem.instance.hour).toBe(1.5);
  });

  it('wraps a negative value into [0, 24)', () => {
    TimeSystem.instance.setHour(-2);
    expect(TimeSystem.instance.hour).toBe(22);
  });

  it('accepts exactly 0 without wrapping to 24', () => {
    TimeSystem.instance.setHour(0);
    expect(TimeSystem.instance.hour).toBe(0);
  });

  it('writes through to localStorage immediately', () => {
    TimeSystem.instance.setHour(19);
    expect(localStorage.getItem('ttt-time-hour')).toBe('19');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/TimeSystem.test.ts`
Expected: FAIL — `TimeSystem.instance.setHour is not a function`

- [ ] **Step 3: Write minimal implementation**

In `src/world/TimeSystem.ts`, the file currently reads (in full):

```ts
const LS_KEY = 'ttt-time-hour';
const REAL_TO_GAME_RATIO = 120; // 1 real s → 2 in-game minutes (120 s/h)

export type SchedulePhase = 'work' | 'home' | 'wander';

export class TimeSystem {
  private static _inst: TimeSystem | null = null;

  /** Singleton accessor. */
  static get instance(): TimeSystem {
    if (!TimeSystem._inst) TimeSystem._inst = new TimeSystem();
    return TimeSystem._inst;
  }

  /** Current in-game hour [0, 24). */
  hour: number;

  private constructor() {
    const saved = parseFloat(localStorage.getItem(LS_KEY) ?? '');
    this.hour = isFinite(saved) ? saved % 24 : 8; // default: 8 am
  }

  /** Advance the clock by `dt` real seconds. */
  update(dt: number): void {
    // Convert real seconds to in-game hours
    this.hour = (this.hour + (dt / REAL_TO_GAME_RATIO) * (60 / 60)) % 24;
    // Persist every ~10 s to avoid too-frequent localStorage writes
    if (Math.random() < 0.01) localStorage.setItem(LS_KEY, String(this.hour));
  }
```

Add `setHour()` right after the `hour` field's constructor init, before `update()`:

```ts
  /**
   * Set the clock to an exact hour, wrapping into [0, 24). Unlike `update()`,
   * this writes through to localStorage immediately — used by TimeSkipUI's
   * fast-forward animation, which needs every intermediate frame (and
   * definitely the final landing value) persisted without waiting on the
   * probabilistic write in `update()`.
   */
  setHour(h: number): void {
    let wrapped = h % 24;
    if (wrapped < 0) wrapped += 24;
    this.hour = wrapped;
    localStorage.setItem(LS_KEY, String(this.hour));
  }

  /** Advance the clock by `dt` real seconds. */
  update(dt: number): void {
```

(i.e. insert the new `setHour()` method, then the existing `update()` method follows unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/TimeSystem.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/world/TimeSystem.ts tests/world/TimeSystem.test.ts
git commit -m "feat: add TimeSystem.setHour() for exact, immediate hour changes

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: `time_warp` spell definition + `onTimeSkip` callback

**Files:**
- Modify: `src/combat/SpellSystem.ts:33-47` (SPELL_DEFS), `:61-75` (CastOptions), `:1506-1530` (`_fireMovement`)
- Test: `tests/combat/SpellSystem.test.ts`

**Interfaces:**
- Consumes: nothing new from other tasks (this task is independent of Task 1).
- Produces: `SPELL_DEFS.time_warp: SpellDef` (`type: 'movement'`); `CastOptions.onTimeSkip?: () => void`; `SpellSystem.cast('time_warp', ...)` invokes `opts.onTimeSkip?.()` and nothing else (no VFX of its own — `TimeSkipUI` owns all its VFX once `onTimeSkip` opens the picker).

- [ ] **Step 1: Write the failing tests**

In `tests/combat/SpellSystem.test.ts`, find the existing lantern test block:

```ts
  // ── lantern toggle ─────────────────────────────────────────────────────
  it('lantern spell def exists with movement type and a low cooldown', () => {
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

Add a matching block immediately after it:

```ts
  // ── time_warp toggle ─────────────────────────────────────────────────────
  it('time_warp spell def exists with movement type and a 45s cooldown', () => {
    expect(sys.isReady('time_warp')).toBe(true);
    sys.cast('time_warp', origin, aim, [], scene);
    expect(sys.isReady('time_warp')).toBe(false);
    expect(sys.cooldownRemaining('time_warp')).toBeCloseTo(45, 5);
  });

  it('time_warp cast invokes onTimeSkip exactly once', () => {
    const onTimeSkip = vi.fn();
    sys.cast('time_warp', origin, aim, [], scene, undefined, { onTimeSkip });
    expect(onTimeSkip).toHaveBeenCalledTimes(1);
  });

  it('time_warp cast does not throw when onTimeSkip is omitted', () => {
    expect(() => sys.cast('time_warp', origin, aim, [], scene)).not.toThrow();
  });

  it('time_warp cast does not also invoke unrelated movement callbacks', () => {
    const onBlink = vi.fn();
    const onLevitateToggle = vi.fn();
    const onFlyBurst = vi.fn();
    const onLanternToggle = vi.fn();
    sys.cast('time_warp', origin, aim, [], scene, undefined, {
      onBlink, onLevitateToggle, onFlyBurst, onLanternToggle,
    });
    expect(onBlink).not.toHaveBeenCalled();
    expect(onLevitateToggle).not.toHaveBeenCalled();
    expect(onFlyBurst).not.toHaveBeenCalled();
    expect(onLanternToggle).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/combat/SpellSystem.test.ts -t time_warp`
Expected: FAIL — `time_warp` not found in `SPELL_DEFS` / `isReady` returns `true` unexpectedly (undefined spell defs are always "ready")

- [ ] **Step 3: Write minimal implementation**

In `src/combat/SpellSystem.ts`, the `SPELL_DEFS` block currently ends:

```ts
  // ── Movement spells ──────────────────────────────────────────────────────
  blink:        { type: 'movement',   color: 0xaa44ff, emissive: 0x660099, damage: 0, speed: 0,  radius: 0,    cooldown: 8  },
  levitate:     { type: 'movement',   color: 0x88ddff, emissive: 0x224455, damage: 0, speed: 0,  radius: 0,    cooldown: 1  },
  fly:          { type: 'movement',   color: 0xffdd44, emissive: 0x886600, damage: 0, speed: 0,  radius: 0,    cooldown: 12 },
  lantern:      { type: 'movement',   color: 0xffaa55, emissive: 0xcc7733, damage: 0, speed: 0,  radius: 0,    cooldown: 0.3 },
};
```

Add `time_warp` after `lantern`:

```ts
  // ── Movement spells ──────────────────────────────────────────────────────
  blink:        { type: 'movement',   color: 0xaa44ff, emissive: 0x660099, damage: 0, speed: 0,  radius: 0,    cooldown: 8  },
  levitate:     { type: 'movement',   color: 0x88ddff, emissive: 0x224455, damage: 0, speed: 0,  radius: 0,    cooldown: 1  },
  fly:          { type: 'movement',   color: 0xffdd44, emissive: 0x886600, damage: 0, speed: 0,  radius: 0,    cooldown: 12 },
  lantern:      { type: 'movement',   color: 0xffaa55, emissive: 0xcc7733, damage: 0, speed: 0,  radius: 0,    cooldown: 0.3 },
  time_warp:    { type: 'movement',   color: 0xffd27a, emissive: 0x7a5a1a, damage: 0, speed: 0,  radius: 0,    cooldown: 45 },
};
```

The `CastOptions` interface currently ends:

```ts
  /** Lantern: toggle the player's carried light on/off. */
  onLanternToggle?: () => void;
}
```

Add `onTimeSkip` after it:

```ts
  /** Lantern: toggle the player's carried light on/off. */
  onLanternToggle?: () => void;
  /** Time Warp: open the time-of-day picker. TimeSkipUI owns all VFX and
   *  clock advancement from here — this spell has none of its own. */
  onTimeSkip?: () => void;
}
```

`_fireMovement()` currently ends:

```ts
    } else if (spellId === 'lantern') {
      // Toggle the player's carried lantern light on/off
      this._addSpark(origin, def.color, 2.0, scene);
      opts.onLanternToggle?.();
    }
  }
```

Add a `time_warp` branch. Note it does **not** call `_addSpark` (or any VFX) — `TimeSkipUI` builds its own dedicated time-vortex VFX once the picker opens, so a generic spark burst here would be redundant clutter:

```ts
    } else if (spellId === 'lantern') {
      // Toggle the player's carried lantern light on/off
      this._addSpark(origin, def.color, 2.0, scene);
      opts.onLanternToggle?.();
    } else if (spellId === 'time_warp') {
      // No spark burst here — TimeSkipUI builds its own time-vortex VFX
      // once the picker opens, so this would just be visual clutter.
      opts.onTimeSkip?.();
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/combat/SpellSystem.test.ts`
Expected: PASS (all tests, including the 4 new `time_warp` ones and every pre-existing test still green)

- [ ] **Step 5: Commit**

```bash
git add src/combat/SpellSystem.ts tests/combat/SpellSystem.test.ts
git commit -m "feat: add time_warp spell def + onTimeSkip cast callback

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: `ProgressionSystem` default unlock + slot-2 equip

**Files:**
- Modify: `src/progression/ProgressionSystem.ts:81` (`_equippedSlots` default), `:98-104` (constructor)
- Test: `tests/progression/ProgressionSystem.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (independent).
- Produces: `time_warp` is unlocked (`isSpellUnlocked('time_warp') === true`) and pre-equipped in slot 2 on every fresh `ProgressionSystem` instance, same treatment as `lantern` in slot 1.

- [ ] **Step 1: Write the failing tests**

In `tests/progression/ProgressionSystem.test.ts`, three existing tests hardcode the current default spell list/slots and need updating to include `time_warp`. Find and replace each:

```ts
  it('getUnlockedSpells returns [lantern, magic_bolt] on fresh instance (starter spells)', () => {
    expect(ps.getUnlockedSpells()).toEqual(['lantern', 'magic_bolt']);
  });
```
→
```ts
  it('getUnlockedSpells returns [lantern, magic_bolt, time_warp] on fresh instance (starter spells)', () => {
    expect(ps.getUnlockedSpells()).toEqual(['lantern', 'magic_bolt', 'time_warp']);
  });
```

```ts
  it('does not unlock spell when no spellUnlock arg is passed', () => {
    ps.markRead('lib__bookshelf__0');
    // magic_bolt and lantern are both pre-unlocked from constructor
    expect(ps.getUnlockedSpells()).toEqual(['lantern', 'magic_bolt']);
  });
```
→
```ts
  it('does not unlock spell when no spellUnlock arg is passed', () => {
    ps.markRead('lib__bookshelf__0');
    // magic_bolt, lantern, and time_warp are all pre-unlocked from constructor
    expect(ps.getUnlockedSpells()).toEqual(['lantern', 'magic_bolt', 'time_warp']);
  });
```

```ts
  it('multiple distinct spells can be unlocked from different books', () => {
    ps.markRead('lib__lectern__0', 'flame_dart');
    ps.markRead('lib__lectern__1', 'magic_bolt'); // already pre-unlocked, no double-add
    expect(ps.getUnlockedSpells()).toEqual(['flame_dart', 'lantern', 'magic_bolt']);
  });
```
→
```ts
  it('multiple distinct spells can be unlocked from different books', () => {
    ps.markRead('lib__lectern__0', 'flame_dart');
    ps.markRead('lib__lectern__1', 'magic_bolt'); // already pre-unlocked, no double-add
    expect(ps.getUnlockedSpells()).toEqual(['flame_dart', 'lantern', 'magic_bolt', 'time_warp']);
  });
```

```ts
  it('lantern is unlocked and equipped in slot 1 by default on a fresh instance', () => {
    expect(ps.isSpellUnlocked('lantern')).toBe(true);
    expect(ps.getEquippedSlots()).toEqual(['magic_bolt', 'lantern', null, null]);
  });
```
→
```ts
  it('lantern is unlocked and equipped in slot 1 by default on a fresh instance', () => {
    expect(ps.isSpellUnlocked('lantern')).toBe(true);
    expect(ps.getEquippedSlots()).toEqual(['magic_bolt', 'lantern', null, null]);
  });

  it('time_warp is unlocked and equipped in slot 2 by default on a fresh instance', () => {
    expect(ps.isSpellUnlocked('time_warp')).toBe(true);
    expect(ps.getEquippedSlots()).toEqual(['magic_bolt', 'lantern', 'time_warp', null]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/progression/ProgressionSystem.test.ts`
Expected: FAIL — the 3 updated assertions fail (actual arrays are missing `time_warp`), and the new slot-2 test fails (`isSpellUnlocked('time_warp')` is `false`, slot 2 is `null`)

- [ ] **Step 3: Write minimal implementation**

`src/progression/ProgressionSystem.ts` currently has:

```ts
  /** 4 equipped spell slots (0–3). Slot 0 always holds magic_bolt, slot 1 holds lantern. */
  private readonly _equippedSlots: (string | null)[] = ['magic_bolt', 'lantern', null, null];
```

Change to:

```ts
  /** 4 equipped spell slots (0–3). Slot 0 always holds magic_bolt, slot 1
   *  holds lantern, slot 2 holds time_warp — all three are default utility
   *  spells granted with no book/loot requirement. */
  private readonly _equippedSlots: (string | null)[] = ['magic_bolt', 'lantern', 'time_warp', null];
```

And the constructor currently has:

```ts
  constructor() {
    // magic_bolt is the starter spell — always unlocked, no book required.
    this._unlockedSpells.add('magic_bolt');
    // lantern is a default utility spell — always unlocked and pre-equipped in slot 1,
    // no book/loot required (matches magic_bolt's direct-seed treatment above).
    this._unlockedSpells.add('lantern');
  }
```

Change to:

```ts
  constructor() {
    // magic_bolt is the starter spell — always unlocked, no book required.
    this._unlockedSpells.add('magic_bolt');
    // lantern is a default utility spell — always unlocked and pre-equipped in slot 1,
    // no book/loot required (matches magic_bolt's direct-seed treatment above).
    this._unlockedSpells.add('lantern');
    // time_warp is a default utility spell — always unlocked and pre-equipped
    // in slot 2, same treatment as lantern (see design spec
    // docs/superpowers/specs/2026-09-01-timeskip-spell-design.md for why:
    // blink/levitate/fly have no real non-debug unlock path today, and
    // giving time_warp that same treatment would make it just as
    // unreachable in a normal playthrough).
    this._unlockedSpells.add('time_warp');
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/progression/ProgressionSystem.test.ts`
Expected: PASS (all tests, including the new/updated ones)

- [ ] **Step 5: Commit**

```bash
git add src/progression/ProgressionSystem.ts tests/progression/ProgressionSystem.test.ts
git commit -m "feat: unlock + pre-equip time_warp by default, like lantern

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: `HUD.ts` glyph/label/description entries

**Files:**
- Modify: `src/ui/HUD.ts:297-326`

**Interfaces:**
- Consumes: nothing (pure static data, independent of other tasks).
- Produces: `SPELL_GLYPH.time_warp`, `SPELL_LABEL.time_warp`, `SPELL_DESC.time_warp` — consumed by the existing hotbar rendering code at `HUD.ts:530,535,713,715` (unchanged, already does `SPELL_LABEL[id] ?? id` etc.).

No test file exists for `HUD.ts` today (checked: `tests/ui/HUD.test.ts` doesn't exist, and no other test file references `SPELL_GLYPH`/`SPELL_LABEL`/`SPELL_DESC`) — this is pure display-string data with no established test precedent to extend. Verify it visually in Task 7's manual playtest instead.

- [ ] **Step 1: Edit the three tables**

`src/ui/HUD.ts` currently has:

```ts
const SPELL_GLYPH: Record<string, string> = {
  magic_bolt:   '🔵',
  flame_dart:   '🔥',
  intimidate:   '💢',
  nova_burst:   '💥',
  chain_arc:    '⚡',
  void_rift:    '🌀',
  battle_hymn:  '🎵',
  mass_animate: '💀',
};
const SPELL_LABEL: Record<string, string> = {
  magic_bolt:   'Magic Bolt',
  flame_dart:   'Flame Dart',
  intimidate:   'Intimidate',
  nova_burst:   'Nova Burst',
  chain_arc:    'Chain Arc',
  void_rift:    'Void Rift',
  battle_hymn:  'Battle Hymn',
  mass_animate: 'Mass Animate',
};
const SPELL_DESC: Record<string, string> = {
  magic_bolt:   'A focused bolt of arcane energy.\nRight-click to cast.',
  flame_dart:   'A dart of conjured fire — burns brighter.\nRight-click to cast.',
  intimidate:   'An AOE cry that sends nearby creatures fleeing.\n10u radius. 8s cooldown.',
  nova_burst:   'Player-centred radial explosion.\n12u radius · 8 dmg · 15s cooldown.\nExpanding torus VFX.',
  chain_arc:    'Lightning bolt that bounces to 3 nearby enemies.\nEach bounce deals −15%. 5s cooldown.',
  void_rift:    'Stationary DoT zone at cursor point.\n3 dmg/s for 8s · 2u radius. 12s cooldown.',
  battle_hymn:  'Aura buff: minions deal +50% damage for 12s.\nGold ring follows you. 20s cooldown.',
  mass_animate: 'Raises dead enemy corpses as temporary minions.\n[Gated: Conductor tier 2] 30s cooldown.',
};
```

Add a `time_warp` entry to each table (note: `blink`/`levitate`/`fly`/`lantern` are absent from these tables today too — a pre-existing gap, left alone):

```ts
const SPELL_GLYPH: Record<string, string> = {
  magic_bolt:   '🔵',
  flame_dart:   '🔥',
  intimidate:   '💢',
  nova_burst:   '💥',
  chain_arc:    '⚡',
  void_rift:    '🌀',
  battle_hymn:  '🎵',
  mass_animate: '💀',
  time_warp:    '⏳',
};
const SPELL_LABEL: Record<string, string> = {
  magic_bolt:   'Magic Bolt',
  flame_dart:   'Flame Dart',
  intimidate:   'Intimidate',
  nova_burst:   'Nova Burst',
  chain_arc:    'Chain Arc',
  void_rift:    'Void Rift',
  battle_hymn:  'Battle Hymn',
  mass_animate: 'Mass Animate',
  time_warp:    'Time Warp',
};
const SPELL_DESC: Record<string, string> = {
  magic_bolt:   'A focused bolt of arcane energy.\nRight-click to cast.',
  flame_dart:   'A dart of conjured fire — burns brighter.\nRight-click to cast.',
  intimidate:   'An AOE cry that sends nearby creatures fleeing.\n10u radius. 8s cooldown.',
  nova_burst:   'Player-centred radial explosion.\n12u radius · 8 dmg · 15s cooldown.\nExpanding torus VFX.',
  chain_arc:    'Lightning bolt that bounces to 3 nearby enemies.\nEach bounce deals −15%. 5s cooldown.',
  void_rift:    'Stationary DoT zone at cursor point.\n3 dmg/s for 8s · 2u radius. 12s cooldown.',
  battle_hymn:  'Aura buff: minions deal +50% damage for 12s.\nGold ring follows you. 20s cooldown.',
  mass_animate: 'Raises dead enemy corpses as temporary minions.\n[Gated: Conductor tier 2] 30s cooldown.',
  time_warp:    'Warp the clock to dawn, noon, dusk, or midnight.\nChoose from a bottom panel. 45s cooldown.',
};
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | grep -i "HUD.ts" | head -20`
Expected: no new errors mentioning `HUD.ts` beyond whatever pre-existing baseline errors exist elsewhere in the file (there should be none from this change — it's a `Record<string, string>` literal, fully type-safe).

- [ ] **Step 3: Commit**

```bash
git add src/ui/HUD.ts
git commit -m "feat: add time_warp hotbar glyph/label/description

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: `TimeSkipUI` class (picker UI + time-vortex VFX + hour animation)

**Files:**
- Create: `src/interactables/TimeSkipUI.ts`
- Test: `tests/interactables/timeSkipUI.test.ts` (new file)

**Interfaces:**
- Consumes: `TimeSystem.instance.hour` (read) and `TimeSystem.instance.setHour()` (write, from Task 1).
- Produces:
  - `export class TimeSkipUI { constructor(scene?: THREE.Scene); get active(): boolean; onToast: ((text: string) => void) | null; begin(origin: THREE.Vector3): void; update(dt: number): void; close(): void; dispose(): void; }`
  - Task 6 (main.ts wiring) constructs one instance, wires `onToast` to `_storyToast`, calls `begin()` from the `onTimeSkip` cast callback, and calls `update(dt)` every frame.

- [ ] **Step 1: Write the failing tests**

Create `tests/interactables/timeSkipUI.test.ts`:

```ts
// tests/interactables/timeSkipUI.test.ts
//
//  Unit tests for TimeSkipUI's state machine and forward-only hour
//  animation. Constructed with no THREE.Scene argument (matching
//  tests/interactables/tamingGame.test.ts's precedent) so the
//  TimeVortexVfx branch — real, unmocked THREE.js — is never exercised;
//  these tests only cover DOM strip + TimeSystem interaction.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { TimeSkipUI } from '@/interactables/TimeSkipUI';
import { TimeSystem } from '@/world/TimeSystem';

const ORIGIN = new THREE.Vector3(0, 0, 0);

/** Click the nth preset button inside the active time-skip strip. */
function clickPreset(index: number): void {
  const strips = document.querySelectorAll('#timeskip-strip');
  const strip = strips[strips.length - 1] as HTMLElement;
  const buttons = strip.querySelectorAll('button');
  (buttons[index] as HTMLButtonElement).click();
}

describe('TimeSkipUI', () => {
  let ui: TimeSkipUI;

  beforeEach(() => {
    TimeSystem.instance.setHour(8); // deterministic starting hour
    ui = new TimeSkipUI();
  });

  afterEach(() => {
    ui.dispose();
    document.querySelectorAll('#timeskip-strip').forEach(el => el.remove());
  });

  it('is not active before begin()', () => {
    expect(ui.active).toBe(false);
  });

  it('becomes active after begin() and shows the strip with 4 preset buttons', () => {
    ui.begin(ORIGIN);
    expect(ui.active).toBe(true);
    const strip = document.querySelector('#timeskip-strip') as HTMLElement;
    expect(strip).not.toBeNull();
    expect(strip.querySelectorAll('button').length).toBe(4);
  });

  it('begin() is a no-op if already active', () => {
    ui.begin(ORIGIN);
    ui.begin(ORIGIN);
    expect(document.querySelectorAll('#timeskip-strip').length).toBe(1);
  });

  it('close() deactivates and removes the strip', () => {
    ui.begin(ORIGIN);
    ui.close();
    expect(ui.active).toBe(false);
    expect(document.querySelector('#timeskip-strip')).toBeNull();
  });

  it('picking noon (hour 12) advances TimeSystem.instance.hour toward 12 over time', () => {
    ui.begin(ORIGIN);
    clickPreset(1); // index 1 = Noon in PRESETS order
    ui.update(1.25); // halfway through the 2.5s warp
    expect(TimeSystem.instance.hour).toBeGreaterThan(8);
    expect(TimeSystem.instance.hour).toBeLessThan(12);
    ui.update(1.25); // finishes the warp
    expect(TimeSystem.instance.hour).toBe(12);
    expect(ui.active).toBe(false); // auto-closes on completion
  });

  it('forward-wraps past midnight rather than moving backward (22:00 -> dawn 6:00)', () => {
    TimeSystem.instance.setHour(22);
    ui.begin(ORIGIN);
    clickPreset(0); // index 0 = Dawn (hour 6)
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      ui.update(0.25);
      samples.push(TimeSystem.instance.hour);
    }
    // Hour must never move backward until it wraps past 24 -> re-enters near 0
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const cur = samples[i];
      const movedForwardOrWrapped = cur >= prev || (prev > 20 && cur < 4);
      expect(movedForwardOrWrapped).toBe(true);
    }
    expect(TimeSystem.instance.hour).toBe(6);
  });

  it('picking a preset equal to the current hour completes without error', () => {
    TimeSystem.instance.setHour(12);
    ui.begin(ORIGIN);
    clickPreset(1); // Noon (hour 12), already at 12
    ui.update(2.5);
    expect(TimeSystem.instance.hour).toBe(12);
    expect(ui.active).toBe(false);
  });

  it('Escape cancels the picker without changing the hour', () => {
    ui.begin(ORIGIN);
    const before = TimeSystem.instance.hour;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(ui.active).toBe(false);
    expect(TimeSystem.instance.hour).toBe(before);
  });

  it('Escape during the warp animation does not cancel it', () => {
    ui.begin(ORIGIN);
    clickPreset(1); // Noon
    ui.update(0.5); // now mid-warp
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(ui.active).toBe(true); // still animating, Escape only cancels the picker phase
  });

  it('invokes onToast with the preset toast text once the warp completes', () => {
    let toastText: string | null = null;
    ui.onToast = (text) => { toastText = text; };
    ui.begin(ORIGIN);
    clickPreset(3); // index 3 = Midnight
    ui.update(2.5);
    expect(toastText).toBe('Time flows to midnight\u2026');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/interactables/timeSkipUI.test.ts`
Expected: FAIL — `Cannot find module '@/interactables/TimeSkipUI'`

- [ ] **Step 3: Write the implementation**

Create `src/interactables/TimeSkipUI.ts`:

```ts
// ── TimeSkipUI — "Time Warp" spell UI ─────────────────────────────────────────
//
//  Non-modal bottom HUD strip (styled after TamingGame's "Princess's Song"
//  strip) that lets the player pick a preset time of day, then plays a
//  spinning time-vortex VFX while TimeSystem.instance.hour eases forward
//  toward the chosen target over a fixed real-time window.
//
//  Design: docs/superpowers/specs/2026-09-01-timeskip-spell-design.md
//
//  Usage:
//    const timeSkipUI = new TimeSkipUI(scene);   // once at startup
//    timeSkipUI.onToast = (text) => _storyToast(text, 'beat');
//    // from the time_warp spell's onTimeSkip callback:
//    timeSkipUI.begin(player.group.position);
//    // call timeSkipUI.update(dt) every frame, BEFORE _dayNight.update(...)

import * as THREE from 'three';
import { TimeSystem } from '@/world/TimeSystem';

type Phase = 'idle' | 'choosing' | 'warping';

interface TimePreset {
  key: string;
  label: string;
  glyph: string;
  hour: number;
  toast: string;
}

// Hour anchors chosen to land on strongly-saturated DayNightSystem phase
// colours rather than mid-transition blends — see design spec for the
// hour-19-for-dusk reasoning (DayNightSystem's dusk->night branch gives a
// pure, un-blended dusk phase exactly at hour 19).
const PRESETS: TimePreset[] = [
  { key: 'dawn',     label: 'Dawn',     glyph: '🌅', hour: 6,  toast: 'Time flows to dawn\u2026' },
  { key: 'noon',     label: 'Noon',     glyph: '☀️', hour: 12, toast: 'Time flows to noon\u2026' },
  { key: 'dusk',     label: 'Dusk',     glyph: '🌇', hour: 19, toast: 'Time flows to dusk\u2026' },
  { key: 'midnight', label: 'Midnight', glyph: '🌙', hour: 0,  toast: 'Time flows to midnight\u2026' },
];

const WARP_DURATION = 2.5; // seconds — fixed real-time window for the warp animation

function _easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/** Advance `from` toward `to` by fraction `t` in [0, 1], always moving
 *  forward — wraps past 24 if `to` is numerically behind `from` so the
 *  clock never appears to run backward mid-animation. */
function _lerpHourForward(from: number, to: number, t: number): number {
  const to24 = to >= from ? to : to + 24;
  return (from + (to24 - from) * t) % 24;
}

// ── Time Vortex VFX — spinning clock-face rune ring ───────────────────────────

class TimeVortexVfx {
  readonly group: THREE.Group;
  private readonly _rim: THREE.Mesh;
  private readonly _hand: THREE.Mesh;
  /** Radians/sec — TimeSkipUI ramps this up while the warp is in flight. */
  spinSpeed = 1.2;

  constructor(pos: THREE.Vector3) {
    this.group = new THREE.Group();
    this.group.position.set(pos.x, pos.y + 1.6, pos.z);

    // Clock rim — flat golden torus, lying in the XZ plane
    const rimGeo = new THREE.TorusGeometry(0.55, 0.035, 8, 32);
    const rimMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
    this._rim = new THREE.Mesh(rimGeo, rimMat);
    this._rim.rotation.x = Math.PI / 2;
    this.group.add(this._rim);

    // 12 fixed hour-tick marks around the rim — pale blue, like clock numerals
    const tickGeo = new THREE.SphereGeometry(0.03, 5, 4);
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(tickGeo, new THREE.MeshBasicMaterial({ color: 0xbcd8ff }));
      const a = (i / 12) * Math.PI * 2;
      mesh.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      this.group.add(mesh);
    }

    // Sweeping clock hand, pivoting at the rim's centre
    const handGeo = new THREE.BoxGeometry(0.045, 0.02, 0.44);
    handGeo.translate(0, 0, 0.22);
    const handMat = new THREE.MeshBasicMaterial({ color: 0xfff2cc });
    this._hand = new THREE.Mesh(handGeo, handMat);
    this.group.add(this._hand);
  }

  update(dt: number): void {
    this._rim.rotation.z += 0.35 * dt;
    this._hand.rotation.y += this.spinSpeed * dt;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m: THREE.Material) => m.dispose());
      } else {
        (obj.material as THREE.Material).dispose();
      }
    });
  }
}

// ── TimeSkipUI ─────────────────────────────────────────────────────────────────

export class TimeSkipUI {
  private _phase: Phase = 'idle';
  private _vortex: TimeVortexVfx | null = null;
  private _strip: HTMLDivElement | null = null;
  private _fromHour = 0;
  private _toHour = 0;
  private _elapsed = 0;
  private _activePreset: TimePreset | null = null;

  /** Fired once, with the preset's toast text, when a warp finishes landing. */
  onToast: ((text: string) => void) | null = null;

  private readonly _onKeydown = (e: KeyboardEvent): void => {
    // Escape only cancels the *picker* — once warping has started, let it
    // finish (the strip is already gone by then, so there's nothing to cancel).
    if (e.code === 'Escape' && this._phase === 'choosing') this.close();
  };

  constructor(private readonly _scene?: THREE.Scene) {
    window.addEventListener('keydown', this._onKeydown);
  }

  get active(): boolean { return this._phase !== 'idle'; }

  // ── Public API ─────────────────────────────────────────────────────────────

  begin(origin: THREE.Vector3): void {
    if (this._phase !== 'idle') return;
    this._phase = 'choosing';

    if (this._scene) {
      this._vortex = new TimeVortexVfx(origin);
      this._scene.add(this._vortex.group);
    }

    this._buildStrip();
  }

  update(dt: number): void {
    this._vortex?.update(dt);

    if (this._phase !== 'warping') return;

    this._elapsed += dt;
    const t = Math.min(this._elapsed / WARP_DURATION, 1);
    TimeSystem.instance.setHour(_lerpHourForward(this._fromHour, this._toHour, _easeInOut(t)));

    // Spin fastest at the midpoint of the warp, slowest at the ends —
    // matches the ease-in/out "spinning up, then settling" feel.
    if (this._vortex) this._vortex.spinSpeed = 1.2 + (1 - Math.abs(t - 0.5) * 2) * 6;

    if (t >= 1) {
      TimeSystem.instance.setHour(this._toHour); // exact landing value, no float drift
      this.onToast?.(this._activePreset?.toast ?? '');
      this.close();
    }
  }

  close(): void {
    if (this._vortex && this._scene) this._vortex.dispose(this._scene);
    this._vortex = null;
    this._strip?.remove();
    this._strip = null;
    this._phase = 'idle';
    this._activePreset = null;
  }

  /** Remove the window keydown listener. Call once at app teardown (mirrors
   *  how other window-listener-holding UI classes in this codebase expect
   *  to be torn down, e.g. QuestAcceptModal). */
  dispose(): void {
    window.removeEventListener('keydown', this._onKeydown);
    this.close();
  }

  // ── Private — picker logic ───────────────────────────────────────────────

  private _onPresetChosen(preset: TimePreset): void {
    if (this._phase !== 'choosing') return;
    this._fromHour = TimeSystem.instance.hour;
    this._toHour = preset.hour;
    this._activePreset = preset;
    this._elapsed = 0;
    this._phase = 'warping';

    // Strip closes immediately on selection — the vortex VFX + racing sky
    // is the feedback from here on, not the strip.
    this._strip?.remove();
    this._strip = null;
  }

  // ── Private — bottom HUD strip ────────────────────────────────────────────

  private _buildStrip(): void {
    const strip = document.createElement('div');
    strip.id = 'timeskip-strip';
    Object.assign(strip.style, {
      position: 'fixed',
      bottom: '0', left: '0', right: '0',
      background: 'linear-gradient(to bottom, transparent 0%, rgba(10,8,2,0.97) 30%)',
      padding: '4px 5% 22px',
      zIndex: '800',
      fontFamily: '"Palatino Linotype", Palatino, serif',
      color: '#e8dcc8',
      userSelect: 'none',
    });

    const titleEl = document.createElement('div');
    titleEl.textContent = '⏳  Time Warp — choose a time of day';
    Object.assign(titleEl.style, {
      fontSize: '11px', letterSpacing: '2px', color: '#aa8855', opacity: '0.85',
      marginBottom: '8px',
    });
    strip.appendChild(titleEl);

    const choicesEl = document.createElement('div');
    Object.assign(choicesEl.style, { display: 'flex', gap: '10px', flexWrap: 'wrap' });

    PRESETS.forEach(preset => {
      const btn = document.createElement('button');
      btn.textContent = `${preset.glyph}  ${preset.label}`;
      Object.assign(btn.style, {
        flex: '1 1 calc(25% - 8px)', minWidth: '130px',
        padding: '10px 14px',
        background: 'rgba(22,14,4,0.88)',
        border: '1px solid #aa7733',
        borderRadius: '6px',
        color: '#e8d8b8',
        fontFamily: 'inherit', fontSize: '13px', letterSpacing: '0.5px',
        cursor: 'pointer',
        transition: 'background 0.12s, border-color 0.12s, box-shadow 0.12s, transform 0.08s',
        boxShadow: '0 0 8px rgba(180,120,40,0.2)',
      });
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(60,36,8,0.92)';
        btn.style.borderColor = '#ffaa55';
        btn.style.boxShadow = '0 0 18px rgba(255,170,85,0.55)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(22,14,4,0.88)';
        btn.style.borderColor = '#aa7733';
        btn.style.boxShadow = '0 0 8px rgba(180,120,40,0.2)';
      });
      btn.addEventListener('click', () => {
        btn.style.transform = 'scale(0.93)';
        setTimeout(() => { btn.style.transform = ''; }, 110);
        this._onPresetChosen(preset);
      });
      choicesEl.appendChild(btn);
    });

    strip.appendChild(choicesEl);
    document.body.appendChild(strip);
    this._strip = strip;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/interactables/timeSkipUI.test.ts`
Expected: PASS (all 11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/interactables/TimeSkipUI.ts tests/interactables/timeSkipUI.test.ts
git commit -m "feat: add TimeSkipUI picker + time-vortex VFX + forward-only hour warp

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Wire `TimeSkipUI` into `main.ts`

**Files:**
- Modify: `src/main.ts:52` (imports), `~346` (instantiation, next to `tamingGame`), `~2772-2774` (per-frame update ordering), `~3219-3225` (`onLanternToggle` cast-options block, add `onTimeSkip` after it)

**Interfaces:**
- Consumes: `TimeSkipUI` from Task 5, `time_warp`/`onTimeSkip` from Task 2.
- Produces: a working end-to-end spell — this is the task where the feature becomes playable.

- [ ] **Step 1: Add the import**

`src/main.ts:52` currently has:

```ts
import { TamingGame } from '@/interactables/TamingGame';
```

Add directly after it:

```ts
import { TamingGame } from '@/interactables/TamingGame';
import { TimeSkipUI } from '@/interactables/TimeSkipUI';
```

- [ ] **Step 2: Instantiate `TimeSkipUI` next to `tamingGame`**

`src/main.ts` currently has (around line 346):

```ts
  const party = new PartyManager(20);
  const tamingGame = new TamingGame(scene, cameraRig.camera);
```

Change to:

```ts
  const party = new PartyManager(20);
  const tamingGame = new TamingGame(scene, cameraRig.camera);
  const timeSkipUI = new TimeSkipUI(scene);
  timeSkipUI.onToast = (text) => { _storyToast(text, 'beat'); };
```

(`_storyToast` is defined later in the same module via a hoisted `function` declaration, so referencing it here — inside an arrow function that only runs later, at cast time — is safe even though its declaration appears further down the file.)

- [ ] **Step 3: Fix per-frame update ordering**

`src/main.ts` currently has (around line 2772):

```ts
        TimeSystem.instance.update(dt);
        _dayNight.update(TimeSystem.instance.hour);
        hud.setTime(TimeSystem.instance.formatted);
```

Change to:

```ts
        TimeSystem.instance.update(dt);
        timeSkipUI.update(dt); // must run before _dayNight.update() below, so a
                                // warped hour is reflected the same frame
        _dayNight.update(TimeSystem.instance.hour);
        hud.setTime(TimeSystem.instance.formatted);
```

- [ ] **Step 4: Wire the `onTimeSkip` cast callback**

`src/main.ts` currently has (around line 3219-3225):

```ts
              onLanternToggle: () => {
                // Toggle the carried lantern light + prop on/off
                const wasOn = player.isLanternOn;
                player.isLanternOn = !wasOn;
                player.group.userData['_lanternToggle'] = player.isLanternOn;
              },
            },
          );
```

Change to:

```ts
              onLanternToggle: () => {
                // Toggle the carried lantern light + prop on/off
                const wasOn = player.isLanternOn;
                player.isLanternOn = !wasOn;
                player.group.userData['_lanternToggle'] = player.isLanternOn;
              },
              onTimeSkip: () => {
                // Opens the non-modal bottom-strip time-of-day picker.
                // TimeSkipUI owns everything from here — VFX, the eased
                // clock advancement, and the completion toast.
                timeSkipUI.begin(player.group.position);
              },
            },
          );
```

- [ ] **Step 5: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | grep -i "main.ts" | head -20`
Expected: no new errors mentioning `main.ts` beyond the pre-existing baseline (record the baseline count first with `git stash && npx tsc --noEmit 2>&1 | grep -c "main.ts"; git stash pop` if unsure).

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: same pass/fail counts as the pre-existing baseline (this codebase has a documented baseline of 12 known-unrelated failures — see prior session history; confirm any failure beyond that baseline is a flake via an isolated re-run of just that file before treating it as a regression).

- [ ] **Step 7: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire time_warp spell to TimeSkipUI in the main game loop

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Manual playtest verification

No code changes in this task — verification only. Do not skip this task and do not report the feature as complete without running through every step below and confirming each outcome. This mirrors the "no unverified completion claims" norm used throughout this project (see `docs/superpowers/specs/2026-09-01-timeskip-spell-design.md`'s testing plan).

- [ ] **Step 1: Start the dev server and open the game in a browser**

Run: `npm run dev` (or whatever the project's existing dev-server command is — check `package.json` `scripts` if unsure) and navigate to the running URL. Get into the exterior overworld (start a new game or load a save).

- [ ] **Step 2: Confirm the spell is equipped and visible**

Open whatever UI shows the hotbar (check slot 2, or open `SpellBook.ts`'s UI) and confirm "Time Warp" appears with the ⏳ glyph and the description written in Task 4 — not a raw `time_warp` id or a generic `✦` glyph.

- [ ] **Step 3: Cast it and confirm the picker appears without blocking the world**

Trigger slot 2's cast (per this project's existing cast-input convention — number key or right-click depending on camera mode, same as any other equipped spell). Confirm:
- The bottom strip appears with all 4 preset buttons (🌅 Dawn, ☀️ Noon, 🌇 Dusk, 🌙 Midnight) and readable text.
- The 3D view is not obscured/darkened — the world stays fully visible behind the strip.
- The player can still move around while the strip is up (walk in a direction, confirm the character moves normally).

- [ ] **Step 4: Pick each of the 4 presets in separate casts (waiting out the 45s cooldown between, or using any existing dev "instant cooldowns" cheat if present) and confirm for each:**
- The strip closes immediately on selection.
- A spinning golden clock-vortex VFX appears above the player and visibly spins faster mid-animation.
- The sky/fog/lighting visibly race through phases over roughly 2.5 seconds, ending at a lighting state that matches the chosen preset (e.g. picking Midnight should end in the deep-blue night palette).
- A toast message appears near the end (e.g. "Time flows to midnight…").
- Player input (movement, casting another spell) works normally both during and immediately after the animation.

- [ ] **Step 5: Confirm NPC schedule reaction**

Pick a preset that crosses a schedule boundary (e.g. from a daytime hour to Midnight, which should flip `TimeSystem.instance.schedulePhase` to `'home'`). Find a nearby settlement NPC before and after the warp and confirm their behaviour changes to match the new phase shortly after landing (e.g. they head toward a home position rather than a work position) — this should happen with no extra code, per the design spec's "NPCEntity re-reads schedulePhase every frame" finding; if it does NOT happen, that's a real bug to investigate before considering this task done.

- [ ] **Step 6: Confirm Escape-cancel works**

Cast the spell, then press Escape before picking a preset. Confirm the strip closes and the time-of-day does not change.

- [ ] **Step 7: Check the browser console for errors**

Confirm zero console/page errors were introduced across all of the above (a clean console, matching the project's established live-verification standard for visually-affecting changes).

- [ ] **Step 8: Stop the dev server**

Clean up: stop the dev server process, and remove any temporary debug logging you may have added during verification (there should be none needed for this task, but double-check).

---

### Task 8: Full regression suite + docs changelog entry

**Files:**
- Modify: `docs/visual-progress.md` (append a new dated entry)

- [ ] **Step 1: Run the full test suite one more time from a clean state**

Run: `npx vitest run`
Expected: same pass/fail counts as the pre-existing baseline (12 known-unrelated failures). If any *new* failures appear, stop and fix them before proceeding — do not proceed to Step 2 with an unexplained regression.

- [ ] **Step 2: Run `tsc --noEmit` one more time**

Run: `npx tsc --noEmit 2>&1 | wc -l`
Expected: same count as the pre-existing baseline (this codebase's established baseline — confirm the exact number by checking the count via `git stash && npx tsc --noEmit 2>&1 | wc -l && git stash pop` if you don't already know it from earlier tasks in this plan).

- [ ] **Step 3: Add a changelog entry**

Append a new section to `docs/visual-progress.md` (match the existing entries' style/heading level — check the file's most recent section for the exact format) summarizing: new `time_warp` spell, non-modal bottom-strip time-of-day picker (dawn/noon/dusk/midnight presets), spinning time-vortex VFX, forward-only eased clock warp over 2.5s, pre-equipped in slot 2 by default. Mention that this addresses the user's "lantern too weak / want a time-skip spell based on the charming spell's UI" feedback (lantern brightness was already fixed in a prior commit this session).

- [ ] **Step 4: Commit**

```bash
git add docs/visual-progress.md
git commit -m "docs: log time_warp spell in visual-progress changelog

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 5: Push to main**

Run: `git push origin HEAD` (or whatever this project's established push target is — this session has been pushing verified increments directly to `main` throughout; confirm the current branch before pushing).
