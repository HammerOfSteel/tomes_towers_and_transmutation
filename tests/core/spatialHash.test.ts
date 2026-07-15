import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialHash, type HasWorldPos } from '@/core/SpatialHash';

// ── Helpers ────────────────────────────────────────────────────────────────

function ent(x: number, z: number): HasWorldPos & { worldX: number; worldZ: number; id: string } {
  return { worldX: x, worldZ: z, id: `${x},${z}` };
}

type E = ReturnType<typeof ent>;

function bruteForce(entities: E[], wx: number, wz: number, r: number): E[] {
  const r2 = r * r;
  return entities.filter(e => {
    const dx = e.worldX - wx;
    const dz = e.worldZ - wz;
    return dx * dx + dz * dz <= r2;
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SpatialHash', () => {
  let hash: SpatialHash<E>;

  beforeEach(() => {
    hash = new SpatialHash<E>(8);
  });

  it('rejects cellSize ≤ 0', () => {
    expect(() => new SpatialHash(0)).toThrow();
    expect(() => new SpatialHash(-1)).toThrow();
  });

  it('starts empty', () => {
    expect(hash.size).toBe(0);
    expect(hash.queryRadius(0, 0, 100)).toHaveLength(0);
  });

  it('insert increases size', () => {
    hash.insert(ent(0, 0));
    expect(hash.size).toBe(1);
    hash.insert(ent(10, 5));
    expect(hash.size).toBe(2);
  });

  it('clear removes all entities', () => {
    hash.insert(ent(0, 0));
    hash.insert(ent(5, 5));
    hash.clear();
    expect(hash.size).toBe(0);
    expect(hash.queryRadius(0, 0, 100)).toHaveLength(0);
  });

  it('queryRadius returns entity at exact distance', () => {
    const e = ent(3, 4); // distance from origin = 5
    hash.insert(e);
    expect(hash.queryRadius(0, 0, 5)).toContain(e);
  });

  it('queryRadius excludes entity just outside radius', () => {
    const e = ent(3, 4); // distance = 5
    hash.insert(e);
    // radius 4.99 just misses
    const result = hash.queryRadius(0, 0, 4.99);
    expect(result).not.toContain(e);
  });

  it('queryRadius returns all entities within radius', () => {
    const inside  = [ent(1, 0), ent(0, 2), ent(-1, -1)];
    const outside = [ent(10, 10), ent(-8, 0), ent(0, 9)];
    [...inside, ...outside].forEach(e => hash.insert(e));
    const result = hash.queryRadius(0, 0, 3);
    for (const e of inside) expect(result).toContain(e);
    for (const e of outside) expect(result).not.toContain(e);
  });

  it('matches brute-force across random layouts', () => {
    // 100 pseudo-random layouts (simple LCG)
    let seed = 42;
    const rand = () => { seed = (seed * 1664525 + 1013904223) | 0; return (seed >>> 0) / 0xffffffff; };

    for (let trial = 0; trial < 100; trial++) {
      hash.clear();
      const entities: E[] = [];
      const count = Math.floor(rand() * 20) + 5;
      for (let i = 0; i < count; i++) {
        const e = ent((rand() - 0.5) * 80, (rand() - 0.5) * 80);
        entities.push(e);
        hash.insert(e);
      }
      const qx   = (rand() - 0.5) * 60;
      const qz   = (rand() - 0.5) * 60;
      const r    = rand() * 20 + 2;
      const hashResult  = hash.queryRadius(qx, qz, r).map(e => e.id).sort();
      const bruteResult = bruteForce(entities, qx, qz, r).map(e => e.id).sort();
      expect(hashResult).toEqual(bruteResult);
    }
  });

  it('nearest returns closest entity', () => {
    hash.insert(ent(5, 0));
    hash.insert(ent(2, 0));
    hash.insert(ent(8, 0));
    const n = hash.nearest(0, 0, 10);
    expect(n?.worldX).toBe(2);
  });

  it('nearest returns null when no entity in range', () => {
    hash.insert(ent(20, 20));
    expect(hash.nearest(0, 0, 5)).toBeNull();
  });

  it('nearest respects radius boundary', () => {
    hash.insert(ent(3, 4)); // distance = 5
    expect(hash.nearest(0, 0, 4.99)).toBeNull();
    expect(hash.nearest(0, 0, 5)).not.toBeNull();
  });

  it('works with entities at negative coordinates', () => {
    const e = ent(-20, -15);
    hash.insert(e);
    expect(hash.queryRadius(-20, -15, 1)).toContain(e);
    expect(hash.queryRadius(0, 0, 1)).not.toContain(e);
  });

  it('handles many entities in the same cell', () => {
    for (let i = 0; i < 50; i++) hash.insert(ent(0.1 * i, 0.1 * i));
    expect(hash.size).toBe(50);
    const result = hash.queryRadius(2.5, 2.5, 10);
    expect(result.length).toBe(50);
  });

  it('large world coords (> 100 tiles) work without collision', () => {
    const a = ent(500, 300);
    const b = ent(-500, -300);
    hash.insert(a);
    hash.insert(b);
    expect(hash.queryRadius(500, 300, 1)).toContain(a);
    expect(hash.queryRadius(500, 300, 1)).not.toContain(b);
    expect(hash.queryRadius(-500, -300, 1)).toContain(b);
    expect(hash.queryRadius(-500, -300, 1)).not.toContain(a);
  });
});
