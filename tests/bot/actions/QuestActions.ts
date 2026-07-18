/**
 * QuestActions.ts — bot actions for quest, dialogue, and interactable flows.
 */

import type { GameBot } from '../GameBot';

export const QuestActions = {

  /**
   * Press E once (interact / advance dialogue).
   */
  async interact(bot: GameBot): Promise<void> {
    await bot.page!.keyboard.press('e');
    await bot.page!.waitForTimeout(300);
  },

  /**
   * Advance a dialogue by pressing E `times` times with a pause between each.
   */
  async advanceDialogue(bot: GameBot, times = 1): Promise<void> {
    for (let i = 0; i < times; i++) {
      await bot.page!.keyboard.press('e');
      await bot.page!.waitForTimeout(350);
    }
  },

  /**
   * Wait for a dialogue box to appear (E-interact is usually the trigger).
   */
  async waitForDialogue(bot: GameBot): Promise<void> {
    await bot.page!.waitForSelector(
      '.dialogue-box, #dialogue-root, [id*="dialogue"], [class*="dialogue"]',
      { state: 'visible', timeout: 5_000 }
    );
  },

  /**
   * Read the current dialogue text (first dialogue box found).
   */
  async getDialogueText(bot: GameBot): Promise<string> {
    const el = bot.page!.locator('.dialogue-box, #dialogue-root, [id*="dialogue"]').first();
    return (await el.textContent()) ?? '';
  },

  /**
   * Open the quest log (J key — common RPG default; adjust if the game uses a different key).
   */
  async openQuestLog(bot: GameBot): Promise<void> {
    await bot.page!.keyboard.press('j');
    await bot.page!.waitForTimeout(400);
  },

  /**
   * Close the quest log.
   */
  async closeQuestLog(bot: GameBot): Promise<void> {
    await bot.page!.keyboard.press('j');
    await bot.page!.waitForTimeout(300);
  },

  /**
   * Return all visible quest titles from the quest log panel.
   */
  async getActiveQuests(bot: GameBot): Promise<string[]> {
    const els = bot.page!.locator('.quest-item, .quest-title, [class*="quest-name"]');
    const count = await els.count();
    const titles: string[] = [];
    for (let i = 0; i < count; i++) {
      titles.push((await els.nth(i).textContent()) ?? '');
    }
    return titles.filter(Boolean);
  },

  /**
   * Assert a quest with the given id/name fragment is in the active quest list.
   * Checks both DOM and __game.getQuestState if available.
   */
  async assertQuestActive(bot: GameBot, idOrName: string): Promise<void> {
    // Try __game API first
    const apiActive: boolean = await bot.page!.evaluate((id: string) => {
      const g = (window as any).__game;
      if (g?.getQuestState) return g.getQuestState(id) === 'active';
      return false;
    }, idOrName);

    if (!apiActive) {
      // Fall back to DOM check
      const dom = await bot.page!.locator('[class*="quest"]').filter({ hasText: idOrName }).count();
      if (dom === 0) throw new Error(`Quest "${idOrName}" not found in active quests`);
    }
  },

  /**
   * Assert a quest is marked complete.
   */
  async assertQuestComplete(bot: GameBot, idOrName: string): Promise<void> {
    const apiDone: boolean = await bot.page!.evaluate((id: string) => {
      const g = (window as any).__game;
      if (g?.getQuestState) return g.getQuestState(id) === 'complete';
      return false;
    }, idOrName);

    if (!apiDone) {
      const dom = await bot.page!.locator('[class*="quest-complete"], [class*="quest-done"]')
        .filter({ hasText: idOrName }).count();
      if (dom === 0) throw new Error(`Quest "${idOrName}" not marked complete`);
    }
  },

  /**
   * Walk toward a world-space position until within `stopRadius` WU.
   * Checks position every 500 ms, times out after `timeoutMs`.
   */
  async walkToward(
    bot: GameBot,
    target: { x: number; z: number },
    stopRadius = 2,
    timeoutMs = 10_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const pos = await bot.page!.evaluate(function() {
        return (window as any).__game.getPlayerPos?.() ?? { x: 0, y: 0, z: 0 };
      });
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= stopRadius) return;

      // Teleport in steps of 3 WU toward target
      const step = Math.min(dist, 3);
      const nx = pos.x + (dx / dist) * step;
      const nz = pos.z + (dz / dist) * step;
      await bot.page!.evaluate(
        ([px, py, pz]: number[]) => (window as any).__game.teleportPlayer?.(px, py, pz),
        [nx, pos.y, nz]
      );
      await bot.page!.waitForTimeout(150);
    }
    throw new Error(`Timed out walking to (${target.x}, ${target.z})`);
  },

  /**
   * Pick up an item by walking near it and pressing E.
   */
  async collectItem(bot: GameBot, itemSelector: string): Promise<void> {
    const el = bot.page!.locator(itemSelector).first();
    await el.waitFor({ state: 'visible', timeout: 5_000 });
    // Interact — most collectibles trigger on E or proximity
    await bot.page!.keyboard.press('e');
    await bot.page!.waitForTimeout(500);
  },
};
