// ── Pseudo-random number generator ───────────────────────────────────────────
//
//  mulberry32 — fast, seed-deterministic, decent statistical quality.
//  A given seed always produces the identical sequence of numbers, making it
//  safe for world generation that must round-trip through localStorage.
//
//  Reference: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
/**
 * Create a PRNG function seeded with the given value.
 * The returned `rand()` yields floats uniformly distributed in [0, 1).
 *
 * @example
 * const rand = mulberry32(0xDEADBEEF);
 * rand(); // 0.someFloat, deterministic for this seed
 */
export function mulberry32(seed) {
    let s = seed >>> 0; // coerce to unsigned 32-bit integer
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
}
/** Random integer in [0, n). */
export function randInt(rand, n) {
    return Math.floor(rand() * n);
}
/** Pick a random element from an array. Returns `undefined` if the array is empty. */
export function randPick(rand, arr) {
    return arr.length === 0 ? undefined : arr[randInt(rand, arr.length)];
}
