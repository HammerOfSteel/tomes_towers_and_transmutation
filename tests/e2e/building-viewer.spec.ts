/**
 * building-viewer.spec.ts
 *
 * E2E tests for the isolated building-viewer.html page.
 * Written BEFORE implementation (TDD red phase).
 * All tests should fail until building-viewer.ts exists.
 *
 * Run: npx playwright test tests/e2e/building-viewer.spec.ts --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';
import { attachFullConsoleCapture } from './helpers';

test.use({ actionTimeout: 60_000 });
// Use absolute URL so the test works regardless of which port Vite chose
const BASE = process.env.BASE_URL ?? 'http://localhost:5174';

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/bv-${name}.png` });

// ── Helper: generate a valid plan JSON via the main game API ─────────────────

async function makePlanJson(kind = 'inn', faction = 'human_town', seed = 42): Promise<string> {
  // Use a throwaway page to call the game API
  const tmpPage = await (test.info() as any)._project?.use?.browser?.newPage?.() ?? null;
  // Fallback: just build a minimal valid plan inline using known structure
  // (We can't easily import TypeScript from tests, so encode a known-good inn plan)
  // Instead, we load the main game briefly to use generateBuildingPreviewJson
  // NOTE: once main.ts cleanup (Task 5) removes generateBuildingPreviewJson,
  // this helper should call building-viewer.ts's own generator or use buildingToDungeonPlan directly.
  return JSON.stringify({
    // Minimal valid plan — inn ground floor single room
    // This matches the format produced by buildingToDungeonPlan
    rooms: {
      'inn_f0_r0': {
        id: 'inn_f0_r0', version: 1,
        width: 10, depth: 8, cellSize: 1.0, wallHeight: 3.0,
        tiles: [
          // Perimeter walls (top/bottom rows)
          ...Array.from({length: 10}, (_, x) => ({ x, z: 0, type: 'wall' as const })),
          ...Array.from({length: 10}, (_, x) => ({ x, z: 7, type: 'wall' as const })),
          // Side walls
          ...Array.from({length: 6}, (_, z) => ({ x: 0, z: z+1, type: 'wall' as const })),
          ...Array.from({length: 6}, (_, z) => ({ x: 9, z: z+1, type: 'wall' as const })),
        ],
        doors: [{ x: 5, z: 7, facing: 'south' as const, targetId: null }],
        staircases: [], spawns: [], interactables: [],
        floor: 0, floorType: 'wood' as const,
      },
    },
    startRoomId: 'inn_f0_r0',
    seed: 42,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('GET /building-viewer.html returns 200', async ({ page }) => {
  const res = await page.goto(`${BASE}/building-viewer.html`);
  expect(res?.status(), 'building-viewer.html must exist and return 200').toBe(200);
});

test('page with valid plan in localStorage loads canvas without JS errors', async ({ page }) => {
  const console_ = attachFullConsoleCapture(page);

  const planJson = await makePlanJson();

  // Set key BEFORE navigation so it's present when the script runs
  await page.addInitScript((json: string) => {
    localStorage.setItem('ttt_building_preview', json);
  }, planJson);

  await page.goto(`${BASE}/building-viewer.html`);

  // Wait for viewer to be ready OR fail — avoids 60s timeout if WASM/WebGL fails
  await page.waitForFunction(
    () => !!(window as any).__buildingViewerReady || !!(window as any).__buildingViewerError,
    { timeout: 30_000 },
  );

  await SS(page, '01-plan-loaded');

  // Canvas must be visible
  await expect(page.locator('#bv-canvas')).toBeVisible();

  // Status overlay must be hidden (plan was loaded)
  const statusDisplay = await page.locator('#bv-status').evaluate((el: HTMLElement) => el.style.display);
  expect(statusDisplay, 'status overlay should be hidden when plan is present').not.toBe('block');

  // Check for fatal error from WASM/WebGL init
  const viewerError = await page.evaluate(() => (window as any).__buildingViewerError);
  expect(
    viewerError,
    `BuildingViewer fatal error: ${viewerError}\n\nConsole:\n${console_.all.join('\n')}`,
  ).toBeUndefined();

  // No code errors (filter out asset 404s which are environment, not code bugs)
  const codeErrors = console_.errors.filter(e => !e.includes('404'));
  expect(
    codeErrors,
    `Code errors in building viewer:\n${console_.all.join('\n')}`,
  ).toHaveLength(0);
});

test('page without key shows "No plan loaded" message and does not crash', async ({ page }) => {
  const console_ = attachFullConsoleCapture(page);

  // Ensure key is absent
  await page.addInitScript(() => { localStorage.removeItem('ttt_building_preview'); });
  await page.goto(`${BASE}/building-viewer.html`);
  await page.waitForTimeout(2_000);

  await SS(page, '02-no-plan');

  // Status message must be visible
  const statusText = await page.locator('#bv-status').textContent();
  expect(statusText, 'should show "No plan loaded" message').toMatch(/no plan loaded/i);

  // Must not crash
  const pageErrors = console_.errors.filter(e => e.startsWith('[pageerror]'));
  expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toHaveLength(0);

  // Ready flag must NOT be set (no plan = not ready)
  const ready = await page.evaluate(() => !!(window as any).__buildingViewerReady);
  expect(ready).toBe(false);
});

test('window.__buildingViewerReady is set after plan loads', async ({ page }) => {
  const planJson = await makePlanJson();
  await page.addInitScript((json: string) => {
    localStorage.setItem('ttt_building_preview', json);
  }, planJson);

  await page.goto(`${BASE}/building-viewer.html`);
  await page.waitForFunction(
    () => !!(window as any).__buildingViewerReady || !!(window as any).__buildingViewerError,
    { timeout: 30_000 },
  );

  const ready = await page.evaluate(() => (window as any).__buildingViewerReady);
  expect(ready).toBe(true);
});

test('no tower system logs appear (zero coupling to main game)', async ({ page }) => {
  const console_ = attachFullConsoleCapture(page);

  const planJson = await makePlanJson();
  await page.addInitScript((json: string) => {
    localStorage.setItem('ttt_building_preview', json);
  }, planJson);

  await page.goto(`${BASE}/building-viewer.html`);
  await page.waitForFunction(
    () => !!(window as any).__buildingViewerReady || !!(window as any).__buildingViewerError,
    { timeout: 30_000 },
  );

  // These log prefixes must NEVER appear — they mean tower systems loaded
  const towerLogs = console_.all.filter(l =>
    l.includes('[PropPlacer]') ||
    l.includes('[StoryRunner]') ||
    l.includes('[tower]') ||
    l.includes('You wake in a tower') ||
    l.includes('[autoSave]') ||
    l.includes('[startGame]'),
  );

  expect(
    towerLogs,
    `Tower system logs must not appear in isolated viewer:\n${towerLogs.join('\n')}\n\nFull console:\n${console_.all.join('\n')}`,
  ).toHaveLength(0);

  await SS(page, '03-no-tower-logs');
});
