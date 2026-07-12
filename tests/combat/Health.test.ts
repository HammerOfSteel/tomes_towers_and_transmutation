import { describe, it, expect, vi } from 'vitest';
import { HealthComponent } from '@/combat/Health';

describe('HealthComponent', () => {
  // ── Construction ──────────────────────────────────────────────────────────

  it('starts at full hp', () => {
    const h = new HealthComponent(10);
    expect(h.hp).toBe(10);
    expect(h.maxHp).toBe(10);
    expect(h.isDead).toBe(false);
  });

  it('throws when maxHp is zero', () => {
    expect(() => new HealthComponent(0)).toThrow(RangeError);
  });

  it('throws when maxHp is negative', () => {
    expect(() => new HealthComponent(-5)).toThrow(RangeError);
  });

  // ── Damage ────────────────────────────────────────────────────────────────

  it('reduces hp by damage amount', () => {
    const h = new HealthComponent(10);
    h.takeDamage(3);
    expect(h.hp).toBe(7);
  });

  it('returns actual damage applied', () => {
    const h = new HealthComponent(10);
    expect(h.takeDamage(4)).toBe(4);
  });

  it('clamps damage so hp does not go below 0', () => {
    const h = new HealthComponent(5);
    const applied = h.takeDamage(99);
    expect(h.hp).toBe(0);
    expect(applied).toBe(5);
  });

  it('ignores zero-damage hits', () => {
    const h = new HealthComponent(10);
    expect(h.takeDamage(0)).toBe(0);
    expect(h.hp).toBe(10);
  });

  it('ignores damage when already dead', () => {
    const h = new HealthComponent(5);
    h.takeDamage(5);
    expect(h.isDead).toBe(true);
    expect(h.takeDamage(1)).toBe(0);
  });

  // ── Death ─────────────────────────────────────────────────────────────────

  it('sets isDead when hp reaches 0', () => {
    const h = new HealthComponent(5);
    h.takeDamage(5);
    expect(h.isDead).toBe(true);
  });

  it('fires onDeath callback once', () => {
    const cb = vi.fn();
    const h = new HealthComponent(5, 0, undefined, cb);
    h.takeDamage(5);
    h.takeDamage(1); // already dead — should not fire again
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('fires onDamage with actual amount', () => {
    const cb = vi.fn();
    const h = new HealthComponent(10, 0, cb);
    h.takeDamage(3);
    expect(cb).toHaveBeenCalledWith(3);
  });

  // ── Heal ─────────────────────────────────────────────────────────────────

  it('restores hp up to maxHp', () => {
    const h = new HealthComponent(10);
    h.takeDamage(6);
    h.heal(3);
    expect(h.hp).toBe(7);
  });

  it('heal does not exceed maxHp', () => {
    const h = new HealthComponent(10);
    h.takeDamage(2);
    h.heal(50);
    expect(h.hp).toBe(10);
  });

  it('heal is ignored when dead', () => {
    const h = new HealthComponent(5);
    h.takeDamage(5);
    h.heal(10);
    expect(h.hp).toBe(0);
  });

  // ── i-frames ─────────────────────────────────────────────────────────────

  it('blocks damage during iframe window', () => {
    const h = new HealthComponent(10, 0.5);
    h.takeDamage(2);      // triggers 0.5s iframe
    const blocked = h.takeDamage(2); // should be blocked
    expect(blocked).toBe(0);
    expect(h.hp).toBe(8);
  });

  it('allows damage after iframe expires', () => {
    const h = new HealthComponent(10, 0.5);
    h.takeDamage(2);
    h.tick(0.5);           // expire i-frames exactly
    const applied = h.takeDamage(2);
    expect(applied).toBe(2);
    expect(h.hp).toBe(6);
  });

  it('tick reduces iframe timer', () => {
    const h = new HealthComponent(10, 1.0);
    h.takeDamage(1);
    expect(h.isInvulnerable).toBe(true);
    h.tick(1.0);
    expect(h.isInvulnerable).toBe(false);
  });
});
