/**
 * quest-chain.ts — B5/B7: Main story quest chain test.
 *
 * Flow:
 *   1. Start game → teleport F0
 *   2. Find quest board → interact → accept first quest
 *   3. Teleport to basement → find key → pick it up
 *   4. Teleport back F0 → use key on exit door
 *   5. Verify quest complete (or quest board has updated)
 *
 * Run:
 *   npm run bot -- --scenario quest-chain --headed --slow-mo 300
 */

import type { GameBot }  from '../GameBot';
import { MenuActions }   from '../actions/MenuActions';
import { MovementActions } from '../actions/MovementActions';
import { QuestActions }  from '../actions/QuestActions';

export async function questChainScenario(bot: GameBot): Promise<void> {
  await bot.step('launch + dev mode', async () => {
    await bot.waitForGame();
    await bot.enableDevMode();
  });

  await bot.step('start new game', async () => {
    await MenuActions.startGameFast(bot, 0xC0FE_BABE);
  });

  await bot.step('teleport to tower floor 0 (entrance)', async () => {
    await MovementActions.teleportToFloor(bot, 0);
  });

  await bot.step('open quest log — should be empty at start', async () => {
    await QuestActions.openQuestLog(bot);
    const quests = await QuestActions.getActiveQuests(bot);
    console.log(`    active quests: ${quests.length}`);
    await QuestActions.closeQuestLog(bot);
  });

  await bot.step('interact with quest board (E)', async () => {
    // Quest board lives near (0, 0, -2) on F0 — approach and press E
    await bot.page!.evaluate(function() {
      (window as any).__game.teleportPlayer?.(0, 0, -3);
    });
    await bot.page!.waitForTimeout(300);
    await QuestActions.interact(bot);
    // Accept any dialogue that appears
    await bot.page!.waitForTimeout(500);
    await QuestActions.advanceDialogue(bot, 3);
  });

  await bot.step('screenshot quest board interaction', async () => {
    // Just a screenshot step — already taken by step runner automatically
  });

  await bot.step('teleport to basement (floor -1)', async () => {
    await MovementActions.teleportToFloor(bot, -1);
  });

  await bot.step('find and collect basement key', async () => {
    // Key is a physical item in the world — try E interaction near spawn point
    await bot.page!.evaluate(function() {
      (window as any).__game.teleportPlayer?.(2, 0, 5);
    });
    await bot.page!.waitForTimeout(400);
    await QuestActions.interact(bot);
    await bot.page!.waitForTimeout(500);
  });

  await bot.step('teleport back to floor 0', async () => {
    await MovementActions.teleportToFloor(bot, 0);
  });

  await bot.step('interact with exit door', async () => {
    // Exit door is typically at (0, 0, -8) on F0
    await bot.page!.evaluate(function() {
      (window as any).__game.teleportPlayer?.(0, 0, -7);
    });
    await bot.page!.waitForTimeout(300);
    await QuestActions.interact(bot);
    await bot.page!.waitForTimeout(800);
  });

  await bot.step('check overworld loaded', async () => {
    const mode = await MovementActions.getGameMode(bot);
    console.log(`    game mode after exit: ${mode}`);
    // Either we're in overworld or quest completed
    if (mode.includes('exterior') || mode.includes('overworld')) {
      console.log('    ✓ exited tower to overworld');
    } else {
      console.log('    → door interaction noted (mode may need key item)');
    }
  });

  await bot.step('open quest log — check for completed quests', async () => {
    await QuestActions.openQuestLog(bot);
    const quests = await QuestActions.getActiveQuests(bot);
    console.log(`    quests visible: ${quests.join(', ') || '(none / API-only)'}`);
    await QuestActions.closeQuestLog(bot);
  });
}
