import path from 'path';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import fs from 'fs';

/**
 * L6: Level editor save plugin.
 * Accepts POST /api/save-level with JSON body {type, id, content}.
 * Writes to public/editor-output/<type>/<id>.ttt-level.json.
 * Triggers HMR invalidation so the game page hot-reloads on editor saves.
 */
function levelEditorPlugin(): Plugin {
  return {
    name: 'level-editor-save',
    configureServer(server) {
      // ── POST /_dev/error — receive window.onerror payloads from the browser ──
      server.middlewares.use('/_dev/error', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (c: Buffer) => { body += c.toString(); });
        req.on('end', () => {
          try { console.error('[browser-error]', JSON.parse(body)); } catch { console.error('[browser-error]', body); }
          res.statusCode = 204; res.end();
        });
      });
      server.middlewares.use('/api/save-level', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { type, id, content } = JSON.parse(body) as { type: string; id: string; content: string };
            const dir = path.resolve(__dirname, 'public/editor-output', type);
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `${id}.ttt-level.json`);
            fs.writeFileSync(file, content, 'utf8');
            server.hot.send({ type: 'full-reload' });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, file }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });

      // ── POST /api/save-asset-scale — patch gameScale in envManifest.ts ───
      server.middlewares.use('/api/save-asset-scale', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { assetPath, scale } = JSON.parse(body) as { assetPath: string; scale: number };
            const manifestFile = path.resolve(__dirname, 'src/assets/envManifest.ts');
            let src = fs.readFileSync(manifestFile, 'utf8');
            // Find the line with this path and update gameScale
            // Pattern: { path: '/assets/…/foo.glb', …, gameScale: 2.0 }
            const escapedPath = assetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`(path:\\s*'${escapedPath}'[^}]*?gameScale:\\s*)([\\d.]+)`, 's');
            if (!re.test(src)) throw new Error(`Path not found in manifest: ${assetPath}`);
            src = src.replace(re, `$1${scale}`);
            fs.writeFileSync(manifestFile, src, 'utf8');
            // HMR will pick up the source change automatically via Vite's watch
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, assetPath, scale }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [levelEditorPlugin()],
  // F4: 'warn' in production builds, 'info' in dev — suppress noisy info logs in prod
  logLevel: mode === 'production' ? 'warn' : 'info',
  resolve: {
    // Prioritise .ts over .js so stale JS mirrors don't shadow the real source
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json', '.vue'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main:           path.resolve(__dirname, 'index.html'),
        assetViewer:    path.resolve(__dirname, 'asset-viewer.html'),
        sandbox:        path.resolve(__dirname, 'sandbox.html'),
        worldEditor:    path.resolve(__dirname, 'world-editor.html'),
        modelReview:    path.resolve(__dirname, 'model-review.html'),
        princessCreator: path.resolve(__dirname, 'princess-creator.html'),
        showroom:        path.resolve(__dirname, 'showroom.html'),
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
}));
