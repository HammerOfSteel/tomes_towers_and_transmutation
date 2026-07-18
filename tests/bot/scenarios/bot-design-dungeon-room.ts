/**
 * bot-design-dungeon-room.ts — B9: Bot designs a dungeon room in the Dungeon Prototype backroom.
 *
 * Steps:
 *   Enter creative → open backrooms panel (B) → enter Dungeon Prototype
 *   Place walls, torches, a chest, enemy spawn marker → export scenario JSON
 *
 * Run:
 *   npm run bot -- --scenario bot-design-dungeon-room --headed --slow-mo 500
 */

import type { GameBot }    from '../GameBot';
import { MenuActions }     from '../actions/MenuActions';
import { CreativeActions } from '../actions/CreativeActions';

export async function botDesignDungeonRoomScenario(bot: GameBot): Promise<void> {
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

  await bot.step('open backrooms panel (B key)', async () => {
    await bot.page!.keyboard.press('b');
    await bot.page!.waitForTimeout(600);
  });

  await bot.step('enter Dungeon Prototype backroom', async () => {
    // Look for a button/card containing "Dungeon" or "dungeon_prototype"
    const btn = bot.page!.locator('[data-room-id="dungeon_prototype"], button, .br-card')
      .filter({ hasText: /dungeon/i }).first();
    const visible = await btn.isVisible().catch(() => false);
    if (visible) {
      await btn.click();
    } else {
      // Fallback: __game API direct entry
      await bot.page!.evaluate(function() {
        (window as any).__game?.enterBackroom?.('dungeon_prototype');
      });
    }
    await bot.page!.waitForTimeout(1_500);
  });

  // Place walls via Code spawn tab
  await bot.step('open inventory — Code tab', async () => {
    await CreativeActions.openInventory(bot);
    // Switch to Code tab if present
    const codeTab = bot.page!.locator('.cab-tab').filter({ hasText: /code/i }).first();
    if (await codeTab.isVisible()) await codeTab.click();
    await bot.page!.waitForTimeout(400);
  });

  await bot.step('pick enemy spawn marker', async () => {
    const card = bot.page!.locator('.cab-card, .spawn-card')
      .filter({ hasText: /enemy|spawn/i }).first();
    if (await card.isVisible()) {
      await card.click();
    } else {
      console.log('    (spawn card not visible — continuing)');
    }
    await CreativeActions.closeInventory(bot);
  });

  await bot.step('place enemy spawn at room centre', async () => {
    await bot.page!.evaluate(function() {
      (window as any).__game.teleportPlayer?.(0.5, 0, 0.5);
    });
    await bot.page!.waitForTimeout(200);
    await CreativeActions.placeAtCenter(bot);
  });

  // Place a few environment props via Models tab
  await bot.step('open inventory — Models tab, select Dungeon kit', async () => {
    await CreativeActions.openInventory(bot);
    const modelsTab = bot.page!.locator('.cab-tab').filter({ hasText: /model/i }).first();
    if (await modelsTab.isVisible()) await modelsTab.click();
    await bot.page!.waitForTimeout(300);
    await CreativeActions.selectKit(bot, 'Dungeon');
  });

  await bot.step('pick chest / crate asset', async () => {
    const name = await CreativeActions.pickAsset(bot, 'chest').catch(
      () => CreativeActions.pickAsset(bot)  // any asset if no chest
    );
    console.log(`    picked: ${name}`);
    await CreativeActions.closeInventory(bot);
  });

  const propPositions = [[-3, 0, -3], [3, 0, -3], [3, 0, 3], [-3, 0, 3]];
  for (let i = 0; i < propPositions.length; i++) {
    const [x, y, z] = propPositions[i]!;
    await bot.step(`place prop ${i + 1}/4`, async () => {
      await bot.page!.evaluate(
        ([px, py, pz]: number[]) => (window as any).__game.teleportPlayer?.(px, py, pz),
        [x!, y!, z!]
      );
      await bot.page!.waitForTimeout(150);
      await CreativeActions.placeAtCenter(bot);
    });
  }

  await bot.step('export scenario JSON (Ctrl+E)', async () => {
    await bot.page!.keyboard.press('Control+e');
    await bot.page!.waitForTimeout(1_000);
  });

  await bot.step('exit creative mode', async () => {
    await CreativeActions.exit(bot);
  });
}
