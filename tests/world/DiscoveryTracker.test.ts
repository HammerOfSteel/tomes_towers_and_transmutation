/**
 * DiscoveryTracker.test.ts — cave/glade discovery persistence (CG-4/CG-5).
 */

import { describe, it, expect } from 'vitest';
import { DiscoveryTracker } from '@/world/DiscoveryTracker';

describe('DiscoveryTracker — caves/glades', () => {
  it('starts with no caves/glades discovered', () => {
    const t = new DiscoveryTracker();
    expect(t.isCaveFound(1)).toBe(false);
    expect(t.isGladeFound(1)).toBe(false);
  });

  it('marks and reports cave/glade discovery independently', () => {
    const t = new DiscoveryTracker();
    t.markCaveFound(2);
    expect(t.isCaveFound(2)).toBe(true);
    expect(t.isGladeFound(2)).toBe(false);

    t.markGladeFound(3);
    expect(t.isGladeFound(3)).toBe(true);
    expect(t.isCaveFound(3)).toBe(false);
  });

  it('round-trips caves/glades through serialize/deserialize', () => {
    const t = new DiscoveryTracker();
    t.markCaveFound(5);
    t.markGladeFound(7);
    t.markDungeonFound(9);

    const restored = DiscoveryTracker.deserialize(t.serialize());
    expect(restored.isCaveFound(5)).toBe(true);
    expect(restored.isGladeFound(7)).toBe(true);
    expect(restored.isDungeonFound(9)).toBe(true);
    expect(restored.isCaveFound(7)).toBe(false);
  });

  it('deserialize tolerates missing cv/gl keys from older saves', () => {
    const legacy = JSON.stringify({ d: [1], s: [2], cc: [] });
    const restored = DiscoveryTracker.deserialize(legacy);
    expect(restored.isDungeonFound(1)).toBe(true);
    expect(restored.isCaveFound(1)).toBe(false);
    expect(restored.isGladeFound(1)).toBe(false);
  });

  it('deserialize tolerates corrupt JSON by starting fresh', () => {
    const restored = DiscoveryTracker.deserialize('{not json');
    expect(restored.isCaveFound(1)).toBe(false);
    expect(restored.isGladeFound(1)).toBe(false);
    expect(restored.isDungeonFound(1)).toBe(false);
  });
});
