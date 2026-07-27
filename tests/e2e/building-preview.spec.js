/**
 * building-preview.spec.ts
 *
 * E2E tests for the current "🎮 Play in 3D" building preview flow:
 *   Overworld Studio opens a building modal
 *   → clicking "🎮 Play in 3D" writes `ttt_building_preview`
 *   → a new `/building-viewer.html` page opens and loads the plan
 *
 * These tests intentionally target the isolated building viewer architecture,
 * not the removed legacy `window.__game.previewBuilding()` path.
 */
import { test, expect } from '@playwright/test';
import { attachFullConsoleCapture } from './helpers';

test.use({ actionTimeout: 60_000 });

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';

const SS = (page, name) =>
    page.screenshot({ path: `tests/e2e/screenshots/bldg-preview-${name}.png` });

async function openStudio(page) {
    await page.goto(`${BASE}/overworld-studio.html`);
    await page.locator('#map-canvas').waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(800);
}

async function openBuildingModal(page) {
    const points = await page.evaluate(() => {
        const canvas = document.getElementById('map-canvas');
        if (!canvas)
            return [];
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + rect.width * 0.5;
        const cy = rect.top + rect.height * 0.5;
        return [
            { x: cx, y: cy },
            { x: cx - rect.width * 0.08, y: cy },
            { x: cx + rect.width * 0.08, y: cy },
            { x: cx, y: cy - rect.height * 0.08 },
            { x: cx, y: cy + rect.height * 0.08 },
            { x: cx - rect.width * 0.06, y: cy - rect.height * 0.06 },
            { x: cx + rect.width * 0.06, y: cy + rect.height * 0.06 },
        ];
    });
    for (const point of points) {
        await page.mouse.dblclick(point.x, point.y);
        await page.waitForTimeout(180);
        if (await page.locator('text=🎮 Play in 3D').first().isVisible())
            return;
    }
    throw new Error('Failed to open building modal from settlement canvas');
}

test.describe('Building Preview (studio → isolated building-viewer handoff)', () => {
    test('Play in 3D opens building-viewer.html and stores a valid preview plan', async ({ page, context }) => {
        const console_ = attachFullConsoleCapture(page);
        await openStudio(page);
        await openBuildingModal(page);

        const popupPromise = context.waitForEvent('page');
        await page.getByText('🎮 Play in 3D').click();

        const popup = await popupPromise;
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForFunction(() => !!window.__buildingViewerReady || !!window.__buildingViewerError, { timeout: 30_000 });

        expect(popup.url()).toContain('/building-viewer.html');

        const storedPlan = await page.evaluate(() => localStorage.getItem('ttt_building_preview'));
        expect(storedPlan, 'studio should persist building preview payload').toBeTruthy();

        const parsed = JSON.parse(storedPlan);
        expect(Object.keys(parsed.rooms).length).toBeGreaterThan(0);
        expect(parsed.startRoomId).toBeTruthy();
        expect(Object.keys(parsed.rooms)).toContain(parsed.startRoomId);

        const viewerError = await popup.evaluate(() => window.__buildingViewerError);
        expect(viewerError).toBeUndefined();

        await SS(page, '01-studio-modal');
        await SS(popup, '02-viewer-opened');

        const codeErrors = console_.errors.filter(e => !String(e).includes('404'));
        expect(codeErrors, `Unexpected studio errors:\n${console_.all.join('\n')}`).toHaveLength(0);

        await popup.close();
    });

    test('viewer popup reaches ready state for the handed-off plan', async ({ page, context }) => {
        await openStudio(page);
        await openBuildingModal(page);

        const popupPromise = context.waitForEvent('page');
        await page.getByText('🎮 Play in 3D').click();
        const popup = await popupPromise;

        await popup.waitForFunction(() => !!window.__buildingViewerReady || !!window.__buildingViewerError, {
            timeout: 30_000,
        });

        const ready = await popup.evaluate(() => !!window.__buildingViewerReady);
        const roomId = await popup.evaluate(() => window.__bvRoomId ?? null);

        expect(ready).toBe(true);
        expect(roomId).toMatch(/_f\d+_r\d+$/);

        await popup.close();
    });

    test('viewer popup stays isolated from tower runtime logs', async ({ page, context }) => {
        await openStudio(page);
        await openBuildingModal(page);

        const popupPromise = context.waitForEvent('page');
        await page.getByText('🎮 Play in 3D').click();
        const popup = await popupPromise;
        const console_ = attachFullConsoleCapture(popup);

        await popup.waitForFunction(() => !!window.__buildingViewerReady || !!window.__buildingViewerError, {
            timeout: 30_000,
        });

        const towerLogs = console_.all.filter(l =>
            l.includes('[PropPlacer]') ||
            l.includes('[StoryRunner]') ||
            l.includes('[tower]') ||
            l.includes('[startGame]') ||
            l.includes('You wake in a tower'));

        expect(towerLogs, `Tower runtime logs must not appear in isolated building viewer:\n${towerLogs.join('\n')}\n\nFull console:\n${console_.all.join('\n')}`).toHaveLength(0);

        const codeErrors = console_.errors.filter(e => !String(e).includes('404'));
        expect(codeErrors, `Unexpected viewer errors:\n${console_.all.join('\n')}`).toHaveLength(0);

        await SS(popup, '03-viewer-isolated');
        await popup.close();
    });

    test('invalid preview payload on building-viewer sets error without crashing', async ({ page }) => {
        const console_ = attachFullConsoleCapture(page);

        await page.addInitScript(() => {
            localStorage.setItem('ttt_building_preview', '{"bad":"json no rooms"}');
        });

        await page.goto(`${BASE}/building-viewer.html`);
        await page.waitForTimeout(1000);

        const viewerError = await page.evaluate(() => window.__buildingViewerError);
        expect(viewerError, 'invalid payload should set __buildingViewerError').toBeTruthy();

        const pageErrors = console_.errors.filter(e => e.startsWith('[pageerror]'));
        expect(pageErrors, `Unexpected uncaught page errors:\n${pageErrors.join('\n')}`).toHaveLength(0);

        await SS(page, '04-invalid-plan');
    });
});