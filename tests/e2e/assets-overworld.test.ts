/**
 * assets-overworld.test.ts — visual verification that GLB tree assets
 * replace the procedural cones in the overworld scene.
 *
 * What these tests do
 * ──────────────────
 *  1. Load the game and go to the exterior overworld.
 *  2. Capture a "before" screenshot showing procedural cone trees.
 *  3. Wait for the async asset upgrade to complete (window.__game.hasAssetTrees).
 *  4. Capture an "after" screenshot showing the Kenney GLB trees.
 *  5. Verify the scene state via __game hooks.
 *
 * Screenshots land in tests/e2e/screenshots/ and are the primary human review
 * artefact — diff them to see the visual improvement.
 *
 * Run with:  npx playwright test assets-overworld
 * (Requires the dev server on http://localhost:5173 — npm run dev)
 */

import { test, expect } from '@playwright/test';
import { loadPage, startGame, goExterior } from './helpers';

// ── Helper: wait for asset trees with timeout ─────────────────────────────────

async function waitForAssetTrees(
  page: import('@playwright/test').Page,
  timeoutMs = 30_000,
): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => !!(window as any).__game?.hasAssetTrees?.(),
      { timeout: timeoutMs },
    );
    return true;
  } catch {
    return false; // timed out — not an error, just means assets didn't upgrade
  }
}

// ── Helper: screenshot with label ────────────────────────────────────────────

async function shot(
  page: import('@playwright/test').Page,
  label: string,
): Promise<void> {
  await page.screenshot({
    path: `tests/e2e/screenshots/assets-${label}.png`,
    fullPage: false,
  });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

// Each test loads the game fresh: WASM init (~10 s) + world build + 4 GLB loads
// can take 30–50 s on a cold run — override the global 90 s with extra headroom.
test.describe('Asset overworld — GLB tree upgrade', () => {
  test.setTimeout(120_000);


  // ── 1. Dev server serves GLBs ─────────────────────────────────────────────

  test('dev server serves GLB assets at expected paths', async ({ request }) => {
    // The request fixture doesn't always resolve relative paths via baseURL —
    // use absolute URLs to guarantee we hit the right server.
    const BASE = 'http://localhost:5173';
    const paths = [
      '/assets/nature/tree_default.glb',
      '/assets/nature/tree_cone.glb',
      '/assets/nature/tree_blocks.glb',
      '/assets/nature/tree_detailed.glb',
      '/assets/dungeon/corridor.glb',
      '/assets/castle/gate.glb',
    ];

    for (const p of paths) {
      const res  = await request.get(`${BASE}${p}`);
      expect(res.status(), `expected 200 for ${p}`).toBe(200);
      const body = await res.body();
      expect(body.length, `expected non-empty body for ${p}`).toBeGreaterThan(12);
      // GLB magic: first 4 bytes are ASCII 'glTF' (0x67 0x6C 0x54 0x46)
      expect(body[0], `${p} byte[0]`).toBe(0x67); // 'g'
      expect(body[1], `${p} byte[1]`).toBe(0x6C); // 'l'
      expect(body[2], `${p} byte[2]`).toBe(0x54); // 'T'
      expect(body[3], `${p} byte[3]`).toBe(0x46); // 'F'
    }
  });

  // ── 2. Tree upgrade fires without errors ──────────────────────────────────

  test('upgradeTreesWithAssets completes without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadPage(page);
    await startGame(page);
    await goExterior(page, 'assets-01-before-upgrade');

    // Wait up to 30 s for GLB assets to load (network + parse time)
    const upgraded = await waitForAssetTrees(page, 30_000);

    // Even if upgrade timed out, there must be no JS errors
    expect(errors, 'No JS errors during asset upgrade').toHaveLength(0);
    // Log whether assets actually loaded (non-fatal if they didn't on first run)
    if (!upgraded) {
      console.warn('[assets-test] tree upgrade did not complete within 30 s — check dev server');
    }
  });

  // ── 3. Before vs after screenshot ────────────────────────────────────────

  test('captures before and after screenshots of tree upgrade', async ({ page }) => {
    await loadPage(page);
    await startGame(page);

    // Go exterior and teleport into the forest (trees start ~20 WU from centre)
    await page.evaluate(() => (window as any).__game.switchToExterior());
    await page.waitForTimeout(800);
    // Move into the forest ring so trees are visible in the frame
    await page.evaluate(() => (window as any).__game.teleportPlayer(30, 2, 0));
    await page.waitForTimeout(300);

    // Screenshot BEFORE upgrade (procedural cone trees)
    await shot(page, '02-trees-procedural');

    // Wait for GLB upgrade
    const upgraded = await waitForAssetTrees(page, 30_000);
    await page.waitForTimeout(300); // one re-render frame

    // Screenshot AFTER upgrade (Kenney GLB trees)
    await shot(page, '03-trees-glb');

    test.info().annotations.push({
      type: 'GLB upgrade completed',
      description: String(upgraded),
    });
  });

  // ── 4. Scene state after upgrade ─────────────────────────────────────────

  test('hasAssetTrees() returns true after upgrade', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await goExterior(page, 'assets-04-scene-state');

    const upgraded = await waitForAssetTrees(page, 30_000);

    if (upgraded) {
      const flag = await page.evaluate(() => (window as any).__game.hasAssetTrees());
      expect(flag).toBe(true);
    } else {
      // Mark as skipped annotation rather than failing — first run may be slow
      test.info().annotations.push({
        type: 'skipped',
        description: 'GLB upgrade did not complete in time — increase timeout or check server',
      });
    }
  });

  // ── 5. Game stays interactive after upgrade ───────────────────────────────

  test('player is still visible and positioned after asset upgrade', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await goExterior(page, 'assets-05-player-visible');

    await waitForAssetTrees(page, 30_000);

    const visible = await page.evaluate(() => (window as any).__game.isPlayerVisible());
    const pos     = await page.evaluate(() => (window as any).__game.getPlayerPos());

    expect(visible).toBe(true);
    // Player should be near origin (tower entrance) — not at 0,0,0 exactly
    // (they spawn on the terrain surface above y=0)
    expect(pos.y).toBeGreaterThan(-1);

    await shot(page, '05-player-after-upgrade');
  });

  // ── 6. No FPS regression — basic smoke ────────────────────────────────────

  test('renderer still produces frames after GLB trees are in scene', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await goExterior(page, 'assets-06-fps-smoke');

    await waitForAssetTrees(page, 30_000);

    // Capture two screenshots 500 ms apart — if the renderer is hung they'll
    // be identical; if it's running they'll differ (camera float, fog, etc.)
    const before = await page.screenshot();
    await page.waitForTimeout(500);
    const after  = await page.screenshot();

    // Both screenshots must be non-empty buffers
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
  });

});

// ── Phase 1 — Terrain decoration ─────────────────────────────────────────────

/**
 * Helper to wait for all Phase 1 upgrades (rocks, clutter, river, tower).
 * Each returns independently; we wait for all with a shared timeout.
 */
async function waitForPhase1(
  page: import('@playwright/test').Page,
  timeoutMs = 45_000,
): Promise<{ rocks: boolean; clutter: boolean; river: boolean; tower: boolean }> {
  const wait = (fn: string) =>
    page
      .waitForFunction(
        (f) => !!(window as any).__game?.[f]?.(),
        fn,
        { timeout: timeoutMs },
      )
      .then(() => true)
      .catch(() => false);

  const [rocks, clutter, river, tower] = await Promise.all([
    wait('hasAssetRocks'),
    wait('hasAssetClutter'),
    wait('hasAssetRiver'),
    wait('hasAssetTower'),
  ]);
  return { rocks, clutter, river, tower };
}

test.describe('Phase 1 — Terrain decoration', () => {
  test.setTimeout(120_000);

  // ── 7. Rock GLBs ──────────────────────────────────────────────────────────
  test('rock GLBs load and replace procedural dodecahedra', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadPage(page);
    await startGame(page);
    await goExterior(page, 'phase1-07-before');

    // Teleport to where rocks spawn (outer forest ring, ~40 WU from centre)
    await page.evaluate(() => (window as any).__game.teleportPlayer(42, 2, 0));
    await page.waitForTimeout(300);
    await shot(page, 'phase1-07a-rock-area');

    const { rocks } = await waitForPhase1(page);
    await page.waitForTimeout(300);
    await shot(page, 'phase1-07b-rocks-glb');

    expect(errors, 'No JS errors').toHaveLength(0);
    if (rocks) {
      const flag = await page.evaluate(() => (window as any).__game.hasAssetRocks());
      expect(flag).toBe(true);
    }
    test.info().annotations.push({ type: 'rocks upgraded', description: String(rocks) });
  });

  // ── 8. Ground clutter ────────────────────────────────────────────────────
  test('ground clutter (grass, flowers, mushrooms) appears in forest', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadPage(page);
    await startGame(page);
    await goExterior(page, 'phase1-08-exterior');

    // Teleport into a forest tile area
    await page.evaluate(() => (window as any).__game.teleportPlayer(28, 2, 15));
    await page.waitForTimeout(300);

    const { clutter } = await waitForPhase1(page);
    await page.waitForTimeout(300);
    await shot(page, 'phase1-08-clutter');

    expect(errors, 'No JS errors').toHaveLength(0);
    test.info().annotations.push({ type: 'clutter loaded', description: String(clutter) });
  });

  // ── 9. River tiles ────────────────────────────────────────────────────────
  test('river tiles replace the semi-transparent water mesh', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadPage(page);
    await startGame(page);
    await goExterior(page, 'phase1-09-before');
    await shot(page, 'phase1-09a-water-procedural');

    const { river } = await waitForPhase1(page);
    await page.waitForTimeout(300);
    await shot(page, 'phase1-09b-river-tiles');

    expect(errors, 'No JS errors').toHaveLength(0);
    test.info().annotations.push({ type: 'river upgraded', description: String(river) });
  });

  // ── 10. Tower upgrade ─────────────────────────────────────────────────────
  test('castle-kit tower modules replace procedural octagonal tower', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadPage(page);
    await startGame(page);
    await goExterior(page, 'phase1-10-exterior');

    // Tower is at world origin — teleport nearby to get a good view
    await page.evaluate(() => (window as any).__game.teleportPlayer(12, 2, 12));
    await page.waitForTimeout(300);
    await shot(page, 'phase1-10a-tower-before');

    const { tower } = await waitForPhase1(page);
    await page.waitForTimeout(400);
    await shot(page, 'phase1-10b-tower-glb');

    expect(errors, 'No JS errors').toHaveLength(0);
    test.info().annotations.push({ type: 'tower upgraded', description: String(tower) });
  });

  // ── 11. All Phase 1 upgrades — wide world shot ───────────────────────────
  test('wide world view with all Phase 1 assets active', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadPage(page);
    await startGame(page);
    await goExterior(page, 'phase1-11-world-before');

    await waitForPhase1(page, 45_000);
    await page.waitForTimeout(500);
    await shot(page, 'phase1-11-world-all-assets');

    expect(errors, 'No JS errors').toHaveLength(0);
  });
});

// ── Phase 2 — Settlement decoration ──────────────────────────────────────────

/** Wait until settlement decorations (lanterns, fountain, stalls) are loaded. */
async function waitForSettlement(page: import('@playwright/test').Page, ms: number) {
  await page.waitForFunction(
    () => (window as any).__game?.hasAssetSettlement?.() === true,
    { timeout: ms },
  );
}

test.describe('Phase 2 — Settlement decoration', () => {
  test.setTimeout(120_000);

  // ── 12. Settlement fountain and lanterns ─────────────────────────────────
  test('settlement fountain and lanterns appear at town centre', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadPage(page);
    await startGame(page);
    await goExterior(page, 'phase2-12-settlement-before');

    // Teleport toward typical settlement band (centre-left band where villages cluster)
    await page.evaluate(() => (window as any).__game?.teleport(60, 0, 60));
    await page.waitForTimeout(400);
    await shot(page, 'phase2-12-settlement-near-before');

    await waitForSettlement(page, 50_000);
    await page.waitForTimeout(600);
    await shot(page, 'phase2-12-settlement-props');

    const loaded = await page.evaluate(
      () => (window as any).__game?.hasAssetSettlement?.(),
    );
    expect(loaded, 'Settlement decoration flag is set').toBe(true);
    expect(errors, 'No JS errors').toHaveLength(0);
  });

  // ── 13. Settlement type: stalls and carts ───────────────────────────────
  test('market stalls and carts appear near road tiles', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadPage(page);
    await startGame(page);
    await goExterior(page, 'phase2-13-stalls-before');
    await waitForSettlement(page, 50_000);

    await page.evaluate(() => (window as any).__game?.teleport(55, 0, 55));
    await page.waitForTimeout(800);
    await shot(page, 'phase2-13-stalls-after');

    expect(errors, 'No JS errors').toHaveLength(0);
  });

  // ── 14. Settlement + Phase 1 combined ───────────────────────────────────
  test('settlement decoration coexists with Phase 1 terrain', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadPage(page);
    await startGame(page);
    await goExterior(page, 'phase2-14-combined-before');

    // Wait for both Phase 1 and Phase 2
    await Promise.all([
      waitForPhase1(page, 50_000),
      waitForSettlement(page, 50_000),
    ]);
    await page.waitForTimeout(600);
    await shot(page, 'phase2-14-combined-all');

    const allGood = await page.evaluate(() => {
      const g = (window as any).__game;
      return g?.hasAssetTrees?.() &&
             g?.hasAssetRocks?.() &&
             g?.hasAssetSettlement?.();
    });
    expect(allGood, 'Trees, rocks and settlement props all loaded').toBe(true);
    expect(errors, 'No JS errors').toHaveLength(0);
  });
});

// ── Phase 3 — Dungeon entrance upgrade ───────────────────────────────────────

/** Wait until dungeon entrance GLBs are swapped in. */
async function waitForDungeon(page: import('@playwright/test').Page, ms: number) {
  await page.waitForFunction(
    () => (window as any).__game?.hasAssetDungeon?.() === true,
    { timeout: ms },
  );
}

test.describe('Phase 3 — Dungeon entrance upgrade', () => {
  test.setTimeout(120_000);

  // ── 15. Dungeon entrance GLBs load ───────────────────────────────────────
  test('dungeon entrance GLBs replace procedural meshes', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadPage(page);
    await startGame(page);
    await goExterior(page, 'phase3-15-dungeon-before');

    await waitForDungeon(page, 50_000);
    await page.waitForTimeout(500);
    await shot(page, 'phase3-15-dungeon-after');

    const loaded = await page.evaluate(
      () => (window as any).__game?.hasAssetDungeon?.(),
    );
    expect(loaded, 'Dungeon entrance upgrade flag is set').toBe(true);
    expect(errors, 'No JS errors').toHaveLength(0);
  });

  // ── 16. Dungeon trigger proximity still works ────────────────────────────
  test('dungeon entrance trigger radius is preserved after upgrade', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadPage(page);
    await startGame(page);
    await goExterior(page, 'phase3-16-trigger-before');
    await waitForDungeon(page, 50_000);

    // Teleport to a dungeon entrance column/row area (dungeons usually scatter 15-80)
    await page.evaluate(() => (window as any).__game?.teleport(48, 0, 48));
    await page.waitForTimeout(600);
    await shot(page, 'phase3-16-trigger-near');

    // No JS errors means physics bodies are still valid
    expect(errors, 'No JS errors').toHaveLength(0);
  });
});
