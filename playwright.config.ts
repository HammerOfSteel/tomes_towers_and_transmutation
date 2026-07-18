import { defineConfig } from '@playwright/test';

/**
 * Playwright config for end-to-end gameplay tests.
 *
 * Assumes the Vite dev server is already running on http://localhost:5173.
 * To start it:  npm run dev
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
    baseURL:        'http://localhost:5173',
    browserName:    'chromium',
    headless:       false,
    slowMo:         300,   // ms between actions — makes it watchable
    viewport:       { width: 1280, height: 720 },
    // Always capture screenshots — key for visual debugging
    screenshot:     'on',
    // Keep video on failure so you can replay what the test saw
    video:          'retain-on-failure',
    // Give WebGL + WASM time to initialise
    actionTimeout:  15_000,
    navigationTimeout: 20_000,
  },

  // Stop after the first failing test file — enable only during CI to speed up feedback
  // maxFailures: 1,

  // Auto-start the Vite dev server if not already running.
  // Playwright will reuse an already-running server on port 5173.
  webServer: {
    command: 'npm run dev',
    url:     'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
