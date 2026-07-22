# Testing (Phase F)
> Unit tests, smoke tests, E2E Playwright. Target: fully green suite before polish phase.

## Status: 🚧 Core tests passing, several gaps remain

## Current State
- 182+ unit/smoke tests passing
- 7 Playwright E2E specs passing
- 4 pre-existing failures (TowerGenerator .ts/.js — tracked, not blocking)

## 🔲 Remaining

### F1 — Unit Tests
- [ ] `HouseBuilder.test.ts` — all 3 archetypes build without errors (blocked on HouseBuilder.ts)
- [ ] Extend `storyRunner.test.ts` for Elf/Celestial/Draconic arcs (NS7)
- [ ] Extend `abilitySystem.test.ts` for 3 new species (NS7)
- [ ] `speciesMapping.test.ts` — all 21 princess species map cleanly
- [ ] `realmToTerrain.test.ts` — same seed → same terrain (02-game-world-integration)

### F3 — Playwright E2E
- [ ] `house-interior.spec.ts` — walk into settlement house, interior renders, walk out
- [ ] `ambush-room.spec.ts` — enter room → enemies spawn → kill all → chest → loot
- [ ] `campfire-full-branches.spec.ts` — all 4 species × 4 choice branches
- [ ] `talent-tree-spend.spec.ts` — spend 3 points, close, verify passive bonuses
- [ ] `keybind-persist.spec.ts` — rebind key, reload session, verify persistence

### CI Setup
- [ ] GitHub Actions workflow: `npm run build && npx playwright test` on PR
- [ ] Test results saved as artifacts
- [ ] Document in `TESTING_AND_TOOLS.md`

> Full test list: `DEMO_RELEASE_TODO.md` Phase F
