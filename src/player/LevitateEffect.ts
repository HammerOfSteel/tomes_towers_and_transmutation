/**
 * LevitateEffect.ts — Cloud-puff particle ring drawn at the player's feet
 * while the levitate buff is active and space is held.
 *
 * Attach `effect.group` to the player's root group once; call `update(dt, active)`
 * every frame.  The group's Y position should be kept at 0 (relative to player);
 * the puffs offset themselves to foot level internally.
 */

import * as THREE from 'three';

// Number of puff particles in the ring
const PUFF_COUNT   = 10;
// Ring radius around the player's foot axis
const RING_RADIUS  = 0.38;
// Y offset relative to player group centre (feet ≈ -0.95 for default capsule)
const FOOT_Y       = -0.88;
// Rotation speed of the ring (radians/s)
const ORBIT_SPEED  = 0.9;
// Puff scale range
const PUFF_MIN     = 0.10;
const PUFF_MAX     = 0.22;
// Max opacity while fully active
const MAX_OPACITY  = 0.55;
// Lerp speed for fade-in/out
const FADE_SPEED   = 5.0;

export class LevitateEffect {
  readonly group = new THREE.Group();

  private readonly _puffs: THREE.Mesh[] = [];
  private _t = 0;
  private _active = false;

  constructor() {
    this.group.userData.isNotOccluder = true;

    for (let i = 0; i < PUFF_COUNT; i++) {
      const r    = PUFF_MIN + Math.random() * (PUFF_MAX - PUFF_MIN);
      const geo  = new THREE.SphereGeometry(r, 5, 3);
      const mat  = new THREE.MeshBasicMaterial({
        color:       new THREE.Color(0xddeeff),
        transparent: true,
        opacity:     0,
        depthWrite:  false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.isNotOccluder = true;
      this._puffs.push(mesh);
      this.group.add(mesh);
    }
  }

  /**
   * Call every frame.
   * @param dt      Delta-time in seconds.
   * @param active  True while buff is active AND space is held.
   * @returns       Sinusoidal bob offset in world-Y (add to levitate target height).
   */
  update(dt: number, active: boolean): number {
    this._t += dt;
    this._active = active;

    const targetOpacityBase = active ? MAX_OPACITY : 0;

    for (let i = 0; i < PUFF_COUNT; i++) {
      const mesh  = this._puffs[i]!;
      const mat   = mesh.material as THREE.MeshBasicMaterial;

      // Orbit angle — each puff evenly spaced + individual wobble
      const baseAngle  = (i / PUFF_COUNT) * Math.PI * 2;
      const angle      = baseAngle + this._t * ORBIT_SPEED;

      // Radius pulses slightly per-puff
      const r = RING_RADIUS + Math.sin(this._t * 2.1 + i * 1.3) * 0.07;

      // Y: foot level + slight vertical drift per puff
      const yWobble = Math.sin(this._t * 1.7 + i * 0.9) * 0.10;

      mesh.position.set(
        Math.sin(angle) * r,
        FOOT_Y + yWobble,
        Math.cos(angle) * r,
      );

      // Scale pulse
      const scale = 0.85 + Math.sin(this._t * 2.5 + i * 1.1) * 0.15;
      mesh.scale.setScalar(scale);

      // Per-puff opacity variation (staggered breathing)
      const targetOp = targetOpacityBase * (0.6 + Math.sin(this._t * 1.9 + i * 0.8) * 0.4);
      mat.opacity += (targetOp - mat.opacity) * Math.min(1, dt * FADE_SPEED);
    }

    // Sinusoidal bob: 0.15 WU amplitude at ~1.5 Hz
    return active ? Math.sin(this._t * Math.PI * 1.5) * 0.15 : 0;
  }

  dispose(): void {
    for (const m of this._puffs) {
      m.geometry.dispose();
      (m.material as THREE.MeshBasicMaterial).dispose();
    }
    this._puffs.length = 0;
  }
}
