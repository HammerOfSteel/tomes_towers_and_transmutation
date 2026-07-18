/**
 * Sandbox visual tests.
 *
 * Loads /sandbox.html, waits for window.__sandbox.ready, then:
 *  • Assembles named buildings via the Playwright API
 *  • Takes named screenshots that you can visually inspect
 *  • Verifies structural invariants (correct tile counts, etc.)
 *
 * Screenshots land in  tests/e2e/screenshots/sandbox-*.png
 *
 * Run:
 *   npx playwright test tests/e2e/sandbox.test.ts --headed
 * Or headless (CI):
 *   npx playwright test tests/e2e/sandbox.test.ts
 */
import { test, expect } from '@playwright/test';
// ── Helpers ───────────────────────────────────────────────────────────────────
const shot = (page, name) => page.screenshot({ path: `tests/e2e/screenshots/sandbox-${name}.png` });
async function loadSandbox(page) {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/sandbox.html');
    await page.waitForFunction(() => window.__sandbox?.ready === true, { timeout: 45_000 });
    // Let the renderer paint at least one complete frame
    await page.waitForTimeout(350);
    return errors;
}
async function clearAndSetCamera(page, preset = 'iso') {
    await page.evaluate(() => window.__sandbox.clearAll());
    await page.evaluate((p) => window.__sandbox.setCameraPreset(p), preset);
    await page.waitForTimeout(200);
}
// ── Tests ─────────────────────────────────────────────────────────────────────
test.describe('Sandbox — interactive tile builder', () => {
    test.setTimeout(120_000);
    // ── 00: Loads cleanly ──────────────────────────────────────────────────────
    test('loads with no JS errors and shows Ready status', async ({ page }) => {
        const errors = await loadSandbox(page);
        const status = await page.textContent('#status-bar');
        expect(status).toContain('Ready');
        expect(errors, 'No JS errors on load').toHaveLength(0);
        await shot(page, '00-empty-scene');
    });
    // ── 01: Single tile placement ──────────────────────────────────────────────
    test('places a single wall tile and reports it in getTiles()', async ({ page }) => {
        await loadSandbox(page);
        await clearAndSetCamera(page);
        await page.evaluate(() => window.__sandbox.placeTile('/assets/buildings/wall.glb', 0, 0, 0, 0));
        await page.waitForTimeout(400);
        const tiles = await page.evaluate(() => window.__sandbox.getTiles());
        expect(tiles).toHaveLength(1);
        expect(tiles[0].path).toBe('/assets/buildings/wall.glb');
        expect(tiles[0].col).toBe(0);
        expect(tiles[0].row).toBe(0);
        expect(tiles[0].floor).toBe(0);
        await shot(page, '01-single-wall');
    });
    // ── 02: Floor levels ───────────────────────────────────────────────────────
    test('places tiles on multiple floors (wall stack)', async ({ page }) => {
        await loadSandbox(page);
        await clearAndSetCamera(page, 'front');
        // Stack 4 walls vertically
        for (let f = 0; f < 4; f++) {
            await page.evaluate((floor) => window.__sandbox.placeTile('/assets/buildings/wall.glb', 0, 0, floor), f);
        }
        await page.waitForTimeout(500);
        const tiles = await page.evaluate(() => window.__sandbox.getTiles());
        expect(tiles).toHaveLength(4);
        await shot(page, '02-floor-stack');
    });
    // ── 03: Cottage preset ────────────────────────────────────────────────────
    test('cottage building assembly', async ({ page }) => {
        await loadSandbox(page);
        await clearAndSetCamera(page);
        await page.evaluate(() => window.__sandbox.assembleBuilding('cottage', 1, 0, 0));
        await page.waitForTimeout(700);
        const status = await page.textContent('#status-bar');
        expect(status).toContain('cottage');
        await shot(page, '03-cottage');
    });
    // ── 04: Inn preset ────────────────────────────────────────────────────────
    test('inn building assembly (2 floors)', async ({ page }) => {
        await loadSandbox(page);
        await clearAndSetCamera(page);
        await page.evaluate(() => window.__sandbox.assembleBuilding('inn', 2, 0, 0));
        await page.waitForTimeout(700);
        await shot(page, '04-inn');
    });
    // ── 05: Multiple building types ───────────────────────────────────────────
    test('six building types arranged in a row', async ({ page }) => {
        await loadSandbox(page);
        await clearAndSetCamera(page);
        const types = ['cottage', 'inn', 'smithy', 'tavern', 'guard_tower', 'market_stall'];
        for (let i = 0; i < types.length; i++) {
            await page.evaluate(([type, col]) => window.__sandbox.assembleBuilding(type, col + 1, col * 6 - 15, 0), [types[i], i]);
        }
        await page.evaluate(() => window.__sandbox.setCamera(0, 32, 48, 0, 0, 0));
        await page.waitForTimeout(800);
        await shot(page, '05-building-row');
    });
    // ── 06: Castle tower modules ──────────────────────────────────────────────
    test('castle tower 7-layer stack', async ({ page }) => {
        await loadSandbox(page);
        await clearAndSetCamera(page, 'front');
        const modules = [
            '/assets/castle/tower-square-base.glb',
            '/assets/castle/tower-square-mid-door.glb',
            '/assets/castle/tower-square-mid.glb',
            '/assets/castle/tower-square-mid-windows.glb',
            '/assets/castle/tower-square-mid.glb',
            '/assets/castle/tower-square-top.glb',
            '/assets/castle/tower-square-roof.glb',
        ];
        for (let i = 0; i < modules.length; i++) {
            await page.evaluate(([path, floor]) => window.__sandbox.placeTile(path, 0, 0, floor), [modules[i], i]);
        }
        // Tilt camera slightly for a better view of the tower
        await page.evaluate(() => window.__sandbox.setCamera(8, 14, 22, 0, 7, 0));
        await page.waitForTimeout(600);
        const tiles = await page.evaluate(() => window.__sandbox.getTiles());
        expect(tiles).toHaveLength(7);
        await shot(page, '06-castle-tower');
    });
    // ── 07: Road + path tiles ─────────────────────────────────────────────────
    test('road intersection + surrounding paths', async ({ page }) => {
        await loadSandbox(page);
        await clearAndSetCamera(page, 'top');
        // Central 3×3 road grid
        for (let r = -1; r <= 1; r++) {
            for (let c = -1; c <= 1; c++) {
                await page.evaluate(([col, row]) => window.__sandbox.placeTile('/assets/town/road.glb', col, row, 0), [c, r]);
            }
        }
        // Surrounding path tiles
        for (let c = -3; c <= 3; c++) {
            await page.evaluate(([col]) => window.__sandbox.placeTile('/assets/nature/ground_pathStraight.glb', col, 2, 0, 0), [c]);
            await page.evaluate(([col]) => window.__sandbox.placeTile('/assets/nature/ground_pathStraight.glb', col, -2, 0, 0), [c]);
        }
        await page.waitForTimeout(600);
        await shot(page, '07-roads-and-paths');
    });
    // ── 08: Dungeon corridors ─────────────────────────────────────────────────
    test('dungeon corridor layout', async ({ page }) => {
        await loadSandbox(page);
        await clearAndSetCamera(page, 'top');
        const layout = [
            // centre room
            { path: '/assets/dungeon/room-small.glb', col: 0, row: 0 },
            // corridors radiating out
            { path: '/assets/dungeon/corridor.glb', col: 0, row: -1 },
            { path: '/assets/dungeon/corridor.glb', col: 0, row: 1 },
            { path: '/assets/dungeon/corridor.glb', col: -1, row: 0 },
            { path: '/assets/dungeon/corridor.glb', col: 1, row: 0 },
            // end caps
            { path: '/assets/dungeon/corridor-end.glb', col: 0, row: -2 },
            { path: '/assets/dungeon/corridor-end.glb', col: 0, row: 2 },
            { path: '/assets/dungeon/gate.glb', col: -2, row: 0 },
            { path: '/assets/dungeon/gate-door.glb', col: 2, row: 0 },
        ];
        for (const tile of layout) {
            await page.evaluate(({ path, col, row }) => window.__sandbox.placeTile(path, col, row, 0), tile);
        }
        await page.waitForTimeout(600);
        await shot(page, '08-dungeon-layout');
    });
    // ── 09: Annotation overlay ────────────────────────────────────────────────
    test('annotation overlay draws on top of the 3D scene', async ({ page }) => {
        await loadSandbox(page);
        await clearAndSetCamera(page);
        // Place a building to annotate
        await page.evaluate(() => window.__sandbox.assembleBuilding('cottage', 1, 0, 0));
        await page.waitForTimeout(500);
        // Enable annotation via the checkbox
        await page.locator('#annot-toggle').check();
        await page.waitForTimeout(100);
        const isActive = await page.evaluate(() => document.getElementById('annotation-canvas')?.classList.contains('active'));
        expect(isActive).toBe(true);
        // Draw a red circle annotation programmatically on the annotation canvas
        await page.evaluate(() => {
            const canvas = document.getElementById('annotation-canvas');
            const ctx = canvas.getContext('2d');
            ctx.beginPath();
            ctx.arc(canvas.width / 2, canvas.height / 2, 80, 0, Math.PI * 2);
            ctx.strokeStyle = '#ff3333';
            ctx.lineWidth = 4;
            ctx.stroke();
            // Arrow pointing at building
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2, canvas.height / 2 - 80);
            ctx.lineTo(canvas.width / 2 + 60, canvas.height / 2 - 140);
            ctx.stroke();
        });
        await shot(page, '09-annotation-overlay');
        // Disable annotation
        await page.locator('#annot-toggle').uncheck();
    });
    // ── 10: clearAll removes all tiles ────────────────────────────────────────
    test('clearAll removes all tiles from scene', async ({ page }) => {
        await loadSandbox(page);
        await page.evaluate(() => window.__sandbox.assembleBuilding('cottage', 1, 0, 0));
        await page.waitForTimeout(400);
        let tiles = await page.evaluate(() => window.__sandbox.getTiles());
        expect(tiles.length).toBeGreaterThan(0);
        await page.evaluate(() => window.__sandbox.clearAll());
        await page.waitForTimeout(100);
        tiles = await page.evaluate(() => window.__sandbox.getTiles());
        expect(tiles).toHaveLength(0);
        await shot(page, '10-after-clear');
    });
});
