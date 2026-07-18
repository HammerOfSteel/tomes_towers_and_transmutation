/**
 * PathfindingActions.ts — B8: Smart navigation without hardcoded teleport calls.
 *
 * Moves the player toward destinations by reading __game.getPlayerPos() in a loop
 * and nudging toward the target using small teleport steps.  For cases where the
 * game exposes a proper navmesh API those calls are preferred; otherwise we fall
 * back to straight-line micro-teleports.
 */

import type { GameBot } from '../GameBot';

export interface WorldPos { x: number; y: number; z: number; }

export const PathfindingActions = {

  /**
   * Walk (micro-teleport) toward target until within `stopRadius` world-units.
   * Respects the actual game position so walls and floors don't matter.
   */
  async walkToPos(
    bot: GameBot,
    target: WorldPos,
    stopRadius = 1.5,
    timeoutMs = 15_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const pos: WorldPos = await bot.page!.evaluate(function() {
        return (window as any).__game.getPlayerPos?.() ?? { x:0, y:0, z:0 };
      });
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist2 = dx*dx + dz*dz;
      if (dist2 <= stopRadius * stopRadius) return;

      const dist = Math.sqrt(dist2);
      const step = Math.min(dist, 2.5);
      await bot.page!.evaluate(
        ([nx, ny, nz]: number[]) => (window as any).__game.teleportPlayer?.(nx, ny, nz),
        [pos.x + (dx/dist)*step, pos.y, pos.z + (dz/dist)*step]
      );
      await bot.page!.waitForTimeout(120);
    }
    throw new Error(`walkToPos timed out — target (${target.x}, ${target.z})`);
  },

  /**
   * Load a room (via onTeleportRoom) and then walk to its centre (0,y,0).
   */
  async walkToRoom(bot: GameBot, roomId: string): Promise<void> {
    await bot.page!.evaluate((id: string) => (window as any).__game.onTeleportRoom?.(id), roomId);
    await bot.page!.waitForTimeout(800);
    // Walk to room centre
    const pos: WorldPos = await bot.page!.evaluate(function() {
      return (window as any).__game.getPlayerPos?.() ?? { x:0, y:0, z:0 };
    });
    await PathfindingActions.walkToPos(bot, { x: 0, y: pos.y, z: 0 }, 2);
  },

  /**
   * Find the nearest scene object matching `type` label and approach it.
   * Uses __game.findNearestObject(type) if available, otherwise scans scene.
   */
  async findAndApproach(bot: GameBot, type: string, radius = 2): Promise<WorldPos | null> {
    const found: WorldPos | null = await bot.page!.evaluate((t: string) => {
      const g = (window as any).__game;
      if (g?.findNearestObject) return g.findNearestObject(t);
      return null;
    }, type);

    if (!found) {
      console.log(`    [pathfinding] findNearestObject("${type}") not available — skipping approach`);
      return null;
    }
    await PathfindingActions.walkToPos(bot, found, radius);
    return found;
  },

  /**
   * Scan the scene for an NPC by name fragment and walk to trigger range.
   */
  async findNPC(bot: GameBot, npcName: string): Promise<void> {
    const pos: WorldPos | null = await bot.page!.evaluate((name: string) => {
      const g = (window as any).__game;
      if (g?.findNPC) return g.findNPC(name);
      return null;
    }, npcName);

    if (!pos) {
      console.log(`    [pathfinding] NPC "${npcName}" not found via API — no movement`);
      return;
    }
    await PathfindingActions.walkToPos(bot, pos, 2);
  },

  /**
   * Locate nearest enemy of given type and approach (for combat testing).
   */
  async findEnemy(bot: GameBot, enemyType: string): Promise<void> {
    const pos: WorldPos | null = await bot.page!.evaluate((t: string) => {
      const g = (window as any).__game;
      if (g?.findNearestEnemy) return g.findNearestEnemy(t);
      return null;
    }, enemyType);

    if (!pos) {
      console.log(`    [pathfinding] enemy "${enemyType}" not found — no movement`);
      return;
    }
    await PathfindingActions.walkToPos(bot, pos, 3);
  },

  /**
   * Run away from all detected enemies by moving in the opposite direction.
   * Uses __game.getNearestEnemyPos() to get a direction.
   */
  async evadeEnemies(bot: GameBot, duration = 2_000): Promise<void> {
    const enemyPos: WorldPos | null = await bot.page!.evaluate(function() {
      const g = (window as any).__game;
      return g?.getNearestEnemyPos?.() ?? null;
    });
    if (!enemyPos) return;

    const myPos: WorldPos = await bot.page!.evaluate(function() {
      return (window as any).__game.getPlayerPos?.() ?? { x:0, y:0, z:0 };
    });

    const dx = myPos.x - enemyPos.x;
    const dz = myPos.z - enemyPos.z;
    const len = Math.sqrt(dx*dx + dz*dz) || 1;
    const flee = { x: myPos.x + (dx/len)*10, y: myPos.y, z: myPos.z + (dz/len)*10 };

    await PathfindingActions.walkToPos(bot, flee, 1, duration);
  },

  /**
   * Collect the list of rooms on the current floor (for explore-floor scenario).
   * Uses __game.getCurrentFloorRooms() if available.
   */
  async getCurrentFloorRooms(bot: GameBot): Promise<string[]> {
    return bot.page!.evaluate(function() {
      const g = (window as any).__game;
      return g?.getCurrentFloorRooms?.() ?? [];
    });
  },
};
