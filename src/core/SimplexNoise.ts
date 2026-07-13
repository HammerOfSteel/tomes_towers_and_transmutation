// ── Seeded 2D Simplex Noise ───────────────────────────────────────────────────
//
//  Classic Stefan Gustavson simplex noise, adapted to use our mulberry32 PRNG
//  for a fully deterministic, seed-based permutation table.
//
//  Public domain.

import { mulberry32 } from './prng';

// ── Constants ─────────────────────────────────────────────────────────────────

const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

// 12 unit-length 2D gradient directions
const GRAD: readonly [number, number][] = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1],  [0, -1],
  [1, 1], [-1, 1], [0, -1], [1, -1],
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a deterministic 2D noise function from a seed.
 * Returns values approximately in **[-1, 1]**.
 *
 * @example
 * const noise = createNoise2D(42);
 * const h = noise(x * 0.02, z * 0.02); // terrain height
 */
export function createNoise2D(seed: number): (x: number, y: number) => number {
  const rand = mulberry32(seed);

  // Build a randomly-shuffled permutation table (Fisher-Yates)
  const p = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  // Double-buffer so we can index with [i + perm[j]] without modular wrap
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  return function noise(x: number, y: number): number {
    // Skew input space to determine which simplex cell we're in
    const s  = (x + y) * F2;
    const i  = Math.floor(x + s);
    const j  = Math.floor(y + s);
    const t  = (i + j) * G2;

    // Distances from cell origin (un-skewed)
    const x0 = x - (i - t);
    const y0 = y - (j - t);

    // Determine which simplex triangle we're in
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    // Offsets for corners 1 and 2
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    // Gradient indices
    const ii  = i & 255;
    const jj  = j & 255;
    const gi0 = perm[ii     + perm[jj    ]] % 12;
    const gi1 = perm[ii + i1 + perm[jj + j1]] % 12;
    const gi2 = perm[ii + 1  + perm[jj + 1 ]] % 12;

    // Contributions from each corner
    let n = 0.0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { t0 *= t0; n += t0 * t0 * (GRAD[gi0][0] * x0 + GRAD[gi0][1] * y0); }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { t1 *= t1; n += t1 * t1 * (GRAD[gi1][0] * x1 + GRAD[gi1][1] * y1); }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { t2 *= t2; n += t2 * t2 * (GRAD[gi2][0] * x2 + GRAD[gi2][1] * y2); }

    return 70.0 * n; // scale to approximately [-1, 1]
  };
}

/**
 * Fractal Brownian Motion — sums multiple octaves of noise for richer detail.
 * Returns values approximately in **[-1, 1]**.
 *
 * @param noise   Base noise function from `createNoise2D`
 * @param octaves Number of layers (3–6 is typical for terrain)
 */
export function fbm(
  noise: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves = 4,
): number {
  let value = 0.0;
  let amplitude = 0.5;
  let frequency = 1.0;
  let maxValue = 0.0;

  for (let i = 0; i < octaves; i++) {
    value    += noise(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude  *= 0.5;
    frequency  *= 2.0;
  }

  return value / maxValue;
}
