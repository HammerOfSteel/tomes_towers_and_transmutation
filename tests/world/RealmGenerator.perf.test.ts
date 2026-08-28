import { describe, it, expect } from 'vitest';
import { generateRealmData } from '@/world/RealmGenerator';

describe('generateRealmData — 512x512 performance + determinism', () => {
  it('generates a 512x512 realm in under 3 seconds', () => {
    const start = performance.now();
    const realm = generateRealmData(999, 512, 512);
    const elapsedMs = performance.now() - start;
    expect(realm.W).toBe(512);
    expect(realm.H).toBe(512);
    expect(elapsedMs).toBeLessThan(3000);
  });

  it('is fully deterministic for the same seed and size', () => {
    const a = generateRealmData(4242, 512, 512);
    const b = generateRealmData(4242, 512, 512);
    expect(a.cells[0]![0]).toEqual(b.cells[0]![0]);
    expect(a.cells[511]![511]).toEqual(b.cells[511]![511]);
    expect(a.settlements.length).toBe(b.settlements.length);
  });

  it('produces the same settlement count across resolutions for the same seed (macro-structure stable)', () => {
    const small = generateRealmData(555, 96, 72, 6);
    const large = generateRealmData(555, 512, 512, 6);
    expect(small.settlements.length).toBe(large.settlements.length);
  });
});
