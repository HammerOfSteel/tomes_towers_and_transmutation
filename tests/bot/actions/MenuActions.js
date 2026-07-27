/**
 * MenuActions.ts — bot actions for main menu, character creation, pause menu.
 */
export const MenuActions = {
    /** Start a game bypassing character creation (uses __game.startGame). */
    async startGameFast(bot, seed = 0xDEAD_BEEF) {
        await bot.page.evaluate((s) => window.__game.startGame(s), seed);
        await bot.page.waitForTimeout(1_500);
    },
    /** Open the pause menu (Escape). */
    async openPause(bot) {
        await bot.page.keyboard.press('Escape');
        await bot.page.waitForSelector('.pm-btn', { state: 'visible', timeout: 3_000 });
    },
    /** Resume from pause menu. */
    async resume(bot) {
        await bot.page.click('[data-action="resume"]').catch(() => bot.page.keyboard.press('Escape'));
        await bot.page.waitForTimeout(300);
    },
    /** Click Creative Mode in the Dev Labs section of the pause menu. */
    async clickCreativeMode(bot) {
        await bot.page.click('[data-action="creative"]');
        await bot.page.waitForTimeout(400);
    },
    /** Enable dev mode via localStorage (requires page reload). */
    async enableDevMode(bot) {
        await bot.page.evaluate(function () { localStorage.setItem('ttt_dev_mode', 'true'); });
    },
    /** Check if game is showing the main menu. */
    async isOnMainMenu(bot) {
        return bot.page.locator('.main-menu, #main-menu-overlay, [id*="main-menu"]').first().isVisible().catch(() => false);
    },
};
