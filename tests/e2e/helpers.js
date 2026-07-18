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
