/**
 * world-editor smoke test
 *
 * Catches module-initialization bugs:
 *   - Temporal Dead Zone (TDZ): let/const used before declaration
 *   - qs() crash: required DOM element missing on load
 *   - Any synchronous throw during module evaluation
 *
 * Strategy: inject the real HTML into jsdom, mock WebGL + RAF,
 * then dynamically import the module.  If anything blows up at
 * init time the promise rejects and the test fails with the exact error.
 */
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
// ── Mock THREE.js WebGLRenderer before the module is ever imported ────────────
vi.mock('three', async () => {
    const THREE = await vi.importActual('three');
    const fakeRenderer = {
        setSize: vi.fn(),
        setPixelRatio: vi.fn(),
        render: vi.fn(),
        domElement: document.createElement('canvas'),
        shadowMap: { enabled: false, type: 0 },
        outputColorSpace: '',
        info: { memory: {}, render: {} },
        dispose: vi.fn(),
    };
    return {
        ...THREE,
        WebGLRenderer: vi.fn(() => fakeRenderer),
    };
});
// ── Mock OrbitControls ────────────────────────────────────────────────────────
// target must be a real THREE.Vector3 because world-editor calls orbit.target.set(...)
vi.mock('three/addons/controls/OrbitControls.js', async () => {
    const { Vector3 } = await vi.importActual('three');
    return {
        OrbitControls: vi.fn(() => ({
            update: vi.fn(),
            target: new Vector3(),
            enableDamping: false,
            dampingFactor: 0,
            minDistance: 0,
            maxDistance: 0,
            maxPolarAngle: 0,
            dispose: vi.fn(),
        })),
    };
});
// ── Mock GLTFLoader ───────────────────────────────────────────────────────────
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
    GLTFLoader: vi.fn(() => ({
        load: vi.fn(),
        setDRACOLoader: vi.fn(),
    })),
}));
// ── Helpers ───────────────────────────────────────────────────────────────────
function injectWorldEditorDom() {
    const html = fs.readFileSync(path.resolve(__dirname, '../../world-editor.html'), 'utf8');
    // Extract everything inside <body>...</body>
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    document.body.innerHTML = bodyMatch ? bodyMatch[1] : html;
}
// ── Tests ─────────────────────────────────────────────────────────────────────
describe('world-editor module — smoke tests', () => {
    beforeAll(() => {
        // Provide the real DOM so every qs() call succeeds
        injectWorldEditorDom();
        // requestAnimationFrame must not actually schedule — just call once so the
        // animate() loop doesn't run forever during the test
        vi.stubGlobal('requestAnimationFrame', vi.fn());
        // fetch is used by initModelsTab to load manifest.json
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })));
    });
    it('loads without TDZ or initialization errors', async () => {
        // Dynamic import — any synchronous throw during module evaluation
        // (TDZ, missing DOM element, etc.) will cause this to reject.
        await expect(import('@/world-editor')).resolves.toBeDefined();
    });
    it('exposes no unexpected top-level errors after load', async () => {
        // The module is already cached; re-importing just returns the namespace.
        // This is a safety net to confirm the module object is not undefined/null.
        const mod = await import('@/world-editor');
        expect(mod).toBeDefined();
    });
});
