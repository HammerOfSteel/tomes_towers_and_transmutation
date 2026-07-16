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

  constructor(aspectRatio: number) {
    this._aspect = aspectRatio;
    const hw = (FRUSTUM_HEIGHT * aspectRatio) / 2;
    const hh = FRUSTUM_HEIGHT / 2;
    this.camera = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 300);
    this.camera.position.copy(ISO_OFFSET);
    this.camera.lookAt(0, 0, 0);
  }

  /** Translate the camera so it tracks the given world-space position.
   *  The isometric angle is preserved — only x/z are inherited from target. */
  follow(target: THREE.Vector3): void {
    this.camera.position.set(
      target.x + ISO_OFFSET.x,
      ISO_OFFSET.y,
      target.z + ISO_OFFSET.z,
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
   * Smoothly lerp the frustum toward the scroll target.
   * Call once per frame before rendering.
   */
  updateZoom(dt: number): void {
    const lerpSpeed = Math.min(1, 12 * dt);
    this._frustumHeight += (this._targetFrustumHeight - this._frustumHeight) * lerpSpeed;
    this._applyFrustum();
  }

  /** Call on window resize to keep the frustum proportional. */
  resize(aspectRatio: number): void {
    this._aspect = aspectRatio;
    this._applyFrustum();
  }

  private _applyFrustum(): void {
    const hw = (this._frustumHeight * this._aspect) / 2;
    const hh = this._frustumHeight / 2;
    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
  }
}
