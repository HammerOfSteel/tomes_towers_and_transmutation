/**
 * showroom.spec.ts
 *
 * Visual tests using the dedicated showroom page (showroom.html).
 * Checkerboard floor, neutral lighting, OrbitControls — no game logic.
 * Run: npx playwright test tests/e2e/showroom.spec.ts --reporter=list
 */

import { test, type Page } from '@playwright/test';

test.use({ actionTimeout: 60_000 });
test.setTimeout(120_000);

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/showroom-${name}.png`, fullPage: false });

async function loadShowroom(page: Page): Promise<void> {
  await page.goto('/showroom.html');
  // Wait for the canvas + showroom API to be ready
  await page.waitForFunction(() => !!(window as any).showroom && !!document.querySelector('canvas'));
  await page.waitForTimeout(800);
}

function logs(page: Page): string[] {
  const all: string[] = [];
  page.on('console', (m) => {
    const line = `[${m.type()}] ${m.text()}`;
    all.push(line);
    if (m.type() !== 'debug') process.stdout.write(`  PAGE » ${line}\n`);
  });
  page.on('pageerror', (e) => {
    all.push(`[pageerror] ${e.message}`);
    process.stdout.write(`  PAGE » [pageerror] ${e.message}\n`);
  });
  return all;
}

// ── Test 1: Buildings — all 4 styles + special kinds ────────────────────────

test('showroom: building styles and kinds', async ({ page }) => {
  const log = logs(page);
  await loadShowroom(page);

  await SS(page, '00-empty-floor');

  // Spawn all 4 house styles in a row
  await page.evaluate(() => (window as any).showroom.spawnAllBuildings());
  await page.waitForTimeout(1000);

  await SS(page, '01-all-buildings-placed');

  // Orbit to see them from different angles
  // Drag to rotate view
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(300, 400, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await SS(page, '02-buildings-side-angle');

  await page.mouse.move(400, 400);
  await page.mouse.down();
  await page.mouse.move(400, 250, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await SS(page, '03-buildings-top-angle');

  const spawnedLogs = log.filter(l => l.includes('[showroom] spawned'));
  console.log(`[test] ✓ spawned ${spawnedLogs.length} buildings`);
  spawnedLogs.forEach(l => console.log(' ', l));
});

// ── Test 2: NPC species lineup ────────────────────────────────────────────────

test('showroom: all 7 NPC species', async ({ page }) => {
  const log = logs(page);
  await loadShowroom(page);

  await page.evaluate(() => (window as any).showroom.spawnAllNpcs());
  await page.waitForTimeout(3000); // async NPC builds

  await SS(page, '04-npc-lineup');

  // Zoom in on the lineup
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 80); // zoom in
  await page.waitForTimeout(300);
  await SS(page, '05-npc-lineup-closeup');

  // Pan along the line
  await page.mouse.move(300, 400);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(700, 400, { steps: 40 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(300);
  await SS(page, '06-npc-lineup-panned');

  const npcLogs = log.filter(l => l.includes('[showroom] spawned'));
  console.log(`[test] ✓ ${npcLogs.length} NPCs spawned`);
});

// ── Test 3: Enemy tier comparison ────────────────────────────────────────────

test('showroom: enemy tier 1/2/3 comparison', async ({ page }) => {
  const log = logs(page);
  await loadShowroom(page);

  await page.evaluate(() => (window as any).showroom.spawnEnemyTiers());
  await page.waitForTimeout(4000); // async enemy builds

  await SS(page, '07-enemy-tiers-overview');

  // Look along tier axis
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(400, 400, { steps: 25 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await SS(page, '08-enemy-tiers-angle');

  // Close up of tier 3 row
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 80);
  await page.waitForTimeout(300);
  await SS(page, '09-tier3-closeup');

  const enemyLogs = log.filter(l => l.includes('[showroom] spawned'));
  console.log(`[test] ✓ ${enemyLogs.length} enemies spawned`);
});

// ── Test 4: Props showcase ────────────────────────────────────────────────────

test('showroom: all 12 prop kinds', async ({ page }) => {
  await loadShowroom(page);

  const props = [
    ['chest', 'wood'], ['bookshelf', 'wood'], ['table', 'stone'],
    ['chair', 'wood'], ['cauldron', 'iron'], ['lantern', 'iron'],
    ['pillar', 'stone'], ['rug', 'clay'], ['door', 'wood'],
    ['statue', 'stone'], ['barrel', 'wood'], ['crate', 'wood'],
  ];

  for (const [kind, material] of props) {
    await page.evaluate(([k, m]) => (window as any).showroom.spawnProp(k, m), [kind, material]);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(600);

  await SS(page, '10-all-props');

  // Rotate to see from side
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(350, 350, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await SS(page, '11-props-angle');

  // Zoom in
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 80);
  await SS(page, '12-props-closeup');

  console.log('[test] ✓ all 12 props displayed');
});

// ── Test 5: Full showcase — everything at once ────────────────────────────────

test('showroom: full showcase — buildings + NPCs + enemies + props', async ({ page }) => {
  const log = logs(page);
  await loadShowroom(page);

  // Buildings back row
  await page.evaluate(() => (window as any).showroom.spawnAllBuildings());
  // NPCs middle row
  await page.evaluate(() => (window as any).showroom.spawnAllNpcs());
  // Enemies front right
  await page.evaluate(() => (window as any).showroom.spawnEnemyTiers());
  // Props scatter
  for (const [k, m] of [['chest','wood'],['lantern','iron'],['cauldron','iron'],['statue','stone']] as string[][]) {
    await page.evaluate(([kind, mat]) => (window as any).showroom.spawnProp(kind, mat), [k, m]);
  }

  await page.waitForTimeout(5000); // all async builds

  // Wide overview
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(450, 300, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await SS(page, '13-full-showcase');

  // Second angle
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(800, 400, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await SS(page, '14-full-showcase-side');

  // Zoom out to see all
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -80);
  await page.waitForTimeout(300);
  await SS(page, '15-full-showcase-wide');

  const all = log.filter(l => l.includes('[showroom] spawned'));
  console.log(`[test] ✓ full showcase — ${all.length} entities total`);
});
