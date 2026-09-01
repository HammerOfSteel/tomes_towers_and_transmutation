/**
 * GrassTrample.ts — a decaying, player-trampled-grass "trail" of recent footstep
 * "stamps", sampled by GrassField.ts's shader to flatten recently-walked-on blades.
 *
 * See docs/superpowers/specs/2026-09-01-trampled-grass-trail-design.md for the
 * original feature design, and
 * docs/superpowers/specs/2026-09-01-trample-vtf-perf-fix.md for why this is a small
 * uniform array of recent world-position "stamps" evaluated via pure ALU math in the
 * vertex shader, rather than a THREE.DataTexture sampled via texture2D() — the
 * original texture-based design caused a real, severe FPS regression on real GPU
 * hardware via vertex texture fetch (VTF), a well-known performance trap (invisible in
 * this project's headless/jsdom test environment, which has no real GPU texture-unit
 * asymmetry to reproduce it — confirmed via a direct A/B timing test that showed no
 * measurable difference, underscoring why this needed a hardware-aware fix rather than
 * more automated-test iteration).
 */

/** Number of recent footstep "stamps" tracked at once (a fixed-size ring buffer,
 *  uploaded to the grass shader as two small uniform arrays — no texture). Sized so a
 *  full buffer covers a comfortably long recent walking trail without gaps between
 *  stamps — see the perf-fix design note §3 for the exact spacing/coverage math. */
export const MAX_TRAMPLE_STAMPS = 24;

/** World-unit radius of one footstep's soft falloff. */
export const TRAMPLE_STAMP_RADIUS = 0.9;

/** Seconds for a trampled stamp's intensity to halve. ~3 half-lives (~6s) fades a
 *  footprint to ~12.5% — a "little faint trail," not a lasting scar. */
export const TRAMPLE_DECAY_HALF_LIFE_S = 2.0;

/** Minimum world-unit distance the player must move before a new stamp is placed —
 *  slightly under 2 * TRAMPLE_STAMP_RADIUS so consecutive stamps' soft circles always
 *  overlap (no visible gaps in the trail). */
export const TRAMPLE_MIN_STAMP_SPACING_WU = 1.2;

/** Multiplicative decay factor for a stamp of the given age. */
export function decayFactor(age: number, halfLifeS: number): number {
  return Math.pow(0.5, age / halfLifeS);
}

/** Pure distance gate — true once the candidate position is far enough from the last
 *  placed stamp to place another (mirrors this session's own shouldPlaceBrushPoint()
 *  pattern from the overworld-editor paint-mode work — same formula, different domain). */
export function shouldPlaceStamp(
  lastStampPos: { x: number; z: number } | null,
  candidate: { x: number; z: number },
  minSpacing: number,
): boolean {
  if (!lastStampPos) return true;
  const dx = candidate.x - lastStampPos.x;
  const dz = candidate.z - lastStampPos.z;
  return Math.sqrt(dx * dx + dz * dz) >= minSpacing;
}

/**
 * Pure JS mirror of the grass vertex shader's crush computation (see GrassField.ts) —
 * takes the max, across every stamp, of (soft radial falloff * age-based decay). Kept
 * as a standalone pure function so the trail math itself is fully unit-tested
 * independent of any THREE.js/shader involvement.
 */
export function computeCrushAt(
  stampPositions: Float32Array, stampAges: Float32Array, count: number,
  x: number, z: number, stampRadius: number, halfLifeS: number,
): number {
  let crush = 0;
  for (let i = 0; i < count; i++) {
    const dx = x - stampPositions[i * 2]!;
    const dz = z - stampPositions[i * 2 + 1]!;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const falloff = Math.max(0, 1 - dist / stampRadius);
    const decay = decayFactor(stampAges[i]!, halfLifeS);
    crush = Math.max(crush, falloff * decay);
  }
  return crush;
}

/** Sentinel age (seconds) for a never-yet-used ring-buffer slot — far beyond any
 *  realistic half-life, so decayFactor() underflows to ~0 and the slot contributes
 *  nothing to computeCrushAt(), with no separate "is this slot active" flag needed. */
const INACTIVE_STAMP_AGE = 1e6;

/** Shared, always-inactive fallback arrays for any GrassField constructed without a
 *  real TrampleMap (e.g. this file's own direct-construction tests) — sampling them
 *  always returns 0 crush ("never trampled"), a harmless no-op. */
export const FALLBACK_STAMP_POSITIONS = new Float32Array(MAX_TRAMPLE_STAMPS * 2);
export const FALLBACK_STAMP_AGES = new Float32Array(MAX_TRAMPLE_STAMPS).fill(INACTIVE_STAMP_AGE);

/**
 * Owns a fixed-size ring buffer of recent player footstep "stamps" (world position +
 * age) and exposes them as two small typed arrays, assigned ONCE (by reference) into
 * each GrassField's shader uniforms — GrassField never needs to refresh them per
 * frame, since TrampleMap mutates these SAME arrays in place every update() call.
 */
export class TrampleMap {
  readonly stampPositions = new Float32Array(MAX_TRAMPLE_STAMPS * 2);
  readonly stampAges = new Float32Array(MAX_TRAMPLE_STAMPS).fill(INACTIVE_STAMP_AGE);

  private _nextSlot = 0;
  private _lastStampX: number | null = null;
  private _lastStampZ: number | null = null;

  /** Call once per frame with the player's current world position. */
  update(playerX: number, playerZ: number, dt: number): void {
    for (let i = 0; i < MAX_TRAMPLE_STAMPS; i++) this.stampAges[i] += dt;

    const last = this._lastStampX === null ? null : { x: this._lastStampX, z: this._lastStampZ! };
    if (shouldPlaceStamp(last, { x: playerX, z: playerZ }, TRAMPLE_MIN_STAMP_SPACING_WU)) {
      const slot = this._nextSlot;
      this.stampPositions[slot * 2] = playerX;
      this.stampPositions[slot * 2 + 1] = playerZ;
      this.stampAges[slot] = 0;
      this._nextSlot = (slot + 1) % MAX_TRAMPLE_STAMPS;
      this._lastStampX = playerX;
      this._lastStampZ = playerZ;
    }
  }

  /** No GPU resources are owned anymore (no more THREE.DataTexture) — kept as a
   *  no-op so OverworldScene's existing dispose() call site doesn't need to change. */
  dispose(): void {}
}
