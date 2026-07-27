/**
 * helpers.ts — shared utilities for e2e gameplay tests.
 *
 * All helpers interact with the game via the `window.__game` debug object
 * that main.ts exposes in DEV builds.  The object is guaranteed to exist
 * once the page has finished loading and Vite HMR has settled.
 */
// ── Bootstrap helpers ─────────────────────────────────────────────────────
/**
 * Load the game page and wait until the Three.js canvas and the __game debug
 * object are both present.  Returns when the game is idle on the main menu.
 */
export async function loadPage(page) {
    await page.goto('/');
    // Wait for canvas to be visible (means WebGL initialised)
    await page.locator('#game-canvas').waitFor({ state: 'visible', timeout: 20_000 });
    // Wait for __game hook (set after WASM init + game loop wired)
    await page.waitForFunction(() => !!window.__game, { timeout: 20_000 });
}
/**
 * Start the game with a fixed deterministic seed so every run produces the
 * same dungeon and overworld layout.  Hides the main menu and starts the
 * game loop.
 */
export async function startGame(page, seed = 0xDEAD_BEEF) {
    await page.evaluate((s) => window.__game.startGame(s), seed);
    // Give physics + first frame a moment to settle
    await page.waitForTimeout(600);
}
/**
 * Switch to the exterior overworld and wait for physics to settle.
 * Captures a screenshot named `<label>.png` inside tests/e2e/screenshots/.
 */
export async function goExterior(page, screenshotLabel = 'exterior') {
    await page.evaluate(() => window.__game.switchToExterior());
    // Wait two animation frames + physics settle time (heightfield, spawn)
    await page.waitForTimeout(800);
    await page.screenshot({
        path: `tests/e2e/screenshots/${screenshotLabel}.png`,
        fullPage: false,
    });
}
// ── Query helpers ─────────────────────────────────────────────────────────
export async function getPlayerPos(page) {
    return page.evaluate(() => window.__game.getPlayerPos());
}
export async function getGameMode(page) {
    return page.evaluate(() => window.__game.getGameMode());
}
export async function isPlayerVisible(page) {
    return page.evaluate(() => window.__game.isPlayerVisible());
}
export async function teleportPlayer(page, x, y, z) {
    await page.evaluate(([px, py, pz]) => window.__game.teleportPlayer(px, py, pz), [x, y, z]);
    await page.waitForTimeout(200); // one physics step settle
}
export async function isNearTower(page) {
    return page.evaluate(() => window.__game.isNearTower());
}
// ── F4: Console / pageerror capture ──────────────────────────────────────
/**
 * Attach console-error + pageerror listeners to the page.
 * Returns an array that accumulates all error messages.
 * Pass the array to `expect(errors).toHaveLength(0)` in your test.
 *
 * Usage:
 *   const errors = attachErrorCapture(page);
 *   // … test actions …
 *   expect(errors, `Unexpected errors: ${errors.join('\n')}`).toHaveLength(0);
 */
export function attachErrorCapture(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
    page.on('console', (m) => {
        if (m.type() === 'error')
            errors.push(`[console.error] ${m.text()}`);
    });
    return errors;
}
/**
 * Take a screenshot and, if there are any captured errors, fail the test.
 * Convenience wrapper combining screenshot + error assertion.
 */
export async function screenshotAndAssertClean(page, errors, ssPath) {
    await page.screenshot({ path: ssPath, fullPage: false });
    if (errors.length > 0) {
        throw new Error(`Page errors detected:\n${errors.join('\n')}`);
    }
}
/**
 * Attach ALL console messages (every type) + pageerrors to a log array.
 * Also tracks errors separately for easy assertion.
 *
 * Returns `{ all, errors }`:
 *   - `all`    — every console line as "[type] text"
 *   - `errors` — only lines where type === 'error' or pageerror
 *
 * Usage:
 *   const { all, errors } = attachFullConsoleCapture(page);
 *   // ... test actions ...
 *   // On failure, print `all.join('\n')` for a full trace.
 *   expect(errors, `Console errors:\n${all.join('\n')}`).toHaveLength(0);
 */
export function attachFullConsoleCapture(page) {
    const all = [];
    const errors = [];
    page.on('pageerror', (e) => {
        const msg = `[pageerror] ${e.message}`;
        all.push(msg);
        errors.push(msg);
    });
    page.on('console', (m) => {
        const msg = `[${m.type()}] ${m.text()}`;
        all.push(msg);
        if (m.type() === 'error' || m.type() === 'assert')
            errors.push(msg);
    });
    return {
        all,
        errors,
        has: (sub) => all.some(line => line.includes(sub)),
    };
}
// ── Physics settle helper ─────────────────────────────────────────────────
/**
 * Poll player Y until it stops changing (physics settled to ground) or
 * until `maxMs` have elapsed.  Returns the final Y value.
 */
export async function waitForGrounded(page, maxMs = 3_000) {
    const deadline = Date.now() + maxMs;
    let prevY = NaN;
    while (Date.now() < deadline) {
        const pos = await getPlayerPos(page);
        if (!isNaN(prevY) && Math.abs(pos.y - prevY) < 0.005)
            return pos.y;
        prevY = pos.y;
        await page.waitForTimeout(80);
    }
    return prevY;
}
