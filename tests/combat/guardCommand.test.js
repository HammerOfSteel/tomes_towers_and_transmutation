/**
 * Phase 7g — Minion Guard Command
 *
 * Tests the guard state contract using SlimeEnemy-shaped stubs.
 * SlimeEnemy cannot be directly instantiated in tests (requires Rapier),
 * so we validate the behavioral contract via mocked interfaces.
 */
import { describe, it, expect, vi } from 'vitest';
import { PartyManager } from '@/combat/PartyManager';
import * as THREE from 'three';
// ── Minimal SlimeEnemy stub ──────────────────────────────────────────────────
function makeSlimeStub(opts = {}) {
    let state = opts.isDead ? 'dead' : 'recruited';
    const stub = {
        get isDead() { return state === 'dead'; },
        get isRecruitable() { return false; },
        get isRecruited() { return state === 'recruited'; },
        get isGuarding() { return state === 'guard'; },
        recruit: vi.fn(() => { state = 'recruited'; }),
        assignGuard: vi.fn((_pos) => { state = 'guard'; }),
    };
    if (opts.isGuarding)
        state = 'guard';
    return stub;
}
// ── Guard state contract ─────────────────────────────────────────────────────
describe('Guard state contract', () => {
    it('isGuarding is false by default on a recruited slime', () => {
        const slime = makeSlimeStub();
        expect(slime.isGuarding).toBe(false);
        expect(slime.isRecruited).toBe(true);
    });
    it('assignGuard transitions state to guard', () => {
        const slime = makeSlimeStub();
        const pos = new THREE.Vector3(10, 0.9, 5);
        slime.assignGuard(pos);
        expect(slime.isGuarding).toBe(true);
        expect(slime.isRecruited).toBe(false);
    });
    it('recruit() after assignGuard returns slime to recruited state', () => {
        const slime = makeSlimeStub({ isGuarding: true });
        expect(slime.isGuarding).toBe(true);
        slime.recruit();
        expect(slime.isGuarding).toBe(false);
        expect(slime.isRecruited).toBe(true);
    });
});
// ── Party guard selector logic ────────────────────────────────────────────────
describe('Guard assignment via party members', () => {
    it('finds the first non-guarding party member', () => {
        const pm = new PartyManager(5);
        const guard1 = makeSlimeStub();
        const free1 = makeSlimeStub();
        const free2 = makeSlimeStub();
        pm.recruit(guard1);
        pm.recruit(free1);
        pm.recruit(free2);
        // Transition guard1 to guard state AFTER adding to party
        guard1.assignGuard(new THREE.Vector3(0, 0.9, 0));
        const available = pm.members.find(m => !m.isGuarding && !m.isDead);
        expect(available).toBe(free1);
    });
    it('returns undefined when all party members are guarding', () => {
        const pm = new PartyManager(5);
        const g1 = makeSlimeStub();
        const g2 = makeSlimeStub();
        pm.recruit(g1);
        pm.recruit(g2);
        // Transition both to guard after adding to party
        g1.assignGuard(new THREE.Vector3(0, 0.9, 0));
        g2.assignGuard(new THREE.Vector3(5, 0.9, 5));
        const available = pm.members.find(m => !m.isGuarding && !m.isDead);
        expect(available).toBeUndefined();
    });
    it('skips dead party members when selecting a guard', () => {
        const dead = makeSlimeStub({ isDead: true });
        const alive = makeSlimeStub();
        // PartyManager.recruit() calls .recruit() on the stub which resets dead state.
        // We test the selector logic directly against an array here.
        const members = [dead, alive];
        const available = members.find(m => !m.isGuarding && !m.isDead);
        expect(available).toBe(alive);
    });
    it('assigns the guard position when available member found', () => {
        const pm = new PartyManager(3);
        const slime = makeSlimeStub();
        pm.recruit(slime);
        const perchPos = new THREE.Vector3(8, 0.9, -3);
        const available = pm.members.find(m => !m.isGuarding && !m.isDead);
        available.assignGuard(perchPos);
        expect(slime.assignGuard).toHaveBeenCalledWith(perchPos);
        expect(slime.isGuarding).toBe(true);
    });
});
