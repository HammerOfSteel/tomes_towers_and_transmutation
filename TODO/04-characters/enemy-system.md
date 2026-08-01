# Enemy System (Phase B)
> Full procedural enemy roster, AI, encounter design. All enemies use `buildEnemy(dna)` — no GLBs.

## Status: 🚧 Architecture done, full roster + boss AI remaining

## ✅ Done
- `EnemyDNA` type + `buildEnemy(dna)` builder
- `EnemyDefaults.ts` — defaults per floor tier + boss defaults
- `EnemyLoader.ts` — falls back to procedural rig for all IDs
- `PatrolBehavior.ts` — Tier-1 patrol/chase FSM + `StationaryShootBehavior`
- `TacticalBrute` — Tier-2 melee + special ability
- `AggroSystem.ts` — broadcast detection, rate-limited
- Enemy rig animation driven by FSM state
- Spawn pooling (max 30 live enemies)
- 21 unit tests (AI FSMs + AggroSystem)

## 🔲 Remaining

### B1 — Roster DNA (all 20 enemy types)
- [ ] Define `EnemyDNA` for each enemy in B2 table (Bone Warrior, Stone Golem, Drake Whelp, etc.)
- [ ] Add to `EnemyDefaults.ts` per floor tier
- [ ] Visual pass: each enemy visually distinct (size, silhouette, colour)

### B4 — Elite/Boss AI
- [ ] Drake Whelp (Floor 9 boss): 3-phase behaviour tree — fire cone → charge → minion summon
- [ ] Spectral Knight (Floor 8-9): phase ability + spell reflect
- [ ] Fae Wraith: charm debuff + teleport AI
- [ ] Vampire Skulk: life-steal mist-form combo

### B3 Playwright Test
- [ ] Enter ambush room → all enemies spawn → kill all → chest appears → loot

### DNA Entries Needed
| Enemy | Floor | Done? |
|---|---|---|
| Bone Warrior | 1-2 | 🔲 |
| Bone Archer | 1-3 | 🔲 |
| Imp Skulk | 2-4 | 🔲 |
| Stone Golem | 4-6 | 🔲 |
| Gargoyle | 5-7 | 🔲 |
| Shadow Caster | 5-8 | 🔲 |
| Fae Wraith | 7-8 | 🔲 |
| Vampire Skulk | 8-9 | 🔲 |
| Drake Whelp (boss) | 9 | 🔲 |
| Forest Scout | Overworld | 🔲 |
| Troll | Overworld | 🔲 |
| Bog Wraith | Overworld | 🔲 |

> Full roster + AI detail: `DEMO_RELEASE_TODO.md` Phase B
