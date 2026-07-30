/**
 * chaikin.ts — Chaikin corner-cutting curve smoothing.
 *
 * Extracted from `overworld-studio.ts` (used there for settlement road
 * smoothing) so `src/world/RealmGenerator.ts` can share the identical
 * implementation for river-path smoothing without duplicating it.
 */

export interface Point2 { x: number; y: number; }

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Chaikin corner-cutting — each pass replaces every edge with two points
 *  at the 25%/75% marks, rounding corners. 3 passes gives smooth curves. */
export function chaikin(pts: Point2[], passes = 3): Point2[] {
  let p = pts;
  for (let pass = 0; pass < passes; pass++) {
    const out: Point2[] = [p[0]!];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i]!, b = p[i + 1]!;
      out.push({ x: lerp(a.x, b.x, 0.25), y: lerp(a.y, b.y, 0.25) });
      out.push({ x: lerp(a.x, b.x, 0.75), y: lerp(a.y, b.y, 0.75) });
    }
    out.push(p[p.length - 1]!);
    p = out;
  }
  return p;
}
