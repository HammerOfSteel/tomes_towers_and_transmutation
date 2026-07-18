/**
 * MovementActions.ts — bot actions for player movement and navigation.
 */

import type { GameBot } from '../GameBot';

export const MovementActions = {

  /** Teleport player to world-space position. */
  async teleport(bot: GameBot, x: number, y: number, z: number): Promise<void> {
    await bot.page!.evaluate(
      ([px, py, pz]: number[]) => (window as any).__game.teleportPlayer(px, py, pz),
      [x, y, z]
    );
    await bot.page!.waitForTimeout(300);
  },

  /** Teleport to a tower floor by index. */
  async teleportToFloor(bot: GameBot, floorIndex: number): Promise<void> {
    await bot.page!.evaluate((idx: number) => {
      const g = (window as any).__game;
      // Use DevPanel's teleport room function
      const roomId = `tower_floor_${idx < 0 ? 'b' + Math.abs(idx) : idx}_chamber`;
      g.onTeleportRoom?.(roomId);
    }, floorIndex);
    await bot.page!.waitForTimeout(600);
  },

  /** Walk in a direction for a duration (ms). */
  async walk(bot: GameBot, direction: 'w' | 'a' | 's' | 'd', ms: number): Promise<void> {
    await bot.page!.keyboard.down(direction.toUpperCase());
    await bot.page!.waitForTimeout(ms);
    await bot.page!.keyboard.up(direction.toUpperCase());
  },

  /** Get current player position. */
  async getPosition(bot: GameBot): Promise<{ x: number; y: number; z: number }> {
    return bot.page!.evaluate(function() {
      return (window as any).__game.getPlayerPos();
    });
  },

  /** Get current game mode (interior / exterior). */
  async getGameMode(bot: GameBot): Promise<string> {
    return bot.page!.evaluate(function() {
      return (window as any).__game.getGameMode() ?? 'unknown';
    });
  },

  /** Get current floor index. */
  async getCurrentFloor(bot: GameBot): Promise<number> {
    return bot.page!.evaluate(function() {
      return (window as any).__game.getCurrentFloor?.() ?? -99;
    });
  },

  /** Switch to exterior/overworld mode. */
  async goToOverworld(bot: GameBot): Promise<void> {
    await bot.page!.evaluate(function() { (window as any).__game.switchToExterior?.(); });
    await bot.page!.waitForTimeout(1_000);
  },
};
