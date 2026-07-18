// ── Seeded randomness (mulberry32) ───────────────────────────────────────────
//
//  Everything random in the creator flows through these helpers so the same
//  DNA seed always produces the same princess. No Math.random() elsewhere.

export type Rng = () => number;

/** Fast, high-quality-enough 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 32-bit hash of a string (FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Fresh random uint32 seed (the one place Math.random is allowed). */
export function freshSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

export function randFloat(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Mid-biased float — averages two draws so extremes are rarer (curated feel). */
export function randFloatMid(rng: Rng, min: number, max: number): number {
  return min + ((rng() + rng()) / 2) * (max - min);
}

export function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(randFloat(rng, min, max + 1));
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** Weighted pick: entries of [value, weight]. */
export function pickWeighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = rng() * total;
  for (const [v, w] of entries) {
    roll -= w;
    if (roll <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}
