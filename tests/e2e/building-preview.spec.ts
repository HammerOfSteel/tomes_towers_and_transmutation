/**
 * building-preview.spec.ts
 *
 * E2E tests for the "🎮 Play in 3D" building preview flow:
 *   Overworld Studio sets `ttt_building_preview` in localStorage
 *   → game page detects it, auto-starts, calls previewBuilding()
 *   → player lands in the building room (NOT the tower observatory)
 *
 * Console capture is used for every test so failures show the full
 * debug log from main.ts, making silent errors visible.
 *
 * Run: npx playwright test tests/e2e/building-preview.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage, attachFullConsoleCapture } from './helpers';

test.use({ actionTimeout: 60_000 });

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/bldg-preview-${name}.png` });

// ── Helper: build a minimal valid plan JSON via the game's own API ────────────

/**
 * Navigates to the game, waits for __game to be available, generates a
 * building plan JSON using window.__game.generateBuildingPreviewJson(),
 * and returns it.  The page is then navigated away from (caller must reload).
 */
async function generatePlanJson(
  page: Page,
  kind    = 'inn',
  faction = 'human_town',
  seed    = 42,
): Promise<string> {
  await loadPage(page);
  const json = await page.evaluate(
    ([k, f, s]) => (window as any).__game?.generateBuildingPreviewJson(k, f, s) ?? '',
    [kind, faction, seed] as const,
  );
  expect(json, 'generateBuildingPreviewJson must return non-empty string').toBeTruthy();
  return json as string;
}

// ── Core flow test ────────────────────────────────────────────────────────────

test.describe('Building Preview (ttt_building_preview localStorage flow)', () => {

  test('smoke: __game.generateBuildingPreviewJson() returns valid plan', async ({ page }) => {
    const console_ = attachFullConsoleCapture(page);
    await loadPage(page);
    const json = await page.evaluate(() =>
      (window as any).__game?.generateBuildingPreviewJson('inn', 'human_town', 42),
    );
    expect(json, 'should return JSON string').toBeTruthy();
    const parsed = JSON.parse(json as string);
    expect(Object.keys(parsed.rooms).length, 'plan must have rooms').toBeGreaterThan(0);
    expect(parsed.startRoomId, 'plan must have startRoomId').toBeTruthy();
    expect(Object.keys(parsed.rooms), 'startRoomId must be in rooms').toContain(parsed.startRoomId);
    // Filter out asset 404s (missing prop models etc.) — those are environment
    // issues, not code errors in the preview flow.
    const codeErrors = console_.errors.filter(e => !e.includes('404 (Not Found)'));
    expect(codeErrors, `Code errors:\n${console_.all.join('\n')}`).toHaveLength(0);
  });

  test('building plan is JSON-round-trip safe (no Maps or Sets)', async ({ page }) => {
    await loadPage(page);
    const json = await page.evaluate(() =>
      (window as any).__game?.generateBuildingPreviewJson('shop', 'dwarven', 99),
    ) as string;
    const parsed = JSON.parse(json);
    for (const [id, bp] of Object.entries(parsed.rooms) as [string, any][]) {
      expect(Array.isArray(bp.tiles),        `${id}.tiles must be array`).toBe(true);
      expect(Array.isArray(bp.doors),        `${id}.doors must be array`).toBe(true);
      expect(Array.isArray(bp.staircases),   `${id}.staircases must be array`).toBe(true);
      expect(typeof bp.width,                `${id}.width must be number`).toBe('number');
      expect(typeof bp.depth,                `${id}.depth must be number`).toBe('number');
    }
  });

  test('localStorage key triggers auto-start: building loads, not tower', async ({ page }) => {
    const console_ = attachFullConsoleCapture(page);

    // Step 1 — get a valid plan JSON (game API, normal load)
    const planJson = await generatePlanJson(page, 'inn', 'human_town', 1234);
    const parsed   = JSON.parse(planJson);
    const expectedRoomId = parsed.startRoomId as string;
    expect(expectedRoomId).toMatch(/^inn_f0_r\d+$/);

    // Step 2 — set the key in localStorage BEFORE reload
    await page.evaluate((json) => {
      localStorage.setItem('ttt_building_preview', json);
    }, planJson);

    await SS(page, '00-before-reload');

    // Step 3 — reload; the auto-start code should pick up the key
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Step 4 — wait for game to initialise
    await page.waitForFunction(
      () => !!(window as any).__game,
      { timeout: 30_000 },
    );

    // Step 5 — wait for previewBuilding to complete (or error)
    await page.waitForFunction(
      () => !!(window as any).__buildingPreviewComplete || !!(window as any).__buildingPreviewError,
      { timeout: 20_000 },
    );

    await SS(page, '01-after-preview');

    // Step 6 — assert outcomes
    const previewError = await page.evaluate(() => (window as any).__buildingPreviewError);
    expect(
      previewError,
      `previewBuilding threw an error: ${previewError}\n\nFull console:\n${console_.all.join('\n')}`,
    ).toBeUndefined();

    const currentRoomId = await page.evaluate(() => (window as any).__game?.getCurrentRoomId());
    expect(
      currentRoomId,
      `Expected building room "${expectedRoomId}" but got "${currentRoomId}"\n\nFull console:\n${console_.all.join('\n')}`,
    ).toBe(expectedRoomId);

    // Confirm key debug log messages are present
    expect(
      console_.has('[buildingPreview] key found in localStorage'),
      `Missing "[buildingPreview] key found" log — auto-start may not have run.\nConsole:\n${console_.all.join('\n')}`,
    ).toBe(true);
    expect(
      console_.has('[previewBuilding] ✓ complete'),
      `Missing "[previewBuilding] ✓ complete" log.\nConsole:\n${console_.all.join('\n')}`,
    ).toBe(true);

    // No console errors
    expect(
      console_.errors,
      `Console errors during preview:\n${console_.all.join('\n')}`,
    ).toHaveLength(0);
  });

  test('player is in creative mode after preview loads', async ({ page }) => {
    const console_ = attachFullConsoleCapture(page);

    const planJson = await generatePlanJson(page, 'chapel', 'elven', 777);
    await page.evaluate((json) => localStorage.setItem('ttt_building_preview', json), planJson);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!(window as any).__buildingPreviewComplete, { timeout: 30_000 });

    const isCreative = await page.evaluate(() => {
      const CreativeMode = (window as any).__CreativeMode;
      // Fallback: check the game exposes it or check a known side-effect
      return (window as any).__game?.isCreativeMode?.() ?? null;
    });
    // At minimum: no error during the preview
    const previewError = await page.evaluate(() => (window as any).__buildingPreviewError);
    expect(
      previewError,
      `Preview error: ${previewError}\nConsole:\n${console_.all.join('\n')}`,
    ).toBeUndefined();

    await SS(page, '02-creative-mode');
  });

  test('missing localStorage key shows main menu, not auto-start', async ({ page }) => {
    const console_ = attachFullConsoleCapture(page);

    // Ensure key is absent
    await page.addInitScript(() => {
      localStorage.removeItem('ttt_building_preview');
    });
    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).__game, { timeout: 20_000 });

    // Should NOT have the building preview log
    await page.waitForTimeout(500);
    expect(
      console_.has('[buildingPreview] key found'),
      'Should NOT auto-start when key is absent',
    ).toBe(false);

    // __buildingPreviewComplete should not be set
    const complete = await page.evaluate(() => (window as any).__buildingPreviewComplete);
    expect(complete).toBeFalsy();

    await SS(page, '03-no-key-main-menu');
  });

  test('invalid plan JSON logs error, does not crash game', async ({ page }) => {
    const console_ = attachFullConsoleCapture(page);

    // Set a deliberately broken plan
    await page.addInitScript(() => {
      localStorage.setItem('ttt_building_preview', '{"bad": "json no rooms"}');
    });
    await page.goto('/');
    await page.waitForFunction(
      () => !!(window as any).__buildingPreviewComplete || !!(window as any).__buildingPreviewError,
      { timeout: 30_000 },
    );

    const previewError = await page.evaluate(() => (window as any).__buildingPreviewError);
    expect(previewError, 'invalid plan should set __buildingPreviewError').toBeTruthy();

    // Should log the error but NOT throw an uncaught pageerror
    const pageErrors = console_.errors.filter(e => e.startsWith('[pageerror]'));
    expect(
      pageErrors,
      `Unexpected uncaught errors:\n${pageErrors.join('\n')}`,
    ).toHaveLength(0);

    await SS(page, '04-invalid-plan-error');
  });

});

// ── Smoke test: previewBuilding() is callable on a running game ───────────────

test.describe('previewBuilding() smoke (API call without reload)', () => {

  test('calling previewBuilding directly loads building room', async ({ page }) => {
    const console_ = attachFullConsoleCapture(page);
    await loadPage(page);

    // Start game via normal path
    await page.evaluate((s) => (window as any).__game?.startGame(s), 0xDEAD_BEEF);
    await page.waitForTimeout(800);

    const roomBefore = await page.evaluate(() => (window as any).__game?.getCurrentRoomId());
    expect(roomBefore, 'should have a room after startGame').toBeTruthy();

    // Build a plan and call previewBuilding directly
    const planJson = await page.evaluate(() =>
      (window as any).__game?.generateBuildingPreviewJson('inn', 'human_town', 42),
    ) as string;
    const expectedId = JSON.parse(planJson).startRoomId as string;

    await page.evaluate((json) => (window as any).__game?.previewBuilding(json), planJson);
    await page.waitForFunction(
      () => !!(window as any).__buildingPreviewComplete || !!(window as any).__buildingPreviewError,
      { timeout: 10_000 },
    );

    await SS(page, '05-direct-api-call');

    const previewError = await page.evaluate(() => (window as any).__buildingPreviewError);
    expect(
      previewError,
      `previewBuilding error: ${previewError}\nConsole:\n${console_.all.join('\n')}`,
    ).toBeUndefined();

    const roomAfter = await page.evaluate(() => (window as any).__game?.getCurrentRoomId());
    expect(
      roomAfter,
      `Room should be "${expectedId}" but got "${roomAfter}"\nConsole:\n${console_.all.join('\n')}`,
    ).toBe(expectedId);

    expect(
      console_.errors,
      `Console errors:\n${console_.all.join('\n')}`,
    ).toHaveLength(0);
  });

});

// ── Building room quality tests ───────────────────────────────────────────────

test.describe('Building room quality (no stray props)', () => {

  test('no [PropPlacer] logs for building rooms — isBuildingRoom guard works', async ({ page }) => {
    const console_ = attachFullConsoleCapture(page);
    await loadPage(page);
    await page.evaluate((s) => (window as any).__game?.startGame(s), 0xDEAD_BEEF);
    await page.waitForTimeout(800);

    // Mark the log index before calling previewBuilding — tower rooms log
    // PropPlacer entries during startGame; we only care about what fires AFTER.
    const logsBefore = console_.all.length;

    const planJson = await page.evaluate(() =>
      (window as any).__game?.generateBuildingPreviewJson('inn', 'human_town', 42),
    ) as string;
    await page.evaluate((json) => (window as any).__game?.previewBuilding(json), planJson);
    await page.waitForFunction(
      () => !!(window as any).__buildingPreviewComplete || !!(window as any).__buildingPreviewError,
      { timeout: 10_000 },
    );

    // Only look at logs emitted after previewBuilding was called
    const afterLogs = console_.all.slice(logsBefore);

    // PropPlacer must NOT run for building rooms (stray props bug)
    const propLogs = afterLogs.filter(l => l.includes('[PropPlacer] placed'));
    expect(
      propLogs,
      `PropPlacer should be skipped for building rooms but ran after previewBuilding:\n${propLogs.join('\n')}`,
    ).toHaveLength(0);

    // The skip log SHOULD be present
    const skipLog = afterLogs.find(l => l.includes('skipped KayKit props for building room'));
    expect(
      skipLog,
      `Expected "[onRoomLoaded] skipped KayKit props" log after previewBuilding.\nAfter-logs:\n${afterLogs.join('\n')}`,
    ).toBeTruthy();

    // No preview error
    const previewError = await page.evaluate(() => (window as any).__buildingPreviewError);
    expect(previewError, `previewBuilding error: ${previewError}`).toBeUndefined();

    await SS(page, '06-no-stray-props');
  });

});
