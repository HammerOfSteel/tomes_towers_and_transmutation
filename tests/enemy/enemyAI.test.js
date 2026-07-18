import { describe, it, expect, beforeEach } from 'vitest';
import { PatrolBehavior, StationaryShootBehavior } from '@/enemy/PatrolBehavior';
import { AggroSystem, SHOUT_RADIUS } from '@/enemy/AggroSystem';
import * as THREE from 'three';
// ── PatrolBehavior FSM tests ──────────────────────────────────────────────────
describe('PatrolBehavior — state transitions', () => {
    it('starts in patrol state when waypoints are given', () => {
        const fsm = new PatrolBehavior({
            waypoints: [{ x: 3, z: 0 }, { x: -3, z: 0 }],
        });
        expect(fsm.state).toBe('patrol');
    });
    it('starts in idle state when no waypoints', () => {
        const fsm = new PatrolBehavior({ waypoints: [] });
        expect(fsm.state).toBe('idle');
    });
    it('transitions patrol → alert when player is within alertRange', () => {
        const fsm = new PatrolBehavior({
            waypoints: [{ x: 3, z: 0 }],
            alertRange: 8,
        });
        // Player at 5u (within 8u alertRange)
        const out = fsm.tickAt(5);
        expect(out.state).toBe('alert');
        expect(out.justDetected).toBe(true);
    });
    it('does NOT alert when player is beyond alertRange', () => {
        const fsm = new PatrolBehavior({ waypoints: [{ x: 3, z: 0 }], alertRange: 8 });
        const out = fsm.tickAt(10); // 10 > 8
        expect(out.state).toBe('patrol');
        expect(out.justDetected).toBe(false);
    });
    it('alert → chase after alertDuration expires', () => {
        const fsm = new PatrolBehavior({
            waypoints: [{ x: 3, z: 0 }],
            alertRange: 8,
            alertDuration: 0.2,
        });
        // Trigger alert
        fsm.tickAt(5, 0.016);
        expect(fsm.state).toBe('alert');
        // Tick long enough to expire alert timer
        for (let i = 0; i < 30; i++)
            fsm.tickAt(5, 0.016);
        expect(fsm.state).toBe('chase');
    });
    it('chase → attack when player is within attackRange', () => {
        const fsm = new PatrolBehavior({
            waypoints: [{ x: 3, z: 0 }],
            alertRange: 8,
            alertDuration: 0, // instant alert
            attackRange: 1.3,
        });
        // Trigger patrol → alert → chase (needs 2 ticks: alert, then alert expires → chase)
        fsm.tickAt(5, 0.016); // patrol → alert
        fsm.tickAt(1.0, 0.016); // alert expires → chase
        const out = fsm.tickAt(1.0, 0.016); // chase, dist < attackRange → attack
        expect(out.state).toBe('attack');
    });
    it('attack → chase when player moves away', () => {
        const fsm = new PatrolBehavior({
            waypoints: [{ x: 3, z: 0 }],
            alertRange: 8,
            alertDuration: 0,
            attackRange: 1.3,
        });
        // Get into attack state (3 ticks: patrol→alert, alert→chase, chase→attack)
        fsm.tickAt(5, 0.016);
        fsm.tickAt(0.5, 0.016);
        fsm.tickAt(0.5, 0.016);
        expect(fsm.state).toBe('attack');
        // Player moves away beyond attackRange * 1.35
        const out = fsm.tickAt(2.5, 0.016);
        expect(out.state).toBe('chase');
    });
    it('chase → patrol when player goes beyond dropRange', () => {
        const fsm = new PatrolBehavior({
            waypoints: [{ x: 3, z: 0 }],
            alertRange: 8,
            alertDuration: 0,
            dropRange: 14,
        });
        // Enter chase
        fsm.tickAt(5, 0.016);
        fsm.tickAt(5, 0.016);
        expect(fsm.state).toBe('chase');
        // Player goes beyond dropRange
        const out = fsm.tickAt(20, 0.016);
        expect(out.state).toBe('patrol');
    });
    it('kill() forces dead state', () => {
        const fsm = new PatrolBehavior({ waypoints: [{ x: 3, z: 0 }] });
        fsm.kill();
        expect(fsm.state).toBe('dead');
        const out = fsm.tickAt(1, 0.016);
        expect(out.state).toBe('dead');
        expect(out.animState).toBe('death');
    });
    it('produces correct animState per FSM state', () => {
        const fsm = new PatrolBehavior({
            waypoints: [{ x: 3, z: 0 }],
            alertRange: 8,
            alertDuration: 0,
        });
        // patrol → walk
        expect(fsm.tickAt(20).animState).toBe('walk');
        // chase → run
        fsm.tickAt(5, 0.016);
        fsm.tickAt(5, 0.016);
        expect(fsm.tickAt(5).animState).toBe('run');
        // attack → attack
        expect(fsm.tickAt(0.5).animState).toBe('attack');
    });
    it('shouldAttack fires on cooldown, not every frame', () => {
        const fsm = new PatrolBehavior({
            waypoints: [{ x: 3, z: 0 }],
            alertRange: 8,
            alertDuration: 0,
            attackRange: 2.0,
            attackCooldown: 1.0,
        });
        // Get into attack state (needs 3 ticks: patrol→alert, alert→chase, chase→attack)
        fsm.tickAt(5, 0.016);
        fsm.tickAt(0.5, 0.016);
        fsm.tickAt(0.5, 0.016);
        // First frame in attack: shouldAttack fires (timer = 0)
        const first = fsm.tickAt(0.5, 0.016);
        expect(first.shouldAttack).toBe(true);
        // Immediately after: should NOT fire (cooldown active)
        const second = fsm.tickAt(0.5, 0.016);
        expect(second.shouldAttack).toBe(false);
        // After cooldown expires: should fire again
        let fired = false;
        for (let i = 0; i < 80; i++) {
            if (fsm.tickAt(0.5, 0.016).shouldAttack) {
                fired = true;
                break;
            }
        }
        expect(fired).toBe(true);
    });
});
// ── StationaryShootBehavior tests ─────────────────────────────────────────────
describe('StationaryShootBehavior — state transitions', () => {
    it('starts idle', () => {
        const fsm = new StationaryShootBehavior();
        expect(fsm.state).toBe('idle');
    });
    it('idle → alert when player within alertRange', () => {
        const fsm = new StationaryShootBehavior({ alertRange: 10 });
        const out = fsm.tick(8, 0.016);
        expect(out.state).toBe('alert');
        expect(out.justDetected).toBe(true);
    });
    it('alert → aim after alert timer', () => {
        const fsm = new StationaryShootBehavior({ alertRange: 10 });
        fsm.tick(8, 0.016); // enter alert
        for (let i = 0; i < 40; i++)
            fsm.tick(8, 0.016);
        expect(fsm.state).toBe('aim');
    });
    it('aim → shoot when in shootRange with timer expired', () => {
        const fsm = new StationaryShootBehavior({ alertRange: 10, shootRange: 8, shootCooldown: 0.1 });
        // Run enough ticks to get through alert (≈25 frames) and into aim, then fire
        let shot = false;
        for (let i = 0; i < 60; i++) {
            if (fsm.tick(7, 0.016).shouldShoot) {
                shot = true;
                break;
            }
        }
        expect(shot).toBe(true);
    });
    it('kill sets dead state', () => {
        const fsm = new StationaryShootBehavior();
        fsm.kill();
        const out = fsm.tick(5, 0.016);
        expect(out.state).toBe('dead');
        expect(out.animState).toBe('death');
    });
});
// ── AggroSystem tests ─────────────────────────────────────────────────────────
describe('AggroSystem — shout broadcast', () => {
    let system;
    let shouted;
    // Helper: create a mock AggroListener at a given position
    function makeListener(id, x, z) {
        return {
            get worldPosition() { return new THREE.Vector3(x, 0, z); },
            onAggroShout(_shouter) { shouted.push(id); },
        };
    }
    beforeEach(() => {
        // Reset to fresh singleton state between tests
        AggroSystem._instance = null;
        system = AggroSystem.instance;
        shouted = [];
    });
    it('notifies listeners within SHOUT_RADIUS', () => {
        const a = makeListener('A', 0, 0);
        const b = makeListener('B', SHOUT_RADIUS - 1, 0); // within range
        const c = makeListener('C', SHOUT_RADIUS + 1, 0); // outside range
        system.register(a);
        system.register(b);
        system.register(c);
        system.shout(a);
        expect(shouted).toContain('B');
        expect(shouted).not.toContain('C');
        expect(shouted).not.toContain('A'); // shouter never notifies itself
    });
    it('does not notify the shouter itself', () => {
        const a = makeListener('A', 0, 0);
        system.register(a);
        system.shout(a);
        expect(shouted).toHaveLength(0);
    });
    it('clearAll removes all listeners', () => {
        const a = makeListener('A', 0, 0);
        const b = makeListener('B', 1, 0);
        system.register(a);
        system.register(b);
        system.clearAll();
        expect(system.listenerCount).toBe(0);
        system.shout(a);
        expect(shouted).toHaveLength(0);
    });
    it('rate-limits shouts from the same shouter', () => {
        const a = makeListener('A', 0, 0);
        const b = makeListener('B', 1, 0);
        system.register(a);
        system.register(b);
        system.shout(a);
        expect(shouted).toHaveLength(1);
        // Second immediate shout — rate-limited
        system.shout(a);
        expect(shouted).toHaveLength(1);
    });
    it('unregister prevents future notifications', () => {
        const a = makeListener('A', 0, 0);
        const b = makeListener('B', 1, 0);
        system.register(a);
        system.register(b);
        system.unregister(b);
        system.shout(a);
        expect(shouted).not.toContain('B');
    });
});
