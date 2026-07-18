import * as THREE from 'three';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import { HealthComponent, type Damageable } from '@/combat/Health';
import { rapierToThreeInto } from '@/physics/helpers';
import RAPIER from '@dimforge/rapier3d-compat';
import type { SlimePersonality } from '@/interactables/TamingGame';
import { mulberry32 } from '@/core/prng';
import type { SpatialHash } from '@/core/SpatialHash';
import { PatrolBehavior, type PatrolBehaviorOptions } from '@/enemy/PatrolBehavior';
import { AggroSystem, type AggroListener } from '@/enemy/AggroSystem';

// VFX PRNG — deterministic, never Math.random()
const _slimeRand = mulberry32(0xBAADF00D);

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
/** Velocity-driven stretch: stretch tall when rising fast, squash when falling. */
const VEL_STRETCH_K = 0.045;       // scale-units per unit/s of vertical velocity

// Hit / death VFX
const HIT_JIGGLE_DURATION = 0.22;  // seconds of lateral wobble after being hit
const DEATH_ANIM_DURATION  = 0.55; // seconds for the pop-and-fade death animation
const DEATH_CHUNK_COUNT    = 8;    // goo blobs ejected on death

// Tame / recruit
const FLEE_HP_FRACTION = 0.15;     // ≤ 15% HP → enter Flee state
const FLEE_SPEED = 4.5;            // run-away speed in flee state
const FOLLOW_DISTANCE = 4.0;       // desired distance from player when recruited
const FOLLOW_SPEED = 3.5;          // following movement speed
const FOLLOWER_AGGRO_RANGE = 7.0;  // radius at which a follower attacks nearby hostiles
const FOLLOWER_ATTACK_SPEED = 4.5; // move speed when chasing a target
const FOLLOWER_ATTACK_DAMAGE = 1;  // damage per follower strike
/** Phase 7h.3 — beyond this distance from the player, skip Rapier KCC and use
 *  direct kinematic steering only (no collision response). Saves ~1 ms/frame
 *  for 20 out-of-range followers since KCC is the costliest per-entity call. */
const FOLLOWER_SIMPLIFIED_DIST = 30; // world units
const GUARD_AGGRO_RANGE = 9.0;      // guards patrol a wider area around the perch
const GUARD_STATION_DIST = 2.5;     // max WU from perch before guard walks back
const TAME_REACT_DURATION = 0.9;   // how long a tame-reaction colour flash lasts

// Visual
const SLIME_COLOR      = 0x44bb55;
const SLIME_HIT_COLOR  = 0xffffff;
const SLIME_FLEE_COLOR    = 0xffdd44; // yellow when fleeing
const SLIME_RECRUIT_COLOR = 0x9955ff; // purple when recruited
const SLIME_GUARD_COLOR   = 0xffaa22; // amber/gold when guarding a Watch Perch

// ── InstancedMesh scratch objects (reused every frame, no GC) ─────────────
const _imTmpV3 = new THREE.Vector3();
const _imTmpQ  = new THREE.Quaternion();
const _imTmpE  = new THREE.Euler();
const _imTmpM4 = new THREE.Matrix4();
const _imZeroM = new THREE.Matrix4().makeScale(0, 0, 0);
const _imTmpC  = new THREE.Color();

// ── InstancedMesh factory ─────────────────────────────────────────────────

/**
 * Create a shared InstancedMesh for all slime bodies.
 * One draw call regardless of minion count.
 * Caller is responsible for calling `slime.writeToIM(im, idx)` every frame.
 */
export function createSlimeBodyIM(maxInstances: number): THREE.InstancedMesh {
  const geo = new THREE.SphereGeometry(SLIME_RADIUS, 12, 8);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: false });
  const im  = new THREE.InstancedMesh(geo, mat, maxInstances);
  im.castShadow = true;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Disable frustum culling — the base geometry bounding sphere is tiny (radius
  // SLIME_RADIUS at origin), so the default culling would hide all instances the
  // moment the camera moves away from world origin.
  im.frustumCulled = false;
  // Hide all slots by default
  for (let i = 0; i < maxInstances; i++) im.setMatrixAt(i, _imZeroM);
  im.instanceMatrix.needsUpdate = true;
  return im;
}

// ── FSM ────────────────────────────────────────────────────────────────

export type EnemyState = 'idle' | 'alert' | 'chase' | 'attack' | 'flee' | 'recruited' | 'guard' | 'dead';

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
  private tameReactTimer = 0;
  private tameReactColor = SLIME_COLOR;
  private _isTaming = false;
  private verticalVelocity = 0;
  private bounceTimer = 0;
  private wasGrounded = true;
  private readonly lungeVel = new THREE.Vector3();
  private readonly _moveDir = new THREE.Vector3();
  private readonly _pos = new THREE.Vector3();
  private readonly bodyMesh: THREE.Mesh;

  // Hit reaction
  private _hitJiggle = 0;

  // Death animation
  private _deathTimer = -1.0;
  private readonly _deathChunks: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3 }> = [];
  private _deathChunkGeo: THREE.IcosahedronGeometry | null = null;
  // G3: death knockback slide
  private _knockbackDir = new THREE.Vector3();
  private _knockbackSpeed = 0;

  /** Current aggro target when acting as a follower. null = follow player. */
  private _followerTarget: SlimeEnemy | null = null;

  // ── B4: PatrolBehavior + AggroSystem integration ──────────────────────────
  /** When set, the patrol FSM overrides the built-in idle→chase transitions. */
  private _patrol: PatrolBehavior | null = null;
  /** Set to true when this enemy receives an aggro shout from a nearby ally. */
  private _aggroAlerted = false;
  /** Countdown for model fade on death (drives EnemyRig opacity to 0). */
  private _modelFadeTimer = -1.0;
  private readonly MODEL_FADE_DURATION = 1.5; // seconds

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
    // Step up tile edges (same settings as the player KCC).
    this.kcc.enableAutostep(0.7, 0.3, false);
    // Snap back down to the floor after descending a tile step.
    this.kcc.enableSnapToGround(0.7);

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
   * Deterministic personality derived from spawn position.
   * Used by TamingGame to score song-word choices against this slime.
   */
  get personality(): SlimePersonality {
    const PERSONALITIES: SlimePersonality[] = ['bold', 'gentle', 'curious', 'lonely'];
    const px = Math.round(this._pos.x * 10);
    const pz = Math.round(this._pos.z * 10);
    // Simple integer hash — deterministic, PRNG-free
    const hash = (Math.abs((px * 2654435761) ^ (pz * 1234567891))) >>> 0;
    return PERSONALITIES[hash % 4];
  }

  /**
   * Visual reaction to a taming song word (called by TamingGame after each choice).
   * Triggers a colour flash and a scale animation without touching FSM state.
   */
  tameReact(quality: 'great' | 'good' | 'neutral' | 'bad'): void {
    this.tameReactTimer = TAME_REACT_DURATION;
    const mat = this.bodyMesh.material as THREE.MeshLambertMaterial;
    switch (quality) {
      case 'great':
        this.tameReactColor = 0xffdd44;          // golden
        mat.color.setHex(0xffdd44);
        this.verticalVelocity = 3.5;             // happy bounce
        this.bodyMesh.scale.set(1.3, 0.28, 1.3); // squash before launch
        break;
      case 'good':
        this.tameReactColor = 0x66ee88;          // lime-green shimmer
        mat.color.setHex(0x66ee88);
        this.bodyMesh.scale.set(1.2, 0.38, 1.2);
        break;
      case 'neutral':
        this.tameReactColor = 0x6688ff;          // cool blue
        mat.color.setHex(0x6688ff);
        break;
      case 'bad':
        this.tameReactColor = 0xee3344;          // alarm red
        mat.color.setHex(0xee3344);
        this.bodyMesh.scale.set(0.85, 0.72, 0.85); // cower / shrink
        break;
    }
  }

  /**
   * Called by TamingGame when the song begins — freezes the slime in place
   * so it doesn't outrun the player during the 3-round overlay.
   */
  startTaming(): void { this._isTaming = true; }

  /**
   * Called by TamingGame on success, failure, or cancel — resumes normal movement.
   */
  stopTaming(): void { this._isTaming = false; }

  /**
   * Force this enemy into the flee state (used by the Intimidate spell / dev tool).
   * Has no effect if the enemy is already recruited or dead.
   */
  forceFlee(): void {
    if (this.state === 'dead' || this.state === 'recruited') return;
    this.state = 'flee';
    (this.bodyMesh.material as THREE.MeshLambertMaterial).color.setHex(SLIME_FLEE_COLOR);
  }

  // ── B4: patrol + aggro ────────────────────────────────────────────────────

  /**
   * Attach a PatrolBehavior so this enemy walks between waypoints when not
   * aggroed.  Call before adding to the scene.
   * Also registers the enemy with the global AggroSystem.
   */
  setPatrolBehavior(opts: Partial<PatrolBehaviorOptions>): void {
    this._patrol = new PatrolBehavior(opts);
    AggroSystem.instance.register(this as unknown as AggroListener);
  }

  /**
   * AggroListener.onAggroShout — called by AggroSystem when a nearby ally
   * detects the player.  Forces this enemy into chase mode next update.
   */
  onAggroShout(_shouter: AggroListener): void {
    if (this.state === 'idle' || this.state === 'alert') {
      this._aggroAlerted = true;
    }
  }

  /** AggroListener.worldPosition (already defined; satisfies the interface). */
  // worldPosition getter already exists below

  /**
   * Recruit this enemy into the player's party.
   * Changes colour to purple and sets the FSM to `'recruited'`.
   * Should be called via `PartyManager.recruit(enemy)`, not directly.
   */
  recruit(): void {
    this.state = 'recruited';
    this._guardPos = null;
    (this.bodyMesh.material as THREE.MeshLambertMaterial).color.setHex(SLIME_RECRUIT_COLOR);
  }

  /** True while this slime is stationed at a Watch Perch. */
  get isGuarding(): boolean { return this.state === 'guard'; }

  /**
   * Assign this slime to guard a Watch Perch at `perchPos`.
   * The slime moves to the perch and defends it instead of following the player.
   * Call `recruit()` to return to normal follow mode.
   */
  assignGuard(perchPos: THREE.Vector3): void {
    this.state = 'guard';
    this._guardPos = perchPos.clone();
    this._followerTarget = null;
    (this.bodyMesh.material as THREE.MeshLambertMaterial).color.setHex(SLIME_GUARD_COLOR);
  }

  // Guard position (non-null while state === 'guard')
  private _guardPos: THREE.Vector3 | null = null;

  takeDamage(amount: number): number {
    return this.health.takeDamage(amount);
  }

  /** World position used by CombatSystem / SpellSystem hit detection. */
  get worldPosition(): THREE.Vector3 {
    return this.group.position;
  }

  /** SpatialHash interface — world X coordinate. */
  get worldX(): number { return this.group.position.x; }
  /** SpatialHash interface — world Z coordinate. */
  get worldZ(): number { return this.group.position.z; }

  // ── Update ────────────────────────────────────────────────────────────────

  update(playerPos: THREE.Vector3, dt: number): void {
    if (this.state === 'dead') {
      this._tickDeathAnim(dt);
      return;
    }

    this.health.tick(dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.tameReactTimer = Math.max(0, this.tameReactTimer - dt);

    // Update mesh flash colour — priority: hit flash > tame react > state colour
    const mat = this.bodyMesh.material as THREE.MeshLambertMaterial;
    if (this.flashTimer > 0) {
      mat.color.setHex(SLIME_HIT_COLOR);
    } else if (this.tameReactTimer > 0) {
      mat.color.setHex(this.tameReactColor);
    } else if (this.state === 'flee') {
      mat.color.setHex(SLIME_FLEE_COLOR);
    } else {
      mat.color.setHex(SLIME_COLOR);
    }

    // Hit jiggle — rapid lateral wobble while flash is active
    if (this._hitJiggle > 0) {
      this._hitJiggle -= dt;
      const progress = 1 - this._hitJiggle / HIT_JIGGLE_DURATION; // 0→1
      const jiggle = Math.sin(progress * Math.PI * 5) * 0.18 * (1 - progress);
      this.bodyMesh.rotation.z = jiggle;
    } else {
      this.bodyMesh.rotation.z = 0;
    }

    // ── FSM transitions ────────────────────────────────────────────────────
    const flat = new THREE.Vector3(playerPos.x - this._pos.x, 0, playerPos.z - this._pos.z);
    const distToPlayer = flat.length();

    // B4: apply aggro shout — force into chase if alerted by a nearby ally
    if (this._aggroAlerted && !this.isDead && this.state !== 'recruited') {
      this.state       = 'chase';
      this._aggroAlerted = false;
    }

    // B4: if patrol behavior is attached, run it in parallel.
    // The patrol FSM returns a movement velocity that overrides the default
    // idle/alert transitions (but NOT flee, recruited, or dead states).
    if (this._patrol && !this.isDead && this.state !== 'flee' && this.state !== 'recruited') {
      const pout = this._patrol.tick(this._pos, playerPos, dt);
      // Sync patrol FSM state → slime state
      if (pout.state === 'dead') {
        this.state = 'dead';
      } else if (pout.state === 'attack') {
        this.state = 'attack';
      } else if (pout.state === 'chase') {
        if (this.state !== 'attack') this.state = 'chase';
        // Broadcast aggro shout on first detection
        if (pout.justDetected) AggroSystem.instance.shout(this as unknown as AggroListener);
      } else if (pout.state === 'alert') {
        if (this.state === 'idle') {
          this.state = 'alert';
          if (pout.justDetected) AggroSystem.instance.shout(this as unknown as AggroListener);
        }
      }
      // Override movement with patrol FSM output (applied further down in movement section)
      this.group.userData['_patrolOut'] = pout;
    } else {
      this.group.userData['_patrolOut'] = null;
    }

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
      if (!this._isTaming) {
        // Run directly away from the player
        const dir = flat.clone().normalize().negate();
        vx = dir.x * FLEE_SPEED;
        vz = dir.z * FLEE_SPEED;
        this.group.rotation.y = Math.atan2(vx, vz);
      }
      // _isTaming === true → stay still while the song plays
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

    // Velocity-driven airborne stretch — stretch tall when rising, squash when falling fast
    if (!isGrounded && this._hitJiggle <= 0) {
      const velStretch = this.verticalVelocity * VEL_STRETCH_K;  // positive = tall
      const targetY = Math.max(0.18, REST_SCALE_Y + velStretch);
      const lateralSq = Math.max(0.55, 1.0 - velStretch * 0.6); // conserve volume
      this.bodyMesh.scale.y += (targetY    - this.bodyMesh.scale.y) * 0.25;
      this.bodyMesh.scale.x += (lateralSq  - this.bodyMesh.scale.x) * 0.25;
      this.bodyMesh.scale.z += (lateralSq  - this.bodyMesh.scale.z) * 0.25;
    }

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

    // ── Animation ─────────────────────────────────────────────────────────

    if (this._isTaming) {
      // Hypnosis trance: slow spin, gentle float, pulsing lavender
      this.group.rotation.y += 0.65 * dt;
      const t = Date.now() * 0.001;
      this.bodyMesh.position.y = Math.sin(t * 2.3) * 0.14;
      const swell = Math.sin(t * 3.8) * 0.07;
      this.bodyMesh.scale.set(1.15 + swell, REST_SCALE_Y - swell * 0.45, 1.15 + swell);
      // Pulsing lavender — only when no hit / tame-react flash is active
      if (this.flashTimer <= 0 && this.tameReactTimer <= 0) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
        (this.bodyMesh.material as THREE.MeshLambertMaterial).color.setRGB(
          0.52 + pulse * 0.08,
          0.28 + pulse * 0.05,
          0.72 + pulse * 0.1,
        );
      }
    } else if (this.state === 'idle' || this.state === 'alert') {
      this.bodyMesh.position.y = 0;
      // Idle breathing pulse — gentle scale sine when at rest
      const breath = Math.sin(Date.now() * 0.0022) * 0.06;
      this.bodyMesh.scale.y = REST_SCALE_Y + breath;
      this.bodyMesh.scale.x = 1.0 - breath * 0.55;
      this.bodyMesh.scale.z = 1.0 - breath * 0.55;
    } else {
      this.bodyMesh.position.y = 0;
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
   * @param playerPos  Target position to follow
   * @param enemies    All active enemies in the scene — followers will aggro hostiles within range
   * @param dt         Frame delta
   */
  updateAsFollower(playerPos: THREE.Vector3, hostileHash: SpatialHash<SlimeEnemy>, dt: number): void {
    if (this.isDead) { this._tickDeathAnim(dt); return; }
    if (this.state === 'guard') { this._tickGuard(hostileHash, dt); return; }
    if (this.state !== 'recruited') return;

    this.health.tick(dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);

    // ── Follower aggro — spatial hash lookup (Phase 7h) ───────────────────
    // Clear dead/recruited target
    if (this._followerTarget && (this._followerTarget.isDead || this._followerTarget.isRecruited)) {
      this._followerTarget = null;
    }
    // Search for new target via hash — O(constant cells) instead of O(n)
    if (!this._followerTarget) {
      const candidates = hostileHash.queryRadius(
        this._pos.x, this._pos.z, FOLLOWER_AGGRO_RANGE,
      );
      let closestD2 = FOLLOWER_AGGRO_RANGE * FOLLOWER_AGGRO_RANGE + 1;
      for (const en of candidates) {
        if (en === this) continue;
        const dx = en.worldX - this._pos.x;
        const dz = en.worldZ - this._pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < closestD2) { closestD2 = d2; this._followerTarget = en; }
      }
    }

    let vx = 0;
    let vz = 0;

    if (this._followerTarget) {
      // ── Chase and attack hostile enemy ───────────────────────────────────
      const toTarget = this._followerTarget.worldPosition.clone().sub(this._pos);
      const dist = toTarget.length();
      if (dist > SLIME_ATTACK_RANGE) {
        const dir = toTarget.normalize();
        vx = dir.x * FOLLOWER_ATTACK_SPEED;
        vz = dir.z * FOLLOWER_ATTACK_SPEED;
        this.group.rotation.y = Math.atan2(vx, vz);
      } else if (this.attackTimer <= 0) {
        this._followerTarget.takeDamage(FOLLOWER_ATTACK_DAMAGE);
        this.attackTimer = SLIME_ATTACK_COOLDOWN;
        // Small pounce on attack
        this.verticalVelocity = BOUNCE_VEL * 0.6;
        this.bodyMesh.scale.set(0.8, 0.9, 0.8);
      }
    } else {
      // ── Follow player ─────────────────────────────────────────────────────
      const dx = playerPos.x - this._pos.x;
      const dz = playerPos.z - this._pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > FOLLOW_DISTANCE) {
        const speed = Math.min(FOLLOW_SPEED, (dist - FOLLOW_DISTANCE) * 4);
        vx = (dx / dist) * speed;
        vz = (dz / dist) * speed;
        this.group.rotation.y = Math.atan2(vx, vz);
      }
      // Bounce toward player if far behind
      this.bounceTimer = Math.max(0, this.bounceTimer - dt);

      // Phase 7h.3 — skip full KCC for followers too far from the player
      if (dist > FOLLOWER_SIMPLIFIED_DIST) {
        const cur = this.body.translation();
        this.body.setNextKinematicTranslation({
          x: cur.x + vx * dt,
          y: Math.max(cur.y - 0.05, 0.9),
          z: cur.z + vz * dt,
        });
      } else {
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
      }
      rapierToThreeInto(this.body.translation(), this._pos);
      this.group.position.copy(this._pos);
      // Follower idle breathing (purple tint held)
      const breath = Math.sin(Date.now() * 0.0022) * 0.05;
      this.bodyMesh.scale.y = REST_SCALE_Y + breath;
      this.bodyMesh.scale.x = 1.0 - breath * 0.4;
      this.bodyMesh.scale.z = 1.0 - breath * 0.4;
      return;
    }

    // Physics step for aggro-chase branch (Phase 7h.3: skip KCC when distant)
    const playerDist = playerPos.distanceTo(this._pos);
    if (playerDist > FOLLOWER_SIMPLIFIED_DIST) {
      const cur = this.body.translation();
      this.body.setNextKinematicTranslation({
        x: cur.x + vx * dt,
        y: Math.max(cur.y - 0.05, 0.9),
        z: cur.z + vz * dt,
      });
    } else {
      const desired = { x: vx * dt, y: this.verticalVelocity * dt, z: vz * dt };
      this.kcc.computeColliderMovement(this.collider, desired);
      const isGrounded = this.kcc.computedGrounded() && this.verticalVelocity <= 0.1;
      if (isGrounded) {
        this.verticalVelocity = GROUND_PUSH;
      } else {
        this.verticalVelocity = Math.max(this.verticalVelocity - 20 * dt, -20);
      }
      const actual = this.kcc.computedMovement();
      const cur = this.body.translation();
      this.body.setNextKinematicTranslation({
        x: cur.x + actual.x, y: cur.y + actual.y, z: cur.z + actual.z,
      });
    }
    rapierToThreeInto(this.body.translation(), this._pos);
    this.group.position.copy(this._pos);
    // Scale lerp when attacking
    const lerpT = Math.min(1, SCALE_LERP * dt);
    this.bodyMesh.scale.x += (1.0 - this.bodyMesh.scale.x) * lerpT;
    this.bodyMesh.scale.y += (REST_SCALE_Y - this.bodyMesh.scale.y) * lerpT;
    this.bodyMesh.scale.z += (1.0 - this.bodyMesh.scale.z) * lerpT;
  }

  /**
   * Per-frame update for a guard slime (state === 'guard').
   * The slime:
   *  1. Attacks any hostile enemy within GUARD_AGGRO_RANGE of the perch.
   *  2. Returns to the perch position when far away and not in combat.
   *  3. Never follows the player.
   */
  private _tickGuard(hostileHash: SpatialHash<SlimeEnemy>, dt: number): void {
    if (!this._guardPos) return;

    this.health.tick(dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);

    // Clear dead/recruited target
    if (this._followerTarget && (this._followerTarget.isDead || this._followerTarget.isRecruited)) {
      this._followerTarget = null;
    }
    // Search for hostiles near the perch
    if (!this._followerTarget) {
      const candidates = hostileHash.queryRadius(
        this._guardPos.x, this._guardPos.z, GUARD_AGGRO_RANGE,
      );
      let closestD2 = GUARD_AGGRO_RANGE * GUARD_AGGRO_RANGE + 1;
      for (const en of candidates) {
        if (en === this) continue;
        const dx = en.worldX - this._guardPos.x;
        const dz = en.worldZ - this._guardPos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < closestD2) { closestD2 = d2; this._followerTarget = en; }
      }
    }

    let vx = 0;
    let vz = 0;

    if (this._followerTarget) {
      // Chase hostile and attack
      const toTarget = this._followerTarget.worldPosition.clone().sub(this._pos);
      const dist = toTarget.length();
      if (dist > SLIME_ATTACK_RANGE) {
        const dir = toTarget.normalize();
        vx = dir.x * FOLLOWER_ATTACK_SPEED;
        vz = dir.z * FOLLOWER_ATTACK_SPEED;
        this.group.rotation.y = Math.atan2(vx, vz);
      } else if (this.attackTimer <= 0) {
        this._followerTarget.takeDamage(FOLLOWER_ATTACK_DAMAGE);
        this.attackTimer = SLIME_ATTACK_COOLDOWN;
        this.verticalVelocity = BOUNCE_VEL * 0.6;
        this.bodyMesh.scale.set(0.8, 0.9, 0.8);
      }
    } else {
      // Return to station when outside GUARD_STATION_DIST
      const dx = this._guardPos.x - this._pos.x;
      const dz = this._guardPos.z - this._pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > GUARD_STATION_DIST) {
        const speed = Math.min(FOLLOW_SPEED, (dist - 1.0) * 3);
        vx = (dx / dist) * speed;
        vz = (dz / dist) * speed;
        this.group.rotation.y = Math.atan2(vx, vz);
      } else {
        // Idle at perch — amber breathing
        const breath = Math.sin(Date.now() * 0.0018) * 0.04;
        this.bodyMesh.scale.y = REST_SCALE_Y + breath;
        this.bodyMesh.scale.x = 1.0 - breath * 0.3;
        this.bodyMesh.scale.z = 1.0 - breath * 0.3;
        // Apply physics translate only (keep grounded)
        const cur = this.body.translation();
        this.body.setNextKinematicTranslation({
          x: cur.x, y: Math.max(cur.y - 0.05, 0.9), z: cur.z,
        });
        rapierToThreeInto(this.body.translation(), this._pos);
        this.group.position.copy(this._pos);
        return;
      }
    }

    // Physics translate (use simplified steering — guards need no KCC overhead)
    const cur = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: cur.x + vx * dt,
      y: Math.max(cur.y - 0.05, 0.9),
      z: cur.z + vz * dt,
    });
    rapierToThreeInto(this.body.translation(), this._pos);
    this.group.position.copy(this._pos);
    const lerpT = Math.min(1, SCALE_LERP * dt);
    this.bodyMesh.scale.x += (1.0 - this.bodyMesh.scale.x) * lerpT;
    this.bodyMesh.scale.y += (REST_SCALE_Y - this.bodyMesh.scale.y) * lerpT;
    this.bodyMesh.scale.z += (1.0 - this.bodyMesh.scale.z) * lerpT;
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
    this.flashTimer = 0.15;
    this._hitJiggle = HIT_JIGGLE_DURATION;
    this.bodyMesh.scale.set(1.55, 0.18, 1.55);  // dramatic splat on hit
    this.verticalVelocity = 2.5;                  // small bounce-up reaction
    if (this.state === 'idle') this.state = 'alert';
  }

  /** G3: Apply a brief outward slide on death (call when lethal damage is dealt).
   *  @param fromPos  World position of the attacker — enemy slides away from it.
   *  @param speed    Initial slide speed in WU/s (default 4). */
  applyDeathKnockback(fromPos: THREE.Vector3, speed = 4.0): void {
    this._knockbackDir.subVectors(this.worldPosition, fromPos).setY(0);
    if (this._knockbackDir.lengthSq() < 0.001) this._knockbackDir.set(1, 0, 0);
    this._knockbackDir.normalize();
    this._knockbackSpeed = speed;
  }

  private onDead(): void {
    this.state = 'dead';
    this._deathTimer = DEATH_ANIM_DURATION;
    // B4: start model fade timer for the attached EnemyRig (if any)
    this._modelFadeTimer = this.MODEL_FADE_DURATION;
    // Unregister from aggro system on death
    AggroSystem.instance.unregister(this as unknown as AggroListener);

    // Reset colour and show body for Phase 1 pop squash
    (this.bodyMesh.material as THREE.MeshLambertMaterial).color.setHex(SLIME_COLOR);

    // Initial pop squash — very flat, spread wide
    this.bodyMesh.scale.set(1.9, 0.06, 1.9);
    this.bodyMesh.visible = true;

    // Goo chunk blobs ejected radially outward
    this._deathChunkGeo = new THREE.IcosahedronGeometry(0.11, 0);
    for (let i = 0; i < DEATH_CHUNK_COUNT; i++) {
      const chunkMat = new THREE.MeshLambertMaterial({
        color: SLIME_COLOR,
        transparent: true,
        opacity: 1.0,
      });
      const chunk = new THREE.Mesh(this._deathChunkGeo, chunkMat);
      // Squished blob scale
      chunk.scale.set(0.55 + _slimeRand() * 0.9, 0.2 + _slimeRand() * 0.25, 0.55 + _slimeRand() * 0.9);
      chunk.position.set(
        (_slimeRand() - 0.5) * 0.4,
        0.1 + _slimeRand() * 0.25,
        (_slimeRand() - 0.5) * 0.4,
      );
      this.group.add(chunk);
      const angle = (i / DEATH_CHUNK_COUNT) * Math.PI * 2 + (_slimeRand() - 0.5) * 0.7;
      const speed = 3.0 + _slimeRand() * 3.5;
      this._deathChunks.push({
        mesh: chunk,
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          2.0 + _slimeRand() * 3.0,
          Math.sin(angle) * speed,
        ),
      });
    }
  }

  /** Tick the death pop animation; hides group when complete. */
  private _tickDeathAnim(dt: number): void {
    if (this._deathTimer <= 0) return;
    this._deathTimer -= dt;

    const elapsed = DEATH_ANIM_DURATION - Math.max(0, this._deathTimer);
    const t = elapsed / DEATH_ANIM_DURATION; // 0 → 1

    // G3: knockback slide — decelerates over the first 30% of the anim
    if (t < 0.3 && this._knockbackSpeed > 0) {
      const slide = this._knockbackSpeed * dt;
      this.group.position.addScaledVector(this._knockbackDir, slide);
      this._knockbackSpeed = Math.max(0, this._knockbackSpeed - 20 * dt); // decelerate
    }

    if (t < 0.20) {
      // Phase 1 (0–20%): pop—body expands outward flat like a burst bubble
      const et = t / 0.20;
      this.bodyMesh.scale.set(1.9 + et * 0.8, Math.max(0.01, 0.06 - et * 0.05), 1.9 + et * 0.8);
      this.bodyMesh.visible = true;
    } else if (this.bodyMesh.visible) {
      // Phase 2 (20–100%): body is done — hide it, let chunks take over
      this.bodyMesh.visible = false;
    }

    // Animate goo chunks
    for (const { mesh, vel } of this._deathChunks) {
      vel.y -= 18 * dt; // gravity
      mesh.position.x += vel.x * dt;
      mesh.position.y += vel.y * dt;
      mesh.position.z += vel.z * dt;
      // Chunks fade out in second half of animation
      if (t > 0.35) {
        const cf = (t - 0.35) / 0.65;
        (mesh.material as THREE.MeshLambertMaterial).opacity = Math.max(0, 1 - cf);
      }
    }

    // End of animation: hide everything
    if (this._deathTimer <= 0) {
      this.group.visible = false;
    }
  }

  /** G1: Revive this enemy at a new position (pool reuse).
   *  Resets HP, FSM state, model opacity, and physics body position. */
  revive(newPos: THREE.Vector3): void {
    this._pos.copy(newPos);
    this.group.position.copy(newPos);
    this.health.reset();
    this.state = 'idle';
    this._modelFadeTimer = -1;
    // Reset visual opacity on body mesh and any child meshes
    this.group.traverse(child => {
      const m = child as THREE.Mesh;
      if (m.material) {
        const mat = m.material as THREE.MeshLambertMaterial;
        if (typeof mat.opacity === 'number') mat.opacity = 1;
        mat.transparent = false;
      }
    });
    this.group.visible = true;
  }

  /** Remove this enemy's physics bodies from the world.
   *  Call when unloading the room — also remove `this.group` from the scene. */
  dispose(physics: PhysicsWorld): void {
    physics.rapierWorld.removeCharacterController(this.kcc);
    physics.rapierWorld.removeRigidBody(this.body);
    this._deathChunkGeo?.dispose();
    for (const { mesh } of this._deathChunks) {
      (mesh.material as THREE.MeshLambertMaterial).dispose();
    }
  }

  /**
   * Write this slime's current body transform and colour into an InstancedMesh slot.
   * Call once per frame after update() has run.
   * @param im   The shared slime InstancedMesh owned by OverworldScene.
   * @param idx  Stable index for this slime (its position in the enemies array).
   */
  writeToIM(im: THREE.InstancedMesh, idx: number): void {
    if (!this.bodyMesh.visible) {
      im.setMatrixAt(idx, _imZeroM);
      return;
    }
    const p  = this.group.position;
    const by = this.bodyMesh.position.y;
    _imTmpE.set(0, this.group.rotation.y, this.bodyMesh.rotation.z, 'YZX');
    _imTmpQ.setFromEuler(_imTmpE);
    _imTmpV3.set(p.x, p.y + by, p.z);
    _imTmpM4.compose(_imTmpV3, _imTmpQ, this.bodyMesh.scale);
    im.setMatrixAt(idx, _imTmpM4);
    im.setColorAt!(idx, _imTmpC.set((this.bodyMesh.material as THREE.MeshLambertMaterial).color));
  }

  private static buildMesh(): { group: THREE.Group; bodyMesh: THREE.Mesh } {
    const group = new THREE.Group();
    // Flattened sphere — individual mesh for dungeon rendering.
    // Overworld rendering uses InstancedMesh (writeToIM); those groups are never
    // added to the scene so adding bodyMesh here is safe for both contexts.
    const geo = new THREE.SphereGeometry(SLIME_RADIUS, 12, 8);
    const mat = new THREE.MeshLambertMaterial({ color: SLIME_COLOR });
    const bodyMesh = new THREE.Mesh(geo, mat);
    bodyMesh.scale.y = 0.55;
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
