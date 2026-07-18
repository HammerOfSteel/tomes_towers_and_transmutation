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
const DEFAULTS = {
    waypoints: [],
    alertRange: 8,
    dropRange: 14,
    attackRange: 1.3,
    patrolSpeed: 1.6,
    chaseSpeed: 3.2,
    alertDuration: 0.4,
    attackCooldown: 1.4,
    waypointThreshold: 0.5,
};
// ── PatrolBehavior ────────────────────────────────────────────────────────────
export class PatrolBehavior {
    opts;
    _state;
    _waypointIdx = 0;
    _alertTimer = 0;
    _attackTimer = 0;
    _prevState = 'idle';
    constructor(opts = {}) {
        this.opts = { ...DEFAULTS, ...opts };
        this._state = this.opts.waypoints.length > 0 ? 'patrol' : 'idle';
    }
    /** Current FSM state (read-only). */
    get state() { return this._state; }
    /** Force the FSM into the dead state (called from outside when HP hits 0). */
    kill() {
        this._state = 'dead';
    }
    /**
     * Advance the FSM and compute this frame's movement/animation output.
     *
     * @param self      Current world position of this enemy (XZ used).
     * @param player    Current world position of the player (XZ used).
     * @param dt        Frame delta time (seconds).
     */
    tick(self, player, dt) {
        if (this._state === 'dead') {
            return this._out('dead', 'death', 0, 0, 0, false, false);
        }
        const opts = this.opts;
        const flatToPlayer = new THREE.Vector2(player.x - self.x, player.z - self.z);
        const distToPlayer = flatToPlayer.length();
        const justDetected = false; // set below if transition happens
        // ── Timers ───────────────────────────────────────────────────────────────
        if (this._attackTimer > 0)
            this._attackTimer -= dt;
        // ── State transitions ─────────────────────────────────────────────────────
        const prev = this._state;
        let shouldAttack = false;
        let detected = false;
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
                }
                else if (this._alertTimer <= 0) {
                    this._state = 'chase';
                }
                break;
            case 'chase':
                if (distToPlayer > opts.dropRange) {
                    this._state = this.opts.waypoints.length > 0 ? 'patrol' : 'idle';
                }
                else if (distToPlayer < opts.attackRange) {
                    this._state = 'attack';
                }
                break;
            case 'attack':
                if (distToPlayer > opts.attackRange * 1.35) {
                    this._state = 'chase';
                }
                else if (this._attackTimer <= 0) {
                    shouldAttack = true;
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
                    }
                    else {
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
                    vx = dir.x * speed;
                    vz = dir.y * speed;
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
    _resolveAnim() {
        switch (this._state) {
            case 'patrol': return 'walk';
            case 'chase': return 'run';
            case 'attack': return 'attack';
            case 'dead': return 'death';
            default: return 'idle';
        }
    }
    _out(state, anim, vx, vz, yaw, shouldAttack, justDetected) {
        return { state, animState: anim, velocity: { x: vx, z: vz }, facingYaw: yaw, shouldAttack, justDetected };
    }
    // ── Serialisation helpers (for tests) ─────────────────────────────────────
    /** Advance the FSM by a given distance-to-player without needing 3D objects. */
    tickAt(dist, dt = 0.016) {
        const self = new THREE.Vector3(0, 0, 0);
        const player = new THREE.Vector3(dist, 0, 0);
        return this.tick(self, player, dt);
    }
}
export class StationaryShootBehavior {
    alertRange;
    shootRange;
    dropRange;
    shootCooldown;
    _state = 'idle';
    _alertTimer = 0;
    _shootTimer = 0;
    constructor(opts = {}) {
        this.alertRange = opts.alertRange ?? 10;
        this.shootRange = opts.shootRange ?? 8;
        this.dropRange = opts.dropRange ?? 16;
        this.shootCooldown = opts.shootCooldown ?? 2.5;
    }
    get state() { return this._state; }
    kill() { this._state = 'dead'; }
    tick(dist, dt) {
        if (this._state === 'dead') {
            return { state: 'dead', shouldShoot: false, animState: 'death', justDetected: false };
        }
        if (this._shootTimer > 0)
            this._shootTimer -= dt;
        let shouldShoot = false;
        let detected = false;
        switch (this._state) {
            case 'idle':
                if (dist < this.alertRange) {
                    this._state = 'alert';
                    this._alertTimer = 0.4;
                    detected = true;
                }
                break;
            case 'alert':
                this._alertTimer -= dt;
                if (dist > this.dropRange)
                    this._state = 'idle';
                else if (this._alertTimer <= 0)
                    this._state = 'aim';
                break;
            case 'aim':
                if (dist > this.dropRange)
                    this._state = 'idle';
                else if (dist < this.shootRange && this._shootTimer <= 0) {
                    shouldShoot = true;
                    this._shootTimer = this.shootCooldown;
                    this._state = 'shoot';
                }
                break;
            case 'shoot':
                // brief 'shoot' state, transition back to aim after timer
                if (this._shootTimer <= this.shootCooldown - 0.5)
                    this._state = 'aim';
                break;
        }
        const stateStr = this._state;
        const animState = stateStr === 'dead' ? 'death' :
            stateStr === 'shoot' ? 'attack' :
                'idle';
        return { state: this._state, shouldShoot, animState, justDetected: detected };
    }
}
