# NPC Visual Migration Design

**Date:** 2026-07-28
**Status:** Approved, ready for implementation plan

## Problem

Overworld NPCs (`src/world/NPCEntity.ts`) are still visually built with the old,
outdated procedural creature system (`buildCreature()` / `CreatureRig` from the
creature-builder pipeline used by the player character before it was replaced).
Meanwhile, a newer, much nicer NPC visual system already exists and is fully
built — the npc-creator module (`buildNpc()` / `NpcInstance` in
`src/npc-creator/builder.ts`), which delegates to the Princess Creator's
procedural rig (`buildPrincess()`), complete with real walk/run/idle animation
clips — but it is not wired into any live gameplay path. A separate prototype
(`src/world/NPCSpawner.ts` / `SettlementPopulator.ts`) builds the new visuals
but has zero gameplay behavior (no FSM, dialogue, or quests) and is unused.

Goal: make live overworld NPCs use the new, nicer visual system, without
touching the gameplay behavior (FSM, dialogue, quests, merchant/innkeeper
hooks) that already works well in `NPCEntity`.

## Approach

**Minimal internal swap.** All changes are confined to `NPCEntity.ts`'s
internals, plus small additive changes to the npc-creator module (a new role,
a new public animation-state method). No call sites change. No new
abstraction layers are introduced (rejected a "shared CommonerBuilder" wrapper
and a "full NPCEntity rewrite" as unnecessary scope/risk for what is otherwise
a working system — see alternatives considered below).

### Alternatives considered

- **Shared `CommonerNpcBuilder` abstraction** — same swap, but extracted into
  a new reusable module so the unused `NPCSpawner.ts` prototype could share it
  too. Rejected: no second consumer exists today: YAGNI.
- **Full `NPCEntity` rewrite** around the new system's idioms. Rejected: far
  riskier/larger diff for gameplay logic (FSM, dialogue, quests) that already
  works correctly and isn't related to the visual problem being solved.

## Architecture

All 4 live construction sites of `NPCEntity` in `src/scene/OverworldScene.ts`
(the settlement NPC spawner, plus 3 one-off encounter NPCs — vulperia bounty
hunter, undead wandering scholar, mysterious ruins NPC) construct `NPCEntity`
with the same signature and are unaffected by this change.

### Construction

`NPCEntity`'s constructor swaps:
```
buildCreature(npcDna(col, row, seed, role))   // old
→
buildNpcSync(toNpcDna(col, row, seed, role))  // new
```
`buildNpcSync` (already implemented in `src/npc-creator/builder.ts`) returns
an `NpcInstance` synchronously — a lightweight placeholder `THREE.Group` is
shown immediately, then hot-swapped for the real `buildPrincess()`-built
geometry once the internal `await import('@/princess-creator/factory')`
resolves. The dynamic import is module-cached, so the first NPC in a
settlement pays the one-time async cost and every subsequent NPC builds
near-instantly. `NPCEntity`'s constructor therefore stays fully synchronous —
no call-site changes are needed.

### Data mapping — `toNpcDna()`

A new private helper in `NPCEntity.ts`, `toNpcDna(col, row, seed, role)`,
replaces `npcDna()` from `NPCDnaGenerator.ts`. It:

1. Maps the old `NPCRole` (9 values) to the new `NpcRole` (now 8 values, see
   below) via a static lookup table.
2. Picks a `GameSpecies` using the same seeded PRNG the old code used for
   subrace selection, from a flavor-preserving replacement pool (see below).
3. Calls `getDefaultNpcDna(species, role)` and overlays the existing seeded
   hue/saturation/lightness color-variety logic on top, so per-NPC color
   variety within a settlement is preserved exactly as before.

Name generation is unchanged — `npcName(seed)` (from `NPCDnaGenerator.ts`)
stays in use. NPCs are procedurally regenerated each session load (not
persisted by name in save data), so there is no compatibility concern, and no
benefit to switching naming conventions mid-migration.

### Role mapping table

| Old `NPCRole` (NPCDnaGenerator.ts) | New `NpcRole` (npc-creator/types.ts) |
|---|---|
| `merchant` | `merchant` |
| `guard` | `guard` |
| `citizen` | `citizen` *(new role, added this pass)* |
| `scholar` | `scholar` |
| `innkeeper` | `innkeeper` |
| `blacksmith` | `merchant` *(rare role — 1 per town/city — close-enough shopkeeper analog)* |
| `quest_giver` | `quest_giver` |
| `settlement_elder` | `elder` |
| `mysterious` | `mysterious` |

The old 9-value `NPCRole` type remains the external-facing type used by
`OverworldScene.ts`'s call sites (`VILLAGE_ROLES`/`TOWN_ROLES`/`CITY_ROLES`
tables) — no changes needed there. The mapping happens only inside
`toNpcDna()`.

### Species mapping pool

The old subrace pool (`SUBRACES` in `NPCDnaGenerator.ts`) was a flat weighted
array with no settlement-faction awareness (settlements today are always
human-tier-styled architecturally — `settlementTypeToFaction()` only varies
by village/town/city, not by fantasy race — so there is no existing
faction-to-NPC-species concept to preserve or extend). The replacement pool
mirrors the old structure and weighting 1:1, with a flavor-preserving mapping
for subraces that have no direct equivalent in the new `GameSpecies` set:

| Old subrace | New species | Rationale |
|---|---|---|
| `human` (×3 weight) | `human` (×3 weight) | direct match |
| `elf` | `elf` | direct match |
| `goblin` | `vulperia` | small/mischievous humanoid analog |
| `orc` | `draconic` | bigger/tougher humanoid analog |
| `gnome` | `slime` | small/quirky analog |
| `fae` | `celestial` | ethereal/magical analog |

Resulting pool: `['human','human','human','elf','vulperia','draconic','slime','celestial']`.

### Animation bridging

`NpcInstance` (`src/npc-creator/builder.ts`) currently only exposes
`speak()`/`stopSpeaking()`. It gains a new public method,
`setAnimState(id: AnimId)`, mirroring the already-established
`EnemyInstance.setAnimState` pattern in `src/enemy-creator/builder.ts` — both
bridge to the underlying princess rig's `setState()` call.

`NPCEntity.update()`'s existing wander/idle FSM branch (currently calling
`animateCreature(this._rig, { state, time })`) instead calls
`this._rig.setAnimState('walk')` or `this._rig.setAnimState('idle')` based on
the same FSM state it already tracks — no FSM logic changes. The
`snakeLoco?.update(...)` trail-locomotion branch (used for serpent-archetype
creatures in the old system) is removed, since no NPC species in the new
system maps to a serpent archetype.

### New `citizen` role

Since `citizen` is the plurality role across all settlement sizes (2-3 per
settlement in `VILLAGE_ROLES`/`TOWN_ROLES`/`CITY_ROLES`), it gets a proper
dedicated role in the npc-creator system rather than being mapped onto an
existing role:

- `NpcRole` (`src/npc-creator/types.ts`): add `'citizen'`.
- `ROLE_HAND_R` (`src/npc-creator/builder.ts`): add `citizen: 'none'` (no hand
  prop).
- `ROLE_PERSONALITY` / defaults (`src/npc-creator/defaults/NpcDefaults.ts`):
  add a `citizen` entry — a plain, prop-free commoner look/personality mix,
  distinct from the `mysterious` staff-prop "???" look.

### Explicitly out of scope / untouched

- `src/world/NPCSpawner.ts` and `SettlementPopulator.ts` — the unused
  prototype spawner remain as dead code. No gameplay behavior exists there
  today; repurposing or removing it is a separate concern from this
  visual-migration goal.
- Dialogue panel, quest-giving (`onQuestGiven`), merchant/innkeeper shop hooks
  (`onOpenMerchant`), the `[E]` interact label, and distance-based update
  culling in `NPCEntity` — all unchanged.
- All 4 call sites in `OverworldScene.ts` — unchanged signatures.

## Error handling

- `buildNpcSync` already handles its own async-build failure/timing internally
  (keeps the placeholder group visible if the async build hasn't resolved
  yet) — no new error handling needed there.
- `toNpcDna()` is a pure, synchronous function with no failure modes: role and
  species lookups use `??` fallbacks (`'citizen'` for an unmapped role,
  `'human'` for an unmapped species) so a bad/unexpected input can never
  throw — it just degrades to a plain commoner look.

## Testing

- **e2e:** extend the existing Playwright pattern (used for the prior
  building-interiors work) with a scenario that loads the overworld, walks
  into a settlement, and confirms: new-system NPC geometry renders with no
  console errors, and interacting with an NPC still opens the dialogue panel
  and triggers quest-giving on a `quest_giver` NPC.
- **Unit:** a test for `toNpcDna()` covering (a) all 9 old roles map to a
  valid new `NpcRole`, and (b) species-pool selection is deterministic for a
  given seed (same seed → same species every time).
- No changes needed to existing `NPCEntity` FSM/dialogue/quest unit tests,
  since none of that logic is touched by this migration.
