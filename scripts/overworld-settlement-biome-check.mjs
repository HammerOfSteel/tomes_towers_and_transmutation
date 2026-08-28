// Task 13, Steps 4/5 quick check (settlement buildings + biome diversity)
// without a long walk — uses teleportPlayer to jump directly to a few
// settlement/biome sample points.
import { chromium } from 'playwright';

const BASE_URL = process.argv[2] || 'http://localhost:5199';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForFunction(() => !!window.__game, { timeout: 15000 });
  await page.evaluate(() => window.__game.startGame(12345));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__game.switchToExterior());
  await page.waitForTimeout(800);

  const settlements = await page.evaluate(() => window.__game.getSettlements());
  console.log('settlements:', JSON.stringify(settlements));

  const buildingCount = await page.evaluate(() => window.__game.getBuildingColliderSpecCount());
  console.log('buildingColliderSpecCount (whole world):', buildingCount);

  // Sample biomes across the map by teleporting near a spread of points and
  // reading the cell under the player.
  const samplePts = [
    [0, 0], [200, 0], [-200, 0], [0, 200], [0, -200],
    [400, 400], [-400, -400], [400, -400], [-400, 400],
  ];
  const biomes = new Set();
  for (const [x, z] of samplePts) {
    await page.evaluate(([tx, tz]) => window.__game.teleportPlayer(tx, 5, tz), [x, z]);
    await page.evaluate(() => window.__game.forceTick(2));
    const cell = await page.evaluate(([tx, tz]) => window.__game.debugCellAt(tx, tz), [x, z]);
    console.log(`(${x},${z}):`, JSON.stringify(cell));
    if (cell && cell.biome) biomes.add(cell.biome);
  }
  console.log('distinct biomes sampled:', [...biomes].join(', '));

  await browser.close();
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});

// Hard watchdog: never let this script hang indefinitely (teleport near a
// far-out chunk plus scatter/collider rebuild can be slow under headless
// swiftshader — this caps total runtime instead of trusting it to finish).
setTimeout(() => {
  console.error('FAIL: watchdog timeout (90s) — killing script');
  process.exit(1);
}, 90000).unref?.();

