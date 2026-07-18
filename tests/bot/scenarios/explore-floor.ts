/**
 * explore-floor.ts — B8: Visit every room on a tower floor.
 *
 * Flow:
 *   Start at F0 → enumerate rooms → walk to centre of each → screenshot
 *
 * Run:
 *   npm run bot -- --scenario explore-floor --headed --slow-mo 300
 */

import type { GameBot }     from '../GameBot';
import { MenuActions }      from '../actions/MenuActions';
import { MovementActions }  from '../actions/MovementActions';
import { PathfindingActions } from '../actions/PathfindingActions';

export async function exploreFloorScenario(bot: GameBot): Promise<void> {
  await bot.step('launch + dev mode', async () => {
    await bot.waitForGame();
    await bot.enableDevMode();
  });

  await bot.step('start game', async () => {
    await MenuActions.startGameFast(bot);
  });

  await bot.step('teleport to floor 0', async () => {
    await MovementActions.teleportToFloor(bot, 0);
  });

  await bot.step('enumerate rooms on current floor', async () => {
    const rooms = await PathfindingActions.getCurrentFloorRooms(bot);
    console.log(`    rooms found: ${rooms.length > 0 ? rooms.join(', ') : '(none via API — using defaults)'}`);
    (bot as any)._exploreRooms = rooms.length > 0 ? rooms : [
      'tower_floor_0_chamber',
      'tower_floor_0_side_east',
      'tower_floor_0_side_west',
    ];
  });

  // Walk to each room
  const rooms: string[] = (bot as any)._exploreRooms ?? [];
  for (const roomId of rooms.slice(0, 5)) {  // cap at 5 to keep run short
    await bot.step(`enter room: ${roomId}`, async () => {
      await PathfindingActions.walkToRoom(bot, roomId);
      const pos = await MovementActions.getPosition(bot);
      console.log(`    pos: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);
    });
  }

  await bot.step('teleport to basement', async () => {
    await MovementActions.teleportToFloor(bot, -1);
  });

  await bot.step('explore basement side rooms', async () => {
    const basementRooms = await PathfindingActions.getCurrentFloorRooms(bot);
    const toVisit = basementRooms.length > 0 ? basementRooms : ['tower_floor_b1_chamber'];
    for (const r of toVisit.slice(0, 3)) {
      await PathfindingActions.walkToRoom(bot, r);
      await bot.page!.waitForTimeout(300);
    }
  });

  await bot.step('report floor coverage', async () => {
    const stepsVisited = bot.steps.filter(s => s.name.startsWith('enter room') && s.status === 'pass').length;
    console.log(`    ✓ visited ${stepsVisited} room(s)`);
  });
}
