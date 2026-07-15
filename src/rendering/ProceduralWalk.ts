/**
 * ProceduralWalk — Phase 7.5e
 *
 * Spider/insect-style procedural walking for four-legged creatures.
 *
 * Algorithm overview
 * ──────────────────
 *  Each leg has a world-space "foot position" that stays planted while the body
 *  moves.  Every frame the system computes an *ideal* foot position (rest offset
 *  rotated by body yaw + velocity look-ahead).  When the planted foot drifts too
 *  far from that ideal it triggers a *step* — the foot smoothly arcs to the new
 *  target over STEP_DURATION seconds.
 *
 *  Diagonal gait constraint:  front-left pairs with back-right, front-right
 *  pairs with back-left.  A leg only steps if its diagonal partner is currently
 *  planted, so legs always alternate in a trot gait.
 *
 *  Leg IK:  after foot positions are resolved, each hip Group is rotated so its
 *  local -Y axis points from the hip joint toward the foot.  This works with the
 *  existing single-joint CreatureBuilder quad rig without modification.
 *
 *  Body height:  torso Y smoothly follows the average of the four foot heights
 *  plus the rest standing height, giving natural up/down body motion.
 *
 * Usage
 * ─────
 *  const ctrl = new ProceduralWalkController(rig);
 *  // each frame:
 *  ctrl.update(dt, bodyWorldPos, bodyYaw);
 *
 *  The controller reads `rig.root.position` + `rig.root.rotation.y` if you do
 *  not pass them explicitly; the overload is useful when the creature position
 *  is managed externally (physics, KCC, etc.).
 */

import * as THREE from 'three';
import type { CreatureRig, CreatureBones } from '@/creatures/CreatureBuilder';
import { computeQuadNaturalFootY } from '@/creatures/CreatureBuilder';

// ── Constants ─────────────────────────────────────────────────────────────────
// Geometry-independent constants only.  Rest radii and natural foot height are
// computed at construction time from the actual rig so they work for any DNA.

/** Trigger a step when the foot is this far from its ideal position (unscaled). */
const STEP_THRESHOLD = 0.22;

/** How high the foot arcs above the rest height during a step (unscaled). */
const STEP_HEIGHT = 0.20;

/** Duration of a single step in seconds. */
const STEP_DURATION = 0.16;

/** Look-ahead: foot target is shifted in velocity direction by this many seconds. */
const LOOK_AHEAD = 0.22;

/** Lerp speed for hip Euler angle smoothing. */
const HIP_LERP = 18.0;

/** Bob cycles per WU of forward travel. */
const BOB_RATE = 3.5;
/** Bob amplitude in local torso units. */
const BOB_AMP  = 0.030;

// ── Types ─────────────────────────────────────────────────────────────────────

type LegKey = 'frontLegL' | 'frontLegR' | 'backLegL' | 'backLegR';

const LEG_KEYS: LegKey[] = ['frontLegL', 'frontLegR', 'backLegL', 'backLegR'];

/** Which pairs are diagonally opposite — never step at the same time. */
const DIAGONAL_PAIRS: [LegKey, LegKey][] = [
  ['frontLegL', 'backLegR'],
  ['frontLegR', 'backLegL'],
];

/** Body-local pole direction for each leg.
 *  Transformed to world space each frame so the knee always bends the right way.
 *  Front: (0,0,+1) = backward of animal → elbow bends backward.
 *  Back:  (0,0,-1) = forward of animal  → stifle bends forward. */
const KNEE_POLE_LOCAL: Record<LegKey, THREE.Vector3> = {
  frontLegL: new THREE.Vector3(0, 0, 1),
  frontLegR: new THREE.Vector3(0, 0, 1),
  backLegL:  new THREE.Vector3(0, 0, -1),
  backLegR:  new THREE.Vector3(0, 0, -1),
} as const;

/** Maps each hip leg key to its knee bone key in CreatureBones. */
const KNEE_BONE_KEYS: Array<[LegKey, 'frontLegLKnee' | 'frontLegRKnee' | 'backLegLKnee' | 'backLegRKnee']> = [
  ['frontLegL', 'frontLegLKnee'],
  ['frontLegR', 'frontLegRKnee'],
  ['backLegL',  'backLegLKnee'],
  ['backLegR',  'backLegRKnee'],
];

interface LegState {
  foot:     THREE.Vector3;
  stepping: boolean;
  stepT:    number;
  stepFrom: THREE.Vector3;
  stepTo:   THREE.Vector3;
}

// ── Scratch objects (avoid GC) ────────────────────────────────────────────────

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

// ── ProceduralWalkController ──────────────────────────────────────────────────

export class ProceduralWalkController {

  private readonly _rig:    CreatureRig;
  private readonly _bones:  CreatureBones;
  private readonly _states: Map<LegKey, LegState> = new Map();
  /** Knee bone for each leg (absent for legacy 1-bone rigs). */
  private readonly _kneeBones: Map<LegKey, THREE.Group> = new Map();

  private _prevPos = new THREE.Vector3();
  private _vel     = new THREE.Vector3();
  private _bobPhase = 0;
  private _torsoBaseY = 0;
  private _inited  = false;

  // ── Geometry measured from rig at construction time ────────────────────────
  private _restX = 0.50;
  private _restZ = 0.88;
  private _naturalFootY = 0.33;
  /** Upper-leg length (hip → knee), unscaled. */
  private _legL1 = 0.26;
  /** Lower-leg length (knee → paw), unscaled. */
  private _legL2 = 0.26;

  constructor(rig: CreatureRig) {
    this._rig   = rig;
    this._bones = rig.bones;
    this._torsoBaseY = rig.bones.torso?.position.y ?? 0.95;

    const hipFL = this._bones.frontLegL;
    if (hipFL) {
      const hipX = Math.abs(hipFL.position.x);
      const hipZ = Math.abs(hipFL.position.z);

      // Rest radii: foot placed slightly wider and ahead/behind of hip
      this._restX = hipX + 0.10;
      this._restZ = hipZ + 0.28;

      // Limb lengths: read from knee bone if available (2-bone rig)
      const kneeFL = this._bones.frontLegLKnee;
      if (kneeFL) {
        this._legL1 = Math.abs(kneeFL.position.y);  // hip → knee
        let pawY = 0;
        kneeFL.children.forEach(child => {
          if (child instanceof THREE.Mesh && child.position.y < pawY) pawY = child.position.y;
        });
        this._legL2 = pawY !== 0 ? Math.abs(pawY) : this._legL1 * (25 / 27);
      } else {
        // 1-bone fallback: split total reach in half
        const totalLen = (() => {
          let lowest = 0;
          hipFL.children.forEach(child => {
            if (child instanceof THREE.Mesh && child.position.y < lowest) lowest = child.position.y;
          });
          return lowest !== 0 ? Math.abs(lowest) : 0.52;
        })();
        this._legL1 = totalLen / 2;
        this._legL2 = totalLen / 2;
      }

      // Natural foot height: use the shared helper which handles both rig shapes
      this._naturalFootY = computeQuadNaturalFootY(rig);

      // Build knee-bone lookup
      for (const [lk, bk] of KNEE_BONE_KEYS) {
        const k = this._bones[bk];
        if (k) this._kneeBones.set(lk, k);
      }
    }

    for (const key of LEG_KEYS) {
      if (!this._bones[key]) continue;
      this._states.set(key, {
        foot:     new THREE.Vector3(),
        stepping: false,
        stepT:    0,
        stepFrom: new THREE.Vector3(),
        stepTo:   new THREE.Vector3(),
      });
    }
  }

  /** Foot Y in root-local space at natural stance (unscaled). Useful for grounding. */
  get naturalFootY(): number { return this._naturalFootY; }

  /** Whether this rig can use procedural walking (needs all 4 leg bones). */
  get isApplicable(): boolean {
    return (
      this._bones.frontLegL != null &&
      this._bones.frontLegR != null &&
      this._bones.backLegL  != null &&
      this._bones.backLegR  != null
    );
  }

  /**
   * Per-frame update.
   *
   * @param dt        Delta time (seconds).
   * @param bodyPos   Body world position (optional — defaults to rig.root.position).
   * @param bodyYaw   Body Y-axis rotation in radians (optional — defaults to rig.root.rotation.y).
   */
  update(
    dt:       number,
    bodyPos?: THREE.Vector3,
    bodyYaw?: number,
  ): void {
    if (!this.isApplicable || dt <= 0) return;

    const pos = bodyPos ?? this._rig.root.position;
    const yaw = bodyYaw ?? this._rig.root.rotation.y;
    const scale = this._rig.root.scale.x;

    // ── Seed initial foot positions on first call ──────────────────────────
    if (!this._inited) {
      this._inited = true;
      this._prevPos.copy(pos);
      for (const key of LEG_KEYS) {
        const s = this._states.get(key);
        if (!s) continue;
        this._computeIdeal(key, pos, yaw, scale, _v1);
        s.foot.copy(_v1);
      }
    }

    // ── Estimate velocity (exponential moving average) ────────────────────
    _v2.copy(pos).sub(this._prevPos);
    const frameVel = _v2.length() > 0.001 ? _v2.clone().divideScalar(dt) : _v2.clone().set(0, 0, 0);
    this._vel.lerp(frameVel, Math.min(1, dt * 8));
    this._prevPos.copy(pos);

    // ── Check and trigger steps ────────────────────────────────────────────
    for (const key of LEG_KEYS) {
      const s = this._states.get(key);
      if (!s || s.stepping) continue;

      this._computeIdeal(key, pos, yaw, scale, _v1);
      // Add look-ahead: ideal shifts in the direction we're moving
      _v1.x += this._vel.x * LOOK_AHEAD;
      _v1.z += this._vel.z * LOOK_AHEAD;

      const drift = Math.sqrt(
        (s.foot.x - _v1.x) ** 2 + (s.foot.z - _v1.z) ** 2,
      );

      if (drift > STEP_THRESHOLD * scale) {
        // Only step if our diagonal partner is planted
        if (!this._diagonalStepping(key)) {
          s.stepping = true;
          s.stepT    = 0;
          s.stepFrom.copy(s.foot);
          s.stepTo.copy(_v1);   // Y already set to natural foot height by _computeIdeal
        }
      }
    }

    // ── Advance stepping legs ──────────────────────────────────────────────
    for (const key of LEG_KEYS) {
      const s = this._states.get(key);
      if (!s || !s.stepping) continue;

      s.stepT = Math.min(1, s.stepT + dt / STEP_DURATION);

      // Smooth cubic ease-in-out
      const t  = s.stepT;
      const t2 = t * t * (3 - 2 * t);

      // XZ: lerp from→to
      s.foot.x = s.stepFrom.x + (s.stepTo.x - s.stepFrom.x) * t2;
      s.foot.z = s.stepFrom.z + (s.stepTo.z - s.stepFrom.z) * t2;

      // Y: arc — sine bump at midpoint
      const baseY  = s.stepFrom.y + (s.stepTo.y - s.stepFrom.y) * t2;
      s.foot.y     = baseY + Math.sin(t * Math.PI) * STEP_HEIGHT * scale;

      if (s.stepT >= 1) {
        s.stepping = false;
        s.foot.copy(s.stepTo);
        s.foot.y = s.stepTo.y;
      }
    }

    // ── Analytical 2-bone IK (law of cosines + world-space pole vector) ──────
    // Algorithm mirrors the POC: compute the exact 3D knee position from the
    // law of cosines and the pole direction, then orient each bone segment
    // by rotating its local -Y axis toward its downstream target.
    for (const key of LEG_KEYS) {
      const hip = this._bones[key];
      const s   = this._states.get(key);
      if (!hip || !s) continue;

      hip.getWorldPosition(_hipWorld);
      const knee = this._kneeBones.get(key);
      const L1 = this._legL1 * scale;
      const L2 = this._legL2 * scale;

      if (knee && L1 > 0.001 && L2 > 0.001) {
        // --- Step 1: law of cosines to find knee offset ---
        _v2.copy(s.foot).sub(_hipWorld);            // hip → foot (world)
        let d = _v2.length();
        d = Math.max(0.01, Math.min(d, L1 + L2 - 0.001));
        _v2.normalize();                             // unit hip→foot direction

        const px = (L1*L1 - L2*L2 + d*d) / (2*d); // projection along axis
        const py = Math.sqrt(Math.max(0, L1*L1 - px*px)); // lateral offset

        // Pole direction (body-local) → world space
        _v3.copy(KNEE_POLE_LOCAL[key]).transformDirection(this._rig.root.matrixWorld);
        _right.crossVectors(_v3, _v2).normalize();
        if (_right.lengthSq() < 0.001) _right.set(1, 0, 0);
        _ortho.crossVectors(_v2, _right).normalize(); // actual bend direction

        // World knee position
        _kneeWorld.copy(_hipWorld).addScaledVector(_v2, px).addScaledVector(_ortho, py);

        // --- Step 2: orient hip — local -Y toward knee ---
        _v3.copy(_kneeWorld).sub(_hipWorld);
        if (_v3.lengthSq() < 0.0001) _v3.set(0, -1, 0);
        _v3.normalize();
        if (hip.parent) {
          hip.parent.getWorldQuaternion(_parentQ);
          _parentQInv.copy(_parentQ).invert();
          _v3.applyQuaternion(_parentQInv);  // into parent-local space
        }
        _q1.setFromUnitVectors(_Y_DOWN, _v3);
        hip.quaternion.copy(_q1);
        hip.updateMatrixWorld(true);

        // --- Step 3: move knee node to exact knee world position ---
        _v1.copy(_kneeWorld);
        hip.worldToLocal(_v1);               // in-place: _v1 = knee in hip-local
        knee.position.copy(_v1);
        knee.updateMatrixWorld(true);

        // --- Step 4: orient knee — local -Y toward foot ---
        knee.getWorldPosition(_v2);          // reuse _v2 for knee world pos
        _v3.copy(s.foot).sub(_v2);
        if (_v3.lengthSq() < 0.0001) _v3.set(0, -1, 0);
        _v3.normalize();
        hip.getWorldQuaternion(_parentQ);    // hip = knee's parent
        _parentQInv.copy(_parentQ).invert();
        _v3.applyQuaternion(_parentQInv);
        _q1.setFromUnitVectors(_Y_DOWN, _v3);
        knee.quaternion.copy(_q1);

      } else {
        // --- 1-bone fallback: Euler angle hip swing (no knee bone) ---
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
        const targetRx = Math.atan2( _v1.z, -_v1.y);
        const targetRz = Math.atan2(-_v1.x, -_v1.y);
        const alpha = Math.min(1, dt * HIP_LERP);
        hip.rotation.x += (targetRx - hip.rotation.x) * alpha;
        hip.rotation.z += (targetRz - hip.rotation.z) * alpha;
      }
    }

    // ── Torso bob ──────────────────────────────────────────────────────────
    // Gentle up-down oscillation driven by movement speed — signals "active walk".
    if (this._bones.torso) {
      const speed = Math.sqrt(this._vel.x ** 2 + this._vel.z ** 2);
      this._bobPhase += speed * BOB_RATE * dt;
      const bob = Math.sin(this._bobPhase) * BOB_AMP * scale;
      this._bones.torso.position.y = this._torsoBaseY + bob;
    }
  }

  /**
   * Teleport all feet to their rest positions instantly.
   * Call when the creature is teleported or the room changes.
   */
  reset(bodyPos?: THREE.Vector3, bodyYaw?: number): void {
    this._inited = false;
    const pos = bodyPos ?? this._rig.root.position;
    const yaw = bodyYaw ?? this._rig.root.rotation.y;
    const scale = this._rig.root.scale.x;
    for (const key of LEG_KEYS) {
      const s = this._states.get(key);
      if (!s) continue;
      this._computeIdeal(key, pos, yaw, scale, _v1);
      s.foot.copy(_v1);
      s.stepping = false;
      s.stepT    = 0;
    }
    this._inited = true;
  }

  /** Read-only current foot positions (useful for debug rendering). */
  getFootPositions(): Readonly<Record<LegKey, THREE.Vector3>> {
    const out: Partial<Record<LegKey, THREE.Vector3>> = {};
    for (const key of LEG_KEYS) {
      const s = this._states.get(key);
      if (s) out[key] = s.foot.clone();
    }
    return out as Record<LegKey, THREE.Vector3>;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _diagonalStepping(key: LegKey): boolean {
    for (const pair of DIAGONAL_PAIRS) {
      if (pair[0] === key || pair[1] === key) {
        const partner = pair[0] === key ? pair[1] : pair[0];
        const ps      = this._states.get(partner);
        if (ps?.stepping) return true;
      }
    }
    return false;
  }

  private _computeIdeal(
    key: LegKey, pos: THREE.Vector3, yaw: number, scale: number, out: THREE.Vector3,
  ): void {
    const sx = (key === 'frontLegL' || key === 'backLegL') ? -this._restX : this._restX;
    const sz = (key === 'frontLegL' || key === 'frontLegR') ? this._restZ : -this._restZ;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    out.set(
      (sx * cosY - sz * sinY) * scale + pos.x,
      pos.y + this._naturalFootY * scale,
      (sx * sinY + sz * cosY) * scale + pos.z,
    );
  }
}
