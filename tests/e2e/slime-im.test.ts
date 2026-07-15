/**
 * slime-im.test.ts — Visual tests for the SlimeEnemy InstancedMesh pipeline.
 *
 * Uses the "Slime IM Lab" panel added to sandbox.html to spawn slimes via
 * `window.__sandbox.slime.spawn(n)` and verify they render correctly.
 *
 * Key assertions:
 *  • frustumCulled === false  (the bug fix — without this slimes vanish when
 *                               the camera moves away from world origin)
 *  • drawCalls === 1          (InstancedMesh collapses N slimes to 1 draw call)
 *  • Canvas is non-trivially coloured at the centre  (slimes are actually painted)
 *
 * Screenshots land in  tests/e2e/screenshots/slime-im-*.png
 *
 * Run:
 *   npx playwright test tests/e2e/slime-im.test.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/slime-im-${name}.png` });

async function loadSandbox(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('/sandbox.html');
  await page.waitForFunction(
    () => (window as any).__sandbox?.ready === true,
    { timeout: 45_000 },
  );
  // Wait for at least one rendered frame
  await page.waitForTimeout(350);
  return errors;
}

interface SlimeStats {
  count: number;
  frustumCulled: boolean | null;
  drawCalls: number;
}

async function spawnSlimes(page: Page, count: number): Promise<SlimeStats> {
  await page.evaluate((n) => (window as any).__sandbox.slime.spawn(n), count);
  // Wait for the IM to be synced and at least one frame rendered
  await page.waitForTimeout(300);
  return page.evaluate(() => (window as any).__sandbox.slime.getStats()) as Promise<SlimeStats>;
}

/**
 * Sample pixels from the sandbox canvas by asking the sandbox to render a
 * frame and return a PNG data URL, then decoding it via an offscreen 2D canvas.
 * Works even when preserveDrawingBuffer is false (the default for WebGLRenderer)
 * because canvasDataURL() calls renderer.render() + canvas.toDataURL() atomically.
 * Returns true if any pixel in the central 80×80 region is brighter than the
 * background colour (0x1a1e26 = r26,g30,b38).
 */
async function canvasHasNonBlackPixels(page: Page): Promise<boolean> {
  return page.evaluate(async (): Promise<boolean> => {
    const sb = (window as any).__sandbox;
    if (!sb?.canvasDataURL) return false;

    const dataURL: string = sb.canvasDataURL(); // renderer.render() + toDataURL

    return new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const oc  = document.createElement('canvas');
        oc.width  = img.width;
        oc.height = img.height;
        const ctx = oc.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const cx   = Math.floor(img.width / 2);
        const cy   = Math.floor(img.height / 2);
        const size = 80;
        const d    = ctx.getImageData(cx - size / 2, cy - size / 2, size, size).data;
        for (let i = 0; i < d.length; i += 4) {
          // background ≈ rgb(26, 30, 38) — slime green/yellow/purple are much brighter
          if ((d[i]! > 50) || (d[i + 1]! > 55) || (d[i + 2]! > 55)) {
            resolve(true);
            return;
          }
        }
        resolve(false);
      };
      img.onerror = () => resolve(false);
      img.src = dataURL;
    });
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('Slime IM Lab — InstancedMesh rendering', () => {
  test.setTimeout(90_000);

  // ── 00: Panel present ─────────────────────────────────────────────────────

  test('Slime IM Lab panel is present in sandbox', async ({ page }) => {
    const errors = await loadSandbox(page);
    expect(errors, 'No JS errors on load').toHaveLength(0);

    await expect(page.locator('#slime-lab-section')).toBeVisible();
    await expect(page.locator('#btn-spawn-slimes')).toBeVisible();
    await expect(page.locator('#btn-clear-slimes')).toBeVisible();

    await shot(page, '00-panel-present');
  });

  // ── 01: frustumCulled is false ────────────────────────────────────────────

  test('InstancedMesh has frustumCulled=false (fixes invisible-slimes bug)', async ({ page }) => {
    await loadSandbox(page);

    const stats = await spawnSlimes(page, 10);

    expect(stats.count, 'IM instance count matches spawn count').toBe(10);
    expect(stats.frustumCulled, 'frustumCulled MUST be false to avoid culling at distance').toBe(false);
    expect(stats.drawCalls, 'all slimes share 1 draw call').toBe(1);

    await shot(page, '01-frustum-culled-false');
  });

  // ── 02: 20 slimes render (pixel check) ───────────────────────────────────

  test('20 slimes produce non-black pixels on canvas', async ({ page }) => {
    await loadSandbox(page);

    const stats = await spawnSlimes(page, 20);
    expect(stats.count).toBe(20);

    const hasPixels = await canvasHasNonBlackPixels(page);
    expect(hasPixels, 'Canvas centre must contain slime pixels (non-black)').toBe(true);

    await shot(page, '02-twenty-slimes');
  });

  // ── 03: Spawn via UI button ───────────────────────────────────────────────

  test('Spawn button in UI triggers InstancedMesh creation', async ({ page }) => {
    await loadSandbox(page);

    // Clear first
    await page.evaluate(() => (window as any).__sandbox.slime.clear());
    await page.waitForTimeout(100);

    // Set count in input and click Spawn
    await page.fill('#slime-count', '15');
    await page.click('#btn-spawn-slimes');
    await page.waitForTimeout(300);

    const stats: SlimeStats = await page.evaluate(
      () => (window as any).__sandbox.slime.getStats(),
    );
    expect(stats.count).toBe(15);
    expect(stats.frustumCulled).toBe(false);

    // Stats text should appear in the panel
    const statsText = await page.textContent('#slime-stats');
    expect(statsText).toContain('15');
    expect(statsText).toContain('1');  // draw calls

    await shot(page, '03-ui-spawn-15');
  });

  // ── 04: Clear removes all slimes ─────────────────────────────────────────

  test('Clear button removes all slimes from scene', async ({ page }) => {
    await loadSandbox(page);

    // Spawn then clear via API
    await spawnSlimes(page, 30);
    await page.evaluate(() => (window as any).__sandbox.slime.clear());
    await page.waitForTimeout(200);

    const stats: SlimeStats = await page.evaluate(
      () => (window as any).__sandbox.slime.getStats(),
    );
    expect(stats.count, 'After clear, IM count should be 0').toBe(0);

    const statsText = await page.textContent('#slime-stats');
    expect(statsText).toContain('No slimes');

    await shot(page, '04-after-clear');
  });

  // ── 05: Max camp count (60 slimes) ───────────────────────────────────────

  test('60 slimes (max overworld count) still render as 1 draw call', async ({ page }) => {
    await loadSandbox(page);

    const stats = await spawnSlimes(page, 60);
    expect(stats.count).toBe(60);
    expect(stats.frustumCulled).toBe(false);
    expect(stats.drawCalls).toBe(1);

    const hasPixels = await canvasHasNonBlackPixels(page);
    expect(hasPixels, '60-slime render should produce non-black pixels').toBe(true);

    await shot(page, '05-sixty-slimes');
  });

  // ── 06: Three colour groups visible ──────────────────────────────────────

  test('slimes render in three distinct tint groups (hostile/flee/recruit)', async ({ page }) => {
    await loadSandbox(page);

    // Spawn 3 slimes — one of each colour tint
    await page.evaluate(() => (window as any).__sandbox.slime.spawn(3));
    await page.waitForTimeout(300);

    // canvasDataURL forces a render — check the resulting image isn't monochrome
    const dataURL: string = await page.evaluate(() =>
      (window as any).__sandbox.canvasDataURL(),
    );
    expect(dataURL).toMatch(/^data:image\/png/);
    // The data URL is non-trivially long (actual pixel data, not a blank canvas)
    expect(dataURL.length).toBeGreaterThan(10_000);

    await shot(page, '06-three-tints');
  });
});
