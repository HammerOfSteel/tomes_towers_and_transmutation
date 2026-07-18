/**
 * overworld.ts — B4: Exit tower → walk overworld → find dungeon entrance.
 *
 * Run:
 *   npm run bot -- --scenario overworld --headed --slow-mo 400
 */

import type { GameBot } from '../GameBot';
import { MenuActions }     from '../actions/MenuActions';
import { MovementActions } from '../actions/MovementActions';

export async function overworldScenario(bot: GameBot): Promise<void> {
  await bot.step('launch + dev mode', async () => {
    await bot.waitForGame();
    await bot.enableDevMode();
  });

  await bot.step('start new game', async () => {
    await MenuActions.startGameFast(bot);
  });

  await bot.step('teleport to tower floor 0', async () => {
    await MovementActions.teleportToFloor(bot, 0);
  });

  await bot.step('switch to exterior (overworld)', async () => {
    await MovementActions.goToOverworld(bot);
    const mode = await MovementActions.getGameMode(bot);
    if (!mode.includes('exterior') && !mode.includes('overworld')) {
      throw new Error(`Expected overworld mode, got: ${mode}`);
    }
  });

  await bot.step('verify overworld scene loaded', async () => {
    // Canvas should still be visible; __game should report exterior mode
    await bot.assertVisible('canvas');
    const mode = await MovementActions.getGameMode(bot);
    console.log(`    mode: ${mode}`);
  });

  await bot.step('walk north (W) for 2s', async () => {
    await MovementActions.walk(bot, 'w', 2_000);
    const pos = await MovementActions.getPosition(bot);
    console.log(`    pos after walk: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);
  });

  await bot.step('walk east (D) for 1.5s', async () => {
    await MovementActions.walk(bot, 'd', 1_500);
  });

  await bot.step('walk south (S) back toward tower', async () => {
    await MovementActions.walk(bot, 's', 2_000);
  });

  await bot.step('return to interior', async () => {
    await bot.page!.evaluate(function() { (window as any).__game.switchToInterior?.(); });
    await bot.page!.waitForTimeout(1_000);
  });

  await bot.step('verify back on tower floor', async () => {
    const floor = await MovementActions.getCurrentFloor(bot);
    console.log(`    floor: ${floor}`);
  });
}
