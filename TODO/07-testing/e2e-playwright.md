# E2E Playwright (Phase F3)
> Automated playtest scenarios against `vite preview`.

## Status: 🚧 7 specs passing, 5 remaining

## ✅ Passing
- `startup.spec.ts` (7 tests)
- `campfire-intro.spec.ts` (8 tests, full branches pending)
- `tower-prologue.spec.ts` (7 tests)
- `dungeon-room.spec.ts` (7 tests)
- `talent-tree.spec.ts` (7 tests)
- `quest-journal.spec.ts` (6 tests)
- `save-load.spec.ts` (5 tests)

## 🔲 Remaining
- [ ] `house-interior.spec.ts` — walk in, interior renders, walk out
- [ ] `ambush-room.spec.ts` — enemies spawn → kill → chest → loot
- [ ] `campfire-full-branches.spec.ts` — all 4 species × 4 branches
- [ ] `talent-tree-spend.spec.ts` — spend points, verify passives
- [ ] `keybind-persist.spec.ts` — rebind, reload, verify
- [ ] CI GitHub Actions setup
