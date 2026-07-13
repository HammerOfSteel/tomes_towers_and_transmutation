// ── TelescopeView ─────────────────────────────────────────────────────────────
//
//  Remote-viewing telescope: activates an exterior orbit camera mode so the
//  player can survey the overworld from the Observatory without leaving.
//
//  When show() is called, the caller should already have:
//    1. Unloaded the interior room (sceneManager.unloadCurrentRoom)
//    2. Entered the overworld scene (overworld.enter())
//    3. Hidden the player mesh (player.group.visible = false)
//    4. Set the exterior sky/fog
//
//  The TelescopeView then takes over the camera for rendering until hide() is
//  called (ESC or the close button).  update(dt) must be called each frame
//  while active; render using telescopeView.camera instead of cameraRig.camera.
//
//  Controls:
//    Mouse drag  — orbit (theta / phi)
//    Scroll      — zoom (radius)
//    Arrow keys  — pan the target point (WASD also work)
//    ESC         — close

import * as THREE from 'three';

// ── TelescopeView ─────────────────────────────────────────────────────────────

export class TelescopeView {
  // The orbit camera — caller must use this for renderer.render() while active
  readonly camera: THREE.PerspectiveCamera;

  // Spherical coordinates centred on `target`
  private phi    = 0.30;   // elevation (0 = straight up, π/2 = horizon)
  private theta  = 0.0;   // azimuth
  private radius = 130;   // distance from target

  private readonly MIN_RADIUS = 8;
  private readonly MAX_RADIUS = 420;

  private target = new THREE.Vector3(0, 0, 0);

  // DOM overlay (eyepiece vignette + controls hint)
  private overlay: HTMLDivElement | null = null;

  // Drag state
  private isDragging = false;
  private lastDragX  = 0;
  private lastDragY  = 0;

  // Keys currently held (for continuous pan)
  private keysHeld = new Set<string>();

  // Reference to the game canvas so we can set cursor and attach wheel/mouse events
  private gameCanvas: HTMLCanvasElement | null = null;

  private isOpen = false;

  /** Called (once) when the view closes so callers can restore interior mode. */
  onClose: (() => void) | null = null;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      48,
      window.innerWidth / window.innerHeight,
      0.5,
      2000,
    );
    this._syncCamera();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get active(): boolean { return this.isOpen; }

  /**
   * Activate the telescope.  Pass the game renderer's canvas so the orbit
   * cursor and mouse events can be attached.
   */
  show(rendererCanvas: HTMLCanvasElement): void {
    if (this.isOpen) return;
    this.isOpen    = true;
    this.gameCanvas = rendererCanvas;
    rendererCanvas.style.cursor = 'grab';
    this._buildOverlay();
    this._bindInput();
    this._syncCamera();
  }

  /** Deactivate the telescope and fire onClose. */
  hide(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this._unbindInput();
    this.overlay?.remove();
    this.overlay = null;
    if (this.gameCanvas) {
      this.gameCanvas.style.cursor = '';
      this.gameCanvas = null;
    }
    this.onClose?.();
  }

  /** Call on window resize while the telescope is open. */
  updateAspect(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Call each frame while active to apply key-based panning. */
  update(dt: number): void {
    if (!this.isOpen) return;
    this._applyKeyPan(dt);
    this._syncCamera();
  }

  // ── Camera maths ───────────────────────────────────────────────────────────

  private _syncCamera(): void {
    const sinPhi   = Math.sin(this.phi);
    const cosPhi   = Math.cos(this.phi);
    const sinTheta = Math.sin(this.theta);
    const cosTheta = Math.cos(this.theta);

    this.camera.position.set(
      this.target.x + this.radius * sinPhi * sinTheta,
      this.target.y + this.radius * cosPhi,
      this.target.z + this.radius * sinPhi * cosTheta,
    );
    this.camera.lookAt(this.target);
  }

  // ── Key panning ────────────────────────────────────────────────────────────

  private _applyKeyPan(dt: number): void {
    const speed = this.radius * 0.9 * dt;

    // Forward/right vectors in the XZ plane aligned with current azimuth
    const fwdX  =  Math.sin(this.theta);
    const fwdZ  =  Math.cos(this.theta);
    const rightX =  Math.cos(this.theta);
    const rightZ = -Math.sin(this.theta);

    if (this.keysHeld.has('ArrowUp')    || this.keysHeld.has('w') || this.keysHeld.has('W')) {
      this.target.x += fwdX * speed;
      this.target.z += fwdZ * speed;
    }
    if (this.keysHeld.has('ArrowDown')  || this.keysHeld.has('s') || this.keysHeld.has('S')) {
      this.target.x -= fwdX * speed;
      this.target.z -= fwdZ * speed;
    }
    if (this.keysHeld.has('ArrowLeft')  || this.keysHeld.has('a') || this.keysHeld.has('A')) {
      this.target.x -= rightX * speed;
      this.target.z -= rightZ * speed;
    }
    if (this.keysHeld.has('ArrowRight') || this.keysHeld.has('d') || this.keysHeld.has('D')) {
      this.target.x += rightX * speed;
      this.target.z += rightZ * speed;
    }
  }

  // ── DOM overlay ────────────────────────────────────────────────────────────

  private _buildOverlay(): void {
    const ov = document.createElement('div');
    Object.assign(ov.style, {
      position:      'fixed',
      inset:         '0',
      zIndex:        '300',
      pointerEvents: 'none',
      // Dark vignette with transparent centre — telescope eyepiece feel
      background:    [
        'radial-gradient(',
        '  ellipse 52% 52% at 50% 50%,',
        '  transparent 0%,',
        '  transparent 30%,',
        '  rgba(0,0,0,0.10) 44%,',
        '  rgba(0,0,0,0.55) 62%,',
        '  rgba(0,0,0,0.92) 74%,',
        '  rgba(0,0,0,1.00) 82%',
        ')',
      ].join(''),
    });

    // ── Label ───────────────────────────────────────────────────────────────
    const label = document.createElement('div');
    Object.assign(label.style, {
      position:    'absolute',
      top:         '18px',
      left:        '24px',
      color:       '#ccaaff',
      font:        'bold 12px monospace',
      letterSpacing: '0.12em',
      textShadow:  '0 0 8px #8855cc',
      pointerEvents: 'none',
    });
    label.textContent = '◈  REMOTE VIEW  —  TELESCOPE ACTIVE';
    ov.appendChild(label);

    // ── Close button ────────────────────────────────────────────────────────
    const closeBtn = document.createElement('button');
    Object.assign(closeBtn.style, {
      position:    'absolute',
      top:         '14px',
      right:       '20px',
      background:  'rgba(14,10,28,0.92)',
      border:      '1px solid #554477',
      borderRadius:'4px',
      color:       '#aa88cc',
      font:        '12px monospace',
      padding:     '5px 14px',
      cursor:      'pointer',
      pointerEvents: 'auto',
    });
    closeBtn.textContent = '✕  Close telescope';
    closeBtn.addEventListener('click', () => this.hide());
    ov.appendChild(closeBtn);

    // ── Controls hint (bottom bar) ───────────────────────────────────────────
    const hint = document.createElement('div');
    Object.assign(hint.style, {
      position:    'absolute',
      bottom:      '26px',
      left:        '50%',
      transform:   'translateX(-50%)',
      background:  'rgba(8,6,18,0.88)',
      border:      '1px solid #332255',
      borderRadius:'4px',
      padding:     '7px 20px',
      color:       '#9988aa',
      font:        '11px monospace',
      letterSpacing:'0.04em',
      whiteSpace:  'nowrap',
      pointerEvents:'none',
    });
    hint.innerHTML =
      'drag to orbit  ·  scroll to zoom  ·  ' +
      '<span style="color:#ccaaff">← → ↑ ↓</span> to pan  ·  ' +
      '<kbd style="background:#221833;border:1px solid #554477;border-radius:2px;' +
      'padding:1px 6px;color:#cc88ff;font-size:11px">ESC</kbd> to close';
    ov.appendChild(hint);

    document.body.appendChild(ov);
    this.overlay = ov;
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private _onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    this.isDragging = true;
    this.lastDragX  = e.clientX;
    this.lastDragY  = e.clientY;
    if (this.gameCanvas) this.gameCanvas.style.cursor = 'grabbing';
  };

  private _onMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastDragX;
    const dy = e.clientY - this.lastDragY;
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;
    // Horizontal drag → spin azimuth
    this.theta -= dx * 0.005;
    // Vertical drag → tilt elevation (clamped: never flip past horizon or zenith)
    this.phi = Math.max(0.04, Math.min(Math.PI * 0.49, this.phi + dy * 0.005));
  };

  private _onMouseUp = () => {
    this.isDragging = false;
    if (this.gameCanvas) this.gameCanvas.style.cursor = 'grab';
  };

  private _onWheel = (e: WheelEvent) => {
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    this.radius = Math.max(this.MIN_RADIUS, Math.min(this.MAX_RADIUS, this.radius * factor));
    e.preventDefault();
    e.stopPropagation();
  };

  private _onKeyDown = (e: KeyboardEvent) => {
    this.keysHeld.add(e.key);
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      this.hide();
      return;
    }
    const consumed = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','w','a','s','d','W','A','S','D'];
    if (consumed.includes(e.key)) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  private _onKeyUp = (e: KeyboardEvent) => {
    this.keysHeld.delete(e.key);
  };

  private _bindInput(): void {
    // Mouse events on the game canvas (so they go to the 3D viewport)
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup',   this._onMouseUp);
    // Wheel on window with capture so we can prevent default
    window.addEventListener('wheel', this._onWheel, { passive: false, capture: true });
    // Keyboard captured so ESC / arrows don't leak to the pause menu handler
    window.addEventListener('keydown', this._onKeyDown, { capture: true });
    window.addEventListener('keyup',   this._onKeyUp);
  }

  private _unbindInput(): void {
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup',   this._onMouseUp);
    window.removeEventListener('wheel', this._onWheel, { capture: true });
    window.removeEventListener('keydown', this._onKeyDown, { capture: true });
    window.removeEventListener('keyup',   this._onKeyUp);
  }
}
