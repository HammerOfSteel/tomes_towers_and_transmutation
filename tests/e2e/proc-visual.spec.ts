/**
 * proc-visual.spec.ts
 *
 * Visual test for PROC-B builders.
 * Starts the game, spawns NPCs / enemies / decorated room,
 * takes screenshots so you can see them in the browser.
 *
 * Run: npx playwright test tests/e2e/proc-visual.spec.ts --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './helpers';

test.use({ actionTimeout: 60_000 });

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/proc-${name}.png`, fullPage: false });

function attachLogs(page: Page) {
  const logs: string[] = [];
  page.on('console', (m) => {
    const line = `[${m.type()}] ${m.text()}`;
    logs.push(line);
    if (m.type() !== 'debug') process.stdout.write(`  PAGE » ${line}\n`);
  });
  page.on('pageerror', (e) => {
    const line = `[pageerror] ${e.message}`;
    logs.push(line);
    process.stdout.write(`  PAGE » ${line}\n`);
  });
  return logs;
}

async function startGame(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__game.quickPlayPrincess({ name: 'Tester', species: 'foxling' }));
  await page.waitForFunction(() => (window as any).__gameStarted === true, { timeout: 60_000 });
  await page.waitForTimeout(2000); // let room + props render
}

// ── Test 1: Room decorated with procedural props ─────────────────────────────

test('PROC-B3: dungeon room has procedural props', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);
  await startGame(page);

  await SS(page, '01-dungeon-with-props');

  // Check PropPlacer ran (log lines)
  const propLogs = logs.filter(l => l.includes('[PropPlacer]'));
  console.log(`[test] PropPlacer logs: ${propLogs.length}`);
  propLogs.forEach(l => console.log(' ', l));
  expect(propLogs.length).toBeGreaterThan(0);
  console.log('[test] ✓ dungeon room decorated with props');

  // Walk around to see the props
  await page.locator('canvas').first().click({ position: { x: 640, y: 360 } });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2000);
  await SS(page, '02-walking-past-props');
  await page.keyboard.up('KeyW');

  await page.keyboard.down('KeyD');
  await page.waitForTimeout(2000);
  await SS(page, '03-props-from-side');
  await page.keyboard.up('KeyD');
});

// ── Test 2: Spawn NPCs of all 7 species ──────────────────────────────────────

test('PROC-B1: spawn NPCs of all species', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);
  await startGame(page);

  const SPECIES_ROLES = [
    { species: 'human',     role: 'merchant'    },
    { species: 'undead',    role: 'scholar'     },
    { species: 'vulperia',  role: 'guard'       },
    { species: 'slime',     role: 'innkeeper'   },
    { species: 'elf',       role: 'quest_giver' },
    { species: 'celestial', role: 'elder'       },
    { species: 'draconic',  role: 'mysterious'  },
  ];

  for (const { species, role } of SPECIES_ROLES) {
    await page.evaluate(([s, r]) => (window as any).__game.spawnTestNpc(s, r), [species, role]);
    await page.waitForTimeout(600); // async build
  }

  await page.waitForTimeout(1500); // all builds settle
  await SS(page, '04-all-7-npc-species');

  const npcLogs = logs.filter(l => l.includes('[spawnTestNpc]'));
  console.log(`[test] NPC spawn logs: ${npcLogs.length}`);
  npcLogs.forEach(l => console.log(' ', l));
  expect(npcLogs.length).toBe(7);

  // Walk toward them
  await page.locator('canvas').first().click({ position: { x: 640, y: 360 } });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2000);
  await SS(page, '05-approaching-npcs');
  await page.keyboard.up('KeyW');
  console.log('[test] ✓ all 7 NPC species spawned');
});

// ── Test 3: Spawn enemies of tier 1, 2, 3 ────────────────────────────────────

test('PROC-B2: spawn enemies tier 1/2/3', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);
  await startGame(page);

  const ENEMY_VARIANTS = [
    { species: 'human',    role: 'melee',  tier: 1 },
    { species: 'undead',   role: 'caster', tier: 2 },
    { species: 'draconic', role: 'tank',   tier: 3 },
    { species: 'elf',      role: 'ranged', tier: 1 },
    { species: 'slime',    role: 'swarm',  tier: 2 },
  ];

  for (const { species, role, tier } of ENEMY_VARIANTS) {
    await page.evaluate(([s, r, t]) => (window as any).__game.spawnTestEnemy(s, r, t), [species, role, tier]);
    await page.waitForTimeout(700);
  }

  await page.waitForTimeout(1500);
  await SS(page, '06-enemies-spawned');

  const enemyLogs = logs.filter(l => l.includes('[spawnTestEnemy]'));
  console.log(`[test] enemy spawn logs: ${enemyLogs.length}`);
  enemyLogs.forEach(l => console.log(' ', l));
  expect(enemyLogs.length).toBe(5);

  // Look at them
  await page.locator('canvas').first().click({ position: { x: 640, y: 360 } });
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(2000);
  await SS(page, '07-enemies-panning');
  await page.keyboard.up('KeyA');
  console.log('[test] ✓ enemies tier 1/2/3 spawned');
});

// ── Test 4: All three at once — full PROC showcase ───────────────────────────

test('PROC showcase: props + NPCs + enemies + buildings in one scene', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);
  await startGame(page);

  // Spawn 2 NPCs
  await page.evaluate(() => (window as any).__game.spawnTestNpc('elf', 'scholar'));
  await page.evaluate(() => (window as any).__game.spawnTestNpc('vulperia', 'merchant'));
  // Spawn 2 enemies
  await page.evaluate(() => (window as any).__game.spawnTestEnemy('undead', 'caster', 2));
  await page.evaluate(() => (window as any).__game.spawnTestEnemy('draconic', 'melee', 3));
  // Spawn buildings of each style
  await page.evaluate(() => (window as any).__game.spawnTestBuilding('house', 'thatched', 'small'));
  await page.evaluate(() => (window as any).__game.spawnTestBuilding('shop', 'stone', 'medium'));
  await page.evaluate(() => (window as any).__game.spawnTestBuilding('ruin', 'timber', 'small'));

  await page.waitForTimeout(2500); // everything builds
  await SS(page, '08-proc-showcase');

  // Walk to get a better angle
  await page.locator('canvas').first().click({ position: { x: 640, y: 360 } });
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyS');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyD');
  await SS(page, '09-proc-showcase-angle2');

  // Verify log output
  const buildingLogs = logs.filter(l => l.includes('[spawnTestBuilding]'));
  console.log(`[test] buildings spawned: ${buildingLogs.length}`);
  expect(buildingLogs.length).toBe(3);

  const errors = logs.filter(l =>
    (l.includes('[error]') || l.includes('[pageerror]')) &&
    !l.includes('404') && !l.includes('favicon')
  );
  if (errors.length > 0) {
    console.log('[test] JS errors:');
    errors.forEach(e => console.log(' ', e));
  }
  expect(errors.length).toBeLessThan(3);
  console.log(`[test] ✓ PROC showcase complete — ${errors.length} error(s)`);
});
