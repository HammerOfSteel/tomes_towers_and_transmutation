import { defineConfig } from '@playwright/test';

/**
 * Playwright config for end-to-end gameplay tests.
 *
 * Uses the Vite dev server on http://localhost:5174.
 * Playwright will reuse an existing server there, or start one with the
 * matching host/port if needed.
 *
 * To run tests:  npx playwright test
 * To view HTML report after run:  npx playwright show-report tests/e2e/report
 */
export default defineConfig({
  testDir:     './tests/e2e',
  outputDir:   './tests/e2e/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e/report', open: 'never' }],
  ],

  // Per-test timeout — WASM init + game start + asset loads can take ~50 s.
  timeout: 90_000,

  use: {
    baseURL:        'http://127.0.0.1:5174',
    browserName:    'chromium',
    headless:       true,   // headless avoids ProcessSingleton profile-lock issues in CI/sandbox
    slowMo:         0,
    viewport:       { width: 1280, height: 720 },
    // Always capture screenshots — key for visual debugging
    screenshot:     'on',
    // Keep video on failure so you can replay what the test saw
    video:          'retain-on-failure',
    // Give WebGL + WASM time to initialise
    actionTimeout:  15_000,
    navigationTimeout: 20_000,
    // Needed for running in sandboxed/CI environments
    launchOptions: {
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },

  // Stop after the first failing test file — enable only during CI to speed up feedback
  // maxFailures: 1,

  // Auto-start the Vite dev server if not already running.
  // Playwright will reuse an already-running server on port 5174.
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174',
    url:     'http://127.0.0.1:5174',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
