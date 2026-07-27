/**
 * MovementActions.ts — bot actions for player movement and navigation.
 */
export const MovementActions = {
    /** Teleport player to world-space position. */
    async teleport(bot, x, y, z) {
        await bot.page.evaluate(([px, py, pz]) => window.__game.teleportPlayer(px, py, pz), [x, y, z]);
        await bot.page.waitForTimeout(300);
    },
    /** Teleport to a tower floor by index. */
    async teleportToFloor(bot, floorIndex) {
        await bot.page.evaluate((idx) => {
            const g = window.__game;
            // Use DevPanel's teleport room function
            const roomId = `tower_floor_${idx < 0 ? 'b' + Math.abs(idx) : idx}_chamber`;
            g.onTeleportRoom?.(roomId);
        }, floorIndex);
        await bot.page.waitForTimeout(600);
    },
    /** Walk in a direction for a duration (ms). */
    async walk(bot, direction, ms) {
        await bot.page.keyboard.down(direction.toUpperCase());
        await bot.page.waitForTimeout(ms);
        await bot.page.keyboard.up(direction.toUpperCase());
    },
    /** Get current player position. */
    async getPosition(bot) {
        return bot.page.evaluate(function () {
            return window.__game.getPlayerPos();
        });
    },
    /** Get current game mode (interior / exterior). */
    async getGameMode(bot) {
        return bot.page.evaluate(function () {
            return window.__game.getGameMode() ?? 'unknown';
        });
    },
    /** Get current floor index. */
    async getCurrentFloor(bot) {
        return bot.page.evaluate(function () {
            return window.__game.getCurrentFloor?.() ?? -99;
        });
    },
    /** Switch to exterior/overworld mode. */
    async goToOverworld(bot) {
        await bot.page.evaluate(function () { window.__game.switchToExterior?.(); });
        await bot.page.waitForTimeout(1_000);
    },
};
