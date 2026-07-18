/**
 * PatrolBehavior — composable patrol + chase + attack FSM.
 *
 * Phase B4 — Tier-1 melee enemy AI.
 *
 * The FSM transitions:
 *
 *   PATROL  ─── detect(distToPlayer < alertRange) ──►  ALERT
 *      ▲                                                   │
 *      │                                              (turn + shout)
 *      └── lost(distToPlayer > dropRange) ────────────────►│
 *                                                          ▼
 *                                                        CHASE
 *                                                          │
 *                                         melee ◄── (distToPlayer < attackRange)
 *                                           │
 *                                     (distToPlayer > attackRange * 1.3)
 *                                           │
 *                                           ▼
 *                                         CHASE
 *
 * Waypoint patrol: enemy walks between a list of world-space waypoints in
 * sequence (looping).  Waypoints are typically placed by SceneManager at room
 * edge midpoints so enemies traverse the room perimeter.
 *
 * Usage:
 *   const patrol = new PatrolBehavior({ waypoints, alertRange: 8, attackRange: 1.2 });
 *
 *   // Inside enemy update():
 *   const out = patrol.tick(myPos, playerPos, dt);
 *   if (out.shouldAttack)   doMeleeAttack();
 *   move(out.velocity.x, out.velocity.z);
 *   faceYaw(out.facingYaw);
 *   setAnimState(out.animState);
 */

import * as THREE from 'three';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PatrolFSMState =
  | 'patrol'   // walking between waypoints
  | 'idle'     // standing (no waypoints configured)
  | 'alert'    // detected player, pausing before chase
  | 'chase'    // running toward player
  | 'attack'   // melee range — issue attack
  | 'dead';    // terminal state

export type EnemyAnimTarget = 'idle' | 'walk' | 'run' | 'attack' | 'death' | 'hurt';

export interface PatrolBehaviorOutput {
  state:      PatrolFSMState;
  animState:  EnemyAnimTarget;
  /** Desired XZ velocity in world units/s.  Caller applies this via physics. */
  velocity:   { x: number; z: number };
  /** Facing direction (radians). Caller sets group.rotation.y. */
  facingYaw:  number;
  /** True this frame if the enemy should issue a melee strike. */
  shouldAttack: boolean;
  /** True the frame the enemy first detects the player (trigger aggro shout). */
  justDetected: boolean;
}

export interface PatrolBehaviorOptions {
  waypoints:    Array<{ x: number; z: number }>;
  alertRange:   number;   // detect player within this distance
  dropRange:    number;   // give up chase beyond this distance
  attackRange:  number;   // enter attack when this close
  patrolSpeed:  number;   // WU/s while patrolling
  chaseSpeed:   number;   // WU/s while chasing
  /** Seconds to hover in ALERT state before starting chase. */
  alertDuration: number;
  /** Cooldown between attacks (seconds). */
  attackCooldown: number;
  /** Waypoint arrival threshold (world units). */
  waypointThreshold: number;
}

const DEFAULTS: PatrolBehaviorOptions = {
  waypoints:         [],
  alertRange:        8,
  dropRange:         14,
  attackRange:       1.3,
  patrolSpeed:       1.6,
  chaseSpeed:        3.2,
  alertDuration:     0.4,
  attackCooldown:    1.4,
  waypointThreshold: 0.5,
};

// ── PatrolBehavior ────────────────────────────────────────────────────────────

export class PatrolBehavior {
  private readonly opts: PatrolBehaviorOptions;

  private _state: PatrolFSMState;
  private _waypointIdx  = 0;
  private _alertTimer   = 0;
  private _attackTimer  = 0;
  private _prevState: PatrolFSMState = 'idle';

  constructor(opts: Partial<PatrolBehaviorOptions> = {}) {
    this.opts   = { ...DEFAULTS, ...opts };
    this._state = this.opts.waypoints.length > 0 ? 'patrol' : 'idle';
  }

  /** Current FSM state (read-only). */
  get state(): PatrolFSMState { return this._state; }

  /** Force the FSM into the dead state (called from outside when HP hits 0). */
  kill(): void {
    this._state = 'dead';
  }

  /**
   * Advance the FSM and compute this frame's movement/animation output.
   *
   * @param self      Current world position of this enemy (XZ used).
   * @param player    Current world position of the player (XZ used).
   * @param dt        Frame delta time (seconds).
   */
  tick(
    self:   THREE.Vector3,
    player: THREE.Vector3,
    dt:     number,
  ): PatrolBehaviorOutput {
    if (this._state === 'dead') {
      return this._out('dead', 'death', 0, 0, 0, false, false);
    }

    const opts           = this.opts;
    const flatToPlayer   = new THREE.Vector2(player.x - self.x, player.z - self.z);
    const distToPlayer   = flatToPlayer.length();
    const justDetected   = false; // set below if transition happens

    // ── Timers ───────────────────────────────────────────────────────────────
    if (this._attackTimer > 0) this._attackTimer -= dt;

    // ── State transitions ─────────────────────────────────────────────────────
    const prev = this._state;
    let shouldAttack  = false;
    let detected      = false;

    switch (this._state) {
      case 'patrol':
      case 'idle':
        if (distToPlayer < opts.alertRange) {
          this._state = 'alert';
          this._alertTimer = opts.alertDuration;
          detected = true;
        }
        break;

      case 'alert':
        this._alertTimer -= dt;
        if (distToPlayer > opts.dropRange) {
          this._state = this.opts.waypoints.length > 0 ? 'patrol' : 'idle';
        } else if (this._alertTimer <= 0) {
          this._state = 'chase';
        }
        break;

      case 'chase':
        if (distToPlayer > opts.dropRange) {
          this._state = this.opts.waypoints.length > 0 ? 'patrol' : 'idle';
        } else if (distToPlayer < opts.attackRange) {
          this._state = 'attack';
        }
        break;

      case 'attack':
        if (distToPlayer > opts.attackRange * 1.35) {
          this._state = 'chase';
        } else if (this._attackTimer <= 0) {
          shouldAttack      = true;
          this._attackTimer = opts.attackCooldown;
        }
        break;
    }

    this._prevState = prev;

    // ── Movement ──────────────────────────────────────────────────────────────
    let vx = 0, vz = 0, yaw = 0;

    switch (this._state) {
      case 'patrol': {
        const wp = opts.waypoints[this._waypointIdx];
        if (wp) {
          const toWp = new THREE.Vector2(wp.x - self.x, wp.z - self.z);
          if (toWp.length() < opts.waypointThreshold) {
            this._waypointIdx = (this._waypointIdx + 1) % opts.waypoints.length;
          } else {
            const dir = toWp.normalize();
            vx = dir.x * opts.patrolSpeed;
            vz = dir.y * opts.patrolSpeed;
            yaw = Math.atan2(vx, vz);
          }
        }
        break;
      }

      case 'chase':
      case 'attack':
        if (distToPlayer > 0.05) {
          const dir = flatToPlayer.clone().normalize();
          const speed = this._state === 'chase' ? opts.chaseSpeed : 0;
          vx  = dir.x * speed;
          vz  = dir.y * speed;
          yaw = Math.atan2(dir.x, dir.y);
        }
        break;

      case 'alert':
        // Face the player while alerting
        if (distToPlayer > 0.05) {
          yaw = Math.atan2(flatToPlayer.x, flatToPlayer.y);
        }
        break;
    }

    // ── Animation target ──────────────────────────────────────────────────────
    const anim = this._resolveAnim();

    return this._out(this._state, anim, vx, vz, yaw, shouldAttack, detected);
  }

  private _resolveAnim(): EnemyAnimTarget {
    switch (this._state) {
      case 'patrol': return 'walk';
      case 'chase':  return 'run';
      case 'attack': return 'attack';
      case 'dead':   return 'death';
      default:       return 'idle';
    }
  }

  private _out(
    state: PatrolFSMState,
    anim:  EnemyAnimTarget,
    vx: number, vz: number, yaw: number,
    shouldAttack: boolean,
    justDetected: boolean,
  ): PatrolBehaviorOutput {
    return { state, animState: anim, velocity: { x: vx, z: vz }, facingYaw: yaw, shouldAttack, justDetected };
  }

  // ── Serialisation helpers (for tests) ─────────────────────────────────────

  /** Advance the FSM by a given distance-to-player without needing 3D objects. */
  tickAt(dist: number, dt = 0.016): PatrolBehaviorOutput {
    const self   = new THREE.Vector3(0, 0, 0);
    const player = new THREE.Vector3(dist, 0, 0);
    return this.tick(self, player, dt);
  }
}

// ── StationaryShootBehavior ───────────────────────────────────────────────────

/**
 * Tier-1 ranged FSM: shoot projectile on cooldown when player is in range,
 * hold position otherwise.
 *
 * Simplified version — does not implement cover/repositioning (B4 extension).
 */
export type ShootFSMState = 'idle' | 'alert' | 'aim' | 'shoot' | 'dead';

export class StationaryShootBehavior {
  private readonly alertRange:  number;
  private readonly shootRange:  number;
  private readonly dropRange:   number;
  private readonly shootCooldown: number;
  private _state: ShootFSMState = 'idle';
  private _alertTimer = 0;
  private _shootTimer = 0;

  constructor(opts: {
    alertRange?:   number;
    shootRange?:   number;
    dropRange?:    number;
    shootCooldown?: number;
  } = {}) {
    this.alertRange   = opts.alertRange   ?? 10;
    this.shootRange   = opts.shootRange   ?? 8;
    this.dropRange    = opts.dropRange    ?? 16;
    this.shootCooldown = opts.shootCooldown ?? 2.5;
  }

  get state(): ShootFSMState { return this._state; }

  kill(): void { this._state = 'dead' as ShootFSMState; }

  tick(dist: number, dt: number): {
    state: ShootFSMState;
    shouldShoot: boolean;
    animState: EnemyAnimTarget;
    justDetected: boolean;
  } {
    if (this._state === 'dead') {
      return { state: 'dead', shouldShoot: false, animState: 'death', justDetected: false };
    }

    if (this._shootTimer > 0) this._shootTimer -= dt;

    let shouldShoot = false;
    let detected    = false;

    switch (this._state) {
      case 'idle':
        if (dist < this.alertRange) { this._state = 'alert'; this._alertTimer = 0.4; detected = true; }
        break;
      case 'alert':
        this._alertTimer -= dt;
        if (dist > this.dropRange)  this._state = 'idle';
        else if (this._alertTimer <= 0) this._state = 'aim';
        break;
      case 'aim':
        if (dist > this.dropRange)  this._state = 'idle';
        else if (dist < this.shootRange && this._shootTimer <= 0) {
          shouldShoot      = true;
          this._shootTimer = this.shootCooldown;
          this._state      = 'shoot';
        }
        break;
      case 'shoot':
        // brief 'shoot' state, transition back to aim after timer
        if (this._shootTimer <= this.shootCooldown - 0.5) this._state = 'aim';
        break;
    }

    const stateStr = this._state as string;
    const animState: EnemyAnimTarget =
      stateStr === 'dead'  ? 'death' :
      stateStr === 'shoot' ? 'attack' :
      'idle';

    return { state: this._state, shouldShoot, animState, justDetected: detected };
  }
}

// ── TacticalBrute ─────────────────────────────────────────────────────────────

/**
 * B4: Tier-2 melee FSM with special ability, retreat-to-heal, and repositioning.
 *
 * States:
 *   idle      → chase when player within alertRange
 *   chase     → close distance at bruteSpeed
 *   attack    → melee strike on cooldown; fires special at specialCooldown
 *   special   → special ability (stomp/charge), short animation window
 *   retreat   → back away when HP ≤ retreatHpFrac; heals slowly; returns to chase
 *   dead
 *
 * Usage:
 *   const brute = new TacticalBrute({ alertRange: 10, specialCooldown: 25 });
 *   // in enemy update():
 *   const out = brute.tick(selfPos, playerPos, currentHp, maxHp, dt);
 *   if (out.shouldAttack)  doMeleeAttack(out.specialActive ? 'stomp' : 'normal');
 *   move(out.velocity.x, out.velocity.z);
 */

export type BruteFSMState = 'idle' | 'chase' | 'attack' | 'special' | 'retreat' | 'dead';

export interface TacticalBruteOutput {
  state:         BruteFSMState;
  animState:     EnemyAnimTarget;
  velocity:      { x: number; z: number };
  facingYaw:     number;
  shouldAttack:  boolean;
  /** True this frame when the special ability fires (stomp / charge). */
  specialActive: boolean;
  justDetected:  boolean;
}

export interface TacticalBruteOptions {
  alertRange:      number;  // detect range
  attackRange:     number;  // melee engagement range
  dropRange:       number;  // give up chase
  chaseSpeed:      number;  // WU/s
  retreatSpeed:    number;  // WU/s away from player
  attackCooldown:  number;  // seconds between normal attacks
  specialCooldown: number;  // seconds between special ability uses
  specialDuration: number;  // seconds special state lasts
  retreatHpFrac:   number;  // retreat when HP below this fraction (0–1)
  healRate:        number;  // HP/s recovered during retreat
}

const BRUTE_DEFAULTS: TacticalBruteOptions = {
  alertRange:      10,
  attackRange:     1.8,
  dropRange:       18,
  chaseSpeed:      2.8,
  retreatSpeed:    2.0,
  attackCooldown:  1.8,
  specialCooldown: 25,
  specialDuration: 1.2,
  retreatHpFrac:   0.2,
  healRate:        2,    // 2 HP/s during retreat
};

export class TacticalBrute {
  private readonly o: TacticalBruteOptions;
  private _state:        BruteFSMState = 'idle';
  private _attackTimer:  number = 0;
  private _specialTimer: number = 0;
  private _specialCd:    number = 0;
  private _retreatTimer: number = 0;

  constructor(opts: Partial<TacticalBruteOptions> = {}) {
    this.o = { ...BRUTE_DEFAULTS, ...opts };
  }

  get state(): BruteFSMState { return this._state; }

  kill(): void { this._state = 'dead'; }

  /**
   * Tick the FSM.
   * @param self       Enemy world position
   * @param player     Player world position
   * @param currentHp  Current HP (used for retreat threshold)
   * @param maxHp      Max HP (used for retreat threshold)
   * @param dt         Frame delta
   * @returns          Movement + action output for this frame
   */
  tick(
    self:      { x: number; z: number },
    player:    { x: number; z: number },
    currentHp: number,
    maxHp:     number,
    dt:        number,
  ): TacticalBruteOutput {
    if (this._state === 'dead') {
      return this._out('dead', 'death', 0, 0, 0, false, false, false);
    }

    const o = this.o;
    const dx = player.x - self.x;
    const dz = player.z - self.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const hpFrac = maxHp > 0 ? currentHp / maxHp : 1;

    // Tick cooldowns
    if (this._attackTimer  > 0) this._attackTimer  -= dt;
    if (this._specialCd    > 0) this._specialCd    -= dt;
    if (this._specialTimer > 0) this._specialTimer -= dt;
    if (this._retreatTimer > 0) this._retreatTimer -= dt;

    let shouldAttack = false;
    let specialActive = false;
    let detected = false;

    switch (this._state) {
      case 'idle':
        if (dist < o.alertRange) { this._state = 'chase'; detected = true; }
        break;

      case 'chase':
        if (dist > o.dropRange) {
          this._state = 'idle';
        } else if (hpFrac <= o.retreatHpFrac) {
          this._state = 'retreat'; this._retreatTimer = 3.0;
        } else if (dist < o.attackRange) {
          this._state = 'attack';
        }
        break;

      case 'attack':
        if (dist > o.attackRange * 1.4) {
          this._state = 'chase';
          break;
        }
        if (hpFrac <= o.retreatHpFrac) {
          this._state = 'retreat'; this._retreatTimer = 3.0;
          break;
        }
        // Fire special if off cooldown
        if (this._specialCd <= 0) {
          this._state        = 'special';
          this._specialTimer = o.specialDuration;
          this._specialCd    = o.specialCooldown;
          break;
        }
        // Normal attack
        if (this._attackTimer <= 0) {
          shouldAttack      = true;
          this._attackTimer = o.attackCooldown;
        }
        break;

      case 'special':
        specialActive = true;
        shouldAttack  = true;  // special counts as an attack this frame
        if (this._specialTimer <= 0) {
          this._state = dist < o.attackRange ? 'attack' : 'chase';
        }
        break;

      case 'retreat':
        // Heal during retreat
        if (this._retreatTimer <= 0 || hpFrac > o.retreatHpFrac + 0.05) {
          this._state = 'chase';
        }
        break;
    }

    // ── Movement ──────────────────────────────────────────────────────────────
    let vx = 0, vz = 0, yaw = 0;

    if (dist > 0.05) {
      const ndx = dx / dist;
      const ndz = dz / dist;
      yaw = Math.atan2(ndx, ndz);

      if (this._state === 'chase' || this._state === 'attack') {
        vx = ndx * o.chaseSpeed;
        vz = ndz * o.chaseSpeed;
        if (this._state === 'attack') { vx = 0; vz = 0; }  // hold position while attacking
      } else if (this._state === 'retreat') {
        // Move away from player
        vx = -ndx * o.retreatSpeed;
        vz = -ndz * o.retreatSpeed;
        yaw = Math.atan2(-ndx, -ndz);
      }
    }

    const anim = this._resolveAnim(specialActive);
    return this._out(this._state, anim, vx, vz, yaw, shouldAttack, specialActive, detected);
  }

  private _resolveAnim(specialActive: boolean): EnemyAnimTarget {
    switch (this._state) {
      case 'chase':   return 'run';
      case 'attack':  return specialActive ? 'attack' : 'attack';
      case 'special': return 'attack';
      case 'retreat': return 'walk';
      case 'dead':    return 'death';
      default:        return 'idle';
    }
  }

  private _out(
    state: BruteFSMState, anim: EnemyAnimTarget,
    vx: number, vz: number, yaw: number,
    shouldAttack: boolean, specialActive: boolean, justDetected: boolean,
  ): TacticalBruteOutput {
    return { state, animState: anim, velocity: { x: vx, z: vz }, facingYaw: yaw,
      shouldAttack, specialActive, justDetected };
  }
}

