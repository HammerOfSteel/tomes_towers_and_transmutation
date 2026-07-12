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

// Visual
const SLIME_COLOR = 0x44bb55;
const SLIME_HIT_COLOR = 0xffffff;

// ── FSM ───────────────────────────────────────────────────────────────────

export type EnemyState = 'idle' | 'alert' | 'chase' | 'attack' | 'dead';

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

    // Update mesh flash colour
    const mat = this.bodyMesh.material as THREE.MeshLambertMaterial;
    if (this.flashTimer > 0) {
      mat.color.setHex(SLIME_HIT_COLOR);
    } else {
      mat.color.setHex(SLIME_COLOR);
    }

    // ── FSM transitions ────────────────────────────────────────────────────
    const flat = new THREE.Vector3(playerPos.x - this._pos.x, 0, playerPos.z - this._pos.z);
    const distToPlayer = flat.length();

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
    }

    // ── Movement ───────────────────────────────────────────────────────────
    let vx = 0;
    let vz = 0;

    if (this.state === 'chase' || this.state === 'attack') {
      if (distToPlayer > 0.05) {
        const dir = flat.clone().normalize();
        vx = dir.x * SLIME_SPEED;
        vz = dir.z * SLIME_SPEED;
        this.group.rotation.y = Math.atan2(vx, vz);
      }
    }

    // Gravity — compute movement first, THEN check grounded
    const desired = { x: vx * dt, y: this.verticalVelocity * dt, z: vz * dt };
    this.kcc.computeColliderMovement(this.collider, desired);
    const isGrounded = this.kcc.computedGrounded() && this.verticalVelocity <= 0.1;
    this.verticalVelocity = isGrounded ? GROUND_PUSH : Math.max(this.verticalVelocity - 20 * dt, -20);
    const actual = this.kcc.computedMovement();

    const cur = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: cur.x + actual.x,
      y: cur.y + actual.y,
      z: cur.z + actual.z,
    });

    rapierToThreeInto(this.body.translation(), this._pos);
    this.group.position.copy(this._pos);

    // Idle bounce animation
    if (this.state === 'idle' || this.state === 'alert') {
      this.group.position.y += Math.sin(Date.now() * 0.003) * 0.04;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private doAttack(): void {
    this.attackTimer = SLIME_ATTACK_COOLDOWN;
    this.onAttackPlayer?.(SLIME_ATTACK_DAMAGE);
    // Lunge scale squash
    this.bodyMesh.scale.set(1.3, 0.7, 1.3);
  }

  private onHit(): void {
    this.flashTimer = 0.12;
    // Squash on hit
    this.bodyMesh.scale.set(1.2, 0.8, 1.2);
    if (this.state === 'idle') this.state = 'alert';
  }

  private onDead(): void {
    this.state = 'dead';
    this.group.visible = false;
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
