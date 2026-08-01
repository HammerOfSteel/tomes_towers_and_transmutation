/**
 * helpers.ts — shared utilities for e2e gameplay tests.
 *
 * All helpers interact with the game via the `window.__game` debug object
 * that main.ts exposes in DEV builds.  The object is guaranteed to exist
 * once the page has finished loading and Vite HMR has settled.
 */

import type { Page } from '@playwright/test';

// ── Types that mirror what window.__game exposes ──────────────────────────

export interface PlayerPos { x: number; y: number; z: number; }

// ── Bootstrap helpers ─────────────────────────────────────────────────────

/**
 * Load the game page and wait until the Three.js canvas and the __game debug
 * object are both present.  Returns when the game is idle on the main menu.
 */
export async function loadPage(page: Page): Promise<void> {
  await page.goto('/');
  // Wait for canvas to be visible (means WebGL initialised)
  await page.locator('#game-canvas').waitFor({ state: 'visible', timeout: 20_000 });
  // Wait for __game hook (set after WASM init + game loop wired)
  await page.waitForFunction(() => !!(window as any).__game, { timeout: 20_000 });
}

/**
 * Start the game with a fixed deterministic seed so every run produces the
 * same dungeon and overworld layout.  Hides the main menu and starts the
 * game loop.
 */
export async function startGame(page: Page, seed = 0xDEAD_BEEF): Promise<void> {
  await page.evaluate((s) => (window as any).__game.startGame(s), seed);
  // Give physics + first frame a moment to settle
  await page.waitForTimeout(600);
}

/**
 * Switch to the exterior overworld and wait for physics to settle.
 * Captures a screenshot named `<label>.png` inside tests/e2e/screenshots/.
 */
export async function goExterior(page: Page, screenshotLabel = 'exterior'): Promise<void> {
  await page.evaluate(() => (window as any).__game.switchToExterior());
  // Wait two animation frames + physics settle time (heightfield, spawn)
  await page.waitForTimeout(800);
  await page.screenshot({
    path: `tests/e2e/screenshots/${screenshotLabel}.png`,
    fullPage: false,
  });
}

// ── Query helpers ─────────────────────────────────────────────────────────

export async function getPlayerPos(page: Page): Promise<PlayerPos> {
  return page.evaluate(() => (window as any).__game.getPlayerPos()) as Promise<PlayerPos>;
}

export async function getGameMode(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).__game.getGameMode()) as Promise<string>;
}

export async function isPlayerVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as any).__game.isPlayerVisible()) as Promise<boolean>;
}

export async function teleportPlayer(page: Page, x: number, y: number, z: number): Promise<void> {
  await page.evaluate(([px, py, pz]) => (window as any).__game.teleportPlayer(px, py, pz), [x, y, z]);
  await page.waitForTimeout(200); // one physics step settle
}

export async function isNearTower(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as any).__game.isNearTower()) as Promise<boolean>;
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
export function attachErrorCapture(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('console',   (m) => {
    if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`);
  });
  return errors;
}

/**
 * Take a screenshot and, if there are any captured errors, fail the test.
 * Convenience wrapper combining screenshot + error assertion.
 */
export async function screenshotAndAssertClean(
  page:      import('@playwright/test').Page,
  errors:    string[],
  ssPath:    string,
): Promise<void> {
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
export function attachFullConsoleCapture(page: import('@playwright/test').Page): {
  all:    string[];
  errors: string[];
  has:    (substring: string) => boolean;
} {
  const all:    string[] = [];
  const errors: string[] = [];

  page.on('pageerror', (e) => {
    const msg = `[pageerror] ${e.message}`;
    all.push(msg);
    errors.push(msg);
  });
  page.on('console', (m) => {
    const msg = `[${m.type()}] ${m.text()}`;
    all.push(msg);
    if (m.type() === 'error' || m.type() === 'assert') errors.push(msg);
  });

  return {
    all,
    errors,
    has: (sub: string) => all.some(line => line.includes(sub)),
  };
}

// ── Physics settle helper ─────────────────────────────────────────────────

/**
 * Poll player Y until it stops changing (physics settled to ground) or
 * until `maxMs` have elapsed.  Returns the final Y value.
 */
export async function waitForGrounded(page: Page, maxMs = 3_000): Promise<number> {
  const deadline = Date.now() + maxMs;
  let prevY = NaN;
  while (Date.now() < deadline) {
    const pos = await getPlayerPos(page);
    if (!isNaN(prevY) && Math.abs(pos.y - prevY) < 0.005) return pos.y;
    prevY = pos.y;
    await page.waitForTimeout(80);
  }
  return prevY;
}
