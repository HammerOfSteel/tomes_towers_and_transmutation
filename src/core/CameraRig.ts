import * as THREE from 'three';

/** Default world-unit height of the visible frustum. */
export const FRUSTUM_HEIGHT = 22;

/** Minimum / maximum zoom frustum height (scroll clamp). */
const ZOOM_MIN = 10;
const ZOOM_MAX = 40;

/** Speed multiplier applied to each wheel tick. */
const ZOOM_SCROLL_FACTOR = 0.12;

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

  constructor(aspectRatio: number) {
    this._aspect = aspectRatio;
    const hw = (FRUSTUM_HEIGHT * aspectRatio) / 2;
    const hh = FRUSTUM_HEIGHT / 2;
    this.camera = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 300);
    this.camera.position.copy(ISO_OFFSET);
    this.camera.lookAt(0, 0, 0);
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
   *  The isometric angle is preserved — only x/z are inherited from target.
   *  Screen shake offset is applied here each frame. */
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

    this.camera.position.set(
      target.x + ISO_OFFSET.x + ox,
      ISO_OFFSET.y,
      target.z + ISO_OFFSET.z + oz,
    );
  }

  /**
   * Feed mouse-wheel delta to smoothly zoom in/out.
   * Call from a 'wheel' event listener: `rig.applyScroll(e.deltaY)`.
   */
  applyScroll(deltaY: number): void {
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
