import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AbilitySystem, ManaPool } from '@/combat/AbilitySystem';
import * as THREE from 'three';
// ── Mock cast context ─────────────────────────────────────────────────────────
function makeMockCtx(overrides) {
    return {
        playerPos: new THREE.Vector3(0, 0, 0),
        playerGroup: new THREE.Group(),
        scene: new THREE.Scene(),
        camera: new THREE.PerspectiveCamera(),
        aimDir: new THREE.Vector3(0, 0, -1),
        progression: { mods: { meleeDamageMult: 1, spellDamageMult: 1 } },
        enemies: [],
        playerHp: { takeDamage: vi.fn(), heal: vi.fn(), hp: 80, maxHp: 100 },
        ...overrides,
    };
}
function makeAbility(id, cooldown, manaCost, castFn = vi.fn()) {
    return { id, name: id, description: '', icon: '?', cooldown, manaCost, cast: castFn };
}
// ── ManaPool tests ────────────────────────────────────────────────────────────
describe('ManaPool', () => {
    it('starts full', () => {
        const pool = new ManaPool(100, 10);
        expect(pool.current).toBe(100);
        expect(pool.max).toBe(100);
        expect(pool.fraction).toBe(1);
    });
    it('spend deducts when sufficient', () => {
        const pool = new ManaPool(100);
        expect(pool.spend(30)).toBe(true);
        expect(pool.current).toBe(70);
    });
    it('spend returns false when insufficient', () => {
        const pool = new ManaPool(10);
        expect(pool.spend(20)).toBe(false);
        expect(pool.current).toBe(10);
    });
    it('regenerates over time', () => {
        const pool = new ManaPool(100, 10);
        pool.spend(50);
        expect(pool.current).toBe(50);
        pool.tick(2.0); // 2s × 10/s = +20
        expect(pool.current).toBeCloseTo(70);
    });
    it('does not exceed max on regen', () => {
        const pool = new ManaPool(100, 50);
        pool.tick(5.0); // would be +250, capped at 100
        expect(pool.current).toBe(100);
    });
    it('refill adds up to max', () => {
        const pool = new ManaPool(100);
        pool.spend(80);
        pool.refill(200);
        expect(pool.current).toBe(100);
    });
});
// ── AbilitySystem — core ──────────────────────────────────────────────────────
describe('AbilitySystem — registration and equipping', () => {
    let sys;
    beforeEach(() => { sys = new AbilitySystem(); });
    it('getSlotInfo returns empty for unequipped slot', () => {
        const info = sys.getSlotInfo(0);
        expect(info.id).toBeNull();
        expect(info.canCast).toBe(false);
    });
    it('equip makes ability available in slot', () => {
        sys.register(makeAbility('kick', 3, 15));
        sys.equip('kick', 0);
        const info = sys.getSlotInfo(0);
        expect(info.id).toBe('kick');
        expect(info.name).toBe('kick');
    });
    it('unequip removes ability from slot', () => {
        sys.register(makeAbility('kick', 3, 15));
        sys.equip('kick', 0);
        sys.unequip(0);
        expect(sys.getSlotInfo(0).id).toBeNull();
    });
    it('getAllSlotInfos returns 4 slots', () => {
        expect(sys.getAllSlotInfos()).toHaveLength(4);
    });
});
// ── AbilitySystem — casting ───────────────────────────────────────────────────
describe('AbilitySystem — trycast', () => {
    let sys;
    let castFn;
    let ctx;
    beforeEach(() => {
        sys = new AbilitySystem();
        castFn = vi.fn();
        ctx = makeMockCtx();
        sys.register(makeAbility('bolt', 5, 30, castFn));
        sys.equip('bolt', 0);
    });
    it('returns "no_ability" for empty slot', () => {
        expect(sys.trycast(1, ctx)).toBe('no_ability');
    });
    it('casts successfully when mana available and not on cooldown', () => {
        expect(sys.trycast(0, ctx)).toBe('ok');
        expect(castFn).toHaveBeenCalledTimes(1);
        expect(castFn).toHaveBeenCalledWith(ctx);
    });
    it('deducts mana on cast', () => {
        sys.trycast(0, ctx);
        expect(sys.mana.current).toBe(70); // 100 - 30
    });
    it('returns "cooldown" immediately after cast', () => {
        sys.trycast(0, ctx);
        expect(sys.trycast(0, ctx)).toBe('cooldown');
        expect(castFn).toHaveBeenCalledTimes(1);
    });
    it('cooldown expires after tick', () => {
        sys.trycast(0, ctx);
        sys.update(5.1); // cooldown = 5s
        expect(sys.trycast(0, ctx)).toBe('ok');
        expect(castFn).toHaveBeenCalledTimes(2);
    });
    it('returns "no_mana" when mana insufficient', () => {
        sys.mana.spend(80); // leave only 20, manaCost = 30
        expect(sys.trycast(0, ctx)).toBe('no_mana');
        expect(castFn).not.toHaveBeenCalled();
    });
});
// ── AbilitySystem — slot info ─────────────────────────────────────────────────
describe('AbilitySystem — getSlotInfo', () => {
    it('canCast is false while on cooldown', () => {
        const sys = new AbilitySystem();
        sys.register(makeAbility('zap', 4, 10));
        sys.equip('zap', 2);
        sys.trycast(2, makeMockCtx());
        expect(sys.getSlotInfo(2).canCast).toBe(false);
        expect(sys.getSlotInfo(2).cdRemaining).toBeGreaterThan(0);
    });
    it('canCast is true when ready', () => {
        const sys = new AbilitySystem();
        sys.register(makeAbility('zap', 4, 10));
        sys.equip('zap', 0);
        expect(sys.getSlotInfo(0).canCast).toBe(true);
    });
    it('cdTotal reflects the ability cooldown', () => {
        const sys = new AbilitySystem();
        sys.register(makeAbility('slam', 8, 20));
        sys.equip('slam', 0);
        sys.trycast(0, makeMockCtx());
        expect(sys.getSlotInfo(0).cdTotal).toBe(8);
        expect(sys.getSlotInfo(0).cdRemaining).toBeCloseTo(8, 0);
    });
});
// ── applyCharacterAbilities integration ──────────────────────────────────────
describe('applyCharacterAbilities — species ability assignment', () => {
    it('human gets shield_bash in slot 0', async () => {
        const { AbilitySystem: AS, applyCharacterAbilities: apply } = await import('@/combat/AbilitySystem');
        const sys = new AS();
        apply(sys, 'human_warrior');
        expect(sys.getSlotInfo(0).id).toBe('shield_bash');
        expect(sys.getSlotInfo(0).name).toBe('Shield Bash');
    });
    it('undead gets death_bolt in slot 0', async () => {
        const { AbilitySystem: AS, applyCharacterAbilities: apply } = await import('@/combat/AbilitySystem');
        const sys = new AS();
        apply(sys, 'skeleton_mage');
        expect(sys.getSlotInfo(0).id).toBe('death_bolt');
    });
    it('vulperia gets shadow_step in slot 0', async () => {
        const { AbilitySystem: AS, applyCharacterAbilities: apply } = await import('@/combat/AbilitySystem');
        const sys = new AS();
        apply(sys, 'fox_rogue');
        expect(sys.getSlotInfo(0).id).toBe('shadow_step');
    });
    it('slime gets acid_spit in slot 0', async () => {
        const { AbilitySystem: AS, applyCharacterAbilities: apply } = await import('@/combat/AbilitySystem');
        const sys = new AS();
        apply(sys, 'slime');
        expect(sys.getSlotInfo(0).id).toBe('acid_spit');
    });
    it('each ability has positive cooldown and manaCost', async () => {
        const { AbilitySystem: AS, applyCharacterAbilities: apply } = await import('@/combat/AbilitySystem');
        const chars = ['human_warrior', 'skeleton_mage', 'fox_rogue', 'slime'];
        for (const charId of chars) {
            const sys = new AS();
            apply(sys, charId);
            const info0 = sys.getSlotInfo(0);
            expect(info0.cdTotal, `${charId} slot 0 cooldown`).toBeGreaterThan(0);
            expect(info0.manaCost, `${charId} slot 0 mana cost`).toBeGreaterThan(0);
        }
    });
});
