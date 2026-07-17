/**
 * playwright.model-review.config.ts
 *
 * Dedicated Playwright config for the model-review QA tool.
 * Runs on port 5174 to avoid conflicts with other dev servers.
 *
 * Usage:
 *   npx playwright test --config=playwright.model-review.config.ts
 *   npx playwright test --config=playwright.model-review.config.ts --grep "easy_animated"
 *
 * Or via npm script:
 *   npm run test:models
 */

import { defineConfig } from '@playwright/test';
import path             from 'path';

export default defineConfig({
  testDir: './tests/e2e',
  // Only run model-review tests from this config.
  testMatch: '**/model-review.spec.ts',

  outputDir: './tests/e2e/test-results/model-review-pw',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e/report-model-review', open: 'never' }],
  ],

  // Model loading can take time — GLTF + optional animation rig
  timeout: 120_000,

  use: {
    baseURL:    'http://localhost:5175',
    browserName: 'chromium',
    headless:   true,
    viewport:   { width: 1280, height: 800 },
    // Capture screenshot on every test so we get visual output
    screenshot: 'on',
    video:      'retain-on-failure',
    // GLTF loading may take several seconds
    actionTimeout:      20_000,
    navigationTimeout:  25_000,
  },

  // Dedicated dev server on port 5174 — always fresh, never reuses.
  // This avoids conflicts with other servers running on 5173.
  webServer: {
    command:    'npx vite --port 5175',
    url:        'http://localhost:5175',
    reuseExistingServer: false,
    timeout:    60_000,
    stdout:     'pipe',
    stderr:     'pipe',
  },
});
