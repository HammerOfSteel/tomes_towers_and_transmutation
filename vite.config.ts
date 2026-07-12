import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Rapier bundles its own WASM — exclude from Vite's pre-bundling
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
});
