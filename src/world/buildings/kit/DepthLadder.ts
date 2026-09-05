export const DEPTH_LADDER = {
  BUTTRESS: 0.30,
  PILASTER: 0.12,
  TRIM: 0.08,
  FRAME: 0.04,
  WALL: 0,
  RECESS: -0.06,
  REVEAL: -0.12,
  GLAZING: -0.20,
} as const

export type DepthRole = keyof typeof DEPTH_LADDER

export function depthFor(role: DepthRole): number {
  return DEPTH_LADDER[role]
}

/**
 * Assert that the supplied depths are pairwise separated by at least the threshold.
 * Accepts an array of numbers or an array of objects with a numeric `depth` property.
 */
export function assertDepthSeparated(entries: Array<number | { depth: number }>): void {
  const THRESHOLD = 0.005
  const depths = entries.map(e => typeof e === 'number' ? e : e.depth)
  for (let i = 0; i < depths.length; i++) {
    for (let j = i + 1; j < depths.length; j++) {
      const a = depths[i]
      const b = depths[j]
      if (Math.abs(a - b) < THRESHOLD) {
        throw new Error(`Depths ${a} and ${b} are too close (< ${THRESHOLD})`)
      }
    }
  }
}
