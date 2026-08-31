/**
 * BrushPainting.ts — pure brush-stroke spacing logic for OverworldEditor's
 * paint tools (paint_tree / paint_rock). No DOM/THREE dependency, so it's
 * fully unit-testable independent of the canvas-event wiring that consumes
 * it. See docs/superpowers/specs/2026-08-31-overworld-editor-paint-mode-
 * design.md §3.
 */

/**
 * Decide whether a new drag sample is far enough from the last point
 * placed in the current brush stroke to place another prop there.
 * `lastPlaced === null` means this is the first point of a new stroke
 * (e.g. right after mousedown), which always places.
 */
export function shouldPlaceBrushPoint(
  lastPlaced: { x: number; z: number } | null,
  candidate: { x: number; z: number },
  minSpacing: number,
): boolean {
  if (!lastPlaced) return true;
  const dx = candidate.x - lastPlaced.x;
  const dz = candidate.z - lastPlaced.z;
  return dx * dx + dz * dz >= minSpacing * minSpacing;
}
