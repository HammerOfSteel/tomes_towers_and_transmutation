/**
 * main.ts — startup smoke test
 *
 * What this protects against:
 *   - Temporal Dead Zone (TDZ): variables used in callbacks (like onRoomLoaded)
 *     before their `let` declaration is reached during startup
 *   - Any synchronous throw during module evaluation / startup
 *   - The main menu overlay not being added to the DOM
 *
 * Strategy: inject the real index.html <body>, mock all heavy deps
 * (Three.js renderer, Rapier physics, audio), then dynamically import
 * main.ts.  If anything throws at init time the test fails with the
 * exact error — no console archaeology required.
 *
 * THE BUG THIS TEST WOULD HAVE CAUGHT:
 *   ReferenceError: Cannot access '_towerPrologueDone' before initialization
 *   at sceneManager.onRoomLoaded (main.ts:189)
 *   The variable was declared at line ~420 but used in a callback that fired
 *   at line ~225 (loadDungeon → onRoomLoaded).  This test catches that
 *   class of mistake automatically.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';

// ── THREE.js — mock WebGLRenderer and postprocessing (heavy / WebGL) ────────
vi.mock('three', async () => {
  const THREE = await vi.importActual<typeof import('three')>('three');
  const fakeRenderer = {
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    render: vi.fn(),
    domElement: document.createElement('canvas'),
    shadowMap: { enabled: false, type: 0 },
    toneMapping: 0,
    toneMappingExposure: 1,
    outputColorSpace: '',
    dispose: vi.fn(),
    setRenderTarget: vi.fn(),
    getClearColor: vi.fn(() => new THREE.Color()),
    getClearAlpha: vi.fn(() => 1),
    info: { memory: {}, render: {} },
  };
  return { ...THREE, WebGLRenderer: vi.fn(() => fakeRenderer) };
});

vi.mock('postprocessing', () => ({
  EffectComposer: vi.fn(() => ({ addPass: vi.fn(), render: vi.fn(), setSize: vi.fn() })),
  EffectPass:     vi.fn(),
  RenderPass:     vi.fn(),
  BloomEffect:    vi.fn(() => ({})),
  KernelSize:     { MEDIUM: 2 },
}));

// ── OrbitControls ─────────────────────────────────────────────────────────────
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { Vector3 } = await vi.importActual<typeof import('three')>('three');
  return {
    OrbitControls: vi.fn(() => ({
      update: vi.fn(), target: new Vector3(),
      enableDamping: false, dampingFactor: 0,
      minDistance: 0, maxDistance: 0, maxPolarAngle: 0,
      dispose: vi.fn(), enabled: true,
    })),
  };
});

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: vi.fn(() => ({ load: vi.fn(), setDRACOLoader: vi.fn() })),
}));

vi.mock('three/addons/loaders/DRACOLoader.js', () => ({
  DRACOLoader: vi.fn(() => ({ setDecoderPath: vi.fn(), dispose: vi.fn() })),
}));

// ── Rapier physics (WASM — cannot run in jsdom) ───────────────────────────────
vi.mock('@dimforge/rapier3d-compat', () => {
  const _kcc = {
    setUp: vi.fn(), setApplyImpulsesToDynamicBodies: vi.fn(),
    setSlideEnabled: vi.fn(), setMaxSlopeClimbAngle: vi.fn(), setMinSlopeSlideAngle: vi.fn(),
    enableAutostep: vi.fn(), enableSnapToGround: vi.fn(),
    computeColliderMovement: vi.fn(),
    computedGrounded: vi.fn(() => true),
    computedMovement: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
    desiredTranslation: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
  };
  const _rb  = { handle: 0, translation: vi.fn(() => ({ x: 0, y: 0, z: 0 })), setTranslation: vi.fn(), setNextKinematicTranslation: vi.fn(), setLinvel: vi.fn(), setAngvel: vi.fn(), isKinematic: vi.fn(() => false) };
  const World     = vi.fn(() => ({ step: vi.fn(), createRigidBody: vi.fn(() => _rb), createCollider: vi.fn(), removeRigidBody: vi.fn(), removeCollider: vi.fn(), removeCharacterController: vi.fn(), createCharacterController: vi.fn(() => _kcc), bodies: { len: vi.fn(() => 0) }, gravity: { x: 0, y: -9.81, z: 0 } }));
  const RigidBodyDesc = { kinematicPositionBased: vi.fn(() => ({ setTranslation: vi.fn(() => ({})) })), fixed: vi.fn(() => ({ setTranslation: vi.fn(() => ({})) })), dynamic: vi.fn(() => ({ setTranslation: vi.fn(() => ({})), setLinearDamping: vi.fn(() => ({})), setAngularDamping: vi.fn(() => ({})) })) };
  const ColliderDesc  = { capsule: vi.fn(() => ({ setFriction: vi.fn(() => ({})) })), cuboid: vi.fn(() => ({})), ball: vi.fn(() => ({})), trimesh: vi.fn(() => ({})) };
  const EventQueue    = vi.fn(() => ({ drainCollisionEvents: vi.fn() }));
  const mod = { init: vi.fn().mockResolvedValue(undefined), World, RigidBodyDesc, ColliderDesc, EventQueue, ActiveEvents: { COLLISION_EVENTS: 1 } };
  // PhysicsWorld.ts uses `import RAPIER from '...'` (default import) — must expose default
  return { ...mod, default: mod };
});

// ── Audio stub ─────────────────────────────────────────────────────────────────
beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'play',  { writable: true, value: () => Promise.resolve() });
  Object.defineProperty(HTMLMediaElement.prototype, 'load',  { writable: true, value: () => {} });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { writable: true, value: () => {} });
});

// AudioContext is not in jsdom — stub the minimal surface that AudioSystem uses
vi.stubGlobal('AudioContext', vi.fn(() => ({
  state:              'suspended',
  resume:             vi.fn().mockResolvedValue(undefined),
  destination:        {},
  createGain:         vi.fn(() => ({
    gain:    { value: 1, setValueAtTime: vi.fn() },
    connect: vi.fn(),
  })),
  createBufferSource: vi.fn(() => ({
    connect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null,
  })),
  decodeAudioData: vi.fn().mockResolvedValue(null),
})));

// ── Browser globals needed by main.ts ─────────────────────────────────────────
vi.stubGlobal('requestAnimationFrame', vi.fn());
vi.stubGlobal('cancelAnimationFrame',  vi.fn());
vi.stubGlobal('fetch', vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) }),
));

// ── Inject minimal index.html body ─────────────────────────────────────────────
function injectGameDom(): void {
  document.body.innerHTML = '<canvas id="game-canvas"></canvas>';
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('main.ts — startup smoke tests', () => {
  beforeAll(() => {
    injectGameDom();
    localStorage.clear();
  });

  it('loads without throwing (catches TDZ and init errors)', async () => {
    // Any synchronous error during startup — including the TDZ bug
    //   "Cannot access '_towerPrologueDone' before initialization"
    // will cause this dynamic import to reject.
    const mod = await import('@/main');
    expect(mod).toBeDefined();
    // _startupComplete is the main() promise; awaiting it ensures the
    // MainMenu constructor ran and the overlay was appended to the DOM.
    await mod._startupComplete;
  });

  it('main menu overlay is present in document.body after startup', async () => {
    // The MainMenu constructor appends .mm-overlay.  If it threw, this is null.
    expect(document.body.querySelector('.mm-overlay')).not.toBeNull();
  });

  it('main menu is visible (not hidden) on first load', async () => {
    const overlay = document.body.querySelector('.mm-overlay') as HTMLElement | null;
    expect(overlay).not.toBeNull();
    // display must not be 'none' (hide() sets this after 520ms)
    expect(overlay!.style.display).not.toBe('none');
  });

  it('game canvas is present', () => {
    expect(document.getElementById('game-canvas')).not.toBeNull();
  });
});
