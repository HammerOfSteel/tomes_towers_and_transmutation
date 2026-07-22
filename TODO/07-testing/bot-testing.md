# Bot Testing System
> Automated game-playing bot built on Playwright + `window.__game` debug API.
> Can be watched (headed) or run headless in CI.

## Architecture
```
tests/bot/
  GameBot.ts          ← core: wraps Page, all game actions
  BotLauncher.ts      ← CLI: headed/headless, scenario selection
  BotReporter.ts      ← screenshot + HTML report
  actions/
    MenuActions.ts    ← main menu, char creation, pause
    MovementActions.ts← teleport, WASD, room nav
    CreativeActions.ts← creative mode: inventory, place, verify
    QuestActions.ts   ← dialogue, quest accept/complete
    CombatActions.ts  ← attack, spell, enemy checks
  scenarios/
    creative-smoke.ts ← B2
    new-game-flow.ts  ← B3
    overworld.ts      ← B4
    quest-chain.ts    ← B5
```

## Run Commands
```bash
npm run dev -- --port 5174
npx ts-node tests/bot/BotLauncher.ts --scenario creative-smoke --headed --slow-mo 400
npx ts-node tests/bot/BotLauncher.ts --scenario new-game-flow --headed --slow-mo 300
npx ts-node tests/bot/BotLauncher.ts --scenario overworld --headed
npx ts-node tests/bot/BotLauncher.ts --scenario quest-chain --headed
```

## Status by Phase

| Phase | Scope | Status |
|---|---|---|
| B1 Core Infrastructure | GameBot, BotLauncher, BotReporter, `__game` APIs | ✅ |
| B2 Creative Mode | Enter creative, browse assets, place, exit | ✅ |
| B3 New Game Flow | Menu → char creation → tower → basement | ✅ |
| B4 Overworld & Dungeon | Exit tower → walk → dungeon enter → navigate | ✅ |
| B5 Quest Testing | Interact NPC → quest log → first objective | ✅ |
| B6 CI Mode | Headless, video record, HTML report | ✅ |

## 🔲 Remaining

### New Species Bot Scenario (NS8)
- [ ] `scenarios/princess-creator.ts`:
  - Open princess library → select "Maribel" (foxling default) → start game
  - Verify foxling princess model spawns (height ≈ 1.6 WU)
  - Walk to floor 1 → verify staircase toast is foxling-flavoured
  - Screenshot + close
- [ ] Register `princess-creator` scenario in `BotLauncher.ts`
- [ ] Register `princess-creator` scenario in `BotReporter.ts`

### CI Integration
- [ ] GitHub Actions: run `npx ts-node tests/bot/BotLauncher.ts --headless --all-scenarios` on PR
- [ ] Bot reports saved as CI artifacts
- [ ] Document in `TESTING_AND_TOOLS.md`

### Quest Chain Expansion
- [ ] Extend `quest-chain.ts`: complete full Act I arc for 1 species (not just first objective)
- [ ] Verify quest journal state at each beat
- [ ] Screenshot Solmor Stage 1 encounter

## Notes
- Bot uses `window.__game` APIs — any new game API needed for testing should be added there
- Bot scenarios run against `localhost:5174` (separate from Playwright at 5173)
- `--slow-mo` makes bot watchable; default CI runs at full speed
