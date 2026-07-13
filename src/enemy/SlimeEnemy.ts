import * as THREE from 'three';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import { HealthComponent, type Damageable } from '@/combat/Health';
import { rapierToThreeInto } from '@/physics/helpers';
import RAPIER from '@dimforge/rapier3d-compat';

// ── Constants ─────────────────────────────────────────────────────────────

const SLIME_RADIUS = 0.45;
const SLIME_HP = 6;
const SLIME_IFRAME_DURATION = 0.3;
const SLIME_SPEED = 2.8;
const SLIME_ATTACK_RANGE = 1.1;
const SLIME_ATTACK_DAMAGE = 1;
const SLIME_ATTACK_COOLDOWN = 1.2;
const SLIME_ALERT_RANGE = 8;
const SLIME_CHASE_DROP_RANGE = 12;
const GROUND_PUSH = -2;

// Bounce animation
const BOUNCE_INTERVAL = 0.55;      // min seconds between chase hops
const BOUNCE_VEL = 5.5;             // upward launch speed for chase hop
const ATTACK_BOUNCE_VEL = 8.5;     // upward launch speed for attack lunge
const ATTACK_LUNGE_SPEED = 5.5;    // forward burst speed on attack pounce
const SCALE_LERP = 9;              // scale recovery speed (per second)
const REST_SCALE_Y = 0.55;         // resting body Y scale (matches buildMesh)

// Tame / recruit
const FLEE_HP_FRACTION = 0.15;     // ≤ 15% HP → enter Flee state
const FLEE_SPEED = 4.5;            // run-away speed in flee state
const FOLLOW_DISTANCE = 4.0;       // desired distance from player when recruited
const FOLLOW_SPEED = 3.5;          // following movement speed

// Visual
const SLIME_COLOR     = 0x44bb55;
const SLIME_HIT_COLOR = 0xffffff;
const SLIME_FLEE_COLOR    = 0xffdd44; // yellow when fleeing
const SLIME_RECRUIT_COLOR = 0x9955ff; // purple when recruited

// ── FSM ────────────────────────────────────────────────────────────────

export type EnemyState = 'idle' | 'alert' | 'chase' | 'attack' | 'flee' | 'recruited' | 'dead';

// ── SlimeEnemy ────────────────────────────────────────────────────────────

/** Procedural slime enemy (flattened sphere) with a simple chase/attack FSM.
 *
 *  Add `slime.group` to the scene.
 *  Call `slime.update(playerPos, dt)` each frame.
 *  `slime.worldPosition` is used by combat hit detection.
 */
export class SlimeEnemy implements Damageable {
  readonly group: THREE.Group;
  readonly health: HealthComponent;
  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly kcc: RAPIER.KinematicCharacterController;

  private state: EnemyState = 'idle';
  private attackTimer = 0;
  private flashTimer = 0;
  private verticalVelocity = 0;
  private bounceTimer = 0;
  private wasGrounded = true;
  private readonly lungeVel = new THREE.Vector3();
  private readonly _moveDir = new THREE.Vector3();
  private readonly _pos = new THREE.Vector3();
  private readonly bodyMesh: THREE.Mesh;

  constructor(
    spawnPosition: THREE.Vector3,
    physics: PhysicsWorld,
    private readonly onAttackPlayer?: (damage: number) => void,
  ) {
    // Physics — kinematic capsule so it can be moved manually like the player
    const { body, collider } = physics.createKinematicCapsule(
      spawnPosition,
      SLIME_RADIUS * 0.5,
      SLIME_RADIUS,
    );
    this.body = body;
    this.collider = collider;

    this.kcc = physics.createCharacterController(0.01);
    this.kcc.setSlideEnabled(true);
    this.kcc.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((30 * Math.PI) / 180);

    this.health = new HealthComponent(
      SLIME_HP,
      SLIME_IFRAME_DURATION,
      () => this.onHit(),
      () => this.onDead(),
    );

    const { group, bodyMesh } = SlimeEnemy.buildMesh();
    this.group = group;
    this.bodyMesh = bodyMesh;
    this.group.position.copy(spawnPosition);
  }

  // ── Damageable impl ───────────────────────────────────────────────────────

  get hp(): number { return this.health.hp; }
  get maxHp(): number { return this.health.maxHp; }
  get isDead(): boolean { return this.health.isDead; }

  /** True when HP ≤ 15% and the enemy can be spared / recruited. */
  get isRecruitable(): boolean { return this.state === 'flee'; }

  /** True once the enemy has been recruited into the player's party. */
  get isRecruited(): boolean { return this.state === 'recruited'; }

  /**
   * Recruit this enemy into the player's party.
   * Changes colour to purple and sets the FSM to `'recruited'`.
   * Should be called via `PartyManager.recruit(enemy)`, not directly.
   */
  recruit(): void {
    this.state = 'recruited';
    (this.bodyMesh.material as THREE.MeshLambertMaterial).color.setHex(SLIME_RECRUIT_COLOR);
  }

  takeDamage(amount: number): number {
    return this.health.takeDamage(amount);
  }

  /** World position used by CombatSystem / SpellSystem hit detection. */
  get worldPosition(): THREE.Vector3 {
    return this.group.position;
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(playerPos: THREE.Vector3, dt: number): void {
    if (this.state === 'dead') return;

    this.health.tick(dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);

    // Update mesh flash colour (respect current state tint)
    const mat = this.bodyMesh.material as THREE.MeshLambertMaterial;
    if (this.flashTimer > 0) {
      mat.color.setHex(SLIME_HIT_COLOR);
    } else if (this.state === 'flee') {
      mat.color.setHex(SLIME_FLEE_COLOR);
    } else {
      mat.color.setHex(SLIME_COLOR);
    }

    // ── FSM transitions ────────────────────────────────────────────────────
    const flat = new THREE.Vector3(playerPos.x - this._pos.x, 0, playerPos.z - this._pos.z);
    const distToPlayer = flat.length();

    // Low-HP flee threshold (check before normal FSM so it can interrupt any state)
    if (this.state !== 'flee' && this.state !== 'recruited') {
      if (this.health.hp / this.health.maxHp <= FLEE_HP_FRACTION) {
        this.state = 'flee';
      }
    }

    switch (this.state) {
      case 'idle':
        if (distToPlayer < SLIME_ALERT_RANGE) this.state = 'alert';
        break;

      case 'alert':
        if (distToPlayer < SLIME_ALERT_RANGE) {
          this.state = 'chase';
        } else {
          this.state = 'idle';
        }
        break;

      case 'chase':
        if (distToPlayer > SLIME_CHASE_DROP_RANGE) {
          this.state = 'idle';
        } else if (distToPlayer < SLIME_ATTACK_RANGE) {
          this.state = 'attack';
        }
        break;

      case 'attack':
        if (distToPlayer > SLIME_ATTACK_RANGE * 1.3) {
          this.state = 'chase'; // player moved away
        } else if (this.attackTimer <= 0) {
          this.doAttack();
        }
        break;

      // 'flee', 'recruited', 'dead' — handled below / separately
    }

    // ── Movement ───────────────────────────────────────────────────────────
    let vx = 0;
    let vz = 0;

    if (this.state === 'chase' || this.state === 'attack') {
      if (distToPlayer > 0.05) {
        const dir = flat.clone().normalize();
        this._moveDir.copy(dir);
        vx = dir.x * SLIME_SPEED;
        vz = dir.z * SLIME_SPEED;
        this.group.rotation.y = Math.atan2(vx, vz);
      }
    } else if (this.state === 'flee' && distToPlayer > 0.05) {
      // Run directly away from the player
      const dir = flat.clone().normalize().negate();
      vx = dir.x * FLEE_SPEED;
      vz = dir.z * FLEE_SPEED;
      this.group.rotation.y = Math.atan2(vx, vz);
    }

    // Apply and decay attack lunge burst
    vx += this.lungeVel.x;
    vz += this.lungeVel.z;
    this.lungeVel.multiplyScalar(Math.max(0, 1 - 12 * dt));

    // Physics — compute movement first, THEN read grounded state
    const desired = { x: vx * dt, y: this.verticalVelocity * dt, z: vz * dt };
    this.kcc.computeColliderMovement(this.collider, desired);
    const isGrounded = this.kcc.computedGrounded() && this.verticalVelocity <= 0.1;

    // Landing splat: big flat squash when slime hits the ground
    if (!this.wasGrounded && isGrounded) {
      this.bodyMesh.scale.set(1.6, 0.22, 1.6);
    }
    this.wasGrounded = isGrounded;

    // Chase bounce — hop rhythmically toward the player
    if (this.state === 'chase') {
      this.bounceTimer = Math.max(0, this.bounceTimer - dt);
      if (this.bounceTimer === 0 && isGrounded) {
        this.verticalVelocity = BOUNCE_VEL;
        this.bounceTimer = BOUNCE_INTERVAL;
        this.bodyMesh.scale.set(1.45, 0.28, 1.45);  // compress before launch
      } else if (isGrounded) {
        this.verticalVelocity = GROUND_PUSH;
      } else {
        this.verticalVelocity = Math.max(this.verticalVelocity - 20 * dt, -20);
      }
    } else if (isGrounded) {
      this.verticalVelocity = GROUND_PUSH;
    } else {
      this.verticalVelocity = Math.max(this.verticalVelocity - 20 * dt, -20);
    }

    const actual = this.kcc.computedMovement();

    const cur = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: cur.x + actual.x,
      y: cur.y + actual.y,
      z: cur.z + actual.z,
    });

    rapierToThreeInto(this.body.translation(), this._pos);
    this.group.position.copy(this._pos);

    // Idle breathing pulse — gentle scale sine when at rest
    if (this.state === 'idle' || this.state === 'alert') {
      const breath = Math.sin(Date.now() * 0.0022) * 0.06;
      this.bodyMesh.scale.y = REST_SCALE_Y + breath;
      this.bodyMesh.scale.x = 1.0 - breath * 0.55;
      this.bodyMesh.scale.z = 1.0 - breath * 0.55;
    } else {
      // Lerp scale back toward resting values after any squash/stretch
      const lerpT = Math.min(1, SCALE_LERP * dt);
      this.bodyMesh.scale.x += (1.0 - this.bodyMesh.scale.x) * lerpT;
      this.bodyMesh.scale.y += (REST_SCALE_Y - this.bodyMesh.scale.y) * lerpT;
      this.bodyMesh.scale.z += (1.0 - this.bodyMesh.scale.z) * lerpT;
    }
  }

  /**
   * Update loop used when the slime has been recruited into the player's party.
   * Simple follower behaviour: keep close to the player, basic idle at range.
   * (Full combat AI for followers is Phase 7.)
   *
   * @param playerPos Target position to follow
   * @param _enemies  Reserved for Phase 7 follower combat
   * @param dt        Frame delta
   */
  updateAsFollower(playerPos: THREE.Vector3, _enemies: readonly unknown[], dt: number): void {
    if (this.state !== 'recruited' || this.isDead) return;

    this.health.tick(dt);

    const dx = playerPos.x - this._pos.x;
    const dz = playerPos.z - this._pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    let vx = 0, vz = 0;
    if (dist > FOLLOW_DISTANCE) {
      const speed = Math.min(FOLLOW_SPEED, (dist - FOLLOW_DISTANCE) * 4);
      vx = (dx / dist) * speed;
      vz = (dz / dist) * speed;
      this.group.rotation.y = Math.atan2(vx, vz);
    }

    // Bounce toward player if far enough
    this.bounceTimer = Math.max(0, this.bounceTimer - dt);
    const desired = { x: vx * dt, y: this.verticalVelocity * dt, z: vz * dt };
    this.kcc.computeColliderMovement(this.collider, desired);
    const isGrounded = this.kcc.computedGrounded() && this.verticalVelocity <= 0.1;
    if (isGrounded) {
      this.verticalVelocity = GROUND_PUSH;
      if (dist > FOLLOW_DISTANCE + 2 && this.bounceTimer === 0) {
        this.verticalVelocity = BOUNCE_VEL * 0.8;
        this.bounceTimer = BOUNCE_INTERVAL;
      }
    } else {
      this.verticalVelocity = Math.max(this.verticalVelocity - 20 * dt, -20);
    }

    const actual = this.kcc.computedMovement();
    const cur = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: cur.x + actual.x, y: cur.y + actual.y, z: cur.z + actual.z,
    });
    rapierToThreeInto(this.body.translation(), this._pos);
    this.group.position.copy(this._pos);

    // Follower idle breathing (purple tint held)
    const breath = Math.sin(Date.now() * 0.0022) * 0.05;
    this.bodyMesh.scale.y = REST_SCALE_Y + breath;
    this.bodyMesh.scale.x = 1.0 - breath * 0.4;
    this.bodyMesh.scale.z = 1.0 - breath * 0.4;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private doAttack(): void {
    this.attackTimer = SLIME_ATTACK_COOLDOWN;
    this.onAttackPlayer?.(SLIME_ATTACK_DAMAGE);
    // Attack pounce — stretch tall then leap at the player
    this.verticalVelocity = ATTACK_BOUNCE_VEL;
    this.lungeVel.copy(this._moveDir).multiplyScalar(ATTACK_LUNGE_SPEED);
    this.bodyMesh.scale.set(0.72, 0.92, 0.72);  // stretch tall before pounce
  }

  private onHit(): void {
    this.flashTimer = 0.12;
    this.bodyMesh.scale.set(1.35, 0.28, 1.35);  // splat flat on hit
    if (this.state === 'idle') this.state = 'alert';
  }

  private onDead(): void {
    this.state = 'dead';
    this.group.visible = false;
  }

  /** Remove this enemy's physics bodies from the world.
   *  Call when unloading the room — also remove `this.group` from the scene. */
  dispose(physics: PhysicsWorld): void {
    physics.rapierWorld.removeCharacterController(this.kcc);
    physics.rapierWorld.removeRigidBody(this.body);
  }

  private static buildMesh(): { group: THREE.Group; bodyMesh: THREE.Mesh } {
    const group = new THREE.Group();
    // Flattened sphere — scale Y down to make it look squishy
    const geo = new THREE.SphereGeometry(SLIME_RADIUS, 12, 8);
    const mat = new THREE.MeshLambertMaterial({ color: SLIME_COLOR });
    const bodyMesh = new THREE.Mesh(geo, mat);
    bodyMesh.scale.y = 0.55;
    bodyMesh.castShadow = true;
    group.add(bodyMesh);
    return { group, bodyMesh };
  }
}

// ── Factory ───────────────────────────────────────────────────────────────

/** Spawn positions for the Phase 2 arena. */
export const SLIME_SPAWN_POSITIONS: THREE.Vector3[] = [
  new THREE.Vector3(-4, 1.5, -4),
  new THREE.Vector3(4, 1.5, -5),
  new THREE.Vector3(-5, 1.5, 3),
];
