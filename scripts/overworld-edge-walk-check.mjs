// Task 13 playtest driver: walks the player toward the world edge in a
// small worldSize=128 world to confirm the empty-trimesh chunk-streaming
// crash (fixed in commit ee9dd89) no longer reproduces.
//
// IMPORTANT environment-limitation note: forceTick() bypasses rAF (which is
// throttled near-zero in headless/backgrounded tabs) by directly invoking
// the game loop's tick. Any ms/tick figure reported by this script is NOT a
// real-FPS measurement in this sandboxed headless/swiftshader environment —
// it is only useful as a gross/runaway-regression detector. Ticks are run
// in small bounded bursts (not a tight per-frame loop) to avoid flooding the
// software-rendered GPU command queue, which otherwise produces misleading,
// artificially growing per-call latency.
import { chromium } from 'playwright';

const BASE_URL = process.argv[2] || 'http://localhost:5199';
// startGame() has no worldSize override — it always uses
// DEFAULT_WORLD_GEN_CONFIG.worldSize (512 as of Task 7). The bug being
// verified is a universal edge-of-world case, not size-specific, so we
// simply teleport far enough (well past +/-511 world units) to force
// chunk requests fully outside the grid regardless of configured size.
const WORLD_SIZE = 512;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[page]', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));

  console.log('goto...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  console.log('navigated, waiting for __game hook...');
  await page.waitForFunction(() => !!window.__game, { timeout: 15000 });
  console.log('__game ready, calling startGame...');

  await page.evaluate(() => window.__game.startGame(12345));
  console.log('startGame returned, waiting 1s...');
  await page.waitForTimeout(1000);
  console.log('calling switchToExterior...');
  await page.evaluate(() => window.__game.switchToExterior());
  console.log('switchToExterior returned, waiting 1s...');
  await page.waitForTimeout(1000);
  console.log('beginning walk...');

  // Walk from spawn toward +X in small increments (mimics real player
  // movement rather than large teleport jumps, which force many chunks to
  // load synchronously at once and are slow under headless
  // swiftshader — not evidence of a bug by themselves). Print every 5th
  // step to keep output concise; abort the whole script if any single step
  // takes implausibly long.
  const STEP = 20;
  const MAX_X = 620; // well past the ~511 world-unit edge of the 512 grid
  let x = 0;
  let i = 0;
  while (x <= MAX_X) {
    const stepStart = Date.now();
    await page.evaluate((tx) => window.__game.teleportPlayer(tx, 5, 0), x);
    await page.evaluate(() => window.__game.forceTick(3));
    await page.waitForTimeout(80);
    const elapsed = Date.now() - stepStart;
    if (i % 5 === 0 || elapsed > 5000) {
      const pos = await page.evaluate(() => window.__game.getPlayerPos());
      const bodies = await page.evaluate(() => window.__game.getStaticBodyCount());
      console.log(`x=${x}: playerPos=${JSON.stringify(pos)} staticBodies=${bodies} stepMs=${elapsed}`);
    }
    x += STEP;
    i++;
  }

  console.log('PASS: no crash across full walk through worldSize=%d edge', WORLD_SIZE);
  await browser.close();
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
