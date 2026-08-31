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

test.describe('Procedural grass (grassland batch 1 + savanna/forest/taiga/tundra batch 2)', () => {
  test('grass instances render on a grassland tile with no errors and a bounded draw-call count', async ({ page }) => {
    const { errors, all } = attachFullConsoleCapture(page);

    await loadPage(page);
    await startGame(page);
    await goExterior(page);

    const tile = await page.evaluate(() => (window as any).__game.findFirstBiomeTile('grassland'));
    expect(tile, 'No grassland tile found in generated overworld').toBeTruthy();

    await teleportPlayer(page, (tile as { x: number; z: number }).x, 5, (tile as { x: number; z: number }).z);
    await page.evaluate(() => (window as any).__game.forceTick(10));
    await page.waitForTimeout(300);
    await SS(page, '01-on-grassland');

    expect(errors, `Console/page errors: ${all.join('\n')}`).toHaveLength(0);

    const grassInfo = await page.evaluate(() => (window as any).__game.getGrassDebugInfo());
    expect(grassInfo.inScene, 'Grass mesh not in scene').toBe(true);
    expect(grassInfo.bladeCounts.grassland, 'No grass blades placed on a grassland tile').toBeGreaterThan(0);

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

  test('each of the 4 new biome presets (savanna/forest/taiga/tundra) places grass blades on its own biome tile', async ({ page }) => {
    // This test repeats the single-biome test's full teleport/tick/check cycle 4 times (once
    // per new biome) — under this shared/sandboxed dev environment's occasional heavy host
    // load (see this file's sibling river-lake-swim.spec.ts for the same documented
    // slowness), the default 300s test timeout was not always enough; bump per-test to give
    // ~4x the single-biome test's own observed budget.
    test.setTimeout(1_200_000);
    const { errors, all } = attachFullConsoleCapture(page);

    await loadPage(page);
    await startGame(page);
    // The default seed/shape ('island', this project's default per WorldGenConfig.ts) can
    // never geometrically produce 'tundra' — an 'island' shape's mask fades every map edge
    // (including the cold high-latitude edges) to ocean, so land can never exist at the low
    // latitude values 'tundra' requires (confirmed via a local buildWorldGrid sweep: 0/300
    // seeds at the default shape ever produced a tundra cell, vs. 24/100 with
    // shape:'archipelago' + climate:'arctic', whose land patches CAN reach the map edges).
    // seed=4 with that shape/climate is confirmed (via the same sweep) to contain all 5
    // grass-bearing biomes. This is a pre-existing RealmGenerator.ts characteristic, unrelated
    // to this batch's grass work — see tests/world/RealmGenerator.test.ts's own
    // `seenBiomes.has('mountain') || seenBiomes.has('tundra')` assertion for a similar
    // acknowledgement that tundra is rare/shape-dependent elsewhere in this codebase.
    await page.evaluate(() => (window as any).__game.enterOverworldLab({
      seed: 4, shape: 'archipelago', climate: 'arctic',
    }));
    await page.waitForTimeout(800); // mirrors helpers.ts's goExterior() physics-settle wait

    for (const biome of ['savanna', 'forest', 'taiga', 'tundra'] as const) {
      const tile = await page.evaluate((b) => (window as any).__game.findFirstBiomeTile(b), biome);
      expect(tile, `No ${biome} tile found in generated overworld`).toBeTruthy();

      await teleportPlayer(page, (tile as { x: number; z: number }).x, 5, (tile as { x: number; z: number }).z);
      await page.evaluate(() => (window as any).__game.forceTick(10));
      await page.waitForTimeout(300);

      const grassInfo = await page.evaluate(() => (window as any).__game.getGrassDebugInfo());
      expect(grassInfo.bladeCounts[biome], `No grass blades placed on a ${biome} tile`).toBeGreaterThan(0);
    }

    expect(errors, `Console/page errors: ${all.join('\n')}`).toHaveLength(0);
  });
});
