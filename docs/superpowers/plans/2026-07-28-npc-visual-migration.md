# NPC Visual Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make live overworld NPCs (`NPCEntity`) use the new princess-rig-based visual system (`buildNpc`/`buildNpcSync` from `src/npc-creator/`) instead of the old, outdated procedural creature system (`buildCreature`/`CreatureRig`), without changing any gameplay behavior (FSM, dialogue, quests, merchant/innkeeper hooks) or any of `NPCEntity`'s 4 call sites.

**Architecture:** All changes are confined to `src/world/NPCEntity.ts`'s internals plus small additive changes to the npc-creator module (a new `citizen` role, a new `setAnimState` bridge method on `NpcInstance`). `NPCEntity`'s constructor swaps `buildCreature(npcDna(...))` for `buildNpcSync(toNpcDna(...))` — a new private `toNpcDna()` helper bridges the old 9-value `NPCRole`/subrace system to the new 8-value `NpcRole`/`GameSpecies` system. `NPCEntity.update()`'s animation-driving code swaps `animateCreature()`/`snakeLoco` for the new `setAnimState('walk' | 'idle')` bridge method.

**Tech Stack:** TypeScript, Three.js, Vitest (unit tests), Playwright (e2e tests).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-28-npc-visual-migration-design.md`
- No changes to any of the 4 `NPCEntity` call sites in `src/scene/OverworldScene.ts`.
- No changes to dialogue panel, quest-giving (`onQuestGiven`), merchant/innkeeper hooks (`onOpenMerchant`), the `[E]` label, or distance-based update culling in `NPCEntity`.
- `src/world/NPCSpawner.ts` / `SettlementPopulator.ts` stay untouched (unused prototype, out of scope).
- Role mapping: `merchant→merchant`, `guard→guard`, `citizen→citizen` (new), `scholar→scholar`, `innkeeper→innkeeper`, `blacksmith→merchant`, `quest_giver→quest_giver`, `settlement_elder→elder`, `mysterious→mysterious`.
- Species pool: `['human','human','human','elf','vulperia','draconic','slime','celestial']` (replaces old `['human','human','human','elf','goblin','orc','gnome','fae']`, mapping `goblin→vulperia`, `orc→draconic`, `gnome→slime`, `fae→celestial`).
- Run unit tests with `npx vitest run <path>`. Run e2e tests with `npx playwright test <path> --reporter=list` (dev server must be running — see Task 7).

---

### Task 1: Add `citizen` role to the npc-creator module

**Files:**
- Modify: `src/npc-creator/types.ts` (add `'citizen'` to `NpcRole`, plus entries in `ROLE_HAT`, `ROLE_TOOL`, `ROLE_BADGE`)
- Modify: `src/npc-creator/builder.ts` (add `citizen` entry to `ROLE_HAND_R`)
- Modify: `src/npc-creator/defaults/NpcDefaults.ts` (add `citizen` entry to `ROLE_PERSONALITY`)
- Modify: `tests/npc-creator/NpcDefaults.test.ts` (add `'citizen'` to the test's `ALL_ROLES` list)
- Test: `tests/npc-creator/NpcDefaults.test.ts`

**Interfaces:**
- Consumes: nothing new — this task only extends existing `NpcRole`-keyed lookup tables.
- Produces: `NpcRole` now includes `'citizen'`. `getDefaultNpcDna(species, 'citizen', seed)` (existing signature, unchanged) now works without throwing/producing `undefined` lookups. This is consumed by Task 3's `toNpcDna()`.

- [ ] **Step 1: Write the failing test**

Add to `tests/npc-creator/NpcDefaults.test.ts`, replacing the existing `ALL_ROLES` line near the top of the file:

```ts
const ALL_ROLES: NpcRole[] = ['merchant', 'elder', 'quest_giver', 'scholar', 'guard', 'innkeeper', 'mysterious', 'citizen'];
```

Then add a new test at the end of the `describe('getDefaultNpcDna', ...)` block:

```ts
  it('citizen role produces a plain, prop-free commoner look', () => {
    const dna = getDefaultNpcDna('human', 'citizen', 7);
    expect(dna.role).toBe('citizen');
    expect(dna.hat).toBe('none');
    expect(dna.tool).toBe('none');
    expect(dna.badge).toBe('none');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/npc-creator/NpcDefaults.test.ts`
Expected: FAIL — `getDefaultNpcDna` throws or the `hat`/`tool`/`badge` lookups are `undefined`, because `'citizen'` isn't yet a key in `ROLE_HAT`/`ROLE_TOOL`/`ROLE_BADGE`/`ROLE_PERSONALITY`, and TypeScript compilation of the test file will fail because `'citizen'` isn't yet a valid `NpcRole` literal.

- [ ] **Step 3: Add `citizen` to `NpcRole` and its role tables**

In `src/npc-creator/types.ts`, update the `NpcRole` union:

```ts
export type NpcRole =
  | 'merchant'
  | 'elder'
  | 'quest_giver'
  | 'scholar'
  | 'guard'
  | 'innkeeper'
  | 'mysterious'
  | 'citizen';
```

In the same file, add a `citizen` entry to each of the three role tables:

```ts
export const ROLE_HAT: Record<NpcRole, NpcHatId> = {
  merchant:    'wide_brim',
  elder:       'crown_simple',
  quest_giver: 'hood',
  scholar:     'wide_brim',
  guard:       'soldier_helm',
  innkeeper:   'none',
  mysterious:  'blindfold',
  citizen:     'none',
};

export const ROLE_TOOL: Record<NpcRole, NpcToolId> = {
  merchant:    'coin_pouch',
  elder:       'staff',
  quest_giver: 'scroll',
  scholar:     'book',
  guard:       'sword',
  innkeeper:   'lantern',
  mysterious:  'staff',
  citizen:     'none',
};

export const ROLE_BADGE: Record<NpcRole, NpcBadgeId> = {
  merchant:    'merchant_guild',
  elder:       'none',
  quest_giver: 'quest_seal',
  scholar:     'scholars_pin',
  guard:       'town_guard',
  innkeeper:   'none',
  mysterious:  'none',
  citizen:     'none',
};
```

- [ ] **Step 4: Add `citizen` to `ROLE_HAND_R` in builder.ts**

In `src/npc-creator/builder.ts`, update `ROLE_HAND_R`:

```ts
const ROLE_HAND_R: Record<NpcRole, import('@/princess-creator/types').HandItemId> = {
  merchant:    'none',
  elder:       'staff',
  quest_giver: 'none',
  scholar:     'tome',
  guard:       'none',
  innkeeper:   'none',
  mysterious:  'staff',
  citizen:     'none',
};
```

- [ ] **Step 5: Add `citizen` to `ROLE_PERSONALITY` in NpcDefaults.ts**

In `src/npc-creator/defaults/NpcDefaults.ts`, update `ROLE_PERSONALITY`:

```ts
const ROLE_PERSONALITY: Record<NpcRole, NpcPersonality[]> = {
  merchant:    ['friendly', 'cheerful', 'formal'],
  elder:       ['formal', 'friendly', 'wary'],
  quest_giver: ['friendly', 'wary', 'eccentric'],
  scholar:     ['eccentric', 'formal', 'wary'],
  guard:       ['formal', 'wary', 'formal'],
  innkeeper:   ['cheerful', 'friendly', 'eccentric'],
  mysterious:  ['wary', 'eccentric', 'wary'],
  citizen:     ['friendly', 'cheerful', 'wary'],
};
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/npc-creator/NpcDefaults.test.ts`
Expected: PASS (all tests, including the two new/updated ones)

- [ ] **Step 7: Commit**

```bash
git add src/npc-creator/types.ts src/npc-creator/builder.ts src/npc-creator/defaults/NpcDefaults.ts tests/npc-creator/NpcDefaults.test.ts
git commit -m "feat(npc-creator): add citizen role

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Add `setAnimState` bridge method to `NpcInstance`

**Files:**
- Modify: `src/npc-creator/builder.ts` (extend `NpcInstance` interface, implement in `buildNpc()` and `buildNpcSync()`)
- Test: `tests/npc-creator/builder-anim-state.test.ts` (new)

**Interfaces:**
- Consumes: `AnimId` type from `@/princess-creator/anim/clips` (already exported; includes `'idle'` and `'walk'`). `inst.setState(id: AnimId): void` from the `buildPrincess()` return value (already exists, used internally by `speak()`/`stopSpeaking()`).
- Produces: `NpcInstance.setAnimState(id: AnimId): void` — callable on both the real (`buildNpc`) and placeholder-then-swapped (`buildNpcSync`) instances. Consumed by Task 5 (`NPCEntity.update()`).

- [ ] **Step 1: Write the failing test**

Create `tests/npc-creator/builder-anim-state.test.ts`:

```ts
/**
 * builder-anim-state.test.ts
 * Verifies NpcInstance.setAnimState bridges to the underlying princess rig's
 * setState(), matching the pattern already used by EnemyInstance.
 */

import { describe, it, expect } from 'vitest';
import { buildNpc } from '@/npc-creator/builder';
import { getDefaultNpcDna } from '@/npc-creator/defaults/NpcDefaults';

describe('NpcInstance.setAnimState', () => {
  it('exists as a callable method on the built instance', async () => {
    const dna = getDefaultNpcDna('human', 'citizen', 1);
    const inst = await buildNpc({ ...dna, name: 'Test Citizen' });
    expect(typeof inst.setAnimState).toBe('function');
  });

  it('does not throw when switching between walk and idle', async () => {
    const dna = getDefaultNpcDna('human', 'citizen', 2);
    const inst = await buildNpc({ ...dna, name: 'Test Citizen 2' });
    expect(() => inst.setAnimState('walk')).not.toThrow();
    expect(() => inst.setAnimState('idle')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/npc-creator/builder-anim-state.test.ts`
Expected: FAIL — TypeScript error, `setAnimState` does not exist on type `NpcInstance`.

- [ ] **Step 3: Extend the `NpcInstance` interface**

In `src/npc-creator/builder.ts`, add the import and extend the interface:

```ts
import type { NpcDNA, NpcRole } from './types';
import type { PrincessDNA } from '@/princess-creator/types';
import type { BuiltEntity } from '@/procedural/builder/BaseBuilder';
import type { AnimId } from '@/princess-creator/anim/clips';

// ── Public contract ───────────────────────────────────────────────────────────

export interface NpcInstance extends BuiltEntity<NpcDNA> {
  /** Trigger the speaking/gesturing animation. */
  speak():  void;
  /** Return to idle loop. */
  stopSpeaking(): void;
  /** Drive walk/idle (or any other) animation state from external FSM logic. */
  setAnimState(id: AnimId): void;
}
```

- [ ] **Step 4: Implement `setAnimState` in `buildNpc()`**

In `src/npc-creator/builder.ts`'s `buildNpc()` return object, add the new method next to `speak`/`stopSpeaking`:

```ts
  return {
    root:    inst.root,
    dna,
    update(t: number, dt: number) {
      inst.update(t, dt);
    },
    dispose() {
      inst.dispose();
    },
    speak() {
      if (!_speaking) {
        _speaking = true;
        inst.setState('read');       // "read" = thoughtful gesture loop
      }
    },
    stopSpeaking() {
      if (_speaking) {
        _speaking = false;
        inst.setState('idle');
      }
    },
    setAnimState(id: AnimId) {
      inst.setState(id);
    },
  };
```

- [ ] **Step 5: Implement `setAnimState` in `buildNpcSync()`**

In `src/npc-creator/builder.ts`'s `buildNpcSync()`, add the placeholder default and the post-swap wiring:

```ts
export function buildNpcSync(dna: NpcDNA): NpcInstance {
  // Build a placeholder immediately; replace async once factory loads
  const placeholder: NpcInstance = {
    root:         (() => { const { Group } = require('three') as typeof import('three'); return new Group(); })(),
    dna,
    update:       () => {},
    dispose:      () => {},
    speak:        () => {},
    stopSpeaking: () => {},
    setAnimState: () => {},
  };
  buildNpc(dna).then(inst => {
    // Swap geometry when ready
    placeholder.root.add(inst.root);
    placeholder.update       = (t, dt) => inst.update(t, dt);
    placeholder.dispose      = () => { inst.dispose(); };
    placeholder.speak        = () => inst.speak();
    placeholder.stopSpeaking = () => inst.stopSpeaking();
    placeholder.setAnimState = (id) => inst.setAnimState(id);
  }).catch(e => console.error('[buildNpcSync] async build failed:', e));
  return placeholder;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/npc-creator/builder-anim-state.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/npc-creator/builder.ts tests/npc-creator/builder-anim-state.test.ts
git commit -m "feat(npc-creator): add setAnimState bridge to NpcInstance

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Add `toNpcDna()` role/species mapping helper to `NPCEntity.ts`

**Files:**
- Modify: `src/world/NPCEntity.ts` (add `toNpcDna()` helper + mapping tables, alongside existing imports — does NOT yet wire it into the constructor; that's Task 4)
- Test: `tests/world/NPCEntity-toNpcDna.test.ts` (new)

**Interfaces:**
- Consumes: `NPCRole` (old, 9-value, from `./NPCDnaGenerator`), `NpcRole`/`NpcDNA` (new, from `@/npc-creator/types`), `getDefaultNpcDna(species, role, seed)` (from `@/npc-creator/defaults/NpcDefaults`), `mulberry32` (from `@/core/prng`).
- Produces: `toNpcDna(col: number, row: number, settlementSeed: number, role: NPCRole): NpcDNA` — a pure function, exported for testing, consumed by Task 4's constructor rewrite.

- [ ] **Step 1: Write the failing test**

Create `tests/world/NPCEntity-toNpcDna.test.ts`:

```ts
/**
 * NPCEntity-toNpcDna.test.ts
 * Verifies the old-NPCRole → new-NpcRole/GameSpecies bridge used to build
 * new-system NpcDNA from the old NPCEntity constructor's inputs.
 */

import { describe, it, expect } from 'vitest';
import { toNpcDna } from '@/world/NPCEntity';
import type { NPCRole } from '@/world/NPCDnaGenerator';

const ALL_OLD_ROLES: NPCRole[] = [
  'merchant', 'guard', 'citizen', 'scholar', 'innkeeper',
  'blacksmith', 'quest_giver', 'settlement_elder', 'mysterious',
];

const EXPECTED_ROLE_MAP: Record<NPCRole, string> = {
  merchant:         'merchant',
  guard:            'guard',
  citizen:          'citizen',
  scholar:          'scholar',
  innkeeper:        'innkeeper',
  blacksmith:       'merchant',
  quest_giver:      'quest_giver',
  settlement_elder: 'elder',
  mysterious:       'mysterious',
};

describe('toNpcDna', () => {
  it('maps every old NPCRole to a valid new NpcRole', () => {
    for (const oldRole of ALL_OLD_ROLES) {
      const dna = toNpcDna(1, 2, 12345, oldRole);
      expect(dna.role).toBe(EXPECTED_ROLE_MAP[oldRole]);
    }
  });

  it('picks a species from the flavor-preserving replacement pool', () => {
    const validSpecies = new Set(['human', 'elf', 'vulperia', 'draconic', 'slime', 'celestial']);
    for (let col = 0; col < 20; col++) {
      const dna = toNpcDna(col, 0, 999, 'citizen');
      expect(validSpecies.has(dna.species)).toBe(true);
    }
  });

  it('same col/row/seed/role produces identical DNA (deterministic)', () => {
    const a = toNpcDna(3, 4, 555, 'merchant');
    const b = toNpcDna(3, 4, 555, 'merchant');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different col/row produces different species/color mix across a settlement', () => {
    const seen = new Set<string>();
    for (let col = 0; col < 30; col++) {
      const dna = toNpcDna(col, 7, 111, 'citizen');
      seen.add(`${dna.species}:${dna.colors.primary}`);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/NPCEntity-toNpcDna.test.ts`
Expected: FAIL — `toNpcDna` is not exported from `@/world/NPCEntity`.

- [ ] **Step 3: Add the mapping tables and `toNpcDna()` helper**

In `src/world/NPCEntity.ts`, add these imports alongside the existing ones near the top of the file:

```ts
import type { NpcRole, NpcDNA } from '@/npc-creator/types';
import type { GameSpecies }     from '@/procedural/ProceduralDNA';
import { getDefaultNpcDna }     from '@/npc-creator/defaults/NpcDefaults';
```

Then, after the existing `const ROLE_BADGE_LABEL` block (and before the `NPCEntity` class), add:

```ts
// ── Old → new visual-system bridge ────────────────────────────────────────────
//
// NPCEntity's public/external role type stays the old 9-value NPCRole (used
// by OverworldScene.ts's VILLAGE_ROLES/TOWN_ROLES/CITY_ROLES tables and all 4
// call sites) — this table maps it onto the new npc-creator NpcRole for the
// visual layer only.

const OLD_ROLE_TO_NEW_ROLE: Record<NPCRole, NpcRole> = {
  merchant:         'merchant',
  guard:            'guard',
  citizen:          'citizen',
  scholar:          'scholar',
  innkeeper:        'innkeeper',
  blacksmith:       'merchant',   // rare role — close-enough shopkeeper analog
  quest_giver:      'quest_giver',
  settlement_elder: 'elder',
  mysterious:       'mysterious',
};

// Flavor-preserving replacement for the old SUBRACES pool (human/elf/goblin/
// orc/gnome/fae) — same structure/weighting, mapped onto the new GameSpecies
// set: goblin→vulperia, orc→draconic, gnome→slime, fae→celestial.
const NPC_SPECIES_POOL: GameSpecies[] = [
  'human', 'human', 'human', 'elf', 'vulperia', 'draconic', 'slime', 'celestial',
];

/**
 * Build a new-system NpcDNA from the same seeded inputs the old npcDna()
 * used, so each NPC still looks consistent across sessions.
 */
export function toNpcDna(
  col:            number,
  row:            number,
  settlementSeed: number,
  role:           NPCRole,
): NpcDNA {
  const seed = mulberry32((col * 73856093) ^ (row * 19349663) ^ settlementSeed)();
  const rand = mulberry32(seed | 1);

  const newRole = OLD_ROLE_TO_NEW_ROLE[role] ?? 'citizen';
  const species = NPC_SPECIES_POOL[Math.floor(rand() * NPC_SPECIES_POOL.length)] ?? 'human';

  const dna = getDefaultNpcDna(species, newRole, seed);

  // Per-NPC seeded color variety within a settlement (mirrors the old
  // hue/sat/lit variety logic, overlaid on the species' base palette).
  const hue = Math.floor(rand() * 360);
  const sat = 40 + Math.floor(rand() * 40);
  const lit = 50 + Math.floor(rand() * 20);
  const primary   = hslToHex(hue, sat, lit);
  const secondary = hslToHex((hue + 40) % 360, sat - 10, lit + 10);

  return {
    ...dna,
    colors: { ...dna.colors, primary, secondary },
  };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/NPCEntity-toNpcDna.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/world/NPCEntity.ts tests/world/NPCEntity-toNpcDna.test.ts
git commit -m "feat(world): add toNpcDna old->new role/species bridge

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Wire `NPCEntity`'s constructor to build the new visual rig

**Files:**
- Modify: `src/world/NPCEntity.ts` (constructor + `_rig` field type + imports)
- Test: `tests/world/NPCEntity.test.ts` (new)

**Interfaces:**
- Consumes: `toNpcDna()` (Task 3), `buildNpcSync()` (existing, `@/npc-creator/builder`), `NpcInstance` (existing type, `@/npc-creator/builder`).
- Produces: `NPCEntity`'s `_rig` field is now typed `NpcInstance` instead of `CreatureRig`. `NPCEntity.group` (public getter, unchanged signature) now returns the new system's root group. Consumed by Task 5 (animation driving) and indirectly by all 4 existing call sites (unchanged usage).

- [ ] **Step 1: Write the failing test**

Create `tests/world/NPCEntity.test.ts`:

```ts
/**
 * NPCEntity.test.ts
 * Verifies NPCEntity builds its visual rig from the new npc-creator system
 * (not the old buildCreature/CreatureRig system) while keeping its public
 * gameplay surface (name, role, group, dispose) intact.
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { NPCEntity } from '@/world/NPCEntity';
import type { SettlementEntry } from '@/world/WorldData';

function makeSettlement(): SettlementEntry {
  // Only `seed`, `plan.name`, and `plan.type` are read by NPCEntity's
  // constructor/dialogue context — the rest of SettlementPlan's required
  // fields are irrelevant for these tests, so cast through `unknown` rather
  // than fabricating unused buildings/roads/population data.
  return {
    id:   1,
    seed: 42,
    plan: { name: 'Test Village', type: 'village', centerCol: 0, centerRow: 0 },
  } as unknown as SettlementEntry;
}

describe('NPCEntity', () => {
  it('builds a group synchronously (no await needed) and exposes name/role', () => {
    const settlement = makeSettlement();
    const npc = new NPCEntity(1, 1, 5, 5, 'citizen', settlement);
    expect(npc.group).toBeInstanceOf(THREE.Group);
    expect(npc.role).toBe('citizen');
    expect(typeof npc.name).toBe('string');
    expect(npc.name.length).toBeGreaterThan(0);
  });

  it('positions the group at the given world coordinates', () => {
    const settlement = makeSettlement();
    const npc = new NPCEntity(2, 2, 10, -6, 'merchant', settlement);
    expect(npc.group.position.x).toBeCloseTo(10);
    expect(npc.group.position.z).toBeCloseTo(-6);
  });

  it('dispose() does not throw', () => {
    const settlement = makeSettlement();
    const npc = new NPCEntity(3, 3, 0, 0, 'guard', settlement);
    expect(() => npc.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/NPCEntity.test.ts`
Expected: PASS on `group instanceof THREE.Group` and position (old system already satisfies this) — this test is a baseline safety net that must keep passing after Step 3's rewrite. Confirm it passes now, before changing anything, so you know Step 4 is a true regression check.

- [ ] **Step 3: Swap the constructor to use the new visual system**

In `src/world/NPCEntity.ts`, replace the old creature-builder imports:

```ts
import { buildCreature }     from '@/creatures/CreatureBuilder';
import type { CreatureRig }  from '@/creatures/CreatureBuilder';
import { animateCreature }   from '@/creatures/CreatureAnimator';
```

with:

```ts
import { buildNpcSync }      from '@/npc-creator/builder';
import type { NpcInstance }  from '@/npc-creator/builder';
```

Update the import of `npcDna`/`npcName` — `npcDna` is no longer used directly (replaced by `toNpcDna` added in Task 3, already in this file), so change:

```ts
import { npcDna, npcName }   from './NPCDnaGenerator';
```

to:

```ts
import { npcName }           from './NPCDnaGenerator';
```

Change the `_rig` field type:

```ts
  private readonly _rig:      NpcInstance;
```

Replace the constructor's rig-building lines:

```ts
    // Build creature rig from seeded DNA
    const dna  = npcDna(col, row, settlement.seed, role);
    this._rig  = buildCreature(dna);
```

with:

```ts
    // Build NPC rig from seeded DNA (new princess-rig-based visual system)
    const dna  = toNpcDna(col, row, settlement.seed, role);
    this._rig  = buildNpcSync(dna);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/NPCEntity.test.ts tests/world/NPCEntity-toNpcDna.test.ts`
Expected: PASS (all 3 + 4 tests)

- [ ] **Step 5: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by this task (the `_rig.snakeLoco`/`animateCreature` references in `update()` will still error at this point — that's expected and fixed in Task 5, so this step should show errors ONLY in the `update()` method of `NPCEntity.ts`, nowhere else). Confirm no unrelated file shows a new error.

- [ ] **Step 6: Commit**

```bash
git add src/world/NPCEntity.ts tests/world/NPCEntity.test.ts
git commit -m "feat(world): wire NPCEntity constructor to new npc-creator visuals

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Wire `NPCEntity.update()`'s animation driving to `setAnimState`

**Files:**
- Modify: `src/world/NPCEntity.ts` (the `update()` method's final animation block)
- Test: `tests/world/NPCEntity.test.ts` (extend with an animation-driving test)

**Interfaces:**
- Consumes: `NpcInstance.setAnimState(id: AnimId)` (Task 2).
- Produces: `NPCEntity.update()` now calls `this._rig.setAnimState('walk' | 'idle')` instead of `animateCreature()`/`snakeLoco`. No public interface change.

- [ ] **Step 1: Write the failing test**

Add to `tests/world/NPCEntity.test.ts`, inside the existing `describe('NPCEntity', ...)` block:

```ts
  it('drives walk/idle animation via setAnimState without throwing during update()', () => {
    const settlement = makeSettlement();
    const npc = new NPCEntity(4, 4, 0, 0, 'citizen', settlement);
    const playerPos = new THREE.Vector3(0, 0, 20); // far enough to avoid interact range, close enough to update
    expect(() => npc.update(0.016, playerPos, false)).not.toThrow();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/NPCEntity.test.ts`
Expected: FAIL — `update()` still calls `animateCreature(this._rig, ...)` and `this._rig.snakeLoco`, but `this._rig` is now an `NpcInstance` which has neither `snakeLoco` nor is a valid `animateCreature` argument (TypeScript compile error surfaces as a test failure).

- [ ] **Step 3: Replace the animation-driving block**

In `src/world/NPCEntity.ts`'s `update()` method, replace:

```ts
    // ── Serpent trail locomotion + creature animation ─────────────────────
    const t = performance.now() * 0.001;
    const isMoving = this._state === 'wander' && this._target !== null;
    if (this._rig.snakeLoco) {
      // Run follow-en-trail BEFORE animateCreature so sway (+=) layers on top.
      this._rig.snakeLoco.update(this._rig.root, this._rig.bones.segments ?? []);
    }
    animateCreature(this._rig, { state: isMoving ? 'walk' : 'idle', time: t });
```

with:

```ts
    // ── Walk/idle animation ────────────────────────────────────────────────
    const isMoving = this._state === 'wander' && this._target !== null;
    this._rig.setAnimState(isMoving ? 'walk' : 'idle');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/world/NPCEntity.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Full type-check + unit suite**

Run: `npx tsc --noEmit`
Expected: no errors in `src/world/NPCEntity.ts` or anywhere else.

Run: `npx vitest run`
Expected: all existing tests still pass (no regressions in unrelated suites).

- [ ] **Step 6: Commit**

```bash
git add src/world/NPCEntity.ts tests/world/NPCEntity.test.ts
git commit -m "feat(world): drive NPCEntity walk/idle animation via setAnimState

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Add a dev-only `__game` test hook for NPC visual inspection

**Files:**
- Modify: `src/main.ts` (add `getNpcSample()` to the existing dev-only `window.__game` hook, alongside `getPrincessInfo`)

**Interfaces:**
- Consumes: `overworld` (existing closure variable in `main.ts`), `NPCEntity.group`/`.role`/`.name` (existing public members).
- Produces: `window.__game.getNpcSample(): { role: string; name: string; position: {x,y,z}; hasNewVisual: boolean } | null` — used by Task 7's e2e test.

- [ ] **Step 1: Add the hook**

In `src/main.ts`, inside the existing `if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) { (window as any).__game = { ... } }` block, add a new entry alongside `getPrincessInfo`:

```ts
      /** First settlement NPC's visual/gameplay info (null if none spawned). For tests. */
      getNpcSample: () => {
        const npc = (overworld as any)?._npcs?.[0];
        if (!npc) return null;
        const root = npc.group as THREE.Group;
        // buildNpcSync wraps the real geometry as a child once the async
        // princess build resolves — a populated child means the new visual
        // system successfully built (not just showing the empty placeholder).
        const hasNewVisual = root.children.length > 0;
        const pos = root.position;
        return {
          role: npc.role as string,
          name: npc.name as string,
          position: { x: +pos.x.toFixed(3), y: +pos.y.toFixed(3), z: +pos.z.toFixed(3) },
          hasNewVisual,
        };
      },
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (the `(overworld as any)` cast avoids needing to expose `_npcs` as a typed public API — acceptable for a dev/test-only hook).

- [ ] **Step 3: Manual smoke check**

Run: `npm run dev` (leave running in the background), then in a browser at the dev URL, open the console and run:

```js
window.__game.startGame(0xDEADBEEF);
// wait a couple seconds for the game to boot, then:
window.__game.switchToExterior();
// wait a couple seconds for the overworld + settlements to spawn, then:
window.__game.getNpcSample();
```

Expected: returns an object like `{ role: 'citizen', name: 'Aldric', position: {...}, hasNewVisual: true }` (not `null`, and `hasNewVisual` eventually becomes `true` after the async princess build resolves — may show `false` on the very first call if checked too quickly after `switchToExterior()`).

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "test(dev-hook): add getNpcSample for e2e NPC visual verification

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: End-to-end verification that settlement NPCs render with the new visuals and still support dialogue/quests

**Files:**
- Create: `tests/e2e/npc-visual-migration.spec.ts`

**Interfaces:**
- Consumes: `window.__game.startGame`, `.switchToExterior`, `.teleportPlayer`, `.getNpcSample` (existing + Task 6), the `#npc-dialogue` DOM element (existing, from `NPCEntity.ts`'s `_showDialogue`).
- Produces: nothing consumed by later tasks — this is the final verification task.

- [ ] **Step 1: Write the e2e test**

Create `tests/e2e/npc-visual-migration.spec.ts`:

```ts
/**
 * npc-visual-migration.spec.ts
 *
 * Verifies overworld settlement NPCs render with the new princess-rig-based
 * visual system (not the old creature system) and that interacting with one
 * still opens the dialogue panel — i.e. the visual migration didn't break
 * existing NPC gameplay.
 *
 * Run: npx playwright test tests/e2e/npc-visual-migration.spec.ts --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './helpers';

test.use({ actionTimeout: 60_000 });

function attachLogs(page: Page) {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  return logs;
}

async function startGameQuick(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__game.quickPlayPrincess({ name: 'Tester', species: 'foxling' }));
  await page.waitForFunction(() => (window as any).__gameStarted === true, { timeout: 60_000 });
  await page.waitForTimeout(1000);
}

test('settlement NPCs render with new npc-creator visuals and remain interactable', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);
  await startGameQuick(page);

  // Enter the overworld (spawns settlements + NPCs via _spawnSettlementNPCs)
  await page.evaluate(() => (window as any).__game.switchToExterior());
  await page.waitForFunction(() => (window as any).__game.getGameMode() === 'exterior', { timeout: 20_000 });

  // Wait for at least one NPC to exist and its async new-system visual to resolve
  const sample = await page.waitForFunction(() => {
    const s = (window as any).__game.getNpcSample?.();
    return s && s.hasNewVisual ? s : null;
  }, { timeout: 20_000 }).then(h => h.jsonValue()) as {
    role: string; name: string; position: { x: number; y: number; z: number }; hasNewVisual: boolean;
  };

  console.log(`[test] NPC sample: ${JSON.stringify(sample)}`);
  expect(sample).toBeTruthy();
  expect(sample.hasNewVisual).toBe(true);
  expect(typeof sample.name).toBe('string');
  expect(sample.name.length).toBeGreaterThan(0);

  // Teleport player next to the sampled NPC and interact
  await page.evaluate((pos) => {
    (window as any).__game.teleportPlayer(pos.x + 1, pos.y + 1.5, pos.z);
  }, sample.position);
  await page.waitForTimeout(500);

  await page.keyboard.press('KeyE');
  await page.waitForTimeout(500);

  const dialogueVisible = await page.locator('#npc-dialogue').isVisible().catch(() => false);
  console.log(`[test] dialogue panel visible after [E]: ${dialogueVisible}`);

  const errorLogs = logs.filter(l => l.includes('pageerror') || l.toLowerCase().includes('error'));
  if (errorLogs.length > 0) {
    console.log('[test] console errors during NPC interaction:');
    errorLogs.forEach(l => console.log(' ', l));
  }
  expect(errorLogs.length).toBe(0);
  expect(dialogueVisible).toBe(true);
});
```

- [ ] **Step 2: Run the dev server**

Run (in a background/async shell): `npm run dev`
Expected: server starts, prints a local URL (e.g. `http://localhost:5174`).

- [ ] **Step 3: Run the e2e test**

Run: `npx playwright test tests/e2e/npc-visual-migration.spec.ts --reporter=list`
Expected: PASS — 1 test passed. If `hasNewVisual` never becomes `true` within the timeout, re-check Task 4/Task 6 wiring (the async `buildNpc()` import inside `buildNpcSync()` may be failing — check the `[buildNpcSync] async build failed` console log captured by `attachLogs`).

- [ ] **Step 4: Stop the dev server**

Stop the background dev server process started in Step 2.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/npc-visual-migration.spec.ts
git commit -m "test(e2e): verify settlement NPCs use new visuals and stay interactable

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Post-plan cleanup note (not a task — informational only)

After this plan lands, `src/world/NPCDnaGenerator.ts`'s `npcDna()` function (the old `CreatureDNA` builder) becomes unused dead code — only `npcName()` and the `NPCRole` type from that file remain in use (both still consumed by `NPCEntity.ts`). Removing `npcDna()` and its `ROLE_PROFILES`/`SUBRACES` tables is a small, separate, optional follow-up cleanup — out of scope for this plan (per the spec's YAGNI framing), but worth flagging to the user once this plan is merged.
