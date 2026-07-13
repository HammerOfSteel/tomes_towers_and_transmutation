import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    // Exclude Playwright e2e tests — those run via `npm run test:e2e`
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
