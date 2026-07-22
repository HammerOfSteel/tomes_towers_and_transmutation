# 03 — Procedural Pipeline
> Every builder (NPC, Enemy, Building, Prop, Creature) serves two consumers: game runtime + designer UI.
> **Core principle:** `build*(dna)` function is shared between the atelier tool and the world generator.

## Status by sub-task

| File | Scope | Status |
|---|---|---|
| [PROC-A Entity Registry](./PROC-A-entity-registry.md) | Central registry + base DNA | ✅ Done |
| [PROC-B Creator Tools](./PROC-B-creator-tools.md) | Atelier tools + runtime APIs | 🚧 In progress |
| [PROC-C World Generation](./PROC-C-world-generation.md) | Seeded world placement plan | 🔲 |
| [PROC-D Creative Mode](./PROC-D-creative-mode.md) | DevLab integration | 🔲 |
| [PROC-E Asset Retirement](./PROC-E-asset-retirement.md) | Remove all GLB load paths | 🔲 |
| [Environment Art System](./environment-art-system.md) | Phase 5: code-first vs Kenney toggle | 🔲 |

## Execution Order
```
PROC-A ✅ → PROC-B (builders) → PROC-C (use builders in world gen) → PROC-D (expose in DevLab) → PROC-E (retire old paths)
```
