/**
 * find-quest-npc.ts — B8: Navigate to a named quest NPC and trigger dialogue.
 *
 * Run:
 *   npm run bot -- --scenario find-quest-npc --headed --slow-mo 300
 */

import type { GameBot }      from '../GameBot';
import { MenuActions }       from '../actions/MenuActions';
import { PathfindingActions } from '../actions/PathfindingActions';
import { QuestActions }      from '../actions/QuestActions';

export async function findQuestNpcScenario(bot: GameBot): Promise<void> {
  await bot.step('launch + dev mode', async () => {
    await bot.waitForGame();
    await bot.enableDevMode();
  });

  await bot.step('start game', async () => {
    await MenuActions.startGameFast(bot);
  });

  await bot.step('find Archivist NPC on floor 0', async () => {
    await PathfindingActions.findNPC(bot, 'Archivist');
    const pos = await bot.page!.evaluate(function() {
      return (window as any).__game.getPlayerPos?.() ?? { x:0, y:0, z:0 };
    });
    console.log(`    near NPC at (${(pos as any).x?.toFixed(1)}, ${(pos as any).z?.toFixed(1)})`);
  });

  await bot.step('trigger NPC dialogue', async () => {
    await QuestActions.interact(bot);
    await bot.page!.waitForTimeout(600);
    // Try to read any dialogue that appeared
    const text = await QuestActions.getDialogueText(bot).catch(() => '');
    if (text) console.log(`    dialogue: "${text.slice(0, 60)}..."`);
    else       console.log('    (no DOM dialogue found — may be canvas-rendered)');
  });

  await bot.step('advance dialogue 3 times', async () => {
    await QuestActions.advanceDialogue(bot, 3);
  });

  await bot.step('check for activated quest', async () => {
    await QuestActions.openQuestLog(bot);
    const quests = await QuestActions.getActiveQuests(bot);
    console.log(`    active quests after dialogue: ${quests.join(', ') || '(none visible in DOM)'}`);
    await QuestActions.closeQuestLog(bot);
  });
}
