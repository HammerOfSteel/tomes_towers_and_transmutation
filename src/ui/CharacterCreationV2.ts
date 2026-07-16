/**
 * CharacterCreationV2 — redesigned character creation screen.
 *
 * Layout:
 *   LEFT  (flex:1)  – full-height 3D viewport: orbit, zoom, click-to-move
 *   RIGHT (360 px)  – character picker, name, starting boon, actions
 *
 * Key design decision: the overlay uses opacity/pointer-events toggling instead
 * of display:none after the first show so the WebGL context is never evicted.
 */

import * as THREE from 'three';
import { loadWorldGenConfig }          from '@/world/WorldGenConfig';
import type { CharModelDef }           from '@/characters/charManifest';
import { AssetCharBrowser }            from '@/ui/AssetCharBrowser';
import { loadCharModel }               from '@/characters/CharacterLoader';
import type { CharacterConfig, StartingBoon } from '@/ui/DNACreator';
import { generateNameForSpecies }      from '@/world/NameGenerator';

// ── Re-export StartingBoon so callers don't need two imports ─────────────────
export type { CharacterConfig, StartingBoon };

// ── Boon metadata ─────────────────────────────────────────────────────────────

const BOONS: Array<{ id: StartingBoon; icon: string; title: string; effect: string }> = [
  { id: 'tome',  icon: '📖', title: 'Ancient Tome',    effect: 'Start with Flame Dart' },
  { id: 'blood', icon: '❤',  title: "Warrior's Blood", effect: '+30 maximum HP' },
  { id: 'swift', icon: '💨', title: 'Swift Feet',      effect: 'Dodge −35%  •  Move +15%' },
];

// ── CSS ───────────────────────────────────────────────────────────────────────

let _stylesInjected = false;
function _ensureStyles(): void {
  if (_stylesInjected) return;
  _stylesInjected = true;

  const css = `
/* ── CharacterCreationV2 ───────────────────────────────────────────────────── */
.ccv2-overlay {
  position: fixed; inset: 0; z-index: 8500;
  background: rgba(4,3,10,.97);
  display: flex; flex-direction: column;
  opacity: 0; pointer-events: none;
  transition: opacity .2s ease;
  font-family: 'Crimson Text','Georgia',serif;
}
.ccv2-overlay.ccv2--open { opacity: 1; pointer-events: auto; }

/* Header */
.ccv2-header {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  padding: 13px 24px 11px;
  border-bottom: 1px solid #2a1850;
  gap: 10px;
}
.ccv2-title {
  font-size: 1.5rem; color: #e8d8b0; letter-spacing: .12em;
  text-shadow: 0 0 20px rgba(160,120,220,.5);
}
.ccv2-subtitle {
  font-size: .72rem; color: #5a4880; letter-spacing: .14em;
  text-transform: uppercase;
}

/* Body */
.ccv2-body {
  display: flex; flex: 1; min-height: 0;
}

/* ── Viewport column ────────────────────────────────────────────────────────── */
.ccv2-vp-col {
  flex: 1; min-width: 0; position: relative;
  border-right: 1px solid #2a1850;
  background: #0d0b18;
}
.ccv2-canvas {
  display: block; width: 100%; height: 100%;
  cursor: grab;
  outline: none;
  user-select: none;
}
.ccv2-canvas:active { cursor: grabbing; }

/* Viewport HUD overlays */
.ccv2-vp-hud {
  position: absolute; inset: 0;
  pointer-events: none;
  display: flex; flex-direction: column;
  justify-content: space-between;
  padding: 14px 16px;
}
.ccv2-char-badge {
  align-self: flex-start;
  background: rgba(13,11,24,.8);
  border: 1px solid #3a2860;
  border-radius: 20px;
  padding: 5px 14px;
  font-size: .88rem; color: #c0b0e0;
  letter-spacing: .04em;
  backdrop-filter: blur(4px);
  transition: background .2s;
}
.ccv2-char-badge.ccv2-badge--hint { color: #5a4880; font-style: italic; }
.ccv2-vp-hint {
  align-self: center;
  font-size: .7rem; color: #3a2860;
  letter-spacing: .08em; text-transform: uppercase;
  text-align: center;
}
.ccv2-loading-ring {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%,-50%);
  display: none;
  width: 36px; height: 36px;
  border: 3px solid #2a1850;
  border-top-color: #7050cc;
  border-radius: 50%;
  animation: ccv2-spin .8s linear infinite;
  pointer-events: none;
}
@keyframes ccv2-spin { to { transform: translate(-50%,-50%) rotate(360deg); } }

/* ── Right panel ─────────────────────────────────────────────────────────────── */
.ccv2-panel {
  width: 360px; flex-shrink: 0;
  display: flex; flex-direction: column;
  overflow-y: auto; overflow-x: hidden;
  padding: 14px 16px 10px;
  gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: #2a1850 transparent;
}

.ccv2-section-label {
  font-size: .68rem; color: #5a4880;
  letter-spacing: .14em; text-transform: uppercase;
  margin-bottom: 4px;
}

/* Character browser section */
.ccv2-browser-wrap {
  display: flex; flex-direction: column;
  min-height: 0; flex: 1 1 auto;
  max-height: 320px;
}

/* Name input */
.ccv2-name-input {
  width: 100%; box-sizing: border-box;
  background: #0a0814; border: 1px solid #2a1850; border-radius: 3px;
  color: #e0d0ff; font-family: inherit; font-size: .9rem;
  padding: 8px 12px; outline: none;
  transition: border-color .15s;
}
.ccv2-name-input:focus { border-color: #5040a0; }
.ccv2-name-input::placeholder { color: #3a2860; }

/* Boon cards */
.ccv2-boons { display: flex; flex-direction: column; gap: 6px; }
.ccv2-boon-card {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #2a1850;
  background: rgba(255,255,255,.03);
  cursor: pointer; user-select: none;
  transition: border-color .12s, background .12s;
}
.ccv2-boon-card:hover { border-color: #4a3870; background: rgba(255,255,255,.06); }
.ccv2-boon-card.ccv2-boon--on {
  border-color: #7050cc; background: rgba(112,80,204,.12);
}
.ccv2-boon-icon { font-size: 1.2rem; flex-shrink: 0; }
.ccv2-boon-title { font-size: .88rem; color: #d0c0e8; font-weight: 600; }
.ccv2-boon-effect { font-size: .72rem; color: #7060a0; }

/* Actions */
.ccv2-actions {
  display: flex; gap: 10px; justify-content: flex-end;
  margin-top: auto; padding-top: 8px;
  border-top: 1px solid #2a1850;
  flex-shrink: 0;
}
.ccv2-btn {
  border: none; border-radius: 3px; cursor: pointer;
  font-family: inherit; font-size: .9rem; letter-spacing: .04em;
  padding: 9px 20px;
  transition: background .12s, transform .05s;
}
.ccv2-btn:active { transform: scale(.97); }
.ccv2-btn-back {
  background: transparent; border: 1px solid #2e1f50; color: #7060a0;
}
.ccv2-btn-back:hover { background: rgba(255,255,255,.04); border-color: #4a3870; }
.ccv2-btn-begin {
  background: linear-gradient(135deg,#5030a0,#7050cc); color: #f0e8ff;
  font-weight: 600; box-shadow: 0 4px 18px rgba(80,48,160,.4);
}
.ccv2-btn-begin:hover { background: linear-gradient(135deg,#6040b8,#8060e0); }
`;

  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
}

// ── Preview3D ─────────────────────────────────────────────────────────────────

/**
 * Manages the Three.js scene inside the viewport canvas.
 * Features: orbit camera, scroll-to-zoom, click-to-move character.
 */
class Preview3D {
  private readonly _renderer: THREE.WebGLRenderer;
  private readonly _scene:    THREE.Scene;
  private readonly _camera:   THREE.PerspectiveCamera;
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _floorPlane: THREE.Mesh;
  private readonly _arenaR = 4.8;

  // Orbit state (target values are smoothly lerped toward)
  private _r  = 5.5;  private _tR  = 5.5;
  private _th = 0.4;  private _tTh = 0.4;   // azimuth (radians)
  private _ph = 0.48; private _tPh = 0.48;  // elevation from horizontal

  // Character
  private _charGroup: THREE.Group | null = null;
  private _charMixer: THREE.AnimationMixer | null = null;
  private _charPos    = new THREE.Vector3();
  private _charTarget = new THREE.Vector3();
  private _charFacing = 0;
  private _animState: 'idle' | 'walk' = 'idle';
  private _idleAction: THREE.AnimationAction | null = null;
  private _walkAction: THREE.AnimationAction | null = null;
  private readonly _walkSpeed = 2.8;  // units / second

  // Loop
  private _rafId: number | null = null;
  private _prevTime = 0;

  // Drag / click tracking
  private _ptDown = { x: 0, y: 0, thStart: 0, phStart: 0 };
  private _ptDragging = false;
  private _ptMoved = false;

  // ResizeObserver
  private _ro: ResizeObserver;

  // ── Construction ────────────────────────────────────────────────────────────

  constructor(canvas: HTMLCanvasElement) {
    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this._renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this._renderer.setClearColor(0x0d0b18);
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this._scene  = new THREE.Scene();
    this._scene.fog = new THREE.FogExp2(0x0d0b18, 0.06);

    this._camera = new THREE.PerspectiveCamera(52, 1, 0.1, 60);

    // Lighting
    this._scene.add(new THREE.AmbientLight(0xd0b8ff, 0.55));
    const key = new THREE.DirectionalLight(0xfff0e0, 1.6);
    key.position.set(5, 9, 4); key.castShadow = true;
    key.shadow.mapSize.setScalar(1024); key.shadow.bias = -0.002;
    this._scene.add(key);
    const rim = new THREE.DirectionalLight(0x5030ff, 0.55);
    rim.position.set(-4, 3, -5);
    this._scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffe8c0, 0.3);
    fill.position.set(0, -2, 6);
    this._scene.add(fill);

    // Arena floor disc
    const floorGeo = new THREE.CircleGeometry(this._arenaR, 64);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x181228 });
    this._floorPlane = new THREE.Mesh(floorGeo, floorMat);
    this._floorPlane.rotation.x = -Math.PI / 2;
    this._floorPlane.receiveShadow = true;
    this._scene.add(this._floorPlane);

    // Concentric ring decoration
    for (let ri = 1; ri < Math.ceil(this._arenaR); ri++) {
      const rg = new THREE.RingGeometry(ri - 0.025, ri + 0.025, 64);
      const rm = new THREE.MeshBasicMaterial({
        color: 0x3a2060, transparent: true, opacity: 0.4,
      });
      const ring = new THREE.Mesh(rg, rm);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.005;
      this._scene.add(ring);
    }

    // Outer border ring (bright)
    const bRing = new THREE.Mesh(
      new THREE.RingGeometry(this._arenaR - 0.08, this._arenaR, 64),
      new THREE.MeshBasicMaterial({ color: 0x7050cc, transparent: true, opacity: 0.8 }),
    );
    bRing.rotation.x = -Math.PI / 2;
    bRing.position.y = 0.007;
    this._scene.add(bRing);

    // Resize observer — keeps canvas pixel dimensions matching CSS size
    this._ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        this._renderer.setSize(width, height, false);
        this._camera.aspect = width / height;
        this._camera.updateProjectionMatrix();
      }
    });
    this._ro.observe(canvas);

    this._bindInteraction(canvas);
    this._updateCamera();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  setCharacter(
    group:  THREE.Group,
    mixer:  THREE.AnimationMixer | null,
    clips:  THREE.AnimationClip[],
  ): void {
    // Remove previous
    if (this._charGroup) this._scene.remove(this._charGroup);
    if (this._charMixer) this._charMixer.stopAllAction();
    this._idleAction = null;
    this._walkAction = null;

    // Reset position
    this._charPos.set(0, 0, 0);
    this._charTarget.set(0, 0, 0);
    this._charFacing = 0;
    this._animState = 'idle';

    // Auto-fit: scale so the model is ~2 units tall
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const sz  = box.getSize(new THREE.Vector3());
    const maxD = Math.max(sz.x, sz.y, sz.z);
    const sc = maxD > 0.01 ? 2.0 / maxD : 1;
    group.scale.setScalar(sc);
    group.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(group);
    group.position.y = -box2.min.y;  // lift so feet are at y=0
    group.position.x = 0;
    group.position.z = 0;

    this._scene.add(group);
    this._charGroup = group;
    this._charMixer = mixer;

    // Wire animations
    if (mixer && clips.length > 0) {
      const find = (names: string[]) =>
        names.map(n => THREE.AnimationClip.findByName(clips, n)).find(Boolean) ?? null;

      const idleClip = find(['Idle_A', 'Idle_B', 'Idle', 'idle', 'Stand', 'Rest']);
      const walkClip = find(['Walking_A', 'Walking_B', 'Walk', 'walk',
                             'Running_A', 'Running_B', 'Run', 'run']);

      if (idleClip) {
        this._idleAction = mixer.clipAction(idleClip);
        this._idleAction.setLoop(THREE.LoopRepeat, Infinity);
        this._idleAction.clampWhenFinished = false;
        this._idleAction.play();
      }
      if (walkClip) {
        this._walkAction = mixer.clipAction(walkClip);
        this._walkAction.setLoop(THREE.LoopRepeat, Infinity);
        this._walkAction.clampWhenFinished = false;
        this._walkAction.enabled = true;
        this._walkAction.weight = 0;  // start silent; will cross-fade in
      }
    }
  }

  clearCharacter(): void {
    if (this._charGroup) { this._scene.remove(this._charGroup); this._charGroup = null; }
    if (this._charMixer) { this._charMixer.stopAllAction(); this._charMixer = null; }
    this._idleAction = null;
    this._walkAction = null;
  }

  startLoop(): void {
    if (this._rafId !== null) return;
    this._prevTime = performance.now();
    const tick = () => {
      this._rafId = requestAnimationFrame(tick);
      this._tick();
    };
    tick();
  }

  stopLoop(): void {
    if (this._rafId !== null) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }

  dispose(): void {
    this.stopLoop();
    this._ro.disconnect();
    this._charMixer?.stopAllAction();
    this._renderer.dispose();
  }

  // ── Tick ─────────────────────────────────────────────────────────────────────

  private _tick(): void {
    const now = performance.now();
    const dt  = Math.min((now - this._prevTime) * 0.001, 0.1);
    this._prevTime = now;

    // Smooth orbit
    const lk = 1 - Math.exp(-10 * dt);
    this._r  += (this._tR  - this._r)  * lk;
    this._th += (this._tTh - this._th) * lk;
    this._ph += (this._tPh - this._ph) * lk;

    // Character movement
    this._tickCharacter(dt);

    // Camera follows character
    this._updateCamera();

    this._charMixer?.update(dt);
    this._renderer.render(this._scene, this._camera);
  }

  private _tickCharacter(dt: number): void {
    if (!this._charGroup) return;

    const dx = this._charTarget.x - this._charPos.x;
    const dz = this._charTarget.z - this._charPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.08) {
      // Move toward target
      const step = Math.min(dist, this._walkSpeed * dt);
      this._charPos.x += (dx / dist) * step;
      this._charPos.z += (dz / dist) * step;

      // Face movement direction (smooth)
      const targetFacing = Math.atan2(dx, dz);
      let diff = ((targetFacing - this._charFacing) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      this._charFacing += diff * Math.min(1, dt * 9);

      this._setAnimState('walk');
    } else {
      this._setAnimState('idle');
    }

    this._charGroup.position.set(this._charPos.x, 0, this._charPos.z);
    this._charGroup.rotation.y = this._charFacing;
  }

  private _setAnimState(state: 'idle' | 'walk'): void {
    if (state === this._animState) return;
    this._animState = state;

    const from = state === 'idle' ? this._walkAction : this._idleAction;
    const to   = state === 'idle' ? this._idleAction : this._walkAction;

    if (from && to) {
      to.reset().play();
      from.crossFadeTo(to, 0.25, false);
    } else if (to) {
      to.reset().play();
    }
  }

  // ── Camera ───────────────────────────────────────────────────────────────────

  private _updateCamera(): void {
    const lookAt = new THREE.Vector3(
      this._charPos.x,
      0.85,
      this._charPos.z,
    );
    const cp = Math.cos(this._ph), sp = Math.sin(this._ph);
    const ct = Math.cos(this._th), st = Math.sin(this._th);
    this._camera.position.set(
      lookAt.x + this._r * cp * st,
      lookAt.y + this._r * sp,
      lookAt.z + this._r * cp * ct,
    );
    this._camera.lookAt(lookAt);
  }

  // ── Interaction ───────────────────────────────────────────────────────────────

  private _bindInteraction(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      this._ptDown = { x: e.clientX, y: e.clientY, thStart: this._tTh, phStart: this._tPh };
      this._ptDragging = true;
      this._ptMoved = false;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this._ptDragging) return;
      const ddx = e.clientX - this._ptDown.x;
      const ddy = e.clientY - this._ptDown.y;
      if (Math.abs(ddx) > 4 || Math.abs(ddy) > 4) this._ptMoved = true;
      if (this._ptMoved) {
        const W = canvas.clientWidth  || 1;
        const H = canvas.clientHeight || 1;
        this._tTh = this._ptDown.thStart - (ddx / W) * Math.PI * 2.4;
        this._tPh = Math.max(0.08, Math.min(1.35,
          this._ptDown.phStart + (ddy / H) * Math.PI,
        ));
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      if (!this._ptDragging) return;
      this._ptDragging = false;
      if (!this._ptMoved) this._handleClick(e, canvas);
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._tR = Math.max(1.8, Math.min(9.5, this._tR + e.deltaY * 0.006));
    }, { passive: false });
  }

  private _handleClick(e: PointerEvent, canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left)  / rect.width)  * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this._camera);
    const hits = this._raycaster.intersectObject(this._floorPlane);
    if (hits.length === 0) return;

    const pt = hits[0]!.point;
    // Clamp to arena radius
    const len = Math.sqrt(pt.x * pt.x + pt.z * pt.z);
    if (len > this._arenaR - 0.3) {
      const s = (this._arenaR - 0.3) / len;
      pt.x *= s; pt.z *= s;
    }
    this._charTarget.set(pt.x, 0, pt.z);
  }
}

// ── Model def → species name helper ──────────────────────────────────────────

function _nameForModelDef(def: CharModelDef): string {
  const tags = def.tags ?? [];
  const id   = def.id.toLowerCase();
  if (tags.includes('skeleton') || id.includes('skeleton') || id.includes('undead') || id.includes('ghost') || id.includes('zombie'))
    return generateNameForSpecies('undead');
  if (tags.includes('fox') || id.includes('fox'))
    return generateNameForSpecies('fox');
  if (tags.includes('slime') || id.includes('slime'))
    return generateNameForSpecies('slime');
  return generateNameForSpecies('human');
}

// ── CharacterCreationV2 ───────────────────────────────────────────────────────

export class CharacterCreationV2 {
  private readonly _overlay: HTMLElement;
  private _preview3D: Preview3D | null = null;
  private _browser:   AssetCharBrowser | null = null;

  // DOM refs
  private _vpCanvas!:       HTMLCanvasElement;
  private _charBadge!:      HTMLElement;
  private _loadingRing!:    HTMLElement;
  private _browserWrap!:    HTMLElement;
  private _nameInput!:      HTMLInputElement;
  private _boonCards = new Map<StartingBoon, HTMLElement>();

  // State
  private _slotId    = 0;
  private _assetModel: CharModelDef | null = null;
  private _boon: StartingBoon = 'tome';

  /** Fired when the player clicks "Begin →". */
  onComplete?: (cfg: CharacterConfig) => void;
  /** Fired when the player clicks "← Back". */
  onBack?: () => void;

  constructor() {
    _ensureStyles();
    this._overlay = this._buildHTML();
    document.body.appendChild(this._overlay);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  show(slotId: number): void {
    this._slotId = slotId;
    this._assetModel = null;
    this._boon = 'tome';

    const wg = loadWorldGenConfig();

    // Reset UI
    this._nameInput.value = '';
    this._charBadge.textContent = '← Choose a character';
    this._charBadge.className = 'ccv2-char-badge ccv2-badge--hint';
    this._loadingRing.style.display = 'none';

    // Sync boon highlight
    this._boonCards.forEach((card, id) => {
      card.classList.toggle('ccv2-boon--on', id === this._boon);
    });

    // Build asset browser (once; destroyed on dispose)
    if (!this._browser) {
      this._browser = new AssetCharBrowser(
        this._browserWrap,
        wg.charPacks,
        (def) => this._onModelSelected(def),
      );
    }

    // Show overlay (opacity transition — canvas context is preserved)
    this._overlay.classList.add('ccv2--open');

    // Create Preview3D on first show (after the overlay is layout-ready)
    if (!this._preview3D) {
      // A tiny delay ensures the canvas has rendered dimensions before resize observer fires
      requestAnimationFrame(() => {
        this._preview3D = new Preview3D(this._vpCanvas);
        this._preview3D.startLoop();
      });
    } else {
      this._preview3D.startLoop();
    }
  }

  hide(): void {
    this._overlay.classList.remove('ccv2--open');
    // Don't destroy the Preview3D — keep the WebGL context alive
    this._preview3D?.stopLoop();
  }

  dispose(): void {
    this._preview3D?.dispose();
    this._browser?.dispose();
    this._overlay.remove();
  }

  /** Snapshot of current state — used by Playwright tests via window.__game. */
  getState(): { selectedModelId: string | null; boon: StartingBoon; name: string } {
    return {
      selectedModelId: this._assetModel?.id ?? null,
      boon:            this._boon,
      name:            this._nameInput?.value ?? '',
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private _onModelSelected(def: CharModelDef): void {
    this._assetModel = def;
    this._charBadge.textContent = def.name;
    this._charBadge.className = 'ccv2-char-badge';
    this._loadingRing.style.display = '';

    // Auto-fill the name input if the player hasn't typed anything yet
    if (!this._nameInput.value.trim()) {
      this._nameInput.value = _nameForModelDef(def);
    }

    loadCharModel(def)
      .then((loaded) => {
        this._loadingRing.style.display = 'none';
        this._preview3D?.setCharacter(loaded.scene, loaded.mixer, loaded.clips);
      })
      .catch((err) => {
        this._loadingRing.style.display = 'none';
        console.warn('[CharCreationV2] model load failed:', def.id, err);
      });
  }

  private _setBoon(b: StartingBoon): void {
    this._boon = b;
    this._boonCards.forEach((card, id) =>
      card.classList.toggle('ccv2-boon--on', id === b),
    );
  }

  // ── HTML build ────────────────────────────────────────────────────────────────

  private _buildHTML(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'ccv2-overlay';

    // ── Header ──────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'ccv2-header';
    const title = document.createElement('div');
    title.className = 'ccv2-title';
    title.textContent = 'Shape Your Being';
    const sub = document.createElement('div');
    sub.className = 'ccv2-subtitle';
    sub.textContent = 'Form · Boon · Appearance';
    header.append(title, sub);
    overlay.appendChild(header);

    // ── Body ─────────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'ccv2-body';
    overlay.appendChild(body);

    // ── Viewport column ───────────────────────────────────────────────────────
    const vpCol = document.createElement('div');
    vpCol.className = 'ccv2-vp-col';
    body.appendChild(vpCol);

    // Canvas (fills vpCol via CSS width/height 100%)
    const canvas = document.createElement('canvas');
    canvas.className = 'ccv2-canvas';
    canvas.setAttribute('tabindex', '0');
    vpCol.appendChild(canvas);
    this._vpCanvas = canvas;

    // HUD overlay
    const hud = document.createElement('div');
    hud.className = 'ccv2-vp-hud';

    const badge = document.createElement('div');
    badge.className = 'ccv2-char-badge ccv2-badge--hint';
    badge.textContent = '← Choose a character';
    this._charBadge = badge;

    const hint = document.createElement('div');
    hint.className = 'ccv2-vp-hint';
    hint.textContent = 'Drag to orbit  ·  Scroll to zoom  ·  Click to move';

    hud.append(badge, hint);
    vpCol.appendChild(hud);

    const loadRing = document.createElement('div');
    loadRing.className = 'ccv2-loading-ring';
    vpCol.appendChild(loadRing);
    this._loadingRing = loadRing;

    // ── Right panel ───────────────────────────────────────────────────────────
    const panel = document.createElement('div');
    panel.className = 'ccv2-panel';
    body.appendChild(panel);

    // Character section
    const charLabel = document.createElement('div');
    charLabel.className = 'ccv2-section-label';
    charLabel.textContent = 'Choose Character';
    panel.appendChild(charLabel);

    const browserWrap = document.createElement('div');
    browserWrap.className = 'ccv2-browser-wrap';
    panel.appendChild(browserWrap);
    this._browserWrap = browserWrap;

    // Name section
    const nameLabel = document.createElement('div');
    nameLabel.className = 'ccv2-section-label';
    nameLabel.textContent = 'Name';
    panel.appendChild(nameLabel);

    const nameInput = document.createElement('input');
    nameInput.className = 'ccv2-name-input';
    nameInput.type = 'text';
    nameInput.placeholder = 'Enter a name...';
    nameInput.maxLength = 24;
    panel.appendChild(nameInput);
    this._nameInput = nameInput;

    // Boon section
    const boonLabel = document.createElement('div');
    boonLabel.className = 'ccv2-section-label';
    boonLabel.textContent = 'Starting Boon';
    panel.appendChild(boonLabel);

    const boonsList = document.createElement('div');
    boonsList.className = 'ccv2-boons';
    for (const b of BOONS) {
      const card = document.createElement('div');
      card.className = 'ccv2-boon-card' + (b.id === this._boon ? ' ccv2-boon--on' : '');
      card.dataset['boon'] = b.id;

      const icon  = document.createElement('div'); icon.className  = 'ccv2-boon-icon';  icon.textContent  = b.icon;
      const texts = document.createElement('div');
      const ttl   = document.createElement('div'); ttl.className   = 'ccv2-boon-title'; ttl.textContent   = b.title;
      const eff   = document.createElement('div'); eff.className   = 'ccv2-boon-effect'; eff.textContent  = b.effect;
      texts.append(ttl, eff);
      card.append(icon, texts);
      card.onclick = () => this._setBoon(b.id);
      boonsList.appendChild(card);
      this._boonCards.set(b.id, card);
    }
    panel.appendChild(boonsList);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'ccv2-actions';

    const backBtn = document.createElement('button');
    backBtn.className = 'ccv2-btn ccv2-btn-back';
    backBtn.textContent = '← Back';
    backBtn.onclick = () => {
      this.hide();
      this.onBack?.();
    };

    const beginBtn = document.createElement('button');
    beginBtn.className = 'ccv2-btn ccv2-btn-begin';
    beginBtn.textContent = 'Begin →';
    beginBtn.onclick = () => {
      if (!this._assetModel) {
        // Flash the badge to signal they need to pick a character
        this._charBadge.style.borderColor = '#cc3030';
        setTimeout(() => { this._charBadge.style.borderColor = ''; }, 600);
        return;
      }
      const cfg: CharacterConfig = {
        name:       this._nameInput.value.trim() || 'Wanderer',
        boon:       this._boon,
        slotId:     this._slotId,
        dna:        { /* not used in asset mode */ } as any,
        assetModel: this._assetModel,
      };
      this.onComplete?.(cfg);
    };

    actions.append(backBtn, beginBtn);
    panel.appendChild(actions);

    return overlay;
  }
}
