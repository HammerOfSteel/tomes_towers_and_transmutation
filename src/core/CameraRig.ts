import * as THREE from 'three';

/** Default world-unit height of the visible frustum. */
export const FRUSTUM_HEIGHT = 22;

/** Minimum / maximum zoom frustum height (scroll clamp). */
const ZOOM_MIN = 10;
const ZOOM_MAX = 40;

/** Speed multiplier applied to each wheel tick. */
const ZOOM_SCROLL_FACTOR = 0.12;

/** WoW-mode orbit-camera tuning. */
const WOW_DISTANCE_DEFAULT = 12;
const WOW_DISTANCE_MIN = 6;
const WOW_DISTANCE_MAX = 22;
/** Wheel-tick distance change factor (mirrors ZOOM_SCROLL_FACTOR's feel). */
const WOW_DISTANCE_SCROLL_FACTOR = 0.02;
/** Pitch is the elevation angle above the horizontal plane through the target.
 *  0 = camera level with target (never allowed — would clip into the player);
 *  PI/2 = camera directly overhead (never allowed — disorienting top-down flip). */
const WOW_PITCH_DEFAULT = (25 * Math.PI) / 180;
const WOW_PITCH_MIN = (5 * Math.PI) / 180;
const WOW_PITCH_MAX = (80 * Math.PI) / 180;
/** Mouse-drag sensitivity, radians per pixel of mouse movement. */
export const WOW_YAW_SENSITIVITY = 0.006;
export const WOW_PITCH_SENSITIVITY = 0.006;

/** Fixed world-space offset from the tracked target to the camera position.
 *  This defines the isometric angle: equal x/z distance, slightly steeper y. */
export const ISO_OFFSET = new THREE.Vector3(14, 20, 14);

/** Orthographic camera locked to a fixed isometric angle.
 *
 *  Usage:
 *    const rig = new CameraRig(window.innerWidth / window.innerHeight);
 *    rig.follow(player.group.position);
 *    renderer.render(scene, rig.camera);
 *
 *  Scroll-to-zoom: call rig.applyScroll(event.deltaY) on wheel events.
 */
export class CameraRig {
  readonly camera: THREE.OrthographicCamera;
  private _aspect: number;
  private _frustumHeight: number = FRUSTUM_HEIGHT;
  private _targetFrustumHeight: number = FRUSTUM_HEIGHT;

  // ── Screen shake ──────────────────────────────────────────────────────────
  private _shakeTimer    = 0;
  private _shakeDuration = 0;
  private _shakeMag      = 0;

  // ── Spell-cast zoom punch ─────────────────────────────────────────────────
  private _punchOffset   = 0;   // current frustum offset (negative = zoom in)
  private _punchTimer    = 0;
  private _punchDuration = 0;

  // ── WoW-style third-person orbit camera ────────────────────────────────────
  private _mode: 'isometric' | 'wow' = 'isometric';
  private _yaw = 0;
  private _pitch = WOW_PITCH_DEFAULT;
  private _distance = WOW_DISTANCE_DEFAULT;
  private readonly _modeChangeListeners: Array<(mode: 'isometric' | 'wow') => void> = [];

  constructor(aspectRatio: number) {
    this._aspect = aspectRatio;
    const hw = (FRUSTUM_HEIGHT * aspectRatio) / 2;
    const hh = FRUSTUM_HEIGHT / 2;
    this.camera = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 300);
    this.camera.position.copy(ISO_OFFSET);
    this.camera.lookAt(0, 0, 0);
  }

  /** Active camera mode. Isometric is the default and is unaffected by WoW-mode state. */
  get mode(): 'isometric' | 'wow' { return this._mode; }

  /** Current WoW-mode horizontal orbit angle, radians. Meaningless in isometric mode. */
  get yaw(): number { return this._yaw; }

  /** Current WoW-mode elevation angle above horizontal, radians, clamped to
   *  [WOW_PITCH_MIN, WOW_PITCH_MAX]. Meaningless in isometric mode. */
  get pitch(): number { return this._pitch; }

  /** Current WoW-mode orbit distance, world units, clamped to
   *  [WOW_DISTANCE_MIN, WOW_DISTANCE_MAX]. Meaningless in isometric mode. */
  get distance(): number { return this._distance; }

  /** Register a callback fired whenever the mode changes (via toggleMode()). */
  onModeChange(callback: (mode: 'isometric' | 'wow') => void): void {
    this._modeChangeListeners.push(callback);
  }

  /**
   * Switch between isometric and WoW camera modes.
   * @param playerFacingAngle  The player's current facing angle (radians, same
   *   convention as PlayerController.facingAngleRad). Used to initialize yaw
   *   so the camera starts behind the player when entering WoW mode. Ignored
   *   when switching back to isometric.
   */
  toggleMode(playerFacingAngle: number): void {
    this._mode = this._mode === 'isometric' ? 'wow' : 'isometric';
    if (this._mode === 'wow') {
      this._yaw = playerFacingAngle;
      this._pitch = WOW_PITCH_DEFAULT;
      this._distance = WOW_DISTANCE_DEFAULT;
    }
    for (const cb of this._modeChangeListeners) cb(this._mode);
  }

  /** Adjust WoW-mode yaw (horizontal orbit angle) by a delta in radians. No-op in isometric mode. */
  adjustYaw(deltaRadians: number): void {
    this._yaw += deltaRadians;
  }

  /** Adjust WoW-mode pitch (elevation angle), clamped. No-op in isometric mode. */
  adjustPitch(deltaRadians: number): void {
    this._pitch = Math.max(WOW_PITCH_MIN, Math.min(WOW_PITCH_MAX, this._pitch + deltaRadians));
  }

  /** Adjust WoW-mode orbit distance, clamped. No-op in isometric mode. */
  adjustDistance(deltaWorldUnits: number): void {
    this._distance = Math.max(WOW_DISTANCE_MIN, Math.min(WOW_DISTANCE_MAX, this._distance + deltaWorldUnits));
  }

  /**
   * Trigger a screen shake.
   * @param magnitude  Peak offset in world units (0.06 = light, 0.2 = heavy)
   * @param duration   Seconds the shake lasts (0.15–0.5 typical)
   */
  shake(magnitude: number, duration: number): void {
    // Only override if new shake is stronger
    if (magnitude >= this._shakeMag) {
      this._shakeMag      = magnitude;
      this._shakeDuration = duration;
      this._shakeTimer    = duration;
    }
  }

  /** Translate the camera so it tracks the given world-space position.
   *  Isometric mode: preserves the fixed isometric angle — only x/z are
   *  inherited from target, y stays fixed, no per-frame lookAt (unchanged
   *  from original behavior).
   *  WoW mode: orbits the camera around the target using yaw/pitch/distance,
   *  calling lookAt every frame so the camera always faces the target.
   *  Screen shake offset is applied in both modes each frame. */
  follow(target: THREE.Vector3, dt = 0.016): void {
    // Decay shake timer
    this._shakeTimer = Math.max(0, this._shakeTimer - dt);
    const shakeFrac = this._shakeDuration > 0
      ? this._shakeTimer / this._shakeDuration
      : 0;
    const mag = this._shakeMag * shakeFrac;

    // Random offset (deterministic-ish via time) for the shake
    const t = performance.now() * 0.001;
    const ox = mag * (Math.sin(t * 47.3) + Math.sin(t * 31.7)) * 0.5;
    const oz = mag * (Math.cos(t * 53.1) + Math.cos(t * 29.9)) * 0.5;

    if (this._mode === 'isometric') {
      this.camera.position.set(
        target.x + ISO_OFFSET.x + ox,
        ISO_OFFSET.y,
        target.z + ISO_OFFSET.z + oz,
      );
      return;
    }

    // WoW mode: spherical-to-Cartesian orbit offset, camera positioned
    // behind the target along its yaw direction (yaw convention matches
    // PlayerController.facingAngleRad: forward = (sin(yaw), 0, cos(yaw))).
    const horiz = this._distance * Math.cos(this._pitch);
    const offsetX = -horiz * Math.sin(this._yaw);
    const offsetZ = -horiz * Math.cos(this._yaw);
    const offsetY = this._distance * Math.sin(this._pitch);

    this.camera.position.set(
      target.x + offsetX + ox,
      target.y + offsetY,
      target.z + offsetZ + oz,
    );
    this.camera.lookAt(target);
  }

  /**
   * Feed mouse-wheel delta to smoothly zoom in/out.
   * Isometric mode: adjusts the orthographic frustum height (unchanged).
   * WoW mode: adjusts orbit distance instead — frustum height is untouched.
   * Call from a 'wheel' event listener: `rig.applyScroll(e.deltaY)`.
   */
  applyScroll(deltaY: number): void {
    if (this._mode === 'wow') {
      this.adjustDistance(deltaY * WOW_DISTANCE_SCROLL_FACTOR);
      return;
    }
    this._targetFrustumHeight *= 1 + deltaY * ZOOM_SCROLL_FACTOR * 0.01;
    this._targetFrustumHeight = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._targetFrustumHeight));
  }

  /**
   * Spell-cast zoom punch: briefly compress the frustum (zoom in) then release.
   * @param amount   Frustum units to compress (1.5–2.5 typical; use positive value)
   * @param duration Seconds for the full punch-and-return (0.15–0.25 typical)
   */
  punch(amount: number, duration: number): void {
    // Don't reset if a stronger punch is already playing
    if (amount >= Math.abs(this._punchOffset)) {
      this._punchOffset   = -Math.abs(amount);
      this._punchDuration = duration;
      this._punchTimer    = duration;
    }
  }

  /**
   * Smoothly lerp the frustum toward the scroll target.
   * Call once per frame before rendering.
   */
  updateZoom(dt: number): void {
    const lerpSpeed = Math.min(1, 12 * dt);
    this._frustumHeight += (this._targetFrustumHeight - this._frustumHeight) * lerpSpeed;

    // Decay punch: returns from negative offset toward 0 over punchDuration
    let punchApplied = 0;
    if (this._punchTimer > 0) {
      this._punchTimer = Math.max(0, this._punchTimer - dt);
      const frac = this._punchDuration > 0 ? this._punchTimer / this._punchDuration : 0;
      punchApplied = this._punchOffset * frac;
    }

    this._applyFrustum(punchApplied);
  }

  /** Call on window resize to keep the frustum proportional. */
  resize(aspectRatio: number): void {
    this._aspect = aspectRatio;
    this._applyFrustum();
  }

  private _applyFrustum(punchOffset = 0): void {
    const effectiveHeight = this._frustumHeight + punchOffset;
    const hw = (effectiveHeight * this._aspect) / 2;
    const hh = effectiveHeight / 2;
    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
  }
}
