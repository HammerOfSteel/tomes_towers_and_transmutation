import { describe, it, expect, vi } from 'vitest';
import { PartyManager } from '@/combat/PartyManager';
// ── Minimal SlimeEnemy stub for party manager tests ───────────────────────────
function makeMockSlime(dead = false) {
    const slime = {
        isDead: dead,
        isRecruitable: true,
        isRecruited: false,
        recruit: vi.fn(() => { slime.isRecruited = true; }),
    };
    return slime;
}
describe('PartyManager', () => {
    describe('recruit', () => {
        it('adds a member and calls recruit() on the enemy', () => {
            const pm = new PartyManager(5);
            const slime = makeMockSlime();
            const ok = pm.recruit(slime);
            expect(ok).toBe(true);
            expect(pm.size).toBe(1);
            expect(slime.recruit).toHaveBeenCalledOnce();
        });
        it('returns false and does not add when at max capacity', () => {
            const pm = new PartyManager(2);
            pm.recruit(makeMockSlime());
            pm.recruit(makeMockSlime());
            const overflow = makeMockSlime();
            const ok = pm.recruit(overflow);
            expect(ok).toBe(false);
            expect(pm.size).toBe(2);
            expect(overflow.recruit).not.toHaveBeenCalled();
        });
        it('isFull reflects current vs max size', () => {
            const pm = new PartyManager(3);
            expect(pm.isFull).toBe(false);
            pm.recruit(makeMockSlime());
            pm.recruit(makeMockSlime());
            pm.recruit(makeMockSlime());
            expect(pm.isFull).toBe(true);
        });
    });
    describe('dismiss', () => {
        it('removes the member at the given index', () => {
            const pm = new PartyManager(5);
            const a = makeMockSlime();
            const b = makeMockSlime();
            pm.recruit(a);
            pm.recruit(b);
            pm.dismiss(0);
            expect(pm.size).toBe(1);
            expect(pm.members[0]).toBe(b);
        });
        it('silently ignores out-of-range indices', () => {
            const pm = new PartyManager(5);
            pm.recruit(makeMockSlime());
            expect(() => pm.dismiss(-1)).not.toThrow();
            expect(() => pm.dismiss(99)).not.toThrow();
            expect(pm.size).toBe(1);
        });
    });
    describe('pruneDead', () => {
        it('removes dead members', () => {
            const pm = new PartyManager(5);
            const live = makeMockSlime(false);
            const dead = makeMockSlime(true);
            pm.recruit(live);
            pm.recruit(dead);
            pm.pruneDead();
            expect(pm.size).toBe(1);
            expect(pm.members[0]).toBe(live);
        });
        it('does nothing when all members are alive', () => {
            const pm = new PartyManager(5);
            pm.recruit(makeMockSlime(false));
            pm.recruit(makeMockSlime(false));
            pm.pruneDead();
            expect(pm.size).toBe(2);
        });
    });
    describe('members (read-only view)', () => {
        it('is the same reference length as internal array', () => {
            const pm = new PartyManager(5);
            pm.recruit(makeMockSlime());
            pm.recruit(makeMockSlime());
            expect(pm.members.length).toBe(pm.size);
        });
    });
});
