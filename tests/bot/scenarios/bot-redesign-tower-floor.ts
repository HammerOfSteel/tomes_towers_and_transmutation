/**
 * bot-redesign-tower-floor.ts — B9: Bot opens tower editor, loads F3, places barrels and candelabras.
 *
 * Steps:
 *   Enter creative → teleport F3 → open inventory → select KayKit pack
 *   Place barrels along the walls (8 positions) → save → screenshot
 *
 * Run:
 *   npm run bot -- --scenario bot-redesign-tower-floor --headed --slow-mo 400
 */

import type { GameBot }    from '../GameBot';
import { MenuActions }     from '../actions/MenuActions';
import { MovementActions } from '../actions/MovementActions';
import { CreativeActions } from '../actions/CreativeActions';

export async function botRedesignTowerFloorScenario(bot: GameBot): Promise<void> {
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

  await bot.step('teleport to tower floor 3', async () => {
    await MovementActions.teleportToFloor(bot, 3);
  });

  await bot.step('open inventory — select KayKit Dungeon pack', async () => {
    await CreativeActions.openInventory(bot);
    await CreativeActions.selectKit(bot, 'KayKit');
    const count = await CreativeActions.assertAssetCards(bot, 1);
    console.log(`    ${count} KayKit assets`);
  });

  await bot.step('pick barrel asset', async () => {
    const name = await CreativeActions.pickAsset(bot, 'barrel').catch(
      () => CreativeActions.pickAsset(bot)
    );
    console.log(`    picked: ${name}`);
    await CreativeActions.closeInventory(bot);
  });

  // Place barrels along all four walls
  const wallPositions = [
    [-5, 0, -4], [-3, 0, -4], [-1, 0, -4],  // north wall
    [1, 0, -4],  [3, 0, -4],                 // north wall cont.
    [-5, 0,  4], [3, 0,  4],                 // south wall
    [5, 0,  0],                              // east wall
  ];

  for (let i = 0; i < wallPositions.length; i++) {
    const [x, y, z] = wallPositions[i]!;
    await bot.step(`place barrel ${i + 1}/${wallPositions.length}`, async () => {
      await bot.page!.evaluate(
        ([px, py, pz]: number[]) => (window as any).__game.teleportPlayer?.(px, py, pz),
        [x! + 0.5, y!, z! + 0.5]
      );
      await bot.page!.waitForTimeout(150);
      await CreativeActions.placeAtCenter(bot);
    });
  }

  // Now add candelabras in corners
  await bot.step('open inventory — pick candelabra/torch asset', async () => {
    await CreativeActions.openInventory(bot);
    await CreativeActions.selectKit(bot, 'KayKit');
    const name = await CreativeActions.pickAsset(bot, 'candel').catch(
      () => CreativeActions.pickAsset(bot, 'torch').catch(
        () => CreativeActions.pickAsset(bot)
      )
    );
    console.log(`    picked decoration: ${name}`);
    await CreativeActions.closeInventory(bot);
  });

  const cornerPositions = [[-6, 0, -5], [6, 0, -5], [6, 0, 5], [-6, 0, 5]];
  for (let i = 0; i < cornerPositions.length; i++) {
    const [x, y, z] = cornerPositions[i]!;
    await bot.step(`place candelabra ${i + 1}/4`, async () => {
      await bot.page!.evaluate(
        ([px, py, pz]: number[]) => (window as any).__game.teleportPlayer?.(px, py, pz),
        [x!, y!, z!]
      );
      await bot.page!.waitForTimeout(150);
      await CreativeActions.placeAtCenter(bot);
    });
  }

  await bot.step('save placed objects (Ctrl+S)', async () => {
    await bot.page!.keyboard.press('Control+s');
    await bot.page!.waitForTimeout(800);
  });

  await bot.step('publish to game (Ctrl+Shift+S)', async () => {
    await bot.page!.keyboard.press('Control+Shift+s');
    await bot.page!.waitForTimeout(600);
    // Dismiss confirmation if it appears
    const confirmBtn = bot.page!.locator('button').filter({ hasText: /confirm|publish/i }).first();
    if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();
    await bot.page!.waitForTimeout(400);
  });

  await bot.step('exit creative mode', async () => {
    await CreativeActions.exit(bot);
  });
}
