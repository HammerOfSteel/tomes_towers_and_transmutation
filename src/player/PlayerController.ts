import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { InputState } from '@/core/InputManager';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PALETTE } from '@/shaders/palette';
import { rapierToThreeInto } from '@/physics/helpers';
import { HealthComponent } from '@/combat/Health';
import type { CreatureDNA } from '@/creatures/CreatureDNA';
import { buildCreature, type CreatureRig } from '@/creatures/CreatureBuilder';
import { animateCreature } from '@/creatures/CreatureAnimator';

// ── Capsule dimensions ─────────────────────────────────────────────────────

const CAPSULE_HALF_HEIGHT = 0.5;
const CAPSULE_RADIUS = 0.35;
const KCC_OFFSET = 0.01;

// ── Speed ─────────────────────────────────────────────────────────────────

const WALK_SPEED = 5;
const RUN_SPEED = 10;
/** Snappy ground acceleration (units/s²). */
const ACCEL_GROUND = 40;
/** Ground friction when no input. */
const DECEL_GROUND = 30;
/** Air acceleration — less responsive than ground. */
const ACCEL_AIR = 12;
/** Air deceleration — almost zero, preserve momentum. */
const DECEL_AIR = 4;

// ── Jump ──────────────────────────────────────────────────────────────────

const JUMP_VELOCITY = 11;
/** Low gravity while holding Space on the way up → floaty rise. */
const GRAVITY_RISE = 22;
/** High gravity when Space released early → short hop. */
const GRAVITY_RELEASE = 60;
/** Snappier fall gravity — faster to land than to rise. */
const GRAVITY_FALL = 40;
const MAX_FALL_SPEED = 25;
/** Tiny downward push every grounded frame keeps KCC contact detection happy. */
const GROUND_PUSH = -2;

/** Frames after walking off a ledge where jump is still accepted. */
const COYOTE_TIME = 0.1;
/** Frames before landing where a pre-pressed jump fires on contact. */
const JUMP_BUFFER_TIME = 0.12;

// ── Dodge-roll ────────────────────────────────────────────────────────────

/** Dodge dash speed (units/s). */
const DODGE_SPEED = 16;
/** How long the dodge lasts (seconds). */
const DODGE_DURATION = 0.22;
/** Cooldown after the dodge ends before another can be triggered. */
const DODGE_COOLDOWN = 0.7;
/** i-frame window while dodging. */
const DODGE_IFRAME = 0.3;

// ── Player stats ──────────────────────────────────────────────────────────

const PLAYER_HP = 10;
const PLAYER_IFRAME = 0.5; // seconds of invulnerability after a hit

// ── Animation ─────────────────────────────────────────────────────────────

const TURN_SPEED_GROUND = 16; // rad/s
const TURN_SPEED_AIR = 8;
/** Maximum forward tilt at full run speed (radians). */
const MAX_LEAN = 0.15;
/** Head-bob amplitude (world units). */
const BOB_AMP = 0.05;
/** Bob cycles per world unit. */
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function lerpAngle(current: number, target: number, t: number): number {
  const raw = target - current;
  const delta = ((raw % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return current + delta * Math.min(1, t);
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
  /** Health component — wire to HUD and combat system. */
  readonly health: HealthComponent;

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

  // Dodge-roll state
  private dodgeTimer = 0;
  private dodgeCooldown = 0;
  private dodgeDir = new THREE.Vector3();
  private lastDodgeInput = false;

  // Animation / feedback
  private bobTimer = 0;
  private flashTimer = 0;

  // Direct sub-mesh references (squash/stretch applied here, NOT on group)
  private readonly bodyMesh: THREE.Mesh;
  private readonly headMesh: THREE.Mesh;

  // DNA-based creature rig (replaces bodyMesh/headMesh visually when applied)
  private _creatureRig: CreatureRig | null = null;

  /** Current facing angle in radians — read by CombatSystem for melee arc aim. */
  get facingAngleRad(): number { return this.facingAngle; }

  /** 0 = dodge just used (full cooldown), 1 = fully ready. */
  get dodgeReadyFraction(): number {
    return this.dodgeCooldown <= 0 ? 1 : Math.max(0, 1 - this.dodgeCooldown / DODGE_COOLDOWN);
  }

  /**
   * Swap the player's visual for a DNA-based creature rig.
   * The existing capsule physics body is unchanged.
   * Called from main.ts after character creation.
   */
  applyDNA(dna: CreatureDNA): void {
    if (this._creatureRig) {
      this.group.remove(this._creatureRig.root);
      this._creatureRig.dispose();
    }
    this.bodyMesh.visible = false;
    this.headMesh.visible = false;
    this._creatureRig = buildCreature(dna);
    this._creatureRig.root.scale.setScalar(dna.proportions.global);
    this.group.add(this._creatureRig.root);
  }

  /** Instantly reposition both the physics body and the visual mesh.
   *  Use for room transitions only — not for gameplay movement. */
  teleport(pos: THREE.Vector3): void {
    this.body.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z });
    this.group.position.copy(pos);
    this._pos.copy(pos);
    // Reset vertical velocity so the player lands cleanly in the new room
    this.velocity.set(0, 0, 0);
  }

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
    // Allow the KCC to step up tile edges (heightfield transitions and box edges).
    // maxHeight = 0.7 clears one full tile level (SH=0.55) plus margin.
    // minWidth  = 0.3 avoids stepping over narrow slivers / geometry artefacts.
    this.kcc.enableAutostep(0.7, 0.3, false);
    // Snap the character back down to the floor when descending steps/tiles.
    // Without this the player floats momentarily after walking off an elevated tile.
    // Distance 0.7 is just above one tile-level height (SH=0.55) so any single-step
    // descent is snapped in the same frame.
    this.kcc.enableSnapToGround(0.7);

    const built = PlayerController.buildMesh();
    this.group = built.group;
    this.bodyMesh = built.bodyMesh;
    this.headMesh = built.headMesh;
    this.group.position.copy(startPosition);

    this.shadow = PlayerController.buildShadow();

    this.health = new HealthComponent(
      PLAYER_HP,
      PLAYER_IFRAME,
      () => this.onHit(),
    );
  }

  update(input: InputState, dt: number): void {
    // ── 1. TIMERS ──────────────────────────────────────────────────────────
    this.health.tick(dt);
    this.coyoteTimer -= dt;
    this.jumpBufferTimer -= dt;
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    const wasGrounded = this.isGrounded;

    // ── 1b. DODGE-ROLL ─────────────────────────────────────────────────────
    const dodgeJustPressed = input.dodge && !this.lastDodgeInput;
    this.lastDodgeInput = input.dodge;

    if (dodgeJustPressed && this.dodgeCooldown <= 0 && this.dodgeTimer <= 0) {
      // Direction: current facing, or movement direction if any
      const moveDir = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
      if (moveDir.lengthSq() < 0.01) {
        moveDir.set(Math.sin(this.facingAngle), 0, Math.cos(this.facingAngle));
      } else {
        moveDir.normalize();
      }
      this.dodgeDir.copy(moveDir);
      this.dodgeTimer = DODGE_DURATION;
      this.dodgeCooldown = DODGE_COOLDOWN;
      this.health.takeDamage(0); // trigger i-frame window via a zero-damage hit? no — call directly
      // Instead force the i-frame via a helper (we grant iframe via health internal override isn't ideal)
      // We use the dodge iframe by directly granting invulnerability via a workaround:
      // Expose a grantIframe method or just call takeDamage with 0 and override via separate iframeDuration
      // Simpler: track dodge i-frames separately in the player
      this.flashTimer = DODGE_IFRAME;
      this.bodyMesh.scale.set(0.8, 0.6, 0.8); // squash into dash
    }

    if (this.dodgeTimer > 0) {
      this.dodgeTimer -= dt;
      // Override horizontal velocity with dodge
      this.velocity.x = this.dodgeDir.x * DODGE_SPEED;
      this.velocity.z = this.dodgeDir.z * DODGE_SPEED;
    }

    // ── 2. JUMP INPUT — rising-edge detect, buffer window ─────────────────
    const jumpJustPressed = input.jump && !this.lastJumpInput;
    this.lastJumpInput = input.jump;
    if (jumpJustPressed) this.jumpBufferTimer = JUMP_BUFFER_TIME;
    if (!input.jump) this.jumpHeld = false;

    // ── 3. EXECUTE JUMP ────────────────────────────────────────────────────
    const canJump = wasGrounded || this.coyoteTimer > 0;
    let justJumped = false;

    if (this.jumpBufferTimer > 0 && canJump) {
      this.velocity.y = JUMP_VELOCITY;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.jumpHeld = true;
      justJumped = true;
      this.squashStretchJump();
    }

    // ── 4. GRAVITY ─────────────────────────────────────────────────────────
    if (!wasGrounded || justJumped) {
      let g: number;
      if (this.velocity.y > 0) {
        g = this.jumpHeld ? GRAVITY_RISE : GRAVITY_RELEASE;
      } else {
        g = GRAVITY_FALL;
      }
      this.velocity.y -= g * dt;
      this.velocity.y = Math.max(this.velocity.y, -MAX_FALL_SPEED);
    } else {
      this.velocity.y = GROUND_PUSH;
    }

    // ── 5. HORIZONTAL MOVEMENT ─────────────────────────────────────────────
    // Skip normal acceleration when dodge is active (dodge overrides velocity)
    if (this.dodgeTimer <= 0) {
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
    }

    // ── 6. KCC ─────────────────────────────────────────────────────────────
    const desired = {
      x: this.velocity.x * dt,
      y: this.velocity.y * dt,
      z: this.velocity.z * dt,
    };

    this.kcc.computeColliderMovement(this.collider, desired);
    this.isGrounded = this.kcc.computedGrounded() && this.velocity.y <= 0.1;
    const actual = this.kcc.computedMovement();

    if (this.velocity.y > 0 && actual.y < desired.y * 0.5) {
      this.velocity.y = 0; // hit ceiling
    }

    const cur = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: cur.x + actual.x,
      y: cur.y + actual.y,
      z: cur.z + actual.z,
    });

    // ── 7. POST-STEP STATE ─────────────────────────────────────────────────
    if (wasGrounded && !this.isGrounded && !justJumped) {
      this.coyoteTimer = COYOTE_TIME; // walked off ledge
    }
    if (!wasGrounded && this.isGrounded) {
      this.squashStretchLand(this.velocity.y);
      this.velocity.y = GROUND_PUSH;
    }

    // ── 8. SYNC POSITION ───────────────────────────────────────────────────
    rapierToThreeInto(this.body.translation(), this._pos);
    this.group.position.copy(this._pos);

    // ── 9. VISUALS ─────────────────────────────────────────────────────────
    const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

    // Rotate group to face direction of travel
    if (hSpeed > 0.4) {
      const targetAngle = Math.atan2(this.velocity.x, this.velocity.z);
      const turnRate = wasGrounded ? TURN_SPEED_GROUND : TURN_SPEED_AIR;
      this.facingAngle = lerpAngle(this.facingAngle, targetAngle, turnRate * dt);
      this.group.rotation.y = this.facingAngle;
    }

    // Forward lean on bodyMesh (not group — keeps shadow/head unaffected)
    const speedFactor = Math.min(hSpeed / RUN_SPEED, 1);
    this.bodyMesh.rotation.x = lerp(this.bodyMesh.rotation.x, -speedFactor * MAX_LEAN, 0.12);

    // Head bob while running on ground
    const headBaseY = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS + 0.25;
    if (this.isGrounded && hSpeed > 0.3) {
      this.bobTimer += hSpeed * dt * BOB_FREQ;
      const bob = Math.abs(Math.sin(this.bobTimer * Math.PI * 2)) * BOB_AMP * speedFactor;
      this.headMesh.position.y = lerp(this.headMesh.position.y, headBaseY + bob, 0.3);
    } else {
      this.headMesh.position.y = lerp(this.headMesh.position.y, headBaseY, 0.2);
    }

    // Head glow brighter when sprinting
    const headMat = this.headMesh.material as THREE.MeshLambertMaterial;
    const glowTarget = input.run && hSpeed > 1 ? 1.2 : 0.4;
    headMat.emissiveIntensity = lerp(headMat.emissiveIntensity, glowTarget, 0.08);

    // i-frame / hit flash: blink the body between white and normal colour
    const bodyMat = this.bodyMesh.material as THREE.MeshLambertMaterial;
    if (this.flashTimer > 0) {
      const blink = Math.sin(this.flashTimer * 40) > 0;
      bodyMat.color.setHex(blink ? 0xffffff : PALETTE.PLAYER_BODY);
      this.group.visible = this.dodgeTimer <= 0 || blink; // flicker during dodge
    } else {
      bodyMat.color.setHex(PALETTE.PLAYER_BODY);
      this.group.visible = true;
    }

    // Squash/stretch scale decays back to (1,1,1) on bodyMesh
    this.bodyMesh.scale.x = lerp(this.bodyMesh.scale.x, 1, 12 * dt);
    this.bodyMesh.scale.y = lerp(this.bodyMesh.scale.y, 1, 12 * dt);
    this.bodyMesh.scale.z = lerp(this.bodyMesh.scale.z, 1, 12 * dt);

    // DNA rig animation (runs alongside hidden bodyMesh/headMesh logic)
    if (this._creatureRig) {
      const t = performance.now() * 0.001;
      if (this.flashTimer > 0) {
        animateCreature(this._creatureRig, { state: 'hit', time: t, timeSinceHit: PLAYER_IFRAME - this.flashTimer });
      } else if (hSpeed > RUN_SPEED * 0.5) {
        animateCreature(this._creatureRig, { state: 'run',  time: t, velocity: Math.min(hSpeed / RUN_SPEED, 1) });
      } else if (hSpeed > 0.3) {
        animateCreature(this._creatureRig, { state: 'walk', time: t, velocity: Math.min(hSpeed / RUN_SPEED, 1) });
      } else {
        animateCreature(this._creatureRig, { state: 'idle', time: t });
      }
    }

    // Shadow blob tracks position, shrinks with height
    const height = Math.max(0, this._pos.y - (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS));
    // Y follows the player's actual floor height so the shadow stays on elevated tiles.
    const floorY = this._pos.y - (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS);
    this.shadow.position.set(this._pos.x, floorY + 0.03, this._pos.z);
    this.shadow.scale.setScalar(Math.max(0.05, 1 - height * 0.09));
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(
      0,
      (1 - height * 0.11) * 0.5,
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Flash and squash when the player is hit. */
  private onHit(): void {
    this.flashTimer = PLAYER_IFRAME;
    this.bodyMesh.scale.set(1.3, 0.7, 1.3);
  }

  /** Jump take-off: vertical stretch on bodyMesh only. */
  private squashStretchJump(): void {
    this.bodyMesh.scale.set(0.75, 1.35, 0.75);
  }

  /** Landing splat proportional to fall speed, on bodyMesh only. */
  private squashStretchLand(fallVelocity: number): void {
    const t = Math.min(Math.abs(fallVelocity) / MAX_FALL_SPEED, 1);
    const sy = Math.max(0.6, 1 - t * 0.4);
    const sxz = 1 + t * 0.5;
    this.bodyMesh.scale.set(sxz, sy, sxz);
  }

  // ── Static builders ────────────────────────────────────────────────────────

  private static buildMesh(): { group: THREE.Group; bodyMesh: THREE.Mesh; headMesh: THREE.Mesh } {
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
    mesh.renderOrder = 1;
    return mesh;
  }
}

