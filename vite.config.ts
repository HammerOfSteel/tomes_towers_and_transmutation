import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main:        path.resolve(__dirname, 'index.html'),
        assetViewer: path.resolve(__dirname, 'asset-viewer.html'),
        sandbox:     path.resolve(__dirname, 'sandbox.html'),
        worldEditor: path.resolve(__dirname, 'world-editor.html'),
      },
    },
  },
  // Rapier bundles its own WASM — exclude from Vite's pre-bundling
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
});
