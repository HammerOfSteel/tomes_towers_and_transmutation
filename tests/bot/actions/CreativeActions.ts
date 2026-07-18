/**
 * CreativeActions.ts — bot actions specific to creative mode.
 * Uses the __game API and DOM selectors to drive creative mode interactions.
 */

import type { GameBot } from '../GameBot';

export const CreativeActions = {

  /** Enter creative mode via __game API. */
  async enter(bot: GameBot): Promise<void> {
    await bot.page!.evaluate(function() { (window as any).__game.enterCreativeMode(); });
    await bot.page!.waitForSelector('#creative-hud-root', { timeout: 8_000 });
    await bot.page!.waitForTimeout(400);
  },

  /** Exit creative mode via __game API. */
  async exit(bot: GameBot): Promise<void> {
    await bot.page!.evaluate(function() { (window as any).__game.exitCreativeMode(); });
    await bot.page!.waitForSelector('#creative-hud-root', { state: 'detached', timeout: 5_000 }).catch(() => {});
  },

  /** Open the creative inventory (C key). */
  async openInventory(bot: GameBot): Promise<void> {
    await bot.page!.keyboard.press('c');
    await bot.page!.waitForSelector('#cab-root', { state: 'visible', timeout: 5_000 });
    await bot.page!.waitForTimeout(300);
  },

  /** Close the creative inventory (C key again). */
  async closeInventory(bot: GameBot): Promise<void> {
    await bot.page!.keyboard.press('c');
    await bot.page!.waitForSelector('#cab-root', { state: 'hidden', timeout: 3_000 }).catch(() => {});
  },

  /** Click a kit by partial name in the sidebar. */
  async selectKit(bot: GameBot, nameFragment: string): Promise<void> {
    const btn = bot.page!.locator('.cab-kit-btn').filter({ hasText: nameFragment }).first();
    await btn.waitFor({ state: 'visible', timeout: 3_000 });
    await btn.click();
    await bot.page!.waitForTimeout(1_500);   // wait for async JSON load
  },

  /** Click the first visible asset card (or one matching nameFragment). */
  async pickAsset(bot: GameBot, nameFragment?: string): Promise<string> {
    const locator = nameFragment
      ? bot.page!.locator('.cab-card').filter({ hasText: nameFragment }).first()
      : bot.page!.locator('.cab-card').first();
    await locator.waitFor({ state: 'visible', timeout: 5_000 });
    const name = await locator.getAttribute('title') ?? 'unknown';
    await locator.click();
    await bot.page!.waitForTimeout(400);
    return name;
  },

  /** Right-click canvas to place the held asset. */
  async placeAtCenter(bot: GameBot): Promise<void> {
    const canvas = bot.page!.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');
    await bot.page!.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5, { button: 'right' });
    await bot.page!.waitForTimeout(500);
  },

  /** Assert creative HUD is visible with expected elements. */
  async assertHudPresent(bot: GameBot): Promise<void> {
    await bot.assertVisible('#creative-status-bar');
    await bot.assertVisible('#creative-hotbar');
    await bot.assertText('.creative-tag', 'CREATIVE');
  },

  /** Assert the asset grid has at least `min` cards. */
  async assertAssetCards(bot: GameBot, min: number): Promise<number> {
    const count = await bot.page!.locator('.cab-card').count();
    if (count < min) throw new Error(`Expected ≥${min} asset cards, got ${count}`);
    return count;
  },

  /** Toggle the settings panel (O key). */
  async openSettings(bot: GameBot): Promise<void> {
    await bot.page!.keyboard.press('o');
    await bot.page!.waitForSelector('#creative-settings-panel', { state: 'visible', timeout: 3_000 });
  },

  /** Toggle grid snap via the settings panel. */
  async toggleGridSnap(bot: GameBot): Promise<void> {
    const toggles = bot.page!.locator('.cs-toggle');
    await toggles.first().click();
    await bot.page!.waitForTimeout(200);
  },
};
