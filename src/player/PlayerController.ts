import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { InputState } from '@/core/InputManager';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PALETTE } from '@/shaders/palette';
import { rapierToThreeInto } from '@/physics/helpers';

// ── Capsule dimensions ─────────────────────────────────────────────────────

const CAPSULE_HALF_HEIGHT = 0.5;
const CAPSULE_RADIUS = 0.35;
const KCC_OFFSET = 0.01;

// ── Speed ─────────────────────────────────────────────────────────────────

const WALK_SPEED = 5;
const RUN_SPEED = 10;

/** Ground acceleration — how fast top speed is reached (units/s²). */
const ACCEL_GROUND = 35;
/** Ground deceleration — friction when no input pressed. */
const DECEL_GROUND = 30;
/** Air acceleration — less snappy than ground. */
const ACCEL_AIR = 14;
/** Air deceleration — minimal, preserve momentum while airborne. */
const DECEL_AIR = 5;

// ── Jump ──────────────────────────────────────────────────────────────────

const JUMP_VELOCITY = 12;
/** Gravity when rising and jump is held — produces a gentle arc. */
const GRAVITY_RISE = 28;
/**
 * Gravity when jump is released early.
 * Much heavier than GRAVITY_RISE → releasing Space gives a short hop.
 */
const GRAVITY_RELEASE = 75;
/** Gravity when falling — snappier than the rise for that Mario feel. */
const GRAVITY_FALL = 48;
const MAX_FALL_SPEED = 28;
/** Small constant downward push to keep the KCC grounded reliably. */
const GROUND_PUSH = -2;

/** Window (seconds) after walking off a ledge where jump is still valid. */
const COYOTE_TIME = 0.1;
/** Window (seconds) before landing where a pressed jump is buffered. */
const JUMP_BUFFER_TIME = 0.12;

// ── Animation ─────────────────────────────────────────────────────────────

/** How quickly the mesh rotates to face the movement direction (rad/s). */
const TURN_SPEED_GROUND = 14;
const TURN_SPEED_AIR = 9;
/** Maximum forward lean angle in radians when running at full speed. */
const MAX_LEAN = 0.18;
/** Head bob amplitude in world units. */
const BOB_AMP = 0.055;
/** Head bob cycles per world unit of distance (foot-fall rate). */
const BOB_FREQ = 0.5;

// ── Isometric movement directions (normalized) ─────────────────────────────
// Camera looks from (+x,+y,+z) toward origin (45° azimuth).
// WASD are remapped to world-space diagonals to match screen axes.

export const ISO_FORWARD = new THREE.Vector3(-1, 0, -1).normalize();
export const ISO_BACKWARD = new THREE.Vector3(1, 0, 1).normalize();
export const ISO_LEFT = new THREE.Vector3(-1, 0, 1).normalize();
export const ISO_RIGHT = new THREE.Vector3(1, 0, -1).normalize();

// ── Pure helpers (exported for unit tests) ─────────────────────────────────

/** Returns the desired horizontal direction from input as a normalized Vector3
 *  (y=0). Returns zero-vector when no keys are pressed. */
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

// ── Internal math helpers ──────────────────────────────────────────────────

/** Linear interpolate, t clamped to [0, 1]. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/** Interpolate between two angles via the shortest arc. */
function lerpAngle(current: number, target: number, t: number): number {
  const raw = target - current;
  // Map raw delta to [-π, π] (shortest path)
  const delta = ((raw % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return current + delta * Math.min(1, t);
}

// ── Scale spring ───────────────────────────────────────────────────────────

interface ScaleSpring {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3;
}

function stepScaleSpring(s: ScaleSpring, stiffness: number, damping: number, dt: number): void {
  for (const axis of ['x', 'y', 'z'] as const) {
    const force = (s.target[axis] - s.pos[axis]) * stiffness - s.vel[axis] * damping;
    s.vel[axis] += force * dt;
    s.pos[axis] += s.vel[axis] * dt;
  }
}

// ── PlayerController ────────────────────────────────────────────────────────

/** The player's physics body, kinematic controller, and visual mesh.
 *
 *  Add both `player.group` and `player.shadow` to the scene.
 *  Call `player.update(input, dt)` each frame after `physicsWorld.step(dt)`.
 */
export class PlayerController {
  /** Add to scene — the player's visual representation. */
  readonly group: THREE.Group;
  /** Add to scene — blob shadow that tracks the player and scales with height. */
  readonly shadow: THREE.Mesh;

  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly kcc: RAPIER.KinematicCharacterController;

  // Movement
  private readonly velocity = new THREE.Vector3();
  private facingAngle = 0;
  private isGrounded = false;

  // Jump state
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private lastJumpInput = false;
  private jumpHeld = false;

  // Animation
  private bobTimer = 0;
  private readonly scaleSpring: ScaleSpring = {
    pos: new THREE.Vector3(1, 1, 1),
    vel: new THREE.Vector3(0, 0, 0),
    target: new THREE.Vector3(1, 1, 1),
  };

  // Mesh sub-references for per-part animation
  private readonly bodyMesh: THREE.Mesh;
  private readonly headMesh: THREE.Mesh;

  // Pre-allocated reusable vector (avoids allocation in hot path)
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

    const built = PlayerController.buildMesh();
    this.group = built.group;
    this.bodyMesh = built.bodyMesh;
    this.headMesh = built.headMesh;
    this.group.position.copy(startPosition);

    this.shadow = PlayerController.buildShadow();
  }

  update(input: InputState, dt: number): void {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. TIMERS
    // ─────────────────────────────────────────────────────────────────────────
    this.coyoteTimer -= dt;
    this.jumpBufferTimer -= dt;
    const wasGrounded = this.isGrounded;

    // ─────────────────────────────────────────────────────────────────────────
    // 2. JUMP INPUT — detect rising edge, fill buffer
    // ─────────────────────────────────────────────────────────────────────────
    const jumpJustPressed = input.jump && !this.lastJumpInput;
    this.lastJumpInput = input.jump;

    if (jumpJustPressed) this.jumpBufferTimer = JUMP_BUFFER_TIME;

    // Releasing jump before the arc peaks cuts the jump height (variable jump)
    if (!input.jump) this.jumpHeld = false;

    // ─────────────────────────────────────────────────────────────────────────
    // 3. EXECUTE JUMP
    //    canJump uses wasGrounded + coyote so we jump on the *previous* ground
    //    state — the KCC hasn't run this frame yet.
    // ─────────────────────────────────────────────────────────────────────────
    const canJump = wasGrounded || this.coyoteTimer > 0;
    let justJumped = false;

    if (this.jumpBufferTimer > 0 && canJump) {
      this.velocity.y = JUMP_VELOCITY;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.jumpHeld = true;
      justJumped = true;
      this.triggerStretch();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. GRAVITY
    //    Three gravity modes: rising-held, rising-released (hop), falling.
    //    Grounded: constant downward push so the KCC stays in contact.
    // ─────────────────────────────────────────────────────────────────────────
    if (!wasGrounded || justJumped) {
      let gravity: number;
      if (this.velocity.y > 0) {
        gravity = this.jumpHeld ? GRAVITY_RISE : GRAVITY_RELEASE;
      } else {
        gravity = GRAVITY_FALL;
      }
      this.velocity.y -= gravity * dt;
      this.velocity.y = Math.max(this.velocity.y, -MAX_FALL_SPEED);
    } else {
      this.velocity.y = GROUND_PUSH;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. HORIZONTAL MOVEMENT — acceleration / friction
    // ─────────────────────────────────────────────────────────────────────────
    const topSpeed = input.run ? RUN_SPEED : WALK_SPEED;
    const moveDir = calculateMoveDirection(input);
    const isMoving = moveDir.lengthSq() > 0.01;

    const accel = wasGrounded ? ACCEL_GROUND : ACCEL_AIR;
    const decel = wasGrounded ? DECEL_GROUND : DECEL_AIR;

    if (isMoving) {
      this.velocity.x = lerp(this.velocity.x, moveDir.x * topSpeed, accel * dt);
      this.velocity.z = lerp(this.velocity.z, moveDir.z * topSpeed, accel * dt);
    } else {
      this.velocity.x = lerp(this.velocity.x, 0, decel * dt);
      this.velocity.z = lerp(this.velocity.z, 0, decel * dt);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. KCC — let Rapier resolve collisions and wall-sliding
    // ─────────────────────────────────────────────────────────────────────────
    const desired = {
      x: this.velocity.x * dt,
      y: this.velocity.y * dt,
      z: this.velocity.z * dt,
    };

    this.kcc.computeColliderMovement(this.collider, desired);

    // Update grounded state from this frame's physics result.
    // Exclude frames where we just jumped to prevent instant re-grounding.
    this.isGrounded = this.kcc.computedGrounded() && this.velocity.y <= 0.1;

    const actual = this.kcc.computedMovement();

    // Kill upward velocity if we hit a ceiling
    if (this.velocity.y > 0 && actual.y < desired.y * 0.5) {
      this.velocity.y = 0;
    }

    const cur = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: cur.x + actual.x,
      y: cur.y + actual.y,
      z: cur.z + actual.z,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 7. POST-KCC STATE UPDATES
    // ─────────────────────────────────────────────────────────────────────────

    // Coyote: start countdown when walking off an edge naturally (not jumping)
    if (wasGrounded && !this.isGrounded && !justJumped) {
      this.coyoteTimer = COYOTE_TIME;
    }

    // Landing: squash proportional to fall speed
    if (!wasGrounded && this.isGrounded) {
      this.triggerSquash(this.velocity.y);
      this.velocity.y = GROUND_PUSH;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. SYNC POSITION
    // ─────────────────────────────────────────────────────────────────────────
    rapierToThreeInto(this.body.translation(), this._pos);
    this.group.position.copy(this._pos);

    // ─────────────────────────────────────────────────────────────────────────
    // 9. VISUALS
    // ─────────────────────────────────────────────────────────────────────────
    const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

    // Smooth rotation: face direction of travel
    if (hSpeed > 0.4) {
      const targetAngle = Math.atan2(this.velocity.x, this.velocity.z);
      const turnSpeed = wasGrounded ? TURN_SPEED_GROUND : TURN_SPEED_AIR;
      this.facingAngle = lerpAngle(this.facingAngle, targetAngle, turnSpeed * dt);
      this.group.rotation.y = this.facingAngle;
    }

    // Forward lean proportional to speed
    const speedFactor = Math.min(hSpeed / RUN_SPEED, 1);
    this.bodyMesh.rotation.x = lerp(this.bodyMesh.rotation.x, -speedFactor * MAX_LEAN, 0.14);

    // Head bob (only while grounded and moving)
    const headBaseY = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS + 0.25;
    if (this.isGrounded && hSpeed > 0.3) {
      this.bobTimer += hSpeed * dt * BOB_FREQ;
      const bob = Math.abs(Math.sin(this.bobTimer * Math.PI * 2)) * BOB_AMP * speedFactor;
      this.headMesh.position.y = lerp(this.headMesh.position.y, headBaseY + bob, 0.3);
    } else {
      this.headMesh.position.y = lerp(this.headMesh.position.y, headBaseY, 0.2);
    }

    // Glow pulses brighter when sprinting
    const headMat = this.headMesh.material as THREE.MeshLambertMaterial;
    const targetGlow = input.run && hSpeed > 1 ? 1.3 : 0.4;
    headMat.emissiveIntensity = lerp(headMat.emissiveIntensity, targetGlow, 0.08);

    // Squash & stretch — spring toward (1,1,1), decay target back to neutral
    stepScaleSpring(this.scaleSpring, 360, 26, dt);
    this.scaleSpring.target.x = lerp(this.scaleSpring.target.x, 1, 10 * dt);
    this.scaleSpring.target.y = lerp(this.scaleSpring.target.y, 1, 10 * dt);
    this.scaleSpring.target.z = lerp(this.scaleSpring.target.z, 1, 10 * dt);
    this.group.scale.copy(this.scaleSpring.pos);

    // Shadow blob — scales down and fades as the player rises
    const height = Math.max(0, this._pos.y - (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS));
    this.shadow.position.set(this._pos.x, 0.03, this._pos.z);
    this.shadow.scale.setScalar(Math.max(0.05, 1 - height * 0.09));
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(
      0,
      (1 - height * 0.11) * 0.5,
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Called on jump takeoff — vertical stretch, arms-in squeeze. */
  private triggerStretch(): void {
    this.scaleSpring.pos.set(0.72, 1.38, 0.72);
    this.scaleSpring.vel.set(0, 8, 0);
    this.scaleSpring.target.set(1, 1, 1);
  }

  /** Called on landing — horizontal splat proportional to fall speed. */
  private triggerSquash(fallVelocity: number): void {
    const intensity = Math.min(Math.abs(fallVelocity) / MAX_FALL_SPEED, 1);
    const sy = Math.max(0.55, 1 - intensity * 0.45);
    const sxz = 1 + intensity * 0.55;
    this.scaleSpring.pos.set(sxz, sy, sxz);
    this.scaleSpring.vel.set(0, -6, 0);
    this.scaleSpring.target.set(1, 1, 1);
  }

  // ── Static builders ────────────────────────────────────────────────────────

  private static buildMesh(): {
    group: THREE.Group;
    bodyMesh: THREE.Mesh;
    headMesh: THREE.Mesh;
  } {
    const group = new THREE.Group();

    const bodyGeo = new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HALF_HEIGHT * 2, 8, 16);
    const bodyMat = new THREE.MeshLambertMaterial({ color: PALETTE.PLAYER_BODY });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.castShadow = true;

    const headGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const headMat = new THREE.MeshLambertMaterial({
      color: PALETTE.PLAYER_BODY,
      emissive: new THREE.Color(PALETTE.PLAYER_GLOW),
      emissiveIntensity: 0.4,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS + 0.25;
    headMesh.castShadow = true;

    group.add(bodyMesh, headMesh);
    return { group, bodyMesh, headMesh };
  }

  private static buildShadow(): THREE.Mesh {
    const geo = new THREE.CircleGeometry(0.45, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    // Render after the floor so it composites on top without z-fighting
    mesh.renderOrder = 1;
    return mesh;
  }
}
