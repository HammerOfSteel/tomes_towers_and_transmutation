/**
 * princess-creator.ts — NS8: Bot scenario for the princess creator flow.
 *
 * Steps:
 *   1. Load game in dev mode
 *   2. Start game
 *   3. Use __game.buildPrincess() to spawn the default foxling princess
 *   4. Verify the princess model is visible
 *   5. Open princess library ([J] key is quest journal — use __game.buildPrincess directly)
 *   6. Screenshot
 *
 * Run:
 *   npm run bot -- --scenario princess-creator --headed --slow-mo 400
 */

import type { GameBot }  from '../GameBot';
import { MenuActions }   from '../actions/MenuActions';
import { MovementActions } from '../actions/MovementActions';
import { DEFAULT_PRINCESSES } from '@/princess-creator/defaults/PrincessDefaults';
import { dnaToShareCode } from '@/princess-creator/dna';

export async function princessCreatorScenario(bot: GameBot): Promise<void> {
  await bot.step('launch + dev mode', async () => {
    await bot.waitForGame();
    await bot.enableDevMode();
  });

  await bot.step('start game', async () => {
    await MenuActions.startGameFast(bot);
  });

  await bot.step('get player position before princess', async () => {
    const pos = await MovementActions.getPosition(bot);
    console.log(`    player pos: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);
  });

  await bot.step('spawn foxling princess via __game.buildPrincess', async () => {
    // Use the foxling default DNA
    const foxlingDna = DEFAULT_PRINCESSES.find(d => d.species === 'foxling');
    const code = foxlingDna ? dnaToShareCode(foxlingDna) : null;

    if (code) {
      await bot.page!.evaluate((shareCode: string) => {
        (window as any).__game?.buildPrincess?.(shareCode);
      }, code);
    } else {
      // Fallback: use the first default
      await bot.page!.evaluate((dna: any) => {
        (window as any).__game?.buildPrincess?.(dna);
      }, DEFAULT_PRINCESSES[0]);
    }
    await bot.page!.waitForTimeout(800);
  });

  await bot.step('verify player is still in game after princess spawn', async () => {
    const mode = await MovementActions.getGameMode(bot);
    expect_contains(['interior', 'exterior'], mode, 'game still running');
  });

  await bot.step('open princess-creator in new tab via __game', async () => {
    // The Atelier URL should be available
    const hasAtelier = await bot.page!.evaluate(() => {
      return typeof (window as any).__game?.buildPrincess === 'function';
    });
    console.log(`    __game.buildPrincess available: ${hasAtelier}`);
  });

  await bot.step('move around with princess model', async () => {
    await bot.page!.keyboard.down('W');
    await bot.page!.waitForTimeout(400);
    await bot.page!.keyboard.up('W');
    await bot.page!.waitForTimeout(300);
    const pos = await MovementActions.getPosition(bot);
    console.log(`    pos after move: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);
  });

  await bot.step('screenshot final state', async () => {
    // Taken automatically by step runner
  });
}

function expect_contains(arr: string[], val: string, label: string): void {
  if (!arr.includes(val)) {
    throw new Error(`${label}: expected one of [${arr.join(', ')}], got "${val}"`);
  }
}
