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

  use: {
    baseURL:        'http://localhost:5173',
    browserName:    'chromium',
    headless:       true,
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
});
