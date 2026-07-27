import { test, expect } from '@playwright/test';
import { attachFullConsoleCapture } from './helpers';
test.use({ actionTimeout: 60_000 });
const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
async function openStudio(page) {
    await page.goto(`${BASE}/overworld-studio.html`);
    await page.locator('#map-canvas').waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(1000);
}
test('realm view switches trigger transition flash instrumentation', async ({ page }) => {
    const console_ = attachFullConsoleCapture(page);
    await openStudio(page);
    await page.click('.studio-tab[data-mode="realm"]');
    await page.waitForTimeout(900);
    const before = await page.evaluate(() => window.__owStudioTransitionCount ?? 0);
    await page.click('#realm-view-pills [data-view="planet"]');
    await page.waitForFunction((prev) => (window.__owStudioTransitionCount ?? 0) > prev, before);
    await expect(page.locator('#studio-transition-flash')).toBeVisible();
    await page.click('#realm-view-pills [data-view="hex"]');
    await page.waitForTimeout(150);
    await page.click('#realm-view-pills [data-view="map"]');
    await page.waitForTimeout(150);
    const state = await page.evaluate(() => ({
        count: window.__owStudioTransitionCount ?? 0,
        label: window.__owStudioLastTransitionLabel ?? null,
    }));
    expect(state.count).toBeGreaterThan(before);
    expect(state.label).toBe('Surface Map');
    const codeErrors = console_.errors.filter(e => {
        const msg = String(e);
        return !msg.includes('404') && !msg.includes('Failed to load resource');
    });
    expect(codeErrors, `Unexpected console/page errors:\n${console_.all.join('\n')}`).toHaveLength(0);
});
test('realm drill-down triggers transition flash instrumentation', async ({ page }) => {
    const console_ = attachFullConsoleCapture(page);
    await openStudio(page);
    await page.click('.studio-tab[data-mode="realm"]');
    await page.waitForTimeout(900);
    const before = await page.evaluate(() => window.__owStudioTransitionCount ?? 0);
    const clickPoint = await page.evaluate(() => {
        const canvas = document.getElementById('map-canvas');
        const data = window.__owStudioCurrentRealmData ?? null;
        if (!canvas || !data?.settlements?.length)
            return null;
        const W = data.W;
        const H = data.H;
        const settlement = data.settlements[0];
        const CELL = Math.max(2, Math.min(Math.floor((canvas.width - 4) / W), Math.floor((canvas.height - 4) / H)));
        const offX = Math.floor((canvas.width - W * CELL) / 2);
        const offY = Math.floor((canvas.height - H * CELL) / 2);
        const canvasX = offX + (settlement.x + 0.5) * CELL;
        const canvasY = offY + (settlement.y + 0.5) * CELL;
        const rect = canvas.getBoundingClientRect();
        return {
            x: rect.left + (canvasX / canvas.width) * rect.width,
            y: rect.top + (canvasY / canvas.height) * rect.height,
        };
    });
    expect(clickPoint).not.toBeNull();
    await page.mouse.click(clickPoint.x, clickPoint.y);
    await page.waitForFunction((prev) => (window.__owStudioTransitionCount ?? 0) > prev, before);
    const state = await page.evaluate(() => ({
        count: window.__owStudioTransitionCount ?? 0,
        label: window.__owStudioLastTransitionLabel ?? null,
    }));
    expect(state.count).toBeGreaterThan(before);
    expect(String(state.label ?? '')).toContain('🏙');
    const codeErrors = console_.errors.filter(e => {
        const msg = String(e);
        return !msg.includes('404') && !msg.includes('Failed to load resource');
    });
    expect(codeErrors, `Unexpected console/page errors:\n${console_.all.join('\n')}`).toHaveLength(0);
});
