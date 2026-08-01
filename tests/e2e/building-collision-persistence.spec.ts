import { test, expect } from '@playwright/test';
import { loadPage, attachErrorCapture, startGame, goExterior } from './helpers';

test.use({ actionTimeout: 60_000, viewport: { width: 1280, height: 800 } });

test('building collider physics bodies persist after exit()/enter() cycle (regression test for lost colliders)', async ({ page }) => {
  const errors = attachErrorCapture(page);
  await loadPage(page);
  await startGame(page);
  await goExterior(page, 'building-collision-persistence-setup');

  const staticCountAtStart = await page.evaluate(() => (window as any).__game.getStaticBodyCount());
  expect(staticCountAtStart).toBeGreaterThan(0); // terrain/tower/trees/etc. always present

  // Spawn a test building — registers a collider spec + immediately creates its physics body
  // since the scene is already active.
  await page.evaluate(() => (window as any).__game.spawnBuildingNearPlayer('inn', 'tudor', 2));
  const specCountAfterSpawn = await page.evaluate(() => (window as any).__game.getBuildingColliderSpecCount());
  const staticCountAfterSpawn = await page.evaluate(() => (window as any).__game.getStaticBodyCount());
  expect(specCountAfterSpawn).toBeGreaterThanOrEqual(1);
  expect(staticCountAfterSpawn).toBe(staticCountAtStart + 1);

  // Force an exit()/enter() cycle on the overworld scene by switching to interior then back
  // to exterior — this is exactly what happens when a player walks into ANY building/dungeon
  // and comes back out, and is what previously destroyed building colliders permanently
  // (exit() clears ALL static bodies; enter() only recreated terrain/tower/tree/rock colliders,
  // never buildings, since building placement was a one-time constructor-only step).
  await page.evaluate(() => (window as any).__game.switchToInterior());
  await page.waitForFunction(() => (window as any).__game.getGameMode() === 'interior', { timeout: 20000 });
  await page.waitForTimeout(300);
  await page.evaluate(() => (window as any).__game.switchToExterior());
  await page.waitForFunction(() => (window as any).__game.getGameMode() === 'exterior', { timeout: 20000 });
  await page.waitForTimeout(300);

  // The registered spec count must be unchanged (specs persist across cycles by design),
  // AND the static body count must be back to what it was right after spawning — proving
  // enter() recreated the building's physics body rather than leaving it permanently gone.
  const specCountAfterCycle = await page.evaluate(() => (window as any).__game.getBuildingColliderSpecCount());
  const staticCountAfterCycle = await page.evaluate(() => (window as any).__game.getStaticBodyCount());
  expect(specCountAfterCycle).toBe(specCountAfterSpawn);
  expect(staticCountAfterCycle).toBe(staticCountAfterSpawn);

  expect(errors.length).toBe(0);
});
