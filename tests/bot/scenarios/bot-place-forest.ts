/**
 * bot-place-forest.ts — B9: Bot enters creative, selects nature assets, places a forest cluster.
 *
 * Steps:
 *   Enter creative → teleport overworld → open inventory → select Forest Nature Pack
 *   Place 12 trees and 6 rocks in a clustered pattern → save → exit → screenshot
 *
 * Run:
 *   npm run bot -- --scenario bot-place-forest --headed --slow-mo 400
 */

import type { GameBot }    from '../GameBot';
import { MenuActions }     from '../actions/MenuActions';
import { MovementActions } from '../actions/MovementActions';
import { CreativeActions } from '../actions/CreativeActions';

const FOREST_KIT   = 'Nature';   // partial name matching kit sidebar button
const TREE_ASSET   = 'tree';
const ROCK_ASSET   = 'rock';

export async function botPlaceForestScenario(bot: GameBot): Promise<void> {
  await bot.step('launch + dev mode', async () => {
    await bot.waitForGame();
    await bot.enableDevMode();
  });

  await bot.step('start game', async () => {
    await MenuActions.startGameFast(bot);
  });

  await bot.step('enter creative mode', async () => {
    await CreativeActions.enter(bot);
    await CreativeActions.assertHudPresent(bot);
  });

  await bot.step('teleport to overworld', async () => {
    await MovementActions.goToOverworld(bot);
    await bot.page!.waitForTimeout(800);
  });

  await bot.step('open creative inventory', async () => {
    await CreativeActions.openInventory(bot);
  });

  await bot.step(`select kit: ${FOREST_KIT}`, async () => {
    await CreativeActions.selectKit(bot, FOREST_KIT);
    const count = await CreativeActions.assertAssetCards(bot, 1);
    console.log(`    ${count} nature assets available`);
  });

  await bot.step('pick tree asset', async () => {
    const name = await CreativeActions.pickAsset(bot, TREE_ASSET);
    console.log(`    picked: ${name}`);
  });

  await bot.step('close inventory', async () => {
    await CreativeActions.closeInventory(bot);
  });

  // Place 12 trees in a rough circle / cluster
  const treePositions = [
    [-3, 0, -3], [-1, 0, -4], [1, 0, -4], [3, 0, -3],
    [4, 0, -1],  [4, 0,  1],  [3, 0,  3], [1, 0,  4],
    [-1, 0, 4],  [-3, 0, 3],  [-4, 0, 1], [-4, 0, -1],
  ];

  for (let i = 0; i < treePositions.length; i++) {
    const [x, y, z] = treePositions[i]!;
    await bot.step(`place tree ${i + 1}/12`, async () => {
      await bot.page!.evaluate(
        ([px, py, pz]: number[]) => (window as any).__game.teleportPlayer?.(px, py, pz),
        [x! + 0.5, y!, z! + 0.5]   // stand just beside target spot
      );
      await bot.page!.waitForTimeout(150);
      await CreativeActions.placeAtCenter(bot);
    });
  }

  // Switch to rock asset and place 6
  await bot.step('open inventory — switch to rock', async () => {
    await CreativeActions.openInventory(bot);
    await CreativeActions.selectKit(bot, FOREST_KIT);
    await CreativeActions.pickAsset(bot, ROCK_ASSET);
    await CreativeActions.closeInventory(bot);
  });

  const rockPositions = [
    [-2, 0, -1], [0, 0, -2], [2, 0, -1],
    [2, 0,  1],  [0, 0,  2], [-2, 0, 1],
  ];

  for (let i = 0; i < rockPositions.length; i++) {
    const [x, y, z] = rockPositions[i]!;
    await bot.step(`place rock ${i + 1}/6`, async () => {
      await bot.page!.evaluate(
        ([px, py, pz]: number[]) => (window as any).__game.teleportPlayer?.(px, py, pz),
        [x! + 0.3, y!, z! + 0.3]
      );
      await bot.page!.waitForTimeout(150);
      await CreativeActions.placeAtCenter(bot);
    });
  }

  await bot.step('save with Ctrl+S', async () => {
    await bot.page!.keyboard.press('Control+s');
    await bot.page!.waitForTimeout(600);
  });

  await bot.step('exit creative mode', async () => {
    await CreativeActions.exit(bot);
  });

  await bot.step('final overworld screenshot', async () => {
    // Taken automatically by step runner
  });
}
