/**
 * procedural-grass.spec.ts — manual/visual verification for the procedural
 * grass shader, batch 1 (grassland biome only; see
 * docs/superpowers/specs/2026-08-31-procedural-grass-grassland-design.md).
 *
 * Not part of the regular CI regression suite — one-off verification
 * tooling confirming the unit-tested placement/packing/geometry/material
 * logic actually produces visible, correctly-instanced grass in the live
 * OverworldScene with no console/page errors and a sane draw-call count.
 * Run: npx playwright test tests/e2e/procedural-grass.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage, startGame, goExterior, teleportPlayer, attachFullConsoleCapture } from './helpers';

test.use({ actionTimeout: 150_000, navigationTimeout: 60_000 });
test.setTimeout(300_000);

const SS = async (page: Page, name: string) => {
  try {
    await page.screenshot({ path: `tests/e2e/screenshots/procedural-grass-${name}.png`, timeout: 10_000 });
  } catch (e) {
    console.warn(`[procedural-grass.spec] screenshot '${name}' skipped: ${(e as Error).message}`);
  }
};

test.describe('Procedural grass (grassland batch 1)', () => {
  test('grass instances render on a grassland tile with no errors and a bounded draw-call count', async ({ page }) => {
    const { errors, all } = attachFullConsoleCapture(page);

    await loadPage(page);
    await startGame(page);
    await goExterior(page);

    const tile = await page.evaluate(() => (window as any).__game.findFirstGrasslandTile());
    expect(tile, 'No grassland tile found in generated overworld').toBeTruthy();

    await teleportPlayer(page, (tile as { x: number; z: number }).x, 5, (tile as { x: number; z: number }).z);
    await page.evaluate(() => (window as any).__game.forceTick(10));
    await page.waitForTimeout(300);
    await SS(page, '01-on-grassland');

    expect(errors, `Console/page errors: ${all.join('\n')}`).toHaveLength(0);

    const grassInfo = await page.evaluate(() => (window as any).__game.getGrassDebugInfo());
    expect(grassInfo.inScene, 'Grass mesh not in scene').toBe(true);
    expect(grassInfo.bladeCount, 'No grass blades placed on a grassland tile').toBeGreaterThan(0);

    // Regression guard against the "un-merged scatter caused sub-7fps" class of bug this
    // project has hit before (see OverworldScene.ts's mergeGroupMeshesByMaterial() comment) —
    // grass is one InstancedMesh (1 draw call), so total draw calls should stay well bounded
    // even with the rest of a loaded overworld scene's geometry. Uses getDrawCallCount()
    // rather than the pre-existing getPerfStats() hook, which throws (references an
    // undefined `perfState` — a separate, unrelated pre-existing bug discovered while writing
    // this spec; not fixed here since it's out of this batch's scope).
    const drawCalls = await page.evaluate(() => (window as any).__game.getDrawCallCount());
    expect(drawCalls, `Unexpectedly high draw call count: ${drawCalls}`).toBeLessThan(500);
  });
});
