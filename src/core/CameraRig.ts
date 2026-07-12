import * as THREE from 'three';

/** World-unit height of the visible frustum (how much vertical world-space
 *  is visible on screen). Tune this to taste for zoom level. */
export const FRUSTUM_HEIGHT = 22;

/** Fixed world-space offset from the tracked target to the camera position.
 *  This defines the isometric angle: equal x/z distance, slightly steeper y. */
export const ISO_OFFSET = new THREE.Vector3(14, 20, 14);

/** Orthographic camera locked to a fixed isometric angle.
 *
 *  Usage:
 *    const rig = new CameraRig(window.innerWidth / window.innerHeight);
 *    rig.follow(player.group.position);
 *    renderer.render(scene, rig.camera);
 */
export class CameraRig {
  readonly camera: THREE.OrthographicCamera;

  constructor(aspectRatio: number) {
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

  /** Call on window resize to keep the frustum proportional. */
  resize(aspectRatio: number): void {
    const hw = (FRUSTUM_HEIGHT * aspectRatio) / 2;
    const hh = FRUSTUM_HEIGHT / 2;
    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
  }
}
