import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { InputState } from '@/core/InputManager';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PALETTE } from '@/shaders/palette';
import { rapierToThreeInto } from '@/physics/helpers';

// ── Constants ──────────────────────────────────────────────────────────────

/** Cylindrical portion half-height (the flat middle of the capsule). */
const CAPSULE_HALF_HEIGHT = 0.5;
/** End-hemisphere radius. Total height = 2*HALF + 2*RADIUS = 1.7 units. */
const CAPSULE_RADIUS = 0.35;
/** Skin offset: tiny gap between KCC and colliders to avoid tunnelling. */
const KCC_OFFSET = 0.01;
/** Horizontal movement speed in world units per second. */
const MOVE_SPEED = 6;
/** A small constant downward push so the KCC registers grounded each frame. */
const GROUND_PUSH = -0.05;

// ── Isometric movement directions (normalized) ─────────────────────────────
// Camera faces from (+x, +y, +z) toward origin, 45° azimuth.
// W/S/A/D are remapped to world-space diagonals to match the screen axes.

export const ISO_FORWARD = new THREE.Vector3(-1, 0, -1).normalize();
export const ISO_BACKWARD = new THREE.Vector3(1, 0, 1).normalize();
export const ISO_LEFT = new THREE.Vector3(-1, 0, 1).normalize();
export const ISO_RIGHT = new THREE.Vector3(1, 0, -1).normalize();

// ── Pure helpers (exported for unit tests) ─────────────────────────────────

/** Compute the desired horizontal movement direction from input.
 *  Returns a normalized Vector3 (y=0), or zero-vector if no input. */
export function calculateMoveDirection(
  input: Pick<InputState, 'moveForward' | 'moveBackward' | 'moveLeft' | 'moveRight'>,
): THREE.Vector3 {
  const dir = new THREE.Vector3();
  if (input.moveForward) dir.add(ISO_FORWARD);
  if (input.moveBackward) dir.add(ISO_BACKWARD);
  if (input.moveLeft) dir.add(ISO_LEFT);
  if (input.moveRight) dir.add(ISO_RIGHT);
  if (dir.lengthSq() > 0) dir.normalize();
  return dir;
}

// ── PlayerController ────────────────────────────────────────────────────────

/** The player's physical representation and controller.
 *
 * Owns: a Rapier kinematic capsule body, a KCC, and a Three.js Group (mesh).
 * Call `update()` each frame (after `physicsWorld.step()`).
 */
export class PlayerController {
  /** Add this to the scene. Position is authoritative (synced from physics). */
  readonly group: THREE.Group;

  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly kcc: RAPIER.KinematicCharacterController;

  /** Accumulated vertical velocity (gravity / jump). */
  private verticalVelocity = 0;

  /** Reusable vector — avoids per-frame allocation in the hot path. */
  private readonly _pos = new THREE.Vector3();

  constructor(physicsWorld: PhysicsWorld, startPosition: THREE.Vector3) {
    const { body, collider } = physicsWorld.createKinematicCapsule(
      startPosition,
      CAPSULE_HALF_HEIGHT,
      CAPSULE_RADIUS,
    );
    this.body = body;
    this.collider = collider;

    this.kcc = physicsWorld.createCharacterController(KCC_OFFSET);
    this.kcc.setSlideEnabled(true);
    this.kcc.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((30 * Math.PI) / 180);

    this.group = PlayerController.buildMesh();
    this.group.position.copy(startPosition);
  }

  update(input: InputState): void {
    // 1. Horizontal movement from input
    const horizontal = calculateMoveDirection(input);

    // 2. Vertical: accumulate gravity, reset when grounded
    const isGrounded = this.kcc.computedGrounded();
    if (isGrounded) {
      this.verticalVelocity = GROUND_PUSH;
    } else {
      this.verticalVelocity -= 9.81 * (1 / 60); // approximate; KCC controls actual dt
    }

    // 3. Desired movement for this frame (KCC works in per-step absolute deltas)
    const desired = {
      x: horizontal.x * MOVE_SPEED * (1 / 60),
      y: this.verticalVelocity * (1 / 60),
      z: horizontal.z * MOVE_SPEED * (1 / 60),
    };

    // 4. Let the KCC resolve collisions and wall-sliding
    this.kcc.computeColliderMovement(this.collider, desired);
    const actual = this.kcc.computedMovement();

    // 5. Apply resolved movement to the kinematic body
    const cur = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: cur.x + actual.x,
      y: cur.y + actual.y,
      z: cur.z + actual.z,
    });

    // 6. Sync Three.js group to physics position (no allocation via reused _pos)
    rapierToThreeInto(this.body.translation(), this._pos);
    this.group.position.copy(this._pos);
  }

  private static buildMesh(): THREE.Group {
    const group = new THREE.Group();

    // Body capsule
    const bodyGeo = new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HALF_HEIGHT * 2, 8, 16);
    const bodyMat = new THREE.MeshToonMaterial({ color: PALETTE.PLAYER_BODY });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.castShadow = true;

    // Head sphere — floats slightly above the capsule top
    const headGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const headMat = new THREE.MeshToonMaterial({
      color: PALETTE.PLAYER_BODY,
      emissive: new THREE.Color(PALETTE.PLAYER_GLOW),
      emissiveIntensity: 0.4,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS + 0.25; // above capsule top
    headMesh.castShadow = true;

    group.add(bodyMesh, headMesh);
    return group;
  }
}
