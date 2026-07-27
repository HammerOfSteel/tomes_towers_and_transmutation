/**
 * building-floors.spec.ts
 *
 * E2E tests for building entry, interior exploration, floor transitions
 * (stair-based, like the tower), and exiting back to the overworld.
 *
 * Run: npx playwright test tests/e2e/building-floors.spec.ts --reporter=list
 */
import { test, expect } from '@playwright/test';
import { loadPage, attachErrorCapture } from './helpers';
test.use({ actionTimeout: 60_000 });
const SS = (page, name) => page.screenshot({ path: `tests/e2e/screenshots/bldg-${name}.png`, fullPage: false });
// ── Shared boot helper ────────────────────────────────────────────────────────
async function bootToExterior(page) {
    await loadPage(page);
    await page.evaluate(() => window.__game.quickPlayPrincess({ name: 'Tester', species: 'foxling' }));
    await page.waitForFunction(() => window.__gameStarted === true, { timeout: 60_000 });
    // Give masterKey so exit is allowed, then go exterior
    await page.evaluate(() => window.__game.giveMasterKey?.());
    await page.evaluate(() => window.__game.switchToExterior?.());
    await page.waitForFunction(() => window.__game.getGameMode?.() === 'exterior', { timeout: 20_000 });
    // Settle physics
    await page.waitForTimeout(600);
}
// ── Helper: walk player toward a world position (grid-style key presses) ──────
async function walkToward(page, targetX, targetZ, steps = 12, msPerStep = 120) {
    for (let i = 0; i < steps; i++) {
        const pos = await page.evaluate(() => window.__game.getPlayerPos?.());
        if (!pos)
            break;
        const dx = targetX - pos.x;
        const dz = targetZ - pos.z;
        if (dx * dx + dz * dz < 1.5)
            break; // close enough
        // Determine dominant direction and press corresponding key
        const key = Math.abs(dx) > Math.abs(dz)
            ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft')
            : (dz > 0 ? 'ArrowDown' : 'ArrowUp');
        await page.keyboard.down(key);
        await page.waitForTimeout(msPerStep);
        await page.keyboard.up(key);
    }
}
// ── Tests ─────────────────────────────────────────────────────────────────────
test.describe('single-floor building (cottage)', () => {
    test('walk up, enter, explore, exit — no errors', async ({ page }) => {
        const errors = attachErrorCapture(page);
        await bootToExterior(page);
        // Spawn a 1-floor cottage near player
        const buildingPos = await page.evaluate(() => window.__game.spawnBuildingNearPlayer('cottage', 'thatched', 1));
        expect(buildingPos).toBeTruthy();
        await SS(page, 'cottage-exterior');
        // Walk toward the building
        await walkToward(page, buildingPos.x, buildingPos.z, 20, 100);
        // Wait until near enough for prompt, then press E
        await page.waitForFunction(() => {
            const g = window.__game;
            const pos = g.getPlayerPos?.();
            const bpos = { x: 6, z: 0 }; // approximate spawn offset
            if (!pos)
                return false;
            const dx = pos.x - bpos.x, dz = pos.z - bpos.z;
            return dx * dx + dz * dz < 16;
        }, { timeout: 15_000 });
        await page.keyboard.press('e');
        await SS(page, 'cottage-entering');
        // Wait for fade + interior load
        await page.waitForFunction(() => window.__game.isInBuildingInterior?.() === true, { timeout: 10_000 });
        const floor = await page.evaluate(() => window.__game.getBuildingFloor?.());
        expect(floor).toBe(0);
        const total = await page.evaluate(() => window.__game.getBuildingTotalFloors?.());
        expect(total).toBe(1);
        const stairUp = await page.evaluate(() => window.__game.getBuildingStairUpPos?.());
        expect(stairUp).toBeNull(); // single floor — no stairs
        await SS(page, 'cottage-interior-f0');
        // Walk around a bit
        await page.keyboard.down('ArrowUp');
        await page.waitForTimeout(500);
        await page.keyboard.up('ArrowUp');
        await page.keyboard.down('ArrowLeft');
        await page.waitForTimeout(400);
        await page.keyboard.up('ArrowLeft');
        // Press E to exit
        await page.keyboard.press('e');
        await page.waitForFunction(() => window.__game.isInBuildingInterior?.() === false, { timeout: 10_000 });
        await SS(page, 'cottage-exited');
        expect(errors.filter(e => !e.includes('THREE.WebGL'))).toHaveLength(0);
    });
});
test.describe('multi-floor building (inn, 2 floors)', () => {
    test('enter ground floor, go up stairs, come back down, exit', async ({ page }) => {
        const errors = attachErrorCapture(page);
        await bootToExterior(page);
        // Spawn a 2-floor inn near player
        const buildingPos = await page.evaluate(() => window.__game.spawnBuildingNearPlayer('inn', 'tudor', 2));
        expect(buildingPos).toBeTruthy();
        // Walk toward building
        await walkToward(page, buildingPos.x, buildingPos.z, 24, 100);
        // Wait until proximity is close enough for entry prompt
        await page.waitForFunction(() => {
            const pos = window.__game.getPlayerPos?.();
            if (!pos)
                return false;
            const dx = pos.x - 6, dz = pos.z - 0;
            return dx * dx + dz * dz < 16;
        }, { timeout: 15_000 });
        // Enter the building
        await page.keyboard.press('e');
        await page.waitForFunction(() => window.__game.isInBuildingInterior?.() === true, { timeout: 10_000 });
        // Verify floor 0
        let floor = await page.evaluate(() => window.__game.getBuildingFloor?.());
        expect(floor).toBe(0);
        const total = await page.evaluate(() => window.__game.getBuildingTotalFloors?.());
        expect(total).toBe(2);
        await SS(page, 'inn-floor-0');
        // The stair-up trigger exists on floor 0
        const stairUp = await page.evaluate(() => window.__game.getBuildingStairUpPos?.());
        expect(stairUp).not.toBeNull();
        expect(stairUp.y).toBeGreaterThan(100); // at INTERIOR_Y
        // Teleport player directly to the stair trigger (position from game API)
        await page.evaluate(({ x, y, z }) => {
            window.__game.teleportPlayer?.(x, y + 1.2, z);
        }, stairUp);
        await page.waitForTimeout(300);
        // Press E at the stair
        await page.keyboard.press('e');
        // Wait for floor switch (fade + reload)
        await page.waitForFunction(() => window.__game.getBuildingFloor?.() === 1, { timeout: 12_000 });
        floor = await page.evaluate(() => window.__game.getBuildingFloor?.());
        expect(floor).toBe(1);
        await SS(page, 'inn-floor-1');
        // Floor 1: no stairUp, has stairDown
        const stairUpF1 = await page.evaluate(() => window.__game.getBuildingStairUpPos?.());
        expect(stairUpF1).toBeNull();
        const stairDown = await page.evaluate(() => window.__game.getBuildingStairDownPos?.());
        expect(stairDown).not.toBeNull();
        // Go back down
        await page.evaluate(({ x, y, z }) => {
            window.__game.teleportPlayer?.(x, y + 1.2, z);
        }, stairDown);
        await page.waitForTimeout(300);
        await page.keyboard.press('e');
        await page.waitForFunction(() => window.__game.getBuildingFloor?.() === 0, { timeout: 12_000 });
        expect(await page.evaluate(() => window.__game.getBuildingFloor?.())).toBe(0);
        await SS(page, 'inn-back-floor-0');
        // Exit the building
        await page.keyboard.press('e');
        await page.waitForFunction(() => window.__game.isInBuildingInterior?.() === false, { timeout: 10_000 });
        await SS(page, 'inn-exited');
        expect(errors.filter(e => !e.includes('THREE.WebGL'))).toHaveLength(0);
    });
});
test.describe('building variety', () => {
    const BUILDINGS = [
        { kind: 'house', style: 'timber', floors: 1 },
        { kind: 'blacksmith', style: 'stone', floors: 1 },
        { kind: 'chapel', style: 'gothic', floors: 2 },
        { kind: 'villa', style: 'vampiric', floors: 3 },
        { kind: 'apothecary', style: 'arcane', floors: 2 },
    ];
    for (const { kind, style, floors } of BUILDINGS) {
        test(`${kind}/${style} (${floors}f) — enter, verify floor count, exit`, async ({ page }) => {
            const errors = attachErrorCapture(page);
            await bootToExterior(page);
            const buildingPos = await page.evaluate(([k, s, f]) => window.__game.spawnBuildingNearPlayer(k, s, f), [kind, style, floors]);
            expect(buildingPos).toBeTruthy();
            // Close-range teleport then enter
            await page.evaluate(([bx, bz]) => window.__game.teleportPlayer?.(bx - 3, 1, bz), [buildingPos.x, buildingPos.z]);
            await page.waitForTimeout(400);
            await page.keyboard.press('e');
            await page.waitForFunction(() => window.__game.isInBuildingInterior?.() === true, { timeout: 10_000 });
            const reportedTotal = await page.evaluate(() => window.__game.getBuildingTotalFloors?.());
            expect(reportedTotal).toBe(floors);
            await SS(page, `${kind}-${style}-f${floors}`);
            // Exit
            await page.keyboard.press('e');
            await page.waitForFunction(() => window.__game.isInBuildingInterior?.() === false, { timeout: 10_000 });
            expect(errors.filter(e => !e.includes('THREE.WebGL'))).toHaveLength(0);
        });
    }
});
