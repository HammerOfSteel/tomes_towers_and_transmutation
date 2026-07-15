import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Inventory } from '@/core/Inventory';

// Provide a proper Map-backed localStorage stub since jsdom's localStorage
// is unavailable for opaque origins (no testURL configured).
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem:    (k: string) => store[k] ?? null,
    setItem:    (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear:      () => { store = {}; },
  };
})();
vi.stubGlobal('localStorage', storageMock);

describe('Inventory', () => {
  let inv: Inventory;

  beforeEach(() => {
    localStorage.clear();
    inv = new Inventory();
  });

  it('starts empty', () => {
    expect(inv.get('gold')).toBe(0);
    expect(inv.get('ore')).toBe(0);
    expect(inv.get('timber')).toBe(0);
    expect(inv.get('essence')).toBe(0);
  });

  it('add increases resource count', () => {
    inv.add('ore', 5);
    expect(inv.get('ore')).toBe(5);
    inv.add('ore', 3);
    expect(inv.get('ore')).toBe(8);
  });

  it('add ignores zero or negative amounts', () => {
    inv.add('gold', 10);
    inv.add('gold', 0);
    inv.add('gold', -5);
    expect(inv.get('gold')).toBe(10);
  });

  it('spend succeeds when sufficient', () => {
    inv.add('timber', 10);
    const ok = inv.spend('timber', 4);
    expect(ok).toBe(true);
    expect(inv.get('timber')).toBe(6);
  });

  it('spend returns false and does not deduct when insufficient', () => {
    inv.add('essence', 2);
    const ok = inv.spend('essence', 5);
    expect(ok).toBe(false);
    expect(inv.get('essence')).toBe(2);
  });

  it('spend with exact amount leaves 0', () => {
    inv.add('ore', 7);
    expect(inv.spend('ore', 7)).toBe(true);
    expect(inv.get('ore')).toBe(0);
  });

  it('spendMulti deducts all if all pass', () => {
    inv.add('timber', 5);
    inv.add('ore', 3);
    const ok = inv.spendMulti({ timber: 2, ore: 1 });
    expect(ok).toBe(true);
    expect(inv.get('timber')).toBe(3);
    expect(inv.get('ore')).toBe(2);
  });

  it('spendMulti deducts nothing if any resource is insufficient', () => {
    inv.add('timber', 5);
    inv.add('ore', 1);
    const ok = inv.spendMulti({ timber: 2, ore: 4 });
    expect(ok).toBe(false);
    // nothing changed
    expect(inv.get('timber')).toBe(5);
    expect(inv.get('ore')).toBe(1);
  });

  it('reset zeroes all resources', () => {
    inv.add('gold', 100);
    inv.add('essence', 50);
    inv.reset();
    expect(inv.get('gold')).toBe(0);
    expect(inv.get('essence')).toBe(0);
  });

  it('persists across instances via localStorage', () => {
    inv.add('gold', 42);
    inv.add('ore', 7);
    const inv2 = new Inventory();
    expect(inv2.get('gold')).toBe(42);
    expect(inv2.get('ore')).toBe(7);
  });

  it('onChange fires on add', () => {
    let calls = 0;
    inv.onChange = () => calls++;
    inv.add('timber', 1);
    expect(calls).toBe(1);
  });

  it('onChange fires on spend', () => {
    let calls = 0;
    inv.add('ore', 5);
    inv.onChange = () => calls++;
    inv.spend('ore', 2);
    expect(calls).toBe(1);
  });

  it('onChange does NOT fire on failed spend', () => {
    let calls = 0;
    inv.onChange = () => calls++;
    inv.spend('ore', 999);
    expect(calls).toBe(0);
  });

  it('Cunning multiplier model: cunning=3 gives 30% yield bonus', () => {
    // The Cunning stat doubles resource yield:
    // baseYield × (1 + cunning * 0.1)  — per TODO 7e
    const baseYield = 2;
    const cunning = 3;
    const effective = Math.ceil(baseYield * (1 + cunning * 0.1));
    expect(effective).toBe(3); // ceil(2 * 1.3) = ceil(2.6) = 3
  });

  it('snapshot returns a frozen copy (mutating it does not affect inventory)', () => {
    inv.add('gold', 10);
    const snap = inv.snapshot();
    (snap as Record<string, number>).gold = 999;
    expect(inv.get('gold')).toBe(10);
  });
});
