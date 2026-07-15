/**
 * ProceduralBipedWalk — Analytical 2-bone IK procedural walk for upright bipeds.
 *
 * Algorithm
 * ─────────
 *  Two feet alternate: when one leg steps the other stays planted.
 *  A step is triggered when the planted foot drifts beyond STEP_THRESHOLD from
 *  its ideal rest position (hip-spread offset rotated by body yaw + velocity
 *  look-ahead).  The foot arcs to the new target over STEP_DURATION seconds.
 *
 *  Leg IK uses the same law-of-cosines + pole-vector approach as ProceduralWalk:
 *    px = (L1²−L2²+d²) / (2d)   — knee projection along hip→foot
 *    py = √(L1²−px²)             — knee deviation via pole direction
 *  Knees are driven forward (pole = −Z body-local) for a natural human gait.
 *
 *  Body dynamics mimic natural bipedal walking:
 *   • hip sway    : root tilts side-to-side over the planted foot
 *   • forward lean: root pitches slightly forward at speed
 *   • torso counter: torso counter-rotates hip sway and yaw twist
 *   • arm swing   : arms swing opposite to leg phase
 *   • vertical bob: torso rises and falls with each step
 *
 * Usage
 * ─────
 *  const ctrl = new ProceduralBipedWalkController(rig);
 *  ctrl.update(dt, bodyWorldPos, bodyYaw);   // call each frame
 *
 *  naturalFootY — foot Y in root-local space at natural stance; use for
 *  grounding spawned creatures:  rig.root.position.y = -ctrl.naturalFootY
 */

import * as THREE from 'three';
import type { CreatureRig, CreatureBones } from '@/creatures/CreatureBuilder';

// ── Constants ─────────────────────────────────────────────────────────────────

const STEP_THRESHOLD   = 0.18;   // unscaled distance to trigger a step
const STEP_HEIGHT      = 0.20;   // unscaled arc height during swing
const STEP_DURATION    = 0.20;   // seconds for a single step
const LOOK_AHEAD       = 0.18;   // velocity look-ahead scalar
const BOB_AMP          = 0.022;  // vertical bob amplitude
const HIP_SWAY_AMP     = 0.06;   // root side-tilt amplitude (rad)
const TORSO_COUNTER    = 0.18;   // torso yaw counter-rotation amplitude (rad)
const ARM_SWING_AMP    = 0.70;   // arm swing amplitude (rad)
const VEL_LERP         = 8.0;    // velocity EMA smoothing coefficient
const LERP_SETTLE      = 5.0;    // coefficient for lerping dynamics back to rest

type Side = 'L' | 'R';
const SIDES: Side[] = ['L', 'R'];

// ── Module-level scratch — zero allocations in hot path ───────────────────────
const _v1         = new THREE.Vector3();
const _v2         = new THREE.Vector3();
const _v3         = new THREE.Vector3();
const _hipWorld   = new THREE.Vector3();
const _kneeWorld  = new THREE.Vector3();
const _right      = new THREE.Vector3();
const _ortho      = new THREE.Vector3();
const _parentQ    = new THREE.Quaternion();
const _parentQInv = new THREE.Quaternion();
const _q1         = new THREE.Quaternion();
const _Y_DOWN     = new THREE.Vector3(0, -1, 0);
/** Knees bend forward — pole points toward −Z in body-local space. */
const _POLE_LOCAL  = new THREE.Vector3(0, 0, -1);

// ── Per-leg state ─────────────────────────────────────────────────────────────
interface LegState {
  foot:     THREE.Vector3;
  stepping: boolean;
  stepT:    number;
  stepFrom: THREE.Vector3;
  stepTo:   THREE.Vector3;
}

// ── Controller ────────────────────────────────────────────────────────────────
export class ProceduralBipedWalkController {
  private readonly _rig:       CreatureRig;
  private readonly _bones:     CreatureBones;
  private readonly _states:    Map<Side, LegState>       = new Map();
  private readonly _kneeBones: Map<Side, THREE.Group>    = new Map();

  private _prevPos     = new THREE.Vector3();
  private _vel         = new THREE.Vector3();
  private _gaitPhase   = 0;      // 0..1, increments with speed
  private _torsoBaseY  = 0;
  private _inited      = false;

  /** Thigh length (unscaled). */
  private _legL1      = 0.32;
  /** Shin length (unscaled). */
  private _legL2      = 0.34;
  /** Hip lateral spread from center (unscaled). */
  private _restX      = 0.13;
  /**
   * Foot Y in root-local space at natural hanging stance (unscaled).
   * Typically ≈ torso.y + hip.y − L1 − L2 ≈ 0.04 for default biped DNA.
   * Use to ground spawned creatures: `rig.root.position.y = −naturalFootY * scale`.
   */
  private _naturalFootY = 0.04;

  constructor(rig: CreatureRig) {
    this._rig   = rig;
    this._bones = rig.bones;
    this._torsoBaseY = rig.bones.torso?.position.y ?? 0;

    const hipL = this._bones.legL;
    if (hipL) {
      this._restX = Math.abs(hipL.position.x);
      const torsoY = this._bones.torso?.position.y ?? 0;
      const hipY   = hipL.position.y;

      const kneeL = this._bones.legLKnee;
      if (kneeL) {
        this._legL1 = Math.abs(kneeL.position.y);
        // Measure shin tip: lowest Mesh child of kneeGroup
        let shinTip = 0;
        kneeL.children.forEach(child => {
          if (child instanceof THREE.Mesh && child.position.y < shinTip)
            shinTip = child.position.y;
        });
        this._legL2 = shinTip !== 0 ? Math.abs(shinTip) : this._legL1 * (34 / 32);
      } else {
        // 1-bone fallback: split evenly
        let lowest = 0;
        hipL.children.forEach(child => {
          if (child instanceof THREE.Mesh && child.position.y < lowest)
            lowest = child.position.y;
        });
        const total = lowest !== 0 ? Math.abs(lowest) : 0.66;
        this._legL1 = total / 2;
        this._legL2 = total / 2;
      }

      // foot root-local Y at rest = torsoY + hipY − L1 − L2
      this._naturalFootY = torsoY + hipY - this._legL1 - this._legL2;

      for (const side of SIDES) {
        const kk = side === 'L' ? this._bones.legLKnee : this._bones.legRKnee;
        if (kk) this._kneeBones.set(side, kk);
      }
    }

    for (const side of SIDES) {
      this._states.set(side, {
        foot:     new THREE.Vector3(),
        stepping: false,
        stepT:    0,
        stepFrom: new THREE.Vector3(),
        stepTo:   new THREE.Vector3(),
      });
    }
  }

  /** True when the rig has the required leg bones. */
  get isApplicable(): boolean {
    return this._bones.legL != null && this._bones.legR != null;
  }

  /** Foot Y in root-local space at natural stance (unscaled). */
  get naturalFootY(): number { return this._naturalFootY; }

  // ── Ideal foot rest position ───────────────────────────────────────────────
  private _idealFoot(
    side: Side, pos: THREE.Vector3, yaw: number, scale: number, out: THREE.Vector3,
  ): void {
    const xSign = side === 'L' ? -1 : 1;
    const spread = this._restX * scale * 1.15; // slightly wider than hip for stable stance
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    out.set(
      pos.x + xSign * spread * cosY,
      pos.y + this._naturalFootY * scale,
      pos.z + xSign * spread * sinY,
    );
  }

  // ── Main update ───────────────────────────────────────────────────────────
  update(dt: number, bodyPos?: THREE.Vector3, bodyYaw?: number): void {
    if (!this.isApplicable || dt <= 0) return;

    const pos   = bodyPos ?? this._rig.root.position;
    const yaw   = bodyYaw ?? this._rig.root.rotation.y;
    const scale = this._rig.root.scale.x;

    // ── Seed on first call ──────────────────────────────────────────────────
    if (!this._inited) {
      this._inited = true;
      this._prevPos.copy(pos);
      for (const side of SIDES) {
        const s = this._states.get(side)!;
        this._idealFoot(side, pos, yaw, scale, _v1);
        s.foot.copy(_v1);
        s.stepTo.copy(_v1);
      }
    }

    // ── Velocity EMA ───────────────────────────────────────────────────────
    _v3.copy(pos).sub(this._prevPos);
    if (_v3.length() > 0.001) _v2.copy(_v3).divideScalar(dt);
    else                       _v2.set(0, 0, 0);
    this._vel.lerp(_v2, Math.min(1, dt * VEL_LERP));
    this._prevPos.copy(pos);

    const speed       = this._vel.length();
    const speedFactor = Math.min(1, speed / 2.2);

    // ── Advance gait phase ──────────────────────────────────────────────────
    if (speed > 0.05) {
      this._gaitPhase = (this._gaitPhase + dt * speed * 1.3) % 1.0;
    }

    // ── Step trigger — alternating legs ────────────────────────────────────
    for (const side of SIDES) {
      const s = this._states.get(side)!;
      if (s.stepping) continue;

      this._idealFoot(side, pos, yaw, scale, _v1);
      _v1.x += this._vel.x * LOOK_AHEAD;
      _v1.z += this._vel.z * LOOK_AHEAD;

      const dx   = s.foot.x - _v1.x;
      const dz   = s.foot.z - _v1.z;
      const drift = Math.sqrt(dx * dx + dz * dz);
      if (drift > STEP_THRESHOLD * scale) {
        const other = this._states.get(side === 'L' ? 'R' : 'L')!;
        if (!other.stepping) {
          s.stepping = true;
          s.stepT    = 0;
          s.stepFrom.copy(s.foot);
          s.stepTo.copy(_v1);
        }
      }
    }

    // ── Advance steps ───────────────────────────────────────────────────────
    for (const side of SIDES) {
      const s = this._states.get(side)!;
      if (!s.stepping) continue;

      s.stepT = Math.min(1, s.stepT + dt / STEP_DURATION);
      const t  = s.stepT;
      const t2 = t * t * (3 - 2 * t); // smooth-step easing
      s.foot.x = s.stepFrom.x + (s.stepTo.x - s.stepFrom.x) * t2;
      s.foot.z = s.stepFrom.z + (s.stepTo.z - s.stepFrom.z) * t2;
      const baseY = s.stepFrom.y + (s.stepTo.y - s.stepFrom.y) * t2;
      s.foot.y = baseY + Math.sin(t * Math.PI) * STEP_HEIGHT * scale;

      if (s.stepT >= 1) {
        s.stepping = false;
        s.foot.copy(s.stepTo);
        s.foot.y = s.stepTo.y; // snap to rest Y
      }
    }

    // ── Per-leg 2-bone IK ───────────────────────────────────────────────────
    for (const side of SIDES) {
      const hip = side === 'L' ? this._bones.legL : this._bones.legR;
      const s   = this._states.get(side)!;
      if (!hip) continue;

      hip.getWorldPosition(_hipWorld);
      const knee = this._kneeBones.get(side);
      const L1   = this._legL1 * scale;
      const L2   = this._legL2 * scale;

      if (knee && L1 > 0.001 && L2 > 0.001) {
        // ── Analytical law-of-cosines IK ─────────────────────────────────
        _v2.copy(s.foot).sub(_hipWorld);
        let d = _v2.length();
        d = Math.max(0.01, Math.min(d, L1 + L2 - 0.001)); // clamp to reach
        _v2.normalize();

        const px = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
        const py = Math.sqrt(Math.max(0, L1 * L1 - px * px));

        // Knee world position via pole-vector
        _v3.copy(_POLE_LOCAL).transformDirection(this._rig.root.matrixWorld);
        _right.crossVectors(_v3, _v2).normalize();
        if (_right.lengthSq() < 0.001) _right.set(1, 0, 0);
        _ortho.crossVectors(_v2, _right).normalize();

        _kneeWorld.copy(_hipWorld)
          .addScaledVector(_v2, px)
          .addScaledVector(_ortho, py);

        // Orient hip: local −Y → direction to knee
        _v3.copy(_kneeWorld).sub(_hipWorld);
        if (_v3.lengthSq() < 0.0001) _v3.set(0, -1, 0);
        _v3.normalize();
        if (hip.parent) {
          hip.parent.getWorldQuaternion(_parentQ);
          _parentQInv.copy(_parentQ).invert();
          _v3.applyQuaternion(_parentQInv);
        }
        _q1.setFromUnitVectors(_Y_DOWN, _v3);
        hip.quaternion.copy(_q1);
        hip.updateMatrixWorld(true);

        // Reposition knee node in hip-local space
        _v1.copy(_kneeWorld);
        hip.worldToLocal(_v1);
        knee.position.copy(_v1);
        knee.updateMatrixWorld(true);

        // Orient knee: local −Y → direction to foot
        knee.getWorldPosition(_v2);
        _v3.copy(s.foot).sub(_v2);
        if (_v3.lengthSq() < 0.0001) _v3.set(0, -1, 0);
        _v3.normalize();
        hip.getWorldQuaternion(_parentQ);
        _parentQInv.copy(_parentQ).invert();
        _v3.applyQuaternion(_parentQInv);
        _q1.setFromUnitVectors(_Y_DOWN, _v3);
        knee.quaternion.copy(_q1);
      } else {
        // ── 1-bone fallback (no kneeGroup present) ────────────────────────
        _v2.copy(s.foot).sub(_hipWorld);
        if (hip.parent) {
          hip.parent.getWorldQuaternion(_parentQ);
          _parentQInv.copy(_parentQ).invert();
          _v1.copy(_v2).applyQuaternion(_parentQInv);
        } else {
          _v1.copy(_v2);
        }
        if (_v1.lengthSq() < 0.01) _v1.set(0, -1, 0);
        _v1.normalize();
        const targetRx = Math.atan2(_v1.z, -_v1.y);
        const targetRz = Math.atan2(-_v1.x, -_v1.y);
        const alpha    = Math.min(1, dt * 22);
        hip.rotation.x += (targetRx - hip.rotation.x) * alpha;
        hip.rotation.z += (targetRz - hip.rotation.z) * alpha;
      }
    }

    // ── Body dynamics ───────────────────────────────────────────────────────
    const cycleRads = this._gaitPhase * Math.PI * 2;
    const torso     = this._bones.torso;

    // Vertical bob
    if (torso) {
      const bob = speed > 0.1
        ? Math.abs(Math.sin(cycleRads)) * BOB_AMP * scale * speedFactor
        : 0;
      torso.position.y = THREE.MathUtils.lerp(
        torso.position.y, this._torsoBaseY + bob, Math.min(1, dt * 8),
      );
    }

    if (speed > 0.1) {
      // Hip sway: root tilts sideways over planted foot
      this._rig.root.rotation.z = Math.sin(cycleRads * 2) * HIP_SWAY_AMP * speedFactor;
      // Forward lean at speed
      this._rig.root.rotation.x = speedFactor * 0.08;
      // Torso counter-rotation keeps upper body more upright
      if (torso) {
        torso.rotation.z = -this._rig.root.rotation.z * 0.65;
        torso.rotation.y = -Math.sin(cycleRads) * TORSO_COUNTER * speedFactor;
      }
    } else {
      const lerp = Math.min(1, dt * LERP_SETTLE);
      this._rig.root.rotation.z = THREE.MathUtils.lerp(this._rig.root.rotation.z, 0, lerp);
      this._rig.root.rotation.x = THREE.MathUtils.lerp(this._rig.root.rotation.x, 0, lerp);
      if (torso) {
        torso.rotation.z = THREE.MathUtils.lerp(torso.rotation.z, 0, lerp);
        torso.rotation.y = THREE.MathUtils.lerp(torso.rotation.y, 0, lerp);
      }
    }

    // Arm swing: arms alternate opposite to gait phase
    const armSwing = Math.sin(cycleRads) * ARM_SWING_AMP * speedFactor;
    if (this._bones.armL) this._bones.armL.rotation.x =  armSwing;
    if (this._bones.armR) this._bones.armR.rotation.x = -armSwing;
  }

  /** Reset all step state — call when teleporting or respawning. */
  reset(): void {
    this._inited    = false;
    this._gaitPhase = 0;
    if (this._bones.armL) this._bones.armL.rotation.x = 0.06;
    if (this._bones.armR) this._bones.armR.rotation.x = 0.06;
  }
}
