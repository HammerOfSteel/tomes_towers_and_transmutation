# Bot V1 — Automated Game Player
> An autonomous test bot that **plays** the game in a visible browser window,
> navigates menus, enters creative mode, tests features, and reports results
> with screenshots. Built on Playwright + the existing `window.__game` debug API.

---

## Why

Manual testing every session is slow and error-prone.
The bot gives us a repeatable, watchable player that can validate creative mode,
quest flows, combat, NPC dialogue, and world navigation — either attended
(watched) or unattended (CI).

---

## Architecture

```
tests/bot/
  GameBot.ts          ← Core class: wraps Playwright Page, all game actions
  BotLauncher.ts      ← CLI entry: headed/headless, scenario selection
  BotReporter.ts      ← Screenshot + pass/fail HTML report
  actions/
    MenuActions.ts    ← Main menu, character creation, pause menu
    MovementActions.ts← Teleport, WASD, room navigation
    CreativeActions.ts← Creative mode: inventory, place, destroy
    QuestActions.ts   ← Dialogue, quest accept/complete
    CombatActions.ts  ← Attack, spell, enemy checks
  scenarios/
    creative-smoke.ts ← B2: enter creative, browse assets, place object
    new-game-flow.ts  ← B3: full new game → tower → basement key
    overworld.ts      ← B4: exit tower → overworld walk → dungeon
    quest-chain.ts    ← B5: main quest line completion
```

---

## Phase B1 — Core Infrastructure ⬜

- [x] `GameBot.ts` — core class
  - `launch(headed?)` — opens Chromium, navigates to `localhost:5174`
  - `waitForGame()` — waits for `window.__game` and canvas
  - `enableDevMode()` — sets `ttt_dev_mode=true` in localStorage, reloads
  - `startNewGame(cfg?)` — calls `window.__game.startGame(seed)` + waits for HUD
  - `screenshot(name)` — saves to `tests/bot/screenshots/<timestamp>-<name>.png`
  - `evaluate<T>(fn)` — thin wrapper over `page.evaluate()`
  - `close()` — cleanup
- [x] `BotLauncher.ts` — CLI runner
  - `npx ts-node tests/bot/BotLauncher.ts --scenario creative-smoke --headed`
  - `--headed` / `--headless`
  - `--port 5174`
  - `--slow-mo 200` (ms between actions, for watching)
  - `--record` (save video)
- [x] `BotReporter.ts` — results
  - Pass/fail per step with screenshot
  - Print summary to terminal
  - Save `tests/bot/reports/<timestamp>.html`
- [x] Add `window.__game.enterCreativeMode()` to `src/main.ts`
- [x] Add `window.__game.exitCreativeMode()` to `src/main.ts`
- [x] Add `window.__game.getCurrentFloor()` → floor index
- [x] Add `window.__game.getCurrentRoom()` → room id
- [x] **Test:** `npx ts-node tests/bot/BotLauncher.ts --scenario b1-smoke --headed`
  launches game, detects main menu, takes screenshot, closes.

---

## Phase B2 — Creative Mode Bot ⬜

Depends on: B1

- [x] `CreativeActions.ts`
  - `enterCreative()` — enables dev mode, starts game, enters creative via pause menu
  - `openInventory()` — presses `C`, waits for `#cab-root`
  - `selectKit(kitId)` — clicks kit button in sidebar
  - `pickAsset(namePart)` — clicks first asset card matching name fragment
  - `placeAsset()` — right-clicks on canvas to place held asset
  - `verifyPlacedCount(n)` — asserts bot's placement count
  - `closeInventory()` — presses `C` again
- [x] `scenarios/creative-smoke.ts`
  - Step 1: Launch → enable dev → start game → screenshot "game-loaded"
  - Step 2: Open pause (Esc) → click Creative Mode → screenshot "creative-active"
  - Step 3: Verify creative HUD visible (status bar, hotbar)
  - Step 4: Press C → inventory opens → screenshot "inventory-open"
  - Step 5: Click "KayKit" group → see kit list
  - Step 6: Click "Dungeon Pack" → verify assets appear (not "No assets")
  - Step 7: Click first asset card → screenshot "asset-picked"
  - Step 8: Right-click canvas → screenshot "asset-placed"
  - Step 9: Verify placed count > 0
  - Step 10: Close inventory, exit creative → screenshot "creative-exited"
- [x] **Run:** `npx ts-node tests/bot/BotLauncher.ts --scenario creative-smoke --headed --slow-mo 400`

---

## Phase B3 — Full New Game Flow ⬜

Depends on: B2

- [x] `MenuActions.ts`
  - `clickNewGame()` — clicks New Game on main menu
  - `selectCharacter(id)` — picks character in creation screen
  - `confirmCharacter()` — clicks play/confirm
  - `openPauseMenu()` — presses Escape
  - `resumeGame()` — clicks Resume in pause menu
- [x] `MovementActions.ts`
  - `teleportToFloor(n)` — `__game.onTeleportRoom('tower_floor_X_chamber')`
  - `teleportToRoom(id)` — direct room load
  - `walkDirection(dir, ms)` — holds WASD key for duration (keyboard events)
  - `waitForRoomChange()` — waits for room ID to change
- [x] `scenarios/new-game-flow.ts`
  - Full run: main menu → character creation → game start → tower F0 → basement
    → pick up key → exit tower → screenshot each step
- [x] **Run:** `--scenario new-game-flow --headed --slow-mo 300`

---

## Phase B4 — Overworld & Dungeon ⬜

Depends on: B3

- [x] `scenarios/overworld.ts`
  - Exit tower → load overworld scene → walk to dungeon entrance → enter dungeon
- [x] Dungeon: navigate corridor → find room → screenshot
- [x] Settlement: walk to village → find NPC → trigger dialogue

---

## Phase B5 — Quest Testing ⬜

Depends on: B3

- [x] `QuestActions.ts`
  - `interactWithObject()` — presses E near an interactable
  - `advanceDialogue()` — presses E to continue NPC lines
  - `checkQuestLog()` — opens quest log, reads active quests
  - `assertQuestActive(id)` — checks quest is in active list
- [x] `scenarios/quest-chain.ts`
  - Start game → get quest from board → complete first objective → screenshot
- [x] **Run:** `--scenario quest-chain --headed`

---

## Phase B6 — CI Mode & Reporting ⬜

Depends on: B1–B5

- [x] `--headless` mode (no visible window, for CI)
- [x] `--record` saves video of full run to `tests/bot/videos/`
- [x] HTML report with all screenshots, pass/fail steps, timing

---

## Quick-Start (after B1)

```bash
# Start game server
npm run dev -- --port 5174

# Run creative smoke test in headed mode (watch it play)
npx ts-node tests/bot/BotLauncher.ts --scenario creative-smoke --headed --slow-mo 500

# Run headless for CI
npx ts-node tests/bot/BotLauncher.ts --scenario creative-smoke
```

---

## Notes

- Bot uses the existing `window.__game` debug API — no game code changes
  beyond adding `enterCreativeMode()` / `exitCreativeMode()`.
- `--slow-mo 400` makes it watchable. `--slow-mo 0` makes it fast for CI.
- `--record` saves `.webm` video alongside screenshots.
- All scenarios are independent — they all call `launch()` + `close()`.
- Bot respects `import.meta.env.DEV` guards — will not work on prod builds.

---

## Phase B7 — Quest Flow Testing ⬜

Depends on: B3 (new game flow)

- [x] `QuestActions.ts` (full implementation)
  - `interactWith(selector)` — press E near an interactable
  - `advanceDialogue(times)` — press E N times to advance NPC dialogue
  - `openQuestLog()` — keyboard shortcut to show quest log
  - `assertQuestActive(id)` — checks quest appears in active list
  - `assertQuestComplete(id)` — checks quest marked done
  - `collectItem(itemName)` — walk over / interact with item drop
- [x] `scenarios/quest-chain.ts` — runs the main story quest:
  - Load game → teleport to F0 → find quest board → interact → accept first quest
  - Teleport to basement → find key → pick it up
  - Teleport back to F0 → use key on exit door → screenshot "exited tower"
  - Verify quest marked complete
- [x] **Run:** `npm run bot -- --scenario quest-chain --headed --slow-mo 300`

---

## Phase B8 — Smart Pathfinding Bot ⬜
> *The bot can navigate the world without hardcoded teleport calls.*

- [x] `PathfindingActions.ts`
  - `walkToRoom(roomId)` — loads target room, player walks to centre
  - `findAndApproach(selector)` — raycasts to find an interactable by type, walks toward it
  - `findNPC(npcName)` — scans the scene for an NPC by name, walks to trigger range
  - `findEnemy(enemyType)` — locates the nearest enemy of given type
  - `evadeEnemies()` — runs away from all detected enemies
- [x] `scenarios/explore-floor.ts` — visits every room on a tower floor:
  - Start at F0 → find staircase → go down to basement → explore all side rooms → screenshot each
- [x] `scenarios/find-quest-npc.ts` — given a quest NPC name, navigate to them:
  - Input: NPC name → bot finds them on current floor or teleports to their known floor → approaches → triggers dialogue

---

## Phase B9 — Bot as Creative Mode Operator ⬜
> *The bot can operate creative mode autonomously — build things, design spaces.*

- [x] `scenarios/bot-place-forest.ts` — bot enters creative, selects nature assets, places a forest cluster in the overworld:
  - Enter creative → teleport overworld → open inventory → select "Forest Nature Pack"
  - Place 12 trees and 6 rocks in a clustered pattern
  - Save → exit → screenshot
- [x] `scenarios/bot-design-dungeon-room.ts` — bot designs a dungeon room:
  - Enter creative → enter Dungeon Prototype backroom
  - Place walls, torches, a chest, and an enemy spawn marker
  - Export as scenario JSON
- [x] `scenarios/bot-redesign-tower-floor.ts` — bot opens tower editor, loads F3, places barrels and candelabras:
  - Enter creative → Tower sub-editor → Load from Game → select F3
  - Place KayKit barrel assets along the walls
  - Save → screenshot with placed objects visible
- [x] Natural language instruction interface:
  ```
  bot.instruct("go to floor 3 and place a barrel next to each wall")
  bot.instruct("enter creative and add a small forest near the tower exit")
  bot.instruct("find the quest board NPC and trigger their dialogue")
  ```
  - Instructions parsed into action sequences via pattern matching
  - Phase 1: fixed vocabulary (go to / place / find / trigger / open / close) ✓
  - Phase 2: LLM-powered parsing for freeform natural language

---

## Phase B10 — CI Integration & Regression Suite ⬜

- [x] `--headless` fully working (no visible window)
- [x] `--record` saves `.webm` to `tests/bot/videos/`
- [x] HTML report written to `tests/bot/reports/` after every run
  - [x] Triggers on push to main (`.github/workflows/bot-ci.yml`)
  - [x] Starts Vite dev server
  - [x] Runs `creative-smoke` in headless mode
  - [x] Uploads screenshots as artefacts on failure
- [x] Nightly full run: `new-game-flow` + `quest-chain` + `explore-floor` (`.github/workflows/bot-nightly.yml`)
- [x] Regression: any scenario from any previous run can be replayed exactly (fixed seed, deterministic)
- [x] Diff screenshots: compare current run against baseline, flag visual regressions (`tests/bot/screenshotDiff.mjs`)
